import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   Inbar, a hand-built flyer shipped verbatim from public/ to floa.co.il/inbar/.

   It collects no leads: `leadPages` is empty, so the Worker rejects anything
   claiming to come from here and LEAD_TO_INBAR never needs to exist. If a form
   is added later, list its page name in leadPages and set the secret:
     npx wrangler secret put LEAD_TO_INBAR && npx wrangler deploy
   ========================================================================== */
export const business = {
  key: "inbar",
  out: "inbar",
  root: false,

  lead: {
    to: "LEAD_TO_INBAR",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
