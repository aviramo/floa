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

  /* הכפתור הצף של וואטסאפ מופיע אחרי חצי מסך ראשון של גלילה, ונשאר */
  var fl = document.getElementById("float");
  if (fl) {
    var shown = false;
    var check = function () {
      var on = window.scrollY > window.innerHeight * 0.5;
      if (on !== shown) { shown = on; fl.classList.toggle("is-hidden", !on); }
    };
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    check();
  }
})();

/* שעון ספירה לאחור למפגש הראשון */
(function () {
  var box = document.getElementById("count");
  if (!box) return;
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
})();

/* כפתור הצטרפות: נכנס מלמטה כשפרטי המפגשים מגיע לקצה העליון, ופותח תפריט וואטסאפ */
(function () {
  var btn = document.getElementById("dockBtn"), dock = document.getElementById("dock"), join = document.getElementById("join");
  if (!btn || !dock || !join) return;
  var last = null;
  var close = function () {
    dock.classList.remove("open"); dock.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    if (last) last.focus();
  };
  var open = function (from) {
    last = from; dock.classList.add("open"); dock.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    var f = dock.querySelector("a"); if (f) f.focus();
  };
  btn.addEventListener("click", function () { open(btn); });
  document.addEventListener("click", function (e) {
    var o = e.target.closest && e.target.closest("[data-open-dock]");
    if (o) open(o);
    if (e.target.closest && e.target.closest("[data-close-dock]")) close();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dock.classList.contains("open")) close(); });
  /* נכנס מתחת ל"מוזיקה תנועה קהילה", ועם הגלילה גולש למקומו הקבוע בתחתית המסך */
  var tag = document.querySelector(".hero-tag");
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dx = 0, dy = 0, ticking = false;
  var measure = function () {
    btn.style.setProperty("--dx", "0px"); btn.style.setProperty("--dy", "0px");
    var r = btn.getBoundingClientRect(), t = tag ? tag.getBoundingClientRect() : null;
    if (!t) { dx = dy = 0; return; }
    var scrolled = window.scrollY;
    dy = (t.bottom + scrolled + 26) - (r.top + scrolled);   /* מרחק אנכי מהמקום הקבוע אל מתחת לתגיות */
    dx = (t.left + t.width / 2) - (r.left + r.width / 2);
    if (dy > 0) dy = 0;                                      /* מסך נמוך מאוד: נשאר למטה */
    place();
  };
  var place = function () {
    var p = dy === 0 ? 1 : Math.min(1, Math.max(0, window.scrollY / Math.abs(dy)));
    btn.style.setProperty("--dx", (dx * (1 - p)).toFixed(1) + "px");
    btn.style.setProperty("--dy", (dy * (1 - p)).toFixed(1) + "px");
    ticking = false;
  };
  var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(place); } };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", measure);
  btn.tabIndex = 0;
  var start = function () {
    measure();
    setTimeout(function () { btn.classList.remove("is-hidden"); }, calm ? 0 : 500);
  };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
})();

/* כפתור הצטרפות: נכנס מלמטה כשפרטי המפגשים מגיע לקצה העליון, ופותח תפריט וואטסאפ */
(function () {
  var btn = document.getElementById("dockBtn"), dock = document.getElementById("dock"), join = document.getElementById("join");
  if (!btn || !dock || !join) return;
  var last = null;
  var close = function () {
    dock.classList.remove("open"); dock.setAttribute("aria-hidden", "true");
    document.documentElement.style.overflow = "";
    if (last) last.focus();
  };
  var open = function (from) {
    last = from; dock.classList.add("open"); dock.setAttribute("aria-hidden", "false");
    document.documentElement.style.overflow = "hidden";
    var f = dock.querySelector("a"); if (f) f.focus();
  };
  document.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : e.target.parentElement;
    if (t.closest("#dockBtn, [data-open-dock]")) open(t.closest("#dockBtn, [data-open-dock]"));
    else if (t.closest("[data-close-dock]")) close();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && dock.classList.contains("open")) close(); });
  var shown = false;
  var check = function () {
    var on = join.getBoundingClientRect().top <= 0;
    if (on !== shown) { shown = on; btn.classList.toggle("is-hidden", !on); btn.tabIndex = on ? 0 : -1; }
  };
  window.addEventListener("scroll", check, { passive: true });
  window.addEventListener("resize", check);
  check();
})();

/* פס המילים: הרבה מילים, סדר אקראי בכל טעינה, ומהיר */
(function () {
  var track = document.querySelector(".marquee .track");
  if (!track) return;
  var first = track.querySelector("span");
  var icon = first ? first.querySelector("svg").outerHTML : "";
  var w = ["גוף","תנועה","מוזיקה","קהילה","חופש","שחרור","רגש","חיוניות","יצירתיות","התעלות","חיבור","אהבה","צחוק","נשימה","מבט","שייכות","חיוך","קצב","משחק","סקרנות","נוכחות","אמון","פתיחות","הקשבה","עדינות","שמחה","התחדשות","ביטחון","התרגשות","קלילות","הרפיה","איזון","חיים"];
  for (var i = w.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = w[i]; w[i] = w[j]; w[j] = t; }
  var one = w.map(function (x) { return "<span>" + x + icon + "</span>"; }).join("");
  track.innerHTML = one + one;
  var box = track.parentNode;
  box.setAttribute("aria-label", w.join(", "));
  /* מהירות קבועה בפיקסלים לשנייה, בלי קשר לכמות המילים */
  var speed = function () { track.style.setProperty("--t", Math.round(track.scrollWidth / 2 / 110) + "s"); };
  speed();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(speed);
})();
