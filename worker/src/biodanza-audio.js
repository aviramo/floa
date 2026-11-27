/* GET /biodanza/audio/<object>: the music of the Biodanza app, from a private R2 bucket.

   The bucket has no public address and the object names are random, so the only
   way to a file is through here. Two checks, both made against Supabase itself
   (this Worker holds no key it could verify a token with):

     the caller is signed in (their access token is a real one), and
     the caller's account is on the allowlist, `biodanza.allowed`, which the
     database tells us through biodanza.me() under the caller's own token.

   The browser fetches with an Authorization header and plays or stores the
   bytes, so no link to a file ever exists that could be passed around. */

const NAME = /^[a-f0-9]{32}\.(mp3|flac|wav|aiff|aif|m4a)$/;
const TYPES = { mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", aiff: "audio/aiff", aif: "audio/aiff", m4a: "audio/mp4" };

export const AUDIO_PREFIX = "/biodanza/audio/";

export function isAudioPath(pathname) { return pathname.startsWith(AUDIO_PREFIX); }

function headers(origin, allowed, extra) {
  return {
    "access-control-allow-origin": allowed.includes(origin) ? origin : allowed[0],
    "access-control-allow-methods": "GET, PUT, OPTIONS",
    "access-control-allow-headers": "authorization, range, content-type, x-format",
    "access-control-expose-headers": "content-length, content-range, accept-ranges",
    "access-control-max-age": "86400",
    vary: "origin",
    ...extra,
  };
}

/* THE ANSWER IS KEPT PER TOKEN. A synced device asks for many files in a row, each with the same token, and every one of them used to
   ask Supabase again. The answer is kept, under a hash of the token (the token itself is never stored), in this isolate's memory and
   in the colo's Cache API, until the token expires or for ALLOW_MS, whichever comes first. A "no" is kept shorter (DENY_MS), so an
   account just put on the allowlist is let in soon. A Supabase that did not answer is never kept. */
const ALLOW_MS = 5 * 60 * 1000;
const DENY_MS = 60 * 1000;
const MAX_MEM = 500;
const mem = new Map();   /* hash -> { ok, until } */

async function tokenKey(token) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
function tokenExp(token) {   /* the token's own end (ms), read from its payload; only bounds how long an answer Supabase gave is kept */
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = JSON.parse(atob(p + "===".slice((p.length + 3) % 4))).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch { return 0; }
}
function edgeCache() { try { return typeof caches !== "undefined" && caches.default ? caches.default : null; } catch { return null; } }

export function _clearAudioAuthCache() { mem.clear(); }   /* tests only */

async function mayListen(env, token, base) {
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
  const now = Date.now();
  const key = await tokenKey(token);
  const hit = mem.get(key);
  if (hit && hit.until > now) return hit.ok;
  if (hit) mem.delete(key);
  const cache = base ? edgeCache() : null, ck = base ? new URL("/biodanza/audio/.auth/" + key, base).href : "";   /* a key under this Worker's own host (a path no file can have: NAME refuses it) */
  if (cache) {
    try {
      const r = await cache.match(ck);
      if (r) {
        const v = await r.json();
        if (v && v.until > now) { mem.set(key, v); return v.ok; }
      }
    } catch { /* no cached answer */ }
  }
  const ok = await askSupabase(env, token);
  if (ok === null) return false;
  const exp = tokenExp(token);
  let until = now + (ok ? ALLOW_MS : DENY_MS);
  if (exp) until = Math.min(until, exp);
  if (until > now) {
    if (mem.size >= MAX_MEM) { for (const [k, v] of mem) if (v.until <= now || mem.size >= MAX_MEM) mem.delete(k); }
    mem.set(key, { ok, until });
    if (cache) {
      const ttl = Math.max(1, Math.floor((until - now) / 1000));
      try { await cache.put(ck, new Response(JSON.stringify({ ok, until }), { headers: { "content-type": "application/json", "cache-control": `max-age=${ttl}` } })); } catch { /* memory only */ }
    }
  }
  return ok;
}

/* true / false from biodanza.me(); null when Supabase gave no usable answer (not kept) */
async function askSupabase(env, token) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/me`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "content-profile": "biodanza",
      "accept-profile": "biodanza",
    },
    body: "{}",
  });
  if (res.status === 401 || res.status === 403) return false;   /* a token Supabase refuses: a real "no" */
  if (!res.ok) return null;
  const me = await res.json().catch(() => null);
  if (!me) return null;
  return me.allowed === true;
}

export async function handleAudio(request, env, allowedOrigins) {
  const origin = request.headers.get("origin") || "";
  const plain = (status, body) => new Response(body, { status, headers: headers(origin, allowedOrigins, { "content-type": "text/plain" }) });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin, allowedOrigins, {}) });
  if (request.method === "PUT") return upload(request, env, origin, plain, allowedOrigins);
  if (request.method !== "GET" && request.method !== "HEAD") return plain(405, "method");
  if (!allowedOrigins.includes(origin)) return plain(403, "origin");
  if (!env.AUDIO) return plain(502, "config");

  const name = new URL(request.url).pathname.slice(AUDIO_PREFIX.length);
  if (!NAME.test(name)) return plain(404, "not found");

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await mayListen(env, token, request.url))) return plain(403, "forbidden");

  /* a range only when one was asked for: a whole-file request is a 200 with the whole file, never a 206 */
  const object = request.headers.has("range") ? await env.AUDIO.get(name, { range: request.headers }) : await env.AUDIO.get(name);
  if (!object) return plain(404, "not found");

  const out = {
    "content-type": TYPES[name.split(".")[1]] || "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    etag: object.httpEtag,
  };
  let status = 200;
  if (object.range && "offset" in object.range) {
    const { offset, length } = object.range;
    const end = (length === undefined ? object.size - 1 : offset + length - 1);
    out["content-range"] = `bytes ${offset}-${end}/${object.size}`;
    out["content-length"] = String(end - offset + 1);
    status = 206;
  } else {
    out["content-length"] = String(object.size);
  }
  return new Response(request.method === "HEAD" ? null : object.body, { status, headers: headers(origin, allowedOrigins, out) });
}

/* PUT /biodanza/audio/upload: an allowed account puts a song's file into the bucket under a new random name.
   The name comes back; attaching it to a catalog song is the database's job (biodanza.attach_audio), which also
   refuses a song that already has a file, so nobody can replace a file that is there. Same two checks as listening. */
const MAX_BYTES = 200 * 1024 * 1024;
async function upload(request, env, origin, plain, allowedOrigins) {
  if (!allowedOrigins.includes(origin)) return plain(403, "origin");
  if (!env.AUDIO) return plain(502, "config");
  if (new URL(request.url).pathname !== AUDIO_PREFIX + "upload") return plain(404, "not found");
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await mayListen(env, token, request.url))) return plain(403, "forbidden");
  const format = (request.headers.get("x-format") || "").toLowerCase();
  if (!TYPES[format]) return plain(415, "format");
  const size = Number(request.headers.get("content-length") || 0);
  if (!(size > 0)) return plain(411, "length");
  if (size > MAX_BYTES) return plain(413, "too big");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const object = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "." + format;
  await env.AUDIO.put(object, request.body, { httpMetadata: { contentType: TYPES[format] } });
  return new Response(JSON.stringify({ object, format, size }), { status: 200, headers: headers(origin, allowedOrigins, { "content-type": "application/json" }) });
}
