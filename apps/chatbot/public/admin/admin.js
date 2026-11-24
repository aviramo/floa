/* The editor of the static chat: every ad, both genders, every message, option and reply.
   Only a person signed in with Google whose email is in chatbot.admins can read or save (the chat function checks it; the page only shows what comes back).
   A save creates a new version and publishes it at once; an earlier version can be put back. The chat page reads the published version within about half a minute. */
(function () {
  'use strict';
  var SB = window.SUPABASE, AUTH = window.FLOA_AUTH;
  var EP = SB.url + '/functions/v1/chatbot';
  var q = new URLSearchParams(location.search);
  var BIZ = (q.get('business') || 'harpatka').replace(/[^a-z0-9_-]/gi, '') || 'harpatka';
  var ADS = { opening_up: 'רוצה קרבה אבל ברגע האמת משהו בך נסגר?', stress_overload: 'הגוף כבר במיטה והראש עדיין רץ', loneliness: 'איך זה להיות מוקף באנשים ועדיין להרגיש לבד?', lost_joy: 'הכול מסודר בחיים, אז למה שום דבר כבר לא מרגש?', low_confidence: 'הכי כואב להסתכל במראה ולא לאהוב את מי שרואים' };
  var ACTIONS = { site: 'האתר', updates: 'קבוצת העדכונים בוואטסאפ', whatsapp: 'כתיבה להדר ואופיר' };
  var S = { content: null, version: null, published: null, ad: q.get('pain') || 'opening_up', gender: q.get('gender') === 'male' ? 'male' : 'female', dirty: false };

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

  function call(action, extra) {
    return AUTH.token().then(function (t) {
      return fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB.anonKey, Authorization: 'Bearer ' + t }, body: JSON.stringify(Object.assign({ business: BIZ, mode: 'script_admin', action: action }, extra || {})) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); });
    });
  }
  function status(text, cls) { var s = $('status'); s.textContent = text || ''; s.className = 'status' + (cls ? ' ' + cls : ''); }
  function dirty(v) { S.dirty = v; if (v) status('יש שינויים שלא נשמרו'); }
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
  function area(get, set, rows) { var t = el('textarea', 'field'); t.rows = rows || 3; t.value = get(); return bindField(t, get, set, false); }
  function line(get, set, label) { var t = el('input', 'field'); t.type = 'text'; t.value = get(); return bindField(t, get, set, label); }

  function steps() { var a = S.content.ads[S.ad]; return a[S.gender]; }

  function render() {
    var c = S.content;
    // the ad tabs
    var ads = $('ads'); ads.textContent = '';
    Object.keys(c.ads).forEach(function (k) { var b = el('button', k === S.ad ? 'on' : '', k.replace(/_/g, ' ')); b.type = 'button'; b.addEventListener('click', function () { S.ad = k; render(); }); ads.appendChild(b); });
    Array.prototype.forEach.call($('genders').children, function (b) { b.className = b.getAttribute('data-g') === S.gender ? 'on' : ''; });
    $('adtext').textContent = c.ads[S.ad].ad || ADS[S.ad] || '';
    $('preview').href = '/harpatka?pain=' + encodeURIComponent(S.ad) + '&gender=' + S.gender + '&fresh=' + Date.now();
    var g = $('greeting'); g.value = c.greeting || ''; g.oninput = function () { c.greeting = g.value; dirty(true); };

    var box = $('steps'); box.textContent = '';
    steps().forEach(function (m, i) {
      var card = el('section', 'card step');
      var h = el('h2'); h.appendChild(document.createTextNode('הודעה ' + (i + 1))); h.appendChild(el('small', '', i === 4 ? 'האחרונה: שלוש הפעולות' : 'שלוש אפשרויות ותגובה לכל אחת'));
      card.appendChild(h);
      card.appendChild(el('label', 'lbl', 'ההודעה (אפשר ירידת שורה)'));
      card.appendChild(area(function () { return m.say; }, function (v) { m.say = v; }, 4));
      var opts = el('div', 'opts');
      m.options.forEach(function (o, k) {
        var op = el('div', 'opt');
        op.appendChild(el('label', 'lbl', 'אפשרות ' + (k + 1)));
        var row = el('div', i === 4 ? 'row act' : 'row');
        row.appendChild(line(function () { return o.label; }, function (v) { o.label = v; }, true));
        if (i === 4) {
          var sel = el('select', 'field');
          Object.keys(ACTIONS).forEach(function (a) { var opt = el('option', '', ACTIONS[a]); opt.value = a; if (o.action === a) opt.selected = true; sel.appendChild(opt); });
          sel.addEventListener('change', function () { o.action = sel.value; dirty(true); });
          row.appendChild(sel);
        }
        op.appendChild(row);
        op.appendChild(el('label', 'lbl', i === 4 ? 'תגובה בלחיצה (לא חובה)' : 'התגובה לאפשרות הזאת'));
        op.appendChild(area(function () { return o.reply || ''; }, function (v) { o.reply = v; }, 2));
        opts.appendChild(op);
      });
      card.appendChild(opts);
      box.appendChild(card);
    });
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
    if (S.dirty && !confirm('יש שינויים שלא נשמרו. לטעון בכל זאת?')) return Promise.resolve();
    return call('get', version ? { version: version } : {}).then(function (r) {
      if (!r.ok) { status('לא נמצא תוכן', 'err'); return; }
      var d = r.d.content;
      if (!d || !d.ads) { status('הגרסה הזאת בפורמט ישן ואי אפשר לערוך אותה כאן', 'err'); return; }
      S.content = d; S.version = r.d.version; S.published = r.d.published;
      if (!d.ads[S.ad]) S.ad = Object.keys(d.ads)[0];
      render(); dirty(false); status('נטענה גרסה ' + r.d.version + (r.d.published ? ' (מפורסמת)' : ''));
    });
  }
  function save() {
    var b = $('save'); b.disabled = true; status('שומר...');
    call('save', { content: S.content, note: $('note').value.trim() }).then(function (r) {
      b.disabled = false;
      if (!r.ok) { status('לא נשמר: ' + (r.d.message || r.d.error || r.status), 'err'); return; }
      S.version = r.d.version; S.published = true; dirty(false); $('note').value = '';
      status('נשמרה גרסה ' + r.d.version + ' ומפורסמת. הצ׳אט יתעדכן תוך כחצי דקה', 'ok');
      refresh();
    }).catch(function () { b.disabled = false; status('שגיאת רשת', 'err'); });
  }
  function publish(version) {
    if (!confirm('לפרסם שוב את גרסה ' + version + '?')) return;
    call('publish', { version: version }).then(function (r) { if (r.ok && r.d.ok) { status('פורסמה גרסה ' + version, 'ok'); refresh(); } else status('לא פורסמה', 'err'); });
  }
  function copyOther() {
    var other = S.gender === 'female' ? 'male' : 'female';
    if (!confirm('להחליף את כל ההודעות של ' + (S.gender === 'female' ? 'אישה' : 'גבר') + ' במודעה הזאת בעותק מ' + (other === 'female' ? 'אישה' : 'גבר') + '?')) return;
    var a = S.content.ads[S.ad];
    a[S.gender] = JSON.parse(JSON.stringify(a[other]));
    render(); dirty(true);
  }

  function start() {
    $('signin').addEventListener('click', function () { try { sessionStorage.setItem('chatbot.admin', location.search || '?business=' + BIZ); } catch (e) {} AUTH.signIn(location.origin + location.pathname + location.search); });
    Array.prototype.forEach.call($('genders').children, function (b) { b.addEventListener('click', function () { S.gender = b.getAttribute('data-g'); render(); }); });
    $('save').addEventListener('click', save);
    $('copyOther').addEventListener('click', copyOther);
    if (!AUTH.signedIn()) { $('who').textContent = ''; return; }
    $('who').textContent = AUTH.email();
    call('list').then(function (r) {
      if (r.status === 401) { $('gateMsg').textContent = 'ההתחברות לא תקפה. נא להיכנס שוב.'; return; }
      if (r.status === 403) { $('gateMsg').textContent = 'לחשבון ' + (r.d.email || AUTH.email()) + ' אין הרשאת עריכה. ההרשאה רק למנהלים.'; $('signin').hidden = true; return; }
      if (!r.ok) { $('gateMsg').textContent = 'לא ניתן לטעון כרגע.'; return; }
      $('gate').hidden = true; $('editor').hidden = false;
      renderVersions(r.d.versions || []);
      load(null);
    }).catch(function () { $('gateMsg').textContent = 'שגיאת רשת.'; });
  }
  start();
})();
