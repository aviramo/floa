/* The statistics window of the chat editor: where visitors drop off, the common paths, and every journey.
   Data: public.chatbot_journeys (apps/chatbot/journeys.sql), called with the signed-in admin's token.
   Only visits from a Meta ad are recorded by the chat, so everything here comes from Facebook or Instagram.
   The window is a side panel on a wide screen and a sheet from the bottom on a phone; it slides in and out,
   and only its body scrolls. */
(function () {
  'use strict';
  var SB = window.SUPABASE, AUTH = window.FLOA_AUTH;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var reduce = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var ctx = null, seq = 0;

  function fetchJourneys(biz) {
    return AUTH.token().then(function (t) {
      return fetch(SB.url + '/rest/v1/rpc/chatbot_journeys', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + t }, body: JSON.stringify({ p_business: biz }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
    });
  }

  // one visit: the last option chosen at every message, the furthest message shown, and the link tapped
  function shape(v) {
    var pick = {}, far = 0, cta = '';
    (v.ev || []).forEach(function (e) {
      if (e.k === 'shown' && e.s > far) far = e.s;
      if (e.k === 'option' && e.s >= 1 && e.s <= 4) { pick[e.s] = e.l || ('אפשרות ' + e.o); if (e.s > far) far = e.s; }
      if (e.k === 'cta') { cta = e.l || 'קישור'; far = 5; }
    });
    var path = []; for (var s = 1; s <= 4; s++) if (pick[s]) path.push(pick[s]);
    return { at: v.at, far: far, path: path, cta: cta };
  }

  function section(title, hint) {
    var sec = el('section', 'psec'); sec.appendChild(el('h3', '', title));
    if (hint) sec.appendChild(el('p', 'hint', hint));
    return sec;
  }
  function pct(n, of) { return of ? Math.round(n * 100 / of) : 0; }
  function chips(list, end, left) {
    var box = el('div', 'pchips');
    list.forEach(function (t) { box.appendChild(el('span', 'chip', t)); });
    if (end) box.appendChild(el('span', 'chip end', end));
    else if (left) box.appendChild(el('span', 'chip left', left));
    return box;
  }

  function draw(rows) {
    var body = $('statsBody'); body.textContent = '';
    compare(body, rows || []);
    var vs = (rows || []).filter(function (v) { return v.ad === ctx.ad && v.gender === ctx.gender; }).map(shape);
    var here = ' (' + ctx.ad + ', ' + ctx.gn[ctx.gender] + ')';
    if (!vs.length) {
      var em = el('div', 'empty');
      em.appendChild(el('strong', '', 'אין עדיין נתונים ל-' + ctx.ad + ', ' + ctx.gn[ctx.gender]));
      em.appendChild(el('p', 'hint', 'נספרים רק ביקורים שהגיעו ממודעה בפייסבוק או באינסטגרם, בגרסה ' + ctx.gn[ctx.gender] + '.'));
      body.appendChild(em); return;
    }
    var N = vs.length;

    // 1. the funnel: how many got to each message, and how many tapped a link at the end
    var f = section('איפה עוזבים' + here, N + ' ביקורים. כמה מהם הגיעו לכל הודעה, וכמה לחצו על קישור בסוף.');
    var steps = [['נכנסו', N]];
    for (var s = 1; s <= 5; s++) steps.push(['הגיעו להודעה ' + s, vs.filter(function (v) { return v.far >= s; }).length]);
    steps.push(['לחצו על קישור', vs.filter(function (v) { return v.cta; }).length]);
    steps.forEach(function (st) {
      var r = el('div', 'frow'); r.appendChild(el('span', '', st[0])); r.appendChild(el('b', '', st[1] + ' (' + pct(st[1], N) + '%)'));
      var bar = el('div', 'fbar'), fill = el('i'); fill.style.width = pct(st[1], N) + '%'; bar.appendChild(fill); r.appendChild(bar);
      f.appendChild(r);
    });
    body.appendChild(f);

    // 2. the common paths: the same choices in the same order
    var groups = {};
    vs.forEach(function (v) { if (!v.path.length) return; var k = v.path.join('\u0001'); (groups[k] = groups[k] || { path: v.path, n: 0, cta: 0 }); groups[k].n++; if (v.cta) groups[k].cta++; });
    var top = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.n - a.n || b.cta - a.cta; }).slice(0, 10);
    var p = section('מסלולים נפוצים' + here, 'אותן בחירות באותו סדר. עד 10 המסלולים הנפוצים.');
    if (!top.length) p.appendChild(el('p', 'hint', 'אף מבקר עוד לא בחר אפשרות.'));
    top.forEach(function (g) {
      var r = el('div', 'prow'); r.appendChild(chips(g.path));
      var m = el('div', 'pmeta'); m.appendChild(el('span', '', g.n + ' ביקורים')); m.appendChild(el('span', '', g.cta + ' לחצו על קישור (' + pct(g.cta, g.n) + '%)'));
      r.appendChild(m); p.appendChild(r);
    });
    body.appendChild(p);

    // 3. every journey, the newest first
    var j = section('כל המסעות' + here, 'כל ביקור בשורה, מהחדש לישן. עד 100 האחרונים.');
    vs.slice(0, 100).forEach(function (v) {
      var r = el('div', 'prow');
      r.appendChild(chips(v.path, v.cta ? 'לחץ: ' + v.cta : '', v.far ? 'עזב אחרי הודעה ' + v.far : 'עזב לפני ההודעה הראשונה'));
      var m = el('div', 'pmeta'); m.appendChild(el('span', '', new Date(v.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })));
      r.appendChild(m); j.appendChild(r);
    });
    body.appendChild(j);
  }

  // 0. the ads side by side: visits, how many got to the end, how many tapped a link; each gender under its ad
  function compare(body, rows) {
    var by = {};
    Object.keys(ctx.titles || {}).forEach(function (k) { by[k] = { ad: k, n: 0, end: 0, cta: 0, g: {} }; });
    rows.forEach(function (r) {
      var v = shape(r), a = by[r.ad] = by[r.ad] || { ad: r.ad, n: 0, end: 0, cta: 0, g: {} };
      var g = a.g[r.gender] = a.g[r.gender] || { n: 0, cta: 0 };
      a.n++; g.n++; if (v.far >= 5) a.end++; if (v.cta) { a.cta++; g.cta++; }
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return y.n - x.n || (x.ad < y.ad ? -1 : 1); });
    var sec = section('השוואה בין המודעות', 'סקירה של כל המודעות, כל המגדרים יחד. הפס הוא אחוז הביקורים שהסתיימו בלחיצה על קישור.');
    if (!rows.length) { sec.appendChild(el('p', 'hint', 'אין עדיין נתונים. נספרים רק ביקורים שהגיעו ממודעה בפייסבוק או באינסטגרם.')); body.appendChild(sec); return; }
    list.forEach(function (a) {
      var r = el('div', 'prow' + (a.ad === ctx.ad ? ' cur' : ''));
      var t = el('div', 'frow'); var name = el('b', 'code', a.ad); if (ctx.titles && ctx.titles[a.ad]) name.title = ctx.titles[a.ad];
      t.appendChild(name); t.appendChild(el('span', '', a.n + ' ביקורים'));
      var bar = el('div', 'fbar'), fill = el('i'); fill.style.width = pct(a.cta, a.n) + '%'; bar.appendChild(fill); t.appendChild(bar);
      r.appendChild(t);
      var m = el('div', 'pmeta'); m.appendChild(el('span', '', 'הגיעו לסוף ' + pct(a.end, a.n) + '%')); m.appendChild(el('span', '', 'לחצו על קישור ' + a.cta + ' (' + pct(a.cta, a.n) + '%)'));
      r.appendChild(m);
      var gs = ['female', 'male', 'both'].filter(function (k) { return a.g[k]; }).map(function (k) { return ctx.gn[k] + ': ' + a.g[k].n + ' ביקורים, ' + pct(a.g[k].cta, a.g[k].n) + '% לחצו'; });
      if (gs.length) r.appendChild(el('div', 'pmeta', gs.join(' · ')));
      sec.appendChild(r);
    });
    body.appendChild(sec);
  }

  function skeleton() {
    var body = $('statsBody'); body.textContent = '';
    for (var i = 0; i < 4; i++) body.appendChild(el('div', 'sk'));
  }

  function open(c) {
    ctx = c; var d = $('statsDlg'), my = ++seq;
    $('statsSub').textContent = 'כל המודעות, ומתחת המודעה הפתוחה בעורך';
    skeleton();
    if (!d.open) { d.showModal(); requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('in'); }); }); }
    fetchJourneys(c.biz).then(function (rows) { if (my === seq) draw(rows); }, function () {
      if (my !== seq) return; var body = $('statsBody'); body.textContent = '';
      body.appendChild(el('p', 'hint', 'לא הצלחתי לטעון את הנתונים. נסו שוב בעוד רגע.'));
    });
  }
  function close() {
    var d = $('statsDlg'); if (!d.open) return;
    d.classList.remove('in');
    if (reduce()) { d.close(); return; }
    var done = function () { d.removeEventListener('transitionend', done); clearTimeout(t); if (!d.classList.contains('in')) d.close(); };
    var t = setTimeout(done, 400); d.addEventListener('transitionend', done);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var d = $('statsDlg'); if (!d) return;
    $('statsClose').addEventListener('click', close);
    d.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
  });
  window.CHAT_STATS = { open: open, close: close };
})();
