import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Biodanza, a MANUAL business (see CLAUDE.md): the whole look is in public/,
   copied verbatim into dist/biodanza/ and served from biodanza.floa.co.il. */
export const business = {
  key: "biodanza",
  out: "biodanza",
  root: false,

  lead: {
    to: "LEAD_TO_BIODANZA",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "https://biodanza.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
