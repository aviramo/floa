/* FLOA MEDIA (apps/floa/domain/media.js, served as /media.js): the ONE client of the FLOA media store, for every business.
   It follows the client contract in worker/MEDIA.md ("Client contract"). No business name lives here: the page says it.

   LOAD
     <script src="/media.js" data-business="<b>"></script>              the business, from the tag itself
     FloaMedia.setup({ business, files, api, route, dev })                or explicitly, before the first call
       files  the public file origin        (default https://media.floa.co.il)
       api    the Worker origin             (default https://api.floa.co.il)
       route  the API route                 (default /media/)
       timeout  ms for each CDN read (index, _folders.json) and for one data() read (default 6000); dataTimeout is an alias.
                A CDN that hangs is a store that does not answer. Media files themselves (img, video, audio) have no deadline: they stream.
       dev    { manifest, base, admin }     dev mode: a local manifest instead of the store (see DEV MODE)
     The token is FLOA_AUTH.token() (/auth.js), sent only to the API, only when a session exists. Without a session NOTHING reaches the API:
     an anonymous visitor reads only the CDN (index, _folders.json, public _data, files), and a call that needs the API rejects "signin".

   API (window.FloaMedia). Keys are relative to the business: <top>/<path>, and trash/<original key>.
     ready()               resolves when url() can be called
     folders()             the public top folders: _index/_folders.json, else /_admin's public_folders, else null (unknown)
     list(prefix)          [ITEM] or null (the store is not on). A public folder reads its static index (no Worker request); a private
                           folder or trash/ is one API list per folder (staff), whose presigned urls hold until "expires".
                           Rejects { status, code }: "signin" (no session), "forbidden" (not staff), or the contract's error code.
                           ITEM: { key, name, type ("image"|"video"|"audio"), size, w, h, duration, title, copyright, trashed, url }
     url(key)              the file's address: the url its list gave, else the public address (sync)
     renew(key)            a private file's url ran out or got a 403: lists its folder again; resolves the fresh url (no per-key refresh exists)
     onRenew(fn)           fn(prefix, items) after a folder was listed again (when its "expires" passed, or by renew)
     remove(keys)          to the trash (8 per call): resolves { done: [keys], failed: [{ key, code }] } (partial success resolves too)
     restore(keys)         from the trash (the original keys; "trash/<key>" accepted): resolves { done: [original keys], failed: [{ key, code }] }
     who()                 { admin, owner, public_folders } (only with a session, once per session, kept in sessionStorage)
     isAdmin()             who().admin
     data(path, o)         a data file <top>/_data/<name>.json (only directly under a top folder): a public folder's from the CDN by name,
                           a private folder's by a staff list of "<top>/_data/" and its presigned url (see DATA FILES below).
                           o.local: the page's own copy, read in dev mode and when the store does not answer
     headers()             request headers for store files: always none (public, or presigned: a token there would break the signature)
     dev, trashed(key)     dev mode on; a key "deleted" in this tab (dev mode only)

   DEV MODE: ?dev=1, or a local host unless ?dev=0, and only when setup gave dev.manifest. The manifest (JSON):
     { base, admin, public_folders, files: { key: path under base }, lists: { "<prefix>": [ITEM] } }.
     Nothing is written: a delete or a restore is remembered in this tab. ?devbase=<url> and ?admin=0|1 override the manifest. */
(function () {
  "use strict";
  var me = document.currentScript;
  var C = { business: me && me.getAttribute("data-business") || "", files: "https://media.floa.co.il", api: "https://api.floa.co.il", route: "/media/",
    limit: 200, batch: 8, timeout: 6000, dev: null };
  var Q = new URLSearchParams(location.search);
  var LOCAL = /^(localhost|127[.]|192[.]168[.]|10[.])/.test(location.hostname);
  var TYPES = { jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", avif: "image",
    mp4: "video", webm: "video", mov: "video", m4v: "video", mp3: "audio", m4a: "audio", wav: "audio", flac: "audio", aac: "audio", ogg: "audio", oga: "audio" };

  function setup(o) {
    o = o || {}; Object.keys(o).forEach(function (k) { if (o[k] != null) C[k] = o[k]; });
    if (o.dataTimeout != null && o.timeout == null) C.timeout = o.dataTimeout;   /* the older name */
    readyP = null; return api;
  }
  /* one CDN read with the deadline: rejects { code: "timeout" } when it passes */
  function timed(u, init) {
    var ac = window.AbortController ? new AbortController() : null, t = 0;
    init = Object.assign({}, init || {}); if (ac) init.signal = ac.signal;
    var late = new Promise(function (res, rej) { t = setTimeout(function () { if (ac) ac.abort(); rej(err(0, "timeout")); }, C.timeout); });
    return Promise.race([fetch(u, init), late]).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e && e.name === "AbortError" ? err(0, "timeout") : e; });
  }
  function isDev() { return !!(C.dev && C.dev.manifest) && (Q.get("dev") === "1" || (Q.get("dev") !== "0" && LOCAL)); }
  function enc(key) { return String(key).split("/").map(encodeURIComponent).join("/"); }
  function top(key) { return String(key).split("/")[0]; }
  function slash(u) { return /\/$/.test(u) ? u : u + "/"; }
  function filesRoot() { return slash(C.files) + encodeURIComponent(C.business) + "/"; }
  function apiRoot() { return C.api.replace(/\/$/, "") + C.route + encodeURIComponent(C.business) + "/"; }
  function publicUrl(key) { return filesRoot() + enc(key); }

  var urls = {}, lists = {}, renewFns = [];   /* key -> list url; prefix -> { expires, timer }; listeners */
  function norm(x) {
    var key = String(x.key || ""), name = key.split("/").pop(), ext = (name.split(".").pop() || "").toLowerCase();
    if (x.url) urls[key] = x.url;
    return { key: key, name: name, type: x.type ? String(x.type).split("/")[0] : TYPES[ext] || "", size: x.size || 0, w: x.w || 0, h: x.h || 0,
      duration: x.duration || 0, title: x.title || "", copyright: x.copyright || "", trashed: x.trashed || "", url: x.url || "" };
  }
  function err(status, code, message, extra) { var e = { status: status, code: code || "error", message: message || "" }; if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; }); return e; }
  function fail(r) {   /* { ok:false, error:{ code, message } } */
    return r.json().catch(function () { return {}; }).then(function (d) {
      var e = d && d.error || {}; throw err(r.status, e.code || (r.status === 401 ? "unauthorized" : r.status === 403 ? "forbidden" : "error"), e.message);
    });
  }
  /* THE STORE IS NOT ON: no such route (404, 405, 501), the Worker without its store (503 not_configured: its R2 secrets are not set),
     or no answer at all (a network error, a name that does not resolve: fetch rejects with a TypeError). A staff list then resolves null,
     like a store that is not there yet. "signin" (no session) and an abort (the deadline) are not "not on": they pass through. */
  function offOrFail(r) {
    return r.json().catch(function () { return {}; }).then(function (d) {
      var e = d && d.error || {}; if (r.status === 503 && e.code === "not_configured") return null; throw err(r.status, e.code || "error", e.message);
    });
  }
  function noAnswer(e) { if (e && e.name === "TypeError") return null; throw e; }
  function token() { return window.FLOA_AUTH && FLOA_AUTH.signedIn() ? Promise.resolve(FLOA_AUTH.token()).catch(function () { return ""; }) : Promise.resolve(""); }
  function authed(path, init) {
    return token().then(function (t) {
      if (!t) throw err(401, "signin");
      init = init || {}; init.headers = Object.assign({ authorization: "Bearer " + t }, init.headers || {});
      return fetch(apiRoot() + path, init);
    });
  }
  function post(path, body) {
    return authed(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.ok ? r.json() : fail(r); })
      .then(function (d) { if (!d || d.ok === false) throw err(200, d && d.error && d.error.code, d && d.error && d.error.message); return d; });
  }
  function chunks(keys) { var out = []; for (var i = 0; i < keys.length; i += C.batch) out.push(keys.slice(i, i + C.batch)); return out; }

  /* ---- dev mode ---- */
  var man = null, gone = {}, TRASH = "floa.media.devtrash";
  try { (JSON.parse(sessionStorage.getItem(TRASH) || "[]") || []).forEach(function (k) { gone[k] = 1; }); } catch (e) { /* no storage */ }
  function keepTrash() { try { sessionStorage.setItem(TRASH, JSON.stringify(Object.keys(gone))); } catch (e) { /* no storage */ } }
  function devBase() { return slash(Q.get("devbase") || C.dev.base || man.base || "./"); }
  function devUrl(key) { var k = /^trash\//.test(key) ? key.slice(6) : key; return devBase() + enc(man.files[k] || k); }
  function devAdmin() { var a = Q.get("admin"); return a === "1" ? true : a === "0" ? false : C.dev.admin != null ? !!C.dev.admin : !!man.admin; }
  function devPublic(prefix) { return (man.public_folders || []).indexOf(top(prefix)) >= 0; }
  function devList(prefix) {
    if (!devPublic(prefix) && !devAdmin()) throw err(403, "forbidden");
    if (prefix === "trash/") {
      var known = {};
      Object.keys(man.lists).forEach(function (p) { (man.lists[p] || []).forEach(function (x) { known[x.key] = x; }); });
      return Object.keys(gone).map(function (k) { var x = norm(Object.assign({}, known[k] || {}, { key: "trash/" + k, trashed: "dev" })); x.url = urls[x.key] = devUrl(x.key); return x; });
    }
    var l = man.lists[prefix];
    if (!Array.isArray(l)) return null;
    return l.filter(function (x) { return !gone[x.key]; }).map(function (x) { var n = norm(x); n.url = urls[n.key] = devUrl(n.key); return n; });
  }

  var readyP = null;
  function ready() {
    if (!readyP) readyP = isDev() ? fetch(C.dev.manifest, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (m) { man = m || {}; man.files = man.files || {}; man.lists = man.lists || {}; return true; }) : Promise.resolve(true);
    return readyP;
  }

  /* ---- who, and the public folders ---- */
  var WHO = "floa.media.who", whoP = null, foldersP = null;
  function who() {
    return whoP || (whoP = ready().then(function () {
      if (isDev()) return { admin: devAdmin(), owner: false, public_folders: man.public_folders || [] };
      var none = { admin: false, owner: false, public_folders: null };
      if (!(window.FLOA_AUTH && FLOA_AUTH.signedIn())) return none;
      var uid = (FLOA_AUTH.userId ? FLOA_AUTH.userId() : "") + "@" + C.business;
      try { var c = JSON.parse(sessionStorage.getItem(WHO) || "null"); if (c && c.uid === uid) return c.who; } catch (e) { /* ask */ }
      return authed("_admin").then(function (r) { return r.ok ? r.json() : fail(r); }).then(function (d) {
        var w = { admin: !!(d && d.admin), owner: !!(d && d.owner), public_folders: d && Array.isArray(d.public_folders) ? d.public_folders : null };
        try { sessionStorage.setItem(WHO, JSON.stringify({ uid: uid, who: w })); } catch (e) { /* not kept */ }
        return w;
      }, function () { return none; });   /* refused (401), the store not on (503 not_configured) or no answer: treated as signed out, and not kept */
    }));
  }
  function isAdmin() { return who().then(function (w) { return w.admin; }); }
  function folders() {
    return foldersP || (foldersP = ready().then(function () {
      if (isDev()) return man.public_folders || [];
      return timed(filesRoot() + "_index/_folders.json").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })   /* 404, an error or the deadline: /_admin, else unknown */
        .then(function (d) {
          if (d && Array.isArray(d.public_folders)) return d.public_folders;
          /* the Worker only with a session: an anonymous visitor never reaches the API (the free plan's quota is all of FLOA's) */
          return token().then(function (t) { return t ? who().then(function (w) { return w.public_folders; }) : null; });
        });
    }));
  }

  /* ---- lists ---- */
  function publicList(prefix) {
    return timed(filesRoot() + "_index/" + encodeURIComponent(top(prefix)) + ".json").then(function (r) {
      if (r.status === 404) return null;   /* not a public folder, or the store is not on */
      if (!r.ok) throw err(r.status, "error");
      return r.json().then(function (d) { return (d && Array.isArray(d.items) ? d.items : []).map(norm).filter(function (x) { return x.key.indexOf(prefix) === 0; }); });
    }, function (e) { if (e && e.code === "timeout") return null; return noAnswer(e); });   /* the deadline passed, or no answer (DNS): like a 404, the store did not answer */
  }
  function privateList(prefix) {
    var out = [], pages = 0, expires = "";
    function page(cursor) {
      return authed("?prefix=" + encodeURIComponent(prefix) + "&limit=" + C.limit + (cursor ? "&cursor=" + encodeURIComponent(cursor) : "")).then(function (r) {
        if (r.status === 404 || r.status === 405 || r.status === 501) return null;
        if (r.status === 401 || r.status === 403) throw err(r.status, "forbidden");
        return r.ok ? r.json() : offOrFail(r);
      }, noAnswer).then(function (d) {
        if (d === null) return null;
        (d && Array.isArray(d.items) ? d.items : []).forEach(function (x) { out.push(norm(x)); });
        if (d && d.expires && (!expires || d.expires < expires)) expires = d.expires;
        return d && d.cursor && ++pages < 100 ? page(d.cursor) : out;
      });
    }
    return page("").then(function (l) { if (l) watch(prefix, expires); return l; });
  }
  function watch(prefix, expires) {   /* when "expires" passes, the folder is listed again and the page hears of it */
    var w = lists[prefix] || (lists[prefix] = {});
    clearTimeout(w.timer); w.expires = expires;
    var t = expires ? Date.parse(expires) - Date.now() : NaN;
    if (t > 0 && t < 2147483647) w.timer = setTimeout(function () { again(prefix); }, t);
  }
  function again(prefix) {
    var w = lists[prefix] || (lists[prefix] = {});
    if (!w.pending) w.pending = list(prefix).then(function (l) { w.pending = null; renewFns.forEach(function (fn) { try { fn(prefix, l || []); } catch (e) { /* the next one still hears */ } }); return l; },
      function (e) { w.pending = null; throw e; });
    return w.pending;
  }
  function list(prefix) {
    return ready().then(function () {
      if (isDev()) { var l = devList(prefix); if (l && !devPublic(prefix)) watch(prefix, ""); return l; }
      return folders().then(function (pub) {
        if (pub) return pub.indexOf(top(prefix)) >= 0 ? publicList(prefix) : privateList(prefix);
        return publicList(prefix).then(function (l) { return l || privateList(prefix); });   /* the folders are unknown: the index first */
      });
    });
  }
  function renew(key) {
    var prefix = Object.keys(lists).filter(function (p) { return String(key).indexOf(p) === 0; }).sort(function (a, b) { return b.length - a.length; })[0];
    if (!prefix) return Promise.resolve(url(key));
    return again(prefix).then(function () { return url(key); });
  }
  function url(key) { if (urls[key]) return urls[key]; if (isDev() && man) return devUrl(key); return publicUrl(key); }

  /* ---- writes: { ok, done, failed }; done holds the original keys ---- */
  function result(rs, strip) {
    var done = [], failed = [];
    rs.forEach(function (d) {
      (d.done || []).forEach(function (k) { if (typeof k === "string") done.push(strip ? k.replace(/^trash\//, "") : k); });
      failed = failed.concat(d.failed || []);
    });
    if (!done.length && failed.length) throw err(200, failed[0].code, "", { failed: failed, done: done });
    return { done: done, failed: failed };
  }
  function remove(keys) {
    keys = [].concat(keys).filter(Boolean);
    return ready().then(function () {
      if (isDev()) return new Promise(function (res) { setTimeout(function () { keys.forEach(function (k) { gone[k] = 1; }); keepTrash(); res({ done: keys, failed: [] }); }, 400); });
      return Promise.all(chunks(keys).map(function (c) { return post("_delete", { keys: c }); })).then(function (rs) { return result(rs, true); });
    });
  }
  function restore(keys) {
    keys = [].concat(keys).filter(Boolean);
    return ready().then(function () {
      if (isDev()) return new Promise(function (res) { setTimeout(function () { keys.forEach(function (k) { delete gone[k.replace(/^trash\//, "")]; }); keepTrash(); res({ done: keys.map(function (k) { return k.replace(/^trash\//, ""); }), failed: [] }); }, 400); });
      return Promise.all(chunks(keys).map(function (c) { return post("_restore", { keys: c }); })).then(function (rs) { return result(rs, true); });
    });
  }

  /* ---- data files (MEDIA.md "Data files", client contract items 2 and 10): <top>/_data/<name>.json, directly under a top folder ----
     public top folder   ALWAYS from the CDN by name (<files>/<b>/<top>/_data/<name>.json): never through the API, and never listed
                         (listing _data is staff only). When the public folders are unknown, it is read the same way.
     private top folder  staff only: list prefix exactly "<top>/_data/" with the token, take the item's presigned url and fetch it with
                         cache "no-store" (that url stays the same for hours). No CDN url is ever built for it. Not staff: rejects "forbidden".
     The whole read has one deadline (C.timeout, 6 s): a store that hangs is a store that does not answer.
     o.local             the page's own copy: read in dev mode, and when the store does not answer (404, an error, the deadline), but only
                         for a folder KNOWN to be public; for a private folder, or when the public folders are unknown, only for staff.
     o.public: true      the CALLER'S PROMISE that its local copy is public (it ships it under public/), so anyone may get it when the
                         store does not answer, even when the public folders are unknown. Ignored when the folder is known to be private.
                         Never pass it for a private folder's data (raw/, music/ and the like). */
  var DATA = /^([^/_][^/]*)\/_data\/[^/]+\.json$/, dataLists = {};
  function json(u, init) { return fetch(u, init).then(function (r) { if (!r.ok) throw err(r.status, r.status === 404 ? "not_found" : "error"); return r.json(); }); }
  function dataList(prefix, fresh, signal) {   /* one staff list per folder, kept until its "expires" */
    var c = dataLists[prefix];
    if (!fresh && c && (!c.expires || Date.parse(c.expires) > Date.now() + 5000)) return c.p;
    var p = authed("?prefix=" + encodeURIComponent(prefix) + "&limit=" + C.limit, { signal: signal }).then(function (r) {
      if (r.status === 404 || r.status === 405 || r.status === 501) return null;   /* the store is not on */
      if (r.status === 401 || r.status === 403) throw err(r.status, "forbidden");
      return r.ok ? r.json() : offOrFail(r);
    }, noAnswer).then(function (d) { if (d && dataLists[prefix]) dataLists[prefix].expires = d.expires || ""; return d && Array.isArray(d.items) ? d.items : null; });
    dataLists[prefix] = { p: p, expires: "" };
    p.catch(function () { delete dataLists[prefix]; });
    return p;
  }
  function privateData(path, prefix, signal) {
    function get(fresh) {
      return dataList(prefix, fresh, signal).then(function (items) {
        if (!items) throw err(404, "not_found");
        var it = items.filter(function (x) { return x && x.key === path; })[0];
        if (!it || !it.url) throw err(404, "not_found");
        return fetch(it.url, { cache: "no-store", signal: signal }).then(function (r) {
          if (r.status === 403 && !fresh) return get(true);   /* the presigned url ran out: list the same prefix again */
          if (!r.ok) throw err(r.status, r.status === 404 ? "not_found" : "error");
          return r.json();
        });
      });
    }
    return isAdmin().then(function (a) { if (!a) throw err(403, window.FLOA_AUTH && FLOA_AUTH.signedIn() ? "forbidden" : "signin"); return get(false); });
  }
  function data(path, o) {
    o = o || {};
    var m = DATA.exec(String(path || ""));
    if (!m || m[1] === "trash") return Promise.reject(err(400, "bad_path", "data files sit directly under a top folder: <top>/_data/<name>.json"));
    function local(e) {   /* the store did not answer: the page's own copy. Never for a refusal (not staff, signed out) */
      if (o.local && !(e && (e.code === "forbidden" || e.code === "signin"))) return json(o.local, { cache: "no-store" });
      throw e || err(404, "not_found");
    }
    return ready().then(function () {
      if (isDev()) {   /* dev: the page's own copy; a private folder still needs staff */
        if (devPublic(m[1])) return local();
        return isAdmin().then(function (a) { if (!a) throw err(403, "forbidden"); return local(); });
      }
      var ac = window.AbortController ? new AbortController() : null, signal = ac ? ac.signal : undefined, timer = 0;
      var late = new Promise(function (res, rej) { timer = setTimeout(function () { if (ac) ac.abort(); rej(err(0, "timeout")); }, C.timeout); });   /* also covers a hung folders() */
      var isPublic = false, isPrivate = false;   /* known to be public: only then may anyone get the page's own copy */
      var work = folders().then(function (pub) {
        isPublic = !!(pub && pub.indexOf(m[1]) >= 0); isPrivate = !!(pub && !isPublic);
        return pub && pub.indexOf(m[1]) < 0 ? privateData(path, m[1] + "/_data/", signal)   /* private: the staff list */
          : json(filesRoot() + enc(path), { signal: signal });                               /* public, or not known: the CDN by name, never the API */
      });
      return Promise.race([work, late]).then(function (d) { clearTimeout(timer); return d; }, function (e) {
        clearTimeout(timer);
        e = e && e.name === "AbortError" ? err(0, "timeout") : e;
        if (isPublic || (o.public && !isPrivate)) return local(e);   /* o.public: the caller's promise; ignored for a folder known to be private */
        /* private, or the public folders are unknown: the local copy only for staff; anyone else gets a refusal */
        return isAdmin().then(function (a) {
          if (a) return local(e);
          throw e && (e.code === "forbidden" || e.code === "signin") ? e : err(403, window.FLOA_AUTH && FLOA_AUTH.signedIn() ? "forbidden" : "signin");
        });
      });
    });
  }

  var api = { setup: setup, ready: ready, folders: folders, list: list, url: url, renew: renew, onRenew: function (fn) { renewFns.push(fn); },
    remove: remove, restore: restore, who: who, isAdmin: isAdmin, data: data, headers: function () { return Promise.resolve({}); },
    trashed: function (key) { return isDev() && !!gone[key]; } };
  Object.defineProperty(api, "dev", { get: isDev });
  window.FloaMedia = api;
})();
