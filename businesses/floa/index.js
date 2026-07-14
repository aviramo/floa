import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   FLOA, as a business the generator can render — the same shape a client gets.

   `out` is the folder this business's site lands in, and that folder is the whole
   of it: pages, stylesheet, script, images, sitemap. Nothing of it is ever mixed
   into anyone else's.

   `root: true` marks the business that owns the DOMAIN. It is not a bigger claim
   on the address space — its pages sit in /floa/ like everyone else's — but the
   domain has files of its own (robots.txt, the favicons, the service worker, the
   CNAME) and someone has to own them.
   ========================================================================== */
export const business = {
  key: "floa",

  /* FLOA's files live in a folder like everyone else's. What used to be `out: ""`
     said the opposite: that FLOA WAS the domain, and a client was a guest inside
     it. Now the root belongs to the domain, /floa/ belongs to FLOA, /dana/ to a
     client, and the only thing at the root is what a person typing floa.co.il is
     actually asking for: the homepage (see `root` on that page).

     `root: true` still marks the business that owns the domain: it is the one
     that gets robots.txt, sitemap.xml and the domain/ folder (favicons, CNAME,
     the service worker). */
  out: "floa",
  root: true,

  /* Where this business's leads go, and who may send them.

     `to` is the NAME of a Worker environment variable, never an address: this
     repo is public, and a client's inbox does not belong in it. The value is set
     once with wrangler (see worker/README.md).

     `origins` is every origin this business is served from. While a client sits
     at floa.co.il/<key>/ these are FLOA's own; the day it moves to its own
     domain, this is the second line that changes (the first is site.origin). */
  lead: {
    to: "LEAD_TO",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
