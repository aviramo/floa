// Harpatka (יוצאים להרפתקה) as a chatbot business: everything that is true of this one business and not of the engine.
import { dynamicPrompt, STATIC_PROMPT, AD_TEXTS, AD_PAIN, openingPrompt, MeetingInfo } from './prompt.ts';
import type { Business } from '../../types.ts';

const ORIGINS = ['https://harpatka.co.il', 'https://www.harpatka.co.il', 'https://test.harpatka.co.il', 'https://floa.co.il', 'https://chatbot.floa.co.il'];   // the last two: the chatbot app's own test page
const israelToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const dayN = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const tx = (v: unknown) => String(v ?? '').trim();
type Tiers = { base: number; steps: { days: number; price: number }[] };
const normT = (t: any): Tiers | null =>
  t && !Array.isArray(t) && Number.isFinite(Number(t.base))
    ? { base: Number(t.base), steps: (Array.isArray(t.steps) ? t.steps : []).map((x: any) => ({ days: Number(x.days), price: Number(x.price) })).filter((x: any) => x.days >= 1 && Number.isFinite(x.price)) }
    : null;
// אותה לוגיקה כמו priceFor ב-shared/register.js: המדרגה שמתחילה הכי קרוב למפגש מבין אלה שכבר התחילו, אחרת המחיר הרגיל
const priceFor = (left: number, T: Tiers | null) => {
  if (T) { const s = T.steps.filter((x) => left <= x.days).sort((a, b) => a.days - b.days)[0]; return s ? s.price : T.base; }
  return left <= 3 ? 100 : 80;
};

// The next meeting is read straight from the roster schema in the same Supabase project, through public.chatbot_next_meeting
// (service_role only, apps/chatbot/next-meeting.sql). No public API call, so no site key and no Origin to forge.
const SB_URL = Deno.env.get('SUPABASE_URL') ?? '', SB_SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

async function loadMeeting(): Promise<MeetingInfo | null> {
  try {
    const today = israelToday();
    if (!SB_URL || !SB_SERVICE) return null;
    const r = await fetch(SB_URL + '/rest/v1/rpc/chatbot_next_meeting', { method: 'POST', headers: { apikey: SB_SERVICE, Authorization: 'Bearer ' + SB_SERVICE, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_business: 'harpatka' }) });
    if (!r.ok) return null;
    const m: any = await r.json();
    if (!m) return null;
    const T = normT(m.price_tiers);
    const left = dayN(m.date) - dayN(today);
    const fmt = (d: string) => { const [, mo, da] = d.split('-').map(Number); return `${da}.${mo}`; };
    let note = '';
    if (T) {
      const parts = [`המחיר הרגיל ${T.base} ש"ח`];
      for (const s of [...T.steps].sort((a, b) => b.days - a.days)) {
        const from = new Date((dayN(m.date) - s.days) * 864e5).toISOString().slice(0, 10);
        parts.push(`מתאריך ${fmt(from)} ${s.price} ש"ח`);
      }
      note = parts.join(', ');
    }
    return {
      date: m.date, time: tx(m.time).slice(0, 5),
      name: tx(m.name), city: tx(m.city), place: tx(m.place),
      max: Number(m.capacity) || 0,
      priceNow: Number.isFinite(Number(m.price)) && !T ? Number(m.price) : priceFor(left, T), priceNote: note,
    };
  } catch (_) { return null; }
}

export const harpatka: Business<MeetingInfo> = {
  key: 'harpatka',
  origins: ORIGINS,
  testOrigin: 'https://test.harpatka.co.il',
  ageRange: '35–55',   // same range as shared/age.js on the Harpatka site
  staticPrompt: (age) => STATIC_PROMPT.replaceAll('{AGE}', age),
  adTexts: AD_TEXTS,
  adPain: AD_PAIN,
  openingPrompt,
  dynamicPrompt,
  loadContext: loadMeeting,
  // names of the database functions this business's learning and abuse guard use (a later step moves them to the chatbot schema)
  rpc: { usage: 'harpatka_chat_usage_hit', chip: 'harpatka_chat_chip_event', offer: 'harpatka_chat_offer_event', openingStats: 'harpatka_chat_opening_stats', chipStats: 'harpatka_chat_chip_stats', offerStats: 'harpatka_chat_offer_stats', questionStats: 'harpatka_chat_question_stats' },
  saltDefault: 'harpatka',
};
