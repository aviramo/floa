/* טל: גלילה חלקה לעוגנים בלי hash בכתובת */
document.addEventListener("click", function (ev) {
  var a = ev.target.closest && ev.target.closest('a[href^="#"]');
  if (!a) return;
  var id = a.getAttribute("href").slice(1);
  var t = id === "top" ? document.body : document.getElementById(id);
  if (!t) return;
  ev.preventDefault();
  var y = id === "top" ? 0 : t.getBoundingClientRect().top + window.scrollY - 16;
  window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});

/* הכפתור הצף מופיע אחרי חצי מסך ראשון של גלילה, ונעלם כשסקשן הפנייה כבר על המסך */
(function () {
  var f = document.getElementById("float"), c = document.getElementById("contact");
  if (!f) return;
  var past = false, atContact = false;
  var apply = function () { f.classList.toggle("is-hidden", !past || atContact); };
  var onScroll = function () { past = window.scrollY > window.innerHeight * 0.5; apply(); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  if (c && "IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { atContact = es[0].isIntersecting; apply(); }, { threshold: 0.35 }).observe(c);
  }
  onScroll();
})();
