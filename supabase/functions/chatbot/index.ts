// Supabase Edge Function: chatbot. The chatbot engine of floa.co.il, one engine for every business.
// Which business is talking comes from the request (`business`, default harpatka); everything that belongs to one
// business (prompt, ads, allowed sites, live facts) lives in businesses/<key>/ and is registered in businesses/index.ts.
// Deploy: supabase functions deploy chatbot --no-verify-jwt --project-ref aexmnaxvahblveejsbup
// Secrets: ANTHROPIC_API_KEY (already set), optional CHAT_MODEL, CHAT_OPENING_MODEL, CHAT_SALT, CHAT_DEVICE_DAY, CHAT_IP_DAY, CHAT_TOTAL_DAY.
// Conversations are saved through public.chatbot_log into chatbot.logs (apps/chatbot/schema.sql).
import { offerBlock, OfferStats, learningBlock, chipBlock, OpeningStat, QuestionStats } from './learning.ts';
import { classifyReply, lastSentence, buildMessages, MAX_USER_TURNS, parse, parseOpening, quoteSafe } from './parse.ts';
import { BUSINESSES } from './businesses/index.ts';
import type { Business } from './types.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MODEL = Deno.env.get('CHAT_MODEL') || 'claude-sonnet-5-5';
const OPENING_MODEL = Deno.env.get('CHAT_OPENING_MODEL') || MODEL;

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

// In-memory rate limit (approximate: every instance of the function counts for itself): 40 requests per 10 minutes per address
const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now(), arr = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 600_000)) hits.delete(k);
  return arr.length > 40;
};

const tx = (v: unknown) => String(v ?? '').trim();

// A short chat needs no thinking: it eats max_tokens, slows and costs (without a setting Sonnet 5.5 and Haiku 5.5 think by default).
// Sonnet 5.5 is switched off with between_tools (disabled is rejected there), Haiku 5.5 with disabled. Another model: unchanged.
function thinkingOff(model: string): Record<string, unknown> {
  if (model.startsWith('claude-sonnet-5-5')) return { thinking: { type: 'between_tools' } };
  if (model.startsWith('claude-haiku-5-5')) return { thinking: { type: 'disabled' } };
  return {};
}

// A call to Claude: returns the text, or null on failure
async function claude(apiKey: string, model: string, system: unknown[], messages: { role: string; content: string }[], maxTokens: number): Promise<string | null> {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, ...thinkingOff(model) }),
    });
    if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 300)); return null; }
    const data = await r.json();
    return (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  } catch (e) { console.error('chat', e); return null; }
}

const rpc = (name: string, args: Record<string, unknown>) =>
  fetch(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });

// Learning from past conversations: loaded from the database (service_role RPC) and kept in memory for 10 minutes, so no message waits for it
const statCache = new Map<string, { t: number; v: unknown }>();
async function stat<T>(name: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  const key = name + JSON.stringify(args), hit = statCache.get(key);
  if (hit && Date.now() - hit.t < 600_000) return hit.v as T;
  let v: T = fallback;
  if (SB_URL && SB_SERVICE) {
    try {
      const r = await rpc(name, args);
      if (r.ok) v = (await r.json()) ?? fallback;
    } catch (_) { /* a learning failure never fails the conversation */ }
  }
  statCache.set(key, { t: Date.now(), v });
  return v;
}

// Abuse guard: every call is recorded (a random device id plus a hash of the network address, never the address itself) and the
// database returns how many calls there were in 24 hours. A database failure does not stop the chat.
const DEVICE_DAY = Number(Deno.env.get('CHAT_DEVICE_DAY')) || 80, IP_DAY = Number(Deno.env.get('CHAT_IP_DAY')) || 400, TOTAL_DAY = Number(Deno.env.get('CHAT_TOTAL_DAY')) || 2000;
async function sha(t: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
async function usageHit(b: Business, device: string, ip: string, mode: string): Promise<{ device: number; ip: number; total: number } | null> {
  if (!SB_URL || !SB_SERVICE) return null;
  try {
    const r = await rpc(b.rpc.usage, { p_device: device, p_ip: ip ? await sha(ip + (Deno.env.get('CHAT_SALT') ?? b.saltDefault)) : '', p_mode: mode });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

// Saving conversations: chatbot schema, an RPC only service_role runs (public.chatbot_log); read side: public.chatbot_logs_list
async function saveLog(b: Business, session: string, src: string, ad: string, messages: unknown[], cta: string | null) {
  if (!SB_SERVICE || !SB_URL || !/^[0-9a-f-]{36}$/i.test(session)) return;
  try {
    await rpc('chatbot_log', { p_business: b.key, p_id: session, p_source: src || null, p_ad: ad || null, p_messages: messages, p_cta: cta });
  } catch (_) { /* a save failure never fails the reply */ }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  // Which business: read from the body, but the answer to a stranger (preflight, bad method) must not need it
  let body: any = {};
  if (req.method === 'POST') { try { body = await req.json(); } catch (_) { body = null; } }
  const b = BUSINESSES[tx(body?.business) || 'harpatka'];
  if (!b) return json(BUSINESSES.harpatka, origin, { error: 'business' }, 400);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(b, origin) });
  if (req.method !== 'POST') return json(b, origin, { error: 'method' }, 405);
  if (!allowed(b, origin)) return json(b, origin, { error: 'origin' }, 403);

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json(b, origin, { error: 'rate' }, 429);

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(b, origin, { error: 'config' }, 500);
  if (!body) return json(b, origin, { error: 'body' }, 400);

  const ageRange = b.ageRange;
  const device = String(body.device ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  const use = await usageHit(b, device, ip === 'unknown' ? '' : ip, body.mode === 'opening' ? 'opening' : 'chat');
  if (use && (use.device > DEVICE_DAY || use.ip > IP_DAY || use.total > TOTAL_DAY)) {
    if (body.mode === 'opening') return json(b, origin, { error: 'limit' }, 429);
    return json(b, origin, { error: 'limit', reply: 'השיחה עמוסה כרגע. הכי נוח לכתוב להדר ולאופיר בוואטסאפ', chips: [], cta: 'whatsapp' });
  }

  const staticBlock = { type: 'text', text: b.staticPrompt(ageRange), cache_control: { type: 'ephemeral' } };
  const adKey = tx(body.ad).slice(0, 40);
  const adText = b.adTexts[adKey] ?? quoteSafe(tx(body.adText).slice(0, 300));
  const pain = b.adPain[adKey] ?? '';

  const openingStats = (ad: string) => stat<OpeningStat[]>(b.rpc.openingStats, { p_ad: ad, p_limit: 8 }, []);
  const chipStats = (ad: string) => stat<{ liked: string[]; ignored: string[] } | null>(b.rpc.chipStats, { p_ad: ad }, null);
  const offerStats = (ad: string) => stat<OfferStats | null>(b.rpc.offerStats, { p_ad: ad }, null);
  const questionStats = () => stat<QuestionStats | null>(b.rpc.questionStats, { p_ad: null }, null);

  // The opening message is written by the bot, and learns from past openings: what got answered and what did not
  if (body.mode === 'opening') {
    const [stats, q] = await Promise.all([openingStats(adKey), questionStats()]);
    const raw = await claude(apiKey, OPENING_MODEL, [staticBlock, { type: 'text', text: [b.openingPrompt(adText, stats, pain), learningBlock(q)].filter(Boolean).join('\n\n') }], [{ role: 'user', content: 'התחילו.' }], 500);
    const op = raw ? parseOpening(raw) : null;
    if (!op || !op.messages.length) return json(b, origin, { error: 'upstream' }, 502);
    saveLog(b, tx(body.session), tx(body.src).slice(0, 20), adKey, op.messages.map((content) => ({ role: 'assistant', content })), null);
    return json(b, origin, { messages: op.messages, chips: op.chips });
  }

  const built = buildMessages(body.messages);
  if (!built) return json(b, origin, { error: 'messages' }, 400);
  const { clean, merged, turns } = built;
  if (turns > MAX_USER_TURNS) return json(b, origin, { error: 'limit', reply: 'זו כבר שיחה ארוכה. כדי להמשיך, הכי נוח לכתוב להדר ולאופיר בוואטסאפ', chips: [], cta: 'whatsapp' });

  const opening = quoteSafe(tx(body.opening).slice(0, 600));
  // Ready answers: which were offered in the previous message and which was clicked (if any). Recorded without waiting
  const prevChips = (Array.isArray(body.prevChips) ? body.prevChips : []).map((c: unknown) => tx(c).trim().slice(0, 60)).filter(Boolean).slice(0, 4);
  const clicked = tx(body.chipClicked).trim().slice(0, 60);
  if (adKey && prevChips.length) rpc(b.rpc.chip, { p_ad: adKey, p_shown: prevChips, p_clicked: prevChips.includes(clicked) ? clicked : '' }).catch(() => {});
  // The offer the bot made in the previous message (stage and text) and what the person answered it
  const po = body.prevOffer && typeof body.prevOffer === 'object' ? body.prevOffer : null, poStage = tx(po?.stage), poText = lastSentence(tx(po?.text));
  const lastUser = [...clean].reverse().find((m) => m.role === 'user')?.content ?? '';
  if (adKey && poStage && poText) rpc(b.rpc.offer, { p_ad: adKey, p_stage: poStage, p_text: poText, p_outcome: classifyReply(lastUser) }).catch(() => {});
  const [ctx, q, cs, os] = await Promise.all([b.loadContext(), questionStats(), adKey ? chipStats(adKey) : Promise.resolve(null), adKey ? offerStats(adKey) : Promise.resolve(null)]);

  const system = [staticBlock, { type: 'text', text: b.dynamicPrompt(ctx, adText, ageRange, opening, learningBlock(q) + chipBlock(cs) + offerBlock(os), turns, pain) }];

  // Model comparison: only from the business's test site, and only a model from the list (really always the usual model)
  const model = b.testOrigin && origin === b.testOrigin && tx(body.model) === 'claude-haiku-5-5' ? 'claude-haiku-5-5' : MODEL;
  const raw = await claude(apiKey, model, system, merged, 700);
  if (raw === null) return json(b, origin, { error: 'upstream' }, 502);
  let { reply, chips, cta, offer } = parse(raw);
  if (!reply) return json(b, origin, { error: 'empty' }, 502);
  if (cta === 'register' && !ctx) cta = 'updates'; // no meeting to register to
  if (turns >= 7 && !cta && !/[?]\s*$/.test(reply)) cta = ctx ? 'register' : 'updates'; // safety net: a long conversation always gets a next step

  // Saved in the background: it does not delay the reply
  saveLog(b, tx(body.session), tx(body.src).slice(0, 20), adKey, [...clean, { role: 'assistant', content: reply }], cta);

  return json(b, origin, { reply, chips, cta, offer, hasMeeting: !!ctx });
});
