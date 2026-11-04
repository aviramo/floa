/* ==========================================================================
   The hero film: load and start the one that is on the page, and let the copy know.

   - There are two films (wide and tall) and CSS shows one. Only that one is told
     to load, so the other costs nothing.
   - When it is really playing, the hero gets `is-live` and the copy arrives
     (hero-motion.css). A second is the longest anyone waits for that.
   - Off screen it is paused, so a film nobody sees costs no battery.
   - With reduced motion it never plays: the poster is the picture, and the copy
     is simply there.
   ========================================================================== */
(function () {
  "use strict";
  var videos = document.querySelectorAll(".hero-motion-video");
  var hero = document.getElementById("hero");
  if (!videos.length || !hero) return;

  var live = function () { hero.classList.add("is-live"); };
  var onPage = function () {
    for (var i = 0; i < videos.length; i++) if (videos[i].offsetParent !== null) return videos[i];
    return null;
  };

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { live(); return; }

  var current = null, seen = true;
  var start = function () {
    var v = onPage();
    if (v !== current) { if (current) current.pause(); current = v; }
    if (!current) return live();
    if (!seen) return;
    current.preload = "auto";
    current.addEventListener("playing", live, { once: true });
    var p = current.play();
    if (p && p.catch) p.catch(live);          // autoplay refused: nothing to wait for
  };
  start();
  setTimeout(live, 1000);

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      seen = entries.some(function (e) { return e.isIntersecting; });
      if (seen) start(); else if (current) current.pause();
    }, { threshold: 0.05 }).observe(hero.querySelector(".hero-motion"));
  }
  if (window.matchMedia) {
    var mq = window.matchMedia("(max-width: 640px)");
    if (mq.addEventListener) mq.addEventListener("change", start); else mq.addListener(start);
  }
})();
