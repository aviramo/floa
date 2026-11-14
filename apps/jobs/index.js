import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Jobs, an application whose content lives in the database. A MANUAL business
   (see CLAUDE.md): the whole look is in public/, copied verbatim into
   dist/jobs/. It has no form, so no lead can be sent in its name. */
export const business = {
  key: "jobs",
  out: "jobs",
  root: false,

  lead: {
    to: "LEAD_TO",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
