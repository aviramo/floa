/* Biodanza service worker: the app opens with no internet.

   It keeps the app SHELL only (the page and the scripts and styles it is made of). Data and songs are not here: the saved vivencias
   live in IndexedDB (assets/offline.js) and the songs in audio.js's own store.

   The document: from the network when there is one (so a new version arrives as always), from the shell when there is not, or when
   the network is too slow to wait for. A stamped file (?v=) never changes under its address, so it is served from here first.
   An unstamped file of the domain (/kit.css, /sheet.js, /auth.js, /supabase.js, the icons) is asked of the network first, and the
   copy here is the fallback. The fonts (another origin) are kept the same way. Everything else (the database, the songs' API) is
   left to the browser: this worker never answers for it.

   Served at the host's root on biodanza.floa.co.il (scope "/"), and under /biodanza/ on localhost. */
var CACHE = "biodanza-shell-v7";   /* v2: /layout.js joined the kit's files (sheet.js needs it); v3: /swipe.js joined them; v4: /audio.js (the sound engine) joined them; v5: /print.js (the print shell) joined them; v6: /live.js (the live data layer) joined them; v7: /app.js (the app's state) joined them. A new name, so no phone mixes an old shell with new kit files */
var SCOPE = self.registration.scope;   /* "https://biodanza.floa.co.il/" or "http://localhost:5173/biodanza/" */
var FIXED = ["kit.css", "layout.js", "sheet.js", "auth.js", "supabase.js", "sound.js", "menu.js", "card.js", "section.js", "tabs.js", "swipe.js", "list.js", "field.js", "search.js", "range.js", "audio.js", "print.js", "live.js", "app.js", "icons.svg", "favicon.ico", "favicon.png", "apple-touch-icon.png"];
/* the domain's files live at the root of the host, the app's own files under the scope */
function rootUrl(name) { return new URL("/" + name, SCOPE).href; }

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    /* the page names its stamped scripts: read them from it, so the shell is complete after the first visit */
    var doc = fetch(SCOPE, { cache: "reload" }).then(function (r) {
      if (!r.ok) throw new Error("page " + r.status);
      return Promise.all([keepShell(r.clone()), r.text()]);
    }).then(function (pair) {
      var found = (pair[1].match(/assets\/[\w.\-]+\.(?:js|css)\?v=\w+/g) || []);
      return found.map(function (a) { return new URL(a, SCOPE).href; });
    }).catch(function () { return []; });
    return doc.then(function (assets) {
      var urls = assets.concat(FIXED.map(function (n) { return n === "favicon.ico" || n === "favicon.png" || n === "apple-touch-icon.png" ? new URL(n, SCOPE).href : rootUrl(n); }));
      return Promise.all(urls.map(function (u) { return fetch(u, { cache: "reload" }).then(function (r) { if (r.ok) return cache.put(u, r); }).catch(function () { /* one missing file does not stop the rest */ }); }));
    });
  }).then(function () { if (!self.registration.active) return self.skipWaiting(); }));   /* the first install takes over at once; a NEW version waits, and the kit (/app.js) offers "רענון" (ui/docs/app-version.md): an open tab never runs new files under old code */
});

/* the person pressed "רענון": the waiting version takes over now (the kit then loads the page once, on controllerchange) */
self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf("biodanza-shell-") === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

/* keep a copy; of a stamped file only the newest stamp stays */
function store(req, res) {
  if (!res || !(res.ok || res.type === "opaque")) return res;   /* a font's stylesheet from another origin comes back opaque */
  var copy = res.clone(), url = new URL(req.url);
  caches.open(CACHE).then(function (cache) {
    if (/[?&]v=/.test(url.search)) {
      cache.keys().then(function (keys) { keys.forEach(function (k) { var u = new URL(k.url); if (u.origin === url.origin && u.pathname === url.pathname && u.search !== url.search) cache.delete(k); }); });
    }
    return cache.put(req, copy);
  }).catch(function () { /* full or blocked: it is only not kept */ });
  return res;
}
function fromCache(key) { return caches.match(key); }
/* the page is kept as a plain response with no address of its own: a copy that remembers it came from /<vivencia> would make the browser
   open that address when it is served for another one */
function keepShell(res) {
  return res.blob().then(function (blob) {
    return caches.open(CACHE).then(function (c) { return c.put(SCOPE, new Response(blob, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })); });
  }).catch(function () { /* not kept this time */ });
}
function withTimeout(promise, ms) {
  return new Promise(function (res, rej) { var t = setTimeout(function () { rej(new Error("slow")); }, ms); promise.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); }); });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);

  if (url.origin !== self.location.origin) {   /* the fonts: kept, and refreshed in the background */
    if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
      event.respondWith(caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { if (r && (r.ok || r.type === "opaque")) store(req, r); return r; }).catch(function () { return hit; });
        return hit || net;
      }));
    }
    return;
  }
  if (!url.pathname.startsWith(new URL(SCOPE).pathname) && !/^\/(kit\.css|sheet\.js|auth\.js|supabase\.js|icons\.svg|favicon\.(ico|png|svg)|apple-touch-icon\.png)$/.test(url.pathname)) return;

  if (/^(music|catalog14)(\/|$)/.test(url.pathname.slice(new URL(SCOPE).pathname.length))) return;   /* the songs page is its own page: never the app shell, never kept as it */

  if (req.mode === "navigate") {   /* any address of the app is the same page: the app reads the address itself */
    event.respondWith(withTimeout(fetch(req), 6000).then(function (r) {
      if (r.ok && /text\/html/.test(r.headers.get("content-type") || "")) keepShell(r.clone());
      return r;
    }).catch(function () { return fromCache(SCOPE).then(function (hit) { return hit || fetch(req); }); }));
    return;
  }

  if (/[?&]v=/.test(url.search)) {   /* a stamped file: never changes under its address */
    event.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req).then(function (r) { return store(req, r); }, function () { return caches.match(url.origin + url.pathname, { ignoreSearch: true }).then(function (old) { return old || Response.error(); }); }); }));   /* no internet and a stamp never seen (the sprite after a new build): the copy kept of the same file */
    return;
  }

  if (/\.(?:css|js|ico|png|svg)$/.test(url.pathname)) {   /* the domain's files and the icons: the network first, the copy when there is none */
    event.respondWith(fetch(req).then(function (r) { return store(req, r); }).catch(function () { return caches.match(req).then(function (hit) { return hit || Response.error(); }); }));
  }
});
