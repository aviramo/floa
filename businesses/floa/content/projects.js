/* The work. A page picks which projects to show, and in what order — it never
   restates them. */
export const projects = {
  once: {
    name: "Once",
    title: "אפליקציית היכרות בזמן אמת",
    href: "https://once-lake.vercel.app/",
    ariaLabel: "האפליקציה Once",
    linkLabel: "לאתר האפליקציה",
    /* One capture that already holds both halves of the product: the app screen
       beside the admin panel it is managed from. */
    shots: [
      { src: "assets/project-once.webp", width: 1200, height: 1200, alt: "האפליקציה Once, מסך פרופיל לצד פאנל הניהול עם פילוח המשתמשים, תחת המסר: לא עוד מאצ׳ים, מפגש אחד אמיתי" },
    ],
    parts: [
      { label: "האתגר", text: "ליצור חוויית היכרות שמונעת הצפה ופיזור וממקדת את המשתמשים במפגש אחד בכל פעם" },
      { label: "הפתרון", text: "אפליקציית Android בזמן אמת שמחברת בין משתמשים באמצעות הזמנות, זמני תגובה וצ׳אט ממוקד" },
      { label: "מה נבנה", text: "אפליקציית Android, הרשמה, פרופילים, הזמנות, צ׳אט בזמן אמת, מנגנוני נעילה, פאנל ניהול ותשתית למדידה" },
    ],
  },

  chords: {
    name: "אקורדים",
    title: "אפליקציית ספריית שירים ואקורדים",
    href: "https://floa.co.il/chords/",
    ariaLabel: "האפליקציה אקורדים",
    linkLabel: "לאפליקציה",
    /* The library beside one song open for playing: the two screens the app
       actually lives in, captured from the running app and not redrawn. */
    shots: [
      { src: "assets/project-chords.webp", width: 1200, height: 1200, alt: "האפליקציה אקורדים, ספריית השירים בתצוגת דסקטופ לצד דף שיר פתוח לנגינה בתצוגת מובייל" },
    ],
    parts: [
      { label: "האתגר", text: "דפי אקורדים מפוזרים בין קבצים, צילומי מסך ואתרים, וכל ערב שירה מתחיל בחיפוש מחדש" },
      { label: "הפתרון", text: "אפליקציה אחת עם ספרייה משותפת, דף נגינה לכל שיר ואירועי שירה שמרכזים את הרשימה" },
      { label: "מה נבנה", text: "ספרייה עם חיפוש לפי שיר, יוצר וסגנון, עורך שירים שמעמיד כל אקורד על ההברה שלו, טרנספוזיציה, פריסה שמתאימה את עצמה למסך, אירועי שירה, התחברות ודאטהבייס משותף" },
    ],
  },

  harpatka: {
    name: "יוצאים להרפתקה",
    title: "דף נחיתה ומערך הרשמה לאירועים",
    href: "https://harpatka.co.il/",
    ariaLabel: "האתר יוצאים להרפתקה",
    linkLabel: "לצפייה באתר",
    shots: [
      /* Two captures of the live page, the desktop beside the phone, not a mock-up drawn around it. */
      { src: "assets/project-harpatka.webp", width: 1200, height: 1200, alt: "דף הנחיתה של יוצאים להרפתקה בתצוגת דסקטופ לצד תצוגת מובייל, תחת המסר: להכניס תנועה חדשה לחיים" },
    ],
    parts: [
      { label: "האתגר", text: "להפוך קונספט לא שגרתי להצעה ברורה שמסקרנת, יוצרת אמון ומובילה להרשמה" },
      { label: "הפתרון", text: "מערך דיגיטלי שמחבר בין המסר, דף הנחיתה, ההרשמה והתשלום" },
      { label: "מה נבנה", text: "חידוד הקונספט והמסרים, עיצוב ופיתוח דף הנחיתה, התאמה למובייל, טופס הרשמה, תשלום וחיבור ל־WhatsApp" },
    ],
  },

  roster: {
    name: "Roster",
    title: "אפליקציה לניהול משתתפים",
    href: "https://floa.co.il/roster/",
    ariaLabel: "האפליקציה Roster",
    linkLabel: "לאפליקציה",
    /* The admin as it runs, captured with invented participants: no real name or
       phone number is in this picture. The list beside one participant's card on
       desktop, the same list on a phone. */
    shots: [
      { src: "assets/project-roster.webp", width: 1200, height: 1200, alt: "האפליקציה Roster, רשימת משתתפי מפגש לצד כרטיס משתתף בתצוגת דסקטופ, ובתצוגת מובייל, עם נתוני הדגמה, תחת המסר: משתתפים, מפגשים ותשלומים במקום אחד" },
    ],
    parts: [
      { label: "האתגר", text: "ניהול משתתפים, תשלומים והגעה שמפוזר בין גיליונות, הודעות ומחברות, וכל מפגש מתחיל מבירור מי נרשם ומי שילם" },
      { label: "הפתרון", text: "אפליקציה אחת שבה לכל עסק יש משתתפים, מפגשים ותשלומים משלו, והגישה אליהם לפי חשבון גוגל" },
      { label: "מה נבנה", text: "רשימת משתתפים לכל מפגש, סטטוס תשלום והגעה, הערות על כל משתתף, תבניות הודעה ל־WhatsApp, חשבון כספי, סוגי מפגשים והתחברות עם גוגל" },
    ],
  },

  aum: {
    name: "AUM",
    title: "דף נחיתה והרשמה לריטריט יומי",
    href: "https://floa.co.il/aum/",
    ariaLabel: "האתר AUM",
    linkLabel: "לצפייה באתר",
    /* Two captures of the live page, desktop beside phone, like harpatka. */
    shots: [
      { src: "assets/project-aum.webp", width: 1200, height: 1200, alt: "דף הנחיתה של AUM בתצוגת דסקטופ לצד תצוגת מובייל, תחת המסר: מכעס לאהבה, מבכי לצחוק, יום אחד, 12 שלבים" },
    ],
    parts: [
      { label: "האתגר", text: "להפוך ריטריט יומי של מדיטציה להצעה ברורה, שמסבירה מה קורה ביום ומזמינה גם מי שמעולם לא היה בריטריט" },
      { label: "הפתרון", text: "דף נחיתה שמספר את היום ואת 12 השלבים, ואחריו הרשמה קצרה שנשמרת ישר בדאטהבייס" },
      { label: "מה נבנה", text: "דף נחיתה מותאם למובייל, טופס הרשמה, ואדמין לניהול נרשמים, מפגשים, תגיות, סימון הגעה ותשלום" },
    ],
  },

  perfecti: {
    name: "ניקיון פרפקטי",
    title: "פרסום ממומן בגוגל לעסק ניקיון",
    href: "https://floa.co.il/perfecti/",
    ariaLabel: "דף הנחיתה של ניקיון פרפקטי",
    linkLabel: "לצפייה בדף הנחיתה",
    /* The sponsored result is the front of the picture, the page it leads to sits behind it
       and on the phone. */
    shots: [
      { src: "assets/project-perfecti.webp", width: 1200, height: 1200, alt: "מודעת חיפוש ממומנת של ניקיון פרפקטי בגוגל, לצד דף הנחיתה שאליו היא מובילה, בתצוגת דסקטופ ובתצוגת מובייל" },
    ],
    parts: [
      { label: "האתגר", text: "להביא פניות ממי שמחפש עכשיו ניקוי ספות, שטיחים או הדברה בגוגל, ולהפוך חיפוש לשיחה בוואטסאפ" },
      { label: "הפתרון", text: "קמפיין חיפוש ממומן ודף נחיתה אחד שמבטיח מחיר מראש ומבקש פעולה אחת: לשלוח תמונה" },
      { label: "מה נבנה", text: "מודעות חיפוש, תמונות ולוגו למודעה, דף נחיתה עם מחירי התחלה וכפתור וואטסאפ, ומדידת המרה על כל פנייה" },
    ],
  },

  /* Two clients with nothing public to open, so no `href`: the card shows the
     client's mark where a capture would be, and says what was built in the
     client's own testimonial words, with no label and no link. */
  telaviv: {
    title: "עיריית תל אביב",
    shots: [
      { src: "assets/client-telaviv.webp", width: 900, height: 491, alt: "הסמל של עיריית תל אביב-יפו" },
    ],
    parts: [
      { text: "תהליך בין־מחלקתי שבו משימה באגף אחד מפעילה פעולה באגף אחר, עם ממשק משתמש, בקרות ותהליך עבודה מוסדר" },
    ],
  },

  outlet: {
    title: "דפוס אאוטלט",
    shots: [
      { src: "assets/client-outlet.webp", width: 488, height: 304, alt: "הלוגו של דפוס אאוטלט" },
    ],
    parts: [
      { text: "מיילים מלקוחות הופכים אוטומטית לכרטיסי עבודה ב־Trello ונכנסים לתהליך טיפול מסודר" },
    ],
  },
};

/* pick("harpatka", "once") -> those two, in that order */
export const pick = (...keys) => keys.map((key) => projects[key]);
