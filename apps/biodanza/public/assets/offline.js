/* Vivencias kept on this device, to be seen and played with no internet.

   A saved vivencia is a copy of what the app reads for it: its row in the list, its exercises (with the texts and the songs that
   come embedded), the people it is shared with, and the audio of every song in it (kept by audio.js, in its own store, so the same
   player plays them). Everything is read-only offline: the copy is never written back.
   The copies live in IndexedDB ('biodanza-offline'), not in localStorage: the audio alone is far too big for that. */
(function () {
  "use strict";
  var dbp = null, ids = {};
  function db() {
    if (!dbp) dbp = new Promise(function (res) {
      try {
        var rq = indexedDB.open("biodanza-offline", 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore("viv", { keyPath: "id" }); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
    return dbp;
  }
  function run(mode, fn) {   /* one request on the store, its result as a promise (null when there is no storage) */
    return db().then(function (d) {
      if (!d) return null;
      return new Promise(function (res, rej) {
        try { var r = fn(d.transaction("viv", mode).objectStore("viv")); r.onsuccess = function () { res(r.result === undefined ? null : r.result); }; r.onerror = function () { rej(r.error); }; }
        catch (e) { rej(e); }
      });
    });
  }
  function all() { return run("readonly", function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }
  var ready = all().then(function (rows) { rows.forEach(function (r) { ids[r.id] = true; }); }, function () { /* nothing saved */ });

  function songsOf(items) {
    var seen = {}, out = [];
    (items || []).forEach(function (it) { var n = it.music && it.music.audio_object; if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
    return out;
  }
  function putSongs(names, step) {   /* one song at a time, so a phone is not asked for ten downloads at once */
    var done = 0;
    return names.reduce(function (p, name) {
      return p.then(function () { return window.BioAudio.save(name); }).then(function () { done++; if (step) step(done, names.length); }, function (e) {
        if (e && (e.status === 403 || e.status === 404)) { done++; if (step) step(done, names.length); return; }   /* a song with no file in the bucket is skipped, it never blocks the rest */
        throw e;
      });
    }, Promise.resolve());
  }

  window.BioOffline = {
    ready: ready,
    isSaved: function (id) { return !!ids[id]; },
    list: all,
    get: function (id) { return run("readonly", function (s) { return s.get(id); }); },
    /* rec: { id, row, role, pos, items, members }. progress(done, total) counts the songs. Resolves when the copy and every song are on the device. */
    save: function (rec, progress) {
      var names = songsOf(rec.items);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* the browser decides */ }
      if (progress) progress(0, names.length);
      return putSongs(names, progress).then(function () {
        rec.songs = names; rec.savedAt = Date.now();
        return run("readwrite", function (s) { return s.put(rec); });
      }).then(function () { ids[rec.id] = true; });
    },
    /* an open of a saved vivencia, online: the copy is made current, quietly (new songs come down too) */
    update: function (rec) {
      if (!ids[rec.id]) return Promise.resolve();
      var names = songsOf(rec.items);
      return putSongs(names).then(function () {
        rec.songs = names; rec.savedAt = Date.now();
        return run("readwrite", function (s) { return s.put(rec); });
      }).catch(function () { /* the old copy stays as it was */ });
    },
    remove: function (id) {
      return run("readonly", function (s) { return s.get(id); }).then(function (rec) {
        if (!rec) { delete ids[id]; return; }
        return run("readwrite", function (s) { return s.delete(id); }).then(function () {
          delete ids[id];
          return all();
        }).then(function (rest) {
          var used = {}; rest.forEach(function (r) { (r.songs || []).forEach(function (n) { used[n] = true; }); });
          (rec.songs || []).forEach(function (n) { if (!used[n] && window.BioAudio && window.BioAudio.drop) window.BioAudio.drop(n); });   /* a song no other saved vivencia needs goes too */
        });
      }).catch(function () { /* nothing to remove */ });
    },
    /* what the list says now: a copy of a vivencia that is no longer there for this person goes */
    reconcile: function (keepIds) {
      var keep = {}; keepIds.forEach(function (i) { keep[i] = true; });
      return ready.then(function () { return Promise.all(Object.keys(ids).filter(function (i) { return !keep[i]; }).map(function (i) { return window.BioOffline.remove(i); })); });
    }
  };

  /* what cannot be done with no internet is not shown: the hearts, the buttons that change things (new, add, swap, remove) */
  var st = document.createElement("style");
  st.textContent = "html.bio-offline [data-like], html.bio-offline [data-likex], html.bio-offline [data-likev], html.bio-offline .rfab { display: none !important }";
  document.head.appendChild(st);
})();
