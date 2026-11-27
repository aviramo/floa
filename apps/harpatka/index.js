import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   יוצאים להרפתקה (harpatka.co.il). עסק ידני: הבילד מעתיק את public/ כמו שהוא
   ל-dist/harpatka/ ולא מרנדר כלום.

   public/ הוא עותק של האתר הציבורי שחי היום בריפו הנפרד של הרפתקה (הענף main),
   בלי הארכיון (v1 עד v12) ובלי כלי הניהול (admin, board, tools). מ-ads/ נכנסו
   רק שלושת הקבצים של סרטון הפתיחה, שדף הבית מפנה אליהם בשמם (ads/video ו-ads/img).
   האתר החי עדיין מתפרסם משם. העותק הזה מקומי ולא מחובר לשום דומיין.

   אין טופס של ה-Worker: ההרשמה עוברת דרך ה-API של roster. לכן `leadPages` ריקה,
   `origins` ריקה, ו-LEAD_TO_HARPATKA לא צריך להתקיים: ה-Worker ידחה כל דבר
   שיטען שהוא בא מכאן.
   ========================================================================== */
export const business = {
  key: "harpatka",
  out: "harpatka",
  root: false,

  lead: {
    to: "LEAD_TO_HARPATKA",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
