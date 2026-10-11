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

  /* הטופס: שולח ל-Worker המשותף. company הוא פח דבש. */
  var ENDPOINT = 'https://floa-lead.floa-il.workers.dev/lead';
  var form = document.getElementById('leadForm');
  var note = document.getElementById('formNote');
  if (!form) return;
  var sending = false;
  function say(msg, ok) { note.textContent = msg; note.className = 'note ' + (ok ? 'ok' : 'err'); note.hidden = false; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending) return;
    var d = new FormData(form);
    var name = (d.get('name') || '').toString().trim();
    var phone = (d.get('phone') || '').toString().trim();
    if (name.length < 2 || phone.replace(/\D/g, '').length < 9) { say('נא למלא שם וטלפון תקינים', false); return; }
    var btn = form.querySelector('button[type=submit]');
    sending = true; btn.disabled = true;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        business: 'biofamily', page: 'ביודנסה למשפחה',
        name: name, phone: phone,
        company: (d.get('company') || '').toString().trim(),
        url: window.location.href
      })
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json().catch(function () { return {}; });
    }).then(function (b) {
      if (b && b.ok === false) throw new Error('send');
      say('תודה, הפרטים התקבלו. נחזור אליכם בהקדם', true);
      form.reset();
    }).catch(function () {
      say('לא הצלחנו לשלוח. אפשר לנסות שוב בעוד רגע', false);
    }).then(function () { sending = false; btn.disabled = false; });
  });
})();
