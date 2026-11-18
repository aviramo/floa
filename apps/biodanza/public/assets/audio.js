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
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><path d="M4 9.500v5h3.500L12 18.500v-13L7.500 9.500zM15.500 9a4 4 0 010 6M18 6.500a8 8 0 010 11"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    wait: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true" style="width:calc(var(--icon-l) * 1.3);height:calc(var(--icon-l) * 1.3)"><circle cx="12" cy="12" r="8" stroke-dasharray="14 36"/></svg>'
  };

  /* ---- kept in the browser ---- */
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
  function kept(name) {
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res) { try { var g = d.transaction("files").objectStore("files").get(name); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; } catch (e) { res(null); } });
    });
  }
  function keep(name, blob) {
    return db().then(function (d) { if (!d) return; try { d.transaction("files", "readwrite").objectStore("files").put(blob, name); } catch (e) { /* the file still plays; it is only not kept */ } });
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
        return fetch(API + name, { headers: { authorization: "Bearer " + t } });
      }).then(function (r) {
        if (!r.ok) { var e = new Error("audio " + r.status); e.status = r.status; throw e; }
        return r.blob();
      }).then(function (b) { keep(name, b); return b; });
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
  function paint() {
    document.querySelectorAll("[data-audio]").forEach(function (b) {
      var me = b.dataset.audio, st = busy === me ? "wait" : (now === me && !el.paused ? "pause" : "sound");
      if (haveOnly) { var no = !haveOnly[me]; if (b.disabled !== no) { b.disabled = no; b.style.opacity = no ? ".45" : ""; } }
      if (b.dataset.st === st) return;
      b.dataset.st = st; b.innerHTML = ICON[st];
      b.setAttribute("aria-label", st === "pause" ? "עצירה" : "השמעה"); b.title = st === "pause" ? "עצירה" : "השמעה";
      b.style.color = st === "sound" ? "var(--text-3)" : "var(--danger)";
    });
  }
  el.addEventListener("pause", paint); el.addEventListener("play", paint); el.addEventListener("ended", paint);
  /* the time left of the song that plays, told to the page (app.js counts it down under the song's button) */
  function tell(name, t, d) { document.dispatchEvent(new CustomEvent("bioaudio", { detail: { name: name, t: t, d: d, playing: !el.paused && !el.ended } })); }
  el.addEventListener("timeupdate", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("play", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("pause", function () { tell(now, el.currentTime, el.duration || 0); });
  el.addEventListener("ended", function () { tell("", 0, 0); });
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
    act("play", function () { if (el.src) el.play(); });
    act("pause", function () { el.pause(); });
    act("seekto", function (d) { if (el.duration && d && d.seekTime != null) el.currentTime = Math.max(0, Math.min(el.duration, d.seekTime)); });
    act("seekbackward", function (d) { if (el.duration) el.currentTime = Math.max(0, el.currentTime - ((d && d.seekOffset) || 10)); });
    act("seekforward", function (d) { if (el.duration) el.currentTime = Math.min(el.duration, el.currentTime + ((d && d.seekOffset) || 10)); });
    el.addEventListener("play", function () { ms.playbackState = "playing"; showMeta(); showPos(); });
    el.addEventListener("pause", function () { ms.playbackState = el.ended ? "none" : "paused"; showPos(); });
    el.addEventListener("loadedmetadata", showPos);
    el.addEventListener("seeked", showPos);
    el.addEventListener("ended", function () { ms.playbackState = "none"; });
  }

  function toggle(name) {
    if (now === name && url) { if (el.paused) el.play(); else el.pause(); return; }
    busy = name; paint();
    bytes(name).then(function (b) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(b); now = name; el.src = url;
      return el.play();
    }).catch(function (e) {
      if (window.toast) window.toast(e && e.status === 403 ? "אין הרשאה להשמיע" : "אי אפשר להשמיע עכשיו");
    }).then(function () { busy = ""; paint(); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-audio]"); if (!b) return;
    e.preventDefault(); e.stopPropagation(); toggle(b.dataset.audio);
  }, true);

  window.BioAudio = {
    /* the button of a song that has a file: the same round icon button as the YouTube one */
    button: function (name, trail) {
      return '<button type="button" class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-audio="' + name + '" data-st="sound" aria-label="השמעה" title="השמעה" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:var(--text-3)">' + ICON.sound + '</button>';
    },
    /* move the playing song to a place in it: a fraction from 0 to 1 */
    /* the volume, kept in this browser: a step up or down (in fractions of 1), the new level back */
    volume: function (d) { if (!wideNow()) { el.volume = 1; return 1; }   /* a phone has its own volume keys: the page always plays at full */
      vol = Math.max(0, Math.min(1, Math.round((vol + d) * 100) / 100)); el.volume = vol; try { localStorage.setItem("biodanza.volume", String(vol)); } catch (e) { /* not kept */ } return vol; },
    /* move the playing song by seconds (negative: back) */
    skip: function (sec) { if (el.duration) el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + sec)); },
    pause: function () { el.pause(); },
    /* the player's one button: the loaded song plays or pauses */
    playPause: function () { if (now && url) { if (el.paused) el.play(); else el.pause(); } },
    seek: function (f) { if (el.duration) el.currentTime = Math.max(0, Math.min(1, f)) * el.duration; },
    /* move a song to a place in it, also one that is not playing: its file is loaded (not played) and put there; play then goes on from that place */
    seekTo: function (name, f) {
      f = Math.max(0, Math.min(1, f));
      if (now === name && url && el.duration) { el.currentTime = f * el.duration; return; }
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
      return bytes(name).then(function (b) { return keep(name, b); });
    },
    drop: drop,
    names: keptNames,
    /* no internet: only the songs that are on the device can play; the others' buttons are off */
    offline: function () {
      return keptNames().then(function (names) { haveOnly = {}; names.forEach(function (n) { haveOnly[n] = true; }); paint(); });
    }
  };
})();
