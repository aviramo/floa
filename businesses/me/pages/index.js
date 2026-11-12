import { context } from "#lib/context.js";
import { site } from "../content/site.js";
import { cvPages } from "../content/cv.js";
import { render as renderCv } from "./cv.js";

/* ==========================================================================
   What this business emits, and where.

     dist/cv/index.html                floa.co.il/cv/                (AI CV, Hebrew)
     dist/cv/en/index.html             floa.co.il/cv/en/             (AI CV, English)
     dist/cv/architect/index.html      floa.co.il/cv/architect/      (Hebrew)
     dist/cv/architect/en/index.html   floa.co.il/cv/architect/en/   (English)
     ...and the same pair for every other slug.

   /cv/ is the AI CV, the one the domain hands out by default. There is no
   index of the other résumés, and /cv/<slug>/ exists only for a slug that was
   given to someone.

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
