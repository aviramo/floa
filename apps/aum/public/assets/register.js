/* טופס ההרשמה: נפתח מכל כפתור עם data-contact, ונרשם דרך api.js ל-roster (העסק aum).
 * שם, מגדר, טלפון וגיל. אותו תהליך כמו הפופאפ של יוצאים להרפתקה: מגירה מלמעלה, ולידציה, הצלחה מקופלת. */
(function () {
  "use strict";

  var PHONE = "972528497146";
  var ASK = "היי טל, ניסיתי להירשם לריטריט AUM דרך הדף ואשמח לעזרה";

  var HTML = '<div id="contactModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="suTitle">' +
    '<div class="modal-box">' +
      '<div data-su-root>' +
        '<div data-su="formWrap">' +
          '<div class="su-fold"><div>' +
            '<h2 class="su-title" id="suTitle">ריטריט AUM</h2>' +
            '<div class="mt-badge" role="note" data-meeting hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg><b data-meeting-when></b><span data-meeting-place></span></div>' +
          '</div></div>' +
          '<form data-su="form" novalidate class="text-start">' +
            '<input type="text" name="website" data-su="hp" class="su-hp" tabindex="-1" autocomplete="off" aria-hidden="true">' +
            '<div class="su-fold"><div>' +
              '<div class="su-grid">' +
                '<div class="su-cell" style="grid-column:1/-1"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.5rem">' +
                  '<label class="pf-field"><span>שם פרטי</span><input id="suName" data-autofocus data-su="first" name="first_name" type="text" class="pf-input" autocomplete="given-name" maxlength="30" placeholder=" " aria-label="שם פרטי" required></label>' +
                  '<label class="pf-field"><span>שם משפחה</span><input data-su="last" name="last_name" type="text" class="pf-input" autocomplete="family-name" maxlength="30" placeholder=" " aria-label="שם משפחה" required></label>' +
                '</div><div data-su="nameErr" class="su-err" role="alert"></div></div>' +
                '<div class="su-cell" style="grid-column:1/-1"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.5rem">' +
                  '<div class="su-cell"><label class="pf-field"><span>עיר</span><input id="suCity" data-su="city" name="address-level2" type="text" class="pf-input" autocomplete="address-level2" maxlength="40" placeholder=" " aria-label="עיר"></label><div data-su="cityErr" class="su-err" role="alert"></div></div>' +
                  '<div class="su-cell"><label class="pf-field"><span>טלפון</span><input id="suPhone" data-su="phone" name="phone" type="tel" dir="ltr" inputmode="tel" class="pf-input" autocomplete="tel" maxlength="24" placeholder=" " aria-label="טלפון" required></label><div data-su="phoneErr" class="su-err" role="alert"></div></div>' +
                '</div></div>' +
                '<div class="su-cell" style="grid-column:1/-1"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:.5rem">' +
                  '<div class="su-cell"><label class="pf-field"><span>גיל</span><input id="suAge" data-su="age" name="age" type="number" inputmode="numeric" min="18" max="99" class="pf-input" autocomplete="off" placeholder=" " aria-label="גיל" required></label><div data-su="ageErr" class="su-err" role="alert"></div></div>' +
                  '<div class="su-cell"><label class="pf-field"><span>מגדר</span><select data-su="gender" name="gender" class="pf-input" aria-label="מגדר" required><option value="" selected disabled hidden></option><option value="male">גבר</option><option value="female">אישה</option></select></label><div data-su="genderErr" class="su-err" role="alert"></div></div>' +
                '</div></div>' +
                '<div class="su-cell" style="grid-column:1/-1"><label class="pf-field pf-long"><span>השתתפת במדיטציית אום בעבר או בתהליכים דומים (מדיטציות אקטיביות, עבודה עם הגוף, ביטוי רגשי בקבוצה)?</span><input data-su="past" name="past_experience" type="text" class="pf-input" autocomplete="off" maxlength="500" placeholder=" " aria-label="השתתפת במדיטציית אום בעבר או בתהליכים דומים (מדיטציות אקטיביות, עבודה עם הגוף, ביטוי רגשי בקבוצה)?" required></label><div data-su="pastErr" class="su-err" role="alert"></div></div>' +
                '<div class="su-cell" style="grid-column:1/-1"><label class="pf-field pf-long"><span>מצב בריאותי ונפשי</span><input data-su="health" name="health_state" type="text" class="pf-input" autocomplete="off" maxlength="500" placeholder=" " aria-label="מצב בריאותי ונפשי" required></label><div data-su="healthErr" class="su-err" role="alert"></div></div>' +
              '</div>' +
            '</div></div>' +
            '<button data-su="btn" type="submit" class="btn su-send">הרשמה</button>' +
            '<div data-su="fail" class="su-err su-fail" role="alert"></div>' +
            '<div class="su-fold su-after shut" data-su="after"><div>' +
              '<p class="su-thanks">קיבלנו את הפרטים</p>' +
              '<p class="su-thanks-sub" data-su="afterSub">טל תיצור קשר בקרוב כדי לשמור לכם.ן מקום.</p>' +
              '<div class="pay" data-su="pay" hidden>' +
                '<div class="pol" data-su="pol" tabindex="0" role="region" aria-label="הצהרת משתתפ.ת"></div>' +
                '<p class="pol-hint" data-su="polhint">גוללים עד הסוף, ואז אפשר לאשר ולהמשיך לתשלום</p>' +
                '<label class="pol-ok"><input type="checkbox" data-su="polok" disabled><span>מאשר.ת</span></label>' +
                '<div class="paychoose" data-su="paywrap">' +
                  '<button type="button" class="btn su-send pc-open" data-su="payopen" aria-expanded="false" disabled><span data-su="paylabel">לתשלום</span><svg class="pm-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
                  '<div class="pm-list">' +
                    '<a class="pm-item" aria-label="פייבוקס" title="פייבוקס" data-su="paybox" href="https://links.payboxapp.com/VpbYFnoI67b" target="_blank" rel="noopener"><img src="assets/img/pay-paybox.png" alt="" width="32" height="32"><span>פייבוקס</span><b data-su="amt"></b></a>' +
                    '<a class="pm-item" aria-label="ביט" title="ביט" data-su="bit" href="https://www.bitpay.co.il/app/share-info?i=oNtm50fV&j=true" target="_blank" rel="noopener"><img src="assets/img/pay-bit.png" alt="" width="32" height="32"><span>ביט</span><b data-su="amt"></b></a>' +
                    '<a class="pm-item pm-other" data-su="other" href="#" target="_blank" rel="noopener"><span>דרך אחרת</span></a>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div></div>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.insertAdjacentHTML("beforeend", HTML);

  var modal = document.getElementById("contactModal");
  var lastFocus = null;

  /* the page behind does not scroll while any dialog is open; its own scrollbar goes away, so its width is kept as padding and nothing moves.
     Counted, because the cancellation policy opens a second dialog over the first one. */
  var locks = 0;
  function lockPage() {
    if (locks++ > 0) return;
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    if (sbw > 0) document.documentElement.style.paddingRight = sbw + "px";
    document.documentElement.classList.add("modal-lock");
  }
  function unlockPage() {
    if (--locks > 0) return;
    locks = 0;
    document.documentElement.classList.remove("modal-lock"); document.documentElement.style.paddingRight = "";
  }

  /* the keyboard: where a browser only shrinks the visual viewport (iOS), the dialog would reach under the keyboard and its send button could not be scrolled to. Its bottom follows the top of the keyboard. Android already shrinks the page, through interactive-widget=resizes-content in the viewport tag. */
  var vv = window.visualViewport;
  function fitKeyboard() { var kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0; document.documentElement.style.setProperty("--kb", kb + "px"); }
  if (vv) { vv.addEventListener("resize", fitKeyboard); vv.addEventListener("scroll", fitKeyboard); }

  function openModal(noFocus) {
    lastFocus = document.activeElement;
    modal.hidden = false;
    requestAnimationFrame(function () { modal.classList.add("open"); });
    lockPage();
    var f = (!noFocus && modal.querySelector("[data-autofocus]")) || modal.querySelector(".modal-box");
    if (f) { if (f.matches(".modal-box")) f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); }
  }
  function closeModal() {
    modal.classList.remove("open");
    setTimeout(function () { modal.hidden = true; unlockPage(); }, 360);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  window.AumRegister = { open: function () { openModal(); } };

  modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key !== "Escape") return; if (policyModal.classList.contains("open")) closePolicy(); else if (modal.classList.contains("open")) closeModal(); });

  /* פס בתחתית: החלקה למעלה (או נגיעה) סוגרת */
  function addGrab(m, closeFn) {
    var box = m.querySelector(".modal-box");
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
        closeFn();
        setTimeout(function () { box.style.transform = ""; }, 400);
      } else box.style.transform = "";
    }
    g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
  }
  addGrab(modal, closeModal);

  /* מדיניות הביטולים: חלון שני מעל החלון הראשון. סגירה שלו (הפס, הרקע או Escape) משאירה את חלון ההרשמה והתשלום פתוח, כדי שאפשר יהיה לחזור ולשלם */
  var policyModal = document.createElement("div");
  policyModal.id = "policyModal"; policyModal.className = "modal modal-2"; policyModal.hidden = true;
  policyModal.setAttribute("role", "dialog"); policyModal.setAttribute("aria-modal", "true"); policyModal.setAttribute("aria-labelledby", "polTitle");
  policyModal.innerHTML = '<div class="modal-box"><h2 class="su-title" id="polTitle">מדיניות ביטולים</h2><div class="pol-body" data-policy-body></div></div>';
  document.body.appendChild(policyModal);
  var policyFocus = null, policyDate = null;
  function openPolicy() {
    policyFocus = document.activeElement;
    policyModal.querySelector("[data-policy-body]").innerHTML = policyHtml(policyDate);
    policyModal.hidden = false;
    requestAnimationFrame(function () { policyModal.classList.add("open"); });
    lockPage();
    var box = policyModal.querySelector(".modal-box"); box.setAttribute("tabindex", "-1"); box.focus({ preventScroll: true });
  }
  function closePolicy() {
    policyModal.classList.remove("open");
    setTimeout(function () { policyModal.hidden = true; unlockPage(); }, 360);
    if (policyFocus && policyFocus.focus) policyFocus.focus();
  }
  policyModal.addEventListener("click", function (e) { if (e.target === policyModal) closePolicy(); });
  addGrab(policyModal, closePolicy);


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
  var root = modal.querySelector("[data-su-root]");
  function q(k) { return root.querySelector('[data-su="' + k + '"]'); }
  var form = q("form"), nameI = q("first"), lastI = q("last"), cityI = q("city"), phoneI = q("phone"), ageI = q("age"), genderI = q("gender"), btn = q("btn");
  var t0 = Date.now(), saved = false;

  function setErr(input, errEl, msg) { errEl.textContent = msg || ""; input.classList.toggle("bad", !!msg); }

  /* ----- המשך אחרי הרשמה: הצהרת משתתפ.ת, אישור, ואז שלוש דרכי תשלום ----- */
  function fmtDate(iso, shift) {
    var p = String(iso).split("-").map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + (shift || 0)));
    return d.getUTCDate() + "." + (d.getUTCMonth() + 1) + "." + String(d.getUTCFullYear()).slice(2);
  }
  /* מדיניות הביטולים (התאריכים לפי המפגש הקרוב במסד הנתונים): נפתחת בחלון משלה מהקישור בסוף ההצהרה */
  function policyHtml(date) {
    var d1 = fmtDate(date, -28), d2 = fmtDate(date, -27), d3 = fmtDate(date, -14), d4 = fmtDate(date, -13);
    return "<p>אשמח מאוד בכל אחד ואחת מכם.ן.<br>עם זאת, אם משהו קורה בדרך, זוהי מדיניות הביטולים שאתם.ן חתומים.ות עליה:</p>" +
      "<ul>" +
      "<li>ביטול עד לתאריך " + d1 + " (כולל): יגבו דמי ביטול בסך ₪50 בלבד.</li>" +
      "<li>ביטול החל מתאריך " + d2 + " ועד " + d3 + " (כולל): יחויב ב-50% מעלות ההשתתפות.</li>" +
      "<li>ביטול החל מתאריך " + d4 + ": מכל סיבה שהיא, יחויב בתשלום מלא אלא אם המשתתפ.ת ידאג למחליפ.ה.</li>" +
      "<li>במקרה של מצב ביטחוני שלא יאפשר את קיום הסדנה, היא תבוטל ללא דמי ביטול.</li>" +
      "</ul>";
  }
  /* הצהרת משתתפ.ת: הטקסט שהמשתתפ.ת קוראת ומאשרת לפני התשלום (הנוסח של טל, בלי מקף ארוך) */
  function declarationHtml() {
    var parts = [
      ["", "ברוכים.ות הבאים.ות לסדנת AUM.<br>כדי שנוכל ליצור יחד מרחב בטוח, נעים ומאפשר לכולם, חשוב לוודא שאנחנו מתואמים לגבי אופי המפגש והאחריות האישית של כל אחד ואחת מאיתנו."],
      ["מהות התהליך", "אני מבינ.ה שמדיטציית AUM היא תהליך חווייתי, פיזי ורגשי אינטנסיבי, ואני בוחר.ת להשתתף בו מרצוני החופשי. ברור לי שבכל רגע נתון הבחירה בידיי: להקשיב לעצמי, להציב גבול, לנוח או להימנע מכל תרגיל שלא מתאים לי."],
      ["מרחב חווייתי (אינו טיפול)", "ברור לי שהסדנה היא מרחב להתפתחות ולחוויה אישית. היא איננה מוגדרת כטיפול רפואי, פסיכולוגי או נפשי, ואינה מחליפה ייעוץ או ליווי מקצועי."],
      ["כשירות ובריאות", "אני יודע.ת שהתהליך כרוך במאמץ פיזי ורגשי. אני מצהיר.ה שמצבי הבריאותי והנפשי מאפשר לי לקחת בו חלק.<br>במידה וקיים אצלי מצב רפואי או נפשי הדורש תשומת לב (בעיות לב, לחץ דם גבוה, אפילפסיה, היריון, פציעה אקוטית, רקע נפשי...), באחריותי להתייעץ עם רופא ולעדכן את המנחה לפני תחילת הסדנה כדי לוודא התאמה."],
      ["נוכחות צלולה", "אני מתחייב.ת להגיע לסדנה כשאני ללא השפעת אלכוהול, סמים או כל משנה תודעה אחר."],
      ["כבוד וגבולות", "אני מתחייב.ת להתנהל באחריות, בזהירות, בכבוד ובערנות: לשמור על ביטחוני הפיזי, על המרחב והגבולות של המשתתפים.ות האחרים.ות ועל המבנה והציוד במקום."],
      ["אחריות אישית וציוד", "אני נושא.ת באחריות אישית מלאה לבחירותיי, להתנהלותי ולשמירה על גבולותיי הפיזיים והרגשיים במהלך המפגש.<br>אני משחרר.ת את המנחה, הצוות ובעלי המקום מאחריות לכל פגיעה, נזק או תגובה רגשית שייגרמו כתוצאה מהשתתפותי, וכן מאחריות על ציוד אישי שאביא איתי."],
      ["עזיבה מוקדמת וביטולים", "אם אחליט לעזוב במהלך הסדנה, אני מבינ.ה שלא יינתן לי החזר כספי.<br>בחתימתי על מסמך זה אני מסכימ.ה <a href=\"#\" class=\"pol-link\" data-policy>למדיניות הביטולים</a>."]
    ];
    return "<p><b>הצהרת משתתפ.ת</b></p>" + parts.map(function (x) { return "<p>" + (x[0] ? "<b>" + x[0] + ":</b><br>" : "") + x[1] + "</p>"; }).join("");
  }
  function initPay(ev) {
    var pay = q("pay");
    if (!ev || !ev.date) return;   /* אין מפגש במסד: אין מה לשלם עליו, נשארת ההודעה הרגילה */
    if (ev.capacity && ev.taken >= ev.capacity) { q("afterSub").textContent = "המפגש מלא כרגע. הפרטים נשמרו וטל תחזור אליכם."; return; }
    var pol = q("pol"), ok = q("polok"), hint = q("polhint"), wrap = q("paywrap"), open = q("payopen");
    pol.innerHTML = declarationHtml();
    policyDate = ev.date;
    pol.addEventListener("click", function (e) { var a = e.target.closest && e.target.closest("[data-policy]"); if (a) { e.preventDefault(); openPolicy(); } });
    var price = ev.price ? "₪" + ev.price : "";
    q("paylabel").textContent = price ? "לתשלום " + price : "לתשלום";
    root.querySelectorAll('[data-su="amt"]').forEach(function (el) { el.textContent = price; });
    var when = "ביום " + HE_DAYS[new Date(ev.date + "T12:00:00Z").getUTCDay()] + " " + fmtDate(ev.date).split(".").slice(0, 2).join(".");
    q("other").href = "https://wa.me/" + PHONE + "?text=" + encodeURIComponent("היי טל, אני רוצה להעביר תשלום בדרך אחרת לריטריט " + when);
    q("afterSub").textContent = "אנחנו רוצים אותך איתנו! לפני התשלום נדרש למלא הצהרת משתתפ.ת.";
    pay.hidden = false;
    function reached() { return pol.scrollTop + pol.clientHeight >= pol.scrollHeight - 4; }
    function unlock() { if (!ok.disabled || !reached()) return; ok.disabled = false; hint.hidden = true; }
    pol.addEventListener("scroll", unlock);
    setTimeout(function () { pol.scrollHeight <= pol.clientHeight + 4 ? (ok.disabled = false, hint.hidden = true) : unlock(); }, 800);
    ok.addEventListener("change", function () {
      open.disabled = !ok.checked;   /* the payment button is there from the start and can be pressed only after the declaration is ticked */
      if (!ok.checked) { wrap.classList.remove("open"); open.setAttribute("aria-expanded", "false"); }
    });
    root.querySelectorAll(".pm-item").forEach(function (it) {
      it.addEventListener("click", function () { if (window.AUM_API && window.AUM_API.reportPayment) window.AUM_API.reportPayment(); });
    });
    open.addEventListener("click", function () {
      var on = !wrap.classList.contains("open"); wrap.classList.toggle("open", on); open.setAttribute("aria-expanded", on ? "true" : "false");
    });
  }

  function showDone() {
    if (saved) return; saved = true;
    root.querySelectorAll(".su-fold:not(.su-after)").forEach(function (f) { f.classList.add("shut"); });
    btn.disabled = true; btn.classList.add("swap");
    setTimeout(function () { btn.classList.add("gone"); }, 260);   /* the button fades out and goes: the heading below ("קיבלנו את הפרטים") already says it was received */
    setTimeout(function () { q("after").classList.remove("shut"); }, 700);
    if (window.AUM_API) window.AUM_API.next().then(initPay).catch(function () {});
  }

  function clearName() { setErr(nameI, q("nameErr"), ""); lastI.classList.remove("bad"); }
  nameI.addEventListener("input", clearName);
  lastI.addEventListener("input", clearName);
  cityI.addEventListener("input", function () { setErr(cityI, q("cityErr"), ""); });
  phoneI.addEventListener("input", function () { setErr(phoneI, q("phoneErr"), ""); });
  ageI.addEventListener("input", function () { setErr(ageI, q("ageErr"), ""); });
  genderI.addEventListener("change", function () { setErr(genderI, q("genderErr"), ""); });
  q("past").addEventListener("input", function () { setErr(q("past"), q("pastErr"), ""); });
  q("health").addEventListener("input", function () { setErr(q("health"), q("healthErr"), ""); });

  function send(body) { return window.AUM_API.signup(body); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    q("fail").textContent = "";
    var first = nameI.value.trim().replace(/\s+/g, " "), last = lastI.value.trim().replace(/\s+/g, " "), norm = normPhone(phoneI.value), ok = true;
    if (!first || !last) { setErr(first ? lastI : nameI, q("nameErr"), "נא למלא שם פרטי ושם משפחה"); if (!first && !last) lastI.classList.add("bad"); ok = false; }
    var gender = genderI.value || null;
    if (!gender) { setErr(genderI, q("genderErr"), "נא לבחור"); ok = false; }
    if (!norm) { setErr(phoneI, q("phoneErr"), "מספר לא תקין"); ok = false; }
    var city = cityI.value.trim().replace(/\s+/g, " ");
    if (city.length > 40) { setErr(cityI, q("cityErr"), "שם ארוך מדי"); ok = false; }
    var age = parseInt(ageI.value, 10);
    if (!(age >= 18 && age <= 99)) { setErr(ageI, q("ageErr"), "גיל לא תקין"); ok = false; }
    var pastV = q("past").value.trim(), healthV = q("health").value.trim();
    if (!pastV) { setErr(q("past"), q("pastErr"), "נא למלא"); ok = false; }
    if (!healthV) { setErr(q("health"), q("healthErr"), "נא למלא"); ok = false; }
    if (!ok) return;
    if (q("hp").value || Date.now() - t0 < 1500) { showDone(); return; }   /* בוט: מציגים הצלחה בלי לשמור */

    btn.disabled = true; btn.textContent = "שולחים...";
    var body = { p_first: first, p_last: last, p_phone: norm, p_age: age, p_gender: gender };
    if (city) body.p_address = city;   /* העיר נשלחת בשדה הכתובת של ה-API (אופציונלי) */
    /* שני שדות חופשיים לא חובה: נשלחים ב-extra_fields של ה-API, עם התווית המלאה של השאלה */
    var past = q("past").value.trim().replace(/\s+/g, " "), health = q("health").value.trim().replace(/\s+/g, " ");
    body.p_extra = [];
    if (past) body.p_extra.push({ key: "past_experience", label: "השתתפת במדיטציית אום בעבר או בתהליכים דומים (מדיטציות אקטיביות, עבודה עם הגוף, ביטוי רגשי בקבוצה)?", value: past });
    if (health) body.p_extra.push({ key: "health_state", label: "מצב בריאותי ונפשי", value: health });
    send(body).then(function (out) {
      /* כפילות: אותה הודעה, בלי לחשוף שהמספר כבר רשום */
      if (out === "created" || out === "exists") return showDone();
      if (out === "invalid_phone") setErr(phoneI, q("phoneErr"), "מספר לא תקין");
      else if (out === "invalid_name") setErr(nameI, q("nameErr"), "נא למלא שם פרטי ושם משפחה");
      else if (out === "invalid_age") setErr(ageI, q("ageErr"), "גיל לא תקין");
      else if (out === "invalid_gender") setErr(genderI, q("genderErr"), "נא לבחור");
      else if (out === "invalid_address") setErr(cityI, q("cityErr"), "עיר לא תקינה");
      else if (out === "invalid_extra") q("fail").textContent = "נא לבדוק את השדות החופשיים (טקסט רגיל, עד 500 תווים כל אחד)";
      else throw new Error("signup failed");
      btn.disabled = false; btn.textContent = "הרשמה";
    }).catch(function () {
      q("fail").innerHTML = 'משהו השתבש, אפשר לכתוב לטל ישירות: <a href="' + waLink + '" target="_blank" rel="noopener">שיחה בוואטסאפ</a>';
      btn.disabled = false; btn.textContent = "הרשמה";
    });
  });

  /* ----- הריטריט הקרוב בראש הטופס, מאותה פונקציה של הבאנר. עד שיש תשובה הוא מוסתר ----- */
  var HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  {
    window.AUM_API.next().then(function (ev) {
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
