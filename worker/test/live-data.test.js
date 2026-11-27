/* The live relay, phase 2 (worker/LIVE.md, "Data changes through the relay", tests 7 to 10): chg, /live/notify, reauth, the home room. */
import test from "node:test";
import assert from "node:assert/strict";
import { handleLive } from "../src/live/routes.js";
import { LiveRoom } from "../src/live/room.js";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
const SECRET = "s3cret-s3cret-s3cret-s3cret-s3cret";

class FakeSocket {
  constructor() { this.sent = []; this.att = null; this.closed = 0; }
  serializeAttachment(a) { this.att = JSON.stringify(a); }
  deserializeAttachment() { return this.att ? JSON.parse(this.att) : null; }
  send(s) { if (this.closed) throw new Error("closed"); this.sent.push(s); }
  close(code) { if (!this.closed) this.closed = code || 1000; }
  got(t) { return this.sent.map((s) => JSON.parse(s)).filter((m) => !t || m.t === t); }
}
globalThis.WebSocketPair = function () { this[0] = new FakeSocket(); this[1] = new FakeSocket(); };
const RealResponse = globalThis.Response;
class FakeState {
  constructor() {
    this.list = []; this.touched = 0;
    const self = this;
    this.storage = new Proxy({}, { get() { self.touched++; return () => Promise.resolve(); } });
  }
  acceptWebSocket(ws) { this.list.push(ws); }
  getWebSockets() { return this.list.filter((ws) => !ws.closed); }
  setWebSocketAutoResponse() {}
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (sub) => b64u({ alg: "HS256" }) + "." + b64u({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }) + ".sig";
const NAMES = { "u-dana": "Dana Cohen", "u-ofir": "Ofir Aviram" };
let allowed = true;
globalThis.fetch = async (url, init) => {
  const t = ((init && init.headers && init.headers.authorization) || "").slice(7);
  if (String(url).endsWith("/auth/v1/user")) {
    const sub = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub;
    return { status: 200, ok: true, json: async () => ({ id: sub, user_metadata: { full_name: NAMES[sub] } }) };
  }
  if (String(url).endsWith("/rest/v1/rpc/can_view") || String(url).endsWith("/rest/v1/rpc/is_allowed")) return { status: 200, ok: true, json: async () => allowed };
  throw new Error("unexpected fetch " + url);
};
async function connect(room, id = ID) {
  globalThis.Response = class { constructor(_b, init) { this.status = init.status; this.webSocket = init.webSocket; } };
  try {
    const before = room.state.list.length;
    const res = await room.fetch(new Request("https://api.floa.co.il/live/biodanza/" + id, { headers: { upgrade: "websocket" } }));
    assert.equal(res.status, 101);
    return room.state.list[before];
  } finally { globalThis.Response = RealResponse; }
}
const say = (room, ws, m) => room.webSocketMessage(ws, typeof m === "string" ? m : JSON.stringify(m));
async function authed(room, sub, tab, id) {
  const ws = await connect(room, id);
  await say(room, ws, { t: "auth", k: tok(sub), s: tab });
  assert.equal(ws.got("ok").length, 1, "ok for " + sub);
  return ws;
}
/* an env whose LIVE binding hands every room name to its own LiveRoom */
function liveEnv(rooms) {
  return { ...ENV, LIVE_NOTIFY_SECRET: SECRET, LIVE: { idFromName: (n) => n, get: (n) => ({ fetch: (url, init) => rooms[n].fetch(new Request(url, init)) }) } };
}
const notify = (env, body, secret = SECRET) => handleLive(new Request("https://api.floa.co.il/live/notify", { method: "POST", headers: { "x-live-secret": secret }, body: JSON.stringify(body) }), env);
const CHG = { t: "chg", tb: "vivencia_items", o: "u", kc: "id", c: [["9f8fad5b-d9cb-469f-a165-70867728950e", 7]] };

test("7. /live/notify: wrong secret 401; a room with no sockets 204 and storage never touched; two sockets get the same chg string", async () => {
  const empty = new LiveRoom(new FakeState(), ENV), busy = new LiveRoom(new FakeState(), ENV);
  const env = liveEnv({ ["biodanza:" + ID]: busy, "biodanza:home": empty });
  const body = { a: "biodanza", t: "vivencia_items", o: "u", kc: "id", r: { [ID]: CHG.c } };
  assert.equal((await notify(env, body, "wrong")).status, 401);
  assert.equal((await notify(env, body, "")).status, 401);
  assert.equal((await notify({ ...env, LIVE_NOTIFY_SECRET: "" }, body)).status, 503);
  assert.equal((await notify(env, { ...body, a: "nope" })).status, 400);
  const r0 = await notify(env, { ...body, r: { home: "*" } });
  assert.equal(r0.status, 204);
  assert.equal(empty.state.touched, 0, "an empty room touched storage");
  const a = await authed(busy, "u-dana", "tabA"), b = await authed(busy, "u-ofir", "tabB");
  assert.equal((await notify(env, body)).status, 204);
  assert.equal(a.sent[a.sent.length - 1], b.sent[b.sent.length - 1], "the same string");
  assert.deepEqual(a.got("chg"), [{ t: "chg", tb: "vivencia_items", o: "u", kc: "id", c: CHG.c }]);
  assert.equal(busy.state.touched, 0);
});

test("8. a client chg reaches the other socket stamped with u/s, not the sender; 51 entries or a bad tb is dropped", async () => {
  const room = new LiveRoom(new FakeState(), ENV);
  const a = await authed(room, "u-dana", "tabA"), b = await authed(room, "u-ofir", "tabB");
  await say(room, a, { ...CHG, u: "u-evil", s: "forged" });
  assert.equal(a.got("chg").length, 0);
  const m = b.got("chg")[0];
  assert.equal(m.u, "u-dana"); assert.equal(m.s, "tabA"); assert.deepEqual(m.c, CHG.c);
  await say(room, a, { ...CHG, c: Array.from({ length: 51 }, (_, i) => ["k" + i]) });
  await say(room, a, { ...CHG, tb: "Vivencias; drop" });
  await say(room, a, { ...CHG, kc: undefined });
  assert.equal(b.got("chg").length, 1, "an invalid chg was relayed");
});

test("9. x in a notify sends reauth; a socket that does not auth again within 10s is closed 4001 at the next handled message", async () => {
  const room = new LiveRoom(new FakeState(), ENV);
  const env = liveEnv({ ["biodanza:" + ID]: room });
  const a = await authed(room, "u-dana", "tabA"), b = await authed(room, "u-ofir", "tabB");
  assert.equal((await notify(env, { a: "biodanza", t: "vivencia_shares", o: "d", kc: "vivencia_id", x: true, r: { [ID]: [[ID]] } })).status, 204);
  assert.equal(a.got("reauth").length, 1); assert.equal(b.got("reauth").length, 1);
  await say(room, b, { t: "auth", k: tok("u-ofir"), s: "tabB" });   /* b answers at once */
  const realNow = Date.now;
  Date.now = () => realNow() + 11000;
  try {
    await say(room, a, CHG);
    assert.equal(a.closed, 4001, "a did not re-auth");
    await say(room, b, CHG);
    assert.equal(b.closed, 0, "b did");
  } finally { Date.now = realNow; }
  /* the re-check itself: access gone -> 4003 */
  allowed = false;
  const c = await authed(new LiveRoom(new FakeState(), ENV), "u-dana", "tabC").catch(() => null);
  assert.equal(c, null);
  allowed = true;
});

test("10. in the home room a txt is dropped and a chg is relayed", async () => {
  const room = new LiveRoom(new FakeState(), ENV);
  const a = await authed(room, "u-dana", "tabA", "home"), b = await authed(room, "u-ofir", "tabB", "home");
  await say(room, a, { t: "txt", q: 1, i: "x", f: "body", v: "hello", r: null, a: 0, b: 0 });
  await say(room, a, { t: "cur", i: "x", f: "body", a: 1, b: 1 });
  assert.equal(b.got("txt").length + b.got("cur").length, 0);
  await say(room, a, { ...CHG, tb: "vivencias", c: "*", kc: undefined });
  assert.deepEqual(b.got("chg").map((m) => m.tb), ["vivencias"]);
});
