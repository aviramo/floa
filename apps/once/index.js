import { runtime, site } from "./content/site.js";

/* ==========================================================================
   Once, האתר הציבורי של האפליקציה, בכתובת once.floa.co.il. עסק ידני: הבילד
   מעתיק את public/ כמו שהוא ולא מרנדר כלום.

   הוא עבר לכאן מ-web/public בריפו של Once (שעלה ל-Vercel בכתובת
   once-lake.vercel.app). האפליקציה בנייד עדיין מכירה את הכתובת הישנה בקישורים
   העמוקים שלה (mobile/app.json), ולכן הכתובת הישנה נשארת חיה עד שתצא גרסה
   חדשה של האפליקציה.

   אין טפסים ואין לידים: leadPages ריקה. מונה הביקורים של דף הבית עדיין
   כותב דרך ה-API של Vercel (/api/visit), כי הוא צריך מפתח שלא יכול לשבת בדף.
   ========================================================================== */
export const business = {
  key: "once",
  out: "once",
  root: false,

  lead: {
    to: "LEAD_TO_ONCE",
    origins: [],
  },

  site,
  runtime,
  pages: [],
  siteMap: [],
  leadPages: [],
};
