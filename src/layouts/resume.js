import { html, raw } from "../lib/html.js";

/* ==========================================================================
   The document shell for a résumé.

   Not the marketing shell: a CV has no header, no footer, no CTA dock, no
   share card and no analytics. It is a page someone reads once and prints.
   Everything the marketing shell adds would be noise on screen and ink on
   paper, so this is its own layout rather than a flag on base.js.

   `lang` and `dir` come from the PAGE, not from the site: the same business
   ships this document in two languages, and one of them is not the site's.

   `share` is the card a link to this document shows in a message or a feed:
   the name, the opening line of the summary, and the photograph.

   `share.image.src` is relative to the business's folder and is made absolute
   here. It has to be: a social crawler is not a browser, it has no page to
   resolve a relative path against, and it drops the image rather than guess.

   `twitter:card` stays "summary" rather than the large variant. The large one
   crops to roughly 2:1, and the picture is a portrait — it would cut the face.

   { lang, dir, path, meta:{title,description}, alternates:[{lang,href}],
     share:{title,description,locale,image:{src,width,height,alt}}, body }
   ========================================================================== */

/* Inter draws the Latin document, Assistant the Hebrew one. Both are loaded on
   both pages: the Hebrew CV still holds Latin (Node.js, PostgreSQL, LinkedIn)
   and the English one still has to render a Hebrew fallback if a glyph is
   missing. One request, no layout shift.

   Inter, and Arial behind it, because a résumé is read by parsers as well as by
   people and both of them want a plain grotesque with unambiguous digits. */
const FONTS = "https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Inter:wght@400;600;700;800&display=swap";

export function resumeDocument(ctx, { lang, dir, path = "", meta, alternates = [], share, body }) {
  const site = ctx.site;
  const url = `${site.origin}/${path}`;

  return html`<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}">
  <meta name="theme-color" content="#163a6e">
  <link rel="canonical" href="${url}">
${alternates.map((alt) => html`  <link rel="alternate" hreflang="${alt.lang}" href="${ctx.url(alt.href)}">`)}
${share ? html`
  <!-- The share card: who this is, in both scripts, and what they do. -->
  <meta property="og:type" content="website">
  <meta property="og:locale" content="${share.locale ?? site.locale}">
  <meta property="og:site_name" content="${site.brand}">
  <meta property="og:url" content="${url}">
  <meta property="og:title" content="${share.title}">
  <meta property="og:description" content="${share.description}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${share.title}">
  <meta name="twitter:description" content="${share.description}">${share.image ? html`
  <meta property="og:image" content="${site.origin}/${site.folder}${share.image.src}">
  <meta property="og:image:width" content="${share.image.width}">
  <meta property="og:image:height" content="${share.image.height}">
  <meta property="og:image:alt" content="${share.image.alt}">
  <meta name="twitter:image" content="${site.origin}/${site.folder}${share.image.src}">` : ""}` : ""}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${raw(FONTS)}" rel="stylesheet">

  <link rel="stylesheet" href="${ctx.url(ctx.assets.css)}">

  <link rel="icon" href="${site.icons.ico}" sizes="any">
  <link rel="icon" type="image/svg+xml" href="${site.icons.svg}">
  <link rel="apple-touch-icon" href="${site.icons.apple}">
</head>
<body>
${body}
</body>
</html>`;
}
