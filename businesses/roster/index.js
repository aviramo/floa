import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Roster, participant management for many businesses. A MANUAL business (see
   CLAUDE.md): the whole look is in public/, copied verbatim into dist/roster/.

   Two layers, both behind the domain's Google sign-in (/auth.js):
     /roster/        the owner's layer: define businesses, and for each one the
                     Google accounts that belong to it (public/index.html)
     /roster/admin/  one business's participants, meetings and payments, scoped
                     to the business named in ?biz= (public/admin/index.html)

   It has no form, so no lead can be sent in its name. */
export const business = {
  key: "roster",
  out: "roster",
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
