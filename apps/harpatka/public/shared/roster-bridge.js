/* מתאם בין האתר לרוסטר (העסק harpatka), פעיל בכל סביבה. נטען אחרי config.js ואחרי /supabase.js ו-/roster-site.js (apps/roster/SITE.md, שלב 1).
   האתר ממשיך לדבר בשפה של הרפתקה (harpatka_me, harpatka_signup_phone, harpatka_meetings...), והמתאם מתרגם כל בקשה ל-Supabase הישן של הרפתקה:
     התחברות (/auth/v1/*)                            -> האימות של floa (אותו אישור גוגל של האפליקציה של הרפתקה, מוחלף שם בחיבור)
     harpatka_me*                                     -> me* של רוסטר, עם החיבור של המשתתף, בסכמה של הסביבה (roster או roster-test, לפי FLOA_ROSTER.test)
     harpatka_signup_phone / _complete / report_token -> FLOA_ROSTER.signupPhone / signupComplete / payClick (ה-API הציבורי של הסביבה)
     harpatka_meetings, _meeting_types, _public_settings (קריאה) -> FLOA_ROSTER.meetings({ past: 10, limit: 100 })
   וגם כל בקשה ישירה ל-CONFIG.rosterApi.url (rosterSend ב-register.js) עוברת לפונקציה המתאימה של הספרייה, כדי שתלך לסביבה הנכונה.
   הסביבה, הכתובות והמפתחות של רוסטר באים מ-/supabase.js ומ-/roster-site.js, לא מכאן. בשלב 2 מחליפים את הקריאות באתר ומוחקים את הקובץ. */
(function () {
  'use strict';
  var C = (typeof CONFIG !== 'undefined') ? CONFIG : null, R = C && C.rosterApi;   // CONFIG הוא const גלובלי (לא מאפיין של window)
  if (!R || !R.authUrl || !R.authKey || !window.fetch || window.__rosterBridge) return;
  window.__rosterBridge = true;
  var SB = C.supabaseUrl, real = window.fetch.bind(window), TOK = 'harpatka_roster_token';
  /* הספרייה של הדומיין: הסביבה (FLOA_ROSTER.test) ממנה, והכתובת והמפתח הציבורי של floa מ-/supabase.js. R.url נשאר כמו שהוא: הוא הקידומת של היירוט למטה */
  var L = window.FLOA_ROSTER || null;
  if (L) R.profile = L.test ? 'roster-test' : 'roster';
  else console.error('roster-bridge: /roster-site.js did not load before this file, so meetings and sign-ups cannot reach roster');
  if (window.SUPABASE && SUPABASE.url && SUPABASE.anonKey) { R.authUrl = SUPABASE.url; R.authKey = SUPABASE.anonKey; }
  var lib = function (fn, arg) { if (!L) { var e = new Error('roster: network'); e.code = 'network'; return Promise.reject(e); } return L[fn](arg); };
  var STATUS = { validation: 422, invalid_token: 401, invalid_key: 401, not_configured: 401, wrong_key_kind: 403, full: 409, closed: 409, conflict: 409, not_found: 404, rate_limited: 429, bad_request: 400, server_error: 500 };
  var statusOf = function (e) { return STATUS[e && e.code] || 500; };
  /* הטוקן של המשתתף מאוחסן בספרייה; העותק ב-harpatka_roster_token נשאר כי register.js קורא אותו ישירות. טוקן ישן שעוד אין לספרייה עובר אליה פעם אחת */
  try { var oldTok = localStorage.getItem(TOK); if (L && oldTok && !L.hasToken()) L.useToken(oldTok); } catch (e) {}

  /* חיבור שמור מהמערכת הישנה (Supabase של הרפתקה) לא תקף מול רוסטר: מנקים אותו כבר בטעינה, כדי שהמשתתף יראה כניסה מחדש ולא "משהו השתבש" (401 מהשער) */
  function clearOldSession() { try { localStorage.removeItem('harpatka_me_session'); localStorage.removeItem('harpatka_me_name'); } catch (e) {} }
  try {
    var rawS = localStorage.getItem('harpatka_me_session');
    if (rawS) {
      var tkS = JSON.parse(rawS).access_token || '', plS = JSON.parse(decodeURIComponent(escape(atob(tkS.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))));
      var refS = String(R.authUrl).replace(/^https?:\/\//, '').split('.')[0];
      if (String(plS.iss || '').indexOf(refS) < 0) clearOldSession();
    }
  } catch (e) { clearOldSession(); }

  var ME = {
    harpatka_me: 'me', harpatka_me_phone: 'me_phone', harpatka_me_complete: 'me_complete', harpatka_me_register: 'me_register', harpatka_me_register_src: 'me_register',
    harpatka_me_unregister: 'me_unregister', harpatka_me_pay_credit: 'me_pay_credit', harpatka_me_report_payment: 'me_report_payment', harpatka_me_update: 'me_update', harpatka_me_buy_pass: 'me_buy_pass'
  };
  var FIELD_CODE = { first_name: 'invalid_name', last_name: 'invalid_name', phone: 'invalid_phone', age: 'invalid_age', gender: 'invalid_gender', email: 'invalid_email' };

  var reply = function (body, status) { return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }); };
  function headersOf(init) {
    var h = {}, s = init && init.headers;
    if (!s) return h;
    if (typeof s.forEach === 'function' && !Array.isArray(s)) s.forEach(function (v, k) { h[k.toLowerCase()] = v; });
    else if (Array.isArray(s)) s.forEach(function (p) { h[String(p[0]).toLowerCase()] = p[1]; });
    else Object.keys(s).forEach(function (k) { h[k.toLowerCase()] = s[k]; });
    return h;
  }
  function bodyOf(init) { try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; } }
  var setTok = function (t) { try { localStorage.setItem(TOK, t); } catch (e) {} };
  var dropTok = function (e) { if (e && e.code === 'invalid_token') { try { localStorage.removeItem(TOK); } catch (x) {} } };   // הספרייה מחקה את שלה: גם העותק

  /* ---- רשימת המפגשים: אותה שורה כמו בטבלאות של הרפתקה, מתוך FLOA_ROSTER.meetings (עם מפגשים שעברו). בלי קאש משלו: הספרייה מאחדת בקשות ושומרת 4 שניות ---- */
  function loadMeetings() {
    return lib('meetings', { past: 10, limit: 100 }).then(function (d) {
      return (d.meetings || []).map(function (m) {
        return { id: m.id, meeting_date: m.date, meeting_time: String(m.time || '') + ':00', name: m.name || null, max_participants: m.capacity == null ? null : m.capacity, directions: null,
          price_tiers: m.price_tiers || null, image_url: m.image || null, city: m.city || null, place: m.place || null, type_id: null };
      });
    });
  }
  function meetingsQuery(path) {
    var q = new URLSearchParams(path.split('?')[1] || ''), rows;
    return loadMeetings().then(function (all) {
      rows = all.slice();
      var d = q.get('meeting_date');
      if (d && d.indexOf('gte.') === 0) rows = rows.filter(function (m) { return m.meeting_date >= d.slice(4); });
      if (d && d.indexOf('lt.') === 0) rows = rows.filter(function (m) { return m.meeting_date < d.slice(3); });
      var id = q.get('id'); if (id && id.indexOf('eq.') === 0) rows = rows.filter(function (m) { return m.id === id.slice(3); });
      var desc = /meeting_date\.desc/.test(q.get('order') || '');
      rows.sort(function (a, b) { var x = (a.meeting_date + a.meeting_time).localeCompare(b.meeting_date + b.meeting_time); return desc ? -x : x; });
      var lim = parseInt(q.get('limit') || '0', 10); if (lim > 0) rows = rows.slice(0, lim);
      return reply(rows);
    }).catch(function () { return reply([], 502); });
  }

  /* ---- הרשמת אורח בשני שלבים ---- */
  async function signupPhone(b) {
    var body = { phone: b.p_phone };
    if (b.p_meeting) body.meeting_id = b.p_meeting;
    if (b.p_src) body.source_code = b.p_src;
    try { var ge1 = sessionStorage.getItem('harpatka_g_email'); if (ge1) body.email = ge1; } catch (e) {}   // האימייל מגוגל כבר בשלב הטלפון
    var j;
    try { j = await lib('signupPhone', body); }   // keepalive בספרייה: הבקשה נשלמת גם כשהדף נסגר או עובר לוואטסאפ מיד אחרי הלחיצה
    catch (e) { return e && e.code === 'validation' && e.field === 'phone' ? reply({ status: 'invalid_phone' }) : reply({ error: 'roster_' + statusOf(e) }, 500); }
    setTok(j.participant_token || '');   // הספרייה שומרת את שלה; העותק בשביל register.js (reportPay, rosterSend)
    return reply(j.complete ? { status: 'exists', registered: !!j.registered, age: null } : { status: 'need_details', registered: !!j.registered });
  }
  async function signupComplete(b) {
    var body = { first_name: b.p_first, last_name: b.p_last, age: b.p_age, gender: b.p_gender };
    try { var ge = sessionStorage.getItem('harpatka_g_email'); if (ge) body.email = ge; } catch (e) {}   // כניסה עם גוגל שנכשלה: האימייל מהאישור מצורף להרשמת האורח
    try { await lib('signupComplete', body); return reply('ok'); }
    catch (e) { dropTok(e); return reply(FIELD_CODE[e && e.field] || 'error'); }
  }
  async function reportToken(b) {
    try { await lib('payClick', { meeting_id: b.p_meeting, method: b.p_method || undefined }); return reply('ok'); }
    catch (e) { dropTok(e); return reply({ error: 'roster_' + statusOf(e) }, 400); }
  }
  /* בקשה ישירה ל-CONFIG.rosterApi.url (rosterSend ב-register.js): הפונקציה של הספרייה, והתשובה בצורה של ה-API.
     200 והגוף, או הסטטוס של הקוד עם { error: { code, field } }. network נזרק כמו כישלון של fetch */
  function viaLibrary(fn, arg) {
    return lib(fn, arg).then(function (j) { return reply(j); }, function (e) {
      if (!e || e.code === 'network') throw new TypeError('Failed to fetch');
      dropTok(e);
      var er = { code: e.code || 'server_error' }; if (e.field) er.field = e.field;
      var h = { 'Content-Type': 'application/json' }; if (e.retryAfter) h['Retry-After'] = String(e.retryAfter);
      return new Response(JSON.stringify({ error: er }), { status: statusOf(e), headers: h });
    });
  }

  /* הצטרפות עם חשבון גוגל והפרטים בבת אחת (harpatka_me_join): me_phone ואז me_complete, ורק למשתתף שעוד אין לו פרטים (לא דורסים פרטים קיימים) */
  async function meJoin(b, init) {
    var hh = headersOf(init); hh.apikey = R.authKey; hh['content-type'] = 'application/json';
    hh['content-profile'] = R.profile || 'roster-test'; hh['accept-profile'] = R.profile || 'roster-test';
    var call = function (fn, body) { return real(R.authUrl + '/rest/v1/rpc/' + fn, { method: 'POST', headers: hh, body: JSON.stringify(Object.assign({ p_slug: R.slug || 'harpatka' }, body)) }).then(function (r) { return r.json().catch(function () { return null; }); }); };
    var ph = { p_phone: b.p_phone }; if (b.p_meeting && !b.p_no_meeting) ph.p_meeting = b.p_meeting;
    if (b.p_src) ph.p_source = b.p_src;
    var r = await call('me_phone', ph), st = r && r.status;
    if (st === 'phone_taken' || st === 'blocked') return reply(st);
    if (st === 'invalid_phone') return reply('invalid_phone');
    if (!(st === 'created' || st === 'linked' || st === 'reactivated')) return reply('error');
    if (st === 'created' || !r.complete) {
      var c = await call('me_complete', { p_first: b.p_first, p_last: b.p_last, p_age: b.p_age == null ? null : b.p_age, p_gender: b.p_gender || null });
      if (c !== 'ok') return reply(c || 'error');
    }
    return reply(st === 'created' ? 'created' : 'exists');
  }

  /* אין חיבור בזמן אמת לבסיס הנתונים של הרפתקה: האתר ממשיך לרענן בגיבוי התקופתי שלו */
  if (window.WebSocket) {
    var RealWS = window.WebSocket;
    window.WebSocket = function (u, p) {
      if (String(u).indexOf(SB.replace(/^https/, 'wss')) === 0) { var f = { readyState: 3, close: function () {}, send: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; setTimeout(function () { if (typeof f.onerror === 'function') f.onerror(new Event('error')); if (typeof f.onclose === 'function') f.onclose({ code: 1006 }); }, 0); return f; }
      return p === undefined ? new RealWS(u) : new RealWS(u, p);
    };
    window.WebSocket.prototype = RealWS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { window.WebSocket[k] = RealWS[k]; });
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (R.url && url.indexOf(R.url + '/') === 0 && init && String(init.method || '').toUpperCase() === 'POST') {   // הכתיבות הישירות ל-API: דרך הספרייה, לסביבה הנכונה
      var rp = url.slice(R.url.length).split('?')[0], rb = bodyOf(init);
      if (rp === '/signup') return viaLibrary('signup', rb);
      if (rp === '/signup/phone') return viaLibrary('signupPhone', rb);
      if (rp === '/signup/complete') return viaLibrary('signupComplete', rb);
      if (rp === '/payments/click') return viaLibrary('payClick', { meeting_id: rb.meeting_id, method: rb.method });
    }
    if (url.indexOf(SB) !== 0) return real(input, init);
    var path = url.slice(SB.length);
    init = init || {};

    if (R.googleAuth && path.indexOf('/auth/v1/token?grant_type=id_token') === 0) {   // כניסה עם האפליקציה של הרפתקה בגוגל: ה-Worker מאמת את האישור ומחזיר חיבור, בלי לחבר את האפליקציה לספק של floa
      var gb = bodyOf(init);
      return real(R.googleAuth, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_token: gb.id_token }) });
    }
    if (path.indexOf('/auth/v1/') === 0) {   // התחברות: אותו מסלול, השרת של floa
      var h = headersOf(init); h.apikey = R.authKey;
      return real(R.authUrl + path, Object.assign({}, init, { headers: h }));
    }
    if (path.indexOf('/rest/v1/rpc/') === 0) {
      var name = path.slice('/rest/v1/rpc/'.length).split('?')[0], b = bodyOf(init);
      if (ME[name]) {
        if (b.p_as) return Promise.resolve(reply({ status: 'auth' }));   // צפייה כמשתתף עוד לא נתמכת מול רוסטר
        var nb = Object.assign({ p_slug: R.slug || 'harpatka' }, b); delete nb.p_as; delete nb.p_src;
        if (name === 'harpatka_me_phone') {   // המקור והאימייל נשלחים באותה קריאה שיוצרת את המשתתף
          if (b.p_src) nb.p_source = b.p_src;
          try { var ge2 = sessionStorage.getItem('harpatka_g_email'); if (ge2) nb.p_email = ge2; } catch (e) {}
          if (nb.p_source || nb.p_email) ['p_meeting', 'p_email', 'p_source'].forEach(function (k) { if (nb[k] === undefined) nb[k] = null; });   // לגרסה עם חמשת הארגומנטים אין ברירות מחדל: קריאה חלקית לא מוצאת פונקציה
        }
        var hh = headersOf(init); hh.apikey = R.authKey; hh['content-profile'] = R.profile || 'roster-test'; hh['accept-profile'] = R.profile || 'roster-test';
        var src = b.p_src, prof = R.profile || 'roster-test';
        return real(R.authUrl + '/rest/v1/rpc/' + ME[name], Object.assign({}, init, { headers: hh, body: JSON.stringify(nb) })).then(function (res) {
          if (res.status === 401) { clearOldSession(); if (name === 'harpatka_me') return reply({ status: 'auth' }); }   // טוקן נדחה: מנקים את החיבור השמור, והאתר מציג כניסה מחדש
          if (src && (name === 'harpatka_me_register' || name === 'harpatka_me_register_src')) {   // מאיזה קוד (?s=) הגיע: נקבע רק למשתתף שעוד אין לו
            var h2 = Object.assign({}, hh); h2['content-type'] = 'application/json';
            real(R.authUrl + '/rest/v1/rpc/me_source', { method: 'POST', headers: h2, body: JSON.stringify({ p_slug: R.slug || 'harpatka', p_code: src }) }).catch(function () {});
          }
          return res;
        });
      }
      if (name === 'harpatka_signup_phone') return signupPhone(b);
      if (name === 'harpatka_signup_complete') return signupComplete(b);
      if (name === 'harpatka_report_payment_token') return reportToken(b);
      if (name === 'harpatka_me_claim' || name === 'harpatka_me_claim_token') return Promise.resolve(reply('none'));   // החיבור למשתתף נעשה לפי טלפון (me_phone)
      if (name === 'harpatka_me_unregister') return Promise.resolve(reply('forbidden'));   // אין ביטול שמירת מקום מהאזור האישי
      if (name === 'harpatka_me_join') return meJoin(b, init);
      return Promise.resolve(reply({ error: 'not_supported_on_roster', fn: name }, 501));   // שום קריאה לא הולכת לבסיס הנתונים של הרפתקה
    }
    if (path.indexOf('/rest/v1/harpatka_meetings') === 0) return meetingsQuery(path);
    if (path.indexOf('/rest/v1/harpatka_meeting_types') === 0 || path.indexOf('/rest/v1/harpatka_price_tiers') === 0 || path.indexOf('/rest/v1/harpatka_public_settings') === 0) return Promise.resolve(reply([]));
    if (path.indexOf('/rest/v1/') === 0 || path.indexOf('/realtime/') === 0 || path.indexOf('/storage/') === 0) return Promise.resolve(reply([], 200));   // לא לוקחים נתונים מבסיס הנתונים של הרפתקה
    return real(input, init);
  };
})();
