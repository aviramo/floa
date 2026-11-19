/* Vivencias kept on this device, to be seen and played with no internet.

   A saved vivencia is a copy of what the app reads for it: its row in the list, its exercises (with the texts and the songs that
   come embedded), the people it is shared with, and the audio of every song in it (kept by audio.js, in its own store, so the same
   player plays them). Everything is read-only offline: the copy is never written back.
   The copies live in IndexedDB ('biodanza-offline'), not in localStorage: the audio alone is far too big for that. */
(function () {
  "use strict";
  var dbp = null, ids = {}, syncing = null, syncAgain = false;
  /* what makes two copies the same: everything but when it was kept */
  function sig(r) { try { return JSON.stringify([r.row && r.row.title, r.role, r.pos, r.items, r.members, r.reception]); } catch (e) { return Math.random() + ""; } }
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

  function songsOf(items, extra) {
    var seen = {}, out = [];
    var add = function (m) { var n = m && m.audio_object; if (n && !seen[n]) { seen[n] = 1; out.push(n); } };
    (extra || []).forEach(function (x) { add(x.music); });   /* the songs of the start and of the end of the vivencia */
    (items || []).forEach(function (it) { add(it.music); (it.item_music_options || []).forEach(function (o) { add(o.music); }); });   /* the chosen song and all the options of every exercise */
    return out;
  }
  var prog = { done: 0, total: 0 };
  function emit(state, reason) { try { document.dispatchEvent(new CustomEvent("biooffline", { detail: { state: state || "run", reason: reason || "", done: prog.done, total: prog.total } })); } catch (e) { /* nobody listens */ } }
  function putSongs(names, step) {   /* three songs at a time: faster than one, and a phone is not asked for ten downloads at once */
    var i = 0, failed = null;
    function ok() { if (step) step(); }
    function next() {
      if (i >= names.length || failed) return Promise.resolve();
      var name = names[i++];
      return window.BioAudio.save(name).then(ok, function (e) {
        if (e && (e.status === 403 || e.status === 404)) ok();   /* a song with no file in the bucket is skipped, it never blocks the rest */
        else failed = failed || e;
      }).then(next);
    }
    return Promise.all([next(), next(), next()]).then(function () { if (failed) throw failed; });
  }

  window.BioOffline = {
    ready: ready,
    isSaved: function (id) { return !!ids[id]; },
    list: all,
    get: function (id) { return run("readonly", function (s) { return s.get(id); }); },
    /* rec: { id, row, role, pos, items, members }. progress(done, total) counts the songs. Resolves when the copy and every song are on the device. */
    save: function (rec, progress) {
      var names = songsOf(rec.items, rec.reception);
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* the browser decides */ }
      if (progress) progress(0, names.length);
      return putSongs(names, progress).then(function () {
        rec.songs = names; rec.savedAt = Date.now();
        return run("readwrite", function (s) { return s.put(rec); });
      }).then(function () { ids[rec.id] = true; });
    },
    /* an open of a saved vivencia, online: the copy is made current, quietly (new songs come down too) */
    update: function (rec) {
      var names = songsOf(rec.items, rec.reception);
      return putSongs(names).then(function () {
        rec.songs = names; rec.savedAt = Date.now();
        return run("readwrite", function (s) { return s.put(rec); });
      }).then(function () { ids[rec.id] = true; }).catch(function () { /* the old copy stays as it was */ });
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

    /* ALWAYS kept: at every open (and when the app comes back to the screen or online) the cloud is compared with the device.
       list: the vivencias the cloud says this person has; load(v) -> the record to keep for one (null when it cannot be read now).
       A copy that differs is replaced, a missing one is made, a copy the cloud no longer has is deleted, and a song no kept
       vivencia uses (also one only played once) is deleted, so nothing stays here that is not in the cloud. */
    sync: function (list, load) {
      if (syncing) { syncAgain = true; return syncing; }
      prog = { done: 0, total: 0 }; emit("start");
      syncing = ready.then(function () { return all(); }).then(function (stored) {
        var have = {}; stored.forEach(function (r) { have[r.id] = r; });
        return list.reduce(function (p, v) {
          return p.then(function () { return load(v); }).then(function (rec) {
            if (!rec) return;
            var old = have[v.id], names = songsOf(rec.items, rec.reception);
            var same = old && sig(old) === sig(rec);
            return (same ? Promise.all(names.map(function (n) { return window.BioAudio.kept(n); })).then(function (k) { return k.every(Boolean) ? "same" : "songs"; }) : Promise.resolve("new")).then(function (what) {
              if (what === "same") return;
              prog.total += names.length; emit(); return putSongs(names, function () { prog.done++; emit(); }).then(function () { rec.songs = names; rec.savedAt = Date.now(); return run("readwrite", function (s) { return s.put(rec); }); }).then(function () { ids[rec.id] = true; });
            }).catch(function () { /* the copy that was here stays until the next time */ });
          }, function () { /* this one could not be read now: its old copy stays */ });
        }, Promise.resolve());
      }).then(function () {
        var keep = {}; list.forEach(function (v) { keep[v.id] = true; });
        return all().then(function (rows) {
          var gone = rows.filter(function (r) { return !keep[r.id]; });
          return Promise.all(gone.map(function (r) { return run("readwrite", function (s) { return s.delete(r.id); }).then(function () { delete ids[r.id]; }); })).then(function () { return all(); });
        });
      }).then(function (rows) {   /* songs: only those a kept vivencia holds stay on the device */
        var used = {}; rows.forEach(function (r) { (r.songs || []).forEach(function (n) { used[n] = true; }); });
        if (!window.BioAudio || !BioAudio.names) return;
        return BioAudio.names().then(function (names) { names.forEach(function (n) { if (!used[n]) BioAudio.drop(n); }); });
      }).then(function () { emit("done"); }, function (e) { emit("stopped", e && e.name); }).then(function () {
        syncing = null;
        if (syncAgain) { syncAgain = false; }
      });
      return syncing;
    },
    /* the list-level facts (title, my role, my place) of kept copies follow the list the screen holds; true when a vivencia has no copy yet (the caller then asks for a full sync) */
    patchRows: function (vivs) {
      return ready.then(function () { return all(); }).then(function (rows) {
        var by = {}, missing = false; rows.forEach(function (r) { by[r.id] = r; });
        var puts = [];
        vivs.forEach(function (v) {
          var r = by[v.id]; if (!r) { missing = true; return; }
          if ((r.row && r.row.title) !== v.title || r.role !== v.role || r.pos !== v.pos) { r.row = Object.assign({}, r.row, { title: v.title, updated_at: v.updated_at }); r.role = v.role; r.pos = v.pos; puts.push(run("readwrite", function (s) { return s.put(r); })); }
        });
        return Promise.all(puts).then(function () { return missing || rows.some(function (r) { return !vivs.some(function (v) { return v.id === r.id; }); }); });
      }).catch(function () { return false; });
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
