/* Shared by the roster-*.test.js files (not a test itself: no `.test.` in the
   name, so `node --test "worker/test/roster-*.test.js"` does not run it).

   fakeNet() stands in for every host the roster Worker talks to, recording each
   request: the database (rest/v1/rpc/<name>), Resend, and a customer's webhook.
   Nothing here touches a network. */
import { createRoster } from "../src/roster/routes.js";
import { memoryStore, createIpLimiter } from "../src/roster/limits.js";

export const DB = "https://db.test";
export const SERVICE_KEY = "service-role-key-for-tests";
export const PUB = `rk_pub_${"A1".repeat(16)}`;
export const SEC = `rk_sec_${"B2".repeat(20)}`;
export const TOKEN = `pt_${"c3".repeat(16)}`;
export const UUID_A = "11111111-1111-4111-8111-111111111111";
export const UUID_B = "22222222-2222-4222-8222-222222222222";
export const UUID_C = "33333333-3333-4333-8333-333333333333";

export const makeEnv = (extra = {}) => ({
  SUPABASE_URL: DB,
  SUPABASE_SERVICE_KEY: SERVICE_KEY,
  RESEND_API_KEY: "re_test_key",
  ROSTER_IP_SALT: "test-salt-for-the-address-hash",
  ...extra,
});

/* A handler answers with a Response, with an HTTP wrapper ({status: <number>, body, text}
   and nothing else), or with the plain JSON body (which may itself have a string `status`,
   like {"status":"ok"}: that is a body, not a wrapper). */
const isWrapper = (r) =>
  r !== null && typeof r === "object" && !Array.isArray(r)
  && Object.keys(r).length > 0
  && Object.keys(r).every((k) => k === "status" || k === "body" || k === "text")
  && typeof r.status !== "string";

const reply = (r) => {
  if (r instanceof Response) return r;
  const { status = 200, body = null, text } = isWrapper(r) ? r : { body: r };
  return new Response(text !== undefined ? text : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
};

/* handlers: {
     rpc:     { <function name>: (args, call) => body | {status, body, text} | Response },
     resend:  (payload, call) => same,
     webhook: (call) => same   (any other host)
   }
   A function without a handler answers 500 so a test notices an unexpected call. */
export function fakeNet(handlers = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const call = { url: String(url), host: u.host, path: u.pathname, method: init.method || "GET", headers: Object.fromEntries(new Headers(init.headers || {})), init, raw: init.body ?? null };
    try { call.json = init.body ? JSON.parse(init.body) : null; } catch { call.json = null; }
    calls.push(call);

    if (init.signal?.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });

    if (u.host === new URL(DB).host) {
      const name = u.pathname.replace("/rest/v1/rpc/", "");
      const handler = handlers.rpc?.[name];
      if (!handler) return reply({ status: 500, body: { message: "no handler" } });
      return reply(await handler(call.json, call));
    }
    if (u.host === "api.resend.com") {
      return reply(handlers.resend ? await handlers.resend(call.json, call) : { body: { id: "msg_1" } });
    }
    return reply(handlers.webhook ? await handlers.webhook(call) : { status: 200, body: {} });
  };
  return {
    fetch,
    calls,
    rpc: (name) => calls.filter((c) => c.host === new URL(DB).host && c.path === `/rest/v1/rpc/${name}`),
    resend: () => calls.filter((c) => c.host === "api.resend.com"),
    webhooks: () => calls.filter((c) => c.host !== new URL(DB).host && c.host !== "api.resend.com"),
  };
}

/* a Roster instance wired to a fake net, a memory IP store and no sleeping */
export function makeRoster(net, extra = {}) {
  const now = extra.now || (() => 1_800_000_000_000);
  const store = memoryStore();
  return createRoster({
    fetch: net.fetch,
    now,
    sleep: async () => {},
    limiter: createIpLimiter({ store, now }),
    ...extra,
  });
}

export const ctxSpy = () => {
  const pending = [];
  return { waitUntil: (p) => pending.push(p), settle: () => Promise.all(pending), pending };
};

/* a request to the API. `key` is sent as a Bearer; json is stringified. */
export function req(path, { method = "GET", key, origin, ip = "203.0.113.7", json, body, headers = {}, contentType = "application/json" } = {}) {
  const h = { ...headers };
  if (key) h.authorization = `Bearer ${key}`;
  if (origin !== undefined) h.origin = origin;
  if (ip) h["cf-connecting-ip"] = ip;
  const init = { method, headers: h };
  if (json !== undefined || body !== undefined) {
    h["content-type"] = contentType;
    init.body = body !== undefined ? body : JSON.stringify(json);
  }
  return new Request(`https://worker.test/roster/v1${path}`, init);
}

export async function call(roster, request, env = makeEnv(), ctx = ctxSpy()) {
  const res = await roster.handle(request, env, ctx);
  const raw = await res.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { res, status: res.status, body, raw, headers: res.headers, ctx };
}

/* the two database answers every authenticated route needs */
export const authOk = (kind) => () => ({ ok: true, kind });
