/* ביודנסה: הצבע נכנס בטעינה, כניסה בגלילה, שעון ספירה לאחור, גלילה חלקה בלי hash, וכפתור צף */
(function () {
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* הצבע נכנס: רגע אחרי הציור הראשון */
  var hero = document.getElementById("hero");
  if (hero) requestAnimationFrame(function () { requestAnimationFrame(function () { hero.classList.add("go"); }); });

  /* כניסה בגלילה */
  var items = document.querySelectorAll(".rv");
  if (calm || !("IntersectionObserver" in window)) {
    items.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* שעון ספירה לאחור למפגש הראשון */
  var box = document.getElementById("count");
  if (box) {
    var to = new Date(box.getAttribute("data-to")).getTime();
    var cells = {};
    box.querySelectorAll("[data-u]").forEach(function (b) { cells[b.getAttribute("data-u")] = b; });
    var pad = function (n) { return n < 10 ? "0" + n : String(n); };
    var tick = function () {
      var s = Math.max(0, Math.floor((to - Date.now()) / 1000));
      cells.d.textContent = pad(Math.floor(s / 86400));
      cells.h.textContent = pad(Math.floor(s % 86400 / 3600));
      cells.m.textContent = pad(Math.floor(s % 3600 / 60));
      cells.s.textContent = pad(s % 60);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* גלילה חלקה לעוגנים בלי hash בכתובת */
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

  /* הכפתור הצף מופיע אחרי חצי מסך ראשון, ונעלם כשסקשן הפנייה על המסך */
  var f = document.getElementById("float"), c = document.getElementById("contact");
  if (f) {
    var past = false, atContact = false;
    var apply = function () { f.classList.toggle("is-hidden", !past || atContact); };
    var onScroll = function () { past = window.scrollY > window.innerHeight * 0.5; apply(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (c && "IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { atContact = es[0].isIntersecting; apply(); }, { threshold: 0.3 }).observe(c);
    }
    onScroll();
  }
})();
