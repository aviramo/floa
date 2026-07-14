/* ==========================================================================
   FLOA service worker
   Always serve the document, CSS and JS fresh from the network (no HTTP
   cache), so a normal refresh always shows the latest version — no cache
   busting in the URL needed. Images and fonts keep normal browser caching
   for speed. Nothing is stored by the worker, so it can never serve stale
   content.
   ========================================================================== */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave fonts/CDN alone

  var path = url.pathname + url.search;
  var alwaysFresh = req.mode === "navigate" || /\.(?:css|js)(?:\?|$)/.test(path);
  if (!alwaysFresh) return; // images etc. use the normal browser cache

  event.respondWith(
    fetch(req, { cache: "no-store" }).catch(function () {
      return fetch(req); // last-resort retry
    })
  );
});
