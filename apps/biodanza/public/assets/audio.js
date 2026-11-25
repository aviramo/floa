/* The music of the catalog, played from the private bucket.

   A song with a file gets a sound button (the same round icon button as every other); a song without one
   keeps the YouTube button. The file is asked of the Worker WITH the signed-in token (it is never a link a
   person could pass on), played from memory, and kept in this browser (IndexedDB) so the next play, and a
   session without signal, needs no network at all.

   One song plays at a time. Pressing the button of the song that plays pauses it. */
(function () {
  "use strict";
  var API = "https://api.floa.co.il/biodanza/audio/";
  var FADE_MS = 2000;   /* THE one number: how long every change of sound takes (play, pause, a new place in the song, a new song). The old goes down while the new comes up over exactly this time. */
  var ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:var(--icon);height:var(--icon)"><circle cx="12" cy="12" r="12"/><path d="M10 7.5v9l6.5-4.5z" style="fill:var(--play-in,var(--page))"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:var(--icon);height:var(--icon)"><circle cx="12" cy="12" r="12"/><g style="fill:var(--play-in,var(--page))"><rect x="8.5" y="8" width="2.5" height="8" rx=".5"/><rect x="13" y="8" width="2.5" height="8" rx=".5"/></g></svg>',
    wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true" style="width:var(--icon);height:var(--icon)"><circle cx="12" cy="12" r="8" stroke-dasharray="14 36"/></svg>'
  };
  /* the glyphs of a LARGE icon (kit .ricon-lg: the circle is the button, the glyph is only the sign inside it, in the role colour) */
  var ICON_LG = {
    sound: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:var(--icon-lg);height:var(--icon-lg)"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:var(--icon-lg);height:var(--icon-lg)"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
  };
  ICON_LG.wait = ICON_LG.sound;   /* waiting: the glyph stays, the circle shows the wait (aria-busy, kit.css) */

  /* ---- kept in the browser ---- */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* the browser decides */ }   /* the songs are asked to stay when the phone runs short of room */
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res) {
      try {
        var rq = indexedDB.open("biodanza-audio", 1);
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
    return db().then(function (d) {   /* resolves when the song is really stored; fails when the device has no room, so that nobody believes it is there */
      if (!d) return;
      return new Promise(function (res, rej) {
        try { var tx = d.transaction("files", "readwrite"); tx.objectStore("files").put(blob, name); tx.oncomplete = function () { res(); }; tx.onerror = tx.onabort = function () { rej(tx.error || new Error("store")); }; } catch (e) { rej(e); }
      });
    });
  }
  function isKept(name) { return kept(name).then(function (b) { return !!b; }); }
  function drop(name) {
    return db().then(function (d) { if (!d) return; try { d.transaction("files", "readwrite").objectStore("files").delete(name); } catch (e) { /* it stays */ } });
  }
  function keptNames() {   /* every song on this device, for the offline page */
    return db().then(function (d) {
      if (!d) return [];
      return new Promise(function (res) { try { var g = d.transaction("files").objectStore("files").getAllKeys(); g.onsuccess = function () { res(g.result || []); }; g.onerror = function () { res([]); }; } catch (e) { res([]); } });
    });
  }
  var haveOnly = null;   /* with no internet: the names that can play (a Set), the other buttons are off */

  function bytes(name) {
    return kept(name).then(function (b) {
      if (b) return b;
      return FLOA_AUTH.token().then(function (t) {
        var ac = window.AbortController ? new AbortController() : null, to = ac ? setTimeout(function () { ac.abort(); }, 60000) : 0;   /* a download that does not finish in a minute is given up, not waited for forever */
        return fetch(API + name, { headers: { authorization: "Bearer " + t }, signal: ac ? ac.signal : undefined }).then(function (r) {
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
  function wideNow() { return !window.matchMedia || window.matchMedia("(min-width: 760px)").matches; }
  var seekWant = 0, loadingSeek = "";
  var vol = 1;
  try { var sv = parseFloat(localStorage.getItem("biodanza.volume")); if (sv >= 0 && sv <= 1) vol = sv; } catch (e) { /* the default */ }
  el.volume = wideNow() ? vol : 1;
  var fadeT = 0, fadingOut = false, holdVol = false, FADE = FADE_MS;   /* holdVol: the sound is at zero and waiting to start (or to be at its new place): nobody may set the volume until its ramp begins */   /* every change of sound, play, pause, a new place, a new song, takes two seconds: the old goes down while the new comes up */
  function target() { return wideNow() ? vol : 1; }
  function ramp(to, done, ms) {   /* the volume goes from where it is to `to` in a second (or ms) */
    clearInterval(fadeT); var from = el.volume, t0 = Date.now(), len = ms || FADE;
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
    fadingOut = true; paint(); document.dispatchEvent(new CustomEvent("bioaudio", { detail: { name: now, t: el.currentTime, d: el.duration || 0, playing: false, title: (infos[now] || {}).title || "", artist: (infos[now] || {}).artist || "" } }));
    ramp(0, function () { el.pause(); fadingOut = false; el.volume = target(); });
  }
  var SEEK_FADE = FADE_MS, ghosts = [], pendT = null, pendTimer = 0;
  function killGhosts() { ghosts.forEach(function (g) { clearInterval(g.t); try { g.a.pause(); g.a.removeAttribute("src"); } catch (e) { /* gone */ } }); ghosts = []; }
  function fadeGhost(g) {   /* the old sound goes down over two seconds, and is gone */
    var a = g.a, from = a.volume, t0 = Date.now();
    clearInterval(g.t);
    g.t = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / SEEK_FADE); a.volume = Math.max(0, from * Math.pow(1 - k, 3));
      if (k >= 1) { clearInterval(g.t); try { a.pause(); a.removeAttribute("src"); } catch (e) { /* gone */ } var i = ghosts.indexOf(g); if (i >= 0) ghosts.splice(i, 1); if (g.url) try { URL.revokeObjectURL(g.url); } catch (e2) { /* gone */ } }
    }, 30);
  }
  function takeOver(n, newUrl, oldUrl, name) {   /* the second element is playing, silent: from here it is the player; the first goes down while it comes up */
    var old = el; el = n; if (newUrl != null) { url = newUrl; now = name; } pend = null;
    clearInterval(fadeT); fadeT = 0; fadingOut = false; holdVol = false;
    if (ghosts.length > 2) killGhosts();
    var g = { a: old, t: 0, url: oldUrl || "" }; ghosts.push(g); fadeGhost(g);
    ramp(target(), function () { el.volume = target(); });
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
  function paint() {
    document.querySelectorAll("[data-audio]").forEach(function (b) {
      var me = b.dataset.audio, st = busy === me ? "wait" : (now === me && !el.paused && !fadingOut ? "pause" : "sound");
      var card = b.closest(".bio-c, .bio-card, .rrow, .rcard");   /* law 7: the card of a song that waits for its file shows it (kit.css, aria-busy) */
      if (card && !!card.__aw !== (st === "wait")) { card.__aw = st === "wait"; if (card.__aw) card.setAttribute("aria-busy", "true"); else if (!card.__busy) card.removeAttribute("aria-busy"); }   /* __busy: app.js is holding it for a request too */
      if (haveOnly) { var no = !haveOnly[me]; if (b.disabled !== no) { b.disabled = no; b.style.opacity = no ? ".45" : ""; } }
      if (b.dataset.st === st) return;
      var lg = b.hasAttribute("data-lg");
      if (lg) { if (st === "wait") b.setAttribute("aria-busy", "true"); else b.removeAttribute("aria-busy"); }
      b.dataset.st = st; var tl = b.querySelector(":scope > .rbtn__tail"); b.innerHTML = (lg ? ICON_LG : ICON)[st]; if (tl) b.appendChild(tl);   /* law 10: the count on the button is the button's tail, it survives the glyph change */
      b.setAttribute("aria-label", st === "pause" ? "עצירה" : "השמעה"); b.title = st === "pause" ? "עצירה" : "השמעה";
      if (!lg) b.style.color = st === "sound" ? "var(--text-muted)" : "var(--danger)";
    });
    if (busy !== lastBusy) { lastBusy = busy; document.dispatchEvent(new CustomEvent("biobusy", { detail: { on: !!busy } })); }   /* the player's own wait, told to the page: the dock's large icon shows it (app.js); no other button is lent it */
  }
  var lastBusy = "";
  hub.addEventListener("pause", paint); hub.addEventListener("play", paint); hub.addEventListener("ended", paint);
  /* the time left of the song that plays, told to the page (app.js counts it down under the song's button) */
  function tell(name, t, d) { document.dispatchEvent(new CustomEvent("bioaudio", { detail: { name: name, t: t, d: d, playing: !el.paused && !el.ended && !fadingOut, title: (infos[name] || {}).title || "", artist: (infos[name] || {}).artist || "" } })); }
  hub.addEventListener("timeupdate", function () { tell(now, el.currentTime, el.duration || 0); });
  hub.addEventListener("play", function () { tell(now, el.currentTime, el.duration || 0); });
  hub.addEventListener("pause", function () { tell(now, el.currentTime, el.duration || 0); });
  hub.addEventListener("ended", function () { if (advance()) return; tell("", 0, 0); });
  new MutationObserver(paint).observe(document.documentElement, { childList: true, subtree: true });

  /* what the phone shows on its lock screen and notification shade (Android, iPhone, desktop media keys): the song's name and who plays it,
     and the controls work from there. app.js tells which name is which song (info). */
  var infos = {}, ms = "mediaSession" in navigator ? navigator.mediaSession : null;
  function showMeta() {
    if (!ms || !window.MediaMetadata || !now) return;
    var i = infos[now] || {};
    try {
      ms.metadata = new MediaMetadata({ title: i.title || "ביודנסה", artist: i.artist || "", album: "ביודנסה",
        artwork: [{ src: new URL("favicon.png", document.baseURI).href, sizes: "192x192", type: "image/png" }] });
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
  function advance() {   /* a song ended: the next one of the list, round to the first after the last */
    if (!queue.length || queue.indexOf(now) < 0) return false;
    var nx = following(); if (!nx) return false;
    if (nx !== now && nextFor === nx && nextUrl) {
      if (url) URL.revokeObjectURL(url);
      url = nextUrl; nextUrl = ""; nextFor = ""; now = nx; el.src = url;
      var pr = el.play(); if (pr && pr.catch) pr.catch(function () { /* the next press plays it */ });
      paint(); preloadNext(); return true;
    }
    toggle(nx); return true;
  }
  var loadTok = 0;
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
      if (window.toast) window.toast(e && e.status === 403 ? "אין הרשאה להשמיע" : "אי אפשר להשמיע עכשיו");
    }).then(function () { if (tok === loadTok) { busy = ""; paint(); } });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-audio]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var lk = b.dataset.list;
    if (lk != null) { var l = lists[lk]; queue = l && l.length ? l.slice() : []; dropNext(); }   /* in a loop: what follows is the list; not in a loop: nothing follows */
    toggle(b.dataset.audio);
  }, true);

  /* THE EQUALIZER (the kit's /sound.js): what shows that a song plays — a curve on the card that plays, a ring round the number of the exercise that plays (the tab on a phone, the button to it in the header of a vivencia on a computer) */
  if (window.FLOA_SOUND) window.FLOA_SOUND.attach({
    analyse: true,   /* the picture follows the music (a silent twin of the song is listened to). false: nothing listens, the picture only breathes */
    player: function () { return el; }, bus: hub,
    targets: function () {
      var t = [];
      document.querySelectorAll('.bio-mcard.is-play, .bio-mcard:has([data-audio][data-st="pause"]), .bio-icard.is-play, .bio-icard.is-play-opt, .bio-icard:has([data-audio][data-st="pause"])').forEach(function (c) { t.push({ host: c, kind: "curve" }); });
      document.querySelectorAll(".bio-tab.is-play > .bio-tab__n").forEach(function (n) { t.push({ host: n, kind: "ring" }); });
      var g = document.querySelector("#vgo:not([hidden]) #vgon"); if (g) t.push({ host: g, kind: "ring" });
      document.querySelectorAll(".bio-vcard.is-vplay").forEach(function (c) { t.push({ host: c, kind: "curve" }); });   /* the card of the vivencia whose song plays */
      return t;
    }
  });

  window.BioAudio = {
    /* the button of a song that has a file: the same round icon button as the YouTube one */
    button: function (name, trail, lg) {
      if (lg) return '<button type="button" class="ricon-lg" data-lg data-audio="' + name + '" data-st="sound" aria-label="השמעה" title="השמעה">' + ICON_LG.sound + '</button>';   /* a large icon: the one type for a big action (kit.css) */
      return '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-audio="' + name + '" data-st="sound" aria-label="השמעה" title="השמעה" style="color:var(--text-muted)">' + ICON.sound + '</button>';
    },
    /* move the playing song to a place in it: a fraction from 0 to 1 */
    /* the volume, kept in this browser: a step up or down (in fractions of 1), the new level back */
    volume: function (d) { if (!wideNow()) { if (!fadeT && !holdVol) el.volume = 1; return 1; }   /* a phone has its own volume keys: the page always plays at full */
      vol = Math.max(0, Math.min(1, Math.round((vol + d) * 100) / 100)); if (!fadeT && !holdVol) el.volume = vol; try { localStorage.setItem("biodanza.volume", String(vol)); } catch (e) { /* not kept */ } return vol; },
    /* move the playing song by seconds (negative: back) */
    skip: function (sec) { if (el.duration) { pendT = null; clearTimeout(pendTimer); crossTo(el.currentTime + sec); } },   /* a key press moves at once: the bar shows it, and each press is its own crossfade */
    commitSeek: function () { commitSeek(); },
    /* the player's one button: the loaded song plays or pauses */
    setLists: function (o) { lists = o || {}; },
    playPause: function () { if (now && url) playToggle(); },
    seek: function (f) { if (el.duration) wantSeek(Math.max(0, Math.min(1, f)) * el.duration); },
    /* move a song to a place in it, also one that is not playing: its file is loaded (not played) and put there; play then goes on from that place */
    seekTo: function (name, f) {
      f = Math.max(0, Math.min(1, f));
      if (now === name && url && el.duration) { wantSeek(f * el.duration); return; }
      seekWant = f;
      if (loadingSeek === name) return;   /* already loading it: the last place asked is the one it goes to */
      loadingSeek = name; busy = name; paint();
      bytes(name).then(function (b) {
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(b); now = name; el.src = url;
        return new Promise(function (res, rej) { el.addEventListener("loadedmetadata", res, { once: true }); el.addEventListener("error", rej, { once: true }); });
      }).then(function () { el.currentTime = seekWant * el.duration; tell(now, el.currentTime, el.duration || 0); }).catch(function (e) {
        if (window.toast) window.toast(e && e.status === 403 ? "אין הרשאה להשמיע" : "אי אפשר להשמיע עכשיו");
      }).then(function () { loadingSeek = ""; busy = ""; paint(); });
    },
    /* the name a song's file is shown by on the phone's lock screen */
    info: function (name, title, artist) { if (name) infos[name] = { title: title || "", artist: artist || "" }; if (name === now) showMeta(); },
    kept: isKept,
    /* the length in seconds of a song that is ON the device, read from its own file (0 when it is not kept, or the file does not say): with no internet the time of every song of a kept vivencia is still known */
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
    save: function (name) {
      return kept(name).then(function (have) {   /* a song already on the device is not written again (a sync that rewrote 150MB every time would be slow and wear the phone) */
        if (have) return;
        return bytes(name).then(function (b) { return keep(name, b); });
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
  var LAST = "biodanza.last", lastAt = 0;
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
})();
