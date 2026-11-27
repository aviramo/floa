/* THE SECTION (ui/, the domain's UI library): ONE section header, and the section it opens, for every app. Defined in ui/docs/section.md;
   its looks are .racc in ui/css/20-section.css. An app never writes a section's markup itself, not even with the kit's classes, and keeps no open/closed map of its own.
   RosterSection.html(o) returns the markup of one section:
     key (required): a stable id ("viv:<id>:start"); the memory, the body's id and aria-controls come from it.
     title (text, required: the kit escapes it), sub (text on the same line, muted), count (a number; null or missing: none; 0 is shown),
     time (a time or a length as text), actions (markup: icon buttons only; one with data-racc-open opens the section before its own action runs, never closes it),
     fold (false: a fixed section, always open, no arrow, no click), open (the state when nothing is remembered; closed by default),
     level (the heading level, 2 to 4, 3 by default), body (markup), lazy (true: the body is built on its first opening, by opts.fill of bind),
     attrs (the app's own attributes on .racc, data-* only), scope (a kit scope class on .racc, e.g. "raccent-2"), remember (false: open is the state on every drawing; nothing is read from or written to the memory).
   An empty slot is not written. An open body with nothing in it is not written either: the section is its bar alone, with no arrow and no click.
   RosterSection.bind(root, opts) wires the click, the keyboard and the memory of every section under root (one listener per root, kept on the root itself; binding again swaps opts
     and fills the open lazy bodies drawn since; a root bound off the page works once it is inserted). opts.fill(key, bodyEl) builds a lazy body. Roots may nest (a root inside another section's body):
     each section belongs to the nearest bound root above it, which alone turns its bar and fills its lazy body with its own fill. A click that starts in a control of the bar that is not the head
     (a button, a link, a field, a label, any [role=button]) does not fold, with no stopPropagation in the app.
   RosterSection.set(key, open) opens or closes a section from code and remembers it; RosterSection.isOpen(key) is its state.
   RosterSection.show(sec, open) turns one drawn section without storing it (the search's way), RosterSection.saved(key) is the stored state or null.
   Every opening and closing sends "racc-change" on the section, with { key, open }.
   Memory: localStorage "floa.racc" (key -> open), wrapped in try/catch; kept across visits; the page works without it. A section opened by a search is drawn
   with open and not stored. Everything CSS can do is in kit.css (layout, the motion, sticky bars, hiding a closed body); this file only turns the state
   (aria-expanded, data-closed, inert), remembers it and fills lazy bodies. No rule keeps one section open at a time. */
(function () {
  "use strict";
  var STORE = "floa.racc", INNER = "button, a, input, select, textarea, label, [role=button]";
  var CHEV = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#expand"/></svg>';   /* the kit's sprite (ui/docs/icon.md) */
  var mem = null, binds = [];
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function idOf(key) { return "racc-" + String(key).replace(/[^A-Za-z0-9_-]/g, function (c) { return "_" + c.charCodeAt(0).toString(16); }); }
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { mem = {}; }
    return mem;
  }
  function save(key, open) {
    load()[key] = !!open;
    try { localStorage.setItem(STORE, JSON.stringify(mem)); } catch (e) { /* kept for this page only */ }
  }
  function remembered(key) { var m = load(); return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : null; }

  function html(o) {
    o = o || {};
    var key = String(o.key), fold = o.fold !== false, lvl = Math.min(4, Math.max(2, o.level | 0 || 3));
    var hasBody = o.lazy || (o.body != null && String(o.body).trim() !== "");
    var folds = fold && hasBody;
    var nomem = o.remember === false, r = nomem ? null : remembered(key), open = !fold || (r != null ? r : !!o.open);
    var bid = idOf(key), t = esc(o.title);
    var text = '<span class="racc__title" dir="auto" title="' + t + '">' + t + '</span>' + (o.sub ? '<span class="racc__sub" dir="auto">' + esc(o.sub) + '</span>' : '') +
      (o.count != null ? '<span class="racc__count">' + esc(o.count) + '</span>' : '');
    var h = '<div class="racc rlayout' + (folds ? '' : ' racc--fixed') + (o.scope ? ' ' + esc(o.scope) : '') + '" data-racc-key="' + esc(key) + '"' + (o.lazy ? ' data-racc-lazy' : '') + (nomem ? ' data-racc-nomem' : '') + (o.attrs ? ' ' + o.attrs : '') + '>';
    h += '<div class="racc__bar rlayout rlayout--row rlayout--pad-x"><h' + lvl + ' class="racc__h rlayout rlayout--row rlayout--unit rlayout__grow">' +
      (folds ? '<button type="button" class="racc__head rlayout rlayout--row rlayout--unit" aria-expanded="' + open + '" aria-controls="' + bid + '">' + text + '<span class="racc__chev" aria-hidden="true">' + CHEV + '</span></button>' : text) +
      '</h' + lvl + '>';
    if (o.time || o.actions) h += '<div class="racc__end rlayout rlayout--row">' + (o.time ? '<span class="racc__time">' + esc(o.time) + '</span>' : '') + (o.actions || '') + '</div>';
    h += '</div>';
    if (hasBody) h += '<div class="racc__body" id="' + bid + '"' + (folds && !open ? ' data-closed inert' : '') + '><div>' + (o.lazy && !(folds && !open) ? '' : (o.body || '')) + '</div></div>';
    return h + '</div>';
  }

  /* the binding that owns a section: the NEAREST bound root above it. Roots nest (a list of sections inside the body of another section, each bound with its own fill),
     and each bar is turned and each lazy body filled by its owner alone: one listener acts per bar, at any depth */
  function ownerOf(sec) {
    for (var el = sec && sec.parentElement; el; el = el.parentElement) if (el.__racc) return el.__racc;   /* the binding lives on the root itself: a root bound off the page, or dropped from binds, still owns its bars */
    return null;
  }
  function secOf(key) {
    var q = '.racc[data-racc-key="' + (window.CSS && CSS.escape ? CSS.escape(String(key)) : String(key)) + '"]';
    for (var i = 0; i < binds.length; i++) { var s = binds[i].root.querySelector(q); if (s) return { sec: s, b: ownerOf(s) }; }
    var d = document.querySelector(q); return d ? { sec: d, b: ownerOf(d) } : null;
  }
  function fill(sec, b) {
    if (!sec.hasAttribute("data-racc-lazy") || sec.__raccFilled) return;
    var inner = sec.querySelector(":scope > .racc__body > div"); if (!inner || !b || !b.opts.fill) return;
    sec.__raccFilled = true; b.opts.fill(sec.getAttribute("data-racc-key"), inner);
  }
  function apply(sec, open, b) {
    var head = sec.querySelector(":scope > .racc__bar .racc__head"), body = sec.querySelector(":scope > .racc__body");
    if (!head || !body) return;
    if ((head.getAttribute("aria-expanded") === "true") === open) return;
    head.setAttribute("aria-expanded", String(open));
    sec.setAttribute("data-racc-moved", "");   /* the motion is CSS's (kit.css): the entry runs only on a section that was turned, never on a repaint */
    if (open) fill(sec, b);
    body.inert = !open;
    body.toggleAttribute("data-closed", !open);   /* closing: the content goes out, then CSS takes the body out of the layout */
    sec.dispatchEvent(new CustomEvent("racc-change", { bubbles: true, detail: { key: sec.getAttribute("data-racc-key"), open: open } }));
  }
  function set(key, open) {
    var f = secOf(key);
    if (!(f && f.sec.hasAttribute("data-racc-nomem"))) save(key, open);   /* remember: false: the state is the app's choice on every drawing, never stored */
    if (f) apply(f.sec, !!open, f.b);
  }
  function turn(sec, open, b) {   /* a click turns the section it happened in (the same key may be drawn twice, e.g. a catalog under a layer of the catalog) */
    if (!sec.hasAttribute("data-racc-nomem")) save(sec.getAttribute("data-racc-key"), open);
    apply(sec, !!open, b);
  }
  function isOpen(key) {
    var f = secOf(key);
    if (f) { var head = f.sec.querySelector(":scope > .racc__bar .racc__head"); return head ? head.getAttribute("aria-expanded") === "true" : true; }
    return remembered(key) === true;
  }
  function bind(root, opts) {
    if (!root) return;
    /* binds is only the list secOf searches by key: a root off the page leaves it (a screen drawn anew leaves its old root behind), but its binding stays
       on the root (root.__racc), with its listeners, so a root bound before it was inserted, or taken out and put back, keeps turning its bars, and binding
       it again re-enters it in binds and swaps opts: one pair of listeners per root, ever */
    var b = root.__racc || null;
    binds = binds.filter(function (x) { return x.root === root || x.root.isConnected; });
    if (b && binds.indexOf(b) < 0) binds.push(b);
    if (!b) {
      b = { root: root, opts: opts || {} }; binds.push(b); root.__racc = b;
      root.addEventListener("click", function (e) {   /* capture: "add" opens its section before the add itself runs */
        var a = e.target.closest && e.target.closest("[data-racc-open]"); if (!a || !root.contains(a)) return;
        var sec = a.closest(".racc"); if (sec && ownerOf(sec) === b) turn(sec, true, b);
      }, true);
      root.addEventListener("click", function (e) {
        var bar = e.target.closest && e.target.closest(".racc__bar"); if (!bar || !root.contains(bar)) return;
        var sec = bar.parentElement; if (!sec || sec.classList.contains("racc--fixed") || ownerOf(sec) !== b) return;   /* a bar under a nested bound root is that root's */
        var ctl = e.target.closest(INNER); if (ctl && bar.contains(ctl) && !ctl.classList.contains("racc__head")) return;
        var head = bar.querySelector(".racc__head"); if (!head) return;
        turn(sec, head.getAttribute("aria-expanded") !== "true", b);
      });
    } else b.opts = opts || b.opts;
    [].forEach.call(root.querySelectorAll(".racc[data-racc-lazy]"), function (sec) {
      var body = sec.querySelector(":scope > .racc__body"); if (body && !body.hasAttribute("data-closed")) fill(sec, ownerOf(sec));   /* a nested root's body gets the nested fill */
    });
  }
  /* a search (ui/search.js) opens and closes sections WITHOUT storing it: show(sec, open) turns one drawn section (filling a lazy body), saved(key) is its stored state or null */
  function show(sec, open) {
    if (!sec) return;
    apply(sec, !!open, ownerOf(sec));
  }
  window.RosterSection = { html: html, bind: bind, set: set, isOpen: isOpen, show: show, saved: remembered };
})();
