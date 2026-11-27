/* The live relay's doors (worker/LIVE.md). Loadable by plain node.
   Separate from every other route: nothing here touches /roster/v1/, /lead or the rest.

   GET  /live/<app>/<id>  (WebSocket upgrade): checked here, then handed to the room's Durable Object (room.js).
   POST /live/notify      (from the database, pg_net): a chg sign for one or more rooms, behind a shared secret. */
import { appOf, hostOk, roomIdOk, roomOf } from "./rooms.js";
import { chgList, chgOf } from "./room.js";

export const LIVE_PREFIX = "/live/";
export const NOTIFY_PATH = "/live/notify";

/* a WebSocket is not CORS: the Origin header is the only guard a browser gives. Every app sub-domain of floa.co.il, and the local dev server */
const ORIGIN = /^https:\/\/([a-z0-9-]+\.)?floa\.co\.il$/;
const LOCAL = "http://localhost:5173";
const NOTIFY_MAX = 16384, NOTIFY_ROOMS = 20;

export function isLivePath(pathname) { return pathname === "/live" || pathname.startsWith(LIVE_PREFIX); }

export function liveOriginAllowed(origin) { return !!origin && (ORIGIN.test(origin) || origin === LOCAL); }

function plain(status, body) { return new Response(body, { status, headers: { "content-type": "text/plain" } }); }

export async function handleLive(request, env) {
  if (new URL(request.url).pathname === NOTIFY_PATH) return handleNotify(request, env);
  const room = roomOf(new URL(request.url).pathname);
  if (!room || !hostOk(room.spec, new URL(request.url).hostname)) return plain(404, "not found");   /* roster-test only on the test host, roster never there */
  if ((request.headers.get("upgrade") || "").toLowerCase() !== "websocket") return plain(426, "upgrade required");
  if (!liveOriginAllowed(request.headers.get("origin") || "")) return plain(403, "origin");
  if (!env || !env.LIVE) { console.log("live: no LIVE binding (wrangler.toml durable_objects)"); return plain(502, "config"); }
  return env.LIVE.get(env.LIVE.idFromName(room.app + ":" + room.id)).fetch(request);
}

/* constant time, lengths compared first (worker/LIVE.md: crypto.subtle.timingSafeEqual on the UTF-8 bytes) */
function sameSecret(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  if (globalThis.crypto && crypto.subtle && typeof crypto.subtle.timingSafeEqual === "function") return crypto.subtle.timingSafeEqual(x, y);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

/* POST /live/notify { a, t, o, kc?, x?, r: { <room id>: "*" | [[k] | [k, rev], ...] } } -> 204 when every room got it.
   No CORS at all: no browser ever calls it. Counted, never logged in content, the secret never logged. */
export async function handleNotify(request, env) {
  if (request.method !== "POST") return plain(405, "method");
  if (!env || !env.LIVE_NOTIFY_SECRET) { console.log("live: LIVE_NOTIFY_SECRET is not set"); return plain(503, "not configured"); }
  if (!sameSecret(request.headers.get("x-live-secret") || "", env.LIVE_NOTIFY_SECRET)) return plain(401, "secret");
  const text = await request.text();
  if (new TextEncoder().encode(text).length > NOTIFY_MAX) return bad("size");
  let b = null;
  try { b = JSON.parse(text); } catch { b = null; }
  if (!b || typeof b !== "object" || Array.isArray(b)) return bad("json");
  const spec = appOf(b.a);
  if (!spec || !spec.notify) return bad("app");
  if (!hostOk(spec, new URL(request.url).hostname)) return bad("host");   /* the app belongs to this host's Worker (schemaOfHost) */
  if (b.x !== undefined && b.x !== true) return bad("x");
  if (!b.r || typeof b.r !== "object" || Array.isArray(b.r)) return bad("rooms");
  const rooms = Object.keys(b.r);
  if (!rooms.length || rooms.length > NOTIFY_ROOMS) return bad("rooms");
  const out = [];
  for (const id of rooms) {
    if (!roomIdOk(spec, id)) return bad("room");
    const c = chgList(b.r[id]);
    const chg = chgOf({ tb: b.t, o: b.o, kc: b.kc, c });
    if (!c || !chg) return bad("chg");
    out.push([id, JSON.stringify(chg)]);
  }
  if (!env.LIVE) { console.log("live: no LIVE binding (wrangler.toml durable_objects)"); return plain(502, "config"); }
  try {
    await Promise.all(out.map(([id, s]) => env.LIVE.get(env.LIVE.idFromName(b.a + ":" + id)).fetch("https://live/notify", {
      method: "POST",
      headers: b.x && id !== "home" ? { "x-live-reauth": "1" } : {},
      body: s,
    })));
  } catch {
    console.log(JSON.stringify({ live: b.a, notify: "stub threw" }));
    return plain(502, "room");
  }
  return new Response(null, { status: 204 });
}

function bad(why) { console.log(JSON.stringify({ live: "notify", bad: why })); return plain(400, "bad request"); }
