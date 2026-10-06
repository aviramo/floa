import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   test, עסק לדוגמה. עסק ידני, כמו ProLink ו-Perfecti: הבילד מעתיק את
   public/ כמו שהוא ולא מרנדר כלום.

   `out` היא התיקייה שאליה הוא נבנה, ולכן גם הכתובת: floa.co.il/test/.
   הוא לא בעל הדומיין, אז `root` הוא false ואין לו קבצים בשורש.

   אין בו טופס. `leadPages` ריקה, וה-Worker ידחה כל ליד שיטען שהוא בא מכאן,
   ולכן LEAD_TO_TEST לא צריך להתקיים.
   ========================================================================== */
export const business = {
  key: "test",
  out: "test",
  root: false,

  lead: {
    to: "LEAD_TO_TEST",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
