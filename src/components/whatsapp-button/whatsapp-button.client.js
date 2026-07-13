/* Every [data-whatsapp] element on the page — the hero CTA, the mid-page band,
   the sticky dock, the footer link — gets its href written here, from the ONE
   number in site config and the ONE message the page carries. Nothing anywhere
   else builds a wa.me URL, so every WhatsApp button on a page is guaranteed to
   open the same conversation.

   The message is per-page: the build writes it onto <body data-wa-text>, so the
   automations page opens WhatsApp already talking about automations. The shared
   greeting is the fallback for a page that sets none (the legal pages).

   A phone hands off to the WhatsApp app via wa.me. A desktop has no app to hand
   off to, so it opens WhatsApp Web directly rather than bouncing through the
   wa.me interstitial. */
(function () {
  "use strict";
  var wa = window.FLOA.config.whatsapp;
  var targets = document.querySelectorAll("[data-whatsapp]");
  if (!targets.length || !wa.number) return;

  var text = encodeURIComponent(document.body.getAttribute("data-wa-text") || wa.greeting);

  var mobile = (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
               /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  var href = mobile
    ? "https://wa.me/" + wa.number + "?text=" + text
    : "https://web.whatsapp.com/send?phone=" + wa.number + "&text=" + text;

  targets.forEach(function (el) {
    el.setAttribute("href", href);
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener");
  });
})();
