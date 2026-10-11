import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   BioFamily: a hand-built landing page (family biodanza for kids 3 to 10),
   served from floa.co.il/biofamily/. It shares only the lead Worker.

   There is no form: people reach the facilitator on WhatsApp. `leadPages` is
   empty, so the Worker accepts no leads for this business and no LEAD_TO secret
   is needed. (`lead.to` stays because the manifest shape requires it.)
   ========================================================================== */
export const business = {
  key: "biofamily",
  out: "biofamily",
  root: false,

  lead: {
    to: "LEAD_TO_BIOFAMILY",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
