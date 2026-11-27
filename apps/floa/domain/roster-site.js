/* ==========================================================================
   A business's own site talks to roster through this one file.

   The definition is apps/roster/SITE.md. The file belongs to the domain, like
   /supabase.js and /auth.js: it sits in apps/floa/domain/, is copied to the
   root, and is loaded after /supabase.js (and after /auth.js on a site with a
   personal area), before the site's own scripts:

       <script src="/supabase.js"></script>
       <script src="/auth.js"></script>        (only on a site with a personal area)
       <script src="/roster-site.js" data-business="<slug>" data-key="rk_pub_..." data-test-key="rk_pub_..."></script>

   The site calls window.FLOA_ROSTER and gets the PUBLIC shapes of the roster
   API (/roster/v1/). Where the data comes from is this file's business only:
   addresses, keys, schemas, function names, the realtime protocol, the media
   bucket and the keys it keeps in the browser. Change any of that here and no
   site notices.

     reads     the meetings list straight from the database (site_meetings, the
               anon key, never the person's token). If the function is not in
               the schema yet (404) the same answer is read from the API with
               the page's key: a safety net for the order of release, not a
               second way.
     writes    stay on the public API, exactly as before: /signup,
               /signup/phone, /signup/complete, /payments/click.
     me.*      the personal area: the me_* functions, through FLOA_AUTH.api with
               the person's token.
     live      one WebSocket per page, a public channel per business, no data
               in the signal.

   The environment (real or test) is decided by /supabase.js
   (SUPABASE.roster), by the host only. This file never takes it from the page,
   the address or storage, never sends the real key on test or the test key on
   the real site, and refuses to start when a secret key (rk_sec_) is on the
   page. No business is named here.
   ========================================================================== */
(function () {
  "use strict";

  if (window.FLOA_ROSTER) return;   /* loaded twice: the first one stands */
  var S = window.SUPABASE;
  /* the page's fetch, kept the moment this loads: an adapter that wraps fetch after this file can never catch these requests */
  var F = window.fetch;

  /* ---- the tag: the only place configuration comes from ------------------------------------------------------------------------- */
  var tag = document.currentScript;
  if (!tag || !/\/roster-site\.js(?:[?#]|$)/.test(tag.getAttribute("src") || "")) {
    tag = null;
    var all = document.getElementsByTagName("script");
    for (var i = all.length - 1; i >= 0; i--) if (/\/roster-site\.js(?:[?#]|$)/.test(all[i].getAttribute("src") || "")) { tag = all[i]; break; }
  }
  if (!tag) { console.error("roster-site: its script tag was not found, so FLOA_ROSTER is not created"); return; }
  for (var a = 0; a < tag.attributes.length; a++) {
    if (/rk_sec_/i.test(tag.attributes[a].value || "")) {
      console.error("roster-site: a SECRET roster key (rk_sec_) is written on this page. It must never reach a browser. FLOA_ROSTER is not created and the key is sent nowhere: put the public key (rk_pub_) on the tag instead.");
      return;
    }
  }
  var SLUG = tag.getAttribute("data-business") || "";
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(SLUG)) { console.warn("roster-site: the tag has no data-business (a roster slug), so FLOA_ROSTER is not created"); return; }
  if (!S || !S.url || !S.anonKey) { console.error("roster-site: /supabase.js must be loaded before /roster-site.js, so FLOA_ROSTER is not created"); return; }
  if (typeof F !== "function") { console.error("roster-site: this browser has no fetch, so FLOA_ROSTER is not created"); return; }

  /* ---- the environment ---------------------------------------------------------------------------------------------------------- */
  var KEY_RE = /^rk_pub_[A-Za-z0-9]{32}$/, TOKEN_RE = /^pt_[A-Za-z0-9]{32}$/, UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var TEST = S.roster === "roster-test";                       /* real unless /supabase.js said test */
  var SCHEMA = TEST ? "roster-test" : "roster";
  var API = TEST ? "https://api-test.floa.co.il/roster/v1" : "https://api.floa.co.il/roster/v1";
  var BUCKET = TEST ? "roster-test-media" : "roster-media";
  /* the key of THIS environment only: on test without data-test-key a write is refused, never sent with the real key (and the other way round) */
  var KEY = tag.getAttribute(TEST ? "data-test-key" : "data-key") || "";
  if (!KEY_RE.test(KEY)) KEY = "";
  var TOKEN_KEY = "floa.roster.token:" + SCHEMA + ":" + SLUG;
  var TIMEOUT = 15000, TOKEN_DAYS = 30, MEET_TTL = 4000;
  if (TEST && typeof S.testStrip === "function") S.testStrip();   /* a business's site on test wears the strip too */

  /* ---- errors: an Error with .code (the API's codes as they are, and network, not_configured, signed_out), maybe .field, .retryAfter */
  var API_CODES = { validation: 1, invalid_token: 1, invalid_key: 1, wrong_key_kind: 1, full: 1, closed: 1, not_found: 1, conflict: 1, rate_limited: 1, bad_request: 1, server_error: 1 };
  var BY_STATUS = { 400: "bad_request", 401: "invalid_key", 403: "wrong_key_kind", 404: "not_found", 409: "conflict", 422: "validation", 429: "rate_limited" };
  function fail(code, field, retryAfter) {
    var e = new Error("roster: " + code);
    e.code = code;
    if (field) e.field = field;
    if (retryAfter) e.retryAfter = retryAfter;
    return e;
  }
  var isObj = function (v) { return v !== null && typeof v === "object" && !Array.isArray(v); };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  function pick(o, keys) {
    var out = {};
    if (!isObj(o)) return out;
    for (var i = 0; i < keys.length; i++) if (o[keys[i]] !== undefined) out[keys[i]] = o[keys[i]];
    return out;
  }

  /* one request, 15 seconds at most. No answer that can be read (no network, the time ran out, a reply the browser blocked: also
     origin_not_allowed, which the API sends without CORS on purpose) is `network`. A keepalive request is never aborted: it has to
     finish even when the page has already moved on to WhatsApp. */
  function send(url, init) {
    return new Promise(function (ok, no) {
      var done = false, ctl = !init.keepalive && typeof AbortController === "function" ? new AbortController() : null;
      if (ctl) init.signal = ctl.signal;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        if (ctl) try { ctl.abort(); } catch (e) { /* nothing to stop */ }
        no(fail("network"));
      }, TIMEOUT);
      F.call(window, url, init).then(function (r) {
        if (done) return;
        done = true; clearTimeout(t); ok(r);
      }, function () {
        if (done) return;
        done = true; clearTimeout(t); no(fail("network"));
      });
    });
  }

  /* an answer of the API: the body on 2xx, else its {error:{code,field}} as an Error */
  function fromApiReply(r) {
    return r.text().then(function (raw) {
      var j = null;
      try { j = raw ? JSON.parse(raw) : null; } catch (e) { /* not JSON */ }
      if (r.ok) {
        if (isObj(j)) return j;
        throw fail("server_error");
      }
      var er = isObj(j) && isObj(j.error) ? j.error : {};
      var code = typeof er.code === "string" ? er.code : "";
      if (code === "origin_not_allowed" || code === "secret_key_in_browser") code = "network";
      else if (!API_CODES[code]) code = BY_STATUS[r.status] || "server_error";
      var field = code === "validation" && typeof er.field === "string" ? er.field : "";
      var wait = 0;
      if (code === "rate_limited") {
        var n = Number(r.headers.get("retry-after"));
        wait = isFinite(n) && n > 0 ? Math.min(3600, Math.ceil(n)) : 60;
      }
      throw fail(code, field, wait);
    }, function () { throw fail("network"); });
  }

  function apiCall(method, path, body, keepalive) {
    if (!KEY) return Promise.reject(fail("not_configured"));
    var init = { method: method, headers: { authorization: "Bearer " + KEY } };
    if (body !== undefined) { init.headers["content-type"] = "application/json"; init.body = JSON.stringify(body); }
    if (keepalive) init.keepalive = true;
    return send(API + path, init).then(fromApiReply);
  }

  /* ---- the participant's token: per environment and per business, 30 days from the moment it arrived ----------------------------- */
  var memToken = null;   /* storage blocked (a private window): the token lives in memory, for this page only */
  function tokenDrop() {
    memToken = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* storage blocked */ }
  }
  function tokenGet() {
    var v = memToken;
    try { var raw = localStorage.getItem(TOKEN_KEY); v = raw ? JSON.parse(raw) : null; } catch (e) { /* storage blocked or unreadable: memory */ }
    if (!isObj(v)) return "";
    if (typeof v.t !== "string" || !TOKEN_RE.test(v.t) || !(Date.now() - Number(v.at) < TOKEN_DAYS * 86400000)) { tokenDrop(); return ""; }
    return v.t;
  }
  function tokenSet(t) {
    if (typeof t !== "string" || !TOKEN_RE.test(t)) return false;
    memToken = { t: t, at: Date.now() };
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(memToken)); } catch (e) { /* storage blocked: memory only */ }
    return true;
  }
  var keepToken = function (j) { if (j && typeof j.participant_token === "string") tokenSet(j.participant_token); return j; };
  var dropOnInvalid = function (e) { if (e && e.code === "invalid_token") tokenDrop(); throw e; };

  /* ---- writes, on the public API exactly as before --------------------------------------------------------------------------------- */
  function signup(f) {
    return apiCall("POST", "/signup", pick(f, ["first_name", "last_name", "phone", "email", "address", "age", "gender", "meeting_id", "extra_fields", "website"]))
      .then(keepToken, dropOnInvalid);
  }
  function signupPhone(f) {
    return apiCall("POST", "/signup/phone", pick(f, ["phone", "email", "meeting_id", "source_code"]), true).then(keepToken, dropOnInvalid);
  }
  function signupComplete(f) {
    if (!KEY) return Promise.reject(fail("not_configured"));
    var t = tokenGet();
    if (!t) return Promise.reject(fail("invalid_token"));
    var body = pick(f, ["first_name", "last_name", "age", "gender", "email"]);
    body.participant_token = t;
    return apiCall("POST", "/signup/complete", body).then(null, dropOnInvalid);
  }
  function payClick(f) {
    if (!KEY) return Promise.reject(fail("not_configured"));
    var t = tokenGet();
    if (!t) return Promise.reject(fail("invalid_token"));
    var body = pick(f, ["meeting_id", "method"]);
    body.participant_token = t;
    return apiCall("POST", "/payments/click", body, true).then(null, dropOnInvalid);
  }

  /* ---- the meetings: read straight from the database ------------------------------------------------------------------------------ */
  var MEETING_KEYS = ["id", "date", "time", "name", "city", "place", "capacity", "spots_left", "full", "price", "price_tiers", "image"];
  var bizId = "";        /* the business's folder in the media bucket: it arrives with the meetings and never leaves this file */
  var cache = {}, flight = {}, gen = 0;

  /* exactly the public shape of GET /meetings: { business: { name }, meetings: [ the 12 public keys ] } */
  function shape(d) {
    var name = isObj(d.business) && typeof d.business.name === "string" ? d.business.name.slice(0, 200) : "";
    var list = [];
    for (var i = 0; i < d.meetings.length; i++) {
      var m = d.meetings[i];
      if (!isObj(m)) continue;
      var o = {};
      for (var k = 0; k < MEETING_KEYS.length; k++) if (Object.prototype.hasOwnProperty.call(m, MEETING_KEYS[k])) o[MEETING_KEYS[k]] = m[MEETING_KEYS[k]];
      list.push(o);
    }
    return { business: { name: name }, meetings: list };
  }
  function meetingsFromApi(past, limit) {
    return apiCall("GET", "/meetings?limit=" + limit + "&past=" + past).then(function (d) {
      if (!Array.isArray(d.meetings)) throw fail("server_error");
      return shape(d);
    });
  }
  function meetingsFromDb(past, limit) {
    var q = "?p_slug=" + encodeURIComponent(SLUG) + "&p_limit=" + limit + "&p_past=" + past;
    return send(S.url + "/rest/v1/rpc/site_meetings" + q, {
      method: "GET",
      headers: { apikey: S.anonKey, authorization: "Bearer " + S.anonKey, "accept-profile": SCHEMA },
    }).then(function (r) {
      if (r.status === 404) return meetingsFromApi(past, limit);   /* the function is not in this schema yet */
      if (!r.ok) throw fail("server_error");
      return r.json().then(function (d) {
        if (isObj(d) && d.error === "not_found") throw fail("not_found");
        if (!isObj(d) || !Array.isArray(d.meetings)) throw fail("server_error");
        if (isObj(d.business) && typeof d.business.id === "string" && UUID_RE.test(d.business.id)) bizId = d.business.id.toLowerCase();
        return shape(d);
      }, function () { throw fail("server_error"); });
    });
  }
  /* the API's limits: limit 1 to 100 (default 20), past 0 to 10 (default 0); more is the most, a value that is not a whole number is refused */
  function whole(v, lo, hi, def, field) {
    if (v === undefined || v === null) return def;
    var n = Number(v);
    if (typeof v === "boolean" || !isFinite(n) || Math.floor(n) !== n || n < lo) throw fail("validation", field);
    return Math.min(n, hi);
  }
  function emptyCache() { cache = {}; flight = {}; gen++; }
  /* meetings({ past, limit, fresh }). Calls at the same moment with the same values share one request; an answer is kept 4 seconds
     per past and limit. fresh skips the kept answer and still joins a request already on its way. A realtime signal empties both
     (a request that left before the change is not joined after it). A failure leaves what was kept, and rejects. */
  function meetings(o) {
    o = o || {};
    var past, limit;
    try { past = whole(o.past, 0, 10, 0, "past"); limit = whole(o.limit, 1, 100, 20, "limit"); }
    catch (e) { return Promise.reject(e); }
    var k = past + ":" + limit, c = cache[k];
    if (!o.fresh && c && Date.now() - c.at < MEET_TTL) return Promise.resolve(clone(c.v));
    if (!flight[k]) {
      var g = gen;
      var p = meetingsFromDb(past, limit).then(function (v) {
        if (g === gen) { cache[k] = { v: v, at: Date.now() }; if (flight[k] === p) delete flight[k]; }
        return v;
      }, function (e) {
        if (g === gen && flight[k] === p) delete flight[k];
        throw e;
      });
      flight[k] = p;
    }
    return flight[k].then(clone);
  }

  /* ---- media: the one place that knows where a business's files sit ---------------------------------------------------------------- */
  function mediaUrl(name) {
    if (typeof name !== "string" || !/^[A-Za-z0-9_.-]{1,200}$/.test(name) || name.indexOf("..") >= 0) return Promise.reject(fail("validation", "name"));
    return (bizId ? Promise.resolve() : meetings()).then(function () {
      if (!bizId) throw fail("not_found");   /* the meetings came from the API (the safety net), which does not name the folder */
      return S.url + "/storage/v1/object/public/" + BUCKET + "/" + bizId + "/" + name;
    });
  }

  /* ---- me.*: the personal area, the person's token through /auth.js. A word of state in the body is an answer, not an error: only
     signed_out, not_configured, network and server_error reject. ---------------------------------------------------------------------- */
  function timed(p) {
    return new Promise(function (ok, no) {
      var t = setTimeout(function () { no(fail("network")); }, TIMEOUT);
      p.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); no(e); });
    });
  }
  function rpc(fn, args) {
    var A = window.FLOA_AUTH;   /* looked up at the call, not at load */
    if (!A || typeof A.api !== "function") return Promise.reject(fail("not_configured"));
    if (typeof A.signedIn === "function" && !A.signedIn()) return Promise.reject(fail("signed_out"));
    var body = { p_slug: SLUG };
    for (var k in args) if (Object.prototype.hasOwnProperty.call(args, k) && args[k] !== undefined) body[k] = args[k];
    var call;
    try { call = A.api("/rest/v1/rpc/" + fn, { method: "POST", json: body, profile: SCHEMA }); }
    catch (e) { return Promise.reject(fail("not_configured")); }
    return timed(call).then(null, function (e) {
      if (e && e.code === "network") throw e;
      if (e && (e.signedOut || e.status === 401)) throw fail("signed_out");
      if (e && typeof e.status === "number" && e.status) throw fail("server_error");
      throw fail("network");   /* fetch itself failed: no status at all */
    });
  }
  var v = function (o, k) { return isObj(o) ? o[k] : undefined; };
  var orNull = function (x) { return x === undefined || x === "" ? null : x; };
  var me = Object.freeze({
    get: function () { return rpc("me", {}); },
    /* always the five arguments: the five-argument me_phone has no defaults, and a partial call finds no function */
    phone: function (o) { return rpc("me_phone", { p_phone: orNull(v(o, "phone")), p_meeting: orNull(v(o, "meeting_id")), p_email: orNull(v(o, "email")), p_source: orNull(v(o, "source")) }); },
    complete: function (o) { return rpc("me_complete", { p_first: v(o, "first_name"), p_last: v(o, "last_name"), p_age: v(o, "age"), p_gender: v(o, "gender"), p_email: v(o, "email") }); },
    register: function (meetingId) { return rpc("me_register", { p_meeting: meetingId }); },
    source: function (code) { return rpc("me_source", { p_code: code }); },
    update: function (o) { return rpc("me_update", { p_first: v(o, "first_name"), p_last: v(o, "last_name"), p_age: v(o, "age"), p_gender: v(o, "gender"), p_phone: v(o, "phone"), p_email: v(o, "email") }); },
    reportPayment: function (meetingId, method) { return rpc("me_report_payment", method ? { p_meeting: meetingId, p_method: method } : { p_meeting: meetingId }); },
    payCredit: function (meetingId) { return rpc("me_pay_credit", { p_meeting: meetingId }); },
    buyPass: function (typeId, n) { return rpc("me_buy_pass", { p_type: typeId, p_n: n }); },
  });

  /* ---- live: one WebSocket per page for every listener (the constants of ui/docs/realtime.md) -------------------------------------- */
  var RT = { beat: 25000, retryMin: 1000, retryMax: 30000, hidden: 300000, merge: 300, spreadMin: 200, spreadMax: 1000, gap: 3000, poll: 60, pollMin: 15 };
  var KINDS = { meeting: 1, attendance: 1, payment: 1, participant: 1 };
  var TOPIC = "realtime:" + SCHEMA + ":" + SLUG;
  var subs = [], want = false, hooked = false;
  var ws = null, ref = 0, joinRef = "", beat = 0, missed = 0, retry = RT.retryMin, again = 0, hideT = 0, dropped = false;
  var chKind = "", chMerge = 0, chWait = 0, chLast = 0, visLast = 0;

  function tell(ev, only) {
    emptyCache();   /* before every onChange */
    var list = only ? [only] : subs.slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i].fn(ev); } catch (e) { setTimeout(function () { throw e; }, 0); }   /* one listener's error never stops the next */
    }
  }
  /* a signal from the database: gathered for 300 ms, then each tab waits a random 200 to 1000 ms, and never more than one per 3 seconds.
     On a public channel anyone with the anon key can broadcast, so a forged signal can never become an unbounded wave of reads. */
  function onSignal(kind) {
    chKind = kind;
    if (chMerge || chWait) return;   /* already gathering, or already on its way: this one rides along */
    chMerge = setTimeout(function () {
      chMerge = 0;
      var wait = Math.max(RT.spreadMin + Math.random() * (RT.spreadMax - RT.spreadMin), chLast + RT.gap - Date.now());
      chWait = setTimeout(function () {
        chWait = 0; chLast = Date.now();
        var k = chKind; chKind = "";
        if (subs.length) tell({ reason: "change", kind: k });
      }, wait);
    }, RT.merge);
  }
  function put(o) { if (ws && ws.readyState === 1) try { ws.send(JSON.stringify(o)); } catch (e) { /* closing */ } }
  function quietClose() {
    var s = ws;
    ws = null; clearInterval(beat); beat = 0;
    if (s) try { s.close(); } catch (e) { /* already closed */ }
  }
  function openLater() {
    if (again || !want) return;
    var d = Math.min(retry, RT.retryMax) * (0.8 + Math.random() * 0.4);
    retry = Math.min(retry * 2, RT.retryMax);
    again = setTimeout(function () { again = 0; if (!document.hidden) open(); }, d);   /* a hidden tab opens again when it is shown */
  }
  function open() {
    if (ws || !want || typeof WebSocket !== "function") return;
    var sock;
    try { sock = new WebSocket(S.url.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(S.anonKey) + "&vsn=1.0.0"); }
    catch (e) { dropped = true; openLater(); return; }
    ws = sock;
    sock.onopen = function () {
      if (ws !== sock) return;
      retry = RT.retryMin; missed = 0;
      joinRef = String(++ref);
      put({ topic: TOPIC, event: "phx_join", ref: joinRef, join_ref: joinRef,
            payload: { config: { broadcast: { ack: false, self: false }, presence: { key: "" }, private: false }, access_token: S.anonKey } });
      beat = setInterval(function () {
        if (missed >= 2) { try { sock.close(); } catch (e) { /* closing */ } return; }   /* two beats unanswered: the connection is dead */
        missed++;
        put({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) });
      }, RT.beat);
    };
    sock.onmessage = function (e) {
      if (ws !== sock) return;
      var m;
      try { m = JSON.parse(e.data); } catch (x) { return; }
      if (!isObj(m)) return;
      if (m.topic === "phoenix") { if (m.event === "phx_reply") missed = 0; return; }
      if (m.topic !== TOPIC) return;
      if (m.event === "phx_reply" && m.ref === joinRef) {
        if (isObj(m.payload) && m.payload.status === "ok" && dropped) { dropped = false; tell({ reason: "rejoin" }); }
        return;
      }
      if (m.event === "broadcast" && isObj(m.payload) && m.payload.event === "change") {
        var k = isObj(m.payload.payload) ? m.payload.payload.t : "";
        if (KINDS[k]) onSignal(k);
      }
    };
    sock.onclose = function () {
      if (ws !== sock) return;   /* closed on purpose */
      ws = null; clearInterval(beat); beat = 0;
      dropped = true;
      openLater();
    };
    sock.onerror = function () { try { sock.close(); } catch (x) { /* closing */ } };
  }
  function shown() {
    if (!want || document.hidden) return;
    var now = Date.now();
    if (now - visLast < 1000) return;   /* focus and visibilitychange come together: one reload */
    visLast = now;
    dropped = false;   /* the reload for coming back covers the reconnect */
    tell({ reason: "visible" });
  }
  function hook() {
    if (hooked) return;
    hooked = true;
    document.addEventListener("visibilitychange", function () {
      if (!want) return;
      if (document.hidden) {
        if (!hideT) hideT = setTimeout(function () { hideT = 0; quietClose(); }, RT.hidden);   /* 5 minutes hidden: the connection is let go */
        return;
      }
      clearTimeout(hideT); hideT = 0;
      if (!ws) { clearTimeout(again); again = 0; open(); }
      shown();
    });
    window.addEventListener("focus", shown);
    window.addEventListener("online", shown);
    window.addEventListener("pageshow", function (e) { if (e.persisted) { visLast = 0; shown(); } });
  }
  /* live(onChange, { poll }): onChange({ reason, kind }). poll is in seconds (default 60, at least 15), only while the tab is shown */
  function live(onChange, o) {
    if (typeof onChange !== "function") throw new TypeError("FLOA_ROSTER.live needs a function");
    o = o || {};
    var every = Math.max(Number(o.poll) || RT.poll, RT.pollMin) * 1000;
    var s = { fn: onChange };
    s.t = setInterval(function () { if (!document.hidden) tell({ reason: "poll" }, s); }, every);
    subs.push(s);
    if (!want) { want = true; hook(); open(); }
    var closed = false;
    return {
      close: function () {
        if (closed) return;
        closed = true;
        clearInterval(s.t);
        var i = subs.indexOf(s);
        if (i >= 0) subs.splice(i, 1);
        if (subs.length) return;
        want = false; dropped = false;   /* the last one closes the connection */
        clearTimeout(again); again = 0; clearTimeout(hideT); hideT = 0;
        clearTimeout(chMerge); chMerge = 0; clearTimeout(chWait); chWait = 0;
        quietClose();
      },
    };
  }

  window.FLOA_ROSTER = Object.freeze({
    business: SLUG,
    test: TEST,   /* for a label only: a site never builds an address from it */
    meetings: meetings,
    signup: signup,
    signupPhone: signupPhone,
    signupComplete: signupComplete,
    payClick: payClick,
    hasToken: function () { return !!tokenGet(); },
    /* a one-time hand-over from a site's old storage: only a well formed participant token is taken */
    useToken: function (t) { return tokenSet(t); },
    me: me,
    live: live,
    mediaUrl: mediaUrl,
  });
})();
