import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  deliverWebhook, MAX_ATTEMPTS, RETRY_DELAYS_SECONDS, retryDelayAfter, runWebhook, signWebhook, webhookBody, webhookWanted,
} from "../src/roster/webhook.js";
import { normalizeWork } from "../src/roster/work.js";
import { fakeNet } from "./roster-helpers.js";

const URL_OK = "https://hooks.example.com/roster";
const NOW = 1_800_000_000_000;

const item = (over = {}) => normalizeWork({
  event: { id: 41, type: "registration.created", attempts: 0, created_at: "2027-01-15T08:00:00Z",
    payload: { participant: { id: "p1", first_name: "דנה" }, meeting: { id: "m1", date: "2027-01-20" } }, ...over.event },
  business: { id: "b1", slug: "studio", name: "סטודיו",
    settings: { webhook_url: URL_OK, webhook_secret: "whsec_test", webhook_events: null, ...over.settings } },
}, () => NOW);

test("signWebhook: t=<unix>,v1=<hex hmac sha256 of t + '.' + body>", async () => {
  const sig = await signWebhook("s3cret", '{"a":1}', 1700000000);
  const expected = createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex");
  assert.equal(sig, `t=1700000000,v1=${expected}`);
});

test("the signature changes with the secret, the time and every byte of the body", async () => {
  const base = await signWebhook("k", "body", 1);
  assert.notEqual(base, await signWebhook("k2", "body", 1));
  assert.notEqual(base, await signWebhook("k", "body", 2));
  assert.notEqual(base, await signWebhook("k", "body ", 1));
  assert.equal(base, await signWebhook("k", "body", 1));
});

test("the body: id, type, created_at, business.slug, data", () => {
  const w = item();
  const body = JSON.parse(webhookBody(w));
  assert.deepEqual(Object.keys(body), ["id", "type", "created_at", "business", "data"]);
  assert.equal(body.id, "41");
  assert.equal(typeof body.id, "string");
  assert.equal(body.type, "registration.created");
  assert.equal(body.created_at, "2027-01-15T08:00:00.000Z");
  assert.deepEqual(body.business, { slug: "studio" });
  assert.equal(body.data.participant.first_name, "דנה");
});

test("a payload stored as the whole body still yields the right data", () => {
  const w = normalizeWork({
    event: { id: 1, type: "ping", payload: { id: "1", type: "ping", data: { note: "x" } } },
    business: { slug: "s", name: "n", settings: {} },
  });
  assert.deepEqual(w.event.data, { note: "x" });
});

test("deliverWebhook: the request carries the headers of the spec and a verifiable signature", async () => {
  const net = fakeNet({ webhook: () => ({ status: 200 }) });
  const body = webhookBody(item());
  const r = await deliverWebhook({ url: URL_OK, secret: "whsec_test", type: "registration.created", eventId: "41", body }, { fetch: net.fetch, now: () => NOW });
  assert.deepEqual(r, { status: "ok", http_status: 200, error: null });

  const [c] = net.webhooks();
  assert.equal(c.url, URL_OK);
  assert.equal(c.method, "POST");
  assert.equal(c.init.redirect, "manual");
  assert.ok(c.init.signal instanceof AbortSignal);
  assert.equal(c.headers["content-type"], "application/json");
  assert.equal(c.headers["x-roster-event"], "registration.created");
  assert.equal(c.headers["x-roster-delivery"], "41");
  assert.equal(c.raw, body);

  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(c.headers["x-roster-signature"]);
  assert.ok(m, c.headers["x-roster-signature"]);
  assert.equal(Number(m[1]), NOW / 1000);
  assert.equal(m[2], createHmac("sha256", "whsec_test").update(`${m[1]}.${c.raw}`).digest("hex"));
});

test("any 2xx is success, anything else is a failure with a coded error", async () => {
  const table = [[200, "ok", null], [201, "ok", null], [204, "ok", null], [299, "ok", null],
    [301, "failed", "redirect"], [302, "failed", "redirect"], [307, "failed", "redirect"], [399, "failed", "redirect"],
    [400, "failed", "http_400"], [404, "failed", "http_404"], [410, "failed", "http_410"], [500, "failed", "http_500"], [503, "failed", "http_503"]];
  for (const [code, status, error] of table) {
    const net = fakeNet({ webhook: () => new Response(null, { status: code, headers: code >= 300 && code < 400 ? { location: "https://elsewhere.example/" } : {} }) });
    const r = await deliverWebhook({ url: URL_OK, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch: net.fetch, now: () => NOW });
    assert.equal(r.status, status, String(code));
    assert.equal(r.error, error, String(code));
    assert.equal(r.http_status, code);
    assert.equal(net.webhooks().length, 1, "a redirect is never followed");
  }
});

test("an opaque redirect (status 0) counts as a redirect failure", async () => {
  const fetch = async () => ({ status: 0, type: "opaqueredirect", body: null });
  const r = await deliverWebhook({ url: URL_OK, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch, now: () => NOW });
  assert.deepEqual(r, { status: "failed", http_status: null, error: "redirect" });
});

test("a response that never comes is cut off by the timeout", async () => {
  let aborted = false;
  const fetch = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => { aborted = true; reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" })); });
  });
  const started = Date.now();
  const r = await deliverWebhook({ url: URL_OK, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch, timeoutMs: 40 });
  assert.equal(aborted, true);
  assert.deepEqual(r, { status: "failed", http_status: null, error: "timeout" });
  assert.ok(Date.now() - started < 2000);
});

test("the default timeout is 10 seconds", async () => {
  const realSet = globalThis.setTimeout;
  const delays = [];
  globalThis.setTimeout = (fn, ms, ...rest) => { delays.push(ms); return realSet(fn, ms, ...rest); };
  try {
    const net = fakeNet({ webhook: () => ({ status: 200 }) });
    await deliverWebhook({ url: URL_OK, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch: net.fetch });
  } finally {
    globalThis.setTimeout = realSet;
  }
  assert.ok(delays.includes(10_000), JSON.stringify(delays));
});

test("a network error is reported as a code, never as the exception text", async () => {
  const fetch = async () => { throw new TypeError("fetch failed: connect ECONNREFUSED 10.1.2.3:443"); };
  const r = await deliverWebhook({ url: URL_OK, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch });
  assert.deepEqual(r, { status: "failed", http_status: null, error: "network_error" });
  assert.ok(!JSON.stringify(r).includes("10.1.2.3"));
});

test("the URL is validated again at send time: nothing is fetched for a bad one", async () => {
  const net = fakeNet();
  for (const url of ["http://hooks.example.com/x", "https://127.0.0.1/x", "https://x.workers.dev/", "https://u:p@hooks.example.com/", "https://localhost/", null, ""]) {
    const r = await deliverWebhook({ url, secret: "k", type: "ping", eventId: "1", body: "{}" }, { fetch: net.fetch });
    assert.deepEqual(r, { status: "failed", http_status: null, error: "invalid_url" }, String(url));
  }
  assert.equal(net.calls.length, 0);
});

test("a webhook without a secret is never sent unsigned", async () => {
  const net = fakeNet();
  const r = await deliverWebhook({ url: URL_OK, secret: null, type: "ping", eventId: "1", body: "{}" }, { fetch: net.fetch });
  assert.deepEqual(r, { status: "failed", http_status: null, error: "no_secret" });
  assert.equal(net.calls.length, 0);
});

test("the retry schedule: +1 min, +5 min, +30 min, +2 h, +12 h, then failed", () => {
  assert.deepEqual([...RETRY_DELAYS_SECONDS], [60, 300, 1800, 7200, 43200]);
  assert.equal(MAX_ATTEMPTS, 6);
  assert.deepEqual([1, 2, 3, 4, 5].map(retryDelayAfter), [60, 300, 1800, 7200, 43200]);
  for (const n of [0, 6, 7, -1, 1.5, NaN, null, undefined, "1"]) assert.equal(retryDelayAfter(n), null, String(n));
});

test("webhookWanted: no URL, filters, and the test event", () => {
  const w = (webhook_url, webhook_events) => ({ webhook_url, webhook_events });
  assert.equal(webhookWanted(w(null, null), "registration.created"), false);
  assert.equal(webhookWanted(w(URL_OK, null), "registration.created"), true);
  assert.equal(webhookWanted(w(URL_OK, ["payment.recorded"]), "registration.created"), false);
  assert.equal(webhookWanted(w(URL_OK, ["payment.recorded"]), "payment.recorded"), true);
  assert.equal(webhookWanted(w(URL_OK, []), "registration.created"), false);
  assert.equal(webhookWanted(w(URL_OK, []), "ping"), true, "the test button always works");
  assert.equal(webhookWanted(w(null, null), "ping"), false);
});

test("webhookWanted: only the events of the public contract, whatever the filter says (participant.phone_conflict is for mail only)", () => {
  const w = (webhook_events) => ({ webhook_url: URL_OK, webhook_events });
  for (const type of ["participant.phone_conflict", "something.else", "", "registration.deleted"]) {
    assert.equal(webhookWanted(w(null), type), false, type);
    assert.equal(webhookWanted(w([type]), type), false, type);
  }
  for (const type of ["participant.created", "registration.created", "registration.cancelled", "payment.reported", "payment.recorded", "ping"]) {
    assert.equal(webhookWanted(w(null), type), true, type);
  }
});

test("runWebhook: attempt numbers and what is reported at each stage of the schedule", async () => {
  const net = fakeNet({ webhook: () => ({ status: 500 }) });
  const deps = { fetch: net.fetch, now: () => NOW };

  const seen = [];
  for (let attempts = 0; attempts <= 5; attempts++) {
    const r = await runWebhook(item({ event: { attempts } }), deps);
    seen.push([r.attempt, r.status, r.error, r.retry_in_seconds]);
  }
  assert.deepEqual(seen, [
    [1, "failed", "http_500", 60],
    [2, "failed", "http_500", 300],
    [3, "failed", "http_500", 1800],
    [4, "failed", "http_500", 7200],
    [5, "failed", "http_500", 43200],
    [6, "failed", "http_500", null],
  ]);

  /* past the schedule nothing is sent at all */
  const before = net.webhooks().length;
  const last = await runWebhook(item({ event: { attempts: 6 } }), deps);
  assert.deepEqual([last.status, last.error, last.retry_in_seconds, last.attempt], ["failed", "max_attempts", null, 7]);
  assert.equal(net.webhooks().length, before);
});

test("runWebhook: success has no retry, no webhook configured is null", async () => {
  const net = fakeNet({ webhook: () => ({ status: 200 }) });
  const ok = await runWebhook(item(), { fetch: net.fetch, now: () => NOW });
  assert.equal(ok.status, "ok");
  assert.equal(ok.retry_in_seconds, null);
  assert.equal(ok.attempt, 1);
  assert.equal(typeof ok.duration_ms, "number");

  assert.equal(await runWebhook(item({ settings: { webhook_url: null } }), { fetch: net.fetch }), null);
  assert.equal(await runWebhook(item({ settings: { webhook_events: ["payment.recorded"] } }), { fetch: net.fetch }), null);
});
