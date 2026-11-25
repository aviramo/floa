/* Biodanza: a facilitator builds a vivencia, plans it along the curve, plays it in the session.
   Built ONLY from the kit's elements (/kit.css): rhead, rlist, rrow, rcard, rbtn, rchip, rfield, rempty, rmsg, rfab.
   Data: schema `biodanza` (apps/biodanza/schema.sql), through FLOA_AUTH.api. Row level security decides who sees what. */
(function () {
  "use strict";
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  /* Every vivencia and every exercise has an address of its own, in the path (no # in the bar): /<vivencia> and /<vivencia>/<exercise>.
     On localhost the app lives under /biodanza/, so the same addresses carry that prefix there. */
  var BASE = /^(localhost|127[.]|192[.]168[.]|10[.])/.test(location.hostname) ? "/biodanza/" : "/";
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
    var j = jump = { render: render, then: null, at: performance.now() };
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
    var live = [].slice.call(document.querySelectorAll("dialog[open], #moreMenu")).concat(window.__leftLive ? window.__leftLive() : []);   /* the side layers (history, lists, pickers) are layers too */
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
  function closeLayer(el) { if (el.classList && el.classList.contains("bio-left")) { window.__leftClose(el); return; } if (el.id === "moreMenu") el.remove(); else slideClose(el); }
  function parseUrl() { var seg = location.pathname.slice(BASE.length).split("/").filter(Boolean); return { viv: seg[0] || "", item: seg[1] || "" }; }
  function wide() { return window.matchMedia("(min-width: 760px)").matches; }
  /* LAW 7 (declared waits only): an action whose result is on the element itself calls busy(el, promise) at the one place that performs it. The element shows aria-busy (drawn in
     kit.css by its kind) until the promise answers or fails. Nothing is guessed by time or by "what was pressed": opening a window, a menu, a setting or a screen never calls it
     (the content inside shows its own skeleton, rskel). */
  function busy(el, p) {
    if (!el || !p || !p.then) return p;
    el.__busy = (el.__busy || 0) + 1; el.setAttribute("aria-busy", "true");
    var done = false, rel = function () { if (done) return; done = true; if (--el.__busy <= 0) { el.__busy = 0; if (!el.__aw) el.removeAttribute("aria-busy"); } };
    p.then(rel, rel); return p;
  }
  var api = function (p, o) { return rawApi(p, o); };
  var rawApi = function (p, o) {
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
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
    me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
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
    curve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path pathLength="1" d="M2 16c2.5-9 5-9 7.5-1s5 8 7.5 0c1-3 2.500-5 5-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    yt: '<svg viewBox="0 0 24 24" stroke="none" aria-hidden="true" style="width:var(--icon-brand);height:var(--icon-brand)"><rect x="1" y="5" width="22" height="14" rx="4.500" fill="currentColor"/><path d="M10 9l5.500 3-5.500 3z" style="fill:var(--page)"/></svg>',   /* the YouTube mark: a song with no file of its own opens on YouTube, and the tile says so */
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.500 4.500L19 7"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/></svg>'
  };
  I.trash = I.x;   /* no bins anywhere: a removal is the same cross everywhere */

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
          if (c.hasAttribute("data-mention")) { put("@" + c.textContent, b); continue; }   /* a leader chip is kept as @name and drawn as a chip without the @ */
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
  function rtKeep(el, v) {   /* new words in a box I am standing in: the cursor stays at the same place in the text, not at the start */
    var on = el === document.activeElement, sel = on ? rtSel(el) : null;
    el.value = v;
    if (!on || !sel) return;
    try { var a = rtPoint(el, sel.a), b = rtPoint(el, sel.b), rg = document.createRange(); rg.setStart(a[0], a[1]); rg.setEnd(b[0], b[1]); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (x) { /* no caret */ }
  }
  function rtInit(el) {   /* a box that answers like a textarea: .value */
    el.addEventListener("input", function () { el._typed = Date.now(); });
    function mark() { if (el.parentElement) el.parentElement.dataset.rf = el.textContent ? "v" : "e"; }
    Object.defineProperty(el, "value", { configurable: true, get: function () { return rtWalk(el, true); }, set: function (v) { el.innerHTML = rtHtml(v); mark(); } });
    (function () { var lb = el.parentElement && el.parentElement.firstElementChild; if (lb && lb !== el) lb.style.transition = "none"; mark(); if (lb && lb !== el) requestAnimationFrame(function () { requestAnimationFrame(function () { lb.style.transition = ""; }); }); })();   /* the first state is set without motion: a label that is drawn must not slide into place */
    el.addEventListener("input", mark);
    el.addEventListener("beforeinput", function (e) { if (e.inputType === "insertParagraph") { e.preventDefault(); document.execCommand("insertLineBreak"); } });
    el.addEventListener("paste", function (e) { e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain")); });
    el.addEventListener("blur", function () { el.dispatchEvent(new Event("change")); });
  }
  /* a selection in any text box that can be written in: a small button under it makes the words bold (a phone has no Ctrl+B); the box already keeps bold as ** */
  (function () {
    var btn = null, T = 0;
    function hide() { if (btn) { btn.remove(); btn = null; } }
    function show() {
      var sel = window.getSelection(), box = sel && sel.rangeCount && !sel.isCollapsed && sel.anchorNode ? (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement) : null;
      box = box && box.closest && box.closest('.rf-rich[contenteditable="true"]');
      if (!box || !box.contains(sel.focusNode)) return hide();
      var r = sel.getRangeAt(0).getBoundingClientRect(); if (!r.width && !r.height) return hide();
      if (!btn) {
        btn = document.createElement("button"); btn.type = "button"; btn.className = "rbtn rbtn--icon"; btn.setAttribute("aria-label", "הדגשה"); btn.title = "הדגשה";
        btn.style.cssText = "position:fixed;z-index:var(--z-menu);width:var(--ctl);height:var(--ctl);min-height:var(--ctl);padding:0;border-radius:999px;background:var(--primary);border-color:var(--primary);color:var(--on-primary);font:var(--fw-bold) var(--fs-m)/1 var(--font)";
        btn.textContent = "B";
        btn.addEventListener("pointerdown", function (e) { e.preventDefault(); });   /* the selection stays */
        btn.addEventListener("click", function (e) { e.preventDefault(); document.execCommand("bold"); box.dispatchEvent(new Event("input", { bubbles: true })); show(); });
        document.body.appendChild(btn);
      }
      var w = btn.offsetWidth || 36;
      btn.style.top = Math.round(r.bottom + 10) + "px"; btn.style.left = Math.max(8, Math.min(Math.round(r.left + r.width / 2 - w / 2), window.innerWidth - w - 8)) + "px";
    }
    document.addEventListener("selectionchange", function () { clearTimeout(T); T = setTimeout(show, 80); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") hide(); });
    window.addEventListener("scroll", hide, true);
  })();
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
  function fzs(text, q) { return fzsF(fold(text), q); }
  function fzsF(h, q) {   /* the same, for a text that is already folded (the exercises' texts are folded once, when they load) */
    var words = fold(q).split(/\s+/).filter(Boolean), toks = fzTok(h), sum = 0, k, s;
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
  function catName(k) { var c = (state.cats || []).filter(function (x) { return x.key === k; })[0]; return c ? c.name_he : ""; }
  /* under the name of a catalog exercise: the catalog it comes from (one; the older first), HEB when it is in Hebrew there, and the note with how many songs are linked */
  /* on a song of the catalog: the curve sign and, at its right, how many catalog exercises the song is linked to (read once, page by page) */
  var exCnt = null, exCntP = null;
  function ensureExCnt() {
    if (exCnt || exCntP) return exCntP || Promise.resolve();
    var all = {};
    function page(off) { return api("/rest/v1/exercise_music?select=music_id&order=music_id&limit=1000&offset=" + off).then(function (rows) { rows = rows || []; rows.forEach(function (x) { all[x.music_id] = (all[x.music_id] || 0) + 1; }); return rows.length === 1000 ? page(off + 1000) : null; }); }
    exCntP = page(0).then(function () { exCnt = all; paintExCnt(); }, function () { exCntP = null; });
    return exCntP;
  }
  function paintExCnt() { if (!exCnt) return; [].forEach.call(document.querySelectorAll("[data-exn]"), function (n) { var v = exCnt[n.dataset.exn] || 0; if (n.textContent !== String(v)) n.textContent = v; if (v === 0) n.setAttribute("data-zero", ""); else n.removeAttribute("data-zero"); n.closest("button").setAttribute("aria-label", v + " תרגילים"); }); }
  /* law 6, ONE place: a SHORT window (a confirm, or a size "s" popup) opens next to the control that opened it. The last pressed control is remembered here, and every short RosterSheet.render
     that was not given an anchor gets it; a long window (size "l", editors, the catalog) is left as it is. A press inside a menu keeps the control that opened the menu as the opener (the menu itself is gone when the window opens). A caller may still pass its own anchor. */
  var lastPress = null;
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest(".rmenu")) return; var t = e.target && e.target.closest ? e.target.closest("button, a, [role=button], [data-audio], .bio-card, .rrow, input") : null; if (t) lastPress = t; }, true);
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".rmenu")) return; var t = e.target && e.target.closest ? e.target.closest("button, a, [role=button], [data-audio], .bio-card, .rrow, input") : null; if (t) lastPress = t; }, true);   /* a key press or a script click is a click too */
  (function () {
    var R = window.RosterSheet; if (!R || R.__anchored) return; var render = R.render;
    R.render = function (dlg, o) { if (o && !o.anchor && (o.kind === "confirm" || o.size === "s") && lastPress && lastPress.isConnected) o.anchor = lastPress; return render.apply(this, arguments); };
    R.__anchored = true;
  })();
  function btnTail(content, attrs) {   /* law 10, the ONE builder: a counter (text) or a status mark (a svg) as the tail of an icon button; nothing to say, nothing rendered */
    return content === "" || content == null ? "" : '<span class="rbtn__tail"' + (attrs ? " " + attrs : "") + '>' + content + '</span>';
  }
  function exBtnInner(mid) {
    ensureExCnt();
    return I.curve + '<span class="rbtn__tail" data-exn="' + esc(mid) + '"' + (exCnt && !exCnt[mid] ? ' data-zero' : '') + '>' + (exCnt ? (exCnt[mid] || 0) : "") + '</span>';   /* filled in by paintExCnt; empty (unknown yet) or zero: the button is not shown */
  }
  function exBtnG(m) {   /* the curve sign and the count, on any song card: it narrows the catalog's exercises to the song's */
    if (!m || !m.id || /^h[0-9]/.test(m.id)) return "";
    return '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-mfxg="' + esc(m.id) + '" data-mfxn="' + esc(songName(m)) + '" aria-label="התרגילים של המוזיקה" title="התרגילים של המוזיקה בקטלוג">' + exBtnInner(m.id) + '</button>';
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-mfxg]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    setExFilter({ id: b.dataset.mfxg, title: b.dataset.mfxn || "", name: b.dataset.mfxn || "" });
  }, true);
  function exSubHtml(e) {
    var src = String(e.source || ""), y = (src.match(/(d{4})/) || [])[1], label = y || src.toUpperCase();
    var heb = (e.exercise_texts || []).some(function (t) { return t.lang === "he" && t.source === "catalog"; });
    var c = e && e.exercise_music && e.exercise_music[0] ? e.exercise_music[0].count : null;
    var note = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none;width:var(--icon);height:var(--icon);stroke-width:var(--icon-w)"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
    if (!label && !c) return "";   /* nothing to say: the second row is not written */
    return '<span style="display:inline-flex;align-items:center;gap:var(--gap);font-variant-numeric:tabular-nums">' + (label ? '<span dir="ltr">' + esc(label) + (heb ? ' HEB' : '') + '</span>' : '') + (!c ? '' : '<span style="display:inline-flex;align-items:center;gap:var(--gap-tight)" aria-label="' + c + ' מוסיקות">' + note + '<span>' + c + '</span></span>') + '</span>';
  }
  /* a song is two things: its name and who plays it */
  function songName(m) { return m ? (m.title || m.name || "") : ""; }
  function songBy(m) { return m ? (m.artist || "") : ""; }
  function canEdit() { return !state.offline && (!state.viv || (state.viv.role !== "view" && state.viv.role !== "public")); }   /* a share for viewing changes nothing; the database enforces it too */
  /* the same button wherever a song is shown: it searches the song and its artist on YouTube, in a new tab */
  /* the YouTube button of the song played last is red, the others are muted (kept in this browser, so it is still marked tomorrow) */
  var played = (function () { try { return localStorage.getItem("biodanza.played") || ""; } catch (e) { return ""; } })();
  function ytColor(id) { return id && id === played ? "var(--danger)" : "var(--text-muted)"; }
  function ytLink(m, trail) {
    return '<a class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-yt="' + esc(m.id || "") + '" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((songName(m) + " " + songBy(m)).trim()) + '" target="_blank" rel="noopener" aria-label="ניגון ביוטיוב" title="ניגון ביוטיוב" style="color:' + ytColor(m.id) + '">' + I.yt + '</a>';
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
      '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-upl="' + esc(m.id) + '" aria-label="העלאת קובץ" title="העלאת קובץ שיחליף את היוטיוב" style="color:var(--text-muted)">' + I.upload + '</button>' + ytLink(m, trail) + '</span>';
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
    return '<span style="display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font)">' + esc(songName(m)) + '</span>' +
      (songBy(m) ? '<span style="display:block;color:var(--text-muted);font:var(--fw-regular) var(--fs-s)/var(--lh-tight) var(--font);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(songBy(m)) + '</span>' : '');
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
    st.textContent = ".rskel { margin: 0 } :is(.rlist, #pkl, #pks):has(> .rskel) { display: flex; flex-direction: column; gap: var(--gap); padding: var(--gap) } .rempty:only-child { margin: 0 } :is(#pd, .catprev):has(> .rempty:only-child) { justify-content: center } .rhead .rbtn--icon.rbtn--primary, dialog .sheet-head .rbtn--icon.rbtn--primary { background: transparent; border-color: transparent; color: var(--primary) }   /* law 15: a header holds icon buttons only, the primary action is one in the role colour, not a filled one */              /* the content is whole and sits on the bottom edge: opening pulls it down, its last line shows first */   #songInfoDlg .sheet-foot { flex-direction: column; align-items: stretch } #songInfoDlg .sheet-foot > .rbtn { width: 100%; flex: 0 0 auto } #songInfoDlg #sisim { background: transparent; border-color: transparent; color: var(--primary) } :root { --bar-top: var(--gap); --bar-gap: var(--gap); --dockfull: calc(var(--fab) + var(--gap) * 2 + var(--inset-b)); --dockh: var(--inset-b) } html.bio-docked { --dockh: var(--dockfull) } html.bio-docked body { box-sizing: border-box; padding-bottom: var(--dockh) } html.bio-docked .rfab:not(.rfab--in) { bottom: calc(var(--gap) + var(--dockh)) } html.bio-docked .rmsg--toast { bottom: calc(var(--gap) + var(--dockh)) !important } " +
      ".bio-dock { position: fixed; top: auto; left: 0; right: 0; bottom: 0; height: auto; max-height: none; inset: auto 0 0 0; align-content: flex-start; margin: 0; width: auto; max-width: none; box-sizing: border-box; min-height: calc(var(--fab) + var(--gap) * 2 + var(--inset-b)); display: flex; align-items: center; gap: var(--gap); padding: var(--gap) var(--gap) calc(var(--gap) + var(--inset-b)); overflow: visible; color: var(--text); background: var(--surface); border: 0; border-top: var(--bw) solid var(--border); border-radius: 0; z-index: var(--z-sticky); } " +   /* a square footer across the bottom: the page ends above it, the add button and the toasts sit above it */
      "@media (min-width: 760px) { .rfab[data-act=\"swap\"] { left: auto !important; right: calc(var(--listw) + var(--gap)) !important; bottom: calc(var(--gap) + var(--dockh)) !important } } .bio-dock:not(.on), .bio-dock.closed { display: none } .bio-dock.away { opacity: 0; pointer-events: none } " +
      ".bio-dock__x:focus, .bio-dock__x:focus-visible { outline: none } .bio-dock .bio-vol { margin: 0 } @media (width < 760px) { .bio-dock .bio-vol, .bio-dock .bio-volume { display: none !important } } .bio-volume { flex: none; display: flex; align-items: center; gap: var(--gap-tight); --c: var(--primary) } .bio-volume input { width: var(--volume-w) } .bio-volume { direction: ltr } .bio-volume > .rbtn > svg { width: var(--icon); height: var(--icon) } .bio-dock__x { flex: none; display: grid; place-items: center; width: var(--icon); height: var(--ctl); padding: 0; border: 0; border-radius: var(--r); background: transparent; color: var(--text-muted); cursor: pointer } .bio-dock__x > svg { width: var(--icon); height: var(--icon); stroke-width: var(--icon-w) } .bio-dock.idle .bio-dock__x { display: none } " +
      "@media (min-width: 760px) { .bio-dock > .bio-volume { order: 1 } .bio-dock > .bio-dock__time { order: 2 } .bio-dock > .ricon-lg:first-child { order: 3 } .bio-dock > .bio-dockbar, .bio-dock > .bio-dock__name, .bio-dock > .bio-dock__sync, .bio-dock > [data-dockmore] { order: 4 } } .bio-dock [data-addcur][hidden], .bio-dock .bio-dock__sync[hidden] { display: none } .bio-dock > .bio-dock__cat { display: none !important }  .bio-dock .rbtn > svg { width: var(--icon); height: var(--icon) } @media (min-width: 760px) { html.bio-docked #addMusDlg, html.bio-docked #histDlg { inset-block-end: var(--dockfull); max-height: calc(100dvh - var(--dockfull) - 48px) } html.bio-docked #addMusDlg #amlist { padding-bottom: var(--gap) } html.bio-docked #histDlg .sheet-body { padding-bottom: var(--gap) } } .bio-card .rchip[data-fac] { font-size: var(--fs-s); min-height: 0; padding-block: 0 } .bio-card .rchip[data-fac][aria-pressed=\"true\"] { background: var(--surface); color: var(--text); border-color: var(--surface) } #pl { position: relative }    #pd { position: relative } #pd::after { content: \"\"; position: absolute; inset: 0; z-index: 5; background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity var(--t-base) var(--ease) } #pd.bio-dim::after { opacity: 1; pointer-events: auto } @media (prefers-reduced-motion: reduce) { #pd::after { transition: none } } * { scrollbar-width: none } *::-webkit-scrollbar { display: none } .bio-card[aria-current=\"true\"] { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary), var(--shadow) } @media (width < 760px) { .bio-card[aria-current=\"true\"]:not([data-opt]) { border-color: var(--border); box-shadow: var(--shadow) } } .rrow[aria-current=\"true\"] { box-shadow: inset 3px 0 0 var(--primary) } .bio-card:has([data-audio][data-st=\"pause\"])[aria-current] { box-shadow: var(--shadow) } .bio-card [data-audio] svg { width: var(--icon) !important; height: var(--icon) !important } [data-opt] [data-audio] svg, [data-am] [data-audio] svg { width: var(--icon) !important; height: var(--icon) !important } .bio-dock > .rbtn:first-child:not(:disabled) { background: var(--primary); border-color: var(--primary); color: var(--on-primary) } .bio-dock.playing > .rbtn:first-child:not(:disabled) { color: var(--surface) }  " +
      ".bio-dock .bio-dockbar { flex: 1 1 8rem; min-width: 0; padding: 0; touch-action: none } .bio-dock .bio-dockbar .bio-dock__bar { width: 100%; display: block; direction: ltr } .bio-dock .bio-dockbar input::-webkit-slider-runnable-track { background: linear-gradient(to right, var(--c) var(--p), var(--track, var(--on-primary)) var(--p)) } .bio-dock .bio-dockbar input::-moz-range-track { background: var(--track, var(--on-primary)) } " +
      ".bio-dock .bio-dock__time { color: var(--text) !important } .bio-dock__name { cursor: pointer; flex: 0 1 auto; min-width: 0; max-width: var(--w); direction: ltr; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .bio-dock__name span { color: var(--text-muted) } .bio-dock__name[data-edit] { cursor: pointer } .bio-dock .bio-dock__cat { background: var(--surface); color: var(--text); border-color: var(--surface) } .bio-dock .bio-dock__cat[aria-pressed=\"true\"] { background: var(--primary); color: var(--on-primary); border-color: var(--primary) } .bio-dock__name { display: flex; flex-direction: column; gap: var(--gap-tight); line-height: 1.25 } .bio-dock__name b, .bio-dock__name span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis } " +
      "@media (width < 760px) { .bio-dock { flex-wrap: wrap } .bio-dock__name { flex: 1 1 100%; order: 4 } .bio-dock .bio-dockbar { flex: 0 0 100%; order: 3 }  } " +
      ".bio-dock .bio-dock__rst { flex: none; padding: 0; background: transparent; border-color: transparent; color: var(--text-muted); box-shadow: none } .bio-dock__time { flex: none; text-align: center; font: var(--fw-bold) var(--fs-s)/1 var(--font); font-variant-numeric: tabular-nums } " +
      ".bio-dock__bar { flex: 1 1 0; width: auto; max-width: none; min-width: 0; display: block; margin: 0; padding: 0; direction: ltr; accent-color: var(--primary); touch-action: none } " +
      ".bio-dock__none { flex: 1 1 auto; min-width: 0; text-align: center; color: var(--text-muted); font: var(--fw-regular) var(--fs-s)/1.2 var(--font) } " +
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
    function playName(n, t, a) {   /* a song of the history plays as its own button would play it */
      if (!n) return;
      if (window.BioAudio && BioAudio.info) BioAudio.info(n, t, a);
      var tb = document.createElement("button"); tb.dataset.audio = n; tb.style.display = "none"; document.body.appendChild(tb); tb.click(); tb.remove();
    }
    function histSkeleton() {   /* law 7: the history opens at once, with a skeleton where the songs will be; the songs come in when they have arrived */
      var sk = '<div class="rlist"><div class="rskel rskel--title"></div></div>';
      if (wide()) {
        if (leftStack.length) closeLeftAll();
        var el = openLeft(); el._rows = []; el._skel = true;
        el.innerHTML = head("היסטוריית האזנה", "", true, "") + sk;
        var hb = el.querySelector('[data-act="back"]'); if (hb) { hb.innerHTML = I.x; hb.setAttribute("aria-label", "סגירה"); hb.title = "סגירה"; hb.addEventListener("click", closeHist); }
        showLeftEl(el);
      } else {
        var dlg = document.getElementById("histDlg");
        if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "histDlg"; document.body.appendChild(dlg); }
        RosterSheet.render(dlg, { title: "היסטוריית האזנה", from: "bottom", size: "l", body: sk });
      }
    }
    function openHistory() {
      histSkeleton();
      var local = function () { try { return JSON.parse(localStorage.getItem("biodanza.history") || "[]") || []; } catch (x) { return []; } };
      var fromDb = api("/rest/v1/listen_history?select=audio_object,title,artist,played_at&order=played_at.desc&limit=120").then(function (rows) {
        return (rows || []).map(function (r) { return { n: r.audio_object, t: r.title, a: r.artist, at: Date.parse(r.played_at) }; });
      });
      var waited = new Promise(function (res) { setTimeout(function () { res(null); }, 2500); });
      Promise.race([fromDb, waited]).then(function (rows) { renderHistory(rows || local()); }, function () { renderHistory(local()); });
    }
    /* wide screen: the history is a layer that comes in from the left, as the catalog comes in from the right; its songs are cards in the same grid as any music */
    var histLayer = null, histOpen = false, leftStack = [];   /* leftStack: the open side layers, the top last */
    (function () { var st = document.createElement("style"); st.textContent = ".bio-left { position: fixed; z-index: var(--z-menu); display: flex; flex-direction: column; min-height: 0; visibility: hidden; transform: translateX(-100%); transition: transform var(--t-base) var(--ease), visibility 0s linear var(--t-base); box-shadow: 1px 0 0 var(--border) } .bio-left.is-open { visibility: visible; transform: none; transition: transform var(--t-base) var(--ease), visibility 0s } .bio-left > .rlist { flex: 1 1 auto; min-height: 0 } .bio-left.bio-under, .bio-catlayer.bio-under { opacity: 0; transition: none; pointer-events: none } #pl::after { content: \"\"; position: absolute; inset: 0; z-index: 5; background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity var(--t-base) var(--ease) } #pl.bio-dim::after { opacity: 1; pointer-events: auto } @media (prefers-reduced-motion: reduce) { .bio-left, #pl::after { transition: none } }"; document.head.appendChild(st); })();
    function placeHist() { var a = pd.getBoundingClientRect(); [histLayer].concat(leftStack).forEach(function (el) { if (!el) return; el.style.top = a.top + "px"; el.style.height = a.height + "px"; el.style.left = a.left + "px"; el.style.width = a.width + "px"; }); }
    /* THE SIDE LAYERS (law 8): ONE stack. A layer opened from a layer goes on top of it, same place and size; the one under is kept exactly as it is (its DOM, scroll, search, mark), only hidden and inert. Closing the top one shows the one under. The first layer is #histLayer; the catalog, when it is open, is covered the same way. */
    var catCovered = false;
    function under(el, on) { el.classList.toggle("bio-under", on); if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); }
    function ensureLeft() {
      if (histLayer) return;
      histLayer = document.createElement("div"); histLayer.id = "histLayer"; histLayer.className = "bio-left"; histLayer.style.background = getComputedStyle(document.body).backgroundColor;
      document.body.appendChild(histLayer);
      window.addEventListener("resize", placeHist); if (window.ResizeObserver) new ResizeObserver(placeHist).observe(pd);
      histLayer.addEventListener("click", function (ev) {
        var c = ev.target.closest && ev.target.closest("[data-hi]"); if (!c) return;
        var e = histLayer._rows && histLayer._rows[+c.dataset.hi]; if (!e) return;
        histLayer.querySelectorAll("[data-hi][aria-current]").forEach(function (x) { x.removeAttribute("aria-current"); });   /* it stays open: the song that plays is the marked one */
        c.setAttribute("aria-current", "true"); playName(e.n, e.t, e.a);
      });
      pl.addEventListener("click", function () { if (histOpen && pl.classList.contains("bio-dim")) closeHist(); });   /* a tap on the dark side closes the top layer */
      document.addEventListener("keydown", function (e) {   /* Escape closes the top layer only; a popup or a menu over it takes the key first */
        if (e.key !== "Escape" || e.defaultPrevented || !leftStack.length || document.querySelector("dialog[open], #moreMenu")) return;
        e.preventDefault(); closeHist();
      }, true);
    }
    function openLeft() {   /* the layer to draw into: the first one, or a new one on top of the open ones */
      ensureLeft(); var el;
      if (!leftStack.length) {
        el = histLayer; under(el, false); leftStack = [el]; histOpen = true; pl.classList.add("bio-dim");
        if (catPanel && catLayer) { under(catLayer, true); catCovered = true; }
      } else {
        under(leftStack[leftStack.length - 1], true);
        el = document.createElement("div"); el.className = "bio-left"; el.style.background = histLayer.style.background; document.body.appendChild(el); leftStack.push(el);
      }
      return el;
    }
    function showLeftEl(el) { placeHist(); requestAnimationFrame(function () { if (leftStack.indexOf(el) >= 0) el.classList.add("is-open"); }); syncLayers(); }   /* a layer closed before its first frame never opens: no panel is left on the screen without its overlay */
    function popLeft(quiet) {
      var el = leftStack.pop(); if (!el) return;
      el.classList.remove("is-open");
      if (el !== histLayer) setTimeout(function () { el.remove(); }, 400);
      if (leftStack.length) under(leftStack[leftStack.length - 1], false);
      else { histOpen = false; pl.classList.remove("bio-dim"); under(el, false); if (catCovered) { catCovered = false; if (catLayer) under(catLayer, false); } }
      if (!quiet) syncLayers();
    }
    function closeHist() { popLeft(); }
    function closeLeftAll() { if (!leftStack.length) return; while (leftStack.length) popLeft(true); syncLayers(); }
    window.__closeHist = closeHist; window.__closeLeftAll = closeLeftAll;
    window.__leftLive = function () { return leftStack.slice(); };
    window.__leftClose = function (el) { var i = leftStack.indexOf(el); if (i < 0) return; while (leftStack.length > i) popLeft(true); syncLayers(); };
    window.__showLeft = function (html, wire) {   /* any list on the left side as a popup: from a layer it opens on top of it, never in its place */
      var el = openLeft();
      el._rows = []; el.innerHTML = html;
      var bk = el.querySelector('[data-act="back"]'); if (bk) { bk.innerHTML = I.x; bk.setAttribute("aria-label", "סגירה"); bk.title = "סגירה"; }   /* a popup that comes from the left closes with a cross, not an arrow */
      showLeftEl(el);
      if (wire) wire(el);
      return el;
    };
    function showHistLayer(rows, when) {
      var el;
      if (leftStack.length === 1 && leftStack[0]._skel) { el = leftStack[0]; el._skel = false; }   /* the skeleton that opened at the press is filled */
      else { closeLeftAll(); el = openLeft(); }   /* the history is drawn again from the start */
      el._rows = rows;
      var nw = window.__bioNow || {};
      var cards = rows.map(function (e, i) {
        var rid = histIds[e.n], m = { id: rid || "h" + i, audio_object: e.n, title: e.t, name: e.t, artist: e.a };
        return songCardUi(m, { act: exBtnG(m) + (rid ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(rid) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : ''), attrs: 'data-hi="' + i + '" role="button" tabindex="0"', selected: !!(nw.name && nw.name === e.n), title: e.t || "מוסיקה", by: [e.a || "", when(e.at)].filter(Boolean).join(" · "), pill: cardPill(m) });
      }).join("");
      el.innerHTML = head("היסטוריית האזנה", "", true, "") + '<div class="rlist">' + (rows.length ? cardGrid(cards) : ph("אין עדיין היסטוריה", "מוסיקה שהתחלתם להשמיע תופיע כאן")) + '</div>';
      var hb = el.querySelector('[data-act="back"]'); if (hb) { hb.innerHTML = I.x; hb.setAttribute("aria-label", "סגירה"); hb.title = "סגירה"; hb.addEventListener("click", closeHist); }
      showLeftEl(el);
    }
    var histIds = {};   /* the music row of each song in the history, by its file: the heart and the plus need it */
    function renderHistory(h) {
      var seen = {}, names = []; (h || []).forEach(function (e) { if (e && e.n && !seen[e.n]) { seen[e.n] = 1; if (!histIds[e.n]) names.push(e.n); } });
      names = names.slice(0, 120);
      if (!names.length || !window.FLOA_AUTH) { renderHistory2(h); return; }
      var inList = names.map(function (n) { return '"' + String(n).split('\\').join('\\\\').split('"').join('\\"') + '"'; }).join(",");
      var done = false, go = function () { if (done) return; done = true; renderHistory2(h); };
      setTimeout(go, 1500);
      api("/rest/v1/music?audio_object=in.(" + encodeURIComponent(inList) + ")&select=id,audio_object&limit=500").then(function (rs) { (rs || []).forEach(function (x) { histIds[x.audio_object] = x.id; }); go(); }, go);
    }
    function renderHistory2(h) {
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
      var nw = window.__bioNow || {};
      var cards = rows.map(function (e, i) {   /* the same song card as in every list: a tap plays, the heart, the exercises of the song and the plus; no play button, no frame */
        var rid = histIds[e.n], m = { id: rid || "h" + i, audio_object: e.n, title: e.t, name: e.t, artist: e.a };
        return songCardUi(m, { act: exBtnG(m) + (rid ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(rid) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : ''), attrs: 'data-hi="' + i + '" role="button" tabindex="0"', selected: !!(nw.name && nw.name === e.n), title: e.t || "מוסיקה", by: [e.a || "", when(e.at)].filter(Boolean).join(" · "), pill: cardPill(m) });
      }).join("");
      RosterSheet.render(dlg, { title: "היסטוריית האזנה", from: "bottom", size: "l",
        body: '<div style="padding:0 0 var(--gap)">' + (rows.length ? '<div class="rgrid">' + cards + '</div>' : ph("אין עדיין היסטוריה", "מוסיקה שהתחילה להתנגן תופיע כאן")) + '</div>' });
      dlg.onclick = function (ev) {
        var c = ev.target.closest && ev.target.closest("[data-hi]"); if (!c) return;
        var e = rows[+c.dataset.hi]; if (!e) return;
        dlg.querySelectorAll("[data-hi][aria-current]").forEach(function (x) { x.removeAttribute("aria-current"); });   /* the popup stays open: the song that plays is the marked one */
        c.setAttribute("aria-current", "true"); playName(e.n, e.t, e.a);
      };
    }
    document.addEventListener("click", function (ev) { var dm = ev.target.closest && ev.target.closest("[data-dockmore]"); if (!dm) return; var cnt = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }).length; }; menu(dm, [{ label: "קטלוג תרגילים", icon: I.catalog, fn: function () { openCatalog("ex"); } }, { label: "קטלוג מוזיקות", icon: I.play, fn: function () { openCatalog("mu"); } }, { label: "היסטוריה", icon: HIST, fn: function () { if (wide() && histOpen) closeLeftAll(); else openHistory(); } }].concat(state.offline ? [] : [{ label: "ויוונסיות שאהבתי", meta: String(cnt(likesViv)), icon: I.heart, fn: function () { likedVivScreen(); } }, { label: "תרגילים שאהבתי", meta: String(cnt(likesEx)), icon: I.heart, fn: function () { likedExScreen(); } }, { label: "מוסיקה שאהבתי", meta: String(cnt(likes)), icon: I.heart, fn: function () { likedScreen(); } }]).concat(state.me && state.me.admin ? [{ label: "ניהול משתמשים", icon: I.users, fn: allowPopup }] : []).concat(window.FLOA_AUTH && FLOA_AUTH.signedIn() ? [{ label: "יציאה", icon: I.out, fn: function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); } }] : []), { up: true, ref: dm.closest(".bio-dock") }); });
    document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-hist]"); if (b) { if (wide() && histOpen) closeLeftAll(); else openHistory(); } });
    document.addEventListener("click", function (ev) {   /* a tap on the name in the player: a popup with the whole name and the performer; a song outside the catalog can be edited from it */
      var nmEl = ev.target.closest && ev.target.closest(".bio-dock__name"); if (!nmEl) return;
      var who = nmEl.dataset.who, ttl = loaded ? curTitle : (last && last.t) || "", art = loaded ? curArtist : (last && last.a) || "", eid = nmEl.getAttribute("data-edit");
      if (!ttl && !art) return;
      var acb = dock.querySelector("[data-addcur]"), canAdd = !!acb && !acb.hidden, addTo = canAdd ? ((acb.querySelector("[data-addcur-label]") || {}).textContent || "") : "";   /* a phone: adding the song that plays is here, not in the player */
      var headH = '<div class="rmenu__head"><div dir="auto" style="font:var(--fw-bold) var(--fs-m)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(ttl) + '</div>' + (art ? '<div dir="auto" style="margin-top:0;color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(art) + '</div>' : '') + songTimeHtml() + '</div>';
      if (wide()) {   /* a computer: a menu that comes out of the name, upwards */
        var openMenu = function (sn) {
        var mi = (who ? [{ label: simLabel(sn), ghost: true, disabled: sn === 0, fn: function () { if (sn !== 0) similarToPlaying(who); } }] : []).concat(eid ? [{ label: "עריכת שם ומבצע", fn: function () { editFromDock(); } }] : []).concat(canAdd ? [{ label: "הוספה", primary: true, fn: function () { acb.click(); } }] : []);
        menu(nmEl, [], { foot: mi, head: headH, up: true, ref: nmEl.closest(".bio-dock") });
        };
        if (who) simOf(who).then(function (o) { openMenu(o.n); }, function () { openMenu(null); }); else openMenu(null);
        return;
      }
      var idlg = document.getElementById("songInfoDlg");
      if (!idlg) { idlg = document.createElement("dialog"); idlg.id = "songInfoDlg"; document.body.appendChild(idlg); }
      RosterSheet.render(idlg, { title: "המוסיקה שמתנגנת", from: "bottom", size: "s",
        body: '<div class="pad" style="gap:0"><div dir="auto" style="font:var(--fw-bold) var(--fs-l)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(ttl) + '</div>' + (art ? '<div dir="auto" style="margin-top:0;color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font);overflow-wrap:anywhere;text-align:start">' + esc(art) + '</div>' : '') + songTimeHtml() + '</div>',
        foot: (canAdd || eid || who) ? (who ? '<button class="rbtn rbtn--block" type="button" id="sisim">' + simLabel(null) + '</button>' : '') + (eid ? '<button class="rbtn rbtn--block" type="button" id="siedit">עריכת שם ומבצע</button>' : '') + (canAdd ? '<button class="rbtn rbtn--block rbtn--primary" type="button" id="siadd">הוספה</button>' : '') : undefined });
      if (who) api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id&limit=1").then(function (rows) {   /* the heart of the song that plays: loved or not, at the left of the header */
        var mr = rows && rows[0], hd = idlg.querySelector(".sheet-head"); if (!mr || !hd || hd.querySelector("[data-like]")) return;
        hd.insertAdjacentHTML("beforeend", heartBtn(mr).replace(" rrow__trail", ""));
        paintHearts(mr.id);
      }, function () { /* no heart without the answer */ });
      var sb2 = idlg.querySelector("#sisim"); if (sb2) simOf(who).then(function (o) { if (!sb2.isConnected) return; sb2.textContent = simLabel(o.n); if (!o.n) sb2.disabled = true; }, function () { /* no number without the answer */ });
      if (sb2) sb2.addEventListener("click", function () { idlg.close(); similarToPlaying(who); });
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
      var d = ev.detail || {}; trackVivPlay(d);
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
      d.innerHTML = '<button type="button" class="ricon-lg" disabled aria-label="השמעה">' + PLAY + '</button><button type="button" class="rbtn bio-dock__cat" data-catopen aria-pressed="false" aria-label="קטלוג התרגילים" title="קטלוג התרגילים" style="flex:none;order:-1">קטלוג</button><span class="rchip rchip--s bio-dock__time" style="direction:ltr;font-variant-numeric:tabular-nums;display:inline-flex;align-items:center;gap:var(--gap-tight)"><button type="button" class="rbtn rbtn--icon bio-dock__rst" data-rst aria-label="חזרה להתחלת השיר" title="חזרה להתחלת השיר" disabled><svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M6 5h2v14H6zM19 5.5v13a.8.8 0 0 1-1.25.66L9.5 12.66a.8.8 0 0 1 0-1.32l8.25-6.5A.8.8 0 0 1 19 5.5z"/></svg></button><span class="bio-dock__tt">0:00 / 0:00</span></span>' + volDock() + '<button type="button" class="rbtn rbtn--ghost" data-addcur hidden title="הוספת המוסיקה שבנגן לתרגיל הפתוח" style="flex:none;gap:var(--gap)"><span aria-hidden="true" class="ricon">' + I.plus + '</span><span data-addcur-label style="max-width:var(--w);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">הוספה לתרגיל</span></button>' +
        '<div class="bio-dockbar"><input class="bio-dock__bar rrange" type="range" min="0" max="1000" value="0" step="1" aria-label="מקום במוסיקה" disabled></div><div class="rrow__main bio-dock__name"><b>לא נבחרה מוסיקה</b> <span></span></div><button type="button" class="rbtn rbtn--icon" data-dockmore aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>';
      document.addEventListener("biobusy", function (ev) { var pb = d.querySelector(".ricon-lg"); if (!pb) return; if (ev.detail.on) pb.setAttribute("aria-busy", "true"); else if (!pb.__busy) pb.removeAttribute("aria-busy"); });   /* law 7 on the large icon: the song waits for its file, the play button shows it */
      d.querySelector("[data-rst]").addEventListener("click", function () { if (window.BioAudio && BioAudio.seek) { BioAudio.seek(0); if (BioAudio.commitSeek) BioAudio.commitSeek(); } });   /* the small button beside the time: back to the start of the song */
      d.querySelector("button").addEventListener("click", function () {
        if (loaded) { if (window.BioAudio && BioAudio.playPause) BioAudio.playPause(); return; }
        if (!last) return;   /* nothing loaded: the last song is loaded and played, as its own button does */
        var tb = document.createElement("button"); tb.dataset.audio = last.n; tb.style.display = "none"; document.body.appendChild(tb); tb.click(); tb.remove();
      });
      d.querySelector("[data-addcur]").addEventListener("click", function () {
        var nm = loaded ? curName : (last && last.n), id = liveItem && liveItem.id, it = id && state.items && state.items.filter(function (x) { return x.id === id; })[0];
        var exOpen = !!(it && document.querySelector("#imus [data-addm]"));
        if (!nm || (!exOpen && !state.viv)) return;
        var mp = api("/rest/v1/music?audio_object=eq." + encodeURIComponent(nm) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1");   /* the picker opens at once (law 7); the song's row is asked for meanwhile */
        chooseDest((songInfo[nm] && songInfo[nm].t) || curTitle || "המוסיקה", { vivId: state.viv && state.viv.id, itemId: exOpen && it ? it.id : null }, function (d) {
          return mp.then(function (rows) { var m = rows && rows[0]; if (!m) { toast("המוסיקה לא נמצאה"); return; } return addMusicTo(m, d); }).then(null, fail);
        });
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
      if (dock.parentNode !== target) target.appendChild(dock);
      try { dock.showPopover(); } catch (x) { /* an old browser: the pill is an ordinary fixed element */ }
    }
    top();
    function sync() {
      var on = !!(window.FLOA_AUTH && FLOA_AUTH.signedIn());
      [dock].forEach(function (d) {
        d.classList.toggle("on", on);   /* the player stays, over any popup: a popup with its own button at the bottom makes room for it instead */
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
            if (lb && lb.textContent !== "הוספה") { lb.textContent = "הוספה"; ac.title = "הוספת המוסיקה שבנגן: בחירה לאן"; }   /* the popup asks where: a vivencia or an exercise */
          }
        }
        var vtE = document.getElementById("vtimer");   /* wide screen: the time left of whichever song of this vivencia plays, in the header of the list; and, on every screen, the number of the exercise that plays beside the name */
        if (vtE || document.getElementById("vgo")) {
          var vOn = !!(playing && loaded && curD > 0 && state.viv && state.items && (function (n) { var has = function (m) { return m && m.audio_object === n; };
            return state.items.some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) || ["start", "end"].some(function (k) { return (recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); }); }); })(curName));
          if (vOn && vtE) { var vTxt = clk(Math.max(0, Math.ceil(curD - curT))); if (vtE.textContent !== vTxt) vtE.textContent = vTxt; }
          if (vtE) timerToggle(vtE, vOn);
          var vgE = document.getElementById("vgo");   /* the button is for going to the exercise that plays, and its number with the sound ring: it is there the whole time a song of this vivencia plays, also while that exercise is the one that is open */
          if (vgE) { var itO = liveItem && state.items ? state.items.filter(function (x) { return x.id === liveItem.id; })[0] : null, vShow = vOn && state.items.some(function (x) { return optList(x).some(function (m) { return m.audio_object === curName; }); });   /* only for a song of an exercise: not for the start or the end music */ if (vgE.hidden === vShow) vgE.hidden = !vShow; var dsp = vShow ? "" : "none"; if (vgE.style.display !== dsp) vgE.style.display = dsp;
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
          timerToggle(tmE, tOn);
        }
        document.documentElement.classList.toggle("bio-docked", on);   /* the page ends above the footer */
        var b = d.querySelector("button"), t = d.querySelector(".bio-dock__tt"), r = d.querySelector(".bio-dock__bar"), dd0 = loaded ? curD : (last ? last.d : 0), s = window.matchMedia("(width < 760px)").matches ? clk(Math.max(0, Math.ceil(dd0 - curT))) : clk(curT) + " / " + clk(dd0), nm = d.querySelector(".bio-dock__name");
        b.disabled = !loaded && !last; r.disabled = !loaded || !(curD > 0); var rs = d.querySelector("[data-rst]"); if (rs) rs.disabled = r.disabled; b.dataset.st = playing ? "playing" : "paused";
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
      var tg = e.target, onSeek = tg && tg.type === "range";   /* a seek bar that kept focus after a click must not take the arrows: up and down are the volume */
      if (tg && !onSeek && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (document.querySelector("dialog[open], #moreMenu") || !window.BioAudio || !BioAudio.volume || !window.matchMedia("(min-width: 760px)").matches) return;
      e.preventDefault();
      volState.v = BioAudio.volume((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01)); paintVol();   /* the sound and the gauge in the header are the answer: no message */
    });
    /* while a song plays, on a wide screen, the right and left arrows move it forward and back (5 seconds, Shift 15), whatever page of the app is open */
    document.addEventListener("keydown", function (e) {
      if (!loaded || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, onBar = tg && tg.closest && tg.closest(".bio-dock__bar");   /* the player's own bar keeps no arrow job of its own: they skip, as everywhere */
      if (tg && !onBar && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
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
    var tile = songBtn(m, trail);
    return '<div style="flex:none;display:flex;flex-direction:column;align-items:center;gap:var(--gap)">' + tile +
      (durOf(m) || m.audio_object ? '<span class="bio-time" data-dur="' + (m.duration_sec || "") + '"' + (m.audio_object ? ' data-for="' + esc(m.audio_object) + '"' : '') + ' style="display:block;min-height:1em;color:var(--text-muted);font:var(--fw-regular) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + (durOf(m) ? clock(durOf(m)) : '') + '</span>' : '') + '</div>';
  }
  /* the heart: the songs I loved. At the right edge of a song's row, in line with the play tile and with the back button above. */
  function heartBtn(m) {
    var on = !!likes[m.id];
    return '<button type="button" class="rbtn rbtn--icon rrow__trail" data-like="' + m.id + '" aria-pressed="' + on + '" aria-label="' + (on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי") + '" title="' + (on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי") + '" style="flex:none;color:' + (on ? "var(--danger)" : "var(--primary)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHearts(id) {
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) {
      var on = !!likes[id]; b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--primary)";
      b.title = b.ariaLabel = on ? "הסרה מהמוסיקה שאהבתי" : "מוסיקה שאהבתי"; b.setAttribute("aria-label", b.title);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  function toggleLike(id) {
    var was = !!likes[id];
    if (was) delete likes[id]; else likes[id] = true;
    paintHearts(id);
    var req = (was ? api("/rest/v1/song_likes?music_id=eq." + id, { method: "DELETE" })
         : api("/rest/v1/song_likes", { method: "POST", json: { music_id: id }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likes[id] = true; else delete likes[id]; paintHearts(id); toast("אי אפשר לשמור עכשיו");   /* it did not reach the server: back as it was */
    });
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) { busy(b, req); });   /* law 7: the heart shows the wait until the server answers */
  }
  /* the heart of a song card: a loved song that is not playing is unmarked only after the kit's confirm popup (closing it is the cancel); on the red card of the song that plays it toggles freely */
  var RED_CARD = '.is-play, :has([data-audio][data-st="pause"])';
  function confirmUnlike(id, card, anchor) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הסרת סימון אהבתי", from: "bottom", size: "s", anchor: anchor,
      body: '<div class="pad"><span>להסיר את הסימון אהבתי מהשיר?</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cunlk">הסרת הסימון</button>' });
    dlg.querySelector("#cunlk").addEventListener("click", function () {
      dlg.close(); toggleLike(id);
      var lst = card && card.closest("#likl");   /* in my loved music the card leaves the list */
      if (lst) { card.remove(); if (!lst.querySelector(".bio-card")) lst.innerHTML = ph("עוד אין מוסיקה שאהבת", "לחצו על הלב ליד מוסיקה כדי לשמור אותה כאן"); }
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-like]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.like, card = b.classList.contains("bio-lk") ? b.closest(".bio-card") : null;
    if (card && likes[id] && !card.matches(RED_CARD)) { confirmUnlike(id, card, b); return; }
    toggleLike(id);
  }, true);
  /* the heart on a song card: the same button, only placed in the card's bottom right corner (see .bio-lk) */
  function cardHeart(m) {
    return m && m.id ? heartBtn(m).replace(" rrow__trail", " bio-lk").replace('style="flex:none;', 'style="') : "";
  }
  /* a grid of cards: the history's and my loved music's */
  function cardGrid(cards) { return '<div class="rgrid rgrid--pad">' + cards + '</div>'; }
  /* the heart of an exercise: in the exercise page's header, and in my list of loved exercises */
  function heartBtnEx(exId, cls) {
    var on = !!likesEx[exId];
    return '<button type="button" class="rbtn rbtn--icon ' + (cls || "") + '" data-likex="' + exId + '" aria-pressed="' + on + '" aria-label="' + (on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי") + '" title="' + (on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי") + '" style="color:' + (on ? "var(--danger)" : "var(--primary)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHeartsEx(id) {
    document.querySelectorAll('[data-likex="' + id + '"]').forEach(function (b) {
      var on = !!likesEx[id], tt = on ? "הסרה מהתרגילים שאהבתי" : "תרגיל שאהבתי";
      b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--primary)"; b.title = tt; b.setAttribute("aria-label", tt);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  /* taking a like off asks first, in the kit's popup with ONE action (closing it is the cancel): the same for a vivencia and an exercise as for a song */
  function askUnlike(text, anchor, run) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הסרת סימון אהבתי", from: "bottom", size: "s", anchor: anchor,
      body: '<div class="pad"><span>' + text + '</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cunlk2">הסרת הסימון</button>' });
    dlg.querySelector("#cunlk2").addEventListener("click", function () { dlg.close(); run(); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-likex]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.likex, was = !!likesEx[id];
    if (was && !b.__ok) { askUnlike("להסיר את הסימון אהבתי מהתרגיל?", b, function () { b.__ok = 1; b.click(); b.__ok = 0; }); return; }
    if (was) delete likesEx[id]; else likesEx[id] = true;
    paintHeartsEx(id);
    var isIt = id.indexOf("item:") === 0, rid = isIt ? id.slice(5) : id;   /* an exercise of a vivencia that is no catalog exercise: the heart belongs to the item */
    var req = (was ? api("/rest/v1/" + (isIt ? "item_likes?item_id=eq." : "exercise_likes?exercise_id=eq.") + rid, { method: "DELETE" })
         : api("/rest/v1/" + (isIt ? "item_likes" : "exercise_likes"), { method: "POST", json: isIt ? { item_id: rid } : { exercise_id: rid }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likesEx[id] = true; else delete likesEx[id]; paintHeartsEx(id); toast("אי אפשר לשמור עכשיו");
    });
    document.querySelectorAll('[data-likex="' + id + '"]').forEach(function (x) { busy(x, req); });
  }, true);
  /* the red button beside the countdown: to the exercise of this vivencia that holds the song now playing (or to the start or the end music) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#vgo, #vtimer"); if (!b || !state.viv || !state.items) return;   /* the timer is the same button: a tap on either goes to the exercise that plays */
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
    return '<button type="button" class="rbtn rbtn--icon ' + (cls || "") + '" data-likev="' + id + '" aria-pressed="' + on + '" aria-label="' + tt + '" title="' + tt + '" style="flex:none;color:' + (on ? "var(--danger)" : "var(--primary)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHeartsViv(id) {
    document.querySelectorAll('[data-likev="' + id + '"]').forEach(function (b) {
      var on = !!likesViv[id], tt = on ? "הסרה מהוויוונסיות שאהבתי" : "ויוונסיה שאהבתי";
      b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--primary)"; b.title = tt; b.setAttribute("aria-label", tt);
      b.innerHTML = on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart;
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-likev]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.likev, was = !!likesViv[id];
    if (was && !b.__ok) { askUnlike("להסיר את הסימון אהבתי מהוויוונסיה?", b, function () { b.__ok = 1; b.click(); b.__ok = 0; }); return; }
    if (was) delete likesViv[id]; else likesViv[id] = true;
    paintHeartsViv(id);
    var req = (was ? api("/rest/v1/vivencia_likes?vivencia_id=eq." + id, { method: "DELETE" })
         : api("/rest/v1/vivencia_likes", { method: "POST", json: { vivencia_id: id }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likesViv[id] = true; else delete likesViv[id]; paintHeartsViv(id); toast("אי אפשר לשמור עכשיו");
    });
    document.querySelectorAll('[data-likev="' + id + '"]').forEach(function (x) { busy(x, req); });
  }, true);
  /* a song as a row to choose from: the same element, a row of its own */
  function songRow(m, cur, attr, extra) {
    return '<div class="rrow rrow--link" style="direction:ltr;padding-inline:var(--gap);padding-block:var(--gap);flex-wrap:wrap"' + (cur ? ' aria-current="true"' : '') + '>' + heartBtn(m) + '<button type="button" class="rrow__main" ' + attr + '="' + m.id + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:left;direction:ltr;cursor:pointer;font:inherit;color:inherit">' + songLines(m) + '</button>' + (extra || '') + playCol(m, true) + '</div>';   /* the text takes what is left, so a long name never pushes the play tile to a line of its own */
  }
  window.toast = window.toast || toast;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-yt]"); if (!a) return;
    played = a.dataset.yt;
    try { localStorage.setItem("biodanza.played", played); } catch (x) { /* not kept */ }
    document.querySelectorAll("a[data-yt]").forEach(function (x) { x.style.color = ytColor(x.dataset.yt); });
  });

  function songTimeHtml() { var n = window.__bioNow || {}; return n.d ? '<div data-songtime dir="auto" style="margin-top:var(--gap-tight);color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font);font-variant-numeric:tabular-nums;text-align:start">' + songTimeText() + '</div>' : ''; }
  function songTimeText() { var n = window.__bioNow || {}; return clock(Math.floor(n.t || 0)) + ' מתוך ' + clock(Math.round(n.d || 0)); }
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
  var DRAFT_FIELD = ' style="color:var(--warn);background:linear-gradient(var(--warn-bg), var(--warn-bg)) 0 var(--rf-pad-top) / 100% calc(100% - var(--rf-pad-top)) no-repeat" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק"';
  var DRAFT = ' style="color:var(--warn);background:var(--warn-bg)" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק"';
  /* the placeholder of an empty list or pane: the curve icon, a title and one line */
  function ph(title, text) { return '<div class="rempty">' + I.curve + '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>'; }
  function phPick(title, text, noCat) {   /* the empty side of a computer: choose an exercise, or open the catalog from here (inside the catalog there is no catalog button) */
    return '<div class="rempty">' + I.curve + '<b>' + esc(title) + '</b><span>' + esc(text) + '</span>' + (true ? '</div>' : '<button type="button" class="rbtn" data-catopen aria-pressed="false" style="gap:var(--gap)"><span aria-hidden="true" class="ricon">' + I.catalog + '</span><span>קטלוג</span></button></div>');
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
  }
  /* the gauge moves with a drag or a click (mouse or finger) along it, and with the arrow keys when it has focus */
  function setVol(v) {
    v = Math.max(0, Math.min(1, v));
    if (window.BioAudio && BioAudio.volume) volState.v = BioAudio.volume(v - BioAudio.volume(0)); else volState.v = Math.round(v * 100) / 100;
    paintVol();
  }
  document.addEventListener("input", function (e) { var r = e.target; if (r && r.type === "range" && r.closest && r.closest(".bio-volume")) { var v = r.value / 100; if (v > 0) volBack = v; setVol(v); } });
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-vmute]"); if (!b) return; if (volState.v > 0) { volBack = volState.v; setVol(0); } else setVol(volBack || 0.5); });
  /* on a wide screen the volume lives in the player pill, between the bar and the X */
  var SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var SPK0 = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/></svg>';
  document.querySelectorAll(".bio-volume [data-vmute]").forEach(function (b) { b.removeAttribute("data-mu"); }); paintVol();   /* the player is drawn before these icons exist: its speaker is drawn again now they do */
  var volBack = 0.5;   /* the level a press on the speaker brings back after it was muted */
  /* the volume of the player: a speaker (press it to mute and to unmute) and a slider, on a wide screen only */
  function volDock() { var v = typeof volState === "object" ? volState.v : 1; return '<div class="bio-volume" style="--p:' + Math.round(v * 100) + '%"><button type="button" class="rbtn rbtn--icon" data-vmute aria-label="השתקה" title="השתקה">' + (v ? SPK : SPK0) + '</button><input class="rrange" type="range" min="0" max="100" step="1" value="' + Math.round(v * 100) + '" aria-label="עוצמת שמע"></div>'; }
  function head(title, sub, back, trail, lead, after) {   /* after: what sits right beside the title, in one group with it (--gap between): a mark that belongs to the name */
    return '<header class="rhead">' + (lead || '') + (back ? '<button class="rbtn rbtn--icon" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +
      '<div class="rhead__text' + (after ? ' rhead__text--row' : '') + '"><h1 class="rhead__title' + (after ? ' rhead__title--clip' : '') + '">' + esc(title) + '</h1>' + (sub ? '<span class="rhead__sub">' + esc(sub) + '</span>' : '') + (after || '') + '</div>' +
      (trail || '') + '</header>';   /* the volume, while a song plays: a bar across the free room of the header */
  }
  /* the header that walks a sequence: previous on the right, next on the left, the name centred between them */
  function walkHead(title, hasPrev, hasNext, withList) {
    return '<header class="rhead"><button class="rbtn rbtn--icon" data-act="prevW" aria-label="הקודם" title="הקודם"' + (hasPrev ? "" : " disabled") + '>' + I.back + '</button>' +
      (withList ? '<button class="rbtn rbtn--icon" data-act="list" aria-label="לרשימת התרגילים" title="לרשימת התרגילים">' + I.list + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title" style="text-align:center">' + esc(title) + '</h1></div>' +
      (withList ? '<span aria-hidden="true" style="flex:none;width:var(--ctl)"></span>' : '') +
      '<button class="rbtn rbtn--icon" data-act="nextW" aria-label="הבא" title="הבא"' + (hasNext ? "" : " disabled") + '>' + I.fwd + '</button></header>';
  }
  /* the header of one exercise: buttons only, each with its word. Previous and the list on the right, next on the left. The name is the field below. */
  function itemHead(hasPrev, hasNext, where, exId, nameText, ro, roLabel, inBack, numText, roPlus, tabs, playM) {
    var nav = !wide() && !ro;   /* beside the list there are no previous and next buttons: the list is the way around */
    if (nav && tabs) {   /* a phone: no arrows and no name here, only the number and the countdown, and under them the tabs of the exercises around it (the name is the first field of the page) */
      return '<header class="rhead bio-ihead bio-ihead--m"><nav class="bio-tabs" aria-label="התרגילים"><div class="bio-tabs__track">' + tabs.map(function (t, i) { return '<span class="bio-tab' + (i === 2 ? ' is-cur' : '') + (playsIn(t && t.a) ? ' is-play' : '') + '"' + (i === 0 || i === 4 ? ' data-far' : '') + (t && t.a ? ' data-aud="' + esc(t.a) + '"' : '') + '><b class="bio-tab__n">' + esc((t && t.n) || "") + '</b><span class="bio-tab__g">' + (i === 2 ? '<span class="bio-tab__t" data-t="' + esc((t && t.t) || "ללא שם") + '" data-nameedit role="button" tabindex="0" aria-label="שם התרגיל: לחיצה לעריכה">' + (esc((t && t.t) || "") || "ללא שם") + '</span><input id="ina" type="text" hidden aria-hidden="true" tabindex="-1" value="' + esc((t && t.t) || "") + '">' : '<span class="bio-tab__t" data-t="' + esc((t && t.t) || "") + '">' + esc((t && t.t) || "") + '</span>') + (i === 2 && t && t.id && t.f ? (function () { var cur = state.items.filter(function (x) { return x.id === t.id; })[0]; return cur ? facChip(cur, " bio-tab__f", true) : ""; })() : t && t.f ? '<button type="button" class="rbtn--text bio-tab__f" disabled tabindex="-1" data-fac-label="x">' + esc(t.f) + '</button>' : '') + '</span></span>'; }).join("") + '</div></nav></header>';
    }
    var arrow = function (act, ico, label, off) { return '<button class="rbtn rbtn--icon" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"' + (off ? " disabled" : "") + '>' + ico + '</button>'; };
    return '<header class="rhead' + (ro ? '' : ' bio-ihead') + '">' + (nav ? arrow("prevW", I.back, "הקודם", !hasPrev) : "") + "" +   /* the add button is after the exercise's name, toward the left */
      '<div class="rhead__text rhead__text--row">' + (numText ? '<span aria-hidden="true" style="flex:none;font:var(--fw-bold) var(--fs-l)/var(--lh-tight) var(--font);font-variant-numeric:tabular-nums">' + esc(numText) + '</span>' : "") + '<input id="ina" class="rhead__title" placeholder="ללא שם" autocomplete="off" aria-label="שם התרגיל"' + (ro ? ' readonly' : '') + ' value="' + esc(nameText || "") + '" style="flex:1 1 0;width:auto;min-width:0;border:0;background:transparent;padding-inline:0;margin:0;color:inherit;text-align:start;outline:0;text-overflow:ellipsis;text-box:normal;line-height:1.4;padding-block:0"></div>' +
      (ro && roLabel ? '<button type="button" class="rbtn rbtn--icon rbtn--primary" data-act="doswap" aria-label="' + esc(roLabel) + '" title="' + esc(roPlus ? "הוספה לוויוונסיה" : roLabel) + '">' + (roPlus ? I.plus : I.swap) + '</button>' : "") +
      "" +   /* the heart of a catalog exercise is on its card in the catalog, on hover */
      "" + "" + (ro || wide() ? "" : '<span id="itimer" hidden aria-live="off" style="flex:none;font:var(--fw-bold) var(--fs-l)/var(--lh-tight) var(--font);font-variant-numeric:tabular-nums;color:var(--text);direction:ltr"></span>') + (nav ? arrow("nextW", I.fwd, "הבא", !hasNext) : "") + (wide() && !ro ? '<span class="rgroup">' + (exId ? heartBtnEx(exId, "") : "") + '<button type="button" class="rbtn rbtn--icon" data-act="closeIt" aria-label="סגירת התרגיל" title="סגירת התרגיל">' + I.x + '</button></span>' : "") + '</header>';
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-card, .bio-icard { background: var(--on-primary); border: 0 !important }  .rhead [data-act=\"vmore\"] { margin-right: auto !important } .rhead:has(#vtimer:not([hidden])) [data-act=\"vmore\"] { margin-right: 0 !important } .rhead #vtimer:not([hidden]) { margin-right: auto !important } .rhead #vtimer { cursor: pointer }    .rrow[data-vrow] { padding-block: var(--gap) !important; min-height: 0 !important } .bio-card[aria-current=true]:is([data-opt], [data-am], [data-sgc], [data-liked], [data-hi]) { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary), var(--shadow) } [data-catopen]:not(.bio-dock__cat) { background: transparent !important; border-color: transparent !important; box-shadow: none !important; color: var(--primary) !important } .bio-dock .bio-dock__cat[aria-pressed=\"true\"] { background: var(--primary) !important; border-color: var(--primary) !important; color: var(--on-primary) !important } .rfield:has(> .rf-rich[contenteditable=true]), .rfield:has(> .rf-rich[contenteditable=true]) > *, .rf-rich[contenteditable=true], .rf-rich[contenteditable=true] * { cursor: text !important } .rf-rich [data-mention] { cursor: default !important } @keyframes bioTin { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } } @keyframes bioTout { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(-8px) } } #vtimer.is-in, #itimer.is-in { animation: bioTin var(--t-base) var(--ease) both } #vtimer.is-out, #itimer.is-out { animation: bioTout var(--t-base) ease-in both } @media (prefers-reduced-motion: reduce) { #vtimer.is-in, #itimer.is-in, #vtimer.is-out, #itimer.is-out { animation: none } }   .bio-card.is-play[aria-current], .bio-card.is-play[aria-current=\"true\"], .bio-card:has([data-audio][data-st=\"pause\"])[aria-current] { border-color: transparent !important; box-shadow: var(--shadow) !important; outline: 0 !important }   @keyframes bioWave { 0% { stroke-dashoffset: 1.05 } 45% { stroke-dashoffset: 0 } 70% { stroke-dashoffset: 0 } 100% { stroke-dashoffset: -1.05 } }     [data-opening] [data-sech-row], [data-opening] [data-sech-row] * { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent } [data-opening] [data-sech-row] { touch-action: pan-y } .rrow[data-vrow] { position: relative } .bio-vsym { display: flex; flex: none; align-items: center; padding-inline: var(--ring-over); color: var(--primary); pointer-events: none } .bio-vsym__n { font: var(--fw-bold) var(--fs-l)/1 var(--font); font-variant-numeric: tabular-nums } .bio-vsym__n:empty { display: none }  @keyframes bio-wait { from { background-position: 100% 0 } to { background-position: -100% 0 } } .bio-card:has([data-audio][data-st=\"wait\"]) { background-image: linear-gradient(100deg, transparent 30%, color-mix(in srgb, var(--primary) 22%, transparent) 50%, transparent 70%) !important; background-size: 200% 100% !important; background-repeat: no-repeat !important; animation: bio-wait 1.1s linear infinite } @media (prefers-reduced-motion: reduce) { .bio-card:has([data-audio][data-st=\"wait\"]) { animation: none; background-image: linear-gradient(color-mix(in srgb, var(--primary) 14%, transparent), color-mix(in srgb, var(--primary) 14%, transparent)) !important } }  .rf-rich b, .rf-rich strong, .rcard__body b, .rhint__tx b { color: var(--text) !important } [data-opening] .bio-chipb { flex: none; gap: var(--gap-tight) } [data-sech-row] > .rtitle { flex: 1 1 auto } [data-opening] .bio-chipb > span:first-child { flex: none; white-space: nowrap } [data-opening] .rfield > span:first-child { transform: translateY(16px) !important; inset-inline-end: 0 !important; pointer-events: none; transition: opacity var(--t-base) var(--ease) } [data-opening] .rfield[data-rf=\"v\"] > span:first-child { opacity: 0 } .bio-card [data-upl-wrap] { gap: var(--gap) !important }   .bio-card.is-play-opt { border-color: transparent !important; box-shadow: var(--shadow) !important }  [data-recv] [data-audio] { display: none !important }         button.rchip { background: transparent; border: 1px solid var(--primary); color: var(--primary) } button.rchip[aria-pressed=\"true\"]:not([data-fac]) { background: var(--primary); color: var(--on-primary) } button.rchip[data-fac][aria-pressed=\"true\"], .rchip[data-fac-label] { background: var(--primary); color: var(--on-primary); border: 0 } button.rchip[data-fac][aria-pressed=\"false\"] { background: transparent; color: var(--primary); border: 1px solid var(--primary) } [data-audio]:not(.ricon-lg) { background: transparent !important; border-color: transparent !important; box-shadow: none !important; color: var(--danger) !important; --play-in: var(--on-primary) }   .bio-card, .bio-card * { user-select: none; -webkit-user-select: none }       .bio-bar, .bio-bar * { touch-action: none }  .bio-dock, .bio-dock * { transition: background-color calc(var(--t-base) * 2) var(--ease), color calc(var(--t-base) * 2) var(--ease), border-color calc(var(--t-base) * 2) var(--ease), fill calc(var(--t-base) * 2) var(--ease), stroke calc(var(--t-base) * 2) var(--ease) } @media (prefers-reduced-motion: reduce) { .bio-dock, .bio-dock * { transition: none } }   .bio-card.bio-mcard, .bio-card.bio-mcard[aria-current], .bio-card.bio-mcard.is-play, .bio-card.bio-mcard.is-play-opt, [data-recv] .bio-card { border: 0 !important; outline: 0 !important; box-shadow: var(--shadow) !important } .bio-card.bio-mcard[aria-current=true], [data-recv] .bio-card[aria-current=true] { background: var(--surface) !important } .bio-mcard [data-orm] { opacity: 1 !important } .rbtn--icon > svg, .rbtn--icon > span > svg { width: var(--icon); height: var(--icon) }  html .bio-card.bio-mcard .bio-lk { position: relative !important; inset: auto !important; display: grid !important; flex: none }   .bio-catlayer .catmain, .bio-catlayer .catbody { background: var(--page) } .bio-catlayer { background: transparent } .catprev > .rhead + .rempty { flex: 1 1 auto; justify-content: center } .bio-catlayer .catprev { background: var(--page) }";
    document.head.appendChild(st);
    /* the same edge from the header's side: a scroller under a page header (outside any popup) sets data-scrolled on that header while it is scrolled away from its top, same 2px threshold as sheet.js */
    (function () {
      function headOf(sc) { for (var el = sc; el && el !== document.body; el = el.parentElement) { var p = el.parentElement; if (!p) break; for (var h = el.previousElementSibling; h; h = h.previousElementSibling) if (h.classList && h.classList.contains("rhead")) return h; } return null; }
      function apply(h) {
        var set = (h.__bioSc || []).filter(function (x) { return x.isConnected && x.scrollTop > 2; }); h.__bioSc = set;
        if (set.length) h.setAttribute("data-scrolled", ""); else h.removeAttribute("data-scrolled");
      }
      document.addEventListener("scroll", function (e) {
        var el = e.target; if (!el || el.nodeType !== 1 || el.closest("dialog")) return;
        var h = el.__bioHd && el.__bioHd.isConnected ? el.__bioHd : (el.__bioHd = headOf(el)); if (!h) return;
        var set = h.__bioSc || (h.__bioSc = []); if (el.scrollTop > 2 && set.indexOf(el) < 0) set.push(el);
        apply(h);
      }, { capture: true, passive: true });
      /* a list drawn again inside a kept header starts at its top: recheck the headers when contents are replaced */
      new MutationObserver(function () { document.querySelectorAll(".rhead[data-scrolled]").forEach(apply); }).observe(document.body, { childList: true, subtree: true });
    })();
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
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { mode = 2; try { el.setPointerCapture(e.pointerId); } catch (x) { /* none */ } pg.style.transition = "none";
          var ae = document.activeElement; if (ae && ae !== document.body && ae.blur && pg.contains(ae)) { ae.blur(); try { window.getSelection().removeAllRanges(); } catch (x2) { /* none */ } }   /* a swipe that began over a field: the field lets go (its label comes back down, the keyboard goes) */ }
        else { if (Math.abs(my) > 10) mode = 3; return; }
      }
      var pw = pg.offsetWidth || 320;
      dx = Math.max(-pw, Math.min(pw, mx));   /* never further than one page: the neighbour is there, and beyond it nothing */
      pg.style.transform = "translateX(" + ((dx > 0 ? to.next : to.prev) ? dx : dx * 0.3) + "px)";   /* no page that way: it only gives a little */
      if (to.drag) to.drag((dx > 0 ? to.next : to.prev) ? dx : dx * 0.3, pw);
    }, sg);
    function end() {
      if (mode !== 2) { mode = 0; return; }
      mode = 0;
      var w = pg.getBoundingClientRect().width || 320, v = Math.abs(dx) / Math.max(1, performance.now() - t0), go = dx > 0 ? to.next : to.prev;
      if (go && (Math.abs(dx) > w * 0.22 || v > 0.5)) {
        pg.style.transition = "transform .16s ease-in"; pg.style.transform = "translateX(" + (dx > 0 ? w : -w) + "px)";
        if (to.leave) to.leave(dx > 0 ? 1 : -1);
        setTimeout(go, 150);
      } else { pg.style.transition = "transform var(--t-base) var(--ease)"; pg.style.transform = ""; if (to.settle) to.settle(); }
    }
    el.addEventListener("touchmove", function (e) { if (mode === 2 && e.cancelable) e.preventDefault(); }, { passive: false, signal: ac.signal });   /* a sideways drag is the page's, not the browser's: left to the browser it ends as a fling, and the next tap only stops that fling instead of clicking */
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
      st.textContent = ".bio-dock [data-dockmore] { position: relative } .bio-dock .bio-sync { position: absolute; inset-inline: 0; bottom: 100%; margin-inline: auto; width: var(--icon); height: var(--icon); color: var(--text); pointer-events: none; order: 0 } .bio-dock .bio-sync[data-m] { color: var(--text) } .bio-dock .bio-sync svg { width: 100%; height: 100% } @keyframes bioDl { 0% { transform: translateY(-3px); opacity: 0 } 40% { opacity: 1 } 100% { transform: translateY(4px); opacity: 0 } } .bio-sync { color: var(--danger) } .bio-sync[data-m=\"run\"] .bio-sync__a { animation: bioDl 1.1s ease-in infinite } .bio-sync[data-m=\"stop\"] { color: var(--danger) } @media (prefers-reduced-motion: reduce) { .bio-sync[data-m=\"run\"] .bio-sync__a { animation: none } }";
      document.head.appendChild(st);
      syncEl = document.createElement("span"); syncEl.className = "rbtn__tail bio-sync"; syncEl.hidden = true;
    }
    syncEl.dataset.m = mode; syncEl.hidden = !mode; syncEl.setAttribute("aria-label", text || "הורדה למכשיר"); syncEl.title = text || "";
    syncEl.innerHTML = mode === "done" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
      : mode === "stop" ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h16"/><g class="bio-sync__a"><path d="M12 5v9M8 10.5l4 4 4-4"/></g></svg>';
    syncPlace(document);
  }
  function syncPlace() {   /* the status of the download: a white mark above the three dots of the player, laid over so it takes no room and the bar of the player never changes width */
    if (!syncEl) return;
    var d = document.querySelector(".bio-dock [data-dockmore]"); if (!d || d.contains(syncEl)) return;
    d.appendChild(syncEl);
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
      var listy = html.indexOf("data-fab-room") >= 0 && !(state.viv && (state.viv.role === "view" || state.viv.role === "public"));
      if (listy) ensureCatLayer();
      if (catLayer) { catLayer.hidden = !listy; placeCatLayer(); }
    }
    if (wire) wire(t); }
  var catPanel = null, catLayer = null, catPreview = false;
  (function () { var st = document.createElement("style"); st.textContent = ".bio-catlayer { position: fixed; z-index: var(--z-menu); transform: translateX(100%); transition: transform var(--t-base) var(--ease); display: flex; flex-direction: column; min-height: 0 } .bio-catlayer[hidden] { display: none } .bio-catlayer.is-open { transform: none }  .bio-catlayer > .catbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; box-shadow: -1px 0 0 var(--border) } .bio-catlayer > .catbody > .rlist { flex: 1 1 auto; min-height: 0 } @media (prefers-reduced-motion: reduce) { .bio-catlayer { transition: none } }"; document.head.appendChild(st); })();
  /* The catalog is ONE popup, a single body that slides as a whole: it is as wide as the left and the right sides together; its right part is the catalog's list, its left part is the exercise opened from it. Closing moves the whole body; the left part only slides out from under the right one when an exercise is chosen. */
  /* the on-screen keyboard: while it is up, the player (hidden behind it anyway) keeps no room at the bottom of a popup, so the list reaches the keyboard */
  (function () {
    var st = document.createElement("style");
    st.textContent = "@media (width < 760px) { * { scrollbar-width: none } #ibtns { height: var(--gap) !important } html.bio-docked #itemDlg .sheet { padding-bottom: var(--dockfull) !important } html.bio-docked #itemDlg .sheet-body { padding-bottom: 0 !important } #ibtns { height: var(--gap) !important } *::-webkit-scrollbar { display: none } .rlist:has(> [data-exsec]) { gap: var(--gap) } [data-recv] .racc__body > div > div { padding-block: var(--gap) !important } [data-recv] .racc__body > div > div:empty { padding: 0 !important } #plist { padding-block: var(--gap) !important } [data-recv=end] { margin-top: 0 !important } dialog.rsheet .sheet { gap: var(--gap-tight) } .rlist:has(> [data-exsec]) { gap: var(--gap) } dialog.rsheet[data-from=\"bottom\"] > .rs-grab, dialog.rsheet:not([data-from]) > .rs-grab { height: calc(var(--bar-top) + var(--gap-tight) + var(--bar-gap)) !important; align-content: start; margin-bottom: 0 } dialog.rsheet > .rs-grab::before { margin-top: var(--bar-top) } html.bio-docked dialog.rsheet:not(:has(.sheet-foot)) .sheet { padding-bottom: var(--dockfull) !important } .bio-ihead--m { display: block; padding-inline: 0; touch-action: pan-y } .bio-ihead--m > .bio-tabs { overflow: hidden; direction: ltr; padding-block: 0 var(--gap) } .bio-tab__g { display: flex; flex-direction: column; align-items: center; gap: var(--gap-tight) } .bio-tabs__track { display: flex; width: max-content; visibility: hidden; transform: translateX(var(--tx, 0px)); transition: transform var(--t-base) var(--ease) } .bio-tabs__track.is-ready { visibility: visible } .bio-tabs__track.is-drag, .bio-tabs__track.is-drag .bio-tab { transition: none !important } .bio-tab { cursor: pointer; flex: none; display: flex; flex-direction: column; align-items: center; gap: var(--gap-tight); width: calc(var(--cw, 360px) * .38); white-space: nowrap; color: var(--text); direction: rtl; opacity: calc(.4 + .6 * max(0, 1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .6))); transition: opacity var(--t-base) var(--ease) } .bio-tab__f { transform: translateX(calc(var(--nb, 0) * (clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))))) } .bio-tab__n { --nx: calc(clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))); transform: translateX(calc(var(--nb, 0) * var(--nx))); opacity: calc(1 - var(--nb, 0) * min(1, abs(var(--nx)) / (var(--cw, 360px) * .45))); font: var(--fw-bold) var(--fs-xl)/var(--lh-tight) var(--font); font-variant-numeric: tabular-nums } .bio-tab__t { --dc: calc(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2); --dd: calc(var(--cw, 360px) * .38); --sd: min(1, max(.2, (var(--dd) - (var(--hl, 0px) * (1 + clamp(-1, var(--dc) / (var(--cw, 360px) * .02), 1)) + var(--hr, 0px) * (1 - clamp(-1, var(--dc) / (var(--cw, 360px) * .02), 1))) / 2 - var(--gap-tight)) / var(--h, 1px))); transform: scaleX(calc(1 - min(1, abs(var(--dc)) / var(--dd)) * (1 - var(--sd)))); font: var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font); color: var(--text-muted) } .bio-tab.is-cur .bio-tab__t { color: var(--text); font-weight: var(--fw-bold) } .bio-ihead { flex-wrap: wrap; row-gap: 0 } .bio-ihead > .rhead__text { display: contents } .bio-ihead #ina { order: 10; flex: 1 1 100% !important; width: 100% !important; margin-top: var(--gap) !important } .bio-ihead #itimer { margin-inline-start: auto } :root { --dockfull: calc(var(--ctl) * 2 + var(--icon) + var(--gap) * 3 + var(--inset-b)) } .bio-dock { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; align-items: center; column-gap: var(--gap); row-gap: var(--gap); min-height: 0; padding-block: var(--gap) calc(var(--gap) + var(--inset-b)) } .bio-dock > .bio-dockbar { grid-column: 1 / -1; grid-row: 1 } .bio-dock > .rbtn:first-child { grid-column: 1; grid-row: 2; order: 0; margin-inline-end: 0; width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important } .bio-dock > .bio-dock__time { grid-column: 2; grid-row: 2; order: 0; font: var(--fw-bold) var(--fs-l)/1 var(--font) !important; background: transparent !important; padding: 0 !important; text-align: center; font-variant-numeric: tabular-nums } .bio-dock > .bio-dock__name { grid-column: 3; grid-row: 2; order: 0; min-width: 0 } .bio-dock > [data-dockmore] { grid-column: 4; grid-row: 2; order: 0 } .bio-dock > .bio-dock__cat { text-decoration: underline; text-underline-offset: 4px; grid-column: 1 / 3; grid-row: 3; order: 0 !important; justify-content: flex-start; padding-inline: 0 !important; width: 100%; min-width: 0 } .bio-dock > [data-addcur] { grid-column: 3; grid-row: 3; order: 0; flex: none !important; min-width: 0; max-width: 100%; justify-self: end; flex-direction: row-reverse; justify-content: flex-end; padding-inline: 0 !important } .bio-dock > [data-addcur][hidden] { display: flex !important; visibility: hidden } .bio-dock > [data-addcur] [data-addcur-label] { max-width: 100% !important } .bio-dock > .bio-volume { display: none } } .bio-dock > [data-addcur], .bio-dock > [data-addcur][hidden] { display: none !important } html.bio-kb:not(.bio-sel) .bio-dock { display: none !important } html.bio-kb dialog.rsheet:not(:has(.sheet-foot)) .sheet-body { padding-bottom: 0 !important } html.bio-kb dialog.rsheet:not(:has(.sheet-foot)) .sheet { padding-bottom: 0 !important } html.bio-kb #itemDlg .sheet { padding-bottom: 0 !important } html.bio-kb #ibtns { height: calc(var(--gap) * 2) !important } #itemDlg .sheet-body { margin-bottom: 0 }   dialog.rsheet .sheet-head .rhead.rhead { border-bottom: 0 } .rcard[data-addm]:not(:first-child) { margin-top: 0 !important }";   /* the add-music card after a card: the standard space (sp-2) in every grid it sits in, grid gap plus this; alone it gets none */   /* the exercise popup keeps room for the player at its bottom (rule above, with its id); with the keyboard up the player is gone, so no room is left empty above the keyboard: the class from the visual viewport, and also whenever a field of the popup has focus (whatever the browser reports), and the scroller's own hairline margin no longer hangs below the sheet where it clipped the last line; a popup's header has no line under it, the edge shadow shows on scroll; phones keep a small gap (the gutter) under the last field, inside the scroll */
    document.head.appendChild(st);
    var vv = window.visualViewport; if (!vv) return;
    function upd() { document.documentElement.classList.toggle("bio-kb", Math.max(0, window.innerHeight - vv.height - vv.offsetTop) > 120); }
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd); upd();
    document.addEventListener("selectionchange", function () {   /* the player hides under the keyboard while you type, but stays while text is selected */
      var sel = window.getSelection && window.getSelection(); document.documentElement.classList.toggle("bio-sel", !!(sel && !sel.isCollapsed && String(sel).length));
    });
  })();
  var catPrev = null, catPrevId = null;
  /* THE LAYERS: a catalog opened from inside an exercise (the exercises of one song) is a NEW layer over the one that is open, and from inside it another, layer over layer. Each layer keeps its own state (what is open on it, its search, its filter); the state of the layer below waits in the stack and comes back when the one above closes. */
  var layerStack = [], mdepth = 0;
  function pushLayer(filter) {
    layerStack.push({ catPanel: catPanel, catLayer: catLayer, catPrev: catPrev, catPrevId: catPrevId, catPrevMus: catPrevMus, catPreview: catPreview, catPrevCtx: catPrevCtx, lastExPrev: lastExPrev, lastMusPrev: lastMusPrev, pk: pk, catApi: catApi, exFilter: exFilter });
    catPanel = null; catLayer = null; catPrev = null; catPrevId = null; catPrevMus = null; catPreview = false; catPrevCtx = null; lastExPrev = null; lastMusPrev = null; catApi = null;
    pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: "ex", mq: "", mln: "", mch: "", msp: "", mef: "", xo: "", mo: "" }; exFilter = filter;
  }
  function popLayer() {
    var o = layerStack.pop(); if (!o) return;
    catPanel = o.catPanel; catLayer = o.catLayer; catPrev = o.catPrev; catPrevId = o.catPrevId; catPrevMus = o.catPrevMus; catPreview = o.catPreview; catPrevCtx = o.catPrevCtx; lastExPrev = o.lastExPrev; lastMusPrev = o.lastMusPrev; pk = o.pk; catApi = o.catApi; exFilter = o.exFilter;
  }
  var CAT_KEY = "biodanza.catalog";
  function snapOf(st, depth) {   /* what one layer of the catalog is: open or closed, the exercise looked at, the search and the boxes, the categories, the scroll */
    var k = st.pk || {}, o = { open: false, prev: null, q: k.q || "", tab: k.tab || "ex", mq: k.mq || "", mln: k.mln || "", mch: k.mch || "", msp: k.msp || "", mef: k.mef || "", cats: k.open || {}, sc: 0 };
    if (wide()) {
      if (!st.catLayer) return null;
      var pks = st.catLayer.querySelector("#pks"); o.open = !!st.catPanel; o.prev = st.catPrevId || null; o.sc = pks ? pks.scrollTop : 0;
    } else {   /* a phone: the two popups of that depth */
      var sf = depth ? "_" + depth : "", cd = document.getElementById("catDlg" + sf), xd = document.getElementById("exDlg" + sf), pk2 = cd && cd.querySelector("#pks");
      o.open = !!(cd && cd.open); o.prev = xd && xd.open && xd.dataset.ex ? xd.dataset.ex : null; o.sc = pk2 ? pk2.scrollTop : 0;
    }
    return o;
  }
  function saveCat() {   /* a snapshot of the catalog and of every layer opened over it, in order: a refresh brings all of them back */
    try {
      var cur = { catPanel: catPanel, catLayer: catLayer, catPrevId: catPrevId, pk: pk, exFilter: exFilter }, all = layerStack.concat([cur]);
      var base = snapOf(all[0], 0); if (!base) return;
      base.layers = all.slice(1).map(function (st, i) { var o = snapOf(st, i + 1) || {}; o.song = st.exFilter && st.exFilter.id; o.name = st.exFilter && st.exFilter.name; return o; });
      localStorage.setItem(CAT_KEY, JSON.stringify(base));
    } catch (e) { /* not kept */ }
  }
  function whenSettled(cb, n) {   /* waits until what is looked at has been drawn (no skeleton left), so the layer opened next does not take its place */
    n = n || 0;
    var left = wide() ? !!(catPrev && catPrev.querySelector(".rskel")) : !!(document.querySelector("#exDlg" + dsfx() + " .rskel"));
    if (!left || n > 30) cb(); else setTimeout(function () { whenSettled(cb, n + 1); }, 100);
  }
  function restoreLayers(list, i) {   /* the layers over the catalog come back one by one, in order: its song filter, its search, the exercise that was open in it */
    if (!list || i >= list.length) return;
    var l = list[i];
    whenSettled(function () {
      api("/rest/v1/exercise_music?music_id=eq." + l.song + "&select=exercise_id&limit=1000").then(function (rows) {
        var ids = {}; (rows || []).forEach(function (x) { ids[x.exercise_id] = 1; });
        openFilteredLayer({ id: l.song, name: l.name || "", ids: ids });
        setTimeout(function () {
          var root = wide() ? catLayer : document.getElementById("catDlg" + dsfx()), qi = root && root.querySelector("input[data-cattitle]");
          if (qi && l.q) { qi.value = l.q; qi.dispatchEvent(new Event("input", { bubbles: true })); }
          var ex = l.prev && (state.cat || []).filter(function (x) { return x.id === l.prev; })[0];
          if (ex) { if (wide()) previewEx(ex); else previewSheet(ex); }
          restoreLayers(list, i + 1);
        }, 700);
      }, function () { /* no connection: the layers below stay as they are */ });
    });
  }
  function restoreCatMobile() {   /* a phone after a refresh: the catalog opens again where it was, on the exercise that was chosen */
    if (wide()) return;
    var snap = loadCatSnap(), lay = snap && Array.isArray(snap.layers) && snap.layers.length ? snap.layers : null;
    if (!snap || (!snap.open && !lay)) return;
    var cd = document.getElementById("catDlg"); if (cd && cd.open) return;
    if (!snap.open) { restoreLayers(lay, 0); return; }   /* the layers were opened from an exercise screen, with no catalog under them */
    resetPk(); pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || ""; pk.open = snap.cats || {};
    var drawn = pickerSheet(); if (!drawn || !drawn.then) return;
    drawn.then(function () {
      var pks = document.querySelector("#catDlg #pks"); if (pks) pks.scrollTop = snap.sc || 0;
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) previewSheet(ex);
      if (lay) restoreLayers(lay, 0);
    });
  }
  var catPrevCtx = null;   /* the exercise of the catalog that is looked at: what the add button adds */
  function catAddHtml() {
    var t = state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה";
    return '<button type="button" id="catAdd" class="rbtn" style="flex:none;gap:var(--gap)" aria-label="הוספה לוויוונסיה ' + esc(t) + '" title="הוספה לוויוונסיה" disabled><span aria-hidden="true" class="ricon">' + I.plus + '</span><span style="max-width:var(--w);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(t) + '</span></button>';
  }
  function refreshPrevLabel() {   /* it always says the vivencia that is open now, and is on only while an exercise is looked at */
    if (!catLayer) return;
    var b = catLayer.querySelector("#catAdd"); if (!b) return;
    var t = "הוספה", sp = b.querySelector("span:last-child");
    if (sp && sp.textContent !== t) sp.textContent = t; b.setAttribute("aria-label", "הוספה לוויוונסיה"); b.disabled = !catPrevCtx;
  }
  function loadCatSnap() { try { return JSON.parse(localStorage.getItem(CAT_KEY) || "null"); } catch (e) { return null; } }
  function closeCatPrev() {   /* the left part slides back in under the right one */
    if (!catPrev) return;
    catPrev.classList.remove("is-open"); catPrevMus = null; catPrevId = null; catPreview = false; catPrevCtx = null; refreshPrevLabel(); saveCat();
    if (catLayer) catLayer.querySelectorAll(".bio-card[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); });
  }
  (function () { var st = document.createElement("style"); st.textContent = ".bio-catlayer.bio-catlayer { transform: none; transition: visibility 0s linear var(--t-base); visibility: hidden; pointer-events: none } .bio-catlayer.bio-catlayer.is-open { visibility: visible; transition: visibility 0s } .bio-catlayer .catmain { transform: translateX(100%); transition: transform var(--t-base) var(--ease) } .bio-catlayer.is-open .catmain { transform: none } @media (prefers-reduced-motion: reduce) { .bio-catlayer .catmain { transition: none } } .bio-catlayer .catsh { position: absolute; z-index: 5; inset-block: 0; right: calc(var(--plw) - var(--gap-tight)); width: var(--handle-w); pointer-events: auto; cursor: col-resize; touch-action: none } .bio-catlayer .catsh::after { content: ''; position: absolute; inset-block: 0; right: 4px; width: 2px; background: transparent; transition: background var(--t-base) } .bio-catlayer .catsh:hover::after, .bio-catlayer .catsh:focus-visible::after, html.split-drag .bio-catlayer .catsh::after { background: var(--border-strong) } .bio-catlayer .catsh:focus-visible { outline: none } .bio-catlayer { position: fixed; z-index: var(--z-menu); pointer-events: none; transform: translateX(100%); transition: transform var(--t-base) var(--ease) } .bio-catlayer[hidden] { display: none } .bio-catlayer.is-open { transform: none } .bio-catlayer > .catmain { position: absolute; z-index: var(--z-raised); inset-block: 0; right: 0; width: var(--plw); display: flex; flex-direction: column; min-height: 0; pointer-events: auto; box-shadow: -1px 0 0 var(--border) } .bio-catlayer .catbody > .rhead { padding-inline-end: var(--gap) } .bio-catlayer .catbody { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column } .bio-catlayer .catbody > .rlist { flex: 1 1 auto; min-height: 0 } .bio-catlayer > .catprev { position: absolute; z-index: 0; inset-block: 0; left: 0; width: var(--pdw); display: flex; flex-direction: column; min-height: 0; overflow: hidden; pointer-events: auto; visibility: hidden; transform: translateX(100%); transition: transform var(--t-base) var(--ease), visibility 0s linear var(--t-base) } .bio-catlayer > .catprev.is-open { visibility: visible; transform: none; transition: transform var(--t-base) var(--ease), visibility 0s } .bio-catlayer > .catprev > .rlist { flex: 1 1 auto; min-height: 0 } @media (prefers-reduced-motion: reduce) { .bio-catlayer, .bio-catlayer > .catprev { transition: none } }"; document.head.appendChild(st); })();
  function placeCatLayer() {   /* the one body spans both sides, from the left side's edge to the right side's edge */
    if (!catLayer) return; var a = pd.getBoundingClientRect(), b = pl.getBoundingClientRect();
    catLayer.style.top = b.top + "px"; catLayer.style.height = b.height + "px"; catLayer.style.left = a.left + "px"; catLayer.style.width = (b.right - a.left) + "px";
    catLayer.style.setProperty("--pdw", a.width + "px"); catLayer.style.setProperty("--plw", b.width + "px");
    var sc = catLayer.__scrim; if (sc) { sc.style.top = b.top + "px"; sc.style.height = b.height + "px"; sc.style.left = a.left + "px"; sc.style.width = a.width + "px"; }   /* the scrim covers the left side, and stays there */
  }
  function ensureCatLayer() {   /* built once, closed, waiting off the right edge of the screen */
    if (catLayer) return;
    resetPk();   /* the search box reads the catalog's state: it must exist before the layer is drawn */
    var snap = layerStack.length ? null : loadCatSnap(); if (snap) { pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || ""; pk.open = snap.cats || {}; }   /* back to where it was before the refresh */
    var bg = getComputedStyle(document.body).backgroundColor;
    var d = document.createElement("div"); d.className = "bio-catlayer";
    d.innerHTML = '<div class="catprev" style="background:' + bg + '"></div><div class="catmain" style="background:' + bg + '"><div class="catbody" inert><header class="rhead"><button type="button" id="catX" class="rbtn rbtn--icon" aria-label="סגירת הקטלוג" title="סגירת הקטלוג">' + I.x + '</button><div class="rhead__text">' + catField() + '</div></header>' + pickerBody(false, null, !!exFilter) + '</div></div>';
    d.insertAdjacentHTML("beforeend", '<div class="catsh" role="separator" aria-orientation="vertical" aria-label="רוחב הרשימה (גרירה, חצים במקלדת, לחיצה כפולה לברירת המחדל)" title="גרירה לשינוי הרוחב · לחיצה כפולה: ברירת מחדל" tabindex="0"></div>'); if (window.__bioSplitWire) window.__bioSplitWire(d.querySelector(".catsh"));
    document.body.appendChild(d); catLayer = d; catPrev = d.querySelector(".catprev"); (d.querySelector("#catAdd") || document.createElement("i")).addEventListener("click", function (ev) {
      var c = catPrevCtx; if (!c) return;
      chooseDest(name(c.e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(c.fake); addExTo(c.e, d.vivId, es.mid, es.all); }, { vivOnly: true });
    });
    d.querySelector("#catX").addEventListener("click", function () { var f = d.querySelector("input[data-cattitle]"); if (f && f.__letGo && f.__letGo()) return; closeCatPanel(); });
    var drawn = pickerWire(d.querySelector(".catbody"), undefined, false); d.__api = catApi; placeCatLayer();
    if (snap && snap.open) drawn.then(function () {   /* it was open: it opens again, on the same place and on the same exercise */
      if (catPanel || catLayer.hidden || !wide()) return;
      openCatPanel();
      var pks = catLayer.querySelector("#pks"); if (pks) pks.scrollTop = snap.sc || 0;
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) { var cardEl = catLayer.querySelector('[data-ex="' + ex.id + '"]'); if (cardEl) (cardEl.closest(".bio-card") || cardEl).setAttribute("aria-current", "true"); previewEx(ex); }
    });
    if (snap && Array.isArray(snap.layers) && snap.layers.length) drawn.then(function () { setTimeout(function () { if (wide()) restoreLayers(snap.layers, 0); }, 0); });   /* the layers that were over it */
    window.addEventListener("resize", placeCatLayer);
    if (window.ResizeObserver) { var ro = new ResizeObserver(placeCatLayer); ro.observe(pl); ro.observe(pd); }
  }
  function closeCatPanel(quiet) {
    if (!catPanel) return;
    if (layerStack.length) {   /* a layer over another: it slides off, removed when it is gone, and the one below is as it was (still open, its left side still dark) */
      var up = catLayer; up.classList.remove("is-open"); up.querySelector(".catbody").setAttribute("inert", "");   /* both halves leave together with the layer (its left part is left alone) */
      var usc = up.__scrim; if (usc) { usc.classList.remove("is-on"); setTimeout(function () { usc.remove(); }, 400); }   /* the scrim fades out where it is */
      popLayer(); setTimeout(function () { up.remove(); }, 400); saveCat(); return;
    }
    catPanel = null; state.pickerShow = false; pd.classList.remove("bio-dim");
    document.querySelectorAll("[data-catopen]").forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
    closeCatPrev();   /* the left part leaves with its own motion, the right part with its own: each moves only its own width */
    catLayer.classList.remove("is-open"); catLayer.querySelector(".catbody").setAttribute("inert", ""); saveCat();   /* the whole body slides back off to the right, as one piece; the exercise opened from it is remembered */
  }
  function openCatPanel() {   /* the whole body slides left; the exercise on the left side goes dark */
    if (catPanel || !catLayer || catLayer.hidden) return;
    if (window.__closeLeftAll) window.__closeLeftAll();   /* the side layers go before the catalog opens */
    placeCatLayer(); catLayer.classList.add("is-open"); catLayer.querySelector(".catbody").removeAttribute("inert");
    document.querySelectorAll("[data-catopen]").forEach(function (b) { b.setAttribute("aria-pressed", "true"); });
    catPanel = catLayer; state.pickerShow = true; catPreview = !!catPrevId;
    pd.classList.add("bio-dim"); refreshPrevLabel(); saveCat();
    if (typeof syncLeftToTab === "function") setTimeout(syncLeftToTab, 0);   /* the left side already says what to do: choose an exercise or a song */
  }
  document.addEventListener("click", function (ev) { var ab = ev.target.closest && ev.target.closest("[data-addex]"); if (ab) {   /* the plus beside the exercises' title: an empty exercise at the end of the numbered ones, opened to be filled in */
      if (!state.viv || !state.items || ab.disabled) return;
      if (!ab.dataset.go) {   /* the plus asks which: an empty new exercise, or one from the catalog */
        menu(ab, [{ label: "תרגיל חדש", icon: I.plus, fn: function () { ab.dataset.go = "1"; ab.click(); } }, { label: "תרגיל מהקטלוג", icon: I.catalog, fn: function () { openCatalog("ex"); } }]);
        return;
      }
      delete ab.dataset.go; ab.disabled = true;
      var cur = liveItem && state.items.filter(function (x) { return x.id === liveItem.id; })[0];   /* standing on an exercise: the new one comes right after it, in its group; otherwise at the end of the numbered ones */
      var pos = cur ? cur.position + 1 : state.items.reduce(function (x, k) { return Math.max(x, k.position); }, 0) + 1;
      var shift = cur ? state.items.filter(function (x) { return x.position > cur.position; }).map(function (x) { return api("/rest/v1/vivencia_items?id=eq." + x.id, { method: "PATCH", prefer: "return=minimal", json: { position: x.position + 1 } }); }) : [];
      busy(ab, Promise.all(shift).then(function () { return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=representation", json: { vivencia_id: state.viv.id, position: pos, backlog: cur ? !!cur.backlog : false, exercise_id: null, music_id: null } }); }).then(function (made) {
        return loadItems().then(function () {
          paint(); ab.disabled = false;
          var it = made && made[0] && state.items.filter(function (x) { return x.id === made[0].id; })[0];
          if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
        });
      }).then(null, function (e) { ab.disabled = false; fail(e); }));
      return;
    } });
    /* the catalog button (and the dock's menu item) asks which catalog: the exercises' or the music's. A computer: the layer, switched to that catalog (pressing the one that is open closes it); a phone: the popup from the bottom, from anywhere the player is */
  function openCatalog(kind) {
    if (wide()) {
      ensureCatLayer();
      if (catPanel && pk.tab === kind) { closeCatPanel(); return; }
      pk.tab = kind; if (!catPanel) openCatPanel(); if (catLayer && catLayer.__api) catLayer.__api.goKind(kind);
    } else { pk.tab = kind; resetPk(); pickerSheet(); var cd0 = document.getElementById("catDlg"); if (cd0 && cd0.__api) cd0.__api.goKind(kind); }
  }
  function catalogMenu(anchor, opts) {
    var open = wide() ? !!catPanel : !!(document.getElementById("catDlg") || {}).open;
    menu(anchor, [{ label: "קטלוג תרגילים", icon: I.catalog, check: undefined, fn: function () { openCatalog("ex"); } }, { label: "קטלוג מוזיקות", icon: I.play, fn: function () { openCatalog("mu"); } }], opts);
  }
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-catopen]"); if (!b) return; catalogMenu(b, { end: true }); });
  pd.addEventListener("click", function (ev) { if (catPanel && pd.classList.contains("bio-dim")) closeCatPanel(); });   /* a tap on the dark side closes the layer, like any popup */
  /* wide screen: the vivencia list on the right, and after choosing one its exercises take that place and the open exercise is on the left. Back from the exercises is the vivencia list again. */
  function homeWide() { state.viv = null; state.lastItem = null; emptyDetail(); home(); }
  function emptyDetail() {
    if (wide()) show(phPick("בחרו ויוונסיה", "התרגילים שלה יופיעו כאן"), null, "d");
    state.viv = null; paintSel(); setUrl(BASE);
  }
  function paintSel() { pl.querySelectorAll("[data-vrow][data-id]").forEach(function (b) { b.setAttribute("aria-current", wide() && state.viv && b.dataset.id === state.viv.id ? "true" : "false"); }); }
  function on(root, act, fn) { root.querySelectorAll('[data-act="' + act + '"]').forEach(function (b) { b.addEventListener("click", function (ev) { fn(b, ev); }); }); }
  function stack() { return stack.s || (stack.s = []); }
  function go(fn) { stack().push(fn); fn(); }
  function back() { if (inSub() || (!wide() && curD() > 0)) { unwind(1); return; }   /* narrow: one level up IS the browser's Back, so the arrow and the button never differ */
    stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); else if (wide()) homeWide(); else home(); }

  /* ---------- gate ---------- */
  function gate(msg, signedIn) {
    show('<div class="rempty" style="margin-block:auto"><b>ביודנסה</b><span>' + esc(msg) + '</span>' +
      (signedIn ? '<button class="rbtn rbtn--ghost" data-act="out">יציאה</button>' : '<button class="rbtn" data-act="in">כניסה עם גוגל</button>') + '</div>', function (r) {
      on(r, "in", function (b) { FLOA_AUTH.signIn(location.origin + BASE); busy(b, new Promise(function (res) { window.addEventListener("pageshow", res, { once: true }); })); });   /* the page leaves for Google; coming back from the browser's history clears the wait */
      on(r, "out", function (b) { busy(b, Promise.resolve(FLOA_AUTH.signOut())).then(function () { location.reload(); }); });
    });
  }

  /* ---------- home: my vivencias ---------- */
  /* the vivencias I loved: my list, newest first; a row opens the vivencia */
  /* the lists of what I loved open on the left side on a wide screen (the right side keeps the list of vivencias), and as before on a narrow one */
  function showL(title, body, wire) {
    if (wide() && window.__showLeft) return window.__showLeft(head(title, "", true) + body, wire);
    var dlg = document.getElementById("likedDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "likedDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { title: title, from: "bottom", size: "l", body: body });
    wire(dlg);
  }
  function closeLiked() { var d = document.getElementById("likedDlg"); if (d && d.open) d.close(); }
  function closeLeft() { if (window.__closeHist) window.__closeHist(); }
  function likedVivScreen() {
    showL("ויוונסיות שאהבתי", '<div class="rlist" id="likv"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", wide() ? closeLeft : back);
      api("/rest/v1/vivencia_likes?select=vivencia_id&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likv"), list = (rows || []).map(function (x) { return state.vivs.filter(function (v) { return v.id === x.vivencia_id; })[0]; }).filter(Boolean);
        l.innerHTML = list.length ? vivGrid(list, "data-open") : ph("עוד אין ויוונסיות שאהבת", "לחצו על הלב ליד ויוונסיה כדי לשמור אותה כאן");
        l.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { closeLiked(); openViv(b.dataset.open); }); });
        l.querySelectorAll("[data-vm]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var v0 = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === b.dataset.vm; })[0]; if (v0) dupPopup(v0); }); }); l.querySelectorAll("[data-vvis]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var v0 = state.vivs.filter(function (x) { return x.id === b.dataset.vvis; })[0]; if (v0) sharePopup(v0); }); });
      }, fail);
    });
  }
  /* the exercises I loved: my list, newest first; the heart takes one off it */
  function likedExScreen() {
    showL("תרגילים שאהבתי", '<div class="rlist" id="likx"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", wide() ? closeLeft : back);
      /* the hearts of exercises are of two kinds and the menu counts both (likesEx): a catalog exercise (exercise_likes) and an exercise of a vivencia that has no catalog exercise (item_likes, key "item:<id>"); this list shows both, so the number and the list are one thing */
      Promise.all([api("/rest/v1/exercise_likes?select=exercises(id,title_he,title_en,category)&order=created_at.desc"), api("/rest/v1/item_likes?select=vivencia_items(id,title,exercise_id)&order=created_at.desc").catch(function () { return []; })]).then(function (res) {
        var l = r.querySelector("#likx");
        var list = (res[0] || []).map(function (x) { return x.exercises; }).filter(Boolean).map(function (e) { return { key: e.id, name: name(e), sub: catName(e.category) }; })
          .concat((res[1] || []).map(function (x) { return x.vivencia_items; }).filter(Boolean).map(function (it) { return { key: "item:" + it.id, name: it.title || "תרגיל ללא שם", sub: "" }; }));
        l.innerHTML = list.length ? list.map(function (e) {
          return '<div class="rrow" style="padding-inline:var(--gap);padding-block:var(--gap)">' + heartBtnEx(e.key, "rrow__trail") + '<div class="rrow__main" style="flex:1 1 0;min-width:0"><span class="rrow__title">' + esc(e.name) + '</span>' + (e.sub ? '<span class="rrow__sub">' + esc(e.sub) + '</span>' : '') + '</div></div>';
        }).join("") : ph("עוד אין תרגילים שאהבת", "לחצו על הלב בראש תרגיל כדי לשמור אותו כאן");
      }, fail);
    });
  }
  /* the songs I loved: my list, newest first, each as a song row (the heart takes a song off it) */
  function likedCard(m) {
    return songCardUi(m, { attrs: 'data-liked="' + esc(m.id) + '" role="button" tabindex="0"', title: songName(m), by: songBy(m), pill: cardPill(m), act: exBtnG(m) + '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' });   /* footEnd: the play tile at the left end, so the heart has the bottom right to itself */
  }
  function likedScreen() {
    showL("מוסיקה שאהבתי", '<div class="rlist" id="likl"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", wide() ? closeLeft : back);
      api("/rest/v1/song_likes?select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likl"), list = (rows || []).map(function (x) { return x.music; }).filter(Boolean);
        l.innerHTML = list.length ? cardGrid(list.map(function (m) { return likedCard(m); }).join("")) : ph("עוד אין מוסיקה שאהבת", "לחצו על הלב ליד מוסיקה כדי לשמור אותה כאן");
        l.addEventListener("click", function (ev) {   /* a tap on the card plays or pauses its song, as the history's cards do */
          var c = ev.target.closest && ev.target.closest("[data-liked]"); if (!c || ev.target.closest("[data-audio], a, [data-like], [data-yt], [data-upl]")) return;
          var pb = c.querySelector("[data-audio]"); if (pb) pb.click();
        });
      }, fail);
    });
  }
  /* the home list shows ONE of two lists, never the same vivencia in both (owner 2026-11-25):
     mine: I own it or I am a partner in it; the others': public ones of other people and ones shared with me for viewing only.
     All is the default; the choice is remembered on this device. */
  function showPubs() { if (state.offline) return false; try { var s = localStorage.getItem("biodanza.all"); if (s != null) return s === "1"; } catch (e) { /* none */ } return state.othersOn !== false; }   /* all is the default (owner 2026-11-25); a new key, so an older "mine" choice does not hide it */
  function homeTitle() { return showPubs() ? "כל הוויוונסיות" : "הוויוונסיות שלי"; }
  function pubTip() { return showPubs() ? "מוצגות כל הוויוונסיות. לחיצה: רק שלי" : "מוצגות הוויוונסיות שלי. לחיצה: כל הוויוונסיות"; }
  function pubBtn() { var t = pubTip(); return '<button class="rbtn rbtn--icon" data-act="pubs" aria-pressed="' + showPubs() + '" aria-label="' + t + '" title="' + t + '">' + (showPubs() ? I.globe : I.me) + '</button>'; }
  function homeList() {   /* the vivencias of the list now shown */
    var mine = function (v) { return v.role === "owner" || v.role === "edit"; };
    return showPubs() ? state.vivs.filter(mine).concat(state.vivs.filter(function (v) { return !mine(v); }), state.pubs || []) : state.vivs.filter(mine);   /* all: mine first, then the others' (owner 2026-11-25); each one once */
  }
  function home() {
    curLeave();
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    state.vq = "";
    show(head(homeTitle(), "", false,
      (state.offline ? '' : '<button class="rbtn rbtn--icon" data-act="vnew" aria-label="יצירת ויוונסיה" title="יצירת ויוונסיה">' + I.plus + '</button><button class="rbtn rbtn--icon" data-catopen aria-pressed="false" aria-label="קטלוג" title="קטלוג">' + I.catalog + '</button>') + '' + (state.offline ? '' : pubBtn()), '<button class="rbtn rbtn--icon" data-act="vsearch" aria-label="חיפוש" title="חיפוש">' + I.search + '</button>') +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '', function (r) {
      var plus0 = r.querySelector('[data-act="new"]'), dx0 = null; try { dx0 = localStorage.getItem("biodanza.plusdx"); } catch (e) { /* none */ }
      if (plus0 && dx0 != null && dx0 !== "") plus0.style.transform = "translateX(" + dx0 + "px)";   /* in its place from the first moment, before the list is here */
      on(r, "pubs", function (b) {   /* only mine, or also the public vivencias of the others: remembered on this device */
        var on2 = !showPubs(); state.othersOn = on2; try { localStorage.setItem("biodanza.all", on2 ? "1" : "0"); } catch (e) { /* only for this visit */ }
        var t = pubTip(); b.setAttribute("aria-pressed", String(showPubs())); b.setAttribute("aria-label", t); b.title = t; b.innerHTML = showPubs() ? I.globe : I.me;
        var tx = r.querySelector(".rhead .rhead__text"), h1 = r.querySelector(".rhead h1.rhead__title");
        if (h1) h1.textContent = homeTitle(); else if (tx && tx.__title != null) tx.__title = '<h1 class="rhead__title">' + esc(homeTitle()) + '</h1>';   /* the title says which list; while searching, the title that comes back does */
        renderVivs(); applyVq();
      });
      on(r, "vnew", newViv);
      on(r, "new", newViv);
      on(r, "vsearch", function (b) {   /* the title gives its place to a search field; the same button closes it and brings the title back */
        var tx = r.querySelector(".rhead .rhead__text"); if (!tx) return;
        if (tx.__title == null) {
          tx.__title = tx.innerHTML; tx.innerHTML = '<input id="vq" class="rhead__title" type="text" placeholder="חיפוש ויוונסיה" autocomplete="off" aria-label="חיפוש ויוונסיה">';
          b.innerHTML = I.x; b.setAttribute("aria-label", "סגירת חיפוש"); b.title = "סגירת חיפוש";
          var q = tx.querySelector("#vq"); q.addEventListener("input", function () { state.vq = q.value; applyVq(); });
          q.addEventListener("keydown", function (e) { if (e.key === "Escape") b.click(); });
          q.focus();
        } else {
          tx.innerHTML = tx.__title; tx.__title = null; state.vq = ""; applyVq();
          b.innerHTML = I.search; b.setAttribute("aria-label", "חיפוש"); b.title = "חיפוש";
        }
      });
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
    return Promise.all([api("/rest/v1/vivencias?select=id,title,updated_at,is_public,vivencia_items(count)&vivencia_items.backlog=not.is.true"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
      api("/rest/v1/vivencia_shares?email=eq." + encodeURIComponent(FLOA_AUTH.email().toLowerCase()) + "&select=vivencia_id,role,position"),
      api("/rest/v1/rpc/vivencia_partners", { method: "POST", json: {} }).catch(function () { return []; })]).then(function (r) {
      var partners = {}; (r[3] || []).forEach(function (x) { partners[x.vivencia_id] = x.names || []; });   /* a card's description: its partners (owners and who it is shared with for editing) */
      var pos = {}, role = {};
      (r[2] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = o.role; });   /* shared with me */
      (r[1] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = "owner"; });   /* mine: an owner is above any share */
      state.vivsLoaded = true;
      var rows = (r[0] || []).map(function (v) { v.pos = pos[v.id]; v.role = role[v.id] || "public"; v.partners = partners[v.id] || []; return v; });
      state.vivs = rows.filter(function (v) { return v.role !== "public"; });   /* mine and shared with me: my order, kept on the device */
      state.pubs = rows.filter(function (v) { return v.role === "public"; }).sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });   /* somebody else's public ones: read only, after mine, newest first, never kept on the device */
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
    s.style.cssText = "position:absolute;left:0;top:0;fill:none;stroke:var(--text-muted);stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;overflow:visible";
    s.innerHTML = '<path d="M' + f(sx) + " " + f(sy) + "C" + f(c1x) + " " + f(c1y) + " " + f(c2x) + " " + f(c2y) + " " + f(tx) + " " + f(ty) + '"/><path d="M' + f(h1[0]) + " " + f(h1[1]) + "L" + f(tx) + " " + f(ty) + "L" + f(h2[0]) + " " + f(h2[1]) + '"/>';
    l.appendChild(s);
    if (!l.__arrowRo && window.ResizeObserver) { l.__arrowRo = new ResizeObserver(function () { if (l.querySelector(".rempty")) arrowTo(l); }); l.__arrowRo.observe(l); }
  }
  function vivMenu(v, b) {   /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
    var items = [{ label: "שכפול", icon: I.copy || I.plus, fn: function () { dupPopup(v); } }];   /* renaming is a button in the vivencia's header; deleting was taken out of the menu by the owner */
    if (v.role === "owner") items.push({ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } });
    else if (v.role !== "public") items.push({ label: "הסרה שלי מהוויוונסיה", icon: I.out, tone: "danger", fn: function () { confirmLeave(v); } });
    if (state.offline) items.length = 0;   /* with no internet nothing changes: only the copy on the device can be taken off it */
    if (items.length) menu(b, items);
  }
  (function () { var st = document.createElement("style"); st.textContent = ".bio-card .bio-lk { display: none; place-items: center; padding: 0; background: transparent; border-color: transparent } .bio-card .bio-lk[aria-pressed=\"true\"], .bio-card.is-play .bio-lk, .bio-card:has([data-audio][data-st=\"pause\"]) .bio-lk { display: grid } .bio-card:has([data-choose]) .bio-lk { display: none !important } .bio-card [data-audio] svg, .bio-card [data-hp] svg, #imus .bio-card [data-audio] svg { width: var(--icon); height: var(--icon) } .bio-card [data-orm] { opacity: 0; transition: opacity var(--t-base) var(--ease) } .bio-card:hover [data-orm], .bio-card [data-orm]:focus-visible { opacity: 1 } @media (hover: none) { .bio-card [data-orm] { opacity: 1 } } #list[data-fab-room] { padding-bottom: var(--gap) } .rbtn[data-recvloop], .rbtn[data-recvloop]:hover, .rbtn[data-recvloop]:active, .rbtn[data-recvloop]:focus, .rbtn[data-recvloop][aria-pressed=\"true\"], .rhead .rbtn[data-recvloop]:hover, .rhead .rbtn[data-recvloop]:active { background: transparent; border-color: transparent; box-shadow: none; color: var(--text-muted) } .rbtn[data-recvloop][aria-pressed=\"true\"], .rbtn[data-recvloop][aria-pressed=\"true\"]:hover, .rbtn[data-recvloop][aria-pressed=\"true\"]:active { color: var(--danger) } .rhead .rbtn--icon[data-act=\"back\"] { margin-inline-start: 0 } .rhead .rbtn--icon[data-act=\"back\"], .rhead .rbtn--icon[data-act=\"back\"]:hover, .rhead .rbtn--icon[data-act=\"back\"]:active { background: transparent; border-color: transparent }   @media (hover: none) {  }"; document.head.appendChild(st); })();
  /* the vivencia the song that plays comes from is marked red in the list, like the exercise that plays inside it */
  var nowViv = { name: "", id: null, num: "", playing: false };
  function placeOf(items, name) {   /* the place of the exercise whose song plays, as on its card: a number, a dot for an additional one, nothing for the start and the end music */
    var has = function (m) { return !!(m && m.audio_object === name); };
    var it = (items || []).filter(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); })[0];
    if (!it) return "";
    return it.backlog ? "•" : String((items || []).filter(function (x) { return !x.backlog; }).indexOf(it) + 1);
  }
  function songInList(items, recv, name) {
    var has = function (m) { return !!(m && m.audio_object === name); };
    return (items || []).some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) || (recv || []).some(function (o) { return has(o.music); });
  }
  function alignPlus() {   /* the + of the header is over the sign of the exercises of the rows, the same centre */
    var plus = document.querySelector('#pl [data-act="new"]'), ic = document.querySelector("#hl .bio-vcnt__c");
    if (!plus) return; plus.style.transform = "";
    if (!ic) return;
    var pr = plus.getBoundingClientRect(), ir = ic.getBoundingClientRect();
    if (pr.width && ir.width) { var dx = Math.round(ir.left + ir.width / 2 - (pr.left + pr.width / 2)); plus.style.transform = "translateX(" + dx + "px)"; try { localStorage.setItem("biodanza.plusdx", String(dx)); } catch (e) { /* kept only for this visit */ } }   /* both are measured from the left side of the pane, so the shift is the same on every width: it is kept, and the next load starts in place */
  }
  function paintVivPlay() {
    alignPlus();   /* a small mark at the left of the vivencia's row: the number of the exercise that plays over the curve */
    document.querySelectorAll("[data-vrow]").forEach(function (r) {   /* the card of the vivencia whose song plays carries the sound's curve, like an exercise card that plays (owner 2026-11-25); no number on it */
      var on = !!(nowViv.playing && nowViv.id && nowViv.id === r.dataset.vrow);
      r.classList.toggle("is-vplay", on);
      var old = r.querySelector(".bio-vsym"); if (old) old.remove();
    });
  }
  window.addEventListener("resize", function () { paintVivPlay(); });
  function trackVivPlay(d) {
    var start = !!d.playing && (!nowViv.playing || nowViv.name !== d.name);   /* a song starts (or another one does): where it comes from is decided now, not on every tick */
    nowViv.playing = !!d.playing;
    if (start) {
      var same = nowViv.name === d.name, prevId = nowViv.id, prevNum = nowViv.num;
      nowViv.name = d.name; nowViv.id = null; nowViv.num = "";
      if (state.viv && songInList(state.items, (recvCache[state.viv.id + "|start"] || []).concat(recvCache[state.viv.id + "|end"] || []), d.name)) { nowViv.id = state.viv.id; nowViv.num = placeOf(state.items, d.name); }   /* started inside the open vivencia */
      else if (same && prevId) { nowViv.id = prevId; nowViv.num = prevNum; }   /* the same song again, from the list or the player: still that vivencia */
      else if (window.BioOffline && BioOffline.ready) BioOffline.ready.then(function () { return BioOffline.list(); }).then(function (recs) {   /* from somewhere else: the first kept vivencia that has it */
        if (nowViv.name !== d.name || nowViv.id) return;
        var rec = (recs || []).filter(function (r) { return songInList(r.items, r.reception, d.name); })[0];
        if (rec) { nowViv.id = rec.id; nowViv.num = placeOf(rec.items, d.name); paintVivPlay(); }
      }, function () { /* no mark then */ });
    }
    paintVivPlay();
  }
  /* THE VIVENCIA CARD (owner 2026-11-25: the list is cards): the name, under it who it is shared by, at the end the exercise count with its wave glyph and the menu. ONE builder for the home list and the liked list; mainAttr is the only difference (what the card opens). */
  function vivRow(v, mainAttr) {
    var pub = v.is_public !== false, vt = pub ? "ציבורית: כל המאפשרים רואים אותה" : "פרטית: רק מי שהיא משותפת איתו רואה אותה";
    var cnt = v.role === "owner" && !state.offline
      ? '<button type="button" class="rbtn rbtn--icon" data-vvis="' + v.id + '" aria-haspopup="dialog" aria-label="' + vt + '. לחיצה לשינוי" title="' + vt + '. לחיצה לשינוי">' + (pub ? I.globe : I.lock) + '</button>'   /* the owner changes it right here, with the same popup as in the vivencia's header */
      : '<span class="bio-vcnt" role="img" aria-label="' + vt + '" title="' + vt + '"><span class="bio-vcnt__c" aria-hidden="true">' + (pub ? I.globe : I.lock) + '</span></span>';   /* where the exercise count was: who can see it (owner 2026-11-25) */
    var more = state.offline ? '' : '<button type="button" class="rbtn rbtn--icon" data-vm="' + v.id + '" aria-haspopup="dialog" aria-label="שכפול" title="שכפול">' + I.copy + '</button>';   /* the card's one action: a copy, with its popup (owner 2026-11-25); sharing and leaving are in the vivencia's own menu */
    var sub = (v.partners || []).join(", ");   /* the title is the name; the description is who its partners are */
    return cardSlots({ cls: "bio-vcard", attrs: 'data-vrow="' + v.id + '" ' + mainAttr + '="' + v.id + '" role="button" tabindex="0"', title: v.title || "ויוונסיה ללא שם", sub: sub, act1: cnt + more });
  }
  function vivGrid(list, mainAttr) { return '<div class="rgrid rgrid--pad">' + list.map(function (v) { return vivRow(v, mainAttr); }).join("") + '</div>'; }
  function applyVq() {   /* the rows whose name does not match what is typed are not shown */
    var l = document.getElementById("hl"); if (!l) return; var q = state.vq || "";
    l.querySelectorAll("[data-vrow]").forEach(function (row) {
      var v = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === row.dataset.vrow; })[0];
      row.style.display = !q || !v || fz((v.title || "") + " " + (v.partners || []).join(" "), q) ? "" : "none";   /* the name, or a facilitator shown on the card (owner 2026-11-25) */
    });
  }
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    var list = homeList();
    l.innerHTML = list.length ? vivGrid(list, "data-id") : showPubs() ? ph("עוד אין ויוונסיות", "פתחו את התפריט ובחרו ביצירת ויוונסיה") : (state.offline ? ph("אין ויוונסיות שמורות", "שמרו ויוונסיה מהתפריט שלה כשיש חיבור, והיא תהיה כאן גם בלי אינטרנט") : ph("עוד אין ויוונסיות", "פתחו את התפריט ובחרו ביצירת ויוונסיה"));
    if (!list.length) { l.style.position = "relative"; if (l.firstElementChild) l.firstElementChild.style.marginBlock = "auto"; arrowTo(l); setTimeout(function () { arrowTo(l); }, 350); }   /* the arrow is a second child, so the words are centred by hand (the kit does it only for an only child) */
    l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); b.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target === b) { e.preventDefault(); openViv(b.dataset.id); } }); });   /* a card is a button: the keyboard opens it too */
    l.querySelectorAll("[data-vm]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var v0 = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === b.dataset.vm; })[0]; if (v0) dupPopup(v0); }); }); l.querySelectorAll("[data-vvis]").forEach(function (b) { b.addEventListener("click", function (ev) { ev.stopPropagation(); var v0 = state.vivs.filter(function (x) { return x.id === b.dataset.vvis; })[0]; if (v0) sharePopup(v0); }); });   /* the dots on a row of the list: that vivencia's menu */
    if (state.vivs.length) enableDrag(l, "[data-id]", persistVivs);
    paintSel(); paintVivPlay(); applyVq();
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
      busy(btn, api("/rest/v1/rpc/duplicate_vivencia", { method: "POST", json: { src: v.id, p_id: nid, p_title: t } }).then(function () {
        dlg.close();
        state.vivs.unshift({ id: nid, title: t, role: "owner", updated_at: new Date().toISOString() });
        if (document.getElementById("hl")) renderVivs();
        persistVivs(0, 0);   /* it goes first, like a new one */
      }, function (e) { btn.disabled = false; fail(e); }));
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
  function facChip(it, extra, asText) {
    if (!facOn()) return "";
    var has = facEmails(it).length > 0;
    /* the leader is a TEXT BUTTON (law: object type "כפתור טקסט"): the name of the leader, tapped to change it through the existing leader menu (data-fac) */
    if (!asText) {   /* the header's tabs on a phone keep the chip */
      if (!canEdit()) return has ? '<span class="rchip' + (extra || "") + '" data-fac-label="' + it.id + '">' + esc(facLabel(it)) + '</span>' : "";
      return '<button type="button" class="rchip rchip--button' + (extra || "") + '" data-fac="' + it.id + '" aria-haspopup="menu" aria-pressed="' + has + '">' + esc(facLabel(it)) + '</button>';
    }
    if (!canEdit()) return has ? '<button type="button" class="rbtn--text' + (extra || "") + '" disabled data-fac-label="' + it.id + '">' + esc(facLabel(it)) + '</button>' : "";
    return '<button type="button" class="rbtn--text' + (extra || "") + '" data-fac="' + it.id + '" aria-haspopup="menu" aria-pressed="' + has + '">' + esc(facLabel(it)) + '</button>';
  }
  function facRefresh(it) {
    document.querySelectorAll('[data-fac="' + it.id + '"]').forEach(function (b) { b.textContent = facLabel(it); b.setAttribute("aria-pressed", String(facEmails(it).length > 0)); });
  }
  /* the menu of people: a tick adds or removes one, the menu stays open so several can be ticked (the one menu, with ticked items) */
  function facMenu(btn, it) {
    menu(btn, function () {
      var on = facEmails(it);
      return state.members.map(function (x) {
        return { label: x.note || x.email, check: on.indexOf(x.email) >= 0, keep: true, fn: function (b, close, repaint) {
          var has = facEmails(it).indexOf(x.email) >= 0;
          var req = has ? api("/rest/v1/vivencia_item_facilitators?item_id=eq." + it.id + "&email=eq." + encodeURIComponent(x.email), { method: "DELETE" })
                        : api("/rest/v1/vivencia_item_facilitators", { method: "POST", prefer: "return=minimal", json: { item_id: it.id, email: x.email } });
          busy(b, req);
          req.then(function () {
            it.vivencia_item_facilitators = has ? (it.vivencia_item_facilitators || []).filter(function (y) { return y.email !== x.email; }) : (it.vivencia_item_facilitators || []).concat([{ email: x.email }]);
            repaint(); facRefresh(it);
          }, fail);
        } };
      });
    }, { end: true });
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

  /* THE menu of the app (law 3): every menu, whatever it holds, is made here and nowhere else.
     items: an array, or a function that returns one (called again by repaint)
     item: { label, icon, tone, meta, fn, keep (fn(btn, close, repaint): the menu stays open), check (true/false: a ticked item), disabled }
     opts: head (a block above the items), foot (buttons below), up (opens upwards, from opts.ref's top if given), end (hangs from the button's end edge), fit (as wide as its content) */
  function menu(btn, items, opts) {
    opts = opts || {};
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    var blank = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>', list = [];
    function paint() {
      list = typeof items === "function" ? items() : items;
      m.innerHTML = (opts.head || "") + '<div class="rmenu__list">' + list.map(function (it, k) {
        if (it.disabled) return '<div class="rmenu__item" role="menuitem" aria-disabled="true" style="opacity:.6;pointer-events:none"><span>' + esc(it.label) + '</span></div>';
        var tick = it.check !== undefined;
        return '<button type="button" class="rmenu__item" role="' + (tick ? 'menuitemcheckbox" aria-checked="' + it.check : 'menuitem') + '" data-k="' + k + '"' + (it.tone ? ' data-tone="' + it.tone + '"' : '') + '>' + (tick ? (it.check ? I.check : blank) : (it.icon || "")) + '<span>' + esc(it.label) + '</span>' + (it.meta ? '<span data-meta style="margin-inline-start:auto;display:inline-flex;align-items:center;gap:var(--gap);color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/1 var(--font);font-variant-numeric:tabular-nums">' + it.meta + '</span>' : '') + '</button>';
      }).join("") + '</div>' + (opts.foot ? '<div class="rmenu__foot">' + opts.foot.map(function (f, k) { return '<button type="button" class="rbtn rbtn--block' + (f.primary ? ' rbtn--primary' : '') + '" data-f="' + k + '"' + (f.disabled ? ' disabled' : '') + (f.ghost ? ' style="background:transparent;border-color:transparent;color:var(--primary)"' : '') + '>' + esc(f.label) + '</button>'; }).join("") + '</div>' : "");
      m.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { var it = list[+b.dataset.k]; if (it.keep) { it.fn(b, close, paint); return; } var f = it.fn; close(); f(); }); });   /* an item with keep leaves the menu open: it shows its own progress */
      if (opts.foot) m.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { var f = opts.foot[+b.dataset.f].fn; close(); f(); }); });
    }
    paint();
    var sh = document.createElement("div"); sh.style.cssText = "position:fixed;inset:0;z-index:var(--z-menu);background:transparent;touch-action:none";   /* an open menu blocks everything outside it: a touch there only closes the menu */
    /* a popup (a modal dialog) makes everything outside it inert and keeps its own layer above the page: the menu and its shield are put INSIDE the upper popup, or a tap on them falls through to what is under */
    var hostDlg = [].slice.call(document.querySelectorAll("dialog[open]")).pop() || document.body; hostDlg.appendChild(sh); hostDlg.appendChild(m);
    sh.style.cssText += ";margin:0;padding:0;border:0;width:100%;height:100%;overflow:visible";
    m.style.setProperty("right", "auto"); m.style.setProperty("bottom", "auto"); m.style.setProperty("margin", "0");
    btn.setAttribute("aria-expanded", "true");   /* the button that opened the menu stays shown while it is open */
    if (opts.fit) { m.style.minWidth = "0"; m.style.width = "max-content"; }
    var r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight, top, left = opts.end ? r.right - w : r.left;
    if (opts.up) top = (opts.ref ? opts.ref.getBoundingClientRect().top : r.top) - 8 - h;
    else { top = r.bottom + 4; if (top + h > innerHeight - 8 && r.top - 4 - h >= 8) top = r.top - 4 - h; }   /* no room below: it flips above */
    m.style.top = Math.max(8, Math.round(top)) + "px"; m.style.left = Math.max(8, Math.min(Math.round(left), innerWidth - w - 8)) + "px";
    function close() { m.remove(); sh.remove(); btn.removeAttribute("aria-expanded"); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
    var first = m.querySelector(".rmenu__item"); if (first) first.focus({ preventScroll: true });
  }

  /* sharing: only with accounts of the allowlist (chosen from it, never typed), as a viewer or an editor */
  /* SHARING SETTINGS (owner 2026-11-25), the side panel on a computer, a sheet on a phone:
     public or private; the partners (shared for editing); the viewers (shared for viewing), shown only while it is private.
     Making it public keeps the viewers in the database, so making it private again brings them back as they were. */
  function sharePopup(v) {
    var dlg = document.getElementById("shareDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "shareDlg"; document.body.appendChild(dlg); }
    var shares = [], cands = [], ready = false;   /* ready: the list has arrived (until then the skeleton stays, typing does not draw an empty state) */
    var shareBody = '<div id="svis"></div><div class="pad"><label class="rfield"><span>הוספת אדם (אימייל או שם)</span><input id="sq" type="search" placeholder=" " autocomplete="off"></label></div><div id="slist"><div class="rskel rskel--title"></div></div>';
    if (wide() && window.__showLeft) window.__showLeft(head(v.title || "ויוונסיה ללא שם", "", true) + '<div class="rlist">' + shareBody + '</div>', function (r) { dlg = r; on(r, "back", closeLeft); });   /* law 6: a long window is the side panel, the same left layer as the history and the liked lists */
    else RosterSheet.render(dlg, { title: v.title || "ויוונסיה ללא שם", from: "bottom", body: shareBody });   /* the title is the vivencia's name (owner 2026-11-25) */
    function isPub() { return v.is_public !== false; }
    function who(e) { var c = cands.filter(function (x) { return x.email === e; })[0]; return c && c.note ? c.note : e; }
    function paintVis() {   /* the two choices, the one that holds is pressed */
      var row = function (pub, label, sub) { var on = isPub() === pub; return '<button type="button" class="rpick" data-svis="' + (pub ? 1 : 0) + '" aria-pressed="' + on + '"><span aria-hidden="true" class="ricon">' + (pub ? I.globe : I.lock) + '</span><span class="rpick__t" style="white-space:normal">' + label + '<br><span style="color:var(--text-muted);font-size:var(--fs-s)">' + sub + '</span></span>' + (on ? '<span aria-hidden="true" class="ricon ricon--primary">' + I.check + '</span>' : '') + '</button>'; };
      var box = dlg.querySelector("#svis");
      box.innerHTML = '<div class="pad" style="display:flex;flex-direction:column;gap:var(--gap-tight)">' + row(true, "ציבורית", "כל המאפשרים רואים אותה, לצפייה בלבד") + row(false, "פרטית", "רק השותפים והצופים שבחרת רואים אותה") + '</div>';
      box.querySelectorAll("[data-svis]").forEach(function (b) { b.addEventListener("click", function () {
        var pub = b.dataset.svis === "1"; if (pub === isPub()) return;
        busy(b, api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { is_public: pub } })).then(function () {
          v.is_public = pub; state.vivs.forEach(function (x) { if (x.id === v.id) x.is_public = pub; }); if (state.viv && state.viv.id === v.id) state.viv.is_public = pub;
          toast(pub ? "הוויוונסיה ציבורית" : "הוויוונסיה פרטית"); paintVis(); paintS(); renderVivs();
          document.querySelectorAll('[data-act="vis"]').forEach(function (h) { var t = visTip(v); h.setAttribute("aria-label", t); h.title = t; h.innerHTML = pub ? I.globe : I.lock; });
        }, fail);
      }); });
    }
    function paintS() {
      if (!ready) return;
      var q = fold(dlg.querySelector("#sq").value.trim()), l = dlg.querySelector("#slist");
      var have = {}; shares.forEach(function (x) { have[x.email] = 1; });
      var hit = function (x) { return !q || fz(x.email + " " + who(x.email), q); };
      var partners = shares.filter(function (x) { return x.role === "edit" && hit(x); }), viewers = isPub() ? [] : shares.filter(function (x) { return x.role !== "edit" && hit(x); });
      var rest = q ? cands.filter(function (c) { return !have[c.email] && fz(c.email + " " + (c.note || ""), q); }) : [];   /* the people who are not shared yet show only when you search for them */
      var title2 = function (t) { return '<div class="rdiv"><span class="rdiv__l">' + t + '</span></div>'; };   /* the group label is the list's divider (the one divider type), not a row of its own */
      var cards = function (list) { return '<div class="rgrid rgrid--pad">' + list.map(function (x) {
        var nm = who(x.email), chip = isPub() ? '' : '<button type="button" class="rchip rchip--info rchip--s" data-chiprole="' + esc(x.email) + '" aria-haspopup="menu">' + (x.role === "edit" ? "שותף" : "צפייה") + '</button>';   /* while private the chip moves a person between partner and viewer */
        return cardSlots({ attrs: 'data-scard="' + esc(x.email) + '" role="button" tabindex="0"', title: nm, sub: nm !== x.email ? x.email : "", chip: chip });
      }).join("") + '</div>'; };
      var none = function (t) { return '<div class="pad" style="color:var(--text-muted)">' + t + '</div>'; };
      var html = title2("שותפים לעריכה") + (partners.length ? cards(partners) : none(q ? "לא נמצא שותף" : "עוד אין שותפים"));
      if (!isPub()) html += title2("צופים") + (viewers.length ? cards(viewers) : none(q ? "לא נמצא צופה" : "עוד אין צופים"));
      if (rest.length) {
        html += title2("הוספה") + '<div class="rgrid rgrid--pad">' + rest.map(function (c) {
          return cardSlots({ attrs: 'data-add="' + esc(c.email) + '" role="button" tabindex="0"', title: c.note || c.email, sub: c.note ? c.email : "", act1: '<span aria-hidden="true" class="ricon ricon--primary">' + I.plus + '</span>' });
        }).join("") + '</div>';
      } else if (q && !partners.length && !viewers.length) html += ph("לא נמצא", "אפשר לשתף רק עם חשבונות מרשימת המורשים.");
      l.innerHTML = html;
      l.querySelectorAll("[data-chiprole]").forEach(function (b) { b.addEventListener("click", function (e) {
        e.stopPropagation(); var em = b.dataset.chiprole, cur = (shares.filter(function (x) { return x.email === em; })[0] || {}).role;
        menu(b, [["view", "צפייה"], ["edit", "שותף"]].map(function (r) { return { label: r[1], check: cur === r[0], fn: function () { if (cur !== r[0]) setRole(em, r[0]); } }; }), { fit: true });
      }); });
      l.querySelectorAll("[data-scard]").forEach(function (c) {
        function open() { var em = c.dataset.scard; menu(c, [{ label: "הסרה", icon: I.trash, tone: "danger", fn: function () { api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(em), { method: "DELETE" }).then(load, fail); } }], { fit: true }); }
        c.addEventListener("click", open); c.addEventListener("keydown", function (e) { if (e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } });
      });
      l.querySelectorAll("[data-add]").forEach(function (b) { b.addEventListener("click", function () { busy(b, api("/rest/v1/vivencia_shares", { method: "POST", prefer: "return=minimal", json: { vivencia_id: v.id, email: b.dataset.add, role: isPub() ? "edit" : "view" } }).then(function () { dlg.querySelector("#sq").value = ""; return load(); }, fail)); }); });   /* public: a new person is a partner (everybody sees it anyway); private: a viewer, the chip makes a partner */
    }
    function setRole(e, role) { return api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(e), { method: "PATCH", json: { role: role } }).then(load, fail); }
    function load() {
      return Promise.all([api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&select=email,role&order=created_at"), api("/rest/v1/rpc/share_candidates", { method: "POST", json: {} })]).then(function (r) { shares = r[0] || []; cands = r[1] || []; ready = true; paintS(); }, function (er) { if (!ready) dlg.querySelector("#slist").innerHTML = ph("לא הצלחנו לטעון", "בדקו את החיבור ונסו שוב."); fail(er); });
    }
    dlg.querySelector("#sq").addEventListener("input", paintS);
    paintVis(); load();
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
      busy(dlg.querySelector("#cdel"), api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "DELETE" })).then(function () { dlg.close(); toast("התרגיל הוסר"); state.lastItem = null;
        if (wide()) { show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); setUrl(BASE + state.viv.id); loadItems().then(paint, fail); } else back(); }, fail);
    });
  }
  /* the name (the theme) of a vivencia is set here, from the list: the kit's popup with a header check to save */
  /* the name of an exercise, written in a popup of its own: the keyboard, the selection, copy and paste work as in any field, nothing behind is touched */
  function itemNameDialog(inp) {
    var dlg = document.getElementById("inameDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "inameDlg"; document.body.appendChild(dlg); }
    var start = inp.value, done = false;
    RosterSheet.render(dlg, { title: "שם התרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><label class="rfield"><span>שם התרגיל</span><input id="inm" placeholder=" " autocomplete="off" enterkeyhint="done" value="' + esc(start) + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="inmok">שמירה</button>' });
    var f = dlg.querySelector("#inm");
    function commit() {
      if (done) return; done = true;
      var sp = document.querySelector("#itemDlg .bio-tab.is-cur [data-nameedit]"); if (sp) sp.textContent = f.value.trim() || "ללא שם";
      if (f.value !== start) { inp.value = f.value; inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); }
      dlg.removeEventListener("close", commit);
    }
    dlg.addEventListener("close", commit);
    dlg.querySelector("#inmok").addEventListener("click", function () { commit(); dlg.close(); });
    f.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); dlg.close(); } });
    setTimeout(function () { f.focus(); f.select(); }, 80);
  }
  function namePopup(v, isNew, anchor) {   /* anchor: the control that opened it; on a computer the popup opens next to it */
    var dlg = document.getElementById("nameDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "nameDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: isNew ? "ויוונסיה חדשה" : "שינוי שם", from: "bottom", size: "s", anchor: anchor,
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
      busy(dlg.querySelector("#nsave"), (isNew ? api("/rest/v1/vivencias", { method: "POST", json: { id: v.id, title: t }, prefer: "return=minimal" })
             : api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { title: t, updated_at: new Date().toISOString() } }))).then(done, fail);
    }
    dlg.querySelector("#nsave").addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  /* ---------- the vivencia: plan along the curve ---------- */
  function openViv(id) { if (!state.viv || state.viv.id !== id) state.lastItem = null; state.filter = ""; state.viv = state.vivs.concat(state.pubs || []).filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) { stack().length = 0; show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); } go(editor); paintSel(); }
  var ITEM_SELECT = "&select=id,position,exercise_id,music_id,backlog,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,level,curve,level_basis,curve_basis,source)),music!music_id(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email),item_music_options(music_id,created_at,music(id,name,title,artist,duration_sec,audio_object,in_catalog))&order=position";
  var recvCache = {};   /* the songs of the start and of the end of each vivencia: id|start, id|end */
  function itemsOf(id) {
    var rp = api("/rest/v1/vivencia_reception_music?vivencia_id=eq." + id + "&select=kind,music_id,created_at,position,music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=position.asc.nullslast,created_at.asc").then(function (rows) {
      var st = [], en = [];
      (rows || []).forEach(function (x) { if (x.music) (x.kind === "end" ? en : st).push({ music_id: x.music_id, created_at: x.created_at, position: x.position, music: x.music }); });
      recvCache[id + "|start"] = st; recvCache[id + "|end"] = en;
    }, function () { /* no such songs now */ });
    var op = api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&select=who,body,position&order=position.asc").then(function (rows) { openCache[id] = rows || []; }, function () { /* no opening now */ });
    return Promise.all([api("/rest/v1/vivencia_items?vivencia_id=eq." + id + ITEM_SELECT), rp, op]).then(function (r) { return r[0]; });
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
  /* the three parts of a vivencia are accordions: the arrow sits next to the title; only the vivencia itself is open until somebody opens another */
  var accOpen = {};
  function accIsOpen(kind) { var k = (state.viv && state.viv.id) + "|" + kind; return accOpen[k] != null ? accOpen[k] : kind === "ex"; }
  /* THE SECTION HEADER (law 4): the title with its fold arrow and, at the end, ONE group of icon buttons (--gap-section between them); no buttons, no group. Every section uses it. */
  function secHead(kind, label, endHtml) { return '<div class="racc__bar">' + accHead(kind, label) + (endHtml ? '<span class="rgroup">' + endHtml + '</span>' : '') + '</div>'; }
  function accHead(kind, label) {
    var on = accIsOpen(kind);
    return '<button type="button" class="racc__head" data-acc="' + kind + '" aria-expanded="' + on + '"><span class="rrow__title" style="font-weight:var(--fw-bold)">' + label + '</span><span class="racc__chev" aria-hidden="true">' + I.down + '</span></button>';
  }
  /* THE FOLD ROW: a row whose whole face folds a group open. The title at the start, then the count and the arrow at the end, in ONE line. */
  function foldRow(attr, title, sub, count, on, line) {
    return '<div class="rrow rrow--link racc__row"' + (line ? ' style="border-bottom-color:' + (on ? "transparent" : "var(--border)") + '"' : '') + '><button type="button" class="rrow__main" ' + attr + ' aria-expanded="' + on + '"><span class="racc__title"><span class="rrow__title">' + title + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</span>' + (count != null ? '<span class="racc__count" data-catn>' + count + '</span>' : '') + '<span class="racc__chev" aria-hidden="true">' + I.down + '</span></button></div>';
  }
  function accOpenTag(kind) { return '<div class="racc__body" data-accb="' + kind + '"' + (accIsOpen(kind) ? '' : ' data-closed') + '><div>'; }
  var ACC_CLOSE = '</div></div>';
  var PAUSEI = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';
  function recvPlaying(kind) {   /* the song that is loaded now belongs to this section */
    var nw = window.__bioNow || {}; if (!nw.name || !state.viv) return false;
    return optList(recvItem(kind)).some(function (m) { return m.audio_object === nw.name; });
  }
  document.addEventListener("bioaudio", function () {   /* the play button of a section is a pause while one of its songs plays */
    document.querySelectorAll("[data-recvplay]").forEach(function (b) { var on = recvPlaying(b.dataset.recvplay) && !!(window.__bioNow || {}).playing; b.innerHTML = on ? PAUSEI : I.play; b.style.color = on ? "var(--danger)" : "var(--text)"; b.setAttribute("aria-label", on ? "השהיה" : "השמעה"); });
  });
  /* a section of only songs: "מוסיקת התחלה" above the exercises, "מוסיקת סיום" under them */
  function timerToggle(el, on) {   /* the time left comes in and goes out with a short move and fade (transform and opacity only) */
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (on) {
      el.classList.remove("is-out");
      if (el.hidden || el.__leaving) { el.__leaving = false; el.hidden = false; el.classList.remove("is-in"); void el.offsetWidth; if (!reduce) el.classList.add("is-in"); }
      return;
    }
    if (el.hidden || el.__leaving) return;
    if (reduce) { el.hidden = true; return; }
    el.__leaving = true; el.classList.remove("is-in"); el.classList.add("is-out");
    setTimeout(function () { if (el.__leaving) { el.__leaving = false; el.hidden = true; el.classList.remove("is-out"); } }, 190);
  }
  function recvHtml(kind) {
    var list = optList(recvItem(kind)), edit = canEdit();
    if (!edit && !list.length) return "";
    var label = kind === "start" ? "מוסיקת התחלה" : "מוסיקת סיום";
    var key = state.viv.id + "|" + kind;
    var play = list.length > 1 ? '<button type="button" class="rbtn rbtn--icon' + (loopLive(kind) ? ' is-live' : '') + '" data-recvloop="' + kind + '" aria-pressed="' + loopOn(kind) + '" aria-label="לולאה" title="לולאה: כשמנגנים מוסיקה מהקטע, המוסיקה ממשיכה אחד אחרי השני ובסוף חוזרים להתחלה">' + I.loop + '</button>' : '';
    var pOn = recvPlaying(kind) && !!(window.__bioNow || {}).playing;
    var playBtn = list.length ? '<button type="button" class="rbtn rbtn--icon" data-recvplay="' + kind + '" aria-label="' + (pOn ? "השהיה" : "השמעה") + '" style="background:transparent;border-color:transparent;color:' + (pOn ? 'var(--danger)' : 'var(--text)') + '">' + (pOn ? PAUSEI : I.play) + '</button>' : '';
    var add = edit ? '<button type="button" class="rbtn rbtn--ghost rbtn--block" data-addm><span aria-hidden="true" class="ricon ricon--primary">' + I.plus + '</span>הוספת מוזיקה</button>' : '';
    return '<div data-recv="' + kind + '" >' + secHead(kind, label + " (" + list.length + ")", playBtn + play + (edit ? '<button type="button" class="rbtn rbtn--icon" data-addm aria-label="הוספת מוזיקה" title="הוספת מוזיקה">' + I.plus + '</button>' : '')) + accOpenTag(kind) +
      '<div class="rgrid">' + list.map(function (m) { var nw = window.__bioNow || {}; return optCardHtml(m, !!(nw.playing && m.audio_object && nw.name === m.audio_object), edit, true, key, true); }).join("") + '</div>' + ACC_CLOSE + '</div>';
  }
  /* the opening of the evening: a free text (kept only where there is nobody to add) and a section for each leader who says something before the evening
     (a black chip, the words under it, indented; the chip folds the section). One row per section in biodanza.vivencia_opening, who = '' for the free text:
     a save sends only the row that was changed, and a change from somebody else is written into the boxes I am not typing in. */
  var openCache = {};   /* vivencia id -> [{ who, body, position }] */
  function openRows(id) { return (openCache[id || state.viv.id] || []).slice().sort(function (x, y) { return (x.position | 0) - (y.position | 0); }); }
  function openFreeText() { var r = openRows().filter(function (x) { return x.who === ""; })[0]; return r ? r.body : ""; }
  function openSum(t) { return String(t || "").replace(/[*]{2}/g, "").replace(/\s+/g, " ").trim(); }   /* a folded section tells its words in one line, up to the bin */
  function openLocal(who, body) {   /* what I typed is in the cache at once, so a repaint draws the same words */
    var id = state.viv.id, list = openCache[id] || (openCache[id] = []), r = list.filter(function (x) { return x.who === who; })[0];
    if (r) r.body = body; else { r = { who: who, body: body, position: list.reduce(function (m, x) { return Math.max(m, x.position | 0); }, 0) + 1 }; list.push(r); }
    return r;
  }
  function openPut(who, body) {   /* the one row, to the server */
    var id = state.viv.id, r = openLocal(who, body);
    return api("/rest/v1/vivencia_opening?on_conflict=vivencia_id,who", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", json: { vivencia_id: id, who: who, body: body, position: r.position } }).then(function () { refreshOffline(state.viv); }, fail);
  }
  function openDel(who) {
    var id = state.viv.id; openCache[id] = (openCache[id] || []).filter(function (x) { return x.who !== who; });
    return api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&who=eq." + encodeURIComponent(who), { method: "DELETE" }).then(function () { refreshOffline(state.viv); }, fail);
  }
  function openMove(k, to) {   /* a section carried from place k to place to: the order is kept in position, one row each */
    var id = state.viv.id, secs = openRows().filter(function (x) { return x.who !== ""; });
    if (k === to || !secs[k] || to < 0 || to >= secs.length) return;
    var it = secs.splice(k, 1)[0]; secs.splice(to, 0, it);
    secs.forEach(function (q, i) { q.position = i + 1; });
    paint();
    secs.forEach(function (q) { api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&who=eq." + encodeURIComponent(q.who), { method: "PATCH", json: { position: q.position }, prefer: "return=minimal" }).then(null, fail); });
  }
  function printOpening() {   /* only the opening of the evening: the free text and every leader's words, on paper */
    var v = state.viv; if (!v) return;
    var free = openFreeText(), secs = openRows().filter(function (x) { return x.who !== ""; });
    var html = '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>' + esc(v.title || "פתיחת הערב") + '</title><style>@page { margin: 16mm } body { font: 21px/1.6 Heebo, Arial, sans-serif; color: #000; margin: 0 } h1 { font-size: 36px; font-weight: 900; margin: 0 0 6px; line-height: 1.2 } h2 { font-size: 32px; font-weight: 900; line-height: 1.2; margin: 30px 0 8px; padding-bottom: 5px; border-bottom: 3px solid #000; color: #000; break-after: avoid } .sub { font-size: 21px; font-weight: 700; color: #333; margin: 0 0 20px } p { margin: 0 0 10px; white-space: normal; orphans: 3; widows: 3 } h3 { font-size: 21px; font-weight: 800; margin: 14px 0 4px; color: #333 } .fac { font-size: 26px; font-weight: 800; color: #000; margin-inline-start: 14px; vertical-align: middle } .fac::before { content: "|"; font-weight: 400; margin-inline-end: 14px } .song { font-size: 21px; font-weight: 700; margin: 0 0 8px } .lead { break-inside: avoid; page-break-inside: avoid } .ex { break-inside: avoid; page-break-inside: avoid; margin-bottom: 28px } .exstart { break-before: page; page-break-before: always; margin-top: 0; padding-top: 0 } h2, h3 { break-after: avoid; page-break-after: avoid }</style></head><body>' +
      '<h1>' + esc(v.title || "ויוונסיה") + '</h1><div class="sub">פתיחת הערב</div>' +
      (free ? '<p>' + rtHtml(free) + '</p>' : '') +
      secs.map(function (q) { return '<div class="lead"><h2>' + esc(openName(q.who)) + '</h2><p>' + rtHtml(q.body || "") + '</p></div>'; }).join("") +
      (!free && !secs.length ? '<p>עוד לא נכתבה פתיחה.</p>' : '') +
      (function () {   /* then the exercises, in their order, in the same big letters */
        var items = (state.items || []).slice(), n = 0, out = '';
        if (!items.length) return '';
        out += '<div class="sub exstart">התרגילים</div>';
        items.forEach(function (it) {
          var name = itemName(it) || "ללא שם", num = it.backlog ? "" : (++n) + ". ", fac = facOn() ? facLabel(it) : "", m = it.music;
          var po = txt(it, "poetics"), gu = txt(it, "guidance"), no = it.notes || "";
          out += '<div class="ex"><h2>' + esc(num + name) + (fac ? ' <span class="fac">' + esc(fac) + '</span>' : '') + '</h2>' +
            (m ? '<div class="song">♪ ' + esc(songName(m)) + (songBy(m) ? ' · ' + esc(songBy(m)) : '') + '</div>' : '') +
            (po ? '<h3>פואטיקה</h3><p>' + rtHtml(po) + '</p>' : '') + (gu ? '<h3>הנחיה</h3><p>' + rtHtml(gu) + '</p>' : '') + (no ? '<h3>הערות</h3><p>' + rtHtml(no) + '</p>' : '') + '</div>';
        });
        return out;
      })() + '</body></html>';
    var fr = document.createElement("iframe"); fr.setAttribute("aria-hidden", "true"); fr.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:1130px;border:0;visibility:hidden";   /* a real size: the parts are measured at the width of a page */
    document.body.appendChild(fr);
    var d = fr.contentWindow.document; d.open(); d.write(html); d.close();
    var go = function () {
      try {   /* a part taller than a page cannot be kept whole: it is let to break, and its heading stays with its first lines; the rest keeps whole */
        var fd = fr.contentWindow.document, pr = fd.createElement("div"); pr.style.cssText = "position:absolute;visibility:hidden;height:245mm;width:1px"; fd.body.appendChild(pr);
        var pageH = pr.offsetHeight; pr.remove();
        fd.body.style.width = "170mm";   /* the width of the text on a page, so that the heights below are the printed ones */
        [].forEach.call(fd.querySelectorAll(".lead, .ex"), function (el) { if (el.offsetHeight > pageH * 0.92) { el.style.breakInside = "auto"; el.style.pageBreakInside = "auto"; } });
        fd.body.style.width = "";
      } catch (e) { /* the sizes are unknown: the rules stay as they are */ }
      var oldTitle = document.title; document.title = v.title || "ויוונסיה";   /* the browser names the file after the title of the page */
      var back = function () { document.title = oldTitle; window.removeEventListener("afterprint", back); };
      window.addEventListener("afterprint", back); setTimeout(back, 60000);
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { /* the browser refused: nothing to clean but the frame */ } setTimeout(function () { fr.remove(); }, 1500); };
    setTimeout(go, 250);
  }
  function openName(who) { return String(who).split("#")[0]; }   /* a leader may have several paragraphs: the first is under the name, the others under name#2, name#3 */
  function openKey(n) { var have = {}; openRows().forEach(function (x) { have[x.who] = 1; }); if (!have[n]) return n; for (var k = 2; ; k++) if (!have[n + "#" + k]) return n + "#" + k; }
  function openSecHtml(q, i, ro) {
    var on = accOpen[(state.viv.id) + "|sec|" + q.who] === true;   /* folded when the vivencia opens, each leader's words in one line */
    var leader = '<button type="button" class="rbtn--text bio-chipb" data-sech aria-expanded="' + on + '"><span>' + esc(openName(q.who)) + '</span></button>';   /* the leader is a text button, as in the cards, at the start (the right) of the row */
    return '<div data-sec="' + i + '" data-who="' + esc(q.who) + '"><div data-sech-row style="display:flex;align-items:center;gap:var(--gap)">' + leader + titleRow('',
      '<span data-secsum dir="auto" class="rtitle__tx" style="color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font)">' + (on ? '' : esc(openSum(q.body))) + '</span>') +
      (ro ? '' : '<button type="button" class="rbtn rbtn--icon" data-secx aria-label="הסרת המקטע" title="הסרת המקטע" style="flex:none;color:var(--text-muted)">' + I.trash + '</button>') + '</div>' +
      '<div class="racc__body" data-secb' + (on ? '' : ' data-closed') + '><div><label class="rfield bio-secf" style="flex:none"><span>מה אומר/ת</span><div id="opt' + i + '" data-owho="' + esc(q.who) + '" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(q.body) + '</div></label></div></div></div>';
  }
  function openingHtml() {   /* between the start music and the vivencia */
    var v = state.viv, ro = !canEdit(); if (!v) return "";
    var free = openFreeText(), secs = openRows().filter(function (x) { return x.who !== ""; });
    if (ro && !free && !secs.length) return "";
    return '<div data-opening>' + secHead("open", "פתיחת הערב", !ro && facOn() ? '<button type="button" class="rbtn rbtn--icon" data-secadd aria-haspopup="menu" aria-label="הוספת פסקה" title="הוספת פסקה">' + I.plus + '</button>' : '') + accOpenTag("open") +
      '<div style="display:flex;flex-direction:column;gap:var(--gap-tight)">' + (facOn() && !free ? '' : '<label class="rfield" style="flex:none"><span>טקסט חופשי</span><div id="opt0" data-owho="" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(free) + '</div></label>') +
      secs.map(function (q, k) { return openSecHtml(q, k + 1, ro); }).join("") +
      '</div>' + ACC_CLOSE + '</div>';
  }
  function leadersMenu(btn, onPick) {   /* the leaders; one tap picks */
    var seen = {};   /* every leader, again and again: each tap is one more paragraph */
    var names = state.members.map(function (x) { return facShort(x.email); }).filter(function (n) { if (seen[n]) return false; return (seen[n] = 1); });
    menu(btn, names.length ? names.map(function (n) { return { label: n, fn: function () { onPick(n); } }; }) : [{ label: state.members.length < 2 ? "אין עוד מובילים בשיתוף" : "כל המובילים כבר כאן", disabled: true }], { end: true, fit: true });
  }
  function wireOpening(l) {
    var root = l.querySelector("[data-opening]"); if (!root) return;
    var timers = {};
    var boxes = function () { return [].slice.call(root.querySelectorAll("[data-owho]")); };
    boxes().forEach(rtInit);
    (function () {   /* the chips are all as wide as the widest name needs, no wider */
      var eq = function () {
        var cs = [].slice.call(root.querySelectorAll(".bio-chipb")), w = 0;
        cs.forEach(function (c) { c.style.minWidth = ""; w = Math.max(w, c.offsetWidth); });
        if (w) cs.forEach(function (c) { c.style.minWidth = w + "px"; });   /* a floor, never a ceiling: a name is always shown whole */
      };
      eq(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(eq);
    })();
    boxes().forEach(function (el) {
      var who = el.dataset.owho;
      el.addEventListener("input", function () { openLocal(who, el.value); clearTimeout(timers[who]); timers[who] = setTimeout(function () { openPut(who, el.value); }, 500); });
      el.addEventListener("change", function () { clearTimeout(timers[who]); openPut(who, el.value); });
      el.addEventListener("blur", function () { clearTimeout(cur.trail); curMine(); });
      ["focus", "keyup", "mouseup", "touchend"].forEach(function (n) { el.addEventListener(n, curThrottled); });
    });
    [].forEach.call(root.querySelectorAll("[data-sech]"), function (b) { b.addEventListener("click", function () {
      var sec = b.closest("[data-sec]"), body = sec.querySelector("[data-secb]"), on = body.hasAttribute("data-closed");
      accOpen[state.viv.id + "|sec|" + sec.dataset.who] = on;
      b.setAttribute("aria-expanded", String(on));
      if (on) body.removeAttribute("data-closed"); else body.setAttribute("data-closed", "");
      var sm = sec.querySelector("[data-secsum]"); if (sm) sm.textContent = on ? "" : openSum(sec.querySelector("[data-owho]").value);
    }); });
    [].forEach.call(root.querySelectorAll("[data-secx]"), function (b) { b.addEventListener("click", function () {
      var sec = b.closest("[data-sec]"), who = sec.dataset.who, has = !!sec.querySelector("[data-owho]").value.trim();
      var dlg = document.getElementById("confirmDlg");
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
      RosterSheet.render(dlg, { kind: "confirm", title: "מחיקת מקטע", from: "bottom", size: "s",
        body: '<div class="pad"><span>למחוק את הפסקה של "' + esc(openName(who)) + '" מפתיחת הערב?' + (has ? ' הטקסט שלו יימחק.' : '') + '</span></div>',
        foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="csecx">מחיקה</button>' });
      dlg.querySelector("#csecx").addEventListener("click", function () {
        dlg.close(); delete accOpen[state.viv.id + "|sec|" + who]; clearTimeout(timers[who]);
        openDel(who); paint();
      });
    }); });
    [].forEach.call(root.querySelectorAll("[data-sech-row]"), function (h) {   /* a long press on a chip is a pick-up, never a text selection or a menu */
      h.addEventListener("selectstart", function (e) { e.preventDefault(); });
      h.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
    var secEls = root.querySelectorAll("[data-sec]");
    if (canEdit() && secEls.length > 1) enableDrag(secEls[0].parentElement, "[data-sech]", openMove, "[data-sec]", "[data-sech-row]");   /* hold and drag a chip up or down, like the exercises */
    var add = root.querySelector("[data-secadd]");
    if (add) add.addEventListener("click", function () {
      leadersMenu(add, function (n) {
        var key = openKey(n);
        accOpen[state.viv.id + "|sec|" + key] = true; openPut(key, ""); paint();
        setTimeout(function () { var bx = [].slice.call(document.querySelectorAll("[data-owho]")).filter(function (x) { return x.dataset.owho === key; })[0]; if (bx) bx.focus(); }, 0);
      });
    });
  }
  function applyOpening(rows) {   /* the rows from the server: the boxes I am not typing in are written anew; a section added or removed redraws the part */
    if (!state.viv) return;
    var id = state.viv.id, root = document.querySelector("[data-opening]"), fe = document.activeElement;
    var fw = root && fe && fe.dataset && fe.dataset.owho != null && root.contains(fe) ? fe.dataset.owho : null;
    var mine = fw === null ? null : (openCache[id] || []).filter(function (x) { return x.who === fw; })[0];
    var next = (rows || []).map(function (r) { return mine && r.who === fw ? { who: r.who, body: mine.body, position: r.position } : r; });
    if (mine && !next.some(function (r) { return r.who === fw; })) next.push(mine);
    openCache[id] = next;
    var wasRoot = !!root, sorted = openRows(), free = openFreeText();
    var want = JSON.stringify(sorted.filter(function (x) { return x.who !== ""; }).map(function (x) { return x.who; }));
    var have = root ? JSON.stringify([].map.call(root.querySelectorAll("[data-sec]"), function (x) { return x.dataset.who; })) : "[]";
    var freeShown = root ? !!root.querySelector('[data-owho=""]') : false, freeWant = !facOn() || !!free;
    if (!wasRoot) { if (document.getElementById("list")) paint(); return; }
    if (want !== have || freeShown !== freeWant) { paint(); return; }
    [].forEach.call(root.querySelectorAll("[data-owho]"), function (box) {
      var r = sorted.filter(function (x) { return x.who === box.dataset.owho; })[0], body = r ? r.body : "";
      if (box !== document.activeElement && box.value !== body) {
        box.value = body;
        var sec = box.closest("[data-sec]"), sm = sec && sec.querySelector("[data-secsum]"); if (sm && sec.querySelector("[data-secb]").hasAttribute("data-closed")) sm.textContent = openSum(body);
      }
    });
  }
  function loadItems() {
    return itemsOf(state.viv.id).then(function (r) { r = r || []; state.items = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); if (state.viv) refreshOffline(state.viv); });   /* every change is also in the device copy, so the next open draws it at once */   /* the numbered exercises, then the backlog */
  }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id); curJoin(v.id); refreshPrevLabel();
    var vbtns = heartBtnViv(v.id, "") + (v.role === "owner" && !state.offline ? visBtn(v) : "") + '<button type="button" class="rbtn rbtn--icon" data-act="vmore" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>';   /* the heart, and the three dots: rename, print, delete */
    show(head(v.title || "ויוונסיה חדשה", "", true, wide() ? '<span id="vtimer" hidden aria-live="off" style="flex:none;margin-left:var(--gap);font:var(--fw-bold) var(--fs-l)/var(--lh-tight) var(--font);font-variant-numeric:tabular-nums;color:var(--text);direction:ltr"></span>' + vbtns : vbtns, null, '<button type="button" id="vgo" class="rbtn rbtn--icon" hidden aria-label="לתרגיל שמתנגן" title="לתרגיל שמתנגן" style="display:none;flex:none;flex-direction:column;gap:0;color:var(--danger);background:transparent;border-color:transparent"><span id="vgon" style="font:var(--fw-bold) var(--fs-l)/1 var(--font);font-variant-numeric:tabular-nums"></span></button>') +   /* the mark of the exercise that plays sits beside the name; the way to the catalog is a word in the header, not a floating button */
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      '', function (r) {   /* on a wide screen the way to the catalog is a green banner down the side, added by show() */
      on(r, "back", back); on(r, "add", function () { resetPk(); pk.tab = "ex"; if (wide()) goSub(picker); else { pickerSheet(); if (catApi) catApi.goKind("ex"); } });
      on(r, "vmore", function (b) {
        menu(b, (v.role === "view" || v.role === "public" ? [] : [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false, b); } }]).concat([{ label: "הדפסה", icon: I.print || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/></svg>', fn: function () { printOpening(); } }]).concat(state.offline ? [] : v.role === "owner" ? [{ label: "הגדרות שיתוף", icon: I.share, fn: function () { sharePopup(v); } }] : v.role === "view" || v.role === "edit" ? [{ label: "הסרה שלי מהוויוונסיה", icon: I.out, tone: "danger", fn: function () { confirmLeave(v); } }] : []).concat(v.role === "owner" ? [{ label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmDelete(v); } }] : []));
      });
      on(r, "more", function (b) { vivMenu(v, b); });
      var vb = r.querySelector('[data-act="vis"]'); if (vb) vb.addEventListener("click", function (ev) { ev.stopPropagation(); sharePopup(v); });   /* the click must not reach the dark side's "tap closes the layer", or the panel it opens is closed at once */
    });
    /* the exercises come from the device's copy at once (the skeleton only when there is none); the cloud's answer then corrects them */
    var local = Promise.resolve(null);
    if (window.BioOffline && BioOffline.isSaved(v.id)) local = BioOffline.get(v.id).catch(function () { return null; });
    var cloudDone = false;
    local.then(function (rec) {
      if (!rec || cloudDone || !state.viv || state.viv.id !== v.id || !document.getElementById("list")) return;
      state.items = rec.items || []; state.members = rec.members || [];
      recvCache[v.id + "|start"] = []; recvCache[v.id + "|end"] = []; openCache[v.id] = rec.opening || [];
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
  /* public or private: only an owner sees the button and switches it (the database lets nobody else) */
  function visTip(v) { return v.is_public === false ? "פרטית: רק מי ששיתפת איתו רואה אותה" : "ציבורית: כל המאפשרים רואים אותה"; }
  function visBtn(v) { return '<button type="button" class="rbtn rbtn--icon" data-act="vis" aria-haspopup="dialog" aria-label="' + visTip(v) + '" title="' + visTip(v) + '">' + (v.is_public === false ? I.lock : I.globe) + '</button>'; }
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
        return { id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, partners: v.partners || [], is_public: v.is_public, vivencia_items: [{ count: items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: items, members: r[1] || [], reception: recvRows(v.id), opening: openCache[v.id] || [] };
      });
    });
  }
  function refreshOffline(v) {   /* an open vivencia is already read: its copy is made current from that, quietly */
    if (state.offline || !window.BioOffline || v.role === "public") return;   /* somebody else's public vivencia is not kept on this device */
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) {
      return BioOffline.update({ id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, partners: v.partners || [], is_public: v.is_public, vivencia_items: [{ count: state.items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: state.items, members: mm || [], reception: recvRows(v.id), opening: openCache[v.id] || [] });
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
      busy(dlg.querySelector("#cleave"), api("/rest/v1/rpc/leave_vivencia", { method: "POST", json: { v: v.id } })).then(function () {
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
      busy(dlg.querySelector("#cdel"), api("/rest/v1/vivencias?id=eq." + v.id, { method: "DELETE" })).then(function () {
        dlg.close(); if (window.BioOffline) BioOffline.remove(v.id); toast("הוויוונסיה נמחקה"); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    });
  }
  function paint() {
    refreshPrevLabel();
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-vc="' + state.viv.id + '"] [data-nn]'); if (cnt) cnt.textContent = state.items.filter(function (i) { return !i.backlog; }).length;
    /* an empty vivencia is drawn in its usual shape (reception music, opening, the exercises with their +, the end), never as an empty-state page: the owner's word, 2026-11-25 */
    var main = state.items.filter(function (i) { return !i.backlog; }), back = state.items.filter(function (i) { return i.backlog; });
    var rowOf = function (i, tile) {
      var m = i.music;
      return exCardUi(i, { cls: (playsIn(chosenOf(i)) ? "is-play" : playsIn(audOf(i)) ? "is-play-opt" : ""), attrs: 'data-auds="' + esc(audOf(i)) + '" data-chosen="' + esc(chosenOf(i)) + '" data-icard="' + i.id + '"' + (i.backlog ? ' data-back="1"' : ''), selected: wide() && state.lastItem === i.id, lead: tile, title: itemName(i), titleAttr: 'data-edit="' + i.id + '"',
        pill: m ? pillCount(cardPill(m), optList(i).length) : "", chip: facChip(i, "", true),
        rm: canEdit() ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-idel="' + i.id + '" aria-label="הסרה מהוויוונסיה" title="הסרה מהוויוונסיה">' + I.x + '</button>' : '',
        actions: "" });   /* on hover: the bin at the right, the heart at its left */
    };
    var totSec = main.reduce(function (n, i) { return n + (i.music ? (durOf(i.music) || 0) : 0); }, 0);   /* the length of the chosen songs of the exercises, one after the other */
    var totTxt = totSec > 0 ? (totSec >= 3600 ? Math.floor(totSec / 3600) + ":" + ("0" + Math.floor(totSec % 3600 / 60)).slice(-2) + ":" + ("0" + Math.floor(totSec % 60)).slice(-2) : Math.floor(totSec / 60) + ":" + ("0" + Math.floor(totSec % 60)).slice(-2)) : "";
    var exHead = secHead("ex", "ויוונסיה (" + main.length + ")", (totTxt ? '<span class="bio-total" title="משך המוסיקה הנבחרת בכל התרגילים" style="flex:none;direction:ltr;text-align:left;color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/1 var(--font);font-variant-numeric:tabular-nums;white-space:nowrap">' + totTxt + '</span>' : '') + (canEdit() ? '<button type="button" class="rbtn rbtn--icon" data-addex aria-haspopup="menu" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>' : ''));   /* the exercises have a title like the songs of the start, with a plus at its other end */
    var gridCss = "";   /* the grid of exercise cards: the numbered ones, the divider, then "נוספים", all in one list */
    var fo = document.activeElement, foId = fo && l.contains(fo) && /^opt[0-9]+$/.test(fo.id) ? fo.id : "", foSel = foId ? rtSel(fo) : null;   /* a repaint while somebody types in the opening keeps the cursor there */
    var divHtml = back.length || canEdit() ? '<div class="rdiv" data-div><span class="rdiv__l">נוספים</span>' + (back.length ? '' : '<span class="rdiv__hint">גררו לכאן תרגיל שעוד לא החלטתם עליו</span>') + '</div>' : "";   /* the extras are a second group of cards in the same list, after a divider; a viewer with no extras sees no divider */
    l.innerHTML = recvHtml("start") + openingHtml() + '<div data-exsec>' + exHead + accOpenTag("ex") + '<div id="plist" class="rgrid">' + main.map(function (i, k) { return rowOf(i, k + 1); }).join("") + divHtml + back.map(function (i) { return rowOf(i, "•"); }).join("") + '</div>' + ACC_CLOSE + '</div>' + recvHtml("end");
    wireOpening(l);
    if (foId) { var fe = l.querySelector("#" + foId); if (fe) { fe.focus(); try { var rg = document.createRange(), pa = rtPoint(fe, foSel.a), pb = rtPoint(fe, foSel.b); rg.setStart(pa[0], pa[1]); rg.setEnd(pb[0], pb[1]); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (x) { /* no caret */ } } }
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
    var accSet = function (kind, on) {   /* open or close one part; the arrow turns and the part slides */
      accOpen[state.viv.id + "|" + kind] = on;
      var b = l.querySelector('[data-acc="' + kind + '"]'), body = l.querySelector('[data-accb="' + kind + '"]');
      if (b) { b.setAttribute("aria-expanded", String(on)); }
      if (body) { if (on) body.removeAttribute("data-closed"); else body.setAttribute("data-closed", ""); }
    };
    l.querySelectorAll("[data-acc]").forEach(function (b) { b.addEventListener("click", function () { accSet(b.dataset.acc, !accIsOpen(b.dataset.acc)); }); });
    l.querySelectorAll(".racc__bar [data-addm], .racc__bar [data-addex]").forEach(function (b) { b.addEventListener("click", function () { var sec = b.closest("[data-recv]"); accSet(sec ? sec.dataset.recv : "ex", true); }, true); });   /* adding to a part opens it, so the new song is seen */
    l.querySelectorAll("[data-recvplay]").forEach(function (b) { b.addEventListener("click", function () {
      var kind = b.dataset.recvplay, nw = window.__bioNow || {}, sec = l.querySelector('[data-recv="' + kind + '"]'); if (!sec) return;
      var mine = recvPlaying(kind) ? [].filter.call(sec.querySelectorAll("[data-audio]"), function (x) { return x.dataset.audio === nw.name; })[0] : null;
      var btn = mine || sec.querySelector("[data-audio]"); if (btn) btn.click();   /* a song of this part is loaded: its own button plays or pauses it; otherwise the part starts from its first song */
    }); });
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
      enableGroupDrag(l, persistGroups);
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
      d.c.style.transition = "none"; d.c.style.zIndex = "var(--z-raised)"; d.c.style.boxShadow = "var(--shadow)";
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
  function persistGroups(mainIds, backIds, el) {   /* el: the card that was moved, it shows the wait until the order is saved (law 7) */
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
    busy(el, Promise.all(jobs).then(loadItems).then(paint, fail));
  }
  /* The drag of the exercise cards: two groups, the numbered ones and "נוספים". The divider never moves; the group is the one the carried card is over
     (below the divider's middle: "נוספים"), the place in it is where the card is in reading order, and the others go to the places they would have. */
  function enableGroupDrag(l, onDrop) {
    if (l._dragOff) l._dragOff();
    var cards = [].slice.call(l.querySelectorAll(".bio-icard")), div = l.querySelector("[data-div]");
    var d = null, ghost = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };   /* ghost: the carried card's copy, in the body, above everything (--z-drag), never clipped by a section's body */
    l.addEventListener("touchmove", blockTouch, { passive: false });
    var dropGhost = function () { if (ghost) { ghost.remove(); ghost = null; } };
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
      onDrop(main, back, c);
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
    function scroller() { for (var n = l; n && n !== document.body; n = n.parentElement) { var oy = getComputedStyle(n).overflowY; if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) return n; } return null; }
    var raf = 0;
    function auto() {   /* the finger near the top or the foot of the list: the list scrolls under it, the carried card stays under the finger */
      raf = 0; if (!d || !d.live || !d.sc) return;
      if (!d.last) { raf = requestAnimationFrame(auto); return; }
      var r = d.sc.getBoundingClientRect(), y = d.last.clientY, zone = 72, v = 0, bot = r.bottom, dk = document.querySelector(".bio-dock");
      if (dk) { var dt = dk.getBoundingClientRect().top; if (dt > r.top && dt < bot) bot = dt; }   /* the player covers the foot of the list: the edge is where it begins */
      if (y > bot - zone) v = Math.min(1, (y - (bot - zone)) / zone) * 16; else if (y < r.top + zone) v = -Math.min(1, ((r.top + zone) - y) / zone) * 16;
      if (v) { var before = d.sc.scrollTop; d.sc.scrollTop += v; if (d.sc.scrollTop !== before) apply(); }
      raf = requestAnimationFrame(auto);
    }
    function begin() {
      d.sc = scroller(); d.sc0 = d.sc ? d.sc.scrollTop : 0;
      d.live = true; d.c.setPointerCapture && d.c.setPointerCapture(d.pid);
      var gr = d.c.getBoundingClientRect(); ghost = d.c.cloneNode(true); ghost.removeAttribute("id");
      ghost.setAttribute("popover", "manual");   /* the player's pill is in the top layer (a popover), so only another popover shown after it is above it: the carried card is one */
      ghost.style.cssText = "position:fixed;inset:auto;margin:0;box-sizing:border-box;overflow:visible;color:var(--text);left:" + gr.left + "px;top:" + gr.top + "px;width:" + gr.width + "px;height:" + gr.height + "px;z-index:var(--z-drag);pointer-events:none;box-shadow:var(--shadow);transition:none;transform:none";
      document.body.appendChild(ghost); try { ghost.showPopover(); } catch (x) { /* an old browser: a fixed element at --z-drag */ }   /* the card itself stays in its place, unseen: its slot is kept, nothing jumps */
      d.c.style.visibility = "hidden";
      cards.forEach(function (r) { if (r !== d.c) r.style.transition = "transform var(--t-base) var(--ease)"; });
      if (div) div.style.transition = "transform var(--t-base) var(--ease)";
      if (d.sc && !raf) raf = requestAnimationFrame(auto);
    }
    function virtualSlot(g, sl, idxs) {   /* the place after the last one of a group, for the card that moves into it */
      var last = sl[idxs[idxs.length - 1]], xs = sl.map(function (t) { return t.x; }), right = Math.max.apply(null, xs), left = Math.min.apply(null, xs);
      var below = sl.filter(function (t) { return t.y > sl[0].y + 3; })[0], pitch = below ? below.y - sl[0].y : last.h + 8;   /* the distance of one row: the first card that is lower than the first one (in a single column that is the next card, in two columns the third) */
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
      d.last = { clientX: e.clientX, clientY: e.clientY };
      if (d.sc && !raf) raf = requestAnimationFrame(auto);
      apply();
    }
    function apply() {
      var so = d.sc ? d.sc.scrollTop - d.sc0 : 0, dx = d.last.clientX - d.x0, dy = d.last.clientY - d.y0 + so;   /* what the list scrolled is part of the way the card travelled */
      if (ghost) ghost.style.transform = "translate(" + dx + "px, " + (d.last.clientY - d.y0) + "px)";   /* the copy is fixed: it follows the finger, the list's own scroll is not part of its way */
      var cx = d.sl[d.k].x + dx, cy = d.sl[d.k].y + dy, dr = div.getBoundingClientRect(), back = cy > dr.top + so + dr.height / 2 ? 1 : 0;
      var grp = [[], []], slots = [[], []];
      cards.forEach(function (r, i) { slots[grpOf(r)].push(i); if (i !== d.k) grp[grpOf(r)].push(i); });
      var ins = 0; grp[back].forEach(function (i, n) { var t = d.sl[i]; if (t.y < cy - t.h / 2 || (Math.abs(t.y - cy) <= t.h / 2 && t.x > cx)) ins = n + 1; });
      var order = [grp[0].slice(), grp[1].slice()]; order[back].splice(ins, 0, d.k); d.order = order;
      /* a card that crosses the divider needs room on the other side: the divider and the "נוספים" cards go down by the room of a card (it enters the numbered ones) or up (it leaves them), in a single column */
      var from = grpOf(d.c), oneCol = d.sl.every(function (t) { return Math.abs(t.x - d.sl[0].x) < 3; }), gapPx = parseFloat(getComputedStyle(cards[d.k].parentElement).rowGap) || 8, room = d.sl[d.k].h + gapPx;
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
      clearTimeout(d.timer); if (raf) { cancelAnimationFrame(raf); raf = 0; }
      var was = d; d = null;
      if (!was.live) return;
      dropGhost(); cards.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; r.style.visibility = ""; });
      if (div) { div.style.transform = ""; div.style.transition = ""; }
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      l.addEventListener("click", eat, true); setTimeout(function () { l.removeEventListener("click", eat, true); }, 80);
      if (!was.order) return;
      var nm = ids(was.order[0]), nb = ids(was.order[1]);
      var om = cards.filter(function (r) { return !grpOf(r); }).map(function (r) { return r.dataset.icard; }), ob = cards.filter(grpOf).map(function (r) { return r.dataset.icard; });
      if (nm.join() === om.join() && nb.join() === ob.join()) return;
      onDrop(nm, nb, was.c);
    }
    l.addEventListener("pointerup", finish); l.addEventListener("pointercancel", finish);
    l._dragOff = function () { dropGhost(); l.removeEventListener("touchmove", blockTouch); l.removeEventListener("pointermove", move); l.removeEventListener("pointerup", finish); l.removeEventListener("pointercancel", finish); l._dragOff = null; };
  }
  function persistVivs(from, to, row) {   /* row: the row that was moved, it shows the wait until the order is saved (law 7) */
    var moved = state.vivs.splice(from, 1)[0]; state.vivs.splice(to, 0, moved);
    var uid = FLOA_AUTH.userId();
    busy(row, Promise.all(state.vivs.map(function (v, k) {
      if (v.pos === k + 1) return null;
      v.pos = k + 1;
      return v.role === "owner" ? api("/rest/v1/vivencia_owners?vivencia_id=eq." + v.id + "&user_id=eq." + uid, { method: "PATCH", json: { position: k + 1 } })
                                : api("/rest/v1/rpc/set_share_position", { method: "POST", json: { v: v.id, pos: k + 1 } });
    })).then(function () { renderVivs(); }, fail));
  }

  /* Reorder by dragging a row (no arrows). A mouse drags after a few pixels; a finger after a short hold, so scrolling still works.
     Only transform is animated. Keyboard: Alt + Arrow up/down on the focused row title. The order of the list is the curve. */
  function enableDrag(l, keySel, onMove, rowSel, handleSel) {
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
        e.preventDefault(); onMove(k, to, row);
      });
      row.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        if (handleSel && !e.target.closest(handleSel)) return;
        d = { grip: !!e.target.closest("[data-grip]"), row: row, k: k, y0: e.clientY, pid: e.pointerId, live: false, timer: null, x0: e.clientX, tops: rows.map(function (r) { var b = r.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }), to: k };   /* the middle of every place, across and down: a list is one column, a grid of cards is several */
        if (e.pointerType === "touch" && !d.grip) d.timer = setTimeout(function () { if (d && !d.live) begin(); }, 160);
      });
    });
    function scroller() { for (var n = l; n && n !== document.body; n = n.parentElement) { var oy = getComputedStyle(n).overflowY; if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 2) return n; } return null; }
    var raf = 0;
    function auto() {   /* the finger near the top or the bottom of the list: the list scrolls under it, the carried card stays under the finger */
      raf = 0; if (!d || !d.live || !d.sc) return;
      if (!d.last) { raf = requestAnimationFrame(auto); return; }
      var r = d.sc.getBoundingClientRect(), y = d.last.clientY, zone = 72, v = 0, bot = r.bottom, dk = document.querySelector(".bio-dock");
      if (dk) { var dt = dk.getBoundingClientRect().top; if (dt > r.top && dt < bot) bot = dt; }   /* the player covers the foot of the list: the edge is where it begins */
      if (y > bot - zone) v = Math.min(1, (y - (bot - zone)) / zone) * 16; else if (y < r.top + zone) v = -Math.min(1, ((r.top + zone) - y) / zone) * 16;
      if (v) { var before = d.sc.scrollTop; d.sc.scrollTop += v; if (d.sc.scrollTop !== before) apply(); }
      raf = requestAnimationFrame(auto);
    }
    function begin() {
      d.sc = scroller(); d.sc0 = d.sc ? d.sc.scrollTop : 0;
      d.live = true; d.row.setPointerCapture && d.row.setPointerCapture(d.pid);
      d.row.style.transition = "none"; d.row.style.zIndex = "var(--z-raised)"; d.row.style.boxShadow = "var(--shadow)"; d.row.style.position = "relative";
      rows.forEach(function (r) { if (r !== d.row) r.style.transition = "transform var(--t-base) var(--ease)"; });
      if (d.sc && !raf) raf = requestAnimationFrame(auto);
    }
    function move(e) {
      if (!d) return;
      var dy = e.clientY - d.y0;
      if (!d.live) {
        if (e.pointerType === "touch" && !d.grip) { if (Math.abs(dy) > 8) { clearTimeout(d.timer); d = null; } return; }
        if (Math.abs(dy) < 6) return;
        begin();
      }
      d.last = { clientX: e.clientX, clientY: e.clientY };
      if (d.sc && !raf) raf = requestAnimationFrame(auto);
      apply();
    }
    function apply() {
      var dy = d.last.clientY - d.y0 + (d.sc ? d.sc.scrollTop - d.sc0 : 0);   /* what the list scrolled is part of the way the card travelled */
      var dx = d.last.clientX - d.x0;
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
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      var was = d; d = null;
      if (!was.live) return;
      rows.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; r.style.position = ""; });
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };   /* the drag is not a tap on the title; only the click that comes right after it */
      l.addEventListener("click", eat, true); setTimeout(function () { l.removeEventListener("click", eat, true); }, 80);
      if (was.to !== was.k) onMove(was.k, was.to, was.row);
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
      "#itemDlg .sheet-head, #itemDlg .sheet-head * { touch-action: none } #itemDlg .sheet-head [data-act=\"list\"] { pointer-events: none; flex: none !important; margin-inline-start: auto } #itemDlg .sheet-head [data-likex] { margin-inline-end: auto } #itemDlg .sheet { padding-inline: 0 } #itemDlg .sheet-head { padding-inline: 0; margin-bottom: 0 } #itemDlg .sheet-head > .rhead { flex: 1 1 auto; min-width: 0; width: 100%; margin: 0 } " +
      "#itemDlg .sheet-body { overflow: hidden; padding: 0 } #itemDlg .sheet-body > #itemHost { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; position: relative; padding-inline: 0 } " +
      "html.rs-lock:not(.kb-open) #itemDlg .rfab { opacity: 1; transform: none; pointer-events: auto }";   /* the kit hides page buttons while a popup is open; these two belong to this one */
    document.head.appendChild(st);
  })();
  /* the keyboard is up in an exercise: the field being written in is kept one standard step above the keyboard (the browser scrolls only until the caret shows, so the text touched the keyboard) */
  (function () {
    function reveal(el) {
      if (!document.documentElement.classList.contains("bio-kb")) return;
      var dlg = el.closest && el.closest("#itemDlg"), sc = dlg && dlg.querySelector("#iscroll"); if (!sc) return;
      var box = el.closest(".rfield") || el, gap = 16, r = box.getBoundingClientRect(), v = sc.getBoundingClientRect();
      if (r.bottom > v.bottom - gap) sc.scrollTop += Math.ceil(r.bottom - v.bottom + gap);
    }
    document.addEventListener("focusin", function (e) { var el = e.target; if (!el.closest || !el.closest("#itemDlg")) return; [300, 650].forEach(function (t) { setTimeout(function () { if (document.activeElement === el) reveal(el); }, t); }); });
    document.addEventListener("input", function (e) { var el = e.target; if (el && el.closest && el.closest("#itemDlg")) reveal(el); });
  })();
  function itemSheet(html, wire) {
    var dlg = document.getElementById("itemDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "itemDlg"; document.body.appendChild(dlg); }
    if (!dlg.open) {
      dlg.__openedAt = performance.now();   /* a popstate of an earlier close that arrives after this must not close it */
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
    function hideEmpty(k, html) { return ro && !txt(it, k) ? '' : html; }   /* the catalog's exercise shows only the fields that have words; a vivencia's exercise keeps them all, to be written in */
    var mus = '<div id="imus" style="flex:none">' + musCards(it, ro) + '</div>';   /* the songs this exercise is torn between, as cards: the chosen one plays in the vivencia; on a catalog exercise they come after the texts */
    return '<style>#ipg, #ipg * { touch-action: pan-y } #ipg textarea, #ipg .rf-rich { max-height: none } #ipg .rfield, [data-opening] .rfield { margin: 0 } #ifields .rf-rich { font-size: var(--fs-m); line-height: var(--lh-text) } #ifields[data-ro] .rf-rich { font-size: var(--fs-m); line-height: var(--lh-text) } #imus [data-audio] svg { width: var(--icon) !important; height: var(--icon) !important } #ipg:has(#ifields:not([data-ro])) #imus [data-audio] { display: none } #ipg:has(#ifields:not([data-ro])) #imus .bio-card[aria-current] { border-color: var(--border); box-shadow: var(--shadow) }</style><div id="ipg" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0">' +   /* nothing between the header and the scroller: the content goes right under the header's edge, where its shadow is */
      '<div id="iscroll" style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:flex;flex-direction:column;gap:var(--gap);padding:var(--gap) var(--gap) 0">' +   /* everything under the name scrolls together; ONE parent: its padding is the gutter, its gap sequences the fields, the songs and the end room */
      '<div id="ifields"' + (ro ? ' data-ro' : '') + ' style="flex:none;display:flex;flex-direction:column;gap:var(--gap)">' + (!ro && (!wide() || (it.music && it.music.audio_object)) ? '<div id="iplay" class="rmid" style="flex:none">' + (it.music && it.music.audio_object ? bigPlay(it.music) : '') + (wide() ? '' : heartBtnEx(it.exercise_id || ("item:" + it.id), "")) + '</div>' : '') + hideEmpty("poetics", '<label class="rfield" style="flex:none"><span>פואטיקה</span><div id="ipo" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "poetics") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "poetics")) + '</div></label>') +
      hideEmpty("guidance", '<label class="rfield" style="flex:none"><span>הנחיה</span><div id="igu" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "guidance") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "guidance")) + '</div></label>') +
      (ro && it.exercises && it.exercises.emphasis ? '<label class="rfield" style="flex:none"><span>הערות</span><div id="iem" class="rf-rich" contenteditable="false" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.exercises.emphasis) + '</div></label>' : '') +
      (ro ? '' : '<label class="rfield" style="flex:none"><span>הערות</span><div id="it" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.notes || "") + '</div></label>') + '</div>' +
      mus + '<div id="ibtns" style="flex:none;height:calc(2 * var(--fab) + var(--gap) + 2 * var(--gap) + var(--inset-b))"></div></div></div>';
  }
  /* the page scrolls under its header with a scrollbar at the left that takes room from the cards: the header gives its left side the same room, so its button is over the cards' edge */
  function sbSync(r) {
    var sc = r.querySelector("#iscroll"); if (!sc) return;
    var set = function () { pd.style.setProperty("--sbw", Math.max(0, sc.offsetWidth - sc.clientWidth) + "px"); };
    set(); if (window.ResizeObserver) new ResizeObserver(set).observe(sc);
  }
  function tabsCenter(trk) {   /* the current tab is in the middle of the strip, whatever the width of the words is; every tab tells CSS where its middle is */
    var cur = trk.querySelector(".is-cur"); if (!cur) return;
    var cw = trk.parentElement.clientWidth; trk.style.setProperty("--cw", cw + "px");   /* every tab is as wide as the same share of the strip: the neighbours stand the same distance from the current one on both sides, and sliding never changes a width */
    var base = cw / 2 - (cur.offsetLeft + cur.offsetWidth / 2);
    trk.classList.add("is-drag");   /* put in place, not slid there */
    [].forEach.call(trk.querySelectorAll(".bio-tab"), function (t) { t.style.setProperty("--cx", (t.offsetLeft + t.offsetWidth / 2) + "px"); });
    var all = [].slice.call(trk.querySelectorAll(".bio-tab")), ci = all.indexOf(cur); all.forEach(function (t, i) { t.style.setProperty("--nb", Math.abs(i - ci) === 1 ? "1" : "0"); if (Math.abs(i - ci) > 1) t.setAttribute("data-far", ""); else t.removeAttribute("data-far"); });   /* the tabs two steps away are never seen, not even while the strip slides */   /* only the two next to this one keep their numbers in view */
    /* each name tells CSS how wide it is and how wide the two names beside it are; the squeeze itself is CSS, from the place of the tab on the strip */
    all.forEach(function (t, i) { var hw = function (x) { var n = x && x.querySelector(".bio-tab__t"); return n ? n.offsetWidth / 2 : 0; }; t.style.setProperty("--h", Math.max(1, hw(t)) + "px"); t.style.setProperty("--hl", hw(all[i - 1]) + "px"); t.style.setProperty("--hr", hw(all[i + 1]) + "px"); });
    trk._base = base; trk.style.setProperty("--tx", base + "px"); trk.classList.add("is-ready");
    requestAnimationFrame(function () { requestAnimationFrame(function () { trk.classList.remove("is-drag"); }); });
  }
  function tabsDist(trk, dir) {   /* how far the middle of the next (dir 1, on the left) or the previous (dir -1) tab is from the middle of this one */
    var tabs = trk.querySelectorAll(".bio-tab"), cur = trk.querySelector(".is-cur"), i = [].indexOf.call(tabs, cur), t = tabs[i - dir];
    return t && cur ? Math.abs((t.offsetLeft + t.offsetWidth / 2) - (cur.offsetLeft + cur.offsetWidth / 2)) : 0;
  }
  /* the page that leaves is not dropped: a copy of it slides out while the new one slides in, so the screen is never blank in between */
  function ghostOfPage() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
    var pg = document.querySelector("#itemDlg #ipg"); if (!pg || !pg.parentElement) return null;
    var host = pg.parentElement, hr = host.getBoundingClientRect(), r = pg.getBoundingClientRect(), g = pg.cloneNode(true);
    g.removeAttribute("id");   /* the ids inside stay (the styles are by id); the new page is before the copy in the document */
    return { g: g, left: r.left - hr.left, top: r.top - hr.top, w: r.width, h: r.height, tf: pg.style.transform || "" };
  }
  function ghostRun(o, dir) {
    if (!o) return;
    var np = document.querySelector("#itemDlg #ipg"), host = np && np.parentElement; if (!host) return;
    var g = o.g; g.style.cssText = "position:absolute;left:" + o.left + "px;top:" + o.top + "px;width:" + o.w + "px;height:" + o.h + "px;margin:0;pointer-events:none;overflow:hidden;z-index:0;transform:" + (o.tf || "none") + ";transition:none";
    host.appendChild(g);
    requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transition = "transform .26s cubic-bezier(.2, .8, .2, 1)"; g.style.transform = "translateX(" + (-dir * 100) + "%)"; }); });
    setTimeout(function () { g.remove(); }, 340);
  }
  function itemScreen(it) {
    var e = it.exercises || {};
    setUrl(BASE + state.viv.id + "/" + it.id);
    state.lastItem = it.id;   /* the strip of the exercise last opened stays marked in the list, like the vivencia in its list */
    markItem();
    var k = state.items.findIndex(function (x) { return x.id === it.id; }), prevIt = state.items[k - 1], nextIt = state.items[k + 1];   /* its place by its id: the list may have been read again, and its objects are new ones */
    /* the header walks the sequence: the right button to the previous exercise, the left one to the next, the name between them */
    var hd = itemHead(!!prevIt, !!nextIt, "", it.exercise_id || ("item:" + it.id), itemName(it), false, "", !!it.backlog, it.backlog ? "•" : String(state.items.filter(function (i) { return !i.backlog; }).findIndex(function (i) { return i.id === it.id; }) + 1), undefined, [2, 1, 0, -1, -2].map(function (d) { var x = state.items[k + d]; if (!x) return null; return { id: x.id, a: audOf(x), f: facOn() ? facLabel(x) : "", fh: facEmails(x).length > 0, n: x.backlog ? "•" : String(state.items.filter(function (i) { return !i.backlog; }).findIndex(function (i) { return i.id === x.id; }) + 1), t: itemName(x) }; }), it.music);   /* the tabs, from the left: the next ones, this one, the previous ones */   /* its number, the same as in the list, before its name */   /* the middle button says where we are, and still opens the list */
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
      /* the neighbours of the page are made when a finger starts to drag, and wait beside it (the next on the left, the previous on the right): the screen shows pages, never white */
      var nb = null;
      function nbEnsure() {
        if (nb || !pg || !pg.parentElement || wide()) return; nb = {};
        var host = pg.parentElement;
        [[prevIt, 1], [nextIt, -1]].forEach(function (pair) {
          var x = pair[0]; if (!x) return;
          var d = document.createElement("div"); d.className = "bio-nbpage"; d.setAttribute("aria-hidden", "true");
          d.innerHTML = itemPageHtml(x, false);   /* the ids stay: the styles of the page are by id; the real page comes first in the document, so it is the one every lookup finds */
          d.style.cssText = "position:absolute;left:" + pg.offsetLeft + "px;top:" + pg.offsetTop + "px;width:" + pg.offsetWidth + "px;height:" + pg.offsetHeight + "px;overflow:hidden;pointer-events:none;z-index:0;transform:translateX(" + (pair[1] * 100) + "%)";
          host.appendChild(d); nb[pair[1]] = d;
        });
      }
      function nbDrag(dx) { nbEnsure(); if (!nb) return; Object.keys(nb).forEach(function (k) { nb[k].style.transition = "none"; nb[k].style.transform = "translateX(calc(" + (k * 100) + "% + " + dx + "px))"; }); }
      function nbSettle() { if (!nb) return; var o = nb; nb = null; Object.keys(o).forEach(function (k) { o[k].style.transition = "transform var(--t-base) var(--ease)"; o[k].style.transform = "translateX(" + (k * 100) + "%)"; }); setTimeout(function () { Object.keys(o).forEach(function (k) { o[k].remove(); }); }, 260); }
      function nbLeave(dir) { if (!nb) return; var el = nb[-dir]; if (el) { el.style.transition = "transform .16s ease-in"; el.style.transform = "translateX(0)"; } }   /* the page that was beside comes to the middle as the old one goes */
      function walkSwipe(to) { var keep = nb; nb = null; repNext = true; state.slideFrom = 0; stack().pop(); go(function () { itemScreen(to); }); if (keep) Object.keys(keep).forEach(function (k) { keep[k].remove(); }); }
      function walk(to) { repNext = true; var dir = to === nextIt ? -1 : 1; state.slideFrom = dir; if (wide()) return itemScreen(to); var ghost = ghostOfPage(); stack().pop(); go(function () { itemScreen(to); }); ghostRun(ghost, dir); }
      on(r, "prevW", function () { if (prevIt) walk(prevIt); });
      on(r, "nextW", function () { if (nextIt) walk(nextIt); });
      on(r, "closeIt", function () { liveItem = null; state.lastItem = null; show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); markItem(); setUrl(BASE + state.viv.id); });   /* the X: the exercise closes and is no longer the chosen one */
      var trk = document.querySelector("#itemDlg .bio-tabs__track");
      if (pg) attachPager(pg, { next: nextIt ? function () { walkSwipe(nextIt); } : null, prev: prevIt ? function () { walkSwipe(prevIt); } : null,
        drag: function (dx, w) { nbDrag(dx); if (!trk) return; var dir = dx > 0 ? 1 : -1; trk.classList.add("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir) * Math.min(1, Math.abs(dx) / w)) + "px"); },
        settle: function () { nbSettle(); if (!trk) return; trk.classList.remove("is-drag"); trk.style.setProperty("--tx", (trk._base || 0) + "px"); },
        leave: function (dir) { nbLeave(dir); if (!trk) return; trk.classList.remove("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir)) + "px"); } });   /* the tabs follow the finger, the same way the page does */
      var hdrEl0 = document.querySelector("#itemDlg .bio-ihead--m"), hdrEl = hdrEl0 && (hdrEl0.closest("[data-rs-drag]") || hdrEl0);   /* the popup's own header owns the finger (it captures it for the pull-down), so the swipe listens there */
      if (pg && hdrEl) { if (hdrEl.__swOff) hdrEl.__swOff(); hdrEl.__swOff = attachPager(pg, { next: nextIt ? function () { walkSwipe(nextIt); } : null, prev: prevIt ? function () { walkSwipe(prevIt); } : null,
        drag: function (dx, w) { nbDrag(dx); if (!trk) return; var dir = dx > 0 ? 1 : -1; trk.classList.add("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir) * Math.min(1, Math.abs(dx) / w)) + "px"); },
        settle: function () { nbSettle(); if (!trk) return; trk.classList.remove("is-drag"); trk.style.setProperty("--tx", (trk._base || 0) + "px"); },
        leave: function (dir) { nbLeave(dir); if (!trk) return; trk.classList.remove("is-drag"); trk.style.setProperty("--tx", ((trk._base || 0) + dir * tabsDist(trk, dir)) + "px"); } }, hdrEl); }   /* a swipe on the header moves the page too */
      if (trk) trk.addEventListener("click", function (ev) {   /* a tap on a tab (its number or its name) goes to that exercise */
        var tab = ev.target.closest(".bio-tab"); if (!tab) return;
        var idx = [].indexOf.call(trk.querySelectorAll(".bio-tab"), tab), to2 = state.items[k + (2 - idx)];
        if (idx === 2 && ev.target.closest("[data-nameedit]")) { if (canEdit()) itemNameDialog(document.getElementById("ina")); return; }   /* a tap on the name of this exercise: a popup to write it in (the page behind is locked) */
        if (idx === 2 || !to2) return;
        repNext = true; var dir2 = idx < 2 ? -1 : 1; state.slideFrom = dir2; var ghost2 = ghostOfPage(); stack().pop(); go(function () { itemScreen(to2); }); ghostRun(ghost2, dir2);
      });
      if (hdrEl && !hdrEl.__tapFix) {   /* the header holds the finger for the swipe: a tap can then land on the header itself; it is given to what is under the finger */
        hdrEl.__tapFix = 1;
        var tap0 = null, hitSel = "[data-nameedit], [data-fac]";
        hdrEl.addEventListener("pointerdown", function (ev) { tap0 = { x: ev.clientX, y: ev.clientY, t: Date.now() }; }, true);
        hdrEl.addEventListener("pointerup", function (ev) {   /* a tap is decided by the finger itself: a small movement of a real finger must not turn it into a swipe that eats the click */
          var t0 = tap0; tap0 = null; if (!t0) return;
          if (Math.hypot(ev.clientX - t0.x, ev.clientY - t0.y) > 12 || Date.now() - t0.t > 600) return;
          if (ev.target.closest && ev.target.closest("[data-fac]")) return;   /* a real button gets its own click: delivering one by hand as well opens its menu and the second click closes it */
          var hit = document.elementsFromPoint(ev.clientX, ev.clientY).filter(function (e) { return e.matches && e.matches(hitSel); })[0]; if (!hit) return;
          hdrEl.__tapAt = Date.now();
          setTimeout(function () { hdrEl.__syn = true; hit.click(); hdrEl.__syn = false; }, 0);
        }, true);
        hdrEl.addEventListener("click", function (ev) {
          if (hdrEl.__syn) return;   /* our own click for a tap */
          if (Date.now() - (hdrEl.__tapAt || 0) < 700 && ev.target.closest && ev.target.closest(hitSel)) { ev.stopPropagation(); ev.preventDefault(); return; }   /* the browser's click for the same tap: already done */
          if (ev.target.closest && ev.target.closest("[data-nameedit], [data-fac]")) return;
          var hit = document.elementsFromPoint(ev.clientX, ev.clientY).filter(function (e) { return e.matches && e.matches("[data-nameedit], [data-fac]"); })[0];
          if (hit) { ev.stopPropagation(); hit.click(); }
        }, true);
      }
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
            confirmChoose(songName(m), itemName(it) || "התרגיל", function () { return setChosen(it, m).then(function () { repaintMus(); if (wide()) paint(); }, fail); });
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
          strip.innerHTML = '<div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:var(--gap-tight)">' + (fresh.music ? songLines(fresh.music) : '<span class="rrow__title">לחצו לבחירת מוזיקה</span>') + '</div>' + (fresh.music ? playCol(fresh.music, true) : '');
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
          if (el === document.activeElement && Date.now() - (el._typed || 0) < 3000) return;   /* typed a moment ago: what comes back may be an older save of mine, and mine is newer */
          if (el.value !== rv) { if (el.classList.contains("rf-rich")) rtKeep(el, rv); else el.value = rv; el.style.color = ""; el.style.background = ""; }
          el.dataset.base = rv;
        });
        layoutFields(); it = fresh;
      } };
      on(r, "del", function () { confirmRemoveItem(it); });
      on(r, "swap", function () { resetPk(); pk.tab = "ex"; if (wide()) goSub(function () { picker(it); }); else pickerSheet(it); });   /* the catalog, to put another exercise in this place */   /* the catalog, to put another exercise in this place */
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
          var g = by[x.exercise_id]; if (!g) { g = by[x.exercise_id] = { id: x.exercise_id, name: name(x.exercises), en: x.exercises.title_en || "", songs: [], seen: {} }; order.push(g); }
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
    l.style.display = "grid"; l.style.gap = "var(--gap)"; l.style.alignContent = "start"; l.innerHTML = '<label class="rfield"><span>חיפוש מוזיקה או תרגיל</span><input id="mq" placeholder=" " autocomplete="off"></label><div id="mb"></div>' + (tail || "");
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
          h += foldRow('data-ex="' + g.id + '"', esc(g.name), ms.length + ' מוזיקות', null, on, false);
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
    var clr = '<button class="rbtn rbtn--icon" type="button" data-act="mclear" aria-label="ניקוי המוזיקה" title="ניקוי המוזיקה"' + (it.music_id ? "" : " disabled") + '>' + I.trash + '</button>';
    show(head(itemName(it) || "מוזיקה", "", true, clr) + '<div class="rlist" id="mlist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", out);
      on(r, "mclear", function () { chooseSongHere(it, null, out); });
      similarRows(it).then(function (rows) {
        var seen = {}, list = [];
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
        var row = function (id, t, sub, cur, m) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-m="' + id + '"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button>' + (m ? songBtn(m, true) : '') + '</div>'; };
        var l = r.querySelector("#mlist");
        musicBrowse(l, list, it, function (m) { chooseSongHere(it, m, out); },
          '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-act="other"><span class="rrow__title">מוזיקות אחרות</span><span class="rrow__sub">מוסיקה שאינה בקטלוג</span></button></div>');
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
  document.addEventListener("bioaudio", function (ev) {
    var d = ev.detail || {}; window.__bioNow = { name: d.name || "", t: d.t || 0, d: d.d || 0 }; document.querySelectorAll("[data-songtime]").forEach(function (el) { el.textContent = songTimeText(); });
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
  /* THE CARD (law 10): one component for every list item shown as a card; a song, an exercise, a vivencia exercise are only what fills its slots.
     A grid of two rows. The LEAD (a number, an image, a big sign) spans both rows. In each row, the text on one side and its buttons on the other.
     o: attrs (data-..., role: what the card is for the code), cls (hooks for the states), selected,
        lead (html), title (text), titleAttr (the title is a button with these attributes), chip (html, after the title),
        act1 (html, the buttons of row 1: remove), dur (a length, clock text), sub (text of row 2) or subHtml (its markup), act2 (html, the buttons of row 2: play, +N, heart, plus),
        hidden (html that must stay in the card but not be seen: a play tile with no place, it keeps the shimmer and the tap).
     An empty slot is not written, so it takes no room; with no sub and no act2 the card is one row. Looks: .bio-c in kit.css. */
  /* THE TITLE ROW (law 4): a text and its chip under ONE parent; --gap between them, the text shrinks with an ellipsis, the chip never does. Used by the card's primary slot and the opening sections. Looks: .rtitle in kit.css. */
  function titleRow(cls, textHtml, chipHtml) { return '<span class="rtitle' + (cls ? ' ' + cls : '') + '">' + textHtml + (chipHtml || '') + '</span>'; }
  function cardSlots(o) {
    var h = '<div class="bio-card bio-c' + (o.cls ? ' ' + o.cls : '') + '" ' + (o.attrs || '') + (o.selected ? ' aria-current="true"' : '') + '>';
    if (o.lead) h += '<span class="bio-c__lead" aria-hidden="true">' + o.lead + '</span>';
    h += titleRow('bio-c__t bio-c__t1', o.titleAttr ? '<button type="button" class="bio-c__tx rrow__main" dir="auto" ' + o.titleAttr + '>' + esc(o.title) + '</button>' : '<span class="bio-c__tx" dir="auto">' + esc(o.title) + '</span>');
    if (o.act1 || o.chip) h += '<span class="bio-c__a bio-c__a1">' + (o.chip || '') + (o.act1 || '') + '</span>';   /* the chip is in the END group of row 1, on the start side of that row's actions */
    if (o.dur || o.sub || o.subHtml) h += '<span class="bio-c__t bio-c__t2">' + (o.dur ? '<span class="bio-dur">' + o.dur + '</span>' : '') + (o.subHtml ? '<span class="bio-c__tx">' + o.subHtml + '</span>' : o.sub ? '<span class="bio-c__tx" dir="auto">' + esc(o.sub) + '</span>' : '') + '</span>';
    if (o.act2) h += '<span class="bio-c__a bio-c__a2">' + o.act2 + '</span>';
    return h + (o.hidden ? '<span hidden>' + o.hidden + '</span>' : '') + '</div>';
  }
  /* a song as the slots: its name, its length and performer, and at the end of the second row what can be done with it (the heart among them) */
  function songCardUi(m, o) {
    var d = durOf(m), pill = o.pill || "", hasAud = pill.indexOf("data-audio") >= 0, hide = hasAud && !o.keepPlay;
    var heart = m && m.id && !/^h[0-9]/.test(m.id) && !o.noHeart ? cardHeart(m) : "";
    var act = o.act || "";
    return cardSlots({ cls: 'bio-mcard' + (o.cls ? ' ' + o.cls : ''), attrs: o.attrs, selected: o.selected, title: o.title, act1: o.rm || "", dur: d ? clock(d) : "", sub: o.by || "",
      act2: o.heartFirst ? heart + act + (hide ? '' : pill) : act + heart + (hide ? '' : pill), hidden: hide ? pill : "" });
  }
  /* an exercise of a vivencia as the slots: the number is the lead; the name (a button) and the leader's chip, the cross; the length and name of the chosen song, its play tile */
  function exCardUi(i, o) {
    var m = i.music, d = m ? durOf(m) : 0;
    return cardSlots({ cls: 'bio-icard' + (o.cls ? ' ' + o.cls : ''), attrs: o.attrs, selected: o.selected, lead: o.lead, title: o.title, titleAttr: o.titleAttr, chip: o.chip,
      act1: o.rm || "", dur: d ? clock(d) : "", sub: m ? songName(m) : 'בלי מוזיקה', act2: o.pill || "" });
  }
  var CARD_PILL = "";
  function bigPlay(m) {   /* a phone's exercise page: its song's play button is a LARGE icon (law 11); the player's states (data-st, data-audio) still drive it */
    if (m.audio_object) songInfo[m.audio_object] = { t: m.title || m.name, a: m.artist || "" };
    if (m.audio_object && window.BioAudio && BioAudio.button) return BioAudio.button(m.audio_object, false, true);
    return cardPill(m);
  }
  function cardPill(m, listKey) {
    var b = songBtn(m, false).replace(/width:var\(--ctl\);height:var\(--ctl\);min-height:var\(--ctl\);/g, CARD_PILL);
    return listKey ? b.replace('data-audio="', 'data-list="' + esc(listKey) + '" data-audio="') : b;
  }
  function pillCount(pill, n) {   /* an exercise with several songs: how many, on the corner of the play button; it takes no room, so nothing moves */
    if (!(n > 1)) return pill;
    var at = pill.lastIndexOf("</button>"); if (at < 0) return pill;
    return pill.slice(0, at) + btnTail("+" + (n - 1), 'title="' + n + ' מוסיקות"') + pill.slice(at);   /* law 10: the count is the play button's tail, inside its touch area */
  }
  /* a song with no file: the card has no YouTube sign, a tap on it opens YouTube; the only mark is the upload (a file from this device), with no background */
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-tab .bio-tab__n, .bio-tab .bio-tab__f { transform: none !important } .bio-tab__t { display: inline-flex; flex-direction: column; align-items: center } .bio-tab__t::before { content: attr(data-t); height: 0; overflow: hidden; visibility: hidden; font-weight: var(--fw-bold); pointer-events: none; user-select: none; white-space: nowrap } .bio-tab button.rchip.bio-tab__f[data-fac] { position: relative } .bio-tab button.rchip.bio-tab__f[data-fac]::after { content: \"\"; position: absolute; inset: -3px -18px -16px } .bio-tab [data-nameedit]::after { content: \"\"; position: absolute; inset: -14px -18px -3px } .bio-tab [data-nameedit] { position: relative }   #iscroll:has(#iplay) { padding-top: 0 !important } #iplay [data-likex] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important } #iplay [data-likex] svg { width: var(--icon) !important; height: var(--icon) !important } #itemDlg .bio-tab input.bio-tab__in, #itemDlg .rhead input.bio-tab__in { margin: 0 !important; margin-block: 0 !important; order: 0 !important; height: 1.25em !important; min-height: 0 !important; line-height: 1.25 !important; padding: 0 !important } .bio-tab__in { field-sizing: content; min-width: var(--ctl); max-width: 78vw; border: 0 !important; outline: 0; background: transparent !important; padding: 0 !important; margin: 0 !important; text-align: center; direction: rtl; font-family: inherit; text-overflow: ellipsis; height: auto; min-height: 0; line-height: var(--lh-tight); box-sizing: content-box; display: block } .bio-tab__in::placeholder { color: var(--text-muted); font-weight: var(--fw-regular) } .bio-dock .bio-dock__name { flex: 0 1 auto !important; max-width: var(--w) } #pl > .rhead [data-act=\"new\"] { transition: none !important } #pl > .rhead { position: relative } #pl > .rhead [data-catopen] { margin-inline-start: auto } #pl > .rhead #vtimer:not([hidden]) { margin-inline-start: auto } #pl > .rhead:has(#vtimer:not([hidden])) [data-catopen] { margin-inline-start: 0 } #pl > .rhead .rhead__text { align-items: flex-start; text-align: start } #pl > .rhead .rhead__title { flex: none; text-box: normal; line-height: 1.4; padding-block: 0; text-align: start; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100% } .rhead input.rhead__title, dialog.rsheet .sheet-head > input.rhead__title { flex: 1 1 auto; width: 100%; border: 0; outline: 0; background: transparent; padding: 0; margin: 0; color: inherit; font-family: inherit } @media (width < 760px) { html.bio-docked dialog.rsheet:has(.sheet-foot) .sheet { padding-bottom: calc(var(--dockfull) + var(--gap)) !important } html.bio-kb.bio-docked dialog.rsheet:has(.sheet-foot) .sheet, html.bio-kb dialog.rsheet:has(.sheet-foot) .sheet { padding-bottom: var(--gap) !important; margin-bottom: 0 !important } html.bio-kb dialog.rsheet:has(.sheet-foot) { padding-bottom: 0 !important; height: auto !important; min-height: 0 !important; top: auto !important; bottom: 0 !important; inset-block-start: auto !important; margin-top: auto !important } html.bio-kb dialog.rsheet:has(.sheet-foot) .sheet { flex: 0 1 auto !important; min-height: 0 !important } } #pl > #list { padding-block-start: var(--gap); padding-inline: var(--gap); gap: var(--gap) }   /* the end padding is the kit's: --end-pad, and the add button's room only while that button is on the screen */ [data-recv], [data-opening], [data-exsec] { display: flex; flex-direction: column } :is([data-recv], [data-opening], [data-exsec]):has(> .racc__body:not([data-closed]) > div > :not(:empty)) { gap: var(--gap) }  [data-vrow] .rrow__main { justify-content: center; min-width: 0 } [data-vrow] .rrow__title { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } [data-vrow] .rrow__sub:empty { display: none } .bio-vcnt__c { display: grid; flex: none; width: var(--icon); height: var(--icon); color: var(--text-muted) } .bio-vcnt__c svg { width: 100%; height: 100%; display: block; stroke-width: var(--icon-w) } .bio-vcnt__c svg path { animation: none !important; stroke-dasharray: none !important } .bio-vcnt { flex: none; display: inline-flex; align-items: center; gap: var(--gap-tight); color: var(--text-muted); font: var(--fw-bold) var(--fs-m)/1 var(--font); font-variant-numeric: tabular-nums; pointer-events: none } button:has(> [data-exn][data-zero]), button:has(> [data-exn]:empty) { display: none !important } #vtimer, #itimer { display: inline-flex; align-items: center; height: var(--ctl); line-height: 1 !important } #vtimer[hidden], #itimer[hidden] { display: none } .bio-tab .bio-tab__t, .bio-tab.is-cur .bio-tab__t { --e: max(0, calc(1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .28))); color: color-mix(in srgb, var(--text) calc(var(--e) * 100%), var(--text-muted)); font-weight: calc(var(--fw-regular) + (var(--fw-bold) - var(--fw-regular)) * var(--e)); transition: color var(--t-base) var(--ease) } .bio-tabs__track.is-drag .bio-tab .bio-tab__t { transition: none !important } .bio-tab .bio-tab__n, .bio-tab .bio-tab__f { transition: transform var(--t-base) var(--ease), opacity var(--t-base) var(--ease) } .bio-tabs__track.is-drag .bio-tab .bio-tab__n, .bio-tabs__track.is-drag .bio-tab .bio-tab__f { transition: none !important } .bio-tab { --nx: calc(clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))) } .bio-tab .bio-tab__n, .bio-tab .bio-tab__f { opacity: calc(1 - var(--nb, 0) * min(1, abs(var(--nx)) / (var(--cw, 360px) * .36))) !important } .bio-tab[data-far] { opacity: clamp(0, calc(1.5 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .37)), .7) !important } #iplay [data-likex] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important } #iplay [data-likex] svg { width: var(--icon); height: var(--icon) } .bio-card[aria-current=true][data-ex], .bio-card[aria-current=true][data-ex]:hover, .bio-icard[aria-current=true] { background: var(--surface) !important; border-color: transparent !important; box-shadow: var(--shadow) !important; outline: 0 !important } .bio-card [data-yt] { display: none !important } .bio-card [data-upl] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important; padding: 0 !important; background: transparent !important; border-color: transparent !important; box-shadow: none !important; color: var(--text) !important } .bio-card [data-upl] svg { width: var(--icon) !important; height: var(--icon) !important; stroke-width: 2 !important } ";
    document.head.appendChild(st);
    document.addEventListener("click", function (ev) {
      var c = ev.target.closest && ev.target.closest(".bio-card"); if (!c || c.querySelector("[data-audio]")) return;
      if (ev.target.closest("button, a, input, select, textarea")) return;
      var y = c.querySelector("[data-yt]"); if (y) y.click();
    });
  })();
  document.addEventListener("click", function (ev) {   /* a plus on a song card: where to add it, asked in a popup */
    var b = ev.target.closest && ev.target.closest("[data-addto]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    api("/rest/v1/music?id=eq." + encodeURIComponent(b.dataset.addto) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1").then(function (rows) {
      var m = rows && rows[0]; if (!m) { toast("המוסיקה לא נמצאה"); return; }
      chooseDest(songName(m), { vivId: state.viv && state.viv.id, itemId: liveItem && liveItem.id }, function (d) { return addMusicTo(m, d); });
    }, fail);
  }, true);
  /* every popup on a wide screen can be moved: hold its top (the title, or the empty strip above its content) and drag it anywhere; it comes back to its place the next time it opens */
  (function () {
    var st = document.createElement("style");
    st.textContent = "dialog[open] .sheet-head { cursor: grab } dialog.bio-moving, dialog.bio-moving * { cursor: grabbing !important; user-select: none }";
    document.head.appendChild(st);
    var d = null;
    document.addEventListener("pointerdown", function (ev) {
      if (ev.button > 0 || !wide()) return;
      var dlg = ev.target.closest && ev.target.closest("dialog[open]"); if (!dlg) return;
      if (ev.target.closest("button, a, input, select, textarea, label, [data-audio], [role=button], [role=menuitem]")) return;
      var rc = dlg.getBoundingClientRect(); if (ev.clientY - rc.top > 64) return;
      var cur = (dlg.style.translate || "0px 0px").split(" ");
      d = { dlg: dlg, x: ev.clientX, y: ev.clientY, ox: parseFloat(cur[0]) || 0, oy: parseFloat(cur[1]) || 0, rc: rc };
      dlg.classList.add("bio-moving");
      try { dlg.setPointerCapture(ev.pointerId); } catch (e) { /* no capture: the document still hears the move */ }
    });
    document.addEventListener("pointermove", function (ev) {
      if (!d) return;
      var dx = ev.clientX - d.x, dy = ev.clientY - d.y, vw = window.innerWidth, vh = window.innerHeight;
      dx = Math.max(-d.rc.left + 8 - d.ox + d.ox, Math.min(vw - d.rc.right - 8, dx + 0)) ; dy = Math.max(-d.rc.top + 8, Math.min(vh - d.rc.bottom - 8, dy));
      d.dlg.style.translate = (d.ox + dx) + "px " + (d.oy + dy) + "px";
    });
    var end = function () { if (!d) return; d.dlg.classList.remove("bio-moving"); d = null; };
    document.addEventListener("pointerup", end); document.addEventListener("pointercancel", end);
    document.addEventListener("close", function (ev) { if (ev.target && ev.target.tagName === "DIALOG") ev.target.style.translate = ""; }, true);
  })();
    /* the card of a music option: the song, its performer, the play tile, the chip that chooses it, the time, the bin */
  function optCardHtml(m, sel, withRm, plain, listKey, askWhere) {   /* plain: the catalog's exercise, only its songs: no chip to choose, no green frame */
    return songCardUi(m, { attrs: 'data-opt="' + esc(m.id) + '" role="button" tabindex="0"', selected: sel, title: songName(m), by: songBy(m), pill: cardPill(m, listKey), keepPlay: false, heartFirst: !!plain,
            rm: withRm ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-orm="' + esc(m.id) + '" aria-label="הסרה מהתרגיל" title="הסרה מהתרגיל">' + I.x + '</button>' : '',
            act: (plain ? '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-mfx="' + esc(m.id) + '" aria-label="התרגילים של המוזיקה" title="התרגילים של המוזיקה בקטלוג">' + exBtnInner(m.id) + '</button>' + (askWhere ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-pick="' + esc(m.id) + '" aria-label="' + (sel ? 'נבחר לתרגיל' : 'הוספה לתרגיל') + '" title="בחירת המוזיקה לתרגיל">' + (sel ? I.check : I.plus) + '</button>') : '') + (sel || plain ? '' : '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-choose="' + esc(m.id) + '" aria-label="בחירה" title="לבחור אותה לתרגיל בוויוונסיה">' + I.check + '</button>') + (plain ? '' : exBtnG(m)) });
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
      busy(dlg.querySelector("#crmo"), dropOpt(it, m)).then(function () { dlg.close(); done(); }, function (e) { dlg.close(); fail(e); });
    });
  }
  function musCards(it, ro) {   /* the songs of an exercise: a small header with the pencil that opens the editing of its music (add, remove, choose), then the cards */
    var list = optList(it), cur = it.music_id;
    var head = function (n) { return '<div style="display:flex;align-items:center;justify-content:flex-start;gap:var(--gap);min-height:var(--ctl)"><span style="font:var(--fw-bold) var(--fs-m)/1 var(--font);color:var(--text-muted)">מוזיקה' + (n ? ' (' + n + ')' : '') + '</span>' + (ro ? '' : '<button type="button" class="rbtn rbtn--ghost" data-addm aria-label="עריכת מוזיקה" title="עריכת מוזיקה" style="display:inline-flex;align-items:center;gap:var(--gap-tight);background:none !important;box-shadow:none !important;border:0 !important;outline:0;text-shadow:none;filter:none;padding-inline:0;min-width:0;color:var(--primary) !important;font-weight:var(--fw-bold)">' + I.pen + '<span>עריכה</span></button>') + '</div>'; };
    var grid = function (c) { return !c ? '<div style="color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font);padding-block:var(--gap)">אין מוזיקה מקושרת</div>' : '<div class="rgrid">' + c + '</div>'; };
    if (ro) { var base = (it.item_music_options || []).map(function (o) { return o.music; }).filter(Boolean); return head(base.length) + grid(base.map(function (m) { return optCardHtml(m, !!(it.sel && it.sel.indexOf(m.id) >= 0), false, true); }).join("")); }
    return head(list.length) + grid(list.map(function (m) { return optCardHtml(m, m.id === cur, true); }).join(""));
  }
  /* the catalog's preview of an exercise: the songs it comes with, as the same cards, at the same place (above the texts), without the add card */
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
  var simCache = {};
  function simOf(who) {   /* the song that plays and the songs like it, asked once per song: the button shows how many before it is pressed */
    if (simCache[who]) return simCache[who];
    return simCache[who] = api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id&limit=1").then(function (rows) {
      var m = rows && rows[0]; if (!m) return { m: null, n: 0 };
      var it = { __listen: true, id: "", music: m, music_id: m.id, item_music_options: [], sel: [] };
      return similarRows(it).then(function (rs) { var seen = {}; (rs || []).forEach(function (x) { if (x.music && x.music.id !== m.id) seen[x.music.id] = 1; }); return { m: m, it: it, n: Object.keys(seen).length }; });
    }).catch(function (e) { delete simCache[who]; throw e; });
  }
  function simLabel(n) { return n === 0 ? "אין מוסיקה דומה" : "מוסיקה דומה" + (n != null ? " (" + n + ")" : ""); }
  function similarToPlaying(who) {   /* only the songs like the one that plays: the popup of an exercise's music, with its suggestions and nothing else; a tap plays a song */
    simOf(who).then(function (o) { if (o.m && o.n) openAddMusic(o.it, null); }, fail);
  }
  function openAddMusic(it, changed) {
    var me = FLOA_AUTH.userId(), vid = state.viv && state.viv.id;
    var r = sheetOf("addMusDlg", "", '<style>#addMusDlg .sheet-head { display: none } #addMusDlg .sheet-body { gap: var(--gap) } #addMusDlg .sheet-body > div:first-of-type { position: relative; z-index: var(--z-raised) } #addMusDlg .sheet-body > div:first-of-type::after { content: \"\"; position: absolute; inset-inline: 0; top: calc(100% + var(--gap)); height: var(--gap-tight); background: linear-gradient(color-mix(in srgb, var(--scrim) 25%, transparent), transparent); opacity: 0; transition: opacity var(--t-base) var(--ease); pointer-events: none } #addMusDlg[data-scrolled] .sheet-body > div:first-of-type::after { opacity: 1 } html.bio-docked #addMusDlg .sheet-body { padding-bottom: 0 } #addMusDlg .bio-card[aria-current="true"] { border-color: var(--border); box-shadow: var(--shadow) } #addMusDlg #amup { height: var(--ctl); min-height: var(--ctl); border-radius: 0; border: 0; border-bottom: 1px solid var(--rf-line); background: transparent } #addMusDlg .rfield:focus-within + #amup { border-bottom-color: var(--rf-ink); box-shadow: 0 1px 0 var(--rf-ink) }</style><div style="display:flex;align-items:flex-end;gap:0"><label class="rfield" style="flex:1 1 auto;margin:0"><span id="amc">חיפוש בין מוסיקות</span><input id="amq" placeholder=" " autocomplete="off"></label><button type="button" class="rbtn rbtn--icon rbtn--ghost" id="amup" aria-label="העלאת קובץ מוזיקה" title="העלאת קובץ מוזיקה" style="flex:none;height:var(--ctl)"><span aria-hidden="true" class="ricon">' + I.upload + '</span></button></div><div id="amlist" style="flex:1 1 auto;min-height:0;overflow-y:auto;padding-bottom:calc(var(--dockfull) + var(--gap))"><div class="rskel rskel--title"></div></div>');
    r.style.overflowY = "hidden";   /* the search stays, only the cards scroll */
    if (wide()) {   /* the music popup (the songs like the one that plays, or adding music): on the left side, over the exercise, as the history is */
      var ad = document.getElementById("addMusDlg"), a0 = pd.getBoundingClientRect();
      if (ad) { var set = function (k, v) { ad.style.setProperty(k, v, "important"); };
        set("position", "fixed"); set("margin", "0"); set("inset", "auto"); set("left", a0.left + "px"); set("top", a0.top + "px"); set("width", a0.width + "px"); set("height", a0.height + "px"); set("max-width", "none"); set("max-height", "none"); set("transform", "none"); set("border-radius", "0"); }
    } else { var ad1 = document.getElementById("addMusDlg"); if (ad1) ["position", "margin", "inset", "left", "top", "width", "height", "max-width", "max-height", "transform", "border-radius"].forEach(function (k) { ad1.style.removeProperty(k); }); }
    var listEl = r.querySelector("#amlist"), qi = r.querySelector("#amq");
    qi.blur(); setTimeout(function () { if (document.activeElement === qi) qi.blur(); }, 60);   /* the popup opens on the list: the keyboard comes up only when the search is touched */
    var linked = null, rest = null, shown = 90, fresh = true;
    var xs = [], xsFor = null, xsT = 0, xsOf = {};
    function cardHtml(m, added) {
      var ex = xsOf[m.id];
      return songCardUi(m, { attrs: 'data-am="' + esc(m.id) + '" role="button" tabindex="0"', selected: added, title: songName(m), by: ex ? ex + " \u00b7 " + songBy(m) : songBy(m), pill: cardPill(m), keepPlay: false,
        act: exBtnG(m) + (it.__listen ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : (added ? '' : '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-amadd aria-label="הוספה לתרגיל" title="הוספה לתרגיל">' + I.plus + '</button>')),
        rm: !it.__listen && added ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-amrm aria-label="הסרה מהתרגיל" title="הסרה מהתרגיל">' + I.x + '</button>' : '' });
    }
    function draw() {
      if (!linked || !rest) return;
      var s0 = fold(qi.value.trim()), words = s0.split(/\s+/).filter(Boolean);
      var hit = function (m) { return fz(songName(m) + " " + songBy(m), s0); };
      var cur = it.__listen ? [] : it.__preview ? optList(it).filter(function (m) { return it.sel.indexOf(m.id) >= 0; }) : optList(it), has = {}; cur.forEach(function (m) { has[m.id] = 1; });   /* on the catalog's exercise only what was marked counts */
      var sl = songTiers(cur, s0), lk = songTiers(linked.filter(function (m) { return !has[m.id]; }), s0), ot = it.__listen ? [] : songTiers(rest.filter(function (m) { return !has[m.id]; }), s0), cut = ot.slice(0, shown);
      var xl = [], known = {}, got = {}; xsOf = {};   /* the songs found through their exercises: not the ones already shown by name */
      if (words.length && !it.__listen && xsFor === s0) {
        linked.concat(rest).forEach(function (m) { known[m.id] = m; }); sl.concat(lk, ot).forEach(function (m) { got[m.id] = 1; });
        xs.forEach(function (o) { if (!got[o.m.id] && known[o.m.id]) { xl.push(known[o.m.id]); if (o.ex) xsOf[o.m.id] = o.ex; } });
        xl = xl.slice(0, 90);
      }
      if (it.__listen) lk = lk.filter(function (m) { return m.id !== it.music_id; });
      var cnt = r.querySelector("#amc"); if (cnt && it.__listen) cnt.textContent = "חיפוש " + (words.length ? lk.length + " מתוך " : "בין ") + linked.filter(function (m) { return m.id !== it.music_id; }).length + " מוסיקות דומות"; else if (cnt) cnt.textContent = "חיפוש " + (words.length ? (sl.length + lk.length + ot.length + xl.length) + " מתוך " : "בין ") + (linked.length + rest.length) + " מוסיקות";   /* as the music page says it */
      var grid = function (arr) { return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:var(--gap)">' + arr.map(function (m) { return cardHtml(m, !!has[m.id]); }).join("") + '</div>'; };
      var head = function (t, n) { return '<div class="rrow__sub" style="padding:var(--gap) 0 var(--gap)">' + esc(t) + ' (' + n + ')</div>'; };
      listEl.innerHTML = (sl.length ? head(it.__listen ? "מתנגנת" : it.__preview ? "נבחרו" : "בתרגיל", sl.length) + grid(sl) : '') + (lk.length ? (it.__listen ? '' : head("הצעות", lk.length)) + grid(lk) : '') + (cut.length ? head("מוסיקה אחרת", ot.length) + grid(cut) : '') + (xl.length ? head("מוסיקה מתרגילים תואמים", xl.length) + grid(xl) : '') + (!sl.length && !lk.length && !cut.length && !xl.length ? ph(it.__listen ? "אין מוסיקה דומה" : "לא נמצא", "") : '');
    }
    var upb = r.querySelector("#amup");
    if (upb && it.__listen) { upb.remove(); upb = null; }   /* listening only: nothing is uploaded or added from here */
    if (upb) upb.addEventListener("click", function () {
      if (upb.dataset.busy) return;
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var label = upb.innerHTML; upb.dataset.busy = "1"; upb.textContent = "0%"; var upDone; busy(upb, new Promise(function (res) { upDone = res; }));
        var back = function (t, ms) { upDone(); if (t !== label) upb.textContent = t; setTimeout(function () { upb.innerHTML = label; delete upb.dataset.busy; }, ms || 0); };
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
    qi.addEventListener("input", function () {
      shown = 90; listEl.scrollTop = 0; draw();
      clearTimeout(xsT); if (it.__listen || !fold(qi.value).trim()) return;
      xsT = setTimeout(function () {   /* the exercises' side of the search waits for a pause in the typing, and for its texts the first time */
        warmEx().then(function () { var v = fold(qi.value.trim()); if (!listEl.isConnected || !v) return; xs = exSongs(v); xsFor = v; draw(); });
      }, 150);
    });
    listEl.addEventListener("scroll", function () { if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 600 && rest && shown < rest.length) { shown += 90; draw(); } }, { passive: true });
    listEl.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var c = ev.target.closest("[data-am]"); if (!c) return;
      if (it.__listen || !ev.target.closest("[data-amadd], [data-amrm]")) { var pb = c.querySelector("[data-audio]"); if (pb) pb.click(); return; }   /* a tap on a card always plays; the plus and the cross add and remove */
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
      if (!it.__recv && !it.__preview && !it.__listen && it.id && state.viv) { chooseDest(songName(m), { vivId: state.viv.id, itemId: it.id }, function (d) { return addMusicTo(m, d).then(function () { draw(); refreshSimilar(); if (changed) changed(); }); }); return; }   /* the plus asks where: the exercise is marked, a vivencia or another exercise can be chosen */
      if (it.__recv && state.viv) { chooseRecv(songName(m), it.__recv, function (kind) { var tgt = kind === it.__recv ? it : recvItem(kind); return addOpt(tgt, m).then(function () { draw(); refreshSimilar(); if (changed) changed(); if (tgt !== it) { paint(); toast(kind === "end" ? "נוסף למוסיקת הסיום" : "נוסף למוסיקת ההתחלה"); } }, fail); }); return; }
      confirmAddMusic(songName(m), it.__recv ? (it.__recv === "start" ? "מוסיקת ההתחלה" : "מוסיקת הסיום") : (itemName(it) || "התרגיל"), function () { return addOpt(it, m).then(function () { draw(); refreshSimilar(); if (changed) changed(); }, fail); });
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
    Promise.all([similarRows(it), it.__listen ? Promise.resolve([]) : loadAllSongs()]).then(function (res) {
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
    var v = 'var(--bleed, var(--gap))', q = '#' + id;
    /* the body is as wide as the popup, its content keeps the title's side room, and a row pulls back out to the edges, so its background and stripe reach the popup's walls */
    return '<style>' + q + ' .sheet { padding-inline: 0 } ' + q + ' .sheet-head, ' + q + ' .sheet-foot { padding-inline: var(--gap) } ' + q + ' .sheet-body { overflow-x: hidden; padding-inline: 0 } ' + q + ' .sheet-body > * { padding-inline: ' + v + ' } ' +   /* the popup already pads the sides: the song cards and the fields of an exercise do not pad them again */
      q + ' #ipg { padding-inline: 0 } ' + q + ' #iscroll { padding-inline: ' + v + ' } ' +   /* the exercise page's scroller is as wide as the popup and pads the sides itself: a scroller clips a shadow at its padding box, so the cards' shadow gets its room */
      q + ' .rrow { padding-inline: ' + v + ' } ' + q + ' .rrow[aria-current="true"] { background: var(--surface); box-shadow: inset 3px 0 0 var(--primary) }</style>';
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
    if (clr) { clr.classList.remove("rbtn--primary"); clr.style.cssText += ";background:var(--surface);border-color:var(--surface);color:var(--text)";   /* clearing is not the main action: the header's neutral tile, not the green one */
      if (!it.music_id) RosterSheet.setDirty(dlg0, false); else RosterSheet.setDirty(dlg0, true); clr.addEventListener("click", function () { chooseSong(it, null); }); }
    similarRows(it).then(function (rows) {
      var seen = {}, list = [];
      (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
      var plain = function (attr, t, sub, cur) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" ' + attr + '><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button></div>'; };
      var l = r.querySelector("#mlist");
      musicBrowse(l, list, it, function (m) { chooseSong(it, m); }, plain('data-act="other"', "מוזיקות אחרות", "מוסיקה שאינה בקטלוג", false));
      on(l, "other", function () { otherSheet(it); });
    }, fail);
  }
  /* other music: the files the catalogs do not list, and the songs this person uploaded by hand (those can be renamed). One upload button on top. */
  var UP_BTN = '<button type="button" class="rbtn rbtn--block rbtn--ghost" id="oup">העלאת קובץ מוזיקה</button>';
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
        var delb = c.querySelector("#csdel");
        var said = function (text) {   /* the answer is on the screen, not only in the console */
          RosterSheet.render(c, { kind: "confirm", title: "המחיקה לא בוצעה", from: "bottom", size: "s", body: '<div class="pad"><span>' + esc(text) + '</span></div>' });
        };
        busy(delb, api("/rest/v1/music?id=eq." + m.id, { method: "DELETE", prefer: "return=representation" })).then(function (gone) {
          if (!gone || !gone.length) { said("אין הרשאה למחוק את המוסיקה הזאת. רק מי שהעלה אותה יכול למחוק אותו."); return; }
          c.close(); m.__gone = true;
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
      busy(dlg.querySelector("#ssave"), api("/rest/v1/music?id=eq." + m.id, { method: "PATCH", prefer: "return=minimal", json: { title: t, artist: ar, name: t + (ar ? ", " + ar : "") } })).then(function () {
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
    var pen = function (m) { return (m.owner_id && m.owner_id === me) || (canEd && vid && m.vivencia_id === vid) ? '<button type="button" class="rbtn rbtn--icon rrow__trail" data-ed="' + esc(m.id) + '" aria-label="עריכת שם ומבצע" title="עריכת שם ומבצע" style="color:var(--text-muted)">' + I.pen + '</button>' : ''; };
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
        var label = up.textContent; up.dataset.busy = "1"; up.textContent = "0%"; var upDone; busy(up, new Promise(function (res) { upDone = res; }));
        var back = function (t, ms) { upDone(); up.textContent = t; setTimeout(function () { up.textContent = label; delete up.dataset.busy; }, ms || 0); };
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
    var r = sheetOf("otherDlg", "מוזיקות אחרות", '<style>#otherDlg .sheet-body { gap: var(--gap) }</style><label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label>' + UP_BTN + '<div id="olist" style="flex:1 1 auto;min-height:0;overflow-y:auto"><div class="rskel rskel--title"></div></div>');
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
  var pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: (loadCatSnap() || {}).tab === "mu" ? "mu" : "ex", mq: "", mln: "", mch: "", msp: "", mef: "", xo: "", mo: "" };   /* the tab is the one it was left on, even after a refresh */   /* the catalog's search, line, category, group level and place on the curve */
  function resetPk() { pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: pk.tab === "mu" ? "mu" : "ex", mq: "", mln: "", mch: "", msp: "", mef: "", xo: "", mo: "" }; }   /* a fresh search each time, but the tab stays where it was left */
  var LEVELS_FALLBACK = [{ key: "all", name_he: "מתחילים (מתאים לכל הקבוצות)" }, { key: "exp3", name_he: "לקבוצות עם ניסיון של כמה חודשים" }, { key: "exp6", name_he: "לקבוצות עם ניסיון של חצי שנה ויותר" }, { key: "deep", name_he: "לקבוצות העמקה ומתקדמות" }];   /* the index of group levels (biodanza.levels), when it has not come from the cloud */
  /* the catalog picker: a search and the list of categories; a category opens like an accordion onto its exercises. On a wide screen it is a pane; on a narrow one it is a popup from the bottom. */
  function catField() {   /* the header of a catalog IS its search: the title is what the field shows when empty (the same field as the title of the vivencias list when it is searched) */
    return '<input id="hq" class="rhead__title" data-cattitle type="text" placeholder="' + esc(catTitle()) + '" autocomplete="off" aria-label="' + esc(catTitle()) + '">';
  }
  function searchInput(id, label) {
    id = id || "q"; label = label || "חיפוש תרגילים בקטלוג";
    return '<input id="' + id + '" type="hidden">';
  }
  /* the catalog is two catalogs, chosen from the menu of the catalog button (pk.tab: "ex" the exercises', "mu" the music's): one page each, no tabs */
  function catTitle() { return exFilter ? "התרגילים של " + exFilter.name : pk.tab === "mu" ? "חיפוש במוזיקה" : "חיפוש בקטלוג"; }   /* the header IS the search: what the field says while it is empty */
  /* what the music tab filters by: the three tag columns of the music table. Values stay in English (they are the keys); a value with no entry here shows as it is. */
  var MU_LINE = [["Affectivity", "affectivity", "חיבתיות"], ["Creativity", "creativity", "יצירתיות"], ["Vitality", "vitality", "חיוניות"], ["Sexuality", "sexuality", "מיניות"], ["Trance", "transcendence", "התעלות"], ["Maze", "", "מבוך"]];   /* the app's own line names are used when it has them */
  var MU_CHAR = { "Rhythmic": "קצבי", "Melodic": "מלודי", "Other": "אחר" }, MU_SPEED = { "Slow": "איטי", "Medium": "בינוני", "Fast": "מהיר" };   /* the two new columns: character and speed, fixed order */
  var MU_EFFECT = { "Soft and Sensitive": "רך ורגיש", "Sensual": "חושני", "Joyful": "שמח", "Deep": "עמוק", "Romantic": "רומנטי", "Expressive": "אקספרסיבי", "Playful": "שובב", "Energizing": "מאיץ", "Dramatic": "דרמטי", "Cellestial": "שמימי", "Airy - Cosmic": "אווירי וקוסמי", "Sacred": "מקודש", "Passionate": "נלהב", "Light": "קליל", "Euphoric": "אופורי", "Pulsating": "פועם", "Optimistic": "אופטימי" };
  function muLineLabel(v) { var e = MU_LINE.filter(function (x) { return x[0] === v; })[0]; if (!e) return v; var n = e[1] && state.lines && state.lines.filter(function (l) { return l.key === e[1]; })[0]; return n ? n.name_he : e[2]; }
  function tagHit(m, f) {   /* a song matches when, in every box that is set, its array holds the chosen value; a song with no tags matches only when no box is set */
    return (!f.ln || (m.line_tags || []).indexOf(f.ln) >= 0) && (!f.ch || (m.rhythm_char_tags || []).indexOf(f.ch) >= 0) && (!f.sp || (m.rhythm_speed_tags || []).indexOf(f.sp) >= 0) && (!f.ef || (m.effect_tags || []).indexOf(f.ef) >= 0);
  }
  function pickerBody(sheetMode, swapIt, noMusic) {
    var pageCss = '<style>.bio-search { display: flex; align-items: center; gap: var(--gap-tight); min-height: var(--ctl); border-bottom: var(--bw) solid transparent } .bio-search > [data-sicon] { display: grid; flex: none; width: var(--icon); height: var(--icon); color: var(--text-muted) } .bio-search > [data-sicon] svg { width: 100%; height: 100%; stroke-width: var(--icon-w) } .bio-search > input { flex: 1 1 auto; align-self: stretch; width: 100%; min-width: 0; margin: 0; padding: 0; border: 0; background: transparent; color: inherit; text-align: center; outline: 0; text-overflow: ellipsis; text-box: normal } .mfs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gap) } @media (min-width: 760px) { .mfs { grid-template-columns: repeat(4, minmax(0, 1fr)) } } .pgh > .pgs { padding-inline: var(--gap); padding-block: 0 } .pgs > .rfield { margin: 0 } #pks, #pkl { scrollbar-width: none } #pks::-webkit-scrollbar, #pkl::-webkit-scrollbar { display: none } .pgh { position: absolute; inset: 0 0 auto 0; z-index: 2; display: flex; flex-direction: column; gap: var(--gap); background: var(--page); padding: var(--gap) 0 0; transform: translateY(calc(-1 * var(--ho, 0px))); will-change: transform } .pgp::after { content: \"\"; position: absolute; inset-inline: 0; top: calc(var(--hh, 0px) - var(--ho, 0px)); height: var(--gap-tight); background: linear-gradient(color-mix(in srgb, var(--scrim) 25%, transparent), transparent); opacity: 0; transition: opacity var(--t-base) var(--ease); pointer-events: none; z-index: 3 } .pgp[data-sc]::after { opacity: 1 } .pgp > .pgl { padding-top: var(--hh, 0px) } #pgr::-webkit-scrollbar { display: none } ' + (sheetMode ? '#catDlg [data-accb] > div > div, #catDlg #mgrid { padding-inline: 0 !important } #catDlg .sheet-body > #pgr, #catDlg .sheet-body > .rtabs { padding-inline: 0 } #catDlg .pgp > * { padding-inline: var(--bleed, var(--gap)) } #catDlg .pgh > .pgs { padding-inline: 0 }' : '') + '</style>';
    var pageSt = 'position:relative;flex:0 0 100%;min-width:0;min-height:0;display:flex;flex-direction:column;scroll-snap-align:start;scroll-snap-stop:always', listSt = 'position:relative;flex:1 1 auto;min-height:0;overflow-y:auto';
    var exPage = '<div class="pgp" role="tabpanel" style="' + pageSt + '">' + searchInput("q") + '<div class="rlist pgl" id="pks" style="' + listSt + '"><div id="list"><div class="rskel rskel--title"></div></div></div></div>';
    var muPage = swapIt || noMusic ? '' : '<div class="pgp" role="tabpanel" style="' + pageSt + '"><div class="pgh"><div class="pgs mfs">' +
      [["mln", "קו"], ["mch", "אופי"], ["msp", "מהירות"], ["mef", "אפקט"]].map(function (b) { return '<label class="rfield"><span>' + b[1] + '</span><select data-mf="' + b[0] + '"><option value="">הכל</option></select></label>'; }).join("") +
      '</div></div>' + searchInput("mq") + '<div class="rlist pgl" id="pkl" style="' + listSt + '"><div class="rskel rskel--title"></div></div></div>';
    return pageCss +
      '<div id="pgr" style="flex:1 1 auto;min-height:0;display:flex;overflow:hidden">' + exPage + muPage + '</div>';
  }
  function pickerWire(r, swapIt, sheet) {
      var open = pk.open || (pk.open = {});   /* the categories that are open, kept while an exercise is looked at and back again */
      r.querySelector("#q").value = pk.q;
      var catBy = {};
      function catCards(k) {
        return '<div class="rgrid rgrid--pad">' + (catBy[k] || []).map(function (e) {
          return cardSlots({ attrs: 'data-ex="' + e.id + '" role="button" tabindex="0"', title: name(e), subHtml: exSubHtml(e) });
        }).join("") + '</div>';
      }
      /* the one click handler of the list: a category opens or closes (slides), an exercise opens */
      r.querySelector("#list").addEventListener("click", function (ev) {
        if (ev.target.closest("[data-likex]")) return;   /* the heart on a card marks, it does not open */
        if (ev.target.closest("[data-xfx]")) { exFilter = null; paintCat(); return; }   /* the filter is let go */
        var l = r.querySelector("#list"), cb = ev.target.closest("[data-cat]");
        if (cb) {
          var k = cb.dataset.cat, nowOn = cb.getAttribute("aria-expanded") !== "true"; open[k] = nowOn; cb.setAttribute("aria-expanded", String(nowOn)); saveCat();
          
          var acc = l.querySelector('[data-accb="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]');
          var hrow = cb.closest(".rrow"); if (hrow) hrow.style.borderBottomColor = nowOn ? "transparent" : "var(--border)";   /* no line between an open header and its cards: the line is under the cards */
          if (acc) acc.style.borderBottomColor = nowOn ? "var(--border)" : "transparent";
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
        if (!q) {   /* with no search: inside every category the most songs first, and the categories by how many exercises they hold, the most first (a search keeps its own order, nearest first) */
          var dir = -1, cn = function (e) { return e.exercise_music && e.exercise_music[0] ? e.exercise_music[0].count : 0; };
          cats.forEach(function (k) { by[k].sort(function (a, b) { return dir * (cn(a) - cn(b)); }); });
          cats.sort(function (a, b) { return dir * (by[a].length - by[b].length); });
        }
        catBy = by;
        hint(r.querySelector("#q"), catFind("").length, "תרגיל", "תרגילים");
        var chip = '';   /* the filter is the layer's title (the exercises of ...): closing the layer lets it go */
        l.innerHTML = chip + (cats.length ? cats.map(function (k) {
          var on = open[k] != null ? open[k] : false;   /* a category opens only when it is tapped: typing a search opens nothing */
          var head = foldRow('data-cat="' + esc(k) + '"', esc(catName(k) || "ללא קטגוריה"), "", by[k].length, on, true);
          return head + '<div data-accb="' + esc(k) + '" style="border-bottom:1px solid ' + (on ? "var(--border)" : "transparent") + ';display:grid;grid-template-rows:' + (on ? '1fr' : '0fr') + ';transition:grid-template-rows .25s var(--ease)"><div style="overflow:hidden;min-height:0">' + (on ? catCards(k) : '') + '</div></div>';
        }).join("") : ph("לא נמצא תרגיל", ""));   /* the exercises tab holds exercises only: the songs have their own tab */
      }
      /* the pager: two pages side by side in one horizontal scroller with scroll snap. In RTL the first page (exercises) is on the right and scrollLeft runs negative, so the target is signed by the direction. A tap on a tab scrolls the pager; a swipe changes the tab; the tab marker is the kit's own (aria-selected). */
      var pgr = r.querySelector("#pgr"), TABS = ["ex", "mu"], mq = r.querySelector("#mq");
      var hq = (r.closest("dialog") || r).querySelector("input[data-cattitle]");
      if (hq) {
        hq.addEventListener("input", function () { var t = r.querySelector(pk.tab === "mu" ? "#mq" : "#q"); if (!t) return; t.value = hq.value; t.dispatchEvent(new Event("input", { bubbles: true })); });
        hq.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); hq.value = ""; hq.dispatchEvent(new Event("input")); hq.blur(); } });
        hq.__letGo = function () { if (!hq.value && document.activeElement !== hq) return false; hq.value = ""; hq.dispatchEvent(new Event("input")); hq.blur(); return true; };   /* the X: first the search goes and the title is back, then it closes */
      }
      function hint(inp, n, one, many) {   /* the search box says how many there are to search in, after the boxes above it have filtered */
        if (!inp) return;
        var t = "חיפוש " + (n === 1 ? one + " אחת" : "בין " + n + " " + many);
        inp.placeholder = t; inp.setAttribute("aria-label", t);
      }
      var musicAll = null, musicLoading = false, mById = {}, mList = [], mShown = 0, MP = 100, mxOf = {}, xs = [], xsFor = null, xsT = 0;
      function musicCards(a, b) {
        return mList.slice(a, b).map(function (m) {
          return songCardUi(m, { heartFirst: true, attrs: 'data-sgc="' + esc(m.id) + '"', title: songName(m), by: mxOf[m.id] ? mxOf[m.id] + " \u00b7 " + songBy(m) : songBy(m), pill: cardPill(m), act: '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-sg="' + esc(m.id) + '" aria-label="התרגילים של המוזיקה" title="התרגילים של המוזיקה">' + exBtnInner(m.id) + '</button><button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' });
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
        var byTags = musicAll.filter(function (m) { return tagHit(m, f); });
        hint(mq, byTags.length, "מוסיקה", "מוסיקות");
        mList = s ? songTiers(byTags, s) : byTags; mxOf = {};
        if (s && xsFor === s) { var inT = {}, got = {}; byTags.forEach(function (m) { inT[m.id] = 1; }); mList.forEach(function (m) { got[m.id] = 1; }); xs.forEach(function (o) { if (inT[o.m.id] && !got[o.m.id]) { got[o.m.id] = 1; mList.push(mById[o.m.id] || o.m); if (o.ex) mxOf[o.m.id] = o.ex; } }); }
        if (!s) {   /* with no search: always the most exercises first (the number of exercises of the catalog the song belongs to); a search keeps its own order, nearest first */
          if (!exCnt) ensureExCnt().then(function () { if (r.isConnected) paintMu(); });
          else { var md = -1, mc = function (m) { return exCnt[m.id] || 0; }; mList = mList.slice().sort(function (a, b) { return md * (mc(a) - mc(b)); }); }
        }
        mShown = Math.min(MP, mList.length); l.scrollTop = 0;
        l.innerHTML = mList.length ? '<div id="mgrid" class="rgrid rgrid--pad">' + musicCards(0, mShown) + '</div>' : ph("לא נמצאה מוסיקה", "");
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
      function markKind(i) {   /* which of the two catalogs this is: the title says it, the left part follows it */
        var t = TABS[i];
        if (pk.tab !== t) { pk.tab = t; saveCat(); syncLeftToTab(); }
        if (hq) { hq.placeholder = catTitle(); hq.setAttribute("aria-label", catTitle()); var cur = r.querySelector(i === 1 ? "#mq" : "#q"); hq.value = cur ? cur.value : ""; }
        if (i === 1) ensureMusic();
      }
      function goKind(i) { pgr.scrollTo({ left: dirSign() * i * pgr.clientWidth, behavior: "auto" }); markKind(i); }
      catApi = { paint: paintCat, goEx: function () { goKind(0); }, goKind: function (k) { goKind(k === "mu" ? 1 : 0); } };
      if (pgr) {
        var lastW = 0, resnap = function () { var w = pgr.clientWidth; if (w && w !== lastW) { lastW = w; var i = TABS.indexOf(pk.tab); goKind(i < 0 ? 0 : i); } };   /* it came on screen (a hidden box forgets its scroll) or changed width: back on the page of its catalog */
        if (window.ResizeObserver) new ResizeObserver(resnap).observe(pgr); else window.addEventListener("resize", resnap);
        var i0 = TABS.indexOf(pk.tab); markKind(i0 < 0 ? 0 : i0); requestAnimationFrame(resnap);
      }
      if (mq) {
        mq.value = pk.mq || "";
        mq.addEventListener("input", function () {
          paintMu(); clearTimeout(xsT); if (!fold(mq.value).trim()) return;
          xsT = setTimeout(function () { warmEx().then(function () { var v = fold(mq.value.trim()); if (!r.isConnected || !v || !musicAll) return; xs = exSongs(v); xsFor = v; paintMu(); }); }, 150);
        });
        r.querySelectorAll("[data-mf]").forEach(function (sel) { sel.addEventListener("change", function () { pk[sel.dataset.mf] = sel.value; paintMu(); }); });
        var ml = r.querySelector("#pkl");
        ml.addEventListener("scroll", function () {
          if (mShown >= mList.length || ml.scrollTop + ml.clientHeight < ml.scrollHeight - 400) return;
          var g = ml.querySelector("#mgrid"), to = Math.min(mList.length, mShown + MP); if (g) g.insertAdjacentHTML("beforeend", musicCards(mShown, to)); mShown = to;
        }, { passive: true });
        ml.addEventListener("click", function (ev) {   /* the same as before: a tap on a card plays, the chip adds an exercise with no name and that song */
          if (ev.target.closest("[data-audio], a")) return;
          var bt = ev.target.closest("[data-sg]");
          if (!bt) { var cd = ev.target.closest("[data-sgc]"), pb = cd && cd.querySelector("[data-audio]"); if (pb) pb.click(); return; }   /* a tap on a song only plays it; its exercises open from the curve button */
          var m = mById[bt.dataset.sg]; if (m) setExFilter(m);   /* the curve button: the exercises of the song, as a new layer (the same as from inside an exercise) */
        });
      }
      r.querySelectorAll(".pgp").forEach(function (P) {   /* the header (the boxes and the search) leaves with the scroll and comes back with it: the cards reach the tabs */
        var L = P.querySelector(".pgl"), H = P.querySelector(".pgh"); if (!L || !H) return;
        var hh = 0, off = 0, last = L.scrollTop;
        var measure = function () { hh = H.offsetHeight; P.style.setProperty("--hh", hh + "px"); };
        measure(); if (window.ResizeObserver) new ResizeObserver(measure).observe(H);
        L.addEventListener("scroll", function () {
          var st = L.scrollTop, d = st - last; last = st;
          off = st <= 0 ? 0 : Math.max(0, Math.min(hh, off + d));   /* down: it goes up with the list; up: it comes back by as much as the list moved */
          P.style.setProperty("--ho", off + "px");   /* the header and the shadow under it both follow this one number */
          P.toggleAttribute("data-sc", st > 2);   /* the shadow stays while the list is scrolled: under the header, or under the tabs once the header is gone */
        }, { passive: true });
      });
      var scEl = r.querySelector("#pks"); if (scEl) scEl.addEventListener("scroll", function () { clearTimeout(scEl._t); scEl._t = setTimeout(saveCat, 250); });
      r.querySelector("#q").addEventListener("input", function () { var sc = r.querySelector("#pks"); if (sc) sc.scrollTop = 0; paintCat(); if (!catTx) loadCatTx().then(function () { if (catTx && r.isConnected && r.querySelector("#q").value.trim()) paintCat(); }); });
      return (state.cats ? Promise.resolve() : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) {
        state.cats = c || [];
      })).then(function () { return state.cat ? null : loadCatalog().then(function (c) { state.cat = c; }); }).then(paintCat, fail);
  }
  function picker(swapIt) {
    state.pickerShow = true;
    show('<header class="rhead"><button class="rbtn rbtn--icon" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button><div class="rhead__text">' + catField() + '</div></header>' + pickerBody(false, swapIt), function (r) {
      on(r, "back", !wide() ? back : swapIt ? function () { pending = { item: swapIt.id }; back(); }   /* leaving a replacement: the same exercise is open again on the left */
        : function () { show(phPick("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); back(); });
      pickerWire(r, swapIt, false);
    });
    state.pickerShow = false;
    if (wide()) pd.classList.add("bio-dim");   /* the exercise of the vivencia on the left is dark while the catalog is open */
  }
  /* narrow screen: the catalog is a popup from the bottom, and a chosen exercise opens in a second popup on top of it, with the action as a green check in its header; closing it is back to the list */
  function dsfx() { return mdepth ? "_" + mdepth : ""; }   /* the ids of the popups of a layer over a layer: catDlg_1, exDlg_1, catDlg_2, ... */
  function pickerSheet(swapIt, over) {
    var dlg = document.getElementById("catDlg" + dsfx());
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "catDlg" + dsfx(); document.body.appendChild(dlg); }
    if (over && !dlg.__layerWired) { dlg.__layerWired = true; dlg.addEventListener("close", function () { if (mdepth && dlg.id === "catDlg" + dsfx()) { var xd = document.getElementById("exDlg" + dsfx()); if (xd && xd.open) xd.close(); mdepth--; popLayer(); saveCat(); } }); }   /* closing the popup of a layer gives the layer below back */
    if (!swapIt && !over && dlg.__bioKind === "main" && dlg.querySelector("#pgr")) {   /* built once: closing only lowers it, opening only raises it, with the search, the tab, the boxes and the scroll as they were */
      if (dlg.__bioPk) pk = dlg.__bioPk; if (dlg.__api) catApi = dlg.__api;
      RosterSheet.open(dlg, "bottom"); bleedSet(dlg);
      if (document.activeElement && document.activeElement !== document.body && dlg.contains(document.activeElement)) document.activeElement.blur();
      saveCat();
      return Promise.resolve();
    }
    RosterSheet.render(dlg, { title: over ? catTitle() : swapIt ? "" : pk.tab === "mu" ? "קטלוג מוזיקות" : "קטלוג תרגילים", from: "bottom", body: bleedCss(dlg.id) + pickerBody(true, swapIt, over) });
    dlg.__bioKind = swapIt || over ? "swap" : "main"; dlg.__bioPk = swapIt || over ? null : pk;
    var hd0 = dlg.querySelector(".sheet-head"); if (hd0) { var h20 = hd0.querySelector("h2"); if (h20) h20.remove(); hd0.insertAdjacentHTML("afterbegin", catField()); }   /* the title of the sheet is the search field */
    bleedSet(dlg);   /* the content sits on the title's own edges, the same on both sides */
    var q0 = dlg.querySelector("#q"); if (q0) q0.blur();   /* the popup opens on the list: the keyboard comes up only when the search is touched */
    if (document.activeElement && document.activeElement !== document.body && dlg.contains(document.activeElement)) document.activeElement.blur();   /* showModal focuses the first control, now the first tab: it would show a focus frame, so nothing starts focused */
    var r = dlg.querySelector(".sheet-body"), ls = r.querySelector("#pks");
    r.style.overflowY = "hidden";   /* the search stays where it is and only the list scrolls, so nothing shows through above it */
    if (ls) ls.style.cssText += ";flex:1 1 auto;min-height:0;overflow-y:auto";
    if (!dlg.__catWired) { dlg.__catWired = true; dlg.addEventListener("close", function () { if (!swapIt) saveCat(); }); }
    var drawn = pickerWire(r, swapIt, true); dlg.__api = catApi; saveCat();
    return drawn;
  }
  /* the catalog's exercise as an item of the page: its texts, its songs as options, the first one chosen; nothing of it is written anywhere */
  function itemFake(e, rows, songs, emphasis) {
    return { __preview: true, id: "", exercise_id: e.id, exercises: Object.assign({}, e, { exercise_texts: rows || [], emphasis: emphasis || "" }), title: null, poetics: null, guidance: null, notes: "",
      sel: [], music_id: null, music: null,   /* no song is marked until the facilitator marks some: those come with the exercise */
      item_music_options: songs.map(function (m, i) { return { music_id: m.id, created_at: String(1000 + i), music: m }; }) };
  }
  /* the cards of a read only page: a tap plays, the chip chooses the song the exercise is added with */
  function wireRoMusic(root, fake) {
    var imus = root.querySelector("#imus"); if (!imus) return;
    imus.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      if (ev.target.closest("[data-addm]")) { openAddMusic(fake, function () { imus.innerHTML = musCards(fake, true); }); return; }   /* more songs for what is shown: not for the catalog */
      var c = ev.target.closest("[data-opt]"); if (!c) return;
      var pk = ev.target.closest("[data-pick]");
      var mfx = ev.target.closest("[data-mfx]");
      if (mfx) { var mm = (fake.item_music_options || []).map(function (o) { return o.music; }).filter(function (x) { return x && x.id === mfx.dataset.mfx; })[0]; if (mm) setExFilter(mm); return; }   /* the catalog's exercises narrowed to this song's */
      if (!pk) { var au = c.querySelector("[data-audio]"); if (au) au.click(); return; }   /* a tap on the card plays; the add button marks the song for the exercise */
      var id = pk.dataset.pick, k = fake.sel.indexOf(id); fake.manual = fake.manual || {};
      if (k >= 0 && !fake.manual[id]) { fake.manual[id] = true; if (fake.auto === id) fake.auto = null; }   /* marked only because it plays: the tap makes the mark its own, it stays when the song stops */
      else if (k >= 0) { fake.sel.splice(k, 1); delete fake.manual[id]; }
      else { fake.sel.push(id); fake.manual[id] = true; }
      syncFake(); imus.innerHTML = musCards(fake, true);
    });
    function syncFake() {
      var first = (fake.item_music_options || []).map(function (o) { return o.music; }).filter(function (x) { return x && x.id === fake.sel[0]; })[0];
      fake.music_id = fake.sel[0] || null; fake.music = first || null;
    }
    /* the song that plays is marked as belonging to the exercise; when it stops (or another one starts) that mark comes off. What was marked by hand stays, played or not. */
    var onAudio = function (ev) {
      if (!imus.isConnected) { document.removeEventListener("bioaudio", onAudio); return; }
      var d = ev.detail || {}, pid = null;
      if (d.playing && d.name) (fake.item_music_options || []).forEach(function (o) { if (o.music && o.music.audio_object === d.name) pid = o.music.id; });
      fake.manual = fake.manual || {};
      var changed = false;
      if (fake.auto && fake.auto !== pid) { var j = fake.sel.indexOf(fake.auto); if (j >= 0 && !fake.manual[fake.auto]) fake.sel.splice(j, 1); fake.auto = null; changed = true; }
      var byHand = Object.keys(fake.manual).some(function (k) { return fake.manual[k]; });   /* something is already marked by hand: the song that plays is not marked on its own */
      if (pid && !byHand && fake.sel.indexOf(pid) < 0) { fake.sel.push(pid); fake.auto = pid; changed = true; }
      if (changed) { syncFake(); imus.innerHTML = musCards(fake, true); }
    };
    document.addEventListener("bioaudio", onAudio);
  }
  function previewSheet(e, swapIt) {
    var tok = ++previewTok;
    var exId = "exDlg" + dsfx();
    var skelDlg = document.getElementById(exId); if (!skelDlg) { skelDlg = document.createElement("dialog"); skelDlg.id = exId; document.body.appendChild(skelDlg); }
    RosterSheet.render(skelDlg, { title: name(e), from: "bottom", body: '<div class="rlist"><div class="rskel rskel--title"></div></div>' });   /* law 7: the window opens now, its content comes after */
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;
      var fake = itemFake(e, rows, songs, res.emphasis);
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה לוויוונסיה";
      var dlg = document.getElementById(exId);
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = exId; document.body.appendChild(dlg); }
      RosterSheet.render(dlg, { title: name(e), from: "bottom",
        body: bleedCss(exId) + '<style>html.rs-lock:not(.kb-open) #' + exId + ' .rfab { opacity: 1; transform: none; pointer-events: auto }</style>' + itemPageHtml(fake, true) });
      bleedSet(dlg);
      dlg.dataset.ex = swapIt ? "" : e.id; if (!dlg.__catWired) { dlg.__catWired = true; dlg.addEventListener("close", function () { saveCat(); }); } saveCat();
      wireRoMusic(dlg, fake);
      /* the action is a button with its words, as on a computer: a plus and the name of the vivencia (or the word, and a menu of the last three, when none is open); a swap says so */
      var vname = state.viv ? (state.viv.title || "הוויוונסיה") : "ויוונסיה", ico = (swapIt ? I.swap : I.plus);
      var gob = document.createElement("button"); gob.type = "button"; gob.id = "exgo"; gob.className = "rbtn rbtn--icon rbtn--primary"; gob.setAttribute("aria-label", swapIt ? word : "הוספה לוויוונסיה " + vname); gob.title = swapIt ? word : "הוספה לוויוונסיה " + vname;
      gob.style.cssText = "order:98;flex:none";
      gob.innerHTML = '<span aria-hidden="true" class="ricon">' + ico + '</span>';   /* only the plus; the confirmation says where it goes */
      var shd = dlg.querySelector(".sheet-head"); if (shd) shd.appendChild(gob);
      gob.addEventListener("click", function () {
        if (swapIt) confirmSwap(e, swapIt, true, fake.music_id, fake.sel);
        else chooseDest(name(e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(fake); addExTo(e, d.vivId, es.mid, es.all, true); }, { vivOnly: true });
      });
    }, function (er) { if (tok === previewTok) RosterSheet.render(skelDlg, { title: name(e), from: "bottom", body: '<div class="pad">' + ph("לא הצלחנו לטעון", "בדקו את החיבור ונסו שוב.") + '</div>' }); fail(er); });
  }
  /* the catalog is over a thousand exercises and the server hands out at most a thousand rows at a time: read it page by page */
  /* the catalog search: the names first, then the exercises whose poetics or guidance has the words (lower, after all the names). The texts come once, when the first word is typed. */
  var catTx = null, catTxP = null;   /* catTx[exercise id] = { p: poetics, g: guidance, a: both }, every language, already folded; read page by page (the server hands out a thousand rows at most) */
  function loadCatTx() {
    if (catTx || catTxP) return catTxP || Promise.resolve();
    var by = {}, PAGE = 1000;
    function pg(off) {
      return api("/rest/v1/exercise_texts?select=exercise_id,poetics,guidance&order=exercise_id,lang&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || [];
        rows.forEach(function (x) { var o = by[x.exercise_id] || (by[x.exercise_id] = { p: "", g: "" }); o.p += " " + fold(x.poetics || ""); o.g += " " + fold(x.guidance || ""); });
        return rows.length === PAGE ? pg(off + PAGE) : null;
      });
    }
    return (catTxP = pg(0).then(function () { Object.keys(by).forEach(function (k) { by[k].a = by[k].p + " " + by[k].g; }); catTx = by; }, function () { catTxP = null; }));
  }
  var exFilter = null, catApi = null;   /* exFilter: the catalog's exercises narrowed to the ones that belong to one song: { id, name, ids } */
  function catFind(q) {
    var r = catFind0(q);
    return exFilter ? r.filter(function (e) { return exFilter.ids[e.id]; }) : r;
  }
  function setExFilter(m) {   /* the exercises of one song: the exercises catalog as a new layer over what is open, filtered to that song's exercises (the same list, the same behaviour: an exercise opens beside it on a computer, over it on a phone) */
    api("/rest/v1/exercise_music?music_id=eq." + m.id + "&select=exercise_id&limit=1000").then(function (rows) {
      var ids = {}; (rows || []).forEach(function (x) { ids[x.exercise_id] = 1; });
      openFilteredLayer({ id: m.id, name: songName(m), ids: ids });
    }, fail);
  }
  function openFilteredLayer(filter) {
    var below = catPanel;   /* is a catalog layer open under this one? then its left side is dimmed, as the left pane is under the first layer */
    pushLayer(filter);
    if (wide()) {
      ensureCatLayer(); catLayer.classList.add("bio-catlayer--over"); void catLayer.offsetWidth;   /* a layer over: both halves move as one; the first frame is drawn closed so it slides in */
      if (below) {   /* the layer under it is dimmed by a scrim that stays where it is (it does not slide with the layer): it only fades, and a tap on it closes this layer only */
        var up = catLayer, sc = document.createElement("div"); sc.className = "bio-catscrim"; sc.setAttribute("aria-hidden", "true");
        document.body.insertBefore(sc, up); up.__scrim = sc;
        sc.addEventListener("click", function () { if (catLayer === up) closeCatPanel(); });
        var sync = function () { sc.classList.toggle("is-on", up.classList.contains("is-open") && !up.querySelector(".catprev.is-open")); };   /* dark while the layer is open and its own left part (the exercise opened from it) is not */
        var mo = new MutationObserver(sync); mo.observe(up, { attributes: true, attributeFilter: ["class"] }); mo.observe(up.querySelector(".catprev"), { attributes: true, attributeFilter: ["class"] });
      }
      openCatPanel();
    } else { mdepth++; pickerSheet(null, true); }
  }
  function catFind0(q) {
    var byName = nearest(state.cat || [], function (e) { return name(e) + " " + e.title_en + " " + catName(e.category); }, q);
    if (!fold(q).trim() || !catTx) return byName;
    var seen = {}; byName.forEach(function (e) { seen[e.id] = 1; });
    var tx = (state.cat || []).filter(function (e) { return !seen[e.id] && catTx[e.id]; }).map(function (e) { return { e: e, s: fzsF(catTx[e.id].a, q) }; })
      .filter(function (o) { return o.s > 0; }).sort(function (a, b) { return b.s - a.s; }).map(function (o) { return o.e; });
    return byName.concat(tx);
  }
  /* the music search: a song is found, from the first reason to the last, by (1) its own name, (2) its performer, (3) the name of an exercise it belongs to,
     (4) that exercise's poetics, (5) its guidance, (6) a tag word (fast, melodic, sensual...). A song found by several is shown once, at the earliest. Inside one reason, nearest first. */
  var exGroups = null;
  function warmEx() {   /* the exercises' texts and the exercises with their songs, each read once; the search works with what has arrived */
    return Promise.all([loadCatTx(), loadExMusic().then(function (g) { exGroups = g; }, function () { })]);
  }
  function songTiers(list, q) {   /* the songs whose own name or performer match: name first, then performer, then words split across the two */
    if (!fold(q).trim()) return list;
    var seen = {}, mark = function (a) { a.forEach(function (m) { seen[m.id] = 1; }); return a; }, rest = function () { return list.filter(function (m) { return !seen[m.id]; }); };
    var a = mark(nearest(list, songName, q)), b = mark(nearest(rest(), songBy, q)), c = nearest(rest(), function (m) { return songName(m) + " " + songBy(m); }, q);
    return a.concat(b, c);
  }
  var tagTxt = {};
  function tagText(m) {
    return tagTxt[m.id] || (tagTxt[m.id] = fold((m.line_tags || []).map(function (v) { return muLineLabel(v) + " " + v; }).concat((m.rhythm_char_tags || []).map(function (v) { return (MU_CHAR[v] || "") + " " + v; }), (m.rhythm_speed_tags || []).map(function (v) { return (MU_SPEED[v] || "") + " " + v; }), (m.effect_tags || []).map(function (v) { return (MU_EFFECT[v] || "") + " " + v; })).join(" ")));
  }
  function exSongs(q) {   /* [{ m, ex }]: the songs found through their exercises (and their tags), best reason first */
    if (!exGroups || !fold(q).trim()) return [];
    var best = {}, n = 0;
    exGroups.forEach(function (g) {
      if (g.id === "_loose") return;
      var nm = fzs(g.name + " " + (g.en || ""), q), tx = catTx && catTx[g.id], ps = tx ? fzsF(tx.p, q) : 0, gs = tx ? fzsF(tx.g, q) : 0;
      var tier = nm ? 3 : ps ? 4 : gs ? 5 : 0; if (!tier) return;
      var sc = nm || ps || gs;
      g.songs.forEach(function (m) { var b = best[m.id]; if (!b || tier < b.tier || (tier === b.tier && sc > b.s)) best[m.id] = { m: m, ex: g.name, tier: tier, s: sc, i: b ? b.i : n++ }; });
    });
    exGroups.forEach(function (g) { g.songs.forEach(function (m) { if (best[m.id]) return; var sc = fzsF(tagText(m), q); if (sc) best[m.id] = { m: m, ex: "", tier: 6, s: sc, i: n++ }; }); });
    return Object.keys(best).map(function (k) { return best[k]; }).sort(function (a, b) { return a.tier - b.tier || b.s - a.s || a.i - b.i; });
  }
  function loadCatalog() {
    var all = [], PAGE = 1000;
    function page(off) {
      return api("/rest/v1/exercises?select=id,title_he,title_en,category,phase_hint,phase_keys,level_key,source,exercise_texts(lang,source),exercise_lines(line_key),exercise_music(count)&order=title_en,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || []; all = all.concat(rows);
        return rows.length === PAGE ? page(off + PAGE) : all;
      });
    }
    return page(0);
  }
  /* a catalog exercise shown on the left while one is being added or replaced: its own words, and one button that does it */
  var previewTok = 0;
  /* what a catalog exercise shows before it is added: its words and every song linked to it */
  function loadPreview(id) {
    return Promise.all([api("/rest/v1/exercise_texts?exercise_id=eq." + id + "&select=lang,poetics,guidance,level,curve,level_basis,curve_basis,source"), api("/rest/v1/exercise_music?exercise_id=eq." + id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)"), api("/rest/v1/exercises?id=eq." + id + "&select=emphasis&limit=1")]).then(function (r) {
      var seen = {}, songs = [];
      (r[1] || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; songs.push(x.music); } });
      return ensureExCnt().then(function () {   /* the most popular first: the song linked to the most exercises of the catalog */
        var c = function (m) { return (exCnt && exCnt[m.id]) || 0; };
        songs.sort(function (a, b) { return c(b) - c(a) || songName(a).localeCompare(songName(b)); });
        return { rows: r[0] || [], songs: songs, emphasis: (r[2] && r[2][0] && r[2][0].emphasis) || "" };
      });
    });
  }
  /* choosing the song an exercise is added with: a tap marks it, a tap on the marked one takes the mark off (no music) */
  function firstMusic(exId, mid) {   /* the song an exercise is added with: the chosen one (or none), else the catalog's first */
    if (mid !== undefined) return Promise.resolve(mid ? [{ music_id: mid }] : []);
    return api("/rest/v1/exercise_music?exercise_id=eq." + exId + "&select=music_id&limit=1");
  }
  /* in no vivencia: the three vivencias that were changed last, to put the exercise in one of them */
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
  /* THE MUSIC PAGE of the catalog: the song as a card (a tap plays), and the exercises of the catalog that it belongs to. At the top left, the add button asks where to add the song. Beside the catalog it opens on the left, on a phone in a popup of its own. */
  var catPrevMus = null, lastExPrev = null, lastMusPrev = null;
  function musPh() {   /* the music tab with no song looked at: the left part is not there at all, what is under it shows */
    catPrevMus = null; lastMusPrev = null; catPrevId = null; catPrevCtx = null; closeCatPrev();
  }
  function exPh() {   /* the exercises tab with nothing looked at: the left part is closed */
    catPrevMus = null; lastExPrev = null; catPrevId = null; catPrevCtx = null; closeCatPrev();
  }
  function closeExPrev() { lastExPrev = null; closeCatPrev(); }   /* closing only the left part of the catalog shows what is under it (the exercise that was open), not a placeholder */
  function closeMusPrev() { catPrevMus = null; lastMusPrev = null; closeCatPrev(); }
  function syncLeftToTab() {   /* the left side follows the tab: the exercise that was looked at, or the song that was looked at, or nothing */
    if (!(wide() && catPanel && catPrev)) return;
    var isOpen = catPrev.classList.contains("is-open");
    if (pk.tab === "mu") {
      if (!lastMusPrev) { musPh(); return; }
      if (!(isOpen && catPrevMus === lastMusPrev.id)) { if (isOpen) { catPrevMus = null; } previewMusic(lastMusPrev); }
    } else {
      if (!lastExPrev) { if (!(isOpen && catPrevId)) exPh(); return; }
      if (!(isOpen && catPrevId === lastExPrev.id)) previewEx(lastExPrev);
    }
  }
  function previewMusic(m) {
    var useLayer = !!(catPanel && wide());
    if (useLayer && catPrevMus === m.id && catPrev && catPrev.classList.contains("is-open")) { closeMusPrev(); return; }
    var tok = ++previewTok;
    if (useLayer && catLayer) { catLayer.querySelectorAll(".bio-card[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); }); var mc = catLayer.querySelector("[data-sgc=\"" + m.id + "\"]"); if (mc) mc.setAttribute("aria-current", "true"); }   /* the song whose exercises are shown is marked, as the exercise whose texts are shown is */
    var skelM = '<div class="rlist"><div class="rskel rskel--title"></div></div>';   /* law 7: the layer or the popup opens now, with a skeleton */
    if (useLayer) { catPrev.innerHTML = '<header class="rhead bio-ihead"><div class="rhead__text rhead__text--row"><span class="rhead__title rhead__title--clip">' + esc(songName(m)) + '</span></div></header>' + skelM; catPrevId = null; catPrevCtx = null; catPrevMus = m.id; lastMusPrev = m; refreshPrevLabel(); requestAnimationFrame(function () { catPrev.classList.add("is-open"); }); }
    else { var skelDlg = document.getElementById("mpDlg"); if (!skelDlg) { skelDlg = document.createElement("dialog"); skelDlg.id = "mpDlg"; document.body.appendChild(skelDlg); } RosterSheet.render(skelDlg, { title: songName(m), from: "bottom", body: skelM }); }
    Promise.all([api("/rest/v1/exercise_music?music_id=eq." + m.id + "&select=exercises(id,title_he,title_en,category)&limit=500"), state.cats ? null : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) { state.cats = c || []; }, function () { return null; })]).then(function (rr) { var rows = rr[0];
      if (tok !== previewTok) return;
      var seen = {}, exs = [];
      var full = {}; (state.cat || []).forEach(function (c) { full[c.id] = c; });   /* the catalog's own record (source, texts, song count): the cards say what they say in the catalog */
      (rows || []).forEach(function (x) { var e = x.exercises; if (e && !seen[e.id]) { seen[e.id] = 1; exs.push(full[e.id] || e); } });
      exs.sort(function (a, b) { return name(a).localeCompare(name(b), "he"); });
      var byLine = {}, order = [];   /* under each category of the catalog, its exercises */
      exs.forEach(function (e) { var k = e.category || ""; if (!byLine[k]) { byLine[k] = []; order.push(k); } byLine[k].push(e); });
      var rank = function (k) { var i = (state.cats || []).map(function (x) { return x.key; }).indexOf(k); return i < 0 ? 999 : i; };
      order.sort(function (a, b) { return rank(a) - rank(b); });
      var groups = order.map(function (k) { return { name: catName(k) || "ללא קטגוריה", list: byLine[k] }; });
      var plusI = I.plus;
      var addBtn = ''; var addBtnOld = '<button type="button" class="rbtn" data-mpadd style="flex:none;gap:var(--gap);margin-inline-end:var(--gap)"><span aria-hidden="true" class="ricon">' + plusI + '</span><span>הוספה</span></button>';
      /* the exercises of the song, laid out as the catalog's exercises tab: a header per category with its count, opening on a tap (it slides), the same cards under it */
      var opn = {}, cardsOf = function (g) { return '<div class="rgrid rgrid--pad">' + g.list.map(function (e) { return cardSlots({ attrs: 'data-pvex="' + esc(e.id) + '" role="button" tabindex="0"', title: name(e), subHtml: exSubHtml(e) }); }).join("") + '</div>'; };
      var body = exs.length ? groups.map(function (g, gi) {
        var on = groups.length === 1;   /* one category only: it is open, there is nothing to choose */
        opn[gi] = on;
        var head = foldRow('data-pvcat="' + gi + '"', esc(g.name), "", g.list.length, on, true);
        return head + '<div data-pvaccb="' + gi + '" style="border-bottom:1px solid ' + (on ? "var(--border)" : "transparent") + ';display:grid;grid-template-rows:' + (on ? '1fr' : '0fr') + ';transition:grid-template-rows .25s var(--ease)"><div style="overflow:hidden;min-height:0">' + (on ? cardsOf(g) : '') + '</div></div>';
      }).join("") : '<div style="padding:var(--gap);color:var(--text-muted);font:var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font)">המוזיקה הזאת לא משויכת לתרגיל בקטלוג</div>';
      var wire = function (root) {
        var ab = root.querySelector("[data-mpadd]");
        if (ab) ab.addEventListener("click", function () { chooseDest(songName(m), { vivId: state.viv && state.viv.id, itemId: liveItem && liveItem.id }, function (d) { return addMusicTo(m, d, false); }); });
        root.addEventListener("click", function (ev) {
          var cb = ev.target.closest("[data-pvcat]");
          if (cb) {   /* a category opens or closes, sliding */
            var gi = cb.dataset.pvcat, nowOn = cb.getAttribute("aria-expanded") !== "true"; cb.setAttribute("aria-expanded", String(nowOn));
            
            var acc = root.querySelector('[data-pvaccb="' + gi + '"]'), hrow = cb.closest(".rrow"); if (hrow) hrow.style.borderBottomColor = nowOn ? "transparent" : "var(--border)";
            if (acc) { acc.style.borderBottomColor = nowOn ? "var(--border)" : "transparent"; if (nowOn && !acc.firstChild.firstChild) acc.firstChild.innerHTML = cardsOf(groups[+gi]); requestAnimationFrame(function () { acc.style.gridTemplateRows = nowOn ? "1fr" : "0fr"; }); }
            return;
          }
          if (ev.target.closest("[data-audio], a, [data-mpadd], button:not([data-pvex])")) return;
          var ex = ev.target.closest("[data-pvex]");
          if (ex) { var e = exs.filter(function (x) { return x.id === ex.dataset.pvex; })[0]; if (e) previewEx(e); return; }
        });
      };
      if (useLayer) {
        catPrev.innerHTML = '<header class="rhead bio-ihead"><div class="rhead__text rhead__text--row"><span class="rhead__title rhead__title--clip">' + esc(songName(m)) + '</span></div>' + addBtn + '</header>' + body;
        wire(catPrev);
        var ph = catPrev.querySelector(".rhead"); if (ph) { var xb = document.createElement("button"); xb.type = "button"; xb.className = "rbtn rbtn--icon"; xb.setAttribute("aria-label", "סגירה"); xb.title = "סגירה"; xb.innerHTML = I.x; xb.addEventListener("click", function () { previewTok++; closeMusPrev(); }); ph.insertBefore(xb, ph.firstChild); }
        catPrevId = null; catPrevCtx = null; catPrevMus = m.id; lastMusPrev = m; refreshPrevLabel();
        requestAnimationFrame(function () { catPrev.classList.add("is-open"); });
      } else {
        var dlg = document.getElementById("mpDlg");
        if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "mpDlg"; document.body.appendChild(dlg); }
        RosterSheet.render(dlg, { title: songName(m), from: "bottom", body: body });
        var shd = dlg.querySelector(".sheet-head"); if (shd) { shd.insertAdjacentHTML("beforeend", addBtn); var b2 = shd.querySelector("[data-mpadd]"); if (b2) b2.style.order = "98"; }
        wire(dlg);
      }
    }, function (er) { if (tok === previewTok) { var eb = ph("לא הצלחנו לטעון", "בדקו את החיבור ונסו שוב."); if (useLayer) catPrev.innerHTML = '<header class="rhead bio-ihead"><div class="rhead__text rhead__text--row"><span class="rhead__title rhead__title--clip">' + esc(songName(m)) + '</span></div></header>' + eb; else RosterSheet.render(skelDlg, { title: songName(m), from: "bottom", body: eb }); } fail(er); });
  }
  function previewEx(e, swapIt) {
    var useLayer = !!(catPanel && wide() && !swapIt);
    if (useLayer && catPrevId === e.id && catPrev && catPrev.classList.contains("is-open")) { previewTok++; closeExPrev(); return; }   /* a second tap on the chosen one: it closes, with its animation */
    var tok = ++previewTok;
    var skelH = '<header class="rhead bio-ihead"><div class="rhead__text rhead__text--row"><span class="rhead__title rhead__title--clip">' + esc(name(e)) + '</span></div></header>' + '<div class="rlist"><div class="rskel rskel--title"></div></div>';   /* law 7: the layer or the popup opens now, with a skeleton; the exercise fills it when it arrives */
    if (useLayer && catPanel) { catPrev.innerHTML = skelH; catPrevId = e.id; lastExPrev = e; catPrevCtx = null; refreshPrevLabel(); requestAnimationFrame(function () { catPrev.classList.add("is-open"); }); }
    else show('<div class="rlist"><div class="rskel rskel--title"></div></div>', function () { /* the skeleton has nothing to wire */ }, "d");
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;   /* a later row was chosen meanwhile */
      var fake = itemFake(e, rows, songs, res.emphasis);
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה";   /* adding: a plus with the vivencia's name; in no vivencia, a plus with the word, and a tap asks which of the last three */
      /* the same page as the exercise of a vivencia, only read: its header, its song cards, its texts; the action is the green button in the header, where the delete is in the vivencia */
      var phtml = itemHead(false, false, "", e.id, name(e), true, word, undefined, undefined, !swapIt) + itemPageHtml(fake, true);
      var pwire = function (r) {
        wireRoMusic(r, fake); sbSync(r); catPreview = true;
        on(r, "doswap", function (btn) {
          if (swapIt) confirmSwap(e, swapIt, undefined, fake.music_id, fake.sel);
          else chooseDest(name(e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(fake); addExTo(e, d.vivId, es.mid, es.all); }, { vivOnly: true });
        });
      };
      if (useLayer && catPanel) { catPrev.innerHTML = phtml; pwire(catPrev);
        var ph0 = catPrev.querySelector(".rhead"); if (ph0) { var xb = document.createElement("button"); xb.type = "button"; xb.className = "rbtn rbtn--icon"; xb.setAttribute("aria-label", "סגירת התרגיל"); xb.title = "סגירת התרגיל"; xb.innerHTML = I.x; xb.addEventListener("click", function () { previewTok++; closeExPrev(); }); var gr0 = document.createElement("span"); gr0.className = "rgroup"; var da0 = ph0.querySelector(":scope > [data-act=\"doswap\"]"); if (da0) gr0.appendChild(da0); gr0.insertAdjacentHTML("beforeend", heartBtnEx(e.id, "")); ph0.insertBefore(xb, ph0.firstChild); ph0.appendChild(gr0); } catPrevId = e.id; lastExPrev = e; catPrevCtx = { e: e, fake: fake }; refreshPrevLabel(); saveCat(); requestAnimationFrame(function () { catPrev.classList.add("is-open"); }); }
      else show(phtml, pwire, "d");
    }, function (er) { if (tok === previewTok) { var eb = ph("לא הצלחנו לטעון", "בדקו את החיבור ונסו שוב."); if (useLayer && catPanel) catPrev.innerHTML = skelH.replace('<div class="rlist"><div class="rskel rskel--title"></div></div>', eb); else show(eb, function () { /* nothing to wire */ }, "d"); } fail(er); });
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
  /* a song chosen in the catalog's search: an exercise with no name, only that song */
  /* a confirm that waits for its action (the action returns its promise): the popup stays and the pressed button shows the wait, then it closes, on success and on failure (law 7) */
  function confirmGo(dlg, btn, fn) { var pr = fn(), fin = function () { dlg.close(); }; if (pr && pr.then) busy(btn, pr).then(fin, fin); else fin(); }
  function confirmChoose(songLabel, exLabel, fn) {   /* choosing the song that plays in the vivencia asks first, in the kit's popup with ONE action */
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "בחירת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad"><span>לבחור את "' + esc(songLabel) + '" כמוזיקה של "' + esc(exLabel) + '"? היא תתנגן בוויוונסיה.</span></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="cchoose">בחירה</button>' });
    dlg.querySelector("#cchoose").addEventListener("click", function (ev) { confirmGo(dlg, ev.currentTarget, fn); });
  }
  function confirmAddMusic(songLabel, toLabel, fn) {   /* every adding of a song asks first, in the kit's popup with ONE action */
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הוספת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad" style="display:flex;flex-direction:column;gap:var(--gap)"><span>להוסיף את "' + esc(songLabel) + '" ל' + (toLabel ? '"' + esc(toLabel) + '"' : "") + '?</span></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="cadd">הוספה</button>' });
    dlg.querySelector("#cadd").addEventListener("click", function (ev) { confirmGo(dlg, ev.currentTarget, fn); });
  }
  /* WHERE A SONG GOES: a popup with the vivencias as an accordion, each opening to its exercises. It opens on the vivencia (and the exercise) the person is in, and the choice is marked; the button at the bottom adds. A vivencia with no exercise marked takes the song as a new exercise with no name. */
  /* the small pickers that ask where to add have a dialog of their own (chooseDest is a side panel on a wide screen, see showL / __showLeft) */
  function destDialog() {
    var dlg = document.getElementById("destDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "destDlg"; document.body.appendChild(dlg); }
    return dlg;
  }
  function chooseDest(songLabel, cur, fn, opts) {
    var vivOnly = !!(opts && opts.vivOnly);
    var side = wide() && !!window.__showLeft, pane = null, dlg = side ? null : destDialog();   /* a wide screen: the side panel of the app (the same layer as the lists of what I loved); a phone: the bottom sheet */
    var vivs = (state.vivs || []).filter(function (v) { return v.role !== "view"; });
    var dest = { vivId: cur && cur.vivId || null, itemId: cur && cur.itemId || null };
    if (dest.vivId && !vivs.some(function (v) { return v.id === dest.vivId; })) dest = { vivId: null, itemId: null };
    if (dest.vivId) vivs = vivs.filter(function (v) { return v.id === dest.vivId; }).concat(vivs.filter(function (v) { return v.id !== dest.vivId; }));   /* the vivencia you are in is marked and comes first */
    var open = {}, cache = {};
    if (dest.vivId && !vivOnly) { open[dest.vivId] = 1; if (state.viv && state.viv.id === dest.vivId && state.items) cache[dest.vivId] = state.items; }
    function body() {
      var ico = function (svg) { return '<span aria-hidden="true" class="ricon">' + svg + '</span>'; };
      var noteSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
      var arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
      var dv = vivs.filter(function (v) { return v.id === dest.vivId; })[0], di = dest.itemId && (cache[dest.vivId] || []).filter(function (i) { return i.id === dest.itemId; })[0];
      var destTxt = dv ? esc(dv.title || "ויוונסיה חדשה") + (di ? ' <span style="font-weight:var(--fw-regular)">·</span> ' + esc(itemName(di) || "ללא שם") : dest.recv ? ' <span style="font-weight:var(--fw-regular)">·</span> ' + (dest.recv === "end" ? "מוסיקת סיום" : "מוסיקת התחלה") : '') : '';
      var flow = '<div class="rflow">' +
        '<span class="rchip rchip--l rchip--ink">' + ico(vivOnly ? I.curve : noteSvg) + '<span class="rchip__t">' + esc(songLabel) + '</span></span>' + '<span aria-hidden="true" class="ricon ricon--primary">' + arrowSvg + '</span>' +
        (dv ? '<span class="rchip rchip--l rchip--solid"><span class="rchip__t">' + destTxt + '</span></span>' : '<span class="rchip rchip--l rchip--empty">בחרו יעד</span>') + '</div>';
      return '<div class="pad" style="display:flex;flex-direction:column;gap:var(--gap)">' + flow +
        '<div id="cdbox" style="max-height:min(50vh,26rem);overflow-y:auto;display:flex;flex-direction:column;gap:var(--gap-tight)">' + vivs.map(function (v) {
          var isOpen = !vivOnly && !!open[v.id], selV = dest.vivId === v.id && !dest.itemId && !dest.recv, items = cache[v.id];
          var recvRow = function (k, label) { var on = dest.vivId === v.id && dest.recv === k; return '<button type="button" class="rpick rpick--sub rpick--bold" data-cdr="' + k + '" data-cdv="' + esc(v.id) + '" aria-pressed="' + on + '"><span class="rpick__t">' + label + '</span>' + (on ? '<span aria-hidden="true" class="ricon ricon--primary">' + I.check + '</span>' : '') + '</button>'; };
          var rows = !isOpen ? '' : !items ? '<div class="rskel rskel--title"></div>' :
            (function () { var n = 0; return items.map(function (i) { var label = itemName(i) || "ללא שם", num = i.backlog ? "" : (++n); var sel = dest.itemId === i.id;
              return '<button type="button" class="rpick rpick--sub" data-cdi="' + esc(i.id) + '" data-cdv="' + esc(v.id) + '" aria-pressed="' + sel + '"><span class="rpick__n">' + num + '</span><span class="rpick__t">' + esc(label) + '</span>' + (sel ? '<span aria-hidden="true" class="ricon ricon--primary">' + I.check + '</span>' : '') + '</button>'; }).join(""); })();
          if (isOpen) rows = recvRow("start", "מוסיקת התחלה") + rows + recvRow("end", "מוסיקת סיום");
          return '<button type="button" class="rpick rpick--bold" data-cdh="' + esc(v.id) + '" aria-expanded="' + isOpen + '" aria-pressed="' + selV + '"><span class="rpick__t">' + esc(v.title || "ויוונסיה חדשה") + '</span>' + (selV ? '<span aria-hidden="true" class="ricon ricon--primary">' + I.check + '</span>' : '') + '<span aria-hidden="true" class="ricon ricon--muted">' + (vivOnly ? '' : isOpen ? I.up : I.down) + '</span></button>' + rows;
        }).join("") + '</div></div>';
    }
    function foot() { return '<button class="rbtn rbtn--block" type="button" id="cdadd"' + (dest.vivId ? '' : ' disabled') + '>הוספה</button>'; }
    function draw(keep) {
      var ttl = vivOnly ? "הוספת תרגיל" : "הוספת מוזיקה", root;
      if (side) {
        if (!pane) { window.__showLeft(head(ttl, "", true) + '<div data-cdpane style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column"></div>', function (r) { on(r, "back", closeLeft); pane = r.querySelector("[data-cdpane]"); }); pane.addEventListener("click", onClick); }
        root = pane;
      } else root = dlg;
      var sc = keep ? (root.querySelector("#cdbox") || {}).scrollTop : 0;
      if (side) pane.innerHTML = body().replace('<div class="pad" style="', '<div class="pad" style="flex:1 1 auto;min-height:0;').replace("max-height:min(50vh,26rem);overflow-y:auto", "flex:1 1 auto;min-height:0;overflow-y:auto") + '<div class="pad">' + foot() + '</div>';
      else { RosterSheet.render(dlg, { kind: "confirm", title: ttl, from: "bottom", size: "s", body: body(), foot: foot() }); wire(); }
      var bx = root.querySelector("#cdbox"); if (bx && sc) bx.scrollTop = sc;
    }
    function load(vid) {
      if (cache[vid]) return;
      itemsOf(vid).then(function (r) { r = r || []; cache[vid] = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); draw(true); }, function () { cache[vid] = []; draw(true); });
    }
    function wire() {
      dlg.addEventListener("click", onClick);
    }
    function onClick(ev) {
      var h = ev.target.closest("[data-cdh]"), it = ev.target.closest("[data-cdi]"), ad = ev.target.closest("#cdadd"), rc = ev.target.closest("[data-cdr]");
      if (rc) { dest = { vivId: rc.dataset.cdv, itemId: null, recv: rc.dataset.cdr }; draw(true); return; }
      if (h) {
        var v = h.dataset.cdh;
        if (vivOnly) { dest = { vivId: v, itemId: null }; draw(true); return; }
        if (dest.vivId === v && !dest.itemId) open[v] = !open[v]; else { dest = { vivId: v, itemId: null }; open[v] = 1; }
        load(v); draw(true); return;
      }
      if (it) { dest = { vivId: it.dataset.cdv, itemId: it.dataset.cdi }; draw(true); return; }
      if (ad && dest.vivId) { var d = { vivId: dest.vivId, itemId: dest.itemId, recv: dest.recv || null, items: cache[dest.vivId] || null }; var fin = function () { if (side) closeLeft(); else { dlg.removeEventListener("click", onClick); dlg.close(); } }, pr = fn(d); if (pr && pr.then) busy(ad, pr).then(fin, fin); else fin(); }
    }
    draw(false);
    if (dest.vivId && !vivOnly) load(dest.vivId);
  }
  /* the song goes where the popup said: into an exercise (as one of its songs), or into a vivencia as an exercise with no name and that song */
  /* the song goes to the start music or to the end music of the vivencia: the song as a chip, an arrow, the place as a chip; the one the popup was opened for is marked */
  function chooseRecv(songLabel, cur, fn) {
    var dlg = destDialog();
    var sel = cur === "end" ? "end" : "start", names = { start: "מוסיקת התחלה", end: "מוסיקת סיום" };
    function draw() {
      var chipSt = 'display:inline-flex;align-items:center;gap:var(--gap);min-width:0;max-width:100%;padding:var(--gap) var(--gap);border-radius:999px;font:var(--fw-bold) var(--fs-m)/1.2 var(--font)';
      var noteSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:100%;height:100%"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';
      var arrowSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:var(--icon);height:var(--icon);flex:none;color:var(--primary)"><path d="M20 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
      var flow = '<div style="display:flex;align-items:center;gap:var(--gap);flex-wrap:wrap;padding-bottom:var(--gap)"><span style="' + chipSt + ';background:var(--surface);color:var(--text)"><span aria-hidden="true" class="ricon">' + noteSvg + '</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(songLabel) + '</span></span>' + arrowSvg + '<span style="' + chipSt + ';background:var(--primary);color:var(--on-primary)">' + esc(names[sel]) + '</span></div>';
      var row = function (k) { var on = sel === k; return '<button type="button" data-rk="' + k + '" aria-pressed="' + on + '" style="display:flex;align-items:center;gap:var(--gap);width:100%;border:0;border-radius:var(--r);padding:var(--gap) var(--gap);cursor:pointer;text-align:start;font:var(--fw-bold) var(--fs-m)/var(--lh-tight) var(--font);color:var(--text);background:' + (on ? 'var(--surface)' : 'transparent') + '"><span style="flex:1 1 auto">' + names[k] + '</span>' + (on ? '<span aria-hidden="true" class="ricon ricon--primary">' + I.check + '</span>' : '') + '</button>'; };
      RosterSheet.render(dlg, { kind: "confirm", title: "הוספת מוזיקה", from: "bottom", size: "s", body: '<div class="pad" style="display:flex;flex-direction:column;gap:var(--gap-tight)">' + flow + row("start") + row("end") + '</div>', foot: '<button class="rbtn rbtn--block" type="button" id="cradd">הוספה</button>' });
      dlg.querySelectorAll("[data-rk]").forEach(function (b) { b.addEventListener("click", function () { sel = b.dataset.rk; draw(); }); });
      dlg.querySelector("#cradd").addEventListener("click", function (ev) { confirmGo(dlg, ev.currentTarget, function () { return fn(sel); }); });
    }
    draw();
  }
  function addMusicTo(m, d, sheet) {
    var same = !!(state.viv && state.viv.id === d.vivId), v = (state.vivs || []).filter(function (x) { return x.id === d.vivId; })[0], to = (v && v.title) || "הוויוונסיה";
    if (d.recv) {   /* the start or the end music of the vivencia */
      var rmsg = d.recv === "end" ? "נוסף למוסיקת הסיום" : "נוסף למוסיקת ההתחלה";
      if (same) return addOpt(recvItem(d.recv), m).then(function () { return afterAdd(same, sheet, rmsg); }).then(null, fail);
      return api("/rest/v1/vivencia_reception_music?on_conflict=vivencia_id,kind,music_id", { method: "POST", prefer: "resolution=ignore-duplicates,return=minimal", json: { vivencia_id: d.vivId, kind: d.recv, music_id: m.id } }).then(function () { return afterAdd(same, sheet, rmsg); }).then(null, fail);
    }
    var itemsP = d.items ? Promise.resolve(d.items) : itemsOf(d.vivId);
    return itemsP.then(function (items) {
      items = items || [];
      if (d.itemId) {
        var it = (same && state.items && state.items.filter(function (x) { return x.id === d.itemId; })[0]) || items.filter(function (x) { return x.id === d.itemId; })[0];
        if (!it) { toast("התרגיל לא נמצא"); return; }
        return addOpt(it, m).then(function () { return afterAdd(same, sheet, "נוסף לתרגיל", it.id); });
      }
      var pos = items.reduce(function (x, i) { return Math.max(x, i.position || 0); }, 0) + 1;
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: d.vivId, position: pos, backlog: true, exercise_id: null, music_id: m.id } }).then(function () { return afterAdd(same, sheet, "נוסף ל" + to); });
    }).then(null, fail);
  }
  function afterAdd(same, sheet, msg, itemId) {
    if (sheet) closeSheets();
    var chain = same ? loadItems().then(paint) : Promise.resolve();
    return chain.then(function () {
      var im = document.getElementById("imus"), li = same && itemId && state.items && state.items.filter(function (x) { return x.id === itemId; })[0];
      if (im && li && liveItem && liveItem.id === itemId) im.innerHTML = musCards(li);
      toast(msg);
    });
  }
  function effSel(fake) {   /* nothing marked: the three most popular songs of the exercise go with it; marked: what was marked */
    if (fake.sel && fake.sel.length) return { mid: fake.music_id || fake.sel[0], all: fake.sel };
    var top = (fake.item_music_options || []).map(function (o) { return o.music; }).filter(Boolean).slice(0, 3).map(function (m) { return m.id; });
    return { mid: top[0] || null, all: top };
  }
  function addExTo(e, vivId, mid, all, sheet) {   /* a catalog exercise goes into the vivencia the popup said: the open one as usual, another one is opened after */
    if (state.viv && state.viv.id === vivId) return addEx(e, undefined, sheet, mid, all);
    var v = (state.vivs || []).filter(function (x) { return x.id === vivId; })[0];
    if (v) { if (sheet) closeSheets(); addExToViv(v, e, mid, all); }
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
  /* ---------- allowlist (admin only): the kit's popup, from the left on a computer ---------- */
  /* a user of the allow list: the name and (for the main admin) the level of permission, saved as they change; closing the popup is the end */
  function editUserPopup(u, sup, done) {
    var dlg = document.getElementById("userEditDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "userEditDlg"; document.body.appendChild(dlg); }
    var ROLES = [["member", "חבר"], ["admin", "מנהל"], ["super", "מנהל על"]], role = u.is_super ? "super" : u.is_admin ? "admin" : "member";
    RosterSheet.render(dlg, { title: "שינוי שם", from: "bottom", size: "s", body: '<div class="pad"><label class="rfield"><span>שם</span><input id="ue-n" placeholder=" " value="' + esc(u.note || "") + '"></label>' +
      '</div>' });
    var n = dlg.querySelector("#ue-n"), r = null, changed = false;
    n.addEventListener("change", function () { api("/rest/v1/allowed?email=eq." + encodeURIComponent(u.email), { method: "PATCH", json: { note: n.value.trim() } }).then(function () { u.note = n.value.trim(); changed = true; toast("נשמר"); }, fail); });
    if (r) r.addEventListener("change", function () { api("/rest/v1/rpc/set_member_role", { method: "POST", json: { target: u.email, new_role: r.value } }).then(function () { changed = true; toast("נשמר"); }, function () { toast("אי אפשר לשנות: חייב להישאר לפחות מנהל על אחד"); r.value = role; }); });
    dlg.addEventListener("close", function () { if (changed && done) done(); }, { once: true });
  }
  function confirmRemoveUser(email, run) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm", title: "הסרת משתמש", from: "bottom", size: "s", body: '<div class="pad"><span dir="auto">להסיר את ' + esc(email) + ' מהרשימה?</span></div>', foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cru">הסרה</button>' });
    dlg.querySelector("#cru").addEventListener("click", function () { dlg.close(); run(); });
  }
  function allowPopup() {
    var dlg = document.getElementById("allowDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "allowDlg"; document.body.appendChild(dlg); }
    var rows = [], ready = false;   /* ready: the list has arrived (until then the skeleton stays) */
    if (wide()) { var a0 = pd.getBoundingClientRect(), set = function (k, v) { dlg.style.setProperty(k, v, "important"); };
      set("position", "fixed"); set("margin", "0"); set("inset", "auto"); set("left", a0.left + "px"); set("top", a0.top + "px"); set("width", a0.width + "px"); set("height", a0.height + "px"); set("max-width", "none"); set("max-height", "none"); set("transform", "none"); set("border-radius", "0"); }
    RosterSheet.render(dlg, {
      title: "ניהול משתמשים", from: "bottom",
      body: '<div class="rfields"><div class="rfields"><div class="rfields__row">' +
        '<label class="rfield rfield--ltr"><span>אימייל של חשבון גוגל</span><input id="em" type="email" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield"><span>שם (לא חובה)</span><input id="en" placeholder=" " autocomplete="off"></label></div>' +
        '<button class="rbtn" id="addm" type="button">הוספה</button></div><div id="alist"><div class="rskel rskel--title"></div></div></div>'
    });
    function paintA() {
      if (!ready) return;
      var qe = fold(dlg.querySelector("#em").value.trim()), qn = fold(dlg.querySelector("#en").value.trim()), l = dlg.querySelector("#alist");   /* both fields filter the list as they are typed: the email by the email, the name by the name */
      var vis = rows.filter(function (a) { return (!qe || fz(a.email, qe)) && (!qn || fz(a.note || "", qn)); });
      var sup = !!(state.me && state.me.super), roleOf = function (a) { return a.is_super ? "super" : a.is_admin ? "admin" : "member"; };
      var ROLES = [["member", "חבר"], ["admin", "מנהל"], ["super", "מנהל על"]];
      l.innerHTML = vis.length ? '<div class="rgrid">' + vis.map(function (a) {
        var r = roleOf(a), label = ROLES.filter(function (x) { return x[0] === r; })[0][1];
        var chip = sup ? '<button type="button" class="rchip rchip--info rchip--s" data-chiprole="' + esc(a.email) + '" aria-haspopup="menu">' + label + '</button>' : r !== "member" ? '<span class="rchip rchip--info rchip--s">' + label + '</span>' : '';
        return cardSlots({ attrs: 'data-ucard="' + esc(a.email) + '" role="button" tabindex="0"', title: a.email, sub: a.note || "", chip: chip });
      }).join("") + '</div>' : '<div class="rempty"><b>' + (rows.length ? "לא נמצא" : "הרשימה ריקה") + '</b></div>';
      var byMail = function (e) { return rows.filter(function (x) { return x.email === e; })[0]; };
      l.querySelectorAll("[data-chiprole]").forEach(function (b) { b.addEventListener("click", function (e) {
        e.stopPropagation(); var u = byMail(b.dataset.chiprole); if (!u) return;
        menu(b, ROLES.map(function (x) { return { label: x[1], check: roleOf(u) === x[0], fn: function () {
          if (roleOf(u) === x[0]) return;
          api("/rest/v1/rpc/set_member_role", { method: "POST", json: { target: u.email, new_role: x[0] } }).then(function () { toast("נשמר"); load(); }, function () { toast("אי אפשר לשנות: חייב להישאר לפחות מנהל על אחד"); });
        } }; }), { fit: true });
      }); });
      l.querySelectorAll("[data-ucard]").forEach(function (c) {
        function open() {
          var u = byMail(c.dataset.ucard); if (!u) return;
          var items = [{ label: "שינוי שם", icon: I.pen, fn: function () { editUserPopup(u, sup, function () { load(); }); } }];
          if (!(u.is_admin && !sup)) items.push({ label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmRemoveUser(u.email, function () { return api("/rest/v1/allowed?email=eq." + encodeURIComponent(u.email), { method: "DELETE" }).then(load, fail); }); } });
          menu(c, items, { fit: true });
        }
        c.addEventListener("click", open); c.addEventListener("keydown", function (e) { if (e.target === c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } });
      });
    }
    function load() { return api("/rest/v1/allowed?select=email,is_admin,is_super,note&order=added_at").then(function (r) { rows = r || []; ready = true; paintA(); }, function (er) { if (!ready) dlg.querySelector("#alist").innerHTML = ph("לא הצלחנו לטעון", "בדקו את החיבור ונסו שוב."); fail(er); }); }
    dlg.querySelector("#em").addEventListener("input", paintA); dlg.querySelector("#en").addEventListener("input", paintA);
    dlg.querySelector("#addm").addEventListener("click", function () {
      var em = dlg.querySelector("#em").value.trim().toLowerCase(), nm = dlg.querySelector("#en").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("אימייל לא תקין");
      busy(dlg.querySelector("#addm"), api("/rest/v1/allowed", { method: "POST", prefer: "return=minimal", json: { email: em, note: nm } })).then(function () { dlg.querySelector("#em").value = ""; dlg.querySelector("#en").value = ""; return load(); }, fail);
    });
    load();
  }

  /* ---------- live: what somebody else changes in a vivencia you both have open appears here, like a shared document ----------
     Supabase Realtime over a plain WebSocket (no SDK, as in roster's admin): a change in one of the five vivencia tables reaches everyone who may read
     the row. The page reloads what it shows: the list of vivencias, the exercises of the open vivencia, and the fields of the open exercise (written in
     place, never over a field I am in the middle of changing). A save of my own comes back too and changes nothing, because nothing differs. */
  var rt = { ws: null, hb: 0, tk: 0, retry: 1000, timer: 0, v: false, i: false, on: false };
  var RT_TABLES = ["vivencias", "vivencia_items", "vivencia_owners", "vivencia_shares", "vivencia_item_facilitators", "vivencia_opening"];
  function rtSend(o) { if (rt.ws && rt.ws.readyState === 1) rt.ws.send(JSON.stringify(o)); }
  function rtChange(table) {
    if (table === "vivencia_opening") { rt.o = true; clearTimeout(rt.timer); rt.timer = setTimeout(rtFlush, 150); return; }
    if (table === "vivencia_items" || table === "vivencia_item_facilitators") rt.i = true; else rt.v = true;
    if (table === "vivencia_shares" || table === "vivencia_owners") rt.i = true;   /* who may do what: the exercises screen redraws with the role */
    clearTimeout(rt.timer); rt.timer = setTimeout(rtFlush, 300);
  }
  function rtFlush() {
    var v = rt.v, i = rt.i, o = rt.o; rt.v = rt.i = rt.o = false;
    if (o && state.viv) api("/rest/v1/vivencia_opening?vivencia_id=eq." + state.viv.id + "&select=who,body,position&order=position.asc").then(applyOpening, function () { /* the next change will try again */ });
    if (v) loadVivs().then(function () {
      if (state.viv) {
        var cur = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === state.viv.id; })[0];
        if (cur) state.viv.is_public = cur.is_public;
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
      if (m.event === "phx_reply" && m.topic === TOPIC && m.ref === "1") { rt.on = !!(m.payload && m.payload.status === "ok"); if (rt.on) { rt.v = rt.i = rt.o = true; rtFlush(); cur.id = ""; if (cur.want) curJoin(cur.want); } }   /* what was missed while the connection was closed, and the cursors' channel again */
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
  function inOpening(el) { return !!(el && el.dataset && el.dataset.owho != null && el.closest && el.closest("[data-opening]")); }
  function curMine() {   /* my place, to everyone else */
    var el0 = document.activeElement;
    if (inOpening(el0)) return curSend({ item: "open", email: FLOA_AUTH.email().toLowerCase(), field: "o:" + el0.dataset.owho, a: rtSel(el0).a, b: rtSel(el0).b });
    if (!liveItem || !liveItem.fld) return curSend({ item: "open", email: FLOA_AUTH.email().toLowerCase(), field: null });
    var el = document.activeElement, k = Object.keys(liveItem.fld).filter(function (x) { return liveItem.fld[x] === el; })[0];
    if (!k || k === "title") return curSend({ item: liveItem.id, email: FLOA_AUTH.email().toLowerCase(), field: null });
    curSend({ item: liveItem.id, email: FLOA_AUTH.email().toLowerCase(), field: k, a: rtSel(el).a, b: rtSel(el).b });
  }
  function curThrottled() { var d = Date.now() - cur.last; clearTimeout(cur.trail); if (d >= 120) { cur.last = Date.now(); curMine(); } else cur.trail = setTimeout(function () { cur.last = Date.now(); curMine(); }, 120 - d); }
  function paintGhosts() {
    document.querySelectorAll(".bio-ghost").forEach(function (g) { g.dataset.keep = ""; });
    var now = Date.now();
    function one(email, pr, ta, field) {
      var host = ta.parentElement, id = "g-" + email + "-" + field, g = host.querySelector('[data-gid="' + id + '"]');
      if (!g) { g = document.createElement("div"); g.className = "bio-ghost"; g.dataset.gid = id; g.innerHTML = "<div></div>"; host.appendChild(g); }
      g.dataset.keep = "1";
      var cs = getComputedStyle(ta), inner = g.firstChild, hue = whoHue(email), len = rtWalk(ta, false).length, a = Math.min(pr.a, len), b = Math.min(pr.b, len);
      inner.style.cssText = "position:absolute;top:0;left:0;white-space:pre-wrap;overflow-wrap:anywhere;color:transparent;box-sizing:border-box;width:" + ta.clientWidth + "px;font:" + cs.font + ";letter-spacing:" + cs.letterSpacing + ";padding:" + cs.padding + ";direction:" + cs.direction + ";text-align:" + cs.textAlign + ";transform:translateY(" + (-ta.scrollTop) + "px)";
      inner.innerHTML = ta.innerHTML;
      var caret = document.createElement("span"); caret.className = "bio-caret"; caret.style.setProperty("--c", "hsl(" + hue + " 62% 38%)"); caret.innerHTML = "<i>" + esc(pr.name) + "</i>";
      if (a !== b) { try { var p1 = rtPoint(inner, a), p2 = rtPoint(inner, b), rg = document.createRange(); rg.setStart(p1[0], p1[1]); rg.setEnd(p2[0], p2[1]); var mk = document.createElement("mark"); mk.style.background = "hsl(" + hue + " 70% 78% / .75)"; rg.surroundContents(mk); } catch (x) { /* across several tags: the caret alone */ } }
      var pc = rtPoint(inner, b), rc = document.createRange(); rc.setStart(pc[0], pc[1]); rc.collapse(true); rc.insertNode(caret);
    }
    Object.keys(cur.peers).forEach(function (email) {
      var pr = cur.peers[email];
      if (now - pr.at > 6000) { delete cur.peers[email]; return; }
      if (!pr.field) return;
      if (pr.item === "open") {   /* the opening of the evening: the box of that leader */
        var who = String(pr.field).slice(2), box = [].slice.call(document.querySelectorAll("[data-opening] [data-owho]")).filter(function (x) { return x.dataset.owho === who; })[0];
        if (box && box.offsetParent) one(email, pr, box, pr.field);
        return;
      }
      if (liveItem && liveItem.fld && liveItem.root.isConnected && pr.item === liveItem.id && liveItem.fld[pr.field]) one(email, pr, liveItem.fld[pr.field], pr.field);
    });
    document.querySelectorAll(".bio-ghost").forEach(function (g) { if (!g.dataset.keep) g.remove(); });
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-ghost { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2 } .bio-ghost mark { color: transparent; border-radius: 2px } .bio-caret { display: inline-block; width: 0; height: 1.1em; vertical-align: text-bottom; border-inline-start: 2px solid var(--c); position: relative } .bio-caret > i { position: absolute; bottom: 100%; inset-inline-start: calc(var(--gap-tight) / -2); padding: 0 var(--gap-tight); border-radius: 4px 4px 4px 0; background: var(--c); color: var(--on-primary); font: var(--fw-bold) var(--fs-s)/16px var(--font); font-style: normal; white-space: nowrap }";
    document.head.appendChild(st);
    setInterval(paintGhosts, 1500);   /* a marker that was not renewed goes */
    function inMyField() { var el = document.activeElement; if (inOpening(el)) return true; return !!(liveItem && liveItem.fld && liveItem.root.isConnected && el && el.classList.contains("rf-rich") && ["poetics", "guidance", "notes"].some(function (k) { return liveItem.fld[k] === el; })); }
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
    function tok(v) { var d = document.createElement("div"); d.style.cssText = "position:absolute;visibility:hidden;width:" + v; document.body.appendChild(d); var w = d.getBoundingClientRect().width; d.remove(); return w; }
    /* both panes stay usable from the breakpoint up: the list is never narrower than a popup less two controls, and never wider than half the window, so the exercise is never narrower than the list */
    function clampW(w) { var lo = tok("var(--pane-min)"), hi = Math.max(lo, window.innerWidth / 2); return Math.round(Math.max(lo, Math.min(w, hi))); }
    function curW() { return pl.getBoundingClientRect().width; }
    function setW(w) { root.style.setProperty("--listw", clampW(w) + "px"); }
    function save() { try { localStorage.setItem(KEY, String(Math.round(curW()))); } catch (e) { /* not kept */ } }
    var saved = null; try { saved = Number(localStorage.getItem(KEY)) || null; } catch (e) { /* none */ }
    if (saved) setW(saved);
    window.addEventListener("resize", function () { var w = parseFloat(root.style.getPropertyValue("--listw")); if (w) setW(w); });
    function wire(h) {
    var drag = false;
    h.addEventListener("pointerdown", function (e) { if (!wide() || e.button > 0) return; drag = true; h.setPointerCapture(e.pointerId); root.classList.add("split-drag"); e.preventDefault(); });
    h.addEventListener("pointermove", function (e) { if (drag) setW(window.innerWidth - e.clientX); });
    function end() { if (!drag) return; drag = false; root.classList.remove("split-drag"); save(); }
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
    h.addEventListener("dblclick", function () { root.style.removeProperty("--listw"); try { localStorage.removeItem(KEY); } catch (e) { /* none */ } });
    h.addEventListener("keydown", function (e) { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); setW(curW() + (e.key === "ArrowLeft" ? 24 : -24)); save(); });
    }
    window.__bioSplitWire = wire; if (h) wire(h);
  })();
  /* back and forward: show what the address says, without writing it again */
  window.addEventListener("popstate", function () {
    if (jump) {   /* our own history.go(): no screen change unless we asked for one */
      var j = jump; jump = null;
      if (!j.render) { if (j.then) j.then(); return; }
      var nd = document.getElementById("itemDlg");
      if (nd && nd.open && nd.__openedAt > j.at) { if (j.then) j.then(); return; }   /* a tap opened an exercise while the earlier close was still walking history back: that exercise stays, only its address is written */
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
      var sig0 = JSON.stringify(state.items || null);
      loadItems().then(function () { if (JSON.stringify(state.items || null) === sig0) return; paint(); }, fail);   /* what was changed inside is in the list; when nothing was, the list is not drawn again, so a tap that began meanwhile still lands on its card */
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
