/* ==========================================================================
   FLOA — landing page interactions
   ========================================================================== */
(function () {
  "use strict";

  /* ---- CONFIG -----------------------------------------------------------
     כתובת ה-WhatsApp תימסר בהמשך. כשתהיה מספר, החליפו את הערך למטה, למשל:
       var WHATSAPP_URL = "https://wa.me/9725XXXXXXXX";
     כל קישורי ה-WhatsApp בעמוד (הצף, בטופס ובפוטר) יתעדכנו אוטומטית.
     ---------------------------------------------------------------------- */
  var WHATSAPP_URL = ""; // <-- placeholder, to be provided later

  document.addEventListener("DOMContentLoaded", function () {
    wireWhatsApp();
    wireMobileMenu();
    wireReveal();
    wireForm();
  });

  /* ---- WhatsApp links --------------------------------------------------- */
  function wireWhatsApp() {
    var links = document.querySelectorAll("[data-whatsapp]");
    links.forEach(function (el) {
      if (WHATSAPP_URL) {
        el.setAttribute("href", WHATSAPP_URL);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
      } else {
        // No number yet — scroll to the contact form instead of a dead link.
        el.setAttribute("href", "#contact");
      }
    });
  }

  /* ---- Mobile menu ------------------------------------------------------ */
  function wireMobileMenu() {
    var toggle = document.getElementById("navToggle");
    var nav = document.getElementById("nav");
    if (!toggle || !nav) return;

    function close() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "פתיחת תפריט");
    }
    function open() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "סגירת תפריט");
    }

    toggle.addEventListener("click", function () {
      nav.classList.contains("open") ? close() : open();
    });

    // close after choosing a link
    nav.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", close);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  /* ---- Reveal on scroll ------------------------------------------------- */
  function wireReveal() {
    var items = document.querySelectorAll(".reveal");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in-view"); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (entry.isIntersecting) {
          var el = entry.target;
          // tiny stagger for grouped siblings
          var delay = Math.min(i * 60, 180);
          setTimeout(function () { el.classList.add("in-view"); }, delay);
          io.unobserve(el);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- Contact form ----------------------------------------------------- */
  function wireForm() {
    var form = document.getElementById("contactForm");
    var success = document.getElementById("formSuccess");
    if (!form) return;

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // TODO: חבר לכאן שליחה לשרת / שירות טפסים כשיהיה זמין.
      // כרגע מוצג אישור בצד הלקוח בלבד.
      form.reset();
      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
        success.focus && success.focus();
      }
    });
  }
})();
