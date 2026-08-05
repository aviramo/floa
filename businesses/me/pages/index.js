import { context } from "#lib/context.js";
import { site } from "../content/site.js";
import { cvPages } from "../content/cv.js";
import { render as renderCv } from "./cv.js";

/* ==========================================================================
   What this business emits, and where.

     dist/me/cv/architect/index.html      floa.co.il/me/cv/architect/
     dist/me/cv/architect/he/index.html   floa.co.il/me/cv/architect/he/

   Nothing is emitted at /me/ or at /me/cv/. On a static host an address exists
   only if a file was written for it, so both of those 404 — which is the point:
   the document has one address, and a shortened guess at it leads nowhere.

   Each page carries its own depth. `base` is how it reaches this business's
   stylesheet, `homeHref` how it would reach a homepage — there is none here, so
   it points at the business folder and nothing links to it.
   ========================================================================== */
export const pages = cvPages.map((cv) => ({
  out: cv.out,
  render: (assets) => renderCv(context({
    assets,
    site,
    footer: () => ({}),                  // the résumé layout renders no footer
    base: cv.base,
    homeHref: cv.homeHref,
  }), cv),
}));

/* A personal document. Not advertised in any sitemap, and never in FLOA's. */
export const siteMap = [];

/* No form, no leads. An empty list means the Worker rejects anything that
   claims to be from here. */
export const leadPages = [];
