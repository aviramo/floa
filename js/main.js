/* ==========================================================================
   FLOA — landing page interactions
   ========================================================================== */
(function () {
  "use strict";

  /* ---- CONFIG -----------------------------------------------------------
     מספר ה-WhatsApp של העסק, בפורמט בינלאומי ללא + / רווחים / 0 מוביל.
     כל קישורי ה-WhatsApp בעמוד (הצף, בטופס ובפוטר) והטופס נבנים ממנו.
     ---------------------------------------------------------------------- */
  var WHATSAPP_NUMBER = "972587078708"; // +972 58-707-8708
  var WHATSAPP_URL = WHATSAPP_NUMBER ? "https://wa.me/" + WHATSAPP_NUMBER : "";

  // הודעה שמופיעה מוכנה כשלוחצים על כפתור WhatsApp רגיל (לא דרך הטופס)
  var WA_GREETING = "היי, הגעתי דרך האתר של FLOA ואשמח לשמוע עוד 🙂";

  document.addEventListener("DOMContentLoaded", function () {
    wireWhatsApp();
    wireMobileMenu();
    wireReveal();
    wireForm();
  });

  /* ---- WhatsApp links --------------------------------------------------- */
  function wireWhatsApp() {
    var links = document.querySelectorAll("[data-whatsapp]");
    var href = WHATSAPP_URL
      ? WHATSAPP_URL + "?text=" + encodeURIComponent(WA_GREETING)
      : "#contact";
    links.forEach(function (el) {
      el.setAttribute("href", href);
      if (WHATSAPP_URL) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
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

      // בונים הודעת WhatsApp מפרטי הטופס ופותחים צ'אט מול העסק.
      var data = new FormData(form);
      var val = function (k) { return (data.get(k) || "").toString().trim(); };
      var lead = {
        name: val("name"), phone: val("phone"),
        business: val("business"), improve: val("improve")
      };

      // שמירה ב-Firestore (לא חוסמת; הטופס עובד גם אם השמירה נכשלת/לא מוגדרת)
      if (typeof window.floaSaveLead === "function") {
        try {
          window.floaSaveLead(lead).catch(function (err) {
            console.warn("FLOA: lead not saved to Firestore —", err && err.message);
          });
        } catch (err) { /* no-op */ }
      }

      var lines = [
        "פנייה חדשה מאתר FLOA:",
        "שם: " + lead.name,
        "טלפון: " + lead.phone,
      ];
      if (lead.business) lines.push("שם העסק: " + lead.business);
      if (lead.improve)  lines.push("מה הייתם רוצים לשפר: " + lead.improve);
      var message = lines.join("\n");

      if (WHATSAPP_URL) {
        window.open(
          WHATSAPP_URL + "?text=" + encodeURIComponent(message),
          "_blank", "noopener"
        );
      }

      form.reset();
      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
        success.focus && success.focus();
      }
    });
  }
})();
