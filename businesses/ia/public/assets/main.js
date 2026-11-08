/* ביודנסה: כניסה בגלילה, פרלקסה עדינה של השמש, וגלילה חלקה לעוגנים בלי hash בכתובת */
(function () {
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  var items = document.querySelectorAll(".rv");
  if (calm || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  var hero = document.getElementById("hero");
  var sun = document.getElementById("sun");
  if (hero && sun && !calm) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        hero.style.setProperty("--sy", Math.min(window.scrollY, 900));
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (matchMedia("(pointer: fine)").matches) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5;
        var y = (e.clientY - r.top) / r.height - 0.5;
        sun.style.setProperty("--mx", (x * -26).toFixed(1) + "px");
        sun.style.setProperty("--my", (y * -18).toFixed(1) + "px");
      });
    }
  }

  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    var t = id === "top" ? document.body : document.getElementById(id);
    if (!t) return;
    ev.preventDefault();
    var y = id === "top" ? 0 : t.getBoundingClientRect().top + window.scrollY - 24;
    window.scrollTo({ top: y, behavior: calm ? "auto" : "smooth" });
  });

  var fl = document.getElementById("float");
  var targets = [document.querySelector(".hero .cta-row"), document.getElementById("join"), document.querySelector(".sec--final")].filter(Boolean);
  if (fl && targets.length && "IntersectionObserver" in window) {
    var seen = new Set();
    var io2 = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      fl.classList.toggle("is-hidden", seen.size > 0);
    }, { threshold: 0.35 });
    targets.forEach(function (t) { io2.observe(t); });
  }
})();
