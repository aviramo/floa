/* האזור האישי של משתתף אצל עסק אחד (/roster/me/?biz=<שם העסק>).
   כניסה: ההתחברות המשותפת של הדומיין (/auth.js, מפתח "floa.session"), בכל חשבון גוגל. הנתונים: רק פונקציות roster_me_* (p_slug), בלי שום טבלה.
   העסק, המותג והקישורים מגיעים מ-roster_me ולא כתובים כאן. עובד כדף עצמאי וכ-iframe: כניסה עם גוגל נפתחת בחלון קופץ שחוזר וסוגר את עצמו. */
(() => {
  'use strict';
  const AUTH = window.FLOA_AUTH, S = window.SUPABASE;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const app = $('#app');
  const flag = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };

  /* ---------- העסק מהכתובת ---------- */
  const q = new URLSearchParams(location.search);
  let slug = (q.get('biz') || '').trim();
  if (slug) flag('roster_me_biz', slug); else slug = flag('roster_me_biz') || '';   // כניסה בהפניה מלאה חוזרת בלי ?biz=
  const SLUG_OK = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
  const IN_FRAME = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|Messenger|MicroMessenger/i.test(navigator.userAgent);   // דפדפנים בתוך אפליקציות: גוגל חוסמת בהם כניסה

  let data = null, biz = {}, seq = 0, pending = 0, detOpen = null, dirOpen = new Set(), unregSure = null, unregT = 0, signedAtLoad = false, reloading = false, rtT = 0, rtDirty = false;

  /* ---------- קריאה לשרת ---------- */
  async function rpc(name, body) {
    const t = await AUTH.token();   // נדחה עם .signedOut כשאין כניסה
    const res = await fetch(S.url + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: S.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ p_slug: slug }, body || {})) });
    if (res.status === 401) { const e = new Error('signed out'); e.signedOut = true; throw e; }
    const txt = await res.text(); let out = null; try { out = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!res.ok) { const e = new Error('HTTP ' + res.status); e.code = String((out && (out.message || out.hint || out.code)) || ''); throw e; }
    return out;
  }
  const statusOf = (r) => typeof r === 'string' ? r : (r && (r.status || r.error)) || '';   // טקסט (register, update...) או אובייקט {status}

  /* ---------- עזרים ---------- */
  const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const fmtDate = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return 'יום ' + DAYS[new Date(y, m - 1, d).getDay()] + ' ' + d + '.' + m; };
  const ils = (n) => '<bdi dir="ltr">₪' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('he-IL') + '</bdi>';
  const trim = (v) => String(v == null ? '' : v).trim();
  /* טקסט עם קישורים: הכול עובר esc, ורק כתובת שמתחילה ב-http או https הופכת לקישור (תמונה וסרטון מקבלים כיתוב משלהם) */
  const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => '<a class="lnk" href="' + u + '" target="_blank" rel="noopener">' + (/\.(mp4|mov|webm)(\?|$)/i.test(u) ? 'לצפייה בסרטון' : /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) ? 'לצפייה בתמונה' : 'לפתיחה') + '</a>');
  const payUrl = () => { const u = trim(biz.payment_url); return /^https:\/\/\S+$/i.test(u) ? u : ''; };
  const waNum = () => { let n = String(biz.contact_whatsapp || '').replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '972' + n.slice(1); return n.length >= 8 && n.length <= 15 ? n : ''; };
  const waLink = (text) => 'https://wa.me/' + waNum() + (text ? '?text=' + encodeURIComponent(text) : '');
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';
  let toastT = 0;
  function toast(text) { let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400); }
  const say = (el, text, bad) => { if (!el) return; el.textContent = text; el.className = 'msg ' + (bad ? 'bad' : 'good'); };
  const WA_BTN = () => waNum() ? '<a class="btn wa" href="' + esc(waLink('')) + '" target="_blank" rel="noopener">שיחה בוואטסאפ עם העסק</a>' : '';

  function setHead(name, brand) {
    $('#title').textContent = name || 'האזור האישי';
    $('#brand').textContent = brand || '';
    document.title = 'האזור האישי' + (brand ? ' · ' + brand : '');
  }
  function setChip(credit) {
    const bc = $('#balChip'); bc.hidden = !credit;
    if (credit) { bc.className = 'chip ' + (credit > 0 ? 'wait' : 'no'); bc.innerHTML = (credit > 0 ? 'קרדיט ' : 'חוב ') + ils(credit); bc.title = credit > 0 ? 'קרדיט לטובתכם' : 'חוב'; }
  }
  const showOut = (on) => { $('#outBtn').hidden = !on; };

  /* ---------- שדות פרטים (שם, טלפון, אימייל, גיל, מגדר) ---------- */
  const MSG = { name: 'נא למלא שם פרטי ושם משפחה', phone: 'מספר הטלפון לא תקין', email: 'כתובת האימייל לא תקינה', age: 'הגיל צריך להיות בין 18 ל-99', gender: 'נא לבחור מגדר' };
  /* מספר ישראלי שמתחיל ב-0, או מספר עם + (E.164); מחזיר +972... או '' כשלא תקין. זהה ל-roster_normalize_phone */
  function normPhone(raw) {
    const s = String(raw || '').trim(); if (!s) return '';
    let plus = s[0] === '+', d = s.replace(/\D/g, ''); if (!d) return '';
    if (d.indexOf('00') === 0) { plus = true; d = d.slice(2); }
    const IL = /^(5\d{8}|7\d{8}|[23489]\d{7})$/;
    if (plus) { if (d.indexOf('9720') === 0) d = '972' + d.slice(4); if (d.length < 8 || d.length > 15 || d[0] === '0') return ''; if (d.indexOf('972') === 0 && !IL.test(d.slice(3))) return ''; return '+' + d; }
    if (d[0] === '0') return IL.test(d.slice(1)) ? '+972' + d.slice(1) : '';
    return '';
  }
  const localPhone = (p) => { const s = String(p || '').trim(); return /^\+?972\d{8,9}$/.test(s.replace(/[\s-]/g, '')) ? '0' + s.replace(/\D/g, '').slice(3) : s; };
  const LABEL = { first: 'שם פרטי', last: 'שם משפחה', phone: 'טלפון', email: 'אימייל', age: 'גיל', gender: 'מגדר' };
  const AC = { first: 'given-name', last: 'family-name', phone: 'tel', email: 'email', age: 'off', gender: 'sex' };
  function field(kind, id, value, attr) {
    const v = value == null ? '' : value, common = ' id="' + id + '" data-pf="' + kind + '" name="' + kind + '" autocomplete="' + AC[kind] + '" class="pf-input"' + (attr ? ' ' + attr : '');
    let ctl;
    if (kind === 'gender') ctl = '<select' + common + '><option value=""' + (v ? '' : ' selected') + '></option><option value="male"' + (v === 'male' ? ' selected' : '') + '>זכר</option><option value="female"' + (v === 'female' ? ' selected' : '') + '>נקבה</option></select>';
    else {
      const type = kind === 'phone' ? 'tel' : kind === 'email' ? 'email' : kind === 'age' ? 'number' : 'text';
      const extra = kind === 'phone' ? ' inputmode="tel" dir="ltr" maxlength="24"' : kind === 'email' ? ' inputmode="email" dir="ltr" maxlength="254"' : kind === 'age' ? ' inputmode="numeric" min="18" max="99"' : ' maxlength="40"';
      ctl = '<input type="' + type + '"' + common + extra + ' placeholder=" "' + (v !== '' ? ' value="' + esc(v) + '"' : '') + '>';
    }
    return '<label class="pf-field" for="' + id + '"><span>' + LABEL[kind] + '</span>' + ctl + '</label>';
  }
  const errBox = (kind) => '<div class="pf-err" data-pf-err="' + kind + '" role="alert"></div>';
  const fEl = (root, kind) => root.querySelector('[data-pf="' + kind + '"]');
  function setErr(root, kind, msg) {
    const box = root.querySelector('[data-pf-err="' + kind + '"]'); if (box) box.textContent = msg || '';
    (kind === 'name' ? ['first', 'last'] : [kind]).forEach((k) => { const e = fEl(root, k); if (e) e.classList.toggle('bad', !!msg); });
  }
  const ERR_FOR = { first: 'name', last: 'name', phone: 'phone', email: 'email', age: 'age', gender: 'gender' };
  function bindFields(root) {
    Object.keys(ERR_FOR).forEach((k) => { const e = fEl(root, k); if (!e || e.dataset.pfBound) return; e.dataset.pfBound = '1'; e.addEventListener(k === 'gender' ? 'change' : 'input', () => setErr(root, ERR_FOR[k], '')); });
  }
  function readFields(root) {
    const g = (k) => { const e = fEl(root, k); return e ? String(e.value || '').trim() : ''; };
    const first = g('first').replace(/\s+/g, ' '), last = g('last').replace(/\s+/g, ' '), ageS = g('age'), em = g('email').toLowerCase();
    return { first, last, phoneRaw: g('phone'), phone: normPhone(g('phone')), email: em, age: ageS === '' ? null : parseInt(ageS, 10), gender: g('gender') || null };
  }
  /* שם פרטי ומשפחה ותלפון (כשאפשר לערוך אותו) חובה; אימייל, גיל ומגדר לא חובה, אבל אם נכתבו הם חייבים להיות תקינים */
  function validate(root, o) {
    const v = readFields(root); let ok = true;
    if (v.first.length < 2 || v.last.length < 2 || v.first.length > 40 || v.last.length > 40 || (v.first + ' ' + v.last).length > 60) { setErr(root, 'name', MSG.name); ok = false; } else setErr(root, 'name', '');
    if (o && o.phone && !v.phone) { setErr(root, 'phone', MSG.phone); ok = false; } else setErr(root, 'phone', '');
    if (v.email && !(v.email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email))) { setErr(root, 'email', MSG.email); ok = false; } else setErr(root, 'email', '');
    if (v.age != null && !(v.age >= 18 && v.age <= 99)) { setErr(root, 'age', MSG.age); ok = false; } else setErr(root, 'age', '');
    if (v.gender && v.gender !== 'male' && v.gender !== 'female') { setErr(root, 'gender', MSG.gender); ok = false; } else setErr(root, 'gender', '');
    return { ok, v };
  }
  const SERVER_ERR = { invalid_name: 'name', invalid_phone: 'phone', invalid_email: 'email', invalid_age: 'age', invalid_gender: 'gender' };
  function serverError(root, code) { if (!SERVER_ERR[code]) return false; setErr(root, SERVER_ERR[code], MSG[SERVER_ERR[code]]); return true; }
  /* השם מחשבון הגוגל, כהצעה למילוי שם פרטי ומשפחה */
  function googleName() { const full = trim(AUTH.name()); return { first: full.split(' ')[0] || '', last: full.split(' ').slice(1).join(' ') }; }

  /* ---------- כניסה עם גוגל, בחלון קופץ (גם מתוך iframe) ---------- */
  function loginPopup() {
    const w = 480, h = 660, left = Math.max(0, Math.round((screen.width - w) / 2)), top = Math.max(0, Math.round((screen.height - h) / 2));
    const url = location.origin + location.pathname + '?biz=' + encodeURIComponent(slug) + '&login=1';
    const pop = window.open(url, 'roster_me_login', 'popup=yes,width=' + w + ',height=' + h + ',left=' + left + ',top=' + top);
    const m = $('#lm');
    if (!pop) { say(m, IN_FRAME ? 'החלון של הכניסה נחסם. אפשר לאשר חלונות קופצים, או לפתוח את האזור האישי בלשונית נפרדת' : 'החלון של הכניסה נחסם. אפשר לאשר חלונות קופצים ולנסות שוב', true); if (!IN_FRAME) { flag('roster_me_biz', slug); AUTH.signIn(); } return; }
    say(m, 'ממשיכים בחלון הכניסה…');
    const timer = setInterval(() => {
      if (!pop.closed) return;
      clearInterval(timer);
      let has = false; try { has = !!JSON.parse(localStorage.getItem('floa.session') || 'null'); } catch (e) {}
      if (has) { afterLogin(null); return; }
      say(m, 'הכניסה לא הושלמה. אפשר לנסות שוב' + (IN_FRAME ? ', או לפתוח את האזור האישי בלשונית נפרדת' : ''), true);
    }, 600);
  }
  function afterLogin(sess) {
    if (reloading) return; reloading = true;
    if (sess && sess.refresh_token) { try { localStorage.setItem('floa.session', JSON.stringify(sess)); } catch (e) {} }   // iframe באתר אחר: האחסון שלו נפרד מהחלון הקופץ, ולכן הכניסה מגיעה בהודעה
    location.reload();
  }
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.roster === 'me-session') afterLogin(e.data.session); });
  window.addEventListener('storage', (e) => { if (e.key === 'floa.session' && e.newValue && !signedAtLoad) afterLogin(null); });
  /* בחלון הקופץ: אחרי החזרה מגוגל הכניסה כבר שמורה. מוסרים אותה לדף שפתח אותנו וסוגרים */
  function finishPopup() {
    let raw = null; try { raw = JSON.parse(localStorage.getItem('floa.session') || 'null'); } catch (e) {}
    try { if (window.opener) window.opener.postMessage({ roster: 'me-session', session: raw }, location.origin); } catch (e) {}
    try { localStorage.setItem('roster_me_login_done', String(Date.now())); } catch (e) {}
    flag('roster_me_popup', null); flag('roster_me_tried', null);
    app.innerHTML = '<div class="card"><h2>הכניסה הושלמה</h2><p class="muted">אפשר לסגור את החלון הזה ולחזור לאזור האישי</p><a class="btn ghost" href="' + esc(location.pathname + '?biz=' + encodeURIComponent(slug)) + '">המשך כאן</a></div>'; setHead('', ''); showOut(false);
    setTimeout(() => { try { window.close(); } catch (e) {} }, 150);
  }

  /* ---------- מסכים ---------- */
  function viewLogin(msg) {
    setHead('', ''); setChip(0); showOut(false);
    app.innerHTML = '<div class="card"><h2>האזור האישי</h2><p class="muted">כאן אפשר לראות את המפגשים שלכם, את התשלומים והקרדיט, לשמור מקום למפגש ולעדכן פרטים</p>' +
      (IN_APP ? '<p class="msg bad">הכניסה עם גוגל לא עובדת בתוך האפליקציה הזאת. אפשר לפתוח את הקישור בדפדפן הרגיל (כרום או ספארי)</p><a class="btn ghost" href="' + esc(location.href) + '" target="_blank" rel="noopener">פתיחה בדפדפן</a>'
        : '<button type="button" class="gbtn" id="gBtn">' + G + 'כניסה עם גוגל</button><div class="msg" id="lm"></div>') + '</div>';
    const b = $('#gBtn'); if (b) b.onclick = loginPopup;
    if (msg) say($('#lm'), msg, true);
  }
  function viewUnknown() {
    setHead('', ''); setChip(0); showOut(!!AUTH.signedIn());
    app.innerHTML = '<div class="card"><h2>העסק לא נמצא</h2><p class="muted">הקישור שפתחתם לא מוביל לאף עסק. אפשר לפנות לעסק ולבקש קישור חדש לאזור האישי</p></div>';
  }
  function viewDisabled() {
    setHead('', biz.name || ''); setChip(0); showOut(true);
    app.innerHTML = '<div class="card"><h2>האזור האישי לא פעיל</h2><p class="muted">' + (biz.name ? esc(biz.name) + ' עוד לא' : 'העסק עוד לא') + ' פתח אזור אישי. אפשר לפנות אליו ישירות</p>' + WA_BTN() + '</div>';
  }
  function viewBlocked() {
    setHead('', biz.name || ''); setChip(0); showOut(true);
    app.innerHTML = '<div class="card"><h2>אין גישה</h2><p class="muted">החשבון הזה לא מחובר לאזור אישי. אפשר לפנות לעסק</p>' + WA_BTN() + '</div>';
  }
  function viewError() {
    app.innerHTML = '<div class="card"><h2>הטעינה נכשלה</h2><p class="muted">אין חיבור לנתונים כרגע</p><button type="button" class="btn" id="retryBtn">נסו שוב</button></div>';
    $('#retryBtn').onclick = () => load();
  }
  function viewTaken() {
    setChip(0);
    app.innerHTML = '<div class="card"><h2>המספר הזה כבר מחובר לחשבון אחר</h2><p class="muted">ייתכן שנכנסתם בעבר עם חשבון גוגל אחר. עדכנו את העסק, והוא יחזור אליכם. אפשר גם לנסות מספר אחר' + (waNum() ? ', או לפנות אליו בוואטסאפ' : '') + '</p><button type="button" class="btn" id="againBtn">מספר אחר</button>' + (waNum() ? '<a class="btn ghost" href="' + esc(waLink('')) + '" target="_blank" rel="noopener">שיחה בוואטסאפ עם העסק</a>' : '') + '</div>';
    $('#againBtn').onclick = () => viewPhone('');
  }
  /* יש עכשיו הרבה פניות חדשות אצל העסק: השרת מבקש לנסות שוב מאוחר יותר */
  function viewTryLater(phone) {
    setChip(0);
    app.innerHTML = '<div class="card"><h2>יש עכשיו הרבה פניות</h2><p class="muted">לא הצלחנו לחבר אתכם כרגע. אפשר לנסות שוב בעוד כמה דקות' + (waNum() ? ', או לפנות לעסק בוואטסאפ' : '') + '</p><button type="button" class="btn" id="againBtn">נסו שוב</button>' + (waNum() ? '<a class="btn ghost" href="' + esc(waLink('')) + '" target="_blank" rel="noopener">שיחה בוואטסאפ עם העסק</a>' : '') + '</div>';
    $('#againBtn').onclick = () => viewPhone(phone);
  }
  /* חשבון גוגל בלי משתתף מקושר: קודם הטלפון. השרת מחבר את החשבון למשתתף עם הטלפון הזה, או יוצר משתתף; אחר כך האזור האישי נטען, וכשחסרים פרטים כרטיס "השלמת פרטים" נפתח */
  function viewPhone(phone) {
    setHead('', biz.name || ''); setChip(0); showOut(true);
    app.innerHTML = '<div class="card"><h2>מה מספר הטלפון שלכם?</h2><p class="muted">' + (biz.name ? 'אם כבר שמרתם מקום אצל ' + esc(biz.name) + ', ' : 'אם כבר שמרתם מקום, ') + 'נמצא אתכם לפי המספר</p>' + field('phone', 'sph', phone || '') + errBox('phone') +
      '<button type="button" class="btn" id="sgBtn">המשך</button><div class="msg" id="sgm"></div></div>';
    bindFields(app);
    $('#sgBtn').onclick = async () => {
      const raw = ($('#sph') || {}).value || '';
      if (!normPhone(raw)) { setErr(app, 'phone', MSG.phone); return; }
      const b = $('#sgBtn'); b.disabled = true;
      try {
        const r = await rpc('roster_me_phone', { p_phone: raw }), st = statusOf(r);
        if (st === 'invalid_phone') { setErr(app, 'phone', MSG.phone); b.disabled = false; return; }
        if (st === 'phone_taken') { viewTaken(); return; }
        if (st === 'try_later') { viewTryLater(raw); return; }
        if (st === 'blocked') { viewBlocked(); return; }
        if (!['created', 'linked', 'reactivated', 'ok'].includes(st)) throw new Error('status ' + st);
        load();
      } catch (e) { if (e.signedOut) { viewLogin(); return; } say($('#sgm'), 'משהו השתבש, אפשר לנסות שוב', true); b.disabled = false; }
    };
  }

  function viewMain() {
    const p = data.participant || {}, ms = Array.isArray(data.meetings) ? data.meetings : [];
    const credit = Math.round(Number(data.balance) || 0);   // בשקלים שלמים: סכום זעיר לא מוצג כ"חוב 0"
    const scrollTop = app.scrollTop;
    setHead(((p.first_name || '') + ' ' + (p.last_name || '')).trim() || localPhone(p.phone), biz.name || ''); setChip(credit); showOut(true);
    const noName = trim(p.first_name).length < 2 || trim(p.last_name).length < 2, gnm = noName ? googleName() : {};
    const missing = noName;   // חסר שם: מבחינת המשתתף הוא עוד לא רשום, ורואים רק את השלמת הפרטים עד שממלאים
    const open = missing || (detOpen === true);
    const ordered = ms.slice().sort((a, b) => (String(a.date) + String(a.time)).localeCompare(String(b.date) + String(b.time)));   // מהקרוב לרחוק
    const upcoming = ordered.filter((m) => m.future), past = ordered.filter((m) => !m.future && m.registered).reverse();
    const url = payUrl();

    /* שורת מפגש שהמשתתף שמר בו מקום: מצב התשלום, פעולות תשלום, הוראות הגעה (כשהשרת מחזיר אותן) וביטול שמירת המקום */
    /* הוראות ההגעה של המפגש: שורה עם חץ שנפתחת באנימציה, מעל ביטול שמירת המקום. רק כשהשרת החזיר אותן (למי ששילם או לא משלם) */
    const dirFold = (mm) => { const t = trim(mm.directions); if (!t) return ''; const o = dirOpen.has(mm.id); return '<div class="dirbox"><button type="button" class="dethead dirhead" data-dir="' + esc(mm.id) + '" aria-expanded="' + o + '" aria-controls="dir-' + esc(mm.id) + '"><span>הוראות הגעה</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="detfold' + (o ? ' open' : '') + '" id="dir-' + esc(mm.id) + '"><div><p class="dirtxt">' + linkify(t) + '</p></div></div></div>'; };
    const rowHtml = (m) => {
      const paid = Number(m.paid) > 0, free = !!m.free, price = Number(m.price) || 0, rem = (paid && Number(m.due) > 0) ? Number(m.due) : 0;
      const useCr = !paid && !free && credit > 0 && price > 0, crAmt = Math.min(credit, price), crFull = useCr && credit >= price;
      const pay = free ? '<span class="chip">לא לתשלום</span>' : rem ? '<span class="chip no">נשאר לשלם ' + ils(rem) + '</span>' : paid ? '<span class="chip ok">שולם ' + ils(m.paid) + '</span>' : '<span class="chip no">' + (m.future ? 'טרם שולם' : 'לא שולם') + '</span>';
      let foot = '';
      if (useCr) foot += '<div class="payfold"><button type="button" class="btn pay" data-paycredit="' + esc(m.id) + '">תשלום מהקרדיט · ' + ils(crAmt) + '</button>' +
        '<p class="crnote">' + (crFull ? 'יישאר לכם קרדיט ' + ils(credit - price) : 'הקרדיט כולו ינוצל על המפגש, ונשאר לשלם ' + ils(price - credit)) + '</p>' +
        (waNum() ? '<div class="paylinks"><button type="button" class="lnk" data-other="' + esc(m.id) + '">רוצים לשמור מקום בדרך אחרת?</button></div>' : '') + '<div class="msg" data-pm="' + esc(m.id) + '"></div></div>';
      else if (((!paid && !free) || rem > 0) && (url || waNum())) {
        const amt = rem || price;
        foot += '<div class="payfold">' + (rem ? '<p class="crnote">שולם ' + ils(m.paid) + '. נשאר לשלם ' + ils(rem) + '</p>' : '') +
          (url ? '<a class="btn pay" data-paynow="' + esc(m.id) + '" href="' + esc(url) + '" target="_blank" rel="noopener">לתשלום' + (amt ? ' ' + ils(amt) : '') + '</a>' : '') +
          (waNum() ? '<div class="paylinks"><button type="button" class="lnk" data-other="' + esc(m.id) + '">' + (url ? 'רוצים לשמור מקום בדרך אחרת?' : 'לשמירת מקום בוואטסאפ') + '</button></div>' : '') + '<div class="msg" data-pm="' + esc(m.id) + '"></div></div>';
      }
      if (m.future) foot += dirFold(m);
      if (m.future) { const sure = unregSure === m.id; foot += '<button type="button" class="lnk sm" data-unreg="' + esc(m.id) + '"' + (sure ? ' data-sure="1"' : '') + '>' + (sure ? 'לחיצה נוספת לאישור ביטול שמירת המקום' : 'ביטול שמירת מקום') + '</button><div class="msg" data-um="' + esc(m.id) + '"></div>'; }
      return '<div class="mtg">' + meetingBox(m.future ? m : Object.assign({}, m, { max: 0, capacity: 0 }), '<div class="mts">' + pay + '</div>' + (foot ? '<div class="mtfoot">' + foot + '</div>' : '')) + '</div>';
    };
    /* מפגש עתידי שעוד לא שמרו בו מקום: כפתור שמירת מקום, עם המחיר */
    const regRow = (m) => { const price = Number(m.price) || 0; return '<div class="mtg">' + meetingBox(m, '<div class="mtfoot"><button type="button" class="btn" data-reg="' + esc(m.id) + '">שמירת מקום' + (price ? ' · ' + ils(price) : '') + '</button><div class="msg" data-rm="' + esc(m.id) + '"></div></div>') + '</div>'; };
    const rows = upcoming.filter((m) => m.registered).map(rowHtml).concat(upcoming.filter((m) => !m.registered).map(regRow), past.map(rowHtml));
    const meetHtml = rows.length ? rows.join('') : '<div class="card"><p class="muted">עוד לא נקבע מפגש קרוב</p></div>';

    let h = '<div class="card"><button type="button" class="dethead" id="detHead" aria-expanded="' + open + '" aria-controls="detBody"><h2>' + (missing ? 'השלמת פרטים' : 'הפרטים שלי') + '</h2><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button><div class="detfold' + (open ? ' open' : '') + '" id="detBody"><div>' + (missing ? '<p class="muted">נא למלא שם פרטי ושם משפחה כדי להמשיך. שאר הפרטים לא חובה</p>' : '') + '<div class="two"><div>' +
      field('first', 'fn', p.first_name || gnm.first) + '</div><div>' + field('last', 'ln', p.last_name || gnm.last) + '</div></div>' + errBox('name') +
      field('phone', 'ph2', localPhone(p.phone), missing ? 'readonly' : '') + errBox('phone') + field('email', 'em', p.email || (missing ? trim(AUTH.email()) : '')) + errBox('email') +
      '<div class="two"><div>' + field('age', 'ag', p.age) + errBox('age') + '</div><div>' + field('gender', 'gn', p.gender || '') + errBox('gender') + '</div></div>' +
      '<button type="button" class="btn" id="saveBtn">שמירה</button><div class="msg" id="sm"></div></div></div></div>';
    if (!missing) h += meetHtml;   // "הפרטים שלי" ראשון ומתחתיו המפגשים (רק אחרי שהפרטים הושלמו)
    app.innerHTML = h;
    app.scrollTop = scrollTop;
    bindMain(p, ms, credit, missing);
  }

  /* רכיב מפגש אחד: שם (אם יש), מתי, איפה, וכמה משתתפים */
  function meetingBox(m, extra) {
    const [y, mo, d] = String(m.date).split('-').map(Number), wd = DAYS[new Date(y, mo - 1, d).getDay()];
    const when = 'יום ' + wd + ' ' + d + '.' + mo + (m.time ? ' · ' + String(m.time).slice(0, 5) : ''), where = [m.city, m.place].map(trim).filter(Boolean).join(' · '), n = Number(m.max != null ? m.max : m.capacity) || 0;
    return '<div class="mbox"><div class="mbox-in">' + (trim(m.name) ? '<div class="mbox-name">' + esc(m.name) + '</div>' : '') + '<div class="mbox-when">' + esc(when) + '</div>' +
      (where || n ? '<div class="mbox-where">' + esc(where) + (n ? (where ? '<i aria-hidden="true">·</i>' : '') + '<span>עד ' + n + ' משתתפים</span>' : '') + '</div>' : '') + (extra || '') + '</div></div>';
  }

  /* שינוי של המשתתף על מפגש: מוצג מיד, ומתבטל (טעינה מחדש) אם השרת דוחה */
  function optimistic(mid, patch, balDelta) {
    const mm = ((data && data.meetings) || []).find((x) => x.id === mid); if (mm) Object.assign(mm, patch);
    if (balDelta && data) data.balance = (Number(data.balance) || 0) + balDelta;
    pending++; viewMain();
    return { done: () => { pending--; }, fail: () => { pending--; load(true); } };
  }
  function bindMain(p, ms, credit, missing) {
    app.querySelectorAll('[data-reg]').forEach((rb) => { rb.onclick = async () => {
      if (rb.disabled) return; const id = rb.dataset.reg, msg = app.querySelector('[data-rm="' + CSS.escape(id) + '"]'); rb.disabled = true;
      try {
        const r = await rpc('roster_me_register', { p_meeting: id }), st = statusOf(r);
        if (st === 'registered' || st === 'exists') { optimistic(id, { registered: true }).done(); load(true); }
        else { say(msg, st === 'full' ? 'המפגש מלא' : st === 'past' ? 'המפגש כבר עבר' : 'אי אפשר לשמור מקום במפגש הזה', true); rb.disabled = false; }
      } catch (e) { if (e.signedOut) { viewLogin(); return; } say(msg, 'משהו השתבש, אפשר לנסות שוב', true); rb.disabled = false; }
    }; });
    app.querySelectorAll('[data-unreg]').forEach((ub) => { ub.onclick = async () => {   // שני שלבים: לחיצה ראשונה מבקשת אישור
      const id = ub.dataset.unreg, msg = app.querySelector('[data-um="' + CSS.escape(id) + '"]');
      if (!ub.dataset.sure) {
        unregSure = id; ub.dataset.sure = '1'; ub.textContent = 'לחיצה נוספת לאישור ביטול שמירת המקום';
        clearTimeout(unregT); unregT = setTimeout(() => { if (unregSure !== id) return; unregSure = null; const b = app.querySelector('[data-unreg="' + CSS.escape(id) + '"]'); if (b && !b.disabled) { delete b.dataset.sure; b.textContent = 'ביטול שמירת מקום'; } }, 8000);
        return;
      }
      unregSure = null; clearTimeout(unregT); ub.disabled = true;
      try {
        const r = await rpc('roster_me_unregister', { p_meeting: id }), st = statusOf(r);
        if (st === 'cancelled' || st === 'not_registered') { optimistic(id, { registered: false, reported: false }).done(); load(true); }
        else { say(msg, st === 'attended' ? 'אי אפשר לבטל, ההגעה כבר סומנה' : st === 'past' ? 'המפגש כבר עבר' : 'אי אפשר לבטל את שמירת המקום למפגש הזה', true); ub.disabled = false; delete ub.dataset.sure; ub.textContent = 'ביטול שמירת מקום'; }
      } catch (e) { if (e.signedOut) { viewLogin(); return; } say(msg, 'משהו השתבש, אפשר לנסות שוב', true); ub.disabled = false; delete ub.dataset.sure; ub.textContent = 'ביטול שמירת מקום'; }
    }; });
    /* תשלום מהקרדיט: הקרדיט מכסה את מחיר המפגש (או את חלקו), ומוקצה לו */
    app.querySelectorAll('[data-paycredit]').forEach((cb) => { cb.onclick = async () => {
      const id = cb.dataset.paycredit, msg = app.querySelector('[data-pm="' + CSS.escape(id) + '"]'), m = ms.find((x) => x.id === id); if (!m || cb.disabled) return; cb.disabled = true;
      try {
        const r = await rpc('roster_me_pay_credit', { p_meeting: id }), st = statusOf(r);
        if (st === 'ok' || st === 'already') { const price = Number(m.price) || 0, amt = Math.min(credit, price); optimistic(id, { paid: amt, due: price > amt ? price - amt : null }, -amt).done(); load(true); }
        else { say(msg, st === 'no_credit' ? 'אין קרדיט זמין' : st === 'free' ? 'המפגש הזה לא לתשלום' : 'אי אפשר לשלם מהקרדיט', true); cb.disabled = false; }
      } catch (e) { if (e.signedOut) { viewLogin(); return; } say(msg, 'משהו השתבש, אפשר לנסות שוב', true); cb.disabled = false; }
    }; });
    /* לחיצה על כפתור התשלום פותחת את קישור התשלום של העסק בלשונית חדשה, ובמקביל מדווחת עליה. המשתתף לא רואה כלום על הדיווח */
    app.querySelectorAll('[data-paynow]').forEach((pa) => { pa.addEventListener('click', async () => {
      if (pa.dataset.rep) return; pa.dataset.rep = '1'; const id = pa.dataset.paynow;
      try { await rpc('roster_me_report_payment', { p_meeting: id }); }
      catch (e) { delete pa.dataset.rep; }   // הדיווח נכשל: ולחיצה נוספת מנסה שוב
    }); });
    app.querySelectorAll('[data-other]').forEach((ob) => { ob.onclick = () => {   // שמירת מקום בדרך אחרת: ישר לשיחת וואטסאפ עם העסק והודעה מוכנה, בלי חלון
      const m = ms.find((x) => x.id === ob.dataset.other); if (!m || !waNum()) return;
      window.open(waLink('היי, אני רוצה לשמור מקום בדרך אחרת למפגש ' + fmtDate(m.date).replace(/^יום /, 'ביום ') + (m.time ? ' בשעה ' + String(m.time).slice(0, 5) : '')), '_blank', 'noopener');
    }; });
    app.querySelectorAll('[data-dir]').forEach((b) => { b.onclick = () => { const f = b.nextElementSibling; if (!f) return; const on = !f.classList.contains('open'); f.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); if (on) dirOpen.add(b.dataset.dir); else dirOpen.delete(b.dataset.dir); }; });
    bindFields(app);
    $('#detHead').onclick = () => { const f = $('#detBody'), on = !f.classList.contains('open'); f.classList.toggle('open', on); detOpen = on; $('#detHead').setAttribute('aria-expanded', String(on)); };
    $('#saveBtn').onclick = async () => {
      const chk = validate(app, { phone: !missing }); if (!chk.ok) return;
      const v = chk.v, b = $('#saveBtn'), sm = $('#sm'); b.disabled = true; pending++;
      try {
        const r = missing ? await rpc('roster_me_complete', { p_first: v.first, p_last: v.last, p_age: v.age, p_gender: v.gender, p_email: v.email || null })
          : await rpc('roster_me_update', { p_first: v.first, p_last: v.last, p_age: v.age, p_gender: v.gender, p_phone: v.phoneRaw, p_email: v.email || null });
        const st = statusOf(r);
        if (serverError(app, st)) { /* השגיאה מוצגת ליד השדה */ }
        else if (st === 'phone_taken') say(sm, 'המספר הזה כבר רשום אצל משתתף אחר', true);
        else if (st === 'ok') { pending--; toast('הפרטים נשמרו'); load(true); b.disabled = false; return; }
        else say(sm, 'אי אפשר לשמור כרגע, אפשר לרענן את הדף ולנסות שוב', true);
      } catch (e) { if (e.signedOut) { pending--; viewLogin(); return; } say(sm, 'משהו השתבש, אפשר לנסות שוב', true); }
      pending--; b.disabled = false;
    };
  }

  /* ---------- טעינה ---------- */
  const UNKNOWN = /unknown_business|not_found|no_business|invalid_slug|business_not_found|unknown_slug/i, DISABLED = /disabled|personal_area_off|personal_area|inactive/i;
  async function load(silent) {
    const my = ++seq;
    let r;
    try { r = await rpc('roster_me', {}); }
    catch (e) {
      if (my !== seq) return;
      if (e.signedOut) { viewLogin(); return; }
      if (UNKNOWN.test(e.code || '')) { viewUnknown(); return; }
      if (DISABLED.test(e.code || '')) { viewDisabled(); return; }
      if (!silent || !data) viewError();
      return;
    }
    if (my !== seq || (pending > 0 && silent)) return;   // תשובה ישנה, או כתיבה שעוד בדרך: לא דורסים אותה
    const st = statusOf(r);
    biz = (r && r.business) || biz || {};
    if (UNKNOWN.test(st) && st !== 'ok') { viewUnknown(); return; }
    if (DISABLED.test(st) && st !== 'ok') { viewDisabled(); return; }
    if (st === 'blocked') { data = null; viewBlocked(); return; }
    if (st !== 'ok') { data = null; viewPhone(''); return; }   // none (ואם יגיע pending): עוד אין משתתף מקושר
    data = r; viewMain();
  }

  /* ---------- רענון: חזרה ללשונית וגיבוי כל 45 שניות; לא בזמן הקלדה ---------- */
  const typingNow = () => { const el = document.activeElement; return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && app.contains(el)); };
  function refreshNow() {
    if (!data || document.hidden) return;
    if (typingNow()) { rtDirty = true; return; }
    rtDirty = false; load(true);
  }
  const scheduleRefresh = () => { clearTimeout(rtT); rtT = setTimeout(refreshNow, 250); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRefresh(); });
  window.addEventListener('focus', scheduleRefresh); window.addEventListener('online', scheduleRefresh);
  document.addEventListener('focusout', () => { if (rtDirty) setTimeout(refreshNow, 300); });
  setInterval(scheduleRefresh, 45000);

  $('#outBtn').onclick = () => { AUTH.signOut().then(() => location.reload()); };

  /* ---------- התחלה ---------- */
  function start() {
    signedAtLoad = AUTH.signedIn();
    /* החלון הקופץ של הכניסה (נפתח עם ?login=1): ישר לגוגל, ובחזרה מוסרים את הכניסה לדף שפתח אותו וסוגרים */
    if (q.get('login') && slug) { flag('roster_me_popup', '1'); try { history.replaceState(null, '', location.pathname + '?biz=' + encodeURIComponent(slug)); } catch (e) {} }
    if (flag('roster_me_popup') === '1') {
      if (signedAtLoad) { finishPopup(); return; }
      if (!flag('roster_me_tried')) { flag('roster_me_tried', '1'); AUTH.signIn(); return; }
      flag('roster_me_popup', null); flag('roster_me_tried', null);   // חזרה מגוגל בלי כניסה (ביטול): ממשיכים כדף רגיל
    }
    if (!slug || !SLUG_OK.test(slug)) { viewUnknown(); return; }
    if (!signedAtLoad) { viewLogin(new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description') ? 'הכניסה נכשלה. אפשר לנסות שוב' : ''); return; }
    showOut(true);
    load();
  }
  start();
})();
