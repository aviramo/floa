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

  /* ---- contact form (opens a prefilled email; no backend needed) ---- */
  var lang = (document.documentElement.lang || 'he').slice(0, 2);
  var STR = {
    he: { fill: 'נא למלא שם, נייד ואימייל.', ok: 'תודה, נפתחה עבורכם הודעת מייל לשליחה. אפשר גם להתקשר: 03-6773370',
          subj: 'פנייה מהאתר, ', name: 'שם', company: 'חברה', role: 'תפקיד', phone: 'נייד', email: 'אימייל', message: 'הודעה' },
    en: { fill: 'Please fill in name, phone and email.', ok: 'Thanks, an email draft has opened. You can also call: 03-6773370',
          subj: 'Website enquiry, ', name: 'Name', company: 'Company', role: 'Role', phone: 'Phone', email: 'Email', message: 'Message' }
  };
  var t = STR[lang] || STR.he;

  var form = document.getElementById('leadForm');
  var note = document.getElementById('formNote');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var name = (data.get('name') || '').toString().trim();
      var phone = (data.get('phone') || '').toString().trim();
      var email = (data.get('email') || '').toString().trim();

      if (!name || !phone || !email) {
        showNote(t.fill, false);
        return;
      }

      var body =
        t.name + ': ' + name + '\n' +
        t.company + ': ' + (data.get('company') || '') + '\n' +
        t.role + ': ' + (data.get('role') || '') + '\n' +
        t.phone + ': ' + phone + '\n' +
        t.email + ': ' + email + '\n\n' +
        t.message + ':\n' + (data.get('message') || '');

      var href = 'mailto:info@prolink.co.il' +
        '?subject=' + encodeURIComponent(t.subj + name) +
        '&body=' + encodeURIComponent(body);

      window.location.href = href;
      showNote(t.ok, true);
      form.reset();
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
