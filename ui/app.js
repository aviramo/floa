/* THE APP'S STATE (ui/, the domain's UI library), served as /app.js, loaded after the kit's other scripts and before the app's own.
   Defined in ui/docs/app-version.md, app-offline.md, app-session.md and app-denied.md (owner 2026-11-26). Only the states: the app skeleton
   (panes, history) is not here yet. Loading it is enough: the app writes nothing for the version, the connection or the session.

   THE STATUS SLOT: the round app menu button (RosterAppMenu, /menu.js) shows the whole app's state. Precedence: no connection (the offline
   symbol), then a download to the device (RosterApp.sync: a thin ring around the letter), then the letter, with a dot when a new version waits.

   THE NOTICE (owner 2026-11-26: it replaces the toast as a visual form): every pop-up word of the kit is a SHORT WINDOW anchored to the round
   button, at every width (RosterSheet.confirm, placed by RosterLayout.place). One at a time, in order. Closing it is the dismissal.
     RosterApp.notice(text, { kind: "error" | "info", text (a sentence under it, or a function returning one), action: { text, run } (run returns a
       promise: the button waits on it), stay (info that never closes by itself), onClose(acted) })
     An error opens at once, unless the person is typing: then it waits for the quiet moment. Info waits for the quiet moment, and info with no
     action closes itself after T.info (8 seconds) unless the pointer is on it. An error stays until it is closed.

   THE QUIET MOMENT (RosterApp.quiet(fn)): no focus in a field, no format bubble, no short window with fields or long window with a change, no
   write on the way (a field saving, a button waiting), no drag, no open menu, the tab shown and the round button on the screen; all of them
   for T.quiet (2 seconds) in a row. fn may return false: not now, it is asked again.

   RosterApp.version  { state "current" | "ready", apply(), on(fn) }  a worker that waits (or version.txt that differs from <meta name="floa-build">)
   RosterApp.net      { state "on" | "off", check(), on(fn), need(selector), queue }  html[data-net]; [data-rnet] controls off in place
   RosterApp.session  { state "in" | "expired" | "out", signIn(), on(fn), keep(req) }  html[data-auth="out"]; the window; the place kept
   RosterApp.denied(kind, o)  the signin / denied / missing screen; .html(kind, o) and .wire(root, o) for an app that draws its own panes
   RosterApp.gone(what, back)  the open item went away: back() and the notice "<what> כבר לא זמין"
   RosterApp.sync(state, text)  "run" | "done" | "stop" | "": the device download on the round button; sync({ state, done, total, text }) fills its ring */
(function () {
  "use strict";
  var html = document.documentElement;
  var T = { quiet: 2000, every: 30 * 60 * 1000, live: 5000, health: 5000, done: 3000, info: 8000, keep: 30 * 864e5, restore: 15 * 60 * 1000, first: 3000 };
  var RESTORE = "floa.app.restore", QUEUE = "floa.app.q";
  var App = window.RosterApp = window.RosterApp || {};
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function noop() {}
  function A() { return window.FLOA_AUTH || null; }
  function signedIn() { var a = A(); return !!(a && a.signedIn()); }
  function menu(patch) { if (window.RosterAppMenu && RosterAppMenu.status) RosterAppMenu.status(patch); }
  function fire(list, v) { list.slice().forEach(function (f) { try { f(v); } catch (e) { console.error(e); } }); }
  /* the app's base address: the <base> it writes, else the folder of the page (where Google sends the person back: it is in the Redirect URLs) */
  function base() { return App.base || (document.querySelector("base[href]") ? document.baseURI : location.origin + location.pathname.replace(/[^/]*$/, "")); }

  /* ONE polite announcement region per page, never seen: the list's (.rlist-live, made by ui/list.js at its first move) when there is one. Until then the app
     speaks in one of its own, which it takes out once it has spoken (3s), so the list's stays the only region of the page; the app then speaks in the list's. */
  var region = null, mine = false, drop = 0;
  function say(text) {
    if (!document.body) return;
    var other = [].filter.call(document.querySelectorAll(".rlist-live"), function (e) { return !(mine && e === region); })[0];
    if (other) { if (mine && region) region.remove(); region = other; mine = false; clearTimeout(drop); }
    else if (!region || !region.isConnected) { region = document.createElement("div"); region.className = "rlist-live"; region.setAttribute("role", "status"); region.setAttribute("aria-live", "polite"); region.setAttribute("aria-atomic", "true"); document.body.appendChild(region); mine = true; }
    var r = region; r.textContent = ""; setTimeout(function () { r.textContent = text; }, 50);
    if (mine) { clearTimeout(drop); drop = setTimeout(function () { if (mine && region === r) { r.remove(); region = null; mine = false; } }, 3000); }
  }

  /* ---------- the quiet moment ---------- */
  function typing() {
    var a = document.activeElement;
    return !!(a && a !== document.body && (a.isContentEditable || (a.matches && a.matches("input:not([type=button], [type=submit], [type=checkbox], [type=radio], [type=range]), textarea, select, .rf-rich"))));
  }
  function writing() { return !!document.querySelector('[data-save="pending"], .rbtn[aria-busy="true"]:not(dialog[data-rapp-win] *)'); }
  function busy() {
    if (document.hidden || typing() || writing()) return true;
    if (document.querySelector(".rfmt:not([hidden])")) return true;   /* a format bubble is open */
    if (document.querySelector("dialog[open].confirm:not([data-rapp-win]) .rfields")) return true;   /* a short window with fields */
    if (document.querySelector("dialog[open] .sheet-head > .rs-act:not(:disabled)")) return true;   /* a long form with a change */
    if (document.querySelector("dialog[open][data-rapp-win]")) return true;   /* one window of ours at a time */
    if (document.querySelector("[data-rsort-held], .rs-dragging") || html.classList.contains("split-drag")) return true;   /* a drag */
    if (window.RosterMenu && RosterMenu.current()) return true;
    return false;
  }
  var waiters = [], since = 0, qTimer = 0;
  function quiet(fn) { waiters.push(fn); tick(); }
  function tick() {
    clearTimeout(qTimer);
    if (!waiters.length) return;
    if (busy()) since = 0; else if (!since) since = Date.now();
    if (since && Date.now() - since >= T.quiet) {
      var w = waiters.shift(), r;
      try { r = w(); } catch (e) { console.error(e); }
      if (r === false) waiters.push(w);
    }
    if (waiters.length) qTimer = setTimeout(tick, 400);
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden) tick(); });
  App.quiet = quiet;

  /* ---------- the notice: a short window anchored to the round button ---------- */
  /* WHERE IT STANDS (owner 2026-11-26, option א): at the round button when it is on the screen and nothing covers it; on a phone, when a window covers
     it (or this screen has none), at the TOP open window's header, beside its title. Picked at opening and again whenever a window opens or closes. */
  function wide() { return window.RosterSheet && RosterSheet.WIDE ? matchMedia("(min-width: " + RosterSheet.WIDE + "px)").matches : innerWidth >= 760; }
  function topWin() { return [].filter.call(document.querySelectorAll("dialog[open]:not([data-rapp-win]), .rpanel-box .rpanel"), function (d) { return d.getClientRects().length; }).pop() || null; }
  function anchorEl() {
    var btn = window.RosterAppMenu && RosterAppMenu.button ? RosterAppMenu.button() : null, top = topWin();
    if (btn && (wide() || !top || top.contains(btn))) return btn;
    if (!top) return btn;
    return top.querySelector(".rhead__title") || top.querySelector(".rhead, .rlayout__head, .sheet-head") || top;   /* its title; a header of the app's own (the exercise strip) is the surface's head slot */
  }
  function win(o) {
    var btn = anchorEl();
    if (!btn || !window.RosterSheet || !RosterSheet.confirm) return null;
    var acted = false;
    var text = typeof o.text === "function" ? o.text() : o.text;
    var dlg = RosterSheet.confirm({ id: "rappWin", title: esc(o.title), text: text ? esc(text) : "", action: o.action ? esc(o.action.text) : undefined, anchor: btn,
      submit: o.action ? function () { acted = true; return o.action.run(); } : undefined });
    dlg.setAttribute("data-rapp-win", "");
    if (o.kind) dlg.setAttribute("data-kind", o.kind);
    var mine = !dlg.hasAttribute("data-anchored");   /* a phone: the kit's short window would be a bottom sheet; ours stands at its anchor at every width */
    dlg.setAttribute("data-anchored", "");
    var go = function () { if (!dlg.open) return; var a = anchorEl(); if (a && a.isConnected) { btn = a; RosterLayout.place(dlg, a, { none: "beside" }); } };
    if (mine) go();
    window.addEventListener("resize", go);
    var layers = new MutationObserver(function (ms) { if (ms.some(function (m) { return m.target !== dlg && !dlg.contains(m.target); })) requestAnimationFrame(go); });   /* a window opened or closed over or under it: anchored again to the new top */
    layers.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    dlg.addEventListener("close", function () { layers.disconnect(); window.removeEventListener("resize", go); if (mine) { dlg.removeAttribute("data-anchored"); RosterLayout.unplace(dlg); } }, { once: true });
    dlg.addEventListener("close", function () { dlg.removeAttribute("data-rapp-win"); dlg.removeAttribute("data-kind"); if (o.onClose) o.onClose(acted); }, { once: true });
    return dlg;
  }
  var notices = [], showing = false, waiting = false;
  function notice(title, o) { o = o || {}; notices.push({ title: String(title || ""), o: o }); pump(); }
  function pump() {
    if (showing || waiting || !notices.length) return;
    var n = notices[0];
    var go = function () {
      if (showing) return false;
      var dlg = win({ title: n.title, text: n.o.text, kind: n.o.kind || "info", action: n.o.action, onClose: function (acted) { showing = false; if (n.o.onClose) n.o.onClose(acted); setTimeout(pump, 0); } });
      if (!dlg) return false;
      notices.shift(); showing = true; waiting = false;
      if (n.o.kind !== "error" && !n.o.action && !n.o.stay) {   /* info closes itself after a calm reading time, never under the pointer */
        var close = function () { if (!dlg.open || !dlg.hasAttribute("data-rapp-win")) return; if (dlg.matches(":hover")) { setTimeout(close, 2000); return; } dlg.close(); };
        setTimeout(close, T.info);
      }
      return true;
    };
    waiting = true;
    if ((n.o.kind === "error" || n.o.now) && !typing() && !document.hidden && go()) return;
    quiet(go);
  }
  App.notice = notice;

  /* ---------- no connection ---------- */
  var net = { state: navigator.onLine === false ? "off" : "on", fns: [], need: [], checking: null, liveT: 0 };
  function line() { return net.state === "off" ? "אין חיבור. מה שעל המסך זמין" + (App.net.queue ? ", ושינויים יישמרו כשהחיבור יחזור." : ".") : ""; }
  function setNet(s) {
    html.setAttribute("data-net", s);
    if (net.state === s) return;
    net.state = s;
    menu({ net: s, line: line() }); needs();
    say(s === "off" ? "אין חיבור" : "החיבור חזר");
    if (s === "on") { flush(); if (version.pend) version.check(); }
    fire(net.fns, s);
  }
  function health() {
    var S = window.SUPABASE;
    if (!S || !window.fetch) return Promise.resolve(navigator.onLine !== false);
    return new Promise(function (res) {
      var t = setTimeout(function () { res(false); }, T.health);
      fetch(S.url + "/auth/v1/health", { headers: { apikey: S.anonKey }, cache: "no-store" }).then(function (r) { clearTimeout(t); res(r.status < 500); }, function () { clearTimeout(t); res(false); });
    });
  }
  function check() {
    if (net.checking) return net.checking;
    net.checking = health().then(function (ok) { net.checking = null; setNet(ok ? "on" : "off"); return net.state; });
    return net.checking;
  }
  window.addEventListener("offline", function () { setNet("off"); });
  window.addEventListener("online", function () { check(); });   /* the browser's word alone is not enough: the server must answer */
  document.addEventListener("visibilitychange", function () { if (!document.hidden && net.state === "off") check(); });
  new MutationObserver(function () {   /* the live layer (/live.js, data-live): on is an answer; off or connecting for T.live, and a short check that fails, is no connection */
    var l = html.getAttribute("data-live"); clearTimeout(net.liveT);
    if (l === "on") setNet("on");
    else if (l === "off" || l === "connecting") net.liveT = setTimeout(function () { if (!document.hidden && html.getAttribute("data-live") !== "on") check(); }, T.live);
  }).observe(html, { attributes: true, attributeFilter: ["data-live"] });

  /* the controls that need the server: off IN PLACE (aria-disabled, the kit's disabled look), with the reason as their title; a press does nothing */
  function why() { return net.state === "off" ? "אין חיבור" : html.getAttribute("data-auth") === "out" ? "צריך להיכנס" : ""; }
  function sel() { return ["[data-rnet]"].concat(net.need).join(", "); }
  var needsRaf = 0;
  function needs() {
    var w = why();
    [].forEach.call(document.querySelectorAll(sel() + ", [data-rnet-was]"), function (el) {
      if (w && el.matches(sel())) {
        if (!el.hasAttribute("data-rnet-was")) el.setAttribute("data-rnet-was", JSON.stringify([el.getAttribute("aria-disabled"), el.getAttribute("title")]));
        el.setAttribute("aria-disabled", "true"); el.setAttribute("title", w);
      } else if (el.hasAttribute("data-rnet-was")) {
        var was = []; try { was = JSON.parse(el.getAttribute("data-rnet-was")); } catch (e) { /* none */ }
        el.removeAttribute("data-rnet-was");
        if (was[0] == null) el.removeAttribute("aria-disabled"); else el.setAttribute("aria-disabled", was[0]);
        if (was[1] == null) el.removeAttribute("title"); else el.setAttribute("title", was[1]);
      }
    });
  }
  function blocked(t) { return why() && t && t.closest ? t.closest(sel()) : null; }
  document.addEventListener("click", function (e) { if (blocked(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && blocked(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  function watchNeeds() { new MutationObserver(function () { if (!why() || needsRaf) return; needsRaf = requestAnimationFrame(function () { needsRaf = 0; needs(); }); }).observe(document.body, { childList: true, subtree: true }); }
  if (document.body) watchNeeds(); else document.addEventListener("DOMContentLoaded", watchNeeds);
  App.net = {
    get state() { return net.state; },
    check: check,
    on: function (fn) { net.fns.push(fn); },
    need: function (s) { if (s && net.need.indexOf(s) < 0) net.need.push(s); needs(); },
    queue: false   /* true: the app's co-edited fields wait for the connection, and the menu's line says so */
  };
  html.setAttribute("data-net", net.state);

  /* ---------- the session ---------- */
  var ses = { state: signedIn() ? "in" : "out", sub: signedIn() ? A().userId() : "", fns: [], asked: false };
  function setSes(s) { if (ses.state === s) return; ses.state = s; if (s === "in") html.removeAttribute("data-auth"); else html.setAttribute("data-auth", "out"); if (window.RosterAppMenu) RosterAppMenu.refresh(); needs(); fire(ses.fns, s); }
  /* the place, kept before the page leaves (for Google, for a new version) and given back when it returns */
  function keepPlace(sub) { try { sessionStorage.setItem(RESTORE, JSON.stringify({ href: location.href, sub: sub || "", at: Date.now() })); } catch (e) { /* not kept */ } }
  (function restore() {
    var r = null; try { r = JSON.parse(sessionStorage.getItem(RESTORE) || "null"); } catch (e) { /* none */ }
    if (!r || !signedIn()) return;
    try { sessionStorage.removeItem(RESTORE); } catch (e) { /* none */ }
    if (Date.now() - r.at > T.restore || (r.sub && r.sub !== A().userId())) return;   /* another account: no return, it starts from home */
    try { var u = new URL(r.href); if (u.origin === location.origin && u.href !== location.href) history.replaceState(history.state, "", u.pathname + u.search); } catch (e) { /* stays */ }
  })();
  function signIn(o) {
    o = o || {};
    keepPlace(o.any ? "" : ses.state === "expired" ? ses.sub : "");
    if (A()) A().signIn(base());
    return new Promise(function (res) { window.addEventListener("pageshow", res, { once: true }); });   /* the page leaves; the browser's Back ends the wait */
  }
  /* a write the server refused because the session ended: a field's change (PATCH) is kept on the device and sent after the sign-in, in the same
     account only; anything else (a press that deletes, likes, moves) is not kept: it failed, and the screen says so */
  function qRead() { try { return JSON.parse(localStorage.getItem(QUEUE) || "[]") || []; } catch (e) { return []; } }
  function qWrite(a) { try { if (a.length) localStorage.setItem(QUEUE, JSON.stringify(a)); else localStorage.removeItem(QUEUE); } catch (e) { /* not kept */ } }
  function keepWrite(req) {
    if (!req || !req.path || !req.opts || String(req.opts.method || "").toUpperCase() !== "PATCH" || !ses.sub) return false;
    var a = qRead().filter(function (x) { return Date.now() - x.at < T.keep && !(x.sub === ses.sub && x.path === req.path); });
    a.push({ sub: ses.sub, path: req.path, opts: { method: "PATCH", json: req.opts.json, body: req.opts.body, prefer: req.opts.prefer }, at: Date.now() });
    qWrite(a); return true;
  }
  function queued() { return qRead().some(function (x) { return x.sub === ses.sub; }); }
  function flush() {
    if (!signedIn() || net.state === "off") return;
    var me = A().userId(), a = qRead(), mine = a.filter(function (x) { return x.sub === me; });
    if (!mine.length) return;
    qWrite(a.filter(function (x) { return x.sub !== me && Date.now() - x.at < T.keep; }));
    mine.reduce(function (p, x) { return p.then(function () { return A().api(x.path, x.opts).catch(function (e) { if (e && (e.signedOut || !e.status)) keepWrite({ path: x.path, opts: x.opts }); }); }); }, Promise.resolve());
  }
  function askSignIn(now) {
    if (ses.asked) return; ses.asked = true;   /* once: closing it is "later", and it opens again only from "כניסה" in the menu */
    notice("ההתחברות הסתיימה", { kind: "info", now: now, stay: true,
      text: function () { return queued() || document.querySelector("dialog[open] .rfields") ? "מה שכתבתם שמור במכשיר, ויישמר אחרי הכניסה." : "צריך להיכנס שוב כדי להמשיך לעבוד."; },
      action: { text: "כניסה עם גוגל", run: signIn } });
  }
  window.addEventListener("floa:auth", function (e) {
    var d = e.detail || {};
    if (d.reason === "expired") { if (ses.state !== "in") return; setSes("expired"); say("ההתחברות הסתיימה. מה שכתבתם נשמר במכשיר."); askSignIn(false); }
    else if (d.reason === "signout" && d.tab === "other") { setSes("out"); if (App.denied) App.denied("signin"); }   /* signed out in another tab: on purpose, so no window: the sign-in screen */
    else if (d.reason === "switch") location.assign(base());   /* another account: the app starts from home in it */
  });
  App.session = {
    get state() { return ses.state; },
    signIn: function () { return signIn(); },
    on: function (fn) { ses.fns.push(fn); },
    keep: keepWrite,
    /* a write that failed: e is the rejection. A refusal for the session keeps a field's change and opens the window now (an answer to a press) */
    failed: function (e) {
      if (!e || !e.signedOut) return false;
      keepWrite(e.req);
      if (ses.state === "in") { setSes("expired"); askSignIn(true); }
      return true;
    }
  };
  if (ses.state !== "in") html.setAttribute("data-auth", "out");

  /* ---------- a new version ---------- */
  var version = { state: "current", fns: [], reg: null, pend: false, dismissed: false, asked: false, reloading: false };
  function ready() {
    if (version.state === "ready") return;
    version.state = "ready"; fire(version.fns, "ready");
    if (version.asked) return; version.asked = true;   /* the window once; closed, it never pops again: a dot on the button and an item in the menu */
    notice("גרסה חדשה זמינה", { kind: "info", stay: true, action: { text: "רענון", run: apply },
      onClose: function (acted) { if (!acted) { version.dismissed = true; menu({ dot: true, refresh: apply }); } } });
  }
  version.check = function () {
    if (document.hidden) return;
    if (net.state === "off") { version.pend = true; return; }
    version.pend = false;
    if (version.reg) { version.reg.update().catch(noop); return; }
    var m = document.querySelector('meta[name="floa-build"]'); if (!m || !window.fetch) return;
    fetch(new URL(m.getAttribute("data-src") || "version.txt", document.baseURI).href, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      t = String(t || "").trim(); if (t && t !== m.getAttribute("content")) ready();
    }, noop);
  };
  function watchWorker(reg) {
    version.reg = reg;
    var sw = navigator.serviceWorker;
    if (reg.waiting && sw.controller) ready();
    reg.addEventListener("updatefound", function () {
      var w = reg.installing; if (!w) return;
      w.addEventListener("statechange", function () { if (w.state === "installed" && sw.controller) ready(); });
    });
  }
  /* the switch: writes on the way end first, the place is kept, then ONE load (the waiting worker takes over, or a plain reload) */
  function apply() {
    if (version.reloading) return new Promise(noop);
    return new Promise(function (res) {
      var t0 = Date.now();
      (function wait() { if (writing() && Date.now() - t0 < 10000) setTimeout(wait, 200); else res(); })();
    }).then(function () {
      version.reloading = true;
      keepPlace(ses.sub);
      var sw = navigator.serviceWorker, w = version.reg && version.reg.waiting;
      if (sw && w) {
        sw.addEventListener("controllerchange", function () { location.reload(); }, { once: true });
        w.postMessage({ type: "SKIP_WAITING" });
        setTimeout(function () { location.reload(); }, 4000);   /* a worker that never takes over: the page still loads once */
      } else location.reload();
      return new Promise(noop);
    });
  }
  App.version = { get state() { return version.state; }, apply: apply, on: function (fn) { version.fns.push(fn); } };
  function startVersion() {
    var go = function () {
      var sw = navigator.serviceWorker;
      if (sw && sw.getRegistration) sw.getRegistration().then(function (reg) { if (reg) watchWorker(reg); version.check(); }, function () { version.check(); });
      else version.check();
    };
    setTimeout(go, T.first);   /* after the app has come up, never in its way */
    document.addEventListener("visibilitychange", function () { if (!document.hidden) version.check(); });
    window.addEventListener("online", function () { version.check(); });
    setInterval(function () { version.check(); }, T.every);
  }
  if (document.readyState === "complete") startVersion(); else window.addEventListener("load", startVersion, { once: true });

  /* ---------- no access / not found ---------- */
  function deniedHtml(kind, o) {
    o = o || {};
    var name = o.name || App.name || "", mail = signedIn() ? A().email() : "", em = '<bdi dir="ltr">' + esc(mail) + '</bdi>';
    var w = kind === "signin" ? { head: "", b: name, s: "כדי להיכנס צריך חשבון גוגל.", go: "in", act: "כניסה עם גוגל" }
      : kind === "denied" ? { head: name, b: "אין גישה לחשבון הזה", s: em + " לא ברשימת המורשים. אפשר לבקש מהמנהל להוסיף אותו, או להיכנס בחשבון אחר.", go: "switch", act: "החלפת חשבון", ghost: true }
      : signedIn() ? { head: name, b: "הקישור לא נפתח", s: "ייתכן שזה נמחק, או שלא שיתפו את זה עם " + em + ". אפשר לבקש ממי ששלח את הקישור.", go: "home", act: "לדף הבית" }
      : { head: name, b: "הקישור לא נפתח", s: "ייתכן שצריך להיכנס כדי לראות את זה.", go: "in", act: "כניסה עם גוגל" };
    return '<header class="rhead"><div class="rhead__text"><span class="rhead__tw"><h1 class="rhead__title" dir="auto">' + esc(w.head) + '</h1></span></div></header>' +
      '<div class="rempty"' + (o.status ? ' role="status"' : '') + '>' + (o.icon || App.icon || "") + '<b dir="auto">' + esc(w.b) + '</b><span dir="auto">' + w.s + '</span>' +
      '<button type="button" class="rbtn' + (w.ghost ? ' rbtn--ghost' : '') + '" data-rapp-go="' + w.go + '">' + esc(w.act) + '</button></div>';
  }
  function deniedWire(root, o) {
    o = o || {};
    var b = root.querySelector("[data-rapp-go]"); if (!b) return;
    b.addEventListener("click", function () {
      var k = b.getAttribute("data-rapp-go");
      if (k === "in") RosterBusy(b, signIn({ any: true }));
      else if (k === "switch") RosterBusy(b, Promise.resolve(A() && A().signOut()).then(function () { return signIn({ any: true }); }));   /* the place is kept: an account that is allowed lands on the same link */
      else if (o.home) o.home(); else location.replace(base());
    });
    try { b.focus({ preventScroll: true, focusVisible: false }); } catch (e) { /* none */ }
  }
  App.denied = function (kind, o) {
    o = o || {};
    var into = o.into || App.denied.into || document.querySelector('[data-pane="start"]') || document.querySelector("main") || document.body;
    menu({ bare: kind !== "missing" });   /* the app's own items are not offered on this screen, only the kit's */
    into.innerHTML = deniedHtml(kind, o);
    if (window.RosterLayout && RosterLayout.surface) RosterLayout.surface(into);
    deniedWire(into, o);
    return into;
  };
  App.denied.html = function (kind, o) { menu({ bare: kind !== "missing" }); return deniedHtml(kind, o); };
  App.denied.wire = deniedWire;
  App.gone = function (what, back) { if (typeof back === "function") back(); notice(String(what || "") + " כבר לא זמין", { kind: "info" }); };

  /* ---------- the device download, on the round button ---------- */
  /* RosterApp.sync({ state, done, total, text }) (or sync(state, text)): "run" (a thin ring around the letter: it fills with done/total when total is
     known, else a soft arc glides), "done" (the ring completes and fades; with total 0 nothing), "stopped" (the warn symbol for a moment, its words in
     the menu's head), "" (the letter). ui/docs/app-status.md (owner 2026-11-26) */
  var syncT = 0;
  App.sync = function (state, text) {
    var o = state && typeof state === "object" ? state : { state: state, text: text };
    var s = o.state === "stop" ? "stopped" : o.state || "", t = o.text || "";
    var p = o.total > 0 && o.done >= 0 ? Math.min(1, o.done / o.total) : null;   /* the ring's fill, 0 to 1; null: unknown, the arc glides */
    clearTimeout(syncT);
    var end = function () { syncT = setTimeout(function () { menu({ sync: "", syncText: "", syncP: null, line: line() }); }, T.done); };
    if (s === "run") menu({ sync: "run", syncText: t, syncP: p, line: line() || t });
    else if (s === "done" && o.total !== 0) { menu({ sync: "done", syncText: t, line: line() }); say(t || "ההורדה הסתיימה"); end(); }
    else if (s === "stopped") { menu({ sync: "stopped", syncText: t, syncP: null, line: line() || t }); say(t || "ההורדה נעצרה"); end(); }
    else menu({ sync: "", syncText: "", syncP: null, line: line() });
  };

  /* ---------- start ---------- */
  menu({ net: net.state, line: line() });
  if (net.state === "off") check();
  setTimeout(flush, 1500);   /* a change kept while the session was gone: sent now that this account is back */
})();
