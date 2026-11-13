  /* Supabase של הדומיין (/supabase.js) וההתחברות המשותפת שלו (/auth.js); המפתח ציבורי מעצם הגדרתו, ומה שמותר באמת נקבע במדיניות RLS של כל טבלה */
  const FRAMED = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();   // בתוך מסגרת של דף אחר: לא מציגים כלום ולא פונים לשרת
  if (FRAMED) document.documentElement.hidden = true;
  const AUTH = window.FLOA_AUTH, DB = { url: window.SUPABASE.url, key: window.SUPABASE.anonKey };
  const T = { p: 'roster_participants', m: 'roster_meetings', a: 'roster_attendance', n: 'roster_notes', pr: 'roster_promoters', pp: 'roster_promoter_payments', pay: 'roster_payments', st: 'roster_statuses', pf: 'roster_admin_prefs', pm: 'roster_pay_methods', fin: 'roster_finance', finr: 'roster_finance_recurring', finlog: 'roster_finance_log', fintr: 'roster_finance_transfers', mt: 'roster_meeting_types', tpl: 'roster_msg_templates', sent: 'roster_msg_sent' };
  const TABLES = Object.values(T);
  const MEMBERS = 'roster_members', MAIL_LOG = 'roster_mail_log';   // נקראות לפי דרישה (כרטיס משתתף, פתיחת מייל), לא בזמן אמת

  /* ===== ערכת רכיבים: כל אובייקט ויזואלי שחוזר בדף נבנה כאן, בקריאה אחת עם פרמטרים (העיצוב של כל אובייקט מוגדר פעם אחת ב-admin.css) =====
     icon(שם, מחלקה)            סמל מהמאגר (24×24, קו 2.2 או מילוי). בסימון הקבוע בדף: <svg data-i="שם"> ומתמלא בטעינה
     UI.tag(טקסט, סוג, מאפיינים)   תגית: גובה אחד, טקסט במרכז; הסוג קובע רק צבע
     UI.metric(תווית, ערך, אפשרויות) כרטיס מספר: תווית למעלה, ערך גדול בצבע המצב, שורת משנה
     UI.fopt(...)                שורת אפשרות בתפריטי הסינון: מחוון, תווית וספירה */
  const ICONS = {
    arrowl: ['s', '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'],
    back: ['s', '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'],
    cal: ['s', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/>'],
    caloff: ['s', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/><path d="M3 21L21 3"/>'],
    calnext: ['s', '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/><circle cx="12" cy="15" r="2.5" fill="currentColor" stroke="none"/>'],   // המפגש הקרוב: לוח שנה עם נקודה
    call: ['s', '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'],
    mail: ['s', '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'],
    chat: ['s', '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.4A8 8 0 1 1 21 12z"/>'],
    check: ['s', '<path d="M5 12.5l4.5 4.5L19 7"/>'],
    chev: ['s', '<path d="M6 9l6 6 6-6"/>'],
    clock: ['s', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    copy: ['s', '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'],
    dots: ['f', '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>'],
    edit: ['s', '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/>'],
    plus: ['s', '<path d="M12 5v14"/><path d="M5 12h14"/>'],
    enter: ['s', '<path d="M4 12h11M11 7l5 5-5 5M20 5v14"/>'],
    eye: ['s', '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    free: ['s', '<circle cx="12" cy="12" r="8.5"/><path d="M6 18L18 6"/>'],
    go: ['s', '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'],
    grid: ['s', '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>'],
    grip: ['f', '<circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/>'],
    img: ['s', '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="1.8"/><path d="M21 16l-5-5-8 8"/>'],
    bookmark: ['s', '<path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/>'],   // סימנייה: שמירת מקום (משוריין)
    logout: ['s', '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4M19 12H9"/>'],
    money: ['s', '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2" fill="currentColor"/>'],
    next: ['s', '<path d="M9 5l7 7-7 7"/>'],
    prev: ['s', '<path d="M15 5l-7 7 7 7"/>'],
    search: ['s', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/><path d="M10.5 8v5M8 10.5h5" stroke-width="1.8"/>'],
    sort: ['s', '<path d="M7 4v15M7 19l-3-3M7 19l3-3M17 20V5M17 5l-3 3M17 5l3 3"/>'],
    sdown: ['s', '<path d="M12 5v14M6 13l6 6 6-6"/>'],
    sup: ['s', '<path d="M12 19V5M6 11l6-6 6 6"/>'],
    filter: ['s', '<path d="M4 5h16l-6.5 7.5V18l-3 1.5v-7z"/>'],
    warn: ['s', '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5"/><path d="M12 17.5h.01"/>'],   // אזהרה
    sun: ['s', '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>'],   // מצב בהיר
    moon: ['s', '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>'],   // מצב כהה
    stats: ['s', '<path d="M5 20V11M12 20V4M19 20v-6"/>'],
    swap: ['s', '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>'],
    tag: ['s', '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>'],
    unlink: ['s', '<path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5 5 0 0 0 7.07 7.07l1.71-1.71"/><path d="M8 2v3M2 8h3M16 19v3M19 16h3"/>'],   // ניתוק חשבון גוגל
    ban: ['s', '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'],   // חשבון גוגל חסום
    male: ['s', '<circle cx="10" cy="14" r="5.5"/><path d="M14 10l6-6M15 4h5v5"/>'],   // סמל זכר (♂), בתגית הגיל והמגדר
    female: ['s', '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M9 18h6"/>'],   // סמל נקבה (♀)
    plug: ['s', '<path d="M9 3v4"/><path d="M15 3v4"/><path d="M6 7h12v3a6 6 0 0 1-12 0z"/><path d="M12 16v5"/>'],
    trash: ['s', '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'],   // משתתף מחוק
    user: ['s', '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'],
    close: ['s', '<path d="M6 6l12 12M18 6L6 18"/>'],
    card: ['s', '<rect x="3" y="5.5" width="18" height="13" rx="1.5"/><path d="M3 10h18M7 15h4"/>'],
    wa: ['f', '<path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.5c-1.7 0-3.4-.5-4.8-1.3l-.3-.2-3.6.9 1-3.5-.2-.4C3.2 15.6 2.7 13.8 2.7 12c0-5.1 4.2-9.3 9.3-9.3 2.5 0 4.8 1 6.6 2.7 1.8 1.8 2.7 4.1 2.7 6.6 0 5.2-4.2 9.5-9.3 9.5zM20 4C17.9 1.8 15 .7 12 .7 5.8.7.7 5.8.7 12c0 2 .5 3.9 1.5 5.6L.6 23.4l6-1.6c1.6.9 3.5 1.4 5.4 1.4 6.2 0 11.3-5.1 11.3-11.3 0-3-1.2-5.8-3.3-7.9z"/>'],
  };
  const icon = (n, cls) => { const x = ICONS[n] || ICONS.dots; return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" ' + (x[0] === 'f' ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"') + ' aria-hidden="true">' + x[1] + '</svg>'; };
  document.querySelectorAll('svg[data-i]').forEach((s) => { s.outerHTML = icon(s.dataset.i, s.getAttribute('class')); });
  /* ערך של מאפיין נכנס תמיד בין מרכאות כפולות ולא יכול לצאת מהן; מחלקה: רק אותיות לטיניות, ספרות, קו תחתון ומקף. כל נתון מהמסד עובר דרך אחד מהם */
  const escA = (v) => String(v == null ? '' : v).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const clsA = (c) => String(c == null ? '' : c).replace(/[^A-Za-z0-9_ -]/g, '');
  const uiAttrs = (a) => a ? Object.keys(a).filter((k) => /^[a-z][a-z0-9-]*$/i.test(k) && a[k] != null && a[k] !== false).map((k) => ' ' + k + '="' + escA(a[k]) + '"').join('') : '';
  const UI = {
    tag: (text, cls, a, el) => { el = el || 'span'; return '<' + el + (el === 'button' ? ' type="button"' : '') + ' class="tg' + (cls ? ' ' + clsA(cls) : '') + '"' + uiAttrs(a) + '>' + text + '</' + el + '>'; },
    // tone: pos (ירוק) / neg (אדום) / yel (צהוב, קרדיט וקרדיט) / mut (אפור) / '' (טקסט רגיל)
    metric: (label, value, o) => { o = o || {}; return '<div class="metric' + (o.tone ? ' ' + clsA(o.tone) : '') + (o.cls ? ' ' + clsA(o.cls) : '') + '"' + uiAttrs(o.a) + '><small>' + label + '</small><b>' + value + '</b>' + (o.sub ? '<small class="msub">' + o.sub + '</small>' : '') + '</div>'; },
    fdot: (tone) => tone ? '<i class="fdot ' + tone + '" aria-hidden="true"></i>' : '',   // סינון פעיל בשורת הסינון: נקודה בצבע התואם (ink, green, yellow, red, gray)
    fopt: (v, on, indCls, glyph, label, n) => '<button type="button" role="menuitem" class="fopt" data-fv="' + escA(v) + '" aria-pressed="' + !!on + '"><span class="hfilt ' + clsA(indCls) + '">' + glyph + '</span><span>' + label + '</span>' + (n != null ? '<b class="fcnt">' + n + '</b>' : '') + '</button>',
  };

  /* חזרה בדפדפן: כל פתיחת פופאפ וכל כניסה למסך משנה בתוכו מוסיפות רשומת היסטוריה; חזרה בדפדפן חוזרת צעד אחד (מסך משנה ← המסך הראשי ← סגירה), וסגירה או חזרה בכפתורי המסך מנקות את הרשומות */
  /* הגבול התחתון של תפריטים צפים (1.11.26): מעל האזור הבטוח בתחתית (פס המחוות / הבית של המכשיר, --safe-b, לפחות 28px), לא קרוב לקצה המסך; תפריט שלא נכנס מתחת לכפתור נפתח מעליו */
  function menuBottom() {
    let pr = document.getElementById('safeProbe');
    if (!pr) { pr = document.createElement('div'); pr.id = 'safeProbe'; pr.setAttribute('aria-hidden', 'true'); pr.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:var(--safe-b);visibility:hidden;pointer-events:none'; document.body.appendChild(pr); }
    return window.innerHeight - Math.max(8, pr.offsetHeight);
  }
  /* מיקום אנכי של תפריט צף ביחס לעוגן: מתחתיו אם נכנס, אחרת מעליו, ואם לא נכנס באף צד, בצד הרחב מביניהם עם גובה מוגבל וגלילה פנימית, כך שהתפריט אף פעם לא חורג מגבולות המסך */
  function placeMenuV(menu, aTop, aBottom, onlyBelow) {   // onlyBelow: תמיד מתחת לעוגן, ואם הרשימה ארוכה מוגבלת בגובה וגוללת
    const minTop = 8 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--envtop')) || 0);
    const below = menuBottom() - (aBottom + 8), above = aTop - 8 - minTop;
    menu.style.maxHeight = ''; const mh = menu.offsetHeight;
    if (mh <= below || onlyBelow) { menu.style.top = (aBottom + 8) + 'px'; if (mh > below) menu.style.maxHeight = Math.max(96, Math.floor(below)) + 'px'; }
    else if (mh <= above) menu.style.top = (aTop - 8 - mh) + 'px';
    else if (below >= above) { menu.style.maxHeight = Math.floor(below) + 'px'; menu.style.top = (aBottom + 8) + 'px'; }
    else { menu.style.maxHeight = Math.floor(above) + 'px'; menu.style.top = minTop + 'px'; }
  }
  const NAV = { stack: [], ignore: 0, fromPop: false };
  const NAV_BACK = { pDlg: '#pBack', setDlg: '#setBack', prDlg: '#prArrow', finDlg: '#finArrow' };
  const navDepthOf = (d) => {
    try {
      if (d.id === 'pDlg') return (sheet && sheet.id && pTab !== 'main') ? Math.max(1, viewStack.filter((x) => x !== 'main').length + 1) : 0;
      if (d.id === 'setDlg') return setIsRoot(setView) ? 0 : setView === 'del' ? (setRoot === 'st' || setRoot === 'src' ? 1 : 2) : 1;   // עריכת סוג מפגש נפתחת מתפריט המפגשים: מסך הסוג הוא הראשי, והתגיות וההודעה שלו מסכי משנה
      if (d.id === 'finDlg') return (finV === 'main' || finV === 'form') ? 0 : 1;
      if (d.id === 'prDlg') return RANK[prView] || 0;
    } catch (e) {}
    return 0;
  };
  const navBackBtn = (d) => { const k = NAV_BACK[d.id]; return k ? $(k) : null; };   // החץ של המסך שמוצג עכשיו
  const navOpen = (d) => { NAV.stack.push({ d, sub: 0 }); try { history.pushState({ nav: 1 }, ''); } catch (e) {} };
  function navSync(d) {
    const t0 = NAV.stack.find((x) => x.d === d); if (!t0) return;
    const depth = navDepthOf(d);
    if (depth === t0.sub) return;
    if (NAV.fromPop) { t0.sub = depth; return; }
    if (depth > t0.sub) { for (let i = t0.sub; i < depth; i++) { try { history.pushState({ nav: 1 }, ''); } catch (e) {} } t0.sub = depth; }
    else { const n = t0.sub - depth; t0.sub = depth; NAV.ignore++; history.go(-n); }
  }
  const navClose = (d) => {
    const i = NAV.stack.map((x) => x.d).lastIndexOf(d); if (i < 0) return;
    const sub = NAV.stack[i].sub, n = 1 + sub; NAV.stack.splice(i, 1);
    if (NAV.fromPop) { if (sub > 0) { NAV.ignore++; history.go(-sub); } return; }   // החזרה כבר הורידה רשומה אחת; אם נשארו רשומות של מסכי משנה, מורידים גם אותן
    NAV.ignore++; history.go(-n);
  };
  window.addEventListener('popstate', () => {
    if (NAV.ignore > 0) { NAV.ignore--; syncUrl(); return; }   /* roster: a closing floating menu or dialog steps back in history to the entry made before it opened, whose address predates what was picked inside it; the address is written again from the state */
    const top = NAV.stack[NAV.stack.length - 1]; if (!top) return;
    if (top.d === floatNav) { NAV.stack.pop(); floatPushed = false; floatNav.close(); return; }   // תפריט צף: החזרה כבר הורידה את הרשומה שלו (בלי הורדה כפולה כשהמעקב אחרי הסגירה רץ אחר כך)
    if (top.d.tagName === 'DIALOG' && !top.d.open) { NAV.stack.pop(); return; }   // רשומה ישנה של פופאפ שכבר סגור (נסגר מחוץ ל-close שלנו): החזרה הזו שייכת לה, לא סוגרים כלום
    NAV.fromPop = true;
    let left = -1;
    try {
      const dep = navDepthOf(top.d), bk = dep > 0 ? navBackBtn(top.d) : null;   // ההחלטה לפי המסך שמוצג בפועל (לא לפי מונה שמור שעלול להתפספס): בתוך מסך משנה חוזרים צעד, רק במסך הראשי סוגרים
      if (bk && !bk.hidden) { left = Math.max(0, top.sub - 1); bk.click(); top.sub = left; }
      else top.d.close();
    } finally { NAV.fromPop = false; }
    if (left >= 0) navSync(top.d);   // אם המסך לא השתנה (למשל תבנית לא מושלמת נשארת פתוחה), מחזירים את הרשומה שהחזרה הורידה
  });
  const state = { mtypes: [], tpls: [], msgSent: [], mtype: null, prefs: {}, statuses: [], participants: [], meetings: [], att: [], notes: [], promoters: [], promoPays: [], payments: [], filter: null, q: '', pay: null, paidF: null, arrF: null, gender: null, sent: null, bal: null, viewScopes: {}, srcF: null, ageF: null, mcF: null, regF: null, fin: [], finRec: [], finTr: [], finPeriod: 'all', finFilter: null };
  /* ---------- עזרים משותפים ---------- */
  const partOf = (id) => state.participants.find((x) => x.id === id);   // משתתף לפי מזהה
  const meetOf = (id) => state.meetings.find((x) => x.id === id);   // מפגש לפי מזהה
  const attQs = (pid, mid) => '?participant_id=eq.' + pid + '&meeting_id=eq.' + mid;   // שאילתת שיוך משתתף-מפגש
  const blurActive = () => { const a = document.activeElement; if (a && a.blur) a.blur(); };   // בלי מקלדת בפתיחת פופאפ
  const blurIn = (sel) => { const a = document.activeElement; if (a && a.closest && a.closest(sel)) a.blur(); };   // בלי מקלדת כשנפתח הפופאפ sel
  const newestFirst = (a, b) => String(b.created_at).localeCompare(String(a.created_at));   // מהחדש לישן לפי זמן יצירה
  /* קישור עמוק: ?biz=<עסק>&m=<מפגש>&p=<משתתף>...; נשמר בזמן הכניסה עם גוגל (שמחזירה בלי הפרמטרים) */
  const DEEP_KEYS = ['biz', 'm', 'mt', 'p', 'pt', 'pay', 'pd', 'sv', 'bl', 'g', 'sc', 'ag', 'up', 'q', 'tpl', 'tplv', 'em', 'set', 'pr', 'fin', 'st', 'stv', 'ml', 'at', 'mc', 'rg'];
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let deep = null;
  try {
    const sp = new URLSearchParams(location.search);
    if (DEEP_KEYS.some((k) => sp.get(k))) { deep = {}; DEEP_KEYS.forEach((k) => { deep[k] = sp.get(k); }); sessionStorage.setItem('roster_deep', JSON.stringify(deep)); }
    else { deep = JSON.parse(sessionStorage.getItem('roster_deep') || 'null'); }
  } catch (e) {}
  const $ = (s) => document.querySelector(s);

  /* מצב המסך נשמר ב-URL (מפגש, סינון תשלום, חיפוש, חלון פתוח) כדי שאפשר יהיה לשתף */
  let urlReady = false, openPid = null;
  function syncUrl() {
    if (!urlReady) return;
    const sp = new URLSearchParams();
    // העסק הוא הכתובת עצמה (/roster/<מזהה>), לא פרמטר בה
    if (state.mtype) sp.set('mt', state.mtype);   // סוג המפגש שנבחר בתפריט המפגשים
    { const nm0 = nextMeetingOf(); if (state.filter) { if (!nm0 || nm0.id !== state.filter) sp.set('m', state.filter); } else if (!state.mtype && nm0) sp.set('m', 'all'); }   // כתובת בלי מפגש = המפגש הקרוב, ולכן הוא לא נכתב בכתובת; "כל המשתתפים" שנבחר במפורש הוא m=all
    if (state.pay) sp.set('pay', state.pay);
    if (state.paidF) sp.set('pd', state.paidF);
    if (state.arrF) sp.set('at', state.arrF);
    if (state.sent) sp.set('sv', state.sent);
    if (state.bal) sp.set('bl', state.bal);
    if (state.gender) sp.set('g', state.gender);
    if (state.srcF) sp.set('sc', state.srcF);
    if (state.ageF) sp.set('ag', state.ageF);
    if (state.mcF) sp.set('mc', state.mcF);
    if (state.updF) sp.set('up', state.updF);
    if (state.regF) sp.set('rg', state.regF);
    if (state.q.trim()) sp.set('q', state.q.trim());
    if (openPid) { sp.set('p', openPid); if (pTab && pTab !== 'main' && pTab !== 'contact' && pTab !== 'meets' && pTab !== 'deposit') { sp.set('pt', pTab); } if (sheet && sheet.mailId && document.getElementById('mailDlg').open) sp.set('ml', sheet.mailId); if (pTab === 'main' && PG.cur) sp.set('pg', PG_IDS[PG.cur]); }
    if ($('#setDlg').open) sp.set('set', setView === 'main' ? '1' : setView === 'tydet' ? 'tydet:' + (tyId || '') : (setView === 'del' && setRoot === 'src') ? 'src' : (setView === 'st' || setView === 'del') ? ('st:' + (stType || '')) : setView === 'em' ? 'em:' + (stType || '') : setView);   // סוג מפגש: עריכת הסוג, התגיות וההודעה שלו
    if ($('#prDlg').open && prCur) sp.set('pr', prCur);
    if (mDlg.open) sp.set('em', editingMeeting ? editingMeeting.id : 'new');   // עריכת מפגש או מפגש חדש
    if ($('#tplDlg').open && tplEd && tplEd.id) { sp.set('tpl', tplEd.id); if ($('#tplPrevDlg').open) sp.set('tplv', '1'); }   // עריכת תבנית הודעה, והצפייה בה
    if ($('#stDlg').open) { sp.set('st', '1'); if (stPg.cur) sp.set('stv', ST_IDS[stPg.cur]); }
    if ($('#finDlg').open) sp.set('fin', finV === 'log' ? 'log' : finV === 'settle' ? 'settle' : finV === 'form' ? (finEdit && finEdit.id ? 'edit-' + finEdit.type + '-' + finEdit.id : 'new-' + ((finEdit && finEdit.kind) || 'expense')) : '1');   // כל שלב בכספים: ראשי, יומן, התחשבנות, טופס חדש או עריכה
    const s = sp.toString();
    try { history.replaceState(null, '', '/roster/' + encodeURIComponent(BIZ.slug) + (s ? '?' + s : '')); } catch (e) {}   // הכתובת היפה; רענון עובר דרך ה-404 של הדומיין, שמחזיר לכאן עם ?biz=
  }

  /* ---------- כניסה והעסק ----------
     הכניסה היא של הדומיין (/auth.js: אותה כניסה לכל האפליקציות, בלי שמירת הפעלה כאן); העסק שהדף עובד עליו נקבע ב-?biz=<שם> ומאומת מול roster_my_businesses.
     כל בקשה ל-/rest/v1 נושאת x-business: מזהה העסק, ובסיס הנתונים ממלא ממנו את business_id ומצמצם בו את הקריאה. הדף לעולם לא כותב business_id בעצמו */
  let BIZ = { slug: (deep && deep.biz) || '', id: null, name: '' };
  const emailOf = () => String(AUTH.email() || '').toLowerCase();
  const gateMsg = (m) => { $('#gErr').textContent = m || ''; };
  /* מסך הכניסה; denied: "אין גישה" (בלי כפתור הכניסה, עם קישור חזרה לבחירת עסק והחלפת חשבון) */
  function showGate(msg, denied) {
    document.querySelectorAll('dialog[open]').forEach((x) => { try { x.close(); } catch (e) {} });
    dropImages();
    document.body.classList.add('locked'); document.documentElement.classList.add('is-loading'); $('#gate').hidden = false; gateMsg(msg);
    $('#gLogin').hidden = !!denied; $('#gBack').hidden = !denied; $('#gOut').hidden = !denied;
  }
  /* ההפעלה נגמרה (פג תוקף, או נותקה בלשונית אחרת) */
  function sessionLost() { try { if (rtWs) rtWs.close(); } catch (e) {} showGate('הכניסה פגה, צריך להיכנס שוב'); }
  /* ---------- זמן אמת (Supabase Realtime, WebSocket ישיר בלי SDK) ----------
     כל שינוי בטבלאות של העסק (מכל מכשיר ומכל מנהל) מרענן את המסך. דורש שהטבלאות ב-publication של supabase_realtime.
     INSERT ו-UPDATE מסוננים לעסק (business_id=eq.<מזהה>); מחיקה מגיעה בלי סינון, כי אירוע מחיקה נושא רק את המפתח הראשי */
  let rtWs = null, rtHb = 0, rtTok = 0, rtRetry = 1000, rtDebounce = 0, rtAlive = false;
  const RT_TOPIC = 'realtime:roster';
  const rtSend = (o) => { if (rtWs && rtWs.readyState === 1) rtWs.send(JSON.stringify(o)); };
  function scheduleRefresh() { clearTimeout(rtDebounce); rtDebounce = setTimeout(() => load(true), 350); }
  function startRealtime() {
    if (!BIZ.id || rtWs || !AUTH.signedIn()) return;
    let ws;
    try { ws = new WebSocket(DB.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(DB.key) + '&vsn=1.0.0'); } catch (e) { return; }
    rtWs = ws;
    ws.onopen = async () => {
      rtRetry = 1000;
      let tok; try { tok = await AUTH.token(); } catch (e) { try { ws.close(); } catch (x) {} return; }
      const scope = 'business_id=eq.' + BIZ.id, ch = [];
      TABLES.forEach((table) => { ch.push({ event: 'INSERT', schema: 'public', table, filter: scope }, { event: 'UPDATE', schema: 'public', table, filter: scope }, { event: 'DELETE', schema: 'public', table }); });
      rtSend({ topic: RT_TOPIC, event: 'phx_join', ref: '1', payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: false, postgres_changes: ch }, access_token: tok } });
      rtHb = setInterval(() => rtSend({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }), 25000);
      rtTok = setInterval(() => { AUTH.token().then((t) => rtSend({ topic: RT_TOPIC, event: 'access_token', payload: { access_token: t }, ref: String(Date.now()) }), () => {}); }, 600000);   // הטוקן מתחדש אצל ההתחברות המשותפת, והחיבור הפתוח מקבל אותו
    };
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.event === 'phx_reply' && m.topic === RT_TOPIC && m.ref === '1') {
        rtAlive = m.payload && m.payload.status === 'ok';
        if (rtAlive) scheduleRefresh();   // מה שהוחמץ בזמן שהחיבור היה סגור
      } else if (m.event === 'postgres_changes') scheduleRefresh();
      else if (m.event === 'system' && m.payload && m.payload.status === 'error') { rtAlive = false; }
    };
    ws.onclose = () => {
      clearInterval(rtHb); clearInterval(rtTok); rtWs = null; rtAlive = false;
      if (BIZ.id && AUTH.signedIn()) { setTimeout(startRealtime, rtRetry); rtRetry = Math.min(rtRetry * 2, 30000); }
    };
    ws.onerror = () => { try { ws.close(); } catch (x) {} };
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && BIZ.id && AUTH.signedIn()) { load(true); if (!rtWs) startRealtime(); } });

  async function startAuth() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('error_description')) {
      history.replaceState(null, '', location.pathname + location.search);
      showGate('הכניסה נכשלה: ' + h.get('error_description').replace(/\+/g, ' ')); return;
    }
    if (!AUTH.signedIn()) { showGate(''); return; }
    let mine;
    try {
      const r = await fetch(DB.url + '/rest/v1/rpc/roster_my_businesses', { method: 'POST', headers: { apikey: DB.key, Authorization: 'Bearer ' + await AUTH.token(), 'Content-Type': 'application/json' }, body: '{}' });
      if (r.status === 401) { showGate(''); return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      mine = await r.json();
    } catch (e) { if (e && e.signedOut) { showGate(''); return; } console.error(e); showGate('אין חיבור לנתונים. נסו שוב בעוד רגע'); return; }
    const row = (mine || []).find((b) => b.slug === BIZ.slug);
    if (!row) { showGate('אין לך גישה לעסק הזה', true); return; }
    BIZ = { slug: row.slug, id: row.id, name: row.name || row.slug };
    document.title = 'ניהול משתתפים · ' + BIZ.name; $('#bizName').textContent = BIZ.name;
    $('#connectLink').href = '/roster/connect/?biz=' + encodeURIComponent(BIZ.slug);
    $('#bizSwitch').hidden = !(row.is_super || mine.length > 1);   // החלפת עסק: למי שיש לו יותר מעסק אחד (הבעלים תמיד)
    document.body.classList.remove('locked'); $('#gate').hidden = true;
    load();
    startRealtime();
  }



  /* ===== מנגנון זמן אמת לשינויים (28.10.26): כל כתיבה לשרת עוברת כאן, ולכן מקבלת אוטומטית (1) "שינוי ממתין" שמוחל על כל קריאה שהתחילה לפני שהכתיבה נקלטה,
     כך שלא רואים ערך חדש, ישן, חדש בגלל טעינה מחדש מהזמן אמת, ו-(2) אפקט המתנה על האובייקט שהמשתמש לחץ עליו, עד שהתשובה מגיעה ===== */
  const WOV = [];   // { table, match(row), patch | del | rows | upsert, doneAt, exp }
  const WOV_SKIP = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  function wovParse(path) {
    const qi = path.indexOf('?'), table = qi < 0 ? path : path.slice(0, qi), q = new URLSearchParams(qi < 0 ? '' : path.slice(qi + 1)), tests = [];
    for (const [k, v] of q) {
      if (WOV_SKIP.has(k)) continue;
      let m;
      if ((m = /^eq\.(.*)$/.exec(v))) { const x = m[1]; tests.push((r) => String(r[k]) === x); }
      else if ((m = /^neq\.(.*)$/.exec(v))) { const x = m[1]; tests.push((r) => String(r[k]) !== x); }
      else if (v === 'is.null') tests.push((r) => r[k] == null);
      else if ((m = /^in\.\((.*)\)$/.exec(v))) { const set = new Set(m[1].split(',').map((s) => s.replace(/^"|"$/g, ''))); tests.push((r) => set.has(String(r[k]))); }
      else return { table, match: null };   // תנאי שלא נתמך: בלי שינוי ממתין (הקוד שקורא מטפל בעצמו)
    }
    return { table, match: (r) => tests.every((f) => f(r)), conflict: q.get('on_conflict') };
  }
  function wovApply(table, rows) {
    const now = Date.now();
    for (let i = WOV.length - 1; i >= 0; i--) { if (WOV[i].exp <= now) WOV.splice(i, 1); }
    WOV.forEach((o) => {
      if (o.table !== table) return;
      if (o.del && o.match) { for (let i = rows.length - 1; i >= 0; i--) if (o.match(rows[i])) rows.splice(i, 1); }
      else if (o.patch && o.match) rows.forEach((r) => { if (o.match(r)) Object.assign(r, o.patch); });
      else if (o.upsert) { const hit = rows.find((r) => o.upsert.cols.every((c) => String(r[c]) === String(o.upsert.row[c]))); if (hit) Object.assign(hit, o.upsert.row); else rows.push(Object.assign({}, o.upsert.row)); }
      else if (o.rows) o.rows.forEach((nr) => { const hit = nr.id != null ? rows.find((r) => r.id === nr.id) : null; if (hit) Object.assign(hit, nr); else if (nr.id != null) rows.push(Object.assign({}, nr)); });
    });
    return rows;
  }
  /* אובייקט שהמשתמש לחץ עליו ממש עכשיו: מקבל אפקט המתנה בזמן שהכתיבה בדרך */
  let lastUi = { el: null, t: 0 };
  ['pointerdown', 'click', 'change', 'input', 'keydown'].forEach((ev) => document.addEventListener(ev, (e) => { if (e.target && e.target.closest) lastUi = { el: e.target, t: Date.now() }; }, true));
  const UI_SEL = 'button, input, select, textarea, .row, .mrow, .dline, .stc, .chip, .hfilt, .mtr, .ptag, .swcur, .medit, .qopt, .mtoggle, .field';
  function uiTargetFor() {
    if (Date.now() - lastUi.t > 1500 || !lastUi.el || !lastUi.el.closest) return null;
    const el = lastUi.el.closest(UI_SEL);
    return el && !el.closest('#status') ? el : null;
  }
  let mailFailHook = null, mailFailPrimeFn = null, mailOfferHook = null;   // "אישור מקום" בוואטסאפ כשהמייל לא יוצא (מוגדרים בהמשך)
  async function api(path, { method = 'GET', body, prefer, ui } = {}) {
    const isRead = method === 'GET', t0 = Date.now(), pr = wovParse(path), table = pr.table;
    let ov = null, rel = null;
    if (!isRead) {
      const target = ui === false ? null : (ui || uiTargetFor());
      if (target && window.HRT) rel = HRT.busy(target);
      if (method === 'PATCH' && pr.match && body) ov = { table, match: pr.match, patch: body };
      else if (method === 'DELETE' && pr.match) ov = { table, match: pr.match, del: true };
      else if (method === 'POST' && body && !Array.isArray(body)) {
        const cols = (pr.conflict ? pr.conflict.split(',') : ['email', 'key', 'id'].filter((c) => body[c] != null).slice(0, 1));
        if (/merge-duplicates/.test(prefer || '') && cols.length && cols.every((c) => body[c] != null)) ov = { table, upsert: { cols, row: body } };
      }
      if (ov) { ov.doneAt = null; ov.exp = Date.now() + 60000; WOV.push(ov); }
    }
    try {
      const headers = { apikey: DB.key, Authorization: 'Bearer ' + await AUTH.token(), 'x-business': BIZ.id };   // הטוקן מהכניסה המשותפת (מתחדש שם), והעסק בכותרת
      if (body) headers['Content-Type'] = 'application/json';
      if (prefer) headers.Prefer = prefer;
      const res = await fetch(DB.url + '/rest/v1/' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
      if (res.status === 401) { const so = new Error('signed out'); so.signedOut = true; throw so; }
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) {
        const err = new Error((data && data.message) || ('HTTP ' + res.status));
        err.code = data && data.code;
        throw err;
      }
      if (!isRead) {
        if (method === 'POST' && Array.isArray(data) && data.length && !ov && !table.startsWith('rpc/')) { ov = { table, rows: data.map((x) => Object.assign({}, x)), doneAt: null, exp: Date.now() + 60000 }; WOV.push(ov); }
        if (ov) { ov.doneAt = Date.now(); ov.exp = Date.now() + 15000; }
        if (mailFailHook && (table === T.pay || table === T.a)) mailFailHook();   // תשלום או שיוך נכתבו: אולי המערכת ניסתה לשלוח מייל
        if (mailOfferHook && (table === T.pay || table === T.a)) mailOfferHook(table, method, path, body);   // מנהל סגר תשלום או סימן "לא לתשלום": פופאפ לשליחה (מייל או וואטסאפ), בלי שליחה אוטומטית
        if (method === 'DELETE' && window.ROSTER_KIT && window.ROSTER_KIT.deleted) window.ROSTER_KIT.deleted(table, path);   // roster kit: offers the undo of this delete (admin-kit.js)
        return data;
      }
      if (Array.isArray(data)) {
        /* שינוי שנקלט לפני שהקריאה הזו התחילה כבר כלול בה: מסירים אותו; כל השאר מוחל על התוצאה */
        for (let i = WOV.length - 1; i >= 0; i--) { const o = WOV[i]; if (o.table === table && o.doneAt != null && t0 >= o.doneAt) WOV.splice(i, 1); }
        wovApply(table, data);
      }
      return data;
    } catch (err) {
      if (ov) { const i = WOV.indexOf(ov); if (i >= 0) WOV.splice(i, 1); }
      if (err && err.signedOut) sessionLost();
      throw err;
    } finally { if (rel) rel(); }
  }

  /* ---------- עזרים ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const todayISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /* גיל מוצג = הגיל שהוקלד + שנים מלאות מאז שהוקלד */
  function shownAge(p) {
    if (p.age == null) return null;
    const [y, m, d] = String(p.age_set_at || todayISO()).split('-').map(Number);
    const now = new Date();
    let years = now.getFullYear() - y;
    if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) years--;
    return p.age + Math.max(0, years);
  }

  /* קישור שיחה (tel:) בפורמט בינלאומי; מספר ישראלי מקומי הופך ל-+972 */
  function telLink(phone) {
    const raw = String(phone || '').trim();
    let n = digits(raw);
    if (!n) return null;
    if (raw.startsWith('+')) return 'tel:+' + n;
    if (n.startsWith('00')) return 'tel:+' + n.slice(2);
    if (n.startsWith('0')) return 'tel:+972' + n.slice(1);
    if (n.length === 9) return 'tel:+972' + n;
    return 'tel:+' + n;
  }
  /* תאריך הרשמה/יצירה (created_at), בשעון ישראל: 5.10.26 */
  function regDate(p) {
    if (!p.created_at) return '';
    const d = new Date(p.created_at); if (isNaN(d)) return '';
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: 'numeric', month: 'numeric', year: '2-digit' }).formatToParts(d);
    const g = (k) => parts.find((x) => x.type === k).value;
    return g('day') + '.' + g('month') + '.' + g('year');
  }
  /* תאריך ושעה (שעון ישראל), למשל 11.10.26 בשעה 20:35 */
  function regDateTime(p) {
    const base = regDate(p); if (!base) return '';
    const tm = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(p.created_at));
    return base + ' בשעה ' + tm;
  }
  /* קישור לשיחת וואטסאפ (31.10.26): במחשב ישר לאפליקציית וואטסאפ (whatsapp://, בלי לשונית של wa.me בדפדפן); בטלפון wa.me, שנפתח ישר באפליקציה */
  const WA_DESK = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  /* בחירת האפליקציה ב"החשבון שלי", לכל מנהל. אנדרואיד: intent עם package, וכשהאפליקציה לא מותקנת wa.me פותח את האחרת; ברירת מחדל ביזנס. אייפון: ביזנס ב-whatsapp-smb:// (לא מתועד רשמית), רגיל ב-wa.me כמו קודם; ברירת מחדל רגיל, כי אפליקציה שלא מותקנת נותנת שם שגיאה. במחשב אין דרך לבחור */
  const WA_ANDROID = /Android/i.test(navigator.userAgent), WA_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), WA_PKG = { biz: 'com.whatsapp.w4b', reg: 'com.whatsapp' };
  const waApp = () => { const c = state.viewScopes._g; return c && (c.waApp === 'reg' || c.waApp === 'biz') ? c.waApp : (WA_IOS ? 'reg' : 'biz'); };
  function waLink(phone, text) {
    let n = digits(phone);
    if (!n) return null;
    if (n.startsWith('0')) n = '972' + n.slice(1);
    else if (n.length === 9) n = '972' + n;
    const t = text ? encodeURIComponent(text) : '';
    const web = 'https://wa.me/' + n + (t ? '?text=' + t : ''), q = 'send?phone=' + n + (t ? '&text=' + t : '');
    if (WA_ANDROID) return 'intent://' + q + '#Intent;scheme=whatsapp;package=' + WA_PKG[waApp()] + ';S.browser_fallback_url=' + encodeURIComponent(web) + ';end';
    if (WA_IOS) return waApp() === 'biz' ? 'whatsapp-smb://' + q : web;
    return WA_DESK && !/[\u{10000}-\u{10FFFF}]/u.test(text || '') ? 'whatsapp://' + q : web;   // אפליקציית וואטסאפ במחשב מציגה אימוג'י (תו של 4 בתים, כמו 🙂) כסימן שאלה כשהוא עובר בקישור whatsapp://: הודעה עם אימוג'י נפתחת דרך wa.me (לשונית שעוברת לאפליקציה), ובלי אימוג'י ישר באפליקציה
  }
  const waTgt = (href) => /^https?:/.test(href || '') ? ' target="_blank" rel="noopener"' : '';   // קישור אינטרנט בלשונית חדשה; קישור לאפליקציה בלי לשונית

  /* מספר ישראלי בפורמט בינלאומי (+972...) מוצג כמספר מקומי שמתחיל באפס */
  function localPhone(phone) {
    const s = String(phone || '').trim(), d = digits(s);
    return /^\+?972\d{8,9}$/.test(s.replace(/[\s-]/g, '')) ? '0' + d.slice(3) : s;
  }

  const phoneHay = (p) => digits(p.phone) + ' ' + digits(localPhone(p.phone));   // חיפוש גם לפי 05... וגם לפי 972...

  /* ולידציה ונרמול טלפון (זהה ללוגיקה של phone_norm בבסיס הנתונים): ריק, או מספר ישראלי / בינלאומי תקין */
  function normPhone(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    let plus = s[0] === '+', d = s.replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('00')) { plus = true; d = d.slice(2); }
    const IL = /^(5\d{8}|7\d{8}|[23489]\d{7})$/;
    if (plus) {
      if (d.startsWith('9720')) d = '972' + d.slice(4);
      if (d.length < 8 || d.length > 15 || d[0] === '0') return '';
      if (d.startsWith('972') && !IL.test(d.slice(3))) return '';
      return '+' + d;
    }
    if (d[0] === '0') return IL.test(d.slice(1)) ? '+972' + d.slice(1) : '';
    return '';
  }
  /* מחזיר את הערך לשמירה (ישראלי: 05XXXXXXXX), '' לריק, או null אם לא תקין */
  function phoneToSave(raw) {
    if (!String(raw || '').trim()) return '';
    const n = normPhone(raw);
    return n ? localPhone(n) : null;
  }
  /* אימייל: ריק (מנקה), או כתובת תקינה עד 254 תווים, נשמרת באותיות קטנות; null כשהצורה לא תקינה */
  const emailToSave = (raw) => { const s = String(raw || '').trim().toLowerCase(); if (!s) return ''; return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null; };
  function badEmail(on) {
    pForm.email.style.borderColor = on ? 'var(--red)' : '';
    if (on) { toast('כתובת האימייל לא תקינה'); pForm.email.focus(); }
  }
  function badPhone(on) {
    pForm.phone.style.borderColor = on ? 'var(--red)' : '';
    if (on) { toast('מספר הטלפון לא תקין'); pForm.phone.focus(); }
  }


  const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
  function meetingLabel(m, withDay) {
    const [y, mo, d] = m.meeting_date.split('-').map(Number);
    const day = DAYS[new Date(y, mo - 1, d).getDay()];
    return (withDay ? 'יום ' + day + ' ' : '') + d + '.' + mo + ' · ' + String(m.meeting_time).slice(0, 5);
  }
  const isPast = (m) => m.meeting_date < todayISO();
  const meetKey = (m) => m.meeting_date + m.meeting_time;   // מפתח מיון: תאריך ושעה
  const meetAsc = (a, b) => meetKey(a).localeCompare(meetKey(b));   // מהישן לחדש
  const meetDesc = (a, b) => meetKey(b).localeCompare(meetKey(a));   // מהחדש לישן
  const startMs = (m) => { const [y, mo, d] = m.meeting_date.split('-').map(Number), [h, mi] = String(m.meeting_time).split(':').map(Number); return Date.UTC(y, mo - 1, d, h, mi); };   // רגע תחילת המפגש (שעון ישראל כמו UTC)
  const openMenus = () => FLOAT_MENUS.filter((m) => { const x = m.el(); return x && !x.hidden; });   // התפריטים הצפים הפתוחים
  /* המפגש הקרוב: הראשון שעוד לא עבר (לפי תאריך ושעה). בטעינה הראשונה של הדף נפתחים עליו, אלא אם הגיעו בקישור עמוק או שבחרו במפורש "כל המשתתפים" (נשמר בלשונית, ולכן גם רענון משאיר את הבחירה) */
  const nextMeetingOf = () => state.meetings.filter((m) => !isPast(m)).sort(meetAsc)[0] || null;
  let autoMeetDone = false;
  /* המפגש שעליו מסמנים הגעה ברשימה הראשית: המפגש שנבחר בכותרת, אחרת הקרוב ביותר (או של היום) */
  /* מדרגות מחיר לכל מפגש (העמודה price_tiers, מועתקת למפגש חדש מהמפגש הקודם): { base, steps: [{ days, price }], final }.
     base = המחיר הרגיל (מתחילת ההרשמה), כל שלב = "החל מ-N ימים לפני המפגש" והמחיר שלו (האחרון חל עד יום המפגש).
     המחיר ביום מסוים: המדרגה שמתחילה הכי קרוב למפגש מבין אלה שכבר התחילו, אחרת base */
  const DEFAULT_TIERS = { base: 0, steps: [] };   // רק למפגש שעדיין אין לו מדרגות
  const tiersOf = (m) => { const q = m && m.price_tiers; if (q && !Array.isArray(q) && Number.isFinite(Number(q.base))) return { base: Number(q.base), steps: (Array.isArray(q.steps) ? q.steps : []).map((x) => ({ days: Number(x.days), price: Number(x.price) })).filter((x) => x.days >= 1 && Number.isFinite(x.price)).sort((a, b) => b.days - a.days) }; return JSON.parse(JSON.stringify(DEFAULT_TIERS)); };
  const quickPrices = (m) => { const q = tiersOf(m); return [...new Set([q.base].concat(q.steps.map((x) => x.price)))]; };
  const priceForDays = (left, m) => { const q = tiersOf(m); const s = q.steps.filter((x) => left <= x.days).sort((a, b) => a.days - b.days)[0]; return s ? s.price : q.base; };
  const daysTo = (m, iso) => { const a = m.meeting_date.split('-').map(Number), b = (iso || todayISO()).split('-').map(Number); return Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 864e5); };
  const defaultPrice = (m, iso) => priceForDays(daysTo(m, iso), m);
  /* קרדיט משתתף: סכומים שנשארו אצלנו בביטול בלי החזר כסף, פחות מה ששימש לתשלום חדש */
  const creditOf = (pid) => state.payments.filter((x) => x.participant_id === pid && !x.pkg && !(x.kind === 'deposit' && x.pkg_n > 0)).reduce((s, x) => s + ((x.kind === 'credit' || x.kind === 'deposit') ? Number(x.amount) : ((x.kind === 'payment' || x.kind === 'refund') && x.from_credit ? -Number(x.amount) : 0)), 0);
  /* שיווק ממומן: ערוצי פרסום ממומן (שם וצבע) ושיווק ממומן (שם, צבע ועמלה). הצבע מופיע בתגית הגיל ברשימה ובכותרת הפופאפ */
  const channelOf = (p) => promoterOf(p.promoter_id) || null;   // דרך ההגעה של המשתתף: לפי הבחירה שלו
  /* דרך ההגעה למפגש מסוים: נשמרת לכל הרשמה (source_promoter_id). בתוך מפגש הצבע והסינון לפי ההרשמה למפגש הזה, ובשאר התצוגות לפי הדרך שבה המשתתף הגיע בפעם הראשונה */
  const channelAt = (p, mid) => { if (!mid) return channelOf(p); const l = linkOf(p.id, mid); return (l && promoterOf(l.source_promoter_id)) || null; };
  const originOf = (p, mid) => { const x = channelAt(p, mid); if (x) return { kind: 'pr', name: x.name, color: x.color || 'red' }; return null; };
  const firstArrive = (pid) => { if (state.att.some((l) => l.participant_id === pid)) return {}; const p = partOf(pid), x = p && channelOf(p); return x ? { source_promoter_id: x.id } : {}; };   // ההרשמה הראשונה מקבלת את דרך ההגעה של המשתתף (כמו הטריגר, כדי שהצבע יופיע מיד)
  const originAttr = () => '';   // the arrival route no longer colours the age and gender: it is a small chip at the end of the name row (srcChip)
  const srcChip = (p, mid) => { const o = originOf(p, mid); if (!o) return ''; const c = PALETTE[o.color] || PALETTE.sky; return '<span class="osrc" style="background:' + c[0] + ';color:' + c[1] + '" title="' + esc(o.name) + '">' + esc(o.name) + '</span>'; };   // צבע דרך ההגעה: בטקסט בלבד, בלי רקע
  const promoterOf = (id) => state.promoters.find((x) => x.id === id);
  const calcCommission = () => '';   // העלות לא נחרטת על התשלום: היא מחושבת לפי התעריף הנוכחי על מה שעוד לא הוסדר (payCostOf)
  /* עמלה מתשלום: אחוז = על כל תשלום; ₪ קבוע = פעם אחת למשתתף (בתשלום הראשון) */
  const commOnEvery = (pr) => !!(pr && pr.cost_from_payment && pr.rate_type === 'percent');
  /* כסף שהמשתתף שילם בפועל (בלי הקצאות מהקרדיט, פחות החזרים), והלידים של שיווק ממומן */
  const cashOf = (x) => (((x.kind === 'payment' || x.kind === 'deposit') && !x.from_credit) ? Number(x.amount) : x.kind === 'refund' ? -Number(x.amount) : 0);
  const netPaid = (pid) => state.payments.filter((x) => x.participant_id === pid).reduce((s, x) => s + cashOf(x), 0);
  const srcLeads = (id) => state.participants.filter((q) => (channelOf(q) || {}).id === id);
  /* עלות מהתשלום של שיווק ממומן, על התשלומים שמאז ההתחשבנות האחרונה ולפי התעריף הנוכחי, כך ששינוי תעריף חל על כל מה שעוד לא הוסדר. אחוז: מכל תשלום (החזר מקטין). ₪ קבוע: פעם אחת למשתתף, על התשלום הראשון, אם לא הוחזר */
  function payCostOf(id, lastTs, rate, pct) {
    const out = [];
    srcLeads(id).forEach((q) => {
      const recs = state.payments.filter((r) => r.participant_id === q.id && cashOf(r) !== 0).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      if (pct) recs.forEach((r) => { if (String(r.created_at || '') > lastTs) out.push({ q, r, amount: cashOf(r) * rate / 100 }); });
      else { const f = recs.find((r) => cashOf(r) > 0); if (f && String(f.created_at || '') > lastTs && netPaid(q.id) > 0) out.push({ q, r: f, amount: rate }); }
    });
    return out;
  }
  /* מעבר בין סוגי עלות (עלות לליד, ₪ מהתשלום, % מהתשלום): הערך החדש מחושב כך שהסכום "לתשלום" נשאר אותו דבר. בלי מה לשלם: לפי העלות הכוללת של כל הזמן. בלי נתונים הערך לא משתנה */
  function costRateFor(x, to) {
    const r = Number(x.rate) || 0, leads = srcLeads(x.id), led = ledgerOf(x.id), base = (ts) => ({ L: leads.filter((q) => String(q.created_at || '') > ts).length, P: payCostOf(x.id, ts, 1, false).length, S: payCostOf(x.id, ts, 100, true).reduce((t, c) => t + c.amount, 0) });
    const per = (n) => (to === 'lead' ? n.L : to === 'percent' ? n.S : n.P), val = (t, d) => Math.round(t / d * (to === 'percent' ? 100 : 1) * 100) / 100;
    const open = base(led.lastTs);
    if (led.balance > 0 && per(open) > 0) return { rate: val(led.balance, per(open)), kept: led.balance };
    const all = base(''), total = !x.cost_from_payment ? r * all.L : x.rate_type === 'percent' ? all.S * r / 100 : r * all.P;
    return total > 0 && per(all) > 0 ? { rate: val(total, per(all)), L: all.L, P: all.P } : null;
  }
  /* תצוגת ההגעה (מונה, הדגשת שורה, כפתור "הגיע") מופיעה החל מחצי שעה לפני תחילת המפגש (שעון ישראל) */
  const nowIL = () => {
    const s = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const [d, tm] = s.split(' '), [y, mo, da] = d.split('-').map(Number), [h, mi] = tm.split(':').map(Number);
    return Date.UTC(y, mo - 1, da, h % 24, mi);
  };
  /* סוגי מפגשים (31.10.26): לכל מפגש סוג (roster_meetings.type_id); מפגש בלי סוג שייך לסוג הראשון. לסוג: פרטי ברירת מחדל למפגש חדש, תגיות משלו, מתי נפתח סימון ההגעה וההודעה לפני המפגש */
  const firstTypeId = () => (state.mtypes[0] || {}).id || null;
  const typeIdOf = (m) => (m && m.type_id) || firstTypeId();
  const typeById = (id) => state.mtypes.find((t) => t.id === id) || null;
  const typeOf = (m) => typeById(typeIdOf(m));
  const sortMeetings = () => state.meetings.sort(meetDesc);   // מהחדש לישן

  const linksOf = (pid) => state.att.filter((a) => a.participant_id === pid);
  /* כמות המפגשים של משתתף: מפגשים שהגיע אליהם (came) ועוד מפגשים שעוד לא עברו שהוא משוריין אליהם (next); בסוג מפגש: רק של הסוג */
  const meetCounts = (p) => { let came = 0, next = 0; linksOf(p.id).forEach((l) => { const m = meetOf(l.meeting_id); if (state.mtype && !(m && typeIdOf(m) === state.mtype)) return; if (l.attended) came++; else if (m && !isPast(m) && reservedOf(p.id, l.meeting_id)) next++; }); return { came, next }; };
  const meetCountOf = (p) => { const c = meetCounts(p); return c.came + c.next; };
  const MC_B = [['0', '0'], ['1', '1'], ['2', '2'], ['3', '3+']];   // קבוצות מספר המפגשים בתפריט הסינון
  const mcKey = (p) => { const n = meetCountOf(p); return n >= 3 ? '3' : String(n); };
  const linkOf = (pid, mid) => state.att.find((a) => a.participant_id === pid && a.meeting_id === mid);

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
  }
  function fail(err) {
    if (err && err.signedOut) return;   // הכניסה פגה: מסך הכניסה כבר מוצג
    console.error(err);
    if (/promoter_code_taken/.test(String((err && (err.message || err.details || err.hint)) || err))) { toast('הקוד כבר קיים אצל שיווק ממומן אחר. כל קוד חייב להיות ייחודי'); return; }
    toast('משהו השתבש, לא נשמר. נסו שוב');
  }

  const closeHMenu = () => { $('#hMenu').hidden = true; $('#menuBtn').setAttribute('aria-expanded', 'false'); };
  const menuX = (m, btn) => { const r = btn.getBoundingClientRect(), mw = m.offsetWidth; return Math.max(8, Math.min(Math.round(r.left + r.width / 2 - mw / 2), window.innerWidth - mw - 8)); };   // כל תפריט צף: ממורכז אופקית לכפתור שפתח אותו, ובקצוות נשאר 8 פיקסל מהקצה
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#hMenu'); m.hidden = !m.hidden; $('#menuBtn').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) { const r = $('#menuBtn').getBoundingClientRect(); m.style.position = 'fixed'; m.style.right = 'auto'; m.style.top = Math.round(r.bottom + 8) + 'px'; m.style.left = menuX(m, $('#menuBtn')) + 'px'; } });
  $('#hMenu').addEventListener('click', closeHMenu);
  /* תפריט פתוח: לחיצה בחוץ רק סוגרת אותו (לא מפעילה את מה שמתחתיו); הלחיצה הבאה פועלת כרגיל */
  /* כלל כללי לכל התפריטים הצפים: כשתפריט פתוח, לחיצה בכל מקום מחוצה לו (גם על כפתור או צ'יפ אחר) רק סוגרת אותו ושום דבר אחר לא נפתח או משתנה. מותר רק לתוך התפריט ולכפתור שפותח אותו (שסוגר אותו) */
  const FLOAT_MENUS = [
    { el: () => $('#finPerMenu'), keep: '#finPerMenu, #finPerBtn', close: () => { $('#finPerMenu').hidden = true; $('#finPerBtn').setAttribute('aria-expanded', 'false'); } },
    { el: () => $('#fMenu'), keep: '#fMenu', close: () => { $('#fMenu').hidden = true; $('#fMenu').dataset.kind = ''; } },
    { el: () => $('#qMenu'), keep: '#qMenu', close: () => closeQ() },
    { el: () => $('#chipMenu'), keep: '#chipMenu', close: () => { $('#chipMenu').hidden = true; } },
    { el: () => document.getElementById('colMenu'), keep: '#colMenu', close: () => { const m = document.getElementById('colMenu'); if (m) m.hidden = true; } },
    { el: () => $('#hMenu'), keep: '.hicons', close: () => closeHMenu() },
    { el: () => $('#mMenu'), keep: '.msel', close: () => closeMSel() },
  ];
  document.addEventListener('click', (e) => {
    const open = openMenus();
    if (!open.length) return;
    if (open.some((m) => e.target.closest(m.keep))) return;
    e.preventDefault(); e.stopImmediatePropagation(); open.forEach((m) => m.close());
  }, true);
  /* חסימה מלאה של הרקע כשתפריט פתוח (כמו שכבת-על): לא רק הלחיצה, אלא גם נגיעה, גרירה, גלילה ולחיצה ארוכה מחוץ לתפריט לא מגיעות לשום דבר מאחוריו (שורות, צ'יפים, החלקה לסגירת פופאפ). הלחיצה עצמה (click) סוגרת את התפריט בטיפול למעלה. */
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'touchmove', 'dblclick', 'contextmenu', 'wheel'].forEach((type) => {
    document.addEventListener(type, (e) => {
      const open = openMenus();
      if (!open.length || open.some((m) => e.target.closest && e.target.closest(m.keep))) return;
      e.stopImmediatePropagation();
      if ((type === 'touchmove' || type === 'wheel' || type === 'contextmenu' || type === 'dblclick' || type === 'mousedown') && e.cancelable) e.preventDefault();   // בלי preventDefault על touchstart/pointerdown: הם מייצרים את ה-click שסוגר. mousedown: הסמן לא עובר לשדה שמאחורי התפריט (למשל תיבת ההערה), וה-click שסוגר עדיין נוצר
    }, { capture: true, passive: false });
  });
  /* גם הקלדה לא מגיעה לשדות שמאחורי תפריט פתוח (למשל תיבת ההערה בכרטיס המשתתף): רק Escape (סוגר) ו-Tab עוברים */
  ['keydown', 'keypress', 'beforeinput', 'paste'].forEach((type) => {
    document.addEventListener(type, (e) => {
      if (type === 'keydown' && (e.key === 'Escape' || e.key === 'Tab')) return;
      const open = openMenus();
      const t = e.target; if (!open.length || !t || open.some((m) => t.closest && t.closest(m.keep))) return;
      if (!(t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.cancelable) e.preventDefault(); e.stopImmediatePropagation();
      if (document.activeElement === t) try { t.blur(); } catch (x) {}   // המקלדת נסגרת עד שהתפריט נסגר
    }, true);
  });
  let escMenuAt = 0;   // Escape עם תפריט פתוח סוגר רק את התפריט, לא את הפופאפ שמתחתיו
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && FLOAT_MENUS.some((m) => { const x = m.el(); return x && !x.hidden; })) { escMenuAt = Date.now(); e.preventDefault(); } }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') FLOAT_MENUS.forEach((m) => { const x = m.el(); if (x && !x.hidden) m.close(); }); });
  /* גם סימון טקסט (לחיצה ארוכה במובייל, גרירה בעכבר) לא אפשרי מאחורי תפריט פתוח (31.10.26): html.menu-open מבטל בחירת טקסט בכל הדף,
     selectstart מחוץ לתפריט מבוטל, וסימון שכבר קיים נמחק ברגע שתפריט נפתח. המצב מתעדכן לבד כשתפריט נפתח או נסגר (שינוי hidden בכל מקום בדף) */
  const anyMenuOpen = () => FLOAT_MENUS.some((m) => { const x = m.el(); return x && !x.hidden; });
  let menuLock = false, floatPushed = false;
  const floatNav = { close() { openMenus().forEach((m) => m.close()); } };
  const syncMenuLock = () => {
    FLOAT_MENUS.forEach((m) => { const x = m.el(); if (x) x.classList.toggle('fm-open', !x.hidden); });   // רק התפריט הפתוח מקבל לחיצות (ראו html.menu-open ב-CSS)
    const on = anyMenuOpen(); if (on === menuLock) return; menuLock = on;
    /* חזרה בדפדפן כשתפריט צף פתוח סוגרת רק אותו (רשומת היסטוריה אחת לכל זמן שתפריט פתוח), במקום לצאת מהדף */
    if (on && !floatPushed) { floatPushed = true; NAV.stack.push({ d: floatNav, sub: 0 }); try { history.pushState({ nav: 1 }, ''); } catch (e) {} }
    else if (!on && floatPushed) { floatPushed = false; navClose(floatNav); }
    document.documentElement.classList.toggle('menu-open', on);
    if (on) try { const sel = window.getSelection(); if (sel && sel.rangeCount) sel.removeAllRanges(); } catch (e) {}
  };
  new MutationObserver(syncMenuLock).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('selectstart', (e) => {
    const open = openMenus(); if (!open.length) return;
    const t = e.target && e.target.nodeType === 3 ? e.target.parentElement : e.target;
    if (t && t.closest && open.some((m) => t.closest(m.keep))) return;
    e.preventDefault();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHMenu(); });

  /* פופאפ משתתף פתוח: רשימת ההערות והמפגשים מתעדכנות בזמן אמת (רק כשמשהו השתנה, בלי לגעת בשדה ההקלדה) */
  let sheetSig = '';
  const payTomb = new Map();   // הקצאות שנמחקו הרגע: טעינה מחדש שהתחילה לפני המחיקה לא מחזירה אותן (מונע הבהוב)
  function refreshOpenSheet() {
    if (!(sheet && sheet.id && (pDlg.open || allocDlg.open))) { sheetSig = ''; return; }
    if (sheet.depLock && Date.now() < sheet.depLock) { sheetSig = ''; setTimeout(refreshOpenSheet, Math.max(100, sheet.depLock - Date.now() + 50)); return; }   // באמצע מעבר בין משלם / לא לתשלום / חוב: לא מציירים מחדש מנתוני ביניים
    /* חתימה של כל מה שמוצג בכרטיס המשתתף: הערות, שיוכים ותגיות, תשלומים והקצאות, ופרטי המשתתף; כשמשהו מזה משתנה (גם ממנהל אחר) הכרטיס והמסך הפתוח מתעדכנים בזמן אמת */
    const pid = sheet.id, pp = partOf(pid) || {};
    const sig = notesOf(pid).map((n) => n.id + (n.mail_id || '') + (n.mail_failed ? (n.mail_noaddr ? '?' : '!') : '')).join(',') + '|' + state.att.filter((a) => a.participant_id === pid).map((a) => [a.meeting_id, a.attended, a.paid_amount, a.details_sent_at, a.status_key, a.no_pay, a.pay_later_at, a.pay_due_amount, a.pay_closed_at].join(':')).join(',')
      + '|' + state.payments.filter((x) => x.participant_id === pid).map((x) => [x.id, x.kind, x.amount, x.method, x.meeting_id, x.from_credit].join(':')).join(',')
      + '|' + [pp.name, pp.phone, pp.email, pp.age, pp.gender, pp.promoter_id, pp.active].join(':');
    if (sig === sheetSig) return; sheetSig = sig;
    renderNotes(); refreshSheetMeetings(); renderContact();
    renderWallet();   // דף הקרדיט
    if (allocDlg.open && allocHome && allocHome.key === 'credit' && sheet.refundSync) sheet.refundSync();
    if (allocDlg.open && allocHome && allocHome.key === 'deposit') { paintDepLines(); if (sheet.paintMeth) sheet.paintMeth(); }   // מסך הקצאות הכסף למפגש (לא נוגע בשדה הסכום שמוקלד)
  }
  /* ---------- טעינה ---------- */
  let loadSeq = 0, loadApplied = 0;
  /* סמל ליד השם (ברשימה ובכותרת כרטיס המשתתף): משתתף מחוק, פח אדום, וגם השם באדום (nameCls). ב-title ההסבר */
  function stMark(p) {
    return p.active === false ? { k: 'trash', red: true, t: 'משתתף מחוק' } : null;
  }
  /* השם עם סמל המצב צמוד למילה האחרונה (לא יורד לבד לשורה, ובגובה הטקסט): בשם בעברית המילה האחרונה והסמל עטופים יחד; בשם באנגלית כל השם והסמל יחד */
  const nameMark = (p, sz) => { const mk = glMark(p, sz), t = String(p.name || '').trim(); if (!mk) return '<bdi>' + esc(t) + '</bdi>'; const i = t.lastIndexOf(' '); if (/[\u0590-\u05FF]/.test(t) && i > 0) return '<bdi>' + esc(t.slice(0, i)) + ' <span class="nwrap">' + esc(t.slice(i + 1)) + mk + '</span></bdi>'; return '<span class="nwrap"><bdi>' + esc(t) + '</bdi>' + mk + '</span>'; };
  const glMark = (p, sz) => { const m = stMark(p); return m ? '<span class="glk' + (m.red ? ' red' : '') + '" title="' + esc(m.t) + '" aria-label="' + esc(m.t) + '">' + icon(m.k, sz || 'i16') + '</span>' : ''; };
  const nameCls = (p) => { const m = stMark(p); return m && m.red ? ' warn' : ''; };
  /* מצב החשבון השתנה (זמן אמת): הכותרת של כרטיס המשתתף הפתוח מתעדכנת (הסמל ליד השם) */
  function repaintTitle() {
    let sh = null; try { sh = sheet; } catch (e) { return; }   // לפני שהכרטיס הוגדר
    if (!sh || !sh.id || pTab !== 'main') return;
    const p = partOf(sh.id); if (p) setTitle(p);
  }
  /* התאמה לחיפוש, אחת לכל המקומות: שם, טלפון (05... או 972...) וטקסט ההערות */
  const qMatch = (p, q, qd) => p.name.toLowerCase().includes(q) || (qd.length >= 2 && phoneHay(p).includes(qd)) || hasNote(p, q);
  async function load(silent) {
    if (!silent) { $('#status').innerHTML = '<div class="empty">טוען…</div>'; document.documentElement.classList.add('is-loading'); }   // מצב טעינה: "טוען..." בכותרת בלבד, בלי הקו ובלי מה שמתחתיו
    const myLoad = ++loadSeq;
    if (!silent) { updFrozen = null; remKeep = null; }   // טעינה מחדש: מסדרים לפי העדכון האחרון מחדש
    try {
      const [p, m, a, nn, prs, pps, pays, sts, pfs, pms, fin0, finr0, fintr0, mts, tpls0, sent0, mail0] = await Promise.all([
        api(T.p + '?select=*'),
        api(T.m + '?select=*'),
        api(T.a + '?select=participant_id,meeting_id,pay_requested_at,status_key,created_at,attended,attended_at,paid_amount,promoter_id,commission,paid_at,details_sent_at,no_pay,pay_later_at,pay_due_amount,pay_closed_at,source_promoter_id,ticket_price'),
        api(T.n + '?select=id,participant_id,body,author_email,author_name,created_at,has_image,system,event_type,new_status,meeting_id,meeting_short,status_label,status_color,amount,mail_id,mail_failed,mail_noaddr&order=created_at.desc'),
        api(T.pr + '?select=*&order=name.asc'),
        api(T.pp + '?select=*&order=paid_at.desc'),
        api(T.pay + '?select=*&order=created_at.desc'),
        api(T.st + '?select=*').catch(() => null),
        api(T.pf + '?select=*').catch(() => null),
        api(T.pm + '?select=*&order=sort.asc').catch(() => null),
        api(T.fin + '?select=*&order=entry_date.desc,created_at.desc').catch(() => null),
        api(T.finr + '?select=*&order=created_at.desc').catch(() => null),
        api(T.fintr + '?select=*&order=transfer_date.desc,created_at.desc').catch(() => null),
        api(T.mt + '?select=*&order=sort.asc,created_at.asc').catch(() => null),   // סוגי מפגשים
        api(T.tpl + '?select=*&order=sort.asc,created_at.asc').catch(() => null),   // תבניות הודעה לוואטסאפ (סוג מפגש או מפגש)
        api(T.sent + '?select=participant_id,meeting_id,tpl_key,sent_at').catch(() => null),   // מי קיבל איזו תבנית
        api(MAIL_LOG + '?select=participant_id,meeting_id&status=eq.sent&template=eq.payment_confirmed', { ui: false }).catch(() => null),   // מי קיבל את אישור המקום במייל
      ]);
      if (myLoad < loadApplied) return;   // טעינה ישנה שהסתיימה אחרי טעינה חדשה יותר: לא דורסת אותה
      loadApplied = myLoad;
      if (tpls0) state.tpls = tpls0;
      if (mailFailPrimeFn) mailFailPrimeFn();   // כישלונות מייל שכבר קיימים לא נשאלים מחדש
      if (sent0) state.msgSent = sent0;
      if (mail0) state.confMail = new Set(mail0.map((x) => x.participant_id + '|' + x.meeting_id));
      if (mts) { state.mtypes = mts; if (state.mtype && !typeById(state.mtype)) state.mtype = null; }
      state.fin = fin0 || []; state.finRec = finr0 || []; state.finTr = fintr0 || [];
      if (pms && pms.length) { const okPm = pms.filter((x) => OK_KEY.test(String(x.key))); if (okPm.length) state.payMethods = okPm.map((x) => Object.assign({}, x)); }
      if (pfs) { state.prefs = Object.fromEntries(pfs.map((x) => [String(x.email).toLowerCase(), x])); applyViewPrefs(); }
      if (sts) { state.statuses = sts.filter((x) => OK_KEY.test(String(x.key))).map((x) => Object.assign({}, x, { color: x.color === 'orange' ? 'red' : palName(x.color, 'sky') })); applyStatuses(); }
      /* משתתף שהוסר (active = false) מוסתר רק מרשימת כל המשתתפים (כשלא נבחר מפגש); במסך מפגש הוא מופיע כל עוד הוא משויך אליו, וכל הנתונים וההיסטוריה נשארים. יחזור אם יירשם שוב עם אותו טלפון */
      for (const x of p) if (!String(x.name || '').trim()) { x.name = localPhone(x.phone) || 'ללא שם'; x.noName = true; }   // בלי שם: במקום השם מוצג הטלפון (רק בתצוגה; השם נשמר בשדות שם פרטי ומשפחה)
      state.inactiveNames = new Map(p.filter((x) => x.active === false).map((x) => [x.id, x.name]));
      state.participants = p; state.meetings = m; if (state.filter && !m.some((x) => x.id === state.filter)) state.filter = null; a.forEach((l) => { if (l.status_key != null && !OK_KEY.test(String(l.status_key))) l.status_key = null; }); state.att = a; applyAttPending(); state.notes = nn;   // "הסרת משתתף" רק מסתירה אותו ברשימת כל המשתתפים; השיוכים, ההערות וההיסטוריה נשארים
      state.promoters = prs.map((x) => Object.assign(x, { color: palName(x.color, 'red') })); state.promoPays = pps; state.payments = pays.filter((x) => !((payTomb.get(x.id) || 0) > Date.now())); rebuildNotes();
      sortMeetings();
      if (!silent) { $('#status').innerHTML = ''; document.documentElement.classList.remove('is-loading'); }   // הנתונים הגיעו: יוצאים ממצב הטעינה (הציור באותו רגע, גם בקישור עמוק)
      setTimeout(prefetchNoteImages, 1500);   // טעינה מוקדמת של צילומי ההערות למטמון
      if (!silent && !autoMeetDone) { autoMeetDone = true; if (!(deep && (deep.m || deep.mt))) { const nm = nextMeetingOf(); if (nm) state.filter = nm.id; } }   // כתובת בלי מפגש ובלי סוג מפגש נפתחת על המפגש הקרוב
      if (deep) {
        const d = deep; deep = null;
        try { sessionStorage.removeItem('roster_deep'); } catch (e) {}
        if (d.m && state.meetings.some((x) => x.id === d.m)) state.filter = d.m;
        if (d.mt && typeById(d.mt) && !state.filter) state.mtype = d.mt;   // בחירה אחת: מפגש גובר על סוג
        { const ks = payKeys(d.pay).filter((k) => k === '__none' || state.statuses.some((x) => x.key === k)); if (ks.length) state.pay = ks.join(','); }   // סינון לפי תגית אחת מהקישור
        if (d.pd === '1' || d.pd === '0' || d.pd === 'n' || d.pd === 'x' || d.pd === 'l' || d.pd === 'r' || d.pd === 'u' || /^a\d+$/.test(d.pd || '') || /^m[A-Za-z0-9_]+$/.test(d.pd || '')) state.paidF = d.pd === 'x' ? 'n' : d.pd;   // x: קישור ישן של "לא שולם", שאוחד עם לא לתשלום
        if (d.at === '1' || d.at === '0') state.arrF = d.at;
        if (d.sv === '1' || d.sv === '0') state.sent = d.sv;
        if (d.bl === '1' || d.bl === '0' || d.bl === 'n' || d.bl === 'f') state.bal = d.bl;
        { const g = payKeys(d.g).filter((x) => x === 'male' || x === 'female' || x === 'none'); if (g.length) state.gender = g.join(','); }
        if (d.sc) state.srcF = d.sc;
        { const g = payKeys(d.mc).filter((x) => ['0', '1', '2', '3'].includes(x)); if (g.length) state.mcF = g.join(','); }
        { const g = payKeys(d.rg).filter((x) => UPD_B.some((u) => u[0] === x)); if (g.length) state.regF = g.join(','); }
        { const g = payKeys(d.up).filter((x) => UPD_B.some((u) => u[0] === x)); if (g.length) state.updF = g.join(','); }
        { const g = payKeys(d.ag).filter((x) => AGE_B.some((b) => b[0] === x)); if (g.length) state.ageF = g.join(','); }
        if (d.q) { state.q = d.q; $('#q').value = d.q; }
        urlReady = true;
        render();
        if (d.p && state.participants.some((x) => x.id === d.p)) {
          openParticipant(d.p, ['meets', 'contact', 'info'].includes(d.pt) ? d.pt : 'contact');
          if (['wallet', 'zikuy', 'credit', 'refund', 'pay'].includes(d.pt)) { viewStack = []; goView('wallet'); }
          if (d.ml && UUID_RE.test(String(d.ml))) openMail(d.ml);
          blurActive();
        }
        else if (d.tpl && state.tpls.some((x) => x.id === d.tpl)) { openTplPop(d.tpl); if (d.tplv) tplShowPrev(true); }
        else if (d.em === 'new') openMeeting(null);
        else if (d.em && state.meetings.some((x) => x.id === d.em)) openMeeting(d.em);
        else if (d.set || d.pr) {
          renderSettings(); $('#setDlg').showModal();
          const v = d.set;
          if (d.pr && promoterOf(d.pr)) { setRoot = 'src'; showSetView('src'); showPromoterDetail(d.pr); $('#prDlg').showModal(); }
          else if (/^(type|tydet|st|em):/.test(v || '') && typeById(v.split(':')[1])) { const id0 = v.split(':')[1], k0 = v.split(':')[0]; tyId = id0; stType = id0; if (k0 === 'st') { tyId = null; setRoot = 'st'; showSetView('st'); } else if (k0 === 'em') showSetView('em'); else { setRoot = 'tydet'; showSetView('tydet'); } }   // סוג מפגש: עריכה, פרטי ברירת המחדל, התגיות או ההודעה שלו
          else if (['src', 'pm'].includes(v)) { setRoot = v; showSetView(v); }
          if (document.activeElement && document.activeElement.closest('#setDlg')) document.activeElement.blur(); syncUrl();
        }
        else if (d.fin) { openFinance(d.fin); }
        else if (d.st) openStats(d.stv);
        return;
      }
      urlReady = true;
      render(); refreshOpenSheet(); refreshSources();
    } catch (err) {
      console.error(err);
      if (silent || err.signedOut) return;   // רענון שקט שנכשל: משאירים את מה שמוצג (וכניסה שפגה כבר הציגה את מסך הכניסה)
      document.documentElement.classList.remove('is-loading');
      const missing = err.code === 'PGRST205' || err.code === '42P01' || /does not exist|schema cache/i.test(err.message);
      $('#status').innerHTML = '<div class="error-box">' + (missing
        ? '<b>הטבלאות של העסק עוד לא קיימות בבסיס הנתונים.</b>'
        : '<b>אין חיבור לנתונים.</b><br>' + esc(err.message)) + '</div>';
    }
  }

  /* ---------- רינדור ---------- */
  /* שורת צ'יפים מהירים בין הכותרת לשורת הסינונים: משוריינים (שלושה מצבים: הכל, משוריינים, לא משוריינים; רק בתוך מפגש), גברים ונשים, עם מונים */
  function renderChipRow() {
    const el = $('#chipRow'); if (!el) return;
    /* המונים לפי הרשימה: כל הסינונים הפעילים חוץ מהסינון של אותו צ'יף עצמו (משוריינים: מכבד מגדר; גברים ונשים: מכבדים משוריינים) */
    const pool = poolP(), epk = payKeys(effPay()), eg = effGender(), gk = payKeys(state.gender), common = (p) => sentOk(p) && matchPay(p, epk);
    const genOk = (p) => !eg || payKeys(eg).includes(p.gender || 'none');
    const men = pool.filter((p) => common(p) && paidOk(p) && p.gender === 'male').length, wom = pool.filter((p) => common(p) && paidOk(p) && p.gender === 'female').length;
    const scope = pool;
    const btn = (key, cls, on, inner) => '<button type="button" class="stc tagc ' + cls + '" data-cr="' + key + '" aria-pressed="' + on + '">' + inner + '</button>';
    const chipHide = state.chipHide.map((k) => k === 'male' || k === 'female' ? 'gen' : k), showChip = (k, active) => !chipHide.includes(k) || !!active;   // מפתחות ישנים (גברים / נשים) נחשבים "מגדר"   // צ'יף שהוסתר מוצג בכל זאת כשהסינון שלו פעיל
    let chipCnt = null; let h = ''; const w = String(state.participants.length);   // רוחב קבוע: מקום שמור למספר הרחב ביותר
    if (state.filter) {
      const f = state.paidF, st = f === 'r' ? 1 : f === 'u' ? 2 : 0, ok = pool.filter((p) => common(p) && genOk(p) && arrOk(p)), res = ok.filter((p) => reservedOf(p.id, state.filter)).length, unres = ok.length - res;
      chipCnt = { res: { all: ok.length, y: res, n: unres }, arr: null };
      const resH = btn('res', st === 2 ? 'neg' : '', st > 0, '<span class="fx cm">' + icon('bookmark', 'i16') + ' <small>' + (st === 2 ? unres : st === 1 ? res : res) + '</small></span>').replace('<button ', '<button data-cm="res" aria-haspopup="menu" aria-label="משוריינים" title="משוריינים" ');
      const af = state.arrF, ast = af === '1' ? 1 : af === '0' ? 2 : 0, aok = pool.filter((p) => common(p) && genOk(p) && paidOk0(p)), arrN = aok.filter((p) => (linkOf(p.id, state.filter) || {}).attended).length, noArrN = aok.length - arrN;
      chipCnt.arr = { all: aok.length, y: arrN, n: noArrN };
      window.__chipCnt = chipCnt;
      const arrH = btn('arr', ast === 2 ? 'neg' : '', ast > 0, '<span class="fx cm">' + icon('check', 'i16') + ' <small>' + (ast === 2 ? noArrN : arrN) + '</small></span>').replace('<button ', '<button data-cm="arr" aria-haspopup="menu" aria-label="הגיעו" title="הגיעו" ');
      h += (showChip('res', st > 0) ? resH : '') + (arrOpen() && showChip('arr', ast > 0) ? arrH : '');   // משוריינים, ואחריו הגיעו, בכל מפגש נבחר (הכל ← הגיעו ← לא הגיעו ← הכל)
    }
    const fxw = (txt, n) => '<span class="fx"><span>' + txt + ' <small>' + n + '</small></span><span class="ph" aria-hidden="true">' + txt + ' <small>' + w + '</small></span></span>';
    { const gOn = gk.length > 0; if (showChip('gen', gk.length > 0)) {   // צ'יף אחד למגדר: שני המונים, ותפריט לבחירה
        chipCnt = chipCnt || {}; chipCnt.gen = { all: men + wom, y: men, n: wom }; window.__chipCnt = Object.assign(window.__chipCnt || {}, { gen: chipCnt.gen });
        h += btn('gen', '', false, '<span class="fx cm"><span class="gc' + (gk.includes('female') ? ' on' : '') + '" data-g="female" role="button" aria-pressed="' + gk.includes('female') + '" aria-label="נקבה ' + wom + '" title="נקבה">' + icon('female', 'i16') + '<small>' + wom + '</small></span><span class="gc' + (gk.includes('male') ? ' on' : '') + '" data-g="male" role="button" aria-pressed="' + gk.includes('male') + '" aria-label="זכר ' + men + '" title="זכר">' + icon('male', 'i16') + '<small>' + men + '</small></span></span>').replace('<button ', '<button role="group" aria-label="מגדר" '); } }
    h += filterBtnHtml();   // כפתור הסינון: אחרי המגדר
    const pk = payKeys(state.pay);   // תגיות שקיימות: אחרי הנשים; המונה לפי הרשימה, בלי הסינון של התגית עצמה
    const inScope = state.participants.filter((p) => (state.filter ? linkOf(p.id, state.filter) : p.active !== false) && mtypeOk(p));   // תגית שאף משתתף בתצוגה לא משויך אליה לא מוצגת (נבחרת נשארת, כדי שאפשר יהיה לבטל)
    statusList(state.filter ? undefined : state.mtype || null).filter((t) => (pk.includes(t.key) || inScope.some((p) => stMatch(p, t.key))) && (!state.tagHide.includes(t.key) || pk.includes(t.key))).forEach((t) => {
      const n = pool.filter((p) => paidOk(p) && genOk(p) && stMatch(p, t.key)).length, pc = PALETTE[t.color] || PALETTE.neutral;
      h += '<button type="button" class="stc tagc' + (n ? '' : ' zero') + '" data-ct="' + esc(t.key) + '" data-sc="1" style="--sbg:' + pc[0] + ';--sfg:' + pc[1] + '" aria-pressed="' + pk.includes(t.key) + '">' + fxw(esc(t.label), n) + '</button>';
    });
    const edit = '';   // כפתור עריכת התגיות עבר לכותרת (#tagEditBtn)
    const fpI = h.lastIndexOf('<button type="button" class="fspair"'); let lastI = h.lastIndexOf('<button'); if (fpI >= 0 && h.indexOf('data-ct', fpI) < 0) lastI = fpI;   // בלי תגיות: הצ'יף האחרון הוא כפתור הסינון והמיון
    //   // אילוץ: העיפרון לא נשאר לבד בשורה, הצ'יף האחרון והעיפרון תמיד יחד
    h = lastI < 0 ? edit : h.slice(0, lastI) + '<span class="stlast">' + h.slice(lastI) + edit + '</span>';   // כניסה לעריכת התגיות (קודם בכותרת הקבוצה בתפריט הסינון)
    el.innerHTML = h;
  }
  /* תפריט בחירת מצב לצ'יפים "משוריינים" ו"הגיעו": הכל, כן, לא (עם הכמות); הצ'יף סגור מציג רק סמל ומונה */
  const CHIP_DEF = { res: { lab: ['הכל', 'משוריינים', 'לא משוריינים'], cur: () => state.paidF === 'r' ? 1 : state.paidF === 'u' ? 2 : 0, set: (i) => { state.paidF = i === 1 ? 'r' : i === 2 ? 'u' : null; } },
    gen: { lab: ['הכל', 'זכר', 'נקבה'], cur: () => payKeys(state.gender).includes('male') ? 1 : payKeys(state.gender).includes('female') ? 2 : 0, set: (i) => { state.gender = i === 1 ? 'male' : i === 2 ? 'female' : null; } },
    arr: { lab: ['הכל', 'הגיעו', 'לא הגיעו'], cur: () => state.arrF === '1' ? 1 : state.arrF === '0' ? 2 : 0, set: (i) => { arrKeep = null; state.arrF = i === 1 ? '1' : i === 2 ? '0' : null; } } };
  function openChipMenu(kind, anchor) {
    const m = $('#chipMenu'), d = CHIP_DEF[kind], n = (window.__chipCnt || {})[kind] || { all: 0, y: 0, n: 0 }, cur = d.cur();
    m.dataset.kind = kind;
    m.innerHTML = d.lab.map((t, i) => '<button type="button" role="menuitemradio" aria-checked="' + (i === cur) + '" class="cmi' + (i === cur ? ' on' : '') + '" data-ci="' + i + '">' + t + ' <small>' + (i === 0 ? n.all : i === 1 ? n.y : n.n) + '</small></button>').join('');
    m.hidden = false; m.style.left = menuX(m, anchor) + 'px'; placeMenuV(m, anchor.getBoundingClientRect().top, anchor.getBoundingClientRect().bottom, true);
  }
  $('#chipMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-ci]'); if (!b) return; CHIP_DEF[$('#chipMenu').dataset.kind].set(+b.dataset.ci); $('#chipMenu').hidden = true; render(); });
  const filterBtnHtml = () => '<button type="button" class="fspair' + (panelOn() ? ' on' : '') + '" id="filtBtn" aria-pressed="' + !!panelOn() + '" aria-haspopup="menu" aria-expanded="' + !$('#viewMenu').hidden + '" aria-label="סינון ותצוגה' + (panelOn() ? ' (יש סינון פעיל)' : '') + '" title="סינון ותצוגה">' + icon('sort', 'i16') + icon('filter', 'i16') + '</button>';   // לחיצה אחת פותחת את פופאפ הסינון; שני הסמלים צמודים
  /* בלי סרגל המילוי האוטומטי של כרום (כתובת, כרטיס אשראי, סיסמאות והשם של החשבון) מעל המקלדת: הערך "off" מתעלמים ממנו, אז משתמשים בערך לא חוקי */
  { const noFill = (root) => (root.querySelectorAll ? root.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=date]):not([type=time]), textarea') : []).forEach((el) => { if (el.getAttribute('autocomplete') !== 'nope') el.setAttribute('autocomplete', 'nope'); });
    noFill(document); new MutationObserver((ml) => ml.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches && n.matches('input, textarea')) noFill({ querySelectorAll: () => [n] }); else noFill(n); } }))).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('focusin', (e) => { const t = e.target; if (t && t.matches && t.matches('input, textarea') && t.getAttribute('autocomplete') !== 'nope' && !/^(checkbox|radio|file|date|time)$/.test(t.type)) t.setAttribute('autocomplete', 'nope'); }, true); }
  $('#chipRow').addEventListener('click', (e) => {
    if (e.target.closest('[data-edit-tags]')) { openStatusSettings(); return; }
    const t = e.target.closest('[data-ct]');
    if (t) { const k = t.dataset.ct; state.pay = payKeys(state.pay).includes(k) ? null : k; render(); return; }   // תגית אחת בכל פעם
    const gb = e.target.closest('[data-g]'); if (gb) { state.gender = payKeys(state.gender).includes(gb.dataset.g) ? null : gb.dataset.g; render(); return; }   // מגדר: בחירה ישירה (לחיצה נוספת מבטלת), בלי תפריט
    const cmb = e.target.closest('[data-cm]'); if (cmb) { openChipMenu(cmb.dataset.cm, cmb); return; }   // משוריינים והגיעו: תפריט לבחירת המצב
    const b = e.target.closest('[data-cr]'); if (!b) return; const k = b.dataset.cr;
    if (k === 'arr') { arrKeep = null; state.arrF = state.arrF === '1' ? '0' : state.arrF === '0' ? null : '1'; }   // הצ'יף מסנן בלבד: מצב המתג (וואטסאפ / הודעה / הגעה) לא משתנה   // הכל ← הגיעו ← לא הגיעו ← הכל; סימון מעביר את עמודת הסימון (כפתור הוואטסאפ) למצב הגעה, וחזרה ל"הכל" סוגרת אותו ומחזירה למה שהיה
    else if (k === 'res') state.paidF = state.paidF === 'r' ? 'u' : state.paidF === 'u' ? null : 'r';   // הכל ← משוריינים ← לא משוריינים ← הכל
    else state.gender = payKeys(state.gender).includes(k) ? null : k;
    render();
  });
  function render() { mtSet = null; renderChips(); renderSort(); renderList();  syncUrl(); requestAnimationFrame(alignFilters); }   // בתוך מפגש מוסיפים דרך החיפוש

  /* בורר המפגש בכותרת (במקום שורת התגיות): כל המשתתפים, מפגש אחד לסינון, או יצירת מפגש */
  function renderChips() {
    const cur = state.filter ? meetOf(state.filter) : null;
    { const nb = $('#nextMBtn'), nm = nextMeetingOf(); nb.hidden = !nm || state.filter === nm.id; if (nm) { const lb = 'מעבר למפגש הקרוב: ' + meetingLabel(nm).split(' · ')[0]; nb.title = lb; nb.setAttribute('aria-label', lb); } }   // קיצור הדרך מוצג כשיש מפגש קרוב ולא נמצאים בו
    $('#mSelTxt').textContent = cur ? meetingLabel(cur).split(' · ')[0] : (state.mtype && typeById(state.mtype) ? (typeById(state.mtype).name || 'סוג מפגש') : 'כל המשתתפים');   // הכותרת לפי הבחירה בתפריט: כל המשתתפים, שם הסוג או תאריך המפגש ("ניהול מפגשים" רק בטייטל של הטאב)
    const dayTime = (m) => esc(meetingLabel(m).split(' · ')[0]) + ' · ' + esc(meetingLabel(m, true).split(' ').slice(0, 2).join(' ')) + ' · ' + esc(String(m.meeting_time).slice(0, 5));
    const EDIT_ICON = icon('edit');
    const nextM = state.meetings.filter((m) => !isPast(m)).sort(meetAsc)[0] || null;   // המפגש הקרוב: מודגש בתפריט
    /* סוגי מפגשים מעל רשימת המפגשים, באותה צורה: בחירת סוג מציגה רק את המפגשים שלו (לחיצה נוספת מבטלת), עיפרון לעריכת הסוג, והוספת סוג */
    /* בלי שורות כותרת ובלי עמודת התשלום (31.10.26): ליד כל מספר סמל קטן שאומר מה הוא סופר (מפגשים, משתתפים או נרשמו) */
    const MCI = { cal: [icon('cal', 'i14'), 'מפגשים'], user: [icon('user', 'i14'), 'משתתפים'], reg: [icon('user', 'i14'), 'נרשמו'], paid: [icon('bookmark', 'i14'), 'משוריינים (התשלום נסגר)'], came: [icon('check', 'i14'), 'הגיעו'] };
    /* "כל המשתתפים" וסוגי המפגשים (31.10.26): שני מספרים, מפגשים (יומן) ומשתתפים (אדם); המשתתפים באותה עמודה כמו "נרשמו" של המפגשים.
       בסוג: המשתתפים הפעילים שמשויכים לאחד המפגשים שלו */
    const actP = state.participants.filter((x) => x.active !== false);
    const pOfType = (tid) => { const ms = new Set(state.meetings.filter((m) => typeIdOf(m) === tid).map((m) => m.id)); const ids = new Set(state.att.filter((a) => ms.has(a.meeting_id)).map((a) => a.participant_id)); return actP.filter((x) => ids.has(x.id)).length; };
    /* בכותרת, בכל המצבים: סמל וכמות המשתתפים המשויכים, אותו מספר כמו בתפריט (לא תלוי בסינונים; מה שמוצג אחרי סינון הוא המונה שבשורת הסינון) */
    $('#mSel').setAttribute('aria-label', $('#mSelTxt').textContent);
    const mcell = (n, k, dim) => '<span class="mc' + (dim ? ' dim' : '') + '" title="' + MCI[k][1] + '" aria-label="' + MCI[k][1] + ' ' + n + '"><i class="mci" aria-hidden="true">' + MCI[k][0] + '</i>' + n + '</span>';   // הסמל מימין למספר, כל הסמלים בעמודה על אותו קו אנכי
    /* סוגי המפגשים לפי המפגש האחרון שלהם (התאריך והשעה המאוחרים ביותר, גם עתידי): הסוג של המפגש האחרון ראשון; סוג בלי מפגשים בסוף, לפי הסדר הקבוע */
    const lastOfType = (tid) => state.meetings.reduce((mx, m) => typeIdOf(m) === tid ? Math.max(mx, Date.parse(m.meeting_date + 'T' + String(m.meeting_time || '00:00').slice(0, 5)) || 0) : mx, -1);
    const typesByLast = state.mtypes.map((t, i) => ({ t, i, k: lastOfType(t.id) })).sort((x, y) => (y.k - x.k) || (x.i - y.i)).map((x) => x.t);
    const types = state.mtypes.length ? typesByLast.map((t) => '<div class="mtr mrow2 mtyrow" role="menuitemradio" tabindex="0" data-mt="' + t.id + '" aria-checked="' + (state.mtype === t.id && !state.filter) + '"><span>' + esc(t.name || 'ללא שם') + '</span>' + mcell(state.meetings.filter((m) => typeIdOf(m) === t.id).length, 'cal') + mcell(pOfType(t.id), 'user') +
        (state.mtype === t.id && !state.filter ? '<button type="button" class="medit" data-edit-t="' + t.id + '" aria-label="עריכת סוג המפגש" title="עריכת סוג המפגש">' + EDIT_ICON + '</button>' : '<span></span>') + '</div>').join('') +
      '<div class="mtr maddrow addt" id="addType"><span>סוג מפגש חדש</span><button type="button" role="menuitem" class="medit madd" aria-label="סוג מפגש חדש">' + icon('plus') + '</button></div>' : '';   // השם בימין והפלוס מיד אחריו, וכל השורה לחיצה
    const shownM = state.meetings.filter((m) => !state.mtype || typeIdOf(m) === state.mtype);
    /* "כל המשתתפים" ראשון: רמה מעל סוגי המפגשים והמפגשים */
    $('#mMenu').innerHTML = '<div class="mtop">' +
      '<div class="mtr mrow2 mall" role="menuitemradio" tabindex="0" data-filter="" aria-checked="' + (state.filter === null && !state.mtype) + '"><span>כל המשתתפים</span>' + mcell(state.meetings.length, 'cal') + mcell(actP.length, 'user') + '<span></span></div></div>' +   // קבוע בראש התפריט בזמן גלילה
      types +
      shownM.map((m) => {
        const ls = state.att.filter((a) => a.meeting_id === m.id), isNext = nextM === m;
        return '<div class="mtr mrow2' + (isPast(m) ? ' past' : '') + (isNext ? ' next' : '') + '" role="menuitemradio" tabindex="0" data-filter="' + m.id + '" aria-checked="' + (state.filter === m.id) + '"><span>' + dayTime(m) + '</span>' + (isPast(m) ? mcell(ls.filter((l) => l.attended).length, 'came') : mcell(ls.filter((l) => allocatedOf(l.participant_id, m.id) > 0 && !(dueOf(l.participant_id, m.id) > 0)).length, 'paid')) + mcell(ls.length, 'reg') +
          (state.filter === m.id ? '<button type="button" class="medit" data-edit-m="' + m.id + '" aria-label="עריכת מפגש" title="עריכת מפגש">' + EDIT_ICON + '</button>' : '<span></span>') + (meetName(m) ? '<span class="mrname"><bdi>' + esc(meetName(m)) + '</bdi></span>' : '') + '</div>';
      }).join('') +
      '<div class="mtr maddrow" id="addMeeting"><span>מפגש חדש</span><button type="button" role="menuitem" class="medit madd" aria-label="מפגש חדש">' + icon('plus') + '</button></div>';
    if (!$('#mMenu').hidden) placeMSel();   // התפריט נשאר פתוח בבחירה: הכותרת משנה רוחב והוא נשאר צמוד אליה
  }
  const closeMSel = () => { $('#mMenu').hidden = true; $('#mSel').setAttribute('aria-expanded', 'false'); };
  const placeMSel = () => { const m = $('#mMenu'); if (window.innerWidth < 700) { m.style.left = m.style.right = ''; m.style.top = Math.round($('#mSel').getBoundingClientRect().bottom + 8) + 'px'; } else { m.style.top = ''; const host = m.offsetParent || m.parentElement, hr = host.getBoundingClientRect(); m.style.right = 'auto'; m.style.left = (menuX(m, $('#mSel')) - hr.left) + 'px'; } m.style.maxHeight = Math.max(240, Math.floor(window.innerHeight - m.getBoundingClientRect().top - 12)) + 'px'; };
  $('#mSel').addEventListener('click', (e) => { e.stopPropagation(); const m = $('#mMenu'); m.hidden = !m.hidden; $('#mSel').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) placeMSel(); });   // התפריט עד תחתית המסך, ונגלל בתוכו   // דסקטופ: הקצה הימני של התפריט בקו ישר עם הקצה הימני של הכותרת; במובייל ממורכז
  document.addEventListener('click', (e) => { if (e.target.isConnected && !e.target.closest('.msel')) closeMSel(); });   // (isConnected: שורה שהתפריט צייר מחדש כבר לא בדף, ואינה לחיצה בחוץ)

  const WA_ICON = icon('wa');

  const meetingStarted = (m) => nowIL() >= startMs(m);
  const linkStatus = (l) => (l && l.status_key && state.statuses.some((s) => s.key === l.status_key)) ? l.status_key : null;   // התגית של שיוך למפגש (אחת לכל שיוך); בלי תגית: null. התגית לא משפיעה על שום דבר חוץ מהתצוגה והסינון
  const STATUS_LABEL = Object.create(null);
  /* תגיות על מפגשים: שם, צבע (מפתח בפלטה) וסדר לכל תגית */
  const PALETTE = { green: ['var(--green-bg)', 'var(--green)', 'ירוק'], red: ['var(--red-bg)', 'var(--red)', 'אדום'], amber: ['var(--yellow-bg)', 'var(--yellow)', 'צהוב'], sky: ['var(--sky-bg)', 'var(--sky)', 'כחול'], neutral: ['var(--gray-bg)', 'var(--gray)', 'ניטרלי'] };
  const OK_KEY = /^[A-Za-z0-9_-]{1,40}$/;   // מפתח תגית, דרך תשלום וסטטוס בשיוך: מילה קצרה בלבד (מסונן גם במסד)
  const palName = (c, dflt) => Object.prototype.hasOwnProperty.call(PALETTE, c) ? c : dflt;   // צבע: שם מהפלטה או ברירת מחדל
  state.statuses = [];
  /* תגיות לפי סוג מפגש: לכל סוג רשימה משלו (type_id; ריק = הסוג הראשון). בלי סוג (undefined): לפי המפגש שנבחר ברשימה; null = כל התגיות */
  const curTid = () => state.filter ? typeIdOf(meetOf(state.filter)) : null;
  const ofType = (s, tid) => !tid || (s.type_id || firstTypeId()) === tid;
  const statusList = (tid) => { const t = tid === undefined ? curTid() : tid; return state.statuses.filter((s) => ofType(s, t)).sort((a, b) => a.sort - b.sort); };
  function applyStatuses() {
    let css = '';
    state.statuses.forEach((s) => {
      STATUS_LABEL[s.key] = s.label;
      if (s.color === 'orange') s.color = 'red';   // כתום הוסר מהפלטה (היה כמעט זהה לאדום)
      const c = PALETTE[palName(s.color, 'sky')], k = CSS.escape(String(s.key));
      css += '.row .ptag.' + k + ', .pay.' + k + ', .sopt.' + k + ', .pst.' + k + ', .qmenu .qi.' + k + ', .stprev.' + k + ', .stpill.' + k + ' { background: ' + c[0] + '; color: ' + c[1] + '; }\n';
    });
    let el = document.getElementById('stDyn');
    if (!el) { el = document.createElement('style'); el.id = 'stDyn'; document.head.appendChild(el); }
    el.textContent = css;
  }
  applyStatuses();
  /* מונים וסינון: גברים/נשים ושילמו/טרם שילמו. כל מונה סופר לפי הסינון האחר והחיפוש, כך שהמספר הוא בדיוק מה שיוצג בלחיצה */
  /* בזמן חיפוש טקסט, סינוני המגדר והתשלום מושהים (כדי למצוא מישהו בוודאות); הם נשמרים ב-state וחוזרים כשהחיפוש נסגר */
  const effGender = () => state.q.trim() ? null : state.gender;
  /* סינונים נוספים (תפריט ⋯ משמאל לצ'יפי המגדר): שיווק ממומן וקבוצת גיל; מושהים בזמן חיפוש כמו שאר הסינונים */
  const AGE_MID = Math.floor((AGE_MIN + AGE_MAX) / 2), AGE_B = [['u', '⁦' + '0-' + (AGE_MIN - 1) + '⁩', 0, AGE_MIN - 1], ['lo', '⁦' + AGE_MIN + '-' + AGE_MID + '⁩', AGE_MIN, AGE_MID], ['hi', '⁦' + (AGE_MID + 1) + '-' + AGE_MAX + '⁩', AGE_MID + 1, AGE_MAX], ['o', '\u2066' + (AGE_MAX + 1) + '+\u2069', AGE_MAX + 1, 200]];   // קבוצות הגיל לפי טווח הגילאים שב-age.js
  /* העדכון האחרון של משתתף: הפעולה האחרונה עליו (הרשמה, שיוך או שינוי במפגש, הגעה, שליחת פרטים, תשלום או הערה, גם הערות מערכת). רכיב אחד למיון ולסינון; מחושב פעם אחת לכל ציור של הרשימה */
  let updMap = null;
  const lastUpd = (id) => {
    if (!updMap) {
      const last = new Map(), bump = (pid, v) => { if (pid && v && String(v) > (last.get(pid) || '')) last.set(pid, String(v)); };
      state.participants.forEach((q) => bump(q.id, q.created_at));
      state.att.forEach((l) => ['created_at', 'attended_at', 'details_sent_at', 'pay_later_at', 'pay_requested_at', 'paid_at'].forEach((k) => bump(l.participant_id, l[k])));
      state.payments.forEach((x) => bump(x.participant_id, x.created_at));
      state.notes.forEach((n) => bump(n.participant_id, n.created_at));
      updMap = last;
    }
    return updMap.get(id) || '';
  };
  const UPD_B = [['h', 'שעה', 36e5], ['d', 'יום', 864e5], ['w', 'שבוע', 7 * 864e5], ['m', 'חודש', 30 * 864e5]];   // סינון "עדכון אחרון": בשעה, ביום, בשבוע ובחודש האחרונים
  const regWithin = (p, ms) => { const t = Date.parse(p.created_at); return !isNaN(t) && Date.now() - t <= ms; };   // סינון "מועד הרשמה": אותן יחידות כמו עדכון אחרון
  /* סימון הגעה או שליחת הודעה מעדכן את "עדכון אחרון" של המשתתף, אבל לא מזיז את הכרטיסים: בזמן העבודה הסדר מוקפא לפי הערכים שהיו ברגע הסימון הראשון,
     עד שמחליפים מיון, סינון, מפגש או מאפסים סינונים */
  let updFrozen = null;
  /* מיון לפי עדכון: הסדר קפוא בזמן הצפייה ברשימה, ומתעדכן רק כשמשנים סינון, חיפוש, מיון או מפגש, או כשטוענים מחדש */
  /* הסרה ממפגש: הכרטיס נשאר ברשימה במצב "לא משויך" (עם אפשרות לשייך שוב) עד שינוי של חיפוש, מיון, סינון או מפגש, או טעינה מחדש */
  let remKeep = null;
  const remKeepAdd = (pid, mid) => { const sg = updSigNow(); if (!remKeep || remKeep.sig !== sg || remKeep.m !== mid) remKeep = { sig: sg, m: mid, ids: new Set() }; remKeep.ids.add(pid); };
  const remKept = (p) => { if (!remKeep) return false; if (remKeep.sig !== updSigNow() || remKeep.m !== state.filter) { remKeep = null; return false; } return remKeep.ids.has(p.id); };
  let updSig = '';
  const updSigNow = () => JSON.stringify([state.filter, state.mtype, state.q, state.sort, state.sortDir, state.pay, state.gender, state.paidF, state.arrF, state.sent, state.bal, state.srcF, state.ageF, state.mcF, state.updF, state.payF, state.waSent]);
  const lastUpdV = (id) => { const sg = updSigNow(); if (!updFrozen || sg !== updSig) { updFrozen = null; freezeUpd(); updSig = sg; } return updFrozen.has(id) ? updFrozen.get(id) : lastUpd(id); };
  const freezeUpd = () => { if (!updFrozen) updFrozen = new Map(state.participants.map((p) => [p.id, lastUpd(p.id)])); };
  const updWithin = (id, ms) => { const t = Date.parse(lastUpd(id)); return !isNaN(t) && Date.now() - t <= ms; };
  const moreOk = (p) => {   // אחד מהערכים שסומנו בקבוצה (או), וכל הקבוצות יחד (וגם)
    if (state.q.trim()) return true;
    const ks = (v) => payKeys(v);
    if (state.updF && !ks(state.updF).some((k) => { const u = UPD_B.find((x) => x[0] === k); return !u || updWithin(p.id, u[2]); })) return false;
    if (state.regF && !ks(state.regF).some((k) => { const u = UPD_B.find((x) => x[0] === k); return !u || regWithin(p, u[2]); })) return false;
    if (state.srcF) { const c = channelAt(p, state.filter); if (!ks(state.srcF).some((k) => k === '__none' ? !c : !!(c && c.id === k))) return false; }
    if (state.ageF) { const a = shownAge(p); if (!ks(state.ageF).some((k) => { const b = AGE_B.find((x) => x[0] === k); return !b || (a != null && a >= b[2] && a <= b[3]); })) return false; }
    if (state.mcF && !state.filter && !ks(state.mcF).includes(mcKey(p))) return false;   // מספר מפגשים (רק בתצוגה הכללית ובסוג מפגש)
    return true;
  };
  const payKeys = (s) => s ? String(s).split(',').filter(Boolean) : [];   // state.pay: התגית שנבחרה בפס
  const matchPay = (p, keys) => !keys.length || keys.some((k) => stMatch(p, k));
  const effPay = () => state.q.trim() ? null : state.pay;
  /* העדפות תצוגה ברמת המשתמש ובמפגש (27.10.26): לכל מנהל, לכל מפגש ולתמונת המצב הכללית ("all") ערכים משלהם לטוגלים (תגיות, תשלום: true/false; שליחה, הגעה: null = אוטומטי לפי התזמונים של אותו מפגש). state.showTags וחבריו הם מאפיינים שמחזירים וכותבים את ערכי ההקשר הנוכחי (המפגש הנבחר או "all"), כך שבמעבר בין מפגשים התצוגה מתחלפת איתם. נשמר ב-roster_admin_prefs.view_scopes */
  const VIEW_DEF = { pay: true, sent: null, gender: true };   // gender: זכר / נקבה בשורת הסינון, מסומן כברירת מחדל
  const MEETING_DEF = { pay: false, sent: false, gender: true };   // מפגש שעוד לא הוגדרה לו תצוגה: רק המגדר דלוק, והתשלום, שליחת פרטי המפגש וההגעה כבויים (המנהל מדליק מה שהוא צריך)
  const viewKey = () => state.filter || (state.mtype ? 'type:' + state.mtype : 'all');
  const viewDef = () => state.filter ? MEETING_DEF : VIEW_DEF;   // הקשר התצוגה: מפגש, סוג מפגש (31.10.26) או כל המשתתפים
  const viewCtx = () => { const k = viewKey(); return state.viewScopes[k] || (state.viewScopes[k] = Object.assign({}, viewDef())); };
  ['showPay', 'showGender'].forEach((prop) => Object.defineProperty(state, prop, { get: () => true, set() {}, enumerable: true }));   // תשלום ומגדר מוצגים תמיד (31.10.26)
  [['showSent', 'sent']].forEach(([prop, key]) => Object.defineProperty(state, prop, { get() { const c = state.viewScopes[viewKey()]; return c && c[key] !== undefined && c[key] !== null ? c[key] : viewDef()[key]; }, set(v) { viewCtx()[key] = v; }, enumerable: true }));
  /* המיון (1.11.26): הגדרה אחת לכל התצוגות, ברמת החשבון (לכל מנהל בנפרד, בכל מכשיר); נשמר ב-view_scopes._g.sort, ולכן לא בכתובת */
  Object.defineProperty(state, 'genPin', { get() { const c = state.viewScopes._g; return !!(c && c.genPin); }, set(v) { (state.viewScopes._g || (state.viewScopes._g = {})).genPin = !!v; }, enumerable: true });   // מגדר קבוע בסטריפ: ברמת המנהל, לא בכתובת
  /* הצגה בשורת הצ'יפים (7.11.26): לכל מנהל, בכל התצוגות; נשמר ב-view_scopes._g. chipHide: מפתחות של צ'יפי ברירת המחדל שמוסתרים (res, arr, male, female); tagHide: מפתחות של תגיות שמוסתרות. צ'יף שהסינון שלו פעיל נשאר מוצג גם אם הוסתר */
  ['chipHide', 'tagHide'].forEach((prop) => Object.defineProperty(state, prop, { get() { const c = state.viewScopes._g; return Array.isArray(c && c[prop]) ? c[prop] : []; }, set(v) { (state.viewScopes._g || (state.viewScopes._g = {}))[prop] = v; }, enumerable: true }));
  Object.defineProperty(state, 'sortDir', { get() { const c = state.viewScopes._g; return c && c.sortDir === 'asc' ? 'asc' : 'desc'; }, set(v) { (state.viewScopes._g || (state.viewScopes._g = {})).sortDir = v === 'asc' ? 'asc' : 'desc'; }, enumerable: true });   // כיוון המיון: desc = ברירת המחדל של כל מיון (חדש, עדכני,  גבוהה קודם), asc = הפוך; לחיצה נוספת על המיון שנבחר הופכת
  Object.defineProperty(state, 'sort', { get() { const c = state.viewScopes._g; return c && c.sort && c.sort !== 'pers' && c.sort !== 'pay' ? c.sort : 'last'; }, set(v) { (state.viewScopes._g || (state.viewScopes._g = {})).sort = v; }, enumerable: true });
  function applyViewPrefs() { const pr = state.prefs[emailOf()] || {}; state.viewScopes = (pr.view_scopes && typeof pr.view_scopes === 'object') ? JSON.parse(JSON.stringify(pr.view_scopes)) : {}; }
  async function saveViewPrefs() {
    const em = emailOf(), body = { email: em, view_scopes: state.viewScopes };
    state.prefs[em] = Object.assign({}, state.prefs[em], body);
    try { await api(T.pf, { method: 'POST', body, prefer: 'resolution=merge-duplicates,return=minimal' }); } catch (err) { fail(err); }
  }
  /* סימון ההגעה הוא שדה נפרד (attended), ונקבע בעמודת הסימון ברשימה (תפריט העמודה: הגיע / לא הגיע). הוא לא קשור לתגיות */
  const effPaidF = () => (state.q.trim() || !state.filter || !state.showPay) ? null : state.paidF;   // שולם / לתשלום (לפי רשומות התשלום), רק בתוך מפגש
  /* זכאי להודעה לפני המפגש: כל מי שמשויך למפגש */
  const evElig = (pid, l) => !!l;
  const noPayOf = (p, l) => !!(l && l.no_pay);   // "לא משלם" הוא עניין של מפגש בלבד (מתג במסך התשלום של המפגש)
  const dueOf = (pid, mid) => {
    const l = linkOf(pid, mid), al = l ? allocatedOf(pid, mid) : 0; if (!(al > 0)) return 0;
    const stored = Number(l.pay_due_amount) || 0, m = meetOf(mid);
    if (stored > 0 && l.pay_later_at && !l.no_pay && m) return Math.max(0, Math.round(((ticketOf(pid, mid) || defaultPrice(m)) - al) * 100) / 100);   // תשלום בהמשך: מה שנשאר מתעדכן למחיר הנוכחי של הכרטיס פחות מה ששולם
    return stored;
  };   // שולם חלק ונשאר לשלם (לא הנחה)
  const oweOf = (pid, m) => dueOf(pid, m.id) || Math.max(0, expectedPrice(pid, m) - Math.max(0, allocatedOf(pid, m.id)));   // כמה עוד צריך לשלם על המפגש
  /* תשלום בהמשך: מחכים לתשלום לפני המפגש, בזמנו או אחריו, בלי מועד ידוע. פעיל כל עוד התשלום לא נסגר */
  const laterOf = (pid, mid) => { const l = linkOf(pid, mid); return !!(l && l.pay_later_at && !l.no_pay) && !(allocatedOf(pid, mid) > 0 && !(dueOf(pid, mid) > 0)); };
  /* משוריין למפגש: לא לתשלום, תשלום שנסגר (שולם מחיר הכרטיס, או "סגירת תשלום"), או תשלום בהמשך. כל השאר עוד לא משוריינים, גם אם שילמו חלק */
  const missedOf = (pid, m) => { const l = m && linkOf(pid, m.id); return !!l && !l.attended && !linkStatus(l) && nowIL() >= startMs(m); };   // משויך למפגש שהתחיל, בלי תגית ולא הגיע (גם אם לא משוריין): מוצג "לא הגיע" (כשאין תגית)
  const reservedOf = (pid, mid) => { const l = linkOf(pid, mid); return !!l && (!!l.no_pay || laterOf(pid, mid) || (allocatedOf(pid, mid) > 0 && !(dueOf(pid, mid) > 0))); };
  const payStateOf = (p) => noPayOf(p, linkOf(p.id, state.filter)) ? 'n' : laterOf(p.id, state.filter) ? 'l' : dueOf(p.id, state.filter) > 0 ? '0' : (allocatedOf(p.id, state.filter) > 0) ? '1' : '0';   // לא משלם (מסומן במפגש) / תשלום בהמשך / לתשלום / שולם
  /* שליחת פרטי המפגש: רק בתוך מפגש, ביום המפגש (לפי ההגדרה) ולפני שנפתחת ההגעה; רק למי שזכאי (שילם / לא לתשלום / ישלם) */
  const evOnFor = (m) => !!(m && nowIL() >= evOpenAt(m) && (eventMeeting() || {}).id === m.id);   // נכבה אוטומטית ברגע שנפתח סימון ההגעה (לפי ההגדרה "מתי נפתח סימון ההגעה")
  /* למי נשלחו פרטי המפגש: מוצג גם אחרי שהחלון נסגר (למפגש שכבר נשלחו בו פרטים), "נשלח" = יש סימון שליחה, "לא נשלח" = זכאי (לא בתגית ברירת המחדל) ועוד לא נשלח */
  /* מפגש שהתחיל בשבוע האחרון: עיגול שליחת הפרטים נשאר מוצג (כך שביטול סימון "נשלח" לא גורם לו להיעלם, גם אחרי רענון) */
  const evRecent = (m) => { if (!m) return false; const st = startMs(m), n = nowIL(); return n >= st && n < st + 7 * 864e5; };
  const hasSent = (m) => !!(m && state.att.some((l) => l.meeting_id === m.id && l.details_sent_at));
  const SENT_COL_ON = false;   // עמודת "שליחת פרטי המפגש" (העיגול בשורה, אייקון הסינון והטוגל בתפריט) בוטלה ב-31.10.26: מוחלפת בתבניות הוואטסאפ. להחזרה: true
  const sentView = (m) => !!(SENT_COL_ON && m && state.showSent !== false && (state.showSent === true || evOnFor(m) || hasSent(m) || evRecent(m)));
  /* עמודת ההגעה ועמודת השליחה בשורות (ואייקון הסינון שלהן) קיימות רק כשיש בהן מה להציג: לפחות משתתף אחד עם עיגול, או סינון פעיל;
     בלי זה לא נשמרת עמודה ריקה שמצמצמת את השמות ודוחפת את התשלום הצידה */
  const colSent = (ids) => { const m = meetOf(state.filter); return !!(state.filter && m && sentView(m) && (state.sent || state.att.some((a) => a.meeting_id === m.id && (!ids || ids.has(a.participant_id))))); };   // הטוגל דולק: העמודה קיימת (עם עיגול לא פעיל למי שעוד לא זכאי)
  const sentMatch = (pid, l, v) => !!l && (v === '1' ? !!l.details_sent_at : (!l.details_sent_at && evElig(pid, l)));
  const effSent = () => (state.q.trim() || !state.filter || !sentView(meetOf(state.filter))) ? null : state.sent;
  /* מצב קרדיט (רק בתצוגת הכל): זכאי (יש קרדיט לטובתו), חייב (יתרת חובה), מאוזן */
  const balState = (p) => { const b = Math.round(creditOf(p.id) * 100) / 100; return b < 0 ? '0' : (b > 0 || pkgLeft(p.id) > 0) ? '1' : 'n'; };   // זכאי: קרדיט כספי או מפגשים בכרטיסייה
  /* לא לתשלום בסינון הקרדיט: משתתף שרשום לפחות למפגש אחד והוא לא לתשלום בכל המפגשים שהוא רשום אליהם */
  const freeAll = (p) => { const ls = linksOf(p.id); return ls.length > 0 && ls.every((l) => noPayOf(p, l)); };
  const balMatch = (p, v) => v === 'f' ? freeAll(p) : balState(p) === v;
  const effBal = () => (state.q.trim() || state.filter || !state.showPay) ? null : state.bal;
  const balOk = (p) => { const b = effBal(); return !b || balMatch(p, b); };
  const sentOk = (p) => { if (!balOk(p)) return false; const s = effSent(); if (!s) return true; const l = linkOf(p.id, state.filter); return sentMatch(p.id, l, s); };
  /* שולם בדרך תשלום מסוימת למפגש הזה ('m'+מפתח): יש רשומת תשלום או הפקדה של המשתתף למפגש בדרך הזו */
  const paidVia = (pid, mid, key) => state.payments.some((x) => x.participant_id === pid && x.meeting_id === mid && (x.kind === 'payment' || x.kind === 'deposit') && x.method === key);
  const payF = (p, f) => f === 'r' ? reservedOf(p.id, state.filter) : f === 'u' ? !reservedOf(p.id, state.filter) : (f && f[0] === 'm') ? (!noPayOf(p, linkOf(p.id, state.filter)) && paidVia(p.id, state.filter, f.slice(1))) : (f && f[0] === 'a') ? (!noPayOf(p, linkOf(p.id, state.filter)) && Math.round(allocatedOf(p.id, state.filter)) === Number(f.slice(1))) : payStateOf(p) === f;   // 'a80': ששולם בדיוק 80 למפגש הזה
  const paidOk0 = (p) => { const f = effPaidF(); return (!f || payF(p, f)) && sentOk(p); };
  /* הגיעו / לא הגיעו (הצ'יף בשורה העליונה, אחרי המשוריינים): לפי סימון ההגעה למפגש (attended), רק בתוך מפגש שהתחיל, ומושהה בזמן חיפוש כמו שאר הסינונים */
  const arrOpen = () => !!(state.filter && meetOf(state.filter));   // הצ'יף "הגיעו" והסינון שלו בכל מפגש נבחר, גם בכזה שעוד לא התחיל (7.11.26, לבקשת בעל האתר; קודם רק במפגש שהתחיל או במצב הגעה)
  const effArrF = () => (state.q.trim() || !arrOpen()) ? null : state.arrF;
  /* סימון הגעה לא משנה את הצגת המשתתף ברשימה (7.11.26): כשסינון הגעה פעיל (הגיעו / לא הגיעו) וסימנו הגעה, מי שהיה ברשימה נשאר בה גם אם הסימון היה מוציא אותו, עד שהסינון מתחלף
     (הצ'יף, תפריט העמודה, איפוס סינונים, מפגש אחר או חיפוש). arrKeep: { f, m, ids } תמונת המשתתפים שהיו ברשימה ברגע הסימון הראשון */
  let arrKeep = null;
  const arrRaw = (p) => { const f = effArrF(); if (!f) return true; const l = linkOf(p.id, state.filter), on = !!(l && l.attended); return f === '1' ? on : !on; };
  const arrOk = (p) => { const f = effArrF(); if (!f) return true; if (arrKeep && arrKeep.f === f && arrKeep.m === state.filter && arrKeep.ids.has(p.id)) return true; return arrRaw(p); };
  const arrFreeze = () => { const f = effArrF(); if (!f) { arrKeep = null; return; } if (arrKeep && arrKeep.f === f && arrKeep.m === state.filter) return; arrKeep = { f, m: state.filter, ids: new Set(state.participants.filter(arrRaw).map((p) => p.id)) }; };
  const paidOk = (p) => paidOk0(p) && arrOk(p);
  const normFilter = () => { if (state.pay) { const ks = payKeys(state.pay).filter((k) => k === '__none' || state.statuses.some((s) => s.key === k)); state.pay = ks.length ? ks.join(',') : null; } };   // בחירה מרובה: רק תגיות שקיימות
  /* סוג מפגש שנבחר בתפריט (בלי מפגש מסוים): התצוגה היא כמו "כל המשתתפים", רק עם מי שמשויך לפחות למפגש אחד מהסוג */
  let mtSet = null;
  const mtypeOk = (p) => {
    if (!state.mtype || state.filter) return true;
    if (!mtSet || mtSet.k !== state.mtype) { const ids = new Set(state.meetings.filter((m) => typeIdOf(m) === state.mtype).map((m) => m.id)); mtSet = { k: state.mtype, s: new Set(state.att.filter((a) => ids.has(a.meeting_id)).map((a) => a.participant_id)) }; }
    return mtSet.s.has(p.id);
  };
  const stMatch = (p, key) => key === '__none' ? (state.filter ? !linkStatus(linkOf(p.id, state.filter)) : !linksOf(p.id).some((l) => linkStatus(l))) : state.filter ? linkStatus(linkOf(p.id, state.filter)) === key : linksOf(p.id).some((l) => { if (linkStatus(l) !== key) return false; if (!state.mtype) return true; const m = meetOf(l.meeting_id); return !!m && typeIdOf(m) === state.mtype; });   // במפגש: התגית בו; בסוג מפגש: במפגשים של הסוג; בכל המשתתפים: בכל מפגש
  const clearFilters = () => { updFrozen = null; arrKeep = null; state.pay = null; state.gender = null; state.paidF = null; state.arrF = null; state.sent = null; state.bal = null; state.srcF = null; state.ageF = null; state.mcF = null; state.updF = null; state.regF = null; waSetFilter(''); };   // כל הסינונים, בלי המיון

  /* המשתתפים בתצוגה לפני סינוני הצ'יפים והעמודות: מפגש, סוג מפגש, מחוקים, "עוד" (שיווק ממומן, גיל) והחיפוש */
  const poolP = () => {
    const q = state.q.trim().toLowerCase(), qd = digits(q);
    return state.participants.filter((p) => {
      if (state.filter && !linkOf(p.id, state.filter)) return false;
      if (!mtypeOk(p)) return false;
      if (!state.filter && p.active === false && !q) return false;   // מחוקים: רק בחיפוש טקסט פעיל
      if (!moreOk(p)) return false;
      if (!q) return true;
      return qMatch(p, q, qd);
    });
  };
  function renderFacets() {
    normFilter();
    const q = state.q.trim().toLowerCase(), qd = digits(q), eg = effGender(), ep = effPay();
    const base = poolP();
    const epk = payKeys(ep), payOk = (p) => paidOk(p) && matchPay(p, epk);
    const genOk = (p) => !eg || payKeys(eg).includes(p.gender || 'none');
    $('#facets').classList.toggle('searching', !!q);
    $('#facets').innerHTML = '';
    const evOn = !!(state.filter && sentView(meetOf(state.filter)));   // סינון השליחה מוצג כשהטוגל דולק (גם כשאף אחד עוד לא זכאי)
    { const nd = String(Math.max(2, String(state.participants.length).length)); $('#listTags').style.setProperty('--nd', nd); document.documentElement.style.setProperty('--nd', nd); }
    { const lc = $('#listCount'); lc.textContent = cntTxt(state.listCnt); }
    // כפתור הסינון עבר לשורת הצ'יפים (אחרי המגדר): filterBtnHtml()
    
    $('#listMore').innerHTML = ''; paintCnt();   // שלוש נקודות מימין לסינון ה-₪; המגדר בתוך התפריט
    ['#listWa', '#listPay', '#listSent', '#listBal'].forEach((q) => { $(q).innerHTML = ''; });   // אייקוני הסינון של העמודות (תשלום, שליחה, הגעה / קרדיט, ), מיושרים מעל העמודות שלהן
    {   /* ספירה לכל אפשרות בתפריטי הסינון של העמודות: כמה משתתפים יוצגו אם בוחרים אותה (שאר הסינונים והחיפוש נשמרים) */
      const mid = state.filter, lk = (p) => linkOf(p.id, mid);
      const only = {
        pay: (p) => { const f = effPaidF(); return !f || payF(p, f); },
        sent: (p) => { const s = effSent(); if (!s) return true; return sentMatch(p.id, lk(p), s); },
        bal: (p) => { const b = effBal(); return !b || balMatch(p, b); },
      };
      const match = {
        pay: (p, v) => payF(p, v),
        sent: (p, v) => sentMatch(p.id, lk(p), v), bal: (p, v) => balMatch(p, v),
      };
      FC = {};
      ['pay', 'sent', 'bal'].forEach((k) => {
        FC[k] = {}; const pool = base.filter((p) => genOk(p) && matchPay(p, epk) && Object.keys(only).filter((o) => o !== k).every((o) => only[o](p)));
        FC[k][''] = pool.length; ['1', '0', 'n', 'f', 'l', 'r', 'u'].forEach((v) => { FC[k][v] = ((k === 'sent' && v === 'n') || (k !== 'pay' && (v === 'l' || v === 'r' || v === 'u'))) ? 0 : pool.filter((p) => match[k](p, v)).length; });
      });
      const payPool = mid ? base.filter((p) => genOk(p) && matchPay(p, epk) && only.sent(p) && only.bal(p)) : [];
      FC.payAmts = {}; payPool.forEach((p) => { const l = lk(p); if (!l || noPayOf(p, l)) return; const a = Math.round(allocatedOf(p.id, mid)); if (a > 0) FC.payAmts[a] = (FC.payAmts[a] || 0) + 1; });   // סכומים ששולמו במפגש הזה, עם כמות המשתתפים לכל סכום
      FC.payMeth = {}; payPool.forEach((p) => { const l = lk(p); if (!l || noPayOf(p, l)) return; state.payMethods.forEach((pm) => { if (paidVia(p.id, mid, pm.key)) FC.payMeth[pm.key] = (FC.payMeth[pm.key] || 0) + 1; }); });   // דרכי תשלום ששולם בהן במפגש הזה
    }
    const fbtn = (kind, v, n1, n0) => { const isA = v && /^[am]/.test(String(v)) && String(v).length > 1 && kind === 'pay', isM = isA && String(v)[0] === 'm', c = (v === '1' || v === 'r' || isA) ? 'yes' : (v === '0' || v === 'u') ? 'no' : v === 'n' ? (kind === 'pay' ? 'fr' : 'free') : v === 'f' ? 'fr' : (v === 'l' && kind === 'pay') ? 'later' : 'all', lab = FLAB[kind]; return '<button type="button" class="hfilt ' + c + '" data-fk="' + kind + '" aria-haspopup="menu" aria-label="' + FNAME[kind] + ': ' + (isM ? esc((state.payMethods.find((pm) => pm.key === v.slice(1)) || {}).name || v.slice(1)) : isA ? '₪' + v.slice(1) : v === '1' ? lab[1] : v === '0' ? lab[2] : v === 'n' ? lab[3] : v === 'l' ? lab[4] : v === 'r' ? lab[5] : v === 'u' ? lab[6] : v === 'f' ? lab[4] : lab[0]) + '" title="' + (isM ? 'שולם ב' + esc((state.payMethods.find((pm) => pm.key === v.slice(1)) || {}).name || v.slice(1)) : isA ? 'ששולמו ₪' + v.slice(1) : v === '1' ? lab[1] + ' (' + n1 + ')' : v === '0' ? lab[2] + ' (' + n0 + ')' : v === 'n' ? lab[3] : v === 'l' ? lab[4] : v === 'r' ? lab[5] : v === 'u' ? lab[6] : v === 'f' ? lab[4] : lab[0] + ': ' + lab[1] + ' ' + n1 + ', ' + lab[2] + ' ' + n0) + ' (לחיצה לפתיחת תפריט)">' + fglyph(kind, c) + UI.fdot(c === 'all' ? '' : c === 'yes' ? (kind === 'bal' ? 'yellow' : 'green') : c === 'later' ? 'blue' : c === 'no' ? 'red' : 'gray') + '</button>'; };
    const sentN = (v) => base.filter((p) => { if (!genOk(p) || !paidOk(p) || !matchPay(p, epk)) return false; return sentMatch(p.id, linkOf(p.id, state.filter), v); }).length;
    $('#listPay').innerHTML = '';   // אייקון סינון התשלום הוסר (הצ'יף "תשלומים" בשורת הצ'יפים במקומו)
    { const ws = waSelected(), am = attMode(), cur = am ? 'הגעה' : ws ? String(ws.name || 'ללא שם') : 'וואטסאפ'; if (state.waSent && !waFilter() && !document.documentElement.classList.contains('is-loading')) waResetSent('');   // עמודת הסימון: הודעה ריקה, תבנית הודעה, או הגיע / לא הגיע
      $('#listWa').innerHTML = '';   // אייקון עמודת הסימון הוסר (הכפתור הצף בתחתית במקומו)
      const fab = $('#waFab'); if (fab && !state.filter) { fab.innerHTML = ''; fab.hidden = true; } else if (fab) { fab.hidden = false;   // מתג של שלושה מצבים: וואטסאפ רגיל, הודעה (תבנית), הגעה (רק בתוך מפגש); המסומן הוא הבולט
        const mb = (k, ic, on, lab, id) => '<button type="button"' + (id ? ' id="' + id + '" aria-haspopup="menu" aria-expanded="false"' : '') + ' class="wm3b' + (on ? ' on' : '') + '" data-wm="' + k + '" aria-pressed="' + on + '" aria-label="' + lab + '" title="' + lab + '">' + ic + (k === 'msg' && on && waFilter() ? UI.fdot(waFilter() === '1' ? 'green' : 'red') : '') + '</button>';   // סינון נשלח / לא נשלח פעיל: נקודה ליד סמל ההודעה
        fab.innerHTML = mb('wa', icon('wa'), !am && !ws, 'וואטסאפ רגיל') + mb('msg', icon('chat'), !!ws && !am, ws ? 'הודעה: ' + esc(ws.name) : 'הודעה מוכנה', 'waMsgBtn') + (state.filter ? mb('att', icon('check'), am, 'הגעה') : ''); }
    }
    $('#listSent').innerHTML = evOn ? fbtn('sent', effSent(), sentN('1'), sentN('0')) : '';
    $('#listBal').innerHTML = '';   // אייקון סינון הקרדיט הוסר (הצ'יף "קרדיט" בשורת הצ'יפים במקומו)
  }

  /* מיון הרשימה */
  const SORTS = [['last', 'מפגש אחרון', 'מהאחרון לישן', 'מהישן לאחרון'], ['new', 'הרשמה', 'מהחדש לישן', 'מהישן לחדש'], ['upd', 'עדכון', 'מהעדכני לישן', 'מהישן לעדכני'], ['meet', 'כמות מפגשים', 'מהרב למעט', 'מהמעט לרב', false, true], ['status', 'תגית', 'לפי סדר התגיות בסוג המפגש', 'בסדר הפוך', true], ['pay', 'תשלום', 'לתשלום, תשלום בהמשך, שולם, לא לתשלום', 'בסדר הפוך', true]];   // תגית (רק בתוך מפגש): לפי סדר התגיות של סוג המפגש   // הרשמה: לפי מועד ההרשמה; עדכון: לפי הפעולה האחרונה שבוצעה על המשתתף
  function sortCmp() {
    const byNew = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
    const byName = (a, b) => a.name.localeCompare(b.name, 'he');
    const ageOf = (p) => { const x = shownAge(p); return x == null ? null : x; };
    const byAge = (dir) => (a, b) => { const x = ageOf(a), y = ageOf(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return dir * (x - y); };
    const asc = state.sortDir === 'asc', rev = (f) => asc ? (a, b) => -f(a, b) : f;   // כיוון הפוך: הופכים את ההשוואה
    if (state.sort === 'status' && state.filter) {   // תגית: לפי סדר התגיות של סוג המפגש; בלי תגית בסוף
      const order = statusList().map((x) => x.key);
      const rk = (q) => { const l = linkOf(q.id, state.filter); if (!l) return 1e9; const i = order.indexOf(linkStatus(l)); return i < 0 ? 1e8 : i; };
      return rev((a, b) => (rk(a) - rk(b)) || byNew(a, b) || byName(a, b));
    }
    if (state.sort === 'pay' && state.filter) {   // תשלום (רק בתוך מפגש): לתשלום, תשלום בהמשך, שולם, לא לתשלום (אותו סדר כמו בתפריט הסינון)
      const o = { '0': 0, l: 1, '1': 2, n: 3 };
      return rev((a, b) => ((o[payStateOf(a)] ?? 0) - (o[payStateOf(b)] ?? 0)) || byNew(a, b) || byName(a, b));
    }
    if (state.sort === 'meet' && !state.filter) {   // כמות מפגשים (רק בכל המשתתפים ובסוג מפגש): מי שלא משויך לאף מפגש תמיד בסוף, בשני הכיוונים
      const n = new Map(state.participants.map((p) => [p.id, meetCountOf(p)]));
      return (a, b) => { const x = n.get(a.id) || 0, y = n.get(b.id) || 0; if (!x || !y) return !x && !y ? byName(a, b) : !x ? 1 : -1; return (asc ? x - y : y - x) || byName(a, b); };
    }
    if (state.sort === 'last') {   // מפגש אחרון (ברירת מחדל): לפי המפגש האחרון שהמשתתף משויך אליו (בתוך מפגש: לפי מועד השיוך למפגש הזה); מי שלא משויך לאף מפגש בסוף
      const key = new Map(state.participants.map((p) => {
        if (state.filter) { const l = linkOf(p.id, state.filter); return [p.id, l ? String(l.created_at || '') : '']; }
        const ms = linksOf(p.id).map((l) => meetOf(l.meeting_id)).filter(Boolean).map((m) => String(m.meeting_date) + ' ' + String(m.meeting_time || '')); return [p.id, ms.length ? ms.sort().pop() : ''];
      }));
      return (a, b) => { const x = key.get(a.id) || '', y = key.get(b.id) || ''; if (!x || !y) return !x && !y ? byNew(a, b) : !x ? 1 : -1; return (asc ? x.localeCompare(y) : y.localeCompare(x)) || byNew(a, b); };
    }
    if (state.sort === 'upd') {   // עדכון: הפעולה האחרונה על המשתתף: הרשמה, שיוך או שינוי במפגש, הגעה, שליחת פרטים, תשלום או הערה (גם הערות מערכת)
      return rev((a, b) => lastUpdV(b.id).localeCompare(lastUpdV(a.id)) || byName(a, b));
    }
    if (state.sort === 'age') return (a, b) => byAge(asc ? 1 : -1)(a, b) || byNew(a, b);   // גיל: מהגבוה לנמוך (ירידה) או הפוך; בלי גיל בסוף
    switch (state.sort) {
      case 'old': return (a, b) => -byNew(a, b) || byName(a, b);
      case 'name': return byName;
      case 'age_asc': return (a, b) => byAge(1)(a, b) || byNew(a, b);
      case 'age_desc': return (a, b) => byAge(-1)(a, b) || byNew(a, b);
      default: return rev((a, b) => byNew(a, b) || byName(a, b));
    }
  }
  function renderSort() {
    
    
    $('#sortMenu').innerHTML = SORTS.filter((s) => (!s[4] || state.filter) && (!s[5] || !state.filter)).map((s) => { const on = state.sort === s[0], t = on ? s[1] + ', ' + (state.sortDir === 'asc' ? s[3] : s[2]) + ' (לחיצה נוספת הופכת את הסדר)' : s[1]; return '<button type="button" role="menuitemradio" data-sort="' + s[0] + '" aria-checked="' + on + '" title="' + esc(t) + '"' + (on ? ' aria-label="' + esc(t) + '"' : '') + '><span>' + s[1] + '</span>' + (on ? '<span class="sdir" aria-hidden="true">' + icon(state.sortDir === 'asc' ? 'sup' : 'sdown', 'i16') + '</span>' : '') + '</button>'; }).join('');
  }
  const closeSort = () => { $('#sortMenu').hidden = true; };   // התפריט הצף (מועבר ל-body) נפתח מכפתור המיון בכותרת
  $('#sortMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-sort]'); if (!b) return; if (b.dataset.sort === state.sort) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc'; else { state.sort = b.dataset.sort; state.sortDir = 'desc'; } render(); saveViewPrefs(); });   // בחירה (גם במיון אחר) לא סוגרת את התפריט   // לחיצה נוספת על המיון שנבחר: סדר הפוך והתפריט נשאר פתוח (לראות את הכיוון משתנה); בחירת מיון אחר סוגרת אותו
  document.addEventListener('click', (e) => { if (e.target.isConnected && !e.target.closest('#sortMenu')) closeSort(); });   // (isConnected: לחיצה על אפשרות שהתפריט צייר מחדש כבר לא בדף, ואינה לחיצה בחוץ)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSort(); });


  /* האם משתתף מוצג ברשימה לפי כל הסינונים והחיפוש (משמש גם לספירות בתפריט דפוס ההגעה) */
  function rowPass(p, q, qd) {
    if (state.filter && !linkOf(p.id, state.filter)) return false;
    if (!mtypeOk(p)) return false;   // סוג מפגש שנבחר: רק מי שמשויך למפגש מהסוג
    if (!state.filter && p.active === false && !q) return false;   // הוסר (מחוק): ברשימת כל המשתתפים מופיע רק בחיפוש טקסט פעיל, לא דרך הסינונים
    if (!moreOk(p)) return false;
    if (effPay() && !matchPay(p, payKeys(effPay()))) return false;
    if (!sentOk(p) || !paidOk(p)) return false;
    if (state.waSent && !q && !waSentOk(p)) return false;   // הכל / נשלח / לא נשלח, לפי התבנית שנבחרה (מושהה בזמן חיפוש)
    if (effGender() && !payKeys(effGender()).includes(p.gender || 'none')) return false;
    if (!q) return true;
    return qMatch(p, q, qd);
  }
  function renderList() { renderChipRow();
    updMap = null;
    normFilter();
    renderFacets();
    const q = state.q.trim().toLowerCase();
    const qd = digits(q);
    let rows = state.participants.filter((p) => rowPass(p, q, qd) || (state.filter && !linkOf(p.id, state.filter) && remKept(p)));
    rows.sort(sortCmp());

    /* במסך מפגש + חיפוש: מציגים גם מי שלא רשום למפגש, כדי להוסיף אותם בלחיצה (למשל מי שהגיע בלי להודיע) */
    let others = [];
    if (state.filter && q) {
      others = state.participants.filter((p) => !linkOf(p.id, state.filter) &&
        (qMatch(p, q, qd)));
      others.sort((a, b) => a.name.localeCompare(b.name, 'he'));
    }
    const newBtn = '';
    $('#addBox').innerHTML = '';
    const addHtml = q ? '<li class="addli"><button type="button" class="newbtn" id="addNew" aria-label="הוספת משתתף חדש: ' + esc(state.q.trim()) + '" title="הוספת משתתף חדש"><span class="tg ico plus" aria-hidden="true">+</span><b dir="auto">' + esc(state.q.trim()) + '</b></button></li>' : '';   // בסוף הרשימה, כחלק ממנה

    state.listCnt = String(rows.length + others.length); { const lc = $('#listCount'); if (lc) lc.textContent = cntTxt(state.listCnt); } paintCnt();   // מספר הרשומות המוצגות כרגע (בשורת הסינון, מימין, ובתפריט הסינון בשורת "תצוגה")
    if (!rows.length && !others.length) {
      $('#list').innerHTML = addHtml;   // רשימה ריקה: בלי הודעות (נשאר רק "הוספת משתתף חדש" בחיפוש)
      requestAnimationFrame(alignFilters);
      return;
    }

    const visIds = new Set(rows.concat(others).map((q) => q.id)), anyEv = colSent(visIds);   // בתצוגה הכללית / סוג: עמודת סימון ההגעה למפגש הקרוב רק כשהטוגל דולק, הסימון פתוח ויש בשורות המוצגות מישהו שמשויך אליו   // עמודה שמורה רק אם יש עיגול באחת מהשורות המוצגות (אחרת השמות נדחסים)   // עמודות שמורות רק כשיש בהן מה להציג
    const attM = attMode(), wsel = waSelected();   // התבנית שנבחרה בעמודת הוואטסאפ (בלי בחירה: הודעה ריקה)
    const rowHtml = (p) => {
      const age = shownAge(p);
      const wa = waLink(p.phone, wsel ? fillMsg(wsel.body, wsel.m, p) : undefined);
      const wsent = wsel ? sentRow(p.id, wsel.m.id, wsel.id) : null;
      const mailed = !!(wsel && wsel.system_key === 'confirm' && state.confMail.has(p.id + '|' + wsel.m.id));   // אישור המקום נשלח במייל: סמל מייל בתוך אותו עיגול   // התבנית שנבחרה כבר נשלחה למשתתף הזה
      const tel = telLink(p.phone);
      let side = '';
      if (state.filter) {
        const l = linkOf(p.id, state.filter);
        if (!l) side = UI.tag('הוספה למפגש', 'ptag none', { 'data-rowadd': p.id, role: 'button', tabindex: 0, title: 'לא משויך למפגש. לחיצה: הוספה למפגש' });   // עוד לא משויך: תגית "לא משויך" (לחיצה כמו על ה-+: שיוך עם אישור)
        else if (missedOf(p.id, meetOf(state.filter))) side = UI.tag('לא הגיע', 'ptag missed', { 'data-qs': p.id, role: 'button', tabindex: 0, title: 'משויך ולא הגיע (לחיצה לשינוי תגית)' });
        else { const st = linkStatus(l); side = st ? UI.tag(esc(STATUS_LABEL[st]), 'ptag ' + st, { 'data-qs': p.id, role: 'button', tabindex: 0, title: 'תגית (לחיצה לשינוי)' }) : UI.tag(icon('tag'), 'ico ptag nolabel', { 'data-qs': p.id, role: 'button', tabindex: 0, 'aria-label': 'הוספת תגית', title: 'הוספת תגית' }); }
      }
      let payIc = '';
      if (state.showPay && state.filter && linkOf(p.id, state.filter)) { const al = allocatedOf(p.id, state.filter), mt = meetOf(state.filter), lk = linkOf(p.id, state.filter), need = mt ? (pkgNetFor(p.id, state.filter) > 0 ? al : expectedPrice(p.id, mt, ilDay(lk.created_at || new Date().toISOString()))) : 0;
        const ptx = payTxt(p.id, state.filter, noPayOf(p, lk));
        if (noPayOf(p, lk)) payIc = '<span class="payic free" title="לא לתשלום">' + ptx + '</span>';
        else payIc = laterOf(p.id, state.filter) ? '<span class="payic later" title="תשלום בהמשך, משוריין למפגש' + (al > 0 ? ' (שולם ₪' + nfm(al) + ', נשאר ₪' + nfm(dueOf(p.id, state.filter)) + ')' : '') + '">' + ptx + '</span>' : dueOf(p.id, state.filter) > 0 ? '<span class="payic" title="שולם ₪' + nfm(al) + ', נשאר לשלם ₪' + nfm(dueOf(p.id, state.filter)) + '">' + ptx + '</span>' : al <= 0 ? '<span class="payic" title="לתשלום">' + ptx + '</span>' : '<span class="payic ok" title="שולם ₪' + nfm(al) + '">' + ptx + '</span>'; }   // אין "שולם חלקית": יש כסף שהוקצה למפגש = שולם   // סמל תשלום (לפי רשומות התשלום, לא לפי תגית) מימין לתגית
      let mcntHtml = '', mcntAll = '';
      { const c = meetCounts(p), n = c.came + c.next; mcntAll = '<span class="mcnt" title="' + ([c.came ? 'הגיע ל' + (c.came === 1 ? 'מפגש אחד' : '-' + c.came + ' מפגשים') : '', c.next ? 'משוריין ל' + (c.next === 1 ? 'מפגש הבא אחד' : '-' + c.next + ' מפגשים הבאים') : ''].filter(Boolean).join(' · ') || 'עוד לא הגיע ולא משוריין למפגשים') + '">' + icon('bookmark', 'i14') + n + '</span>'; if (!state.filter) mcntHtml = mcntAll; }   // כמות המפגשים של המשתתף: תמיד מוצגת (גם 0), בכל התצוגות
      if (false) { const c = meetCounts(p), n = c.came + c.next; if (n) mcntHtml = '<span class="mcnt" title="' + [c.came ? 'הגיע ל' + (c.came === 1 ? 'מפגש אחד' : '-' + c.came + ' מפגשים') : '', c.next ? 'משוריין ל' + (c.next === 1 ? 'מפגש הבא אחד' : '-' + c.next + ' מפגשים הבאים') : ''].filter(Boolean).join(' · ') + '">' + icon('bookmark', 'i14') + n + '</span>'; }   // בלי שיוך: התא ריק, והעמודה נשמרת
      const evc = evCircle(p);
      const hasUn = !!state.filter, isLinked = !!(state.filter && linkOf(p.id, state.filter));   // בתוך מפגש: ✕ להסרת השיוך, באותו מקום של ה-✕ בשורת המפגש בכרטיס המשתתף
      const act = p.active === false ? ['restore', 'back', 'החזרה', ''] : (state.filter ? ['unlink', 'caloff', 'הסרה', 'danger'] : ['remove', 'trash', 'מחיקה', 'danger']);   // all participants or a meeting type: DELETE (trash icon); inside a meeting: REMOVE from it (calendar with a slash). Both ask first.   // swipe action (roster kit): remove with undo, or bring a removed one back
      return '<li class="row ucard' + (hasUn ? ' hasun' : '') + '" data-swipe="people" data-pid="' + esc(p.id) + '"><div class="rswipe-fg">' +
        // בלי ✕ להסרה מהמפגש ובלי + להוספה ברשימת המשתתפים (11.11.26): ההסרה והשיוך רק מכרטיס המשתתף, ומהצ'יף "הוספה למפגש"
        (attM ? attTag(p) : wa ? UI.tag(wsel ? (wsent ? WA_ICON : mailed ? MAIL_ICON : '') : WA_ICON, 'ico rowwa' + (wsel ? ' ratt msgc ' + (wsent ? 'yes sent' : mailed ? 'yes' : 'no') : ''), Object.assign({ href: wa }, /^https?:/.test(wa) ? { target: '_blank', rel: 'noopener' } : {}, wsel ? { 'data-wsend': p.id } : {}, { 'aria-label': 'וואטסאפ ל' + esc(p.name) + (wsent ? ', ההודעה נשלחה' : mailed ? ', נשלח במייל' : ''), title: wsel ? esc(wsent ? 'נשלחה ההודעה "' + wsel.name + '" בוואטסאפ · ' + fmtDT(wsent.sent_at) + ' · לחיצה לביטול הסימון' : mailed ? 'נשלח במייל. לחיצה: וואטסאפ עם ההודעה' : 'וואטסאפ עם ההודעה: ' + wsel.name) : 'וואטסאפ' }), 'a') : UI.tag(WA_ICON, 'ico rowwa nophone', { role: 'img', 'aria-label': 'אין טלפון', title: 'אין טלפון' })) +
        '<div class="main' + ' hasw' + (anyEv ? ' ev' : '') + (!state.filter && state.showPay ? ' bl' : '') + '" role="button" tabindex="0" data-edit="' + p.id + '">' +
          '<div class="nm"><span class="name' + nameCls(p) + '" dir="rtl">' + nameMark(p) + mcntHtml + srcChip(p, state.filter) + '</span>' + '</div>' +   // רק השם מבודד (שם באנגלית לא הופך את השורה), וסמל החשבון תמיד משמאל לשם
          (true ? '<div class="meta">' + (true ? '<span class="age' + (originOf(p, state.filter) ? ' ' + originOf(p, state.filter).kind : '') + '"' + originAttr(p, state.filter) + ' title="' + (p.gender ? (p.gender === 'male' ? 'זכר' : 'נקבה') + ' · ' : '') + 'גיל"><bdi dir="rtl">' + (age != null ? age : (p.gender ? '' : '-')) + (age != null || !p.gender ? ' ' : '') + '<b class="gl">' + (p.gender ? icon(p.gender === 'male' ? 'male' : 'female', 'i14') : '<span class="ic i14 ph" aria-hidden="true"></span>') + '</b>' + '</bdi></span>' : '') + '<span class="sidewrap">' + (state.filter ? mcntAll.replace('class="mcnt"', 'class="mcnt mcnt2 mcnt3"') : '') + side + payIc + '</span>' + '</div>' : '') +
          // הערה אחרונה וסימון צירוף תמונה לא מוצגים ברשימה (הערות רק בכרטיס המשתתף)
          mcntHtml.replace('class="mcnt"', 'class="mcnt mcnt2"') +   // עותק לכרטיס (טלפון וטאבלט): כמות המפגשים בשורה השנייה, ולא בשורת השם
          evc +
          (!state.filter && state.showPay ? (() => { const b = Math.round(creditOf(p.id) * 100) / 100; const fa = b === 0 && freeAll(p), pk = pkgLeft(p.id), ses = pk > 0 ? '<span class="balic pos ses" title="זכאי: ' + pk + ' מפגשים בכרטיסייה">' + icon('cal', 'i14') + pk + '</span>' : ''; if (b === 0 && pk > 0) return ses; return ses + '<span class="balic ' + (b > 0 ? 'pos' : b < 0 ? 'neg' : fa ? 'fr' : 'zero') + '" title="' + (b > 0 ? 'זכאי: קרדיט לטובתו ₪' + nfm(b) : b < 0 ? 'חייב: יתרת חובה ₪' + nfm(-b) : fa ? 'לא לתשלום: בכל המפגשים שנרשם אליהם' : 'מאוזן') + '">₪' + (b > 0 ? nfm(b) : b < 0 ? nfm(-b) : '') + '</span>'; })() : '') +
        '</div>' +
      '</div><div class="rswipe" aria-hidden="true"><button type="button" class="rswipe__act" tabindex="-1"' + (act[3] ? ' data-tone="danger"' : '') + ' data-swipe-act="' + act[0] + '" data-id="' + esc(p.id) + '">' + icon(act[1]) + '<span>' + act[2] + '</span></button></div></li>';
    };
    const rowsHtml = rows.map(rowHtml).join('');
    const othersHtml = others.length ? '<li class="group">לא משויכים למפגש הזה</li>' + others.map(rowHtml).join('') : '';
    { const L = $('#list'), keepTop = L.scrollTop; L.innerHTML = rowsHtml + othersHtml + newBtn + addHtml; if (keepTop && L.scrollTop !== keepTop) L.scrollTop = keepTop; }   // ציור מחדש (גם מהזמן אמת) לא מזיז את הגלילה
    markSel(); requestAnimationFrame(alignFilters);   // שורת הסינון נבנית מחדש בכל ציור של הרשימה (גם בחיפוש): האייקונים מתיישרים מחדש
  }


  /* ---------- סטטיסטיקות ---------- */
  const ilDay = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(iso));
  const P = (a, b) => b ? Math.round(a / b * 100) : null;
  const Ps = (a, b) => b ? Math.round(a / b * 100) + '%' : '-';
  const nfm = (n) => Math.round(n).toLocaleString('he-IL');

  function computeStats() {
    const asc = state.meetings.slice().sort(meetAsc);
    const mById = new Map(state.meetings.map((m) => [m.id, m])), pById = new Map(state.participants.map((p) => [p.id, p]));
    const all = state.att.filter((l) => mById.has(l.meeting_id) && pById.has(l.participant_id)).map((l) => ({ ...l, m: mById.get(l.meeting_id), p: pById.get(l.participant_id) }));
    const links = all;
    // לכל מפגש: נרשמים, שילמו, הכנסה, חדשים/חוזרים, שימור מהמפגש הקודם
    const seen = new Set(); let prev = new Set();
    const perMeeting = asc.map((m) => {
      const ls = all.filter((l) => l.meeting_id === m.id), S = new Set(ls.map((l) => l.participant_id));
      const ret = [...S].filter((id) => seen.has(id)).length, kept = [...S].filter((id) => prev.has(id)).length;
      const row = { m, regs: ls.length, ex: ls.filter((l) => l.no_pay).length, paid: ls.filter((l) => allocatedOf(l.participant_id, l.meeting_id) > 0).length, rev: ls.reduce((s, l) => s + Math.max(0, allocatedOf(l.participant_id, l.meeting_id)), 0),
        news: S.size - ret, ret, kept, prevN: prev.size, started: meetingStarted(m), came: ls.filter((l) => l.attended).length, women: ls.filter((l) => l.p.gender === 'female').length, men: ls.filter((l) => l.p.gender === 'male').length };
      S.forEach((id) => seen.add(id)); prev = S;
      return row;
    });
    return { asc, links, all, perMeeting };
  }

  const kpi = (v, label, sub, tone) => UI.metric(label, v, { sub, tone: tone === 'good' ? 'pos' : tone === 'bad' ? 'neg' : tone === 'warn' ? 'yel' : '' });
  const bars = (rows) => '<div class="bars">' + rows + '</div>';   // כל הסרגלים בקבוצה באותו רוחב: העמודה של הערך לפי הערך הרחב ביותר
  const barRow = (label, n, total, color, extra, shown) => { const w = total ? Math.max(0, Math.round(n / total * 100)) : 0; return '<div class="brow"><span class="bl">' + label + '</span><span class="bt"><i style="width:' + w + '%;background:' + color + '"></i></span><span class="bv"><b>' + (shown != null ? shown : n) + '</b>' + (total ? ' · ' + w + '%' : '') + (extra ? ' · ' + extra : '') + '</span></div>'; };
  const colsChart = (items, color, dense) => { const max = Math.max(1, ...items.map((i) => i.v)); return '<div class="cols' + (dense ? ' dense' : '') + '">' + items.map((i) => '<div class="col">' + (dense ? '' : '<span class="cv">' + (i.v || '') + '</span>') + '<i style="height:' + Math.round(i.v / max * 72) + 'px;background:' + (i.color || color) + '"></i><span class="cl">' + i.l + '</span></div>').join('') + '</div>'; };
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

  /* פייג'ר עם אטבים: רכיב אחד לכרטיס המשתתף ולסטטיסטיקות. הדפים זה לצד זה עם הצמדה, המחוון עוקב אחרי הגלילה, הדף שלא מוצג לא מקבל פוקוס, ומעבר בין דפים לא מוסיף רשומת היסטוריה */
  function tabPager(tabsEl, box, tabs, pages, off) {
    const T = { cur: 0, lock: 0 };
    T.mark = (i) => {
      const ch = i !== T.cur; T.cur = i;
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
      pages.forEach((d, k) => { d.inert = k !== i; });
      if (ch) { try { syncUrl(); } catch (e) {} }
    };
    T.apply = () => { box.scrollLeft = -T.cur * box.clientWidth; tabsEl.style.setProperty('--pg', T.cur); T.mark(T.cur); };
    T.go = (i) => { box.scrollTo({ left: -i * box.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' }); T.mark(i); };
    box.addEventListener('scroll', () => { const w = box.clientWidth; if (!w || (off && off())) return; const q = Math.abs(box.scrollLeft) / w; tabsEl.style.setProperty('--pg', q); if (Date.now() > T.lock) { const i = Math.round(q); if (i !== T.cur) T.mark(i); } }, { passive: true });
    tabs.forEach((t, i) => t.addEventListener('click', () => { T.lock = Date.now() + 500; T.go(i); }));   // בזמן הגלילה אחרי לחיצה על אטב לא מסמנים דף ביניים
    tabsEl.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); const i = Math.min(tabs.length - 1, Math.max(0, T.cur + (e.key === 'ArrowLeft' ? 1 : -1))); T.lock = Date.now() + 500; T.go(i); tabs[i].focus(); });
    { let w0 = 0; new ResizeObserver(() => { const w = box.clientWidth; if (w && w !== w0) { w0 = w; box.scrollLeft = -T.cur * w; } }).observe(box); }
    return T;
  }

  /* סטטיסטיקות בארבעה אטבים. מה שבעל העסק רוצה לדעת: מה מצב המפגש הקרוב ואיפה נושרים (מפגשים), האם זה משתלם ומה הכסף שעוד בדרך (כספים), מה שווה לקדם ומתי (שיווק ממומן), ומי מגיע וחוזר (קהל) */
  const ST_IDS = ['meet', 'money', 'promo', 'demo'], stPages = ['#stPgM', '#stPgF', '#stPgP', '#stPgA'].map((x) => $(x));
  const stPg = tabPager($('#stTabs'), $('#stPager'), ['#stTabM', '#stTabF', '#stTabP', '#stTabA'].map((x) => $(x)), stPages);
  function openStats(v) {
    renderStats(); stPg.cur = Math.max(0, ST_IDS.indexOf(v));
    $('#stDlg').showModal(); stPg.apply(); stPages.forEach((d) => { d.scrollTop = 0; });
    if (document.activeElement && document.activeElement.closest('#stDlg')) document.activeElement.blur();   // בלי מסגרת פוקוס על האטב הראשון בפתיחה
    syncUrl();
  }
  function renderStats() {
    const S = computeStats(), links = S.links;
    if (!state.participants.length) { stPages[0].innerHTML = '<div class="empty"><b>אין עדיין נתונים</b>כשיהיו הרשמות, הסטטיסטיקות יופיעו כאן</div>'; return; }
    const ilsB = (n) => '<bdi dir="ltr">₪' + nfm(n) + '</bdi>';
    const dlab = (m) => meetingLabel(m).split(' · ')[0];
    const trend = (a, b) => { if (!(b > 0)) return ''; const ch = Math.round((a - b) / b * 100), up = ch >= 0; return UI.tag('<i>' + (up ? '▲' : '▼') + '</i><b>' + Math.abs(ch) + '%</b>', 'trend ' + (up ? 'up' : 'down')); };
    const tbl = (head, rows) => '<div class="tb' + (head.length === 2 ? ' mv' : '') + '"><div class="tr th2">' + head.map((h) => '<span>' + h + '</span>').join('') + '</div>' + rows.map((r) => '<div class="tr">' + r.map((c) => '<span>' + c + '</span>').join('') + '</div>').join('') + '</div>';
    const part = (title, body) => '<section class="stp"><h4>' + title + '</h4>' + body + '</section>';
    const kpis = (...items) => '<div class="stkpis">' + items.join('') + '</div>';
    const sgn = (v) => '<span class="' + (Math.round(v) > 0 ? 'cpos' : Math.round(v) < 0 ? 'cneg' : '') + '">' + ilsB(Math.abs(v)) + '</span>';   // צבע במקום פלוס ומינוס
    const pctS = (a, b) => b ? ' <small>(' + Math.round(a / b * 100) + '%)</small>' : '';
    const sum = (a, f) => a.reduce((t, x) => t + f(x), 0);

    /* כל המדדים לפי כל המשתתפים הפעילים (גם מי שלא שויך לאף מפגש), והכסף לפי רשומות התשלום: הכנסה נטו = תשלומים והפקדות (בלי הקצאה מהקרדיט) פחות החזרים, בדיוק כמו במסך הכספים */
    const allP = state.participants, n = allP.length;
    const paidBy = new Map(allP.map((p) => [p.id, netPaid(p.id)]));
    const isFreeP = (p) => { const ls = linksOf(p.id); return ls.length > 0 && ls.every((l) => l.no_pay); };
    const payers = allP.filter((p) => paidBy.get(p.id) > 0), cohort = allP.filter((p) => !isFreeP(p));
    const cash = sum(state.payments, cashOf);
    const credHold = [...new Set(state.payments.map((x) => x.participant_id))].map((id) => Math.round(creditOf(id) * 100) / 100).filter((c) => c > 0), credit = sum(credHold, (c) => c);
    const refunds = sum(state.payments.filter((x) => x.kind === 'refund'), (x) => Number(x.amount));
    const pm = S.perMeeting.filter((r) => r.regs), pmD = pm.slice().reverse(), started = pm.filter((r) => r.started);
    const fr = finRowsAll(), expAll = sum(fr.filter((x) => x.kind === 'expense'), (x) => x.amount), incOther = sum(fr.filter((x) => x.kind === 'income'), (x) => x.amount), profit = cash + incOther - expAll;
    const allocOf = (l) => allocatedOf(l.participant_id, l.meeting_id);
    const owed = (ls) => sum(ls, (l) => oweOf(l.participant_id, l.m));
    const cameP = allP.filter((p) => links.some((l) => l.participant_id === p.id && l.m && meetingStarted(l.m) && l.attended));
    const backP = cameP.filter((p) => new Set(linksOf(p.id).map((l) => l.meeting_id)).size >= 2);

    // ----- מפגשים: המפגש הקרוב, המשפך, וכל מפגש -----
    const nx = nextMeetingOf(), nxR = nx && S.perMeeting.find((r) => r.m.id === nx.id), nxL = nx ? links.filter((l) => l.meeting_id === nx.id) : [];
    let nextPart = '';
    if (nx) {
      const left = daysTo(nx), un = nxL.filter((l) => !l.no_pay && !(allocOf(l) > 0));
      /* מתי המקום נסגר (שוריין): לא לתשלום = בהרשמה, תשלום בהמשך = ברגע שסומן, ואחרת בהקצאת התשלום האחרונה למפגש */
      const reservedAt = (l) => {
        if (!reservedOf(l.participant_id, l.meeting_id)) return null;
        if (l.no_pay) return l.created_at;
        if (laterOf(l.participant_id, l.meeting_id)) return l.pay_later_at;
        const ts = state.payments.filter((x) => x.participant_id === l.participant_id && x.meeting_id === l.meeting_id && x.kind === 'payment' && x.created_at).map((x) => x.created_at).sort();
        return ts.length ? ts[ts.length - 1] : l.created_at;
      };
      const nxRes = nxL.filter((l) => reservedOf(l.participant_id, l.meeting_id)).length;
      /* מתי המשתתף שילם לראשונה על המפגש */
      const payAt = (l) => { const ts = state.payments.filter((x) => x.participant_id === l.participant_id && x.meeting_id === l.meeting_id && x.kind === 'payment' && x.created_at).map((x) => x.created_at).sort(); return ts[0] || null; };
      /* כמה היו בכל מפגש קודם באותו שלב: לפי המועד שבו כל אחד נרשם, שילם או שוריין, כשנשארו לפחות אותם ימים עד המפגש. מושווים לממוצע של כל המפגשים שהתקיימו */
      const prevMs = pm.filter((r) => r.m.id !== nx.id && isPast(r.m)).map((r) => r.m);
      const thenN = (m, when) => links.filter((l) => { if (l.meeting_id !== m.id) return false; const at = when(l); return at && daysTo(m, ilDay(at)) >= left; }).length;
      const avgN = (when) => prevMs.length ? prevMs.reduce((a, m) => a + thenN(m, when), 0) / prevMs.length : 0;
      const f1 = (v) => String(Math.round(v * 10) / 10);
      const cmpRows = prevMs.length ? [
        ['נרשמים', avgN((l) => l.created_at), nxL.length],
        ['משלמים', avgN((l) => allocOf(l) > 0 ? payAt(l) : null), nxL.filter((l) => allocOf(l) > 0).length],
        ['משוריינים', avgN(reservedAt), nxRes]
      ].map(([lab, a, b]) => [lab, f1(a), '<b>' + b + '</b>', a > 0 ? trend(b, a) : '-']) : [];
      nextPart = part('המפגש הקרוב · ' + dlab(nx), kpis(
        kpi(nxL.length, 'נרשמו', left > 1 ? 'עוד ' + left + ' ימים' : left === 1 ? 'מחר' : 'היום'),
        kpi(nxR.paid, 'שילמו', Ps(nxR.paid, nxL.length - nxR.ex) + (nxR.ex ? ' · ועוד ' + nxR.ex + ' לא לתשלום' : ''), nxR.paid ? 'good' : ''),
        kpi(un.length, 'עוד לא שילמו', un.length ? ilsB(owed(un)) + ' צפויים' : '', un.length ? 'warn' : ''),
        kpi(nxR.women, 'נקבה', Ps(nxR.women, nxL.length)),
        kpi(nxR.men, 'זכר', Ps(nxR.men, nxL.length))
      ) + (prevMs.length ? '<p class="sthint">השוואה לממוצע המפגשים הקודמים באותו שלב (' + (left > 1 ? left + ' ימים לפני המפגש' : left === 1 ? 'יום לפני המפגש' : 'ביום המפגש') + ')</p>' + tbl(['', 'ממוצע ' + prevMs.length + (prevMs.length === 1 ? ' מפגש' : ' מפגשים'), dlab(nx) + ' עכשיו', 'שינוי'], cmpRows) : ''));
    }
    const everLinked = allP.filter((p) => linksOf(p.id).length);
    const funnel = part('איפה נושרים', '<p class="sthint">מכל המשתתפים ועד מי שחזר למפגש נוסף</p>' + bars(
      barRow('משתתפים', n, n, 'var(--blue)') + barRow('נרשמו למפגש', everLinked.length, n, 'var(--blue)') + barRow('שילמו', payers.length, n, 'var(--blue)') + barRow('הגיעו', cameP.length, n, 'var(--blue)') + barRow('חזרו שוב', backP.length, n, 'var(--green)')));
    const lastS = started[started.length - 1], prevS = started[started.length - 2], cameAll = sum(started, (r) => r.came), regsAll = sum(started, (r) => r.regs);
    const perMeet = part('כל המפגשים', (started.length ? kpis(
        kpi(started.length, 'מפגשים שהתקיימו'),
        kpi(Math.round(regsAll / started.length), 'נרשמים בממוצע', lastS && prevS ? 'באחרון ' + lastS.regs + ' ' + trend(lastS.regs, prevS.regs) : ''),
        kpi(Ps(cameAll, regsAll), 'הגיעו מתוך הנרשמים', cameAll + ' מתוך ' + regsAll),
        kpi(ilsB(sum(started, (r) => r.rev) / started.length), 'הכנסה ממוצעת למפגש')
      ) : '') + tbl(['מפגש', 'נרשמו', 'שילמו', 'הגיעו', 'הכנסה'], pmD.map((r) => [dlab(r.m), r.regs, r.paid + '/' + (r.regs - r.ex), r.started ? r.came : '-', ilsB(r.rev)])));
    const meet = nextPart + funnel + perMeet;

    // ----- כספים: האם זה משתלם, מה עוד בדרך, ואיך הכסף נכנס -----
    const expOf = (mid) => sum(fr.filter((x) => x.kind === 'expense' && x.meeting_id === mid), (x) => x.amount);
    const pl = S.perMeeting.filter((r) => r.regs || expOf(r.m.id)).reverse();
    const be = S.perMeeting.filter((r) => r.started && r.paid && expOf(r.m.id)).slice(-1)[0];
    const beLine = be ? (() => { const ex = expOf(be.m.id), avg = be.rev / be.paid; return '<p class="stline">כדי לכסות את ' + ilsB(ex) + ' ההוצאות של ' + dlab(be.m) + ' צריך <b>' + Math.ceil(ex / avg) + '</b> משלמים, לפי ממוצע של ' + ilsB(avg) + ' למשלם. שילמו ' + be.paid + '</p>'; })() : '';
    const isOpen = (l) => !l.no_pay && !(allocOf(l) > 0);
    const openFuture = links.filter((l) => !meetingStarted(l.m) && isOpen(l)), openPast = links.filter((l) => meetingStarted(l.m) && isOpen(l));
    const dues = links.filter((l) => dueOf(l.participant_id, l.meeting_id) > 0), noPay = links.filter((l) => l.no_pay);
    const cnt = (txt, k) => txt + (k ? ' <small>(' + k + ')</small>' : '');
    const waitDays = links.map((l) => { const ps = state.payments.filter((x) => x.kind === 'payment' && x.participant_id === l.participant_id && x.meeting_id === l.meeting_id && x.created_at).map((x) => x.created_at).sort(); return ps.length && l.created_at ? Math.max(0, (new Date(ps[0]) - new Date(l.created_at)) / 864e5) : null; }).filter((d) => d != null), waitMed = median(waitDays);
    const byMethod = {}; state.payments.forEach((x) => { const v = cashOf(x); if (!(v > 0)) return; const k = methodName(x) || 'לא צוין'; byMethod[k] = (byMethod[k] || 0) + v; });   // רק כסף שנכנס, כדי שהאחוזים יסתכמו ל-100
    const methodRows = Object.keys(byMethod).sort((a, b) => byMethod[b] - byMethod[a]), methodSum = sum(methodRows, (k) => byMethod[k]);
    const months = {}; const mo = (k) => months[k] || (months[k] = { inc: 0, exp: 0 });
    state.payments.forEach((x) => { const v = cashOf(x); if (v) mo(ilDay(x.created_at || new Date().toISOString()).slice(0, 7)).inc += v; });
    fr.forEach((x) => { if (x.date) mo(String(x.date).slice(0, 7))[x.kind === 'income' ? 'inc' : 'exp'] += x.amount; });
    const monthKeys = Object.keys(months).sort().reverse();
    const money = part('האם זה משתלם', kpis(
        kpi(ilsB(cash + incOther), 'הכנסות', incOther ? 'מתוכן ' + ilsB(incOther) + ' הכנסות אחרות' : ''),
        kpi(ilsB(expAll), 'הוצאות'),
        kpi(sgn(profit), 'רווח', '', profit > 0 ? 'good' : profit < 0 ? 'bad' : ''),
        kpi(payers.length ? ilsB(cash / payers.length) : '-', 'הכנסה ממוצעת למשלם', payers.length + ' משלמים')
      )) +
      (pl.length ? part('רווח לפי מפגש', '<p class="sthint">הוצאות ששויכו למפגש. הוצאות כלליות ותשלומים לשיווק ממומן נספרים רק ברווח הכולל</p>' + tbl(['מפגש', 'הכנסה', 'הוצאות', 'רווח'], pl.map((r) => { const e = expOf(r.m.id); return [dlab(r.m), ilsB(r.rev), ilsB(e), sgn(r.rev - e)]; })) + beLine) : '') +
      part('כסף שעוד בדרך', tbl(['מדד', 'ערך'], [
        [cnt('נרשמו למפגשים קרובים ועוד לא שילמו', openFuture.length), ilsB(owed(openFuture))],
        [cnt('שילמו חלק, ונשאר לשלם', dues.length), ilsB(owed(dues))],
        [cnt('נרשמו למפגשים שעברו ולא שילמו', openPast.length), ilsB(owed(openPast))],
        [cnt('קרדיט פתוח: הכסף אצלנו ועוד לא נוצל', credHold.length), '<bdi dir="ltr" class="cyel">₪' + nfm(credit) + '</bdi>'],
        ['הוחזר למשתתפים', ilsB(refunds)],
        ['מקומות לא לתשלום', noPay.length],
        ['זמן מהרשמה לתשלום (חציון)', waitMed == null ? '-' : waitMed < 1 ? 'פחות מיום' : Math.round(waitMed) + ' ימים']
      ])) +
      (methodRows.length ? part('לפי דרך תשלום', bars(methodRows.map((k) => barRow(esc(k), byMethod[k], methodSum, 'var(--green)', '', ilsB(byMethod[k]))).join(''))) : '') +
      (monthKeys.length ? part('לפי חודש', tbl(['חודש', 'הכנסות', 'הוצאות', 'רווח'], monthKeys.map((k) => [k.slice(5) + '/' + k.slice(2, 4), ilsB(months[k].inc), ilsB(months[k].exp), sgn(months[k].inc - months[k].exp)]))) : '');

    // ----- שיווק ממומן: מה משתלם ומתי נרשמים -----
    const src = (p) => channelOf(p) ? 'promo' : 'other';
    const cameSet = new Set(cameP.map((p) => p.id));
    const funnelOf = (ps) => ({ leads: ps.length, reg: ps.filter((q) => linksOf(q.id).length).length, paid: ps.filter((q) => paidBy.get(q.id) > 0).length, came: ps.filter((q) => cameSet.has(q.id)).length, inc: sum(ps, (q) => paidBy.get(q.id)) });
    const proRows = state.promoters.map((x) => { const L = ledgerOf(x.id), f = funnelOf(srcLeads(x.id)), cm = L.accrued; return Object.assign(f, { x, cm, bal: L.balance, name: esc(x.name) }); }).sort((a, b) => (b.inc - b.cm) - (a.inc - a.cm));
    const noCh = Object.assign(funnelOf(allP.filter((q) => !channelOf(q))), { name: 'אורגני', cm: 0 });
    const chRows = proRows.concat(noCh.leads ? [noCh] : []);
    const proOwed = sum(proRows, (r) => Math.max(0, r.bal)), proInc = sum(proRows, (r) => r.inc), proCost = sum(proRows, (r) => r.cm), proLeads = sum(proRows, (r) => r.leads), proPaid = sum(proRows, (r) => r.paid);
    const srcCount = (r, k) => links.filter((l) => l.meeting_id === r.m.id && (promoterOf(l.source_promoter_id) ? 'promo' : src(l.p) === 'promo' ? 'other' : src(l.p)) === k).length;   // לפי ההרשמה למפגש הזה
    // מתי נרשמים: כמה ימים לפני המפגש, באיזה יום ובאיזו שעה (שעון ישראל), כדי לתזמן מודעות ופוסטים
    const LEAD = [['<bdi dir="ltr">15+</bdi>', 15, 1e4], ['<bdi dir="ltr">8-14</bdi>', 8, 14], ['<bdi dir="ltr">4-7</bdi>', 4, 7], ['<bdi dir="ltr">2-3</bdi>', 2, 3], ['יום לפני', 1, 1], ['ביום', -1e4, 0]];
    const leadDays = links.filter((l) => l.created_at).map((l) => daysTo(l.m, ilDay(l.created_at)));
    const leadPart = leadDays.length ? '<p class="sthint">כמה ימים לפני המפגש נרשמים</p>' + colsChart(LEAD.map((b) => ({ l: b[0], v: leadDays.filter((d) => d >= b[1] && d <= b[2]).length })), 'var(--blue)') : '';
    /* עלות כללית: העלות לליד של כל תקופה, מהחדשה לישנה; בראש התקופה הפתוחה שמאז ההתחשבנות האחרונה */
    const costParts = state.promoters.filter((x) => x.cost_total).map((x) => { const P = costPeriods(x.id), rows = P.periods.slice().reverse().map((r) => [r.from ? dayMon(r.from) + ' עד ' + dayMon(r.to) : 'עד ' + dayMon(r.to), ilsB(r.amount), r.leads, r.per != null ? '<bdi dir="ltr">' + perLeadTxt(r.per) + '</bdi>' : '-']); if (P.openLeads || !rows.length) rows.unshift([P.openFrom ? 'מאז ' + dayMon(P.openFrom) : 'עד עכשיו', '-', P.openLeads, '-']); return part('עלות לליד · ' + esc(x.name), tbl(['תקופה', 'שולם', 'לידים', 'לליד'], rows)); }).join('');
    const promo = part('האם הפרסום משתלם', kpis(
        kpi(proPaid ? ilsB(proCost / proPaid) : '-', 'עלות למשלם', proLeads ? 'ליד עולה ' + ilsB(proCost / proLeads) : ''),
        kpi(proPaid ? ilsB(proInc / proPaid) : '-', 'משלם מכניס בממוצע', proPaid + ' משלמים מתוך ' + proLeads + ' לידים'),
        kpi(ilsB(proInc), 'הכנסה דרך שיווק ממומן', Ps(proInc, cash) + ' מההכנסה'),
        kpi(ilsB(proCost), 'עלות שיווק ממומן', proOwed ? ilsB(proOwed) + ' נשאר לשלם' : '', proOwed ? 'warn' : '')
      )) +
      costParts +
      part('מה מביא אנשים', tbl(['שיווק ממומן', 'לידים', 'נרשמו', 'שילמו', 'הגיעו'], chRows.map((r) => [r.name, r.leads, r.reg, r.paid + pctS(r.paid, r.leads), r.came]))) +
      part('מה משתלם', tbl(['שיווק ממומן', 'הכנסה', 'עלות', 'נטו', 'למשלם'], chRows.map((r) => [r.name, ilsB(r.inc), ilsB(r.cm), sgn(r.inc - r.cm), r.paid && r.cm ? ilsB(r.cm / r.paid) : '-']))) +
      (leadPart ? part('מתי נרשמים', leadPart) : '') +
      (pm.length ? part('מקורות לפי מפגש', tbl(['מפגש', 'שיווק ממומן', 'אחר'], pmD.map((r) => [dlab(r.m), srcCount(r, 'promo'), srcCount(r, 'other')]))) : '');

    // ----- קהל: מי מגיע, והאם חוזרים -----
    const male = allP.filter((q) => q.gender === 'male'), female = allP.filter((q) => q.gender === 'female'), noG = n - male.length - female.length;
    const ages = allP.map(shownAge).filter((a) => a != null), avgAge = ages.length ? sum(ages, (a) => a) / ages.length : 0, target = ages.filter((a) => a >= AGE_MIN && a <= AGE_MAX);
    const convS = (pred) => { const ls = allP.filter((q) => pred(q) && !isFreeP(q)); return { n: ls.length, paid: ls.filter((q) => paidBy.get(q.id) > 0).length }; };
    const convLine = (c) => c.n ? 'שילמו ' + Ps(c.paid, c.n) : '';
    const meetCount = allP.map((p) => new Set(linksOf(p.id).map((l) => l.meeting_id)).size).filter((k) => k > 0), mcN = meetCount.length;
    const audience = part('מי בקהל', kpis(
        kpi(n, 'משתתפים', everLinked.length + ' נרשמו למפגש'),
        kpi(Ps(backP.length, cameP.length), 'חזרו למפגש נוסף', backP.length + ' מתוך ' + cameP.length + ' שהגיעו', backP.length ? 'good' : ''),
        kpi(Ps(target.length, ages.length), 'בטווח הגילאים ' + ageText()),
        kpi(avgAge ? avgAge.toFixed(1) : '-', 'גיל ממוצע', n - ages.length ? (n - ages.length) + ' בלי גיל' : '')
      )) +
      (pm.length ? part('חדשים וחוזרים', '<p class="sthint">"מהקודם" הוא כמה מהמשתתפים במפגש הקודם נרשמו גם לזה</p>' + tbl(['מפגש', 'חדשים', 'חוזרים', 'מהקודם'], pmD.map((r) => [dlab(r.m), r.news, r.ret, r.prevN ? r.kept + '/' + r.prevN + pctS(r.kept, r.prevN) : '-']))) : '') +
      (mcN ? part('לכמה מפגשים נרשמו', bars(barRow('מפגש אחד', meetCount.filter((k) => k === 1).length, mcN, 'var(--blue)') + barRow('2 מפגשים', meetCount.filter((k) => k === 2).length, mcN, 'var(--blue)') + barRow('3 ומעלה', meetCount.filter((k) => k >= 3).length, mcN, 'var(--green)'))) : '') +
      (pm.length ? part('איזון מגדרי לפי מפגש', tbl(['מפגש', 'נקבה', 'זכר', 'נקבה %'], pmD.map((r) => [dlab(r.m), r.women, r.men, Ps(r.women, r.women + r.men)]))) : '') +
      part('מגדר', bars(barRow('נקבה', female.length, n, 'var(--red)', convLine(convS((q) => q.gender === 'female'))) + barRow('זכר', male.length, n, 'var(--sky)', convLine(convS((q) => q.gender === 'male'))) + (noG ? barRow('לא צוין', noG, n, 'var(--text-3)') : ''))) +
      part('גילאים', bars(AGE_B.map((g, i) => { const inB = (q) => { const a = shownAge(q); return a != null && a >= g[2] && a <= Math.min(g[3], 120); }; return barRow(g[1], ages.filter((a) => a >= g[2] && a <= Math.min(g[3], 120)).length, ages.length, i === 0 ? 'var(--text-3)' : i === 3 ? 'var(--yellow)' : 'var(--orange)', convLine(convS(inB))); }).join('')));

    [meet, money, promo, audience].forEach((h, i) => { stPages[i].innerHTML = h; });
  }
  $('#moneyBtn').addEventListener('click', () => openFinance());   // כספים: ניהול הוצאות והכנסות
  $('#statsBtn').addEventListener('click', () => openStats());
  $('#stDlg').addEventListener('close', syncUrl);
  /* ===== כספים: הוצאות והכנסות שאינן תשלומי משתתפים (חד פעמיות או מחזוריות, כלליות או לפי מפגש) ===== */
  let finV = 'main', finEdit = null;   // finEdit: { type: 'entry' | 'rec', id } בעריכה, או { kind } בהוספה
  const PERIODS = { weekly: 'כל שבוע', monthly: 'כל חודש', yearly: 'כל שנה' };
  const finName = (e) => noteAuthor(e);
  const finAdmins = () => [...new Set([emailOf()].concat(Object.keys(state.prefs), state.fin.map((x) => x.by_email), state.finRec.map((x) => x.by_email), state.promoPays.map((x) => x.by_email), state.finTr.map((x) => x.from_email), state.finTr.map((x) => x.to_email), state.payMethods.map((x) => x.owner_email)).filter(Boolean))];
  const isoAdd = (iso, period, n) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); if (period === 'weekly') dt.setUTCDate(dt.getUTCDate() + 7 * n); else if (period === 'monthly') { const day = dt.getUTCDate(); dt.setUTCDate(1); dt.setUTCMonth(dt.getUTCMonth() + n); const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate(); dt.setUTCDate(Math.min(day, last)); } else { const day = dt.getUTCDate(); dt.setUTCDate(1); dt.setUTCFullYear(dt.getUTCFullYear() + n); const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate(); dt.setUTCDate(Math.min(day, last)); } return dt.toISOString().slice(0, 10); };
  const finIn = (d) => state.finPeriod === 'all' || String(d).slice(0, 7) === (state.finPeriod === 'month' ? todayISO().slice(0, 7) : state.finPeriod);
  const recOccurrences = (r) => { if (!r.active) return []; const upto = (r.end_date && r.end_date < todayISO()) ? r.end_date : todayISO(), out = []; for (let n = 0; n < 800; n++) { const d = isoAdd(r.start_date, r.period, n); if (d > upto) break; out.push(d); } return out; };
  const finDmy = (iso) => { const [y, m, d] = iso.split('-'); return d + '.' + m + '.' + y.slice(2); };
  function finRowsAll() {
    const rows = state.fin.map((x) => ({ kind: x.kind, amount: Number(x.amount), date: x.entry_date, title: x.title, meeting_id: x.meeting_id, id: x.id, rec: null, by: x.by_email }));
    state.finRec.forEach((r) => recOccurrences(r).forEach((d) => rows.push({ kind: r.kind, amount: Number(r.amount), date: d, title: r.title, meeting_id: null, id: r.id, rec: r, by: r.by_email })));
    state.promoPays.forEach((x) => { const pr = promoterOf(x.promoter_id); rows.push({ kind: 'expense', amount: Number(x.amount), date: String(x.paid_at || '').slice(0, 10), title: 'תשלום ל' + (pr ? pr.name : 'שיווק ממומן'), meeting_id: null, id: x.id, rec: null, channel: x.promoter_id, by: x.by_email }); });   // תשלומים לשיווק ממומן נספרים כהוצאה
    return rows;
  }
  function finRows() {
    return finRowsAll().filter((x) => finIn(x.date)).sort((a, b) => b.date.localeCompare(a.date));
  }
  /* התחשבנות בין מנהלים: הכנסות ממשתתפים לפי הקופה של דרך התשלום, הכנסות והוצאות אחרות לפי המנהל שדרכו עברו, ועוד העברות ביניהם; החלוקה שווה */
  function finSettle() {
    const admins = finAdmins(), A = {}; admins.forEach((e) => { A[e] = { part: 0, inc: 0, exp: 0, out: 0, inn: 0 }; });
    const un = { part: 0, fin: 0, chan: 0 };
    const own = (key) => (state.payMethods.find((m) => m.key === key) || {}).owner_email;
    state.payments.forEach((x) => { const k = ((x.kind === 'payment' || x.kind === 'deposit') && !x.from_credit) ? 1 : x.kind === 'refund' ? -1 : 0; if (!k) return; const o = own(x.method), a = k * Number(x.amount); if (o && A[o]) A[o].part += a; else un.part += a; });
    finRowsAll().filter((x) => !x.channel).forEach((x) => { if (x.by && A[x.by]) A[x.by][x.kind === 'income' ? 'inc' : 'exp'] += x.amount; else un.fin += x.kind === 'income' ? x.amount : -x.amount; });
    state.promoPays.forEach((x) => { if (x.by_email && A[x.by_email]) A[x.by_email].exp += Number(x.amount); else un.chan += 1; });   // תשלומים לשיווק ממומן: הוצאה של המנהל ששילם
    state.finTr.forEach((x) => { if (A[x.from_email]) A[x.from_email].out += Number(x.amount); if (A[x.to_email]) A[x.to_email].inn += Number(x.amount); });
    let total = 0; admins.forEach((e) => { const a = A[e]; a.held = a.part + a.inc - a.exp - a.out + a.inn; total += a.part + a.inc - a.exp; });
    const share = admins.length ? total / admins.length : 0; admins.forEach((e) => { A[e].diff = A[e].held - share; });
    const pay = admins.filter((e) => A[e].diff > 0.5).map((e) => ({ e, v: A[e].diff })).sort((a, b) => b.v - a.v), recv = admins.filter((e) => A[e].diff < -0.5).map((e) => ({ e, v: -A[e].diff })).sort((a, b) => b.v - a.v), sug = [];
    while (pay.length && recv.length) { const m = Math.min(pay[0].v, recv[0].v); sug.push({ from: pay[0].e, to: recv[0].e, amount: Math.round(m * 100) / 100 }); pay[0].v -= m; recv[0].v -= m; if (pay[0].v < 0.5) pay.shift(); if (recv[0].v < 0.5) recv.shift(); }
    return { admins, A, un, total, share, sug };
  }
  function finPartIncome() {   // הכנסה נטו ממשתתפים: הפקדות ותשלומים (בלי הקצאה מהקרדיט) פחות החזרים
    return state.payments.filter((x) => finIn(String(x.created_at || x.paid_at || ''))).reduce((s, x) => s + ((x.kind === 'payment' || x.kind === 'deposit') && !x.from_credit ? Number(x.amount) : x.kind === 'refund' ? -Number(x.amount) : 0), 0);
  }
  function renderFinance() {
    $('#finPerTxt').textContent = finPeriodLabel();
    const sg = (v) => Math.round(v) > 0 ? 'cpos' : Math.round(v) < 0 ? 'cneg' : '', ab = (v) => '₪' + nfm(Math.abs(v)), sv = (v) => '<bdi dir="ltr">' + (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '-' : '') + ab(v) + '</bdi>'; const rows = finRows(), inc = rows.filter((x) => x.kind === 'income').reduce((s, x) => s + x.amount, 0), exp = rows.filter((x) => x.kind === 'expense').reduce((s, x) => s + x.amount, 0), part = finPartIncome(), expCh = rows.filter((x) => x.channel).reduce((s, x) => s + x.amount, 0), credHolders = [...new Set(state.payments.map((x) => x.participant_id))].map((id) => ({ id, c: Math.round(creditOf(id) * 100) / 100 })).filter((x) => x.c > 0), cred = credHolders.reduce((s, x) => s + x.c, 0), owed = state.promoters.reduce((s, x) => s + Math.max(0, ledgerOf(x.id).balance), 0);
    { const net = part + inc - exp, netTone = Math.round(net) > 0 ? 'pos' : Math.round(net) < 0 ? 'neg' : '';
      $('#finSum').innerHTML = UI.metric('הכנסות ממשתתפים', '₪' + nfm(part), { tone: 'pos' })
        + UI.metric('הוצאות', '₪' + nfm(exp), { tone: 'neg', sub: expCh ? 'מתוכן שיווק ממומן ₪' + nfm(expCh) : '', a: { 'data-ff': 'expense', role: 'button', tabindex: 0, 'aria-pressed': state.finFilter === 'expense' } })
        + UI.metric('הכנסות אחרות', '₪' + nfm(inc), { tone: 'pos', a: { 'data-ff': 'income', role: 'button', tabindex: 0, 'aria-pressed': state.finFilter === 'income' } })
        + (cred > 0 ? UI.metric('קרדיט שמור', '₪' + nfm(cred), { tone: 'yel', sub: credHolders.length + ' משתתפים, טרם נוצל' }) : '')
        + UI.metric('נטו', sv(net), { tone: netTone, cls: 'wide', sub: cred > 0 ? 'נטו אחרי קרדיט שמור: <i class="' + sg(net - cred) + '">' + sv(net - cred) + '</i>' : '' })
        + (owed > 0 ? '<p class="finowed">עלויות שיווק ממומן שנצברו ועוד לא שולמו: ₪' + nfm(owed) + ' (לא נכללות בהוצאות עד התשלום)</p>' : ''); }
    $('#finRecLbl').hidden = !state.finRec.length;
    $('#finRec').innerHTML = state.finRec.map((r) => '<button type="button" class="finrow' + (r.active ? '' : ' off') + '" data-frec="' + r.id + '"><span class="ft"><b>' + esc(r.title) + '</b><span>' + PERIODS[r.period] + ' · מ-' + finDmy(r.start_date) + (r.end_date ? ' עד ' + finDmy(r.end_date) : '') + (r.active ? '' : ' · מושהה') + '</span></span><span class="fa ' + (r.kind === 'income' ? 'in' : 'out') + '">₪' + nfm(Number(r.amount)) + '</span></button>').join('');
    const shown = state.finFilter ? rows.filter((x) => x.kind === state.finFilter) : rows;
    $('#finList').innerHTML = shown.length ? shown.map((x) => { const m = x.meeting_id && meetOf(x.meeting_id); return '<button type="button" class="finrow" ' + (x.channel ? 'data-fch="' + x.channel + '"' : x.rec ? 'data-frec="' + x.id + '"' : 'data-fent="' + x.id + '"') + '><span class="ft"><b>' + esc(x.title) + (x.rec ? UI.tag('מחזורי', 'frec') : '') + (x.channel ? UI.tag('שיווק ממומן', 'frec') : '') + '</b><span>' + finDmy(x.date) + ' · ' + (x.channel ? 'לחיצה לפתיחת ההתחשבנות' + (x.by ? ' · דרך ' + esc(finName(x.by)) : '') : (m ? 'מפגש ' + dm(m) : 'כללי') + (x.by ? ' · דרך ' + esc(finName(x.by)) : '')) + '</span></span><span class="fa ' + (x.kind === 'income' ? 'in' : 'out') + '">₪' + nfm(x.amount) + '</span></button>'; }).join('') : '<p class="mnone">עוד אין תנועות' + ((state.finPeriod === 'all' ? '' : state.finPeriod === 'month' ? ' החודש' : ' ב' + finPeriodLabel())) + '</p>';
  }
  function finView(v) {
    finV = v; $('#finMain').hidden = v !== 'main'; $('#finForm').hidden = v !== 'form'; $('#finLog').hidden = v !== 'log'; $('#finSettle').hidden = v !== 'settle'; $('#finArrow').hidden = v === 'main'; $('#finLogBtn').hidden = v !== 'main'; $('#finSetBtn').hidden = v !== 'main'; $('#finPerBtn').hidden = v !== 'main'; if (typeof closeFinPer === 'function') closeFinPer();
    $('#finTitle').textContent = v === 'main' ? 'כספים' : v === 'log' ? 'יומן שינויים' : v === 'settle' ? 'התחשבנות בין מנהלים' : (finEdit && finEdit.id ? 'עריכה' : (finEdit && finEdit.kind === 'income' ? 'הכנסה חדשה' : 'הוצאה חדשה'));
    $('#finDlg').scrollTop = 0; navSync($('#finDlg')); syncUrl();
  }
  function openFinance(v) {
    renderFinance(); finV = 'main'; finView('main'); if (!$('#finDlg').open) $('#finDlg').showModal();
    if (v === 'log') openFinLog(); else if (v === 'settle') openFinSettle();
    else if (v === 'new-expense' || v === 'new-income') openFinForm({ kind: v.slice(4) });
    else if (v && v.startsWith('edit-')) { const m = /^edit-(entry|rec)-(.+)$/.exec(v); if (m && (m[1] === 'rec' ? state.finRec : state.fin).some((x) => x.id === m[2])) openFinForm({ type: m[1], id: m[2] }); }
    if (document.activeElement && document.activeElement.closest('#finDlg')) document.activeElement.blur();
  }
  const finSaveLabel = () => { const k = $('#finForm').dataset.kind; $('#finSave').textContent = k === 'income' ? 'שמירת הכנסה' : 'שמירת הוצאה'; $('#finFormDlg').setAttribute('aria-label', k === 'income' ? 'הכנסה' : 'הוצאה'); $('#finFormTitle').textContent = k === 'income' ? 'הכנסה' : 'הוצאה'; };
  function openFinForm(edit) {
    finEdit = edit; const f = $('#finForm');
    const src = edit.type === 'rec' ? state.finRec.find((x) => x.id === edit.id) : edit.type === 'entry' ? state.fin.find((x) => x.id === edit.id) : null;
    const kind = src ? src.kind : edit.kind;
    f.dataset.kind = kind; document.querySelectorAll('#finKind [data-fk]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fk === kind)));
    f.amount.value = src ? Number(src.amount) : ''; f.date.value = src ? (src.entry_date || src.start_date) : todayISO(); f.title.value = src ? src.title : '';
    const sel = f.meeting; sel.innerHTML = '<option value="">כללי (לא קשור למפגש)</option>' + state.meetings.slice().sort(meetDesc).map((m) => '<option value="' + m.id + '">מפגש ' + esc(dm(m)) + ' · ' + esc(String(m.meeting_time).slice(0, 5)) + '</option>').join('');
    sel.value = (src && src.meeting_id) || '';
    f.by.innerHTML = '<option value="">לא הוגדר</option>' + finAdmins().map((e) => '<option value="' + esc(e) + '">' + esc(finName(e)) + '</option>').join(''); f.by.value = src ? (src.by_email || '') : (emailOf() || '');
    f.period.value = edit.type === 'rec' ? src.period : '';
    $('#finMeetF').hidden = edit.type === 'rec'; $('#finRepF').hidden = !!(edit.type === 'entry');
    $('#finDel').hidden = !edit.id; $('#finDel').textContent = 'מחיקה'; delete $('#finDel').dataset.arm;
    f.querySelector('[name=date]').closest('label').firstElementChild.textContent = edit.type === 'rec' ? 'מתאריך' : 'תאריך';   // השדה עטוף ב-dtbox (dtField), לכן הכותרת היא הילד הראשון של התווית ולא האח הקודם של השדה
    /* טופס הכנסה / הוצאה: פופאפ נפרד מלמטה (הטופס עצמו עובר פיזית לתוכו וחוזר בסגירה) */
    const dlg = $('#finFormDlg'), home = $('#finDlg'); finSaveLabel();
    if (!dlg.open) {
      $('#finFormBody').appendChild(f); f.hidden = false; finV = 'form'; dlg.showModal(); syncUrl();
      dlg.addEventListener('close', function back() { dlg.removeEventListener('close', back); home.appendChild(f); f.hidden = true; if (finV === 'form') { finV = 'main'; syncUrl(); } });
    }
  }
  /* תקופה: הכל, החודש, וחודשים קודמים לפי ההיסטוריה (תנועות, תשלומי משתתפים ותשלומי שיווק ממומן); ערך חודש הוא YYYY-MM */
  const finMonthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }); };
  const finPeriodList = () => {
    const cur = todayISO().slice(0, 7), ms = new Set();
    state.fin.forEach((x) => ms.add(String(x.entry_date).slice(0, 7)));
    state.finRec.forEach((r) => recOccurrences(r).forEach((d) => ms.add(d.slice(0, 7))));
    state.payments.forEach((x) => ms.add(String(x.created_at || x.paid_at || '').slice(0, 7)));
    state.promoPays.forEach((x) => ms.add(String(x.paid_at || '').slice(0, 7)));
    const prev = [...ms].filter((m) => /^\d{4}-\d{2}$/.test(m) && m < cur).sort().reverse();
    return [['all', 'הכל'], ['month', 'החודש']].concat(prev.map((m) => [m, finMonthLabel(m)]));
  };
  const finPeriodLabel = () => { const o = finPeriodList().find((x) => x[0] === state.finPeriod); return o ? o[1] : 'הכל'; };
  const closeFinPer = () => { $('#finPerMenu').hidden = true; $('#finPerBtn').setAttribute('aria-expanded', 'false'); };
  $('#finPerBtn').addEventListener('click', () => {
    const m = $('#finPerMenu'); if (!m.hidden) { closeFinPer(); return; }
    m.innerHTML = finPeriodList().map((o) => '<button type="button" role="menuitem" class="qi" data-fp="' + o[0] + '" aria-pressed="' + (o[0] === state.finPeriod) + '">' + o[1] + '</button>').join('');
    m.hidden = false; $('#finPerBtn').setAttribute('aria-expanded', 'true');
    const r = $('#finPerBtn').getBoundingClientRect(); m.style.minWidth = Math.max(150, Math.round(r.width)) + 'px'; 
    m.style.left = menuX(m, $('#finPerBtn')) + 'px'; m.style.top = (r.bottom + 8) + 'px';
  });
  $('#finPerMenu').addEventListener('click', (e) => { const b = e.target.closest('[data-fp]'); if (!b) return; state.finPeriod = b.dataset.fp; closeFinPer(); renderFinance(); });
  $('#finMain').addEventListener('click', (e) => {
    const ff = e.target.closest('[data-ff]'); if (ff) { state.finFilter = state.finFilter === ff.dataset.ff ? null : ff.dataset.ff; renderFinance(); return; }
    const a = e.target.closest('[data-fadd]'); if (a) { openFinForm({ kind: a.dataset.fadd }); return; }
    const r = e.target.closest('[data-frec]'); if (r) { openFinForm({ type: 'rec', id: r.dataset.frec }); return; }
    const ch = e.target.closest('[data-fch]'); if (ch) { showPromoterDetail(ch.dataset.fch); $('#prDlg').showModal(); return; }   // תשלום לשיווק ממומן: פותח את ההתחשבנות שלה
    const x = e.target.closest('[data-fent]'); if (x) openFinForm({ type: 'entry', id: x.dataset.fent });
  });
  $('#finKind').addEventListener('click', (e) => { const b = e.target.closest('[data-fk]'); if (!b) return; $('#finForm').dataset.kind = b.dataset.fk; document.querySelectorAll('#finKind [data-fk]').forEach((q) => q.setAttribute('aria-checked', String(q === b))); finSaveLabel(); });
  $('#finArrow').addEventListener('click', () => finView('main'));
  /* יומן הכספים: כתובות מוצגות כשמות ("מדנה ליוסי"), כי שתי כתובות בתוך טקסט עברי מתהפכות בתצוגה */
  const FIN_LABS = ['תאריך התחלה', 'תאריך סיום', 'שיוך למפגש', 'סכום', 'תיאור', 'תאריך', 'חזרתיות', 'פעיל', 'סוג', 'דרך', 'מאת', 'אל'];
  const finLogText = (s) => {
    const nm = (x) => String(x).replace(/[\w.+-]+@[\w.-]+/g, (e) => noteAuthor(e));
    const m = String(s || '').match(/^(עודכנ[הת] [^"]*"[^"]*"): (.*)$/);
    if (!m) return nm(s);   // הוספה, מחיקה והעברה: אותו טקסט, עם שמות במקום כתובות
    const parts = m[2].split(', ').map((q) => {
      const lab = FIN_LABS.find((l) => q.startsWith(l + ' ')); const r = lab ? q.slice(lab.length + 1) : q, ar = r.split(' ← ');
      if (!lab || ar.length !== 2) return nm(q);
      const mail = /@/.test(r);
      return (lab === 'דרך' ? 'שולם דרך' : lab) + ': ' + (mail ? 'מ' + nm(ar[0]) + ' ל' + nm(ar[1]) : 'מ-' + nm(ar[0]) + ' ל-' + nm(ar[1]));
    });
    return m[1] + ' · ' + parts.join(' · ');
  };
  async function openFinLog() {
    finView('log'); const box = $('#finLog'); box.innerHTML = '<p class="mnone">טוען…</p>';
    try {
      const rows = await api(T.finlog + '?select=*&order=at.desc&limit=300');
      box.innerHTML = rows.length ? rows.map((x) => '<div class="logrow ' + (x.action === 'delete' ? 'del' : x.action === 'insert' ? 'add' : '') + '"><b>' + esc(finLogText(x.summary)) + '</b><span>' + fmtDT(x.at) + ' · ' + esc(noteAuthor(x.actor)) + '</span></div>').join('') : '<p class="mnone">עוד אין שינויים ביומן. מעכשיו כל הוספה, עדכון ומחיקה של הוצאה או הכנסה נרשמים כאן.</p>';
    } catch (err) { box.innerHTML = '<p class="mnone">לא הצלחנו לטעון את היומן</p>'; fail(err); }
  }
  $('#finLogBtn').addEventListener('click', openFinLog);
  $('#finSetBtn').addEventListener('click', () => openFinSettle());
  function renderFinSettle() {
    const S = finSettle(), box = $('#finSettle'), nn = (v) => '₪' + nfm(Math.abs(Math.round(v * 100) / 100)), n = (v) => (v < 0 ? '-' : '') + nn(v), cb = (v) => '<b class="' + (Math.round(v * 100) > 0 ? 'cpos' : Math.round(v * 100) < 0 ? 'cneg' : '') + '">' + nn(v) + '</b>';   // צבע במקום פלוס/מינוס: ירוק חיובי, אדום שלילי
    box.innerHTML = S.admins.map((e) => { const a = S.A[e]; return '<div class="fsc"><h4>' + esc(finName(e)) + '</h4>' +
      '<div class="fsl"><span>הכנסות ממשתתפים (בקופה שלו)</span>' + cb(a.part) + '</div><div class="fsl"><span>הכנסות אחרות דרכו</span>' + cb(a.inc) + '</div><div class="fsl"><span>הוצאות ששילם</span>' + cb(-a.exp) + '</div>' +
      (a.out || a.inn ? '<div class="fsl"><span>העברות בין מנהלים</span>' + cb(a.inn - a.out) + '</div>' : '') +
      '<div class="fsl hd"><span>בידיו כרגע</span>' + cb(a.held) + '</div></div>'; }).join('') +
      '<div class="fsc"><div class="fsl"><span>סך הכל נטו (כולל כל המנהלים)</span>' + cb(S.total) + '</div><div class="fsl hd"><span>חלק של כל מנהל (חלוקה שווה)</span>' + cb(S.share) + '</div></div>' +
      (S.sug.length ? S.sug.map((s) => '<div class="fsug">' + esc(finName(s.from)) + ' מעביר ל' + esc(finName(s.to)) + ' ' + n(s.amount) + '<button type="button" data-ftr="' + esc(s.from) + '|' + esc(s.to) + '|' + s.amount + '">סימון שההעברה בוצעה</button></div>').join('') : '<div class="fsug ok">הכול מסולק ✓</div>') +
      ((S.un.part || S.un.fin) ? '<p class="fsnote">לא נכללו בחלוקה: ' + (S.un.part ? cb(S.un.part) + ' מתשלומי משתתפים בדרכי תשלום ובהחזרים בלי "הקופה של" (להגדרה: הגדרות ← דרכי תשלום)' : '') + (S.un.part && S.un.fin ? ', ' : '') + (S.un.fin ? cb(S.un.fin) + ' מתנועות כספים בלי מנהל' : '') + '.</p>' : '') +
      (S.un.chan ? '<p class="fsnote">' + S.un.chan + ' תשלומים לשיווק ממומן בלי מנהל לא נכללו בהתחשבנות.</p>' : '') +
      (state.finTr.length ? '<div class="clabel">העברות שנרשמו</div>' + state.finTr.map((x) => '<div class="finrow"><span class="ft"><b>' + esc(finName(x.from_email)) + ' ← ' + esc(finName(x.to_email)) + '</b><span>' + finDmy(x.transfer_date) + '</span></span><span class="fa">' + n(Number(x.amount)) + '</span><button type="button" class="stdel" data-ftdel="' + x.id + '" aria-label="מחיקה" title="מחיקה (לחיצה כפולה)">×</button></div>').join('') : '');
  }
  function openFinSettle() { renderFinSettle(); finView('settle'); }
  $('#finSettle').addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-ftr]');
    if (tr) {
      const [from, to, amt] = tr.dataset.ftr.split('|');
      confirmAct('אישור העברה בין מנהלים', null, null, async () => {
        try { const [row] = await api(T.fintr, { method: 'POST', body: { from_email: from, to_email: to, amount: Number(amt), transfer_date: todayISO() }, prefer: 'return=representation', ui: tr }); state.finTr.unshift(row); toast('ההעברה נרשמה'); renderFinSettle(); } catch (err) { fail(err); }
      }, '<b>' + esc(finName(from)) + ' ← ' + esc(finName(to)) + '</b><br>סכום: <b>' + ils(Number(amt)) + '</b><br>תירשם העברה (בוצעה) ביומן ההתחשבנות.', 'אישור העברה', null, { green: true, plain: true });
      return;
    }
    const d = e.target.closest('[data-ftdel]');
    if (d) {
      const id = d.dataset.ftdel, x = state.finTr.find((y) => y.id === id);
      confirmAct('מחיקת העברה', null, null, async () => {
        try { await api(T.fintr + '?id=eq.' + id, { method: 'DELETE', ui: d }); state.finTr = state.finTr.filter((y) => y.id !== id); toast('נמחק'); renderFinSettle(); } catch (err) { fail(err); }
      }, x ? '<b>' + esc(finName(x.from_email)) + ' ← ' + esc(finName(x.to_email)) + '</b><br>סכום: <b>' + ils(Number(x.amount)) + '</b><br>ההעברה תימחק מהיומן וההתחשבנות תתעדכן.' : 'ההעברה תימחק.', 'כן, למחוק');
    }
  });
  $('#finForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target, amount = Number(f.amount.value), title = f.title.value.trim(), date = f.date.value || todayISO(), kind = f.dataset.kind || 'expense';
    if (!(amount > 0)) { toast('צריך להזין סכום'); f.amount.focus(); return; }
    if (!title) { toast('צריך להזין תיאור'); f.title.focus(); return; }
    const editing = finEdit && finEdit.id, recNow = (finEdit && finEdit.type === 'rec') || (!editing && f.period.value);
    try {
      if (recNow) {
        const body = { kind, amount, title, period: f.period.value || 'monthly', start_date: date, by_email: f.by.value || null };
        if (editing) { const r = state.finRec.find((x) => x.id === finEdit.id); Object.assign(r, body); await api(T.finr + '?id=eq.' + finEdit.id, { method: 'PATCH', body }); }
        else { const [row] = await api(T.finr, { method: 'POST', body, prefer: 'return=representation' }); state.finRec.unshift(row); }
      } else {
        const body = { kind, amount, title, entry_date: date, meeting_id: f.meeting.value || null, by_email: f.by.value || null };
        if (editing) { const x = state.fin.find((q) => q.id === finEdit.id); Object.assign(x, body); await api(T.fin + '?id=eq.' + finEdit.id, { method: 'PATCH', body }); }
        else { const [row] = await api(T.fin, { method: 'POST', body, prefer: 'return=representation' }); state.fin.unshift(row); }
      }
      toast('נשמר'); renderFinance(); $('#finFormDlg').close();
    } catch (err) { fail(err); }
  });
  $('#finDel').addEventListener('click', async () => {   // לחיצה ראשונה מחליפה את הכיתוב, שנייה מוחקת
    const b = $('#finDel'); if (!finEdit || !finEdit.id) return;
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = 'לחיצה נוספת למחיקה'; return; }
    try {
      if (finEdit.type === 'rec') { await api(T.finr + '?id=eq.' + finEdit.id, { method: 'DELETE' }); state.finRec = state.finRec.filter((x) => x.id !== finEdit.id); }
      else { await api(T.fin + '?id=eq.' + finEdit.id, { method: 'DELETE' }); state.fin = state.fin.filter((x) => x.id !== finEdit.id); }
      toast('נמחק'); renderFinance(); $('#finFormDlg').close();
    } catch (err) { fail(err); }
  });
  $('#finDlg').addEventListener('close', () => { finV = 'main'; syncUrl(); });

  /* ---------- אישור לפני שינוי: תגית תשלום, הוספה למפגש והסרה ממנו ---------- */
  const nameB = (n) => '<b class="nb">' + esc(n) + '</b>';   // שם מודגש בפופאפים
  function confirmAct(title, pid, mid, fn, extraHtml, yesLabel, alt, opts) {
    const p = partOf(pid), m = meetOf(mid);
    $('#cTitle').textContent = title;
    $('#cText').innerHTML = (opts && opts.plain) ? (extraHtml || '') : nameB(p ? p.name : '') + ' · ' + esc(m ? meetingLabel(m, true) : '') + (extraHtml ? '<br><br>' + extraHtml : '');   // plain: אישור שלא קשור למשתתף ולמפגש (למשל העברה בין מנהלים)
    $('#cYes').textContent = yesLabel || 'אישור'; $('#cYes').classList.toggle('danger', !(opts && (opts.primary || opts.green || opts.yellow))); $('#cYes').classList.toggle('ok', !!(opts && opts.green)); $('#cYes').classList.toggle('yel', !!(opts && opts.yellow));   // הסרה / החזר: אדום בהיר
    const dlg = $('#cDlg');
    $('#cAlt').hidden = !alt; if (alt) { $('#cAlt').textContent = alt.label; $('#cAlt').onclick = () => { dlg.close(); alt.fn(); }; }
    $('#cYes').onclick = () => { dlg.close(); fn(); };
    $('#cNo').onclick = () => dlg.close();
    dlg.showModal();
  }
  /* שיוך למפגש: בחירת תגית במפגש לא משויך יוצרת את השיוך איתה; בלי תגית: st ריק */
  const statusBody = (st) => ({ status_key: st || null });
  /* שיוך למפגש לוקח אוטומטית מהארנק כשהקרדיט מכסה את המחיר (מחיר חבילה אם נשארו מפגשים בחבילה) */
  async function autoAllocate(pid, mid, partial) {
    const l = linkOf(pid, mid), m = meetOf(mid); if (!l || !m || l.exempt) return;
    { const pp = partOf(pid); if (pp && noPayOf(pp, l)) return; }
    if (allocatedOf(pid, mid) > 0) return;
    const usePkg = pkgLeft(pid) > 0 && pkgUnit(pid) > 0, price = usePkg ? pkgUnit(pid) : defaultPrice(m);
    if (!(price > 0) || creditOf(pid) <= 0 || (!partial && creditOf(pid) < price)) return;
    const amtA = partial ? Math.min(creditOf(pid), price) : price;
    try {
      await addPayRecord(pid, mid, 'payment', amtA, null, null, true, null, null, usePkg ? { pkg: true } : null);
      const body = { paid_amount: amtA, paid_at: new Date().toISOString() }; Object.assign(l, body);
      await api(T.a + attQs(pid, mid), { method: 'PATCH', body });
      render(); if (sheet && sheet.id) { refreshSheetMeetings(); renderContact(); }
      toast('שולם מהקרדיט ₪' + nfm(amtA) + (usePkg ? ' (חבילה)' : ''));
    } catch (err) { fail(err); }
  }
  async function setLinkedWithStatus(pid, mid, st) {
    if (linkOf(pid, mid)) { setPayStatus(pid, mid, st); return; }
    const row = Object.assign({ participant_id: pid, meeting_id: mid }, statusBody(st), firstArrive(pid));
    const h = pendBegin(pid, mid, statusBody(st), row);
    state.att.push(row); render(); refreshSheetMeetings();
    try { await api(T.a, { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates' }); pendDone(h); }
    catch (err) { pendFail(h); state.att = state.att.filter((a) => a !== row); render(); refreshSheetMeetings(); fail(err); return; }
    // שינוי תגית / שיוך לא נוגע בכסף: אין הקצאה אוטומטית מהקרדיט (תשלום רק במסך התשלום)
  }
  /* יציאה מתגית "שילם" (או הסרה ממפגש) = החזר תשלום: מתריעים בבירור, והמערכת רושמת רשומת החזר */
  $('#cDlg').addEventListener('close', () => { $('#cYes').textContent = 'אישור'; $('#cYes').classList.remove('danger', 'ok', 'yel'); $('#cAlt').hidden = true; });
  /* משתתף שהגיע למפגש (סומנה הגעה) אי אפשר להסיר מהמפגש */
  /* הסרה ממפגש לא יוצרת זיכוי לקרדיט: למי ששולם אפשר רק להחזיר את התשלום */
  const confirmLink = (pid, mid, on, after) => (!on && allocatedOf(pid, mid) > 0) ? confirmAct('הסרה מהמפגש', pid, mid, async () => { try { await reduceAlloc(pid, mid, Math.max(0, allocatedOf(pid, mid))); } catch (err) { fail(err); return; } setLinked(pid, mid, false); if (after) after(); }, 'ההקצאה למפגש (<b>' + ils(Math.round(allocatedOf(pid, mid) * 100) / 100) + '</b>) תוסר, והסכום יחזור לקרדיט של המשתתף. לא מוחזר כסף.', 'הסר והחזר את הסכום לקרדיט', null, { yellow: true }) : confirmAct(on ? 'להוסיף למפגש?' : 'להסיר מהמפגש?', pid, mid, () => { setLinked(pid, mid, on); if (after) after(); }, '', on ? 'הוספה למפגש' : 'הסרה מהמפגש', null, on ? { green: true } : undefined);

  /* סימון הגעה למפגש (זמן אמת: מעדכן מיד, נשמר ומתעדכן אצל כולם) */
  /* שיווק ממומן: רשימה עם קרדיט, דף התחשבנות לכל שיווק ממומן (עמלות שנצברו מול תשלומים לשיווק ממומן), הוספה, עריכה ומחיקה */
  let prDraft = null, prAfterSave = null, prCur = null, srcDraftOn = false;   // srcDraftOn: שיווק ממומן חדש בתוך מסך דרכי ההגעה (לא בפופאפ נפרד)
  const fmtD = (iso) => { if (!iso) return ''; const [y, m, d] = String(iso).slice(0, 10).split('-'); return Number(d) + '.' + Number(m) + '.' + y.slice(2); };
  const ils = (n) => '<bdi dir="ltr">₪' + nfm(n) + '</bdi>';   // בלי היפוך סימן השקל בטקסט מימין לשמאל
  const nfx = (n) => (Math.round(n * 100) / 100).toLocaleString('he-IL');   // בלי עיגול לשקל: בהתחשבנות סכום השורות שווה בדיוק לקרדיט, גם בתעריף עם שבר
  /* תנועות דרך ההגעה: עמלות שנצברו (חיובי, אנחנו חייבים) ותשלומים אליו (שלילי), עם קרדיט מצטברת */
  /* עלות כללית: כל תשלום לדרך ההגעה הוא העלות של התקופה שמאז ההתחשבנות הקודמת, והעלות לליד היא הסכום חלקי הלידים שנרשמו בתקופה. תשלומים באותו יום הם תקופה אחת */
  const dayMon = (iso) => { const [, m, d] = String(iso).slice(0, 10).split('-').map(Number); return d + '.' + m; };
  const perLeadTxt = (v) => '₪' + (Math.round(v * 10) / 10).toLocaleString('en-US');
  function costPeriods(id) {
    const days = {}; state.promoPays.filter((x) => x.promoter_id === id).forEach((x) => { days[x.paid_at] = (days[x.paid_at] || 0) + Number(x.amount); });
    const leads = srcLeads(id).map((q) => ilDay(q.created_at)); let prev = '';
    const periods = Object.keys(days).sort().map((d) => { const n = leads.filter((l) => l > prev && l <= d).length, r = { from: prev, to: d, amount: days[d], leads: n, per: n ? days[d] / n : null }; prev = d; return r; });
    return { periods, openFrom: prev, openLeads: leads.filter((l) => l > prev).length };
  }
  function ledgerOf(id) {
    /* ההתחשבנות מהתשלום האחרון ואילך: מה שלפניו נחשב מסולק, בלי חשיבות להיסטוריה. rows: התנועה של כל משתתף מאז, וסכומן הוא בדיוק הקרדיט. pays: התשלומים לדרך ההגעה, בנפרד (accrued / paid הם סכומים כוללים, לסטטיסטיקה) */
    const x0 = promoterOf(id), rate = x0 ? Number(x0.rate) : 0, byLead = !!(x0 && !x0.cost_from_payment && !x0.cost_total && rate > 0);
    if (x0 && x0.cost_total) {   // עלות כללית: אין קרדיט. כל תשלום מוצג עם התקופה שהוא מכסה והעלות לליד שנגזרת ממנו
      const P = costPeriods(id), mine = state.promoPays.filter((x) => x.promoter_id === id).slice().sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)) || String(b.created_at).localeCompare(String(a.created_at)));
      const opened = srcLeads(id).filter((q) => ilDay(q.created_at) > P.openFrom).sort(newestFirst).map((q) => ({ kind: 'l', date: ilDay(q.created_at), amount: null, who: q.name, sub: '', key: q.id }));
      const rowsT = mine.map((x) => { const r = P.periods.find((q) => q.to === x.paid_at), per = r ? (r.from ? 'מאז ' + dayMon(r.from) + ' · ' : '') + r.leads + ' לידים' + (r.per != null ? ' · ' + perLeadTxt(r.per) + ' לליד' : '') : ''; return { kind: 'p', date: x.paid_at, amount: -Number(x.amount), who: 'תשלום לשיווק ממומן', sub: [methodName(x), x.by_email ? 'שולם דרך ' + finName(x.by_email) : '', x.note || '', per].filter(Boolean).join(' · '), id: x.id, key: x.id }; });
      const paidT = mine.reduce((t, x) => t + Number(x.amount), 0);
      return { rows: opened, pays: rowsT, accrued: paidT, paid: paidT, balance: 0, total: P, lastTs: '' };
    }
    const myPays = state.promoPays.filter((x) => x.promoter_id === id).slice().sort((a, b) => String(b.created_at || b.paid_at).localeCompare(String(a.created_at || a.paid_at)));
    const lp = myPays[0], lastTs = lp ? String(lp.created_at || (lp.paid_at + 'T23:59:59')) : '';
    const leadsAll = byLead ? srcLeads(id) : [], leadsNew = leadsAll.filter((q) => String(q.created_at || '') > lastTs);
    const costRows = x0 && x0.cost_from_payment ? payCostOf(id, lastTs, rate, x0.rate_type === 'percent').map((c) => { const m = meetOf(c.r.meeting_id), isR = cashOf(c.r) < 0; return { kind: isR ? 'r' : 'c', date: ilDay(c.r.created_at), ts: c.r.created_at, amount: c.amount, who: c.q.name, sub: (isR ? 'החזר · ' : '') + (m ? 'מפגש ' + meetingLabel(m).split(' · ')[0] + ' · ' : '') + (isR ? 'הוחזר ' : 'שילם ') + nfm(Math.abs(cashOf(c.r))), key: c.r.id }; }) : [];   // מחושב לפי התעריף הנוכחי
    const accNew = costRows.concat(leadsNew.map((q) => ({ kind: 'c', date: ilDay(q.created_at), ts: q.created_at, amount: rate, who: q.name, sub: 'ליד', key: q.id }))).sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
    { let run3 = 0; accNew.forEach((r) => { run3 += r.amount; r.bal = run3; }); }
    const payRows = myPays.map((x) => ({ kind: 'p', date: x.paid_at, amount: -Number(x.amount), who: 'תשלום לשיווק ממומן', sub: [methodName(x), x.by_email ? 'שולם דרך ' + finName(x.by_email) : '', x.note || ''].filter(Boolean).join(' · '), id: x.id, key: x.id }));
    const paid = myPays.reduce((s, x) => s + Number(x.amount), 0), balance = accNew.reduce((s, r) => s + r.amount, 0);
    return { rows: accNew.slice().reverse(), pays: payRows, accrued: paid + balance, paid, balance, lastTs };
  }
  let prView = '#prList';
  const RANK = { '#prList': 0, '#prDetail': 1, '#prForm': 2 };
  /* מעבר בין מסכי דרכי ההגעה: אותה מעטפת כמו פרטי המשתתף (החלקה וחץ חזרה בכותרת) */
  function show(view) {
    const forward = RANK[view] > RANK[prView]; prView = view;
    ['#prList', '#prDetail', '#prForm'].forEach((s) => { const d = $(s), on = s === view; d.hidden = !on; d.classList.remove('enter-l', 'enter-r'); if (on && !reducedMotion()) { void d.offsetWidth; d.classList.add(forward ? 'enter-l' : 'enter-r'); } });
    $('#prArrow').hidden = view !== '#prForm'; navSync($('#prDlg')); syncUrl();   // בהתחשבנות בלי חץ: סוגרים בהחלקה, בלחיצה בחוץ או בחזרה בדפדפן
  }
  function showPromoterDetail(id) {
    prCur = id; const x = promoterOf(id); if (!x) return showPromoterList();
    const L = ledgerOf(id);
    $('#prTitle').textContent = 'התחשבנות · ' + x.name;
    const lastP = L.total && L.total.periods[L.total.periods.length - 1];
    $('#prSum').innerHTML = L.total ? UI.metric('עלות לליד בתקופה האחרונה', lastP && lastP.per != null ? perLeadTxt(lastP.per) : '-', { sub: lastP ? ils(lastP.amount) + ' · ' + lastP.leads + ' לידים' : 'עוד לא נרשם תשלום' }) + UI.metric('לידים בתקופה הנוכחית', L.total.openLeads, { sub: L.total.openFrom ? 'מאז ' + dayMon(L.total.openFrom) : '' })
      : UI.metric(L.balance > 0 ? 'קרדיט לתשלום לשיווק ממומן' : 'מסולק', '<bdi dir="ltr">₪' + nfx(Math.max(L.balance, 0)) + '</bdi>', { tone: L.balance > 0 ? 'neg' : 'pos', cls: 'wide' });
    /* תנועה: אותה שורה כמו בהיסטוריית התשלומים (walrow): מימין מי, ומתחתיו מתי ופרטים; משמאל הסכום, ומתחתיו הקרדיט אחרי התנועה או מחיקת התשלום. בעלות כללית לליד אין סכום */
    const shek = (n) => '<bdi dir="ltr">' + (n < 0 ? '−' : '') + '₪' + nfx(Math.abs(n)) + '</bdi>';
    const moveRow = (r) => '<div class="walrow"><div class="wl"><b>' + esc(r.who) + '</b><small>' + fmtD(r.date) + (r.sub ? ' · ' + esc(r.sub) : '') + '</small></div>' + (r.amount == null ? '' :
      '<div class="wr"><span class="wamt' + (r.kind === 'p' ? ' up' : r.kind === 'r' ? ' down' : '') + '"><bdi dir="ltr">' + (r.amount > 0 ? '+' : '−') + '₪' + nfx(Math.abs(r.amount)) + '</bdi></span>' +
      (r.kind === 'p' ? '<button type="button" class="ndel" data-delpay="' + r.id + '" aria-label="מחיקת תשלום">מחיקה</button>' : '<small>קרדיט ' + shek(r.bal) + '</small>') + '</div>') + '</div>';
    $('#prMovesLbl').hidden = !L.rows.length; $('#prMovesLbl').textContent = L.total ? (L.total.openFrom ? 'לידים מאז ההתחשבנות האחרונה' : 'לידים') : (L.lastTs ? 'תנועות מאז ההתחשבנות האחרונה' : 'תנועות');
    $('#prMoves').innerHTML = L.rows.map(moveRow).join('') + (L.rows.length && !L.total ? '<div class="walrow prtotal"><div class="wl"><b>סך הכול</b></div><div class="wr"><span class="wamt">' + shek(L.balance) + '</span></div></div>' : '');
    $('#prPaysLbl').hidden = !L.pays.length; $('#prPaysLbl').textContent = 'תשלומים ל' + x.name;
    $('#prPays').innerHTML = L.pays.map(moveRow).join('');
    show('#prDetail');
  }
  /* שיווק ממומן חדש: אותו כרטיס בדיוק כמו ברשימת דרכי ההגעה (srcCard). במסך דרכי ההגעה היא נוספת לרשימה ונשמרת כשמקלידים שם; משדה "מקור" של משתתף: בטופס עם שמירה */
  function renderPrDraft() {
    const box = srcDraftOn ? $('#srcPrDraft') : $('#prNewCard'), nm = box.querySelector('[data-f="name"]'), rt = box.querySelector('[data-f="rate"]');   // ציור מחדש לא מוחק מה שהוקלד ועוד לא נשמר
    if (nm) prDraft.name = nm.value; if (rt) prDraft.rate = Math.max(0, Number(rt.value) || 0);
    box.innerHTML = srcCard(prDraft, 'new');
  }
  function newPrDraft() {
    prCur = null; prDraft = { name: '', rate_type: 'fixed', rate: 0, color: 'red', cost_on_lead: true, cost_from_payment: false, cost_total: false };
  }
  function dropSrcDraft() { srcDraftOn = false; const b = $('#srcPrDraft'); if (b) b.innerHTML = ''; }
  function startSrcDraft() {
    if (!srcDraftOn) { newPrDraft(); srcDraftOn = true; prDraft.rate = 0; renderPrDraft(); }
    const n = $('#srcPrDraft .stname'); if (n) { n.focus(); n.scrollIntoView({ block: 'nearest' }); }
  }
  async function commitSrcDraft(name) {
    const box = $('#srcPrDraft'), rt = box.querySelector('[data-f="rate"]'); if (rt) prDraft.rate = Math.max(0, Number(rt.value) || 0);
    const body = Object.assign({}, prDraft, { name });
    try {
      const [row] = await api(T.pr, { method: 'POST', body, prefer: 'return=representation' });
      if (row && !promoterOf(row.id)) state.promoters.push(row);
      const a = document.activeElement, fo = box.contains(a) ? a.dataset.f : null;   // המשתמש כבר עבר לשדה אחר בכרטיס: נשאר באותו שדה
      dropSrcDraft(); renderSources(); render();
      if (row && fo) { const f2 = document.querySelector('#srcPrList [data-w="pr:' + row.id + '"] [data-f="' + fo + '"]'); if (f2) f2.focus(); }
      toast('דרך ההגעה נוספה');
    } catch (err) { fail(err); }
  }
  function showPromoterForm() {
    dropSrcDraft(); newPrDraft();
    renderPrDraft(); show('#prForm'); $('#prTitle').textContent = 'שיווק ממומן חדש';
    setTimeout(() => { const n = document.querySelector('#prNewCard .stname'); if (n) n.focus(); }, 50);
  }
  function showPromoterList() { prCur = null; if ($('#prDlg').open) $('#prDlg').close(); }   // אין מסך רשימה: ההתחשבנות נפתחת מכרטיס דרך ההגעה בהגדרות, וחזרה סוגרת
  /* הוספת שיווק ממומן מתוך שדה בחירה (משתתף / תשלום): פותח את טופס דרך ההגעה, ואחרי שמירה בוחר אותו בשדה */
  function openNewPromoter(cb) { prAfterSave = cb || null; showPromoterForm(); $('#prDlg').showModal(); }
  $('#prDlg').addEventListener('close', () => { prAfterSave = null; refreshSources(); });   // חזרה מההתחשבנות: הסכום לתשלום בכרטיס מתעדכן
  $('#prList').addEventListener('click', (e) => { if (e.target.closest('#prNew')) return showPromoterForm(); const r = e.target.closest('[data-pr]'); if (r) showPromoterDetail(r.dataset.pr); });
  $('#prList').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-pr]')) { e.preventDefault(); showPromoterDetail(e.target.dataset.pr); } });
  $('#prArrow').addEventListener('click', () => { prAfterSave = null; showPromoterList(); });
  $('#prForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameI = document.querySelector('#prNewCard .stname'), name = nameI.value.trim().slice(0, 24);
    if (!name) { toast('חסר שם לדרך ההגעה'); nameI.focus(); return; }
    try {
      const [row] = await api(T.pr, { method: 'POST', body: Object.assign({}, prDraft, { name }), prefer: 'return=representation' });
      if (row && !promoterOf(row.id)) state.promoters.push(row);
      state.promoters.sort((a, b) => a.name.localeCompare(b.name, 'he')); renderSources();
      const cb = prAfterSave; prAfterSave = null; $('#prDlg').close();
      if (cb && row) cb(row); toast('דרך ההגעה נוספה');
    } catch (err) { fail(err); }
  });
  /* תשלום לשיווק ממומן: סכום (ברירת מחדל: הקרדיט), תאריך והערה */
  /* רישום תשלום לשיווק ממומן: פופאפ מלמטה בגובה התוכן, ואישור לפני הרישום, כמו תשלום של משתתף. דרך תשלום שיש לה "הקופה של" קובעת גם מי שילם */
  const ppByFromMethod = () => { const f = $('#ppForm'), pm = state.payMethods.find((m) => m.key === f.method.value); if (pm && pm.owner_email) { if (![...f.by.options].some((o) => o.value === pm.owner_email)) f.by.insertAdjacentHTML('beforeend', '<option value="' + esc(pm.owner_email) + '">' + esc(finName(pm.owner_email)) + '</option>'); f.by.value = pm.owner_email; } };
  $('#ppOpen').addEventListener('click', () => {
    const f = $('#ppForm'), L = ledgerOf(prCur), x = promoterOf(prCur);
    $('#ppTitle').textContent = 'רישום תשלום · ' + (x ? x.name : '');
    f.amount.value = L.balance > 0 ? L.balance : ''; f.date.value = todayISO(); f.note.value = '';
    f.by.innerHTML = '<option value="">לא הוגדר</option>' + finAdmins().map((e2) => '<option value="' + esc(e2) + '">' + esc(finName(e2)) + '</option>').join(''); f.by.value = emailOf() || '';
    f.method.innerHTML = payMethodOpts(); ppByFromMethod();
    $('#ppDlg').showModal();
    blurIn('#ppDlg');   // בלי מקלדת בפתיחה
  });
  $('#ppForm').method.addEventListener('change', ppByFromMethod);
  $('#ppForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target, amount = parseFloat(f.amount.value), x = promoterOf(prCur), pm = state.payMethods.find((m) => m.key === f.method.value);
    if (!(amount > 0)) { f.amount.focus(); return; }
    const body = { promoter_id: prCur, amount, paid_at: f.date.value || todayISO(), note: f.note.value.trim() || null, by_email: f.by.value || null, method: f.method.value || null };
    confirmAct('אישור תשלום לשיווק ממומן', null, null, async () => {
      try { const [row] = await api(T.pp, { method: 'POST', body, prefer: 'return=representation' }); if (row && !state.promoPays.some((q) => q.id === row.id)) state.promoPays.push(row); $('#ppDlg').close(); toast('התשלום נרשם'); showPromoterDetail(prCur); }
      catch (err) { fail(err); }
    }, (x ? 'אל: <b>' + esc(x.name) + '</b><br>' : '') + 'סכום: <b>' + ils(amount) + '</b>' + (pm ? '<br>דרך: <b>' + esc(pm.name) + '</b>' : ''), 'אישור תשלום', null, { plain: true, green: true });
  });
  $('#prPays').addEventListener('click', (e) => {
    const d = e.target.closest('[data-delpay]'); if (!d) return;
    const id = d.dataset.delpay;
    confirmAct('מחיקת תשלום לשיווק ממומן', null, null, () => {   // the page's own confirm popup (no native window); the undo toast follows the delete
      const prev = state.promoPays;
      state.promoPays = state.promoPays.filter((q) => q.id !== id); showPromoterDetail(prCur);
      api(T.pp + '?id=eq.' + id, { method: 'DELETE' }).catch((err) => { state.promoPays = prev; showPromoterDetail(prCur); fail(err); });
    }, 'התשלום יימחק מההתחשבנות. אפשר לבטל מיד אחרי.', 'מחיקה', null, { plain: true });
  });
  const attPending = new Map();
  function applyAttPending() {
    const now = Date.now();
    attPending.forEach((ov, key) => { if (ov.exp <= now) { attPending.delete(key); return; } const [pid, mid] = key.split('|'); let l = linkOf(pid, mid); if (!l && ov.row) { l = Object.assign({}, ov.row); state.att.push(l); } if (l) Object.assign(l, ov.body); });
  }
  /* שינוי תגית אופטימי: עד שהכתיבה נקלטת (ועוד 3 שניות להד של הזמן אמת) טעינה מחדש לא מחזירה את הערך הישן, כדי שלא יהבהב ישן-חדש-ישן-חדש */
  function pendBegin(pid, mid, body, row) { const key = pid + '|' + mid, old = attPending.get(key), ov = { body: Object.assign({}, old && old.body, body), exp: Infinity, row: row || (old && old.row) }; attPending.set(key, ov); return { key, ov }; }
  const pendDone = (h) => { if (attPending.get(h.key) === h.ov) h.ov.exp = Date.now() + 3000; };
  const pendFail = (h) => { if (attPending.get(h.key) === h.ov) attPending.delete(h.key); };
  /* תשלום למפגש: כמה כסף משויך למפגש הזה. מוסיפים (לוקחים מהקרדיט ו/או מקבלים עכשיו) או מפחיתים (חוזר לקרדיט). לא משנה את התגית */
  function openPayView(pid, mid, opts) {
    const l = linkOf(pid, mid); if (!l) return;
    const p = partOf(pid), m = meetOf(mid);
    const f = pForm, alloc = Math.max(0, allocatedOf(pid, mid)), price = m ? expectedPrice(pid, m) : PRICE_EARLY;
    f.pay_amount.value = opts && opts.amount != null ? opts.amount : (alloc > 0 ? alloc : price);
    /* דרך ההגעה שייך למשתתף: העמלה מחושבת על התשלום הראשון שמתקבל (הפקדה או תשלום ישיר), לפי התעריף */
    const pr = (p && channelOf(p)) || promoterOf(l.promoter_id);   // גם מי שהגיע מקישור של מודעה, בלי בחירה ידנית
    const isFirst = !state.payments.some((x) => x.participant_id === pid && (x.kind === 'deposit' || (x.kind === 'payment' && !x.from_credit && x.meeting_id && x.meeting_id !== mid))), commPr = (isFirst || commOnEvery(pr)) ? pr : null;
    $('#payQuick').innerHTML = quickPrices(m).map((v) => '<button type="button" data-q="' + v + '">' + v + ' ₪</button>').join('');
    f.pay_method.value = l.pay_method || 'paybox'; f.pay_method_note.value = l.pay_method_note || '';
    const paintOther = () => { $('#payOtherField').hidden = f.pay_method.value !== 'other'; };
    f.pay_method.onchange = () => { paintOther(); if (f.pay_method.value === 'other') f.pay_method_note.focus(); }; paintOther();
    const bal = Math.max(0, creditOf(pid)), num = (el) => Math.max(0, parseFloat(el.value) || 0);
    const delta = () => num(f.pay_amount) - alloc;
    const takeFrom = () => Math.min(bal, num(f.pay_bal), Math.max(0, delta()));
    const paintHint = () => {
      const d = delta(), fb = bal > 0 ? takeFrom() : 0, r = d - fb;
      $('#payBalField').hidden = !(bal > 0 && d > 0);
      $('#payHint').innerHTML = (alloc > 0 ? 'משויך כרגע למפגש: <b>₪' + nfm(alloc) + '</b>. ' : '') + (d > 0 ? (bal > 0 ? 'קרדיט זמינה <b>₪' + nfm(bal) + '</b>. ' : '') + (r > 0 ? 'ישולם עכשיו <b>₪' + nfm(r) + '</b>' : 'הכול מהקרדיט') : d < 0 ? 'ההפרש <b>₪' + nfm(-d) + '</b> יחזור לקרדיט' : 'ללא שינוי');
      f.pay_method.closest('.payfield').style.opacity = d > 0 && r > 0 ? '' : '.4';
    };
    const syncBal = () => { if (bal > 0) f.pay_bal.value = Math.min(bal, Math.max(0, delta())); };
    $('#payBalLabel').textContent = 'מהקרדיט (עד ₪' + nfm(bal) + ')';
    syncBal();
    f.pay_amount.oninput = () => { syncBal(); paintHint(); };
    f.pay_bal.oninput = paintHint;
    $('#payQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { f.pay_amount.value = b.dataset.q; f.pay_amount.oninput(); } };
    paintHint();
    $('#paySave').onclick = async () => {
      const target = num(f.pay_amount), d = target - alloc;
      if (!(parseFloat(f.pay_amount.value) >= 0)) { f.pay_amount.focus(); return; }
      const fb = bal > 0 ? takeFrom() : 0, cash = d > 0 ? d - fb : 0, method = f.pay_method.value, mnote = method === 'other' ? f.pay_method_note.value.trim().slice(0, 60) : '';
      const cm = commPr && cash > 0 ? calcCommission(commPr, cash) : null;
      const body = { paid_amount: target > 0 ? target : null, paid_at: target > 0 ? (l.paid_at || new Date().toISOString()) : null };
      if (cash > 0) Object.assign(body, { pay_method: method, pay_method_note: mnote || null, promoter_id: pr ? pr.id : null, commission: Number.isFinite(cm) ? cm : l.commission });
      try {
        if (d > 0) {
          if (fb > 0) await addPayRecord(pid, mid, 'payment', fb, null, null, true);
          if (cash > 0) await addPayRecord(pid, mid, 'payment', cash, pr ? pr.id : null, Number.isFinite(cm) ? cm : null, false, method, mnote || null);
        } else if (d < 0) await addPayRecord(pid, mid, 'credit', -d, null, null);
        Object.assign(l, body); render();
        await api(T.a + attQs(pid, mid), { method: 'PATCH', body });
        toast(d > 0 ? 'התשלום למפגש עודכן' : d < 0 ? 'ההפרש חזר לקרדיט' : 'ללא שינוי');
      } catch (err) { fail(err); return; }
      refreshSheetMeetings(); toMain();
    };
    if (opts && opts.keep) setPTab('pay'); else goView('pay');
  }
  const closeQ = () => { const q = $('#qMenu'); q.hidden = true; q.className = 'qmenu'; q.style.width = ''; q.style.maxWidth = ''; q.style.maxHeight = ''; };
  function openStatusSettings() {
    closeQ(); setRoot = 'st'; renderSettings(); $('#setDlg').showModal(); tyId = null; stType = curTid() || state.mtype || firstTypeId(); showSetView('st');
    blurIn('#setDlg');
  }
  /* תפריט התגיות של משתתף במפגש (מהרשימה ומהכרטיס): התגיות של סוג המפגש, ולמי שעוד לא משויך גם "שיוך למפגש" מעליהן. בחירה בתגית מחליפה, ובנבחרת מסירה. הסרה מהמפגש: רק ב-✕ בשורת המפגש בכרטיס המשתתף */
  function openQuickMenu(pid, anchor, mid) {
    const menu = $('#qMenu'), mId = mid || state.filter; if (!mId) return;
    /* בתוך פופאפ התפריט צריך לשבת בתוכו (שכבת העל של הדיאלוג), אחרת הוא מוסתר מאחוריו */
    const host = anchor.closest('dialog') || document.body; if (menu.parentNode !== host) host.appendChild(menu);
    const l = linkOf(pid, mId), cur = linkStatus(l), list = statusList(typeIdOf(meetOf(mId)));
    if (l && !list.length) { openStatusSettings(); return; }   // אין עדיין תגיות לסוג המפגש: ישר להגדרת התגיות
    const arr = !!(l && l.attended), arrBtn = '<button type="button" role="menuitem" class="qi qarr" data-qk="__arr" aria-pressed="' + arr + '"' + (arr ? ' aria-label="הסרת סימון ההגעה" title="הסרת סימון ההגעה"' : '') + '>הגיע' + (arr ? icon('close', 'i14') : '') + '</button>';   // ראשון בתפריט, מעל התגיות: סימון הגעה בירוק בהיר
    menu.innerHTML = (l ? '' : '<div class="qtop"><button type="button" role="menuitem" class="qi tone-gray" data-qk="__link" aria-pressed="false">שיוך למפגש</button></div>') + arrBtn +
      list.map((s) => { const on = s.key === cur; return '<button type="button" role="menuitem" class="qi ' + esc(s.key) + '" data-qk="' + esc(s.key) + '" aria-pressed="' + on + '"' + (on ? ' aria-label="הסרת התגית ' + esc(s.label) + '" title="הסרת התגית"' : '') + '>' + esc(s.label) + (on ? icon('close', 'i14') : '') + '</button>'; }).join('');   // על התגית הנבחרת ✕: לחיצה עליה מסירה אותה
    menu.className = 'qmenu qlist'; menu.style.width = ''; menu.hidden = false;   // כל פריט בשורה משלו, מיושר לימין עם הכותרת, והרוחב לפי התוכן
    const r = anchor.getBoundingClientRect(), mh = menu.offsetHeight;
    let left = menuX(menu, anchor), top = r.bottom + 8;
    if (top + mh > menuBottom()) top = Math.max(8, r.top - mh - 8);
    menu.style.left = left + 'px'; menu.style.top = top + 'px';
    menu.onclick = (e) => {
      const b = e.target.closest('[data-qk]'); if (!b) return;
      const k = b.dataset.qk; closeQ();
      if (k === '__arr') { setAttended(pid, mId); return; }
      if (k === '__link') { setLinkedWithStatus(pid, mId, null); toast('שויך למפגש'); return; }
      const next = k === cur ? null : k;
      if (l) setPayStatus(pid, mId, next); else setLinkedWithStatus(pid, mId, next);
      toast(next ? 'התגית עודכנה: ' + STATUS_LABEL[next] : 'התגית הוסרה');
    };
  }
  /* שיוך משתתף למפגש מתוך הכרטיס: תפריט צף עם המפגשים שעוד לא משויך אליהם; שיוך בלי תגית */
  $('#pAddMeet').addEventListener('click', () => {
    if (!sheet || !sheet.id) return; const pid = sheet.id, anchor = $('#pAddMeet'), menu = $('#qMenu');
    if (!menu.hidden) { closeQ(); return; }
    const free = state.meetings.filter((m) => !linkOf(pid, m.id)).sort(meetDesc);
    if (!free.length) return;
    const host = anchor.closest('dialog') || document.body; if (menu.parentNode !== host) host.appendChild(menu);
    menu.className = 'qmenu am'; menu.style.width = '';
    menu.innerHTML = '<div class="qhd">שיוך למפגש</div>' + free.map((m) => { const nm = meetName(m); return '<button type="button" role="menuitem" class="qi" data-am="' + m.id + '"><span class="amd">' + esc(dm(m)) + '</span><span class="amh">' + esc(String(m.meeting_time).slice(0, 5)) + '</span>' + (nm ? '<span class="amn">' + esc(nm) + '</span>' : '') + '</button>'; }).join('');   // שלוש עמודות: תאריך, שעה, שם (כל עמודה על אותו קו אנכי בכל השורות)
    menu.style.maxHeight = ''; menu.hidden = false;
    const ar = anchor.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    menu.style.maxWidth = 'none'; menu.style.width = (hr.width - 16) + 'px'; menu.style.left = (hr.left + 8) + 'px';   // כל הרוחב עם 8 פיקסל מכל צד, כמו שאר התפריטים (בדסקטופ: רוחב הכרטיס)
    placeMenuV(menu, ar.top, ar.bottom);   // הכפתור בתחתית (הרבה מפגשים): נפתח כלפי מעלה
    menu.onclick = (e) => { const b = e.target.closest('[data-am]'); if (!b) return; closeQ(); setLinkedWithStatus(pid, b.dataset.am, null); const m = meetOf(b.dataset.am); toast('שויך למפגש' + (m ? ' ' + dm(m) : '')); };
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQ(); });
  window.addEventListener('scroll', (e) => { if (e.target && e.target.closest && e.target.closest('#qMenu')) return; closeQ(); }, true);   // גלילה בדף סוגרת את התפריט המהיר, אבל לא גלילה בתוך התפריט עצמו (רשימה ארוכה)
  /* תגית היא רק תגית: לא נוגעת בתשלומים, בקרדיט, בהחזרים או בהגעה */
  async function setPayStatus(pid, mid, st) {
    const l = linkOf(pid, mid); if (!l) return;
    const prev = { status_key: l.status_key }, body = statusBody(st), h = pendBegin(pid, mid, body);
    Object.assign(l, body); render(); refreshSheetMeetings();
    try { await api(T.a + attQs(pid, mid), { method: 'PATCH', body }); pendDone(h); }
    catch (err) { pendFail(h); Object.assign(l, prev); render(); refreshSheetMeetings(); fail(err); }
  }
  /* סימון הגעה מעמודת הסימון: סימון שהגיע מיד, ולחיצה נוספת מבטלת אותו (מרגע תחילת המפגש אחרי פופאפ אישור). מי שלא משויך למפגש ומסומן שהגיע: נוצר שיוך (הגיע בלי הרשמה) */
  function setAttended(pid, mid) {
    const l = linkOf(pid, mid), p = partOf(pid);
    if (l && l.attended && p) {   // לחיצה נוספת על סימון הגעה מבטלת אותו: לפני תחילת המפגש מיד, ומרגע שהמפגש התחיל בפופאפ אישור (7.11.26)
      const m = meetOf(mid);
      if (m && meetingStarted(m)) { confirmAct('להסיר את סימון ההגעה?', pid, mid, () => saveAttended(pid, mid, false), 'המשתתף יסומן כמי שלא הגיע', 'כן, להסיר'); return; }
      saveAttended(pid, mid, false); return;
    }
    saveAttended(pid, mid, true);
  }
  async function saveAttended(pid, mid, on) {
    freezeUpd();
    arrFreeze();   // מי שברשימה נשאר בה, גם אם סינון ההגעה היה מוציא אותו
    const l = linkOf(pid, mid), body = { attended: on, attended_at: on ? new Date().toISOString() : null };
    if (!l) {
      const row = Object.assign({ participant_id: pid, meeting_id: mid }, body, firstArrive(pid)), h = pendBegin(pid, mid, body, row);
      state.att.push(row); render(); refreshSheetMeetings();
      try { await api(T.a, { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates' }); pendDone(h); }
      catch (err) { pendFail(h); state.att = state.att.filter((a) => a !== row); render(); refreshSheetMeetings(); fail(err); }
      return;
    }
    const prev = { attended: l.attended, attended_at: l.attended_at }, h = pendBegin(pid, mid, body);
    Object.assign(l, body); render(); refreshSheetMeetings();
    try { await api(T.a + attQs(pid, mid), { method: 'PATCH', body }); pendDone(h); }
    catch (err) { pendFail(h); const l2 = linkOf(pid, mid); if (l2) Object.assign(l2, prev); render(); refreshSheetMeetings(); fail(err); }
  }
  /* יומן תשלומים: כל סימון תשלום או החזר יוצר רשומה חדשה (תיקון תשלום = החזר של הישן + תשלום חדש) */
  /* חבילות: הפקדה עם pkg_n מפגשים (מחיר למפגש = סכום / pkg_n); כל הקצאה מחבילה (pkg) לוקחת מחיר חבילה ומורידה מפגש; זיכוי של הקצאה כזו מחזיר מפגש */
  const pkgLeft = (pid) => state.payments.filter((x) => x.participant_id === pid).reduce((s, x) => s + (x.kind === 'deposit' && x.pkg_n > 0 ? Number(x.pkg_n) : x.kind === 'refund' && x.pkg && x.pkg_n > 0 ? -Number(x.pkg_n) : x.pkg && x.kind === 'payment' ? -1 : x.pkg && x.kind === 'credit' ? 1 : 0), 0);
  const pkgUnit = (pid) => { const d = state.payments.filter((x) => x.participant_id === pid && x.kind === 'deposit' && x.pkg_n > 0).sort(newestFirst)[0]; return d ? Math.round(Number(d.amount) / Number(d.pkg_n)) : 0; };
  const pkgNetFor = (pid, mid) => state.payments.filter((x) => x.participant_id === pid && x.meeting_id === mid && x.pkg).reduce((s, x) => s + (x.kind === 'payment' ? 1 : x.kind === 'credit' ? -1 : 0), 0);
  /* מחיר סגור (תשלום בהמשך): מחיר הכרטיס של המשתתף למפגש הזה, בלי קשר לעליית המדרגות */
  const ticketOf = (pid, mid) => { const l = pid && mid ? linkOf(pid, mid) : null; return l && Number(l.ticket_price) > 0 ? Number(l.ticket_price) : 0; };
  const expectedPrice = (pid, m, iso) => ticketOf(pid, m && m.id) || (pkgLeft(pid) > 0 && pkgUnit(pid) ? pkgUnit(pid) : defaultPrice(m, iso));
  const payMethodOpts = () => state.payMethods.map((x) => '<option value="' + esc(x.key) + '">' + esc(x.name) + '</option>').join('');
  async function addPayRecord(pid, mid, kind, amount, promoterId, commission, fromCredit, method, methodNote, pkgMeta) {
    const body = { participant_id: pid, meeting_id: mid || null, kind, from_credit: !!fromCredit, amount: Number(amount) || 0, promoter_id: promoterId || null, commission: commission != null && commission !== '' ? Number(commission) : null, author_name: senderName(), method: (kind === 'payment' || kind === 'deposit' || kind === 'refund') ? (method || null) : null, method_note: (kind === 'payment' || kind === 'deposit' || kind === 'refund') ? (methodNote || null) : null };
    if (pkgMeta) Object.assign(body, pkgMeta); else if (kind === 'credit' && mid && pkgNetFor(pid, mid) > 0) body.pkg = true;   // זיכוי של הקצאה מחבילה מחזיר מפגש לחבילה
    const [row] = await api(T.pay, { method: 'POST', body, prefer: 'return=representation' });
    if (row && !state.payments.some((x) => x.id === row.id)) state.payments.push(row);
    if (sheet && sheet.id) refreshSheetMeetings();
  }

  async function setLinked(pid, mid, on, mode) {
    if (on) {
      const row = Object.assign({ participant_id: pid, meeting_id: mid, paid: false }, firstArrive(pid));
      state.att.push(row); render(); refreshSheetMeetings();
      try { await api(T.a, { method: 'POST', body: row, prefer: 'resolution=ignore-duplicates' }); }
      catch (err) { state.att = state.att.filter((a) => a !== row); render(); refreshSheetMeetings(); fail(err); return; }
      // שיוך למפגש לא נוגע בכסף: אין הקצאה אוטומטית מהקרדיט
    } else {
      const prev = state.att, oldL = linkOf(pid, mid) ? Object.assign({}, linkOf(pid, mid)) : null, oldAlloc = Math.max(0, allocatedOf(pid, mid));
      remKeepAdd(pid, mid);   // הכרטיס לא נעלם מהרשימה: מוצג כ'לא משויך' עד שמשנים חיפוש, מיון, סינון או טוענים מחדש
      state.att = state.att.filter((a) => !(a.participant_id === pid && a.meeting_id === mid));
      render(); refreshSheetMeetings();
      try { await api(T.a + attQs(pid, mid), { method: 'DELETE' }); }
      catch (err) { state.att = prev; render(); refreshSheetMeetings(); fail(err); return; }
      if (oldAlloc > 0) { try { await addPayRecord(pid, mid, mode === 'credit' ? 'credit' : 'refund', oldAlloc, oldL ? oldL.promoter_id : null, oldL ? oldL.commission : null); } catch (err) { fail(err); } }
    }
  }

  /* ---------- חלון משתתף ---------- */
  const pDlg = $('#pDlg'), pForm = $('#pForm');
  let sheet = null; // { id } לעריכה, או { id: null, links: Map } למשתתף חדש


  /* ---------- הערות (CRM): כמה הערות לכל משתתף, עם מי כתב ומתי; בכרטיס מוצגת האחרונה ---------- */
  const noteLatest = new Map(), noteText = new Map(), imgCache = new Map();
  /* צילומי מסך בהערות נשמרים במטמון קבוע בדפדפן (IndexedDB): הערה לא משתנה, ולכן הטעינה הבאה מיידית ובלי רשת */
  const imgDB = (() => {
    let p, off = false;
    const open = () => off ? Promise.resolve(null) : p || (p = new Promise((res) => { try { const r = indexedDB.open('roster-admin-img', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch (e) { res(null); } }));
    return {
      get: async (id) => { const d = await open(); if (!d) return null; return new Promise((res) => { try { const q = d.transaction('img').objectStore('img').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
      set: async (id, v) => { const d = await open(); if (!d || !v) return; try { d.transaction('img', 'readwrite').objectStore('img').put(v, id); } catch (e) {} },
      drop: async () => { off = true; try { const d = p ? await p : null; if (d) d.close(); } catch (e) {} p = null; return new Promise((res) => { try { const r = indexedDB.deleteDatabase('roster-admin-img'); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch (e) { res(); } }); },
      has: async (id) => { const d = await open(); if (!d) return false; return new Promise((res) => { try { const q = d.transaction('img').objectStore('img').count(id); q.onsuccess = () => res(q.result > 0); q.onerror = () => res(false); } catch (e) { res(false); } }); },
    };
  })();
  const dropImages = () => { imgCache.clear(); return imgDB.drop(); };   // צילומי המסך של ההערות נמחקים מהדפדפן ביציאה ובכל חזרה למסך הכניסה
  async function noteImage(id) {
    if (imgCache.has(id)) return imgCache.get(id);
    let v = await imgDB.get(id);
    if (!v) { const [r] = await api(T.n + '?id=eq.' + id + '&select=image'); v = r && r.image; if (v) imgDB.set(id, v); }
    imgCache.set(id, v || null); return v;
  }
  /* מטען מראש ברקע את כל צילומי ההערות שעוד אינם במטמון (אחד בכל פעם), כדי שפתיחת כרטיס תהיה מיידית */
  let prefetching = false;
  async function prefetchNoteImages() {
    if (prefetching) return; prefetching = true;
    try { for (const n of state.notes.filter((x) => x.has_image)) { if (document.hidden) break; if (imgCache.has(n.id) || await imgDB.has(n.id)) continue; try { await noteImage(n.id); } catch (e) { break; } await new Promise((r) => setTimeout(r, 200)); } } finally { prefetching = false; }
  }
  function rebuildNotes() {
    noteLatest.clear(); noteText.clear();
    state.notes.filter((n) => !n.system).sort(newestFirst).forEach((n) => {   // מהחדשה לישנה; הערות מערכת לא מוצגות ברשימה ובחיפוש
      if (!noteLatest.has(n.participant_id)) noteLatest.set(n.participant_id, n);
      noteText.set(n.participant_id, ((noteText.get(n.participant_id) || '') + ' ' + (n.body || '')).toLowerCase());
    });
  }
  /* באותו רגע (תשלום ישיר למפגש רושם את שתי ההערות באותה טרנזקציה): סדר התהליך, קודם התשלום ואחריו ההקצאה (ברשימה מהחדש לישן ההקצאה מעל) */
  const NSTEP = { payment_received: 0, alloc_added: 1, alloc_changed: 1 };
  const notesOf = (pid) => state.notes.filter((n) => n.participant_id === pid).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (NSTEP[b.event_type] ?? 0.5) - (NSTEP[a.event_type] ?? 0.5));
  const hasNote = (p, q) => (noteText.get(p.id) || '').includes(q);
  function fmtDT(iso) {
    const d = new Date(iso); if (isNaN(d)) return '';
    const dd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return dd.replace(',', '').replace(/\//g, '.');
  }

  /* ---------- שולח ההודעות והקישורים ---------- */
  const dm = (m) => { const [, mo, d] = m.meeting_date.split('-').map(Number); return d + '.' + mo; };
  const senderName = () => ((state.prefs[emailOf()] || {}).sender_name || '').trim() || String(AUTH.name() || '').trim().split(/\s+/)[0] || 'מנהל';   // השם שהוגדר ב"החשבון שלי", אחרת השם הפרטי מחשבון הגוגל
  /* שם הכותב מוצג לפי השם שהוגדר בהגדרות ("שם השולח בהודעות") של אותו מנהל, ולא לפי שם חשבון הגוגל שנשמר בהערה */
  /* שם מנהל בכל המערכת: לפי מה שהוגדר ב"השם שלי" של אותו מנהל; אחרת, אם זה אני, השם מחשבון הגוגל; אחרת השם שנשמר ליד הרשומה, ובלי הכול החלק הראשון של הכתובת. בלי אימייל בכלל (הערות מערכת): "מערכת" */
  const noteAuthor = (email, name) => { const e = String(email || '').toLowerCase(), pr = ((state.prefs[e] || {}).sender_name || '').trim(); if (pr) return pr; if (!e) return name || 'מערכת'; return e === emailOf() ? senderName() : (name || e.split('@')[0] || 'מנהל'); };
  /* תאריך ושעה בתוך הערה (25.10 · 20:00) מוצגים כיחידה אחת משמאל לימין, כדי שהסדר לא יתהפך בתוך משפט בעברית */
  const noteTextHtml = (s) => esc(s).replace(/(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?(?:\s*·\s*\d{1,2}:\d{2})?|\d{1,2}:\d{2})/g, '<bdi dir="ltr">$1</bdi>');
  /* הערות מערכת: טקסט בלבד בצבעי המערכת. המפגש תמיד ראשון ואחריו חץ, ואז הפעולה; שינוי (תגית, סכום הקצאה) הוא "ישן ← חדש" */
  const NCH = (txt, cls) => UI.tag(txt, 'nch ' + cls);
  const NARW = '<span class="narw" aria-hidden="true">' + icon('go', 'i16') + '</span>';   // חץ כ-SVG: ממורכז אנכית באמת (התו ← יושב נמוך בגופן)
  const NST_TONE = { green: 'ng', red: 'nr', amber: 'ny', sky: 'nb', neutral: 'nn' };
  const nStChip = (n, name) => {   // מה שנכתב בהערה לא משתנה: השם והצבע שנשמרו בה, גם אם שינו או מחקו את התגית
    const lb = n.status_label || name || '';
    return NCH(esc(lb === 'חינם' ? 'לא לתשלום' : lb), NST_TONE[n.status_color] || 'nn');
  };
  function sysChips(n) {
    const b = String(n.body || ''), ev = n.event_type || '';
    const md = n.meeting_short || '';   // התאריך נשמר בהערה ולא משתנה
    const M0 = md ? NCH('<bdi dir="ltr">' + esc(md) + '</bdi>', 'nm') : '', M = M0 && M0 + NARW;   // M: התאריך והחץ שאחריו
    const amt = (n.amount != null && n.amount !== '') ? Number(n.amount) : Number((/₪\s*([\d.]+)/.exec(b) || [])[1] || 0);
    const sh = (v) => '<bdi dir="ltr">₪' + nfm(v) + '</bdi>';
    const meth = ((/ ב([^\s(][^()]*)$/.exec(b) || [])[1] || '').trim();
    switch (ev) {
      case 'status_changed': case 'meeting_status_changed': case 'after_status_changed': case 'during_status_changed': {
        const m = /:\s*(.+?)\s*\(היה:\s*(.+)\)\s*$/.exec(b); if (!m) return null;
        const pm = /^(.+?)\s*₪\s*([\d.]+)(?:\s+ב.+)?$/.exec(m[1]);   // "שילם ₪100 בפייבוקס": התגית, ואחריו צ'יף תשלום כמו בשאר ההערות
        return M + nStChip(n, pm ? pm[1] : m[1]);   // המפגש והתגית החדש, בלי הישן. התשלום לא שייך לשורת שינוי תגית: הוא נרשם בהערה נפרדת
      }
      case 'meeting_linked': return n.new_status ? M + nStChip(n) : M + NCH('שיוך למפגש', 'nn');   // שיוך: המפגש, והתגית שבה נוצר השיוך כפי שנשמרה בהערה
      case 'meeting_removed': return M + NCH('הסרה מהמפגש', 'nr');   // כמו שינוי תגית: המפגש והמצב החדש, בלי התגית שהיה
      case 'free_on': return M + NCH('לא לתשלום', 'nf');   // מצב התשלום של המפגש: המפגש והמצב החדש, בלי הישן
      case 'free_off': return M + NCH('לתשלום', 'nr');
      case 'pay_later_on': return M + NCH('תשלום בהמשך', 'nb');
      case 'pay_later_off': return M + NCH('לתשלום', 'nr');
      case 'attended': return M + NCH('הגיע/ה', 'ng');
      case 'walk_in': return M + NCH('הגיע/ה ללא הרשמה', 'ng');
      case 'attendance_cancelled': return M + NCH('ההגעה בוטלה', 'nn');
      case 'details_sent': return M + NCH('נשלחו פרטי המפגש', 'nn');
      case 'details_unsent': return M + NCH('שליחת הפרטים בוטלה', 'nn');
      case 'mail_sent': return (M || '') + NCH(esc(b), 'nn');   // מייל בלי אירוע משלו (למשל אישור חיבור)
      case 'payment_closed': return M + NCH('נשאר&nbsp;' + sh(amt), 'nr') + NARW + NCH('התשלום נסגר', 'ng');   // סגירת תשלום: מה שנשאר לשלם נמחק
      case 'payment_reopened': return M + NCH('התשלום נסגר', 'ng') + NARW + NCH('לתשלום', 'nr');
      case 'alloc_added': return M + NCH('הקצאה&nbsp;' + sh(amt), 'ny');
      case 'alloc_removed': return M + NCH('הוסרה הקצאה&nbsp;' + sh(amt), 'ny');
      case 'alloc_changed': { const m = /מ-₪([\d.]+) ל-₪([\d.]+)/.exec(b); return m ? M + NCH('הקצאה&nbsp;' + sh(Number(m[1])), 'ny') + NARW + NCH(sh(Number(m[2])), 'ny') : M + NCH('הקצאה שונתה&nbsp;' + sh(amt), 'ny'); }
      case 'payment_received': case 'deposit': return NCH('תשלום&nbsp;' + sh(amt) + (meth ? '&nbsp;ב' + esc(meth) : ''), 'ng');
      case 'refund': return M + NCH('החזרת כסף&nbsp;' + sh(amt) + (meth ? '&nbsp;·&nbsp;' + esc(meth) : ''), 'nr');
      case 'deactivated': return NCH(esc(b), 'nr');
      case 'reactivated': return M + NCH(esc(b), 'ng');
      default: return M ? M + NCH(noteTextHtml(b.replace(/\s*למפגש\s+\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\s*$/, '')), 'nn') : null;   // הערת מערכת בלי תצוגה משלה: התאריך, חץ והטקסט בלי התאריך
    }
  }
  /* "לפני כמה זמן": דקות, שעות, ימים, שבועות, חודשים ושנים (עם צורות היחיד והזוגי בעברית) */
  const agoText = (iso) => {   // מתי זה קרה, בעברית טבעית: עכשיו, לפני 5 דקות, לפני 5 שעות, אתמול, שלשום, לפני 4 ימים, לפני שבוע, לפני חודשיים...
    const then = new Date(iso), s = Math.max(0, (Date.now() - then.getTime()) / 1000);
    const pl = (n, one, two, many) => n === 1 ? one : n === 2 ? two : n + ' ' + many;
    if (s < 60) return 'עכשיו';
    if (s < 3600) return pl(Math.floor(s / 60), 'דקה', 'שתי דקות', 'דקות');
    if (s < 86400) return pl(Math.floor(s / 3600), 'שעה', 'שעתיים', 'שעות');
    const dk = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d), dd = Math.round((new Date(dk(new Date())) - new Date(dk(then))) / 86400000);   // הפרש ימי לוח (שעון ישראל)
    if (dd <= 1) return 'אתמול';
    if (dd === 2) return 'שלשום';
    if (dd < 7) return dd + ' ימים';
    if (dd < 30) return pl(Math.floor(dd / 7), 'שבוע', 'שבועיים', 'שבועות');
    if (dd < 365) return pl(Math.floor(dd / 30.4), 'חודש', 'חודשיים', 'חודשים');
    return pl(Math.floor(dd / 365), 'שנה', 'שנתיים', 'שנים');
  };
  setInterval(() => { document.querySelectorAll('.nagot[data-ts]').forEach((e) => { e.textContent = agoText(e.dataset.ts); }); }, 30000);

  /* לשונית "התקשרות": וואטסאפ וחיוג (רק פותחים שיחה/מחייגים), ומתחתיהם ההערות */
  /* שאלת אישור אחרי חזרה מוואטסאפ: אם פופאפ המשתתף פתוח, השאלה היא מסך בתוכו (חץ חזרה בכותרת, כמו פרטי המשתתף); אחרת חלון אישור */
  function askConfirm(p, title, textHtml, yesLabel, onYes, danger) { confirmAct(title, p.id, null, onYes, textHtml, yesLabel, null, { plain: true, primary: !danger }); }   // פופאפ רגיל מלמטה, גם מעל כרטיס המשתתף. danger: כפתור האישור באדום
  /* אחרי שליחת הודעת פרטי המפגש: כשחוזרים לדשבורד מאשרים שנשלחה, ואז הכפתור והסימון ברשימה נעלמים */
  let evAwait = null, evAwaitM = null;
  async function setDetailsSent(pid, mid, val) {
    const l = linkOf(pid, mid); if (!l) return;
    const prev = l.details_sent_at; l.details_sent_at = val === false ? null : new Date().toISOString(); render(); renderContact();
    try { await api(T.a + attQs(pid, mid), { method: 'PATCH', body: { details_sent_at: l.details_sent_at } }); }
    catch (err) { l.details_sent_at = prev; render(); renderContact(); fail(err); }
  }
  function askEventSent() {
    if (!evAwait) return;
    const p = partOf(evAwait); evAwait = null; if (!p) return;
    const l = (evAwaitM && linkOf(p.id, evAwaitM)) || evLink(p); evAwaitM = null; if (!l || l.details_sent_at) return;   // המפגש שנלחץ (גם בהפעלה ידנית), לא רק מפגש הערב
    askConfirm(p, 'לסמן שפרטי המפגש נשלחו?', 'נשלחה הודעת פרטי המפגש ל' + nameB(p.name) + '?', 'כן, ההודעה נשלחה', () => { setDetailsSent(p.id, l.meeting_id); toast('סומן שפרטי המפגש נשלחו'); });
  }
  /* תבנית הודעה שנשלחה מהרשימה: בחזרה מוואטסאפ מאשרים שנשלחה (או, אם כבר סומנה, מציעים לבטל את הסימון) */
  let waAwait = null;
  function askMsgSent() {
    const a = waAwait; waAwait = null; if (!a) return;
    const p = partOf(a.pid); if (!p) return;
    if (sentRow(a.pid, a.mid, a.key)) askConfirm(p, 'לבטל את סימון השליחה?', 'ההודעה "' + esc(a.name) + '" כבר סומנה כנשלחה ל' + nameB(p.name) + '. לבטל את הסימון?', 'כן, לבטל סימון', () => setMsgSent(a.pid, a.mid, a.key, false));
    else askConfirm(p, 'לסמן שההודעה נשלחה?', 'נשלחה ההודעה "' + esc(a.name) + '" ל' + nameB(p.name) + '?', 'כן, ההודעה נשלחה', () => { setMsgSent(a.pid, a.mid, a.key, true); toast('סומן שההודעה נשלחה'); });
  }
  const askAwaited = () => { if (evAwait) askEventSent(); else if (waAwait) askMsgSent(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (evAwait || waAwait)) setTimeout(askAwaited, 250); });
  window.addEventListener('focus', () => { if (evAwait || waAwait) setTimeout(askAwaited, 250); });
  /* "אישור מקום" בוואטסאפ כשהמייל לא יכול לצאת: כשסוגרים תשלום ולמשתתף אין כתובת מייל, המערכת רושמת ביומן המיילים שהמייל לא נשלח (error=no_address).
     מיד אחרי כל כתיבה לתשלומים או לשיוכים בודקים אם נרשם כישלון חדש כזה (שלא ראינו), ושואלים אם לשלוח בוואטסאפ את אותו תוכן; בחירה פותחת וואטסאפ עם ההודעה "אישור מקום" מוכנה, ובחזרה מאשרים שנשלחה */
  const mailFailSeen = new Set(), mailFailQ = []; let mailFailPrimed = false, mailFailTs = [];
  const MAIL_FAIL_Q = MAIL_LOG + '?select=id,participant_id,meeting_id,template&status=eq.failed&template=eq.payment_confirmed&error=eq.no_address&order=created_at.desc&limit=50';   // היומן של העסק הזה בלבד (הכותרת x-business והרשאות השורה); אין כתובת: error=no_address
  const MAIL_FAIL_AT = [700, 5000, 20000, 45000, 75000];   // היומן נכתב כשהשרת מעבד את האירוע, ולפעמים זה דקה אחרי הכתיבה: בודקים כמה פעמים ואז מפסיקים
  async function mailFailPrime() { try { ((await api(MAIL_FAIL_Q, { ui: false })) || []).forEach((r) => mailFailSeen.add(r.id)); mailFailPrimed = true; } catch (e) {} }   // מה שכבר קיים לא נשאל מחדש
  async function mailFailCheck() {
    let rows = []; try { rows = (await api(MAIL_FAIL_Q, { ui: false })) || []; } catch (e) { return; }
    const fresh = rows.filter((r) => !mailFailSeen.has(r.id)); fresh.forEach((r) => mailFailSeen.add(r.id));
    fresh.reverse().forEach((r) => mailFailQ.push(r)); mailFailNext();
  }
  function openWaUrl(url) { if (!url) return; if (/^https?:/.test(url)) window.open(url, '_blank', 'noopener'); else location.href = url; }
  /* פופאפ הצעה לשלוח בוואטסאפ את "אישור מקום" (כשאי אפשר במייל). מחזיר false כשאי אפשר לשלוח בכלל */
  function waConfirmOffer(p, m, why) {
    const tpl = state.tpls.find((x) => x.system_key === 'confirm');
    if (!p || !m || !tpl) return false;
    if (!String(p.phone || '').trim()) { toast('המייל לא נשלח (אין כתובת מייל), ואין טלפון לשליחה בוואטסאפ'); return false; }
    confirmAct('המייל לא נשלח', p.id, m.id, () => {
      waAwait = { pid: p.id, mid: m.id, key: tpl.id, name: tpl.name };
      openWaUrl(waLink(p.phone, fillMsg(tpl.body, m, p)));
    }, why || ('לא נשלח מייל ל' + nameB(String(p.first_name || p.name || '')) + ', כי אין כתובת מייל. לשלוח עכשיו את אותם פרטים בוואטסאפ?'), 'כן, פתיחת וואטסאפ', null, { primary: true });
    return true;
  }
  function mailFailNext() {
    if (!mailFailQ.length) return;
    if ($('#cDlg').open) { setTimeout(mailFailNext, 400); return; }
    const r = mailFailQ.shift(), p = partOf(r.participant_id), m = meetOf(r.meeting_id);
    if (!p || !m || !waConfirmOffer(p, m)) { mailFailNext(); return; }
    $('#cDlg').addEventListener('close', () => setTimeout(mailFailNext, 350), { once: true });
  }
  /* סגירת תשלום או "לא לתשלום" בידי מנהל: לא נשלח מייל אוטומטית. פופאפ שואל איך לשלוח למשתתף: מייל (אם יש לו כתובת מייל) או וואטסאפ (11.11.26) */
  const mailOfferQ = []; let mailOfferT = 0;
  function offerCloseMail(pid, mid) {
    if (!pid || !mid || mailOfferQ.some((x) => x.pid === pid && x.mid === mid)) return;
    mailOfferQ.push({ pid, mid }); clearTimeout(mailOfferT); mailOfferT = setTimeout(mailOfferNext, 800);
  }
  async function mailOfferNext() {
    if (!mailOfferQ.length) return;
    if ($('#cDlg').open) { mailOfferT = setTimeout(mailOfferNext, 500); return; }
    const it = mailOfferQ.shift(), p = partOf(it.pid), m = meetOf(it.mid);
    if (!p || !m) { mailOfferNext(); return; }
    { const t0 = state.tpls.find((x) => x.system_key === 'confirm'); if (t0 && sentRow(it.pid, it.mid, t0.id)) { mailOfferNext(); return; } }   // כבר סומן שנשלח אליו: בלי פופאפ
    let st = ''; try { st = await api('rpc/roster_close_payment_mail', { method: 'POST', body: { p_pid: it.pid, p_mid: it.mid, p_dry: true }, ui: false }); } catch (e) { console.error(e); }
    const nopay = noPayOf(p, linkOf(it.pid, it.mid)), hasPhone = !!String(p.phone || '').trim(), tpl = state.tpls.find((x) => x.system_key === 'confirm');
    const after = () => $('#cDlg').addEventListener('close', () => setTimeout(mailOfferNext, 350), { once: true });
    if (st === 'ready') {
      const send = async () => {
        let r = ''; try { r = await api('rpc/roster_close_payment_mail', { method: 'POST', body: { p_pid: it.pid, p_mid: it.mid }, ui: false }); } catch (e) { fail(e); return; }
        if (r === 'sent') { toast('המייל נשלח למשתתף'); refreshOpenSheet(); render(); }
        else if (r === 'no_email' || r === 'no_mail') waConfirmOffer(p, m);
        else toast(r === 'already' ? 'כבר נשלח למשתתף מייל על המפגש הזה' : 'המייל לא נשלח');
      };
      const wa = hasPhone && tpl ? { label: 'שליחה בוואטסאפ', fn: () => { waAwait = { pid: p.id, mid: m.id, key: tpl.id, name: tpl.name }; openWaUrl(waLink(p.phone, fillMsg(tpl.body, m, p))); } } : null;
      confirmAct(nopay ? 'לשלוח למשתתף אישור?' : 'לשלוח למשתתף אישור תשלום?', p.id, m.id, send, (nopay ? 'המקום במפגש שמור, ולא נדרש תשלום.' : 'התשלום נסגר.') + ' איך לשלוח למשתתף את האישור, עם פרטי המפגש והוראות ההגעה? בלי שליחה, לא יישלח כלום.', 'שליחה במייל', wa, { primary: true });
      after();
    } else if (st === 'no_email') {
      if (waConfirmOffer(p, m, 'אי אפשר לשלוח מייל ל' + nameB(String(p.first_name || p.name || '')) + ', כי אין כתובת מייל. לשלוח את האישור בוואטסאפ?')) after(); else mailOfferNext();
    } else if (st === 'no_mail') {
      if (waConfirmOffer(p, m, 'אי אפשר לשלוח מייל על המפגש הזה. לשלוח את האישור בוואטסאפ?')) after(); else mailOfferNext();
    } else mailOfferNext();
  }
  mailOfferHook = (table, method, path, body) => {
    try {
      const q = new URLSearchParams(path.indexOf('?') < 0 ? '' : path.slice(path.indexOf('?') + 1));
      const eq = (k) => { const v = q.get(k); return v && v.indexOf('eq.') === 0 ? v.slice(3) : null; };
      if (table === T.a && method === 'PATCH' && body && body.no_pay === true) offerCloseMail(eq('participant_id'), eq('meeting_id'));
      else if (table === T.pay && method === 'POST' && body && !Array.isArray(body) && body.kind === 'payment' && body.participant_id && body.meeting_id && String(body.reason || '').indexOf('partial_due:') !== 0) offerCloseMail(body.participant_id, body.meeting_id);
    } catch (e) {}
  };
  mailFailHook = () => { if (!mailFailPrimed) return; mailFailTs.forEach(clearTimeout); mailFailTs = MAIL_FAIL_AT.map((ms) => setTimeout(mailFailCheck, ms)); };
  mailFailPrimeFn = () => { if (!mailFailPrimed) mailFailPrime(); };
  /* הודעת הפתיחה בוואטסאפ (תבנית שהמשתמש קבע): למשתתף שבתגית חדש. המחיר: 80 ₪ עד שלושה ימים לפני המפגש (לא כולל), ומאז 100 ₪ */
  /* הודעת "היום זה קורה": רק למשתתף ששילם על מפגש שמתקיים היום (שעון ישראל). התאריך והשעות לפי המפגש; המקום קבוע */
  const FLAB = { sent: ['הכל', 'נשלחו', 'לא נשלחו'], pay: ['הכל', 'שולם', 'לתשלום', 'לא לתשלום', 'תשלום בהמשך', 'משוריינים', 'לא משוריינים'], bal: ['הכל', 'זכאי', 'חייב', 'מאוזן', 'לא לתשלום'] }, FNAME = { sent: 'סינון שליחת פרטים', pay: 'סינון תשלום', bal: 'סינון קרדיט' };
  const fglyph = (k, c) => k === 'sent' ? PIN_ICON : '₪';
  const PIN_ICON = icon('chat');   // סמל הודעה (בועת שיחה), כמו בהגדרת ההודעה לפני המפגש
  const FORCE_EVENT_BTN = false;   // זמני לבדיקה: מציג את הכפתור והסימון גם בלי יום מפגש ותשלום (להחזיר ל-false)
  /* מפגש "היום": מתקיים היום (שעון ישראל); בבדיקה הקרוב ביותר */
  const eventMeeting = () => {
    const today = new Date(nowIL()).toISOString().slice(0, 10), key = (m) => m.meeting_date + m.meeting_time;
    const ms = state.meetings.filter((m) => m.meeting_date === today).sort((x, y) => key(x).localeCompare(key(y)));
    if (ms[0]) return ms[0];
    { const al = state.meetings.filter((m) => m.meeting_date >= today && evOpenPref(m) === 'always').sort((x, y) => key(x).localeCompare(key(y)))[0]; if (al) return al; }   // "תמיד" (בסוג של המפגש): המפגש הקרוב מאותו סוג, גם לא ביום המפגש
    return FORCE_EVENT_BTN ? (state.meetings.filter((m) => m.meeting_date >= today).sort((x, y) => key(x).localeCompare(key(y)))[0] || state.meetings.slice().sort((x, y) => key(y).localeCompare(key(x)))[0] || null) : null;
  };
  /* השיוך של המשתתף למפגש היום, אם מגיע לו להודעה (שילם או לא לתשלום) */
  const evLink = (p) => { const m = eventMeeting(), l = m && linkOf(p.id, m.id); return l && evElig(p.id, l) ? l : null; };   // "ספונטני" לא מקבל עיגול שליחה
  /* כל מי שמגיע לו (שילם/לא לתשלום) כבר קיבל את הפרטים */
  /* עיגול ברשימה: כחול, שליחת פרטי המפגש (עד חצי שעה לפני המפגש; אז הוא הופך לעיגול הגעה הירוק); נעלם כשכולם קיבלו */
  const EV_OPEN_OPTS = [['day', 'מתחילת יום המפגש'], ['08', 'מ-08:00'], ['09', 'מ-09:00'], ['12', 'מ-12:00'], ['180', '3 שעות לפני'], ['120', 'שעתיים לפני'], ['60', 'שעה לפני'], ['always', 'תמיד']];
  const evOpenPref = (m) => { const t = m && m.id ? typeOf(m) : typeById(m); let v = t && t.event_open; if (!v && !state.mtypes.length) v = (state.prefs[emailOf()] || {}).event_open; return EV_OPEN_OPTS.some((o) => o[0] === v) ? v : '09'; };   // לפי סוג המפגש (מפגש או מזהה סוג)
  const evOpenAt = (m) => { const [y, mo, d] = m.meeting_date.split('-').map(Number), [h, mi] = String(m.meeting_time).split(':').map(Number), v = evOpenPref(m); if (v === 'always') return -Infinity; return v === 'day' ? Date.UTC(y, mo - 1, d, 0, 0) : v.length === 2 && Number(v) <= 23 && v[0] === '0' || v === '12' ? Date.UTC(y, mo - 1, d, Number(v), 0) : Date.UTC(y, mo - 1, d, h, mi) - Number(v) * 60000; };
  /* מרגע שהמפגש התחיל, עיגול שליחת פרטי המפגש רק מציג מצב (נשלח / לא נשלח) ולחיצה עליו לא עושה כלום */
  /* המפגש הסתיים (שעתיים אחרי תחילתו): סימון ההגעה ברשימה הופך לתצוגה בלבד; שינוי רק מתוך כרטיס המשתתף */
  const evStarted = (m) => !!m && meetingStarted(m);
  const evCircle = (p) => {
    if (!SENT_COL_ON || !state.filter || state.showSent === false) return '';   // שליחת פרטי המפגש כבויה בתפריט התצוגה, או בתצוגת "הכל" (אין מפגש)
    const m = meetOf(state.filter), l = m && linkOf(p.id, m.id); if (!l) return '';
    const inert = evStarted(m);
    if (l.details_sent_at) return inert ? '<span class="evc sent inert" title="פרטי המפגש נשלחו" aria-label="פרטי המפגש נשלחו">' + PIN_ICON + '</span>' : '<button type="button" class="evc sent" data-evun="' + p.id + '" title="פרטי המפגש נשלחו (לחיצה מחזירה ללא נשלח)" aria-label="פרטי המפגש נשלחו, לחיצה מחזירה ללא נשלח">' + PIN_ICON + '</button>';   // נשאר מוצג גם אחרי שהחלון נסגר: רואים למי נשלחו
    if (!(state.showSent === true || evOnFor(m) || hasSent(m) || evRecent(m))) return '';   // גם אחרי שחלון השליחה נסגר: במפגש שנשלחו בו פרטים, ביטול סימון "נשלח" מחזיר עיגול "לא נשלח" ולא גורם לו להיעלם   // בהפעלה ידנית: גם לפני החלון ובמפגש שטרם התחיל   // עוד לא נשלח: רק בחלון השליחה (עד שנפתחת ההגעה) ולמי שלא בתגית ברירת המחדל
    if (inert) return '<span class="evc inert" title="פרטי המפגש לא נשלחו" aria-label="פרטי המפגש לא נשלחו">' + PIN_ICON + '</span>';
    const base = waLink(p.phone, eventDayMessage(m));
    return base ? '<a class="evc" data-evrow="' + p.id + '" href="' + base + '"' + waTgt(base) + ' title="שליחת פרטי המפגש בוואטסאפ" aria-label="שליחת פרטי המפגש בוואטסאפ">' + PIN_ICON + '</a>'
      : '<span class="evc off" title="אין טלפון" aria-label="אין טלפון">' + PIN_ICON + '</span>';
  };
  const DEFAULT_EVENT_MSG = ['היום זה קורה!', '{הוראות הגעה}', '', 'התכנסות: {התכנסות}, מתחילים ב{התחלה}', 'המפגש עד {סיום}', '', 'מחכים לכם'].join('\n');
  const eventTemplate = (m) => { const t = m && m.id ? typeOf(m) : typeById(m); let v = t && t.event_msg; if (!state.mtypes.length) v = (state.prefs[emailOf()] || {}).event_msg; return (v || '').trim() ? v : DEFAULT_EVENT_MSG; };   // נוסח ההודעה של סוג המפגש
  /* ---------- תבניות הודעה לוואטסאפ (31.10.26) ----------
     תבנית = שם ונוסח עם שדות; של סוג מפגש (לכל מפגשיו) או של מפגש אחד (בנוסף לאלה של הסוג). בעמודת הוואטסאפ של הרשימה בוחרים תבנית,
     וקישור הוואטסאפ של כל משתתף ברשימה נפתח עם ההודעה המוכנה. שדות: {שם} (שם פרטי), {תאריך}, {מקום} (עיר ומיקום), {הוראות הגעה}, {התכנסות}, {התחלה}, {סיום} */
  const MSG_VARS = ['{שם}', '{תאריך}', '{מקום}', '{פרטי המפגש}', '{תשלום}', '{הוראות הגעה}', '{איך מגיעים}', '{התכנסות}', '{התחלה}', '{סיום}'];
  const MSG_TOK = { re: /\{(?:שם|תאריך|מקום|פרטי המפגש|תשלום|הוראות הגעה|איך מגיעים|מיקום|התכנסות|התחלה|סיום)\}/g, label: (v) => v === '{מיקום}' ? 'הוראות הגעה' : v.slice(1, -1), max: 2000 };   // {מיקום}: השם הישן של הוראות הגעה
  /* שדות עריכת תבנית הודעה: רכיב אחד, בטופס מפגש וסוג מפגש ובפופאפ שנפתח מתפריט הוואטסאפ */
  const tplFieldsHtml = (I) =>
    '<label class="rfield field"><span>שם התבנית</span><input placeholder=" " type="text" class="mtname" id="' + I('TplName') + '" maxlength="60" autocomplete="off" /></label>' +
    '<div class="rfield field"><span>נוסח ההודעה</span><textarea placeholder=" " class="mtbody" id="' + I('TplBody') + '" rows="1"></textarea></div>' +
    '<div class="emvars" id="' + I('TplVars') + '">' + MSG_VARS.map((v) => '<button type="button" data-v="' + v + '">' + MSG_TOK.label(v) + '</button>').join('') + '</div>' +
    '<button type="button" class="mtreset" id="' + I('TplReset') + '" hidden>שחזור נוסח ברירת מחדל</button>' +
    '<button type="button" class="mtdel" id="' + I('TplDel') + '">מחיקת התבנית</button>';
  const DAY_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  /* "אישור מקום": משפט התשלום לפי מה שהוקצה למפגש (אותו חישוב כמו במייל): לא לתשלום, או מה ששולם (מהקרדיט ולפי דרך תשלום) והקרדיט שנשאר; בלי הקצאה: ריק (בתצוגה מקדימה: דוגמה) */
  const nTrim = (n) => String(Number(Number(n).toFixed(2)));
  function payText(p, m, sample) {
    const l = p && m ? linkOf(p.id, m.id) : null;
    if (l && l.no_pay) return 'המקום שלך במפגש שמור, ולא נדרש ממך תשלום.';
    const pays = p && m ? state.payments.filter((x) => x.participant_id === p.id && x.meeting_id === m.id && x.kind === 'payment') : [], parts = [];
    const cr = pays.filter((x) => x.from_credit).reduce((a, x) => a + Number(x.amount), 0), by = {};
    if (cr > 0) parts.push('₪' + nTrim(cr) + ' מהקרדיט');
    pays.filter((x) => !x.from_credit).forEach((x) => { const n = (state.payMethods.find((k) => k.key === x.method) || {}).name || ''; by[n] = (by[n] || 0) + Number(x.amount); });
    Object.keys(by).sort((a, b) => a.localeCompare(b, 'he')).forEach((n) => parts.push('₪' + nTrim(by[n]) + (n ? ' ב' + n : '')));
    if (!parts.length) return sample ? 'התשלום התקבל, והמקום שלך במפגש נשמר.\nשולם: ₪80 בפייבוקס' : '';
    let t = 'התשלום התקבל, והמקום שלך במפגש נשמר.\nשולם: ' + parts.join(' · ');
    if (cr > 0 && creditOf(p.id) > 0) t += '\nנשאר לך קרדיט של ₪' + nTrim(creditOf(p.id));
    return t;
  }
  function fillMsg(tpl, m, p, o) {   // רכיב אחד: גם ההודעה לפני המפגש, תבניות הוואטסאפ, ו"אישור מקום" (שנשלח גם במייל). o.sample: תצוגה מקדימה
    let t = String(tpl || '');
    const dir = String((m && m.directions) || '').trim();   // {הוראות הגעה}: הוראות ההגעה של המפגש; בלי הוראות השורה נמחקת. {מיקום} הוא השם הישן של אותו שדה (נוסחים שנשמרו קודם)
    for (const tok of ['{הוראות הגעה}', '{מיקום}']) t = dir ? t.split(tok).join(dir) : t.split('\n').filter((ln) => !ln.includes(tok)).join('\n');
    const hm = (min) => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
    const tm = m && m.meeting_time ? String(m.meeting_time).split(':').map(Number) : null, start = tm ? tm[0] * 60 + tm[1] : null;
    const first = p && !p.noName ? (String(p.first_name || '').trim() || String(p.name || '').trim().split(/\s+/)[0] || '') : '';
    let date = '';
    if (m && m.meeting_date) { const [y, mo, d] = m.meeting_date.split('-').map(Number); date = 'יום ' + DAY_FULL[new Date(y, mo - 1, d).getDay()] + ' ' + d + '.' + mo; }
    const place = m ? [m.city, m.place].filter(Boolean).join(' · ') : '', hmS = start == null ? '' : hm(start);
    const box = m ? [meetName(m), date + (hmS ? ' · ' + hmS : ''), place].filter(Boolean).join('\n') : '';   // {פרטי המפגש}: שם, תאריך ושעה, מקום
    const map = { '{שם}': first, '{תאריך}': date, '{מקום}': place, '{התכנסות}': start == null ? '' : hm(start - 15), '{התחלה}': hmS, '{סיום}': start == null ? '' : hm(start + 120),
      '{פרטי המפגש}': box, '{תשלום}': payText(p, m, o && o.sample), '{איך מגיעים}': dir ? 'איך מגיעים\n' + dir : '' };
    const blocks = /\{(?:פרטי המפגש|תשלום|איך מגיעים)\}/.test(t);
    for (const k in map) t = t.split(k).join(map[k]);
    return blocks ? t.replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '') : t;   // שדה בלוק ריק משאיר שורה ריקה: מצמצמים
  }
  const eventDayMessage = (m) => fillMsg(eventTemplate(m), m);
  const tplSort = (a, b) => ((a.sort || 0) - (b.sort || 0)) || String(a.created_at || '').localeCompare(String(b.created_at || ''));
  const tplsOfType = (tid) => tid ? state.tpls.filter((x) => x.type_id === tid).sort(tplSort) : [];
  const tplsOfMeeting = (mid) => mid ? state.tpls.filter((x) => x.meeting_id === mid).sort(tplSort) : [];
  /* המפגש שמוצבים בו שדות התבנית (תאריך, שעה, הוראות הגעה) כשלא נבחר מפגש: הקרוב מהסוג, ואם אין, האחרון */
  const tplCtxMeeting = (tid) => {
    const key = (m) => m.meeting_date + m.meeting_time, ms = state.meetings.filter((m) => typeIdOf(m) === tid);
    return ms.filter((m) => !isPast(m)).sort((a, b) => key(a).localeCompare(key(b)))[0] || ms.slice().sort((a, b) => key(b).localeCompare(key(a)))[0] || null;
  };
  /* תבניות הבחירה בעמודת הוואטסאפ, לפי התצוגה: מפגש נבחר = תבניות הסוג ואחריהן תבניות המפגש; סוג נבחר = תבניות הסוג; כל המשתתפים = אין תבניות (רק וואטסאפ ריק) */
  function waList() {
    const out = [], add = (id, name, body, m, extra) => out.push(Object.assign({ id, name, body, m }, extra));
    if (state.filter) {
      const m = meetOf(state.filter); if (!m) return out;
      const sys = state.tpls.find((x) => x.system_key === 'confirm'); if (sys) add(sys.id, sys.name, sys.body, m, { tag: 'ברירת מחדל', system_key: 'confirm' });   // "אישור מקום": של המערכת, לכל סוגי המפגשים
      tplsOfType(typeIdOf(m)).forEach((x) => add(x.id, x.name, x.body, m, { own: 'type' }));
    } else if (state.mtype) {   // סוג מפגש נבחר: רק תבניות הסוג. בתצוגת כל המשתתפים (בלי סוג ובלי מפגש) אין תבניות, רק וואטסאפ ריק
      const ty = typeById(state.mtype), cm = ty && tplCtxMeeting(ty.id);
      const sys = state.tpls.find((x) => x.system_key === 'confirm'); if (cm && sys) add(sys.id, sys.name, sys.body, cm, { tag: 'ברירת מחדל', system_key: 'confirm' });
      if (cm) tplsOfType(ty.id).forEach((x) => add(x.id, x.name, x.body, cm, { own: 'type' }));
    }
    return out;
  }
  /* התבנית שנבחרה נשמרת בדפדפן הזה לכל תצוגה (מפגש, סוג או הכל); בלי בחירה = הודעה ריקה */
  const MAIL_ICON = icon('mail');
  const WA_LS = 'roster_admin_watpl';
  const waScope = () => state.filter ? 'm:' + state.filter : state.mtype ? 't:' + state.mtype : 'all';
  const waMap = () => { try { return JSON.parse(localStorage.getItem(WA_LS) || '{}') || {}; } catch (e) { return {}; } };
  const WA_SF = 'roster_admin_wasent';
  /* סינון העמודה: '' הכל, '1' נשלח או הגיע, '0' לא נשלח או לא הגיע. הוא קשור למה שנבחר בעמודה ולתצוגה שבה נבחר (waSentKey), ולכן מעבר לבחירה אחרת, לתצוגה אחרת או להודעה ריקה מחזיר ל"הכל" */
  try { const o = JSON.parse(localStorage.getItem(WA_SF) || 'null'), ok = o && typeof o === 'object'; state.waSent = ok ? String(o.v || '') : ''; state.waSentKey = ok ? String(o.k || '') : ''; } catch (e) { state.waSent = ''; state.waSentKey = ''; }
  const ATT_SEL = '__att', attMode = () => !!state.filter && waMap()[waScope()] === ATT_SEL;   // הגיע / לא הגיע בעמודת הסימון: רק בתוך מפגש
  const waKey = () => { if (attMode()) return waScope() + '|' + ATT_SEL; const ws = waSelected(); return ws ? waScope() + '|' + ws.id : ''; };
  const waFilter = () => attMode() ? (state.arrF || '') : ((state.waSent && state.waSentKey && state.waSentKey === waKey()) ? state.waSent : '');   // במצב הגעה הסינון הוא אותו סינון של הצ'יף "הגיעו" שמעל הרשימה (state.arrF)
  let sentKeep = null;   // ראו waSentOk
  const waResetSent = (v) => { sentKeep = null; state.waSent = v || ''; state.waSentKey = v ? waKey() : ''; try { localStorage.setItem(WA_SF, JSON.stringify({ k: state.waSentKey, v: state.waSent })); } catch (e) {} };
  const waSetFilter = (v) => { if (attMode()) { arrKeep = null; state.arrF = v || null; return; } waResetSent(v); };
  const waSentFor = (pid, ws) => !!sentRow(pid, ws.m.id, ws.id) || !!(ws.system_key === 'confirm' && state.confMail.has(pid + '|' + ws.m.id));   // נשלח: בוואטסאפ, או (באישור מקום) גם במייל
  /* סימון שליחה לא מסיר את המשתתף מהתצוגה כשסינון נשלח / לא נשלח פעיל (כמו בסימון הגעה): מי שהיה ברשימה נשאר בה עד שהסינון, התבנית או התצוגה מתחלפים */
  const waSentRaw = (p, f) => { const ws = waSelected(); if (!ws) return true; const on = waSentFor(p.id, ws); return f === '1' ? on : !on; };
  const waSentOk = (p) => { if (attMode()) return true; const f = waFilter(); if (!f) return true; if (sentKeep && sentKeep.f === f && sentKeep.k === waKey() && sentKeep.ids.has(p.id)) return true; return waSentRaw(p, f); };
  const waSentFreeze = () => { const f = waFilter(); if (!f || attMode()) { sentKeep = null; return; } if (sentKeep && sentKeep.f === f && sentKeep.k === waKey()) return; sentKeep = { f, k: waKey(), ids: new Set(state.participants.filter((p) => waSentRaw(p, f)).map((p) => p.id)) }; };
  const waSelected = () => { if (!state.filter) return null;   /* בתצוגת כל המשתתפים ובסוג מפגש: וואטסאפ בלבד, בלי תבניות הודעה והגעה */
    const id = waMap()[waScope()]; return id ? (waList().find((x) => x.id === id) || null) : null; };
  const attTag = (p) => { const l = linkOf(p.id, state.filter), on = !!(l && l.attended), t = !l ? 'לא משויך למפגש. לחיצה: הגיע בלי הרשמה' : on ? 'הגיע. לחיצה מבטלת' : 'לא הגיע. לחיצה מסמנת הגעה'; return UI.tag(on ? icon('check') : '', 'ico rowwa ratt ' + (on ? 'yes' : 'no'), { 'data-att': p.id, 'aria-pressed': String(on), 'aria-label': esc(p.name) + ': ' + t, title: t }, 'button'); };   // הסימון בעמודה: עיגול ירוק בהיר עם ✓ = הגיע, עיגול שקוף ריק = לא הגיע
  /* מעקב שליחה: אחרי שליחת תבנית מסוימת (וחזרה מוואטסאפ) מאשרים שנשלחה, והשורה מסומנת; כך רואים למי נשלחה כל הודעה ולמי לא */
  state.confMail = state.confMail || new Set();
  const sentRow = (pid, mid, key) => state.msgSent.find((x) => x.participant_id === pid && x.meeting_id === mid && x.tpl_key === key) || null;
  /* ספירות לסינון בתפריט העמודה: מי שמוצג ברשימה לפי שאר הסינונים והחיפוש (בלי סינון העמודה עצמו), וכמה מהם הגיעו או נשלחה להם התבנית */
  const waCounts = () => {
    const am = attMode(), ws = waSelected(); if (!am && !ws) return null;
    const keep = state.waSent, keepA = state.arrF; state.waSent = ''; if (am) state.arrF = null;
    const q = state.q.trim().toLowerCase(), qd = digits(q), pool = state.participants.filter((p) => rowPass(p, q, qd));
    state.waSent = keep; state.arrF = keepA;
    const n1 = pool.filter((p) => { if (!am) return waSentFor(p.id, ws); const l = linkOf(p.id, state.filter); return l && l.attended; }).length;
    return { '': pool.length, '1': n1, '0': pool.length - n1 };
  };
  async function setMsgSent(pid, mid, key, on) {
    freezeUpd();
    waSentFreeze();   // מי שברשימה נשאר בה גם אם הסימון היה מוציא אותו
    const prev = state.msgSent.slice(), same = (x) => x.participant_id === pid && x.meeting_id === mid && x.tpl_key === key, now = new Date().toISOString();
    state.msgSent = state.msgSent.filter((x) => !same(x)).concat(on ? [{ participant_id: pid, meeting_id: mid, tpl_key: key, sent_at: now }] : []);
    renderList();
    try {
      if (on) await api(T.sent + '?on_conflict=participant_id,meeting_id,tpl_key', { method: 'POST', body: { participant_id: pid, meeting_id: mid, tpl_key: key, sent_at: now, sent_by: emailOf() }, prefer: 'resolution=merge-duplicates' });
      else await api(T.sent + attQs(pid, mid) + '&tpl_key=eq.' + encodeURIComponent(key), { method: 'DELETE' });
    } catch (err) { state.msgSent = prev; renderList(); fail(err); }
  }
  /* הצ'יף "הגיעו": כשהוא מסומן עמודת הסימון (כפתור הוואטסאפ) עוברת למצב הגעה, וכשהוא לא מסומן המצב נסגר והכפתור חוזר למה שהיה (הודעה ריקה או התבנית שנבחרה). המצב הקודם נשמר לכל תצוגה, גם ברענון */
  const WA_PREV = 'roster_admin_waprev';
  const attModeSet = (on) => {
    const sc = waScope(), cur = waMap()[sc] || '';
    let prev = {}; try { prev = JSON.parse(localStorage.getItem(WA_PREV) || '{}') || {}; } catch (e) {}
    if (on && cur !== ATT_SEL) { prev[sc] = cur; waSetSel(ATT_SEL); }
    else if (!on && cur === ATT_SEL) { waSetSel(prev[sc] || ''); delete prev[sc]; }
    else return;
    try { localStorage.setItem(WA_PREV, JSON.stringify(prev)); } catch (e) {}
  };
  /* מעבר בין מפגשים: הסינונים נשמרים, ולכן גם מצב ההגעה של עמודת הסימון עוקב אחרי הצ'יף "הגיעו" במפגש החדש. סינון הגעה פעיל: עמודת הסימון במצב הגעה גם שם;
     אין סינון הגעה: אם המצב נפתח בגלל הצ'יף (נשמר לו מצב קודם) הוא נסגר, ומצב הגעה שנבחר ידנית בתפריט העמודה נשאר */
  const syncAttMode = () => {
    if (!state.filter) return;
    if (state.arrF) { attModeSet(true); return; }
    let prev = {}; try { prev = JSON.parse(localStorage.getItem(WA_PREV) || '{}') || {}; } catch (e) {}
    if (attMode() && Object.prototype.hasOwnProperty.call(prev, waScope())) attModeSet(false);
  };
  const WA_LAST = 'roster_admin_walast';   // ההודעה האחרונה שנבחרה: לכל תצוגה, ובנוסף האחרונה בכלל (גיבוי)
  const waLastMap = () => { try { return JSON.parse(localStorage.getItem(WA_LAST) || '{}') || {}; } catch (e) { return {}; } };
  const waLast = () => { const m = waLastMap(); return [m[waScope()], m['*']].map((id) => id && waList().find((x) => x.id === id)).find(Boolean) || null; };
  const waSetSel = (id) => { if (id && id !== ATT_SEL) { const lm = waLastMap(); lm[waScope()] = id; lm['*'] = id; try { localStorage.setItem(WA_LAST, JSON.stringify(lm)); } catch (e) {} } const mp = waMap(); if (id) mp[waScope()] = id; else delete mp[waScope()]; try { localStorage.setItem(WA_LS, JSON.stringify(mp)); } catch (e) {} };
  function renderContact() {
    const box = $('#pMsgs'); if (!box) return;
    const p = sheet && sheet.id ? partOf(sheet.id) : null;
    if (!p) { box.innerHTML = ''; return; }
    const base = waLink(p.phone);
    /* משתתף בתגית "משויך": הוואטסאפ נפתח עם הודעה מובנית (בלשון זכר/נקבה); אחרי החזרה לדשבורד שואלים אם להעביר ל"בטיפול" */
    const first = String(p.first_name || p.name || '').trim().split(/\s+/)[0] || '';
    const waHref = base;   // וואטסאפ נפתח לשיחה בלבד, בלי הודעת פתיחה
    let h = '<div class="ctop">' +
      (base ? '<a class="cico cb-wa" href="' + waHref + '"' + waTgt(waHref) + ' aria-label="וואטסאפ" title="וואטסאפ">' + WA_ICON + '</a>' : '<span class="cico off" aria-label="וואטסאפ">' + WA_ICON + '</span>') + '</div>';
    box.innerHTML = h;
  }

  /* לשונית "הערות": הוספה, רשימה מהחדשה לישנה (מי כתב ומתי), ומחיקה */
  function renderNotes() {
    const list = $('#nList'); if (!list) return;
    const p = sheet && sheet.id ? partOf(sheet.id) : null;
    if (!p) { list.innerHTML = ''; return; }
    const ns = notesOf(p.id);   // הערות וצילומי מסך יחד, מהחדש לישן
    sheet.nOpen = sheet.nOpen || new Set();
    const meta = (n) => '<span><bdi>' + esc(n.author_name || 'מערכת') + '</bdi> · ' + esc(fmtDT(n.created_at)) + '</span>' + (n.system ? '' : '<button type="button" class="ndel" data-del="' + n.id + '" aria-label="מחיקת הערה" title="מחיקת הערה">מחיקה</button>');   // השורה שנפתחת מתחת להערה: שם · מועד מדויק
    list.innerHTML = ns.length ? ns.map((n) => '<div class="nitem' + (n.system ? ' sys' : '') + ' fold' + (n.has_image ? ' img' : '') + (sheet.nOpen.has(n.id) ? ' open' : '') + '" data-nid="' + n.id + '"' + (n.event_type ? ' data-ev="' + esc(n.event_type) + '"' : '') + (n.new_status ? ' data-st="' + esc(n.new_status) + '"' : '') + '>' +
      ('<div class="nrow"><div class="ntext' + (!n.has_image ? ' chips' : '') + '">' + (n.has_image ? '<a class="nimg" data-img="' + n.id + '"><div class="nload">טוען תמונה…</div></a>' : ((n.system && sysChips(n)) || '<span class="nch ' + (n.system ? 'nn' : 'nw') + '">' + noteTextHtml(n.body) + '</span>')) + (n.mail_id ? NARW + '<button type="button" class="nmail' + (n.mail_failed ? ' bad' + (n.mail_noaddr ? ' noacc' : '') : '') + '" data-mail="' + n.mail_id + '">' + (n.mail_failed ? icon('warn', 'i16') + 'המייל לא נשלח' : 'מייל') + '</button>' : '') + '</div></div><span class="nch nago"><span class="nagot" data-ts="' + esc(n.created_at) + '">' + agoText(n.created_at) + '</span></span><div class="nmeta"><div class="nmetai">' + meta(n) + '</div></div>') + '</div>').join('')
      : '<p class="mnone">עוד אין הערות. אפשר לרשום למעלה מה דיברתם, מה הוחלט ומה צריך לזכור, או לצרף צילום מסך משיחה</p>';
    list.querySelectorAll('[data-img]').forEach(loadNoteImg);
    noteFades();
  }
  /* הערת מערכת ארוכה היא שורה אחת שנגררת הצידה: דהייה בקצה שיש אחריו עוד תוכן (fl משמאל, fr מימין). בעברית scrollLeft שלילי */
  const noteFade = (el) => { const max = el.scrollWidth - el.clientWidth, x = Math.abs(el.scrollLeft); el.classList.toggle('fl', max > 1 && x < max - 1); el.classList.toggle('fr', x > 1); };
  const noteFades = () => document.querySelectorAll('#nList .ntext.chips').forEach(noteFade);
  $('#nList').addEventListener('scroll', (e) => { if (e.target.classList && e.target.classList.contains('chips')) noteFade(e.target); }, true);
  new ResizeObserver(noteFades).observe($('#nList'));   // גם כשהרשימה נחשפת או שרוחב הכרטיס משתנה
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', noteFades);   // הגופן משנה את רוחב הטקסט
  /* בעכבר אין גרירה מובנית: גוררים בעצמנו, וגרירה לא פותחת את ההערה. במגע הגלילה רגילה */
  { let drag = null, moved = false;
    $('#nList').addEventListener('pointerdown', (e) => { const el = e.pointerType === 'mouse' && e.button === 0 && e.target.closest('.ntext.chips'); moved = false; drag = el && el.scrollWidth > el.clientWidth + 1 ? { el, x: e.clientX, left: el.scrollLeft } : null; });
    window.addEventListener('pointermove', (e) => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) moved = true; if (moved) drag.el.scrollLeft = drag.left - dx; });
    window.addEventListener('pointerup', () => { drag = null; });
    $('#nList').addEventListener('click', (e) => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); } }, true);
  }
  /* תמונת ההערה נטענת רק כשרואים אותה (לא נכללת בטעינה הכללית) */
  async function loadNoteImg(a) {
    const id = a.dataset.img;
    try {
      const src = await noteImage(id); if (!a.isConnected) return;
      if (!src || !/^data:image\//.test(src)) { a.innerHTML = '<div class="nload">לא ניתן לטעון את התמונה (הקובץ לא נשמר תקין, אפשר להעלות מחדש)</div>'; return; }
      a.innerHTML = '<img alt="צילום מסך" loading="lazy" />'; const im = a.firstChild;
      im.src = src;
    } catch (e) { if (a.isConnected) a.innerHTML = '<div class="nload">לא ניתן לטעון את התמונה</div>'; }
  }
  /* צירוף תמונה: דחיסה בדפדפן (עד 1600px, JPEG) כדי שהשמירה תהיה קטנה ומהירה */
  let pendingImg = null;
  function setPending(src) {
    pendingImg = src || null;
    $('#nPrev').hidden = !pendingImg; $('#nText').hidden = !!pendingImg;
    if (pendingImg) $('#nPrevImg').src = pendingImg; else $('#nFile').value = '';
    syncNote();
  }
  function syncNote() {   // יש טקסט: כפתור שמירה במקום צירוף התמונה. השדה גדל עם הטקסט (עד max-height ב-CSS, ואז נגלל בתוכו)
    const ta = $('#nText'), has = !pendingImg && !!ta.value.trim();
    $('#nAttach').hidden = has; $('#nAdd').hidden = !has; autoGrow(ta);
  }
  function compressImage(file) {
    return new Promise((ok, no) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.74));
      };
      im.onerror = () => { URL.revokeObjectURL(url); no(new Error('bad image')); };
      im.src = url;
    });
  }
  async function takeFile(f) { if (!f || !/^image\//.test(f.type)) return; try { setPending(await compressImage(f)); } catch (e) { toast('לא ניתן לקרוא את התמונה'); return; } $('#nAdd').click(); }   // תמונה נשמרת מיד, בלי ללחוץ על הוספה
  $('#nAttach').addEventListener('click', () => $('#nFile').click());
  $('#nText').addEventListener('input', syncNote);
  $('#nAdd').addEventListener('mousedown', (e) => e.preventDefault());   // הפוקוס נשאר בשדה: המקלדת לא נסגרת והכפתור לא זז לפני הלחיצה
  $('#nFile').addEventListener('change', (e) => takeFile(e.target.files[0]));
  $('#nPrevX').addEventListener('click', () => setPending(null));
  $('#nText').addEventListener('paste', (e) => { const f = [...(e.clipboardData ? e.clipboardData.files : [])].find((x) => /^image\//.test(x.type)); if (f) { e.preventDefault(); takeFile(f); } });
  /* צופה התמונות: דפדוף בין צילומי המסך של המשתתף (החלקה או חצים), ולמעלה רק מועד ההעלאה בקטן */
  let gal = [], galI = 0;
  async function showGal(i) {
    galI = Math.max(0, Math.min(gal.length - 1, i)); const n = gal[galI]; if (!n) return;
    $('#iDate').textContent = fmtDT(n.created_at);
    $('#iPrev').hidden = galI === 0; $('#iNext').hidden = galI === gal.length - 1;
    $('#iPrev').style.visibility = $('#iNext').style.visibility = gal.length > 1 ? '' : 'hidden';
    try { await noteImage(n.id); } catch (e) {}
    if (gal[galI] === n) $('#iImg').src = imgCache.get(n.id) || '';
  }
  $('#nList').addEventListener('click', (e) => {   // לחיצה על שורת הטקסט של הערה פותחת / סוגרת את שורת מי כתב ומתי (באנימציה)
    { const ml = e.target.closest('[data-mail]'); if (ml) { openMail(ml.dataset.mail); return; } }
    const it = e.target.closest('.nitem.fold');
    if (it && !e.target.closest('[data-del], a, button')) { const on = !it.classList.contains('open'); it.classList.toggle('open', on); if (sheet) { sheet.nOpen = sheet.nOpen || new Set(); on ? sheet.nOpen.add(it.dataset.nid) : sheet.nOpen.delete(it.dataset.nid); } return; }
    const a = e.target.closest('[data-img] img'); if (!a) return;
    const id = a.closest('[data-img]').dataset.img, p = sheet && sheet.id ? partOf(sheet.id) : null;
    gal = p ? notesOf(p.id).filter((n) => n.has_image) : []; const i = gal.findIndex((n) => n.id === id);
    if (i < 0) { $('#iImg').src = a.src; $('#iDate').textContent = ''; $('#iPrev').hidden = $('#iNext').hidden = true; } else { $('#iImg').src = a.src; showGal(i); }
    $('#iDlg').showModal();
  });
  $('#iPrev').addEventListener('click', () => showGal(galI - 1));
  $('#iNext').addEventListener('click', () => showGal(galI + 1));
  (function () {
    const w = $('#iWrap'); let x0 = 0, y0 = 0;
    w.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    w.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showGal(dx < 0 ? galI + 1 : galI - 1);
    }, { passive: true });
  })();
  document.addEventListener('keydown', (e) => { if ($('#iDlg').open && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) showGal(e.key === 'ArrowLeft' ? galI + 1 : galI - 1); });
  $('#nAdd').addEventListener('click', async () => {
    if (!sheet || !sheet.id) return;
    const ta = $('#nText'), body = pendingImg ? '' : ta.value.trim(); if (!body && !pendingImg) { ta.focus(); return; }
    const btn = $('#nAdd'); btn.disabled = true;
    try {
      const [row] = await api(T.n, { method: 'POST', body: Object.assign({ participant_id: sheet.id, body, author_email: emailOf(), author_name: senderName() }, pendingImg ? { image: pendingImg } : {}), prefer: 'return=representation' });
      if (row) { if (row.image) { imgCache.set(row.id, row.image); imgDB.set(row.id, row.image); delete row.image; row.has_image = true; } if (!state.notes.some((x) => x.id === row.id)) state.notes.push(row); }
      rebuildNotes(); ta.value = ''; setPending(null); renderNotes(); render(); ta.blur(); toast('ההערה נשמרה');   // אחרי השמירה המקלדת נסגרת
    } catch (err) { fail(err); }
    btn.disabled = false;
  });
  $('#nList').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-del]'); if (!d) return;
    const id = d.dataset.del, prev = state.notes;   // no question: the delete is recoverable, the undo toast (admin-kit.js) is the way back
    state.notes = state.notes.filter((n) => n.id !== id); rebuildNotes(); renderNotes(); render();
    try { await api(T.n + '?id=eq.' + id, { method: 'DELETE' }); } catch (err) { state.notes = prev; rebuildNotes(); renderNotes(); render(); fail(err); }
  });

  /* מסך אחד: ראשי (וואטסאפ וחיוג, מפגשים אחרונים, הערות) או פרטים (אייקון בכותרת; חץ חזרה בתוכו) */
  let pTab = 'main';
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SUBVIEW = { deposit: 'קבלת תשלום', pay: 'תשלום למפגש', promoter: 'שיווק ממומן', refund: 'ביטול תשלום', credit: 'החזרת קרדיט', zikuy: 'זיכוי' };
  let viewStack = [], payCtx = null;
  function setPTab(tab, instant) {
    if ((tab === 'info' || tab === 'wallet') && sheet && sheet.id) PG.mark(tab === 'info' ? 3 : 1);   // פרטים וקרדיט הם דפים בפייג'ר
    if (tab === 'info' || tab === 'wallet' || !sheet || !sheet.id) tab = 'main';   // משתתף חדש: רק דף הפרטים (newp)
    const prev = pTab; pTab = tab; paintMailTheme();
    document.querySelectorAll('#pDlg [data-panel]').forEach((d) => {
      const show = d.dataset.panel === tab; d.hidden = !show;
      d.classList.remove('enter-l', 'enter-r');
      if (show && !instant && prev !== tab && !reducedMotion()) { void d.offsetWidth; d.classList.add(tab === 'main' ? 'enter-r' : 'enter-l'); }
    });
    const ex = !!(sheet && sheet.id);
    $('#pDlg').classList.toggle('newp', !ex);
    { const pp0 = ex && partOf(sheet.id), tl = pp0 && telLink(pp0.phone), ca = $('#pCall'); ca.hidden = !(tab === 'main' && tl); if (tl) ca.href = tl; }   // חיוג: בשורת הכפתורים בכל דפי הכרטיס
    $('#pBack').hidden = !(ex && tab !== 'main'); if (tab !== 'deposit') { const c1 = $('#pAllocChip'); if (c1) c1.hidden = true; } repaintTitle(); $('#pTitle').classList.remove('tap'); $('#pTitle').tabIndex = -1; $('#pTitle').setAttribute('role', 'heading'); $('#pMsgs').hidden = tab !== 'main';
    { const sub = (tab === 'deposit' && sheet && sheet.depMid) ? 'תשלום' : SUBVIEW[tab], pp0 = ex ? partOf(sheet.id) : null;
      const allocScr = tab === 'deposit' && sheet && sheet.depMid, pm = sub && state.meetings.find((x) => x.id === (allocScr ? sheet.depMid : payCtx && payCtx.mid));
      $('#pSub').hidden = !(sub && pm);
      if (sub) { $('#pTitle').innerHTML = esc(sub) + (pp0 ? ' <span class="tsubname">· ' + esc(pp0.name) + '</span>' : ''); $('#pSub').innerHTML = !pm ? '' : allocScr ? esc(meetingLabel(pm, true)) : esc(meetingLabel(pm, true)); }   // מסך ההקצאה: "<יום תאריך שעה>" (בלי שם המפגש) בטקסט קטן מתחת לכותרת, מיושר אליה וצמוד אליה   // שם המשתתף ליד הכותרת
      else if (ex) setTitle(pp0); }
    if (tab === 'main') { renderContact(); renderNotes(); renderWallet(); pgApply(); }
    navSync($('#pDlg'));
    syncUrl();
  }
  pForm.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name && e.target.name.startsWith('pay_')) { e.preventDefault(); if (pTab === 'zikuy') $('#zkCredit').click(); else if (pTab === 'pay') $('#paySave').click(); else if (pTab === 'deposit') $('#depSave').click(); } });
  /* קרדיט ותשלומים: התשלומים נפרדים מהמפגשים. כל תשלום שמתקבל נכנס לקרדיט של המשתתף, ובשיוך למפגש לוקחים ממנה */
  /* כסף שהוקצה למפגש מסוים: תשלומים למפגש פחות ביטולים והחזרים של אותו מפגש (בלי קשר לתגית) */
  const allocatedOf = (pid, mid) => state.payments.filter((x) => x.participant_id === pid && x.meeting_id === mid).reduce((s, x) => s + (x.kind === 'payment' ? Number(x.amount) : (x.kind === 'credit' || (x.kind === 'refund' && !x.from_credit)) ? -Number(x.amount) : 0), 0);
  const owedOf = () => 0;   // תגית לא יוצר חוב: הקרדיט נקבעת רק מרשומות התשלומים
  state.payMethods = [{ key: 'paybox', name: 'פייבוקס' }, { key: 'bit', name: 'ביט' }, { key: 'cash', name: 'מזומן' }, { key: 'bank', name: 'בנק' }];   // דרכי תשלום: ניתנות להגדרה בהגדרות ← דרכי תשלום
  const METHODS = { paybox: 'פייבוקס', bit: 'ביט', cash: 'מזומן', bank: 'בנק' };   // ברירת מחדל ושמות לתשלומים ישנים
  const methodName = (x) => x.method === 'other' ? (x.method_note || 'אחר') : ((state.payMethods.find((m) => m.key === x.method) || {}).name || METHODS[x.method] || '');
  function renderWallet() {
    const pid = sheet && sheet.id; if (!pid) return;
    const bal = creditOf(pid), owed = owedOf(pid);
    { const pays = state.payments.filter((x) => x.participant_id === pid), inn = pays.filter((x) => (x.kind === 'payment' || x.kind === 'deposit') && !x.from_credit).reduce((s, x) => s + Number(x.amount), 0), out = pays.filter((x) => x.kind === 'refund').reduce((s, x) => s + Number(x.amount), 0);
      $('#walSum').innerHTML = UI.metric('שילם בסך הכול', '<bdi dir="ltr">₪' + nfm(inn - out) + '</bdi>', { tone: 'pos', sub: out > 0 ? 'אחרי החזרים של ₪' + nfm(out) : '' }) + UI.metric('קרדיט', '<bdi dir="ltr">₪' + nfm(bal) + '</bdi>', { tone: (bal > 0 || pkgLeft(pid) > 0) ? 'yel' : bal < 0 ? 'neg' : 'mut', sub: pkgLeft(pid) > 0 ? pkgLeft(pid) + ' מפגשים · ₪' + nfm(pkgUnit(pid)) + ' למפגש' : '' }); }
    $('#walRefund').hidden = !(bal > 0 || pkgLeft(pid) > 0);
        $('#walZikuy').hidden = true;   // בארנק רק קבלת כסף או החזרת כסף; אין זיכוי (ביטול הקצאה למפגש נעשה במסך התשלום למפגש)
    const mlabel = (x) => { const m = meetOf(x.meeting_id); return m ? ' ' + dm(m) : ''; };
    const rows = state.payments.filter((x) => x.participant_id === pid && x.kind !== 'credit').slice().sort(newestFirst).flatMap((x) => {
      const a = Number(x.amount), mt = methodName(x); let lab, cls, sign;
      if (x.kind === 'deposit') { lab = 'קבלת תשלום' + (x.pkg_n > 0 ? ' · כרטיסייה ' + x.pkg_n + ' מפגשים' : '') + (mt ? ' · ' + mt : ''); cls = 'up'; sign = ''; }
      else if (x.kind === 'credit') { lab = 'ביטול מפגש' + mlabel(x) + ', נשאר בקרדיט'; cls = 'up'; sign = ''; }
      else if (x.kind === 'payment') { lab = 'הקצאה למפגש' + mlabel(x) + (x.pkg ? ' · מהכרטיסייה' : ''); cls = 'flat'; sign = ''; }
      else if (x.kind === 'refund' && x.from_credit) { lab = 'החזרת כסף' + (x.pkg && x.pkg_n > 0 ? ' · כרטיסייה ' + x.pkg_n + ' מפגשים' : '') + (mt ? ' · ' + mt : ''); cls = 'down'; sign = ''; }
      else { lab = 'החזרת כסף למפגש' + mlabel(x); cls = 'flat'; sign = ''; }
      const rc = x.kind === 'deposit' ? ' rcpt' : (x.kind === 'credit' || x.kind === 'refund') ? ' rfnd' : x.kind === 'payment' ? ' balmv' : '';   // קבלה בירוק, זיכוי/החזר באדום
      const row = (lb, c, cl, tm) => ({ t: String(tm || x.created_at), h: '<div class="walrow' + c + '"><div class="wl"><b>' + esc(lb) + '</b><small>' + fmtDT(tm || x.created_at) + (x.author_name ? ' · ' + esc(noteAuthor(x.author_email, x.author_name)) : '') + '</small></div><span class="wamt ' + cl + '"><bdi dir="ltr">' + sign + '₪' + nfm(a) + '</bdi></span></div>' });
      if (x.kind === 'deposit' && String(x.reason || '').startsWith('alloc_removed')) return [row('קבלת תשלום' + (mt ? ' · ' + mt : ''), ' rcpt', 'up')];   // הקצאה שנמחקה לא מוצגת (לא ההקצאה ולא המחיקה); נשאר רק התשלום שהתקבל
      if (x.kind === 'payment' && !x.from_credit) return [row('הקצאה למפגש' + mlabel(x), ' balmv', 'flat'), row('קבלת תשלום' + (mt ? ' · ' + mt : ''), ' rcpt', 'up')];   // תשלום ישיר למפגש = שתי שורות: קבלת הכסף (ירוק) וההקצאה (כתום)
      return [row(lab, rc, cls)];
    });
    rows.sort((p1, p2) => p2.t.localeCompare(p1.t));   // מהחדש לישן (שורות עם אותו מועד נשארות בסדר: מחיקה, הקצאה, קבלה)
    $('#walHist').innerHTML = rows.map((r) => r.h).join('');   // בלי הודעת "עוד אין תשלומים": בלי תשלומים ההיסטוריה פשוט ריקה
  }
  
  /* צ'יפ מצב המפגש בכותרת (במסך ההקצאה): תפריט של מערכת ההפעלה (select שקוף מעל הצ'יף, נבנה ב-paintDepLines). האפשרות הראשונה היא המצב הנוכחי, והשאר פעולות עם פופאפ אישור בהתאם */
  $('#pAllocChip').addEventListener('change', (e) => {
    const sel = e.target.closest('select'); if (!sel || !sheet || !sheet.id || !sheet.depMid || !sheet.modeApi) return;
    const to = sel.value; sel.selectedIndex = -1; if (!to) return;
    const mapi = sheet.modeApi, pid = sheet.id, mid = sheet.depMid;
    if (to === 'close') {   // סגירת תשלום: ההקצאה נמוכה מעלות הכרטיס, ומה שנשאר לשלם נמחק: המפגש נחשב שולם
      const cl = linkOf(pid, mid), ca = Math.round(allocatedOf(pid, mid) * 100) / 100, cd = dueOf(pid, mid);
      const closeNote = async (amount) => { try { const [nr] = await api(T.n, { method: 'POST', body: { participant_id: pid, body: 'נסגר התשלום, בלי ₪' + amount + ' שנשארו לשלם', system: true, event_type: 'payment_closed', meeting_id: mid, amount, author_email: emailOf(), author_name: senderName() }, prefer: 'return=representation' }); if (nr && !state.notes.some((x) => x.id === nr.id)) { state.notes.push(nr); rebuildNotes(); } } catch (e0) { console.error(e0); } };   // התשלום נסגר גם אם ההערה לא נשמרה
      confirmAct('לסגור את התשלום?', pid, mid, async () => {
        try {
          await api(T.a + attQs(pid, mid), { method: 'PATCH', body: { pay_due_amount: null } });
          if (cl) cl.pay_due_amount = null;
          await closeNote(cd);
          offerCloseMail(pid, mid);   // לא נשלח מייל אוטומטית: פופאפ שואל איך לשלוח (מייל או וואטסאפ)
          toast('התשלום נסגר'); closePayCard(); refreshOpenSheet(); render();
        } catch (e) { fail(e); }
      }, 'שולמו <b>' + ils(ca) + '</b>. <b>' + ils(cd) + '</b> שנשארו לשלם יימחקו, והמפגש ייחשב כשולם.' + (isPast(meetOf(mid) || {}) ? '' : ' אחר כך תישאלו אם לשלוח למשתתף אישור (מייל או וואטסאפ).'), 'כן, לסגור את התשלום', null, { green: true });
      return;
    }
    if (to === 'del') {   // מחיקת הקצאה: אותו תהליך כמו במעבר ללא לתשלום (הכסף נשאר בקרדיט של המשתתף), בלי לסמן לא לתשלום
      const al0 = Math.round(allocatedOf(pid, mid) * 100) / 100;
      confirmAct('להעביר את ההקצאה לקרדיט?', pid, mid, () => mapi.del(), '<b>' + ils(al0) + '</b> שמוקצים למפגש יוסרו ממנו ויעברו כזיכוי לקרדיט של המשתתף, ואפשר יהיה להקצות אותם למפגש אחר או להחזיר אותם ככסף. לא מוחזר כסף עכשיו.', 'כן, העברת הסכום לקרדיט', null, { yellow: true });
      return;
    }
    if (to === 'later') {   // תשלום בהמשך: תמיד סוגרים את מחיר הכרטיס של המשתתף למפגש, והמנהל קובע כמה (ברירת מחדל: המחיר הנוכחי). נשאר גם אם המדרגות עולות
      const m0 = meetOf(mid), cur = m0 ? Math.round(defaultPrice(m0)) : 0, dlg = $('#lockDlg'), inp = $('#lockPrice');
      $('#lockText').innerHTML = nameB(partOf(pid) ? partOf(pid).name : '') + ' · ' + esc(m0 ? meetingLabel(m0, true) : '') + '<br>המחיר שתקבעו הוא מחיר הכרטיס של המשתתף למפגש הזה, וישאר כך גם אם המחיר יעלה לפני התשלום.';
      inp.value = cur > 0 ? String(cur) : ''; $('#lockErr').hidden = true;
      const go = () => { const v = Math.round(Number(inp.value)); if (!(v > 0)) { $('#lockErr').hidden = false; return; } dlg.close(); setPayLater(true, v).then(() => { offerCloseMail(sheet && sheet.id, mid); closePayCard(); }); };
      $('#lockYes').onclick = go; inp.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); go(); } };
      dlg.showModal();
      return;
    }
    if (to === 'unlater') { setPayLater(false); return; }
    if ((to === 'free') === mapi.free()) return;
    if (to === 'free') mapi.go('free').then(closePayCard); else mapi.go('pay');
  });
  /* קבלת תשלום: מהארנק (כללי) או מתוך מפגש (סמל ה-₪ ברשימה): אז הסכום המוצע הוא מחיר המפגש, ואפשר לשלם על כמה מפגשים (חבילה: הסכום מתחלק, והמפגש הזה ועוד קרובים שמשויכים אליהם נפרעים מיד) */
  /* כפתור ₪ של מפגש: בכל מצב (שולם, לתשלום, לא לתשלום) פותח את מסך התשלום של המפגש */
  function openPayFor(pid, mid) {
    openAllocPop(pid, mid);   // פופאפ הקצאה שעולה מלמטה (אין יותר מסך הקצאה בתוך הכרטיס ואין לו כתובת)
  }
  /* הקצאות הכסף למפגש (מסך התשלום למפגש): כל תשלום שמוקצה למפגש הוא שורה: מהקרדיט או בדרך העברה, עם סכום שאפשר לשנות ו-× להסרה. זיכוי והחזר מוצגים כשורות מידע */
  function paintDepLines() {
    const box = $('#depLines'), pid = sheet && sheet.id, m = sheet && sheet.depMid ? meetOf(sheet.depMid) : null;
    if (!box) return; if (!m || !pid) { box.hidden = true; box.innerHTML = ''; { const c0 = $('#pAllocChip'); if (c0) c0.hidden = true; } return; }
    const al = Math.round(allocatedOf(pid, m.id) * 100) / 100, chip = $('#pAllocChip');
    if (chip) {   // צ'יפ מצב המפגש בכותרת: הסכום המוקצה, או "לא לתשלום", או "לתשלום"; לחיצה פותחת בחירה בין לתשלום ללא לתשלום
      const fr = !!(linkOf(pid, m.id) && noPayOf(null, linkOf(pid, m.id)));
      chip.hidden = false; const lt = laterOf(pid, m.id), closed = al > 0 && !(dueOf(pid, m.id) > 0); chip.classList.toggle('free', fr && !(al > 0)); chip.classList.toggle('topay', !fr && !(al > 0) && !lt); chip.classList.toggle('later', lt);
            const opts = [].concat(!fr && al > 0 && dueOf(pid, m.id) > 0 ? [['close', 'סגירת תשלום']] : [], fr ? [['pay', 'לתשלום']] : [], lt ? [['unlater', 'לתשלום']] : !fr && !closed ? [['later', 'תשלום בהמשך']] : [], !fr && al > 0 ? [['del', 'מחיקת הקצאה']] : [], fr || al > 0 ? [] : [['free', 'לא לתשלום']]);   // בלי המצב הנוכחי: הוא כתוב על הכפתור
      const chipH = (al > 0 ? '₪' + nfm(al) : fr ? 'לא לתשלום' : lt ? 'בהמשך ₪' + nfm(dueOf(pid, m.id) > 0 ? dueOf(pid, m.id) : defaultPrice(m)) : 'לתשלום') + icon('chev', 'i14') + '<select data-rf-bare aria-label="מצב המפגש">' + opts.map((o) => '<option value="' + o[0] + '">' + esc(o[1]) + '</option>').join('') + '</select>';
      if (chip.dataset.h !== chipH) { chip.innerHTML = chipH; chip.dataset.h = chipH; }   // בלי ציור מחדש כשאין שינוי: עדכון בזמן אמת לא יסגור תפריט פתוח
      { const cs = chip.querySelector('select'); if (document.activeElement !== cs) cs.selectedIndex = -1; }   // אף אפשרות לא נבחרת מראש, כך שגם בחירה באפשרות היחידה נקלטת
      chip.title = 'מצב המפגש';
    }
    box.hidden = true; box.innerHTML = ''; return;   // בלי שורת הקצאה בתחתית: הסכום המוקצה מוצג רק בצ'יפ שבכותרת
    box.hidden = false;
    /* בהקצאות רק כמה כסף מוקצה למפגש (המקור, זיכויים והחזרים נמצאים ב"קרדיט ותשלומים"); אפשר לשנות את הסכום או להסיר */
    const inp = box.querySelector('input'), same = inp && document.activeElement === inp;
    if (same) return;   // לא מציירים מחדש תיבה שמקלידים בה
    box.innerHTML = '<div class="dlt">הקצאה למפגש</div><div class="dline" data-total="1"><span class="dsrc">מוקצה למפגש</span><input data-rf-bare type="number" inputmode="decimal" min="0" step="any" value="' + al + '" aria-label="סכום מוקצה"><button type="button" class="ddel" aria-label="הסרת ההקצאה">×</button></div>';
  }
  const depLinesRefresh = () => { paintDepLines(); if (sheet && sheet.paintMeth) sheet.paintMeth(); renderContact(); refreshSheetMeetings(); render(); };   // אחרי כל שינוי: גם אפשרויות התשלום מתעדכנות (נגמרה הקרדיט: נפתחות שאר הדרכים)
  /* הקטנת ההקצאה למפגש בסכום מסוים: מהקצאה האחרונה אחורה; כסף שהתקבל ישירות (פייבוקס, ביט...) נשאר למשתתף כקרדיט (הפקדה), והקצאה מהקרדיט חוזרת לקרדיט */
  async function reduceAlloc(pid, mid, amount) {
    let rem = amount;
    const rows = state.payments.filter((x) => x.participant_id === pid && x.meeting_id === mid && x.kind === 'payment').sort(newestFirst);
    for (const r of rows) {
      if (rem <= 0.001) break;
      const a = Number(r.amount);
      if (a <= rem + 0.001) { await removeAlloc(r); rem -= a; }
      else {
        if (!r.from_credit) await addPayRecord(pid, null, 'deposit', rem, r.promoter_id || null, null, false, r.method || null, r.method_note || null, { reason: 'alloc_removed:' + (r.meeting_id || '') + ':' + new Date().toISOString(), created_at: r.created_at });
        await api(T.pay + '?id=eq.' + r.id, { method: 'PATCH', body: { amount: a - rem } }); r.amount = a - rem; rem = 0;
      }
    }
  }
  $('#depLines').addEventListener('change', async (e) => {
    const inp = e.target.closest('input'); if (!inp) return;
    const pid = sheet && sheet.id, mid = sheet && sheet.depMid; if (!pid || !mid) return;
    const cur = Math.round(allocatedOf(pid, mid) * 100) / 100, amt = parseFloat(inp.value);
    if (!(amt >= 0)) { inp.value = cur; return; }
    const delta = Math.round((amt - cur) * 100) / 100;
    if (!delta) return;
    sheet.depLock = Date.now() + 60000;
    try {
      if (delta < 0) { await reduceAlloc(pid, mid, -delta); toast('ההקצאה עודכנה, ההפרש נשאר בקרדיט'); }
      else {
        if (delta > Math.max(0, creditOf(pid)) + 0.001) { toast('אין מספיק קרדיט להגדלת ההקצאה'); inp.value = cur; return; }
        await addPayRecord(pid, mid, 'payment', delta, null, null, true); toast('ההקצאה עודכנה');
      }
      depLinesRefresh();
    } catch (err) { inp.value = cur; fail(err); }
    finally { sheet.depLock = Date.now() + 1500; setTimeout(refreshOpenSheet, 1600); }
  });
  $('#depLines').addEventListener('click', async (e) => {
    const b = e.target.closest('.ddel'); if (!b) return;
    const pid = sheet && sheet.id, mid = sheet && sheet.depMid; if (!pid || !mid) return;
    sheet.depLock = Date.now() + 60000;
    try {
      const cur = Math.round(allocatedOf(pid, mid) * 100) / 100;
      await reduceAlloc(pid, mid, cur);
      toast('ההקצאה הוסרה והכסף נשאר בקרדיט'); depLinesRefresh();
    } catch (err) { fail(err); }
    finally { sheet.depLock = Date.now() + 1500; setTimeout(refreshOpenSheet, 1600); }
  });
  async function removeAlloc(row) {
    {
      // תשלום ישיר בדרך העברה: הכסף כבר התקבל, ולכן מסירים רק את ההקצאה למפגש והכסף נשאר בקרדיט (הפקדה באותו סכום ודרך העברה, עם אותה עמלה); הקצאה מהקרדיט פשוט חוזרת לקרדיט
      if (!row.from_credit) await addPayRecord(row.participant_id, null, 'deposit', Number(row.amount), row.promoter_id || null, row.commission != null ? Number(row.commission) : null, false, row.method || null, row.method_note || null, { reason: 'alloc_removed:' + (row.meeting_id || '') + ':' + new Date().toISOString(), created_at: row.created_at });
      payTomb.set(row.id, Date.now() + 8000);
      await api(T.pay + '?id=eq.' + row.id, { method: 'DELETE' }); state.payments = state.payments.filter((x) => x.id !== row.id);
    }
  }
  function openDeposit(mid) {
    const f = pForm, pid = sheet && sheet.id, m = mid ? meetOf(mid) : null;
    sheet.depMid = m ? m.id : null; sheet.depPk = false; sheet.depPkAuto = false; sheet.depCr = false; sheet.depTyped = false; sheet.allocEdit = false;   // depCr: תשלום מהקרדיט (בלי קבלת כסף חדש)
    f.pay_pkg.value = ''; $('#depPkgHint').textContent = ''; f.pay_depm.value = 'paybox'; f.pay_depn.value = ''; $('#depOtherField').hidden = true;
    { const al = m ? Math.max(0, allocatedOf(pid, m.id)) : 0, pr0 = m ? expectedPrice(pid, m) : 0; f.pay_dep.value = !m ? '' : al <= 0 ? pr0 : al < pr0 ? pr0 - al : ''; }   // מפגש ששולם חלקית: המוצע הוא הקרדיט
    { const pp = partOf(pid), lk = m && linkOf(pid, m.id), np = !!(m && pp && noPayOf(pp, lk)); $('#depFields').hidden = np; $('#depFree').hidden = !np; }
    { f.pay_dep.closest('label').querySelector('span').textContent = 'סכום'; $('#depSave').textContent = 'תשלום'; $('#depAddTitle').hidden = !m; paintDepLines(); }
    $('#depQuick').innerHTML = quickPrices(m).map((v) => '<button type="button" data-q="' + v + '">' + v + ' ₪</button>').join('');
    /* כרטיסיות שהוגדרו בסוג המפגש (בקבלת תשלום מתוך מפגש: של סוג המפגש; בלי מפגש: של כל הסוגים): בחירה ממלאת סכום ומספר מפגשים, והתשלום נרשם כהפקדה עם pkg_n (חבילה) */
    { const ts = (m && typeById(m.type_id) ? [typeById(m.type_id)] : state.mtypes).filter((t) => Array.isArray(t.passes) && t.passes.length), box = $('#depPasses');
      box.hidden = !ts.length; sheet.depPass = null;
      box.innerHTML = ts.flatMap((t) => t.passes.map((x) => '<button type="button" data-pn="' + x.n + '" data-pp="' + x.price + '" data-pt="' + t.id + '">כרטיסייה ' + x.n + ' מפגשים · ' + nfm(x.price) + ' ₪' + (state.mtypes.length > 1 && !m ? ' · ' + esc(t.name || '') : '') + '</button>')).join('');
      box.onclick = (e) => { const b = e.target.closest('[data-pn]'); if (!b) return; const on = !b.classList.contains('on'); box.querySelectorAll('.on').forEach((x) => x.classList.remove('on'));
        if (on) { b.classList.add('on'); sheet.depPass = { n: Number(b.dataset.pn), type: b.dataset.pt }; f.pay_dep.value = b.dataset.pp; f.pay_pkg.value = String(sheet.depPass.n); }
        else { sheet.depPass = null; f.pay_pkg.value = ''; }
        sheet.depTyped = true; paintPkg(); syncDepSave(); }; }
    $('#depQuick').onclick = (e) => { const b = e.target.closest('[data-q]'); if (b) { f.pay_dep.value = b.dataset.q; paintPkg(); } };
    f.pay_depm.innerHTML = payMethodOpts() + '<option value="other">אחר</option>'; f.pay_depm.value = state.payMethods.length ? state.payMethods[0].key : 'other';
    const isFree = () => { const pp = partOf(pid), lk = m && linkOf(pid, m.id); return !!(m && pp && lk && noPayOf(pp, lk)); };
    const crAvail = () => m ? Math.max(0, creditOf(pid)) : 0;
    const needNow = () => oweOf(pid, m) || expectedPrice(pid, m);
    /* "לא לתשלום" הוא האפשרות הראשונה (מימין) בשורת דרכי התשלום: נבחרת = המפגש לא לתשלום ולמטה אין שדות; בחירה בדרך תשלום מבטלת אותה */
    /* כפתור "תשלום" כבוי כשבוחרים "מהקרדיט" והסכום גדול מהקרדיט הזמינה */
    const syncDepSave = () => { const b = $('#depSave'); if (!b) return; const fc = !!(sheet && sheet.depCr && sheet.depMid); b.classList.toggle('fromcr', fc); const a = parseFloat(f.pay_dep.value); b.disabled = !!(sheet && sheet.depCr && sheet.depMid && !sheet.depPk && a > Math.max(0, creditOf(pid)) + 0.001); };
    const paintMeth = () => {
      queueMicrotask(syncDepSave);
      paintDepLines();
      const free = isFree(), hasPk = !!(m && pkgLeft(pid) > 0 && pkgUnit(pid) > 0), hasCr = !!(m && crAvail() > 0), cr0 = hasPk || hasCr;
      $('#depMode').hidden = true; $('#depMode').innerHTML = '';   // בורר "לתשלום / לא לתשלום" הוסר: לא לתשלום הוא הצ'יפ הראשון בשורת דרכי התשלום
      $('#depAddTitle').hidden = !m;
      $('#depFree').hidden = true;
      $('#depFields').hidden = free;
      const pkgF = $('#depPkgSel').closest('.field');
      if (free) { $('#depMethods').innerHTML = ''; return; }   // במצב לא לתשלום אין כלום מתחת; חוזרים ל"לתשלום" דרך הצ'יפ
      $('#depQuick').hidden = false;
      const hasPasses = !!$('#depPasses').querySelector('[data-pn]');
      $('#depPasses').hidden = !hasPasses || cr0;   // תשלום מהקרדיט או מהכרטיסייה: הצעות מחיר וכרטיסיות לא רלוונטיות
      if (cr0) { $('#depQuick').hidden = true; }
      if (cr0) {   // יש קרדיט: קודם כל משתמשים בה (אפשר להקצות רק חלק ממנה); שאר דרכי התשלום נפתחות כשהקרדיט נגמרת
        sheet.depCr = !free;
        if (!hasPk) sheet.depPk = false; else if (!sheet.depPkAuto) { sheet.depPk = true; sheet.depPkAuto = true; }   // יש כרטיסייה: ברירת המחדל לנצל ממנה
        $('#depMethods').innerHTML = ''; $('#depMSel').innerHTML = (hasPk ? '<option value="__pk">מהכרטיסייה (נשארו ' + pkgLeft(pid) + ' מפגשים)</option>' : '') + (hasCr ? '<option value="__cr">מהקרדיט ₪' + nfm(crAvail()) + '</option>' : ''); $('#depMSel').value = sheet.depPk ? '__pk' : '__cr';
        pkgF.hidden = true; $('#depOtherField').hidden = true;
        if (sheet.depPk) { f.pay_dep.value = pkgUnit(pid); f.pay_dep.removeAttribute('max'); queueMicrotask(syncDepSave); return; }
        { const cv = parseFloat(f.pay_dep.value); if (!free && (!(cv > 0) || (cv > crAvail() + 0.001 && !sheet.depTyped))) f.pay_dep.value = Math.min(needNow(), crAvail()); }   // בתשלום מהקרדיט הסכום המוצע לא עולה על הקרדיט (גם אם המחיר גבוה ממנה)
        f.pay_dep.max = String(crAvail()); return;
      }
      sheet.depCr = false; f.pay_dep.removeAttribute('max');
      $('#depMethods').innerHTML = ''; $('#depMSel').innerHTML = payMethodOpts(); $('#depMSel').value = f.pay_depm.value;
      pkgF.hidden = false; $('#depOtherField').hidden = free || f.pay_depm.value !== 'other';
    };
    $('#depMSel').onchange = () => { const v = $('#depMSel').value; sheet.depPk = v === '__pk'; sheet.depPkAuto = true; if (v === '__pk') { f.pay_dep.value = pkgUnit(pid); sheet.depTyped = true; syncDepSave(); return; } if (v === '__cr') { f.pay_dep.value = Math.min(needNow(), crAvail()); syncDepSave(); return; } f.pay_depm.value = v; f.pay_depm.onchange(); };
    f.pay_depm.onchange = () => { $('#depOtherField').hidden = f.pay_depm.value !== 'other'; paintMeth(); if (f.pay_depm.value === 'other') f.pay_depn.focus(); };
    const switchLocked = async (md) => {
      sheet.depLock = Date.now() + 60000;   // נועל ציור מחדש מהזמן אמת עד שהמעבר מסתיים
      try { await modeSwitch(md); } finally { sheet.depLock = Date.now() + 1500; setTimeout(refreshOpenSheet, 1600); }
    };
    const modeSwitch = async (md) => {
      if (md === 'free') {   // לא לתשלום והקצאות לא יכולים להיות יחד: סימון לא לתשלום מסיר את ההקצאות (הכסף חוזר לקרדיט)
        sheet.depCr = false; if (isFree()) return;
        const rows = state.payments.filter((x) => x.participant_id === pid && x.meeting_id === m.id && x.kind === 'payment');
        try { for (const r of rows) await removeAlloc(r); } catch (err) { fail(err); }
        await setNoPay(true, paintMeth); depLinesRefresh();
        toast(rows.length ? 'המפגש סומן לא לתשלום, ההקצאות הוסרו והכסף נשאר בקרדיט' : 'המפגש סומן לא לתשלום');
        return;
      }
      if (isFree()) await setNoPay(false, paintMeth);
      f.pay_pkg.value = ''; $('#depPkgHint').textContent = '';
      f.pay_dep.value = crAvail() > 0 ? Math.min(needNow(), crAvail()) : needNow();
      paintMeth();
    };
    /* "לא לתשלום" הוא הצ'יפ הראשון (מימין) בשורת דרכי התשלום. לא לתשלום כשיש הקצאה: פופאפ אישור מחיקת ההקצאה; בחירה בדרך תשלום או ב"מהקרדיט" כשהמפגש לא לתשלום: פופאפ אישור ביטול לא לתשלום */
    const pickChoice = (b, cb) => {
      if (cb) { f.pay_dep.value = Math.min(needNow(), crAvail()); f.pay_pkg.value = ''; $('#depPkgHint').textContent = ''; paintMeth(); return; }
      f.pay_depm.value = b.dataset.m; f.pay_depm.onchange();
    };
    $('#depMethods').onclick = async (e) => {
      const fb = e.target.closest('[data-free]'), b = e.target.closest('[data-m]'), cb = e.target.closest('[data-cr]');
      if (fb) {
        if (isFree()) return;
        const al = Math.round(allocatedOf(pid, m.id) * 100) / 100;
        if (al > 0) confirmAct('לא לתשלום: להעביר את ההקצאה לקרדיט?', pid, m.id, () => switchLocked('free'), 'המפגש יסומן לא לתשלום. <b>' + ils(al) + '</b> שהוקצו אליו יוסרו ממנו ויעברו כזיכוי לקרדיט של המשתתף, ואפשר יהיה להקצות אותם למפגש אחר או להחזיר אותם ככסף. לא מוחזר כסף עכשיו.', 'כן, העברת הסכום לקרדיט', null, { yellow: true });
        else await switchLocked('free');
        return;
      }
      if (!b && !cb) return;
      if (isFree()) await switchLocked('pay');   // בחירה בדרך תשלום מבטלת את לא לתשלום (בלי פופאפ אישור)
      pickChoice(b, cb);
    };
    sheet.modeApi = { free: isFree, go: (md) => switchLocked(md), del: async () => {
      const sh = sheet;   // סגירת הפופאפ כשנפתח מהרשימה מאפסת את sheet
      sh.depLock = Date.now() + 60000;
      try { await reduceAlloc(pid, m.id, Math.max(0, Math.round(allocatedOf(pid, m.id) * 100) / 100)); toast('ההקצאה נמחקה והכסף נשאר בקרדיט'); sh.depTyped = false; pForm.pay_dep.value = ''; depLinesRefresh(); }   // הפופאפ נשאר פתוח: המפגש חוזר ללתשלום, והקרדיט מוצעת לתשלום
      catch (err) { fail(err); }
      finally { sh.depLock = Date.now() + 1500; setTimeout(refreshOpenSheet, 1600); }
    } };
    sheet.paintMeth = paintMeth; paintMeth();
    const paintPkg = () => { const n = parseInt(f.pay_pkg.value, 10), a = parseFloat(f.pay_dep.value); $('#depPkgHint').innerHTML = n >= 2 && a > 0 ? 'מחיר למפגש: <b>₪' + nfm(Math.round(a / n)) + '</b>. הסכום נרשם כהכנסה, והמשתתף מקבל <b>' + n + ' מפגשים</b> בקרדיט, בלי קרדיט כספי' : ''; };
    sheet.depTyped = false; f.pay_pkg.oninput = paintPkg; f.pay_dep.oninput = () => { sheet.depTyped = true; paintPkg(); syncDepSave(); };
    blurActive();   // בלי פוקוס אוטומטי: המקלדת לא עולה בכניסה למסך
  }
  $('#walAdd').addEventListener('click', () => { if (sheet && sheet.id) openAllocPop(sheet.id, null); });   // קבלת תשלום מהקרדיט והארנק: גם היא פופאפ מלמטה
  /* "לא משלם" לפי מפגש: עקיפה בשיוך למפגש (true/false), מעל ברירת המחדל של המשתתף */
  async function setNoPay(v, repaint) {
    const pid = sheet && sheet.id, mid = sheet && sheet.depMid, l = pid && mid && linkOf(pid, mid), pp = pid && partOf(pid); if (!l || !pp) return;
    const prevClosed = l.pay_closed_at || null, patch = v ? { no_pay: true, pay_later_at: null, pay_due_amount: null } : { no_pay: false, pay_closed_at: null }, before = Object.fromEntries(Object.keys(patch).map((k) => [k, l[k] ?? null])), h = pendBegin(pid, mid, patch); Object.assign(l, patch); $('#depFields').hidden = v; $('#depFree').hidden = !v; if (repaint) repaint(); render(); refreshSheetMeetings();
    try { await api(T.a + attQs(pid, mid), { method: 'PATCH', body: patch }); pendDone(h); toast(v ? 'המפגש לא לתשלום' : 'המפגש לתשלום');
      if (prevClosed) { try { const [nr] = await api(T.n, { method: 'POST', body: { participant_id: pid, body: 'התשלום נפתח מחדש', system: true, event_type: 'payment_reopened', meeting_id: mid, author_email: emailOf(), author_name: senderName() }, prefer: 'return=representation' }); if (nr && !state.notes.some((x) => x.id === nr.id)) { state.notes.push(nr); rebuildNotes(); renderNotes(); } } catch (e0) { console.error(e0); } } }
    catch (err) { pendFail(h); Object.assign(l, before); $('#depFields').hidden = !v; $('#depFree').hidden = v; if (repaint) repaint(); render(); refreshSheetMeetings(); fail(err); }
  }
  /* תשלום בהמשך: המשתתף משוריין למפגש, והתשלום נשאר פתוח. תשלום שמשלים את הכרטיס גובר עליו */
  async function setPayLater(on, lockPrice) {
    const pid = sheet && sheet.id, mid = sheet && sheet.depMid, l = pid && mid && linkOf(pid, mid); if (!l) return;
    const patch = on ? Object.assign({ pay_later_at: new Date().toISOString(), pay_reported_at: null, pay_reported_amount: null, pay_rejected_at: null }, lockPrice ? { ticket_price: lockPrice } : {}) : { pay_later_at: null, ticket_price: null }, prev = Object.fromEntries(Object.keys(patch).map((k) => [k, l[k] ?? null])), h = pendBegin(pid, mid, patch);
    Object.assign(l, patch); paintDepLines(); render(); refreshSheetMeetings();
    try { await api(T.a + attQs(pid, mid), { method: 'PATCH', body: patch }); pendDone(h); toast(on ? (lockPrice ? 'סומן: תשלום בהמשך, המחיר ננעל על ₪' + lockPrice : 'סומן: תשלום בהמשך') : 'המפגש לתשלום'); }
    catch (err) { pendFail(h); Object.assign(l, prev); paintDepLines(); render(); refreshSheetMeetings(); fail(err); }
  }
  /* אחרי שהתשלום נרשם הפופאפ (כרטיס המשתתף) נסגר, והרשימה מתעדכנת (31.10.26) */
  /* פופאפ הקצאה (#allocDlg, 1.11.26): דיאלוג נפרד שעולה מלמטה מעל כרטיס המשתתף הפתוח, בלי לגעת בכרטיס (או לבד כשנפתח מעיגול ה-₪ ברשימה). מסך ההקצאה הקיים (הפאנל, הצ'יף "הקצאה" והשורה השנייה עם המועד) עובר אליו פיזית בפתיחה וחוזר לכרטיס בסגירה, כך שיש מימוש אחד של מסך ההקצאה. גם בדסקטופ רחב (כרטיס בצד הרשימה); אין יותר מסך הקצאה בתוך הכרטיס ואין לו כתובת */
  const allocDlg = $('#allocDlg');
  let allocHome = null;
  function allocMount(key) {
    if (allocHome) return;
    key = key || 'deposit';
    const panel = pForm.querySelector('.ppanel[data-panel="' + key + '"]'), chip = $('#pAllocChip'), sub = $('#pSub'); if (!panel) return;
    allocHome = { key, panel, panelP: panel.parentNode, panelN: panel.nextSibling, chip, chipP: chip.parentNode, chipN: chip.nextSibling, sub, subP: sub.parentNode, subN: sub.nextSibling };
    $('#allocHead').appendChild(chip); $('#allocSheet').insertBefore(sub, $('#allocSlot')); $('#allocSlot').appendChild(panel); panel.hidden = false;
  }
  function allocUnmount() {
    if (!allocHome) return; const h = allocHome; allocHome = null;
    h.panel.hidden = true; h.panelP.insertBefore(h.panel, h.panelN); h.chipP.insertBefore(h.chip, h.chipN); h.subP.insertBefore(h.sub, h.subN); h.chip.hidden = true; h.sub.hidden = true; h.sub.classList.remove('bold');
  }
  function openAllocPop(pid, mid) {
    const pp = partOf(pid), m = mid ? meetOf(mid) : null; if (!pp || (mid && !m) || allocDlg.open) return;
    if (!(pDlg.open && sheet && sheet.id === pid)) { sheet = { id: pid, hl: state.filter || null }; pForm.reset(); }   // נפתח מהרשימה: רק מצב המשתתף, בלי להציג את הכרטיס
    allocMount(); openDeposit(m ? m.id : null);
    $('#allocTitle').innerHTML = (m ? 'תשלום' : 'קבלת תשלום') + ' <span class="tsubname">· ' + esc(pp.name) + '</span>';   // הכותרת כמו הכיתוב על הכפתור שפתח את הפופאפ
    { const sub = $('#pSub'); sub.innerHTML = m ? esc(meetingLabel(m, true)) : 'ללא קשר למפגש'; sub.classList.toggle('bold', !m); sub.hidden = false; }   // בלי מפגש: במקום המועד, מודגש
    allocDlg.showModal(); blurActive();
  }
  /* החזרת כסף מהקרדיט: אותו פופאפ, עם פאנל החזרת הכסף. הכותרת "החזרת כסף" (כמו הכפתור), ומתחתיה "ללא קשר למפגש" */
  function openRefundPop() {
    const pid = sheet && sheet.id, pp = partOf(pid); if (!pp || allocDlg.open) return;
    const cr = Math.max(0, creditOf(pid)), pl = Math.max(0, pkgLeft(pid)), unit = pl > 0 ? pkgUnit(pid) : 0; if (!(cr > 0) && !(pl > 0)) return;
    allocMount('credit'); $('#pAllocChip').hidden = true;
    $('#allocTitle').innerHTML = 'החזרת כסף <span class="tsubname">· ' + esc(pp.name) + '</span>';
    { const sub = $('#pSub'); sub.innerHTML = 'ללא קשר למפגש'; sub.classList.add('bold'); sub.hidden = false; }
    /* ברירת מחדל: כל מה שיש (כל המפגשים בכרטיסייה ואת כל הסכום: הקרדיט הכספי ועוד מפגשים כפול מחיר למפגש); המנהל קובע כמה להחזיר וכמה מפגשים לגרוע */
    $('#refundPkF').hidden = !(pl > 0); pForm.pay_refpk.value = pl > 0 ? pl : ''; pForm.pay_refpk.max = String(pl);
    pForm.pay_refund.value = Math.round((cr + pl * unit) * 100) / 100; pForm.pay_refund.removeAttribute('max'); payCtx = null; $('#refundMSel').innerHTML = payMethodOpts();
    const nOf = () => Math.max(0, parseInt(pForm.pay_refpk.value, 10) || 0);
    /* מפגשים שנגרעים: עד מה שנשאר. הסכום: חלק עבור המפגשים (עד מחירם) והשאר מהקרדיט הכספי, שלא יעלה על הקרדיט */
    const refundOk = () => { const a = parseFloat(pForm.pay_refund.value), n = nOf(), cur = Math.max(0, creditOf(pid)), pk = Math.max(0, pkgLeft(pid)); if (!(a > 0) || n > pk) return false; const rest = a - Math.min(a, n * (pk > 0 ? pkgUnit(pid) : 0)); return rest <= cur + 0.001; };
    sheet.refundSync = () => { $('#creditRefundBtn').disabled = !refundOk(); };
    pForm.pay_refund.oninput = pForm.pay_refpk.oninput = sheet.refundSync; sheet.refundSync();
    $('#creditRefundBtn').onclick = async () => {
      if (!refundOk()) return;
      const amt = parseFloat(pForm.pay_refund.value), n = nOf(), u = pkgLeft(pid) > 0 ? pkgUnit(pid) : 0, forPk = n > 0 ? Math.min(amt, n * u) : 0, rest = Math.round((amt - forPk) * 100) / 100, method = $('#refundMSel').value;
      try {
        if (n > 0 && forPk > 0) await addPayRecord(pid, null, 'refund', forPk, null, null, true, method, null, { pkg: true, pkg_n: n });
        else if (n > 0) await addPayRecord(pid, null, 'refund', amt, null, null, true, method, null, { pkg: true, pkg_n: n });
        if (rest > 0 && forPk > 0 || (n === 0 && rest > 0)) await addPayRecord(pid, null, 'refund', rest, null, null, true, method);
        toast('הוחזרו ₪' + nfm(amt) + ' למשתתף' + (n > 0 ? ' ונגרעו ' + n + ' מפגשים' : '')); allocDlg.close();
      } catch (err) { fail(err); }
    };
    allocDlg.showModal(); blurActive();
  }
  allocDlg.addEventListener('close', () => {
    allocUnmount();
    if (!sheet) return;
    sheet.depMid = null; sheet.modeApi = null; sheet.paintMeth = null; sheet.refundSync = null;
    if (pDlg.open) { refreshSheetMeetings(); renderNotes(); renderWallet(); } else { lastPid = sheet && sheet.id || null; sheet = null; markSel(); }   // נפתח מהרשימה: אין כרטיס מאחור
    render();
  });
  allocDlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name && e.target.name.startsWith('pay_')) { e.preventDefault(); if (allocHome && allocHome.key === 'credit') { if (!$('#creditRefundBtn').disabled) $('#creditRefundBtn').click(); } else $('#depSave').click(); } });
  const closePayCard = () => { if (allocDlg.open) allocDlg.close(); };   // אחרי תשלום מלא פופאפ התשלום נסגר, וכרטיס המשתתף (אם פתוח) נשאר כמו שהוא
  const depSaveRun = async (dueAmt) => {   // dueAmt: נשאר לשלם על המפגש
    const f = pForm, pid = sheet && sheet.id; const amt = parseFloat(f.pay_dep.value); if (!pid) return;
    const dueMeta = dueAmt > 0 ? { reason: 'partial_due:' + dueAmt } : null, setDue = (mid) => { const l = linkOf(pid, mid); if (l) { l.pay_due_amount = dueMeta ? dueAmt : null; l.pay_reported_at = null; l.pay_reported_amount = null; l.pay_rejected_at = null; } };   // תשלום נרשם: הדיווח מתבטל (גם בשרת, בטריגר)
    if (!(amt > 0)) { f.pay_dep.focus(); return; }
    const payDone = () => { sheet.depTyped = false; if (dueAmt > 0) { f.pay_dep.value = dueAmt; depLinesRefresh(); } else { f.pay_dep.value = ''; render(); closePayCard(); } };   // עדיין נשאר לשלם: הפופאפ נשאר פתוח, עם השארית כסכום המוצע
    if (sheet.depCr && sheet.depMid) {   // תשלום מהקרדיט: רשומת תשלום מהקרדיט (from_credit) למפגש, בלי הפקדה חדשה
      const use = sheet.depPk ? amt : Math.min(amt, Math.max(0, creditOf(pid)));
      if (!sheet.depPk && amt > Math.max(0, creditOf(pid)) + 0.001) { toast('אין מספיק קרדיט: הקרדיט ₪' + nfm(Math.max(0, creditOf(pid)))); return; }
      if (!(use > 0) || (sheet.depPk && !(pkgLeft(pid) > 0))) { toast(sheet.depPk ? 'אין מפגשים בכרטיסייה' : 'אין קרדיט לשימוש'); return; }
      try { await addPayRecord(pid, sheet.depMid, 'payment', use, null, null, true, null, null, sheet.depPk ? Object.assign({ pkg: true }, dueMeta || {}) : dueMeta); setDue(sheet.depMid); toast(sheet.depPk ? 'שולם מהכרטיסייה (נשארו ' + Math.max(0, pkgLeft(pid)) + ' מפגשים)' : 'שולם ₪' + nfm(use) + ' מהקרדיט'); sheet.depPk = false; sheet.depCr = false; payDone(); } catch (err) { fail(err); }
      return;
    }
    const p = partOf(pid), pr = p && channelOf(p);
    /* עמלה לשיווק ממומן: על התשלום הראשון של המשתתף (הפקדה או תשלום ישיר). דרך ההגעה גם כשהיא נגזרת מהקוד בקישור, ולא רק כשנבחרה ידנית */
    const isFirst = !state.payments.some((x) => x.participant_id === pid && (x.kind === 'deposit' || (x.kind === 'payment' && !x.from_credit && x.meeting_id)));
    const payCm = pr && (isFirst || commOnEvery(pr)), cm = payCm ? calcCommission(pr, amt) : null, method = f.pay_depm.value, mnote = method === 'other' ? f.pay_depn.value.trim().slice(0, 60) : '';
    const pk = parseInt(f.pay_pkg.value, 10), pkgMeta = pk >= 2 ? Object.assign({ pkg_n: pk }, sheet.depPass && sheet.depPass.n === pk ? { pass_type_id: sheet.depPass.type } : {}) : null;
    try {
      if (sheet.depMid && !pkgMeta) {   // תשלום ישיר למפגש בדרך העברה (בלי הפקדה לקרדיט): נרשם כהקצאה למפגש ונכנס להכנסות, והקרדיט לא משתנה
        const mid0 = sheet.depMid, l0 = linkOf(pid, mid0);
        await addPayRecord(pid, mid0, 'payment', amt, payCm ? pr.id : null, Number.isFinite(cm) ? cm : null, false, method, mnote || null, dueMeta); setDue(mid0);
        if (l0) { const body = { paid_amount: allocatedOf(pid, mid0), paid_at: new Date().toISOString() }; Object.assign(l0, body); await api(T.a + attQs(pid, mid0), { method: 'PATCH', body }); }
        toast('נרשם תשלום ₪' + nfm(amt)); payDone(); return;
      }
      await addPayRecord(pid, null, 'deposit', amt, payCm ? pr.id : null, Number.isFinite(cm) ? cm : null, false, method, mnote || null, pkgMeta); toast('התקבל תשלום ₪' + nfm(amt));
      const mid = sheet.depMid; if (mid) setDue(mid);
      if (mid) {   // תשלום מתוך מפגש: המפגש הזה נפרע (גם חלקית), וחבילה פורעת גם מפגשים קרובים משויכים
        await autoAllocate(pid, mid, true);
        if (pk >= 2) {
          const more = linksOf(pid).map((l) => meetOf(l.meeting_id)).filter((x) => x && x.id !== mid && !isPast(x) && !(allocatedOf(pid, x.id) > 0)).sort(meetAsc).slice(0, pk - 1);
          for (const x of more) await autoAllocate(pid, x.id);
        }
        sheet.depMid = null;
      }
      render(); closePayCard();
    } catch (err) { fail(err); }
  };
  /* לחיצה על "תשלום": קודם פופאפ אישור מלמטה עם הסיכום (סכום, מקור ומפגש), ורק באישור התשלום נרשם */
  $('#depSave').addEventListener('click', () => {
    const f = pForm, pid = sheet && sheet.id, amt = parseFloat(f.pay_dep.value); if (!pid) return;
    if (!(amt > 0)) { f.pay_dep.focus(); return; }
    if (sheet.depCr && sheet.depMid && !sheet.depPk && amt > Math.max(0, creditOf(pid)) + 0.001) { toast('אין מספיק קרדיט: הקרדיט ₪' + nfm(Math.max(0, creditOf(pid)))); return; }   // לפני פופאפ האישור
    const mid = sheet.depMid || null, mt = f.pay_depm.value, pm = state.payMethods.find((x) => x.key === mt);
    const src = sheet.depCr && mid ? 'מהקרדיט' : (mt === 'other' ? (f.pay_depn.value.trim() || 'אחר') : (pm ? pm.name : mt));
    const html = 'סכום: <b>' + ils(amt) + '</b><br>' + (sheet.depCr && mid ? (sheet.depPk ? 'ירד מפגש אחד מהכרטיסייה של המשתתף (נשארו ' + Math.max(0, pkgLeft(pid) - 1) + ')' : 'ירד מהקרדיט של המשתתף') : 'דרך: <b>' + esc(src) + '</b>') + (parseInt(f.pay_pkg.value, 10) >= 2 ? '<br>הכרטיסייה: <b>' + parseInt(f.pay_pkg.value, 10) + ' מפגשים</b>, ללא קרדיט כספי' : mid ? '' : '<br>התשלום ייכנס לקרדיט של המשתתף');
    /* פחות ממה שנשאר לשלם על המפגש: תמיד נשאר לשלם (המשתתף רואה כפתור תשלום על השארית), ואם זו הנחה סוגרים אחר כך ב"סגירת תשלום". לא בחבילה */
    const mo = mid && !(parseInt(f.pay_pkg.value, 10) >= 2) ? meetOf(mid) : null, owe = mo ? oweOf(pid, mo) : 0, rem = Math.round((owe - amt) * 100) / 100;
    const due = rem > 0 ? rem : 0;
    confirmAct(mid ? (sheet.depCr ? 'אישור תשלום מהקרדיט' : 'אישור תשלום למפגש') : 'אישור קבלת תשלום', pid, mid, () => depSaveRun(due), html + (due ? '<br>נשאר לשלם: <b>' + ils(due) + '</b>' : ''), (sheet.depCr && mid) ? 'אישור תשלום מהקרדיט' : 'אישור תשלום', null, (sheet.depCr && mid) ? { yellow: true } : { green: true });   // מהקרדיט: צהוב כהה, אחרת ירוק
  });
  /* זיכוי: מחזיר חלק מתשלום שהוקצה למפגש. לקרדיט (kind credit) או כסף למשתתף (kind refund) */
  $('#walZikuy').addEventListener('click', () => {
    const pid = sheet && sheet.id; if (!pid) return;
    const ms = state.meetings.filter((m) => allocatedOf(pid, m.id) > 0).sort((a, b) => b.meeting_date.localeCompare(a.meeting_date));
    if (!ms.length) return;
    const sel = $('#zkMeeting'); sel.innerHTML = ms.map((m) => '<option value="' + m.id + '">' + esc(meetingLabel(m, true)) + ' · שולם ₪' + nfm(allocatedOf(pid, m.id)) + '</option>').join('');
    const fill = () => { pForm.pay_zk.value = allocatedOf(pid, sel.value); };
    sel.onchange = fill; fill();
    const run = async (kind) => {
      const mid = sel.value, alloc = allocatedOf(pid, mid), amt = Math.min(parseFloat(pForm.pay_zk.value) || 0, alloc);
      if (!(amt > 0)) { pForm.pay_zk.focus(); return; }
      const l = linkOf(pid, mid), full = amt >= alloc;   // עמלת שיווק ממומן מתבטלת רק בזיכוי מלא
      try {
        await addPayRecord(pid, mid, kind, amt, full && l ? l.promoter_id : null, full && l ? l.commission : null);
        toast(kind === 'credit' ? 'זוכו ₪' + nfm(amt) + ' לקרדיט' : 'הוחזרו ₪' + nfm(amt) + ' למשתתף');
        setPTab(viewStack.pop() || 'wallet'); renderContact();
      } catch (err) { fail(err); }
    };
    $('#zkCredit').onclick = () => run('credit'); $('#zkRefund').onclick = () => run('refund');
    goView('zikuy');
  });
  /* החזרת כסף מהקרדיט (רשומת החזר מהקרדיט) */
  $('#walRefund').addEventListener('click', openRefundPop);
  /* שיווק ממומן הוא ברמת המשתתף: אייקון בכותרת (מואר כשיש שיווק ממומן) פותח בחירת שיווק ממומן */
  let promoFromPay = null;
  function afterPromoPick() {
    if (promoFromPay) { const c = promoFromPay; promoFromPay = null; viewStack = ['main']; payCtx = { pid: c.pid, mid: c.mid }; openPayView(c.pid, c.mid, { keep: true, amount: c.amount }); }
    else toMain();
  }
  /* דרך ההגעה של המשתתף: בחירה אחת מהשיווק הממומן, או בלי */
  async function setParticipantPromoter(id) {
    const p = state.participants.find((x) => x.id === (sheet && sheet.id)); if (!p) return;
    const prev = { promoter_id: p.promoter_id || null };
    const next = { promoter_id: id || null };
    const first = state.att.filter((l) => l.participant_id === p.id).sort((a, b) => String(a.created_at || '~').localeCompare(String(b.created_at || '~')))[0], prevF = first ? first.source_promoter_id : null;   // בבסיס הנתונים זה נעשה בטריגר
    Object.assign(p, next); if (first) first.source_promoter_id = id || null; setTitle(p); render();
    try { await api(T.p + '?id=eq.' + p.id, { method: 'PATCH', body: next }); toast(id ? 'דרך ההגעה עודכנה' : 'דרך ההגעה הוסרה'); }
    catch (err) { Object.assign(p, prev); if (first) first.source_promoter_id = prevF; setTitle(p); render(); fail(err); }
  }
  $('#pPromoOpts').addEventListener('click', (e) => { const b = e.target.closest('[data-pp]'); if (!b) return; setParticipantPromoter(b.dataset.pp); afterPromoPick(); });
  $('#pPromoNew').addEventListener('click', () => openNewPromoter((row) => { setParticipantPromoter(row.id); afterPromoPick(); }));
  /* לחיצה על הכותרת (השם והתגית, כל האזור) במסך הראשי פותחת את פרטי המשתתף */
  /* מאזינים על כל הכותרת ובודקים אם הלחיצה באזור השם והתגית (הכותרת נבנית מחדש בעדכונים, ולכן היעד של הלחיצה יכול להיות ההורה) */
  $('#pBack').addEventListener('click', () => { if (pTab === 'promoter') promoFromPay = null; setPTab(viewStack.pop() || 'main'); });
  const goView = (v) => { if (v === 'wallet') { viewStack = []; setPTab(v); return; } viewStack.push(pTab); setPTab(v); };   // הקרדיט היא דף בפייג'ר, לא מסך משנה
  /* המייל שנשלח למשתתף, כפי שנשמר בשליחה. בלי סקריפטים (sandbox), וקישורים נפתחים בלשונית חדשה */
  let mailDark = false;
  const paintMailTheme = () => { const b = $('#mailTheme'); $('#mailDlg').classList.toggle('maildark', mailDark); b.setAttribute('aria-pressed', String(mailDark)); const lb = mailDark ? 'הדמיית מצב בהיר' : 'הדמיית מצב כהה'; b.title = lb; b.setAttribute('aria-label', lb); b.innerHTML = icon(mailDark ? 'sun' : 'moon'); };
  $('#mailTheme').addEventListener('click', () => { mailDark = !mailDark; paintMailTheme(); });
  const mailFrameNew = () => { const old = $('#mailFrame'), f = document.createElement('iframe'); f.id = 'mailFrame'; f.title = old.title; f.setAttribute('sandbox', old.getAttribute('sandbox')); f.hidden = true; old.replaceWith(f); return f; };   // מסגרת חדשה בכל פתיחה: ניווט של iframe שכבר נטען מוסיף רשומה להיסטוריה של הדפדפן
  async function openMail(id) {
    if (!sheet || !sheet.id || !UUID_RE.test(String(id))) return;
    const meta = $('#mailMeta'), fr = mailFrameNew();
    const dlg = $('#mailDlg'), who = partOf(sheet.id);
    $('#mailTitle').innerHTML = 'מייל' + (who ? ' <span class="tsubname">· ' + esc(who.name) + '</span>' : '');
    sheet.mailId = id; meta.textContent = 'טוען…'; paintMailTheme();
    if (!dlg.open) dlg.showModal();   // פופאפ רגיל מלמטה, מעל כרטיס המשתתף
    syncUrl();
    try {
      const [r] = await api(MAIL_LOG + '?id=eq.' + id + '&select=subject,to_addr,sent_at,created_at,html,status,error', { ui: false });
      if (!sheet || sheet.mailId !== id) return;
      if (!r) { meta.textContent = 'המייל לא נמצא'; return; }
      meta.innerHTML = (r.status === 'failed' ? '<div class="mailbad' + (/^(אין אימייל|no_?addr|no_?email)/i.test(r.error || '') ? ' noacc' : '') + '">' + icon('warn', 'i16') + '<span>המייל לא נשלח' + (r.error ? ': ' + esc(r.error) : '') + '</span></div>' : '') + '<b>' + esc(r.subject || '') + '</b>' + (r.to_addr ? '<span class="mailto">' + (r.status === 'failed' ? 'כתובת: ' : r.status === 'pending' ? 'ממתין לשליחה אל ' : 'נשלח אל ') + '<bdi dir="ltr">' + esc(r.to_addr) + '</bdi></span>' : '') + '<span><bdi dir="ltr">' + esc(fmtDT(r.sent_at || r.created_at)) + '</bdi></span>';
      fr.onload = () => { try { fr.style.height = fr.contentDocument.documentElement.scrollHeight + 'px'; } catch (e) {} };
      if (!r.html) return;   // מייל שלא נשלח לפני שנבנה (למשל בלי אימייל): רק הסיבה
      fr.hidden = false; fr.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><base target="_blank">' + r.html;   // ה-HTML כפי שנשלח; base רק כדי שקישורים ייפתחו בלשונית חדשה
    } catch (err) { meta.textContent = 'לא ניתן לטעון את המייל'; fail(err); }
  }
  /* המייל לא קולט נגיעות (pointer-events), כדי שגלילה והחלקה למטה לסגירה יעבדו מכל מקום בפופאפ; קישורים שבתוכו נפתחים מכאן */
  $('#mailDlg').addEventListener('close', () => { if (sheet) sheet.mailId = null; mailFrameNew(); });   // הכתובת מתעדכנת במעטפת הפופאפים
  $('#mailSheet').addEventListener('click', (e) => { const fr = $('#mailFrame'); if (fr.hidden) return; const b = fr.getBoundingClientRect(); if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return; let a = null; try { const el = fr.contentDocument.elementFromPoint(e.clientX - b.left, e.clientY - b.top); a = el && el.closest('a[href]'); } catch (x) {} if (a && /^(https:|mailto:|tel:)/i.test(a.href)) window.open(a.href, '_blank', 'noopener'); });
  const toMain = () => { viewStack = []; setPTab('main'); };

  /* מעטפת אחת לכל הפופאפים (משתתף, מפגש, סטטיסטיקה, אישור): עולים מלמטה, נסגרים באנימציה,
     פס גרירה בראש כמו מגירה (אפשר להחליק למטה לסגירה), לחיצה בחוץ סוגרת, והדף מאחור נעול לגלילה */
  (function () {
    const proto = HTMLDialogElement.prototype, rawShow = proto.showModal, rawClose = proto.close;
    const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = document.documentElement;
    const offset = (d) => Math.max(120, window.innerHeight - d.getBoundingClientRect().top);
    const desk = () => !!(window.matchMedia && window.matchMedia('(min-width: 760px)').matches);   // דסקטופ: פופאפ במרכז, נפתח ונסגר בדהייה (לא עולה מלמטה)
    const backdrop = (d, from, to, ms) => { try { d.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease', fill: 'both', pseudoElement: '::backdrop' }); } catch (e) {} };
    const unlock = () => { if (!document.querySelector('dialog[open]:not(.side)')) root.classList.remove('dlg-lock'); };   // הכרטיס שבצד הרשימה לא נועל את הדף
    /* דסקטופ רחב (מ-1024px, 31.10.26): כרטיס המשתתף נפתח בצד הרשימה ולא כפופאפ: דיאלוג לא מודלי, הרשימה נשארת פעילה (גלילה, חיפוש ומעבר למשתתף אחר) */
    const sideMQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : null;
    const side = (d) => d.id === 'pDlg' && !!(sideMQ && sideMQ.matches) && !!(sheet && sheet.id);   // משתתף חדש: פופאפ רגיל, לא כרטיס בצד
    const rawShowNM = proto.show;
    /* דסקטופ (31.10.26): הגדרות, סטטיסטיקות וכספים (וההתחשבנות שנפתחת מההגדרות) נפתחים כפאנל מצד שמאל שמחליק ימינה, ולא כחלון במרכז; נסגרים בכפתור X, בלחיצה בחוץ או ב-Escape */
    const DRAWERS = ['setDlg', 'stDlg', 'finDlg', 'prDlg'];
    const drawer = (d) => DRAWERS.includes(d.id) && desk();
    proto.showModal = function () {
      if (this.open) return;
      { const ae = document.activeElement; if (ae && ae.matches && ae.matches('input, textarea, select')) ae.blur(); }   // שדה שנשאר בפוקוס (למשל החיפוש) משאיר את סרגל המילוי האוטומטי של כרום גם אחרי שהמקלדת נסגרה
      if (side(this)) {
        this._side = true; this.classList.add('side');
        rawShowNM.call(this);
        navOpen(this);
        try { syncUrl(); } catch (e) {}
        root.classList.add('split-open');
        this._closing = false;
        this.getAnimations().forEach((a) => a.cancel());
        if (!reduced()) this.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
        try { markSel(); } catch (e) {}
        return;
      }
      this.classList.toggle('drawer', drawer(this));
      rawShow.call(this);
      navOpen(this);
      try { syncUrl(); } catch (e) {}
      root.classList.add('dlg-lock');
      this._closing = false;
      this.getAnimations().forEach((a) => a.cancel());
      if (reduced()) return;
      if (this.classList.contains('drawer')) { this.animate([{ transform: 'translateX(-100%)' }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.22,.8,.2,1)' }); backdrop(this, 0, 1, 300); return; }
      if (desk()) { this.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' }); backdrop(this, 0, 1, 200); return; }
      const y = offset(this);
      this.animate([{ transform: 'translateY(' + y + 'px)' }, { transform: 'none' }], { duration: 340, easing: 'cubic-bezier(.22,.8,.2,1)' });
      backdrop(this, 0, 1, 340);
    };
    /* סגירת פופאפ סוגרת גם את המקלדת (virtualKeyboard.hide, כי blur לבדו לא תמיד סוגר מקלדת שנפתחה בפקודה) */
    const hideKb = () => { try { const a = document.activeElement; if (!a || a === document.body || !a.matches || !a.matches('input, textarea, select, [contenteditable]')) return; const vk = navigator.virtualKeyboard, can = vk && vk.hide && 'virtualKeyboardPolicy' in a; if (can) { a.virtualKeyboardPolicy = 'manual'; vk.hide(); } a.blur(); if (can) a.virtualKeyboardPolicy = ''; } catch (e) {} };
    proto.close = function (rv, from) {
      if (!this.open || this._closing) return;
      hideKb();
      navClose(this);
      if (this._side) {   // כרטיס בצד הרשימה: נסגר מיד, והאזור חוזר להודעה "בחרו משתתף"
        this._side = false; this.classList.remove('side'); this.getAnimations().forEach((a) => a.cancel());
        rawClose.call(this, rv); root.classList.remove('split-open');
        setTimeout(() => { try { syncUrl(); } catch (e) {} }, 0);
        try { markSel(); } catch (e) {}
        return;
      }
      setTimeout(() => { try { syncUrl(); } catch (e) {} }, 420);   // אחרי שהדיאלוג נסגר (אנימציה)
      if (reduced()) { rawClose.call(this, rv); unlock(); return; }
      this._closing = true;
      const d = this, cur = from == null ? 0 : from, y = offset(d);
      d.getAnimations().forEach((a) => a.cancel());
      backdrop(d, 1, 0, 240);
      const a = d.classList.contains('drawer') ? d.animate([{ transform: 'none' }, { transform: 'translateX(-100%)' }], { duration: 240, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'both' })
        : desk() ? d.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.97)' }], { duration: 160, easing: 'ease-in', fill: 'both' })
        : d.animate([{ transform: 'translateY(' + cur + 'px)' }, { transform: 'translateY(' + y + 'px)' }], { duration: 240, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'both' });
      const fin = () => { d._closing = false; d.getAnimations().forEach((x) => x.cancel()); rawClose.call(d, rv); unlock(); };
      a.onfinish = fin; a.oncancel = () => { if (d._closing) fin(); };
    };
    /* כשהמקלדת פתוחה (אנדרואיד/iOS) הפופאפ מתכווץ לאזור הנראה ומתרומם מעל המקלדת, כך שאפשר לגלול בתוכו ולהגיע לכל השדות והכפתורים */
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        /* בלי שדה בפוקוס אין מקלדת: מאפסים גם אם אירוע הסגירה של המקלדת לא הגיע (אחרת הפופאפ נשאר מכווץ) */
        const ae = document.activeElement, typing = ae && (ae.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) && ae.type !== 'file';
        const kb = typing ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
        document.querySelectorAll('dialog[open]').forEach((d) => {
          const full = ['pDlg', 'setDlg', 'stDlg', 'prDlg', 'finDlg'].includes(d.id) && !(d.id === 'pDlg' && d.classList.contains('newp')) && !(d.id === 'setDlg' && ['main', 'st', 'pm', 'src', 'del'].includes(setView));   // פופאפים בגובה מלא: ממלאים בדיוק את האזור שמעל המקלדת, בלי רווח למעלה
          if (kb > 80) { d.style.marginBottom = kb + 'px'; d.style.maxHeight = Math.round(vv.height - (full ? 0 : 12)) + 'px'; if (full) d.style.height = Math.round(vv.height) + 'px'; }
          else { d.style.marginBottom = ''; d.style.maxHeight = ''; d.style.height = ''; }
        });
      };
      vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
      window.addEventListener('resize', fit); document.addEventListener('focusout', () => setTimeout(fit, 250)); document.addEventListener('focusin', () => setTimeout(fit, 250));
      new MutationObserver(() => fit()).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });   // פתיחת פופאפ: מחשבים מחדש
    }
    /* Escape בכרטיס שבצד הרשימה (דיאלוג לא מודלי לא מקבל cancel): כמו בפופאפ, במסך משנה חוזרים צעד ובמסך הראשי סוגרים */
    document.addEventListener('keydown', (e) => {
      const d = document.getElementById('pDlg');
      if (e.key !== 'Escape' || Date.now() - escMenuAt < 150 || !d || !d.open || !d._side || root.classList.contains('menu-open') || document.querySelector('dialog[open]:modal')) return;
      const bk = navDepthOf(d) > 0 && NAV_BACK[d.id] ? $(NAV_BACK[d.id]) : null;
      if (bk && !bk.hidden) bk.click(); else d.close();
    });
    if (sideMQ) sideMQ.addEventListener('change', () => { const d = document.getElementById('pDlg'); if (d && d.open) d.close(); });   // מעבר בין מובייל לדסקטופ רחב עם כרטיס פתוח: סוגרים
    const setupDlg = (d) => {
      { const h = d.querySelector('.sheet-head'); if (h && !h.querySelector('.dclose')) { const x = document.createElement('button'); x.type = 'button'; x.className = 'hbtn dclose'; x.setAttribute('aria-label', 'סגירה'); x.title = 'סגירה'; x.innerHTML = icon('close'); x.addEventListener('click', () => d.close()); h.appendChild(x); } }   // כפתור סגירה לפאנל מצד שמאל (מוצג רק בדסקטופ)
      const g = document.createElement('div'); g.className = 'grab'; g.innerHTML = '<i></i>'; g.setAttribute('aria-hidden', 'true');
      d.insertBefore(g, d.firstChild);
      d.addEventListener('close', () => { if (d.open) return; { const ae = document.activeElement; if (ae && ae !== document.body && ae.matches && ae.matches('input, textarea, select, [contenteditable]')) ae.blur(); } navClose(d); unlock(); setTimeout(() => { try { syncUrl(); } catch (e) {} }, 0); });   // סגירה שלא עברה דרך close שלנו (form method=dialog, או הדפדפן סוגר דיאלוג בלחיצה על "חזרה" כשאי אפשר לבטל): מחזירים את רשומת ההיסטוריה שנוספה בפתיחה, אחרת המחסנית של "חזרה" מתמלאת
      d.addEventListener('cancel', (e) => {   // (אירוע cancel של שדה קובץ שבתוך הפופאפ, למשל סגירת בורר התמונות בלי בחירה, עולה בבועה אל הדיאלוג; מתעלמים ממנו, אחרת הפופאפ נסגר) Escape או כפתור "חזרה" של הדפדפן/אנדרואיד (Chrome סוגר דיאלוג מודלי לפני ההיסטוריה): בתוך מסך משנה חוזרים צעד אחד כמו בחץ שבפופאפ, ורק במסך הראשי סוגרים
        if (e.target !== d) return;
        e.preventDefault();
        if (Date.now() - escMenuAt < 150) return;
        const top = NAV.stack.find((x) => x.d === d), bk = top && navDepthOf(d) > 0 ? navBackBtn(d) : null;
        if (bk && !bk.hidden) bk.click(); else d.close();
      });
      d.addEventListener('click', (e) => { if (e.target === d && !d._side) d.close(); });    // לחיצה בחוץ (לא בכרטיס שבצד הרשימה)
      let sy = 0, dy = 0, t0 = 0, drag = false, moved = false, tapOK = true;
      const down = (e) => {
        if (e.button > 0 || d._closing || e.target.closest('button, a, input, select, textarea')) return;
        tapOK = e.currentTarget === g;   // הקשה (בלי גרירה) סוגרת רק על הפס, לא על הכותרת
        drag = true; moved = false; sy = e.clientY; dy = 0; t0 = performance.now();
        d.getAnimations().forEach((a) => a.cancel());
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
      };
      const move = (e) => {
        if (!drag) return;
        dy = Math.max(0, e.clientY - sy); if (dy > 4) moved = true;
        d.style.transform = 'translateY(' + dy + 'px)';
      };
      const up = () => {
        if (!drag) return; drag = false;
        const v = dy / Math.max(1, performance.now() - t0), tap = !moved;
        if (tap && !tapOK) { d.style.transform = ''; return; }
        if (tap || dy > 110 || (v > 0.6 && dy > 30)) { d.style.transform = ''; d.close(undefined, tap ? 0 : dy); return; }
        d.style.transition = 'transform .2s ease'; d.style.transform = '';
        setTimeout(() => { d.style.transition = ''; }, 220);
      };
      const bind = (el) => { el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
      bind(g);
      /* החלקה למטה מכל מקום בפופאפ סוגרת, כשהתוכן שנוגעים בו גלול לראש (אחרת זו גלילה רגילה) */
      let ty0 = 0, tx0 = 0, tt0 = 0, tdy = 0, tOn = false, tOk = false;
      const scrolledDown = (el) => {
        for (let n = el; n; n = n.parentElement) {
          if (n.scrollHeight > n.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollTop > 0) return true;
          if (n === d) break;
        }
        return false;
      };
      d.addEventListener('touchstart', (e) => {
        tOn = false; tdy = 0;
        tOk = e.touches.length === 1 && !d._closing && !e.target.closest('.grab, .sheet-head, .fm-open') && !scrolledDown(e.target);   // גם לא מתוך תפריט צף פתוח: החלקה בתוכו גוללת אותו ולא את הפופאפ
        if (tOk) { ty0 = e.touches[0].clientY; tx0 = e.touches[0].clientX; tt0 = performance.now(); }
      }, { passive: true });
      d.addEventListener('touchmove', (e) => {
        if (!tOk) return;
        const dy = e.touches[0].clientY - ty0, dx = e.touches[0].clientX - tx0;
        if (!tOn) {
          if (dy < -4 || Math.abs(dx) > Math.abs(dy) + 4) { tOk = false; return; }   // גלילה כלפי מעלה או תנועה אופקית
          if (dy > 10) { if (scrolledDown(e.target)) { tOk = false; return; } tOn = true; d.getAnimations().forEach((x) => x.cancel()); }
          else return;
        }
        tdy = Math.max(0, dy); d.style.transform = 'translateY(' + tdy + 'px)';
        if (e.cancelable) e.preventDefault();
      }, { passive: false });
      const tEnd = () => {
        if (!tOn) { tOk = false; return; }
        tOn = false; tOk = false;
        const v = tdy / Math.max(1, performance.now() - tt0);
        if (tdy > 110 || (v > 0.6 && tdy > 30)) { d.style.transform = ''; d.close(undefined, tdy); return; }
        d.style.transition = 'transform .2s ease'; d.style.transform = '';
        setTimeout(() => { d.style.transition = ''; }, 220);
      };
      d.addEventListener('touchend', tEnd); d.addEventListener('touchcancel', tEnd);
      d.querySelectorAll('.sheet-head').forEach((h) => { h.style.touchAction = 'none'; bind(h); });
    };
    window.__rosterSetupDlg = setupDlg; document.querySelectorAll('dialog').forEach(setupDlg);
  })();

  /* כותרת הפופאפ: צ'יפ מגדר (ז/נ) וגיל לפני השם */
  function setTitle(p) {
    const h = $('#pTitle');
    if (!p) { h.textContent = 'משתתף חדש'; return; }
    const age = shownAge(p);
    const o = originOf(p, sheet && sheet.hl), cls = o ? ' ' + o.kind : '';   // צבע התגית לפי דרך ההגעה (צבע שנבחר בהגדרות)
    const src = o ? (o.kind === 'pr' ? ' · שיווק ממומן: ' : ' · פרסום: ') + o.name : '';
    h.title = src.replace(' · ', '');
    h.innerHTML = (age != null || p.gender ? '<span class="tchip' + cls + '"' + originAttr(p) + '><bdi dir="rtl">' + (age != null ? age : '') + (age != null ? ' ' : '') + '<b>' + (p.gender ? icon(p.gender === 'male' ? 'male' : 'female', 'i16') : '<span class="ic i16 ph" aria-hidden="true"></span>') + '</b>' + '</bdi></span>' : '') + '<span class="tname' + nameCls(p) + '" dir="rtl"><bdi>' + esc(p.name) + '</bdi></span>';
    if (o) h.insertAdjacentHTML('beforeend', srcChip(p, sheet && sheet.hl));   // the arrival route: a small chip, last in the name row
    /* סמל המצב (מחובר לחשבון, חסום, מחוק) בטאב הפרטים */
    { const mk = stMark(p), tm = $('#pTabMark'); tm.innerHTML = mk ? icon(mk.k, 'i14') : ''; tm.className = 'ptm' + (mk && mk.red ? ' red' : ''); tm.title = mk ? mk.t : ''; }
    { const ca = $('#pCall'), tl = telLink(p.phone); ca.hidden = !(pTab === 'main' && tl); if (tl) ca.href = tl; }   // הטלפון השתנה: החיוג מתעדכן
  }
  /* בחירת שיווק ממומן במשתתף (לשונית הפרטים): ללא / שיווק ממומן / שיווק ממומן חדש */
  function fillPromoSel(p) {
    const sel = $('#pPromoSel'); if (!sel) return;
    sel.innerHTML = '<option value="">ללא</option>' + state.promoters.map((x) => '<option value="' + x.id + '">' + esc(x.name) + '</option>').join('') + '<option value="__new">+ שיווק ממומן חדש</option>';
    sel.value = p ? ((channelOf(p) || {}).id || '') : (sheet && sheet.promoSel) || '';
    tintPromoSel();
  }
  /* שדה המקור בצבע של דרך ההגעה שנבחרה (כמו תגית הגיל): רקע וטקסט מהפלטה; בלי שיווק ממומן או בלי צבע: שדה רגיל */
  function tintPromoSel() {
    const sel = $('#pPromoSel'); if (!sel) return;
    const o = state.promoters.find((x) => x.id === sel.value), c = o && o.color ? (PALETTE[o.color] || null) : null;
    sel.style.color = c ? c[1] : ''; sel.style.fontWeight = c ? '700' : '';   // שיווק ממומן: בלי רקע, רק הטקסט בצבע שלה
  }
  /* דסקטופ רחב (31.10.26): רוחב הרשימה ניתן לשינוי בגרירת הקו שבינה לבין הכרטיס (#splitHandle), בחצים במקלדת, ולחיצה כפולה מחזירה לברירת המחדל; נשמר בדפדפן הזה */
  (function () {
    const KEY = 'roster_admin_listw', root = document.documentElement, h = document.getElementById('splitHandle');
    const wide = () => !!(window.matchMedia && window.matchMedia('(min-width: 1024px)').matches);
    const clampW = (w) => Math.round(Math.max(360, Math.min(w, window.innerWidth - 420)));   // לפחות 360 לרשימה ו-420 לכרטיס
    const curW = () => document.querySelector('.wrap').getBoundingClientRect().width;
    const setW = (w) => { root.style.setProperty('--listw', clampW(w) + 'px'); requestAnimationFrame(alignFilters); };
    const save = () => { try { localStorage.setItem(KEY, String(Math.round(curW()))); } catch (e) {} };
    const reset = () => { root.style.removeProperty('--listw'); try { localStorage.removeItem(KEY); } catch (e) {} requestAnimationFrame(alignFilters); };
    let saved = null; try { saved = Number(localStorage.getItem(KEY)) || null; } catch (e) {}
    if (saved) setW(saved);
    window.addEventListener('resize', () => { if (saved || root.style.getPropertyValue('--listw')) { const w = parseFloat(root.style.getPropertyValue('--listw')); if (w) setW(w); } });
    if (!h) return;
    let drag = false;
    h.addEventListener('pointerdown', (e) => { if (!wide() || e.button > 0) return; drag = true; h.setPointerCapture(e.pointerId); root.classList.add('split-drag'); e.preventDefault(); });
    h.addEventListener('pointermove', (e) => { if (drag) setW(window.innerWidth - e.clientX); });   // הרשימה בצד ימין: הרוחב שלה = מקצה המסך הימני ועד העכבר
    const end = () => { if (!drag) return; drag = false; root.classList.remove('split-drag'); saved = curW(); save(); };
    h.addEventListener('pointerup', end); h.addEventListener('pointercancel', end);
    h.addEventListener('dblclick', () => { saved = null; reset(); });
    h.addEventListener('keydown', (e) => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault(); setW(curW() + (e.key === 'ArrowLeft' ? 24 : -24)); saved = curW(); save(); });   // חץ שמאלה מרחיב את הרשימה
  })();
  /* דסקטופ רחב (31.10.26): השורה של המשתתף שהכרטיס שלו פתוח בצד מסומנת ברשימה */
  let lastPid = null;   // המשתתף שהפופאפ שלו נסגר: הרשומה שלו באפור בהיר עד הלחיצה הבאה במסך
  function markSel() { const on = pDlg && pDlg.open && pDlg._side; document.querySelectorAll('#list li.row').forEach((r) => { const e = r.querySelector('[data-edit]'), id = e && e.dataset.edit; r.classList.toggle('sel', !!(on && id === openPid)); r.classList.toggle('last', !!(id && id === lastPid)); }); }
  window.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('dialog')) return; const r = e.target.closest && e.target.closest('#list li.row')   // לחיצה בתוך פופאפ (אישור, סגירה) לא מבטלת את סימון "אחרון"
    , ed = r && r.querySelector('[data-edit]'), id = ed ? ed.dataset.edit : null; if (id !== lastPid) { lastPid = id; markSel(); } }, true);   // לחיצה על כל אלמנט בכרטיס מסמנת אותו; לחיצה במקום אחר מבטלת   // לחיצה, לא נגיעה: גלילה ברשימה לא מבטלת את הסימון
  function openParticipant(id, tab, fromEl) {
    const p = id ? partOf(id) : null;
    if (!p && pDlg.open && pDlg._side) pDlg.close();   // כרטיס פתוח בצד הרשימה: נסגר, והמשתתף החדש נפתח כפופאפ
    sheet = p ? { id: p.id, hl: state.filter || null } : { id: null, links: new Map(state.filter ? [[state.filter, false]] : []) };
    pForm.reset();
    { const nm = p ? splitName(p) : ['', '']; pForm.first_name.value = nm[0]; pForm.last_name.value = nm[1]; }
    pForm.phone.value = p ? localPhone(p.phone) : '';
    pForm.age.value = p ? (shownAge(p) ?? '') : '';
    pForm.email.value = p ? (p.email || '') : '';
    pForm.gender.value = p && p.gender ? p.gender : '';
    fillPromoSel(p);
    setTitle(p);
    $('#pRegLine').textContent = p && regDate(p) ? 'נוסף ב-' + regDateTime(p) : '';
    renderContact(); loadGoogleAcc(p);
    $('#pSubmit').hidden = !!p;
    $('#nText').value = ''; setPending(null);
    $('#pDelete').hidden = !p || p.active === false; $('#pRestore').hidden = !(p && p.active === false);   // משתתף מחוק: במקום "מחיקת משתתף" כפתור "החזרה לפעילות"
    $('#savedMark').classList.remove('on');
    refreshSheetMeetings();
    openPid = p ? p.id : null;
    pDlg.showModal();
    if (pDlg._side) { try { syncUrl(); } catch (e) {} markSel(); }   // בצד הרשימה: מעבר ממשתתף למשתתף בלי לסגור את הכרטיס
    pDlg.setAttribute('tabindex', '-1'); pDlg.focus({ preventScroll: true });   // בלי טבעת פוקוס על כפתור הסגירה
    viewStack = []; payCtx = null; promoFromPay = null;
    PG.cur = pgDeep != null ? pgDeep : 0; pgDeep = null;   // תמיד נפתח על המפגשים (קישור: על הדף שבקישור)
    setPTab(p ? (tab === 'info' ? 'info' : 'main') : 'info', true);
    meetTop(true);
    if (!p) setTimeout(() => pForm.first_name.focus(), 50);
  }

  /* מפגש בכרטיס המשתתף, ככרטיס: מועד (וה-✕ בפינה), שם המפגש, תגית ומצב תשלום */
  /* כיתוב מצב התשלום של משתתף במפגש: רכיב אחד לכרטיס המפגש בכרטיס המשתתף ולכרטיס ברשימה */
  const payTxt = (pid, mid, free) => laterOf(pid, mid) ? 'בהמשך ₪' + nfm(dueOf(pid, mid) > 0 ? dueOf(pid, mid) : (meetOf(mid) ? defaultPrice(meetOf(mid)) : 0)) : dueOf(pid, mid) > 0 ? 'נשאר ₪' + nfm(dueOf(pid, mid)) : allocatedOf(pid, mid) > 0 ? '₪' + nfm(allocatedOf(pid, mid)) : free ? 'לא לתשלום' : 'לתשלום';
  /* מספר המשתתפים המוצגים: על כפתור הסינון שבשורת החיפוש (במקום השורה "N משתתפים מוצגים" שמעל הכרטיסים) */
  const paintCnt = () => { const n = state.listCnt == null ? '' : String(state.listCnt); const sc = document.getElementById('listCountS'); if (sc) sc.innerHTML = n === '' ? '' : n === '1' ? 'משתתף אחד' : '<b>' + n + '</b> משתתפים'; const b = document.getElementById('filtBtn'); if (b) b.title = 'סינון ותצוגה' + (n ? ' · ' + cntTxt(n) : ''); };   // המספר בתיבת החיפוש, במקום הכיתוב "חיפוש +" 
  const cntTxt = (n) => n == null || n === '' ? '' : String(n) === '1' ? 'משתתף אחד מוצג' : n + ' משתתפים מוצגים';   // שורת המונה מעל הכרטיסים
  const meetName = (m) => String(m.name || '').trim() || String((typeById(m.type_id) || {}).name || '').trim();
  /* העיר והמיקום של המפגש (מהמפגש, ואם ריק מסוג המפגש), בכרטיס המפגש בכרטיס המשתתף */
  const meetWhere = (m) => { const ty = typeById(m.type_id) || {}; return [m.city || ty.city, m.place || ty.place].map((x) => String(x || '').trim()).filter(Boolean).join(' · '); };
  const meetRow = (m) => {
      let on, st;
      if (sheet.id) { const l = linkOf(sheet.id, m.id); on = !!l; st = linkStatus(l); }
      else { on = sheet.links.has(m.id); st = null; }
      const miss = !!(sheet.id && on && missedOf(sheet.id, m));
      const freeL = !!(sheet.id && on && noPayOf(partOf(sheet.id), linkOf(sheet.id, m.id)));   // לא משלם על המפגש: מוצג "לא לתשלום" ולא "תשלום"
      return '<div class="mrow ucard' + (on ? ' on' : '') + (sheet.hl === m.id ? ' hl' : '') + '" data-mrow="' + m.id + '">' +
        '<div class="mwhen"><div class="mdt">' + UI.tag(dm(m), 'mlabel') + '<span class="mtm">' + esc(String(m.meeting_time || '').slice(0, 5)) + '</span>' + (meetName(m) ? '<span class="mnm mn1">' + esc(meetName(m)) + '</span>' : '') + '</div>' + (meetWhere(m) ? '<span class="mnm mwh">' + esc(meetWhere(m)) + '</span>' : '') + '</div>' +
        '<div class="mchips">' +
        (!on && sheet.id ? UI.tag('הוספה למפגש', 'ptag none', { 'data-mp': m.id, role: 'button', tabindex: 0, title: 'לא משויך למפגש. לחיצה: הוספה למפגש' }) : '<button type="button" class="pay ' + esc(on ? (st || (miss ? 'missed' : 'nolabel')) : 'none') + '" data-mp="' + esc(m.id) + '" title="' + (on ? (st ? 'שינוי תגית' : 'הוספת תגית') : 'לא משויך למפגש. לחיצה: שיוך למפגש') + '"' + (on && !st ? ' aria-label="הוספת תגית"' : '') + '>' + (on ? (st ? esc(STATUS_LABEL[st]) : miss ? 'לא הגיע' : icon('tag', 'i14') + ' תגית') : sheet.id ? 'לא משויך' : '') + '</button>') +
        '<div class="mline">' + (sheet.id && !on ? '<span></span>' : sheet.id ? '<button type="button" class="mmoney' + (laterOf(sheet.id, m.id) ? ' later' : dueOf(sheet.id, m.id) > 0 ? '' : allocatedOf(sheet.id, m.id) > 0 ? ' has' : freeL ? ' free' : '') + '" data-mm="' + m.id + '"' + (on ? '' : ' hidden') + ' title="תשלום למפגש">' + payTxt(sheet.id, m.id, freeL) + '</button>' : '') +
        '</div></div>' +
        (!sheet.id ? '<span></span>' : on ? '<button type="button" class="munl" data-mun="' + m.id + '" aria-label="הסרה מהמפגש" title="הסרה מהמפגש">' + icon('caloff', 'i16') + '</button>' : '<span></span>') +
      '</div>';
  };
  /* פייג'ר בכרטיס המשתתף: מפגשים (מימין, הכרטיס תמיד נפתח עליו), קרדיט, הערות ופרטים. החלקה עם הצמדה, והאטבים והמחוון עוקבים אחרי הגלילה. בלי רשומות היסטוריה: "חזרה" סוגרת את הכרטיס */
  const pgBox = $('#pPager'), pgTabs = [$('#pTabM'), $('#pTabW'), $('#pTabN'), $('#pTabI')], pgPages = [$('#pgM'), $('#pgW'), $('#pgN'), $('#pgI')], PG_IDS = ['m', 'w', 'n', 'i'];
  let pgDeep = (() => { const u = new URLSearchParams(location.search).get('pg'); const i = PG_IDS.indexOf(u); return i > 0 ? i : null; })();   // pgDeep: הדף מהכתובת, לפתיחה הראשונה בלבד
  const PG = tabPager($('#pTabs'), pgBox, pgTabs, pgPages, () => sheet && !sheet.id);
  function pgApply() { if (sheet && !sheet.id) { pgBox.scrollLeft = 0; pgPages[3].inert = false; return; } PG.apply(); }
  /* המפגש שממנו הגענו בראש הרשימה: גלילה אליו בפתיחה, ומקום אחרי "שיוך למפגש" כדי שיגיע לראש גם כשיש מעט מפגשים. הכפתור תמיד מיד אחרי הכרטיס האחרון */
  function meetTop(scroll) {
    /* גלילה אוטומטית למפגש שממנו הגענו, כך שייראה ככרטיס הראשון: ברווח הרגיל מעליו (8px, כמו הרווח בין הכרטיסים). אם הוא כבר בראש, אין גלילה; מקום נוסף למטה (#pMeetPad) מאפשר את הגלילה גם כשיש מעט מפגשים */
    const box = $('#pMeetings'), pg = $('#pgM'), row = box.querySelector('.mrow.hl'), sp = $('#pMeetPad'), PAD = 8;
    if (scroll && (!pg.clientHeight || !pg.getBoundingClientRect().height) && (meetTop.n = (meetTop.n || 0) + 1) < 40) { requestAnimationFrame(() => meetTop(true)); return; }   // הפופאפ עוד נפתח (למשל אחרי רענון עם קישור): מנסים שוב כשהוא מוצג
    meetTop.n = 0;
    if (!scroll) return;   // עדכון נתונים (זמן אמת וכו'): לא נוגעים במרווח ובגלילה, אחרת הגלילה מתאפסת
    pg.scrollTop = 0; sp.style.height = '0px';
    if (!row || !pg.clientHeight) return;
    const top = row.getBoundingClientRect().top - pg.getBoundingClientRect().top + pg.scrollTop;
    if (top <= PAD + 1) return;
    const target = Math.round(top - PAD);
    const contentH = sp.getBoundingClientRect().top - pg.getBoundingClientRect().top + pg.scrollTop;   // סוף התוכן האמיתי (המרווח הריק בסוף עוד בגובה 0)
    sp.style.height = Math.max(0, Math.ceil(target + pg.clientHeight - contentH)) + 'px';
    if (scroll) pg.scrollTop = target;
  }
  function refreshSheetMeetings() {
    if (!sheet) return;
    renderContact();
    const box = $('#pMeetings');
    const desc = state.meetings.slice().sort(meetDesc), shown = sheet.id ? desc.filter((m) => linkOf(sheet.id, m.id)) : desc;   // רק מפגשים שהמשתתף משויך אליהם (משתתף חדש: כולם, כדי לשייך)
    { const t = $('#pTabM'); $('#pMeetN').innerHTML = 'מפגשים <span>' + shown.length + '</span>'; t.setAttribute('aria-label', shown.length + ' מפגשים'); }   // אטב המפגשים: המילה והכמות
    { const ab = $('#pAddMeet'); if (ab) ab.hidden = !(sheet.id && state.meetings.some((m) => !linkOf(sheet.id, m.id))); }   // שיוך למפגש מהכרטיס
    { /* מספר אחד: קרדיט = חוב פחות קרדיט. חוב רק על מפגשים שביקשנו עליהם תשלום ("בטיפול") או שהמשתתף אמר שישלם ("ישלם"); רשום בלבד (חדש) הוא עוד לא חוב */
      const owed = sheet.id ? owedOf(sheet.id) : 0;
      const net = owed - (sheet.id ? creditOf(sheet.id) : 0), bn = $('#pBalN');
      bn.innerHTML = (!net && !(sheet.id && pkgLeft(sheet.id) > 0) ? 'תשלומים' : '<bdi dir="ltr">₪' + nfm(Math.abs(net)) + '</bdi>') + (sheet.id && pkgLeft(sheet.id) > 0 ? '<span class="pses" title="מפגשים בקרדיט">' + icon('cal', 'i14') + pkgLeft(sheet.id) + '</span>' : ''); }
    box.innerHTML = desc.filter((m) => shown.includes(m) || m.id === sheet.hl).map(meetRow).join('');   // המפגש שממנו הגענו מסומן ברשימה, וכשעוד לא משויך אליו: "שיוך למפגש" במקומו לפי התאריך (לא נספר במונה)
    meetTop(false);
  }

  const meetClick = (e) => {
    const un = e.target.closest('[data-mun]');   // הסרה מהמפגש: בדיוק אותה פעולה כמו "הסרה מהמפגש" בתפריט התגיות
    if (un) { confirmLink(sheet.id, un.dataset.mun, false); return; }
    const mm = e.target.closest('[data-mm]'), pay = e.target.closest('[data-mp]');   // רק התגית או ה-+ (לא כל הכרטיס)
    const rw = sheet.id && pay ? pay.closest('.mrow:not(.on)') : null;   // עוד לא משויך: תגית "לא משויך" וה-+ מקפיצים אישור שיוך
    if (mm) {
      if (sheet.id) openPayFor(sheet.id, mm.dataset.mm);   // כפתור ה-₪ בכרטיס המפגש: פופאפ הקצאה שעולה מלמטה מעל הכרטיס (הכרטיס לא משתנה)
    } else if (pay) {
      const mid = pay.dataset.mp;
      if (sheet.id && rw) { if (!$('#qMenu').hidden) closeQ(); else confirmLink(sheet.id, mid, true); }   // עוד לא משויך: שיוך ישיר, בלי בחירת תגית
      else if (sheet.id) { if (!$('#qMenu').hidden) closeQ(); else openQuickMenu(sheet.id, pay, mid); }
      else { sheet.links.has(mid) ? sheet.links.delete(mid) : sheet.links.set(mid, false); refreshSheetMeetings(); }
    }
  };
  $('#pMeetings').addEventListener('click', meetClick);

  /* שם פרטי ושם משפחה של משתתף (נתונים ישנים בלי הפיצול: המילה הראשונה = שם פרטי) */
  function splitName(p) {
    if (p.first_name != null && (p.first_name || p.last_name)) return [p.first_name, p.last_name || ''];
    const w = String(p.name || '').trim().replace(/\s+/g, ' '), i = w.indexOf(' ');
    return i < 0 ? [w, ''] : [w.slice(0, i), w.slice(i + 1)];
  }
  function readForm() {
    const age = parseInt(pForm.age.value, 10);
    return {
      first_name: pForm.first_name.value.trim().replace(/\s+/g, ' '),
      last_name: pForm.last_name.value.trim().replace(/\s+/g, ' '),
      phone: pForm.phone.value.trim(),
      email: pForm.email.value.trim(),
      age: Number.isFinite(age) ? age : null,
      gender: pForm.gender.value || null,
    };
  }

  /* עריכה: שמירה אוטומטית של כל שדה ששונה */
  let savedTimer;
  pForm.addEventListener('change', async (e) => {
    if (e.target.name === 'promoter_sel') {
      const v = e.target.value;
      if (v === '__new') { e.target.value = (sheet && sheet.id) ? ((partOf(sheet.id) || {}).promoter_id || '') : ''; openNewPromoter((row) => { fillPromoSel(sheet && sheet.id ? partOf(sheet.id) : null); $('#pPromoSel').value = row.id; $('#pPromoSel').dispatchEvent(new Event('change', { bubbles: true })); }); return; }
      tintPromoSel();
      if (sheet && sheet.id) setParticipantPromoter(v); else if (sheet) sheet.promoSel = v;
      return;
    }
    if (!sheet || !sheet.id || !e.target.name || e.target.name.startsWith('pay_')) return;
    const p = partOf(sheet.id);
    const v = readForm();
    const field = e.target.name;
    const isName = field === 'first_name' || field === 'last_name';
    if (isName && !v.first_name) { pForm.first_name.value = splitName(p)[0]; return; }
    if (field === 'phone') {
      const ph = phoneToSave(pForm.phone.value);
      if (ph === null) { badPhone(true); return; }
      v.phone = ph; pForm.phone.value = ph;
    }
    if (field === 'email') {
      const em = emailToSave(pForm.email.value);
      if (em === null) { badEmail(true); return; }
      v.email = em || null; pForm.email.value = em;
    }
    const patch = isName ? { first_name: v.first_name, last_name: v.last_name } : { [field]: v[field] };
    if (isName) patch.name = (v.first_name + ' ' + v.last_name).trim();   // השם המלא מחושב בשרת; כאן רק לתצוגה מיידית
    if (field === 'age') patch.age_set_at = todayISO();
    const prev = { ...p };
    Object.assign(p, patch); render();
    if (isName || field === 'age' || field === 'gender') setTitle(p);
    try {
      { const { name, ...serverPatch } = patch; await api(T.p + '?id=eq.' + p.id, { method: 'PATCH', body: serverPatch }); }
      const mark = $('#savedMark');
      mark.classList.add('on'); clearTimeout(savedTimer);
      savedTimer = setTimeout(() => mark.classList.remove('on'), 1500);
    } catch (err) { Object.assign(p, prev); render(); fail(err); }
  });

  /* משתתף חדש */
  pForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!sheet || sheet.id) { pDlg.close(); return; }
    const v = readForm();
    if (!v.first_name) { pForm.first_name.focus(); toast('חסר שם פרטי'); return; }
    const ph = phoneToSave(pForm.phone.value);
    if (ph === null) { badPhone(true); return; }
    v.phone = ph;
    { const em = emailToSave(pForm.email.value); if (em === null) { badEmail(true); return; } if (em) v.email = em; else delete v.email; }
    if (sheet.saving) return; sheet.saving = true;   /* מונע שליחה כפולה (כפתור וגם אנטר) שיוצרת את המשתתף פעמיים */
    const btn = $('#pSubmit'); btn.disabled = true;
    try {
      let p;
      try { [p] = await api(T.p, { method: 'POST', body: Object.assign({ ...v, age_set_at: todayISO() }, sheet.promoSel ? { promoter_id: sheet.promoSel } : {}), prefer: 'return=representation' }); }
      catch (err) {
        /* הטלפון קיים אצל משתתף לא פעיל: מחזירים אותו להיות פעיל (בלי לעדכן את שאר השדות) */
        const norm = v.phone.replace(/^0/, '+972').replace(/[^+\d]/g, '');
        const [back] = await api(T.p + '?phone_norm=eq.' + encodeURIComponent(norm) + '&active=eq.false', { method: 'PATCH', body: { active: true }, prefer: 'return=representation' });
        if (!back) throw err;
        toast('המשתתף הלא פעיל חזר להיות פעיל'); pDlg.close(); load(true); btn.disabled = false; if (sheet) sheet.saving = false; return;
      }
      state.participants.push(p);
      const rows = [...sheet.links].map(([mid]) => Object.assign({ participant_id: p.id, meeting_id: mid }, firstArrive(p.id)));
      if (rows.length) { await api(T.a, { method: 'POST', body: rows }); state.att.push(...rows); }
      pDlg.close(); render(); toast('✓ ' + p.name + ' ברשימה');
    } catch (err) { fail(err); }
    btn.disabled = false; if (sheet) sheet.saving = false;
  });

  /* חשבון גוגל מחובר למשתתף (roster_members): מייל, סטטוס, ניתוק וחסימה (blocked). ניתוק מסיר את הקישור למשתתף (participant_id = null) והחשבון נעלם מהכרטיס; חסימה משאירה אותו משויך ומונעת כניסה */
  async function loadGoogleAcc(p) {
    const box = $('#pGoogle'); if (!box) return; box.hidden = true; box.innerHTML = '';
    if (!p || !p.id) return;
    let rows = []; try { rows = await api(MEMBERS + '?select=user_id,email,status&participant_id=eq.' + p.id + '&status=neq.removed&order=created_at.desc', { ui: false }); } catch (e) { return; }
    if (!sheet || sheet.id !== p.id || !rows.length) return;
    const gaBtn = (to, ic, label, cls) => '<button type="button" class="gico' + (cls ? ' ' + cls : '') + '" data-ga="' + to + '" aria-label="' + label + '" title="' + label + '">' + icon(ic, 'i18') + '</button>';
    box.innerHTML = rows.map((m) => {
      const st = m.status === 'blocked' ? ['חשבון גוגל חסום', 'blk'] : ['חשבון גוגל מחובר', ''];
      return '<div class="grow" data-uid="' + esc(m.user_id) + '"><div class="gtxt"><small class="' + st[1] + '">' + st[0] + '</small><span class="gem">' + esc(m.email || 'ללא מייל') + '</span></div>'
        + (m.status === 'blocked' ? gaBtn('approved', 'check', 'ביטול החסימה') : gaBtn('removed', 'unlink', 'ניתוק החשבון') + gaBtn('blocked', 'ban', 'חסימת החשבון', 'gred')) + '</div>';
    }).join('');
    box.hidden = false;
  }
  $('#pGoogle').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ga]'); if (!b || !sheet || !sheet.id) return;
    const uid = b.closest('[data-uid]').dataset.uid, to = b.dataset.ga, pid = sheet.id;
    const MSG = { removed: ['לנתק את החשבון?', 'החשבון יוסר מהמשתתף ולא יופיע אצלו יותר. אפשר להתחבר שוב עם גוגל ולחבר אותו מחדש בטלפון (לאותו משתתף או לאחר).', 'כן, ניתוק'], blocked: ['לחסום את החשבון?', 'החשבון ייחסם: אין כניסה לאזור האישי, ולא ניתן לחבר אותו מחדש עד שתבטלו את החסימה.', 'כן, חסימה'], approved: ['לבטל את החסימה?', 'החשבון יחזור להיות מחובר ומאושר, עם כניסה לאזור האישי.', 'כן, ביטול החסימה'] }[to];
    confirmAct(MSG[0], pid, null, async () => {
      try { await api(MEMBERS + '?user_id=eq.' + encodeURIComponent(uid) + '&participant_id=eq.' + pid, { method: 'PATCH', body: to === 'removed' ? { participant_id: null, status: 'removed' } : { status: to } }); /* ניתוק: הקישור למשתתף נמחק (החשבון יכול להתחבר שוב בטלפון); חסימה וביטול חסימה משאירים אותו משויך */ toast('עודכן'); loadGoogleAcc(partOf(pid)); } catch (err) { fail(err); }
    }, MSG[1], MSG[2], null, to === 'approved' ? { primary: true } : undefined);
  });
  /* מחיקת משתתף: פופאפ אישור מלמטה (לא חלון confirm של הדפדפן, שבטלפון עלול להיחסם בשקט ואז לא קורה כלום) */
  $('#pDelete').addEventListener('click', async () => {   // בלי שאלה: ההסרה הפיכה (active=false), והודעת הביטול היא הדרך חזרה, כמו בהחלקה ברשימה
    const p = partOf(sheet.id); if (!p) return;
    if (!(await deleteParticipant(p))) return;
    if (window.RosterUndo) window.RosterUndo.delete({ kind: 'person', itemId: p.id, label: 'הוסר: ' + p.name, onUndo: () => quickActive(p, true), onCommit: () => {} });
    else toast('הוסר');
  });
  /* the swipe actions of the participants list (admin-kit.js): the same remove and restore as the card, without touching the card's own buttons unless that card is the one open */
  async function quickActive(p, on) {
    await api(T.p + '?id=eq.' + p.id, { method: 'PATCH', body: { active: on } });
    p.active = on;
    if (state.inactiveNames) { if (on) state.inactiveNames.delete(p.id); else state.inactiveNames.set(p.id, p.name); }
    if (sheet && sheet.id === p.id) { $('#pDelete').hidden = !on; $('#pRestore').hidden = on; setTitle(p); }
    render();
  }
  async function deleteParticipant(p) {
    try {
      await api(T.p + '?id=eq.' + p.id, { method: 'PATCH', body: { active: false } });
      p.active = false;   // נשאר ב-state (מפגשים, הערות, היסטוריה); מוסתר רק ברשימת כל המשתתפים
      if (state.inactiveNames) state.inactiveNames.set(p.id, p.name);
      $('#pDelete').hidden = true; $('#pRestore').hidden = false; setTitle(p); render(); return true;   // הכרטיס נשאר פתוח באותו מקום, ובמקום המחיקה "החזרה לפעילות"
    } catch (err) { fail(err); return false; }
  }
  $('#pRestore').addEventListener('click', () => {   // משתתף מחוק חוזר להיות פעיל: חוזר לרשימת כל המשתתפים ולסינונים (הערת מערכת נרשמת בטריגר)
    const p = partOf(sheet.id); if (!p) return;
    askConfirm(p, 'החזרה לפעילות', '<b>' + esc(p.name) + '</b> יחזור לרשימת כל המשתתפים ולסינונים, עם כל ההיסטוריה שלו.', 'כן, להחזיר', async () => {
      try {
        await api(T.p + '?id=eq.' + p.id, { method: 'PATCH', body: { active: true } });
        p.active = true; if (state.inactiveNames) state.inactiveNames.delete(p.id);
        $('#pRestore').hidden = true; $('#pDelete').hidden = false; setTitle(p); render(); toast('הוחזר לפעילות');
      } catch (err) { fail(err); }
    });
  });

  /* ---------- חלון מפגש ---------- */
  const mDlg = $('#mDlg'), mForm = $('#mForm');
  let editingMeeting = null;
  const DIR_TOK = { re: /(?!)/g, label: (v) => v, max: 800 };   // הוראות הגעה: טקסט חופשי, בלי תוויות (אותו שדה כמו בנוסח תבנית הודעה)
  /* עורך המחירים של המפגש (קומפקטי, מהמוקדם למאוחר): מחיר רגיל (בלי מספר ימים) ומדרגות "החל מ-N ימים לפני" (N נבחר מרשימה); המדרגה האחרונה חלה עד יום המפגש */
  const mtOpt = (n, sel) => '<option value="' + n + '"' + (n === sel ? ' selected' : '') + '>' + n + '</option>';
  /* אותו עורך משמש את המפגש ואת סוג המפגש (פרטי ברירת המחדל); onChange נקרא אחרי כל שינוי שהסתיים (לשמירה מיידית בסוג) */
  function tierEditor(listSel, addSel, onChange) {
    const ed = { t: { base: 0, steps: [] } }, list = $(listSel), done = () => { if (onChange) onChange(); };
    ed.render = () => {
      const t = ed.t; t.steps.sort((a, b) => b.days - a.days);
      const pr = (v, k, lab) => '<label class="rfield field money mtf"><span>' + lab + '</span><input placeholder=" " data-k="' + k + '" type="number" inputmode="numeric" min="0" max="9999" value="' + v + '" /></label>';
      let h = '<div class="mt2row">' + pr(t.base, 'base', t.steps.length ? 'מחיר רגיל, מתחילת ההרשמה' : 'מחיר הכרטיס') + '</div>';
      t.steps.forEach((x, i) => {
        h += '<div class="mt2row">' + pr(x.price, 's' + i, 'מחיר') + '<label class="rfield field mtf"><span>ימים לפני המפגש</span><input placeholder=" " data-k="d' + i + '" type="number" inputmode="numeric" min="1" max="365" step="1" value="' + x.days + '" /></label><button type="button" class="mtdel" data-del="s' + i + '" aria-label="מחיקת מדרגה" title="מחיקת מדרגה">×</button></div>';
      });
      list.innerHTML = h;
    };
    /* הערך לשמירה, או null אם יש מחיר חסר או לא תקין */
    ed.value = () => {
      const t = ed.t, pt = { base: Number(t.base), steps: t.steps.map((x) => ({ days: Number(x.days), price: Number(x.price) })) };
      if (!Number.isFinite(pt.base) || pt.base < 0 || t.base === '' || pt.steps.some((x) => !Number.isFinite(x.price) || x.price < 0) || t.steps.some((x) => x.price === '')) return null;
      return { base: pt.base, steps: pt.steps.sort((a, b) => b.days - a.days) };
    };
    list.addEventListener('input', (e) => {
      const inp = e.target.closest('input'); if (!inp) return; const v = inp.value === '' ? '' : Math.max(0, Math.round(Number(inp.value))), k = inp.dataset.k;
      if (k === 'base') ed.t.base = v; else if (k[0] === 's') ed.t.steps[Number(k.slice(1))].price = v; else if (k[0] === 'd') ed.t.steps[Number(k.slice(1))].days = inp.value === '' ? '' : Math.max(1, Math.round(Number(inp.value)));
    });
    list.addEventListener('change', (e) => {
      const inp = e.target.closest('input');
      if (inp && inp.dataset.k && inp.dataset.k[0] === 'd') {   // ימים לפני: מספר שלם חיובי, בלי כפילות
        const i = Number(inp.dataset.k.slice(1)), d = Math.round(Number(inp.value));
        if (!(d >= 1)) { toast('מספר הימים צריך להיות מספר שלם חיובי'); ed.render(); return; }
        if (ed.t.steps.some((x, j) => j !== i && x.days === d)) { toast('כבר יש מדרגה שמתחילה באותו מספר ימים'); ed.render(); return; }
        ed.t.steps[i].days = d; ed.render(); done(); return;
      }
      if (inp) { done(); return; }
      const sel = e.target.closest('select'); if (!sel) return; const i = Number(sel.dataset.k.slice(1)), d = Number(sel.value);
      if (ed.t.steps.some((x, j) => j !== i && x.days === d)) { toast('כבר יש מדרגה שמתחילה באותו מספר ימים'); ed.render(); return; }
      ed.t.steps[i].days = d; ed.render(); done();
    });
    list.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (!d) return; ed.t.steps.splice(Number(d.dataset.del.slice(1)), 1); ed.render(); done(); });
    $(addSel).addEventListener('click', () => {
      const t = ed.t; let d = 1; while (t.steps.some((x) => x.days === d)) d++;
      const last = t.steps.length ? t.steps[t.steps.length - 1].price : Number(t.base) || 0;
      t.steps.push({ days: d, price: last }); ed.render(); done();
    });
    return ed;
  }
  /* ---------- שדה תאריך / שעה אחיד (31.10.26): רכיב אחד לכל שדות התאריך והשעה בדף ----------
     הערך מוצג כטקסט שלנו, מיושר לימין כמו כל השדות (הטקסט של הדפדפן שקוף; באנדרואיד הוא לא מתיישר לימין).
     inp.dataset.ph = פלייסהולדר (למשל השעה של סוג המפגש), ואחרי שינוי שלו קוראים ל-inp.dtPaint(); בלי ערך ובלי פלייסהולדר: "בחירת תאריך" / "בחירת שעה" באפור.
     גם השמה ישירה ל-value (מהקוד) מעדכנת את התצוגה */
  const DT_VAL = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  /* שדה טקסט עם תוויות: רכיב אחד לנוסח תבנית הודעה ולהוראות הגעה. ה-textarea נשאר מקור הערך (מוסתר; הקוד קורא וכותב value כרגיל, ובערך נשמר {שם} או הקישור), ומעליו אזור עריכה שבו כל שדה מוצג כתווית, בלי סוגריים ובלי קישור.
     o.re: מה שמוצג כתווית (ביטוי גלובלי); o.label(ערך): הטקסט של התווית; o.max: אורך מקסימלי. ta.tokInsert(ערך) משתיל תווית במקום הסמן */
  const TOK_VAL = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  function tokenField(ta, o) {
    const ZW = '​', ed = document.createElement('div'), lab = ta.parentNode.querySelector(':scope > span');
    ed.className = 'rf-box tokf'; ed.id = ta.id + 'Ed'; ed.contentEditable = 'true'; ed.dir = 'rtl'; ed.setAttribute('role', 'textbox'); ed.setAttribute('aria-multiline', 'true');
    if (lab) { lab.id = ta.id + 'Lab'; ed.setAttribute('aria-labelledby', lab.id); }
    ta.__rf = 1; ta.classList.add('tokta'); ta.after(ed);
    const chip = (v) => '<span class="tok" contenteditable="false" data-v="' + esc(v) + '">' + esc(o.label(v)) + '</span>' + ZW;   // סימן בלתי נראה אחרי התווית: כדי שאפשר יהיה להעמיד אחריה את הסמן (לא נשמר)
    const plain = (s) => esc(s).replace(/\n/g, '<br>');
    const toHtml = (s) => { let h = '', i = 0; for (const m of String(s).matchAll(o.re)) { h += plain(s.slice(i, m.index)) + chip(m[0]); i = m.index + m[0].length; } return h + plain(s.slice(i)); };
    const read = (root) => {
      let s = '';
      const walk = (n) => n.childNodes.forEach((c) => {
        if (c.nodeType === 3) s += c.data.replace(/​/g, '').replace(/ /g, ' ');
        else if (c.nodeType !== 1) return;
        else if (c.dataset.v != null) s += c.dataset.v;
        else if (c.tagName === 'BR') s += '\n';
        else { if (/^(DIV|P)$/.test(c.tagName) && s && !s.endsWith('\n')) s += '\n'; walk(c); }
      });
      walk(root); return s.replace(/\n$/, '');   // <br> אחרון הוא רק מקום לסמן
    };
    const sync = () => { const v = read(ed), ch = TOK_VAL.get.call(ta) !== v; ed.classList.toggle('isempty', !v); if (ch) { TOK_VAL.set.call(ta, v); ta.dispatchEvent(new Event('input', { bubbles: true })); } };
    const paintPh = () => { ed.dataset.ph = String(ta.getAttribute('placeholder') || '').trim().replace(o.re, (m) => o.label(m)); ed.toggleAttribute('data-hint', ta.hasAttribute('data-hint')); };
    Object.defineProperty(ta, 'value', { configurable: true, get() { return TOK_VAL.get.call(this); }, set(x) { const v = String(x == null ? '' : x); TOK_VAL.set.call(this, v); ed.innerHTML = toHtml(v); ed.classList.toggle('isempty', !v); if (window.RField) RField.sync(); } });
    new MutationObserver(paintPh).observe(ta, { attributes: true, attributeFilter: ['placeholder', 'data-hint'] });
    let saved = null, was = '';
    document.addEventListener('selectionchange', () => { const s = getSelection(); if (s && s.rangeCount && ed.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); });
    const put = (html) => {
      ed.focus();
      const s = getSelection();
      if (saved && ed.contains(saved.startContainer)) { s.removeAllRanges(); s.addRange(saved); } else { s.selectAllChildren(ed); s.collapseToEnd(); }
      document.execCommand('insertHTML', false, html); sync();
    };
    ta.tokInsert = (v) => put(chip(v));
    ta.tokLock = (on) => { ed.contentEditable = on ? 'false' : 'true'; ed.classList.toggle('locked', on); ed.setAttribute('aria-disabled', on ? 'true' : 'false'); };   // שדה נעול: אי אפשר לכתוב בו ואין בו סמן
    /* מחיקה לאחור כשהסמן מיד אחרי תווית: התווית נמחקת בלחיצה אחת, גם עם הסימן הבלתי נראה שאחריה */
    const delChip = () => {
      const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return false;
      const n = s.anchorNode, off = s.anchorOffset; let prev;
      if (n.nodeType === 3) { if (n.data.slice(0, off).replace(/​/g, '')) return false; prev = n.previousSibling; } else prev = n.childNodes[off - 1] || null;
      while (prev && prev.nodeType === 3 && !prev.data.replace(/​/g, '')) prev = prev.previousSibling;
      if (!prev || prev.nodeType !== 1 || prev.dataset.v == null) return false;
      const r = document.createRange(); r.setStartBefore(prev); r.setEnd(n, off); s.removeAllRanges(); s.addRange(r); document.execCommand('delete'); sync(); return true;
    };
    ed.addEventListener('beforeinput', (e) => {
      const t = e.inputType || '';
      if (/^format/.test(t)) { e.preventDefault(); return; }
      if (t === 'insertParagraph' || t === 'insertLineBreak') { e.preventDefault(); document.execCommand('insertLineBreak'); sync(); return; }
      if (t === 'deleteContentBackward' && delChip()) { e.preventDefault(); return; }
      if (o.max && /^insert/.test(t) && e.cancelable && read(ed).length + String(e.data || '').length > o.max) e.preventDefault();
    });
    ed.addEventListener('input', (e) => { e.stopPropagation(); sync(); });
    ed.addEventListener('focus', () => { was = TOK_VAL.get.call(ta); });
    ed.addEventListener('blur', () => { if (TOK_VAL.get.call(ta) !== was) ta.dispatchEvent(new Event('change', { bubbles: true })); });
    ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertHTML', false, toHtml((e.clipboardData.getData('text/plain') || '').replace(/\r/g, ''))); sync(); });
    ed.addEventListener('drop', (e) => e.preventDefault());
    const clip = () => { const box = document.createElement('div'); box.append(getSelection().getRangeAt(0).cloneContents()); return read(box); };
    ed.addEventListener('copy', (e) => { e.preventDefault(); e.clipboardData.setData('text/plain', clip()); });
    ed.addEventListener('cut', (e) => { e.preventDefault(); e.clipboardData.setData('text/plain', clip()); document.execCommand('delete'); sync(); });
    ed.classList.add('isempty'); paintPh();
    return ta;
  }
  /* התוויות שמתחת לשדה: לחיצה לא לוקחת את הפוקוס מהשדה, כדי שהתווית תיכנס במקום הסמן */
  const keepCaret = (box) => box.addEventListener('mousedown', (e) => { if (e.target.closest('[data-v]')) e.preventDefault(); });
  function dtField(inp) {
    if (!inp || inp.dtPaint) return inp;
    const box = document.createElement('span'); box.className = 'rf-box dtbox';
    inp.parentNode.insertBefore(box, inp); box.append(inp);
    const v = document.createElement('i'); v.className = 'dtv'; v.setAttribute('aria-hidden', 'true'); box.append(v);
    const paint = () => {
      const raw = DT_VAL.get.call(inp), isD = inp.type === 'date';
      v.textContent = raw ? (isD ? raw.split('-').reverse().join('.') : raw.slice(0, 5)) : (inp.dataset.ph || (inp.dataset.noph ? '' : isD ? 'בחירת תאריך' : 'בחירת שעה'));
      v.classList.toggle('ph', !raw);
    };
    Object.defineProperty(inp, 'value', { configurable: true, get() { return DT_VAL.get.call(this); }, set(x) { DT_VAL.set.call(this, x); paint(); } });
    inp.addEventListener('input', paint); inp.addEventListener('change', paint);
    inp.dtPaint = paint; paint();
    return inp;
  }
  document.querySelectorAll('.field input[type="date"], .field input[type="time"]').forEach(dtField);   // השדות שכבר בדף (טופס הכספים, תשלום לשיווק ממומן)

  /* ---------- פרטי מפגש: אלמנט אחד לעריכת מפגש ולפרטי ברירת המחדל של סוג מפגש (31.10.26) ----------
     סדר (בלי כותרות סעיפים): שם, תאריך ושעה, עיר ומיקום, הוראות הגעה מרובות שורות, תבניות הודעה, כמות משתתפים, מחירים, תמונה.
     התמונה היא אריח אחד: לחיצה עליו בוחרת או מחליפה תמונה, ו-× על התמונה עצמה מסיר אותה (במפגש עם סוג: חוזר לתמונה של הסוג).
     במפגש עם סוג: שדה ריק = "כמו בסוג", והערך של הסוג מוצג כפלייסהולדר (בשעה: טקסט אפור בתוך השדה, במחירים שורת סיכום, בתמונה התמונה של הסוג עמומה).
     typOf: הסוג שממנו יורשים (במפגש), או null (בסוג עצמו, ובמפגש כשאין סוגים) */
  const INH_FIELDS = ['name', 'meeting_time', 'place', 'city', 'max_participants', 'directions', 'price_tiers'];
  const tiersText = (t) => { const q = tiersOf(t); return '₪' + q.base + q.steps.slice().sort((a, b) => b.days - a.days).map((x) => ', ₪' + x.price + ' החל מ-' + x.days + ' ימים לפני').join(''); };
  function meetingFields(p, isType, typOf) {
    const q = (s) => $('#' + p + s), I = (s) => p + s;
    q('MF').innerHTML =
      (isType ? '' : '<div class="mfrow mfname">') +
      '<label class="rfield field"><span>' + (isType ? 'שם סוג המפגש' : 'שם המפגש') + '</span><input placeholder=" " id="' + I('Name') + '" type="text" maxlength="80" autocomplete="off" /></label>' +
      (isType ? '' : '<span id="' + I('TypeSlot') + '"></span></div>') +
      '<div class="mfrow">' +
        (isType ? '' : '<label class="rfield field"><span>תאריך</span><input id="' + I('Date') + '" name="date" type="date" required /></label>') +
        '<label class="rfield field"><span>שעה</span><input id="' + I('Time') + '" name="time" type="time" /></label>' +
        '<label class="rfield field"><span>משתתפים</span><input placeholder=" " id="' + I('Max') + '" name="max" type="number" inputmode="numeric" min="1" max="500" step="1" /></label></div>' +
      '<div class="mfrow">' +
        '<label class="rfield field"><span>עיר</span><input placeholder=" " id="' + I('City') + '" name="city" type="text" maxlength="40" autocomplete="off" /></label>' +
        '<label class="rfield field"><span>מיקום</span><input placeholder=" " id="' + I('Place') + '" name="place" type="text" maxlength="60" autocomplete="off" /></label></div>' +
      '<div class="rfield field"><span>הוראות הגעה</span><textarea placeholder=" " id="' + I('Dirs') + '" name="directions" rows="1"></textarea></div>' +
      '<small class="mfh" id="' + I('TplHead') + '"' + (isType ? '' : ' hidden') + '>הודעות</small>' +
      (isType ? '' : '<div class="mtinh2" id="' + I('TplInh') + '" hidden></div>') + '<div class="mtlist" id="' + I('Tpl') + '"></div>' +
      '<button type="button" id="' + I('TplAdd') + '" data-fab="הוספת הודעה"></button>' +
      '<button type="button" class="mfshort" id="' + I('PriceBtn') + '"><span>מחירים</span><small></small>' + icon('chev') + '</button>' +
      (isType ? '<button type="button" class="mfshort" id="' + I('PassBtn') + '"><span>כרטיסיות</span><small></small>' + icon('chev') + '</button>' : '') +
      '<div class="mfstore" hidden><div class="rfield field" id="' + I('PriceF') + '"><span class="mtl">מחירים' + (isType ? '' : '<button type="button" class="lnk" id="' + I('TierOwn') + '" hidden>שינוי למפגש הזה</button><button type="button" class="lnk" id="' + I('TierReset') + '" hidden>כמו בסוג המפגש</button>') + '</span>' +
        (isType ? '' : '<div class="mtinh" id="' + I('TierInh') + '" hidden><span id="' + I('TierInhTxt') + '"></span></div>') +
        '<div class="mfted" id="' + I('TierEd') + '"><div class="mt2" id="' + I('TierList') + '"></div><div class="mt2add"><button type="button" id="' + I('TierAdd') + '" data-fab="הוספת מדרגה"></button></div></div></div>' +
      (isType ? '<div class="rfield field" id="' + I('PassF') + '"><span class="mtl">כרטיסיות</span><div class="mt2" id="' + I('PassList') + '"></div><div class="mt2add"><button type="button" id="' + I('PassAdd') + '" data-fab="הוספת כרטיסייה"></button></div></div>' : '') + '</div>';
    { const tf = !isType && $('#' + p + 'TypeF'), slot = q('TypeSlot'); if (slot) { if (tf) slot.replaceWith(tf); else slot.remove(); } }   // סוג המפגש באותה שורה עם שם המפגש
    const F = { te: tierEditor('#' + I('TierList'), '#' + I('TierAdd'), () => F.changed()), tiersInh: false, passes: [] };
    const ty = () => (typOf ? typOf() : null);
    /* כרטיסיות (רק בסוג מפגש): שורות {n מפגשים, price}; נשמרות בעמודה passes */
    F.paintPasses = () => {
      const L = q('PassList'); if (!L) return;
      L.innerHTML = F.passes.map((x, i) => '<div class="mt2row"><label class="rfield field mtf"><span>מספר מפגשים</span><input placeholder=" " data-pk="n' + i + '" type="number" inputmode="numeric" min="2" max="50" value="' + (x.n || '') + '" /></label><label class="rfield field money mtf"><span>מחיר</span><input placeholder=" " data-pk="p' + i + '" type="number" inputmode="numeric" min="1" max="99999" value="' + (x.price || '') + '" /></label><button type="button" class="medit" data-pdel="' + i + '" aria-label="הסרת כרטיסייה">' + icon('close', 'i16') + '</button></div>').join('');
    };
    if (isType) {
      q('PassList').addEventListener('input', (e) => { const i = e.target.closest('input'); if (!i) return; const k = i.dataset.pk, v = i.value === '' ? '' : Math.round(Number(i.value)); F.passes[Number(k.slice(1))][k[0] === 'n' ? 'n' : 'price'] = v; });
      q('PassList').addEventListener('change', () => F.changed());
      q('PassList').addEventListener('click', (e) => { const b = e.target.closest('[data-pdel]'); if (!b) return; F.passes.splice(Number(b.dataset.pdel), 1); F.paintPasses(); F.changed(); });
      q('PassAdd').addEventListener('click', () => { F.passes.push({ n: 4, price: '' }); F.paintPasses(); const ins = q('PassList').querySelectorAll('input'); if (ins.length) ins[ins.length - 1].focus(); });
    }
    if (isType) q('Time').dataset.noph = '1';   // בסוג המפגש בלי פלייסהולדר
    dtField(q('Time')); if (!isType) dtField(q('Date'));   // תאריך ושעה: הרכיב האחיד (מיושר לימין, פלייסהולדר של הסוג)
    F.q = q;
    tokenField(q('Dirs'), DIR_TOK);
    /* תבניות הודעה: בטופס רק רשימת שמות; לחיצה על שם, או "+ תבנית הודעה", פותחת את פופאפ עריכת ההודעה (openTplPop), אותו פופאפ בכל המקומות.
       במפגש או סוג קיימים הפופאפ שומר ישירות; בחדשים השורות מחכות כאן (F.tpl.rows) ונשמרות כשיוצרים אותם */
    const mfBox = q('MF'), tplBox = q('Tpl');
    /* שמירה אוטומטית של מפגש או סוג שכבר קיימים (F.owner, F.write): בכל שינוי בטופס; בשדות טקסט בעזיבת השדה, ובסגירת הפופאפ גם מה שהוקלד ועוד לא נעזב. שמירה אחת בכל פעם. מפגש או סוג חדשים נוצרים בכפתור */
    let saving = false, again = false;
    F.edited = false;   // יש שינוי שעוד לא נשמר: מפעיל את כפתור השמירה (שמירה רק בלחיצה עליו)
    F.changed = () => { F.dirty = false; if (!F.write) return; F.edited = true; if (F.onEdit) F.onEdit(); };
    F.save = async () => {
      if (!F.write) return;
      if (saving) { again = true; return; }
      saving = true;
      try { do { again = false; await F.write(); } while (again); F.edited = false; } finally { saving = false; if (F.onEdit) F.onEdit(); }
    };
    mfBox.addEventListener('input', () => { F.dirty = true; if (F.write) { F.edited = true; if (F.onEdit) F.onEdit(); } });
    mfBox.addEventListener('change', (e) => { if (e.target.type !== 'file' && !e.target.closest('#' + I('TierList'))) F.changed(); });
    F.tpl = { rows: [], ownerId: null };
    F.tpl.scope = () => F.tpl.ownerId ? (isType ? { type_id: F.tpl.ownerId } : { meeting_id: F.tpl.ownerId }) : null;
    F.tpl.list = () => F.tpl.ownerId ? (isType ? tplsOfType(F.tpl.ownerId) : tplsOfMeeting(F.tpl.ownerId)) : F.tpl.rows;
    F.tpl.render = () => {
      if (!isType) { tplBox.innerHTML = ''; return; }   // אין הודעות למפגש עצמו, רק לסוג המפגש
      const l = F.tpl.list(), sys = state.tpls.find((x) => x.system_key === 'confirm');   // הכותרת "הודעות" תמיד מוצגת, וראשונה בה "אישור מקום" של המערכת
      tplBox.innerHTML = '<div class="emvars">' + (sys ? '<button type="button" data-tplpop="' + esc(sys.id) + '">' + esc(sys.name) + '</button>' : '') + l.map((r, i) => '<button type="button" data-i="' + i + '">' + esc(r.name || 'תבנית חדשה') + '</button>').join('') + '</div>';
    };
    F.paintTplInh = () => {   // במפגש: תבניות הסוג. אותה שורה כמו תבנית של המפגש, ולחיצה פותחת את פופאפ עריכת ההודעה
      const box = q('TplInh'); if (!box) return;
      const t = ty(), sys = state.tpls.find((x) => x.system_key === 'confirm'), l = (sys ? [sys] : []).concat(t ? tplsOfType(t.id) : []);   // "אישור מקום" של המערכת, ואחריו הודעות הסוג
      const head = q('TplHead'); if (head) head.hidden = !l.length;   // במפגש: הכותרת רק כשיש מה להציג
      box.hidden = !l.length; box.innerHTML = l.length ? '<div class="emvars">' + l.map((x) => '<button type="button" data-tplpop="' + esc(x.id) + '">' + esc(x.name) + '</button>').join('') + '</div>' : '';
    };
    tplBox.addEventListener('click', (e) => { const sp = e.target.closest('[data-tplpop]'); if (sp) { openTplPop(sp.dataset.tplpop); return; } const b = e.target.closest('[data-i]'), r = b && F.tpl.list()[Number(b.dataset.i)]; if (!r) return; if (r.id) openTplPop(r.id); else openTplPop(null, { draft: F, row: r }); });
    if (q('TplInh')) q('TplInh').addEventListener('click', (e) => { const b = e.target.closest('[data-tplpop]'); if (b) openTplPop(b.dataset.tplpop); });
    if (!isType) q('TplAdd').hidden = true;
    q('TplAdd').addEventListener('click', () => { const sc = F.tpl.scope(); if (sc) { openTplPop(null, { scope: sc }); return; } const row = { id: null, name: '', body: '' }; F.tpl.rows.push(row); F.tpl.render(); openTplPop(null, { draft: F, row }); });
    F.paintTiers = () => {
      if (isType) return;
      const t = ty(), inh = !!(t && F.tiersInh);
      q('TierInh').hidden = !inh; q('TierEd').hidden = inh; q('TierOwn').hidden = !inh; q('TierReset').hidden = inh || !t;   // ליד הכותרת רק קישור אחד
      if (inh) q('TierInhTxt').textContent = tiersText(t);
    };
    /* פלייסהולדרים: הערכים של הסוג (במפגש עם סוג), אחרת דוגמה */
    /* מחירים וכרטיסיות: קיצורי דרך שפותחים פופאפ נוסף עם כותרת של סוג המפגש או המפגש; העורך עצמו עובר פיזית לפופאפ וחוזר בסגירה */
    const baseName = () => q('Name').value.trim() || (isType ? 'סוג מפגש' : ((q('Date') && q('Date').value) ? q('Date').value.split('-').reverse().slice(0, 2).join('.') : 'מפגש'));
    F.paintShort = () => {
      const pb = q('PriceBtn'), kb = q('PassBtn');
      if (pb) { const v = F.te.value(); pb.querySelector('small').textContent = F.tiersInh ? 'כמו בסוג המפגש' : v ? [v.base].concat(v.steps.map((x) => x.price)).map((x) => '₪' + x).join(' · ') : ''; }
      if (kb) { const ps = F.passes.filter((x) => Number(x.n) >= 2 && Number(x.price) > 0); kb.querySelector('small').textContent = ps.length ? ps.map((x) => x.n + ' ב-₪' + x.price).join(' · ') : 'אין'; }
    };
    F.openPop = (kind) => {
      const node = q(kind === 'pass' ? 'PassF' : 'PriceF'), dlg = $('#mfPopDlg'), body = $('#mfPopBody'), home = node.parentNode; if (!node || !dlg) return;
      { const pf = dlg.querySelector('form'); if (pf) pf.onsubmit = (e) => { e.preventDefault(); return false; }; }
      $('#mfPopTitle').textContent = kind === 'pass' ? 'כרטיסיות' : 'מדרגות מחיר';
      body.appendChild(node);
      const back = () => { dlg.removeEventListener('close', back); home.appendChild(node); F.paintTiers && F.paintTiers(); F.paintShort(); };
      dlg.addEventListener('close', back); dlg.showModal();
    };
    { const pb = q('PriceBtn'), kb = q('PassBtn'); if (pb) pb.addEventListener('click', () => F.openPop('price')); if (kb) kb.addEventListener('click', () => F.openPop('pass')); }
    F.paint = () => {
      const t = ty();
      /* בסוג המפגש בלי פלייסהולדרים בכלל; במפגש הפלייסהולדר הוא הערך שנלקח מהסוג (או דוגמה כשאין סוג) */
      /* ערך שנלקח מסוג המפגש נשאר גלוי מתחת לתווית; דוגמה מופיעה רק בפוקוס; בסוג מפגש אין פלייסהולדר */
      const setPh = (el, inh, ex) => { el.placeholder = isType ? ' ' : inh || ex; el.toggleAttribute('data-hint', !isType && !inh); };
      setPh(q('Name'), t && t.name, 'למשל: מפגש פתיחת עונה');
      setPh(q('Place'), t && t.place, 'למשל: האולם הגדול');
      setPh(q('City'), t && t.city, 'למשל: חיפה');
      setPh(q('Max'), t && t.max_participants != null ? String(t.max_participants) : '', 'ללא הגבלה');
      setPh(q('Dirs'), t && t.directions, 'כתובת, קומה, חנייה, ואיך מגיעים בתחבורה ציבורית');
      q('Time').dataset.ph = t && t.meeting_time ? String(t.meeting_time).slice(0, 5) : ''; q('Time').dtPaint();
      F.paintTiers(); F.paintTplInh(); F.paintShort();
    };
    /* מילוי: src = מפגש או סוג; inh = השדות שנלקחים מהסוג (מוצגים ריקים) */
    F.fill = (src, inh) => {
      F.dirty = false; const s = src || {}, h = inh || new Set(), t = ty(), v = (k, x) => (t && h.has(k)) ? '' : x;
      q('Name').value = v('name', s.name || ''); q('Time').value = v('meeting_time', s.meeting_time ? String(s.meeting_time).slice(0, 5) : '');
      q('Place').value = v('place', s.place || ''); q('City').value = v('city', s.city || ''); q('Dirs').value = v('directions', s.directions || '');
      q('Max').value = v('max_participants', s.max_participants == null ? '' : s.max_participants);
      F.tiersInh = !!t && h.has('price_tiers'); F.te.t = tiersOf(F.tiersInh ? t : s); F.te.render();
      F.passes = isType ? (Array.isArray(s.passes) ? s.passes.map((x) => ({ n: Number(x.n), price: Number(x.price) })) : []) : []; F.paintPasses();
      F.tpl.rows = []; F.tpl.ownerId = s.id || null; F.tpl.render();
      F.paint();
    };
    /* קריאה לשמירה: { body, inherit } או { err, el }. במפגש עם סוג שדה ריק נרשם ב-inherit ומקבל את ערך הסוג */
    F.read = () => {
      const t = ty(), inherit = [], body = {};
      const take = (k, raw, own, def) => { if (raw === '' && t) { inherit.push(k); body[k] = def; } else body[k] = own; };
      const tx = (s) => q(s).value.trim(), mx = q('Max').value;
      const name = tx('Name').slice(0, 80);
      if (isType && !name) return { err: 'חסר שם לסוג המפגש', el: q('Name') };
      take('name', name, name || null, (t && t.name) || null);
      take('meeting_time', q('Time').value, q('Time').value || (isType ? null : '20:00'), (t && t.meeting_time) || '20:00');
      take('place', tx('Place'), tx('Place') || null, (t && t.place) || null);
      take('city', tx('City'), tx('City') || null, (t && t.city) || null);
      take('directions', tx('Dirs'), isType ? (tx('Dirs') || null) : tx('Dirs'), (t && t.directions) || '');
      take('max_participants', mx, mx === '' ? null : Math.max(1, Math.min(500, parseInt(mx, 10) || 1)), t ? t.max_participants : null);
      if (t && F.tiersInh) { inherit.push('price_tiers'); body.price_tiers = t.price_tiers || null; }
      else { body.price_tiers = F.te.value(); if (!body.price_tiers) return { err: 'מחיר חסר או לא תקין' }; }
      if (isType) { const ps = F.passes.filter((x) => x.n !== '' || x.price !== ''); if (ps.some((x) => !(Number(x.n) >= 2) || !(Number(x.price) > 0))) return { err: 'בכרטיסייה צריך מספר מפגשים (2 ומעלה) ומחיר' }; body.passes = ps.map((x) => ({ n: Number(x.n), price: Number(x.price) })).sort((a, b) => a.n - b.n); }
      return { body, inherit };
    };
    if (!isType) {
      q('TierOwn').addEventListener('click', () => { F.tiersInh = false; F.te.t = tiersOf(ty()); F.te.render(); F.paintTiers(); F.changed(); });   // מתחילים מהמחירים של הסוג
      q('TierReset').addEventListener('click', () => { F.tiersInh = true; F.paintTiers(); F.changed(); });
    }
    return F;
  }

  /* שמירת תבניות הודעה של סוג או מפגש: מחיקת שורות שהוסרו, עדכון שורות ששונו (שם, נוסח, סדר) והוספת חדשות. scope: { type_id } או { meeting_id } */
  async function saveTemplates(scope, rows) {
    const key = scope.type_id ? 'type_id' : 'meeting_id', sid = scope[key];
    const cur = state.tpls.filter((x) => x[key] === sid), keep = new Set(rows.filter((r) => r.id).map((r) => r.id));
    for (const x of cur.filter((o) => !keep.has(o.id))) { await api(T.tpl + '?id=eq.' + x.id, { method: 'DELETE' }); await api(T.sent + '?tpl_key=eq.' + x.id, { method: 'DELETE' }).catch(() => null); state.msgSent = state.msgSent.filter((m) => m.tpl_key !== x.id); }
    const fresh = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], o = cur.find((x) => x.id === r.id);
      if (o) { if (o.name !== r.name || o.body !== r.body || (o.sort || 0) !== i) { await api(T.tpl + '?id=eq.' + r.id, { method: 'PATCH', body: { name: r.name, body: r.body, sort: i } }); Object.assign(o, { name: r.name, body: r.body, sort: i }); } }
      else fresh.push({ r, i });
    }
    let made = [];
    if (fresh.length) made = (await api(T.tpl, { method: 'POST', body: fresh.map((f) => Object.assign({ name: f.r.name, body: f.r.body, sort: f.i }, scope)), prefer: 'return=representation' })) || [];
    state.tpls = state.tpls.filter((x) => x[key] !== sid || keep.has(x.id)).concat(made);
    return made;
  }

  /* עריכת מפגש: בלי טבלת סוגים, ההתנהגות הישנה (מהמפגש האחרון) */
  const mTyp = () => state.mtypes.length ? (typeById($('#mType').value) || typeById(firstTypeId())) : null;
  const mf = meetingFields('m', false, mTyp);
  function fillMeetingForm(m) {
    const ty = mTyp();
    if (m || ty) { mf.fill(m || {}, new Set(m ? (m.inherit || []) : (ty ? INH_FIELDS : []))); return; }
    const prev = state.meetings.slice().sort(meetDesc)[0] || {};
    mf.fill(Object.assign({}, prev, { id: null, meeting_time: prev.meeting_time || '20:00' }), null);
  }
  function fillTypeSel(tid) {
    const sel = $('#mType');
    sel.innerHTML = state.mtypes.map((t) => '<option value="' + t.id + '"' + (t.id === tid ? ' selected' : '') + '>' + esc(t.name || 'ללא שם') + '</option>').join('');
    $('#mTypeF').hidden = !state.mtypes.length;   // תמיד מוצג כשיש סוגים (גם סוג אחד), כדי שיהיה ברור לאיזה סוג המפגש שייך
  }
  $('#mType').addEventListener('change', () => mf.paint());   // החלפת סוג: השדות שנשארו ריקים מציגים את ברירות המחדל של הסוג החדש
  function openMeeting(id) {
    const m = id ? meetOf(id) : null;
    editingMeeting = m;
    $('#mDate').value = m ? m.meeting_date : '';
    const latest = state.meetings.slice().sort(meetDesc)[0] || null;
    const tid = m ? typeIdOf(m) : (state.mtype || typeIdOf(latest));   // מפגש חדש: מהסוג שנבחר בתפריט, אחרת מהסוג של המפגש האחרון
    fillTypeSel(tid);
    fillMeetingForm(m);
    $('#mTitle').textContent = m ? 'עריכת מפגש' : 'מפגש חדש';
    $('#mSubmit').hidden = false; $('#mSubmit').textContent = m ? 'שמירה' : 'יצירת מפגש'; mf.edited = false;   // מפגש קיים נשמר רק בלחיצה על שמירה (כבוי עד שינוי)
    $('#mDelete').hidden = !m;
    { const linked = !!(m && state.att.some((x) => x.meeting_id === m.id)); $('#mDelete').classList.toggle('locked', linked); $('#mDelete').title = linked ? 'לא ניתן למחוק מפגש שמשויכים אליו משתתפים' : ''; }
    mDlg.showModal();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();   // בלי פוקוס אוטומטי: המקלדת לא עולה בפתיחה
    syncUrl();
  }
  /* שדה מרובה שורות: מתחיל בשורה אחת ומתרחב לפי הטקסט */
  function autoGrow(ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + ta.offsetHeight - ta.clientHeight, 260) + 'px'; }

  /* גוף הבקשה מהטופס, או null (עם הודעה). שדה ריק עם סוג = "כמו בסוג": נשמר הערך של הסוג ונרשם ב-inherit; שדה מלא = ערך משלו */
  async function meetingBody() {
    const date = $('#mDate').value;
    if (!date) { $('#mDate').focus(); toast('חסר תאריך'); return null; }
    const r = mf.read(); if (r.err) { toast(r.err); if (r.el) r.el.focus(); return null; }
    const body = Object.assign({ meeting_date: date }, r.body), inherit = r.inherit;
    if (state.mtypes.length) { body.type_id = $('#mType').value || firstTypeId(); body.inherit = inherit; }   // סוג המפגש, והשדות שנלקחים ממנו
    return body;
  }
  mf.owner = () => editingMeeting ? { meeting_id: editingMeeting.id } : null;
  mf.write = async () => {
    if (!editingMeeting) return;
    const m = editingMeeting, body = await meetingBody(); if (!body) return;
    try {
      await api(T.m + '?id=eq.' + m.id, { method: 'PATCH', body, ui: false });
      Object.assign(m, body); { const live = meetOf(m.id); if (live && live !== m) Object.assign(live, body); }
      sortMeetings(); render();
    } catch (err) { fail(err); }
  };
  mForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (editingMeeting) { const a = document.activeElement; if (a && a.blur) a.blur(); if (!mf.edited) return; const btn0 = $('#mSubmit'); btn0.disabled = true; await mf.save(); toast('נשמר'); syncCreate(); return; }   // מפגש קיים: נשמר רק בלחיצה על שמירה
    const body = await meetingBody(); if (!body) return;
    const btn = $('#mSubmit'); btn.disabled = true;
    try {
      const [m] = await api(T.m, { method: 'POST', body, prefer: 'return=representation' });
      state.meetings.push(m);
      state.filter = m.id;
      editingMeeting = m;
      await saveTemplates({ meeting_id: m.id }, mf.tpl.rows);
      mf.dirty = false; sortMeetings(); mDlg.close(); render();
    } catch (err) { fail(err); }
    btn.disabled = false;
  });

  $('#mDelete').addEventListener('click', async () => {
    const m = editingMeeting;
    const blocked = () => toast('לא ניתן למחוק מפגש שמשויכים אליו משתתפים. קודם צריך להסיר את השיוכים');
    if (state.att.some((a) => a.meeting_id === m.id)) { blocked(); return; }
    try { const rows = await api(T.a + '?meeting_id=eq.' + m.id + '&select=participant_id&limit=1'); if (rows && rows.length) { blocked(); return; } } catch (err) { fail(err); return; }   // בדיקה גם בבסיס הנתונים (כולל משתתפים לא פעילים)
    confirmAct('מחיקת מפגש', null, null, async () => {   // the page's own confirm popup (no native window); the undo toast follows the delete
      try {
        await api(T.m + '?id=eq.' + m.id, { method: 'DELETE' });
        state.meetings = state.meetings.filter((x) => x !== m);
        state.att = state.att.filter((a) => a.meeting_id !== m.id);
        state.filter = null; mf.dirty = false; mDlg.close(); render();
      } catch (err) { fail(err); }
    }, 'המפגש <b class="nb">' + esc(meetingLabel(m)) + '</b> יימחק. אפשר לבטל מיד אחרי.', 'מחיקה', null, { plain: true });
  });

  /* ---------- אירועים כלליים ---------- */
  pDlg.addEventListener('close', () => { if (pDlg.open) return; lastPid = sheet && sheet.id || null; sheet = null; openPid = null; syncUrl(); markSel(); });   // האירוע מגיע אחרי הסגירה: אם הפופאפ כבר נפתח מחדש (משתתף חדש מעל כרטיס שבצד), לא מאפסים אותו
  mDlg.addEventListener('close', () => { mf.edited = false; syncUrl(); });
  pForm.phone.addEventListener('input', () => badPhone(false));
  pForm.email.addEventListener('input', () => badEmail(false));

  { const q = $('#q'); q.addEventListener('focus', () => {});  }   // בשורה הצרה רק "חיפוש"; בפוקוס התיבה נפתחת ומוצג הטקסט המלא
  $('#qClear').addEventListener('mousedown', (e) => e.preventDefault());
  $('#qClear').addEventListener('mousedown', (e) => e.preventDefault());   // לא לגרום לפוקוס לקפוץ לפני הלחיצה
  /* שני שלבים: לחיצה ראשונה מוחקת את הטקסט (התיבה נשארת פתוחה), שנייה סוגרת את התיבה (קיפול וסגירת המקלדת) */
  const hideKb = () => { try { if (navigator.virtualKeyboard && navigator.virtualKeyboard.hide) navigator.virtualKeyboard.hide(); } catch (_) {} };   // סוגר את המקלדת גם כשה-blur לבד לא מספיק
  const closeSearchBox = () => { const q = $('#q'); const had = !!q.value; q.value = ''; state.q = ''; q.blur(); if (document.activeElement && document.activeElement !== document.body) { try { document.activeElement.blur(); } catch (_) {} } hideKb(); if (had) { renderList(); syncUrl(); } };
  $('#qClear').addEventListener('click', () => { const q = $('#q'); if (q.value) { q.value = ''; state.q = ''; renderList(); syncUrl(); q.focus(); } else closeSearchBox(); });   // X: עם טקסט מנקה בלבד; בלי טקסט סוגר מקלדת וחוזר לזכוכית המגדלת
  $('#q').addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#qClear').click(); });
  /* המקלדת ירדה (חץ המקלדת במכשיר) ואין טקסט בחיפוש: החיפוש נסגר וחוזרים לזכוכית המגדלת, לא לאיקס */
  { const vv = window.visualViewport; let kbOpen = false;
    const kbNow = () => vv && window.innerHeight - vv.height > 120;
    if (vv) vv.addEventListener('resize', () => { const q = $('#q'); if (document.activeElement !== q) { kbOpen = false; return; } if (kbNow()) { kbOpen = true; return; } if (kbOpen) { kbOpen = false; if (!q.value) q.blur(); } });
    $('#q').addEventListener('focus', () => { kbOpen = !!kbNow(); }); }
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); syncUrl(); });

  $('#mMenu').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-filter], [data-mt]')) { e.preventDefault(); const d = e.target.dataset, sel = d.mt ? '[data-mt="' + d.mt + '"]' : '[data-filter="' + d.filter + '"]'; e.target.click(); const again = $('#mMenu').hidden ? $('#mSel') : $('#mMenu').querySelector(sel); if (again) again.focus(); } });   // התפריט צויר מחדש: הפוקוס נשאר על אותה שורה
  $('#mMenu').addEventListener('click', (e) => {
    if (e.target.closest('#addMeeting')) { closeMSel(); return openMeeting(null); }
    if (e.target.closest('#addType')) { closeMSel(); return createType(); }
    const et = e.target.closest('[data-edit-t]');
    if (et) { closeMSel(); return openTypeEditor(et.dataset.editT); }
    { const picked = e.target.closest('[data-filter], [data-mt]'); if (picked && !e.target.closest('[data-edit-t], [data-edit-m]') && picked.getAttribute('aria-checked') === 'true') { closeMSel(); return; } }   // לחיצה נוספת על מה שכבר נבחר סוגרת את התפריט
    const ty = e.target.closest('[data-mt]');    if (ty) { state.mtype = ty.dataset.mt; state.filter = null; render(); return; }   // בחירת סוג: תצוגה כמו "כל המשתתפים" מסוננת לסוג, והתפריט מציג רק את המפגשים שלו
    const ed = e.target.closest('[data-edit-m]');
    if (ed) { closeMSel(); return openMeeting(ed.dataset.editM); }
    const c = e.target.closest('[data-filter]');
    if (!c) return;
    pickFilter(c.dataset.filter || null);   // התפריט נשאר פתוח, והרשימה שמאחוריו מתעדכנת
  });
  const pickFilter = (id) => {
    updFrozen = null;
    state.filter = id;
    state.mtype = null;   // בחירה אחת בלבד בתפריט: כל המשתתפים, סוג מפגש או מפגש (בחירת מפגש מבטלת את בחירת הסוג)
    // (מצב המתג לא עוקב אחרי הצ'יף "הגיעו")   // הסינונים נשמרים במעבר בין מפגשים, וגם מצב ההגעה של עמודת הסימון (לפי הצ'יף "הגיעו")
    render();
  };
  $('#tagEditBtn').addEventListener('click', () => openStatusSettings());
  $('#nextMBtn').addEventListener('click', () => { const nm = nextMeetingOf(); if (nm) pickFilter(nm.id); });   // קיצור דרך למפגש הקרוב
  /* פאנל הסינון והתצוגה (31.10.26): כל הסינונים והטוגלים במקום אחד, נפתח מתגית הסינון שבשורת "סינון ומיון".
     לכל נושא כותרת עם טוגל תצוגה ("בשורה" / "ברשימה") ומתחתיה האפשרויות כתגיות עם הכמות; לחיצה נוספת על תגית נבחרת מבטלת אותה */
  const fsec = (title, body, extra) => '<div class="fsec"><div class="fsh"><b>' + title + '</b>' + (extra || '') + '</div>' + (body ? '<div class="mgc">' + body + '</div>' : '') + '</div>';
  const fedit = (what, label) => '<button type="button" class="fedit" data-fedit="' + what + '" aria-label="' + label + '" title="' + label + '">' + icon('edit') + '</button>';   // סמל עריכה בכותרת של קבוצה
  const DEFCOL = { gen: 'neutral', upd: 'sky', reg: 'sky', tag: 'neutral', src: 'neutral', age: 'green' };   // צבע ברירת מחדל לכל קטגוריה בתפריט הסינון
  const FK = { gen: 'gender', upd: 'updF', reg: 'regF', tag: 'pay', src: 'srcF', age: 'ageF', mc: 'mcF' };   // סוג הסינון בפאנל ← השדה ב-state
  function moreSecs() {
    const scope = state.participants.filter((p) => (state.filter ? linkOf(p.id, state.filter) : p.active !== false) && mtypeOk(p));   // כל המשתתפים בתצוגה: מהם נקבע אילו ערכים קיימים בכל קטגוריה (הם לא נעלמים בגלל סינון)
    /* הספירה בכל קטגוריה היא כמה מוצגים ברשימה אם בוחרים את הערך, לפי כל שאר הסינונים והחיפוש (בלי הסינון של אותה קטגוריה); המילוי הוא שיעור הערך מאותה קבוצה */
    const poolW = (ks) => { const sv = ks.map((k) => [k, state[k]]); ks.forEach((k) => { state[k] = null; }); try { const q = state.q.trim().toLowerCase(), qd = digits(q); return state.participants.filter((p) => rowPass(p, q, qd)); } finally { sv.forEach((o) => { state[o[0]] = o[1]; }); } };
    const mk = (ks) => { const pool = poolW(ks); return { pool, cnt: (f) => pool.filter(f).length, fill: (n) => '--fill:' + (pool.length ? Math.min(100, Math.round(n / pool.length * 100)) : 0) + '%' }; };
    const chip = (kind, val, label, n, col, g) => { const on = payKeys(state[FK[kind]]).includes(val), pc = PALETTE[col || DEFCOL[kind]]; return '<button type="button" class="mc' + (n || on ? '' : ' zero') + '" style="' + g.fill(n) + (pc ? ';--sbg:' + pc[0] + ';--sfg:' + pc[1] : '') + '"' + (pc ? ' data-sc="1"' : '') + ' data-mk="' + kind + '" data-mv="' + esc(val) + '" aria-pressed="' + on + '">' + (kind === 'age' ? '<bdi dir="ltr">' + esc(label) + '</bdi>' : esc(label)) + ' <small>' + n + '</small></button>'; };
    /* תשלום (בתוך מפגש) או קרדיט (בכל המשתתפים ובסוג מפגש): בחירה אחת (לחיצה נוספת מבטלת) */
    const pchip = (kind, val, label, n, col, g) => { const on = (kind === 'pay' ? state.paidF : state.bal) === val, pc = PALETTE[col]; return '<button type="button" class="mc' + (n || on ? '' : ' zero') + '" data-sc="1" style="' + g.fill(n) + ';--sbg:' + pc[0] + ';--sfg:' + pc[1] + '" data-mp="' + kind + '" data-mv="' + esc(val) + '" aria-pressed="' + on + '">' + esc(label) + ' <small>' + n + '</small></button>'; };
    let payCols = [];   // בתוך מפגש התשלום מפוצל לשתי קטגוריות: מצב התשלום, ודרך התשלום והסכום ששולם יחד
    if (state.filter) {
      const lab = FLAB.pay, mid = state.filter, g = mk(['paidF']);
      const amtOf = (p) => { const l = linkOf(p.id, mid); if (!l || noPayOf(p, l)) return 0; return Math.round(allocatedOf(p.id, mid)); };
      const allAm = {}, allPm = {};   // כל הסכומים ודרכי התשלום שקיימים במפגש (הקטגוריה לא נעלמת בגלל סינון)
      scope.forEach((p) => { const a = amtOf(p); if (a > 0) allAm[a] = 1; state.payMethods.forEach((pm) => { const l = linkOf(p.id, mid); if (l && !noPayOf(p, l) && paidVia(p.id, mid, pm.key)) allPm[pm.key] = 1; }); });
      payCols = [
        { t: 'מצב תשלום', items: [['0', 'red', lab[2]], ['l', 'sky', lab[4]], ['1', 'green', lab[1]], ['n', 'neutral', lab[3]]].map((o) => pchip('pay', o[0], o[2], g.cnt((p) => payF(p, o[0])), o[1], g)) },   // לתשלום, תשלום בהמשך, שולם, לא לתשלום (אותו סדר כמו במיון)
        { t: 'דרך תשלום וסכום', items: state.payMethods.filter((pm) => allPm[pm.key]).map((pm) => pchip('pay', 'm' + pm.key, pm.name, g.cnt((p) => { const l = linkOf(p.id, mid); return !!l && !noPayOf(p, l) && paidVia(p.id, mid, pm.key); }), 'green', g))
          .concat(Object.keys(allAm).map(Number).sort((a, b) => b - a).map((a) => pchip('pay', 'a' + a, '₪' + nfm(a), g.cnt((p) => amtOf(p) === a), 'green', g))) },
      ];   // הקטגוריות מוצגות תמיד, גם כשאין בהן עדיין תשלומים
    } else if (state.showPay) {
      const bl = FLAB.bal, g = mk(['bal']);
      payCols = [{ t: 'קרדיט', items: [['1', 'amber', bl[1]], ['0', 'red', bl[2]]].map((o) => pchip('bal', o[0], o[2], g.cnt((p) => balMatch(p, o[0])), o[1], g)) }];   // זכאי (קרדיט לטובת המשתתף) וחייב
    }
    const gU = mk(['updF']), gR = mk(['regF']), gS = mk(['srcF']), gA = mk(['ageF']), gM = mk(['mcF']);
    const ORD = ['עדכון אחרון', 'מועד הרשמה', 'מצב תשלום', 'קרדיט', 'שיווק ממומן', 'דרך תשלום וסכום', 'מספר מפגשים', 'גיל'];   // סדר הקטגוריות מימין לשמאל
    const ordCols = (cols) => cols.slice().sort((x, y) => ORD.indexOf(x.t) - ORD.indexOf(y.t));
    return ordCols([].concat(payCols, [   // עמודות הגריד: כותרת ותוויות
      { t: 'עדכון אחרון', sk: 'upd', items: UPD_B.map((b) => chip('upd', b[0], b[1], gU.cnt((p) => updWithin(p.id, b[2])), null, gU)) },
      { t: 'מועד הרשמה', sk: 'new', items: UPD_B.map((b) => chip('reg', b[0], b[1], gR.cnt((p) => regWithin(p, b[2])), null, gR)) },
      { t: 'שיווק ממומן', items: [chip('src', '__none', 'ללא שיווק ממומן', gS.cnt((p) => !channelAt(p, state.filter)), null, gS)].concat(state.promoters.map((x) => chip('src', x.id, x.name, gS.cnt((p) => (channelAt(p, state.filter) || {}).id === x.id), x.color || 'red', gS))) },
      { t: 'גיל', sk: 'age', items: AGE_B.map((b) => chip('age', b[0], b[1], gA.cnt((p) => { const a = shownAge(p); return a != null && a >= b[2] && a <= b[3]; }), null, gA)) },
      ...(state.filter ? [] : [{ t: 'מספר מפגשים', sk: 'meet', items: MC_B.map((b) => chip('mc', b[0], b[1], gM.cnt((p) => mcKey(p) === b[0]), 'sky', gM)) }]),
    ]));
  }
  const curMeeting = () => meetOf(state.filter) || null;
  /* יש סינון פעיל שלא רואים בשורת הסינון (כל מה שבפאנל חוץ ממגדר שמוצג בשורה): נקודה בתגית הסינון */
  const panelOn = () => !!(state.updF || state.regF || state.srcF || state.ageF || (state.mcF && !state.filter) || state.bal || (state.paidF && state.paidF !== 'r' && state.paidF !== 'u'));   // כל מה שבתפריט הסינון (כולל תשלום וקרדיט); "משוריינים" נראה בצ'יף ולכן לא נספר; סינוני השליחה וההגעה נראים באייקונים שמעל העמודות
  /* סמל מיון בשלושה מצבים ליד כותרת קטגוריה: לא פעיל, יורד, עולה (לחיצה מחזורית; לא פעיל = חזרה למיון לפי הרשמה) */
  const sortTri = (k) => { const on = state.sort === k, asc = on && state.sortDir === 'asc', lab = on ? (asc ? 'מיון עולה' : 'מיון יורד') : 'מיון לא פעיל'; return '<button type="button" class="sorttri' + (on ? ' on' : '') + '" data-stri="' + k + '" aria-label="' + lab + '" title="' + lab + '">' + icon(on ? (asc ? 'sup' : 'sdown') : 'sort', 'i16') + '</button>'; };
  function renderViewMenu() {
    const m = curMeeting();
    /* בלי שורת מונה בראש התפריט (31.10.26): התפריט נפתח מתחת לשורת הסינון, והמונה שבה נשאר גלוי */
    const cols = moreSecs();   // 2x2: שתי קבוצות בשורה, כל אחת עם הכותרת והתוויות שלה זו מתחת לזו
    $('#viewMenu').style.gridTemplateColumns = '';
    $('#viewMenu').innerHTML = cols.map((c) => { if (c.sk && c.sk !== 'upd' && c.sk !== 'new' && c.sk !== 'pay' && c.sk !== 'age' && c.sk !== 'meet' && state.sort === c.sk) { const n = (h) => +((h.match(/<small>(\d+)<\/small>/) || [])[1] || 0), d = state.sortDir === 'asc' ? 1 : -1; c.items = c.items.map((h, i) => [h, i]).sort((x, y) => d * (n(x[0]) - n(y[0])) || x[1] - y[1]).map((x) => x[0]); } return c; }).map((c) => '<div class="fsec"><div class="fsh"><b>' + c.t + '</b>' + (c.sk ? sortTri(c.sk) : '') + '</div><div class="mgc">' + c.items.join('') + '</div></div>').join('');
  }
  /* סינון לפי העמודות (תשלום, שליחת פרטי המפגש; בתצוגה הכללית קרדיט): אייקון מעל כל עמודה, לחיצה פותחת תפריט עם המצבים, אייקוניהם והכמות; הבחירה מבצעת את הסינון */
  let FC = {};   // ספירות לתפריטי הסינון, מתעדכן ב-renderFacets
  const fstate = (k) => k === 'sent' ? state.sent : k === 'bal' ? state.bal : state.paidF;
  const closeF = () => { $('#fMenu').hidden = true; $('#fMenu').dataset.kind = ''; };
  function openF(kind, anchor) {
    const m = $('#fMenu'); if (!m.hidden && m.dataset.kind === kind) { closeF(); return; }
    const place = () => { m.style.left = menuX(m, anchor) + 'px'; m.style.top = (anchor.getBoundingClientRect().bottom + 8) + 'px'; };
    const cur = fstate(kind) || null, lab = FLAB[kind];
    const opts = [[null, 'all', lab[0]]].concat(kind === 'pay' ? [['0', 'no', lab[2]], ['l', 'later', lab[4]], ['1', 'yes', lab[1]], ['n', 'fr', lab[3]]]   // תשלום: לתשלום, תשלום בהמשך, שולם, לא לתשלום (אותו סדר כמו במיון)
      : kind === 'bal' ? [['1', 'yes', lab[1]], ['0', 'no', lab[2]]] : [['1', 'yes', lab[1]], ['0', 'no', lab[2]]]);
    const inc = kind === 'pay' ? (state.paidF === 'r' ? ['1', 'n', 'l'] : state.paidF === 'u' ? ['0'] : []) : [];   // כשמסומן הצ'יף "משוריינים" / "לא משוריינים": המצבים שהוא כולל מסומנים כמו בבחירה ידנית
    const foptOf = (o) => UI.fopt(o[0] === null ? '' : o[0], cur === o[0] || (o[0] !== null && inc.includes(o[0])), o[1], o[3] || fglyph(kind, o[1]), o[2], (FC[kind] || {})[o[0] === null ? '' : o[0]] ?? 0);
    m.innerHTML = opts.map(foptOf).join('');   // תשלום: קודם החלוקה הגדולה (משוריינים), ומתחת המצבים בפירוט
    if (kind === 'pay') {   // בנוסף: סינון לפי דרך התשלום ולפי הסכום ששולם למפגש
      const pmc = FC.payMeth || {}, pks = state.payMethods.filter((pm) => pmc[pm.key]);
      if (pks.length) m.innerHTML += '<div class="fsep" role="separator"></div>' + pks.map((pm) => UI.fopt('m' + esc(pm.key), cur === 'm' + pm.key, 'yes', '₪', esc(pm.name), pmc[pm.key])).join('');
      const am = FC.payAmts || {}, ks = Object.keys(am).map(Number).sort((a, b) => b - a);
      if (ks.length) m.innerHTML += '<div class="fsep" role="separator"></div>' + ks.map((a) => UI.fopt('a' + a, cur === 'a' + a, 'yes', '₪', '₪' + nfm(a), am[a])).join('');
    }
    m.dataset.kind = kind; m.hidden = false; place();
  }
  $('#fMenu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fv]'); if (!b) return; const v = b.dataset.fv || null;
    const k = $('#fMenu').dataset.kind; if (k === 'sent') state.sent = v; else if (k === 'bal') state.bal = v; else state.paidF = v;
    closeF(); render(); syncUrl();
  });
  /* אייקוני הסינון מיושרים מעל העמודות שלהם ברשימה (₪, שליחה, קרדיט) */
  /* שלוש הנקודות (הסינון) מימין לימני באייקוני העמודות, ברווח של 8 פיקסל */
  function placeGen(br) {   // סינון ומיון צפים למטה: אין להם מקום בשורת הסינון
    const bar = $('#listTags'); bar.style.paddingLeft = '';
  }
  function alignFilters() {
    const bar = $('#listTags'); if (!bar) return; const br = bar.getBoundingClientRect();
    bar.style.paddingLeft = '';   // הריפוד השמאלי של השורה נקבע מחדש ב-placeGen, אחרי שהאייקונים הוצבו
    if (true) {   // הרשימה בכרטיסים (אין עמודות להתיישר מולן), וגם כשהיא ריקה: האייקונים בשורה מהשוליים השמאליים
      let x = (parseFloat(getComputedStyle(bar).paddingLeft) || 0) + ((document.querySelector('#listWa') || {}).offsetWidth || 0) + 8;   // עמודת הוואטסאפ בקצה השמאלי
      ['#listSent', '#listPay', '#listBal'].forEach((s) => { const b = document.querySelector(s); if (!b) return; const w = b.offsetWidth; if (!w) return; b.style.left = x + 'px'; x += w + 8; });
      placeGen(br); return;
    }
    [['#listPay', '#list .payic'], ['#listSent', '#list .evc'], ['#listBal', '#list .balic']].forEach(([box, ref]) => {
      const b = document.querySelector(box), r = document.querySelector(ref); if (!b) return;
      if (!r && box !== '#listSent') b.style.left = '';   // אין שורות להתיישר מולן: חוזרים למיקום הרגיל
      if (r) { const rr = r.getBoundingClientRect(), bb = (b.firstElementChild || b).getBoundingClientRect(); b.style.left = Math.round(rr.left + rr.width / 2 - br.left - (bb.left - b.getBoundingClientRect().left) - bb.width / 2) + 'px'; }
      else if (box === '#listSent') {   // אין בשורות עיגולי שליחה: האייקון באמצע בין אייקון התשלום להגעה, ולא נערם על אחד מהם
        const ic = (id) => { const e = document.querySelector(id + ' > *'); return e && e.getBoundingClientRect().width ? e.getBoundingClientRect() : null; }, a1 = ic('#listPay'), a2 = null, bb = (b.firstElementChild || b).getBoundingClientRect();
        const cx = a1 && a2 ? (a1.left + a1.width / 2 + a2.left + a2.width / 2) / 2 : a1 ? a1.left + a1.width / 2 + 40 : a2 ? a2.left + a2.width / 2 + 36 : null;
        if (cx != null && bb.width) b.style.left = Math.round(cx - br.left - (bb.left - b.getBoundingClientRect().left) - bb.width / 2) + 'px';
      }
    });    placeGen(br);
  }
  window.addEventListener('resize', alignFilters);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignFilters);
  /* תפריט הסינון והתצוגה: תפריט צף רגיל, מיושר לקצה הימני של כפתור הסינון, בלי הכהיית הדף */
  const noMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const closeView = () => {
    const m = $('#viewMenu'), b = $('#filtBtn'); if (b) b.setAttribute('aria-expanded', 'false');
    if (m.hidden) return;
    m.hidden = true; return;   // הפופאפ סוגר את עצמו באנימציה משלו
    m._closing = true;
    const a = m.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = () => { m._closing = false; m.hidden = true; a.cancel(); };
  };
  const listTagsClick = (e) => {
    const gb = e.target.closest('[data-stg]'); if (gb) { state.gender = state.gender === gb.dataset.stg ? null : gb.dataset.stg; render(); syncUrl(); return; }   // זכר / נקבה בשורת הסינון
    const wm = e.target.closest('[data-wm]');
    if (wm) {   // מתג מצב העמודה: רק "הודעה" פותחת את הפופאפ של בחירת התבנית והסינון
      const k = wm.dataset.wm;
      if (k === 'msg') { if (!waSelected()) { const lt = waLast(); if (lt) { closeWa(); waSetSel(lt.id); waResetSent(''); render(); const nb = $('#waMsgBtn'); if (nb) toggleWa(nb); return; } } toggleWa(wm); return; }   // הלחיצה על "הודעה" תמיד פותחת את הפופאפ; אם אין בחירה, קודם נבחרת ההודעה האחרונה שנבחרה
      closeWa();
      if (k === 'att') { if (!attMode()) { waSetSel(ATT_SEL); waResetSent(''); } }
      else if (waSelected() || attMode()) { waSetSel(''); waResetSent(''); }
      render(); return;
    }
    const fk = e.target.closest('[data-fk]'); if (fk) { openF(fk.dataset.fk, fk); return; }   // אייקון סינון מעל עמודה
    const fb = e.target.closest('#filtBtn'); if (!fb) return;
    const m = $('#viewMenu'); if (!m.hidden) { closeView(); return; }
    m.getAnimations().forEach((x) => x.cancel()); m._closing = false;
    renderViewMenu(); m.hidden = false; fb.setAttribute('aria-expanded', 'true');
    if (!noMotion()) m.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'ease-out' });
    const r = fb.getBoundingClientRect();   // הכפתור צף למטה: התפריט נפתח כלפי מעלה
    m.style.right = 'auto'; m.style.left = menuX(m, fb) + 'px';
    m.style.maxHeight = Math.max(240, r.top - 20) + 'px'; m.style.top = Math.max(8, Math.round(r.top - 8 - m.offsetHeight)) + 'px';
  };
  $('#listTags').addEventListener('click', listTagsClick);
  $('#chipRow').addEventListener('click', (e) => { if (e.target.closest('#filtBtn')) listTagsClick(e); });   // כפתור הסינון נמצא בשורת הצ'יפים
  /* עמודת הסימון (העמודה האחרונה ברשימה, והתפריט שלה בשורת הסינון): הודעה ריקה, תבניות הודעה (הסוג ואחריהן המפגש) ובתוך מפגש גם הגיע / לא הגיע.
     הבחירה נשמרת לכל תצוגה: בהודעה, קישור הוואטסאפ של כל משתתף ברשימה נפתח עם ההודעה המוכנה; בהגעה, בכל שורה הסימון של מי הגיע ומי לא */
  let waAddAsk = false;   // במפגש נבחר: לחיצה על "הוספת תבנית הודעה" שואלת אם להוסיף למפגש או לסוג המפגש
  const closeWa = () => { waAddAsk = false; $('#waMenu').hidden = true; document.querySelectorAll('#waBtn, #waMsgBtn').forEach((b) => b.setAttribute('aria-expanded', 'false')); };
  function renderWaMenu() {
    const am = false, sel = waSelected(), f = waFilter(), item = (id, ic, name, tag, on) => '<button type="button" role="menuitemradio" data-wt="' + esc(id) + '" aria-checked="' + on + '"><span class="wmi">' + ic + '<span class="wmn">' + esc(name) + '</span>' + (tag ? '<small>' + esc(tag) + '</small>' : '') + '</span></button>';
    /* מתחת לקו: סינון (לפי הגעה, או לפי שליחה של התבנית שנבחרה; לא בהודעה ריקה) ואחריו הוספת תבנית */
    const LB = am ? ['הגיע', 'לא הגיע'] : ['נשלח', 'לא נשלח'], cn = (am || sel) ? waCounts() : null, seg = cn ? '<div class="wseg" role="group" aria-label="' + (am ? 'סינון הרשימה לפי הגעה' : 'סינון הרשימה לפי שליחה של התבנית שנבחרה') + '">' + [['', 'הכל'], ['1', LB[0]], ['0', LB[1]]].map((o) => '<button type="button" class="wsf' + (cn[o[0]] || f === o[0] ? '' : ' zero') + '" data-wsf="' + o[0] + '" aria-pressed="' + (f === o[0]) + '"><span class="wmi"><span class="wdot">' + UI.fdot(f === o[0] && (o[0] === '1' ? 'green' : o[0] === '0' ? 'red' : 'yellow')) + '</span><span class="wmn">' + o[1] + ' <small>' + cn[o[0]] + '</small></span></span></button>').join('') + '</div>' : '', bot = seg + addRows();
    $('#waMenu').innerHTML =
      waList().map((x) => { const on = !!sel && sel.id === x.id, b = item(x.id, PIN_ICON, x.name || 'ללא שם', x.tag || '', on); return on ? '<div class="wrow">' + b + '<button type="button" class="wedit" role="menuitem" data-wedit="' + esc(x.id) + '" title="עריכת ההודעה" aria-label="עריכת ההודעה">' + icon('edit', 'i18') + '</button></div>' : b; }).join('') +
      (bot ? '<div class="wbot">' + bot + '</div>' : '');
    function addRows() {
      const inM = !!(state.filter && curMeeting()), row = (k, label) => '<button type="button" class="wadd" data-wadd="' + k + '"><span class="wmi">' + icon('plus') + '<span class="wmn">' + esc(label) + '</span></span></button>';
      if (!inM && !state.mtype) return '';
      if (inM && waAddAsk) return '<div class="wcap">להוסיף את התבנית:</div>' + row('meeting', 'למפגש הזה') + row('type', 'לסוג המפגש');
      return row('type', 'הוספת תבנית הודעה');   // הודעות מוכנות רק לסוג המפגש
    }
  }
  let waAnchor = '#waMsgBtn';
  function placeWa(btn) {
    const m = $('#waMenu'), r = btn.getBoundingClientRect();
    m.style.left = menuX(m, btn) + 'px';
    m.style.top = (r.bottom + 8) + 'px';
    m.style.maxHeight = Math.max(200, window.innerHeight - r.bottom - 20) + 'px';
  }
  function toggleWa(btn) {
    const m = $('#waMenu'); if (!m.hidden) { closeWa(); return; }
    waAnchor = '#' + btn.id;
    renderWaMenu(); m.hidden = false; btn.setAttribute('aria-expanded', 'true'); placeWa(btn);
  }
  /* שינוי בחירה בתוך התפריט (תבנית, סינון): התפריט נשאר פתוח, הכפתור נבנה מחדש עם הרשימה ולכן מסמנים אותו פתוח ומציבים את התפריט שוב (הרוחב משתנה כשהסינון מופיע) */
  function refreshWa() {
    renderWaMenu(); render(); const nb = $(waAnchor); if (nb) { nb.setAttribute('aria-expanded', 'true'); placeWa(nb); }
  }
  /* הוספת תבנית: אותו פופאפ עריכת הודעה, לתבנית חדשה של המפגש או של סוג המפגש */
  function waAddTemplate(kind) {
    const m = state.filter && meetOf(state.filter);
    closeWa();
    if (m && kind === 'meeting') { openTplPop(null, { scope: { meeting_id: m.id } }); return; }
    const tid = m ? typeIdOf(m) : state.mtype;
    if (!tid || !typeById(tid)) { toast('אין סוג מפגש להוספת תבנית'); return; }
    openTplPop(null, { scope: { type_id: tid } });
  }
  /* עריכת תבנית הודעה בפופאפ עצמאי (העיפרון בתפריט הוואטסאפ): בראש שם סוג המפגש, ומתחתיו השדות. נשמר אוטומטית, גם בעזיבת שדה וגם בסגירה; בלי שם או נוסח לא נשמר */
  let tplEd = null;
  const tplW = (n) => $('#wt' + n);
  $('#tplFields').innerHTML = tplFieldsHtml((n) => 'wt' + n);
  tokenField(tplW('TplBody'), MSG_TOK); keepCaret(tplW('TplVars'));
  /* תבנית בלי שם לא נשמרת, ולכן קודם השם ורק אחריו ההודעה: כך לא כותבים הודעה ארוכה שתאבד בסגירה */
  const tplLockSync = () => { const lock = !tplW('TplName').value.trim(), b = tplW('TplBody'); b.tokLock(lock); b.setAttribute('placeholder', lock ? 'כדי לכתוב את ההודעה, קודם נותנים שם לתבנית' : ' '); tplW('TplVars').querySelectorAll('button').forEach((x) => { x.disabled = lock; }); tplViewSync(); };
  const tplViewSync = () => { $('#tplView').disabled = !tplW('TplBody').value.trim(); };
  tplW('TplBody').addEventListener('input', tplViewSync);
  /* צפייה בהודעה: הנוסח שבשדה, גם לפני שנשמר, עם נתוני מפגש ומשתתף אקראי. מסך בתוך הפופאפ, עם חץ חזרה. המפגש: של התבנית; בתבנית של סוג: הקרוב של הסוג, ובלעדיו האחרון שלו */
  const tplPrevMeeting = (e) => { const sc = (e && e.scope) || {}, own = sc.meeting_id && meetOf(sc.meeting_id); if (own) return own; const pool = state.meetings.filter((m) => !sc.type_id || typeIdOf(m) === sc.type_id).sort(meetAsc); return pool.find((m) => !isPast(m)) || pool[pool.length - 1] || null; };
  function tplShowPrev(on) {   // פופאפ נפרד שעולה מלמטה מעל עריכת ההודעה
    const dlg = $('#tplPrevDlg');
    if (!on) { if (dlg.open) dlg.close(); return; }
    const ae = document.activeElement; if (ae && ae.blur) ae.blur();   // סוגר את המקלדת
    const people = state.participants.filter((p) => p.active !== false && String(p.first_name || '').trim()), p = people[Math.floor(Math.random() * people.length)] || null, m = tplPrevMeeting(tplEd);
    $('#tplPrev').textContent = fillMsg(tplW('TplBody').value, m, p, { sample: true });
    $('#tplPrevIntro').textContent = 'דוגמה עם ' + (p ? p.name : 'משתתף') + (m ? ' ומפגש ' + dm(m) : '');
    if (!dlg.open) dlg.showModal();
    syncUrl();
  }
  $('#tplView').addEventListener('click', () => tplShowPrev(true));
  $('#tplPrevDlg').addEventListener('close', () => syncUrl());
  tplW('TplName').addEventListener('input', tplLockSync);
  $('#wtTplBodyEd').addEventListener('click', () => { if (!tplW('TplName').value.trim()) tplW('TplName').focus(); });
  const tplRowsOf = (e) => (e.scope.type_id ? tplsOfType(e.scope.type_id) : tplsOfMeeting(e.scope.meeting_id)).map((r) => ({ id: r.id, name: r.name, body: r.body }));
  function openTplPop(id, o) {
    o = o || {};
    const t = id ? state.tpls.find((x) => x.id === id) : null; if (id && !t) return;
    const sys = !!(t && t.system_key);   // "אישור מקום": של המערכת, בלי סוג ובלי מפגש
    const scope = sys ? null : t ? (t.type_id ? { type_id: t.type_id } : { meeting_id: t.meeting_id }) : o.scope || null;
    const m = scope && scope.meeting_id ? meetOf(scope.meeting_id) : null, ty = scope ? typeById(scope.type_id || (m && typeIdOf(m))) : null;
    tplShowPrev(false);
    tplEd = { id: id || null, scope, draft: o.draft || null, row: o.row || null, system: sys };
    const v = t || o.row || {}, isNew = !v.name && !v.body;
    $('#tplTitle').textContent = sys ? t.name : ty && ty.name ? ty.name : 'תבנית הודעה';
    $('#tplIntro').textContent = sys ? 'ברירת המחדל של המערכת, לכל סוגי המפגשים. היא נשלחת גם במייל כשהתשלום נסגר, ואפשר לשלוח אותה ידנית מתפריט הוואטסאפ' : o.draft ? (o.draft === tyF ? 'ההודעה תישמר כשסוג המפגש ייווצר' : 'ההודעה תישמר כשהמפגש ייווצר') : m ? 'ההודעה שייכת למפגש ' + dm(m) + ' בלבד' : 'ההודעה שייכת לסוג המפגש, וחלה על כל המפגשים שלו';
    tplW('TplName').value = v.name || ''; tplW('TplName').readOnly = sys; tplW('TplBody').value = v.body || ''; tplLockSync();
    { const rs = tplW('TplReset'); rs.hidden = !sys; rs.dataset.sure = ''; rs.textContent = 'שחזור נוסח ברירת מחדל'; }
    const del = tplW('TplDel'); del.dataset.sure = ''; del.textContent = 'מחיקת התבנית'; del.hidden = isNew || sys;
    $('#tplDlg').showModal();
    if (isNew) tplW('TplName').focus();   // תבנית חדשה: מוכנה לכתיבה
    else { blurIn('#tplDlg'); }   // בלי מקלדת בפתיחה
    syncUrl();
  }
  const tplRefresh = () => { render(); mf.tpl.render(); mf.paintTplInh(); tyF.tpl.render(); };   // הרשימה ברקע וגם רשימות התבניות בטופס המפגש והסוג
  /* שמירה אחת בכל פעם: עזיבת שדה וסגירה מיד אחריה לא יוצרות את התבנית פעמיים */
  function tplPopSave(e, closing) {
    if (!e) return;
    const name = tplW('TplName').value.trim().slice(0, 60), body = tplW('TplBody').value.replace(/\s+$/, '').slice(0, 2000);
    e.p = (e.p || Promise.resolve()).then(() => tplPopRun(e, name, body, closing));
  }
  async function tplPopRun(e, name, body, closing) {
    const missing = !name ? 'חסר שם לתבנית, השינוי לא נשמר' : 'חסר נוסח לתבנית, השינוי לא נשמר';
    if (e.system) {   // "אישור מקום": השם קבוע, נשמר רק הנוסח
      const t0 = state.tpls.find((x) => x.id === e.id); if (!t0 || t0.body === body) return;
      if (!body) { if (closing) toast('חסר נוסח להודעה, השינוי לא נשמר'); return; }
      try { await api(T.tpl + '?id=eq.' + e.id, { method: 'PATCH', body: { body } }); t0.body = body; tplRefresh(); toast('ההודעה נשמרה'); } catch (err) { fail(err); }
      return;
    }
    if (e.draft) {   // מפגש או סוג שעוד לא נוצרו: השורה נשמרת יחד איתם
      if (name && body) { e.row.name = name; e.row.body = body; }
      else if (closing) { if (name || body) toast(missing); if (!e.row.name) { const rows = e.draft.tpl.rows, i = rows.indexOf(e.row); if (i >= 0) rows.splice(i, 1); } }
      e.draft.tpl.render(); return;
    }
    const t = e.id && state.tpls.find((x) => x.id === e.id);
    if (e.id && !t) return;
    if (t && t.name === name && t.body === body) return;
    if (!t && !name && !body) return;
    if (!name || !body) { if (t || closing) toast(missing); return; }
    try {
      const rows = tplRowsOf(e), made = await saveTemplates(e.scope, t ? rows.map((r) => r.id === e.id ? { id: r.id, name, body } : r) : rows.concat({ id: null, name, body }));
      if (!t && made[0]) { e.id = made[0].id; if (tplEd === e) { tplW('TplDel').hidden = false; syncUrl(); } }
      tplRefresh(); toast('ההודעה נשמרה');
    } catch (err) { fail(err); }
  }
  tplW('TplName').addEventListener('change', () => tplPopSave(tplEd));
  tplW('TplBody').addEventListener('change', () => tplPopSave(tplEd));
  tplW('TplVars').addEventListener('click', (e) => { const v = e.target.closest('[data-v]'); if (v) tplW('TplBody').tokInsert(v.dataset.v); });
  tplW('TplReset').addEventListener('click', () => {   // שחזור הנוסח של "אישור מקום" לברירת המחדל: שתי לחיצות
    const e = tplEd, rs = tplW('TplReset'); if (!e || !e.system) return;
    const t = state.tpls.find((x) => x.id === e.id); if (!t || !t.default_body) return;
    if (rs.dataset.sure !== '1') { rs.dataset.sure = '1'; rs.textContent = 'בטוח? לחיצה נוספת משחזרת'; return; }
    rs.dataset.sure = ''; rs.textContent = 'שחזור נוסח ברירת מחדל'; tplW('TplBody').value = t.default_body; tplViewSync(); tplPopSave(e);
  });
  tplW('TplDel').addEventListener('click', async () => {
    const e = tplEd, del = tplW('TplDel'); if (!e) return;
    if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'בטוח? לחיצה נוספת מוחקת'; return; }   // נמחקת מיד, יחד עם סימוני השליחה שלה
    tplEd = null; if ($('#tplPrevDlg').open) $('#tplPrevDlg').close(); $('#tplDlg').close();
    if (e.draft) { const rows = e.draft.tpl.rows, i = rows.indexOf(e.row); if (i >= 0) rows.splice(i, 1); e.draft.tpl.render(); return; }
    if (e.p) await e.p;
    if (!e.id) return;
    try { await saveTemplates(e.scope, tplRowsOf(e).filter((r) => r.id !== e.id)); tplRefresh(); toast('התבנית נמחקה'); }
    catch (err) { fail(err); }
  });
  $('#tplDlg').addEventListener('close', () => { const e = tplEd; tplEd = null; tplPopSave(e, true); });
  $('#waMenu').addEventListener('click', (e) => {
    const we = e.target.closest('[data-wedit]');
    if (we) { closeWa(); openTplPop(we.dataset.wedit); return; }
    const sf = e.target.closest('[data-wsf]');
    if (sf) { waSetFilter(sf.dataset.wsf); refreshWa(); return; }
    const wa = e.target.closest('[data-wadd]');
    if (wa) { if (wa.dataset.wadd === 'ask') { waAddAsk = true; renderWaMenu(); return; } waAddTemplate(wa.dataset.wadd); return; }
    const b = e.target.closest('[data-wt]'); if (!b) return;
    const id = b.dataset.wt;
    if (id && b.getAttribute('aria-checked') === 'true') { closeWa(); return; }   // לחיצה נוספת על פריט שכבר מסומן סוגרת את התפריט, בלי לשנות את הבחירה
    if (!id) { waSetSel(''); waResetSent(''); closeWa(); render(); return; }   // הודעה ריקה: הסינון מתאפס והתפריט נסגר
    if ((waMap()[waScope()] || '') !== id) { waSetSel(id); waResetSent(''); }   // מעבר לתבנית אחרת או להגעה: הסינון חוזר ל"הכל"
    waAddAsk = false; refreshWa();   // התפריט נשאר פתוח כדי שאפשר יהיה לבחור סינון
  });
  /* תפריטי הסינון, המיון והוואטסאפ הם פופאפים רגילים (dialog): עולים מלמטה, נסגרים בהחלקה, בלחיצה בחוץ ובחזרה */
  [['viewMenu', 'viewDlg', () => closeView()], ['sortMenu', 'sortDlg', () => closeSort()], ['waMenu', 'waDlg', () => closeWa()]].forEach(([mi, di, cl]) => {
    const m = document.getElementById(mi), d = document.getElementById(di);
    new MutationObserver(() => { if (!m.hidden) { if (!d.open) d.showModal(); } else if (d.open) d.close(); }).observe(m, { attributes: true, attributeFilter: ['hidden'] });
    d.addEventListener('close', () => { if (!m.hidden) cl(); });
  });
  $('#viewMenu').addEventListener('click', (e) => {
    const after = (prefs) => { render(); renderViewMenu(); if (sheet && sheet.id && pDlg.open) refreshSheetMeetings(); if (prefs) saveViewPrefs(); };
    const mk = e.target.closest('[data-mk]');
    const st = e.target.closest('[data-stri]'); if (st) { updFrozen = null; const k = st.dataset.stri; if (state.sort !== k) { state.sort = k; state.sortDir = 'desc'; } else if (state.sortDir === 'desc') state.sortDir = 'asc'; else { state.sort = 'upd'; state.sortDir = 'desc'; } render(); saveViewPrefs(); renderViewMenu(); return; }
    if (mk) { const f = FK[mk.dataset.mk], v = mk.dataset.mv; if (f) { const cur = payKeys(state[f]); state[f] = (cur.includes(v) ? cur.filter((x) => x !== v) : (f === 'gender' || f === 'updF' || f === 'regF' ? [v] : cur.concat(v))).join(',') || null; } syncUrl(); return after(); }
    const mp = e.target.closest('[data-mp]');
    if (mp) { const v = mp.dataset.mv; if (mp.dataset.mp === 'pay') state.paidF = state.paidF === v ? null : v; else state.bal = state.bal === v ? null : v; syncUrl(); return after(); }   // תשלום או קרדיט: בחירה אחת
    if (e.target.closest('[data-fclear]')) { clearFilters(); return after(); }
    if (e.target.closest('[data-fgenpin]')) { state.genPin = !state.genPin; saveViewPrefs(); render(); renderViewMenu(); return; }
  });
  /* חזרה בדפדפן במצב חיפוש פתוח (בפוקוס או עם טקסט) סוגרת את החיפוש ומנקה אותו */
  const searchNav = { id: 'search', close() { const i = NAV.stack.findIndex((x) => x.d === searchNav); if (i >= 0) NAV.stack.splice(i, 1); closeSearchBox(); } };
  const searchOpen = () => { const q = $('#q'); return document.activeElement === q || !!q.value; };
  /* באנדרואיד: חזרה סוגרת את החיפוש דרך CloseWatcher, בלי רשומת היסטוריה. רשומה גורמת לדפדפן להציג אנימציה של כל הדף חוזר אחורה, גם כשרק החיפוש נסגר */
  const SEARCH_CW = 'CloseWatcher' in window && /Android/i.test(navigator.userAgent);
  let searchCW = null;
  function syncSearchNav() {
    if (SEARCH_CW) {
      const on = searchOpen();
      if (on && !searchCW) { searchCW = new CloseWatcher(); searchCW.onclose = () => { searchCW = null; searchNav.close(); }; }
      else if (!on && searchCW) { const w = searchCW; searchCW = null; w.onclose = null; w.destroy(); }
      return;
    }
    const has = NAV.stack.some((x) => x.d === searchNav), open = searchOpen();
    if (open && !has) navOpen(searchNav); else if (!open && has) navClose(searchNav);
  }
  $('#q').addEventListener('focus', syncSearchNav);
  $('#q').addEventListener('blur', () => setTimeout(syncSearchNav, 0));
  $('#q').addEventListener('input', syncSearchNav);
  $('#qClear').addEventListener('click', () => setTimeout(syncSearchNav, 0));
  /* לחיצה על השטח הריק מתחת לרשימה (ומתחת ל"הוספת משתתף חדש") מבטלת את החיפוש: מנקה את הטקסט וסוגרת את התיבה (1.11.26) */
  document.addEventListener('click', (e) => {
    const t = e.target, wrap = document.querySelector('.wrap');
    if (t !== wrap && t !== document.body && t !== document.documentElement) return;
    if (!searchOpen() || document.documentElement.classList.contains('menu-open')) return;
    const q = $('#q'); q.value = ''; state.q = ''; q.blur(); renderList(); syncUrl(); setTimeout(syncSearchNav, 0);
  });
  /* פתיחת החיפוש (מקלדת) לא מזיזה את הדף */
  document.addEventListener('focusin', (e) => { if (!e.target.closest('.hsearch')) return; let n = 0; const f = () => { if (window.scrollY || document.documentElement.scrollTop) window.scrollTo(0, 0); if (++n < 20) setTimeout(f, 50); }; f(); });
  if (window.visualViewport) window.visualViewport.addEventListener('scroll', () => { if (document.activeElement && document.activeElement.closest && document.activeElement.closest('.hsearch')) window.scrollTo(0, 0); });
  $('#facets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-fx]'); if (!b) return;
    const [k, v] = b.dataset.fx.split(':');
    if (k === 'g') state.gender = state.gender === v ? null : v;
    render();
  });

  $('#list').addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-qs]')) { e.preventDefault(); e.stopPropagation(); openQuickMenu(e.target.dataset.qs, e.target, state.filter || undefined); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-edit]')) { e.preventDefault(); openParticipant(e.target.dataset.edit, undefined, e.target.closest('li.row')); }
  });
  const listClick = (e) => {
    { const ra = e.target.closest('[data-att]'); if (ra) { e.stopPropagation(); setAttended(ra.dataset.att, state.filter); return; } }   // הגיע / לא הגיע בעמודת הסימון: לא פותח את הכרטיס
    if (e.target.closest('.evc.inert')) { e.stopPropagation(); e.preventDefault(); return; }   // אחרי תחילת המפגש: עיגול שליחת הפרטים לא עושה כלום (לא וואטסאפ, לא שינוי נתונים, ולא פותח את הכרטיס)
    { const ra = e.target.closest('[data-rowadd]'); if (ra) { e.stopPropagation(); e.preventDefault(); confirmLink(ra.dataset.rowadd, state.filter, true); return; } }   // שיוך ישיר מהרשימה, בלי בחירת תגית
    { const ru = e.target.closest('[data-rowun]'); if (ru) { e.stopPropagation(); e.preventDefault(); confirmLink(ru.dataset.rowun, state.filter, false); return; } }   // הסרה מהמפגש מהכרטיס ברשימה: פופאפ אישור
    { const rw = e.target.closest('.rowwa'); if (rw) { e.stopPropagation(); const ws = rw.dataset.wsend && waSelected(); if (ws) { waAwait = { pid: rw.dataset.wsend, mid: ws.m.id, key: ws.id, name: ws.name }; if (rw.classList.contains('sent')) { e.preventDefault(); askMsgSent(); } } return; } }   // וואטסאפ מהרשימה: רק פותח את השיחה, לא את כרטיס המשתתף; עם תבנית: בחזרה מאשרים שנשלחה. הודעה שכבר סומנה כנשלחה: לא פותח וואטסאפ, רק פופאפ אישור לביטול הסימון
    const qs = e.target.closest('[data-qs]');
    if (qs) { e.stopPropagation(); if (!$('#qMenu').hidden) { closeQ(); return; } openQuickMenu(qs.dataset.qs, qs, state.filter || undefined); return; }
    const eu = e.target.closest('[data-evun]');
    if (eu) { e.stopPropagation(); const l = linkOf(eu.dataset.evun, state.filter); if (l) setDetailsSent(eu.dataset.evun, l.meeting_id, false); return; }   // חזרה ללא נשלח
    const er = e.target.closest('[data-evrow]');
    if (er) { e.stopPropagation(); evAwait = er.dataset.evrow; evAwaitM = state.filter || null; return; }   // וואטסאפ נפתח; בחזרה מאשרים שנשלח
    const am = e.target.closest('[data-addm]');
    if (am) { confirmLink(am.dataset.addm, state.filter, true, () => { state.q = ''; $('#q').value = ''; renderList(); toast('נוסף למפגש'); }); return; }
    if (e.target.closest('#addNew')) {
      const q = state.q.trim(); openParticipant(null);
      if (digits(q).length >= 6) pForm.phone.value = q; else { const w = q.replace(/\s+/g, ' '), i = w.indexOf(' '); pForm.first_name.value = i < 0 ? w : w.slice(0, i); pForm.last_name.value = i < 0 ? '' : w.slice(i + 1); }
      return;
    }
    const pi = e.target.closest('.payic');
    if (pi) { const r0 = pi.closest('li.row'), id0 = r0 && r0.querySelector('[data-edit]').dataset.edit; if (id0 && state.filter) { e.stopPropagation(); openAllocPop(id0, state.filter); } return; }   /* מעיגול ה-₪ ברשימה: פופאפ קטן בגובה התוכן עם מסך ההקצאה בלבד (לא כרטיס משתתף בגובה מלא); אחרי תשלום הוא נסגר */
    const bi = e.target.closest('.balic');
    if (bi) { const r1 = bi.closest('li.row'), id1 = r1 && r1.querySelector('[data-edit]').dataset.edit; if (id1) { e.stopPropagation(); openParticipant(id1, undefined, r1); viewStack = []; goView('wallet'); } return; }   // עיגול הקרדיט בתצוגת הכל: פותח את כרטיס המשתתף ישר במסך "קרדיט ותשלומים"
    const row = e.target.closest('li.row'), ed = row && row.querySelector('[data-edit]');   // לחיצה בכל מקום בכרטיס פותחת את פרטי המשתתף
    if (ed) openParticipant(ed.dataset.edit, undefined, row);
  };
  $('#list').addEventListener('mousedown', (e) => { if (e.target.closest('.evc, .payic, .ratt') && document.activeElement === $('#q')) e.preventDefault(); });   // הלחיצה לא לוקחת פוקוס מהחיפוש: המקלדת נשארת פתוחה
  $('#list').addEventListener('click', listClick);
  $('#addBox').addEventListener('click', listClick);

  $('#gLogin').addEventListener('click', () => AUTH.signIn(location.origin + '/roster/admin/'));   // Google חוזרת רק לכתובת שמורשית ב-Supabase; העסק נשמר ב-roster_deep ומחזיר את הכתובת היפה
  const signOut = () => { try { if (rtWs) rtWs.close(); } catch (e) {} Promise.all([dropImages(), AUTH.signOut()]).then(() => location.reload()); };
  $('#gOut').addEventListener('click', signOut);
  $('#signOut').addEventListener('click', signOut);
  /* הגדרות: חשבון, שם השולח ומצב הגעה פתוח (לבדיקות, זמני ללשונית) */
  function renderSettings() {
    { const si = $('#setSender'); if (document.activeElement !== si) si.value = senderName(); }
    $('#setWaF').hidden = !(WA_ANDROID || WA_IOS); $('#setWaApp').value = waApp();   // רק בטלפון אפשר לבחור בין האפליקציות
  }
  $('#setWaApp').addEventListener('change', (e) => { (state.viewScopes._g || (state.viewScopes._g = {})).waApp = e.target.value; saveViewPrefs(); render(); });
  /* שם ותמונת ברירת המחדל למפגש עברו לסוג המפגש (31.10.26): מפגש חדש מקבל את השם והתמונה של הסוג שלו; */
  $('#setSender').addEventListener('change', async () => {
    const em = emailOf(), v = $('#setSender').value.trim().slice(0, 20), prev = state.prefs[em];
    state.prefs[em] = Object.assign({}, prev, { email: em, sender_name: v || null });
    try { await api(T.pf, { method: 'POST', body: { email: em, sender_name: v || null }, prefer: 'resolution=merge-duplicates,return=minimal' }); toast(v ? 'שם השולח עודכן: ' + v : 'שם השולח חזר לברירת המחדל'); }
    catch (err) { if (prev) state.prefs[em] = prev; else delete state.prefs[em]; fail(err); }
    renderSettings();
  });
  $('#setBtn').addEventListener('click', () => openSetRoot('main'));   // החשבון שלי: השם שלי במערכת
  $('#finSrcBtn').addEventListener('click', () => openSetRoot('src'));   // קיצורי דרך בראש מסך הכספים (הוסרו מהתפריט הראשי)
  $('#finPmBtn').addEventListener('click', () => openSetRoot('pm'));

  /* ---------- סוגי מפגשים: עריכה בתוך ההגדרות (מסך הסוג, ומתוכו התגיות וההודעה שלו); כל שינוי נשמר מיד ---------- */
  async function saveType(id, patch, okMsg, quiet) {
    const t = typeById(id); if (!t) return false;
    const prev = Object.assign({}, t); Object.assign(t, patch);
    render(); if (sheet && sheet.id && pDlg.open) refreshSheetMeetings();
    try { await api(T.mt + '?id=eq.' + id, Object.assign({ method: 'PATCH', body: patch }, quiet ? { ui: false } : {})); if (okMsg) toast(okMsg); return true; }
    catch (err) { Object.assign(t, prev); render(); if (setView === 'tydet') renderTyDelete(); fail(err); return false; }
  }
  /* שם הסוג ופרטי ברירת המחדל נשמרים אוטומטית (כמו בעריכת מפגש); הטופס מתמלא פעם אחת בפתיחה.
     סוג חדש (tyNew) נוצר רק בלחיצה על "יצירת סוג מפגש"; עד אז אין לו תגיות, הודעה וסימון הגעה */
  let tyNew = null, tyFormFor = null;
  const tyCur = () => tyId ? typeById(tyId) : tyNew;
  const tyF = meetingFields('ty', true, null);   // אותו אלמנט כמו בעריכת מפגש
  tyF.owner = () => tyId ? { type_id: tyId } : null;
  tyF.write = async () => {
    const id = tyId; if (!id) return;
    const r = tyF.read(); if (r.err) { toast(r.err); if (r.el) r.el.focus(); return; }
    const body = r.body;
    await saveType(id, body, '', true);
  };
  const fillTypeForm = (t) => tyF.fill(t, null);
  /* כפתור "מחיקת סוג מפגש" בתחתית הטופס: מוצג רק כשיש יותר מסוג אחד, ומעומעם כשלמפגשי הסוג משויכים משתתפים */
  function renderTyDelete() {
    const t = typeById(tyId), del = $('#tyDelete'); del.hidden = !t || state.mtypes.length < 2; if (!t) return;
    const ms = state.meetings.filter((m) => typeIdOf(m) === t.id), busy = ms.filter((m) => state.att.some((a) => a.meeting_id === m.id)).length;
    del.classList.toggle('locked', busy > 0);
    del.textContent = del.dataset.sure === t.id ? (ms.length ? 'בטוח? יימחקו גם ' + ms.length + ' מפגשים בלי משתתפים' : 'בטוח? לחיצה נוספת מוחקת') : 'מחיקת סוג מפגש';
    del.title = busy ? 'יש ' + busy + ' מפגשים מהסוג הזה עם משתתפים. אי אפשר למחוק סוג שלמפגשים שלו משויכים משתתפים' : '';
  }
  /* מסך פרטי ברירת המחדל: הטופס מתמלא בכל כניסה מחדש מהסוג השמור (שינויים שלא נשמרו נזנחים בחזרה) */
  function renderTyDet() {
    const t = tyCur(); if (!t) return;
    const key = tyId || 'new';
    if (tyFormFor !== key) { tyFormFor = key; fillTypeForm(t); }
    $('#tySave').hidden = false; $('#tySave').textContent = tyId ? 'שמירה' : 'יצירת סוג מפגש'; tyF.edited = false;   // סוג קיים נשמר רק בלחיצה על שמירה (כבוי עד שינוי)
    renderTyDelete();
  }
  function openTypeEditor(id) {
    if (!typeById(id)) return;
    tyId = stType = id; tyNew = null; tyFormFor = null; setRoot = 'tydet';
    renderSettings(); $('#setDlg').showModal(); showSetView('tydet');   // נפתח ישר על הטופס, כמו עריכת מפגש
    blurIn('#setDlg');   // בלי מקלדת בפתיחה
  }
  /* סוג חדש: פרטי ברירת המחדל, מתי נפתח סימון ההגעה וההודעה מועתקים מהסוג שנבחר בתפריט (או הראשון); השם ריק; מתחיל רק עם תגית המערכת המשותף */
  function createType() {
    const src = typeById(state.mtype) || state.mtypes[0] || {};
    tyNew = { name: '' };
    ['meeting_time', 'place', 'city', 'max_participants', 'directions', 'price_tiers', 'passes', 'event_open', 'event_msg'].forEach((k) => { if (src[k] != null) tyNew[k] = src[k]; });
    tyId = stType = null; tyFormFor = null; setRoot = 'tydet';
    renderSettings(); $('#setDlg').showModal(); showSetView('tydet');   // סוג חדש נפתח ישר על הפרטים
    blurIn('#setDlg');
  }
  /* כפתור היצירה כבוי כל עוד חסר שדה חובה (תאריך ומחירים תקינים למפגש, שם לסוג מפגש) */
  const syncCreate = () => {
    const ms = $('#mSubmit'); if (ms && !ms.hidden) { let bad = !$('#mDate').value; try { if (!bad) bad = !!mf.read().err; } catch (e) { bad = true; } ms.disabled = bad || (!!editingMeeting && !mf.edited); }
    const ts = $('#tySave'); if (ts && !ts.hidden) { let bad = true; try { bad = !!tyF.read().err; } catch (e) {} ts.disabled = bad || (!!tyId && !tyF.edited); }
  };
  ['input', 'change', 'click'].forEach((ev) => { $('#mDlg').addEventListener(ev, () => setTimeout(syncCreate, 0)); $('#setTyDet').addEventListener(ev, () => setTimeout(syncCreate, 0)); });
  mf.onEdit = syncCreate; tyF.onEdit = syncCreate;
  new MutationObserver(syncCreate).observe($('#mDlg'), { attributes: true, attributeFilter: ['open'] });
  new MutationObserver(syncCreate).observe($('#setTyDet'), { attributes: true, attributeFilter: ['hidden'] });
  $('#tySave').addEventListener('click', async () => {
    if (tyId) { if (!tyF.edited) return; $('#tySave').disabled = true; await tyF.save(); toast('נשמר'); syncCreate(); return; }   // סוג קיים: נשמר רק בלחיצה על שמירה
    const t = tyCur(); if (!t || tyId) return;
    const r = tyF.read(); if (r.err) { toast(r.err); if (r.el) r.el.focus(); return; }
    const body = r.body;
    const btn = $('#tySave'); btn.disabled = true;
    /* יצירה: הסוג נשמר והפופאפ נסגר; תגיות לסוג החדש נערכים מאייקון העריכה בפס התגיות */
    ['event_open', 'event_msg'].forEach((k) => { if (tyNew[k] != null) body[k] = tyNew[k]; });
    body.sort = Math.max(0, ...state.mtypes.map((x) => x.sort || 0)) + 1;
    try {
      const [n] = await api(T.mt, { method: 'POST', body, prefer: 'return=representation' });
      if (n && !typeById(n.id)) state.mtypes.push(n);
      await saveTemplates({ type_id: n.id }, tyF.tpl.rows);
      tyNew = null; tyId = stType = n.id; tyFormFor = null;
      tyF.dirty = false; render(); $('#setDlg').close(); toast('סוג המפגש נוצר');
    } catch (err) { fail(err); }
    btn.disabled = false;
  });
  /* מחיקה: לא כשלמפגש מהסוג משויכים משתתפים (נבדק גם בבסיס הנתונים), ולא הסוג האחרון; בשני שלבים. המפגשים הריקים שלו והתגיות שלו נמחקים איתו */
  $('#tyDelete').addEventListener('click', async () => {
    const t = typeById(tyId), del = $('#tyDelete'); if (!t) return;
    const ms = state.meetings.filter((m) => typeIdOf(m) === t.id), blocked = () => toast('אי אפשר למחוק סוג מפגש שלמפגשים שלו משויכים משתתפים');
    if (ms.some((m) => state.att.some((a) => a.meeting_id === m.id))) { blocked(); return; }
    if (state.mtypes.length < 2) return;
    if (del.dataset.sure !== t.id) { del.dataset.sure = t.id; renderTyDelete(); setTimeout(() => { if (del.dataset.sure === t.id) { del.dataset.sure = ''; if (setView === 'tydet') renderTyDelete(); } }, 6000); return; }
    del.dataset.sure = '';
    try {
      if (ms.length) {   // בדיקה גם בבסיס הנתונים (כולל משתתפים שהוסרו): שיוך כלשהו חוסם
        const rows = await api(T.a + '?meeting_id=in.(' + ms.map((m) => m.id).join(',') + ')&select=meeting_id&limit=1');
        if (rows && rows.length) { blocked(); return; }
        await api(T.m + '?type_id=eq.' + t.id, { method: 'DELETE' });
      }
      await api(T.mt + '?id=eq.' + t.id, { method: 'DELETE' });
      state.meetings = state.meetings.filter((m) => !ms.includes(m));
      if (ms.some((m) => m.id === state.filter)) state.filter = null;
      state.mtypes = state.mtypes.filter((x) => x !== t); state.statuses = state.statuses.filter((s) => s.type_id !== t.id);
      if (state.mtype === t.id) state.mtype = null;
      tyF.dirty = false; applyStatuses(); $('#setDlg').close(); render(); toast('סוג המפגש נמחק');
    } catch (err) { fail(err); }
  });
  /* ניהול התגיות בתוך פופאפ ההגדרות */
  /* stType = סוג המפגש שהתגיות וההודעה שלו נערכים; tyId = הסוג שנפתח לעריכה מתפריט המפגשים */
  let setView = 'main', stType = null, tyId = null, setRoot = 'main';   // setRoot: המסך שהפופאפ נפתח עליו (החשבון שלי, או שיווק ממומן / דרכי תשלום / תגיות מהתפריט הראשי)
  const setIsRoot = (v) => v === setRoot || v === 'main' || v === 'tydet';   // עריכת סוג מפגש היא מסך ראשי (נפתח ישר על הטופס): אין לאן לחזור
  function openSetRoot(v) {
    setRoot = v;
    renderSettings(); $('#setDlg').showModal(); showSetView(v);
    blurIn('#setDlg');   // בלי מקלדת בפתיחה
  }
  const curSt = () => statusList(stType || firstTypeId());
  function showSetView(v) {
    setView = v; if (v !== 'st') stDraft = null;
    if (v !== 'src') dropSrcDraft();
    $('#setMain').hidden = v !== 'main'; $('#setTyDet').hidden = v !== 'tydet'; $('#tySave').hidden = v !== 'tydet'; $('#setSt').hidden = v !== 'st'; $('#setDel').hidden = v !== 'del'; $('#setSrc').hidden = v !== 'src'; $('#setPm').hidden = v !== 'pm'; $('#setEm').hidden = v !== 'em'; $('#setBack').hidden = setIsRoot(v);   // המסך שהפופאפ נפתח עליו, וסוג חדש (מסך הפרטים הוא הראשי): אין לאן לחזור
    $('#setTitle').textContent = v === 'tydet' ? (tyId ? 'עריכת סוג מפגש' : 'סוג מפגש חדש') : v === 'st' ? ((typeById(stType) || typeById(firstTypeId()) || {}).name || 'תגיות') : v === 'del' ? (setRoot === 'src' ? 'מחיקת שיווק ממומן' : 'מחיקת תגית') : v === 'src' ? 'שיווק ממומן' : v === 'pm' ? 'דרכי תשלום' : v === 'em' ? 'הודעה לפני המפגש' : 'החשבון שלי';
    if (v === 'src') renderSources();
    if (v === 'pm') renderPm();
    if (v === 'tydet') renderTyDet();
    if (v === 'em') { const ta = $('#emText'); if (document.activeElement !== ta) ta.value = eventTemplate(stType); renderEmOpen(); }
    if (v === 'st') renderStSettings();
    navSync($('#setDlg')); syncUrl();
  }
  let stDraft = null;   // תגית חדשה שעוד לא נשמרה: { key }. נשמרת רק אחרי שמקלידים שם (בלי שם אוטומטי)
  const normName = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').toLowerCase();
  /* שם כבר קיים בתגיות של הסוג; לא כולל את התגית עצמה */
  const stNameTaken = (label, key) => { const n = normName(label); return curSt().some((x) => x.key !== key && normName(x.label) === n); };
  const ST_DUP = 'כבר יש תגית בשם הזה';
  function renderStSettings() {
    const dv0 = document.querySelector('#stBoth .strow.draft .stname'), dVal = dv0 ? dv0.value : '', dFoc = !!dv0 && document.activeElement === dv0;   // ציור מחדש (למשל מזמן אמת) לא מוחק שם שמוקלד
    const list = curSt();
    const nameStyle = (s) => 'color:' + (s.color === 'neutral' ? 'var(--gray)' : (PALETTE[s.color] || PALETTE.sky)[1]);   // שדה רגיל: קו תחתון, והצבע של התגית בטקסט בלבד
    const dRow = { key: stDraft ? stDraft.key : '', label: '', color: 'neutral', _d: true };
    $('#stList').innerHTML = (stDraft ? list.concat([dRow]) : list).map((s) => '<div class="strow' + (s._d ? ' draft' : '') + '" data-k="' + esc(s.key) + '"' + (s._d ? ' data-draft="1"' : '') + '>' +
      '<button type="button" class="sthandle" aria-label="גרירה לשינוי הסדר (או חצים במקלדת)" title="גרירה לשינוי הסדר"' + (s._d ? ' disabled' : '') + '>' + icon('grip', 'i18') + '</button>' +
      '<button type="button" class="swcur" data-c="' + esc(s.color) + '" aria-haspopup="menu" aria-label="צבע: ' + (PALETTE[s.color] || PALETTE.sky)[2] + ' (לחיצה לשינוי)" title="שינוי צבע" style="background:' + (PALETTE[s.color] || PALETTE.sky)[0] + '"></button>' +
      '<input data-rf-bare class="stname" value="' + esc(s.label) + '" maxlength="14" aria-label="שם התגית"' + (s._d ? ' placeholder="שם התגית" autocomplete="nope" enterkeyhint="done"' : '') + ' style="' + nameStyle(s) + '" />' +
      (s._d ? '' : '<button type="button" class="stshow eyebtn" data-showtag="' + esc(s.key) + '" aria-pressed="' + !state.tagHide.includes(s.key) + '" aria-label="' + (state.tagHide.includes(s.key) ? 'הצגה בשורת הצ\'יפים: ' : 'הסתרה משורת הצ\'יפים: ') + esc(s.label) + '" title="' + (state.tagHide.includes(s.key) ? 'מוסתר בשורת הצ\'יפים' : 'מוצג בשורת הצ\'יפים') + '">' + icon(state.tagHide.includes(s.key) ? 'eyeoff' : 'eye', 'i18') + '</button>') +
      (s._d ? '<button type="button" class="stdel" data-dcancel="1" aria-label="ביטול" title="ביטול">×</button>' : '<button type="button" class="stdel" data-del="' + esc(s.key) + '" aria-label="מחיקת התגית" title="מחיקת התגית">×</button>') + '</div>').join('');
    const hid = (k) => state.chipHide.some((x) => x === k || (k === 'gen' && (x === 'male' || x === 'female')));
    $('#stShow').innerHTML = [['res', 'משוריינים', icon('bookmark', 'i16')], ['arr', 'הגיעו', icon('check', 'i16')], ['gen', 'מגדר', icon('male', 'i16') + icon('female', 'i16')]].map((c) => '<div class="shrow"><span class="stc tagc shchip" title="' + c[1] + '" aria-label="' + c[1] + '">' + c[2] + ' <span class="shname">' + c[1] + '</span></span><button type="button" class="eyebtn" data-showchip="' + c[0] + '" aria-pressed="' + !hid(c[0]) + '" aria-label="' + (hid(c[0]) ? 'הצגה בשורת הצ\'יפים: ' : 'הסתרה משורת הצ\'יפים: ') + c[1] + '" title="' + (hid(c[0]) ? 'מוסתר בשורת הצ\'יפים' : 'מוצג בשורת הצ\'יפים') + '">' + icon(hid(c[0]) ? 'eyeoff' : 'eye', 'i18') + '</button></div>').join('');   // צ'יפים של ברירת המחדל: סמל ועין (פקוחה = מוצג, עם אלכסון = מוסתר)
    if (stDraft) { const dv = document.querySelector('#stBoth .strow.draft .stname'); if (dv) { if (dVal) dv.value = dVal; if (dFoc) dv.focus(); } }
  }
  async function saveStatus(key, patch) {
    const s = state.statuses.find((x) => x.key === key); if (!s) return;
    const prev = Object.assign({}, s); Object.assign(s, patch);
    applyStatuses(); renderStSettings(); render(); if (sheet && sheet.id) { refreshSheetMeetings(); renderContact(); }
    try { await api(T.st + '?key=eq.' + key, { method: 'PATCH', body: patch }); }
    catch (err) { Object.assign(s, prev); applyStatuses(); renderStSettings(); render(); fail(err); }
  }
  $('#setBack').addEventListener('click', () => showSetView(setView === 'del' ? (setRoot === 'src' ? 'src' : 'st') : (tyId && setView === 'em') ? 'tydet' : setRoot));   // מחיקת תגית חוזרת לתגיות, והודעה לפני המפגש לעריכת הסוג
  /* הגדרות תשלומים: מדרגות מחיר לפי ימים שנותרו עד המפגש */
  /* שיווק ממומן בהגדרות: ערוצי פרסום ממומן (שם, צבע, קוד) ושיווק ממומן (שם, צבע, עמלה), בעיצוב דומה לתגיות */
  const colDot = (c, who) => '<button type="button" class="swcur" data-who="' + esc(who) + '" data-c="' + esc(c) + '" aria-haspopup="menu" aria-label="צבע" title="שינוי צבע" style="background:' + (PALETTE[c] || PALETTE.sky)[0] + '"></button>';
  const nameStyle = (c) => 'color:' + (PALETTE[c] || PALETTE.sky)[1];   // שם דרך ההגעה: בלי רקע, הצבע בטקסט
  /* כרטיס שיווק ממומן: הרכיב היחיד, ברשימה (w = 'pr:<מזהה>') וביצירה (w = 'new': בלי מחיקה, העתקת קישור והתחשבנות, כי עוד לא קיימת) */
  function srcCard(x, w) {
    const isNew = w === 'new', ct = !!x.cost_total, fp = !ct && !!x.cost_from_payment;
    const bal = isNew ? 0 : ledgerOf(x.id).balance;
    return '<div class="srccard" data-w="' + w + '">' +
      '<div class="srcgrid">' +
        '<label class="srcfld"><small>שם</small><input data-rf-bare class="stname" data-f="name" value="' + esc(x.name) + '" maxlength="24" aria-label="שם דרך ההגעה" style="' + nameStyle(x.color || 'red') + '" /></label>' +
        '<div class="srcfld srccolf"><span class="srccol">' + colDot(x.color || 'red', w) + (isNew ? '' : '<button type="button" class="stdel" data-sdel="' + w + '" aria-label="מחיקת דרך ההגעה" title="מחיקת דרך ההגעה">×</button>') + '</span></div>' +
        '<label class="srcfld' + (ct ? ' wide2' : '') + '"><small>סוג עלות</small><select data-rf-bare class="srcsel" data-f="cost_type" aria-label="סוג העלות"><option value="lead"' + (fp || ct ? '' : ' selected') + '>עלות לליד</option><option value="pay"' + (fp ? ' selected' : '') + '>עלות מהתשלום</option><option value="total"' + (ct ? ' selected' : '') + '>עלות כללית</option></select></label>' +
        (ct ? '' : '<label class="srcfld srcamt"><small>' + (fp ? 'סכום או אחוז' : 'כמה עולה ליד') + '</small><span class="srcin">' +
          (fp ? '<select data-rf-bare class="ratetype" data-f="rate_type" aria-label="סוג"><option value="fixed"' + (x.rate_type !== 'percent' ? ' selected' : '') + '>₪</option><option value="percent"' + (x.rate_type === 'percent' ? ' selected' : '') + '>%</option></select>' : '<i>₪</i>') +
          '<input data-rf-bare class="codein ratein" data-f="rate" type="number" inputmode="decimal" min="0" value="' + (isNew && !Number(x.rate) ? '' : Number(x.rate || 0)) + '" placeholder="0" aria-label="עלות" /></span></label>') +
        (isNew ? '' : '<div class="srcfld">' + (!ct && bal > 0 ? '<small>לתשלום</small>' : '') + '<button type="button" class="prsettle" data-settle="' + x.id + '" aria-label="' + esc('התחשבנות עם ' + x.name + ': ' + (ct ? 'תשלומים' : bal > 0 ? nfx(bal) + ' שקלים לתשלום' : 'מסולק')) + '"><b' + (ct ? '' : ' class="' + (bal > 0 ? 'owe' : 'ok') + '"') + '>' + (ct ? 'תשלומים' : bal > 0 ? '₪' + nfx(bal) : 'מסולק') + '</b>' + icon('next', 'i14') + '</button></div>') +
        '<div class="srcct"><label class="rfield field srcfld srccp"><span>טלפון</span><input data-rf-bare class="stname" data-f="contact_phone" type="tel" inputmode="tel" dir="ltr" value="' + esc(x.contact_phone || '') + '" maxlength="20" aria-label="טלפון איש הקשר" placeholder=" " autocomplete="off" />' + '</label></div>' +
      '</div>' + (isNew ? '' : '<button type="button" class="srcdelbtn" data-sdel="' + w + '">מחיקה</button>') + '</div>';
  }
  function renderSources() { $('#srcPrList').innerHTML = state.promoters.map((x) => srcCard(x, 'pr:' + x.id)).join('') || '<p class="mnone">אין שיווק ממומן</p>'; }
  /* מסך דרכי ההגעה הפתוח מתעדכן אחרי תשלום ובזמן אמת, אבל לא באמצע הקלדה בכרטיס */
  function refreshSources() { if (!$('#setDlg').open || setView !== 'src') return; const ae = document.activeElement; if (ae && $('#srcPrList').contains(ae) && ae.matches('input, select')) return; renderSources(); }
  /* דרכי תשלום: רשימה שהמנהל מגדיר (שם לכל דרך); מוצגת כצ'יפים בקבלת תשלום */
  function renderPm() {
    $('#pmList').innerHTML = state.payMethods.map((x) => '<div class="pmrow" data-k="' + esc(x.key) + '">' + '<button type="button" class="sthandle" aria-label="גרירה לשינוי הסדר (או חצים במקלדת)" title="גרירה לשינוי הסדר">' + icon('grip', 'i18') + '</button>' + '<input data-rf-bare class="pmname" value="' + esc(x.name) + '" maxlength="20" aria-label="שם דרך התשלום" />' + '<select data-rf-bare class="pmown" aria-label="הקופה של" title="הקופה של: מי מקבל את הכסף בדרך הזאת"><option value="">הקופה של…</option>' + finAdmins().map((e) => '<option value="' + esc(e) + '"' + (x.owner_email === e ? ' selected' : '') + '>' + esc(finName(e)) + '</option>').join('') + '</select>' + (state.payMethods.length > 1 ? '<button type="button" class="stdel" data-pdel="' + esc(x.key) + '" aria-label="מחיקה" title="מחיקה">×</button>' : '') + '</div>').join('');
  }
  /* סדר דרכי התשלום: גרירה או חצים; אותו סדר מוצג בקבלת תשלום */
  async function commitPmOrder(keys) {
    const before = state.payMethods.map((x) => ({ x, s: x.sort })), changed = [];
    state.payMethods = keys.map((k) => state.payMethods.find((m) => m.key === k)).filter(Boolean);
    state.payMethods.forEach((x, i) => { if (x.sort !== i + 1) { x.sort = i + 1; changed.push(x); } });
    renderPm();
    try { await Promise.all(changed.filter((x) => x.id).map((x) => api(T.pm + '?id=eq.' + x.id, { method: 'PATCH', body: { sort: x.sort } }))); }
    catch (err) { before.forEach((b) => { b.x.sort = b.s; }); state.payMethods.sort((a, b) => (a.sort || 0) - (b.sort || 0)); renderPm(); fail(err); }
  }
  let pmDrag = null;
  $('#pmList').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.sthandle'); if (!h) return; const row = h.closest('.pmrow'); e.preventDefault(); h.setPointerCapture(e.pointerId);
    pmDrag = { row, id: e.pointerId, grab: e.clientY - row.getBoundingClientRect().top }; row.classList.add('dragging');
  });
  $('#pmList').addEventListener('pointermove', (e) => {
    const d = pmDrag; if (!d || e.pointerId !== d.id) return; const list = $('#pmList'), row = d.row;
    const place = () => { row.style.transform = 'none'; const nat = row.getBoundingClientRect().top; row.style.transform = 'translateY(' + (e.clientY - d.grab - nat) + 'px)'; };
    place();
    for (let g = 0; g < 8; g++) {
      const r = row.getBoundingClientRect(), prev = row.previousElementSibling, next = row.nextElementSibling;
      if (prev && !prev.classList.contains('locked') && r.top + r.height / 2 < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) { list.insertBefore(row, prev); place(); }
      else if (next && r.top + r.height / 2 > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) { list.insertBefore(next, row); place(); }
      else break;
    }
  });
  const pmDrop = (e) => { const d = pmDrag; if (!d || e.pointerId !== d.id) return; pmDrag = null; d.row.classList.remove('dragging'); d.row.style.transform = ''; commitPmOrder([...document.querySelectorAll('#pmList .pmrow')].map((r) => r.dataset.k)); };
  $('#pmList').addEventListener('pointerup', pmDrop); $('#pmList').addEventListener('pointercancel', pmDrop);
  ['touchstart', 'touchmove'].forEach((ev) => $('#pmList').addEventListener(ev, (e) => { if (e.target.closest('.sthandle')) { e.stopPropagation(); if (ev === 'touchmove' && e.cancelable) e.preventDefault(); } }, { passive: false }));
  $('#pmList').addEventListener('keydown', (e) => {
    const h = e.target.closest('.sthandle'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return; e.preventDefault();
    const keys = state.payMethods.map((x) => x.key), k = h.closest('.pmrow').dataset.k, i = keys.indexOf(k), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= keys.length) return; keys.splice(i, 1); keys.splice(j, 0, k);
    commitPmOrder(keys).then(() => { const nh = document.querySelector('#pmList .pmrow[data-k="' + k + '"] .sthandle'); if (nh) nh.focus(); });
  });
  /* ההודעה לפני המפגש ומתי הכפתור שלה נפתח: לכל סוג מפגש (roster_meeting_types.event_msg / event_open), לכל המנהלים */
  async function saveEventMsg(v) {
    const val = (v || '').trim() ? v : null;
    await saveType(stType || firstTypeId(), { event_msg: val }, val ? 'נוסח ההודעה עודכן' : 'חזר נוסח ברירת המחדל');
  }
  function renderEmOpen() { const cur = evOpenPref(stType || firstTypeId()); $('#emOpenOpts').innerHTML = EV_OPEN_OPTS.map((o) => '<button type="button" role="radio" class="stc" data-eo="' + o[0] + '" aria-pressed="' + (o[0] === cur) + '">' + o[1] + '</button>').join(''); }
  $('#emOpenOpts').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-eo]'); if (!b) return; const v = b.dataset.eo;
    await saveType(stType || firstTypeId(), { event_open: v }, 'הכפתור ייפתח: ' + (EV_OPEN_OPTS.find((o) => o[0] === v) || [])[1]);
    renderEmOpen();
  });
  $('#emText').addEventListener('change', () => saveEventMsg($('#emText').value));
  $('#emReset').addEventListener('click', () => { $('#emText').value = DEFAULT_EVENT_MSG; saveEventMsg(''); });
  $('#emVars').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (!b) return; const ta = $('#emText'), s = ta.selectionStart == null ? ta.value.length : ta.selectionStart, en = ta.selectionEnd == null ? s : ta.selectionEnd; ta.setRangeText(b.dataset.v, s, en, 'end'); ta.focus(); ta.dispatchEvent(new Event('change')); });
  $('#pmList').addEventListener('change', async (e) => {
    const own = e.target.closest('.pmown');
    if (own) {
      const k0 = own.closest('.pmrow').dataset.k, x0 = state.payMethods.find((m) => m.key === k0); if (!x0) return;
      const prev0 = x0.owner_email || null, v0 = own.value || null; x0.owner_email = v0; renderPm();
      try { if (x0.id) await api(T.pm + '?id=eq.' + x0.id, { method: 'PATCH', body: { owner_email: v0 } }); toast(v0 ? 'הקופה של ' + finName(v0) : 'הקופה לא הוגדרה'); }
      catch (err) { x0.owner_email = prev0; renderPm(); fail(err); }
      return;
    }
    const inp = e.target.closest('.pmname'); if (!inp) return; const k = inp.closest('.pmrow').dataset.k, x = state.payMethods.find((m) => m.key === k); if (!x) return;
    const v = inp.value.trim().slice(0, 20); if (!v) { renderPm(); return; }
    const prev = x.name; x.name = v; renderPm();
    try { if (x.id) await api(T.pm + '?id=eq.' + x.id, { method: 'PATCH', body: { name: v } }); }
    catch (err) { x.name = prev; renderPm(); fail(err); }
  });
  $('#pmList').addEventListener('click', async (e) => {
    const d = e.target.closest('[data-pdel]'); if (!d || state.payMethods.length < 2) return; const k = d.dataset.pdel, x = state.payMethods.find((m) => m.key === k); if (!x) return;
    const prev = state.payMethods.slice(); state.payMethods = state.payMethods.filter((m) => m !== x); renderPm();
    try { if (x.id) await api(T.pm + '?id=eq.' + x.id, { method: 'DELETE' }); }
    catch (err) { state.payMethods = prev; renderPm(); fail(err); }
  });
  $('#pmAdd').addEventListener('click', async () => {
    const key = 'x_' + Math.random().toString(36).slice(2, 7), row = { key, name: 'דרך תשלום חדשה', sort: state.payMethods.length + 1 };
    try { const [r] = await api(T.pm, { method: 'POST', body: row, prefer: 'return=representation' }); state.payMethods.push(r || row); renderPm(); const inp = document.querySelector('#pmList [data-k="' + key + '"] .pmname'); if (inp) { inp.focus(); inp.select(); } }
    catch (err) { fail(err); }
  });
  /* מחיקת שיווק ממומן: מסך בתוך הפופאפ. יש מקושרים: בוחרים לאן להעביר אותם, והכול עובר ונמחק בטרנזקציה אחת (roster_promoter_replace) */
  function askSrcDelete(id) {
    const x = promoterOf(id); if (!x) return;
    const ps = state.participants.filter((q) => q.promoter_id === x.id);
    const money = state.payments.some((q) => q.promoter_id === x.id) || state.att.some((q) => q.promoter_id === x.id || q.source_promoter_id === x.id) || state.promoPays.some((q) => q.promoter_id === x.id);
    const others = state.promoters.filter((o) => o.id !== x.id), nm = '<b>"' + esc(x.name) + '"</b>', who = ps.length === 1 ? 'משתתף אחד שקשור' : '<b>' + ps.length + '</b> משתתפים שקשורים';
    const linked = ps.length ? 'יש ' + who + ' לדרך ההגעה ' + nm + '.' : 'יש תשלומים שקשורים לדרך ההגעה ' + nm + '.';
    if ((ps.length || money) && !others.length) { toast('זה השיווק הממומן היחיד שיש עליו נתונים, ולכן צריך קודם להוסיף שיווק אחר'); return; }
    const run = async (to) => {
      try {
        const r = await api('rpc/roster_promoter_replace', { method: 'POST', body: { p_from: x.id, p_to: b.dataset.to || null } });
        if (r !== 'ok') { toast('דרך ההגעה לא נמחקה, אפשר לנסות שוב'); b.disabled = false; return; }
        toast(b.dataset.to ? 'הועברו ל"' + (promoterOf(b.dataset.to) || {}).name + '" ודרך ההגעה נמחקה' : 'דרך ההגעה נמחקה');
        state.promoters = state.promoters.filter((o) => o.id !== x.id); showSetView('src'); load(true);
      } catch (err) { b.disabled = false; fail(err); }
    };
    if (!ps.length && !money) { confirmAct('מחיקת שיווק ממומן', null, null, () => run(null), 'למחוק את ' + nm + '?', 'כן, למחוק', null, { plain: true }); return; }
    confirmAct('מחיקת שיווק ממומן', null, null, () => run(($('#srcDelTo') || {}).value), linked + '<br><br>לאיזה שיווק ממומן להעביר אותם?<label class="rfield field rfield--gap"><span>העברה אל</span><select id="srcDelTo">' + others.map((o) => '<option value="' + o.id + '">' + esc(o.name) + '</option>').join('') + '</select></label>', 'מחיקה והעברה', null, { plain: true });
  }
  const srcTarget = (w) => ({ tbl: T.pr, row: w === 'new' ? prDraft : promoterOf(w.slice(3)), kind: 'pr' });
  async function saveSrc(w, patch) {
    const tg = srcTarget(w); if (!tg.row) return;
    if (w === 'new') { Object.assign(prDraft, patch); if (patch.color || 'cost_from_payment' in patch || patch.rate_type) renderPrDraft(); return; }   // טיוטה: בלי ציור מחדש בזמן מעבר בין שדות
    const prev = Object.assign({}, tg.row); Object.assign(tg.row, patch); renderSources(); render(); if (sheet && sheet.id) setTitle(partOf(sheet.id));
    try { await api(tg.tbl + '?id=eq.' + tg.row.id, { method: 'PATCH', body: patch }); }
    catch (err) { Object.assign(tg.row, prev); renderSources(); render(); fail(err); }
  }
  const srcChange = (e) => {
    const inp = e.target.closest('[data-f]'); if (!inp) return; const row = inp.closest('[data-w]'); if (!row) return; const w = row.dataset.w, f = inp.dataset.f, tg = srcTarget(w);
    if (f === 'name') { const v = inp.value.trim().slice(0, 24); if (!v) { if (w === 'new') prDraft.name = ''; else renderSources(); return; } if (w === 'new' && srcDraftOn) { commitSrcDraft(v); return; } saveSrc(w, { name: v }); }
    else if (f === 'cost_type') {
      const v = inp.value, toPay = v === 'pay', c = w === 'new' || v === 'total' || tg.row.cost_total ? null : costRateFor(tg.row, toPay ? (tg.row.rate_type === 'percent' ? 'percent' : 'fixed') : 'lead');   // עלות כללית: בלי המרה; העלות הקודמת נשארת שמורה אם יחזרו אליה
      saveSrc(w, Object.assign(v === 'total' ? { cost_total: true, cost_from_payment: false, cost_on_lead: false } : toPay ? { cost_total: false, cost_from_payment: true, cost_on_lead: false } : { cost_total: false, cost_from_payment: false, cost_on_lead: true, rate_type: 'fixed' }, c ? { rate: c.rate } : {}));
      if (v === 'total' && w !== 'new') toast('את הסכום רושמים בהתחשבנות');
      if (c) toast(c.kept ? 'הסכום לתשלום נשאר ₪' + nfm(c.kept) : '₪' + c.rate + (toPay ? ' למשלם' : ' לליד') + ': ' + c.L + ' לידים, ' + c.P + ' שילמו');
    }
    else if (f === 'rate_type') { const c = w === 'new' ? null : costRateFor(tg.row, inp.value === 'percent' ? 'percent' : 'fixed'); saveSrc(w, Object.assign({ rate_type: inp.value }, c ? { rate: c.rate } : {})); if (c && c.kept) toast('הסכום לתשלום נשאר ₪' + nfm(c.kept)); }
    else if (f === 'rate') saveSrc(w, { rate: Math.max(0, Number(inp.value) || 0) });
    else if (f === 'contact_phone') { const v = inp.value.trim(); if (v && digits(v).length < 9) { toast('מספר טלפון לא תקין'); return; } saveSrc(w, { contact_phone: v || null }); }
  };
  const srcClick = async (e) => {
    const cur = e.target.closest('.swcur'); if (cur) { const w = cur.dataset.who, tg = srcTarget(w); if (tg.row) openColorMenu(w, cur, tg.row.color || (tg.kind === 'ad' ? 'sky' : 'red'), (c) => saveSrc(w, { color: c })); return; }
    const st0 = e.target.closest('[data-settle]'); if (st0) { showPromoterDetail(st0.dataset.settle); $('#prDlg').showModal(); return; }   // ההתחשבנות דרך דרכי ההגעה
    const d = e.target.closest('[data-sdel]'); if (d) { askSrcDelete(d.dataset.sdel.slice(3)); return; }
  };
  [$('#setSrc'), $('#prForm')].forEach((box) => { box.addEventListener('change', srcChange); box.addEventListener('click', srcClick); });
  $('#srcPrAdd').addEventListener('click', startSrcDraft);
  $('#srcPrDraft').addEventListener('focusout', () => setTimeout(() => { if (!srcDraftOn) return; const b = $('#srcPrDraft'), n = b.querySelector('[data-f="name"]'), m = $('#colMenu'); if (n && !n.value.trim() && !b.contains(document.activeElement) && !(m && !m.hidden)) dropSrcDraft(); }, 150));   // יצאו בלי שם: הכרטיס נעלם, ושום דבר לא נשמר
  $('#setDlg').addEventListener('close', () => { tyF.edited = false; setRoot = 'main'; showSetView('main'); tyId = null; stType = null; tyNew = null; tyFormFor = null; syncUrl(); });
  $('#stBoth').addEventListener('click', (e) => {
    const cb = e.target.closest('[data-showchip], [data-showtag]'); if (!cb) return;
    const prop = cb.dataset.showchip ? 'chipHide' : 'tagHide', key = cb.dataset.showchip || cb.dataset.showtag, cur = state[prop].filter((x) => x !== key && !(key === 'gen' && (x === 'male' || x === 'female')));
    state[prop] = cb.getAttribute('aria-pressed') === 'true' ? cur.concat(key) : cur;   // עין פקוחה (מוצג) ← לחיצה מסתירה
    saveViewPrefs(); renderChipRow(); renderStSettings();
  });
  /* "+ חדש": שורה ריקה עם סמן (בלי שם אוטומטי); הפריט נשמר רק כשמקלידים שם שלא קיים באותה רשימה, ובלי שם השורה נעלמת */
  function startDraft() {
    if (stDraft) { const i = document.querySelector('#stBoth .strow.draft .stname'); if (i) { i.focus(); return; } }
    stDraft = { key: 'm_' + Math.random().toString(36).slice(2, 7) };
    renderStSettings();
    const inp = document.querySelector('#stBoth .strow.draft .stname'); if (inp) { inp.focus(); try { inp.scrollIntoView({ block: 'center' }); } catch (e) {} }
  }
  async function commitDraft(inp) {
    const d = stDraft; if (!d) return;
    const v = inp.value.trim().replace(/\s+/g, ' ').slice(0, 14);
    if (!v) { stDraft = null; renderStSettings(); return; }
    if (stNameTaken(v, d.key)) { toast(ST_DUP); setTimeout(() => { try { inp.focus(); inp.select(); } catch (e) {} }, 30); return; }
    const row = { key: d.key, label: v, color: 'neutral', sort: Math.max(0, ...state.statuses.map((x) => x.sort)) + 1, scope: 'meeting' };
    if (state.mtypes.length) row.type_id = stType || firstTypeId();   // שייכת לסוג המפגש שנערך
    state.statuses.push(row); stDraft = null; applyStatuses(); renderStSettings();
    try { await api(T.st, { method: 'POST', body: row, prefer: 'return=minimal' }); }
    catch (err) { state.statuses = state.statuses.filter((x) => x !== row); applyStatuses(); renderStSettings(); fail(err); }
  }
  $('#stAdd').addEventListener('click', () => startDraft());
  $('#stBoth').addEventListener('focusout', (e) => {   // יצאו משורה ריקה בלי להקליד שם: היא נעלמת
    const inp = e.target; if (!inp || !inp.classList || !inp.classList.contains('stname') || !inp.closest('.strow.draft')) return;
    if (e.relatedTarget && inp.closest('.strow').contains(e.relatedTarget)) return;
    setTimeout(() => { const cur = document.querySelector('#stBoth .strow.draft .stname'); if (stDraft && cur && !cur.value.trim() && document.activeElement !== cur) { stDraft = null; renderStSettings(); } }, 150);
  });
  $('#stBoth').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('stname') && e.target.closest('.strow.draft')) { e.preventDefault(); commitDraft(e.target); } });
  $('#stBoth').addEventListener('click', (e) => { if (e.target.closest('[data-dcancel]')) { stDraft = null; renderStSettings(); } });
  /* הצגה בשורת הצ'יפים: סימון = מוצג, ביטול הסימון = מוסתר (לכל מנהל, נשמר מיד) */
  $('#stBoth').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-showchip], [data-showtag]'); if (!cb) return;
    const prop = cb.dataset.showchip ? 'chipHide' : 'tagHide', key = cb.dataset.showchip || cb.dataset.showtag, cur = state[prop].filter((x) => x !== key && !(key === 'gen' && (x === 'male' || x === 'female')));
    state[prop] = cb.checked ? cur : cur.concat(key);
    saveViewPrefs(); renderChipRow();
  });
  /* מחיקת תגית: מי שסומן בה עובר לתגית אחרת, או נשאר בלי תגית */
  async function removeStatus(k, to, used) {
    used.forEach((l) => { l.status_key = to || null; });
    state.statuses = state.statuses.filter((x) => x.key !== k);
    applyStatuses(); showSetView('st'); render(); if (sheet && sheet.id) { refreshSheetMeetings(); renderContact(); }
    try {
      for (const l of used) await api(T.a + attQs(l.participant_id, l.meeting_id), { method: 'PATCH', body: statusBody(to) });
      await api(T.st + '?key=eq.' + k, { method: 'DELETE' }); toast('התגית נמחקה');
    } catch (err) { fail(err); load(true); }
  }
  $('#stBoth').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = del.dataset.del, s = state.statuses.find((x) => x.key === k); if (!s) return;
      const used = state.att.filter((l) => l.status_key === k);
      if (!used.length) { await removeStatus(k, null, used); return; }
      /* יש משתתפים עם התגית: שואלים אם להחליף אותה בתגית אחרת, או רק להסיר (מסך בתוך הפופאפ) */
      $('#setDelText').innerHTML = 'יש <b>' + used.length + '</b> משתתפים במפגשים עם התגית <b>"' + esc(s.label) + '"</b>. להחליף אותה בתגית אחרת, או רק להסיר?';
      $('#setDelOpts').innerHTML = curSt().filter((x) => x.key !== k).map((x) => '<button type="button" class="sopt ' + esc(x.key) + '" data-to="' + esc(x.key) + '">' + esc(x.label) + '</button>').join('') + '<button type="button" class="sopt psnone" data-to="">רק להסיר</button>';
      $('#setDelOpts').onclick = async (ev) => { const b = ev.target.closest('[data-to]'); if (!b) return; await removeStatus(k, b.dataset.to || null, used); };
      showSetView('del');
      return;
    }
    const row = e.target.closest('.strow'); if (!row) return;
    const cur = e.target.closest('.swcur'); if (cur) { openColorMenu(row.dataset.k, cur); return; }
  });
  /* בחירת צבע: מציגים רק את הצבע הנוכחי, ובלחיצה נפתח תפריט קטן עם הפלטה */
  function openColorMenu(key, anchor, curOverride, onPickOverride) {
    let m = document.getElementById('colMenu');
    if (!m) { m = document.createElement('div'); m.id = 'colMenu'; m.className = 'qmenu colmenu'; m.setAttribute('role', 'menu'); m.hidden = true; }
    const host = anchor.closest('dialog') || document.body; if (m.parentElement !== host) host.appendChild(m);
    if (!m.hidden && m.dataset.k === key) { m.hidden = true; return; }
    const s = curOverride ? { color: curOverride } : state.statuses.find((x) => x.key === key); if (!s) return;
    m.dataset.k = key; m.style.width = 'auto';
    m.innerHTML = Object.keys(PALETTE).map((c) => '<button type="button" class="sw" role="menuitem" data-c="' + c + '" aria-label="' + PALETTE[c][2] + '" aria-pressed="' + (s.color === c) + '" style="background:' + PALETTE[c][0] + '"></button>').join('');
    m.hidden = false;
    const r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.min(Math.max(8, r.left + r.width / 2 - mw / 2), window.innerWidth - mw - 8) + 'px';
    m.style.top = (r.bottom + 8 + mh > menuBottom() ? Math.max(8, r.top - mh - 8) : r.bottom + 8) + 'px';
    m.onclick = (e) => { const sw = e.target.closest('.sw'); if (!sw) return; m.hidden = true; if (onPickOverride) onPickOverride(sw.dataset.c); else saveStatus(key, { color: sw.dataset.c }); };
  }
  /* סדר התגיות: גוררים בידית (עכבר או מגע) ומחליפים מקום; נשמר ברגע הפיסול. במקלדת: חצים על הידית */
  async function commitOrder(keys) {
    const before = state.statuses.map((s) => ({ key: s.key, sort: s.sort }));
    const changed = [];
    keys.forEach((k, i) => { const s = state.statuses.find((x) => x.key === k); if (s && s.sort !== i + 1) { s.sort = i + 1; changed.push(s); } });
    applyStatuses(); renderStSettings(); render(); if (sheet && sheet.id) { refreshSheetMeetings(); renderContact(); }
    if (!changed.length) return;
    try { await Promise.all(changed.map((s) => api(T.st + '?key=eq.' + s.key, { method: 'PATCH', body: { sort: s.sort } }))); }
    catch (err) { before.forEach((b0) => { const s = state.statuses.find((x) => x.key === b0.key); if (s) s.sort = b0.sort; }); applyStatuses(); renderStSettings(); render(); fail(err); }
  }
  let stDrag = null;
  $('#stBoth').addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.sthandle'); if (!h) return;
    const row = h.closest('.strow'); e.preventDefault();
    h.setPointerCapture(e.pointerId);
    stDrag = { row, h, id: e.pointerId, grab: e.clientY - row.getBoundingClientRect().top };
    row.classList.add('dragging');
  });
  const stFollow = (e) => {
    const d = stDrag; if (!d || e.pointerId !== d.id) return;
    const list = d.row.parentElement, row = d.row;
    const place = () => { row.style.transform = 'none'; const nat = row.getBoundingClientRect().top; row.style.transform = 'translateY(' + (e.clientY - d.grab - nat) + 'px)'; };
    place();
    for (let guard = 0; guard < 8; guard++) {
      const r = row.getBoundingClientRect(), prev = row.previousElementSibling, next = row.nextElementSibling;
      if (prev && !prev.classList.contains('locked') && r.top + r.height / 2 < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) { list.insertBefore(row, prev); place(); }
      else if (next && !next.classList.contains('locked') && r.top + r.height / 2 > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) { list.insertBefore(next, row); place(); }
      else break;
    }
  };
  $('#stBoth').addEventListener('pointermove', stFollow);
  const stDrop = (e) => {
    const d = stDrag; if (!d || e.pointerId !== d.id) return;
    stDrag = null; d.row.classList.remove('dragging'); d.row.style.transform = '';
    commitOrder([...d.row.parentElement.querySelectorAll('.strow')].map((r) => r.dataset.k));
  };
  $('#stBoth').addEventListener('pointerup', stDrop);
  $('#stBoth').addEventListener('pointercancel', stDrop);
  /* גרירה בתוך הפופאפ לא מזיזה או סוגרת אותו */
  ['touchstart', 'touchmove'].forEach((ev) => $('#stBoth').addEventListener(ev, (e) => { if (e.target.closest('.sthandle')) { e.stopPropagation(); if (ev === 'touchmove' && e.cancelable) e.preventDefault(); } }, { passive: false }));
  $('#stBoth').addEventListener('keydown', (e) => {
    const h = e.target.closest('.sthandle'); if (!h || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const keys = [...h.closest('.strow').parentElement.querySelectorAll('.strow')].map((r) => r.dataset.k), k = h.closest('.strow').dataset.k, i = keys.indexOf(k), j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= keys.length) return;
    keys.splice(i, 1); keys.splice(j, 0, k);
    commitOrder(keys).then(() => { const nh = document.querySelector('#stBoth .strow[data-k="' + k + '"] .sthandle'); if (nh) nh.focus(); });
  });


  /* roster: מדריך ההקמה (onboarding.js) צריך כמה ידיות מתוך הסקריפט הזה. types() הוא null עד שקריאת סוגי המפגש הצליחה (כך שגיאת רשת לא נראית כעסק בלי סוגים) */
  window.ROSTER_ONB = (() => { let tv = state.mtypes, ok = false; Object.defineProperty(state, 'mtypes', { get: () => tv, set: (x) => { tv = x; ok = true; }, enumerable: true });
    return { slug: () => BIZ.slug, email: emailOf, types: () => (ok && Array.isArray(tv) ? tv.slice() : null), createType: () => createType(),
      openTemplates: (id) => { openTypeEditor(id); setTimeout(() => { const b = $('#tyMF'); if (b && b.scrollIntoView) b.scrollIntoView({ block: 'center' }); }, 60); },
      pref: { get: () => { const g = state.viewScopes._g; return (g && g.onb) || {}; }, set: (k, v) => { const g = state.viewScopes._g || (state.viewScopes._g = {}); (g.onb || (g.onb = {}))[k] = v; saveViewPrefs(); } } }; })();

    window.ROSTER_KIT = { api, toast, load, deleted: null, partOf, quickActive,
      askDelete: (p, onYes) => askConfirm(p, 'מחיקת משתתף', 'למחוק את ' + nameB(p.name) + '? אפשר לבטל מיד אחרי המחיקה.', 'כן, מחיקה', onYes, true),
      unlink: (p) => { if (state.filter) confirmLink(p.id, state.filter, false); } };   // the handles admin-kit.js works through (roster kit, p14_kit)
if (!FRAMED) startAuth();
