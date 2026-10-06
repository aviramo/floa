/* ==========================================================================
   AUM, הדף. ארבעה דברים ואין יותר:

     1. הבאנר: המפגש הקרוב נטען מהדאטהבייס (aum_next). אם הוא לא הגיע, הנוסח
        שכתוב ב-HTML נשאר, כך שהדף אף פעם לא נשבר בגלל רשת.
     2. ההרשמה: שם וטלפון ל-aum_signup, שכותבת רק בצד השרת. המבקר לא קורא ולא
        כותב שום טבלה (schema.sql).
     3. וואטסאפ: האפליקציה ישר בטלפון, וואטסאפ ווב בדסקטופ.
     4. גלילה: לחיצה על עוגן גוללת בלי לכתוב #fragment לשורת הכתובת.
   ========================================================================== */
(function () {
  "use strict";

  var DB = window.SUPABASE;
  var PHONE = "972528497146";
  var ASK = "היי טל, ראיתי את הדף של ריטריט AUM ואשמח לשמוע פרטים";

  document.documentElement.className += " js";

  function $(sel) { return document.querySelector(sel); }
  function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ----- הדאטהבייס: REST ישיר עם המפתח הציבורי, בלי SDK ----- */
  function rpc(name, body) {
    if (!DB) return Promise.reject(new Error("no db"));
    return fetch(DB.url + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: { apikey: DB.anonKey, authorization: "Bearer " + DB.anonKey, "content-type": "application/json" },
      body: JSON.stringify(body || {}),
    }).then(function (r) {
      if (!r.ok) throw new Error(name + " " + r.status);
      return r.json();
    });
  }

  /* ----- 1. הבאנר ----- */
  var MONTHS = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
  var DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  function hm(t) { return String(t).replace(/^0/, ""); }

  function paintBanner(ev) {
    var bar = $("#topbar");
    if (!bar) return;
    var inner = bar.querySelector(".topbar__in");

    if (!ev) {
      inner.innerHTML = "";
      var soon = document.createElement("span");
      soon.className = "topbar__label";
      soon.textContent = "מועד הריטריט הבא יפורסם בקרוב";
      inner.appendChild(soon);
      $("#heroDate").textContent = "המועד הבא יפורסם בקרוב";
      $("#heroTime").hidden = true;
      var p = $("#faqPrice");
      if (p) p.textContent = "המחיר והמועד הבא יפורסמו בקרוב. אפשר לשאול את טל ישירות.";
      return;
    }

    var d = new Date(ev.date + "T12:00:00");
    $("#heroDate").textContent = "יום " + DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()];
    $("#heroTime").textContent = hm(ev.from) + " עד " + hm(ev.to) + " · " + (ev.location.split(",").pop().trim());

    var price = $("#tbPrice");
    if (ev.price) price.textContent = ev.price + " ₪ ליום";
    else price.hidden = true;

    var faq = $("#faqPrice");
    if (faq && ev.price) faq.textContent = ev.price + " ₪ למשתתף או משתתפת ליום, כולל ארוחת צהריים משותפת.";

    /* מקומות: רק אם נקבעה קיבולת, ורק כשנשאר מעט. מספר שאינו אמיתי לא מוצג. */
    if (ev.capacity) {
      var left = ev.capacity - ev.taken;
      var note = document.createElement("span");
      note.className = "topbar__spots";
      if (left <= 0) note.textContent = "הריטריט מלא, אפשר להצטרף לרשימת המתנה";
      else if (left <= 6) note.textContent = "נותרו " + left + " מקומות";
      if (note.textContent) inner.appendChild(note);
    }
  }

  rpc("aum_next").then(paintBanner).catch(function () { /* הנוסח שב-HTML נשאר */ });

  /* ----- 2. הרשמה ----- */
  /* אותה לוגיקה בדיוק כמו aum_normalize_phone ב-schema.sql: לשנות בשניהם יחד */
  function normPhone(p) {
    var raw = String(p || "").trim();
    if (!raw) return "";
    var plus = raw.charAt(0) === "+";
    var d = raw.replace(/\D/g, "");
    if (!d) return "";
    if (d.slice(0, 2) === "00") { plus = true; d = d.slice(2); }
    if (plus) {
      if (d.slice(0, 4) === "9720") d = "972" + d.slice(4);
      if (d.length < 8 || d.length > 15 || d.charAt(0) === "0") return "";
      if (d.slice(0, 3) === "972" && !/^(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d.slice(3))) return "";
      return "+" + d;
    }
    if (d.charAt(0) === "0") {
      return /^0(5\d{8}|7\d{8}|[23489]\d{7})$/.test(d) ? "+972" + d.slice(1) : "";
    }
    return "";
  }

  var form = $("#joinForm");
  if (form) {
    var err = $("#joinErr");
    var btn = $("#joinBtn");
    var fail = function (msg) { err.textContent = msg; err.hidden = false; };

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      err.hidden = true;

      var name = form.elements.name.value.trim();
      var phone = normPhone(form.elements.phone.value);
      if (name.length < 2) return fail("איך קוראים לכם?");
      if (!phone) return fail("מספר הטלפון לא נראה תקין. אפשר לכתוב בפורמט 050-1234567");

      var done = function () {
        form.hidden = true;
        $("#joinOk").hidden = false;
      };

      /* פיתיון: אדם אמיתי לא ממלא אותו. הבוט מקבל תודה ולא נכתב כלום. */
      if (form.elements.company.value) return done();

      btn.disabled = true;
      btn.textContent = "שולח...";
      rpc("aum_signup", { p_name: name, p_phone: phone, p_first_time: form.elements.first.checked })
        .then(function (res) {
          if (res === "invalid_name") throw new Error("name");
          if (res === "invalid_phone") throw new Error("phone");
          done();
        })
        .catch(function () {
          btn.disabled = false;
          btn.textContent = "שמרו לי מקום";
          fail("לא הצלחנו לשלוח. אפשר לנסות שוב או לכתוב לטל בוואטסאפ");
        });
    });
  }

  /* ----- 3. וואטסאפ ----- */
  var phoneDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var query = "phone=" + PHONE + "&text=" + encodeURIComponent(ASK);
  var page = "https://wa.me/" + PHONE + "?text=" + encodeURIComponent(ASK);
  var web = "https://web.whatsapp.com/send?" + query;

  all("[data-wa]").forEach(function (a) {
    a.href = phoneDevice ? page : web;
    a.target = "_blank";
    a.rel = "noopener";
    a.addEventListener("click", function (e) {
      if (!phoneDevice) return;
      /* בטלפון ישר לאפליקציה. אם היא לא נפתחה, הדף עדיין כאן ונופל ל-wa.me */
      e.preventDefault();
      window.location.href = "whatsapp://send?" + query;
      setTimeout(function () {
        if (document.visibilityState === "visible") window.location.href = page;
      }, 1500);
    });
  });

  /* ----- 4. גלילה בלי hash בכתובת ----- */
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  all('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      var target = document.getElementById(a.getAttribute("href").slice(1));
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 8, behavior: reduce ? "auto" : "smooth" });
    });
  });

  /* ----- כפתור צף: עולה רק כשהכפתור הראשי יצא מהמסך ונעלם מעל ההרשמה ----- */
  var dock = $("#dock");
  var hero = $(".hero__cta .btn");
  var join = $("#join");
  if (dock && hero && join) {
    var sync = function () {
      var past = hero.getBoundingClientRect().bottom < 0;
      var inJoin = join.getBoundingClientRect().top < window.innerHeight * 0.8;
      dock.classList.toggle("dock--on", past && !inJoin);
    };
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
  }

  /* ----- כניסה עדינה ----- */
  var items = all(".stages li, .day li, .faq details, .quote, .photo, .portrait");
  items.forEach(function (el) { el.classList.add("reveal"); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add("in"); });
  }
})();
