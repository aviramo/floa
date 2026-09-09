import { context } from "#lib/context.js";
import { site } from "../content/site.js";
import { cvPages } from "../content/cv.js";
import { render as renderCv } from "./cv.js";

/* ==========================================================================
   What this business emits, and where.

     dist/cv/architect/index.html      floa.co.il/cv/architect/
     dist/cv/architect/he/index.html   floa.co.il/cv/architect/he/
     dist/cv/analyst/index.html        floa.co.il/cv/analyst/
     dist/cv/analyst/he/index.html     floa.co.il/cv/analyst/he/

   Nothing is emitted at /cv/ itself. On a static host an address exists only if
   a file was written for it, so it 404s — which is the point: there is no index
   of the résumés, and a shortened guess at one leads nowhere.

   Each page carries its own depth. `base` is how it reaches this business's
   stylesheet, `homeHref` how it would reach a homepage — there is none here, so
   it points at the business folder and nothing links to it. Both come out of
   ../content/cv-shared.js, from the document's slug and language.
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
