import type { JourneyDef, Milestone } from './types.ts';

// The pain journey of the spec (chapter 4). The database may hold a newer version; this one is the fallback, so the
// engine works before any row exists and a bad row can never leave a session without a journey.
export const PAIN_JOURNEY: JourneyDef = {
  type: 'pain',
  version: 1,
  targetBotMessages: 5,
  milestones: [
    {
      id: 'connect', title: 'חיבור והזדהות',
      goal: 'שהאדם ירגיש שהשיחה רלוונטית לחוויה שלו ושאפשר לדבר עליה בנוחות. הוא הגיע ממודעה על כאב מסוים, אז לא מתחילים בחקירה מחדש.',
      learn: ['מה הביא אותו לשיחה', 'איך הכאב מתבטא אצלו בפועל'],
      doneWhen: 'יש הבנה בסיסית של החוויה שהביאה אותו, מתשובה שלו או כהשערה אם לא רצה להרחיב.',
    },
    {
      id: 'desire', title: 'גילוי הרצון',
      goal: 'להעביר את מרכז השיחה מהבעיה אל הדבר החיובי שהיה רוצה להכניס לחייו: מה הוא מחפש מאחורי הכאב. לא מניחים שכל מי שחווה את אותו כאב רוצה אותו דבר.',
      learn: ['מה היה רוצה להרגיש או לחוות במקום המצב הנוכחי'],
      doneWhen: 'זוהה רצון, צורך או כיוון חיובי אישי. אם אינו יודע להגדיר, מציעים כמה אפשרויות או ממשיכים עם הבנה חלקית, ולא נתקעים כאן.',
      skipWhen: 'הרצון כבר נאמר במפורש באבן דרך קודמת.',
    },
    {
      id: 'motivation', title: 'מוטיבציה לפעולה',
      goal: 'להבין מה גורם לו לרצות לצאת מהמצב ולנסות משהו חדש, ועד כמה הוא פתוח. אפשר להסיק זאת ממה שכבר אמר, ואין חובה לשאול ישירות.',
      learn: ['מה גרם לו לבדוק אפשרויות דווקא עכשיו', 'מה כבר ניסה'],
      doneWhen: 'יש הבנה מספקת של המוטיבציה או של רמת הפתיחות. גם סקרנות בלבד מספיקה. לא חייבים אירוע מכונן, ולא יוצרים מהטריגרים פחד, בושה או לחץ.',
      skipWhen: 'המוטיבציה כבר ברורה, או שהוא מבקש פרטים.',
    },
    {
      id: 'bridge', title: 'חיבור לפתרון',
      goal: 'ליצור חיבור הגיוני בין מה שהוא מחפש לבין חוויה שמפגש תנועה יכול להציע, ברצון שלו ובמילים שלו.',
      learn: ['האם החיבור מדבר אליו'],
      doneWhen: 'נוצר קשר אמין וברור בין הצורך האישי לאפשרות, והאדם הגיב לחיבור (מתחבר, שואל או אומר שלא). אין צורך בהתלהבות. אם אין התאמה אמיתית בין מה שהוא מחפש לבין מה שהמפגש נותן, לא כופים: מכירים בכך ועוברים לסיום מכבד.',
    },
    {
      id: 'curiosity', title: 'סקרנות וביטחון',
      goal: 'לעורר סקרנות ולהפיג חששות. נותנים טעימה קצרה ולא הסבר מלא: לא מפרטים רצף תרגילים ולא מהלך הערב, אלא רגע, אווירה או תחושה אפשרית שמתחברים למה שהוא רוצה להרגיש. עונים בכנות ובמדויק לכל שאלה ישירה, על מגע וקרבה למשל.',
      learn: ['חששות שמונעים ממנו לבחון השתתפות'],
      doneWhen: 'הוא מבין ברמה בסיסית שזה מפגש קבוצתי עם מוזיקה ותנועה, והוסרו חששות מהותיים.',
      skipWhen: 'הוא כבר מכיר, או רוצה ישר פרטים.',
    },
    {
      id: 'action', title: 'הנעה לפעולה',
      goal: 'לעזור לו לבחור צעד הבא שמתאים לעניין, למוכנות ולחששות שלו, בהמשך טבעי לשיחה ולא בטקסט מכירה קבוע.',
      learn: ['איזה צעד מתאים לו'],
      doneWhen: 'הוא בחר צעד או החליט לסיים. מוכן להתנסות: action=register. מתעניין אך לא מוכן: action=updates. מעוניין אך חושש: action=guide. לא מעוניין: action=end.',
    },
  ],
};

export function isMilestone(m: any): m is Milestone {
  return m && typeof m.id === 'string' && /^[a-z_]{2,30}$/.test(m.id) && typeof m.goal === 'string' && typeof m.doneWhen === 'string';
}

// A journey from the database, checked; anything off falls back to the default
export function journeyOf(row: { journey_type: string; version: number; definition: unknown } | null): JourneyDef {
  const d: any = row?.definition;
  const ms: Milestone[] = Array.isArray(d?.milestones) ? d.milestones.filter(isMilestone).map((m: any) => ({
    id: m.id, title: String(m.title ?? m.id), goal: String(m.goal), learn: Array.isArray(m.learn) ? m.learn.map(String) : [],
    doneWhen: String(m.doneWhen), skipWhen: m.skipWhen ? String(m.skipWhen) : undefined,
  })) : [];
  if (!row || !ms.length) return PAIN_JOURNEY;
  return { type: row.journey_type, version: row.version, milestones: ms, targetBotMessages: Number(d.targetBotMessages) || 5 };
}
