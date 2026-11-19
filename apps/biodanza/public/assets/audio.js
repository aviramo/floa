/* The music of the catalog, played from the private bucket.

   A song with a file gets a sound button (the same round icon button as every other); a song without one
   keeps the YouTube button. The file is asked of the Worker WITH the signed-in token (it is never a link a
   person could pass on), played from memory, and kept in this browser (IndexedDB) so the next play, and a
   session without signal, needs no network at all.

   One song plays at a time. Pressing the button of the song that plays pauses it. */
(function () {
  "use strict";
  var API = "https://api.floa.co.il/biodanza/audio/";
  var ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><circle cx="12" cy="12" r="8" stroke-dasharray="14 36"/></svg>'
  };

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
  function wideNow() { return !window.matchMedia || window.matchMedia("(min-width: 1024px)").matches; }
  var seekWant = 0, loadingSeek = "";
  var vol = 1;
  try { var sv = parseFloat(localStorage.getItem("biodanza.volume")); if (sv >= 0 && sv <= 1) vol = sv; } catch (e) { /* the default */ }
  el.volume = wideNow() ? vol : 1;
  var fadeT = 0, fadingOut = false, FADE = 1000;
  function target() { return wideNow() ? vol : 1; }
  function ramp(to, done, ms) {   /* the volume goes from where it is to `to` in a second (or ms) */
    clearInterval(fadeT); var from = el.volume, t0 = Date.now(), len = ms || FADE;
    fadeT = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / len); el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(fadeT); fadeT = 0; if (done) done(); }
    }, 40);
  }
  function fadeIn() {   /* plays from silence up to the volume of the page */
    fadingOut = false; if (el.paused) el.volume = 0;
    var pr = el.play();
    ramp(target(), function () { el.volume = target(); });
    return pr;
  }
  function fadeOut() {   /* goes down to silence, and only then is paused: the buttons already say it is paused */
    if (el.paused || fadingOut) return;
    fadingOut = true; paint(); document.dispatchEvent(new CustomEvent("bioaudio", { detail: { name: now, t: el.currentTime, d: el.duration || 0, playing: false, title: (infos[now] || {}).title || "", artist: (infos[now] || {}).artist || "" } }));
    ramp(0, function () { el.pause(); fadingOut = false; el.volume = target(); });
  }
  var SEEK_FADE = 500, ghosts = [], pendT = null, pendTimer = 0;
  function killGhosts() { ghosts.forEach(function (g) { clearInterval(g.t); try { g.a.pause(); g.a.removeAttribute("src"); } catch (e) { /* gone */ } }); ghosts = []; }
  function crossTo(t) {   /* a copy of the player stays on the old place and fades out; the player itself goes to the new place and fades in */
    if (!el.duration) return;
    t = Math.max(0, Math.min(el.duration, t));
    if (el.paused || fadingOut || !el.src) { el.currentTime = t; return; }
    if (ghosts.length > 2) killGhosts();
    var a = new Audio(), g = { a: a, t: 0 };
    a.src = el.src; a.volume = el.volume; a.currentTime = el.currentTime;
    var pr = a.play(); if (pr && pr.catch) pr.catch(function () { /* the new place is heard anyway */ });
    ghosts.push(g);
    var from = a.volume, t0 = Date.now();
    g.t = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / SEEK_FADE); a.volume = Math.max(0, from * (1 - k));
      if (k >= 1) { clearInterval(g.t); try { a.pause(); a.removeAttribute("src"); } catch (e) { /* gone */ } var i = ghosts.indexOf(g); if (i >= 0) ghosts.splice(i, 1); }
    }, 30);
    el.currentTime = t; el.volume = 0; ramp(target(), function () { el.volume = target(); }, SEEK_FADE);
  }
  function wantSeek(t) { pendT = t; clearTimeout(pendTimer); pendTimer = setTimeout(commitSeek, 250); }   /* a drag or a few key presses: the place is set when it stops */
  function commitSeek() { clearTimeout(pendTimer); if (pendT == null) return; var t = pendT; pendT = null; crossTo(t); }
  function playToggle() { if (fadingOut || el.paused) fadeIn(); else fadeOut(); }
  function paint() {
    document.querySelectorAll("[data-audio]").forEach(function (b) {
      var me = b.dataset.audio, st = busy === me ? "wait" : (now === me && !el.paused && !fadingOut ? "pause" : "sound");
      if (haveOnly) { var no = !haveOnly[me]; if (b.disabled !== no) { b.disabled = no; b.style.opacity = no ? ".45" : ""; } }
      if (b.dataset.st === st) return;
      b.dataset.st = st; b.innerHTML = ICON[st];
      b.setAttribute("aria-label", st === "pause" ? "עצירה" : "השמעה"); b.title = st === "pause" ? "עצירה" : "השמעה";
      b.style.color = st === "sound" ? "var(--text-3)" : "var(--danger)";
    });
  }
  el.addEventListener("pause", paint); el.addEventListener("play", paint); el.addEventListener("ended", paint);
  /* the time left of the song that plays, told to the page (app.js counts it down under the song's button) */
  function tell(name, t, d) { document.dispatchEvent(new CustomEvent("bioaudio", { detail: { name: name, t: t, d: d, playing: !el.paused && !el.ended && !fadingOut, title: (infos[name] || {}).title || "", artist: (infos[name] || {}).artist || "" } })); }
  el.addEventListener("timeupdate", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("play", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("pause", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("ended", function () { if (advance()) return; tell("", 0, 0); });
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
    el.addEventListener("play", function () { ms.playbackState = "playing"; showMeta(); showPos(); });
    el.addEventListener("pause", function () { ms.playbackState = el.ended ? "none" : "paused"; showPos(); });
    el.addEventListener("loadedmetadata", showPos);
    el.addEventListener("seeked", showPos);
    el.addEventListener("ended", function () { ms.playbackState = "none"; });
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
  function toggle(name) {
    if (queue.length && queue.indexOf(name) < 0) { queue = []; dropNext(); }   /* a song of another place ends the list */
    if (now === name && url) { playToggle(); return; }
    busy = name; paint();
    bytes(name).then(function (b) {
      killGhosts(); pendT = null;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(b); now = name; el.src = url;
      return fadeIn().then(function () { preloadNext(); });
    }).catch(function (e) {
      if (window.toast) window.toast(e && e.status === 403 ? "אין הרשאה להשמיע" : "אי אפשר להשמיע עכשיו");
    }).then(function () { busy = ""; paint(); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-audio]"); if (!b) return;
    e.preventDefault(); e.stopPropagation();
    var lk = b.dataset.list;
    if (lk != null) { var l = lists[lk]; queue = l && l.length ? l.slice() : []; dropNext(); }   /* in a loop: what follows is the list; not in a loop: nothing follows */
    toggle(b.dataset.audio);
  }, true);

  window.BioAudio = {
    /* the button of a song that has a file: the same round icon button as the YouTube one */
    button: function (name, trail) {
      return '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-audio="' + name + '" data-st="sound" aria-label="השמעה" title="השמעה" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:var(--text-3)">' + ICON.sound + '</button>';
    },
    /* move the playing song to a place in it: a fraction from 0 to 1 */
    /* the volume, kept in this browser: a step up or down (in fractions of 1), the new level back */
    volume: function (d) { if (!wideNow()) { if (!fadeT) el.volume = 1; return 1; }   /* a phone has its own volume keys: the page always plays at full */
      vol = Math.max(0, Math.min(1, Math.round((vol + d) * 100) / 100)); if (!fadeT) el.volume = vol; try { localStorage.setItem("biodanza.volume", String(vol)); } catch (e) { /* not kept */ } return vol; },
    /* move the playing song by seconds (negative: back) */
    skip: function (sec) { if (el.duration) wantSeek((pendT != null ? pendT : el.currentTime) + sec); },
    commitSeek: function () { commitSeek(); },
    pause: function () { fadeOut(); },
    /* the player's one button: the loaded song plays or pauses */
    /* the player's X: the song stops and is let go, so the pill has nothing loaded */
    /* play these songs one after the other, without a pause, round again from the first */
    playList: function (names) {
      queue = (names || []).filter(Boolean); dropNext(); if (!queue.length) return;
      if (now === queue[0] && url) { el.currentTime = 0; fadeIn(); preloadNext(); } else toggle(queue[0]);
    },
    setLists: function (o) { lists = o || {}; },
    queueNames: function () { return queue.slice(); },   /* the songs of the list that is playing, if one is */
    stopList: function () { killGhosts(); queue = []; dropNext(); clearInterval(fadeT); fadeT = 0; fadingOut = false; el.pause(); el.volume = target(); },   /* the list is switched off: what plays is paused and nothing follows it */
    stop: function () { killGhosts(); queue = []; dropNext(); clearInterval(fadeT); fadeT = 0; fadingOut = false; el.pause(); el.volume = target(); now = ""; try { el.removeAttribute("src"); el.load(); } catch (e) { /* nothing to let go */ } if (url) { URL.revokeObjectURL(url); url = ""; } tell("", 0, 0); paint(); },
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
  el.addEventListener("timeupdate", function () { remember(false); });
  el.addEventListener("pause", function () { if (!el.ended) remember(true); });
  window.addEventListener("pagehide", function () { remember(true); });
  el.addEventListener("ended", forget);
  var origStop = window.BioAudio.stop; window.BioAudio.stop = function () { forget(); return origStop(); };
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
