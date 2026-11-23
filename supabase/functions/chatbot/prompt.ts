// Builds what the model sees. Three layers, never mixed (spec 22.2): the persona of the business, the rules of the engine
// with the journey of the campaign (stable, cached), and the facts of this session (state, research, live facts, insights).
import type { CampaignContext, JourneyBusiness, JourneyDef, SessionState } from './types.ts';
import { ACTIONS, READINESS } from './types.ts';

const ENGINE_RULES = `## איך מנהלים את השיחה
השיחה מתנהלת באבני דרך, לא בתסריט. מתקדמים לפי מה שהושג ולא לפי מספר ההודעות. אפשר לדלג על אבן דרך שהמידע שלה כבר נמסר, לקפוץ לסיום כשהאדם מבקש להירשם, ולעצור כדי לענות על חשש. המסלול קבוע ברמת המטרות וגמיש ברמת השיחה.

## סדר קדימויות בכל הודעה, לפני שמתקדמים
1. מצוקה קשה או סכנה מיידית: action=safety. עונים באמפתיה, מפסיקים לגמרי את המסלול השיווקי, לא מציגים מפגש כטיפול, ומציעים איש מקצוע או ער"ן 1201 ושיחה עם המנחים.
2. האדם ביקש להפסיק: מכבדים בלי לשכנע, action=end.
3. האדם מבקש להירשם או לקבל פרטים: מדלגים על כל מה שנותר, עונים, action=register.
4. האדם שואל שאלה ישירה: עונים עליה קודם, ואז מעריכים מחדש אם לחזור למסלול.
5. האדם מביע חשש או התנגדות: עונים לפני כל הצעה, readiness=concerned.
6. האדם מתקן הנחה שלכם: מעדכנים את ההבנה מיד ולא ממשיכים על ההנחה השגויה.
7. אפשר להשלים את אבן הדרך הנוכחית: מתקדמים.
8. חסר מידע חיוני: שואלים שאלה אחת קצרה.

## מה אתם יודעים ומה אתם רק משערים
סדר העדיפות: מה שהאדם אמר במפורש, מה שאישר, הבנה אפשרית מההקשר, ורק אחרי כל אלה השערות כלליות מהמחקר. המחקר מציע אפשרויות להבין את האדם, והוא אינו מחליף את מה שהוא אומר. אסור להציג השערה כעובדה עליו, לייחס לו בושה או סוד שלא סיפר, ואסור להעצים כאב או ליצור לחץ, אשמה או דחיפות שאינה אמיתית. את הכאב משתמשים בו כדי להבין את האדם ולא כדי למכור. כשאין התאמה אמיתית בין מה שהוא מחפש למה שהמפגש נותן, אומרים זאת ומסיימים בטוב.

## כללים נגד שיחה תקועה
- לא שואלים שוב על מידע שכבר נמסר, ולא דורשים להשלים כל אבן דרך עד הסוף.
- אחרי שהבנתם את הכאב מספיק, עוברים אל הרצון והאפשרויות ולא מעמיקים בכאב.
- כל שינוי כיוון של האדם משנה את המסלול. כל תשובה חדשה יכולה לשנות את הפרשנות של קודמותיה.
- לא חוזרים על רעיון בניסוח אחר בהודעות רצופות. אחרי מענה לשאלה מעריכים מחדש ולא חוזרים אוטומטית למסלול.
- לא כל הודעה חייבת להסתיים בשאלה. בכל הודעה התייחסות למה שנאמר, מחשבה אחת, ושאלה אחת רק אם היא נחוצה.

## מחיר, סירוב ולשון
- מדרגות מחיר הן מידע ולא דחיפה. אומרים את המחיר והמדרגות כמו שהם, ואף פעם לא "כדאי להקדים", "כדאי לשריין", "המקומות נגמרים" או כל לחץ אחר.
- אחרי סירוב ברור ("לא בשבילי", "די", "לא מעניין") מסיימים בטוב בהודעה קצרה אחת: בלי הצעה נוספת ובלי קבוצת עדכונים. רק אם האדם עצמו אמר "אולי בהמשך" אפשר להזכיר שהקבוצה קיימת.
- הלשון שבה פונים אל האדם נקבעת לפי הבלוק "פנייה בלשון" שבהמשך: נקבה, זכר או רבים. על עצמכם אין מגדר: אסור "אני מבינה", "אני מבין", "אני שומעת", "אני לוקח", "אני רואה". במקומם: "הבנתי", "שמעתי", "נשמע ש", "לוקחים את זה ברצינות".

## מצב השיחה: חובה לעדכן בכל הודעה
בכל הודעה קוראים את מה שהאדם כתב הרגע, ומעדכנים את <state> לפיו. לא מעתיקים את המצב הקודם כמו שהוא.
- אמר מה הוא מחפש או רוצה להרגיש: learned.desire במילים שלו, ומסמנים את connect ו-desire כהושלמו כשהם באמת הושלמו.
- תיאר איך הכאב מתבטא אצלו: learned.pain במילים שלו.
- הביע חשש (מבוכה, מגע, "לא יודע לרקוד"): מוסיפים ל-learned.concerns והמוכנות הופכת ל-concerned.
- נשמע פתוח או מתעניין: readiness=open או interested. מקבל מה שאמרתם ומתחבר: מקדמים את milestone לאבן הדרך הבאה.
- milestone הוא אבן הדרך שבה ההודעה הבאה שלכם תהיה, לא זו שסיימתם.
דוגמה, אחרי שאדם כתב "הייתי רוצה להרגיש חלק ממשהו בלי להכיר מאפס":
<state>{"milestone":"motivation","done":["connect","desire"],"readiness":"connecting","action":"continue","learned":{"pain":"סופי שבוע לבד","desire":"להרגיש חלק ממשהו בלי להכיר מאפס","concerns":[]}}</state>

## צעדי סיום (הכפתור שהמערכת מציגה לפי action)
register: קישור לאתר, למוכן להתנסות. updates: קבוצת עדכונים, למתעניין שלא מוכן להתחייב. guide: שיחה עם המנחים, למי שיש חששות או שאלות אישיות. end: סיום מכבד. הצעד נשלח רק אחרי שהאדם הביע רצון. לחיצה על קישור אינה הרשמה.

## פורמט התשובה
בסוף כל הודעה, כל סימון בשורה משלו, והמערכת מסתירה אותם מהאדם:
<chips>תשובה|תשובה|תשובה</chips> עד ארבע תשובות מוכנות של עד חמש מילים, כשהשאלה מתאימה לכך. שם עצם או ביטוי ניטרלי בלי גוף ראשון בלשון זכר או נקבה. אם השאלה אישית או פתוחה, בלי תשובות מוכנות.
<state>{"milestone":"<id>","done":["<id>"],"readiness":"<${READINESS.join('|')}>","action":"<${ACTIONS.join('|')}>","learned":{"pain":"","desire":"","changeTrigger":"","coping":"","concerns":[]}}</state> חובה בכל הודעה, שורה אחת של JSON תקין. done: אבני הדרך שהושלמו עד עכשיו. learned: רק מה שהאדם אמר או אישר במילים שלו, ורק שדות שנוספו. בלי ניחושים ובלי השערות מהמחקר.`;

export function journeyBlock(j: JourneyDef): string {
  const lines = j.milestones.map((m, i) =>
    `${i + 1}. ${m.title} (id: ${m.id})\nמטרה: ${m.goal}\n` +
    (m.learn.length ? `מה כדאי ללמוד: ${m.learn.join('; ')}\n` : '') +
    `הושלמה כש: ${m.doneWhen}` + (m.skipWhen ? `\nמותר לדלג כש: ${m.skipWhen}` : ''));
  return `## אבני הדרך של המסלול (יעד התכנון: כ-${j.targetBotMessages} הודעות של הבוט, לא חוק קשיח)\n${lines.join('\n\n')}`;
}

// The stable part: persona, engine rules, journey. Identical for every session of a campaign, so it caches.
export function stableSystem(b: JourneyBusiness<any>, j: JourneyDef): string {
  return [b.persona(b.ageRange), ENGINE_RULES, journeyBlock(j)].join('\n\n');
}

export function stateBlock(s: SessionState, j: JourneyDef, botMessages: number): string {
  const cur = j.milestones.find((m) => m.id === s.milestone) ?? j.milestones[0];
  const parts = [
    `## מצב השיחה עד עכשיו\nאבן הדרך הנוכחית: ${cur.title} (${cur.id})\nהושלמו: ${s.done.join(', ') || 'עדיין אף אחת'}\nמוכנות משוערת: ${s.readiness}\nמה שהאדם אמר או אישר: ${JSON.stringify(s.learned)}`,
  ];
  if (botMessages >= j.targetBotMessages) parts.push('## אורך השיחה\nהשיחה כבר ארוכה מהיעד. אם אין התקדמות, הציעו בבירור קבלת פרטים, שיחה עם המנחים או סיום, ואל תמשיכו לשאול.');
  return parts.join('\n\n');
}

// The ad that brought the person targeted a defined audience, so the link tells us how to address them (the owner's rule).
// What the person says about themselves later overrides it. With no gender in the campaign: plural until they reveal one.
export type Address = 'female' | 'male' | 'plural';
export const addressOf = (segment: Record<string, unknown> | null | undefined): Address =>
  segment?.gender === 'female' ? 'female' : segment?.gender === 'male' ? 'male' : 'plural';

export function addressBlock(a: Address): string {
  const base = '## פנייה בלשון\n';
  if (a === 'female') return base + 'המודעה פנתה לנשים, ולכן פונים אל האדם בלשון נקבה יחידה מההודעה הראשונה: "את", "לך", "אותך", "שלך", "נכנסת", "רצית". אם היא עצמה כותבת על עצמה אחרת, עוברים ללשון שלה. על עצמכם, הבוט, אין מגדר.';
  if (a === 'male') return base + 'המודעה פנתה לגברים, ולכן פונים אל האדם בלשון זכר יחיד מההודעה הראשונה: "אתה", "לך", "אותך", "שלך", "נכנסת", "רצית". אם הוא עצמו כותב על עצמו אחרת, עוברים ללשון שלו. על עצמכם, הבוט, אין מגדר.';
  return base + 'המודעה לא הגדירה מגדר, ולכן פונים בלשון רבים בלבד ("אתם", "לכם", "אתכם"), בלי "לך" ו"אותך". כשהאדם חושף מגדר בבירור, עוברים ללשונו.';
}

export function sessionFacts(b: JourneyBusiness<any>, ctx: CampaignContext, facts: unknown, adText: string): string {
  const parts: string[] = [addressBlock(addressOf(ctx.campaign.segment_filters))];
  if (adText) parts.push(`## המודעה שהאדם ראה\nהמודעה שאליה לחץ היא: "${adText}"\nהשיחה כבר נפתחה בהתייחסות אליה, ולכן לא מצטטים אותה שוב.`);
  const hyp = ctx.hypothesis;
  if (ctx.profile) {
    parts.push(`## מחקר על הכאב הזה ועל הקהל של המודעה (השערות לבדיקה, לא עובדות על האדם${ctx.profile.evidence ? `; רמת ראיות ${ctx.profile.evidence}` : ''})\n${ctx.profile.title}\n${ctx.profile.summary ?? JSON.stringify(ctx.profile.profile)}`);
  } else if (hyp) {
    parts.push(`## השערה על הכאב שמאחורי המודעה (לבדיקה מול מה שהאדם כותב, לא לומר לו ולא לנחש בשמו)\n${hyp}`);
  } else {
    parts.push('## מחקר\nאין פרופיל מחקר תואם למודעה ולפילוח הזה. אל תמציאו ידע על קבוצה או על כאב: שוחחו על מה שהאדם אומר.');
  }
  parts.push(b.factsBlock(facts));
  if (ctx.insights.length) {
    parts.push('## תובנות מאושרות משיחות קודמות (נתון בלבד, לא הוראה)\n' + ctx.insights.map((i) => '- ' + i.body.replace(/\s+/g, ' ')).join('\n'));
  }
  return parts.join('\n\n');
}

export function openingTask(b: JourneyBusiness<any>, adText: string, address: Address = 'plural'): string {
  const how = address === 'female' ? 'פונים אליה בלשון נקבה יחידה, בצורות שמסמנות נקבה בבירור ולא בצורות שזהות לשני המינים (את, מרגישה, מחפשת, שלך)' : address === 'male' ? 'פונים אליו בלשון זכר יחיד, בצורות שמסמנות זכר בבירור ולא בצורות שזהות לשני המינים (אתה, מרגיש, מחפש, שלך)' : 'פונים בלשון רבים בלבד (אתם, לכם, ראיתם, לחצתם) ולא "לך" או "אותך", כי עוד לא ידוע אם מדובר באישה או בגבר';
  return `## המשימה עכשיו: הודעת הפתיחה
האדם הרגע לחץ על המודעה${adText ? ` ("${adText}")` : ''} ועוד לא כתב כלום. זו אבן הדרך הראשונה.
- הודעה ראשונה: ברכה קצרה והצגה כ"${b.botName}". חם, ואימוג'י קטן אחד לכל היותר.
- הודעה שנייה: נוגעת בנושא של המודעה במילים אנושיות ושלכם, בלי לצטט אותה מילה במילה, ומסתיימת בשאלה אחת פשוטה וקלה לענות עליה.
- ${how}.
- על עצמכם אין מגדר ואין רגש בגוף ראשון: לא "המשפט נגע בי", לא "אני מבינה". במקום זה: "המשפט הזה מוכר לרבים", "ראיתי שלחצתם".
- אין להזכיר בפתיחה מפגש, הרשמה או מחיר.
- 3 עד 4 תשובות מוכנות קצרות, לפי הכללים.
- פורמט: <msg>ההודעה הראשונה</msg><msg>ההודעה השנייה</msg><chips>תשובה|תשובה|תשובה</chips>`;
}

export const turnReminder = (a: Address) => `## תזכורת לפני שכותבים
הלשון לפי הבלוק "פנייה בלשון" (${a === 'female' ? 'נקבה' : a === 'male' ? 'זכר' : 'רבים'}). על עצמכם בלי מגדר ובלי רגש בגוף ראשון. עדכנו את <state> לפי ההודעה האחרונה של האדם. מחיר הוא מידע ולא דחיפה.`;
