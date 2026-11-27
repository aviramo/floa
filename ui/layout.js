/* LAYOUT (ui/, the domain's UI library): the ONE way the kit arranges things. Defined in ui/docs/layout.md; its rules are .rlayout in ui/css/01-layout.css (@layer rlayout).
   Served at /layout.js, loaded before /sheet.js. Like RosterCard.html it returns markup and wires nothing; the edge (data-scrolled) and the other helpers are in /sheet.js.
   RosterLayout.html(o), the base level: a box that arranges its children in a column, a row or a grid.
     dir ("col" by default, "row", "grid"), rel ("unit": --gap-tight, "bars": 0; none: --gap), pad ("all" or "x"), wrap (true, with row),
     slots (an array of markup: an empty slot, "" or null, is not written), cls (the class of the kit component that uses it), attrs (data-* only, as markup).
   RosterLayout.html({ surface: true, ... }), the surface level: a column whose slots are fixed: head, fixed bars, ONE body, foot.
     mode ("scroll" by default: the body is the one scroll area; "stack": a plain stack with --gap, the body does not scroll: the short window),
     head (the kit's header markup: it becomes the head slot), bars (an array, each markup or { html, quick: true }), body (markup), bodyCls ("rlist" when the
     body is a list), foot (markup: none, no foot), cls, attrs. footCls: the foot's old class name, kept beside the new one until stage 6 of the migration.
   RosterLayout.wrap(el, o): the same surface round children that already exist: they are MOVED, not rebuilt, so every id and listener stays. o: mode, cls, bodyCls,
     footCls, head (an element: it becomes the head slot), foot(node) (true: that child goes to the foot), keep(node) (true: that child stays outside the surface,
     beside it: a sheet's grab strip). The surface is put as el's first child and returned.
   RosterLayout.surface(el, o): el ITSELF becomes the surface, in place (a pane of the page, a panel the app draws): its header child is the head slot, its
     body child (o.body, or the last element child that is not a style or a script) the body slot. o: mode, body. Called again whenever the children are replaced.
   RosterLayout.body(el): the body of the surface el, or of the first surface inside el (a dialog, a panel). An app never looks for .sheet-body or .rpopup-body.
   No business names, no framework, no inline handlers. */
(function () {
  "use strict";
  function cls(list) { return list.filter(Boolean).join(" "); }
  /* the head slot is the kit's header itself (never a wrapper round it): its own first tag gets the slot's class */
  function headSlot(markup) {
    var m = /^(\s*<[a-zA-Z][\w-]*)([^>]*)>/.exec(markup || "");
    if (!m) return markup || "";
    var attrs = m[2], c = /\sclass="([^"]*)"/.exec(attrs);
    attrs = c ? attrs.replace(c[0], ' class="rlayout__head ' + c[1] + '"') : ' class="rlayout__head"' + attrs;
    return m[1] + attrs + ">" + markup.slice(m[0].length);
  }
  function surfaceCls(o) { return cls(["rlayout rlayout--surface", o.mode === "stack" && "rlayout--stack", o.cls]); }
  function html(o) {
    o = o || {};
    var at = o.attrs ? " " + o.attrs : "";
    if (o.surface) {
      var bars = (o.bars || []).filter(function (b) { return b && (typeof b === "string" || b.html); }).map(function (b) {
        return typeof b === "string" ? '<div class="rlayout__bar">' + b + "</div>" : '<div class="rlayout__bar"' + (b.quick ? " data-rquick" : "") + ">" + b.html + "</div>";
      }).join("");
      return '<div class="' + surfaceCls(o) + '"' + at + ">" + (o.head ? headSlot(o.head) : "") + bars +
        '<div class="' + cls(["rlayout__body", o.bodyCls]) + '">' + (o.body || "") + "</div>" +   /* exactly one body, also while it is still empty (it waits for its content) */
        (o.foot ? '<div class="' + cls(["rlayout__foot", o.footCls]) + '">' + o.foot + "</div>" : "") + "</div>";
    }
    var c = cls(["rlayout", o.dir === "row" && "rlayout--row", o.dir === "grid" && "rlayout--grid", o.rel === "unit" && "rlayout--unit", o.rel === "bars" && "rlayout--bars",
      o.pad === "all" && "rlayout--pad", o.pad === "x" && "rlayout--pad-x", o.wrap && "rlayout--wrap", o.cls]);
    return '<div class="' + c + '"' + at + ">" + (o.slots || []).filter(function (s) { return s != null && s !== ""; }).join("") + "</div>";
  }
  function wrap(el, o) {
    o = o || {};
    var s = document.createElement("div"); s.className = surfaceCls(o);
    var body = document.createElement("div"); body.className = cls(["rlayout__body", o.bodyCls]);
    var foot = null;
    var kids = Array.prototype.slice.call(el.childNodes).filter(function (n) { return !(o.keep && o.keep(n)) && n !== o.head; });
    if (o.head) { o.head.classList.add("rlayout__head"); s.appendChild(o.head); }
    kids.forEach(function (n) {
      if (n.nodeType === 1 && o.foot && o.foot(n)) { foot = foot || document.createElement("div"); foot.className = cls(["rlayout__foot", o.footCls]); foot.appendChild(n); }
      else body.appendChild(n);
    });
    s.appendChild(body); if (foot) s.appendChild(foot);
    el.insertBefore(s, el.firstChild);
    return s;
  }
  /* in place: el (a pane of the page, a panel the app draws) IS the surface. Its children stay where they are: its header child becomes the head slot and
     its body child (o.body, or the last element child that is not a style, a script or a template) the body slot. Called again after the children are replaced */
  function surface(el, o) {
    o = o || {};
    if (!el || !el.classList) return null;
    el.classList.add("rlayout", "rlayout--surface"); if (o.mode === "stack") el.classList.add("rlayout--stack");
    var kids = Array.prototype.filter.call(el.children, function (n) { return !/^(STYLE|SCRIPT|TEMPLATE)$/.test(n.tagName); });
    var head = kids.filter(function (n) { return n.tagName === "HEADER" || n.classList.contains("rhead"); })[0];
    if (head && head === kids[0]) head.classList.add("rlayout__head");
    var b = o.body || kids.filter(function (n) { return n !== head && !n.classList.contains("rlayout__bar") && !n.classList.contains("rlayout__foot"); }).pop();
    if (b) b.classList.add("rlayout__body");
    return el;
  }
  function body(el) {
    if (!el || !el.classList) return null;
    var s = el.classList.contains("rlayout--surface") ? el : el.querySelector(".rlayout--surface");
    return s ? s.querySelector(":scope > .rlayout__body") : null;
  }
  /* PLACE NEXT TO A CONTROL (ui/docs/layout.md "מיקום ליד פקד", "פתיחה ליד פקד", owner 2026-11-26): the ONE mechanism that puts a surface beside its anchor (a menu, a short
     window with an anchor). The direction is read from the ANCHOR; the surface's inline-start edge stands on the anchor's inline-start edge (RTL: right on right)
     and grows toward inline-end, flipped to the anchor's other edge when there is no room. JS writes only --rplace-s (from the window's inline-start edge, in the
     surface's own direction) and --rplace-t; kit.css ([data-rplace]) puts them in inset-inline-start and inset-block-start. Always --gap inside the visible window.
     RosterLayout.place(el, anchor, o): anchor is an element or a rectangle (a DOMRect, e.g. a text selection: its direction is the surface's); o.side "below" (default: below, above when there is no room) or "beside" (on the anchor's inline-end side, its start side when
     there is no room); o.align "start" (default), "end" (which edge is tried first) or "center" (on the anchor's middle); o.gap (px, default --gap-tight); o.bottom (px: where the free area ends,
     default the top of the app's bottom bar, --bar-b); o.up (always above, from o.ref's top when given); o.none: with no room below or above, "cap" (default:
     the side with more room, the height capped there with max-height, the surface's list scrolls) or "beside" (beside the anchor instead).
     A containing dialog that is transformed is corrected for (measured once after placing). RosterLayout.unplace(el): the surface back to its own placement. */
  function tok(name, d) { var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)); return isNaN(v) ? d : v; }
  function place(el, anchor, o) {
    o = o || {};
    var G = tok("--gap", 12), T = o.gap != null ? o.gap : tok("--gap-tight", 4);
    var VW = document.documentElement.clientWidth || innerWidth, VH = o.bottom != null ? o.bottom : innerHeight - (window.RosterSheet && RosterSheet.barB ? RosterSheet.barB() : 0);
    var isEl = !!(anchor && anchor.nodeType === 1), r = isEl ? anchor.getBoundingClientRect() : anchor, w = el.offsetWidth, h = el.offsetHeight, top, left;   /* an element, or a rectangle (a DOMRect: a text selection) */
    var rtl = getComputedStyle(isEl ? anchor : el).direction === "rtl", end = o.align === "end", mid = o.align === "center";
    var fits = function (x) { return x >= G && x + w <= VW - G; };
    var pick = function (a, b) { return fits(a) || !fits(b) ? a : b; };
    var s = rtl ? r.right - w : r.left, e = rtl ? r.left : r.right - w;   /* aligned on the anchor's start edge, on its end edge */
    var aft = rtl ? r.left - T - w : r.right + T, bef = rtl ? r.right + T : r.left - T - w;   /* beside it: on its inline-end side, on its start side */
    var beside = function () { top = Math.max(G, Math.min(r.top, VH - G - h)); left = pick(aft, bef); };
    if (o.side === "beside") beside();
    else {
      left = mid ? r.left + r.width / 2 - w / 2 : end ? pick(e, s) : pick(s, e);   /* center: on the anchor's middle, kept inside the window below */
      var below = VH - G - (r.bottom + T), above = r.top - T - G;
      if (o.up) top = (o.ref ? o.ref.getBoundingClientRect().top : r.top) - T - h;
      else if (h <= below) top = r.bottom + T;
      else if (h <= above) top = r.top - T - h;
      else if (o.none === "beside") beside();
      else { el.style.maxHeight = Math.floor(Math.max(above, below)) + "px"; h = el.offsetHeight; top = above > below ? r.top - T - h : r.bottom + T; }   /* never over its anchor */
    }
    top = Math.max(G, Math.min(top, VH - G - h));
    left = Math.max(G, Math.min(left, VW - G - w));
    var startD = getComputedStyle(el).direction === "rtl" ? VW - (left + w) : left;   /* the distance from the window's inline-start edge, in the surface's own direction */
    el.setAttribute("data-rplace", "");
    el.style.setProperty("--rplace-s", Math.round(startD) + "px"); el.style.setProperty("--rplace-t", Math.round(top) + "px");
    /* a containing dialog that is transformed (a sheet sliding, a moved panel) makes fixed relative to it: measured once and corrected by the difference */
    var got = el.getBoundingClientRect(), dx = left - got.left, dy = top - got.top;
    if (Math.abs(dx) > .5 || Math.abs(dy) > .5) {
      var elRtl = getComputedStyle(el).direction === "rtl";
      el.style.setProperty("--rplace-s", Math.round(startD + (elRtl ? -dx : dx)) + "px"); el.style.setProperty("--rplace-t", Math.round(top + dy) + "px");
    }
    return el;
  }
  function unplace(el) { if (!el) return; el.removeAttribute("data-rplace"); el.style.removeProperty("--rplace-s"); el.style.removeProperty("--rplace-t"); }

  /* THE LIST'S TOP BLOCK, the tile that comes back on scroll (ui/docs/list.md, הבלוק העליון, and "אריח שחוזר בגלילה"; owner 2026-11-26: on a phone only,
     in one slide, only where marked). The tile is [data-rquick], the sibling right before its list's scroll area. CSS does everything (ui/css/40b-list-top.css):
     this helper only says the direction and the height, as attributes and one kit variable:
       data-rq-hide on the tile: hidden (a phone; a run down of --fab, once the list is scrolled past the tile, and only when there is room to hide it);
         a run up of --gap brings it back; the top of the list always shows it. A tile with the focus or with something open from it stays (CSS).
       data-rq-float on the tile: shown while the list is scrolled (its edge, or on a phone its floating shadow).
       data-rq-off on the tile: out of its surface's view, with no box or outside the surface's width (a page of a pager scrolled away). CSS cannot know
         where a box is scrolled to, and the header's edge needs it: a tile out of view does not take the header's edge (40b-list-top.css, "never two edges").
       --rq-h on the tile's parent: the tile's height (a ResizeObserver; CSS cannot know it), the room the list leaves for it on a phone.
     One scroll listener (capture, passive) and one MutationObserver for every tile; an app writes nothing but the attribute. */
  (function () {
    var PHONE = window.matchMedia ? window.matchMedia("(width < 760px)") : null;   /* the kit's breakpoint (the same as in kit.css) */
    var seen = typeof WeakSet === "function" ? new WeakSet() : null, ro = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { size(e.target); off(e.target); }); }) : null;
    function size(t) { var p = t.parentElement; if (!p) return; var h = Math.round(t.getBoundingClientRect().height); if (p.style.getPropertyValue("--rq-h") !== h + "px") p.style.setProperty("--rq-h", h + "px"); }
    function setA(el, n, on) { if (on !== el.hasAttribute(n)) { if (on) el.setAttribute(n, ""); else el.removeAttribute(n); } }
    function off(t) {   /* out of its surface's view: no box (a hidden pane; the ResizeObserver sees it come and go), or beside the surface (a pager's page scrolled away) */
      var s = t.closest(".rlayout--surface"), r = t.getBoundingClientRect(), v = s ? s.getBoundingClientRect() : r;
      setA(t, "data-rq-off", !r.width || r.right <= v.left + 1 || r.left >= v.right - 1);
    }
    function watch(t) { if (seen) { if (seen.has(t)) return; seen.add(t); } size(t); if (ro) ro.observe(t); }
    function scan() {
      [].forEach.call(document.querySelectorAll("[data-rquick]"), function (t) {
        watch(t); off(t);
        var sc = t.nextElementSibling;   /* a list drawn again starts at its top: the tile is shown */
        if (t.hasAttribute("data-rq-hide") && (!sc || sc.scrollTop <= 2)) { setA(t, "data-rq-hide", false); setA(t, "data-rq-float", false); if (sc && sc.__rq) sc.__rq.last = sc.scrollTop; }
      });
    }
    function onScroll(e) {
      var sc = e.target; if (!sc || sc.nodeType !== 1) return;
      if (sc.scrollLeft !== (sc.__rqx || 0)) { sc.__rqx = sc.scrollLeft; [].forEach.call(sc.querySelectorAll("[data-rquick]"), off); }   /* a sideways scroll (a pager): the tiles in it came into view or left it */
      var t = sc.previousElementSibling; if (!t || !t.hasAttribute("data-rquick")) return;
      var max = Math.max(0, sc.scrollHeight - sc.clientHeight), st = Math.min(Math.max(0, sc.scrollTop), max);   /* an elastic bounce past an end is no move */
      var s = sc.__rq || (sc.__rq = { last: st, down: 0, up: 0 }), d = st - s.last; s.last = st;
      var hidden = t.hasAttribute("data-rq-hide"), th = t.offsetHeight, fab = tok("--fab", 0), gap = tok("--gap", 0);
      if (st <= 2 || !(PHONE && PHONE.matches) || max < th + fab) { hidden = false; s.down = 0; s.up = 0; }   /* the top, a computer, or a short list: always shown */
      else if (d > 0) { s.down += d; s.up = 0; if (!hidden && s.down >= fab && st > th) hidden = true; }
      else if (d < 0) { s.up -= d; s.down = 0; if (hidden && s.up >= gap) hidden = false; }
      setA(t, "data-rq-hide", hidden);
      setA(t, "data-rq-float", !hidden && st > 2);
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    var start = function () { scan(); new MutationObserver(scan).observe(document.body, { childList: true, subtree: true }); };
    if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  })();
  window.RosterLayout = { html: html, wrap: wrap, surface: surface, body: body, place: place, unplace: unplace };
})();
