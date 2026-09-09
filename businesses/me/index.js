import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   "me" — Ofir's CVs, as a business of the domain.

   It is a business in the same sense a client is: a folder of its own at the
   root, its own stylesheet, its own pages. It is not part of FLOA's site, which
   is why the CV moved out of businesses/floa/ — a CV is not a thing FLOA sells,
   it is a thing Ofir is, and mixing the two put a personal document inside a
   company's address space.

     floa.co.il/cv/architect/           solution design first
     floa.co.il/cv/architect/he/        the same document in Hebrew
     floa.co.il/cv/analyst/             mobile and web analysis first
     floa.co.il/cv/analyst/he/          the same document in Hebrew

   The key stays "me" — the folder is what the business is called on the
   domain, and the folder is `cv`, because that is what a person handed one of
   these links is being handed. Nothing is emitted at /cv/ itself, so it 404s:
   there is no index of Ofir's résumés, only the one whose address was given.

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
