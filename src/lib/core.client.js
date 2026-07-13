/* window.FLOA.config is written above this line by build.mjs, straight from
   src/content/site.js — the browser and the generator read the same source. */
(function () {
  "use strict";

  /* fires only if a GA/GTM container already exists; never loads one */
  window.FLOA.track = function (name) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === "function") window.dataLayer.push({ event: name });
      else if (typeof window.gtag === "function") window.gtag("event", name);
    } catch (e) { /* analytics must never break the page */ }
  };

  document.querySelectorAll("[data-analytics]").forEach(function (el) {
    el.addEventListener("click", function () { window.FLOA.track(el.getAttribute("data-analytics")); });
  });
})();
