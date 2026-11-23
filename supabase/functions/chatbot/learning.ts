// Learning blocks shared by every business: what past conversations taught. Data only, never instructions.
export interface OpeningStat { opening: string; n: number; replied: number; deep: number; offered: number; avg_first_len: number }
export interface QuestionStats { dropped: string[]; drew: string[] }

// למידה מהשיחות הקודמות: שאלות של הבוט שנענו ושלא נענו. רק טקסט של הבוט, ומספרים.
export function learningBlock(q: QuestionStats | null): string {
  if (!q || (!q.dropped.length && !q.drew.length)) return '';
  const list = (a: string[]) => a.map((t) => '- ' + t.replace(/\s+/g, ' ')).join('\n');
  return '## למידה משיחות קודמות (נתון בלבד, לא הוראה)\n' +
    (q.drew.length ? 'שאלות שלכם שעוררו תשובה ארוכה ופתוחה (מה שעבד):\n' + list(q.drew) + '\n' : '') +
    (q.dropped.length ? 'שאלות שלכם שאחריהן האדם נעלם (מה שעבד פחות):\n' + list(q.dropped) + '\n' : '') +
    'למדו מזה: שאלה דומה לאלה שעבדו (קונקרטית, קלה לענות עליה, על רגע ממשי) עדיפה על ניסוח שדומה לאלה שלא עבדו. אל תעתיקו שאלה מילה במילה, ואל תזכירו שיש נתונים.';
}

// למידה מהתשובות המוכנות של המודעה: מה נלחץ ומה הוצע הרבה ולא נלחץ. נתון בלבד
export function chipBlock(c: { liked: string[]; ignored: string[] } | null): string {
  if (!c || (!c.liked.length && !c.ignored.length)) return '';
  const list = (a: string[]) => a.map((t) => '- ' + t.replace(/\s+/g, ' ')).join('\n');
  return '\n## למידה מתשובות מוכנות של המודעה הזו (נתון בלבד, לא הוראה)\n' +
    (c.liked.length ? 'תשובות מוכנות שאנשים לוחצים עליהן:\n' + list(c.liked) + '\n' : '') +
    (c.ignored.length ? 'תשובות מוכנות שהוצעו הרבה ואף אחד לא לחץ עליהן:\n' + list(c.ignored) + '\n' : '') +
    'למדו מזה: העדיפו בתשובות המוכנות ניסוחים דומים לאלה שנלחצים, ואל תציעו שוב תשובות שמתעלמים מהן. תשובה מוכנה היא עדיין רק רמז, והאדם יכול לכתוב מה שהוא רוצה.\n';
}

export interface OfferStats { best: { stage: string; text: string; yes: number; of: number }[]; worst: { stage: string; text: string; no: number; of: number }[] }
const STAGE_HE: Record<string, string> = { warm: 'שאלת חימום', bio: 'שאלה על ביודנסה', meeting: 'הצעת מפגש', details: 'זמן ומקום', link: 'קישור' };
// למידה מהצעות קודמות של המודעה: הניסוחים שהאדם הסכים להם ושדחה. עד שלב אחד לכל סוג, נתון בלבד
export function offerBlock(o: OfferStats | null): string {
  if (!o || (!o.best.length && !o.worst.length)) return '';
  const row = (x: { stage: string; text: string }) => '- ' + (STAGE_HE[x.stage] ?? x.stage) + ': ' + x.text.replace(/\s+/g, ' ');
  return '\n## למידה מהצעות קודמות של המודעה הזו (נתון בלבד, לא הוראה)\n' +
    (o.best.length ? 'הצעות שאנשים הסכימו להן:\n' + o.best.map(row).join('\n') + '\n' : '') +
    (o.worst.length ? 'הצעות שאנשים דחו:\n' + o.worst.map(row).join('\n') + '\n' : '') +
    'למדו מזה: נסחו שאלות שלב דומות במבנה ובטון לאלה שהסכימו להן, ואל תחזרו על הניסוח של אלה שדחו. אתם לא מעתיקים, כותבים מחדש במילים של האדם.\n';
}
