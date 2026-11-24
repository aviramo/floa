// Supabase Edge Function: chatbot. The generic journey engine of floa.co.il, for every business and every segment.
// The business comes from the request (`business`, default harpatka); the journey, research profile and segment come from the
// campaign (`campaign`, the value of ?pain= in the ad link), resolved on the server: the browser never decides pain or segment.
// Per-business facts live in businesses/<key>/ and are registered in businesses/index.ts; the journey is data (chatbot.journeys).
// Deploy: supabase functions deploy chatbot --no-verify-jwt --project-ref aexmnaxvahblveejsbup
// Secrets: ANTHROPIC_API_KEY (set). Optional: CHAT_MODEL (default Sonnet 5.5), CHAT_SALT, CHAT_DEVICE_DAY, CHAT_IP_DAY, CHAT_TOTAL_DAY.
import { lastSentence, buildMessages, MAX_USER_TURNS, parse, parseOpening, quoteSafe } from './parse.ts';
import { BUSINESSES } from './businesses/index.ts';
import { journeyOf } from './journey.ts';
import { openingTask, sessionFacts, stableSystem, stateBlock, addressOf, turnReminder } from './prompt.ts';
import { stripFinalDot, needsQuestionRewrite, oneMessage, oneSentence, stripReferrals, endOnQuestion, revealedGender, openingMeetingFix, scrub, wrongSingular, asksDetails, styleFix, genderChip, chipOk, stripMeeting, deadEndChip, offersUpdates, mentionsOffer, assertsCondition, campaignKey, conditionFix, distressIn, earlyPitchFix, genderFix, neutralize, parseSegment, pitchAllowed, pluralAddress, putsEveningOnTable, repeatedWord, stripGreeting, toSingular, sentencesOf, hasReferral } from './guard.ts';
import { ctaFor, ctasOf, diffEvents, extractState, initialState, linkGender, mergeState, stateFromClient } from './state.ts';
import type { CampaignContext, JourneyBusiness, SessionState } from './types.ts';

const SB_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MODEL = Deno.env.get('CHAT_MODEL') || 'claude-sonnet-5-5';

const isLocal = (o: string) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
const allowed = (b: JourneyBusiness, o: string | null) => !!o && (b.origins.includes(o) || isLocal(o));
const cors = (b: JourneyBusiness, o: string | null) => ({
  'Access-Control-Allow-Origin': allowed(b, o) ? o! : b.origins[0],
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
});
const json = (b: JourneyBusiness, o: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(b, o), 'Content-Type': 'application/json; charset=utf-8' } });

// In-memory rate limit (approximate: every instance counts for itself): 40 requests per 10 minutes per address
const hits = new Map<string, number[]>();
const limited = (ip: string) => {
  const now = Date.now(), arr = (hits.get(ip) ?? []).filter((t) => now - t < 600_000);
  arr.push(now); hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 600_000)) hits.delete(k);
  return arr.length > 40;
};

const tx = (v: unknown) => String(v ?? '').trim();
const fixAddress = (t: string, a: 'female' | 'male' | 'plural') => (a === 'plural' ? t : toSingular(t, a));

// A short chat needs no thinking: it eats max_tokens, slows and costs. Haiku 5.5 is switched off with disabled,
// Sonnet 5.5 with between_tools (disabled is rejected there). Another model: unchanged.
function thinkingOff(model: string): Record<string, unknown> {
  if (model.startsWith('claude-sonnet-5-5')) return { thinking: { type: 'between_tools' } };
  if (model.startsWith('claude-haiku-5-5')) return { thinking: { type: 'disabled' } };
  return {};
}

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

// The last resort when the writer of the reply gave no usable quick replies: people do not type, so a visitor is never left with none.
// It sees the conversation and the last message, and answers only that.
async function chipsFallback(apiKey: string, model: string, a: { reply: string; lastUser: string; address: 'female' | 'male' | 'plural'; recent: string; trace?: unknown[] }): Promise<string[]> {
  const lang = a.address === 'female' ? 'נקבה' : a.address === 'male' ? 'זכר' : 'ניטרלית (בלי פעלים או תארים בגוף ראשון שמסמנים מגדר)';
  const sys = 'כותבים שתי תשובות מוכנות לצ׳אט. עונים בשתי שורות בלבד. שורה ראשונה: "סוג: X", כשהסוג הוא סוג השאלה בסוף ההודעה האחרונה של הבוט (מה, מתי, כמה, איך, למה, כן או לא, בחירה, או הזמנה). שורה שנייה: "תשובות: א|ב". כל תשובה היא משפט אחד קצר וטבעי (ארבע עד שמונה מילים, לא יותר) שהאדם עצמו אומר בגוף ראשון, כתשובה ישירה לשאלה, ומאותו סוג שלה: שאלה על מה נענית במה, על מתי בזמן, על כמה בדרגה, על איך באופן, על למה בסיבה. אם ההודעה היא הזמנה ולא שאלה, כל תשובה היא תחילת סיפור קונקרטי. שתי התשובות מקדמות את השיחה בדרכים שונות, בלי סירוב ובלי ״לא יודע״, כלל קשיח, בלי חריגים: אסור להמציא דבר על חיי האדם. זוגיות, מצב משפחתי, גירושין, פרידה, ילדים, בן או בת זוג, עבודה, הורים וגיל אסורים אלא אם האדם כתב אותם בעצמו בשיחה. ולא על ״מישהו״. לא ניסוח של הבוט ולא שאלה אל הבוט. לשון האדם: ' + lang + '.';
  const raw = await claude(apiKey, model, [{ type: 'text', text: sys }], [{ role: 'user', content: 'השיחה עד עכשיו:\n' + a.recent + '\n\nהודעת הבוט האחרונה (עליה עונים):\n' + a.reply }], 260);
  a.trace?.push({ raw });
  const line = ((raw ?? '').match(/תשובות\s*:\s*(.*)/) ?? [])[1] ?? raw ?? '';
  return line.replace(/<[^>]*>/g, '').split(/[|\n]/).map((s) => s.trim().replace(/^[-•\d.\s]+/, '')).filter((s) => s && s.length <= 100);
}

// The last repair of the question rule: one short call that turns the reply into at most two sentences, a statement and then exactly one question about the content.
// Used only when the draft and its retry still broke the rule.
async function forceQuestion(apiKey: string, model: string, a: { reply: string; recent: string; address: 'female' | 'male' | 'plural' }): Promise<string | null> {
  const lang = a.address === 'female' ? 'נקבה' : a.address === 'male' ? 'זכר' : 'רבים';
  const sys = 'כותבים מחדש הודעה של בוט בשיחה. מקבלים את השיחה ואת הטיוטה. כותבים הודעה של שני משפטים לכל היותר: המשפט הראשון (אופציונלי) מכיר במה שהאדם אמר ואינו שאלה, והמשפט האחרון הוא שאלה אחת ממוקדת על התוכן (מה קורה, מתי, איך זה מרגיש), שנשענת על מה שהאדם אמר ומסתיימת בסימן שאלה אחד, בלי שתי שאלות ובלי לדבר על השיחה עצמה. בלי להמציא דבר על חיי האדם. פונים בלשון ' + lang + '. מחזירים את ההודעה בלבד.';
  const raw = await claude(apiKey, model, [{ type: 'text', text: sys }], [{ role: 'user', content: 'השיחה עד עכשיו:\n' + a.recent + '\n\nהטיוטה שצריך לשכתב:\n' + a.reply }], 160);
  const out = (raw ?? '').replace(/<[^>]*>/g, '').replace(/\s*\n+\s*/g, ' ').trim();
  return out && /\?\s*$/.test(out) ? out : null;
}

// The first bubble of a scripted turn: ONE short sentence that reflects what the visitor tapped or wrote. It is not a question and it leads nowhere: the next bubble is pre-written.
// Anything that breaks a rule returns null and the page shows the pre-written reaction instead. Nothing is saved.
function cleanReaction(raw: string | null, address: 'female' | 'male' | 'plural', b: JourneyBusiness): string | null {
  let r = String(raw ?? '').replace(/<[^>]*>/g, '').replace(/\s*\n+\s*/g, ' ').trim().replace(/^["״“]+|["״”]+$/g, '');
  r = fixAddress(neutralize(r), address);
  r = r.replace(/^(מבינה|מבין|שומעת|שומע) ש/, 'נשמע ש');   // the bot has no gender: an opening verb about itself becomes "it sounds that"
  if (/^(מבינה|מבין|שומעת|שומע|רואה|מרגישה|מרגיש)(\s|$)/.test(r)) return null;
  const first = sentencesOf(r).find((p) => !/\?/.test(p)) ?? '';
  r = stripFinalDot(first);
  if (!r || r.split(/\s+/).length > 6 || /(מוכר|אמיתי|אותי|הרבה זמן|כל הזמן|תמיד|לאורך|בגלל|כנראה|בטח|נשמע כמו משהו|מלווה|קשור ל|אופי|דפוס)/.test(r) || r.length > 140 || /[—–]/.test(r) || mentionsOffer(r, b.lexicon.offerWords) || hasReferral(r)) return null;
  return r;
}

// The second step of a turn: the quick replies are made from the FINAL message the visitor sees (the first step already sent it), checked once, written again once if they fail.
async function makeChips(apiKey: string, model: string, a: { reply: string; lastUser: string; address: 'female' | 'male' | 'plural'; recent: string; pitchOk: boolean; offerWords: RegExp; trace?: unknown[] }): Promise<string[]> {
  const keep = (arr: string[]) => arr.filter((c) => !c.includes('/') && !repeatedWord(c) && !deadEndChip(c) && chipOk(c) && (a.pitchOk || !mentionsOffer(c, a.offerWords))).map((c) => genderChip(c, a.address));
  let chips: string[] = [];
  const pool: string[] = [];   // everything that passed the form checks, so a vetoed reply can still fill a missing place
  for (let k = 0; k < 3 && chips.length < 2; k++) {
    const have = chips.length ? '\nתשובה אחת כבר יש: "' + chips[0] + '". כתבו תשובה אחרת ממנה, מאותו סוג של השאלה.' : (k ? '\nהניסיון הקודם נפסל. כתבו שתי תשובות שמתאימות לסוג השאלה.' : '');
    const made = keep(await chipsFallback(apiKey, model, { reply: a.reply, lastUser: a.lastUser, address: a.address, recent: a.recent + have, trace: a.trace }));
    pool.push(...made);
    chips = [...new Set([...chips, ...made])].slice(0, 2);
    if (chips.length === 2 && k < 2) {
      const verdict = await chipsCheck(apiKey, a.reply, chips);
      if (verdict.some((v) => !v)) { a.trace?.push({ vetoed: chips, verdict }); console.log(JSON.stringify({ chips_vetoed: chips, verdict })); chips = chips.filter((_, i) => verdict[i]); }
    }
  }
  if (chips.length < 2) chips = [...new Set([...chips, ...pool])].slice(0, 2);
  return chips.map(stripFinalDot);
}

// A quick reply is checked by a model before the visitor sees it: does it answer the kind of question asked (what, when, how, how much, why), is it said in the first person,
// and does it sound like something a person would say. A reply that fails is written again once. Any failure of the check itself lets the replies through.
const CHECK_MODEL = 'claude-haiku-5-5';
async function chipsCheck(apiKey: string, reply: string, chips: string[]): Promise<boolean[]> {
  const sys = 'בודקים תשובות מוכנות לצ׳אט. מקבלים הודעה של בוט ושתי תשובות שהאדם יכול ללחוץ עליהן. לכל תשובה עונים true רק אם כולם נכונים: (1) היא עונה על סוג השאלה בסוף ההודעה (שאלה על מה נענית במה, על מתי בזמן, על איך באופן, על עד כמה בדרגה, על למה בסיבה); (2) היא נאמרת בגוף ראשון של האדם; (3) היא נשמעת כמו משהו שאדם אומר באמת, בלי דימוי מוזר או פרט מומצא. אחרת false. עונים אך ורק במערך JSON של שני ערכים, למשל [true,false].';
  const raw = await claude(apiKey, CHECK_MODEL, [{ type: 'text', text: sys }], [{ role: 'user', content: 'הודעת הבוט:\n' + reply + '\n\nתשובה 1: ' + chips[0] + '\nתשובה 2: ' + chips[1] }], 40);
  const m = (raw ?? '').match(/\[[^\]]*\]/);
  if (!m) return chips.map(() => true);
  try { const a = JSON.parse(m[0]); return chips.map((_, i) => a[i] !== false); } catch (_) { return chips.map(() => true); }
}

const rpc = (name: string, args: Record<string, unknown>) =>
  fetch(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });

// The rule-violation log (all businesses): every time the agent broke a hard rule and the server corrected it, one row. Never awaited, never fails the reply.
function logViolation(b: JourneyBusiness, session: string, rule: string, before: string, after: string, fixed = true) {
  if (!SB_SERVICE || !SB_URL) return;
  rpc('chatbot_violation', { p_business: b.key, p_session: session || null, p_rule: rule, p_before: before, p_after: after, p_fixed: fixed }).catch(() => {});
}

// Abuse guard: every call is recorded (a random device id plus a hash of the network address, never the address) and the
// database returns how many calls there were in 24 hours. A failure of the guard never stops the chat.
const DEVICE_DAY = Number(Deno.env.get('CHAT_DEVICE_DAY')) || 80, IP_DAY = Number(Deno.env.get('CHAT_IP_DAY')) || 400, TOTAL_DAY = Number(Deno.env.get('CHAT_TOTAL_DAY')) || 2000;
async function sha(t: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32); }
async function usageHit(b: JourneyBusiness, device: string, ip: string, mode: string): Promise<{ device: number; ip: number; total: number } | null> {
  if (!SB_URL || !SB_SERVICE || !b.rpc.usage) return null;
  try {
    const r = await rpc(b.rpc.usage, { p_device: device, p_ip: ip ? await sha(ip + (Deno.env.get('CHAT_SALT') ?? b.saltDefault)) : '', p_mode: mode });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

// The campaign of this session. A row in chatbot.campaigns wins; an old ad key without a row still works as a campaign built from
// the business's own ad table; anything else is a plain session of the default journey (no ad, no hypothesis, no invented research).
// The campaign a link names by its separate parameters: the pain and the segment (one parameter per dimension).
async function loadByParams(b: JourneyBusiness, pain: string, segment: Record<string, string>): Promise<CampaignContext | null> {
  if (!SB_URL || !SB_SERVICE || !pain) return null;
  try {
    const r = await rpc('chatbot_session_context_for', { p_business: b.key, p_topic: pain, p_segment: segment });
    if (r.ok) { const d = await r.json(); if (d && d.campaign) return { ...d, insights: d.insights ?? [] } as CampaignContext; }
  } catch (_) { /* falls through to the campaign-name lookup */ }
  return null;
}

async function loadContext(b: JourneyBusiness, campaignId: string): Promise<CampaignContext> {
  if (SB_URL && SB_SERVICE && campaignId) {
    try {
      const r = await rpc('chatbot_session_context', { p_business: b.key, p_campaign: campaignId });
      if (r.ok) { const d = await r.json(); if (d && d.campaign) return { ...d, insights: d.insights ?? [] } as CampaignContext; }
    } catch (_) { /* falls through to the legacy key */ }
  }
  const ad = b.adTexts[campaignId];
  return {
    campaign: { id: campaignId, journey_type: 'pain', topic_id: null, segment_filters: {}, creative: ad ? { ad } : {} },
    journey: null, content_version_id: null, profile: null, insights: [],
    hypothesis: b.adPain[campaignId] || undefined,
  };
}

// Saved in the background: the conversation, its state, and the funnel events. Never delays the reply.
async function persist(b: JourneyBusiness, session: string, src: string, campaign: string, messages: unknown[], cta: string | null, state: SessionState, events: ReturnType<typeof diffEvents>) {
  if (!SB_SERVICE || !SB_URL || !/^[0-9a-f-]{36}$/i.test(session)) return;
  try {
    await rpc('chatbot_log', { p_business: b.key, p_id: session, p_source: src || null, p_ad: campaign || null, p_messages: messages, p_cta: cta });
    await rpc('chatbot_state', { p_business: b.key, p_id: session, p_state: state, p_milestone: state.milestone, p_readiness: state.readiness, p_outcome: ['register', 'updates', 'guide', 'end', 'safety'].includes(state.action) ? state.action : null });
    for (const e of events) await rpc('chatbot_event', { p_business: b.key, p_session: session, p_type: e.type, p_milestone: e.milestone, p_data: e.data });
  } catch (_) { /* a save failure never fails the reply */ }
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

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json(b, origin, { error: 'rate' }, 429);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json(b, origin, { error: 'config' }, 500);
  if (!body) return json(b, origin, { error: 'body' }, 400);

  const device = String(body.device ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  if (body.mode === 'chips') {
    const segC = parseSegment(body.segment ?? (body.gender ? { gender: body.gender } : {}));
    const msgsC: { role: string; content: string }[] = (Array.isArray(body.messages) ? body.messages : []).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant')).slice(-12).map((m: any) => ({ role: String(m.role), content: String(m.content ?? '').slice(0, 1500) }));
    const lastBot = [...msgsC].reverse().find((m) => m.role === 'assistant');
    if (!lastBot) return json(b, origin, { chips: [] });
    const userTexts = msgsC.filter((m) => m.role === 'user').map((m) => m.content);
    const lastUserC = userTexts.length ? userTexts[userTexts.length - 1] : '';
    const addressC = addressOf(revealedGender(userTexts) ?? linkGender(segC));
    const pitchC = pitchAllowed({ turns: userTexts.length, lastUser: lastUserC, prevDone: [], prevReadiness: '' });
    const recentC = msgsC.slice(-6).map((m) => (m.role === 'user' ? 'האדם: ' : 'הבוט: ') + m.content.slice(0, 300)).join('\n');
    const traceC: unknown[] = [];
    const chipsC = await makeChips(apiKey, MODEL, { reply: lastBot.content, lastUser: lastUserC, address: addressC, recent: recentC, pitchOk: pitchC, offerWords: b.lexicon.offerWords, trace: traceC });
    for (const t of traceC as any[]) if (t && t.vetoed) logViolation(b, /^[0-9a-f-]{36}$/i.test(tx(body.session)) ? tx(body.session) : '', 'chips_vetoed', JSON.stringify(t.vetoed), JSON.stringify(chipsC));
    return json(b, origin, { chips: chipsC, ...(device.startsWith('selftest') ? { dbg: traceC } : {}) });
  }

  if (body.mode === 'react') {
    const textR = tx(body.text).slice(0, 600), questionR = tx(body.question).slice(0, 300);
    const viaText = body.source === 'text';
    if (!textR) return json(b, origin, { reaction: null });
    if (distressIn(textR)) return json(b, origin, { safety: true, reaction: null });   // a crisis in the visitor's words: the page shows its fixed answer
    const segR = parseSegment(body.segment ?? (body.gender ? { gender: body.gender } : {}));
    const addressR = addressOf(revealedGender([textR]) ?? linkGender(segR));
    const langR = addressR === 'female' ? 'נקבה' : addressR === 'male' ? 'זכר' : 'רבים';
    const sysR = 'כותבים תגובה אמפתית קצרה בצ׳אט של "יוצאים להרפתקה". התפקיד היחיד הוא אמפתיה: משפט אחד קצר, עד שש מילים, שמראה שהקשבת, למשל "זה נשמע לא פשוט", "תודה ששיתפת", "זה מובן". אסור: לפרש, להסביר, לאפיין את האדם או את מצבו, לומר שזה מוכר או אמיתי, להתייחס אל עצמך ("אותי"), להשלים רעיונות שכתב, לחזור על מה שכתב במילים אחרות, להזכיר משך זמן או סיבה, לייעץ או לשאול. אם האדם שאל שאלה, כותבים רק "שאלה טובה, נגיע לזה בהמשך". בלי נקודה בסוף. הבוט עצמו בלי מגדר. פונים אל האדם בלשון ' + langR + ' אם צריך. מחזירים את המשפט בלבד.';
    const adR = tx(body.ad).slice(0, 300);
    const histR = (Array.isArray(body.history) ? body.history : []).slice(-10).map((h: any) => (h && h.r === 'user' ? 'האדם: ' : 'הבוט: ') + tx(h && h.t).slice(0, 300)).join('\n');
    const genderLine = 'מגדר האדם: ' + (addressR === 'female' ? 'אישה' : addressR === 'male' ? 'גבר' : 'לא ידוע');
    const adLine = adR ? 'האדם ראה מודעה בפייסבוק עם הטקסט הזה: "' + adR + '"' : '';
    const histLine = histR ? 'השיחה עד עכשיו:\n' + histR : '';
    const askLine = 'השאלה האחרונה של הבוט: ' + (questionR || '(פתיחה)') + '\nמה האדם ענה (' + (viaText ? 'בכתיבה חופשית' : 'בלחיצה על כפתור') + '): ' + textR;
    const rawR = await claude(apiKey, MODEL, [{ type: 'text', text: sysR }], [{ role: 'user', content: [genderLine, adLine, histLine, askLine].filter(Boolean).join('\n\n') }], 80);
    const reaction = cleanReaction(rawR, addressR, b);
    if (!reaction) console.log(JSON.stringify({ react_dropped: true, raw: String(rawR ?? '').slice(0, 160) }));
    return json(b, origin, { reaction });
  }

  const use = await usageHit(b, device, ip === 'unknown' ? '' : ip, body.mode === 'opening' ? 'opening' : 'chat');
  if (use && (use.device > DEVICE_DAY || use.ip > IP_DAY || use.total > TOTAL_DAY)) {
    if (body.mode === 'opening') return json(b, origin, { error: 'limit' }, 429);
    return json(b, origin, { error: 'limit', reply: b.lexicon.busyMessage, chips: [], cta: 'whatsapp' });
  }

  const legacyKey = tx(body.campaign ?? body.ad).slice(0, 40);   // an old link with the single parameter ?pain=touch
  const pain = tx(body.pain ?? legacyKey).slice(0, 40).toLowerCase();
  const segment = parseSegment(body.segment ?? (body.gender ? { gender: body.gender } : {}));
  const campaignId = campaignKey(pain, segment.gender).slice(0, 60);   // a label for the saved conversation
  let ctx = await loadByParams(b, pain, segment) ?? await loadContext(b, campaignId);
  if (!ctx.campaign.topic_id && legacyKey && legacyKey !== campaignId) ctx = await loadContext(b, legacyKey);
  (ctx as any).brief = b.painBriefs?.[pain] ?? b.painBriefs?.[legacyKey ?? ''];   // the pain's briefing, from the owner's research   // not a campaign: maybe an old ad key
  const journey = journeyOf(ctx.journey);
  const adText = tx(ctx.campaign.creative?.ad) || quoteSafe(tx(body.adText).slice(0, 300));
  if (!adText) { console.warn(JSON.stringify({ missing_ad_text: true, business: b.key, pain })); logViolation(b, '', 'missing_ad_text', pain, '', false); }   // every campaign of every business must carry the text of its ad (creative.ad)
  const meta = { campaign: campaignId, journeyType: journey.type, topicId: ctx.campaign.topic_id, segment: ctx.campaign.segment_filters, contentVersionId: ctx.content_version_id, journeyVersion: journey.version };
  const fromLink = linkGender(ctx.campaign.segment_filters) ?? linkGender(segment);   // the link itself says the gender even when no campaign row exists for it
  const stable = { type: 'text', text: b.flowPrompt ?? stableSystem(b, journey), cache_control: { type: 'ephemeral' } };
  const src = tx(body.src).slice(0, 20), session = tx(body.session);
  // Model comparison: only from the business test site, and only a model from the list. Everyone else gets the usual model.
  const model = b.testOrigin && origin === b.testOrigin && ['claude-haiku-5-5', 'claude-sonnet-5-5'].includes(tx(body.model)) ? tx(body.model) : MODEL;

  // The opening is written by the bot: milestone one
  if (body.mode === 'opening') {
    const openSystem = [stable, { type: 'text', text: [sessionFacts(b, { ...ctx, brief: undefined, hypothesis: undefined, profile: null } as any, null, adText, addressOf(fromLink)), openingTask(b, adText, addressOf(fromLink), ctx.profile?.title ?? '')].join('\n\n') }];
    let raw = await claude(apiKey, model, openSystem, [{ role: 'user', content: 'התחילו.' }], 800);
    let op = raw ? parseOpening(raw) : null;
    const fixes: { type: string; text: string }[] = [];
    if (fromLink && op && op.messages.some(pluralAddress)) fixes.push({ type: 'text', text: genderFix(fromLink) });   // a woman or a man was addressed in the plural
    if (op && op.messages.some(assertsCondition)) fixes.push({ type: 'text', text: conditionFix });
    if (op && op.messages.some((m: string) => mentionsOffer(m, b.lexicon.offerWords))) fixes.push({ type: 'text', text: openingMeetingFix });   // the opening must not describe the activity                   // the opening stated the visitor's condition
    if (op && fixes.length) {   // one more try, told exactly why
      const raw2 = await claude(apiKey, model, [...openSystem, ...fixes], [{ role: 'user', content: 'התחילו.' }], 800);
      const op2 = raw2 ? parseOpening(raw2) : null;
      if (op2 && op2.messages.length) op = op2;
    }
    if (op) op.messages = op.messages.map((m) => stripFinalDot(fixAddress(neutralize(m), addressOf(fromLink))));
    if (op) op.chips = [];   // the second step makes them from the message as it is shown
    if (!op || !op.messages.length) return json(b, origin, { error: 'upstream' }, 502);
    const st: SessionState = { ...initialState(journey, fromLink), meta };
    persist(b, session, src, campaignId, op.messages.map((content) => ({ role: 'assistant', content })), null, st, []);
    return json(b, origin, { messages: op.messages, chips: [], chipsPending: true, state: st });
  }

  const built = buildMessages(body.messages);
  if (!built) return json(b, origin, { error: 'messages' }, 400);
  const { clean, merged, turns } = built;
  if (turns > MAX_USER_TURNS) return json(b, origin, { error: 'limit', reply: b.lexicon.tooLongMessage, chips: [], cta: 'whatsapp' });

  const prev = stateFromClient(body.state, journey, fromLink);
  const address = addressOf(revealedGender(clean.filter((m: any) => m.role === 'user').map((m: any) => String(m.content))) ?? prev.gender);   // what the visitor says about themselves wins over the link   // the saved gender parameter, not the link again
  const botMessages = clean.filter((m) => m.role === 'assistant').length;
  const facts = b.siteOnly ? null : await b.loadFacts();
  const system = [stable, { type: 'text', text: [b.stageHints ? b.stageHints(turns) : stateBlock(prev, journey, botMessages), sessionFacts(b, ctx, facts, adText, address), quoteSafe(tx(body.opening).slice(0, 600)) ? `## הודעת הפתיחה שהאדם כבר קיבל\n"${quoteSafe(tx(body.opening).slice(0, 600))}"` : '', b.flowReminder ? b.flowReminder(address) : turnReminder(address)].filter(Boolean).join('\n\n') }];

  // Priority one, second net: the visitor's last message shows severe distress. The model is told too, and its reply stands.
  const lastUser = [...clean].reverse().find((m) => m.role === 'user')?.content ?? '';
  const distress = distressIn(lastUser);
  if (distress) system.push({ type: 'text', text: '## זוהתה מצוקה קשה בהודעה האחרונה\nזה קודם לכל דבר אחר: action=safety. עונים באמפתיה ובקצרה, ומפנים אך ורק לשיחה עכשיו עם הדר ואופיר (בני אדם אמיתיים). לא מזכירים ער"ן, קו חם או איש מקצוע. בלי מפגש, מחיר, הרשמה או שאלות על המודעה.' });

  let raw = await claude(apiKey, model, system, merged, 1400);
  if (raw === null) raw = await claude(apiKey, model, system, merged, 1400);   // one more try: an upstream hiccup must not end a conversation
  if (raw === null) return json(b, origin, { error: 'upstream' }, 502);
  let { text, state: incoming } = extractState(raw);
  let parsed = parse(text); parsed.reply = scrub(parsed.reply);
  // One more try, told exactly why, when the reply still speaks to a woman or a man in the plural, or offers the evening before the visitor reacted to the bridge
  const replyFixes: { type: string; text: string }[] = [];
  const hits: string[] = [];   // the names of the rules the draft broke
  if (address !== 'plural' && pluralAddress(parsed.reply)) { replyFixes.push({ type: 'text', text: genderFix(address) }); hits.push('gender_plural'); }
  if (!distress && (putsEveningOnTable(parsed.reply) || mentionsOffer(parsed.reply, b.lexicon.offerWords)) && !pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness })) { replyFixes.push({ type: 'text', text: earlyPitchFix }); hits.push('offer_too_early'); }
  if (address !== 'plural' && wrongSingular(parsed.reply, address)) { replyFixes.push({ type: 'text', text: genderFix(address) }); hits.push('gender_wrong_form'); }
  if (!parsed.reply) { hits.push('empty_reply'); replyFixes.push({ type: 'text', text: '## חסר טקסט\nהתשובה הקודמת הייתה רק סימונים. כתבו הודעה קצרה לאדם לפני הסימונים.' }); }
  { const sf = styleFix(parsed.reply, lastUser, clean.filter((m: any) => m.role === 'user').map((m: any) => String(m.content)).join(' ')); if (sf) { replyFixes.push({ type: 'text', text: sf }); for (const p of sf.replace(/^## תיקון\nהטיוטה: /, '').replace(/\. כתבו שוב.*$/s, '').split('; ')) hits.push('style: ' + p.slice(0, 48)); } }
  const draftReply = parsed.reply;
  if (replyFixes.length) {
    const raw2 = await claude(apiKey, model, [...system, ...replyFixes], merged, 1400);
    if (raw2) { const o2 = extractState(raw2), p2 = parse(o2.text); if (p2.reply) { text = o2.text; incoming = o2.state; parsed = p2; parsed.reply = scrub(parsed.reply); } }
  }
  const pitchOk = pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness });
  // Quick replies never name the evening or its people before the visitor may hear about them, and never offer "I have a question"
  let chips = parsed.chips.filter((c) => !c.includes('/') && !repeatedWord(c) && !deadEndChip(c) && (pitchOk || !mentionsOffer(c, b.lexicon.offerWords)) && chipOk(c)).map((c) => genderChip(c, address));
  let replyText = parsed.reply;
  if (!distress && !pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness }) && mentionsOffer(replyText, b.lexicon.offerWords)) replyText = stripMeeting(replyText, b.lexicon.offerWords);   // told once already
  let reply = fixAddress(stripGreeting(neutralize(replyText)), address);
  if (!reply) return json(b, origin, { reply: b.lexicon.fallbackReply, chips: ['קצת עוד', 'איך זה נראה בפועל', 'לא כרגע'], cta: null, ctas: [], state: prev, hasFacts: !!b.siteOnly, hasMeeting: false });   // the model sent only marks twice: a short human line, never an error page
  // A question that offers a choice ("A or B") is not answered by a bare yes or no
  if (/\sאו\s/.test(lastSentence(reply))) chips = chips.filter((c) => !/^(כן|לא)(,.*)?$/.test(c.trim()));

  const next = { ...mergeState(prev, incoming, journey), meta };
  if (distress) next.action = 'safety';   // detected from the visitor's words, not left to the model
  const r0 = reply;
  reply = stripReferrals(reply, distress, b.lexicon.crisisDoor, /הדר/);   // never a hotline, emergency services or a professional
  if (reply !== r0) hits.push('referral_cut');
  const r1 = reply;
  if (!distress && next.action !== 'safety' && next.action !== 'end') reply = oneMessage(oneSentence(endOnQuestion(reply)));   // one sentence in one message, and it is the question
  if (!distress && next.action !== 'safety' && next.action !== 'end' && needsQuestionRewrite(reply)) {
    const recentQ = clean.slice(-6).map((m: any) => (m.role === 'user' ? 'האדם: ' : 'הבוט: ') + String(m.content).slice(0, 300)).join('\n');
    hits.push('forced_question_rewrite');
    const q = await forceQuestion(apiKey, model, { reply, recent: recentQ, address });
    if (q) reply = oneMessage(oneSentence(fixAddress(neutralize(q), address)));
  }
  if (reply !== r1) hits.push('tail_after_question_cut');
  { const sess = /^[0-9a-f-]{36}$/i.test(session) ? session : ''; const allUser = clean.filter((m: any) => m.role === 'user').map((m: any) => String(m.content)).join(' '); const still = !!styleFix(reply, lastUser, allUser); for (const h of hits) logViolation(b, sess, h, draftReply, reply, !still); }
  if (!incoming) next.action = 'continue';      // a reply without a state block advances nothing
  if (distress) { next.action = 'safety'; next.readiness = 'concerned'; }
  let cta: 'register' | 'whatsapp' | 'updates' | null = b.flowPrompt ? ((['register', 'whatsapp', 'updates'] as const).find((c) => c === parsed.cta) ?? null) : ctaFor(next.action, !!facts);
  if (b.flowPrompt && cta === 'register' && !facts && !b.siteOnly) cta = 'updates';
  if (b.flowPrompt && cta && !distress) next.action = cta === 'whatsapp' ? 'guide' : cta;   // never over a crisis: safety stays
  if (next.action === 'safety' || next.action === 'end') { cta = null; chips = []; }
  // Someone is never left with only a text box: when the model sent no quick replies, neutral ones are offered
  if (next.action === 'safety') { cta = 'whatsapp'; chips = ['אני רוצה לדבר עם הדר ואופיר עכשיו', 'יש לי מישהו לדבר איתו', 'אני לא בסכנה, רק קשה לי']; }   // in a crisis too, answers to tap and not only a text box
  // Registrations are the point of the paid ad: the page offers the evening from the third message of the visitor, or at once when the reply itself
  // gives the date and the price, unless the visitor ended it or said no
  const putsTheEveningOnTheTable = /\d{1,2}\.\d{1,2}/.test(reply) && /(בשעה|ש"ח)/.test(reply);
  // The link to the site appears only once the evening was actually put on the table (this reply or an earlier one), never before
  const eveningSeen = putsTheEveningOnTheTable || clean.some((m: any) => m.role === 'assistant' && /\d{1,2}\.\d{1,2}/.test(String(m.content)) && /(בשעה|ש"ח)/.test(String(m.content)));
  if (next.action !== 'safety') chips = [];   // the second step makes them from the final message (the safety mode keeps its fixed ones)
  if (cta === 'register' && !(b.siteOnly ? pitchOk : eveningSeen)) cta = null;
  if (b.siteOnly && cta === 'whatsapp' && next.action !== 'safety' && !pitchOk) cta = null;   // a conversation with the facilitators is not offered before the meeting stage
  if (b.siteOnly && !cta && pitchOk && /(באתר|בקישור|\blink\b|website)/i.test(reply) && next.action !== 'safety') cta = 'register';   // the reply points at the site: the button is the way there
  if (b.siteOnly && !cta && pitchOk && asksDetails(lastUser) && next.action !== 'safety') cta = 'register';   // asked when, how much, how to register: the site link is the answer
  if (!cta && offersUpdates(reply) && next.action !== 'safety') cta = 'updates';
  // The button to the site is always introduced in words, in the message itself
  if (b.siteOnly && cta === 'register' && !/(באתר|אתר)/.test(reply)) reply = reply.replace(/\s*$/, '') + ' אשמח להפנות אותך לאתר, שם אפשר לקרוא עוד.';
  if (!cta && facts && putsTheEveningOnTheTable && !['end', 'safety'].includes(next.action) && next.readiness !== 'not_fit') cta = 'register';

  reply = stripFinalDot(reply);   // no full stop after the last sentence
  persist(b, session, src, campaignId, [...clean, { role: 'assistant', content: reply }], cta, next, diffEvents(prev, next));
  return json(b, origin, { reply, chips, chipsPending: next.action !== 'safety' && next.action !== 'end', cta, ctas: ctasOf(cta as any, b.siteOnly ? pitchOk : !!facts && eveningSeen), state: next, hasFacts: !!facts || !!b.siteOnly, hasMeeting: !!facts });
});

