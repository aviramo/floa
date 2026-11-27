/* The music of the catalog, played from the private bucket, through the kit's sound engine (/audio.js, ui/docs/player.md).

   This file is only what is Biodanza's: where a song's file is (the Worker, asked WITH the signed-in token, so it is never a link a
   person could pass on), the names it is kept and remembered under, the names of the events app.js listens to (bioaudio, biofail,
   biobusy), the lock screen's album, and the numbers that get the equalizer's ring. Everything that plays (crossfade, mix, fades,
   one download per file, the next song ahead, kept files, media session, volume) is the kit's.

   A song with a file gets a sound button (the same round icon button as every other); a song without one keeps the YouTube button. */
(function () {
  "use strict";
  var API = "https://api.floa.co.il/biodanza/audio/";
  window.BioAudio = window.RosterAudio.create({
    url: function (name) { return API + name; },
    headers: function () { return FLOA_AUTH.token().then(function (t) { return { authorization: "Bearer " + t }; }); },
    store: "biodanza-audio",   /* the IndexedDB the songs are kept in: the same name as always, so a phone keeps the songs it already has */
    key: "biodanza",           /* biodanza.volume, biodanza.last */
    events: { state: "bioaudio", fail: "biofail", busy: "biobusy" },
    album: "ביודנסה",
    /* the lock screen's picture: the app's own favicon.png, beside assets/ (resolved from this script, so the main page and /music/ both reach it) */
    artwork: new URL("../favicon.png", (document.currentScript && document.currentScript.src) || location.href).href,
    waitCards: ".rcard[data-song]",   /* a song card with no play button of its own (a tap on it plays): it shows the wait too */
    /* the ring of the equalizer: the number of the exercise that plays (the tab on a phone, the button to it in the header of a vivencia on a computer) */
    rings: function () {
      var t = [].slice.call(document.querySelectorAll(".bio-tab.is-play > .bio-tab__n"));
      var g = document.querySelector("#vgo:not([hidden]) #vgon"); if (g) t.push(g);
      return t;
    }
  });
})();
