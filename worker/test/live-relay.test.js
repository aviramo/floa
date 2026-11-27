/* The live relay (worker/LIVE.md, "Tests"): one targeted check each, plain node, a fake `state` and fake sockets. */
import test from "node:test";
import assert from "node:assert/strict";
import { handleLive, isLivePath } from "../src/live/routes.js";
import { LiveRoom } from "../src/live/room.js";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };

/* ---------- fakes: a hibernatable socket, the pair, the state, the 101 answer ---------- */
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
  constructor() { this.list = []; }
  acceptWebSocket(ws) { this.list.push(ws); }
  getWebSockets() { return this.list.filter((ws) => !ws.closed); }
  setWebSocketAutoResponse() {}
}
/* a token whose payload names the user; "bad" is refused by /auth/v1/user; can_view says `allowed` */
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tok = (sub) => b64u({ alg: "HS256" }) + "." + b64u({ sub, exp: Math.floor(Date.now() / 1000) + 3600 }) + ".sig";
const NAMES = { "u-dana": "Dana Cohen", "u-ofir": "Ofir Aviram" };
function supabase(allowed = true) {
  globalThis.fetch = async (url, init) => {
    const auth = (init && init.headers && init.headers.authorization) || "";
    const t = auth.slice(7);
    if (String(url).endsWith("/auth/v1/user")) {
      if (t === "bad") return { status: 401, ok: false, json: async () => ({}) };
      const sub = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString()).sub;
      return { status: 200, ok: true, json: async () => ({ id: sub, email: sub + "@example.com", user_metadata: { full_name: NAMES[sub] } }) };
    }
    if (String(url).endsWith("/rest/v1/rpc/can_view")) {
      assert.equal(init.headers["accept-profile"], "biodanza");
      assert.deepEqual(JSON.parse(init.body), { v: ID });
      return { status: 200, ok: true, json: async () => allowed };
    }
    throw new Error("unexpected fetch " + url);
  };
}
async function connect(room, path = "/live/biodanza/" + ID) {
  globalThis.Response = class { constructor(_b, init) { this.status = init.status; this.webSocket = init.webSocket; } };
  try {
    const before = room.state.list.length;
    const res = await room.fetch(new Request("https://api.floa.co.il" + path, { headers: { upgrade: "websocket" } }));
    assert.equal(res.status, 101);
    return room.state.list[before];   /* the server end */
  } finally { globalThis.Response = RealResponse; }
}
const say = (room, ws, m) => room.webSocketMessage(ws, typeof m === "string" ? m : JSON.stringify(m));
async function authed(room, sub, tab) {
  const ws = await connect(room);
  await say(room, ws, { t: "auth", k: tok(sub), s: tab });
  assert.equal(ws.got("ok").length, 1, "ok for " + sub);
  return ws;
}
const newRoom = () => new LiveRoom(new FakeState(), ENV);
const TXT = { t: "txt", q: 2, bq: 1, i: "item-1", f: "body", p: 5, d: 0, x: "abc", r: 3, a: 8, b: 8 };

test("1. the door: origin not allowed 403; unknown app or bad id 404; no upgrade 426", async () => {
  const env = { LIVE: { idFromName: (n) => n, get: () => ({ fetch: async () => new RealResponse("room", { status: 200 }) }) } };
  const req = (path, h) => new Request("https://api.floa.co.il" + path, { headers: h });
  const up = { upgrade: "websocket", origin: "https://biodanza.floa.co.il" };
  assert.ok(isLivePath("/live/biodanza/" + ID) && !isLivePath("/lead") && !isLivePath("/roster/v1/x"));
  assert.equal((await handleLive(req("/live/biodanza/" + ID, { ...up, origin: "https://evil.example" }), env)).status, 403);
  assert.equal((await handleLive(req("/live/biodanza/" + ID, { upgrade: "websocket" }), env)).status, 403);
  assert.equal((await handleLive(req("/live/nope/" + ID, up), env)).status, 404);
  assert.equal((await handleLive(req("/live/biodanza/not-a-uuid", up), env)).status, 404);
  assert.equal((await handleLive(req("/live/biodanza/" + ID + "/x", up), env)).status, 404);
  assert.equal((await handleLive(req("/live/biodanza/" + ID, { origin: up.origin }), env)).status, 426);
  assert.equal((await handleLive(req("/live/biodanza/" + ID, up), env)).status, 200);
  assert.equal((await handleLive(req("/live/biodanza/" + ID, { ...up, origin: "http://localhost:5173" }), env)).status, 200);
  assert.equal((await handleLive(req("/live/biodanza/" + ID, { ...up, origin: "https://floa.co.il" }), env)).status, 200);
});

test("2. nothing before auth is relayed; a bad token closes 4001; can_view false closes 4003", async () => {
  supabase(true);
  const room = newRoom();
  const a = await authed(room, "u-dana", "tabA");
  const b = await connect(room);
  await say(room, b, TXT);
  assert.equal(a.got("txt").length, 0, "a message before auth reached the room");
  await say(room, b, { t: "auth", k: "bad", s: "tabB" });
  assert.equal(b.closed, 4001);
  supabase(false);
  const c = await connect(room);
  await say(room, c, { t: "auth", k: tok("u-ofir"), s: "tabC" });
  assert.equal(c.closed, 4003);
  assert.equal(a.got("join").length, 0, "no join for a refused socket");
});

test("3. txt reaches the other socket, not the sender, stamped with the verified user even when the client sent other u/n/g", async () => {
  supabase(true);
  const room = newRoom();
  const a = await authed(room, "u-dana", "tabA");
  const b = await authed(room, "u-ofir", "tabB");
  assert.deepEqual(a.got("join")[0], { t: "join", u: "u-ofir", n: "Ofir", g: "A" });
  assert.deepEqual(b.got("ok")[0].peers, [{ u: "u-dana", n: "Dana", g: "C" }]);
  await say(room, a, { ...TXT, u: "u-evil", n: "Evil", g: "E", email: "x@y.z" });
  assert.equal(a.got("txt").length, 0, "echoed back to the sender");
  const m = b.got("txt")[0];
  assert.equal(m.u, "u-dana"); assert.equal(m.n, "Dana"); assert.equal(m.g, "C");
  assert.equal(m.email, undefined);
});

test("4. over the bucket: dropped; more than 200 drops: 4008. A 65 KB frame: 4009", async () => {
  supabase(true);
  const room = newRoom();
  const a = await authed(room, "u-dana", "tabA");
  const b = await authed(room, "u-ofir", "tabB");
  for (let i = 0; i < 40; i++) await say(room, a, { ...TXT, q: 10 + i });
  const got = b.got("txt").length;
  assert.ok(got >= 24 && got < 30, "the burst passes, the rest is dropped: " + got);
  for (let i = 0; i < 200 && !a.closed; i++) await say(room, a, { ...TXT, q: 100 + i });
  assert.equal(a.closed, 4008);
  await say(room, b, "x".repeat(65 * 1024));
  assert.equal(b.closed, 4009);
});

test("5. the last socket of a person closing sends leave", async () => {
  supabase(true);
  const room = newRoom();
  const a = await authed(room, "u-dana", "tabA");
  const b1 = await authed(room, "u-ofir", "tabB1");
  const b2 = await authed(room, "u-ofir", "tabB2");
  assert.equal(a.got("join").length, 1, "one join per person");
  b1.closed = 1000; await room.webSocketClose(b1, 1000, "", true);
  assert.equal(a.got("leave").length, 0, "the person still has a tab here");
  b2.closed = 1000; await room.webSocketClose(b2, 1000, "", true);
  assert.deepEqual(a.got("leave"), [{ t: "leave", u: "u-ofir" }]);
});

test("6. rs reaches only the tab it names; a txt change goes out with the sender's s from the socket", async () => {
  supabase(true);
  const room = newRoom();
  const a = await authed(room, "u-dana", "tabA");
  const b = await authed(room, "u-ofir", "tabB");
  const c = await authed(room, "u-ofir", "tabC");
  await say(room, a, { t: "rs", to: "tabB", i: "item-1", f: "body" });
  assert.deepEqual(b.got("rs"), [{ t: "rs", u: "u-dana", s: "tabA", i: "item-1", f: "body" }]);
  assert.equal(c.got("rs").length, 0);
  await say(room, b, { ...TXT, s: "forged" });
  const m = a.got("txt")[0];
  assert.equal(m.s, "tabB");
  assert.deepEqual({ q: m.q, bq: m.bq, i: m.i, f: m.f, p: m.p, d: m.d, x: m.x, r: m.r, a: m.a, b: m.b }, { q: 2, bq: 1, i: "item-1", f: "body", p: 5, d: 0, x: "abc", r: 3, a: 8, b: 8 });
  assert.equal(m.v, undefined);
  assert.equal(c.got("txt").length, 1, "the same person's other tab gets the words");
});
