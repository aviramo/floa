/* טל: גלילה חלקה לעוגנים בלי hash בכתובת */
document.addEventListener("click", function (ev) {
  var a = ev.target.closest && ev.target.closest('a[href^="#"]');
  if (!a) return;
  var id = a.getAttribute("href").slice(1);
  var t = id === "top" ? document.body : document.getElementById(id);
  if (!t) return;
  ev.preventDefault();
  var y = id === "top" ? 0 : t.getBoundingClientRect().top + window.scrollY - 40;
  window.scrollTo({ top: y, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
});
