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
    errorEl.hidden = true;

    if (phone) phone.setCustomValidity(validIL(phone.value) ? "" : "אנא הזינו מספר טלפון ישראלי תקין");

    if (!form.checkValidity()) {
      controls.forEach(function (el) { el.classList.toggle("is-invalid", !el.checkValidity()); });
      form.reportValidity();
      return;
    }
    if (success) success.hidden = true;
    window.FLOA.track("contact_form_submit");

    var data = new FormData(form);
    var lead = {};
    ["name", "phone", "business", "help", "improve"].forEach(function (key) {
      lead[key] = (data.get(key) || "").toString().trim();
    });

    if (submitBtn) submitBtn.disabled = true;

    var save = typeof window.floaSaveLead === "function"
      ? window.floaSaveLead(lead)
      : Promise.reject(new Error("lead storage unavailable"));

    Promise.resolve(save).then(function () {
      window.FLOA.track("contact_form_success");     // success ONLY after the send actually succeeded
      form.reset();
      if (help) help.classList.add("is-empty");
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
})();
