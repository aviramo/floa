/* The work. A page picks which projects to show, and in what order — it never
   restates them. */
export const projects = {
  once: {
    name: "Once",
    title: "אפליקציית היכרות בזמן אמת",
    href: "https://play.google.com/store/apps/details?id=com.aviramo.once",
    ariaLabel: "האפליקציה Once",
    linkLabel: "להורדת האפליקציה",
    /* Only real screens of the real product. assets/project-once.webp was a
       rendered iPhone mockup of an interface that does not exist — it is not
       shown anywhere. The two Android screens are held open until the real
       captures land; drop the file in assets/ and swap the placeholder for
       { src, width, height, alt }. */
    shots: [
      {
        placeholder: true,
        replace: "Replace with real Once screenshot",
        frame: "mobile",
        text: "מסך האפליקציה ב-Android",
      },
      {
        placeholder: true,
        replace: "Replace with real Once screenshot",
        frame: "mobile",
        text: "מסך ההזמנה או הצ׳אט",
      },
      { src: "assets/project-once-admin.webp", width: 864, height: 1305, alt: "פאנל הניהול של Once, סקירת פילוח משתמשים ונתוני שימוש" },
    ],
    parts: [
      { label: "האתגר", text: "ליצור חוויית היכרות שמונעת הצפה ופיזור וממקדת את המשתמשים במפגש אחד בכל פעם" },
      { label: "הפתרון", text: "אפליקציית Android בזמן אמת שמחברת בין משתמשים באמצעות הזמנות, זמני תגובה וצ׳אט ממוקד" },
      { label: "מה נבנה", text: "אפליקציית Android, הרשמה, פרופילים, הזמנות, צ׳אט בזמן אמת, מנגנוני נעילה, פאנל ניהול ותשתית למדידה ושיווק" },
    ],
  },

  harpatka: {
    name: "יוצאים להרפתקה",
    title: "מערך דיגיטלי להרשמה ושיווק אירועים",
    href: "https://harpatka.co.il/",
    ariaLabel: "האתר יוצאים להרפתקה",
    linkLabel: "לצפייה באתר",
    shots: [
      { src: "assets/project-harpatka.webp", width: 1100, height: 778, alt: "צילום מסך של האתר יוצאים להרפתקה" },
    ],
    parts: [
      { label: "האתגר", text: "להפוך קונספט לא שגרתי להצעה ברורה שמסקרנת, יוצרת אמון ומובילה להרשמה" },
      { label: "הפתרון", text: "מערך דיגיטלי שמחבר בין המסר, דף הנחיתה, ההרשמה, התשלום והמדידה" },
      { label: "מה נבנה", text: "חידוד הקונספט והמסרים, עיצוב ופיתוח דף הנחיתה, התאמה למובייל, טופס הרשמה, תשלום, מעקב המרות והתאמה לקמפיינים ול־WhatsApp" },
    ],
  },
};

/* pick("harpatka", "once") -> the two, in that order */
export const pick = (...keys) => keys.map((key) => projects[key]);
