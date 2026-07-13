/* ==========================================================================
   The render context.

   Pages live at different depths (/index.html vs /digital-products/index.html),
   so no component may hardcode a path. Content stores every internal path
   relative to the SITE root ("assets/ofir.webp", "privacy.html",
   "digital-products/"); ctx.url() rewrites it for the page being rendered, and
   ctx.home() points an anchor at the homepage's section from wherever it is
   called.
   ========================================================================== */
const ABSOLUTE = /^(?:https?:|mailto:|tel:|data:|#|\/)/;

export const context = ({ base = "", homeHref = "", isHome = false, assets, brand }) => ({
  base,
  isHome,
  assets,
  brand,
  /* "assets/ofir.webp" -> "../assets/ofir.webp" on a page one level down */
  url: (path) => (ABSOLUTE.test(path) ? path : base + path),
  /* home("#projects") -> "#projects" at home, "../#projects" a level down */
  home: (hash = "") => (isHome ? hash || "#top" : homeHref + hash),
});
