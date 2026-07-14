import { html, raw } from "#lib/html.js";

/* ==========================================================================
   A page that has moved.

   GitHub Pages serves files, not rules: there is no 301 to be had. So an address
   that has moved gets a real page whose only job is to leave. It carries a
   canonical link (which is what a crawler transfers the ranking on), an instant
   meta refresh, and a script that replaces the history entry rather than pushing
   one, so Back does not bounce the visitor straight into the redirect again.

   The visible line is for the case where all three fail: a person still gets a
   link they can click, in the language of the site.

   This exists because a URL that once worked has to go on working. Links live in
   other people's messages, bookmarks and ad campaigns, and none of those get
   rewritten when we reorganise a folder.
   ========================================================================== */
export const redirectPage = ({ to, lang = "he", dir = "rtl", label = "המשך" }) => html`<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${label}</title>
  <link rel="canonical" href="${to}">
  <meta name="robots" content="noindex, follow">
  <meta http-equiv="refresh" content="0; url=${to}">
  <script>location.replace(${raw(JSON.stringify(to))});</script>
</head>
<body>
  <p><a href="${to}">${label}</a></p>
</body>
</html>`;
