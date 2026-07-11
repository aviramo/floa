/* ==========================================================================
   FLOA — landing page interactions
   ========================================================================== */
(function () {
  "use strict";

  /* ---- CONFIG ---------------------------------------------------------- */
  var WHATSAPP_NUMBER = "972587078708"; // +972 58-707-8708
  var WHATSAPP_URL = WHATSAPP_NUMBER ? "https://wa.me/" + WHATSAPP_NUMBER : "";
  var WA_GREETING = "היי, הגעתי דרך האתר של FLOA ואשמח שתעזרו לי";

  document.addEventListener("DOMContentLoaded", function () {
    wireWhatsApp();
    wireReveal();
    wireForm();
    wireAnalytics();
    wireHelpPrefill();
  });

  /* ---- lightweight analytics (only fires if GA/GTM already exists) ------ */
  function track(name) {
    try {
      if (window.dataLayer && typeof window.dataLayer.push === "function") {
        window.dataLayer.push({ event: name });
      } else if (typeof window.gtag === "function") {
        window.gtag("event", name);
      }
    } catch (e) { /* no-op */ }
  }
  function wireAnalytics() {
    document.querySelectorAll("[data-analytics]").forEach(function (el) {
      el.addEventListener("click", function () {
        track(el.getAttribute("data-analytics"));
      });
    });
  }

  /* ---- prefill the "how can we help" select from the CTA cards ---------- */
  function wireHelpPrefill() {
    var select = document.getElementById("help");
    document.querySelectorAll("[data-help]").forEach(function (el) {
      el.addEventListener("click", function () {
        if (!select) return;
        select.value = el.getAttribute("data-help");
        select.classList.remove("is-empty");
      });
    });
    if (select) {
      var refresh = function () { select.classList.toggle("is-empty", !select.value); };
      select.addEventListener("change", refresh);
      refresh();
    }
  }

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
          var delay = Math.min(i * 60, 180);
          setTimeout(function () { el.classList.add("in-view"); }, delay);
          io.unobserve(el);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---- Israeli phone validation ---------------------------------------- */
  function validIL(v) {
    var p = (v || "").replace(/[^\d+]/g, "");
    p = p.replace(/^\+972/, "0").replace(/^972/, "0");
    return /^0(?:5\d{8}|[2-489]\d{7})$/.test(p);
  }

  /* ---- Contact form ----------------------------------------------------- */
  function wireForm() {
    var form = document.getElementById("contactForm");
    var success = document.getElementById("formSuccess");
    if (!form) return;

    var phone = document.getElementById("phone");
    var submitBtn = form.querySelector('button[type="submit"]');
    var controls = form.querySelectorAll("input, select, textarea");

    // functional error line (created once, shown only on a real failure)
    var errorEl = document.createElement("p");
    errorEl.className = "form-error";
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;
    errorEl.textContent = "השליחה נכשלה. אפשר לנסות שוב או לכתוב לי בוואטסאפ";
    form.parentNode.insertBefore(errorEl, form.nextSibling);

    /* The error styling is driven by .is-invalid, applied ONLY after a submit
       attempt. A CSS :invalid rule would paint every required field red while
       the form is still untouched. */
    function markValidity() {
      controls.forEach(function (el) {
        el.classList.toggle("is-invalid", !el.checkValidity());
      });
    }
    controls.forEach(function (el) {
      el.addEventListener("input", function () { el.classList.remove("is-invalid"); });
      el.addEventListener("change", function () { el.classList.remove("is-invalid"); });
    });

    if (phone) {
      phone.addEventListener("input", function () { phone.setCustomValidity(""); });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      if (phone && !validIL(phone.value)) {
        phone.setCustomValidity("אנא הזינו מספר טלפון ישראלי תקין");
      } else if (phone) {
        phone.setCustomValidity("");
      }
      if (!form.checkValidity()) {
        markValidity();
        form.reportValidity();
        return;
      }
      markValidity();
      if (success) success.hidden = true;

      track("contact_form_submit");

      var data = new FormData(form);
      var val = function (k) { return (data.get(k) || "").toString().trim(); };
      var lead = {
        name: val("name"),
        phone: val("phone"),
        business: val("business"),
        help: val("help"),
        improve: val("improve")
      };

      if (submitBtn) submitBtn.disabled = true;

      var save = (typeof window.floaSaveLead === "function")
        ? window.floaSaveLead(lead)
        : Promise.reject(new Error("lead storage unavailable"));

      Promise.resolve(save).then(function () {
        // show success ONLY after the send actually succeeded
        track("contact_form_success");
        form.reset();
        var sel = document.getElementById("help");
        if (sel) sel.classList.add("is-empty");
        if (submitBtn) submitBtn.disabled = false;
        if (success) {
          success.hidden = false;
          success.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }).catch(function (err) {
        console.warn("FLOA: lead not sent —", err && err.message);
        if (submitBtn) submitBtn.disabled = false;
        errorEl.hidden = false;
        errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }
})();
