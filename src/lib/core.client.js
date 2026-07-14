/* window.FLOA.config is written above this line by build.mjs, straight from the
   business's content/site.js — the browser and the generator read the same
   source. */
(function () {
  "use strict";

  /* The two things worth measuring, and what Meta calls them.

     A conversion has to be an EVENT, fired at the moment the thing happens. It
     is tempting to define it in Meta as "URL contains /landing-page-offer/",
     because that needs no code — but that fires on a page VIEW, so it counts
     everyone who arrived and no one who acted. It would report the ad as
     converting every visitor, and it would tell you nothing about the button.

     So the click fires Contact and the sent form fires Lead, both standard Meta
     events, at the instant each occurs. Build the custom conversion on the
     event, not on the URL. */
  var META = {
    whatsapp_cta: "Contact",
    contact_form_success: "Lead",
  };

  /* Fires into whatever is actually on the page and never loads anything: GA/GTM
     if a container exists, Meta if the pixel is configured. An event with no
     standard Meta name is still sent, as a custom one, so nothing is lost. */
  window.FLOA.track = function (name) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === "function") window.dataLayer.push({ event: name });
      else if (typeof window.gtag === "function") window.gtag("event", name);
    } catch (e) { /* analytics must never break the page */ }

    try {
      if (typeof window.fbq !== "function") return;
      if (META[name]) window.fbq("track", META[name], { content_name: document.title });
      else window.fbq("trackCustom", name, { content_name: document.title });
    } catch (e) { /* nor may Meta */ }
  };

  document.querySelectorAll("[data-analytics]").forEach(function (el) {
    el.addEventListener("click", function () { window.FLOA.track(el.getAttribute("data-analytics")); });
  });
})();
