/* ==========================================================================
   In-page navigation.

   Native anchor jumps are unreliable here: the browser fixes the scroll
   destination at click time, then web fonts swap and lazy images resolve ABOVE
   the target, the page grows, and the landing drifts. So we compute the
   destination ourselves and re-check it once the page settles.

   Nothing is written to the URL — no #hash is ever appended.
   ========================================================================== */
(function () {
  "use strict";
  var GAP = 40;   // air left above a section's content after a jump

  /* A top bar that hides on the way down and shows on the way up covers the top of
     the page only when the jump goes UP: going down it is already out of the way.
     So the bar's height is added to the air only for an upward jump. */
  function barHeight() {
    var bar = document.querySelector("[data-site-nav]");
    return bar ? bar.offsetHeight : 0;
  }

  /* where a section should come to rest: its first real content, GAP below the
     top of the viewport (and below the bar, when it will be showing) — not its
     border box, which would leave the section's whole top padding as dead space */
  function destinationFor(target, up) {
    var anchor = target.querySelector(".container > *") || target;
    var top = anchor.getBoundingClientRect().top + window.pageYOffset - GAP - (up ? barHeight() : 0);
    return Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));
  }

  function scrollToTarget(target) {
    var up = destinationFor(target, false) < window.pageYOffset;
    var interrupted = false;
    var stop = function () { interrupted = true; };
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });

    window.scrollTo({
      top: destinationFor(target, up),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });

    // the page may still be growing above the target (fonts, lazy images), so
    // re-measure after the smooth scroll settles and correct any drift
    [800, 1400, 2200].forEach(function (delay) {
      setTimeout(function () {
        if (interrupted) return;
        var want = destinationFor(target, up);
        if (Math.abs(window.pageYOffset - want) > 4) window.scrollTo({ top: want, behavior: "auto" });
      }, delay);
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    var id = link.getAttribute("href");
    if (!id || id === "#") return;                 // WhatsApp links are rewritten elsewhere

    link.addEventListener("click", function (e) {
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();                          // keeps the hash out of the URL
      scrollToTarget(target);
    });
  });
})();
