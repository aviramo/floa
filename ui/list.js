/* THE LIST (ui/, the domain's UI library): ONE list component for every app, RosterList. Its first option is SORTABLE: drag-to-reorder.
   Defined in ui/docs/list.md "רשימה שאפשר לסדר"; its looks are the .rlist-* rules and the drag states (.rsort-ghost, [data-rsort*]) in ui/css/40-list-sortable.css. An app never writes a reorder drag of its own: it only saves the new order.
   RosterList.sortable(list, opts) returns { detach }. A second attach on the same list (after a repaint) detaches the previous one by itself.
     opts.item: the selector of a place that moves (a row, a card, a section).
     opts.handle: optional. Without it the whole item is the handle; with it a drag starts only from that element of the item.
     opts.divider: optional. The selector of a divider (.rdiv) that splits the list into groups. A divider is a place that never moves.
     opts.key: how to get an id from an item: the name of its data-* attribute ("opt" reads data-opt) or a function(el).
     opts.onMove(groups, moved): groups is an array of groups, each an array of ids in the new order (no divider: one group); moved is the element
       that moved. Called only when the order really changed. It RETURNS A PROMISE of the save. The kit has already put the elements in their new
       order and shows aria-busy on the moved one until it settles; on a failure the kit puts them back in the order from before the move.
       A move made while a save runs is saved after it, in order.
   Pointer: a mouse drags after it travels more than --gap-tight; a finger after a hold of --hold (moving more than --gap first is a scroll);
   a finger on a handle drags at its first move. A press on a button, link, field, slider or [data-rsort-no] inside the item stays theirs.
   The carried item is a copy in the body (.rsort-ghost, a manual popover over the top layer); the item keeps its place unseen; the others make
   room with a transform. JS writes only the kit's variables (--rsort-x/y/w/h, --rsort-dx/dy) and attributes (data-rsort, data-rsort-slot,
   data-rsort-place, data-rsort-grip, aria-busy, aria-keyshortcuts); CSS draws the shadow, the layer, the motion and the hiding.
   Keyboard: no handle, Alt + ArrowUp/ArrowDown on the focused item; a handle that is a button, the arrows alone on it. One place each, across a
   divider too, saved through the same onMove. One aria-live region tells every move. */
(function () {
  "use strict";
  var NO = "button, a, input, select, textarea, label, [contenteditable]:not([contenteditable=false]), [role=button], [role=slider], [role=checkbox], [role=switch], [role=radio], [data-rsort-no]";
  var PASS = ".racc__head";   /* the kit's section head fills its bar: on a bar that is the handle, it is the handle's own surface, not a control of its own */
  var region = null;
  /* every wait on an element is counted in the kit's ONE counter (RosterBusy in /sheet.js): two holders never take the state off each other. Returns the end */
  function hold(el) { if (window.RosterBusy && RosterBusy.hold) return RosterBusy.hold(el); el.setAttribute("aria-busy", "true"); return function () { el.removeAttribute("aria-busy"); }; }

  function say(t) {   /* the one polite live region of the page, out of sight */
    if (!region || !region.isConnected) region = document.querySelector(".rlist-live");   /* one region per page, whoever made it first (ui/app.js speaks in this one too) */
    if (!region) {
      region = document.createElement("div"); region.className = "rlist-live"; region.setAttribute("aria-live", "polite"); region.setAttribute("aria-atomic", "true");
      document.body.appendChild(region);
    }
    region.textContent = "";
    setTimeout(function () { region.textContent = t; }, 50);   /* the same words twice are still told */
  }
  function tokens() {   /* the kit's tokens, read from a probe that kit.css draws with them (no number in this file) */
    var p = document.createElement("div"); p.className = "rlist-probe"; p.setAttribute("aria-hidden", "true"); document.body.appendChild(p);
    var cs = getComputedStyle(p), ms = function (v) { v = String(v || "0s").split(",")[0].trim(); return /ms$/.test(v) ? parseFloat(v) : parseFloat(v) * 1000; };
    var t = { tight: parseFloat(cs.width) || 0, fab: parseFloat(cs.height) || 0, gap: parseFloat(cs.paddingTop) || 0, barB: parseFloat(cs.paddingBottom) || 0,
              hold: ms(cs.animationDuration), base: ms(cs.transitionDuration) };
    p.remove(); return t;
  }
  function isButton(el) { return el.tagName === "BUTTON" || el.getAttribute("role") === "button"; }
  function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  function attach(list, opts) {
    if (!list) return { detach: function () { } };
    if (list.__rsort) list.__rsort.detach();
    var o = opts || {};
    var keyOf = typeof o.key === "function" ? o.key : function (el) { return el.getAttribute("data-" + o.key); };
    var isDiv = function (el) { return !!o.divider && el.matches(o.divider); };
    var places = function () { return [].slice.call(list.querySelectorAll(o.item + (o.divider ? ", " + o.divider : ""))); };
    var items = function () { return places().filter(function (el) { return !isDiv(el); }); };
    var handles = new WeakMap(), marked = [];
    var api = { detach: detach };
    list.__rsort = api;
    var its = items();
    if (its.length < 2) return api;   /* fewer than two items: nothing to order */

    its.forEach(function (it) {
      var h = null;
      if (o.handle) [].some.call(list.querySelectorAll(o.handle), function (x) { if (x.closest(o.item) === it) { h = x; return true; } return false; });
      if (o.handle && !h) return;
      var grip = h || it;
      if (h) handles.set(it, h);
      grip.setAttribute("data-rsort-grip", h ? "handle" : "item"); marked.push([grip, "data-rsort-grip"]);
      var kb = !h ? it : isButton(h) ? h : h.querySelector("button, [role=button], [tabindex]") || it;   /* the element that has the focus and takes the arrows */
      kb.setAttribute("aria-keyshortcuts", h && isButton(h) ? "ArrowUp ArrowDown" : "Alt+ArrowUp Alt+ArrowDown"); marked.push([kb, "aria-keyshortcuts"]);
    });

    var pend = null, drag = null, raf = 0, queue = Promise.resolve();

    /* ---------- the order: groups, moving the elements, the save ---------- */
    function groupsOf(seq) { var g = [[]]; seq.forEach(function (el) { if (isDiv(el)) g.push([]); else g[g.length - 1].push(keyOf(el)); }); return g; }
    function arrange(seq) {   /* the elements into the order of seq, each into the slot of the place it takes (slots marked before anything moves) */
      var cur = places(); if (cur.length !== seq.length || seq.some(function (el) { return cur.indexOf(el) < 0; })) return false;
      var fo = document.activeElement, keep = fo && list.contains(fo) ? fo : null;
      var marks = cur.map(function (el) { var c = document.createComment(""); el.parentNode.insertBefore(c, el); return c; });
      seq.forEach(function (el, i) { marks[i].parentNode.insertBefore(el, marks[i]); });
      marks.forEach(function (c) { c.remove(); });
      if (keep && keep.isConnected && document.activeElement !== keep) keep.focus({ preventScroll: true, focusVisible: false });
      return true;
    }
    function nameOf(el) {
      var l = el.getAttribute("aria-label"); if (l) return l;
      var t = null;
      [".rcard__t1 .rcard__tx", ".rrow__title", ".racc__title", "h1, h2, h3, h4, h5, h6"].some(function (q) { t = el.querySelector(q); return !!t; });   /* the kit's own title first, then any heading */
      return String((t || el).textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
    }
    function groupAt(seq, el) { var g = 0, div = null; for (var i = 0; i < seq.length && seq[i] !== el; i++) if (isDiv(seq[i])) { g++; div = seq[i]; } return { g: g, div: div }; }
    function tell(before, after, moved) {
      var a = groupAt(after, moved), b = groupAt(before, moved), mates = [], n = 0;
      for (var i = 0, g = 0; i < after.length; i++) { if (isDiv(after[i])) { g++; continue; } if (g === a.g) { mates.push(after[i]); if (after[i] === moved) n = mates.length; } }
      var lab = "";
      if (a.g !== b.g && a.div) { var dl = a.div.querySelector(".rdiv__l"); lab = a.div.getAttribute("aria-label") || String((dl || a.div).textContent || "").replace(/\s+/g, " ").trim(); }
      say(nameOf(moved) + ", במקום " + n + " מתוך " + mates.length + (lab ? ", בקבוצה " + lab : ""));
    }
    function commit(before, after, moved) {
      if (!arrange(after)) return;
      tell(before, after, moved);
      var groups = groupsOf(after);
      var settle = hold(moved);
      queue = queue.then(function () {
        return Promise.resolve().then(function () { return o.onMove ? o.onMove(groups, moved) : null; })
          .then(settle, function () { settle(); if (before.every(function (el) { return el.isConnected; })) arrange(before); });   /* failed: the order from before the move */
      });
    }

    /* ---------- the pointer ---------- */
    function scroller() { for (var n = list; n && n !== document.body && n !== document.documentElement; n = n.parentElement) { var oy = getComputedStyle(n).overflowY; if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n; } return null; }
    function down(e) {
      if (e.button > 0 || pend || drag) return;
      var it = e.target.closest && e.target.closest(o.item);
      if (!it || !list.contains(it) || isDiv(it) || it.getAttribute("aria-busy") === "true") return;
      var grip = o.handle ? handles.get(it) : it;
      if (!grip || !grip.hasAttribute("data-rsort-grip") || !grip.contains(e.target)) return;
      var ctl = e.target.closest(NO);
      if (ctl && ctl !== it && ctl !== grip && grip.contains(ctl) && !ctl.matches(PASS)) return;   /* a press on an inner control is the control's */
      var tk = tokens();
      pend = { it: it, x0: e.clientX, y0: e.clientY, pid: e.pointerId, touch: e.pointerType === "touch", tk: tk, timer: 0 };
      if (pend.touch && !o.handle) pend.timer = setTimeout(function () { if (pend && !drag) begin(); }, tk.hold);
      document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", cancel, true);
      document.addEventListener("keydown", esc, true); window.addEventListener("blur", cancel);
    }
    /* the carried copy looks exactly like the item at pick-up (owner 2026-11-26: a leader row's copy lost its side padding): every computed value of the item and of each
       of its descendants is written on the copy, and the item's custom properties too; on the copy itself not the ones .rsort-ghost owns (its place, size, layer, shadow, motion) */
    var GHOST_OWN = /^(position|inset|top|right|bottom|left|box-sizing|width|height|inline-size|block-size|min-|max-|margin|overflow|z-index|pointer-events|box-shadow|transition|transform|translate|scale|rotate|visibility|animation|container|contain)/;   /* physical and logical names alike */
    function keepLook(src, dst) {
      var walk = function (a, b, root) {
        if (a.nodeType !== 1 || !b.style) return;
        var cs = getComputedStyle(a);
        for (var i = 0; i < cs.length; i++) { var n = cs[i]; if (root && GHOST_OWN.test(n)) continue; b.style.setProperty(n, cs.getPropertyValue(n)); }
        for (var j = 0; j < a.children.length; j++) walk(a.children[j], b.children[j], false);
      };
      walk(src, dst, true);
    }
    function begin() {
      var p = pend; if (!p) return;
      var all = places(), k = all.indexOf(p.it);
      if (k < 0 || all.filter(function (el) { return !isDiv(el); }).length < 2) { end(); return; }
      var rects = all.map(function (el) { return el.getBoundingClientRect(); }), its = all.filter(function (el, i) { return !isDiv(el); });
      var first = rects[all.indexOf(its[0])];
      var d = drag = { p: p, all: all, R: rects, k: k, sc: scroller(), last: { x: p.x0, y: p.y0 }, seq: null,
        rtl: getComputedStyle(list).direction === "rtl", gapY: parseFloat(getComputedStyle(p.it.parentElement).rowGap) || 0,
        oneCol: its.every(function (el) { var r = rects[all.indexOf(el)]; return Math.abs(r.left - first.left) < 1 && Math.abs(r.width - first.width) < 1; }) };
      d.sc0 = d.sc ? d.sc.scrollTop : 0;
      var g = d.ghost = p.it.cloneNode(true), r = rects[k];   /* the copy that is carried: in the body, over everything, never clipped */
      keepLook(p.it, g);   /* in the body it has lost its place's context (a row's side padding that its list gives it, direction, font, inherited tokens): the computed look goes with it */
      g.removeAttribute("id"); [].forEach.call(g.querySelectorAll("[id]"), function (n) { n.removeAttribute("id"); });
      ["data-rsort-grip", "aria-keyshortcuts", "aria-busy", "tabindex", "role"].forEach(function (a) { g.removeAttribute(a); });
      [].forEach.call(g.querySelectorAll("[data-rsort-grip], [aria-keyshortcuts]"), function (n) { n.removeAttribute("data-rsort-grip"); n.removeAttribute("aria-keyshortcuts"); });
      g.classList.add("rsort-ghost"); g.setAttribute("aria-hidden", "true"); g.setAttribute("inert", ""); g.setAttribute("popover", "manual");
      g.setAttribute("data-rsort", "held"); p.it.setAttribute("data-rsort-held", "");   /* PICKED UP (owner 2026-11-26): the moment the hold ends (a mouse: the drag starts), before any move, the item is lifted: its copy, in its place, with --shadow-lg (kit.css); a finger that lets go without moving puts it down */
      var gs = getComputedStyle(p.it).direction === "rtl" ? document.documentElement.clientWidth - r.right : r.left;   /* the copy's inline-start edge, from the window's inline-start edge in its own direction (kit.css: inset-inline-start) */
      g.style.setProperty("--rsort-s", gs + "px"); g.style.setProperty("--rsort-y", r.top + "px");
      g.style.setProperty("--rsort-w", r.width + "px"); g.style.setProperty("--rsort-h", r.height + "px");
      document.body.appendChild(g); try { g.showPopover(); } catch (x) { /* no popover: a fixed element at --z-drag */ }
      all.forEach(function (el) { el.setAttribute("data-rsort-place", ""); });
      p.it.setAttribute("data-rsort-slot", "");
      list.setAttribute("data-rsort", "live");
      try { p.it.setPointerCapture(p.pid); } catch (x) { /* the pointer is gone */ }
      try { var s = window.getSelection(); if (s) s.removeAllRanges(); } catch (x) { }
      if (d.sc && !raf) raf = requestAnimationFrame(auto);
    }
    function block(e) { if (drag) e.preventDefault(); }
    function move(e) {
      if (!pend || e.pointerId !== pend.pid) return;
      var dx = e.clientX - pend.x0, dy = e.clientY - pend.y0, far = Math.sqrt(dx * dx + dy * dy);
      if (!drag) {
        if (pend.touch && !o.handle) { if (far > pend.tk.gap) end(); return; }   /* the finger moved before the hold: a scroll */
        if (far <= (pend.touch ? 0 : pend.tk.tight)) return;
        begin(); if (!drag) return;
      }
      if (!pend.it.isConnected) { cancel(); return; }   /* the list was drawn again */
      e.preventDefault();
      drag.last = { x: e.clientX, y: e.clientY };
      apply();
      if (drag.sc && !raf) raf = requestAnimationFrame(auto);
    }
    function apply() {
      var d = drag, p = d.p, R = d.R, so = d.sc ? d.sc.scrollTop - d.sc0 : 0;
      var dx = d.last.x - p.x0, dyV = d.last.y - p.y0, dy = dyV + so;   /* what the list scrolled is part of the way the item travelled; the copy is fixed and follows the finger only */
      d.ghost.style.setProperty("--rsort-dx", dx + "px"); d.ghost.style.setProperty("--rsort-dy", dyV + "px");
      var me = center(R[d.k]), cx = me.x + dx, cy = me.y + dy;
      var groups = [[]], divs = [];
      d.all.forEach(function (el, i) { if (isDiv(el)) { divs.push(i); groups.push([]); } else if (i !== d.k) groups[groups.length - 1].push(i); });
      var g = 0; divs.forEach(function (i) { if (cy > R[i].top + R[i].height / 2) g++; });   /* the group the copy is over: under a divider's middle is the group after it */
      var ins = 0;
      groups[g].forEach(function (i, n) {   /* the new place: the copy's middle against the others' middles, in reading order */
        var t = center(R[i]), before = d.oneCol ? t.y < cy : (Math.abs(t.y - cy) <= R[i].height / 2 ? (d.rtl ? t.x > cx : t.x < cx) : t.y < cy);
        if (before) ins = n + 1;
      });
      var seqI = [];
      groups.forEach(function (gr, gi) { if (gi > 0) seqI.push(divs[gi - 1]); var a = gr.slice(); if (gi === g) a.splice(ins, 0, d.k); seqI.push.apply(seqI, a); });
      d.seq = seqI;
      var shift = {};
      if (d.oneCol) {   /* one column: each place stacks after the one before it, at the gaps of the list as it was */
        var top = R[0].top;
        seqI.forEach(function (j, n) { shift[j] = { x: 0, y: top - R[j].top }; top += R[j].height + (n + 1 < R.length ? R[n + 1].top - R[n].bottom : 0); });
      } else {   /* a grid: each item goes to the cell of its new place; the place after the last of a group is the next cell in the row, or the start of the next row */
        var cs = [], ys = [];
        d.all.forEach(function (el, i) { if (isDiv(el)) return; var c = center(R[i]); if (!cs.some(function (x) { return Math.abs(x - c.x) < 1; })) cs.push(c.x); if (!ys.some(function (y) { return Math.abs(y - c.y) < 1; })) ys.push(c.y); });
        cs.sort(function (a, b) { return d.rtl ? b - a : a - b; }); ys.sort(function (a, b) { return a - b; });
        var pitch = ys.length > 1 ? Math.min.apply(null, ys.slice(1).map(function (y, i) { return y - ys[i]; })) : R[d.k].height + d.gapY;
        var own = [[]]; d.all.forEach(function (el, i) { if (isDiv(el)) own.push([]); else own[own.length - 1].push(i); });
        var gi = 0, pos = 0;
        seqI.forEach(function (j) {
          if (isDiv(d.all[j])) { gi++; pos = 0; shift[j] = { x: 0, y: 0 }; return; }
          var slots = own[gi], at;
          if (pos < slots.length) at = center(R[slots[pos]]);
          else if (slots.length) {
            var last = center(R[slots[slots.length - 1]]), ci = 0;
            cs.forEach(function (x, n) { if (Math.abs(x - last.x) < Math.abs(cs[ci] - last.x)) ci = n; });
            at = ci + 1 < cs.length ? { x: cs[ci + 1], y: last.y } : { x: cs[0], y: last.y + pitch };
          } else {
            var dv = gi > 0 ? R[divs[gi - 1]] : null;
            at = { x: cs[0], y: dv ? dv.bottom + d.gapY + R[j].height / 2 : R[0].top + R[j].height / 2 };
          }
          var c = center(R[j]); shift[j] = { x: at.x - c.x, y: at.y - c.y }; pos++;
        });
      }
      d.all.forEach(function (el, i) {
        if (i === d.k) return;
        var s = shift[i] || { x: 0, y: 0 };
        el.style.setProperty("--rsort-dx", Math.round(s.x) + "px"); el.style.setProperty("--rsort-dy", Math.round(s.y) + "px");
      });
    }
    function auto() {   /* near the top or the visible foot of the scroll area, the list scrolls that way, faster the deeper, up to --gap a frame */
      raf = 0; var d = drag; if (!d || !d.sc) return;
      if (!d.p.it.isConnected) { cancel(); return; }
      var r = d.sc.getBoundingClientRect(), z = d.p.tk.fab, max = d.p.tk.gap, y = d.last.y, v = 0;
      var top = Math.max(r.top, 0), bot = Math.min(r.bottom, window.innerHeight - d.p.tk.barB);   /* a bar fixed over the foot of the list: the edge is where it starts */
      if (z > 0) { if (y > bot - z) v = Math.min(1, (y - (bot - z)) / z) * max; else if (y < top + z) v = -Math.min(1, (top + z - y) / z) * max; }
      if (v) { var b = d.sc.scrollTop; d.sc.scrollTop = b + (v > 0 ? Math.ceil(v) : Math.floor(v)); if (d.sc.scrollTop !== b) apply(); }
      raf = requestAnimationFrame(auto);
    }
    function teardown() {
      var d = drag; drag = null;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (!d) return null;
      try { d.ghost.hidePopover(); } catch (x) { } d.ghost.remove();
      list.removeAttribute("data-rsort");
      d.all.forEach(function (el) { el.removeAttribute("data-rsort-place"); el.removeAttribute("data-rsort-slot"); el.removeAttribute("data-rsort-held"); el.style.removeProperty("--rsort-dx"); el.style.removeProperty("--rsort-dy"); if (!el.getAttribute("style")) el.removeAttribute("style"); });
      return d;
    }
    function end() {
      if (pend) clearTimeout(pend.timer);
      pend = null;
      document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("keydown", esc, true); window.removeEventListener("blur", cancel);
    }
    function eatClick(ms) {   /* the click of the press that dragged is not a tap; the next press, or --t-base, ends it */
      var stop = function (ev) { ev.stopPropagation(); ev.preventDefault(); done(); };
      var done = function () { list.removeEventListener("click", stop, true); document.removeEventListener("pointerdown", done, true); clearTimeout(t); };
      list.addEventListener("click", stop, true); document.addEventListener("pointerdown", done, true);
      var t = ms == null ? 0 : setTimeout(done, ms);
    }
    function up(e) {
      if (!pend || e.pointerId !== pend.pid) return;
      var p = pend; end();
      var d = teardown(); if (!d) return;   /* a press with no drag is a plain click */
      eatClick(p.tk.base);
      var after = d.seq ? d.seq.map(function (i) { return d.all[i]; }) : d.all;
      if (after.every(function (el, i) { return el === d.all[i]; })) { say("הסדר לא השתנה"); return; }
      commit(d.all, after, p.it);
    }
    function cancel() {   /* Escape, a cancelled pointer, leaving the window, a repaint: everything back, no save */
      var live = !!drag; end(); teardown();
      if (live) { eatClick(null); say("הסדר לא השתנה"); }
    }
    function esc(e) { if (e.key === "Escape" && drag) { e.preventDefault(); e.stopPropagation(); cancel(); } }

    /* ---------- the keyboard: one place on, across a divider too ---------- */
    function key(e) {
      if (drag || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey || e.shiftKey) return;
      var it = e.target.closest && e.target.closest(o.item); if (!it || !list.contains(it) || isDiv(it)) return;
      var h = o.handle ? handles.get(it) : null;
      if (o.handle && !h) return;
      if (!(h || it).hasAttribute("data-rsort-grip")) return;   /* an item drawn after this attach (a repaint with no new attach: a reader) is not sortable */
      var ok = h && isButton(h) ? (e.target === h && !e.altKey) : (e.altKey && (e.target === it || (h && h.contains(e.target) && !e.target.closest("input, select, textarea, [contenteditable]:not([contenteditable=false])"))));
      if (!ok) return;
      e.preventDefault(); e.stopPropagation();
      var cur = places(), k = cur.indexOf(it), j = k + (e.key === "ArrowUp" ? -1 : 1);
      if (j < 0 || j >= cur.length) return;   /* at the end of the list the arrow does nothing */
      var after = cur.slice(); after[k] = cur[j]; after[j] = it;
      var fo = e.target; commit(cur, after, it);
      if (fo.isConnected && document.activeElement !== fo) fo.focus({ preventScroll: true, focusVisible: false });
    }
    function noPick(e) {   /* a long press is a pick-up, never a text selection or a menu */
      var g = e.target.closest && e.target.closest("[data-rsort-grip]"); if (!g || !list.contains(g)) return;
      if (e.type === "selectstart" || pend || drag || e.pointerType === "touch") e.preventDefault();
    }

    list.addEventListener("pointerdown", down);
    list.addEventListener("touchmove", block, { passive: false });   /* not passive from the start: once a drag is live, the finger no longer scrolls */
    list.addEventListener("keydown", key);
    list.addEventListener("selectstart", noPick);
    list.addEventListener("contextmenu", noPick);

    function detach() {
      if (list.__rsort !== api) return;
      cancel();
      list.removeEventListener("pointerdown", down); list.removeEventListener("keydown", key); list.removeEventListener("touchmove", block, { passive: false });
      list.removeEventListener("selectstart", noPick); list.removeEventListener("contextmenu", noPick);
      marked.forEach(function (m) { m[0].removeAttribute(m[1]); });
      list.__rsort = null;
    }
    return api;
  }

  /* ================= THE LIST: RosterList.render(el, items, opts) (ui/docs/list.md) =================
     The app gives data, a stable key and the slots of ONE item; the list holds everything else: the box and its gap, the item's shell (the kit's card,
     row or section), the states, the click and the keyboard, the empty, loading and failed states, the removal with its confirm, an item's menu, the
     dividers and groups, the numbers, the reorder (RosterList.sortable), the keyed update without a repaint, the pages and the scroll memory.
     kind: "card" (in ONE .rgrid the list writes in el), "row" (direct children of el), "section" (RosterSection, direct children of el).
     grid (cards only, ui/docs/grid.md): "media" (.rgrid--media: media tiles, two columns on a phone) or "collage" (.rgrid--collage: media tiles of mixed ratios, each in the
     lowest column, "THE COLLAGE" below); none: the card grid. A media tile is content's { title, layout: "media", media } (ui/docs/card.md).
     An update compares by key: a new item is built, a gone one leaves, a moved one is moved (the same element), a kept one is compared by its signature
     (the markup content() and attrs() gave; the states are never part of it) and only a changed one is replaced. An item the person is in the middle of
     (the focus in it, a menu open from it, selected text) is not replaced or removed: it waits for the focus to leave. JS writes attributes and the
     kit's markup only; every look is kit.css. No business names.
     LIVE (SKILL "נתונים בזמן אמת"): items may be a RosterLive source: the list listens to it (opts.where, opts.sort on the client; opts.key optional, the
     source's key by default; opts.own: the list closes the source, see "THE REF" below). Every update from it, and update(array, { fx: true, origin })
     of an app that derives its array from a source, gets the kit's effects through RosterMotion (ui/live.js, looks in 43-live.css): in, out (then the
     gap closes), move (FLIP), and the change flash for "remote" only. A burst, an update without fx, an item out of view and reduced motion: none.
     Adds and removes by others are told once, merged over 2 seconds, in the polite region. With a source, remove.run and sortable.col go through
     source.write. */
  var LISTS = [], NUM = "\u0001";
  var OPEN_INNER = "button, a, input, select, textarea, label, [role=button], [role=checkbox], [role=switch], [role=radio], [role=slider], [contenteditable]:not([contenteditable=false])";
  var MEM = "floa.rlist";
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sym(n) { return '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#' + n + '"/></svg>'; }
  function memAll() { try { return JSON.parse(sessionStorage.getItem(MEM) || "{}") || {}; } catch (e) { return {}; } }
  function memGet(k) { var v = memAll()[k]; return typeof v === "number" ? v : null; }
  function memSet(k, v) { try { var m = memAll(); m[k] = v; sessionStorage.setItem(MEM, JSON.stringify(m)); } catch (e) { /* kept for this page only */ } }
  function node(html) { var t = document.createElement("template"); t.innerHTML = html; return t.content.firstElementChild; }
  function setA(el, n, v) { if (v == null) { if (el.hasAttribute(n)) el.removeAttribute(n); } else if (el.getAttribute(n) !== v) el.setAttribute(n, v); }
  function scrollerOf(el) { for (var n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) { var oy = getComputedStyle(n).overflowY; if (oy === "auto" || oy === "scroll") return n; } return null; }
  var lid = 0;

  function make(el, opts) {
    var o = opts || {}, id = ++lid, kind = o.kind || "card";
    var data = null, recs = {}, divs = {}, gextra = {}, emptyEl = null, emptyKey = "", grid = null, shown = 0, sort = null, sc = null, memT = 0, restored = false, firstDraw = true, domKeys = [];
    /* the live source (ui/docs/realtime.md, "רכיבים"): src the source the list listens to, srcOff its unsubscribe, hush > 0 while the kit writes a batch through it
       (one redraw after), failing while the failed state is shown. leaving: elements fading out ({ el, done }), still in the box, out of every count.
       heardN / heardRm / heardT: the adds and removes by others, merged over 2 seconds into one polite sentence */
    var src = null, srcOff = null, hush = 0, failing = false, leaving = [], heardN = 0, heardRm = [], heardT = 0;
    var api = {};
    var coll = kind === "card" && o.grid === "collage", lastSeq = null, colN = 0, colAt = {}, bands = [], colRo = null;
    function box() {
      if (kind !== "card") return el;
      if (!grid) { grid = document.createElement("div"); grid.className = "rlayout rlayout--grid rgrid" + (o.grid === "media" ? " rgrid--media" : coll ? " rgrid--collage" : ""); }
      return grid;
    }
    /* the items of the box in the list's order: its children, or in a collage the tiles in their columns (the order they were placed in) */
    function kidsOf() { return coll ? (lastSeq || []).filter(function (x) { return x.parentNode && x.parentNode.parentNode === grid; }) : [].slice.call(box().children); }
    /* THE COLLAGE (ui/docs/grid.md "קולאז'", option b, owner 2026-11-26). CSS makes the columns (.rgrid--collage: the --media-min tracks of the grid); THE ONE READ
       here (declared there, the "CSS before JS" exception) is how many it made, with their width and gap, from the grid's computed tracks. Each run of tiles between two
       full-width children (a divider, a group's line) gets one Layout column per track (.rgrid__col). A tile goes to the lowest column by the ratio its data gave (the
       width and height of its img or video; none: a square), never by measuring a picture; inside a column the tiles keep the list's order, so it reads row by row.
       A tile that comes later goes to the lowest column then, and the tiles already placed stay where they are; all are placed again only when the number of
       columns changes (the grid's ResizeObserver). A collage is not sorted by hand (no sortable). */
    function colRead() {
      var cs = getComputedStyle(grid), tr = String(cs.gridTemplateColumns || "").split(/\s+/).filter(function (x) { return /px$/.test(x); });
      return { n: Math.max(1, tr.length), w: parseFloat(tr[0]) || 0, g: parseFloat(cs.columnGap) || 0 };
    }
    function ratioOf(t) { var m = t.querySelector(":scope > img, :scope > video"), w = m ? +m.getAttribute("width") : 0, h = m ? +m.getAttribute("height") : 0; return w > 0 && h > 0 ? h / w : 1; }
    function collage(seq) {
      lastSeq = seq;
      var c = colRead(), n = c.n, under = c.w > 0 ? c.g / c.w : 0;   /* the gap under a tile, in column widths */
      if (n !== colN) { colN = n; colAt = {}; }   /* another number of columns: every tile is placed again */
      var parts = [], run = null, out = [], bi = 0;
      seq.forEach(function (x) { if (x.hasAttribute("data-rkey")) { if (!run) parts.push(run = []); run.push(x); } else { parts.push(x); run = null; } });
      parts.forEach(function (p) {
        if (!Array.isArray(p)) { out.push(p); return; }
        var b = bi++, band = bands[b] || (bands[b] = []);
        while (band.length < n) { var col = document.createElement("div"); col.className = "rlayout rgrid__col"; band.push(col); }
        band.splice(n).forEach(function (x) { x.remove(); });
        var hs = band.map(function () { return 0; }), at = band.map(function () { return []; });
        p.forEach(function (x) { var a = colAt[x.getAttribute("data-rkey")]; if (a && a.b === b && a.c < n) hs[a.c] += ratioOf(x) + under; });
        p.forEach(function (x) {
          var k = x.getAttribute("data-rkey"), a = colAt[k];
          if (!(a && a.b === b && a.c < n)) { var lo = 0; for (var i = 1; i < n; i++) if (hs[i] < hs[lo] - 1e-6) lo = i; a = colAt[k] = { b: b, c: lo }; hs[lo] += ratioOf(x) + under; }
          at[a.c].push(x);
        });
        band.forEach(function (col, i) {   /* each column in the list's order, moving only what is out of place (a tile fading out keeps its place) */
          var want = at[i], now = [].filter.call(col.children, function (y) { return want.indexOf(y) >= 0; });
          if (now.length === want.length && now.every(function (y, q) { return y === want[q]; })) return;
          want.forEach(function (x, q) { var ref = q ? want[q - 1].nextSibling : col.firstChild; if (ref !== x) col.insertBefore(x, ref); });
        });
        out = out.concat(band);
      });
      bands.splice(bi).forEach(function (band) { band.forEach(function (x) { x.remove(); }); });
      for (var i = 0; i < out.length; i++) if (grid.children[i] !== out[i]) grid.insertBefore(out[i], grid.children[i] || null);
      if (!colRo && window.ResizeObserver) {
        colRo = new ResizeObserver(function () { if (lastSeq && grid.isConnected && colRead().n !== colN) collage(lastSeq.filter(function (x) { return grid.contains(x); })); });
        colRo.observe(grid);
      }
    }
    function keyOf(it) { return String(o.key ? o.key(it) : src ? src.key(it) : it.id); }   /* with a source and no key of its own: the source's key */
    function clickable(it) {
      if (kind === "section") return false;
      if (o.onOpen) return !(o.canOpen && o.canOpen(it) === false);
      return kind === "card" && !!menuOf(it);   /* no target of its own and a menu: the whole card opens the menu */
    }
    function canRemove(it) { return !!o.remove && !(o.remove.can && o.remove.can(it) === false); }
    function menuOf(it) { var m = o.menu ? o.menu(it) : null; return m && m.length ? m : null; }

    /* ---------- the markup of one item (its signature: the states are not in it) ---------- */
    function itemHtml(it, at, numbered) {
      var key = keyOf(it), c = o.content(it, at) || {};
      var a = 'data-rkey="' + esc(key) + '" data-rl="' + id + '"', extra = o.attrs ? o.attrs(it) : "";
      if (extra) a += " " + extra;
      if (o.search) { a += " data-rsearch-item"; if (typeof o.search === "function") a += ' data-q="' + esc(o.search(it) || "") + '"'; }
      var mi = menuOf(it), click = clickable(it), lab = function () { return o.remove.label ? o.remove.label(it) : (o.remove.kind === "delete" ? "מחיקה" : "הסרה"); };
      var rm = canRemove(it) && !mi ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-rlist-rm aria-label="' + esc(lab()) + '" title="' + esc(lab()) + '">' + sym(o.remove.kind === "delete" ? "delete" : "x") + '</button>' : "";
      var more = mi && (o.onOpen || kind !== "card") ? '<button type="button" class="rbtn rbtn--icon" data-rlist-more aria-haspopup="menu" aria-label="עוד" title="עוד">' + sym("more") + '</button>' : "";
      if (kind === "card") {
        if (mi && !o.onOpen) a += ' aria-haspopup="menu"';   /* a card that is no target of its own and has a menu: the whole card opens the menu */
        return RosterCard.html({ title: c.title, sub: c.sub, subHtml: c.subHtml, num: c.num, lead: numbered ? NUM : c.lead, chip: c.chip, act1: (c.act1 || "") + rm + more, act2: c.act2, layout: c.layout, lines: c.lines, linesLabel: c.linesLabel, more: c.more, foot: c.foot, media: c.media, titleBtn: click ? null : c.titleBtn, click: click, attrs: a });
      }
      if (kind === "row") {
        var t = esc(c.title), lead = numbered ? NUM : c.lead, trail = (c.trail || "") + rm + more;
        return '<div class="rlayout rlayout--row rlayout--pad rrow' + (click ? " rrow--link" : "") + '" ' + a + '>' + (lead ? '<span class="rrow__lead">' + lead + '</span>' : "") +   /* Layout (ui/docs/row.md): a row, padded; main grows; main a unit column; trail a row */
          (click ? '<button type="button" class="rlayout rlayout--unit rlayout__grow rrow__main">' : '<div class="rlayout rlayout--unit rlayout__grow rrow__main">') + '<span class="rrow__title" dir="auto" title="' + t + '">' + t + '</span>' +
          (c.sub ? '<span class="rrow__sub" dir="auto">' + esc(c.sub) + '</span>' : "") + (click ? "</button>" : "</div>") + (trail ? '<span class="rlayout rlayout--row rrow__trail">' + trail + '</span>' : "") + '</div>';
      }
      var so = {}; for (var k in c) so[k] = c[k];
      so.key = c.key != null ? c.key : key; so.attrs = a + (c.attrs ? " " + c.attrs : ""); so.actions = (c.actions || "") + rm + more;
      return RosterSection.html(so);
    }

    /* ---------- the states: attributes on the shell, never a rebuild ---------- */
    function paint(r) {
      var e = r.el, it = r.it;
      if (o.current) setA(e, "aria-current", o.current(it) ? "true" : null);
      if (o.playing && kind === "card") { var p = !!o.playing(it); if (e.classList.contains("is-play") !== p) e.classList.toggle("is-play", p); }
      if (o.waiting) { var w = !!o.waiting(it); if (w && !r.wEnd) r.wEnd = hold(e); else if (!w && r.wEnd) { r.wEnd(); r.wEnd = null; } }   /* waiting for its file, in the kit's one counter with list.busy */
      if (o.disabled) {
        var d = !!o.disabled(it); setA(e, "aria-disabled", d ? "true" : null);
        if (kind === "card" && e.getAttribute("role") === "button") setA(e, "tabindex", d ? "-1" : "0");
        if (kind === "row") { var m = e.querySelector(":scope > button.rrow__main"); if (m) m.disabled = d; }
      }
    }
    function states() { if (!data) return; Object.keys(recs).forEach(function (k) { if (recs[k].el.isConnected) paint(recs[k]); }); }

    /* ---------- the groups as they are shown ---------- */
    function plan() {
      var gs = o.groups && o.groups.length ? o.groups : [{ key: "" }], by = {}, out = [];
      gs.forEach(function (g) { by[g.key] = []; });
      data.forEach(function (it) { var g = o.groups && o.groups.length ? String(o.group(it)) : ""; (by[g] || (by[gs[0].key] = by[gs[0].key] || [])).push(it); });
      var first = true;
      gs.forEach(function (g) {
        var its = by[g.key] || [];
        if (g.show === false) return;
        if (!its.length && !g.empty && !g.load && g.show !== true) return;
        out.push({ g: g, items: its, div: first ? !!g.label : !!(g.label || g.line) }); first = false;
      });
      return out;
    }
    function divHtml(g, n) {
      var ga = g.attrs ? " " + g.attrs : "";   /* the app's data-* on its divider (what the group stands for, for the app), never a class or a style */
      if (g.line && !g.label) return '<div class="rlayout rlayout--unit rdiv rdiv--line" data-rl="' + id + '" data-rgroup="' + esc(g.key) + '"' + ga + '></div>';
      var t = g.count ? '<span class="rdiv__t">' + esc(g.label) + '<span class="rdiv__n">' + n + '</span></span>' : esc(g.label);
      return '<div class="rlayout rlayout--unit rdiv" data-rl="' + id + '" data-rgroup="' + esc(g.key) + '"' + ga + '><span class="rlayout rlayout--row rdiv__l">' + t + '</span></div>';
    }
    function emptyHtml(e, status) {
      return '<div class="rlayout rempty"' + (status ? ' role="status"' : "") + '>' + (e.icon || "") + (e.title != null ? '<b>' + esc(e.title) + '</b>' : "") + (e.text ? '<span>' + esc(e.text) + '</span>' : "") +
        (e.action ? '<button type="button" class="rbtn" data-rlist-empty>' + esc(e.action.label) + '</button>' : "") + '</div>';
    }
    function emptyOf() { var e = typeof o.empty === "function" ? o.empty() : o.empty; return e || null; }

    /* ---------- the one place where the DOM follows the data ---------- */
    function inUse(e) {
      var a = document.activeElement;
      if (a && a !== document.body && e.contains(a)) return true;
      if (e.querySelector('[aria-expanded="true"]:not(.racc__head)')) return true;
      try { var s = getSelection(); if (s && !s.isCollapsed && s.anchorNode && e.contains(s.anchorNode)) return true; } catch (x) { /* none */ }
      return false;
    }
    function shellOnly(r) {
      var a = document.activeElement; if (!a || !r.el.isConnected || a !== focusEl(r)) return false;
      if (r.el.querySelector('[aria-expanded="true"]:not(.racc__head)')) return false;
      try { var s = getSelection(); if (s && !s.isCollapsed && s.anchorNode && r.el.contains(s.anchorNode)) return false; } catch (x) { /* none */ }
      return true;
    }
    function anchorOf() {   /* Safari has no overflow-anchor: the first item in view keeps its place by hand (a declared exception to "CSS before JS") */
      if (!sc || (window.CSS && CSS.supports && CSS.supports("overflow-anchor", "auto"))) return null;
      var top = sc.getBoundingClientRect().top, kids = kidsOf();
      for (var i = 0; i < kids.length; i++) { var r = kids[i].getBoundingClientRect(); if (r.bottom > top) return { el: kids[i], y: r.top }; }
      return null;
    }
    /* the effects (ui/docs/realtime.md "אפקטים"): fx is null (no effect: the app's own update, a filter, a page, a repaint) or { origin, burst }: origin "remote" (somebody else),
       "local" (my write) or "settle" (a waiting item written now, or a faded one leaving). In, out and move for every origin; the change flash only for "remote".
       A burst (fx.burst: a catch-up, a reset; or more than 5 items at once) has no per-item effect. Out of view and reduced motion: RosterMotion decides */
    function onScreen(e) {
      if (!e || !e.isConnected) return false;
      var r = e.getBoundingClientRect(); if (!r.width && !r.height) return false;
      if (r.bottom <= 0 || r.top >= innerHeight) return false;
      if (sc) { var s = sc.getBoundingClientRect(); if (r.bottom <= s.top || r.top >= s.bottom) return false; }
      return true;
    }
    function nameIn(e) { var t = e.querySelector(".rcard__t1 .rcard__tx, .rrow__title, .racc__title"); return String((t || e).textContent || "").replace(/\s+/g, " ").trim().slice(0, 80); }
    function keepPlace(seq, els) {   /* an element that stays for now (in use, or fading out) keeps its place among the others: after the one before it */
      var b = box();
      els.filter(function (e) { return e.parentNode === b; }).sort(function (x, y) { return x.compareDocumentPosition(y) & 4 ? -1 : 1; }).forEach(function (e) {
        var p = e.previousElementSibling, i = -1;
        while (p && (i = seq.indexOf(p)) < 0) p = p.previousElementSibling;
        seq.splice(i + 1, 0, e);
      });
    }
    function hear(adds, names) {   /* adds and removes by others, told once, 2 seconds after the first, in the list's polite region (never an alert) */
      if (!el.isConnected || !el.getClientRects().length) return;
      heardN += adds; heardRm = heardRm.concat(names);
      if (heardT || (!heardN && !heardRm.length)) return;
      heardT = setTimeout(function () {
        var a = heardN, r = heardRm, parts = []; heardN = 0; heardRm = []; heardT = 0;
        if (a === 1) parts.push("נוסף פריט"); else if (a > 1) parts.push("נוספו " + a + " פריטים");
        if (r.length === 1) parts.push(r[0] ? r[0] + " הוסר" : "פריט הוסר"); else if (r.length > 1) parts.push("הוסרו " + r.length + " פריטים");
        if (parts.length && el.isConnected) say(parts.join(", "));
      }, 2000);
    }
    function reconcile(status, fx) {
      if (!data) return;
      var M = window.RosterMotion; if (!M) fx = null;
      var b = box(), pl = plan(), total = 0, added = [], replaced = [], removed = [], seq = [], keep = {}, fo = document.activeElement, anc = anchorOf();
      var staleCh = [], flash = [], flashW = [], gone = [], stay = [], fades = [], drops = [], said = [], focusTo = null;
      pl.forEach(function (p) { total += p.items.length; });
      var limit = o.page ? Math.max(shown, o.page) : Infinity; if (o.page) shown = Math.min(Math.max(shown, o.page), Math.max(total, o.page));
      var drawn = 0, gi = 0; domKeys = [];
      if (pl.length && !pl[0].div) domKeys.push(pl[0].g.key); else domKeys.push(null);
      pl.forEach(function (p) {
        var g = p.g;
        if (p.div) {
          var dh = divHtml(g, p.items.length), d = divs[g.key];
          if (!d || d.sig !== dh) { var ne = node(dh); if (d && d.el.parentNode) d.el.parentNode.replaceChild(ne, d.el); d = divs[g.key] = { el: ne, sig: dh }; }
          d.used = true; seq.push(d.el); domKeys.push(g.key);
        }
        var n = 0;
        p.items.forEach(function (it) {
          if (drawn >= limit) return;
          drawn++; n++;
          var key = keyOf(it), at = { index: gi++, group: g.key, n: n }, h = itemHtml(it, at, !!g.number), r = recs[key];
          if (r && r.sig !== h) {
            var held = shellOnly(r);   /* the focus rests on the item itself (moved by the keyboard, not typing, no menu, no selection): it is drawn anew and keeps the focus */
            if (!held && inUse(r.el)) { r.stale = true; staleCh.push(r); }   /* in use: it changes once the focus leaves (its flash then) */
            else {
              var ne2 = node(h.split(NUM).join(String(n)));
              [].forEach.call(r.el.querySelectorAll("[data-rlive]"), function (x) { var y = ne2.querySelector('[data-rlive="' + x.getAttribute("data-rlive") + '"]'); if (y) y.textContent = x.textContent; });
              if (r.el.parentNode) r.el.parentNode.replaceChild(ne2, r.el);
              if (r.wEnd) { r.wEnd(); r.wEnd = hold(ne2); } (r.bs || []).forEach(function (t) { t.end(); t.end = hold(ne2); });   /* the waits go with the item to its new element */
              r.el = ne2; r.sig = h; r.stale = false; replaced.push(ne2);
              if (r.wantChange) { r.wantChange = false; flashW.push(ne2); } else if (fx && fx.origin === "remote") flash.push(ne2);   /* flash: only if this is no burst (below); flashW: a change by others that waited for the focus */
              if (held) { var nf = focusEl(r); if (nf) nf.focus({ preventScroll: true, focusVisible: false }); }
            }
          } else if (!r) { r = recs[key] = { key: key, el: node(h.split(NUM).join(String(n))), sig: h }; added.push(r.el); }
          r.it = it; r.group = g.key; r.num = !!g.number;
          keep[key] = 1; seq.push(r.el); paint(r);
        });
        if (!p.items.length && (g.load || g.empty)) {   /* a group shown with show: true and no sentence is only its place (a sortable list's first group, empty now): nothing is written for it */
          var ek = g.load ? "load" : "empty", xk = g.key + "|" + ek + "|" + (g.empty || ""), x = gextra[g.key];
          if (!x || x.k !== xk) {
            var nx = node(g.load ? '<div class="rload" aria-busy="true" data-rl="' + id + '"></div>' : '<div class="rlayout rlayout--row rlayout--pad-x rempty rempty--line" data-rl="' + id + '">' + esc(g.empty) + '</div>');
            if (x && x.el.parentNode) x.el.parentNode.replaceChild(nx, x.el); x = gextra[g.key] = { el: nx, k: xk };
          }
          x.used = true; seq.push(x.el);
        }
      });
      /* what left: gone, unless in use */
      Object.keys(recs).forEach(function (k) { if (!keep[k]) gone.push(recs[k]); });
      var burst = !!fx && (!!fx.burst || added.length + replaced.length + staleCh.length + gone.length > 5);
      var still = M && M.reduced();
      if (fx && fx.origin === "remote" && !burst) staleCh.forEach(function (r) { r.wantChange = true; });
      gone.forEach(function (r) {
        var k = r.key;
        if (!r.leaving && r.el.isConnected && inUse(r.el)) {
          if (!(fx && shellOnly(r))) {   /* in use: it leaves once the focus does (with its fade then). A source's removal of the item the focus only rests on: it goes, the focus goes on (focusAfter) */
            r.stale = true; if (fx && !burst) r.wantOut = true; stay.push(r.el); return;
          }
          focusTo = focusAfter(r);
        }
        if (r.el.parentNode) {
          removed.push(r.el);
          if (fx && fx.origin === "remote" && !burst) said.push(nameIn(r.el));
          if (fx && (!burst || r.wantOut) && !still && onScreen(r.el)) fades.push(r.el); else drops.push(r.el);   /* seen: it fades first, and leaves the layout after */
        }
        if (r.wEnd) { r.wEnd(); r.wEnd = null; }
        delete recs[k];
      });
      keepPlace(seq, stay.concat(fades, leaving.filter(function (x) { return !x.done; }).map(function (x) { return x.el; })));
      var hd = heads();   /* a block the app wrote once at the head of el (data-rlist-head: a field before the list, ui/docs/list.md: not an item) keeps its place */
      var off = kind === "card" ? 0 : hd;
      function mutate() {   /* every change to the DOM of the box, in one place: RosterMotion.flip measures before and after it */
        leaving = leaving.filter(function (x) { if (x.done) { x.el.remove(); return false; } return true; });
        drops.forEach(function (x) { x.remove(); });
        Object.keys(divs).forEach(function (k) { if (!divs[k].used) { divs[k].el.remove(); delete divs[k]; } else divs[k].used = false; });
        Object.keys(gextra).forEach(function (k) { if (!gextra[k].used) { gextra[k].el.remove(); delete gextra[k]; } else gextra[k].used = false; });
        /* the order: each in its place, moving only what is out of place */
        if (kind === "card") {
          if (seq.length) { if (grid.parentNode !== el) el.insertBefore(grid, el.children[hd] || null); } else if (grid.parentNode) grid.remove();
        }
        if (coll) collage(seq);   /* a collage: each tile in its column (THE COLLAGE above) */
        else for (var i = 0; i < seq.length; i++) if (b.children[i + off] !== seq[i]) b.insertBefore(seq[i], b.children[i + off] || null);
        if (kind !== "card") while (b.children.length > off + seq.length + (emptyEl && emptyEl.parentNode === b ? 1 : 0)) { var last = b.children[off + seq.length]; if (last === emptyEl) break; last.remove(); }
      }
      var flipped = coll ? (mutate(), fx && !burst && !still ? Promise.all(added.filter(onScreen).map(function (x) { return M.mark(x, "in"); })) : null)   /* a collage: its tiles sit in columns, out of flip's reach; a new tile still comes in */
        : fx && (!burst || fx.origin === "settle") ? M.flip(b, mutate, {}) : (mutate(), null);   /* no outs given: flip writes now, in this task */
      fades.forEach(function (x) {   /* out of every count and selector at once (no data-rkey), not reachable (inert); gone from the layout when the fade ends */
        var lv = { el: x, done: false }; leaving.push(lv);
        x.removeAttribute("data-rkey"); x.inert = true;
        M.mark(x, "out").then(function () { if (leaving.indexOf(lv) < 0) return; lv.done = true; reconcile(true, { origin: "settle" }); });
      });
      (burst ? flashW : flash.concat(flashW)).forEach(function (x) {   /* the change flash (others only); an item sliding to its place flashes once it is there */
        if (x.getAttribute("data-rfx") === "move" && flipped) flipped.then(function () { M.change(x); }); else M.change(x);
      });
      if (focusTo && focusTo.isConnected) focusTo.focus({ preventScroll: true, focusVisible: false });
      if (fx && fx.origin === "remote" && !burst && (added.length || said.length)) hear(added.length, said);
      /* the empty state of the whole list */
      var e = !seq.length ? emptyOf() : null, eh = e ? emptyHtml(e, false) : "";
      if (eh !== emptyKey) {
        if (emptyEl) emptyEl.remove(); emptyEl = null; emptyKey = eh;
        if (e) { emptyEl = node(emptyHtml(e, status && !firstDraw)); el.appendChild(emptyEl); }
      }
      if (!focusTo && fo && fo !== document.activeElement && fo.isConnected && el.contains(fo) && !fo.closest("[inert]")) fo.focus({ preventScroll: true, focusVisible: false });
      if (anc && anc.el.isConnected) { var dy = anc.el.getBoundingClientRect().top - anc.y; if (dy) sc.scrollTop += dy; }
      firstDraw = false;
      if ((o.groups || []).some(function (g) { return g.number; })) renumber();
      if (kind === "section" && (added.length || replaced.length)) secBind();   /* the open lazy bodies drawn now are filled */
      wire();
      if (added.length || replaced.length || removed.length) el.dispatchEvent(new CustomEvent("rlist-change", { bubbles: false, detail: { added: added, replaced: replaced, removed: removed } }));
      if (o.page && drawn < total) requestAnimationFrame(more);
    }
    function renumber() {
      var seg = 0, n = 0, ks = domKeys, gnum = {};
      (o.groups || []).forEach(function (g) { gnum[g.key] = !!g.number; });
      [].forEach.call(box().children, function (c) {
        if (c.classList.contains("rdiv") && c.getAttribute("data-rl") === String(id)) { seg++; n = 0; return; }
        var k = c.getAttribute("data-rkey"); if (k == null) return;
        var gk = ks[seg] != null ? ks[seg] : ""; if (!gnum[gk]) return;
        n++; var l = c.querySelector(kind === "row" ? ":scope > .rrow__lead" : ":scope > .rcard__lead");
        if (l && l.textContent !== String(n)) l.textContent = String(n);
      });
    }
    function wire() {
      if (!o.sortable || coll) return;   /* a collage's order is the data's: it is not sorted by hand */
      var its = Object.keys(recs).length;
      if (its < 2) { if (sort) { sort.detach(); sort = null; } return; }
      sort = attach(box(), { item: '[data-rkey][data-rl="' + id + '"]', handle: o.sortable.handle, divider: '.rdiv[data-rl="' + id + '"]', key: "rkey",
        onMove: function (dg, moved) {
          var all = o.groups && o.groups.length ? o.groups : [{ key: "" }], out = all.map(function () { return []; });
          dg.forEach(function (ids, i) { var gk = domKeys[i]; if (gk == null) return; var gi = all.map(function (g) { return g.key; }).indexOf(gk); if (gi >= 0) out[gi] = ids; });
          renumber();
          var p = Promise.resolve().then(function () { return src && o.sortable.col ? writePlaces(out) : o.sortable.onMove ? o.sortable.onMove(out, moved) : null; });
          p.then(null, function () { setTimeout(renumber, 0); });
          return p;
        } });
    }
    /* a reorder saved through the source: the new 1-based place (across the groups, in their order) of every item whose place changed, written to
       sortable.col by source.write, one batch, the list drawn once after it (the DOM is already in the new order). Rejects if one write fails */
    function writePlaces(groups) {
      var s = src, col = o.sortable.col, n = 0, ps = [];
      hush++;
      try {
        groups.forEach(function (ids) {
          ids.forEach(function (k) {
            n++; var r = recs[k], row = r ? s.get(s.key(r.it)) : null;
            if (!row || String(row[col]) === String(n)) return;
            var patch = {}; patch[col] = n;
            ps.push(busy(k, s.write(s.key(r.it), patch)));
          });
        });
      } finally { hush--; }
      if (ps.length && s === src) heard(s, { origin: "local", added: [], changed: [], removed: [], moved: [] });
      return Promise.all(ps);
    }
    function more() {   /* the next page, once what is left to scroll is less than the scroll area itself */
      if (!o.page || !data || !sc) return;
      var left = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
      if (left < sc.clientHeight && shown < data.length) { shown += o.page; reconcile(); }
    }

    /* ---------- loading, empty, failed ---------- */
    function heads() { var n = 0; while (el.children[n] && el.children[n].hasAttribute("data-rlist-head")) n++; return n; }
    function clear() {
      Object.keys(recs).forEach(function (k) { recs[k].el.remove(); }); recs = {};
      Object.keys(divs).forEach(function (k) { divs[k].el.remove(); }); divs = {};
      Object.keys(gextra).forEach(function (k) { gextra[k].el.remove(); }); gextra = {};
      leaving.forEach(function (x) { x.el.remove(); }); leaving = []; failing = false;
      if (emptyEl) emptyEl.remove(); emptyEl = null; emptyKey = "";
      if (grid) grid.remove();
      if (sort) { sort.detach(); sort = null; }
      var keep = [].slice.call(el.children, 0, heads());
      el.textContent = "";
      keep.forEach(function (h) { el.appendChild(h); });
    }
    function loading() {
      clear(); data = null; restored = false;
      el.classList.add("rload"); el.setAttribute("aria-busy", "true");
      if (o.load) el.setAttribute("data-load", o.load);
    }
    /* ---------- a live source as items (SKILL "נתונים בזמן אמת", "רכיבים") ----------
       The list subscribes itself: rows() null is the loading state, status "failed" is fail(refetch), "stale" keeps the rows, every event is a keyed update
       with the effects (origin and burst from the event). opts.where(row) and opts.sort(a, b) filter and sort here, on the client.
       THE REF: the list never takes a ref of its own. The app that called RosterLive.source holds the ref and closes it; with opts.own: true the list
       closes it on destroy() and when it is given another source or an array (the app hands its ref over: RosterList.render(el, RosterLive.source({…}), { own: true, … })) */
    function isSource(x) { return !!x && typeof x.on === "function" && typeof x.rows === "function"; }
    function rowsOf(s) {
      var rs = s.rows(); if (rs == null) return null;
      rs = o.where ? rs.filter(function (r) { return o.where(r); }) : rs.slice();
      if (o.sort) rs.sort(o.sort);
      return rs;
    }
    function heard(s, ev, uo) {
      if (src !== s) return;
      var rs = rowsOf(s);
      if (rs == null) {
        if (s.status === "failed") { if (!failing) showFail(s); }
        else if (data != null || failing || !el.classList.contains("rload")) loading();
        return;
      }
      if (hush) return;   /* the kit is writing a batch: drawn once after it */
      if (!ev) { draw(rs, uo); return; }
      var M = window.RosterMotion;
      draw(rs, { fx: true, origin: ev.origin, burst: !M || M.burst(ev) || !!(uo && uo.reset) });
    }
    function showFail(s) {
      fail(function () {   /* a retry that fails again does not change the source's status (no event): asked here */
        Promise.resolve(s.refetch()).then(function () { if (src === s && s.rows() === null && s.status === "failed" && !failing) showFail(s); });
      });
      failing = true;
    }
    function unsource() {
      if (!src) return;
      var s = src; src = null;
      if (srcOff) srcOff(); srcOff = null;
      if (o.own) s.close();
    }
    function update(items, uo) {
      if (isSource(items)) {
        if (items !== src) { unsource(); src = items; var s = items; srcOff = s.on(function (ev) { heard(s, ev); }); }
        heard(items, null, uo);
        return api;
      }
      unsource();   /* an array after a source: the list is the app's again */
      return draw(items, uo);
    }
    /* an array: uo.reset (back to the top, a burst), uo.fx (the effects, as for a source: a change that came from data, not a filter or a search;
       uo.origin "remote" (default) or "local"), uo.burst (no per-item effect) */
    function draw(items, uo) {
      if (items == null) { loading(); return api; }
      var wasLoading = data == null || el.classList.contains("rload") || !el.contains(kind === "card" ? (grid && grid.firstChild ? grid : emptyEl || el) : el);   /* loading, or its box was emptied from outside (a popup opened again): drawn anew */
      if (LISTS.indexOf(api) < 0) LISTS.push(api);
      if (wasLoading) { clear(); el.classList.remove("rload"); el.removeAttribute("aria-busy"); }
      data = items.slice();
      if (uo && uo.reset) { shown = 0; if (sc) sc.scrollTop = 0; if (o.memory) memSet(o.memory, 0); }
      reconcile(!wasLoading, uo && uo.fx && !wasLoading ? { origin: uo.origin || "remote", burst: !!(uo.burst || uo.reset) } : null);
      if (!restored && o.memory && sc) {   /* back where it was closed: pages drawn until the place exists */
        restored = true;
        var y = uo && uo.reset ? 0 : memGet(o.memory);
        if (y) { var guard = 50; while (o.page && shown < data.length && sc.scrollHeight < y + sc.clientHeight && guard--) { shown += o.page; reconcile(); } sc.scrollTop = y; }
      }
      return api;
    }
    function fail(retry) {
      clear(); data = null; restored = false;
      el.classList.remove("rload"); el.removeAttribute("aria-busy");
      var e = emptyOf() || {};
      el.insertAdjacentHTML("beforeend", emptyHtml({ icon: o.failIcon || e.icon, title: "לא הצלחנו לטעון", text: "בדקו את החיבור ונסו שוב.", action: { label: "ניסיון נוסף" } }, true));
      var b = el.querySelector(":scope > .rempty [data-rlist-empty]");
      if (b) b.addEventListener("click", function () { loading(); if (retry) retry(); });
    }

    /* ---------- removal ---------- */
    function focusAfter(r) {
      var its = kidsOf().filter(function (c) { return c.getAttribute("data-rkey") != null; }), k = its.indexOf(r.el);
      var to = its[k + 1] || its[k - 1] || null;
      return to ? (kind === "row" ? to.querySelector(".rrow__main") || to : kind === "section" ? to.querySelector(".racc__head") || to : to) : null;
    }
    function drop(key, word) {
      var r = recs[key]; if (!r || !data) return;
      var had = r.el.contains(document.activeElement), to = had ? focusAfter(r) : null, name = "";
      var t = r.el.querySelector(".rcard__t1 .rcard__tx, .rrow__title, .racc__title"); name = String((t || r.el).textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      r.leaving = true;
      data = data.filter(function (it) { return keyOf(it) !== key; });
      reconcile(true, { origin: "local" });   /* my own action: it fades out and the others close the gap, no flash */
      renumber();
      if (had) refocus(to);
      say((name ? name + " " : "") + (word || "הוסר"));
    }
    function refocus(to) {
      if (to && to.isConnected && !to.closest("[inert]")) to.focus({ preventScroll: true, focusVisible: false });
      else { var ea = el.querySelector("[data-rlist-empty]"); if (ea) ea.focus({ preventScroll: true, focusVisible: false }); else { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true, focusVisible: false }); } }
    }
    function askRemove(r, btn) {
      var rm = o.remove, it = r.it, del = rm.kind === "delete";
      RosterSheet.confirm({ title: esc(rm.title ? rm.title(it) : ""), text: rm.text ? esc(rm.text(it)) : "", action: rm.action || (del ? "מחיקה" : "הסרה"), anchor: btn, run: function (dlg, b) {
        if (b.getAttribute("aria-busy") === "true") return;
        var end = hold(b), s = src, word = del ? "נמחק" : "הוסר";
        if (s) {   /* through the source: it leaves now (an instant write, "local": out and the gap closed), comes back if the write fails */
          var name = nameIn(r.el), to = focusAfter(r);
          r.leaving = true;
          Promise.resolve().then(function () { return s.write(s.key(it), null, rm.run ? function () { return rm.run(it); } : undefined); }).then(function () {
            end(); if (dlg.open) dlg.close();
            var a = document.activeElement;
            if (!a || a === document.body || !a.isConnected || a.closest("[inert]") || r.el.contains(a)) refocus(to);
            say((name ? name + " " : "") + word);
          }, function () { r.leaving = false; end(); if (dlg.open) dlg.close(); });   /* failed: the source put it back; the app's message says why */
          return;
        }
        Promise.resolve().then(function () { return rm.run(it); }).then(function () {
          end(); if (dlg.open) dlg.close(); drop(r.key, word);
        }, function () { end(); if (dlg.open) dlg.close(); });   /* failed: the item stays; the app's message says why */
      } });
    }
    function openMenu(r, anchor) {
      var mi = menuOf(r.it); if (!mi) return;
      if (o.remove && canRemove(r.it)) {
        var del = o.remove.kind === "delete";
        mi = mi.concat([{ label: o.remove.action || (del ? "מחיקה" : "הסרה"), icon: sym(del ? "delete" : "x"), fn: function () { askRemove(r, anchor); } }]);   /* with a menu, the removal is its last destructive item */
      }
      RosterMenu.open(anchor, mi);
    }

    /* ---------- the one listener of the list ---------- */
    function recOf(t) {
      var b = box();
      for (var n = t && t.closest ? t.closest("[data-rkey]") : null; n && el.contains(n); n = n.parentElement ? n.parentElement.closest("[data-rkey]") : null) {
        if ((n.parentElement === b || (coll && n.parentElement.parentElement === b && n.parentElement.classList.contains("rgrid__col"))) && n.getAttribute("data-rl") === String(id)) { var r = recs[n.getAttribute("data-rkey")]; return r && r.el === n ? r : null; }
      }
      return null;
    }
    function activate(r, ev) {
      if (r.el.getAttribute("aria-disabled") === "true" || r.el.getAttribute("aria-busy") === "true") return;
      if (o.onOpen && clickable(r.it)) o.onOpen(r.it, r.el, ev);
      else if (o.menu && kind === "card") openMenu(r, r.el);
    }
    function onClick(e) {
      var r = recOf(e.target); if (!r) return;
      var mine = function (x) { return x && x.closest("[data-rkey]") === r.el; };   /* a list inside an item of this one (a section's body) has its own buttons */
      var rb = e.target.closest("[data-rlist-rm]"); if (rb && mine(rb)) { askRemove(r, rb); return; }
      var mb = e.target.closest("[data-rlist-more]"); if (mb && mine(mb)) { openMenu(r, mb); return; }
      if ((rb || mb) && r.el.contains(rb || mb)) return;
      if (kind === "section") return;
      if (kind === "card") {
        if (r.el.getAttribute("role") !== "button") return;
        var inner = e.target.closest(OPEN_INNER); if (inner && inner !== r.el && r.el.contains(inner)) return;   /* an inner control does its own thing */
        activate(r, e);
      } else {
        var m = e.target.closest(".rrow__main"); if (m && r.el.contains(m) && m.tagName === "BUTTON") activate(r, e);
      }
    }
    function focusEl(r) { return kind === "card" ? r.el : kind === "row" ? r.el.querySelector(":scope > .rrow__main") : r.el.querySelector(".racc__head"); }
    function onKey(e) {
      var r = recOf(e.target); if (!r || e.target !== focusEl(r)) return;
      if ((e.key === "Enter" || e.key === " ") && kind === "card" && r.el.getAttribute("role") === "button") { e.preventDefault(); activate(r, e); return; }
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (["ArrowDown", "ArrowUp", "Home", "End"].indexOf(e.key) < 0) return;
      var its = kidsOf().filter(function (c) { return c.getAttribute("data-rkey") != null && !c.hidden && c.getAttribute("aria-disabled") !== "true"; }), k = its.indexOf(r.el);
      var j = e.key === "Home" ? 0 : e.key === "End" ? its.length - 1 : k + (e.key === "ArrowDown" ? 1 : -1);
      if (j < 0 || j >= its.length || j === k) return;
      e.preventDefault();
      var to = recs[its[j].getAttribute("data-rkey")]; if (!to) return;
      var f = focusEl(to); if (f) { f.focus({ preventScroll: true }); reveal(to.key); }
    }
    function onOut() {   /* the focus left: what waited is written now, with the effect it waited with */
      if (Object.keys(recs).some(function (k) { return recs[k].stale; })) setTimeout(function () {
        if (el.contains(document.activeElement)) return;
        var want = Object.keys(recs).some(function (k) { return recs[k].wantChange || recs[k].wantOut; });
        reconcile(true, want ? { origin: "settle" } : null);
      }, 0);
    }
    function onScroll() {
      if (o.page) more();
      if (o.memory && restored) { clearTimeout(memT); memT = setTimeout(function () { if (sc) memSet(o.memory, sc.scrollTop); }, 120); }
    }
    function reveal(key) { var r = recs[String(key)]; if (r && r.el.isConnected) r.el.scrollIntoView({ block: "nearest" }); }
    function busy(key, p) {
      key = String(key); if (!p || !p.then) return p;
      var r = recs[key]; if (!r) return p;
      var t = { end: hold(r.el) }; (r.bs = r.bs || []).push(t);   /* a wait on the item itself, in the kit's one counter (RosterBusy) */
      var done = function () { t.end(); var rr = recs[key] || r; if (rr.bs) rr.bs = rr.bs.filter(function (x) { return x !== t; }); };
      p.then(done, done); return p;
    }
    function destroy() {
      el.removeEventListener("click", onClick); el.removeEventListener("keydown", onKey); el.removeEventListener("focusout", onOut);
      if (sc) sc.removeEventListener("scroll", onScroll);
      if (sort) { sort.detach(); sort = null; }
      if (colRo) { colRo.disconnect(); colRo = null; }
      unsource(); clearTimeout(heardT); heardT = 0;
      LISTS = LISTS.filter(function (x) { return x !== api; }); el.__rlist = null;
    }
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
    el.addEventListener("focusout", onOut);
    var secOpts = { fill: function (k, body) { var r = null; Object.keys(recs).forEach(function (x) { var c = recs[x]; if (c.el.getAttribute("data-racc-key") === k) r = c; }); if (o.fill) o.fill(r ? r.it : null, body, k); } };
    function secBind() { if (window.RosterSection) RosterSection.bind(el, secOpts); }   /* each bar is handled only by its nearest bound root (RosterSection ownerOf), so a nested list of sections binds too, and its lazy bodies fill */
    if (kind === "section") secBind();
    if (o.scope) el.classList.add(o.scope);
    sc = el.classList.contains("rlist") ? el : scrollerOf(el);
    if (sc) sc.addEventListener("scroll", onScroll, { passive: true });

    api.update = update;
    api.states = states;
    api.remove = function (key) { drop(String(key)); };
    api.busy = busy;
    api.fail = fail;
    api.item = function (key) { var r = recs[String(key)]; return r ? r.el : null; };
    api.reveal = reveal;
    api.destroy = destroy;
    api.el = el;
    api.__set = function (no) { o = no || o; if (o.scope) el.classList.add(o.scope); };
    LISTS.push(api);
    return api;
  }
  function render(el, items, opts, uo) {   /* uo: as update's ({ reset }) */
    if (!el) return null;
    var L = el.__rlist;
    if (!L) L = el.__rlist = make(el, opts);
    else if (opts) L.__set(opts);
    return L.update(items, uo);
  }
  function allStates() { LISTS = LISTS.filter(function (l) { return l.el.isConnected || document.contains(l.el); }); LISTS.forEach(function (l) { l.states(); }); }

  window.RosterList = { sortable: attach, render: render, states: allStates };
})();
