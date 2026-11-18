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
  function syncLayers() {   /* a popup or menu opened or closed, by the user or by code: its marker entry follows */
    var live = [].slice.call(document.querySelectorAll("dialog[open], #moreMenu"));
    var gone = layers.filter(function (l) { return live.indexOf(l.el) < 0; });
    var fresh = live.filter(function (el) { return !layers.some(function (l) { return l.el === el; }); });
    if (!gone.length && !fresh.length) return;
    var lost = gone.filter(function (l) { return l.own; }).length;
    layers = layers.filter(function (l) { return live.indexOf(l.el) >= 0; });
    var pairs = Math.min(lost, fresh.length);   /* one closes as another opens (a menu choice): the entry is handed over */
    fresh.forEach(function (el) { layers.push({ el: el, own: !jump }); });
    if (!jump) for (var i = 0; i < fresh.length - pairs; i++) history.pushState({ d: curD(), bk: 1 }, "", location.href);
    if (lost - pairs > 0) startJump(lost - pairs, false);
  }
  function closeLayer(el) { if (el.id === "moreMenu") el.remove(); else slideClose(el); }
  function parseUrl() { var seg = location.pathname.slice(BASE.length).split("/").filter(Boolean); return { viv: seg[0] || "", item: seg[1] || "" }; }
  function wide() { return window.matchMedia("(min-width: 1024px)").matches; }
  var api = function (p, o) { return FLOA_AUTH.api(p, o); };
  var likes = {};   /* the songs I loved (their ids), mine alone */
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

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function name(e) { return e.title_he || e.title_en || ""; }
  function phaseName(k) { var p = state.phases.filter(function (x) { return x.key === k; })[0]; return p ? p.name_he : ""; }
  function catName(k) { var c = (state.cats || []).filter(function (x) { return x.key === k; })[0]; return c ? c.name_he : ""; }
  function lineName(k) { var l = state.lines.filter(function (x) { return x.key === k; })[0]; return l ? l.name_he : k; }
  /* a song is two things: its name and who plays it */
  function songName(m) { return m ? (m.title || m.name || "") : ""; }
  function songBy(m) { return m ? (m.artist || "") : ""; }
  function canEdit() { return !state.viv || state.viv.role !== "view"; }   /* a share for viewing changes nothing; the database enforces it too */
  /* the same button wherever a song is shown: it searches the song and its artist on YouTube, in a new tab */
  /* the YouTube button of the song played last is red, the others are muted (kept in this browser, so it is still marked tomorrow) */
  var played = (function () { try { return localStorage.getItem("biodanza.played") || ""; } catch (e) { return ""; } })();
  function ytColor(id) { return id && id === played ? "var(--danger)" : "var(--text-3)"; }
  function ytLink(m, trail) {
    return '<a class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-yt="' + esc(m.id || "") + '" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((songName(m) + " " + songBy(m)).trim()) + '" target="_blank" rel="noopener" aria-label="ניגון ביוטיוב" title="ניגון ביוטיוב" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:' + ytColor(m.id) + '">' + I.yt + '</a>';
  }
  /* a song with a file in the bucket gets the sound button (assets/audio.js); one without keeps the YouTube button */
  function songBtn(m, trail) { return m.audio_object && window.BioAudio ? BioAudio.button(m.audio_object, trail) : ytLink(m, trail); }
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
  function songBar(m, extra) {
    if (!m || !m.audio_object) return "";
    return '<div class="bio-bar" data-for="' + esc(m.audio_object) + '"  style="' + (extra || "flex:0 0 100%;order:3;padding-top:var(--sp-1)") + ';position:relative;z-index:var(--z-raised)"><input type="range" min="0" max="1000" value="0" step="1" disabled aria-label="מקום בשיר" style="display:block;width:100%;margin:0;direction:ltr;accent-color:var(--primary)"></div>';
  }
  /* a song's length: the catalog's, else what its own file told the player the first time (kept in this browser) */
  var durKnown = {};
  try { durKnown = JSON.parse(localStorage.getItem("biodanza.dur") || "{}") || {}; } catch (x) { durKnown = {}; }
  function durOf(m) { return (m && (m.duration_sec || durKnown[m.audio_object])) || 0; }
  /* while a song plays, a button at the bottom right (the add button is at the left) stops it, from any screen and from inside any popup (a popup is above the page, so it gets a button of its own); it slides away when the song stops */
  (function () {
    var vis = "opacity: 0; transform: translateY(calc(var(--fab) + var(--sp-3))); pointer-events: none", face = "display: grid; place-items: center; width: var(--fab); height: var(--fab); padding: 0; border: 1px solid var(--danger); border-radius: var(--r-fab); background: var(--danger); color: var(--on-primary); box-shadow: var(--sh-pop); cursor: pointer; transition: transform var(--t-base) var(--ease), opacity var(--t-base) var(--ease)";
    var st = document.createElement("style");
    st.textContent = ".bio-stop, .bio-stop-in { " + face + "; " + vis + " } " +
      ".bio-stop { position: fixed; right: max(var(--gutter), var(--inset-r)); bottom: calc(var(--gutter) + var(--inset-b)); z-index: var(--z-sticky) } " +
      ".bio-stop-in { position: fixed; inset: auto max(var(--gutter), var(--inset-r)) calc(var(--gutter) + var(--inset-b)) auto; margin: 0; overflow: visible } " +   /* a popover inside the open popup: it is shown in the top layer, above the popup, and is not clipped by it */
      ".bio-stop.on, .bio-stop-in.on { opacity: 1; transform: none; pointer-events: auto } " +
      ".bio-stop > svg, .bio-stop-in > svg { width: var(--icon-l); height: var(--icon-l) } " +
      "html.rs-lock .bio-stop, html.dlg-lock .bio-stop, html.kb-open .bio-stop { " + vis + " } " +
      "@media (prefers-reduced-motion: reduce) { .bio-stop, .bio-stop-in { transition: none } }";
    document.head.appendChild(st);
    var ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>', playing = false;
    function make(cls) {
      var b = document.createElement("button");
      b.type = "button"; b.className = cls; b.setAttribute("aria-label", "עצירת השיר"); b.title = "עצירת השיר"; b.innerHTML = ICON;
      b.addEventListener("click", function () { if (window.BioAudio && BioAudio.pause) BioAudio.pause(); });
      return b;
    }
    document.body.appendChild(make("bio-stop"));
    function sync() { document.querySelectorAll(".bio-stop, .bio-stop-in").forEach(function (b) { b.classList.toggle("on", playing); }); }
    /* the up and down arrow keys are the volume, always (outside a field, a menu or a popup, where they keep their own job); Shift for steps of five */
    document.addEventListener("keydown", function (e) {
      if ((e.key !== "ArrowUp" && e.key !== "ArrowDown") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
      if (document.querySelector("dialog[open], #moreMenu") || !window.BioAudio || !BioAudio.volume || !window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault();
      volState.v = BioAudio.volume((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 0.05 : 0.01)); paintVol();   /* the sound and the gauge in the header are the answer: no message */
    });
    /* while a song plays, on a wide screen, the right and left arrows move it forward and back (5 seconds, Shift 15), whatever page of the app is open */
    document.addEventListener("keydown", function (e) {
      if (!playing || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || e.ctrlKey || e.metaKey || e.altKey) return;
      var tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || (tg.closest && tg.closest(".bio-vol")))) return;
      if (document.querySelector("dialog[open], #moreMenu") || !window.BioAudio || !BioAudio.skip || !window.matchMedia("(min-width: 1024px)").matches) return;
      e.preventDefault(); BioAudio.skip((e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 15 : 5));
    });
    document.addEventListener("bioaudio", function (ev) {
      playing = !!(ev.detail && ev.detail.playing); document.documentElement.classList.toggle("bio-playing", playing);   /* the stop button takes the bottom right: the buttons of the exercise leave it room */
      if (window.BioAudio && BioAudio.volume) volState.v = BioAudio.volume(0); paintVol();
      if (playing) document.querySelectorAll("dialog[open]").forEach(function (d) {
        if (!d.querySelector(".bio-stop-in")) {
          var b = make("bio-stop-in"); b.setAttribute("popover", "manual"); d.appendChild(b);
          try { b.showPopover(); } catch (x) { /* an old browser: no button in this popup */ }
          requestAnimationFrame(function () { requestAnimationFrame(sync); });
        }
      });
      sync();
    });
  })();
  var barDrag = false;
  document.addEventListener("bioaudio", function (ev) {
    var d = ev.detail || {};
    document.querySelectorAll(".bio-bar").forEach(function (b) {
      var mine = d.name && b.dataset.for === d.name && d.d > 0, r = b.querySelector("input");
      r.disabled = !mine;   /* the bar of every song with a file is always there; it moves only for the song that has the player */
      if (!mine) { r.value = 0; return; }
      if (!barDrag) r.value = Math.round(d.t / d.d * 1000);
    });
  });
  document.addEventListener("pointerdown", function (e) { if (e.target.closest && e.target.closest(".bio-bar")) barDrag = true; }, true);
  ["pointerup", "pointercancel", "change"].forEach(function (n) { document.addEventListener(n, function () { barDrag = false; }, true); });
  document.addEventListener("input", function (e) { var b = e.target.closest && e.target.closest(".bio-bar"); if (b && window.BioAudio && BioAudio.seek) BioAudio.seek(e.target.value / 1000); });
  function playCol(m, trail) {
    var tile = songBtn(m, trail).replace(/width:var\(--fab\);height:var\(--fab\);min-height:var\(--fab\);/, "width:var(--ctl);height:var(--ctl);min-height:var(--ctl);border-radius:var(--r-ctl);background:var(--surface-2);");
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
  /* a song as a row to choose from: the same element, a row of its own */
  function songRow(m, cur, attr) {
    return '<div class="rrow rrow--link" style="padding-inline:var(--gutter);padding-block:var(--sp-2);flex-wrap:wrap"' + (cur ? ' aria-current="true"' : '') + '>' + heartBtn(m) + '<button type="button" class="rrow__main" ' + attr + '="' + m.id + '" style="flex:1 1 0;min-width:0;background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit">' + songLines(m) + '</button>' + playCol(m, true) + songBar(m) + '</div>';   /* the text takes what is left, so a long name never pushes the play tile to a line of its own */
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
    var pick = function (l) { var t = ts.filter(function (x) { return x.lang === l && x[k]; })[0]; return t ? t[k] : ""; };
    return pick(LANG) || pick("en") || e[k] || "";
  }
  function txt(it, k) { return it[k] != null ? it[k] : baseTxt(it, k); }
  /* a text nobody has checked yet: the catalog has none for this exercise, so the one shown was drafted from its name. It stays marked until the facilitator writes their own. */
  function isDraft(it, k) {
    if (it[k] != null) return false;
    var ts = (it.exercises || {}).exercise_texts || [], t = ts.filter(function (x) { return x.lang === LANG && x[k]; })[0];
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
  function head(title, sub, back, trail, lead) {
    return '<header class="rhead">' + (lead || '') + (back ? '<button class="rbtn rbtn--icon rbtn--edge-start" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title">' + esc(title) + '</h1>' + (sub ? '<span class="rhead__sub">' + esc(sub) + '</span>' : '') + '</div>' +
      volTile() + (trail || '') + '</header>';   /* the volume, while a song plays: a bar across the free room of the header */
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
  function itemHead(hasPrev, hasNext, where) {
    var b = function (act, ico, label, off, after) {
      var shown = esc(label);
      var m = act === "list" && where && String(where).match(/^(\d+)\/(\d+)$/);
      if (m) shown = '<span style="display:inline-flex;align-items:baseline;gap:2px;direction:ltr"><b class="bio-num" style="display:inline-block;font:var(--fw-black) var(--fs-xl)/1 var(--font);--nx:' + ((state.slideFrom || 0) * 24) + 'px' + (state.slideFrom ? ';animation:bioNum .26s cubic-bezier(.2,.8,.2,1) both' : '') + '">' + m[1] + '</b><span style="color:var(--text-2);font:var(--fw-regular) var(--fs-s)/1 var(--font)">/' + m[2] + '</span></span>';   /* the number of this exercise is big, and rolls in from the side the page came from */
      return '<button class="rbtn' + (act === "nextW" ? "" : " rbtn--ghost") + '" data-act="' + act + '" title="' + esc(label) + '"' + (act === "list" ? ' style="flex:1 1 auto"' : "") + (off ? " disabled" : "") + '>' + (after ? '<span>' + shown + '</span>' + ico : ico + '<span>' + shown + '</span>') + '</button>';
    };
    return '<header class="rhead">' + b("prevW", I.back, "הקודם", !hasPrev) + b("list", I.list, where || "לרשימה", false) + b("nextW", I.fwd, "הבא", !hasNext, true) + '</header>';
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = "@keyframes bioNum { from { opacity: 0; transform: translateX(var(--nx, 0)) } to { opacity: 1; transform: none } } @media (prefers-reduced-motion: reduce) { .bio-num { animation: none !important } } .bio-bar, .bio-bar * { touch-action: none } .bio-vol { display: none; position: relative; flex: none; place-items: center; width: var(--ctl); height: var(--ctl); border-radius: var(--r-ctl); background: var(--surface-2); overflow: hidden; touch-action: none; cursor: ns-resize; user-select: none; margin-inline-end: var(--sp-1) } .bio-vol.on { display: grid } @media (max-width: 1023px) { .bio-vol { display: none } } .bio-vol > i { position: absolute; inset: auto 0 0 0; height: calc(var(--v) * 100%); background: color-mix(in srgb, var(--primary) 32%, transparent); transition: height var(--t-fast) var(--ease) } .bio-vol > b { position: relative; font: var(--fw-bold) var(--fs-s)/1 var(--font); font-variant-numeric: tabular-nums; color: var(--text) } #pd .bio-vol { display: none !important } /* the volume button is in the list's header, once */ .bio-vol:focus { outline: none } .bio-vol:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }";
    document.head.appendChild(st);
  })();
  /* the exercise as a pager: drag the page sideways to go to the next or the previous one (to the right = the next, as in a right to left book); the page follows the finger, a short drag springs back */
  function attachPager(pg, to) {
    var x0 = 0, y0 = 0, t0 = 0, dx = 0, mode = 0;
    pg.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".bio-bar")) return;   /* a drag on the song's bar moves the song, never the page */
      if (e.pointerType !== "touch" && (e.button > 0 || (e.target.closest && e.target.closest("input, textarea, select, a, button")))) return;   /* a finger anywhere; a mouse (a narrow window) only off the fields and buttons */
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
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "rmsg rmsg--toast"; t.setAttribute("role", "status"); t.innerHTML = '<span class="rmsg__text">' + esc(msg) + '</span>';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }
  function fail(e) { console.error(e); toast("משהו השתבש, נסו שוב"); }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  function show(html, wire, pane) { var t = wide() && pane === "d" ? pd : pl; t.innerHTML = html; if (wire) wire(t); }
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
  function back() { if (!wide() && curD() > 0) { unwind(1); return; }   /* narrow: one level up IS the browser's Back, so the arrow and the button never differ */
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
  function home() {
    curLeave();
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    show(head("הוויוונסיות שלי", "", false,
      (state.me.admin ? '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="allow" aria-label="מורשים" title="מורשים">' + I.users + '</button>' : '') +
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="out" aria-label="יציאה" title="יציאה">' + I.out + '</button>',
      '<img src="favicon.png" alt="" style="flex:none;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl)">') +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '<button class="rfab" data-act="new" aria-label="ויוונסיה חדשה" title="ויוונסיה חדשה">' + I.plus + '</button>', function (r) {
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
      on(r, "allow", allowPopup);
      on(r, "new", newViv);
    });
    loadVivs().then(renderVivs, fail);
  }
  /* my vivencias, with my role and my order in each */
  function loadVivs() {
    var uid = FLOA_AUTH.userId();
    return Promise.all([api("/rest/v1/vivencias?select=id,title,updated_at,vivencia_items(count)"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
      api("/rest/v1/vivencia_shares?email=eq." + encodeURIComponent(FLOA_AUTH.email().toLowerCase()) + "&select=vivencia_id,role,position")]).then(function (r) {
      var pos = {}, role = {};
      (r[2] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = o.role; });   /* shared with me */
      (r[1] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = "owner"; });   /* mine: an owner is above any share */
      state.vivs = (r[0] || []).map(function (v) { v.pos = pos[v.id]; v.role = role[v.id] || "view"; return v; });
      /* my own order; a vivencia I have not placed yet (a new one) comes first, newest first */
      state.vivs.sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb || (a.updated_at < b.updated_at ? 1 : -1); });
    });
  }
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    l.innerHTML = state.vivs.length ? state.vivs.map(function (v) {
      var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
      return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-id="' + v.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub" data-n="' + v.id + '">' + n + ' תרגילים' + (v.role === "owner" ? "" : " · משותף" + (v.role === "view" ? " (צפייה)" : " (עריכה)")) + '</span></button></div>';
    }).join("") : ph("עוד אין ויוונסיות", "לחצו על + כדי ליצור את הראשונה");
    l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); });
    if (state.vivs.length) enableDrag(l, "[data-id]", persistVivs);
    paintSel();
    if (pending && pending.viv) {   /* opened on a vivencia's own address */
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
    function away(e) { if (!m.contains(e.target)) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
    m.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { var f = items[+b.dataset.k].fn; close(); f(); }); });
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
      var q = dlg.querySelector("#sq").value.trim().toLowerCase(), l = dlg.querySelector("#slist");
      var have = {}; shares.forEach(function (x) { have[x.email] = 1; });
      var mine = shares.filter(function (x) { return !q || (x.email + " " + who(x.email)).toLowerCase().indexOf(q) >= 0; });
      var rest = cands.filter(function (c) { return !have[c.email] && (!q || (c.email + " " + (c.note || "")).toLowerCase().indexOf(q) >= 0); });
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
        if (isNew) { state.vivs.unshift({ id: v.id, title: t, role: "owner", updated_at: new Date().toISOString() });   /* the one who made it owns it: the menu has share and delete at once, not only after a reload */ if (wide()) home(); openViv(v.id); }
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
  function loadItems() {
    return api("/rest/v1/vivencia_items?vivencia_id=eq." + state.viv.id + "&select=id,position,exercise_id,music_id,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,source)),music(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email)&order=position").then(function (r) { state.items = r || []; });
  }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id); curJoin(v.id);
    show(head(v.title || "ויוונסיה חדשה", "", true, '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="more" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>') +
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      (v.role === "view" ? '' : '<button class="rfab" data-act="add" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>'), function (r) {
      on(r, "back", back); on(r, "add", function () { resetPk(); if (wide()) go(picker); else pickerSheet(); });
      on(r, "more", function (b) {
        /* the owner: rename, share, delete; somebody it is shared with: rename (with edit rights) and taking themselves off it */
        var items = v.role === "view" ? [] : [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false); } }];
        if (v.role === "owner") items.push({ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } }, { label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmDelete(v); } });
        else items.push({ label: "הסרה שלי מהוויוונסיה", icon: I.out, tone: "danger", fn: function () { confirmLeave(v); } });
        menu(b, items);
      });
    });
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) { state.members = mm || []; if (document.getElementById("list")) paint(); }, function () { state.members = []; });
    loadItems().then(function () {
      paint();
      if (pending && pending.item) {   /* opened on an exercise's own address */
        var want = pending.item; pending = null;
        var it = state.items.filter(function (x) { return x.id === want; })[0];
        if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
      }
    }, fail);
  }
  /* a confirmation is the kit's popup with ONE action: closing it is the cancel */
  /* somebody a vivencia was shared with takes themselves off it; it stays with its owner and the others */
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
        dlg.close(); toast("הוסרת מהוויוונסיה"); state.viv = null;
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
        dlg.close(); toast("הוויוונסיה נמחקה"); state.viv = null;
        if (wide()) { stack().length = 0; homeWide(); } else back();
      }, fail);
    });
  }
  function paint() {
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-n="' + state.viv.id + '"]'); if (cnt) cnt.textContent = state.items.length + " תרגילים";
    var vis = state.items;   /* the order of the list IS the curve: no phase is kept on an item */
    if (!vis.length) { l.innerHTML = ph("הוויוונסיה ריקה", "לחצו על + כדי להוסיף תרגיל מהקטלוג"); return; }
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
  function itemScreen(it) {
    var e = it.exercises || {};
    setUrl(BASE + state.viv.id + "/" + it.id);
    state.lastItem = it.id;   /* the strip of the exercise last opened stays marked in the list, like the vivencia in its list */
    markItem();
    var k = state.items.indexOf(it), prevIt = state.items[k - 1], nextIt = state.items[k + 1];
    /* the header walks the sequence: the right button to the previous exercise, the left one to the next, the name between them */
    var hd = itemHead(!!prevIt, !!nextIt, (k + 1) + "/" + state.items.length);   /* the middle button says where we are, and still opens the list */
    show(hd + '<style>#ipg, #ipg * { touch-action: pan-y } #ipg textarea { max-height: none } #ifields > .rfield { margin: 0 } #ipg .rfield:has(> textarea)::before { content: ""; position: absolute; z-index: 1; top: 0; inset-inline: 0; height: 19px; background: var(--bg); pointer-events: none }</style><div id="ipg" style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0"><div class="pad" style="padding-bottom:0">' +
      '<div style="display:flex;align-items:flex-end;gap:var(--gap-button)">' + '<label class="rfield" style="flex:1 1 auto;margin:0"><span>שם התרגיל</span><input id="ina" style="font-weight: var(--fw-black); font-size: var(--fs-m)" placeholder=" " autocomplete="off" value="' + esc(itemName(it)) + '"></label>' + facChip(it) + '</div>' +
      '</div>' +
      '<div class="rrow rrow--link" data-act="pickMusic" role="button" tabindex="0" style="flex:none;padding-inline:var(--sp-2);padding-block:var(--sp-2);border-bottom:0;cursor:pointer"><div style="flex:1 1 auto;min-width:0">' +
        (it.music ? songLines(it.music) : '<span class="rrow__title">לחצו לבחירת מוזיקה</span>') + '</div>' + (it.music ? playCol(it.music, true) : '') + '</div>' +   /* a strip across the width, like the music chooser's rows */
      songBar(it.music, "flex:none;padding:var(--sp-1) var(--sp-2) 0") +
      '<div id="ifields" style="flex:1 1 auto;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:var(--gap-field);padding:var(--gutter) var(--gutter) 0"><label class="rfield" style="flex:none"><span>פואטיקה</span><textarea id="ipo" rows="1" placeholder=" "' + (isDraft(it, "poetics") ? DRAFT_FIELD : "") + '>' + esc(txt(it, "poetics")) + '</textarea></label>' +
      '<label class="rfield" style="flex:none"><span>הנחיה</span><textarea id="igu" rows="1" placeholder=" "' + (isDraft(it, "guidance") ? DRAFT_FIELD : "") + '>' + esc(txt(it, "guidance")) + '</textarea></label>' +
      '<label class="rfield" style="flex:none"><span>הערות</span><textarea id="it" rows="1" placeholder=" ">' + esc(it.notes || "") + '</textarea></label></div>' +
      '<div id="ibtns" style="flex:none;display:flex;gap:var(--gap-button);padding:var(--gutter) max(var(--gutter), var(--inset-r)) calc(var(--gutter) + var(--inset-b)) max(var(--gutter), var(--inset-l))"><button class="rbtn rbtn--ghost rbtn--block" style="flex:1 1 0;min-width:0;padding-inline:var(--sp-1);font-size:var(--fs-s)" data-act="swap">' + (wide() ? I.back : I.up) + 'החלפת תרגיל</button><button class="rbtn rbtn--ghost rbtn--danger rbtn--block" style="flex:1 1 0;min-width:0;padding-inline:var(--sp-1);font-size:var(--fs-s)" data-act="del">הסרה מהוויוונסיה</button></div></div>', function (r) {
      var sf = state.slideFrom || 0, pg = r.querySelector("#ipg"); state.slideFrom = 0;
      r.style.overflowX = "clip";   /* a page sliding in from the side must not make the window scroll sideways */
      if (pg && sf && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
        pg.style.transform = "translateX(" + (sf * 100) + "%)";
        requestAnimationFrame(function () { requestAnimationFrame(function () { pg.style.transition = "transform .26s cubic-bezier(.2, .8, .2, 1)"; pg.style.transform = ""; }); });
      }
      on(r, "list", function () { if (!wide()) back(); });   /* beside the list there is nowhere to go back to */
      wireFac(r);
      function walk(to) { repNext = true; state.slideFrom = to === nextIt ? -1 : 1; if (wide()) return itemScreen(to); stack().pop(); go(function () { itemScreen(to); }); }
      on(r, "prevW", function () { if (prevIt) walk(prevIt); });
      on(r, "nextW", function () { if (nextIt) walk(nextIt); });
      if (pg) attachPager(pg, { next: nextIt ? function () { walk(nextIt); } : null, prev: prevIt ? function () { walk(prevIt); } : null });
      function toMusic() { if (wide()) musicScreen(it); else musicSheet(it); }   /* beside the list, the pane; on a narrow screen, a popup from the bottom */
      on(r, "pickMusic", function (b, ev) { if (ev.target.closest("a,[data-audio]")) return; toMusic(); });
      r.querySelectorAll('[data-act="pickMusic"]').forEach(function (c) { c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toMusic(); } }); });
      /* the three fields share the height that is left, by how many lines each has: all of it if it fits; if not, each gets its share and scrolls on its own */
      var box = r.querySelector("#ifields"), tas = ["#ipo", "#igu", "#it"].map(function (q) { return r.querySelector(q); });
      function layoutFields() {
        if (!box || !box.isConnected) return;
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
        var inField = r.contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName), k2 = fresh.id === it.id ? state.items.indexOf(fresh) : -1;
        var pid = state.items[k2 - 1] && state.items[k2 - 1].id, nid = state.items[k2 + 1] && state.items[k2 + 1].id;
        var strip = r.querySelector('[data-act="pickMusic"]');
        if (fresh.music_id !== it.music_id && strip && fresh.exercise_id === it.exercise_id) {   /* the song changed: the strip and its bar are written anew in place, so it shows even while I am typing */
          strip.innerHTML = '<div style="flex:1 1 auto;min-width:0">' + (fresh.music ? songLines(fresh.music) : '<span class="rrow__title">לחצו לבחירת מוזיקה</span>') + '</div>' + (fresh.music ? playCol(fresh.music, true) : '');
          var nb = strip.nextElementSibling, bar = songBar(fresh.music, "flex:none;padding:var(--sp-1) var(--sp-2) 0");
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
      on(r, "swap", function () { resetPk(); if (wide()) go(function () { picker(it); }); else pickerSheet(it); });   /* the catalog, to put another exercise in this place */
    }, "d");
  }

  /* ---------- the songs of an exercise: two lines each, the song and who plays it ---------- */
  function musicScreen(it) {
    var out = wide() ? function () { itemScreen(it); } : back;   /* beside the list, back is the same exercise */
    show(head("מוזיקה", "", true) + '<div class="rlist" id="mlist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", out);
      api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)").then(function (rows) {
        var seen = {}, list = [];
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
        var row = function (id, t, sub, cur, m) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-m="' + id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button>' + (m ? songBtn(m, true) : '') + '</div>'; };
        var l = r.querySelector("#mlist");
        l.innerHTML = row("", "בלי מוזיקה", "", !it.music_id) + list.map(function (m) { return songRow(m, it.music_id === m.id, "data-m"); }).join("") +
          '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-act="other" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">מוזיקות אחרות</span><span class="rrow__sub">שירים שאינם בקטלוג</span></button></div>';
        on(l, "other", function () { otherMusic(it, out); });
        l.querySelectorAll("[data-m]").forEach(function (b) {
          b.addEventListener("click", function () {
            var m = list.filter(function (x) { return x.id === b.dataset.m; })[0] || null;
            api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m ? m.id : null } }).then(function () { it.music_id = m ? m.id : null; it.music = m; if (wide()) paint(); out(); }, fail);
          });
        });
      }, fail);
    }, "d");
  }

  /* ---------- other music: files the catalogs do not list. Same rows as the songs, with a tag ---------- */
  /* narrow screen: choosing the song is a popup from the bottom; "other music" is a second popup on top of it, closing it is back */
  function chooseSong(it, m) {
    return api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m ? m.id : null } }).then(function () {
      it.music_id = m ? m.id : null; it.music = m;
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
    var r = sheetOf("musicDlg", "מוזיקה", '<div id="mlist"><div class="rskel rskel--title"></div></div>', { label: "ניקוי המוזיקה", icon: I.trash, id: "mclear" });   /* "no music" is the icon at the header's left: it clears the song */
    var dlg0 = document.getElementById("musicDlg"), clr = dlg0.querySelector("#mclear");
    if (clr) { clr.classList.remove("rbtn--primary"); clr.style.cssText += ";background:var(--surface-2);border-color:var(--surface-2);color:var(--text)";   /* clearing is not the main action: the header's neutral tile, not the green one */
      if (!it.music_id) RosterSheet.setDirty(dlg0, false); else RosterSheet.setDirty(dlg0, true); clr.addEventListener("click", function () { chooseSong(it, null); }); }
    api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)").then(function (rows) {
      var seen = {}, list = [];
      (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
      var plain = function (attr, t, sub, cur) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" ' + attr + ' style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button></div>'; };
      var l = r.querySelector("#mlist");
      l.innerHTML = list.map(function (m) { return songRow(m, it.music_id === m.id, "data-m"); }).join("") + plain('data-act="other"', "מוזיקות אחרות", "שירים שאינם בקטלוג", false);
      on(l, "other", function () { otherSheet(it); });
      l.querySelectorAll("[data-m]").forEach(function (b) { b.addEventListener("click", function () { chooseSong(it, list.filter(function (x) { return x.id === b.dataset.m; })[0] || null); }); });
    }, fail);
  }
  function otherSheet(it) {
    var r = sheetOf("otherDlg", "מוזיקות אחרות", '<label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label><div id="olist" style="flex:1 1 auto;min-height:0;overflow-y:auto"><div class="rskel rskel--title"></div></div>');
    r.style.overflowY = "hidden";   /* the search stays, only the list scrolls */
    api("/rest/v1/music?in_catalog=eq.false&select=id,name,title,artist,duration_sec,audio_object,in_catalog&order=title&limit=1000").then(function (rows) {
      var all = rows || [], l = r.querySelector("#olist");
      function draw() {
        var q = r.querySelector("#oq").value.trim().toLowerCase();
        var vis = all.filter(function (m) { return !q || (songName(m) + " " + songBy(m)).toLowerCase().indexOf(q) >= 0; });
        l.innerHTML = vis.length ? vis.map(function (m) { return songRow(m, it.music_id === m.id, "data-o"); }).join("") : ph("לא נמצא", "");
        l.querySelectorAll("[data-o]").forEach(function (b) { b.addEventListener("click", function () { chooseSong(it, all.filter(function (x) { return x.id === b.dataset.o; })[0]); }); });
      }
      r.querySelector("#oq").addEventListener("input", draw); draw();
    }, fail);
  }
  function otherMusic(it, out) {
    show(head("מוזיקות אחרות", "", true) + '<div class="pad" style="padding-block-end:0"><label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label></div><div class="rlist" id="olist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", function () { musicScreen(it); });
      api("/rest/v1/music?in_catalog=eq.false&select=id,name,title,artist,duration_sec,audio_object,in_catalog&order=title&limit=1000").then(function (rows) {
        var all = rows || [], l = r.querySelector("#olist");
        function draw() {
          var q = r.querySelector("#oq").value.trim().toLowerCase();
          var vis = all.filter(function (m) { return !q || (songName(m) + " " + songBy(m)).toLowerCase().indexOf(q) >= 0; });
          l.innerHTML = vis.length ? vis.map(function (m) {
            return songRow(m, it.music_id === m.id, "data-o");
          }).join("") : ph("לא נמצא", "");
          l.querySelectorAll("[data-o]").forEach(function (b) {
            b.addEventListener("click", function () {
              var m = all.filter(function (x) { return x.id === b.dataset.o; })[0];
              api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m.id } }).then(function () { it.music_id = m.id; it.music = m; if (wide()) paint(); out(); }, fail);
            });
          });
        }
        r.querySelector("#oq").addEventListener("input", draw);
        draw();
      }, fail);
    }, "d");
  }

  /* ---------- picker: the catalog ---------- */
  var pk = { q: "", ln: "", cg: "" };   /* the catalog's search, line and category */
  function resetPk() { pk = { q: "", ln: "", cg: "" }; }
  /* the catalog picker: the filters and the list. On a wide screen it is a pane; on a narrow one it is a popup from the bottom. */
  function pickerBody() {
    var cat = '<label class="rfield"><span>קטגוריה</span><input id="cg" placeholder=" " autocomplete="off" role="combobox" aria-expanded="false" aria-haspopup="listbox" value="הכול"></label>';
    var row = '<div style="display:flex;gap:var(--gap-button);align-items:flex-end"><label class="rfield" style="flex:1 1 0;min-width:0;margin:0"><span>חיפוש</span><input id="q" placeholder=" "></label>' +
      '<label class="rfield" style="flex:1 1 0;min-width:0;margin:0"><span>קו</span><select id="ln"><option value="">הכול</option>' + state.lines.map(function (l) { return '<option value="' + l.key + '">' + esc(l.name_he) + '</option>'; }).join("") + '</select></label></div>';
    return '<div class="pad" data-pickhead>' + cat + row + '</div>' +   /* the category first, then the search and the line */
      '<div class="rlist" id="list"><div class="rskel rskel--title"></div></div>';
  }
  function pickerWire(r, swapIt, sheet) {
      var catSel = pk.cg;   /* the key of the chosen category, "" = all */
      r.querySelector("#q").value = pk.q; r.querySelector("#ln").value = pk.ln; r.querySelector("#cg").value = catSel ? catName(catSel) : "הכול";
      /* a field you can type in that also opens its options when you click it: the options are the kit's menu, placed under the field */
      function wireCat() {
        var inp = r.querySelector("#cg"), pop = null, active = -1, shown = [];
        function label() { return catSel ? catName(catSel) : "הכול"; }
        function close(revert) { if (pop) { pop.remove(); pop = null; } inp.setAttribute("aria-expanded", "false"); if (revert) inp.value = label(); }
        function choose(k) { catSel = k; close(true); paintCat(); }
        function open(filter) {
          close(false);
          var f = (filter || "").trim();
          shown = [{ key: "", name_he: "הכול" }].concat((state.cats || []).filter(function (c) { return !f || c.name_he.indexOf(f) >= 0; }));
          if (!shown.length) return;
          active = -1;
          pop = document.createElement("div"); pop.className = "rmenu rmenu--fixed"; pop.setAttribute("role", "listbox");
          pop.innerHTML = shown.map(function (c, k) { return '<button type="button" class="rmenu__item" role="option" tabindex="-1" data-k="' + k + '"' + (c.key === catSel ? ' aria-selected="true" style="font-weight:var(--fw-bold)"' : '') + '><span>' + esc(c.name_he) + '</span></button>'; }).join("");
          (inp.closest("dialog") || document.body).appendChild(pop);
          var b = inp.getBoundingClientRect();
          pop.style.top = Math.round(b.bottom + 2) + "px"; pop.style.left = Math.round(b.left) + "px"; pop.style.width = Math.round(b.width) + "px"; pop.style.maxWidth = "none"; pop.style.maxHeight = "40vh"; pop.style.overflowY = "auto";   /* the menu is as wide as the field, whatever the menu's own cap */
          var got = pop.getBoundingClientRect();   /* inside a popup that is moved by a transform, fixed is measured from the popup: correct by what is off */
          if (Math.abs(got.top - (b.bottom + 2)) > 1) pop.style.top = Math.round(b.bottom + 2 - (got.top - (b.bottom + 2))) + "px";
          if (Math.abs(got.left - b.left) > 1) pop.style.left = Math.round(b.left - (got.left - b.left)) + "px";
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
        var q = r.querySelector("#q").value.trim().toLowerCase(), ln = r.querySelector("#ln").value, cg = catSel, l = r.querySelector("#list");
        pk = { q: r.querySelector("#q").value, ln: ln, cg: cg };   /* what was typed and chosen is kept while an exercise is looked at and back again */
        var rows = (state.cat || []).filter(function (e) {
          return (!cg || e.category === cg) && (!ln || (e.exercise_lines || []).some(function (x) { return x.line_key === ln; })) && (!q || (name(e) + " " + e.title_en + " " + e.category).toLowerCase().indexOf(q) >= 0);
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
      }
      r.querySelector("#q").addEventListener("input", paintCat); r.querySelector("#ln").addEventListener("change", paintCat); wireCat();
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
    var r = dlg.querySelector(".sheet-body"), ls = r.querySelector("#list");
    var ph0 = r.querySelector("[data-pickhead]"); if (ph0) ph0.style.paddingTop = "0";   /* the popup already leaves its standard step under the title */
    r.style.overflowY = "hidden";   /* the search stays where it is and only the list scrolls, so nothing shows through above it */
    if (ls) ls.style.cssText += ";flex:1 1 auto;min-height:0;overflow-y:auto";
    pickerWire(r, swapIt, true);
  }
  function previewSheet(e, swapIt) {
    var tok = ++previewTok;
    loadPreview(e.id).then(function (res) { var rows = res.rows, songs = res.songs;
      if (tok !== previewTok) return;
      var fake = { exercises: { exercise_texts: rows || [] } };
      var card = function (k, label) { return txt(fake, k) ? '<div class="rcard rcard--flat" style="margin-inline:0"><div class="rcard__head"><span class="rcard__title">' + label + '</span></div><div class="rcard__body"' + (isDraft(fake, k) ? DRAFT : "") + '>' + esc(txt(fake, k)) + '</div></div>' : ""; };
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה", sel = songs.length ? songs[0].id : null;
      var dlg = document.getElementById("exDlg");
      if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "exDlg"; document.body.appendChild(dlg); }
      RosterSheet.render(dlg, { title: name(e), from: "bottom", action: { label: word, icon: I.check, id: "exgo" },
        body: bleedCss("exDlg") + '<div style="padding-block:var(--sp-2)">' + ((card("poetics", "פואטיקה") + card("guidance", "הנחיה")) || ph("אין עדיין תיאור לתרגיל", "")) + musicRows(songs, sel) + '</div>' });
      bleedSet(dlg);
      wirePick(dlg, function (id) { sel = id; });
      dlg.querySelector("#exgo").addEventListener("click", function () { if (swapIt) confirmSwap(e, swapIt, true, sel); else addEx(e, undefined, true, sel); });
    }, fail);
  }
  /* the catalog is over a thousand exercises and the server hands out at most a thousand rows at a time: read it page by page */
  function loadCatalog() {
    var all = [], PAGE = 1000;
    function page(off) {
      return api("/rest/v1/exercises?select=id,title_he,title_en,category,phase_hint,exercise_lines(line_key)&order=title_en,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
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
    return Promise.all([api("/rest/v1/exercise_texts?exercise_id=eq." + id + "&select=lang,poetics,guidance,source"), api("/rest/v1/exercise_music?exercise_id=eq." + id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)")]).then(function (r) {
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
  function wirePick(root, onPick) {
    var bs = [].slice.call(root.querySelectorAll("[data-pk]"));
    bs.forEach(function (b) {
      b.addEventListener("click", function () {
        var row = b.closest(".rrow"), was = row.getAttribute("aria-current") === "true";
        bs.forEach(function (x) { x.closest(".rrow").setAttribute("aria-current", "false"); });
        if (!was) row.setAttribute("aria-current", "true");
        onPick(was ? null : b.dataset.pk);
      });
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
      var fake = { exercises: { exercise_texts: rows || [] } };
      var card = function (k, label) { return txt(fake, k) ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">' + label + '</span></div><div class="rcard__body"' + (isDraft(fake, k) ? DRAFT : "") + '>' + esc(txt(fake, k)) + '</div></div>' : ""; };
      var body = card("poetics", "פואטיקה") + card("guidance", "הנחיה");
      var word = swapIt ? "החלפה בתרגיל הזה" : "הוספה", sel = songs.length ? songs[0].id : null;
      var act = wide() ? '<button class="rbtn" type="button" data-act="doswap">' + word + '</button>'   /* the action is in the header, on the left; on a narrow screen a plain check, like the kit's popups */
                       : '<button class="rbtn" type="button" style="flex:none;width:var(--ctl);padding:0" data-act="doswap" aria-label="' + word + '" title="' + word + '">' + I.check + '</button>';   /* the green button, with a check */
      show(head(name(e), "", !wide(), act) + '<div class="rlist" style="overflow-x:hidden"><div style="padding-block:var(--sp-2)">' + (body || ph("אין עדיין תיאור לתרגיל", "")) + musicRows(songs, sel) + '</div></div>', function (r) { on(r, "back", back); wirePick(r, function (id) { sel = id; }); on(r, "doswap", function () { if (swapIt) confirmSwap(e, swapIt, undefined, sel); else addEx(e, undefined, undefined, sel); }); }, "d");
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
  function addEx(e, swapIt, sheet, mid) {
    if (swapIt) {   /* the same place in the curve, another exercise: its first song, and none of the old exercise's own wording */
      return firstMusic(e.id, mid).then(function (m) {
        return api("/rest/v1/vivencia_items?id=eq." + swapIt.id, { method: "PATCH", prefer: "return=minimal", json: { exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null, title: null, poetics: null, guidance: null } });
      }).then(function () { toast("התרגיל הוחלף");
        if (sheet) {   /* the popups slide out and the same place opens again with the new exercise: no new address, so no entry */
          closeSheets();
          return loadItems().then(function () { var it = state.items.filter(function (x) { return x.id === swapIt.id; })[0]; if (it) { stack().pop(); go(function () { itemScreen(it); }); } else back(); }, fail);
        }
        pending = { item: swapIt.id };
        stack().pop(); if (!wide()) { stack().pop(); stack().pop(); } var f = stack()[stack().length - 1]; if (f) f(); }, fail);   /* narrow: also the exercise screen and the one just seen */
    }
    var pos = state.items.reduce(function (m, i) { return Math.max(m, i.position); }, 0) + 1;
    firstMusic(e.id, mid).then(function (m) {
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null } });
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
      (txt(it, "poetics") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">פואטיקה</span></div><div class="rcard__body"' + (isDraft(it, "poetics") ? DRAFT : "") + '>' + esc(txt(it, "poetics")) + '</div></div>' : '') +
      (txt(it, "guidance") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">הנחיה</span></div><div class="rcard__body"' + (isDraft(it, "guidance") ? DRAFT : "") + '>' + esc(txt(it, "guidance")) + '</div></div>' : '') +
      (it.notes ? '<div class="rhint"><span class="rhint__tx">' + esc(it.notes) + '</span></div>' : '') +
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
      title: "מי מורשה להיכנס", from: "bottom",
      body: '<div class="pad">' +
        '<label class="rfield"><span>חיפוש</span><input id="aq" type="search" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield rfield--ltr"><span>אימייל של חשבון גוגל</span><input id="em" type="email" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield"><span>שם (לא חובה)</span><input id="en" placeholder=" " autocomplete="off"></label>' +
        '<button class="rbtn" id="addm" type="button">הוספה</button></div><div id="alist"></div>'
    });
    function paintA() {
      var q = dlg.querySelector("#aq").value.trim().toLowerCase(), l = dlg.querySelector("#alist");
      var vis = rows.filter(function (a) { return !q || (a.email + " " + (a.note || "")).toLowerCase().indexOf(q) >= 0; });
      l.innerHTML = vis.length ? vis.map(function (a) {
        return '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title" dir="ltr">' + esc(a.email) + '</span>' + (a.is_admin ? '<span class="rchip rchip--info rchip--s">מנהל</span>' : '') + '</div>' +
          '<label class="rfield"><span>שם</span><input data-note="' + esc(a.email) + '" placeholder=" " value="' + esc(a.note || "") + '"></label>' +
          (a.is_admin ? '' : '<div class="rcard__foot"><button class="rbtn rbtn--sm rbtn--ghost rbtn--danger" type="button" data-rm="' + esc(a.email) + '">הסרה</button></div>') + '</div>';
      }).join("") : '<div class="rempty"><b>' + (rows.length ? "לא נמצא" : "הרשימה ריקה") + '</b></div>';
      l.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/allowed?email=eq." + encodeURIComponent(b.dataset.rm), { method: "DELETE" }).then(load, fail); }); });
      l.querySelectorAll("[data-note]").forEach(function (i) {
        i.addEventListener("change", function () {
          api("/rest/v1/allowed?email=eq." + encodeURIComponent(i.dataset.note), { method: "PATCH", json: { note: i.value.trim() } }).then(function () { rows.forEach(function (a) { if (a.email === i.dataset.note) a.note = i.value.trim(); }); toast("נשמר"); }, fail);
        });
      });
    }
    function load() { return api("/rest/v1/allowed?select=email,is_admin,note&order=added_at").then(function (r) { rows = r || []; paintA(); }, fail); }
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
      renderVivs();
    }, function () { /* the next change will try again */ });
    if (i && state.viv) {
      api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: state.viv.id } }).then(function (mm) { state.members = mm || []; }, function () { /* kept as it was */ });
      loadItems().then(function () {
        paint();
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
    curSend({ item: liveItem.id, email: FLOA_AUTH.email().toLowerCase(), field: k, a: el.selectionStart, b: el.selectionEnd });
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
        var cs = getComputedStyle(ta), inner = g.firstChild, text = ta.value, a = Math.min(pr.a, text.length), b = Math.min(pr.b, text.length), hue = whoHue(email);
        inner.style.cssText = "position:absolute;top:0;left:0;white-space:pre-wrap;overflow-wrap:break-word;color:transparent;box-sizing:border-box;width:" + ta.clientWidth + "px;font:" + cs.font + ";letter-spacing:" + cs.letterSpacing + ";padding:" + cs.padding + ";direction:" + cs.direction + ";text-align:" + cs.textAlign + ";transform:translateY(" + (-ta.scrollTop) + "px)";
        var caret = '<span class="bio-caret" style="--c:hsl(' + hue + ' 62% 38%)"><i>' + esc(pr.name) + '</i></span>';
        inner.innerHTML = a === b ? esc(text.slice(0, a)) + caret + esc(text.slice(a)) : esc(text.slice(0, a)) + '<mark style="background:hsl(' + hue + ' 70% 78% / .75)">' + esc(text.slice(a, b)) + '</mark>' + caret + esc(text.slice(b));
      });
    }
    document.querySelectorAll(".bio-ghost").forEach(function (g) { if (!g.dataset.keep) g.remove(); });
  }
  (function () {
    var st = document.createElement("style");
    st.textContent = ".bio-ghost { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2 } .bio-ghost mark { color: transparent; border-radius: 2px } .bio-caret { display: inline-block; width: 0; height: 1.1em; vertical-align: text-bottom; border-inline-start: 2px solid var(--c); position: relative } .bio-caret > i { position: absolute; bottom: 100%; inset-inline-start: -2px; padding: 0 5px; border-radius: 4px 4px 4px 0; background: var(--c); color: #fff; font: 600 11px/16px var(--font); font-style: normal; white-space: nowrap }";
    document.head.appendChild(st);
    setInterval(paintGhosts, 1500);   /* a marker that was not renewed goes */
    function inMyField() { var el = document.activeElement; return !!(liveItem && liveItem.fld && liveItem.root.isConnected && el && el.tagName === "TEXTAREA" && ["poetics", "guidance", "notes"].some(function (k) { return liveItem.fld[k] === el; })); }
    setInterval(function () { if (cur.topic && inMyField()) curMine(); }, 2500);   /* standing still in a field is still being there */
    document.addEventListener("selectionchange", function () { if (cur.topic && inMyField()) curThrottled(); });
  })();

  /* ---------- start ---------- */
  function start() {
    if (!FLOA_AUTH.signedIn()) return gate("כניסה למאפשרי ביודנסה", false);
    show('<div class="rlist"><div class="rskel rskel--title"></div></div>');
    api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function (me) {
      state.me = me;
      if (!me || !me.allowed) return gate("לחשבון " + FLOA_AUTH.email() + " אין הרשאה להיכנס. אפשר לבקש מהמנהל להוסיף אותו.", true);
      return Promise.all([api("/rest/v1/lines?select=key,name_he&order=sort"), api("/rest/v1/phases?select=key,name_he&order=sort")]).then(function (r) { state.lines = r[0]; state.phases = r[1]; home(); startRealtime(); api("/rest/v1/song_likes?select=music_id").then(function (ls) { likes = {}; (ls || []).forEach(function (x) { likes[x.music_id] = true; }); }, function () { /* no hearts this time */ }); });
    }).catch(function (e) { console.error(e); gate("לא הצלחנו להתחבר. נסו שוב.", false); });
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
    if (!state.me) return;
    layers.forEach(function (l) { l.own = false; if (l.el.id !== "moreMenu" && l.el.open) l.el.close(); else if (l.el.id === "moreMenu") l.el.remove(); });
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
