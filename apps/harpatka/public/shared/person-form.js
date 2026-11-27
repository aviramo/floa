/* שדות הפרטים האישיים: אלמנט אחד לכל הטפסים באתר (פופאפ ההרשמה והשארת פרטים, הרשמה ועריכת פרטים באזור האישי).
   שם פרטי, שם משפחה, טלפון, גיל ומגדר: כולם חובה, עם אותן בדיקות ואותן הודעות שגיאה.
   תכונות autocomplete (given-name, family-name, tel, sex) גורמות לדפדפן (כרום וכו') להציע בעמידה על שדה את הפרטים השמורים בחשבון גוגל ולמלא אוטומטית; הגיל נשאר ידני.
   שימוש: PersonForm.html('first', opts) לכל שדה (הפריסה בעמוד), PersonForm.bind(root), PersonForm.validate(root), PersonForm.serverError(root, code), PersonForm.fill(root, values). */
(function () {
  var LABEL = { first: 'שם פרטי', last: 'שם משפחה', phone: 'טלפון', age: 'גיל', gender: 'מגדר' };
  var AC = { first: 'given-name', last: 'family-name', phone: 'tel', age: 'off', gender: 'sex' };
  var NAME = { first: 'given-name', last: 'family-name', phone: 'tel', age: 'age', gender: 'sex' };
  var MSG = { name: 'נא למלא שם פרטי ושם משפחה', phone: 'מספר לא תקין', age: 'גיל לא תקין', gender: 'נא לבחור מגדר' };
  var ERR_FOR = { first: 'name', last: 'name', phone: 'phone', age: 'age', gender: 'gender' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* מספר ישראלי שמתחיל ב-0, או מספר עם + (E.164); מחזיר +972... או '' כשלא תקין. זהה ל-harpatka_normalize_phone ב-SQL */
  function normPhone(raw) {
    var s = String(raw || '').trim();
    if (!s) return '';
    var plus = s[0] === '+', d = s.replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('00') === 0) { plus = true; d = d.slice(2); }
    var IL = /^(5\d{8}|7\d{8}|[23489]\d{7})$/;
    if (plus) {
      if (d.indexOf('9720') === 0) d = '972' + d.slice(4);
      if (d.length < 8 || d.length > 15 || d[0] === '0') return '';
      if (d.indexOf('972') === 0 && !IL.test(d.slice(3))) return '';
      return '+' + d;
    }
    if (d[0] === '0') return IL.test(d.slice(1)) ? '+972' + d.slice(1) : '';
    return '';
  }

  /* html(kind, opts): kind = first | last | phone | age | gender. שדה אחד בכל האתר: קו תחתון ותווית צפה (העיצוב ב-shared/person-form.css).
     opts: id (מזהה האלמנט), value (ערך התחלתי), attr (תכונות נוספות), autofocus */
  function html(kind, o) {
    o = o || {};
    var id = o.id || ('pf' + kind), v = o.value == null ? '' : o.value, ctl;
    var common = ' id="' + id + '" data-pf="' + kind + '" name="' + NAME[kind] + '" autocomplete="' + AC[kind] + '" class="pf-input" required' + (o.autofocus ? ' data-autofocus' : '') + (o.attr ? ' ' + o.attr : '');
    if (kind === 'gender') {
      ctl = '<select' + common + '><option value=""' + (v ? '' : ' selected') + ' disabled hidden></option><option value="male"' + (v === 'male' ? ' selected' : '') + '>זכר</option><option value="female"' + (v === 'female' ? ' selected' : '') + '>נקבה</option></select>';
    } else {
      var type = kind === 'phone' ? 'tel' : kind === 'age' ? 'number' : 'text';
      var extra = kind === 'phone' ? ' inputmode="tel" dir="ltr" maxlength="24"' : kind === 'age' ? ' inputmode="numeric" min="18" max="99"' : ' maxlength="40"';
      ctl = '<input type="' + type + '"' + common + extra + ' placeholder=" "' + (v !== '' ? ' value="' + esc(v) + '"' : '') + '>';
    }
    return '<label class="pf-field" for="' + id + '"><span>' + LABEL[kind] + '</span>' + ctl + '</label>';
  }
  /* הודעת שגיאה: name (לשני שמות), phone, age, gender */
  function err(kind, cls) { return '<div data-pf-err="' + kind + '" class="' + (cls || 'pf-err') + '" role="alert"></div>'; }

  function el(root, kind) { return root.querySelector('[data-pf="' + kind + '"]'); }
  function setErr(root, kind, msg) {
    var box = root.querySelector('[data-pf-err="' + kind + '"]'); if (box) box.textContent = msg || '';
    (kind === 'name' ? ['first', 'last'] : [kind]).forEach(function (k) { var e = el(root, k); if (e) e.classList.toggle('bad', !!msg); });
  }
  function clearAll(root) { ['name', 'phone', 'age', 'gender'].forEach(function (k) { setErr(root, k, ''); }); }

  /* מנקה את השגיאה של שדה כשמתחילים לתקן אותו */
  function bind(root) {
    ['first', 'last', 'phone', 'age', 'gender'].forEach(function (k) {
      var e = el(root, k); if (!e || e.dataset.pfBound) return; e.dataset.pfBound = '1';
      e.addEventListener(k === 'gender' ? 'change' : 'input', function () { setErr(root, ERR_FOR[k], ''); });
    });
  }

  function read(root) {
    var g = function (k) { var e = el(root, k); return e ? String(e.value || '').trim() : ''; };
    var first = g('first').replace(/\s+/g, ' '), last = g('last').replace(/\s+/g, ' '), raw = g('phone'), ageS = g('age');
    return { first: first, last: last, phoneRaw: raw, phone: normPhone(raw), age: ageS === '' ? NaN : parseInt(ageS, 10), gender: g('gender') || null };
  }

  /* בדיקה אחת לכולם: כל השדות חובה. מחזיר { ok, v } ומציג שגיאות ליד השדות */
  function validate(root) {
    var v = read(root), ok = true;
    if (v.first.length < 2 || v.last.length < 2) { setErr(root, 'name', MSG.name); var f = el(root, 'first'), l = el(root, 'last'); if (f) f.classList.toggle('bad', v.first.length < 2); if (l) l.classList.toggle('bad', v.last.length < 2); ok = false; } else setErr(root, 'name', '');
    if (!v.phone) { setErr(root, 'phone', MSG.phone); ok = false; } else setErr(root, 'phone', '');
    if (!(v.age >= 18 && v.age <= 99)) { setErr(root, 'age', MSG.age); ok = false; } else setErr(root, 'age', '');
    if (v.gender !== 'male' && v.gender !== 'female') { setErr(root, 'gender', MSG.gender); ok = false; } else setErr(root, 'gender', '');
    return { ok: ok, v: v };
  }

  /* קוד שגיאה מהשרת ← הודעה ליד השדה המתאים. מחזיר true אם טופל */
  function serverError(root, code) {
    var map = { invalid_name: 'name', invalid_phone: 'phone', invalid_age: 'age', invalid_gender: 'gender' };
    if (!map[code]) return false;
    setErr(root, map[code], MSG[map[code]]); return true;
  }

  /* ממלא ערכים (עריכת פרטים, או שם מחשבון גוגל). שדה שכבר יש בו ערך לא נדרס אלא אם force */
  function fill(root, vals, force) {
    var set = function (k, v) { var e = el(root, k); if (e && v != null && v !== '' && (force || !e.value)) e.value = v; };
    set('first', vals.first); set('last', vals.last); set('phone', vals.phone); set('age', vals.age); set('gender', vals.gender);
  }

  /* פוקוס בשדה שגם פותח מקלדת. דפדפן פותח מקלדת רק בתוך לחיצה, ואחרי חלון הכניסה של גוגל הפוקוס מגיע בלי לחיצה: בכרום באנדרואיד מבקשים אותה ב-VirtualKeyboard. באייפון אין ממשק כזה, ושם יש רק פוקוס */
  function focusKeyboard(input) {
    if (!input) return;
    var vk = navigator.virtualKeyboard, can = vk && vk.show && 'virtualKeyboardPolicy' in input;
    try {
      if (can) input.virtualKeyboardPolicy = 'manual';
      input.focus({ preventScroll: true });
      if (can) { vk.show(); setTimeout(function () { input.virtualKeyboardPolicy = ''; }, 600); }   // חוזרים לברירת המחדל, כדי שנגיעה בשדה תפתח מקלדת כרגיל
    } catch (e) {}
  }

  /* סגירת המקלדת עם סגירת פופאפ: מקלדת שנפתחה ב-virtualKeyboard.show לא נסגרת מ-blur בלבד. עובד גם על שדה בתוך מסגרת (האזור האישי) */
  function blurKeyboard(input) {
    if (!input) return;
    try {
      var w = input.ownerDocument.defaultView, vk = w && w.navigator.virtualKeyboard, can = vk && vk.hide && 'virtualKeyboardPolicy' in input;
      if (can) { input.virtualKeyboardPolicy = 'manual'; vk.hide(); }
      input.blur();
      if (can) input.virtualKeyboardPolicy = '';
      /* אנדרואיד: blur לבד לא תמיד סוגר מקלדת (במיוחד כששדה בתוך מסגרת): מעבירים לרגע את הפוקוס לשדה קריאה בלבד שקוף, שלא פותח מקלדת, וזה סוגר אותה */
      proxyBlur(input.ownerDocument);
    } catch (e) {}
  }
  function proxyBlur(d) {   // d = המסמך שבו הפוקוס היה
    if (!d || !d.body) return;
    var px = d.createElement('input'); px.readOnly = true; px.tabIndex = -1; px.setAttribute('aria-hidden', 'true');
    px.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;pointer-events:none;font-size:16px';
    d.body.appendChild(px); px.focus({ preventScroll: true });
    setTimeout(function () { try { px.blur(); px.remove(); } catch (e2) {} }, 80);
  }
  /* מהדף הראשי: סוגר מקלדת פתוחה גם כשהפוקוס בתוך מסגרת (פופאפ האזור האישי). ה-VirtualKeyboard קיים רק בדף הראשי, והשדה הקריאה בלבד נוצר בו, כמו בפופאפ ההרשמה שבו זה עובד */
  function releaseKeyboard() {
    try { var vk = navigator.virtualKeyboard; if (vk && vk.hide) vk.hide(); } catch (e) {}
    try { proxyBlur(document); } catch (e) {}
  }

  window.normPhone = normPhone;
  window.PersonForm = { html: html, err: err, bind: bind, read: read, validate: validate, serverError: serverError, fill: fill, setErr: setErr, clearAll: clearAll, focusKeyboard: focusKeyboard, blurKeyboard: blurKeyboard, releaseKeyboard: releaseKeyboard, normPhone: normPhone, MSG: MSG };
})();
