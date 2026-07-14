/* ==========================================================================
   The bundle contract.

   ONE stylesheet and ONE script ship for the whole site — but they are written
   as many small, self-contained files, one per component. This list is the
   cascade: files are concatenated in exactly this order, so a later component
   may deliberately override an earlier one (whatsapp-button over button).

   A component file that is NOT listed here is still bundled — appended at the
   end with a warning — so a new component can never silently lose its styles.
   ========================================================================== */

/* foundation first (tokens -> reset -> layout -> type), then components,
   then motion, which must be able to freeze anything above it. */
export const css = [
  "design/tokens.css",
  "design/base.css",
  "design/layout.css",
  "design/typography.css",

  "components/button/button.css",
  "components/whatsapp-button/whatsapp-button.css",   // overrides .btn + .btn-lg
  "components/chips/chips.css",
  "components/urgency/urgency.css",
  "components/cta-dock/cta-dock.css",
  "components/section-head/section-head.css",
  "components/card/card.css",                         // THE box — every boxed item on the site
  "components/eco-grid/eco-grid.css",                 // refines .card for the ecosystem row
  "components/quote-card/quote-card.css",
  "components/project-card/project-card.css",
  "components/flow/flow.css",
  "components/timeline/timeline.css",
  "components/faq/faq.css",
  "components/ba-strip/ba-strip.css",
  "components/approach/approach.css",
  "components/compare/compare.css",
  "components/about/about.css",
  "components/cta-band/cta-band.css",
  "components/contact/contact.css",
  "components/hero/hero.css",
  "components/hero-system/hero-system.css",
  "components/hero-art/hero-art.css",
  "components/footer/footer.css",
  "components/legal/legal.css",

  "design/motion.css",
];

/* core exposes window.FLOA (config + track); every behaviour below is an IIFE
   that no-ops when its element is absent, so one bundle serves every page. */
export const js = [
  "lib/core.client.js",
  "lib/reveal.client.js",
  "lib/anchors.client.js",
  "components/whatsapp-button/whatsapp-button.client.js",
  "components/contact/contact.client.js",
  "components/faq/faq.client.js",
  "components/cta-dock/cta-dock.client.js",
  "components/hero-system/hero-system.client.js",
];
