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
  function paint() {
    document.querySelectorAll("[data-audio]").forEach(function (b) {
      var me = b.dataset.audio, st = busy === me ? "wait" : (now === me && !el.paused ? "pause" : "sound");
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
    pause: function () { el.pause(); },
    seek: function (f) { if (el.duration) el.currentTime = Math.max(0, Math.min(1, f)) * el.duration; },
    kept: isKept
  };
})();
