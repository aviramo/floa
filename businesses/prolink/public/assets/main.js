/* ProLink , interactions */
(function () {
  'use strict';

  /* ---- sticky header shadow ---- */
  var header = document.getElementById('siteHeader');
  var topbar = document.querySelector('.topbar');
  var fab = document.querySelector('.fab');
  var atBottom = false; // true while the contact form or footer is in view
  var lastY = window.scrollY || window.pageYOffset || 0;

  function updateFab() {
    var y = window.scrollY || window.pageYOffset;
    if (fab) fab.classList.toggle('show', y > 640 && !atBottom);
  }
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (header) header.classList.toggle('scrolled', y > 8);
    /* The header is fixed and always there. The utility row ABOVE it slides out
       of the way as you scroll down and returns the instant you scroll up, so
       the header rises to the very top while reading and drops back under the
       row when you come back up. */
    if (y <= 2) {
      if (topbar) topbar.classList.remove('hide');
      if (header) header.classList.remove('raised');
    } else if (y > lastY && y > 50) {          // scrolling down, past the row
      if (topbar) topbar.classList.add('hide');
      if (header) header.classList.add('raised');
    } else if (y < lastY) {                     // scrolling up
      if (topbar) topbar.classList.remove('hide');
      if (header) header.classList.remove('raised');
    }
    lastY = y;
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
    /* click anywhere outside the open menu closes it */
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
    /* and so does Escape */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
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

  /* ---- free heavy GPU layers when off-screen -----------------------------
     The hero (blurred glows, masked grid, spinning orbit) and the logo marquee
     run forever. Kept alive on off-screen layers down a very long page, they can
     exhaust mobile GPU memory and blank the viewport. Pause them the moment they
     leave the screen, resume when they return. */
  if ('IntersectionObserver' in window) {
    var pauseIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        en.target.classList.toggle('paused', !en.isIntersecting);
      });
    }, { rootMargin: '150px 0px' });
    document.querySelectorAll('.hero, .marquee').forEach(function (el) { pauseIO.observe(el); });
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

  /* Content that fades in on scroll must NOT stay hidden when you jump straight
     to a section via a hash link: without this, clicking a button to reach the
     form lands on a section whose reveal items are still opacity:0 (a blank
     screen) and offset by the reveal transform (so it does not sit at the top of
     the form). Reveal the target and everything inside it at once, on any anchor
     click and on load/hashchange, so the form is simply there when you arrive. */
  /* Reveal EVERYTHING at once. On a jump to a far section the smooth scroll flies
     past sections that are still opacity:0, and the observer cannot fade them in
     fast enough to keep up — so the journey (and the landing) shows a blank paper
     gap. When the visitor navigates by an anchor we stop animating and just show
     the whole page, so nothing along the way is ever blank. */
  function revealAll() {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }
  function revealHashTarget() {
    if (location.hash && location.hash.length > 1) revealAll();
  }
  window.addEventListener('hashchange', revealHashTarget);
  revealHashTarget();

  /* In-page navigation with a CLEAN address bar. Every #anchor click is
     intercepted: we reveal the target, smooth-scroll to it with the sticky
     header's height as the offset, and never write the #fragment to the URL.
     (An external link that already carries #… is still honoured above.) */
  function scrollToSection(el) {
    var head = document.getElementById('siteHeader');
    var tb = document.querySelector('.topbar');
    var tbH = (tb && !tb.classList.contains('hide')) ? tb.offsetHeight : 0;
    var offset = (head ? head.offsetHeight : 0) + tbH + 12;
    /* jump directly, not a long smooth glide across the whole page: over a big
       distance a smooth scroll is unreliable (it can stall part-way, leaving the
       viewport on an empty stretch) and slow. Instant lands on the target every
       time, and revealAll() above means the target is already painted. */
    var y = el.getBoundingClientRect().top + window.pageYOffset - offset;
    window.scrollTo(0, y < 0 ? 0 : y);
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href === '#') return;
    var el = document.getElementById(href.slice(1));
    if (!el) return;
    e.preventDefault();                       // keep the URL clean: no #fragment
    if (nav && nav.classList.contains('open')) {
      nav.classList.remove('open');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
    revealAll();                              // nothing blank along the scroll
    scrollToSection(el);
  });

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
