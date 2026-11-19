import test from "node:test";
import assert from "node:assert/strict";
import { handleRosterWa, isRosterWaPath } from "../src/roster-wa.js";

const env = { SUPABASE_URL: "https://sb.example", SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_KEY: "svc", ROSTER_GOOGLE_CLIENT_IDS: "cid" };
const tok = "t".repeat(120);
const O = "https://harpatka.co.il";
const req = (path, o = {}) => new Request("https://api.example" + path, { method: o.method || "GET", headers: { origin: o.origin ?? O, authorization: "Bearer " + (o.token ?? tok), "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined });
const net = (email = "ofir.aviram@gmail.com", calls = []) => async (url, init) => {
  const u = String(url); calls.push({ u, init });
  if (u.includes("/auth/v1/user")) return email ? new Response(JSON.stringify({ email, email_confirmed_at: "x" })) : new Response("{}", { status: 401 });
  if (u.includes("tokeninfo")) return new Response("{}", { status: 400 });
  if (u.includes("wa_list")) return new Response(JSON.stringify({ message: "m", items: [{ id: "1", name: "a", phone: "+972", attended: 2, sent_at: null, no_more: false }] }));
  if (u.includes("wa_mark")) return new Response(JSON.stringify({ id: "x", sent_at: "now", no_more: false }));
  if (u.includes("wa_message")) return new Response(JSON.stringify({ message: "hi" }));
  return new Response("{}", { status: 404 });
};
const ID = "11111111-1111-1111-1111-111111111111";

test("paths", () => { assert.equal(isRosterWaPath("/roster-wa/list"), true); assert.equal(isRosterWaPath("/roster-wa/x"), false); });
test("list for the allowed person, fixed business, service key only on the server side", async () => {
  const calls = []; const r = await handleRosterWa(req("/roster-wa/list"), env, net(undefined, calls));
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.items[0].attended, 2);
  assert.equal(r.headers.get("access-control-allow-origin"), O);
  const rpc = calls.find((c) => c.u.includes("wa_list")); assert.deepEqual(JSON.parse(rpc.init.body), { p_slug: "harpatka" });
});
test("another person, bad origin, no token: refused and the database is not reached", async () => {
  for (const [rq, e, st] of [[req("/roster-wa/list"), "other@x.com", 403], [req("/roster-wa/list", { origin: "https://evil.example" }), undefined, 403], [req("/roster-wa/list", { token: "short" }), undefined, 401], [req("/roster-wa/list"), "", 401]]) {
    const calls = []; const r = await handleRosterWa(rq, env, net(e, calls));
    assert.equal(r.status, st); assert.ok(!calls.some((c) => c.u.includes("/rpc/")));
  }
});
test("mark and message validate their input", async () => {
  assert.equal((await handleRosterWa(req("/roster-wa/mark", { method: "POST", body: { id: ID, no_more: true } }), env, net())).status, 200);
  assert.equal((await handleRosterWa(req("/roster-wa/mark", { method: "POST", body: { id: "x", sent: true } }), env, net())).status, 400);
  assert.equal((await handleRosterWa(req("/roster-wa/mark", { method: "POST", body: { id: ID } }), env, net())).status, 400);
  assert.equal((await handleRosterWa(req("/roster-wa/message", { method: "POST", body: { message: "hi" } }), env, net())).status, 200);
  assert.equal((await handleRosterWa(req("/roster-wa/message", { method: "POST", body: { message: 5 } }), env, net())).status, 400);
});
