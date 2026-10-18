/* טופס ההרשמה: נפתח מכל כפתור עם data-contact, כותב ל-aum_signup (businesses/aum/schema.sql).
 * שם, מגדר, טלפון וגיל. אותו תהליך כמו הפופאפ של יוצאים להרפתקה: מגירה מלמעלה, ולידציה, הצלחה מקופלת. */
(function () {
  "use strict";

  var DB = window.SUPABASE;
  var PHONE = "972528497146";
  var ASK = "היי טל, ניסיתי להירשם לריטריט AUM דרך הדף ואשמח לעזרה";

  var HTML = '<div id="contactModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="suTitle">' +
    '<div class="modal-box">' +
      '<div data-su-root>' +
        '<div data-su="formWrap">' +
          '<div class="su-fold"><div>' +
            '<p class="su-hand">מקומך איתנו</p>' +
            '<h2 class="su-title" id="suTitle">ריטריט AUM</h2>' +
            '<div class="mt-badge" role="note" data-meeting hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><b data-meeting-when></b><span data-meeting-place></span></div>' +
          '</div></div>' +
          '<form data-su="form" novalidate class="text-start">' +
            '<input type="text" name="website" data-su="hp" class="su-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="su-fold"><div>' +
              '<div class="su-grid">' +
                '<div class="su-cell"><input id="suName" data-autofocus data-su="name" name="name" type="text" class="su-input" autocomplete="name" maxlength="60" placeholder="שם" aria-label="שם" required><div data-su="nameErr" class="su-err" role="alert"></div></div>' +
                '<div class="su-cell"><select data-su="gender" name="gender" class="su-input su-select" aria-label="מגדר" required><option value="" selected disabled>מגדר</option><option value="male">גבר</option><option value="female">אישה</option></select><div data-su="genderErr" class="su-err" role="alert"></div></div>' +
                '<div class="su-cell"><input id="suPhone" data-su="phone" name="phone" type="tel" dir="ltr" inputmode="tel" class="su-input" style="text-align:end" autocomplete="tel" maxlength="24" placeholder="טלפון" aria-label="טלפון" required><div data-su="phoneErr" class="su-err" role="alert"></div></div>' +
                '<div class="su-cell"><input id="suAge" data-su="age" name="age" type="number" inputmode="numeric" min="18" max="99" class="su-input" autocomplete="off" placeholder="גיל" aria-label="גיל" required><div data-su="ageErr" class="su-err" role="alert"></div></div>' +
              '</div>' +
            '</div></div>' +
            '<button data-su="btn" type="submit" class="btn su-send">הרשמה</button>' +
            '<div data-su="fail" class="su-err su-fail" role="alert"></div>' +
            '<div class="su-fold su-after shut" data-su="after"><div>' +
              '<p class="su-thanks">קיבלנו את הפרטים</p>' +
              '<p class="su-thanks-sub">טל תיצור קשר בקרוב כדי לשמור לכם.ן מקום.</p>' +
              '<a href="#" target="_blank" rel="noopener" data-wa-form class="btn btn--wa">כתבו לטל בוואטסאפ</a>' +
            '</div></div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.insertAdjacentHTML("beforeend", HTML);

  var modal = document.getElementById("contactModal");
  var lastFocus = null;

  function openModal(noFocus) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add("open"); });
    document.documentElement.classList.add("modal-lock");
    var f = (!noFocus && modal.querySelector("[data-autofocus]")) || modal.querySelector(".modal-box");
    if (f) { if (f.matches(".modal-box")) f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
  }
  function closeModal() {
    modal.classList.remove("open");
    setTimeout(function () { modal.hidden = true; document.documentElement.classList.remove("modal-lock"); }, 360);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.AumRegister = { open: function () { openModal(); } };

  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.classList.contains("open")) closeModal(); });

  /* פס בתחתית: החלקה למעלה (או נגיעה) סוגרת */
  (function () {
    var box = modal.querySelector(".modal-box");
    var g = document.createElement("div");
    g.className = "modal-grab"; g.setAttribute("aria-hidden", "true"); g.innerHTML = "<i></i>";
    box.appendChild(g);
    var sy = 0, dy = 0, t0 = 0, drag = false;
    g.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      drag = true; sy = e.clientY; dy = 0; t0 = performance.now();
      box.style.transition = "none";
      try { g.setPointerCapture(e.pointerId); } catch (x) {}
    });
    g.addEventListener("pointermove", function (e) {
      if (!drag) return;
      dy = Math.max(0, sy - e.clientY);
      box.style.transform = "translateY(" + (-dy) + "px)";
    });
    function end() {
      if (!drag) return; drag = false;
      var v = dy / Math.max(1, performance.now() - t0), tap = dy < 4;
      box.style.transition = "";
      if (tap || dy > 90 || (v > 0.6 && dy > 30)) {
        box.style.transform = "translateY(-110%)";
        closeModal();
        setTimeout(function () { box.style.transform = ""; }, 400);
      } else box.style.transform = "";
    }
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
  })();

  /* ----- הגעה ממודעה בתשלום: ?s=p בכתובת. נשמר למשך הביקור ונשלח עם ההרשמה ----- */
  var PAID = (function () {
    var v = new URLSearchParams(location.search).get("s") === "p";
    try { if (v) sessionStorage.setItem("aum_s", "p"); else v = sessionStorage.getItem("aum_s") === "p"; } catch (e) {}
    return v;
  })();

  /* נרמול טלפון (E.164), אותה לוגיקה כמו aum_normalize_phone בדאטהבייס */
  function normPhone(raw) {
    var s = String(raw || "").trim();
    if (!s) return "";
    var plus = s.charAt(0) === "+", d = s.replace(/\D/g, "");
    if (!d) return "";
    if (d.slice(0, 2) === "00") { plus = true; d = d.slice(2); }
    var IL = /^(5\d{8}|7\d{8}|[23489]\d{7})$/;
    if (plus) {
      if (d.slice(0, 4) === "9720") d = "972" + d.slice(4);
      if (d.length < 8 || d.length > 15 || d.charAt(0) === "0") return "";
      if (d.slice(0, 3) === "972" && !IL.test(d.slice(3))) return "";
      return "+" + d;
    }
    if (d.charAt(0) === "0") return IL.test(d.slice(1)) ? "+972" + d.slice(1) : "";
    return "";
  }

  var waLink = "https://wa.me/" + PHONE + "?text=" + encodeURIComponent(ASK);
  var waDone = modal.querySelector("[data-wa-form]");
  if (waDone) {
    waDone.href = "https://wa.me/" + PHONE + "?text=" + encodeURIComponent("היי טל, נרשמתי לריטריט AUM דרך הדף");
  }

  var root = modal.querySelector("[data-su-root]");
  function q(k) { return root.querySelector('[data-su="' + k + '"]'); }
  var form = q("form"), nameI = q("name"), phoneI = q("phone"), ageI = q("age"), genderI = q("gender"), btn = q("btn");
  var t0 = Date.now(), saved = false;

  function setErr(input, errEl, msg) { errEl.textContent = msg || ""; input.classList.toggle("bad", !!msg); }
  function showDone() {
    if (saved) return; saved = true;
    root.querySelectorAll(".su-fold:not(.su-after)").forEach(function (f) { f.classList.add("shut"); });
    btn.disabled = true; btn.classList.add("swap");
    setTimeout(function () { btn.textContent = "ההרשמה נקלטה"; btn.classList.remove("swap"); btn.classList.add("saved"); }, 260);
    setTimeout(function () { q("after").classList.remove("shut"); }, 700);
  }

  nameI.addEventListener("input", function () { setErr(nameI, q("nameErr"), ""); });
  phoneI.addEventListener("input", function () { setErr(phoneI, q("phoneErr"), ""); });
  ageI.addEventListener("input", function () { setErr(ageI, q("ageErr"), ""); });
  genderI.addEventListener("change", function () { setErr(genderI, q("genderErr"), ""); });

  function send(body) {
    return fetch(DB.url + "/rest/v1/rpc/aum_signup", {
      method: "POST",
      headers: { apikey: DB.anonKey, authorization: "Bearer " + DB.anonKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    q("fail").textContent = "";
    var name = nameI.value.trim().replace(/\s+/g, " "), norm = normPhone(phoneI.value), ok = true;
    if (name.length < 2) { setErr(nameI, q("nameErr"), "נא למלא שם"); ok = false; }
    var gender = genderI.value || null;
    if (!gender) { setErr(genderI, q("genderErr"), "נא לבחור"); ok = false; }
    if (!norm) { setErr(phoneI, q("phoneErr"), "מספר לא תקין"); ok = false; }
    var age = parseInt(ageI.value, 10);
    if (!(age >= 18 && age <= 99)) { setErr(ageI, q("ageErr"), "גיל לא תקין"); ok = false; }
    if (!ok) return;
    if (q("hp").value || Date.now() - t0 < 1500) { showDone(); return; }   /* בוט: מציגים הצלחה בלי לשמור */

    btn.disabled = true; btn.textContent = "שולחים...";
    var body = { p_name: name, p_phone: norm, p_age: age, p_gender: gender };
    if (PAID) body.p_src = "p";
    send(body).then(function (res) {
      return res.ok ? res.json() : null;
    }).then(function (out) {
      /* כפילות: אותה הודעה, בלי לחשוף שהמספר כבר רשום */
      if (out === "created" || out === "exists") return showDone();
      if (out === "invalid_phone") setErr(phoneI, q("phoneErr"), "מספר לא תקין");
      else if (out === "invalid_name") setErr(nameI, q("nameErr"), "נא למלא שם");
      else if (out === "invalid_age") setErr(ageI, q("ageErr"), "גיל לא תקין");
      else if (out === "invalid_gender") setErr(genderI, q("genderErr"), "נא לבחור");
      else throw new Error("signup failed");
      btn.disabled = false; btn.textContent = "הרשמה";
    }).catch(function () {
      q("fail").innerHTML = 'משהו השתבש, אפשר לכתוב לטל ישירות: <a href="' + waLink + '" target="_blank" rel="noopener">שיחה בוואטסאפ</a>';
      btn.disabled = false; btn.textContent = "הרשמה";
    });
  });

  /* ----- הריטריט הקרוב בראש הטופס, מאותה פונקציה של הבאנר. עד שיש תשובה הוא מוסתר ----- */
  var HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  if (DB) {
    fetch(DB.url + "/rest/v1/rpc/aum_next", {
      method: "POST",
      headers: { apikey: DB.anonKey, authorization: "Bearer " + DB.anonKey, "content-type": "application/json" },
      body: "{}",
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (ev) {
      if (!ev) return;
      var d = new Date(ev.date + "T12:00:00");
      modal.querySelector("[data-meeting-when]").textContent = "יום " + HE_DAYS[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) + " · " + ev.from.replace(/^0/, "") + " עד " + ev.to.replace(/^0/, "");
      modal.querySelector("[data-meeting-place]").textContent = String(ev.location || "").split(",").pop().trim();
      modal.querySelector("[data-meeting]").hidden = false;
    }).catch(function () {});
  }

  /* ----- כפתורים: כל [data-contact] פותח את הטופס ----- */
  Array.prototype.slice.call(document.querySelectorAll("[data-contact]")).forEach(function (el) {
    el.setAttribute("href", "#");
    el.addEventListener("click", function (e) { e.preventDefault(); openModal(); });
  });
})();
