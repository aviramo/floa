import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   ניקיון פרפקטי, כעסק של הדומיין. עסק ידני, כמו ProLink: הבילד מעתיק את
   public/ כמו שהוא ולא מרנדר כלום.

   `out` היא התיקייה שאליה הוא נבנה, ולכן גם הכתובת: floa.co.il/perfecti/.
   הוא לא בעל הדומיין, אז `root` הוא false ואין לו קבצים בשורש.

   `lead.to` הוא שם של משתנה סביבה ב-Worker ולא כתובת מייל, אבל כאן הוא לא
   יידרש: אין בדף טופס, והפנייה היחידה יוצאת ישירות לוואטסאפ. `leadPages`
   ריקה, וה-Worker ידחה כל דבר שיטען שהוא בא מכאן.
   ========================================================================== */
export const business = {
  key: "perfecti",
  out: "perfecti",
  root: false,

  lead: {
    to: "LEAD_TO_PERFECTI",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
