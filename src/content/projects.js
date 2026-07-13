/* The work. A page picks which projects to show, and in what order — it never
   restates them. */
export const projects = {
  once: {
    name: "Once",
    title: "אפליקציית היכרות בזמן אמת",
    href: "https://play.google.com/store/apps/details?id=com.aviramo.once",
    ariaLabel: "האפליקציה Once",
    linkLabel: "להורדת האפליקציה",
    /* The product, shown twice: the app screen alongside the admin panel. */
    shots: [
      { src: "assets/project-once.webp", width: 900, height: 1125, alt: "האפליקציה Once — מסך פרופיל עם המסר: לא עוד מאצ׳ים, מפגש אחד אמיתי" },
      { src: "assets/project-once-admin.webp", width: 864, height: 1305, alt: "פאנל הניהול של Once, סקירת פילוח משתמשים ונתוני שימוש" },
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
      { src: "assets/project-harpatka.webp", width: 1100, height: 778, alt: "צילום מסך של האתר יוצאים להרפתקה" },
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
