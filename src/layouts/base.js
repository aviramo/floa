import { html, raw } from "../lib/html.js";
import { footer } from "../components/footer/footer.js";
import { footerContent, site } from "../content/site.js";

/* ==========================================================================
   The document. Every page is this shell plus a body — so the meta, the fonts,
   the stylesheet, the scripts and the footer are written once, here, and can
   never drift between pages.

   { path, meta:{title,description}, og, jsonLd, leadForm, body }
   ========================================================================== */
export function page(ctx, { path = "", meta, og = true, jsonLd, leadForm = false, body }) {
  const url = `${site.origin}/${path}`;
  const ogImage = `${site.origin}/${site.og.image}`;

  const social = og && html`
  <!-- Open Graph. The image must be an absolute URL on the host that actually
       serves the site — social crawlers reject a relative path. -->
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${site.locale}">
  <meta property="og:site_name" content="${site.brand}">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${meta.title}">
  <meta property="og:description" content="${meta.description}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="${site.og.width}">
  <meta property="og:image:height" content="${site.og.height}">
  <meta property="og:image:alt" content="${site.og.alt}">
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
  <link rel="icon" href="${raw(site.favicon)}">
${jsonLd ? html`
  <script type="application/ld+json">
${raw(JSON.stringify(jsonLd, null, 2))}
  </script>` : ""}
</head>
<body>
${body}
${footer(ctx, footerContent(ctx))}
${leadForm ? html`
<script type="module" src="${ctx.url("js/firebase.js")}"></script>` : ""}
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
