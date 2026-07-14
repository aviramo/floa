import { context } from "#lib/context.js";
import { footerContent, site } from "../content/site.js";
import { home } from "../content/home.js";
import { solutions } from "../content/solutions.js";
import { landingOffer } from "../content/landing-offer.js";
import { accessibility, privacy } from "../content/legal.js";

import { render as renderHome } from "./home.js";
import { render as renderLegal } from "./legal-page.js";
import { render as renderSolution } from "./solution.js";
import { render as renderLandingOffer } from "./landing-offer.js";

/* ==========================================================================
   FLOA's pages, and where they land.

   Everything FLOA owns lives under /floa/ — pages, stylesheet, script, images —
   because the root of the domain belongs to the DOMAIN, not to a business.
   A client under /dana/ is then FLOA's equal, not its guest, and no client can
   ever be named after one of FLOA's pages.

   The homepage is the one exception, and it is not a special case so much as a
   different thing: floa.co.il/ has to BE the homepage, because that is what a
   person typing the domain is asking for. So it is emitted at the domain root
   (`root: true`) while its files still come from /floa/ — which is exactly what
   `base: "floa/"` says.

   A page's `out` is relative to the business's folder unless it says `root`, in
   which case it is relative to the domain.

   THE DEPTHS, once, so no one has to work them out again:

     dist/index.html                       base "floa/"   home "" (itself)
     dist/floa/<slug>/index.html           base "../"     home "../../"
     dist/floa/privacy.html                base ""        home "../"

   `base` is how a page reaches FLOA's files; `homeHref` is how it reaches the
   homepage. They differ now, and that is the whole of the change.
   ========================================================================== */
const at = (assets, base, homeHref) => context({
  assets,
  site,
  footer: footerContent,
  base,
  homeHref,
});

/* one folder down inside /floa/: the solution pages and the campaign page */
const inFolder = (assets) => at(assets, "../", "../../");

/* a file sitting directly in /floa/: the legal documents */
const inRoot = (assets) => at(assets, "", "../");

export const pages = [
  {
    out: "index.html",
    root: true,                          // the domain root, not /floa/
    render: (assets) => renderHome(context({
      assets, site, footer: footerContent,
      base: "floa/",                     // its files are still FLOA's
      homeHref: "",
      isHome: true,
    })),
  },

  ...solutions.map((solution) => ({
    out: `${solution.slug}/index.html`,
    render: (assets) => renderSolution(inFolder(assets), solution),
  })),

  /* the landing-page-offer campaign page: its own template, not a solution,
     so it is not linked from the homepage or the ecosystem row on either
     solution page. */
  {
    out: `${landingOffer.slug}/index.html`,
    render: (assets) => renderLandingOffer(inFolder(assets)),
  },

  ...[privacy, accessibility].map((doc) => ({
    out: doc.out,
    render: (assets) => renderLegal(inRoot(assets), doc),
  })),
];

/* The old addresses (/digital-products/, /landing-page-offer/ and the rest) are
   gone, deliberately: they 404 rather than redirect. The site is young enough
   that a clean address space is worth more than the links pointing at the old
   one. Anything that advertises them, the Facebook campaign above all, has to be
   pointed at the new address by hand. */

/* Every page's live URL, title and description — one row per entry above.
   sitemap.xml and llms.txt are generated from this in build.mjs, so a
   crawler-facing file can never list a page the build doesn't emit, or omit one
   it does. */
export const siteMap = [
  { loc: `${site.origin}/`, title: home.meta.title, description: home.meta.description },
  ...solutions.map((s) => ({ loc: `${site.origin}/${site.folder}${s.slug}/`, title: s.meta.title, description: s.meta.description })),
  { loc: `${site.origin}/${site.folder}${landingOffer.slug}/`, title: landingOffer.meta.title, description: landingOffer.meta.description },
  ...[privacy, accessibility].map((doc) => ({ loc: `${site.origin}/${site.folder}${doc.out}`, title: doc.meta.title, description: doc.meta.description })),
];

/* The pages that may send a lead, by the name that lands in the email's subject.
   The Worker keeps a list of its own and rejects anything else; build.mjs
   generates that list from this one, so the two cannot drift apart. */
export const leadPages = [home.pageName, ...solutions.map((s) => s.pageName), landingOffer.pageName];
