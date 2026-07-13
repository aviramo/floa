/* The sticky mobile CTA appears only after the visitor has scrolled past the
   hero, and disappears whenever the contact form is on screen — so it never
   covers the very ask it points at. No-ops when the dock isn't on the page. */
(function () {
  "use strict";
  var dock = document.querySelector("[data-cta-dock]");
  if (!dock) return;

  var hero = document.getElementById("hero");
  var contact = document.getElementById("contact");
  var pastHero = !hero;      // no hero → treat as already passed
  var atContact = false;

  function update() {
    var show = pastHero && !atContact;
    dock.classList.toggle("is-visible", show);
    document.body.classList.toggle("cta-dock-active", show);
  }

  if (!("IntersectionObserver" in window)) { pastHero = true; update(); return; }

  if (hero) {
    new IntersectionObserver(function (entries) {
      pastHero = !entries[0].isIntersecting;   // hero fully out of view
      update();
    }, { threshold: 0 }).observe(hero);
  }
  if (contact) {
    new IntersectionObserver(function (entries) {
      atContact = entries[0].isIntersecting;   // form is on screen
      update();
    }, { threshold: 0 }).observe(contact);
  }

  update();
})();
