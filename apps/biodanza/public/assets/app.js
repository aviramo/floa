/* Biodanza: a facilitator builds a vivencia, plans it along the curve, plays it in the session.
   Built ONLY from the kit's elements (/kit.css): rhead, rlist, rrow, rcard, rbtn, rchip, rfield, rempty, rmsg, rfab.
   Data: schema `biodanza` (apps/biodanza/schema.sql), through FLOA_AUTH.api. Row level security decides who sees what. */
(function () {
  "use strict";
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  /* Every vivencia and every exercise has an address of its own, in the path (no # in the bar): /<vivencia> and /<vivencia>/<exercise>.
     On localhost the app lives under /biodanza/, so the same addresses carry that prefix there. */
  var BASE = /^(localhost|127[.])/.test(location.hostname) ? "/biodanza/" : "/";
  var popping = false, pending = null;   /* pending: an address the page was opened on, waiting for the list to load */
  /* HISTORY. One entry per screen (home, vivencia, exercise), each carrying its depth in history.state.d (home is 0), and one marker entry
     (same address, state.bk) per open popup or menu, so the browser's Back closes the top popup only and goes one level up otherwise.
     Walking between exercises replaces the entry. A popup closed from code gives its marker entry back with history.go(-n). */
  var layers = [], jump = null, repNext = false;   /* layers: the open popups, top last ({el, own}: own = it holds a marker entry); jump: a history.go() of ours, its popstate is not the user's */
  function curD() { return (history.state && history.state.d) || 0; }
  function ownCount() { return layers.filter(function (l) { return l.own; }).length; }
  function applyUrl(u, rep) {
    if (location.pathname === u) return;
    if (rep) history.replaceState({ d: curD() }, "", u); else history.pushState({ d: curD() + 1 }, "", u);
  }
  function startJump(n, render) {   /* leave n entries in one step; the popstate that follows renders the screen only if render */
    var j = jump = { render: render, then: null };
    setTimeout(function () { if (jump === j) { jump = null; if (j.then) j.then(); } }, 1500);   /* safety: never stay waiting */
    history.go(-n);
  }
  /* leave the markers of the open popups (and `extra` screen entries below them) in one step */
  function unwind(extra) {
    var n = ownCount() + (extra || 0);
    layers.forEach(function (l) { l.own = false; });
    if (n) startJump(n, !!extra);
    return n;
  }
  function setUrl(u) {
    var rep = repNext; repNext = false;
    if (popping || location.pathname === u) return;
    if (jump) { jump.then = function () { applyUrl(u, rep); }; return; }   /* an unwind is under way: write the address when it is done */
    if (ownCount()) { unwind(0); jump.then = function () { applyUrl(u, rep); }; return; }   /* popups still hold their entries: give them back first */
    applyUrl(u, rep);
  }
  /* Run `apply` once no popup marker is waiting to be given back (a jump of ours may be under way). */
  function afterLayers(apply) {
    if (popping) return;
    if (jump) { var prev = jump.then; jump.then = function () { if (prev) prev(); apply(); }; return; }
    if (ownCount()) { unwind(0); jump.then = apply; return; }
    apply();
  }
  /* A level without an address of its own (the liked lists, the catalog or the music beside an open exercise) holds ONE entry (state.sub), same
     address: Back leaves that level and not the app, and the screen is drawn from the address again. */
  var subKeep = {};   /* level -> how to draw that level again when Back lands on it from a deeper one */
  function subEnter(redraw) {
    afterLayers(function () { var lv = (history.state && history.state.sub || 0) + 1; if (redraw) subKeep[lv] = redraw; history.pushState({ d: curD(), sub: lv }, "", location.href); });
  }
  function goSub(fn) { go(fn); subEnter(); }
  function inSub() { return !!(history.state && history.state.sub); }
  function leaveAll() { unwind((history.state && history.state.sub) || 0); }   /* out of every level at once, to the screen of the address */
  function syncLayers() {   /* a popup or menu opened or closed, by the user or by code: its marker entry follows */
    var live = [].slice.call(document.querySelectorAll("dialog[open], #moreMenu"));
    var gone = layers.filter(function (l) { return live.indexOf(l.el) < 0; });
    var fresh = live.filter(function (el) { return !layers.some(function (l) { return l.el === el; }); });
    if (!gone.length && !fresh.length) return;
    var lost = gone.filter(function (l) { return l.own; }).length;
    layers = layers.filter(function (l) { return live.indexOf(l.el) >= 0; });
    var marked = fresh.filter(function (el) { return !el.__screen; });   /* the exercise popup is a screen of its own (its address is its entry): no marker */
    var pairs = Math.min(lost, marked.length);   /* one closes as another opens (a menu choice): the entry is handed over */
    fresh.forEach(function (el) { layers.push({ el: el, own: !jump && !el.__screen }); });
    if (!jump) for (var i = 0; i < marked.length - pairs; i++) history.pushState({ d: curD(), bk: 1 }, "", location.href);
    if (lost - pairs > 0) startJump(lost - pairs, false);
  }
  function closeLayer(el) { if (el.id === "moreMenu") el.remove(); else slideClose(el); }
  function parseUrl() { var seg = location.pathname.slice(BASE.length).split("/").filter(Boolean); return { viv: seg[0] || "", item: seg[1] || "" }; }
  function wide() { return window.matchMedia("(min-width: 1024px)").matches; }
  var api = function (p, o) {
    if (state.offline) return offlineApi(p, o);
    var r = FLOA_AUTH.api(p, o);
    if (o && o.method && o.method !== "GET" && /\/rest\/v1\/(vivenc|rpc\/(leave_vivencia|vivencia))/.test(p)) r.then(function () { localSoon(); }, function () { /* nothing was written */ });
    return r;
  };
  /* the device's copy follows every write: what the screen already shows (changed at once) is kept, and the list-level facts follow the list */
  var localT = 0;
  function localSoon() {
    clearTimeout(localT);
    localT = setTimeout(function () {
      if (state.offline || !window.BioOffline) return;
      if (state.viv && state.items && state.viv.id && BioOffline.isSaved(state.viv.id)) refreshOffline(state.viv);
      if (state.vivsLoaded) BioOffline.patchRows(state.vivs).then(function (need) { if (need) syncOffline(true); });
    }, 800);
  }
  /* With no internet the app reads the copies kept on the device (assets/offline.js): the same questions, answered from them. Anything that would
     change something, or that is not in a copy, is refused the way a lost connection is. */
  var offlineRecs = {};
  function offlineApi(path, o) {
    var no = function () { var e = new Error("offline"); e.offline = true; return Promise.reject(e); };
    var recs = Object.keys(offlineRecs).map(function (k) { return offlineRecs[k]; });
    if (/\/rpc\/vivencia_members$/.test(path)) return Promise.resolve(offlineRecs[o && o.json && o.json.v] ? offlineRecs[o.json.v].members : []);
    if (o && o.method && o.method !== "GET") return no();
    if (/^\/rest\/v1\/vivencias\?/.test(path)) return Promise.resolve(recs.map(function (r) { return r.row; }));
    if (/^\/rest\/v1\/vivencia_owners\?/.test(path)) return Promise.resolve(recs.filter(function (r) { return r.role === "owner"; }).map(function (r) { return { vivencia_id: r.id, position: r.pos }; }));
    if (/^\/rest\/v1\/vivencia_shares\?/.test(path)) return Promise.resolve(recs.filter(function (r) { return r.role !== "owner"; }).map(function (r) { return { vivencia_id: r.id, role: r.role, position: r.pos }; }));
    var m = path.match(/^\/rest\/v1\/vivencia_items\?vivencia_id=eq\.([^&]+)/);
    if (m) return Promise.resolve(offlineRecs[m[1]] ? offlineRecs[m[1]].items : []);
    if (/^\/rest\/v1\/(lines|phases)\?/.test(path)) return Promise.resolve([]);
    return no();
  }
  var likes = {};   /* the songs I loved (their ids), mine alone */
  var likesViv = {};   /* the vivencias I loved */
  var likesEx = {};   /* the exercises I loved (their ids), mine alone */
  var liveItem = null;   /* the open exercise screen, so a change that comes from another person can be written into it */
  var state = { members: [], me: null, lines: [], phases: [], cat: null, vivs: [], viv: null, items: [], filter: "" };

  var I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 13V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M4 13h4.5a3.5 3.5 0 0 0 7 0H20v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/></svg>',
    catalog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19V5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 7.5h7M9 11.5h5"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.500s-7.500-4.600-9.500-9.200A5.300 5.300 0 0 1 12 6.200a5.300 5.300 0 0 1 9.500 5.100c-2 4.600-9.500 9.200-9.500 9.200z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    loop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>',   /* repeat: round and round */
    upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',   /* an arrow up out of a tray: upload */
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 .6 3 2.2 3 5"/></svg>',
    swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    curve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 16c2.5-9 5-9 7.5-1s5 8 7.5 0c1-3 2.500-5 5-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    yt: '<svg viewBox="0 0 24 24" stroke="none" aria-hidden="true" style="width:calc(var(--icon-l) * 1.6);height:calc(var(--icon-l) * 1.6)"><rect x="1" y="5" width="22" height="14" rx="4.500" fill="currentColor"/><path d="M10 9l5.500 3-5.500 3z" style="fill:var(--bg)"/></svg>',   /* the YouTube mark: a song with no file of its own opens on YouTube, and the tile says so */
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.500 4.500L19 7"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/></svg>'
  };

  /* ---------- bold words in the three texts: kept as **word** in the same text, drawn as bold ---------- */
  function rtHtml(s) { return esc(s).replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>"); }
  function rtWalk(root, marks) {   /* the text of a box (or of a piece of one): lines as \n, bold between ** when marks */
    var out = "", on = false;
    function put(s, b) { if (marks && b !== on) { out += "**"; on = b; } out += s; }
    function isB(e) { var w = e.style && e.style.fontWeight; return e.tagName === "B" || e.tagName === "STRONG" || w === "bold" || +w >= 600; }
    (function walk(n, b) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) put(c.nodeValue.replace(/ /g, " "), b);
        else if (c.nodeType === 1) {
          if (c.tagName === "BR") { put("\n", b); continue; }
          if ((c.tagName === "DIV" || c.tagName === "P") && out && out.slice(-1) !== "\n") put("\n", b);
          walk(c, b || isB(c));
        }
      }
    })(root, false);
    if (on) out += "**";
    var last = root.lastChild;
    if (last && last.nodeType === 1 && last.tagName === "BR" && out.slice(-1) === "\n") out = out.slice(0, -1);   /* the browser's own empty last line */
    return marks ? out.replace(/\*\*\*\*/g, "") : out;
  }
  function rtIndex(el, node, off) { var q = document.createRange(); q.selectNodeContents(el); q.setEnd(node, off); var d = document.createElement("div"); d.appendChild(q.cloneContents()); return rtWalk(d, false).length; }
  function rtSel(el) { var s = window.getSelection(); if (!s || !s.rangeCount || !el.contains(s.anchorNode)) return { a: 0, b: 0 }; var r = s.getRangeAt(0); return { a: rtIndex(el, r.startContainer, r.startOffset), b: rtIndex(el, r.endContainer, r.endOffset) }; }
  function rtPoint(root, idx) {   /* the place in the box that is `idx` characters in */
    var n = 0, res = null;
    (function w(p) {
      for (var c = p.firstChild; c && !res; c = c.nextSibling) {
        if (c.nodeType === 3) { if (idx <= n + c.nodeValue.length) res = [c, idx - n]; else n += c.nodeValue.length; }
        else if (c.nodeType === 1) { if (c.tagName === "BR") { if (idx <= n) res = [p, Array.prototype.indexOf.call(p.childNodes, c)]; else n++; } else w(c); }
      }
    })(root);
    return res || [root, root.childNodes.length];
  }
  function rtInit(el) {   /* a box that answers like a textarea: .value */
    function mark() { if (el.parentElement) el.parentElement.dataset.rf = el.textContent ? "v" : "e"; }
    Object.defineProperty(el, "value", { configurable: true, get: function () { return rtWalk(el, true); }, set: function (v) { el.innerHTML = rtHtml(v); mark(); } });
    mark();
    el.addEventListener("input", mark);
    el.addEventListener("beforeinput", function (e) { if (e.inputType === "insertParagraph") { e.preventDefault(); document.execCommand("insertLineBreak"); } });
    el.addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
    el.addEventListener("blur", function () { el.dispatchEvent(new Event("change")); });
  }
  /* a search ignores capitals and marks: "marron" finds "Marrón", "cafe" finds "café" (also Hebrew points) */
  function fold(t) { return String(t == null ? "" : t).normalize("NFD").replace(new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + String.fromCharCode(0x591) + "-" + String.fromCharCode(0x5c7) + "]", "g"), "").toLowerCase(); }
  /* a smart search: finds what is NEAR the words, not only what contains them. Every typed word must match some word of the text, by the
     best of: the same word, a word that starts with it, a word that holds it, or a word one or two letters off (a slip, a missing or an
     extra letter, two letters swapped; also for the start of a longer word). fzs() gives a score (0 = no match, more = nearer) so a list can
     put the nearest first; fz() is the yes or no. */
  var fzCache = {};
  function fzTok(h) { return fzCache[h] || (fzCache[h] = h.split(/[^0-9a-z֐-׿]+/).filter(Boolean)); }
  function fzDist(a, b, max) {
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
  function fzWord(h, toks, w) {
    var best = 0, i, t, d, mx = w.length <= 2 ? 0 : w.length <= 4 ? 1 : 2;
    for (i = 0; i < toks.length; i++) {
      t = toks[i];
      if (t === w) return 10;
      if (t.indexOf(w) === 0) best = Math.max(best, 8);
      else if (mx && t.length >= w.length) { d = fzDist(w, t.slice(0, w.length), mx); if (d <= mx) best = Math.max(best, 6 - d * 1.5); }
      if (mx && best < 6) { d = fzDist(w, t, mx); if (d <= mx) best = Math.max(best, 7 - d * 1.5); }
    }
    if (!best && h.indexOf(w) >= 0) best = 5;
    return best;
  }
  function fzs(text, q) {
    var h = fold(text), words = fold(q).split(/\s+/).filter(Boolean), toks = fzTok(h), sum = 0, k, s;
    if (!words.length) return 1;
    for (k = 0; k < words.length; k++) { s = fzWord(h, toks, words[k]); if (!s) return 0; sum += s; }
    return sum / words.length;
  }
  function fz(text, q) { return fzs(text, q) > 0; }
  function nearest(list, text, q) {   /* the matches of a search, nearest first (a plain order when nothing is typed) */
    if (!fold(q).trim()) return list;
    return list.map(function (x, i) { return { x: x, s: fzs(text(x), q), i: i }; }).filter(function (o) { return o.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (o) { return o.x; });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function name(e) { return e.title_he || e.title_en || ""; }
  function phaseName(k) { var p = state.phases.filter(function (x) { return x.key === k; })[0]; return p ? p.name_he : ""; }
  function catName(k) { var c = (state.cats || []).filter(function (x) { return x.key === k; })[0]; return c ? c.name_he : ""; }
  function lineName(k) { var l = state.lines.filter(function (x) { return x.key === k; })[0]; return l ? l.name_he : k; }
  /* a song is two things: its name and who plays it */
  function songName(m) { return m ? (m.title || m.name || "") : ""; }
  function songBy(m) { return m ? (m.artist || "") : ""; }
  function canEdit() { return !state.offline && (!state.viv || state.viv.role !== "view"); }   /* a share for viewing changes nothing; the database enforces it too */
  /* the same button wherever a song is shown: it searches the song and its artist on YouTube, in a new tab */
  /* the YouTube button of the song played last is red, the others are muted (kept in this browser, so it is still marked tomorrow) */
  var played = (function () { try { return localStorage.getItem("biodanza.played") || ""; } catch (e) { return ""; } })();
  function ytColor(id) { return id && id === played ? "var(--danger)" : "var(--text-3)"; }
  function ytLink(m, trail) {
    return '<a class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-yt="' + esc(m.id || "") + '" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((songName(m) + " " + songBy(m)).trim()) + '" target="_blank" rel="noopener" aria-label="ניגון ביוטיוב" title="ניגון ביוטיוב" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:' + ytColor(m.id) + '">' + I.yt + '</a>';
  }
  /* a song with a file in the bucket gets the sound button (assets/audio.js); one without keeps the YouTube button */
  var songInfo = {};   /* every song's name and performer by its file, as the lists have shown them: the footer player reads its title here */
  function songBtn(m, trail) {
    if (m.audio_object) songInfo[m.audio_object] = { t: m.title || m.name, a: m.artist || "" };
    if (m.audio_object && window.BioAudio && BioAudio.info) BioAudio.info(m.audio_object, m.title || m.name, m.artist);   /* the phone's lock screen shows the song's name */
    if (m.audio_object && window.BioAudio) return BioAudio.button(m.audio_object, trail);
    songReg[m.id] = m;
    if (m.in_catalog === false || m.owner_id || state.offline || !m.id) return ytLink(m, trail);   /* only a song of the catalog can be given a file */
    /* the upload button, to the right of the YouTube one: a file from this device takes the YouTube button's place for everybody */
    return '<span data-upl-wrap="' + esc(m.id) + '" style="display:flex;gap:var(--gap-tight);align-items:center">' +
      '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-upl="' + esc(m.id) + '" aria-label="העלאת קובץ" title="העלאת קובץ שיחליף את היוטיוב" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:var(--text-3);font:var(--fw-bold) var(--fs-xs)/1 var(--font)">' + I.upload + '</button>' + ytLink(m, trail) + '</span>';
  }
  var songReg = {};
  var UPL_FORMATS = { mp3: 1, flac: 1, wav: 1, aiff: 1, aif: 1, m4a: 1 };
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-upl]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.busy) return;
    var id = b.dataset.upl, inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
    var say = function (t, ms) { b.innerHTML = '<span>' + esc(t) + '</span>'; if (ms) setTimeout(function () { if (b.isConnected) { b.innerHTML = I.upload; } }, ms); };
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var fmt = (f.name.split(".").pop() || "").toLowerCase();
      if (!UPL_FORMATS[fmt]) return say("קובץ שמע בלבד", 2500);
      b.dataset.busy = "1"; say("0%");
      FLOA_AUTH.token().then(function (t) {
        return new Promise(function (res, rej) {
          var x = new XMLHttpRequest(); x.open("PUT", "https://api.floa.co.il/biodanza/audio/upload");
          x.setRequestHeader("authorization", "Bearer " + t); x.setRequestHeader("x-format", fmt);
          x.upload.onprogress = function (ev) { if (ev.lengthComputable) say(Math.round(ev.loaded / ev.total * 100) + "%"); };
          x.onload = function () { if (x.status === 200) { try { res(JSON.parse(x.responseText)); } catch (er) { rej(er); } } else rej(new Error("upload " + x.status)); };
          x.onerror = function () { rej(new Error("upload")); };
          x.send(f);
        });
      }).then(function (o) {
        return api("/rest/v1/rpc/attach_audio", { method: "POST", json: { p_music: id, p_object: o.object, p_format: o.format, p_size: o.size } }).then(function () { return o; });
      }).then(function (o) {
        var m = songReg[id]; if (m) m.audio_object = o.object;
        (state.items || []).forEach(function (it) { if (it.music && it.music.id === id) it.music.audio_object = o.object; });
        document.querySelectorAll('[data-upl-wrap="' + id + '"]').forEach(function (w) { w.outerHTML = BioAudio.button(o.object, false); });
        if (window.BioAudio && BioAudio.info && m) BioAudio.info(o.object, m.title || m.name, m.artist);
        if (window.BioOffline && !state.offline) setTimeout(function () { syncOffline(); }, 300);
      }).catch(function (er) { console.error(er); delete b.dataset.busy; say("ההעלאה נכשלה", 3000); });
    });
    inp.click();
  }, true);
  /* ONE way to show a song, in the exercise list and in the exercise's own card: the song's name (up to two lines) and the performer on the left of the text, and at the left the play tile (the size of the number tile) with the song's time under it */
  function songLines(m) {
    return '<span style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;margin-top:var(--gap-tight);color:var(--text-2);font:var(--fw-medium) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(songName(m)) + '</span>' +
      (songBy(m) ? '<span style="display:block;margin-top:var(--gap-tight);color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/var(--lh-tight) var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(songBy(m)) + '</span>' : '');
  }
  /* while a song plays, the time under its button counts down to 0 (audio.js tells the page); the others show their whole length */
  document.addEventListener("bioaudio", function (ev) {
    var d = ev.detail || {};
    learnDur(d.name, d.d);
    document.querySelectorAll(".bio-time").forEach(function (sp) {
      var full = +sp.dataset.dur || durKnown[sp.dataset.for] || 0, left = full;
      if (d.name && sp.dataset.for === d.name) left = Math.max(0, Math.ceil((full || Math.round(d.d || 0)) - d.t));
      var txt = left ? clock(left) : ""; if (sp.textContent !== txt) sp.textContent = txt;
    });
  });
  /* the song's bar: ONE element everywhere. A song with a file keeps its room for it, the bar shows while that song plays, follows it, and a drag moves the song. */
  function songBar(m, extra, always) {
    if (!m || !m.audio_object) return "";
    return '<div class="bio-bar" data-for="' + esc(m.audio_object) + '"' + (always ? ' data-always="1"' : '') + ' style="' + (always ? '' : 'visibility:hidden;') + (extra || "flex:0 0 100%;order:3;padding-top:var(--sp-1)") + ';position:relative;z-index:var(--z-raised)"><input type="range" min="0" max="1000" value="0" step="1" aria-label="מקום במוסיקה" style="display:block;width:100%;margin:0;direction:ltr;accent-color:var(--primary)"></div>';
  }
  /* a song's length: the catalog's, else what its own file told the player the first time (kept in this browser) */
  var durKnown = {};
  try { durKnown = JSON.parse(localStorage.getItem("biodanza.dur") || "{}") || {}; } catch (x) { durKnown = {}; }
  function durOf(m) { return (m && (m.duration_sec || durKnown[m.audio_object])) || 0; }
  /* a song's length, once learned (from the player, or from the song's own file on the device), is kept in this browser and shown at once on every card of that song that has no time yet */
  function learnDur(name, d) {
    if (!name || !(d > 0)) return;
    var r = Math.round(d);
    if (durKnown[name] !== r) { durKnown[name] = r; try { localStorage.setItem("biodanza.dur", JSON.stringify(durKnown)); } catch (x) { /* not kept */ } }
    document.querySelectorAll(".bio-clk[data-for]").forEach(function (sp) { if (sp.dataset.for === name && !sp.textContent) { sp.textContent = clock(r); sp.dataset.dur = String(r); } });
  }
  /* every song of the open vivencia (its exercises, their options, the start and the end) that has no length yet gets it from its file on the device; the ones not on the device yet are read when the sync has brought them */
  var durBusy = false;
  function fillDurations() {
    if (durBusy || !window.BioAudio || !BioAudio.length || !state.viv) return;
    var todo = [], seen = {};
    function add(m) { var n = m && m.audio_object; if (n && !seen[n] && !durOf(m)) { seen[n] = 1; todo.push(n); } }
    (state.items || []).forEach(function (it) { add(it.music); (it.item_music_options || []).forEach(function (o) { add(o.music); }); });
    ["start", "end"].forEach(function (k) { (recvCache[state.viv.id + "|" + k] || []).forEach(function (x) { add(x.music); }); });
    if (!todo.length) return;
    durBusy = true; var i = 0;
    function next() { if (i >= todo.length) return Promise.resolve(); var n = todo[i++]; return BioAudio.length(n).then(function (d) { learnDur(n, d); }).then(next); }
    Promise.all([next(), next()]).then(function () { durBusy = false; }, function () { durBusy = false; });
  }
  document.addEventListener("biooffline", function (ev) { if (ev.detail && ev.detail.state === "done") fillDurations(); });
  /* the player: ONE pill at the bottom right, always there once signed in. Play/pause, the time left and the song's bar are one thing; with no song loaded it says so. It lives in the top layer and is never hidden: a popup that opens is put under it. */
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-acc { display: flex; align-items: center; gap: var(--sp-1); min-width: 0; min-height: var(--ctl); padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer } .bio-accb { display: grid; grid-template-rows: 1fr; transition: grid-template-rows .25s var(--ease) } .bio-accb > div { overflow: hidden; min-height: 0 } .bio-accb[data-closed] { grid-template-rows: 0fr } .bio-accb[data-closed] > div { visibility: hidden; transition: visibility 0s linear .25s } #songInfoDlg .sheet-foot { flex-direction: column; align-items: stretch } #songInfoDlg .sheet-foot > .rbtn { width: 100%; flex: 0 0 auto } #songInfoDlg #sisim { background: transparent; border-color: transparent; color: #B3261E } :root { --bar-top: 8px; --bar-gap: 12px; --dockfull: calc(var(--fab) + var(--gap-button) * 2 + var(--inset-b)); --dockh: var(--inset-b) } html.bio-docked { --dockh: var(--dockfull) } html.bio-docked body { box-sizing: border-box; padding-bottom: var(--dockh) } html.bio-docked .rfab:not(.rfab--in) { bottom: calc(var(--gutter) + var(--dockh)) } html.bio-docked .rmsg--toast { bottom: calc(var(--gutter) + var(--dockh)) !important } " +
      ".bio-dock { position: fixed; inset: auto 0 0 0; margin: 0; width: auto; max-width: none; box-sizing: border-box; min-height: calc(var(--fab) + var(--gap-button) * 2 + var(--inset-b)); display: flex; align-items: center; gap: var(--gap-button); padding: var(--gap-button) var(--gutter) calc(var(--gap-button) + var(--inset-b)); overflow: visible; color: var(--text); background: var(--surface-2); border: 0; border-top: 1px solid var(--line); border-radius: 0; box-shadow: 0 -4px 14px -4px rgba(63, 47, 20, .16); z-index: var(--z-sticky); } " +   /* a square footer across the bottom: the page ends above it, the add button and the toasts sit above it */
      "@media (min-width: 1024px) { .rfab[data-act=\"swap\"] { left: auto !important; right: calc(var(--listw) + var(--gutter)) !important; bottom: calc(var(--gutter) + var(--dockh)) !important } } html.bio-docked dialog:not(:has(.sheet-foot)) .sheet-body { padding-bottom: calc(var(--dockfull) + var(--gutter)) } .bio-dock:not(.on), .bio-dock.closed { display: none } .bio-dock.away { opacity: 0; pointer-events: none } " +
      ".bio-dock__btn { flex: none; display: grid; place-items: center; width: var(--fab); height: var(--fab); padding: 0; border: 0; border-radius: var(--r-fab); background: var(--danger); color: var(--on-primary); cursor: pointer } " +
      ".bio-dock__btn[data-st=\"paused\"] { background: var(--surface-2); color: var(--text) } .bio-dock__btn:disabled { background: var(--surface-2); color: var(--text-3); cursor: default } " +
      ".bio-bar input, .bio-dock__bar { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; margin: 0; cursor: pointer; --p: 0%; --c: var(--primary) } .bio-bar input:hover { --c: var(--danger) } .bio-bar input::-webkit-slider-runnable-track, .bio-dock__bar::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--c) var(--p), var(--track, var(--surface-2)) var(--p)) } .bio-bar input::-webkit-slider-thumb, .bio-dock__bar::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border: 0; border-radius: 50%; background: var(--c) } .bio-bar input::-moz-range-track, .bio-dock__bar::-moz-range-track { height: 4px; border-radius: 2px; background: var(--track, var(--surface-2)) } .bio-bar input::-moz-range-progress, .bio-dock__bar::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--c) } .bio-bar input::-moz-range-thumb, .bio-dock__bar::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--c) } .bio-bar input:focus, .bio-bar input:focus-visible, .bio-dock__bar:focus, .bio-dock__bar:focus-visible, .bio-dock__btn:focus, .bio-dock__btn:focus-visible, .bio-dock__x:focus, .bio-dock__x:focus-visible { outline: none } .bio-dock .bio-vol { margin: 0 } @media (max-width: 1023px) { .bio-dock .bio-vol, .bio-dock .bio-volume { display: none !important } } .bio-volume { flex: none; display: flex; align-items: center; gap: var(--gap-tight); --c: var(--primary) } .bio-volume input { -webkit-appearance: none; appearance: none; background: transparent; width: 7rem; height: 20px; margin: 0; cursor: pointer; direction: ltr; --p: 0% } .bio-volume { direction: ltr; margin-left: var(--sp-3) } .bio-volume input::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--c) var(--p), var(--track, var(--on-primary)) var(--p)) } .bio-volume input::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border: 0; border-radius: 50%; background: var(--c) } .bio-volume input::-moz-range-track { height: 4px; border-radius: 2px; background: var(--track, var(--on-primary)) } .bio-volume input::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--c) } .bio-volume input::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--c) } .bio-volume input:focus, .bio-volume input:focus-visible { outline: none } .bio-volume > .rbtn > svg { width: var(--icon-m); height: var(--icon-m) } .bio-dock__x { flex: none; display: grid; place-items: center; width: var(--icon-m, 20px); height: var(--ctl); padding: 0; border: 0; border-radius: var(--r-ctl); background: transparent; color: var(--text-2); cursor: pointer } .bio-dock__x > svg { width: var(--icon-m, 20px); height: var(--icon-m, 20px); stroke-width: var(--icon-w) } .bio-dock.idle .bio-dock__x { display: none } " +
      "@media (min-width: 701px) { .bio-dock > .bio-volume { order: 1 } .bio-dock > .bio-dock__time { order: 2 } .bio-dock > .rbtn:first-child { order: 3; margin-inline-end: var(--sp-1) } .bio-dock > .bio-dockbar, .bio-dock > .bio-dock__name, .bio-dock > .bio-dock__sync, .bio-dock > [data-hist] { order: 4 } } .bio-dock [data-addcur][hidden], .bio-dock .bio-dock__sync[hidden] { display: none } .bio-dock > .bio-dock__cat { display: none !important }  .bio-dock .bio-dock__sync { position: absolute; top: 3px; left: var(--gutter); margin: 0; pointer-events: none } @media (min-width: 701px) { .bio-dock .bio-dock__sync { left: calc(var(--gutter) + var(--ib) + var(--gap-button)) } } .bio-dock .rbtn > svg { width: var(--icon-l); height: var(--icon-l) } @media (min-width: 760px) { html.bio-docked #addMusDlg, html.bio-docked #histDlg { inset-block-end: var(--dockfull); max-height: calc(100dvh - var(--dockfull) - 48px) } html.bio-docked #addMusDlg #amlist { padding-bottom: var(--gutter) } html.bio-docked #histDlg .sheet-body { padding-bottom: var(--gutter) } } .bio-card [data-fac] { font-size: var(--fs-xs); min-height: 0; padding-block: 2px } .bio-card [data-fac][aria-pressed=\"true\"] { background: var(--surface-2); color: var(--text); border-color: var(--surface-2) } #pl { position: relative } #pl:has(> .bio-banner) { padding-inline-start: 44px } .bio-banner { position: absolute; inset-block: 0; inset-inline-start: 0; width: 44px; height: 100%; border: 0; border-radius: 0; background: var(--primary); color: var(--on-primary); writing-mode: vertical-rl; font: var(--fw-bold) var(--fs-l)/1 var(--font); letter-spacing: .12em; cursor: pointer; z-index: 3 } .bio-banner:hover { filter: brightness(1.1) } #pd { position: relative } #pd::after { content: \"\"; position: absolute; inset: 0; z-index: 5; background: var(--pp-scrim, rgba(16, 20, 26, .55)); opacity: 0; pointer-events: none; transition: opacity .25s var(--ease) } #pd.bio-dim::after { opacity: 1; pointer-events: auto } @media (prefers-reduced-motion: reduce) { #pd::after { transition: none } } #pl .rhead, #pd .rhead { padding-inline-end: calc(var(--gutter) + var(--sbw, 0px)) } .bio-card[aria-current=\"true\"] { border-color: #14110E; box-shadow: inset 0 0 0 1px #14110E } @media (max-width: 1023.98px) { .bio-card[aria-current=\"true\"]:not([data-opt]) { border-color: var(--line); box-shadow: none } } .rrow[aria-current=\"true\"] { box-shadow: inset 3px 0 0 #14110E } .bio-card:has([data-audio][data-st=\"pause\"])[aria-current] { box-shadow: none } .bio-card [data-audio] svg { width: var(--icon-s) !important; height: var(--icon-s) !important } [data-opt] [data-audio] svg, [data-am] [data-audio] svg { width: var(--icon-s) !important; height: var(--icon-s) !important } .bio-dock > .rbtn:first-child:not(:disabled) { background: var(--primary); border-color: var(--primary); color: var(--on-primary) } .bio-dock.playing > .rbtn:first-child:not(:disabled) { color: #C42B1E } .bio-dock.playing { --primary: #FFFFFF; --text: #FFFFFF; --text-2: #FFFFFF; --text-3: #FFFFFF; --surface-2: #B3261E; --line: #C8564D; --track: #D98A83; background: #B3261E }  " +
      ".bio-dock .bio-dockbar { flex: 1 1 8rem; min-width: 0; padding: 0; touch-action: none } .bio-dock .bio-dockbar .bio-dock__bar { width: 100%; display: block; direction: ltr } .bio-dock .bio-dockbar input::-webkit-slider-runnable-track { background: linear-gradient(to right, var(--c) var(--p), var(--track, var(--on-primary)) var(--p)) } .bio-dock .bio-dockbar input::-moz-range-track { background: var(--track, var(--on-primary)) } " +
      ".bio-dock { --surface-2: #14110E; --text: #F4EEE4; --text-2: #BFB5A6; --text-3: #8E8576; --line: #3A342C; --track: #5A5247; --primary: #FFFFFF; --on-primary: #14110E; --danger: #E0402F; --ghost: rgba(244, 238, 228, .12) } .bio-dock .bio-dock__time { color: #FFFFFF !important } .bio-dock__name { cursor: pointer; flex: 0 1 28rem; min-width: 8rem; direction: ltr; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .bio-dock__name span { color: var(--text-2) } .bio-dock__name[data-edit] { cursor: pointer } .bio-dock .bio-dock__cat { background: var(--surface-2); color: var(--text); border-color: var(--surface-2) } .bio-dock .bio-dock__cat[aria-pressed=\"true\"] { background: var(--primary); color: var(--on-primary); border-color: var(--primary) } @media (min-width: 701px) and (max-width: 1023px) { .bio-dock__cat { display: none } } .bio-dock__name span:not(:empty)::before { content: \"· \" } " +
      "@media (max-width: 700px) { .bio-dock { flex-wrap: wrap } .bio-dock__name { flex: 1 1 100%; order: 4 } .bio-dock .bio-dockbar { flex: 0 0 100%; order: 3 } .bio-dock [data-hist] { margin-inline-end: calc((var(--ib) - 22px) / -2) } } " +
      ".bio-dock__time { flex: none; min-width: 2.6em; text-align: center; font: var(--fw-bold) var(--fs-xs)/1 var(--font); font-variant-numeric: tabular-nums } " +
      ".bio-dock__bar { flex: 1 1 0; width: auto; max-width: none; min-width: 0; display: block; margin: 0; padding: 0; direction: ltr; accent-color: var(--primary); touch-action: none } " +
      ".bio-dock__none { flex: 1 1 auto; min-width: 0; text-align: center; color: var(--text-2); font: var(--fw-regular) var(--fs-xs)/1.2 var(--font) } " +
      ".bio-dock:not(.idle) .bio-dock__none, .bio-dock.idle .bio-dock__time { display: none } .bio-dock.idle .bio-dock__bar { opacity: .6; cursor: default } " +
      "";
    document.head.appendChild(st);
    var PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
    var playing = false, loaded = false, closed = false, seekDrag = false, leftNow = 0, frac = 0, curT = 0, curD = 0, curTitle = "", curArtist = "", lastH = 0, last = null, curName = "", asked = {};
    try { last = JSON.parse(localStorage.getItem("biodanza.lastsong") || "null"); if (last && !last.n) last = null; } catch (x) { last = null; }   /* the song that played last: the footer keeps it, also after a reload */
    if (last && window.BioAudio && BioAudio.info) BioAudio.info(last.n, last.t, last.a);
    var HIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>';
    var histName = "";
    function histSave(name, title, artist) {
      if (!(window.FLOA_AUTH && FLOA_AUTH.signedIn())) return;
      api("/rest/v1/listen_history?on_conflict=user_id,audio_object", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", json: { audio_object: name, title: title || "", artist: artist || "", played_at: new Date().toISOString() } }).then(null, function () { /* the copy in this browser stays */ });
    }
    function histImport() {   /* once: what this browser kept before the database did goes up */
      try {
        if (localStorage.getItem("biodanza.history.synced") || !(window.FLOA_AUTH && FLOA_AUTH.signedIn())) return;
        var h = JSON.parse(localStorage.getItem("biodanza.history") || "[]") || [];
        if (!h.length) { localStorage.setItem("biodanza.history.synced", "1"); return; }
        var rows = h.filter(function (e) { return e && e.n; }).map(function (e) { return { audio_object: e.n, title: e.t || "", artist: e.a || "", played_at: new Date(e.at || Date.now()).toISOString() }; });
        api("/rest/v1/listen_history?on_conflict=user_id,audio_object", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: rows }).then(function () { localStorage.setItem("biodanza.history.synced", "1"); }, function () { /* next time */ });
      } catch (x) { /* next time */ }
    }
    function remember(name, title, artist) {   /* one line per song: the last time it started, newest first, the last 300 songs */
      histName = name; histSave(name, title, artist);
      try { var h = (JSON.parse(localStorage.getItem("biodanza.history") || "[]") || []).filter(function (e) { return e && e.n !== name; }); h.unshift({ n: name, t: title || "", a: artist || "", at: Date.now() }); localStorage.setItem("biodanza.history", JSON.stringify(h.slice(0, 300))); } catch (x) { /* not kept */ }
    }
    /* the play button inside a history card says pause while that song plays */
    function hpOn(n) { return !!(n && window.__bioNow && window.__bioNow.playing && window.__bioNow.name === n); }
    function hpPaint() { document.querySelectorAll("[data-hp]").forEach(function (b) { var on = hpOn(b.dataset.hn), k = on ? "1" : "0"; if (b.dataset.pl === k) return; b.dataset.pl = k; b.innerHTML = on ? PAUSE : PLAY; b.setAttribute("aria-label", on ? "עצירה" : "השמעה"); b.title = on ? "עצירה" : "השמעה"; }); }
    document.addEventListener("bioaudio", function () { setTimeout(hpPaint, 0); });
    function playName(n, t, a) {   /* a song of the history plays as its own button would play it */
      if (!n) return;
      if (window.BioAudio && BioAudio.info) BioAudio.info(n, t, a);
      var tb = document.createElement("button"); tb.dataset.audio = n; tb.style.display = "none"; document.body.appendChild(tb); tb.click(); tb.remove();
    }
    function openHistory() {
      var local = function () { try { return JSON.parse(localStorage.getItem("biodanza.history") || "[]") || []; } catch (x) { return []; } };
      var fromDb = api("/rest/v1/listen_history?select=audio_object,title,artist,played_at&order=played_at.desc&limit=120").then(function (rows) {
        return (rows || []).map(function (r) { return { n: r.audio_object, t: r.title, a: r.artist, at: Date.parse(r.played_at) }; });
      });
      var waited = new Promise(function (res) { setTimeout(function () { res(null); }, 2500); });
      Promise.race([fromDb, waited]).then(function (rows) { renderHistory(rows || local()); }, function () { renderHistory(local()); });
    }
    /* wide screen: the history is a layer that comes in from the left, as the catalog comes in from the right; its songs are cards in the same grid as any music */
    var histLayer = null, histOpen = false;
    (function () { var st = document.createElement("style"); st.textContent = "#histLayer { position: fixed; z-index: 20; display: flex; flex-direction: column; min-height: 0; visibility: hidden; transform: translateX(-100%); transition: transform .25s var(--ease), visibility 0s linear .25s; box-shadow: 1px 0 0 var(--line) } #histLayer.is-open { visibility: visible; transform: none; transition: transform .25s var(--ease), visibility 0s } #histLayer > .rlist { flex: 1 1 auto; min-height: 0 } #pl::after { content: \"\"; position: absolute; inset: 0; z-index: 5; background: var(--pp-scrim, rgba(16, 20, 26, .55)); opacity: 0; pointer-events: none; transition: opacity .25s var(--ease) } #pl.bio-dim::after { opacity: 1; pointer-events: auto } @media (prefers-reduced-motion: reduce) { #histLayer, #pl::after { transition: none } }"; document.head.appendChild(st); })();
    function placeHist() { if (!histLayer) return; var a = pd.getBoundingClientRect(); histLayer.style.top = a.top + "px"; histLayer.style.height = a.height + "px"; histLayer.style.left = a.left + "px"; histLayer.style.width = a.width + "px"; }
    function closeHist() { if (!histLayer || !histOpen) return; histOpen = false; histLayer.classList.remove("is-open"); pl.classList.remove("bio-dim"); }
    window.__closeHist = closeHist;
    function showHistLayer(rows, when) {
      if (!histLayer) {
        histLayer = document.createElement("div"); histLayer.id = "histLayer"; histLayer.style.background = getComputedStyle(document.body).backgroundColor;
        document.body.appendChild(histLayer);
        window.addEventListener("resize", placeHist); if (window.ResizeObserver) new ResizeObserver(placeHist).observe(pd);
        histLayer.addEventListener("click", function (ev) {
          var c = ev.target.closest && ev.target.closest("[data-hi]"); if (!c) return;
          var e = histLayer._rows[+c.dataset.hi]; if (!e) return;
          histLayer.querySelectorAll("[data-hi][aria-current]").forEach(function (x) { x.removeAttribute("aria-current"); });   /* it stays open: the song that plays is the marked one */
          c.setAttribute("aria-current", "true"); playName(e.n, e.t, e.a);
        });
        pl.addEventListener("click", function () { if (histOpen && pl.classList.contains("bio-dim")) closeHist(); });   /* a tap on the dark side closes it */
      }
      if (catPanel) closeCatPanel(true);   /* one layer at a time */
      histLayer._rows = rows;
      var nw = window.__bioNow || {};
      var cards = rows.map(function (e, i) {
        var m = { id: "h" + i, audio_object: e.n, title: e.t, name: e.t, artist: e.a };
        return cardUi({ attrs: 'data-hi="' + i + '" role="button" tabindex="0"', selected: !!(nw.name && nw.name === e.n), ltr: true, title: e.t || "מוסיקה", sub: e.a || "", pill: cardPill(m),
          time: '<span style="color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font)">' + esc(when(e.at)) + '</span>' });
      }).join("");
      histLayer.innerHTML = head("היסטוריית האזנה", "", false, "") + '<div class="rlist">' + (rows.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);padding:var(--gutter)">' + cards + '</div>' : ph("אין עדיין היסטוריה", "מוסיקה שהתחלתם להשמיע תופיע כאן")) + '</div>';
      placeHist(); histOpen = true; pl.classList.add("bio-dim");
      requestAnimationFrame(function () { histLayer.classList.add("is-open"); });
    }
    function renderHistory(h) {
      var seen = {}, rows = []; h.forEach(function (e) { if (e && e.n && !seen[e.n]) { seen[e.n] = 1; rows.push(e); } });
      rows = rows.slice(0, 120);
      var dlg = document.getElementById("histDlg");
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "histDlg"; document.body.appendChild(dlg); }
      var when = function (at) {   /* how long ago, in words */
        var m = Math.max(0, Math.floor((Date.now() - at) / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
        if (m < 1) return "עכשיו"; if (m === 1) return "לפני דקה"; if (m < 60) return "לפני " + m + " דקות";
        if (h === 1) return "לפני שעה"; if (h === 2) return "לפני שעתיים"; if (h < 24) return "לפני " + h + " שעות";
        if (d === 1) return "אתמול"; if (d === 2) return "שלשום"; if (d < 7) return "לפני " + d + " ימים";
        var w = Math.floor(d / 7); if (w === 1) return "לפני שבוע"; if (w === 2) return "לפני שבועיים"; if (d < 30) return "לפני " + w + " שבועות";
        var mo = Math.floor(d / 30); if (mo === 1) return "לפני חודש"; if (mo === 2) return "לפני חודשיים"; if (mo < 12) return "לפני " + mo + " חודשים"; return "לפני יותר משנה";
      };
      if (wide()) { showHistLayer(rows, when); return; }
      var cards = rows.map(function (e, i) {
        return '<div class="rcard rcard--compact bio-card' + (hpOn(e.n) ? ' is-play' : '') + '" data-hi="' + i + '"' + (e.n && window.__bioNow && window.__bioNow.name === e.n ? ' aria-current="true"' : '') + ' role="button" tabindex="0" style="cursor:pointer;background:var(--on-primary);margin:0;min-width:0;display:flex;flex-direction:column;gap:2px">' +
          '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;font:var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(e.t || "מוסיקה") + '</span>' +
          '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/var(--lh-tight) var(--font)">' + (e.a ? esc(e.a) : "&nbsp;") + '</span>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:var(--gap-tight)"><button type="button" class="rbtn rbtn--icon" data-hp="' + i + '" data-hn="' + esc(e.n || "") + '" aria-label="' + (hpOn(e.n) ? "עצירה" : "השמעה") + '" title="' + (hpOn(e.n) ? "עצירה" : "השמעה") + '" style="background:var(--surface-2);border-color:var(--surface-2);width:var(--tag-s);min-height:var(--tag-s);height:var(--tag-s);padding:0;border-radius:999px">' + (hpOn(e.n) ? PAUSE : PLAY) + '</button>' +
          '<span style="color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + esc(when(e.at)) + '</span></div></div>';
      }).join("");
      RosterSheet.render(dlg, { title: "היסטוריית האזנה", from: "bottom", size: "l",
        body: '<div style="padding:calc(var(--pp-head-gap, 12px) + var(--pp-hair)) 0 var(--gutter)">' + (rows.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);align-items:stretch">' + cards + '</div>' : ph("אין עדיין היסטוריה", "מוסיקה שהתחילה להתנגן תופיע כאן")) + '</div>' });
      dlg.onclick = function (ev) {
        var c = ev.target.closest && ev.target.closest("[data-hi]"); if (!c) return;
        var e = rows[+c.dataset.hi]; if (!e) return;
        dlg.querySelectorAll("[data-hi][aria-current]").forEach(function (x) { x.removeAttribute("aria-current"); });   /* the popup stays open: the song that plays is the marked one */
        c.setAttribute("aria-current", "true"); playName(e.n, e.t, e.a);
      };
    }
    document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-hist]"); if (b) { if (wide() && histOpen) closeHist(); else openHistory(); } });
    document.addEventListener("click", function (ev) {   /* a tap on the name in the player: a popup with the whole name and the performer; a song outside the catalog can be edited from it */
      var nmEl = ev.target.closest && ev.target.closest(".bio-dock__name"); if (!nmEl) return;
      var who = nmEl.dataset.who, ttl = loaded ? curTitle : (last && last.t) || "", art = loaded ? curArtist : (last && last.a) || "", eid = nmEl.getAttribute("data-edit");
      if (!ttl && !art) return;
      var acb = dock.querySelector("[data-addcur]"), canAdd = !!acb && !acb.hidden, addTo = canAdd ? ((acb.querySelector("[data-addcur-label]") || {}).textContent || "") : "";   /* a phone: adding the song that plays is here, not in the player */
      var headH = '<div style="padding:var(--sp-2) var(--sp-3);max-width:28rem"><div dir="auto" style="font:var(--fw-black) var(--fs-m)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(ttl) + '</div>' + (art ? '<div dir="auto" style="margin-top:2px;color:var(--text-2);font:var(--fw-regular) var(--fs-s)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(art) + '</div>' : '') + '</div>';
      if (wide()) {   /* a computer: a menu that comes out of the name, upwards */
        var mi = (canAdd ? [{ label: "הוספה ל" + addTo, primary: true, fn: function () { acb.click(); } }] : []).concat(eid ? [{ label: "עריכת שם ומבצע", fn: function () { editFromDock(); } }] : []);
        menu(nmEl, [], { foot: mi, head: headH, up: true, ref: nmEl.closest(".bio-dock") });
        return;
      }
      var idlg = document.getElementById("songInfoDlg");
      if (!idlg) { idlg = document.createElement("dialog"); idlg.id = "songInfoDlg"; document.body.appendChild(idlg); }
      RosterSheet.render(idlg, { title: "המוסיקה שמתנגנת", from: "bottom", size: "s",
        body: '<div class="pad"><div dir="auto" style="font:var(--fw-black) var(--fs-l)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(ttl) + '</div>' + (art ? '<div dir="auto" style="margin-top:var(--sp-1);color:var(--text-2);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(art) + '</div>' : '') + '</div>',
        foot: (canAdd || eid) ? (canAdd ? '<button class="rbtn rbtn--block rbtn--primary" type="button" id="siadd">הוספה ל' + esc(addTo) + '</button>' : '') + (eid ? '<button class="rbtn rbtn--block" type="button" id="siedit">עריכת שם ומבצע</button>' : '') : undefined });
      if (who) api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id&limit=1").then(function (rows) {   /* the heart of the song that plays: loved or not, at the left of the header */
        var mr = rows && rows[0], hd = idlg.querySelector(".sheet-head"); if (!mr || !hd || hd.querySelector("[data-like]")) return;
        hd.insertAdjacentHTML("beforeend", heartBtn(mr).replace(" rrow__trail", ""));
        paintHearts(mr.id);
      }, function () { /* no heart without the answer */ });
      var ab2 = idlg.querySelector("#siadd"); if (ab2) ab2.addEventListener("click", function () { idlg.close(); acb.click(); });
      var eb = idlg.querySelector("#siedit"); if (!eb) return;
      eb.addEventListener("click", function () { idlg.close(); editFromDock(); });
      function editFromDock() {
      api("/rest/v1/music?id=eq." + eid + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1").then(function (rows) {
        var m = rows && rows[0]; if (!m) return;
        songEdit(m, function () {
          var t = m.title || m.name, a = m.artist || ""; songInfo[who] = { t: t, a: a };
          if (window.BioAudio && BioAudio.info) BioAudio.info(who, t, a);
          if (curName === who) { curTitle = t; curArtist = a; }
          last = { n: who, t: t, a: a, d: last && last.n === who ? last.d : 0 };
          try { localStorage.setItem("biodanza.lastsong", JSON.stringify(last)); } catch (x) { /* not kept */ }
          sync(); if (document.getElementById("list")) { if (state.items && state.items.length) paint(); }
        });
      }).then(null, fail);
      }
    });
    document.addEventListener("bioaudio", function (ev) {   /* the tab of the exercise whose music plays is red: its number, its name and its facilitators */
      var d = ev.detail || {};
      document.querySelectorAll(".bio-tab[data-aud]").forEach(function (t) { t.classList.toggle("is-play", !!d.playing && ("|" + t.dataset.aud + "|").indexOf("|" + d.name + "|") >= 0); });
      document.querySelectorAll(".bio-card[data-auds]").forEach(function (c) {
        var inAny = !!d.playing && ("|" + c.dataset.auds + "|").indexOf("|" + d.name + "|") >= 0, ch = !!d.playing && !!c.dataset.chosen && c.dataset.chosen === d.name;
        c.classList.toggle("is-play", ch); c.classList.toggle("is-play-opt", inAny && !ch);   /* the chosen song plays: a red card; one of its other options plays: only a red frame */
      });
    });
    document.addEventListener("biosongrenamed", function (ev) {   /* a song was renamed: the player says the new name at once */
      var d3 = ev.detail || {};
      if (curName === d3.n) { curTitle = d3.t; curArtist = d3.a; }
      if (last && last.n === d3.n) { last.t = d3.t; last.a = d3.a; try { localStorage.setItem("biodanza.lastsong", JSON.stringify(last)); } catch (x) { /* not kept */ } }
      if (window.BioAudio && BioAudio.info) BioAudio.info(d3.n, d3.t, d3.a);
      nm0Reset(); sync();
    });
    function nm0Reset() { var el = dock.querySelector(".bio-dock__name"); if (el) el.dataset.h = ""; }
    var syncHide = 0;
    document.addEventListener("biooffline", function (ev) {   /* the songs coming down to the device: an icon in the header of the page, moving while it works */
      var d2 = ev.detail || {}; clearTimeout(syncHide);
      if (d2.state === "done") { if (!d2.total) { syncIcon("", ""); return; } syncIcon("done", "כל המוסיקה במכשיר"); syncHide = setTimeout(function () { syncIcon("", ""); }, 8000); return; }
      if (d2.state === "stopped") { syncIcon("stop", d2.reason === "QuotaExceededError" ? "אין מקום במכשיר למוסיקה" : "ההורדה למכשיר נעצרה"); syncHide = setTimeout(function () { syncIcon("", ""); }, 8000); return; }
      if (!d2.total) { syncIcon("", ""); return; }
      syncIcon("run", "מוריד למכשיר " + d2.done + "/" + d2.total);
    });
    setTimeout(histImport, 3000);
    function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    function make(cls) {
      var d = document.createElement("div"); d.className = cls + " idle";
      d.innerHTML = '<button type="button" class="rbtn rbtn--icon" disabled aria-label="השמעה">' + PLAY + '</button><button type="button" class="rbtn bio-dock__cat" data-catopen aria-pressed="false" aria-label="קטלוג התרגילים" title="קטלוג התרגילים" style="flex:none;order:-1">קטלוג</button><span class="rchip rchip--s bio-dock__time" style="direction:ltr;font-variant-numeric:tabular-nums">0:00 / 0:00</span>' + volDock() + '<button type="button" class="rbtn rbtn--ghost" data-addcur hidden title="הוספת המוסיקה שבנגן לתרגיל הפתוח" style="flex:none;gap:var(--sp-1)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span><span data-addcur-label style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">הוספה לתרגיל</span></button>' +
        '<div class="bio-dockbar"><input class="bio-dock__bar" type="range" min="0" max="1000" value="0" step="1" aria-label="מקום במוסיקה" disabled></div><div class="rrow__main bio-dock__name"><b>לא נבחרה מוסיקה</b> <span></span></div><span class="rchip rchip--s bio-dock__sync" hidden></span><button type="button" class="rbtn rbtn--icon" data-hist aria-label="היסטוריית האזנה" title="היסטוריית האזנה">' + HIST + '</button>';
      d.querySelector("button").addEventListener("click", function () {
        if (loaded) { if (window.BioAudio && BioAudio.playPause) BioAudio.playPause(); return; }
        if (!last) return;   /* nothing loaded: the last song is loaded and played, as its own button does */
        var tb = document.createElement("button"); tb.dataset.audio = last.n; tb.style.display = "none"; document.body.appendChild(tb); tb.click(); tb.remove();
      });
      d.querySelector("[data-addcur]").addEventListener("click", function () {
        var nm = loaded ? curName : (last && last.n), id = liveItem && liveItem.id, it = id && state.items && state.items.filter(function (x) { return x.id === id; })[0];
        var exOpen = !!(it && document.querySelector("#imus [data-addm]"));
        if (!nm || (!exOpen && !state.viv)) return;
        api("/rest/v1/music?audio_object=eq." + encodeURIComponent(nm) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1").then(function (rows) {
          var m = rows && rows[0]; if (!m) { toast("המוסיקה לא נמצאה"); return; }
          var go = function () {
          if (exOpen) return addOpt(it, m).then(function () { var im = document.getElementById("imus"); if (im) im.innerHTML = musCards(it); if (wide()) paint(); toast("נוסף לתרגיל"); });
          var pos = (state.items || []).reduce(function (x, k) { return Math.max(x, k.position); }, 0) + 1;   /* no exercise is open: a new exercise with no name and this song, in "נוספים" */
          return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, backlog: true, exercise_id: null, music_id: m.id } }).then(function () { return loadItems(); }).then(function () { paint(); toast("נוסף לוויוונסיה"); });
          };
          var toL = exOpen ? (itemName(it) || "התרגיל") : (state.viv.title || "הוויוונסיה");
          confirmAddMusic(songName(m), toL, function () { var pr = go(); if (pr && pr.then) pr.then(null, fail); });
        }).then(null, fail);
      });
      var r = d.querySelector(".bio-dock__bar");
      r.addEventListener("pointerdown", function () { seekDrag = true; });
      ["pointerup", "pointercancel", "change"].forEach(function (n) { r.addEventListener(n, function () { seekDrag = false; if (window.BioAudio && BioAudio.commitSeek) BioAudio.commitSeek(); }); });   /* let go of the bar: the new place is set now, with its second of crossfade */
      r.addEventListener("input", function () { if (window.BioAudio && BioAudio.seek) BioAudio.seek(r.value / 1000); });
      return d;
    }
    var dock = make("bio-dock"); dock.setAttribute("popover", "manual"); document.body.appendChild(dock);
    function top() {   /* while a popup is open the page behind it is inert, the pill with it: it moves INTO the topmost open popup (as a popover, so it is drawn over it) and back to the page when none is open */
      var dl = document.querySelectorAll("dialog[open]"), target = dl.length ? dl[dl.length - 1] : document.body;
      try { dock.hidePopover(); } catch (x) { /* not shown yet */ }
      dock.classList.toggle("away", !wide() && !!document.querySelector("dialog[open] .sheet-foot"));
      if (dock.parentNode !== target) target.appendChild(dock);
      try { dock.showPopover(); } catch (x) { /* an old browser: the pill is an ordinary fixed element */ }
    }
    top();
    function sync() {
      var on = !!(window.FLOA_AUTH && FLOA_AUTH.signedIn());
      [dock].forEach(function (d) {
        d.classList.toggle("on", on); d.classList.toggle("away", !!document.querySelector("dialog[open] .sheet-foot"));   /* a popup with its own action button at the bottom (a name, a confirmation) is not covered: the pill slides away while it is open */
        d.classList.toggle("idle", !loaded); d.classList.toggle("playing", playing);
        var ac = d.querySelector("[data-addcur]");
        if (ac) {
          var nmA = loaded ? curName : (last && last.n), idA = liveItem && liveItem.id, itA = idA && state.items && state.items.filter(function (x) { return x.id === idA; })[0];
          var exOpen = !!(nmA && itA && document.querySelector("#imus [data-addm]"));
          var vivList = !exOpen && !!nmA && !!state.viv && !!state.items && canEdit() && !!document.querySelector("#list[data-fab-room]");
          var inViv = function () {   /* is the song already somewhere in this vivencia: an exercise's song or option, the start or the end music */
            if (!vivList || !state.viv) return false;
            var has = function (m) { return m && m.audio_object === nmA; };
            return (state.items || []).some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) ||
              ["start", "end"].some(function (k) { return (recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); }); });
          };
          var show = exOpen ? !optList(itA).some(function (m) { return m.audio_object === nmA; }) : vivList && !inViv();   /* an exercise is open and the song is not in it, or the vivencia is open with no exercise */
          if (ac.hidden === show) ac.hidden = !show;
          if (show) {
            var lb = ac.querySelector("[data-addcur-label]"), nmE = exOpen ? (itemName(itA) || "התרגיל") : (state.viv.title || "הוויוונסיה");
            if (lb && lb.textContent !== nmE) { lb.textContent = nmE; ac.title = exOpen ? "הוספת המוסיקה שבנגן ל" + nmE : "הוספת המוסיקה שבנגן לוויוונסיה " + nmE + " כתרגיל חדש"; }
          }
        }
        var vtE = document.getElementById("vtimer");   /* wide screen: the time left of whichever song of this vivencia plays, in the header of the list */
        if (vtE) {
          var vOn = !!(playing && loaded && curD > 0 && state.viv && state.items && (function (n) { var has = function (m) { return m && m.audio_object === n; };
            return state.items.some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) || ["start", "end"].some(function (k) { return (recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); }); }); })(curName));
          if (vOn) { var vTxt = clk(Math.max(0, Math.ceil(curD - curT))); if (vtE.textContent !== vTxt) vtE.textContent = vTxt; }
          if (vtE.hidden === vOn) vtE.hidden = !vOn;
          var vgE = document.getElementById("vgo");   /* the button is for going to the exercise that plays: gone while that exercise is the one that is open */
          if (vgE) { var itO = liveItem && state.items ? state.items.filter(function (x) { return x.id === liveItem.id; })[0] : null, vShow = vOn && !(itO && optList(itO).some(function (m) { return m.audio_object === curName; })) && state.items.some(function (x) { return optList(x).some(function (m) { return m.audio_object === curName; }); });   /* only for a song of an exercise: not for the start or the end music */ if (vgE.hidden === vShow) vgE.hidden = !vShow; var dsp = vShow ? "" : "none"; if (vgE.style.display !== dsp) vgE.style.display = dsp;
            if (vShow) {   /* the number of the exercise that plays, as on its card: its place in the vivencia, a dot for an additional one, nothing for the start and the end music */
              var itP = state.items.filter(function (x) { var hs = function (m) { return m && m.audio_object === curName; }; return hs(x.music) || (x.item_music_options || []).some(function (o) { return hs(o.music); }); })[0], num = "";
              if (itP) num = itP.backlog ? "•" : String(state.items.filter(function (x) { return !x.backlog; }).indexOf(itP) + 1);
              var gn = document.getElementById("vgon"); if (gn && gn.textContent !== num) gn.textContent = num;
            } }
        }
        var tmE = document.getElementById("itimer");
        if (tmE) {
          var itX = liveItem && state.items ? state.items.filter(function (x) { return x.id === liveItem.id; })[0] : null;
          var tOn = !!(playing && loaded && curD > 0 && itX && optList(itX).some(function (m) { return m.audio_object === curName; }));
          if (tOn) { var tTxt = clk(Math.max(0, Math.ceil(curD - curT))); if (tmE.textContent !== tTxt) tmE.textContent = tTxt; }
          if (tmE.hidden === tOn) tmE.hidden = !tOn;
        }
        document.documentElement.classList.toggle("bio-docked", on);   /* the page ends above the footer */
        var b = d.querySelector("button"), t = d.querySelector(".bio-dock__time"), r = d.querySelector(".bio-dock__bar"), dd0 = loaded ? curD : (last ? last.d : 0), s = window.matchMedia("(max-width: 700px)").matches ? clk(Math.max(0, Math.ceil(dd0 - curT))) : clk(curT) + " / " + clk(dd0), nm = d.querySelector(".bio-dock__name");
        b.disabled = !loaded && !last; r.disabled = !loaded || !(curD > 0); b.dataset.st = playing ? "playing" : "paused";
        var lab = playing ? "השהיית המוסיקה" : "השמעה"; if (b.getAttribute("aria-label") !== lab) { b.setAttribute("aria-label", lab); b.title = lab; b.innerHTML = playing ? PAUSE : PLAY; }
        if (t.textContent !== s) t.textContent = s;
        var nh = '<b>' + esc(loaded ? (curTitle || "מוסיקה") : (last ? last.t || "מוסיקה" : "לא נבחרה מוסיקה")) + '</b> <span>' + esc(loaded ? curArtist : (last ? last.a || "" : "")) + '</span>'; if (nm.dataset.h !== nh) { nm.dataset.h = nh; nm.innerHTML = nh; }
        var who = loaded ? curName : (last && last.n) || "";
        if (nm.dataset.who !== who) {   /* a new song: is it one that is not from the catalog (then its name and performer can be edited by a tap)? */
          nm.dataset.who = who; nm.removeAttribute("data-edit");
          if (who && window.FLOA_AUTH && FLOA_AUTH.signedIn()) api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id,in_catalog&limit=1").then(function (rows) {
            if (nm.dataset.who === who && rows && rows[0] && !rows[0].in_catalog) nm.setAttribute("data-edit", rows[0].id);
          }, function () { /* the name stays plain */ });
        }
        if (!seekDrag) r.value = Math.round(frac * 1000);
        var hh = d.offsetHeight; if (hh && hh !== lastH) { lastH = hh; document.documentElement.style.setProperty("--dockfull", hh + "px"); }   /* the footer's own height: what the page leaves under it */
      });
    }
    var topKey = "";
    function ensureIn() {   /* the pill is never hidden or moved: when a popup opens it is put over it again, with no change to see */
      var dl = document.querySelectorAll("dialog[open]"), target = dl.length ? dl[dl.length - 1] : document.body;
      var key = Array.prototype.map.call(dl, function (d) { return d.id || "?"; }).join("|");
      if (key !== topKey || dock.parentNode !== target || !dock.isConnected) { topKey = key; top(); }
    }
    try { new MutationObserver(ensureIn).observe(document.body, { attributes: true, attributeFilter: ["open"], subtree: true }); } catch (x) { /* the timer below does it */ }
    setInterval(function () { ensureIn(); sync(); }, 200);
    /* the up and down arrow keys are the volume, always (outside a field, a menu or a popup, where they keep their own job); Shift for steps of five */
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, onSeek = tg && tg.type === "range" && !(tg.closest && tg.closest(".bio-vol"));   /* a seek bar that kept focus after a click must not take the arrows: up and down are the volume */
      if (tg && !onSeek && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (document.querySelector("dialog[open], #moreMenu") || !window.BioAudio || !BioAudio.volume || !window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault();
      volState.v = BioAudio.volume((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01)); paintVol();   /* the sound and the gauge in the header are the answer: no message */
    });
    /* while a song plays, on a wide screen, the right and left arrows move it forward and back (5 seconds, Shift 15), whatever page of the app is open */
    document.addEventListener("keydown", function (e) {
      if (!loaded || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, onBar = tg && tg.closest && tg.closest(".bio-dock__bar");   /* the player's own bar keeps no arrow job of its own: they skip, as everywhere */
      if (tg && !onBar && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || (tg.closest && tg.closest(".bio-vol")))) return;
      if (document.querySelector("#moreMenu") || !window.BioAudio || !BioAudio.skip) return;
      e.preventDefault(); BioAudio.skip((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 15 : 5));
    });
    document.addEventListener("bioaudio", function (ev) {
      var dd = ev.detail || {};
      var started = !!dd.playing && !!dd.name && (dd.name !== histName || (!playing && dd.t < 2));   /* a song that starts: another one than the last written (also while the one before it played), or the same from its beginning */
      playing = !!dd.playing; loaded = !!dd.name; if (loaded) closed = false;
      curT = loaded ? dd.t || 0 : 0; curD = loaded ? dd.d || 0 : 0; curTitle = dd.title || ""; curArtist = dd.artist || "";
      curName = dd.name || "";
      if (loaded && !curTitle) {   /* the name came empty: from what a list showed, from the last song, or (once) from the database */
        var kn = songInfo[dd.name] || (last && last.n === dd.name ? { t: last.t, a: last.a } : null);
        if (kn) { curTitle = kn.t; curArtist = kn.a; }
        else if (!asked[dd.name] && window.FLOA_AUTH && FLOA_AUTH.signedIn()) {
          asked[dd.name] = 1; var nm0 = dd.name;
          api("/rest/v1/music?audio_object=eq." + encodeURIComponent(nm0) + "&select=title,name,artist&limit=1").then(function (rows) {
            var x = rows && rows[0]; if (!x) return;
            songInfo[nm0] = { t: x.title || x.name, a: x.artist || "" }; if (window.BioAudio && BioAudio.info) BioAudio.info(nm0, songInfo[nm0].t, songInfo[nm0].a);
            api("/rest/v1/listen_history?audio_object=eq." + encodeURIComponent(nm0), { method: "PATCH", prefer: "return=minimal", json: { title: songInfo[nm0].t, artist: songInfo[nm0].a } }).then(null, function () { /* none */ });
            try { var h0 = JSON.parse(localStorage.getItem("biodanza.history") || "[]") || []; h0.forEach(function (e) { if (e.n === nm0 && !e.t) { e.t = songInfo[nm0].t; e.a = songInfo[nm0].a; } }); localStorage.setItem("biodanza.history", JSON.stringify(h0)); } catch (x3) { /* not kept */ }   /* the history line written before the name was known gets it */
            if (curName === nm0) { curTitle = songInfo[nm0].t; curArtist = songInfo[nm0].a; last = { n: nm0, t: curTitle, a: curArtist, d: curD > 0 ? Math.floor(curD) : 0 }; try { localStorage.setItem("biodanza.lastsong", JSON.stringify(last)); } catch (x2) { /* not kept */ } sync(); }
          }, function () { /* the title stays the plain word */ });
        }
      }
      if (started) remember(dd.name, curTitle, curArtist);
      if (loaded && curTitle && (!last || last.n !== dd.name || last.t !== curTitle || last.a !== curArtist || (dd.d > 0 && last.d !== Math.floor(dd.d)))) { last = { n: dd.name, t: curTitle, a: curArtist, d: dd.d > 0 ? Math.floor(dd.d) : (last && last.n === dd.name ? last.d : 0) }; try { localStorage.setItem("biodanza.lastsong", JSON.stringify(last)); } catch (x) { /* not kept */ } }
      if (loaded && dd.d > 0) { leftNow = Math.max(0, Math.ceil(dd.d - dd.t)); frac = dd.t / dd.d; } else { leftNow = 0; frac = 0; }
      if (window.BioAudio && BioAudio.volume) volState.v = BioAudio.volume(0); paintVol();
      ensureIn(); sync();
    });
  })();
  var barDrag = false;
  document.addEventListener("bioaudio", function (ev) {
    var d = ev.detail || {};
    document.querySelectorAll(".bio-bar").forEach(function (b) {
      var mine = d.name && b.dataset.for === d.name && d.d > 0, r = b.querySelector("input");
      if (!mine) { if (b.dataset.always) { if (!barDrag) r.value = 0; } else b.style.visibility = "hidden"; return; }   /* in a list a bar shows only for the song that has the player (its room is kept); the exercise page's own bar is always there */
      b.style.visibility = "visible";
      if (!barDrag) r.value = Math.round(d.t / d.d * 1000);
    });
  });
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest(".bio-bar")) barDrag = true; }, true);
  ["pointerup", "pointercancel", "change"].forEach(function (n) { document.addEventListener(n, function () { barDrag = false; }, true); });
  document.addEventListener("input", function (e) { var b = e.target.closest && e.target.closest(".bio-bar"); if (b && window.BioAudio) { if (b.dataset.always && BioAudio.seekTo) BioAudio.seekTo(b.dataset.for, e.target.value / 1000); else if (BioAudio.seek) BioAudio.seek(e.target.value / 1000); } });
  /* the bars' filled part follows the value (the track is drawn by us: the browser's own darkens on hover) */
  function paintBars() { document.querySelectorAll(".bio-bar input, .bio-dock__bar").forEach(function (r) { var p = (r.value / (r.max || 1000) * 100) + "%"; if (r.style.getPropertyValue("--p") !== p) r.style.setProperty("--p", p); }); }
  document.addEventListener("bioaudio", function () { paintBars(); });
  document.addEventListener("input", paintBars, true);
  setInterval(paintBars, 250);
  function playCol(m, trail) {
    var tile = songBtn(m, trail).replace(/width:var\(--fab\);height:var\(--fab\);min-height:var\(--fab\);/g, "width:var(--ctl);height:var(--ctl);min-height:var(--ctl);border-radius:var(--r-ctl);background:var(--surface-2);");
    return '<div style="flex:none;display:flex;flex-direction:column;align-items:center;gap:var(--gap-button)">' + tile +
      (durOf(m) || m.audio_object ? '<span class="bio-time" data-dur="' + (m.duration_sec || "") + '"' + (m.audio_object ? ' data-for="' + esc(m.audio_object) + '"' : '') + ' style="display:block;min-height:1em;color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/1 var(--font);font-variant-numeric:tabular-nums">' + (durOf(m) ? clock(durOf(m)) : '') + '</span>' : '') + '</div>';
  }
  /* the heart: the songs I loved. At the right edge of a song's row, in line with the play tile and with the back button above. */
  function heartBtn(m) {
    var on = !!likes[m.id];
    return '<button type="button" class="rbtn rbtn--icon rrow__trail" data-like="' + m.id + '" aria-pressed="' + on + '" aria-label="' + (on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי") + '" title="' + (on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי") + '" style="flex:none;width:var(--ctl);height:var(--ctl);min-height:var(--ctl);color:' + (on ? "var(--danger)" : "var(--text-3)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHearts(id) {
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) {
      var on = !!likes[id]; b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--text-3)";
      b.title = b.ariaLabel = on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי"; b.setAttribute("aria-label", b.title);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-like]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.like, was = !!likes[id];
    if (was) delete likes[id]; else likes[id] = true;
    paintHearts(id);
    (was ? api("/rest/v1/song_likes?music_id=eq." + id, { method: "DELETE" })
         : api("/rest/v1/song_likes", { method: "POST", json: { music_id: id }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likes[id] = true; else delete likes[id]; paintHearts(id); toast("אי אפשר לשמור עכשיו");   /* it did not reach the server: back as it was */
    });
  }, true);
  /* the heart of an exercise: in the exercise page's header, and in my list of loved exercises */
  function heartBtnEx(exId, cls) {
    var on = !!likesEx[exId];
    return '<button type="button" class="rbtn rbtn--icon ' + (cls || "") + '" data-likex="' + exId + '" aria-pressed="' + on + '" aria-label="' + (on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי") + '" title="' + (on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי") + '" style="color:' + (on ? "var(--danger)" : "var(--text-3)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHeartsEx(id) {
    document.querySelectorAll('[data-likex="' + id + '"]').forEach(function (b) {
      var on = !!likesEx[id], tt = on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי";
      b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--text-3)"; b.title = tt; b.setAttribute("aria-label", tt);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-likex]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.likex, was = !!likesEx[id];
    if (was) delete likesEx[id]; else likesEx[id] = true;
    paintHeartsEx(id);
    var isIt = id.indexOf("item:") === 0, rid = isIt ? id.slice(5) : id;   /* an exercise of a vivencia that is no catalog exercise: the heart belongs to the item */
    (was ? api("/rest/v1/" + (isIt ? "item_likes?item_id=eq." : "exercise_likes?exercise_id=eq.") + rid, { method: "DELETE" })
         : api("/rest/v1/" + (isIt ? "item_likes" : "exercise_likes"), { method: "POST", json: isIt ? { item_id: rid } : { exercise_id: rid }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likesEx[id] = true; else delete likesEx[id]; paintHeartsEx(id); toast("אי אפשר לשמור עכשיו");
    });
  }, true);
  /* the red button beside the countdown: to the exercise of this vivencia that holds the song now playing (or to the start or the end music) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#vgo"); if (!b || !state.viv || !state.items) return;
    var n = window.__bioNow && window.__bioNow.name, has = function (m) { return m && m.audio_object === n; };
    var it = state.items.filter(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); })[0], el = null;
    if (it) {
      el = document.querySelector('[data-icard="' + it.id + '"]');
      if (wide() && liveItem && liveItem.id === it.id) { if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }   /* already open: only brought into view */
      if (el) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); el.click(); }
      return;
    }
    ["start", "end"].some(function (k) {
      if ((recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); })) { el = document.querySelector('[data-recv="' + k + '"]'); if (el) { el.scrollIntoView({ block: "nearest", behavior: "smooth" }); el.click(); } return true; }
    });
  });
  /* the heart of a vivencia: at the right edge of its row, in line with the logo above */
  function heartBtnViv(id, cls) {
    var on = !!likesViv[id], tt = on ? "הסרה מהוויוונסיות שאהבתי" : "ויוונסיה שאהבתי";
    return '<button type="button" class="rbtn rbtn--icon ' + (cls || "") + '" data-likev="' + id + '" aria-pressed="' + on + '" aria-label="' + tt + '" title="' + tt + '" style="flex:none;width:var(--ctl);height:var(--ctl);min-height:var(--ctl);color:' + (on ? "var(--danger)" : "var(--text-3)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHeartsViv(id) {
    document.querySelectorAll('[data-likev="' + id + '"]').forEach(function (b) {
      var on = !!likesViv[id], tt = on ? "הסרה מהוויוונסיות שאהבתי" : "ויוונסיה שאהבתי";
      b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--text-3)"; b.title = tt; b.setAttribute("aria-label", tt);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-likev]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.likev, was = !!likesViv[id];
    if (was) delete likesViv[id]; else likesViv[id] = true;
    paintHeartsViv(id);
    (was ? api("/rest/v1/vivencia_likes?vivencia_id=eq." + id, { method: "DELETE" })
         : api("/rest/v1/vivencia_likes", { method: "POST", json: { vivencia_id: id }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likesViv[id] = true; else delete likesViv[id]; paintHeartsViv(id); toast("אי אפשר לשמור עכשיו");
    });
  }, true);
  /* a song as a row to choose from: the same element, a row of its own */
  function songRow(m, cur, attr, extra) {
    return '<div class="rrow rrow--link" style="direction:ltr;padding-inline:var(--gutter);padding-block:var(--sp-2);flex-wrap:wrap"' + (cur ? ' aria-current="true"' : '') + '>' + heartBtn(m) + '<button type="button" class="rrow__main" ' + attr + '="' + m.id + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:left;direction:ltr;cursor:pointer;font:inherit;color:inherit">' + songLines(m) + '</button>' + (extra || '') + playCol(m, true) + '</div>';   /* the text takes what is left, so a long name never pushes the play tile to a line of its own */
  }
  window.toast = window.toast || toast;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-yt]"); if (!a) return;
    played = a.dataset.yt;
    try { localStorage.setItem("biodanza.played", played); } catch (x) { /* not kept */ }
    document.querySelectorAll("a[data-yt]").forEach(function (x) { x.style.color = ytColor(x.dataset.yt); });
  });

  function clock(sec) { return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2); }
  /* poetics and guidance: this item's own text if the facilitator changed it, else the catalog's (the catalog itself is never touched) */
  function itemName(it) { return it.title || name(it.exercises || {}); }
  var LANG = "he";   /* the language of the texts: the catalog's text in this language, else English, else what the exercise itself holds */
  function baseTxt(it, k) {
    var e = it.exercises || {}, ts = e.exercise_texts || [];
    var pick = function (l) { var t = ts.filter(function (x) { return x.lang === l && x[k] && !(k === "curve" && x.curve_basis === "inferred"); })[0]; return t ? t[k] : ""; };   /* a curve position that was only guessed is not shown (see schema.sql) */
    return pick(LANG) || pick("en") || e[k] || "";
  }
  function txt(it, k) { return it[k] != null ? it[k] : baseTxt(it, k); }
  /* a text nobody has checked yet: the catalog has none for this exercise, so the one shown was drafted from its name. It stays marked until the facilitator writes their own. */
  function isDraft(it, k) {
    if (it[k] != null) return false;
    var ts = (it.exercises || {}).exercise_texts || [], t = ts.filter(function (x) { return x.lang === LANG && x[k]; })[0];
    if (k === "level" || k === "curve") return !!t && t[k + "_basis"] === "inferred";   /* a value the catalog does not state: assigned from the method, shown as a draft */
    return !!t && (t.source === "draft" || t.source === "translation");
  }
  /* a draft in a field: the text and the writing area are yellow, the label above it stays on the page's own colour */
  var DRAFT_FIELD = ' style="color:var(--warn);background:linear-gradient(var(--warn-bg), var(--warn-bg)) 0 19px / 100% calc(100% - 19px) no-repeat" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק"';
  var DRAFT = ' style="color:var(--warn);background:var(--warn-bg)" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק"';
  function grow(t) { t.style.height = "auto"; t.style.height = (t.scrollHeight + t.offsetHeight - t.clientHeight) + "px"; var mh = parseFloat(getComputedStyle(t).maxHeight); t.style.overflowY = mh && t.scrollHeight > mh ? "auto" : "hidden"; }   /* rows=1: the height is the text's own, plus the line under it */
  /* the placeholder of an empty list or pane: the curve icon, a title and one line */
  function ph(title, text) { return '<div class="rempty">' + I.curve + '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>'; }
  function phPick(title, text) {   /* the empty side of a computer: choose an exercise, or open the catalog from here */
    return '<div class="rempty">' + I.curve + '<b>' + esc(title) + '</b><span>' + esc(text) + '</span><button type="button" class="rbtn" data-catopen aria-pressed="false" style="margin-top:var(--sp-3);gap:var(--sp-1)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.catalog.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span><span>קטלוג</span></button></div>';
  }
  function uuid() { return crypto.randomUUID(); }
  var volState = { on: true, v: 1 };   /* the volume gauge in the headers: always shown */
  try { var sv0 = parseFloat(localStorage.getItem("biodanza.volume")); if (sv0 >= 0 && sv0 <= 1) volState.v = sv0; } catch (x) { /* full */ }
  function paintVol() {
    document.querySelectorAll(".bio-volume").forEach(function (g) {
      var r = g.querySelector("input"), b = g.querySelector("button"), pc = Math.round(volState.v * 100);
      if (String(r.value) !== String(pc)) r.value = pc; g.style.setProperty("--p", pc + "%");
      var mu = volState.v === 0; if (b.dataset.mu !== (mu ? "1" : "0")) { b.dataset.mu = mu ? "1" : "0"; b.innerHTML = mu ? SPK0 : SPK; b.setAttribute("aria-label", mu ? "ביטול השתקה" : "השתקה"); b.title = b.getAttribute("aria-label"); }
    });
    document.querySelectorAll(".bio-vol").forEach(function (g) {
      g.classList.toggle("on", volState.on); g.style.setProperty("--v", volState.v); g.setAttribute("aria-valuenow", Math.round(volState.v * 100));
      var n = g.querySelector("b"); if (n) n.textContent = Math.round(volState.v * 100);
    });
  }
  /* the gauge moves with a drag or a click (mouse or finger) along it, and with the arrow keys when it has focus */
  function setVol(v) {
    v = Math.max(0, Math.min(1, v));
    if (window.BioAudio && BioAudio.volume) volState.v = BioAudio.volume(v - BioAudio.volume(0)); else volState.v = Math.round(v * 100) / 100;
    paintVol();
  }
  document.addEventListener("input", function (e) { var r = e.target; if (r && r.type === "range" && r.closest && r.closest(".bio-volume")) { var v = r.value / 100; if (v > 0) volBack = v; setVol(v); } });
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-vmute]"); if (!b) return; if (volState.v > 0) { volBack = volState.v; setVol(0); } else setVol(volBack || 0.5); });
  var volDrag = null;   /* { g, y0, v0 } */
  document.addEventListener("pointerdown", function (e) {
    var g = e.target.closest && e.target.closest(".bio-vol"); if (!g || e.button > 0) return;
    e.preventDefault(); volDrag = { g: g, y0: e.clientY, v0: volState.v }; try { g.setPointerCapture(e.pointerId); } catch (x) { /* none */ }
  });
  document.addEventListener("pointermove", function (e) { if (volDrag) setVol(volDrag.v0 + (volDrag.y0 - e.clientY) / 120); });   /* up is louder: 120px is the whole range */
  ["pointerup", "pointercancel"].forEach(function (n) { document.addEventListener(n, function () { volDrag = null; }); });
  document.addEventListener("wheel", function (e) {
    var g = e.target.closest && e.target.closest(".bio-vol"); if (!g) return;
    e.preventDefault(); setVol(volState.v + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01));
  }, { passive: false });
  document.addEventListener("keydown", function (e) {
    var g = e.target.closest && e.target.closest(".bio-vol"); if (!g || e.ctrlKey || e.metaKey || e.altKey) return;
    var d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key]; if (!d) return;
    e.preventDefault(); setVol(volState.v + d * (e.shiftKey ? 0.05 : 0.01));
  });
  /* the volume tile: the numbered button that moves the volume, on a wide screen only (a phone's own volume cannot be read by a page: its keys do it) */
  function volTile() {
    if (!wide()) return "";
    return '<div class="bio-vol' + (volState.on ? ' on' : '') + '" role="slider" tabindex="0" aria-label="עוצמת שמע" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(volState.v * 100) + '" style="--v:' + volState.v + '"><i></i><b>' + Math.round(volState.v * 100) + '</b></div>';
  }
  /* on a wide screen the volume lives in the player pill, between the bar and the X */
  var SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var SPK0 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
  document.querySelectorAll(".bio-volume [data-vmute]").forEach(function (b) { b.removeAttribute("data-mu"); }); paintVol();   /* the player is drawn before these icons exist: its speaker is drawn again now they do */
  var volBack = 0.5;   /* the level a press on the speaker brings back after it was muted */
  /* the volume of the player: a speaker (press it to mute and to unmute) and a slider, on a wide screen only */
  function volDock() { var v = typeof volState === "object" ? volState.v : 1; return '<div class="bio-volume" style="--p:' + Math.round(v * 100) + '%"><button type="button" class="rbtn rbtn--icon" data-vmute aria-label="השתקה" title="השתקה">' + (v ? SPK : SPK0) + '</button><input type="range" min="0" max="100" step="1" value="' + Math.round(v * 100) + '" aria-label="עוצמת שמע"></div>'; }
  function head(title, sub, back, trail, lead) {
    return '<header class="rhead">' + (lead || '') + (back ? '<button class="rbtn rbtn--icon rbtn--edge-start" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title">' + esc(title) + '</h1>' + (sub ? '<span class="rhead__sub">' + esc(sub) + '</span>' : '') + '</div>' +
      (trail || '') + '</header>';   /* the volume, while a song plays: a bar across the free room of the header */
  }
  /* the header that walks a sequence: previous on the right, next on the left, the name centred between them */
  function walkHead(title, hasPrev, hasNext, withList) {
    return '<header class="rhead"><button class="rbtn rbtn--icon rbtn--edge-start" data-act="prevW" aria-label="הקודם" title="הקודם"' + (hasPrev ? "" : " disabled") + '>' + I.back + '</button>' +
      (withList ? '<button class="rbtn rbtn--icon" data-act="list" aria-label="לרשימת התרגילים" title="לרשימת התרגילים">' + I.list + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title" style="text-align:center">' + esc(title) + '</h1></div>' +
      (withList ? '<span aria-hidden="true" style="flex:none;width:var(--ctl)"></span>' : '') +
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="nextW" aria-label="הבא" title="הבא"' + (hasNext ? "" : " disabled") + '>' + I.fwd + '</button></header>';
  }
  /* the header of one exercise: buttons only, each with its word. Previous and the list on the right, next on the left. The name is the field below. */
  function itemHead(hasPrev, hasNext, where, exId, nameText, ro, roLabel, inBack, numText, roPlus, tabs) {
    var nav = !wide() && !ro;   /* beside the list there are no previous and next buttons: the list is the way around */
    if (nav && tabs) {   /* a phone: no arrows and no name here, only the number and the countdown, and under them the tabs of the exercises around it (the name is the first field of the page) */
      return '<header class="rhead bio-ihead bio-ihead--m"><nav class="bio-tabs" aria-label="התרגילים"><div class="bio-tabs__track">' + tabs.map(function (t, i) { return '<span class="bio-tab' + (i === 2 ? ' is-cur' : '') + (playsIn(t && t.a) ? ' is-play' : '') + '"' + (t && t.a ? ' data-aud="' + esc(t.a) + '"' : '') + '><b class="bio-tab__n">' + esc((t && t.n) || "") + '</b><span class="bio-tab__t">' + esc((t && t.t) || "") + '</span>' + (t && t.f ? (t.fh ? '<span class="rchip rchip--s bio-tab__f" data-fac-label="x">' + esc(t.f) + '</span>' : '<span class="rchip rchip--s bio-tab__f" style="background:transparent;border:1px solid #14110E;color:#14110E">' + esc(t.f) + '</span>') : '') + '</span>'; }).join("") + '</div></nav></header>';
    }
    var arrow = function (act, ico, label, off) { return '<button class="rbtn rbtn--icon" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"' + (off ? " disabled" : "") + '>' + ico + '</button>'; };
    return '<header class="rhead' + (ro ? '' : ' bio-ihead') + '">' + (nav ? arrow("prevW", I.back, "הקודם", !hasPrev) : "") + "" +   /* the add button is after the exercise's name, toward the left */
      '<div class="rhead__text" style="flex-direction:row;align-items:center;gap:var(--sp-2);padding-inline-start:0;justify-content:flex-start">' + (numText ? '<span aria-hidden="true" style="flex:none;font:var(--fw-black) calc(2.75 * var(--fs-m))/.95 var(--font);font-variant-numeric:tabular-nums">' + esc(numText) + '</span>' : "") + '<input id="ina" class="rhead__title" placeholder="ללא שם" autocomplete="off" aria-label="שם התרגיל"' + (ro ? ' readonly' : '') + ' value="' + esc(nameText || "") + '" style="flex:1 1 0;width:auto;min-width:0;border:0;background:transparent;padding-inline:0;margin:0;color:inherit;text-align:start;outline:0;text-overflow:ellipsis;text-box:normal;line-height:1.4;padding-block:4px"></div>' +
      (ro && roLabel ? '<button type="button" class="rbtn" style="flex:none;gap:var(--sp-1);margin-inline-end:var(--gutter)" data-act="doswap"' + (roPlus ? ' aria-label="הוספה לוויוונסיה ' + esc(roLabel) + '" title="הוספה לוויוונסיה"' : '') + '>' + (roPlus ? '<span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span><span style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(roLabel) + '</span>' : esc(roLabel)) + '</button>' : "") +
      "" +   /* the heart of a catalog exercise is on its card in the catalog, on hover */
      "" + "" + (ro || wide() ? "" : '<span id="itimer" hidden aria-live="off" style="flex:none;font:var(--fw-black) calc(2.75 * var(--fs-m))/.95 var(--font);font-variant-numeric:tabular-nums;color:var(--text);direction:ltr"></span>') + (nav ? arrow("nextW", I.fwd, "הבא", !hasNext) : "") + (wide() && !ro ? '<button type="button" class="rbtn rbtn--icon bio-flat" data-act="closeIt" aria-label="סגירת התרגיל" title="סגירת התרגיל">' + I.x + '</button>' : "") + '</header>';
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ":root { --primary: #14110E; --on-primary: #FFFFFF } .bio-card.is-play-opt { border-color: #B3261E !important; box-shadow: inset 0 0 0 1px #B3261E !important } [data-recv] [data-audio] { display: none !important } .bio-tab.is-play .bio-tab__n, .bio-tab.is-play .bio-tab__t { color: #B3261E !important } .bio-tab.is-play .rchip[data-fac-label] { background: #B3261E !important; color: #FFFFFF !important } .bio-tab.is-play .rchip:not([data-fac-label]) { border-color: #B3261E !important; color: #B3261E !important } .bio-card:has([data-choose]) { --text: rgba(20, 17, 14, .5); --text-2: rgba(20, 17, 14, .42); --text-3: rgba(20, 17, 14, .38); background: rgba(255, 255, 255, .55) !important; border-color: rgba(20, 17, 14, .1) } .bio-card:has([data-choose]) [data-audio] { opacity: .55 } button.rchip { background: transparent !important; border: 1px solid #14110E !important; color: #14110E !important } button.rchip[aria-pressed=\"true\"]:not([data-fac]) { background: #14110E !important; color: #FFFFFF !important } button.rchip[data-fac][aria-pressed=\"true\"], .rchip[data-fac-label] { background: #14110E !important; color: #FFFFFF !important; border: 0 !important } button.rchip[data-fac][aria-pressed=\"false\"] { background: transparent !important; color: #14110E !important; border: 1px solid #14110E !important } [data-audio] { background: var(--danger) !important; border-color: var(--danger) !important; color: #FFFFFF !important } .bio-card, .bio-card * { user-select: none; -webkit-user-select: none } .bio-card.is-play, .bio-card:has([data-audio][data-st=\"pause\"]) { background: #B3261E !important; border-color: transparent !important; color: #FFFFFF; --text: #FFFFFF; --text-2: #FFFFFF; --text-3: #FFFFFF; --danger: #FFFFFF } .bio-card.is-play [data-audio], .bio-card:has([data-audio][data-st=\"pause\"]) [data-audio] { background: rgba(255, 255, 255, .22) !important } .bio-card.is-play button.rchip, .bio-card:has([data-audio][data-st=\"pause\"]) button.rchip { background: transparent !important; color: #FFFFFF !important; border-color: #FFFFFF !important } .bio-pair > .rbtn, .bio-pair > .bio-flat { min-width: 0; padding-inline: var(--sp-1) } .bio-flat, .rhead .bio-flat, .rhead .bio-flat:hover, .rhead .bio-flat:active, .rhead .bio-flat[aria-expanded] { background: transparent; border-color: transparent } @keyframes bioNum { from { opacity: 0; transform: translateX(var(--nx, 0)) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { .bio-num { animation: none !important } } .bio-bar, .bio-bar * { touch-action: none } .bio-vol { display: none; position: relative; flex: none; place-items: center; width: var(--ctl); height: var(--ctl); border-radius: var(--r-ctl); background: var(--surface-2); overflow: hidden; touch-action: none; cursor: ns-resize; user-select: none; margin-inline-end: var(--sp-1) } .bio-vol.on { display: grid } @media (max-width: 1023px) { .bio-vol { display: none } } .bio-vol > i { position: absolute; inset: auto 0 0 0; height: calc(var(--v) * 100%); background: color-mix(in srgb, var(--primary) 32%, transparent); transition: height var(--t-fast) var(--ease) } .bio-vol > b { position: relative; font: var(--fw-bold) var(--fs-s)/1 var(--font); font-variant-numeric: tabular-nums; color: var(--text) } #pd .bio-vol { display: none !important } /* the volume button is in the list's header, once */ .bio-vol:focus { outline: none } .bio-vol:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }";
    document.head.appendChild(st);
  })();
  /* the exercise as a pager: drag the page sideways to go to the next or the previous one (to the right = the next, as in a right to left book); the page follows the finger, a short drag springs back */
  function attachPager(pg, to, el) {   /* el: where the finger is (default: the page itself); the page moves either way */
    el = el || pg; var ac = new AbortController(), sg = { signal: ac.signal };
    var x0 = 0, y0 = 0, t0 = 0, dx = 0, mode = 0;
    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".bio-bar")) return;   /* a drag on the song's bar moves the song, never the page */
      if (e.pointerType !== "touch" && (e.button > 0 || (e.target.closest && e.target.closest("input, textarea, select, a, button, .rf-rich")))) return;   /* a finger anywhere; a mouse (a narrow window) only off the fields and buttons */
      x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = 0; mode = 1; }, sg);
    el.addEventListener("pointermove", function (e) {
      if (mode === 0 || mode === 3) return;
      var mx = e.clientX - x0, my = e.clientY - y0;
      if (mode === 1) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { mode = 2; try { el.setPointerCapture(e.pointerId); } catch (x) { /* none */ } pg.style.transition = "none"; }
        else { if (Math.abs(my) > 10) mode = 3; return; }
      }
      dx = mx;
      pg.style.transform = "translateX(" + ((dx > 0 ? to.next : to.prev) ? dx : dx * 0.3) + "px)";   /* no page that way: it only gives a little */
      if (to.drag) to.drag((dx > 0 ? to.next : to.prev) ? dx : dx * 0.3, pg.getBoundingClientRect().width || 320);
    }, sg);
    function end() {
      if (mode !== 2) { mode = 0; return; }
      mode = 0;
      var w = pg.getBoundingClientRect().width || 320, v = Math.abs(dx) / Math.max(1, performance.now() - t0), go = dx > 0 ? to.next : to.prev;
      if (go && (Math.abs(dx) > w * 0.22 || v > 0.5)) {
        pg.style.transition = "transform .16s ease-in"; pg.style.transform = "translateX(" + (dx > 0 ? w : -w) + "px)";
        if (to.leave) to.leave(dx > 0 ? 1 : -1);
        setTimeout(go, 150);
      } else { pg.style.transition = "transform .22s cubic-bezier(.2, .8, .2, 1)"; pg.style.transform = ""; if (to.settle) to.settle(); }
    }
    el.addEventListener("pointerup", end, sg); el.addEventListener("pointercancel", end, sg);
    return function () { ac.abort(); };   /* the listeners go, when the exercise changes and the header stays */
  }
  function toast(msg) { /* no black messages at the bottom, by the owner's word: what happened shows on the screen itself; the text goes to the console only */ if (window.console) console.info(msg); }
  function fail(e) { console.error(e); toast("משהו השתבש, נסו שוב"); }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  var syncEl = null, syncSt = { m: "", t: "" };
  function syncIcon(mode, text) {   /* the download to the device, as an icon in the header (left of the three dots): it moves while songs come down */
    syncSt = { m: mode, t: text };
    if (!syncEl) {
      var st = document.createElement("style");
      st.textContent = "@keyframes bioDl { 0% { transform: translateY(-3px); opacity: 0 } 40% { opacity: 1 } 100% { transform: translateY(4px); opacity: 0 } } .bio-sync { position: absolute; top: 2px; right: -7px; display: grid; place-items: center; width: 16px; height: 16px; color: var(--danger); pointer-events: none } .bio-sync[hidden] { display: none } .bio-sync svg { width: 14px; height: 14px; overflow: visible } .bio-sync[data-m=\"run\"] .bio-sync__a { animation: bioDl 1.1s ease-in infinite } .bio-sync[data-m=\"stop\"] { color: var(--danger) } @media (prefers-reduced-motion: reduce) { .bio-sync[data-m=\"run\"] .bio-sync__a { animation: none } }";
      document.head.appendChild(st);
      syncEl = document.createElement("span"); syncEl.className = "bio-sync"; syncEl.hidden = true;
      syncEl.addEventListener("click", function () { if (syncSt.t) toast(syncSt.t); });
    }
    syncEl.dataset.m = mode; syncEl.hidden = !mode; syncEl.setAttribute("aria-label", text || "הורדה למכשיר"); syncEl.title = text || "";
    syncEl.innerHTML = mode === "done" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : mode === "stop" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16"/><g class="bio-sync__a"><path d="M12 5v9M8 10.5l4 4 4-4"/></g></svg>';
    syncPlace(document);
  }
  function syncPlace(root) {
    if (!syncEl) return;
    var h = (root || document).querySelector(".rhead"); if (!h) return;
    var last = h.querySelector(":scope > button:last-of-type") || h.lastElementChild;   /* a mark at the upper right corner of the last button of the header (the three dots), not a button of its own */
    if (!last || last.contains(syncEl)) return;
    last.style.position = "relative"; last.appendChild(syncEl);
  }
  function show(html, wire, pane) { if (!wide() && pane === "d") return itemSheet(html, wire);   /* narrow: the exercise is a popup from the bottom, not a page */
    var isPrev = html.indexOf('data-act="doswap"') >= 0;   /* a catalog exercise (it has the add button) is the one thing on the left that stays lit while the catalog is open */
    if (wide() && ((pane === "d" && (isPrev || !catPanel)) || !state.pickerShow)) pd.classList.remove("bio-dim");   /* anything new on the left, or the catalog closed, and the exercise is lit again */
    var t = wide() && pane === "d" ? pd : pl;
    if (t === pd) catPreview = false;   /* anything else on the left is no longer the catalog's exercise (previewEx sets it again after drawing) */
    if (t === pl && catPanel) closeCatPanel(true);
    t.innerHTML = html; syncPlace(t);
    if (t === pd && catPanel && !isPrev) pd.classList.add("bio-dim");   /* the left side is redrawn while the layer is open (a song playing, a change): it stays behind the half dark backdrop */
    if (t === pl && wide()) {   /* the catalog layer is ready beside the lists, the vivencias and the exercises of one; elsewhere it is not */
      var listy = html.indexOf("data-fab-room") >= 0 && !(state.viv && state.viv.role === "view");
      if (listy) ensureCatLayer();
      if (catLayer) { catLayer.hidden = !listy; placeCatLayer(); }
    }
    if (wire) wire(t); }
  var catPanel = null, catLayer = null, catPreview = false;
  (function () { var st = document.createElement("style"); st.textContent = "#catLayer { position: fixed; z-index: 20; transform: translateX(100%); transition: transform .25s var(--ease); display: flex; flex-direction: column; min-height: 0 } #catLayer[hidden] { display: none } #catLayer.is-open { transform: none } #catLayer > .bio-banner { position: absolute; inset-block: 0; inset-inline-start: auto; left: -44px; width: 44px; height: 100% } #catLayer > .catbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; box-shadow: -1px 0 0 var(--line) } #catLayer > .catbody > .rlist { flex: 1 1 auto; min-height: 0 } @media (prefers-reduced-motion: reduce) { #catLayer { transition: none } }"; document.head.appendChild(st); })();
  /* The catalog is ONE popup, a single body that slides as a whole: it is as wide as the left and the right sides together; its right part is the catalog's list, its left part is the exercise opened from it. Closing moves the whole body; the left part only slides out from under the right one when an exercise is chosen. */
  /* the on-screen keyboard: while it is up, the player (hidden behind it anyway) keeps no room at the bottom of a popup, so the list reaches the keyboard */
  (function () {
    var st = document.createElement("style");
    st.textContent = "@media (max-width: 700px) { * { scrollbar-width: none } #ibtns { height: var(--sp-2) !important } html.bio-docked #itemDlg .sheet { padding-bottom: var(--dockfull) !important } html.bio-docked #itemDlg .sheet-body { padding-bottom: 0 !important } #ibtns { height: 0 !important } *::-webkit-scrollbar { display: none } .rhead { --rh-pad: 4px } .rhead__title, .rhead__title input { font-size: var(--fs-m) !important } dialog.rsheet .sheet-head > :first-child:not(.hicon) { font-size: var(--fs-m) !important } .rhead.rhead { padding-block: calc(4px + var(--safe-t)) 4px } dialog.rsheet .sheet-head { min-height: 0; margin-bottom: 4px } dialog.rsheet .sheet-head:not(:has(button)) { min-height: var(--pp-head, 44px) } .bio-sech { padding-top: var(--sp-1) !important } [data-recv] .bio-accb > div > div { padding-block: var(--sp-1) !important } [data-recv] .bio-accb > div > div:empty { padding: 0 !important } [data-recv] + .bio-sech { padding-top: 0 !important } #plist { padding-block: var(--sp-1) !important } [data-recv=end] { margin-top: 0 !important } #plist > [data-div] { padding: var(--sp-1) 0 0 !important; margin-top: 0 !important; min-height: 0 !important } dialog.rsheet .sheet-head { margin-bottom: 4px } .bio-sech { padding-top: var(--sp-1) !important } dialog.rsheet[data-from=\"bottom\"] > .rs-grab, dialog.rsheet:not([data-from]) > .rs-grab { height: calc(var(--bar-top) + 4px + var(--bar-gap)) !important; align-content: start; margin-bottom: 0 } dialog.rsheet > .rs-grab::before { margin-top: var(--bar-top) } html.bio-docked dialog.rsheet:not(:has(.sheet-foot)) .sheet { padding-bottom: 0 !important } html.bio-docked dialog.rsheet:not(:has(.sheet-foot)) .sheet-body { padding-bottom: var(--dockfull) !important } .bio-ihead--m { display: block; touch-action: pan-y } .bio-ihead--m > .bio-tabs { overflow: hidden; direction: ltr; margin-inline: calc(var(--gutter) * -1); padding-block: 2px } .bio-tabs__track { display: flex; width: max-content; visibility: hidden; transform: translateX(var(--tx, 0px)); transition: transform .22s cubic-bezier(.2, .8, .2, 1) } .bio-tabs__track.is-ready { visibility: visible } .bio-tabs__track.is-drag, .bio-tabs__track.is-drag .bio-tab { transition: none !important } .bio-tab { cursor: pointer; flex: none; display: flex; flex-direction: column; align-items: center; gap: 2px; padding-inline: var(--sp-3); white-space: nowrap; color: var(--text); direction: rtl; opacity: calc(.4 + .6 * max(0, 1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .6))); transition: opacity .22s cubic-bezier(.2, .8, .2, 1) } .bio-tab__f { margin-top: 2px; transform: translateX(calc(var(--nb, 0) * (clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))))) } .bio-tab__n { --nx: calc(clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))); transform: translateX(calc(var(--nb, 0) * var(--nx))); opacity: calc(1 - var(--nb, 0) * min(1, abs(var(--nx)) / (var(--cw, 360px) * .45))); font: var(--fw-black) calc(2.75 * var(--fs-m))/.95 var(--font); font-variant-numeric: tabular-nums } .bio-tab__t { font: var(--fw-medium) var(--fs-s)/var(--lh-tight) var(--font); color: var(--text-2) } .bio-tab.is-cur .bio-tab__t { color: var(--text); font-weight: var(--fw-bold) } .bio-ihead { flex-wrap: wrap; row-gap: 0 } .bio-ihead > .rhead__text { display: contents } .bio-ihead #ina { order: 10; flex: 1 1 100% !important; width: 100% !important; margin-top: var(--sp-1) !important } .bio-ihead #itimer { margin-inline-start: auto } :root { --dockfull: calc(var(--ctl) * 2 + 20px + var(--sp-1) * 3 + var(--inset-b)) } .bio-dock { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; column-gap: var(--sp-1); row-gap: var(--sp-1); min-height: 0; padding-block: var(--sp-1) calc(var(--sp-1) + var(--inset-b)) } .bio-dock > .bio-dockbar { grid-column: 1 / -1; grid-row: 1 } .bio-dock > .rbtn:first-child { grid-column: 1; grid-row: 2; order: 0; margin-inline-end: 0; width: var(--ctl) !important; height: var(--ctl) !important; min-height: var(--ctl) !important } .bio-dock > .bio-dock__time { grid-column: 2; grid-row: 2; order: 0; font: var(--fw-black) var(--fs-l)/1 var(--font) !important; background: transparent !important; padding: 0 !important; min-width: 4.4ch !important; text-align: center; font-variant-numeric: tabular-nums } .bio-dock > .bio-dock__name { grid-column: 3; grid-row: 2; order: 0; min-width: 0 } .bio-dock > [data-hist] { grid-column: 4; grid-row: 2; order: 0 } .bio-dock > .bio-dock__cat { text-decoration: underline; text-underline-offset: 4px; grid-column: 1 / 3; grid-row: 3; order: 0 !important; justify-content: flex-start; padding-inline: 0 !important; width: 100%; min-width: 0 } .bio-dock > [data-addcur] { grid-column: 3; grid-row: 3; order: 0; flex: none !important; min-width: 0; max-width: 100%; justify-self: end; flex-direction: row-reverse; justify-content: flex-end; padding-inline: 0 !important } .bio-dock > [data-addcur][hidden] { display: flex !important; visibility: hidden } .bio-dock > [data-addcur] [data-addcur-label] { max-width: 100% !important } .bio-dock > .bio-volume { display: none } } .bio-dock > [data-addcur], .bio-dock > [data-addcur][hidden] { display: none !important } html.bio-kb .bio-dock { display: none !important } html.bio-kb dialog.rsheet:not(:has(.sheet-foot)) .sheet-body { padding-bottom: 0 !important } html.bio-kb dialog.rsheet:not(:has(.sheet-foot)) .sheet { padding-bottom: 0 !important } html.bio-kb #itemDlg .sheet { padding-bottom: 0 !important }";   /* the exercise popup keeps room for the player at its bottom (rule above, with its id); with the keyboard up the player is gone, so no room is left empty above the keyboard */
    document.head.appendChild(st);
    var vv = window.visualViewport; if (!vv) return;
    function upd() { document.documentElement.classList.toggle("bio-kb", Math.max(0, window.innerHeight - vv.height - vv.offsetTop) > 120); }
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
  })();
  var catPrev = null, catPrevId = null;
  var CAT_KEY = "biodanza.catalog";
  function saveCat() {   /* a snapshot of the catalog: open or closed, the exercise looked at, the categories, the search, the scroll */
    try {
      if (wide()) {
        if (!catLayer) return;
        var pks = catLayer.querySelector("#pks"); localStorage.setItem(CAT_KEY, JSON.stringify({ open: !!catPanel, prev: catPrevId || null, q: pk.q || "", tab: pk.tab || "ex", mq: pk.mq || "", mln: pk.mln || "", mch: pk.mch || "", msp: pk.msp || "", mef: pk.mef || "", cats: pk.open || {}, sc: pks ? pks.scrollTop : 0 }));
      } else {   /* a phone: the two popups */
        var cd = document.getElementById("catDlg"), xd = document.getElementById("exDlg"), pk2 = cd && cd.querySelector("#pks");
        localStorage.setItem(CAT_KEY, JSON.stringify({ open: !!(cd && cd.open), prev: xd && xd.open && xd.dataset.ex ? xd.dataset.ex : null, q: pk.q || "", tab: pk.tab || "ex", mq: pk.mq || "", mln: pk.mln || "", mch: pk.mch || "", msp: pk.msp || "", mef: pk.mef || "", cats: pk.open || {}, sc: pk2 ? pk2.scrollTop : 0 }));
      }
    } catch (e) { /* not kept */ }
  }
  function restoreCatMobile() {   /* a phone after a refresh: the catalog opens again where it was, on the exercise that was chosen */
    if (wide()) return;
    var snap = loadCatSnap(); if (!snap || !snap.open) return;
    var cd = document.getElementById("catDlg"); if (cd && cd.open) return;
    resetPk(); pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || ""; pk.open = snap.cats || {};
    var drawn = pickerSheet(); if (!drawn || !drawn.then) return;
    drawn.then(function () {
      var pks = document.querySelector("#catDlg #pks"); if (pks) pks.scrollTop = snap.sc || 0;
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) previewSheet(ex);
    });
  }
  var catPrevCtx = null;   /* the exercise of the catalog that is looked at: what the add button adds */
  function catAddHtml() {
    var t = state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה";
    return '<button type="button" id="catAdd" class="rbtn" style="flex:none;gap:var(--sp-1)" aria-label="הוספה לוויוונסיה ' + esc(t) + '" title="הוספה לוויוונסיה" disabled><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span><span style="max-width:14rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t) + '</span></button>';
  }
  function refreshPrevLabel() {   /* it always says the vivencia that is open now, and is on only while an exercise is looked at */
    if (!catLayer) return;
    var b = catLayer.querySelector("#catAdd"); if (!b) return;
    var t = state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה", sp = b.querySelector("span:last-child");
    if (sp && sp.textContent !== t) sp.textContent = t; b.setAttribute("aria-label", "הוספה לוויוונסיה " + t); b.disabled = !catPrevCtx;
  }
  function loadCatSnap() { try { return JSON.parse(localStorage.getItem(CAT_KEY) || "null"); } catch (e) { return null; } }
  function ensureCatPrev() { /* the left part is built with the layer */ }
  function closeCatPrev() {   /* the left part slides back in under the right one */
    if (!catPrev) return;
    catPrev.classList.remove("is-open"); catPrevId = null; catPreview = false; catPrevCtx = null; refreshPrevLabel(); saveCat();
    if (catLayer) catLayer.querySelectorAll(".bio-card[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); });
  }
  (function () { var st = document.createElement("style"); st.textContent = "#catLayer { position: fixed; z-index: 20; pointer-events: none; transform: translateX(100%); transition: transform .25s var(--ease) } #catLayer[hidden] { display: none } #catLayer.is-open { transform: none } #catLayer > .catmain { position: absolute; z-index: 1; inset-block: 0; right: 0; width: var(--plw); display: flex; flex-direction: column; min-height: 0; pointer-events: auto; box-shadow: -1px 0 0 var(--line) } #catLayer .catbody > .rhead { padding-inline-end: var(--gutter) } #catLayer .catbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column } #catLayer .catbody > .rlist { flex: 1 1 auto; min-height: 0 } #catLayer > .catprev { position: absolute; z-index: 0; inset-block: 0; left: 0; width: var(--pdw); display: flex; flex-direction: column; min-height: 0; overflow: hidden; pointer-events: auto; visibility: hidden; transform: translateX(100%); transition: transform .25s var(--ease), visibility 0s linear .25s } #catLayer > .catprev.is-open { visibility: visible; transform: none; transition: transform .25s var(--ease), visibility 0s } #catLayer > .catprev > .rlist { flex: 1 1 auto; min-height: 0 } @media (prefers-reduced-motion: reduce) { #catLayer, #catLayer > .catprev { transition: none } }"; document.head.appendChild(st); })();
  function placeCatLayer() {   /* the one body spans both sides, from the left side's edge to the right side's edge */
    if (!catLayer) return; var a = pd.getBoundingClientRect(), b = pl.getBoundingClientRect();
    catLayer.style.top = b.top + "px"; catLayer.style.height = b.height + "px"; catLayer.style.left = a.left + "px"; catLayer.style.width = (b.right - a.left) + "px";
    catLayer.style.setProperty("--pdw", a.width + "px"); catLayer.style.setProperty("--plw", b.width + "px");
  }
  function ensureCatLayer() {   /* built once, closed, waiting off the right edge of the screen */
    if (catLayer) return;
    resetPk();   /* the search box reads the catalog's state: it must exist before the layer is drawn */
    var snap = loadCatSnap(); if (snap) { pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || ""; pk.open = snap.cats || {}; }   /* back to where it was before the refresh */
    var bg = getComputedStyle(document.body).backgroundColor;
    var d = document.createElement("div"); d.id = "catLayer";
    d.innerHTML = '<div class="catprev" style="background:' + bg + '"></div><div class="catmain" style="background:' + bg + '"><div class="catbody" inert><header class="rhead"><div class="rhead__text" style="padding-inline-start:0">' + pickerTabs() + '</div><button type="button" id="catX" class="rbtn rbtn--icon bio-flat" aria-label="סגירת הקטלוג" title="סגירת הקטלוג">' + I.x + '</button></header>' + pickerBody(false) + '</div></div>';
    document.body.appendChild(d); catLayer = d; catPrev = d.querySelector(".catprev"); (d.querySelector("#catAdd") || document.createElement("i")).addEventListener("click", function (ev) {
      var c = catPrevCtx; if (!c) return;
      if (!state.viv) vivPick(ev.currentTarget, c.e, c.fake.music_id, c.fake.sel);
      else addEx(c.e, undefined, undefined, c.fake.music_id, c.fake.sel);
    });
    d.querySelector("#catX").addEventListener("click", function () { closeCatPanel(); });
    var drawn = pickerWire(d.querySelector(".catbody"), undefined, false); placeCatLayer();
    if (snap && snap.open) drawn.then(function () {   /* it was open: it opens again, on the same place and on the same exercise */
      if (catPanel || catLayer.hidden || !wide()) return;
      openCatPanel();
      var pks = catLayer.querySelector("#pks"); if (pks) pks.scrollTop = snap.sc || 0;
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) { var cardEl = catLayer.querySelector('[data-ex="' + ex.id + '"]'); if (cardEl) (cardEl.closest(".bio-card") || cardEl).setAttribute("aria-current", "true"); previewEx(ex); }
    });
    window.addEventListener("resize", placeCatLayer);
    if (window.ResizeObserver) { var ro = new ResizeObserver(placeCatLayer); ro.observe(pl); ro.observe(pd); }
  }
  function closeCatPanel(quiet) {
    if (!catPanel) return;
    catPanel = null; state.pickerShow = false; pd.classList.remove("bio-dim");
    document.querySelectorAll("[data-catopen]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    catLayer.classList.remove("is-open"); catLayer.querySelector(".catbody").setAttribute("inert", ""); saveCat();   /* the whole body slides back off to the right, as one piece; the exercise opened from it is remembered */
  }
  function openCatPanel() {   /* the whole body slides left; the exercise on the left side goes dark */
    if (catPanel || !catLayer || catLayer.hidden) return;
    if (window.__closeHist) window.__closeHist();   /* one layer at a time */
    placeCatLayer(); catLayer.classList.add("is-open"); catLayer.querySelector(".catbody").removeAttribute("inert");
    document.querySelectorAll("[data-catopen]").forEach(function (b) { b.setAttribute("aria-pressed", "true"); });
    catPanel = catLayer; state.pickerShow = true; catPreview = !!catPrevId;
    pd.classList.add("bio-dim"); refreshPrevLabel(); saveCat();
  }
  document.addEventListener("click", function (ev) { var ab = ev.target.closest && ev.target.closest("[data-addex]"); if (ab) {   /* the plus beside the exercises' title: an empty exercise at the end of the numbered ones, opened to be filled in */
      if (!state.viv || !state.items || ab.disabled) return;
      if (!ab.dataset.go) {   /* the plus asks which: an empty new exercise, or one from the catalog */
        menu(ab, [{ label: "תרגיל חדש", icon: I.plus, fn: function () { ab.dataset.go = "1"; ab.click(); } }, { label: "תרגיל מהקטלוג", icon: I.catalog, fn: function () { if (wide()) openCatPanel(); else { resetPk(); pickerSheet(); } } }]);
        return;
      }
      delete ab.dataset.go; ab.disabled = true;
      var cur = liveItem && state.items.filter(function (x) { return x.id === liveItem.id; })[0];   /* standing on an exercise: the new one comes right after it, in its group; otherwise at the end of the numbered ones */
      var pos = cur ? cur.position + 1 : state.items.reduce(function (x, k) { return Math.max(x, k.position); }, 0) + 1;
      var shift = cur ? state.items.filter(function (x) { return x.position > cur.position; }).map(function (x) { return api("/rest/v1/vivencia_items?id=eq." + x.id, { method: "PATCH", prefer: "return=minimal", json: { position: x.position + 1 } }); }) : [];
      Promise.all(shift).then(function () { return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=representation", json: { vivencia_id: state.viv.id, position: pos, backlog: cur ? !!cur.backlog : false, exercise_id: null, music_id: null } }); }).then(function (made) {
        return loadItems().then(function () {
          paint(); ab.disabled = false;
          var it = made && made[0] && state.items.filter(function (x) { return x.id === made[0].id; })[0];
          if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
        });
      }).then(null, function (e) { ab.disabled = false; fail(e); });
      return;
    } });
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-catopen]"); if (!b) return; if (wide()) { if (catPanel) closeCatPanel(); else openCatPanel(); } else { resetPk(); pickerSheet(); } });   /* a computer: the layer; a phone: the popup from the bottom, from anywhere the player is */
  pd.addEventListener("click", function (ev) { if (catPanel && pd.classList.contains("bio-dim")) closeCatPanel(); });   /* a tap on the dark side closes the layer, like any popup */
  /* wide screen: the vivencia list on the right, and after choosing one its exercises take that place and the open exercise is on the left. Back from the exercises is the vivencia list again. */
  function homeWide() { state.viv = null; state.lastItem = null; emptyDetail(); home(); }
  function emptyDetail() {
    if (wide()) show(phPick("בחרו ויוונסיה", "התרגילים שלה יופיעו כאן"), null, "d");
    state.viv = null; paintSel(); setUrl(BASE);
  }
  function paintSel() { pl.querySelectorAll("[data-id]").forEach(function (b) { b.closest(".rrow").setAttribute("aria-current", wide() && state.viv && b.dataset.id === state.viv.id ? "true" : "false"); }); }
  function on(root, act, fn) { root.querySelectorAll('[data-act="' + act + '"]').forEach(function (b) { b.addEventListener("click", function (ev) { fn(b, ev); }); }); }
  function stack() { return stack.s || (stack.s = []); }
  function go(fn) { stack().push(fn); fn(); }
  function back() { if (inSub() || (!wide() && curD() > 0)) { unwind(1); return; }   /* narrow: one level up IS the browser's Back, so the arrow and the button never differ */
    stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); else if (wide()) homeWide(); else home(); }

  /* ---------- gate ---------- */
  function gate(msg, signedIn) {
    show('<div class="rempty" style="margin-block:auto"><b>ביודנסה</b><span>' + esc(msg) + '</span>' +
      (signedIn ? '<button class="rbtn rbtn--ghost" data-act="out">יציאה</button>' : '<button class="rbtn" data-act="in">כניסה עם גוגל</button>') + '</div>', function (r) {
      on(r, "in", function () { FLOA_AUTH.signIn(location.origin + BASE); });
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
    });
  }

  /* ---------- home: my vivencias ---------- */
  /* the vivencias I loved: my list, newest first; a row opens the vivencia */
  function likedVivScreen() {
    show(head("ויוונסיות שאהבתי", "", true) + '<div class="rlist" id="likv"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", back);
      api("/rest/v1/vivencia_likes?select=vivencia_id&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likv"), list = (rows || []).map(function (x) { return state.vivs.filter(function (v) { return v.id === x.vivencia_id; })[0]; }).filter(Boolean);
        l.innerHTML = list.length ? list.map(function (v) {
          var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
          return '<div class="rrow rrow--link">' + heartBtnViv(v.id, "rrow__trail") + '<button type="button" class="rrow__main" data-open="' + v.id + '" style="margin-inline-start:var(--sp-1);background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub">' + n + ' תרגילים</span></button></div>';
        }).join("") : ph("עוד אין ויוונסיות שאהבת", "לחצו על הלב ליד ויוונסיה כדי לשמור אותה כאן");
        l.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.open); }); });
      }, fail);
    });
  }
  /* the exercises I loved: my list, newest first; the heart takes one off it */
  function likedExScreen() {
    show(head("תרגילים שאהבתי", "", true) + '<div class="rlist" id="likx"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", back);
      api("/rest/v1/exercise_likes?select=exercises(id,title_he,title_en,category)&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likx"), list = (rows || []).map(function (x) { return x.exercises; }).filter(Boolean);
        l.innerHTML = list.length ? list.map(function (e) {
          return '<div class="rrow" style="padding-inline:var(--gutter);padding-block:var(--sp-2)">' + heartBtnEx(e.id, "rrow__trail") + '<div class="rrow__main" style="flex:1 1 0;min-width:0;margin-inline-start:var(--sp-1)"><span class="rrow__title">' + esc(name(e)) + '</span>' + (catName(e.category) ? '<span class="rrow__sub">' + esc(catName(e.category)) + '</span>' : '') + '</div></div>';
        }).join("") : ph("עוד אין תרגילים שאהבת", "לחצו על הלב בראש תרגיל כדי לשמור אותו כאן");
      }, fail);
    });
  }
  /* the songs I loved: my list, newest first, each as a song row (the heart takes a song off it) */
  function likedScreen() {
    show(head("מוסיקה שאהבתי", "", true) + '<div class="rlist" id="likl"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", back);
      api("/rest/v1/song_likes?select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likl"), list = (rows || []).map(function (x) { return x.music; }).filter(Boolean);
        l.innerHTML = list.length ? list.map(function (m) { return songRow(m, false, "data-liked"); }).join("") : ph("עוד אין מוסיקה שאהבת", "לחצו על הלב ליד מוסיקה כדי לשמור אותה כאן");
      }, fail);
    });
  }
  function home() {
    curLeave();
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    show(head("הוויוונסיות שלי", "", false,
      '<button class="rbtn rbtn--icon bio-flat" data-act="new" aria-label="ויוונסיה חדשה" title="ויוונסיה חדשה">' + I.plus + '</button><button class="rbtn rbtn--icon bio-flat" data-act="homemore" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>',
      (wide() ? '<img src="favicon.png" alt="" style="flex:none;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl)">' : '<img src="bird.png" alt="" style="flex:none;width:var(--icon-m);height:var(--icon-m);margin-inline:calc((var(--ctl) - var(--icon-m)) / 2);object-fit:contain">')) +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '', function (r) {
      on(r, "homemore", function (b) {   /* one menu: the songs I loved, who may enter (the manager), leaving */
        var items = state.offline ? [] : [{ label: "קטלוג", icon: I.catalog, fn: function () { if (wide()) openCatPanel(); else { resetPk(); pickerSheet(); } } }, { label: "ויוונסיות שאהבתי", icon: I.heart, fn: function () { goSub(likedVivScreen); } }, { label: "תרגילים שאהבתי", icon: I.heart, fn: function () { goSub(likedExScreen); } }, { label: "מוסיקה שאהבתי", icon: I.heart, fn: function () { goSub(likedScreen); } }];   /* in the order of the app: vivencias, exercises, songs */
        if (state.me.admin) items.push({ label: "ניהול משתמשים", icon: I.users, fn: allowPopup });
        items.push({ label: "יציאה", icon: I.out, tone: "danger", fn: function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); } });
        menu(b, items);
      });
      on(r, "new", newViv);
    });
    /* the list is asked for again when an answer fails (a refresh can hit a moment the connection or the token is not ready); only if it still fails, the copies kept on the device are shown, else a line that says so: never an empty list that looks like "no vivencias" */
    var tries = function (n) { return loadVivs().catch(function (e) { if (n <= 0) throw e; return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return tries(n - 1); }); }); };
    /* the screen shows the device's copies at once; the cloud's answer follows and corrects it */
    var cloudIn = false;
    if (window.BioOffline) BioOffline.ready.then(function () { return state.vivs.length ? state.vivs : BioOffline.list().then(function (recs) { return (recs || []).map(function (x) { return Object.assign({}, x.row, { role: x.role, pos: x.pos }); }).sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb; }); }); }).then(function (vs) {
      if (cloudIn || !vs || !vs.length || !document.getElementById("hl")) return;
      state.vivs = vs; renderVivs();
    });
    tries(3).then(function () { cloudIn = true; renderVivs(); }, function (e) {
      console.error(e);
      var l = document.getElementById("hl"); if (!l || state.vivsLoaded || state.vivs.length) return;
      (window.BioOffline ? BioOffline.list() : Promise.resolve([])).then(function (recs) {
        if (recs && recs.length) { state.vivs = recs.map(function (x) { return Object.assign({}, x.row, { role: x.role, pos: x.pos }); }); state.vivs.sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb; }); renderVivs(); }
        else l.innerHTML = ph("לא הצלחנו לטעון את הוויוונסיות", "רעננו את הדף כדי לנסות שוב");
      });
    });
  }
  /* my vivencias, with my role and my order in each */
  function loadVivs() {
    var uid = FLOA_AUTH.userId();
    return Promise.all([api("/rest/v1/vivencias?select=id,title,updated_at,vivencia_items(count)&vivencia_items.backlog=not.is.true"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
      api("/rest/v1/vivencia_shares?email=eq." + encodeURIComponent(FLOA_AUTH.email().toLowerCase()) + "&select=vivencia_id,role,position")]).then(function (r) {
      var pos = {}, role = {};
      (r[2] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = o.role; });   /* shared with me */
      (r[1] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = "owner"; });   /* mine: an owner is above any share */
      state.vivsLoaded = true;
      state.vivs = (r[0] || []).map(function (v) { v.pos = pos[v.id]; v.role = role[v.id] || "view"; return v; });
      /* my own order; a vivencia I have not placed yet (a new one) comes first, newest first */
      state.vivs.sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb || (a.updated_at < b.updated_at ? 1 : -1); });
      syncOffline();   /* the device is made equal to the cloud, in the background (not more than every 30 seconds unless asked) */
    });
  }
  /* the arrow of an empty list, drawn in the real places: it leaves just under the words, goes down and bends left, and ends beside the + button */
  function arrowTo(l) { return; /* the arrows were removed by the owner's word */
    var old = l.querySelector(".bio-arrow"); if (old) old.remove();
    var box = l.querySelector(".rempty"), host = l.closest("#pl, #pd") || l.parentElement, fab = host && host.querySelector(".rfab");
    if (!box || !fab) return;
    var lr = l.getBoundingClientRect(), fr = fab.getBoundingClientRect(), br = box.getBoundingClientRect();
    var sx = br.left + br.width / 2 - lr.left, sy = br.bottom - 12 - lr.top;
    var tx = fr.left + fr.width / 2 - lr.left + fr.width * 0.74, ty = fr.top + fr.height / 2 - lr.top - fr.height * 0.74;
    var dx = sx - tx, dy = ty - sy; if (dy < 40) return;
    var c1x = sx, c1y = sy + dy * 0.6, c2x = tx + dx * 0.5, c2y = ty - dy * 0.12;
    var ang = Math.atan2(ty - c2y, tx - c2x), hl = 15, f = function (n) { return Math.round(n * 10) / 10; };
    var h1 = [tx - hl * Math.cos(ang - 0.5), ty - hl * Math.sin(ang - 0.5)], h2 = [tx - hl * Math.cos(ang + 0.5), ty - hl * Math.sin(ang + 0.5)];
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("class", "bio-arrow"); s.setAttribute("aria-hidden", "true"); s.setAttribute("width", lr.width); s.setAttribute("height", lr.height);
    s.style.cssText = "position:absolute;left:0;top:0;fill:none;stroke:var(--text-3);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;overflow:visible";
    s.innerHTML = '<path d="M' + f(sx) + " " + f(sy) + "C" + f(c1x) + " " + f(c1y) + " " + f(c2x) + " " + f(c2y) + " " + f(tx) + " " + f(ty) + '"/><path d="M' + f(h1[0]) + " " + f(h1[1]) + "L" + f(tx) + " " + f(ty) + "L" + f(h2[0]) + " " + f(h2[1]) + '"/>';
    l.appendChild(s);
    if (!l.__arrowRo && window.ResizeObserver) { l.__arrowRo = new ResizeObserver(function () { if (l.querySelector(".rempty")) arrowTo(l); }); l.__arrowRo.observe(l); }
  }
  function vivMenu(v, b) {   /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
    var items = (v.role === "view" ? [] : [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false); } }]).concat([{ label: "שכפול", icon: I.copy || I.plus, fn: function () { dupPopup(v); } }]);
    if (v.role === "owner") items.push({ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } }, { label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmDelete(v); } });
    else items.push({ label: "הסרה שלי מהוויוונסיה", icon: I.out, tone: "danger", fn: function () { confirmLeave(v); } });
    if (state.offline) items.length = 0;   /* with no internet nothing changes: only the copy on the device can be taken off it */
    if (items.length) menu(b, items);
  }
  (function () { var st = document.createElement("style"); st.textContent = ".bio-card .bio-ha { position: absolute; opacity: 0; flex: none; width: var(--tag-s); height: var(--tag-s); min-height: var(--tag-s); padding: 0; background: transparent; border-color: transparent; transition: opacity var(--t-base) var(--ease) } .bio-card [data-audio] svg, .bio-card [data-hp] svg, #imus .bio-card [data-audio] svg { width: calc(var(--icon-s) * .75); height: calc(var(--icon-s) * .75) } .bio-card [data-orm] { opacity: 0; transition: opacity var(--t-base) var(--ease) } .bio-card [data-orm] > svg { width: var(--icon-m); height: var(--icon-m) } .bio-card:hover [data-orm], .bio-card [data-orm]:focus-visible { opacity: 1 } @media (hover: none) { .bio-card [data-orm] { opacity: 1 } } .bio-card .bio-ha.bio-ha--tl[data-likex] { right: auto; bottom: auto; left: calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2); top: calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2) } .bio-card .bio-ha > svg { width: var(--icon-m); height: var(--icon-m) } .bio-card .bio-ha[data-likex] { right: calc(var(--sp-2) + (var(--ctl) - var(--icon-m)) / 2 - (var(--tag-s) - var(--icon-m)) / 2); bottom: calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2) } .bio-card .bio-ha[data-idel] { left: calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2); top: calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2) }   /* the icon itself is a full card step from the card's edges */ .bio-card:hover .bio-ha, .bio-card .bio-ha:focus-visible, .bio-card .bio-ha[aria-pressed=\"true\"] { opacity: 1 } @media (hover: none) { .bio-card .bio-ha { opacity: 1 } } #list[data-fab-room] { padding-bottom: 0 } .rbtn[data-recvloop], .rbtn[data-recvloop]:hover, .rbtn[data-recvloop]:active, .rbtn[data-recvloop]:focus, .rbtn[data-recvloop][aria-pressed=\"true\"], .rhead .rbtn[data-recvloop]:hover, .rhead .rbtn[data-recvloop]:active { background: transparent; border-color: transparent; box-shadow: none; color: var(--text-2) } .rbtn[data-recvloop][aria-pressed=\"true\"], .rbtn[data-recvloop][aria-pressed=\"true\"]:hover, .rbtn[data-recvloop][aria-pressed=\"true\"]:active { color: var(--danger) } .rhead .rbtn--icon[data-act=\"back\"] { margin-inline-start: 0 } .rhead .rbtn--icon[data-act=\"back\"], .rhead .rbtn--icon[data-act=\"back\"]:hover, .rhead .rbtn--icon[data-act=\"back\"]:active { background: transparent; border-color: transparent } .bio-vm { opacity: 0; transition: opacity var(--t-base) var(--ease) } .rrow:hover .bio-vm, .bio-vm:focus-visible, .bio-vm[aria-expanded=\"true\"] { opacity: 1 } @media (hover: none) { .bio-vm { opacity: 1 } }"; document.head.appendChild(st); })();
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    l.innerHTML = state.vivs.length ? state.vivs.map(function (v) {
      var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
      return '<div class="rrow rrow--link">' + heartBtnViv(v.id, "rrow__trail") + '<button type="button" class="rrow__main" data-id="' + v.id + '" style="margin-inline-start:var(--sp-1);background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub" data-n="' + v.id + '">' + n + ' תרגילים' + (v.role === "owner" ? "" : " · משותף" + (v.role === "view" ? " (צפייה)" : " (עריכה)")) + '</span></button>' + (state.offline ? '' : '<button type="button" class="rbtn rbtn--icon bio-vm" data-vm="' + v.id + '" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>') + '</div>';
    }).join("") : (state.offline ? ph("אין ויוונסיות שמורות", "שמרו ויוונסיה מהתפריט שלה כשיש חיבור, והיא תהיה כאן גם בלי אינטרנט") : ph("עוד אין ויוונסיות", "לחצו על + כדי ליצור את הראשונה"));
    if (!state.vivs.length) { l.style.position = "relative"; if (l.firstElementChild) l.firstElementChild.style.marginBlock = "auto"; arrowTo(l); setTimeout(function () { arrowTo(l); }, 350); }   /* the arrow is a second child, so the words are centred by hand (the kit does it only for an only child) */
    l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); });
    l.querySelectorAll("[data-vm]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var v0 = state.vivs.filter(function (x) { return x.id === b.dataset.vm; })[0]; if (v0) vivMenu(v0, b); }); });   /* the dots on a row of the list: that vivencia's menu */
    if (state.vivs.length) enableDrag(l, "[data-id]", persistVivs);
    paintSel();
    pl.style.setProperty("--sbw", Math.max(0, l.offsetWidth - l.clientWidth) + "px");   /* the header gives its side the room this list's scrollbar takes: its buttons are over the rows' buttons, and no scrollbar left over from another screen moves them */
    if (pending && pending.viv && state.vivsLoaded) {   /* opened on a vivencia's own address; only once the list is really here (the hearts can answer first, and an empty list would throw the address away) */
      var vv = state.vivs.filter(function (x) { return x.id === pending.viv; })[0];
      var want = pending; pending = want.item ? { item: want.item } : null;   /* the address is used once: going back to the list must not open it again */
      if (vv) { openViv(vv.id); return; }
    }
    if (wide() && !state.viv) emptyDetail();
  }

  function dupPopup(v) {   /* a copy of a vivencia: the exercises, their music and the start and end music, under a topic of its own (the copy is the caller's own: no shares) */
    var dlg = document.getElementById("nameDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "nameDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: "שכפול ויוונסיה", from: "bottom", size: "s",
      body: '<div class="pad"><label class="rfield"><span>נושא</span><input id="nt" placeholder=" " autocomplete="off" value="' + esc((v.title || "") + " (עותק)") + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="nsave">שכפול</button>'
    });
    var inp = dlg.querySelector("#nt"), btn = dlg.querySelector("#nsave");
    function save() {
      var t = inp.value.trim(); if (!t) return toast("חסר נושא");
      if (btn.disabled) return; btn.disabled = true;
      var nid = uuid();
      api("/rest/v1/rpc/duplicate_vivencia", { method: "POST", json: { src: v.id, p_id: nid, p_title: t } }).then(function () {
        dlg.close();
        state.vivs.unshift({ id: nid, title: t, role: "owner", updated_at: new Date().toISOString() });
        if (document.getElementById("hl")) renderVivs();
        persistVivs(0, 0);   /* it goes first, like a new one */
      }, function (e) { btn.disabled = false; fail(e); });
    }
    btn.addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }
  function newViv() { namePopup({ id: uuid(), title: "" }, true); }
  /* Who guides an exercise: optional, any number of people, offered only when a vivencia has more than two editors (owners and accounts shared with edit rights). */
  function facOn() { return state.members.length >= 2; }   /* the members are the owners and those who may edit: from two of them an exercise can have a facilitator, and its card says who */
  function facName(e) { var m = state.members.filter(function (x) { return x.email === e; })[0]; return m && m.note ? m.note : e.split("@")[0]; }
  function facShort(e) {
    var parts = function (x) { return facName(x).trim().split(/\s+/); };
    var mine = parts(e), first = mine[0], fam = mine.slice(1).join(" ");
    var same = state.members.filter(function (m) { return m.email !== e && parts(m.email)[0] === first; });
    if (!same.length || !fam) return first;
    var k = 1;
    for (; k < fam.length; k++) {   /* the fewest letters of the family name that no other member with this first name shares */
      var pre = fam.slice(0, k);
      if (!same.some(function (m) { return parts(m.email).slice(1).join(" ").slice(0, k) === pre; })) break;
    }
    return first + " " + fam.slice(0, k) + (k < fam.length ? "׳" : "");
  }
  function audOf(x) { return optList(x).map(function (m) { return m.audio_object; }).filter(Boolean).join("|"); }   /* every song of an exercise, by its file */
  function chosenOf(x) { return (x.music && x.music.audio_object) || ""; }   /* the song the exercise is played with */
  function playsIn(auds) { var n = window.__bioNow; return !!(auds && n && n.playing && n.name && ("|" + auds + "|").indexOf("|" + n.name + "|") >= 0); }
  function facEmails(it) { return (it.vivencia_item_facilitators || []).map(function (x) { return x.email; }); }
  function facLabel(it) {
    var es = facEmails(it);
    if (!es.length) return "מוביל";
    var order = function (e) { var k = state.members.findIndex(function (m) { return m.email === e; }); return k < 0 ? 999 : k; };
    return es.slice().sort(function (a, b) { return order(a) - order(b); }).map(facShort).join(", ");   /* all the leaders, by first name, in the order of the members */
  }
  function facChip(it, extra) {
    if (!facOn()) return "";
    var has = facEmails(it).length > 0;
    if (!canEdit()) return has ? '<span class="rchip' + (extra || "") + '" data-fac-label="' + it.id + '">' + esc(facLabel(it)) + '</span>' : "";
    return '<button type="button" class="rchip rchip--button' + (extra || "") + '" data-fac="' + it.id + '" aria-haspopup="menu" aria-pressed="' + has + '">' + esc(facLabel(it)) + '</button>';
  }
  function facRefresh(it) {
    document.querySelectorAll('[data-fac="' + it.id + '"]').forEach(function (b) { b.textContent = facLabel(it); b.setAttribute("aria-pressed", String(facEmails(it).length > 0)); });
  }
  /* the menu of people: a tick adds or removes one, the menu stays open so several can be ticked */
  function facMenu(btn, it) {
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    var blank = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>';
    function paintM() {
      var on = facEmails(it);
      m.innerHTML = state.members.map(function (x, k) {
        return '<button type="button" class="rmenu__item" role="menuitemcheckbox" aria-checked="' + (on.indexOf(x.email) >= 0) + '" data-k="' + k + '">' + (on.indexOf(x.email) >= 0 ? I.check : blank) + '<span>' + esc(x.note || x.email) + '</span></button>';
      }).join("");
      m.querySelectorAll("[data-k]").forEach(function (b) {
        b.addEventListener("click", function () {
          var mem = state.members[+b.dataset.k], has = facEmails(it).indexOf(mem.email) >= 0;
          var req = has ? api("/rest/v1/vivencia_item_facilitators?item_id=eq." + it.id + "&email=eq." + encodeURIComponent(mem.email), { method: "DELETE" })
                        : api("/rest/v1/vivencia_item_facilitators", { method: "POST", prefer: "return=minimal", json: { item_id: it.id, email: mem.email } });
          req.then(function () {
            it.vivencia_item_facilitators = has ? (it.vivencia_item_facilitators || []).filter(function (x) { return x.email !== mem.email; }) : (it.vivencia_item_facilitators || []).concat([{ email: mem.email }]);
            paintM(); facRefresh(it);
          }, fail);
        });
      });
    }
    paintM();
    var sh = document.createElement("div"); sh.style.cssText = "position:fixed;inset:0;z-index:var(--z-menu);background:transparent;touch-action:none";   /* an open menu blocks everything outside it: a touch there only closes the menu */
    document.body.appendChild(sh); document.body.appendChild(m);
    btn.setAttribute("aria-expanded", "true");   /* the button that opened the menu stays shown while it is open */
    var r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - m.offsetWidth - 8)) + "px";
    function close() { m.remove(); sh.remove(); btn.removeAttribute("aria-expanded"); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target) && e.target !== btn) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
  }
  /* a chip's click is its own: it never opens the strip, and it is not the start of a drag */
  function wireFac(root) {
    root.querySelectorAll("[data-fac]").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var it = state.items.filter(function (x) { return x.id === b.dataset.fac; })[0];
        if (it) facMenu(b, it);
      });
    });
  }

  /* the kit's anchored menu: opens under its button, closes on a tap outside or Escape */
  function menu(btn, items, opts) {   /* opts.head: a block of text above the items; opts.up: the menu opens upwards from the button (the player is at the bottom) */
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    m.innerHTML = (opts && opts.head ? opts.head : "") + items.map(function (it, k) { return '<button type="button" class="rmenu__item" role="menuitem" data-k="' + k + '"' + (it.tone ? ' data-tone="' + it.tone + '"' : '') + '>' + it.icon + '<span>' + esc(it.label) + '</span></button>'; }).join("") + (opts && opts.foot ? '<div style="display:flex;flex-direction:column;gap:var(--sp-1);padding:var(--sp-2) var(--sp-3) var(--sp-3)">' + opts.foot.map(function (f, k) { return '<button type="button" class="rbtn rbtn--block' + (f.primary ? ' rbtn--primary' : '') + '" data-f="' + k + '">' + esc(f.label) + '</button>'; }).join("") + '</div>' : "");
    var sh = document.createElement("div"); sh.style.cssText = "position:fixed;inset:0;z-index:var(--z-menu);background:transparent;touch-action:none";   /* an open menu blocks everything outside it: a touch there only closes the menu */
    document.body.appendChild(sh); document.body.appendChild(m);
    btn.setAttribute("aria-expanded", "true");   /* the button that opened the menu stays shown while it is open */
    var r = btn.getBoundingClientRect();
    if (opts && opts.up) { m.style.maxWidth = "min(28rem, calc(100vw - 16px))"; m.style.top = Math.max(8, Math.round(((opts.ref ? opts.ref.getBoundingClientRect().top : r.top)) - 8 - m.offsetHeight)) + "px"; m.style.left = Math.min(Math.max(8, Math.round(r.left)), Math.max(8, innerWidth - m.offsetWidth - 8)) + "px"; }
    else { m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.round(r.left)) + "px"; }
    function close() { m.remove(); sh.remove(); btn.removeAttribute("aria-expanded"); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
    m.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { var it = items[+b.dataset.k]; if (it.keep) { it.fn(b, close); return; } var f = it.fn; close(); f(); }); });   /* an item with `keep` leaves the menu open: it shows its own progress */
    if (opts && opts.foot) m.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { var f = opts.foot[+b.dataset.f].fn; close(); f(); }); });
    var first = m.querySelector(".rmenu__item"); if (first) first.focus({ preventScroll: true });
  }

  /* sharing: only with accounts of the allowlist (chosen from it, never typed), as a viewer or an editor */
  function sharePopup(v) {
    var dlg = document.getElementById("shareDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "shareDlg"; document.body.appendChild(dlg); }
    var shares = [], cands = [];
    RosterSheet.render(dlg, {
      title: "שיתוף", from: "bottom",
      body: '<div class="pad"><label class="rfield"><span>חיפוש (אימייל או שם)</span><input id="sq" type="search" placeholder=" " autocomplete="off"></label></div><div id="slist"></div>'
    });
    function who(e) { var c = cands.filter(function (x) { return x.email === e; })[0]; return c && c.note ? c.note : e; }
    function paintS() {
      var q = fold(dlg.querySelector("#sq").value.trim()), l = dlg.querySelector("#slist");
      var have = {}; shares.forEach(function (x) { have[x.email] = 1; });
      var mine = shares.filter(function (x) { return !q || fz(x.email + " " + who(x.email), q); });
      var rest = cands.filter(function (c) { return !have[c.email] && (!q || fz(c.email + " " + (c.note || ""), q)); });
      var title2 = function (t) { return '<div class="rrow rrow--compact"><span class="rrow__sub">' + t + '</span></div>'; };
      var html = "";
      if (mine.length) {
        html += title2("משותף עם") + mine.map(function (x) {
          return '<div class="rrow"><div class="rrow__main"><span class="rrow__title">' + esc(who(x.email)) + '</span>' + (who(x.email) !== x.email ? '<span class="rrow__sub" dir="ltr">' + esc(x.email) + '</span>' : '') + '</div>' +
            '<button type="button" class="rchip rchip--button" data-role="view" data-e="' + esc(x.email) + '" aria-pressed="' + (x.role === "view") + '">צפייה</button>' +
            '<button type="button" class="rchip rchip--button" data-role="edit" data-e="' + esc(x.email) + '" aria-pressed="' + (x.role === "edit") + '">עריכה</button>' +
            '<button type="button" class="rbtn rbtn--icon" data-rm="' + esc(x.email) + '" aria-label="הסרה" title="הסרה">' + I.x + '</button></div>';
        }).join("");
      }
      if (rest.length) {
        html += title2("אפשר לשתף עם") + rest.map(function (c) {
          return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-add="' + esc(c.email) + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(c.note || c.email) + '</span>' + (c.note ? '<span class="rrow__sub" dir="ltr">' + esc(c.email) + '</span>' : '') + '</button></div>';
        }).join("");
      }
      l.innerHTML = html || ph("אין חשבונות", "אפשר לשתף רק עם חשבונות מרשימת המורשים. את הרשימה מנהל המנהל.");
      l.querySelectorAll("[data-role]").forEach(function (b) { b.addEventListener("click", function () { setRole(b.dataset.e, b.dataset.role); }); });
      l.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(b.dataset.rm), { method: "DELETE" }).then(load, fail); }); });
      l.querySelectorAll("[data-add]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/vivencia_shares", { method: "POST", prefer: "return=minimal", json: { vivencia_id: v.id, email: b.dataset.add, role: "view" } }).then(load, fail); }); });
    }
    function setRole(e, role) { api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(e), { method: "PATCH", json: { role: role } }).then(load, fail); }
    function load() {
      return Promise.all([api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&select=email,role&order=created_at"), api("/rest/v1/rpc/share_candidates", { method: "POST", json: {} })]).then(function (r) { shares = r[0] || []; cands = r[1] || []; paintS(); }, fail);
    }
    dlg.querySelector("#sq").addEventListener("input", paintS);
    load();
  }

  /* removing an exercise from a vivencia is asked in the kit's popup, one action; the catalog's exercise is untouched */
  function confirmRemoveItem(it) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm",
      title: "הסרת תרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><span>להסיר את "' + esc(itemName(it)) + '" מהוויוונסיה? התרגיל נשאר בקטלוג.</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cdel">הסרה</button>'
    });
    dlg.querySelector("#cdel").addEventListener("click", function () {
      api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "DELETE" }).then(function () { dlg.close(); toast("התרגיל הוסר"); state.lastItem = null;
        if (wide()) { show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); setUrl(BASE + state.viv.id); loadItems().then(paint, fail); } else back(); }, fail);
    });
  }
  /* the name (the theme) of a vivencia is set here, from the list: the kit's popup with a header check to save */
  function namePopup(v, isNew) {
    var dlg = document.getElementById("nameDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "nameDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: isNew ? "ויוונסיה חדשה" : "שינוי שם", from: "bottom", size: "s",
      body: '<div class="pad"><label class="rfield"><span>נושא</span><input id="nt" placeholder=" " autocomplete="off" value="' + esc(v.title) + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="nsave">שמירה</button>'
    });
    var inp = dlg.querySelector("#nt"); inp.focus();
    function save() {
      var t = inp.value.trim(); if (!t) return toast("חסר נושא");
      var done = function () {
        dlg.close();
        if (isNew) { state.vivs.unshift({ id: v.id, title: t, role: "owner", updated_at: new Date().toISOString() });   /* the one who made it owns it: the menu has share and delete at once, not only after a reload */
          renderVivs(); persistVivs(0, 0); }   /* it goes FIRST and stays there (its place is saved like any move), and it is not opened: you stay on the list and see it at the top */
        else { v.title = t; if (state.viv && state.viv.id === v.id) state.viv.title = t; if (wide()) home(); if (state.viv && state.viv.id === v.id) editor(); }   /* narrow: the vivencia's own screen is redrawn in place, the address stays */
      };
      (isNew ? api("/rest/v1/vivencias", { method: "POST", json: { id: v.id, title: t }, prefer: "return=minimal" })
             : api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { title: t, updated_at: new Date().toISOString() } })).then(done, fail);
    }
    dlg.querySelector("#nsave").addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  /* ---------- the vivencia: plan along the curve ---------- */
  function openViv(id) { if (!state.viv || state.viv.id !== id) state.lastItem = null; state.filter = ""; state.viv = state.vivs.filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) { stack().length = 0; show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); } go(editor); paintSel(); }
  var ITEM_SELECT = "&select=id,position,exercise_id,music_id,backlog,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,level,curve,level_basis,curve_basis,source)),music!music_id(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email),item_music_options(music_id,created_at,music(id,name,title,artist,duration_sec,audio_object,in_catalog))&order=position";
  var recvCache = {};   /* the songs of the start and of the end of each vivencia: id|start, id|end */
  function itemsOf(id) {
    var rp = api("/rest/v1/vivencia_reception_music?vivencia_id=eq." + id + "&select=kind,music_id,created_at,position,music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=position.asc.nullslast,created_at.asc").then(function (rows) {
      var st = [], en = [];
      (rows || []).forEach(function (x) { if (x.music) (x.kind === "end" ? en : st).push({ music_id: x.music_id, created_at: x.created_at, position: x.position, music: x.music }); });
      recvCache[id + "|start"] = st; recvCache[id + "|end"] = en;
    }, function () { /* no such songs now */ });
    return Promise.all([api("/rest/v1/vivencia_items?vivencia_id=eq." + id + ITEM_SELECT), rp]).then(function (r) { return r[0]; });
  }
  function recvRows(id) {   /* the start and end songs of a vivencia, one list with a kind on each, for the copy kept on the device */
    var out = []; ["start", "end"].forEach(function (k) { (recvCache[id + "|" + k] || []).forEach(function (x) { out.push({ kind: k, music_id: x.music_id, created_at: x.created_at, music: x.music }); }); });
    return out;
  }
  function loopOn(kind) { try { return localStorage.getItem("biodanza.loop." + (state.viv && state.viv.id) + "." + kind) !== "0"; } catch (e) { return true; } }   /* default: on */
  function loopLive(kind) {   /* a song of this section is playing now */
    var nw = window.__bioNow || {}; if (!nw.playing || !nw.name || !state.viv) return false;
    return optList(recvItem(kind)).some(function (m) { return m.audio_object === nw.name; });
  }
  document.addEventListener("bioaudio", function () {   /* the loop buttons follow the player: red while one of their own songs plays */
    document.querySelectorAll("[data-recvloop]").forEach(function (b) { b.classList.toggle("is-live", loopLive(b.dataset.recvloop)); });
  });
  function registerLists() {   /* which sections are loops, and their songs, to the player */
    fillDurations();   /* the vivencia is on screen: any song of it with no length reads it from its file on the device */
    if (!window.BioAudio || !BioAudio.setLists || !state.viv) return;
    var o = {}; ["start", "end"].forEach(function (k) { o[state.viv.id + "|" + k] = loopOn(k) ? optList(recvItem(k)).map(function (m) { return m.audio_object; }).filter(Boolean) : []; });
    BioAudio.setLists(o);
  }
  function recvItem(kind) {   /* a vivencia's start or end songs, as an "exercise" that only has options */
    var id = state.viv && state.viv.id, key = id + "|" + kind;
    return { __recv: kind, id: id, exercise_id: null, music_id: null, music: null, item_music_options: recvCache[key] || (recvCache[key] = []) };
  }
  var PLAYSVG = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:100%;height:100%"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
  /* a section of only songs: "מוסיקת התחלה" above the exercises, "מוסיקת סיום" under them */
  function recvHtml(kind) {
    var list = optList(recvItem(kind)), edit = canEdit();
    if (!edit && !list.length) return "";
    var label = kind === "start" ? "מוסיקת התחלה" : "מוסיקת סיום";
    var key = state.viv.id + "|" + kind;
    var play = list.length > 1 ? '<button type="button" class="rbtn rbtn--icon' + (loopLive(kind) ? ' is-live' : '') + '" data-recvloop="' + kind + '" aria-pressed="' + loopOn(kind) + '" aria-label="לולאה" title="לולאה: כשמנגנים מוסיקה מהקטע, המוסיקה ממשיכה אחד אחרי השני ובסוף חוזרים להתחלה">' + I.loop + '</button>' : '';
    var pOn = recvPlaying(kind) && !!(window.__bioNow || {}).playing;
    var playBtn = list.length ? '<button type="button" class="rbtn rbtn--icon" data-recvplay="' + kind + '" aria-label="' + (pOn ? "השהיה" : "השמעה") + '" style="background:transparent;border-color:transparent;color:var(--text)">' + (pOn ? PAUSEI : I.play) + '</button>' : '';
    var add = edit ? '<div class="rcard rcard--compact" data-addm role="button" tabindex="0" style="margin:0;min-width:0;display:flex;align-items:center;justify-content:center;gap:var(--sp-1);cursor:pointer;min-height:var(--tag-s);border:1px dashed var(--line-strong);background:transparent;box-shadow:none;color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span>הוספת מוזיקה</div>' : '';
    return '<div data-recv="' + kind + '" style="' + (kind === "start" ? '' : 'margin-top:var(--sp-2)') + '"><div class="bio-sech" style="display:flex;align-items:center;justify-content:space-between;padding:var(--gutter) var(--gutter) 0">' + accHead(kind, label + " (" + list.length + ")") + '<span style="display:flex;align-items:center;gap:var(--sp-1)">' + (edit ? '<button type="button" class="rbtn rbtn--icon" data-addm aria-label="הוספת מוזיקה" title="הוספת מוזיקה">' + I.plus + '</button>' : '') + play + playBtn + '</span></div>' + accOpenTag(kind) +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);padding:var(--gutter)">' + list.map(function (m) { var nw = window.__bioNow || {}; return optCardHtml(m, !!(nw.playing && m.audio_object && nw.name === m.audio_object), edit, true, key); }).join("") + '</div>' + ACC_CLOSE + '</div>';
  }
  function loadItems() {
    return itemsOf(state.viv.id).then(function (r) { r = r || []; state.items = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); if (state.viv) refreshOffline(state.viv); });   /* every change is also in the device copy, so the next open draws it at once */   /* the numbered exercises, then the backlog */
  }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id); curJoin(v.id); refreshPrevLabel();
    show(head(v.title || "ויוונסיה חדשה", "", true, wide() ? '<button type="button" id="vgo" class="rbtn rbtn--icon" hidden aria-label="לתרגיל שמתנגן" title="לתרגיל שמתנגן" style="display:none;flex:none;flex-direction:column;gap:0;color:var(--danger);background:transparent;border-color:transparent"><span id="vgon" style="font:var(--fw-black) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums"></span><span style="display:block;width:18px;height:18px">' + I.curve + '</span></button><span id="vtimer" hidden aria-live="off" style="flex:none;font:var(--fw-black) calc(2.75 * var(--fs-m))/.95 var(--font);font-variant-numeric:tabular-nums;color:var(--text);direction:ltr"></span>' + '<button type="button" class="rbtn rbtn--icon bio-flat" data-catopen aria-pressed="false" aria-label="קטלוג התרגילים" title="קטלוג התרגילים">' + I.catalog + '</button>' : '<button type="button" class="rbtn rbtn--icon bio-flat" data-catopen aria-pressed="false" aria-label="קטלוג התרגילים" title="קטלוג התרגילים">' + I.catalog + '</button>') +   /* the way to the catalog is a word in the header, not a floating button */
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      '', function (r) {   /* on a wide screen the way to the catalog is a green banner down the side, added by show() */
      on(r, "back", back); on(r, "add", function () { resetPk(); if (wide()) goSub(picker); else pickerSheet(); });
      on(r, "more", function (b) {
        /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
        var items = (v.role === "view" ? [] : [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false); } }]).concat([{ label: "שכפול", icon: I.copy || I.plus, fn: function () { dupPopup(v); } }]);
        if (v.role === "owner") items.push({ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } }, { label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmDelete(v); } });
        else items.push({ label: "הסרה שלי מהוויוונסיה", icon: I.out, tone: "danger", fn: function () { confirmLeave(v); } });
        if (state.offline) items.length = 0;   /* with no internet nothing changes: only the copy on the device can be taken off it */
        menu(b, items);
      });
    });
    /* the exercises come from the device's copy at once (the skeleton only when there is none); the cloud's answer then corrects them */
    var local = Promise.resolve(null);
    if (window.BioOffline && BioOffline.isSaved(v.id)) local = BioOffline.get(v.id).catch(function () { return null; });
    var cloudDone = false;
    local.then(function (rec) {
      if (!rec || cloudDone || !state.viv || state.viv.id !== v.id || !document.getElementById("list")) return;
      state.items = rec.items || []; state.members = rec.members || [];
      recvCache[v.id + "|start"] = []; recvCache[v.id + "|end"] = [];
      (rec.reception || []).forEach(function (x) { (recvCache[v.id + "|" + x.kind] = recvCache[v.id + "|" + x.kind] || []).push({ music_id: x.music_id, created_at: x.created_at, music: x.music }); });
      paint();
    });
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) { state.members = mm || []; if (document.getElementById("list")) paint(); }, function () { if (!state.members) state.members = []; });
    loadItems().then(function () {
      cloudDone = true;
      paint();
      refreshOffline(v);
      if (pending && pending.item) {   /* opened on an exercise's own address */
        var want = pending.item; pending = null;
        var it = state.items.filter(function (x) { return x.id === want; })[0];
        if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
      }
    }, fail);
  }
  /* a confirmation is the kit's popup with ONE action: closing it is the cancel */
  /* somebody a vivencia was shared with takes themselves off it; it stays with its owner and the others */
  /* every vivencia is kept on the device, always: at each open the cloud and the device are compared and made equal (also what somebody else changed in a vivencia shared with me) */
  var syncT = 0;
  function syncOffline(force) {
    if (state.offline || !window.BioOffline || !state.vivsLoaded || navigator.onLine === false) return;
    if (!force && Date.now() - syncT < 30000) return;
    syncT = Date.now();
    BioOffline.sync(state.vivs, function (v) {
      return Promise.all([itemsOf(v.id), api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } })]).then(function (r) {
        var items = r[0] || [];
        return { id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, vivencia_items: [{ count: items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: items, members: r[1] || [], reception: recvRows(v.id) };
      });
    });
  }
  function refreshOffline(v) {   /* an open vivencia is already read: its copy is made current from that, quietly */
    if (state.offline || !window.BioOffline) return;
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) {
      return BioOffline.update({ id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, vivencia_items: [{ count: state.items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: state.items, members: mm || [], reception: recvRows(v.id) });
    }, function () { /* the old copy stays */ });
  }
  /* coming back to the app, or the internet coming back, is another comparison (not more than once a minute) */
  document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - syncT > 60000 && state.vivsLoaded && !state.offline) loadVivs().catch(function () { /* no internet now */ }); });
  function confirmLeave(v) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm",
      title: "הסרה מהוויוונסיה", from: "bottom", size: "s",
      body: '<div class="pad"><span>להסיר את עצמך מ"' + esc(v.title || "ויוונסיה ללא שם") + '"? היא נשארת אצל הבעלים ואצל מי שהיא משותפת איתו. כדי לחזור צריך שישתפו אותה איתך שוב.</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cleave">הסרה</button>'
    });
    dlg.querySelector("#cleave").addEventListener("click", function () {
      api("/rest/v1/rpc/leave_vivencia", { method: "POST", json: { v: v.id } }).then(function () {
        dlg.close(); if (window.BioOffline) BioOffline.remove(v.id); toast("הוסרת מהוויוונסיה"); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    });
  }
  function confirmDelete(v) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm",
      title: "מחיקת ויוונסיה", from: "bottom", size: "s",
      body: '<div class="pad"><span>למחוק את "' + esc(v.title || "ויוונסיה ללא שם") + '" ואת כל התרגילים שבה? אי אפשר לשחזר.</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cdel">מחיקה</button>'
    });
    dlg.querySelector("#cdel").addEventListener("click", function () {
      api("/rest/v1/vivencias?id=eq." + v.id, { method: "DELETE" }).then(function () {
        dlg.close(); if (window.BioOffline) BioOffline.remove(v.id); toast("הוויוונסיה נמחקה"); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    });
  }
  function paint() {
    refreshPrevLabel();
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-n="' + state.viv.id + '"]'); if (cnt) cnt.textContent = state.items.filter(function (i) { return !i.backlog; }).length + " תרגילים";
    var vis = state.items;   /* the order of the list IS the curve: no phase is kept on an item */
    if (!vis.length) {
      /* an empty vivencia: the words, and an arrow from them down to the + button (only for somebody who can add) */
      l.style.position = "relative";
      l.innerHTML = ph("הוויוונסיה ריקה", canEdit() ? "לחצו על + כדי להוסיף תרגיל מהקטלוג" : "");
      if (l.firstElementChild) l.firstElementChild.style.marginBlock = "auto";   /* the arrow is a second child: the words are centred by hand */
      if (canEdit()) { arrowTo(l); setTimeout(function () { arrowTo(l); }, 350); }
      return;
    }
    var main = state.items.filter(function (i) { return !i.backlog; }), back = state.items.filter(function (i) { return i.backlog; });
    var rowOf = function (i, tile) {
      var m = i.music;
      return cardUi({ cls: "bio-icard" + (playsIn(chosenOf(i)) ? " is-play" : playsIn(audOf(i)) ? " is-play-opt" : ""), attrs: 'data-auds="' + esc(audOf(i)) + '" data-chosen="' + esc(chosenOf(i)) + '" data-icard="' + i.id + '"' + (i.backlog ? ' data-back="1"' : ''), selected: wide() && state.lastItem === i.id, lead: tile, bigLead: true, title: itemName(i), titleAttr: 'data-edit="' + i.id + '"',
        sub: m ? songName(m) : "בלי מוזיקה", subRight: !!m, subLtr: m ? undefined : false, footEnd: true, pill: m ? cardPill(m) : "", chip: facChip(i, " rchip--s"), time: m ? clkSpan(m) : "",
        actions: (canEdit() ? '<button type="button" class="rbtn rbtn--icon bio-ha" data-idel="' + i.id + '" aria-label="הסרה מהוויוונסיה" title="הסרה מהוויוונסיה">' + I.trash + '</button>' : '') + heartBtnEx(i.exercise_id || ("item:" + i.id), "bio-ha") });   /* on hover: the bin at the right, the heart at its left */
    };
    var exHead = '<div class="bio-sech" style="display:flex;align-items:center;justify-content:space-between;padding:var(--gutter) var(--gutter) 0">' + accHead("ex", "ויוונסיה (" + main.length + ")") + '' + (canEdit() ? '<button type="button" class="rbtn rbtn--icon" data-addex aria-haspopup="menu" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>' : '') + '</div>';   /* the exercises have a title like the songs of the start, with a plus at its other end */
    l.innerHTML = recvHtml("start") + exHead + accOpenTag("ex") + '<div id="plist" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);align-items:stretch;padding:var(--gutter)">' + main.map(function (i, k) { return rowOf(i, k + 1); }).join("") +
      '<div data-div style="grid-column:1 / -1;padding:var(--sp-2) 0 var(--sp-1);margin-top:var(--sp-1);min-height:var(--ctl)"><div class="rrow__sub">נוספים</div>' + (back.length || !canEdit() ? '' : '<div class="rrow__sub" style="margin-top:var(--sp-1)">גררו לכאן תרגיל שעוד לא החלטתם עליו</div>') + '</div>' +
      back.map(function (i) { return rowOf(i, "•"); }).join("") + '</div>' + ACC_CLOSE + recvHtml("end");
    /* the list has a scrollbar at its left edge that takes room from the cards: the header above gives its left side the same room, so its button is over the cards' edge */
    var sbw = Math.max(0, l.offsetWidth - l.clientWidth); pl.style.setProperty("--sbw", sbw + "px");
    var openIt = function (id) {
      var it = state.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
      if (wide() && liveItem && liveItem.id === id) {   /* a second press on the open exercise closes it */
        liveItem = null; state.lastItem = null; show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); markItem(); setUrl(BASE + state.viv.id); return;
      }
      if (wide()) itemScreen(it); else go(function () { itemScreen(it); });
    };
    l.querySelectorAll("[data-icard]").forEach(function (c) { c.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a, [data-fac], [data-idel], [data-likex]")) return;
      openIt(c.dataset.icard);
    }); });
    l.querySelectorAll("[data-idel]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var it = state.items.filter(function (x) { return x.id === b.dataset.idel; })[0]; if (it) confirmRemoveItem(it); }); });
    wireFac(l);
    l.querySelectorAll("[data-recv]").forEach(function (rc) {
      var kind = rc.dataset.recv;
      rc.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-audio], a")) return;
        var it = recvItem(kind);
        var rpb = ev.target.closest("[data-recvloop]");
        if (rpb) {   /* a setting, not a player: lit, the songs of this part go on one after the other, round and round; off, a song plays alone */
          var now = rpb.getAttribute("aria-pressed") !== "true";
          try { localStorage.setItem("biodanza.loop." + state.viv.id + "." + kind, now ? "1" : "0"); } catch (e) { /* kept for this visit only */ }
          rpb.setAttribute("aria-pressed", String(now)); registerLists();
          return;
        }
        if (ev.target.closest("[data-addm]")) { openAddMusic(it, function () { paint(); }); return; }
        var rm = ev.target.closest("[data-orm]");
        if (rm) { var mm = optList(it).filter(function (x) { return x.id === rm.dataset.orm; })[0]; if (mm) confirmRemoveOpt(it, mm, function () { paint(); }); return; }
        var c = ev.target.closest("[data-opt]"); if (!c) return;
        var pb = c.querySelector("[data-audio]"); if (pb) pb.click();
      });
    });
    registerLists();
    if (canEdit()) {
      enableGroupDrag(l.querySelector("#plist"), persistGroups);
      ["start", "end"].forEach(function (k) { var box = l.querySelector('[data-recv="' + k + '"] > div:last-child'); if (box) enableRecvDrag(box, k); });
    }
  }
  /* the order of the start or end music: the same drag as the exercise cards, in one list. The others make room, with their animation. */
  function enableRecvDrag(box, kind) {
    var cards = [].slice.call(box.querySelectorAll(".bio-card[data-opt]")); if (cards.length < 2) return;
    var d = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };
    box.addEventListener("touchmove", blockTouch, { passive: false });
    cards.forEach(function (c) {
      c.addEventListener("pointerdown", function (e) {
        if (e.button > 0 || e.target.closest("button, a, [data-audio]")) return;
        var rects = cards.map(function (r) { return r.getBoundingClientRect(); });
        d = { c: c, k: cards.indexOf(c), x0: e.clientX, y0: e.clientY, pid: e.pointerId, live: false, timer: null, order: null,
              sl: rects.map(function (b) { return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height }; }) };
        if (e.pointerType === "touch") d.timer = setTimeout(function () { if (d && !d.live) begin(); }, 160);
      });
    });
    function begin() {
      d.live = true; d.c.setPointerCapture && d.c.setPointerCapture(d.pid);
      d.c.style.transition = "none"; d.c.style.zIndex = "var(--z-raised)"; d.c.style.boxShadow = "var(--sh-card)";
      cards.forEach(function (r) { if (r !== d.c) r.style.transition = "transform var(--t-base) var(--ease)"; });
    }
    function move(e) {
      if (!d) return;
      var dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.live) {
        if (e.pointerType === "touch") { if (Math.abs(dy) > 8) { clearTimeout(d.timer); d = null; } return; }
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        begin();
      }
      d.c.style.transform = "translate(" + dx + "px, " + dy + "px)";
      var cx = d.sl[d.k].x + dx, cy = d.sl[d.k].y + dy, others = [];
      cards.forEach(function (r, i) { if (i !== d.k) others.push(i); });
      var ins = 0; others.forEach(function (i, n) { var t = d.sl[i]; if (t.y < cy - t.h / 2 || (Math.abs(t.y - cy) <= t.h / 2 && t.x > cx)) ins = n + 1; });
      var order = others.slice(); order.splice(ins, 0, d.k); d.order = order;
      order.forEach(function (ci, pos) {
        if (ci === d.k) return;
        var slot = d.sl[pos], r = cards[ci];
        r.style.transform = pos !== ci ? "translate(" + Math.round(slot.x - d.sl[ci].x) + "px, " + Math.round(slot.y - d.sl[ci].y) + "px)" : "";
      });
    }
    box.addEventListener("pointermove", move);
    function finish() {
      if (!d) return;
      clearTimeout(d.timer);
      var was = d; d = null;
      if (!was.live) return;
      cards.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; });
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener("click", eat, true); setTimeout(function () { document.removeEventListener("click", eat, true); }, 80);
      if (!was.order || was.order.every(function (v, i) { return v === i; })) return;
      persistRecv(kind, was.order.map(function (i) { return cards[i].dataset.opt; }));
    }
    box.addEventListener("pointerup", finish); box.addEventListener("pointercancel", finish);
  }
  function persistRecv(kind, ids) {   /* ids: the music ids in their new order */
    var key = state.viv.id + "|" + kind, list = recvCache[key] || [], by = {};
    list.forEach(function (o) { by[o.music_id] = o; });
    recvCache[key] = ids.map(function (id, k) { var o = by[id]; if (o) o.position = k + 1; return o; }).filter(Boolean);
    paint();
    Promise.all(ids.map(function (id, k) { return api("/rest/v1/vivencia_reception_music?vivencia_id=eq." + state.viv.id + "&kind=eq." + kind + "&music_id=eq." + id, { method: "PATCH", prefer: "return=minimal", json: { position: k + 1 } }); })).then(function () { if (state.viv) refreshOffline(state.viv); }, fail);
  }
  /* beside the list the open exercise's strip is marked at once, wherever it was opened from (a click, the arrows, a swap) */
  function markItem() {
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;
    l.querySelectorAll("[data-edit]").forEach(function (b) { (b.closest(".bio-icard") || b.closest(".rrow")).setAttribute("aria-current", wide() && b.dataset.edit === state.lastItem ? "true" : "false"); });
  }
  function persistGroups(mainIds, backIds) {
    var by = {}; state.items.forEach(function (i) { by[i.id] = i; });
    var nm = mainIds.map(function (id) { return by[id]; }).filter(Boolean), nb = backIds.map(function (id) { return by[id]; }).filter(Boolean);
    state.items = nm.concat(nb);
    var jobs = [];
    state.items.forEach(function (it, k) {
      var isBack = k >= nm.length;
      if (it.position === k + 1 && !!it.backlog === isBack) return;
      it.position = k + 1; it.backlog = isBack;
      jobs.push(api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { position: k + 1, backlog: isBack } }));
    });
    Promise.all(jobs).then(loadItems).then(paint, fail);
  }
  /* The drag of the exercise cards: two groups, the numbered ones and "נוספים". The divider never moves; the group is the one the carried card is over
     (below the divider's middle: "נוספים"), the place in it is where the card is in reading order, and the others go to the places they would have. */
  function enableGroupDrag(l, onDrop) {
    if (l._dragOff) l._dragOff();
    var cards = [].slice.call(l.querySelectorAll(".bio-icard")), div = l.querySelector("[data-div]");
    var d = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };
    l.addEventListener("touchmove", blockTouch, { passive: false });
    var grpOf = function (c) { return c.hasAttribute("data-back") ? 1 : 0; };
    var ids = function (arr) { return arr.map(function (i) { return cards[i].dataset.icard; }); };
    function keyMove(c, delta) {   /* Alt + arrow: one place on, across the divider too */
      var main = cards.filter(function (r) { return !grpOf(r); }).map(function (r) { return r.dataset.icard; }), back = cards.filter(grpOf).map(function (r) { return r.dataset.icard; });
      var id = c.dataset.icard, inBack = grpOf(c) === 1, arr = inBack ? back : main, k = arr.indexOf(id), to = k + delta;
      if (to < 0 || to >= arr.length) {
        if (!inBack && delta > 0) { main.splice(k, 1); back.unshift(id); }
        else if (inBack && delta < 0) { back.splice(k, 1); main.push(id); }
        else return;
      } else { arr.splice(k, 1); arr.splice(to, 0, id); }
      onDrop(main, back);
    }
    cards.forEach(function (c) {
      var title = c.querySelector("[data-edit]");
      if (title) title.addEventListener("keydown", function (e) {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        e.preventDefault(); keyMove(c, e.key === "ArrowUp" ? -1 : 1);
      });
      c.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        var rects = cards.map(function (r) { return r.getBoundingClientRect(); });
        d = { c: c, k: cards.indexOf(c), x0: e.clientX, y0: e.clientY, pid: e.pointerId, live: false, timer: null, order: null,
              sl: rects.map(function (b) { return { x: b.left + b.width / 2, y: b.top + b.height / 2, h: b.height }; }) };
        if (e.pointerType === "touch") d.timer = setTimeout(function () { if (d && !d.live) begin(); }, 160);
      });
    });
    function begin() {
      d.live = true; d.c.setPointerCapture && d.c.setPointerCapture(d.pid);
      d.c.style.transition = "none"; d.c.style.zIndex = "var(--z-raised)"; d.c.style.boxShadow = "var(--sh-card)";
      cards.forEach(function (r) { if (r !== d.c) r.style.transition = "transform var(--t-base) var(--ease)"; });
      if (div) div.style.transition = "transform var(--t-base) var(--ease)";
    }
    function virtualSlot(g, sl, idxs) {   /* the place after the last one of a group, for the card that moves into it */
      var last = sl[idxs[idxs.length - 1]], xs = sl.map(function (t) { return t.x; }), right = Math.max.apply(null, xs), left = Math.min.apply(null, xs);
      var pitch = sl.length > 2 ? sl[2].y - sl[0].y : last.h + 8;
      return Math.abs(last.x - right) < Math.abs(last.x - left) ? { x: left, y: last.y } : { x: right, y: last.y + pitch };
    }
    function move(e) {
      if (!d) return;
      var dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      if (!d.live) {
        if (e.pointerType === "touch") { if (Math.abs(dy) > 8) { clearTimeout(d.timer); d = null; } return; }
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        begin();
      }
      d.c.style.transform = "translate(" + dx + "px, " + dy + "px)";
      var cx = d.sl[d.k].x + dx, cy = d.sl[d.k].y + dy, dr = div.getBoundingClientRect(), back = cy > dr.top + dr.height / 2 ? 1 : 0;
      var grp = [[], []], slots = [[], []];
      cards.forEach(function (r, i) { slots[grpOf(r)].push(i); if (i !== d.k) grp[grpOf(r)].push(i); });
      var ins = 0; grp[back].forEach(function (i, n) { var t = d.sl[i]; if (t.y < cy - t.h / 2 || (Math.abs(t.y - cy) <= t.h / 2 && t.x > cx)) ins = n + 1; });
      var order = [grp[0].slice(), grp[1].slice()]; order[back].splice(ins, 0, d.k); d.order = order;
      /* a card that crosses the divider needs room on the other side: the divider and the "נוספים" cards go down by the room of a card (it enters the numbered ones) or up (it leaves them), in a single column */
      var from = grpOf(d.c), oneCol = d.sl.every(function (t) { return Math.abs(t.x - d.sl[0].x) < 3; }), gapPx = parseFloat(getComputedStyle(div.parentElement).rowGap) || 8, room = d.sl[d.k].h + gapPx;
      var extra = !oneCol ? 0 : (from === 1 && back === 0) ? room : (from === 0 && back === 1) ? -room : 0;
      div.style.transform = extra ? "translateY(" + Math.round(extra) + "px)" : "";
      [0, 1].forEach(function (g) { order[g].forEach(function (ci, pos) {
        if (ci === d.k) return;
        var slot = pos < slots[g].length ? d.sl[slots[g][pos]] : (slots[g].length ? virtualSlot(g, d.sl, slots[g]) : null), r = cards[ci];
        var ex = g === 1 ? extra : 0, mv = slot && !(pos < slots[g].length && slots[g][pos] === ci);
        r.style.transform = mv || ex ? "translate(" + Math.round(mv ? slot.x - d.sl[ci].x : 0) + "px, " + Math.round((mv ? slot.y - d.sl[ci].y : 0) + ex) + "px)" : "";
      }); });
    }
    l.addEventListener("pointermove", move);
    function finish() {
      if (!d) return;
      clearTimeout(d.timer);
      var was = d; d = null;
      if (!was.live) return;
      cards.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; });
      if (div) { div.style.transform = ""; div.style.transition = ""; }
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      l.addEventListener("click", eat, true); setTimeout(function () { l.removeEventListener("click", eat, true); }, 80);
      if (!was.order) return;
      var nm = ids(was.order[0]), nb = ids(was.order[1]);
      var om = cards.filter(function (r) { return !grpOf(r); }).map(function (r) { return r.dataset.icard; }), ob = cards.filter(grpOf).map(function (r) { return r.dataset.icard; });
      if (nm.join() === om.join() && nb.join() === ob.join()) return;
      onDrop(nm, nb);
    }
    l.addEventListener("pointerup", finish); l.addEventListener("pointercancel", finish);
    l._dragOff = function () { l.removeEventListener("touchmove", blockTouch); l.removeEventListener("pointermove", move); l.removeEventListener("pointerup", finish); l.removeEventListener("pointercancel", finish); l._dragOff = null; };
  }
  function persistCross(from, to) {   /* from, to: places among the rows AND the divider "נוספים"; what ends up after the divider is "נוספים" */
    var main = state.items.filter(function (i) { return !i.backlog; }), back = state.items.filter(function (i) { return i.backlog; });
    var seq = main.concat([null], back), moved = seq.splice(from, 1)[0]; seq.splice(to, 0, moved);
    var d = seq.indexOf(null), nm = seq.slice(0, d), nb = seq.slice(d + 1);
    state.items = nm.concat(nb);
    var jobs = [];
    nm.concat(nb).forEach(function (it, k) {
      var isBack = k >= nm.length;
      if (it.position === k + 1 && !!it.backlog === isBack) return;
      it.position = k + 1; it.backlog = isBack;
      jobs.push(api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { position: k + 1, backlog: isBack } }));
    });
    Promise.all(jobs).then(loadItems).then(paint, fail);
  }
  function persistItems(from, to) {
    var moved = state.items.splice(from, 1)[0]; state.items.splice(to, 0, moved);
    Promise.all(state.items.map(function (it, k) {
      if (it.position === k + 1) return null;
      it.position = k + 1;
      return api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { position: k + 1 } });
    })).then(loadItems).then(paint, fail);
  }
  function persistVivs(from, to) {
    var moved = state.vivs.splice(from, 1)[0]; state.vivs.splice(to, 0, moved);
    var uid = FLOA_AUTH.userId();
    Promise.all(state.vivs.map(function (v, k) {
      if (v.pos === k + 1) return null;
      v.pos = k + 1;
      return v.role === "owner" ? api("/rest/v1/vivencia_owners?vivencia_id=eq." + v.id + "&user_id=eq." + uid, { method: "PATCH", json: { position: k + 1 } })
                                : api("/rest/v1/rpc/set_share_position", { method: "POST", json: { v: v.id, pos: k + 1 } });
    })).then(function () { renderVivs(); }, fail);
  }

  /* Reorder by dragging a row (no arrows). A mouse drags after a few pixels; a finger after a short hold, so scrolling still works.
     Only transform is animated. Keyboard: Alt + Arrow up/down on the focused row title. The order of the list is the curve. */
  function enableDrag(l, keySel, onMove, rowSel) {
    if (l._dragOff) l._dragOff();   /* the list element is reused: drop the previous paint's listeners */
    var rows = [].slice.call(l.querySelectorAll(rowSel || ".rrow, [data-div]")), gapPx = parseFloat(getComputedStyle(l).rowGap) || 0;   /* a divider (data-div) is a place in the order, not a row to drag */
    var d = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };
    l.addEventListener("touchmove", blockTouch, { passive: false });
    rows.forEach(function (row, k) {
      if (row.hasAttribute("data-div")) return;
      var title = row.querySelector(keySel);
      title.addEventListener("keydown", function (e) {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        var to = k + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        e.preventDefault(); onMove(k, to);
      });
      row.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        d = { grip: !!e.target.closest("[data-grip]"), row: row, k: k, y0: e.clientY, pid: e.pointerId, live: false, timer: null, x0: e.clientX, tops: rows.map(function (r) { var b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }), to: k };   /* the middle of every place, across and down: a list is one column, a grid of cards is several */
        if (e.pointerType === "touch" && !d.grip) d.timer = setTimeout(function () { if (d && !d.live) begin(); }, 160);
      });
    });
    function begin() {
      d.live = true; d.row.setPointerCapture && d.row.setPointerCapture(d.pid);
      d.row.style.transition = "none"; d.row.style.zIndex = "var(--z-raised)"; d.row.style.boxShadow = "var(--sh-card)"; d.row.style.position = "relative";
      rows.forEach(function (r) { if (r !== d.row) r.style.transition = "transform var(--t-base) var(--ease)"; });
    }
    function move(e) {
      if (!d) return;
      var dy = e.clientY - d.y0;
      if (!d.live) {
        if (e.pointerType === "touch" && !d.grip) { if (Math.abs(dy) > 8) { clearTimeout(d.timer); d = null; } return; }
        if (Math.abs(dy) < 6) return;
        begin();
      }
      var dx = e.clientX - d.x0;
      d.row.style.transform = "translate(" + dx + "px, " + dy + "px)";
      var cx = d.tops[d.k].x + dx, cy = d.tops[d.k].y + dy, to = d.k, best = Infinity;   /* the place nearest to the card that is carried */
      d.tops.forEach(function (t, i) { var dd = (t.x - cx) * (t.x - cx) + (t.y - cy) * (t.y - cy); if (dd < best) { best = dd; to = i; } });
      d.to = to;
      rows.forEach(function (r, i) {   /* each of the others goes to the place it would have */
        if (r === d.row) return;
        var ni = i;
        if (d.k < to && i > d.k && i <= to) ni = i - 1;
        if (d.k > to && i >= to && i < d.k) ni = i + 1;
        r.style.transform = ni !== i ? "translate(" + Math.round(d.tops[ni].x - d.tops[i].x) + "px, " + Math.round(d.tops[ni].y - d.tops[i].y) + "px)" : "";
      });
    }
    l.addEventListener("pointermove", move);
    function finish() {
      if (!d) return;
      clearTimeout(d.timer);
      var was = d; d = null;
      if (!was.live) return;
      rows.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; r.style.position = ""; });
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };   /* the drag is not a tap on the title; only the click that comes right after it */
      l.addEventListener("click", eat, true); setTimeout(function () { l.removeEventListener("click", eat, true); }, 80);
      if (was.to !== was.k) onMove(was.k, was.to);
    }
    l.addEventListener("pointerup", finish); l.addEventListener("pointercancel", finish);
    l._dragOff = function () { l.removeEventListener("touchmove", blockTouch); l.removeEventListener("pointermove", move); l.removeEventListener("pointerup", finish); l.removeEventListener("pointercancel", finish); l._dragOff = null; };
  }

  /* ---------- one item: music, poetics, guidance, notes ---------- */
  /* narrow screen: an exercise of a vivencia is a popup from the bottom (the kit's sheet), over the vivencia's list. It is a SCREEN for the browser's history (its
     own address /<vivencia>/<exercise>, one entry), not a popup with a marker entry: Back, the X, a swipe down and the header's middle button all end on the list. */
  (function () {
    var st = document.createElement("style");
    st.textContent = "#itemDlg { height: var(--rs-vvh, 100dvh); max-height: none; padding-top: var(--safe-t, 0px); transform: translateY(var(--rs-dy, 0px)) } @media (min-width: 760px) { #itemDlg { height: calc(100dvh - 48px); max-height: calc(100dvh - 48px); padding-top: 0 } } " +
      "#itemDlg .sheet-head, #itemDlg .sheet-head * { touch-action: none } #itemDlg .sheet-head [data-act=\"list\"] { pointer-events: none; flex: none !important; margin-inline: auto calc(var(--gap-button) * -1) } #itemDlg .sheet-head [data-likex] { margin-inline-end: auto } #itemDlg .sheet-head { margin-inline: calc(var(--pp-px) * -1); margin-bottom: 0 } #itemDlg .sheet-head > .rhead { flex: 1 1 auto; min-width: 0; width: 100%; margin: 0 } " +
      "#itemDlg .sheet-body { overflow: hidden; margin-inline: calc(var(--pp-px) * -1); padding: 0 } #itemDlg .sheet-body > #itemHost { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; position: relative; padding-inline: 0 } " +
      "html.rs-lock:not(.kb-open) #itemDlg .rfab { opacity: 1; transform: none; pointer-events: auto }";   /* the kit hides page buttons while a popup is open; these two belong to this one */
    document.head.appendChild(st);
  })();
  function itemSheet(html, wire) {
    var dlg = document.getElementById("itemDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "itemDlg"; document.body.appendChild(dlg); }
    if (!dlg.open) {
      dlg.__screen = true;   /* before it opens: syncLayers gives it no marker entry */
      RosterSheet.render(dlg, { title: "", from: "bottom", body: '<div id="itemHost"></div>' });
      dlg.setAttribute("aria-label", "תרגיל");
      if (!dlg.__wired) {
        dlg.__wired = true;
        dlg.addEventListener("close", function () {
          liveItem = null;
          if (dlg.__quiet) { dlg.__quiet = false; return; }   /* closed because the address already changed */
          if (parseUrl().item) unwind(1);   /* the X, a swipe, the backdrop: give the exercise's own entry back, and the address is the vivencia's */
        });
      }
    }
    /* the sheet's own header IS the exercise's header (previous, where we are, heart, next): no title row above it */
    var hm = html.match(/^<header class="rhead[^"]*">[\s\S]*?<\/header>/), sh = dlg.querySelector(".sheet-head");
    if (hm) { sh.innerHTML = hm[0]; sh.setAttribute("data-rs-drag-all", ""); html = html.slice(hm[0].length); }
    var cnt = sh.querySelector('[data-act="list"]'); if (cnt) { cnt.tabIndex = -1; cnt.setAttribute("aria-hidden", "true"); }   /* here the counter only shows where we are: the list is already behind the popup */
    var host = dlg.querySelector("#itemHost"); host.innerHTML = html; if (wire) wire(dlg.querySelector(".sheet"));
  }
  /* the page of an exercise, below its header: the songs (cards), the texts. ro: the catalog's exercise, only read (no facilitators, no notes, the texts are not edited) */
  function itemPageHtml(it, ro) {
    return '<style>#ipg, #ipg * { touch-action: pan-y } #ipg textarea, #ipg .rf-rich { max-height: none } #ifields > .rfield { margin: 0 } #ifields .rf-rich { font-size: var(--fs-m); line-height: 1.5 } #ifields[data-ro] .rf-rich { font-size: var(--fs-m); line-height: 1.6 } #imus [data-audio] svg { width: var(--icon-s) !important; height: var(--icon-s) !important } #ipg:has(#ifields:not([data-ro])) #imus [data-audio] { display: none } #ipg:has(#ifields:not([data-ro])) #imus .bio-card[aria-current] { border-color: var(--line); box-shadow: none }</style><div id="ipg" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0">' +   /* nothing between the header and the scroller: the content goes right under the header's edge, where its shadow is */
      '<div id="iscroll" style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-top:calc(var(--pp-head-gap, 12px) + var(--pp-hair))">' +   /* everything under the name scrolls together; the texts are open to the end */
      '<div id="imus" style="flex:none;padding:0 var(--gutter)">' + musCards(it, ro) + '</div>' +   /* the songs this exercise is torn between, as cards: the chosen one plays in the vivencia */
      '<div id="ifields"' + (ro ? ' data-ro' : '') + ' style="flex:none;display:flex;flex-direction:column;gap:var(--gap-field);padding:var(--gutter) var(--gutter) 0">' + (!ro && !wide() ? '<label class="rfield" style="flex:none"><span>שם התרגיל</span><input id="ina" placeholder=" " autocomplete="off" value="' + esc(itemName(it) || "") + '"></label>' : '') + '<label class="rfield" style="flex:none"><span>פואטיקה</span><div id="ipo" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "poetics") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "poetics")) + '</div></label>' +
      '<label class="rfield" style="flex:none"><span>הנחיה</span><div id="igu" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "guidance") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "guidance")) + '</div></label>' +
      (ro ? '' : '<label class="rfield" style="flex:none"><span>הערות</span><div id="it" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.notes || "") + '</div></label>') + '</div>' +
      '<div id="ibtns" style="flex:none;height:calc(2 * var(--fab) + var(--sp-2) + 2 * var(--gutter) + var(--inset-b))"></div></div></div>';
  }
  /* the page scrolls under its header with a scrollbar at the left that takes room from the cards: the header gives its left side the same room, so its button is over the cards' edge */
  function sbSync(r) {
    var sc = r.querySelector("#iscroll"); if (!sc) return;
    var set = function () { pd.style.setProperty("--sbw", Math.max(0, sc.offsetWidth - sc.clientWidth) + "px"); };
    set(); if (window.ResizeObserver) new ResizeObserver(set).observe(sc);
  }
  function tabsCenter(trk) {   /* the current tab is in the middle of the strip, whatever the width of the words is; every tab tells CSS where its middle is */
    var cur = trk.querySelector(".is-cur"); if (!cur) return;
    var cw = trk.parentElement.clientWidth, base = cw / 2 - (cur.offsetLeft + cur.offsetWidth / 2);
    trk.classList.add("is-drag");   /* put in place, not slid there */
    trk.style.setProperty("--cw", cw + "px");
    [].forEach.call(trk.querySelectorAll(".bio-tab"), function (t) { t.style.setProperty("--cx", (t.offsetLeft + t.offsetWidth / 2) + "px"); });
    var all = [].slice.call(trk.querySelectorAll(".bio-tab")), ci = all.indexOf(cur); all.forEach(function (t, i) { t.style.setProperty("--nb", Math.abs(i - ci) === 1 ? "1" : "0"); });   /* only the two next to this one keep their numbers in view */
    trk._base = base; trk.style.setProperty("--tx", base + "px"); trk.classList.add("is-ready");
    requestAnimationFrame(function () { requestAnimationFrame(function () { trk.classList.remove("is-drag"); }); });
  }
  function tabsDist(trk, dir) {   /* how far the middle of the next (dir 1, on the left) or the previous (dir -1) tab is from the middle of this one */
    var tabs = trk.querySelectorAll(".bio-tab"), cur = trk.querySelector(".is-cur"), i = [].indexOf.call(tabs, cur), t = tabs[i - dir];
    return t && cur ? Math.abs((t.offsetLeft + t.offsetWidth / 2) - (cur.offsetLeft + cur.offsetWidth / 2)) : 0;
  }
  function itemScreen(it) {
    var e = it.exercises || {};
    setUrl(BASE + state.viv.id + "/" + it.id);
    state.lastItem = it.id;   /* the strip of the exercise last opened stays marked in the list, like the vivencia in its list */
    markItem();
    var k = state.items.findIndex(function (x) { return x.id === it.id; }), prevIt = state.items[k - 1], nextIt = state.items[k + 1];   /* its place by its id: the list may have been read again, and its objects are new ones */
    /* the header walks the sequence: the right button to the previous exercise, the left one to the next, the name between them */
    var hd = itemHead(!!prevIt, !!nextIt, "", it.exercise_id || ("item:" + it.id), itemName(it), false, "", !!it.backlog, it.backlog ? "•" : String(state.items.filter(function (i) { return !i.backlog; }).findIndex(function (i) { return i.id === it.id; }) + 1), undefined, [2, 1, 0, -1, -2].map(function (d) { var x = state.items[k + d]; if (!x) return null; return { a: audOf(x), f: facOn() ? facLabel(x) : "", fh: facEmails(x).length > 0, n: x.backlog ? "•" : String(state.items.filter(function (i) { return !i.backlog; }).findIndex(function (i) { return i.id === x.id; }) + 1), t: itemName(x) }; }));   /* the tabs, from the left: the next ones, this one, the previous ones */   /* its number, the same as in the list, before its name */   /* the middle button says where we are, and still opens the list */
    show(hd + itemPageHtml(it, false), function (r) {
      var sf = state.slideFrom || 0, pg = r.querySelector("#ipg"); state.slideFrom = 0;
      sbSync(r);
      r.style.overflowX = "clip";   /* a page sliding in from the side must not make the window scroll sideways */
      if (pg && sf && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        pg.style.transform = "translateX(" + (sf * 100) + "%)";
        requestAnimationFrame(function () { requestAnimationFrame(function () { pg.style.transition = "transform .26s cubic-bezier(.2, .8, .2, 1)"; pg.style.transform = ""; }); });
      }
      on(r, "list", function () { /* beside the list, or in the popup over it, the counter is a display: nothing to go back to */ });   /* beside the list there is nowhere to go back to */
      wireFac(r);
      function walk(to) { repNext = true; state.slideFrom = to === nextIt ? -1 : 1; if (wide()) return itemScreen(to); stack().pop(); go(function () { itemScreen(to); }); }
      on(r, "prevW", function () { if (prevIt) walk(prevIt); });
      on(r, "nextW", function () { if (nextIt) walk(nextIt); });
      on(r, "closeIt", function () { liveItem = null; state.lastItem = null; show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); markItem(); setUrl(BASE + state.viv.id); });   /* the X: the exercise closes and is no longer the chosen one */
      var trk = document.querySelector("#itemDlg .bio-tabs__track");
      if (pg) attachPager(pg, { next: nextIt ? function () { walk(nextIt); } : null, prev: prevIt ? function () { walk(prevIt); } : null,
        drag: trk ? function (dx, w) { var dir = dx > 0 ? 1 : -1; trk.classList.add("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir) * Math.min(1, Math.abs(dx) / w)) + "px"); } : null,
        settle: trk ? function () { trk.classList.remove("is-drag"); trk.style.setProperty("--tx", (trk._base || 0) + "px"); } : null,
        leave: trk ? function (dir) { trk.classList.remove("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir)) + "px"); } : null });   /* the tabs follow the finger, the same way the page does */
      var hdrEl0 = document.querySelector("#itemDlg .bio-ihead--m"), hdrEl = hdrEl0 && (hdrEl0.closest("[data-rs-drag]") || hdrEl0);   /* the popup's own header owns the finger (it captures it for the pull-down), so the swipe listens there */
      if (pg && hdrEl) { if (hdrEl.__swOff) hdrEl.__swOff(); hdrEl.__swOff = attachPager(pg, { next: nextIt ? function () { walk(nextIt); } : null, prev: prevIt ? function () { walk(prevIt); } : null,
        drag: trk ? function (dx, w) { var dir = dx > 0 ? 1 : -1; trk.classList.add("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir) * Math.min(1, Math.abs(dx) / w)) + "px"); } : null,
        settle: trk ? function () { trk.classList.remove("is-drag"); trk.style.setProperty("--tx", (trk._base || 0) + "px"); } : null,
        leave: trk ? function (dir) { trk.classList.remove("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir)) + "px"); } : null }, hdrEl); }   /* a swipe on the header moves the page too */
      if (trk) trk.addEventListener("click", function (ev) {   /* a tap on a tab (its number or its name) goes to that exercise */
        var tab = ev.target.closest(".bio-tab"); if (!tab) return;
        var idx = [].indexOf.call(trk.querySelectorAll(".bio-tab"), tab), to2 = state.items[k + (2 - idx)];
        if (idx === 2 || !to2) return;
        repNext = true; state.slideFrom = idx < 2 ? -1 : 1; stack().pop(); go(function () { itemScreen(to2); });
      });
      if (trk) { tabsCenter(trk); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (trk.isConnected) tabsCenter(trk); }); }
      function toMusic() { if (wide()) { musicScreen(it); subEnter(function () { musicScreen(it); }); } else musicSheet(it); }   /* beside the list, the pane; on a narrow screen, a popup from the bottom */
      on(r, "pickMusic", function (b, ev) { if (ev.target.closest("a,[data-audio]")) return; toMusic(); });
      var imus = r.querySelector("#imus");
      if (imus) {
        var repaintMus = function () { imus.innerHTML = musCards(it); };
        imus.addEventListener("click", function (ev) {
          if (ev.target.closest("[data-audio], a")) return;
          if (ev.target.closest("[data-addm]")) { openAddMusic(it, function () { repaintMus(); if (wide()) paint(); }); return; }
          var rm = ev.target.closest("[data-orm]");
          if (rm) {
            ev.stopPropagation(); var mid = rm.dataset.orm, mm = optList(it).filter(function (x) { return x.id === mid; })[0];
            if (mm) confirmRemoveOpt(it, mm, function () { repaintMus(); if (wide()) paint(); });
            return;
          }
          var ch = ev.target.closest("[data-choose]");
          if (ch) {   /* the one that plays in the vivencia */
            var m = optList(it).filter(function (x) { return x.id === ch.dataset.choose; })[0]; if (!m || m.id === it.music_id) return;
            setChosen(it, m).then(function () { repaintMus(); if (wide()) paint(); }, fail);
            return;
          }
          var c = ev.target.closest("[data-opt]"); if (!c) return;   /* a tap on the card plays the song, as on the music page */
          var pb = c.querySelector("[data-audio]"); if (pb) pb.click();
        });
      }
      r.querySelectorAll('[data-act="pickMusic"]').forEach(function (c) { c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toMusic(); } }); });
      /* the three fields share the height that is left, by how many lines each has: all of it if it fits; if not, each gets its share and scrolls on its own */
      var box = r.querySelector("#ifields"), tas = ["#ipo", "#igu", "#it"].map(function (q) { return r.querySelector(q); });
      tas.forEach(rtInit);
      if (state.offline) { tas.forEach(function (t) { t.setAttribute("contenteditable", "false"); }); var nm0 = r.querySelector("#ina"); if (nm0) nm0.readOnly = true; }   /* with no internet it is only read */
      function layoutFields() {
        if (!box || !box.isConnected) return;
        tas.forEach(function (t) { t.style.height = ""; t.style.overflowY = "visible"; });   /* each text is as tall as its words: no scroll of its own */
        return;
        tas.forEach(function (t) { t.style.height = "auto"; t.style.overflowY = "hidden"; });
        var nat = tas.map(function (t) { return t.scrollHeight + t.offsetHeight - t.clientHeight; });
        var over = tas.map(function (t, i) { return t.parentElement.offsetHeight - t.offsetHeight; });
        var cs = getComputedStyle(box), gap = parseFloat(cs.rowGap) || 0, room = box.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - gap * (tas.length - 1);
        var need = nat.reduce(function (a, b, i) { return a + b + over[i]; }, 0);
        if (need <= room) { tas.forEach(function (t, i) { t.style.height = nat[i] + "px"; }); return; }
        /* it does not fit: the aim is a third each; a field that needs less keeps only what it needs, and what it leaves is shared equally by the others, down to the buttons */
        var free = room - over.reduce(function (a, b) { return a + b; }, 0);
        var h = nat.map(function () { return 0; });
        for (var it2 = 0; it2 < 6; it2++) {
          var rem = free - h.reduce(function (a, b) { return a + b; }, 0), idx = h.map(function (v, i) { return v < nat[i] - 0.5 ? i : -1; }).filter(function (i) { return i >= 0; });
          if (rem < 1 || !idx.length) break;
          idx.forEach(function (i) { h[i] = Math.min(nat[i], h[i] + rem / idx.length); });
        }
        tas.forEach(function (t, i) { t.style.height = Math.floor(h[i]) + "px"; t.style.overflowY = h[i] < nat[i] - 1 ? "auto" : "hidden"; });
      }
      tas.forEach(function (t) { t.addEventListener("input", layoutFields); });
      /* a text the facilitator edits is theirs: it stops being marked as a draft the moment they type */
      ["#ipo", "#igu"].forEach(function (q) { var t = r.querySelector(q); t.addEventListener("input", function () { t.style.color = ""; t.style.background = ""; t.removeAttribute("title"); }); });
      layoutFields(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutFields);
      if (window.ResizeObserver && box) new ResizeObserver(layoutFields).observe(box);
      function own(k, v) { return v === baseTxt(it, k) ? null : v; }   /* the same as the catalog: keep inheriting it */
      /* The four fields are shared with everyone who has this vivencia open. Each keeps `data-base`, the value the server last had for it: only a field I
         changed is sent (so my save never puts back an old copy of a field somebody else changed), it is saved while I type, and a change that comes
         from somebody else is written into the fields I am not changing. */
      var fld = { title: r.querySelector("#ina"), poetics: r.querySelector("#ipo"), guidance: r.querySelector("#igu"), notes: r.querySelector("#it") };
      function remoteVal(k, item) { return k === "title" ? itemName(item) : k === "notes" ? (item.notes || "") : txt(item, k); }
      Object.keys(fld).forEach(function (k) { fld[k].dataset.base = fld[k].value; });
      function save(quiet) {
        var body = {}, any = false;
        if (fld.title.value !== fld.title.dataset.base) { var nm = fld.title.value.trim(); body.title = !nm || nm === name(e) ? null : nm; any = true; }
        if (fld.poetics.value !== fld.poetics.dataset.base) { body.poetics = own("poetics", fld.poetics.value); any = true; }
        if (fld.guidance.value !== fld.guidance.dataset.base) { body.guidance = own("guidance", fld.guidance.value); any = true; }
        if (fld.notes.value !== fld.notes.dataset.base) { body.notes = fld.notes.value; any = true; }
        if (!any) return;
        Object.keys(fld).forEach(function (k) { fld[k].dataset.base = fld[k].value; });
        api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: body }).then(function () {
          Object.assign(it, body);
          if (quiet !== true) toast("נשמר");
          if (wide()) paint();
        }, fail);
      }
      var typing = 0;
      ["poetics", "guidance", "notes"].forEach(function (k) {   /* my cursor and selection, to the others */
        var el = fld[k];
        ["focus", "keyup", "mouseup", "select", "input", "touchend"].forEach(function (n) { el.addEventListener(n, curThrottled); });
        el.addEventListener("blur", function () { clearTimeout(cur.trail); curMine(); });
        el.addEventListener("scroll", paintGhosts);
      });
      setTimeout(paintGhosts, 0);
      Object.keys(fld).forEach(function (k) {
        fld[k].addEventListener("input", function () { clearTimeout(typing); typing = setTimeout(function () { save(true); }, 700); });   /* saved while you type, quietly */
        fld[k].addEventListener("change", function () { clearTimeout(typing); save(); });
      });
      if (pg) pg.addEventListener("focusout", function () { setTimeout(function () { if (liveItem && liveItem.pending && pg.isConnected && !pg.contains(document.activeElement)) { var f = liveItem.pending; liveItem.pending = null; itemScreen(f); } }, 0); });
      liveItem = { id: it.id, root: fld.title, fld: fld, prev: prevIt && prevIt.id, next: nextIt && nextIt.id, apply: function (fresh) {
        var inField = r.contains(document.activeElement) && (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || document.activeElement.classList.contains("rf-rich")), k2 = fresh.id === it.id ? state.items.indexOf(fresh) : -1;
        var pid = state.items[k2 - 1] && state.items[k2 - 1].id, nid = state.items[k2 + 1] && state.items[k2 + 1].id;
        var strip = r.querySelector('[data-act="pickMusic"]');
        if (fresh.music_id !== it.music_id && strip && fresh.exercise_id === it.exercise_id) {   /* the song changed: the strip and its bar are written anew in place, so it shows even while I am typing */
          strip.innerHTML = '<div style="flex:1 1 auto;min-width:0">' + (fresh.music ? songLines(fresh.music) : '<span class="rrow__title">לחצו לבחירת מוזיקה</span>') + '</div>' + (fresh.music ? playCol(fresh.music, true) : '');
          var nb = strip.nextElementSibling, bar = "";   /* the exercise has no bar of its own: the player at the bottom is the one bar */
          if (nb && nb.classList.contains("bio-bar")) { if (bar) nb.outerHTML = bar; else nb.remove(); } else if (bar) strip.insertAdjacentHTML("afterend", bar);
          it.music_id = fresh.music_id; it.music = fresh.music;
        }
        if (fresh.exercise_id !== it.exercise_id || pid !== liveItem.prev || nid !== liveItem.next) {   /* another exercise or other neighbours: the screen is drawn again, as soon as nobody is typing in it */
          if (!inField) { itemScreen(fresh); return; }
          liveItem.pending = fresh;
        }
        Object.keys(fld).forEach(function (k) {
          var el = fld[k], rv = remoteVal(k, fresh);
          if (el === document.activeElement && el.value !== el.dataset.base) return;   /* I am in the middle of changing this one: mine stays */
          if (el.value !== rv) { el.value = rv; el.style.color = ""; el.style.background = ""; }
          el.dataset.base = rv;
        });
        layoutFields(); it = fresh;
      } };
      on(r, "del", function () { confirmRemoveItem(it); });
      on(r, "swap", function () { resetPk(); if (wide()) goSub(function () { picker(it); }); else pickerSheet(it); });   /* the catalog, to put another exercise in this place */   /* the catalog, to put another exercise in this place */
    }, "d");
  }

  /* ---------- the songs of an exercise: two lines each, the song and who plays it ---------- */
  function chooseSongHere(it, m, out) {   /* a song (or none) for this exercise, in the pane */
    setChosen(it, m).then(function () { if (wide()) paint(); out(); }, fail);
  }
  /* songs of the other exercises: every exercise that has songs, each with its list (read once, page by page, then kept) */
  var exMusicP = null;
  function loadExMusic() {
    if (exMusicP) return exMusicP;
    var by = {}, order = [], PAGE = 1000;
    function page(off) {
      return api("/rest/v1/exercise_music?select=exercise_id,exercises(id,title_he,title_en),music(id,name,title,artist,duration_sec,audio_object,in_catalog,line_tags,effect_tags,rhythm_char_tags,rhythm_speed_tags)&order=exercise_id,music_id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || [];
        rows.forEach(function (x) {
          if (!x.exercises || !x.music) return;
          var g = by[x.exercise_id]; if (!g) { g = by[x.exercise_id] = { id: x.exercise_id, name: name(x.exercises), songs: [], seen: {} }; order.push(g); }
          if (!g.seen[x.music.id]) { g.seen[x.music.id] = 1; g.songs.push(x.music); }
        });
        return rows.length === PAGE ? page(off + PAGE) : order;
      });
    }
    /* songs of the catalog that no exercise lists (they were only ever on a collection): one more group at the end, so that no song is out of reach */
    function loose(o) {
      var seen = {}; o.forEach(function (g) { g.songs.forEach(function (m) { seen[m.id] = 1; }); });
      var rest = [];
      function lp(off) {
        return api("/rest/v1/music?in_catalog=eq.true&select=id,name,title,artist,duration_sec,audio_object,in_catalog,line_tags,effect_tags,rhythm_char_tags,rhythm_speed_tags&order=name,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
          rows = rows || []; rows.forEach(function (m) { if (!seen[m.id]) rest.push(m); });
          return rows.length === PAGE ? lp(off + PAGE) : rest;
        });
      }
      return lp(0).then(function (r) { if (r.length) o.push({ id: "_loose", name: "מוסיקה ללא תרגיל", songs: r, seen: {} }); return o; }, function () { return o; });
    }
    exMusicP = page(0).then(function (o) { return loose(o.sort(function (a, b) { return a.name.localeCompare(b.name, "he"); })); }, function (e) { exMusicP = null; throw e; });
    return exMusicP;
  }
  /* the music chooser: one search over this exercise's songs, the exercises, and the songs inside them; each other exercise opens like an accordion onto its songs */
  function musicBrowse(l, own, it, pick, tail) {
    l.innerHTML = '<label class="rfield" style="margin-bottom:var(--sp-2)"><span>חיפוש מוזיקה או תרגיל</span><input id="mq" placeholder=" " autocomplete="off"></label><div id="mb"></div>' + (tail || "");
    var mb = l.querySelector("#mb"), q = l.querySelector("#mq"), groups = null, open = {}, byId = {};
    own.forEach(function (m) { byId[m.id] = m; });
    function hit(m, s) { return fz(songName(m) + " " + songBy(m), s); }
    function draw() {
      var s = fold(q.value.trim()), h = "";
      var mine = nearest(own, function (m) { return songName(m) + " " + songBy(m); }, s);
      h += mine.map(function (m) { return songRow(m, it.music_id === m.id, "data-m"); }).join("");
      if (!groups) h += '<div class="rskel rskel--title"></div>';
      else {
        var shown = 0;
        groups.forEach(function (g) {
          if (g.id === it.exercise_id) return;
          var nm = !!s && fz(g.name, s), ms = s ? (nm ? g.songs : nearest(g.songs, function (m) { return songName(m) + " " + songBy(m); }, s)) : g.songs;
          if (!ms.length) return;
          var on = open[g.id] != null ? open[g.id] : (!!s && !nm);   /* a search that matched songs inside opens their exercise; an exercise matched by name stays closed until asked */
          shown++;
          h += '<div class="rrow rrow--link" style="padding-inline:var(--gutter);padding-block:var(--sp-2)"><button type="button" class="rrow__main" data-ex="' + g.id + '" aria-expanded="' + on + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit;display:flex;align-items:center;gap:var(--sp-2)"><span style="flex:1 1 auto;min-width:0"><span class="rrow__title">' + esc(g.name) + '</span><span class="rrow__sub">' + ms.length + ' מוזיקות</span></span><span style="flex:none;width:20px;height:20px;transition:transform .2s;' + (on ? 'transform:rotate(180deg)' : '') + '">' + I.down + '</span></button></div>';
          if (on) ms.forEach(function (m) { byId[m.id] = m; h += songRow(m, it.music_id === m.id, "data-m"); });
        });
        if (!mine.length && !shown) h += ph("לא נמצא", "");
      }
      mb.innerHTML = h;
    }
    mb.addEventListener("click", function (e) {
      var x = e.target.closest("[data-ex]");
      if (x) { var id = x.dataset.ex, g = groups.filter(function (z) { return z.id === id; })[0]; open[id] = !(x.getAttribute("aria-expanded") === "true"); draw(); return; }
      var b = e.target.closest("[data-m]"); if (b && byId[b.dataset.m]) pick(byId[b.dataset.m]);
    });
    q.addEventListener("input", draw);
    draw();
    loadExMusic().then(function (g) { groups = g; draw(); }, function () { groups = []; draw(); });
  }
  function musicScreen(it) {
    var out = wide() ? function () { if (inSub()) leaveAll(); else itemScreen(it); } : back;   /* beside the list, back is the same exercise */
    /* clearing the song is the neutral tile at the header's left, as in the popup on a phone, not a row */
    var clr = '<button class="rbtn rbtn--icon rbtn--edge-end" type="button" data-act="mclear" aria-label="ניקוי המוזיקה" title="ניקוי המוזיקה"' + (it.music_id ? "" : " disabled") + '>' + I.trash + '</button>';
    show(head(itemName(it) || "מוזיקה", "", true, clr) + '<div class="rlist" id="mlist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", out);
      on(r, "mclear", function () { chooseSongHere(it, null, out); });
      similarRows(it).then(function (rows) {
        var seen = {}, list = [];
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
        var row = function (id, t, sub, cur, m) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-m="' + id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button>' + (m ? songBtn(m, true) : '') + '</div>'; };
        var l = r.querySelector("#mlist");
        musicBrowse(l, list, it, function (m) { chooseSongHere(it, m, out); },
          '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-act="other" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">מוזיקות אחרות</span><span class="rrow__sub">מוסיקה שאינה בקטלוג</span></button></div>');
        on(l, "other", function () { otherMusic(it, out); subEnter(); });
      }, fail);
    }, "d");
  }

  /* ---------- other music: files the catalogs do not list. Same rows as the songs, with a tag ---------- */
  /* narrow screen: choosing the song is a popup from the bottom; "other music" is a second popup on top of it, closing it is back */
  /* the songs an exercise of a vivencia is torn between, oldest first; the chosen one is among them even when it was chosen before the options existed */
  /* similar songs: the songs that sit, in the catalog, in the same exercises as the songs this exercise already has (that is what "similar" means for now).
     Each song is scored by the number of those exercises it shares with the exercise's songs (and, when equal, by how many of its songs sit there): the nearest first.
     The exercise of a vivencia is a copy and has no link to a catalog exercise: the songs are the only thing that finds its likes. */
  /* the network walk is in the database (biodanza.similar_music, apps/biodanza/similar.sql): two steps, edges from the catalog and from real vivencias,
     popular songs weighted down; this reads its answer. If it cannot answer, the one-step count below is used. */
  /* the suggestions of a start or end slot start with the songs facilitators really used in that role (biodanza.role_music: the number of vivencias
     that had the song as that kind of reception music), then come the ones the network finds near the slot's own songs */
  function roleRows(kind) {
    return api("/rest/v1/rpc/role_music", { method: "POST", json: { p_kind: kind } }).then(function (rows) {
      rows = rows || []; if (!rows.length) return [];
      var at = {}; rows.forEach(function (r, i) { at[r.music_id] = i; });
      return api("/rest/v1/music?id=in.(" + rows.map(function (r) { return r.music_id; }).join(",") + ")&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=200").then(function (ms) {
        return (ms || []).sort(function (a, b) { return at[a.id] - at[b.id]; }).map(function (m) { return { music: m }; });
      });
    });
  }
  function similarRows(it) {
    if (!it.__recv) return similarBase(it);
    return Promise.all([roleRows(it.__recv).catch(function () { return []; }), similarBase(it)]).then(function (a) {
      var seen = {}, out = [];
      a[0].concat(a[1]).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; out.push(x); } });
      return out;
    });
  }
  function similarBase(it) {
    var ids = optList(it).map(function (m) { return m.id; }).filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    return api("/rest/v1/rpc/similar_music", { method: "POST", json: { p_music: ids } }).then(function (rows) {
      rows = rows || []; if (!rows.length) return [];
      var at = {}; rows.forEach(function (r, i) { at[r.music_id] = i; });
      return api("/rest/v1/music?id=in.(" + rows.map(function (r) { return r.music_id; }).join(",") + ")&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=200").then(function (ms) {
        return (ms || []).sort(function (a, b) { return at[a.id] - at[b.id]; }).map(function (m) { return { music: m }; });
      });
    }).catch(function () { return similarRowsOld(it); });
  }
  function similarRowsOld(it) {
    var own = {}, ids = optList(it).map(function (m) { own[m.id] = 1; return m.id; }).filter(Boolean);
    if (!ids.length) return Promise.resolve([]);
    return api("/rest/v1/exercise_music?music_id=in.(" + ids.join(",") + ")&select=exercise_id&limit=1000").then(function (rows) {
      var ex = {}; (rows || []).forEach(function (x) { ex[x.exercise_id] = 1; });
      var exs = Object.keys(ex); if (!exs.length) return [];
      return api("/rest/v1/exercise_music?exercise_id=in.(" + exs.join(",") + ")&select=exercise_id,music(id,name,title,artist,duration_sec,audio_object,in_catalog)&limit=3000").then(function (all) {
        var inEx = {}, sc = {}, order = [];   /* inEx: the songs of the item found in each exercise */
        (all || []).forEach(function (x) { if (x.music && own[x.music.id]) inEx[x.exercise_id] = (inEx[x.exercise_id] || 0) + 1; });
        (all || []).forEach(function (x) {
          if (!x.music) return; var m = x.music.id, o = sc[m];
          if (!o) { o = sc[m] = { music: x.music, n: 0, w: 0, ex: {} }; order.push(o); }
          if (!o.ex[x.exercise_id]) { o.ex[x.exercise_id] = 1; o.n++; o.w += inEx[x.exercise_id] || 0; }
        });
        order.forEach(function (o, i) { o.i = i; o.own = !!own[o.music.id]; });
        order.sort(function (a, b) { return (b.own - a.own) || (b.n - a.n) || (b.w - a.w) || (a.i - b.i); });
        return order.map(function (o) { return { music: o.music }; });
      });
    });
  }
  function optList(it) {
    var seen = {}, out = [];
    (it.__recv ? (it.item_music_options || []) : (it.item_music_options || []).slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); })).forEach(function (o) { if (o.music && !seen[o.music.id]) { seen[o.music.id] = 1; out.push(o.music); } });
    if (it.music && !seen[it.music.id]) out.unshift(it.music);
    var ci = out.findIndex(function (m) { return m.id === it.music_id; });   /* the chosen one is the first */
    if (ci > 0) out.unshift(out.splice(ci, 1)[0]);
    return out;
  }
  /* a song becomes the chosen one of the exercise, and stays among its options (so does the one it replaces) */
  function setChosen(it, m) {
    var have = {}; (it.item_music_options || []).forEach(function (o) { have[o.music_id] = 1; });
    var add = []; [it.music, m].forEach(function (x) { if (x && !have[x.id] && !add.some(function (y) { return y.id === x.id; })) add.push(x); });
    var chain = Promise.resolve();
    if (add.length) chain = api("/rest/v1/item_music_options?on_conflict=item_id,music_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: add.map(function (x) { return { item_id: it.id, music_id: x.id }; }) }).then(function () {
      var now = new Date().toISOString(); it.item_music_options = it.item_music_options || []; add.forEach(function (x) { it.item_music_options.push({ music_id: x.id, created_at: now, music: x }); });
    });
    return chain.then(function () { return api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m ? m.id : null } }); }).then(function () { it.music_id = m ? m.id : null; it.music = m; });
  }
  /* the time of a music card: the place in the song and its whole length, "1:23 / 3:40"; the player keeps it up to date (the bioaudio event) */
  function clkSpan(m, big) {
    var nw = window.__bioNow || {}, d = durOf(m), isMine = !!(nw.name && m.audio_object && nw.name === m.audio_object), t = isMine ? Math.floor(nw.t || 0) : 0;
    var tot = nw.name && nw.name === m.audio_object && nw.d > 0 ? Math.floor(nw.d) : d;
    return '<span class="bio-clk" data-dur="' + (d || "") + '"' + (m.audio_object ? ' data-for="' + esc(m.audio_object) + '"' : '') + ' style="direction:ltr;color:var(--text-2);font:var(--fw-medium) ' + (big ? 'var(--fs-m)' : 'var(--fs-s)') + '/1 var(--font);font-variant-numeric:tabular-nums">' + (isMine ? clock(t) + (tot ? " / " + clock(tot) : "") : (tot ? clock(tot) : "")) + '</span>';
  }
  document.addEventListener("bioaudio", function (ev) {
    var d = ev.detail || {}; window.__bioNow = { name: d.name || "", t: d.t || 0, d: d.d || 0 };
    window.__bioNow.playing = !!d.playing;
    document.querySelectorAll("[data-recv] .bio-card").forEach(function (c) {   /* in the start and end music the song that plays has the green frame */
      var pb = c.querySelector("[data-audio]"), on = !!d.playing && !!pb && pb.dataset.audio === d.name;
      if ((c.getAttribute("aria-current") === "true") !== on) { if (on) c.setAttribute("aria-current", "true"); else c.removeAttribute("aria-current"); }
    });
    document.querySelectorAll(".bio-clk").forEach(function (sp) {
      var dur = parseInt(sp.dataset.dur, 10) || 0, mine = d.name && sp.dataset.for === d.name;
      var tot = mine && d.d > 0 ? Math.floor(d.d) : dur, txt2 = mine ? clock(Math.floor(d.t || 0)) + (tot ? " / " + clock(tot) : "") : (tot ? clock(tot) : "");   /* only the song that has the player shows where it is */
      if (sp.textContent !== txt2) sp.textContent = txt2;
    });
  });
  /* THE CARD: one element for a song and for an exercise. A name (bold), a line under it (small), at the foot the play tile with what goes with it and the time, a number or a mark at its side (lead), a small button in its corner, and the green frame when it is the marked one.
     o: attrs (what the card is for the code: data-..., role), cls, selected, ltr (a Latin name: left to right), lead, title, titleAttr (the name is a button with these attributes), sub, subLtr, pill, chip, time, corner */
  function cardUi(o) {
    var dir = o.ltr ? "direction:ltr;text-align:left;" : "";
    /* a heart or a bin in the card's top left corner: no line of the title or of the sub line may reach it (its box and one step) */
    var pl = /bio-ha--tl|data-idel/.test(o.actions || "") ? "padding-left:calc((var(--tag-s) + var(--icon-m)) / 2 + var(--sp-1));" : "";
    var title = o.titleAttr
      ? '<button type="button" class="rrow__main" ' + o.titleAttr + ' style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:var(--fw-bold) ' + (o.big ? 'var(--fs-l)' : 'var(--fs-s)') + '/var(--lh-tight) var(--font);color:inherit;' + dir + (o.corner ? 'padding-inline-end:var(--ctl);' : '') + pl + '">' + esc(o.title) + '</button>'
      : '<span style="display:block;' + dir + 'overflow-wrap:anywhere;' + (o.corner ? 'padding-right:var(--ctl);' : '') + pl + 'font:var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(o.title) + '</span>';
    var sub = '<span style="display:block;' + (o.subRight ? 'direction:ltr;text-align:right;' : o.subLtr !== false ? 'direction:ltr;text-align:left;' : '') + 'overflow-wrap:anywhere;' + pl + 'color:var(--text-2);font:var(--fw-regular) ' + (o.big ? 'var(--fs-m)' : 'var(--fs-xs)') + '/var(--lh-tight) var(--font)">' + (o.sub ? esc(o.sub) : '&nbsp;') + '</span>';
    var foot = o.footEnd ? '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-1);margin-top:auto;padding-top:var(--gap-tight);min-height:calc(var(--tag-s) + var(--gap-tight))"><div style="display:flex;align-items:center;gap:var(--sp-1)">' + (o.chip || '') + '</div><div style="display:flex;align-items:center;gap:var(--sp-1)">' + (o.time || '') + (o.pill || '') + '</div></div>'   /* the leader chip at the right end, under the song; the play tile at the left end, its time on its right */
      : '<div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-1);margin-top:auto;padding-top:var(--gap-tight)"><div style="display:flex;align-items:center;gap:var(--sp-1)">' + (o.pill || '') + (o.chip || '') + '</div>' + (o.time || '') + '</div>';
    var lead = o.lead ? (o.bigLead
      ? '<span aria-hidden="true" style="flex:none;display:flex;align-items:flex-start;justify-content:center;min-width:var(--ctl);font:var(--fw-black) calc(2.75 * var(--fs-m))/.95 var(--font);color:var(--text);font-variant-numeric:tabular-nums">' + o.lead + '</span>'   /* the number as tall as the two lines beside it, no tile */
      : '<span aria-hidden="true" style="flex:none;display:flex;align-items:center;justify-content:center;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl);background:var(--surface-2);font:var(--fw-bold) var(--fs-m)/1 var(--font)">' + o.lead + '</span>') : '';
    if (!o.footEnd && !o.pill && !o.chip && !o.time) foot = '';   /* an exercise card keeps its bottom row even with no song: all the cards are one height, the same with a song and without */   /* nothing to put in the bottom row: it does not add room under the text */
    var body = '<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;' + (o.lead ? '' : 'width:100%') + '">' + title + sub + foot + '</div>';
    return '<div class="rcard rcard--compact bio-card' + (o.cls ? ' ' + o.cls : '') + '" ' + (o.attrs || '') + (o.selected ? ' aria-current="true"' : '') + ' style="margin:0;min-width:0;display:flex;' + (o.lead ? 'flex-direction:row;align-items:flex-start;gap:var(--sp-2);' : 'flex-direction:column;') + 'padding:var(--sp-2);cursor:pointer;position:relative;background:var(--on-primary)">' + lead + body + (o.corner || '') + (o.actions || '') + '</div>';   /* the same room on all four sides */
  }
  var CARD_PILL = "width:var(--tag-s);height:var(--tag-s);min-height:var(--tag-s);padding:0;border-radius:999px;background:var(--surface-2);";
  function cardPill(m, listKey) {
    var b = songBtn(m, false).replace(/width:var\(--fab\);height:var\(--fab\);min-height:var\(--fab\);/g, CARD_PILL);
    return listKey ? b.replace('data-audio="', 'data-list="' + esc(listKey) + '" data-audio="') : b;
  }
  var CARD_BIN = 'style="position:absolute;top:calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2);right:calc(var(--sp-2) - (var(--tag-s) - var(--icon-m)) / 2);color:var(--text-3);min-height:var(--tag-s);height:var(--tag-s);width:var(--tag-s);padding:0;background:transparent;border-color:transparent"';
  /* the card of a music option: the song, its performer, the play tile, the chip that chooses it, the time, the bin */
  function optCardHtml(m, sel, withRm, plain, listKey) {   /* plain: the catalog's exercise, only its songs: no chip to choose, no green frame */
    return cardUi({ attrs: 'data-opt="' + esc(m.id) + '" role="button" tabindex="0"', selected: sel, ltr: true, title: songName(m), sub: songBy(m), pill: cardPill(m, listKey),
      chip: sel || plain ? '' : '<button type="button" class="rchip rchip--s" data-choose="' + esc(m.id) + '" title="לבחור אותה לתרגיל בוויוונסיה" style="cursor:pointer;border:0">בחירה</button>',
      time: clkSpan(m), corner: withRm ? '<button type="button" class="rbtn rbtn--icon" data-orm="' + esc(m.id) + '" aria-label="מחיקה מהתרגיל" title="מחיקה מהתרגיל" ' + CARD_BIN + '>' + I.trash + '</button>' : '' });
  }
  /* deleting a song from an exercise: asked in the kit's popup; closing it is the cancel */
  function confirmRemoveOpt(it, m, done) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    var chosen = !it.__recv && m.id === it.music_id;
    RosterSheet.render(dlg, { kind: "confirm",
      title: "מחיקת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad"><span>למחוק את "' + esc(songName(m)) + '" ' + (it.__recv === "start" ? "ממוסיקת ההתחלה" : it.__recv === "end" ? "ממוסיקת הסיום" : "מהתרגיל") + '?' + (chosen ? ' זו המוזיקה שנבחרה: התרגיל יישאר בלי מוזיקה.' : '') + '</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="crmo">מחיקה</button>'
    });
    dlg.querySelector("#crmo").addEventListener("click", function () {
      dlg.close();
      dropOpt(it, m).then(done, fail);
    });
  }
  function musCards(it, ro) {
    var list = optList(it), cur = it.music_id;
    var cards = list.map(function (m) { return optCardHtml(m, m.id === cur, !ro); }).join("");
    var addCard = '<div class="rcard rcard--compact" data-addm role="button" tabindex="0" style="margin:0;min-width:0;display:flex;align-items:center;justify-content:center;gap:var(--sp-1);cursor:pointer;min-height:var(--tag-s);border:1px dashed var(--line-strong);background:transparent;box-shadow:none;color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span>הוספת מוזיקה</div>';
    if (ro) { var base = (it.item_music_options || []).map(function (o) { return o.music; }).filter(Boolean); return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);align-items:stretch">' + base.map(function (m) { return optCardHtml(m, !!(it.sel && it.sel.indexOf(m.id) >= 0), false, true); }).join("") + addCard + '</div>'; }
    var add = '<div class="rcard rcard--compact" data-addm role="button" tabindex="0" style="margin:0;min-width:0;display:flex;align-items:center;justify-content:center;gap:var(--sp-1);cursor:pointer;min-height:var(--tag-s);border:1px dashed var(--line-strong);background:transparent;box-shadow:none;color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span>' + (list.length ? "הוספת מוזיקה" : "בחירת מוזיקה") + '</div>';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);align-items:stretch">' + cards + add + '</div>';
  }
  /* the catalog's preview of an exercise: the songs it comes with, as the same cards, at the same place (above the texts), without the add card */
  function prevMusic(songs, sel, inset) {
    if (!songs.length) return "";
    return '<div id="pvmus" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);align-items:stretch;margin-bottom:var(--sp-2)' + (inset ? ';margin-inline:var(--gutter)' : '') + '">' + songs.map(function (m) { return optCardHtml(m, m.id === sel, false); }).join("") + '</div>';
  }
  /* a song joins the options of the exercise; if the exercise has no chosen song yet, it is the chosen one */
  function dropOpt(it, m) {
    if (it.__preview) {
      it.item_music_options = (it.item_music_options || []).filter(function (o) { return o.music_id !== m.id; });
      if (it.sel) { var ks = it.sel.indexOf(m.id); if (ks >= 0) it.sel.splice(ks, 1); it.music_id = it.sel[0] || null; }
      if (it.music_id === m.id) { it.music_id = null; it.music = null; }
      return Promise.resolve();
    }   /* a song leaves an exercise's options, or the start or end songs; the chosen one of an exercise leaves it without music */
    var rec = !!it.__recv, chosen = !rec && m.id === it.music_id;
    var url = rec ? "/rest/v1/vivencia_reception_music?vivencia_id=eq." + it.id + "&kind=eq." + it.__recv + "&music_id=eq." + m.id : "/rest/v1/item_music_options?item_id=eq." + it.id + "&music_id=eq." + m.id;
    return api(url, { method: "DELETE" }).then(function () {
      return chosen ? api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: null } }) : null;
    }).then(function () {
      var keep = (it.item_music_options || []).filter(function (o) { return o.music_id !== m.id; });
      if (rec) { it.item_music_options.length = 0; keep.forEach(function (x) { it.item_music_options.push(x); }); } else it.item_music_options = keep;
      if (chosen) { it.music_id = null; it.music = null; }
    });
  }
  function addOpt(it, m) {
    if (it.__preview) {   /* the catalog's exercise as it is shown: the song is added to what is shown, not to the catalog */
      it.item_music_options = it.item_music_options || [];
      if (!it.item_music_options.some(function (o) { return o.music_id === m.id; })) it.item_music_options.push({ music_id: m.id, created_at: String(2000 + it.item_music_options.length), music: m });
      return Promise.resolve();
    }
    if (it.__recv) return api("/rest/v1/vivencia_reception_music?on_conflict=vivencia_id,kind,music_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: { vivencia_id: it.id, kind: it.__recv, music_id: m.id } }).then(function () {
      if (!optList(it).some(function (x) { return x.id === m.id; })) it.item_music_options.push({ music_id: m.id, created_at: new Date().toISOString(), music: m });
    });
    if (!it.music_id) return setChosen(it, m);
    return api("/rest/v1/item_music_options?on_conflict=item_id,music_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: { item_id: it.id, music_id: m.id } }).then(function () {
      it.item_music_options = it.item_music_options || []; if (!optList(it).some(function (x) { return x.id === m.id; })) it.item_music_options.push({ music_id: m.id, created_at: new Date().toISOString(), music: m });
    });
  }
  /* every song the person can see, read once (page by page) and kept */
  var allSongsP = null;
  function loadAllSongs() {
    if (allSongsP) return allSongsP;
    var PAGE = 1000;
    function pg(off) {
      return api("/rest/v1/music?select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id&order=name,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || [];
        return rows.length === PAGE ? pg(off + PAGE).then(function (more) { return rows.concat(more); }) : rows;
      });
    }
    allSongsP = pg(0).then(null, function (e) { allSongsP = null; throw e; });
    return allSongsP;
  }
  /* the popup that adds songs to an exercise: the music page's cards and search, in two parts: the songs the catalog links to the exercise, and all the others */
  function openAddMusic(it, changed) {
    var me = FLOA_AUTH.userId(), vid = state.viv && state.viv.id;
    var r = sheetOf("addMusDlg", "", '<style>#addMusDlg .sheet-head { display: none } html.bio-docked #addMusDlg .sheet-body { padding-bottom: 0 } #addMusDlg .bio-card[aria-current="true"] { border-color: var(--line); box-shadow: none } #addMusDlg #amup { height: var(--rf-h); min-height: var(--rf-h); border-radius: 0; border: 0; border-bottom: 1px solid var(--rf-line); background: transparent } #addMusDlg .rfield:focus-within + #amup { border-bottom-color: var(--rf-ink); box-shadow: 0 1px 0 var(--rf-ink) }</style><div style="display:flex;align-items:flex-end;gap:var(--gap-button)"><label class="rfield" style="flex:1 1 auto;margin:0"><span id="amc">חיפוש בין מוסיקות</span><input id="amq" placeholder=" " autocomplete="off"></label><button type="button" class="rbtn rbtn--icon rbtn--ghost" id="amup" aria-label="העלאת קובץ מוזיקה" title="העלאת קובץ מוזיקה" style="flex:none;gap:var(--sp-1)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.upload.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span></button></div><div id="amlist" style="flex:1 1 auto;min-height:0;overflow-y:auto;margin-top:var(--sp-2);padding-bottom:calc(var(--dockfull) + var(--gutter))"><div class="rskel rskel--title"></div></div>');
    r.style.overflowY = "hidden";   /* the search stays, only the cards scroll */
    var listEl = r.querySelector("#amlist"), qi = r.querySelector("#amq");
    qi.blur(); setTimeout(function () { if (document.activeElement === qi) qi.blur(); }, 60);   /* the popup opens on the list: the keyboard comes up only when the search is touched */
    var linked = null, rest = null, shown = 90, fresh = true;
    function cardHtml(m, added) {
      return cardUi({ attrs: 'data-am="' + esc(m.id) + '" role="button" tabindex="0"', selected: added, ltr: true, title: songName(m), sub: songBy(m), pill: cardPill(m), time: clkSpan(m) });
    }
    function draw() {
      if (!linked || !rest) return;
      var s0 = fold(qi.value.trim()), words = s0.split(/\s+/).filter(Boolean);
      var hit = function (m) { return fz(songName(m) + " " + songBy(m), s0); };
      var cur = it.__preview ? optList(it).filter(function (m) { return it.sel.indexOf(m.id) >= 0; }) : optList(it), has = {}; cur.forEach(function (m) { has[m.id] = 1; });   /* on the catalog's exercise only what was marked counts */
      var nmOf = function (m) { return songName(m) + " " + songBy(m); }, sl = nearest(cur, nmOf, s0), lk = nearest(linked.filter(function (m) { return !has[m.id]; }), nmOf, s0), ot = nearest(rest.filter(function (m) { return !has[m.id]; }), nmOf, s0), cut = ot.slice(0, shown);
      var cnt = r.querySelector("#amc"); if (cnt) cnt.textContent = "חיפוש " + (words.length ? (sl.length + lk.length + ot.length) + " מתוך " : "בין ") + (linked.length + rest.length) + " מוסיקות";   /* as the music page says it */
      var grid = function (arr) { return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:var(--sp-1)">' + arr.map(function (m) { return cardHtml(m, !!has[m.id]); }).join("") + '</div>'; };
      var head = function (t, n) { return '<div class="rrow__sub" style="padding:var(--sp-2) 0 var(--sp-1)">' + esc(t) + ' (' + n + ')</div>'; };
      listEl.innerHTML = (sl.length ? head(it.__preview ? "נבחרו" : "בתרגיל", sl.length) + grid(sl) : '') + (lk.length ? head("הצעות", lk.length) + grid(lk) : '') + (cut.length ? head("מוסיקה אחרת", ot.length) + grid(cut) : '') + (!sl.length && !lk.length && !cut.length ? ph("לא נמצא", "") : '');
    }
    var upb = r.querySelector("#amup");
    if (upb) upb.addEventListener("click", function () {
      if (upb.dataset.busy) return;
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var label = upb.innerHTML; upb.dataset.busy = "1"; upb.textContent = "0%";
        var back = function (t, ms) { if (t !== label) upb.textContent = t; setTimeout(function () { upb.innerHTML = label; delete upb.dataset.busy; }, ms || 0); };
        putAudio(f, function (pc) { upb.textContent = pc + "%"; }).then(function (o) {
          var title = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
          return api("/rest/v1/rpc/add_upload", { method: "POST", json: { p_object: o.object, p_format: o.format, p_size: o.size, p_title: title, p_artist: "", p_vivencia: state.viv ? state.viv.id : null } });
        }).then(function (id) {
          return api("/rest/v1/music?id=eq." + id + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id");
        }).then(function (rows) {
          back(label); var row = rows && rows[0]; if (!row) return;
          if (rest) rest.unshift(row);
          return addOpt(it, row).then(function () { draw(); refreshSimilar(); if (changed) changed(); songEdit(row, function () { draw(); refreshSimilar(); if (changed) changed(); }); });   /* it is in the list at once, and its name and performer are asked for */
        }).catch(function (er) { console.error(er); back(er && er.message === "format" ? "קובץ שמע בלבד" : "ההעלאה נכשלה", 3000); });
      });
      inp.click();
    });
    qi.addEventListener("input", function () { shown = 90; listEl.scrollTop = 0; draw(); });
    listEl.addEventListener("scroll", function () { if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 600 && rest && shown < rest.length) { shown += 90; draw(); } }, { passive: true });
    listEl.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var c = ev.target.closest("[data-am]"); if (!c) return;
      var all = (linked || []).concat(rest || []), m = all.filter(function (x) { return x.id === c.dataset.am; })[0]; if (!m) return;
      if (it.__preview) {   /* the catalog's exercise: a tap marks the song, a second tap takes the mark off */
        var ix = it.sel.indexOf(m.id);
        if (ix >= 0) it.sel.splice(ix, 1); else { it.sel.push(m.id); addOpt(it, m); }
        var f0 = (it.item_music_options || []).map(function (o) { return o.music; }).filter(function (x) { return x && x.id === it.sel[0]; })[0];
        it.music_id = it.sel[0] || null; it.music = f0 || null;
        draw(); refreshSimilar(); if (changed) changed(); return;
      }
      if (optList(it).some(function (x) { return x.id === m.id; })) {   /* a marked song: the mark comes off and it is disconnected from the exercise */
        confirmRemoveOpt(it, m, function () { draw(); refreshSimilar(); if (changed) changed(); });   /* taking a song off asks first, in the kit's popup */
        return;
      }
      confirmAddMusic(songName(m), it.__recv ? (it.__recv === "start" ? "מוסיקת ההתחלה" : "מוסיקת הסיום") : (itemName(it) || "התרגיל"), function () { addOpt(it, m).then(function () { draw(); refreshSimilar(); if (changed) changed(); }, fail); });
    });
    var allSongs = null;
    function applyLinked(rows) {   /* the suggestions, and the rest of the music without them */
      var seen = {}, out = []; (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; out.push(x.music); } });
      linked = out; var lk = {}; linked.forEach(function (m) { lk[m.id] = 1; });
      rest = allSongs.filter(function (m) { return !lk[m.id] && (m.in_catalog !== false || m.owner_id === me || (vid && m.vivencia_id === vid)); });
    }
    function refreshSimilar() {   /* the music of the exercise changed: the suggestions are asked for again, and the list draws them */
      if (!allSongs) return;
      similarRows(it).then(function (rows) { applyLinked(rows); draw(); }, function () { /* the old ones stay */ });
    }
    Promise.all([similarRows(it), loadAllSongs()]).then(function (res) {
      allSongs = res[1]; applyLinked(res[0]);
      draw();
    }, function (e) { fail(e); listEl.innerHTML = ph("לא הצלחנו לטעון", ""); });
  }
  function chooseSong(it, m) {
    return setChosen(it, m).then(function () {
      ["otherDlg", "musicDlg"].forEach(function (id) { slideClose(document.getElementById(id)); });
      itemScreen(it);
    }, fail);
  }
  /* rows in a popup run from edge to edge: the popup's own side room (measured from its title) is pulled out and given back as padding, and the chosen row has the green stripe at its left */
  /* closing a popup from code slides it out the way a swipe does, then closes it */
  function slideClose(d) {
    if (!d || !d.open) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return d.close();
    var h = d.getBoundingClientRect().height, done = false;
    var end = function () { if (done) return; done = true; d.removeEventListener("transitionend", end); d.classList.remove("rs-settle"); d.style.removeProperty("--rs-dy"); if (d.open) d.close(); d.classList.remove("rs-closing"); };
    d.classList.add("rs-settle", "rs-closing"); d.style.setProperty("--rs-dy", (h + 24) + "px");
    d.addEventListener("transitionend", end); setTimeout(end, 320);
  }
  function bleedCss(id) {
    var v = 'var(--bleed, var(--pp-px))', q = '#' + id;
    /* the body is as wide as the popup, its content keeps the title's side room, and a row pulls back out to the edges, so its background and stripe reach the popup's walls */
    return '<style>' + q + ' .sheet-body { overflow-x: hidden; margin-inline: calc(' + v + ' * -1); padding-inline: 0 } ' + q + ' .sheet-body > * { padding-inline: ' + v + ' } ' + q + ' #imus, ' + q + ' #ifields { padding-inline: 0 !important } ' +   /* the popup already pads the sides: the song cards and the fields of an exercise do not pad them again */
      
      q + ' .rrow { margin-inline: calc(' + v + ' * -1); padding-inline: ' + v + ' } ' + q + ' .rrow[aria-current="true"] { background: var(--surface); box-shadow: inset 3px 0 0 #14110E }</style>';
  }
  function bleedSet(dlg) {
    var sh = dlg.querySelector(".sheet"), h = dlg.querySelector(".sheet-head h2"); if (!sh || !h) return;
    var off = Math.round(sh.getBoundingClientRect().right - h.getBoundingClientRect().right);
    if (off > 0 && off < 80) dlg.style.setProperty("--bleed", off + "px");
  }
  function sheetOf(id, title, body, action) {
    var dlg = document.getElementById(id);
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = id; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { title: title, from: "bottom", action: action, body: bleedCss(id) + body });
    bleedSet(dlg);
    return dlg.querySelector(".sheet-body");
  }
  function musicSheet(it) {
    var r = sheetOf("musicDlg", itemName(it) || "מוזיקה", '<div id="mlist"><div class="rskel rskel--title"></div></div>', { label: "ניקוי המוזיקה", icon: I.trash, id: "mclear" });   /* "no music" is the icon at the header's left: it clears the song */
    var dlg0 = document.getElementById("musicDlg"), clr = dlg0.querySelector("#mclear");
    if (clr) { clr.classList.remove("rbtn--primary"); clr.style.cssText += ";background:var(--surface-2);border-color:var(--surface-2);color:var(--text)";   /* clearing is not the main action: the header's neutral tile, not the green one */
      if (!it.music_id) RosterSheet.setDirty(dlg0, false); else RosterSheet.setDirty(dlg0, true); clr.addEventListener("click", function () { chooseSong(it, null); }); }
    similarRows(it).then(function (rows) {
      var seen = {}, list = [];
      (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
      var plain = function (attr, t, sub, cur) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" ' + attr + ' style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button></div>'; };
      var l = r.querySelector("#mlist");
      musicBrowse(l, list, it, function (m) { chooseSong(it, m); }, plain('data-act="other"', "מוזיקות אחרות", "מוסיקה שאינה בקטלוג", false));
      on(l, "other", function () { otherSheet(it); });
    }, fail);
  }
  /* other music: the files the catalogs do not list, and the songs this person uploaded by hand (those can be renamed). One upload button on top. */
  var UP_BTN = '<button type="button" class="rbtn rbtn--block rbtn--ghost" id="oup" style="margin-top:var(--sp-2)">העלאת קובץ מוזיקה</button>';
  function putAudio(f, progress) {   /* the file goes to the bucket through the Worker; resolves with { object, format, size } */
    var fmt = (f.name.split(".").pop() || "").toLowerCase();
    if (!UPL_FORMATS[fmt]) return Promise.reject(new Error("format"));
    return FLOA_AUTH.token().then(function (t) {
      return new Promise(function (res, rej) {
        var x = new XMLHttpRequest(); x.open("PUT", "https://api.floa.co.il/biodanza/audio/upload");
        x.setRequestHeader("authorization", "Bearer " + t); x.setRequestHeader("x-format", fmt);
        x.upload.onprogress = function (ev) { if (ev.lengthComputable && progress) progress(Math.round(ev.loaded / ev.total * 100)); };
        x.onload = function () { if (x.status === 200) { try { res(JSON.parse(x.responseText)); } catch (er) { rej(er); } } else rej(new Error("upload " + x.status)); };
        x.onerror = function () { rej(new Error("upload")); };
        x.send(f);
      });
    });
  }
  function songEdit(m, done) {   /* the name and the performer of a song this person uploaded */
    var dlg = document.getElementById("songDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "songDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: "עריכת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad"><label class="rfield"><span>שם המוסיקה</span><input id="sn" placeholder=" " autocomplete="off" value="' + esc(m.title || m.name || "") + '"></label><label class="rfield"><span>מבצע</span><input id="sa" placeholder=" " autocomplete="off" value="' + esc(m.artist || "") + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="ssave">שמירה</button><button class="rbtn rbtn--danger rbtn--ghost rbtn--block" type="button" id="sdel">מחיקת המוסיקה</button>'
    });
    var n = dlg.querySelector("#sn"), a = dlg.querySelector("#sa"); n.focus(); n.select();
    dlg.querySelector("#sdel").addEventListener("click", function () {   /* a song that is not from the catalog can be deleted: from every exercise, option and start or end music it is in */
      dlg.close();
      var c = document.getElementById("confirmDlg");
      if (!c) { c = document.createElement("dialog"); c.id = "confirmDlg"; document.body.appendChild(c); }
      RosterSheet.render(c, { kind: "confirm", title: "מחיקת מוסיקה", from: "bottom", size: "s",
        body: '<div class="pad"><span>למחוק את "' + esc(songName(m)) + '" לגמרי? הוא יוסר מכל התרגילים והוויוונסיות שבהם הוא נמצא.</span></div>',
        foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="csdel">מחיקה</button>' });
      c.querySelector("#csdel").addEventListener("click", function () {
        c.close();
        var said = function (text) {   /* the answer is on the screen, not only in the console */
          RosterSheet.render(c, { kind: "confirm", title: "המחיקה לא בוצעה", from: "bottom", size: "s", body: '<div class="pad"><span>' + esc(text) + '</span></div>' });
        };
        api("/rest/v1/music?id=eq." + m.id, { method: "DELETE", prefer: "return=representation" }).then(function (gone) {
          if (!gone || !gone.length) { said("אין הרשאה למחוק את המוסיקה הזאת. רק מי שהעלה אותה יכול למחוק אותו."); return; }
          m.__gone = true;
          (state.items || []).forEach(function (x) {
            if (x.music && x.music.id === m.id) { x.music = null; x.music_id = null; }
            x.item_music_options = (x.item_music_options || []).filter(function (o) { return o.music_id !== m.id; });
          });
          Object.keys(recvCache).forEach(function (k) { recvCache[k] = (recvCache[k] || []).filter(function (o) { return !o.music || o.music.id !== m.id; }); });
          if (allSongsP) allSongsP.then(function (rows) { var k = (rows || []).findIndex(function (x) { return x.id === m.id; }); if (k >= 0) rows.splice(k, 1); });
          if (done) done();
          if (document.getElementById("list") && document.getElementById("list").hasAttribute("data-fab-room") && state.items) paint();
          var im = document.getElementById("imus"); if (im && liveItem && liveItem.id) { var li = state.items.filter(function (x) { return x.id === liveItem.id; })[0]; if (li) im.innerHTML = musCards(li); }
        }, function (e) { console.error(e); said("השרת לא אישר את המחיקה" + (e && e.message ? ": " + e.message : ".")); });
      });
    });
    function save() {
      var t = n.value.trim(), ar = a.value.trim(); if (!t) return toast("חסר שם");
      api("/rest/v1/music?id=eq." + m.id, { method: "PATCH", prefer: "return=minimal", json: { title: t, artist: ar, name: t + (ar ? ", " + ar : "") } }).then(function () {
        m.title = t; m.artist = ar; m.name = t + (ar ? ", " + ar : "");
        var fix = function (x) { if (x && x.id === m.id) { x.title = t; x.artist = ar; x.name = m.name; } };   /* every copy of this song that is on the screen's side: the exercises', their options', the start and end music */
        (state.items || []).forEach(function (x) { fix(x.music); (x.item_music_options || []).forEach(function (o) { fix(o.music); }); });
        Object.keys(recvCache).forEach(function (k) { (recvCache[k] || []).forEach(function (o) { fix(o.music); }); });
        if (m.audio_object) { songInfo[m.audio_object] = { t: t, a: ar }; document.dispatchEvent(new CustomEvent("biosongrenamed", { detail: { n: m.audio_object, t: t, a: ar } })); }
        dlg.close(); if (done) done();
        if (document.getElementById("list") && document.getElementById("list").hasAttribute("data-fab-room") && state.items) paint();
        var im = document.getElementById("imus"); if (im && liveItem && liveItem.id) { var li = state.items.filter(function (x) { return x.id === liveItem.id; })[0]; if (li) im.innerHTML = musCards(li); }
      }, fail);
    }
    dlg.querySelector("#ssave").addEventListener("click", save);
    [n, a].forEach(function (i) { i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } }); });
  }
  function otherWire(r, it, pick) {
    var l = r.querySelector("#olist"), all = [], me = FLOA_AUTH.userId(), up = r.querySelector("#oup");
    var vid = state.viv && state.viv.id, canEd = state.viv && (state.viv.role === "owner" || state.viv.role === "edit");   /* a song made in this vivencia can be renamed by whoever can edit it */
    var pen = function (m) { return (m.owner_id && m.owner_id === me) || (canEd && vid && m.vivencia_id === vid) ? '<button type="button" class="rbtn rbtn--icon rrow__trail" data-ed="' + esc(m.id) + '" aria-label="עריכת שם ומבצע" title="עריכת שם ומבצע" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:var(--text-3)">' + I.pen + '</button>' : ''; };
    function draw() {
      all = all.filter(function (m) { return !m.__gone; });
      var q = fold(r.querySelector("#oq").value.trim());
      var vis = nearest(all, function (m) { return songName(m) + " " + songBy(m); }, q);
      l.innerHTML = vis.length ? vis.map(function (m) { return songRow(m, it.music_id === m.id, "data-o", pen(m)); }).join("") : ph("לא נמצא", "");
    }
    l.addEventListener("click", function (e) {
      var ed = e.target.closest("[data-ed]");
      if (ed) { var m0 = all.filter(function (x) { return x.id === ed.dataset.ed; })[0]; if (m0) songEdit(m0, draw); return; }
      var b = e.target.closest("[data-o]"); if (!b) return;
      var m = all.filter(function (x) { return x.id === b.dataset.o; })[0]; if (m) pick(m);
    });
    r.querySelector("#oq").addEventListener("input", draw);
    if (up) up.addEventListener("click", function () {
      if (up.dataset.busy) return;
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var label = up.textContent; up.dataset.busy = "1"; up.textContent = "0%";
        var back = function (t, ms) { up.textContent = t; setTimeout(function () { up.textContent = label; delete up.dataset.busy; }, ms || 0); };
        putAudio(f, function (pc) { up.textContent = pc + "%"; }).then(function (o) {
          var title = f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
          return api("/rest/v1/rpc/add_upload", { method: "POST", json: { p_object: o.object, p_format: o.format, p_size: o.size, p_title: title, p_artist: "", p_vivencia: state.viv ? state.viv.id : null } });
        }).then(function (id) {
          return api("/rest/v1/music?id=eq." + id + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id");
        }).then(function (rows) {
          back(label);
          if (rows && rows[0]) { all.unshift(rows[0]); r.querySelector("#oq").value = ""; draw(); songEdit(rows[0], draw); }   /* it is in the list at once, and its name and performer are asked for */
        }).catch(function (er) { console.error(er); back(er && er.message === "format" ? "קובץ שמע בלבד" : "ההעלאה נכשלה", 3000); });
      });
      inp.click();
    });
    api("/rest/v1/music?in_catalog=eq.false&select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id&order=title&limit=1000").then(function (rows) {
      all = (rows || []).filter(function (m) { return !m.owner_id || m.owner_id === me || (vid && m.vivencia_id === vid); });   /* the catalogs' loose files, my own uploads, and the songs made in this vivencia by the others who work on it */
      draw();
    }, fail);
  }
  function otherSheet(it) {
    var r = sheetOf("otherDlg", "מוזיקות אחרות", '<label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label>' + UP_BTN + '<div id="olist" style="flex:1 1 auto;min-height:0;overflow-y:auto;margin-top:var(--sp-2)"><div class="rskel rskel--title"></div></div>');
    r.style.overflowY = "hidden";   /* the search stays, only the list scrolls */
    otherWire(r, it, function (m) { chooseSong(it, m); });
  }
  function otherMusic(it, out) {
    show(head("מוזיקות אחרות", "", true) + '<div class="pad" style="padding-block-end:0"><label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label>' + UP_BTN + '</div><div class="rlist" id="olist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", function () { if (inSub() && history.state.sub >= 2) unwind(1); else musicScreen(it); });
      otherWire(r, it, function (m) { setChosen(it, m).then(function () { if (wide()) paint(); out(); }, fail); });
    }, "d");
  }

  /* ---------- picker: the catalog ---------- */
  var pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: "ex", mq: "", mln: "", mch: "", msp: "", mef: "" };   /* the catalog's search, line, category, group level and place on the curve */
  function resetPk() { pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: "ex", mq: "", mln: "", mch: "", msp: "", mef: "" }; }
  var LEVELS_FALLBACK = [{ key: "all", name_he: "מתחילים (מתאים לכל הקבוצות)" }, { key: "exp3", name_he: "לקבוצות עם ניסיון של כמה חודשים" }, { key: "exp6", name_he: "לקבוצות עם ניסיון של חצי שנה ויותר" }, { key: "deep", name_he: "לקבוצות העמקה ומתקדמות" }];   /* the index of group levels (biodanza.levels), when it has not come from the cloud */
  /* the catalog picker: a search and the list of categories; a category opens like an accordion onto its exercises. On a wide screen it is a pane; on a narrow one it is a popup from the bottom. */
  function searchInput(id, label) {
    id = id || "q"; label = label || "חיפוש תרגילים בקטלוג";
    return '<div style="display:flex;align-items:center;gap:var(--sp-2)"><input id="' + id + '" class="rhead__title" type="text" placeholder="' + label + '" autocomplete="off" aria-label="' + label + '" style="width:100%;min-width:0;border:0;background:transparent;padding-inline:0;margin:0;color:inherit;text-align:start;outline:0;text-overflow:ellipsis;text-box:normal;line-height:1.4;padding-block:4px">' + '<span aria-hidden="true" style="flex:none;display:grid;width:var(--icon-m);height:var(--icon-m);color:var(--text-2)"><svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg></span></div>';
  }
  /* the two tabs of the catalog: exercises (the first, on the right) and music; they are the pager's two pages */
  function pickerTabs() {
    return '<div class="rtabs" role="tablist" style="position:relative;flex:0 0 auto;width:100%;min-width:0;border-bottom:0"><button type="button" class="rtab" role="tab" data-pkt="ex" aria-selected="true" style="box-shadow:none">תרגילים</button><button type="button" class="rtab" role="tab" data-pkt="mu" aria-selected="false" style="box-shadow:none">מוסיקה</button><i data-pkind aria-hidden="true" style="position:absolute;inset-block-end:0;inset-inline-start:0;width:50%;height:3px;background:var(--primary);pointer-events:none;will-change:transform"></i></div>';
  }
  /* what the music tab filters by: the three tag columns of the music table. Values stay in English (they are the keys); a value with no entry here shows as it is. */
  var MU_LINE = [["Affectivity", "affectivity", "חיבתיות"], ["Creativity", "creativity", "יצירתיות"], ["Vitality", "vitality", "חיוניות"], ["Sexuality", "sexuality", "מיניות"], ["Trance", "transcendence", "התעלות"], ["Maze", "", "מבוך"]];   /* the app's own line names are used when it has them */
  var MU_CHAR = { "Rhythmic": "קצבי", "Melodic": "מלודי", "Other": "אחר" }, MU_SPEED = { "Slow": "איטי", "Medium": "בינוני", "Fast": "מהיר" };   /* the two new columns: character and speed, fixed order */
  var MU_EFFECT = { "Soft and Sensitive": "רך ורגיש", "Sensual": "חושני", "Joyful": "שמח", "Deep": "עמוק", "Romantic": "רומנטי", "Expressive": "אקספרסיבי", "Playful": "שובב", "Energizing": "מאיץ", "Dramatic": "דרמטי", "Cellestial": "שמימי", "Airy - Cosmic": "אווירי וקוסמי", "Sacred": "מקודש", "Passionate": "נלהב", "Light": "קליל", "Euphoric": "אופורי", "Pulsating": "פועם", "Optimistic": "אופטימי" };
  function muLineLabel(v) { var e = MU_LINE.filter(function (x) { return x[0] === v; })[0]; if (!e) return v; var n = e[1] && state.lines && state.lines.filter(function (l) { return l.key === e[1]; })[0]; return n ? n.name_he : e[2]; }
  function tagHit(m, f) {   /* a song matches when, in every box that is set, its array holds the chosen value; a song with no tags matches only when no box is set */
    return (!f.ln || (m.line_tags || []).indexOf(f.ln) >= 0) && (!f.ch || (m.rhythm_char_tags || []).indexOf(f.ch) >= 0) && (!f.sp || (m.rhythm_speed_tags || []).indexOf(f.sp) >= 0) && (!f.ef || (m.effect_tags || []).indexOf(f.ef) >= 0);
  }
  function pickerBody(sheetMode, swapIt) {
    var pageCss = '<style>.mfs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-1) } @media (min-width: 640px) { .mfs { grid-template-columns: repeat(4, minmax(0, 1fr)) } } .pgp > .pgs { padding-inline: var(--gutter); padding-block: var(--sp-1) 0 } #pgr::-webkit-scrollbar { display: none } ' + (sheetMode ? '#catDlg .sheet-head { display: none } #catDlg [data-accb] > div > div, #catDlg #mgrid { padding-inline: 0 !important } #catDlg .sheet-body > #pgr, #catDlg .sheet-body > .rtabs { padding-inline: 0 } #catDlg .pgp > * { padding-inline: var(--bleed, var(--pp-px)) }' : '') + '</style>';
    var pageSt = 'flex:0 0 100%;min-width:0;min-height:0;display:flex;flex-direction:column;scroll-snap-align:start;scroll-snap-stop:always', listSt = 'position:relative;flex:1 1 auto;min-height:0;overflow-y:auto';
    var exPage = '<div class="pgp" role="tabpanel" style="' + pageSt + '"><div class="pgs">' + searchInput("q", "חיפוש תרגילים בקטלוג") + '</div><div class="rlist pgl" id="pks" style="' + listSt + '"><div id="list"><div class="rskel rskel--title"></div></div></div></div>';
    var muPage = swapIt ? '' : '<div class="pgp" role="tabpanel" style="' + pageSt + '"><div class="pgs">' + searchInput("mq", "חיפוש מוסיקה בקטלוג") + '</div><div class="pgs mfs">' +
      [["mln", "קו"], ["mch", "אופי"], ["msp", "מהירות"], ["mef", "אפקט"]].map(function (b) { return '<label class="rfield"><select data-mf="' + b[0] + '" aria-label="' + b[1] + '"><option value="">' + b[1] + '</option></select></label>'; }).join("") +
      '</div><div class="rlist pgl" id="pkl" style="' + listSt + '"><div class="rskel rskel--title"></div></div></div>';
    return pageCss + (sheetMode && !swapIt ? pickerTabs() : '') +
      '<div id="pgr" style="flex:1 1 auto;min-height:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none">' + exPage + muPage + '</div>';
  }
  function pickerWire(r, swapIt, sheet) {
      var open = pk.open || (pk.open = {});   /* the categories that are open, kept while an exercise is looked at and back again */
      r.querySelector("#q").value = pk.q;
      var catBy = {};
      function catCards(k) {
        return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);padding:var(--gutter)">' + (catBy[k] || []).map(function (e) {
          return cardUi({ attrs: 'data-ex="' + e.id + '" role="button" tabindex="0"', title: name(e), sub: (e.exercise_lines || []).map(function (x) { return lineName(x.line_key); }).filter(Boolean).join(" · "), subLtr: false, actions: heartBtnEx(e.id, "bio-ha bio-ha--tl") });
        }).join("") + '</div>';
      }
      /* the one click handler of the list: a category opens or closes (slides), an exercise opens */
      r.querySelector("#list").addEventListener("click", function (ev) {
        if (ev.target.closest("[data-likex]")) return;   /* the heart on a card marks, it does not open */
        var l = r.querySelector("#list"), cb = ev.target.closest("[data-cat]");
        if (cb) {
          var k = cb.dataset.cat, nowOn = cb.getAttribute("aria-expanded") !== "true"; open[k] = nowOn; cb.setAttribute("aria-expanded", String(nowOn)); saveCat();
          var chev = cb.lastElementChild; if (chev) chev.style.transform = nowOn ? "rotate(180deg)" : "";
          var acc = l.querySelector('[data-accb="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
          var hrow = cb.closest(".rrow"); if (hrow) hrow.style.borderBottomColor = nowOn ? "transparent" : "var(--line)";   /* no line between an open header and its cards: the line is under the cards */
          if (acc) acc.style.borderBottomColor = nowOn ? "var(--line)" : "transparent";
          if (acc) { if (nowOn && !acc.firstChild.firstChild) acc.firstChild.innerHTML = catCards(k); requestAnimationFrame(function () { acc.style.gridTemplateRows = nowOn ? "1fr" : "0fr"; }); }
          return;
        }
        var b = ev.target.closest("[data-ex]"); if (!b) return;
        var ex = state.cat.filter(function (x) { return x.id === b.dataset.ex; })[0];
        l.querySelectorAll(".rrow, .bio-card").forEach(function (w) { w.removeAttribute("aria-current"); });
        (b.closest(".bio-card") || b.closest(".rrow")).setAttribute("aria-current", "true");
        if (sheet) previewSheet(ex, swapIt);   /* adding or replacing: the exercise is shown first, and the action is its own button in its header: on the left on a wide screen, in a second popup on a narrow one */
        else previewEx(ex, swapIt);
      });
      function paintCat() {
        var q = fold(r.querySelector("#q").value.trim()), l = r.querySelector("#list");
        pk.q = r.querySelector("#q").value; saveCat();
        var by = {}, top = {};
        catFind(q).forEach(function (e) {
          var k = e.category || ""; (by[k] = by[k] || []).push(e);   /* nearest first inside a category */
        });
        var cats = (state.cats || []).map(function (c) { return c.key; }).filter(function (k) { return by[k]; });
        Object.keys(by).forEach(function (k) { if (cats.indexOf(k) < 0) cats.push(k); });
        if (q) {   /* a search puts the category holding the nearest exercise first */
          var all = catFind(q);
          all.forEach(function (e, i) { var k = e.category || ""; if (top[k] == null) top[k] = i; });
          cats.sort(function (a, b) { return (top[a] == null ? 1e9 : top[a]) - (top[b] == null ? 1e9 : top[b]); });
        }
        catBy = by;
        l.innerHTML = cats.length ? cats.map(function (k) {
          var on = open[k] != null ? open[k] : false;   /* a category opens only when it is tapped: typing a search opens nothing */
          var head = '<div class="rrow rrow--link" style="padding-inline:var(--gutter);padding-block:var(--sp-1);min-height:0;border-bottom-color:' + (on ? "transparent" : "var(--line)") + '"><button type="button" class="rrow__main" data-cat="' + esc(k) + '" aria-expanded="' + on + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit;display:flex;align-items:center;gap:var(--sp-2)"><span style="flex:1 1 auto;min-width:0"><span class="rrow__title" style="font-weight:var(--fw-black)">' + esc(catName(k) || "ללא קטגוריה") + '</span></span><span data-catn style="flex:none;color:var(--text-2);font:var(--fw-regular) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + by[k].length + '</span><span style="flex:none;width:20px;height:20px;transition:transform .25s var(--ease);' + (on ? 'transform:rotate(180deg)' : '') + '">' + I.down + '</span></button></div>';
          return head + '<div data-accb="' + esc(k) + '" style="border-bottom:1px solid ' + (on ? "var(--line)" : "transparent") + ';display:grid;grid-template-rows:' + (on ? '1fr' : '0fr') + ';transition:grid-template-rows .25s var(--ease)"><div style="overflow:hidden;min-height:0">' + (on ? catCards(k) : '') + '</div></div>';
        }).join("") : ph("לא נמצא תרגיל", "");   /* the exercises tab holds exercises only: the songs have their own tab */
      }
      /* the pager: two pages side by side in one horizontal scroller with scroll snap. In RTL the first page (exercises) is on the right and scrollLeft runs negative, so the target is signed by the direction. A tap on a tab scrolls the pager; a swipe changes the tab; the tab marker is the kit's own (aria-selected). */
      var pgr = r.querySelector("#pgr"), tabEls = r.querySelectorAll("[data-pkt]"), TABS = ["ex", "mu"], goingTo = null, goT = 0, mq = r.querySelector("#mq");
      var musicAll = null, musicLoading = false, mById = {}, mList = [], mShown = 0, MP = 100;
      function musicCards(a, b) {
        return mList.slice(a, b).map(function (m) {
          return cardUi({ attrs: 'data-sgc="' + esc(m.id) + '"', ltr: true, title: songName(m), sub: songBy(m), pill: cardPill(m), time: clkSpan(m), chip: '<button type="button" class="rchip rchip--s" data-sg="' + esc(m.id) + '" style="cursor:pointer;border:0">הוספה</button>' });
        }).join("");
      }
      function fillSelects() {
        function count(col) { var c = {}; musicAll.forEach(function (m) { (m[col] || []).forEach(function (v) { c[v] = (c[v] || 0) + 1; }); }); return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }); }
        function has(col, v) { return musicAll.some(function (m) { return (m[col] || []).indexOf(v) >= 0; }); }
        var sets = { mln: MU_LINE.map(function (x) { return x[0]; }).filter(function (v) { return musicAll.some(function (m) { return (m.line_tags || []).indexOf(v) >= 0; }); }), mch: Object.keys(MU_CHAR).filter(function (v) { return has("rhythm_char_tags", v); }), msp: Object.keys(MU_SPEED).filter(function (v) { return has("rhythm_speed_tags", v); }), mef: count("effect_tags") };
        r.querySelectorAll("[data-mf]").forEach(function (sel) {
          var k = sel.dataset.mf, first = sel.options[0].outerHTML;
          sel.innerHTML = first + sets[k].map(function (v) { var lb = k === "mln" ? muLineLabel(v) : ({ mch: MU_CHAR, msp: MU_SPEED, mef: MU_EFFECT })[k][v] || v; return '<option value="' + esc(v) + '">' + esc(lb) + '</option>'; }).join("");
          sel.value = pk[k] || "";
        });
      }
      function paintMu() {
        var l = r.querySelector("#pkl"); if (!l || !musicAll) return;
        var s = fold(mq.value.trim()), f = { ln: pk.mln, ch: pk.mch, sp: pk.msp, ef: pk.mef };
        pk.mq = mq.value; saveCat();   /* the search and the four boxes are kept through a refresh, like the exercises' search */
        mList = musicAll.filter(function (m) { return tagHit(m, f) && (!s || fz(songName(m) + " " + songBy(m), s)); });
        mShown = Math.min(MP, mList.length); l.scrollTop = 0;
        l.innerHTML = mList.length ? '<div id="mgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(21rem,100%),1fr));gap:var(--sp-1);padding:var(--gutter)">' + musicCards(0, mShown) + '</div>' : ph("לא נמצאה מוסיקה", "");
      }
      function ensureMusic() {
        if (!pgr || !r.querySelector("#pkl") || musicLoading || musicAll) return;
        musicLoading = true;
        loadExMusic().then(function (gs) {
          var seen = {}, all = [];
          gs.forEach(function (g) { g.songs.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; all.push(m); mById[m.id] = m; } }); });
          all.sort(function (a, b) { return songName(a).localeCompare(songName(b), "he"); });
          musicAll = all; fillSelects(); paintMu();
        }, function () { musicLoading = false; var l = r.querySelector("#pkl"); if (l) l.innerHTML = ph("לא ניתן לטעון את המוסיקה", ""); });
      }
      function dirSign() { return getComputedStyle(pgr).direction === "rtl" ? -1 : 1; }
      function curIdx() { var w = pgr.clientWidth || 1; return Math.max(0, Math.min(TABS.length - 1, Math.round(Math.abs(pgr.scrollLeft) / w))); }
      function markTab(i) {
        tabEls.forEach(function (t, j) { t.setAttribute("aria-selected", String(i === j)); });
        if (pk.tab !== TABS[i]) { pk.tab = TABS[i]; saveCat(); }
        if (i === 1) ensureMusic();
      }
      function goTab(i, instant) {
        var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        goingTo = instant || reduce ? null : i; clearTimeout(goT); if (goingTo != null) goT = setTimeout(function () { goingTo = null; }, 700);   /* the scroll listener leaves the tabs alone until the animation arrives */
        pgr.scrollTo({ left: dirSign() * i * pgr.clientWidth, behavior: instant || reduce ? "auto" : "smooth" });
        markTab(i);
      }
      if (pgr && tabEls.length) {
        var raf = 0, lastW = 0, maxS = 0, ind = r.querySelector("[data-pkind]");
        function glide() { if (!ind || !maxS) return; var p = Math.min(1, Math.max(0, Math.abs(pgr.scrollLeft) / maxS)); ind.style.transform = "translateX(" + (dirSign() * p * 100) + "%)"; }   /* the marker follows the scroll itself: a swipe and a tap's animation alike, with transform only */
        pgr.addEventListener("scroll", function () {
          if (!pgr.clientWidth || raf) return;
          raf = requestAnimationFrame(function () { raf = 0; if (!pgr.clientWidth) return; glide(); var i = curIdx(); if (goingTo != null) { if (i === goingTo) goingTo = null; return; } markTab(i); });
        }, { passive: true });
        tabEls.forEach(function (t, j) { t.addEventListener("click", function (ev) { goTab(j); if (ev.detail > 0) t.blur(); }); });   /* a tap or a click leaves no focus frame on the tab (the moving bar marks it); a keyboard press (detail 0) keeps the frame */
        var resnap = function () { var w = pgr.clientWidth; maxS = pgr.scrollWidth - w; if (w && w !== lastW) { lastW = w; var i = TABS.indexOf(pk.tab); goTab(i < 0 ? 0 : i, true); glide(); } };   /* it came on screen (a hidden box forgets its scroll) or changed width: back on the page of the selected tab */
        if (window.ResizeObserver) new ResizeObserver(resnap).observe(pgr); else window.addEventListener("resize", resnap);
        var i0 = TABS.indexOf(pk.tab); markTab(i0 < 0 ? 0 : i0); requestAnimationFrame(resnap);
      }
      if (mq) {
        mq.value = pk.mq || "";
        mq.addEventListener("input", paintMu);
        r.querySelectorAll("[data-mf]").forEach(function (sel) { sel.addEventListener("change", function () { pk[sel.dataset.mf] = sel.value; paintMu(); }); });
        var ml = r.querySelector("#pkl");
        ml.addEventListener("scroll", function () {
          if (mShown >= mList.length || ml.scrollTop + ml.clientHeight < ml.scrollHeight - 400) return;
          var g = ml.querySelector("#mgrid"), to = Math.min(mList.length, mShown + MP); if (g) g.insertAdjacentHTML("beforeend", musicCards(mShown, to)); mShown = to;
        }, { passive: true });
        ml.addEventListener("click", function (ev) {   /* the same as before: a tap on a card plays, the chip adds an exercise with no name and that song */
          if (ev.target.closest("[data-audio], a")) return;
          var bt = ev.target.closest("[data-sg]");
          if (!bt) { var cd = ev.target.closest("[data-sgc]"), pb = cd && cd.querySelector("[data-audio]"); if (pb) pb.click(); return; }
          var m = mById[bt.dataset.sg]; if (m) confirmAddMusic(songName(m), state.viv ? (state.viv.title || "הוויוונסיה") : "", function () { addSongOnly(m, sheet); });
        });
      }
      var scEl = r.querySelector("#pks"); if (scEl) scEl.addEventListener("scroll", function () { clearTimeout(scEl._t); scEl._t = setTimeout(saveCat, 250); });
      r.querySelector("#q").addEventListener("input", function () { var sc = r.querySelector("#pks"); if (sc) sc.scrollTop = 0; paintCat(); if (!catTx) loadCatTx().then(function () { if (catTx && r.isConnected && r.querySelector("#q").value.trim()) paintCat(); }); });
      return (state.cats ? Promise.resolve() : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) {
        state.cats = c || [];
      })).then(function () { return state.cat ? null : loadCatalog().then(function (c) { state.cat = c; }); }).then(paintCat, fail);
  }
  function picker(swapIt) {
    state.pickerShow = true;
    show('<header class="rhead"><button class="rbtn rbtn--icon rbtn--edge-start" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button><div class="rhead__text">' + (swapIt ? '<span class="rhead__title">הקטלוג</span>' : pickerTabs()) + '</div></header>' + pickerBody(false, swapIt), function (r) {
      on(r, "back", !wide() ? back : swapIt ? function () { pending = { item: swapIt.id }; back(); }   /* leaving a replacement: the same exercise is open again on the left */
        : function () { show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); back(); });
      pickerWire(r, swapIt, false);
    });
    state.pickerShow = false;
    if (wide()) pd.classList.add("bio-dim");   /* the exercise of the vivencia on the left is dark while the catalog is open */
  }
  /* narrow screen: the catalog is a popup from the bottom, and a chosen exercise opens in a second popup on top of it, with the action as a green check in its header; closing it is back to the list */
  function pickerSheet(swapIt) {
    var dlg = document.getElementById("catDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "catDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { title: "", from: "bottom", body: bleedCss("catDlg") + pickerBody(true, swapIt) });
    bleedSet(dlg);   /* the content sits on the title's own edges, the same on both sides */
    var q0 = dlg.querySelector("#q"); if (q0) q0.blur();   /* the popup opens on the list: the keyboard comes up only when the search is touched */
    if (document.activeElement && document.activeElement !== document.body && dlg.contains(document.activeElement)) document.activeElement.blur();   /* showModal focuses the first control, now the first tab: it would show a focus frame, so nothing starts focused */
    var r = dlg.querySelector(".sheet-body"), ls = r.querySelector("#pks");
    var ph0 = r.querySelector("[data-pickhead]"); if (ph0) { ph0.style.paddingTop = "0"; ph0.style.paddingInline = "0"; }   /* the popup already leaves its standard step under the title */
    r.style.overflowY = "hidden";   /* the search stays where it is and only the list scrolls, so nothing shows through above it */
    if (ls) ls.style.cssText += ";flex:1 1 auto;min-height:0;overflow-y:auto";
    if (!dlg.__catWired) { dlg.__catWired = true; dlg.addEventListener("close", function () { if (!swapIt) saveCat(); }); }
    var drawn = pickerWire(r, swapIt, true); saveCat();
    return drawn;
  }
  /* the catalog's exercise as an item of the page: its texts, its songs as options, the first one chosen; nothing of it is written anywhere */
  function itemFake(e, rows, songs) {
    return { __preview: true, id: "", exercise_id: e.id, exercises: Object.assign({}, e, { exercise_texts: rows || [] }), title: null, poetics: null, guidance: null, notes: "",
      sel: [], music_id: null, music: null,   /* no song is marked until the facilitator marks some: those come with the exercise */
      item_music_options: songs.map(function (m, i) { return { music_id: m.id, created_at: String(1000 + i), music: m }; }) };
  }
  /* the cards of a read only page: a tap plays, the chip chooses the song the exercise is added with */
  function wireRoMusic(root, fake) {
    var imus = root.querySelector("#imus"); if (!imus) return;
    imus.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      if (ev.target.closest("[data-addm]")) { openAddMusic(fake, function () { imus.innerHTML = musCards(fake, true); }); return; }   /* more songs for what is shown: not for the catalog */
      var c = ev.target.closest("[data-opt]"); if (!c) return;   /* a tap marks the song (green frame), a second tap takes the mark off; the play tile plays */
      var id = c.dataset.opt, k = fake.sel.indexOf(id); if (k >= 0) fake.sel.splice(k, 1); else fake.sel.push(id);
      var first = (fake.item_music_options || []).map(function (o) { return o.music; }).filter(function (x) { return x && x.id === fake.sel[0]; })[0];
      fake.music_id = fake.sel[0] || null; fake.music = first || null;
      imus.innerHTML = musCards(fake, true);
    });
  }
  function previewSheet(e, swapIt) {
    var tok = ++previewTok;
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;
      var fake = itemFake(e, rows, songs);
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה לוויוונסיה";
      var dlg = document.getElementById("exDlg");
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "exDlg"; document.body.appendChild(dlg); }
      RosterSheet.render(dlg, { title: name(e), from: "bottom",
        body: bleedCss("exDlg") + '<style>#exDlg .sheet-body { padding-bottom: calc(var(--fab) + var(--gutter) * 2 + var(--inset-b)) } html.rs-lock:not(.kb-open) #exDlg .rfab { opacity: 1; transform: none; pointer-events: auto }</style>' + itemPageHtml(fake, true) });
      bleedSet(dlg);
      dlg.dataset.ex = swapIt ? "" : e.id; if (!dlg.__catWired) { dlg.__catWired = true; dlg.addEventListener("close", function () { saveCat(); }); } saveCat();
      wireRoMusic(dlg, fake);
      /* the action is a button with its words, as on a computer: a plus and the name of the vivencia (or the word, and a menu of the last three, when none is open); a swap says so */
      var vname = state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה", ico = (swapIt ? I.swap : I.plus).replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ');
      var gob = document.createElement("button"); gob.type = "button"; gob.id = "exgo"; gob.className = "rbtn rbtn--icon rbtn--primary"; gob.setAttribute("aria-label", swapIt ? word : "הוספה לוויוונסיה " + vname); gob.title = swapIt ? word : "הוספה לוויוונסיה " + vname;
      gob.style.cssText = "order:98;flex:none";
      gob.innerHTML = '<span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m);flex:none">' + ico + '</span>';   /* only the plus; the confirmation says where it goes */
      var shd = dlg.querySelector(".sheet-head"); if (shd) shd.appendChild(gob);
      gob.addEventListener("click", function () {
        if (swapIt) confirmSwap(e, swapIt, true, fake.music_id, fake.sel);
        else if (!state.viv) vivPick(gob, e, fake.music_id, fake.sel);
        else confirmAddEx(name(e), state.viv.title || "הוויוונסיה", function () { addEx(e, undefined, true, fake.music_id, fake.sel); }, !(fake.sel && fake.sel.length) && !fake.music_id);
      });
    }, fail);
  }
  /* the catalog is over a thousand exercises and the server hands out at most a thousand rows at a time: read it page by page */
  /* the catalog search: the names first, then the exercises whose poetics or guidance has the words (lower, after all the names). The texts come once, when the first word is typed. */
  var catTx = null, catTxP = null;
  function loadCatTx() {
    if (catTx || catTxP) return catTxP || Promise.resolve();
    return (catTxP = api("/rest/v1/exercise_texts?lang=eq.he&select=exercise_id,poetics,guidance&limit=1000").then(function (rows) {
      catTx = {}; (rows || []).forEach(function (x) { catTx[x.exercise_id] = (x.poetics || "") + " " + (x.guidance || ""); });
    }, function () { catTxP = null; }));
  }
  function catFind(q) {
    var byName = nearest(state.cat || [], function (e) { return name(e) + " " + e.title_en + " " + catName(e.category); }, q);
    if (!fold(q).trim() || !catTx) return byName;
    var seen = {}; byName.forEach(function (e) { seen[e.id] = 1; });
    var tx = (state.cat || []).filter(function (e) { return !seen[e.id] && catTx[e.id]; }).map(function (e) { return { e: e, s: fzs(catTx[e.id], q) }; })
      .filter(function (o) { return o.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (o) { return o.e; });
    return byName.concat(tx);
  }
  function loadCatalog() {
    var all = [], PAGE = 1000;
    function page(off) {
      return api("/rest/v1/exercises?select=id,title_he,title_en,category,phase_hint,phase_keys,level_key,exercise_lines(line_key)&order=title_en,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || []; all = all.concat(rows);
        return rows.length === PAGE ? page(off + PAGE) : all;
      });
    }
    return page(0);
  }
  /* the super admin sets the group level and the place on the curve of a catalog exercise, right in its preview (the rules are in the database: biodanza.set_exercise_placement) */
  function placementCards(e, card) {
    if (!(state.me && state.me.super) || !e) return card("level", "רמת הקבוצה") + card("curve", "מיקום בעקומה");
    var lv = state.levels && state.levels.length ? state.levels : LEVELS_FALLBACK, ph = state.phases || [];
    var opt = function (list, val, none) { return (none ? '<option value="">' + none + '</option>' : '') + list.map(function (x) { return '<option value="' + x.key + '"' + (x.key === val ? ' selected' : '') + '>' + esc(x.name_he) + '</option>'; }).join(""); };
    var main = e.phase_hint || "unclassified", second = (e.phase_keys || []).filter(function (k) { return k !== main && k !== "unclassified"; })[0] || "";
    var box = function (title, inner) { return '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">' + title + '</span></div><div class="rcard__body">' + inner + '</div></div>'; };
    return box("רמת הקבוצה", '<label class="rfield"><select data-pl="lv" data-ex="' + e.id + '">' + opt(lv, e.level_key || "", "לא נקבעה") + '</select></label>') +
      box("מיקום בעקומה", '<label class="rfield"><span>שלב</span><select data-pl="main" data-ex="' + e.id + '">' + opt(ph, main) + '</select></label>' +
        '<label class="rfield"><span>שלב נוסף (לא חובה)</span><select data-pl="second" data-ex="' + e.id + '">' + opt(ph.filter(function (x) { return x.key !== "unclassified"; }), second, "בלי") + '</select></label>');
  }
  document.addEventListener("change", function (ev) {
    var t = ev.target; if (!t || !t.dataset || !t.dataset.pl) return;
    var id = t.dataset.ex, q = function (k) { var el = document.querySelector('select[data-pl="' + k + '"][data-ex="' + id + '"]'); return el ? el.value : ""; };
    var e = (state.cat || []).filter(function (x) { return x.id === id; })[0];
    api("/rest/v1/rpc/set_exercise_placement", { method: "POST", json: { ex: id, lvl: q("lv"), main: q("main"), second: q("second") } }).then(function () {
      if (e) { e.level_key = q("lv") || null; e.phase_hint = q("main"); e.phase_keys = q("second") ? [q("main"), q("second")] : [q("main")]; }
      toast("נשמר");
    }, function (x) { toast("אין הרשאה לערוך"); fail(x); });
  });
  /* a catalog exercise shown on the left while one is being added or replaced: its own words, and one button that does it */
  var previewTok = 0;
  /* what a catalog exercise shows before it is added: its words and every song linked to it */
  function loadPreview(id) {
    return Promise.all([api("/rest/v1/exercise_texts?exercise_id=eq." + id + "&select=lang,poetics,guidance,level,curve,level_basis,curve_basis,source"), api("/rest/v1/exercise_music?exercise_id=eq." + id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)")]).then(function (r) {
      var seen = {}, songs = [];
      (r[1] || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; songs.push(x.music); } });
      return { rows: r[0] || [], songs: songs };
    });
  }
  function musicRows(songs, sel) {
    if (!songs.length) return "";
    /* each song the same way as everywhere (songRow); one of them is the one the exercise comes with */
    return '<div style="margin-top:var(--sp-2);border-top:1px solid var(--line);min-width:0">' + songs.map(function (m) { return songRow(m, m.id === sel, "data-pk"); }).join("") + '</div>';
  }
  /* choosing the song an exercise is added with: a tap marks it, a tap on the marked one takes the mark off (no music) */
  function wirePick(root, onPick, songs, sel0) {
    var g = root.querySelector("#pvmus"); if (!g) return;
    var cur = sel0;
    g.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var ch = ev.target.closest("[data-choose]");
      if (ch) { cur = ch.dataset.choose; g.innerHTML = prevMusic(songs, cur).replace(/^<div[^>]*>/, "").replace(/<\/div>$/, ""); onPick(cur); return; }
      var c = ev.target.closest("[data-opt]"); if (!c) return;
      var pb = c.querySelector("[data-audio]"); if (pb) pb.click();
    });
  }
  function firstMusic(exId, mid) {   /* the song an exercise is added with: the chosen one (or none), else the catalog's first */
    if (mid !== undefined) return Promise.resolve(mid ? [{ music_id: mid }] : []);
    return api("/rest/v1/exercise_music?exercise_id=eq." + exId + "&select=music_id&limit=1");
  }
  /* in no vivencia: the three vivencias that were changed last, to put the exercise in one of them */
  function vivPick(btn, e, mid, all) {
    var last3 = (state.vivs || []).filter(function (v) { return v.role !== "view"; }).sort(function (a, b) { return Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0); }).slice(0, 3);
    if (!last3.length) return;
    menu(btn, last3.map(function (v) { return { label: v.title || "ויוונסיה ללא שם", icon: I.plus, fn: function () { addExToViv(v, e, mid, all); } }; }));
  }
  function addExToViv(v, e, mid, all) {   /* the same as adding to the open vivencia, to the one that was picked: then it is opened, on the new exercise */
    var newId = null;
    api("/rest/v1/vivencia_items?vivencia_id=eq." + v.id + "&select=position&order=position.desc&limit=1").then(function (top) {
      var pos = (top && top[0] ? top[0].position : 0) + 1;
      return Promise.all([firstMusic(e.id, mid), detached(e.id)]).then(function (r) {
        var m = r[0], d = r[1];
        return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=representation", json: { vivencia_id: v.id, position: pos, backlog: true, exercise_id: null, music_id: m && m[0] ? m[0].music_id : null, title: d.title || null, poetics: d.poetics || null, guidance: d.guidance || null } });
      });
    }).then(function (made) {
      newId = made && made[0] ? made[0].id : null;
      return newId ? optionsFor(newId, all) : null;
    }).then(function () {
      closeCatPrev(); closeCatPanel(true);
      pending = newId ? { item: newId } : null; openViv(v.id);
    }, fail);
  }
  function previewEx(e, swapIt) {
    var useLayer = !!(catPanel && wide() && !swapIt);
    if (useLayer && catPrevId === e.id && catPrev && catPrev.classList.contains("is-open")) { previewTok++; closeCatPrev(); return; }   /* a second tap on the chosen one: it closes, with its animation */
    var tok = ++previewTok;
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;   /* a later row was chosen meanwhile */
      var fake = itemFake(e, rows, songs);
      var word = swapIt ? "החלפה בתרגיל הזה" : state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה";   /* adding: a plus with the vivencia's name; in no vivencia, a plus with the word, and a tap asks which of the last three */
      /* the same page as the exercise of a vivencia, only read: its header, its song cards, its texts; the action is the green button in the header, where the delete is in the vivencia */
      var phtml = itemHead(false, false, "", e.id, name(e), true, word, undefined, undefined, !swapIt) + itemPageHtml(fake, true);
      var pwire = function (r) {
        wireRoMusic(r, fake); sbSync(r); catPreview = true;
        on(r, "doswap", function (btn) {
          if (swapIt) confirmSwap(e, swapIt, undefined, fake.music_id, fake.sel);
          else if (!state.viv) vivPick(btn, e, fake.music_id, fake.sel);
          else addEx(e, undefined, undefined, fake.music_id, fake.sel);
        });
      };
      if (useLayer && catPanel) { catPrev.innerHTML = phtml; pwire(catPrev);
        var ph0 = catPrev.querySelector(".rhead"); if (ph0) { var xb = document.createElement("button"); xb.type = "button"; xb.className = "rbtn rbtn--icon bio-flat"; xb.setAttribute("aria-label", "סגירת התרגיל"); xb.title = "סגירת התרגיל"; xb.innerHTML = I.x; xb.addEventListener("click", function () { previewTok++; closeCatPrev(); }); ph0.appendChild(xb); } catPrevId = e.id; catPrevCtx = { e: e, fake: fake }; refreshPrevLabel(); saveCat(); requestAnimationFrame(function () { catPrev.classList.add("is-open"); }); }
      else show(phtml, pwire, "d");
    }, fail);
  }
  /* replacing is asked in the kit's popup, one action: closing it is the cancel */
  function confirmSwap(e, swapIt, sheet, mid, all) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm",
      title: "החלפת תרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><span>להחליף את "' + esc(itemName(swapIt)) + '" ב"' + esc(name(e)) + '"? השם, הפואטיקה וההנחיה שכתבתם בתרגיל הנוכחי יימחקו. ההערות נשארות.</span></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="cswap">החלפה</button>'
    });
    dlg.querySelector("#cswap").addEventListener("click", function () { dlg.close(); addEx(e, swapIt, sheet, mid, all); });
  }
  function closeSheets() { ["exDlg", "catDlg"].forEach(function (id) { slideClose(document.getElementById(id)); }); }
  var sgTok = 0;
  /* a song chosen in the catalog's search: an exercise with no name, only that song */
  function confirmAddEx(exLabel, toLabel, fn, noMusic) {   /* adding an exercise from the catalog asks first, with one action */
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הוספת תרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><span>להוסיף את "' + esc(exLabel) + '" ל"' + esc(toLabel) + '"?</span>' + (noMusic ? '<div style="margin-top:var(--sp-2);font-weight:var(--fw-black)">שימו לב: לא נבחרה מוסיקה</div>' : '') + '</div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="caddex">הוספה</button>' });
    dlg.querySelector("#caddex").addEventListener("click", function () { dlg.close(); fn(); });
  }
  function confirmAddMusic(songLabel, toLabel, fn) {   /* every adding of a song asks first, in the kit's popup with ONE action */
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הוספת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad"><span>להוסיף את "' + esc(songLabel) + '" ל' + (toLabel ? '"' + esc(toLabel) + '"' : "") + '?</span></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="cadd">הוספה</button>' });
    dlg.querySelector("#cadd").addEventListener("click", function () { dlg.close(); fn(); });
  }
  function addSongOnly(m, sheet) {
    var pos = state.items.reduce(function (x, i) { return Math.max(x, i.position); }, 0) + 1;
    api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, backlog: true, exercise_id: null, music_id: m.id } }).then(function () {
      if (sheet) { closeSheets(); return loadItems().then(paint, fail); }
      if (wide()) show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); else stack().pop(); back();
    }, fail);
  }
  /* An exercise placed in a vivencia is cut loose from the catalog: the item keeps its own copy of the name, the poetics and the guidance as they are
     at that moment, so a later change to the catalog exercise never reaches a session that was already planned (the item fields: null follows the catalog). */
  function detached(exId) {
    return api("/rest/v1/exercises?id=eq." + exId + "&select=title_he,title_en,poetics,guidance,exercise_texts(lang,poetics,guidance,source)").then(function (r) {
      var row = r && r[0]; if (!row) return {};
      var it = { exercises: row }, o = {}, t = name(row);
      if (t) o.title = t;
      ["poetics", "guidance"].forEach(function (k) { var v = baseTxt(it, k); if (v) o[k] = v; });
      return o;
    }, function () { return {}; });
  }
  function optionsFor(itemId, all) {   /* everything that was marked is an option of the exercise; the first is its own song */
    return all && all.length ? api("/rest/v1/item_music_options?on_conflict=item_id,music_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: all.map(function (id) { return { item_id: itemId, music_id: id }; }) }) : null;
  }
  function addEx(e, swapIt, sheet, mid, all) {
    if (swapIt) {   /* the same place in the curve, another exercise: its first song, and none of the old exercise's own wording */
      return Promise.all([firstMusic(e.id, mid), detached(e.id)]).then(function (r) {
        var m = r[0], d = r[1];
        return api("/rest/v1/vivencia_items?id=eq." + swapIt.id, { method: "PATCH", prefer: "return=minimal", json: { exercise_id: null, music_id: m && m[0] ? m[0].music_id : null, title: d.title || null, poetics: d.poetics || null, guidance: d.guidance || null } }).then(function () { return optionsFor(swapIt.id, all); });
      }).then(function () { toast("התרגיל הוחלף");
        if (sheet) {   /* the popups slide out and the same place opens again with the new exercise: no new address, so no entry */
          closeSheets();
          return loadItems().then(function () { var it = state.items.filter(function (x) { return x.id === swapIt.id; })[0]; if (it) { stack().pop(); go(function () { itemScreen(it); }); } else back(); }, fail);
        }
        pending = { item: swapIt.id };
        if (inSub()) { unwind(1); return; }   /* the catalog beside the exercise holds one entry: leaving it draws the exercise again from the address */
        stack().pop(); if (!wide()) { stack().pop(); stack().pop(); } var f = stack()[stack().length - 1]; if (f) f(); }, fail);   /* narrow: also the exercise screen and the one just seen */
    }
    var pos = state.items.reduce(function (m, i) { return Math.max(m, i.position); }, 0) + 1, newId = null;
    var openNew = function () { var it = newId && state.items.filter(function (x) { return x.id === newId; })[0]; if (it) { paint(); if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); } else paint(); };   /* what was added is the open, chosen exercise */
    Promise.all([firstMusic(e.id, mid), detached(e.id)]).then(function (r) {
      var m = r[0], d = r[1];
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=representation", json: { vivencia_id: state.viv.id, position: pos, backlog: true, exercise_id: null, music_id: m && m[0] ? m[0].music_id : null, title: d.title || null, poetics: d.poetics || null, guidance: d.guidance || null } }).then(function (made) { newId = made && made[0] ? made[0].id : null; return newId ? optionsFor(newId, all) : null; });   /* the songs that were marked come with the exercise, the first as its own; none marked, none comes */
    }).then(function () { toast("התרגיל נוסף"); if (sheet) { closeSheets(); return loadItems().then(openNew, fail); }
      if (catPreview || catPanel || catPrevId) { closeCatPrev(); closeCatPanel(true); return loadItems().then(openNew, fail); }
      if (wide()) show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); else stack().pop(); back(); }, fail);
  }

  /* ---------- player: the session, one exercise at a time ---------- */
  function player(k) {
    var it = state.items[k], e = it.exercises || {}, last = k === state.items.length - 1;
    show(head(itemName(it), "", true) +
      '<div class="rlist"><div class="pad">' +
      '<span class="rchip rchip--s">' + (k + 1) + ' מתוך ' + state.items.length + '</span>' +
      (it.music ? '<span class="rchip rchip--info rchip--l">' + esc(it.music.name) + '</span>' : '') +
      (txt(it, "poetics") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">פואטיקה</span></div><div class="rcard__body"' + (isDraft(it, "poetics") ? DRAFT : "") + '>' + rtHtml(txt(it, "poetics")) + '</div></div>' : '') +
      (txt(it, "guidance") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">הנחיה</span></div><div class="rcard__body"' + (isDraft(it, "guidance") ? DRAFT : "") + '>' + rtHtml(txt(it, "guidance")) + '</div></div>' : '') +
      (it.notes ? '<div class="rhint"><span class="rhint__tx">' + rtHtml(it.notes) + '</span></div>' : '') +
      '</div></div><div class="bar">' + (last ? '' : '<button class="rbtn rbtn--block" data-act="next">התרגיל הבא</button>') + (k ? '<button class="rbtn rbtn--ghost rbtn--block" data-act="prev">התרגיל הקודם</button>' : '') + '</div>', function (r) {
      on(r, "back", back);
      on(r, "next", function () { stack().push(function () { player(k + 1); }); player(k + 1); });
      on(r, "prev", function () { stack().push(function () { player(k - 1); }); player(k - 1); });
    }, "d");
  }

  /* ---------- allowlist (admin only): the kit's popup, from the left on a computer ---------- */
  function allowPopup() {
    var dlg = document.getElementById("allowDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "allowDlg"; document.body.appendChild(dlg); }
    var rows = [];
    RosterSheet.render(dlg, {
      title: "ניהול משתמשים", from: "bottom",
      body: '<div class="pad">' +
        '<label class="rfield"><span>חיפוש</span><input id="aq" type="search" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield rfield--ltr"><span>אימייל של חשבון גוגל</span><input id="em" type="email" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield"><span>שם (לא חובה)</span><input id="en" placeholder=" " autocomplete="off"></label>' +
        '<button class="rbtn" id="addm" type="button">הוספה</button></div><div id="alist"></div>'
    });
    function paintA() {
      var q = fold(dlg.querySelector("#aq").value.trim()), l = dlg.querySelector("#alist");
      var vis = rows.filter(function (a) { return !q || fz(a.email + " " + (a.note || ""), q); });
      var sup = !!(state.me && state.me.super), roleOf = function (a) { return a.is_super ? "super" : a.is_admin ? "admin" : "member"; };
      var ROLES = [["member", "חבר"], ["admin", "מנהל"], ["super", "מנהל על"]];
      l.innerHTML = vis.length ? vis.map(function (a) {
        return '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title" dir="ltr">' + esc(a.email) + '</span>' + (a.is_super ? '<span class="rchip rchip--info rchip--s">מנהל על</span>' : a.is_admin ? '<span class="rchip rchip--info rchip--s">מנהל</span>' : '') + '</div>' +
          '<label class="rfield"><span>שם</span><input data-note="' + esc(a.email) + '" placeholder=" " value="' + esc(a.note || "") + '"></label>' +
          (sup ? '<label class="rfield"><span>רמת הרשאה</span><select data-urole="' + esc(a.email) + '">' + ROLES.map(function (r) { return '<option value="' + r[0] + '"' + (roleOf(a) === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join("") + '</select></label>' : '') +
          ((a.is_admin && !sup) ? '' : '<div class="rcard__foot"><button class="rbtn rbtn--sm rbtn--ghost rbtn--danger" type="button" data-rm="' + esc(a.email) + '">הסרה</button></div>') + '</div>';
      }).join("") : '<div class="rempty"><b>' + (rows.length ? "לא נמצא" : "הרשימה ריקה") + '</b></div>';
      l.querySelectorAll("[data-urole]").forEach(function (i) {
        i.addEventListener("change", function () {
          api("/rest/v1/rpc/set_member_role", { method: "POST", json: { target: i.dataset.urole, new_role: i.value } }).then(function () { toast("נשמר"); load(); }, function () { toast("אי אפשר לשנות: חייב להישאר לפחות מנהל על אחד"); load(); });
        });
      });
      l.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/allowed?email=eq." + encodeURIComponent(b.dataset.rm), { method: "DELETE" }).then(load, fail); }); });
      l.querySelectorAll("[data-note]").forEach(function (i) {
        i.addEventListener("change", function () {
          api("/rest/v1/allowed?email=eq." + encodeURIComponent(i.dataset.note), { method: "PATCH", json: { note: i.value.trim() } }).then(function () { rows.forEach(function (a) { if (a.email === i.dataset.note) a.note = i.value.trim(); }); toast("נשמר"); }, fail);
        });
      });
    }
    function load() { return api("/rest/v1/allowed?select=email,is_admin,is_super,note&order=added_at").then(function (r) { rows = r || []; paintA(); }, fail); }
    dlg.querySelector("#aq").addEventListener("input", paintA);
    dlg.querySelector("#addm").addEventListener("click", function () {
      var em = dlg.querySelector("#em").value.trim().toLowerCase(), nm = dlg.querySelector("#en").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("אימייל לא תקין");
      api("/rest/v1/allowed", { method: "POST", prefer: "return=minimal", json: { email: em, note: nm } }).then(function () { dlg.querySelector("#em").value = ""; dlg.querySelector("#en").value = ""; return load(); }, fail);
    });
    load();
  }

  /* ---------- live: what somebody else changes in a vivencia you both have open appears here, like a shared document ----------
     Supabase Realtime over a plain WebSocket (no SDK, as in roster's admin): a change in one of the five vivencia tables reaches everyone who may read
     the row. The page reloads what it shows: the list of vivencias, the exercises of the open vivencia, and the fields of the open exercise (written in
     place, never over a field I am in the middle of changing). A save of my own comes back too and changes nothing, because nothing differs. */
  var rt = { ws: null, hb: 0, tk: 0, retry: 1000, timer: 0, v: false, i: false, on: false };
  var RT_TABLES = ["vivencias", "vivencia_items", "vivencia_owners", "vivencia_shares", "vivencia_item_facilitators"];
  function rtSend(o) { if (rt.ws && rt.ws.readyState === 1) rt.ws.send(JSON.stringify(o)); }
  function rtChange(table) {
    if (table === "vivencia_items" || table === "vivencia_item_facilitators") rt.i = true; else rt.v = true;
    if (table === "vivencia_shares" || table === "vivencia_owners") rt.i = true;   /* who may do what: the exercises screen redraws with the role */
    clearTimeout(rt.timer); rt.timer = setTimeout(rtFlush, 300);
  }
  function rtFlush() {
    var v = rt.v, i = rt.i; rt.v = rt.i = false;
    if (v) loadVivs().then(function () {
      if (state.viv) {
        var cur = state.vivs.filter(function (x) { return x.id === state.viv.id; })[0];
        if (!cur) { toast("הוויוונסיה כבר לא זמינה"); if (wide()) homeWide(); else { stack().length = 0; home(); } return; }
        var roleChanged = cur.role !== state.viv.role, titleChanged = cur.title !== state.viv.title;
        state.viv.role = cur.role; state.viv.title = cur.title;
        if ((roleChanged || titleChanged) && document.getElementById("list") && document.getElementById("list").hasAttribute("data-fab-room") && !(liveItem && liveItem.root.isConnected)) editor();
      }
      renderVivs(); localSoon();
    }, function () { /* the next change will try again */ });
    if (i && state.viv) {
      api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: state.viv.id } }).then(function (mm) { state.members = mm || []; }, function () { /* kept as it was */ });
      loadItems().then(function () {
        paint(); localSoon();
        if (liveItem && liveItem.root.isConnected) {
          var f = state.items.filter(function (x) { return x.id === liveItem.id; })[0];
          if (f) liveItem.apply(f);
          else { toast("התרגיל הוסר"); liveItem = null; if (wide()) { show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); state.lastItem = null; setUrl(BASE + state.viv.id); paint(); } else back(); }
        }
      }, function () { /* the next change will try again */ });
    }
  }
  function startRealtime() {
    if (rt.ws || !FLOA_AUTH.signedIn() || !window.WebSocket) return;
    var ws, cfg = window.SUPABASE;
    try { ws = new WebSocket(cfg.url.replace(/^http/, "ws") + "/realtime/v1/websocket?apikey=" + encodeURIComponent(cfg.anonKey) + "&vsn=1.0.0"); } catch (x) { return; }
    rt.ws = ws;
    var TOPIC = "realtime:biodanza";
    ws.onopen = function () {
      rt.retry = 1000;
      Promise.resolve(FLOA_AUTH.token()).then(function (tok) {
        var ch = []; RT_TABLES.forEach(function (tb) { ["INSERT", "UPDATE", "DELETE"].forEach(function (ev) { ch.push({ event: ev, schema: "biodanza", table: tb }); }); });
        rtSend({ topic: TOPIC, event: "phx_join", ref: "1", payload: { config: { broadcast: { ack: false, self: false }, presence: { key: "" }, private: false, postgres_changes: ch }, access_token: tok } });
        rt.hb = setInterval(function () { rtSend({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(Date.now()) }); }, 25000);
        rt.tk = setInterval(function () { Promise.resolve(FLOA_AUTH.token()).then(function (tk) { rtSend({ topic: TOPIC, event: "access_token", payload: { access_token: tk }, ref: String(Date.now()) }); }, function () {}); }, 600000);
      }, function () { try { ws.close(); } catch (x) { /* closed */ } });
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.event === "phx_reply" && m.topic === TOPIC && m.ref === "1") { rt.on = !!(m.payload && m.payload.status === "ok"); if (rt.on) { rt.v = rt.i = true; rtFlush(); cur.id = ""; if (cur.want) curJoin(cur.want); } }   /* what was missed while the connection was closed, and the cursors' channel again */
      else if (m.event === "postgres_changes") rtChange(m.payload && m.payload.data && m.payload.data.table);
      else if (m.event === "broadcast" && cur.topic && m.topic === cur.topic) {   /* somebody's cursor */
        var pl = m.payload && m.payload.payload; if (!pl || !pl.email || pl.email === FLOA_AUTH.email().toLowerCase()) return;
        if (!pl.field) delete cur.peers[pl.email]; else cur.peers[pl.email] = { item: pl.item, field: pl.field, a: pl.a | 0, b: pl.b | 0, name: whoName(pl.email), at: Date.now() };
        paintGhosts();
      }
      else if (m.event === "system" && m.payload && m.payload.status === "error") rt.on = false;
    };
    ws.onclose = function () {
      clearInterval(rt.hb); clearInterval(rt.tk); rt.ws = null; rt.on = false;
      if (FLOA_AUTH.signedIn()) { setTimeout(startRealtime, rt.retry); rt.retry = Math.min(rt.retry * 2, 30000); }
    };
    ws.onerror = function () { try { ws.close(); } catch (x) { /* closed */ } };
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && state.me) { if (!rt.ws) startRealtime(); else { rt.v = rt.i = true; rtFlush(); } } });

  /* ---------- who is where: the others' cursors, as in a shared document ----------
     While I am in a text field, where my cursor is (and what I have selected) is sent, as numbers only, on a Realtime broadcast channel of this
     vivencia; everyone with the same exercise open sees a marker with my name at that place, and my selection coloured. Nothing of the text travels.
     A marker not renewed for a few seconds goes away. */
  var cur = { topic: "", id: "", want: "", peers: {}, last: 0, trail: 0, hb: 0 };
  function curSend(payload) {
    if (!cur.topic || !rt.ws) return;
    rtSend({ topic: cur.topic, event: "broadcast", ref: String(Date.now()), payload: { type: "broadcast", event: "cur", payload: payload } });
  }
  function curJoin(vivId) {
    cur.want = vivId;
    if (!rt.ws || rt.ws.readyState !== 1 || cur.id === vivId) return;
    if (cur.topic) rtSend({ topic: cur.topic, event: "phx_leave", ref: "c0", payload: {} });
    cur.id = vivId; cur.topic = "realtime:biodanza-cur:" + vivId; cur.peers = {};
    Promise.resolve(FLOA_AUTH.token()).then(function (tok) {
      rtSend({ topic: cur.topic, event: "phx_join", ref: "c1", payload: { config: { broadcast: { ack: false, self: false }, presence: { key: "" }, private: false, postgres_changes: [] }, access_token: tok } });
    }, function () { /* no markers this time */ });
  }
  function curLeave() { cur.want = ""; if (cur.topic && rt.ws) rtSend({ topic: cur.topic, event: "phx_leave", ref: "c0", payload: {} }); cur.topic = ""; cur.id = ""; cur.peers = {}; paintGhosts(); }
  function whoName(email) { var m = (state.members || []).filter(function (x) { return x.email === email; })[0]; return (m && m.note) || String(email || "").split("@")[0]; }
  function whoHue(email) { var h = 0; for (var i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) % 360; return h; }
  function curMine() {   /* my place, to everyone else */
    if (!liveItem || !liveItem.fld) return;
    var el = document.activeElement, k = Object.keys(liveItem.fld).filter(function (x) { return liveItem.fld[x] === el; })[0];
    if (!k || k === "title") return curSend({ item: liveItem.id, email: FLOA_AUTH.email().toLowerCase(), field: null });
    curSend({ item: liveItem.id, email: FLOA_AUTH.email().toLowerCase(), field: k, a: rtSel(el).a, b: rtSel(el).b });
  }
  function curThrottled() { var d = Date.now() - cur.last; clearTimeout(cur.trail); if (d >= 120) { cur.last = Date.now(); curMine(); } else cur.trail = setTimeout(function () { cur.last = Date.now(); curMine(); }, 120 - d); }
  function paintGhosts() {
    document.querySelectorAll(".bio-ghost").forEach(function (g) { g.dataset.keep = ""; });
    var now = Date.now();
    if (liveItem && liveItem.fld && liveItem.root.isConnected) {
      Object.keys(cur.peers).forEach(function (email) {
        var pr = cur.peers[email];
        if (now - pr.at > 6000) { delete cur.peers[email]; return; }
        if (pr.item !== liveItem.id || !pr.field || !liveItem.fld[pr.field]) return;
        var ta = liveItem.fld[pr.field], host = ta.parentElement, id = "g-" + email + "-" + pr.field, g = host.querySelector('[data-gid="' + id + '"]');
        if (!g) { g = document.createElement("div"); g.className = "bio-ghost"; g.dataset.gid = id; g.innerHTML = "<div></div>"; host.appendChild(g); }
        g.dataset.keep = "1";
        var cs = getComputedStyle(ta), inner = g.firstChild, hue = whoHue(email), len = rtWalk(ta, false).length, a = Math.min(pr.a, len), b = Math.min(pr.b, len);
        inner.style.cssText = "position:absolute;top:0;left:0;white-space:pre-wrap;overflow-wrap:anywhere;color:transparent;box-sizing:border-box;width:" + ta.clientWidth + "px;font:" + cs.font + ";letter-spacing:" + cs.letterSpacing + ";padding:" + cs.padding + ";direction:" + cs.direction + ";text-align:" + cs.textAlign + ";transform:translateY(" + (-ta.scrollTop) + "px)";
        inner.innerHTML = ta.innerHTML;
        var caret = document.createElement("span"); caret.className = "bio-caret"; caret.style.setProperty("--c", "hsl(" + hue + " 62% 38%)"); caret.innerHTML = "<i>" + esc(pr.name) + "</i>";
        if (a !== b) { try { var p1 = rtPoint(inner, a), p2 = rtPoint(inner, b), rg = document.createRange(); rg.setStart(p1[0], p1[1]); rg.setEnd(p2[0], p2[1]); var mk = document.createElement("mark"); mk.style.background = "hsl(" + hue + " 70% 78% / .75)"; rg.surroundContents(mk); } catch (x) { /* across several tags: the caret alone */ } }
        var pc = rtPoint(inner, b), rc = document.createRange(); rc.setStart(pc[0], pc[1]); rc.collapse(true); rc.insertNode(caret);
      });
    }
    document.querySelectorAll(".bio-ghost").forEach(function (g) { if (!g.dataset.keep) g.remove(); });
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-ghost { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2 } .bio-ghost mark { color: transparent; border-radius: 2px } .bio-caret { display: inline-block; width: 0; height: 1.1em; vertical-align: text-bottom; border-inline-start: 2px solid var(--c); position: relative } .bio-caret > i { position: absolute; bottom: 100%; inset-inline-start: -2px; padding: 0 5px; border-radius: 4px 4px 4px 0; background: var(--c); color: #fff; font: 600 11px/16px var(--font); font-style: normal; white-space: nowrap }";
    document.head.appendChild(st);
    setInterval(paintGhosts, 1500);   /* a marker that was not renewed goes */
    function inMyField() { var el = document.activeElement; return !!(liveItem && liveItem.fld && liveItem.root.isConnected && el && el.classList.contains("rf-rich") && ["poetics", "guidance", "notes"].some(function (k) { return liveItem.fld[k] === el; })); }
    setInterval(function () { if (cur.topic && inMyField()) curMine(); }, 2500);   /* standing still in a field is still being there */
    document.addEventListener("selectionchange", function () { if (cur.topic && inMyField()) curThrottled(); });
  })();

  /* ---------- start ---------- */
  /* No internet: the vivencias saved on this device, to see and play. Nothing is asked of the network, nothing is changed. */
  function startOffline() {
    if (state.offline) return;
    state.offline = true; document.documentElement.classList.add("bio-offline");
    /* back online: the app as usual, once the server really answers (the browser's own word that it is online is not enough to leave a page that works) */
    window.addEventListener("online", function () { FLOA_AUTH.api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function () { location.reload(); }, function () { /* still no connection */ }); });
    Promise.all([window.BioOffline ? BioOffline.list() : [], window.BioAudio && BioAudio.offline ? BioAudio.offline() : null]).then(function (r) {
      offlineRecs = {}; (r[0] || []).forEach(function (x) { offlineRecs[x.id] = x; });
      state.me = { allowed: true, admin: false };
      home();
    });
  }
  function start() {
    if (!FLOA_AUTH.signedIn()) return gate("כניסה למאפשרי ביודנסה", false);
    if (navigator.onLine === false) return startOffline();
    show('<div class="rlist"><div class="rskel rskel--title"></div></div>');
    /* kept copies on the device: the list shows at once, before the cloud has answered who this is (the cloud still decides: no permission, and the screen is replaced) */
    var localHome = false;
    if (window.BioOffline) BioOffline.ready.then(function () { return BioOffline.list(); }).then(function (recs) {
      if (state.me || !recs || !recs.length) return;
      var ad = false, su = false; try { ad = localStorage.getItem("biodanza.admin") === "1"; su = localStorage.getItem("biodanza.super") === "1"; } catch (x) { /* none */ }
      state.me = { allowed: true, admin: ad, super: su }; state.lines = state.lines || []; state.phases = state.phases || [];
      localHome = true; home();
    });
    api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function (me) {
      state.me = me; try { localStorage.setItem("biodanza.admin", me && me.admin ? "1" : "0"); localStorage.setItem("biodanza.super", me && me.super ? "1" : "0"); } catch (x) { /* none */ }
      if (!me || !me.allowed) return gate("לחשבון " + FLOA_AUTH.email() + " אין הרשאה להיכנס. אפשר לבקש מהמנהל להוסיף אותו.", true);
      return Promise.all([api("/rest/v1/lines?select=key,name_he&order=sort"), api("/rest/v1/phases?select=key,name_he&order=sort"), api("/rest/v1/levels?select=key,name_he&order=rank").catch(function () { return []; })]).then(function (r) { state.lines = r[0]; state.phases = r[1]; state.levels = r[2]; if (!localHome) home(); startRealtime(); setTimeout(restoreCatMobile, 700); api("/rest/v1/song_likes?select=music_id").then(function (ls) { likes = {}; (ls || []).forEach(function (x) { likes[x.music_id] = true; }); }, function () { /* no hearts this time */ });
        api("/rest/v1/vivencia_likes?select=vivencia_id").then(function (ls) { likesViv = {}; (ls || []).forEach(function (x) { likesViv[x.vivencia_id] = true; }); if (state.vivsLoaded) renderVivs(); }, function () { /* no hearts this time */ });
        api("/rest/v1/exercise_likes?select=exercise_id").then(function (ls) { likesEx = {}; (ls || []).forEach(function (x) { likesEx[x.exercise_id] = true; }); return api("/rest/v1/item_likes?select=item_id"); }).then(function (ls) { (ls || []).forEach(function (x) { likesEx["item:" + x.item_id] = true; }); }, function () { /* no hearts this time */ }); });
    }).catch(function (e) {
      console.error(e);
      if (e && !e.status && !e.signedOut) return startOffline();   /* no answer at all: the network is gone */
      gate("לא הצלחנו להתחבר. נסו שוב.", false);
    });
  }
  /* wide screen: drag the line between the list and the vivencia to change the width (arrows on the keyboard, double click resets); kept in this browser */
  (function () {
    var KEY = "biodanza_listw", h = document.getElementById("sh"), root = document.documentElement;
    function clampW(w) { return Math.round(Math.max(320, Math.min(w, window.innerWidth - 420))); }
    function curW() { return pl.getBoundingClientRect().width; }
    function setW(w) { root.style.setProperty("--listw", clampW(w) + "px"); }
    function save() { try { localStorage.setItem(KEY, String(Math.round(curW()))); } catch (e) { /* not kept */ } }
    var saved = null; try { saved = Number(localStorage.getItem(KEY)) || null; } catch (e) { /* none */ }
    if (saved) setW(saved);
    window.addEventListener("resize", function () { var w = parseFloat(root.style.getPropertyValue("--listw")); if (w) setW(w); });
    if (!h) return;
    var drag = false;
    h.addEventListener("pointerdown", function (e) { if (!wide() || e.button > 0) return; drag = true; h.setPointerCapture(e.pointerId); root.classList.add("split-drag"); e.preventDefault(); });
    h.addEventListener("pointermove", function (e) { if (drag) setW(window.innerWidth - e.clientX); });
    function end() { if (!drag) return; drag = false; root.classList.remove("split-drag"); save(); }
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
    h.addEventListener("dblclick", function () { root.style.removeProperty("--listw"); try { localStorage.removeItem(KEY); } catch (e) { /* none */ } });
    h.addEventListener("keydown", function (e) { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); setW(curW() + (e.key === "ArrowLeft" ? 24 : -24)); save(); });
  })();
  /* back and forward: show what the address says, without writing it again */
  window.addEventListener("popstate", function () {
    if (jump) {   /* our own history.go(): no screen change unless we asked for one */
      var j = jump; jump = null;
      if (!j.render) { if (j.then) j.then(); return; }
    } else {
      for (var i = layers.length - 1; i >= 0; i--) if (layers[i].own) { layers[i].own = false; closeLayer(layers[i].el); return; }   /* Back closes the top popup only */
      if (history.state && history.state.bk) { startJump(1, false); return; }   /* Forward onto the entry of a popup that is closed: step over it */
    }
    var lv = history.state && history.state.sub;   /* landed on a level without an address (see subEnter) */
    if (!lv) subKeep = {};
    else {
      Object.keys(subKeep).forEach(function (k) { if (+k > lv) delete subKeep[k]; });
      if (subKeep[lv]) { if (state.me) subKeep[lv](); }
      else startJump(1, false);   /* Forward onto a level that is closed: step over it */
      return;
    }
    if (!state.me) return;
    var u0 = parseUrl();
    if (!wide() && state.viv && u0.viv === state.viv.id && !u0.item && document.getElementById("list")) {   /* the exercise popup over this vivencia's list: closing it is all */
      var idlg = document.getElementById("itemDlg");
      layers.forEach(function (l) { if (l.el !== idlg) { l.own = false; if (l.el.id === "moreMenu") l.el.remove(); else if (l.el.open) l.el.close(); } });
      if (idlg && idlg.open) { idlg.__quiet = true; slideClose(idlg); }
      liveItem = null; stack().length = 0; stack().push(home, editor);
      loadItems().then(paint, fail);   /* what was changed inside is in the list */
      return;
    }
    layers.forEach(function (l) { l.own = false; if (l.el.__screen) l.el.__quiet = true; if (l.el.id !== "moreMenu" && l.el.open) l.el.close(); else if (l.el.id === "moreMenu") l.el.remove(); });
    var u = parseUrl(); popping = true;
    try {
      stack().length = 0;
      if (!u.viv) { if (wide()) homeWide(); else home(); }
      else { if (!wide()) stack().push(home); pending = u.item ? { item: u.item } : null; openViv(u.viv); }
    } finally { popping = false; }
  });
  pending = parseUrl().viv ? parseUrl() : null;
  history.replaceState({ d: 0 }, "", pending ? BASE : location.pathname + location.search);   /* an exercise's own address is entered as home, then the vivencia, then the exercise: Back walks them up */
  new MutationObserver(syncLayers).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open"] });
  start();
})();
