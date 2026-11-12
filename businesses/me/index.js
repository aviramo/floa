import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   "me" — Ofir's CVs, as a business of the domain.

   It is a business in the same sense a client is: a folder of its own at the
   root, its own stylesheet, its own pages. It is not part of FLOA's site, which
   is why the CV moved out of businesses/floa/ — a CV is not a thing FLOA sells,
   it is a thing Ofir is, and mixing the two put a personal document inside a
   company's address space.

     floa.co.il/cv/                     the AI CV, Hebrew (the default)
     floa.co.il/cv/en/                  the same document in English
     floa.co.il/cv/architect/           solution design first, Hebrew
     floa.co.il/cv/architect/en/        the same document in English
     floa.co.il/cv/analyst/  (and /en/) mobile and web analysis first

   The key stays "me" — the folder is what the business is called on the
   domain, and the folder is `cv`, because that is what a person handed one of
   these links is being handed. /cv/ itself is the AI CV; the other
   documents live under their slug and are only reached by their address.

   It collects no leads. `leadPages` is empty, so the Worker rejects anything
   claiming to come from here, and LEAD_TO_ME never needs to exist.
   ========================================================================== */
export const business = {
  key: "me",
  out: "cv",
  root: false,

  lead: {
    to: "LEAD_TO_ME",
    origins: [],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
