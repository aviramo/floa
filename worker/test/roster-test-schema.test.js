/* api-test.floa.co.il is the same API on the roster-test schema: webhooks are delivered, mail is never sent.
   Everything else (limits, key cache) is kept apart per schema. */
import test from "node:test";
import assert from "node:assert/strict";
import { processOutbox } from "../src/roster/outbox.js";
import { createDb, schemaOfHost } from "../src/roster/db.js";
import { PUB, call, ctxSpy, fakeNet, makeEnv, makeRoster } from "./roster-helpers.js";

const NOW = 1_800_000_000_000;
const request = (host, ip = "203.0.113.7") => new Request(`https://${host}/roster/v1/meetings`, { headers: { authorization: `Bearer ${PUB}`, "cf-connecting-ip": ip } });

const world = (authKind = "public") => {
  const net = fakeNet({ rpc: { api_auth: () => ({ ok: true, kind: authKind }), api_meetings: () => ({ business: { name: "x" }, meetings: [] }), events_claim: () => [], events_done: () => null } });
  return { net, roster: makeRoster(net) };
};

test("only api-test.floa.co.il is the test schema; every other host is the real one", () => {
  assert.equal(schemaOfHost("api-test.floa.co.il"), "roster-test");
  assert.equal(schemaOfHost("API-TEST.floa.co.il"), "roster-test");
  for (const h of ["api.floa.co.il", "floa-lead.floa-il.workers.dev", "worker.test", "api-test.floa.co.il.evil.example", "", undefined]) assert.equal(schemaOfHost(h), "roster", String(h));
});

test("createDb sends the schema it was given, roster by default", async () => {
  const net = fakeNet({ rpc: { ping: () => ({}) } });
  // ping is not an allowed function; use an allowed one
  const { RPC } = await import("../src/roster/db.js");
  const name = RPC.auth;
  const net2 = fakeNet({ rpc: { [name]: () => ({ ok: true }) } });
  await createDb({ url: "https://db.test", serviceKey: "k", fetch: net2.fetch }).rpc(name, {});
  await createDb({ url: "https://db.test", serviceKey: "k", fetch: net2.fetch, schema: "roster-test" }).rpc(name, {});
  assert.deepEqual(net2.rpc(name).map((c) => c.headers["content-profile"]), ["roster", "roster-test"]);
  void net;
});

test("a request to api-test sends content-profile roster-test; one to api.floa.co.il sends roster", async () => {
  const t = world();
  assert.equal((await call(t.roster, request("api-test.floa.co.il"))).status, 200);
  assert.ok(t.net.calls.filter((c) => c.path.includes("/rpc/")).length >= 2);
  for (const c of t.net.calls.filter((c) => c.path.includes("/rpc/"))) assert.equal(c.headers["content-profile"], "roster-test", c.path);

  const r = world();
  assert.equal((await call(r.roster, request("api.floa.co.il"))).status, 200);
  for (const c of r.net.calls.filter((c) => c.path.includes("/rpc/"))) assert.equal(c.headers["content-profile"], "roster", c.path);
});

test("the cron drains both schemas, each with its own profile", async () => {
  const net = fakeNet({ rpc: { events_claim: () => [], events_done: () => null } });
  const roster = makeRoster(net);
  const ctx = ctxSpy();
  await roster.scheduled(makeEnv(), ctx);
  await ctx.settle();
  assert.deepEqual(net.rpc("events_claim").map((c) => c.headers["content-profile"]).sort(), ["roster", "roster-test"]);
});

const item = (id) => ({
  event: { id, type: "participant.created", attempts: 0, created_at: "2027-01-10T09:00:00Z", payload: { participant: { id: "11111111-1111-4111-8111-111111111111", first_name: "דנה", last_name: "לוי", phone: "+972501234567", email: "dana@example.com" } } },
  business: { id: "b1", slug: "demo", name: "עסק לדוגמה", notify_emails: ["owner@example.com"],
    settings: { webhook_url: "https://hooks.example.com/roster", webhook_secret: "whsec_t", webhook_events: null, participant_mail_enabled: true, personal_area_enabled: true, contact_email: null, sender_name: null, contact_whatsapp: null, payment_url: null } },
  participant: null, facts: {}, templates: {}, mail_counters: { recipients: {}, business_day: 0 },
});

test("the test schema delivers the webhook and sends NO mail, and reports no mail rows; the real one sends both", async () => {
  const run = async (schema) => {
    const net = fakeNet({ rpc: { events_claim: () => [item(7)], events_done: () => null } });
    await processOutbox({ env: makeEnv(), fetch: net.fetch, now: () => NOW, sleep: async () => {}, schema });
    return { net, done: net.rpc("events_done")[0].json };
  };
  const t = await run("roster-test");
  assert.equal(t.net.webhooks().length, 1, "the webhook is delivered");
  assert.equal(t.net.resend().length, 0, "no mail");
  assert.deepEqual(t.done.p_result.mails, []);
  assert.equal(t.net.rpc("events_claim")[0].headers["content-profile"], "roster-test");
  assert.equal(t.net.rpc("events_done")[0].headers["content-profile"], "roster-test");

  const r = await run("roster");
  assert.equal(r.net.webhooks().length, 1);
  assert.equal(r.net.resend().length, 1, "the real schema still mails the notify list");
  assert.equal(r.done.p_result.mails.length, 1);
});

test("a key the test database accepted does not exempt it from the real schema's bad-key brake", async () => {
  /* the same key and address on both hosts: the counters are separate (test: roster-test:<hash>) */
  const net = fakeNet({ rpc: { api_auth: () => ({ ok: false, error: "invalid_key" }), events_claim: () => [], events_done: () => null } });
  const roster = makeRoster(net);
  for (let i = 0; i < 61; i++) await call(roster, request("api-test.floa.co.il", "198.51.100.9"));
  const blockedTest = await call(roster, request("api-test.floa.co.il", "198.51.100.9"));
  assert.equal(blockedTest.status, 429, "the test host's own counter ran out");
  const real = await call(roster, request("api.floa.co.il", "198.51.100.9"));
  assert.equal(real.status, 401, "the real host is untouched by the test host's counter");
});

test("with ROSTER_TEST_MAIL_TO the test schema mails ONLY that address, with a test mark; without it, nothing; the real schema never redirects", async () => {
  const run = async (schema, extra) => {
    const net = fakeNet({ rpc: { events_claim: () => [item(8)], events_done: () => null } });
    await processOutbox({ env: makeEnv(extra), fetch: net.fetch, now: () => NOW, sleep: async () => {}, schema });
    return net;
  };
  const t = await run("roster-test", { ROSTER_TEST_MAIL_TO: "me@example.com" });
  const sent = t.resend();
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].json.to, ["me@example.com"]);
  assert.ok(String(sent[0].json.subject).startsWith("[בדיקות] "));
  assert.equal((await run("roster-test", {})).resend().length, 0);
  const r = await run("roster", { ROSTER_TEST_MAIL_TO: "me@example.com" });
  assert.deepEqual(r.resend()[0].json.to, ["owner@example.com"]);
  assert.ok(!String(r.resend()[0].json.subject).startsWith("[בדיקות]"));
});

test("ROSTER_TEST_ADMIN_FROM: in the test schema the mails to the admins come from that address, the others from ROSTER_TEST_FROM; the real schema never uses either", async () => {
  const run = async (schema, extra) => {
    const net = fakeNet({ rpc: { events_claim: () => [item(8)], events_done: () => null } });
    await processOutbox({ env: makeEnv(extra), fetch: net.fetch, now: () => NOW, sleep: async () => {}, schema });
    return net.resend();
  };
  const env = { ROSTER_TEST_MAIL_TO: "me@example.com", ROSTER_TEST_FROM: "Biz <biz@example.com>", ROSTER_TEST_ADMIN_FROM: "admins@example.com" };
  const t = await run("roster-test", env);
  assert.ok(t.length >= 1);
  for (const m of t) assert.ok([ "admins@example.com", "Biz <biz@example.com>" ].includes(m.json.from), m.json.from);
  const r = await run("roster", env);
  for (const m of r) assert.ok(m.json.from !== "admins@example.com" && m.json.from !== "Biz <biz@example.com>");
});
