/* BioFamily , interactions (shared by every page) */
(function () {
  'use strict';


  /* כפתורי "כתבו בוואטסאפ" הכלליים פותחים בחירה בין נתן לשושי (בלי JS הם פותחים את נתן) */
  var choose = document.getElementById('choose');
  if (choose && choose.showModal) {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-choose]');
      if (b) { e.preventDefault(); choose.showModal(); return; }
      if (e.target === choose || (e.target.closest && e.target.closest('.choose-opt'))) choose.close();
    });
  }

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

  /* סטריפ המילים: סדר אקראי בכל טעינה, וממלא תמיד את כל הרוחב.
     בונים רצף אחד עד שהוא רחב מהמסך, ואז מכפילים אותו פעם אחת,
     כי האנימציה זזה בדיוק חצי מהרצועה. */
  var track = document.getElementById('marqueeTrack');
  if (track) {
    var WORDS = ['תנועה', 'מוזיקה', 'משחק', 'צחוק', 'חיבור', 'יחד', 'חיבוק', 'שמחה', 'קרבה', 'ריקוד', 'קפיצות', 'סקרנות', 'אהבה', 'דמיון'];
    var shuffle = function (a) {
      a = a.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var k = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[k]; a[k] = t;
      }
      return a;
    };
    var order = shuffle(WORDS);
    var fill = function () {
      track.innerHTML = '';
      var mk = function (w) { var el = document.createElement('span'); el.textContent = w; return el; };
      var need = window.innerWidth, n = 0;
      /* חצי ראשון: מוסיפים מילים מהסדר האקראי עד שהוא רחב מהמסך */
      while ((n === 0 || track.scrollWidth < need) && n < 400) { track.appendChild(mk(order[n % order.length])); n++; }
      /* חצי שני: אותו רצף בדיוק, כדי שהלולאה תהיה חלקה */
      var kids = Array.prototype.slice.call(track.children);
      kids.forEach(function (el) { track.appendChild(el.cloneNode(true)); });
    };
    fill();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fill);
    var rt;
    window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fill, 200); });
  }

  /* כפתור וואטסאפ צף: מופיע אחרי שה-hero יצא מהמסך, ונעלם מרגע שסקשן המנחים נכנס למסך
     (משם והלאה יש כפתורים משלו, והצף רק כפול) */
  var fab = document.getElementById('fab');
  if (fab) {
    var hero = document.querySelector('.hero');
    var hosts = document.getElementById('hosts');
    var upd = function () {
      var heroGone = hero ? hero.getBoundingClientRect().bottom < 0 : window.pageYOffset > 300;
      var pastHosts = hosts ? hosts.getBoundingClientRect().top < window.innerHeight : false;
      fab.classList.toggle('show', heroGone && !pastHosts);
    };
    window.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }

  /* המפגש הבא: אחרי שעבר, השורה נעלמת ונשארים "ימי שלישי" */
  var next = document.getElementById('nextEvent');
  if (next) {
    var until = Date.parse(next.getAttribute('data-until'));
    if (until && Date.now() > until) next.hidden = true;
  }
})();
