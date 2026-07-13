/* Anything with .reveal fades up as it enters the viewport, once. */
(function () {
  "use strict";
  var items = document.querySelectorAll(".reveal");
  if (!items.length) return;

  var show = function (el) { el.classList.add("in-view"); };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach(show);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, i) {
      if (!entry.isIntersecting) return;
      setTimeout(function () { show(entry.target); }, Math.min(i * 60, 180));   // a stagger, not a queue
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  items.forEach(function (el) { io.observe(el); });
})();
