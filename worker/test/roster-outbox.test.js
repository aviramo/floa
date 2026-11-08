import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { processOutbox } from "../src/roster/outbox.js";
import { createRoster } from "../src/roster/routes.js";
import { idempotencyKey } from "../src/roster/mail.js";
import { DB, ctxSpy, fakeNet, makeEnv, makeRoster } from "./roster-helpers.js";

const NOW = 1_800_000_000_000;
const PERSON = { id: "11111111-1111-4111-8111-111111111111", first_name: "דנה", last_name: "לוי", phone: "+972501234567", email: "dana@example.com" };
const MEETING = { id: "m1", date: "2027-01-20", time: "20:00", name: "מפגש ערב", city: "חיפה", place: "הסטודיו" };
const HOOK = "https://hooks.example.com/roster";

/* a raw work item as roster_events_claim would hand it over */
const raw = (id, type, over = {}) => ({
  event: { id, type, attempts: 0, created_at: "2027-01-10T09:00:00Z", payload: { participant: PERSON, meeting: MEETING }, ...over.event },
  business: {
    id: "b1", slug: "studio", name: "סטודיו דנה", notify_emails: ["owner@example.com"],
    settings: { webhook_url: HOOK, webhook_secret: "whsec_t", webhook_events: null, participant_mail_enabled: true,
      personal_area_enabled: true, contact_email: "hello@studio.example", sender_name: null, contact_whatsapp: null, payment_url: null, ...over.settings },
  },
  participant: PERSON,
  facts: { meeting: { future: true, price: 80, free: false }, has_payment: false, fully_paid: false, confirmation_sent: false },
  templates: {},
  mail_counters: { recipients: {}, business_day: 0 },
  ...over.top,
});

function setup({ items = [], claim, done, resend, webhook } = {}) {
  const claimed = [];
  const net = fakeNet({
    rpc: {
      roster_events_claim: claim || (() => { claimed.push(...items); return items; }),
      roster_events_done: done || (() => null),
    },
    resend,
    webhook,
  });
  return { net, run: (extra = {}) => processOutbox({ env: makeEnv(), fetch: net.fetch, now: () => NOW, sleep: async () => {}, ...extra }) };
}

const doneCalls = (net) => net.rpc("roster_events_done").map((c) => c.json);

test("claims a batch of 20, delivers, and reports every event exactly once with the documented shape", async () => {
  const { net, run } = setup({ items: [raw(1, "registration.created"), raw(2, "participant.created"), raw(3, "ping")] });
  const summary = await run();
  assert.deepEqual(summary, { claimed: 3, processed: 3, skipped: 0, reported: 3, reportFailed: 0 });

  const [claim] = net.rpc("roster_events_claim");
  assert.deepEqual(claim.json, { p_limit: 20 });
  assert.equal(claim.headers.apikey, "service-role-key-for-tests");
  assert.equal(claim.headers.authorization, "Bearer service-role-key-for-tests");

  const done = doneCalls(net);
  assert.deepEqual(done.map((d) => d.p_id).sort(), [1, 2, 3]);
  for (const d of done) {
    assert.deepEqual(Object.keys(d).sort(), ["p_id", "p_result"]);
    assert.deepEqual(Object.keys(d.p_result).sort(), ["mails", "skipped", "webhook"]);
  }

  const byId = Object.fromEntries(done.map((d) => [d.p_id, d.p_result]));
  /* registration.created: webhook + the participant mail */
  assert.deepEqual(Object.keys(byId[1].webhook).sort(), ["attempt", "duration_ms", "error", "http_status", "retry_in_seconds", "status"]);
  assert.deepEqual([byId[1].webhook.status, byId[1].webhook.http_status, byId[1].webhook.attempt, byId[1].webhook.retry_in_seconds], ["ok", 200, 1, null]);
  assert.deepEqual(Object.keys(byId[1].mails[0]).sort(), ["audience", "error", "html", "status", "subject", "template", "to"]);
  assert.deepEqual([byId[1].mails[0].template, byId[1].mails[0].to, byId[1].mails[0].status], ["registered", "dana@example.com", "sent"]);
  /* participant.created: webhook + the admin mail */
  assert.deepEqual(byId[2].mails.map((m) => [m.template, m.audience, m.to]), [["admin_signup", "admin", "owner@example.com"]]);
  /* ping: webhook only, never a mail */
  assert.equal(byId[3].webhook.status, "ok");
  assert.deepEqual(byId[3].mails, []);

  assert.equal(net.webhooks().length, 3);
  assert.equal(net.resend().length, 2);
});

test("the webhook it sends verifies against the secret in the work item", async () => {
  const { net, run } = setup({ items: [raw(5, "registration.created")] });
  await run();
  const [c] = net.webhooks();
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(c.headers["x-roster-signature"]);
  assert.equal(m[2], createHmac("sha256", "whsec_t").update(`${m[1]}.${c.raw}`).digest("hex"));
  assert.equal(c.headers["x-roster-delivery"], "5");
  assert.equal(c.json.id, "5");
  assert.equal(c.json.business.slug, "studio");
  assert.equal(c.json.data.meeting.id, "m1");
});

test("the event id may arrive as a digit string; it goes back as a number", async () => {
  const { net, run } = setup({ items: [raw("77", "ping")] });
  await run();
  assert.deepEqual(doneCalls(net).map((d) => d.p_id), [77]);
});

test("a failed webhook reports the retry delay, and the mail still goes out and is reported", async () => {
  const { net, run } = setup({ items: [raw(10, "registration.created")], webhook: () => ({ status: 500 }) });
  await run();
  const [d] = doneCalls(net);
  assert.deepEqual([d.p_result.webhook.status, d.p_result.webhook.error, d.p_result.webhook.retry_in_seconds], ["failed", "http_500", 60]);
  assert.equal(d.p_result.mails[0].status, "sent");
});

test("a retry pass delivers the webhook again and sends NO mail", async () => {
  const { net, run } = setup({ items: [raw(11, "registration.created", { event: { attempts: 1 } })] });
  await run();
  const [d] = doneCalls(net);
  assert.equal(d.p_result.webhook.attempt, 2);
  assert.deepEqual(d.p_result.mails, []);
  assert.deepEqual(d.p_result.skipped, []);
  assert.equal(net.resend().length, 0);
  assert.equal(net.webhooks().length, 1);
});

test("with mails_logged from the database, a re-claimed event (a lock that ran out counts as an attempt) still sends the mails that were never sent", async () => {
  /* attempts 1 and nothing logged: the claim was lost before anything went out */
  const lost = raw(15, "registration.created", { event: { attempts: 1 }, top: { mails_logged: [] } });
  const { net, run } = setup({ items: [lost] });
  await run();
  const [d] = doneCalls(net);
  assert.deepEqual(d.p_result.mails.map((m) => [m.template, m.to, m.status]), [["registered", "dana@example.com", "sent"]]);
  assert.equal(d.p_result.webhook.attempt, 2);
  assert.equal(net.resend().length, 1);
});

test("with mails_logged, a webhook retry makes only the mail that is not yet logged, once", async () => {
  const done = raw(16, "registration.created", { event: { attempts: 1 }, top: { mails_logged: [{ template: "registered", to: "dana@example.com", status: "sent" }] } });
  const { net, run } = setup({ items: [done] });
  await run();
  const [d] = doneCalls(net);
  assert.deepEqual(d.p_result.mails, []);
  assert.deepEqual(d.p_result.skipped, [{ template: "registered", reason: "already_logged" }]);
  assert.equal(net.resend().length, 0);
  assert.equal(net.webhooks().length, 1);
});

test("an event with nothing to deliver is still reported, so it is closed", async () => {
  const items = [raw(12, "payment.recorded", { settings: { webhook_url: null }, event: { payload: { participant: PERSON, meeting: MEETING, payment: { kind: "deposit", amount: 5 } } } })];
  const { net, run } = setup({ items });
  await run();
  assert.deepEqual(doneCalls(net), [{ p_id: 12, p_result: { webhook: null, mails: [], skipped: [] } }]);
  assert.equal(net.webhooks().length + net.resend().length, 0);
});

test("claimed twice (a crash before reporting): the same mail key and the same delivery id both times", async () => {
  const item = raw(13, "registration.created");
  const { net, run } = setup({ items: [item] });
  await run();
  await run();
  const mailKeys = net.resend().map((c) => c.headers["idempotency-key"]);
  assert.equal(mailKeys.length, 2);
  assert.equal(mailKeys[0], mailKeys[1]);
  assert.equal(mailKeys[0], await idempotencyKey("13", "registered", "dana@example.com"));
  assert.deepEqual(net.webhooks().map((c) => c.headers["x-roster-delivery"]), ["13", "13"]);
});

test("an event past its last attempt is not delivered again", async () => {
  const { net, run } = setup({ items: [raw(14, "ping", { event: { attempts: 6 } })] });
  await run();
  assert.equal(net.webhooks().length, 0);
  const [d] = doneCalls(net);
  assert.deepEqual([d.p_result.webhook.error, d.p_result.webhook.retry_in_seconds], ["max_attempts", null]);
});

test("one batch, one address: the daily limit counts what this batch already sent", async () => {
  const items = [1, 2, 3, 4, 5].map((i) => raw(100 + i, "registration.created", { settings: { webhook_url: null } }));
  const { net, run } = setup({ items });
  await run({ concurrency: 1 });
  const results = doneCalls(net).sort((a, b) => a.p_id - b.p_id).map((d) => d.p_result.mails[0].error);
  assert.deepEqual(results, [null, null, null, "limit_recipient", "limit_recipient"]);
  assert.equal(net.resend().length, 3);
});

test("overlapping runs share one tally: two runs that both read '29 an hour so far' cannot both send the 30th mail", async () => {
  const counters = { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 29, business_day_all: 29 };
  const itemA = raw(901, "participant.created", { settings: { webhook_url: null }, top: { mail_counters: counters } });
  const itemB = raw(902, "participant.created", { settings: { webhook_url: null }, top: { mail_counters: counters } });
  const batches = [[itemA], [itemB]];
  const { net, run } = setup({
    claim: () => batches.shift() || [],
    resend: async () => { await new Promise((r) => setTimeout(r, 25)); return { body: { id: "msg_1" } }; },
  });
  const [a, b] = await Promise.all([run(), run()]);
  assert.deepEqual([a.claimed, b.claimed, a.reported, b.reported], [1, 1, 1, 1]);
  const errors = doneCalls(net).map((d) => d.p_result.mails[0].error).sort();
  assert.deepEqual(errors, ["limit_admin_hour", null].sort(), "one went out, one was held back");
  assert.equal(net.resend().length, 1, "Resend was asked once");
});

test("a run that began its claim AFTER the other run's report counts nothing of it (those mails are in its counters), one that began before does", async () => {
  const counters = { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 29, business_day_all: 29 };
  const mk = (id) => raw(id, "participant.created", { settings: { webhook_url: null }, top: { mail_counters: counters } });
  /* sequential: A is fully reported before B begins; the counters B is handed are the database's (here: still 29, as if A
     had not been counted, so B sends: the tally must NOT add A's mail a second time) */
  const first = setup({ items: [mk(911)] });
  await first.run();
  const second = setup({ items: [mk(912)] });
  await second.run();
  assert.deepEqual(doneCalls(second.net).map((d) => d.p_result.mails[0].error), [null]);
});

/* objects that cannot survive JSON (a getter that throws, a Proxy) never come from a real
   database, so these two tests hand the items to the processor directly */
const directDb = (items) => {
  const reported = [];
  return {
    reported,
    async rpc(name, args) {
      if (name === "roster_events_claim") return { ok: true, status: 200, data: items };
      reported.push(args);
      return { ok: true, status: 200, data: null };
    },
  };
};

test("an unreadable item is skipped without stopping the batch", async () => {
  const hostile = { event: { id: 5, type: "registration.created", get payload() { throw new Error("boom"); } }, business: { slug: "s" } };
  const items = [null, 5, "x", {}, { event: { id: -1, type: "ping" }, business: { slug: "s" } }, { event: { id: 1, type: "BAD TYPE" }, business: { slug: "s" } }, { event: { id: 2, type: "ping" }, business: {} }, hostile, raw(20, "ping")];
  const db = directDb(items);
  const net = fakeNet();
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  let s;
  try {
    s = await processOutbox({ env: makeEnv(), db, fetch: net.fetch, now: () => NOW });
  } finally {
    console.error = orig;
  }
  assert.equal(s.claimed, 9);
  assert.equal(s.skipped, 8);
  assert.equal(s.processed, 1);
  assert.deepEqual(db.reported.map((d) => d.p_id), [20]);
});

test("an event that throws while processing is reported as an internal error, not retried forever", async () => {
  const bomb = new Proxy({}, { has: (_t, key) => key === "participant", get: () => { throw new Error("secret detail about dana@example.com"); } });
  const db = directDb([raw(30, "registration.created", { event: { payload: bomb } }), raw(31, "ping")]);
  const net = fakeNet();
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  let s;
  try {
    s = await processOutbox({ env: makeEnv(), db, fetch: net.fetch, now: () => NOW });
  } finally {
    console.error = orig;
  }
  assert.equal(s.reported, 2);
  const done = Object.fromEntries(db.reported.map((d) => [d.p_id, d.p_result]));
  assert.deepEqual(done[30], { webhook: null, mails: [], skipped: [], error: "internal" });
  assert.equal(done[31].webhook.status, "ok", "the next event is unaffected");
  assert.ok(logged.some((l) => l.includes("30")));
  assert.ok(!logged.join(" ").includes("dana@example.com"), "no participant data in logs");
});

test("reporting is retried once; a report that cannot be made is counted, never thrown", async () => {
  let calls = 0;
  let { net, run } = setup({ items: [raw(40, "ping")], done: () => (++calls === 1 ? { status: 500, body: { message: "db down" } } : null) });
  assert.equal((await run()).reported, 1);
  assert.equal(net.rpc("roster_events_done").length, 2);

  ({ net, run } = setup({ items: [raw(41, "ping")], done: () => ({ status: 500, body: {} }) }));
  const s = await run();
  assert.deepEqual([s.reported, s.reportFailed], [0, 1]);
});

test("a failing claim is harmless", async () => {
  for (const claim of [() => ({ status: 500, body: {} }), () => ({ status: 200, body: { not: "an array" } }), () => ({ status: 200, text: "{bad" })]) {
    const { net, run } = setup({ claim });
    const s = await run();
    assert.equal(s.claimed, 0);
    assert.equal(net.rpc("roster_events_done").length, 0);
  }
});

test("without the service key nothing at all is called (the cron does nothing)", async () => {
  const net = fakeNet();
  const s = await processOutbox({ env: { SUPABASE_URL: DB, RESEND_API_KEY: "k" }, fetch: net.fetch });
  assert.equal(s.claimed, 0);
  assert.equal(net.calls.length, 0);
  assert.equal((await processOutbox({ env: undefined, fetch: net.fetch })).claimed, 0);
});

test("with too little time left, items are left claimed (their lock lapses) instead of half-done", async () => {
  const { net, run } = setup({ items: [raw(50, "registration.created")] });
  const s = await run({ deadlineMs: 5000 });
  assert.deepEqual([s.claimed, s.skipped, s.processed, s.reported], [1, 1, 0, 0]);
  assert.equal(net.webhooks().length + net.resend().length, 0);
  assert.equal(net.rpc("roster_events_done").length, 0);
});

test("items are processed in parallel lanes and none is processed twice", async () => {
  const items = Array.from({ length: 15 }, (_, i) => raw(200 + i, "ping"));
  const { net, run } = setup({ items });
  const s = await run({ concurrency: 4 });
  assert.equal(s.processed, 15);
  const ids = doneCalls(net).map((d) => d.p_id).sort((a, b) => a - b);
  assert.deepEqual(ids, items.map((i) => i.event.id));
});

test("a missing RESEND_API_KEY fails the mails in the report, the webhook is unaffected", async () => {
  const net = fakeNet({ rpc: { roster_events_claim: () => [raw(60, "registration.created")], roster_events_done: () => null } });
  await processOutbox({ env: makeEnv({ RESEND_API_KEY: "" }), fetch: net.fetch, now: () => NOW });
  const [d] = doneCalls(net);
  assert.equal(d.p_result.webhook.status, "ok");
  assert.deepEqual([d.p_result.mails[0].status, d.p_result.mails[0].error], ["failed", "mail_not_configured"]);
});

test("the cron entry drains the outbox and does nothing without the service key", async () => {
  const net = fakeNet({ rpc: { roster_events_claim: () => [raw(70, "ping")], roster_events_done: () => null } });
  const roster = makeRoster(net, { now: () => NOW });
  const ctx = ctxSpy();
  await roster.scheduled(makeEnv(), ctx);
  await ctx.settle();
  assert.equal(net.rpc("roster_events_claim").length, 1);
  assert.equal(net.rpc("roster_events_done").length, 1);

  const quiet = fakeNet();
  await createRoster({ fetch: quiet.fetch }).scheduled({ SUPABASE_URL: DB }, ctxSpy());
  assert.equal(quiet.calls.length, 0);
});
