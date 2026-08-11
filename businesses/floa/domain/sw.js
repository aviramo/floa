/* ==========================================================================
   FLOA service worker

   THE DOCUMENT COMES FRESH OFF THE NETWORK. EVERYTHING ELSE IS CACHED BY ITS
   OWN ADDRESS. Every stylesheet and script this domain serves carries `?v=`
   and a stamp of its own contents: the engine writes one into every page it
   renders (see build.mjs), and the chords shell, which is written by hand, is
   stamped the same way at build time (see businesses/chords/pages/render.js).
   An address that changes whenever the file changes needs no help from here,
   so the browser is left to cache it.

   THIS USED TO FORCE `no-store` ON EVERY CSS AND JS AS WELL. That was written
   before the stamps existed and it was right then. It is not right now: the
   cost of it is a whole app downloaded again on every single visit, which on
   the chords app is around 380KB over the wire per address opened, and on a
   phone that is seconds of a page sitting there with only its seed markup on
   the screen while a script it already has comes down the line again.

   A file with no stamp on it, /supabase.js at the root among them, is still
   fetched fresh, so the keys in it can never be a version behind.

   Nothing is stored by the worker itself, so it can never serve stale content
   of its own.
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

  /* A version on the address is a promise that the address changes when the
     file does, and the browser's own cache is the right place for a promise
     like that. Without one, the address stays the same while the file behind
     it moves, and that is the case this worker exists for. */
  var stamped = /[?&]v=/.test(url.search);
  var asset = /\.(?:css|js)$/.test(url.pathname);
  var alwaysFresh = req.mode === "navigate" || (asset && !stamped);
  if (!alwaysFresh) return; // images, fonts and stamped assets: normal caching

  event.respondWith(
    fetch(req, { cache: "no-store" }).catch(function () {
      return fetch(req); // last-resort retry
    })
  );
});
