/* The index of FLOA's apps: what each one is, in a line, and where it lives.
   `img` is relative to FLOA's own files (assets/apps/), `href` is the app's
   own address. */
export const appsPage = {
  meta: {
    title: "האפליקציות של FLOA",
    description: "כל האפליקציות והאתרים ש-FLOA בנתה, במקום אחד: אקורדים, ניהול משתתפים, חיפוש עבודה אוטומטי ועוד.",
  },
  title: "האפליקציות של FLOA",
  lead: "כל מה שבנינו וחי באוויר, במקום אחד",
  apps: [
    { name: "אקורדים", text: "ספריית שירים עם האקורדים על ההברה שלהם, ועורך לשירים שלך.", img: "assets/apps/chords.webp", href: "https://chords.floa.co.il/", alt: "מסך השירים באפליקציית אקורדים" },
    { name: "Roster", text: "ניהול משתתפים לכמה עסקים: הרשמה, הגעה, תשלום ותגיות, מהטלפון.", img: "assets/apps/roster.webp", href: "https://roster.floa.co.il/", alt: "מסך הניהול של Roster" },
    { name: "חיפוש עבודה", text: "הגשת מועמדות אוטומטית למשרות שמתאימות לך, ומעקב אחרי כל אחת.", img: "assets/apps/jobs.svg", href: "https://jobs.floa.co.il/", alt: "תיק עבודה על רקע כחול" },
    { name: "AUM", text: "ריטריט יומי של מדיטציה: דף הרשמה, ואדמין לנרשמים ולסימון הגעה.", img: "assets/apps/aum.webp", href: "https://aum.floa.co.il/", alt: "אולם הריטריט של AUM" },
    { name: "טל אמיתי לביא", text: "אמנות, ריטריטים וביודנסה: האתר של טל בפרדס חנה.", img: "assets/apps/tal.webp", href: "https://tal.floa.co.il/", alt: "יצירת אמנות של טל, קבוצת כוכבים" },
    { name: "טל וטליה", text: "הדף של טל וטליה, עם כל מה שצריך לדעת ולהצטרף.", img: "assets/apps/taltalia.webp", href: "https://taltalia.floa.co.il/", alt: "מעגל של משתתפים" },
    { name: "ביודנסה למשפחה", text: "חוויה מחברת של תנועה ושמחה להורים ולילדים.", img: "assets/apps/biofamily.webp", href: "https://biofamily.floa.co.il/", alt: "משפחה רוקדת ביחד" },
    { name: "קורות חיים", text: "קורות החיים של אופיר אביר, בגרסה לכל תפקיד.", img: "assets/apps/cv.jpg", href: "https://cv.floa.co.il/", alt: "אופיר אביר" },
  ],
};
