// The chat function: it only serves the static texts of the chat and lets the editors change them.
//  mode "script"        the published content (public, read only, nothing about the visitor is kept)
//  mode "script_admin"  list, get, save, publish, draft_get, draft_save, draft_clear: only a signed in person whose email is in chatbot.admins
// The content lives in chatbot.script_versions and chatbot.script_drafts (apps/chatbot/script-content.sql), reached through service role functions.
import { BUSINESSES, type Business } from './businesses.ts';
import { draftProblem, scriptProblem } from './script.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const isLocal = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const allowed = (b: Business, o: string | null) => !!o && (b.origins.includes(o) || isLocal(o));
const cors = (b: Business, o: string | null) => ({
  'Access-Control-Allow-Origin': allowed(b, o) ? o! : b.origins[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const json = (b: Business, o: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(b, o), 'Content-Type': 'application/json; charset=utf-8' } });
const tx = (v: unknown) => String(v ?? '').trim();
const rpc = (name: string, args: Record<string, unknown>) =>
  fetch(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });

// The page sends the Google session token of the editor; it is checked against the database of the domain.
async function adminEmail(token: string): Promise<string> {
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '', authorization: 'Bearer ' + token } });
    if (!r.ok) return '';
    const u = await r.json();
    return u && u.email_confirmed_at !== null && typeof u.email === 'string' ? u.email.toLowerCase() : '';
  } catch (_) { return ''; }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) { body = null; } }
  const b = BUSINESSES[tx(body?.business) || 'harpatka'];
  if (!b) return json(BUSINESSES.harpatka, origin, { error: 'business' }, 400);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(b, origin) });
  if (req.method !== 'POST') return json(b, origin, { error: 'method' }, 405);
  if (!allowed(b, origin)) return json(b, origin, { error: 'origin' }, 403);
  if (!body) return json(b, origin, { error: 'body' }, 400);
  if (!SB_SERVICE || !SB_URL) return json(b, origin, { error: 'config' }, 503);

  if (body.mode === 'script') {
    const rs = await rpc('chatbot_script', { p_business: b.key });
    const ds = rs.ok ? await rs.json() : null;
    if (!ds || !ds.content) return json(b, origin, { error: 'none' }, 404);
    const out = json(b, origin, ds);
    out.headers.set('Cache-Control', 'public, max-age=30');
    return out;
  }

  if (body.mode === 'script_admin') {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const email = token ? await adminEmail(token) : '';
    if (!email) return json(b, origin, { error: 'auth' }, 401);
    const ra = await rpc('chatbot_is_admin', { p_email: email });
    if (!(ra.ok && (await ra.json()) === true)) return json(b, origin, { error: 'forbidden', email }, 403);
    const action = tx(body.action);
    if (action === 'list') { const r = await rpc('chatbot_script_versions', { p_business: b.key }); return json(b, origin, { versions: r.ok ? await r.json() : [], email }); }
    if (action === 'get') {
      const v = Number(body.version);
      const r = await rpc('chatbot_script_get', { p_business: b.key, p_version: Number.isFinite(v) && v > 0 ? v : null });
      const d = r.ok ? await r.json() : null;
      return d ? json(b, origin, d) : json(b, origin, { error: 'none' }, 404);
    }
    if (action === 'save') {
      const problem = scriptProblem(body.content);
      if (problem) return json(b, origin, { error: 'invalid', message: problem }, 400);
      const r = await rpc('chatbot_script_save', { p_business: b.key, p_content: body.content, p_note: tx(body.note).slice(0, 200) + ' (' + email + ')' });
      if (r.ok) await rpc('chatbot_script_draft_clear', { p_business: b.key });
      return r.ok ? json(b, origin, { version: await r.json() }) : json(b, origin, { error: 'save' }, 500);
    }
    if (action === 'publish') { const r = await rpc('chatbot_script_publish', { p_business: b.key, p_version: Number(body.version) }); return json(b, origin, { ok: r.ok ? await r.json() : false }); }
    if (action === 'draft_get') { const r = await rpc('chatbot_script_draft_get', { p_business: b.key }); const d = r.ok ? await r.json() : null; return json(b, origin, { draft: d || null }); }
    if (action === 'draft_save') {
      if (draftProblem(body.content)) return json(b, origin, { error: 'invalid' }, 400);
      const r = await rpc('chatbot_script_draft_set', { p_business: b.key, p_content: body.content, p_by: email });
      return json(b, origin, { ok: r.ok });
    }
    if (action === 'draft_clear') { const r = await rpc('chatbot_script_draft_clear', { p_business: b.key }); return json(b, origin, { ok: r.ok }); }
    return json(b, origin, { error: 'action' }, 400);
  }

  return json(b, origin, { error: 'mode' }, 400);
});
