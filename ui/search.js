/* THE SEARCH's helper (ui/docs/search.md), served at /search.js. Every search of a list lives in its header: a magnifier icon button in the
   actions (.rhead__acts) swaps the title for the search line and turns into an X. CSS does everything it can (kit.css, SEARCH IN THE HEADER):
   the swap of the title and the line, the glyph of the button, hiding a section with no hit, the empty state, the other actions on a phone.
   This file only turns the state (aria-expanded, hidden on items, data-rsearch-q on the list), opens sections without storing it, and remembers.
   RosterSearch.fold(t): no capitals, no marks (Latin accents, Hebrew points). RosterSearch.score(text, q): 0 = no match, more = nearer; every typed
     word must match a word of the text (the same, its start, inside it, or one or two letters off). match(text, q) is the yes or no.
     scoreFolded(h, q): score() for a text folded already.
   RosterSearch.attach(button, list, opts) wires one search. button: the magnifier (data-rsearch; the kit adds the X glyph). list: the element
     whose [data-rsearch-item] are searched (or a function that returns it, when one search serves two lists). opts:
     label: what is searched ("חיפוש ויוונסיה"), the line's placeholder and aria-label. open: true: a picker, opened with the search open (focus on
     a computer only). onQuery(q): app mode, the app draws the list again itself (ranking, long lists); heavy (true or a function): onQuery waits
     --search-wait for a pause in the typing. empty: the empty state's sentence; icon: its svg. value: a text to open with. key: an open search is
     part of the screen's state and comes back after a refresh (sessionStorage "floa.rsearch").
   Returns { open(q), close(), value(), set(q), label(text), refresh(), input }. Every change sends "rsearch-change" on the list, with { q }. */
(function () {
  "use strict";
  var MARKS = /[̀-֑ͯ-ׇ]/g, STORE = "floa.rsearch";
  function fold(t) { return String(t == null ? "" : t).normalize("NFD").replace(MARKS, "").toLowerCase(); }
  var cache = {};
  function toks(h) { if (cache[h]) return cache[h]; var n = Object.keys(cache).length; if (n > 5000) cache = {}; return (cache[h] = h.split(/[^0-9a-z֐-׿]+/).filter(Boolean)); }
  function dist(a, b, max) {
    var n = a.length, m = b.length; if (Math.abs(n - m) > max) return max + 1;
    var p2 = null, p1 = [], i, j;
    for (j = 0; j <= m; j++) p1[j] = j;
    for (i = 1; i <= n; i++) {
      var c = [i], lo = i;
      for (j = 1; j <= m; j++) {
        var v = Math.min(p1[j] + 1, c[j - 1] + 1, p1[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
        c[j] = v; if (v < lo) lo = v;
      }
      if (lo > max) return max + 1;
      p2 = p1; p1 = c;
    }
    return p1[m];
  }
  function word(h, tk, w) {
    var best = 0, i, t, d, mx = w.length <= 2 ? 0 : w.length <= 4 ? 1 : 2;
    for (i = 0; i < tk.length; i++) {
      t = tk[i];
      if (t === w) return 10;
      if (t.indexOf(w) === 0) best = Math.max(best, 8);
      else if (mx && t.length >= w.length) { d = dist(w, t.slice(0, w.length), mx); if (d <= mx) best = Math.max(best, 6 - d * 1.5); }
      if (mx && best < 6) { d = dist(w, t, mx); if (d <= mx) best = Math.max(best, 7 - d * 1.5); }
    }
    if (!best && h.indexOf(w) >= 0) best = 5;
    return best;
  }
  function scoreFolded(h, q) {
    var words = fold(q).split(/\s+/).filter(Boolean), tk = toks(h), sum = 0, k, s;
    if (!words.length) return 1;
    for (k = 0; k < words.length; k++) { s = word(h, tk, words[k]); if (!s) return 0; sum += s; }
    return sum / words.length;
  }
  function score(text, q) { return scoreFolded(fold(text), q); }
  function match(text, q) { return score(text, q) > 0; }

  var X_SVG = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#x"/></svg>';   /* the kit's sprite (ui/docs/icon.md) */
  var Q_SVG = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#search"/></svg>';
  function wide() { return !!(window.matchMedia && matchMedia("(min-width: 760px)").matches); }
  function mem() { try { return JSON.parse(sessionStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; } }
  function keep(key, q) {
    if (!key) return;
    var m = mem(); if (q == null) delete m[key]; else m[key] = q;
    try { sessionStorage.setItem(STORE, JSON.stringify(m)); } catch (e) { /* this page only */ }
  }
  function waitMs() {   /* the kit's ONE delay of a heavy search, --search-wait */
    var v = (getComputedStyle(document.documentElement).getPropertyValue("--search-wait") || "").trim(), n = parseFloat(v);
    return isFinite(n) ? (/ms$/.test(v) ? n : n * 1000) : 0;
  }

  function attach(btn, list, opts) {
    opts = opts || {};
    var listOf = typeof list === "function" ? list : function () { return list; };
    var head = btn.closest(".rhead"), text = head && head.querySelector(".rhead__text");
    if (!text) return null;
    var label = opts.label || "חיפוש";
    if (btn.querySelectorAll("svg").length < 2) btn.insertAdjacentHTML("beforeend", X_SVG);
    btn.setAttribute("data-rsearch", ""); btn.setAttribute("aria-expanded", "false");
    var inp = document.createElement("input");
    inp.type = "search"; inp.className = "rhead__title rhead__q"; inp.autocomplete = "off"; inp.spellcheck = false;
    inp.setAttribute("enterkeyhint", "search");   /* no dir="auto": an empty line would turn left to right and sit away from where the title starts */
    text.appendChild(inp);
    var st = { open: false, q: "", sc: 0, cur: null, timer: 0 }, mo = null;
    function says() {   /* the button's name: open it, clear what is typed, or close it */
      var t = !st.open ? "חיפוש" : inp.value ? "ניקוי החיפוש" : "סגירת חיפוש";
      btn.setAttribute("aria-label", t); btn.title = t;
    }
    function setLabel(t) { label = t || "חיפוש"; inp.placeholder = label; inp.setAttribute("aria-label", label); }
    setLabel(label); says();
    function heavy() { return typeof opts.heavy === "function" ? !!opts.heavy() : !!opts.heavy; }

    /* the kit's empty state of a search, written once in the list; CSS shows it while nothing is left */
    function emptyEl(l) {
      var e = l.querySelector(":scope > [data-rsearch-empty]");
      if (!e) {
        e = document.createElement("div"); e.className = "rlayout rempty"; e.setAttribute("data-rsearch-empty", ""); e.setAttribute("role", "status");
        e.innerHTML = ((typeof opts.icon === "function" ? opts.icon() : opts.icon) || Q_SVG) + "<b>לא נמצא</b>";   /* icon: the icon of the list's subject, or a function of the list that is shown (one search over two lists) */
        if (opts.empty) { var s = document.createElement("span"); s.textContent = opts.empty; e.appendChild(s); }
        l.appendChild(e);
      }
      return e;
    }
    function itemText(it) { return (it.textContent || "") + " " + (it.getAttribute("data-q") || ""); }
    function openBy(sec) {   /* a section with a hit opens, never stored (RosterSection.show) */
      var hd = sec.querySelector(":scope > .racc__bar .racc__head"); if (!hd) return;
      if (hd.getAttribute("aria-expanded") === "true") return;
      if (!sec.hasAttribute("data-rsearch-was")) sec.setAttribute("data-rsearch-was", "0");
      if (window.RosterSection) RosterSection.show(sec, true);
    }
    function back(sec) {   /* the search is gone: the section is as it was stored */
      sec.removeAttribute("data-rsearch-hit");
      var c = sec.querySelector(":scope > .racc__bar .racc__count");
      if (c && c.hasAttribute("data-rsearch-n")) { c.textContent = c.getAttribute("data-rsearch-n"); c.removeAttribute("data-rsearch-n"); }
      if (!sec.hasAttribute("data-rsearch-was")) return;
      var was = sec.getAttribute("data-rsearch-was") === "1"; sec.removeAttribute("data-rsearch-was");
      var s = window.RosterSection && RosterSection.saved(sec.getAttribute("data-racc-key"));
      if (window.RosterSection) RosterSection.show(sec, s != null && !sec.hasAttribute("data-racc-nomem") ? s : was);
    }
    function apply(l, q) {
      if (!l) return;
      if (q) { l.setAttribute("data-rsearch-q", ""); emptyEl(l); } else l.removeAttribute("data-rsearch-q");
      var secs = [].slice.call(l.querySelectorAll(".racc"));
      if (!q) { secs.forEach(back); if (!opts.onQuery) [].forEach.call(l.querySelectorAll("[data-rsearch-item][hidden]"), function (it) { it.hidden = false; }); return; }
      secs.forEach(function (sec) {   /* a section whose own title matches is shown with all it holds, in its own state; a lazy body is built before it is searched */
        var t = sec.querySelector(":scope > .racc__bar .racc__title"), hit = !!t && match(t.textContent, q);
        sec.toggleAttribute("data-rsearch-hit", hit);
        var inner = sec.querySelector(":scope > .racc__body > div");
        if (!hit && inner && !inner.firstChild) openBy(sec);
      });
      if (!opts.onQuery) [].forEach.call(l.querySelectorAll("[data-rsearch-item]"), function (it) {
        var ok = !!it.closest(".racc[data-rsearch-hit]") || match(itemText(it), q);
        if (it.hidden === ok) it.hidden = !ok;
      });
      secs.forEach(function (sec) {
        if (!sec.hasAttribute("data-rsearch-hit") && sec.querySelector("[data-rsearch-item]:not([hidden])")) openBy(sec);
        var c = sec.querySelector(":scope > .racc__bar .racc__count"), inner = sec.querySelector(":scope > .racc__body > div");
        if (c && inner && inner.firstChild) {   /* the count says the hits while searching, and comes back on closing */
          if (!c.hasAttribute("data-rsearch-n")) c.setAttribute("data-rsearch-n", c.textContent);
          var n = String(inner.querySelectorAll("[data-rsearch-item]:not([hidden])").length);
          if (c.textContent !== n) c.textContent = n;
        }
      });
    }
    function watch(l) {   /* a list drawn again (innerHTML) is searched again, and gets its empty state back */
      if (!window.MutationObserver) return;
      if (mo) mo.disconnect();
      mo = new MutationObserver(function () { var c = listOf(); if (c === l && st.q) { apply(l, st.q); mo.takeRecords(); } });
      if (l) mo.observe(l, { childList: true, subtree: true });
    }
    function run() {
      st.timer = 0;
      var q = st.open ? inp.value.trim() : "", l = listOf();
      if (st.cur && st.cur !== l) { var old = st.cur; st.q = ""; apply(old, ""); }
      if (st.cur !== l) watch(l);
      st.cur = l; st.q = q;
      if (opts.onQuery) opts.onQuery(q);
      if (l) { apply(l, q); if (mo) mo.takeRecords(); l.scrollTop = 0; l.dispatchEvent(new CustomEvent("rsearch-change", { bubbles: true, detail: { q: q } })); }
    }
    function change(now) {
      says();
      if (opts.key && st.open) keep(opts.key, inp.value);
      clearTimeout(st.timer);
      if (!now && opts.onQuery && heavy()) st.timer = setTimeout(run, waitMs()); else run();
    }
    function open(q, focus) {
      if (!st.open) {
        st.open = true; var l = listOf(); st.sc = l ? l.scrollTop : 0;
        btn.setAttribute("aria-expanded", "true");
      }
      inp.value = q || "";
      if (opts.key) keep(opts.key, inp.value);
      if (focus) inp.focus({ preventScroll: true });
      if (inp.value.trim() || st.q) change(true); else says();
    }
    function close() {
      if (!st.open) return;
      var had = document.activeElement === inp, sc = st.sc;
      st.open = false; clearTimeout(st.timer); inp.value = "";
      btn.setAttribute("aria-expanded", "false"); keep(opts.key, null); says();
      if (st.q) run();
      var l = listOf(); if (l) l.scrollTop = sc;   /* the place in the list from before the search */
      if (had) btn.focus({ preventScroll: true });
    }
    btn.addEventListener("click", function () {   /* the magnifier opens; the X clears what is typed, a second press closes */
      if (!st.open) open("", true);
      else if (inp.value) { inp.value = ""; change(true); inp.focus({ preventScroll: true }); }
      else close();
    });
    inp.addEventListener("input", function () { change(false); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {   /* text: it goes; empty: the search closes. Never the window under it (law 17.4) */
        e.preventDefault(); e.stopPropagation();
        if (inp.value) { inp.value = ""; change(true); } else close();
      } else if (e.key === "Enter") {
        e.preventDefault(); if (!wide()) inp.blur();
      } else if (e.key === "ArrowDown") {   /* to the first result shown */
        var l = listOf(), it = l && [].filter.call(l.querySelectorAll("[data-rsearch-item]:not([hidden])"), function (x) { return x.offsetParent; })[0];
        if (!it) return;
        var f = it.matches("button, a, [tabindex]") ? it : it.querySelector("button, a, [tabindex]:not([tabindex='-1'])");
        if (f) { e.preventDefault(); f.focus(); }
      }
    });
    var api = { open: function (q) { open(q, true); }, close: close, value: function () { return st.open ? inp.value : ""; },
      set: function (q) { if (!st.open) { if (q) open(q, false); } else { inp.value = q || ""; change(true); } },
      label: setLabel, refresh: function () { if (st.open) run(); }, input: inp };
    inp.__rsearch = api;
    var was = null; if (opts.key) { var m = mem(); if (Object.prototype.hasOwnProperty.call(m, opts.key)) was = m[opts.key]; }
    if (opts.open) open(opts.value || "", wide());
    else if (opts.value) open(opts.value, false);
    else if (was != null) open(was, false);   /* an open search comes back after a refresh */
    return api;
  }
  window.RosterSearch = { fold: fold, score: score, scoreFolded: scoreFolded, match: match, attach: attach };
})();
