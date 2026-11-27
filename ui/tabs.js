/* THE TABS (ui/, the domain's UI library): ONE tab bar for every app. Defined in ui/docs/tabs.md; its looks are .rtabs/.rtab in ui/css/12-tabs.css.
   The app writes the markup (role="tablist", role="tab" with aria-controls and data-tab, role="tabpanel" with hidden on all but one).
   RosterTabs.attach(tablist, opts) (also .bind) wires the click, the keyboard (roving tabindex, an arrow selects at once, Home/End), the memory and,
   on request, the finger swipe between panels. Only what CSS cannot do: it flips aria-selected, tabindex and hidden; the looks read those.
     opts.key: a stable id of the bar for the memory (floa.rtabs in localStorage); none: the markup's selected tab on every drawing.
     opts.onChange(name, tab, panel): called on every change; an "rtabs-change" event ({ name }) is also sent on the bar.
     opts.swipe: true lets a horizontal finger swipe on a panel select the next or previous tab (never one that starts in the system's edge zone: /swipe.js, loaded first). The new panel enters with data-rtabs-enter
       (kit.css: transform and opacity only, none under reduced motion); the attribute goes away on animationend.
   Returns { go(name), cur() }. */
(function () {
  var MEM = "floa.rtabs";
  function load() { try { return JSON.parse(localStorage.getItem(MEM) || "{}") || {}; } catch (e) { return {}; } }
  function save(key, name) { try { var m = load(); m[key] = name; localStorage.setItem(MEM, JSON.stringify(m)); } catch (e) { } }
  function on(t) { return t.getAttribute("aria-disabled") !== "true"; }

  function attach(bar, opts) {
    opts = opts || {};
    function tabs() { return Array.prototype.slice.call(bar.querySelectorAll('[role="tab"]')); }
    function panel(t) { var id = t.getAttribute("aria-controls"); return id ? document.getElementById(id) : null; }
    function byName(n) { return tabs().filter(function (t) { return t.dataset.tab === n; })[0]; }
    function current() { return tabs().filter(function (t) { return t.getAttribute("aria-selected") === "true"; })[0] || tabs()[0]; }
    function rtl() { return getComputedStyle(bar).direction === "rtl"; }
    /* the selected tab is brought into view inside the strip ONLY: never scrollIntoView, which scrolls every scrolling ancestor too (a list holding the tabs jumped on attach).
       The overflow on each side of the strip's box is measured on the screen's x axis, so the step is the same in RTL and LTR: the strip moves by exactly that much */
    function reveal(t) {
      var b = bar.getBoundingClientRect(), r = t.getBoundingClientRect(), d = 0;
      if (!b.width || !r.width) return;   /* hidden: nothing to show */
      if (r.x < b.x) d = r.x - b.x;
      else if (r.x + r.width > b.x + b.width) d = Math.min(r.x - b.x, r.x + r.width - (b.x + b.width));   /* a tab wider than the strip: no further than its near edge */
      if (d) bar.scrollLeft += d;
    }

    function select(t, how) {
      if (!t || !on(t)) return;
      var was = current();
      tabs().forEach(function (x) {
        var me = x === t, p = panel(x);
        x.setAttribute("aria-selected", me ? "true" : "false");
        x.setAttribute("tabindex", me ? "0" : "-1");
        if (p) { if (me) p.removeAttribute("hidden"); else p.setAttribute("hidden", ""); }
      });
      reveal(t);
      if (how && how.focus) t.focus();
      if (how && how.enter && was !== t) { var p = panel(t); if (p) p.setAttribute("data-rtabs-enter", how.enter); }
      if (opts.key) save(opts.key, t.dataset.tab);
      if (was !== t || (how && how.first)) {
        if (opts.onChange) opts.onChange(t.dataset.tab, t, panel(t));
        bar.dispatchEvent(new CustomEvent("rtabs-change", { detail: { name: t.dataset.tab } }));
      }
    }
    /* the next enabled tab in a step (+1 toward the end, -1 toward the start), round */
    function step(from, d) {
      var all = tabs(), i = all.indexOf(from);
      for (var k = 1; k <= all.length; k++) { var t = all[(i + d * k + all.length * k) % all.length]; if (on(t)) return t; }
      return from;
    }

    bar.addEventListener("click", function (e) { var t = e.target.closest('[role="tab"]'); if (t && bar.contains(t)) select(t); });
    bar.addEventListener("keydown", function (e) {
      var t = e.target.closest('[role="tab"]'); if (!t) return;
      var all = tabs().filter(on), go = null, back = rtl() ? "ArrowRight" : "ArrowLeft", fwd = rtl() ? "ArrowLeft" : "ArrowRight";
      if (e.key === fwd) go = step(t, 1);
      else if (e.key === back) go = step(t, -1);
      else if (e.key === "Home") go = all[0];
      else if (e.key === "End") go = all[all.length - 1];
      if (!go) return;
      e.preventDefault();
      select(go, { focus: true });
    });

    if (opts.swipe) {
      var x0 = null, y0 = 0;
      tabs().forEach(function (t) {
        var p = panel(t); if (!p) return;
        p.addEventListener("animationend", function (e) { if (e.target === p) p.removeAttribute("data-rtabs-enter"); });
        p.addEventListener("touchstart", function (e) {
          x0 = null;
          if (e.touches.length !== 1 || e.target.closest("input, textarea, select, [contenteditable], .rrange")) return;
          if (window.RosterSwipe && RosterSwipe.fromEdge(e.touches[0].clientX)) return;   /* a touch from the screen's edge is the system's Back, not a tab change (/swipe.js) */
          x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
        }, { passive: true });
        p.addEventListener("touchend", function (e) {
          if (x0 === null) return;
          var c = e.changedTouches[0], dx = c.clientX - x0, dy = c.clientY - y0, min = parseFloat(getComputedStyle(bar).getPropertyValue("--ctl")) || 44;
          x0 = null;
          if (Math.abs(dx) < min || Math.abs(dx) < Math.abs(dy) * 2) return;
          /* the finger pulls the next panel in from the end side: in RTL the end is on the left, so a swipe to the right goes forward */
          var d = (dx > 0) === rtl() ? 1 : -1, to = step(current(), d);
          if (to !== current()) select(to, { enter: d > 0 ? "end" : "start" });
        }, { passive: true });
      });
    }

    var first = current();
    if (opts.key) { var n = load()[opts.key], m = n && byName(n); if (m && on(m)) first = m; }
    select(first, { first: true });
    return { go: function (n) { select(byName(n)); }, cur: function () { return current().dataset.tab; } };
  }
  window.RosterTabs = { attach: attach, bind: attach };
})();
