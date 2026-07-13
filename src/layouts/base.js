import { attrs, html, raw } from "../lib/html.js";
import { ctaDock } from "../components/cta-dock/cta-dock.js";
import { footer } from "../components/footer/footer.js";
import { footerContent, site } from "../content/site.js";

/* ==========================================================================
   The document. Every page is this shell plus a body — so the meta, the fonts,
   the stylesheet, the scripts and the footer are written once, here, and can
   never drift between pages.

   `waText` is the page's own WhatsApp opening line: it rides on <body> and
   whatsapp-button.client.js turns it into the href of every WhatsApp button on
   the page, so all of them open the same, on-topic conversation.

   `og` is the page's OWN share card — { image, alt } — because a shared card
   cannot say what a particular page is, and in a WhatsApp thread that card IS
   the page. A page that passes none falls back to the site's.

   { path, meta:{title,description}, og, jsonLd, waText, ctaLabel, body }
   ========================================================================== */
export function page(ctx, { path = "", meta, og = {}, jsonLd, waText, ctaLabel, body }) {
  const url = `${site.origin}/${path}`;
  const card = { ...site.og, ...og };
  const ogImage = `${site.origin}/${card.image}`;

  const social = og !== false && html`
  <!-- Open Graph. The image must be an absolute URL on the host that actually
       serves the site. Social crawlers reject a relative path. -->
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${site.locale}">
  <meta property="og:site_name" content="${site.brand}">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${meta.title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="${card.width}">
  <meta property="og:image:height" content="${card.height}">
  <meta property="og:image:alt" content="${card.alt}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${meta.title}">
  <meta name="twitter:description" content="${meta.description}">
  <meta name="twitter:image" content="${ogImage}">`;

  return html`<!DOCTYPE html>
<html lang="${site.lang}" dir="${site.dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}">
  <meta name="theme-color" content="${site.themeColor}">
  <link rel="canonical" href="${url}">
${social}

  <!-- Rubik (display) + Assistant (body) + JetBrains Mono (technical) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${raw(site.fonts)}" rel="stylesheet">

  <!-- marks that JS is running, so .reveal may hide content it will bring back -->
  <script>document.documentElement.className += " js";</script>

  <link rel="stylesheet" href="${ctx.url(ctx.assets.css)}">

  <!-- Real files, root-absolute. A crawler looks for /favicon.ico by convention
       and will not read a data: URI, which is what this used to be. -->
  <link rel="icon" href="${site.icons.ico}" sizes="any">
  <link rel="icon" type="image/svg+xml" href="${site.icons.svg}">
  <link rel="apple-touch-icon" href="${site.icons.apple}">
${jsonLd ? html`
  <script type="application/ld+json">
${raw(JSON.stringify(jsonLd, null, 2))}
  </script>` : ""}
</head>
<body${attrs({ "data-wa-text": waText })}>
${body}
${ctaLabel ? ctaDock(ctx, { label: ctaLabel }) : ""}
${footer(ctx, footerContent(ctx))}
<script src="${ctx.url(ctx.assets.js)}" defer></script>
<script>
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("${raw(ctx.url("sw.js"))}").catch(function () {});
    });
  }
</script>
</body>
</html>`;
}
