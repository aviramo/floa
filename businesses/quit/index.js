import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* Quit, an app for quitting a habit, one day at a time. A MANUAL business (see
   CLAUDE.md): the whole look is in public/, copied verbatim into dist/quit/.
   It has no form, so no lead can be sent in its name. Its data is the person's
   own, in Supabase behind Google sign-in (see schema.sql and /auth.js). */
export const business = {
  key: "quit",
  out: "quit",
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
