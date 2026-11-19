/* WhatsApp send list of ONE roster business (an internal page of that business), reached only after a Google sign-in of an allowed person.
     GET  /roster-wa/list      -> { ok, message, items: [{ id, name, phone, attended, sent_at, no_more }] }
     POST /roster-wa/mark      { id, sent?: boolean, no_more?: boolean } -> { ok, id, sent_at, no_more }
     POST /roster-wa/message   { message }                                -> { ok, message }
   Authorization: Bearer <a Google ID token of the business's Google app, or a Supabase session access token>.
   Safety: the person's email must be verified and in ROSTER_WA_EMAILS (default: the owner), the browser origin must be in ROSTER_WA_ORIGINS,
   and the business is fixed (ROSTER_WA_BUSINESS, default harpatka): the caller never names it. No secret ever reaches the browser.
   The test host (api-test.floa.co.il) uses the roster-test schema, like the rest of the roster API. This is not part of /roster/v1. */
import { DEFAULT_SCHEMA, schemaOfHost } from "./roster/db.js";

const list = (v) => String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
const DEFAULT_ORIGINS = ["https://harpatka.co.il", "https://www.harpatka.co.il", "http://localhost:5173", "http://127.0.0.1:5173"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isRosterWaPath = (p) => p === "/roster-wa/list" || p === "/roster-wa/mark" || p === "/roster-wa/message";

export async function handleRosterWa(request, env, doFetch = fetch) {
  const url = new URL(request.url);
  const origins = env.ROSTER_WA_ORIGINS ? String(env.ROSTER_WA_ORIGINS).split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
  const origin = request.headers.get("origin") || "";
  const okOrigin = origins.includes(origin) ? origin : "";
  const reply = (body, status) => new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff",
      ...(okOrigin ? { "access-control-allow-origin": okOrigin, vary: "Origin", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "GET, POST, OPTIONS" } : {}) },
  });
  if (request.method === "OPTIONS") return okOrigin ? reply(null, 204) : reply({ ok: false, error: "origin" }, 403);
  if (!okOrigin) return reply({ ok: false, error: "origin" }, 403);

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (token.length < 50 || token.length > 4096) return reply({ ok: false, error: "auth" }, 401);
  const email = await emailOf(token, env, doFetch);
  const allowed = list(env.ROSTER_WA_EMAILS || "ofir.aviram@gmail.com");
  if (!email || !allowed.includes(email)) return reply({ ok: false, error: email ? "forbidden" : "auth" }, email ? 403 : 401);

  const slug = env.ROSTER_WA_BUSINESS || "harpatka";
  const schema = schemaOfHost(url.hostname);
  const rpc = async (name, args) => {
    const r = await doFetch(`${new URL(env.SUPABASE_URL).origin}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_SERVICE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "content-type": "application/json", "content-profile": schema || DEFAULT_SCHEMA },
      body: JSON.stringify(args),
    });
    if (!r.ok) { console.log("roster-wa rpc", name, r.status); return { ok: false }; }
    const t = await r.text();
    return { ok: true, data: t ? JSON.parse(t) : null };
  };
  const fail = () => reply({ ok: false, error: "server" }, 502);

  if (url.pathname === "/roster-wa/list") {
    if (request.method !== "GET") return reply({ ok: false, error: "method" }, 405);
    const r = await rpc("wa_list", { p_slug: slug });
    if (!r.ok) return fail();
    if (!r.data) return reply({ ok: false, error: "not_found" }, 404);
    return reply({ ok: true, message: r.data.message, items: r.data.items }, 200);
  }
  if (request.method !== "POST") return reply({ ok: false, error: "method" }, 405);
  let body; try { body = await request.json(); } catch { return reply({ ok: false, error: "bad_request" }, 400); }
  if (url.pathname === "/roster-wa/mark") {
    const id = typeof body?.id === "string" && UUID.test(body.id) ? body.id.toLowerCase() : null;
    const flag = (v) => (v === undefined || v === null ? null : typeof v === "boolean" ? v : undefined);
    const sent = flag(body?.sent), noMore = flag(body?.no_more);
    if (!id || sent === undefined || noMore === undefined || (sent === null && noMore === null)) return reply({ ok: false, error: "bad_request" }, 400);
    const r = await rpc("wa_mark", { p_slug: slug, p_participant: id, p_sent: sent, p_no_more: noMore });
    if (!r.ok) return fail();
    if (!r.data) return reply({ ok: false, error: "not_found" }, 404);
    return reply({ ok: true, ...r.data }, 200);
  }
  const message = typeof body?.message === "string" ? body.message : null;
  if (message === null || message.length > 4000) return reply({ ok: false, error: "bad_request" }, 400);
  const r = await rpc("wa_message", { p_slug: slug, p_message: message });
  if (!r.ok) return fail();
  return reply({ ok: true, ...r.data }, 200);
}

/* the verified email behind the token, or "" */
async function emailOf(token, env, doFetch) {
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    const u = await doFetch(`${new URL(env.SUPABASE_URL).origin}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } }).catch(() => null);
    if (u && u.ok) { const j = await u.json().catch(() => null); if (j && j.email && (j.email_confirmed_at || j.confirmed_at)) return String(j.email).toLowerCase(); }
  }
  const clients = list(env.ROSTER_GOOGLE_CLIENT_IDS);
  if (!clients.length) return "";
  const g = await doFetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token)).catch(() => null);
  if (!g || !g.ok) return "";
  const t = await g.json().catch(() => null);
  if (!t || !clients.includes(String(t.aud).toLowerCase()) || String(t.email_verified) !== "true" || Number(t.exp) * 1000 < Date.now()) return "";
  return String(t.email || "").toLowerCase();
}
