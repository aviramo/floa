/* The contact form.

   Validate, POST the lead to the email API, and say "thank you" ONLY once the
   server has confirmed the email actually went out. Nothing is stored in the
   browser, nothing is written to Firebase, and a successful send never opens
   WhatsApp — the visitor asked to be called back, so we call back.

   On failure the fields are deliberately left ALONE: the visitor gets the error
   under the button and can press it again without retyping anything. */
(function () {
  "use strict";
  var form = document.getElementById("contactForm");
  if (!form) return;

  var success = document.getElementById("formSuccess");
  var name = document.getElementById("name");
  var phone = document.getElementById("phone");
  var submitBtn = form.querySelector('button[type="submit"]');
  var fields = form.querySelectorAll("input:not([type=hidden]):not(#company)");

  var endpoint = window.FLOA.config.leadEndpoint;
  var sending = false;              // guards against a double send
  var lastSentAt = 0;               // and against hammering the button

  /* an Israeli mobile or landline, however it was typed */
  function validPhone(value) {
    var p = (value || "").replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
    return /^0(?:5\d{8}|[2-489]\d{7})$/.test(p);
  }
  function validName(value) {
    return (value || "").trim().length >= 2;
  }

  /* the error line, created once and shown only on a real failure — directly
     under the button, which is where the visitor is looking when it fails */
  var errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.setAttribute("role", "alert");
  errorEl.hidden = true;
  errorEl.textContent = window.FLOA.config.formError;
  form.parentNode.insertBefore(errorEl, form.nextSibling);

  /* Error styling is driven by .is-invalid and applied ONLY after a submit
     attempt. A CSS :invalid rule would paint both fields red while the form is
     still untouched. */
  fields.forEach(function (el) {
    ["input", "change"].forEach(function (evt) {
      el.addEventListener(evt, function () {
        el.classList.remove("is-invalid");
        el.setCustomValidity("");
      });
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    if (Date.now() - lastSentAt < 5000) return;   // no repeat sends on a hot button

    errorEl.hidden = true;
    if (success) success.hidden = true;

    if (name) name.setCustomValidity(validName(name.value) ? "" : "אנא הזינו שם");
    if (phone) phone.setCustomValidity(validPhone(phone.value) ? "" : "אנא הזינו מספר טלפון ישראלי תקין");

    if (!form.checkValidity()) {
      fields.forEach(function (el) { el.classList.toggle("is-invalid", !el.checkValidity()); });
      form.reportValidity();
      return;
    }

    var data = new FormData(form);
    var lead = {
      name: (data.get("name") || "").toString().trim(),
      phone: (data.get("phone") || "").toString().trim(),
      page: (data.get("page") || "").toString(),
      company: (data.get("company") || "").toString(),   // the honeypot: server drops it if filled
      url: window.location.href,
    };

    sending = true;
    if (submitBtn) submitBtn.disabled = true;
    window.FLOA.track("contact_form_submit");

    fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lead),
    }).then(function (res) {
      if (!res.ok) throw new Error("lead endpoint returned " + res.status);
      return res.json().catch(function () { return {}; });
    }).then(function (body) {
      /* the server confirms the email left; anything else is a failure, even a 200 */
      if (body && body.ok === false) throw new Error(body.error || "send failed");

      window.FLOA.track("contact_form_success");
      lastSentAt = Date.now();
      form.reset();                                  // cleared ONLY on success
      if (success) {
        success.hidden = false;
        success.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }).catch(function (err) {
      console.warn("FLOA: lead not sent —", err && err.message);
      errorEl.hidden = false;                        // fields keep what the visitor typed
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }).then(function () {
      sending = false;
      if (submitBtn) submitBtn.disabled = false;
    });
  });
})();
