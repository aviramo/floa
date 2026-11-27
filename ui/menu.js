/* THE MENU (ui/, the domain's UI library): ONE floating list of actions that opens from a button, for every app. Defined in ui/docs/menu.md.
   RosterMenu.open(btn, items, opts) opens it beside the button and returns { el, close, repaint }; RosterMenu.current() is the open menu's element (or null);
   RosterMenu.close() closes it. Every open and every close sends "rmenu-change" on document.
   The items of a header's folded actions come from RosterHeader.items(header, act) (/sheet.js, "פעולות מסתגלות").
     items: an array, or a function that returns one (called again by repaint).
     item:  { label, icon (svg markup), meta (markup after the label), fn, keep (fn(itemEl, close, repaint): the menu stays open),
              check (true/false: a ticked item, never with an icon; menuitemcheckbox), radio (with check: one of many, menuitemradio, the same look), disabled, last (drawn at the end: the app menu's sign-out),
              net (true: it needs the server; drawn off in its place while html[data-net="off"] or html[data-auth="out"], ui/docs/app-offline.md) }
            A destructive item (delete, remove) has no colour and no tone: its word says what it does, with its symbol, and the app writes it last.
            or { sep: true }: a line between groups (ui/docs/divider.md), never first, last or beside another one
     opts:  head (markup above the items), foot ([{ label, fn, primary, ghost, disabled }] buttons below), up (opens upwards, from opts.ref's top
            if given), end (tries the button's END edge first; by default it hangs from its START edge, the right in RTL, and either one flips to the other edge when there is no room), fit (an old alias, no effect:
            a menu is always as wide as its content), min (an element the menu is at least as wide as: --rmenu-min, kit.css caps it),
            listbox (a select's list, ui/docs/field.md "שדה בחירה נפתח כתפריט": role listbox, option items with aria-selected, no one-item warning, and on closing
            aria-expanded="false" stays on the button; after a TOUCH it does not take the focus back, so no OS picker opens from a focused select),
            touch (it was opened by a touch: the same, until a key is pressed),
            onHead (the head is a <button class="rmenu__head">: a click closes the menu and calls onHead(); it joins the arrow-key walk, first).
   - On opening the focus goes to the ticked radio item (or the selected option), else to the first item; the list scrolls it into view.
   - It carries the colour scope of its button (.raccent-2 on the button or an ancestor): it hangs on body or a popup, outside that scope.
   Rules it keeps by itself:
   - It stands beside its button, below it, or above it when there is no room, always inside the window and never taller than it (the list scrolls).
     It appears in place, with no motion.
   - While it is open, a touch outside it only closes it (it never reaches what is under). Escape closes only it, Tab closes it, and so do a change of
     the window's width and a scroll of anything under it. Back (the phone's or the browser's) closes it too, like a window: /sheet.js holds its one entry.
   - Up and down arrows walk its items, Home and End go to the first and the last; a disabled item is skipped.
   - Inside an open popup (a modal dialog) it is put into that popup, or a tap on it would fall through.
   - When it closes, the focus goes back to its button: what an item opens stands beside that button.
   - A menu never has one item: a single action is a button. A call with one item still opens, with a console warning. */
(function () {
  "use strict";
  /* the check of a ticked item: ALWAYS in the markup of every ticked item; CSS shows it only on aria-checked="true" and keeps its room otherwise (kit.css .rmenu__check).
     The drawing is the kit's sprite (/icons.svg) */
  var CHECK = '<svg class="rsym rmenu__check" aria-hidden="true" focusable="false"><use href="/icons.svg#check"/></svg>';
  var cur = null;
  /* why a control that needs the server is off now ("" when it is not): the page's state, written by the kit's /app.js on html */
  function needs() { var h = document.documentElement; return h.getAttribute("data-net") === "off" ? "אין חיבור" : h.getAttribute("data-auth") === "out" ? "צריך להיכנס" : ""; }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function open(btn, items, opts) {
    opts = opts || {};
    if (cur) cur.close();
    var lb = !!opts.listbox;
    var m = document.createElement("div"); m.id = "rsMenu"; m.setAttribute("role", lb ? "listbox" : "menu");
    var scope = btn.closest && btn.closest('[class*="raccent-"]');   /* the colour scope of the button: the menu hangs outside it, so it carries it */
    var accent = scope ? [].filter.call(scope.classList, function (c) { return /^raccent-/.test(c); }) : [];
    if (opts.min) m.style.setProperty("--rmenu-min", Math.round(opts.min.getBoundingClientRect().width) + "px");   /* a variable, not a width: kit.css caps it */
    var list = [], done = false, touch = false;
    function paint() {
      var raw = (typeof items === "function" ? items() : items) || [];
      list = raw.filter(function (it) { return !it.last; }).concat(raw.filter(function (it) { return it.last; }));   /* an item marked last (the app menu's sign-out) goes to the end; the rest keep the app's order (a destructive item is written last by the app) */
      list = list.filter(function (it, k, a) { return !it.sep || (k > 0 && k < a.length - 1 && !a[k + 1].sep); });   /* a separator never first, last or beside another: a group whose items all dropped leaves no orphan line */
      while (list.length && list[0].sep) list.shift();
      var real = list.filter(function (it) { return !it.sep; });
      if (!lb && real.length === 1 && !(btn.getAttribute && btn.getAttribute("data-rmore") === "keep")) console.warn(   /* the one exception (owner 2026-11-26): a header's "עוד" (keep) with every action out holds only its destructive item */"RosterMenu: a menu with one item (" + real[0].label + "); a single action is a button");
      /* THE SURFACE (ui/docs/layout.md, the menu's row of the table): the menu itself is a Layout surface. head: the head slot; the items: the ONE body (the list,
         its old name .rmenu__list kept), bars flush, --gap above the first and below the last; foot: the foot slot (.rmenu__foot kept). With no item there is
         nothing to scroll: a head over a foot is a plain stack (the empty body is out of the layout, principle 5). The menu stays the same element (cur.el). */
      var body = list.map(function (it, k) {
        if (it.sep) return lb ? '<div class="rlayout rlayout--unit rdiv rdiv--line" aria-hidden="true"></div>' : '<div class="rlayout rlayout--unit rdiv rdiv--line" role="separator"></div>';   /* ui/docs/divider.md: a line between groups, edge to edge, skipped by the keyboard; a listbox holds only options, so there it is decoration */
        var tick = it.check !== undefined;
        if (tick && it.icon) console.warn("RosterMenu: an item with check carries no icon (" + it.label + "); the check is drawn");
        var lead = tick ? CHECK : (it.icon || "");
        var role = lb ? 'option" aria-selected="' + !!it.check : tick ? (it.radio ? "menuitemradio" : "menuitemcheckbox") + '" aria-checked="' + !!it.check : "menuitem";   /* radio: one of many (a role, a sort), the same look; a listbox: option + aria-selected, the same look */
        var why = it.net ? needs() : "";   /* net: true, an item that needs the server (ui/docs/app-offline.md): off, in its place, while there is no connection or no sign-in */
        if (it.disabled || why) return '<div class="rlayout rlayout--row rlayout--pad-x rmenu__item" role="' + role + '" aria-disabled="true"' + (why ? ' title="' + why + '"' : '') + '>' + lead + '<span dir="auto">' + esc(it.label) + '</span>' + (it.meta ? '<span class="rmenu__meta">' + it.meta + '</span>' : '') + '</div>';
        return '<button type="button" class="rlayout rlayout--row rlayout--pad-x rmenu__item" role="' + role + '" data-k="' + k + '">' +
          lead + '<span dir="auto">' + esc(it.label) + '</span>' + (it.meta ? '<span class="rmenu__meta">' + it.meta + '</span>' : '') + '</button>';
      }).join("");
      var foot = (opts.foot || []).map(function (f, k) {
        return '<button type="button" class="rbtn rbtn--block' + (f.primary ? ' rbtn--primary' : '') + (f.ghost ? ' rbtn--ghost' : '') + '" data-f="' + k + '"' + (f.disabled ? ' disabled' : '') + '>' + esc(f.label) + '</button>';
      }).join("");
      var t = document.createElement("div");
      t.innerHTML = RosterLayout.html({ surface: true, mode: list.length ? "scroll" : "stack", head: opts.head || "", body: body, bodyCls: "rmenu__list", foot: foot, footCls: "rmenu__foot",
        cls: ["rmenu rmenu--fixed"].concat(accent).join(" ") });
      var s = t.firstChild;
      m.className = s.className; m.replaceChildren.apply(m, [].slice.call(s.childNodes));
      [].forEach.call(m.querySelectorAll("[data-k]"), function (b) { b.addEventListener("click", function () { var it = list[+b.dataset.k]; if (it.keep) { it.fn(b, close, paint); return; } var f = it.fn; close(); if (f) f(); }); });   /* an item with keep leaves the menu open: it shows its own progress */
      if (opts.foot) [].forEach.call(m.querySelectorAll("[data-f]"), function (b) { b.addEventListener("click", function () { var f = opts.foot[+b.dataset.f].fn; close(); if (f) f(); }); });
    }
    paint();
    var sh = document.createElement("div"); sh.className = "rmenu-shield";   /* an open menu blocks everything outside it: a touch there only closes the menu */
    var host = [].slice.call(document.querySelectorAll("dialog[open]")).pop() || (btn.closest && btn.closest(".rpanel-box")) || document.body;   /* a modal popup makes everything outside it inert: the menu goes INSIDE the upper popup; a side panel stands above the page's layer (--z-menu + n): the menu goes inside the panel's box */
    host.appendChild(sh); host.appendChild(m);
    btn.setAttribute("aria-expanded", "true");   /* the button that opened the menu stays shown while it is open */
    if (lb) btn.setAttribute("aria-controls", m.id);

    /* the place: the kit's one mechanism (RosterLayout.place, ui/docs/layout.md "מיקום ליד פקד"): the start edge of the button (RTL: right on right), flipped when there is no
       room; below it, above it when there is no room; with room on neither side, the larger one, its height capped there (the list scrolls), never over the button */
    RosterLayout.place(m, btn, { align: opts.end ? "end" : "start", up: !!opts.up, ref: opts.ref });

    function items0() { return [].slice.call(m.querySelectorAll("button.rmenu__item, button.rmenu__head")); }   /* a head that is a button (opts.onHead) joins the walk, first */
    if (opts.onHead) m.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("button.rmenu__head")) { var f = opts.onHead; close(); f(); } });   /* on the menu itself, which stays the same element through a repaint */
    var W = innerWidth, back = null;
    function close() {
      if (done) return; done = true;
      if (back) { var b0 = back; back = null; b0(); }   /* its entry in the history goes with it (/sheet.js, RosterSheet.history) */
      m.remove(); sh.remove(); if (cur && cur.el === m) cur = null;
      if (lb) { btn.setAttribute("aria-expanded", "false"); btn.removeAttribute("aria-controls"); } else btn.removeAttribute("aria-expanded");   /* a combobox always says whether it is open */
      document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onPtr, true);
      window.removeEventListener("resize", onResize); document.removeEventListener("scroll", onScroll, true);
      if (btn.isConnected && !(lb && touch)) try { btn.focus({ preventScroll: true, focusVisible: false }); } catch (x) { /* focus returns to the button */ }   /* a select closed by a touch keeps no focus: focusing it could open the OS picker */
      document.dispatchEvent(new CustomEvent("rmenu-change"));
    }
    function away(e) { if (!m.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } }
    function onResize() { if (innerWidth !== W) close(); }   /* the width: a phone's keyboard or address bar changes only the height, and must not close it */
    function onScroll(e) { if (!m.contains(e.target)) close(); }   /* the list's own scroll is not a reason */
    function onPtr(e) { touch = e.pointerType === "touch" || e.pointerType === "pen"; }
    function onKey(e) {
      touch = false;   /* a close from the keyboard always gives the focus back */
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }   /* only the menu: a popup under it stays */
      if (e.key === "Tab") { close(); return; }
      var all = items0(), i = all.indexOf(document.activeElement); if (!all.length) return;
      var to = e.key === "ArrowDown" ? (i + 1) % all.length : e.key === "ArrowUp" ? (i - 1 + all.length) % all.length : e.key === "Home" ? 0 : e.key === "End" ? all.length - 1 : -1;
      if (to >= 0) { e.preventDefault(); go(all[to]); }
    }
    function go(el) {   /* the focus on an item, and the list scrolled (inside itself only) so it shows */
      el.focus({ preventScroll: true, focusVisible: false });
      var L = el.parentNode, a = el.getBoundingClientRect(), b = L.getBoundingClientRect();
      if (a.top < b.top) L.scrollTop -= b.top - a.top; else if (a.bottom > b.bottom) L.scrollTop += a.bottom - b.bottom;
    }
    setTimeout(function () { if (done) return; document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); window.addEventListener("resize", onResize); document.addEventListener("scroll", onScroll, true); }, 0);
    document.addEventListener("pointerdown", onPtr, true);
    if (opts.touch) touch = true;   /* opened by a touch: a close with no further input (a scroll, a resize) keeps no focus either */
    var all0 = items0().filter(function (b) { return b.classList.contains("rmenu__item"); }), on = all0.filter(function (b) { return b.getAttribute("aria-selected") === "true" || (b.getAttribute("role") === "menuitemradio" && b.getAttribute("aria-checked") === "true"); })[0] || all0[0];
    if (on) go(on);
    cur = { el: m, close: close, repaint: paint };
    /* BACK closes it, like a window (owner, 2026-11-26; ui/docs/window.md "התפריט"): the kit holds its one entry and calls close on Back; the menu never touches history */
    if (window.RosterSheet && RosterSheet.history) back = RosterSheet.history.hold(close);
    document.dispatchEvent(new CustomEvent("rmenu-change"));
    return cur;
  }

  window.RosterMenu = { open: open, current: function () { return cur ? cur.el : null; }, close: function () { if (cur) cur.close(); } };

  /* THE APP MENU (ui/docs/app-menu.md): ONE round button with the signed-in user's initial, the LAST child of every header (.rhead) once the app calls
     RosterAppMenu.attach({ items, name, onAccount }); an app that never attaches gets none. The kit writes it (a watcher, before the first paint), the CSS decides where it shows
     (kit.css: never in a short window; on a computer with a split, only at the far end of the whole screen). It opens RosterMenu with the head (name, email) and,
     last, the kit's own "יציאה" (or "כניסה"). items: a function, called on every opening, returning RosterMenu items ({ sep: true } between groups).
     name: a function returning the person's name as the app keeps it (its full-name field); it wins over FLOA_AUTH.name() for the head and the letter, and an
     empty answer falls back to it. onAccount: a function; with it the head is a button that closes the menu and calls it (the app's own account window).
     Both are read from the object on every opening and drawing, so an app may set them on it later (once it knows the person).
     RosterAppMenu.refresh(): after a sign-in, a sign-out or a new name, every button draws its letter again. */
  var USER = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#user"/></svg>';
  var LOGOUT = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#logout"/></svg>';
  var OFFLINE = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#offline"/></svg>';
  var RING = '<span class="rappmenu__ring" aria-hidden="true"></span>';   /* the download to the device: a thin ring around the letter (ui/docs/app-status.md, owner 2026-11-26) */
  var REFRESH = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#refresh"/></svg>';
  var WARN = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#warn"/></svg>';
  var appItems = null, appOpts = {}, watching = false;
  /* THE APP'S STATUS SLOT (owner 2026-11-26): the round button is where the whole app's state shows. Written by the kit's /app.js through
     RosterAppMenu.status(patch), never by an app. st.net "off": the offline symbol; st.sync "run" (the letter stays, a thin ring runs around it: it fills
     with st.syncP, 0 to 1, or glides when st.syncP is null) or "done" (the ring completes and fades), "stopped" (the warn symbol, briefly), with st.syncText
     as its name; st.dot: a new version is waiting (a dot on the letter); st.refresh: a function, the item "רענון לגרסה החדשה";
     st.line: the explanation line in the menu's head; st.bare: only the kit's own items (the sign-in and denied screens).
     Precedence: offline, then the download, then the letter (or the user symbol) with its dot. */
  var st = { net: "on", sync: "", syncText: "", syncP: null, dot: false, refresh: null, line: "", bare: false };
  function auth() { var A = window.FLOA_AUTH; return A && A.signedIn && A.signedIn() ? A : null; }
  function nameOf(A) {   /* the app's name for the person first, then Google's */
    var n = ""; if (typeof appOpts.name === "function") try { n = String(appOpts.name() || "").replace(/\s+/g, " ").trim(); } catch (x) { n = ""; }
    return n || String((A.name && A.name()) || "").trim();
  }
  function initial() {
    var A = auth(); if (!A) return "";
    var s = nameOf(A) || String((A.email && A.email()) || "").trim(); if (!s) return "";
    var g; try { g = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)[Symbol.iterator]().next().value.segment; } catch (x) { g = Array.from(s)[0]; }   /* the first grapheme, not the first code unit */
    return g.toUpperCase();
  }
  function face(b) {
    var i = initial(), h, lab = "תפריט";
    var s = st.net === "off" ? "offline" : st.sync === "run" ? "sync" : st.sync === "done" ? "done" : st.sync === "stopped" ? "stopped" : "";
    if (s === "offline") { h = '<span class="rappmenu__s">' + OFFLINE + '</span>'; lab += ". אין חיבור"; }
    else if (s === "stopped") { h = '<span class="rappmenu__s" data-sync="stopped">' + WARN + '</span>'; if (st.syncText) lab += ". " + st.syncText; }
    else if (s) { h = (i ? '<span class="rappmenu__i" dir="auto" aria-hidden="true">' + esc(i) + '</span>' : USER) + RING; if (st.syncText) lab += ". " + st.syncText; }   /* run, done and the plain letter draw the same face, so nothing is redrawn: the ring fills on, completes and fades (CSS, data-status) */
    else {
      h = (i ? '<span class="rappmenu__i" dir="auto" aria-hidden="true">' + esc(i) + '</span>' : USER) + RING + (st.dot ? '<span class="rappmenu__dot" aria-hidden="true"></span>' : '');
      if (!i) lab += ". לא מחובר"; else if (st.dot) lab += ". יש גרסה חדשה";
    }
    if (s) b.setAttribute("data-status", s); else b.removeAttribute("data-status");   /* the state in one attribute (ui/docs/app-status.md) */
    if (st.dot && !s) b.setAttribute("data-dot", ""); else b.removeAttribute("data-dot");
    var p = s === "done" ? 1 : s === "sync" && typeof st.syncP === "number" && isFinite(st.syncP) ? Math.max(0, Math.min(1, st.syncP)) : null;   /* the ring's fill: a custom property, the CSS draws it; none: it glides */
    if (p === null) { b.removeAttribute("data-rsync-p"); b.style.removeProperty("--rsync-p"); } else { b.setAttribute("data-rsync-p", ""); b.style.setProperty("--rsync-p", String(p)); }
    if (b.__face !== h) { b.__face = h; b.innerHTML = h; }
    if (b.getAttribute("aria-label") !== lab) b.setAttribute("aria-label", lab);
  }
  function appOpen(b) {
    var A = auth(), n = A ? nameOf(A) : "", mail = A ? String(A.email() || "").trim() : "";
    var onAcct = A && typeof appOpts.onAccount === "function" && !st.bare ? appOpts.onAccount : null;   /* the head opens the app's account window */
    var line = st.line ? '<span class="rmenu__sub" dir="auto" data-rapp-line>' + esc(st.line) + '</span>' : '';   /* the app's state in words (no connection): a third line, --fs-s, --text-muted */
    var inner = (n || mail ? '<b dir="auto">' + esc(n || mail) + '</b>' : '') + (n && mail ? '<span class="rmenu__sub" dir="auto">' + esc(mail) + '</span>' : '');
    var head = !(n || mail) ? (line ? '<div class="rmenu__head">' + line + '</div>' : "") : onAcct ? '<button type="button" class="rmenu__head" aria-label="' + esc((n || mail) + (n && mail ? ", " + mail : "") + ". שינוי השם") + '">' + inner + '</button>' + (line ? '<div class="rmenu__head">' + line + '</div>' : '')
      : '<div class="rmenu__head">' + inner + line + '</div>';
    open(b, function () {
      var its = (!st.bare && appItems ? appItems() : []) || [];
      var acct = A ? { label: "יציאה", icon: LOGOUT, last: true, fn: function () { Promise.resolve(A.signOut()).then(function () { location.reload(); }); } }
        : { label: "כניסה", icon: USER, last: true, fn: function () { if (window.RosterApp && RosterApp.session) RosterApp.session.signIn(); else if (window.FLOA_AUTH) FLOA_AUTH.signIn(); } };   /* one way out to Google: the kit keeps the place first */
      var fresh = typeof st.refresh === "function" ? [{ label: "רענון לגרסה החדשה", icon: REFRESH, last: true, fn: st.refresh }] : [];
      return its.concat([{ sep: true, last: true }], fresh, [acct]);
    }, { head: head, onHead: onAcct || undefined });   /* the start edge like every menu (ui/docs/layout.md "פתיחה ליד פקד"); at the window's far edge it flips by itself */
  }
  function status(patch) {
    var was = JSON.stringify([st.net, st.sync, st.syncText, st.syncP, st.dot]);
    for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) st[k] = patch[k];
    if (JSON.stringify([st.net, st.sync, st.syncText, st.syncP, st.dot]) !== was) [].forEach.call(document.querySelectorAll("[data-rappmenu]"), face);
  }
  function make() {
    var b = document.createElement("button"); b.type = "button"; b.className = "rbtn rappmenu"; b.setAttribute("data-rappmenu", "");
    b.setAttribute("aria-haspopup", "menu"); b.setAttribute("aria-label", "תפריט"); b.title = "תפריט";
    face(b);
    b.addEventListener("click", function (e) { e.stopPropagation(); appOpen(b); });   /* law 17.5: the click that opens does not close */
    return b;
  }
  function ensure(h) {
    if (h.closest('.rmenu, dialog.rsheet[data-size="s"], dialog.rsheet[data-size="sm"]')) return;   /* never in a short window or a menu */
    var b = h.querySelector(":scope > [data-rappmenu]");
    if (!b) h.appendChild(make()); else if (h.lastElementChild !== b) h.appendChild(b);   /* always the last child: an action added later goes before it */
  }
  function scan() { [].forEach.call(document.querySelectorAll(".rhead"), ensure); }
  function attach(o) {
    appItems = o && o.items ? (typeof o.items === "function" ? o.items : function () { return o.items; }) : null;
    appOpts = o || {};
    scan();
    if (watching) return; watching = true;
    var go = function () { scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true }); };   /* a header put into the page gets its button before it is painted */
    if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
  }
  window.RosterAppMenu = { attach: attach, refresh: function () { [].forEach.call(document.querySelectorAll("[data-rappmenu]"), face); }, status: status,
    button: function () { return [].filter.call(document.querySelectorAll("[data-rappmenu]"), function (x) { return x.getClientRects().length; })[0] || null; } };   /* the one on the screen now (a window anchors to it) */
})();
