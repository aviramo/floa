/* Roster sheet (assets/sheet.css): the one popup every roster page uses, the SHELL of every popup.
   Anatomy (always the same): a FIXED header (title + X, 44px), one scrolling body, an optional fixed footer, and the grab bar at the edge opposite to where
   the sheet opens (data-from="top": opens from the top, bar at the bottom edge; "bottom": opens from the bottom, bar at the top edge).
   Three ways to get it:
     RosterSheet.render(dialog, { kind, title, titleId, body, foot, from })   build header, body and footer from HTML strings and open it
     <dialog data-title="..." data-from="bottom"> ...children... </dialog>      the shell wraps the existing children (ids and handlers stay), moves the first
                                                                              heading (or [data-rs-title]) into the header, [data-rs-foot] into the footer
     RosterSheet.attach(dialog, { from, beforeClose })   beforeClose() === false vetoes a swipe or backdrop close (the page then asks its own question)
     RosterSheet.shell(dialog, { title })                                       the same wrapping, called by hand
   RosterSheet.attach(dialog, { from: "top" | "bottom" })   once per <dialog>; after that the page just calls dialog.showModal() / close()
   RosterSheet.open(dialog, from)                            sets the direction and opens it
   Per sheet it does: the class and direction, a grab bar at the free edge, swipe (finger or mouse) on the bar, on [data-rs-drag] areas and on the
   content edge to pull it back and close it, backdrop click, the page behind locked (scroll position kept, several sheets counted), the visible
   viewport (on-screen keyboard) followed, and nothing else: no inline handlers, no framework, no business names.
   BACK closes the top window (or menu), at every width: every open window holds one history entry, written only here (H below, RosterSheet.history). */
(function () {
  "use strict";
  var html = document.documentElement, body = document.body;
  var locks = 0, savedY = 0;
  var WIDE = 760;   /* from this width (px) every popup comes in from the SIDE (owner rule); the same breakpoint as the admin drawers; sheet.css repeats it in its one @media (min-width: 760px) block */
  var wide = function () { return window.matchMedia && window.matchMedia("(min-width: " + WIDE + "px)").matches; };
  var reduced = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function lock() {
    if (locks++ > 0) return;
    savedY = window.pageYOffset || 0;
    if (!wide()) body.style.top = -savedY + "px";
    html.classList.add("rs-lock");
    if (!wide()) body.classList.add("rs-lock");   /* a computer: the page behind does not scroll anyway, and pinning the body is what made everything shift when a popup opened */
  }
  function unlock() {
    if (locks === 0 || --locks > 0) return;
    html.classList.remove("rs-lock"); body.classList.remove("rs-lock");
    body.style.top = "";
    window.scrollTo(0, savedY);
  }

  /* BACK CLOSES THE TOP WINDOW (ui/docs/window.md "חזרה סוגרת את החלון העליון", owner 2026-11-26), at every width; the ONE exception to "only the window touches
     history" (ui/SKILL.md, stage 5). Every open window of the kit (a dialog it attached, a side panel) and every open menu (/menu.js, through hold) holds ONE entry:
     history.pushState(state, "") with no URL, state = a copy of the entry under it (every key of the app) plus rs: { s, d } (s: this stack, the page load and a
     running number; d: the depth). The first window stamps the entry it opens on as the stack's base (d: 0) with replaceState. ONE capture listener on popstate,
     registered now, before the app's script: Back inside the stack closes the windows above the depth it landed on, the top first, each the way its X does (one
     whose beforeClose says false stays, and its entry is written again), and the app never hears it; Forward onto a closed window's entry is stepped back over;
     outside the stack every window of it closes and the event is the app's, and only that one (an entry of the stack at the depth the kit is at is the app's too).
     A close in the UI gives the entries back with ONE history.go(-n), whose popstate is the kit's own. The kit counts and compares once per microtask (a window
     closed and one opened in the same moment pass the entry on, with no call), one step at a time (the entry of a window opened meanwhile waits for the step; a
     step whose event never comes is let go after SAFE), and never steps while the page loads. Off for one window: history: false, or data-rs-history="off" on the
     dialog; for the whole page: data-rs-history="app" on <html> (a page that still writes window entries itself): then nothing is written and nothing listened to.
     RosterSheet.history.free(fn): the one way to write a SCREEN entry while a window is open: the kit gives its entries back in one step (the windows stay), runs
     fn, and starts a new stack on the new entry, one entry per open window again; with no window fn runs at once. Returns a promise of what fn returned.
     RosterSheet.history.hold(close, { veto }): the hook of a layer that is not a dialog or a panel (a menu, /menu.js): it holds one entry until the function it
     returns is called; Back calls close() (unless veto() says false). */
  var H = (function () {
    var SAFE = 1000;   /* sheet.js's own safety time for the event of a step: not a UI time, so not a token */
    var LOAD = Date.now().toString(36) + Math.random().toString(36).slice(2, 7), runN = 0;
    var held = [], stack = null, depth = 0, stepping = null, queued = false, frees = [], waitLoad = false;
    function off() { return html.getAttribute("data-rs-history") === "app" || !window.history || typeof history.pushState !== "function"; }
    function rsOf(st) { return st && typeof st === "object" && st.rs && typeof st.rs === "object" ? st.rs : null; }
    function copy(st, rs) { var c = {}; if (st && typeof st === "object") for (var k in st) if (k !== "rs" && Object.prototype.hasOwnProperty.call(st, k)) c[k] = st[k]; c.rs = rs; return c; }
    function gone(r) { return !!(r.dead && r.dead()); }   /* a window that closes with the one it came out of, which has closed: it is on its way out, and its entry goes in the same step */
    function live() { var n = 0; held.forEach(function (r) { if (!gone(r)) n++; }); return n; }
    function later() { if (queued) return; queued = true; Promise.resolve().then(sync); }
    function land() { var r = rsOf(history.state); depth = r && r.s === stack ? r.d : 0; later(); }
    function step(n) {
      var me = stepping = { t: setTimeout(function () { if (stepping === me) { stepping = null; land(); } }, SAFE) };
      history.go(n);
    }
    function sync() {
      queued = false;
      if (off() || stepping) return;
      var want = frees.length ? 0 : live();
      if (depth > want) {   /* entries to give back: one step for all of them, never while the page loads (a step then can load the page again) */
        if (document.readyState !== "complete") { if (!waitLoad) { waitLoad = true; window.addEventListener("load", function () { waitLoad = false; later(); }, { once: true }); } return; }
        step(want - depth); return;
      }
      if (frees.length) { var fs = frees; frees = []; stack = null; fs.forEach(function (f) { try { f.ok(f.fn()); } catch (e) { f.bad(e); } }); want = live(); }
      if (want > depth) {
        if (!depth) { stack = LOAD + "." + (++runN); history.replaceState(copy(history.state, { s: stack, d: 0 }), ""); }
        while (depth < want) { depth++; history.pushState(copy(history.state, { s: stack, d: depth }), ""); }
      }
    }
    function closeAbove(d) {   /* the windows above depth d, the top first, each the way its X does; one that refuses stays, and so does all under it */
      while (held.length && live() > d) {
        var top = held[held.length - 1];
        if (!gone(top) && top.veto && top.veto() === false) break;
        held.pop();
        try { top.close(); } catch (x) { /* the next one still closes */ }
      }
    }
    function onPop(e) {
      if (off()) return;
      if (stepping) { clearTimeout(stepping.t); stepping = null; e.stopImmediatePropagation(); land(); return; }   /* the kit's own step: the app never hears it */
      var r = rsOf(e.state), d = r && r.s === stack ? r.d : -1;
      if (d < 0) { stack = null; depth = 0; closeAbove(0); later(); return; }   /* outside the stack: its windows close, it ends, and the event is the app's */
      if (d === depth) return;   /* no window moved: a screen of the app (its entry carried the stack's key) */
      e.stopImmediatePropagation();   /* Back closed windows, or Forward came onto a closed one's entry (stepped back over by sync): the app never hears it */
      depth = d; closeAbove(d); later();
    }
    function hold(close, o) {
      o = o || {};
      if (off() || typeof close !== "function") return function () {};
      var rec = { close: close, veto: o.veto, dead: o.dead };
      held.push(rec); later();
      return function () { var i = held.indexOf(rec); if (i >= 0) { held.splice(i, 1); later(); } };
    }
    function free(fn) {
      if (typeof fn !== "function") return Promise.resolve();
      if (off() || (!depth && !stepping && !frees.length)) { var v; try { v = fn(); } catch (e) { later(); return Promise.reject(e); } later(); return Promise.resolve(v); }
      return new Promise(function (ok, bad) { frees.push({ fn: fn, ok: ok, bad: bad }); later(); });
    }
    if (!off()) window.addEventListener("popstate", onPop, true);
    return { hold: hold, free: free };
  })();

  function direction(dlg) { return dlg.getAttribute("data-from") === "top" ? -1 : 1; }   /* the way a finger moves to push it away */

  function viewport(dlg) {
    var v = window.visualViewport;
    if (!v) return;
    if (wide()) { dlg.style.removeProperty("--rs-vvh"); dlg.style.removeProperty("--rs-top"); dlg.style.removeProperty("--rs-kb"); return; }   /* a side panel is the full height of the window: the keyboard does not move it */
    dlg.style.setProperty("--rs-vvh", Math.round(v.height) + "px");
    dlg.style.setProperty("--rs-top", Math.round(v.offsetTop) + "px");
    dlg.style.setProperty("--rs-kb", Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) + "px");
    var kbd = Math.round(window.innerHeight - v.height) > 120;
    if (kbd && dlg.getAttribute("data-from") !== "top") {   /* the keyboard is up and a popup from the bottom must end ABOVE it, with its own bottom padding: measure where it really ends (its LAYOUT place, never the animated one: while it slides in, its drawn place is far lower) and lift it by whatever still hides under the keyboard (the browser's measure of the keyboard is not always the whole of it) */
      var over = Math.round(dlg.offsetTop + dlg.offsetHeight - (v.offsetTop + v.height));
      if (over > 0 && over < 200) dlg.style.setProperty("--rs-kb", (parseInt(dlg.style.getPropertyValue("--rs-kb"), 10) + over) + "px");
    }
    html.classList.toggle("rs-kbd", Math.round(window.innerHeight - v.height) > 120);   /* the keyboard is up: a tall popup is pinned to the top of what can be seen (see kit.css) */
  }

  function ensureGrab(dlg) {
    if (dlg.querySelector(":scope > .rs-grab")) return;
    var g = document.createElement("div");
    g.className = "rs-grab"; g.setAttribute("aria-hidden", "true");
    dlg.appendChild(g);
  }

  function scroller(el, dlg) {
    for (; el && el !== dlg; el = el.parentElement) {
      var o = getComputedStyle(el).overflowY;
      if ((o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  }

  function finish(dlg, dy, v) {
    var dir = direction(dlg), h = dlg.getBoundingClientRect().height, moved = dy * dir;
    dlg.classList.remove("rs-dragging");
    if ((moved > Math.min(120, h * 0.25) || v > 0.55) && !(dlg.__rsVeto && dlg.__rsVeto() === false)) {   /* a page may veto a user close (it then asks its own question): the sheet springs back */
      if (reduced()) { dlg.style.removeProperty("--rs-dy"); dlg.close(); return; }
      dlg.classList.add("rs-settle", "rs-closing");
      dlg.style.setProperty("--rs-dy", (dir * (h + 24)) + "px");
      var done = false, end = function () { if (done) return; done = true; dlg.removeEventListener("transitionend", end); dlg.classList.remove("rs-settle"); dlg.style.removeProperty("--rs-dy"); if (dlg.open) dlg.close(); dlg.classList.remove("rs-closing"); };
      dlg.addEventListener("transitionend", end); setTimeout(end, 320);
    } else {
      dlg.classList.add("rs-settle");
      dlg.style.setProperty("--rs-dy", "0px");
      setTimeout(function () { dlg.classList.remove("rs-settle"); dlg.style.removeProperty("--rs-dy"); }, 260);
    }
  }

  var X_ICON = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#x"/></svg>';   /* the kit's sprite (ui/docs/icon.md) */
  function closeButton(label, icon) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "rbtn rbtn--icon rs-x"; b.setAttribute("data-close", ""); b.setAttribute("aria-label", label || "סגירה"); b.title = label || "סגירה";   /* the kit's icon button, like every header button */
    b.innerHTML = icon || X_ICON;
    return b;
  }

  /* the shell around children that already exist: they are MOVED, not rebuilt, so every id, listener and test hook keeps working. The shell is a Layout surface
     (RosterLayout.wrap, ui/docs/layout.md, stage 1): the old names (.sheet, .sheet-head, .sheet-body, .sheet-foot) stay as second classes until stage 6 */
  function shell(dlg, o) {
    o = o || {};
    if (dlg.querySelector(":scope > .sheet")) return;
    var head = document.createElement("header"); head.className = "rhead sheet-head"; head.setAttribute("data-rs-drag", "");   /* the kit's header (.rhead), in its sheet context */
    var headText = document.createElement("div"); headText.className = "rhead__text"; head.appendChild(headText);
    var title = dlg.querySelector("[data-rs-title], h1, h2, h3");
    if (title) headText.appendChild(title);
    else {
      title = document.createElement("h2");
      title.textContent = o.title || dlg.getAttribute("data-title") || "";
      headText.appendChild(title);
    }
    title.classList.add("rhead__title");
    if (!title.id) title.id = (dlg.id || "rs") + "T";
    if (!dlg.hasAttribute("aria-labelledby") && !dlg.hasAttribute("aria-label")) dlg.setAttribute("aria-labelledby", title.id);
    head.insertBefore(closeButton(o.closeLabel || dlg.getAttribute("data-close-label"), o.icon), headText);   /* the X is the lead slot: the start (the right in Hebrew), where back sits */
    RosterLayout.wrap(dlg, { cls: "sheet", bodyCls: "sheet-body", footCls: "sheet-foot", head: head,
      keep: function (n) { return !!(n.classList && n.classList.contains("rs-grab")); },
      foot: function (n) { return n.hasAttribute("data-rs-foot"); } });
    dlg.__rsAuto = true;
  }

  /* header, body and footer from HTML strings (the pages build their dialogs this way: one call per opening) */
  var WARN_ICON = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#warn"/></svg>';
  var CHECK_ICON = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#check"/></svg>';
  /* o.action = { label, icon, form (id of the form it submits), id }: the primary action as an icon button, the header's last slot (the catalog's "header save") */
  function actionButton(a) {
    var label = a.label || "שמירה";
    return '<button type="' + (a.form ? "submit" : "button") + '" class="rbtn rbtn--icon rbtn--accent rs-act"' + (a.form ? ' form="' + a.form + '"' : "") + (a.id ? ' id="' + a.id + '"' : "") + ' aria-label="' + label + '" title="' + label + '">' + (a.icon || CHECK_ICON) + "</button>";
  }
  /* the title, and under it the header's description slot when there is one (law 15: .rhead__tw holds both, the title does not move) */
  function headTitle(h2, sub) { return sub == null ? h2 : '<span class="rhead__tw">' + h2 + '<span class="rhead__sub" dir="auto">' + popEsc(sub) + '</span></span>'; }
  /* a sheet is a Layout surface (ui/docs/layout.md, stage 1): the kit's header, one body, an optional foot; the short window (mode "stack") a plain stack.
     The old names (.sheet, .sheet-head, .sheet-body, .sheet-foot) stay as second classes until stage 6 */
  function markup(o) {
    return RosterLayout.html({ surface: true, mode: o.mode, cls: "sheet", bodyCls: "sheet-body", footCls: "sheet-foot", body: o.body || "", foot: o.foot,
      head: '<header class="rhead sheet-head" data-rs-drag>' +   /* the kit's header (.rhead) in its sheet context */
        '<button type="button" class="rbtn rbtn--icon rs-x" data-close aria-label="' + (o.closeLabel || "סגירה") + '" title="' + (o.closeLabel || "סגירה") + '">' + (o.icon || X_ICON) + "</button>" +   /* the X is the lead slot: the start (the right in Hebrew), where back sits */
        '<div class="rhead__text">' + headTitle('<h2 class="rhead__title" dir="auto" id="' + (o.titleId || "dlgT") + '">' + (o.title || "") + "</h2>", o.sub) + "</div>" +
        (o.action ? actionButton(o.action) : "") + "</header>" });   /* the main action is the last slot, the end (the left in Hebrew) */
  }
  /* o.anchor = the element that opened it: on a computer (from WIDE) a SHORT popup opens next to that control (law 3) instead of in the middle: below it, flipped above (or to its side)
     when there is no room, always inside the window, as wide as its content up to --w. Its inline-start edge stands on the control's (RTL: right on right), flipped when there is no room. On a phone, or with no anchor, nothing changes (the bottom sheet / the page's own placement). */
  function unanchor(dlg) {
    dlg.removeAttribute("data-anchored"); RosterLayout.unplace(dlg);
    if (dlg.__rsRo) { dlg.__rsRo.disconnect(); dlg.__rsRo = null; }
    if (dlg.__rsGo) { window.removeEventListener("resize", dlg.__rsGo); dlg.__rsGo = null; }
  }
  /* the height of the app's bottom bar (--bar-b, 0 when there is none): the token is a calc, so it is read from a probe that is never painted */
  /* THE PLAYER's one JS point (ui/docs/player.md, "שכבה"): it is a popover="manual" in the top layer. A modal window makes everything outside it inert, so on every open
     and close of a window the player goes into the topmost open window (or back to the page) and is shown again, which puts it over that window. CSS can do neither
     (move an element, or reorder the top layer). Called from the windows' own open and close (attach), and from any dialog's toggle or close event. */
  function raisePlayer() {
    var p = document.querySelector(".rplayer[popover]"); if (!p || !document.body) return;
    var dl = [].filter.call(document.querySelectorAll("dialog[open]"), function (d) { try { return d.matches(":modal"); } catch (e) { return true; } }), host = dl.length ? dl[dl.length - 1] : document.body;
    if (p.parentNode === host && p.__rsOver === host && p.matches(":popover-open")) return;   /* already over the top window */
    try { p.hidePopover(); } catch (e) { /* not shown yet */ }
    if (p.parentNode !== host) host.appendChild(p);
    p.__rsOver = host;
    try { p.showPopover(); } catch (e) { /* an old browser: a plain fixed bar */ }
  }
  document.addEventListener("toggle", function (e) { if (e.target && e.target.tagName === "DIALOG") raisePlayer(); }, true);
  document.addEventListener("close", function (e) { if (e.target && e.target.tagName === "DIALOG") raisePlayer(); }, true);
  function barB() { if (!document.body) return 0; var p = document.createElement("div"); p.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;height:var(--bar-b,0px)"; document.body.appendChild(p); var v = p.offsetHeight; p.remove(); return v; }
  function anchorTo(dlg, a) {
    if (!a.getClientRects().length) { var hm = a.closest(".rhead"), mo = hm && [].filter.call(hm.querySelectorAll("[data-rmore]"), function (x) { return x.getClientRects().length; })[0]; if (mo) a = mo; }   /* a header action folded into "עוד" (RosterHeader): what it opens stands beside "עוד" */
    dlg.setAttribute("data-anchored", "");
    var go = function () {   /* the kit's one mechanism (RosterLayout.place, ui/docs/layout.md "מיקום ליד פקד"): the control's start edge, flipped when there is no room; below, above,
                                and with room on neither, beside it. The free area ends at the top of the app's bottom bar (--bar-b): a window from the player stands above it */
      if (!dlg.open || !a.isConnected || !wide()) return;
      RosterLayout.place(dlg, a, { none: "beside" });
    };
    dlg.__rsGo = go; window.addEventListener("resize", go);
    if (window.ResizeObserver) { dlg.__rsRo = new ResizeObserver(go); dlg.__rsRo.observe(dlg); }   /* a popup that grows (a message, a busy state) stays inside the window */
    dlg.addEventListener("close", function () { unanchor(dlg); }, { once: true });
    go();
  }
  function render(dlg, o) {
    o = o || {};
    if (!dlg.open) { dlg.__rsNoHist = o.history === false || !!dlg.__rsNoHistA; dlg.__rsWith = null; }   /* BACK (H): a new opening says whether it holds an entry; drawn again while open, it is the same window */
    unanchor(dlg);
    attach(dlg, { from: o.from });
    dlg.className = (o.kind ? o.kind + " " : "") + "rsheet";
    if (o.from) dlg.setAttribute("data-from", o.from);
    if (o.size) dlg.setAttribute("data-size", o.size); else dlg.removeAttribute("data-size");   /* s, m (default) or l: the width tokens of popup.css */
    if (o.desktop) dlg.setAttribute("data-desktop", o.desktop); else dlg.removeAttribute("data-desktop");   /* "side": a left drawer on a computer */
    dlg.innerHTML = markup(o);
    ensureGrab(dlg);
    if (!dlg.open) dlg.showModal();
    if (o.anchor && wide() && o.anchor.isConnected) anchorTo(dlg, o.anchor);
  }

  /* the header action: disabled until something changed (setDirty), loading while saving (busy). The button keeps its place in the header. */
  function actBtn(dlg) { return dlg.querySelector(".sheet-head > .rs-act, .sheet-foot [data-confirm-go]"); }   /* the header's action, or the short window's action in its foot */
  function setDirty(dlg, dirty) { var b = actBtn(dlg); if (!b) return; b.disabled = !dirty; b.setAttribute("aria-disabled", dirty ? "false" : "true"); }
  /* WAITING ON THE PRESSED ELEMENT (ui/docs/loading.md, "RosterBusy"): RosterBusy(el, promise) puts aria-busy="true" on el at once and takes it off when the promise
     settles (answers or fails), and returns the same promise. RosterBusy.hold(el) is a wait that is not a promise (a player waiting for a file): it returns the
     function that ends it (a second call does nothing). Every wait on an element is counted here, in ONE counter of the kit, so two holders (a request and the
     player) never take the state off each other: the attribute goes only when the last one ends. Only the attribute: no disabled, no style, no class; kit.css
     draws the wait by the element's kind and stops presses on it. No el, or a promise that is not one: nothing happens and what was given comes back. */
  var busyN = window.WeakMap ? new WeakMap() : null;
  function busyHold(el) {
    if (!el || !el.setAttribute || !busyN) return function () {};
    busyN.set(el, (busyN.get(el) || 0) + 1); el.setAttribute("aria-busy", "true");
    var done = false;
    return function () { if (done) return; done = true; var n = (busyN.get(el) || 1) - 1; if (n > 0) busyN.set(el, n); else { busyN.delete(el); el.removeAttribute("aria-busy"); } };
  }
  function RosterBusy(el, promise) {
    if (!el || !promise || typeof promise.then !== "function") return promise;
    var end = busyHold(el); promise.then(end, end);
    return promise;
  }
  RosterBusy.hold = busyHold;
  var actHeld = window.WeakMap ? new WeakMap() : null;   /* the header action's own wait (busy below), one at a time */
  function busy(dlg, on) {
    var b = actBtn(dlg); if (!b) return;
    if (on) { if (actHeld && !actHeld.has(b)) actHeld.set(b, busyHold(b)); b.disabled = true; }
    else { var end = actHeld && actHeld.get(b); if (end) { actHeld.delete(b); end(); } b.disabled = false; b.removeAttribute("aria-disabled"); }
  }

  function attach(dlg, opts) {
    if (opts && opts.history === false) dlg.__rsNoHistA = dlg.__rsNoHist = true;   /* a window that is a screen, or belongs to one: no entry, Back does not close it */
    if (dlg.__rs) return; dlg.__rs = true;
    opts = opts || {};
    if (typeof opts.beforeClose === "function") dlg.__rsVeto = opts.beforeClose;   /* beforeClose() === false vetoes a swipe or backdrop close */
    dlg.classList.add("rsheet");
    if (dlg.hasAttribute("data-title") || dlg.hasAttribute("data-rs-shell")) {
      shell(dlg, opts);
    }
    dlg.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".rs-x") && dlg.contains(e.target)) dlg.close(); });   /* every sheet's X closes it, also a sheet drawn by render() (its X is hidden to the eye on a computer, but a keyboard or a screen reader still presses it) */
    if (opts.from) dlg.setAttribute("data-from", opts.from);
    else if (!dlg.hasAttribute("data-from")) dlg.setAttribute("data-from", "bottom");

    /* the content slides under the header: the edge (data-scrolled on the surface) is the one helper below, THE EDGE; a closed window forgets it */
    dlg.addEventListener("close", function () { [].forEach.call(dlg.querySelectorAll("[data-scrolled]"), function (s) { s.__rsSc = []; s.removeAttribute("data-scrolled"); }); });

    var isOpen = false, hrel = null;
    function hsync() {   /* BACK (H): the window holds one entry while it is open and gives it back when it closes; Back closes it the way its X does */
      if (dlg.open) {
        if (!hrel && !dlg.__rsNoHist && dlg.getAttribute("data-rs-history") !== "off")
          hrel = H.hold(function () { dlg.close(); }, { veto: function () { return dlg.__rsVeto ? dlg.__rsVeto() : true; }, dead: function () { var w = dlg.__rsWith; return !!w && !w.open; } });
      } else if (hrel) { var r = hrel; hrel = null; r(); }
    }
    function opened() {
      hsync();
      if (isOpen) return; isOpen = true;
      ensureGrab(dlg); lock(); viewport(dlg); raisePlayer();
    }
    function closed() {
      hsync();
      if (!isOpen) return; isOpen = false;
      dlg.classList.remove("rs-dragging", "rs-settle"); dlg.style.removeProperty("--rs-dy");
      unlock(); raisePlayer();
    }
    new MutationObserver(function () { if (dlg.open) { opened(); ensureGrab(dlg); } else closed(); }).observe(dlg, { attributes: true, attributeFilter: ["open"], childList: true });
    dlg.addEventListener("close", closed);

    /* iron rule: whenever the sheet closes (swipe, Escape, backdrop, close button, programmatic close, a submit that closes it) the on-screen keyboard
       closes with it: the focused field inside is blurred BEFORE the close, and afterwards, if the browser handed focus back to a text field, that is blurred too */
    var blurIn = function () { var el = document.activeElement; if (el && el !== document.body && dlg.contains(el) && typeof el.blur === 'function') el.blur(); };
    var nativeClose = dlg.close.bind(dlg), nativeModal = dlg.showModal.bind(dlg), nativeShow = dlg.show.bind(dlg);
    dlg.close = function (rv) { blurIn(); nativeClose(rv); hsync(); };
    dlg.showModal = function () { nativeModal(); hsync(); };   /* the entry is counted in the same moment as the opening (a menu that closes as this opens passes its entry on) */
    dlg.show = function () { nativeShow(); hsync(); };
    dlg.addEventListener('cancel', function () { var el = document.activeElement; if (el && dlg.contains(el) && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) el.blur(); });   /* only a text field: a page may still veto the Escape (it asks first) and a button must keep its focus then */
    dlg.addEventListener('close', function () { var el = document.activeElement; if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el && el.isContentEditable)) el.blur(); });
    if (dlg.open) opened();

    var vv = window.visualViewport;
    if (vv) { var upd = function () { if (dlg.open) viewport(dlg); }; vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); }
    /* an iPhone moves the visible window a little after the keyboard comes or goes, and not every step is announced: measure again as it settles */
    var settle = function () { if (!dlg.open) return; viewport(dlg); [80, 200, 400, 750].forEach(function (t) { setTimeout(function () { if (dlg.open) viewport(dlg); }, t); }); };
    dlg.addEventListener("focusin", settle); dlg.addEventListener("focusout", settle); window.addEventListener("orientationchange", settle);
    dlg.addEventListener("close", function () { html.classList.remove("rs-kbd"); });

    /* backdrop: a press that starts and ends on the backdrop closes, a drag that merely ends there does not */
    var downOnBackdrop = false;
    dlg.addEventListener("mousedown", function (e) { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener("click", function (e) { if (opts.backdrop !== false && e.target === dlg && downOnBackdrop && !(dlg.__rsVeto && dlg.__rsVeto() === false)) dlg.close(); });

    /* swipe on the bar, on [data-rs-drag] areas (pointer events: finger and mouse) */
    var drag = null;
    dlg.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || drag || wide()) return;   /* no pointer drag on a side panel */
      var h = e.target.closest(".rs-grab, [data-rs-drag]");
      var ctl = e.target.closest("button, a, input, select, textarea");
      if (!h || !dlg.contains(h) || (ctl && !ctl.closest("[data-rs-drag-all]"))) return;
      /* a header marked [data-rs-drag-all] can be pulled from its buttons too: the pull starts only once the finger has moved down, so a tap is still a tap */
      drag = { id: e.pointerId, y0: e.clientY, x0: e.clientX, last: e.clientY, t0: e.timeStamp, lastT: e.timeStamp, v: 0, dy: 0, h: h, pend: !!ctl };
      if (!ctl) { try { h.setPointerCapture(e.pointerId); } catch (x) {} dlg.classList.add("rs-dragging"); }
    });
    dlg.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.pend) {
        var mx = e.clientX - drag.x0, my = (e.clientY - drag.y0) * direction(dlg);
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        if (my < Math.abs(mx)) { drag = null; return; }   /* sideways or the other way: not a pull */
        drag.pend = false; drag.y0 = e.clientY; drag.last = e.clientY;
        try { drag.h.setPointerCapture(e.pointerId); } catch (x) {} dlg.classList.add("rs-dragging");
        drag.eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); }; dlg.addEventListener("click", drag.eat, true);   /* the button under the finger is not pressed */
      }
      var dir = direction(dlg), raw = e.clientY - drag.y0, moved = Math.max(0, raw * dir);
      drag.dy = moved * dir;
      var dt = Math.max(1, e.timeStamp - drag.lastT); drag.v = ((e.clientY - drag.last) * dir) / dt; drag.last = e.clientY; drag.lastT = e.timeStamp;
      dlg.style.setProperty("--rs-dy", drag.dy + "px");
    });
    function endPointer(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if (d.pend) return;   /* a tap on a button of the header: nothing was pulled */
      if (d.eat) setTimeout(function () { dlg.removeEventListener("click", d.eat, true); }, 80);
      try { d.h.releasePointerCapture(d.id); } catch (x) {}
      finish(dlg, d.dy, d.v);
    }
    dlg.addEventListener("pointerup", endPointer);
    dlg.addEventListener("pointercancel", endPointer);

    /* swipe on the content: only when the content cannot move further the way the finger pushes, so inner scrolling keeps working */
    var t = null;
    dlg.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1 || drag || wide() || e.target.closest(".rs-grab, [data-rs-drag]")) { t = null; return; }
      t = { x: e.touches[0].clientX, y: e.touches[0].clientY, sc: scroller(e.target, dlg), on: false, dy: 0, v: 0, last: e.touches[0].clientY, lastT: e.timeStamp };
    }, { passive: true });
    dlg.addEventListener("touchmove", function (e) {
      if (!t) return;
      var p = e.touches[0], dir = direction(dlg), dy = p.clientY - t.y, dx = p.clientX - t.x;
      if (!t.on) {
        if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx)) return;
        if (dy * dir <= 0) { t = null; return; }                       /* the other way: it is a scroll (or nothing) */
        var s = t.sc;
        var atEdge = !s || (dir < 0 ? s.scrollTop + s.clientHeight >= s.scrollHeight - 1 : s.scrollTop <= 0);
        if (!atEdge) { t = null; return; }
        t.on = true; t.y = p.clientY; dlg.classList.add("rs-dragging");
        if (t.sc) { t.sc._ov = t.sc.style.overflowY; t.sc.style.overflowY = "hidden"; }   /* the content inside is frozen for as long as the popup is held: moving the finger back up pulls the popup back, it never scrolls the content */
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (e.cancelable) e.preventDefault();
      var moved = Math.max(0, (p.clientY - t.y) * dir);
      t.dy = moved * dir;
      var dt = Math.max(1, e.timeStamp - t.lastT); t.v = ((p.clientY - t.last) * dir) / dt; t.last = p.clientY; t.lastT = e.timeStamp;
      dlg.style.setProperty("--rs-dy", t.dy + "px");
    }, { passive: false });
    function endTouch() { var d = t; t = null; if (d && d.on) { if (d.sc) d.sc.style.overflowY = d.sc._ov || ""; finish(dlg, d.dy, d.v); } }
    dlg.addEventListener("touchend", endTouch);
    dlg.addEventListener("touchcancel", endTouch);
  }

  function open(dlg, from) {
    attach(dlg, { from: from });
    if (from) dlg.setAttribute("data-from", from);
    if (!dlg.open) dlg.showModal();
  }

  /* THE confirm: one short popup (a title, one sentence, one action) for every "are you sure". o: title, text (markup, already escaped),
     action (the button's word; none: a message with no button; a destructive action is the same primary button, its word says what it does), anchor (the control that opened it: on a computer
     the popup stands beside it), id (the dialog, "confirmDlg" by default), run(dlg, btn, ev) on the button. Closing it is the cancel. */
  /* the control the person just pressed, still on the screen: a short popup stands beside it (law 6). A menu item is gone once its
     menu closes, so the control that opened the menu (focus returns to it) takes its place. */
  var lastPress = null;
  document.addEventListener("click", function (e) { lastPress = e.target && e.target.closest ? e.target.closest("button, a, [role=button], [role=menuitem]") : null; }, true);
  function seen(el) { return el && el.isConnected && el.getClientRects().length && !(el.closest("dialog") && !el.closest("dialog").open) ? el : null; }
  function pressedNow() { var f = document.activeElement; return seen(lastPress) || (f && f !== document.body && f.matches && f.matches("button, a, [role=button]") ? seen(f) : null); }
  /* ui/docs/window.md "חלון קצר". o.fields: up to two one-line fields [{ name, label, value, placeholder (an example: the field's data-hint), type, required,
     autocomplete, inputmode, enterkeyhint, maxlength }], drawn as the kit's field inside ONE form with the action, so Enter submits (only while the action is valid).
     o.change: the action opens only once a value changed (default: yes when there are fields). o.submit(values, dlg): values trimmed; a promise:
     kept, the window closes; broken with { field, message }, the message goes under that field; broken otherwise, { message } takes the sentence's
     place, with the warn symbol before it and no colour of its own. While it runs the kit says so: aria-busy on the action, the fields read-only, a second press or Enter sends nothing.
     CHECK ON SAVE (ui/docs/realtime.md, "טופס עם כפתור שמירה"): the window remembers what it opened with, and a save that finds the row changed meanwhile asks first.
       Mode 1, a field bound to a live source: { source, key, col, match (column filters of the row, default { id: key }), rev (the version column, default "rev"), the
       (the label's definite form for the question) }. No value: the row's col is the value. On submit the kit saves the changed columns itself, through
       source.write, with a CONDITIONAL PATCH (&rev=eq.<n> when the row has one, else &<col>=eq.<value at open>, prefer return=representation); then o.submit(values, dlg) if given.
       Mode 2, o.save(values, { force }): the app's own write; resolves to { conflict: { value, by, label } } or { conflict: [{ name, value, by, label, was }] } when its condition failed
       (was: the value at open; default the field's value).
       A conflict: the question in a short window of its own over the form (anchored on the save button): "שמירה" writes with no condition and closes both, closing it
       closes the form too, unsaved. The person: by (mode 2: a name, or { name, female }); mode 1: o.nameOf(row.updated_by) when the table keeps it. */
  var MAX_FIELDS = 2, TYPES = { text: 1, email: 1, tel: 1, url: 1, number: 1 };
  function attr(n, v) { return v == null || v === false ? "" : " " + n + (v === true ? "" : '="' + popEsc(v) + '"'); }
  function prop(o, n) { var v = o && o[n]; return typeof v === "function" ? v.call(o) : v; }   /* source.table / source.schema, a value or an accessor */
  /* REST as the person, with the schema headers: RosterLive.rest when the live layer has it, else the same request by hand */
  function liveRest(path, opts, schema) {
    var L = window.RosterLive, S = window.SUPABASE || {}, A = window.FLOA_AUTH;
    if (schema == null) schema = S.schema || "";   /* a source with no schema of its own works in the page's */
    if (L && typeof L.rest === "function") return L.rest(path, opts, schema);
    if (A && A.signedIn() && (schema || "") === (S.schema || "")) return A.api(path, opts);
    return Promise.resolve(A && A.signedIn() ? A.token() : S.anonKey).then(function (t) {
      var h = { apikey: S.anonKey, authorization: "Bearer " + t };
      if (opts.json !== undefined) h["content-type"] = "application/json";
      if (opts.prefer) h.prefer = opts.prefer;
      if (schema) { h["Accept-Profile"] = schema; h["Content-Profile"] = schema; }
      return fetch(S.url + path, { method: opts.method || "GET", headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined });
    }).then(function (r) {
      if (!r.ok) { var e = new Error("request failed " + r.status); e.status = r.status; throw e; }
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  function whereOf(m) { return Object.keys(m).map(function (c) { return encodeURIComponent(c) + "=" + (m[c] == null ? "is.null" : "eq." + encodeURIComponent(String(m[c]))); }).join("&"); }
  function one(k, v) { var m = {}; m[k] = v; return m; }
  function assignTo(t) { for (var i = 1; i < arguments.length; i++) for (var k in arguments[i]) if (Object.prototype.hasOwnProperty.call(arguments[i], k)) t[k] = arguments[i][k]; return t; }
  var GONE = "זה נמחק בינתיים, ולא נשמר.", NOT_SAVED = "לא נשמר.";
  /* the question of a conflict: who (when known) changed what to what; one sentence however many fields.
     An empty value is never quoted (ui/docs/window.md, "ערך ריק לא מצוטט"): emptied = "נמחק", empty before = "מולא", otherwise "השתנה ל«X»".
     No gendered verb about the person: the name, when known, leads as "עדכון של <שם>:"; the field is always "השדה <תווית>" so the verb agrees */
  function conflictTitle(list) {
    var by = list[0].by, nm = by && typeof by === "object" ? by.name : by;
    if (!nm || list.some(function (x) { var n = x.by && typeof x.by === "object" ? x.by.name : x.by; return n !== nm; })) nm = null;
    var empty = function (v) { return v == null || String(v).trim() === ""; };
    var q = function (v) { return "«" + popEsc(v) + "»"; };
    var what = function (x) {
      var lb = x.label || x.name, f = "השדה" + (lb ? " " + popEsc(lb) : "");
      if (empty(x.value)) return f + " נמחק";
      if (x.was !== undefined && empty(x.was)) return f + " מולא: " + q(x.value);
      return f + " השתנה ל" + q(x.value);
    };
    var parts = list.map(what);
    var said = parts.length > 1 ? parts.slice(0, -1).join(", ") + " ו" + parts[parts.length - 1] : parts[0];
    var cleared = list.every(function (x) { return empty(x.value); });
    var tail = cleared ? "לשמור את שלך?" : "לשמור את שלך במקומ" + (list.length > 1 ? "ם" : "ו") + "?";
    return (nm ? "עדכון של " + popEsc(nm) + ": " : "בינתיים ") + said + ". " + tail;
  }
  function confirm(o) {
    o = o || {};
    var id = o.id || "confirmDlg", dlg = document.getElementById(id);
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = id; document.body.appendChild(dlg); }
    var fields = (o.fields || []).slice(0, MAX_FIELDS), fid = id + "F";
    /* what the window opened with: per bound field, the row's value and its version at this moment (mode 1) */
    var binds = fields.map(function (f, i) {
      if (!f.source || f.key == null || !f.col) return null;
      var row = typeof f.source.get === "function" ? f.source.get(f.key) : undefined, rc = f.rev || "rev";
      if (f.value == null && row) f = fields[i] = assignTo({}, f, { value: row[f.col] });   /* no value given: the row's */
      return { f: f, src: f.source, key: f.key, col: f.col, match: f.match || { id: f.key }, revCol: rc,
        open: row ? row[f.col] : f.value, rev: row && row[rc] != null ? row[rc] : null,
        table: f.table || prop(f.source, "table"), schema: f.schema != null ? f.schema : prop(f.source, "schema") };
    });
    var bound = binds.some(Boolean);
    var form = fields.length ? '<form id="' + fid + '" class="rlayout rfields" novalidate>' + fields.map(function (f, i) {
      var t = TYPES[f.type] ? f.type : "text";
      return '<label class="rlayout rlayout--unit rfield' + (t === "email" || t === "tel" || t === "url" ? " rfield--ltr" : "") + '"><span>' + popEsc(f.label) + '</span><input id="' + id + "-" + popEsc(f.name || "f" + i) + '" name="' + popEsc(f.name || "f" + i) + '" type="' + t + '"' +
        ' placeholder="' + (f.placeholder ? popEsc(f.placeholder) + '" data-hint' : ' "') + attr("value", f.value == null ? "" : String(f.value)) + attr("autocomplete", f.autocomplete || "off") + attr("inputmode", f.inputmode) +
        attr("enterkeyhint", f.enterkeyhint || (i === fields.length - 1 ? "done" : "next")) + attr("maxlength", f.maxlength) + attr("required", !!f.required) + "></label>";
    }).join("") + "</form>" : "";
    render(dlg, { kind: "confirm", mode: "stack", title: o.title, titleId: o.titleId, from: "bottom", size: "s", anchor: o.anchor || pressedNow(), history: o.history,
      body: (o.text ? '<span class="rs-text" dir="auto">' + o.text + "</span>" : "") + form,
      foot: o.action ? '<button class="rbtn rbtn--block" type="' + (form ? 'submit" form="' + fid : "button") + '" data-confirm-go>' + o.action + '</button>' : undefined });
    var b = dlg.querySelector("[data-confirm-go]"), f = dlg.querySelector("#" + fid), inputs = f ? [].slice.call(f.querySelectorAll("input")) : [];
    var change = o.change != null ? !!o.change : inputs.length > 0, first = inputs.map(function (x) { return x.value.trim(); });
    var text = dlg.querySelector(".rs-text"), said = text ? text.innerHTML : "", running = false;
    function valid() {
      return inputs.every(function (x) { return (!x.required || x.value.trim() !== "") && x.checkValidity(); }) &&
        (!change || inputs.some(function (x, i) { return x.value.trim() !== first[i]; }));
    }
    var acts = !!(o.submit || o.save || bound);   /* the action saves something */
    function paint() { if (b && acts && !running) b.disabled = !valid(); }
    function unsay() { if (text && text.hasAttribute("data-err")) { text.removeAttribute("data-err"); text.innerHTML = said; if (!said) { text.remove(); text = null; } } }
    function say(msg) {
      if (!text) { text = document.createElement("span"); text.className = "rs-text"; text.dir = "auto"; RosterLayout.body(dlg).insertBefore(text, f); }
      text.innerHTML = WARN_ICON; text.appendChild(document.createTextNode(msg)); text.setAttribute("data-err", "");   /* the warn symbol and the words, no colour of its own */
    }
    /* mode 1: the changed bound columns, one group per row */
    function groupsOf(values) {
      var gs = [];
      binds.forEach(function (bd, i) {
        if (!bd || values[inputs[i].name] === first[i]) return;
        var v = values[inputs[i].name], g = gs.filter(function (x) { return x.src === bd.src && String(x.key) === String(bd.key); })[0];
        if (!g) gs.push(g = { src: bd.src, key: bd.key, match: bd.match, table: bd.table, schema: bd.schema, revCol: bd.revCol, rev: bd.rev, patch: {}, conds: {}, binds: [] });
        g.patch[bd.col] = v; g.conds[bd.col] = bd.open; g.binds.push({ bd: bd, name: inputs[i].name, v: v });
      });
      return gs;
    }
    function writeGroup(g, force) {
      if (!g.table) { if (window.console) console.warn("RosterSheet.confirm: a bound field's source has no table"); return Promise.reject(new Error("no table")); }
      var path = "/rest/v1/" + encodeURIComponent(g.table) + "?" + whereOf(g.match) + (force ? "" : "&" + whereOf(g.rev != null ? one(g.revCol, g.rev) : g.conds));
      var run = function () {
        return liveRest(path, { method: "PATCH", json: g.patch, prefer: "return=representation" }, g.schema).then(function (res) {
          if (Array.isArray(res) && !res.length) { if (force) throw { message: GONE }; var c = new Error("conflict"); c.conflict = true; throw c; }   /* no row came back: the condition failed */
          return res;
        });
      };
      return typeof g.src.write === "function" ? g.src.write(g.key, g.patch, run) : run();   /* shown at once, the echo held, reverted on failure (RosterLive) */
    }
    function rowNow(g) {
      return liveRest("/rest/v1/" + encodeURIComponent(g.table) + "?" + whereOf(g.match) + "&select=*", {}, g.schema)
        .then(function (d) { return Array.isArray(d) ? d[0] || null : d || null; }, function () { return g.src.get ? g.src.get(g.key) || null : null; });
    }
    function saveBound(values) {   /* resolves to null (saved) or { ask, groups } (somebody changed a field meanwhile) */
      return Promise.all(groupsOf(values).map(function (g) {
        return writeGroup(g, false).then(function () { return null; }, function (e) { if (e && e.conflict) return g; throw e; });
      })).then(function (bad) {
        bad = bad.filter(Boolean);
        if (!bad.length) return null;
        return Promise.all(bad.map(function (g) {
          return rowNow(g).then(function (row) {
            if (!row) throw { message: GONE };
            var by = row.updated_by != null && typeof o.nameOf === "function" ? o.nameOf(row.updated_by) : null, list = [];
            g.binds.forEach(function (x) {
              var cur = row[x.bd.col] == null ? "" : String(row[x.bd.col]);
              if (cur !== (x.bd.open == null ? "" : String(x.bd.open)) && cur !== x.v) list.push({ name: x.name, label: x.bd.f.label, the: x.bd.f.the, value: cur, was: x.bd.open == null ? "" : String(x.bd.open), by: by });
            });
            return { g: g, list: list };
          });
        })).then(function (rs) {
          var ask = [], groups = [], quiet = [];
          rs.forEach(function (r) { if (r.list.length) { ask = ask.concat(r.list); groups.push(r.g); } else quiet.push(r.g); });   /* quiet: the row moved on, but none of my fields: written as is */
          return Promise.all(quiet.map(function (g) { return writeGroup(g, true); })).then(function () { return ask.length ? { ask: ask, groups: groups } : null; });
        });
      });
    }
    function asList(c) {   /* mode 2's conflict, one field or several */
      return (Array.isArray(c) ? c : [c]).map(function (x, i) {
        var nm = x.name || (inputs[i] && inputs[i].name), fi = fields.filter(function (f, k) { return inputs[k] && inputs[k].name === nm; })[0] || {};
        return { name: nm, label: x.label || fi.label, the: x.the || fi.the, value: x.value, was: x.was !== undefined ? x.was : fi.value, by: x.by };   /* was: the value the window opened with (empty before = "מולא") */
      });
    }
    /* the save: mode 2 (o.save), mode 1 (bound fields) or o.submit alone; o.submit runs after a save that went through */
    function save(values, force, groups) {
      var p = o.save ? Promise.resolve(o.save(values, { force: !!force })).then(function (r) { return r && r.conflict ? { ask: asList(r.conflict) } : null; })
        : bound ? (force ? Promise.all(groups.map(function (g) { return writeGroup(g, true); })).then(function () { return null; }) : saveBound(values))
        : Promise.resolve(null);
      return p.then(function (r) { return r || Promise.resolve(o.submit ? o.submit(values, dlg) : null).then(function () { return null; }); });
    }
    /* the question, in a short window of its own over the form: "שמירה" overwrites and closes both; closing it is the cancel and closes the form, unsaved */
    function ask(r, values) {
      var qd = confirm({ id: id + "Q", titleId: id + "QT", title: conflictTitle(r.ask), action: "שמירה", anchor: seen(b) || undefined,
        submit: function () {
          return save(values, true, r.groups || []).then(function (again) { if (again) throw { message: NOT_SAVED }; },
            function (e) { throw e && e.message && !(e instanceof Error) ? { message: e.message } : { message: NOT_SAVED }; });   /* the question has no fields: every failure is its sentence */
        } });
      qd.addEventListener("close", function () { if (dlg.open) dlg.close(); }, { once: true });
      dlg.__rsWith = qd;   /* BACK (H): the form closes with its question, so both entries go back in one step */
    }
    function go() {
      if (running || !acts || (b && b.disabled)) return;
      var values = {}; inputs.forEach(function (x) { values[x.name] = x.value.trim(); });
      running = true; var held = busyHold(b); inputs.forEach(function (x) { x.readOnly = true; });   /* the action waits, in the kit's one counter (RosterBusy) */
      var end = function () { running = false; held(); inputs.forEach(function (x) { x.readOnly = false; }); };
      Promise.resolve().then(function () { return save(values, false); }).then(function (r) { end(); if (r && r.ask) { paint(); ask(r, values); } else if (dlg.open) dlg.close(); }, function (e) {
        end(); paint();
        var bad = e && e.field ? dlg.querySelector('#' + fid + ' [name="' + e.field + '"]') : null;
        if (bad && window.RosterField) { RosterField.error(bad, e.message || ""); bad.focus(); }
        else if (e && e.message && !(e instanceof Error)) say(e.message);
        else if (bound && !o.save) say(NOT_SAVED);   /* the kit wrote it, so the kit says it did not go through */
      });
    }
    if (f) {
      f.addEventListener("submit", function (ev) { ev.preventDefault(); go(); });
      f.addEventListener("input", function () { unsay(); paint(); });
      paint();
    }
    if (b && acts && !f) b.addEventListener("click", go);
    if (b && o.run) b.addEventListener("click", function (ev) { o.run(dlg, b, ev); });
    /* the focus: in the press that opened it (never a timer, or a phone keeps its keyboard down): the first field, its text all selected; else the action; a message keeps the window's own */
    if (inputs[0]) { inputs[0].focus(); inputs[0].select(); } else if (b) b.focus({ focusVisible: false });
    return dlg;
  }

  /* THE SIDE PANEL (a computer). ONE component for a panel on either side; the side is a parameter.
     - The split: an app with two panes marks them, data-pane="start" and data-pane="end" (start = the inline-start side: the right in Hebrew).
       A panel covers ONE pane exactly, up to the divider; it never crosses it. With no panes it stands at its edge, --w wide.
     - Its origin: a panel opened from nothing (a button, a menu) comes in from the outer edge of its pane; a panel whose origin (o.from) is
       another panel comes out of the divider, over the other pane, and goes back into it when it closes. It closes with its origin, and a
       new one from the same origin first sends the old one back in.
     - A panel over a panel on the same side: same place, same width; the one under stays exactly as it was, only hidden and inert.
     - ONE dim under the panels (law 17), over the other pane; a tap on it, or Escape, closes the top panel only.
     o: side ("start" | "end"), from (a panel), html, onClose(el). Returns the panel (the element to draw into). */
  var panels = [], scrim = null;
  function panelCss() { /* the panel's look, place, motion and dim are in kit.css (.rpanel-box, .rpanel, .rpanel-scrim) */ }
  function paneOf(side) { return document.querySelector('[data-pane="' + side + '"]'); }
  function other(side) { return side === "start" ? "end" : "start"; }
  function placeAll() {   /* the one dim lies right under the top panel that came from nothing, over the other pane (CSS places it by data-side): what came out of that panel is above it */
    if (!scrim) return;
    var roots = panels.filter(function (p) { return !p.from; }), top = roots.length ? roots[roots.length - 1] : panels[0];
    if (paneOf("start") || paneOf("end")) scrim.dataset.side = other(top ? top.side : "start"); else delete scrim.dataset.side;
    scrim.style.zIndex = "calc(var(--z-menu) + " + ((top ? top.z : 1) - 1) + ")";
  }

  var panelWired = false;
  function panelWire() {
    if (panelWired) return; panelWired = true;
    document.addEventListener("keydown", function (e) {   /* Escape closes the top panel only; a popup or a menu over it takes the key first */
      if (e.key !== "Escape" || e.defaultPrevented || !panels.length || document.querySelector("dialog[open], .rmenu, #moreMenu")) return;
      e.preventDefault(); panelClose(panels[panels.length - 1].el);
    }, true);
  }
  function panelChanged() { document.dispatchEvent(new CustomEvent("rpanel-change")); }
  function panelOpen(o) {
    o = o || {}; panelCss(); panelWire();
    var side = o.side === "start" ? "start" : "end", from = o.from || null;
    if (from) { var kids = panels.filter(function (p) { return p.from === from; }); if (kids.length) panelClose(kids[0].el, true); }   /* a new one from the same origin: the old one goes back in first */
    var box = document.createElement("div"); box.className = "rpanel-box"; box.dataset.side = side; if (from) box.dataset.from = "";   /* kit.css moves it from its origin */
    box.style.zIndex = "calc(var(--z-menu) + " + (panels.length * 2 + 1) + ")";
    var el = o.el || document.createElement("div");   /* o.el: a panel the app keeps (its search, its scroll): it is lent to the box, and given back when it closes */
    el.classList.add("rpanel"); el.classList.remove("is-open");
    if (!o.el) el.innerHTML = o.html || "";
    box.appendChild(el); document.body.appendChild(box);
    var below = panels.filter(function (p) { return p.side === side; }).pop();
    if (!scrim) {   /* the first panel brings the one dim, over the other pane */
      scrim = document.createElement("div"); scrim.className = "rpanel-scrim";
      scrim.addEventListener("click", function () { if (panels.length) panelClose(panels[panels.length - 1].el); });
      document.body.appendChild(scrim);
    }
    var rec = { el: el, box: box, side: side, from: from, onClose: o.onClose, keep: !!o.el, z: panels.length * 2 + 1 };
    panels.push(rec); placeAll();
    if (o.history !== false) rec.hrel = H.hold(function () { panelClose(el); });   /* BACK (H): one entry while it is open; Back closes it the way its X does */
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      if (panels.indexOf(rec) < 0) return;   /* closed before its first frame: it never opens */
      el.classList.add("is-open"); if (scrim) scrim.classList.add("is-on");
    }); });
    if (below) setTimeout(function () { if (panels.indexOf(rec) >= 0 && panels.indexOf(below) >= 0) { below.box.classList.add("is-under"); below.box.setAttribute("inert", ""); } }, 320);   /* the one under is hidden once the new one covers it */
    panelChanged();
    return el;
  }
  function panelClose(el, quiet) {   /* closes this panel, everything opened above it and everything that came out of it */
    var i = -1; panels.forEach(function (p, k) { if (p.el === el) i = k; }); if (i < 0) return;
    var gone = panels.splice(i);
    var T = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--t-base")) || 0) * 1000;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) T = 0;
    gone.reverse().forEach(function (p, k) {   /* one after the other, the top first: what came out of a panel goes back in before that panel leaves */
      if (p.hrel) { var hr = p.hrel; p.hrel = null; hr(); }   /* its entry goes back with it: every panel of this close in one step (H) */
      p.box.setAttribute("inert", "");
      if (p.onClose) try { p.onClose(p.el); } catch (x) { /* the closing goes on */ }   /* the app hears of it at once; the motion follows */
      setTimeout(function () {
        if (p.el.parentNode === p.box) p.el.classList.remove("is-open");
        setTimeout(function () { if (p.keep && p.el.parentNode === p.box) p.box.removeChild(p.el); p.box.remove(); }, T + 60);   /* a kept panel is given back, not destroyed */
      }, k * T);
    });
    placeAll();
    var top = panels.filter(function (p) { return p.side === gone[gone.length - 1].side; }).pop();
    panels.forEach(function (p) { if (p === top || !panels.some(function (q) { return q.side === p.side && panels.indexOf(q) > panels.indexOf(p); })) { p.box.classList.remove("is-under"); p.box.removeAttribute("inert"); } });
    if (!panels.length && scrim) { var s0 = scrim; scrim = null; setTimeout(function () { s0.classList.remove("is-on"); setTimeout(function () { s0.remove(); }, T + 60); }, (gone.length - 1) * T); }   /* the dim leaves with the last panel */
    panelChanged();
  }
  function panelCloseAll() { if (panels.length) panelClose(panels[0].el); }
  /* THE POPUP: ONE component for every window that holds a list, an editor or a preview. The app calls it once; the kit decides how it
     opens: on a computer a side panel up to the divider (o.side: "start" | "end", o.from: the popup it came out of), on a phone a sheet
     from the bottom. Same header (the title and the X), same closing (popup.close, or the X, Escape, the dim), same order. Returns the
     element to draw into (the panel, or the dialog). o: title (text), body (markup), side, from, size (phone), id (phone: the dialog's id),
     wire(el), onClose(el), history (false: a window that is a screen or belongs to one: no entry, Back does not close it; the same option on render, confirm,
     panel.open and attach). */
  var popN = 0;
  function popEsc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function popup(o) {
    o = o || {};
    if (wide()) {
      var html = RosterLayout.html({ surface: true, bodyCls: "rpopup-body", footCls: "sheet-foot", body: o.body || "", foot: o.foot,   /* the same Layout surface as a sheet (ui/docs/layout.md, stage 1); the old names stay as second classes until stage 6 */
        head: '<header class="rhead"><button type="button" class="rbtn rbtn--icon" data-popup-x aria-label="סגירה" title="סגירה">' + X_ICON + '</button>' +
          '<div class="rhead__text">' + headTitle('<h2 class="rhead__title">' + popEsc(o.title) + '</h2>', o.sub) + '</div></header>' });   /* a window's title is h2 (a screen's is h1); the X is the lead slot */
      var el = panelOpen({ side: o.side, from: o.from, html: html, onClose: o.onClose, history: o.history });
      el.querySelector("[data-popup-x]").addEventListener("click", function () { panelClose(el); });
      if (o.body == null) popLoading(el);
      popActs(el, o.actions);
      if (o.wire) o.wire(el);
      return el;
    }
    var id = o.id || "rsPopup" + (++popN), dlg = document.getElementById(id);
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = id; document.body.appendChild(dlg); }
    render(dlg, { kind: o.kind, title: popEsc(o.title), sub: o.sub, from: "bottom", size: o.size || "l", body: o.body || "", foot: o.foot, history: o.history });
    if (o.from && o.from.tagName === "DIALOG") { o.from.addEventListener("close", function () { if (dlg.open) dlg.close(); }, { once: true }); dlg.__rsWith = o.from; }   /* it closes with the popup it came out of (and its entry goes back in the same step, H) */
    if (o.onClose) dlg.addEventListener("close", function () { o.onClose(dlg); }, { once: true });
    if (o.body == null) popLoading(dlg);
    popActs(dlg, o.actions);
    if (o.wire) o.wire(dlg);
    return dlg;
  }
  /* o.actions: the window header's actions (icon buttons, ui/docs/header.md slot 4), written into its header and fitted like a screen header's (folding into "עוד") */
  function popActs(el, html) {
    if (!html) return;
    var hd = el.querySelector(".rhead, .sheet-head"); if (!hd) return;
    hd.insertAdjacentHTML("beforeend", '<span class="rhead__acts">' + html + '</span>');
    if (window.RosterHeader && RosterHeader.fit) RosterHeader.fit(hd);
  }
  /* the loading state: a popup opened without a body is loading. Its header is final, its body is the empty area that waits (.rload, aria-busy: kit.css draws the curve); popup.fill ends it */
  function popLoading(el) { var b = popup.body(el); if (b) { b.classList.add("rload"); b.setAttribute("aria-busy", "true"); } }
  popup.body = function (el) { return RosterLayout.body(el); };   /* where its content is: the body of its Layout surface (kept for the apps that call it) */
  popup.fill = function (el, html, foot) {   /* a popup that opened loading (no body) gets its content (law 7); foot: the phone's bottom row, drawn again with it */
    var b = popup.body(el); if (b) { b.innerHTML = html; b.removeAttribute("aria-busy"); b.classList.remove("rload"); }
    if (foot != null && el.tagName === "DIALOG") { var f = el.querySelector(".rlayout__foot"); if (f) f.innerHTML = foot; }
    return b;
  };
  popup.sub = function (el, text) { var s = el && el.querySelector(".rhead__sub"); if (s && s.textContent !== text) s.textContent = text; };   /* the description under the title, changed in place (it was opened with o.sub) */
  popup.open = function (el) { return !!el && (el.tagName === "DIALOG" ? el.open : panels.some(function (p) { return p.el === el; })); };
  popup.close = function (el) { if (!el) return; if (el.tagName === "DIALOG") { if (el.open) el.close(); } else panelClose(el); };

  var panel = { open: panelOpen, close: panelClose, closeAll: panelCloseAll, live: function () { return panels.map(function (p) { return p.el; }); }, top: function () { return panels.length ? panels[panels.length - 1].el : null; } };

  /* THE EDGE (ui/docs/layout.md, רמת המשטח, principle 7): data-scrolled on the SURFACE (.rlayout--surface: a sheet, a side panel, a short window) while its body,
     or a scroller inside it, is scrolled away from its top by more than 2px; kit.css draws the soft edge under the last fixed slot before the body. CSS cannot know
     whether a box is scrolled in every browser, so this is the one helper: one scroll listener and one MutationObserver for every surface; an app writes no scroll
     listener of its own. A scroll inside the head, a bar or the foot is not the body's. Every screen is a surface too (stage 2: a page and each pane of a split). */
  (function () {
    var FIXED = ".rlayout__head, .rlayout__bar, .rlayout__foot, .rhead, .sheet-head, .sheet-foot";
    function ownerOf(el) {
      var s = el.closest(".rlayout--surface"); if (!s) return null;
      var f = el.closest(FIXED); return f && s.contains(f) ? null : s;
    }
    function apply(o) {
      var set = (o.__rsSc || []).filter(function (x) { return x.isConnected && x.scrollTop > 2; }); o.__rsSc = set;   /* a list that was drawn again is not scrolled any more */
      if (set.length) { if (!o.hasAttribute("data-scrolled")) o.setAttribute("data-scrolled", ""); } else if (o.hasAttribute("data-scrolled")) o.removeAttribute("data-scrolled");
    }
    document.addEventListener("scroll", function (e) {
      var el = e.target; if (!el || el.nodeType !== 1) return;
      var o = el.__rsOw && el.__rsOw.isConnected && el.__rsOw.contains(el) ? el.__rsOw : (el.__rsOw = ownerOf(el)); if (!o) return;
      var set = o.__rsSc || (o.__rsSc = []); if (el.scrollTop > 2 && set.indexOf(el) < 0) set.push(el);
      apply(o);
    }, { capture: true, passive: true });
    /* a list drawn again starts at its top: the owners are checked again when contents are replaced */
    var watch = function () { new MutationObserver(function () { document.querySelectorAll(".rlayout--surface[data-scrolled]").forEach(apply); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  })();

  /* THE STUCK SECTION BAR (ui/docs/section.md): CSS sticks the bar; whether it IS stuck now (pulled from its own place to the sticky line) CSS cannot know in
     every browser, so this one helper writes data-stuck on it, as the header's edge above writes data-scrolled. The kit's CSS reads it: the --gap above the bar is
     covered in the page colour and the block's edge (the soft shadow) moves from the header to the bar. Attributes only, never style. Only an outer section's bar sticks. */
  (function () {
    function px(v) { return parseFloat(v) || 0; }
    function mark(sc) {
      if (!sc || sc.nodeType !== 1 || !sc.querySelector(".racc__bar")) return;
      var line = sc.getBoundingClientRect().top + px(getComputedStyle(sc).paddingTop);
      sc.querySelectorAll(".racc__bar").forEach(function (b) {
        var s = b.parentElement; if (!s || (s.parentElement && s.parentElement.closest(".racc"))) return;
        var bt = b.getBoundingClientRect().top, home = s.getBoundingClientRect().top + px(getComputedStyle(s).paddingTop);
        var on = b.getClientRects().length > 0 && Math.abs(bt - line - px(getComputedStyle(b).top)) < 1 && bt > home + .5;
        if (on !== b.hasAttribute("data-stuck")) { if (on) b.setAttribute("data-stuck", ""); else b.removeAttribute("data-stuck"); }
      });
    }
    document.addEventListener("scroll", function (e) { mark(e.target); }, { capture: true, passive: true });
    /* a section folded or opened under a stuck bar moves it without a scroll: the scrollers that hold a stuck bar are checked again after a click */
    document.addEventListener("click", function () { requestAnimationFrame(function () { document.querySelectorAll(".racc__bar[data-stuck]").forEach(function (b) { for (var el = b.parentElement; el && el !== document.body; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) { mark(el); return; } b.removeAttribute("data-stuck"); }); }); }, true);
  })();

  /* ADAPTIVE HEADER ACTIONS (ui/docs/header.md, "פעולות מסתגלות"): the one place JS measures (a declared exception to "CSS before JS": CSS cannot know how long
     the title is). The title gets its full width first; the actions with data-pri fold into "עוד" one by one, the highest data-pri first, until it fits; a title
     longer than the row with everything folded wraps (data-wrap). It writes attributes only (data-folded, data-wrap, data-rsearch-tight), never style.
     The sum does not depend on what is folded now (a folded button keeps its last width), so it never oscillates.
     RosterHeader.fit(header): once, right after the header is in the page (before the first paint); it then follows by itself: a ResizeObserver (the window,
     the divider, a live value that appears) and a MutationObserver (a title that changes, buttons that come and go). Every .rhead put into the page is fitted
     by itself too (the watcher below), so a sheet's header needs no call.
     RosterHeader.items(header, act): the menu items of the folded actions, by data-pri (data-menu-label, data-menu-check); act(btn) may return another fn. */
  var RosterHeader = (function () {
    var all = [], cv = null, ro = window.ResizeObserver ? new ResizeObserver(function (es) { var seen = []; es.forEach(function (e) { var h = e.target.__rhHead; if (h && seen.indexOf(h) < 0) { seen.push(h); calc(h); } }); }) : null;
    function num(v) { return parseFloat(v) || 0; }
    function tok(name) { return num(getComputedStyle(document.documentElement).getPropertyValue(name)); }
    function textW(el) {   /* the width of the title on ONE line: what the text needs, whatever the row gives it now */
      var cs = getComputedStyle(el);
      cv = cv || document.createElement("canvas").getContext("2d");
      cv.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      if ("letterSpacing" in cv) cv.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      return Math.ceil(cv.measureText(el.textContent.replace(/\s+/g, " ").trim()).width) + 2;   /* +2: rounding never lets a title that "fits" wrap */
    }
    function wOf(el, h) {   /* a slot's width; one that the kit hides (folded, or the search's narrow state) counts with the width it had */
      if (el.hidden) return 0;
      var w = el.getBoundingClientRect().width;
      if (w > 0) { el.__rhW = w; return w; }
      if (el.hasAttribute("data-folded") || el.getAttribute("data-rmore") === "fold" || h.hasAttribute("data-rsearch-tight")) return el.__rhW || (el.classList.contains("rbtn--icon") ? tok("--icon") : 0);
      return 0;
    }
    function byPri(a, b) { return num(a.getAttribute("data-pri")) - num(b.getAttribute("data-pri")); }
    function calc(h) {
      if (!h.isConnected) return;
      var cs = getComputedStyle(h), W = h.clientWidth - num(cs.paddingInlineStart) - num(cs.paddingInlineEnd);
      if (W <= 0) return;   /* not shown (a closed pane): nothing to decide */
      var G = num(cs.columnGap), text = h.querySelector(":scope > .rhead__text"), acts = h.querySelector(":scope > .rhead__acts");
      var fixed = 0, slots = 0;
      [].forEach.call(h.children, function (c) { if (c === text || c === acts) return; var w = wOf(c, h); if (w > 0) { fixed += w; slots++; } });
      var pri = [], more = null, keep = null, aFixed = 0, aN = 0, aG = acts ? num(getComputedStyle(acts).columnGap) : 0;
      if (acts) [].forEach.call(acts.children, function (c) {
        if (c.hasAttribute("data-pri")) { pri.push(c); return; }
        if (c.getAttribute("data-rmore") === "fold") { more = c; return; }
        if (c.getAttribute("data-rmore") === "keep") keep = c;
        var w = wOf(c, h); if (w > 0) { aFixed += w; aN++; }
      });
      pri.sort(byPri);
      var pw = pri.map(function (b) { return wOf(b, h) || tok("--icon"); }), mw = more ? (wOf(more, h) || tok("--icon")) : 0;
      var title = text && text.querySelector(".rhead__title:not(input)"), sub = text && text.querySelector(".rhead__sub");
      var mark = title && title.parentElement && title.parentElement.classList.contains("rhead__tl") ? title.parentElement.querySelector(":scope > .rhead__mark") : null,
        mW = mark ? wOf(mark, h) : 0; if (mW) mW += num(getComputedStyle(mark).marginInlineStart);   /* the mark at the title's end (and its --gap-tight) is part of the title's line */
      var tW = title ? Math.max(textW(title) + mW, sub && sub.textContent.trim() ? textW(sub) : 0) : 0, tN = title ? 1 : 0,   /* the box of the title and its description: the wider of the two, both whole */ tG = text ? num(getComputedStyle(text).columnGap) : 0;
      if (text) [].forEach.call(text.children, function (c) { if ((title && c.contains(title)) || c.classList.contains("rhead__q") || c.matches("input.rhead__title")) return; var w = wOf(c, h); if (w > 0) { tW += w; tN++; } });
      var textNeed = tW + Math.max(0, tN - 1) * tG;
      var rest = function (k) {   /* everything but the title's slot, with the first k foldable actions shown */
        var moreOn = more && k < pri.length, n = aN + k + (moreOn ? 1 : 0), aw = aFixed + (moreOn ? mw : 0) + Math.max(0, n - 1) * aG;
        for (var i = 0; i < k; i++) aw += pw[i];
        return fixed + aw + (slots + (n ? 1 : 0)) * G;   /* one --gap between the title's slot and each slot after or before it */
      };
      var valid = function (k) { return k === pri.length || !!(keep || (more && pri.length - k !== 1)); };   /* no "עוד" to fold into: nothing folds; a menu never has one item */
      var k = pri.length;
      while (k > 0 && !(valid(k) && rest(k) + textNeed <= W)) k--;
      while (!valid(k)) k++;
      var wrap = !!title && rest(k) + textNeed > W;
      var tight = W - rest(k) < tok("--w");   /* an open search: no room for its line at --w beside the actions, so only the line and the X */
      var lost = false;
      pri.forEach(function (b, i) { var f = i >= k; if (f !== b.hasAttribute("data-folded")) { if (f && b.contains(document.activeElement)) lost = true; b.toggleAttribute("data-folded", f); } });
      if (wrap !== h.hasAttribute("data-wrap")) h.toggleAttribute("data-wrap", wrap);
      if (tight !== h.hasAttribute("data-rsearch-tight")) h.toggleAttribute("data-rsearch-tight", tight);
      if (lost) { var m = more || keep; if (m) try { m.focus({ preventScroll: true, focusVisible: false }); } catch (x) { /* the focus goes to "עוד" */ } }   /* the focused action folded: the focus moves to "עוד" */
    }
    function observe(h) { if (!ro) return; ro.observe(h); [].forEach.call(h.querySelectorAll(":scope > *, :scope > .rhead__acts > *, :scope > .rhead__text > *"), function (c) { if (!c.__rhHead) { c.__rhHead = h; ro.observe(c); } }); }
    function fit(h) {
      if (!h || !h.classList || !h.classList.contains("rhead")) return;
      calc(h);
      if (h.__rhFit) return; h.__rhFit = true; h.__rhHead = h; all.push(h);
      observe(h);
      new MutationObserver(function () { observe(h); calc(h); }).observe(h, { childList: true, subtree: true, characterData: true });
    }
    function refit() { all = all.filter(function (h) { return h.isConnected; }); all.forEach(calc); }
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", refit);   /* the title's letters arrived: their width changed */
    var watch = function () { new MutationObserver(function () { [].forEach.call(document.querySelectorAll(".rhead"), function (h) { if (!h.__rhFit) fit(h); }); all = all.filter(function (h) { return h.isConnected; }); }).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
    function items(h, act) {
      h = h && !h.classList.contains("rhead") ? h.querySelector(".rhead") : h;
      if (!h) return [];
      return [].slice.call(h.querySelectorAll("[data-pri][data-folded]")).sort(byPri).map(function (x) {
        var label = x.getAttribute("data-menu-label") || x.getAttribute("aria-label") || "", fn = (act && act(x)) || function () { x.click(); };
        if (!x.hasAttribute("data-menu-label") && /\s/.test(label.trim())) console.warn("RosterHeader: a folded header action needs a short data-menu-label (" + label + ")");
        if (x.hasAttribute("data-menu-check")) return { label: label, check: (x.getAttribute("aria-pressed") === "true") !== (x.getAttribute("data-menu-check") === "false"), fn: fn };
        return { label: label, icon: x.innerHTML, fn: fn };
      });
    }
    return { fit: fit, items: items };
  })();
  window.RosterHeader = RosterHeader;

  window.RosterBusy = RosterBusy;
  window.RosterSheet = { WIDE: WIDE, barB: barB, raisePlayer: raisePlayer, attach: attach, open: open, render: render, shell: shell, setDirty: setDirty, busy: busy, confirm: confirm, panel: panel, popup: popup, history: H };
})();
