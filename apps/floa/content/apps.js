/* The index of FLOA's apps: what each one is, in a line, and where it lives.
   `img` is the app's own favicon, copied to FLOA's files (assets/apps/);
   `href` is the app's own address. Two groups: the ones that live on
   floa.co.il, and the ones FLOA built that live somewhere else. */
export const appsPage = {
  meta: {
    title: "האפליקציות של FLOA",
    description: "כל האפליקציות והאתרים ש-FLOA בנתה, במקום אחד: אקורדים, ניהול משתתפים, חיפוש עבודה ועוד.",
  },
  title: "האפליקציות של FLOA",
  lead: "כל מה שבנינו וחי באוויר, במקום אחד",
  groups: [
    {
      head: "אפליקציות ואתרים",
      apps: [
        { name: "אקורדים", text: "ספריית שירים עם האקורדים על ההברה שלהם, ועורך לשירים שלך.", img: "assets/apps/chords.png", href: "https://chords.floa.co.il/" },
        { name: "Roster", text: "ניהול משתתפים לכמה עסקים: הרשמה, הגעה, תשלום ותגיות, מהטלפון.", img: "assets/apps/roster.svg", href: "https://roster.floa.co.il/" },
        { name: "חיפוש עבודה", text: "הגשת מועמדות אוטומטית למשרות שמתאימות לך, ומעקב אחרי כל אחת.", img: "assets/apps/jobs.svg", href: "https://jobs.floa.co.il/" },
        { name: "AUM", text: "ריטריט יומי של מדיטציה: דף הרשמה, ואדמין לנרשמים ולסימון הגעה.", img: "assets/apps/aum.png", href: "https://aum.floa.co.il/" },
        { name: "טל אמיתי לביא", text: "אמנות, ריטריטים וביודנסה: האתר של טל בפרדס חנה.", img: "assets/apps/tal.png", href: "https://tal.floa.co.il/" },
        { name: "טל וטליה", text: "הדף של טל וטליה, עם כל מה שצריך לדעת ולהצטרף.", img: "assets/apps/taltalia.png", href: "https://taltalia.floa.co.il/" },
        { name: "ביודנסה למשפחה", text: "חוויה מחברת של תנועה ושמחה להורים ולילדים.", img: "assets/apps/biofamily.png", href: "https://biofamily.floa.co.il/" },
        { name: "קורות חיים", text: "קורות החיים של אופיר אביר, בגרסה לכל תפקיד.", img: "assets/apps/cv.png", href: "https://cv.floa.co.il/" },
      ],
    },
    {
      head: "מחוץ ל-FLOA",
      sub: "נבנו כאן, וחיים בכתובת משלהם",
      apps: [
        { name: "Once", text: "אפליקציית היכרות בזמן אמת.", img: "assets/apps/once.png", href: "https://once-lake.vercel.app/" },
        { name: "יוצאים להרפתקה", text: "דף נחיתה ומערך הרשמה לאירועים.", img: "assets/apps/harpatka.png", href: "https://harpatka.co.il/" },
      ],
    },
  ],
};
