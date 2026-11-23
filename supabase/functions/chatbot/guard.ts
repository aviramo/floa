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
  [/(^|[\s.,!?:;"]|ו)אני (סקרנית|סקרן)(?=[\s.,!?:;]|$)/g, '$1מעניין'],
  [/(^|[\s.,!?:;"]|ו)אני (בטוחה|בטוח)(?=[\s.,!?:;]|$)/g, '$1ברור'],
  [/(^|[\s.,!?:;"]|ו)(מכבד|מכבדת) את (זה|ההחלטה)/g, '$1מכבדים את $3'],
];
export function neutralize(text: string): string {
  let t = String(text ?? '');
  for (const [re, to] of SELF) t = t.replace(re, to);
  return t;
}
