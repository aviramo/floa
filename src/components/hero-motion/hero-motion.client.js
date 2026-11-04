/* ==========================================================================
   The hero film: start it, and let the copy know.

   - Plays muted and in a loop (the markup says so); `play()` is called anyway,
     because some browsers hold an autoplay until the element is on screen.
   - When it is really playing, the hero gets `is-live` and the copy arrives
     (hero-motion.css). A second is the longest anyone waits for that.
   - Off screen it is paused, so a film that nobody sees costs no battery.
   - With reduced motion it never plays: the poster is the picture, and the
     copy is simply there.
   ========================================================================== */
(function () {
  "use strict";
  var video = document.querySelector(".hero-motion-video");
  var hero = document.getElementById("hero");
  if (!video || !hero) return;

  var live = function () { hero.classList.add("is-live"); };

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    video.removeAttribute("autoplay");
    video.pause();
    live();
    return;
  }

  video.addEventListener("playing", live, { once: true });
  setTimeout(live, 1000);

  var play = function () {
    var p = video.play();
    if (p && p.catch) p.catch(live);          // autoplay refused: nothing to wait for
  };
  play();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) play(); else video.pause(); });
    }, { threshold: 0.05 }).observe(video);
  }
})();
