// @ts-nocheck
// Writes the exact briefing the Harpatka agent receives (example: the "touch" pain, a woman, turn 3) to a markdown file the owner reads.
// Run: deno run --allow-env --allow-write --no-check supabase/functions/chatbot/briefing_dump.ts <output.md>
import { harpatka } from './businesses/harpatka/index.ts';
import { sessionFacts, openingTask, addressOf } from './prompt.ts';
import { PAIN_BRIEFS } from './businesses/harpatka/briefs.ts';
import { AD_TEXTS } from './businesses/harpatka/ads.ts';

const out = Deno.args[0] ?? 'briefing.md';
const PAIN = Deno.args[1] ?? 'opening_up';
const b = harpatka;
const address = addressOf('female');
const ctx = { campaign: { id: PAIN, journey_type: 'pain', topic_id: null, segment_filters: {}, creative: {} }, journey: null, content_version_id: null, profile: null, insights: [], hypothesis: b.adPain[PAIN], brief: PAIN_BRIEFS[PAIN] };
const o: string[] = [];
o.push('# מה הסוכן מקבל: כאב ' + PAIN + ', מבקרת אישה, תור 3\n\nהקובץ נוצר אוטומטית מהקוד החי ומתעדכן בכל שינוי בהנחיות.\n');
o.push('## 1. ההנחיות הקבועות\n\n' + b.flowPrompt.replaceAll('{AGE}', '35–55'));
o.push('\n## 2. מתווסף בכל תור\n\n' + b.stageHints(3) + '\n\n' + sessionFacts(b, ctx, null, AD_TEXTS[PAIN] ?? '', address) + '\n\n' + b.flowReminder(address));
o.push('\n## 3. הודעת הפתיחה (קריאה נפרדת)\n\n' + openingTask(b, AD_TEXTS[PAIN] ?? '', address, ''));
o.push('\n## 4. הגנות בקוד (לא בהנחיות): תיקון מגדר, חסימת מחיר ולו"ז, חסימת הפניה לער"ן בלי מצוקה, חסימת "מה שכתבת", שאלה חייבת להסתיים בסימן שאלה, כפתורים של לפחות שלוש מילים, פרידה, קישור לאתר רק משלב 5.');
Deno.writeTextFileSync(out, o.join('\n'));
