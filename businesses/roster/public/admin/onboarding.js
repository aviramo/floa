/* roster: מדריך הקמה לעסק חדש. שלושה פופאפים, כל אחד פעם אחת לכל מנהל בכל עסק:
   1. "ברוכים הבאים": כשאין אף סוג מפגש. הכפתור פותח את עורך סוג המפגש הקיים.
   2. אחרי שנוצר סוג (בכל דרך שנוצר): תבניות ההודעה. הכפתור פותח את תפריט התבניות של הסוג.
   3. חיבור לאתר של העסק: הכפתור פותח את עמוד החיבורים.
   ההתקדמות נגזרת מהנתונים (יש סוגי מפגש או אין). מה שכבר הוצג נשמר בהעדפות של המנהל (view_scopes._g.onb), ובנוסף ב-localStorage.
   הדף לא מכיר את הקובץ הזה: הוא מקבל כמה ידיות מ-window.ROSTER_ONB, שהסקריפט של הדף מגדיר. אין כאן קוד inline, כי ה-CSP של הדף לא מרשה. */
(function () {
  'use strict';
  var O = window.ROSTER_ONB;
  if (!O) return;
  var $ = function (s) { return document.querySelector(s); };

  var STEPS = {
    w: {
      n: 1, title: 'ברוכים הבאים',
      text: 'בואו נתחיל בהגדרת סוג המפגש הראשון. סוג מפגש הוא פעילות שחוזרת אצלכם, למשל ערב פתוח או סדנה. בסוג מגדירים פעם אחת את ברירות המחדל: שעה, מקום, מחיר, הוראות הגעה והודעות. המפגשים עצמם, כל תאריך בנפרד, נוצרים מתחת לסוג ויורשים ממנו את הפרטים.',
      go: 'הגדרת סוג המפגש הראשון'
    },
    t: {
      n: 2, title: 'הודעות לסוג המפגש',
      text: 'לכל סוג מפגש יש תבניות הודעה שאתם שולחים למשתתפים בוואטסאפ, למשל אישור מקום או תזכורת. אישור מקום הוא ברירת המחדל של המערכת. לחיצה על תבנית פותחת אותה לעריכה, והכפתור תבנית הודעה מוסיף תבנית חדשה.',
      go: 'לתבניות ההודעה'
    },
    c: {
      n: 3, title: 'חיבור לאתר שלכם',
      text: 'אפשר לחבר את המערכת לאתר של העסק, כך שההרשמה והאזור האישי של המשתתפים יעבדו מתוך האתר שלכם. בעמוד החיבורים מקבלים מפתח ושורה אחת להדבקה באתר.',
      go: 'לעמוד החיבורים'
    }
  };
  var LATER = 'אחר כך';

  var dlg = null, current = null;

  /* ---------- what was already shown: the manager's prefs, and localStorage next to them ---------- */
  function lsKey() { return 'roster.onb.' + O.slug() + '.' + O.email(); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(lsKey()) || '{}') || {}; } catch (e) { return {}; } }
  function lsPut(o) { try { localStorage.setItem(lsKey(), JSON.stringify(o)); } catch (e) {} }
  function seen(k) { return !!(O.pref.get()[k] || lsGet()[k]); }
  function mark(k, v) { var o = lsGet(); o[k] = v ? 1 : 0; lsPut(o); try { O.pref.set(k, v ? 1 : 0); } catch (e) {} }

  /* ---------- the popup ---------- */
  function build() {
    dlg = document.createElement('dialog');
    dlg.id = 'onbDlg';
    dlg.setAttribute('aria-labelledby', 'onbTitle');
    dlg.style.maxWidth = '460px';
    dlg.innerHTML = '<div class="sheet"><div class="onbstep" id="onbStep"></div><h2 id="onbTitle"></h2><p id="onbText"></p>' +
      '<button type="button" class="btn" id="onbGo"></button><button type="button" class="btn ghost" id="onbLater"></button></div>';
    document.body.appendChild(dlg);
    $('#onbGo').addEventListener('click', go);
    $('#onbLater').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('close', function () { current = null; });
    dlg.addEventListener('mousedown', function (e) { dlg._down = e.target === dlg; });
    dlg.addEventListener('click', function (e) { if (e.target === dlg && dlg._down) dlg.close(); });
  }

  function lastType() { var t = O.types() || []; return t.length ? t[t.length - 1] : null; }

  function show(k) {
    if (!dlg) build();
    var s = STEPS[k];
    current = k;
    mark(k, true);                                  /* shown once: a reload does not repeat it, the menu item brings it back */
    $('#onbStep').textContent = 'שלב ' + s.n + ' מתוך 3';
    $('#onbTitle').textContent = s.title;
    $('#onbText').textContent = s.text;
    $('#onbGo').textContent = s.go;
    $('#onbLater').textContent = LATER;
    dlg.showModal();
    $('#onbGo').focus();
  }

  function go() {
    var k = current;
    dlg.close();
    if (k === 'w') setTimeout(function () { O.createType(); }, 0);
    else if (k === 't') { var t = lastType(); if (t) setTimeout(function () { O.openTemplates(t.id); }, 0); }
    else if (k === 'c') {
      var a = $('#connectLink');
      location.href = a && a.getAttribute('href') ? a.getAttribute('href') : '/roster/connect/?biz=' + encodeURIComponent(O.slug());
    }
  }

  /* ---------- which one is due: derived from the data ---------- */
  function tick() {
    if (current || document.hidden) return;
    var types = O.types();
    if (!types) return;                              /* the first read of the meeting types has not succeeded yet */
    if (document.querySelector('dialog[open]')) return;   /* never on top of another popup: it waits until the manager is free */
    if (!types.length) { if (!seen('w')) show('w'); return; }
    if (!seen('w')) return;                          /* a business that already had types before this guide: nothing to teach */
    if (!seen('t')) return show('t');
    if (!seen('c')) show('c');
  }

  /* ---------- "מדריך הקמה" in the menu: starts the sequence again ---------- */
  function restart() {
    var types = O.types() || [];
    mark('w', types.length > 0);                      /* with types the first step is already behind us, so the guide continues from the templates */
    mark('t', false); mark('c', false);
    var m = $('#hMenu'), b = $('#menuBtn');
    if (m && !m.hidden && b) b.click();
    setTimeout(tick, 80);
  }

  function addMenuItem() {
    var after = $('#connectLink'), menu = $('#hMenu');
    if (!menu || $('#onbMenu')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'hmi'; b.id = 'onbMenu'; b.setAttribute('role', 'menuitem');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg><span>מדריך הקמה</span>';
    b.addEventListener('click', restart);
    if (after && after.parentNode === menu) after.parentNode.insertBefore(b, after); else menu.appendChild(b);
  }

  addMenuItem();
  setInterval(tick, 600);
})();
