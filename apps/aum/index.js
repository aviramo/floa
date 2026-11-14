import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   AUM, ריטריט יומי של מדיטציית AUM בהנחיית טל אמיתי-לביא. עסק ידני, כמו
   ProLink ו-Perfecti: הבילד מעתיק את public/ כמו שהוא ולא מרנדר כלום.

   `out` היא התיקייה שאליה הוא נבנה, ולכן גם הכתובת: floa.co.il/tal/aum/.
   הוא לא בעל הדומיין, אז `root` הוא false ואין לו קבצים בשורש.

   ההרשמה והבאנר של הדף (public/assets/api.js) עוברים ל-API הציבורי של roster, והמשתתפים
   מתנהלים שם, בעסק aum: floa.co.il/roster/aum.
   הטבלאות הישנות (aum_*, ב-schema.sql) נשארות כגיבוי, ו-move-to-roster.sql הוא מה שהעביר
   אותן. לכן `leadPages` ריקה ו-LEAD_TO_AUM לא צריך להתקיים: ה-Worker ידחה כל דבר
   שיטען שהוא בא מכאן.
   ========================================================================== */
export const business = {
  key: "aum",
  out: "tal/aum",
  root: false,

  lead: {
    to: "LEAD_TO_AUM",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
