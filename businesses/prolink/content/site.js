/* ==========================================================================
   ProLink's identity, for the generator.

   ProLink does NOT compose itself from the shared components: it has a look of
   its own, hand-built, shipped verbatim from public/. So this file carries only
   what the build itself needs — the brand it signs the lead email with, and the
   business key that rides along with every lead. The look lives in
   public/index.html and public/assets/, not here.
   ========================================================================== */
export const site = {
  brand: "ProLink",
  lang: "he",
  dir: "rtl",
  origin: "https://floa.co.il",
  folder: "prolink/",
  tagline: "המומחים לניהול זהויות ובקרת הרשאות",
  slogan: "מיקוד יחיד בניהול זהויות ובקרת הרשאות, מאז 1996",
};

/* The hand-built site reads none of this at runtime (it is not an engine page),
   but the build still ships it to a window.FLOA config file. `business` is the
   only field that matters: it is what the lead form sends so the Worker routes
   the lead to ProLink's inbox and no one else's. */
export const runtime = {
  business: "prolink",
};
