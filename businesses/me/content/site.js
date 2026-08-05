/* ==========================================================================
   Ofir's identity, for the generator.

   This business ships documents, not a marketing site: no share card, no
   analytics, no WhatsApp, no colours of its own. The résumé layout
   (src/layouts/resume.js) reads `origin` for the canonical and `icons` for the
   favicon, and that is the whole of what is needed here.

   `folder` is where its files sit on the domain. Every business gets one, and
   this one is /me/.
   ========================================================================== */
export const site = {
  brand: "Ofir Aviram",
  lang: "en",
  dir: "ltr",
  locale: "en_US",
  origin: "https://floa.co.il",
  folder: "me/",
  tagline: "Solution Architect and Senior Systems Analyst",
  slogan: "Enterprise applications, integrations and AI-assisted product delivery",

  /* the domain's own icons, at the domain root — they belong to floa.co.il,
     not to any one business (see businesses/floa/domain/) */
  icons: {
    ico: "/favicon.ico",
    svg: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

/* Shipped to a window.FLOA config file the documents never read: there is no
   form here and no lead to route. It stays for the shape every business has,
   and the Worker validates against it. */
export const runtime = {
  business: "me",
};
