/* The live relay's room: one Durable Object per `<app>:<id>` (worker/LIVE.md).

   It carries the peer traffic of a co-edited field (live typing `txt`, carets `cur`,
   resync requests `rs`) and presence (`join` / `leave`) between the tabs in one room.
   It stores NOTHING: no text, no caret, no presence, no row, not even an alarm. All
   per socket state lives in the socket's attachment, which survives hibernation.

   A PLAIN class (constructor(state, env)), not `extends DurableObject`: it does not
   import `cloudflare:workers`, so plain node can load and test it (worker/test/live-*).

   Economy (the owner, 2026-11-26): the WebSocket Hibernation API (never server.accept(),
   which bills duration while the socket is open), ping/pong answered without waking the
   room, auth checked on connect and on token refresh only, a relayed message
   serialized once and the same string sent to every other socket. */
import { kindOf, roomOf, ROOMS } from "./rooms.js";

const ROOM_MAX = 50, PERSON_MAX = 10;
const AUTH_WAIT = 10000, EXP_GRACE = 60;
const RATE = 12, BURST = 24, DROP_WINDOW = 10000, DROP_MAX = 200;
const FRAME_MAX = 65536, TEXT_MAX = 20000, POS_MAX = 20000, KEY_MAX = 64, TAB_MAX = 32;

function isInt(v, lo, hi) { return Number.isInteger(v) && v >= lo && v <= hi; }
function isStr(v, max) { return typeof v === "string" && v.length <= max; }
function isItem(v) { return isStr(v, KEY_MAX) || (typeof v === "number" && Number.isFinite(v) && String(v).length <= KEY_MAX); }
function utf8Len(s) {
  if (s.length * 3 <= FRAME_MAX) return s.length;   /* cannot be over the limit: no need to count */
  return new TextEncoder().encode(s).length;
}
/* exactly firstName() in ui/live.js: the first word of the name, and the first letter of the second */
function nameParts(user) {
  const m = (user && user.user_metadata) || {};
  const w = String(m.full_name || m.name || "").trim().split(/\s+/).filter(Boolean);
  return { n: w[0] || "", g: w[1] ? w[1].charAt(0) : "" };
}
/* `exp` of a token Supabase has just accepted: unverified decoding is fine, it is only a timer */
function jwtExp(token) {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(part + "===".slice((part.length + 3) % 4))).exp;
    return Number.isFinite(exp) ? exp : 0;
  } catch { return 0; }
}

/* the person behind the token, and the room's permission question asked with that same token. Network, so only on connect and refresh.
   -> { u, n, g, exp } or { code } (4001: no such session; 4003: not allowed here; 1011: Supabase or config trouble, the kit retries) */
export async function verify(env, spec, id, token) {
  const home = id === "home";
  if (!env || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return { code: 1011 };
  if (typeof token !== "string" || !token || token.length > 8192) return { code: 4001 };
  const base = { apikey: env.SUPABASE_ANON_KEY, authorization: "Bearer " + token };
  let user;
  try {
    const res = await fetch(env.SUPABASE_URL + "/auth/v1/user", { headers: base });
    if (res.status >= 500) return { code: 1011 };
    if (res.status !== 200) return { code: 4001 };
    user = await res.json().catch(() => null);
  } catch { return { code: 1011 }; }
  if (!user || typeof user.id !== "string" || !user.id) return { code: 4001 };
  /* a thing's room: the kind its id matches, <rpc>({<arg>: <id without strip>}); the home room: the app's question with no argument */
  const kind = home ? null : kindOf(spec, id);
  if (!home && !kind) return { code: 4004 };
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${home ? spec.home.rpc : kind.rpc}`, {
      method: "POST",
      headers: { ...base, "content-type": "application/json", "accept-profile": spec.schema, "content-profile": spec.schema },
      body: home ? "{}" : JSON.stringify({ [kind.arg]: kind.strip && id.startsWith(kind.strip) ? id.slice(kind.strip.length) : id }),
    });
    if (res.status >= 500) return { code: 1011 };
    const yes = res.ok && (await res.json().catch(() => null)) === true;
    if (!yes) return { code: 4003 };
  } catch { return { code: 1011 }; }
  return { u: user.id, ...nameParts(user), exp: jwtExp(token) };
}

/* the outgoing object is rebuilt from the allowed fields only, stamped with who sent it; null: not valid, dropped */
function txtOut(m, at) {
  if (!isInt(m.q, 1, Number.MAX_SAFE_INTEGER) || !isItem(m.i) || !isStr(m.f, KEY_MAX)) return null;
  if (!(m.r == null || Number.isInteger(m.r)) || !isInt(m.a, 0, POS_MAX) || !isInt(m.b, 0, POS_MAX)) return null;
  const o = { t: "txt", u: at.u, n: at.n, g: at.g, s: at.s, q: m.q, i: m.i, f: m.f, r: m.r == null ? null : m.r, a: m.a, b: m.b };
  if (m.v !== undefined) {   /* the full value */
    if (!isStr(m.v, TEXT_MAX)) return null;
    o.v = m.v;
    return o;
  }
  if (!isInt(m.bq, 0, Number.MAX_SAFE_INTEGER) || !isInt(m.p, 0, POS_MAX) || !isInt(m.d, 0, POS_MAX) || !isStr(m.x, TEXT_MAX)) return null;
  o.bq = m.bq; o.p = m.p; o.d = m.d; o.x = m.x;
  return o;
}
function curOut(m, at) {
  if (!(m.i == null || isItem(m.i)) || !(m.f == null || isStr(m.f, KEY_MAX))) return null;
  const a = m.a == null ? 0 : m.a, b = m.b == null ? 0 : m.b;
  if (!isInt(a, 0, POS_MAX) || !isInt(b, 0, POS_MAX)) return null;
  return { t: "cur", u: at.u, n: at.n, g: at.g, i: m.i == null ? null : m.i, f: m.f == null ? null : m.f, a, b };
}
function stamp(o, at) { if (!o) return null; o.u = at.u; o.n = at.n; o.g = at.g; o.s = at.s; return o; }
function rsOut(m, at) {
  if (!isStr(m.to, TAB_MAX) || !m.to || !isItem(m.i) || !isStr(m.f, KEY_MAX)) return null;
  return { t: "rs", u: at.u, s: at.s, i: m.i, f: m.f };
}

/* chg (worker/LIVE.md, "The chg message"): a sign, never content. Shared by a client's chg and /live/notify. null: not valid */
const NAME = /^[a-z_]{1,63}$/;
export function chgOf(m) {
  if (!m || typeof m !== "object" || !NAME.test(m.tb || "") || !(m.o === "i" || m.o === "u" || m.o === "d")) return null;
  if (m.kc !== undefined && !NAME.test(m.kc || "")) return null;
  const c = chgList(m.c);
  if (!c || (c !== "*" && m.kc === undefined)) return null;   /* keys need their column; "*" may go without */
  const o = { t: "chg", tb: m.tb, o: m.o };
  if (m.kc !== undefined) o.kc = m.kc;
  o.c = c;
  return o;
}
/* "*", or 1 to 50 entries [k] / [k, rev] (k a string of at most 64 chars, rev an integer); rebuilt, nothing else kept */
export function chgList(c) {
  if (c === "*") return "*";
  if (!Array.isArray(c) || c.length < 1 || c.length > 50) return null;
  const out = [];
  for (const e of c) {
    if (!Array.isArray(e) || e.length < 1 || e.length > 2 || !isStr(e[0], KEY_MAX) || !e[0]) return null;
    if (e.length === 2 && !Number.isSafeInteger(e[1])) return null;
    out.push(e.length === 2 ? [e[0], e[1]] : [e[0]]);
  }
  return out;
}

export class LiveRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.pending = new Set();   /* sockets whose auth is being checked right now (an awaited fetch keeps the object awake) */
    this.swept = 0;
    /* the heartbeat is answered by the runtime, without waking the room, and is not billed */
    if (typeof WebSocketRequestResponsePair === "function") state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /* [ws, attachment] of every socket still in the room (not closed by us), except one */
  sockets(except) {
    const out = [];
    for (const ws of this.state.getWebSockets()) {
      if (ws === except) continue;
      let at = null;
      try { at = ws.deserializeAttachment(); } catch { at = null; }
      if (at && !at.gone) out.push([ws, at]);
    }
    return out;
  }

  async fetch(request) {
    if (new URL(request.url).pathname === "/notify") return this.notify(request);
    if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return new Response("upgrade required", { status: 426 });
    const room = roomOf(new URL(request.url).pathname);
    const full = room ? this.sockets().length >= ROOM_MAX : false;
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.state.acceptWebSocket(server);
    const now = Date.now();
    const at = { a: room ? room.app : "", r: room ? room.id : "", at: now, authed: false, tk: BURST, tt: now, dw: now, wd: 0, c: { rate: 0, size: 0, bad: 0 } };
    server.serializeAttachment(at);
    if (!room) this.shut(server, at, 4004);
    else if (full) this.shut(server, at, 4013);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    const now = Date.now();
    let at = null;
    try { at = ws.deserializeAttachment(); } catch { at = null; }
    if (!at || at.gone) return;
    this.sweep(now);
    const size = typeof msg === "string" ? utf8Len(msg) : (msg && msg.byteLength) || 0;
    if (size > FRAME_MAX) { at.c.size++; return this.shut(ws, at, 4009); }
    if (typeof msg !== "string") return this.drop(ws, at, "bad", now);
    let m = null;
    try { m = JSON.parse(msg); } catch { m = null; }
    if (!m || typeof m !== "object" || Array.isArray(m)) return this.drop(ws, at, "bad", now);

    if (!at.authed) {
      if (now - at.at > AUTH_WAIT) return this.shut(ws, at, 4001);
      if (m.t !== "auth" || this.pending.has(ws)) return this.drop(ws, at, "bad", now);   /* nothing before auth reaches the room */
      return this.auth(ws, m);
    }
    if (at.exp && now / 1000 > at.exp + EXP_GRACE) return this.shut(ws, at, 4001);   /* expired: a local comparison, no network */
    if (at.ra && now - at.ra > AUTH_WAIT && !this.pending.has(ws)) return this.shut(ws, at, 4001);   /* asked to re-auth (reauth) and did not */

    /* the bucket: 12/s, burst 24, for everything that reaches the room (ping never does) */
    at.tk = Math.min(BURST, at.tk + ((now - at.tt) * RATE) / 1000);
    at.tt = now;
    if (at.tk < 1) return this.drop(ws, at, "rate", now);
    at.tk -= 1;

    if (m.t === "auth") {   /* a token refresh */
      if (this.pending.has(ws)) return this.drop(ws, at, "bad", now);
      ws.serializeAttachment(at);
      return this.refresh(ws, m);
    }
    const home = at.r === "home";   /* the home room carries chg only: txt, cur and rs there are dropped and counted */
    const out = m.t === "chg" ? stamp(chgOf(m), at) : home ? null : m.t === "txt" ? txtOut(m, at) : m.t === "cur" ? curOut(m, at) : m.t === "rs" ? rsOut(m, at) : null;
    if (!out) return this.drop(ws, at, "bad", now);
    ws.serializeAttachment(at);
    const s = JSON.stringify(out);   /* once, for every receiver */
    if (out.t === "rs") this.fan(ws, s, (o) => o.s === m.to);
    else this.fan(ws, s);
  }

  async auth(ws, m) {
    if (!isStr(m.s, TAB_MAX) || !m.s) return this.shut(ws, ws.deserializeAttachment(), 4001);
    const first = ws.deserializeAttachment();
    const spec = ROOMS[first.a];
    if (!spec) return this.shut(ws, first, 4004);
    this.pending.add(ws);
    let v;
    try { v = await verify(this.env, spec, first.r, m.k); } finally { this.pending.delete(ws); }
    let at = null;
    try { at = ws.deserializeAttachment(); } catch { at = null; }
    if (!at || at.gone) return;   /* closed while we asked */
    if (v.code) return this.shut(ws, at, v.code);
    const others = this.sockets(ws).filter(([, o]) => o.authed);
    const mine = others.filter(([, o]) => o.u === v.u);
    if (mine.length >= PERSON_MAX) return this.shut(ws, at, 4013);
    Object.assign(at, { authed: true, u: v.u, n: v.n, g: v.g, s: m.s, ok: true, exp: v.exp });
    ws.serializeAttachment(at);
    const seen = new Set([v.u]), peers = [];
    for (const [, o] of others) if (!seen.has(o.u)) { seen.add(o.u); peers.push({ u: o.u, n: o.n, g: o.g }); }
    this.sendTo(ws, at, JSON.stringify({ t: "ok", me: { u: v.u, n: v.n, g: v.g }, peers }));
    if (!mine.length) this.fan(ws, JSON.stringify({ t: "join", u: v.u, n: v.n, g: v.g }));
  }

  /* a second auth on an authed socket: both checks again with the new token; success replaces ok and exp silently */
  async refresh(ws, m) {
    const first = ws.deserializeAttachment();
    const spec = ROOMS[first.a];
    this.pending.add(ws);
    let v;
    try { v = await verify(this.env, spec, first.r, m.k); } finally { this.pending.delete(ws); }
    let at = null;
    try { at = ws.deserializeAttachment(); } catch { at = null; }
    if (!at || at.gone) return;
    if (v.code) return this.shut(ws, at, v.code);
    if (v.u !== at.u) return this.shut(ws, at, 4001);   /* somebody else's token on this socket */
    at.ok = true;
    at.exp = v.exp;
    delete at.ra;
    ws.serializeAttachment(at);
  }

  /* POST /notify, from the Worker (POST /live/notify): the chg string, already serialized, to every authed socket; with
     x-live-reauth (access was taken away) and not the home room, every socket is asked to auth again (reauth) within 10s.
     The first line is the whole cost of an empty room: no storage is touched, ever. */
  async notify(request) {
    const all = this.state.getWebSockets();
    if (!all.length) return new Response(null, { status: 204 });
    const s = await request.text();
    const reauth = request.headers.get("x-live-reauth") === "1";
    const now = Date.now();
    for (const [ws, at] of this.sockets()) {
      if (!at.authed) continue;
      if (!this.sendTo(ws, at, s)) continue;
      if (reauth && at.r !== "home") {
        at.ra = now;
        ws.serializeAttachment(at);
        this.sendTo(ws, at, '{"t":"reauth"}');
      }
    }
    return new Response(null, { status: 204 });
  }

  sendTo(ws, at, s) {
    try { ws.send(s); return true; } catch { this.shut(ws, at, 1011); return false; }
  }

  /* to every OTHER authed socket in the room (never back to the sender); a dead one is closed and treated as gone */
  fan(from, s, only) {
    for (const [ws, o] of this.sockets(from)) {
      if (!o.authed || (only && !only(o))) continue;
      this.sendTo(ws, o, s);
    }
  }

  drop(ws, at, kind, now) {
    at.c[kind] = (at.c[kind] || 0) + 1;
    if (now - at.dw > DROP_WINDOW) { at.dw = now; at.wd = 0; }
    if (++at.wd > DROP_MAX) return this.shut(ws, at, 4008);
    ws.serializeAttachment(at);
  }

  /* unauthed sockets older than 10s: a timer does not survive hibernation and there is no alarm, so the deadline is checked lazily */
  sweep(now) {
    if (now - this.swept < 1000) return;
    this.swept = now;
    for (const [ws, at] of this.sockets()) {
      if (this.pending.has(ws)) continue;
      if ((!at.authed && now - at.at > AUTH_WAIT) || (at.ra && now - at.ra > AUTH_WAIT)) this.shut(ws, at, 4001);
    }
  }

  /* we close a socket: counted once, logged once, and `leave` if it was the person's last one */
  shut(ws, at, code) {
    if (!at || at.gone) return;
    at.gone = true;
    try { ws.serializeAttachment(at); } catch { /* closed */ }
    try { ws.close(code, ""); } catch { /* closed */ }
    this.gone(ws, at, code);
  }

  gone(ws, at, code) {
    const c = at.c || {};
    if ((code !== 1000 && code !== 1001 && code !== 1005 && code !== 1006) || c.rate || c.size || c.bad) {
      /* counting, not logging: never content, never a token, never an email, not the room id */
      console.log(JSON.stringify({ live: at.a, code, drops: (c.rate || 0) + (c.size || 0) + (c.bad || 0), rate: c.rate || 0, size: c.size || 0, bad: c.bad || 0 }));
    }
    if (!at.authed) return;
    if (this.sockets(ws).some(([, o]) => o.authed && o.u === at.u)) return;
    this.fan(ws, JSON.stringify({ t: "leave", u: at.u }));
  }

  async webSocketClose(ws, code) {
    let at = null;
    try { at = ws.deserializeAttachment(); } catch { at = null; }
    try { ws.close(code >= 3000 && code <= 4999 ? code : 1000, ""); } catch { /* already closed */ }
    if (!at || at.gone) return;
    at.gone = true;
    try { ws.serializeAttachment(at); } catch { /* closed */ }
    this.gone(ws, at, code);
  }

  async webSocketError(ws) {
    let at = null;
    try { at = ws.deserializeAttachment(); } catch { at = null; }
    if (at && !at.gone) this.shut(ws, at, 1011);
  }
}
