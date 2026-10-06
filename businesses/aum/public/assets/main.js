/* ==========================================================================
   AUM, הדף. שלושה דברים ואין יותר:

     1. הבאנר: המפגש הקרוב נטען מהדאטהבייס (aum_next), והוא היחיד שקובע תאריך,
        שעות, מקום ומחיר. אין בדף טופס: ההרשמה היא בוואטסאפ או בטלפון של טל,
        והמשתתפים מתנהלים ב-/aum/admin/.
     2. וואטסאפ: האפליקציה ישר בטלפון, וואטסאפ ווב בדסקטופ.
     3. גלילה: לחיצה על עוגן גוללת בלי לכתוב #fragment לשורת הכתובת.
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
  /* כל מה שקשור למועד, תאריך, שעות, מקום, מחיר ומקומות, בא מהדאטהבייס ומשם
     בלבד. ב-HTML אין אף אחד מהם: מה שכתוב שם הוא נוסח ניטרלי שמוסתר עד שיש מה
     להציג, כדי שתאריך ישן לא יהבהב, לא ייכנס לתצוגה המקדימה בוואטסאפ ולא יישב
     בגוגל. שינוי ריטריט ב-/aum/admin/ משנה את הדף בלי פרסום. */
  var MONTHS = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
  var DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  function hm(t) { return String(t).replace(/^0/, ""); }

  function set(sel, text) { var n = $(sel); if (n) { n.textContent = text; n.hidden = false; } }
  function hide(sel) { var n = $(sel); if (n) n.hidden = true; }

  /* אין מועד ידוע: אין ריטריט עתידי במסד, או שהמסד לא ענה */
  function paintUnknown(text) {
    set(".topbar__label", text);
    ["#tbWhen", "#tbWhere", "#tbPrice", "#heroTime"].forEach(hide);
    set("#heroDate", text);
    set("#faqPrice", "המחיר והמועד מתעדכנים כאן. אפשר לשאול את טל ישירות.");
  }

  /* היסט שעון ישראל בתאריך הזה (+03:00 בקיץ, +02:00 בחורף), בשביל ה-JSON-LD */
  function israelOffset(iso) {
    try {
      var parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Jerusalem", timeZoneName: "longOffset" }).formatToParts(new Date(iso + "T12:00:00Z"));
      var tz = parts.filter(function (p) { return p.type === "timeZoneName"; })[0].value.replace("GMT", "");
      return tz || "+02:00";
    } catch (e) { return "+02:00"; }
  }

  /* Event לגוגל, נבנה מהמפגש הקרוב במקום להיכתב בדף */
  function paintSchema(ev) {
    var off = israelOffset(ev.date);
    var data = {
      "@context": "https://schema.org", "@type": "Event",
      name: ev.title,
      description: "ריטריט יומי של מדיטציית AUM: 12 שלבים בתנועה ובקול, מכעס לאהבה ומבכי לצחוק, בהנחיית טל אמיתי-לביא.",
      startDate: ev.date + "T" + ev.from + ":00" + off,
      endDate: ev.date + "T" + ev.to + ":00" + off,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      eventStatus: "https://schema.org/EventScheduled",
      location: { "@type": "Place", name: ev.location, address: { "@type": "PostalAddress", addressLocality: "גדרה", addressCountry: "IL" } },
      image: "https://floa.co.il/aum/assets/img/og.jpg",
      performer: { "@type": "Person", name: "טל אמיתי-לביא" },
      organizer: { "@type": "Person", name: "טל אמיתי-לביא", telephone: "+972-52-849-7146" },
    };
    if (ev.price) data.offers = { "@type": "Offer", price: String(ev.price), priceCurrency: "ILS", availability: "https://schema.org/InStock", url: "https://floa.co.il/aum/" };
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  function paintBanner(ev) {
    if (!ev) return paintUnknown("מועד הריטריט הבא יפורסם בקרוב");

    var d = new Date(ev.date + "T12:00:00");
    set("#tbWhen", DAYS[d.getDay()] + ", " + d.getDate() + "." + (d.getMonth() + 1) + " · " + hm(ev.from) + " עד " + hm(ev.to));
    set("#tbWhere", ev.location);
    set(".topbar__label", "הריטריט הבא");
    set("#heroDate", "יום " + DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()]);
    set("#heroTime", hm(ev.from) + " עד " + hm(ev.to) + " · " + ev.location.split(",").pop().trim());

    if (ev.price) {
      set("#tbPrice", ev.price + " ₪ ליום");
      set("#faqPrice", ev.price + " ₪ למשתתפ.ת" + (ev.price_pair ? ", " + ev.price_pair + " ₪ לבאים בזוג" : "") +
        ". כולל פינת קפה רצה ואירוח בוילה מפנקת עם אולם ייעודי, חדר אוכל וחצר חיצונית.");
    } else {
      hide("#tbPrice");
      set("#faqPrice", "את המחיר אפשר לברר אצל טל.");
    }

    /* מקומות: רק אם נקבעה קיבולת, ורק כשנשאר מעט. מספר שאינו אמיתי לא מוצג. */
    if (ev.capacity) {
      var left = ev.capacity - ev.taken;
      var text = left <= 0 ? "הריטריט מלא, אפשר להצטרף לרשימת המתנה" : left <= 6 ? "נותרו " + left + " מקומות" : "";
      if (text) {
        var note = document.createElement("span");
        note.className = "topbar__spots";
        note.textContent = text;
        $(".topbar__in").appendChild(note);
      }
    }
    paintSchema(ev);
  }

  rpc("aum_next").then(paintBanner).catch(function () { paintUnknown("לפרטים על מועד הריטריט אפשר לכתוב לטל"); });

  /* ----- 2. וואטסאפ ----- */
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

  /* ----- 3. גלילה בלי hash בכתובת ----- */
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
