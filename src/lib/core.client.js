/* window.FLOA.config is written above this line by build.mjs, straight from the
   business's content/site.js — the browser and the generator read the same
   source. */
(function () {
  "use strict";

  /* The things worth measuring, and what Meta calls them.

     A conversion has to be an EVENT, fired at the moment the thing happens. It
     is tempting to define it in Meta as "URL contains /landing-page-offer/",
     because that needs no code — but that fires on a page VIEW, so it counts
     everyone who arrived and no one who acted. It would report the ad as
     converting every visitor, and it would tell you nothing about the button.

     A WhatsApp click and a sent form are the SAME outcome — a person reached
     out — so they fire the SAME Meta event, Lead. One event, not two, because a
     Meta ad set optimises toward a single one: split across Contact and Lead,
     each gets half the volume and neither reaches the ~50/week that lets the
     campaign leave its learning phase; together they clear it. Lead, not
     Contact, because the campaign objective IS leads and that is the event its
     optimisation expects.

     Which door the lead came through is not lost: it rides along as
     content_category, so the Meta reporting can still split WhatsApp from the
     form even though delivery optimises on the one combined event. */
  var META = {
    whatsapp_cta: "Lead",
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
      /* GA keeps the specific name (whatsapp_cta / contact_form_success); Meta
         gets the standard event plus that name as the source, so one optimised
         event stays two in the report. */
      if (META[name]) window.fbq("track", META[name], { content_name: document.title, content_category: name });
      else window.fbq("trackCustom", name, { content_name: document.title });
    } catch (e) { /* nor may Meta */ }
  };

  document.querySelectorAll("[data-analytics]").forEach(function (el) {
    el.addEventListener("click", function () { window.FLOA.track(el.getAttribute("data-analytics")); });
  });
})();
