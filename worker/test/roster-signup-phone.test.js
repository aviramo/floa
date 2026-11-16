/* The two-step public signup: POST /signup/phone (the phone first) and POST /signup/complete (the details after, by the token the
   first step returned). Run against a fake database: the RPC name and the arguments are recorded and asserted. */
import test from "node:test";
import assert from "node:assert/strict";
import { matchRoute } from "../src/roster/routes.js";
import { PUB, SEC, TOKEN, UUID_A, UUID_B, fakeNet, call, makeRoster, req } from "./roster-helpers.js";

function world(rpc = {}) {
  const net = fakeNet({ rpc: { api_auth: () => ({ ok: true, kind: "public" }), events_claim: () => [], events_done: () => null, ...rpc } });
  return { net, roster: makeRoster(net) };
}
const phone = (roster, json, opts = {}) => call(roster, req("/signup/phone", { method: "POST", key: PUB, json, ...opts }));
const complete = (roster, json, opts = {}) => call(roster, req("/signup/complete", { method: "POST", key: PUB, json, ...opts }));

test("routes: both paths exist, POST only, and the old /signup is untouched", () => {
  assert.equal(matchRoute("POST", "/roster/v1/signup/phone")?.route?.name, "signup_phone");
  assert.equal(matchRoute("POST", "/roster/v1/signup/complete")?.route?.name, "signup_complete");
  assert.equal(matchRoute("POST", "/roster/v1/signup")?.route?.name, "signup");
  assert.deepEqual(matchRoute("GET", "/roster/v1/signup/phone").allow, ["POST"]);
  assert.equal(matchRoute("POST", "/roster/v1/signup/other"), null);
});

test("signup/phone: a whitelist payload, and a reply with the token and `complete`, never a participant", async () => {
  const { net, roster } = world({ api_signup_phone: () => ({ status: "ok", registered: true, participant_token: TOKEN, complete: false, participant_id: UUID_B, created: true }) });
  const r = await phone(roster, { phone: " 050-123-4567 ", email: "Dana@Example.com", meeting_id: UUID_A.toUpperCase(), source_code: "P", first_name: "x", business_id: UUID_B, is_admin: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "ok", registered: true, participant_token: TOKEN, complete: false }, "no participant_id, no created for a public key");
  const [c] = net.rpc("api_signup_phone");
  assert.deepEqual(Object.keys(c.json).sort(), ["p_ip_hash", "p_key_hash", "p_payload"]);
  assert.deepEqual(c.json.p_payload, { phone: "050-123-4567", email: "Dana@Example.com", meeting_id: UUID_A, source_code: "p" });
  assert.equal(net.rpc("api_auth")[0].json.p_bucket, "signup");
});

test("signup/phone: field checks and the honeypot", async () => {
  const { net, roster } = world({ api_signup_phone: () => ({ status: "ok", registered: false, participant_token: TOKEN, complete: true }) });
  for (const [json, field] of [[{ phone: 5 }, "phone"], [{ phone: "0501234567", meeting_id: "nope" }, "meeting_id"], [{ phone: "0501234567", source_code: "x".repeat(41) }, "source_code"], [{ phone: "0501234567", email: "a\u0000b" }, "email"]]) {
    const r = await phone(roster, json);
    assert.equal(r.status, 422, JSON.stringify(json));
    assert.equal(r.body.error.field, field);
  }
  const before = net.rpc("api_signup_phone").length;
  const fake = await phone(roster, { phone: "0501234567", website: "http://spam" });
  assert.equal(fake.status, 200);
  assert.equal(net.rpc("api_signup_phone").length, before, "the honeypot never reaches the database");
});

test("signup/complete: the token and the details, nothing else", async () => {
  const { net, roster } = world({ api_signup_complete: () => ({ status: "ok", changed: true, participant_id: UUID_B }) });
  const r = await complete(roster, { participant_token: TOKEN, first_name: " דנה ", last_name: "לוי", age: "34", gender: "FEMALE", email: "d@x.com", business_id: UUID_B, phone: "0509999999" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "ok" }, "nothing about the participant comes back");
  const [c] = net.rpc("api_signup_complete");
  assert.deepEqual(c.json.p_payload, { participant_token: TOKEN, first_name: "דנה", last_name: "לוי", email: "d@x.com", gender: "female", age: 34 });
});

test("signup/complete: a bad token is refused before the database, a database refusal passes through", async () => {
  const { net, roster } = world({ api_signup_complete: () => ({ error: "invalid_token" }) });
  const bad = await complete(roster, { participant_token: "nope", first_name: "דנה" });
  assert.equal(bad.status, 401);
  assert.equal(net.rpc("api_signup_complete").length, 0);
  const gone = await complete(roster, { participant_token: TOKEN, first_name: "דנה", last_name: "לוי" });
  assert.equal(gone.status, 401);
  assert.equal(gone.body.error.code, "invalid_token");
  const v = world({ api_signup_complete: () => ({ error: "validation", field: "age" }) });
  const r = await complete(v.roster, { participant_token: TOKEN, first_name: "דנה", last_name: "לוי", age: "7" });
  assert.equal(r.status, 422);
  assert.equal(r.body.error.field, "age");
});

test("a secret key gets the same reply shape on signup/phone plus the participant", async () => {
  const net = fakeNet({ rpc: { api_auth: () => ({ ok: true, kind: "secret" }), api_signup_phone: () => ({ status: "ok", registered: false, participant_token: TOKEN, complete: true, participant_id: UUID_B, created: false }), events_claim: () => [], events_done: () => null } });
  const r = await call(makeRoster(net), req("/signup/phone", { method: "POST", key: SEC, json: { phone: "0501234567" } }));
  assert.deepEqual(r.body, { status: "ok", registered: false, participant_token: TOKEN, complete: true, participant_id: UUID_B, created: false });
});

test("meetings: ?past=N asks for the meetings that already happened, and a call without it is exactly what it always was", async () => {
  const rows = { business: { name: "x" }, meetings: [{ id: UUID_A, date: "2020-01-01", time: "20:00", name: "m", price: 80, price_tiers: { base: 80, steps: [] }, image: "https://x.example/a.jpg" }] };
  const a = world({ api_meetings: () => rows });
  const r = await call(a.roster, req("/meetings?past=3", { key: PUB }));
  assert.equal(r.status, 200);
  assert.equal(r.body.meetings[0].image, "https://x.example/a.jpg", "the picture is part of a public meeting when there is one");
  assert.deepEqual(Object.keys(a.net.rpc("api_meetings")[0].json).sort(), ["p_key_hash", "p_limit", "p_past"]);
  assert.equal(a.net.rpc("api_meetings")[0].json.p_past, 3);
  const b = world({ api_meetings: () => rows });
  await call(b.roster, req("/meetings", { key: PUB }));
  assert.deepEqual(Object.keys(b.net.rpc("api_meetings")[0].json).sort(), ["p_key_hash", "p_limit"], "no ?past: the arguments are unchanged");
  assert.equal((await call(a.roster, req("/meetings?past=x", { key: PUB }))).status, 422);
});
