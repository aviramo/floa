/* THE LIVE DATA LAYER (ui/docs/realtime.md), served at /live.js, loaded after /supabase.js and /auth.js and before /list.js.
   One WebSocket per tab to Supabase Realtime (the Phoenix protocol, vsn 1.0.0), for every source and channel of the page. An app writes no
   WebSocket, heartbeat, reconnect, token timer or change effect: it asks for a source and listens to it.
   RosterLive.source({ table | rpc, args, select, filter, order, key, keyCol, watch, map, schema, live }) -> a shared, ref-counted source:
     rows() get(key) status on(fn) refetch() write(key, patch, run) busy(key) close(), and table, schema, keyCol (read only)
     on(fn): fn({ rows, added, changed, removed, moved, origin, status }); added, changed, removed and moved are rows (removed: the last row seen),
     origin is "remote" (somebody else, another device or tab), "local" (my write) or "sync" (the first load and every catch-up)
   RosterLive.bind(el, source, key, fn) -> unbind: writes fn(row) (key null: fn(rows)) into el's text only when it changed, with the change effect
   RosterLive.presence(topic, { item, field }) -> who is where, on a PRIVATE channel: set(place) clear() peers() on(fn) attach(ctl, opts) close() ok,
     and the live text of a co-edited field on the same channel: text(pl) onText(fn) live(), and transport (read only: "relay", "broadcast" or "none").
     The channel is the relay room <app>/<id> when the domain set SUPABASE.relay (on localhost localStorage["floa.live.relay"] overrides it),
     else Supabase broadcast on a private channel, as before ("ממסר חי בשרת שלנו")
   RosterMotion.flip(container, mutate, { burst, out }) mark(el, kind) change(el) tick(el, text) burst(ev) reduced()
   The look of every effect is in kit.css (ui/css/43-live.css, keyed on data-rfx); the FLIP measure is the declared exception to "CSS before JS". */
(function () {
  "use strict";
  var html = document.documentElement;
  /* the kit's constants ("נתונים בזמן אמת"); RosterLive._tune changes them for a test page only */
  var T = { hb: 25000, hidden: 300000, debounce: 300, base: 1000, cap: 30000, token: 60000, throttle: 120, again: 2500, stale: 6000, own: 3000, poll: 30000 };
  var NONE = {};

  function S() { return window.SUPABASE || {}; }
  function auth() { return window.FLOA_AUTH || null; }
  function signedIn() { var a = auth(); return !!(a && a.signedIn()); }
  function anon() { return S().anonKey || ""; }
  function token() {
    if (!signedIn()) return Promise.resolve(anon());
    return auth().token().then(null, function () { return anon(); });
  }
  function local() { return /^(localhost|127\.|\[::1\])/.test(location.hostname); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (own(s, k)) t[k] = s[k]; } return t; }
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) { if (!own(b, ka[i])) return false; if (JSON.stringify(a[ka[i]]) !== JSON.stringify(b[ka[i]])) return false; }
    return true;
  }

  /* ---------- the connection: one per tab ---------- */
  var C = { ws: null, ref: 0, hbRef: null, misses: 0, hbTimer: 0, tries: 0, retryTimer: 0, hiddenTimer: 0, tokTimer: 0, tok: "", asleep: false, opened: false, user: "" };
  var channels = {};   /* topic -> { topic, payload(tok), joined, joinRef, onJoin(first), onRefuse(reason), onMessage(m), onDown() } */
  var replies = {};    /* ref -> fn(payload) */

  function live(state) { html.setAttribute("data-live", state); }
  function wanted() { return Object.keys(channels).length > 0; }
  function send(m) { if (C.ws && C.ws.readyState === 1) { C.ws.send(JSON.stringify(m)); return true; } return false; }
  function nextRef() { return String(++C.ref); }

  function connect() {
    if (C.ws || C.asleep || !wanted() || !window.WebSocket || !S().url) return;
    clearTimeout(C.retryTimer); C.retryTimer = 0;
    var ws;
    try { ws = new WebSocket(S().url.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(anon()) + "&vsn=1.0.0"); }
    catch (e) { return retry(); }
    C.ws = ws; C.user = signedIn() ? auth().userId() : ""; live("connecting");
    ws.onopen = function () {
      if (C.ws !== ws) return;
      C.tries = 0; C.misses = 0; C.hbRef = null;
      C.hbTimer = setInterval(beat, T.hb);
      token().then(function (t) {
        if (C.ws !== ws) return;
        C.tok = t; live("on");
        Object.keys(channels).forEach(function (k) { join(channels[k]); });
      });
    };
    ws.onmessage = function (e) { if (C.ws === ws) take(e.data); };
    ws.onclose = function () { if (C.ws === ws) down(); };
    ws.onerror = function () { try { ws.close(); } catch (x) { /* closed */ } };
  }
  /* the connection is gone (closed by the server, dead heartbeat, no network, or put to sleep): every channel waits, and comes back with a catch-up */
  function down() {
    var ws = C.ws; C.ws = null;
    clearInterval(C.hbTimer); C.hbTimer = 0; C.hbRef = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (x) { /* closed */ } }
    replies = {};
    Object.keys(channels).forEach(function (k) { var ch = channels[k]; ch.joined = false; if (ch.onDown) ch.onDown(); });
    live("off");
    if (!C.asleep) retry();
  }
  /* the wait grows (1s, 2s, 4s… up to 30s), with a little chance in it so that every client does not come back in the same second */
  function retry() {
    if (C.retryTimer || C.asleep || !wanted()) return;
    var wait = Math.min(T.cap, T.base * Math.pow(2, C.tries++));
    wait = Math.round(wait * (0.8 + Math.random() * 0.4));
    C.retryTimer = setTimeout(function () { C.retryTimer = 0; connect(); }, wait);
  }
  /* every 25s; two heartbeats with no answer: the connection is dead, closed and opened again */
  function beat() {
    if (C.hbRef) { if (++C.misses >= 2) { down(); return; } }
    C.hbRef = nextRef();
    send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: C.hbRef });
  }
  function join(ch) {
    if (!C.ws || C.ws.readyState !== 1) return;
    var ref = nextRef(); ch.joinRef = ref; ch.joined = false;
    replies[ref] = function (p) {
      if (ch !== channels[ch.topic]) return;
      if (p && p.status === "ok") { var first = !ch.ever; ch.ever = true; ch.joined = true; if (ch.onJoin) ch.onJoin(first); }
      else { ch.joined = false; if (ch.onRefuse) ch.onRefuse((p && p.response && (p.response.reason || p.response.message)) || "refused"); }
    };
    send({ topic: ch.topic, event: "phx_join", payload: ch.payload(C.tok || anon()), ref: ref, join_ref: ref });
  }
  function take(data) {
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.event === "phx_reply" && m.topic === "phoenix") { if (m.ref === C.hbRef) { C.hbRef = null; C.misses = 0; } return; }
    if (m.event === "phx_reply" && m.ref && replies[m.ref]) { var fn = replies[m.ref]; delete replies[m.ref]; fn(m.payload); return; }
    var ch = channels[m.topic];
    if (!ch) return;
    if (m.event === "phx_error" || m.event === "phx_close") {   /* the server let go of this channel: join it again, a little later */
      if (ch.joined) { ch.joined = false; if (ch.onDown) ch.onDown(); setTimeout(function () { if (channels[ch.topic] === ch) join(ch); }, T.base); }
      return;
    }
    if (m.event === "system" && m.payload && m.payload.status === "error") {   /* a join answered "ok" and then refused by the server (e.g. "Unable to subscribe … invalid column for filter"): refused, not live */
      ch.joined = false;
      if (ch.onRefuse) ch.onRefuse(m.payload.message || "refused");
      return;
    }
    if (ch.onMessage) ch.onMessage(m);
  }
  function open(ch) { channels[ch.topic] = ch; if (C.ws && C.ws.readyState === 1 && C.tok) join(ch); else connect(); }
  function shut(ch) {
    if (channels[ch.topic] !== ch) return;
    delete channels[ch.topic];
    if (ch.joined) send({ topic: ch.topic, event: "phx_leave", payload: {}, ref: nextRef() });
    if (!wanted() && C.ws) { C.asleep = true; down(); C.asleep = false; html.removeAttribute("data-live"); clearTimeout(C.retryTimer); C.retryTimer = 0; }
  }

  /* the token: refreshed before it runs out (auth.js), pushed to every open channel; a sign-out closes the connection and empties the sources */
  function tokenCheck() {
    rcToken();   /* the relay socket gets the new token too (or a sign-out closes it) */
    var who = signedIn() ? auth().userId() : "";
    if (C.ws && who !== C.user) {
      Object.keys(sources).forEach(function (k) { sources[k].empty(); });
      down(); C.tries = 0; clearTimeout(C.retryTimer); C.retryTimer = 0; connect();
      Object.keys(sources).forEach(function (k) { sources[k].refetch(); });
      return;
    }
    if (!C.ws || C.ws.readyState !== 1) return;
    token().then(function (t) {
      if (!t || t === C.tok) return;
      C.tok = t;
      Object.keys(channels).forEach(function (k) { if (channels[k].joined) send({ topic: k, event: "access_token", payload: { access_token: t }, ref: nextRef() }); });
    });
  }
  C.tokTimer = setInterval(tokenCheck, T.token);
  window.addEventListener("storage", function (e) { if (e.key === "floa.session") tokenCheck(); });

  /* back on the network, back to the tab: connect, and every active source loads again quietly. Hidden for 5 minutes: the connection closes */
  function wake() {
    clearTimeout(C.hiddenTimer); C.hiddenTimer = 0;
    var slept = C.asleep; C.asleep = false;
    if (!C.ws) { C.tries = 0; clearTimeout(C.retryTimer); C.retryTimer = 0; connect(); }
    else if (!slept) catchUp();
  }
  function catchUp() { Object.keys(sources).forEach(function (k) { if (sources[k].loaded()) sources[k].refetch(true); }); }
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) return wake();
    clearTimeout(C.hiddenTimer);
    C.hiddenTimer = setTimeout(function () { if (document.hidden && C.ws) { C.asleep = true; down(); } }, T.hidden);
  });

  /* ---------- REST, through FLOA_AUTH.api (the person's token) or the anon key, with the schema header ---------- */
  /* a write this tab announces on the relay socket carries x-floa-live (the database trigger skips it) and its chg goes out after it succeeded */
  function rest(path, opts, schema) {
    opts = opts || {};
    var an = announce(path, opts, schema);
    if (an) opts = assign({}, opts, { headers: assign({}, opts.headers, { "x-floa-live": "1" }) });
    var p = restRaw(path, opts, schema);
    return an ? p.then(function (res) { announced(an, res); return res; }) : p;
  }
  function restRaw(path, opts, schema) {
    var a = auth();
    if (a && a.signedIn() && (schema || "") === (S().schema || "")) return a.api(path, opts);
    return token().then(function (t) {
      var h = { apikey: anon(), authorization: "Bearer " + t };
      if (opts.json !== undefined) h["content-type"] = "application/json";
      if (opts.prefer) h.prefer = opts.prefer;
      if (opts.headers) assign(h, opts.headers);
      if (schema) { h["Accept-Profile"] = schema; h["Content-Profile"] = schema; }
      return fetch(S().url + path, { method: opts.method || "GET", headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
    }).then(function (r) {
      if (!r.ok) { var e = new Error("request failed " + r.status); e.status = r.status; throw e; }
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  function eq(v) { return "eq." + encodeURIComponent(v == null ? "" : String(v)); }
  function inList(keys) { return "in.(" + keys.map(function (k) { return '"' + String(k).replace(/"/g, '\\"') + '"'; }).map(encodeURIComponent).join(",") + ")"; }
  /* one equality per Realtime subscription ("גבולות"): the first key of the filter */
  function rtFilter(f) { var k = f && Object.keys(f)[0]; return k ? k + "=eq." + String(f[k]) : undefined; }
  function matches(f, r) { if (!f) return true; for (var k in f) if (own(f, k) && String(r[k]) !== String(f[k])) return false; return true; }
  function order(spec) {
    var parts = String(spec || "").split(",").filter(Boolean).map(function (p) { var b = p.split("."); return { col: b[0], desc: b[1] === "desc" }; });
    return function (a, b) {
      for (var i = 0; i < parts.length; i++) {
        var c = parts[i].col, x = a[c], y = b[c];
        if (x === y) continue;
        if (x == null) return parts[i].desc ? -1 : 1;
        if (y == null) return parts[i].desc ? 1 : -1;
        var d = x < y ? -1 : 1;
        return parts[i].desc ? -d : d;
      }
      return 0;
    };
  }
  /* the longest run of common keys that kept their order: everything else among them moved */
  function movedKeys(oldKeys, newKeys) {
    var at = {}; oldKeys.forEach(function (k, i) { at[k] = i; });
    var seq = newKeys.filter(function (k) { return own(at, k); }), idx = seq.map(function (k) { return at[k]; });
    var tails = [], prev = new Array(idx.length), tailAt = [];
    for (var i = 0; i < idx.length; i++) {
      var lo = 0, hi = tails.length;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (tails[mid] < idx[i]) lo = mid + 1; else hi = mid; }
      tails[lo] = idx[i]; tailAt[lo] = i; prev[i] = lo ? tailAt[lo - 1] : -1;
    }
    var keep = {}, j = tails.length ? tailAt[tails.length - 1] : -1;
    while (j >= 0) { keep[seq[j]] = true; j = prev[j]; }
    return seq.filter(function (k) { return !keep[k]; });
  }

  /* ---------- sources ---------- */
  var sources = {};
  var srcN = 0;

  function Source(o, id) {
    var self = this;
    var schema = o.schema != null ? o.schema : (S().schema || "");
    var keyOf = o.key || function (r) { return r.id; };
    var keyCol = o.keyCol || "id";
    var map = o.map || function (r) { return r; };
    var cmp = o.order ? order(o.order) : null;
    var joined = !!(o.rpc || /\(/.test(o.select || ""));
    var cols = !o.rpc && o.select && !/[(*:]/.test(o.select) ? o.select.split(",").map(function (s) { return s.trim(); }) : null;
    var isLive = o.live !== false;
    var rows = null, byKey = {}, listeners = [], status = "loading", refs = 1;
    var pending = {}, recent = {}, busyEls = {};
    var loading = null, again = false, dirty = null, dirtyTimer = 0, loadedOnce = false;
    var ch = null, pollTimer = 0;
    /* an app whose data moved to the relay (SUPABASE.relayData): no Supabase Realtime channel; its room is o.room (an open thing) or the app's home room */
    var rel = isLive && (o.table || o.rpc) && relayData(schema) ? { room: rroom(schema, o.room != null && o.room !== "" ? o.room : "home"), at: o.room != null && o.room !== "" ? ++roomAt : 0 } : null;
    var downMark = false, pollOn = false;
    function unpoll() { clearInterval(pollTimer); pollTimer = 0; }

    function k(r) { return String(keyOf(r)); }
    function shape(raw) { var r = raw; if (cols) { r = {}; cols.forEach(function (c) { if (own(raw, c)) r[c] = raw[c]; }); } return map(r); }
    function setStatus(s) { if (s === status) return; status = s; emit([], [], [], [], "sync"); }
    function emit(added, changed, removed, moved, origin) {
      var ev = { rows: rows, added: added, changed: changed, removed: removed, moved: moved, origin: origin, status: status };
      listeners.slice().forEach(function (fn) { try { fn(ev); } catch (e) { setTimeout(function () { throw e; }); } });
    }
    /* the whole list is replaced by next; what did not change keeps its object and gets no event */
    function commit(next, origin) {
      if (cmp) next = next.slice().sort(cmp);
      var old = rows || [], oldMap = byKey, newMap = {}, added = [], changed = [], removed = [];
      next = next.map(function (r) { var key = k(r); var was = oldMap[key]; var keep = was && same(was, r) ? was : r; newMap[key] = keep; return keep; });
      next.forEach(function (r) { var key = k(r), was = oldMap[key]; if (!was) added.push(r); else if (was !== r) changed.push(r); });
      old.forEach(function (r) { if (!own(newMap, k(r))) removed.push(r); });
      var mv = movedKeys(old.map(k), next.map(k)).map(function (key) { return newMap[key]; });
      var first = rows === null;
      rows = next; byKey = newMap;
      if (first || added.length || changed.length || removed.length || mv.length) emit(added, changed, removed, mv, origin);
    }
    /* one row in its place, by key (null: out) */
    function put(key, row, origin) {
      var cur = rows || [], next = [], seen = false;
      for (var i = 0; i < cur.length; i++) {
        if (k(cur[i]) === key) { seen = true; if (row) next.push(row); }
        else next.push(cur[i]);
      }
      if (!seen && row) next.push(row);
      commit(next, origin);
    }
    function url() {
      var q = [];
      if (!o.rpc) q.push("select=" + encodeURIComponent(o.select || "*"));
      if (o.filter) Object.keys(o.filter).forEach(function (c) { q.push(encodeURIComponent(c) + "=" + eq(o.filter[c])); });
      if (o.order) q.push("order=" + encodeURIComponent(o.order));
      return (o.rpc ? "/rest/v1/rpc/" + o.rpc : "/rest/v1/" + o.table) + (q.length ? "?" + q.join("&") : "");
    }
    function fetchRows(extra) {
      var path = url() + (extra ? (url().indexOf("?") < 0 ? "?" : "&") + extra : "");
      return rest(path, o.rpc ? { method: "POST", json: o.args || {} } : {}, schema).then(function (d) { return (Array.isArray(d) ? d : d ? [d] : []).map(shape); });
    }
    /* a fetched row of a key that is being written is held, not shown: the write decides */
    function respectPending(list) {
      var out = [], got = {};
      list.forEach(function (r) { var key = k(r); got[key] = true; if (pending[key]) pending[key].held = r; else out.push(r); });
      Object.keys(pending).forEach(function (key) { if (!got[key]) pending[key].held = null; if (byKey[key]) out.push(byKey[key]); });
      return out;
    }
    function load(origin) {
      if (loading) { again = true; return loading; }
      loading = fetchRows().then(function (list) {
        loading = null; loadedOnce = true;
        commit(respectPending(list), origin);
        setStatus(rel ? (pollOn ? "stale" : "live") : !ch || (!ch.refused && (ch.joined || C.ws)) ? "live" : "stale");
        if (again) { again = false; load("sync"); }
      }, function (e) {
        loading = null;
        if (!loadedOnce) { rows = null; setStatus("failed"); }
        if (e && e.signedOut) return;
        if (again) { again = false; load("sync"); }
      });
      return loading;
    }
    /* a sign: the rows of the keys that changed are asked again (or the whole request), events that come together are one request (300ms) */
    function touch(key) {
      if (dirty !== "all") { if (key == null || joinedNoKey()) dirty = "all"; else { dirty = dirty || {}; dirty[key] = true; } }
      clearTimeout(dirtyTimer);
      dirtyTimer = setTimeout(flush, T.debounce);
    }
    function joinedNoKey() { return !!o.rpc; }
    function flush() {
      var d = dirty; dirty = null;
      if (!d) return;
      var keys = d === "all" ? null : Object.keys(d);
      if (!keys || keys.length > 20) { load("remote"); return; }
      fetchRows(encodeURIComponent(keyCol) + "=" + inList(keys)).then(function (list) {
        var got = {}; list.forEach(function (r) { got[k(r)] = r; });
        var next = (rows || []).slice();
        keys.forEach(function (key) {
          if (pending[key]) { pending[key].held = got[key] || null; return; }
          var i = next.findIndex(function (r) { return k(r) === key; });
          if (got[key]) { if (i >= 0) next[i] = got[key]; else next.push(got[key]); }
          else if (i >= 0) next.splice(i, 1);
        });
        commit(next, "remote");
      }, function () { load("remote"); });
    }
    function onChange(m) {
      var p = m.payload || {}, d = p.data || p;
      var type = d.type || d.eventType, rec = d.record || d.new || {}, old = d.old_record || d.old || {};
      if (!type || (d.schema && schema && d.schema !== schema)) return;
      if (d.table !== o.table || joined) {   /* a joined or rpc source, or a watched table: a sign, then a fetch */
        var w = (o.watch || []).filter(function (x) { return x.table === d.table; })[0];
        var row = type === "DELETE" ? old : rec, wk = null;
        try { wk = w ? (w.key ? w.key(row) : null) : keyOf(row); } catch (e) { wk = null; }
        if (d.table === o.table && type === "DELETE" && wk != null && !pending[String(wk)]) { put(String(wk), null, "remote"); return; }
        touch(wk == null ? null : String(wk));
        return;
      }
      if (type === "DELETE") {
        var dk; try { dk = k(old); } catch (e) { return; }
        if (pending[dk]) { pending[dk].held = null; return; }
        if (!byKey[dk]) return;   /* a key it does not hold: not ours (deletes are not filtered, "צד השרת") */
        put(dk, null, "remote");
        return;
      }
      var r = shape(rec), key = k(r);
      if (pending[key]) { pending[key].held = matches(o.filter, rec) ? r : null; return; }
      if (!matches(o.filter, rec)) { if (byKey[key]) put(key, null, "remote"); return; }
      put(key, r, mine(key, r) ? "local" : "remote");
    }
    /* the echo of my own write, after it finished: it is mine (no change flash) when every column I wrote has the value I wrote */
    function mine(key, r) {
      var w = recent[key];
      if (!w || Date.now() - w.at > T.own) return false;
      for (var c in w.patch) if (own(w.patch, c) && JSON.stringify(r[c]) !== JSON.stringify(w.patch[c])) return false;
      return true;
    }
    function markBusy(key, on) {
      (busyEls[key] || []).forEach(function (el) { if (on) el.setAttribute("aria-busy", "true"); else el.removeAttribute("aria-busy"); });
    }
    function defaultRun(key, patch, cur) {
      if (!o.table) return function () { return Promise.reject(new Error("RosterLive: write on an rpc source needs run")); };
      var where = "?" + encodeURIComponent(keyCol) + "=" + eq(key);
      if (patch === null) return function () { return rest("/rest/v1/" + o.table + where, { method: "DELETE" }, schema); };
      if (!cur) return function () { return rest("/rest/v1/" + o.table, { method: "POST", json: patch, prefer: "return=representation" }, schema); };
      return function () { return rest("/rest/v1/" + o.table + where, { method: "PATCH", json: patch, prefer: "return=representation" }, schema); };
    }

    if (isLive && !rel) {
      var changes = [{ table: o.table || null, filter: o.filter }].concat(o.watch || []).filter(function (x) { return x.table; }).map(function (x) {
        var c = { event: "*", schema: x.schema || schema || "public", table: x.table }, f = rtFilter(x.filter);
        if (f) c.filter = f;
        return c;
      });
      if (changes.length) {
        ch = {
          topic: "realtime:live:" + (schema || "public") + ":" + (o.table || o.rpc) + ":" + (++srcN),
          payload: function (t) { return { config: { broadcast: { ack: false, self: false }, presence: { key: "" }, private: false, postgres_changes: changes }, access_token: t }; },
          onJoin: function () {
            /* the first join after a load, and every join after a drop: what happened meanwhile does not come by Realtime, so a quiet catch-up */
            ch.refused = false; unpoll();
            if (loadedOnce || loading) load("sync");
            if (loadedOnce) setStatus("live");
          },
          /* refused (a phx_reply error, or a system error after an "ok"): nothing will come by Realtime. The source says "stale" and falls back to a quiet
             refetch every T.poll while the tab is seen, and on coming back to the tab (wake). The next connection tries the join again */
          onRefuse: function (why) {
            ch.refused = true;
            if (local()) console.warn("RosterLive: join refused", o.table || o.rpc, why);
            if (loadedOnce) setStatus("stale");
            if (!pollTimer) pollTimer = setInterval(function () { if (!document.hidden && loadedOnce && !loading) load("sync"); }, T.poll);
          },
          onDown: function () { if (loadedOnce) setStatus("stale"); },
          onMessage: function (m) { if (m.event === "postgres_changes") onChange(m); }
        };
      }
    }

    this.id = id;
    this.table = o.table || null; this.schema = schema; this.keyCol = keyCol;   /* for RosterField.live: where a column of a row of this source is written */
    this.rows = function () { return rows; };
    this.get = function (key) { return rows ? byKey[String(key)] : undefined; };
    this.key = function (r) { return k(r); };
    Object.defineProperty(this, "status", { get: function () { return status; } });
    this.on = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; };
    this.refetch = function (quiet) { return load("sync"); };
    this.loaded = function () { return loadedOnce; };
    this.busy = function (key) { return !!pending[String(key)]; };
    this.empty = function () { if (rows) commit([], "sync"); };
    this.watchBusy = function (key, el) { key = String(key); (busyEls[key] = busyEls[key] || []).push(el); if (pending[key]) el.setAttribute("aria-busy", "true"); return function () { busyEls[key] = (busyEls[key] || []).filter(function (x) { return x !== el; }); }; };
    /* an instant write ("כתיבה מיידית"): shown now, sent by run(), the echo held while run runs, reverted on failure; a column, not a row */
    this.write = function (key, patch, run) {
      key = String(key);
      if (window.RosterApp && RosterApp.session && RosterApp.session.state === "expired") {   /* the session ended: nothing is written until the sign-in (a field keeps its change in its queue) */
        var se = new Error("signed out"); se.signedOut = true;
        if (RosterApp.session.failed) RosterApp.session.failed(se);
        return Promise.reject(se);
      }
      var cur = byKey[key], prev = cur ? assign({}, cur) : undefined;
      var next = patch === null ? null : cur ? assign({}, cur, patch) : assign({}, patch);
      var p = pending[key] || (pending[key] = { n: 0, held: NONE });
      p.n++;
      put(key, next, "local");
      markBusy(key, true);
      run = run || defaultRun(key, patch, cur);
      function settle() {
        if (--p.n > 0) return false;
        delete pending[key]; markBusy(key, false);
        return true;
      }
      return Promise.resolve().then(run).then(function (res) {
        var server = Array.isArray(res) ? res[0] : res && typeof res === "object" ? res : undefined;
        if (patch) recent[key] = { patch: patch, at: Date.now() };
        if (settle()) {
          if (p.held !== NONE) put(key, p.held, p.held && mine(key, p.held) ? "local" : "remote");
          else if (server !== undefined && patch !== null) put(key, shape(server), "local");
        }
        return res;
      }, function (err) {
        var back;
        if (!prev) back = null;
        else if (patch === null) back = prev;
        else { back = assign({}, byKey[key] || prev); for (var c in patch) if (own(patch, c)) { if (own(prev, c)) back[c] = prev[c]; else delete back[c]; } }
        var last = settle();
        put(key, back, "local");
        if (last && p.held !== NONE) put(key, p.held, "remote");
        if (err && err.signedOut && !err.liveKept && window.RosterApp && RosterApp.session && RosterApp.session.failed) RosterApp.session.failed(err);   /* the session ended (ui/docs/app-session.md): the kit's sign-in window; a co-edited field's change is already in floa.live.q (liveKept) */
        throw err;
      });
    };
    this.close = function () {
      if (--refs > 0) return;
      delete sources[id];
      listeners = []; clearTimeout(dirtyTimer); unpoll();
      if (ch) shut(ch);
      if (rel) { relaySrc = relaySrc.filter(function (x) { return x !== self; }); unpoll(); relaySync(); }
    };
    this._ref = function () { refs++; return self; };

    /* ---------- the relay's side of a source ("שינויים בנתונים דרך הממסר") ---------- */
    this._relay = rel;
    this._watchOf = function (tb) { return (o.watch || []).filter(function (x) { return x.table === tb; })[0] || null; };
    /* the socket went down: a source loaded by then reloads once after the next ok (the catch-up) */
    this._down = function () { if (loadedOnce || loading) downMark = true; };
    this._catch = function () { if (!downMark) return; downMark = false; if (loadedOnce || loading) load("sync"); };
    /* the relay is down for this source: stale, and a quiet reload every T.poll while the tab is seen; up again: live */
    this._stale = function (on) {
      if (on === pollOn) return;
      pollOn = on; unpoll();
      if (on) { if (loadedOnce) setStatus("stale"); pollTimer = setInterval(function () { if (!document.hidden && loadedOnce && !loading) load("sync"); }, T.poll); }
      else if (loadedOnce) setStatus("live");
    };
    this._seen = function () { if (pollOn && loadedOnce && !loading) load("sync"); };
    /* a chg: a sign, never applied blind. Keys in my key column: those rows reload (a [k, rev] I already hold at that rev or newer is dropped);
       keys in a filter column: the whole source when one of them is mine; a watched table: its keyCol rows, else the whole source; "*": the whole source */
    this._sign = function (m) {
      var all = m.c === "*" || !Array.isArray(m.c);
      if (m.tb === o.table) {
        if (all) return touch(null);
        if (m.kc === keyCol) {
          m.c.forEach(function (e) {
            var key = String(e[0]), row = byKey[key];
            if (m.o !== "d" && e.length > 1 && row && row.rev != null && +row.rev >= e[1] && !pending[key]) return;   /* already there */
            touch(key);
          });
          return;
        }
        if (o.filter && own(o.filter, m.kc)) { if (m.c.some(function (e) { return String(e[0]) === String(o.filter[m.kc]); })) touch(null); return; }
        return touch(null);
      }
      var w = self._watchOf(m.tb);
      if (!w) return;
      if (!all && w.keyCol && m.kc === w.keyCol) { m.c.forEach(function (e) { touch(String(e[0])); }); return; }
      touch(null);
    };

    if (ch) open(ch);
    if (rel) { delete RC.refused[rel.room.key]; relaySrc.push(self); relaySync(); }
    load("sync");
  }

  /* ---------- bind: one text from a source ---------- */
  function bind(el, source, key, fn) {
    var whole = key == null;
    function paint(ev) {
      if (source.rows() === null) return;
      var row = whole ? source.rows() : source.get(key);
      var text = fn(whole ? row : row === undefined ? null : row);
      if (text === undefined) return;   /* fn took care of it (a deleted row: the app decides what happens to the screen) */
      text = text == null ? "" : String(text);
      if (el.textContent === text) return;
      var quiet = !ev || ev.origin === "sync" || ev.origin === "local" || Motion.burst(ev);
      if (quiet) { el.textContent = text; return; }
      if (whole && /^-?\d+$/.test(text) && /^-?\d+$/.test(el.textContent)) Motion.tick(el, text);
      else { el.textContent = text; Motion.change(el); }
    }
    paint(null);
    var off = source.on(paint), unbusy = !whole && source.watchBusy ? source.watchBusy(key, el) : null;
    return function () { off(); if (unbusy) unbusy(); };
  }

  /* ---------- presence: who is where, on a private channel; numbers only, never an email or text ---------- */
  function firstName() { var n = signedIn() ? String(auth().name() || "").trim().split(/\s+/) : []; return { n: n[0] || "", f: n[1] ? n[1].charAt(0) : "" }; }
  /* this tab, for the live text (ui/docs/realtime.md "הקלדה חיה"): a random id that is not a person, and a growing number for each message it sends */
  var TAB = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), tabSeq = 0, TEXT_MAX = 20000;
  function presence(topic, where) {
    /* the transport ("ממסר חי בשרת שלנו"): the relay when the domain set one (SUPABASE.relay), else Supabase broadcast as before, else none */
    var rb = relayBase();
    if (rb) return relayPresence(topic, where, rb, roomOf(topic));
    var me = signedIn() ? auth().userId() : "", nm = firstName();
    var peers = {}, listeners = [], texters = [], seqs = {}, place = null, last = 0, sentAt = "", trail = 0, again = 0, sweep = 0, alive = true;
    var P = { ok: !!me, topic: topic };
    Object.defineProperty(P, "transport", { enumerable: true, get: function () { return ch && P.ok ? "broadcast" : "none"; } });   /* read only, for tests */
    function emit() { var list = P.peers(); listeners.slice().forEach(function (fn) { try { fn(list); } catch (e) { setTimeout(function () { throw e; }); } }); }
    function out(pl, ev) { if (ch && ch.joined) { send({ topic: ch.topic, event: "broadcast", ref: nextRef(), payload: { type: "broadcast", event: ev || "cur", payload: pl } }); return true; } return false; }
    function mine() { return place && place.field != null ? { u: me, n: nm.n, f: nm.f, item: place.item, field: place.field, a: place.a | 0, b: place.b | 0 } : { u: me, n: nm.n, f: nm.f, item: place ? place.item : null, field: null }; }
    function placeKey(pl) { return JSON.stringify([pl.item, pl.field, pl.a | 0, pl.b | 0]); }
    /* a place the live text already carried, a moment ago, is not sent again as a caret */
    function flush() { var pl = mine(), k = placeKey(pl); if (pl.field != null && k === sentAt && Date.now() - last < T.again / 2) return; last = Date.now(); sentAt = k; out(pl); }
    var ch = !me ? null : {
      topic: "realtime:" + topic,
      payload: function (t) { return { config: { broadcast: { ack: false, self: false }, presence: { key: me }, private: true, postgres_changes: [] }, access_token: t }; },
      onJoin: function () { if (place) flush(); },
      /* the private channel needs the RLS on realtime.messages ("צד השרת", 6): refused, the page goes on quietly, with no carets */
      onRefuse: function (why) { P.ok = false; peers = {}; if (local()) console.warn("RosterLive.presence: refused", topic, why); shut(ch); emit(); },
      onDown: function () { peers = {}; emit(); },
      onMessage: function (m) {
        if (m.event !== "broadcast" || !m.payload) return;
        var pl = m.payload.payload || {};
        if (m.payload.event === "txt") { text(pl); return; }
        if (m.payload.event !== "cur") return;
        if (!pl.u || pl.u === me) return;
        if (pl.field == null) delete peers[pl.u];
        else peers[pl.u] = { uid: pl.u, first: String(pl.n || ""), fam: String(pl.f || "").charAt(0), item: pl.item, field: pl.field, a: pl.a | 0, b: pl.b | 0, at: Date.now() };
        emit();
      }
    };
    P.peers = function () {
      var list = Object.keys(peers).map(function (u) { return peers[u]; }), count = {};
      list.forEach(function (p) { count[p.first] = (count[p.first] || 0) + 1; });
      return list.map(function (p) { return assign({}, p, { name: count[p.first] > 1 && p.fam ? p.first + " " + p.fam + "." : p.first }); });
    };
    P.on = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; };
    /* LIVE TEXT (ui/docs/realtime.md "הקלדה חיה"): the words of a co-edited field while they are typed, on this same private channel, before any save.
       P.text({ item, field, v, r, a, b }) sends (false: no channel, refused or offline, and the field just waits for the database);
       P.onText(fn): fn({ uid, first, tab, seq, item, field, v, r, a, b }) for another tab's words, in order: an older or repeated number from a tab is dropped.
       The payload: the person's id, first name and a letter of the family name (as the caret), this tab's random id and number, the place, the value
       (at most TEXT_MAX characters, the caller caps it at the field's own length) and the base rev. Never an email. */
    P.live = function () { return !!(ch && ch.joined && P.ok); };
    P.text = function (pl) {
      if (!P.live() || !pl || typeof pl.v !== "string" || pl.v.length > TEXT_MAX) return false;
      var msg = { u: me, n: nm.n, f: nm.f, s: TAB, q: ++tabSeq, item: pl.item, field: pl.field, v: pl.v, r: pl.r == null ? null : pl.r, a: pl.a | 0, b: pl.b | 0 };
      if (!out(msg, "txt")) return false;
      if (pl.field != null) { place = assign({}, where || {}, place || {}, { item: pl.item, field: pl.field, a: pl.a | 0, b: pl.b | 0 }); last = Date.now(); sentAt = placeKey(place); }   /* the caret went with the words */
      return true;
    };
    P.onText = function (fn) { texters.push(fn); return function () { texters = texters.filter(function (x) { return x !== fn; }); }; };
    function text(pl) {
      if (!pl.u || !pl.s || pl.s === TAB || typeof pl.v !== "string" || pl.v.length > TEXT_MAX || pl.field == null) return;
      var sk = JSON.stringify([pl.s, pl.item, pl.field]), q = +pl.q || 0;
      if (q <= (seqs[sk] || 0)) return;   /* out of order or seen: the newer words already came */
      seqs[sk] = q;
      var t = { uid: pl.u, first: String(pl.n || ""), tab: String(pl.s), seq: q, item: pl.item, field: pl.field, v: pl.v, r: pl.r == null ? null : pl.r, a: pl.a | 0, b: pl.b | 0 };
      texters.slice().forEach(function (fn) { try { fn(t); } catch (e) { setTimeout(function () { throw e; }); } });
      if (pl.u === me) return;   /* my other tab: its words, but no caret of mine */
      peers[pl.u] = { uid: pl.u, first: String(pl.n || ""), fam: String(pl.f || "").charAt(0), item: pl.item, field: pl.field, a: pl.a | 0, b: pl.b | 0, at: Date.now() };
      emit();
    }
    /* my place, at most every 120ms, and held while typing (the words carry it: with LT at 130ms a caret between two words would be one more message);
       standing still in a field is still being there (every 2.5s) */
    var typingAt = 0;
    P._typed = function () { typingAt = Date.now(); };
    P.set = function (pl) {
      place = assign({}, where || {}, pl || {});
      var n = Date.now(), d = n - last, w = n - typingAt < T.typing ? T.typing - (n - typingAt) : 0; clearTimeout(trail);
      if (d >= T.throttle && !w) flush(); else trail = setTimeout(flush, Math.max(T.throttle - d, w));
      clearInterval(again);
      if (place.field != null) again = setInterval(flush, T.again);
    };
    P.clear = function () { clearInterval(again); clearTimeout(trail); if (place) { place = assign({}, place, { field: null }); flush(); } place = null; };
    P.close = function () { if (!alive) return; alive = false; P.clear(); clearInterval(sweep); listeners = []; texters = []; if (ch) shut(ch); };
    P.attach = function (ctl, opts) { return attach(P, ctl, opts || {}); };
    sweep = setInterval(function () {
      var now = Date.now(), gone = false;
      Object.keys(peers).forEach(function (u) { if (now - peers[u].at > T.stale) { delete peers[u]; gone = true; } });
      if (gone) emit();
    }, 1000);
    if (ch) open(ch);
    return P;
  }

  /* ---------- the relay (ui/docs/realtime.md "ממסר חי בשרת שלנו", "שינויים בנתונים דרך הממסר"; worker/LIVE.md) ----------
     ONE WebSocket per tab to <relay>/<app>/<id>, in ONE room: the room of the open thing (a co-edited field attached, or a live source with a room),
     else the app's home room (a live source without a room, of an app in SUPABASE.relayData). A room switch closes and opens; going down to the
     home room or to none waits 10s (a re-render does not close and open). Closed 30s after the tab is hidden. The first message is the token; the
     server stamps who sent what.
     Phase 1, presence and live typing: txt carries one change (a span), a full value only at the start of a typing run and in answer to an rs;
     cur only on a real move, at most every 250ms, never repeated. The interface is the same as the broadcast presence.
     Phase 2, data: a chg is a sign (table, key column, keys, rev), never content; the sources that hold those keys reload them through REST and RLS.
     A kit write announces itself (x-floa-live + a chg on the socket) only when every live source of its table in this tab is in the socket's room;
     otherwise the database announces it (relay-notify.sql). After every ok the sources loaded before the socket went down reload once; while
     the relay is down they poll every T.poll. Phase 3: a relayData source opens no Supabase Realtime channel at all. */
  assign(T, { cur: 250, typing: 200, settle: 4000, rs: 1000, rhidden: 30000, ridle: 10000 });
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function relayBase() {
    if (local()) { try { var o = localStorage.getItem("floa.live.relay"); if (o) return o; } catch (e) { /* no storage */ } }   /* local work on the relay itself */
    return S().relay || "";
  }
  /* an app whose data moved to the relay (phase 2 and 3); without a relay the list is not read, and everything is as before */
  function relayData(schema) { var l = S().relayData; return !!(schema && relayBase() && Array.isArray(l) && l.indexOf(schema) >= 0); }
  /* the presence topic <schema>:<table>:<id> is the room <schema>/<id> */
  function roomOf(topic) { var p = String(topic || "").split(":"); return p.length >= 3 && p[0] && p[p.length - 1] ? { app: p[0], id: p.slice(2).join(":") } : null; }
  function rroom(app, id) { return { app: app, id: String(id), key: app + "/" + id }; }
  /* the one span between the common head and the common tail */
  function span(a, b) {
    var p = 0, s = 0;
    while (p < a.length && p < b.length && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    while (s < a.length - p && s < b.length - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
    return { p: p, d: a.length - p - s, x: b.slice(p, b.length - s) };
  }

  /* the tab's one relay socket */
  var RC = { ws: null, authed: false, room: null, tries: 0, retryTimer: 0, hbTimer: 0, hbWait: 0, idleTimer: 0, hiddenTimer: 0, syncTimer: 0, tok: "", badTok: "", hidden: false, failed: false, refused: {}, q: [] };
  var relayPres = {};   /* room key -> the presence of that room (its handle) */
  var relaySrc = [];    /* the live sources of apps in SUPABASE.relayData */
  var relaySig = [];    /* the room listeners with no source (RosterLive.signal) */
  var roomAt = 0;       /* a growing number: the most recent thing decides the room */

  /* the room this tab should be in now, or null */
  function wantRoom() {
    if (!signedIn() || RC.hidden) return null;
    var best = null, home = null;
    Object.keys(relayPres).forEach(function (k) { var h = relayPres[k]; if (h.users() > 0 && !RC.refused[k] && (!best || h.at > best.at)) best = { room: h.room, at: h.at }; });
    relaySrc.concat(relaySig).forEach(function (s) {
      var r = s._relay; if (RC.refused[r.room.key]) return;
      if (r.room.id === "home") { if (!home) home = r.room; }
      else if (!best || r.at > best.at) best = { room: r.room, at: r.at };
    });
    return best ? best.room : home;
  }
  function relaySync() { if (!RC.syncTimer) RC.syncTimer = setTimeout(relaySyncNow, 0); }
  function relaySyncNow() {
    RC.syncTimer = 0;
    var r = wantRoom(), cur = RC.room;
    relayPoll();
    if (r && cur && r.key === cur.key) { clearTimeout(RC.idleTimer); RC.idleTimer = 0; if (!RC.ws && !RC.retryTimer) rcConnect(); return; }
    var less = !r || (cur && cur.id !== "home" && r.id === "home");
    if (cur && (RC.ws || RC.retryTimer) && less) {   /* down to home or to none: after T.ridle */
      if (!RC.idleTimer) RC.idleTimer = setTimeout(function () { RC.idleTimer = 0; rcSwitch(wantRoom()); }, T.ridle);
      return;
    }
    clearTimeout(RC.idleTimer); RC.idleTimer = 0;
    rcSwitch(r);
  }
  function rcSwitch(r) {
    if (RC.room && (!r || r.key !== RC.room.key)) { clearTimeout(RC.retryTimer); RC.retryTimer = 0; rcDown(1000); RC.tries = 0; }
    RC.room = r;
    if (r && !RC.ws && !RC.retryTimer) rcConnect();
    else relayPoll();
  }
  function rcConnect() {
    var r = RC.room;
    if (RC.ws || !r || !window.WebSocket || !signedIn() || RC.hidden || RC.badTok) return;
    var ws;
    try { ws = new WebSocket(relayBase().replace(/\/+$/, "") + "/" + encodeURIComponent(r.app) + "/" + encodeURIComponent(r.id)); }
    catch (e) { RC.failed = true; relayPoll(); return rcRetry(); }
    RC.ws = ws; RC.authed = false;
    ws.onopen = function () {
      if (RC.ws !== ws) return;
      RC.hbWait = 0; clearInterval(RC.hbTimer); RC.hbTimer = setInterval(rcBeat, T.hb);
      auth().token().then(function (t) {   /* the token is the first message, never in the address */
        if (RC.ws !== ws || ws.readyState !== 1) return;
        RC.tok = t; ws.send(JSON.stringify({ t: "auth", k: t, s: TAB }));
      }, function () { if (RC.ws === ws) rcDown(1000); });
    };
    ws.onmessage = function (e) { if (RC.ws === ws) rcTake(e.data); };
    ws.onclose = function (e) { if (RC.ws === ws) rcDown(e.code); };
    ws.onerror = function () { try { ws.close(); } catch (x) { /* closed */ } };
  }
  /* the socket is gone: no carets of others, P.text false, sources marked for the catch-up, and (by the close code) wait, retry, or stay out */
  function rcDown(code) {
    var ws = RC.ws;
    RC.ws = null; RC.authed = false;
    clearInterval(RC.hbTimer); RC.hbTimer = 0;
    if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; if (ws.readyState < 2) try { ws.close(1000); } catch (x) { /* closed */ } }
    relaySrc.forEach(function (s) { s._down(); });
    Object.keys(relayPres).forEach(function (k) { relayPres[k].down(); });
    if (code === 1000) { relayPoll(); return; }   /* ours: idle, hidden, another room, signed out */
    RC.failed = true;
    if (code === 4001) { RC.badTok = RC.tok || "?"; relayPoll(); return; }   /* again only with a new token (rcToken) */
    if (code === 4003 || code === 4004) {   /* this room is closed to me until it is opened again; the tab may still go to another */
      var r = RC.room;
      if (r) { RC.refused[r.key] = true; if (relayPres[r.key]) relayPres[r.key].refused(); if (local()) console.warn("RosterLive: relay refused", r.key, code); }
      RC.room = null; relayPoll(); relaySync();
      return;
    }
    relayPoll(); rcRetry();
  }
  function rcRetry() {
    if (RC.retryTimer || !RC.room) return;
    var wait = Math.min(T.cap, T.base * Math.pow(2, RC.tries++));
    wait = Math.round(wait * (0.8 + Math.random() * 0.4));
    RC.retryTimer = setTimeout(function () { RC.retryTimer = 0; rcConnect(); }, wait);
  }
  /* ping every 25s, answered by the server without waking the room; two with no answer: dead, closed and opened again */
  function rcBeat() {
    if (!RC.ws || RC.ws.readyState !== 1) return;
    if (RC.hbWait >= 2) { rcDown(1006); return; }
    RC.hbWait++; RC.ws.send("ping");
  }
  function rcSend(m) { if (RC.ws && RC.ws.readyState === 1 && RC.authed) { RC.ws.send(JSON.stringify(m)); return true; } return false; }
  function rcTake(data) {
    RC.hbWait = 0;
    if (data === "pong") return;
    var m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m !== "object" || !RC.room) return;
    var room = RC.room, h = relayPres[room.key];
    if (m.t === "ok") {
      RC.authed = true; RC.tries = 0; RC.failed = false;
      relayPoll();
      relaySrc.forEach(function (s) { s._catch(); });   /* the catch-up: what changed while the socket was down */
      relaySig.forEach(function (s) { if (s._relay.room.key === room.key) s._sync(); });   /* a signal: "sync" once per ok */
      var q = RC.q; RC.q = [];
      q.forEach(function (x) { if (x.room === room.key) rcSend(x.m); });   /* the chg of writes made while it was down (their header already told the database to skip) */
      if (h) h.ok();
      return;
    }
    if (m.t === "reauth") {   /* access was taken away somewhere in this room: the server asks again, now */
      auth().token().then(function (t) { if (RC.ws && RC.ws.readyState === 1) { RC.tok = t; RC.ws.send(JSON.stringify({ t: "auth", k: t, s: TAB })); } }, function () { rcDown(1000); });
      return;
    }
    if (m.t === "chg") {
      relaySrc.forEach(function (s) { if (s._relay.room.app === room.app) s._sign(m); });
      relaySig.forEach(function (s) { if (s._relay.room.key === room.key) s._sign(m); });
      return;
    }
    if (h) h.take(m);
  }
  /* every relay source: stale and polling while the relay is down for it (no ok after a try, its room refused, or signed out); live otherwise */
  function relayPoll() {
    relaySrc.forEach(function (s) { s._stale(!signedIn() || !!RC.refused[s._relay.room.key] || (!RC.authed && RC.failed)); });
    /* a signal is live only while the socket is authed in its own room (the tab may be in another room) */
    relaySig.forEach(function (s) { var k = s._relay.room.key; s._stale(!signedIn() || !!RC.refused[k] || (RC.room && RC.room.key !== k && !RC.idleTimer) || (!RC.authed && RC.failed)); });
  }

  /* ---------- RosterLive.signal: a room member with no source ("רוסטר ואתרים חיצוניים") ----------
     For a page that has not moved to the kit's sources and only wants "something changed". On the tab's one relay socket, same auth,
     heartbeat, backoff, hidden close and reauth. fn({ reason: "chg" | "sync" | "poll", tb, o }): chg coalesced 300ms (the tb and o of the last);
     sync once per ok; poll every `poll` ms (default T.poll, at least 15s) while the relay is down for the room and the tab is seen.
     spread: a random 200 to 1000ms delay and at most one call per 3s (a room many tabs hear). null when the schema is not in
     SUPABASE.relayData or there is no relay: the page keeps its own path. */
  function Signal(schema, id, fn, opts) {
    var self = this, pollMs = Math.max(15000, (opts && opts.poll) || T.poll), spread = !!(opts && opts.spread);
    var status = "live", pollOn = false, pollTimer = 0, chgTimer = 0, last = null, spreadTimer = 0, spreadNext = null, lastCall = 0, closed = false;
    function call(ev) {
      if (closed) return;
      if (!spread) { try { fn(ev); } catch (e) { setTimeout(function () { throw e; }); } return; }
      spreadNext = ev;
      if (spreadTimer) return;
      var wait = Math.max(200 + Math.round(Math.random() * 800), lastCall + 3000 - Date.now());
      spreadTimer = setTimeout(function () {
        spreadTimer = 0; var e2 = spreadNext; spreadNext = null; lastCall = Date.now();
        if (!closed && e2) { try { fn(e2); } catch (e) { setTimeout(function () { throw e; }); } }
      }, wait);
    }
    this._relay = { room: rroom(schema, id), at: ++roomAt };
    this._sync = function () { call({ reason: "sync" }); };
    this._sign = function (m) {
      last = m;
      if (chgTimer) return;
      chgTimer = setTimeout(function () { chgTimer = 0; var x = last; last = null; if (x) call({ reason: "chg", tb: x.tb, o: x.o }); }, T.debounce);
    };
    this._stale = function (on) {
      on = !!on;
      if (on === pollOn) return;
      pollOn = on; status = on ? "stale" : "live";
      clearInterval(pollTimer); pollTimer = 0;
      if (on) pollTimer = setInterval(function () { if (!document.hidden) call({ reason: "poll" }); }, pollMs);
    };
    Object.defineProperty(this, "status", { get: function () { return status; } });
    this.close = function () {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer); clearTimeout(chgTimer); clearTimeout(spreadTimer);
      relaySig = relaySig.filter(function (x) { return x !== self; });
      relaySync();
    };
    delete RC.refused[this._relay.room.key];   /* a room opened again is tried again */
    relaySig.push(self);
    relaySync();
  }
  function signal(schema, id, fn, opts) {
    if (!schema || id == null || id === "" || typeof fn !== "function" || !relayData(schema)) return null;
    return new Signal(schema, String(id), fn, opts);
  }
  /* the token was refreshed: the server checks it again (auth on an authed socket); after a 4001, a new token opens the socket again; signed out: none */
  function rcToken() {
    if (!RC.ws && !RC.badTok && !RC.room) return;
    if (!signedIn()) { clearTimeout(RC.retryTimer); RC.retryTimer = 0; if (RC.ws) rcDown(1000); relayPoll(); return; }
    auth().token().then(function (t) {
      if (!t) return;
      if (RC.badTok && t !== RC.badTok) { RC.badTok = ""; RC.tries = 0; relaySync(); return; }
      if (RC.authed && RC.ws && RC.ws.readyState === 1 && t !== RC.tok) { RC.tok = t; RC.ws.send(JSON.stringify({ t: "auth", k: t, s: TAB })); }
    }, function () { /* signed out: the next check closes it */ });
  }
  /* the tab hidden for 30s: closed (the others get leave); seen again: opened again (auth, ok, the catch-up). Back online: at once */
  document.addEventListener("visibilitychange", function () {
    clearTimeout(RC.hiddenTimer); RC.hiddenTimer = 0;
    if (document.hidden) {
      RC.hiddenTimer = setTimeout(function () { if (!document.hidden) return; RC.hidden = true; clearTimeout(RC.retryTimer); RC.retryTimer = 0; if (RC.ws) rcDown(1000); }, T.rhidden);
      return;
    }
    RC.hidden = false;
    if (!RC.ws) { RC.tries = 0; clearTimeout(RC.retryTimer); RC.retryTimer = 0; }
    relaySrc.forEach(function (s) { s._seen(); });
    relaySync();
  });
  window.addEventListener("online", function () { RC.tries = 0; clearTimeout(RC.retryTimer); RC.retryTimer = 0; relaySync(); });

  /* a kit write (RosterLive.rest) that this tab will announce itself: a write to a table, the relay socket authed, and every live source of that
     table (read or watched) in this tab is in the socket's room. Otherwise the database announces it (it maps a row to every room it belongs to) */
  function announce(path, opts, schema) {
    var method = String(opts.method || "GET").toUpperCase();
    if (method === "GET" || method === "HEAD") return null;
    var mm = /^\/rest\/v1\/([a-z_]+)(\?|$)/.exec(path);
    if (!mm || !RC.authed || !RC.room || !RC.ws || RC.ws.readyState !== 1) return null;
    var sc = schema != null ? schema : (S().schema || "");
    if (RC.room.app !== sc || !relayData(sc)) return null;
    var tb = mm[1], kc = null, any = false, mine = true;
    relaySrc.forEach(function (s) {
      var r = s._relay; if (r.room.app !== sc) return;
      var w = s._watchOf(tb), t = s.table === tb;
      if (!t && !w) return;
      any = true;
      if (r.room.key !== RC.room.key || r.room.id === "home") mine = false;
      if (!kc) kc = t ? s.keyCol : (w.keyCol || null);
    });
    if (!any || !mine) return null;
    return { room: RC.room.key, tb: tb, o: method === "POST" ? "i" : method === "DELETE" ? "d" : "u", kc: kc, path: path };
  }
  /* the write succeeded: its chg, with the rev the server gave back; a key that is not a uuid (an email, a name) is never sent: then "*" */
  function announced(an, res) {
    var rows = Array.isArray(res) ? res : res && typeof res === "object" ? [res] : [], c = [], seen = {}, star = !an.kc;
    if (!star) {
      rows.forEach(function (r) {
        var k = r && r[an.kc]; if (k == null) return; k = String(k);
        if (seen[k]) return; seen[k] = true;
        c.push(Number.isSafeInteger(r.rev) && an.o !== "d" ? [k, r.rev] : [k]);
      });
      if (!rows.length) { var q = new RegExp("[?&]" + an.kc + "=eq\\.([^&]*)").exec(an.path); if (q) c.push([decodeURIComponent(q[1])]); }
      if (!c.length || c.length > 50 || c.some(function (e) { return !UUID.test(e[0]); })) star = true;
    }
    var msg = star ? { t: "chg", tb: an.tb, o: an.o, c: "*" } : { t: "chg", tb: an.tb, o: an.o, kc: an.kc, c: c };
    if (RC.room && RC.room.key === an.room && rcSend(msg)) return;
    RC.q.push({ room: an.room, m: msg });   /* it goes right after the next ok in that room */
    if (RC.q.length > 50) RC.q.shift();
  }

  function relayPresence(topic, where, base, room0) {
    var me = signedIn() ? auth().userId() : "", nm = firstName(), room = room0 ? rroom(room0.app, room0.id) : null;
    var peers = {}, listeners = [], texters = [], place = null, alive = true, users = 0;
    var outS = {}, inS = {}, rsAt = {};   /* what this tab last sent per item and field; what each other tab last built per item and field */
    var curSent = "", curIn = false, curLast = 0, curTrail = 0, typingAt = 0;
    var P = { ok: !!(room && me), topic: topic };
    var H = { room: room, at: 0, users: function () { return alive && P.ok ? users : 0; } };
    function here() { return !!(room && RC.room && RC.room.key === room.key); }
    function wsend(m) { return here() && rcSend(m); }
    Object.defineProperty(P, "transport", { enumerable: true, get: function () { return P.live() ? "relay" : "none"; } });   /* read only, for tests */
    function emit() { var list = P.peers(); listeners.slice().forEach(function (fn) { try { fn(list); } catch (e) { setTimeout(function () { throw e; }); } }); }
    function reset() { var had = Object.keys(peers).length; peers = {}; inS = {}; outS = {}; curSent = ""; curIn = false; return had; }
    H.ok = function () { reset(); emit(); if (place && place.field != null) flushCur(); };   /* back: my caret again, if I am in a field */
    H.down = function () { if (reset()) emit(); };
    H.refused = function () { P.ok = false; if (reset()) emit(); };
    H.take = function (m) {
      if (m.t === "leave") { delete peers[m.u]; Object.keys(inS).forEach(function (k) { if (inS[k].u === m.u) delete inS[k]; }); emit(); return; }
      if (m.t === "txt") return onTxt(m);
      if (m.t === "rs") return onRs(m);
      if (m.t === "cur") {
        if (!m.u || m.u === me) return;
        if (m.f == null) delete peers[m.u];
        else peers[m.u] = { uid: m.u, first: String(m.n || ""), fam: String(m.g || "").charAt(0), item: m.i, field: m.f, a: m.a | 0, b: m.b | 0, at: Date.now() };
        emit();
      }
      /* join: only state, nothing is drawn */
    };
    /* their change, applied to what that tab built last; a gap or an unknown tab: dropped, and one rs (at most one a second per tab) brings the full value */
    function onTxt(m) {
      if (!m.u || !m.s || m.s === TAB || m.f == null) return;
      var sk = JSON.stringify([m.s, m.i, m.f]), st = inS[sk], q = +m.q || 0, v;
      if (st && q <= st.q) return;   /* out of order or seen */
      if (typeof m.v === "string") v = m.v;
      else {
        if (!st || st.q !== m.bq || typeof m.x !== "string" || (m.p | 0) + (m.d | 0) > st.v.length) { ask(m.s, m.i, m.f); return; }
        v = st.v.slice(0, m.p | 0) + m.x + st.v.slice((m.p | 0) + (m.d | 0));
      }
      if (v.length > TEXT_MAX) return;
      inS[sk] = { v: v, q: q, u: m.u };
      var t = { uid: m.u, first: String(m.n || ""), tab: String(m.s), seq: q, item: m.i, field: m.f, v: v, r: m.r == null ? null : m.r, a: m.a | 0, b: m.b | 0 };
      texters.slice().forEach(function (fn) { try { fn(t); } catch (e) { setTimeout(function () { throw e; }); } });
      if (m.u === me) return;   /* my other tab: its words, but no caret of mine */
      peers[m.u] = { uid: m.u, first: String(m.n || ""), fam: String(m.g || "").charAt(0), item: m.i, field: m.f, a: m.a | 0, b: m.b | 0, at: Date.now() };
      emit();
    }
    function ask(tab, i, f) { var n = Date.now(); if (n - (rsAt[tab] || 0) < T.rs) return; rsAt[tab] = n; wsend({ t: "rs", to: tab, i: i, f: f }); }
    /* somebody needs my full value of a field I am typing in (a run younger than SETTLE): sent to the room, and my next change builds on it */
    function onRs(m) {
      var st = outS[JSON.stringify([m.i, m.f])];
      if (!st || Date.now() - st.at > T.settle) return;
      var q = ++tabSeq;
      if (wsend({ t: "txt", q: q, i: m.i, f: m.f, v: st.v, r: st.r, a: st.a, b: st.b })) st.q = q;
    }
    function mine() { return place && place.field != null ? { item: place.item, field: place.field, a: place.a | 0, b: place.b | 0 } : { item: place ? place.item : null, field: null, a: 0, b: 0 }; }
    function placeKey(pl) { return JSON.stringify([pl.item, pl.field, pl.a | 0, pl.b | 0]); }
    /* my caret, only when it really moved; a place the words already carried is not sent again */
    function flushCur() {
      clearTimeout(curTrail); curTrail = 0;
      var pl = mine(), k = placeKey(pl);
      if (k === curSent) return;
      if (pl.field == null && !curIn) { curSent = k; return; }   /* not in a field, and nobody was told I was */
      if (!wsend({ t: "cur", i: pl.item == null ? null : pl.item, f: pl.field, a: pl.a, b: pl.b })) return;
      curSent = k; curIn = pl.field != null; curLast = Date.now();
    }

    P.peers = function () {
      var list = Object.keys(peers).map(function (u) { return peers[u]; }), count = {};
      list.forEach(function (p) { count[p.first] = (count[p.first] || 0) + 1; });
      return list.map(function (p) { return assign({}, p, { name: count[p.first] > 1 && p.fam ? p.first + " " + p.fam + "." : p.first }); });
    };
    P.on = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; };
    P.live = function () { return !!(P.ok && alive && here() && RC.authed && RC.ws && RC.ws.readyState === 1); };
    /* the full value in, one change out (the full value at the start of a run: after SETTLE the others no longer hold my base) */
    P.text = function (pl) {
      if (!P.live() || !pl || typeof pl.v !== "string" || pl.v.length > TEXT_MAX) return false;
      var k = JSON.stringify([pl.item, pl.field]), st = outS[k], now = Date.now(), q = ++tabSeq;
      var r = pl.r == null ? null : pl.r, a = pl.a | 0, b = pl.b | 0, msg;
      if (st && now - st.at < T.settle) { var d = span(st.v, pl.v); msg = { t: "txt", q: q, bq: st.q, i: pl.item, f: pl.field, p: d.p, d: d.d, x: d.x, r: r, a: a, b: b }; }
      else msg = { t: "txt", q: q, i: pl.item, f: pl.field, v: pl.v, r: r, a: a, b: b };
      if (!wsend(msg)) return false;
      outS[k] = { v: pl.v, q: q, at: now, r: r, a: a, b: b };
      if (pl.field != null) { place = assign({}, where || {}, place || {}, { item: pl.item, field: pl.field, a: a, b: b }); curSent = placeKey(place); curIn = true; curLast = now; }   /* the caret went with the words */
      return true;
    };
    P.onText = function (fn) { texters.push(fn); return function () { texters = texters.filter(function (x) { return x !== fn; }); }; };
    P._typed = function () { typingAt = Date.now(); };
    /* my place: at most every 250ms, and while typing not at all (the words carry it) */
    P.set = function (pl) {
      place = assign({}, where || {}, pl || {});
      clearTimeout(curTrail); curTrail = 0;
      var n = Date.now(), wait = Math.max(0, T.cur - (n - curLast));
      if (n - typingAt < T.typing) wait = Math.max(wait, T.typing - (n - typingAt));
      if (wait) curTrail = setTimeout(flushCur, wait); else flushCur();
    };
    P.clear = function () { clearTimeout(curTrail); curTrail = 0; if (place) { place = assign({}, place, { field: null }); flushCur(); } place = null; };
    /* the room is wanted while a co-edited field is on screen; the last one leaving lets it go after 10s */
    P.attach = function (ctl, opts) {
      users++; H.at = ++roomAt;
      relaySync();
      var off = attach(P, ctl, opts || {}), done = false;
      return function () { if (done) return; done = true; off(); users = Math.max(0, users - 1); relaySync(); };
    };
    P.close = function () {
      if (!alive) return;
      P.clear(); alive = false; listeners = []; texters = []; users = 0;
      if (room && relayPres[room.key] === H) delete relayPres[room.key];
      relaySync();
    };
    if (room && me) { delete RC.refused[room.key]; relayPres[room.key] = H; }   /* a room opened again is tried again */
    return P;
  }

  /* places in a field are counted in characters of the saved text. The default count for a rich field: text, with <br> and a new block as "\n";
     the kit's rich format (RosterField.live) passes its own index and point */
  function plainIndex(root, node, off) {
    var n = 0, done = false;
    (function walk(el) {
      for (var c = el.firstChild; c && !done; c = c.nextSibling) {
        if (c === node && c.nodeType === 3) { n += off; done = true; return; }
        if (c.nodeType === 3) n += c.nodeValue.length;
        else if (c.nodeName === "BR") n += 1;
        else { if (c !== el.firstChild && /^(DIV|P|LI)$/.test(c.nodeName)) n += 1; walk(c); }
      }
    })(root);
    if (!done && node === root) { n = 0; for (var i = 0; i < off; i++) { var c = root.childNodes[i]; n += c.nodeType === 3 ? c.nodeValue.length : c.nodeName === "BR" ? 1 : (c.textContent || "").length; } }
    return n;
  }
  function plainPoint(root, at) {
    var left = at, found = null;
    (function walk(el) {
      for (var c = el.firstChild; c && !found; c = c.nextSibling) {
        if (c.nodeType === 3) { if (left <= c.nodeValue.length) { found = [c, left]; return; } left -= c.nodeValue.length; }
        else if (c.nodeName === "BR") { if (left === 0) { found = [el, [].indexOf.call(el.childNodes, c)]; return; } left -= 1; }
        else { if (c !== el.firstChild && /^(DIV|P|LI)$/.test(c.nodeName)) left -= 1; walk(c); }
      }
    })(root);
    return found || [root, root.childNodes.length];
  }
  function isText(ctl) { return ctl.nodeName === "TEXTAREA" || ctl.nodeName === "INPUT"; }
  function selOf(ctl, opts) {
    if (isText(ctl)) return { a: ctl.selectionStart | 0, b: ctl.selectionEnd | 0 };
    var s = window.getSelection();
    if (!s || !s.rangeCount || !ctl.contains(s.anchorNode)) return null;
    var idx = opts.index || plainIndex;
    return { a: idx(ctl, s.anchorNode, s.anchorOffset), b: idx(ctl, s.focusNode, s.focusOffset) };
  }

  function attach(P, ctl, opts) {
    var on = true;
    function mineNow() { if (document.activeElement !== ctl) return; var s = selOf(ctl, opts); if (s) P.set({ item: opts.item, field: opts.field, a: s.a, b: s.b }); }
    function blur() { P.set({ item: opts.item, field: null }); }
    function typed() { if (P._typed) P._typed(); mineNow(); }   /* the relay: while typing, the words carry the caret (no separate cur) */
    function paint() { if (on) carets(ctl, P.peers().filter(function (p) { return p.item === opts.item && p.field === opts.field; }), opts); }
    ctl.addEventListener("focus", mineNow); ctl.addEventListener("blur", blur); ctl.addEventListener("input", typed); ctl.addEventListener("keyup", mineNow); ctl.addEventListener("pointerup", mineNow);
    ctl.addEventListener("scroll", paint);
    document.addEventListener("selectionchange", mineNow);
    var off = P.on(paint);
    paint();
    return function () {
      on = false; off();
      ctl.removeEventListener("focus", mineNow); ctl.removeEventListener("blur", blur); ctl.removeEventListener("input", typed); ctl.removeEventListener("keyup", mineNow); ctl.removeEventListener("pointerup", mineNow);
      ctl.removeEventListener("scroll", paint); document.removeEventListener("selectionchange", mineNow);
      carets(ctl, [], opts);
    };
  }

  /* the others' carets over a field (.rpeer, a layer that takes no tap): a caret with the first name, and the selection as a tint.
     Geometry only goes through custom properties, measured from the inline start (no physical side). */
  function px(n) { return Math.round(n * 100) / 100 + "px"; }
  function carets(ctl, list, opts) {
    var host = ctl.parentElement; if (!host) return;
    var layer = null;
    for (var c = host.firstElementChild; c; c = c.nextElementSibling) if (c.classList.contains("rpeer-layer") && c.__rpeerFor === ctl) layer = c;
    if (!list.length) { if (layer) layer.remove(); return; }
    if (!layer) { layer = document.createElement("div"); layer.className = "rpeer-layer"; layer.setAttribute("aria-hidden", "true"); layer.__rpeerFor = ctl; host.appendChild(layer); }
    layer.textContent = "";
    var cs = getComputedStyle(ctl), rtl = cs.direction === "rtl";
    var hr = host.getBoundingClientRect(), cr = ctl.getBoundingClientRect();
    var bs = parseFloat(cs.borderBlockStartWidth) || 0, bi = parseFloat(cs.borderInlineStartWidth) || 0, be = parseFloat(cs.borderInlineEndWidth) || 0;
    var hcs = getComputedStyle(host), hostRtl = hcs.direction === "rtl", hbs = parseFloat(hcs.borderBlockStartWidth) || 0, hbi = parseFloat(hcs.borderInlineStartWidth) || 0;
    /* the layer sits on the control's padding box */
    var startX = (hostRtl ? (hr.x + hr.width) - (cr.x + cr.width) + (rtl ? bi : be) : cr.x - hr.x + (rtl ? be : bi)) - hbi;
    layer.style.setProperty("--rpeer-tx", px(startX));
    layer.style.setProperty("--rpeer-ty", px(cr.y - hr.y + bs - hbs));
    layer.style.setProperty("--rpeer-tw", px(ctl.clientWidth));
    layer.style.setProperty("--rpeer-th", px(ctl.clientHeight));
    var base = layer.getBoundingClientRect(), mirror = null, root = ctl, point = opts.point || plainPoint;
    if (isText(ctl)) {   /* a textarea or input has no ranges: a hidden copy of its text in the same letters and width */
      mirror = document.createElement("div"); mirror.className = "rpeer-mirror";
      mirror.setAttribute("data-kind", ctl.nodeName === "INPUT" ? "line" : "lines");
      mirror.style.setProperty("--rpeer-font", cs.font);
      mirror.style.setProperty("--rpeer-ls", cs.letterSpacing);
      mirror.style.setProperty("--rpeer-pad", cs.paddingBlockStart + " " + cs.paddingInlineEnd + " " + cs.paddingBlockEnd + " " + cs.paddingInlineStart);
      mirror.style.setProperty("--rpeer-sy", px(ctl.scrollTop));
      mirror.dir = rtl ? "rtl" : "ltr";
      mirror.textContent = ctl.value + "​";
      layer.appendChild(mirror);
      root = mirror; point = function (r, n) { return [r.firstChild, Math.min(n, r.firstChild.nodeValue.length - 1)]; };
    }
    var lrtl = getComputedStyle(layer).direction === "rtl";
    function startOf(x, w) { return lrtl ? (base.x + base.width) - (x + w) : x - base.x; }
    var len = isText(ctl) ? ctl.value.length : Infinity;
    list.forEach(function (p) {
      var a = Math.min(p.a, len), b = Math.min(p.b, len), lo = Math.min(a, b), hi = Math.max(a, b);
      try {
        if (lo !== hi) {
          var p1 = point(root, lo), p2 = point(root, hi), rg = document.createRange();
          rg.setStart(p1[0], p1[1]); rg.setEnd(p2[0], p2[1]);
          [].forEach.call(rg.getClientRects(), function (r) {
            if (!r.width) return;
            var s = document.createElement("span"); s.className = "rpeer-sel";
            s.style.setProperty("--rpeer-x", px(startOf(r.x, r.width))); s.style.setProperty("--rpeer-y", px(r.y - base.y));
            s.style.setProperty("--rpeer-w", px(r.width)); s.style.setProperty("--rpeer-h", px(r.height));
            layer.appendChild(s);
          });
        }
        var pc = point(root, b), rc = document.createRange(); rc.setStart(pc[0], pc[1]); rc.collapse(true);
        var r = rc.getClientRects()[0] || rc.getBoundingClientRect();
        if (!r || (!r.height && !r.x)) r = { x: rtl ? base.x + base.width : base.x, y: base.y, height: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 };
        var y = r.y - base.y;
        if (y + r.height < 0 || y > base.height) return;   /* scrolled out of the field */
        var k = document.createElement("span"); k.className = "rpeer";
        k.style.setProperty("--rpeer-x", px(startOf(r.x, 0))); k.style.setProperty("--rpeer-y", px(y)); k.style.setProperty("--rpeer-h", px(r.height));
        var nm = document.createElement("span"); nm.className = "rpeer__name"; nm.textContent = p.name || p.first || "";
        k.appendChild(nm);
        layer.appendChild(k);
      } catch (e) { /* a place that is no longer in the text: no caret this time */ }
    });
    if (mirror) mirror.remove();
  }

  /* ---------- RosterMotion: the effects (ui/docs/realtime.md "אפקטים") ---------- */
  var RM = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  function reduced() { return !!(RM && RM.matches); }
  function seen(el) {
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    return visible(r);
  }
  function visible(r) { return (r.width > 0 || r.height > 0) && r.y < innerHeight && r.y + r.height > 0 && r.x < innerWidth && r.x + r.width > 0; }
  function ms(v) { v = String(v || "0s").split(",")[0].trim(); return v.indexOf("ms") > 0 ? parseFloat(v) : parseFloat(v) * 1000; }
  function mark(el, kind) {
    if (!el || !el.isConnected) return Promise.resolve();
    if (kind !== "change" && reduced()) return Promise.resolve();
    if (!seen(el)) return Promise.resolve();
    el.removeAttribute("data-rfx");
    void el.offsetWidth;   /* the same effect again starts again */
    el.setAttribute("data-rfx", kind);
    var cs = kind === "change" ? getComputedStyle(el, "::after") : getComputedStyle(el);
    var dur = ms(cs.animationDuration) + ms(cs.animationDelay);
    return new Promise(function (res) {
      var timer = 0;
      function end(e) { if (e && e.target !== el) return; finish(); }
      function finish() { clearTimeout(timer); el.removeEventListener("animationend", end); if (el.getAttribute("data-rfx") === kind) el.removeAttribute("data-rfx"); res(); }
      el.addEventListener("animationend", end);
      timer = setTimeout(finish, dur + 150);
    });
  }
  function burst(ev) {
    if (!ev) return true;
    if (ev.origin === "sync") return true;
    return ((ev.added || []).length + (ev.changed || []).length + (ev.removed || []).length + (ev.moved || []).length) > 5;
  }
  /* measure, change, measure again, and slide each element from where it was (transform only); new ones come in, opts.out fade first */
  function flip(container, mutate, opts) {
    opts = opts || {};
    if (opts.burst || reduced() || !container) { mutate(); return Promise.resolve(); }
    var outs = (opts.out || []).filter(function (el) { return el && el.isConnected && container.contains(el); });
    outs.forEach(function (el) { el.inert = true; });
    /* nothing leaving: the change is written now, in this task (an instant write shows before the next paint, never a frame later) */
    return outs.length ? Promise.all(outs.map(function (el) { return mark(el, "out"); })).then(slide) : slide();
    function slide() {
      var before = new Map();
      [].forEach.call(container.children, function (el) { before.set(el, el.getBoundingClientRect()); });
      mutate();
      var kids = [].slice.call(container.children), moved = [], added = [];
      kids.forEach(function (el) { var f = el.getAttribute("data-rfx"); if (f === "from" || f === "move") el.removeAttribute("data-rfx"); });
      kids.forEach(function (el) {
        var b = before.get(el);
        if (!b) { added.push(el); return; }
        var a = el.getBoundingClientRect(), dx = b.x - a.x, dy = b.y - a.y;
        if ((Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) && (visible(a) || visible(b))) moved.push([el, dx, dy]);
      });
      moved.forEach(function (m) { m[0].style.setProperty("--rfx-dx", px(m[1])); m[0].style.setProperty("--rfx-dy", px(m[2])); m[0].setAttribute("data-rfx", "from"); });
      void container.offsetWidth;
      var runs = moved.map(function (m) {
        var el = m[0];
        el.setAttribute("data-rfx", "move");
        var dur = ms(getComputedStyle(el).transitionDuration);
        return new Promise(function (res) {
          var timer = 0;
          function end(e) { if (e.target === el && e.propertyName === "transform") finish(); }
          function finish() { clearTimeout(timer); el.removeEventListener("transitionend", end); if (el.getAttribute("data-rfx") === "move") el.removeAttribute("data-rfx"); el.style.removeProperty("--rfx-dx"); el.style.removeProperty("--rfx-dy"); res(); }
          el.addEventListener("transitionend", end);
          timer = setTimeout(finish, dur + 150);
        });
      });
      return Promise.all(runs.concat(added.map(function (el) { return mark(el, "in"); })));
    }
  }
  /* a count rolls: the old leaves upward, the new comes in from below */
  function tick(el, text) {
    if (reduced() || !seen(el)) { el.textContent = text; return Promise.resolve(); }
    return mark(el, "tick-out").then(function () { el.textContent = text; return mark(el, "tick"); });
  }
  var Motion = { flip: flip, mark: mark, change: function (el) { return mark(el, "change"); }, tick: tick, burst: burst, reduced: reduced };

  window.RosterMotion = Motion;
  window.RosterLive = {
    source: function (o) {
      o = o || {};
      var schema = o.schema != null ? o.schema : (S().schema || "");
      var id = JSON.stringify([schema, o.table || "", o.rpc || "", o.args || null, o.select || "*", o.filter || null, o.order || "", o.live === false]);
      if (sources[id]) return sources[id]._ref();
      return (sources[id] = new Source(o, id));
    },
    bind: bind,
    presence: presence,
    signal: signal,   /* a room listener with no source: null when the schema is not in SUPABASE.relayData or there is no relay */
    rest: rest,   /* REST as the person (or anon), with the schema header: RosterField.live's conditional save and the queue */
    carets: carets,
    get state() { return html.getAttribute("data-live") || "off"; },
    /* a test page only: shorter timers, and the socket for a look */
    _tune: function (t) { assign(T, t); clearInterval(C.tokTimer); C.tokTimer = setInterval(tokenCheck, T.token); },
    _socket: function () { return C.ws; }
  };
})();
