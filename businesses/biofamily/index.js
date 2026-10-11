import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   BioFamily: a hand-built landing page (family biodanza for kids 3 to 10),
   served from floa.co.il/biofamily/. It shares only the lead Worker.

   `lead.to` is the NAME of a Worker environment variable, never an address.
   Set it once, then deploy:
     npx wrangler secret put LEAD_TO_BIOFAMILY && npx wrangler deploy
   until then a lead returns 502 rather than reaching an inbox.
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
