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
   viewport (on-screen keyboard) followed, and nothing else: no inline handlers, no framework, no business names. */
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

  var X_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';
  function closeButton(label, icon) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "hicon rs-x"; b.setAttribute("data-close", ""); b.setAttribute("aria-label", label || "סגירה");
    b.innerHTML = icon || X_ICON;
    return b;
  }

  /* the shell around children that already exist: they are MOVED, not rebuilt, so every id, listener and test hook keeps working */
  function shell(dlg, o) {
    o = o || {};
    if (dlg.querySelector(":scope > .sheet")) return;
    var sheet = document.createElement("div"); sheet.className = "sheet";
    var head = document.createElement("div"); head.className = "sheet-head"; head.setAttribute("data-rs-drag", "");
    var bodyEl = document.createElement("div"); bodyEl.className = "sheet-body";
    var foot = null;
    var title = dlg.querySelector("[data-rs-title], h1, h2, h3");
    var kids = Array.prototype.slice.call(dlg.childNodes).filter(function (n) { return !(n.classList && n.classList.contains("rs-grab")); });
    if (title) { head.appendChild(title); kids = kids.filter(function (n) { return n !== title && !(n.contains && n.contains(title)); }); }
    else {
      title = document.createElement("h2");
      title.textContent = o.title || dlg.getAttribute("data-title") || "";
      head.appendChild(title);
    }
    if (!title.id) title.id = (dlg.id || "rs") + "T";
    if (!dlg.hasAttribute("aria-labelledby") && !dlg.hasAttribute("aria-label")) dlg.setAttribute("aria-labelledby", title.id);
    head.appendChild(closeButton(o.closeLabel || dlg.getAttribute("data-close-label"), o.icon));
    kids.forEach(function (n) {
      if (n.nodeType === 1 && n.hasAttribute("data-rs-foot")) { foot = foot || document.createElement("div"); foot.className = "sheet-foot"; foot.appendChild(n); }
      else bodyEl.appendChild(n);
    });
    sheet.appendChild(head); sheet.appendChild(bodyEl); if (foot) sheet.appendChild(foot);
    dlg.insertBefore(sheet, dlg.firstChild);
    dlg.__rsAuto = true;
  }

  /* header, body and footer from HTML strings (the pages build their dialogs this way: one call per opening) */
  var CHECK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  /* o.action = { label, icon, form (id of the form it submits), id }: the primary action as an icon button in the header, just right of the X (the catalog's "header save") */
  function actionButton(a) {
    var label = a.label || "שמירה";
    return '<button type="' + (a.form ? "submit" : "button") + '" class="rbtn rbtn--icon rbtn--primary rs-act"' + (a.form ? ' form="' + a.form + '"' : "") + (a.id ? ' id="' + a.id + '"' : "") + ' aria-label="' + label + '" title="' + label + '">' + (a.icon || CHECK_ICON) + "</button>";
  }
  function markup(o) {
    return '<div class="sheet"><div class="sheet-head" data-rs-drag><h2 id="' + (o.titleId || "dlgT") + '">' + (o.title || "") + "</h2>" +
      (o.action ? actionButton(o.action) : "") +
      '<button type="button" class="hicon rs-x" data-close aria-label="' + (o.closeLabel || "סגירה") + '">' + (o.icon || X_ICON) + "</button></div>" +
      '<div class="sheet-body">' + (o.body || "") + "</div>" + (o.foot ? '<div class="sheet-foot">' + o.foot + "</div>" : "") + "</div>";
  }
  /* o.anchor = the element that opened it: on a computer (from WIDE) a SHORT popup opens next to that control (law 3) instead of in the middle: below it, flipped above (or to its side)
     when there is no room, always inside the window, as wide as its content up to --w. On a phone, or with no anchor, nothing changes (the bottom sheet / the page's own placement). */
  function unanchor(dlg) {
    dlg.removeAttribute("data-anchored"); dlg.style.removeProperty("top"); dlg.style.removeProperty("left");
    if (dlg.__rsRo) { dlg.__rsRo.disconnect(); dlg.__rsRo = null; }
    if (dlg.__rsGo) { window.removeEventListener("resize", dlg.__rsGo); dlg.__rsGo = null; }
  }
  function anchorTo(dlg, a) {
    dlg.setAttribute("data-anchored", "");
    var G = 12, T = 4;   /* the kit's --gap and --gap-tight: the room kept from the window's edge, and from the control */
    var go = function () {
      if (!dlg.open || !a.isConnected || !wide()) return;
      var r = a.getBoundingClientRect(), w = dlg.offsetWidth, h = dlg.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
      var top = r.bottom + T, left = r.left;
      if (top + h > vh - G) {
        if (r.top - T - h >= G) top = r.top - T - h;
        else { top = Math.max(G, Math.min(r.top, vh - h - G)); left = r.right + T + w <= vw - G ? r.right + T : r.left - T - w; }
      }
      dlg.style.top = Math.round(top) + "px"; dlg.style.left = Math.round(Math.max(G, Math.min(left, vw - w - G))) + "px";
    };
    dlg.__rsGo = go; window.addEventListener("resize", go);
    if (window.ResizeObserver) { dlg.__rsRo = new ResizeObserver(go); dlg.__rsRo.observe(dlg); }   /* a popup that grows (a message, a busy state) stays inside the window */
    dlg.addEventListener("close", function () { unanchor(dlg); }, { once: true });
    go();
  }
  function render(dlg, o) {
    o = o || {};
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
  function actBtn(dlg) { return dlg.querySelector(".sheet-head > .rs-act"); }
  function setDirty(dlg, dirty) { var b = actBtn(dlg); if (!b) return; b.disabled = !dirty; b.setAttribute("aria-disabled", dirty ? "false" : "true"); }
  function busy(dlg, on) { var b = actBtn(dlg); if (!b) return; if (on) { b.setAttribute("aria-busy", "true"); b.disabled = true; } else { b.removeAttribute("aria-busy"); b.disabled = false; b.removeAttribute("aria-disabled"); } }

  function attach(dlg, opts) {
    if (dlg.__rs) return; dlg.__rs = true;
    opts = opts || {};
    if (typeof opts.beforeClose === "function") dlg.__rsVeto = opts.beforeClose;   /* beforeClose() === false vetoes a swipe or backdrop close */
    dlg.classList.add("rsheet");
    if (dlg.hasAttribute("data-title") || dlg.hasAttribute("data-rs-shell")) {
      shell(dlg, opts);
      dlg.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".rs-x") && dlg.contains(e.target)) dlg.close(); });
    }
    if (opts.from) dlg.setAttribute("data-from", opts.from);
    else if (!dlg.hasAttribute("data-from")) dlg.setAttribute("data-from", "bottom");

    /* the content slides under the header: a soft shadow shows under it while anything inside the popup is scrolled away from its top (kit.css draws it from data-scrolled) */
    dlg.addEventListener("scroll", function (e) {
      var el = e.target; if (!el || el.nodeType !== 1 || (el.closest && el.closest(".sheet-head, .sheet-foot"))) return;
      var set = dlg.__rsScrolled || (dlg.__rsScrolled = []), i = set.indexOf(el);
      if (el.scrollTop > 2) { if (i < 0) set.push(el); } else if (i >= 0) set.splice(i, 1);
      dlg.__rsScrolled = set = set.filter(function (x) { return x.isConnected && x.scrollTop > 2; });   /* a list that was drawn again is not scrolled any more */
      if (set.length) dlg.setAttribute("data-scrolled", ""); else dlg.removeAttribute("data-scrolled");
    }, { capture: true, passive: true });
    dlg.addEventListener("close", function () { dlg.__rsScrolled = []; dlg.removeAttribute("data-scrolled"); });

    var isOpen = false;
    function opened() {
      if (isOpen) return; isOpen = true;
      ensureGrab(dlg); lock(); viewport(dlg);
    }
    function closed() {
      if (!isOpen) return; isOpen = false;
      dlg.classList.remove("rs-dragging", "rs-settle"); dlg.style.removeProperty("--rs-dy");
      unlock();
    }
    new MutationObserver(function () { if (dlg.open) { opened(); ensureGrab(dlg); } else closed(); }).observe(dlg, { attributes: true, attributeFilter: ["open"], childList: true });
    dlg.addEventListener("close", closed);

    /* iron rule: whenever the sheet closes (swipe, Escape, backdrop, close button, programmatic close, a submit that closes it) the on-screen keyboard
       closes with it: the focused field inside is blurred BEFORE the close, and afterwards, if the browser handed focus back to a text field, that is blurred too */
    var blurIn = function () { var el = document.activeElement; if (el && el !== document.body && dlg.contains(el) && typeof el.blur === 'function') el.blur(); };
    var nativeClose = dlg.close.bind(dlg);
    dlg.close = function (rv) { blurIn(); nativeClose(rv); };
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

  window.RosterSheet = { WIDE: WIDE, attach: attach, open: open, render: render, shell: shell, setDirty: setDirty, busy: busy };
})();
