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
    [new RegExp(`${L}([א-ת]{2,}?)תם${R}`, 'g'), '$1ת'],    // ראיתם, לחצתם, קראתם, הגעתם
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
