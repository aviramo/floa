/* ==========================================================================
   ProLink ships a hand-built site, not engine-rendered pages.

   Its whole look is its own — public/index.html, public/en/index.html and
   public/assets/ are copied verbatim into dist/prolink/. So there are no engine
   `pages` here: the only thing ProLink shares with the rest of the domain is the
   Worker that sends its lead email.
   ========================================================================== */

/* No engine pages: the site is authored by hand and copied from public/. */
export const pages = [];

/* Not advertised in any sitemap, and never in FLOA's. */
export const siteMap = [];

/* The page name that rides along with a lead and lands in the email subject.
   The hand-built form (public/assets/main.js) posts exactly this value; the
   Worker validates it against this list. */
export const leadPages = ["פרולינק"];
