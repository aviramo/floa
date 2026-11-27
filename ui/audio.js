/* THE SOUND ENGINE of the player (ui/docs/player.md): the kit draws the player, and this file plays it. Served as /audio.js; an app loads it
   before its own adapter, which calls RosterAudio.create(options) ONCE and gets the player's API back.

   What it does, the same for every app: one sound at a time, played from memory; every change of sound (a new place, a new song) is an
   equal-power crossfade on one clock; a start with nothing else sounding comes up from silence, a stop goes down to silence; in a list the
   next song mixes in FADE_MS before this one ends; a song that ends with nothing after it plays to its end at full; a file is downloaded
   once however many ask for it (in-flight map), the next song is fetched ahead, and every file is kept in this browser (IndexedDB) so a
   session with no signal needs no network; the phone's lock screen shows and drives it (media session); the volume is the page's on a
   wide screen and full on a phone (its own keys).

   What the app gives (options), the only things that are its own:
     url(name)        the address of a song's file
     headers()        a promise of the request's headers (e.g. the signed-in token); optional
     store            the IndexedDB name the files are kept in
     key              the prefix of the keys in localStorage ("<key>.volume", "<key>.last")
     events           { state, fail, busy }: the names of the events told to the page on document
     album            the lock screen's album (and title when a song has none)
     artwork          the lock screen's picture, relative to the page, or an absolute URL (default: none)
     waitCards        a selector of song cards with no play button of their own (a tap plays them): they show the wait too
     rings()          what /sound.js rings while a song plays (the numbers that are not cards); analyse: false for a picture that only breathes

   The buttons: any element with data-audio="<name>" is a play button of that song (data-list="<key>": it plays in that list; data-lg: the
   large icon). Pressing the button of the song that plays pauses it. */
(function () {
  "use strict";
  var FADE_MS = 2000;   /* THE one number: how long every change of sound takes (play, pause, a new place in the song, a new song). The old goes down while the new comes up over exactly this time. */
  var WIDE = 760;       /* the kit's breakpoint (sheet.js WIDE): from here the page sets the volume, below it the phone's keys do */
  /* the kit's sprite (/icons.svg, ui/docs/icon.md): play and pause are line drawings, the same in an icon button and in a large icon (the parent sizes them).
     Waiting has no drawing of its own: the glyph stays, and the card (or the large icon's circle) shows the wait (aria-busy, kit.css) */
  function sym(n) { return '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#' + n + '"/></svg>'; }
  var ICON = { sound: sym("play"), pause: sym("pause") };
  ICON.wait = ICON.sound;
  var ICON_LG = ICON;
  var made = null;

  function create(o) {
    if (made) return made;   /* one player for the whole app */
    o = o || {};
    var STORE = o.store || "floa-audio", KEY = o.key || "floa.audio", EV = o.events || {};
    var EV_STATE = EV.state || "raudio", EV_FAIL = EV.fail || "raudio-fail", EV_BUSY = EV.busy || "raudio-busy";
    var ALBUM = o.album || "", ART = o.artwork || "";   /* no artwork given: no picture (a page-relative default asked for a file that is not there on every page) */

    /* ---- kept in the browser ---- */
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* the browser decides */ }   /* the songs are asked to stay when the phone runs short of room */
    var dbp = null;
    function db() {
      if (!dbp) dbp = new Promise(function (res) {
        try {
          var rq = indexedDB.open(STORE, 1);
          rq.onupgradeneeded = function () { rq.result.createObjectStore("files"); };
          rq.onsuccess = function () { res(rq.result); };
          rq.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
      return dbp;
    }
    /* a question to the device's store that never gets an answer (it happens on some phones) must not hold the song: after 2.5 seconds the song is fetched from the cloud */
    function kept(name) {
      return new Promise(function (res) {
        var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, navigator.onLine === false ? 20000 : 2500);   /* with no internet there is nowhere else to ask: the device's store is waited for */
        kept0(name).then(function (b) { if (!done) { done = true; clearTimeout(t); res(b); } }, function () { if (!done) { done = true; clearTimeout(t); res(null); } });
      });
    }
    function kept0(name) {
      return db().then(function (d) {
        if (!d) return null;
        return new Promise(function (res) { try { var g = d.transaction("files").objectStore("files").get(name); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; } catch (e) { res(null); } });
      });
    }
    function keep(name, blob) {
      return db().then(function (d) {   /* resolves when the song is really stored; fails when the device has no room, or has no store at all, so that nobody believes it is there */
        if (!d) { var ne = new Error("no store on this device"); ne.name = "NoStoreError"; throw ne; }
        return new Promise(function (res, rej) {
          try { var tx = d.transaction("files", "readwrite"); tx.objectStore("files").put(blob, name); tx.oncomplete = function () { res(); }; tx.onerror = tx.onabort = function () { rej(tx.error || new Error("store")); }; } catch (e) { rej(e); }
        });
      });
    }
    /* is the song on the device: its KEY only (the file is not read), and no timeout: this is the sync's question, which can wait, and a
       slow answer must never read as "not here" (that downloaded songs that were already kept, again and again) */
    function has(name) {
      return db().then(function (d) {
        if (!d) return false;
        return new Promise(function (res) { try { var g = d.transaction("files").objectStore("files").getKey(name); g.onsuccess = function () { res(g.result !== undefined); }; g.onerror = function () { res(false); }; } catch (e) { res(false); } });
      }, function () { return false; });
    }
    function isKept(name) { return has(name); }
    var noStore = null, unstorable = {};   /* save(): this visit's storage failures (see save) */
    function drop(name) {
      return db().then(function (d) { if (!d) return; try { d.transaction("files", "readwrite").objectStore("files").delete(name); } catch (e) { /* it stays */ } });
    }
    function keptNames() {   /* every song on this device, for an offline page */
      return db().then(function (d) {
        if (!d) return [];
        return new Promise(function (res) { try { var g = d.transaction("files").objectStore("files").getAllKeys(); g.onsuccess = function () { res(g.result || []); }; g.onerror = function () { res([]); }; } catch (e) { res([]); } });
      });
    }
    var haveOnly = null;   /* with no internet: the names that can play (a Set), the other buttons are off */

    var inflight = {};   /* a file already on its way (the preload of the next song, a save, a tap): every other ask for it waits for the same download, never a second one */
    function bytes(name) {
      if (inflight[name]) return inflight[name];
      var p = bytes0(name), off = function () { if (inflight[name] === p) delete inflight[name]; };
      inflight[name] = p; p.then(off, off);
      return p;
    }
    function bytes0(name) {
      return kept(name).then(function (b) {
        if (b) return b;
        return Promise.resolve(o.headers ? o.headers() : {}).then(function (h) {
          var ac = window.AbortController ? new AbortController() : null, to = ac ? setTimeout(function () { ac.abort(); }, 60000) : 0;   /* a download that does not finish in a minute is given up, not waited for forever */
          return fetch(o.url(name), { headers: h || {}, signal: ac ? ac.signal : undefined }).then(function (r) {
            if (!r.ok) { var e = new Error("audio " + r.status); e.status = r.status; throw e; }
            return r.blob().then(function (b) { clearTimeout(to); return b; });
          }, function (er) { clearTimeout(to); throw er; });
        }).then(function (b) { keep(name, b).then(null, function () { /* played now, not kept: save() tells the sync */ }); return b; });
      });
    }

    /* ---- one player for the whole app ---- */
    var el = new Audio(), now = "", url = "", busy = "";
    el.preload = "none";
    /* the player is an element that can be replaced: a new place or a new song is made ready in a SECOND element, silent, while the first goes on playing untouched; when the second is really playing, the first goes down and the second comes up. Whatever the page listens to goes through the hub, from whichever element is the player now. */
    var hub = new EventTarget(), FWD = ["pause", "play", "ended", "timeupdate", "loadedmetadata", "seeked", "error"], pend = null;
    function adopt(a) { FWD.forEach(function (n) { a.addEventListener(n, function () { if (a === el) hub.dispatchEvent(new Event(n)); }); }); }
    adopt(el);
    function fresh(src) { var n = new Audio(); n.preload = "auto"; n.volume = 0; adopt(n); n.src = src; return n; }
    function dropPending() { if (!pend) return; var n = pend; pend = null; try { n.pause(); n.removeAttribute("src"); } catch (e) { /* gone */ } }
    function wideNow() { return !window.matchMedia || window.matchMedia("(min-width: " + WIDE + "px)").matches; }
    var seekWant = 0, loadingSeek = "";
    var vol = 1;
    try { var sv = parseFloat(localStorage.getItem(KEY + ".volume")); if (sv >= 0 && sv <= 1) vol = sv; } catch (e) { /* the default */ }
    el.volume = wideNow() ? vol : 1;
    var fadeT = 0, fadingOut = false, holdVol = false, FADE = FADE_MS;   /* holdVol: the sound is at zero and waiting to start (or to be at its new place): nobody may set the volume until its ramp begins */
    function target() { return wideNow() ? vol : 1; }
    function ramp(to, done, ms) {   /* the volume goes from where it is to `to` over FADE (or ms) */
      clearInterval(fadeT); if (xfade) { xfade.up = false; xfade = null; }   /* a play or pause during a crossfade: the new sound stops following the crossfade (the old one still goes down) */
      var from = el.volume, t0 = Date.now(), len = ms || FADE;
      fadeT = setInterval(function () {
        var k = Math.min(1, (Date.now() - t0) / len), c = to >= from ? k * k : 1 - Math.pow(1 - k, 3);   /* the ear hears loudness in steps, not in amounts: the way up is slow at first, the way down falls fast and trails off, never a straight line */
        el.volume = Math.max(0, Math.min(1, from + (to - from) * c));
        if (k >= 1) { clearInterval(fadeT); fadeT = 0; if (done) done(); }
      }, 40);
    }
    function fadeIn() {   /* plays from silence up to the volume of the page */
      fadingOut = false; if (el.paused) el.volume = 0;
      holdVol = true;
      var pr = el.play();
      var up = function () { holdVol = false; ramp(target(), function () { el.volume = target(); }); };
      if (pr && pr.then) pr.then(up, function () { holdVol = false; el.volume = target(); /* it did not start: the caller says so */ }); else up();   /* the way up starts when the sound really starts, not when it was asked for */
      return pr;
    }
    function fadeOut() {   /* goes down to silence, and only then is paused: the buttons already say it is paused */
      if (el.paused || fadingOut) return;
      fadingOut = true; paint(); document.dispatchEvent(new CustomEvent(EV_STATE, { detail: { name: now, t: el.currentTime, d: el.duration || 0, playing: false, title: (infos[now] || {}).title || "", artist: (infos[now] || {}).artist || "" } }));
      clearTimeout(mixT);
      ghosts.forEach(function (g) {   /* a pause during a mix: the song going out goes down together with the one coming in, over the same time (or by its own end, if sooner) */
        if (g.a.paused || !(g.a.volume > 0)) return;
        var left = g.a.duration > 0 && isFinite(g.a.duration) ? (g.a.duration - g.a.currentTime) * 1000 : FADE;
        g.up = false; crossfade(g, Math.min(FADE, left));
      });
      ramp(0, function () { el.pause(); fadingOut = false; el.volume = target(); });
    }
    var SEEK_FADE = FADE_MS, ghosts = [], pendT = null, pendTimer = 0, xfade = null;   /* xfade: the crossfade whose clock is raising the player now */
    function killGhosts() { ghosts.forEach(function (g) { clearInterval(g.t); g.up = false; try { g.a.pause(); g.a.removeAttribute("src"); } catch (e) { /* gone */ } }); ghosts = []; xfade = null; }
    function crossfade(g, len) {   /* equal power (owner, 2026-11-26): ONE clock sets both, the old at from·cos and the new at target·sin, same start, same length, so the loudness never dips in the middle. len: shorter when the old song ends sooner (a mix into the next song) */
      var a = g.a, from = a.volume, t0 = Date.now(), L = Math.max(1, len || SEEK_FADE);
      clearInterval(g.t);
      function tick() {
        var k = Math.min(1, (Date.now() - t0) / L), q = k * Math.PI / 2;
        a.volume = Math.max(0, Math.min(1, from * Math.cos(q)));
        if (g.up && el === g.n) el.volume = Math.max(0, Math.min(1, target() * Math.sin(q)));
        if (k >= 1) {
          clearInterval(g.t); try { a.pause(); a.removeAttribute("src"); } catch (e) { /* gone */ }
          var i = ghosts.indexOf(g); if (i >= 0) ghosts.splice(i, 1); if (g.url) try { URL.revokeObjectURL(g.url); } catch (e2) { /* gone */ }
          if (g.up && el === g.n) el.volume = target();
          g.up = false; if (xfade === g) xfade = null;
        }
      }
      tick();   /* both move in the same frame they start */
      g.t = setInterval(tick, 30);
    }
    function takeOver(n, newUrl, oldUrl, name, len) {   /* the second element is playing, silent: from here it is the player; the first goes down while it comes up, on one clock (len: the mix's length, FADE_MS when not given) */
      var old = el; el = n; if (newUrl != null) { url = newUrl; now = name; } pend = null;
      clearInterval(fadeT); fadeT = 0; fadingOut = false; holdVol = false;
      if (xfade) xfade.up = false;   /* an earlier crossfade stops raising (its old sound still goes down on its own clock) */
      if (ghosts.length > 2) killGhosts();
      el.volume = 0;
      var g = { a: old, n: n, up: true, t: 0, url: oldUrl || "" }; ghosts.push(g); xfade = g; crossfade(g, len);
      watchEnd();
      if (ms) { ms.playbackState = "playing"; showMeta(); showPos(); }
      paint(); tell(now, el.currentTime, el.duration || 0);
    }
    function crossTo(t) {   /* the old place keeps playing, untouched, until the new place is really playing in the second element */
      if (!el.duration) return;
      t = Math.max(0, Math.min(el.duration, t));
      if (el.paused || fadingOut || !el.src) { el.currentTime = t; tell(now, t, el.duration || 0); return; }
      dropPending();
      var n = fresh(el.src); pend = n;
      n.addEventListener("loadedmetadata", function () { try { n.currentTime = t; } catch (e) { /* the place stays */ } }, { once: true });
      n.addEventListener("seeked", function () {
        if (pend !== n) return;   /* a newer place took over */
        if (el.paused || fadingOut) { dropPending(); el.currentTime = t; return; }   /* paused meanwhile: no sound is added */
        var pr = n.play(); var go = function () { if (pend === n) takeOver(n, null, "", now); };
        if (pr && pr.then) pr.then(go, function () { dropPending(); }); else go();
      }, { once: true });
      tell(now, t, el.duration || 0);   /* the bar shows the new place at once */
    }
    function wantSeek(t) { pendT = t; tell(now, t, el.duration || 0); clearTimeout(pendTimer); pendTimer = setTimeout(commitSeek, 250); }   /* a drag or a few key presses: the place is set when it stops */
    function commitSeek() { clearTimeout(pendTimer); if (pendT == null) return; var t = pendT; pendT = null; crossTo(t); }
    function playToggle() { if (fadingOut || el.paused) fadeIn(); else fadeOut(); }
    var waits = window.WeakMap ? new WeakMap() : null;
    function waitMark(card, on) {   /* the wait for the file, in the kit's one counter (RosterBusy.hold, /sheet.js): a request the app holds on the same card keeps it waiting */
      if (!card || !waits || waits.has(card) === on) return;
      if (on) waits.set(card, window.RosterBusy ? RosterBusy.hold(card) : function () { card.removeAttribute("aria-busy"); });
      else { var end = waits.get(card); waits.delete(card); end(); }
      if (on && !window.RosterBusy) card.setAttribute("aria-busy", "true");
    }
    function paint() {
      document.querySelectorAll("[data-audio]").forEach(function (b) {
        var me = b.dataset.audio, st = busy === me ? "wait" : (now === me && !el.paused && !fadingOut ? "pause" : "sound");
        waitMark(b.closest(".rcard, .rrow"), st === "wait");   /* law 7: the card of a song that waits for its file shows it (kit.css, aria-busy) */
        if (haveOnly) { var no = !haveOnly[me]; if (b.disabled !== no) b.disabled = no; }   /* off: the kit's --disabled */
        if (b.dataset.raudioSt === st) return;   /* data-raudio-st: the kit's own name, so an app's data-st never collides */
        var lg = b.hasAttribute("data-lg");
        if (lg) waitMark(b, st === "wait");
        b.dataset.raudioSt = st; var tl = b.querySelector(":scope > .rbtn__tail"); b.innerHTML = (lg ? ICON_LG : ICON)[st]; if (tl) b.appendChild(tl);   /* law 10: the count on the button is the button's tail, it survives the glyph change */
        b.setAttribute("aria-label", st === "pause" ? "עצירה" : "השמעה"); b.title = st === "pause" ? "עצירה" : "השמעה";
        b.classList.toggle("is-play", st !== "sound");   /* playing (or about to): .is-play, the kit colours it (an icon button and a large icon alike, in the second accent) */
      });
      if (o.waitCards) document.querySelectorAll(o.waitCards).forEach(function (c) { waitMark(c, !!busy && busy === c.dataset.song); });   /* a song card with no play button of its own (a tap on it plays, data-song): the same wait */
      if (busy !== lastBusy) { lastBusy = busy; document.dispatchEvent(new CustomEvent(EV_BUSY, { detail: { on: !!busy, name: busy } })); }   /* name: the song waited for, so the player's info names it once, not the one before it */   /* the player's own wait, told to the page: the player's large icon shows it; no other button is lent it */
    }
    var lastBusy = "";
    hub.addEventListener("pause", paint); hub.addEventListener("play", paint); hub.addEventListener("ended", paint);
    /* the time of the song that plays, told to the page */
    function tell(name, t, d) { document.dispatchEvent(new CustomEvent(EV_STATE, { detail: { name: name, t: t, d: d, playing: !el.paused && !el.ended && !fadingOut, title: (infos[name] || {}).title || "", artist: (infos[name] || {}).artist || "" } })); }
    hub.addEventListener("timeupdate", function () { tell(now, el.currentTime, el.duration || 0); });
    hub.addEventListener("play", function () { tell(now, el.currentTime, el.duration || 0); });
    hub.addEventListener("pause", function () { tell(now, el.currentTime, el.duration || 0); });
    hub.addEventListener("ended", function () { if (advance()) return; tell("", 0, 0); });
    new MutationObserver(paint).observe(document.documentElement, { childList: true, subtree: true });

    /* what the phone shows on its lock screen and notification shade (Android, iPhone, desktop media keys): the song's name and who plays it,
       and the controls work from there. The app tells which name is which song (info). */
    var infos = {}, ms = "mediaSession" in navigator ? navigator.mediaSession : null;
    function showMeta() {
      if (!ms || !window.MediaMetadata || !now) return;
      var i = infos[now] || {};
      try {
        ms.metadata = new MediaMetadata({ title: i.title || ALBUM, artist: i.artist || "", album: ALBUM,
          artwork: ART ? [{ src: new URL(ART, document.baseURI).href, sizes: "192x192", type: "image/png" }] : [] });
      } catch (e) { /* no lock screen info this time */ }
    }
    function showPos() {
      if (!ms || !ms.setPositionState || !(el.duration > 0) || !isFinite(el.duration)) return;
      try { ms.setPositionState({ duration: el.duration, position: Math.min(el.currentTime, el.duration), playbackRate: el.playbackRate || 1 }); } catch (e) { /* not supported */ }
    }
    if (ms) {
      var act = function (n, fn) { try { ms.setActionHandler(n, fn); } catch (e) { /* this action is not supported here */ } };
      act("play", function () { if (el.src) fadeIn(); });
      act("pause", function () { fadeOut(); });
      act("seekto", function (d) { if (el.duration && d && d.seekTime != null) crossTo(d.seekTime); });
      act("seekbackward", function (d) { if (el.duration) crossTo(el.currentTime - ((d && d.seekOffset) || 10)); });
      act("seekforward", function (d) { if (el.duration) crossTo(el.currentTime + ((d && d.seekOffset) || 10)); });
      hub.addEventListener("play", function () { ms.playbackState = "playing"; showMeta(); showPos(); });
      hub.addEventListener("pause", function () { ms.playbackState = el.ended ? "none" : "paused"; showPos(); });
      hub.addEventListener("loadedmetadata", showPos);
      hub.addEventListener("seeked", showPos);
      hub.addEventListener("ended", function () { ms.playbackState = "none"; });
    }

    var queue = [], nextFor = "", nextUrl = "", lists = {};   /* lists: the page tells which lists are loops (a key and the songs), a button with data-list takes its song's list */
    function dropNext() { if (nextUrl) { try { URL.revokeObjectURL(nextUrl); } catch (e) { /* gone */ } } nextUrl = ""; nextFor = ""; }
    function following() { var i = queue.indexOf(now); return i < 0 || !queue.length ? "" : queue[(i + 1) % queue.length]; }
    function preloadNext() {   /* the song after this one is brought ahead of time */
      var nx = following(); if (!nx || nx === now || nextFor === nx) return;
      bytes(nx).then(function (b) { if (following() !== nx) return; dropNext(); nextUrl = URL.createObjectURL(b); nextFor = nx; }).catch(function () { /* it is fetched when its turn comes */ });
    }
    /* THE MIX (owner, 2026-11-26): in a list, the next song starts FADE_MS before this one ends, and the two cross on the equal-power curve and one clock (takeOver).
       The song going out plays to its real end as it goes down. A song shorter than two fades mixes over half its length. Started by the time, not by `ended`. */
    var mixT = 0, mixing = null;
    function overlap(d) { return Math.min(FADE / 1000, d / 2); }   /* seconds */
    function watchEnd() {
      clearTimeout(mixT); mixT = 0;
      if (!queue.length || queue.indexOf(now) < 0 || el.paused || fadingOut || mixing === el || !(el.duration > 0) || !isFinite(el.duration)) return;
      var ov = overlap(el.duration), rem = el.duration - el.currentTime, wait = (rem - ov) / (el.playbackRate || 1);
      if (wait <= 0) { mixNext(); return; }   /* also a seek into the last two seconds: the mix starts at once */
      if (wait < 1.2) mixT = setTimeout(watchEnd, wait * 1000);   /* timeupdate comes about four times a second: the last stretch is timed exactly */
    }
    function mixNext() {
      if (pend) return;   /* a new place is on its way: it comes first, then the time is checked again */
      var nx = following(); if (!nx) return;
      var self = nx === now, src;
      if (self) src = el.src; else if (nextFor === nx && nextUrl) src = nextUrl; else return;   /* the next file is not here yet: it starts when this one ends (advance), coming up from silence */
      var from = el, n = fresh(src); mixing = from; pend = n;
      var pr = n.play();
      var go = function () {
        if (pend !== n || el !== from || el.paused || fadingOut) { if (pend === n) dropPending(); if (mixing === from) mixing = null; return; }
        var len = Math.max(1, (from.duration - from.currentTime) * 1000 / (from.playbackRate || 1));   /* the old one reaches silence exactly at its end */
        if (self) { takeOver(n, null, "", now, len); return; }
        var old = url; nextUrl = ""; nextFor = "";   /* now the player's: not dropped as "the next" */
        takeOver(n, src, old, nx, len); preloadNext();
      };
      if (pr && pr.then) pr.then(go, function () { if (pend === n) dropPending(); if (mixing === from) mixing = null; }); else go();
    }
    hub.addEventListener("timeupdate", watchEnd); hub.addEventListener("play", watchEnd); hub.addEventListener("seeked", watchEnd);
    function advance() {   /* a song ended with no mix (the next file was not here in time): the next one of the list, round to the first after the last, coming up from silence (fadeIn, owner 2026-11-26) */
      if (!queue.length || queue.indexOf(now) < 0) return false;
      var nx = following(); if (!nx) return false;
      dropPending();
      var quiet = function (p) { if (p && p.catch) p.catch(function () { /* the next press plays it */ }); };
      if (nx === now) { el.currentTime = 0; quiet(fadeIn()); return true; }
      if (nextFor === nx && nextUrl) {
        if (url) URL.revokeObjectURL(url);
        url = nextUrl; nextUrl = ""; nextFor = ""; now = nx; el.src = url;
        quiet(fadeIn());
        paint(); preloadNext(); return true;
      }
      toggle(nx); return true;
    }
    var loadTok = 0, DONE = {};   /* DONE: a seekTo whose song already took over (or was dropped): nothing more to set */
    function fail(name, e) { document.dispatchEvent(new CustomEvent(EV_FAIL, { detail: { name: name, status: e && e.status } })); }   /* the player says it in its sub line (ui/docs/player.md, error), not a toast */
    function toggle(name) {
      if (queue.length && queue.indexOf(name) < 0) { queue = []; dropNext(); }   /* a song of another place ends the list */
      if (now === name && url) { playToggle(); return; }
      var tok = ++loadTok; busy = name; paint();
      bytes(name).then(function (b) {
        if (tok !== loadTok) return;   /* another song was asked for meanwhile: that one is the one that comes */
        pendT = null; dropPending();
        var playingNow = !!url && !el.paused && !fadingOut && !!el.src, old = url, nu = URL.createObjectURL(b);
        if (!playingNow) {   /* nothing is heard: the song starts from silence, coming up over two seconds */
          killGhosts(); if (old) URL.revokeObjectURL(old);
          url = nu; now = name; el.src = nu;
          return fadeIn().then(function () { preloadNext(); });
        }
        /* something plays: it goes on, untouched, while the new song loads in a second element; then the old goes down as the new comes up */
        var n = fresh(nu); pend = n;
        return new Promise(function (res, rej) {
          var pr = n.play();
          if (pr && pr.then) pr.then(res, rej); else res();
          n.addEventListener("error", rej, { once: true });
        }).then(function () { if (tok !== loadTok || pend !== n) { if (pend === n) dropPending(); URL.revokeObjectURL(nu); return; } holdVol = true; takeOver(n, nu, old, name); preloadNext(); }, function (e) { if (pend === n) dropPending(); URL.revokeObjectURL(nu); throw e; });
      }).catch(function (e) {
        if (tok !== loadTok) return;
        fail(name, e);
      }).then(function () { if (tok === loadTok) { busy = ""; paint(); } });
    }
    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-audio]"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var lk = b.dataset.list;
      if (lk != null) { var l = lists[lk]; queue = l && l.length ? l.slice() : []; dropNext(); }   /* in a loop: what follows is the list; not in a loop: nothing follows */
      toggle(b.dataset.audio);
    }, true);

    /* THE EQUALIZER (the kit's /sound.js): what shows that a song plays, a curve on the card that plays, and a ring round what the app names (rings) */
    if (window.FLOA_SOUND) window.FLOA_SOUND.attach({
      analyse: o.analyse !== false,   /* the picture follows the music (a silent twin of the song is listened to). false: nothing listens, the picture only breathes */
      player: function () { return el; }, bus: hub,
      rings: function () { return o.rings ? o.rings() : []; }   /* the cards get their curve from the kit by themselves (every .rcard.is-play); only the numbers that are not cards are passed */
    });

    made = {
      /* the button of a song that has a file: the same round icon button as every other */
      button: function (name, unused, lg) {   /* the second argument is kept for old callers: a row's end is ONE wrapper the caller writes, never a class on the button */
        if (lg) return '<button type="button" class="ricon-lg raccent-2" data-lg data-audio="' + name + '" data-raudio-st="sound" aria-label="השמעה" title="השמעה">' + ICON_LG.sound + '</button>';   /* a large icon: the one type for a big action (kit.css). A filled (main) play button is ALWAYS the second accent, at rest too (the kit's scope on the button itself); a small play button at rest stays grey */
        return '<button type="button" class="rbtn rbtn--icon rbtn--muted" data-audio="' + name + '" data-raudio-st="sound" aria-label="השמעה" title="השמעה">' + ICON.sound + '</button>';
      },
      /* the volume, kept in this browser: a step up or down (in fractions of 1), the new level back */
      volume: function (d) { if (!wideNow()) { if (!fadeT && !holdVol && !xfade) el.volume = 1; return 1; }   /* a phone has its own volume keys: the page always plays at full */
        vol = Math.max(0, Math.min(1, Math.round((vol + d) * 100) / 100)); if (!fadeT && !holdVol && !xfade) el.volume = vol;   /* during a crossfade its clock reads the new level itself */ try { localStorage.setItem(KEY + ".volume", String(vol)); } catch (e) { /* not kept */ } return vol; },
      /* move the playing song by seconds (negative: back) */
      skip: function (sec) { if (el.duration) { pendT = null; clearTimeout(pendTimer); crossTo(el.currentTime + sec); } },   /* a key press moves at once: the bar shows it, and each press is its own crossfade */
      commitSeek: function () { commitSeek(); },
      setLists: function (l) { lists = l || {}; },
      /* what a tap on a song's play button does, from code (a tap on a song card): play or pause that song; listKey: the loop it is in, as the button's data-list */
      tap: function (name, listKey) { if (!name) return; if (listKey != null) { var l = lists[listKey]; queue = l && l.length ? l.slice() : []; dropNext(); } toggle(name); },
      /* the player's one button: the loaded song plays or pauses */
      playPause: function () { if (now && url) playToggle(); },
      /* move the playing song to a place in it: a fraction from 0 to 1 */
      seek: function (f) { if (el.duration) wantSeek(Math.max(0, Math.min(1, f)) * el.duration); },
      /* move a song to a place in it, also one that is not playing: its file is loaded (not played) and put there; play then goes on from that place */
      seekTo: function (name, f) {
        f = Math.max(0, Math.min(1, f));
        if (now === name && url && el.duration) { wantSeek(f * el.duration); return; }
        seekWant = f;
        if (loadingSeek === name) return;   /* already loading it: the last place asked is the one it goes to */
        loadingSeek = name; busy = name; paint();
        var tok = ++loadTok;
        bytes(name).then(function (b) {
          if (tok !== loadTok) return DONE;   /* another song was asked for meanwhile */
          var playingNow = !!url && !el.paused && !fadingOut && !!el.src;
          if (playingNow) {   /* another song plays: it goes on, untouched, while this one gets ready at its place in a second element; then the same crossfade as a new song */
            pendT = null; dropPending();
            var old = url, nu = URL.createObjectURL(b), n = fresh(nu); pend = n;
            return new Promise(function (res, rej) {
              n.addEventListener("loadedmetadata", function () { try { n.currentTime = seekWant * n.duration; } catch (e) { /* the start */ } }, { once: true });
              n.addEventListener("seeked", function () { var pr = n.play(); if (pr && pr.then) pr.then(res, rej); else res(); }, { once: true });
              n.addEventListener("error", rej, { once: true });
            }).then(function () {
              if (tok !== loadTok || pend !== n) { if (pend === n) dropPending(); URL.revokeObjectURL(nu); return DONE; }
              if (el.paused || fadingOut) { dropPending(); URL.revokeObjectURL(nu); return DONE; }   /* paused meanwhile: no sound is added */
              holdVol = true; takeOver(n, nu, old, name); preloadNext(); return DONE;   /* already at its place: not set again (that would jump back) */
            }, function (e) { if (pend === n) dropPending(); URL.revokeObjectURL(nu); throw e; });
          }
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(b); now = name; el.src = url;
          return new Promise(function (res, rej) { el.addEventListener("loadedmetadata", res, { once: true }); el.addEventListener("error", rej, { once: true }); });
        }).then(function (v) { if (v === DONE) return; el.currentTime = seekWant * el.duration; tell(now, el.currentTime, el.duration || 0); }).catch(function (e) {
          if (tok !== loadTok) return;
          fail(name, e);   /* the player's error state, not a toast */
        }).then(function () { loadingSeek = ""; if (tok === loadTok) busy = ""; paint(); });
      },
      /* the name a song's file is shown by on the phone's lock screen */
      info: function (name, title, artist) { if (name) infos[name] = { title: title || "", artist: artist || "" }; if (name === now) showMeta(); },
      kept: isKept,
      /* the length in seconds of a song that is ON the device, read from its own file (0 when it is not kept, or the file does not say): with no internet the time of every kept song is still known */
      length: function (name) {
        return kept(name).then(function (b) {
          if (!b) return 0;
          return new Promise(function (res) {
            var a = new Audio(), u = URL.createObjectURL(b), done = false, t = setTimeout(function () { fin(0); }, 8000);
            function fin(d) { if (done) return; done = true; clearTimeout(t); a.removeAttribute("src"); try { URL.revokeObjectURL(u); } catch (e) { /* gone */ } res(d > 0 && isFinite(d) ? d : 0); }
            a.preload = "metadata"; a.addEventListener("loadedmetadata", function () { fin(a.duration); }); a.addEventListener("error", function () { fin(0); }); a.src = u;
          });
        }).catch(function () { return 0; });
      },
      /* put the song on this device (downloaded now if it is not here yet): resolves when it is stored */
      /* A song that could not be STORED (no store on this device, no room, a store error) is remembered for this visit: asking again fails at
         once with the same error and downloads nothing, so a sync that runs again never downloads the same file again just to lose it. With no
         store at all, no song is downloaded to be kept. A failed DOWNLOAD is not remembered (the next sync tries it again). */
      save: function (name) {
        if (noStore) return Promise.reject(noStore);
        if (unstorable[name]) return Promise.reject(unstorable[name]);
        return has(name).then(function (have) {   /* a song already on the device is not written again (a sync that rewrote 150MB every time would be slow and wear the phone) */
          if (have) return;
          return bytes(name).then(function (b) {
            return keep(name, b).then(null, function (e) {
              e = e || new Error("store");
              if (e.name === "NoStoreError") noStore = e; else unstorable[name] = e;
              throw e;
            });
          });
        });
      },
      drop: drop,
      names: keptNames,
      /* no internet: only the songs that are on the device can play; the others' buttons are off */
      offline: function () {
        return keptNames().then(function (names) { haveOnly = {}; names.forEach(function (n) { haveOnly[n] = true; }); paint(); });
      }
    };

    /* a refresh stops the sound (the browser allows nothing else), but not the place: the song and where it was are remembered, and after the
       reload the player shows the same song paused at the same second; one tap plays on from there */
    var LAST = KEY + ".last", lastAt = 0;
    function remember(force) {
      if (!now) return;
      var n = Date.now(); if (!force && n - lastAt < 1000) return; lastAt = n;
      try { localStorage.setItem(LAST, JSON.stringify({ name: now, t: el.currentTime || 0 })); } catch (e) { /* not kept */ }
    }
    function forget() { try { localStorage.removeItem(LAST); } catch (e) { /* none */ } }
    hub.addEventListener("timeupdate", function () { remember(false); });
    hub.addEventListener("pause", function () { if (!el.ended) remember(true); });
    window.addEventListener("pagehide", function () { remember(true); });
    hub.addEventListener("ended", forget);
    (function restore() {
      var last = null; try { last = JSON.parse(localStorage.getItem(LAST) || "null"); } catch (e) { last = null; }
      if (!last || !last.name || now) return;
      bytes(last.name).then(function (b) {
        if (now) return;   /* a song was started meanwhile */
        url = URL.createObjectURL(b); now = last.name; el.src = url;
        el.addEventListener("loadedmetadata", function () { if (now === last.name && el.currentTime < 0.5) el.currentTime = Math.min(last.t || 0, Math.max(0, el.duration - 1)); tell(now, el.currentTime, el.duration || 0); }, { once: true });
      }).catch(function () { forget(); });
    })();

    return made;
  }

  window.RosterAudio = { create: create, FADE_MS: FADE_MS };
})();
