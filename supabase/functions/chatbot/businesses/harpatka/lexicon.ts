// The vocabulary and the fixed lines of one business. The engine holds none of it: it reads `b.lexicon`.
import type { BusinessLexicon } from '../../types.ts';
export const HARPATKA_LEXICON: BusinessLexicon = {
  // Any word about the offer itself (the evening, the meeting, its people): before its stage it is a skipped step.
  offerWords: /(הדר ואופיר|המנחים|הערב|ערב (תנועה|כזה|שבו|התנסות)|מפגש|מפגשים|מפגשי|במוזיקה ובתנועה|בלי לדעת לרקוד|לא צריך לדעת לרקוד|להתנסות איתם)/,
  busyMessage: 'השיחה עמוסה כרגע. הכי נוח לכתוב להדר ולאופיר בוואטסאפ',
  tooLongMessage: 'זו כבר שיחה ארוכה. כדי להמשיך, הכי נוח לכתוב להדר ולאופיר בוואטסאפ',
  fallbackReply: 'מובן. אם בא לך להמשיך, אני כאן',
};
