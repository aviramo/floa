import { runtime, site } from "./content/site.js";

/* ==========================================================================
   floa.co.il/aum/, הכתובת הישנה של AUM. עסק ידני בלי רכיבים: public/index.html
   הוא דף אחד שמעביר ל-floa.co.il/tal/aum/ ושומר על ה-?s=... וה-#. דף הניהול
   וכל השאר נמצאים רק בכתובת החדשה.

   אין לו דפים מנועיים, אין sitemap (גוגל מקבל את הכתובת החדשה, והדף הזה
   מצביע אליה ב-canonical), והוא לא אוסף לידים: leadPages ריקה.
   ========================================================================== */
export const business = {
  key: "aum-redirect",
  out: "aum",
  root: false,

  lead: {
    to: "LEAD_TO_AUM",
    origins: [],
  },

  site,
  runtime,
  pages: [],
  siteMap: [],
  leadPages: [],
};
