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
   FLOA's pages. Every page the build emits for this business is one entry here.

   `out` is relative to the BUSINESS's root, never to the repo: FLOA happens to
   own the domain root, so its "index.html" lands at floa.co.il/, but the same
   list under a business that sits at /harpatka/ would land there instead. A page
   never knows which.

   `base` is how deep the page sits (for assets and links); `homeHref` is how it
   points back at this business's homepage. Add a solution to content/solutions.js
   and its page appears here on its own.
   ========================================================================== */
const at = (assets, depth) => context({
  assets,
  site,
  footer: footerContent,
  base: depth,
  homeHref: depth || "index.html",
  isHome: depth === "" && false,       // set explicitly by the home entry below
});

export const pages = [
  {
    out: "index.html",
    render: (assets) => renderHome(context({ assets, site, footer: footerContent, base: "", homeHref: "", isHome: true })),
  },

  ...solutions.map((solution) => ({
    out: `${solution.slug}/index.html`,
    render: (assets) => renderSolution(at(assets, "../"), solution),
  })),

  /* the landing-page-offer campaign page: its own template, not a solution,
     so it is not linked from the homepage or the ecosystem row on either
     solution page. */
  {
    out: `${landingOffer.slug}/index.html`,
    render: (assets) => renderLandingOffer(at(assets, "../")),
  },

  ...[privacy, accessibility].map((doc) => ({
    out: doc.out,
    render: (assets) => renderLegal(at(assets, ""), doc),
  })),
];

/* Every page's live URL, title and description — one row per entry above.
   robots.txt, sitemap.xml and llms.txt are generated from this in build.mjs,
   so a crawler-facing file can never list a page the build doesn't emit, or
   omit one it does. */
export const siteMap = [
  { loc: `${site.origin}/`, title: home.meta.title, description: home.meta.description },
  ...solutions.map((s) => ({ loc: `${site.origin}/${s.slug}/`, title: s.meta.title, description: s.meta.description })),
  { loc: `${site.origin}/${landingOffer.slug}/`, title: landingOffer.meta.title, description: landingOffer.meta.description },
  ...[privacy, accessibility].map((doc) => ({ loc: `${site.origin}/${doc.out}`, title: doc.meta.title, description: doc.meta.description })),
];

/* The pages that may send a lead, by the name that lands in the email's subject.
   The Worker keeps a list of its own and rejects anything else; build.mjs
   compares the two and fails the build if they drift apart. */
export const leadPages = [home.pageName, ...solutions.map((s) => s.pageName), landingOffer.pageName];
