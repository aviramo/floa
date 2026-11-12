/* ROSTER UI KIT behavior (phase 1: written and tested in isolation, NOT linked from any page yet).
   Three small behaviors the kit's CSS hooks into. No business names, framework free, CSP safe (no inline handlers, CSSOM only).
     RosterUI.kbWatch()                      html.kb-open while the on-screen keyboard is up (the add button hides under it)
     RosterUI.ptr.attach({scroller,onRefresh,enabled})   pull to refresh on the page's single scroll region
     RosterUI.swipe.init(list,{kind,store})  swipe actions on [data-swipe] rows and cards, first-use hint, one open at a time
   Markup contracts are in the catalog (sync13/component-catalog.md). Everything is transform and opacity only. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var reduced = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var rtl = function () { return (root.getAttribute("dir") || doc.dir || "ltr") === "rtl"; };

  /* ---------- keyboard watch: the visual viewport shrinks by a keyboard, not by the browser bars (more than 120px) ---------- */
  var kbOn = false;
  function kbWatch() {
    if (kbOn || !window.visualViewport) return; kbOn = true;
    var vv = window.visualViewport;
    function check() { root.classList.toggle("kb-open", window.innerHeight - vv.height > 120); }
    vv.addEventListener("resize", check); vv.addEventListener("scroll", check); check();
  }

  /* ---------- pull to refresh ---------- */
  var PTR_MAX = 72, PTR_TRIGGER = 56;
  function ptrAttach(opt) {
    var sc = opt.scroller, enabled = opt.enabled || function () { return true; };
    var ind = doc.createElement("div"); ind.className = "rptr"; ind.setAttribute("role", "status"); ind.setAttribute("aria-live", "polite");
    ind.innerHTML = '<span class="rptr__dot"></span>'; ind.hidden = true; doc.body.appendChild(ind);
    var y0 = 0, x0 = 0, pulling = false, busy = false, pull = 0;
    function set(p, state) { pull = p; ind.style.setProperty("--rptr-pull", String(p)); ind.dataset.state = state || (p >= PTR_TRIGGER ? "ready" : "pull"); }
    function end(run) {
      pulling = false;
      if (run && !busy) {
        busy = true; set(PTR_TRIGGER, "loading"); ind.setAttribute("aria-label", "מרענן");
        var done = function () { busy = false; set(0, "idle"); ind.hidden = true; };
        try { var r = opt.onRefresh(); if (r && r.then) r.then(done, done); else setTimeout(done, 400); } catch (e) { done(); }
      } else if (!busy) { set(0, "idle"); ind.hidden = true; }
    }
    sc.addEventListener("touchstart", function (e) {
      if (busy || !enabled() || doc.querySelector("dialog[open]") || e.touches.length !== 1) return;
      var t = e.target; if (t.closest && t.closest("input,textarea,select,[data-swipe].is-dragging")) return;
      if (sc.scrollTop > 0) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; pulling = true;
    }, { passive: true });
    sc.addEventListener("touchmove", function (e) {
      if (!pulling) return;
      var dy = e.touches[0].clientY - y0, dx = e.touches[0].clientX - x0;
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || sc.scrollTop > 0) { if (dy <= 0) { pulling = false; set(0, "idle"); ind.hidden = true; } return; }
      ind.hidden = false; set(Math.min(PTR_MAX, dy * 0.5));
    }, { passive: true });
    sc.addEventListener("touchend", function () { if (pulling) end(pull >= PTR_TRIGGER); }, { passive: true });
    sc.addEventListener("touchcancel", function () { if (pulling) end(false); }, { passive: true });
    return { refresh: function () { ind.hidden = false; end(true); }, destroy: function () { ind.remove(); } };
  }

  /* ---------- swipe actions ----------
     markup: <li class="rrow" data-swipe="notes"><div class="rswipe-fg">...</div><div class="rswipe"><button class="rswipe__act">...</button></div></li>
     The three-dots menu with the same actions is the non-gesture path and must exist in the markup. */
  var SW = 88;
  function swipeInit(list, opt) {
    opt = opt || {};
    var store = opt.store || localStorage;
    var key = "rk.swipe.understood", open = null;   /* one key for every list of every page: the person confirms once */
    function setX(row, x) { row.style.setProperty("--sw-x", x + "px"); }
    function close(row) { if (!row) return; row.classList.remove("is-open"); setX(row, 0); if (open === row) open = null; }
    /* RTL: the tray is at the physical left (see css), the foreground slides to the right; LTR: tray at the right, foreground slides left. */
    function dirSign() { return rtl() ? 1 : -1; }
    function openX(row) { return dirSign() * (row.querySelectorAll(".rswipe__act").length || 1) * SW; }
    function openIt(row) { if (open && open !== row) close(open); row.style.setProperty("--sw-n", String(row.querySelectorAll(".rswipe__act").length || 1)); row.classList.add("is-open"); setX(row, openX(row)); open = row; }
    var start = null, lastDrag = 0;
    list.addEventListener("pointerdown", function (e) {
      if (reduced() || e.pointerType === "mouse") return;
      var row = e.target.closest && e.target.closest("[data-swipe]");
      if (!row || !list.contains(row) || (e.target.closest && e.target.closest(".rswipe"))) { if (open && !(row && row === open)) close(open); return; }
      start = { row: row, x: e.clientX, y: e.clientY, base: row.classList.contains("is-open") ? openX(row) : 0, dragging: false, id: e.pointerId };
    });
    list.addEventListener("pointermove", function (e) {
      if (!start || e.pointerId !== start.id) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.dragging) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { start = null; return; } if (Math.abs(dx) < 8) return; start.dragging = true; start.row.classList.add("is-dragging"); try { list.setPointerCapture(e.pointerId); } catch (x) {} }
      var lim = openX(start.row), v = start.base + dx;
      v = lim > 0 ? Math.max(0, Math.min(lim, v)) : Math.min(0, Math.max(lim, v));
      setX(start.row, v);
    });
    function finish(e) {
      if (!start || (e && e.pointerId !== start.id)) return;
      var row = start.row, was = start.dragging; start = null; row.classList.remove("is-dragging");
      if (!was) return;
      lastDrag = Date.now();
      var lim = openX(row), cur = parseFloat(row.style.getPropertyValue("--sw-x")) || 0;
      if (Math.abs(cur) > Math.abs(lim) / 2) openIt(row); else close(row);
    }
    list.addEventListener("pointerup", finish); list.addEventListener("pointercancel", finish);
    /* a drag must never count as a tap (the whole row is a link), and while a row is open the first tap elsewhere only closes it */
    list.addEventListener("click", function (e) {
      if (open && !list.contains(open)) open = null;   /* the row was redrawn away (a tab switch, a refresh): nothing is open any more */
      if (e.target.closest && e.target.closest(".rhint")) { if (open) close(open); return; }   /* the hint's own button is never swallowed by the nudge */
      var inTray = e.target.closest && e.target.closest(".rswipe");
      if (!inTray && (Date.now() - lastDrag < 350 || open)) {
        if (open) close(open);
        e.preventDefault(); e.stopPropagation();
      }
    }, true);
    list.addEventListener("keydown", function (e) { if (e.key === "Escape" && open) close(open); });
    /* first use hint: ONE time for the whole system (a single key, whatever the list), and it stays until the person confirms "הבנתי".
       A banner at the top of the list plus a short nudge of the first row. Never blocks: the banner is not a popup. */
    function hint(force) {
      var seen = false; try { seen = store.getItem(key) === "1"; } catch (e) {}
      var row = list.querySelector("[data-swipe]"); if (!row || (seen && !force)) return null;
      if (list.querySelector(".rhint")) return null;
      var cap = doc.createElement("div"); cap.className = "rhint"; cap.setAttribute("role", "status");
      var tx = doc.createElement("span"); tx.className = "rhint__tx"; tx.textContent = opt.caption || "אפשר להחליק שורה לפעולות";
      var ok = doc.createElement("button"); ok.type = "button"; ok.className = "rhint__ok"; ok.textContent = "הבנתי";
      cap.appendChild(tx); cap.appendChild(ok);
      list.insertBefore(cap, list.firstChild);
      ok.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        cap.classList.add("is-gone"); setTimeout(function () { cap.remove(); }, 250);
        try { store.setItem(key, "1"); } catch (x) { /* no storage: it is shown again next visit */ }
      });
      if (!reduced()) { openIt(row); setTimeout(function () { if (open === row) close(row); }, 900); }
      return cap;
    }
    return { open: openIt, close: function () { close(open); }, hint: hint, isOpen: function () { return open; }, resetHint: function () { try { store.removeItem(key); } catch (e) {} } };
  }

  window.RosterUI = { kbWatch: kbWatch, ptr: { attach: ptrAttach }, swipe: { init: swipeInit } };
})();
