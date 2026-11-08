import test from "node:test";
import assert from "node:assert/strict";
import { cacheStore, createIpLimiter, createMailTally, IP_LIMITS, layeredStore, MAX_BODY_BYTES, memoryStore, OUTBOX } from "../src/roster/limits.js";
import { createRoster } from "../src/roster/routes.js";
import { PUB, call, fakeNet, req } from "./roster-helpers.js";
import { makeEnv } from "./roster-helpers.js";

test("the numbers of the spec", () => {
  assert.equal(MAX_BODY_BYTES, 16 * 1024);
  assert.deepEqual({ ...IP_LIMITS.signup }, { max: 6, windowSec: 600 });
  assert.deepEqual({ ...IP_LIMITS.click }, { max: 30, windowSec: 600 });
  assert.equal(OUTBOX.batch, 20);
  assert.equal(OUTBOX.webhookTimeoutMs, 10_000);
  assert.ok(OUTBOX.apiDeadlineMs < 30_000, "the API path has to finish inside waitUntil's 30 seconds");
});

test("the IP limiter: the allowance, the Retry-After it computes, a new window, separate counters", async () => {
  let t = 1_800_000_000_000 + 125_000;
  const limiter = createIpLimiter({ store: memoryStore(), now: () => t });
  const nowSec = Math.floor(t / 1000);
  const toEnd = 600 - (nowSec % 600);

  for (let i = 0; i < 6; i++) assert.deepEqual(await limiter.hit("signup", "ip1"), { ok: true });
  assert.deepEqual(await limiter.hit("signup", "ip1"), { ok: false, retryAfter: toEnd });
  assert.deepEqual(await limiter.hit("signup", "ip1"), { ok: false, retryAfter: toEnd }, "a refused hit does not extend the block");
  assert.deepEqual(await limiter.hit("signup", "ip2"), { ok: true }, "another address");
  assert.deepEqual(await limiter.hit("click", "ip1"), { ok: true }, "another bucket");
  assert.deepEqual(await limiter.hit("unknown-bucket", "ip1"), { ok: true });

  t += toEnd * 1000;
  assert.deepEqual(await limiter.hit("signup", "ip1"), { ok: true }, "the window has rolled over");
});

test("the IP limiter never takes the API down: a broken store means 'allowed'", async () => {
  const broken = { get: async () => { throw new Error("cache down"); }, put: async () => { throw new Error("cache down"); } };
  assert.deepEqual(await createIpLimiter({ store: broken }).hit("signup", "ip"), { ok: true });
});

test("memoryStore: counts, expires, and cannot grow without bound", async () => {
  const store = memoryStore(3);
  assert.equal(await store.get("a"), 0);
  await store.put("a", 2, 60);
  assert.equal(await store.get("a"), 2);
  await store.put("b", 1, 0);
  assert.equal(await store.get("b"), 0, "a zero ttl is already expired");
  await store.put("c", 1, 60);
  await store.put("d", 1, 60);
  await store.put("e", 1, 60);
  assert.ok((await store.get("e")) === 1);
});

test("cacheStore speaks the Cache API: a GET request as the key, a max-age response as the value", async () => {
  const kept = new Map();
  const cache = {
    match: async (request) => { const hit = kept.get(request.url); return hit ? new Response(hit.body) : undefined; },
    put: async (request, response) => { kept.set(request.url, { body: await response.text(), cc: response.headers.get("cache-control"), method: request.method }); },
  };
  const store = cacheStore(cache);
  assert.equal(await store.get("signup/h/1"), 0);
  await store.put("signup/h/1", 4, 120);
  assert.equal(await store.get("signup/h/1"), 4);
  const [entry] = [...kept.entries()];
  assert.match(entry[0], /^https:\/\/ratelimit\.floa\.internal\/roster\/signup\/h\/1$/);
  assert.deepEqual([entry[1].body, entry[1].cc, entry[1].method], ["4", "max-age=120", "GET"]);
  await store.put("x", 1, 0);
  assert.equal(kept.get("https://ratelimit.floa.internal/roster/x").cc, "max-age=1", "never a zero or negative max-age");
  kept.set("https://ratelimit.floa.internal/roster/junk", { body: "not a number" });
  assert.equal(await store.get("junk"), 0);
});

test("layeredStore: the highest count wins, writes go to every layer, a failing layer is ignored", async () => {
  const a = memoryStore();
  const b = memoryStore();
  const store = layeredStore(a, b);
  await a.put("k", 2, 60);
  await b.put("k", 5, 60);
  assert.equal(await store.get("k"), 5);
  await store.put("k", 6, 60);
  assert.deepEqual([await a.get("k"), await b.get("k")], [6, 6]);

  const dead = { get: async () => { throw new Error("x"); }, put: async () => { throw new Error("x"); } };
  const mixed = layeredStore(dead, a);
  assert.equal(await mixed.get("k"), 6);
  await mixed.put("k", 7, 60);
  assert.equal(await a.get("k"), 7);
});

test("on an address where the Cache API does nothing (workers.dev), the brake still works, per isolate", async () => {
  const original = globalThis.caches;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {} } };
  try {
    const net = fakeNet({ rpc: {
      roster_api_auth: () => ({ ok: true, kind: "public" }),
      roster_api_signup: () => ({ status: "ok", registered: false, participant_token: `pt_${"z".repeat(32)}` }),
      roster_events_claim: () => [], roster_events_done: () => null,
    } });
    const roster = createRoster({ fetch: net.fetch, sleep: async () => {} });
    const go = () => call(roster, req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" }, ip: "192.0.2.55" }), makeEnv());
    const statuses = [];
    for (let i = 0; i < 8; i++) statuses.push((await go()).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429, 429]);
  } finally {
    globalThis.caches = original;
  }
});

test("the shared mail tally: a run counts what is in flight or was logged after its claim began, and nothing that its counters already hold", () => {
  const shared = createMailTally();
  const held1 = [];
  const run1Since = shared.begin();
  const run1 = shared.view(run1Since, held1);
  run1.reserve("b1", "owner@x.co", "admin");
  run1.reserve("b1", "owner@x.co", "admin");
  assert.equal(run1.business("b1", "admin"), 2);
  assert.equal(run1.all("b1"), 2);

  /* a second run begins its claim while the first is still in flight: it counts both */
  const run2 = shared.view(shared.begin());
  assert.equal(run2.recipient("owner@x.co", "admin", "b1"), 2);
  assert.equal(run2.recipient("owner@x.co", "participant", "b1"), 0, "audiences are separate");
  assert.equal(run2.recipient("owner@x.co", "admin", "b2"), 0, "businesses are separate");

  /* the first run's report goes out: its mails are in the log from now on */
  shared.logged(held1);
  assert.equal(run1.business("b1", "admin"), 2, "the run that made them still counts them (its own counters are older)");
  assert.equal(run2.business("b1", "admin"), 2, "so does a run whose claim began before the report");

  /* a third run begins after the report: its counters already hold those mails */
  const run3 = shared.view(shared.begin());
  assert.equal(run3.business("b1", "admin"), 0);
  assert.equal(run3.all("b1"), 0);
});

test("the mail tally: a release gives the place back once, and the plain tally behaves as before", () => {
  const t = createMailTally();
  const give = t.reserve("b", "a@x.co", "participant");
  t.reserve("b", "a@x.co", "participant");
  assert.equal(t.recipient("a@x.co"), 2);
  give(); give();
  assert.equal(t.recipient("a@x.co"), 1);
  assert.equal(t.business("b"), 1);
  assert.equal(t.all("b"), 1);
});
