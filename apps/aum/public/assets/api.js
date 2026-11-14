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

  var BASE = "https://floa-lead.floa-il.workers.dev/roster/v1";
  var KEY = "rk_pub_6ZK4VOFOC1kY6OrVMj8Yn7z8FloOWf0P";
  /* ל-roster אין שעת סיום למפגש (הוא מחשב כשעתיים מההתחלה), ובריטריט היום של AUM זה תמיד עד 16:00 */
  var END = "16:00";
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
          to: END,
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

  var FIELD_ERR = { first_name: "invalid_name", last_name: "invalid_name", phone: "invalid_phone", age: "invalid_age", gender: "invalid_gender" };

  /* body: { p_first, p_last, p_phone, p_age, p_gender }, כמו שהטופס כבר בונה אותו */
  function signup(body) {
    return next().catch(function () { return null; }).then(function (ev) {
      var payload = { first_name: body.p_first, last_name: body.p_last, phone: body.p_phone, age: body.p_age, gender: body.p_gender };
      if (ev && ev.id) payload.meeting_id = ev.id;
      return call("POST", "/signup", payload);
    }).then(function (r) {
      if (r.status === 200 && r.data && r.data.status === "ok") return "created";
      var e = r.data && r.data.error;
      /* ריטריט מלא: האדם נרשם כמשתתף וטל רואה אותו ומקבלת מייל, אבל לא נשמר לו מקום. כמו רשימת המתנה אצלה */
      if (e && e.code === "full") return "created";
      if (e && e.code === "validation" && FIELD_ERR[e.field]) return FIELD_ERR[e.field];
      throw new Error("signup " + r.status);
    });
  }

  window.AUM_API = { next: next, signup: signup };
})();
