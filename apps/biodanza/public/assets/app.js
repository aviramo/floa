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
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.500s-7.500-4.600-9.500-9.200A5.300 5.300 0 0 1 12 6.200a5.300 5.300 0 0 1 9.500 5.100c-2 4.600-9.500 9.200-9.500 9.200z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
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
      '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-upl="' + esc(m.id) + '" aria-label="העלאת קובץ" title="העלאת קובץ שיחליף את היוטיוב" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:var(--text-3);font:var(--fw-bold) var(--fs-xs)/1 var(--font)">' + I.up + '</button>' + ytLink(m, trail) + '</span>';
  }
  var songReg = {};
  var UPL_FORMATS = { mp3: 1, flac: 1, wav: 1, aiff: 1, aif: 1, m4a: 1 };
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-upl]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (b.dataset.busy) return;
    var id = b.dataset.upl, inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
    var say = function (t, ms) { b.innerHTML = '<span>' + esc(t) + '</span>'; if (ms) setTimeout(function () { if (b.isConnected) { b.innerHTML = I.up; } }, ms); };
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
    if (d.name && d.d > 0 && durKnown[d.name] !== Math.round(d.d)) { durKnown[d.name] = Math.round(d.d); try { localStorage.setItem("biodanza.dur", JSON.stringify(durKnown)); } catch (x) { /* not kept */ } }
    document.querySelectorAll(".bio-time").forEach(function (sp) {
      var full = +sp.dataset.dur || durKnown[sp.dataset.for] || 0, left = full;
      if (d.name && sp.dataset.for === d.name) left = Math.max(0, Math.ceil((full || Math.round(d.d || 0)) - d.t));
      var txt = left ? clock(left) : ""; if (sp.textContent !== txt) sp.textContent = txt;
    });
  });
  /* the song's bar: ONE element everywhere. A song with a file keeps its room for it, the bar shows while that song plays, follows it, and a drag moves the song. */
  function songBar(m, extra, always) {
    if (!m || !m.audio_object) return "";
    return '<div class="bio-bar" data-for="' + esc(m.audio_object) + '"' + (always ? ' data-always="1"' : '') + ' style="' + (always ? '' : 'visibility:hidden;') + (extra || "flex:0 0 100%;order:3;padding-top:var(--sp-1)") + ';position:relative;z-index:var(--z-raised)"><input type="range" min="0" max="1000" value="0" step="1" aria-label="מקום בשיר" style="display:block;width:100%;margin:0;direction:ltr;accent-color:var(--primary)"></div>';
  }
  /* a song's length: the catalog's, else what its own file told the player the first time (kept in this browser) */
  var durKnown = {};
  try { durKnown = JSON.parse(localStorage.getItem("biodanza.dur") || "{}") || {}; } catch (x) { durKnown = {}; }
  function durOf(m) { return (m && (m.duration_sec || durKnown[m.audio_object])) || 0; }
  /* the player: ONE pill at the bottom right, always there once signed in. Play/pause, the time left and the song's bar are one thing; with no song loaded it says so. It lives in the top layer and is never hidden: a popup that opens is put under it. */
  (function () {
    var st = document.createElement("style");
    st.textContent = ":root { --dockfull: calc(var(--fab) + var(--gap-button) * 2 + var(--inset-b)); --dockh: var(--inset-b) } html.bio-docked { --dockh: var(--dockfull) } html.bio-docked body { box-sizing: border-box; padding-bottom: var(--dockh) } html.bio-docked .rfab:not(.rfab--in) { bottom: calc(var(--gutter) + var(--dockh)) } html.bio-docked .rmsg--toast { bottom: calc(var(--gutter) + var(--dockh)) !important } " +
      ".bio-dock { position: fixed; inset: auto 0 0 0; margin: 0; width: auto; max-width: none; box-sizing: border-box; min-height: calc(var(--fab) + var(--gap-button) * 2 + var(--inset-b)); display: flex; align-items: center; gap: var(--gap-button); padding: var(--gap-button) var(--gutter) calc(var(--gap-button) + var(--inset-b)); overflow: visible; color: var(--text); background: var(--surface-2); border: 0; border-top: 1px solid var(--line); border-radius: 0; box-shadow: 0 -4px 14px -4px rgba(63, 47, 20, .16); z-index: var(--z-sticky); } " +   /* a square footer across the bottom: the page ends above it, the add button and the toasts sit above it */
      "@media (min-width: 1024px) { .rfab[data-act=\"swap\"] { left: auto !important; right: calc(var(--listw) + var(--gutter)) !important; bottom: calc(var(--gutter) + var(--dockh)) !important } } html.bio-docked dialog:not(:has(.sheet-foot)) .sheet-body { padding-bottom: calc(var(--dockfull) + var(--gutter)) } .bio-dock:not(.on), .bio-dock.closed { display: none } .bio-dock.away { opacity: 0; pointer-events: none } " +
      ".bio-dock__btn { flex: none; display: grid; place-items: center; width: var(--fab); height: var(--fab); padding: 0; border: 0; border-radius: var(--r-fab); background: var(--danger); color: var(--on-primary); cursor: pointer } " +
      ".bio-dock__btn[data-st=\"paused\"] { background: var(--surface-2); color: var(--text) } .bio-dock__btn:disabled { background: var(--surface-2); color: var(--text-3); cursor: default } " +
      ".bio-bar input, .bio-dock__bar { -webkit-appearance: none; appearance: none; background: transparent; height: 20px; margin: 0; cursor: pointer; --p: 0%; --c: var(--primary) } .bio-bar input:hover, .bio-dock__bar:hover { --c: var(--danger) } .bio-bar input::-webkit-slider-runnable-track, .bio-dock__bar::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--c) var(--p), var(--surface-2) var(--p)) } .bio-bar input::-webkit-slider-thumb, .bio-dock__bar::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border: 0; border-radius: 50%; background: var(--c) } .bio-bar input::-moz-range-track, .bio-dock__bar::-moz-range-track { height: 4px; border-radius: 2px; background: var(--surface-2) } .bio-bar input::-moz-range-progress, .bio-dock__bar::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--c) } .bio-bar input::-moz-range-thumb, .bio-dock__bar::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--c) } .bio-bar input:focus, .bio-bar input:focus-visible, .bio-dock__bar:focus, .bio-dock__bar:focus-visible, .bio-dock__btn:focus, .bio-dock__btn:focus-visible, .bio-dock__x:focus, .bio-dock__x:focus-visible { outline: none } .bio-dock .bio-vol { margin: 0 } @media (max-width: 1023px) { .bio-dock .bio-vol, .bio-dock .bio-volume { display: none !important } } .bio-volume { flex: none; display: flex; align-items: center; gap: var(--gap-tight); --c: var(--primary) } .bio-volume input { -webkit-appearance: none; appearance: none; background: transparent; width: 7rem; height: 20px; margin: 0; cursor: pointer; direction: ltr; --p: 0% } .bio-volume { direction: ltr; margin-left: var(--sp-3) } .bio-volume input::-webkit-slider-runnable-track { height: 4px; border-radius: 2px; background: linear-gradient(to right, var(--c) var(--p), var(--on-primary) var(--p)) } .bio-volume input::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; margin-top: -6px; border: 0; border-radius: 50%; background: var(--c) } .bio-volume input::-moz-range-track { height: 4px; border-radius: 2px; background: var(--on-primary) } .bio-volume input::-moz-range-progress { height: 4px; border-radius: 2px; background: var(--c) } .bio-volume input::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--c) } .bio-volume input:focus, .bio-volume input:focus-visible { outline: none } .bio-volume > .rbtn > svg { width: var(--icon-m); height: var(--icon-m) } .bio-dock__x { flex: none; display: grid; place-items: center; width: var(--icon-m, 20px); height: var(--ctl); padding: 0; border: 0; border-radius: var(--r-ctl); background: transparent; color: var(--text-2); cursor: pointer } .bio-dock__x > svg { width: var(--icon-m, 20px); height: var(--icon-m, 20px); stroke-width: var(--icon-w) } .bio-dock.idle .bio-dock__x { display: none } " +
      ".bio-dock .rbtn > svg { width: var(--icon-l); height: var(--icon-l) } [data-opt] [data-audio] svg, [data-am] [data-audio] svg { width: var(--icon-s) !important; height: var(--icon-s) !important } .bio-dock > .rbtn:first-child:not(:disabled) { background: var(--primary); border-color: var(--primary); color: var(--on-primary) } " +
      ".bio-dock .bio-dockbar { flex: 1 1 8rem; min-width: 0; padding: 0; touch-action: none } .bio-dock .bio-dockbar .bio-dock__bar { width: 100%; display: block; direction: ltr } .bio-dock .bio-dockbar input::-webkit-slider-runnable-track { background: linear-gradient(to right, var(--c) var(--p), var(--on-primary) var(--p)) } .bio-dock .bio-dockbar input::-moz-range-track { background: var(--on-primary) } " +
      ".bio-dock__name { flex: 0 1 28rem; min-width: 8rem; direction: ltr; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .bio-dock__name span { color: var(--text-2) } .bio-dock__name span:not(:empty)::before { content: \"· \" } " +
      "@media (max-width: 700px) { .bio-dock { flex-wrap: wrap } .bio-dock__name { flex: 1 1 100%; order: 4 } .bio-dock .bio-dockbar { flex: 0 0 100%; order: 3 } } " +
      ".bio-dock__time { flex: none; min-width: 2.6em; text-align: center; font: var(--fw-bold) var(--fs-xs)/1 var(--font); font-variant-numeric: tabular-nums } " +
      ".bio-dock__bar { flex: 1 1 0; width: auto; max-width: none; min-width: 0; display: block; margin: 0; padding: 0; direction: ltr; accent-color: var(--primary); touch-action: none } " +
      ".bio-dock__none { flex: 1 1 auto; min-width: 0; text-align: center; color: var(--text-2); font: var(--fw-regular) var(--fs-xs)/1.2 var(--font) } " +
      ".bio-dock:not(.idle) .bio-dock__none, .bio-dock.idle .bio-dock__bar, .bio-dock.idle .bio-dock__time { display: none } " +
      "";
    document.head.appendChild(st);
    var PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
    var PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';
    var playing = false, loaded = false, closed = false, seekDrag = false, leftNow = 0, frac = 0, curT = 0, curD = 0, curTitle = "", curArtist = "", lastH = 0, last = null, curName = "", asked = {};
    try { last = JSON.parse(localStorage.getItem("biodanza.last") || "null"); if (last && !last.n) last = null; } catch (x) { last = null; }   /* the song that played last: the footer keeps it, also after a reload */
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
    function openHistory() {
      var local = function () { try { return JSON.parse(localStorage.getItem("biodanza.history") || "[]") || []; } catch (x) { return []; } };
      var fromDb = api("/rest/v1/listen_history?select=audio_object,title,artist,played_at&order=played_at.desc&limit=120").then(function (rows) {
        return (rows || []).map(function (r) { return { n: r.audio_object, t: r.title, a: r.artist, at: Date.parse(r.played_at) }; });
      });
      var waited = new Promise(function (res) { setTimeout(function () { res(null); }, 2500); });
      Promise.race([fromDb, waited]).then(function (rows) { renderHistory(rows || local()); }, function () { renderHistory(local()); });
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
      var cards = rows.map(function (e, i) {
        return '<div class="rcard rcard--compact" data-hi="' + i + '" role="button" tabindex="0" style="cursor:pointer;background:var(--on-primary);margin:0;min-width:0;display:flex;flex-direction:column;gap:2px">' +
          '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;font:var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(e.t || "שיר") + '</span>' +
          '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/var(--lh-tight) var(--font)">' + (e.a ? esc(e.a) : "&nbsp;") + '</span>' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:var(--gap-tight)"><button type="button" class="rbtn rbtn--icon" data-hp="' + i + '" aria-label="השמעה" title="השמעה" style="background:var(--surface-2);border-color:var(--surface-2);width:46px;min-height:var(--tag-s);height:var(--tag-s);padding:0;border-radius:999px">' + PLAY + '</button>' +
          '<span style="color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + esc(when(e.at)) + '</span></div></div>';
      }).join("");
      RosterSheet.render(dlg, { title: "היסטוריית האזנה", from: "bottom", size: "l",
        body: '<div style="padding:var(--sp-2) var(--gutter) var(--gutter)">' + (rows.length ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(21rem,1fr));gap:var(--sp-1);align-items:stretch">' + cards + '</div>' : ph("אין עדיין היסטוריה", "שירים שהתחילו להתנגן יופיעו כאן")) + '</div>' });
      dlg.onclick = function (ev) {
        var c = ev.target.closest && ev.target.closest("[data-hi]"); if (!c) return;
        var e = rows[+c.dataset.hi]; if (!e) return;
        slideClose(dlg); playName(e.n, e.t, e.a);
      };
    }
    document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-hist]"); if (b) openHistory(); });
    setTimeout(histImport, 3000);
    function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    function make(cls) {
      var d = document.createElement("div"); d.className = cls + " idle";
      d.innerHTML = '<button type="button" class="rbtn rbtn--icon" disabled aria-label="השמעה">' + PLAY + '</button><span class="rchip rchip--s bio-dock__time" style="direction:ltr;font-variant-numeric:tabular-nums">0:00 / 0:00</span>' + volDock() +
        '<div class="bio-dockbar"><input class="bio-dock__bar" type="range" min="0" max="1000" value="0" step="1" aria-label="מקום בשיר" disabled></div><div class="rrow__main bio-dock__name"><b>לא נבחר שיר</b> <span></span></div><button type="button" class="rbtn rbtn--icon" data-hist aria-label="היסטוריית האזנה" title="היסטוריית האזנה">' + HIST + '</button>';
      d.querySelector("button").addEventListener("click", function () {
        if (loaded) { if (window.BioAudio && BioAudio.playPause) BioAudio.playPause(); return; }
        if (!last) return;   /* nothing loaded: the last song is loaded and played, as its own button does */
        var tb = document.createElement("button"); tb.dataset.audio = last.n; tb.style.display = "none"; document.body.appendChild(tb); tb.click(); tb.remove();
      });
      var r = d.querySelector(".bio-dock__bar");
      r.addEventListener("pointerdown", function () { seekDrag = true; });
      ["pointerup", "pointercancel", "change"].forEach(function (n) { r.addEventListener(n, function () { seekDrag = false; }); });
      r.addEventListener("input", function () { if (window.BioAudio && BioAudio.seek) BioAudio.seek(r.value / 1000); });
      return d;
    }
    var dock = make("bio-dock"); dock.setAttribute("popover", "manual"); document.body.appendChild(dock);
    function top() {   /* while a popup is open the page behind it is inert, the pill with it: it moves INTO the topmost open popup (as a popover, so it is drawn over it) and back to the page when none is open */
      var dl = document.querySelectorAll("dialog[open]"), target = dl.length ? dl[dl.length - 1] : document.body;
      try { dock.hidePopover(); } catch (x) { /* not shown yet */ }
      dock.classList.toggle("away", !!document.querySelector("dialog[open] .sheet-foot"));
      if (dock.parentNode !== target) target.appendChild(dock);
      try { dock.showPopover(); } catch (x) { /* an old browser: the pill is an ordinary fixed element */ }
    }
    top();
    function sync() {
      var on = !!(window.FLOA_AUTH && FLOA_AUTH.signedIn());
      [dock].forEach(function (d) {
        d.classList.toggle("on", on); d.classList.toggle("away", !!document.querySelector("dialog[open] .sheet-foot"));   /* a popup with its own action button at the bottom (a name, a confirmation) is not covered: the pill slides away while it is open */
        d.classList.toggle("idle", !loaded);
        document.documentElement.classList.toggle("bio-docked", on);   /* the page ends above the footer */
        var b = d.querySelector("button"), t = d.querySelector(".bio-dock__time"), r = d.querySelector(".bio-dock__bar"), s = clk(curT) + " / " + clk(loaded ? curD : (last ? last.d : 0)), nm = d.querySelector(".bio-dock__name");
        b.disabled = !loaded && !last; r.disabled = !loaded || !(curD > 0); b.dataset.st = playing ? "playing" : "paused";
        var lab = playing ? "השהיית השיר" : "השמעה"; if (b.getAttribute("aria-label") !== lab) { b.setAttribute("aria-label", lab); b.title = lab; b.innerHTML = playing ? PAUSE : PLAY; }
        if (t.textContent !== s) t.textContent = s;
        var nh = '<b>' + esc(loaded ? (curTitle || "שיר") : (last ? last.t || "שיר" : "לא נבחר שיר")) + '</b> <span>' + esc(loaded ? curArtist : (last ? last.a || "" : "")) + '</span>'; if (nm.dataset.h !== nh) { nm.dataset.h = nh; nm.innerHTML = nh; }
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
            if (curName === nm0) { curTitle = songInfo[nm0].t; curArtist = songInfo[nm0].a; last = { n: nm0, t: curTitle, a: curArtist, d: curD > 0 ? Math.floor(curD) : 0 }; try { localStorage.setItem("biodanza.last", JSON.stringify(last)); } catch (x2) { /* not kept */ } sync(); }
          }, function () { /* the title stays the plain word */ });
        }
      }
      if (started) remember(dd.name, curTitle, curArtist);
      if (loaded && curTitle && (!last || last.n !== dd.name || last.t !== curTitle || last.a !== curArtist || (dd.d > 0 && last.d !== Math.floor(dd.d)))) { last = { n: dd.name, t: curTitle, a: curArtist, d: dd.d > 0 ? Math.floor(dd.d) : (last && last.n === dd.name ? last.d : 0) }; try { localStorage.setItem("biodanza.last", JSON.stringify(last)); } catch (x) { /* not kept */ } }
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
    return '<button type="button" class="rbtn rbtn--icon rrow__trail" data-like="' + m.id + '" aria-pressed="' + on + '" aria-label="' + (on ? "הסרה מהשירים שאהבתי" : "שיר שאהבתי") + '" title="' + (on ? "הסרה מהשירים שאהבתי" : "שיר שאהבתי") + '" style="flex:none;width:var(--ctl);height:var(--ctl);min-height:var(--ctl);color:' + (on ? "var(--danger)" : "var(--text-3)") + '">' + (on ? I.heart.replace('fill="none"', 'fill="currentColor"') : I.heart) + '</button>';
  }
  function paintHearts(id) {
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) {
      var on = !!likes[id]; b.setAttribute("aria-pressed", on); b.style.color = on ? "var(--danger)" : "var(--text-3)";
      b.title = b.ariaLabel = on ? "הסרה מהשירים שאהבתי" : "שיר שאהבתי"; b.setAttribute("aria-label", b.title);
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
    (was ? api("/rest/v1/exercise_likes?exercise_id=eq." + id, { method: "DELETE" })
         : api("/rest/v1/exercise_likes", { method: "POST", json: { exercise_id: id }, prefer: "resolution=ignore-duplicates,return=minimal" })).catch(function () {
      if (was) likesEx[id] = true; else delete likesEx[id]; paintHeartsEx(id); toast("אי אפשר לשמור עכשיו");
    });
  }, true);
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
    return '<div class="rrow rrow--link" style="padding-inline:var(--gutter);padding-block:var(--sp-2);flex-wrap:wrap"' + (cur ? ' aria-current="true"' : '') + '>' + heartBtn(m) + '<button type="button" class="rrow__main" ' + attr + '="' + m.id + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit">' + songLines(m) + '</button>' + (extra || '') + playCol(m, true) + songBar(m) + '</div>';   /* the text takes what is left, so a long name never pushes the play tile to a line of its own */
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
  function itemHead(hasPrev, hasNext, where, exId, nameText, ro) {
    var nav = !wide() && !ro;   /* beside the list there are no previous and next buttons: the list is the way around */
    var arrow = function (act, ico, label, off) { return '<button class="rbtn rbtn--icon" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"' + (off ? " disabled" : "") + '>' + ico + '</button>'; };
    return '<header class="rhead">' + (nav ? arrow("prevW", I.back, "הקודם", !hasPrev) : "") +
      '<div class="rhead__text"><input id="ina" class="rhead__title" placeholder="ללא שם" autocomplete="off" aria-label="שם התרגיל"' + (ro ? ' readonly' : '') + ' value="' + esc(nameText || "") + '" style="width:100%;min-width:0;border:0;background:transparent;padding:0;margin:0;color:inherit;text-align:start;outline:0;text-overflow:ellipsis;text-box:trim-both cap alphabetic"></div>' +
      (exId ? heartBtnEx(exId, "bio-flat") : "") + (ro ? "" : arrow("del", I.trash, "הסרה מהוויוונסיה", false)) + (nav ? arrow("nextW", I.fwd, "הבא", !hasNext) : "") + '</header>';
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-pair > .rbtn, .bio-pair > .bio-flat { min-width: 0; padding-inline: var(--sp-1) } .bio-flat, .rhead .bio-flat, .rhead .bio-flat:hover, .rhead .bio-flat:active, .rhead .bio-flat[aria-expanded] { background: transparent; border-color: transparent } @keyframes bioNum { from { opacity: 0; transform: translateX(var(--nx, 0)) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { .bio-num { animation: none !important } } .bio-bar, .bio-bar * { touch-action: none } .bio-vol { display: none; position: relative; flex: none; place-items: center; width: var(--ctl); height: var(--ctl); border-radius: var(--r-ctl); background: var(--surface-2); overflow: hidden; touch-action: none; cursor: ns-resize; user-select: none; margin-inline-end: var(--sp-1) } .bio-vol.on { display: grid } @media (max-width: 1023px) { .bio-vol { display: none } } .bio-vol > i { position: absolute; inset: auto 0 0 0; height: calc(var(--v) * 100%); background: color-mix(in srgb, var(--primary) 32%, transparent); transition: height var(--t-fast) var(--ease) } .bio-vol > b { position: relative; font: var(--fw-bold) var(--fs-s)/1 var(--font); font-variant-numeric: tabular-nums; color: var(--text) } #pd .bio-vol { display: none !important } /* the volume button is in the list's header, once */ .bio-vol:focus { outline: none } .bio-vol:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }";
    document.head.appendChild(st);
  })();
  /* the exercise as a pager: drag the page sideways to go to the next or the previous one (to the right = the next, as in a right to left book); the page follows the finger, a short drag springs back */
  function attachPager(pg, to) {
    var x0 = 0, y0 = 0, t0 = 0, dx = 0, mode = 0;
    pg.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".bio-bar")) return;   /* a drag on the song's bar moves the song, never the page */
      if (e.pointerType !== "touch" && (e.button > 0 || (e.target.closest && e.target.closest("input, textarea, select, a, button, .rf-rich")))) return;   /* a finger anywhere; a mouse (a narrow window) only off the fields and buttons */
      x0 = e.clientX; y0 = e.clientY; t0 = performance.now(); dx = 0; mode = 1; });
    pg.addEventListener("pointermove", function (e) {
      if (mode === 0 || mode === 3) return;
      var mx = e.clientX - x0, my = e.clientY - y0;
      if (mode === 1) {
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { mode = 2; try { pg.setPointerCapture(e.pointerId); } catch (x) { /* none */ } pg.style.transition = "none"; }
        else { if (Math.abs(my) > 10) mode = 3; return; }
      }
      dx = mx;
      pg.style.transform = "translateX(" + ((dx > 0 ? to.next : to.prev) ? dx : dx * 0.3) + "px)";   /* no page that way: it only gives a little */
    });
    function end() {
      if (mode !== 2) { mode = 0; return; }
      mode = 0;
      var w = pg.getBoundingClientRect().width || 320, v = Math.abs(dx) / Math.max(1, performance.now() - t0), go = dx > 0 ? to.next : to.prev;
      if (go && (Math.abs(dx) > w * 0.22 || v > 0.5)) {
        pg.style.transition = "transform .16s ease-in"; pg.style.transform = "translateX(" + (dx > 0 ? w : -w) + "px)";
        setTimeout(go, 150);
      } else { pg.style.transition = "transform .22s cubic-bezier(.2, .8, .2, 1)"; pg.style.transform = ""; }
    }
    pg.addEventListener("pointerup", end); pg.addEventListener("pointercancel", end);
  }
  function toast(msg) { /* no black messages at the bottom, by the owner's word: what happened shows on the screen itself; the text goes to the console only */ if (window.console) console.info(msg); }
  function fail(e) { console.error(e); toast("משהו השתבש, נסו שוב"); }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  function show(html, wire, pane) { if (!wide() && pane === "d") return itemSheet(html, wire);   /* narrow: the exercise is a popup from the bottom, not a page */
    var t = wide() && pane === "d" ? pd : pl; t.innerHTML = html; if (wire) wire(t); }
  /* wide screen: the vivencia list on the right, and after choosing one its exercises take that place and the open exercise is on the left. Back from the exercises is the vivencia list again. */
  function homeWide() { state.viv = null; state.lastItem = null; emptyDetail(); home(); }
  function emptyDetail() {
    if (wide()) show(ph("בחרו ויוונסיה", "התרגילים שלה יופיעו כאן"), null, "d");
    state.viv = null; paintSel(); setUrl(BASE);
  }
  function paintSel() { pl.querySelectorAll("[data-id]").forEach(function (b) { b.closest(".rrow").setAttribute("aria-current", state.viv && b.dataset.id === state.viv.id ? "true" : "false"); }); }
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
    show(head("שירים שאהבתי", "", true) + '<div class="rlist" id="likl"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", back);
      api("/rest/v1/song_likes?select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=created_at.desc").then(function (rows) {
        var l = r.querySelector("#likl"), list = (rows || []).map(function (x) { return x.music; }).filter(Boolean);
        l.innerHTML = list.length ? list.map(function (m) { return songRow(m, false, "data-liked"); }).join("") : ph("עוד אין שירים שאהבת", "לחצו על הלב ליד שיר כדי לשמור אותו כאן");
      }, fail);
    });
  }
  function home() {
    curLeave();
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    show(head("הוויוונסיות שלי", "", false,
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="homemore" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>',
      '<img src="favicon.png" alt="" style="flex:none;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl)">') +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '<button class="rfab" data-act="new" aria-label="ויוונסיה חדשה" title="ויוונסיה חדשה">' + I.plus + '</button>', function (r) {
      on(r, "homemore", function (b) {   /* one menu: the songs I loved, who may enter (the manager), leaving */
        var items = state.offline ? [] : [{ label: "ויוונסיות שאהבתי", icon: I.heart, fn: function () { goSub(likedVivScreen); } }, { label: "תרגילים שאהבתי", icon: I.heart, fn: function () { goSub(likedExScreen); } }, { label: "שירים שאהבתי", icon: I.heart, fn: function () { goSub(likedScreen); } }];   /* in the order of the app: vivencias, exercises, songs */
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
    return Promise.all([api("/rest/v1/vivencias?select=id,title,updated_at,vivencia_items(count)"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
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
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    l.innerHTML = state.vivs.length ? state.vivs.map(function (v) {
      var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
      return '<div class="rrow rrow--link">' + heartBtnViv(v.id, "rrow__trail") + '<button type="button" class="rrow__main" data-id="' + v.id + '" style="margin-inline-start:var(--sp-1);background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub" data-n="' + v.id + '">' + n + ' תרגילים' + (v.role === "owner" ? "" : " · משותף" + (v.role === "view" ? " (צפייה)" : " (עריכה)")) + '</span></button></div>';
    }).join("") : (state.offline ? ph("אין ויוונסיות שמורות", "שמרו ויוונסיה מהתפריט שלה כשיש חיבור, והיא תהיה כאן גם בלי אינטרנט") : ph("עוד אין ויוונסיות", "לחצו על + כדי ליצור את הראשונה"));
    if (!state.vivs.length) { l.style.position = "relative"; if (l.firstElementChild) l.firstElementChild.style.marginBlock = "auto"; arrowTo(l); setTimeout(function () { arrowTo(l); }, 350); }   /* the arrow is a second child, so the words are centred by hand (the kit does it only for an only child) */
    l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); });
    if (state.vivs.length) enableDrag(l, "[data-id]", persistVivs);
    paintSel();
    if (pending && pending.viv && state.vivsLoaded) {   /* opened on a vivencia's own address; only once the list is really here (the hearts can answer first, and an empty list would throw the address away) */
      var vv = state.vivs.filter(function (x) { return x.id === pending.viv; })[0];
      var want = pending; pending = want.item ? { item: want.item } : null;   /* the address is used once: going back to the list must not open it again */
      if (vv) { openViv(vv.id); return; }
    }
    if (wide() && !state.viv) emptyDetail();
  }

  function newViv() { namePopup({ id: uuid(), title: "" }, true); }
  /* Who guides an exercise: optional, any number of people, offered only when a vivencia has more than two editors (owners and accounts shared with edit rights). */
  function facOn() { return state.members.length > 2; }
  function facName(e) { var m = state.members.filter(function (x) { return x.email === e; })[0]; return m && m.note ? m.note : e.split("@")[0]; }
  function facEmails(it) { return (it.vivencia_item_facilitators || []).map(function (x) { return x.email; }); }
  function facLabel(it) {
    var es = facEmails(it);
    return !es.length ? "מנחה" : es.length === 1 ? facName(es[0]) : facName(es[0]) + " +" + (es.length - 1);
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
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - m.offsetWidth - 8)) + "px";
    function close() { m.remove(); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
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
  function menu(btn, items) {
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    m.innerHTML = items.map(function (it, k) { return '<button type="button" class="rmenu__item" role="menuitem" data-k="' + k + '"' + (it.tone ? ' data-tone="' + it.tone + '"' : '') + '>' + it.icon + '<span>' + esc(it.label) + '</span></button>'; }).join("");
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.round(r.left)) + "px";
    function close() { m.remove(); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target)) { e.preventDefault(); e.stopPropagation(); close(); } }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
    m.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { var it = items[+b.dataset.k]; if (it.keep) { it.fn(b, close); return; } var f = it.fn; close(); f(); }); });   /* an item with `keep` leaves the menu open: it shows its own progress */
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
      var mine = shares.filter(function (x) { return !q || fold(x.email + " " + who(x.email)).indexOf(q) >= 0; });
      var rest = cands.filter(function (c) { return !have[c.email] && (!q || fold(c.email + " " + (c.note || "")).indexOf(q) >= 0); });
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
        if (wide()) { show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); setUrl(BASE + state.viv.id); loadItems().then(paint, fail); } else back(); }, fail);
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
  function openViv(id) { if (!state.viv || state.viv.id !== id) state.lastItem = null; state.filter = ""; state.viv = state.vivs.filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) { stack().length = 0; show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); } go(editor); paintSel(); }
  var ITEM_SELECT = "&select=id,position,exercise_id,music_id,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,level,curve,level_basis,curve_basis,source)),music!music_id(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email),item_music_options(music_id,created_at,music(id,name,title,artist,duration_sec,audio_object,in_catalog))&order=position";
  function itemsOf(id) { return api("/rest/v1/vivencia_items?vivencia_id=eq." + id + ITEM_SELECT); }
  function loadItems() {
    return itemsOf(state.viv.id).then(function (r) { state.items = r || []; });
  }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id); curJoin(v.id);
    show(head(v.title || "ויוונסיה חדשה", "", true, '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="more" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>') +
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      (v.role === "view" ? '' : '<button class="rfab" data-act="add" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>'), function (r) {
      on(r, "back", back); on(r, "add", function () { resetPk(); if (wide()) goSub(picker); else pickerSheet(); });
      on(r, "more", function (b) {
        /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
        var items = v.role === "view" ? [] : [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false); } }];
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
      state.items = rec.items || []; state.members = rec.members || []; paint();
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
        return { id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, vivencia_items: [{ count: items.length }] }, role: v.role, pos: v.pos, items: items, members: r[1] || [] };
      });
    });
  }
  function refreshOffline(v) {   /* an open vivencia is already read: its copy is made current from that, quietly */
    if (state.offline || !window.BioOffline) return;
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) {
      return BioOffline.update({ id: v.id, row: { id: v.id, title: v.title, updated_at: v.updated_at, vivencia_items: [{ count: state.items.length }] }, role: v.role, pos: v.pos, items: state.items, members: mm || [] });
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
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-n="' + state.viv.id + '"]'); if (cnt) cnt.textContent = state.items.length + " תרגילים";
    var vis = state.items;   /* the order of the list IS the curve: no phase is kept on an item */
    if (!vis.length) {
      /* an empty vivencia: the words, and an arrow from them down to the + button (only for somebody who can add) */
      l.style.position = "relative";
      l.innerHTML = ph("הוויוונסיה ריקה", canEdit() ? "לחצו על + כדי להוסיף תרגיל מהקטלוג" : "");
      if (l.firstElementChild) l.firstElementChild.style.marginBlock = "auto";   /* the arrow is a second child: the words are centred by hand */
      if (canEdit()) { arrowTo(l); setTimeout(function () { arrowTo(l); }, 350); }
      return;
    }
    l.innerHTML = vis.map(function (i, k) {
      var e = i.exercises || {};
      var pb = i.music ? playCol(i.music, true) : "";
      return '<div class="rrow rrow--link" style="padding-inline:var(--gutter);padding-block:var(--sp-2)"' + (state.lastItem === i.id ? ' aria-current="true"' : '') + '><span aria-hidden="true" style="flex:none;display:flex;align-items:center;justify-content:center;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl);background:var(--surface-2);font:var(--fw-bold) var(--fs-m)/1 var(--font)">' + (k + 1) + '</span><button type="button" class="rrow__main" data-edit="' + i.id + '" style="background:none;border:0;padding:0;margin-inline-start:var(--sp-1);text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(itemName(i)) + '</span>' +
        (i.music ? songLines(i.music) : '<span class="rrow__sub">בלי מוזיקה</span>') + '</span></button>' + pb + facChip(i, ' rrow__trail')   /* the same tile as the number's */ + '</div>';
    }).join("");
    l.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var it = state.items.filter(function (x) { return x.id === b.dataset.edit; })[0]; if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }); });
    wireFac(l);
    if (canEdit()) enableDrag(l, "[data-edit]", persistItems);
  }
  /* beside the list the open exercise's strip is marked at once, wherever it was opened from (a click, the arrows, a swap) */
  function markItem() {
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;
    l.querySelectorAll("[data-edit]").forEach(function (b) { b.closest(".rrow").setAttribute("aria-current", b.dataset.edit === state.lastItem ? "true" : "false"); });
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
  function enableDrag(l, keySel, onMove) {
    if (l._dragOff) l._dragOff();   /* the list element is reused: drop the previous paint's listeners */
    var rows = [].slice.call(l.querySelectorAll(".rrow"));
    var d = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };
    l.addEventListener("touchmove", blockTouch, { passive: false });
    rows.forEach(function (row, k) {
      var title = row.querySelector(keySel);
      title.addEventListener("keydown", function (e) {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        var to = k + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        e.preventDefault(); onMove(k, to);
      });
      row.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        d = { grip: !!e.target.closest("[data-grip]"), row: row, k: k, y0: e.clientY, pid: e.pointerId, live: false, timer: null, tops: rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; }), h: row.getBoundingClientRect().height, to: k };
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
      d.row.style.transform = "translateY(" + dy + "px)";
      var c = d.tops[d.k] + dy, to = 0;
      d.tops.forEach(function (t, i) { if (i !== d.k && t < c) to++; });
      d.to = to;
      rows.forEach(function (r, i) {
        if (r === d.row) return;
        var shift = 0;
        if (d.k < to && i > d.k && i <= to) shift = -d.h;
        if (d.k > to && i >= to && i < d.k) shift = d.h;
        r.style.transform = shift ? "translateY(" + shift + "px)" : "";
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
    var hm = html.match(/^<header class="rhead">[\s\S]*?<\/header>/), sh = dlg.querySelector(".sheet-head");
    if (hm) { sh.innerHTML = hm[0]; sh.setAttribute("data-rs-drag-all", ""); html = html.slice(hm[0].length); }
    var cnt = sh.querySelector('[data-act="list"]'); if (cnt) { cnt.tabIndex = -1; cnt.setAttribute("aria-hidden", "true"); }   /* here the counter only shows where we are: the list is already behind the popup */
    var host = dlg.querySelector("#itemHost"); host.innerHTML = html; if (wire) wire(dlg.querySelector(".sheet"));
  }
  /* the page of an exercise, below its header: the songs (cards), the texts. ro: the catalog's exercise, only read (no facilitators, no notes, the texts are not edited) */
  function itemPageHtml(it, ro) {
    return '<style>#ipg, #ipg * { touch-action: pan-y } #ipg textarea, #ipg .rf-rich { max-height: none } #ifields > .rfield { margin: 0 } #imus [data-audio] svg { width: var(--icon-s) !important; height: var(--icon-s) !important }</style><div id="ipg" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0"><div class="pad" style="padding-bottom:0">' +
      '<div style="display:flex;align-items:flex-end;gap:var(--gap-button)">' + (ro ? '' : facChip(it)) + '</div>' +
      '</div>' +
      '<div id="iscroll" style="flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain">' +   /* everything under the name scrolls together; the texts are open to the end */
      '<div id="imus" style="flex:none;padding:var(--sp-2) var(--gutter) 0">' + musCards(it, ro) + '</div>' +   /* the songs this exercise is torn between, as cards: the chosen one plays in the vivencia */
      '<div id="ifields" style="flex:none;display:flex;flex-direction:column;gap:var(--gap-field);padding:var(--gutter) var(--gutter) 0"><label class="rfield" style="flex:none"><span>פואטיקה</span><div id="ipo" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "poetics") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "poetics")) + '</div></label>' +
      '<label class="rfield" style="flex:none"><span>הנחיה</span><div id="igu" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "guidance") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "guidance")) + '</div></label>' +
      (ro ? '' : '<label class="rfield" style="flex:none"><span>הערות</span><div id="it" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.notes || "") + '</div></label>') + '</div>' +
      '<div id="ibtns" style="flex:none;height:calc(2 * var(--fab) + var(--sp-2) + 2 * var(--gutter) + var(--inset-b))"></div></div></div>';
  }
  function itemScreen(it) {
    var e = it.exercises || {};
    setUrl(BASE + state.viv.id + "/" + it.id);
    state.lastItem = it.id;   /* the strip of the exercise last opened stays marked in the list, like the vivencia in its list */
    markItem();
    var k = state.items.indexOf(it), prevIt = state.items[k - 1], nextIt = state.items[k + 1];
    /* the header walks the sequence: the right button to the previous exercise, the left one to the next, the name between them */
    var hd = itemHead(!!prevIt, !!nextIt, "", it.exercise_id, itemName(it));   /* the middle button says where we are, and still opens the list */
    show(hd + itemPageHtml(it, false), function (r) {
      var sf = state.slideFrom || 0, pg = r.querySelector("#ipg"); state.slideFrom = 0;
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
      if (pg) attachPager(pg, { next: nextIt ? function () { walk(nextIt); } : null, prev: prevIt ? function () { walk(prevIt); } : null });
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
      return api("/rest/v1/exercise_music?select=exercise_id,exercises(id,title_he,title_en),music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=exercise_id,music_id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
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
        return api("/rest/v1/music?in_catalog=eq.true&select=id,name,title,artist,duration_sec,audio_object,in_catalog&order=name,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
          rows = rows || []; rows.forEach(function (m) { if (!seen[m.id]) rest.push(m); });
          return rows.length === PAGE ? lp(off + PAGE) : rest;
        });
      }
      return lp(0).then(function (r) { if (r.length) o.push({ id: "_loose", name: "שירים ללא תרגיל", songs: r, seen: {} }); return o; }, function () { return o; });
    }
    exMusicP = page(0).then(function (o) { return loose(o.sort(function (a, b) { return a.name.localeCompare(b.name, "he"); })); }, function (e) { exMusicP = null; throw e; });
    return exMusicP;
  }
  /* the music chooser: one search over this exercise's songs, the exercises, and the songs inside them; each other exercise opens like an accordion onto its songs */
  function musicBrowse(l, own, it, pick, tail) {
    l.innerHTML = '<label class="rfield" style="margin-bottom:var(--sp-2)"><span>חיפוש מוזיקה או תרגיל</span><input id="mq" placeholder=" " autocomplete="off"></label><div id="mb"></div>' + (tail || "");
    var mb = l.querySelector("#mb"), q = l.querySelector("#mq"), groups = null, open = {}, byId = {};
    own.forEach(function (m) { byId[m.id] = m; });
    function hit(m, s) { return fold(songName(m) + " " + songBy(m)).indexOf(s) >= 0; }
    function draw() {
      var s = fold(q.value.trim()), h = "";
      var mine = own.filter(function (m) { return !s || hit(m, s); });
      h += mine.map(function (m) { return songRow(m, it.music_id === m.id, "data-m"); }).join("");
      if (!groups) h += '<div class="rskel rskel--title"></div>';
      else {
        var shown = 0;
        groups.forEach(function (g) {
          if (g.id === it.exercise_id) return;
          var nm = !!s && fold(g.name).indexOf(s) >= 0, ms = s ? (nm ? g.songs : g.songs.filter(function (m) { return hit(m, s); })) : g.songs;
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
      (it.exercise_id ? api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)") : Promise.resolve([])).then(function (rows) {
        var seen = {}, list = [];
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
        var row = function (id, t, sub, cur, m) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-m="' + id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button>' + (m ? songBtn(m, true) : '') + '</div>'; };
        var l = r.querySelector("#mlist");
        musicBrowse(l, list, it, function (m) { chooseSongHere(it, m, out); },
          '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-act="other" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">מוזיקות אחרות</span><span class="rrow__sub">שירים שאינם בקטלוג</span></button></div>');
        on(l, "other", function () { otherMusic(it, out); subEnter(); });
      }, fail);
    }, "d");
  }

  /* ---------- other music: files the catalogs do not list. Same rows as the songs, with a tag ---------- */
  /* narrow screen: choosing the song is a popup from the bottom; "other music" is a second popup on top of it, closing it is back */
  /* the songs an exercise of a vivencia is torn between, oldest first; the chosen one is among them even when it was chosen before the options existed */
  function optList(it) {
    var seen = {}, out = [];
    (it.item_music_options || []).slice().sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); }).forEach(function (o) { if (o.music && !seen[o.music.id]) { seen[o.music.id] = 1; out.push(o.music); } });
    if (it.music && !seen[it.music.id]) out.unshift(it.music);
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
  /* the card of a music option, the same as the music page's: the name, the performer, and at the foot the play tile and the time; the chosen one has the green frame, the others a chip to choose them */
  function optCardHtml(m, sel, withRm) {
    var tile = songBtn(m, false).replace(/width:var\(--fab\);height:var\(--fab\);min-height:var\(--fab\);/g, "width:46px;height:var(--tag-s);min-height:var(--tag-s);padding:0;border-radius:999px;background:var(--surface-2);");
    var tm = '<span class="bio-time" data-dur="' + (m.duration_sec || "") + '"' + (m.audio_object ? ' data-for="' + esc(m.audio_object) + '"' : '') + ' style="color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + (durOf(m) ? clock(durOf(m)) : '') + '</span>';
    var pickChip = sel ? '' : '<button type="button" class="rchip rchip--s" data-choose="' + esc(m.id) + '" title="לבחור אותה לתרגיל בוויוונסיה" style="cursor:pointer;border:0">בחירה</button>';
    var rm = !withRm ? '' : '<button type="button" class="rbtn rbtn--icon" data-orm="' + esc(m.id) + '" aria-label="מחיקה מהתרגיל" title="מחיקה מהתרגיל" style="position:absolute;top:2px;right:2px;color:var(--text-3);min-height:var(--ctl);height:var(--ctl);width:var(--ctl);padding:0">' + I.trash + '</button>';
    return '<div class="rcard rcard--compact" data-opt="' + esc(m.id) + '" role="button" tabindex="0"' + (sel ? ' aria-current="true"' : '') + ' style="margin:0;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;background:var(--on-primary)' + (sel ? ';border-color:var(--primary);box-shadow:inset 0 0 0 1px var(--primary)' : '') + '">' +
      '<span style="display:block;direction:ltr;text-align:left;overflow-wrap:anywhere;padding-right:' + (withRm ? 'var(--ctl)' : '0') + ';font:var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(songName(m)) + '</span>' +
      '<span style="display:block;direction:ltr;text-align:left;overflow-wrap:anywhere;color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/var(--lh-tight) var(--font)">' + (songBy(m) ? esc(songBy(m)) : '&nbsp;') + '</span>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:var(--gap-tight)">' + tile + pickChip + tm + '</div>' + rm + '</div>';
  }
  /* removing a song from the options of an exercise: asked in the kit's popup; closing it is the cancel */
  function confirmRemoveOpt(it, m, done) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    var chosen = m.id === it.music_id;
    RosterSheet.render(dlg, { kind: "confirm",
      title: "מחיקת מוזיקה", from: "bottom", size: "s",
      body: '<div class="pad"><span>למחוק את "' + esc(songName(m)) + '" מהתרגיל?' + (chosen ? ' זו המוזיקה שנבחרה: התרגיל יישאר בלי מוזיקה.' : '') + '</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="crmo">מחיקה</button>'
    });
    dlg.querySelector("#crmo").addEventListener("click", function () {
      dlg.close();
      api("/rest/v1/item_music_options?item_id=eq." + it.id + "&music_id=eq." + m.id, { method: "DELETE" }).then(function () {
        return chosen ? api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: null } }) : null;
      }).then(function () {
        it.item_music_options = (it.item_music_options || []).filter(function (o) { return o.music_id !== m.id; });
        if (chosen) { it.music_id = null; it.music = null; }
        done();
      }, fail);
    });
  }
  function musCards(it, ro) {
    var list = optList(it), cur = it.music_id;
    var cards = list.map(function (m) { return optCardHtml(m, m.id === cur, !ro); }).join("");
    if (ro) return cards ? '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(21rem,1fr));gap:var(--sp-1);align-items:stretch">' + cards + '</div>' : '';
    var add = '<div class="rcard rcard--compact" data-addm role="button" tabindex="0" style="margin:0;min-width:0;display:flex;align-items:center;justify-content:center;gap:var(--sp-1);cursor:pointer;min-height:var(--tag-s);border:1px dashed var(--line-strong);background:transparent;box-shadow:none;color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font)"><span aria-hidden="true" style="display:grid;width:var(--icon-m);height:var(--icon-m)">' + I.plus.replace("<svg ", '<svg style="width:100%;height:100%;stroke-width:var(--icon-w)" ') + '</span>' + (list.length ? "הוספת מוזיקה" : "בחירת מוזיקה") + '</div>';
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(21rem,1fr));gap:var(--sp-1);align-items:stretch">' + cards + add + '</div>';
  }
  /* the catalog's preview of an exercise: the songs it comes with, as the same cards, at the same place (above the texts), without the add card */
  function prevMusic(songs, sel, inset) {
    if (!songs.length) return "";
    return '<div id="pvmus" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(21rem,1fr));gap:var(--sp-1);align-items:stretch;margin-bottom:var(--sp-2)' + (inset ? ';margin-inline:var(--gutter)' : '') + '">' + songs.map(function (m) { return optCardHtml(m, m.id === sel, false); }).join("") + '</div>';
  }
  /* a song joins the options of the exercise; if the exercise has no chosen song yet, it is the chosen one */
  function addOpt(it, m) {
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
    var r = sheetOf("addMusDlg", "הוספת מוזיקה", '<style>html.bio-docked #addMusDlg .sheet-body { padding-bottom: 0 }</style><div><label class="rfield"><span>חיפוש</span><input id="amq" placeholder=" " autocomplete="off"></label></div><div id="amlist" style="flex:1 1 auto;min-height:0;overflow-y:auto;margin-top:var(--sp-2);padding-bottom:calc(var(--dockfull) + var(--gutter))"><div class="rskel rskel--title"></div></div>');
    r.style.overflowY = "hidden";   /* the search stays, only the cards scroll */
    var listEl = r.querySelector("#amlist"), qi = r.querySelector("#amq");
    var linked = null, rest = null, shown = 90, fresh = true;
    function cardHtml(m, added) {
      var tile = songBtn(m, false).replace(/width:var\(--fab\);height:var\(--fab\);min-height:var\(--fab\);/g, "width:46px;height:var(--tag-s);min-height:var(--tag-s);padding:0;border-radius:999px;background:var(--surface-2);");
      var tm = '<span class="bio-time" data-dur="' + (m.duration_sec || "") + '"' + (m.audio_object ? ' data-for="' + esc(m.audio_object) + '"' : '') + ' style="color:var(--text-2);font:var(--fw-medium) var(--fs-s)/1 var(--font);font-variant-numeric:tabular-nums">' + (durOf(m) ? clock(durOf(m)) : '') + '</span>';
      return '<div class="rcard rcard--compact" data-am="' + esc(m.id) + '" role="button" tabindex="0"' + (added ? ' aria-current="true"' : '') + ' style="margin:0;min-width:0;display:flex;flex-direction:column;gap:2px;cursor:pointer;background:var(--on-primary)' + (added ? ';border-color:var(--primary)' : '') + '">' +
        '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;font:var(--fw-bold) var(--fs-s)/var(--lh-tight) var(--font)">' + esc(songName(m)) + '</span>' +
        '<span style="direction:ltr;text-align:left;overflow-wrap:anywhere;color:var(--text-2);font:var(--fw-regular) var(--fs-xs)/var(--lh-tight) var(--font)">' + (songBy(m) ? esc(songBy(m)) : '&nbsp;') + '</span>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:auto;padding-top:var(--gap-tight)">' + tile + tm + '</div></div>';
    }
    function draw() {
      if (!linked || !rest) return;
      var s0 = fold(qi.value.trim()), words = s0.split(/\s+/).filter(Boolean);
      var hit = function (m) { var f = fold(songName(m) + " " + songBy(m)); return words.every(function (w) { return f.indexOf(w) >= 0; }); };
      var has = {}; optList(it).forEach(function (m) { has[m.id] = 1; });
      var lk = linked.filter(hit), ot = rest.filter(hit), cut = ot.slice(0, shown);
      var grid = function (arr) { return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(18rem,1fr));gap:var(--sp-1)">' + arr.map(function (m) { return cardHtml(m, !!has[m.id]); }).join("") + '</div>'; };
      var head = function (t, n) { return '<div class="rrow__sub" style="padding:var(--sp-2) 0 var(--sp-1)">' + esc(t) + ' (' + n + ')</div>'; };
      listEl.innerHTML = (lk.length ? head("מקושרות לתרגיל בקטלוג", lk.length) + grid(lk) : '') + (cut.length ? head("שירים אחרים", ot.length) + grid(cut) : '') + (!lk.length && !cut.length ? ph("לא נמצא", "") : '');
    }
    qi.addEventListener("input", function () { shown = 90; listEl.scrollTop = 0; draw(); });
    listEl.addEventListener("scroll", function () { if (listEl.scrollTop + listEl.clientHeight > listEl.scrollHeight - 600 && rest && shown < rest.length) { shown += 90; draw(); } }, { passive: true });
    listEl.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var c = ev.target.closest("[data-am]"); if (!c) return;
      var all = (linked || []).concat(rest || []), m = all.filter(function (x) { return x.id === c.dataset.am; })[0]; if (!m) return;
      if (optList(it).some(function (x) { return x.id === m.id; })) return;
      addOpt(it, m).then(function () { draw(); if (changed) changed(); }, fail);
    });
    var linkedP = it.exercise_id ? api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)").then(function (rows) {
      var seen = {}, out = []; (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; out.push(x.music); } }); return out;
    }) : Promise.resolve([]);
    Promise.all([linkedP, loadAllSongs()]).then(function (res) {
      linked = res[0]; var lk = {}; linked.forEach(function (m) { lk[m.id] = 1; });
      rest = res[1].filter(function (m) { return !lk[m.id] && (m.in_catalog !== false || m.owner_id === me || (vid && m.vivencia_id === vid)); });
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
    return '<style>' + q + ' .sheet-body { overflow-x: hidden; margin-inline: calc(' + v + ' * -1); padding-inline: 0 } ' + q + ' .sheet-body > * { padding-inline: ' + v + ' } ' +
      q + ' .rrow { margin-inline: calc(' + v + ' * -1); padding-inline: ' + v + ' } ' + q + ' .rrow[aria-current="true"] { background: var(--surface); box-shadow: inset 3px 0 0 var(--accent) }</style>';
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
    (it.exercise_id ? api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)") : Promise.resolve([])).then(function (rows) {
      var seen = {}, list = [];
      (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
      var plain = function (attr, t, sub, cur) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" ' + attr + ' style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button></div>'; };
      var l = r.querySelector("#mlist");
      musicBrowse(l, list, it, function (m) { chooseSong(it, m); }, plain('data-act="other"', "מוזיקות אחרות", "שירים שאינם בקטלוג", false));
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
      body: '<div class="pad"><label class="rfield"><span>שם השיר</span><input id="sn" placeholder=" " autocomplete="off" value="' + esc(m.title || m.name || "") + '"></label><label class="rfield"><span>מבצע</span><input id="sa" placeholder=" " autocomplete="off" value="' + esc(m.artist || "") + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="ssave">שמירה</button>'
    });
    var n = dlg.querySelector("#sn"), a = dlg.querySelector("#sa"); n.focus(); n.select();
    function save() {
      var t = n.value.trim(), ar = a.value.trim(); if (!t) return toast("חסר שם");
      api("/rest/v1/music?id=eq." + m.id, { method: "PATCH", prefer: "return=minimal", json: { title: t, artist: ar, name: t + (ar ? ", " + ar : "") } }).then(function () {
        m.title = t; m.artist = ar; m.name = t + (ar ? ", " + ar : "");
        (state.items || []).forEach(function (x) { if (x.music && x.music.id === m.id) { x.music.title = t; x.music.artist = ar; x.music.name = m.name; } });
        dlg.close(); if (done) done();
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
      var q = fold(r.querySelector("#oq").value.trim());
      var vis = all.filter(function (m) { return !q || fold(songName(m) + " " + songBy(m)).indexOf(q) >= 0; });
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
  var pk = { q: "", ln: "", cg: "", lv: "", cv: "" };   /* the catalog's search, line, category, group level and place on the curve */
  function resetPk() { pk = { q: "", ln: "", cg: "", lv: "", cv: "" }; }
  var LEVELS_FALLBACK = [{ key: "all", name_he: "מתחילים (מתאים לכל הקבוצות)" }, { key: "exp3", name_he: "לקבוצות עם ניסיון של כמה חודשים" }, { key: "exp6", name_he: "לקבוצות עם ניסיון של חצי שנה ויותר" }, { key: "deep", name_he: "לקבוצות העמקה ומתקדמות" }];   /* the index of group levels (biodanza.levels), when it has not come from the cloud */
  /* the catalog picker: the filters and the list. On a wide screen it is a pane; on a narrow one it is a popup from the bottom. */
  function pickerBody() {
    var two = function (x, y) { return '<div style="display:flex;gap:var(--gap-button);align-items:flex-end;min-width:0">' + x + y + '</div>'; };
    var sel = function (id, label, opts) { return '<label class="rfield" style="flex:1 1 0;min-width:0;max-width:50%;overflow:hidden;margin:0"><span>' + label + '</span><select id="' + id + '" style="width:100%;min-width:0;max-width:100%;text-overflow:ellipsis"><option value="">הכול</option>' + opts + '</select></label>'; };
    var cat = '<label class="rfield" style="flex:1 1 0;min-width:0;max-width:50%;overflow:hidden;margin:0"><span>קטגוריה</span><input style="width:100%;min-width:0" id="cg" placeholder=" " autocomplete="off" role="combobox" aria-expanded="false" aria-haspopup="listbox" value="הכול"></label>';
    var lvl = sel("lv", "רמת הקבוצה", (state.levels && state.levels.length ? state.levels : LEVELS_FALLBACK).map(function (l) { return '<option value="' + l.key + '">' + esc(l.name_he) + '</option>'; }).join(""));
    var cur = sel("cv", "מיקום בעקומה", state.phases.map(function (x) { return '<option value="' + x.key + '">' + esc(x.name_he) + '</option>'; }).join(""));
    var lin = sel("ln", "קו", state.lines.map(function (l) { return '<option value="' + l.key + '">' + esc(l.name_he) + '</option>'; }).join(""));
    var srch = '<label class="rfield" style="margin:0"><span>חיפוש</span><input id="q" placeholder=" "></label>';
    /* one scroll region holds the head and the list. The head is sticky: the two rows of filters slide away when the list is scrolled down, leaving the search at the top, and come back at the first scroll up. */
    return '<div class="rlist" id="pks" style="position:relative"><div class="pad" data-pickhead id="pkh" style="position:sticky;top:0;z-index:2;background:var(--bg);flex:none;transition:transform var(--t-base)"><div id="pkf" style="display:flex;flex-direction:column;gap:var(--gap-field)">' + two(lvl, cur) + two(cat, lin) + '</div>' + srch + '</div>' +
      '<div id="list"><div class="rskel rskel--title"></div></div></div>';
  }
  function pickerWire(r, swapIt, sheet) {
      var catSel = pk.cg;   /* the key of the chosen category, "" = all */
      r.querySelector("#q").value = pk.q; r.querySelector("#ln").value = pk.ln; r.querySelector("#lv").value = pk.lv; r.querySelector("#cv").value = pk.cv; r.querySelector("#cg").value = catSel ? catName(catSel) : "הכול";
      /* a field you can type in that also opens its options when you click it: the options are the kit's menu, placed under the field */
      /* scrolling down slides the two filter rows away (the search stays at the top); the first scroll up brings them back */
      function wireHide() {
        var sc = r.querySelector("#pks"), h = r.querySelector("#pkh"), f = r.querySelector("#pkf"), qf = r.querySelector("#q").closest("label"), last = 0, hidden = false;
        if (!sc || !h || !f || !qf) return;
        function drop() { return qf.offsetTop; }   /* how far the search is from the head's top edge: the rows, the gaps and the padding above it */
        function set(on) { if (on === hidden) return; hidden = on; h.style.transform = on ? "translateY(-" + drop() + "px)" : ""; }
        sc.addEventListener("scroll", function () {
          var t = sc.scrollTop;
          if (t <= 2) set(false);
          else if (t > last + 2 && t > drop()) set(true);
          else if (t < last - 2) set(false);
          last = t;
        }, { passive: true });
        /* on a phone the keyboard leaves little room: while the search is being typed in, the two rows of filters make way, so the results are what is seen above the keyboard */
        var qi = r.querySelector("#q");
        qi.addEventListener("focus", function () { if (wide()) return; set(false); f.style.display = "none"; sc.scrollTop = 0; });
        qi.addEventListener("blur", function () { if (!qi.value) f.style.display = ""; });   /* with words in the search the rows stay away: a tap on a result must not find the list moved under the finger */
        qi.addEventListener("input", function () { sc.scrollTop = 0; });
      }
      function wireCat() {
        var inp = r.querySelector("#cg"), pop = null, active = -1, shown = [];
        function label() { return catSel ? catName(catSel) : "הכול"; }
        var shield = null;
        function close(revert) { if (shield) { shield.remove(); shield = null; } if (pop) { pop.remove(); pop = null; } inp.setAttribute("aria-expanded", "false"); if (revert) inp.value = label(); }
        function choose(k) { catSel = k; close(true); paintCat(); }
        function open(filter) {
          close(false);
          var f = (filter || "").trim();
          shown = [{ key: "", name_he: "הכול" }].concat((state.cats || []).filter(function (c) { return !f || c.name_he.indexOf(f) >= 0; }));
          if (!shown.length) return;
          active = -1;
          pop = document.createElement("div"); pop.className = "rmenu rmenu--fixed"; pop.setAttribute("role", "listbox");
          pop.innerHTML = shown.map(function (c, k) { return '<button type="button" class="rmenu__item" role="option" tabindex="-1" data-k="' + k + '"' + (c.key === catSel ? ' aria-selected="true" style="font-weight:var(--fw-bold)"' : '') + '><span>' + esc(c.name_he) + '</span></button>'; }).join("");
          /* a popover inside the open popup: it is drawn in the top layer and placed by the window (a popup that is moved or scaled cannot shift it), and the popup stays clickable */
          var host = inp.closest("dialog");
          shield = document.createElement("div"); shield.setAttribute("popover", "manual"); shield.style.cssText = "position:fixed;inset:0;margin:0;padding:0;border:0;width:auto;height:auto;background:transparent;touch-action:none";   /* an invisible sheet over everything: a touch outside the menu only closes it and reaches nothing behind */
          ["pointerdown", "click", "touchstart"].forEach(function (n) { shield.addEventListener(n, function (e) { e.preventDefault(); e.stopPropagation(); if (n !== "touchstart") close(true); }, { passive: false }); });
          (host || document.body).appendChild(shield); try { shield.showPopover(); } catch (x) { /* none */ }
          (host || document.body).appendChild(pop);
          pop.setAttribute("popover", "manual"); pop.style.inset = "auto"; pop.style.margin = "0"; pop.style.boxSizing = "border-box";
          try { pop.showPopover(); } catch (x) { /* an old browser: an ordinary fixed menu */ }
          var b = inp.getBoundingClientRect(), full = (r.querySelector("#q") || inp).closest("label").getBoundingClientRect(), vw = window.innerWidth, w = Math.min(Math.round(full.width), vw - 16), l = Math.max(8, Math.min(Math.round(full.left), vw - 8 - w));   /* the width of the search field under it: the whole page between its side paddings */
          pop.style.top = Math.round(b.bottom + 2) + "px"; pop.style.left = l + "px"; pop.style.width = w + "px"; pop.style.maxWidth = "none"; pop.style.maxHeight = Math.max(120, Math.round((window.visualViewport ? window.visualViewport.height : window.innerHeight) - b.bottom - 16)) + "px"; pop.style.overflowY = "auto";   /* inside the window, above the keyboard */
          pop.querySelectorAll("[data-k]").forEach(function (o) { o.addEventListener("mousedown", function (e) { e.preventDefault(); choose(shown[+o.dataset.k].key); }); });
          inp.setAttribute("aria-expanded", "true");
        }
        function mark(n) { if (!pop) return; var all = pop.querySelectorAll("[data-k]"); active = Math.max(0, Math.min(n, all.length - 1)); all.forEach(function (o, k) { o.style.background = k === active ? "var(--surface)" : ""; }); if (all[active]) all[active].scrollIntoView({ block: "nearest" }); }
        inp.addEventListener("focus", function () { inp.value = ""; open(""); });   /* the field empties when you enter it: you type or choose; leaving without a choice puts the chosen name back */
        inp.addEventListener("click", function () { if (!pop) { inp.value = ""; open(""); } });
        inp.addEventListener("input", function () { open(inp.value); });
        inp.addEventListener("blur", function () { setTimeout(function () { close(true); }, 0); });
        inp.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!pop) open(""); mark(active + 1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); mark(active - 1); }
          else if (e.key === "Enter") { e.preventDefault(); if (pop && shown.length) choose(shown[active >= 0 ? active : (shown.length > 1 ? 1 : 0)].key); }
          else if (e.key === "Escape") { close(true); inp.blur(); }
        });
      }
      function paintCat() {
        var q = fold(r.querySelector("#q").value.trim()), ln = r.querySelector("#ln").value, lv = r.querySelector("#lv").value, cv = r.querySelector("#cv").value, cg = catSel, l = r.querySelector("#list");
        pk = { q: r.querySelector("#q").value, ln: ln, cg: cg, lv: lv, cv: cv };   /* what was typed and chosen is kept while an exercise is looked at and back again */
        var rows = (state.cat || []).filter(function (e) {
          return (!cg || e.category === cg) && (!lv || e.level_key === lv) && (!cv || (e.phase_keys || []).indexOf(cv) >= 0) && (!ln || (e.exercise_lines || []).some(function (x) { return x.line_key === ln; })) && (!q || fold(name(e) + " " + e.title_en + " " + e.category).indexOf(q) >= 0);
        });
        l.innerHTML = rows.length ? rows.map(function (e) {
          return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-ex="' + e.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(name(e)) + '</span><span class="rrow__sub">' + esc([catName(e.category)].concat((e.exercise_lines || []).map(function (x) { return lineName(x.line_key); })).filter(Boolean).join(" · ")) + '</span></button></div>';
        }).join("") : ph("לא נמצא תרגיל", "");
        l.querySelectorAll("[data-ex]").forEach(function (b) { b.addEventListener("click", function () {
          var ex = state.cat.filter(function (x) { return x.id === b.dataset.ex; })[0];
          l.querySelectorAll(".rrow").forEach(function (w) { w.removeAttribute("aria-current"); });
          b.closest(".rrow").setAttribute("aria-current", "true");
          if (sheet) previewSheet(ex, swapIt);   /* adding or replacing: the exercise is shown first, and the action is its own button in its header: on the left on a wide screen, in a second popup on a narrow one */
          else previewEx(ex, swapIt);
        }); });
        /* a typed search also finds songs (any exercise's); choosing one adds an exercise with no name and that song */
        if (q && !swapIt) {
          var box = document.createElement("div"); box.innerHTML = '<div class="rrow__sub" style="padding:var(--sp-3) 0 var(--sp-1)">מוזיקות</div><div data-sgs></div>'; l.appendChild(box);
          var tok = ++sgTok;
          loadExMusic().then(function (gs) {
            if (tok !== sgTok || !box.isConnected) return;
            var seen = {}, songs = [];
            gs.forEach(function (g) { g.songs.forEach(function (m) { if (!seen[m.id] && fold(songName(m) + " " + songBy(m)).indexOf(q) >= 0) { seen[m.id] = 1; songs.push(m); } }); });
            var sl = box.querySelector("[data-sgs]");
            if (!songs.length) { box.remove(); return; }
            sl.innerHTML = songs.slice(0, 60).map(function (m) { return songRow(m, false, "data-sg"); }).join("");
            sl.addEventListener("click", function (ev) { var bt = ev.target.closest("[data-sg]"); if (!bt) return; var m = songs.filter(function (x) { return x.id === bt.dataset.sg; })[0]; if (m) addSongOnly(m, sheet); });
          }, function () { box.remove(); });
        }
      }
      r.querySelector("#q").addEventListener("input", paintCat); r.querySelector("#ln").addEventListener("change", paintCat); r.querySelector("#lv").addEventListener("change", paintCat); r.querySelector("#cv").addEventListener("change", paintCat); wireCat(); wireHide();
      (state.cats ? Promise.resolve() : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) {
        state.cats = c || [];
      })).then(function () { return state.cat ? null : loadCatalog().then(function (c) { state.cat = c; }); }).then(paintCat, fail);
  }
  function picker(swapIt) {
    show(head(swapIt ? "החלפת תרגיל" : "קטלוג התרגילים", "", true) + pickerBody(), function (r) {
      on(r, "back", !wide() ? back : swapIt ? function () { pending = { item: swapIt.id }; back(); }   /* leaving a replacement: the same exercise is open again on the left */
        : function () { show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); back(); });
      pickerWire(r, swapIt, false);
    });
  }
  /* narrow screen: the catalog is a popup from the bottom, and a chosen exercise opens in a second popup on top of it, with the action as a green check in its header; closing it is back to the list */
  function pickerSheet(swapIt) {
    var dlg = document.getElementById("catDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "catDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { title: swapIt ? "החלפת תרגיל" : "קטלוג התרגילים", from: "bottom", body: bleedCss("catDlg") + pickerBody() });
    bleedSet(dlg);   /* the content sits on the title's own edges, the same on both sides */
    var r = dlg.querySelector(".sheet-body"), ls = r.querySelector("#pks");
    var ph0 = r.querySelector("[data-pickhead]"); if (ph0) { ph0.style.paddingTop = "0"; ph0.style.paddingInline = "0"; }   /* the popup already leaves its standard step under the title */
    r.style.overflowY = "hidden";   /* the search stays where it is and only the list scrolls, so nothing shows through above it */
    if (ls) ls.style.cssText += ";flex:1 1 auto;min-height:0;overflow-y:auto";
    pickerWire(r, swapIt, true);
  }
  /* the catalog's exercise as an item of the page: its texts, its songs as options, the first one chosen; nothing of it is written anywhere */
  function itemFake(e, rows, songs) {
    return { id: "", exercise_id: e.id, exercises: Object.assign({}, e, { exercise_texts: rows || [] }), title: null, poetics: null, guidance: null, notes: "",
      music_id: songs.length ? songs[0].id : null, music: songs[0] || null,
      item_music_options: songs.map(function (m, i) { return { music_id: m.id, created_at: String(1000 + i), music: m }; }) };
  }
  /* the cards of a read only page: a tap plays, the chip chooses the song the exercise is added with */
  function wireRoMusic(root, fake) {
    var imus = root.querySelector("#imus"); if (!imus) return;
    imus.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var ch = ev.target.closest("[data-choose]");
      if (ch) { var m = optList(fake).filter(function (x) { return x.id === ch.dataset.choose; })[0]; if (m) { fake.music_id = m.id; fake.music = m; imus.innerHTML = musCards(fake, true); } return; }
      var c = ev.target.closest("[data-opt]"); if (!c) return;
      var pb = c.querySelector("[data-audio]"); if (pb) pb.click();
    });
  }
  function previewSheet(e, swapIt) {
    var tok = ++previewTok;
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;
      var fake = itemFake(e, rows, songs);
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה";
      var dlg = document.getElementById("exDlg");
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "exDlg"; document.body.appendChild(dlg); }
      RosterSheet.render(dlg, { title: name(e), from: "bottom",
        body: bleedCss("exDlg") + '<style>#exDlg .sheet-body { padding-bottom: calc(var(--fab) + var(--gutter) * 2 + var(--inset-b)) } html.rs-lock:not(.kb-open) #exDlg .rfab { opacity: 1; transform: none; pointer-events: auto }</style>' + itemPageHtml(fake, true) });
      bleedSet(dlg);
      /* the action is the round button at the bottom left, where the add button of a list is (a popover inside the popup: drawn in the top layer, placed by the window) */
      var fab = document.createElement("button"); fab.type = "button"; fab.id = "exgo"; fab.className = "rfab"; fab.innerHTML = I.check; fab.setAttribute("aria-label", word); fab.title = word;
      fab.style.cssText = "inset:auto;margin:0;left:max(var(--gutter), var(--inset-l));bottom:calc(var(--gutter) + var(--dockh))";
      fab.setAttribute("popover", "manual"); dlg.appendChild(fab); try { fab.showPopover(); } catch (x) { /* an old browser: an ordinary fixed button */ }
      wireRoMusic(dlg, fake);
      dlg.querySelector("#exgo").addEventListener("click", function () { if (swapIt) confirmSwap(e, swapIt, true, fake.music_id); else addEx(e, undefined, true, fake.music_id); });
    }, fail);
  }
  /* the catalog is over a thousand exercises and the server hands out at most a thousand rows at a time: read it page by page */
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
  function previewEx(e, swapIt) {
    var tok = ++previewTok;
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;   /* a later row was chosen meanwhile */
      var fake = itemFake(e, rows, songs);
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה";
      /* the same page as the exercise of a vivencia, only read: its header, its song cards, its texts; the action is the round button at the bottom left */
      show(itemHead(false, false, "", e.id, name(e), true) + itemPageHtml(fake, true) + '<button class="rfab" type="button" data-act="doswap" aria-label="' + word + '" title="' + word + '">' + I.check + '</button>', function (r) {
        wireRoMusic(r, fake);
        on(r, "doswap", function () { if (swapIt) confirmSwap(e, swapIt, undefined, fake.music_id); else addEx(e, undefined, undefined, fake.music_id); });
      }, "d");
    }, fail);
  }
  /* replacing is asked in the kit's popup, one action: closing it is the cancel */
  function confirmSwap(e, swapIt, sheet, mid) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, { kind: "confirm",
      title: "החלפת תרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><span>להחליף את "' + esc(itemName(swapIt)) + '" ב"' + esc(name(e)) + '"? השם, הפואטיקה וההנחיה שכתבתם בתרגיל הנוכחי יימחקו. ההערות נשארות.</span></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="cswap">החלפה</button>'
    });
    dlg.querySelector("#cswap").addEventListener("click", function () { dlg.close(); addEx(e, swapIt, sheet, mid); });
  }
  function closeSheets() { ["exDlg", "catDlg"].forEach(function (id) { slideClose(document.getElementById(id)); }); }
  var sgTok = 0;
  /* a song chosen in the catalog's search: an exercise with no name, only that song */
  function addSongOnly(m, sheet) {
    var pos = state.items.reduce(function (x, i) { return Math.max(x, i.position); }, 0) + 1;
    api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, exercise_id: null, music_id: m.id } }).then(function () {
      if (sheet) { closeSheets(); return loadItems().then(paint, fail); }
      if (wide()) show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); else stack().pop(); back();
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
  function addEx(e, swapIt, sheet, mid) {
    if (swapIt) {   /* the same place in the curve, another exercise: its first song, and none of the old exercise's own wording */
      return Promise.all([firstMusic(e.id, mid), detached(e.id)]).then(function (r) {
        var m = r[0], d = r[1];
        return api("/rest/v1/vivencia_items?id=eq." + swapIt.id, { method: "PATCH", prefer: "return=minimal", json: { exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null, title: d.title || null, poetics: d.poetics || null, guidance: d.guidance || null } });
      }).then(function () { toast("התרגיל הוחלף");
        if (sheet) {   /* the popups slide out and the same place opens again with the new exercise: no new address, so no entry */
          closeSheets();
          return loadItems().then(function () { var it = state.items.filter(function (x) { return x.id === swapIt.id; })[0]; if (it) { stack().pop(); go(function () { itemScreen(it); }); } else back(); }, fail);
        }
        pending = { item: swapIt.id };
        if (inSub()) { unwind(1); return; }   /* the catalog beside the exercise holds one entry: leaving it draws the exercise again from the address */
        stack().pop(); if (!wide()) { stack().pop(); stack().pop(); } var f = stack()[stack().length - 1]; if (f) f(); }, fail);   /* narrow: also the exercise screen and the one just seen */
    }
    var pos = state.items.reduce(function (m, i) { return Math.max(m, i.position); }, 0) + 1;
    Promise.all([firstMusic(e.id, mid), detached(e.id)]).then(function (r) {
      var m = r[0], d = r[1];
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null, title: d.title || null, poetics: d.poetics || null, guidance: d.guidance || null } });
    }).then(function () { toast("התרגיל נוסף"); if (sheet) { closeSheets(); return loadItems().then(paint, fail); }
      if (wide()) show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); else stack().pop(); back(); }, fail);
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
      var vis = rows.filter(function (a) { return !q || fold(a.email + " " + (a.note || "")).indexOf(q) >= 0; });
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
          else { toast("התרגיל הוסר"); liveItem = null; if (wide()) { show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); state.lastItem = null; setUrl(BASE + state.viv.id); paint(); } else back(); }
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
      return Promise.all([api("/rest/v1/lines?select=key,name_he&order=sort"), api("/rest/v1/phases?select=key,name_he&order=sort"), api("/rest/v1/levels?select=key,name_he&order=rank").catch(function () { return []; })]).then(function (r) { state.lines = r[0]; state.phases = r[1]; state.levels = r[2]; if (!localHome) home(); startRealtime(); api("/rest/v1/song_likes?select=music_id").then(function (ls) { likes = {}; (ls || []).forEach(function (x) { likes[x.music_id] = true; }); }, function () { /* no hearts this time */ });
        api("/rest/v1/vivencia_likes?select=vivencia_id").then(function (ls) { likesViv = {}; (ls || []).forEach(function (x) { likesViv[x.vivencia_id] = true; }); if (state.vivsLoaded) renderVivs(); }, function () { /* no hearts this time */ });
        api("/rest/v1/exercise_likes?select=exercise_id").then(function (ls) { likesEx = {}; (ls || []).forEach(function (x) { likesEx[x.exercise_id] = true; }); }, function () { /* no hearts this time */ }); });
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
