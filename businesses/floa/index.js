import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   FLOA, as a business the generator can render — the same shape a client gets.

   `out` is where this business's site lands, relative to the repo root. FLOA's
   is "" because FLOA owns the domain: GitHub Pages serves floa.co.il from the
   repo root, so its index.html has to BE the repo's index.html. A client's is
   its own folder, and that folder is the whole of its site — pages, stylesheet,
   script, sitemap. Nothing of it is ever mixed into anyone else's.

   `root: true` says the same thing in the one place it has a second consequence:
   robots.txt only exists at the root of a domain, so only the business that owns
   the root gets one.
   ========================================================================== */
export const business = {
  key: "floa",
  out: "",
  root: true,

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
