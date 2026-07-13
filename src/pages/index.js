import { context } from "../lib/context.js";
import { site } from "../content/site.js";
import { home } from "../content/home.js";
import { solutions } from "../content/solutions.js";
import { accessibility, privacy } from "../content/legal.js";

import { render as renderHome } from "./home.js";
import { render as renderLegal } from "./legal-page.js";
import { render as renderSolution } from "./solution.js";

/* ==========================================================================
   The site map. Every page the build emits is one entry here.

   `base` is how deep the page sits (for assets and links); `homeHref` is how it
   points back at the homepage. Add a solution to src/content/solutions.js and
   its page appears here on its own.
   ========================================================================== */
const at = (assets, depth) => context({
  assets,
  brand: site.brand,
  base: depth,
  homeHref: depth || "index.html",
  isHome: depth === "" && false,       // set explicitly by the home entry below
});

export const pages = [
  {
    out: "index.html",
    render: (assets) => renderHome(context({ assets, brand: site.brand, base: "", homeHref: "", isHome: true })),
  },

  ...solutions.map((solution) => ({
    out: `${solution.slug}/index.html`,
    render: (assets) => renderSolution(at(assets, "../"), solution),
  })),

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
  ...[privacy, accessibility].map((doc) => ({ loc: `${site.origin}/${doc.out}`, title: doc.meta.title, description: doc.meta.description })),
];
