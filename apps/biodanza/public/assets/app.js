/* Biodanza: a facilitator builds a vivencia, plans it along the curve, plays it in the session.
   Built ONLY from the kit's elements (/kit.css): rhead, rlist, rrow, rcard, rbtn, rchip, rfield, rempty, rmsg, rfab.
   Data: schema `biodanza` (apps/biodanza/schema.sql), through FLOA_AUTH.api. Row level security decides who sees what. */
(function () {
  "use strict";
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  /* Every vivencia and every exercise has an address of its own, in the path (no # in the bar): /<vivencia> and /<vivencia>/<exercise>.
     On localhost the app lives under /biodanza/, so the same addresses carry that prefix there. */
  var BASE = /^(localhost|127[.]|192[.]168[.]|10[.])/.test(location.hostname) ? "/biodanza/" : "/";
  try { var inv0 = new URLSearchParams(location.search).get("invite"); if (inv0) sessionStorage.setItem("biodanza.invite", inv0); } catch (x) { /* none */ }   /* a one-time link is kept for this tab: the Google sign-in comes back to the address without it */
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
  function syncLayers() {   /* a popup or menu opened or closed, by the user or by code: its marker entry follows */
    var live = [].slice.call(document.querySelectorAll("dialog[open]")).concat(RosterMenu.current() ? [RosterMenu.current()] : [], window.__leftLive ? window.__leftLive() : []);   /* the side layers (history, lists, pickers) are layers too */
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
  function closeLayer(el) { if (el.classList && el.classList.contains("rpanel")) { window.__leftClose(el); return; } if (el.id === "rsMenu") RosterMenu.close(); else slideClose(el); }
  function parseUrl() { var seg = location.pathname.slice(BASE.length).split("/").filter(Boolean); return { viv: seg[0] || "", item: seg[1] || "" }; }
  function wide() { return window.matchMedia("(min-width: 760px)").matches; }
  /* the loading state (the kit's .rload): an area drawn empty with LOAD waits for its content; loaded(el) ends it when the content is written */
  var LOAD = ' class="rload" aria-busy="true"';
  function loaded(el) { if (el) { el.removeAttribute("aria-busy"); el.classList.remove("rload"); } return el; }
  /* LAW 7 (declared waits only): an action whose result is on the element itself calls the kit's RosterBusy(el, promise) (/sheet.js) at the one place that performs it. The
     element shows aria-busy (drawn in kit.css by its kind) until the promise answers or fails, counted with every other wait on it (the player's). Nothing is guessed by time
     or by "what was pressed": opening a window, a menu, a setting or a screen never calls it (the area inside shows the kit's loading state, .rload with aria-busy). */
  var api = function (p, o) { return rawApi(p, o); };
  var rawApi = function (p, o) {
    if (state.offline) return offlineApi(p, o);
    var r = FLOA_AUTH.api(p, o);
    if (o && o.method && o.method !== "GET" && /\/rest\/v1\/(vivenc|rpc\/leave_vivencia)/.test(p)) r.then(   /* a write; rpc/vivencia_members and rpc/vivencia_partners are POSTs that only read (a read here would start the copy again, and the copy reads, round and round) */function () { localSoon(); }, function () { /* nothing was written */ });
    return r;
  };
  /* the device's copy follows every write: what the screen already shows (changed at once) is kept, and the list-level facts follow the list */
  var localT = 0;
  function localSoon() {
    clearTimeout(localT);
    localT = setTimeout(function () {
      if (state.offline || !window.BioOffline) return;
      if (state.viv && state.items && state.viv.id && BioOffline.isSaved(state.viv.id)) refreshOffline(state.viv);
      if (state.vivsLoaded) BioOffline.patchRows(state.vivs).then(function (need) { if (need) syncOffline(); });   /* not forced: the signature and the wait after a failed pass decide (a forced pass here ran on every write and every live event) */
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

  /* THE ICONS are the kit's sprite (/icons.svg, ui/docs/icon.md): each name here is a <use> of one of its symbols, never a drawing of its own.
     kit.css (svg.rsym) paints them and the parent sizes them; back and next turn on a left-to-right page (rsym--dir). */
  function sym(n, dir) { return '<svg class="rsym' + (dir ? " rsym--dir" : "") + '" aria-hidden="true" focusable="false"><use href="/icons.svg#' + n + '"/></svg>'; }
  var I = {
    globe: sym("globe"), me: sym("user"), lock: sym("lock"), back: sym("back", 1), fwd: sym("next", 1), plus: sym("plus"), search: sym("search"),
    catalog: sym("catalog"), play: sym("play"), pause: sym("pause"), restart: sym("restart"), history: sym("history"), volume: sym("volume"), mute: sym("mute"),
    music: sym("music"), heart: sym("heart"), loop: sym("loop"), upload: sym("upload"), download: sym("download"), warn: sym("warn"), users: sym("users"),
    swap: sym("swap"), curve: sym("curve"), exercise: sym("exercise"), yt: sym("yt"), dots: sym("more"), dup: sym("duplicate"),
    share: sym("share"), check: sym("check"), pen: sym("edit"), leave: sym("leave"), print: sym("print"), bold: sym("bold"),
    trash: sym("delete"),   /* DELETE: a thing that disappears entirely (owner 2026-11-26) */
    x: sym("x")   /* close, and removal from a list */
  };

  /* ---------- bold words in the texts: kept as **word** in the same text, drawn as bold. The kit's rich value (RosterField.rich, ui/docs/realtime.md) ---------- */
  function rtHtml(s) { return RosterField.rich.html(s); }
  function rtInit(el) { RosterField.rich.init(el); }   /* a box that answers like a textarea: .value (Enter is a line, blur is change) */
  /* bold on a phone (the format bubble), the paste and the drop: the kit's (/field.js, ui/docs/format-bubble.md) */
  /* the matching of every search is the kit's (ui/search.js, RosterSearch): no capitals, no marks, every typed word near a word of the text; fzs() is the score (0 = no match), fz() the yes or no */
  var fold = RosterSearch.fold, fzsF = RosterSearch.scoreFolded, fzs = RosterSearch.score, fz = RosterSearch.match;
  function nearest(list, text, q) {   /* the matches of a search, nearest first (a plain order when nothing is typed) */
    if (!fold(q).trim()) return list;
    return list.map(function (x, i) { return { x: x, s: fzs(text(x), q), i: i }; }).filter(function (o) { return o.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.i - b.i; }).map(function (o) { return o.x; });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function name(e) { return e.title_he || e.title_en || ""; }
  function catName(k) { var c = (state.cats || []).filter(function (x) { return x.key === k; })[0]; return c ? c.name_he : ""; }
  /* under the name of a catalog exercise: the catalog it comes from (one; the older first), HEB when it is in Hebrew there, and the note with how many songs are linked */
  /* on a song of the catalog: the exercise sign and, at its right, how many catalog exercises the song is linked to (read once, page by page) */
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
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest(".rmenu")) return; var t = e.target && e.target.closest ? e.target.closest("button, a, [role=button], [data-audio], .rcard, .rrow, input") : null; if (t) lastPress = t; }, true);
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest(".rmenu")) return; var t = e.target && e.target.closest ? e.target.closest("button, a, [role=button], [data-audio], .rcard, .rrow, input") : null; if (t) lastPress = t; }, true);   /* a key press or a script click is a click too */
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
    return I.exercise + '<span class="rbtn__tail" data-exn="' + esc(mid) + '"' + (exCnt && !exCnt[mid] ? ' data-zero' : '') + '>' + (exCnt ? (exCnt[mid] || 0) : "") + '</span>';   /* filled in by paintExCnt; empty (unknown yet) or zero: the button is not shown */
  }
  function exBtnG(m) {   /* the exercise sign and the count, on any song card: it narrows the catalog's exercises to the song's */
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
    var note = I.music;   /* the kit's svg.rsym is --icon by default */
    if (!label && !c) return "";   /* nothing to say: the second row is not written */
    return '<span class="bio-sub">' + (label ? '<span dir="ltr">' + esc(label) + (heb ? ' HEB' : '') + '</span>' : '') + (!c ? '' : '<span class="bio-sub__n" aria-label="' + c + ' מוסיקות">' + note + '<span>' + c + '</span></span>') + '</span>';
  }
  /* a song is two things: its name and who plays it */
  function songName(m) { return m ? (m.title || m.name || "") : ""; }
  function songBy(m) { return m ? (m.artist || "") : ""; }
  function canEdit() { return !state.offline && (!state.viv || (state.viv.role !== "view" && state.viv.role !== "public")); }   /* a share for viewing changes nothing; the database enforces it too */
  /* the same button wherever a song is shown: it searches the song and its artist on YouTube, in a new tab */
  /* the YouTube button of the song just opened on YouTube is marked playing (.is-play, the kit colours it), the others are muted.
     Only what plays NOW is red (apps/biodanza/UI.md "מוזיקה בצבע השני"): the mark is not kept (a reload starts with none), and it comes off as soon as
     the page's own player plays a song (another song took over). ytSet is the ONE place that sets or clears it. */
  var played = "";
  try { localStorage.removeItem("biodanza.played"); } catch (e) { /* nothing kept */ }   /* the old kept mark, from when it survived a reload */
  function ytPlay(id) { return !!id && id === played; }
  function markYt() { document.querySelectorAll("a[data-yt]").forEach(function (x) { x.classList.toggle("is-play", ytPlay(x.dataset.yt)); }); }
  function ytSet(id) { if (played === (id || "")) return; played = id || ""; markYt(); }
  function ytLink(m) {
    return '<a class="rbtn rbtn--icon rbtn--muted' + (ytPlay(m.id) ? ' is-play' : '') + '" data-yt="' + esc(m.id || "") + '" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((songName(m) + " " + songBy(m)).trim()) + '" target="_blank" rel="noopener" aria-label="ניגון ביוטיוב" title="ניגון ביוטיוב">' + I.yt + '</a>';
  }
  /* a song with a file in the bucket gets the sound button (assets/audio.js); one without keeps the YouTube button */
  var songInfo = {};   /* every song's name and performer by its file, as the lists have shown them: the footer player reads its title here */
  var heartOf = (function () { try { return JSON.parse(localStorage.getItem("bio.hearts") || "{}") || {}; } catch (e) { return {}; } })();   /* kept on the device, so after a reload the remembered song has its heart at once (owner 2026-11-27, "בטעינה לא רואים את הלב") */
  function keepHearts() { try { var k = Object.keys(heartOf), o = {}; k.slice(-200).forEach(function (n) { o[n] = heartOf[n]; }); localStorage.setItem("bio.hearts", JSON.stringify(o)); } catch (e) { /* not kept: asked again */ } }
  /* heartOf: the player's heart of each song, by its file: its music row, from the card it was drawn on, or asked once (""= no row). Decided ONCE per song, so the heart never comes and goes (owner 2026-11-26) */
  function songBtn(m, trail) {   /* trail: in a row the button(s) sit in the row's ONE end wrapper (.rrow__trail) */
    var b = songBtnOnly(m);
    return trail ? '<span class="rlayout rlayout--row rrow__trail">' + b + '</span>' : b;
  }
  function songBtnOnly(m) {
    if (m.audio_object) songInfo[m.audio_object] = { t: m.title || m.name, a: m.artist || "" };
    if (m.audio_object && m.id && !/^h[0-9]/.test(m.id) && !heartOf[m.audio_object]) heartOf[m.audio_object] = m.id;   /* a song played from its card has its heart at once (no ask, no gap) */
    if (m.audio_object && window.BioAudio && BioAudio.info) BioAudio.info(m.audio_object, m.title || m.name, m.artist);   /* the phone's lock screen shows the song's name */
    if (m.audio_object && window.BioAudio) return BioAudio.button(m.audio_object);
    songReg[m.id] = m;
    if (m.in_catalog === false || m.owner_id || state.offline || !m.id) return ytLink(m);   /* only a song of the catalog can be given a file */
    /* the upload button, to the right of the YouTube one: a file from this device takes the YouTube button's place for everybody (the pair's layout: theme.css, [data-upl-wrap]) */
    return '<span data-upl-wrap="' + esc(m.id) + '">' +
      '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-upl="' + esc(m.id) + '" aria-label="העלאת קובץ" title="העלאת קובץ שיחליף את היוטיוב">' + I.upload + '</button>' + ytLink(m) + '</span>';
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
        if (window.BioOffline && !state.offline) setTimeout(function () { syncOffline("all"); }, 300);   /* a song got its file: every vivencia is read again (its row did not change) */
      }).catch(function (er) { console.error(er); delete b.dataset.busy; say("ההעלאה נכשלה", 3000); });
    });
    inp.click();
  }, true);
  /* ONE way to write a song in a row: its name is the row's title, the performer its sub (the kit's row texts: one line, dir="auto" so a name in English reads right, the full text in title) */
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
    st.textContent = ":root { --bar-top: var(--gap); --bar-gap: var(--gap) } " +   /* the player is the kit's (.rplayer, kit.css): its look, order, height and --bar-b are CSS of the kit, nothing here */
      "#pl { position: relative }    #pd { position: relative } #pd::after { content: \"\"; position: absolute; inset: 0; z-index: 5; background: var(--scrim); opacity: 0; pointer-events: none; transition: opacity var(--t-base) var(--ease) } #pd.bio-dim::after { opacity: 1; pointer-events: auto } @media (prefers-reduced-motion: reduce) { #pd::after { transition: none } } * { scrollbar-width: none } *::-webkit-scrollbar { display: none }";
    document.head.appendChild(st);
    var PAUSE = I.pause, PLAY = I.play;   /* line drawings, also inside the large icon (owner 2026-11-26) */
    var playing = false, loaded = false, closed = false, leftNow = 0, frac = 0, curT = 0, curD = 0, curTitle = "", curArtist = "", last = null, curName = "", asked = {};
    try { last = JSON.parse(localStorage.getItem("biodanza.lastsong") || "null"); if (last && !last.n) last = null; } catch (x) { last = null; }   /* the song that played last: the footer keeps it, also after a reload */
    if (last && window.BioAudio && BioAudio.info) BioAudio.info(last.n, last.t, last.a);
    var HIST = I.history;
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
    var histPop = null;   /* the history: the kit's one popup (a panel on the left on a computer, a sheet on a phone) */
    function histSkeleton() {   /* law 7: the history opens at once, loading (no body: the kit reserves the area); the songs come in when they have arrived */
      if (wide()) closeLeftAll();
      histPop = RosterSheet.popup({ id: "histDlg", side: "end", title: "היסטוריית האזנה" });
      histPop._rows = []; histPop.classList.add("raccent-2");   /* a music area: the kit's second accent scope (apps/biodanza/UI.md "מוזיקה בצבע השני") */
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
    /* the popups on the left (history, lists, sharing, pickers) are the kit's popups; the catalog's (marked __noHistory) keep no history entry of their own */
    function lefts() { return RosterSheet.panel.live().filter(function (el) { return !el.__noHistory; }); }
    var leftStack = { get length() { return lefts().length; } };
    document.addEventListener("rpanel-change", function () { syncLayers(); });   /* a popup opened or closed: its history entry follows */
    function closeLeftAll() { var l = lefts(); if (l.length) RosterSheet.panel.close(l[0]); }
    window.__closeLeftAll = closeLeftAll;
    window.__leftLive = lefts;
    window.__leftClose = function (el) { RosterSheet.panel.close(el); };
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
      var when = function (at) {   /* how long ago, in words */
        var m = Math.max(0, Math.floor((Date.now() - at) / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
        if (m < 1) return "עכשיו"; if (m === 1) return "לפני דקה"; if (m < 60) return "לפני " + m + " דקות";
        if (h === 1) return "לפני שעה"; if (h === 2) return "לפני שעתיים"; if (h < 24) return "לפני " + h + " שעות";
        if (d === 1) return "אתמול"; if (d === 2) return "שלשום"; if (d < 7) return "לפני " + d + " ימים";
        var w = Math.floor(d / 7); if (w === 1) return "לפני שבוע"; if (w === 2) return "לפני שבועיים"; if (d < 30) return "לפני " + w + " שבועות";
        var mo = Math.floor(d / 30); if (mo === 1) return "לפני חודש"; if (mo === 2) return "לפני חודשיים"; if (mo < 12) return "לפני " + mo + " חודשים"; return "לפני יותר משנה";
      };
      if (!histPop || !RosterSheet.popup.open(histPop)) return;   /* closed before the songs arrived */
      histPop._rows = rows;
      var hb = RosterSheet.popup.body(histPop); if (!hb) return;
      hb.classList.add("rlist");   /* the popup's body IS the list (ui/docs/layout.md: no wrapper round a scroll area) */
      var items = rows.map(function (e, i) { var rid = histIds[e.n]; return { e: e, rid: rid, m: { id: rid || "h" + i, audio_object: e.n, title: e.t, name: e.t, artist: e.a } }; });
      songList(hb, items, { key: function (x) { return x.e.n; }, memory: "bio.history",   /* the kit's list (ui/docs/list.md): the same song card as in every list: a tap plays, the heart, the exercises of the song and the plus; no play button, no frame */
        card: function (x) { var m = x.m; return { m: m, o: { act: exBtnG(m) + (x.rid ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(x.rid) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : ''), click: true, title: x.e.t || "מוסיקה", by: [x.e.a || "", when(x.e.at)].filter(Boolean).join(" · "), pill: cardPill(m) } }; },
        onOpen: function (x) { playName(x.e.n, x.e.t, x.e.a); },   /* a song of the history plays with its name told to the player; the popup stays open */
        empty: { title: "אין עדיין היסטוריה", text: "מוסיקה שהתחלתם להשמיע תופיע כאן", icon: I.music } });
    }
    /* THE APP MENU (kit, ui/docs/app-menu.md): the round button at the far end of the header; the kit writes the button, the head (name, email) and "יציאה".
       Ours are only the items, in groups: navigation | my lists | admin (users, admins only). */
    if (window.RosterAppMenu) RosterAppMenu.attach(Object.assign(appMenuOpts || (appMenuOpts = {}), { name: myName, items: function () {   /* name: the head and the letter show the full-name field (onAccount is added once the server can save it) */
      var cnt = function (o) { return Object.keys(o).filter(function (k) { return o[k]; }).length; };
      return [{ label: "קטלוג תרגילים", icon: I.catalog, fn: function () { openCatalog("ex"); } }, { label: "קטלוג מוזיקות", icon: I.music, fn: function () { openCatalog("mu"); } }, { sep: true },
        { label: "היסטוריית האזנה", icon: HIST, fn: function () { if (wide() && leftStack.length) closeLeftAll(); else openHistory(); } }].concat(state.offline ? [] : [{ label: "ויוונסיות שאהבתי", meta: String(cnt(likesViv)), icon: I.heart, fn: function () { likedVivScreen(); } }, { label: "תרגילים שאהבתי", meta: String(cnt(likesEx)), icon: I.heart, fn: function () { likedExScreen(); } }, { label: "מוסיקה שאהבתי", meta: String(cnt(likes)), icon: I.heart, fn: function () { likedScreen(); } }])
        .concat(state.me && state.me.admin ? [{ sep: true }, { label: "משתמשים", icon: I.users, fn: allowPopup }] : []);
    } }));
    document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-hist]"); if (b) { if (wide() && leftStack.length) closeLeftAll(); else openHistory(); } });
    document.addEventListener("click", function (ev) {   /* a tap on what plays: the kit's ONE small menu on every width (ui/docs/player.md, owner 2026-11-26): the song as a plain music card (title, artist, time, heart), and what can be done with it */
      var nmEl = ev.target.closest && ev.target.closest(".rplayer__info"); if (!nmEl) return;
      var who = nmEl.dataset.who, eid = nmEl.getAttribute("data-edit"); if (!who) return;
      var hid = heartOf[who] || "", canAdd = addCurShow();
      var dur = Math.round(curName === who && curD > 0 ? curD : (last && last.n === who ? last.d : 0)) || 0;
      var head = '<div class="rmenu__head"><b dir="auto">' + esc(shownT || "מוסיקה") + '</b><span class="rmenu__sub" dir="auto">' + esc([shownA, dur ? clk(dur) : ""].filter(Boolean).join(" ")) + '</span></div>';   /* the menu's head is the song: its name, and its performer and time as on its card; no card (owner 2026-11-27) */
      var openMenu = function () {
        var mi = [hid ? { label: "אהבתי", icon: I.heart, check: !!likes[hid], fn: function () { if (likes[hid]) { if (window.RosterMenu) RosterMenu.close(); setTimeout(function () { confirmUnlike(hid, null, nmEl); }, 60); }   /* the menu and its history entry are gone before the confirm opens, so the confirm never opens under it */ else toggleLike(hid); } } : { label: "אהבתי", icon: I.heart, check: false, disabled: true }].concat(canAdd ? [{ label: "הוספה", icon: I.plus, fn: addCur }] : []).concat([{ label: "חיפוש מוסיקה", icon: I.search, fn: function () { similarToPlaying(who); } }]).concat(eid ? [{ label: "עריכת שם ומבצע", icon: I.pen, fn: function () { editFromDock(); } }] : []);   /* the actions on the song are the menu's own items (ui/docs/menu.md), not buttons: one that cannot be used now is a disabled item */
        if (mi.length === 1) { mi[0].fn(); return; }   /* one action is not a menu (ui/docs/menu.md): the tap does it */
        menu(nmEl, mi, { head: head, up: true, ref: dock });   /* "אהבתי" first (owner 2026-11-27) */
      };
      openMenu();   /* a tap on the song in the player opens its menu: "אהבתי", "חיפוש מוסיקה", and the rest (owner 2026-11-27) */
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
      if (d.playing) ytSet("");   /* the page's player plays: the song opened on YouTube is no longer the one playing */
      document.querySelectorAll(".bio-tab[data-aud]").forEach(function (t) { t.classList.toggle("is-play", !!d.playing && ("|" + t.dataset.aud + "|").indexOf("|" + d.name + "|") >= 0); });
      document.querySelectorAll(".rcard[data-auds], .rcard[data-song]").forEach(function (c) {   /* THE playing state of a card (one state, the kit's .is-play): an exercise one of whose songs plays, a song card whose song plays */
        var on = !!d.playing && !!d.name && ("|" + (c.dataset.auds != null ? c.dataset.auds : c.dataset.song) + "|").indexOf("|" + d.name + "|") >= 0;
        if (c.classList.contains("is-play") !== on) c.classList.toggle("is-play", on);
      });
    });
    document.addEventListener("biosongrenamed", function (ev) {   /* a song was renamed: the player says the new name at once */
      var d3 = ev.detail || {};
      if (curName === d3.n) { curTitle = d3.t; curArtist = d3.a; }
      if (last && last.n === d3.n) { last.t = d3.t; last.a = d3.a; try { localStorage.setItem("biodanza.lastsong", JSON.stringify(last)); } catch (x) { /* not kept */ } }
      if (window.BioAudio && BioAudio.info) BioAudio.info(d3.n, d3.t, d3.a);
      sync();
    });
    var syncHide = 0;
    /* the download to the device stopped (owner 2026-11-26): the person is told, ONCE per stop, in the kit's error notice with "לנסות שוב".
       syncStop: the reason already told (cleared by a sync that ends done, or by the retry), so the background syncs that follow do not tell it again.
       No connection is not told: the round button already shows it (app-offline.md); the download starts again by itself when the connection is back. */
    var syncStop = "", stopOpen = false, stopNetHooked = false, STOP_WHY = { quota: "אין מספיק מקום", store: "הדפדפן לא שומר קבצים", server: "תקלה בשרת", cut: "החיבור נקטע" };
    function syncStopped(reason) {
      if (!window.RosterApp || !RosterApp.notice) return;
      var show = function (r) {
        if (stopOpen || syncStop === r) return;
        syncStop = r; stopOpen = true;
        RosterApp.notice("ההורדה למכשיר נעצרה" + (STOP_WHY[r] ? ", " + STOP_WHY[r] : ""), { kind: "error",
          action: { text: "לנסות שוב", run: function () { syncStop = ""; syncOffline(true); return Promise.resolve(); } },
          onClose: function () { stopOpen = false; } });
      };
      if (reason === "net" && RosterApp.net) {
        RosterApp.net.check().then(function (s) {
          if (s !== "off") { show("cut"); return; }
          syncStop = "off";
          if (!stopNetHooked) { stopNetHooked = true; RosterApp.net.on(function (n) { if (n === "on" && syncStop === "off") { syncStop = ""; syncOffline(true); } }); }
        });
        return;
      }
      show(reason || "other");
    }
    document.addEventListener("biooffline", function (ev) {   /* the songs coming down to the device: a ring around the round button's letter, filling while it works (RosterApp.sync) */
      var d2 = ev.detail || {}; clearTimeout(syncHide);
      if (d2.state === "done") { syncStop = ""; if (!d2.total) { syncIcon("", ""); return; } syncIcon("done", "כל המוסיקה במכשיר"); syncHide = setTimeout(function () { syncIcon("", ""); }, 8000); return; }
      if (d2.state === "stopped") { syncIcon("stop", d2.reason === "quota" ? "אין מקום במכשיר למוסיקה" : "ההורדה למכשיר נעצרה"); syncStopped(d2.reason); return; }   /* the kit takes the warn mark off by itself (app-status.md: no app timer) */
      if (!d2.total) { syncIcon("", ""); return; }
      syncIcon("run", "מוריד למכשיר " + d2.done + "/" + d2.total, d2);   /* done and total fill the ring on the round button */
    });
    setTimeout(histImport, 3000);
    function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
    /* THE PLAYER is the kit's (ui/docs/player.md, kit.css .rplayer): the kit lays it out, colours it, gives it its height (--player-h) and sets --bar-b from CSS, and /sheet.js
       puts it over every window. Here only its content and its state (data-state: idle, loading, playing, paused, error) are written, when something happens (no timer). */
    var RST = I.restart;   /* ⏮, as a line drawing */
    var waiting = false, waitName = "", errName = "", noFile = {}, shownT = "", shownA = "";   /* waitName: the song whose file is awaited (the kit's busy event); noFile: songs whose file is not in the bucket (404): they open on YouTube, as a card with no file does */
    var editOf = {};   /* the player's edit of each song, decided once per song, as its heart is (heartOf) */
    var dock = document.createElement("section"); dock.className = "rplayer raccent-2"; dock.dataset.state = "idle"; dock.setAttribute("aria-label", "נגן"); dock.setAttribute("popover", "manual"); dock.hidden = true;
    dock.innerHTML = volDock() + '<span class="rplayer__time" dir="ltr">0:00 / 0:00</span>' +
      '<button type="button" class="rbtn rbtn--icon rplayer__sec" data-rst aria-label="חזרה להתחלת השיר" title="חזרה להתחלת השיר" disabled>' + RST + '</button>' +
      '<button type="button" class="ricon-lg" aria-label="השמעה" title="השמעה">' + PLAY + '</button>' +
      '<input class="rrange rrange--seek" type="range" min="0" max="0" value="0" step="1" aria-label="מקום במוסיקה" disabled>' +
      '<button type="button" class="rplayer__info" aria-haspopup="menu"><span class="rplayer__title" dir="auto" aria-live="polite"></span><span class="rplayer__sub" dir="auto"></span></button>' +
      '<span class="rplayer__none">לא נבחרה מוסיקה</span>';   /* no heart in the player: "אהבתי" is the first item of the song's menu (owner 2026-11-27) */
    document.body.appendChild(dock);
    if (RosterSheet.raisePlayer) RosterSheet.raisePlayer();   /* the kit puts it in the top layer, over any window that opens (sheet.js) */
    document.addEventListener("biobusy", function (ev) { var pb = dock.querySelector(".ricon-lg"); waiting = !!ev.detail.on; waitName = waiting ? (ev.detail.name || "") : ""; if (waiting) errName = ""; if (waiting) pb.setAttribute("aria-busy", "true"); else pb.removeAttribute("aria-busy"); sync(); });   /* law 7 on the large icon: the song waits for its file */
    document.addEventListener("biofail", function (ev) { errName = (ev.detail && ev.detail.name) || ""; if (errName && ev.detail.status === 404) noFile[errName] = 1; sync(); });   /* 404: the file is not in the bucket, not a failure: the song stays, paused, and play opens it on YouTube */
    function ytOpen(n) {   /* a song with no file, from the player: its YouTube search, as its card opens it (cardPlay) */
      var t = (songInfo[n] && songInfo[n].t) || shownT, a = (songInfo[n] && songInfo[n].a) || shownA, hid = heartOf[n] || "";
      if (hid) ytSet(hid);
      window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent((t + " " + a).trim()), "_blank", "noopener");
    }   /* the song did not play: the sub line says so (decision 6), not a toast; play tries again */
    dock.querySelector("[data-rst]").addEventListener("click", function () { if (window.BioAudio && BioAudio.seek) { BioAudio.seek(0); if (BioAudio.commitSeek) BioAudio.commitSeek(); } });   /* back to the start of the song */
    function playMain() {
      if (!window.BioAudio) return;
      if (errName && noFile[errName]) { ytOpen(errName); return; }   /* no file: YouTube, never a retry that fails again */
      if (errName) { BioAudio.tap(errName); return; }   /* the error: the same song again */
      var w = dock.querySelector(".rplayer__info").dataset.who || "";   /* the song the player shows is the one the button is for */
      if (loaded && (!w || w === curName)) { BioAudio.playPause(); return; }
      if (w) { BioAudio.tap(w); return; }
      if (last) BioAudio.tap(last.n);   /* nothing loaded yet: the remembered song is loaded and played */
    }
    dock.querySelector(".ricon-lg").addEventListener("click", playMain);
    function addCurState() {   /* where the song that plays can be added: an exercise that is open and does not hold it, or the open vivencia's list that does not hold it */
      var nmA = loaded ? curName : (last && last.n), idA = liveItem && liveItem.id, itA = idA && state.items && state.items.filter(function (x) { return x.id === idA; })[0];
      var exOpen = !!(nmA && itA && document.querySelector("#imus [data-addm]"));
      var vivList = !exOpen && !!nmA && !!state.viv && !!state.items && canEdit() && !!document.querySelector("#list[data-fab-room]");
      var inViv = function () {   /* is the song already somewhere in this vivencia: an exercise's song or option, the start or the end music */
        if (!vivList || !state.viv) return false;
        var has = function (m) { return m && m.audio_object === nmA; };
        return (state.items || []).some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) ||
          ["start", "end"].some(function (k) { return (recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); }); });
      };
      return { nm: nmA, it: itA, exOpen: exOpen, show: exOpen ? !optList(itA).some(function (m) { return m.audio_object === nmA; }) : vivList && !inViv() };
    }
    function addCurShow() { return addCurState().show; }
    function addCur() {   /* "הוספה" of the title-tap menu: the picker asks where, a vivencia or an exercise (no full button in the fixed bar) */
      var s = addCurState(), nm = s.nm, it = s.it, exOpen = s.exOpen;
      if (!nm || (!exOpen && !state.viv)) return;
      var mp = api("/rest/v1/music?audio_object=eq." + encodeURIComponent(nm) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1");   /* the picker opens at once (law 7); the song's row is asked for meanwhile */
      chooseDest((songInfo[nm] && songInfo[nm].t) || curTitle || "המוסיקה", { vivId: state.viv && state.viv.id, itemId: exOpen && it ? it.id : null }, function (d) {
        return mp.then(function (rows) { var m = rows && rows[0]; if (!m) { toast("המוסיקה לא נמצאה"); return; } return addMusicTo(m, d); }).then(null, fail);
      });
    }
    (function () { var r = dock.querySelector(".rrange--seek");
      /* the bar is the kit's seek bar (/range.js), its value in seconds: while it is held the playback does not write it and the time follows the thumb (sync); let go (change), the song moves there, with its second of crossfade */
      r.addEventListener("input", function () { sync(); });
      r.addEventListener("change", function () { if (window.BioAudio && BioAudio.seek && +r.max > 0) { BioAudio.seek(r.value / r.max); if (BioAudio.commitSeek) BioAudio.commitSeek(); } });
    })();
    /* SPACE plays and pauses from anywhere (owner 2026-11-26, decision 8), except in a text field or editable text, on a button, or inside a menu or a window: there space does its own thing */
    document.addEventListener("keydown", function (e) {
      if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || e.repeat || dock.hidden) return;
      var tg = e.target;
      if (tg && tg !== document.body && tg.closest && (tg.isContentEditable || tg.closest("input:not([type=range]), textarea, select, button, a[href], [role=button], [role=menuitem], [contenteditable], .rmenu, dialog[open], .rpanel"))) return;
      if (RosterMenu.current()) return;
      if (dock.dataset.state === "idle") return;
      e.preventDefault(); playMain();
    });
    function sync() {
      var on = !!(window.FLOA_AUTH && FLOA_AUTH.signedIn());
      [dock].forEach(function (d) {
        if (d.hidden === on) d.hidden = !on;   /* signed in: the player is there (and --bar-b with it, kit CSS) */
        var vtE = document.getElementById("vtimer");   /* wide screen: the time left of whichever song of this vivencia plays, in the header of the list; and, on every screen, the number of the exercise that plays beside the name */
        if (vtE) {
          var vOn = !!(playing && loaded && curD > 0 && state.viv && state.items && (function (n) { var has = function (m) { return m && m.audio_object === n; };
            return state.items.some(function (x) { return has(x.music) || (x.item_music_options || []).some(function (o) { return has(o.music); }); }) || ["start", "end"].some(function (k) { return (recvCache[state.viv.id + "|" + k] || []).some(function (o) { return has(o.music); }); }); })(curName));
          if (vOn && vtE) { var vTxt = clk(Math.max(0, Math.ceil(curD - curT))); if (vtE.textContent !== vTxt) vtE.textContent = vTxt; }
          if (vtE) timerToggle(vtE, vOn);
        }
        var tmE = document.getElementById("itimer");
        if (tmE) {
          var itX = liveItem && state.items ? state.items.filter(function (x) { return x.id === liveItem.id; })[0] : null;
          var tOn = !!(playing && loaded && curD > 0 && itX && optList(itX).some(function (m) { return m.audio_object === curName; }));
          if (tOn) { var tTxt = clk(Math.max(0, Math.ceil(curD - curT))); if (tmE.textContent !== tTxt) tmE.textContent = tTxt; }
          timerToggle(tmE, tOn);
        }
        /* what the player shows: the song that failed, the one loaded, or the one remembered from the last visit (paused, decision 10); none: idle */
        /* ONE song is in the player at a time (owner 2026-11-26, "פתאום אין לב ויש לב"): the one that failed, else the one whose file is awaited, else the one loaded, else the one remembered.
           While a new song waits, the player already names it (it never falls back to the song before it and then comes again), so a tap, a retry or an error changes the info area once */
        var who = errName || (waiting && waitName) || (loaded ? curName : (last && last.n)) || "";
        var mine = loaded && who === curName, gone = !!errName && !!noFile[errName], err = !!errName && !gone;   /* mine: the song loaded is the one shown (its time, its bar); gone: no file, not an error */
        var kn = songInfo[who] || (last && last.n === who ? { t: last.t, a: last.a } : null);
        shownT = !who ? "" : mine ? (curTitle || (kn && kn.t) || "מוסיקה") : ((kn && kn.t) || "מוסיקה");
        shownA = !who ? "" : mine ? (curArtist || (kn && kn.a) || "") : ((kn && kn.a) || "");
        var stN = !who ? "idle" : waiting && !playing ? "loading" : err ? "error" : playing && mine ? "playing" : "paused";
        if (d.dataset.state !== stN) d.dataset.state = stN;
        var b = d.querySelector(".ricon-lg"), t = d.querySelector(".rplayer__time"), r = d.querySelector(".rrange--seek"), held = window.RosterRange && RosterRange.held(r), tNow = held ? +r.value : mine ? curT : 0, dd0 = mine ? curD : (last && last.n === who ? last.d : 0), s = window.matchMedia("(width < 760px)").matches ? clk(Math.max(0, Math.ceil(dd0 - tNow))) : clk(tNow) + " / " + clk(dd0), nm = d.querySelector(".rplayer__info");   /* the bar held: the time is the thumb's; a song not loaded (waiting, failed) shows its own time, not the time of the one before it */
        r.disabled = !mine || !(curD > 0) || !!errName; var rs = d.querySelector("[data-rst]"); if (rs) rs.disabled = r.disabled;
        var pl = playing && mine && !errName, lab = pl ? "עצירה" : "השמעה"; if (b.getAttribute("aria-label") !== lab) { b.setAttribute("aria-label", lab); b.title = lab; b.innerHTML = pl ? PAUSE : PLAY; }
        b.classList.toggle("is-play", pl);
        if (t.textContent !== s) t.textContent = s;
        var tEl = nm.querySelector(".rplayer__title"), sEl = nm.querySelector(".rplayer__sub"), subT = err ? "לא הצלחנו להשמיע" : shownA;
        if (tEl.textContent !== shownT) { tEl.textContent = shownT; tEl.title = shownT; }   /* aria-live on the title only: a new song is said, the time is not */
        if (sEl.textContent !== subT || err !== !!sEl.firstElementChild) { sEl.textContent = subT; if (err) sEl.insertAdjacentHTML("afterbegin", I.warn); sEl.title = subT; }   /* an error: the warn symbol before the words, no colour of its own (ui/docs/player.md) */
        if (nm.dataset.who !== who) {   /* a new song, and only then: its heart and its edit, decided once per song (heartOf, editOf), never on a time tick */
          nm.dataset.who = who;
          var hb = d.querySelector(".rplayer__heart"), lid = heartOf[who] != null ? heartOf[who] : musicIdOf(who);
          if (editOf[who]) nm.setAttribute("data-edit", editOf[who]); else nm.removeAttribute("data-edit");
          dockHeart(hb, lid);   /* known: at once, and it stays; unknown: hidden until asked below, once */
          if (lid && heartOf[who] !== lid) { heartOf[who] = lid; keepHearts(); }
          if (who && heartOf[who] == null && window.FLOA_AUTH && FLOA_AUTH.signedIn()) api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id,in_catalog,audio_object&limit=20").then(function (rows) {
            rows = (rows || []).filter(function (x) { return x.audio_object === who; });
            var lk = rows.filter(function (x) { return likes[x.id]; })[0];
            heartOf[who] = rows[0] ? (lk || rows[0]).id : "";   /* the same file in more than one row: the one I loved, as its card shows it; no row: no heart, decided */
            keepHearts();
            if (rows[0] && !rows[0].in_catalog) editOf[who] = rows[0].id;
            if (nm.dataset.who !== who) return;
            if (editOf[who]) nm.setAttribute("data-edit", editOf[who]);
            dockHeart(hb, heartOf[who]);
          }, function () { /* the name stays plain; asked again the next time the song comes */ });
        }
        if (!held) { var mx = String(mine && curD > 0 ? Math.round(curD) : 0); if (r.max !== mx) r.max = mx; if (window.RosterRange) RosterRange.set(r, mine && curD > 0 ? Math.floor(curT) : 0); }   /* the seek bar in seconds; the kit's set() paints the fill and the time text, and leaves a held bar alone */
      });
    }
    setTimeout(sync, 0);   /* the first paint once the whole script has run (what sync reads is declared further down) */
    /* THE ARROWS ARE GLOBAL (owner 2026-11-26, ui/docs/slider.md): right and left move the song 5 seconds (Shift 15), up and down are the volume (Shift for steps of five),
       wherever the focus is: on nothing, on the seek bar or on the volume. A focused slider takes no step of its own (its native step is prevented), so each press moves once.
       The one exception: typing in a text field or an editable text, where the arrows move the caret. */
    function arrowsOwnedByText(tg) { return !!tg && !(tg.classList && tg.classList.contains("rrange")) && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)); }
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, onRange = !!(tg && tg.classList && tg.classList.contains("rrange"));
      if (arrowsOwnedByText(tg)) return;
      if (onRange) e.preventDefault();   /* the slider's own step never runs: the press is the volume's */
      if (!onRange && ((tg && tg.closest && tg.closest("dialog[open]")) || RosterMenu.current())) return;   /* a popup or a menu with the focus inside keeps its own arrows (its list) */
      if (!window.BioAudio || !BioAudio.volume) return;
      e.preventDefault();
      volState.v = BioAudio.volume((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01)); paintVol();   /* the sound and the gauge are the answer: no message */
    });
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target, onRange = !!(tg && tg.classList && tg.classList.contains("rrange"));
      if (arrowsOwnedByText(tg)) return;
      if (onRange) e.preventDefault();   /* the slider's own step never runs: the press is the song's */
      if (!loaded || (!onRange && RosterMenu.current()) || !window.BioAudio || !BioAudio.skip) return;
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
      if (dd.playing && errName && dd.name === errName) errName = "";   /* the song that failed now plays */
      sync();
    });
  })();
  /* the player's bar is the only song bar of the app (a list or an exercise has none of its own): its fill and its value are the kit's (/range.js, set() in sync above) */
  /* the heart: the songs I loved. At the right edge of a song's row, in line with the play tile and with the back button above. */
  function heartBtn(m) {
    var on = !!likes[m.id];
    return '<button type="button" class="rbtn rbtn--icon rbtn--accent rbtn--fill raccent-2" data-like="' + m.id + '" aria-pressed="' + on + '" aria-label="מוסיקה שאהבתי" title="מוסיקה שאהבתי">' + I.heart + '</button>';   /* on: aria-pressed, the kit fills the heart; the name never changes with the state (ui/docs/choice.md, decision 5) */
  }
  function paintHearts(id) {
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", !!likes[id]);   /* only the state: the name stays */
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
    document.querySelectorAll('[data-like="' + id + '"]').forEach(function (b) { RosterBusy(b, req); });   /* law 7: the heart shows the wait until the server answers */
  }
  /* the heart of a song card: a loved song that is not playing is unmarked only after the kit's confirm popup (closing it is the cancel); on the red card of the song that plays it toggles freely */
  var RED_CARD = '.is-play';   /* the card's one playing state */
  function confirmUnlike(id, card, anchor) {
    RosterSheet.confirm({ title: "הסרת סימון אהבתי", text: "להסיר את הסימון אהבתי מהשיר?", action: "הסרת הסימון",anchor: anchor, run: function (dlg) {
      dlg.close(); toggleLike(id);
      var lst = card && card.closest("#likl");   /* in my loved music the card leaves the list: the kit's list takes it out (its focus, its empty state with role=status) */
      if (lst && lst.__rlist) lst.__rlist.remove(id);
    } });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-like]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var id = b.dataset.like, card = b.classList.contains("bio-lk") ? b.closest(".rcard") : null;
    if (!id) return;
    if (likes[id] && ((card && !card.matches(RED_CARD)) || b.hasAttribute("data-like-confirm"))) { confirmUnlike(id, card, b); return; }   /* the player's heart asks too (owner 2026-11-26) */
    toggleLike(id);
  }, true);
  /* the player's heart: the song that plays, by its music id (found among what this page already holds, else asked by its file) */
  function musicIdOf(n) {
    var f = ""; if (!n) return f;
    var chk = function (m) { if (!f && m && m.id && m.audio_object === n) f = m.id; };
    (state.items || []).forEach(function (x) { chk(x.music); (x.item_music_options || []).forEach(function (o) { chk(o.music); }); });
    Object.keys(recvCache).forEach(function (k) { (recvCache[k] || []).forEach(function (o) { chk(o.music); }); });
    return f;
  }
  function dockHeart(b, id) { if (!b) return; b.dataset.like = id || ""; b.hidden = !id; if (id) paintHearts(id); }
  /* the heart on a song card: the same button, only placed in the card's bottom right corner (see .bio-lk) */
  function cardHeart(m) {
    return m && m.id ? heartBtn(m).replace(' rbtn--fill"', ' rbtn--fill bio-lk"').replace('style="flex:none;', 'style="') : "";
  }
  /* the heart of an exercise: in the exercise page's header, and in my list of loved exercises */
  function heartBtnEx(exId, cls) {
    var on = !!likesEx[exId];
    return '<button type="button" class="rbtn rbtn--icon rbtn--accent rbtn--fill ' + (cls || "") + '" data-likex="' + exId + '" aria-pressed="' + on + '" aria-label="תרגיל שאהבתי" title="תרגיל שאהבתי">' + I.heart + '</button>';
  }
  function paintHeartsEx(id) {
    document.querySelectorAll('[data-likex="' + id + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", !!likesEx[id]);   /* only the state: the name stays */
    });
  }
  /* taking a like off asks first, in the kit's popup with ONE action (closing it is the cancel): the same for a vivencia and an exercise as for a song */
  function askUnlike(text, anchor, run) {
    RosterSheet.confirm({ title: "הסרת סימון אהבתי", text: text, action: "הסרת הסימון",anchor: anchor, run: function (dlg) { dlg.close(); run(); } });
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
    document.querySelectorAll('[data-likex="' + id + '"]').forEach(function (x) { RosterBusy(x, req); });
    var lx = was && b.closest("#likx");   /* in my loved exercises the card leaves the list (the kit's list: its focus, its empty state) */
    if (lx && lx.__rlist) lx.__rlist.remove(id);
  }, true);
  /* the red button beside the countdown: to the exercise of this vivencia that holds the song now playing (or to the start or the end music) */
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("#vtimer"); if (!b || !state.viv || !state.items) return;   /* a tap on the timer goes to the exercise that plays */
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
  /* the heart of a vivencia, in its header: a toggle and the first foldable action (data-pri 1), never the main action (no rbtn--accent):
     the kit's toggle look, --primary and filled when liked; folded into "עוד" it is the check item "אהבתי" */
  function heartBtnViv(id, cls) {
    var on = !!likesViv[id], tt = "ויוונסיה שאהבתי";   /* the name never changes with the state: aria-pressed says it */
    return '<button type="button" class="rbtn rbtn--icon rbtn--fill ' + (cls || "") + '" data-likev="' + id + '" data-pri="1" data-menu-label="אהבתי" data-menu-check aria-pressed="' + on + '" aria-label="' + tt + '" title="' + tt + '">' + I.heart + '</button>';
  }
  function paintHeartsViv(id) {
    document.querySelectorAll('[data-likev="' + id + '"]').forEach(function (b) {
      b.setAttribute("aria-pressed", !!likesViv[id]);   /* only the state: the name stays */
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
    document.querySelectorAll('[data-likev="' + id + '"]').forEach(function (x) { RosterBusy(x, req); });
  }, true);
  window.toast = window.toast || toast;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-yt]"); if (!a) return;
    ytSet(a.dataset.yt);
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
  /* a draft in a field: no colour (owner 2026-11-26, ui/docs/chip.md): the kit's plain chip with the word "טיוטה" under the field's line, in the field's status line (a row of chips) */
  var DRAFT_FIELD = ' data-draft';
  var DRAFT_CHIP = '<span class="rlayout rlayout--row rlayout--wrap rflow" data-draft-mark><span class="rchip" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק">טיוטה</span></span>';
  /* THE EMPTY STATE (the kit's .rempty, CSS only): the app's icon, a title, an optional line and an optional action. The icon is the curve (a vivencia); an empty state about
     exercises ("בחרו תרגיל", no exercise) passes I.exercise. The kit centres it in its area: no style, no class of the app */
  function ph(title, text, icon, act) { return '<div class="rlayout rempty">' + (icon || I.curve) + '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '') + (act || '') + '</div>'; }
  function phPick() { return phEnd(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן", I.exercise)); }   /* the empty side of a computer: no exercise chosen */
  function phEnd(html) { return html; }   /* the end side's empty state has no header of its own: the app menu sits in the start pane's header, beside the divider (owner 2026-11-26) */
  /* a load that failed: the empty state with ONE action, "ניסיון נוסף", that asks again without reloading the page (fn draws the area loading again and loads) */
  var retryFns = {}, retryN = 0;
  function phErr(title, fn) { var k = "r" + (++retryN); retryFns[k] = fn; return ph(title, "בדקו את החיבור ונסו שוב.", null, '<button type="button" class="rbtn" data-retry="' + k + '">ניסיון נוסף</button>'); }
  function busyAgain(el) { if (el) { el.innerHTML = ""; el.classList.add("rload"); el.setAttribute("aria-busy", "true"); } return el; }   /* the area waits again (the kit's loading state) */
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-retry]"); if (!b) return; var fn = retryFns[b.dataset.retry]; delete retryFns[b.dataset.retry]; if (fn) fn(); });
  function uuid() { return crypto.randomUUID(); }
  var volState = { on: true, v: 1 };   /* the volume gauge in the headers: always shown */
  try { var sv0 = parseFloat(localStorage.getItem("biodanza.volume")); if (sv0 >= 0 && sv0 <= 1) volState.v = sv0; } catch (x) { /* full */ }
  function paintVol() {
    document.querySelectorAll(".rplayer__vol").forEach(function (g) {
      var r = g.querySelector("input"), b = g.querySelector("button"), pc = Math.round(volState.v * 100);
      if (window.RosterRange) RosterRange.set(r, pc); else if (String(r.value) !== String(pc)) r.value = pc;   /* the kit writes the value and its fill (--p on the bar itself) */
      var mu = volState.v === 0; if (b.dataset.mu !== (mu ? "1" : "0")) { b.dataset.mu = mu ? "1" : "0"; b.innerHTML = mu ? SPK0 : SPK; b.setAttribute("aria-label", mu ? "ביטול השתקה" : "השתקה"); b.title = b.getAttribute("aria-label"); }
    });
  }
  /* the gauge moves with a drag or a click (mouse or finger) along it, and with the arrow keys when it has focus */
  function setVol(v) {
    v = Math.max(0, Math.min(1, v));
    if (window.BioAudio && BioAudio.volume) volState.v = BioAudio.volume(v - BioAudio.volume(0)); else volState.v = Math.round(v * 100) / 100;
    paintVol();
  }
  document.addEventListener("input", function (e) { var r = e.target; if (r && r.type === "range" && r.closest && r.closest(".rplayer__vol")) { var v = r.value / 100; if (v > 0) volBack = v; setVol(v); } });
  document.addEventListener("click", function (e) { var b = e.target.closest && e.target.closest("[data-vmute]"); if (!b) return; if (volState.v > 0) { volBack = volState.v; setVol(0); } else setVol(volBack || 0.5); });
  /* on a wide screen the volume lives in the player pill, between the bar and the X */
  var SPK = I.volume, SPK0 = I.mute;
  document.querySelectorAll(".rplayer__vol [data-vmute]").forEach(function (b) { b.removeAttribute("data-mu"); }); paintVol();   /* the player is drawn before these icons exist: its speaker is drawn again now they do */
  var volBack = 0.5;   /* the level a press on the speaker brings back after it was muted */
  /* the volume of the player: a speaker (press it to mute and to unmute) and a slider, on a wide screen only */
  function volDock() { var v = typeof volState === "object" ? volState.v : 1; return '<div class="rplayer__vol"><button type="button" class="rbtn rbtn--icon" data-vmute aria-label="השתקה" title="השתקה">' + (v ? SPK : SPK0) + '</button><input class="rrange" type="range" min="0" max="100" step="1" value="' + Math.round(v * 100) + '" aria-label="עוצמת שמע"></div>'; }
  /* a screen's header, the kit's .rhead (ui/docs/header.md): [lead] [back] the title and its description in one box, [after: a mark at the end of the title's text] [trail: live value and actions] */
  function head(title, sub, back, trail, lead, after, sel) {   /* sel: the screen is an opened item's detail (a vivencia): its name and description can be selected (ui/docs/window.md "בחירת טקסט", data-rselect) */
    var rs = sel ? ' data-rselect' : '';
    var h1 = '<h1 class="rhead__title" dir="auto"' + rs + ' title="' + esc(title) + '">' + esc(title) + '</h1>';
    return '<header class="rhead">' + (lead || '') + (back ? '<button class="rbtn rbtn--icon" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +   /* lead: one back or X only, never an action */
      '<div class="rhead__text"><span class="rhead__tw">' + (after ? '<span class="rhead__tl">' + h1 + after.replace('class="rbtn ', 'class="rhead__mark rbtn ') + '</span>' : h1) + (sub ? '<span class="rhead__sub" dir="auto"' + rs + '>' + esc(sub) + '</span>' : '') + '</span></div>' +   /* the mark (the title's pencil) follows the last word of the title, whatever the description's width: the kit's title line (ui/docs/header.md, owner 2026-11-27) */
      (trail || '') + '</header>';
  }
  /* the header of one exercise: buttons only, each with its word. Previous and the list on the right, next on the left. The name is the field below. */
  /* a phone: the current exercise's name in the strip is a button that renames it in the kit's short window (owner 2026-11-27: no pencil in the strip). The field is
     bound to the open vivencia's exercises source (check on save, the same source the computer's pencil writes); the strip shows the new name at once */
  function itemNamePop(it) {
    if (!canEdit()) return;
    var cur = state.items.filter(function (x) { return x.id === it.id; })[0] || it, src = live.items && state.viv && live.vid === state.viv.id ? live.items : null;
    var paintName = function (t) { var el = document.getElementById("ina"); if (el && el.hasAttribute("data-namepop")) { el.textContent = t; el.setAttribute("data-t", t || "ללא שם"); el.setAttribute("aria-label", "עריכת שם התרגיל: " + t); } };
    RosterSheet.confirm({ id: "inameDlg", title: "פרטי התרגיל", action: "שמירה",
      fields: [src ? { name: "title", label: "שם התרגיל", value: itemName(cur), required: true, source: src, key: cur.id, col: "title" } : { name: "title", label: "שם התרגיל", value: itemName(cur), required: true }],
      submit: function (val) {
        var t = val.title;
        var done = function () { cur.title = t; it.title = t; paintName(t); };
        return src ? done() : api("/rest/v1/vivencia_items?id=eq." + cur.id, { method: "PATCH", prefer: "return=minimal", json: { title: t } }).then(done, shortFail);
      } });
  }
  function namePen() { return canEdit() ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-namepen aria-label="עריכת שם התרגיל" title="עריכת שם התרגיל">' + I.pen + '</button>' : ""; }   /* the pencil after the exercise's name: only it starts the editing */
  function itemHead(hasPrev, hasNext, where, exId, nameText, ro, roLabel, inBack, numText, roPlus, tabs, playM) {
    var nav = !wide() && !ro;   /* beside the list there are no previous and next buttons: the list is the way around */
    var tabX = function (t, i) {   /* every tab carries its play and heart: only the one in the middle shows them, the one that slides in fades them in as the other fades them out (owner 2026-11-25) */
      if (!nav || !tabs || !t) return "";
      var x = i === 2 ? null : (state.items || []).filter(function (y) { return y.id === t.id; })[0]; if (i !== 2 && !x) return "";
      var m = i === 2 ? playM : x.music, ex = i === 2 ? exId : (x.exercise_id || ("item:" + x.id));
      return (m && m.audio_object ? '<span class="bio-tab__x bio-tab__x--play">' + bigPlay(m) + '</span>' : '') + '<span class="bio-tab__x bio-tab__x--heart">' + heartBtnEx(ex, "") + '</span>';
    };   /* a phone: the play and the heart ride on the number of this exercise (owner 2026-11-25) */
    if (nav && tabs) {   /* a phone: no arrows and no name here, only the number and the countdown, and under them the tabs of the exercises around it (the name is the first field of the page) */
      return '<header class="bio-ihead bio-ihead--m"><nav class="bio-tabs" aria-label="התרגילים"><div class="bio-tabs__track">' + tabs.map(function (t, i) { return '<span class="bio-tab' + (i === 2 ? ' is-cur' : '') + (playsIn(t && t.a) ? ' is-play' : '') + '"' + (i === 0 || i === 4 ? ' data-far' : '') + (t && t.a ? ' data-aud="' + esc(t.a) + '"' : '') + '>' + (tabX(t, i) ? '<span class="bio-tab__nw"><b class="bio-tab__n">' + esc((t && t.n) || "") + '</b>' + tabX(t, i) + '</span>' : '<b class="bio-tab__n">' + esc((t && t.n) || "") + '</b>') + '<span class="bio-tab__g">' + (i === 2 ? '<span class="bio-tab__t" id="ina" dir="auto" data-t="' + esc((t && t.t) || "ללא שם") + '"' + (canEdit() ? ' role="button" tabindex="0" data-namepop aria-label="' + esc("עריכת שם התרגיל: " + ((t && t.t) || "")) + '"' : '') + '>' + esc((t && t.t) || "") + '</span>' :'<span class="bio-tab__t" data-t="' + esc((t && t.t) || "") + '">' + esc((t && t.t) || "") + '</span>') + (i === 2 && t && t.id && t.f ? (function () { var cur = state.items.filter(function (x) { return x.id === t.id; })[0]; return cur ? facChip(cur, " bio-tab__f") : ""; })() : t && t.f ? '<button type="button" class="rbtn rbtn--text bio-tab__f" disabled tabindex="-1" data-fac-label="x">' + esc(t.f) + '</button>' : '') + '</span></span>'; }).join("") + '</div></nav></header>';
    }
    var arrow = function (act, ico, label, off) { return '<button class="rbtn rbtn--icon" data-act="' + act + '" aria-label="' + label + '" title="' + label + '"' + (off ? " disabled" : "") + '>' + ico + '</button>'; };
    return '<header class="rhead' + (ro ? '' : ' bio-ihead') + '">' + (wide() && !ro ? '<button type="button" class="rbtn rbtn--icon" data-act="closeIt" aria-label="סגירת התרגיל" title="סגירת התרגיל">' + I.x + '</button>' : "") + (nav ? arrow("prevW", I.back, "הקודם", !hasPrev) : "") +   /* the X is the lead slot (the right); the add button is after the exercise's name, toward the left */
      '<div class="rhead__text">' + (numText ? '<span class="bio-inum" aria-hidden="true">' + esc(numText) + '</span>' : "") + '<h1 id="ina" class="rhead__title" dir="auto" title="' + esc(nameText || "") + '">' + esc(nameText || "") + '</h1>' + (ro ? "" : namePen()) + '</div>' +   /* the name, edited in place from its pencil (RosterField.inline, ui/docs/realtime.md "עריכה במקום מעיפרון") */
      (ro && roLabel ? '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-act="doswap" aria-label="' + esc(roPlus ? catAddName() : roLabel) + '" title="' + esc(roPlus ? catAddName() : roLabel) + '">' + (roPlus ? I.plus : I.swap) + '</button>' : "") +   /* one name at every width (catAddName) */
      (ro && !wide() && exId ? '<span class="rhead__acts">' + heartBtnEx(exId, "").replace(' data-likex=', ' data-pri="1" data-menu-label="אהבתי" data-menu-check data-likex=') +
        '<button type="button" class="rbtn rbtn--icon" data-act="xmore" data-rmore="fold" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button></span>' : "") +   /* a phone: the catalog exercise's heart is in its header too (owner 2026-11-26), an adaptive action (the kit's RosterHeader): it folds into "עוד" when it does not fit. On a computer the panel's decor puts it beside the plus */
      "" + "" + (ro || wide() ? "" : '<span id="itimer" class="rhead__live" hidden aria-live="off"></span>') + (nav ? arrow("nextW", I.fwd, "הבא", !hasNext) : "") + (wide() && !ro && exId && !(playM && playM.audio_object) ? '<span class="rhead__acts">' + heartBtnEx(exId, "") + '</span>' : "") + '</header>';   /* a computer: with a song, the heart sits beside the big play on the page (#iplay), not here */
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".rhead #vtimer { cursor: pointer } .bio-inum { flex: none; font: var(--fw-bold) var(--fs-l)/var(--lh-tight) var(--font); font-variant-numeric: tabular-nums }    [data-catopen] { background: transparent !important; border-color: transparent !important; box-shadow: none !important; color: var(--primary) !important } .rfield:has(> .rf-rich[contenteditable=true]), .rfield:has(> .rf-rich[contenteditable=true]) > *, .rf-rich[contenteditable=true], .rf-rich[contenteditable=true] * { cursor: text !important } .rf-rich [data-mention] { cursor: default !important } @keyframes bioTin { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } } @keyframes bioTout { from { opacity: 1; transform: none } to { opacity: 0; transform: translateY(-8px) } } #vtimer.is-in, #itimer.is-in { animation: bioTin var(--t-base) var(--ease) both } #vtimer.is-out, #itimer.is-out { animation: bioTout var(--t-base) ease-in both } @media (prefers-reduced-motion: reduce) { #vtimer.is-in, #itimer.is-in, #vtimer.is-out, #itimer.is-out { animation: none } } .rf-rich b, .rf-rich strong { color: var(--text) !important } [data-opening] .rfield > span:first-child { transform: translateY(calc(var(--rf-label-top) * -1)) !important; inset-inline-end: 0 !important; pointer-events: none; transition: opacity var(--t-base) var(--ease) } [data-opening] .rfield:is([data-rf=\"v\"], :not([data-rf=\"e\"]):has(> .rf-rich:not(:empty))) > span:first-child { opacity: 0 } [data-opening] .rfield > .rf-rich { padding-top: 0 } .bio-open { display: flex; flex-direction: column; gap: var(--gap) } [data-recv] [data-audio] { display: none !important }         [data-audio]:not(.ricon-lg) { --play-in: var(--on-primary) }   .rcard, .rcard * { user-select: none; -webkit-user-select: none }   /* a card is pressed and dragged, never selected as text */";
    document.head.appendChild(st);
    /* the header's data-scrolled (its soft edge while the list under it is scrolled) is written by the kit's one helper in /sheet.js */
  })();
  /* the exercise as a pager: drag the page sideways to go to the next or the previous one (to the right = the next, as in a right to left book); the page follows the finger, a short drag springs back */
  function attachPager(pg, to, el) {   /* el: where the finger is (default: the page itself); the page moves either way */
    el = el || pg; var ac = new AbortController(), sg = { signal: ac.signal };
    var fw = getComputedStyle(pg).direction === "rtl" ? 1 : -1;   /* the finger's way to the next page: right to left (RTL: the next one waits on the inline-end side) */
    var x0 = 0, y0 = 0, t0 = 0, dx = 0, mode = 0;
    el.addEventListener("pointerdown", function (e) {
      if (el.querySelector(".rfield--inline") || pg.querySelector(".rfield--inline")) return;   /* a name edited in place: no swipe until it ends (ui/docs/realtime.md "עריכה במקום מעיפרון") */
      if (e.pointerType !== "mouse" && window.RosterSwipe && RosterSwipe.fromEdge(e.clientX)) { mode = 0; return; }   /* a finger from the screen's edge (either side) is the system's Back: the page stays still and the popup closes the usual way (/swipe.js) */
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
      pg.style.transform = "translateX(" + ((dx * fw > 0 ? to.next : to.prev) ? dx : dx * 0.3) + "px)";   /* no page that way: it only gives a little */
      if (to.drag) to.drag((dx * fw > 0 ? to.next : to.prev) ? dx : dx * 0.3, pw);
    }, sg);
    function end() {
      if (mode !== 2) { mode = 0; return; }
      mode = 0;
      var w = pg.getBoundingClientRect().width || 320, v = Math.abs(dx) / Math.max(1, performance.now() - t0), go = dx * fw > 0 ? to.next : to.prev;
      if (go && (Math.abs(dx) > w * 0.22 || v > 0.5)) {
        pg.style.transition = "transform .16s ease-in"; pg.style.transform = "translateX(" + (dx > 0 ? w : -w) + "px)";
        if (to.leave) to.leave(dx * fw > 0 ? 1 : -1);   /* 1: to the next page, -1: to the previous one */
        setTimeout(go, 150);
      } else { pg.style.transition = "transform var(--t-base) var(--ease)"; pg.style.transform = ""; if (to.settle) to.settle(); }
    }
    el.addEventListener("touchmove", function (e) { if (mode === 2 && e.cancelable) e.preventDefault(); }, { passive: false, signal: ac.signal });   /* a sideways drag is the page's, not the browser's: left to the browser it ends as a fling, and the next tap only stops that fling instead of clicking */
    el.addEventListener("pointerup", end, sg); el.addEventListener("pointercancel", end, sg);
    return function () { ac.abort(); };   /* the listeners go, when the exercise changes and the header stays */
  }
  /* THE KIT'S NOTICE (owner 2026-11-26): a short window anchored to the app menu's round button (/app.js, RosterApp.notice). Only errors and what the
     screen cannot show; a success the screen already shows is never said. These few are information, the rest are errors. */
  var INFO = { "הוויוונסיה כבר לא זמינה": 1, "נוספת לוויוונסיה כצופה": 1, "אין עוד מובילים בשיתוף": 1, "כל המובילים כבר כאן": 1 };
  function toast(msg) { if (window.RosterApp && RosterApp.notice) RosterApp.notice(msg, { kind: INFO[msg] || /^הקישור הועתק/.test(msg) ? "info" : "error" }); else if (window.console) console.info(msg); }
  function fail(e) {
    console.error(e);
    if (window.RosterApp && RosterApp.session && RosterApp.session.failed(e)) return;   /* the session ended: a field's change is kept and sent after the sign-in, and the kit's window asks to sign in */
    if (e && !e.status && !e.signedOut && !e.offline && window.RosterApp && RosterApp.net) RosterApp.net.check();   /* no answer at all: maybe the connection is gone (the kit's round button says so) */
    toast("משהו השתבש, נסו שוב");
  }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  function syncIcon(mode, text, d) {   /* the download to the device: on the app menu's round button, the app's status slot (owner 2026-11-26): a ring that fills while songs come down, then completes and fades */
    if (window.RosterApp && RosterApp.sync) RosterApp.sync(d ? { state: mode, text: text, done: d.done, total: d.total } : mode, text);
  }
  function syncPlace() { /* the download's mark left the player for the round button (RosterApp.sync): nothing to place */ }
  function asSurface(el, o) { return window.RosterLayout && RosterLayout.surface ? RosterLayout.surface(el, o) : el; }   /* the kit's in-place surface (/layout.js); a kit file kept from before it (an offline copy) only leaves the slot classes out */
  function show(html, wire, pane) { if (!wide() && pane === "d") return itemSheet(html, wire);   /* narrow: the exercise is a popup from the bottom, not a page */
    var isPrev = html.indexOf('data-act="doswap"') >= 0;   /* a catalog exercise (it has the add button) is the one thing on the left that stays lit while the catalog is open */
    if (wide() && ((pane === "d" && (isPrev || !catPanel)) || !state.pickerShow)) pd.classList.remove("bio-dim");   /* anything new on the left, or the catalog closed, and the exercise is lit again */
    var t = wide() && pane === "d" ? pd : pl;
    if (t === pd) catPreview = false;   /* anything else on the left is no longer the catalog's exercise (previewEx sets it again after drawing) */
    if (t === pl && catPanel) closeCatPanel(true);
    t.innerHTML = html; asSurface(t); syncPlace(t);   /* the pane is a Layout surface (index.html): its header is the head slot, its list (or the one box under the header) the body */
    if (t === pl && wide()) {   /* the catalog layer is ready beside the lists, the vivencias and the exercises of one; elsewhere it is not */
      var listy = !!state.me && html.indexOf("data-fab-room") >= 0 && !(state.viv && (state.viv.role === "view" || state.viv.role === "public"));
      if (listy) ensureCatLayer();   /* not under start()'s waiting home (no state.me yet): the real home replaces it, and would close a catalog reopened from before the refresh */
      if (catLayer) { catLayer.hidden = !listy; placeCatLayer(); }
    }
    if (wire) wire(t); }
  var catPanel = null, catLayer = null, catPreview = false;
  (function () { var st = document.createElement("style"); st.textContent = ".bio-catmain .catsh { position: absolute; z-index: calc(var(--z-sticky) + 1); inset-block: 0; inset-inline-end: 0; width: var(--handle-w); cursor: col-resize; touch-action: none } .bio-catmain .catsh::before { content: ''; position: absolute; inset-block: 0; inset-inline-end: 0; width: 1px; background: var(--border) } .bio-catmain .catsh::after { content: ''; position: absolute; inset-block: 0; inset-inline-end: 0; width: calc(var(--bw) * 2); background: transparent; transition: background var(--t-base) } .bio-catmain .catsh:hover::after, .bio-catmain .catsh:focus-visible::after, html.split-drag .bio-catmain .catsh::after { background: var(--border-strong) } .bio-catmain .catsh:focus-visible { outline: none }"; document.head.appendChild(st); })();   /* the catalog is the kit's popup (RosterSheet.panel, side start); only its inside is styled here */
  /* The catalog is ONE popup, a single body that slides as a whole: it is as wide as the left and the right sides together; its right part is the catalog's list, its left part is the exercise opened from it. Closing moves the whole body; the left part only slides out from under the right one when an exercise is chosen. */
  /* the on-screen keyboard: while it is up, the player (hidden behind it anyway) keeps no room at the bottom of a popup, so the list reaches the keyboard */
  (function () {
    var st = document.createElement("style");
    st.textContent = "@media (width < 760px) { * { scrollbar-width: none } *::-webkit-scrollbar { display: none } .bio-ihead--m { display: block; padding-inline: 0; touch-action: pan-y } .bio-ihead--m > .bio-tabs { overflow-x: clip; overflow-y: visible; direction: ltr; padding-block: 0 }   /* the strip clips only sideways (the track runs past it); up and down the play button's shadow falls free, and a hidden overflow also cut that shadow to the tab's own box */ .bio-tab.is-cur { position: relative; z-index: var(--z-raised) }   /* the current tab paints over its faded neighbours (their opacity makes each its own layer), so nothing covers its shadow */   /* the room under the tabs is the sheet's own gap (--gap, law 2, the header gap law of ui/SKILL.md), as in every sheet: the strip ends where the tabs end */.bio-tab__g { display: flex; flex-direction: column; align-items: center; gap: var(--gap-tight) } .bio-tab__t[data-namepop] { cursor: pointer }   /* a phone: a tap on the current exercise's name renames it in a short window (owner 2026-11-27), no pencil in the strip */.bio-tabs__track { display: flex; width: max-content; visibility: hidden; transform: translateX(var(--tx, 0px)); transition: transform var(--t-base) var(--ease) } .bio-tabs__track.is-ready { visibility: visible } .bio-tabs__track.is-drag, .bio-tabs__track.is-drag .bio-tab { transition: none !important } .bio-tab { cursor: pointer; flex: none; display: flex; flex-direction: column; align-items: center; gap: var(--gap-tight); width: calc(var(--cw, 360px) * .38); white-space: nowrap; color: var(--text); direction: rtl; opacity: calc(.4 + .6 * max(0, 1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .6))); transition: opacity var(--t-base) var(--ease) } .bio-tab__f { transform: translateX(calc(var(--nb, 0) * (clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))))) } .bio-tab__n { --nx: calc(clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))); transform: translateX(calc(var(--nb, 0) * var(--nx))); opacity: calc(1 - var(--nb, 0) * min(1, abs(var(--nx)) / (var(--cw, 360px) * .45))); font: var(--fw-bold) var(--fs-xl)/var(--lh-tight) var(--font); font-variant-numeric: tabular-nums } .bio-tab__t { --dc: calc(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2); --dd: calc(var(--cw, 360px) * .38); --sd: min(1, max(.2, (var(--dd) - (var(--hl, 0px) * (1 + clamp(-1, var(--dc) / (var(--cw, 360px) * .02), 1)) + var(--hr, 0px) * (1 - clamp(-1, var(--dc) / (var(--cw, 360px) * .02), 1))) / 2 - var(--gap-tight)) / var(--h, 1px))); transform: scaleX(calc(1 - min(1, abs(var(--dc)) / var(--dd)) * (1 - var(--sd)))); font: var(--fw-regular) var(--fs-m)/var(--lh-tight) var(--font); color: var(--text-muted) } .bio-tab.is-cur .bio-tab__t { color: var(--text); font-weight: var(--fw-bold) } } html.bio-kb:not(.bio-sel) { --bar-b: 0px } html.bio-kb:not(.bio-sel) .rplayer { display: none }";   /* the add-music card after a card: the standard space (sp-2) in every grid it sits in, grid gap plus this; alone it gets none */   /* the exercise popup keeps room for the player at its bottom (rule above, with its id); with the keyboard up the player is gone, so no room is left empty above the keyboard: the class from the visual viewport, and also whenever a field of the popup has focus (whatever the browser reports), and the scroller's own hairline margin no longer hangs below the sheet where it clipped the last line; a popup's header has no line under it, the edge shadow shows on scroll; phones keep a small gap (the gutter) under the last field, inside the scroll */
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
    var k = st.pk || {}, o = { open: false, prev: null, q: k.q || "", tab: k.tab || "ex", mq: k.mq || "", mln: k.mln || "", mch: k.mch || "", msp: k.msp || "", mef: k.mef || "", sc: 0 };   /* the open categories are the kit's sections' own memory */
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
  function whenSettled(cb, n) {   /* waits until what is looked at has been drawn (nothing still loading), so the layer opened next does not take its place */
    n = n || 0;
    var left = wide() ? !!(catPrev && catPrev.querySelector('[aria-busy="true"].rload')) : !!(document.querySelector("#exDlg" + dsfx() + ' .rload[aria-busy="true"]'));
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
          var root = wide() ? catLayer : document.getElementById("catDlg" + dsfx()), qi = root && root.querySelector(".rhead__q");
          if (qi && qi.__rsearch && l.q) qi.__rsearch.set(l.q);   /* the layer's search, open with what it held */
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
    resetPk(); pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || "";
    var drawn = pickerSheet(); if (!drawn || !drawn.then) return;
    drawn.then(function () {
      var pks = document.querySelector("#catDlg #pks"); if (pks) pks.scrollTop = snap.sc || 0;
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) previewSheet(ex);
      if (lay) restoreLayers(lay, 0);
    });
  }
  var catPrevCtx = null;   /* the exercise of the catalog that is looked at: what the add button adds */
  function catAddName() {   /* one name for the add button, the same at every width: "הוספה לוויוונסיה" and the open vivencia's title when it has one */
    var t = state.viv && state.viv.title ? String(state.viv.title).trim() : "";
    return "הוספה לוויוונסיה" + (t && !/^ה?ויוונסיה$/.test(t) ? " " + t : "");
  }
  function refreshPrevLabel() {   /* it always says the vivencia that is open now, and is on only while an exercise is looked at */
    if (!catLayer) return;
    var b = catLayer.querySelector("#catAdd"); if (!b) return;
    var t = "הוספה", n = catAddName(), sp = b.querySelector("span:last-child");
    if (sp && sp.textContent !== t) sp.textContent = t;
    if (b.getAttribute("aria-label") !== n) { b.setAttribute("aria-label", n); b.title = n; }
    b.disabled = !catPrevCtx;
  }
  function loadCatSnap() { try { return JSON.parse(localStorage.getItem(CAT_KEY) || "null"); } catch (e) { return null; } }
  function prevGone(el) {   /* the catalog's exercise or song has closed (by its X, Escape, a new one from the same catalog, or with the catalog): the state follows */
    if (el !== catPrev) return;
    catPrev = null; catPrevMus = null; catPrevId = null; catPreview = false; catPrevCtx = null; refreshPrevLabel(); saveCat();
    if (!prevSwap) { catCurId = null; catMusId = null; RosterList.states(); }   /* the kit's lists: nothing is open beside the catalog now (a new one in its place keeps the new mark) */
    if (catLayer && !prevSwap) catLayer.querySelectorAll(".rcard[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); });
  }
  var prevSwap = false;
  function openPrev(html) {   /* the exercise or the song chosen in the catalog: the kit's popup that comes out of the catalog, over the left pane; a new one sends the old one back first */
    prevSwap = true; try { catPrev = RosterSheet.panel.open({ side: "end", from: catLayer, html: html, onClose: prevGone }); } finally { prevSwap = false; }
    asSurface(catPrev);   /* the panel IS a Layout surface: its header the head, what waits under it the body (prevBody puts each new body in its slot) */
    catPrev.__noHistory = true; return catPrev;
  }
  function prevBody(html) {   /* the body of the catalog's preview panel is replaced by what arrived (the page, its sections, or the empty state), and takes the body slot */
    var sk = catPrev.querySelector("[data-pvskel]");
    if (sk && html.indexOf('<div class="rlayout rempty') !== 0 && html.indexOf("<style") !== 0) { sk.innerHTML = html; loaded(sk); }   /* sections (a song's exercises) go INTO the list: it is the one scroll area */
    else if (sk) sk.outerHTML = html; else catPrev.insertAdjacentHTML("beforeend", html);
    asSurface(catPrev);
  }
  function closeCatPrev() {   /* it goes back into the divider */
    if (catPrev) { RosterSheet.panel.close(catPrev); return; }
    catPrevMus = null; catPrevId = null; catPreview = false; catPrevCtx = null; refreshPrevLabel(); saveCat();
    catCurId = null; catMusId = null; RosterList.states();   /* the kit's lists: nothing is open beside the catalog now */
    if (catLayer) catLayer.querySelectorAll(".rcard[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); });
  }
  function placeCatLayer() { /* the kit places its popups */ }
  function ensureCatLayer() {   /* built once, closed, waiting off the right edge of the screen */
    if (catLayer) return;
    resetPk();   /* the search box reads the catalog's state: it must exist before the layer is drawn */
    var snap = layerStack.length ? null : loadCatSnap(); if (snap) { pk.q = snap.q || ""; pk.tab = snap.tab === "mu" ? "mu" : "ex"; pk.mq = snap.mq || ""; pk.mln = snap.mln || ""; pk.mch = snap.mch || ""; pk.msp = snap.msp || ""; pk.mef = snap.mef || ""; }   /* back to where it was before the refresh */
    var d = document.createElement("div"); d.className = "bio-catmain"; d.__noHistory = true;   /* built once and kept: the kit lends it to its popup each time the catalog opens */
    d.innerHTML = '<div class="catbody" inert><header class="rhead"><button type="button" id="catX" class="rbtn rbtn--icon" aria-label="סגירת הקטלוג" title="סגירת הקטלוג">' + I.x + '</button><div class="rhead__text">' + catField() + '</div>' + catActs() + '</header>' + pickerBody(false, null, !!exFilter) + '</div>';
    d.insertAdjacentHTML("beforeend", '<div class="catsh" role="separator" aria-orientation="vertical" aria-label="רוחב הרשימה (גרירה, חצים במקלדת, לחיצה כפולה לברירת המחדל)" title="גרירה לשינוי הרוחב · לחיצה כפולה: ברירת מחדל" tabindex="0"></div>'); if (window.__bioSplitWire) window.__bioSplitWire(d.querySelector(".catsh"));
    catLayer = d; (d.querySelector("#catAdd") || document.createElement("i")).addEventListener("click", function (ev) {
      var c = catPrevCtx; if (!c) return;
      chooseDest(name(c.e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(c.fake); addExTo(c.e, d.vivId, es.mid, es.all); }, { vivOnly: true });
    });
    d.querySelector("#catX").addEventListener("click", function () { closeCatPanel(); });   /* the X of a window closes it, always (a search open in it too) */
    asSurface(d.querySelector(".catbody"));   /* the catalog's column is a Layout surface: its header the head, the pager (#pgr) the one body; the divider (.catsh) stays beside it */
    var drawn = pickerWire(d.querySelector(".catbody"), undefined, false); d.__api = catApi; placeCatLayer();
    if (snap && snap.open) drawn.then(function () {   /* it was open: it opens again, on the same place and on the same exercise */
      if (catPanel || catLayer.hidden || !wide()) return;
      openCatPanel();
      var putSc = function () { var pks = catLayer.querySelector("#pks"); if (pks && snap.sc) pks.scrollTop = snap.sc; };
      putSc(); setTimeout(putSc, 400);   /* again once on screen: the box's first width draws the list again (its kept search), which starts it at the top */
      var ex = snap.prev && (state.cat || []).filter(function (x) { return x.id === snap.prev; })[0];
      if (ex) { catCurId = ex.id; RosterList.states(); previewEx(ex); }   /* its card is the current one (the kit's list) */
      var base = catLayer;
      /* the music list's scroll comes back by itself: the kit's list memory ("bio.catmu") */
    });
    if (snap && Array.isArray(snap.layers) && snap.layers.length) drawn.then(function () { setTimeout(function () { if (wide()) restoreLayers(snap.layers, 0); }, 0); });   /* the layers that were over it */
  }
  function catGone(el) {   /* a catalog popup has closed (its X, Escape, a tap on the dim, or the code): its exercise closed before it; the state follows */
    if (el !== catLayer) return;
    if (layerStack.length) { popLayer(); }   /* a layer over another: the one below is as it was */
    else { catPanel = null; catPreview = false; }
    if (!catPanel) {
      state.pickerShow = false;
      catOpenMark();
    }
    refreshPrevLabel(); saveCat();
  }
  /* the catalog's button says the catalog is OPEN with aria-expanded, never aria-pressed (open is not on; ui/docs/choice.md, decision 8). The button also opens the
     catalog's menu, which takes aria-expanded off when it closes: after every menu change the mark is written again from the state */
  function catOpenMark() { document.querySelectorAll("[data-catopen]").forEach(function (b) { if (catPanel) b.setAttribute("aria-expanded", "true"); else if (!RosterMenu.current()) b.removeAttribute("aria-expanded"); }); }
  document.addEventListener("rmenu-change", function () { if (!RosterMenu.current()) catOpenMark(); });
  function closeCatPanel(quiet) {
    if (!catPanel || !catLayer) return;
    RosterSheet.panel.close(catLayer);   /* the kit closes what came out of it first, then the catalog */
  }
  function openCatPanel() {   /* the kit's popup on the right pane, up to the divider; the left pane goes dark under it */
    if (catPanel || !catLayer || catLayer.hidden) return;
    if (!layerStack.length && window.__closeLeftAll) window.__closeLeftAll();   /* the side layers go before the catalog opens */
    RosterSheet.panel.open({ side: "start", el: catLayer, onClose: catGone });
    catLayer.querySelector(".catbody").removeAttribute("inert");
    catPanel = catLayer; catOpenMark(); state.pickerShow = true; catPreview = !!catPrevId;
    refreshPrevLabel(); saveCat();
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
      RosterBusy(ab, Promise.all(shift).then(function () { return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=representation", json: { vivencia_id: state.viv.id, position: pos, backlog: cur ? !!cur.backlog : false, exercise_id: null, music_id: null } }); }).then(function (made) {
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
    menu(anchor, [{ label: "קטלוג תרגילים", icon: I.catalog, check: undefined, fn: function () { openCatalog("ex"); } }, { label: "קטלוג מוזיקות", icon: I.music, fn: function () { openCatalog("mu"); } }], opts);
  }
  document.addEventListener("click", function (ev) { var b = ev.target.closest && ev.target.closest("[data-catopen]"); if (!b) return; catalogMenu(b, {}); });
  /* wide screen: the vivencia list on the right, and after choosing one its exercises take that place and the open exercise is on the left. Back from the exercises is the vivencia list again. */
  function homeWide() { state.viv = null; state.lastItem = null; emptyDetail(); home(); }
  function emptyDetail() {
    if (wide()) show(phEnd(ph("בחרו ויוונסיה", "התרגילים שלה יופיעו כאן")), null, "d");   /* choose a vivencia: the curve */
    state.viv = null; paintSel(); setUrl(BASE);
  }
  function paintSel() { var l = document.getElementById("hl"); if (l && l.__rlist) l.__rlist.states(); }   /* the open vivencia is the home list's current one (its current(), the kit's list) */
  function on(root, act, fn) { root.querySelectorAll('[data-act="' + act + '"]').forEach(function (b) { b.addEventListener("click", function (ev) { fn(b, ev); }); }); }
  function stack() { return stack.s || (stack.s = []); }
  function go(fn) { stack().push(fn); fn(); }
  function back() { if (inSub() || (!wide() && curD() > 0)) { unwind(1); return; }   /* narrow: one level up IS the browser's Back, so the arrow and the button never differ */
    stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); else if (wide()) homeWide(); else home(); }

  /* ---------- gate ---------- */
  /* the kit's screen (/app.js, RosterApp.denied, ui/docs/app-denied.md): "signin" (no session) or "denied" (this account is not on the list), in
     the kit's words. A load that failed is not a sign-in problem: it is the empty state's load error, with "ניסיון נוסף". msg is kept for the callers. */
  function gate(msg, signedIn) {
    var kind = signedIn ? "denied" : !FLOA_AUTH.signedIn() ? "signin" : "";
    if (!kind || !window.RosterApp || !RosterApp.denied) { show(phErr("לא הצלחנו לטעון", function () { location.reload(); })); return; }
    if (kind === "signin" && pending && pending.viv) history.replaceState(history.state, "", BASE + pending.viv + (pending.item ? "/" + pending.item : ""));   /* the deep link stays in the address: the kit keeps it through the sign-in and gives it back */
    show(RosterApp.denied.html(kind, { name: "ביודנסה", icon: I.curve }), function (r) { RosterApp.denied.wire(r); });
  }

  /* ---------- home: my vivencias ---------- */
  /* the vivencias I loved: my list, newest first; a row opens the vivencia */
  /* the lists of what I loved open on the left side on a wide screen (the right side keeps the list of vivencias), and as before on a narrow one */
  function showL(title, wire) {   /* the kit's ONE popup: a panel on the left on a computer, a sheet from the bottom on a phone. It opens loading (no body); fillL writes the list when it has arrived */
        return RosterSheet.popup({ id: "likedDlg", side: "end", title: title, wire: wire });
  }
  function listL(r, id) { var b = RosterSheet.popup.body(r); if (b) { b.classList.add("rlist"); b.id = id; } return b; }   /* the popup's body IS the list (ui/docs/layout.md: no wrapper round a scroll area); the kit's list draws its loading, empty and failed states */
  function likedVivScreen() {
    showL("ויוונסיות שאהבתי", function (r) {
      on(r, "back", wide() ? function () { RosterSheet.popup.close(r); } : back);
      var L = vivList(listL(r, "likv"), null, "data-open", { memory: "bio.likv", onOpen: function (v) { RosterSheet.popup.close(r); openViv(v.id); },
        empty: { title: "עוד אין ויוונסיות שאהבת", text: "לחצו על הלב ליד ויוונסיה כדי לשמור אותה כאן", icon: I.curve } });
      var get = function () { api("/rest/v1/vivencia_likes?select=vivencia_id&order=created_at.desc").then(function (rows) {
        L.update((rows || []).map(function (x) { return state.vivs.filter(function (v) { return v.id === x.vivencia_id; })[0]; }).filter(Boolean));
      }, function (e) { fail(e); L.fail(get); }); };   /* failed: the kit's "ניסיון נוסף" asks again, the page stays */
      get();
    });
  }
  /* the exercises I loved: my list, newest first; the heart takes one off it */
  function likedExScreen() {
    showL("תרגילים שאהבתי", function (r) {
      on(r, "back", wide() ? function () { RosterSheet.popup.close(r); } : back);
      /* the hearts of exercises are of two kinds and the menu counts both (likesEx): a catalog exercise (exercise_likes) and an exercise of a vivencia that has no catalog exercise (item_likes, key "item:<id>"); this list shows both, so the number and the list are one thing */
      var L = RosterList.render(listL(r, "likx"), null, { kind: "card", memory: "bio.likx", key: function (e) { return e.key; },   /* cards, exactly like my loved music (owner 2026-11-25): the heart is the card's action; taking it off takes the card out (list.remove, in the heart's handler) */
        content: function (e) { return { title: e.name, sub: e.sub, act1: heartBtnEx(e.key, "") }; }, attrs: function (e) { return 'data-likexc="' + esc(e.key) + '"'; },
        empty: { title: "עוד אין תרגילים שאהבת", text: "לחצו על הלב בראש תרגיל כדי לשמור אותו כאן", icon: I.exercise } });
      var get = function () { Promise.all([api("/rest/v1/exercise_likes?select=exercises(id,title_he,title_en,category)&order=created_at.desc"), api("/rest/v1/item_likes?select=vivencia_items(id,title,exercise_id)&order=created_at.desc").catch(function () { return []; })]).then(function (res) {
        L.update((res[0] || []).map(function (x) { return x.exercises; }).filter(Boolean).map(function (e) { return { key: e.id, name: name(e), sub: catName(e.category) }; })
          .concat((res[1] || []).map(function (x) { return x.vivencia_items; }).filter(Boolean).map(function (it) { return { key: "item:" + it.id, name: it.title || "תרגיל ללא שם", sub: "" }; })));
      }, function (e) { fail(e); L.fail(get); }); };
      get();
    });
  }
  /* the songs I loved: my list, newest first, each as a song row (the heart takes a song off it) */
  function likedCard(m) {
    return { m: m, o: { attrs: 'data-liked="' + esc(m.id) + '"', click: true, title: songName(m), by: songBy(m), pill: cardPill(m), act: exBtnG(m) + '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' } };   /* footEnd: the play tile at the left end, so the heart has the bottom right to itself */
  }
  function likedScreen() {
    showL("מוסיקה שאהבתי", function (r) {
      r.classList.add("raccent-2");   /* a music area: the second accent scope */
      on(r, "back", wide() ? function () { RosterSheet.popup.close(r); } : back);
      var L = songList(listL(r, "likl"), null, { key: function (m) { return m.id; }, card: likedCard, memory: "bio.likl",   /* the kit's list; a heart taken off takes its card out (confirmUnlike: list.remove) */
        empty: { title: "עוד אין מוסיקה שאהבת", text: "לחצו על הלב ליד מוסיקה כדי לשמור אותה כאן", icon: I.music } });
      var get = function () { api("/rest/v1/song_likes?select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=created_at.desc").then(function (rows) {
        L.update((rows || []).map(function (x) { return x.music; }).filter(Boolean));
      }, function (e) { fail(e); L.fail(get); }); };
      get();
    });
  }
  /* the home list shows ONE of two lists, never the same vivencia in both (owner 2026-11-25):
     mine: I own it or I am a partner in it; the others': public ones of other people and ones shared with me for viewing only.
     All is the default; the choice is remembered on this device. */
  function showPubs() { if (state.offline) return false; try { var s = localStorage.getItem("biodanza.all"); if (s != null) return s === "1"; } catch (e) { /* none */ } return state.othersOn !== false; }   /* all is the default (owner 2026-11-25); a new key, so an older "mine" choice does not hide it */
  function homeTitle() { return showPubs() ? "כל הוויוונסיות" : "הוויוונסיות שלי"; }
  function pubBtn() { return '<button class="rbtn rbtn--icon" data-act="pubs" aria-pressed="' + showPubs() + '" data-menu-label="רק הוויוונסיות שלי" data-menu-check="false" aria-label="כל הוויוונסיות" title="כל הוויוונסיות">' + (showPubs() ? I.globe : I.me) + '</button>'; }   /* a toggle with a FIXED name (ui/docs/choice.md, decision 5): pressed = all of them shown; the symbol follows the list as before */
  function homeList() {   /* the vivencias of the list now shown */
    var mine = function (v) { return v.role === "owner" || v.role === "edit"; };
    var seen = {}, list = (showPubs() ? state.vivs.concat(state.pubs || []) : state.vivs.filter(mine)).filter(function (v) { if (seen[v.id]) return false; seen[v.id] = 1; return true; });   /* each one once */
    var s = function (x) { return x == null ? "" : String(x); };
    return list.sort(function (a, b) {   /* only by date, newest first, in both lists (owner 2026-11-26): the creation date the card shows, then the last change, then the topic */
      return s(b.created_at).localeCompare(s(a.created_at)) || s(b.updated_at).localeCompare(s(a.updated_at)) || s(a.title).localeCompare(s(b.title), "he");
    });
  }
  function homeHead() {   /* the home's header: the same from the first frame (start, before anything has arrived) as when the list is here */
    return head(homeTitle(), "", false,   /* the actions (owner 2026-11-25): the regular ones, the main action (+), then "עוד", and the magnifier last at the far end (it turns into the X in the same place); the catalog (1) and the list switch (2) fold into "עוד" when the title needs the room (the kit's RosterHeader) */
      '<span class="rhead__acts">' +
      (state.offline ? '' : '<button class="rbtn rbtn--icon" data-catopen data-pri="1"' + (catPanel ? ' aria-expanded="true"' : '') + ' aria-label="קטלוג" title="קטלוג">' + I.catalog + '</button>' + pubBtn().replace('<button ', '<button data-pri="2" ') +
        '<button class="rbtn rbtn--icon rbtn--accent" data-act="vnew" aria-label="יצירת ויוונסיה" title="יצירת ויוונסיה">' + I.plus + '</button>' +
        '<button class="rbtn rbtn--icon" data-act="hmore" data-rmore="fold" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>') +
      '<button class="rbtn rbtn--icon" data-act="vsearch" aria-label="חיפוש" title="חיפוש">' + I.search + '</button></span>');
  }
  function home() {
    liveVivClose();
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    show(homeHead() +
      '<div class="rlist rload" aria-busy="true" data-fab-room id="hl"></div>' +
      '', function (r) {
      RosterHeader.fit(r.querySelector(".rhead"));   /* the actions that fit are shown, the rest fold into "עוד", before the first paint */
      var plus0 = r.querySelector('[data-act="new"]'), dx0 = null; try { dx0 = localStorage.getItem("biodanza.plusdx"); } catch (e) { /* none */ }
      if (plus0 && dx0 != null && dx0 !== "") plus0.style.transform = "translateX(" + dx0 + "px)";   /* in its place from the first moment, before the list is here */
      on(r, "pubs", function (b) {   /* only mine, or also the public vivencias of the others: remembered on this device */
        var on2 = !showPubs(); state.othersOn = on2; try { localStorage.setItem("biodanza.all", on2 ? "1" : "0"); } catch (e) { /* only for this visit */ }
        b.setAttribute("aria-pressed", String(showPubs())); b.innerHTML = showPubs() ? I.globe : I.me;   /* the state only; the name stays */
        var h1 = r.querySelector(".rhead h1.rhead__title");
        if (h1) { h1.textContent = homeTitle(); h1.title = homeTitle(); }   /* the title says which list (while searching it waits, hidden, for the search to close) */
        renderVivs();
      });
      on(r, "vnew", newViv);
      on(r, "hmore", function (b) {   /* the folded actions, as items of "עוד" (each does what its button does; the kit gives each its short menu label, and the list switch is the check item "רק הוויוונסיות שלי") */
        menu(b, RosterHeader.items(r.querySelector(".rhead"), function (x) { return x.hasAttribute("data-catopen") ? function () { catalogMenu(b, {}); } : null; }));   /* the catalog's own menu opens from "עוד", which is what shows */
      });
      on(r, "new", newViv);
      var vs = r.querySelector('[data-act="vsearch"]');   /* the kit's search (ui/search.js): the title gives its place to the search line, the cards that do not match hide; an open search comes back after a refresh */
      if (vs) RosterSearch.attach(vs, function () { return r.querySelector("#hl"); }, { label: "חיפוש ויוונסיה", key: "biodanza.home", icon: I.curve });
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
        else vivList(l, null, "data-id", { empty: { icon: I.curve } }).fail(function () { if (document.getElementById("hl") === l) home(); });   /* the kit's failed list; ניסיון נוסף: the list is asked for again, the page stays */
      });
    });
  }
  /* my vivencias, with my role and my order in each */
  function loadVivs() {
    var uid = FLOA_AUTH.userId();
    return Promise.all([api("/rest/v1/vivencias?select=id,title,created_at,updated_at,is_public,vivencia_items(count)&vivencia_items.backlog=not.is.true"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
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
      if (state.viv) {   /* the open vivencia was drawn from the device's copy (or before the list came): its partners and its sharing state come with the cloud's answer, and its header is drawn again if they changed */
        var cur0 = rows.filter(function (x) { return x.id === state.viv.id; })[0];
        if (cur0) {
          var was = (state.viv.partners || []).join(", "), pubWas = state.viv.is_public;
          state.viv.partners = cur0.partners; state.viv.is_public = cur0.is_public;
          var lst = document.getElementById("list");
          if ((was !== (cur0.partners || []).join(", ") || pubWas !== cur0.is_public) && lst && lst.hasAttribute("data-fab-room") && !(liveItem && liveItem.root && liveItem.root.isConnected)) setTimeout(editor, 0);
        }
      }
      /* my own order; a vivencia I have not placed yet (a new one) comes first, newest first */
      state.vivs.sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb || (a.updated_at < b.updated_at ? 1 : -1); });
      syncOffline();   /* the device is made equal to the cloud, in the background: at the open, and then only when the list's signature changed (syncOffline) */
    });
  }
  function vivMenu(v, b) {   /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
    var items = [{ label: "שכפול", icon: I.dup, fn: function () { dupPopup(v); } }];   /* renaming is a button in the vivencia's header; deleting was taken out of the menu by the owner */
    if (v.role === "owner") items.push({ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } });
    else if (v.role !== "public") items.push({ label: "הסרה שלי מהוויוונסיה", icon: I.leave, fn: function () { confirmLeave(v); } });
    if (state.offline) items.length = 0;   /* with no internet nothing changes: only the copy on the device can be taken off it */
    if (items.length) menu(b, items);
  }
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
    alignPlus();
    if (window.RosterList) RosterList.states();   /* the card of the vivencia whose song plays carries the sound's curve (owner 2026-11-25): the lists' playing state (vivPlays), no repaint */
  }
  function vivPlays(v) { return !!(nowViv.playing && nowViv.id && nowViv.id === v.id); }
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
  /* THE VIVENCIA CARD (owner 2026-11-25: the list is cards): the name, under it who it is shared by, at the end the exercise count with its wave glyph and the menu. ONE builder for the home list and the liked list; mainAttr is the only difference (what the card opens).
     vivList: the kit's list of these cards (RosterList, ui/docs/list.md): the slots from vivSlots, a tap opens (o.onOpen), the playing state (vivPlays), the search reads the partners;
     the copy and the sharing buttons are heard once on the list, by delegation */
  function vivSlots(v) {
    var pub = v.is_public !== false, vt = pub ? "ציבורית: כל המאפשרים רואים אותה" : "פרטית: רק מי שהיא משותפת איתו רואה אותה";
    var cnt = v.role === "owner" && !state.offline
      ? '<button type="button" class="rbtn rbtn--icon" data-vvis="' + v.id + '" aria-haspopup="dialog" aria-label="' + vt + '. לחיצה לשינוי" title="' + vt + '. לחיצה לשינוי">' + (pub ? I.globe : I.lock) + '</button>'   /* the owner changes it right here, with the same popup as in the vivencia's header */
      : '<span class="bio-vcnt" role="img" aria-label="' + vt + '" title="' + vt + '"><span class="bio-vcnt__c" aria-hidden="true">' + (pub ? I.globe : I.lock) + '</span></span>';   /* where the exercise count was: who can see it (owner 2026-11-25) */
    var more = state.offline ? '' : '<button type="button" class="rbtn rbtn--icon" data-vm="' + v.id + '" aria-haspopup="dialog" aria-label="שכפול" title="שכפול">' + I.dup + '</button>';   /* the card's one action: a copy, with its popup (owner 2026-11-25); sharing and leaving are in the vivencia's own menu */
    var sub = (v.partners || []).join(", ");   /* the title is the name; the description is who its partners are */
    var made = ""; try { if (v.created_at) made = new Date(v.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" }); } catch (e) { /* no date */ }
    var when = made ? '<span class="rcard__num" title="תאריך יצירה">' + made + '</span>' : '';   /* the date it was made, the text tail at the end of the second row (owner 2026-11-25) */
    return { title: v.title || "ויוונסיה ללא נושא", sub: sub, act1: cnt + more, act2: when };
  }
  function vivList(l, items, mainAttr, o) {
    if (!l.__vivActs) { l.__vivActs = 1; l.addEventListener("click", function (ev) {   /* the copy and the sharing of a card: one listener on the list */
      var b = ev.target.closest && ev.target.closest("[data-vm], [data-vvis]"); if (!b || !l.contains(b)) return;
      ev.stopPropagation();
      if (b.dataset.vm) { var v0 = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === b.dataset.vm; })[0]; if (v0) dupPopup(v0); }
      else { var v1 = state.vivs.filter(function (x) { return x.id === b.dataset.vvis; })[0]; if (v1) sharePopup(v1); }
    }); }
    var lo = { kind: "card", key: function (v) { return v.id; }, content: vivSlots, attrs: function (v) { return 'data-card="viv" data-vrow="' + esc(v.id) + '" ' + mainAttr + '="' + esc(v.id) + '"'; },
      search: function (v) { return (v.partners || []).join(", "); },   /* the kit's search reads all the card shows, and its partners (data-q) */
      playing: vivPlays };
    Object.keys(o || {}).forEach(function (k) { lo[k] = o[k]; });
    return RosterList.render(l, items, lo, (live && live.fx) || undefined);   /* a change from a source comes with the kit's effects (withFx) */
  }
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    vivList(l, homeList(), "data-id", { onOpen: function (v) { openViv(v.id); },   /* a card is a button (the kit's list wires the click and the keyboard; its own buttons never open it) */
      current: function (v) { return !!(wide() && state.viv && v.id === state.viv.id); },
      empty: function () { return showPubs() ? { title: "עוד אין ויוונסיות", text: "פתחו את התפריט ובחרו ביצירת ויוונסיה", icon: I.curve } : state.offline ? { title: "אין ויוונסיות שמורות", text: "שמרו ויוונסיה מהתפריט שלה כשיש חיבור, והיא תהיה כאן גם בלי אינטרנט", icon: I.curve } : { title: "עוד אין ויוונסיות", text: "פתחו את התפריט ובחרו ביצירת ויוונסיה", icon: I.curve }; } });
    paintVivPlay();   /* an open search filters the new cards by itself (the kit watches its list) */
    pl.style.setProperty("--sbw", Math.max(0, l.offsetWidth - l.clientWidth) + "px");   /* the header gives its side the room this list's scrollbar takes: its buttons are over the rows' buttons, and no scrollbar left over from another screen moves them */
    if (pending && pending.viv && state.vivsLoaded) {   /* opened on a vivencia's own address; only once the list is really here (the hearts can answer first, and an empty list would throw the address away) */
      var vv = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === pending.viv; })[0];   /* also a public one of somebody else (it is not in my list of my own) */
      var want = pending; pending = want.item ? { item: want.item } : null;   /* the address is used once: going back to the list must not open it again */
      if (vv) { openViv(vv.id); return; }
      openViv(want.viv); return;   /* not in the lists: openViv asks the server, and a link that does not open is the kit's "not found" (vivMissing) */
    }
    if (wide() && !state.viv) emptyDetail();
  }

  function dupPopup(v) {   /* a copy of a vivencia: the exercises, their music and the start and end music, under a topic of its own (the copy is the caller's own: no shares) */
    RosterSheet.confirm({ id: "nameDlg", title: "שכפול ויוונסיה", action: "שכפול", change: false,   /* the suggested name can be taken as it is: the action is open at once */
      fields: [{ name: "title", label: "נושא", value: (v.title || "") + " (עותק)", required: true }],
      submit: function (val) {
        var nid = uuid();
        return api("/rest/v1/rpc/duplicate_vivencia", { method: "POST", json: { src: v.id, p_id: nid, p_title: val.title } }).then(function () {
          state.vivs.unshift({ id: nid, title: val.title, role: "owner", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });   /* newest: first in the list, by date */
          if (document.getElementById("hl")) renderVivs();
          persistVivs(0, 0);   /* it goes first, like a new one */
        }, shortFail);
      } });
  }
  function shortFail(e) { console.error(e); throw { message: "משהו השתבש, נסו שוב" }; }   /* a short window's action failed: the window stays open and says so in place of its sentence */
  function newViv() { namePopup({ id: uuid(), title: "" }); }
  /* Who guides an exercise: optional, any number of people, offered only when a vivencia has more than two editors (owners and accounts shared with edit rights). */
  function facOn() { return state.members.length >= 2; }   /* the members are the owners and those who may edit: from two of them an exercise can have a facilitator, and its card says who */
  /* NAMES (owner 2026-11-26): ONE client helper. A person's name is their full-name field (biodanza.allowed.note); the server fills it already
     (biodanza.person_name: the full name, else the Google name, else the email's local part) in every list it sends: the members, the share
     candidates, me().name. Wide places show personName (the full name); tight places (leader chips, phone tabs, opening titles, print) show
     firstName, through facShort when a family letter must tell two people apart. Against an older server (no me().name), my own name falls back to
     the Google name, and anyone else's to the local part of the email. */
  var knownNames = {};   /* email -> full name, from every list the server sent (the share candidates, me) */
  function learnNames(list) { (list || []).forEach(function (x) { var n = x && x.email && String(x.note || "").replace(/\s+/g, " ").trim(); if (n) knownNames[String(x.email).toLowerCase()] = n; }); }
  function myEmail() { return String((state.me && state.me.email) || (window.FLOA_AUTH && FLOA_AUTH.email()) || "").toLowerCase(); }
  function myName() {
    var n = String((state.me && state.me.name) || "").replace(/\s+/g, " ").trim();
    return n || String((window.FLOA_AUTH && FLOA_AUTH.name && FLOA_AUTH.name()) || "").trim() || myEmail().split("@")[0];
  }
  function personName(e) {
    e = String(e || "").toLowerCase();
    if (e && e === myEmail() && state.me && state.me.name) return myName();   /* my own: me() is the freshest (a rename of mine is there at once) */
    var m = (state.members || []).filter(function (x) { return x.email === e; })[0], n = m && String(m.note || "").replace(/\s+/g, " ").trim();
    if (n) return n;
    if (e && e === myEmail()) return myName();
    return knownNames[e] || e.split("@")[0];
  }
  /* the app menu's options (kit, RosterAppMenu.attach): name is myName; onAccount (the account window) only once me() says the server keeps a name (me().name),
     so against an older server the head stays plain text and nothing offers a save that cannot happen */
  var appMenuOpts;   /* set by the attach call above (it runs first): no initial value here, or it would be wiped */
  function meArrived(me) {
    appMenuOpts = appMenuOpts || {};
    appMenuOpts.onAccount = me && me.allowed && typeof me.name === "string" && !state.offline ? accountPopup : undefined;
    if (window.RosterAppMenu) RosterAppMenu.refresh();
  }
  function namesChanged() {   /* a name changed (mine): the letter, the partners of every card and header, the members of the open vivencia */
    if (window.RosterAppMenu) RosterAppMenu.refresh();
    loadVivs().then(renderVivs, function () { /* the next load */ });
    var nv = state.viv && state.viv.id;
    if (nv) api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: nv } }).then(function (mm) { if (!state.viv || state.viv.id !== nv) return; state.members = mm || []; state.membersFor = nv; if (document.getElementById("list")) paint(); }, function () { /* kept as it was */ });
  }
  /* CHECK ON SAVE (ui/docs/realtime.md, "טופס עם כפתור שמירה"): a window's save is conditional on the values it opened with. No row came back: somebody changed
     it meanwhile; what they wrote is read and returned as a conflict, and the kit's window asks (RosterSheet.confirm, o.save). Only a column that really differs is asked about */
  function condOf(col, v) { return "&" + col + "=" + (v == null ? "is.null" : "eq." + encodeURIComponent(v)); }
  function saveChecked(o) {
    var url = "/rest/v1/" + o.table + "?" + o.where, cond = o.force ? "" : Object.keys(o.at).map(function (c) { return condOf(c, o.at[c]); }).join("");
    var str = function (v) { return v == null ? "" : String(v); };
    return api(url + cond, { method: "PATCH", prefer: "return=representation", json: o.patch }).then(function (rows) {
      if (o.force || (rows && rows.length)) return { ok: true };
      return api(url + "&select=" + Object.keys(o.at).join(",")).then(function (cur) {
        cur = (cur || [])[0]; if (!cur) throw { message: "זה נמחק בינתיים, ולא נשמר." };
        var c = Object.keys(o.cols).filter(function (k) { return str(cur[k]) !== str(o.at[k]) && str(cur[k]) !== str(o.patch[k]); })
          .map(function (k) { return { name: k, value: str(cur[k]), label: o.cols[k].label, the: o.cols[k].the }; });
        if (!c.length) { o.force = true; return saveChecked(o); }   /* only something I am not changing moved: mine is written */
        return { conflict: c };
      });
    });
  }
  /* THE ACCOUNT WINDOW (owner 2026-11-26): a tap on my name at the top of the app menu. The kit's short window, one required field; only my own name */
  function accountPopup() {
    var v0 = (state.me && state.me.name) || myName();
    RosterSheet.confirm({ id: "accountDlg", title: "פרטי משתמש", action: "שמירה",   /* only the action saves; closing is the cancel */
      fields: [{ name: "name", label: "שם מלא", value: v0, autocomplete: "name", maxlength: 80, required: true }],
      save: function (val, f) {   /* check on save (ui/docs/realtime.md): the name now on the server, against the one this window opened with */
        var nm = String(val.name || "").replace(/\s+/g, " ").trim();
        if (!nm || nm.length > 80) return Promise.reject({ message: "צריך שם, עד 80 תווים" });
        var check = f && f.force ? Promise.resolve(null) : api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function (me) { var now = me && me.name ? String(me.name) : ""; return now && now !== v0 && now !== nm ? now : null; }, function () { return null; });
        return check.then(function (other) {
          if (other) return { conflict: [{ name: "name", value: other, label: "שם מלא", the: "השם המלא" }] };
          return api("/rest/v1/rpc/set_my_name", { method: "POST", json: { n: nm } }).then(function (saved) {
            if (state.me) state.me.name = typeof saved === "string" && saved ? saved : nm;
            namesChanged();
          }, shortFail);
        });
      } });
  }
  function facName(e) { return personName(e); }
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
    /* the leader is a TEXT BUTTON (law: object type "כפתור טקסט"): the name of the leader, tapped to change it through the existing leader menu (data-fac) */
    if (!canEdit()) return has ? '<button type="button" class="rbtn rbtn--text' + (extra || "") + '" disabled data-fac-label="' + it.id + '">' + esc(facLabel(it)) + '</button>' : "";
    return '<button type="button" class="rbtn rbtn--text' + (extra || "") + '" data-fac="' + it.id + '" aria-haspopup="menu" aria-expanded="false">' + esc(facLabel(it)) + '</button>';   /* it opens a menu: aria-expanded, never aria-pressed */
  }
  function facRefresh(it) {
    document.querySelectorAll('[data-fac="' + it.id + '"]').forEach(function (b) { b.textContent = facLabel(it); });
  }
  /* the menu of people: a tick adds or removes one, the menu stays open so several can be ticked (the one menu, with ticked items) */
  function facMenu(btn, it) {
    function toggle(x, b, repaint) {
      var has = facEmails(it).indexOf(x.email) >= 0;
      var req = has ? api("/rest/v1/vivencia_item_facilitators?item_id=eq." + it.id + "&email=eq." + encodeURIComponent(x.email), { method: "DELETE" })
                    : api("/rest/v1/vivencia_item_facilitators", { method: "POST", prefer: "return=minimal", json: { item_id: it.id, email: x.email } });
      RosterBusy(b, req);
      req.then(function () {
        it.vivencia_item_facilitators = has ? (it.vivencia_item_facilitators || []).filter(function (y) { return y.email !== x.email; }) : (it.vivencia_item_facilitators || []).concat([{ email: x.email }]);
        if (repaint) repaint(); facRefresh(it);
      }, fail);
    }
    if (state.members.length === 1) { toggle(state.members[0], btn); return; }   /* one person: the leader's button itself ticks them on and off (a menu never has one item) */
    menu(btn, function () {
      var on = facEmails(it);
      return state.members.map(function (x) {
        return { label: personName(x.email), check: on.indexOf(x.email) >= 0, keep: true, fn: function (b, close, repaint) { toggle(x, b, repaint); } };
      });
    });
  }
  /* the leader's click is its own: it never opens the strip, and it is not the start of a drag */
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

  /* THE menu of the app is the kit's (ui/menu.js, RosterMenu): items and opts as defined there; the icons are the app's */
  function menu(btn, items, opts) { return RosterMenu.open(btn, items, opts); }

  /* sharing: only with accounts of the allowlist (chosen from it, never typed), as a viewer or an editor */
  /* SHARING SETTINGS (owner 2026-11-25), the side panel on a computer, a sheet on a phone:
     public or private; the partners (shared for editing); the viewers (shared for viewing), shown only while it is private.
     Making it public keeps the viewers in the database, so making it private again brings them back as they were. */
  function giveLink(url, title, done) {
    if (navigator.share && !wide()) return navigator.share({ title: title, url: url }).catch(function (e) { if (e && e.name === "AbortError") return; return copyIt(); });
    return copyIt();
    function copyIt() { return navigator.clipboard.writeText(url).then(function () { toast(done); }, function () { window.prompt("העתקת הקישור", url); }); }
  }
  function sharePopup(v) {
    var shares = [], cands = [], ready = false;   /* ready: the list has arrived (until then the area is loading, typing does not draw an empty state) */
    /* ONE inset (law 2): the column sequences its blocks with --gap; the two choice rows pad themselves and touch the walls, every other block (the link, the field, the people with their dividers) pads its sides with --gap. On a phone the sheet does not pad the sides for them; in a panel the column gives the --gap under the header */
    var shareBody = '<style>#svis ~ * { padding-inline: var(--gap) } #slist { display: flex; flex-direction: column; gap: var(--gap) } #slink:empty, #snf:empty { display: none }</style>' +   /* the window's body is the kit's scroll area; its rows (#svis) touch the walls, so it pads no sides and the blocks after them pad their own */
      '<div id="svis"></div><div id="slink"></div><div><label class="rlayout rlayout--unit rfield"><span>הוספת אדם (אימייל או שם)</span><input id="sq" type="text" placeholder=" " autocomplete="off"></label></div><div id="slist"' + LOAD + '></div><div id="snf"></div>';
        var dlg = RosterSheet.popup({ id: "shareDlg", side: "end", title: v.title || "ויוונסיה ללא נושא", size: "m", body: shareBody });   /* the kit's one popup (law 6); the title is the vivencia's name (owner 2026-11-25) */
    function isPub() { return v.is_public !== false; }
    function who(e) { return personName(e); }   /* the one helper (the candidates' names are learnt as they arrive) */
    var visBusy = false;
    function paintVis() {   /* the two choices, the one that holds is checked */
      var row = function (pub, label, sub) { return '<label class="rlayout rlayout--row rlayout--pad rrow rrow--pick"><input type="radio" name="svis" value="' + (pub ? 1 : 0) + '" data-svis><span aria-hidden="true" class="rrow__lead ricon">' + (pub ? I.globe : I.lock) + '</span><span class="rlayout rlayout--unit rlayout__grow rrow__main"><span class="rrow__title">' + label + '</span><span class="rrow__sub">' + sub + '</span></span><span aria-hidden="true" class="rrow__ok ricon">' + I.check + '</span></label>'; };   /* the kit's choice row: a label round the browser's radio (one of the two, the arrows walk them, no JS); the check is always written, CSS shows it on the chosen one */
      var box = dlg.querySelector("#svis");
      if (!box.querySelector("[data-svis]")) {   /* written once: a repaint only moves the check, so the focus stays on the radio */
        box.innerHTML = row(true, "ציבורית", "כל המאפשרים רואים אותה, לצפייה בלבד") + row(false, "פרטית", "רק השותפים והצופים שבחרת רואים אותה");   /* the rows, flush, touching the walls */
        box.querySelectorAll("[data-svis]").forEach(function (r) { r.addEventListener("change", function () {
          var pub = r.value === "1"; if (pub === isPub()) return;
          if (visBusy) { paintVis(); return; }   /* one save at a time: the arrows while it saves go back */
          visBusy = true;
          RosterBusy(r.closest(".rrow"), api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { is_public: pub } })).then(function () {
            visBusy = false;
            v.is_public = pub; state.vivs.forEach(function (x) { if (x.id === v.id) x.is_public = pub; }); if (state.viv && state.viv.id === v.id) state.viv.is_public = pub;
            paintVis(); paintS(); renderVivs();
            document.querySelectorAll('[data-act="vis"]').forEach(function (h) { var t = visTip(v); h.setAttribute("aria-label", t); h.title = t; h.innerHTML = pub ? I.globe : I.lock; });
          }, function (e) { visBusy = false; paintVis(); fail(e); });   /* failed: the choice goes back to what holds */
        }); });
      }
      box.querySelectorAll("[data-svis]").forEach(function (r) { r.checked = (r.value === "1") === isPub(); });
      var linkBtn = '<button type="button" class="rbtn rbtn--block" data-slink>' + I.share + '<span>' + (isPub() ? "שיתוף קישור" : "קישור חד פעמי לצפייה") + '</span></button>';   /* public: its own address; private: a link that works once, for one viewer (owner 2026-11-25) */
      dlg.querySelector("#slink").innerHTML = linkBtn;   /* the button is its own block: its room above it is the column's gap (law 2) */
      dlg.querySelector("[data-slink]").addEventListener("click", function () {
        var lb = this, base = location.origin + BASE + v.id;
        var made = isPub() ? Promise.resolve(base)
          : api("/rest/v1/vivencia_invites", { method: "POST", prefer: "return=representation", json: { vivencia_id: v.id } }).then(function (r) {
            var tk = r && r[0] && r[0].token;   /* the server answered with no row (RLS let the insert through without returning it): no link, the app's error path, never a TypeError */
            if (!tk) { var ne = new Error("no invite was returned"); ne.status = 200; throw ne; }   /* a status: the server did answer, so fail() does not ask whether the connection is gone */
            return base + "?invite=" + encodeURIComponent(tk);
          });
        RosterBusy(lb, made.then(function (url) { return giveLink(url, v.title || "ויוונסיה", isPub() ? "הקישור הועתק" : "הקישור הועתק. הוא עובד פעם אחת, לאדם אחד"); })).then(null, fail);
      });
    }
    function paintS() {
      if (!ready) return;
      var q = fold(dlg.querySelector("#sq").value.trim()), l = dlg.querySelector("#slist");
      var have = {}; shares.forEach(function (x) { have[x.email] = 1; });
      var hit = function (x) { return !q || fz(x.email + " " + who(x.email), q); };
      var partners = shares.filter(function (x) { return x.role === "edit" && hit(x); }), viewers = isPub() ? [] : shares.filter(function (x) { return x.role !== "edit" && hit(x); });
      var rest = q ? cands.filter(function (c) { return !have[c.email] && fz(c.email + " " + (c.note || ""), q); }) : [];   /* the people who are not shared yet show only when you search for them */
      if (!l.__sActs) { l.__sActs = 1; l.addEventListener("click", function (e) {   /* the role chip of a card: one listener on the list */
        var b = e.target.closest && e.target.closest("[data-chiprole]"); if (!b || !l.contains(b)) return;
        e.stopPropagation(); var em = b.dataset.chiprole, cur = (shares.filter(function (x) { return x.email === em; })[0] || {}).role;
        menu(b, [["view", "צפייה"], ["edit", "שותף"]].map(function (r) { return { label: r[1], check: cur === r[0], radio: true, fn: function () { if (cur !== r[0]) setRole(em, r[0]); } }; }), { fit: true });
      }); }
      var items = partners.map(function (x) { return { g: "edit", x: x }; }).concat(viewers.map(function (x) { return { g: "view", x: x }; }), rest.map(function (c) { return { g: "add", x: c }; }));
      var L = RosterList.render(l, items, { kind: "card", key: function (it) { return it.x.email; }, group: function (it) { return it.g; },   /* the kit's list in three groups, each under its divider */
        groups: [{ key: "edit", label: "שותפים לעריכה", empty: q ? "לא נמצא שותף" : "עוד אין שותפים" }, { key: "view", label: "צופים", show: !isPub(), empty: q ? "לא נמצא צופה" : "עוד אין צופים" }, { key: "add", label: "הוספה" }],
        attrs: function (it) { return it.g === "add" ? 'data-add="' + esc(it.x.email) + '"' : 'data-scard="' + esc(it.x.email) + '"'; },
        content: function (it) {
          var x = it.x;
          if (it.g === "add") return { title: personName(x.email), sub: x.email, act1: '<span aria-hidden="true" class="ricon ricon--primary">' + I.plus + '</span>' };
          var nm = who(x.email), chip = isPub() ? '' : '<button type="button" class="rchip rchip--button" data-chiprole="' + esc(x.email) + '" aria-haspopup="menu" aria-expanded="false">' + (x.role === "edit" ? "שותף" : "צפייה") + '</button>';   /* while private the chip moves a person between partner and viewer */
          return { title: nm, sub: nm !== x.email ? x.email : "", chip: chip };
        },
        canOpen: function (it) { return it.g === "add"; },   /* only who is not shared yet is tapped, to add */
        onOpen: function (it) { L.busy(it.x.email, api("/rest/v1/vivencia_shares", { method: "POST", prefer: "return=minimal", json: { vivencia_id: v.id, email: it.x.email, role: isPub() ? "edit" : "view" } }).then(function () { dlg.querySelector("#sq").value = ""; return load(); }, fail)); },   /* public: a new person is a partner (everybody sees it anyway); private: a viewer, the chip makes a partner */
        remove: { kind: "remove", can: function (it) { return it.g !== "add"; }, label: function (it) { return "הסרה של " + who(it.x.email); },   /* the card's one action is its X, then the kit's confirm (owner 2026-11-26) */
          title: function (it) { return "להסיר את " + who(it.x.email) + (it.x.role === "edit" ? " מהשותפים?" : " מהצופים?"); },
          run: function (it) { return api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(it.x.email), { method: "DELETE" }).then(function () { shares = shares.filter(function (y) { return y.email !== it.x.email; }); setTimeout(load, 0); }, function (er) { fail(er); throw er; }); } } });
      var nf = dlg.querySelector("#snf");   /* nothing at all matches the search: said once, after the groups (not a group of the list) */
      if (nf) nf.innerHTML = q && !partners.length && !viewers.length && !rest.length ? ph("לא נמצא", "אפשר לשתף רק עם חשבונות מרשימת המורשים.", I.users) : "";
    }
    function setRole(e, role) { return api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(e), { method: "PATCH", json: { role: role } }).then(load, fail); }
    function load() {
      return Promise.all([api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&select=email,role&order=created_at"), api("/rest/v1/rpc/share_candidates", { method: "POST", json: {} })]).then(function (r) { shares = r[0] || []; cands = r[1] || []; learnNames(cands); ready = true; paintS(); }, function (er) { if (!ready) RosterList.render(dlg.querySelector("#slist"), null, { kind: "card", key: function (it) { return it.x.email; }, content: function (it) { return { title: it.x.email }; }, empty: { icon: I.users } }).fail(function () { load(); }); fail(er); });
    }
    dlg.querySelector("#sq").addEventListener("input", paintS);
    paintVis(); load();
  }

  /* removing an exercise from a vivencia is asked in the kit's popup, one action; the catalog's exercise is untouched */
  function confirmRemoveItem(it) {
    RosterSheet.confirm({ title: "הסרת תרגיל", text: 'להסיר את "' + esc(itemName(it)) + '" מהוויוונסיה? התרגיל נשאר בקטלוג.', action: "הסרה",run: function (dlg, btn) {
      RosterBusy(btn, api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "DELETE" })).then(function () { dlg.close(); state.lastItem = null;
        if (wide()) { show(phPick(), null, "d"); setUrl(BASE + state.viv.id); loadItems().then(paint, fail); } else back(); }, fail);
    } });
  }
  /* the name (the theme) of a vivencia is set here, from the list: the kit's popup with a header check to save */
  function namePopup(v) {   /* a NEW vivencia: its topic in the kit's short window (renaming is in place, from the pencil after the title) */
    RosterSheet.confirm({ id: "nameDlg", title: "ויוונסיה חדשה", action: "שמירה",
      fields: [{ name: "title", label: "נושא", value: "", required: true }],
      submit: function (val) {
        var t = val.title;
        return api("/rest/v1/vivencias", { method: "POST", json: { id: v.id, title: t }, prefer: "return=minimal" }).then(function () {
          state.vivs.unshift({ id: v.id, title: t, role: "owner", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });   /* the one who made it owns it: the menu has share and delete at once, not only after a reload */
          renderVivs(); persistVivs(0, 0);   /* it goes FIRST and stays there (its place is saved like any move), and it is not opened: you stay on the list and see it at the top */
        }, shortFail);
      } });
  }


  /* ---------- the vivencia: plan along the curve ---------- */
  function openViv(id) { if (!state.viv || state.viv.id !== id) state.lastItem = null; state.filter = ""; state.viv = state.vivs.concat(state.pubs || []).filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) { stack().length = 0; show(phPick(), null, "d"); } go(editor); paintSel(); if (!state.viv.title && !state.offline) vivMissing(id); }
  /* a link to a vivencia that is not in the lists: asked of the server; none (deleted, not shared, or no such address) is the kit's "not found" screen
     (RosterApp.denied "missing"), never a vivencia with no name. The address stays, so the same link opens after a share or a sign-in. */
  function vivMissing(id) {
    var none = function () {
      if (!state.viv || state.viv.id !== id || !window.RosterApp || !RosterApp.denied) return;
      state.viv = null; stack().length = 0;
      if (wide()) show(phPick(), null, "d");
      show(RosterApp.denied.html("missing", { name: "ביודנסה", icon: I.curve, status: true }), function (r) { RosterApp.denied.wire(r, { home: function () { history.replaceState(history.state, "", BASE); if (wide()) homeWide(); else home(); } }); });
    };
    api("/rest/v1/vivencias?id=eq." + encodeURIComponent(id) + "&select=id").then(function (rows) { if (!rows || !rows.length) none(); }, function (e) { if (e && (e.status === 400 || e.status === 403 || e.status === 404)) none(); });
  }
  var ITEM_SELECT = "&select=id,position,exercise_id,music_id,backlog,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,level,curve,level_basis,curve_basis,source)),music!music_id(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email),item_music_options(music_id,created_at,music(id,name,title,artist,duration_sec,audio_object,in_catalog))&order=position";
  var recvCache = {};   /* the songs of the start and of the end of each vivencia: id|start, id|end */
  function itemsOf(id) {
    var rp = api("/rest/v1/vivencia_reception_music?vivencia_id=eq." + id + "&select=kind,music_id,created_at,position,music(id,name,title,artist,duration_sec,audio_object,in_catalog)&order=position.asc.nullslast,created_at.asc").then(function (rows) {
      var st = [], en = [];
      (rows || []).forEach(function (x) { if (x.music) (x.kind === "end" ? en : st).push({ music_id: x.music_id, created_at: x.created_at, position: x.position, music: x.music }); });
      recvCache[id + "|start"] = st; recvCache[id + "|end"] = en;
    }, function () { /* no such songs now */ });
    var op = openFetch(id).then(function (rows) { openCache[id] = rows || []; }, function () { /* no opening now */ });
    return Promise.all([api("/rest/v1/vivencia_items?vivencia_id=eq." + id + ITEM_SELECT), rp, op]).then(function (r) { return r[0]; });
  }
  function recvRows(id) {   /* the start and end songs of a vivencia, one list with a kind on each, for the copy kept on the device */
    var out = []; ["start", "end"].forEach(function (k) { (recvCache[id + "|" + k] || []).forEach(function (x) { out.push({ kind: k, music_id: x.music_id, created_at: x.created_at, music: x.music }); }); });
    return out;
  }
  function loopOn(kind) { try { return localStorage.getItem("biodanza.loop." + (state.viv && state.viv.id) + "." + kind) !== "0"; } catch (e) { return true; } }   /* default: on */
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
  /* the parts of a vivencia are the kit's sections (ui/section.js): only the vivencia itself is open until somebody opens another; the kit remembers each one */
  function vivSec(kind, o) { o.key = "viv:" + state.viv.id + ":" + kind; o.open = kind === "ex"; return RosterSection.html(o); }
  var PAUSEI = I.pause;
  function recvPlaying(kind) {   /* the song that is loaded now belongs to this section */
    var nw = window.__bioNow || {}; if (!nw.name || !state.viv) return false;
    return optList(recvItem(kind)).some(function (m) { return m.audio_object === nw.name; });
  }
  document.addEventListener("bioaudio", function () {   /* the play button of a section is a pause while one of its songs plays */
    document.querySelectorAll("[data-recvplay]").forEach(function (b) { var on = recvPlaying(b.dataset.recvplay) && !!(window.__bioNow || {}).playing; if (b.classList.contains("is-play") === on && b.firstElementChild) return;   /* only on a real change: bioaudio comes with every timeupdate, and a glyph rebuilt each time blinks */ b.innerHTML = on ? PAUSEI : I.play; b.classList.toggle("is-play", on); b.setAttribute("aria-label", on ? "עצירה" : "השמעה"); b.title = on ? "עצירה" : "השמעה"; });   /* playing: .is-play, the kit colours it */
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
  function recvPart(kind) {   /* the start or end music: the section's options (the bar), or null when it is not shown; its cards are recvList's */
    var list = optList(recvItem(kind)), edit = canEdit();
    if (!edit && !list.length) return null;
    var label = kind === "start" ? "מוסיקת התחלה" : "מוסיקת סיום";
    var play = list.length > 1 ? '<button type="button" class="rbtn rbtn--icon rbtn--muted raccent-2" data-recvloop="' + kind + '" aria-pressed="' + loopOn(kind) + '" aria-label="לולאה" title="לולאה: כשמנגנים מוסיקה מהקטע, המוסיקה ממשיכה אחד אחרי השני ובסוף חוזרים להתחלה">' + I.loop + '</button>' : '';
    var pOn = recvPlaying(kind) && !!(window.__bioNow || {}).playing;
    var playBtn = list.length ? '<button type="button" class="rbtn rbtn--icon' + (pOn ? ' is-play' : '') + '" data-recvplay="' + kind + '" aria-label="' + (pOn ? "עצירה" : "השמעה") + '" title="' + (pOn ? "עצירה" : "השמעה") + '">' + (pOn ? PAUSEI : I.play) + '</button>' : '';
    return { title: label, count: list.length, attrs: 'data-recv="' + kind + '"', scope: "raccent-2", hasBody: list.length > 0,
      actions: playBtn + play + (edit ? '<button type="button" class="rbtn rbtn--icon" data-addm data-racc-open aria-label="הוספת מוזיקה" title="הוספת מוזיקה">' + I.plus + '</button>' : '') };
  }
  /* THE START OR END MUSIC (ui/docs/list.md, list 8): the kit's list of song cards in the section's body. A tap plays (cardPlay), the X takes the song out of
     the part with the kit's confirm (the song stays in the catalog), the order is dragged (persistRecv). Its scope (the second accent) is the section's */
  function recvList(box, kind) {
    var it = recvItem(kind), edit = canEdit(), key = state.viv.id + "|" + kind, where = kind === "start" ? "ממוסיקת ההתחלה" : "ממוסיקת הסיום";
    if (!exIdx && optList(it).length) exIndex().then(function () { if (box.isConnected) recvList(box, kind); }, function () { /* no exercises: the cards stay without their lines */ });   /* the lines come once the exercises of the songs are here */
    return songList(box, optList(it), { key: function (m) { return m.id; }, card: function (m) { return { m: m, o: muOpts(m, { attrs: 'data-opt="' + esc(m.id) + '"', listKey: key, plus: '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' }) }; },   /* the music card (muCard), as in the catalog */
      remove: edit ? { kind: "remove", label: function (m) { return "הסרה של " + songName(m) + " " + where; }, title: function (m) { return "להסיר את " + songName(m) + " " + where + "?"; },
        run: function (m) { return dropOpt(recvItem(kind), m).then(function () { setTimeout(paint, 0); }, function (e) { fail(e); throw e; }); } } : null,   /* the bar's count follows once the card is out */
      sortable: edit ? { onMove: function (g) { return persistRecv(kind, g[0] || []); } } : null });
  }
  /* the opening of the evening: a free text (kept only where there is nobody to add) and a section for each leader who says something before the evening
     (a black chip, the words under it, indented; the chip folds the section). One row per section in biodanza.vivencia_opening, who = '' for the free text:
     a save sends only the row that was changed, and a change from somebody else is written into the boxes I am not typing in. */
  var openCache = {};   /* vivencia id -> [{ who, body, position }] */
  function openRows(id) { return (openCache[id || state.viv.id] || []).slice().sort(function (x, y) { return (x.position | 0) - (y.position | 0); }); }
  function openFreeText() { var r = openRows().filter(function (x) { return x.who === ""; })[0]; return r ? r.body : ""; }
  function openSum(t) { return String(t || "").replace(/[*]{2}/g, "").replace(/\s+/g, " ").trim(); }   /* a folded section tells its words in one line, up to the bin */
  /* a leader's paragraph is keyed by the PERSON (owner 2026-11-26): who_email says whose it is, so its title follows a rename; who stays the row's key and
     the text an older client shows (and the title when who_email is empty: a row an older client added). Against a server without the column (before
     apps/biodanza/names.sql ran) the read falls back to the old columns once, and the writes then leave who_email out. */
  var openEmailCol = null;   /* null: not known yet, true: the column is there, false: it is not */
  function openFetch(id) {
    var q = function (cols) { return api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&select=" + cols + "&order=position.asc"); };
    if (openEmailCol === false) return q("who,body,position");
    return q("who,who_email,body,position").then(function (rows) { openEmailCol = true; return rows; }, function (e) {
      if (e && e.status === 400 && openEmailCol === null) { openEmailCol = false; return q("who,body,position"); }
      throw e;
    });
  }
  function openTitle(who) {   /* a tight place: the leader's first name (with a family letter only when needed), from the person; else the stored text */
    var r = openRows().filter(function (x) { return x.who === who; })[0];
    return r && r.who_email ? facShort(r.who_email) : openName(who);
  }
  function openLocal(who, body, email) {   /* what I typed is in the cache at once, so a repaint draws the same words */
    var id = state.viv.id, list = openCache[id] || (openCache[id] = []), r = list.filter(function (x) { return x.who === who; })[0];
    if (r) r.body = body; else { r = { who: who, body: body, position: list.reduce(function (m, x) { return Math.max(m, x.position | 0); }, 0) + 1 }; list.push(r); }
    if (email) r.who_email = email;
    return r;
  }
  function openPut(who, body, email) {   /* the one row, to the server; a new paragraph also says whose it is */
    var id = state.viv.id, r = openLocal(who, body, email), row = { vivencia_id: id, who: who, body: body, position: r.position };
    if (openEmailCol === true && r.who_email) row.who_email = r.who_email;
    return api("/rest/v1/vivencia_opening?on_conflict=vivencia_id,who", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", json: row }).then(function () { refreshOffline(state.viv); }, fail);
  }
  function openDel(who) {   /* one Promise: the cache changes only once the server agreed (the kit's list takes the section out then); a failure rejects, so the section stays */
    var id = state.viv.id;
    return api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&who=eq." + encodeURIComponent(who), { method: "DELETE" }).then(function () {
      openCache[id] = (openCache[id] || []).filter(function (x) { return x.who !== who; });
      if (state.viv && state.viv.id === id) refreshOffline(state.viv);
    }, function (e) { fail(e); throw e; });
  }
  function openMove(groups) {   /* the leaders' sections in their new order (the kit's sortable list, one group): one Promise; the cache changes only once the save succeeded */
    var id = state.viv.id, by = {}, order = groups[0] || [];
    openRows().forEach(function (q) { if (q.who !== "") by[q.who] = q; });
    var jobs = [];
    order.forEach(function (who, i) { var q = by[who]; if (q && q.position !== i + 1) jobs.push(api("/rest/v1/vivencia_opening?vivencia_id=eq." + id + "&who=eq." + encodeURIComponent(who), { method: "PATCH", json: { position: i + 1 }, prefer: "return=minimal" })); });
    return Promise.all(jobs).then(function () {
      order.forEach(function (who, i) { if (by[who]) by[who].position = i + 1; });
      if (state.viv && state.viv.id === id) { refreshOffline(state.viv); paintKeep(); }
    }, function (e) { fail(e); throw e; });   /* failed: the kit puts the sections back */
  }
  function printOpening() {   /* the opening of the evening (the free text and every leader's words), then the exercises from a new page: through the kit's print shell (/print.js, ui/docs/print.md); the app gives only the content */
    var v = state.viv; if (!v || !window.RosterPrint) return;
    var free = openFreeText(), secs = openRows().filter(function (x) { return x.who !== ""; });
    var open = (free ? [{ kind: "text", html: rtHtml(free) }] : []).concat(secs.map(function (q) {
      return { kind: "section", title: openTitle(q.who), blocks: [{ kind: "text", html: rtHtml(q.body || "") }] };   /* the leader's name from the person (openTitle) */
    }));
    if (!open.length) open.push({ kind: "text", html: esc("עוד לא נכתבה פתיחה.") });   /* the opening's own empty state, inside its section */
    var blocks = [{ kind: "section", title: "פתיחת הערב", blocks: open }], n = 0;
    var items = (state.items || []).map(function (it) {   /* the exercises, in their order */
      var m = it.music, po = txt(it, "poetics"), gu = txt(it, "guidance"), no = it.notes || "";
      return { kind: "item", num: it.backlog ? null : ++n, title: itemName(it) || "ללא שם",
        tag: facOn() && facEmails(it).length ? facLabel(it) : "",   /* the leaders by first name (facLabel); none chosen: no tag */
        meta: m ? [songName(m), songBy(m)] : [], metaIcon: "music",   /* the song line opens with the kit's music symbol */
        fields: [{ label: "פואטיקה", html: po ? rtHtml(po) : "" }, { label: "הנחיה", html: gu ? rtHtml(gu) : "" }, { label: "הערות", html: no ? rtHtml(no) : "" }] };
    });
    if (items.length) blocks.push({ kind: "section", title: "התרגילים", blocks: items });
    RosterPrint.open({ title: v.title || "ויוונסיה", blocks: blocks, empty: "עוד לא נכתבה פתיחה." });
  }
  function openName(who) { return String(who).split("#")[0]; }   /* a leader may have several paragraphs: the first is under the name, the others under name#2, name#3 */
  function openKey(n) { var have = {}; openRows().forEach(function (x) { have[x.who] = 1; }); if (!have[n]) return n; for (var k = 2; ; k++) if (!have[n + "#" + k]) return n + "#" + k; }
  function openBoxHtml(who, body, ro) { return '<div data-owho="' + esc(who) + '" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(body) + '</div>'; }
  function openingPart() {   /* between the start music and the vivencia: the section's options (the bar), or null when it is not shown; its body is openingFill's */
    var v = state.viv, ro = !canEdit(); if (!v) return null;
    var free = openFreeText(), secs = openRows().filter(function (x) { return x.who !== ""; });
    if (ro && !free && !secs.length) return null;
    return { title: "פתיחת הערב", attrs: "data-opening", hasBody: !(facOn() && !free) || secs.length > 0,
      actions: !ro && facOn() ? '<button type="button" class="rbtn rbtn--icon" data-secadd data-racc-open aria-haspopup="menu" aria-label="הוספת פסקה" title="הוספת פסקה">' + I.plus + '</button>' : '' };
  }
  /* THE OPENING'S BODY (ui/docs/list.md, list 9): the free text is a field before the list (the list's head block, data-rlist-head), then the leaders' paragraphs,
     the kit's list of sections (kind "section", keyed by the row's who): a section's bar is its handle for the order, its bin deletes it with the kit's confirm.
     A change from somebody else is an update of the list: a section the person is typing in waits until the focus leaves (the kit's rule) */
  function openBoxWire(el) {   /* one box of the opening, once: a co-edited field of the kit (RosterField.live on the opening's source): saved as it is typed, merged with the others, their carets in it */
    if (el.__ow) return; el.__ow = true;
    rtInit(el);
    var who = el.dataset.owho, id = state.viv.id;
    var subOf = function () { var sec = el.closest("[data-sec]"); return sec && sec.querySelector(":scope > .racc__bar .racc__sub"); };   /* a leader's words in one line, in the sub of the section */
    if (!live.open || live.vid !== id) return;   /* no live source (no internet): read only, as the app's own offline state says */
    liveSweep();
    /* the free text has no row until somebody writes in it: empty "" is its value with no row, so binding it is not a change and saves nothing; the row is created
       by the first words typed (create) */
    liveKeep(el, RosterField.live(el, live.open, who, "body", { match: { vivencia_id: id, who: who }, create: who === "" ? { vivencia_id: id, who: "", position: 0 } : null, empty: "",
      presence: live.pres, item: "open", field: "o:" + who, readOnly: !canEdit(),
      onLocal: function (v) { var sm = subOf(); if (sm) sm.textContent = openSum(v); openLocal(who, v); } }));
  }
  function openingFill(box) {
    var ro = !canEdit(), free = openFreeText(), secs = openRows().filter(function (x) { return x.who !== ""; }), showFree = !(facOn() && !free);
    var bo = box.querySelector(":scope > .bio-open");
    if (!bo) {   /* written once for this vivencia: the parent sequences (law 2), its gap set in CSS at the lowest weight, so the kit's section rule wins when it holds only paragraphs */
      box.innerHTML = '<div class="bio-open"></div>'; bo = box.firstElementChild;
      bo.addEventListener("rlist-change", function (ev) { var d = ev.detail || {}; (d.added || []).concat(d.replaced || []).forEach(function (s) { [].forEach.call(s.querySelectorAll("[data-owho]"), openBoxWire); }); });
    }
    var fl = bo.querySelector(":scope > [data-rlist-head]");
    if (showFree && !fl) { bo.insertAdjacentHTML("afterbegin", '<label class="rlayout rlayout--unit rfield" style="flex:none" data-rlist-head><span>טקסט חופשי</span>' + openBoxHtml("", free, ro) + '</label>'); openBoxWire(bo.querySelector('[data-rlist-head] [data-owho]')); }
    else if (!showFree && fl && !fl.contains(document.activeElement)) fl.remove();
    /* the free text follows the others by itself: it is a co-edited field (openBoxWire) */
    RosterList.render(bo, secs, { kind: "section", key: function (q) { return q.who; },
      content: function (q) {   /* the leader's name, the words in one line as its sub, the box in its body; folded until somebody opens it */
        return { key: "viv:" + state.viv.id + ":sec:" + q.who, title: openTitle(q.who), sub: openSum(q.body), open: false, attrs: 'data-sec="1" data-who="' + esc(q.who) + '"',
          body: '<label class="rlayout rlayout--unit rfield bio-secf"><span>מה אומר/ת</span>' + openBoxHtml(q.who, q.body, ro) + '</label>' };
      },
      remove: ro ? null : { kind: "delete", label: function (q) { return "מחיקת הפסקה של " + openTitle(q.who); }, title: function (q) { return "למחוק את הפסקה של " + openTitle(q.who) + "?"; },
        text: function (q) { return String(q.body || "").trim() ? "הטקסט שלה יימחק." : ""; },
        run: function (q) { return openDel(q.who).then(function () { setTimeout(paint, 0); }); } },
      sortable: ro ? null : { onMove: openMove, handle: ".racc__bar" } }, (live && live.fx) || undefined);   /* a leader's row is dragged up or down by its bar */
  }
  function leadersMenu(btn, onPick) {   /* the leaders, by their full name (a menu is a wide place); one tap picks the person (their email) */
    var seen = {};   /* every leader, again and again: each tap is one more paragraph */
    var people = state.members.map(function (x) { return x.email; }).filter(function (e) { if (seen[e]) return false; return (seen[e] = 1); });
    if (people.length === 1) { onPick(people[0]); return; }   /* one leader: the button itself adds that leader (a menu never has one item) */
    if (!people.length) { toast(state.members.length < 2 ? "אין עוד מובילים בשיתוף" : "כל המובילים כבר כאן"); return; }
    menu(btn, people.map(function (e) { return { label: personName(e), fn: function () { onPick(e); } }; }));
  }
  function openAdd(btn) {   /* "+" of the opening: a paragraph for a leader */
    leadersMenu(btn, function (email) {
      var key = openKey(facShort(email));   /* the row's key (and an older client's title) is the short name at the time; the title follows the person */
      RosterSection.set("viv:" + state.viv.id + ":sec:" + key, true); openPut(key, "", email); paint();   /* the new paragraph is seen, open, at once */
      setTimeout(function () { var bx = [].slice.call(document.querySelectorAll("[data-owho]")).filter(function (x) { return x.dataset.owho === key; })[0]; if (bx) bx.focus(); }, 0);
    });
  }
  function loadItems() {   /* the open vivencia's exercises, start and end music and opening: from its live sources (the first load, or a quiet one again); with none, read once */
    var id = state.viv.id;
    if (!liveViv(id)) return itemsOf(id).then(function (r) { r = r || []; state.items = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); if (state.viv) refreshOffline(state.viv); });   /* the numbered exercises, then the backlog */
    var fresh = live.fresh; live.fresh = false;
    return Promise.all([srcReady(live.items, fresh), srcReady(live.recv, fresh), live.open ? srcReady(live.open, fresh) : null]).then(function (r) {
      if (r[0] == null) throw new Error("load failed");
      if (!state.viv || state.viv.id !== id) return;
      takeItems(); takeRecv(); takeOpen();
      refreshOffline(state.viv);   /* every change is also in the device copy, so the next open draws it at once */
    });
  }
  function printIco() { return I.print; }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id); refreshPrevLabel();
    /* the header's actions (owner 2026-11-26), by priority, each folds into "עוד" when the full title needs its room (the kit's RosterHeader): 1 the heart, 2 sharing
       (the lock or globe for the owner, "שיתוף קישור" for others on a public vivencia), 3 print, 4 rename (only who may edit). Always in "עוד": delete (owner) and
       "הסרה שלי" (a viewer or an editor); with them "עוד" always shows (keep), without them only while something is folded (fold) */
    var pri = 1, P = function () { return ' data-pri="' + (++pri) + '"'; };   /* the heart is 1 */
    var fixedItems = (v.role === "owner" ? [{ label: "מחיקה", icon: I.trash, fn: function () { confirmDelete(v); } }] : []).concat(!state.offline && (v.role === "view" || v.role === "edit") ? [{ label: "הסרה שלי מהוויוונסיה", icon: I.leave, fn: function () { confirmLeave(v); } }] : []);
    var vbtns = '<span class="rhead__acts">' + heartBtnViv(v.id, "") +
      (state.offline ? "" : v.role === "owner" ? (pri++, visBtn(v)) : v.is_public !== false ? '<button type="button" class="rbtn rbtn--icon" data-act="vshare"' + P() + ' aria-label="שיתוף קישור" title="שיתוף קישור">' + I.share + '</button>' : "") +
      '<button type="button" class="rbtn rbtn--icon" data-act="vprint"' + P() + ' aria-label="הדפסה" title="הדפסה">' + printIco() + '</button>' +
      '<button type="button" class="rbtn rbtn--icon" data-act="vmore" data-rmore="' + (fixedItems.length ? "keep" : "fold") + '" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button></span>';
    liveHome(); liveViv(v.id);   /* the vivencias' source (the title below is edited in place on it) and this vivencia's own sources and presence */
    var vEdit = (v.role === "owner" || v.role === "edit") && !state.offline && live.vivs;
    var vpen = vEdit && wide() ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-vpen aria-label="עריכת הנושא" title="עריכת הנושא">' + I.pen + '</button>' : "";   /* the pencil after the name (ui/docs/realtime.md "עריכה במקום מעיפרון"): part of the title's slot, never folded */
    show(head(v.title || "ויוונסיה חדשה", (v.partners || []).join(", "), true, wide() ? '<span id="vtimer" class="rhead__live" hidden aria-live="off"></span>' + vbtns : vbtns, null, vpen, true) +   /* the mark of the exercise that plays sits beside the name; the way to the catalog is a word in the header, not a floating button */
      '<div class="rlist rload" aria-busy="true" data-load="exercise" data-fab-room id="list"></div>' +
      '', function (r) {   /* on a wide screen the way to the catalog is a green banner down the side, added by show() */
      on(r, "back", back); on(r, "add", function () { resetPk(); pk.tab = "ex"; if (wide()) goSub(picker); else { pickerSheet(); if (catApi) catApi.goKind("ex"); } });
      RosterHeader.fit(r.querySelector(".rhead"));   /* the actions that fit are shown, the rest fold into "עוד", before the first paint */
      on(r, "vmore", function (b) {   /* the folded actions first, by priority, then the ones always here (destructive, last) */
        menu(b, RosterHeader.items(r.querySelector(".rhead")).concat(fixedItems));
      });
      on(r, "vprint", function () { printOpening(); });
      var vp = r.querySelector("[data-vpen]"), vh = r.querySelector(".rhead__title");
      if (vp && vh) liveKeep(vp, RosterField.inline(vp, vh, live.vivs, v.id, "title", { required: true, label: "נושא", presence: live.pres, item: "viv", field: "title",
        onEnd: function () { var hd = r.querySelector(".rhead"); if (hd && window.RosterHeader) RosterHeader.fit(hd); } }));   /* the vivencia's title, co-edited in place: saved as it is typed, never left empty */
      if (vEdit && !wide() && vh) {   /* a phone: no pencil; a tap on the name renames it in a short window (owner 2026-11-27, "במובייל לחיצה על השם תקפיץ פופאפ, בלי סמלי עריכה") */
        vh.setAttribute("role", "button"); vh.setAttribute("tabindex", "0"); vh.setAttribute("aria-label", "עריכת הנושא: " + (v.title || ""));
        var vPop = function () {
          RosterSheet.confirm({ id: "vnameDlg", title: "פרטי הוויוונסיה", action: "שמירה",
            fields: [{ name: "title", label: "נושא", value: v.title || "", required: true, source: live.vivs, key: v.id, col: "title" }],
            submit: function (val) { v.title = val.title; vh.textContent = val.title; vh.setAttribute("aria-label", "עריכת הנושא: " + val.title); } });
        };
        vh.addEventListener("click", vPop);
        vh.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); vPop(); } });
      }
      on(r, "more", function (b) { vivMenu(v, b); });
      var sb = r.querySelector('[data-act="vshare"]'); if (sb) sb.addEventListener("click", function (ev) { ev.stopPropagation(); giveLink(location.origin + BASE + v.id, v.title || "ויוונסיה", "הקישור הועתק"); });   /* a public vivencia of somebody else: anyone who sees it can pass on its address (owner 2026-11-25) */
      var vb = r.querySelector('[data-act="vis"]'); if (vb) vb.addEventListener("click", function (ev) { ev.stopPropagation(); sharePopup(v); });   /* the click must not reach the dark side's "tap closes the layer", or the panel it opens is closed at once */
    });
    /* the exercises come from the device's copy at once (the loading state only when there is none); the cloud's answer then corrects them */
    var local = Promise.resolve(null);
    if (window.BioOffline && BioOffline.isSaved(v.id)) local = BioOffline.get(v.id).catch(function () { return null; });
    var cloudDone = false;
    local.then(function (rec) {
      if (!rec || cloudDone || !state.viv || state.viv.id !== v.id || !document.getElementById("list")) return;
      state.items = rec.items || []; state.members = rec.members || []; state.membersFor = v.id;
      recvCache[v.id + "|start"] = []; recvCache[v.id + "|end"] = []; openCache[v.id] = rec.opening || [];
      (rec.reception || []).forEach(function (x) { (recvCache[v.id + "|" + x.kind] = recvCache[v.id + "|" + x.kind] || []).push({ music_id: x.music_id, created_at: x.created_at, music: x.music }); });
      paint();
    });
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) { if (!state.viv || state.viv.id !== v.id) return; state.members = mm || []; state.membersFor = v.id; if (document.getElementById("list")) paint(); }, function () { if (!state.members) state.members = []; });
    loadItems().then(function () {
      cloudDone = true;
      paint();
      refreshOffline(v);
      if (pending && pending.item) {   /* opened on an exercise's own address */
        var want = pending.item; pending = null;
        var it = state.items.filter(function (x) { return x.id === want; })[0];
        if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
      }
    }, function (e) {   /* the exercises did not arrive: if the device had no copy, the list stops waiting and offers "ניסיון נוסף" (the screen is drawn and asked again, the page stays) */
      fail(e);
      var l = document.querySelector("#list[data-fab-room]");
      if (l && l.getAttribute("aria-busy") === "true" && state.viv && state.viv.id === v.id) loaded(l).innerHTML = phErr("לא הצלחנו לטעון את התרגילים", function () { if (state.viv && state.viv.id === v.id) editor(); });
    });
  }
  /* public or private: only an owner sees the button and switches it (the database lets nobody else) */
  function visTip(v) { return v.is_public === false ? "פרטית: רק מי ששיתפת איתו רואה אותה" : "ציבורית: כל המאפשרים רואים אותה"; }
  function visBtn(v) { return '<button type="button" class="rbtn rbtn--icon" data-act="vis" data-pri="2" data-menu-label="שיתוף" aria-haspopup="dialog" aria-label="' + visTip(v) + '" title="' + visTip(v) + '">' + (v.is_public === false ? I.lock : I.globe) + '</button>'; }
  /* a confirmation is the kit's popup with ONE action: closing it is the cancel */
  /* somebody a vivencia was shared with takes themselves off it; it stays with its owner and the others */
  /* every vivencia is kept on the device, always: at each open the cloud and the device are compared and made equal (also what somebody else changed in a vivencia shared with me) */
  /* WHEN the device is compared with the cloud (a full pass): at the app's open (the first list), when the internet comes back, on "לנסות שוב",
     after an upload, and when the list's signature changed (a vivencia came or went, or its row changed: rev, updated_at, role, title, count).
     Not on every reading of the list: a list that is the same as at the last pass that ended well asks nothing.
     In a pass, a vivencia whose own signature is the same as when its copy was last made current is not read again (no exercises, no members);
     one read in this visit whose copy could not be finished is retried from what was read, with no new questions.
     A pass that did not end well waits before the next one by itself: 1, 2, 4… minutes, up to 30 (with no connection it waits for the connection). */
  var syncT = 0, syncOkSig = "", syncFails = 0, syncNextAt = 0, syncRetryT = 0, vivSyncSig = {}, vivSyncRec = {};
  function vivSig(v) { return [v.id, v.updated_at, v.role, v.title, v.is_public, v.vivencia_items && v.vivencia_items[0] && v.vivencia_items[0].count].join("|"); }   /* rev is not in it: the list's own reading does not carry it (only the live source does), and the two must give the same signature */
  function syncOffline(force) {   /* force: true (the internet back, the retry) skips the signature and the wait; "all" (an upload) also reads every vivencia again */
    if (state.offline || !window.BioOffline || !state.vivsLoaded || navigator.onLine === false) return;
    var list = state.vivs.slice(), sigs = {}; list.forEach(function (v) { sigs[v.id] = vivSig(v); });
    var all = list.map(function (v) { return sigs[v.id]; }).join(";");
    if (!force && (all === syncOkSig || Date.now() < syncNextAt)) return;
    if (force === "all") { vivSyncSig = {}; vivSyncRec = {}; }
    syncT = Date.now(); clearTimeout(syncRetryT); syncRetryT = 0;
    BioOffline.sync(list, function (v) {
      if (vivSyncSig[v.id] === sigs[v.id] && BioOffline.isSaved(v.id)) return Promise.resolve(null);   /* unchanged since its copy was made current: nothing is asked */
      var c = vivSyncRec[v.id]; if (c && c.sig === sigs[v.id]) return Promise.resolve(c.rec);   /* read in this visit, its copy not finished: tried again from what was read */
      return Promise.all([itemsOf(v.id), api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } })]).then(function (r) {
        var items = r[0] || [];
        var rec = { id: v.id, row: { id: v.id, title: v.title, created_at: v.created_at, updated_at: v.updated_at, partners: v.partners || [], is_public: v.is_public, vivencia_items: [{ count: items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: items, members: r[1] || [], reception: recvRows(v.id), opening: openCache[v.id] || [] };
        vivSyncRec[v.id] = { sig: sigs[v.id], rec: rec };
        return rec;
      });
    }).then(function (res) {
      if (!res) return;   /* joined a pass that was already running */
      var good = !res.stopped;
      list.forEach(function (v) {
        if (res.saved[v.id]) { vivSyncSig[v.id] = sigs[v.id]; delete vivSyncRec[v.id]; }
        else if (!(res.skipped[v.id] && vivSyncSig[v.id] === sigs[v.id])) good = false;   /* not current and not unchanged: this pass did not end well */
      });
      if (good) { syncOkSig = all; syncFails = 0; syncNextAt = 0; return; }
      syncOkSig = "";
      var wait = Math.min(30 * 60000, 60000 * Math.pow(2, syncFails++));
      syncNextAt = Date.now() + wait;
      syncRetryT = setTimeout(function () { syncRetryT = 0; syncOffline(); }, wait + 100);   /* with no connection it does nothing; the connection's return starts a pass (syncStopped) */
    }, function () { syncFails++; syncNextAt = Date.now() + Math.min(30 * 60000, 60000 * Math.pow(2, syncFails - 1)); });
  }
  function refreshOffline(v) {   /* an open vivencia is already read: its copy is made current from that, quietly */
    if (state.offline || !window.BioOffline || v.role === "public") return;   /* somebody else's public vivencia is not kept on this device */
    /* the open vivencia's people are already read (editor, once per open; vivsAgain, on a real change): the copy takes them, nothing is asked */
    var open = state.membersFor === v.id && state.members;   /* membersFor: whose people state.members holds (a vivencia opened a moment ago still holds the last one's) */
    (open ? Promise.resolve(state.members) : api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } })).then(function (mm) {
      return BioOffline.update({ id: v.id, row: { id: v.id, title: v.title, created_at: v.created_at, updated_at: v.updated_at, partners: v.partners || [], is_public: v.is_public, vivencia_items: [{ count: state.items.filter(function (i) { return !i.backlog; }).length }] }, role: v.role, pos: v.pos, items: state.items, members: mm || [], reception: recvRows(v.id), opening: openCache[v.id] || [] });
    }, function () { /* the old copy stays */ });
  }
  /* coming back to the app, or the internet coming back, is another comparison (not more than once a minute) */
  document.addEventListener("visibilitychange", function () { if (!document.hidden && Date.now() - syncT > 60000 && state.vivsLoaded && !state.offline) loadVivs().catch(function () { /* no internet now */ }); });
  function confirmLeave(v) {
    RosterSheet.confirm({ title: "הסרה מהוויוונסיה", text: 'להסיר את עצמך מ"' + esc(v.title || "ויוונסיה ללא נושא") + '"? היא נשארת אצל הבעלים ואצל מי שהיא משותפת איתו. כדי לחזור צריך שישתפו אותה איתך שוב.', action: "הסרה",run: function (dlg, btn) {
      RosterBusy(btn, api("/rest/v1/rpc/leave_vivencia", { method: "POST", json: { v: v.id } })).then(function () {
        dlg.close(); if (window.BioOffline) BioOffline.remove(v.id); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    } });
  }
  function confirmDelete(v) {
    RosterSheet.confirm({ title: "מחיקת ויוונסיה", text: 'למחוק את "' + esc(v.title || "ויוונסיה ללא נושא") + '" ואת כל התרגילים שבה? אי אפשר לשחזר.', action: "מחיקה",run: function (dlg, btn) {
      RosterBusy(btn, api("/rest/v1/vivencias?id=eq." + v.id, { method: "DELETE" })).then(function () {
        dlg.close(); if (window.BioOffline) BioOffline.remove(v.id); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    } });
  }
  /* A SECTION KEPT ACROSS DRAWINGS (ui/docs/list.md: "the sections are written once, and in the body a list"): a new bar only when what it says changed (its count,
     its time, its actions), the section's body (.racc__body > div) and the kit's list in it are never drawn again, so nothing in them blinks or loses its focus.
     p: the record of the last drawing ({ el, sig, body, box }) or null; html: the section (RosterSection.html, lazy when it has a body: the kit writes it empty and the
     kept box goes in); place(el): puts a new section where it belongs. Returns the record. */
  function twinIn(root, x) {   /* the same control in a new bar: the head, or the button with the same data-* */
    if (x.classList.contains("racc__head")) return root.querySelector(".racc__head");
    var a = [].filter.call(x.attributes, function (n) { return /^data-/.test(n.name); })[0];
    return a ? root.querySelector("[" + a.name + (a.value ? '="' + CSS.escape(a.value) + '"' : "") + "]") : null;
  }
  function secKeep(p, html, body, place) {
    if (p && p.sig === html && p.el.isConnected) return p;
    var t = document.createElement("template"); t.innerHTML = html; var ne = t.content.firstElementChild;
    ne.removeAttribute("data-racc-lazy");   /* the body is ours: no fill of the kit */
    if (p && p.el.isConnected && p.body === body) {   /* the same shape: only the bar is new */
      var ob = p.el.querySelector(":scope > .racc__bar"), nb = ne.querySelector(":scope > .racc__bar");
      var oh = ob.querySelector(".racc__head"), nh = nb.querySelector(".racc__head");
      if (oh && nh) nh.setAttribute("aria-expanded", oh.getAttribute("aria-expanded"));   /* open or closed as it is now */
      var fo = document.activeElement, back = fo && ob.contains(fo) ? twinIn(nb, fo) : null;
      p.el.replaceChild(nb, ob);
      if (back) back.focus({ preventScroll: true });
      p.sig = html; return p;
    }
    var box = p && p.box && body ? p.box : null;
    if (body) { var inner = ne.querySelector(":scope > .racc__body > div"); if (box) inner.parentNode.replaceChild(box, inner); else box = inner; }
    if (p && p.el.parentNode) p.el.parentNode.replaceChild(ne, p.el); else place(ne);
    return { el: ne, sig: html, body: body, box: box };
  }
  /* the four parts of a vivencia, in their order, kept on its list (#list is drawn anew for each vivencia, so a new vivencia starts with none) */
  var VIV_PARTS = ["start", "open", "ex", "end"];
  function vivPart(l, kind, o) {   /* o: the section's options (with hasBody), or null: the part is not shown. Returns the body's box or null */
    var parts = l.__parts, p = parts[kind];
    if (!o) { if (p) { p.el.remove(); delete parts[kind]; } return null; }
    var body = !!o.hasBody; delete o.hasBody; o.lazy = body || undefined;
    parts[kind] = secKeep(p, vivSec(kind, o), body, function (ne) {
      var nx = null; VIV_PARTS.slice(VIV_PARTS.indexOf(kind) + 1).some(function (k) { nx = parts[k] && parts[k].el.parentNode === l ? parts[k].el : null; return !!nx; });
      l.insertBefore(ne, nx);
    });
    return parts[kind].box;
  }
  function openItem(id) {   /* a card of the vivencia opens its exercise; a second press on the open one (beside the list) closes it */
    var it = state.items.filter(function (x) { return x.id === id; })[0]; if (!it) return;
    if (wide() && liveItem && liveItem.id === id) {
      liveItem = null; state.lastItem = null; show(phPick(), null, "d"); markItem(); setUrl(BASE + state.viv.id); return;
    }
    if (wide()) itemScreen(it); else go(function () { itemScreen(it); });
  }
  /* THE EXERCISES OF A VIVENCIA (ui/docs/list.md, list 10): the kit's list of cards in the body of "ויוונסיה", in two groups: the numbered ones (the kit numbers
     them, also right after a move) and "נוספים" after its divider, with the centred empty line while it is empty (only for who may edit). The order is dragged
     across both (persistGroups), the X takes an exercise out with the kit's confirm (it stays in the catalog), the open one beside the list is current, the one
     whose song plays carries the wave. A change from somebody else is an update by key, never a repaint */
  function exList(box) {
    var edit = canEdit();
    var L = RosterList.render(box, state.items, { kind: "card", key: function (i) { return i.id; }, group: function (i) { return i.backlog ? "back" : "main"; },
      groups: [{ key: "main", number: true, show: edit || undefined }, { key: "back", label: "נוספים", attrs: "data-div", empty: edit ? "גררו לכאן תרגיל שעוד לא החלטתם עליו" : "" }],
      attrs: function (i) { return 'data-card="item" data-edit="' + esc(i.id) + '" data-auds="' + esc(audOf(i)) + '" data-chosen="' + esc(chosenOf(i)) + '" data-icard="' + esc(i.id) + '"' + (i.backlog ? ' data-back="1"' : ''); },
      content: function (i) {   /* the number is the lead (the kit's), "•" in נוספים; the name and the leader's chip, the length and name of the chosen song, its play tile */
        var m = i.music, d = m ? durOf(m) : 0;
        return { lead: i.backlog ? "•" : null, title: itemName(i), chip: facChip(i, ""), num: d ? clock(d) : "", sub: m ? songName(m) : "בלי מוזיקה", act2: cardActs(m ? pillCount(cardPill(m), optList(i).length) : "") };
      },
      onOpen: function (i) { openItem(i.id); },
      current: function (i) { return wide() && state.lastItem === i.id; },
      playing: function (i) { return playsIn(audOf(i)); },
      remove: edit ? { kind: "remove", label: function (i) { return "הסרה של " + itemName(i) + " מהוויוונסיה"; }, title: function (i) { return "להסיר את " + itemName(i) + " מהוויוונסיה?"; }, text: function () { return "התרגיל נשאר בקטלוג."; },
        run: function (i) {
          var vid = state.viv.id;
          return api("/rest/v1/vivencia_items?id=eq." + i.id, { method: "DELETE" }).then(function () {
            if (!state.viv || state.viv.id !== vid) return;
            state.items = state.items.filter(function (x) { return x.id !== i.id; });
            if (state.lastItem === i.id) { state.lastItem = null; if (wide() && liveItem && liveItem.id === i.id) { liveItem = null; show(phPick(), null, "d"); setUrl(BASE + vid); } }
            refreshOffline(state.viv); setTimeout(paint, 0);   /* the bar's count and time follow once the card is out */
          }, function (e) { fail(e); throw e; });
        } } : null,
      sortable: edit ? { onMove: persistGroups } : null }, (live && live.fx) || undefined);   /* a change from a source comes with the kit's effects (withFx) */
    var g = box.querySelector(":scope > .rgrid"); if (g && g.id !== "plist") g.id = "plist";   /* the grid of the exercise cards keeps its name */
    return L;
  }
  function exListApi() { var l = document.getElementById("list"), p = l && l.__parts && l.__parts.ex; return p && p.box && p.box.__rlist || null; }
  function vivWire(l) {   /* the vivencia's list, once: ONE listener for what is the app's inside it (the leader's chip, the parts' bar buttons) */
    if (l.__vw) return; l.__vw = true;
    l.addEventListener("click", function (ev) {
      var fb = ev.target.closest && ev.target.closest("[data-fac]");
      if (fb && l.contains(fb)) { ev.stopPropagation(); var fi = state.items.filter(function (x) { return x.id === fb.dataset.fac; })[0]; if (fi) facMenu(fb, fi); return; }   /* the leader's click is its own */
      var sa = ev.target.closest("[data-secadd]"); if (sa && l.contains(sa)) { openAdd(sa); return; }
      var pb = ev.target.closest("[data-recvplay]");
      if (pb && l.contains(pb)) {
        var kind0 = pb.dataset.recvplay, nw = window.__bioNow || {}, sec = l.querySelector('[data-recv="' + kind0 + '"]'); if (!sec) return;
        var songs = [].slice.call(sec.querySelectorAll(".rcard[data-song]")), mine = recvPlaying(kind0) ? songs.filter(function (x) { return x.dataset.song === nw.name; })[0] : null;
        cardPlay(mine || songs[0]);   /* a song of this part is loaded: it plays or pauses; otherwise the part starts from its first song */
        return;
      }
      var rc = ev.target.closest("[data-recv]"); if (!rc || !l.contains(rc)) return;
      if (ev.target.closest("[data-audio], a")) return;
      var kind = rc.dataset.recv, rpb = ev.target.closest("[data-recvloop]");
      if (rpb) {   /* a setting, not a player: lit, the songs of this part go on one after the other, round and round; off, a song plays alone */
        var now = rpb.getAttribute("aria-pressed") !== "true";
        try { localStorage.setItem("biodanza.loop." + state.viv.id + "." + kind, now ? "1" : "0"); } catch (e) { /* kept for this visit only */ }
        rpb.setAttribute("aria-pressed", String(now)); registerLists();
        return;
      }
      if (ev.target.closest("[data-addm]")) openAddMusic(recvItem(kind), function () { paint(); });
    });
  }
  function paint() {
    refreshPrevLabel();
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-vc="' + state.viv.id + '"] [data-nn]'); if (cnt) cnt.textContent = state.items.filter(function (i) { return !i.backlog; }).length;
    /* an empty vivencia is drawn in its usual shape (reception music, opening, the exercises with their +, the end), never as an empty-state page: the owner's word, 2026-11-25 */
    var main = state.items.filter(function (i) { return !i.backlog; }), back = state.items.filter(function (i) { return i.backlog; });
    var totSec = main.reduce(function (n, i) { return n + (i.music ? (durOf(i.music) || 0) : 0); }, 0);   /* the length of the chosen songs of the exercises, one after the other */
    var totTxt = totSec > 0 ? (totSec >= 3600 ? Math.floor(totSec / 3600) + ":" + ("0" + Math.floor(totSec % 3600 / 60)).slice(-2) + ":" + ("0" + Math.floor(totSec % 60)).slice(-2) : Math.floor(totSec / 60) + ":" + ("0" + Math.floor(totSec % 60)).slice(-2)) : "";
    var exAdd = canEdit() ? '<button type="button" class="rbtn rbtn--icon" data-addex data-racc-open aria-haspopup="menu" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>' : '';   /* the exercises have a title like the songs of the start, with a plus at its other end; the time is the length of the chosen songs */
    if (!l.__parts) { loaded(l); l.textContent = ""; l.__parts = {}; }   /* the first drawing of this vivencia: the loading (or a failure) goes, the parts come */
    var startBox = vivPart(l, "start", recvPart("start")), openBox = vivPart(l, "open", openingPart());
    var exBox = vivPart(l, "ex", { title: "ויוונסיה", count: main.length, attrs: "data-exsec", time: totTxt, actions: exAdd, hasBody: !!(main.length || back.length || canEdit()) });
    var endBox = vivPart(l, "end", recvPart("end"));
    RosterSection.bind(l);
    vivWire(l);
    if (startBox) recvList(startBox, "start");
    if (openBox) openingFill(openBox);
    if (exBox) exList(exBox);
    if (endBox) recvList(endBox, "end");
    /* the list has a scrollbar at its left edge that takes room from the cards: the header above gives its left side the same room, so its button is over the cards' edge */
    var sbw = Math.max(0, l.offsetWidth - l.clientWidth); pl.style.setProperty("--sbw", sbw + "px");
    registerLists();
  }
  function paintKeep() {   /* a repaint after a saved move: the focus stays on the item that moved (a card, or a leader's head), in its new place */
    var a = document.activeElement, q = null, at = function (n, v) { return '[' + n + '="' + CSS.escape(v) + '"]'; };
    if (a && a.closest) { var c = a.closest("[data-icard], .rcard[data-opt], [data-sec]"); if (c && c.hasAttribute("data-sec") && a.matches(".racc__head")) q = at("data-who", c.dataset.who) + " > .racc__bar .racc__head"; else if (c && a === c) q = c.dataset.icard ? at("data-icard", c.dataset.icard) : c.closest("[data-recv]") ? at("data-recv", c.closest("[data-recv]").dataset.recv) + " " + at("data-opt", c.dataset.opt) : null; }
    paint();
    var n = q && document.querySelector(q); if (n && document.activeElement !== n) n.focus({ preventScroll: true });
  }
  function persistRecv(kind, ids) {   /* the start or end music in its new order (the kit's sortable list): one Promise; the cache changes only once the save succeeded */
    var id = state.viv.id, key = id + "|" + kind;
    return Promise.all(ids.map(function (mid, k) { return api("/rest/v1/vivencia_reception_music?vivencia_id=eq." + id + "&kind=eq." + kind + "&music_id=eq." + mid, { method: "PATCH", prefer: "return=minimal", json: { position: k + 1 } }); })).then(function () {
      var by = {}; (recvCache[key] || []).forEach(function (o) { by[o.music_id] = o; });
      recvCache[key] = ids.map(function (mid, k) { var o = by[mid]; if (o) o.position = k + 1; return o; }).filter(Boolean);
      if (state.viv && state.viv.id === id) { refreshOffline(state.viv); paintKeep(); }
    }, function (e) { fail(e); throw e; });   /* failed: the kit puts the cards back */
  }
  /* beside the list the open exercise's strip is marked at once, wherever it was opened from (a click, the arrows, a swap) */
  function markItem() {
    var L = exListApi(); if (L) L.states();   /* the kit's list writes the current state (wide() && state.lastItem) */
  }
  function persistGroups(groups) {   /* the exercise cards in their new order, [numbered, "נוספים"] (the kit's sortable list): one Promise; state.items changes only once the save succeeded */
    var id = state.viv.id, by = {}, main = groups[0] || [], all = main.concat(groups[1] || []), jobs = [];
    state.items.forEach(function (i) { by[i.id] = i; });
    all.forEach(function (iid, k) { var it = by[iid], isBack = k >= main.length; if (!it || (it.position === k + 1 && !!it.backlog === isBack)) return; jobs.push(api("/rest/v1/vivencia_items?id=eq." + iid, { method: "PATCH", json: { position: k + 1, backlog: isBack } })); });
    return Promise.all(jobs).then(function () {
      if (!state.viv || state.viv.id !== id) return;
      all.forEach(function (iid, k) { var it = by[iid]; if (it) { it.position = k + 1; it.backlog = k >= main.length; } });
      state.items = all.map(function (iid) { return by[iid]; }).filter(Boolean).concat(state.items.filter(function (i) { return all.indexOf(i.id) < 0; }));
      refreshOffline(state.viv); paintKeep();
    }, function (e) { fail(e); throw e; });   /* failed: the kit puts the cards back, and the state never changed */
  }
  function persistVivs(from, to, row) {   /* row: the row that was moved, it shows the wait until the order is saved (law 7) */
    var moved = state.vivs.splice(from, 1)[0]; state.vivs.splice(to, 0, moved);
    var uid = FLOA_AUTH.userId();
    RosterBusy(row, Promise.all(state.vivs.map(function (v, k) {
      if (v.pos === k + 1) return null;
      v.pos = k + 1;
      return v.role === "owner" ? api("/rest/v1/vivencia_owners?vivencia_id=eq." + v.id + "&user_id=eq." + uid, { method: "PATCH", json: { position: k + 1 } })
                                : api("/rest/v1/rpc/set_share_position", { method: "POST", json: { v: v.id, pos: k + 1 } });
    })).then(function () { renderVivs(); }, fail));
  }

  /* ---------- one item: music, poetics, guidance, notes ---------- */
  /* narrow screen: an exercise of a vivencia is a popup from the bottom (the kit's sheet), over the vivencia's list. It is a SCREEN for the browser's history (its
     own address /<vivencia>/<exercise>, one entry), not a popup with a marker entry: Back, the X, a swipe down and the header's middle button all end on the list. */
  (function () {
    var st = document.createElement("style");
    st.textContent = "#itemDlg { height: var(--rs-vvh, 100dvh); max-height: none; padding-top: var(--safe-t, 0px); transform: translateY(var(--rs-dy, 0px)) } @media (min-width: 760px) { #itemDlg { height: calc(100dvh - 48px); max-height: calc(100dvh - 48px); padding-top: 0 } } " +
      "#itemDlg .sheet-head, #itemDlg .sheet-head * { touch-action: none } #itemHost { position: relative } ";   /* the shell is the kit's: the body is only the wrapper of the page's own scroll area (#iscroll, the kit's .rlist) */
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
    /* the exercise's own header (the tabs of the exercises around it) TAKES the place of the sheet's header: one header, never a header inside a header */
    var hm = html.match(/^<header class="[^"]*">[\s\S]*?<\/header>/), sh = dlg.querySelector(".sheet-head");
    if (hm) { var tpl = document.createElement("template"); tpl.innerHTML = hm[0]; var nh = tpl.content.firstElementChild; nh.classList.add("rlayout__head", "sheet-head"); nh.setAttribute("data-rs-drag", ""); nh.setAttribute("data-rs-drag-all", ""); sh.replaceWith(nh); html = html.slice(hm[0].length); }
    var host = dlg.querySelector("#itemHost"); host.innerHTML = html; if (wire) wire(dlg.querySelector(".sheet"));
  }
  /* the page of an exercise, below its header: the songs (cards), the texts. ro: the catalog's exercise, only read (no facilitators, no notes, the texts are not edited) */
  function itemPageHtml(it, ro) {
    function hideEmpty(k, html) { return html; }   /* the catalog's exercise (read-only) shows only the fields that have words: the kit hides an empty read-only field (CSS :has, ui/docs/field.md); a vivencia's exercise keeps them all, to be written in */
    var mus = '<div id="imus">' + musCards(it, ro) + '</div>';   /* the songs this exercise is torn between, as cards: the chosen one plays in the vivencia; on a catalog exercise they come first, above the texts (owner, 2026-11-25) */
    return '<style>#ipg, #ipg * { touch-action: pan-y } #ipg textarea, #ipg .rf-rich { max-height: none } #ipg:has(#ifields:not([data-ro])) #imus [data-audio] { display: none } #ipg { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0 } #iscroll { overscroll-behavior: contain } #iscroll > *, #iplay { flex: none }</style><div id="ipg">' +   /* nothing between the header and the scroller: the content goes right under the header's edge, where its shadow is */
      '<div id="iscroll" class="rlist">' + (ro ? mus : '') +   /* the kit's scroll area: --gap under the header, inside it, the same in a sheet and in a pane */   /* everything under the name scrolls together; ONE parent: its gap sequences the fields, the songs and the end room. Its sides are padded one level down, where the background is painted (law 2): the fields' box pads itself, the music section pads its row and its body (the kit's section rule), so the cards line up with the fields at --gap */
      '<div id="itop" class="rlayout rlayout--bars rlayout--pad-x">' +   /* Layout: a column that pads its sides; the big play sits right on the fields box (gap 0, as before: the parent sequences, no margin on a child) */
      (!ro && wide() && it.music && it.music.audio_object ? '<div id="iplay" class="rmid">' + bigPlay(it.music) + heartBtnEx(it.exercise_id || ("item:" + it.id), "") + '</div>' : '') +   /* the big play (computer only) is a sibling of the fields box, not one of the fields; the exercise's heart on its end side (.rmid), not in the header */
      '<div id="ifields" class="rlayout"' + (ro ? ' data-ro' : '') + '>' + hideEmpty("poetics", '<label class="rlayout rlayout--unit rfield"><span>פואטיקה</span><div id="ipo" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "poetics") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "poetics")) + '</div>' + (isDraft(it, "poetics") ? DRAFT_CHIP : "") + '</label>') +
      hideEmpty("guidance", '<label class="rlayout rlayout--unit rfield"><span>הנחיה</span><div id="igu" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true"' + (isDraft(it, "guidance") ? DRAFT_FIELD : "") + '>' + rtHtml(txt(it, "guidance")) + '</div>' + (isDraft(it, "guidance") ? DRAFT_CHIP : "") + '</label>') +
      (ro && it.exercises && it.exercises.emphasis ? '<label class="rlayout rlayout--unit rfield"><span>הערות</span><div id="iem" class="rf-rich" contenteditable="false" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.exercises.emphasis) + '</div></label>' : '') +
      (ro ? '' : '<label class="rlayout rlayout--unit rfield"><span>הערות</span><div id="it" class="rf-rich" contenteditable="' + (ro ? 'false' : 'true') + '" spellcheck="false" role="textbox" aria-multiline="true">' + rtHtml(it.notes || "") + '</div></label>') + '</div></div>' +   /* closes #ifields, then #itop */
      (ro ? '' : mus) + '</div></div>';   /* the end room is the scroll area's own end padding (the kit's .rlist), no spacer */
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
    trk._base = base; trk.style.setProperty("--step", (tabsDist(trk, 1) || tabsDist(trk, -1) || cw / 3) + "px"); trk.style.setProperty("--tx", base + "px");   /* --step: from one tab's middle to the next, the whole way of the play and heart's fade */
     trk.classList.add("is-ready");
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
    var host = pg.parentElement, hr = host.getBoundingClientRect(), r = pg.getBoundingClientRect(), g = pg.cloneNode(true), rtl = getComputedStyle(host).direction === "rtl";
    g.removeAttribute("id");   /* the ids inside stay (the styles are by id); the new page is before the copy in the document */
    return { g: g, start: rtl ? hr.right - r.right : r.left - hr.left, top: r.top - hr.top, w: r.width, h: r.height, tf: pg.style.transform || "", sign: rtl ? 1 : -1 };   /* start: from the host's inline-start edge; sign: the physical way of "toward the previous page" */
  }
  function ghostRun(o, dir) {
    if (!o) return;
    var np = document.querySelector("#itemDlg #ipg"), host = np && np.parentElement; if (!host) return;
    var g = o.g; g.style.cssText = "position:absolute;inset-inline-start:" + o.start + "px;top:" + o.top + "px;width:" + o.w + "px;height:" + o.h + "px;margin:0;pointer-events:none;overflow:hidden;z-index:0;transform:" + (o.tf || "none") + ";transition:none";
    host.appendChild(g);
    requestAnimationFrame(function () { requestAnimationFrame(function () { g.style.transition = "transform .26s cubic-bezier(.2, .8, .2, 1)"; g.style.transform = "translateX(" + (-dir * o.sign * 100) + "%)"; }); });
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
      var pside = pg && getComputedStyle(pg).direction === "rtl" ? 1 : -1;   /* the physical way of "toward the previous page" (RTL: right), for the slides below */
      sbSync(r);
      r.style.overflowX = "clip";   /* a page sliding in from the side must not make the window scroll sideways */
      if (pg && sf && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        pg.style.transform = "translateX(" + (sf * pside * 100) + "%)";
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
          d.style.cssText = "position:absolute;inset-inline-start:" + (pside > 0 ? host.clientWidth - pg.offsetLeft - pg.offsetWidth : pg.offsetLeft) + "px;top:" + pg.offsetTop + "px;width:" + pg.offsetWidth + "px;height:" + pg.offsetHeight + "px;overflow:hidden;pointer-events:none;z-index:0;transform:translateX(" + (pair[1] * pside * 100) + "%)";
          host.appendChild(d); nb[pair[1]] = d;
        });
      }
      function nbDrag(dx) { nbEnsure(); if (!nb) return; Object.keys(nb).forEach(function (k) { nb[k].style.transition = "none"; nb[k].style.transform = "translateX(calc(" + (k * pside * 100) + "% + " + dx + "px))"; }); }
      function nbSettle() { if (!nb) return; var o = nb; nb = null; Object.keys(o).forEach(function (k) { o[k].style.transition = "transform var(--t-base) var(--ease)"; o[k].style.transform = "translateX(" + (k * pside * 100) + "%)"; }); setTimeout(function () { Object.keys(o).forEach(function (k) { o[k].remove(); }); }, 260); }
      function nbLeave(dir) { if (!nb) return; var el = nb[-dir]; if (el) { el.style.transition = "transform .16s ease-in"; el.style.transform = "translateX(0)"; } }   /* the page that was beside comes to the middle as the old one goes */
      function walkSwipe(to) { var keep = nb; nb = null; repNext = true; state.slideFrom = 0; stack().pop(); go(function () { itemScreen(to); }); if (keep) Object.keys(keep).forEach(function (k) { keep[k].remove(); }); }
      function walk(to) { repNext = true; var dir = to === nextIt ? -1 : 1; state.slideFrom = dir; if (wide()) return itemScreen(to); var ghost = ghostOfPage(); stack().pop(); go(function () { itemScreen(to); }); ghostRun(ghost, dir); }
      on(r, "prevW", function () { if (prevIt) walk(prevIt); });
      on(r, "nextW", function () { if (nextIt) walk(nextIt); });
      on(r, "closeIt", function () { liveItem = null; state.lastItem = null; show(phPick(), null, "d"); markItem(); setUrl(BASE + state.viv.id); });   /* the X: the exercise closes and is no longer the chosen one */
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
        if (idx === 2 && ev.target.closest("[data-namepop]")) { itemNamePop(it); return; }   /* a phone: a tap on the current name renames it in a short window (owner 2026-11-27) */
        if (idx === 2 || !to2) return;
        repNext = true; var dir2 = idx < 2 ? -1 : 1; state.slideFrom = dir2; var ghost2 = ghostOfPage(); stack().pop(); go(function () { itemScreen(to2); }); ghostRun(ghost2, dir2);
      });
      if (trk) trk.addEventListener("keydown", function (ev) { if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("[data-namepop]")) { ev.preventDefault(); itemNamePop(it); } });   /* the name is a button: Enter and Space open the window too */
      if (hdrEl && !hdrEl.__tapFix) {   /* the header holds the finger for the swipe: a tap can then land on the header itself; it is given to what is under the finger */
        hdrEl.__tapFix = 1;
        var tap0 = null, hitSel = "[data-namepop], [data-fac]";
        hdrEl.addEventListener("pointerdown", function (ev) { tap0 = { x: ev.clientX, y: ev.clientY, t: Date.now() }; }, true);
        hdrEl.addEventListener("pointerup", function (ev) {   /* a tap is decided by the finger itself: a small movement of a real finger must not turn it into a swipe that eats the click */
          var t0 = tap0; tap0 = null; if (!t0) return;
          if (Math.hypot(ev.clientX - t0.x, ev.clientY - t0.y) > 12 || Date.now() - t0.t > 600) return;
          if (ev.target.closest && ev.target.closest("[data-fac], .bio-tab__x")) return;   /* a real button gets its own click: delivering one by hand as well opens its menu and the second click closes it */
          var hit = document.elementsFromPoint(ev.clientX, ev.clientY).filter(function (e) { return e.matches && e.matches(hitSel); })[0]; if (!hit) return;
          hdrEl.__tapAt = Date.now();
          setTimeout(function () { hdrEl.__syn = true; hit.click(); hdrEl.__syn = false; }, 0);
        }, true);
        hdrEl.addEventListener("click", function (ev) {
          if (hdrEl.__syn) return;   /* our own click for a tap */
          if (Date.now() - (hdrEl.__tapAt || 0) < 700 && ev.target.closest && ev.target.closest(hitSel)) { ev.stopPropagation(); ev.preventDefault(); return; }   /* the browser's click for the same tap: already done */
          if (ev.target.closest && ev.target.closest("[data-namepop], [data-fac]")) return;
          var hit = document.elementsFromPoint(ev.clientX, ev.clientY).filter(function (e) { return e.matches && e.matches("[data-namepop], [data-fac]"); })[0];
          if (hit) { ev.stopPropagation(); hit.click(); }
        }, true);
      }
      if (trk) { tabsCenter(trk); if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (trk.isConnected) tabsCenter(trk); }); }
      var imus = r.querySelector("#imus");
      if (imus) {
        var repaintMus = function () { musPaint(imus, it); };   /* the kit's list follows by key: no card is drawn again for nothing */
        repaintMus();
        imus.addEventListener("click", function (ev) {
          if (ev.target.closest("[data-audio], a")) return;
          if (ev.target.closest("[data-addm]")) { openAddMusic(it, function () { repaintMus(); if (wide()) paint(); }); return; }
          var ch = ev.target.closest("[data-choose]");
          if (ch) {   /* the one that plays in the vivencia */
            var m = optList(it).filter(function (x) { return x.id === ch.dataset.choose; })[0]; if (!m || m.id === it.music_id) return;
            confirmChoose(songName(m), itemName(it) || "התרגיל", function () { return setChosen(it, m).then(function () { repaintMus(); if (wide()) paint(); }, fail); });
            return;
          }
          /* a tap on the card plays the song, as on the music page: the kit's card binding (cardPlay) */
        });
      }
      /* the three fields share the height that is left, by how many lines each has: all of it if it fits; if not, each gets its share and scrolls on its own */
      var box = r.querySelector("#ifields"), tas = ["#ipo", "#igu", "#it"].map(function (q) { return r.querySelector(q); });
      tas.forEach(function (t) { if (t) rtInit(t); });
      if (state.offline) tas.forEach(function (t) { if (t) t.setAttribute("contenteditable", "false"); });   /* with no internet it is only read (the app's whole offline state, declared) */
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
      ["#ipo", "#igu"].forEach(function (q) { var t = r.querySelector(q); t.addEventListener("input", function () { if (!t.hasAttribute("data-draft")) return; t.removeAttribute("data-draft"); var mk = t.parentNode.querySelector(":scope > [data-draft-mark]"); if (mk) mk.remove(); }); });
      layoutFields(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutFields);
      if (window.ResizeObserver && box) new ResizeObserver(layoutFields).observe(box);
      /* the four fields are co-edited (RosterField.live on the open vivencia's exercises source, ui/docs/realtime.md): saved as they are typed, merged with
         whoever else writes in them, their carets inside, and nothing to say when all is saved. Poetics and guidance equal to the catalog's text keep inheriting it (null).
         The name is edited in place from its pencil (RosterField.inline): empty, or the catalog's name, keeps the catalog's */
      var inherit = function (k) { return { fromValue: function (v, row) { return v != null ? v : baseTxt(row || it, k); }, toValue: function (t) { return t === baseTxt(it, k) ? null : t; } }; };
      if (live.items && state.viv && live.vid === state.viv.id) {
        liveSweep();
        [["poetics", tas[0], inherit("poetics")], ["guidance", tas[1], inherit("guidance")], ["notes", tas[2], {}]].forEach(function (f) {
          if (!f[1]) return;
          var o = f[2]; o.presence = live.pres; o.item = it.id; o.field = f[0]; o.readOnly = !canEdit(); o.onLocal = function () { layoutFields(); };
          liveKeep(f[1], RosterField.live(f[1], live.items, it.id, f[0], o));
        });
        var pen = r.querySelector("[data-namepen]"), nmEl = r.querySelector("#ina");
        if (pen && nmEl) liveKeep(pen, RosterField.inline(pen, nmEl, live.items, it.id, "title", { label: "שם התרגיל", presence: live.pres, item: it.id, field: "title",
          fromValue: function (v, row) { return v || name((row || it).exercises || {}); }, toValue: function (t) { t = String(t || "").trim(); return !t || t === name(e) ? null : t; } }));
      }
      if (pg) pg.addEventListener("focusout", function () { setTimeout(function () { if (liveItem && liveItem.pending && pg.isConnected && !pg.contains(document.activeElement)) { var f = liveItem.pending; liveItem.pending = null; itemScreen(f); } }, 0); });
      liveItem = { id: it.id, root: r.querySelector("#ina") || pg, prev: prevIt && prevIt.id, next: nextIt && nextIt.id, apply: function (fresh) {   /* a change of the exercise from its source: the texts are the fields' own; here only the song strip and the neighbours */
        var inField = r.contains(document.activeElement) && (/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName) || document.activeElement.classList.contains("rf-rich")), k2 = fresh.id === it.id ? state.items.indexOf(fresh) : -1;
        var pid = state.items[k2 - 1] && state.items[k2 - 1].id, nid = state.items[k2 + 1] && state.items[k2 + 1].id;
        if (fresh.music_id !== it.music_id && fresh.exercise_id === it.exercise_id) { it.music_id = fresh.music_id; it.music = fresh.music; }
        if (fresh.exercise_id !== it.exercise_id || pid !== liveItem.prev || nid !== liveItem.next) {   /* another exercise or other neighbours: the screen is drawn again, as soon as nobody is typing in it */
          if (!inField) { itemScreen(fresh); return; }
          liveItem.pending = fresh;
        }
        layoutFields(); it = fresh;
      } };
      on(r, "del", function () { confirmRemoveItem(it); });
      on(r, "swap", function () { resetPk(); pk.tab = "ex"; if (wide()) goSub(function () { picker(it); }); else pickerSheet(it); });   /* the catalog, to put another exercise in this place */   /* the catalog, to put another exercise in this place */
    }, "d");
  }

  /* ---------- the songs of an exercise: two lines each, the song and who plays it ---------- */
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
    var d = ev.detail || {}; window.__bioNow = { name: d.name || "", t: d.t || 0, d: d.d || 0 }; 
    window.__bioNow.playing = !!d.playing;
    document.querySelectorAll(".bio-clk").forEach(function (sp) {
      var dur = parseInt(sp.dataset.dur, 10) || 0, mine = d.name && sp.dataset.for === d.name;
      var tot = mine && d.d > 0 ? Math.floor(d.d) : dur, txt2 = mine ? clock(Math.floor(d.t || 0)) + (tot ? " / " + clock(tot) : "") : (tot ? clock(tot) : "");   /* only the song that has the player shows where it is */
      if (sp.textContent !== txt2) sp.textContent = txt2;
    });
    if (window.RosterList && RosterList.states) RosterList.states();   /* every kit list: its states only (playing), never a repaint */
  });
  /* THE CARD is the kit's (RosterCard.html in /card.js, ui/docs/card.md): a song, an exercise, a vivencia are only what fills its slots. The app adds data-* only:
     data-card (song, item, viv: the app's hooks), data-song (a song card with a file: a tap plays it, audio.js shows its wait), data-songlist (the loop it plays in),
     data-ythref and data-ytid (a song card with no file: a tap opens it on YouTube). The playing state is .is-play, set from the player (the bioaudio event). */
  /* THE TITLE ROW (law 4): a text and its chip under ONE parent; --gap between them, the text shrinks with an ellipsis, the chip never does. Used by the opening sections. Looks: .rtitle in kit.css. */
  /* a card's play tile, as an action: no YouTube sign (a tap on a song card with no file opens YouTube); the upload button keeps the text colour it had */
  function cardActs(pill) { return (pill || "").replace(/<a [^>]*data-yt="[^"]*"[^>]*>[\s\S]*?<\/a>/g, "").replace(/(data-upl="[^"]*"[^>]*) style="color:var\(--text-muted\)"/g, "$1"); }
  function songAttrs(m, pill) {   /* what a tap on a song card plays: its file (and its loop), or its YouTube search */
    var aud = (/data-audio="([^"]*)"/.exec(pill || "") || [])[1], lk = (/data-list="([^"]*)"/.exec(pill || "") || [])[1];
    if (aud) return ' data-song="' + aud + '"' + (lk != null ? ' data-songlist="' + lk + '"' : '');
    var y = /<a [^>]*data-yt="([^"]*)"[^>]*href="([^"]*)"/.exec(pill || "");
    return y ? ' data-ytid="' + y[1] + '" data-ythref="' + y[2] + '"' : '';
  }
  /* what a tap on a song card does (the handler of RosterCard.bind): its song plays or pauses; a song with no file opens on YouTube, marked as the one played last */
  function cardPlay(c) {
    if (!c) return;
    if (c.dataset.song) { if (window.BioAudio && BioAudio.tap) BioAudio.tap(c.dataset.song, c.dataset.songlist); return; }
    if (!c.dataset.ythref) return;
    ytSet(c.dataset.ytid || "");
    window.open(c.dataset.ythref, "_blank", "noopener");
  }
  RosterCard.bind(document, '[data-card="song"]:not([data-hi]):not([data-rkey])', cardPlay);   /* every song card drawn outside the kit's list: a tap plays it (a card of a kit list is opened by its list, RosterList onOpen) */
  /* a song as the slots: its name, its length and performer, and at the end of the second row what can be done with it (the heart among them). o.click: a tap on it plays.
     songCardOpts gives the slots (and .song, the file a tap plays) for the kit's list (RosterList content and attrs); songCardUi the markup of a card outside a list (a menu's head) */
  function songCardOpts(m, o) {
    var d = durOf(m), pill = o.pill || "", hasAud = pill.indexOf("data-audio") >= 0, hide = hasAud && !o.keepPlay, sa = songAttrs(m, pill);
    var heart = m && m.id && !/^h[0-9]/.test(m.id) && !o.noHeart ? cardHeart(m) : "";
    var act = o.act || "", tile = hide ? "" : cardActs(pill), nw = window.__bioNow || {}, song = hasAud ? ((/data-song="([^"]*)"/.exec(sa) || [])[1] || "") : "";
    var c = { attrs: 'data-card="song"' + sa + (o.attrs ? ' ' + o.attrs : ''), click: !!o.click, current: !!o.selected, play: !!(song && nw.playing && nw.name === song), song: song,
      title: o.title, act1: o.rm || "", num: d ? clock(d) : "", sub: o.by || "", act2: o.heartFirst ? heart + act + tile : act + heart + tile };
    if (o.mu) {   /* the music card (muOpts): the "lines" layout, the song's catalog exercises one per line, 3 then "עוד N" */
      c.layout = "lines"; c.linesLabel = "התרגילים"; c.more = 3;
      c.lines = ((exIdx && m && exIdx[m.id]) || []).map(function (g) { return { text: g.name, attrs: 'data-mxl="' + esc(g.id) + '" data-mxs="' + esc(m.id) + '"' }; });
      if (!exIdx) exIndex();
    }
    return c;
  }
  /* THE MUSIC CARD of the music catalog and of every song picker (owner 2026-11-26, apps/biodanza/UI.md "בורר המוזיקה"): the music catalog, the music popup
     (an exercise's music, the search of music) and the start and end music of a vivencia. One card for all of them: the song, its length and performer, the heart,
     the context's plus (o.plus) or X (o.rm), the play tile, and the catalog exercises of the song as tappable lines (no count button). o.selected, o.listKey: the loop */
  function muOpts(m, o) { return { mu: true, heartFirst: true, attrs: o.attrs, click: true, selected: !!o.selected, title: songName(m), by: songBy(m), pill: cardPill(m, o.listKey), keepPlay: false, act: o.plus || "", rm: o.rm || "" }; }
  function muCard(m, o) { return songCardOpts(m, muOpts(m, o)); }
  var exIdx = null, exIdxP = null;   /* song id -> the catalog exercises it belongs to (loadExMusic's groups, by name): read once with the catalog's songs, kept */
  function exIndex() {
    return exIdxP || (exIdxP = loadExMusic().then(function (gs) {
      var ix = {}; gs.forEach(function (g) { if (g.id !== "_loose") g.songs.forEach(function (m) { (ix[m.id] = ix[m.id] || []).push(g); }); });
      exIdx = ix; return ix;
    }, function (e) { exIdxP = null; throw e; }));
  }
  /* a line of a music card: its exercise opens the way the song's exercises layer opens it (the layer of the song's exercises, and that exercise beside it, or over it on a phone) */
  function exLineOpen(sid, xid) {
    var gs = (exIdx && exIdx[sid]) || [], g = gs.filter(function (x) { return x.id === xid; })[0]; if (!g) return;
    var e = (state.cat || []).filter(function (x) { return x.id === xid; })[0] || { id: g.id, title_he: g.name, title_en: g.en };
    var m = g.songs.filter(function (x) { return x.id === sid; })[0], ids = {}; gs.forEach(function (x) { ids[x.id] = 1; });
    openFilteredLayer({ id: sid, name: songName(m), ids: ids });
    catCurId = e.id; RosterList.states();
    if (wide()) previewEx(e); else previewSheet(e);
  }
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest("[data-mxl]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    exLineOpen(b.dataset.mxs, b.dataset.mxl);
  }, true);
  function songCardUi(m, o) { return RosterCard.html(songCardOpts(m, o)); }
  function songPlays(song) { var nw = window.__bioNow || {}; return !!(song && nw.playing && nw.name === song); }
  /* THE KIT'S LIST of song cards (RosterList, ui/docs/list.md): o.card(it) returns { m, o } for songCardOpts; a tap plays the song (cardPlay), the playing state comes from the player
     (RosterList.states() on every bioaudio); every other option of the list (key, groups, remove, empty, page, memory, scope...) is passed through */
  function songList(el, items, o, uo) {
    var memo = null, memoIt = null, songs = new WeakMap(), opts = function (it) { if (memoIt !== it) { var c = o.card(it); memo = songCardOpts(c.m, c.o); memoIt = it; songs.set(it, memo); } return memo; };   /* the slots of each item are kept from its last drawing: a state pass (every bioaudio) reads them, it never builds them */
    var kept = function (it) { return songs.get(it) || opts(it); };
    var lo = { kind: "card", content: opts, attrs: function (it) { return opts(it).attrs; }, onOpen: function (it, card) { cardPlay(card); }, playing: function (it) { return songPlays(kept(it).song); } };
    Object.keys(o).forEach(function (k) { if (k !== "card") lo[k] = o[k]; });
    if (!lo.current) lo.current = function (it) { return !!kept(it).current; };
    return RosterList.render(el, items, lo, uo || (live && live.fx) || undefined);
  }
  var CARD_PILL = "";
  function bigPlay(m) {   /* a phone's exercise page: its song's play button is a LARGE icon (law 11); the player's states (data-raudio-st, data-audio) still drive it */
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
  /* a song with no file: the card has no YouTube sign (cardActs), a tap on it opens YouTube (cardPlay); the only mark is the upload (a file from this device) */
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-tab .bio-tab__n, .bio-tab .bio-tab__f { transform: none !important } .bio-tab__t { display: inline-flex; flex-direction: column; align-items: center } .bio-tab__t::before { content: attr(data-t); height: 0; overflow: hidden; visibility: hidden; font-weight: var(--fw-bold); pointer-events: none; user-select: none; white-space: nowrap }   .bio-tab__nw { position: relative; display: inline-block } .bio-tab__x { position: absolute; top: 50%; display: grid; place-items: center; --ex: max(0, calc(1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / var(--step, 120px))); opacity: var(--ex, 1); pointer-events: none; transform: translateY(-50%); transition: opacity var(--t-base) var(--ease) } .bio-tabs__track.is-drag .bio-tab__x { transition: none } .bio-tab.is-cur .bio-tab__x { pointer-events: auto } .bio-tab__x--play { inset-inline-end: calc(100% + var(--gap)) } .bio-tab__x--heart { inset-inline-start: calc(100% + var(--gap)) } .bio-tab__x--heart [data-likex] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; background: transparent; border-color: transparent } .bio-tab__x--heart [data-likex] svg { width: var(--icon); height: var(--icon) } #iplay [data-likex] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important } #iplay [data-likex] svg { width: var(--icon) !important; height: var(--icon) !important } #itemDlg .bio-tab input.bio-tab__in, #itemDlg .rhead input.bio-tab__in { margin: 0 !important; margin-block: 0 !important; order: 0 !important; height: 1.25em !important; min-height: 0 !important; line-height: 1.25 !important; padding: 0 !important } .bio-tab__in { field-sizing: content; min-width: var(--ctl); max-width: 78vw; border: 0 !important; outline: 0; background: transparent !important; padding: 0 !important; margin: 0 !important; text-align: center; direction: rtl; font-family: inherit; text-overflow: ellipsis; height: auto; min-height: 0; line-height: var(--lh-tight); box-sizing: content-box; display: block } .bio-tab__in::placeholder { color: var(--text-muted); font-weight: var(--fw-regular) } #pl > .rhead [data-act=\"new\"] { transition: none !important } @media (width < 760px) {  html.bio-kb dialog.rsheet:has(.sheet-foot) { padding-bottom: 0 !important; height: auto !important; min-height: 0 !important; top: auto !important; bottom: 0 !important; inset-block-start: auto !important; margin-top: auto !important } html.bio-kb dialog.rsheet:has(.sheet-foot) .sheet { flex: 0 1 auto !important; min-height: 0 !important } }    /* the end padding is the kit's: --end-pad, and the add button's room only while that button is on the screen */ .bio-vcnt__c { display: grid; flex: none; width: var(--icon); height: var(--icon); color: var(--text-muted) } .bio-vcnt__c svg { width: 100%; height: 100%; display: block; stroke-width: var(--icon-w) } .bio-vcnt__c svg path { animation: none !important; stroke-dasharray: none !important } .bio-vcnt { flex: none; display: inline-flex; align-items: center; gap: var(--gap-tight); color: var(--text-muted); font: var(--fw-bold) var(--fs-m)/1 var(--font); font-variant-numeric: tabular-nums; pointer-events: none } button:has(> [data-exn][data-zero]), button:has(> [data-exn]:empty) { display: none !important } #vtimer, #itimer { display: inline-flex; align-items: center; height: var(--ctl); line-height: 1 !important } #vtimer[hidden], #itimer[hidden] { display: none } .bio-tab .bio-tab__t, .bio-tab.is-cur .bio-tab__t { --e: max(0, calc(1 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .28))); color: color-mix(in srgb, var(--text) calc(var(--e) * 100%), var(--text-muted)); font-weight: calc(var(--fw-regular) + (var(--fw-bold) - var(--fw-regular)) * var(--e)); transition: color var(--t-base) var(--ease) } .bio-tabs__track.is-drag .bio-tab .bio-tab__t { transition: none !important } .bio-tab .bio-tab__n, .bio-tab .bio-tab__f { transition: transform var(--t-base) var(--ease), opacity var(--t-base) var(--ease) } .bio-tabs__track.is-drag .bio-tab .bio-tab__n, .bio-tabs__track.is-drag .bio-tab .bio-tab__f { transition: none !important } .bio-tab { --nx: calc(clamp(var(--cw, 360px) * .13, var(--cx, 0px) + var(--tx, 0px), var(--cw, 360px) * .87) - (var(--cx, 0px) + var(--tx, 0px))) } .bio-tab .bio-tab__n, .bio-tab .bio-tab__f { opacity: calc(1 - var(--nb, 0) * min(1, abs(var(--nx)) / (var(--cw, 360px) * .36))) !important } .bio-tab[data-far] { opacity: clamp(0, calc(1.5 - abs(var(--cx, 0px) + var(--tx, 0px) - var(--cw, 360px) / 2) / (var(--cw, 360px) * .37)), .7) !important } #iplay [data-likex] { width: var(--icon) !important; height: var(--icon) !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important } #iplay [data-likex] svg { width: var(--icon); height: var(--icon) } ";
    document.head.appendChild(st);
  })();
  document.addEventListener("click", function (ev) {   /* a plus on a song card: where to add it, asked in a popup */
    var b = ev.target.closest && ev.target.closest("[data-addto]"); if (!b) return;
    ev.stopPropagation(); ev.preventDefault();
    api("/rest/v1/music?id=eq." + encodeURIComponent(b.dataset.addto) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog&limit=1").then(function (rows) {
      var m = rows && rows[0]; if (!m) { toast("המוסיקה לא נמצאה"); return; }
      chooseDest(songName(m), { vivId: state.viv && state.viv.id, itemId: liveItem && liveItem.id }, function (d) { return addMusicTo(m, d); });
    }, fail);
  }, true);
  /* the slots of a music option's card (songCardOpts): the song, its performer, the play tile, the chip that chooses it, the time; the X is the kit list's (remove).
     plain: the catalog's exercise, only its songs: no chip to choose, no green frame */
  function optCardOpts(m, sel, plain, listKey, askWhere) {
    return { attrs: 'data-opt="' + esc(m.id) + '"', click: true, selected: sel, title: songName(m), by: songBy(m), pill: cardPill(m, listKey), keepPlay: false, heartFirst: !!plain,
            act: (plain ? '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-mfx="' + esc(m.id) + '" data-mfxg="' + esc(m.id) + '" data-mfxn="' + esc(songName(m)) + '" aria-label="התרגילים של המוזיקה" title="התרגילים של המוזיקה בקטלוג">' + exBtnInner(m.id) + '</button>' + (askWhere ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : '<button type="button" class="rbtn rbtn--icon rbtn--accent" data-pick="' + esc(m.id) + '" aria-label="' + (sel ? 'נבחר לתרגיל' : 'הוספה לתרגיל') + '" title="בחירת המוזיקה לתרגיל">' + (sel ? I.check : I.plus) + '</button>') : '') + (sel || plain ? '' : '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-choose="' + esc(m.id) + '" aria-label="בחירה" title="לבחור אותה לתרגיל בוויוונסיה">' + I.check + '</button>') + (plain ? '' : exBtnG(m)) };
  }
  /* deleting a song from an exercise: asked in the kit's popup; closing it is the cancel */
  function confirmRemoveOpt(it, m, done) {
    var chosen = !it.__recv && m.id === it.music_id;
    RosterSheet.confirm({ title: "מחיקת מוזיקה", text: 'למחוק את "' + esc(songName(m)) + '" ' + (it.__recv === "start" ? "ממוסיקת ההתחלה" : it.__recv === "end" ? "ממוסיקת הסיום" : "מהתרגיל") + '?' + (chosen ? ' זו המוזיקה שנבחרה: התרגיל יישאר בלי מוזיקה.' : ''), action: "מחיקה",run: function (dlg, btn) {
      RosterBusy(btn, dropOpt(it, m)).then(function () { dlg.close(); done(); }, function (e) { dlg.close(); fail(e); });
    } });
  }
  /* THE MUSIC OF AN EXERCISE (ui/docs/list.md, list 11): a section ("מוזיקה", its count, the pencil that opens the editing of its music) and in its body the kit's list
     of song cards. The chosen song (or, on the catalog's exercise, the marked ones) is current: the card's selected look; a playing one is marked by the wave only.
     The X takes a song out of the exercise with the kit's confirm. musSec: the section with an empty body (lazy); musCards: the same section as markup with its cards,
     for a page drawn as a string (the neighbours that slide in); musPaint: the section kept in its host, its list following the data by key */
  function musSongs(it, ro) { return ro ? (it.item_music_options || []).map(function (o) { return o.music; }).filter(Boolean) : optList(it); }
  function musSec(it, ro) {
    var n = musSongs(it, ro).length;
    var hasTx = function () { return [txt(it, "poetics"), txt(it, "guidance"), it.exercises && it.exercises.emphasis].some(function (t) { return String(t || "").replace(/<[^>]*>/g, "").trim() !== ""; }); };
    /* a vivencia's exercise: a fixed section, the title then the pencil. The catalog's exercise: a folding section with no memory, closed when the exercise has words, open when it has none (owner, 2026-11-25). No music: no body, the section is its bar alone (its 0 and its action; owner 2026-11-25) */
    return RosterSection.html({ key: "exmus:" + it.id, fold: ro ? true : false, remember: ro ? false : undefined, open: ro ? (it.__musOpen != null ? it.__musOpen : !hasTx()) : undefined, title: "מוזיקה", count: n, lazy: n > 0 || undefined, scope: "raccent-2",
      actions: ro ? '' : '<button type="button" class="rbtn rbtn--text" data-addm aria-label="עריכת מוזיקה" title="עריכת מוזיקה"><span class="ricon" aria-hidden="true">' + I.pen + '</span><span>עריכה</span></button>' });   /* the word "עריכה" stays (the owner, 2026-11-25): a text button with its pencil, at the end of the row */
  }
  function musList(box, it, ro) {
    return songList(box, musSongs(it, ro), { key: function (m) { return m.id; },
      card: function (m) { return { m: m, o: optCardOpts(m, ro ? !!(it.sel && it.sel.indexOf(m.id) >= 0) : m.id === it.music_id, !!ro) }; },
      remove: ro ? null : { kind: "remove", label: function (m) { return "הסרה של " + songName(m) + " מהתרגיל"; }, title: function (m) { return "להסיר את " + songName(m) + " מהתרגיל?"; },
        text: function (m) { return m.id === it.music_id ? "זו המוזיקה שנבחרה: התרגיל יישאר בלי מוזיקה." : ""; },
        run: function (m) { return dropOpt(it, m).then(function () { setTimeout(function () { var im = box.closest("#imus"); if (im) musPaint(im, it, ro); if (wide()) paint(); }, 0); }, function (e) { fail(e); throw e; }); } } });   /* the count follows once the card is out */
  }
  function musCards(it, ro) {
    var t = document.createElement("template"); t.innerHTML = musSec(it, ro);
    var sec = t.content.firstElementChild, inner = sec.querySelector(":scope > .racc__body > div");
    sec.removeAttribute("data-racc-lazy");
    if (inner) { var L = musList(inner, it, ro); if (L) L.destroy(); }   /* the kit's list writes the cards; this markup is only a picture of them */
    return sec.outerHTML;
  }
  function musPaint(imus, it, ro) {
    if (!imus) return;
    var html = musSec(it, ro), body = musSongs(it, ro).length > 0, rec = imus.__mus;
    if (!rec || rec.it !== it || !imus.contains(rec.el)) {   /* the page was drawn as a string: its section is taken over as it is, and its cards become the kit's list */
      var sec = imus.querySelector(":scope > .racc");
      rec = sec ? { el: sec, sig: html, body: !!sec.querySelector(":scope > .racc__body"), box: sec.querySelector(":scope > .racc__body > div") } : null;
    }
    rec = secKeep(rec, html, body, function (ne) { imus.appendChild(ne); });
    rec.it = it; imus.__mus = rec;
    if (rec.box) musList(rec.box, it, ro);
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
  function similarToPlaying(who) {   /* "חיפוש מוסיקה" of the player's menu (owner 2026-11-26): the one music popup in its listening context, the songs like the one that plays under "מוסיקה דומה", the whole catalog by search and filter; a tap plays a song */
    api("/rest/v1/music?audio_object=eq." + encodeURIComponent(who) + "&select=id,name,title,artist,duration_sec,audio_object,in_catalog,owner_id,vivencia_id&limit=1").then(function (rows) {
      var m = (rows && rows[0]) || null;   /* a song with no row: no similar songs, the search still works */
      openAddMusic({ __listen: true, id: "", music: m, music_id: m ? m.id : null, item_music_options: [], sel: [] }, null);
    }, fail);
  }
  function openAddMusic(it, changed) {
    var me = FLOA_AUTH.userId(), vid = state.viv && state.viv.id;
    /* ONE music picker for every context (an exercise's music, the start or end music, the similar music; owner 2026-11-26: "אותו פופאפ"): the context is `it`
       (__listen: the similar music, its title, its own list "הדומים" and the plus that asks where). Opening it in another context replaces the one that is open */
    var amOld = wide() && document.querySelector("[data-ampop]"); if (amOld && RosterSheet.popup.close) RosterSheet.popup.close(amOld);
    var amEl = RosterSheet.popup({ id: "addMusDlg", side: "end", title: it.__listen ? "חיפוש מוסיקה" : "הוספת מוזיקה" });   /* no body: it opens loading (the kit's .rload on its body), and the body IS the list (ui/docs/layout.md) */   /* the kit's one popup, as the history is: a sheet on a phone, the side panel on a computer; nothing of its own (owner 2026-11-26). The header is the kit's: its title, the search (a magnifier) and the upload among its actions */
    amEl.classList.add("raccent-2"); amEl.setAttribute("data-ampop", "");   /* a music area: the second accent scope; data-ampop: the music picker, whatever its context */
    var r = RosterSheet.popup.body(amEl), amHead = amEl.querySelector(".rhead");
    if (amHead) amHead.insertAdjacentHTML("beforeend", '<span class="rhead__acts">' + (it.__listen ? '' : '<button type="button" class="rbtn rbtn--icon" id="amup" aria-label="העלאת קובץ מוזיקה" title="העלאת קובץ מוזיקה">' + I.upload + '</button>') + '<button type="button" class="rbtn rbtn--icon" id="amsearch" aria-label="חיפוש" title="חיפוש">' + I.search + '</button></span>');   /* the magnifier last, at the far end (owner 2026-11-25) */
    r.id = "amlist"; r.classList.add("rlist");
    var listEl = r, amQ = "";   /* what the header's search holds (the kit's search, app mode: this list ranks its songs) */
    var linked = null, rest = null, fresh = true;
    /* the whole music catalog in the same page (owner 2026-11-26): the catalog's filter row (muFilterHtml, the list's top block, the kit's tile) under the header.
       A search or a box set: the suggestions that match ("מההצעות"), then the rest of the catalog ("מכל הקטלוג"), with the catalog's matching (muFind) */
    var AMF_KEY = "bio.amf", amF = { mln: "", mch: "", msp: "", mef: "" }, catAll = null, catById = {}, amBar = null, amCnt = false;
    {   /* every context of this one popup (an exercise's music, the similar music) has the row */
      try { var f0 = JSON.parse(sessionStorage.getItem(AMF_KEY) || "null"); if (f0) MU_BOXES.forEach(function (b) { amF[b[0]] = f0[b[0]] || ""; }); } catch (e) { /* no storage: every box at "הכל" */ }
      r.insertAdjacentHTML("beforebegin", '<div class="rlayout__bar" data-rquick>' + muFilterHtml() + '</div>');
      amBar = r.previousElementSibling;
      amBar.addEventListener("change", function (ev) {
        var sel = ev.target.closest("[data-mf]"); if (!sel) return;
        amF[sel.dataset.mf] = sel.value;
        try { sessionStorage.setItem(AMF_KEY, JSON.stringify(amF)); } catch (e) { /* kept for this opening only */ }
        draw(true);
      });
      Promise.all([muCatalog(), exIndex().catch(function () { return null; })]).then(function (rr) {   /* the songs' exercises (their cards' lines) come with the same read */
        var all = rr[0]; if (!listEl.isConnected) return;
        catAll = all; catById = {}; all.forEach(function (m) { catById[m.id] = m; });
        muFilterFill(amBar, all, amF);
        amBar.querySelectorAll("[data-mf]").forEach(function (sel) { amF[sel.dataset.mf] = sel.value; });   /* a kept value no song holds any more is let go */
        draw();
      }, function () { /* no catalog: the suggestions and the search by name still work */ });
    }
    var xs = [], xsFor = null, xsT = 0, xsOf = {}, amHas = {};
    function cardOf(m, added) {   /* the music card (muCard), the same as the catalog's: only the plus or the X is this context's */
      return muCard(m, { attrs: 'data-am="' + esc(m.id) + '"', selected: added,
        plus: it.__listen ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' : (added ? '' : '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-amadd aria-label="הוספה לתרגיל" title="הוספה לתרגיל">' + I.plus + '</button>'),
        rm: !it.__listen && added ? '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-amrm aria-label="הסרה של ' + esc(songName(m)) + ' מהתרגיל" title="הסרה של ' + esc(songName(m)) + ' מהתרגיל">' + I.x + '</button>' : '' });
    }
    var AM = { kind: "card", key: function (x) { return x.m.id; }, group: function (x) { return x.g; }, search: true, page: 90, memory: "bio.addmusic." + (it.id || (it.__listen ? "listen" : "")),   /* THE KIT'S LIST (ui/docs/list.md): one grid, its groups under counted dividers, 90 at a time; a tap plays (cardPlay) */
      content: function (x) { return cardOf(x.m, !!amHas[x.m.id]); }, attrs: function (x) { return cardOf(x.m, !!amHas[x.m.id]).attrs; },
      current: function (x) { return !!amHas[x.m.id]; },   /* the songs already in the exercise: the selected look (owner 2026-11-26) */
      playing: function (x) { return songPlays(x.m.audio_object); },
      onOpen: function (x, card) { cardPlay(card); },
      empty: function () { return fold(amQ).trim() ? null : muFilterSet(muFilterOf(amF)) ? { title: "אין מוסיקה שמתאימה לסינון", text: "", icon: I.curve } : { title: it.__listen ? "אין מוסיקה דומה" : "אין מוסיקה", text: "", icon: I.curve }; },   /* nothing found by a search: the kit's search says "לא נמצא"; a filter with nothing in it says so, as the catalog does */
      groups: [{ key: "in", label: it.__listen ? "מתנגנת" : it.__preview ? "נבחרו" : "בתרגיל", count: true }, { key: "sug", label: it.__listen ? "מוסיקה דומה" : "הצעות", count: true }, { key: "fsug", label: it.__listen ? "מהדומים" : "מההצעות", count: true }, { key: "cat", label: "מכל הקטלוג", count: true }, { key: "other", label: "מוסיקה אחרת", count: true }] };
    var amL = RosterList.render(listEl, null, AM);
    function draw(reset) {
      if (!linked || !rest) return;
      var s0 = fold(amQ), words = s0.split(/\s+/).filter(Boolean), f = muFilterOf(amF), fset = muFilterSet(f);
      var cur = it.__listen ? [] : it.__preview ? optList(it).filter(function (m) { return it.sel.indexOf(m.id) >= 0; }) : optList(it), has = {}; cur.forEach(function (m) { has[m.id] = 1; });   /* on the catalog's exercise only what was marked counts */
      var tag = function (g) { return function (m) { return { g: g, m: m }; }; };
      amHas = has; xsOf = {};
      if (!words.length && !fset) {   /* no search and every box at "הכל": the context's own list, as it always was (the exercise's songs and the suggestions; the similar songs) */
        var sl = songTiers(cur, s0), lk = songTiers(linked.filter(function (m) { return !has[m.id]; }), s0), ot = it.__listen ? [] : songTiers(rest.filter(function (m) { return !has[m.id]; }), s0);
        if (it.__listen) lk = lk.filter(function (m) { return m.id !== it.music_id; });
        amL.update(sl.map(tag("in")).concat(lk.map(tag("sug")), ot.map(tag("other"))), { reset: !!reset });   /* the groups are shown only when they hold songs; the count of each is all of it, also what is not drawn yet */
        return;
      }
      /* a search or a box set: the whole catalog, with the catalog's matching; each song once, in the first group that holds it */
      if (catAll == null) { amL.update(null); return; }   /* the catalog is not here yet: the list is loading, never "אין מוסיקה שמתאימה לסינון" (owner 2026-11-27) */
      if (!words.length && !exCnt && !amCnt) { amCnt = true; ensureExCnt().then(function () { if (listEl.isConnected && exCnt) draw(); }); }   /* a filter alone: the most exercises first, as in the catalog */
      var en = function (m) { return catById[m.id] || m; }, xq = words.length && xsFor === s0 ? xs : null, seen = {};
      var put = function (fr) { Object.keys(fr.xOf).forEach(function (k) { xsOf[k] = fr.xOf[k]; }); return fr.list.filter(function (m) { if (seen[m.id]) return false; seen[m.id] = 1; return true; }); };
      var inL = put(muFind(cur.map(en), f, s0, xq, catById, true));
      cur.forEach(function (m) { seen[m.id] = 1; });   /* a song of the exercise that does not match is still not offered again below */
      if (it.__listen && it.music_id) seen[it.music_id] = 1;   /* the song that plays is not offered as its own like */
      var sgL = put(muFind(linked.map(en), f, s0, xq, catById, true)), catL = put(muFind(catAll || [], f, s0, xq, catById));
      /* no "מוסיקה אחרת" while a search or a box is set (owner 2026-11-26): it shows only in the context's own list above */
      amL.update(inL.map(tag("in")).concat(sgL.map(tag("fsug")), catL.map(tag("cat"))), { reset: !!reset });
    }
    var upb = amHead && amHead.querySelector("#amup");   /* the upload is an action of the header */
    if (upb && it.__listen) { upb.remove(); upb = null; }   /* listening only: nothing is uploaded or added from here */
    if (upb) upb.addEventListener("click", function () {
      if (upb.dataset.busy) return;
      var inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.flac,.m4a,.aiff,.aif,.wav,.mp3";
      inp.addEventListener("change", function () {
        var f = inp.files && inp.files[0]; if (!f) return;
        var label = upb.innerHTML; upb.dataset.busy = "1"; upb.textContent = "0%"; var upDone; RosterBusy(upb, new Promise(function (res) { upDone = res; }));
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
    var amS = amHead && amHead.querySelector("#amsearch");   /* a picker: opened WITHOUT the search open (owner 2026-11-27); heavy, so it waits --search-wait for a pause in the typing */
    if (amS) RosterSearch.attach(amS, listEl, { label: it.__listen ? "חיפוש מוסיקה" : "חיפוש מוזיקה", heavy: true, icon: I.music, onQuery: function (q) {
      amQ = q; draw(true);
      if (!fold(q).trim()) return;
      warmEx().then(function () { var v = fold(amQ); if (!listEl.isConnected || !v) return; xs = exSongs(v); xsFor = v; draw(); });   /* the exercises' side of the search, once their texts are here */
    } });
    listEl.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      var c = ev.target.closest("[data-am]"); if (!c) return;
      if (it.__listen || !ev.target.closest("[data-amadd], [data-amrm]")) return;   /* a tap on a card always plays (the kit's card binding, cardPlay); the plus and the cross add and remove */
      var all = (linked || []).concat(rest || [], catAll || []), m = all.filter(function (x) { return x.id === c.dataset.am; })[0]; if (!m) return;   /* a song of the catalog is added exactly as a suggestion is */
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
      if (it.__recv && state.viv) { ev.stopPropagation(); chooseRecv(ev.target.closest("[data-amadd], [data-amrm]") || c, function (kind) { var tgt = kind === it.__recv ? it : recvItem(kind); return addOpt(tgt, m).then(function () { draw(); refreshSimilar(); if (changed) changed(); if (tgt !== it) { paint(); toast(kind === "end" ? "נוסף למוסיקת הסיום" : "נוסף למוסיקת ההתחלה"); } }, fail); }); return; }
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
    var loadAm = function () { Promise.all([similarRows(it), it.__listen ? Promise.resolve([]) : loadAllSongs()]).then(function (res) {
      allSongs = res[1]; applyLinked(res[0]);
      draw();
    }, function (e) { fail(e); amL.fail(loadAm); }); };   /* the kit's failed list: "ניסיון נוסף" asks again */
    loadAm();
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
  /* other music: the files the catalogs do not list, and the songs this person uploaded by hand (those can be renamed). One upload button on top. */
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
  function songEdit(m, done) {   /* the name and the performer of a song this person uploaded; saved only if nobody changed them meanwhile (check on save, ui/docs/realtime.md) */
    var at = { title: m.title == null ? null : m.title, artist: m.artist == null ? null : m.artist };
    RosterSheet.confirm({ id: "songDlg", title: "עריכת מוזיקה", action: "שמירה",   /* deleting the song is in the song's menu (songMenu), not here */
      fields: [{ name: "title", label: "שם המוסיקה", value: m.title || m.name || "", required: true }, { name: "artist", label: "מבצע", value: m.artist || "" }],
      save: function (val, f) {
        var t = val.title, ar = val.artist;
        return saveChecked({ table: "music", where: "id=eq." + m.id, at: at, force: f && f.force, patch: { title: t, artist: ar, name: t + (ar ? ", " + ar : "") },
          cols: { title: { label: "שם המוסיקה", the: "שם המוסיקה" }, artist: { label: "מבצע", the: "המבצע" } } }).then(function (res) { if (!res.conflict) saved(t, ar); return res; }, function (e) { if (e && e.message && !(e instanceof Error)) throw e; shortFail(e); });
      } });
    function saved(t, ar) {
        m.title = t; m.artist = ar; m.name = t + (ar ? ", " + ar : "");
        var fix = function (x) { if (x && x.id === m.id) { x.title = t; x.artist = ar; x.name = m.name; } };   /* every copy of this song that is on the screen's side: the exercises', their options', the start and end music */
        (state.items || []).forEach(function (x) { fix(x.music); (x.item_music_options || []).forEach(function (o) { fix(o.music); }); });
        Object.keys(recvCache).forEach(function (k) { (recvCache[k] || []).forEach(function (o) { fix(o.music); }); });
        if (m.audio_object) { songInfo[m.audio_object] = { t: t, a: ar }; document.dispatchEvent(new CustomEvent("biosongrenamed", { detail: { n: m.audio_object, t: t, a: ar } })); }
        if (done) done();
        if (document.getElementById("list") && document.getElementById("list").hasAttribute("data-fab-room") && state.items) paint();
        var im = document.getElementById("imus"); if (im && liveItem && liveItem.id) { var li = state.items.filter(function (x) { return x.id === liveItem.id; })[0]; if (li) musPaint(im, li); }
    }
  }
  function songDelete(m, done) {   /* a song that is not from the catalog can be deleted: from every exercise, option and start or end music it is in */
      RosterSheet.confirm({ title: "מחיקת מוסיקה", text: 'למחוק את "' + esc(songName(m)) + '" לגמרי? הוא יוסר מכל התרגילים והוויוונסיות שבהם הוא נמצא.', action: "מחיקה",run: function (c, delb) {
        var said = function (text) {   /* the answer is on the screen, not only in the console: the same popup, with no button */
          RosterSheet.confirm({ title: "המחיקה לא בוצעה", text: esc(text) });
        };
        RosterBusy(delb, api("/rest/v1/music?id=eq." + m.id, { method: "DELETE", prefer: "return=representation" })).then(function (gone) {
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
          var im = document.getElementById("imus"); if (im && liveItem && liveItem.id) { var li = state.items.filter(function (x) { return x.id === liveItem.id; })[0]; if (li) musPaint(im, li); }
        }, function (e) { console.error(e); said("השרת לא אישר את המחיקה" + (e && e.message ? ": " + e.message : ".")); });
      } });
  }
  /* ---------- picker: the catalog ---------- */
  var pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: (loadCatSnap() || {}).tab === "mu" ? "mu" : "ex", mq: "", mln: "", mch: "", msp: "", mef: "", xo: "", mo: "" };   /* the tab is the one it was left on, even after a refresh */   /* the catalog's search, line, category, group level and place on the curve */
  var catCurId = null, catMusId = null;   /* catMusId: the song of the music catalog whose exercises are shown. catCurId: the catalog exercise open beside the catalog: its card is the current one (the kit's list, current) */
  function resetPk() { pk = { q: "", ln: "", cg: "", lv: "", cv: "", tab: pk.tab === "mu" ? "mu" : "ex", mq: "", mln: "", mch: "", msp: "", mef: "", xo: "", mo: "" }; }   /* a fresh search each time, but the tab stays where it was left */
  var LEVELS_FALLBACK = [{ key: "all", name_he: "מתחילים (מתאים לכל הקבוצות)" }, { key: "exp3", name_he: "לקבוצות עם ניסיון של כמה חודשים" }, { key: "exp6", name_he: "לקבוצות עם ניסיון של חצי שנה ויותר" }, { key: "deep", name_he: "לקבוצות העמקה ומתקדמות" }];   /* the index of group levels (biodanza.levels), when it has not come from the cloud */
  /* the catalog picker: a search and the list of categories; a category opens like an accordion onto its exercises. On a wide screen it is a pane; on a narrow one it is a popup from the bottom. */
  function catField() {   /* the catalog's real title (owner 2026-11-25); its search is the kit's, from the magnifier in the actions (catActs) */
    return '<span class="rhead__tw"><h1 class="rhead__title" data-cattitle title="' + esc(catTitle()) + '">' + esc(catTitle()) + '</h1></span>';
  }
  function catActs() { return '<span class="rhead__acts"><button type="button" class="rbtn rbtn--icon" data-catsearch aria-label="חיפוש" title="חיפוש">' + I.search + '</button></span>'; }
  /* the catalog is two catalogs, chosen from the menu of the catalog button (pk.tab: "ex" the exercises', "mu" the music's): one page each, no tabs */
  function catTitle() { return exFilter ? "התרגילים של " + exFilter.name : pk.tab === "mu" ? "קטלוג המוזיקה" : "קטלוג התרגילים"; }
  function catSearchLabel() { return pk.tab === "mu" && !exFilter ? "חיפוש מוזיקה" : "חיפוש תרגיל"; }
  /* what the music tab filters by: the three tag columns of the music table. Values stay in English (they are the keys); a value with no entry here shows as it is. */
  var MU_LINE = [["Affectivity", "affectivity", "חיבתיות"], ["Creativity", "creativity", "יצירתיות"], ["Vitality", "vitality", "חיוניות"], ["Sexuality", "sexuality", "מיניות"], ["Trance", "transcendence", "התעלות"], ["Maze", "", "מבוך"]];   /* the app's own line names are used when it has them */
  var MU_CHAR = { "Rhythmic": "קצבי", "Melodic": "מלודי", "Other": "אחר" }, MU_SPEED = { "Slow": "איטי", "Medium": "בינוני", "Fast": "מהיר" };   /* the two new columns: character and speed, fixed order */
  var MU_EFFECT = { "Soft and Sensitive": "רך ורגיש", "Sensual": "חושני", "Joyful": "שמח", "Deep": "עמוק", "Romantic": "רומנטי", "Expressive": "אקספרסיבי", "Playful": "שובב", "Energizing": "מאיץ", "Dramatic": "דרמטי", "Cellestial": "שמימי", "Airy - Cosmic": "אווירי וקוסמי", "Sacred": "מקודש", "Passionate": "נלהב", "Light": "קליל", "Euphoric": "אופורי", "Pulsating": "פועם", "Optimistic": "אופטימי" };
  function muLineLabel(v) { var e = MU_LINE.filter(function (x) { return x[0] === v; })[0]; if (!e) return v; var n = e[1] && state.lines && state.lines.filter(function (l) { return l.key === e[1]; })[0]; return n ? n.name_he : e[2]; }
  function tagHit(m, f) {   /* a song matches when, in every box that is set, its array holds the chosen value; a song with no tags matches only when no box is set */
    return (!f.ln || (m.line_tags || []).indexOf(f.ln) >= 0) && (!f.ch || (m.rhythm_char_tags || []).indexOf(f.ch) >= 0) && (!f.sp || (m.rhythm_speed_tags || []).indexOf(f.sp) >= 0) && (!f.ef || (m.effect_tags || []).indexOf(f.ef) >= 0);
  }
  /* THE MUSIC CATALOG'S FILTER, one copy for every place that filters the catalog's music (the music catalog, and the music picker of an exercise, openAddMusic):
     the four boxes (a field each, "הכל" first), their options from the songs, the values ({ mln, mch, msp, mef }) and the matching with the catalog's search */
  var MU_BOXES = [["mln", "קו"], ["mch", "אופי"], ["msp", "מהירות"], ["mef", "אפקט"]];
  function muFilterHtml() { return '<div class="pgs mfs">' + MU_BOXES.map(function (b) { return '<label class="rfield rfield--plain"><span>' + b[1] + '</span><select data-mf="' + b[0] + '"><option value="">הכל</option></select></label>'; }).join("") + '</div>'; }
  function muFilterOf(v) { return { ln: v.mln || "", ch: v.mch || "", sp: v.msp || "", ef: v.mef || "" }; }
  function muFilterSet(f) { return !!(f.ln || f.ch || f.sp || f.ef); }
  function muFilterFill(root, all, v) {   /* the options of each box: only the values some song holds (the effects by how many hold them); each box shows v's value */
    function count(col) { var c = {}; all.forEach(function (m) { (m[col] || []).forEach(function (x) { c[x] = (c[x] || 0) + 1; }); }); return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }); }
    function has(col, x) { return all.some(function (m) { return (m[col] || []).indexOf(x) >= 0; }); }
    var sets = { mln: MU_LINE.map(function (x) { return x[0]; }).filter(function (x) { return has("line_tags", x); }), mch: Object.keys(MU_CHAR).filter(function (x) { return has("rhythm_char_tags", x); }), msp: Object.keys(MU_SPEED).filter(function (x) { return has("rhythm_speed_tags", x); }), mef: count("effect_tags") };
    root.querySelectorAll("[data-mf]").forEach(function (sel) {
      var k = sel.dataset.mf, first = sel.options[0].outerHTML;
      sel.innerHTML = first + sets[k].map(function (x) { var lb = k === "mln" ? muLineLabel(x) : ({ mch: MU_CHAR, msp: MU_SPEED, mef: MU_EFFECT })[k][x] || x; return '<option value="' + esc(x) + '">' + esc(lb) + '</option>'; }).join("");
      sel.value = v[k] || "";
    });
  }
  /* the catalog's matching: the boxes, then the search (name, performer, then the songs found through their exercises, xs = exSongs(s), with the exercise that found them in xOf);
     with no search the most exercises first, unless keep (a list with an order of its own, the suggestions) */
  function muFind(all, f, s, xs, byId, keep) {
    var byTags = all.filter(function (m) { return tagHit(m, f); }), list = s ? songTiers(byTags, s) : byTags, xOf = {};
    if (s && xs) { var inT = {}, got = {}; byTags.forEach(function (m) { inT[m.id] = 1; }); list.forEach(function (m) { got[m.id] = 1; }); xs.forEach(function (o) { if (inT[o.m.id] && !got[o.m.id]) { got[o.m.id] = 1; list.push((byId && byId[o.m.id]) || o.m); if (o.ex) xOf[o.m.id] = o.ex; } }); }
    if (!s && !keep && exCnt) { var mc = function (m) { return exCnt[m.id] || 0; }; list = list.slice().sort(function (a, b) { return mc(b) - mc(a); }); }
    return { list: list, xOf: xOf };
  }
  var muCatP = null;
  function muCatalog() {   /* the music catalog's songs, each once, by name: what the music catalog reads (loadExMusic), read once */
    return muCatP || (muCatP = loadExMusic().then(function (gs) {
      var seen = {}, all = [];
      gs.forEach(function (g) { g.songs.forEach(function (m) { if (!seen[m.id]) { seen[m.id] = 1; all.push(m); } }); });
      return all.sort(function (a, b) { return songName(a).localeCompare(songName(b), "he"); });
    }, function (e) { muCatP = null; throw e; }));
  }
  function pickerBody(sheetMode, swapIt, noMusic) {
    /* the pager (#pgr): a row of pages, flush, one page wide each, scrolled only from code (scroll snap); each page a Layout column of bars (.pgp); the music page's
       four boxes are the list's top block, the kit's tile (data-rquick: on a phone it slides out on a scroll down and comes back on a scroll up, ui/docs/list.md "אריח שחוזר בגלילה") */
    var pageCss = '<style>.pgh { padding: var(--gap) var(--gap) 0 } #pks, #pkl { scrollbar-width: none } #pks::-webkit-scrollbar, #pkl::-webkit-scrollbar { display: none } ' +
      '#pgr { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: row; gap: 0; overflow: hidden } #pgr::-webkit-scrollbar { display: none } #pgr > .pgp { position: relative; flex: 0 0 100%; min-width: 0; min-height: 0; scroll-snap-align: start; scroll-snap-stop: always } .pgl { position: relative } ' +
      '#pks > .bio-catl { display: flex; flex-direction: column } </style>';   /* the scroll areas (#pks, #pkl: the kit's .rlist) pad their own edges, the same in a sheet and in a panel */
    var exPage = '<div class="pgp rlayout rlayout--bars"><div class="rlist pgl" id="pks"><div' + LOAD.replace('class="', 'class="bio-catl ') + '></div></div></div>';   /* the catalog's list has no id: "list" is the open vivencia's alone (paint, headerFree), and a catalog can be drawn more than once (its layers) */
    var muPage = swapIt || noMusic ? '' : '<div class="pgp rlayout rlayout--bars raccent-2"><div class="pgh" data-rquick>' + muFilterHtml() + '</div><div class="rlist pgl rload" aria-busy="true" id="pkl"></div></div>';
    return pageCss + '<div id="pgr">' + exPage + muPage + '</div>';
  }
  function pickerWire(r, swapIt, sheet) {
      var catBy = {}, catIn = {};   /* catIn: the card list in each category's body that was filled (the kit's list, one per open category) */
      var EXL = { kind: "card", key: function (e) { return e.id; }, search: true, content: function (e) { return { title: name(e), subHtml: exSubHtml(e) }; }, attrs: function (e) { return 'data-ex="' + esc(e.id) + '"'; },
        current: function (e) { return e.id === catCurId; }, onOpen: function (e, card) { openEx(card); } };   /* the exercise open beside the catalog is current */
      function catCards(k, el) { catIn[k] = el; RosterList.render(el, catBy[k] || [], EXL); }
      var catL = r.querySelector(".bio-catl");
      /* the one click handler of the list: an exercise opens (a category is the kit's section: it opens and closes by itself) */
      catL.addEventListener("click", function (ev) {
        if (ev.target.closest("[data-likex]")) return;   /* the heart on a card marks, it does not open */
        if (ev.target.closest("[data-xfx]")) { exFilter = null; paintCat(); return; }   /* the filter is let go */
        var b = ev.target.closest("[data-ex]"); if (!b || b.classList.contains("rcard")) return;   /* a card opens through the kit's card binding, below */
        openEx(b);
      });
      function openEx(b) {
        var ex = state.cat.filter(function (x) { return x.id === b.dataset.ex; })[0];
        catCurId = b.dataset.ex; RosterList.states();   /* the lists' current state: the one just opened */
        if (sheet) previewSheet(ex, swapIt);   /* adding or replacing: the exercise is shown first, and the action is its own button in its header: on the left on a wide screen, in a second popup on a narrow one */
        else previewEx(ex, swapIt);
      }
      function paintCat() {
        var q = fold(pk.q.trim()), l = catL;   /* pk.q: what the header's search holds (the kit's search, app mode: the catalog ranks) */
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
        var chip = '';   /* the filter is the layer's title (the exercises of ...): closing the layer lets it go */
        /* a category is the kit's section: it opens only when it is tapped (typing a search opens nothing), the kit remembers it, its cards are built on the first opening */
        RosterList.render(l, cats, { kind: "section", key: function (k) { return "cat:" + k; }, attrs: function (k) { return 'data-cat="' + esc(k) + '"'; },   /* THE KIT'S LIST of sections (ui/docs/list.md): a category opens only when it is tapped, the kit remembers it, its cards (a list of their own) are built on the first opening */
          content: function (k) { return { key: "cat:" + k, title: catName(k) || "ללא קטגוריה", count: by[k].length, lazy: true }; },
          fill: function (k, el) { catCards(k, el); },
          empty: function () { return fold(pk.q.trim()) ? null : { title: "אין תרגילים בקטלוג", text: "", icon: I.exercise }; } });   /* nothing found by a search: the kit's "לא נמצא"; an empty catalog is not "not found" */
        Object.keys(catIn).forEach(function (k) { var el = catIn[k]; if (el.isConnected) RosterList.render(el, by[k] || [], EXL); else delete catIn[k]; });   /* the open categories follow the search: their cards move, none is drawn again */
      }
      /* the pager: two pages side by side in one horizontal scroller with scroll snap. In RTL the first page (exercises) is on the right and scrollLeft runs negative, so the target is signed by the direction. A tap on a tab scrolls the pager; a swipe changes the tab; the tab marker is the kit's own (aria-selected). */
      var pgr = r.querySelector("#pgr"), TABS = ["ex", "mu"];
      var hd = (r.closest("dialog") || r).querySelector(".rhead"), srch = null;   /* the kit's search of this catalog (attached at the end, once the lists can be drawn) */
      var musicAll = null, musicLoading = false, mById = {}, mList = [], mShown = 0, MP = 100, mxOf = {}, xs = [], xsFor = null, xsT = 0;
      function musicCard(m) {   /* a song of the music catalog: the music card (muCard), its exercises as lines */
          return { m: m, o: muOpts(m, { attrs: 'data-sgc="' + esc(m.id) + '"', plus: '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-addto="' + esc(m.id) + '" aria-label="הוספה" title="הוספה לוויוונסיה או לתרגיל">' + I.plus + '</button>' }) };
      }
      var muDrawn = false;
      function muList(items, uo) {   /* THE KIT'S LIST (ui/docs/list.md): 100 at a time, its scroll kept through a refresh (memory), a tap plays */
        var l = r.querySelector("#pkl"); if (!l) return null;
        return songList(l, items, { key: function (m) { return m.id; }, card: musicCard, search: true, page: MP, memory: "bio.catmu", current: function (m) { return m.id === catMusId; },
          empty: function () { var f = { ln: pk.mln, ch: pk.mch, sp: pk.msp, ef: pk.mef }; return fold(pk.mq.trim()) ? null : { title: f.ln || f.ch || f.sp || f.ef ? "אין מוסיקה שמתאימה לסינון" : "אין מוסיקה בקטלוג", text: "", icon: I.curve }; } }, uo);   /* nothing found by a search: the kit's "לא נמצא"; with no search it is an empty list, not "not found" */
      }
      function fillSelects() { muFilterFill(r, musicAll, pk); }   /* the shared filter (muFilterFill) */
      function paintMu() {
        var l = r.querySelector("#pkl"); if (!l || !musicAll) return;
        var s = fold(pk.mq.trim()), f = muFilterOf(pk);   /* pk.mq: the header's search on the music catalog */
        saveCat();   /* the search and the four boxes are kept through a refresh, like the exercises' search */
        var fr = muFind(musicAll, f, s, s && xsFor === s ? xs : null, mById); mList = fr.list; mxOf = fr.xOf;   /* the shared matching: with no search the most exercises first, a search nearest first */
        if (!s && !exCnt) ensureExCnt().then(function () { if (r.isConnected) paintMu(); });
        muList(mList, { reset: muDrawn });   /* a new filter or search: back to the top and the first page; the first drawing comes back where it was left */
        muDrawn = true;
      }
      function ensureMusic() {
        if (!pgr || !r.querySelector("#pkl") || musicLoading || musicAll) return;
        musicLoading = true;
        Promise.all([muCatalog(), exIndex().catch(function () { return null; })]).then(function (rr) {   /* the shared read of the catalog's songs, and with it the songs' exercises (the cards' lines) */
          var all = rr[0]; all.forEach(function (m) { mById[m.id] = m; });
          musicAll = all; fillSelects(); paintMu();
        }, function () { musicLoading = false; var L1 = muList(null); if (L1) L1.fail(ensureMusic); });   /* the kit's failed list: "ניסיון נוסף" asks again */
      }
      function dirSign() { return getComputedStyle(pgr).direction === "rtl" ? -1 : 1; }
      function markKind(i) {   /* which of the two catalogs this is: the title says it, the left part follows it */
        var t = TABS[i];
        if (pk.tab !== t) { pk.tab = t; saveCat(); syncLeftToTab(); }
        var ht = hd && hd.querySelector("[data-cattitle]"); if (ht && ht.textContent !== catTitle()) { ht.textContent = catTitle(); ht.title = catTitle(); }   /* the title says which catalog; the search goes on in it with what it holds */
        if (srch) { srch.label(catSearchLabel()); srch.set(i === 1 ? pk.mq : pk.q); }
        if (i === 1) ensureMusic();
      }
      function goKind(i) { pgr.scrollTo({ left: dirSign() * i * pgr.clientWidth, behavior: "auto" }); markKind(i); }
      catApi = { paint: paintCat, goEx: function () { goKind(0); }, goKind: function (k) { goKind(k === "mu" ? 1 : 0); } };
      if (pgr) {
        var lastW = 0, resnap = function () { var w = pgr.clientWidth; if (w && w !== lastW) { lastW = w; var i = TABS.indexOf(pk.tab); goKind(i < 0 ? 0 : i); } };   /* it came on screen (a hidden box forgets its scroll) or changed width: back on the page of its catalog */
        if (window.ResizeObserver) new ResizeObserver(resnap).observe(pgr); else window.addEventListener("resize", resnap);
        var i0 = TABS.indexOf(pk.tab); markKind(i0 < 0 ? 0 : i0); requestAnimationFrame(resnap);
      }
      if (r.querySelector("#pkl")) {
        r.querySelectorAll("[data-mf]").forEach(function (sel) { sel.addEventListener("change", function () { pk[sel.dataset.mf] = sel.value; paintMu(); }); });
        var ml = r.querySelector("#pkl");   /* the next pages are the kit's list's (page) */
        ml.addEventListener("click", function (ev) {   /* the same as before: a tap on a card plays, the chip adds an exercise with no name and that song */
          if (ev.target.closest("[data-audio], a")) return;
          var bt = ev.target.closest("[data-sg]");
          if (!bt) return;   /* a tap on a song only plays it (the kit's card binding, cardPlay); its exercises open from the curve button */
          var m = mById[bt.dataset.sg]; if (m) setExFilter(m);   /* the curve button: the exercises of the song, as a new layer (the same as from inside an exercise) */
        });
      }
      ["#pks", "#pkl"].forEach(function (s) { var scEl = r.querySelector(s); if (scEl) scEl.addEventListener("scroll", function () { clearTimeout(scEl._t); scEl._t = setTimeout(saveCat, 250); }); });   /* both lists' scroll is kept: the exercises' and the music's */
      var sb = hd && hd.querySelector("[data-catsearch]");   /* the kit's search (app mode: the catalog ranks); on the music catalog it is heavy and waits --search-wait */
      if (sb) srch = RosterSearch.attach(sb, function () { return r.querySelector(pk.tab === "mu" ? "#pkl" : "#pks"); }, { label: catSearchLabel(), icon: function () { return pk.tab === "mu" ? I.music : I.exercise; }, key: exFilter || swapIt ? null : "biodanza.catalog", value: pk.tab === "mu" ? pk.mq : pk.q,
        heavy: function () { return pk.tab === "mu"; }, onQuery: function (q) {
          if (pk.tab === "mu") {
            pk.mq = q; paintMu(); saveCat();
            if (fold(q).trim()) warmEx().then(function () { var v = fold(pk.mq.trim()); if (!r.isConnected || !v || !musicAll) return; xs = exSongs(v); xsFor = v; paintMu(); });   /* the songs of the exercises that match, once their texts are here */
          } else {
            pk.q = q; saveCat(); if (state.cat) paintCat();
            if (q && !catTx) loadCatTx().then(function () { if (catTx && r.isConnected && pk.q.trim()) paintCat(); });
          }
        } });
      var getCat = function () { return (state.cats ? Promise.resolve() : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) {
        state.cats = c || [];
      })).then(function () { return state.cat ? null : loadCatalog().then(function (c) { state.cat = c; }); }).then(paintCat, function (e) {   /* the catalog did not arrive: the list stops waiting and offers "ניסיון נוסף" */
        fail(e); var l = catL; if (l && !state.cat) loaded(l).innerHTML = phErr("לא הצלחנו לטעון את הקטלוג", function () { busyAgain(catL); getCat(); });
      }); };
      return getCat();
  }
  function picker(swapIt) {
    state.pickerShow = true;
    show('<header class="rhead"><button class="rbtn rbtn--icon" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button><div class="rhead__text">' + catField() + '</div>' + catActs() + '</header>' + pickerBody(false, swapIt), function (r) {
      on(r, "back", !wide() ? back : swapIt ? function () { pending = { item: swapIt.id }; back(); }   /* leaving a replacement: the same exercise is open again on the left */
        : function () { show(phPick(), null, "d"); back(); });
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
      RosterSheet.open(dlg, "bottom");
      if (document.activeElement && document.activeElement !== document.body && dlg.contains(document.activeElement)) document.activeElement.blur();
      saveCat();
      return Promise.resolve();
    }
    RosterSheet.popup({ id: dlg.id, title: catTitle(), body: pickerBody(true, swapIt, over) });   /* a phone: the kit's popup from the bottom */
    dlg.__bioKind = swapIt || over ? "swap" : "main"; dlg.__bioPk = swapIt || over ? null : pk;
    var hd0 = dlg.querySelector(".sheet-head"); if (hd0) { var h20 = hd0.querySelector(".rhead__title"); if (h20) h20.setAttribute("data-cattitle", ""); hd0.insertAdjacentHTML("beforeend", catActs()); }   /* the sheet's title is the catalog's, and its search a magnifier among the actions */
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
    musPaint(imus, fake, true);   /* the cards become the kit's list */
    RosterSection.bind(imus);   /* the music of the catalog's exercise is a folding section: the kit opens and closes it */
    imus.addEventListener("racc-change", function (ev) { fake.__musOpen = !!(ev.detail && ev.detail.open); });   /* what the user did holds for the life of this preview: a repaint of the songs (a play marks one) keeps it */
    imus.addEventListener("click", function (ev) {
      if (ev.target.closest("[data-audio], a")) return;
      if (ev.target.closest("[data-addm]")) { openAddMusic(fake, function () { musPaint(imus, fake, true); }); return; }   /* more songs for what is shown: not for the catalog */
      var c = ev.target.closest("[data-opt]"); if (!c) return;
      var pk = ev.target.closest("[data-pick]");
      var mfx = ev.target.closest("[data-mfx]");
      if (mfx) { var mm = (fake.item_music_options || []).map(function (o) { return o.music; }).filter(function (x) { return x && x.id === mfx.dataset.mfx; })[0]; if (mm) setExFilter(mm); return; }   /* the catalog's exercises narrowed to this song's */
      if (!pk) return;   /* a tap on the card plays (the kit's card binding, cardPlay); the add button marks the song for the exercise */
      var id = pk.dataset.pick, k = fake.sel.indexOf(id); fake.manual = fake.manual || {};
      if (k >= 0 && !fake.manual[id]) { fake.manual[id] = true; if (fake.auto === id) fake.auto = null; }   /* marked only because it plays: the tap makes the mark its own, it stays when the song stops */
      else if (k >= 0) { fake.sel.splice(k, 1); delete fake.manual[id]; }
      else { fake.sel.push(id); fake.manual[id] = true; }
      syncFake(); musPaint(imus, fake, true);
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
      if (changed) { syncFake(); musPaint(imus, fake, true); }
    };
    document.addEventListener("bioaudio", onAudio);
  }
  function previewSheet(e, swapIt) {
    var tok = ++previewTok;
    var exId = "exDlg" + dsfx();
    var skelDlg = RosterSheet.popup({ id: exId, title: name(e) }); skelDlg.setAttribute("data-load", "exercise"); var et0 = skelDlg.querySelector(".rhead__title"); if (et0) et0.setAttribute("data-rselect", "");   /* the exercise's name, the content of its detail window (ui/docs/window.md "בחירת טקסט") */   /* law 7: the window opens now, loading (no body), its content comes after (a phone: the kit's popup from the bottom); it loads as the kit's exercise symbol */
    var fake = null, word = swapIt ? "החלפה בתרגיל הזה" : "הוספה לוויוונסיה";
    /* the header is final from the first frame: the plus is there before the exercise arrives (a tap before then does nothing); only the body is filled.
       The action is a button with its words, as on a computer: a plus and the name of the vivencia (or the word, and a menu of the last three, when none is open); a swap says so */
    var addName = catAddName(), ico = (swapIt ? I.swap : I.plus);   /* the same name as the catalog's add button, at every width (no "ויוונסיה" twice when none is open) */
    var gob = document.createElement("button"); gob.type = "button"; gob.id = "exgo"; gob.className = "rbtn rbtn--icon rbtn--accent"; gob.setAttribute("aria-label", swapIt ? word : addName); gob.title = swapIt ? word : addName;
    gob.style.cssText = "order:98;flex:none";
    gob.innerHTML = '<span aria-hidden="true" class="ricon">' + ico + '</span>';   /* only the plus; the confirmation says where it goes */
    gob.disabled = true;   /* it needs the exercise: in its place from the first frame, off until the exercise has arrived */
    var shd = skelDlg.querySelector(".sheet-head"); if (shd) shd.appendChild(gob);
    if (shd && e.id && !swapIt) {   /* the exercise's heart, beside the plus (owner 2026-11-26: on a phone too): an adaptive action of the kit's RosterHeader, folding into "עוד" with its label and state when it does not fit */
      var hacts = document.createElement("span"); hacts.className = "rhead__acts"; hacts.style.cssText = "order:98";
      hacts.innerHTML = heartBtnEx(e.id, "").replace(' data-likex=', ' data-pri="1" data-menu-label="אהבתי" data-menu-check data-likex=') +
        '<button type="button" class="rbtn rbtn--icon" data-rmore="fold" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>';
      gob.after(hacts);
      hacts.lastChild.addEventListener("click", function () { menu(hacts.lastChild, RosterHeader.items(shd)); });
    }
    gob.addEventListener("click", function () {
      if (!fake) return;
      if (swapIt) confirmSwap(e, swapIt, true, fake.music_id, fake.sel);
      else chooseDest(name(e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(fake); addExTo(e, d.vivId, es.mid, es.all, true); }, { vivOnly: true });
    });
    var getP = function () { loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;
      fake = itemFake(e, rows, songs, res.emphasis); gob.disabled = false;
      var dlg = skelDlg;
      RosterSheet.popup.fill(dlg, itemPageHtml(fake, true));
      dlg.dataset.ex = swapIt ? "" : e.id; if (!dlg.__catWired) { dlg.__catWired = true; dlg.addEventListener("close", function () { saveCat(); }); } saveCat();
      wireRoMusic(dlg, fake);
    }, function (er) { if (tok === previewTok) RosterSheet.popup.fill(skelDlg, phErr("לא הצלחנו לטעון", function () { busyAgain(RosterSheet.popup.body(skelDlg)); getP(); })); fail(er); }); };
    getP();
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
    pushLayer(filter);
    if (wide()) {
      ensureCatLayer();   /* a layer over: a new popup of the catalog on top of the one below (the kit keeps the one below exactly as it was, and dims its left pane) */
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
    if (!(wide() && catPanel)) return;
    var isOpen = !!(catPrev && catPrev.classList.contains("is-open"));
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
    if (useLayer && catLayer) { catLayer.querySelectorAll(".rcard[aria-current]").forEach(function (c) { c.removeAttribute("aria-current"); }); var mc = catLayer.querySelector("[data-sgc=\"" + m.id + "\"]"); if (mc) mc.setAttribute("aria-current", "true"); catMusId = m.id; RosterList.states(); }   /* the song whose exercises are shown is marked, as the exercise whose texts are shown is */
    /* law 7: the layer or the popup opens now, its header final from the first frame (the X, the title); only the body loads (the kit's .rload) and only the body is filled */
    var putM = prevBody;
    if (useLayer) {
      openPrev('<header class="rhead bio-ihead"><div class="rhead__text"><h2 class="rhead__title" dir="auto" data-rselect>' + esc(songName(m)) + '</h2></div></header><div class="rlist rload" aria-busy="true" data-load="exercise" data-pvskel></div>');
      var mh = catPrev.querySelector(".rhead"); if (mh) { var xb = document.createElement("button"); xb.type = "button"; xb.className = "rbtn rbtn--icon"; xb.setAttribute("aria-label", "סגירה"); xb.title = "סגירה"; xb.innerHTML = I.x; xb.addEventListener("click", function () { previewTok++; closeMusPrev(); }); mh.insertBefore(xb, mh.firstChild); }
      catPrevId = null; catPrevCtx = null; catPrevMus = m.id; lastMusPrev = m; refreshPrevLabel();
    }
    else { var skelDlg = RosterSheet.popup({ id: "mpDlg", title: songName(m) }); skelDlg.setAttribute("data-load", "exercise"); var st0 = skelDlg.querySelector(".rhead__title"); if (st0) st0.setAttribute("data-rselect", ""); }   /* the song's name: the content of its detail window, it can be selected (ui/docs/window.md "בחירת טקסט") */   /* a phone: the kit's popup from the bottom, loading; what loads is the song's exercises (the kit's loading symbol) */
    var getM = function () { Promise.all([api("/rest/v1/exercise_music?music_id=eq." + m.id + "&select=exercises(id,title_he,title_en,category)&limit=500"), state.cats ? null : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) { state.cats = c || []; }, function () { return null; })]).then(function (rr) { var rows = rr[0];
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
      var addBtn = '';
      /* the exercises of the song, laid out as the catalog's exercises tab: the kit's section per category with its count, the same cards in it, built on the first opening */
      var cardsOf = function (g) { return '<div class="rlayout rlayout--grid rgrid">' + g.list.map(function (e) { return RosterCard.html({ attrs: 'data-pvex="' + esc(e.id) + '"', click: true, title: name(e), subHtml: exSubHtml(e) }); }).join("") + '</div>'; };
      var body = exs.length ? groups.map(function (g, gi) {
        return RosterSection.html({ key: "songcat:" + order[gi], title: g.name, count: g.list.length, open: groups.length === 1, lazy: true, attrs: 'data-pvcat="' + gi + '"' });   /* one category only: open unless closed before, there is nothing to choose */
      }).join("") : ph("המוזיקה הזאת לא משויכת לתרגיל בקטלוג", "", I.exercise);   /* the kit's empty state: about exercises, so the exercise icon */
      var wire = function (root) {
        var ab = root.querySelector("[data-mpadd]");
        if (ab) ab.addEventListener("click", function () { chooseDest(songName(m), { vivId: state.viv && state.viv.id, itemId: liveItem && liveItem.id }, function (d) { return addMusicTo(m, d, false); }); });
        RosterSection.bind(root, { fill: function (key, el) { var gi = order.indexOf(key.slice(8)); if (gi >= 0) el.innerHTML = cardsOf(groups[gi]); } });   /* a category opens and closes by the kit; its cards are built on the first opening */
        RosterCard.bind(root, "[data-pvex]", function (ex) { var e = exs.filter(function (x) { return x.id === ex.dataset.pvex; })[0]; if (e) previewEx(e); });   /* an exercise card opens it (the kit's card binding) */
      };
      if (useLayer) {
        putM(body);
        wire(catPrev);
        catPrevId = null; catPrevCtx = null; catPrevMus = m.id; lastMusPrev = m; refreshPrevLabel();
      } else {
        var dlg = skelDlg; RosterSheet.popup.fill(dlg, body);
        var shd = dlg.querySelector(".sheet-head"); if (shd) { shd.insertAdjacentHTML("beforeend", addBtn); }   /* the main action: the header's last slot */
        wire(dlg);
      }
    }, function (er) { if (tok === previewTok) {   /* the header stays: only the body says it; "ניסיון נוסף" makes the body wait again and asks again */
        var eb = phErr("לא הצלחנו לטעון", function () { if (tok !== previewTok) return; if (useLayer) { var e0 = catPrev.querySelector(":scope > .rempty"); if (e0) e0.outerHTML = '<div class="rlist rload" aria-busy="true" data-load="exercise" data-pvskel></div>'; } else busyAgain(RosterSheet.popup.body(skelDlg)); getM(); });
        if (useLayer) putM(eb); else RosterSheet.popup.fill(skelDlg, eb); } fail(er); }); };
    getM();
  }
  function previewEx(e, swapIt) {
    var useLayer = !!(catPanel && wide() && !swapIt);
    if (useLayer && catPrevId === e.id && catPrev && catPrev.classList.contains("is-open")) { previewTok++; closeExPrev(); return; }   /* a second tap on the chosen one: it closes, with its animation */
    var tok = ++previewTok;
    var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה";   /* adding: a plus with the vivencia's name; in no vivencia, a plus with the word, and a tap asks which of the last three */
    /* the header is final from the first frame (the X, the title, the plus and the heart): only the body waits, as a skeleton, and only the body is filled (law 7) */
    var hdr = itemHead(false, false, "", e.id, name(e), true, word, undefined, undefined, !swapIt), SKEL = '<div class="rlist rload" aria-busy="true" data-load="exercise" data-pvskel></div>';
    var goOff = function (root, off) { var g = root && root.querySelector('.rhead [data-act="doswap"]'); if (g) g.disabled = off; };   /* the plus needs the exercise: in its place from the first frame, off until the exercise has arrived */
    var decor = function (root) {
      var ph0 = root.querySelector(".rhead"); if (!ph0) return;
      var xb = document.createElement("button"); xb.type = "button"; xb.className = "rbtn rbtn--icon"; xb.setAttribute("aria-label", "סגירת התרגיל"); xb.title = "סגירת התרגיל"; xb.innerHTML = I.x; xb.addEventListener("click", function () { previewTok++; closeExPrev(); });
      var gr0 = document.createElement("span"); gr0.className = "rgroup"; var da0 = ph0.querySelector(":scope > [data-act=\"doswap\"]"); if (da0) gr0.appendChild(da0); gr0.insertAdjacentHTML("beforeend", heartBtnEx(e.id, "")); ph0.insertBefore(xb, ph0.firstChild); ph0.appendChild(gr0);
    };
    var putBody = prevBody;
    if (useLayer && catPanel) { openPrev(hdr + SKEL); decor(catPrev); goOff(catPrev, true); catPrevId = e.id; lastExPrev = e; catPrevCtx = null; refreshPrevLabel(); }
    else show(hdr + SKEL, function (r) { goOff(r, true); }, "d");
    var getE = function () { loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;   /* a later row was chosen meanwhile */
      var fake = itemFake(e, rows, songs, res.emphasis);
      /* the same page as the exercise of a vivencia, only read: its header, its song cards, its texts; the action is the green button in the header, where the delete is in the vivencia */
      var phtml = hdr + itemPageHtml(fake, true);
      var pwire = function (r) {
        wireRoMusic(r, fake); sbSync(r); catPreview = true;
        on(r, "xmore", function (b) { menu(b, RosterHeader.items(b.closest(".rhead"))); });   /* a phone: the header's folded actions (the heart, with its state) */
        on(r, "doswap", function (btn) {
          if (swapIt) confirmSwap(e, swapIt, undefined, fake.music_id, fake.sel);
          else chooseDest(name(e), { vivId: state.viv && state.viv.id }, function (d) { var es = effSel(fake); addExTo(e, d.vivId, es.mid, es.all); }, { vivOnly: true });
        });
      };
      if (useLayer && catPanel) { putBody(itemPageHtml(fake, true)); goOff(catPrev, false); pwire(catPrev); catPrevId = e.id; lastExPrev = e; catPrevCtx = { e: e, fake: fake }; refreshPrevLabel(); saveCat(); requestAnimationFrame(function () { catPrev.classList.add("is-open"); }); }
      else show(phtml, pwire, "d");
    }, function (er) { if (tok === previewTok) {   /* "ניסיון נוסף": the body waits again (the header stays) and the exercise is asked for again */
        var eb = phErr("לא הצלחנו לטעון", function () { if (tok !== previewTok) return; if (useLayer && catPanel) { var e0 = catPrev.querySelector(":scope > .rempty"); if (e0) e0.outerHTML = SKEL; } else show(hdr + SKEL, function (r) { goOff(r, true); }, "d"); getE(); });
        if (useLayer && catPanel) putBody(eb); else show(hdr + eb, function () { /* nothing to wire */ }, "d"); } fail(er); }); };
    getE();
  }
  /* replacing is asked in the kit's popup, one action: closing it is the cancel */
  function confirmSwap(e, swapIt, sheet, mid, all) {
    RosterSheet.confirm({ title: "החלפת תרגיל", text: 'להחליף את "' + esc(itemName(swapIt)) + '" ב"' + esc(name(e)) + '"? השם, הפואטיקה וההנחיה שכתבתם בתרגיל הנוכחי יימחקו. ההערות נשארות.', action: "החלפה", run: function (dlg) { dlg.close(); addEx(e, swapIt, sheet, mid, all); } });
  }
  function closeSheets() { ["exDlg", "catDlg"].forEach(function (id) { slideClose(document.getElementById(id)); }); }
  /* a song chosen in the catalog's search: an exercise with no name, only that song */
  /* a confirm that waits for its action (the action returns its promise): the popup stays and the pressed button shows the wait, then it closes, on success and on failure (law 7) */
  function confirmGo(dlg, btn, fn) { var pr = fn(), fin = function () { dlg.close(); }; if (pr && pr.then) RosterBusy(btn, pr).then(fin, fin); else fin(); }
  function confirmChoose(songLabel, exLabel, fn) {   /* choosing the song that plays in the vivencia asks first, in the kit's popup with ONE action */
    RosterSheet.confirm({ title: "בחירת מוזיקה", text: 'לבחור את "' + esc(songLabel) + '" כמוזיקה של "' + esc(exLabel) + '"? היא תתנגן בוויוונסיה.', action: "בחירה", run: function (dlg, btn) { confirmGo(dlg, btn, fn); } });
  }
  function confirmAddMusic(songLabel, toLabel, fn) {   /* every adding of a song asks first, in the kit's popup with ONE action */
    RosterSheet.confirm({ title: "הוספת מוזיקה", text: 'להוסיף את "' + esc(songLabel) + '" ל' + (toLabel ? '"' + esc(toLabel) + '"' : "") + '?', action: "הוספה", run: function (dlg, btn) { confirmGo(dlg, btn, fn); } });
  }
  /* WHERE A SONG (OR AN EXERCISE) GOES: a popup with the vivencias as the kit's cards; adding a song, the chosen one shows its places under it. It opens on the vivencia (and the exercise) the person is in, the choice is the current card, the header's description says what goes where, and the button at the bottom adds. "A new exercise" (the default) takes the song as an exercise with no name. */
  /* the small picker of the start or end music has a dialog of its own (chooseDest is the kit's popup) */
  function chooseDest(songLabel, cur, fn, opts) {
    var vivOnly = !!(opts && opts.vivOnly);
    var side = wide(), pop = null;   /* the kit's one popup: a panel on the left on a computer, a short sheet from the bottom on a phone */
    var vivs = (state.vivs || []).filter(function (v) { return v.role !== "view"; });
    var dest = { vivId: cur && cur.vivId || null, itemId: cur && cur.itemId || null };
    if (dest.vivId && !vivs.some(function (v) { return v.id === dest.vivId; })) dest = { vivId: null, itemId: null };
    if (dest.vivId) vivs = vivs.filter(function (v) { return v.id === dest.vivId; }).concat(vivs.filter(function (v) { return v.id !== dest.vivId; }));   /* the vivencia you are in is marked and comes first */
    var open = {}, cache = {};
    if (dest.vivId && !vivOnly) { open[dest.vivId] = 1; if (state.viv && state.viv.id === dest.vivId && state.items) cache[dest.vivId] = state.items; }
    /* the header's description says what goes where, live (owner 2026-11-25): "<what> ל<where>" */
    function where() {
      var dv = vivs.filter(function (v) { return v.id === dest.vivId; })[0]; if (!dv) return songLabel + ": בחרו לאן";
      var di = dest.itemId && (cache[dest.vivId] || []).filter(function (i) { return i.id === dest.itemId; })[0];
      var to = vivOnly ? (dv.title || "ויוונסיה חדשה") : di ? (itemName(di) || "ללא שם") : dest.recv ? (dest.recv === "end" ? "מוסיקת הסיום" : "מוסיקת ההתחלה") : "תרגיל חדש";
      return songLabel + " ל" + to + (vivOnly ? "" : " · " + (dv.title || "ויוונסיה חדשה"));
    }
    /* the vivencias are the kit's cards, as on the home list (the name, its partners, the date); the chosen one is current. Adding a song: under the chosen vivencia, a divider and the places in it
       as cards: a new exercise with no name (as before, the default), the start music, its exercises (the number as the lead), the end music; the chosen place is current. */
    /* THE KIT'S LIST (ui/docs/list.md): the vivencias are the kit's cards, as on the home list (the name, its partners, the date); the chosen one is current. Adding a song: under the chosen
       vivencia, a divider and the places in it as cards: a new exercise with no name (as before, the default), the start music, its exercises (the number as the lead), the end music;
       the chosen place is current (the header says it). While the places are on their way, the group is the kit's loading area (load), never an empty card */
    function destItems() {
      var out = [];
      vivs.forEach(function (v) {
        var open1 = !vivOnly && dest.vivId === v.id;
        out.push({ k: "v:" + v.id, g: open1 ? "chosen" : dest.vivId && !vivOnly ? "others" : "chosen", kind: "viv", v: v });
        if (!open1 || !cache[v.id]) return;
        out.push({ k: "n:" + v.id, g: "places", kind: "new", v: v }, { k: "r:start", g: "places", kind: "start", v: v });
        var n = 0; cache[v.id].forEach(function (i) { out.push({ k: "i:" + i.id, g: "places", kind: "item", v: v, i: i, n: i.backlog ? "•" : String(++n) }); });
        out.push({ k: "r:end", g: "places", kind: "end", v: v });
      });
      return out;
    }
    var openV = function () { return !vivOnly && dest.vivId ? vivs.filter(function (v) { return v.id === dest.vivId; })[0] : null; };
    var DEST = { kind: "card", key: function (x) { return x.k; }, group: function (x) { return x.g; },
      groups: [{ key: "chosen" }, { key: "places", label: "", load: false }, { key: "others", label: "ויוונסיות אחרות" }],
      attrs: function (x) { return x.kind === "viv" ? 'data-cdh="' + esc(x.v.id) + '"' : x.kind === "new" ? 'data-cdn="' + esc(x.v.id) + '"' : x.kind === "item" ? 'data-cdi="' + esc(x.i.id) + '" data-cdv="' + esc(x.v.id) + '"' : 'data-cdr="' + x.kind + '" data-cdv="' + esc(x.v.id) + '"'; },
      content: function (x) {
        if (x.kind === "viv") { var made = ""; try { if (x.v.created_at) made = new Date(x.v.created_at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" }); } catch (e) { /* no date */ }
          return { title: x.v.title || "ויוונסיה חדשה", sub: (x.v.partners || []).join(", "), act2: made ? '<span class="rcard__num" title="תאריך יצירה">' + made + '</span>' : '' }; }
        if (x.kind === "new") return { title: "תרגיל חדש", sub: "בלי שם, עם המוזיקה הזאת" };
        if (x.kind === "item") return { lead: x.n, title: itemName(x.i) || "ללא שם" };
        return { title: x.kind === "start" ? "מוסיקת התחלה" : "מוסיקת סיום" };
      },
      current: function (x) {
        if (x.kind === "viv") return dest.vivId === x.v.id;
        if (dest.vivId !== x.v.id) return false;
        return x.kind === "new" ? !dest.itemId && !dest.recv : x.kind === "item" ? dest.itemId === x.i.id : dest.recv === x.kind;
      },
      onOpen: function (x, card) { pick(card); } };
    function foot() { return '<button class="rbtn rbtn--block" type="button" id="cdadd"' + (dest.vivId ? '' : ' disabled') + '>הוספה</button>'; }
    function draw() {
      var ttl = vivOnly ? "הוספת תרגיל" : "הוספת מוזיקה";
      if (!pop) {
        pop = RosterSheet.popup({ id: "destDlg", side: "end", size: "sm", title: ttl, sub: where(), body: "", foot: foot(), onClose: function (el) { el.removeEventListener("click", onClick); } });
        pop.addEventListener("click", onClick);
      } else { RosterSheet.popup.sub(pop, where()); var f = pop.querySelector("#cdadd"); if (f) f.outerHTML = foot(); }
      var ov = openV();
      DEST.groups[1] = { key: "places", label: ov ? "לאן בתוך " + (ov.title || "ויוונסיה חדשה") : "", load: !!ov && !cache[ov.id] };
      RosterList.render(RosterSheet.popup.body(pop), destItems(), DEST);   /* the cards that did not change stay as they are: no repaint, the scroll stays */
    }
    function load(vid) {
      if (cache[vid]) return;
      itemsOf(vid).then(function (r) { r = r || []; cache[vid] = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); draw(true); }, function () { cache[vid] = []; draw(true); });
    }
    function pick(c) {
      var d = c.dataset;
      if (d.cdr) dest = { vivId: d.cdv, itemId: null, recv: d.cdr };
      else if (d.cdi) dest = { vivId: d.cdv, itemId: d.cdi };
      else if (d.cdn) dest = { vivId: d.cdn, itemId: null };
      else if (d.cdh && dest.vivId !== d.cdh) { dest = { vivId: d.cdh, itemId: null }; if (!vivOnly) load(d.cdh); }
      draw(true);
    }
    function onClick(ev) {
      var ad = ev.target.closest("#cdadd");
      if (ad && dest.vivId) { var d = { vivId: dest.vivId, itemId: dest.itemId, recv: dest.recv || null, items: cache[dest.vivId] || null }; var fin = function () { pop.removeEventListener("click", onClick); RosterSheet.popup.close(pop); }, pr = fn(d); if (pr && pr.then) RosterBusy(ad, pr).then(fin, fin); else fin(); }
    }
    draw(false);
    if (dest.vivId && !vivOnly) load(dest.vivId);
  }
  /* the song goes where the popup said: into an exercise (as one of its songs), or into a vivencia as an exercise with no name and that song */
  /* the song goes to the start music or to the end music of the vivencia: a menu of the two from the plus that was pressed; choosing adds it at once (the item waits, law 7) */
  function chooseRecv(btn, fn) {
    var item = function (kind, label) { return { label: label, keep: true, fn: function (el, close) { RosterBusy(el, Promise.resolve(fn(kind))).then(close, close); } }; };
    RosterMenu.open(btn, [item("start", "מוסיקת התחלה"), item("end", "מוסיקת סיום")]);
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
      if (im && li && liveItem && liveItem.id === itemId) musPaint(im, li);
    });   /* msg ("נוסף ...") is not said: the screen shows what was added (owner 2026-11-26) */
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
      }).then(function () {
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
    }).then(function () { if (sheet) { closeSheets(); return loadItems().then(openNew, fail); }
      if (catPreview || catPanel || catPrevId) { closeCatPrev(); closeCatPanel(true); return loadItems().then(openNew, fail); }
      if (wide()) show(phPick(), null, "d"); else stack().pop(); back(); }, fail);
  }

  /* ---------- player: the session, one exercise at a time ---------- */
  /* ---------- allowlist (admin only): the kit's popup, from the left on a computer ---------- */
  /* a user of the allow list: the name and (for the main admin) the level of permission, saved as they change; closing the popup is the end */
  function editUserPopup(u, sup, done) {
    RosterSheet.confirm({ id: "userEditDlg", title: "פרטי משתמש", action: "שמירה",   /* only the action saves; closing is the cancel */
      fields: [{ name: "note", label: "שם מלא", value: u.note || "", autocomplete: "name", maxlength: 80 }],
      save: function (val, f) {   /* check on save (ui/docs/realtime.md): only if nobody changed this name meanwhile */
        var nm = String(val.note || "").replace(/\s+/g, " ").trim();
        return saveChecked({ table: "allowed", where: "email=eq." + encodeURIComponent(u.email), at: { note: u.note == null ? null : u.note }, force: f && f.force, patch: { note: nm },
          cols: { note: { label: "שם מלא", the: "השם המלא" } } }).then(function (res) {
          if (res.conflict) return res;
          u.note = nm; if (done) done();
          if (u.email === myEmail()) { if (state.me && "name" in state.me) state.me.name = nm || state.me.name; namesChanged(); }   /* my own name, renamed from the users list */
        }, shortFail);
      } });
  }
  function allowPopup() {   /* the kit's one popup: the left pane on a computer, a sheet on a phone */
    var rows = [], ready = false;   /* ready: the list has arrived (until then the area is loading) */
    var dlg = RosterSheet.popup({ id: "allowDlg", side: "end", title: "ניהול משתמשים", body: "" });
    var ab = RosterSheet.popup.body(dlg);   /* the body IS the kit's list (ui/docs/layout.md: .rlayout__body.rlist), loading until the people arrive; its empty state is centred in it */
    ab.id = "alist"; ab.classList.add("rlist", "rload"); ab.setAttribute("aria-busy", "true");
    ab.insertAdjacentHTML("beforebegin", '<div class="rlayout__bar" data-rquick><div class="rlayout rfields"><div class="rlayout rlayout--row rfields__row">' +   /* the fields over the list are its top block, the kit's tile (data-rquick): on a phone it slides out on a scroll down and comes back on a scroll up */
        '<label class="rlayout rlayout--unit rlayout__grow rfield rfield--ltr"><span>אימייל של חשבון גוגל</span><input id="em" type="email" placeholder=" " autocomplete="off"></label>' +
        '<label class="rlayout rlayout--unit rlayout__grow rfield"><span>שם מלא</span><input id="en" placeholder=" " autocomplete="off" maxlength="80"></label></div>' +
        '<button class="rbtn" id="addm" type="button">הוספה</button></div></div>');
    function paintA() {
      if (!ready) return;
      var qe = fold(dlg.querySelector("#em").value.trim()), qn = fold(dlg.querySelector("#en").value.trim()), l = dlg.querySelector("#alist");   /* both fields filter the list as they are typed: the email by the email, the name by the name */
      var vis = rows.filter(function (a) { return (!qe || fz(a.email, qe)) && (!qn || fz(a.note || "", qn)); });
      var sup = !!(state.me && state.me.super), roleOf = function (a) { return a.is_super ? "super" : a.is_admin ? "admin" : "member"; };
      var ROLES = [["member", "חבר"], ["admin", "מנהל"], ["super", "מנהל על"]];
      var one = function (a) { return a.is_admin && !sup; };   /* an admin seen by a plain admin can only be renamed: that one action is a button on the card, not a menu of one item */
      var byMail = function (e) { return rows.filter(function (x) { return x.email === e; })[0]; };
      if (!l.__uActs) { l.__uActs = 1; l.addEventListener("click", function (e) {   /* the role chip and the rename button of a card: one listener on the list */
        var b = e.target.closest && e.target.closest("[data-chiprole], [data-uren]"); if (!b || !l.contains(b)) return;
        e.stopPropagation(); var sup1 = !!(state.me && state.me.super);
        if (b.dataset.uren) { var u0 = byMail(b.dataset.uren); if (u0) editUserPopup(u0, sup1, function () { load(); }); return; }
        var u = byMail(b.dataset.chiprole); if (!u) return;
        menu(b, ROLES.map(function (x) { return { label: x[1], check: roleOf(u) === x[0], radio: true, fn: function () {
          if (roleOf(u) === x[0]) return;
          api("/rest/v1/rpc/set_member_role", { method: "POST", json: { target: u.email, new_role: x[0] } }).then(function () { load(); }, function () { toast("אי אפשר לשנות: חייב להישאר לפחות מנהל על אחד"); });
        } }; }), { fit: true });
      }); }
      RosterList.render(l, vis, { kind: "card", key: function (a) { return a.email; }, attrs: function (a) { return 'data-ucard="' + esc(a.email) + '"'; },   /* the kit's list: a card of a person opens its menu (no target of its own) */
        content: function (a) {
          var r = roleOf(a), label = ROLES.filter(function (x) { return x[0] === r; })[0][1];
          var chip = sup ? '<button type="button" class="rchip rchip--button" data-chiprole="' + esc(a.email) + '" aria-haspopup="menu" aria-expanded="false">' + label + '</button>' : r !== "member" ? '<span class="rchip rchip--info">' + label + '</span>' : '';
          return { title: personName(a.email), sub: a.email, chip: chip, act1: one(a) ? '<button type="button" class="rbtn rbtn--text" data-uren="' + esc(a.email) + '">שינוי שם</button>' : '' };
        },
        menu: function (a) { return one(a) ? null : [{ label: "שינוי שם", icon: I.pen, fn: function () { editUserPopup(a, sup, function () { load(); }); } }]; },   /* the deletion is the menu's last item, from the kit's remove */
        remove: { kind: "delete", can: function (a) { return !one(a); }, title: function (a) { return "למחוק את " + personName(a.email) + " מרשימת המשתמשים?"; }, action: "מחיקה",
          run: function (a) { return api("/rest/v1/allowed?email=eq." + encodeURIComponent(a.email), { method: "DELETE" }).then(function () { rows = rows.filter(function (x) { return x.email !== a.email; }); }, function (e) { fail(e); throw e; }); } },
        empty: function () { return rows.length ? { title: "לא נמצא", text: "", icon: I.users } : { title: "עוד אין משתמשים", text: "", icon: I.users }; } });   /* "לא נמצא" only while the fields filter, else the list itself is empty */
    }
    function load() { return api("/rest/v1/allowed?select=email,is_admin,is_super,note&order=added_at").then(function (r) { rows = r || []; learnNames(rows); ready = true; paintA(); }, function (er) { if (!ready) RosterList.render(dlg.querySelector("#alist"), null, { kind: "card", key: function (a) { return a.email; }, content: function (a) { return { title: a.email }; }, empty: { icon: I.users } }).fail(function () { load(); }); fail(er); }); }
    dlg.querySelector("#em").addEventListener("input", paintA); dlg.querySelector("#en").addEventListener("input", paintA);
    dlg.querySelector("#addm").addEventListener("click", function () {
      var em = dlg.querySelector("#em").value.replace(/[^!-~]/g, "").toLowerCase(), nm = dlg.querySelector("#en").value.replace(/\s+/g, " ").trim();   /* an email pasted with an invisible mark (U+200F) never matches the Google sign-in: only printable ASCII is kept */
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { var emIn = dlg.querySelector("#em"); if (window.RosterField && RosterField.error) RosterField.error(emIn, "אימייל לא תקין"); else toast("אימייל לא תקין"); emIn.focus(); return; }   /* the field's own error line, with the warn symbol (the kit's field) */
      RosterBusy(dlg.querySelector("#addm"), api("/rest/v1/allowed", { method: "POST", prefer: "return=minimal", json: { email: em, note: nm } })).then(function () { dlg.querySelector("#em").value = ""; dlg.querySelector("#en").value = ""; return load(); }, fail);
    });
    load();
  }

  /* ---------- live (ui/docs/realtime.md): the kit's sources, on the tab's one connection (/live.js) ----------
     The home list: the vivencias (a title or a sharing state that changes is written in place, with no request) and my owner and share rows (who I am in
     each: then the list is read again, with the roles). The open vivencia: its exercises (the facilitators and the song options are watched tables), its
     start and end music and its opening, each a source that feeds the app's state and the kit's lists by key, with the kit's effects (withFx). Who is where:
     the kit's presence on the vivencia's private channel, drawn only as carets inside the co-edited fields (RosterField.live). The app writes no socket. */
  var live = { vivs: null, mine: null, shares: null, vid: "", items: null, recv: null, open: null, pres: null, offs: [], fx: null, timer: 0, ev: null, handles: [], fresh: false };
  var ITEM_COLS = ITEM_SELECT.replace(/^&select=/, "").replace(/&order=.*$/, "") + ",rev";
  var RECV_COLS = "kind,music_id,created_at,position,music(id,name,title,artist,duration_sec,audio_object,in_catalog)";
  function liveOn() { return !!(window.RosterLive && window.RosterField && RosterField.live && FLOA_AUTH.signedIn() && !state.offline); }
  /* a paint caused by a source: the kit's lists get the event's origin (uo of RosterList), so others' changes come with the kit's effects and mine without the flash */
  function withFx(ev, fn) {
    var was = live.fx;
    live.fx = ev && ev.origin !== "sync" ? { fx: true, origin: ev.origin === "local" ? "local" : "remote", burst: RosterMotion.burst(ev) } : null;
    try { fn(); } finally { live.fx = was; }
  }
  function liveKeep(el, h) { if (h) live.handles.push([el, h]); return h; }   /* a co-edited field's handle, closed once its element left the page */
  function liveSweep() { live.handles = live.handles.filter(function (x) { if (x[0].isConnected) return true; x[1].close(); return false; }); }
  function changes(ev) { return !!(ev.added.length || ev.changed.length || ev.removed.length || ev.moved.length); }
  function srcEv(s, ev) {   /* a real change to apply: not the first load (the app draws that itself), not an event with nothing in it */
    if (ev.rows === null) return false;
    if (!s.__seen) { s.__seen = 1; return false; }
    return !live.fresh && changes(ev);
  }
  function headerFree() { var l = document.getElementById("list"); return !!(l && l.hasAttribute("data-fab-room") && !(liveItem && liveItem.root && liveItem.root.isConnected) && !document.querySelector(".rhead .rfield--inline")); }
  function liveHome() {
    if (live.vivs || !liveOn()) return;
    var uid = FLOA_AUTH.userId(), em = FLOA_AUTH.email().toLowerCase();
    live.vivs = RosterLive.source({ table: "vivencias", select: "id,title,created_at,updated_at,is_public,rev", key: function (r) { return r.id; } });
    live.mine = RosterLive.source({ table: "vivencia_owners", select: "vivencia_id,position", filter: { user_id: uid }, key: function (r) { return r.vivencia_id; }, keyCol: "vivencia_id" });
    live.shares = RosterLive.source({ table: "vivencia_shares", select: "vivencia_id,role,position", filter: { email: em }, key: function (r) { return r.vivencia_id; }, keyCol: "vivencia_id" });
    live.vivs.on(onVivs);
    [live.mine, live.shares].forEach(function (s) { s.on(function (ev) { if (srcEv(s, ev) && ev.origin !== "local") vivsAgain(ev); }); });
  }
  function onVivs(ev) {
    if (!srcEv(live.vivs, ev)) return;
    if (ev.added.length || ev.removed.length) { vivsAgain(ev); return; }   /* a vivencia came or went: who I am in it comes with the list */
    var by = {}, pubChanged = false;
    state.vivs.concat(state.pubs || []).forEach(function (v) { by[v.id] = v; });
    ev.changed.forEach(function (r) {
      var v = by[r.id], open = state.viv && state.viv.id === r.id;
      if (open && state.viv.is_public !== r.is_public) pubChanged = true;
      [v, open ? state.viv : null].forEach(function (x) { if (x) ["title", "is_public", "updated_at", "rev"].forEach(function (c) { if (c in r) x[c] = r[c]; }); });
    });
    withFx(ev, renderVivs); localSoon();
    if (pubChanged && headerFree()) editor();   /* the lock or the globe of the open vivencia's header */
  }
  function vivsAgain(ev) {   /* several signs together are one reading of the list (300ms) */
    live.ev = live.ev && live.ev.origin === "remote" ? live.ev : ev; clearTimeout(live.timer);
    live.timer = setTimeout(function () {
      var e = live.ev; live.ev = null;
      loadVivs().then(function () {
        if (state.viv) {
          var cur = state.vivs.concat(state.pubs || []).filter(function (x) { return x.id === state.viv.id; })[0];
          if (!cur) {   /* the open vivencia went away (deleted, or no longer shared with me): home, with the kit's notice */
            liveVivClose();
            var home0 = function () { if (wide()) homeWide(); else { stack().length = 0; home(); } };
            if (window.RosterApp && RosterApp.gone) RosterApp.gone("הוויוונסיה", home0); else { home0(); toast("הוויוונסיה כבר לא זמינה"); }
            return;
          }
          var roleChanged = cur.role !== state.viv.role;
          state.viv.role = cur.role; state.viv.title = cur.title; state.viv.is_public = cur.is_public;
          var mv = state.viv.id; api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: mv } }).then(function (mm) { if (!state.viv || state.viv.id !== mv) return; state.members = mm || []; state.membersFor = mv; }, function () { /* kept as it was */ });
          if (roleChanged && headerFree()) editor();
        }
        withFx(e, renderVivs); localSoon();
      }, function () { /* the next change will try again */ });
    }, 300);
  }
  /* the open vivencia's sources; false when there are none (no internet, signed out): the app then reads once, as before */
  function liveViv(id) {
    if (!liveOn()) return false;
    if (live.vid === id && live.items) return true;
    liveVivClose();
    live.vid = id; live.fresh = true;
    /* room: id: these sources live in the open vivencia's relay room (ui/docs/realtime.md "שינויים בנתונים דרך הממסר"); the home lists above have no room (the home room) */
    live.items = RosterLive.source({ table: "vivencia_items", select: ITEM_COLS, filter: { vivencia_id: id }, order: "position.asc", key: function (r) { return r.id; }, room: id,
      watch: [{ table: "vivencia_item_facilitators", key: function (r) { return r.item_id; }, keyCol: "item_id" }, { table: "item_music_options", key: function (r) { return r.item_id; }, keyCol: "item_id" }] });
    live.recv = RosterLive.source({ table: "vivencia_reception_music", select: RECV_COLS, filter: { vivencia_id: id }, order: "position.asc.nullslast,created_at.asc", key: function (r) { return r.kind + "|" + r.music_id; }, room: id });
    live.offs = [live.items.on(onItems), live.recv.on(onRecv)];
    openSource(id);
    live.pres = RosterLive.presence("biodanza:vivencia:" + id);
    return true;
  }
  function openSource(id) {
    live.open = RosterLive.source({ table: "vivencia_opening", select: (openEmailCol === false ? "who" : "who,who_email") + ",body,position,rev", filter: { vivencia_id: id }, order: "position.asc", key: function (r) { return r.who; }, keyCol: "who", room: id });
    live.offs.push(live.open.on(onOpen));
  }
  function liveVivClose() {
    clearTimeout(live.timer);
    live.offs.forEach(function (f) { f(); }); live.offs = [];
    live.handles.forEach(function (x) { x[1].close(); }); live.handles = [];
    ["items", "recv", "open"].forEach(function (k) { if (live[k]) { live[k].close(); live[k] = null; } });
    if (live.pres) { live.pres.close(); live.pres = null; }
    live.vid = ""; live.fresh = false;
  }
  function srcReady(s, fresh) {   /* the rows: the first load of a source just opened, otherwise a quiet load again */
    if (!fresh) return s.refetch().then(function () { return s.rows(); });
    return new Promise(function (res) {
      if (s.rows() !== null || s.status === "failed") return res(s.rows());
      var off = s.on(function () { if (s.rows() === null && s.status !== "failed") return; off(); res(s.rows()); });
    });
  }
  function takeItems() { var r = live.items.rows() || []; state.items = r.filter(function (i) { return !i.backlog; }).concat(r.filter(function (i) { return i.backlog; })); }   /* the numbered exercises, then the backlog */
  function takeRecv() {
    var st = [], en = [];
    (live.recv.rows() || []).forEach(function (x) { if (x.music) (x.kind === "end" ? en : st).push({ music_id: x.music_id, created_at: x.created_at, position: x.position, music: x.music }); });
    recvCache[live.vid + "|start"] = st; recvCache[live.vid + "|end"] = en;
  }
  function takeOpen() { var rows = live.open && live.open.rows(); if (rows) openCache[live.vid] = rows.map(function (r) { return { who: r.who, who_email: r.who_email, body: r.body, position: r.position }; }); }
  function liveMine() { return !!(state.viv && state.viv.id === live.vid); }
  function onItems(ev) {
    if (!srcEv(live.items, ev) || !liveMine()) return;
    takeItems();
    if (document.getElementById("list")) withFx(ev, paint);
    localSoon(); refreshOffline(state.viv); liveSweep();
    if (liveItem && liveItem.root && liveItem.root.isConnected) {
      var f = state.items.filter(function (x) { return x.id === liveItem.id; })[0];
      if (f) liveItem.apply(f);
      else {   /* the open exercise went away (somebody removed it): back to its vivencia, with the kit's notice (ui/docs/app-status.md) */
        liveItem = null;
        var away = function () { if (wide()) { show(phPick(), null, "d"); state.lastItem = null; setUrl(BASE + state.viv.id); paint(); } else back(); };
        if (window.RosterApp && RosterApp.gone) RosterApp.gone("התרגיל", away); else { away(); toast("התרגיל כבר לא זמין"); }
      }
    }
  }
  function onRecv(ev) {
    if (!srcEv(live.recv, ev) || !liveMine()) return;
    takeRecv();
    if (document.getElementById("list")) withFx(ev, paint);
    registerLists(); refreshOffline(state.viv);
  }
  function onOpen(ev) {
    if (ev.status === "failed" && openEmailCol !== false && live.open && live.open.rows() === null && live.vid) {   /* a server without who_email (before names.sql): the opening is asked again without it */
      var id = live.vid, old = live.open; openEmailCol = false; live.open = null; old.close(); openSource(id); return;
    }
    if (!live.open || !srcEv(live.open, ev) || !liveMine()) return;
    takeOpen();
    /* my own write's echo (origin "local": a co-edited box of the opening saved what I typed) is already on the screen (the box, and its sub by onLocal):
       no repaint, so no box is drawn or wired again while it is being edited, and nothing is written again */
    if (ev.origin !== "local" && document.getElementById("list")) withFx(ev, paint);
    refreshOffline(state.viv); liveSweep();
  }

  /* ---------- start ---------- */
  /* No internet: the vivencias saved on this device, to see and play. Nothing is asked of the network, nothing is changed. */
  function startOffline() {
    if (state.offline) return;
    state.offline = true; document.documentElement.classList.add("bio-offline");
    /* back online: the app as usual, once the server really answers. The kit decides that (RosterApp.net: its short check of the server, never the
       browser's own word); the app came up from the copy on the device, so it loads once to come up from the server (ui/docs/app-offline.md) */
    if (window.RosterApp && RosterApp.net) { RosterApp.net.on(function (s) { if (s === "on") location.reload(); }); RosterApp.net.check(); }
    Promise.all([window.BioOffline ? BioOffline.list() : [], window.BioAudio && BioAudio.offline ? BioAudio.offline() : null]).then(function (r) {
      offlineRecs = {}; (r[0] || []).forEach(function (x) { offlineRecs[x.id] = x; });
      state.me = { allowed: true, admin: false };
      home();
    });
  }
  function start() {
    if (!FLOA_AUTH.signedIn()) return gate("כניסה למאפשרי ביודנסה", false);
    if (navigator.onLine === false) return startOffline();
    show(homeHead().replace(/<button /g, "<button disabled ") + '<div class="rlist rload" aria-busy="true" data-fab-room></div>');   /* the home's header at once, its actions off until who this is has arrived; only the list loads (the kit's .rload) */
    /* kept copies on the device: the list shows at once, before the cloud has answered who this is (the cloud still decides: no permission, and the screen is replaced) */
    var localHome = false;
    if (window.BioOffline) BioOffline.ready.then(function () { return BioOffline.list(); }).then(function (recs) {
      if (state.me || !recs || !recs.length) return;
      var ad = false, su = false; try { ad = localStorage.getItem("biodanza.admin") === "1"; su = localStorage.getItem("biodanza.super") === "1"; } catch (x) { /* none */ }
      state.me = { allowed: true, admin: ad, super: su }; state.lines = state.lines || []; state.phases = state.phases || [];
      localHome = true; home();
    });
    api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function (me) {
      state.me = me; meArrived(me); try { localStorage.setItem("biodanza.admin", me && me.admin ? "1" : "0"); localStorage.setItem("biodanza.super", me && me.super ? "1" : "0"); } catch (x) { /* none */ }
      if (!me || !me.allowed) return gate("לחשבון " + FLOA_AUTH.email() + " אין הרשאה להיכנס. אפשר לבקש מהמנהל להוסיף אותו.", true);
      var inv = new URLSearchParams(location.search).get("invite");   /* a one-time link: it is used now and is gone; the address keeps only the vivencia */
      if (!inv) try { inv = sessionStorage.getItem("biodanza.invite"); } catch (x) { /* none */ }   /* it came before the sign-in, which returns without it */
      try { sessionStorage.removeItem("biodanza.invite"); } catch (x) { /* none */ }
      var redeemed = Promise.resolve();
      if (inv) {
        history.replaceState(history.state, "", location.pathname);
        redeemed = api("/rest/v1/rpc/redeem_invite", { method: "POST", json: { t: inv } }).then(function () { toast("נוספת לוויוונסיה כצופה"); },
          function (e) { toast(/invalid/.test(String(e && (e.message || e.body || e))) ? "הקישור כבר נוצל או שאינו קיים" : "לא הצלחנו להשתמש בקישור"); });
      }
      return Promise.all([api("/rest/v1/lines?select=key,name_he&order=sort"), api("/rest/v1/phases?select=key,name_he&order=sort"), api("/rest/v1/levels?select=key,name_he&order=rank").catch(function () { return []; })]).then(function (r) { state.lines = r[0]; state.phases = r[1]; state.levels = r[2]; redeemed.then(function () { if (!localHome) home(); else loadVivs().then(renderVivs, function () { /* next load */ }); }); liveHome(); setTimeout(restoreCatMobile, 700); api("/rest/v1/song_likes?select=music_id").then(function (ls) { likes = {}; (ls || []).forEach(function (x) { likes[x.music_id] = true; }); var seenL = {}; [].forEach.call(document.querySelectorAll("[data-like]"), function (b) { var lid = b.dataset.like; if (lid && !seenL[lid]) { seenL[lid] = 1; paintHearts(lid); } }); }, function () { /* no hearts this time */ });   /* a heart drawn before the likes arrived (the player's, of the song remembered from the last visit) shows its state now: one source, the likes cache */
        api("/rest/v1/vivencia_likes?select=vivencia_id").then(function (ls) { likesViv = {}; (ls || []).forEach(function (x) { likesViv[x.vivencia_id] = true; }); if (state.vivsLoaded) renderVivs(); [].forEach.call(document.querySelectorAll("[data-likev]"), function (b) { paintHeartsViv(b.dataset.likev); }); }   /* a heart already drawn (the open vivencia's header, opened before the likes arrived) shows its state too */, function () { /* no hearts this time */ });
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
      layers.forEach(function (l) { if (l.el !== idlg) { l.own = false; if (l.el.id === "rsMenu") RosterMenu.close(); else if (l.el.open) l.el.close(); } });
      if (idlg && idlg.open) { idlg.__quiet = true; slideClose(idlg); }
      liveItem = null; stack().length = 0; stack().push(home, editor);
      var sig0 = JSON.stringify(state.items || null);
      loadItems().then(function () { if (JSON.stringify(state.items || null) === sig0) return; paint(); }, fail);   /* what was changed inside is in the list; when nothing was, the list is not drawn again, so a tap that began meanwhile still lands on its card */
      return;
    }
    layers.forEach(function (l) { l.own = false; if (l.el.__screen) l.el.__quiet = true; if (l.el.id !== "rsMenu" && l.el.open) l.el.close(); else if (l.el.id === "rsMenu") RosterMenu.close(); });
    var u = parseUrl(); popping = true;
    if (wide() && !u.item && liveItem) { liveItem = null; state.lastItem = null; if (typeof markItem === "function") markItem(); }   /* Back closed the exercise beside the list: it is no longer the open one, so the next tap on its card opens it (not a second-press close) */
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
