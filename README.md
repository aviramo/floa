# FLOA — האתר

האתר של **FLOA** (floa.co.il). RTL, מובייל קודם, סטטי לחלוטין (GitHub Pages).

הדפים **אינם נכתבים ביד**. הם נבנים מקומפוננטות: כל אלמנט באתר (כפתור, כרטיס,
טופס, תמונה, ציטוט, תרשים) הוא קומפוננטה עצמאית שמקבלת פרמטרים, והדף הוא רשימה
של קומפוננטות שמוזנות מתוכן. קובצי ה-HTML שבשורש הריפו הם **פלט של הבנייה**.

## הרצה

```bash
npm run build     # בונה את כל האתר לשורש הריפו
npm run dev       # בונה, מגיש ב-http://localhost:5173, ובונה מחדש בכל שינוי
npm run watch     # בונה מחדש בכל שינוי, בלי שרת
```

אין תלויות. Node בלבד.

## מבנה

```
build.mjs                  # הגנרטור: מרנדר דפים, מאחד CSS ו-JS, חותם גרסה
src/
  bundle.js                # סדר האיחוד של ה-CSS וה-JS (זהו חוזה ה-cascade)
  lib/
    html.js                # מנוע התבניות (html``, escaping, attrs)
    context.js             # פתרון נתיבים לפי עומק הדף (ctx.url / ctx.home)
    *.client.js            # התנהגויות רוחביות: reveal, anchors, analytics
  design/                  # הבסיס: tokens, reset, layout, typography, motion
  components/<name>/
    <name>.js              # הרינדור — מקבל פרמטרים, מחזיר HTML
    <name>.css             # הסגנון של אותה קומפוננטה בלבד
    <name>.client.js       # ההתנהגות שלה בדפדפן (אם יש)
  content/                 # התוכן: site, solutions, projects, quotes, legal
    hero-art/*.svg         # האיור הייחודי של כל דף פתרון
  layouts/base.js          # מעטפת המסמך: meta, OG, JSON-LD, פוטר, סקריפטים
  pages/
    index.js               # מפת האתר — כל דף שנוצר מופיע כאן
    home.js / solution.js / legal-page.js
```

### CSS אחיד

הסגנון נכתב פר־קומפוננטה, אבל נשלח כ**קובץ אחד** — `css/styles.css` — שנבנה
מאיחוד הקבצים לפי הסדר שב-`src/bundle.js`. אותו דבר ל-JS: `js/main.js`.
שניהם מקבלים חתימת תוכן (`?v=<hash>`) כדי שמטמון לא יגיש גרסה ישנה.

קומפוננטה חדשה שלא נרשמה ב-`bundle.js` עדיין תיכלל (בסוף, עם אזהרה בבנייה),
כך שאי אפשר "לאבד" סגנון בטעות.

### להוסיף דף פתרון שישי

מוסיפים אובייקט ל-`src/content/solutions.js` וקובץ SVG ב-`src/content/hero-art/`.
זה הכול — הדף עצמו, הכרטיס בדף הבית, והכרטיס ברשת "התמונה המלאה" בכל שאר הדפים
נוצרים מאותו אובייקט.

### מקור אמת אחד

מספר ה-WhatsApp, נוסח ההודעה, שדות הטופס והדומיין יושבים ב-`src/content/site.js`.
גם הדפדפן קורא משם: הבנייה מזריקה את `runtime` ל-`window.FLOA.config`.

## טופס יצירת קשר — Firestore

בשליחה מוצלחת הפנייה נשמרת ב-Cloud Firestore (אוסף `leads`) דרך `js/firebase.js`.
הודעת ה"תודה" מוצגת רק אחרי שהשמירה באמת הצליחה; אחרת מוצגת שורת שגיאה עם
הפנייה ל-WhatsApp.

### Firestore Security Rule

יצירה בלבד, ללא קריאה:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leads/{leadId} {
      allow read, update, delete: if false;
      allow create: if
        request.resource.data.name is string &&
        request.resource.data.name.size() > 0 &&
        request.resource.data.name.size() <= 100 &&
        request.resource.data.phone is string &&
        request.resource.data.phone.size() > 0 &&
        request.resource.data.phone.size() <= 40 &&
        request.resource.data.business is string &&
        request.resource.data.business.size() <= 120 &&
        request.resource.data.improve is string &&
        request.resource.data.improve.size() <= 2000 &&
        request.resource.data.source == "floa-landing";
    }
  }
}
```

## תמונות שממתינות לצילום אמיתי

האתר לא ממציא צילומי מסך ולא נתונים. במקומות שבהם עדיין אין צילום אמיתי מוצג
placeholder מעוצב, ובקוד יש הערה מפורשת. חיפוש `Replace with real` יראה את כולם:

- `websites` — צילום האתר במחשב ובמובייל
- `systems-apps` / `automations` — שני מסכי Android אמיתיים של Once
  (`assets/project-once.webp` הוא מוקאפ אייפון מזויף ואינו בשימוש)
- `marketing` — דשבורד מדידה אמיתי

להחלפה: מוסיפים את הקובץ ל-`assets/` ומחליפים ב-`src/content/` את אובייקט ה-
placeholder ב-`{ src, width, height, alt }`.

## נגישות ו-SEO

- RTL מלא, `lang="he"`, `H1` אחד לדף, היררכיית כותרות תקינה.
- `alt` לכל תמונה, ניווט מקלדת, `:focus-visible`, כיבוד `prefers-reduced-motion`.
- Canonical, Open Graph ו-JSON-LD לכל דף — כולם נגזרים מ-`site.origin`.
