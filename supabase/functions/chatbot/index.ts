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
import { revealedGender, openingMeetingFix, scrub, wrongSingular, asksDetails, styleFix, genderChip, chipOk, stripMeeting, deadEndChip, TOPIC_POOL, offersUpdates, mentionsEvening, CHAT_POOL, OPENING_POOL, padChips, assertsCondition, campaignKey, conditionFix, distressIn, earlyPitchFix, genderFix, neutralize, parseSegment, pitchAllowed, pluralAddress, putsEveningOnTable, repeatedWord, stripGreeting, toSingular } from './guard.ts';
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

// The model gave fewer than three quick replies: ask once, in a short call, for answers to the last question of this very message.
// A fixed list can never fit every question, so it is only the last resort.
async function chipsFor(apiKey: string, model: string, a: { reply: string; lastUser: string; address: 'female' | 'male' | 'plural'; pitchOk: boolean }): Promise<string[]> {
  const lang = a.address === 'female' ? 'נקבה' : a.address === 'male' ? 'זכר' : 'ניטרלית (בלי פעלים או תארים בגוף ראשון שמסמנים מגדר)';
  const sys = 'כותבים תשובות מוכנות לצ׳אט. עונים בשורה אחת בלבד: שלוש עד ארבע תשובות, מופרדות ב-|. כל תשובה היא משפט קצר (שתיים עד חמש מילים) שהאדם עצמו אומר, בגוף ראשון, כתשובה בדיוק לשאלה האחרונה בהודעת הבוט. לא ניסוח של הבוט ולא שאלה אל הבוט (חוץ מ״איך זה נראה בפועל״ ו״איך נרשמים״), לא נקטע באמצע, בלי נקודתיים ובלי ״יש לי שאלה״. לשון האדם: ' + lang + '. בשאלת בחירה (א או ב) התשובות הן א, ב ועוד אחת. ' +
    'לפחות אחת התשובות ממשיכה את השיחה בכיוון חיובי או סקרן ולא רק סירוב. ' + (a.pitchOk ? 'אחת התשובות מקדמת בעדינות: ״רוצה לשמוע עוד״ או ״איך נרשמים״.' : 'אסור תשובה שמזכירה מפגש, ערב או מנחים.');
  const raw = await claude(apiKey, model, [{ type: 'text', text: sys }], [{ role: 'user', content: 'מה שהאדם כתב: ' + a.lastUser.slice(0, 200) + '\nהודעת הבוט:\n' + a.reply }], 120);
  return (raw ?? '').replace(/<[^>]*>/g, '').split(/[|\n]/).map((s) => s.trim().replace(/^[-•\d.\s]+/, '')).filter((s) => s && s.length <= 30);
}

const rpc = (name: string, args: Record<string, unknown>) =>
  fetch(SB_URL + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });

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
  const use = await usageHit(b, device, ip === 'unknown' ? '' : ip, body.mode === 'opening' ? 'opening' : 'chat');
  if (use && (use.device > DEVICE_DAY || use.ip > IP_DAY || use.total > TOTAL_DAY)) {
    if (body.mode === 'opening') return json(b, origin, { error: 'limit' }, 429);
    return json(b, origin, { error: 'limit', reply: 'השיחה עמוסה כרגע. הכי נוח לכתוב להדר ולאופיר בוואטסאפ', chips: [], cta: 'whatsapp' });
  }

  const legacyKey = tx(body.campaign ?? body.ad).slice(0, 40);   // an old link with the single parameter ?pain=touch
  const pain = tx(body.pain ?? legacyKey).slice(0, 40).toLowerCase();
  const segment = parseSegment(body.segment ?? (body.gender ? { gender: body.gender } : {}));
  const campaignId = campaignKey(pain, segment.gender).slice(0, 60);   // a label for the saved conversation
  let ctx = await loadByParams(b, pain, segment) ?? await loadContext(b, campaignId);
  if (!ctx.campaign.topic_id && legacyKey && legacyKey !== campaignId) ctx = await loadContext(b, legacyKey);   // not a campaign: maybe an old ad key
  const journey = journeyOf(ctx.journey);
  const adText = tx(ctx.campaign.creative?.ad) || quoteSafe(tx(body.adText).slice(0, 300));
  const meta = { campaign: campaignId, journeyType: journey.type, topicId: ctx.campaign.topic_id, segment: ctx.campaign.segment_filters, contentVersionId: ctx.content_version_id, journeyVersion: journey.version };
  const fromLink = linkGender(ctx.campaign.segment_filters);
  const stable = { type: 'text', text: b.flowPrompt ?? stableSystem(b, journey), cache_control: { type: 'ephemeral' } };
  const src = tx(body.src).slice(0, 20), session = tx(body.session);
  // Model comparison: only from the business test site, and only a model from the list. Everyone else gets the usual model.
  const model = b.testOrigin && origin === b.testOrigin && ['claude-haiku-5-5', 'claude-sonnet-5-5'].includes(tx(body.model)) ? tx(body.model) : MODEL;

  // The opening is written by the bot: milestone one
  if (body.mode === 'opening') {
    const openSystem = [stable, { type: 'text', text: [sessionFacts(b, ctx, null, adText, addressOf(fromLink)), openingTask(b, adText, addressOf(fromLink), ctx.profile?.title ?? '')].join('\n\n') }];
    let raw = await claude(apiKey, model, openSystem, [{ role: 'user', content: 'התחילו.' }], 800);
    let op = raw ? parseOpening(raw) : null;
    const fixes: { type: string; text: string }[] = [];
    if (fromLink && op && op.messages.some(pluralAddress)) fixes.push({ type: 'text', text: genderFix(fromLink) });   // a woman or a man was addressed in the plural
    if (op && op.messages.some(assertsCondition)) fixes.push({ type: 'text', text: conditionFix });
    if (op && op.messages.some(mentionsEvening)) fixes.push({ type: 'text', text: openingMeetingFix });   // the opening must not describe the activity                   // the opening stated the visitor's condition
    if (op && fixes.length) {   // one more try, told exactly why
      const raw2 = await claude(apiKey, model, [...openSystem, ...fixes], [{ role: 'user', content: 'התחילו.' }], 800);
      const op2 = raw2 ? parseOpening(raw2) : null;
      if (op2 && op2.messages.length) op = op2;
    }
    if (op) op.messages = op.messages.map((m) => fixAddress(neutralize(m), addressOf(fromLink)));
    if (op) op.chips = padChips(op.chips.filter((c) => !c.includes('/') && !repeatedWord(c)), OPENING_POOL);   // "לא יודע/ת" is gendered; the plain filter misses the slash form
    if (!op || !op.messages.length) return json(b, origin, { error: 'upstream' }, 502);
    const st: SessionState = { ...initialState(journey, fromLink), meta };
    persist(b, session, src, campaignId, op.messages.map((content) => ({ role: 'assistant', content })), null, st, []);
    return json(b, origin, { messages: op.messages, chips: op.chips, state: st });
  }

  const built = buildMessages(body.messages);
  if (!built) return json(b, origin, { error: 'messages' }, 400);
  const { clean, merged, turns } = built;
  if (turns > MAX_USER_TURNS) return json(b, origin, { error: 'limit', reply: 'זו כבר שיחה ארוכה. כדי להמשיך, הכי נוח לכתוב להדר ולאופיר בוואטסאפ', chips: [], cta: 'whatsapp' });

  const prev = stateFromClient(body.state, journey, fromLink);
  const address = addressOf(revealedGender(clean.filter((m: any) => m.role === 'user').map((m: any) => String(m.content))) ?? prev.gender);   // what the visitor says about themselves wins over the link   // the saved gender parameter, not the link again
  const botMessages = clean.filter((m) => m.role === 'assistant').length;
  const facts = b.siteOnly ? null : await b.loadFacts();
  const system = [stable, { type: 'text', text: [b.stageHints ? b.stageHints(turns) : stateBlock(prev, journey, botMessages), sessionFacts(b, ctx, facts, adText, address), quoteSafe(tx(body.opening).slice(0, 600)) ? `## הודעת הפתיחה שהאדם כבר קיבל\n"${quoteSafe(tx(body.opening).slice(0, 600))}"` : '', b.flowReminder ? b.flowReminder(address) : turnReminder(address)].filter(Boolean).join('\n\n') }];

  // Priority one, second net: the visitor's last message shows severe distress. The model is told too, and its reply stands.
  const lastUser = [...clean].reverse().find((m) => m.role === 'user')?.content ?? '';
  const distress = distressIn(lastUser);
  if (distress) system.push({ type: 'text', text: '## זוהתה מצוקה קשה בהודעה האחרונה\nזה קודם לכל דבר אחר: action=safety. עונים באמפתיה ובקצרה, ער"ן 1201 ושיחה עם המנחים, בלי מפגש, מחיר, הרשמה או שאלות על המודעה.' });

  let raw = await claude(apiKey, model, system, merged, 1400);
  if (raw === null) raw = await claude(apiKey, model, system, merged, 1400);   // one more try: an upstream hiccup must not end a conversation
  if (raw === null) return json(b, origin, { error: 'upstream' }, 502);
  let { text, state: incoming } = extractState(raw);
  let parsed = parse(text); parsed.reply = scrub(parsed.reply);
  // One more try, told exactly why, when the reply still speaks to a woman or a man in the plural, or offers the evening before the visitor reacted to the bridge
  const replyFixes: { type: string; text: string }[] = [];
  if (address !== 'plural' && pluralAddress(parsed.reply)) replyFixes.push({ type: 'text', text: genderFix(address) });
  if (!distress && (putsEveningOnTable(parsed.reply) || mentionsEvening(parsed.reply)) && !pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness })) replyFixes.push({ type: 'text', text: earlyPitchFix });
  if (address !== 'plural' && wrongSingular(parsed.reply, address)) replyFixes.push({ type: 'text', text: genderFix(address) });
  if (!parsed.reply) replyFixes.push({ type: 'text', text: '## חסר טקסט\nהתשובה הקודמת הייתה רק סימונים. כתבו הודעה קצרה לאדם לפני הסימונים.' });
  { const sf = styleFix(parsed.reply); if (sf) replyFixes.push({ type: 'text', text: sf }); }
  if (replyFixes.length) {
    const raw2 = await claude(apiKey, model, [...system, ...replyFixes], merged, 1400);
    if (raw2) { const o2 = extractState(raw2), p2 = parse(o2.text); if (p2.reply) { text = o2.text; incoming = o2.state; parsed = p2; parsed.reply = scrub(parsed.reply); } }
  }
  const pitchOk = pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness });
  // Quick replies never name the evening or its people before the visitor may hear about them, and never offer "I have a question"
  let chips = parsed.chips.filter((c) => !c.includes('/') && !repeatedWord(c) && !deadEndChip(c) && (pitchOk || !mentionsEvening(c)) && chipOk(c)).map((c) => genderChip(c, address));
  let replyText = parsed.reply;
  if (!distress && !pitchAllowed({ turns, lastUser, prevDone: prev.done, prevReadiness: prev.readiness }) && mentionsEvening(replyText)) replyText = stripMeeting(replyText);   // told once already
  const reply = fixAddress(stripGreeting(neutralize(replyText)), address);
  if (!reply) return json(b, origin, { reply: 'מובן. אם בא לך להמשיך, אני כאן', chips: ['קצת עוד', 'איך זה נראה בפועל', 'לא כרגע'], cta: null, ctas: [], state: prev, hasFacts: !!b.siteOnly, hasMeeting: false });   // the model sent only marks twice: a short human line, never an error page
  // A question that offers a choice ("A or B") is not answered by a bare yes or no
  if (/\sאו\s/.test(lastSentence(reply))) chips = chips.filter((c) => !/^(כן|לא)(,.*)?$/.test(c.trim()));

  const next = { ...mergeState(prev, incoming, journey), meta };
  if (!incoming) next.action = 'continue';      // a reply without a state block advances nothing
  if (distress) { next.action = 'safety'; next.readiness = 'concerned'; }
  let cta: 'register' | 'whatsapp' | 'updates' | null = b.flowPrompt ? ((['register', 'whatsapp', 'updates'] as const).find((c) => c === parsed.cta) ?? null) : ctaFor(next.action, !!facts);
  if (b.flowPrompt && cta === 'register' && !facts && !b.siteOnly) cta = 'updates';
  if (b.flowPrompt && cta) next.action = cta === 'whatsapp' ? 'guide' : cta;
  if (next.action === 'safety' || next.action === 'end') { cta = null; chips = []; }
  // Someone is never left with only a text box: when the model sent no quick replies, neutral ones are offered
  if (next.action === 'safety') { cta = 'whatsapp'; chips = ['אני אתקשר עכשיו', 'יש לי מישהו לדבר איתו', 'אני לא בסכנה, רק קשה לי']; }   // in a crisis too, answers to tap and not only a text box
  // Registrations are the point of the paid ad: the page offers the evening from the third message of the visitor, or at once when the reply itself
  // gives the date and the price, unless the visitor ended it or said no
  const putsTheEveningOnTheTable = /\d{1,2}\.\d{1,2}/.test(reply) && /(בשעה|ש"ח)/.test(reply);
  // The link to the site appears only once the evening was actually put on the table (this reply or an earlier one), never before
  const eveningSeen = putsTheEveningOnTheTable || clean.some((m: any) => m.role === 'assistant' && /\d{1,2}\.\d{1,2}/.test(String(m.content)) && /(בשעה|ש"ח)/.test(String(m.content)));
  if (next.action !== 'safety' && next.action !== 'end') {
    // The quick replies come from a short dedicated call that sees the visitor's words, the reply and the gender; the model's own are the fallback
    const gen = (await chipsFor(apiKey, model, { reply, lastUser, address, pitchOk })).filter((c) => !c.includes('/') && !repeatedWord(c) && !deadEndChip(c) && chipOk(c) && (pitchOk || !mentionsEvening(c))).map((c) => genderChip(c, address));
    chips = gen.length >= 3 ? gen.slice(0, 4) : [...new Set([...gen, ...chips])].slice(0, 4);
    // An "A or B" question is never answered by a bare yes or no, wherever the quick reply came from
    const eitherOr = /\sאו\s/.test(lastSentence(reply));
    if (eitherOr) chips = chips.filter((c) => !/^(כן|לא)(,.*)?$/.test(c.trim()));
    chips = padChips(chips, eitherOr ? ['קצת משניהם', 'משהו אחר', 'לא בטוח עדיין'] : (b.siteOnly ? pitchOk : eveningSeen) ? CHAT_POOL : TOPIC_POOL).map((c) => genderChip(c, address));   // last resort only
  }
  if (cta === 'register' && !(b.siteOnly ? pitchOk : eveningSeen)) cta = null;
  if (b.siteOnly && !cta && pitchOk && /(באתר|בקישור|\blink\b|website)/i.test(reply) && next.action !== 'safety') cta = 'register';   // the reply points at the site: the button is the way there
  if (b.siteOnly && !cta && pitchOk && asksDetails(lastUser) && next.action !== 'safety') cta = 'register';   // asked when, how much, how to register: the site link is the answer
  if (!cta && offersUpdates(reply) && next.action !== 'safety') cta = 'updates';
  if (!cta && facts && putsTheEveningOnTheTable && !['end', 'safety'].includes(next.action) && next.readiness !== 'not_fit') cta = 'register';

  persist(b, session, src, campaignId, [...clean, { role: 'assistant', content: reply }], cta, next, diffEvents(prev, next));
  return json(b, origin, { reply, chips, cta, ctas: ctasOf(cta as any, b.siteOnly ? pitchOk : !!facts && eveningSeen), state: next, hasFacts: !!facts || !!b.siteOnly, hasMeeting: !!facts });
});

