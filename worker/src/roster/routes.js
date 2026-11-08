/* ==========================================================================
   /roster/v1/*: the public API of the roster product.

   A business's own site never talks to the database. It talks to this, with a
   key, and this is the only door: every call goes to a SECURITY DEFINER
   function through the service key (db.js), never to a table. The key decides
   the business and what is allowed; nothing the caller sends is trusted as an
   identity.

   The order of every request, cheapest refusal first:
     1. OPTIONS: preflight, no key, answered for every path.
     2. The service key, the database address and ROSTER_IP_SALT must be
        configured (else 503, and a log line).
     3. The route and method (404 / 405).
     4. The key's SHAPE, its kind against the route, a secret key with an
        Origin header. No database call yet. No key or a malformed one counts
        against the caller's address (IPv6: its /64): 60 per 10 minutes, then
        429. An address over that budget is not served with an unproven key
        either, so guessing keys cannot cost a database call per guess.
     5. The body: content type, 16 KB cap counted while reading, strict UTF-8,
        strict JSON, an object.
     6. The honeypot (signup): a fake success, nothing happens.
     7. Types and shapes of every field (prepare). Meaning (names, phone,
        required fields) is the database's.
     8. The per-IP brake for public signup and payment clicks.
     9. roster_api_auth: the key, the origin against that key, the real rate
        limits. Only then the action itself.
    10. The reply is rebuilt from what the database returned: a public key can
        never receive more than its shape, whatever came back.

   Errors are {"error":{"code","message"[, "field"]}} with a fixed English
   sentence per code. Database text, exception text and anything the caller sent
   never appear in a reply. Replies carry no-store: they hold tokens.

   No import of `cloudflare:workers` here, so plain node can run all of it.
   ========================================================================== */
import { createDb, RPC } from "./db.js";
import { corsHeaders, corsModeForError, preflightHeaders } from "./cors.js";
import { extractKey, hashIp, hashKey, hashToken, keyKind, TOKEN_RE, UUID_RE } from "./keys.js";
import { cacheStore, createIpLimiter, layeredStore, MAX_BODY_BYTES, memoryStore, OUTBOX } from "./limits.js";
import { processOutbox } from "./outbox.js";
import { hasHidden } from "./text.js";

export const API_PREFIX = "/roster/v1";

export const isRosterPath = (pathname) => pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);

/* --- errors ------------------------------------------------------------------ */

const STATUS = Object.freeze({
  invalid_key: 401,
  invalid_token: 401,
  wrong_key_kind: 403,
  origin_not_allowed: 403,
  secret_key_in_browser: 403,
  rate_limited: 429,
  validation: 422,
  not_found: 404,
  closed: 409,
  full: 409,
  conflict: 409,
  bad_request: 400,
  server_error: 500,
});

const MESSAGES = Object.freeze({
  invalid_key: "The API key is missing, malformed or not valid.",
  invalid_token: "The participant token is not valid or has expired.",
  wrong_key_kind: "This kind of API key is not allowed to call this endpoint.",
  origin_not_allowed: "This origin is not allowed for this API key.",
  secret_key_in_browser: "Secret API keys must never be used from a browser.",
  rate_limited: "Too many requests. Try again later.",
  validation: "A field is missing or not valid.",
  not_found: "Not found.",
  closed: "Registration is closed.",
  full: "The meeting is full.",
  conflict: "The request conflicts with the current state.",
  bad_request: "The request could not be read.",
  server_error: "Something went wrong on our side. Try again later.",
});

/* the only field names a reply may name, whoever asks for them */
const FIELDS = new Set([
  "first_name", "last_name", "phone", "email", "age", "gender", "meeting_id", "participant_id",
  "participant_token", "amount", "kind", "method", "note", "external_ref", "limit",
]);

/* --- field checks ------------------------------------------------------------ */

const LINE_CTRL = /[\u0000-\u001f\u007f\u2028\u2029]/;
const TEXT_CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const wellFormed = (s) => typeof s.isWellFormed !== "function" || s.isWellFormed();

/* a trimmed single-line string within max, or null when it is not one (not a
   string, too long, a control character, a lone surrogate that the database
   could not store, or a bidi control or zero-width character: those are looked
   for in what was SENT, before trim, because trim removes a leading or trailing
   U+FEFF and would let it through) */
function line(value, max) {
  if (typeof value !== "string" || !wellFormed(value) || hasHidden(value)) return null;
  const t = value.trim();
  return t.length <= max && !LINE_CTRL.test(t) ? t : null;
}

function text(value, max) {
  if (typeof value !== "string" || !wellFormed(value) || hasHidden(value)) return null;
  const t = value.trim();
  return t.length <= max && !TEXT_CTRL.test(t) ? t : null;
}

const absent = (v) => v === undefined || v === null || v === "";
const uuid = (v) => (typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null);

const bad = (field) => ({ ok: false, code: "validation", field });
const good = (args) => ({ ok: true, args });

/* --- per route: shape the input, nothing more ------------------------------------
   Each returns { ok: true, args } (the RPC arguments after the key and ip
   hashes) or { ok: false, code, field? }. What a value MEANS is the database's
   job; this only guarantees a type and a size. */

function prepMeetings({ query }) {
  let limit = 20;
  const raw = query.get("limit");
  if (raw !== null) {
    if (!/^\d{1,4}$/.test(raw) || Number(raw) < 1) return bad("limit");
    limit = Math.min(Number(raw), 100);
  }
  return good({ p_limit: limit });
}

const SIGNUP_TEXT = [["first_name", 100], ["last_name", 100], ["phone", 40], ["email", 320], ["gender", 20]];

function prepSignup({ body }) {
  const payload = {};
  for (const [field, max] of SIGNUP_TEXT) {
    if (absent(body[field])) continue;
    const v = line(body[field], max);
    if (v === null) return bad(field);
    if (v !== "") payload[field] = field === "gender" ? v.toLowerCase() : v;
  }
  if (!absent(body.age)) {
    const a = body.age;
    if (typeof a === "number" && Number.isInteger(a) && a >= 0 && a <= 150) payload.age = a;
    else if (typeof a === "string" && /^\d{1,3}$/.test(a.trim())) payload.age = Number(a.trim());
    else return bad("age");
  }
  if (!absent(body.meeting_id)) {
    const m = uuid(body.meeting_id);
    if (!m) return bad("meeting_id");
    payload.meeting_id = m;
  }
  return good({ p_payload: payload });
}

async function prepClick({ body }) {
  const token = typeof body.participant_token === "string" ? body.participant_token : "";
  if (!TOKEN_RE.test(token)) return { ok: false, code: "invalid_token" };
  const meeting = uuid(body.meeting_id);
  if (!meeting) return bad("meeting_id");
  return good({ p_token_hash: await hashToken(token), p_meeting: meeting });
}

function prepParticipantByPhone({ query }) {
  const raw = query.get("phone");
  const phone = raw === null ? null : line(raw, 40);
  if (!phone || !/^[0-9+\-().\s]{3,40}$/.test(phone)) return bad("phone");
  return good({ p_id: null, p_phone: phone });
}

const prepParticipantById = ({ params }) => good({ p_id: params.id, p_phone: null });

function prepRegister({ body, params }) {
  const meeting = uuid(body.meeting_id);
  return meeting ? good({ p_participant: params.id, p_meeting: meeting }) : bad("meeting_id");
}

const prepUnregister = ({ params }) => good({ p_participant: params.id, p_meeting: params.meeting });

const PAYMENT_KINDS = new Set(["payment", "deposit", "refund"]);
const MAX_AMOUNT = 1_000_000;

function prepRecordPayment({ body, headers }) {
  const participant = uuid(body.participant_id);
  if (!participant) return bad("participant_id");

  let meeting = null;
  if (!absent(body.meeting_id)) {
    meeting = uuid(body.meeting_id);
    if (!meeting) return bad("meeting_id");
  }

  const kindRaw = absent(body.kind) ? "payment" : line(body.kind, 20);
  const kind = kindRaw === null ? null : kindRaw.toLowerCase();
  if (!kind || !PAYMENT_KINDS.has(kind)) return bad("kind");
  if (kind === "payment" && !meeting) return bad("meeting_id");

  const amount = body.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return bad("amount");

  let method = "other";
  if (!absent(body.method)) {
    const m = line(body.method, 40);
    if (!m) return bad("method");
    method = m.toLowerCase();
  }

  let note = null;
  if (!absent(body.note)) {
    note = text(body.note, 500);
    if (note === null) return bad("note");
    if (note === "") note = null;
  }

  /* the idempotency key: in the body or in the header, and if both are there
     they must say the same thing */
  let ref = null;
  if (!absent(body.external_ref)) {
    ref = line(body.external_ref, 200);
    if (!ref) return bad("external_ref");
  }
  const headerRef = headers.get("idempotency-key");
  if (headerRef !== null) {
    const h = line(headerRef, 200);
    if (!h) return bad("external_ref");
    if (ref !== null && ref !== h) return bad("external_ref");
    ref = h;
  }
  if (!ref) return bad("external_ref");

  const payload = { participant_id: participant, kind, amount, method, external_ref: ref };
  if (meeting) payload.meeting_id = meeting;
  if (note) payload.note = note;
  return good({ p_payload: payload });
}

const prepPayFromCredit = prepRegister;

/* --- the routes ----------------------------------------------------------------- */

const BOTH = ["public", "secret"];

const ROUTES = [
  { name: "meetings", method: "GET", path: ["meetings"], kinds: BOTH, bucket: "read", rpc: RPC.meetings, prepare: prepMeetings },
  { name: "signup", method: "POST", path: ["signup"], body: true, kinds: BOTH, bucket: "signup", ipLimit: "signup", rpc: RPC.signup, outbox: true, hash: "ip", prepare: prepSignup },
  { name: "click", method: "POST", path: ["payments", "click"], body: true, kinds: ["public"], bucket: "click", ipLimit: "click", rpc: RPC.click, outbox: true, hash: "ip", prepare: prepClick },
  { name: "payments", method: "POST", path: ["payments"], body: true, kinds: ["secret"], bucket: "write", rpc: RPC.recordPayment, outbox: true, prepare: prepRecordPayment },
  { name: "participant_by_phone", method: "GET", path: ["participants"], kinds: ["secret"], bucket: "read", rpc: RPC.participant, prepare: prepParticipantByPhone },
  { name: "participant", method: "GET", path: ["participants", ":id"], kinds: ["secret"], bucket: "read", rpc: RPC.participant, prepare: prepParticipantById },
  { name: "register", method: "POST", path: ["participants", ":id", "registrations"], body: true, kinds: ["secret"], bucket: "write", rpc: RPC.register, outbox: true, prepare: prepRegister },
  { name: "unregister", method: "DELETE", path: ["participants", ":id", "registrations", ":meeting"], kinds: ["secret"], bucket: "write", rpc: RPC.unregister, outbox: true, prepare: prepUnregister },
  { name: "pay_from_credit", method: "POST", path: ["participants", ":id", "pay-from-credit"], body: true, kinds: ["secret"], bucket: "write", rpc: RPC.payFromCredit, outbox: true, prepare: prepPayFromCredit },
];

/* -> { params } when the path fits, else null. :id and :meeting only fit a uuid,
   so a made-up segment is a 404 and never reaches the database. */
function fit(route, segments) {
  if (route.path.length !== segments.length) return null;
  const params = {};
  for (let i = 0; i < segments.length; i++) {
    const want = route.path[i];
    if (want[0] === ":") {
      const id = uuid(segments[i]);
      if (!id) return null;
      params[want.slice(1)] = id;
    } else if (want !== segments[i]) {
      return null;
    }
  }
  return { params };
}

export function matchRoute(method, pathname) {
  const rest = pathname.slice(API_PREFIX.length);
  const segments = rest.split("/").filter(Boolean);
  const allowed = [];
  for (const route of ROUTES) {
    const hit = fit(route, segments);
    if (!hit) continue;
    if (route.method === method) return { route, params: hit.params };
    allowed.push(route.method);
  }
  return allowed.length ? { allow: [...new Set(allowed)] } : null;
}

/* --- body ------------------------------------------------------------------------ */

/* -> { ok: true, value } | { ok: false, message }. The size is counted while
   reading, so a body that lies about its length (or has none declared) is cut
   off at the limit, not buffered. */
export async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const type = request.headers.get("content-type") || "";
  if (!/^application\/json\s*(;|$)/i.test(type)) return { ok: false, message: "Content-Type must be application/json." };

  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) return { ok: false, message: "The request could not be read." };
    if (n > maxBytes) return { ok: false, message: "The request body is larger than 16 KB." };
  }
  if (!request.body) return { ok: false, message: "A JSON body is required." };

  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* already gone */ }
      return { ok: false, message: "The request body is larger than 16 KB." };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }

  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, message: "The body is not valid UTF-8 JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, message: "The body must be a JSON object." };
  }
  return { ok: true, value: parsed };
}

/* --- replies built from the database's answer --------------------------------------- */

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const PUBLIC_MEETING_KEYS = ["id", "date", "time", "name", "city", "place", "capacity", "spots_left", "full", "price", "price_tiers"];

function shapeMeetings(data, secret) {
  if (!isObj(data) || !Array.isArray(data.meetings)) return null;
  const name = isObj(data.business) && typeof data.business.name === "string" ? data.business.name.slice(0, 200) : "";
  const meetings = data.meetings.filter(isObj).map((m) => {
    if (secret) return m;
    const out = {};
    for (const k of PUBLIC_MEETING_KEYS) if (Object.hasOwn(m, k)) out[k] = m[k];
    return out;
  });
  return { business: { name }, meetings };
}

function shapeSignup(data, secret) {
  if (!isObj(data) || typeof data.participant_token !== "string" || !TOKEN_RE.test(data.participant_token)) return null;
  const out = { status: "ok", registered: data.registered === true, participant_token: data.participant_token };
  if (secret) {
    if (typeof data.participant_id === "string") out.participant_id = data.participant_id;
    out.created = data.created === true;
  }
  return out;
}

/* The click is answered the same way for every valid token (addendum 2, decision 6): whatever the database says
   about HOW it went (reported, already paid, not registered...) is not passed on, so the Worker cannot be the
   place a status is reintroduced, and the reply says nothing about a participant, a registration or a payment. */
function shapeClick(data) {
  return isObj(data) ? { status: "ok" } : null;
}

function shapeSuccess(route, data, secret) {
  switch (route.name) {
    case "meetings": return shapeMeetings(data, secret);
    case "signup": return shapeSignup(data, secret);
    case "click": return shapeClick(data);
    default: return isObj(data) ? data : null;
  }
}

/* {"error":"<code>", ...} from the database -> what to tell the caller */
function fromDb(data) {
  const code = isObj(data) && typeof data.error === "string" ? data.error : "";
  if (!Object.hasOwn(STATUS, code) || code === "server_error") return { code: "server_error" };
  const out = { code };
  if (code === "validation" && typeof data.field === "string" && FIELDS.has(data.field)) out.field = data.field;
  if (code === "rate_limited") {
    const n = Number(data.retry_after);
    out.retryAfter = Number.isFinite(n) ? Math.min(3600, Math.max(1, Math.ceil(n))) : 60;
  }
  return out;
}

/* what a honeypot hit is told: shaped like a real answer, nothing behind it */
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function fakeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `pt_${Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("")}`;
}

function fakeSignup(body, secret) {
  const out = { status: "ok", registered: !absent(body.meeting_id), participant_token: fakeToken() };
  if (secret) { out.participant_id = crypto.randomUUID(); out.created = true; }
  return out;
}

/* a honeypot is "filled" by any real value; a human never sees the field */
function filled(v) {
  if (v === undefined || v === null || v === false) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

/* --- the handler ------------------------------------------------------------------ */

export function createRoster(deps = {}) {
  const getFetch = () => deps.fetch || ((...args) => globalThis.fetch(...args));
  const now = deps.now || Date.now;
  let limiter = deps.limiter || null;

  function getLimiter() {
    if (!limiter) {
      const store = deps.ipStore
        || (typeof caches !== "undefined" && caches.default
          ? layeredStore(memoryStore(), cacheStore(caches.default))
          : memoryStore());
      limiter = createIpLimiter({ store, now });
    }
    return limiter;
  }

  /* keys the database has accepted lately (by hash, for two minutes, in this isolate): a request that carries one
     is not held back by the per-address brake for bad keys, so a visitor with a real key is not locked out by
     somebody else behind the same address guessing wrong ones */
  const goodKeys = new Map();
  const isGood = (hash) => {
    const until = goodKeys.get(hash);
    if (until === undefined) return false;
    if (until < now()) { goodKeys.delete(hash); return false; }
    return true;
  };
  const markGood = (hash) => {
    if (goodKeys.size >= 500) goodKeys.delete(goodKeys.keys().next().value);
    goodKeys.set(hash, now() + 120_000);
  };

  function runOutbox(env, ctx, deadlineMs) {
    const job = processOutbox({ env, fetch: getFetch(), now, sleep: deps.sleep, deadlineMs })
      .catch((err) => { console.error("roster outbox crashed", err && err.name); });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
    return job;
  }

  async function handle(request, env, ctx) {
    const rawOrigin = request.headers.get("origin");
    const url = new URL(request.url);

    const respond = (status, body, mode = "star", extra = {}) =>
      new Response(JSON.stringify(body), {
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          ...corsHeaders(rawOrigin, mode),
          ...extra,
        },
      });

    const fail = (code, { mode = "star", field, message, status, headers } = {}) =>
      respond(status ?? STATUS[code], {
        error: { code, message: message ?? MESSAGES[code], ...(field ? { field } : {}) },
      }, mode, headers);

    /* 1. preflight: every path, no key to consult */
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: preflightHeaders() });

    /* 2. without the service key, the database's address or the address salt there is no door.
       (The salt makes every stored per-address counter a keyed hash; without it the counters would be a bare
       SHA-256 of an IPv4 address, which anybody can reverse by trying all of them.) */
    const missing = ["SUPABASE_SERVICE_KEY", "SUPABASE_URL", "ROSTER_IP_SALT"].filter((name) => !env[name]);
    if (missing.length) {
      console.error(`roster: ${missing.join(", ")} is not set on the Worker; every /roster/v1 route answers 503`);
      return fail("server_error", { status: 503 });
    }

    /* 3. route and method */
    const matched = matchRoute(request.method, url.pathname);
    if (!matched) return fail("not_found");
    if (matched.allow) {
      return fail("bad_request", { status: 405, message: "Method not allowed.", headers: { allow: `${matched.allow.join(", ")}, OPTIONS` } });
    }
    const { route, params } = matched;

    /* 4. the key, by shape, against the route, without the database. A request with no key or a malformed one
       is a bad-key attempt and is counted against its address (IPv6: its /64), 60 per 10 minutes, then 429. */
    const key = extractKey(request.headers);
    const kind = keyKind(key);
    const ipHash = await hashIp(request.headers.get("cf-connecting-ip"), env.ROSTER_IP_SALT);
    const slowDown = (verdict) => fail("rate_limited", { headers: { "retry-after": String(verdict.retryAfter) } });
    if (!kind) {
      const verdict = await getLimiter().hit("badkey", ipHash);
      return verdict.ok ? fail("invalid_key") : slowDown(verdict);
    }
    if (kind === "secret" && rawOrigin !== null) return fail("secret_key_in_browser", { mode: "none" });
    if (!route.kinds.includes(kind)) return fail("wrong_key_kind");

    /* A well-formed key the database has not vouched for lately costs one database call per guess, so an
       address that has used up its bad-key budget is not served until the window ends (a key it has recently
       been seen to use successfully is exempt). */
    const keyHash = await hashKey(key);
    if (!isGood(keyHash)) {
      const verdict = await getLimiter().peek("badkey", ipHash);
      if (!verdict.ok) return slowDown(verdict);
    }

    /* 5. the body */
    let body = {};
    if (route.body) {
      const read = await readJsonBody(request);
      if (!read.ok) return fail("bad_request", { message: read.message });
      body = read.value;
    }

    /* 6. the honeypot: believed, thanked, ignored */
    if (route.name === "signup" && filled(body.website)) {
      return respond(200, fakeSignup(body, kind === "secret"));
    }

    /* 7. types and sizes */
    const prepared = await route.prepare({ body, query: url.searchParams, params, headers: request.headers });
    if (!prepared.ok) return fail(prepared.code, { field: prepared.field });

    /* 8. the cheap per-IP brake, public keys only */
    if (route.ipLimit && kind === "public") {
      const verdict = await getLimiter().hit(route.ipLimit, ipHash);
      if (!verdict.ok) return fail("rate_limited", { headers: { "retry-after": String(verdict.retryAfter) } });
    }

    /* 9. the database: who is this, may they, from here, how often; then the act */
    const db = createDb({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY, fetch: getFetch() });

    const auth = await db.rpc(RPC.auth, {
      p_key_hash: keyHash,
      p_required_kind: route.kinds.length === 2 ? "any" : route.kinds[0],
      p_origin: rawOrigin === null ? null : rawOrigin.slice(0, 300),
      p_ip_hash: ipHash,
      p_bucket: route.bucket,
    });
    const failure = (data) => {
      const e = fromDb(data);
      const extra = e.retryAfter ? { "retry-after": String(e.retryAfter) } : undefined;
      return fail(e.code, { mode: corsModeForError(e.code), field: e.field, headers: extra });
    };
    if (!auth.ok) return fail("server_error");
    if (!isObj(auth.data) || typeof auth.data.error === "string" || auth.data.ok !== true) {
      if (isObj(auth.data) && auth.data.error === "invalid_key") await getLimiter().hit("badkey", ipHash);
      return failure(auth.data);
    }
    markGood(keyHash);
    /* a secret reply needs both the shape and the database to say secret */
    const secret = kind === "secret" && (auth.data.kind === undefined || auth.data.kind === "secret");

    const args = { p_key_hash: keyHash, ...prepared.args };
    if (route.hash === "ip") args.p_ip_hash = ipHash;
    const out = await db.rpc(route.rpc, args);
    if (!out.ok) return fail("server_error", { mode: "echo" });
    if (isObj(out.data) && typeof out.data.error === "string") {
      const e = fromDb(out.data);
      return fail(e.code, {
        mode: "echo",
        field: e.field,
        headers: e.retryAfter ? { "retry-after": String(e.retryAfter) } : undefined,
      });
    }

    /* 10. the reply is rebuilt, never forwarded */
    const shaped = shapeSuccess(route, out.data, secret);
    if (!shaped) {
      console.error("roster: unexpected answer from", route.rpc);
      return fail("server_error", { mode: "echo" });
    }
    if (route.outbox) runOutbox(env, ctx, OUTBOX.apiDeadlineMs);
    return respond(200, shaped, "echo");
  }

  return {
    handle,
    /* the cron: drain the outbox, with the longer time budget */
    scheduled: (env, ctx) => runOutbox(env, ctx, OUTBOX.cronDeadlineMs),
    processOutbox: (env, extra = {}) => processOutbox({ env, fetch: getFetch(), now, sleep: deps.sleep, ...extra }),
  };
}

/* the instance the Worker uses: the real fetch, the Workers cache for the IP brake */
const instance = createRoster();
export const handleRoster = instance.handle;
export const runRosterScheduled = instance.scheduled;
