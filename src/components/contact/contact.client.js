/* The contact form: validate, save the lead, and only then say "thank you". */
(function () {
  "use strict";
  var form = document.getElementById("contactForm");
  if (!form) return;

  var success = document.getElementById("formSuccess");
  var phone = document.getElementById("phone");
  var help = document.getElementById("help");
  var submitBtn = form.querySelector('button[type="submit"]');
  var controls = form.querySelectorAll("input, select, textarea");
  var errorText = window.FLOA.config.formError;

  /* the post-submit WhatsApp handoff: same number as the rest of the site, its
     own opening line, and a device-dependent label (see site.js) */
  var waCfg = window.FLOA.config.whatsapp || {};
  var successWaCfg = window.FLOA.config.formSuccessWa || {};
  var successWa = document.getElementById("formSuccessWa");
  var successWaLabel = successWa && successWa.querySelector(".btn-wa-open-label");
  var waTimer = null;
  var submitting = false;                     // guards against a double send

  function isMobile() {
    return (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) ||
           /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }
  /* mobile hands off to the app via wa.me; desktop opens WhatsApp Web */
  function waLink(mobile) {
    if (!waCfg.number) return "#contact";
    var msg = encodeURIComponent(successWaCfg.message || "");
    return mobile
      ? "https://wa.me/" + waCfg.number + "?text=" + msg
      : "https://web.whatsapp.com/send?phone=" + waCfg.number + "&text=" + msg;
  }

  /* Israeli mobile or landline, however it was typed */
  function validIL(value) {
    var p = (value || "").replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
    return /^0(?:5\d{8}|[2-489]\d{7})$/.test(p);
  }

  // functional error line, created once and shown only on a real failure
  var errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.setAttribute("role", "alert");
  errorEl.hidden = true;
  errorEl.textContent = errorText;
  form.parentNode.insertBefore(errorEl, form.nextSibling);

  /* keep the "how can we help" select greyed while it sits on the placeholder */
  if (help) {
    var refresh = function () { help.classList.toggle("is-empty", !help.value); };
    help.addEventListener("change", refresh);
    refresh();
  }

  /* Error styling is driven by .is-invalid, applied ONLY after a submit attempt.
     A CSS :invalid rule would paint every required field red while the form is
     still untouched. */
  controls.forEach(function (el) {
    ["input", "change"].forEach(function (evt) {
      el.addEventListener(evt, function () { el.classList.remove("is-invalid"); });
    });
  });
  if (phone) phone.addEventListener("input", function () { phone.setCustomValidity(""); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (submitting) return;                   // never send the same form twice
    errorEl.hidden = true;

    if (phone) phone.setCustomValidity(validIL(phone.value) ? "" : "אנא הזינו מספר טלפון ישראלי תקין");

    if (!form.checkValidity()) {
      controls.forEach(function (el) { el.classList.toggle("is-invalid", !el.checkValidity()); });
      form.reportValidity();
      return;
    }
    clearTimeout(waTimer);                     // cancel a pending auto-open from a prior send
    if (success) success.hidden = true;
    window.FLOA.track("contact_form_submit");

    var data = new FormData(form);
    var lead = {};
    ["name", "phone", "business", "help", "improve"].forEach(function (key) {
      lead[key] = (data.get(key) || "").toString().trim();
    });

    submitting = true;
    if (submitBtn) submitBtn.disabled = true;

    var save = typeof window.floaSaveLead === "function"
      ? window.floaSaveLead(lead)
      : Promise.reject(new Error("lead storage unavailable"));

    Promise.resolve(save).then(function () {
      window.FLOA.track("contact_form_success");     // success ONLY after the send actually succeeded
      form.reset();
      if (help) help.classList.add("is-empty");
      if (submitBtn) submitBtn.disabled = false;
      submitting = false;
      if (success) {
        var mobile = isMobile();
        if (successWa) {
          successWa.setAttribute("href", waLink(mobile));
          if (successWaLabel) {
            successWaLabel.textContent = mobile
              ? (successWaCfg.mobileLabel || "פתיחת וואטסאפ")
              : (successWaCfg.desktopLabel || "פתיחת WhatsApp Web");
          }
        }
        /* the thank-you stays put until the visitor sends again or leaves */
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
        /* on a phone, hand off to WhatsApp automatically after a beat — in a new
           tab, so the thank-you and the backup button remain even if the browser
           blocks the pop-up. Desktop never auto-opens; the button is the way. */
        if (mobile && successWa) {
          clearTimeout(waTimer);
          waTimer = setTimeout(function () {
            try { window.open(successWa.getAttribute("href"), "_blank", "noopener"); } catch (e) {}
          }, 1500);
        }
      }
    }).catch(function (err) {
      console.warn("FLOA: lead not sent —", err && err.message);
      if (submitBtn) submitBtn.disabled = false;
      submitting = false;
      errorEl.hidden = false;
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
})();
