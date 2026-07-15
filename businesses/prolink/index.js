import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   ProLink, as a business the generator renders — the same shape FLOA has.

   `out` is the folder its site lands in: floa.co.il/prolink/. It is not the
   domain root (FLOA is), so `root` is false and it owns no domain files.

   `lead.to` is the NAME of a Worker environment variable, never an address —
   this repo is public. Set it once with wrangler:
     npx wrangler secret put LEAD_TO_PROLINK && npx wrangler deploy
   until then, a ProLink lead returns 502 rather than reaching an inbox.
   ========================================================================== */
export const business = {
  key: "prolink",
  out: "prolink",
  root: false,

  lead: {
    to: "LEAD_TO_PROLINK",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
