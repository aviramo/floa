/* Every [data-whatsapp] element — button, hero CTA, footer link — gets its href
   written here, from the one number in site config. Nothing hardcodes wa.me. */
(function () {
  "use strict";
  var wa = window.FLOA.config.whatsapp;
  /* each page carries its own opening line on <body data-wa-text>; fall back to
     the shared greeting when it isn't set (e.g. the legal pages) */
  var greeting = document.body.getAttribute("data-wa-text") || wa.greeting;
  var href = wa.number
    ? "https://wa.me/" + wa.number + "?text=" + encodeURIComponent(greeting)
    : "#contact";

  document.querySelectorAll("[data-whatsapp]").forEach(function (el) {
    el.setAttribute("href", href);
    if (wa.number) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
  });
})();
