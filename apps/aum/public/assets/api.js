/* ==========================================================================
   AUM, הדף הציבורי: כל מה שהדף שואל ושולח עובר ל-API הציבורי של roster
   (תיעוד: floa.co.il/roster/api/), ולא ישר לדאטהבייס. הדף כבר לא טוען את /supabase.js.

   המפתח למטה הוא מפתח ציבורי (rk_pub_): הוא ציבורי מעצם הגדרתו, מותר לו לבוא רק
   מ-floa.co.il, ומה שהוא יכול הוא לקרוא את המפגשים הקרובים ולהירשם. מפתח סודי לא נכנס לקובץ כזה אף פעם.

   שני דברים נשארים כמו שהם היו, כדי שבאנר וטופס לא ישתנו:
     * next()   מחזיר את המפגש הקרוב באותה צורה שהפונקציה הישנה של הבאנר החזירה (date, from, to, location, price ...)
     * signup() מחזיר את אותן מילים שהפונקציה הישנה של ההרשמה החזירה (created, exists, invalid_phone ...)
   ========================================================================== */
(function () {
  "use strict";

  var BASE = "https://api.floa.co.il/roster/v1";
  var KEY = "rk_pub_6ZK4VOFOC1kY6OrVMj8Yn7z8FloOWf0P";
  /* גרסת פיתוח (localhost:5173/aum/) עובדת מול roster בדיקות, אותו עסק "aum" שנראה ב-localhost:5173/roster/aum: הרשמות כאן לא נוגעות באמיתי ולא שולחות מייל. המפתח הזה ציבורי, מותר לו רק מ-localhost, והוא מכיר רק את סכמת הבדיקות */
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    BASE = "https://api-test.floa.co.il/roster/v1";
    KEY = "rk_pub_XM9ZVQk6gU6tLNZcmmM31UWzswG0C08V";
  }
  /* ל-roster אין שעת סיום למפגש, אז היא נגזרת משעת ההתחלה: תמיד 7 שעות קדימה (מ-9:00 עד 16:00). אם ההתחלה תזוז, הסיום יזוז איתה */
  var DURATION_MIN = 7 * 60;
  function endOf(start) {
    var p = String(start || "").split(":"), h = parseInt(p[0], 10), m = parseInt(p[1], 10) || 0;
    if (isNaN(h)) return "";
    var t = Math.min(h * 60 + m + DURATION_MIN, 23 * 60 + 59);   /* לא חוצים חצות */
    return ("0" + Math.floor(t / 60)).slice(-2) + ":" + ("0" + (t % 60)).slice(-2);
  }
  var TIMEOUT = 15000;

  function call(method, path, body) {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : null;
    var opts = { method: method, headers: { authorization: "Bearer " + KEY }, signal: ctl ? ctl.signal : undefined };
    if (body !== undefined) { opts.headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(BASE + path, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return null; }).then(function (data) { return { status: res.status, data: data }; });
    }, function (err) { if (timer) clearTimeout(timer); throw err; });
  }

  /* המפגש הקרוב, פעם אחת לכל טעינת דף: הבאנר, הטופס וההרשמה משתמשים באותה תשובה */
  var cached = null;
  function next() {
    if (!cached) {
      cached = call("GET", "/meetings").then(function (r) {
        if (r.status !== 200 || !r.data || !Array.isArray(r.data.meetings)) throw new Error("meetings " + r.status);
        var m = r.data.meetings[0];
        if (!m) return null;
        var place = String(m.place || "");
        return {
          id: m.id,
          date: m.date,
          from: m.time,
          to: endOf(m.time),
          title: m.name || "ריטריט AUM",
          name: m.name || "ריטריט AUM",
          location: place,
          price: m.price,
          price_pair: null,
          tiers: m.price_tiers,
          capacity: m.capacity,
          taken: m.capacity ? Math.max(0, m.capacity - (m.spots_left == null ? m.capacity : m.spots_left)) : 0
        };
      });
      cached.catch(function () { cached = null; });   // כשל לא נשמר: הניסיון הבא ינסה שוב
    }
    return cached;
  }

  var paid = null, lastMeeting = null;
  /* לחיצה על דרך תשלום: מדווחת ל-roster פעם אחת (POST /payments/click, מפתח ציבורי), וטל מקבלת על זה מייל. הדיווח לא רושם כסף, הוא רק מסמן אצלה שיש תשלום שממתין */
  function reportPayment() {
    if (!paid || paid.sent) return Promise.resolve();
    paid.sent = true;
    return call("POST", "/payments/click", { participant_token: paid.token, meeting_id: paid.meeting }).catch(function () { paid.sent = false; });
  }

  var FIELD_ERR = { first_name: "invalid_name", last_name: "invalid_name", phone: "invalid_phone", age: "invalid_age", gender: "invalid_gender", address: "invalid_address", extra_fields: "invalid_extra" };

  /* body: { p_first, p_last, p_phone, p_age, p_gender, p_address (עיר, לא חובה) }, כמו שהטופס כבר בונה אותו */
  function signup(body) {
    return next().catch(function () { return null; }).then(function (ev) {
      var payload = { first_name: body.p_first, last_name: body.p_last, phone: body.p_phone, age: body.p_age, gender: body.p_gender };
      if (body.p_address) payload.address = body.p_address;   /* עיר, בשדה הכתובת של ה-API */
      if (body.p_extra && body.p_extra.length) payload.extra_fields = body.p_extra;   /* שדות חופשיים לא חובה (ניסיון קודם, מצב בריאותי ונפשי) */
      if (ev && ev.id) payload.meeting_id = ev.id;
      lastMeeting = ev && ev.id ? ev.id : null;
      return call("POST", "/signup", payload);
    }).then(function (r) {
      if (r.status === 200 && r.data && r.data.status === "ok") {
        /* הטוקן של המשתתף (pt_...) מאפשר לדווח על לחיצת תשלום ב-30 הימים הקרובים, למפגש שאליו נרשם */
        if (r.data.participant_token && lastMeeting) paid = { token: r.data.participant_token, meeting: lastMeeting, sent: false };
        return "created";
      }
      var e = r.data && r.data.error;
      /* ריטריט מלא: האדם נרשם כמשתתף וטל רואה אותו ומקבלת מייל, אבל לא נשמר לו מקום. כמו רשימת המתנה אצלה */
      if (e && e.code === "full") return "created";
      if (e && e.code === "validation" && FIELD_ERR[e.field]) return FIELD_ERR[e.field];
      throw new Error("signup " + r.status);
    });
  }

  window.AUM_API = { next: next, signup: signup, reportPayment: reportPayment };
})();
