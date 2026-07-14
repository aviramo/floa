/* ==========================================================================
   The render context.

   Two jobs, and they are the only two things every component is allowed to know
   about the page it is being rendered into:

   WHERE it sits. Pages live at different depths (/index.html vs
   /digital-products/index.html), so no component may hardcode a path. Content
   stores every internal path relative to the BUSINESS's root ("assets/ofir.webp",
   "privacy.html", "digital-products/"); ctx.url() rewrites it for the page being
   rendered, and ctx.home() points an anchor at the homepage's section from
   wherever it is called.

   WHOSE it is. ctx.site is the business being rendered — its brand, its origin,
   its colours, its WhatsApp number, its icons. The engine imports it from
   nowhere: it arrives here, per render, so the same components serve FLOA and a
   client without a line of difference. Anything under src/ that reaches for a
   business by name has broken that.
   ========================================================================== */
const ABSOLUTE = /^(?:https?:|mailto:|tel:|data:|#|\/)/;

export const context = ({ base = "", homeHref = "", isHome = false, assets, site, footer }) => ({
  base,
  isHome,
  assets,
  site,
  footer,                              // footerContent(ctx) — the layout calls it
  brand: site.brand,
  /* "assets/ofir.webp" -> "../assets/ofir.webp" on a page one level down */
  url: (path) => (ABSOLUTE.test(path) ? path : base + path),
  /* home("#projects") -> "#projects" at home, "../#projects" a level down */
  home: (hash = "") => (isHome ? hash || "#top" : homeHref + hash),
});
