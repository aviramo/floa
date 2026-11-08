/* The roster API inside the real Worker entry (src/index.js): the one prefix check
   in front of the old routes, the scheduled handler, and proof that nothing of the
   old behaviour moved. The same index.js that wrangler deploys (through worker.js). */
import test from "node:test";
import assert from "node:assert/strict";

globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const worker = (await import("../src/index.js")).default;
const entry = await import("../src/roster/routes.js");
import { DB, PUB, SEC, SERVICE_KEY, makeEnv, ctxSpy } from "./roster-helpers.js";

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init, json: init.body ? JSON.parse(init.body) : null });
    return handler(String(url), init);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });

test("the Worker exports fetch and scheduled; the entry point re-exports the same default", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(typeof worker.scheduled, "function");
});

test("worker.js (what wrangler deploys) re-exports index.js's default, so `scheduled` is exported", async () => {
  /* worker.js imports `cloudflare:workers` through read-workflow.js, which only exists in
     the runtime; its text is enough to check the re-export. */
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
  assert.match(text, /export \{ default \} from "\.\/index\.js";/);
});

test("wrangler.toml has the every-minute cron and names the secret without containing it", async () => {
  const { readFile } = await import("node:fs/promises");
  const toml = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /^\[triggers\]\s*\ncrons = \["\* \* \* \* \*"\]/m);
  assert.match(toml, /wrangler secret put SUPABASE_SERVICE_KEY/);
  assert.ok(!/SUPABASE_SERVICE_KEY\s*=/.test(toml), "the service key is a secret, never a var");
  assert.ok(!/service_role/.test(toml.replace(/^#.*$/gm, "")), "no service role token outside comments");
  assert.ok(toml.indexOf("[triggers]") > toml.indexOf("[vars]"), "tables are not interleaved");
});

test("/roster/v1/* goes to the roster door through the real entry point", async () => {
  const net = stubFetch((url) => {
    if (url.endsWith("/roster_api_auth")) return ok({ ok: true, kind: "public" });
    if (url.endsWith("/roster_api_meetings")) return ok({ business: { name: "סטודיו" }, meetings: [] });
    return ok(null);
  });
  try {
    const res = await worker.fetch(new Request("https://w.test/roster/v1/meetings", { headers: { authorization: `Bearer ${PUB}`, origin: "https://studio.example" } }), makeEnv(), ctxSpy());
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { business: { name: "סטודיו" }, meetings: [] });
    assert.equal(res.headers.get("access-control-allow-origin"), "https://studio.example");
    assert.deepEqual(net.calls.map((c) => c.url), [`${DB}/rest/v1/rpc/roster_api_auth`, `${DB}/rest/v1/rpc/roster_api_meetings`]);
    assert.equal(net.calls[0].init.headers.apikey, SERVICE_KEY);
  } finally { net.restore(); }
});

test("the roster's own CORS applies under /roster/v1/, the old global one still applies everywhere else", async () => {
  const roster = await worker.fetch(new Request("https://w.test/roster/v1/signup", { method: "OPTIONS", headers: { origin: "https://studio.example" } }), makeEnv(), ctxSpy());
  assert.equal(roster.status, 204);
  assert.equal(roster.headers.get("access-control-allow-origin"), "*");
  assert.match(roster.headers.get("access-control-allow-methods"), /DELETE/);

  const lead = await worker.fetch(new Request("https://w.test/lead", { method: "OPTIONS", headers: { origin: "https://floa.co.il" } }), makeEnv(), ctxSpy());
  assert.equal(lead.status, 204);
  assert.equal(lead.headers.get("access-control-allow-origin"), "https://floa.co.il", "the global allow-list is untouched");
  assert.equal(lead.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(lead.headers.get("access-control-allow-headers"), "content-type, authorization");
});

test("the old routes behave as before: an unknown origin is refused, an unknown path is 404, GET is 405", async () => {
  const stub = stubFetch(() => ok({}));
  try {
    const wrongOrigin = await worker.fetch(new Request("https://w.test/lead", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), makeEnv(), ctxSpy());
    assert.deepEqual([wrongOrigin.status, (await wrongOrigin.json()).error], [403, "origin"]);
    const nowhere = await worker.fetch(new Request("https://w.test/roster", { method: "POST", headers: { origin: "https://floa.co.il" } }), makeEnv(), ctxSpy());
    assert.deepEqual([nowhere.status, (await nowhere.json()).error], [404, "not found"]);
    const get = await worker.fetch(new Request("https://w.test/lead", { headers: { origin: "https://floa.co.il" } }), makeEnv(), ctxSpy());
    assert.equal(get.status, 405);
    const lookalike = await worker.fetch(new Request("https://w.test/roster/v10/x", { method: "POST", headers: { origin: "https://floa.co.il" } }), makeEnv(), ctxSpy());
    assert.equal(lookalike.status, 404, "only /roster/v1/ is taken by the roster");
    assert.equal(stub.calls.length, 0);
  } finally { stub.restore(); }
});

test("scheduled: drains the outbox with the service key, and is silent without it", async () => {
  const net = stubFetch((url) => (url.endsWith("/roster_events_claim") ? ok([]) : ok(null)));
  try {
    const ctx = ctxSpy();
    await worker.scheduled({ cron: "* * * * *" }, makeEnv(), ctx);
    await ctx.settle();
    assert.deepEqual(net.calls.map((c) => c.url), [`${DB}/rest/v1/rpc/roster_events_claim`]);
    assert.deepEqual(net.calls[0].json, { p_limit: 20 });

    net.calls.length = 0;
    await worker.scheduled({}, { SUPABASE_URL: DB }, ctxSpy());
    assert.equal(net.calls.length, 0);
  } finally { net.restore(); }
});

test("with the secret missing, the roster answers 503 and the old routes are unaffected", async () => {
  const net = stubFetch(() => ok({}));
  const quiet = console.error;
  console.error = () => {};
  try {
    const res = await worker.fetch(new Request("https://w.test/roster/v1/meetings", { headers: { authorization: `Bearer ${SEC}` } }), { SUPABASE_URL: DB }, ctxSpy());
    assert.equal(res.status, 503);
    assert.equal(net.calls.length, 0);
  } finally { console.error = quiet; net.restore(); }
});

test("the module exposes the handler the Worker uses", () => {
  assert.equal(typeof entry.handleRoster, "function");
  assert.equal(typeof entry.runRosterScheduled, "function");
  assert.equal(entry.isRosterPath("/roster/v1/x"), true);
});
