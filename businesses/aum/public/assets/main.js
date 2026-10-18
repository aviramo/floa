/* ==========================================================================
   AUM, הדף. שלושה דברים ואין יותר:

     1. הבאנר: המפגש הקרוב נטען מהדאטהבייס (aum_next), והוא היחיד שקובע תאריך,
        שעות, מקום ומחיר. ההרשמה היא הטופס שנפתח מ"אני רוצה לחוות"
        (register.js, aum_signup), או וואטסאפ וטלפון של טל. המשתתפים
        מתנהלים ב-/aum/admin/.
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

  /* ----- המלצות: פייג'ר. מתחלף לבד, נגרר באצבע, ובכניסה הראשונה לקטע זז פעם אחת כדי להראות שיש עוד ----- */
  (function () {
    var stage = $(".voices__stage");
    if (!stage) return;
    /* סדר אקראי בכל טעינה, כדי שהראשונה לא תהיה תמיד אותה אחת. המלצה חדשה היא פשוט עוד figure ב-HTML */
    var slides = all(".voices__slide");
    for (var s = slides.length - 1; s > 0; s--) {
      var r = Math.floor(Math.random() * (s + 1)), t = slides[s];
      slides[s] = slides[r]; slides[r] = t;
    }
    var track = document.createElement("div");
    track.className = "voices__track";
    stage.appendChild(track);
    slides.forEach(function (el, n) {
      track.appendChild(el);
      el.setAttribute("aria-label", (n + 1) + " מתוך " + slides.length);
    });
    var dotsBox = $(".voices__dots");
    var cur = 0, timer = null, hint = null;
    var dots = slides.map(function (s, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", "המלצה " + (i + 1));
      b.addEventListener("click", function () { act(function () { show(i); }); });
      dotsBox.appendChild(b);
      return b;
    });
    /* בעברית ההמלצה הבאה יושבת משמאל, אז המסילה זזה ימינה (חיובי) כדי להביא אותה */
    function place(dx) { track.style.transform = "translateX(calc(" + cur * 100 + "% + " + (dx || 0) + "px))"; }
    function show(i) {
      cur = (i + slides.length) % slides.length;
      track.style.transition = "";
      place(0);
      slides.forEach(function (s, k) {
        s.setAttribute("aria-hidden", k === cur ? "false" : "true");
        dots[k].setAttribute("aria-selected", k === cur ? "true" : "false");
      });
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() { if (!reduce && !timer) timer = setInterval(function () { show(cur + 1); }, 8000); }
    function cancelHint() { if (hint) { clearTimeout(hint); hint = null; } }
    function act(fn) { cancelHint(); fn(); stop(); start(); }
    all(".voices__arrow").forEach(function (a) {
      a.addEventListener("click", function () { act(function () { show(cur + Number(a.dataset.dir)); }); });
    });
    var box = $("#voices");
    box.addEventListener("mouseenter", stop);
    box.addEventListener("mouseleave", start);
    box.addEventListener("focusin", stop);
    box.addEventListener("focusout", start);

    /* גרירה: המסילה הולכת אחרי האצבע ואז נצמדת להמלצה הקרובה */
    var x0 = null, dx = 0;
    stage.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      cancelHint(); stop();
      x0 = e.clientX; dx = 0;
      track.style.transition = "none";
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", function (e) {
      if (x0 === null) return;
      dx = e.clientX - x0;
      place(dx);
    });
    function release() {
      if (x0 === null) return;
      var moved = dx;
      x0 = null; dx = 0;
      show(Math.abs(moved) > stage.offsetWidth * 0.18 ? cur + (moved > 0 ? 1 : -1) : cur);
      start();
    }
    stage.addEventListener("pointerup", release);
    stage.addEventListener("pointercancel", release);
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

    show(0);
    /* כניסה ראשונה לקטע: הפייג'ר זז לבד להמלצה הבאה, כדי שיהיה ברור שיש עוד */
    var seen = false;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) { cancelHint(); stop(); return; }
        if (!seen) {
          seen = true;
          if (!reduce) hint = setTimeout(function () { hint = null; show(1); start(); }, 900);
          else start();
        } else start();
      }, { threshold: 0.55 }).observe(box);
    } else start();
  })();

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
