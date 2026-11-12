/* Roster sheet (assets/sheet.css): the one popup every roster page uses.
   RosterSheet.attach(dialog, { from: "top" | "bottom" })   once per <dialog>; after that the page just calls dialog.showModal() / close()
   RosterSheet.open(dialog, from)                            sets the direction and opens it
   Per sheet it does: the class and direction, a grab bar at the free edge, swipe (finger or mouse) on the bar, on [data-rs-drag] areas and on the
   content edge to pull it back and close it, backdrop click, the page behind locked (scroll position kept, several sheets counted), the visible
   viewport (on-screen keyboard) followed, and nothing else: no inline handlers, no framework, no business names. */
(function () {
  "use strict";
  var html = document.documentElement, body = document.body;
  var locks = 0, savedY = 0;
  var reduced = function () { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; };

  function lock() {
    if (locks++ > 0) return;
    savedY = window.pageYOffset || 0;
    body.style.top = -savedY + "px";
    html.classList.add("rs-lock"); body.classList.add("rs-lock");
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
    dlg.style.setProperty("--rs-vvh", Math.round(v.height) + "px");
    dlg.style.setProperty("--rs-top", Math.round(v.offsetTop) + "px");
    dlg.style.setProperty("--rs-kb", Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) + "px");
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
    if (moved > Math.min(120, h * 0.25) || v > 0.55) {
      if (reduced()) { dlg.style.removeProperty("--rs-dy"); dlg.close(); return; }
      dlg.classList.add("rs-settle");
      dlg.style.setProperty("--rs-dy", (dir * (h + 24)) + "px");
      var done = false, end = function () { if (done) return; done = true; dlg.removeEventListener("transitionend", end); dlg.classList.remove("rs-settle"); dlg.style.removeProperty("--rs-dy"); if (dlg.open) dlg.close(); };
      dlg.addEventListener("transitionend", end); setTimeout(end, 320);
    } else {
      dlg.classList.add("rs-settle");
      dlg.style.setProperty("--rs-dy", "0px");
      setTimeout(function () { dlg.classList.remove("rs-settle"); dlg.style.removeProperty("--rs-dy"); }, 260);
    }
  }

  function attach(dlg, opts) {
    if (dlg.__rs) return; dlg.__rs = true;
    opts = opts || {};
    dlg.classList.add("rsheet");
    if (opts.from) dlg.setAttribute("data-from", opts.from);
    else if (!dlg.hasAttribute("data-from")) dlg.setAttribute("data-from", "bottom");

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

    /* backdrop: a press that starts and ends on the backdrop closes, a drag that merely ends there does not */
    var downOnBackdrop = false;
    dlg.addEventListener("mousedown", function (e) { downOnBackdrop = e.target === dlg; });
    dlg.addEventListener("click", function (e) { if (opts.backdrop !== false && e.target === dlg && downOnBackdrop) dlg.close(); });

    /* swipe on the bar, on [data-rs-drag] areas (pointer events: finger and mouse) */
    var drag = null;
    dlg.addEventListener("pointerdown", function (e) {
      if (e.button > 0 || drag) return;
      var h = e.target.closest(".rs-grab, [data-rs-drag]");
      if (!h || !dlg.contains(h) || e.target.closest("button, a, input, select, textarea")) return;
      drag = { id: e.pointerId, y0: e.clientY, last: e.clientY, t0: e.timeStamp, lastT: e.timeStamp, v: 0, dy: 0, h: h };
      try { h.setPointerCapture(e.pointerId); } catch (x) {}
      dlg.classList.add("rs-dragging");
    });
    dlg.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dir = direction(dlg), raw = e.clientY - drag.y0, moved = Math.max(0, raw * dir);
      drag.dy = moved * dir;
      var dt = Math.max(1, e.timeStamp - drag.lastT); drag.v = ((e.clientY - drag.last) * dir) / dt; drag.last = e.clientY; drag.lastT = e.timeStamp;
      dlg.style.setProperty("--rs-dy", drag.dy + "px");
    });
    function endPointer(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      try { d.h.releasePointerCapture(d.id); } catch (x) {}
      finish(dlg, d.dy, d.v);
    }
    dlg.addEventListener("pointerup", endPointer);
    dlg.addEventListener("pointercancel", endPointer);

    /* swipe on the content: only when the content cannot move further the way the finger pushes, so inner scrolling keeps working */
    var t = null;
    dlg.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1 || drag || e.target.closest(".rs-grab, [data-rs-drag]")) { t = null; return; }
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
        return;
      }
      if (e.cancelable) e.preventDefault();
      var moved = Math.max(0, (p.clientY - t.y) * dir);
      t.dy = moved * dir;
      var dt = Math.max(1, e.timeStamp - t.lastT); t.v = ((p.clientY - t.last) * dir) / dt; t.last = p.clientY; t.lastT = e.timeStamp;
      dlg.style.setProperty("--rs-dy", t.dy + "px");
    }, { passive: false });
    function endTouch() { var d = t; t = null; if (d && d.on) finish(dlg, d.dy, d.v); }
    dlg.addEventListener("touchend", endTouch);
    dlg.addEventListener("touchcancel", endTouch);
  }

  function open(dlg, from) {
    attach(dlg, { from: from });
    if (from) dlg.setAttribute("data-from", from);
    if (!dlg.open) dlg.showModal();
  }

  window.RosterSheet = { attach: attach, open: open };
})();
