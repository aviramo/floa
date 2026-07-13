/* The work. A page picks which projects to show, and in what order — it never
   restates them. */
export const projects = {
  once: {
    name: "Once",
    title: "אפליקציית היכרות בזמן אמת",
    href: "https://play.google.com/store/apps/details?id=com.aviramo.once",
    ariaLabel: "האפליקציה Once",
    linkLabel: "להורדת האפליקציה",
    /* One capture that already holds both halves of the product: the app screen
       beside the admin panel it is managed from. */
    shots: [
      { src: "assets/project-once.webp", width: 1400, height: 788, alt: "האפליקציה Once, מסך פרופיל לצד פאנל הניהול עם פילוח המשתמשים, תחת המסר: לא עוד מאצ׳ים, מפגש אחד אמיתי" },
    ],
    parts: [
      { label: "האתגר", text: "ליצור חוויית היכרות שמונעת הצפה ופיזור וממקדת את המשתמשים במפגש אחד בכל פעם" },
      { label: "הפתרון", text: "אפליקציית Android בזמן אמת שמחברת בין משתמשים באמצעות הזמנות, זמני תגובה וצ׳אט ממוקד" },
      { label: "מה נבנה", text: "אפליקציית Android, הרשמה, פרופילים, הזמנות, צ׳אט בזמן אמת, מנגנוני נעילה, פאנל ניהול ותשתית למדידה" },
    ],
  },

  harpatka: {
    name: "יוצאים להרפתקה",
    title: "דף נחיתה ומערך הרשמה לאירועים",
    href: "https://harpatka.co.il/",
    ariaLabel: "האתר יוצאים להרפתקה",
    linkLabel: "לצפייה באתר",
    shots: [
      { src: "assets/project-harpatka.webp", width: 1400, height: 788, alt: "דף הנחיתה של יוצאים להרפתקה, בתצוגת דסקטופ לצד תצוגת מובייל" },
    ],
    parts: [
      { label: "האתגר", text: "להפוך קונספט לא שגרתי להצעה ברורה שמסקרנת, יוצרת אמון ומובילה להרשמה" },
      { label: "הפתרון", text: "מערך דיגיטלי שמחבר בין המסר, דף הנחיתה, ההרשמה והתשלום" },
      { label: "מה נבנה", text: "חידוד הקונספט והמסרים, עיצוב ופיתוח דף הנחיתה, התאמה למובייל, טופס הרשמה, תשלום וחיבור ל־WhatsApp" },
    ],
  },
};

/* pick("harpatka", "once") -> the two, in that order */
export const pick = (...keys) => keys.map((key) => projects[key]);
