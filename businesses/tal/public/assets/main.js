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

/* הכפתור הצף נעלם כשסקשן הפנייה כבר על המסך */
(function () {
  var f = document.getElementById("float"), c = document.getElementById("contact");
  if (!f || !c || !("IntersectionObserver" in window)) return;
  new IntersectionObserver(function (es) {
    f.classList.toggle("is-hidden", es[0].isIntersecting);
  }, { threshold: 0.35 }).observe(c);
})();
