/* ==========================================================================
   Roster API: every number that is a limit, in one place, plus the two small
   pieces of machinery that enforce them inside the Worker.

   The DATABASE enforces the real rate limits per key (so a direct call cannot
   walk around them). What lives here is the cheap per-IP brake in front of it
   and the mail limits, which only the Worker can apply because the Worker is
   what sends the mail.

   Pure and loadable by plain node: no `cloudflare:workers`, no globals read at
   import time.
   ========================================================================== */

export const MAX_BODY_BYTES = 16 * 1024;

/* Per IP. Fixed window; the window key carries its own start so an old counter
   can never leak into a new window. signup and click apply to public keys only
   (a secret key is a server, many callers share its address). badkey counts the
   attempts that carry no key, a malformed key or a key the database does not
   know, and is checked BEFORE the database is asked: 60 per 10 minutes per
   address, then 429 instead of one more database call per guess. */
export const IP_LIMITS = Object.freeze({
  signup: Object.freeze({ max: 6, windowSec: 600 }),
  click: Object.freeze({ max: 30, windowSec: 600 }),
  badkey: Object.freeze({ max: 60, windowSec: 600 }),
});

/* Mail caps (addendum 2). The database counts what was SENT or is pending in
   roster_mail_log and hands the counters over in every claim item; the Worker
   decides. Participant mails go to an address a stranger typed into a form.
   Admin mails go to the business's notify list, which a stranger can also make
   happen (a signup, a linked account), so they are capped too, and one cap sits
   over everything the business sends. */
export const MAIL_LIMITS = Object.freeze({
  perRecipientPerDay: 3,           // participant mails, per address, 24 h
  perBusinessPerDay: 200,          // participant mails, per business, 24 h
  adminPerRecipientPerDay: 20,     // admin mails, per address, 24 h
  adminPerBusinessPerHour: 30,     // admin mails, per business, 60 min
  businessAllPerDay: 400,          // every mail of the business, 24 h
});

/* Outbox batch. Time budgets are for STARTING work: the API path lives inside
   ctx.waitUntil (30 s after the response), the cron path has more room. An
   item that is claimed but not started simply comes back after its lock
   expires, nothing is lost. */
export const OUTBOX = Object.freeze({
  batch: 20,
  concurrency: 8,
  apiDeadlineMs: 27_000,
  cronDeadlineMs: 55_000,
  webhookTimeoutMs: 10_000,
  mailTimeoutMs: 10_000,
});

/* --- per-IP limiter -------------------------------------------------------- */

/* A counter store: get(key) -> number, put(key, number, ttlSeconds). Two
   implementations: the Workers cache (per colo, shared by isolates in it) and a
   plain Map (tests, and any runtime without a cache). Neither is atomic and
   neither has to be: this is a brake, the database holds the hard line. */
export function memoryStore(maxEntries = 5000) {
  const map = new Map();
  return {
    async get(key) {
      const hit = map.get(key);
      if (!hit) return 0;
      if (hit.exp <= Date.now()) { map.delete(key); return 0; }
      return hit.n;
    },
    async put(key, n, ttlSec) {
      if (map.size >= maxEntries) {
        const t = Date.now();
        for (const [k, v] of map) if (v.exp <= t) map.delete(k);
        if (map.size >= maxEntries) map.clear();
      }
      map.set(key, { n, exp: Date.now() + ttlSec * 1000 });
    },
  };
}

export function cacheStore(cache) {
  const req = (key) => new Request(`https://ratelimit.floa.internal/roster/${key}`);
  return {
    async get(key) {
      const hit = await cache.match(req(key));
      if (!hit) return 0;
      const n = Number.parseInt(await hit.text(), 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    async put(key, n, ttlSec) {
      await cache.put(req(key), new Response(String(n), { headers: { "cache-control": `max-age=${Math.max(1, ttlSec)}` } }));
    },
  };
}

/* Several stores as one: a counter is the highest any of them holds, and a new
   count is written to all. The Workers cache is shared across isolates in a
   colo but is a silent no-op on a workers.dev address, and a Map is per isolate
   but always works, so the two together are a brake on either. Neither is the
   hard limit, the database is. */
export function layeredStore(...stores) {
  return {
    async get(key) {
      let n = 0;
      for (const store of stores) {
        try { n = Math.max(n, await store.get(key)); } catch { /* a broken layer counts as zero */ }
      }
      return n;
    },
    async put(key, n, ttlSec) {
      await Promise.all(stores.map((store) => Promise.resolve(store.put(key, n, ttlSec)).catch(() => {})));
    },
  };
}

export function createIpLimiter({ store, now = Date.now, limits = IP_LIMITS }) {
  const slot = (bucket, ipHash) => {
    const rule = limits[bucket];
    const nowSec = Math.floor(now() / 1000);
    const start = nowSec - (nowSec % rule.windowSec);
    return { rule, resetIn: Math.max(1, start + rule.windowSec - nowSec), key: `${bucket}/${ipHash}/${start}` };
  };
  return {
    /* Is the budget already spent? Counts nothing.
       -> { ok: true } | { ok: false, retryAfter: seconds } */
    async peek(bucket, ipHash) {
      if (!limits[bucket]) return { ok: true };
      const { rule, resetIn, key } = slot(bucket, ipHash);
      try {
        return (await store.get(key)) >= rule.max ? { ok: false, retryAfter: resetIn } : { ok: true };
      } catch {
        return { ok: true };
      }
    },

    /* Count one. -> { ok: true } | { ok: false, retryAfter: seconds } (not ok once this one is over the max) */
    async hit(bucket, ipHash) {
      if (!limits[bucket]) return { ok: true };
      const { rule, resetIn, key } = slot(bucket, ipHash);
      try {
        const n = (await store.get(key)) + 1;
        if (n > rule.max) return { ok: false, retryAfter: resetIn };
        await store.put(key, n, resetIn);
        return { ok: true };
      } catch {
        /* a broken counter must not take the API down: the database limits too */
        return { ok: true };
      }
    },
  };
}

/* --- mail limits ----------------------------------------------------------- */

/* What this Worker has already reserved, on top of the counters the database gave at claim time (which only count
   mails already LOGGED, and a mail is logged when its event is reported).

   A mail is RESERVED before it is sent, in the same synchronous step as the check, so eight parallel lanes cannot all
   see "0 so far" and all go (the reviewer's E4: 8 mails against a limit of 3). A reservation that turns out never to
   have been a mail is released again.

   One tally lives as long as the isolate and is shared by every outbox run in it, because runs overlap (each API
   call starts one, and the cron another): without that, 24 runs claimed at the same moment each read "0 so far" and
   24 events sent 48 admin mails against a cap of 30. What a run has to add to its counters is exactly the
   reservations those counters cannot contain: the ones whose mail is still in flight, and the ones logged after the
   run began its claim. That is a logical clock, not a wall clock (the Worker's and the database's clocks are not
   compared): begin() returns the tick of the claim; logged() stamps a reservation with the tick of its report; a run
   whose claim began at tick T counts the reservations that are not yet logged or were logged after T. */
export function createMailTally() {
  const entries = new Set();
  let tick = 0;
  const KEEP_TICKS = 5000;   // a reservation logged this long ago is no run's business any more

  const view = (since = -Infinity, held = null) => {
    const live = (e, admin, business) => e.loggedAt > since && e.admin === admin && (business === undefined || e.business === business);
    const count = (pred) => { let n = 0; for (const e of entries) if (pred(e)) n++; return n; };
    return {
      /* reads (the participant ones are what recipient() and business() always meant) */
      recipient: (addr, audience = "participant", business) => count((e) => e.addr === addr && live(e, audience === "admin", business)),
      business: (id, audience = "participant") => count((e) => e.business === id && live(e, audience === "admin", id)),
      all: (id) => count((e) => e.business === id && e.loggedAt > since),

      /* take one slot; returns the function that gives it back (once) */
      reserve(businessId, addr, audience = "participant") {
        for (const e of entries) if (e.loggedAt < tick - KEEP_TICKS) entries.delete(e);
        const e = { business: businessId, addr, admin: audience === "admin", loggedAt: Infinity };
        entries.add(e);
        if (held) held.push(e);
        return () => { entries.delete(e); };
      },
    };
  };

  return {
    ...view(),
    /* a run is about to claim: the tick its counters will be measured against */
    begin: () => ++tick,
    /* the view a run (since = its begin() tick) and the reservations one item made (held) work with */
    view,
    /* the item's report has gone to the database: its mails are in the log from now on */
    logged(list) {
      const at = ++tick;
      for (const e of list) e.loggedAt = at;
    },
  };
}

const count = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

const perAddress = (map, addr) =>
  map && typeof map === "object" && !Array.isArray(map) && Object.hasOwn(map, addr) ? count(map[addr]) : 0;

/* -> { ok: true }
    | { ok: false, error: "limit_recipient" | "limit_business"                  (participant mails)
                        | "limit_admin_recipient" | "limit_admin_hour"          (admin mails)
                        | "limit_business_day"                                  (every mail)
                        | "counters_missing" }

   Reads, never writes: reserveMail is the call that sends nothing without
   having taken its place. `counters` is the work item's mail_counters:
     recipients, business_day                participant mails, last 24 h
     admin_recipients, admin_hour            admin mails, last 24 h / last 60 min
     business_day_all                        every mail of the business, last 24 h
   If the database gave no counters object at all the answer is NO, not "zero so
   far": these mails reach strangers, and a missing counter must not be a way
   around a limit. A single missing field counts as zero (the batch's own
   reservations still apply). */
export function checkMailLimits({ counters, tally, businessId, recipient, audience = "participant", limits = MAIL_LIMITS }) {
  if (!counters || typeof counters !== "object") return { ok: false, error: "counters_missing" };
  const addr = String(recipient).toLowerCase();

  if (audience === "admin") {
    if (perAddress(counters.admin_recipients, addr) + tally.recipient(addr, "admin", businessId) >= limits.adminPerRecipientPerDay) {
      return { ok: false, error: "limit_admin_recipient" };
    }
    if (count(counters.admin_hour) + tally.business(businessId, "admin") >= limits.adminPerBusinessPerHour) {
      return { ok: false, error: "limit_admin_hour" };
    }
  } else {
    if (perAddress(counters.recipients, addr) + tally.recipient(addr, "participant", businessId) >= limits.perRecipientPerDay) {
      return { ok: false, error: "limit_recipient" };
    }
    if (count(counters.business_day) + tally.business(businessId, "participant") >= limits.perBusinessPerDay) {
      return { ok: false, error: "limit_business" };
    }
  }

  /* the cap over everything; a database that does not count them all yet is read as "the participant mails at least" */
  const all = counters.business_day_all === undefined || counters.business_day_all === null
    ? count(counters.business_day) + count(counters.admin_hour)
    : count(counters.business_day_all);
  if (all + tally.all(businessId) >= limits.businessAllPerDay) return { ok: false, error: "limit_business_day" };
  return { ok: true };
}

/* Check and take the place in ONE synchronous step (no await between the two).
   -> { ok: true, release } | { ok: false, error } */
export function reserveMail({ counters, tally, businessId, recipient, audience = "participant", limits = MAIL_LIMITS }) {
  const verdict = checkMailLimits({ counters, tally, businessId, recipient, audience, limits });
  if (!verdict.ok) return verdict;
  return { ok: true, release: tally.reserve(businessId, String(recipient).toLowerCase(), audience) };
}
