/* The statistics window of the chat editor. It stands on its own: what is picked in the editor does not matter here.
   Two views in one panel:
   1. the overview: every ad ranked from the best to the weakest (the share of visits that ended in a link tap),
      for all genders together or for one gender;
   2. one ad: its numbers per gender, insights, how every option of every message did, where visitors leave,
      the common paths and every journey, for all genders or one.
   Data: public.chatbot_journeys (apps/chatbot/journeys.sql), called with the signed-in admin's token.
   Only visits from a Meta ad are recorded by the chat, so everything here comes from Facebook or Instagram.
   The window is a side panel on a wide screen and a sheet from the bottom on a phone; it slides in and out,
   and only its body scrolls. Live: fetched again every few seconds while open. */
(function () {
  'use strict';
  var SB = window.SUPABASE, AUTH = window.FLOA_AUTH;
  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var reduce = function () { return matchMedia('(prefers-reduced-motion: reduce)').matches; };
  var GN = { all: 'כל המגדרים', female: 'אישה', male: 'גבר', both: 'שני המינים' };
  var G3 = ['female', 'male', 'both'];
  var FEW = 20;   // below this many visits a percentage is not yet telling
  var ctx = null, seq = 0, timer = 0, LIVE_MS = 10000;
  var last = [], view = { ad: '', g: 'all', dg: 'all' }, overTop = 0;

  function fetchJourneys(biz) {
    return AUTH.token().then(function (t) {
      return fetch(SB.url + '/rest/v1/rpc/chatbot_journeys', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + t }, body: JSON.stringify({ p_business: biz }) })
        .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); });
    });
  }

  // one visit: the option chosen at every message, the furthest message shown, and the link tapped
  function shape(v) {
    var pick = {}, opt = {}, far = 0, cta = '';
    (v.ev || []).forEach(function (e) {
      if (e.k === 'shown' && e.s > far) far = e.s;
      if (e.k === 'option' && e.s >= 1 && e.s <= 4) { pick[e.s] = e.l || ('אפשרות ' + e.o); opt[e.s] = e.o; if (e.s > far) far = e.s; }
      if (e.k === 'cta') { cta = e.l || 'קישור'; far = 5; }
    });
    var path = []; for (var s = 1; s <= 4; s++) if (pick[s]) path.push(pick[s]);
    return { ad: v.ad, gender: v.gender, at: v.at, far: far, path: path, pick: pick, opt: opt, cta: cta };
  }

  function pct(n, of) { return of ? Math.round(n * 100 / of) : 0; }
  function sum(vs) { var a = { n: vs.length, end: 0, cta: 0 }; vs.forEach(function (v) { if (v.far >= 5) a.end++; if (v.cta) a.cta++; }); return a; }
  function ofG(vs, g) { return g === 'all' ? vs : vs.filter(function (v) { return v.gender === g; }); }
  function section(title, hint) {
    var sec = el('section', 'psec'); sec.appendChild(el('h3', '', title));
    if (hint) sec.appendChild(el('p', 'hint', hint));
    return sec;
  }
  function bar(p) { var b = el('div', 'fbar'), f = el('i'); f.style.width = p + '%'; b.appendChild(f); return b; }
  function chips(list, end, left) {
    var box = el('div', 'pchips');
    list.forEach(function (t) { box.appendChild(el('span', 'chip', t)); });
    if (end) box.appendChild(el('span', 'chip end', end));
    else if (left) box.appendChild(el('span', 'chip left', left));
    return box;
  }
  function meta(parts) { var m = el('div', 'pmeta'); parts.forEach(function (t) { m.appendChild(el('span', '', t)); }); return m; }
  function genderSeg(cur, onPick) {
    var seg = el('div', 'seg'); seg.setAttribute('role', 'tablist'); seg.setAttribute('aria-label', 'מגדר');
    ['all'].concat(G3).forEach(function (k) {
      var b = el('button', k === cur ? 'on' : '', GN[k]); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', k === cur ? 'true' : 'false');
      b.addEventListener('click', function () { onPick(k); }); seg.appendChild(b);
    });
    return seg;
  }
  function tappable(r, label, go) {
    r.classList.add('tap'); r.setAttribute('role', 'button'); r.tabIndex = 0; r.setAttribute('aria-label', label);
    r.addEventListener('click', go);
    r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  function header() {
    var detail = !!view.ad;
    $('statsBack').hidden = !detail;
    $('statsTitle').textContent = detail ? view.ad : 'סטטיסטיקה';
    $('statsSub').textContent = detail ? ((ctx.titles && ctx.titles[view.ad]) || 'פירוט המודעה') : 'כל המודעות, מהטובה לחלשה';
  }

  function draw() {
    header();
    var body = $('statsBody'); body.textContent = '';
    if (view.ad) drawAd(body); else drawAll(body);
  }

  // 1. the overview: the ads ranked
  function drawAll(body) {
    var all = last.map(shape);
    var top = section('סינון לפי מגדר'); top.appendChild(genderSeg(view.g, function (k) { view.g = k; draw(); })); body.appendChild(top);
    var vs = ofG(all, view.g), t = sum(vs);
    var by = {};
    Object.keys(ctx.titles || {}).forEach(function (k) { by[k] = []; });
    vs.forEach(function (v) { (by[v.ad] = by[v.ad] || []).push(v); });
    var list = Object.keys(by).map(function (k) { var a = sum(by[k]); a.ad = k; return a; });
    list.sort(function (x, y) {
      if (!x.n || !y.n) return y.n - x.n;
      return pct(y.cta, y.n) - pct(x.cta, x.n) || pct(y.end, y.n) - pct(x.end, x.n) || y.n - x.n;
    });
    var sec = section('דירוג המודעות, ' + GN[view.g],
      'מהטובה לחלשה לפי אחוז הביקורים שהסתיימו בלחיצה על קישור, ואחר כך לפי מי שהגיעו לסוף. הפס הוא אחוז הלוחצים. לחיצה על מודעה פותחת את כל הפירוט שלה.');
    sec.appendChild(meta(['סך הכול ' + t.n + ' ביקורים', 'הגיעו לסוף ' + pct(t.end, t.n) + '%', 'לחצו על קישור ' + t.cta + ' (' + pct(t.cta, t.n) + '%)']));
    if (!last.length) sec.appendChild(el('p', 'hint', 'אין עדיין נתונים. נספרים רק ביקורים שהגיעו ממודעה בפייסבוק או באינסטגרם.'));
    var rank = 0;
    list.forEach(function (a) {
      var r = el('div', 'prow');
      var t1 = el('div', 'frow');
      var name = el('b', 'code', (a.n ? (++rank) + '. ' : '') + a.ad); if (ctx.titles && ctx.titles[a.ad]) name.title = ctx.titles[a.ad];
      t1.appendChild(name); t1.appendChild(el('span', '', a.n + ' ביקורים')); t1.appendChild(bar(pct(a.cta, a.n)));
      r.appendChild(t1);
      if (ctx.titles && ctx.titles[a.ad]) r.appendChild(el('div', 'pmeta', ctx.titles[a.ad]));
      r.appendChild(meta(a.n ? ['הגיעו לסוף ' + pct(a.end, a.n) + '%', 'לחצו על קישור ' + a.cta + ' (' + pct(a.cta, a.n) + '%)'].concat(a.n < FEW ? ['מעט נתונים'] : []) : ['אין ביקורים' + (view.g === 'all' ? '' : ' ב' + GN[view.g])]));
      tappable(r, 'פירוט של ' + a.ad, function () { overTop = $('statsBody').scrollTop; view.ad = a.ad; view.dg = view.g; draw(); $('statsBody').scrollTop = 0; });
      sec.appendChild(r);
    });
    body.appendChild(sec);
  }

  // 2. one ad
  function drawAd(body) {
    var mine = last.map(shape).filter(function (v) { return v.ad === view.ad; });

    // per gender, side by side
    var gs = section('לפי מגדר', 'כל גרסה של המודעה בנפרד. הפס הוא אחוז הלוחצים על קישור.');
    ['all'].concat(G3).forEach(function (k) {
      var a = sum(ofG(mine, k)); if (k !== 'all' && !a.n) return;
      var r = el('div', 'prow' + (k === view.dg ? ' cur' : ''));
      var t1 = el('div', 'frow'); t1.appendChild(el('b', '', GN[k])); t1.appendChild(el('span', '', a.n + ' ביקורים')); t1.appendChild(bar(pct(a.cta, a.n)));
      r.appendChild(t1);
      r.appendChild(meta(['הגיעו לסוף ' + pct(a.end, a.n) + '%', 'לחצו על קישור ' + a.cta + ' (' + pct(a.cta, a.n) + '%)']));
      tappable(r, 'הצג ' + GN[k], function () { view.dg = k; draw(); });
      gs.appendChild(r);
    });
    body.appendChild(gs);

    var fs = section('סינון לפי מגדר'); fs.appendChild(genderSeg(view.dg, function (k) { view.dg = k; draw(); })); body.appendChild(fs);

    var vs = ofG(mine, view.dg), N = vs.length, here = ' (' + GN[view.dg] + ')';
    if (!N) {
      var em = el('div', 'empty'); em.appendChild(el('strong', '', 'אין עדיין נתונים' + here));
      em.appendChild(el('p', 'hint', 'נספרים רק ביקורים שהגיעו ממודעה בפייסבוק או באינסטגרם.'));
      body.appendChild(em); return;
    }
    var reach = [N]; for (var s = 1; s <= 5; s++) reach.push(vs.filter(function (v) { return v.far >= s; }).length);
    var ctaN = vs.filter(function (v) { return v.cta; }).length;
    var opts = options(vs);

    // insights: the plain facts worth acting on
    var ins = section('תובנות' + here, N < FEW ? 'רק ' + N + ' ביקורים, אז אלה כיוונים ולא מסקנות.' : '');
    insights(vs, reach, ctaN, opts, mine).forEach(function (t) { ins.appendChild(el('p', 'insight', t)); });
    body.appendChild(ins);

    // where they leave
    var f = section('איפה עוזבים' + here, N + ' ביקורים. כמה מהם הגיעו לכל הודעה, וכמה לחצו על קישור בסוף.');
    var steps = [['נכנסו', N]];
    for (s = 1; s <= 5; s++) steps.push(['הגיעו להודעה ' + s, reach[s]]);
    steps.push(['לחצו על קישור', ctaN]);
    steps.forEach(function (st) {
      var r = el('div', 'frow'); r.appendChild(el('span', '', st[0])); r.appendChild(el('b', '', st[1] + ' (' + pct(st[1], N) + '%)')); r.appendChild(bar(pct(st[1], N)));
      f.appendChild(r);
    });
    body.appendChild(f);

    // every option of every message: how many chose it, how many went on, how many tapped a link in the end
    var o = section('הבחירות בכל הודעה' + here, 'כמה בחרו כל אפשרות, כמה מהם המשיכו להודעה הבאה, וכמה לחצו בסוף על קישור.');
    for (s = 1; s <= 4; s++) {
      var list = opts[s]; if (!list.length) continue;
      var tot = list.reduce(function (x, y) { return x + y.n; }, 0);
      o.appendChild(el('h4', '', 'הודעה ' + s + ' (' + tot + ' בחרו)'));
      list.forEach(function (p) {
        var r = el('div', 'prow'); var t1 = el('div', 'frow');
        t1.appendChild(el('span', '', p.label)); t1.appendChild(el('b', '', p.n + ' (' + pct(p.n, tot) + '%)')); t1.appendChild(bar(pct(p.n, tot)));
        r.appendChild(t1);
        r.appendChild(meta(['המשיכו ' + pct(p.on, p.n) + '%', 'לחצו על קישור ' + pct(p.cta, p.n) + '%']));
        o.appendChild(r);
      });
    }
    var links = {}; vs.forEach(function (v) { if (v.cta) links[v.cta] = (links[v.cta] || 0) + 1; });
    var lk = Object.keys(links).sort(function (a, b) { return links[b] - links[a]; });
    if (lk.length) {
      o.appendChild(el('h4', '', 'הודעה 5: על מה לחצו (' + ctaN + ')'));
      lk.forEach(function (k) { var r = el('div', 'frow'); r.appendChild(el('span', '', k)); r.appendChild(el('b', '', links[k] + ' (' + pct(links[k], ctaN) + '%)')); r.appendChild(bar(pct(links[k], ctaN))); o.appendChild(r); });
    }
    body.appendChild(o);

    // the common paths
    var groups = {};
    vs.forEach(function (v) { if (!v.path.length) return; var k = v.path.join('\u0001'); (groups[k] = groups[k] || { path: v.path, n: 0, cta: 0 }); groups[k].n++; if (v.cta) groups[k].cta++; });
    var top = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return b.n - a.n || b.cta - a.cta; }).slice(0, 10);
    var p = section('מסלולים נפוצים' + here, 'אותן בחירות באותו סדר. עד 10 המסלולים הנפוצים.');
    if (!top.length) p.appendChild(el('p', 'hint', 'אף מבקר עוד לא בחר אפשרות.'));
    top.forEach(function (g) {
      var r = el('div', 'prow'); r.appendChild(chips(g.path));
      r.appendChild(meta([g.n + ' ביקורים', g.cta + ' לחצו על קישור (' + pct(g.cta, g.n) + '%)']));
      p.appendChild(r);
    });
    body.appendChild(p);

    // every journey, the newest first
    var j = section('כל המסעות' + here, 'כל ביקור בשורה, מהחדש לישן. עד 100 האחרונים.');
    vs.slice(0, 100).forEach(function (v) {
      var r = el('div', 'prow');
      r.appendChild(chips(v.path, v.cta ? 'לחץ: ' + v.cta : '', v.far ? 'עזב אחרי הודעה ' + v.far : 'עזב לפני ההודעה הראשונה'));
      var when = new Date(v.at).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
      r.appendChild(meta(view.dg === 'all' ? [when, GN[v.gender]] : [when]));
      j.appendChild(r);
    });
    body.appendChild(j);
  }

  // the options of messages 1 to 4, grouped by their place (the wording differs a little between the genders)
  function options(vs) {
    var out = {};
    for (var s = 1; s <= 4; s++) {
      var by = {};
      vs.forEach(function (v) {
        var o = v.opt[s]; if (!o) return;
        var b = by[o] = by[o] || { o: o, n: 0, on: 0, cta: 0, names: {} };
        b.n++; if (v.far > s) b.on++; if (v.cta) b.cta++; b.names[v.pick[s]] = (b.names[v.pick[s]] || 0) + 1;
      });
      out[s] = Object.keys(by).map(function (k) {
        var b = by[k]; b.label = Object.keys(b.names).sort(function (x, y) { return b.names[y] - b.names[x]; })[0]; return b;
      }).sort(function (a, b) { return a.o - b.o; });
    }
    return out;
  }

  function insights(vs, reach, ctaN, opts, mine) {
    var out = [], N = vs.length;
    out.push('מתוך ' + N + ' ביקורים, ' + pct(reach[5], N) + '% הגיעו להודעה האחרונה ו-' + pct(ctaN, N) + '% לחצו על קישור.');
    // the biggest loss between two points of the conversation
    var pts = reach.concat([ctaN]), worst = -1, loss = 0;
    for (var i = 0; i < pts.length - 1; i++) if (pts[i] - pts[i + 1] > loss) { loss = pts[i] - pts[i + 1]; worst = i; }
    if (worst >= 0 && loss > 0) {
      var where = worst === 0 ? 'לפני שההודעה הראשונה הופיעה' : worst === 5 ? 'בהודעה האחרונה, בלי ללחוץ על קישור' : 'אחרי הודעה ' + worst;
      out.push('הכי הרבה עוזבים ' + where + ': ' + loss + ' מתוך ' + pts[worst] + ' (' + pct(loss, pts[worst]) + '%).');
    }
    // per message: an option that leads to a link far more, or that loses people
    var avg = pct(ctaN, N);
    for (var s = 1; s <= 4; s++) {
      var ok = opts[s].filter(function (p) { return p.n >= 3; });
      if (ok.length < 2) continue;
      var best = ok.slice().sort(function (a, b) { return pct(b.cta, b.n) - pct(a.cta, a.n); })[0];
      var drop = ok.slice().sort(function (a, b) { return pct(a.on, a.n) - pct(b.on, b.n); })[0];
      if (pct(best.cta, best.n) - avg >= 10) out.push('בהודעה ' + s + ', מי שבחרו "' + best.label + '" לחצו על קישור ב-' + pct(best.cta, best.n) + '%, לעומת ' + avg + '% בממוצע.');
      if (pct(drop.on, drop.n) <= 70) out.push('בהודעה ' + s + ', אחרי "' + drop.label + '" רק ' + pct(drop.on, drop.n) + '% המשיכו. כדאי לבדוק את התשובה שהיא מקבלת.');
    }
    // the genders, when the whole ad is shown
    if (view.dg === 'all') {
      var gg = G3.map(function (k) { var a = sum(ofG(mine, k)); a.k = k; return a; }).filter(function (a) { return a.n >= 5; });
      if (gg.length > 1) {
        gg.sort(function (a, b) { return pct(b.cta, b.n) - pct(a.cta, a.n); });
        var hi = gg[0], lo = gg[gg.length - 1];
        if (pct(hi.cta, hi.n) > pct(lo.cta, lo.n)) out.push('גרסת ' + GN[hi.k] + ' עובדת הכי טוב (' + pct(hi.cta, hi.n) + '% לחצו), גרסת ' + GN[lo.k] + ' הכי חלשה (' + pct(lo.cta, lo.n) + '%).');
      }
    }
    return out;
  }

  function skeleton() {
    var body = $('statsBody'); body.textContent = '';
    for (var i = 0; i < 4; i++) body.appendChild(el('div', 'sk'));
  }

  // live: while the window is open (and the tab is visible) the data is fetched again, quietly, keeping the scroll
  function refresh() {
    var d = $('statsDlg'); if (!d.open || document.hidden || !ctx) return;
    var my = seq;
    fetchJourneys(ctx.biz).then(function (rows) {
      if (my !== seq || !d.open) return;
      last = rows || []; var body = $('statsBody'), top = body.scrollTop; draw(); body.scrollTop = top; stamp();
    }, function () {});
  }
  function stamp() { var t = $('statsLive'); if (t) t.textContent = 'מתעדכן חי, עודכן ב-' + new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

  function back() { view.ad = ''; draw(); $('statsBody').scrollTop = overTop; }

  function open(c) {
    ctx = c; var d = $('statsDlg'), my = ++seq;
    view = { ad: '', g: 'all', dg: 'all' }; overTop = 0; header();
    skeleton();
    if (!d.open) { d.showModal(); requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('in'); }); }); }
    clearInterval(timer); timer = setInterval(refresh, LIVE_MS);
    fetchJourneys(c.biz).then(function (rows) { if (my === seq) { last = rows || []; draw(); stamp(); } }, function () {
      if (my !== seq) return; var body = $('statsBody'); body.textContent = '';
      body.appendChild(el('p', 'hint', 'לא הצלחתי לטעון את הנתונים. נסו שוב בעוד רגע.'));
    });
  }
  function close() {
    var d = $('statsDlg'); if (!d.open) return;
    clearInterval(timer); timer = 0;
    d.classList.remove('in');
    if (reduce()) { d.close(); return; }
    var done = function () { d.removeEventListener('transitionend', done); clearTimeout(t); if (!d.classList.contains('in')) d.close(); };
    var t = setTimeout(done, 400); d.addEventListener('transitionend', done);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var d = $('statsDlg'); if (!d) return;
    $('statsClose').addEventListener('click', close);
    $('statsBack').addEventListener('click', back);
    // Esc: from one ad back to the overview, from the overview closes
    d.addEventListener('cancel', function (e) { e.preventDefault(); if (view.ad) back(); else close(); });
    d.addEventListener('click', function (e) { if (e.target === d) close(); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  });
  window.CHAT_STATS = { open: open, close: close };
})();
