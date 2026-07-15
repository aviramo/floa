import { context } from "#lib/context.js";
import { footerContent, site } from "../content/site.js";
import { home } from "../content/home.js";
import { render as renderHome } from "./home.js";

/* ==========================================================================
   ProLink's pages, and where they land. One page for now: the homepage of the
   business, at floa.co.il/prolink/. It is NOT the domain root (FLOA owns that),
   so it sits in its own folder like any other business, and its files, styles
   and script all resolve from /prolink/.
   ========================================================================== */
export const pages = [
  {
    out: "index.html",
    render: (assets) => renderHome(context({
      assets,
      site,
      footer: footerContent,
      base: "",              // its files are right here under /prolink/
      homeHref: "",          // one page, so "home" is this page's own anchors
      isHome: true,
    })),
  },
];

/* Deliberately empty. ProLink is not advertised in any sitemap, and never in
   FLOA's: the two businesses share a domain but not an SEO surface. Its pages
   are reached directly, not through a crawler-facing file. */
export const siteMap = [];

/* The pages that may send a lead, by the name that lands in the email subject.
   The Worker keeps its own copy (generated into worker/src/businesses.js) and
   rejects anything else. */
export const leadPages = [home.pageName];
