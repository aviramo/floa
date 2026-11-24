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
  [/(^|[.!?]s*)(שמח|שמחה) ש/g, '$1טוב ש'],
  [/(^|[\s.,!?:;"]|ו)נשמח ש(הגעת|הגעתם|באת|באתם)/g, '$1שמחים ש$2'],
  [/אני לא (יודע|יודעת|בטוח|בטוחה)( עדיין)? /g, 'לא ברור עדיין '],
  [/אני לא (מפרט|מפרטת)/g, 'לא מפרטים'],
  [/(^|[.!?,]\s*)לא (בטוח|בטוחה) לגמרי/g, '$1לא לגמרי ברור'],
  [/אני לא (יכול|יכולה|אוכל) /g, 'אי אפשר '],
  [/(ש|כש)אני (מבין|מבינה)/g, '$1הבנתי'],
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
const ASKS_ABOUT_IT = /(מתי (זה|המפגש|הערב|הבא)|כמה (זה )?עולה|בכמה|מחיר|(?<![א-ת])יקר(?![א-ת])|כסף|תשלום|הרשמ|נרשמ|קישור|תאריך|איפה (זה|המפגש|הערב|מתקיים)|מה זה|מה זו|מי אתם|מה אתם|מה בדיוק מוכרים|מוכרים|על מה (זה|המפגש|הערב)|(?<![א-ת])כת(?![א-ת])|רמא|מה עושים|מי מנחה|המנחים)/;
export function pitchAllowed(a: { turns: number; lastUser: string; prevDone: string[]; prevReadiness: string }): boolean {
  // Only an explicit question about the evening, or a conversation that really got through connect, desire and motivation (or a long one), opens the door.
  // A "yes", a chip or a message count alone does not: the visitor learned from the ad about a pain, not about a meeting.
  const asked = ASKS_ABOUT_IT.test(a.lastUser) || asksDetails(a.lastUser);
  const gotThere = ['connect', 'desire', 'motivation'].every((d) => a.prevDone.includes(d)) || a.prevDone.includes('bridge');
  return a.turns >= 5 || asked || gotThere;
}
export const earlyPitchFix = '## הצעה מוקדמת מדי\nהטיוטה הזכירה את הערב או המפגש לפני שהושלם החיבור. כתבו שוב בלי להזכיר את הערב, המפגש, תאריך, מחיר או קישור: התייחסות קצרה למה שהאדם אמר ושאלה אחת קלה על הנושא עצמו.';

// Never one quick reply or none: at least three, topped up from a neutral pool without repeating what the model already offered.
export function padChips(chips: string[], pool: string[], min = 3): string[] {
  const out = [...chips];
  for (const c of pool) { if (out.length >= min) break; if (!out.includes(c)) out.push(c); }
  return out;
}
export const OPENING_POOL = ['סתם סקרנות', 'קשה לי לדבר על זה', 'רוצה להבין קודם'];
export const CHAT_POOL = ['כן, עוד פרטים', 'לא כרגע', 'איך נרשמים'];
// "I have a question" is a dead end: it asks the visitor to type, and the bot answers with a menu about the offer
export const deadEndChip = (c: string) => /^(יש לי שאלה|שאלה|אני רוצה לשאול|רוצה לשאול)/.test(c.trim());
// Before the offer is on the table the pool answers a plain question about the topic, never "more details" about something not yet presented
export const TOPIC_POOL = ['כן', 'קצת', 'לא כל כך'];

// Any word about the evening itself (not only date and price): before the bridge it is a skipped milestone.
export const mentionsEvening = (reply: string) => /(הדר ואופיר|המנחים|הערב|ערב (תנועה|כזה|שבו|התנסות)|מפגש|מפגשים|מפגשי|במוזיקה ובתנועה|בלי לדעת לרקוד|לא צריך לדעת לרקוד|להתנסות איתם)/.test(String(reply ?? ''));

// The reply offers the updates group in words: the button must be there too, whatever action the model reported.
export const offersUpdates = (reply: string) => /קבוצת (ה)?עדכונים/.test(String(reply ?? ''));

// Things the visitor must never read: the machinery, "what brought you", pressure to hurry. A reply with one is written again once.
export function styleFix(reply: string, lastUser = ''): string | null {
  const r = String(reply ?? '');
  const probs: string[] = [];
  if (/(המשפט (שלך )?(קצר|קצרצר)|קצר (מאוד|מדי)|כתבת (רק )?(מילה|מעט|קצר)|(ר|ק)ק מילה|לא ברור עדיין|תשובה קצרה|הודעה קצרה)/.test(r)) probs.push('אסור להעיר על האורך של מה שהאדם כתב או לחץ. תשובה קצרה היא תשובה לגיטימית: ממשיכים הלאה בטבעיות');
  if (String(lastUser).trim().split(/\s+/).length <= 4 && /(מה ש(כתבת|סיפרת|אמרת)|שכתבת|כתבת לי|סיפרת לי)/.test(r)) probs.push('האדם כתב רק כמה מילים או לחץ על תשובה: אסור "מה שכתבת", "סיפרת", "אמרת"');
  if (/(תשובה מוכנה|תשובות מוכנות|הכפתור|לחצת על|הודעה מוכנה)/.test(r)) probs.push('אסור להזכיר תשובות מוכנות, כפתורים או הודעות: מגיבים לתוכן שהאדם אמר');
  if (/(מה|איזה דבר) ?ש?(בדיוק |ממש )?(הביא|גרם) (אותך|אותנו|לך|לכם)|למה (באת|נכנסת|הגעת)|מה (אתה|את) מחפש/.test(r)) probs.push('אסור לשאול מה הביא את האדם או מה הוא מחפש: שואלים על חייו ועל מצבים');
  if (/(ההנחיה כאן|ההנחיות שלי|לפי ההנחיות|אני מנחה את עצמי)/.test(r)) probs.push('אסור לצטט הנחיות או לתאר מה אתם עושים: שואלים ומגיבים');
  if (/(כדאי (להקדים|לשמור|לשריין|להירשם)|מקום מוקדם|המקומות נגמרים|הזדמנות אחרונה)/.test(r)) probs.push('בלי לחץ להזדרז: מחיר ומקומות הם מידע בלבד');
  if (/(לילה טוב|בוקר טוב|ערב טוב|צהריים טובים)/.test(r)) probs.push('בלי ברכת זמן: לא יודעים מתי האדם קורא');
  if (/["״“][א-ת ]{1,14}["״”]\s+(נשמע|זה נשמע|הוא סימן|אומר)|אפשר לומר רק|אני מציע לא|בוא נשמור על/.test(r)) probs.push('אסור לצטט מילה של האדם בגרשיים ולפרש אותה, ואסור לדבר על השיחה עצמה: מגיבים לתוכן ושואלים');
  if (r.split(/[.!?]\s/).filter(Boolean).length > 4 || r.length > 520) probs.push('ארוך מדי: עד שלושה משפטים ושאלה אחת');
  return probs.length ? '## תיקון\nהטיוטה: ' + probs.join('; ') + '. כתבו שוב בלי זה, באותו תוכן.' : null;
}

// A masculine first-person quick reply for a woman (and the reverse) reads like a stranger wrote it
const TO_FEM: [RegExp, string][] = [[/(?<![א-ת])לא בטוח(?![א-ת])/g, 'לא בטוחה'], [/(?<![א-ת])אני צריך(?![א-ת])/g, 'אני צריכה'], [/(?<![א-ת])מסתדר(?![א-ת])/g, 'מסתדרת'], [/(?<![א-ת])מתלבט(?![א-ת])/g, 'מתלבטת'], [/(?<![א-ת])מעוניין(?![א-ת])/g, 'מעוניינת'], [/(?<![א-ת])סקרן(?![א-ת])/g, 'סקרנית'], [/(?<![א-ת])חושש(?![א-ת])/g, 'חוששת'], [/(?<![א-ת])מתבייש(?![א-ת])/g, 'מתביישת'], [/(?<![א-ת])עייף(?![א-ת])/g, 'עייפה'], [/(?<![א-ת])מתוח(?![א-ת])/g, 'מתוחה'], [/(?<![א-ת])אני מתחיל(?![א-ת])/g, 'אני מתחילה']];
const TO_MASC: [RegExp, string][] = [[/(?<![א-ת])לא בטוחה(?![א-ת])/g, 'לא בטוח'], [/(?<![א-ת])אני צריכה(?![א-ת])/g, 'אני צריך'], [/(?<![א-ת])מסתדרת(?![א-ת])/g, 'מסתדר'], [/(?<![א-ת])מתלבטת(?![א-ת])/g, 'מתלבט'], [/(?<![א-ת])מעוניינת(?![א-ת])/g, 'מעוניין'], [/(?<![א-ת])סקרנית(?![א-ת])/g, 'סקרן'], [/(?<![א-ת])חוששת(?![א-ת])/g, 'חושש'], [/(?<![א-ת])מתביישת(?![א-ת])/g, 'מתבייש'], [/(?<![א-ת])עייפה(?![א-ת])/g, 'עייף'], [/(?<![א-ת])מתוחה(?![א-ת])/g, 'מתוח']];
export function genderChip(c: string, a: 'female' | 'male' | 'plural'): string {
  if (a === 'plural') return c;
  return (a === 'female' ? TO_FEM : TO_MASC).reduce((t, [re, to]) => t.replace(re, to), c);
}
const ONE_WORD_OK = /^(כן|לא|קצת|אולי|בטח|מעניין|בבקשה|תודה|בסדר|סתם|נשמע|ברור|מתי|בערב|בבוקר|לבד|פחד|מבוכה|עייפות|לחץ|שקט|הגוף|הראש|שניהם|בעבודה|בבית)$/;
export const chipOk = (c: string) => {
  const w = c.trim().split(/\s+/);
  if (c.trim().length < 2 || /[:,]$/.test(c.trim()) || w.length > 8 || /ככה זה נשמע/.test(c)) return false;
  if (w[w.length - 1].length < 2 && w.length > 1) return false;      // cut in the middle ("משהו ש")
  if (w.length === 1 && !ONE_WORD_OK.test(w[0])) return false;        // "האם" and the like
  return true;
};

// The singular of the wrong gender: "אתה" to a woman, "את מרגישה" to a man
export function wrongSingular(reply: string, a: 'female' | 'male' | 'plural'): boolean {
  const r = String(reply ?? '');
  if (a === 'female') return /(^|[\s.,!?:;"])(?:כש|ש|ו|אם )?(אתה|תרצה|תוכל|תרגיש|תספר|תכתוב|תגיד|תדע|תבחר|ספר|כתוב|נסה|קח|שתף|בחר)(?![א-ת])/.test(r);
  if (a === 'male' && /(^|[\s.,!?:;"])(?:כש|ש|ו|אם )?(תרצי|תוכלי|תרגישי|תספרי|תכתבי|תגידי|תדעי|תבחרי|ספרי|כתבי|נסי|קחי|שתפי|בחרי)(?![א-ת])/.test(r)) return true;
  if (a === 'male') return /(^|[\s.,!?:;"])(?:כש|ש|ו|אם )?את (מרגישה|רוצה|מחפשת|צריכה|יכולה|חושבת|עייפה|בטוחה|מתארת|משתפת|אומרת|מסתדרת|מרגישה)(?![א-ת])/.test(r);
  return false;
}

// Last resort when the model still names the meeting before its stage: keep the sentences that do not, if a question is left
export function stripMeeting(reply: string): string {
  const parts = String(reply ?? '').split(/(?<=[.!?])\s+/);
  const kept = parts.filter((s) => !mentionsEvening(s));
  const out = kept.join(' ').trim();
  return /\?/.test(out) ? out : reply;
}

// The visitor asks for the details or wants to register: the site link is the answer
export const asksDetails = (t: string) => /((^|\s)ו?מתי\s*\?|^ו?מתי$|מתי (זה|המפגש|הערב|הבא)|כמה (זה )?עולה|בכמה|מחיר|(?<![א-ת])יקר(?![א-ת])|כסף|תשלום|הרשמ|נרשמ|קישור|תאריך|איפה (זה|המפגש|הערב|מתקיים)|פרטים|לשלוח)/.test(String(t ?? ''));

// The model sometimes writes a placeholder like {{chips}} and a line of choices separated by pipes into the text itself: never shown
export const scrub = (s: string) => String(s ?? '').replace(/\{\{[\s\S]*$/, '').split('\n').filter((l) => !/\|.*\|/.test(l)).join('\n').trim();

// The visitor says who they are ("אני גבר", "אני בן 40", "אני מרגישה"): that wins over the link, which only targets by guess. The last explicit statement counts.
const FEM_SELF = /(^|[\s,.!?])אני (אישה|אשה|בת \d|אמא|מרגישה|עייפה|חושבת|מתביישת|מפחדת|גרושה|נשואה|רווקה)(?![א-ת])/;
const MASC_SELF = /(^|[\s,.!?])אני (גבר|בן \d|אבא|מרגיש|עייף|חושב|מתבייש|מפחד|גרוש|נשוי|רווק)(?![א-ת])/;
export function revealedGender(userTexts: string[]): 'female' | 'male' | null {
  let g: 'female' | 'male' | null = null;
  for (const t of userTexts) { if (FEM_SELF.test(t)) g = 'female'; else if (MASC_SELF.test(t)) g = 'male'; }
  return g;
}
export const openingMeetingFix = '## תיקון: הפתיחה בלי מפגש\nהטיוטה הזכירה את הפעילות, את המפגשים או את המנחים. כתבו שוב: ההודעה הראשונה רק ברכה והצגה כבוט של "יוצאים להרפתקה", בלי שום תיאור של הפעילות.';
