/* The top bar's three small behaviours. None is needed for the bar to work: with
   no script it is a bar of links, always shown, with the brand drawn.

   1. the brand appears once the opening has gone off screen (the film at the top
      carries the brand's mark itself)
   2. the bar tucks away while the reader goes down and returns the moment they go
      back up, so it never sits over what is being read
   3. on a phone the links fold into a menu, which closes when one is chosen

   Reading the scroll position and toggling a class is all that happens on scroll,
   once per frame. */
(function () {
  "use strict";
  var bar = document.querySelector("[data-site-nav]");
  if (!bar) return;

  var toggle = bar.querySelector(".nav-toggle");
  var menu = bar.querySelector(".nav-links");

  /* --- 1. the brand --- */
  var hero = document.getElementById("hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      bar.classList.toggle("is-past-hero", !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(hero);
  } else {
    bar.classList.add("is-past-hero");
  }

  /* --- 3. the menu --- */
  function setOpen(open) {
    bar.classList.toggle("is-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (toggle) {
    toggle.addEventListener("click", function () { setOpen(!bar.classList.contains("is-open")); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });
  }
  if (menu) menu.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });

  /* --- 2. down hides, up shows --- */
  var lastY = window.pageYOffset;
  var queued = false;
  var TOP = 140;      // near the top it is always shown
  var STEP = 8;       // a tremble of the finger is not a direction

  function update() {
    queued = false;
    var y = window.pageYOffset;
    if (bar.classList.contains("is-open")) { lastY = y; return; }
    if (y < TOP || y < lastY - STEP) { bar.classList.remove("is-hidden"); lastY = y; }
    else if (y > lastY + STEP) { bar.classList.add("is-hidden"); lastY = y; }
  }
  window.addEventListener("scroll", function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }, { passive: true });
})();
