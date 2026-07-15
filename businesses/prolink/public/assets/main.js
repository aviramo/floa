/* ProLink , interactions */
(function () {
  'use strict';

  /* ---- sticky header shadow ---- */
  var header = document.getElementById('siteHeader');
  var fab = document.querySelector('.fab');
  var atBottom = false; // true while the contact form or footer is in view

  function updateFab() {
    var y = window.scrollY || window.pageYOffset;
    if (fab) fab.classList.toggle('show', y > 640 && !atBottom);
  }
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('scrolled', y > 8);
    updateFab();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Hide the floating button once the contact section OR the footer is on screen
     , it must never cover the form or the footer's bottom line. Both are watched
     so it stays hidden all the way down, not just over the form. */
  var zones = [document.getElementById('contact'), document.querySelector('.footer')].filter(Boolean);
  if (zones.length && 'IntersectionObserver' in window) {
    var showing = new Set();
    var zoneObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) showing.add(en.target); else showing.delete(en.target);
      });
      atBottom = showing.size > 0;
      updateFab();
    }, { threshold: 0 });
    zones.forEach(function (z) { zoneObserver.observe(z); });
  }

  /* ---- mobile nav ---- */
  var toggle = document.getElementById('navToggle');
  var nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- duplicate marquee content for a seamless loop ---- */
  var track = document.getElementById('marqueeTrack');
  if (track) {
    track.innerHTML += track.innerHTML;
  }

  /* ---- reveal on scroll + staggered grids ---- */
  document.querySelectorAll('.grid').forEach(function (grid) {
    Array.prototype.forEach.call(grid.children, function (child, i) {
      if (child.classList.contains('reveal')) child.style.setProperty('--d', i % 4);
    });
  });

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- animated stat counters ---- */
  function animateCount(el) {
    if (el.dataset.plain) return; // leave literal numbers like 1996 / 27001
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    if (isNaN(target)) return;
    var dur = 1300, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target + suffix;
    }
    requestAnimationFrame(step);
  }
  var counters = document.querySelectorAll('.stat b[data-count]');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---- contact form: posts the lead to the shared Worker ------------------
     ProLink has a look of its own, but it shares ONE thing with every other
     business on the domain: the endpoint that turns a lead into an email. The
     Worker holds the Resend key, routes by the `business` field to ProLink's own
     inbox, and stores nothing. `company` is the honeypot, sent empty by a human
     and dropped by the server if a bot fills it. */
  var LANG = (document.documentElement.lang || 'he').slice(0, 2);
  var MSG = {
    he: { need: 'נא למלא שם וטלפון תקינים.', ok: 'תודה, הפרטים התקבלו. נחזור אליכם בהקדם.', err: 'לא הצלחנו לשלוח. אפשר לנסות שוב או להתקשר: 03-6773370' },
    en: { need: 'Please fill in a valid name and phone.', ok: 'Thanks, we got your details and will get back to you shortly.', err: 'We could not send it. Please try again or call 03-6773370.' }
  };
  var M = MSG[LANG] || MSG.he;
  var LEAD_ENDPOINT = 'https://floa-lead.floa-il.workers.dev/lead';

  var form = document.getElementById('leadForm');
  var note = document.getElementById('formNote');
  if (form) {
    var sending = false;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (sending) return;

      var data = new FormData(form);
      var name = (data.get('name') || '').toString().trim();
      var phone = (data.get('phone') || '').toString().trim();
      if (name.length < 2 || phone.replace(/[^\d]/g, '').length < 9) {
        showNote(M.need, false);
        return;
      }

      var payload = {
        business: 'prolink',
        page: 'פרולינק',
        name: name,
        phone: phone,
        email: (data.get('email') || '').toString().trim(),
        org: (data.get('org') || '').toString().trim(),
        role: (data.get('role') || '').toString().trim(),
        message: (data.get('message') || '').toString().trim(),
        company: (data.get('company') || '').toString().trim(), // honeypot
        url: window.location.href
      };

      var btn = form.querySelector('button[type="submit"]');
      sending = true;
      if (btn) btn.disabled = true;

      fetch(LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json().catch(function () { return {}; });
      }).then(function (b) {
        if (b && b.ok === false) throw new Error(b.error || 'send');
        showNote(M.ok, true);
        form.reset();
      }).catch(function () {
        showNote(M.err, false);
      }).then(function () {
        sending = false;
        if (btn) btn.disabled = false;
      });
    });
  }
  function showNote(msg, ok) {
    if (!note) return;
    note.textContent = msg;
    note.className = 'form-note ' + (ok ? 'ok' : 'err');
    note.hidden = false;
  }

  /* ---- smooth-close any hash jump offset handled by CSS scroll-margin ---- */
})();
