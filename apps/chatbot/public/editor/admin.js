/* The editor of the static chat: every ad, both genders, every message, option and reply.
   Only a person signed in with Google whose email is in chatbot.admins can read or save (the chat function checks it; the page only shows what comes back).
   A save creates a new version and publishes it at once; an earlier version can be put back. The chat page reads the published version within about half a minute. */
(function () {
  'use strict';
  var SB = window.SUPABASE, AUTH = window.FLOA_AUTH;
  var EP = SB.url + '/functions/v1/chatbot';
  var q = new URLSearchParams(location.search);
  var pm = location.pathname.match(/^\/(?:chatbot\/)?([a-z0-9-]+)\/admin\/?$/);
  var BIZ = ((pm && pm[1]) || q.get('business') || 'harpatka').replace(/[^a-z0-9_-]/gi, '') || 'harpatka';
  var ADS = { opening_up: 'רוצה קרבה אבל ברגע האמת משהו בך נסגר?', stress_overload: 'הגוף כבר במיטה והראש עדיין רץ', loneliness: 'איך זה להיות מוקף באנשים ועדיין להרגיש לבד?', lost_joy: 'הכול מסודר בחיים, אז למה שום דבר כבר לא מרגש?', low_confidence: 'הכי כואב להסתכל במראה ולא לאהוב את מי שרואים' };
  var DEF = {};
  var S = { content: null, version: null, published: null, ad: q.get('ad') || '', gender: q.get('gender') === 'male' ? 'male' : 'female', dirty: false };

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function call(action, extra) {
    return AUTH.token().then(function (t) {
      return fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + t }, body: JSON.stringify(Object.assign({ business: BIZ, mode: 'script_admin', action: action }, extra || {})) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
    });
  }
  function status(text, cls) { var s = $('status'); s.textContent = text || ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  // Undo: one step back each time, for everything on the page (text, options, ads, versions). Typing is grouped into one step per pause.
  var HIST = [], CUR = '', CURV = { ad: '', g: 'female' }, tmr = null;
  function updUndo() { var b = $('undo'); if (b) { b.disabled = !HIST.length; b.setAttribute('data-n', HIST.length ? String(HIST.length) : ''); b.title = 'בטל צעד אחורה' + (HIST.length ? ' (' + HIST.length + ')' : ''); } }
  function commitNow() {
    clearTimeout(tmr); tmr = null;
    if (!S.content) return;
    var now = JSON.stringify(S.content);
    if (CUR && now !== CUR) { HIST.push({ c: CUR, ad: CURV.ad, g: CURV.g }); if (HIST.length > 200) HIST.shift(); }
    if (now !== CUR) { CUR = now; }
    CURV = { ad: S.ad, g: S.gender }; updUndo();
  }
  function commitSoon(now) { if (now) commitNow(); else { clearTimeout(tmr); tmr = setTimeout(commitNow, 700); } }
  function undo() {
    commitNow();
    var h = HIST.pop(); if (!h) return;
    S.content = JSON.parse(h.c); CUR = h.c; CURV = { ad: h.ad, g: h.g };
    S.ad = S.content.ads[h.ad] ? h.ad : Object.keys(S.content.ads)[0]; S.gender = h.g;
    render(); S.dirty = true; updUndo();
    status('בוטל. נשארו ' + HIST.length + ' צעדים אחורה');
  }
  document.addEventListener('keydown', function (e) {
    var t = e.target && e.target.tagName;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'ז') && t !== 'INPUT' && t !== 'TEXTAREA') { e.preventDefault(); undo(); }
  });
  // the only confirmation in the editor: deleting an ad. Closing the window (outside, Esc) cancels.
  function askDelete(text, ok) {
    var d = $('dlg'); $('dlgMsg').textContent = text;
    $('dlgOk').onclick = function () { d.close(); ok(); };
    d.onclick = function (e) { if (e.target === d) d.close(); };
    d.showModal();
  }
  var dtm = null;
  var DKEY = 'chatbot.draft.' + BIZ;
  function keepLocal() { try { if (S.dirty && S.content) localStorage.setItem(DKEY, JSON.stringify({ at: Date.now(), content: S.content })); } catch (e) {} }
  function dropLocal() { try { localStorage.removeItem(DKEY); } catch (e) {} }
  function readLocal() { try { return JSON.parse(localStorage.getItem(DKEY) || 'null'); } catch (e) { return null; } }
  function useDraft(content, text) {
    commitNow(); HIST.push({ c: CUR, ad: CURV.ad, g: CURV.g });
    S.content = content; CUR = JSON.stringify(content); CURV = { ad: S.ad, g: S.gender };
    if (!content.ads[S.ad]) S.ad = Object.keys(content.ads)[0];
    render(); S.dirty = true; updUndo(); status(text);
  }
  function showDraft(db) {
    var bar = $('draftbar'), loc = readLocal(), pick = null;
    var published = S.content ? JSON.stringify(S.content) : '';
    if (db && db.content && JSON.stringify(db.content) !== published) pick = { kind: 'db', d: db };
    else if (loc && loc.content && loc.content.ads && JSON.stringify(loc.content) !== published) pick = { kind: 'local', d: loc };
    if (!pick) { bar.hidden = true; return; }
    bar.textContent = '';
    var when = new Date(pick.kind === 'db' ? pick.d.at : pick.d.at).toLocaleString('he-IL');
    bar.appendChild(el('span', '', pick.kind === 'db' ? 'יש טיוטה שנשמרה ' + when + (pick.d.by ? ' על ידי ' + pick.d.by : '') : 'יש טיוטה במחשב הזה שלא נשמרה (' + when + ')'));
    var use = el('button', 'btn', 'המשך מהטיוטה'); use.type = 'button';
    use.addEventListener('click', function () { useDraft(pick.d.content, 'נטענה הטיוטה'); bar.hidden = true; });
    var del = el('button', 'btn ghost', 'התעלם'); del.type = 'button';
    del.addEventListener('click', function () { dropLocal(); bar.hidden = true; if (pick.kind === 'db') call('draft_clear'); });
    bar.appendChild(use); bar.appendChild(del); bar.hidden = false;
  }
  function saveDraft() {
    var b = $('saveDraft'); b.disabled = true; status('שומר טיוטה...');
    call('draft_save', { content: S.content }).then(function (r) {
      b.disabled = false;
      if (r.ok && r.d.ok) status('הטיוטה נשמרה (לא מפורסמת). אפשר להמשיך ממנה מכל מחשב', 'ok'); else status('הטיוטה לא נשמרה', 'err');
    }).catch(function () { b.disabled = false; status('שגיאת רשת', 'err'); });
  }
  function dirty(v, now) { if (v && PENDING) { PENDING.target[PENDING.g] = PENDING.list; PENDING = null; } S.dirty = v; if (v) { status('יש שינויים שלא נשמרו'); commitSoon(now); clearTimeout(dtm); dtm = setTimeout(keepLocal, 800); } }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // soft warnings only: the rules of the texts that reach the visitor (no dashes, no special characters, no full stop at the end)
  function warning(text, isLabel) {
    var w = [];
    if (/[–—]/.test(text)) w.push('בלי מקף ארוך');
    if (/["'״׳\/()]/.test(text.replace(/\{f:[^}]*\}/g, ''))) w.push('בלי גרשיים, סוגריים או קו נטוי');
    if (/\.\s*$/.test(text)) w.push('בלי נקודה בסוף');
    if (isLabel && text.split(/\s+/).length > 7) w.push('כפתור ארוך, ייחתך בטלפון');
    return w.join(' · ');
  }
  function bindField(node, get, set, isLabel) {
    var hint = el('div', 'warn');
    hint.textContent = warning(get(), isLabel);
    node.addEventListener('input', function () { set(node.value); hint.textContent = warning(node.value, isLabel); dirty(true); });
    var box = document.createElement('div'); box.appendChild(node); box.appendChild(hint); return box;
  }
  function fit(t) { if (!t.offsetParent) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
  function fitAll() { Array.prototype.forEach.call(document.querySelectorAll('textarea.field'), fit); }
  function area(get, set) { var t = el('textarea', 'field'); t.rows = 1; t.value = get(); t.addEventListener('input', function () { fit(t); }); return bindField(t, get, set, false); }
  function line(get, set, label) { var t = el('input', 'field'); t.type = 'text'; t.value = get(); return bindField(t, get, set, label); }

  function linkOf(o) { return o.url || DEF[o.action] || ''; }
  function link(o) {
    var t = el('input', 'field'); t.type = 'text'; t.dir = 'ltr'; t.placeholder = 'https://'; t.value = linkOf(o);
    t.addEventListener('input', function () { o.url = t.value.trim(); dirty(true); });
    return t;
  }
  function steps() { return S.content.ads[S.ad][S.gender] || null; }
  var OPEN = {}, PENDING = null, PH = null, STATS = { opens: [], shown: [], clicks: [] };
  function num(list, ad, g, step, opt) { var n = 0; list.forEach(function (x) { if (x.ad === ad && x.gender === g && (step == null || x.step === step) && (opt == null || x.opt === opt)) n += x.n; }); return n; }
  function loadStats() { return call('stats').then(function (r) { if (r.ok) { STATS = { opens: r.d.opens || [], shown: r.d.shown || [], clicks: r.d.clicks || [] }; render(); } }); }
  // live counts on the messages: fetched again every 20 seconds, and drawn only when they changed and nobody is typing
  setInterval(function () {
    if (document.hidden || !S.content) return;
    var f = document.activeElement; if (f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return;
    call('stats').then(function (r) {
      if (!r.ok) return;
      var next = { opens: r.d.opens || [], shown: r.d.shown || [], clicks: r.d.clicks || [] };
      if (JSON.stringify(next) === JSON.stringify(STATS)) return;
      var g = document.activeElement; if (g && /^(INPUT|TEXTAREA|SELECT)$/.test(g.tagName)) return;
      var y = scrollY; STATS = next; render(); scrollTo(0, y);
    });
  }, 20000);
  var KEYRE = /^[a-z][a-z0-9_]{0,29}$/;
  function pageUrl() { return location.origin + '/' + BIZ + '?ad=' + encodeURIComponent(S.ad) + (S.gender === 'both' ? '' : '&gender=' + S.gender); }
  function firstOther() { var a = S.content.ads[S.ad]; return ['female', 'male', 'both'].filter(function (g) { return g !== S.gender && a[g]; })[0] || null; }
  var GN = { female: 'אישה', male: 'גבר', both: 'שני המינים' };

  function drawAds() {
    var c = S.content, box = $('adlist'), term = $('adq').value.trim().toLowerCase(), keys = Object.keys(c.ads), shown = 0;
    box.textContent = '';
    keys.forEach(function (k) {
      var t = String(c.ads[k].ad || '');
      if (term && k.toLowerCase().indexOf(term) < 0 && t.toLowerCase().indexOf(term) < 0) return;
      shown++;
      var b = el('button', k === S.ad ? 'adi on' : 'adi'); b.type = 'button';
      b.appendChild(el('span', 'code', k)); if (t) b.appendChild(el('span', 'ttl', t));
      b.addEventListener('click', function () { S.ad = k; $('side').classList.remove('open'); $('adToggle').setAttribute('aria-expanded', 'false'); render(); });
      box.appendChild(b);
    });
    if (!shown) box.appendChild(el('p', 'hint', 'לא נמצאה מודעה'));
    $('adToggle').textContent = 'מודעה: ' + S.ad;
    $('adcount').textContent = term ? 'נמצאו ' + shown : '';
  }
  function render() {
    var y = window.scrollY;
    renderNow();
    fitAll();
    window.scrollTo(0, y);
  }
  document.addEventListener('toggle', function (e) { if (e.target && e.target.open) fitAll(); }, true);
  window.addEventListener('resize', fitAll);
  function renderNow() {
    var c = S.content;
    // the ad tabs
    drawAds();
    Array.prototype.forEach.call($('genders').children, function (b) { b.className = b.getAttribute('data-g') === S.gender ? 'on' : ''; });
    var cur = c.ads[S.ad];
    $('adcode').value = S.ad; $('adtextin').value = cur.ad || ADS[S.ad] || '';
    var opensN = num(STATS.opens, S.ad, S.gender, null, null); $('opens').textContent = 'נפתח ' + opensN + ' פעמים בגרסה הזאת';
    $('generalSum').textContent = 'ברכה: ' + String(c.greeting || '').slice(0, 40);
    $('preview').href = pageUrl() + '&fresh=' + Date.now();
    var g = $('greeting'); g.value = c.greeting || ''; g.oninput = function () { c.greeting = g.value; dirty(true); };
    var it = $('intro'); it.value = typeof c.intro === 'string' ? c.intro : ''; it.oninput = function () { c.intro = it.value; dirty(true); }; fit($('adtextin')); fit(g); fit(it);

    var box = $('steps'); box.textContent = '';
    var list = steps(), blank = false;
    PENDING = null; PH = null;
    if (!list) {
      blank = true;
      list = [0, 1, 2, 3, 4].map(function (i) { return { say: '', options: [0, 1, 2].map(function (k) { var o = { label: '', reply: '' }; if (i === 4) o.action = ['site', 'updates', 'whatsapp'][k]; return o; }) }; });
      PENDING = { target: cur, g: S.gender, list: list };
      var oth = firstOther(), flat = [];
      if (oth) cur[oth].forEach(function (m) { flat.push(m.say); m.options.forEach(function (o) { flat.push(o.label, o.reply || ''); }); });
      PH = flat;
    }
    var cut = function (t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
    list.forEach(function (m, i) {
      var id = i;   // the open and closed state belongs to the position of the message, so it stays when the ad or the gender changes
      var card = el('details', 'acc'); card.open = !!OPEN[id];
      card.addEventListener('toggle', function () { if (card.open) OPEN[id] = 1; else delete OPEN[id]; });
      var sm = el('summary'); var inner = el('span', 'sum');
      sm.appendChild(el('span', 'num', String(i + 1)));
      var shownN = num(STATS.shown, S.ad, S.gender, i + 1, null), tapsN = num(STATS.clicks, S.ad, S.gender, i + 1, null);
      var tt = el('span', 't', cut(m.say, 90)); inner.appendChild(tt);
      if (!blank) inner.appendChild(el('span', 'stat', 'הוצגה ' + shownN + ' · לחיצות ' + tapsN));
      var chips = el('span', 'chips'); inner.appendChild(chips);
      sm.appendChild(inner); card.appendChild(sm);
      var drawChips = function () { chips.textContent = ''; m.options.forEach(function (o) { chips.appendChild(el('span', 'chip', cut(o.label, 24))); }); tt.textContent = cut(m.say, 90); };
      drawChips();
      var body = el('div', 'body'), cols = el('div', 'cols');
      var first = el('div'); first.appendChild(el('label', 'lbl', i === 4 ? 'ההודעה האחרונה (קישורים)' : 'ההודעה'));
      first.appendChild(area(function () { return m.say; }, function (v) { m.say = v; drawChips(); }, 5));
      cols.appendChild(first);
      m.options.forEach(function (o, k) {
        var op = el('div', 'opt'); var oh = el('h3', '', 'אפשרות ' + (k + 1)); if (!blank) { var cn = num(STATS.clicks, S.ad, S.gender, i + 1, k + 1), sh = num(STATS.shown, S.ad, S.gender, i + 1, null); oh.appendChild(el('span', 'cnt', cn + ' לחיצות' + (sh ? ' (' + Math.round(cn * 100 / sh) + '%)' : ''))); } op.appendChild(oh);
        var row = el('div', 'row2');
        row.appendChild(line(function () { return o.label; }, function (v) { o.label = v; drawChips(); }, true));
        op.appendChild(row);
        if (i === 4) {
          op.appendChild(el('label', 'lbl', 'הקישור'));
          op.appendChild(link(o));
        } else {
          op.appendChild(el('label', 'lbl', 'התגובה לאפשרות'));
          op.appendChild(area(function () { return o.reply || ''; }, function (v) { o.reply = v; }, 3));
        }
        cols.appendChild(op);
      });
      body.appendChild(cols); card.appendChild(body);
      box.appendChild(card);
    });
    if (PH) Array.prototype.forEach.call(box.querySelectorAll('textarea, input'), function (f, n) { if (PH[n]) f.placeholder = PH[n]; });
  }

  function renderVersions(list) {
    var box = $('versions'); box.textContent = '';
    list.forEach(function (v) {
      var r = el('div', 'ver');
      r.appendChild(el('strong', '', 'גרסה ' + v.version));
      if (v.published) r.appendChild(el('span', 'tag', 'מפורסמת'));
      r.appendChild(el('span', '', new Date(v.created_at).toLocaleString('he-IL')));
      if (v.note) r.appendChild(el('span', '', v.note));
      var open = el('button', 'btn ghost', 'טען לעריכה'); open.type = 'button'; open.addEventListener('click', function () { load(v.version); });
      r.appendChild(open);
      if (!v.published) { var pub = el('button', 'btn', 'פרסם שוב'); pub.type = 'button'; pub.addEventListener('click', function () { publish(v.version); }); r.appendChild(pub); }
      box.appendChild(r);
    });
  }

  function refresh() { return call('list').then(function (r) { if (r.ok) renderVersions(r.d.versions || []); }); }
  function load(version) {
    return call('get', version ? { version: version } : {}).then(function (r) {
      if (!r.ok) { status('לא נמצא תוכן', 'err'); return; }
      var d = r.d.content;
      if (!d || !d.ads) { status('הגרסה הזאת בפורמט ישן ואי אפשר לערוך אותה כאן', 'err'); return; }
      if (S.content) { commitNow(); HIST.push({ c: CUR, ad: CURV.ad, g: CURV.g }); }
      S.content = d; S.version = r.d.version; S.published = r.d.published; CUR = JSON.stringify(d); CURV = { ad: S.ad, g: S.gender }; updUndo();
      if (!d.ads[S.ad]) S.ad = Object.keys(d.ads)[0];
      render(); dirty(false); status('נטענה גרסה ' + r.d.version + (r.d.published ? ' (מפורסמת)' : ''));
    });
  }
  function unfinished() {
    var ads = S.content.ads, ks = Object.keys(ads);
    for (var x = 0; x < ks.length; x++) for (var g in GN) {
      var st = ads[ks[x]][g]; if (!st) continue;
      for (var i = 0; i < st.length; i++) {
        var empty = !String(st[i].say || '').trim() || st[i].options.some(function (o) { return !String(o.label || '').trim(); });
        if (!empty && i === 4) empty = st[i].options.some(function (o) { return !/^https?:[/][/][^ ]+$/i.test(String(linkOf(o)).trim()); });
        if (empty) return { ad: ks[x], g: g, i: i };
      }
    }
    return null;
  }
  function save() {
    var u = unfinished();
    if (u) { S.ad = u.ad; S.gender = u.g; OPEN[u.i] = 1; render(); status('לא נשמר: ' + u.ad + ', ' + GN[u.g] + ', הודעה ' + (u.i + 1) + ' לא מלאה', 'err'); return; }
    var b = $('save'); b.disabled = true; status('שומר...');
    call('save', { content: S.content, note: $('note').value.trim() }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { status('לא נשמר: ' + (r.d.message || r.d.error || r.status), 'err'); return; }
      S.version = r.d.version; S.published = true; dirty(false); $('note').value = ''; dropLocal(); $('draftbar').hidden = true;
      status('נשמרה גרסה ' + r.d.version + ' ומפורסמת. הצ׳אט יתעדכן תוך כחצי דקה', 'ok');
      refresh();
    }).catch(function () { b.disabled = false; status('שגיאת רשת', 'err'); });
  }
  function publish(version) {
    call('publish', { version: version }).then(function (r) { if (r.ok && r.d.ok) { status('פורסמה גרסה ' + version, 'ok'); refresh(); } else status('לא פורסמה', 'err'); });
  }
  function copyOther() {
    var other = firstOther(); if (!other) return;
    var a = S.content.ads[S.ad];
    a[S.gender] = JSON.parse(JSON.stringify(a[other]));
    render(); dirty(true, true);
  }

  fetch('businesses/' + BIZ + '.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (c) {
    if (!c) return;
    DEF = { site: c.siteUrl || '', updates: c.updatesLink || '', whatsapp: c.whatsapp ? 'https://wa.me/' + c.whatsapp + '?text=' + encodeURIComponent(c.whatsappText || '') : '' };
    if (S.content) render();
  }).catch(function () {});
  function start() {
    $('signin').addEventListener('click', function () { try { sessionStorage.setItem('chatbot.admin', location.pathname + location.search); } catch (e) {} AUTH.signIn(location.origin + location.pathname + location.search); });
    Array.prototype.forEach.call($('genders').children, function (b) { b.addEventListener('click', function () { S.gender = b.getAttribute('data-g'); render(); }); });
    $('save').addEventListener('click', save);
    $('undo').addEventListener('click', undo);
    $('statsBtn').addEventListener('click', function () { var T = {}; Object.keys(S.content.ads).forEach(function (k) { T[k] = S.content.ads[k].ad || ''; }); window.CHAT_STATS.open({ biz: BIZ, ad: S.ad, gender: S.gender, gn: GN, titles: T }); });
    $('refreshStats').addEventListener('click', function () { loadStats().then(function () { status('הנתונים עודכנו', 'ok'); }); });
    $('saveDraft').addEventListener('click', saveDraft);
    $('adq').addEventListener('input', function () { drawAds(); if ($('adq').value.trim()) { $('side').classList.add('open'); $('adToggle').setAttribute('aria-expanded', 'true'); } });
    $('adToggle').addEventListener('click', function () { var s = $('side'); s.classList.toggle('open'); $('adToggle').setAttribute('aria-expanded', s.classList.contains('open') ? 'true' : 'false'); });
    $('adq').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = $('adlist').querySelector('.adi'); if (f) f.click(); } });
    $('expandAll').addEventListener('click', function () { document.querySelectorAll('#steps details').forEach(function (d) { d.open = true; }); fitAll(); });
    $('collapseAll').addEventListener('click', function () { document.querySelectorAll('#steps details').forEach(function (d) { d.open = false; }); });
    $('copyUrl').addEventListener('click', function () {
      var u = pageUrl();
      var done = function () { status('הכתובת הועתקה: ' + u, 'ok'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(done, function () { prompt('העתק ידנית', u); });
      else prompt('העתק ידנית', u);
    });
    // the title, the greeting and the opening message wrap to more lines and grow with their text
    ['adtextin', 'greeting', 'intro'].forEach(function (id) { $(id).addEventListener('input', function () { fit($(id)); }); });
    $('adtextin').addEventListener('input', function () { S.content.ads[S.ad].ad = $('adtextin').value; dirty(true); });
    $('adcode').addEventListener('change', function () {
      var v = $('adcode').value.trim(), ads = S.content.ads;
      if (v === S.ad) return;
      if (!KEYRE.test(v)) { status('קוד: אותיות קטנות באנגלית, ספרות וקו תחתון, מתחיל באות', 'err'); $('adcode').value = S.ad; return; }
      if (ads[v]) { status('כבר יש מודעה עם הקוד הזה', 'err'); $('adcode').value = S.ad; return; }
      var next = {}; Object.keys(ads).forEach(function (k) { next[k === S.ad ? v : k] = ads[k]; });
      if (S.content.defaultAd === S.ad) S.content.defaultAd = v;
      S.content.ads = next; S.ad = v; render(); dirty(true, true);
    });
    $('newAd').addEventListener('click', function () {
      var v = (prompt('קוד למודעה החדשה (אותיות קטנות באנגלית)') || '').trim();
      if (!v) return;
      if (!KEYRE.test(v) || S.content.ads[v]) { status('קוד לא תקין או שכבר קיים', 'err'); return; }
      var src = JSON.parse(JSON.stringify(S.content.ads[S.ad])); src.ad = '';
      S.content.ads[v] = src; S.ad = v; render(); dirty(true, true);
    });
    $('delAd').addEventListener('click', function () {
      var ks = Object.keys(S.content.ads);
      if (ks.length < 2) { status('אי אפשר למחוק את המודעה האחרונה', 'err'); return; }
      askDelete('למחוק את המודעה ' + S.ad + ' עם כל ההודעות שלה? אפשר לבטל עם "בטל"', function () {
        commitNow();
        delete S.content.ads[S.ad];
        if (S.content.defaultAd === S.ad) S.content.defaultAd = Object.keys(S.content.ads)[0];
        S.ad = Object.keys(S.content.ads)[0]; render(); dirty(true, true);
      });
    });
    if (!AUTH.signedIn()) { $('who').textContent = ''; return; }
    $('who').textContent = AUTH.email();
    call('list').then(function (r) {
      if (r.status === 401) { $('gateMsg').textContent = 'ההתחברות לא תקפה. נא להיכנס שוב.'; return; }
      if (r.status === 403) { $('gateMsg').textContent = 'לחשבון ' + (r.d.email || AUTH.email()) + ' אין הרשאת עריכה. ההרשאה רק למנהלים.'; $('signin').hidden = true; return; }
      if (!r.ok) { $('gateMsg').textContent = 'לא ניתן לטעון כרגע.'; return; }
      $('gate').hidden = true; $('editor').hidden = false;
      renderVersions(r.d.versions || []);
      loadStats();
      load(null).then(function () { return call('draft_get').then(function (x) { showDraft(x.ok ? x.d.draft : null); }); });
    }).catch(function () { $('gateMsg').textContent = 'שגיאת רשת.'; });
  }
  function topH() { var t = document.querySelector('.top'); if (t) document.documentElement.style.setProperty('--toph', t.offsetHeight + 'px'); }
  topH(); window.addEventListener('resize', topH);
  var bn = document.getElementById('bizName'); if (bn) bn.textContent = BIZ;
  start();
})();
