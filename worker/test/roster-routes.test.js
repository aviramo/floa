/* The real route handler, run end to end against a fake database: every RPC
   name and argument is recorded and asserted, nothing touches a network. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { sha256Hex } from "../src/roster/keys.js";
import { API_PREFIX, isRosterPath, matchRoute } from "../src/roster/routes.js";
import { PUB, SEC, TOKEN, UUID_A, UUID_B, UUID_C, DB, SERVICE_KEY, call, ctxSpy, fakeNet, makeEnv, makeRoster, req } from "./roster-helpers.js";

const IP = "203.0.113.7";

const MEETINGS_DB = {
  business: { name: "סטודיו דנה" },
  meetings: [{
    id: UUID_A, date: "2027-01-20", time: "20:00", name: "מפגש", city: "חיפה", place: "הסטודיו", capacity: 20, spots_left: 5, full: false,
    price: 80, price_tiers: { base: 80, steps: [] }, directions: "קומה 2", registered: 15, type: "ערב",
  }],
};

/* a fake database where every authenticated call is allowed unless a test says otherwise */
function world(rpc = {}, extra = {}) {
  const net = fakeNet({
    rpc: {
      roster_api_auth: () => ({ ok: true, kind: "public" }),
      roster_events_claim: () => [],
      roster_events_done: () => null,
      ...rpc,
    },
    ...extra,
  });
  return { net, roster: makeRoster(net) };
}
const secretAuth = { roster_api_auth: () => ({ ok: true, kind: "secret" }) };
const dbCalls = (net) => net.calls.filter((c) => c.host === new URL(DB).host);
const actionCalls = (net) => dbCalls(net).filter((c) => !/roster_(api_auth|events_)/.test(c.path));

/* --- plumbing -------------------------------------------------------------------------- */

test("route table: prefix, paths, methods, and uuids only where ids go", () => {
  assert.equal(API_PREFIX, "/roster/v1");
  assert.ok(isRosterPath("/roster/v1") && isRosterPath("/roster/v1/") && isRosterPath("/roster/v1/meetings"));
  assert.ok(!isRosterPath("/roster/v10/x") && !isRosterPath("/lead") && !isRosterPath("/roster") && !isRosterPath("/x/roster/v1/"));

  const name = (method, path) => matchRoute(method, path)?.route?.name;
  assert.equal(name("GET", "/roster/v1/meetings"), "meetings");
  assert.equal(name("GET", "/roster/v1/meetings/"), "meetings");
  assert.equal(name("POST", "/roster/v1/signup"), "signup");
  assert.equal(name("POST", "/roster/v1/payments/click"), "click");
  assert.equal(name("POST", "/roster/v1/payments"), "payments");
  assert.equal(name("GET", "/roster/v1/participants"), "participant_by_phone");
  assert.equal(name("GET", `/roster/v1/participants/${UUID_A}`), "participant");
  assert.equal(name("POST", `/roster/v1/participants/${UUID_A}/registrations`), "register");
  assert.equal(name("DELETE", `/roster/v1/participants/${UUID_A}/registrations/${UUID_B}`), "unregister");
  assert.equal(name("POST", `/roster/v1/participants/${UUID_A}/pay-from-credit`), "pay_from_credit");
  assert.equal(matchRoute("GET", "/roster/v1/participants/not-a-uuid"), null);
  assert.equal(matchRoute("GET", "/roster/v1/participants/1/../2"), null);
  assert.equal(matchRoute("GET", "/roster/v1/nothing"), null);
  assert.deepEqual(matchRoute("GET", "/roster/v1/signup").allow, ["POST"]);
  assert.deepEqual(matchRoute("GET", `/roster/v1/participants/${UUID_A}/registrations`).allow, ["POST"]);
});

test("unknown path is 404 not_found, wrong method is 405 with Allow, and neither calls the database", async () => {
  const { net, roster } = world();
  let r = await call(roster, req("/nope", { key: PUB }));
  assert.deepEqual([r.status, r.body.error.code], [404, "not_found"]);
  r = await call(roster, req("", { key: PUB }));
  assert.equal(r.status, 404);
  r = await call(roster, req("/participants/xyz", { key: SEC }));
  assert.equal(r.status, 404);
  r = await call(roster, req("/signup", { key: PUB }));
  assert.deepEqual([r.status, r.body.error.code, r.headers.get("allow")], [405, "bad_request", "POST, OPTIONS"]);
  r = await call(roster, req("/meetings", { key: PUB, method: "POST", json: {} }));
  assert.equal(r.status, 405);
  r = await call(roster, req("/meetings", { key: PUB, method: "PUT", json: {} }));
  assert.equal(r.status, 405);
  assert.equal(net.calls.length, 0);
});

test("without SUPABASE_SERVICE_KEY every route answers 503 server_error, with a log line, and calls nothing; preflight still works", async () => {
  const { net, roster } = world();
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.join(" "));
  try {
    for (const [method, path, json] of [["GET", "/meetings"], ["POST", "/signup", {}], ["POST", "/payments/click", {}], ["GET", `/participants/${UUID_A}`], ["POST", "/payments", {}]]) {
      const r = await call(roster, req(path, { method, key: method === "GET" && path === "/meetings" ? PUB : SEC, json }), makeEnv({ SUPABASE_SERVICE_KEY: "" }));
      assert.deepEqual([r.status, r.body.error.code], [503, "server_error"], path);
    }
    const r2 = await call(roster, req("/meetings", { key: PUB }), { SUPABASE_URL: DB });
    assert.equal(r2.status, 503);
    const pre = await roster.handle(req("/signup", { method: "OPTIONS" }), makeEnv({ SUPABASE_SERVICE_KEY: "" }), ctxSpy());
    assert.equal(pre.status, 204);
  } finally {
    console.error = orig;
  }
  assert.equal(net.calls.length, 0);
  assert.ok(logged.some((l) => l.includes("SUPABASE_SERVICE_KEY is not set")));
});

test("every reply is JSON, uncacheable, nosniff; errors have exactly {code, message}", async () => {
  const { roster } = world();
  const cases = [req("/nope", { key: PUB }), req("/meetings"), req("/meetings", { key: "junk" })];
  for (const request of cases) {
    const r = await call(roster, request);
    assert.match(r.headers.get("content-type"), /^application\/json/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Object.keys(r.body), ["error"]);
    assert.deepEqual(Object.keys(r.body.error), ["code", "message"]);
    assert.match(r.body.error.message, /^[A-Z].*\.$/);
  }
});

test("only /rest/v1/rpc/<known function> is ever requested from the database, with the service key", async () => {
  const { net, roster } = world({ roster_api_meetings: () => MEETINGS_DB, roster_api_signup: () => ({ status: "ok", registered: false, participant_token: TOKEN }) });
  await call(roster, req("/meetings", { key: PUB }));
  await call(roster, req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה", phone: "0501234567" } }));
  assert.ok(dbCalls(net).length >= 4);
  for (const c of dbCalls(net)) {
    assert.match(c.path, /^\/rest\/v1\/rpc\/roster_(api_[a-z_]+|events_(claim|done))$/);
    assert.equal(c.method, "POST");
    assert.equal(c.headers.apikey, SERVICE_KEY);
    assert.equal(c.headers.authorization, `Bearer ${SERVICE_KEY}`);
    assert.equal(c.url.split("?").length, 1, "no query string");
  }
});

/* --- keys ------------------------------------------------------------------------------------- */

test("a missing, malformed or unknown key is 401 invalid_key; malformed ones never reach the database", async () => {
  const { net, roster } = world({ roster_api_auth: () => ({ error: "invalid_key" }) });
  const bad = [undefined, "", "junk", `rk_pub_${"a".repeat(31)}`, `rk_pub_${"a".repeat(33)}`, `${PUB}x`, `rk_sec_${"a".repeat(32)}`, "x".repeat(300), "pt_" + "a".repeat(32)];
  for (const key of bad) {
    const r = await call(roster, req("/meetings", { key, headers: key === undefined ? {} : {} }));
    assert.deepEqual([r.status, r.body.error.code], [401, "invalid_key"], String(key));
  }
  assert.equal(net.calls.length, 0);

  /* well formed, but not a real key: the database says so, and the answer is the same */
  const unknown = await call(roster, req("/meetings", { key: PUB }));
  assert.deepEqual([unknown.status, unknown.body.error.code], [401, "invalid_key"]);
  assert.equal(net.rpc("roster_api_auth").length, 1);
});

test("the key can come as X-Roster-Key", async () => {
  const { net, roster } = world({ roster_api_meetings: () => MEETINGS_DB });
  const r = await call(roster, req("/meetings", { headers: { "x-roster-key": PUB } }));
  assert.equal(r.status, 200);
  assert.equal(net.rpc("roster_api_auth")[0].json.p_key_hash, await sha256Hex(PUB));
});

test("the plaintext key reaches no database call, no log and no reply; only its hash does", async () => {
  const logged = [];
  const origErr = console.error, origLog = console.log;
  console.error = (...a) => logged.push(a.join(" "));
  console.log = (...a) => logged.push(a.join(" "));
  try {
    const { net, roster } = world({ roster_api_auth: () => ({ error: "invalid_key" }), roster_api_meetings: () => ({ status: 500 }) });
    const replies = [];
    for (const key of [PUB, SEC]) {
      for (const origin of [undefined, "https://studio.example"]) replies.push(await call(roster, req("/meetings", { key, origin })));
    }
    const ok = world({ roster_api_meetings: () => MEETINGS_DB });
    replies.push(await call(ok.roster, req("/meetings", { key: PUB })));
    for (const c of [...net.calls, ...ok.net.calls]) {
      assert.ok(!c.raw?.includes(PUB) && !c.raw?.includes(SEC), "the key is in a database request body");
      assert.ok(!c.url.includes(PUB), "the key is in a URL");
      for (const [k, v] of Object.entries(c.headers)) assert.ok(!String(v).includes(PUB) && !String(v).includes(SEC), `the key is in header ${k}`);
    }
    for (const r of replies) {
      assert.ok(!r.raw.includes(PUB) && !r.raw.includes(SEC));
      for (const v of r.headers.values()) assert.ok(!v.includes(PUB) && !v.includes(SEC));
    }
  } finally {
    console.error = origErr;
    console.log = origLog;
  }
  assert.ok(!logged.join(" ").includes(PUB) && !logged.join(" ").includes(SEC) && !logged.join(" ").includes(SERVICE_KEY));
});

test("a public key on a secret route is 403 wrong_key_kind, a secret key on the click is too, neither asks the database", async () => {
  const { net, roster } = world();
  const secretRoutes = [
    ["GET", `/participants?phone=0501234567`], ["GET", `/participants/${UUID_A}`], ["POST", "/payments", {}],
    ["POST", `/participants/${UUID_A}/registrations`, { meeting_id: UUID_B }], ["DELETE", `/participants/${UUID_A}/registrations/${UUID_B}`],
    ["POST", `/participants/${UUID_A}/pay-from-credit`, { meeting_id: UUID_B }],
  ];
  for (const [method, path, json] of secretRoutes) {
    const r = await call(roster, req(path, { method, key: PUB, json }));
    assert.deepEqual([r.status, r.body.error.code], [403, "wrong_key_kind"], `${method} ${path}`);
  }
  const click = await call(roster, req("/payments/click", { method: "POST", key: SEC, json: { participant_token: TOKEN, meeting_id: UUID_A } }));
  assert.deepEqual([click.status, click.body.error.code], [403, "wrong_key_kind"]);
  assert.equal(net.calls.length, 0);
});

test("a secret key that comes with an Origin header is refused at once, and a browser cannot read the refusal", async () => {
  const { net, roster } = world();
  for (const origin of ["https://studio.example", "null", "", "http://localhost:3000"]) {
    const r = await call(roster, req("/meetings", { key: SEC, origin }));
    assert.deepEqual([r.status, r.body.error.code], [403, "secret_key_in_browser"], origin);
    assert.equal(r.headers.get("access-control-allow-origin"), null, origin);
  }
  /* even on a route it could not call anyway, and even with a bad body */
  const r = await call(roster, req("/signup", { method: "POST", key: SEC, origin: "https://x.example", body: "{bad", contentType: "text/plain" }));
  assert.equal(r.body.error.code, "secret_key_in_browser");
  assert.equal(net.calls.length, 0);
});

test("the database's auth step: what is asked, and every refusal it can give", async () => {
  const refusals = [["invalid_key", 401], ["wrong_key_kind", 403], ["origin_not_allowed", 403], ["secret_key_in_browser", 403], ["rate_limited", 429]];
  for (const [code, status] of refusals) {
    const { net, roster } = world({ roster_api_auth: () => ({ error: code, retry_after: 12 }) });
    const r = await call(roster, req("/meetings", { key: PUB, origin: "https://studio.example" }));
    assert.deepEqual([r.status, r.body.error.code], [status, code]);
    assert.equal(actionCalls(net).length, 0, "the action is not reached after a refused auth");
  }

  const { net, roster } = world({ roster_api_meetings: () => MEETINGS_DB });
  await call(roster, req("/meetings", { key: PUB, origin: "https://studio.example", ip: "198.51.100.9" }));
  const auth = net.rpc("roster_api_auth")[0].json;
  assert.deepEqual(Object.keys(auth).sort(), ["p_bucket", "p_ip_hash", "p_key_hash", "p_origin", "p_required_kind"]);
  assert.equal(auth.p_key_hash, await sha256Hex(PUB));
  assert.equal(auth.p_required_kind, "any");
  assert.equal(auth.p_origin, "https://studio.example");
  assert.equal(auth.p_bucket, "read");
  assert.match(auth.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(auth).includes("198.51.100.9"), "the address is hashed");

  const noOrigin = world({ roster_api_meetings: () => MEETINGS_DB });
  await call(noOrigin.roster, req("/meetings", { key: PUB }));
  assert.equal(noOrigin.net.rpc("roster_api_auth")[0].json.p_origin, null);
});

test("kind and bucket asked of the database, per route", async () => {
  const seen = [];
  const { roster } = world({
    roster_api_auth: (a) => { seen.push([a.p_required_kind, a.p_bucket]); return { ok: true, kind: a.p_required_kind === "public" ? "public" : "secret" }; },
    roster_api_meetings: () => MEETINGS_DB, roster_api_signup: () => ({ status: "ok", registered: false, participant_token: TOKEN }),
    roster_api_payment_click: () => ({ status: "reported" }), roster_api_participant: () => ({ participant: {} }), roster_api_register: () => ({ status: "registered" }),
    roster_api_unregister: () => ({ status: "cancelled" }), roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_C, duplicate: false }),
    roster_api_pay_from_credit: () => ({ status: "ok" }),
  });
  const pay = { participant_id: UUID_A, meeting_id: UUID_B, amount: 80, external_ref: "r1" };
  const run = (...a) => call(roster, req(...a));
  await run("/meetings", { key: SEC });
  await run("/signup", { method: "POST", key: SEC, json: { first_name: "a" } });
  await run("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A } });
  await run("/payments", { method: "POST", key: SEC, json: pay });
  await run(`/participants/${UUID_A}`, { key: SEC });
  await run(`/participants/${UUID_A}/registrations`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } });
  await run(`/participants/${UUID_A}/registrations/${UUID_B}`, { method: "DELETE", key: SEC });
  await run(`/participants/${UUID_A}/pay-from-credit`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } });
  assert.deepEqual(seen, [
    ["any", "read"], ["any", "signup"], ["public", "click"], ["secret", "write"], ["secret", "read"], ["secret", "write"], ["secret", "write"], ["secret", "write"],
  ]);
});

/* --- GET /meetings ------------------------------------------------------------------------------- */

test("GET /meetings: the call, the default limit and what a public key may see", async () => {
  const { net, roster } = world({ roster_api_meetings: () => MEETINGS_DB });
  const r = await call(roster, req("/meetings", { key: PUB, origin: "https://studio.example" }));
  assert.equal(r.status, 200);
  assert.deepEqual(net.rpc("roster_api_meetings")[0].json, { p_key_hash: await sha256Hex(PUB), p_limit: 20 });
  assert.deepEqual(r.body.business, { name: "סטודיו דנה" });
  assert.deepEqual(Object.keys(r.body.meetings[0]).sort(), ["capacity", "city", "date", "full", "id", "name", "place", "price", "price_tiers", "spots_left", "time"]);
  assert.ok(!r.raw.includes("directions") && !r.raw.includes("קומה 2"), "a public key never gets directions");
  assert.equal(r.headers.get("access-control-allow-origin"), "https://studio.example");
  assert.equal(actionCalls(net).length, 1);
});

test("GET /meetings with a secret key keeps directions, registered and type", async () => {
  const { roster } = world({ ...secretAuth, roster_api_meetings: () => MEETINGS_DB });
  const r = await call(roster, req("/meetings", { key: SEC }));
  assert.equal(r.body.meetings[0].directions, "קומה 2");
  assert.equal(r.body.meetings[0].registered, 15);
  assert.equal(r.body.meetings[0].type, "ערב");
});

test("a public key is shaped as public even if the database wrongly returned secret fields, or called the key secret", async () => {
  const { roster } = world({ roster_api_meetings: () => MEETINGS_DB });
  assert.ok(!(await call(roster, req("/meetings", { key: PUB }))).raw.includes("directions"));
  /* the shape alone is not enough for a secret reply: the database must agree */
  const { roster: r2 } = world({ roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_meetings: () => MEETINGS_DB });
  assert.ok(!(await call(r2, req("/meetings", { key: SEC }))).raw.includes("directions"));
});

test("GET /meetings?limit: 1..100, clamped above, refused when it is not a positive integer", async () => {
  const { net, roster } = world({ roster_api_meetings: () => MEETINGS_DB });
  const limit = async (q) => { const before = net.rpc("roster_api_meetings").length; const r = await call(roster, req(`/meetings${q}`, { key: PUB })); return [r.status, net.rpc("roster_api_meetings").length > before ? net.rpc("roster_api_meetings").at(-1).json.p_limit : null, r.body?.error?.field]; };
  assert.deepEqual(await limit("?limit=5"), [200, 5, undefined]);
  assert.deepEqual(await limit("?limit=100"), [200, 100, undefined]);
  assert.deepEqual(await limit("?limit=1000"), [200, 100, undefined]);
  assert.deepEqual(await limit("?limit=9999"), [200, 100, undefined]);
  for (const bad of ["?limit=0", "?limit=-1", "?limit=abc", "?limit=1.5", "?limit=", "?limit=10000", "?limit=1e2", "?limit=%20"]) {
    assert.deepEqual(await limit(bad), [422, null, "limit"], bad);
  }
});

test("GET /meetings: a malformed answer from the database is a 500, not a guess", async () => {
  for (const answer of [null, [], "x", { meetings: "no" }, { business: {} }]) {
    const { roster } = world({ roster_api_meetings: () => answer });
    const r = await call(roster, req("/meetings", { key: PUB }));
    assert.equal(r.status, 500, JSON.stringify(answer));
  }
});

/* --- POST /signup ------------------------------------------------------------------------------------ */

const SIGNUP_OK = { status: "ok", registered: true, participant_token: TOKEN, participant_id: UUID_A, created: false };
const signup = (roster, json, opts = {}) => call(roster, req("/signup", { method: "POST", key: PUB, json, ...opts }));

test("signup: the exact call, a whitelist payload, and a reply that cannot reveal who is registered", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const body = {
    first_name: " דנה ", last_name: "לוי", phone: "050-123-4567", email: "Dana@Example.com", age: 34, gender: "FEMALE", meeting_id: UUID_A.toUpperCase(),
    /* things a caller must not be able to set */
    business_id: UUID_B, participant_id: UUID_C, is_admin: true, active: false, __proto__: { admin: true }, website: "", extra: { a: 1 },
  };
  const r = await signup(roster, JSON.parse(JSON.stringify(body)), { ip: IP });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "ok", registered: true, participant_token: TOKEN }, "no participant_id, no created");

  const [c] = net.rpc("roster_api_signup");
  assert.deepEqual(Object.keys(c.json).sort(), ["p_ip_hash", "p_key_hash", "p_payload"]);
  assert.deepEqual(c.json.p_payload, { first_name: "דנה", last_name: "לוי", phone: "050-123-4567", email: "Dana@Example.com", age: 34, gender: "female", meeting_id: UUID_A });
  assert.equal(c.json.p_key_hash, await sha256Hex(PUB));
  assert.match(c.json.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.equal(net.rpc("roster_api_auth")[0].json.p_bucket, "signup");
  assert.equal(net.rpc("roster_api_auth")[0].json.p_required_kind, "any");
});

test("signup with a secret key also returns participant_id and created", async () => {
  const { roster } = world({ ...secretAuth, roster_api_signup: () => SIGNUP_OK });
  const r = await call(roster, req("/signup", { method: "POST", key: SEC, json: { first_name: "דנה", phone: "0501234567" } }));
  assert.deepEqual(r.body, { status: "ok", registered: true, participant_token: TOKEN, participant_id: UUID_A, created: false });
});

test("signup: the reply for a new person and for an existing one has the same shape", async () => {
  const shapes = [];
  for (const created of [true, false]) {
    const { roster } = world({ roster_api_signup: () => ({ ...SIGNUP_OK, created, registered: false }) });
    shapes.push(Object.keys((await signup(roster, { first_name: "דנה", phone: "0501234567" })).body));
  }
  assert.deepEqual(shapes[0], shapes[1]);
});

test("signup: a reply with a malformed token is a 500, a token is never invented", async () => {
  for (const answer of [{ ...SIGNUP_OK, participant_token: "pt_short" }, { status: "ok" }, { ...SIGNUP_OK, participant_token: 5 }]) {
    const { roster } = world({ roster_api_signup: () => answer });
    assert.equal((await signup(roster, { first_name: "דנה", phone: "0501234567" })).status, 500);
  }
});

test("signup field checks: types, sizes and characters the database could not store", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const bad = [
    [{ first_name: 5 }, "first_name"], [{ first_name: ["a"] }, "first_name"], [{ first_name: { a: 1 } }, "first_name"], [{ first_name: true }, "first_name"],
    [{ first_name: "a".repeat(101) }, "first_name"], [{ last_name: "a".repeat(101) }, "last_name"],
    [{ first_name: "a\u0000b" }, "first_name"], [{ first_name: "a\nb" }, "first_name"], [{ first_name: "a\u2028b" }, "first_name"],
    [{ first_name: "\ud800" }, "first_name"], [{ phone: 501234567 }, "phone"], [{ phone: "0".repeat(41) }, "phone"],
    [{ email: ["a@b.co"] }, "email"], [{ email: "a".repeat(321) }, "email"], [{ gender: 1 }, "gender"], [{ gender: "x".repeat(21) }, "gender"],
    [{ age: "abc" }, "age"], [{ age: 17.5 }, "age"], [{ age: -1 }, "age"], [{ age: 151 }, "age"], [{ age: "1000" }, "age"], [{ age: {} }, "age"], [{ age: true }, "age"],
    [{ meeting_id: "nope" }, "meeting_id"], [{ meeting_id: 5 }, "meeting_id"], [{ meeting_id: `${UUID_A}x` }, "meeting_id"], [{ meeting_id: [UUID_A] }, "meeting_id"],
  ];
  for (const [json, field] of bad) {
    const r = await signup(roster, json);
    assert.deepEqual([r.status, r.body.error.code, r.body.error.field], [422, "validation", field], JSON.stringify(json));
  }
  assert.equal(actionCalls(net).length, 0, "nothing invalid reaches the database");
  assert.equal(net.rpc("roster_api_auth").length, 0, "not even the auth step");

  /* absent, null and empty values are simply not sent; the database decides what is required */
  for (const json of [{}, { first_name: null, phone: "", age: null, meeting_id: "", email: undefined }]) {
    const r = await signup(roster, json);
    assert.equal(r.status, 200);
    assert.deepEqual(net.rpc("roster_api_signup").at(-1).json.p_payload, {});
  }
  const strAge = await signup(roster, { age: " 41 " });
  assert.equal(strAge.status, 200);
  assert.equal(net.rpc("roster_api_signup").at(-1).json.p_payload.age, 41);
});

test("signup: what the database refuses is passed on with its code and nothing else", async () => {
  const refuse = async (answer) => {
    const { roster } = world({ roster_api_signup: () => answer });
    return signup(roster, { first_name: "דנה", phone: "0501234567" });
  };
  let r = await refuse({ error: "closed" });
  assert.deepEqual([r.status, r.body.error.code, r.body.error.message], [409, "closed", "Registration is closed."]);
  r = await refuse({ error: "full" });
  assert.deepEqual([r.status, r.body.error.code], [409, "full"]);
  r = await refuse({ error: "validation", field: "phone" });
  assert.deepEqual([r.status, r.body.error.code, r.body.error.field], [422, "validation", "phone"]);
  r = await refuse({ error: "validation", field: "password; drop table x" });
  assert.deepEqual([r.status, r.body.error.field], [422, undefined], "a field name the Worker does not know is not echoed");
  r = await refuse({ error: "not_found" });
  assert.equal(r.status, 404);
  r = await refuse({ error: "conflict" });
  assert.equal(r.status, 409);
  r = await refuse({ error: "bad_request" });
  assert.equal(r.status, 400);
});

test("database failures are 500 server_error with a fixed sentence: no database text, no code, no stack", async () => {
  const leaks = "relation roster_participants does not exist; password=hunter2";
  const variants = [
    () => ({ status: 500, body: { message: leaks, hint: leaks, details: leaks } }),
    () => ({ status: 404, body: { message: leaks } }),
    () => ({ status: 401, body: { message: "Invalid API key" } }),
    () => ({ status: 200, text: leaks }),
    () => ({ error: "something_new", detail: leaks }),
    () => ({ error: leaks }),
    () => ({ error: "server_error", detail: leaks }),
    () => ["unexpected"],
    () => null,
  ];
  for (const answer of variants) {
    const { roster } = world({ roster_api_signup: answer });
    const orig = console.error;
    console.error = () => {};
    let r;
    try { r = await signup(roster, { first_name: "דנה", phone: "0501234567" }); } finally { console.error = orig; }
    assert.deepEqual([r.status, r.body.error.code, r.body.error.message], [500, "server_error", "Something went wrong on our side. Try again later."]);
    assert.ok(!r.raw.includes("hunter2") && !r.raw.includes("roster_") && !r.raw.includes("relation"));
  }
  /* the network itself failing, and a non-JSON answer to the auth step */
  const down = makeRoster({ fetch: async () => { throw new TypeError("connect ECONNREFUSED 10.0.0.1:443"); }, calls: [] });
  const orig = console.error;
  console.error = () => {};
  let r;
  try { r = await signup(down, { first_name: "דנה" }); } finally { console.error = orig; }
  assert.deepEqual([r.status, r.body.error.code], [500, "server_error"]);
  assert.ok(!r.raw.includes("10.0.0.1"));
});

test("rate_limited from the database: 429 with Retry-After, clamped, defaulted", async () => {
  const run = async (retry) => {
    const { roster } = world({ roster_api_auth: () => ({ error: "rate_limited", ...(retry === undefined ? {} : { retry_after: retry }) }) });
    const r = await signup(roster, { first_name: "דנה" });
    return [r.status, r.body.error.code, r.headers.get("retry-after")];
  };
  assert.deepEqual(await run(37), [429, "rate_limited", "37"]);
  assert.deepEqual(await run(37.2), [429, "rate_limited", "38"]);
  assert.deepEqual(await run(0), [429, "rate_limited", "1"]);
  assert.deepEqual(await run(999999), [429, "rate_limited", "3600"]);
  assert.deepEqual(await run(undefined), [429, "rate_limited", "60"]);
  assert.deepEqual(await run("soon"), [429, "rate_limited", "60"]);
  assert.deepEqual(await run(-5), [429, "rate_limited", "1"]);
});

test("the Worker's own per-IP brake: 6 signups per IP per 10 minutes, then 429 with Retry-After; other IPs and the secret key are unaffected", async () => {
  let t = 1_800_000_000_000;
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_signup: () => SIGNUP_OK, roster_events_claim: () => [], roster_events_done: () => null } });
  const roster = makeRoster(net, { now: () => t });
  const go = (ip, key = PUB) => call(roster, req("/signup", { method: "POST", key, json: { first_name: "דנה" }, ip }));

  for (let i = 0; i < 6; i++) assert.equal((await go(IP)).status, 200, `signup ${i + 1}`);
  const blocked = await go(IP);
  assert.deepEqual([blocked.status, blocked.body.error.code], [429, "rate_limited"]);
  const wait = Number(blocked.headers.get("retry-after"));
  assert.ok(Number.isInteger(wait) && wait >= 1 && wait <= 600, String(wait));
  assert.equal(net.rpc("roster_api_signup").length, 6, "the seventh never reached the database");

  assert.equal((await go("198.51.100.1")).status, 200, "another address");
  t += 601_000;
  assert.equal((await go(IP)).status, 200, "a new window");

  const secretNet = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "secret" }), roster_api_signup: () => SIGNUP_OK, roster_events_claim: () => [], roster_events_done: () => null } });
  const sroster = makeRoster(secretNet);
  for (let i = 0; i < 10; i++) assert.equal((await call(sroster, req("/signup", { method: "POST", key: SEC, json: { first_name: "x" }, ip: IP }))).status, 200);
});

test("the click's per-IP brake is 30 per 10 minutes", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_payment_click: () => ({ status: "reported" }), roster_events_claim: () => [], roster_events_done: () => null } });
  const roster = makeRoster(net);
  const go = () => call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A }, ip: IP }));
  for (let i = 0; i < 30; i++) assert.equal((await go()).status, 200, `click ${i + 1}`);
  const blocked = await go();
  assert.deepEqual([blocked.status, blocked.body.error.code], [429, "rate_limited"]);
  assert.ok(Number(blocked.headers.get("retry-after")) >= 1);
});

test("the honeypot: a filled `website` gets a believable success and nothing happens", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const real = await signup(roster, { first_name: "דנה", phone: "0501234567" });

  for (const website of ["http://spam.example", "x", " x ", 1, true, {}, [1], ["x"]]) {
    const fake = await signup(roster, { first_name: "בוט", phone: "0500000000", meeting_id: UUID_A, website });
    assert.equal(fake.status, 200, JSON.stringify(website));
    assert.deepEqual(Object.keys(fake.body), Object.keys(real.body));
    assert.equal(fake.body.status, "ok");
    assert.equal(fake.body.registered, true);
    assert.match(fake.body.participant_token, /^pt_[A-Za-z0-9]{32}$/);
  }
  const tokens = new Set();
  for (let i = 0; i < 5; i++) tokens.add((await signup(roster, { website: "x" })).body.participant_token);
  assert.equal(tokens.size, 5, "every fake token is different");

  assert.equal(net.rpc("roster_api_signup").length, 1, "only the real signup reached the database");
  assert.equal(net.calls.filter((c) => c.json && JSON.stringify(c.json).includes("בוט")).length, 0);

  /* an empty or whitespace-only honeypot is a normal signup */
  for (const website of ["", "   ", null, false]) {
    const before = net.rpc("roster_api_signup").length;
    assert.equal((await signup(roster, { first_name: "דנה", website })).status, 200);
    assert.equal(net.rpc("roster_api_signup").length, before + 1, JSON.stringify(website));
  }
  /* the honeypot field itself is never forwarded */
  assert.ok(!JSON.stringify(net.rpc("roster_api_signup").at(-1).json).includes("website"));

  const secret = await call(roster, req("/signup", { method: "POST", key: SEC, json: { website: "x", meeting_id: UUID_A } }));
  assert.deepEqual(Object.keys(secret.body).sort(), ["created", "participant_id", "participant_token", "registered", "status"]);
});

test("a signup that succeeds starts the outbox in the background; one that fails does not", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const ctx = ctxSpy();
  await roster.handle(req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" } }), makeEnv(), ctx);
  assert.equal(ctx.pending.length, 1);
  await ctx.settle();
  assert.equal(net.rpc("roster_events_claim").length, 1);

  const refused = world({ roster_api_signup: () => ({ error: "closed" }) });
  const ctx2 = ctxSpy();
  await refused.roster.handle(req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" } }), makeEnv(), ctx2);
  await ctx2.settle();
  assert.equal(refused.net.rpc("roster_events_claim").length, 0);

  const reads = world({ roster_api_meetings: () => MEETINGS_DB });
  const ctx3 = ctxSpy();
  await reads.roster.handle(req("/meetings", { key: PUB }), makeEnv(), ctx3);
  assert.equal(ctx3.pending.length, 0, "a read enqueues nothing");

  /* a crashing outbox cannot break the reply */
  const noCtx = world({ roster_api_signup: () => SIGNUP_OK, roster_events_claim: () => ({ status: 500, body: {} }) });
  const quiet = console.error;
  console.error = () => {};
  try {
    const ok = await call(noCtx.roster, req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" } }));
    assert.equal(ok.status, 200);
  } finally { console.error = quiet; }
});

/* --- the request body ---------------------------------------------------------------------------------- */

test("body: size is limited to 16 KB before parsing, declared or not", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const text = (n) => JSON.stringify({ first_name: "a", pad: "x".repeat(n) });
  const pad = (total) => text(total - text(0).length);

  const exact = pad(16384);
  assert.equal(new TextEncoder().encode(exact).length, 16384);
  assert.equal((await signup(roster, undefined, { body: exact })).status, 200, "exactly 16 KB is allowed");

  const over = pad(16385);
  const declared = await signup(roster, undefined, { body: over });
  assert.deepEqual([declared.status, declared.body.error.code], [400, "bad_request"]);
  assert.match(declared.body.error.message, /16 KB/);

  /* no Content-Length, a stream that keeps going: cut off at the limit, not buffered */
  let pulled = 0;
  const stream = new ReadableStream({ pull(controller) { pulled += 1024; controller.enqueue(new TextEncoder().encode(`${"x".repeat(1023)}\n`)); if (pulled > 5_000_000) controller.close(); } });
  const huge = new Request("https://worker.test/roster/v1/signup", { method: "POST", duplex: "half", body: stream, headers: { authorization: `Bearer ${PUB}`, "content-type": "application/json" } });
  const r = await call(roster, huge);
  assert.deepEqual([r.status, r.body.error.code], [400, "bad_request"]);
  assert.ok(pulled < 1_000_000, `read ${pulled} bytes before stopping`);

  assert.equal(net.rpc("roster_api_signup").length, 1);
});

test("body: content type, strict UTF-8, strict JSON, an object", async () => {
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK });
  const code = async (opts) => { const r = await call(roster, req("/signup", { method: "POST", key: PUB, ...opts })); return [r.status, r.body.error?.code]; };

  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "text/plain" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "application/x-www-form-urlencoded" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "text/json" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "application/jsonp" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "{bad" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "{'a':1}" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: '{"a":1,}' }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "[]" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "null" }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: '"text"' }), [400, "bad_request"]);
  assert.deepEqual(await code({ body: "5" }), [400, "bad_request"]);
  const bomBody = String.fromCharCode(0xfeff) + '{"first_name":"a"}';
  assert.deepEqual(await code({ body: bomBody }), [200, undefined], "a BOM (PowerShell writes one) is tolerated, not required");
  assert.deepEqual(await code({ body: new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d]) }), [400, "bad_request"], "invalid UTF-8");
  assert.deepEqual(await code({ body: "[".repeat(20000) }), [400, "bad_request"], "deep nesting");

  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "application/json; charset=utf-8" }), [200, undefined]);
  assert.deepEqual(await code({ body: '{"first_name":"a"}', contentType: "Application/JSON" }), [200, undefined]);
  assert.equal(net.rpc("roster_api_signup").length, 3);
  assert.equal(net.rpc("roster_api_auth").length, 3, "refused bodies cost no database call");
});

test("body: a request with no body at all on a route that needs one", async () => {
  const { roster } = world();
  const r = await call(roster, new Request("https://worker.test/roster/v1/signup", { method: "POST", headers: { authorization: `Bearer ${PUB}`, "content-type": "application/json" } }));
  assert.deepEqual([r.status, r.body.error.code], [400, "bad_request"]);
});

/* --- POST /payments/click -------------------------------------------------------------------------------- */

test("click: the token is hashed before it leaves the Worker; the reply is a plain ok", async () => {
  const { net, roster } = world({ roster_api_payment_click: () => ({ status: "ok", amount: 80, participant_id: UUID_A }) });
  const r = await call(roster, req("/payments/click", { method: "POST", key: PUB, origin: "https://studio.example", json: { participant_token: TOKEN, meeting_id: UUID_A, extra: 1 } }));
  assert.deepEqual([r.status, r.body], [200, { status: "ok" }]);
  const [c] = net.rpc("roster_api_payment_click");
  assert.deepEqual(c.json, { p_key_hash: await sha256Hex(PUB), p_token_hash: await sha256Hex(TOKEN), p_meeting: UUID_A, p_ip_hash: c.json.p_ip_hash });
  assert.match(c.json.p_ip_hash, /^[0-9a-f]{64}$/);
  for (const call2 of net.calls) assert.ok(!(call2.raw || "").includes(TOKEN), "the token is never sent in plain");
  assert.equal(net.rpc("roster_api_auth")[0].json.p_bucket, "click");
  assert.equal(net.rpc("roster_api_auth")[0].json.p_required_kind, "public");
});

test("click is uniform (M3): whatever the database says about how it went, the caller gets the same {status: ok}", async () => {
  for (const answer of [{ status: "ok" }, { status: "reported" }, { status: "already_reported" }, { status: "already_paid" }, { status: "free" }, { status: "not_registered" }, { status: "past" }, { status: "ok", extra: "x" }, {}]) {
    const { roster } = world({ roster_api_payment_click: () => answer });
    const r = await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A } }));
    assert.deepEqual([r.status, r.body], [200, { status: "ok" }], JSON.stringify(answer));
    assert.equal(r.raw, '{"status":"ok"}', "byte for byte the same body");
  }
  /* an answer that is not an object at all is still a server error, not an ok */
  for (const answer of [null, "ok", [], 5]) {
    const { roster } = world({ roster_api_payment_click: () => answer });
    const quiet = console.error;
    console.error = () => {};
    let r;
    try { r = await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A } })); } finally { console.error = quiet; }
    assert.equal(r.status, 500, JSON.stringify(answer));
  }
});

test("click: a bad or unknown token is 401 invalid_token; a bad meeting is 422", async () => {
  const { net, roster } = world({ roster_api_payment_click: () => ({ error: "invalid_token" }) });
  for (const token of [undefined, null, "", "pt_short", `pt_${"a".repeat(33)}`, `PT_${"a".repeat(32)}`, 5, [TOKEN], `${TOKEN}\n`, SEC]) {
    const r = await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: token, meeting_id: UUID_A } }));
    assert.deepEqual([r.status, r.body.error.code], [401, "invalid_token"], String(token));
  }
  assert.equal(net.calls.length, 0, "a malformed token costs no database call");

  const unknown = await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A } }));
  assert.deepEqual([unknown.status, unknown.body.error.code], [401, "invalid_token"]);

  for (const meeting_id of [undefined, "x", 5, `${UUID_A}x`]) {
    const r = await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id } }));
    assert.deepEqual([r.status, r.body.error.field], [422, "meeting_id"]);
  }
});

/* --- the secret routes ----------------------------------------------------------------------------------- */

const SUMMARY = { id: UUID_A, first_name: "דנה", last_name: "לוי", phone: "+972501234567", email: null, age: 34, gender: "female", active: true, balance: 0, meetings: [] };

test("GET /participants?phone: the raw phone goes to the database, and only digits and phone punctuation are accepted", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_participant: () => ({ participant: SUMMARY }) });
  const r = await call(roster, req("/participants?phone=%2B972%2050-123%204567", { key: SEC }));
  assert.deepEqual([r.status, r.body], [200, { participant: SUMMARY }]);
  assert.deepEqual(net.rpc("roster_api_participant")[0].json, { p_key_hash: await sha256Hex(SEC), p_id: null, p_phone: "+972 50-123 4567" });
  assert.equal(net.rpc("roster_api_auth")[0].json.p_bucket, "read");

  for (const q of ["", "?phone=", "?phone=abc", `?phone=${"1".repeat(41)}`, "?phone=0501234567%0Ax", "?phone=0501234567;drop", "?phone=12", "?id=1"]) {
    const bad = await call(roster, req(`/participants${q}`, { key: SEC }));
    assert.deepEqual([bad.status, bad.body.error.field], [422, "phone"], q);
  }
  assert.equal(net.rpc("roster_api_participant").length, 1);
});

test("GET /participants/{id}: by id, 404 for a stranger and for an id that is not a uuid", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_participant: (a) => (a.p_id === UUID_A ? { participant: SUMMARY } : { error: "not_found" }) });
  const ok = await call(roster, req(`/participants/${UUID_A.toUpperCase()}`, { key: SEC }));
  assert.equal(ok.status, 200);
  assert.deepEqual(net.rpc("roster_api_participant")[0].json, { p_key_hash: await sha256Hex(SEC), p_id: UUID_A, p_phone: null });

  const stranger = await call(roster, req(`/participants/${UUID_B}`, { key: SEC }));
  assert.deepEqual([stranger.status, stranger.body.error.code], [404, "not_found"]);
  const notUuid = await call(roster, req("/participants/12345", { key: SEC }));
  assert.equal(notUuid.status, 404);
  assert.equal(net.rpc("roster_api_participant").length, 2);
});

test("registrations: register and cancel, with exactly the ids the caller named", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_register: () => ({ status: "full" }), roster_api_unregister: () => ({ status: "cancelled" }) });
  const reg = await call(roster, req(`/participants/${UUID_A}/registrations`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } }));
  assert.deepEqual([reg.status, reg.body], [200, { status: "full" }]);
  assert.deepEqual(net.rpc("roster_api_register")[0].json, { p_key_hash: await sha256Hex(SEC), p_participant: UUID_A, p_meeting: UUID_B });

  const cancel = await call(roster, req(`/participants/${UUID_A}/registrations/${UUID_B}`, { method: "DELETE", key: SEC }));
  assert.deepEqual([cancel.status, cancel.body], [200, { status: "cancelled" }]);
  assert.deepEqual(net.rpc("roster_api_unregister")[0].json, { p_key_hash: await sha256Hex(SEC), p_participant: UUID_A, p_meeting: UUID_B });

  const missing = await call(roster, req(`/participants/${UUID_A}/registrations`, { method: "POST", key: SEC, json: {} }));
  assert.deepEqual([missing.status, missing.body.error.field], [422, "meeting_id"]);
  const badIds = await call(roster, req(`/participants/${UUID_A}/registrations/xyz`, { method: "DELETE", key: SEC }));
  assert.equal(badIds.status, 404);
  assert.equal(net.rpc("roster_api_register").length + net.rpc("roster_api_unregister").length, 2);
});

test("registrations: statuses pass through, an unknown participant is 404, and both start the outbox", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_register: () => ({ error: "not_found" }), roster_api_unregister: () => ({ status: "attended" }) });
  const ctx = ctxSpy();
  const r = await call(roster, req(`/participants/${UUID_A}/registrations`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } }), makeEnv(), ctx);
  assert.deepEqual([r.status, r.body.error.code], [404, "not_found"]);
  const u = await call(roster, req(`/participants/${UUID_A}/registrations/${UUID_B}`, { method: "DELETE", key: SEC }), makeEnv(), ctx);
  assert.deepEqual([u.status, u.body], [200, { status: "attended" }]);
  await ctx.settle();
  assert.equal(net.rpc("roster_events_claim").length, 1, "only the success started the outbox");
});

test("pay-from-credit: ids, passthrough of the numbers, outbox", async () => {
  const answer = { status: "ok", allocated: 80, remaining: 0, credit_left: 20 };
  const { net, roster } = world({ ...secretAuth, roster_api_pay_from_credit: () => answer });
  const ctx = ctxSpy();
  const r = await call(roster, req(`/participants/${UUID_A}/pay-from-credit`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } }), makeEnv(), ctx);
  assert.deepEqual([r.status, r.body], [200, answer]);
  assert.deepEqual(net.rpc("roster_api_pay_from_credit")[0].json, { p_key_hash: await sha256Hex(SEC), p_participant: UUID_A, p_meeting: UUID_B });
  await ctx.settle();
  assert.equal(net.rpc("roster_events_claim").length, 1);
});

/* --- POST /payments ------------------------------------------------------------------------------------- */

const PAY = { participant_id: UUID_A, meeting_id: UUID_B, amount: 80, external_ref: "bank-2027-001" };

test("payments: the payload the database receives, defaults filled in, extras dropped", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_C, duplicate: false }) });
  const r = await call(roster, req("/payments", { method: "POST", key: SEC, json: { ...PAY, note: "  עבור חודש ינואר ", business_id: UUID_C, id: "x" } }));
  assert.deepEqual([r.status, r.body], [200, { status: "ok", payment_id: UUID_C, duplicate: false }]);
  assert.deepEqual(net.rpc("roster_api_record_payment")[0].json, {
    p_key_hash: await sha256Hex(SEC),
    p_payload: { participant_id: UUID_A, kind: "payment", amount: 80, method: "other", external_ref: "bank-2027-001", meeting_id: UUID_B, note: "עבור חודש ינואר" },
  });

  const deposit = await call(roster, req("/payments", { method: "POST", key: SEC, json: { participant_id: UUID_A, kind: "Deposit", amount: 12.5, method: "BIT", external_ref: "d1" } }));
  assert.equal(deposit.status, 200);
  assert.deepEqual(net.rpc("roster_api_record_payment")[1].json.p_payload, { participant_id: UUID_A, kind: "deposit", amount: 12.5, method: "bit", external_ref: "d1" });
});

test("payments: the same call twice returns the database's duplicate answer", async () => {
  let n = 0;
  const { roster } = world({ ...secretAuth, roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_C, duplicate: n++ > 0 }) });
  const first = await call(roster, req("/payments", { method: "POST", key: SEC, json: PAY }));
  const second = await call(roster, req("/payments", { method: "POST", key: SEC, json: PAY }));
  assert.equal(first.body.duplicate, false);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.payment_id, first.body.payment_id);
});

test("payments: the idempotency key may come as a header; both must agree; one is required", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_C, duplicate: false }) });
  const { external_ref, ...noRef } = PAY;

  const viaHeader = await call(roster, req("/payments", { method: "POST", key: SEC, json: noRef, headers: { "idempotency-key": "hdr-1" } }));
  assert.equal(viaHeader.status, 200);
  assert.equal(net.rpc("roster_api_record_payment")[0].json.p_payload.external_ref, "hdr-1");

  const same = await call(roster, req("/payments", { method: "POST", key: SEC, json: PAY, headers: { "idempotency-key": PAY.external_ref } }));
  assert.equal(same.status, 200);
  const differ = await call(roster, req("/payments", { method: "POST", key: SEC, json: PAY, headers: { "idempotency-key": "something-else" } }));
  assert.deepEqual([differ.status, differ.body.error.field], [422, "external_ref"]);
  const none = await call(roster, req("/payments", { method: "POST", key: SEC, json: noRef }));
  assert.deepEqual([none.status, none.body.error.field], [422, "external_ref"]);
  assert.equal(net.rpc("roster_api_record_payment").length, 2);
});

test("payments: field checks", async () => {
  const { net, roster } = world({ ...secretAuth, roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_C, duplicate: false }) });
  const { meeting_id, ...noMeeting } = PAY;
  const bad = [
    [{ participant_id: undefined }, "participant_id"], [{ participant_id: "x" }, "participant_id"], [{ participant_id: 5 }, "participant_id"],
    [{ meeting_id: "x" }, "meeting_id"], [{ meeting_id: 5 }, "meeting_id"],
    [{ kind: "gift" }, "kind"], [{ kind: 5 }, "kind"], [{ kind: ["payment"] }, "kind"],
    [{ amount: undefined }, "amount"], [{ amount: "80" }, "amount"], [{ amount: 0 }, "amount"], [{ amount: -5 }, "amount"], [{ amount: null }, "amount"],
    [{ amount: 1_000_001 }, "amount"], [{ amount: true }, "amount"], [{ amount: [80] }, "amount"], [{ amount: {} }, "amount"],
    [{ method: 5 }, "method"], [{ method: "x".repeat(41) }, "method"], [{ method: "a\nb" }, "method"],
    [{ note: 5 }, "note"], [{ note: "x".repeat(501) }, "note"], [{ note: "a\u0000b" }, "note"],
    [{ external_ref: 5 }, "external_ref"], [{ external_ref: "x".repeat(201) }, "external_ref"], [{ external_ref: "a\nb" }, "external_ref"], [{ external_ref: "" }, "external_ref"],
  ];
  for (const [patch, field] of bad) {
    const json = { ...PAY, ...patch };
    for (const k of Object.keys(json)) if (json[k] === undefined) delete json[k];
    const r = await call(roster, req("/payments", { method: "POST", key: SEC, json }));
    assert.deepEqual([r.status, r.body.error.code, r.body.error.field], [422, "validation", field], JSON.stringify(patch));
  }
  const needsMeeting = await call(roster, req("/payments", { method: "POST", key: SEC, json: noMeeting }));
  assert.deepEqual([needsMeeting.status, needsMeeting.body.error.field], [422, "meeting_id"], "a payment needs a meeting");
  for (const kind of ["deposit", "refund"]) {
    assert.equal((await call(roster, req("/payments", { method: "POST", key: SEC, json: { ...noMeeting, kind } }))).status, 200, kind);
  }
  assert.equal(net.rpc("roster_api_record_payment").length, 2);
  /* multi-line notes are allowed */
  assert.equal((await call(roster, req("/payments", { method: "POST", key: SEC, json: { ...PAY, note: "a\nb" } }))).status, 200);
});

test("payments: validation, not_found and conflict from the database", async () => {
  for (const [answer, status] of [[{ error: "validation", field: "amount" }, 422], [{ error: "not_found" }, 404], [{ error: "conflict" }, 409]]) {
    const { roster } = world({ ...secretAuth, roster_api_record_payment: () => answer });
    const r = await call(roster, req("/payments", { method: "POST", key: SEC, json: PAY }));
    assert.deepEqual([r.status, r.body.error.code], [status, answer.error]);
  }
});

/* --- one last sweep over the logs ---------------------------------------------------------------------------- */

test("nothing the callers typed, no key, no token and no secret appears in any log line", async () => {
  const logged = [];
  const origErr = console.error, origLog = console.log, origWarn = console.warn;
  console.error = console.log = console.warn = (...a) => logged.push(a.map(String).join(" "));
  try {
    const { roster } = world({ roster_api_signup: () => ({ status: 500, body: { message: "dana@example.com broke it" } }), roster_api_payment_click: () => ({ error: "invalid_token" }) });
    await signup(roster, { first_name: "UNIQUE_FIRST_NAME", phone: "0509998887", email: "unique@example.com" });
    await call(roster, req("/payments/click", { method: "POST", key: PUB, json: { participant_token: TOKEN, meeting_id: UUID_A } }));
    await call(roster, req("/signup", { method: "POST", key: PUB, body: "{UNIQUE_BAD_BODY", ip: "198.51.100.77" }));
    await call(roster, req("/meetings", { key: PUB }), makeEnv({ SUPABASE_SERVICE_KEY: "" }));
  } finally {
    console.error = origErr; console.log = origLog; console.warn = origWarn;
  }
  const all = logged.join("\n");
  for (const secret of [PUB, SEC, TOKEN, SERVICE_KEY, "UNIQUE_FIRST_NAME", "0509998887", "unique@example.com", "UNIQUE_BAD_BODY", "198.51.100.77", "dana@example.com"]) {
    assert.ok(!all.includes(secret), `log contains ${secret}`);
  }
  assert.ok(logged.length > 0, "something was logged (the 500 and the 503), so this check had something to look at");
});

test("the HMAC of a delivery made through the route-driven outbox verifies (the pieces fit together)", async () => {
  const item = {
    event: { id: 900, type: "registration.created", attempts: 0, created_at: "2027-01-10T09:00:00Z", payload: { participant: { id: UUID_A, first_name: "דנה", email: null }, meeting: { id: UUID_B, date: "2027-01-20", time: "20:00", name: "מפגש" } } },
    business: { id: "b", slug: "studio", name: "סטודיו", notify_emails: [], settings: { webhook_url: "https://hooks.example.com/in", webhook_secret: "whsec_route", webhook_events: ["registration.created"] } },
    participant: null, facts: {}, templates: {}, mail_counters: { recipients: {}, business_day: 0 },
  };
  const { net, roster } = world({ roster_api_signup: () => SIGNUP_OK, roster_events_claim: () => [item] });
  const ctx = ctxSpy();
  await roster.handle(req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" } }), makeEnv(), ctx);
  await ctx.settle();
  const [hook] = net.webhooks();
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(hook.headers["x-roster-signature"]);
  assert.equal(m[2], createHmac("sha256", "whsec_route").update(`${m[1]}.${hook.raw}`).digest("hex"));
  assert.equal(net.rpc("roster_events_done").length, 1);
});

/* --- the code to status table of the spec, end to end ------------------------------------------------------ */

test("every error code of the spec comes out with its status, a fixed sentence, and no extras", async () => {
  const table = {
    invalid_key: 401, invalid_token: 401, wrong_key_kind: 403, origin_not_allowed: 403, secret_key_in_browser: 403, rate_limited: 429,
    validation: 422, not_found: 404, closed: 409, full: 409, conflict: 409, bad_request: 400, server_error: 500,
  };
  const sentences = new Set();
  for (const [code, status] of Object.entries(table)) {
    const { roster } = world({ ...secretAuth, roster_api_register: () => ({ error: code, field: "meeting_id", retry_after: 5, detail: "database text" }) });
    const quiet = console.error;
    console.error = () => {};
    let r;
    try { r = await call(roster, req(`/participants/${UUID_A}/registrations`, { method: "POST", key: SEC, json: { meeting_id: UUID_B } })); } finally { console.error = quiet; }
    assert.equal(r.status, status, code);
    assert.equal(r.body.error.code, code);
    assert.ok(!r.raw.includes("database text"), code);
    assert.deepEqual(Object.keys(r.body.error).sort(), code === "validation" ? ["code", "field", "message"] : ["code", "message"], code);
    assert.equal(r.headers.get("retry-after"), code === "rate_limited" ? "5" : null, code);
    sentences.add(r.body.error.message);
  }
  assert.equal(sentences.size, 13, "each code has its own sentence");
  for (const s of sentences) assert.match(s, /^[A-Z][^\u2013\u2014]*\.$/);
});

test("`invalid_key` is the same answer whether the key is missing, malformed, unknown or revoked", async () => {
  const unknown = world({ roster_api_auth: () => ({ error: "invalid_key" }) });
  const answers = [];
  for (const request of [req("/meetings"), req("/meetings", { key: "junk" }), req("/meetings", { key: PUB })]) {
    const r = await call(unknown.roster, request);
    answers.push(JSON.stringify([r.status, r.body, r.headers.get("content-type"), r.headers.get("www-authenticate")]));
  }
  assert.equal(new Set(answers).size, 1, answers.join("\n"));
});
