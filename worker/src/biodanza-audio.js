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
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "authorization, range",
    "access-control-expose-headers": "content-length, content-range, accept-ranges",
    "access-control-max-age": "86400",
    vary: "origin",
    ...extra,
  };
}

async function mayListen(env, token) {
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return false;
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
  if (!res.ok) return false;
  const me = await res.json().catch(() => null);
  return !!(me && me.allowed === true);
}

export async function handleAudio(request, env, allowedOrigins) {
  const origin = request.headers.get("origin") || "";
  const plain = (status, body) => new Response(body, { status, headers: headers(origin, allowedOrigins, { "content-type": "text/plain" }) });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(origin, allowedOrigins, {}) });
  if (request.method !== "GET" && request.method !== "HEAD") return plain(405, "method");
  if (!allowedOrigins.includes(origin)) return plain(403, "origin");
  if (!env.AUDIO) return plain(502, "config");

  const name = new URL(request.url).pathname.slice(AUDIO_PREFIX.length);
  if (!NAME.test(name)) return plain(404, "not found");

  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!(await mayListen(env, token))) return plain(403, "forbidden");

  const object = await env.AUDIO.get(name, { range: request.headers });
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
