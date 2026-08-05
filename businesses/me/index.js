import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   "me" — Ofir's own documents, as a business of the domain.

   It is a business in the same sense a client is: a folder of its own at the
   root, its own stylesheet, its own pages. It is not part of FLOA's site, which
   is why the CV moved out of businesses/floa/ — a CV is not a thing FLOA sells,
   it is a thing Ofir is, and mixing the two put a personal document inside a
   company's address space.

     floa.co.il/me/cv/architect/        the CV
     floa.co.il/me/cv/architect/he/     the same document in Hebrew

   `out: "me"` is the folder and therefore the address. Nothing is emitted at
   /me/ or /me/cv/, so both 404 — the document exists at one address only.

   It collects no leads. `leadPages` is empty, so the Worker rejects anything
   claiming to come from here, and LEAD_TO_ME never needs to exist.
   ========================================================================== */
export const business = {
  key: "me",
  out: "me",
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
