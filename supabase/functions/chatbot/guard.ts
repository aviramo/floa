import { classifyReply } from './parse.ts';
// Server-side safety nets that do not depend on the model obeying the prompt (the model is small and fast: Haiku).

// Priority one of the spec: severe distress stops the marketing path. The model is told to do this, and this check is the
// second, independent net. It is deliberately a net and not a classifier: it only has to catch the plain phrasings.
const DISTRESS = [
  /להתאבד/, /אובדנ/, /לסיים (את )?(הכול|הכל|את החיים|את זה)/, /לא (רוצה|רוצים) (עוד )?(לחיות|להיות פה)/,
  /עדיף (ש)?(לא (אהיה|הייתי)|אמות|אפסיק)/, /(חושבת|חושב|חשבתי|חושבים) (על )?(למות|מוות)/, /(רוצה|רוצים|רציתי) למות/, /שאמות/, /אין טעם (לחיות|בחיים)/,
  /לפגוע בעצמ/, /לא ל?רצות? להמשיך (לחיות|ככה)/,
];
export const distressIn = (text: string) => DISTRESS.some((r) => r.test(String(text ?? '')));

// The bot has no gender, and until the visitor reveals theirs it speaks in the plural. A small model slips into "אני מבינה" /
// "אני לוקח" about itself; these exact slips are rewritten into neutral forms. Only the first-person pattern is touched, never the visitor's words.
const SELF: [RegExp, string][] = [
  [/(^|[\s.,!?:;"]|ו)אני (מבינה|מבין)(?=[\s.,!?:;]|$)/g, '$1הבנתי'],
  [/(^|[\s.,!?:;"]|ו)אני (שומעת|שומע)(?=[\s.,!?:;]|$)/g, '$1שמעתי'],
  [/(^|[\s.,!?:;"]|ו)אני (לוקחת|לוקח) את זה ברצינות/g, '$1לוקחים את זה ברצינות'],
  [/(^|[\s.,!?:;"]|ו)אני (מצטערת|מצטער)(?=[\s.,!?:;]|$)/g, '$1חבל לשמוע'],
  [/(^|[\s.,!?:;"]|ו)אני (רואה|רואה ש)(?=[\s.,!?:;]|$)/g, '$1נשמע'],
  [/(^|[\s.,!?:;"]|ו)אני (מכבדת|מכבד)(?=[\s.,!?:;]|$)/g, '$1מכבדים'],
  [/(^|[\s.,!?:;"]|ו)אני (שמח|שמחה)(?=[\s.,!?:;]|$)/g, '$1שמחים'],
  [/(^|[\s.,!?:;"]|ו)אני (יכול|יכולה)(?=[\s.,!?:;]|$)/g, '$1אפשר'],
  [/(^|[\s.,!?:;"]|ו)אני (חושב|חושבת) ש/g, '$1נראה לי ש'],
  [/(^|[\s.,!?:;"]|ו)אני (סקרנית|סקרן)(?=[\s.,!?:;]|$)/g, '$1מעניין'],
  [/(^|[\s.,!?:;"]|ו)אני (בטוחה|בטוח)(?=[\s.,!?:;]|$)/g, '$1ברור'],
  [/(^|[\s.,!?:;"]|ו)(מכבד|מכבדת) את (זה|ההחלטה)/g, '$1מכבדים את $3'],
];
export function neutralize(text: string): string {
  let t = String(text ?? '');
  for (const [re, to] of SELF) t = t.replace(re, to);
  return t;
}

// Greeting only once: the opening already said hello, so a reply never starts with another "היי"
export const stripGreeting = (text: string) => String(text ?? '').replace(/^\s*היי(?![א-ת])[,!.]?\s*(\p{Extended_Pictographic}️?\s*)?/u, '').trim();

// The link says whom the bot is talking to (a woman or a man), and the model sometimes still writes the plural, above all in the opening.
// Pronouns and the plain past tense are rewritten into the singular of that gender. Present-tense verbs are left to the prompt.
const L = '(?<![א-ת])', R = '(?![א-ת])';
export function toSingular(text: string, gender: 'female' | 'male'): string {
  const you = gender === 'female' ? 'את' : 'אתה';
  const pairs: [RegExp, string][] = [
    [new RegExp(`${L}([ושכלבמה]{0,2})אתם${R}`, 'g'), `$1${you}`],
    [new RegExp(`${L}([ושכלבמה]{0,2})אתכם${R}`, 'g'), '$1אותך'],
    [new RegExp(`${L}([ושכ]{0,2})לכם${R}`, 'g'), '$1לך'],
    [new RegExp(`${L}([ושכ]{0,2})שלכם${R}`, 'g'), '$1שלך'],
    [new RegExp(`${L}([ושכ]{0,2})אצלכם${R}`, 'g'), '$1אצלך'],
    [new RegExp(`${L}([ושכ]{0,2})איתכם${R}`, 'g'), '$1איתך'],
    [new RegExp(`${L}([ושכ]{0,2})עליכם${R}`, 'g'), '$1עליך'],
    [new RegExp(`${L}([ושכ]{0,2})בכם${R}`, 'g'), '$1בך'],
    [new RegExp(`${L}([ושכ]{0,2})מכם${R}`, 'g'), '$1ממך'],
    [new RegExp(`${L}([ושכ]{0,2})אליכם${R}`, 'g'), '$1אליך'],
  ];
  let t = String(text ?? '');
  for (const [re, to] of pairs) t = t.replace(re, to);
  return t;
}

// The link carries two readable parameters, pain and gender. Together they name the campaign: the same name the operations tool gives it.
export const campaignKey = (pain: unknown, gender: unknown) => {
  const p = String(pain ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return p ? p + '-' + (gender === 'female' ? 'women' : gender === 'male' ? 'men' : 'all') : '';
};

// The segment a link carries: one separate parameter per dimension. Only plain keys and values, a handful at most; what no campaign
// matches simply finds no campaign. The browser can only choose among campaigns that exist.
export function parseSegment(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
    const key = String(k).toLowerCase(), val = String(v ?? '').trim().toLowerCase();
    if (/^[a-z][a-z0-9_]{0,29}$/.test(key) && /^[a-z0-9_-]{1,30}$/.test(val) && Object.keys(out).length < 5) out[key] = val;
  }
  return out;
}

// Does a reply to a woman or a man still speak to them in the plural? A conservative list of explicit markers: pronouns and common past forms.
// The model is asked again when this fires, because rewriting the grammar around a plural word by pattern breaks ordinary words.
const PLURAL = new RegExp(`${L}(אתם|אתכם|לכם|אליכם|שלכם|אצלכם|איתכם|עליכם|מכם|בכם|ראיתם|הייתם|לחצתם|קראתם|הגעתם|שמעתם|חשבתם|הרגשתם|רציתם|ניסיתם|בחרתם|עשיתם|אמרתם|מצאתם|חיפשתם|נכנסתם|התחלתם|החלטתם|שאלתם|ידעתם|עברתם|סיפרתם|הסתכלתם)${R}`);
export const pluralAddress = (text: string) => PLURAL.test(String(text ?? ''));
export const genderFix = (gender: 'female' | 'male') =>
  '## תיקון לשון\nהטיוטה הקודמת פנתה ברבים. כתבו אותה מחדש בלשון ' + (gender === 'female' ? 'נקבה' : 'זכר') + ' יחיד בלבד: ״' + (gender === 'female' ? 'את' : 'אתה') + '״, ״לך״, ״אותך״, ״שלך״, בלי ״אתם״, ״לכם״, ״אליכם״ ובלי ריבוי בפעלים ובתארים כלפי האדם. אותו תוכן.';

// A quick reply with the same word twice in a row ("יום יום עמוס מדי") reads like a typo even when the idiom is correct: dropped.
export const repeatedWord = (t: string) => /(^|\s)([א-ת]{2,})\s+\2(?![א-ת])/.test(String(t ?? ''));

// The opening is the first words a stranger reads: it must not state their condition ("נשמע שיש משהו שמלחיץ אותך"). The model is asked again when it does.
const CONDITION = new RegExp(`${L}(נשמע ש|נשמע לי ש|נראה ש|כנראה ש|סובל|סובלת|מרגיש ש|מרגישה ש)`);
export const assertsCondition = (t: string) => CONDITION.test(String(t ?? ''));
export const conditionFix = '## תיקון: אין להצהיר על מצבו\nהטיוטה הצהירה על מצבו של האדם (״נשמע ש...״, ״נראה ש...״). כתבו שוב בלי שום הצהרה על מצבו או על מה שהוא מרגיש: רק שראה מודעה בנושא, ושאלה אחת על מה הביא אותו.';

// Date and price in a reply means the evening was put on the table.
export const putsEveningOnTable = (reply: string) => /\d{1,2}\.\d{1,2}/.test(String(reply ?? '')) && /(בשעה|ש"ח)/.test(String(reply ?? ''));

// The evening is offered after a bridge the visitor reacted to, or when they ask, or when they would rather not talk, or by their fourth message.
// A reply that offers it earlier is asked again once. Never a jump from "I want quiet" straight to a date and a price.
export function pitchAllowed(a: { turns: number; lastUser: string; prevDone: string[]; prevReadiness: string }): boolean {
  const asked = /(מתי|כמה|מחיר|עולה|הרשמ|נרשמ|קישור|איפה|תאריך|פרטים|לשלוח)/.test(a.lastUser);
  const reluctant = /(קשה לי לדבר|לא רוצה לדבר|לא בא לי לדבר|אין לי כוח לדבר)/.test(a.lastUser) || a.prevReadiness === 'not_now';
  return a.turns >= 4 || asked || reluctant || a.prevDone.includes('bridge') || a.prevDone.includes('curiosity') || classifyReply(a.lastUser) === 'yes';
}
export const earlyPitchFix = '## הצעה מוקדמת מדי\nהטיוטה הציגה את פרטי הערב לפני שהאדם הגיב לחיבור. כתבו שוב: משפט אחד שמקשר את מה שהאדם אמר לערב, ושאלה אחת אם זה מתחבר לו. בלי תאריך, מחיר או קישור.';
