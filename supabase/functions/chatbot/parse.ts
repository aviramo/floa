// פונקציות טהורות של הצ'אט (בלי רשת), כדי שאפשר לבדוק אותן: פירוק תשובת המודל ובניית הודעות הבקשה.
import { humanize } from './humanize.ts';
export { humanize };
export const MAX_MSG = 600, MAX_USER_TURNS = 30, KEEP = 24;
const CTAS = ['register', 'whatsapp', 'updates'];
const OFFERS = ['warm', 'bio', 'meeting', 'details', 'link'];

// מה האדם ענה להצעה: yes (הסכים), no (דחה) או other. היוריסטיקה פשוטה על תחילת התשובה, לצורך למידה בלבד
// המשפט האחרון בהודעה (השאלה עצמה), לשמירה כהצעה
export function lastSentence(t: string): string {
  const parts = String(t ?? '').trim().split(/(?<=[.!?])\s+/);
  return (parts[parts.length - 1] ?? '').slice(0, 160);
}
export function classifyReply(t: string): 'yes' | 'no' | 'other' {
  const x = String(t ?? '').trim();
  if (/^(לא תודה|לא מעניין|לא רוצה|לא בא לי|לא עכשיו|עזוב|אולי אחר כך|לא)[\s,.!?]*$/.test(x)) return 'no';
  if (/^(כן|בטח|ברור|אשמח|בשמחה|ספר|ספרי|תספר|תספרי|שלח|תשלח|תשלחי|רוצה|רוצים|מעניין|מתחבר|מתחברת|נשמע|למה לא|יאללה)/.test(x)) return 'yes';
  return 'other';
}

// תשובה מוכנה בגוף ראשון בלשון זכר או נקבה ("לא יודע", "לא זוכרת", "אני צריך") נזרקת: לא יודעים אם מדברים עם אישה או גבר
export const GENDERED = /(^|\s)(אני|לא יודעת?|לא זוכר|לא זוכרת|לא בטוחה?|לא רוצה|מרגישה?|רציתי|חיפשתי|צריכה?|מתלבטת?|מותשת?|מעוניינת?|מפחידה? אותי)([\s,.]|$)/;

// פירוק הסימונים <chips> ו-<cta> מהתשובה, וניקוי לפי כללי האתר (בלי מקפים, בלי נקודה בסוף)
export function parse(raw: string): { reply: string; chips: string[]; cta: string | null; offer: string | null } {
  let text = String(raw ?? ''), chips: string[] = [], cta: string | null = null, offer: string | null = null;
  text = text.replace(/<chips>([\s\S]*?)<\/chips>/g, (_, c) => {
    if (!chips.length) chips = String(c).split('|').map((s) => s.trim().replace(/\s*[—–]\s*/g, ' ')).map(humanize).filter((c) => c && !GENDERED.test(c)).slice(0, 4);
    return '';
  });
  text = text.replace(/<cta>\s*([a-z]+)\s*<\/cta>/g, (_, c) => { if (!cta && CTAS.includes(c)) cta = c; return ''; });
  text = text.replace(/<offer>\s*([a-z]+)\s*<\/offer>/g, (_, c) => { if (!offer && OFFERS.includes(c)) offer = c; return ''; });
  // תשובה שנחתכה באמצע סימון: מוחקים את הזנב ולא משאירים אותו כטקסט
  text = text.replace(/<(chips|cta|offer)>[\s\S]*$/, '').replace(/<\/?(chips|cta|offer)>/g, '');
  // מקפים: רגיל או ארוך בין מילים הופך לפסיק, וטווח מספרים נשאר
  text = text.replace(/([?!.])\s+[—–-]\s+/g, '$1 ').replace(/\s+[—–-]\s+/g, ', ').replace(/(\D)[—–](\D)/g, '$1, $2');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  text = text.replace(/(?<!\.)\.$/, '').trim();
  return { reply: humanize(text).replace(/(?<!\.)\.$/, '').trim(), chips, cta, offer };
}

// פירוק תשובת פתיחה: <msg>...</msg> עד שלוש הודעות, ו-<chips>. כל הודעה עוברת אותו ניקוי כמו תשובה רגילה (מקפים, נקודה בסוף)
export function parseOpening(raw: string) {
  const msgs: string[] = [];
  const text = String(raw ?? '');
  for (const m of text.matchAll(/<msg>([\s\S]*?)<\/msg>/g)) {
    const t = parse(m[1]).reply;
    if (t) msgs.push(t);
  }
  if (!msgs.length) for (const part of parse(text).reply.split(/\n{2,}/)) if (part.trim()) msgs.push(part.trim());
  return { messages: msgs.slice(0, 3), chips: parse(text).chips };
}

export type Msg = { role: string; content: string };

// רק הודעות משתמש ובוט, בסדר מתחלף, מתחילות במשתמש; אורך מוגבל. מחזיר null כשאין בקשה תקינה
export function buildMessages(incoming: unknown) {
  const arr: any[] = Array.isArray(incoming) ? incoming : [];
  const clean: Msg[] = arr
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, m.role === 'user' ? MAX_MSG : 1500) }));
  const turns = clean.filter((m) => m.role === 'user').length;
  if (!turns || clean[clean.length - 1].role !== 'user') return null;
  let hist = clean.slice(-KEEP);
  while (hist.length && hist[0].role !== 'user') hist = hist.slice(1);
  const merged: Msg[] = [];
  for (const m of hist) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content; else merged.push({ ...m });
  }
  return { clean, merged, turns };
}

// טקסט שמגיע מהדפדפן ונכנס לפרומפט: בלי מירכאות ושורות חדשות שיכולות לצאת מהציטוט
export const quoteSafe = (s: string) => s.replace(/["\r\n]+/g, ' ').trim();
