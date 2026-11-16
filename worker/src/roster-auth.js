/* Sign-in for a roster business that has its OWN Google app (consent screen of its own), without touching the Google provider of the
   Supabase project. The browser gets a Google ID token (Google Identity, the business's client id), posts it here, and gets back a
   normal Supabase session: the personal-area functions (me*) keep reading auth.uid() / the jwt, exactly as before.
     POST /roster-auth/google   { id_token }   ->   { access_token, refresh_token, expires_in, token_type, user }
   Safety: the token is verified by Google (tokeninfo), its audience must be one of ROSTER_GOOGLE_CLIENT_IDS, the email must be
   verified, and the browser origin must be one of ROSTER_AUTH_ORIGINS. Off (404) when ROSTER_GOOGLE_CLIENT_IDS is not set. */
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const reply = (body, status, origin) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...(origin ? { "access-control-allow-origin": origin, vary: "Origin", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, OPTIONS" } : {}) },
});

export const isRosterAuthPath = (pathname) => pathname === "/roster-auth/google";

export async function handleRosterAuth(request, env, doFetch = fetch) {
  const clients = list(env.ROSTER_GOOGLE_CLIENT_IDS);
  if (!clients.length) return reply({ error: "not_found" }, 404);
  const origins = list(env.ROSTER_AUTH_ORIGINS);
  const origin = request.headers.get("origin") || "";
  const okOrigin = origin && origins.includes(origin) ? origin : "";
  if (request.method === "OPTIONS") return okOrigin ? reply(null, 204, okOrigin) : reply({ error: "origin" }, 403);
  if (request.method !== "POST") return reply({ error: "method" }, 405, okOrigin);
  if (!okOrigin) return reply({ error: "origin" }, 403);

  let body; try { body = await request.json(); } catch { return reply({ error: "bad_request" }, 400, okOrigin); }
  const idt = typeof body?.id_token === "string" ? body.id_token : "";
  if (idt.length < 100 || idt.length > 4096) return reply({ error: "bad_token" }, 400, okOrigin);

  const g = await doFetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idt));
  if (!g.ok) return reply({ error: "bad_token" }, 401, okOrigin);
  const t = await g.json();
  const email = String(t.email || "").toLowerCase();
  if (!clients.includes(t.aud) || String(t.email_verified) !== "true" || !email || Number(t.exp) * 1000 < Date.now()) return reply({ error: "bad_token" }, 401, okOrigin);

  const base = env.SUPABASE_URL, key = env.SUPABASE_SERVICE_KEY;
  const h = { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" };
  const link = await doFetch(base + "/auth/v1/admin/generate_link", { method: "POST", headers: h, body: JSON.stringify({ type: "magiclink", email }) });
  if (!link.ok) return reply({ error: "auth_failed" }, 502, okOrigin);
  const l = await link.json();
  const hashed = l.hashed_token || l.properties?.hashed_token, uid = l.id || l.user?.id;
  if (!hashed) return reply({ error: "auth_failed" }, 502, okOrigin);
  const name = String(t.name || "").slice(0, 120);
  if (uid) await doFetch(base + "/auth/v1/admin/users/" + uid, { method: "PUT", headers: h, body: JSON.stringify({ user_metadata: { full_name: name, name, picture: t.picture || null }, email_confirm: true }) }).catch(() => {});
  const v = await doFetch(base + "/auth/v1/verify", { method: "POST", headers: { apikey: key, "content-type": "application/json" }, body: JSON.stringify({ type: "magiclink", token_hash: hashed }) });
  if (!v.ok) return reply({ error: "auth_failed" }, 502, okOrigin);
  return reply(await v.json(), 200, okOrigin);
}
