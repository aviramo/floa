/* The landing-page-offer form: same validate-then-POST shape as the shared
   contact form, but its own success behaviour — this campaign's whole point is
   to get the visitor into a WhatsApp chat, so the send hands them there itself
   instead of waiting for a callback.

   UTM parameters are captured once on load and carried with the lead, so a
   Facebook campaign's source survives however long the visitor browses before
   filling the form. */
(function () {
  "use strict";
  var form = document.getElementById("offerLeadForm");
  if (!form) return;

  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var STORE_KEY = "floaOfferUtm";

  (function captureUtm() {
    var params = new URLSearchParams(window.location.search);
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); } catch (e) { /* ignore */ }
    var found = false;
    UTM_KEYS.forEach(function (key) {
      var value = params.get(key);
      if (value) { stored[key] = value; found = true; }
    });
    if (found) {
      try { sessionStorage.setItem(STORE_KEY, JSON.stringify(stored)); } catch (e) { /* ignore */ }
    }
  })();

  function storedUtm() {
    try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}"); } catch (e) { return {}; }
  }

  var success = document.getElementById("offerFormSuccess");
  var waBackup = document.getElementById("offerWaBackup");
  var waBackupLabel = document.getElementById("offerWaBackupLabel");
  var name = document.getElementById("offer-name");
  var phone = document.getElementById("offer-phone");
  var submitBtn = form.querySelector('button[type="submit"]');
  var fields = form.querySelectorAll("input:not([type=hidden]):not(#offer-company)");

  var endpoint = window.FLOA.config.leadEndpoint;
  var wa = window.FLOA.config.whatsapp;
  var sending = false;
  var lastSentAt = 0;
  var startTracked = false;

  fields.forEach(function (el) {
    el.addEventListener("input", function () {
      if (!startTracked) { startTracked = true; window.FLOA.track("offer_form_start"); }
    }, { once: true });
  });

  function validPhone(value) {
    var p = (value || "").replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
    return /^0(?:5\d{8}|[2-489]\d{7})$/.test(p);
  }
  function validName(value) {
    return (value || "").trim().length >= 2;
  }

  var errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.setAttribute("role", "alert");
  errorEl.hidden = true;
  errorEl.textContent = window.FLOA.config.formError;
  form.parentNode.insertBefore(errorEl, form.nextSibling);

  fields.forEach(function (el) {
    ["input", "change"].forEach(function (evt) {
      el.addEventListener(evt, function () {
        el.classList.remove("is-invalid");
        el.setCustomValidity("");
      });
    });
  });

  /* mobile hands off to the WhatsApp app; a desktop has no app to hand off to,
     so it opens WhatsApp Web directly — same rule as whatsapp-button.client.js */
  function isMobile() {
    return (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
           /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  function waHref(mobile, text) {
    var encoded = encodeURIComponent(text);
    return mobile
      ? "https://wa.me/" + wa.number + "?text=" + encoded
      : "https://web.whatsapp.com/send?phone=" + wa.number + "&text=" + encoded;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (Date.now() - lastSentAt < 5000) return;

    errorEl.hidden = true;

    if (name) name.setCustomValidity(validName(name.value) ? "" : "אנא הזינו שם");
    if (phone) phone.setCustomValidity(validPhone(phone.value) ? "" : "אנא הזינו מספר טלפון ישראלי תקין");

    if (!form.checkValidity()) {
      fields.forEach(function (el) { el.classList.toggle("is-invalid", !el.checkValidity()); });
      form.reportValidity();
      return;
    }

    var data = new FormData(form);
    var utm = storedUtm();
    var lead = {
      name: (data.get("name") || "").toString().trim(),
      phone: (data.get("phone") || "").toString().trim(),
      business: (data.get("business") || "").toString().trim(),
      need: (data.get("need") || "").toString().trim(),
      page: (data.get("page") || "").toString(),
      company: (data.get("company") || "").toString(),
      url: window.location.href,
    };
    UTM_KEYS.forEach(function (key) { if (utm[key]) lead[key] = utm[key]; });

    sending = true;
    if (submitBtn) submitBtn.disabled = true;
    window.FLOA.track("offer_form_submit");

    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lead),
    }).then(function (res) {
      if (!res.ok) throw new Error("lead endpoint returned " + res.status);
      return res.json().catch(function () { return {}; });
    }).then(function (body) {
      if (body && body.ok === false) throw new Error(body.error || "send failed");

      lastSentAt = Date.now();
      form.reset();
      startTracked = false;

      var mobile = isMobile();
      var message = "היי, מילאתי עכשיו את הטופס לגבי דף נחיתה ואשמח לבדוק מה מתאים לעסק שלי 🙂";
      var href = waHref(mobile, message);

      if (waBackup) {
        waBackup.setAttribute("href", href);
        waBackup.setAttribute("target", "_blank");
        waBackup.setAttribute("rel", "noopener");
        waBackup.hidden = false;
      }
      if (waBackupLabel) waBackupLabel.textContent = mobile ? "פתיחת WhatsApp" : "פתיחת WhatsApp Web";

      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      if (mobile) {
        window.setTimeout(function () {
          window.FLOA.track("whatsapp_cta");
          window.open(href, "_blank", "noopener");
        }, 1500);
      }
    }).catch(function (err) {
      console.warn("FLOA: offer lead not sent —", err && err.message);
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }).then(function () {
      sending = false;
      if (submitBtn) submitBtn.disabled = false;
    });
  });
})();
