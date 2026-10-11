/* BioFamily , interactions (shared by every page) */
(function () {
  'use strict';

  /* חשיפה בגלילה */
  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  /* עוגנים בתוך הדף: גלילה חלקה בלי hash בשורת הכתובת */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    var el = id && id !== 'top' ? document.getElementById(id) : document.body;
    if (!el) return;
    e.preventDefault();
    var y = id === 'top' ? 0 : el.getBoundingClientRect().top + window.pageYOffset - 16;
    window.scrollTo({ top: y, behavior: 'smooth' });
  });

  /* הגעה מדף אחר עם #signup ("שמירת מקום" בדף ביודנסה): גוללים בלי להשאיר hash */
  if (location.hash) {
    var target = document.getElementById(location.hash.slice(1));
    if (target) {
      history.replaceState(null, '', location.pathname + location.search);
      setTimeout(function () {
        window.scrollTo({ top: target.getBoundingClientRect().top + window.pageYOffset - 16, behavior: 'smooth' });
      }, 60);
    }
  }

  /* המפגש הבא: אחרי שעבר, השורה נעלמת ונשארים "ימי שלישי" */
  var next = document.getElementById('nextEvent');
  if (next) {
    var until = Date.parse(next.getAttribute('data-until'));
    if (until && Date.now() > until) next.hidden = true;
  }
})();
