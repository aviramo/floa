/* Roster tab pager: the participant card's tabs (admin.js tabPager), for any page that has tabs over side-by-side pages.
   The pages sit next to each other with scroll snapping, the underline (.ptabi) follows the scroll, a page that is not shown is inert, a tap on a tab slides to it,
   the arrow keys move between tabs. The logic and the feel are the participant card's own; admin.js keeps its copy for the card and the statistics.

     RosterPager.attach({ tabsEl, box, tabs: [button...], pages: [element...], onChange(i), onNear(i) }) -> { cur, lock, go(i), apply() }

   tabsEl gets --pg (the scroll position in pages, fractional) for the underline; onChange(i) fires when a page becomes the current one; onNear(i) fires for every page
   the scroll is on or between, so a page can be drawn before it slides into view. RTL: the first page is at the right and scrollLeft runs negative. */
(function () {
  "use strict";
  var reduced = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };

  function attach(o) {
    var tabsEl = o.tabsEl, box = o.box, tabs = o.tabs, pages = o.pages;
    var T = { cur: 0, lock: 0 };
    T.mark = function (i) {
      var ch = i !== T.cur;
      T.cur = i;
      tabs.forEach(function (t, k) { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      pages.forEach(function (d, k) { d.inert = k !== i; });
      if (ch && o.onChange) o.onChange(i);
    };
    T.apply = function () { box.scrollLeft = -T.cur * box.clientWidth; tabsEl.style.setProperty("--pg", T.cur); T.mark(T.cur); };
    T.go = function (i) {
      if (o.onNear) o.onNear(i);
      box.scrollTo({ left: -i * box.clientWidth, behavior: reduced() ? "auto" : "smooth" });
      T.mark(i);
    };
    box.addEventListener("scroll", function () {
      var w = box.clientWidth;
      if (!w) return;
      var q = Math.abs(box.scrollLeft) / w;
      tabsEl.style.setProperty("--pg", q);
      if (o.onNear) { o.onNear(Math.floor(q)); o.onNear(Math.ceil(q)); }
      if (Date.now() > T.lock) { var i = Math.round(q); if (i !== T.cur) T.mark(i); }
    }, { passive: true });
    tabs.forEach(function (t, i) { t.addEventListener("click", function () { T.lock = Date.now() + 500; T.go(i); }); });   /* while sliding after a tap, no page in between is marked */
    tabsEl.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      var i = Math.min(tabs.length - 1, Math.max(0, T.cur + (e.key === "ArrowLeft" ? 1 : -1)));
      T.lock = Date.now() + 500; T.go(i); tabs[i].focus();
    });
    if (window.ResizeObserver) { var w0 = 0; new ResizeObserver(function () { var w = box.clientWidth; if (w && w !== w0) { w0 = w; box.scrollLeft = -T.cur * w; } }).observe(box); }
    return T;
  }

  window.RosterPager = { attach: attach };
})();
