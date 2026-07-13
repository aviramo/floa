import { context } from "../lib/context.js";
import { site } from "../content/site.js";
import { solutions } from "../content/solutions.js";
import { accessibility, privacy } from "../content/legal.js";

import { render as renderHome } from "./home.js";
import { render as renderLegal } from "./legal-page.js";
import { render as renderSolution } from "./solution.js";

/* ==========================================================================
   The site map. Every page the build emits is one entry here.

   `base` is how deep the page sits (for assets and links); `homeHref` is how it
   points back at the homepage. Add a sixth solution to src/content/solutions.js
   and its page appears here on its own.
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
