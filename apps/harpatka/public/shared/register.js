/* פופאפ הרשמה משותף (עמוד הבית, v6, ביודנסה).
 * מזריק את הפופאפ לעמוד, מחבר את כפתורי ה-CTA (data-contact), הטופס (Supabase), התשלום והוואטסאפ.
 * דורש: shared/config.js (CONFIG) ו-shared/register.css. נטען בסוף ה-body.
 * הכפתור בעמוד רק צריך data-contact. אין להעתיק את הקוד הזה לעמודים. */
(function () {
  const BASE = document.currentScript.src.replace(/shared\/register\.js.*$/, '');   // כתובת השורש של האתר (גם מתוך תיקיות משנה)
  /* טווח הגילאים: מ-shared/age.js (AGE_MIN, AGE_MAX). עמוד שלא טען אותו מקבל אותו כאן */
  if (window.AGE_MIN == null) { const s = document.createElement('script'); s.src = BASE + 'shared/age.js?v=20261031a'; document.head.appendChild(s); }
  const ageOk = (a) => window.AGE_MIN != null && Number(a) >= window.AGE_MIN && Number(a) <= window.AGE_MAX;
  const MODAL_HTML = `<div id="contactModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="contactTitle">
    <div class="modal-box">
      <button type="button" class="modal-close" data-close-modal aria-label="סגירה">&times;</button>
      <div id="cmChoose" hidden>
      <h2 id="contactTitle" class="h-sect text-[1.6rem] md:text-[2rem] mb-3">מעדיפים לשלוח הודעה?</h2>
      ${CONFIG.waCard('__BASE__', 'cmWa')}
      <button type="button" id="cmShowForm" class="mt-3 w-full rounded-full px-5 py-3.5 text-[1.05rem] font-bold" style="background:var(--sand);color:var(--ink)">חזרה לשמירת מקום בטופס</button>
      </div>
      <div id="cmFormView" data-su-root>
        <div data-su="formWrap">
          <div class="su-head">
            <h2 class="su-title" data-meeting-name hidden></h2>
            <div data-meeting-box></div>
          </div>
          <form data-su="form" novalidate class="text-start">
            <input type="text" name="website" data-su="hp" class="su-hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <div class="su-fold"><div>
              <p class="su-phonehint" data-su="phint"><span data-su="pname"></span><br>הטלפון מחבר את החשבון למשתתף שלכם <button type="button" class="su-notme" data-su="notme">זה לא אני</button></p>
              <div class="su-grid">
                <div class="su-cell">${PersonForm.html('first', { id: 'cmFirst', autofocus: true })}</div>
                <div class="su-cell">${PersonForm.html('last', { id: 'cmLast' })}</div>
                <div class="su-cell su-wide">${PersonForm.err('name', 'su-err')}</div>
                <div class="su-cell">
                  ${PersonForm.html('phone', { id: 'cmPhone' })}
                  ${PersonForm.err('phone', 'su-err')}
                </div>
                <div class="su-cell su-ag">
                  <div class="su-cell">
                    ${PersonForm.html('age', { id: 'cmAge' })}
                    ${PersonForm.err('age', 'su-err')}
                  </div>
                  <div class="su-cell">
                    ${PersonForm.html('gender', { id: 'cmGender' })}
                    ${PersonForm.err('gender', 'su-err')}
                  </div>
                </div>
              </div>
              <p class="su-dethint" data-su="dethint">כמעט סיימנו. נשאר רק להשלים כמה פרטים</p>
              <div class="su-member" data-su="member"><p class="su-memberp">הפרטים שלכם כבר שמורים אצלנו</p><p class="su-who" data-su="who"></p><p class="su-membernm" data-su="nomeet" hidden>עוד אין מפגש לשמור בו מקום. נעדכן אתכם ברגע שייקבע מפגש</p></div>
            </div></div>
            <button data-su="btn" type="submit" class="btn-primary rounded-full px-5 md:px-8 py-3.5 text-[1.2rem] whitespace-nowrap w-full mt-4">שמירת מקום</button>
            <div class="su-or" data-su="or">או</div>
            <a href="__BASE__me/?login=1&back=reg" class="su-glink" data-su="glink">כניסה עם גוגל</a><div class="su-gbrow"><span class="su-gph"></span><button type="button" class="su-gback" data-su="gback">חזרה לתיקון</button></div>
            <div data-su="fail" class="su-err mt-3 text-center" role="alert"></div>
            <div class="su-fold su-after shut" data-su="after"><div>
              <p class="su-paynote">המקום נשמר באופן זמני והוא יישמר קבוע רק לאחר תשלום</p>
              <div class="su-payfold" data-su="payfold"><div>
                <p class="su-crnote" data-su="crnote" hidden></p>
                <button type="button" data-su="paycredit" class="btn-primary rounded-full px-8 py-4 text-[1.2rem] block text-center w-full" hidden>תשלום מהקרדיט</button>
                ${CONFIG.payMenu({ wrap: 'data-paywrap', cls: 'btn-primary rounded-full px-8 py-4 text-[1.2rem]', label: 'לתשלום <span data-price>80 ₪</span>', items: [{ attrs: 'data-paybox', pay: 'paybox', amt: '<span data-price>80 ₪</span>' }, { attrs: 'data-bit', pay: 'bit', amt: '<span data-price>80 ₪</span>' }], other: { attrs: 'data-su="other"', label: 'דרך אחרת' } })}</div>
                </div>
              </div></div>
            </div></div>
          </form>
        </div>
      </div>
    </div>
  </div>`.replace(/__BASE__/g, BASE);
  if (window.REGISTER_MIN !== false) document.documentElement.classList.add('reg-min');
  /* שאלת יציאה מהחשבון: אותה מעטפת פופאפ של ההרשמה (נפתח מלמעלה, פס סגירה בתחתית) */
  const LOGOUT_HTML = `<div id="logoutModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="logoutTtl"><div class="modal-box"><button type="button" class="modal-close" data-close-modal aria-label="סגירה">&times;</button><p class="su-lgwho" id="logoutTtl"></p><a class="su-lgyes" href="__BASE__me/">כניסה לאזור האישי</a><button type="button" class="su-lgno" data-lg="yes">יציאה מהחשבון</button></div></div>`.replace(/__BASE__/g, BASE);
  /* חשבון חסום או מנותק: פופאפ מלמעלה (אותה מעטפת) שמסביר שאי אפשר להתחבר דרך החשבון הזה, עם וואטסאפ אלינו */
  const BLOCKED_HTML = `<div id="blockedModal" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="blockedTtl"><div class="modal-box"><button type="button" class="modal-close" data-close-modal aria-label="סגירה">&times;</button><p class="su-lgwho" id="blockedTtl">לא ניתן להתחבר דרך החשבון הזה</p><p class="su-lgq">החשבון הזה לא מאושר לכניסה לאתר. לשאלות אפשר לפנות אלינו בוואטסאפ:</p>${CONFIG.waCard('__BASE__', 'blockedWa')}</div></div>`.replace(/__BASE__/g, BASE);
  /* כניסה עם גוגל כשהשכבה הקטנה של גוגל לא יכולה להופיע (למשל בהשהיה של גוגל אחרי שנסגרה): פופאפ קטן בתוך הדף עם הכפתור של גוגל, בלי חלון נפרד */
  const GLOGIN_HTML = `<div id="gloginModal" class="modal" hidden role="dialog" aria-modal="true" aria-label="כניסה עם גוגל"><div class="modal-box"><button type="button" class="modal-close" data-close-modal aria-label="סגירה">&times;</button><p class="su-lgq">מתחברים פעם אחת, ובפעם הבאה שומרים מקום בלחיצה, בלי למלא פרטים מחדש</p><div class="su-gbtn" id="gloginBtn"></div><a href="#" class="su-galt" id="gloginAlt" hidden>שמירת מקום בלי חשבון גוגל</a></div></div>`;
  document.body.insertAdjacentHTML('beforeend', MODAL_HTML + LOGOUT_HTML + BLOCKED_HTML + GLOGIN_HTML);

  /* ===== מנגנון פופאפ כללי (משותף לכל ה-.modal) ===== */
  let modalLastFocus = null, urlBeforeReg = null;
  /* הכתובת בדפדפן לא משתנה כשהפופאפ פתוח (בוטל ה-/register/ בכתובת, 28.10.26); regUrl נשארה כפונקציה ריקה כדי שהקריאות אליה ימשיכו לעבוד */
  function regUrl() {}
  /* נעילת גלילת הדף מאחורי הפופאפ (גם במובייל); הפופאפ עצמו נגלל, למשל כשהמקלדת פתוחה */
  let locked = false;
  /* נעילת גלילת הדף כשהפופאפ פתוח: הגוף מקובע במקומו (position: fixed עם היסט הגלילה), כך שגם הזזת הדף על ידי המקלדת או גרירה על הרקע לא גוללת את הדף מאחור; בסגירה הגלילה חוזרת למקום */
  let lockY = 0;
  function lockPage(){
    if (locked) return;
    locked = true; lockY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.top = (-lockY) + 'px'; document.documentElement.classList.add('modal-lock');
  }
  function unlockPage(){
    if (!locked) return;
    locked = false; document.documentElement.classList.remove('modal-lock'); document.body.style.top = '';
    window.scrollTo({ top: lockY, left: 0, behavior: 'instant' });
  }
  /* שדה הטלפון: פוקוס שגם פותח מקלדת (PersonForm.focusKeyboard) */
  function kbProxy(type) { try { const px = document.createElement('input'); px.type = type; px.tabIndex = -1; px.setAttribute('aria-hidden', 'true'); px.setAttribute('autocomplete', 'off'); px.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;pointer-events:none;font-size:16px'; document.body.appendChild(px); px.focus({ preventScroll: true }); return px; } catch (e) { return null; } }
  function kbFocus(el) { const pf = window.PersonForm; if (pf && pf.focusKeyboard) pf.focusKeyboard(el); else el.focus({ preventScroll: true }); }
  function openModal(m, noFocus){
    if (m.id === 'contactModal') { regUrl(true); modalHistPush(); }
    modalLastFocus = document.activeElement;
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('open'));
    lockPage();
    /* הפוקוס עובר לקופסת הפופאפ (בלי טבעת פוקוס מכוערת על כפתור הסגירה) */
    /* פתיחה על ידי המשתמש (לחיצה על כפתור): הפוקוס עובר לשדה השם והמקלדת עולה. בכניסה ישירה ל-/register/ בלי פוקוס אוטומטי */
    const tel = m.id === 'contactModal' && document.documentElement.classList.contains('reg-phone') || document.documentElement.classList.contains('reg-gphone') ?m.querySelector('input[type="tel"]') : null;   // שלב הטלפון: תמיד בשדה הטלפון, והמקלדת עולה
    const af = !noFocus && !document.documentElement.classList.contains('reg-member') ? m.querySelector('[data-autofocus]') : null;   // במצב משתתף מחובר (פרטים שמורים) אין שדה לכתוב בו, ולכן אין פוקוס ואין מקלדת
    const f = tel || (af && !af.closest('.shut, [hidden]') && af.getClientRects().length ? af : null) || m.querySelector('.modal-box');
    if (f) {
      if (f.matches('.modal-box')) f.setAttribute('tabindex', '-1');
      /* שדה השם מקבל פוקוס רק אחרי שהמגירה סיימה לרדת: אם המקלדת עולה בזמן שהטופס עוד מחוץ למסך, הדפדפן (אנדרואיד) מזיז את הדף והחלק העליון נחתך. ב-iOS חייבים מיד (בתוך הלחיצה) */
      const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
      /* אנדרואיד: מקלדת נפתחת רק בתוך לחיצה, והפוקוס על שדה הפופאפ מתעכב עד שהמגירה ירדה. לכן בתוך הלחיצה עצמה מפעילים שדה זמני שקוף (בתוך המסך, כדי שהדף לא יזוז) והמקלדת עולה, ואחרי שהמגירה ירדה הפוקוס עובר לשדה האמיתי והמקלדת נשארת */
      if (f.matches('input, select, textarea') && !ios) { const px = f.matches('input') ? kbProxy(f.type === 'tel' ? 'tel' : 'text') : null; setTimeout(() => { try { if (!m.hidden && m.classList.contains('open')) kbFocus(f); } finally { if (px) px.remove(); } }, 420); }
      else f.focus({ preventScroll: true });
    }
  }
  /* החלקה למעלה בפס שבתחתית סוגרת (אותו מנגנון כמו המגירות בדף הניהול, הפוך: נפתח מלמעלה) */
  function bindGrab(m){
    const box = m.querySelector('.modal-box'); if (!box) return;
    const g = document.createElement('div'); g.className = 'modal-grab'; g.setAttribute('aria-hidden', 'true'); g.innerHTML = '<i></i>';
    box.appendChild(g);
    let sy = 0, dy = 0, t0 = 0, drag = false;
    g.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; drag = true; sy = e.clientY; dy = 0; t0 = performance.now();
      box.style.transition = 'none'; try { g.setPointerCapture(e.pointerId); } catch (x) {}
    });
    g.addEventListener('pointermove', (e) => { if (!drag) return; dy = Math.max(0, sy - e.clientY); box.style.transform = 'translateY(' + (-dy) + 'px)'; });
    const end = () => {
      if (!drag) return; drag = false;
      const v = dy / Math.max(1, performance.now() - t0), tap = dy < 4;
      box.style.transition = '';
      if (tap || dy > 90 || (v > 0.6 && dy > 30)) { box.style.transform = 'translateY(-110%)'; closeModal(m); setTimeout(() => { box.style.transform = ''; }, 400); }
      else box.style.transform = '';
    };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  }
  /* כפתור "חזרה" של הדפדפן (ובאנדרואיד) כשפופאפ ההרשמה פתוח סוגר את הפופאפ ולא עוזב את העמוד: בפתיחה נוספת רשומת היסטוריה אחת,
     חזרה בדפדפן (popstate) סוגרת את הפופאפ, וסגירה אחרת (X, רקע, Esc, החלקה) חוזרת אחורה ברשומה שהוספנו */
  let modalHist = false, skipPop = false;
  /* בתוך iframe (צפייה כמשתתף בפופאפ של דף הניהול) לא מוסיפים רשומות היסטוריה: היסטוריה של iframe משותפת עם הדף הראשי, ורשומות כאלה גרמו ל"חזרה" לחזור בתוך ה-iframe ולהשאיר רשומות מיותרות */
  const EMB = (() => { try { return window.parent !== window; } catch (e) { return true; } })();
  /* ניווט של iframe שכבר טעון בדף מוסיף רשומת היסטוריה לדף הראשי; location.replace מחליף בלי רשומה. iframe שעוד לא נטען (about:blank) מקבל src כרגיל (בלי רשומה) */
  function frameGo(fr, url) {
    try { const w = fr.contentWindow; if (w && w.location.href && w.location.href !== 'about:blank') { w.location.replace(url); fr.dataset.url = url; return; } } catch (e) {}
    fr.src = url; fr.dataset.url = url;
  }
  function modalHistPush() {
    if (modalHist || EMB) return;
    try { history.pushState({ harpatkaModal: 1 }, '', location.href); modalHist = true; } catch (e) {}
  }
  window.addEventListener('popstate', () => {
    if (skipPop) { skipPop = false; modalHist = false; regUrl(false); return; }
    const open = document.querySelector('#contactModal.open');
    if (open && modalHist) { modalHist = false; closeModal(open, true); }
  });
  function closeModal(m, fromPop){
    try { const a = document.activeElement; if (a && a.matches && a.matches('input, select, textarea')) PersonForm.blurKeyboard(a); else if (navigator.virtualKeyboard && navigator.virtualKeyboard.hide) navigator.virtualKeyboard.hide(); } catch (e) {}   // סגירת פופאפ סוגרת גם את המקלדת (גם כשהפוקוס כבר לא בשדה)
    if (m.id === 'contactModal') {
      if (modalHist && !fromPop) { skipPop = true; try { history.back(); } catch (e) { skipPop = false; modalHist = false; regUrl(false); } }
      else regUrl(false);
    }
    m.classList.remove('open');
    setTimeout(() => { m.hidden = true; if (m.id === 'contactModal' && updFlow && !m.classList.contains('open')) setUpd(false); if (!document.querySelector('.modal:not([hidden])')) unlockPage(); }, 360);
    if (modalLastFocus) modalLastFocus.focus();
  }
  // כל פופאפ נסגר ב-X, בלחיצה על הרקע, וב-Esc
  document.querySelectorAll('.modal').forEach(m => {
    m.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => closeModal(m)));
    m.addEventListener('click', (e) => { if (e.target === m) closeModal(m); });
    bindGrab(m);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.modal.open');
    if (open) closeModal(open);
  });

  /* ===== הצטרפות לעדכונים: פופאפ ההרשמה בשלב הטלפון הקיים (reg-gphone), כדי שהמשתתף יישמר ברוסטר עם המקור (?s=) כבר עכשיו.
     כך מי שהגיע ממודעה, הצטרף לקבוצה ונרשם אחרי כמה ימים מקישור בקבוצה (מדפדפן אחר) מזוהה לפי הטלפון כמי שהגיע מהמודעה.
     הכתובת (href) נשארת הקישור לקבוצה, למקרה שהסקריפט לא רץ. כפתור בתוך הפופאפ של הכפתור הקבוע (.cta-sheet) נפתח משם, אחרי שהוא נסגר ===== */
  const joinPixel = () => {   // JoinGroup ל-Pixel: ערך 1, פעם אחת בלבד לכל מכשיר
    if (!window.fbq) return;
    const K = 'harpatka_join_sent';
    try { if (localStorage.getItem(K)) return; localStorage.setItem(K, '1'); } catch (e) {}
    try { fbq('trackCustom', 'JoinGroup', { value: 1, currency: 'ILS' }); } catch (e) {}
  };
  const openGroup = () => { const w = window.open(CONFIG.updatesGroupLink, '_blank'); if (w) { try { w.opener = null; } catch (e) {} return true; } return false; };
  document.querySelectorAll('[data-updates]').forEach(el => {
    el.setAttribute('href', CONFIG.updatesGroupLink);
    el.addEventListener('click', (e) => {
      if (AS) return;   // צפייה כמשתתף מדף הניהול: הקישור הרגיל
      e.preventDefault();
      if (el.closest('.cta-sheet')) return;   // הדף פותח את הפופאפ אחרי שהפופאפ של הכפתור הקבוע נסגר
      openUpdates();
    });
  });
  /* ===== תשלום בפייבוקס (בהודעת התודה אחרי ההרשמה): קישור לקבוצת התשלום, ו-InitiateCheckout ל-Pixel בלחיצה ===== */
  document.querySelectorAll('[data-paybox], [data-bit]').forEach(el => {
    el.setAttribute('href', el.hasAttribute('data-bit') ? (CONFIG.bitLink || '#') : CONFIG.payboxLink);
    el.addEventListener('click', () => { try { fbq('track', 'InitiateCheckout'); } catch (e) {} });
  });
  /* ===== הגעה ממודעה בתשלום: הקישור במודעות הוא ?s=p. הסימון נשמר למשך הביקור (גם אם עוברים בין עמודים) ונשלח עם ההרשמה ===== */
  /* ?s=p (פייסבוק) ו-?s=pm (פייסבוק) נחשבים אותה הגעה ממודעה: הרישום נשלח כ-'p', ושני הקודים שייכים לאותו שיווק ממומן */
  const PAID = (() => {
    const ok = (x) => x === 'p' || x === 'pm';
    const q = new URLSearchParams(location.search); let s = q.get('s') || (q.has('pm') ? 'pm' : null), v = ok(s);   // גם ?pm הוא אותו קוד
    try { if (v) sessionStorage.setItem('harpatka_s', s); else v = ok(sessionStorage.getItem('harpatka_s')); } catch (e) {}
    return v;
  })();
  /* קוד ההגעה כמו שהוא (?s=dating, p, pm או כל קוד אחר): נשמר מהכניסה לביקור ונשלח עם ההרשמה. p ו-pm נשלחים כ-'p' */
  const SRC = (() => {
    const q = new URLSearchParams(location.search); let s = q.get('s') || (q.has('pm') ? 'pm' : null);
    s = s && /^[A-Za-z0-9_-]{1,32}$/.test(s) ? s.toLowerCase() : null;
    try { if (s) sessionStorage.setItem('harpatka_s', s); else s = sessionStorage.getItem('harpatka_s'); } catch (e) {}
    s = s && /^[A-Za-z0-9_-]{1,32}$/.test(s) ? s.toLowerCase() : null;
    return s === 'pm' ? 'p' : s;
  })();
  /* ===== טופס הרשמה: שם + טלפון -> Supabase (פונקציה harpatka_signup, admin/signup.sql) =====
     ולידציה ונרמול ל-E.164 זהים ללוגיקה בבסיס הנתונים (harpatka_normalize_phone).
     הרשומה נקשרת בבסיס הנתונים למפגש הקרוב (זה שבבאנר) כ"טרם שילם" */
  /* Lead חד ערכי למכשיר: נשלח לפיקסל פעם אחת בלבד לכל מכשיר/דפדפן (גם אם נרשמים או לוחצים על וואטסאפ שוב), לפי סימון ב-localStorage */
  const leadOnce = () => {
    if (!window.fbq) return;
    const K = 'harpatka_lead_sent';
    try { if (localStorage.getItem(K)) return; localStorage.setItem(K, '1'); }
    catch (e) { if (window.__leadSent) return; window.__leadSent = true; }   // בלי אחסון: פעם אחת לטעינת דף
    try { fbq('track', 'Lead'); } catch (e) {}
  };
  /* Lead (פיקסל): נשלח בהזנת טלפון בפופאפ (phoneLead למטה). חד ערכי למכשיר */
  window.HarpatkaLead = leadOnce;
  /* אותה לחיצה נשלחת גם לפיקסל של ChatGPT (OpenAI Ads) כאירוע "click", באותו כלל של פעם אחת למכשיר */
  const oaiClickOnce = () => {
    try { if (localStorage.getItem('harpatka_oai_click_sent')) return; localStorage.setItem('harpatka_oai_click_sent', '1'); }
    catch (e) { if (window.__oaiSent) return; window.__oaiSent = true; }
    try { oaiq('measure', 'custom', { type: 'custom' }, { custom_event_name: 'click' }); } catch (e) {}
  };
  /* הליד נשלח רק בהזנת טלפון תקין בפופאפ (קבוצה שקטה, שמירת מקום, השלמת פרטים), לא בלחיצה על כפתורים. Lead לפייסבוק ו-click ל-OpenAI, כל אחד פעם אחת למכשיר */
  const phoneLead = () => { leadOnce(); oaiClickOnce(); };
  const normPhone = PersonForm.normPhone;   // הלוגיקה בטופס המשותף (shared/person-form.js)
  window.normPhone = normPhone;
  const suRoots = [], suResets = [];
  function initSignup(root) {
    const q = k => root.querySelector('[data-su="' + k + '"]');
    const form = q('form'); if (!form) return;
    const btn = q('btn'), t0 = Date.now();
    PersonForm.bind(root);
    /* אחרי הרשמה: התוכן נסגר מלמעלה, הכפתור מתחלף ל"נשמר זמנית" ואז נחשפים הטקסט וכפתור התשלום בפייבוקס (הכול באנימציה) */
    let saved = false, savedFor = null;
    const showDone = (payOk = true) => {
      if (saved) return; saved = true; savedFor = (selMeeting || nearest || {}).id || null;
      document.documentElement.classList.remove('reg-gdet');   // אחרי שמירה אין צורך בשורת הטלפון עם חזרה לתיקון
      root.querySelectorAll('.su-fold:not(.su-after)').forEach(f => f.classList.add('shut'));
      btn.disabled = true; btn.classList.add('swap');
      setTimeout(() => { if (!saved) return; btn.textContent = (selMeeting || nearest) ? 'תודה על ההרשמה' : 'הפרטים נשלחו'; btn.classList.remove('swap'); btn.classList.add('saved'); if (payOk) btn.classList.add('gone'); }, 260);   // המקום נשמר: אין צורך בכפתור "נשמר זמנית" (מוסתר); בלי תשלום (מחוץ לטווח) נשאר "הפרטים נשלחו"
      if (payOk) setTimeout(() => { const a = q('after'); if (saved && a) a.classList.remove('shut'); }, 700);
    };
    suRoots.push(showDone);
    /* פתיחה למפגש אחר אחרי הרשמה: "נשמר זמנית" שייך למפגש שנרשמו אליו, ולמפגש הזה הפופאפ חוזר למצב הרשמה */
    suResets.push((id) => {
      if (!saved || savedFor === id) return;
      saved = false; savedFor = null;
      btn.classList.remove('saved', 'swap', 'gone'); btn.disabled = false; btn.textContent = curLabel();
      const a = q('after'), fl = q('fail'); if (a) a.classList.add('shut'); if (fl) fl.textContent = '';
      root.querySelectorAll('.su-fold:not(.su-after)').forEach((f) => f.classList.remove('shut'));
    });
    /* לחיצה על התשלום בפייבוקס = דיווח על תשלום, אוטומטית (בלי קישור "שילמתי"): פייבוקס נפתח בלשונית חדשה, ובמערכת המפגש מסומן "דווח" ומחכה לאימות שלנו */
    const payBtns = root.querySelectorAll('[data-paybox], [data-bit]');
    let reporting = false;
    const reportPay = async (method) => {
      const m = selMeeting || nearest; if (!m || !m.id || reporting) return;
      let tk = null; try { tk = localStorage.getItem('harpatka_claim_token') || localStorage.getItem('harpatka_roster_token'); } catch (e) {}   // אורח שכבר קיים לא עובר שלב פרטים, ולכן יש לו רק את הטוקן של הגשר
      if (!meInfo && !tk) return;   // דיווח דורש חשבון מחובר (או צפייה כמשתתף) או אסימון מהרשמה שהרגע נעשתה
      reporting = true;
      const ob = meInfo ? meOptimistic(m.id, { reported: true }) : null;
      try {
        let r;
        if (meInfo) r = await meRpc('harpatka_me_report_payment', { p_meeting: m.id, p_method: method });
        else {
          const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/harpatka_report_payment_token', { method: 'POST', keepalive: true, headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_token: tk, p_meeting: m.id, p_method: method }) });
          if (!res.ok) throw new Error('HTTP ' + res.status); r = await res.json();
        }
        if (r !== 'ok' && r !== 'reported' && r !== 'already') throw new Error('report failed');
        if (ob) ob.done();
        if (meInfo) meLoader.reload(0);
      } catch (e) { if (ob) ob.fail(); }   // הדיווח נכשל: הכפתור נשאר, ולחיצה נוספת מנסה שוב
      reporting = false;
    };
    payBtns.forEach((b) => b.addEventListener('click', () => { reportPay(b.hasAttribute('data-bit') ? 'bit' : 'paybox'); }));
    /* תשלום מהקרדיט: הקרדיט מכסה את מחיר המפגש ומוקצה לו (בלי פייבוקס) */
    const cbtn = q('paycredit'); let crBusy = false;
    if (cbtn) cbtn.addEventListener('click', async () => {
      const m = selMeeting || nearest; if (!m || !m.id || !meInfo || crBusy) return;
      const x = (meInfo.meetings || []).find((y) => y.id === m.id), price = x ? Number(x.price) || 0 : 0, credit = Number(meInfo.credit) || 0; if (!x || !price || credit <= 0) return;
      crBusy = true; cbtn.disabled = true;
      const amt = Math.min(credit, price), ob = meOptimistic(m.id, { paid: amt, due: price > amt ? price - amt : null, reported: false }, -amt), rel = HRT.busy(cbtn);   // שארית (אם הקרדיט לא מכסה): מופיע מיד כפתור פייבוקס עליה
      applyRegState(m);
      try {
        const r = await meRpc('harpatka_me_pay_credit', { p_meeting: m.id });
        if (!r || (r.status !== 'ok' && r.status !== 'already')) throw new Error('credit failed');
        ob.done(); rel(); meLoader.reload(0);
      } catch (e) { rel(); ob.fail(); cbtn.disabled = false; const f = q('fail'); if (f) f.textContent = 'אי אפשר לשלם מהקרדיט כרגע, אפשר לנסות שוב'; }
      crBusy = false;
    });
    if (q('other')) q('other').addEventListener('click', () => openOtherPay(selMeeting || nearest));
    form.addEventListener('submit', async (e) => {
      e.preventDefault(); q('fail').textContent = '';
      if (updFlow) {   // בקשה לקבלת עדכונים: הטלפון והמקור נשלחים לרוסטר (משתתף עם טלפון בלבד, בלי מפגש ובלי מייל למנהלים) ונפתחת הקבוצה
        const ut = root.querySelector('input[type="tel"]');
        if (!normPhone((ut || {}).value || '')) { PersonForm.setErr(root, 'phone', PersonForm.MSG.phone); return; }
        const sent = (q('hp').value || Date.now() - t0 < 1500) ? Promise.resolve() :   // בוט: בלי שמירה
          fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/harpatka_signup_phone', { method: 'POST', keepalive: true, headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ p_phone: ut.value, p_token: guestToken }, SRC ? { p_src: SRC } : {})) }).catch(() => {});
        joinPixel(); if (!(q('hp').value || Date.now() - t0 < 1500)) phoneLead();
        if (openGroup()) { closeModal(contactModal); return; }   // הקבוצה בלשונית חדשה (בתוך הלחיצה, כדי שלא תיחסם)
        btn.disabled = true; const relU = HRT.busy(btn);   // הלשונית נחסמה: מחכים שהשמירה תסתיים ועוברים לקבוצה באותה לשונית
        await Promise.race([sent, new Promise((rs) => setTimeout(rs, 2500))]);
        relU(); location.href = CONFIG.updatesGroupLink; return;
      }
      if (!selMeeting && !nearestOk) { btn.disabled = true; try { await ensureNearest(); } catch (er) {} btn.disabled = false; }   // הטעינה של המפגש הקרוב נכשלה בעמוד: מנסים שוב לפני השליחה, כדי שהפופאפ והשרת יתייחסו לאותו מפגש
      if (guestStep) {   // אורח: שלב הטלפון (בלי חובת גוגל). ממשיכים לטופס המלא עם הטלפון שהוזן
        const gt = root.querySelector('input[type="tel"]');
        if (!normPhone((gt || {}).value || '')) { PersonForm.setErr(root, 'phone', PersonForm.MSG.phone); return; }
        if (!(q('hp').value || Date.now() - t0 < 1500)) phoneLead();
        /* הטלפון מזוהה כמשתתף קיים עם פרטים מלאים: נרשם למפגש בלי למלא פרטים. אחרת ממשיכים לשאר השדות */
        btn.disabled = true; const relG = HRT.busy(btn); let gr = null;
        try {
          const res = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/harpatka_signup_phone', { method: 'POST', headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ p_phone: gt.value, p_token: guestToken }, selMeeting && selMeeting.id ? { p_meeting: selMeeting.id } : {}, SRC ? { p_src: SRC } : {})) });
          gr = res.ok ? await res.json() : null;
        } catch (er) { gr = null; }
        relG(); btn.disabled = false;
        const gs = gr && gr.status;
        if (gs === 'invalid_phone') { PersonForm.setErr(root, 'phone', PersonForm.MSG.phone); return; }
        if (gs === 'created' || gs === 'exists') { const age0 = gr.age != null ? Number(gr.age) : null; suRoots.forEach((f) => f(age0 == null ? !!(selMeeting || nearest) : (ageOk(age0) && !!(selMeeting || nearest)))); setGuestStep(false); return; }
        guestReg = gs === 'need_details' && !!(gr && gr.registered); setGuestStep(false, true); const f1 = document.getElementById('cmFirst'); if (f1) try { kbFocus(f1); } catch (x) {}   // לא מזוהה (או חסרים פרטים) או שהבדיקה נכשלה: שאר השדות
        return;
      }
      if (phoneMode) {   // מחוברים עם גוגל, אין משתתף מקושר: רק טלפון. השרת מחבר את החשבון למשתתף עם הטלפון הזה (או יוצר משתתף עם הטלפון בלבד) ורושם למפגש שנבחר
        const ph = (root.querySelector('input[type="tel"]') || {}).value || '';
        if (!normPhone(ph)) { PersonForm.setErr(root, 'phone', PersonForm.MSG.phone); return; }
        phoneLead();
        btn.disabled = true; const relB = HRT.busy(btn);
        try {
          const mm = areaFlow ? null : (selMeeting || nearest);
          const r = await meRpc('harpatka_me_phone', Object.assign({ p_phone: ph }, mm && mm.id ? { p_meeting: mm.id } : {}, SRC ? { p_src: SRC } : {}));
          const st = r && r.status;
          if (st === 'invalid_phone') PersonForm.setErr(root, 'phone', PersonForm.MSG.phone);
          else if (st === 'phone_taken') q('fail').textContent = 'מספר הטלפון הזה כבר מחובר לחשבון אחר';   // והמנהלים מקבלים מייל
          else if (st === 'blocked') q('fail').textContent = 'אי אפשר לשמור מקום מהחשבון הזה';
          else if (st === 'created' || st === 'linked' || st === 'reactivated') {
            if (st !== 'linked') { createdHere = true; }   // RegistrationValue אחרי הגיל, בהשלמת הפרטים (Lead נשלח בהזנת הטלפון)
            mePending = null;
            for (let i = 0; i < 6 && !meInfo; i++) { await meLoader.now(); if (!meInfo) await new Promise((rs) => setTimeout(rs, 450)); }   // meLoader.now מסתיים מיד כשטעינה אחרת כבר רצה; מנסים עד שהמשתתף נטען
            if (!meInfo) q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב';
            else if (areaFlow) { const af = areaFlow; areaFlow = null; refreshLabel(); applyMemberMode(); try { closeModal(contactModal); } catch (x) {} setTimeout(() => openMeArea(af.search || ''), 450); }   // הטלפון חובר: עכשיו נפתח האזור האישי
            else {   // הפופאפ מחליף וריאציה: חסרים פרטים: השלמת פרטים; יש פרטים: מצב "נרשמתם" עם התשלום (ההרשמה כבר בוצעה בשרת)
              applyMemberMode(); applyRegState(mm);
              if (!meInfo.complete) { const f = document.getElementById('cmFirst'); if (f) try { f.focus({ preventScroll: true }); } catch (x) {} }
            }
          } else q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב';
        } catch (er) { q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב'; }
        relB(); btn.disabled = false; return;
      }
      if (meInfo && !meInfo.complete) {   // השלמת פרטים (הטלפון כבר מחובר והרישום כבר בוצע): שם פרטי, שם משפחה, גיל ומגדר
        const ck = PersonForm.validate(root); if (!ck.ok) return;
        btn.disabled = true; const relD = HRT.busy(btn);
        try {
          const r = await meRpc('harpatka_me_complete', { p_first: ck.v.first, p_last: ck.v.last, p_age: ck.v.age, p_gender: ck.v.gender });
          if (r === 'ok') {
            if (createdHere) { createdHere = false; try { if (window.fbq) fbq('trackCustom', 'RegistrationValue', { value: ageOk(ck.v.age) ? 3 : 1, currency: 'ILS' }); } catch (e) {} }
            Object.assign(meInfo, { first: ck.v.first, last: ck.v.last, age: ck.v.age, gender: ck.v.gender, complete: true });
            applyMemberMode();
            const mm = selMeeting || nearest, mine = mm && mm.id ? (meInfo.meetings || []).find((y) => y.id === mm.id && y.registered) : null;
            relD(); btn.disabled = false;
            if (mm && mm.id && !mine) { await memberSubmit(root, btn, q, showDone); return; }   // עוד לא רשום למפגש שנבחר: נרשם עכשיו
            showDone(ageOk(ck.v.age) && !!mine && !(Number(mine.paid) > 0 || mine.free));
            meLoader.reload(0); return;
          }
          if (!PersonForm.serverError(root, r)) q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב';
        } catch (er) { q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב'; }
        relD(); btn.disabled = false; return;
      }
      if (meInfo) { await memberSubmit(root, btn, q, showDone); return; }   // משתתף מחובר: הפרטים כבר שמורים
      if (GL && !AS && hasSess()) {   // מחובר לגוגל בלי משתתף מקושר: יוצרים משתתף (או מוצאים לפי הטלפון), מחברים את החשבון ונרשמים למפגש באותו צעד
        const ck = PersonForm.validate(root); if (!ck.ok) return;
        phoneLead();
        const mm = selMeeting || nearest, payOkJ = ageOk(ck.v.age) && !!mm;
        btn.disabled = true; btn.textContent = 'שולחים...'; const relJ = HRT.busy(btn); let doneJ = false;
        try {
          const r = await meRpc('harpatka_me_join', Object.assign({ p_first: ck.v.first, p_last: ck.v.last, p_age: ck.v.age, p_gender: ck.v.gender, p_phone: ck.v.phoneRaw }, mm && mm.id ? { p_meeting: mm.id } : {}, SRC ? { p_src: SRC } : {}));
          if (r === 'created' || r === 'exists') {
            if (r === 'created') { try { if (window.fbq) fbq('trackCustom', 'RegistrationValue', { value: ageOk(ck.v.age) ? 3 : 1, currency: 'ILS' }); } catch (e) {} }
            doneJ = true; showDone(payOkJ);
            for (let i = 0; i < 6 && !meInfo; i++) { await meLoader.now(); if (!meInfo) await new Promise((rs) => setTimeout(rs, 450)); }   // המשתתף המקושר נטען: השם בבאנר והמפגשים מתעדכנים
          } else if (PersonForm.serverError(root, r)) { /* ההודעה ליד השדה */ }
          else q('fail').textContent = r === 'phone_taken' ? 'מספר הטלפון הזה כבר מחובר לחשבון אחר' : r === 'blocked' ? 'אי אפשר לשמור מקום מהחשבון הזה' : 'משהו השתבש, אפשר לנסות שוב';   // טלפון של משתתף אחר: ההרשמה לא מתבצעת (והמנהלים מקבלים מייל)
        } catch (er) { q('fail').textContent = 'משהו השתבש, אפשר לנסות שוב'; }
        relJ(); if (!doneJ) { btn.disabled = false; btn.textContent = curLabel(); }
        return;
      }
      const chk = PersonForm.validate(root); if (!chk.ok) return;
      const first = chk.v.first, last = chk.v.last, norm = chk.v.phone, age = chk.v.age, gender = chk.v.gender;
      /* אפשרות תשלום רק בטווח הגילאים של קהל היעד (AGE_MIN עד AGE_MAX ב-shared/age.js; ההרשמה עצמה נשמרת תמיד) */
      /* תשלום רק אחרי הרשמה למפגש: בלי מפגש (השארת פרטים בלבד) אין כפתור תשלום */
      const payOk = ageOk(age) && !!(selMeeting || nearest);
      const allDone = () => { suRoots.forEach(f => f(payOk)); };   // בלי שמירה בדפדפן: בכל טעינה של הדף הטופס מוצג מחדש
      if (q('hp').value || Date.now() - t0 < 1500) { allDone(); return; }   // בוט: מציגים הצלחה בלי לשמור
      phoneLead();   // טופס מלא (בלי שלב טלפון נפרד, למשל בדפדפן של אפליקציה): גם בו מוזן טלפון
      btn.disabled = true; btn.textContent = 'שולחים...';
      const relBtn = HRT.busy(btn);   // אפקט המתנה על הכפתור עד שהתשובה מגיעה
      let finished = false;
      const claimToken = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;   // אסימון חיבור לאזור האישי (נשמר על המשתתף החדש בלבד)
      try {
        if (guestReg && guestToken) {   // השלמת פרטים למשתתף שנוצר בשלב הטלפון
          const rc = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/harpatka_signup_complete', { method: 'POST', headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_token: guestToken, p_first: first, p_last: last, p_age: age, p_gender: gender }) });
          const oc = rc.ok ? await rc.json() : null;
          if (oc === 'ok') {
            try { localStorage.setItem('harpatka_claim_token', guestToken); } catch (e) {}
            try { if (window.fbq) fbq('trackCustom', 'RegistrationValue', { value: ageOk(age) ? 3 : 1, currency: 'ILS' }); } catch (e) {}
            finished = true; allDone(); guestReg = false;
          } else if (PersonForm.serverError(root, oc)) { /* ההודעה הוצגה ליד השדה */ }
          else throw new Error('complete failed');
          relBtn(); if (!finished) { btn.disabled = false; btn.textContent = curLabel(); }
          return;
        }
        /* רוסטר (CONFIG.rosterApi, מוזרק רק בסביבת הבדיקות): ההרשמה נכנסת ל-API של רוסטר, בעסק harpatka, והמיילים יוצאים משם */
        const rosterSend = async () => {
          const RH = { Authorization: 'Bearer ' + CONFIG.rosterApi.key, 'Content-Type': 'application/json' }, rmap = { first_name: 'invalid_name', last_name: 'invalid_name', phone: 'invalid_phone', age: 'invalid_age', gender: 'invalid_gender' };
          let rtk = ''; try { rtk = localStorage.getItem('harpatka_roster_token') || ''; } catch (e) {}   // שלב הטלפון כבר יצר משתתף (בלי שם): משלימים אותו באסימון (שמירת פרטים לא מעדכנת משתתף קיים)
          if (rtk) {
            const rc2 = await fetch(CONFIG.rosterApi.url + '/signup/complete', { method: 'POST', headers: RH, body: JSON.stringify({ participant_token: rtk, first_name: first, last_name: last, age: age, gender: gender }) });
            if (rc2.ok) {
              if ((selMeeting || nearest) && (selMeeting || nearest).id) { try { await fetch(CONFIG.rosterApi.url + '/signup/phone', { method: 'POST', headers: RH, body: JSON.stringify(Object.assign({ phone: norm, meeting_id: (selMeeting || nearest).id }, SRC ? { source_code: SRC } : {})) }); } catch (e) {} }   // המפגש שנבחר (אם עוד לא נרשם אליו)
              return { ok: true, json: async () => 'created' };
            }
            let jj = null; try { jj = await rc2.json(); } catch (e) {}
            const ff = jj && jj.error && jj.error.field;
            if (ff) return { ok: true, json: async () => rmap[ff] || 'error' };
          }
          const r = await fetch(CONFIG.rosterApi.url + '/signup', { method: 'POST', headers: { Authorization: 'Bearer ' + CONFIG.rosterApi.key, 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ first_name: first, last_name: last, phone: norm, age: age, gender: gender }, (selMeeting || nearest) && (selMeeting || nearest).id ? { meeting_id: (selMeeting || nearest).id } : {}, SRC ? { source_code: SRC } : {})) });
          let j = null; try { j = await r.json(); } catch (e) {}
          if (r.ok) return { ok: true, json: async () => 'created' };
          const f = j && j.error && j.error.field, map = { first_name: 'invalid_name', last_name: 'invalid_name', phone: 'invalid_phone', age: 'invalid_age', gender: 'invalid_gender' };
          return { ok: true, json: async () => (f && map[f]) || 'error' };
        };
        const send = CONFIG.rosterApi ? rosterSend : (extra) => fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/harpatka_signup', {
          method: 'POST',
          headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ p_first: first, p_last: last, p_phone: norm, p_age: age, p_gender: gender }, claimToken ? { p_token: claimToken } : {}, selMeeting && selMeeting.id ? { p_meeting: selMeeting.id } : {}, extra))
        });
        let res = await send(SRC ? { p_src: SRC } : {});
        if (!res.ok && SRC) res = await send({});   // אם הפונקציה בבסיס הנתונים עוד לא עודכנה (admin/source.sql): ההרשמה נשמרת בלי הסימון
        const out = res.ok ? await res.json() : null;
        if (out === 'created' || out === 'exists') {   // כפילות: אותה הודעה, בלי לחשוף שהמספר כבר רשום
          if (out === 'created') {   // RegistrationValue רק על מספר חדש, לא על כפילות
            try { if (claimToken) localStorage.setItem('harpatka_claim_token', claimToken); } catch (e) {}   // האזור האישי יחבר את המשתתף לחשבון גוגל בלי טלפון
            /* RegistrationValue: ערך 3 למי שבטווח הגילאים (זהה ל-payOk), 1 למי שמחוץ לטווח */
            const inRange = ageOk(age);
            try { if (window.fbq) fbq('trackCustom', 'RegistrationValue', { value: inRange ? 3 : 1, currency: 'ILS' }); } catch (e) {}
          }
          finished = true; allDone();
        } else if (PersonForm.serverError(root, out)) { /* ההודעה הוצגה ליד השדה */ }
        else throw new Error('signup failed');
      } catch (err) {
        q('fail').innerHTML = 'משהו השתבש, אפשר ליצור קשר ישירות: <a href="#" class="underline font-bold">שיחה בוואטסאפ</a>';
        q('fail').querySelector('a').addEventListener('click', ev => { ev.preventDefault(); const m = document.getElementById('contactModal'); if (m) { if (m.hidden) openModal(m); showChoose(); } });
      }
      relBtn();
      if (!finished) { btn.disabled = false; btn.textContent = curLabel(); }
    });
  }
  /* פופאפ יצירת קשר: כפתור שלישי "השאירו פרטים" מחליף את הבחירה בטופס (באותו פופאפ) */
  const cmChoose = document.getElementById('cmChoose'), cmFormView = document.getElementById('cmFormView');
  function showChoose() { if (!cmChoose) return; cmFormView.hidden = true; cmChoose.hidden = false; }
  function showForm() { if (!cmChoose) return; cmChoose.hidden = true; cmFormView.hidden = false; }
  document.querySelectorAll('[data-su-root]').forEach(initSignup);
  if (cmChoose) {
    document.getElementById('cmShowForm').addEventListener('click', () => { showForm(); const i = cmFormView.querySelector('[data-su="first"]'); if (i) i.focus(); });
    new MutationObserver(() => { if (document.getElementById('contactModal').hidden) showForm(); }).observe(document.getElementById('contactModal'), { attributes: true, attributeFilter: ['hidden'] });
  }

  ['updates'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.setAttribute('href', CONFIG.updatesGroupLink); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  });

  /* ===== כפתורי וואטסאפ: מספר אחד לשני המנחים (CONFIG.whatsapp), עם הודעה מוכנה ===== */
  const waHref = 'https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(CONFIG.whatsappMessage);
  document.querySelectorAll('[data-wa], #cmWa').forEach((el) => el.setAttribute('href', waHref));
  /* ===== משתתף מחובר (חשבון גוגל מהאזור האישי, אותו מפתח session של me/): הרשמה למפגש בלחיצה אחת, בלי הזנת פרטים ===== */
  const ME_KEY = 'harpatka_me_session';
  let loggedOutFlag = false;   // אחרי יציאה לא מקפיצים כניסה עם גוגל מעצמנו; רק לחיצה על משהו שדורש חיבור (פתיחת האזור האישי, שמירת מקום) מפעילה אותה
  /* צפייה כמשתתף (מנהל, מהעין בפרטי המשתתף בדף הניהול): /?as=<מזהה המשתתף>. הדף מתנהג כאילו המשתתף מחובר עם גוגל (השם בבאנר, המפגשים, הרשמה ותשלום, האזור האישי),
     בלי חיבור אמיתי: הבקשות יוצאות עם החיבור של דף הניהול ועם p_as (השרת בודק שהמבקש מנהל). החיבור והשם השמורים של הדפדפן לא משתנים */
  const AS = (() => { try { const v = new URLSearchParams(location.search).get('as'); return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null; } catch (e) { return null; } })();
  const TOK_KEY = AS ? 'harpatka_admin_session_v2' : ME_KEY;
  window.__meAs = AS;
  if (AS && CONFIG.viewOnly) CONFIG.viewOnly('[data-su="btn"], [data-su="paycredit"], [data-paybox], [data-bit], [data-su="other"], .wacard', '#contactModal .pf-input');   // צפייה כמשתתף: לקריאה בלבד
  /* צפייה כמשתתף בתוך הפופאפ של דף הניהול (iframe): החלקה למטה כשהדף בראשו מורידה את הפופאפ יחד עם האצבע וסוגרת אותו (כמו האזור האישי).
     לא כשפופאפ פנימי פתוח (הרשמה, אזור אישי), כי שם הגלילה של הדף נעולה */
  if (AS && window.parent !== window) {
    let sy = 0, dy = 0, on = false;
    const top = () => !document.documentElement.classList.contains('modal-lock') && (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
    const post = (t, d) => { try { window.parent.postMessage({ harpatka: t, dy: d }, location.origin); } catch (e) {} };
    document.addEventListener('touchstart', (e) => { if (e.touches.length !== 1) return; sy = e.touches[0].screenY; dy = 0; on = top(); }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!on) return; const d = e.touches[0].screenY - sy;   // screenY: לא משתנה כשהפופאפ (והדף שבתוכו) זז עם האצבע
      if (d > 6 && top()) { dy = d; if (e.cancelable) e.preventDefault(); post('me-drag', dy); } else if (d <= 0 && dy === 0) { on = false; }
    }, { passive: false });
    const end = () => { if (on && dy > 0) post('me-drag-end', dy); on = false; dy = 0; };
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  }
  let meInfo = null;   // { first, last, age, gender, meetings }
  const hasSess = () => { try { return !!localStorage.getItem(TOK_KEY); } catch (e) { return false; } };   // יש חיבור גוגל שמור בדפדפן (גם אם עוד לא נטען המשתתף)
  /* מחובר באמת: המשתתף נטען מהשרת, או שיש חיבור שמור שעוד לא פג. חיבור שמור שפג (ואולי הרענון שלו נכשל) לא נחשב: הכפתורים פותחים כניסה עם גוגל */
  const loggedIn = () => { if (meInfo) return true; try { const s = JSON.parse(localStorage.getItem(TOK_KEY) || 'null'); return !!(s && s.access_token && jwtExp(s.access_token) * 1000 > Date.now() + 30000); } catch (e) { return false; } };
  /* חיבור שמור שפג תוקפו (נפתח מחדש אחרי יותר משעה): ה-access token פג, וה-refresh token מחדש אותו בעת טעינת הדף (שבריר שנייה עד כמה שניות, בעיקר באייפון).
     עד שהרענון מסתיים loggedIn() שקר, ולחיצה על הרשמה או על האזור האישי באותו רגע הפעילה כניסה עם גוגל מחדש (והמשתמש "לא נזכר"), למרות שהשם שלו כבר מוצג.
     לכן כשיש חיבור שמור מחכים לסיום השחזור (עד 6 שניות, ואם הוא כבר הסתיים ונכשל מנסים עוד פעם) ורק אז מחליטים אם צריך כניסה */
  let restoreP = null, restoreDone = false;
  const sessionReady = async () => {
    if (loggedIn()) return true;
    if (!hasSess() || AS) return false;
    const wait = (pr) => Promise.race([pr, new Promise((r) => setTimeout(r, 6000))]);
    try { await wait(!restoreDone && restoreP ? restoreP : meLoader.now()); } catch (e) {}
    return loggedIn();
  };
  const REG_MEET_KEY = 'harpatka_reg_meeting';   // המפגש שנבחר להרשמה לפני הכניסה עם גוגל (גם אם הכניסה עברה בניווט רגיל)
  const takeRegMeeting = () => { let m = null; try { m = JSON.parse(sessionStorage.getItem(REG_MEET_KEY) || 'null'); sessionStorage.removeItem(REG_MEET_KEY); } catch (e) {} return m && m.id ? m : null; };
  const jwtExp = (tok) => { try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch (e) { return 0; } };
  /* רענון החיבור: בקשה אחת בכל פעם. ה-refresh token של Supabase מתחלף בכל רענון (והשימוש החוזר בישן מבוטל אחרי 10 שניות, ואז כל החיבור נפסל), ולכן שתי בקשות רענון מקבילות
     באותו דף (למשל טעינת המשתתף והערוץ בזמן אמת, ברשת איטית באייפון) עלולות לנתק את המשתמש. שאר הקוראים מחכים לאותה בקשה, ואם בינתיים חיבור אחר (לשונית אחרת) כבר רענן, משתמשים בו */
  let refreshing = null;
  async function meToken() {
    let s = null; try { s = JSON.parse(localStorage.getItem(TOK_KEY) || 'null'); } catch (e) {}
    if (!s || !s.access_token) return null;
    if (jwtExp(s.access_token) * 1000 > Date.now() + 30000) return s.access_token;
    if (!s.refresh_token) return null;
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const r = await fetch(CONFIG.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
        if (!r.ok) {   // אולי לשונית אחרת רעננה בינתיים (הטוקן ששלחנו כבר הוחלף): אם יש עכשיו חיבור תקף, משתמשים בו
          try { const n = JSON.parse(localStorage.getItem(TOK_KEY) || 'null'); if (n && n.access_token && jwtExp(n.access_token) * 1000 > Date.now() + 30000) return n.access_token; } catch (e) {}
          return null;
        }
        const d = await r.json(); try { localStorage.setItem(TOK_KEY, JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token })); } catch (e) {}
        return d.access_token;
      } catch (e) { return null; }
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  async function meRpc(name, body) {
    const tok = await meToken(); if (!tok) throw new Error('auth');
    const r = await fetch(CONFIG.supabaseUrl + '/rest/v1/rpc/' + name, { method: 'POST', headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, body || {}, AS ? { p_as: AS } : {})) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  /* משתתף מחובר שכבר רשום למפגש שנבחר: הפופאפ במצב תשלום ולא במצב הרשמה: בלי כפתור "הרשמה"; מוצגים מצב המפגש (נרשמתם), כפתור התשלום בפייבוקס והקישורים (דיווח, תשלום בדרך אחרת),
     או הודעה אם כבר שולם, חינם או דווח. מפגש שלא נרשם אליו: הפופאפ כרגיל */
  let NOTE0 = null;
  function applyRegState(m) {
    const root = contactModal; if (!root) return;
    const q = (k) => root.querySelector('[data-su="' + k + '"]'), btn = q('btn'), after = q('after'), note = root.querySelector('.su-paynote'), fold = q('payfold');
    if (!btn || !after || !note) return;
    if (NOTE0 == null) NOTE0 = note.innerHTML;
    /* משתתף מחובר עם פרטים והדף לא מכיר מפגש (הטעינה נכשלה) אבל השרת כבר רשם אותו למפגש: מציגים את המפגש שנרשם אליו (מצב נרשמתם והתשלום), ולא "השארת פרטים" */
    if (meInfo && meInfo.complete && !(m && m.id)) {
      const reg = (meInfo.meetings || []).filter((y) => y.registered && y.future).sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)))[0];
      if (reg) { selMeeting = { id: reg.id, date: reg.date, time: reg.time, name: reg.name || '', city: reg.city || '', place: reg.place || '', max: reg.max || 0, tiers: { base: Number(reg.price) || 80, steps: [] } }; showMeeting(selMeeting); m = selMeeting; }
    }
    const noMeet = !!(meInfo && meInfo.complete && !(m && m.id));   // פרטים שמורים ואין שום מפגש: אין מה להשאיר ואין שדות, אז גם אין כפתור
    const nmEl = q('nomeet'); if (nmEl) nmEl.hidden = !noMeet;
    const x = meInfo && meInfo.complete && m && m.id ? (meInfo.meetings || []).find((y) => y.id === m.id && y.registered) : null;   // מבחינת המשתתף ההרשמה נחשבת רק אחרי שמילא את הפרטים
    if (!x) {
      if (root.dataset.regState) {   // חזרה למצב הרשמה רגיל
        delete root.dataset.regState; btn.hidden = false; note.innerHTML = NOTE0; if (fold) fold.hidden = false; if (rep) rep.hidden = true;
        { const pa0 = root.querySelector('[data-paywrap]'), cb0 = q('paycredit'), cn0 = q('crnote'); if (pa0) pa0.hidden = false; if (cb0) cb0.hidden = true; if (cn0) cn0.hidden = true; showMeeting(m || selMeeting || nearest); }
        if (!btn.classList.contains('saved')) { after.classList.add('shut'); root.querySelectorAll('.su-fold:not(.su-after)').forEach((f) => f.classList.remove('shut')); }
      }
      btn.hidden = noMeet;
      return;
    }
    const paid = Number(x.paid) > 0, free = !!x.free;
    /* קרדיט (בלשון המשתתף): יש קרדיט = כפתור אחד בלבד, תשלום מהקרדיט עד המקסימום שלו. רק אחרי שהשתמשו בו, ואם נשארה שארית (due) או שאין קרדיט, מופיע הכפתור של פייבוקס */
    const price = Number(x.price) || 0, credit = Math.max(0, Number(meInfo.credit) || 0), rem = (paid && Number(x.due) > 0) ? Number(x.due) : 0;
    const useCr = !paid && !free && credit > 0 && price > 0, crFull = useCr && credit >= price, payAmt = rem || price;
    const ilsF = (n) => '₪' + Math.round(Math.abs(n)).toLocaleString('he-IL'), payA = root.querySelector('[data-paywrap]'), crN = q('crnote'), crB = q('paycredit');
    if (payA) { payA.hidden = useCr; if (payAmt > 0) payA.querySelectorAll('[data-price]').forEach((pe) => { pe.textContent = payAmt + ' ₪'; }); }
    if (crB) { crB.hidden = !useCr; crB.disabled = false; crB.textContent = 'תשלום מהקרדיט · ' + ilsF(Math.min(credit, price)); }
    if (crN) { const t = crFull ? 'יש לכם קרדיט ' + ilsF(credit) + '. התשלום יורד מהקרדיט, ויישאר ' + ilsF(credit - price) : useCr ? 'הקרדיט כולו (' + ilsF(credit) + ') ינוצל על המפגש, ונשאר לשלם ' + ilsF(price - credit) + ' בפייבוקס' : rem ? 'שולם ' + ilsF(x.paid) + '. נשאר לשלם ' + ilsF(rem) : ''; crN.textContent = t; crN.hidden = !t; }
    root.dataset.regState = '1';
    btn.hidden = true;
    root.querySelectorAll('.su-fold:not(.su-after)').forEach((f) => f.classList.add('shut'));
    after.classList.remove('shut');
    note.innerHTML = '<span class="su-regd">שמרתם מקום למפגש</span>' + (free ? 'המפגש בשבילכם ללא תשלום' : (paid && !rem) ? (x.pay_mail ? 'התשלום התקבל, ופרטי המפגש' + (String(x.directions || '').trim() ? ' והוראות ההגעה' : '') + ' נשלחו אליכם במייל. נתראה!' : 'התשלום התקבל. נתראה!') : 'המקום יישמר קבוע רק לאחר תשלום');   // "נרשמתם למפגש" בשורה משלו בכתום, והמצב מתחתיו
    if (fold) fold.hidden = (paid && !rem) || free;   // כפתור התשלום נשאר עד שהתשלום באמת התקבל. הדיווח על תשלום מוצג רק בדף הניהול; המשתתף רואה הכול כאילו לא לחץ
  }
  /* שלב הטלפון לאורח (reg-gphone): הרשמה לא מחייבת גוגל. קודם טלפון בלבד, ובאותו שלב אפשר להיכנס עם גוגל (אם כבר חיברו חשבון). "המשך" פותח את שאר השדות; אזור אישי כן דורש גוגל */
  let guestStep = false;
  let updFlow = false;   // הפופאפ נפתח מ"עדכונים בוואטסאפ" (openUpdates)
  let guestReg = false;   // כבר בשלב הטלפון נוצר משתתף (הטלפון בלבד) ונרשם למפגש: שלב הפרטים משלים אותו באסימון
  const guestToken = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : null;
  function setGuestStep(on, cont) {
    if (cont) { const tl = document.querySelector('#contactModal input[type="tel"]'), v = tl ? tl.value.trim() : ''; document.querySelectorAll('.su-gph').forEach((e) => { e.innerHTML = 'טלפון: <bdi dir="ltr">' + String(v).replace(/[<>&]/g, '') + '</bdi>'; }); }   // שלב הפרטים: הטלפון שהוזן מוצג ליד "חזרה" ואפשר לתקן
    guestStep = !!on; document.documentElement.classList.toggle('reg-gphone', guestStep); document.documentElement.classList.toggle('reg-gdet', !guestStep && !!cont);   /* reg-gdet: אורח אחרי "המשך": מוצג כפתור חזרה לשלב הטלפון */
    document.querySelectorAll('[data-su="btn"]:not(.saved):not(:disabled)').forEach((b) => { b.textContent = curLabel(); });
  }
  let areaFlow = null;   // כניסה לאזור האישי בלי טלפון מקושר: פופאפ ההרשמה במצב טלפון בלבד (בלי שיוך למפגש), ורק אחריו נפתח האזור האישי
  let phoneMode = false;   // מחוברים עם גוגל, אין משתתף מקושר: פופאפ ההרשמה במצב הזנת טלפון בלבד
  let createdHere = false;   // המשתתף נוצר בהרשמה הזו (בשלב הטלפון): RegistrationValue נשלח כשהגיל ידוע, בהשלמת הפרטים
  function setPhoneMode(on) {
    const was = phoneMode; phoneMode = !!on; document.documentElement.classList.toggle('reg-phone', phoneMode);
    if (phoneMode) paintPhoneHint();
    if (phoneMode && !was) { const m = document.getElementById('contactModal'), t = m && !m.hidden && m.querySelector('input[type="tel"]'); if (t) try { kbFocus(t); } catch (e) {} }   // נכנסו עם גוגל מתוך הפופאפ: עוברים לשדה הטלפון
  }
  /* שלב הטלפון: מי מחובר ("מחוברים כ...", השם מחשבון הגוגל) וקישור "זה לא אני" שמנתק */
  function googleName() {
    try { const s = JSON.parse(localStorage.getItem(TOK_KEY) || 'null'), md = JSON.parse(decodeURIComponent(escape(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))).user_metadata || {}; return String(md.full_name || md.name || '').trim(); } catch (e) { return ''; }
  }
  function paintPhoneHint() {
    const m = document.getElementById('contactModal'); if (!m) return;
    const n = googleName(), el = m.querySelector('[data-su="pname"]'); if (el) el.textContent = n ? 'מחוברים כ' + n : 'מחוברים עם חשבון גוגל';
    const b = m.querySelector('[data-su="notme"]'); if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', () => {
      if (AS) return;
      try { localStorage.removeItem(ME_KEY); localStorage.removeItem('harpatka_me_name'); } catch (er) {}
      meInfo = null; window.__meName = null; window.__meAdmin = false; areaFlow = null; setPhoneMode(false); applyMemberMode(); try { window.dispatchEvent(new Event('harpatka:me')); } catch (er) {}
      gsiNoAuto(); gsiLoad(); try { closeModal(m); } catch (er) {}
    }); }
  }
  /* שם להצגה של המשתתף המחובר: שם פרטי ומשפחה, ואם עוד לא השלים פרטים: הטלפון */
  const meDisplay = () => meInfo ? ((meInfo.first + ' ' + meInfo.last).trim() || meInfo.phone || '') : '';
  /* וריאציות של אותו פופאפ הרשמה (מחוברים עם גוגל):
     reg-phone: אין משתתף מקושר לחשבון: רק טלפון (harpatka_me_phone מחבר או יוצר משתתף ורושם למפגש);
     reg-details: יש משתתף מקושר בלי פרטים: שם פרטי, שם משפחה, גיל ומגדר (harpatka_me_complete);
     reg-member: משתתף מקושר עם פרטים: הרשמה בלחיצה */
  const applyMemberMode = () => {
    const on = !!meInfo, full = on && meInfo.complete, h = document.documentElement.classList;
    h.toggle('reg-member', full);
    h.toggle('reg-details', on && !full);
    h.remove('reg-join');
    setPhoneMode(!on && GL && !AS && loggedIn());
    if ((on || loggedIn()) && guestStep) setGuestStep(false);   // התחברו עם גוגל: שלב הטלפון של האורח מסתיים
    if (on && !full) {   // השלמת פרטים: הטלפון כבר ידוע (השדה מוסתר וממולא בשבילו), והפרטים הקיימים אם יש
      const t = document.getElementById('cmPhone'); if (t && meInfo.phone) t.value = meInfo.phone;
      PersonForm.fill(document.getElementById('contactModal') || document, { first: meInfo.first, last: meInfo.last, age: meInfo.age, gender: meInfo.gender });
      prefillGoogleName();   // שם פרטי ושם משפחה מחשבון הגוגל, רק בשדות ריקים
    }
    document.querySelectorAll('[data-su="who"]').forEach((e) => { e.textContent = on ? meDisplay() : ''; });
    if (on) { window.__meName = meDisplay(); try { window.dispatchEvent(new Event('harpatka:me')); } catch (e) {} }
  };
  /* התחברות עם גוגל ישר מדף הבית (בלי לעבור באזור האישי): חוזרים לאותו עמוד עם הטוקן ב-hash, שומרים אותו, ואם אין משתתף מקושר פותחים את פופאפ ההרשמה */
  const LOGIN_KEY = 'harpatka_login_pending';   // '1': פתיחת הרשמה רק אם אין משתתף; 'reg': תמיד לפתוח את פופאפ ההרשמה אחרי ההתחברות
  /* כשהחיבור והנתונים ברוסטר (CONFIG.rosterApi): אין כניסה דרך חשבון הגוגל של floa (מסך אישור בשם floa). הכניסה רק עם האפליקציה של הרפתקה (Google Identity); אם היא לא זמינה, הטופס הרגיל עם הודעה */
  /* googleButton (CONFIG.rosterApi.googleButton): הכניסה תמיד דרך כפתור גוגל שפותח את מסך בחירת החשבון של גוגל בחלון קופץ, עם שם האפליקציה של הרפתקה (ולא השכבה האוטומטית One Tap ולא FedCM) */
  const noFloaLogin = () => { if (!(CONFIG.rosterApi && CONFIG.rosterApi.authUrl)) return false; tapCtx = null; regFallback(true); return true; };
  function loginGoogle(after) {
    if (noFloaLogin()) return;
    try { sessionStorage.setItem(LOGIN_KEY, after || '1'); } catch (e) {}
    location.href = ((CONFIG.rosterApi && CONFIG.rosterApi.authUrl) || CONFIG.supabaseUrl) + '/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
  }
  /* כניסה עם גוגל בחלון קופץ: הדף לא מתרענן ולא עובר לשום מקום. החלון הקופץ חוזר ל-me/, שומר את החיבור ב-localStorage, מסמן harpatka_login_done וסוגר את עצמו;
     כאן מאזינים לסימון (אירוע storage), טוענים את המשתתף ומרעננים את הפופאפ הפתוח. אם החלון נחסם: ניווט רגיל כמו קודם */
  function loginWindow(after, thenOpen) {
    if (!GL) return;
    if (noFloaLogin()) return;
    try { localStorage.setItem('harpatka_login_popup', '1'); } catch (e) {}
    const url = ((CONFIG.rosterApi && CONFIG.rosterApi.authUrl) || CONFIG.supabaseUrl) + '/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=' + encodeURIComponent(BASE + 'me/');
    const w = window.open(url, 'harpatka_login', 'width=480,height=680');
    if (!w) { try { localStorage.removeItem('harpatka_login_popup'); if (thenOpen) sessionStorage.setItem('harpatka_open_me', '1'); } catch (e) {} return loginGoogle(after); }
    const onDone = (ev) => {
      if (ev.key !== 'harpatka_login_done') return;
      window.removeEventListener('storage', onDone); clearInterval(iv);
      afterLogin(after, thenOpen);
    };
    window.addEventListener('storage', onDone);
    const iv = setInterval(() => { if (w.closed) { clearInterval(iv); setTimeout(() => window.removeEventListener('storage', onDone), 1500); try { localStorage.removeItem('harpatka_login_popup'); } catch (e) {} } }, 800);
  }
  /* אחרי כניסה (מהשכבה של גוגל או מהחלון הקופץ): טוענים את המשתתף, מרעננים את האזור האישי שנטען מראש, ואם נכנסו מ"כניסה לאזור האישי" הוא נפתח */
  function afterLogin(after, thenOpen) {
    mePending = after || null; const ld = meLoader.now();
    if (meSheet) { meSheet.dataset.k = ''; if (!meSheet.hidden) { const f = meSheet.querySelector('iframe'); try { f.contentWindow.location.reload(); } catch (e) { frameGo(f, f.dataset.url || f.src); } } }   // טעינה מחדש בלי רשומת היסטוריה
    if (thenOpen) Promise.resolve(ld).then(() => openMeArea(''));
  }
  /* ===== כניסה עם גוגל בשכבה קטנה של גוגל מעל הדף (Google One Tap, בכרום דרך FedCM), בלי חלון ובלי כרטיסייה חדשה =====
     גוגל מחזיר לדף אישור חתום (ID token), ו-Supabase מחליף אותו בחיבור רגיל (grant_type=id_token), אותו חיבור כמו בכניסה בחלון.
     כשהשכבה לא יכולה להופיע (אין חשבון גוגל מחובר בדפדפן, גוגל השהה אותה אחרי שנסגרה, דפדפן שלא תומך, הכתובת לא מורשית אצל גוגל): החלון הקופץ (loginWindow).
     דורש ב-Google Cloud Console, ב-OAuth client של Supabase: Authorized JavaScript origins = https://harpatka.co.il ו-https://test.harpatka.co.il */
  const GCID = CONFIG.googleClientId || '';
  const GBTN = !!(CONFIG.rosterApi && CONFIG.rosterApi.googleButton);
  let gsiState = 0, gsiNonce = '', tapCtx = null, gsiP = null;   // gsiState: 0 לא נטען, 1 נטען, 2 מוכן, -1 נכשל; gsiP: מתי מוכן (true) או נכשל (false)
  function gsiLoad() {
    if (gsiState || !GL || AS || !GCID || !window.crypto || !crypto.subtle) return gsiP;
    gsiState = 1;
    gsiP = new Promise((res) => {
      const t = setTimeout(() => { if (gsiState === 1) gsiState = -1; res(gsiState === 2); }, 8000);
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onerror = () => { gsiState = -1; clearTimeout(t); res(false); };
      s.onload = async () => {
        try {
          const raw = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
          const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), (b) => b.toString(16).padStart(2, '0')).join('');
          gsiNonce = raw;   // לגוגל עובר הגיבוב, ול-Supabase הערך המקורי (הוא בודק שהגיבוב שלו תואם לאישור)
          /* use_fedcm_for_button: הכפתור של גוגל (בפופאפ הגיבוי) פותח בכרום את חלון הבחירה הקטן של הדפדפן בתוך הדף, ולא חלון נפרד */
          google.accounts.id.initialize({ client_id: GCID, callback: onGoogleCredential, nonce: hash, auto_select: true, cancel_on_tap_outside: true, itp_support: true, use_fedcm_for_prompt: true, use_fedcm_for_button: !GBTN, context: 'signin' });
          gsiState = 2;
        } catch (e) { gsiState = -1; }
        clearTimeout(t); res(gsiState === 2);
      };
      document.head.appendChild(s);
    });
    return gsiP;
  }
  async function onGoogleCredential(resp) {
    const c = tapCtx || { after: null, thenOpen: false }; tapCtx = null;
    { const gm = document.getElementById('gloginModal'); if (gm && !gm.hidden) try { closeModal(gm); } catch (e) {} }
    try { const pl = JSON.parse(decodeURIComponent(escape(atob(String(resp && resp.credential).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); if (pl && pl.email) sessionStorage.setItem('harpatka_g_email', String(pl.email).toLowerCase()); } catch (e) {}   // האימייל מהאישור של גוגל נשמר: אם הכניסה נכשלת והמשתתף נרשם כאורח, הוא מצורף להרשמה
    try {
      const r = await fetch(CONFIG.supabaseUrl + '/auth/v1/token?grant_type=id_token', { method: 'POST', headers: { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'google', id_token: resp && resp.credential, nonce: gsiNonce }) });
      const d = r.ok ? await r.json() : null;
      if (!d || !d.access_token) throw new Error('token ' + r.status);
      localStorage.setItem(ME_KEY, JSON.stringify({ access_token: d.access_token, refresh_token: d.refresh_token })); try { sessionStorage.removeItem('harpatka_g_email'); } catch (x) {}
    } catch (e) {   // החלפת האישור נכשלה. בהרשמה: הטופס המלא (ההרשמה לא נחסמת). באזור האישי: הכניסה הרגילה (ניווט)
      if (c.after === 'reg') return regFallback(true);
      if (c.thenOpen) try { sessionStorage.setItem('harpatka_open_me', '1'); } catch (x) {}
      return loginGoogle(c.after);
    }
    afterLogin(c.after, c.thenOpen);
  }
  /* ===== ההרשמה לעולם לא נחסמת בגלל הכניסה עם גוגל =====
     כשהכניסה עם גוגל לא מצליחה בזמן הרשמה (הספרייה של גוגל לא נטענה או נטענת לאט, הכפתור של גוגל לא עובד, האישור לא התקבל,
     או שהמשתתף סגר את השכבה של גוגל), נפתח פופאפ ההרשמה עם הטופס המלא (שם, טלפון, גיל, מגדר; harpatka_signup), כמו בדפדפן של אפליקציה.
     hard: תקלה אמיתית (לא סגירה של המשתתף): מסתירים את "נרשמתם בעבר" כדי שלא ינסו שוב לשווא. חשבון חסום לא עובר כאן (showBlocked) */
  function regFallback(hard) {
    tapCtx = null;
    if (hard) document.documentElement.classList.add('gl-fail');
    const gm = document.getElementById('gloginModal'); let wait = 0;
    if (gm && !gm.hidden) { try { closeModal(gm); } catch (e) {} wait = 400; }
    setTimeout(() => {
      if (contactModal && !contactModal.hidden) {   // כבר בפופאפ ההרשמה ("נרשמתם בעבר"): נשארים בטופס המלא
        const f = contactModal.querySelector('[data-su="fail"]'); if (f && hard) f.textContent = 'ההתחברות עם גוגל לא הצליחה. אפשר לשמור מקום כאן עם הפרטים';
        return;
      }
      openReg(false, takeRegMeeting());
      if (hard) setTimeout(() => { const f = contactModal && contactModal.querySelector('[data-su="fail"]'); if (f && !f.textContent) f.textContent = 'הכניסה עם גוגל לא הצליחה כרגע. אפשר לנסות שוב בעוד רגע, או לשמור מקום עם הפרטים כאן'; }, 120);   // לא נפתח טופס רגיל בלי להסביר למה
      // המשתתף לחץ על הרשמה: הפוקוס עובר לשדה הראשון. רק בכניסה ישירה דרך /register/ אין פוקוס אוטומטי
    }, wait);
  }
  /* כניסה עם גוגל, תמיד בתוך הדף:
     1. השכבה הקטנה של גוגל מעל הדף (אם הספרייה של גוגל עוד לא נטענה, למשל מיד אחרי יציאה מהחשבון, מחכים לה ולא פותחים חלון).
     2. אם השכבה לא יכולה להופיע (גוגל משהה אותה אחרי שנסגרה, אין חשבון גוגל מחובר בדפדפן): פופאפ קטן בתוך הדף עם הכפתור של גוגל.
     3. כשהספרייה של גוגל לא נטענת בכלל (נחסמה, אין רשת): בהרשמה הטופס המלא (regFallback), ובאזור האישי החלון הנפרד (loginWindow) */
  function loginPopup(after, thenOpen) {
    if (!GL) return;
    const ctx = { after, thenOpen }, reg = after === 'reg'; tapCtx = ctx;
    const p = gsiLoad();
    if (gsiState === 2 && window.google && google.accounts && google.accounts.id) return GBTN ? gsiButton(ctx) : gsiPrompt(ctx);
    const giveUp = () => { if (reg) return regFallback(true); tapCtx = null; loginWindow(after, thenOpen); };
    if (!p || gsiState === -1) return giveUp();
    const wait = reg ? Promise.race([p, new Promise((r) => setTimeout(() => r(false), 3500))]) : p;   // בהרשמה לא מחכים לספרייה של גוגל יותר מכמה שניות
    wait.then((ok) => { if (tapCtx !== ctx) return; if (ok && gsiState === 2) (GBTN ? gsiButton(ctx) : gsiPrompt(ctx)); else giveUp(); });
  }
  function gsiPrompt(ctx) {
    try { google.accounts.id.cancel(); } catch (e) {}
    try {
      google.accounts.id.prompt((n) => {
        if (tapCtx !== ctx) return;
        let fail = false;
        try {
          if (n.isSkippedMoment && n.isSkippedMoment()) {
            const why = n.getSkippedReason && n.getSkippedReason();
            if (why === 'user_cancel' || why === 'tap_outside' || why === 'auto_cancel') { tapCtx = null; if (ctx.after === 'reg') regFallback(false); }   // המשתתף סגר אותה בעצמו: באזור האישי לא נפתח כלום, ובהרשמה הטופס המלא (בלי גוגל)
            else fail = true;
          } else if (n.isNotDisplayed && n.isNotDisplayed()) fail = true;   // לא הופיעה (דפדפן בלי FedCM)
        } catch (e) { fail = true; }
        if (fail) gsiButton(ctx);
      });
    } catch (e) { gsiButton(ctx); }
  }
  /* פופאפ הגיבוי: הכפתור של גוגל (renderButton). בכרום הלחיצה עליו פותחת את חלון הבחירה הקטן של הדפדפן בתוך הדף.
     בהרשמה מתחתיו "הרשמה בלי חשבון גוגל", שפותח את הטופס המלא */
  function gsiButton(ctx) {
    const reg = ctx.after === 'reg';
    const m = document.getElementById('gloginModal'), box = m && m.querySelector('#gloginBtn');
    if (!box) { if (reg) return regFallback(true); tapCtx = null; return loginWindow(ctx.after, ctx.thenOpen); }
    tapCtx = ctx;
    try {
      box.innerHTML = '';
      google.accounts.id.renderButton(box, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', logo_alignment: 'center', locale: 'he', width: 300 });
    } catch (e) { if (reg) return regFallback(true); tapCtx = null; return loginWindow(ctx.after, ctx.thenOpen); }
    const alt = m.querySelector('#gloginAlt');
    if (alt) {
      alt.hidden = !reg;
      if (!alt.dataset.bound) { alt.dataset.bound = '1'; alt.addEventListener('click', (e) => { e.preventDefault(); regFallback(false); }); }
    }
    if (m.hidden) openModal(m, true);
  }
  function takeLoginHash() {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (h.get('access_token')) {
      try { localStorage.setItem(ME_KEY, JSON.stringify({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token') })); } catch (e) {}
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
      return true;
    }
    if (h.get('error_description')) { try { history.replaceState(null, '', location.pathname + location.search); sessionStorage.removeItem(LOGIN_KEY); } catch (e) {} }
    return false;
  }
  const clearMeName = () => { if (!AS) try { localStorage.removeItem('harpatka_me_name'); } catch (e) {} if (window.__meName) { window.__meName = null; } try { window.dispatchEvent(new Event('harpatka:me')); } catch (e) {} };
  /* מצב המשתתף המחובר נטען דרך HRT.loader: טעינה אחת בכל פעם, תוצאה ישנה לא דורסת חדשה, ושינויים שלי (הרשמה, דיווח) שעוד לא נקלטו מוחלים על כל טעינה שהתחילה לפניהם */
  let mePending = null;
  const meLoader = HRT.loader(async () => {
    if (!(await meToken())) return { status: 'noauth' };
    return meRpc('harpatka_me', {});
  }, (d) => {
    const pending = mePending; mePending = null;
    window.__meAdmin = false;   // מנהל הוא גם משתתף: בדף הבית מתנהג בדיוק כמו כל משתתף (אזור אישי והרשמה), בלי מעבר לדף הניהול
    if (d && d.status === 'ok' && d.participant) {   // משתתף מקושר (גם אם עוד לא השלים פרטים: אז הפופאפ מבקש אותם)
      const pp = d.participant, ph = String(pp.phone || '');
      meInfo = { first: String(pp.first_name || '').trim(), last: String(pp.last_name || '').trim(), age: pp.age, gender: pp.gender, phone: ph.indexOf('+972') === 0 ? '0' + ph.slice(4) : ph, meetings: d.meetings || [], credit: Number(d.balance) || 0 };   // credit: הקרדיט של המשתתף (אפשר לשלם ממנו על מפגש)
      meInfo.complete = meInfo.first.length >= 2 && meInfo.last.length >= 2 && meInfo.age != null && !!meInfo.gender;
      applyMemberMode(); applyRegState(selMeeting || nearest);
      if (!AS) try { localStorage.setItem('harpatka_me_name', meDisplay()); } catch (e) {}
      ensureMeChannel();
      if (!meSheet && !window.__meAdmin) setTimeout(() => { try { openMeArea('', true); } catch (e) {} }, 1500);   // טעינה מוקדמת של האזור האישי (מוסתר), כדי שהפתיחה הראשונה תהיה מיידית
      if (pending === 'reg') setTimeout(() => openReg(true, takeRegMeeting()), 300);   // נכנסו עם גוגל מתוך הרשמה: פופאפ ההרשמה של המפגש שנבחר, במצב מחובר
    } else if (d && d.status === 'noauth') { window.__meAdmin = false; clearMeName(); if (!AS) setTimeout(gsiLoad, 800); }   // אורח (גם אחרי שהחיבור פג): השכבה של גוגל נטענת מראש
    else if (d && d.status === 'blocked' && !AS) showBlocked();   // החשבון נחסם או נותק (גם בזמן אמת, וגם מיד אחרי כניסה): ניתוק ופופאפ הסבר
    else { clearMeName(); applyMemberMode(); if (!meSheet && !AS && GL && loggedIn()) setTimeout(() => { try { openMeArea('', true); } catch (e) {} }, 1500); if (pending === 'reg' && !AS) setTimeout(() => openReg(true, takeRegMeeting()), 300); }   // מחובר לגוגל אבל אין משתתף מקושר: פופאפ ההרשמה עם הטלפון בלבד (מחבר או יוצר משתתף ונרשם באותו צעד)
  });
  /* דפדפן פנימי של אפליקציה (פייסבוק, אינסטגרם ועוד, לשם מגיעים מהמודעות): גוגל חוסם שם כל כניסה עם גוגל, ולכן שם האתר מתנהג כאילו הכניסה כבויה: ההרשמה בטופס הרגיל */
  const INAPP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|MicroMessenger|TikTok|musical_ly|BytedanceWebview|Snapchat|LinkedInApp|; wv\)/i.test(navigator.userAgent || '');
  const GL = (CONFIG.googleLogin !== false && !INAPP && !PAID) || !!AS;   // מודעה בתשלום (?s=p): בלי כניסה עם גוגל (נחסמת בדפדפן של האפליקציה), רק ההרשמה הרגילה.    // מתג כניסה עם גוגל (shared/config.js); בצפייה כמשתתף הדף מתנהג כמחובר גם כשהכניסה לציבור כבויה
  document.documentElement.classList.toggle('no-gl', !GL); document.documentElement.classList.toggle('gl-on', GL && !/^(p|pm)$/.test(new URLSearchParams(location.search).get('s') || (new URLSearchParams(location.search).has('pm') ? 'pm' : '')));   // gl-on: מציג את כרטיס האזור האישי (shared/site.css); בלי כניסה עם גוגל אין זכר לאזור האישי   // כניסה עם גוגל כבויה (או דפדפן של אפליקציה): בלי קישורי הכניסה. בצפייה כמשתתף הכרטיס פותח את האזור האישי שלו
  function loadMe() {
    if (!GL) return Promise.resolve();
    takeLoginHash();
    try { const pd = sessionStorage.getItem(LOGIN_KEY); if (pd) { mePending = pd; sessionStorage.removeItem(LOGIN_KEY); } } catch (e) {}
    return meLoader.now();   // תקלה זמנית: ממשיכים כאורח, עם הטופס הרגיל
  }
  /* שינוי של המשתתף על מפגש (הרשמה, דיווח תשלום): מוצג מיד, נשמר גם מול טעינות שהתחילו לפני שהשרת קלט אותו, ומתבטל אם השליחה נכשלת */
  function meOptimistic(mid, patch, creditDelta) {
    const apply = (d) => { const mm = ((d && d.meetings) || []).find((x) => x.id === mid); if (mm) Object.assign(mm, patch); if (creditDelta && d) { if ('balance' in d) d.balance = (Number(d.balance) || 0) + creditDelta; else if ('credit' in d) d.credit = (Number(d.credit) || 0) + creditDelta; } };   // creditDelta: שינוי בקרדיט (ניצול שלו לתשלום); בתשובת השרת השדה balance ובמצב השמור credit
    const h = HRT.optimistic(apply);
    if (meInfo) { apply(meInfo); try { window.dispatchEvent(new Event('harpatka:me')); } catch (e) {} }
    return { done: h.done, fail: () => { h.fail(); meLoader.reload(0); } };
  }
  async function memberSubmit(root, btn, q, showDone) {
    const m = selMeeting || nearest, fail = q('fail'); fail.textContent = '';
    if (!m || !m.id) { fail.textContent = 'עוד אין מפגש לשמור בו מקום. נעדכן ברגע שייקבע'; return; }
    btn.disabled = true; btn.textContent = 'שולחים...';
    const ob = meOptimistic(m.id, { registered: true }), rel = HRT.busy(btn);
    try {
      const r = SRC ? await meRpc('harpatka_me_register_src', { p_meeting: m.id, p_src: SRC }) : await meRpc('harpatka_me_register', { p_meeting: m.id });   // הגיעו ממודעה: נרשם על ההרשמה למפגש הזה
      if (r !== 'registered' && r !== 'exists') throw new Error('register failed');
      ob.done(); rel();
      const mine = meInfo.meetings.find((x) => x.id === m.id);
      const payOk = ageOk(meInfo.age) && !(mine && (Number(mine.paid) > 0 || mine.free));
      showDone(payOk); meLoader.reload(0); return;   // טעינה מחדש של המצב (השינוי שלי כבר מוצג ונשמר מול טעינות ישנות)
    } catch (e) { ob.fail(); rel(); fail.textContent = 'משהו השתבש, אפשר לנסות שוב'; }
    btn.disabled = false; btn.textContent = curLabel();
  }
  /* יציאה מהחשבון (לחיצה על השם בבאנר): שואלים לפני שמנתקים */
  function confirmLogout() {
    if (!meInfo) return;
    const m = document.getElementById('logoutModal');
    m.querySelector('#logoutTtl').textContent = 'מחוברים כ' + meDisplay();
    if (!m.dataset.bound) {
      m.dataset.bound = '1';
      m.querySelector('[data-lg="yes"]').addEventListener('click', () => {
        if (AS) { if (window.top !== window) { try { parent.postMessage({ harpatka: 'me-logout' }, location.origin); } catch (er) {} } else location.href = location.pathname; return; }   // צפייה כמשתתף: "יציאה" = סיום הצפייה (בפופאפ של דף הניהול: סגירתו), בלי לנתק את החיבור של הדפדפן
        loggedOutFlag = true; try { localStorage.removeItem(ME_KEY); localStorage.removeItem('harpatka_me_name'); } catch (er) {}
        meInfo = null; window.__meName = null; window.__meAdmin = false; applyMemberMode(); try { window.dispatchEvent(new Event('harpatka:me')); } catch (er) {}
        gsiNoAuto(); gsiLoad(); closeModal(m);
      });
    }
    openModal(m, true);
  }
  /* מצב מפגש של המשתתף המחובר (להצגה בכפתור של כרטיסי המפגשים בדף הבית) */
  const meGet = (mid) => (meInfo && meInfo.complete && (meInfo.meetings || []).find((x) => x.id === mid)) || null;   // בלי פרטים: הכרטיסים בדף הבית לא מציגים "נרשמתם", והלחיצה פותחת את השלמת הפרטים
  /* חשבון חסום או מנותק (מיד אחרי כניסה עם גוגל, או בזמן אמת כשמנהל חסם): החיבור נמחק מהדפדפן, הדף חוזר למצב אורח, פופאפים פתוחים נסגרים,
     ונפתח מלמעלה פופאפ שמסביר שאי אפשר להתחבר דרך החשבון הזה (במקום שהאזור האישי ייפתח וייסגר מיד). פעם אחת גם כשגם הדף וגם האזור האישי מדווחים */
  /* אחרי יציאה מהחשבון (או חסימה) גוגל לא מחבר שוב לבד: הכניסה הבאה דורשת לחיצה (כך גוגל מבקש מאתרים עם כניסה אוטומטית) */
  function gsiNoAuto() { try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {} }
  let blockedAt = 0;
  function showBlocked() {
    if (AS || Date.now() - blockedAt < 4000) return; blockedAt = Date.now();
    try { localStorage.removeItem(ME_KEY); localStorage.removeItem('harpatka_me_name'); } catch (e) {}
    meInfo = null; mePending = null; window.__meAdmin = false; clearMeName(); applyMemberMode(); gsiNoAuto(); gsiLoad();
    const dlg = document.getElementById('blockedModal'); if (!dlg) return;
    dlg.querySelector('#blockedWa').href = 'https://wa.me/' + CONFIG.whatsapp;
    let wait = 0;
    try { if (meSheet) { meSheet.dataset.k = ''; if (!meSheet.hidden) { closeMeSheet(); wait = 450; } } } catch (e) {}
    document.querySelectorAll('.modal:not([hidden])').forEach((m) => { if (m !== dlg) { try { closeModal(m); wait = 450; } catch (e) {} } });
    setTimeout(() => openModal(dlg, true), wait);   // אחרי שהפופאפים הקודמים נסגרו (הם חוזרים אחורה בהיסטוריה)
  }
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.harpatka === 'me-blocked') showBlocked(); });   // האזור האישי (בפופאפ) גילה שהחשבון חסום
  /* שמירת מקום בדרך אחרת: פותח ישר שיחת וואטסאפ איתנו עם הודעה מוכנה (בלי פופאפ), עם פרטי המפגש */
  function openOtherPay(m) {
    let when = 'הקרוב';
    if (m && m.date) { const [, mo, d] = String(m.date).split('-').map(Number), wd = HE_DAYS[new Date(m.date + 'T12:00:00Z').getUTCDay()]; when = 'ביום ' + wd + ' ' + d + '.' + mo + (m.time ? ' בשעה ' + m.time : ''); }
    const text = 'היי, אני רוצה להעביר תשלום בדרך אחרת למפגש ' + when;
    window.open('https://wa.me/' + CONFIG.whatsapp + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
  }
  /* פופאפ האזור האישי: עולה מלמטה ומציג את דף האזור האישי (me/?embed=1) בתוך iframe, בלי לעבור לדף אחר. סגירה: גרירה למטה או לחיצה על הפס, לחיצה בחוץ, Esc וכפתור "חזרה" */
  /* מנהל: דף הניהול שומר את החיבור במפתח משלו, ולכן מעתיקים אליו את החיבור של דף הבית ועוברים אליו (בלי להתחבר שוב) */
  /* מעטפת משותפת לפופאפים שעולים מלמטה ומציגים דף בתוך iframe (האזור האישי, דף הביודנסה): פס אחיזה שנגרר או נלחץ, לחיצה בחוץ ו-Esc סוגרים. הסגירה עצמה (וההיסטוריה) אצל כל פופאפ */
  function sheetShell(label, cls, onClose) {
    const el = document.createElement('div'); el.className = 'mesheet' + (cls ? ' ' + cls : ''); el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', label);
    el.innerHTML = '<div class="mesb"></div><div class="mesp"><button type="button" class="mesgrab" aria-label="סגירה"><i></i></button><iframe class="mesf" title="' + label + '"></iframe></div>';
    document.body.appendChild(el);
    el.querySelector('.mesb').addEventListener('click', () => onClose());
    const g = el.querySelector('.mesgrab'), p = el.querySelector('.mesp'); let sy = 0, dy = 0, dr = false;
    g.addEventListener('pointerdown', (e) => { dr = true; sy = e.clientY; dy = 0; p.style.transition = 'none'; try { g.setPointerCapture(e.pointerId); } catch (x) {} });
    g.addEventListener('pointermove', (e) => { if (!dr) return; dy = Math.max(0, e.clientY - sy); p.style.transform = 'translateY(' + dy + 'px)'; });
    const end = () => { if (!dr) return; dr = false; p.style.transition = ''; p.style.transform = ''; if (dy > 70 || dy < 4) onClose(); };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') onClose(); });
    return { el, p };
  }
  /* דף הביודנסה כפופאפ מסך מלא: הקישור נשאר קישור רגיל (גוגל סורק את /biodanza/ מה-sitemap), ובלחיצה רגילה נפתח פופאפ שמציג את biodanza/?embed=1 והכתובת בדפדפן היא /biodanza/.
     סגירה: החלקה למטה מראש הדף, כפתור "חזרה לדף הבית" שבדף, Esc וכפתור "חזרה"; בסגירה הכתובת והכותרת חוזרות למה שהיו */
  let bioSheet = null, bioPush = false, bioTitle = '';
  function closeBioSheet(fromPop) {
    if (!bioSheet || bioSheet.hidden) return;
    bioSheet.classList.remove('open'); unlockPage();
    if (bioTitle) { document.title = bioTitle; bioTitle = ''; }
    if (bioPush && !fromPop) { bioPush = false; try { history.back(); } catch (e) {} } else bioPush = false;
    const sh = bioSheet; setTimeout(() => { sh.hidden = true; }, 340);
  }
  function openBioSheet() {
    if (!bioSheet) {
      const shell = sheetShell('שיטת הביודנסה', 'full', () => closeBioSheet()); bioSheet = shell.el; const p = shell.p;
      window.addEventListener('popstate', () => { if (bioPush) { bioPush = false; closeBioSheet(true); } });
      window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data || !bioSheet || bioSheet.hidden) return;
        const t = e.data.harpatka, d = Math.max(0, Number(e.data.dy) || 0);
        if (t === 'bio-drag') { p.style.transition = 'none'; p.style.transform = 'translateY(' + d + 'px)'; }
        else if (t === 'bio-close') closeBioSheet();   // "חזרה לדף הבית" בתוך הדף, או Esc כשהפוקוס בתוך המסגרת
        else if (t === 'bio-drag-end') { p.style.transition = ''; p.style.transform = ''; if (d > 110) closeBioSheet(); }
      });
    }
    const fr = bioSheet.querySelector('iframe');
    if (!fr.dataset.url) { fr.dataset.url = BASE + 'biodanza/?embed=1'; frameGo(fr, fr.dataset.url); }   // נטען רק בלחיצה הראשונה (בלי לספור צפייה בדף שלא נפתח) ונשאר חם לפתיחות הבאות
    bioSheet.hidden = false; lockPage();
    requestAnimationFrame(() => requestAnimationFrame(() => bioSheet.classList.add('open')));
    if (!bioPush && !EMB) { try { history.pushState({ bioSheet: 1 }, '', BASE + 'biodanza/'); bioPush = true; bioTitle = document.title; document.title = 'שיטת הביודנסה | יוצאים להרפתקה'; } catch (e) {} }
  }
  document.addEventListener('click', (e) => {   // קישור עם data-popup="bio": פופאפ מסך מלא במקום מעבר לדף (לחיצה אמצעית, Ctrl ופתיחה בלשונית חדשה ממשיכות לעבוד כקישור רגיל)
    const a = e.target.closest && e.target.closest('a[data-popup="bio"]'); if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank' || EMB) return;
    e.preventDefault(); openBioSheet();
  });
  let meSheet = null, meSheetPush = false;
  function closeMeSheet(fromPop) {
    if (!meSheet || meSheet.hidden) return;
    try { const f = meSheet.querySelector('iframe'), ae = f && f.contentDocument && f.contentDocument.activeElement; if (ae && ae !== f.contentDocument.body) PersonForm.blurKeyboard(ae); if (f && f.contentWindow) { try { f.contentWindow.postMessage({ harpatka: 'me-blur' }, location.origin); } catch (e2) {} } if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); PersonForm.releaseKeyboard(); setTimeout(() => { try { PersonForm.releaseKeyboard(); } catch (e3) {} }, 120); } catch (e) {}   // המקלדת נסגרת: הפוקוס היה בשדה בתוך המסגרת, והמסגרת נשארת חיה מוסתרת; הסגירה מתבצעת גם מהדף הראשי (פעם מיד, ופעם אחרי שהמסגרת סיימה לעבד את הבקשה)
    meSheet.classList.remove('open'); unlockPage();
    if (meSheetPush && !fromPop) { meSheetPush = false; try { history.back(); } catch (e) {} } else meSheetPush = false;
    const sh = meSheet; setTimeout(() => { sh.hidden = true; }, 340);
    try { meLoader.reload(250); } catch (e) {}   // מה ששונה באזור האישי מתעדכן בדף
  }
  function openMeArea(search, preload) {
    if (!preload) loggedOutFlag = false;   // לחיצה מפורשת של המשתתף: מותר לבקש כניסה
    if (!GL) return;
    if (!AS && !preload && !loggedIn()) {   // לא מחובר: ישר כניסה עם גוגל (בחלון קופץ), בלי מסך כניסה; אחרי ההתחברות האזור האישי נפתח
      if (hasSess()) { sessionReady().then((ok) => { if (ok) openMeArea(search, preload); else loginPopup('', true); }); return; }   // יש חיבור שמור: קודם מחכים לשחזור שלו
      loginPopup('', true); return;
    }
    if (!AS && !preload && !meInfo) {   // מחובר עם גוגל, עוד בלי טלפון מקושר: קודם פופאפ הטלפון מלמעלה (כמו בהרשמה), ורק אחריו האזור האישי
      Promise.resolve(restoreDone ? null : restoreP).then(() => meInfo ? openMeArea(search, preload) : openReg(false, null, { search }));
      return;
    }
    const lm = document.getElementById('logoutModal'); if (!preload && lm && !lm.hidden) { try { closeModal(lm); } catch (e) {} }
    if (!meSheet) {
      const shell = sheetShell('האזור האישי', '', () => closeMeSheet()); meSheet = shell.el; const p = shell.p;
      window.addEventListener('popstate', () => { if (meSheetPush) { meSheetPush = false; closeMeSheet(true); } });
      window.addEventListener('message', (e) => {
        if (e.origin === location.origin && e.data && e.data.harpatka === 'me-phone') {
          if (loggedOutFlag) { closeMeSheet(); return; }   // אחרי יציאה לא פותחים פופאפ הרשמה מעצמנו   // החשבון בלי טלפון מקושר: סוגרים את האזור האישי ופותחים את פופאפ הטלפון מלמעלה
          if (!meSheet || meSheet.hidden) { if (meSheet) meSheet.dataset.k = ''; return; }
          closeMeSheet(); if (!AS) setTimeout(() => openReg(false, null, { search: '' }), 380); return;
        }
        if (e.origin === location.origin && e.data && e.data.harpatka === 'me-login') {
          if (loggedOutFlag) { closeMeSheet(); return; }   // בתוך הפופאפ התברר שהחיבור לא תקף: סוגרים אותו ופותחים כניסה עם גוגל, ואחריה הפופאפ נפתח שוב
          if (!meSheet || meSheet.hidden) { if (meSheet) meSheet.dataset.k = ''; return; }   // פופאפ מוסתר (טעינה מוקדמת ברקע): לא פותחים כניסה מעצמה, רק טוענים מחדש בפתיחה הבאה
          closeMeSheet();
          if (!AS) { try { localStorage.removeItem(ME_KEY); } catch (er) {} meInfo = null; applyMemberMode(); setTimeout(() => loginPopup('', true), 380); }
          return;
        }
      });
      window.addEventListener('message', (e) => {   // החלקה למטה בתוך הדף (כשהוא בראשו) מזיזה את כל הפופאפ וסוגרת אותו
        if (e.origin !== location.origin || !e.data || !meSheet || meSheet.hidden) return;
        const t = e.data.harpatka, d = Math.max(0, Number(e.data.dy) || 0);
        if (t === 'me-drag') { p.style.transition = 'none'; p.style.transform = 'translateY(' + d + 'px)'; }
        else if (t === 'me-close') closeMeSheet();   // Esc כשהפוקוס בתוך המסגרת
        else if (t === 'me-drag-end') { p.style.transition = ''; p.style.transform = ''; if (d > 110) closeMeSheet(); }
      });
      window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.harpatka === 'me-logout' && AS) { closeMeSheet(); if (window.top !== window) { try { parent.postMessage({ harpatka: 'me-logout' }, location.origin); } catch (er) {} } else location.href = location.pathname; return; } if (e.origin === location.origin && e.data && e.data.harpatka === 'me-logout') { loggedOutFlag = true; try { localStorage.removeItem(ME_KEY); localStorage.removeItem('harpatka_me_name'); } catch (er) {} meInfo = null; window.__meName = null; window.__meAdmin = false; applyMemberMode(); try { window.dispatchEvent(new Event('harpatka:me')); } catch (er) {} meSheet.dataset.k = ''; closeMeSheet(); gsiNoAuto(); gsiLoad(); } });   // יציאה: מנתקים וסוגרים את הפופאפ, בלי לרענן את הדף
    }
    const qs = new URLSearchParams(search || ''); qs.set('embed', '1'); if (AS) qs.set('as', AS);   // צפייה כמשתתף: האזור האישי של אותו משתתף, עם החיבור של דף הניהול
    { const fr = meSheet.querySelector('iframe'); let tk = ''; try { tk = String(localStorage.getItem(TOK_KEY) || '').slice(-24); } catch (e) {}
      const key = tk + '|' + qs.toString();
      if (meSheet.dataset.k !== key) { frameGo(fr, BASE + 'me/?' + qs.toString()); meSheet.dataset.k = key; } }   // הדף נטען מראש ונשאר חם: פתיחה ראשונה ופתיחות הבאות מיידיות; נטען מחדש רק כשהחיבור או הפרמטרים השתנו
    if (preload) return;
    meSheet.hidden = false; lockPage();
    requestAnimationFrame(() => requestAnimationFrame(() => meSheet.classList.add('open')));
    { const fr = meSheet.querySelector('iframe'), fp = () => { try { if (!meSheet.hidden && fr.contentWindow.harpatkaFocusPhone) fr.contentWindow.harpatkaFocusPhone(); } catch (e) {} };   // שלב הטלפון: הפוקוס בשדה והמקלדת עולה; באייפון רק מיד בתוך הלחיצה, ובשאר אחרי שהפופאפ סיים לעלות
      if (/iP(hone|ad|od)/.test(navigator.userAgent)) fp(); else setTimeout(fp, 380); }
    if (!meSheetPush && !EMB) { try { if (AS) history.pushState({ meSheet: 1 }, ''); else history.pushState({ meSheet: 1 }, '', BASE + 'me' + (search || '')); meSheetPush = true; } catch (e) {} }   // כשהפופאפ פתוח הכתובת היא /me, ובסגירה חוזרת למה שהיתה (רענון ב-/me פותח אותו שוב)
  }
  document.addEventListener('click', (e) => {   // קישור לאזור האישי (כרטיס האזור האישי, כפתור המפגש, קישורי ההרשמה): פותחים את הפופאפ במקום לעבור לדף
    const a = e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank') return;
    let u; try { u = new URL(a.getAttribute('href'), location.href); } catch (x) { return; }
    if (!a.closest('#meAreaCard') || u.origin !== location.origin || !/\/me\/?$/.test(u.pathname) || u.searchParams.has('as') || u.searchParams.has('back')) return;   // פופאפ האזור האישי נפתח רק מהכרטיס "האזור האישי שלכם"
    e.preventDefault(); e.stopPropagation();
    if (!GL) return;   // כניסה עם גוגל כבויה: הכרטיס מוצג, והלחיצה לא עושה כלום (בינתיים)
    openMeArea(u.search);   // מחובר: הפופאפ נפתח מיד; לא מחובר: קודם כניסה עם גוגל, ואחריה הפופאפ נפתח (openMeArea → loginPopup)
  }, true);
  window.HarpatkaMe = { enabled: GL, ready: false, confirmLogout, get: meGet, login: loginGoogle, loginPopup, openArea: (search) => openMeArea(search || '') };   // ready: הטעינה הראשונה של מצב המשתתף הסתיימה (הכפתור הקבוע בדף הבית מחכה לה)
  try { if (sessionStorage.getItem('harpatka_open_me')) { sessionStorage.removeItem('harpatka_open_me'); setTimeout(() => { try { if (localStorage.getItem(ME_KEY)) openMeArea(''); } catch (e) {} }, 700); } } catch (e) {}   // חזרה מהתחברות עם גוגל שהתחילה מתוך הפופאפ: נפתח מחדש
  document.querySelectorAll('[data-su="ame"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); try { closeModal(contactModal); } catch (x) {} setTimeout(() => openMeArea(''), 450); }));   // כניסה לאזור האישי (בתחתית אחרי ההרשמה): סוגרים את פופאפ ההרשמה ופותחים את האזור האישי
  document.querySelectorAll('[data-su="gback"]').forEach((b) => b.addEventListener('click', () => { setGuestStep(true); const tl = document.querySelector('#contactModal input[type="tel"]'); if (tl) try { kbFocus(tl); } catch (e) {} }));   // חזרה משלב הפרטים לשלב הטלפון
  document.querySelectorAll('[data-su="glink"]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); try { sessionStorage.setItem(REG_MEET_KEY, JSON.stringify(selMeeting && selMeeting.id ? selMeeting : null)); } catch (er) {} loginPopup('reg'); }));   // נרשמתם בעבר: כניסה עם גוגל בחלון קופץ; אחרי החיבור פופאפ ההרשמה עובר למצב משתתף מחובר (בלי לפתוח את האזור האישי)
  { const done = () => { restoreDone = true; window.HarpatkaMe.ready = true; try { window.dispatchEvent(new Event('harpatka:me')); } catch (e) {} }; restoreP = Promise.resolve(loadMe()); restoreP.then(done, done); }
  if (GL && !AS && !loggedIn()) setTimeout(gsiLoad, 1500);   // השכבה של גוגל נטענת מראש למי שלא מחובר, כדי שתופיע מיד בלחיצה
  /* זמן אמת: מצב המשתתף המחובר דרך הערוץ "me" (בבדיקות "me-test"), ומפגשים והגדרות ציבוריות דרך הערוץ "meetings" (גם למבקרים לא מחוברים).
     הערוצים, חיבור מחדש, חזרה ללשונית וגיבוי כל 45 שניות מגיעים מ-HRT.channel */
  const IS_TEST = !!(window.HARPATKA_ENV && window.HARPATKA_ENV.name === 'test');
  /* מול רוסטר: ערוץ ציבורי אחד לעסק (roster-test:<slug> בבדיקות, roster:<slug> באמת) בבסיס הנתונים של floa; ההודעה בלי נתונים, והלקוח מרענן דרך ה-API הרגיל */
  const RR = CONFIG.rosterApi;
  const RT_CFG = RR && RR.authUrl ? { url: RR.authUrl, key: RR.authKey } : { url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey };
  const rtTopic = (prod, test) => RR && RR.authUrl ? ((RR.profile === 'roster-test' ? 'roster-test:' : 'roster:') + RR.slug) : (IS_TEST ? test : prod);
  let meChan = null;
  function ensureMeChannel() {
    if (meChan || !GL) return;
    meChan = HRT.channel(RT_CFG, rtTopic('me', 'me-test'), () => { try { if (!meInfo && !localStorage.getItem(TOK_KEY)) return; } catch (e) { return; } meLoader.reload(250); }, { poll: 45000 });
  }
  try { if (localStorage.getItem(TOK_KEY)) ensureMeChannel(); } catch (e) {}
  HRT.channel(RT_CFG, rtTopic('meetings', 'meetings-test'), () => { setTimeout(() => { loadNearestOnce(); try { window.dispatchEvent(new Event('harpatka:meetings')); } catch (e) {} }, 200 + Math.random() * 800); }, { poll: 90000 });   // פיזור קטן כדי שכל המבקרים לא יטענו באותו רגע
  const contactModal = document.getElementById('contactModal');
  /* השלמת פרטים אחרי כניסה עם גוגל: שם פרטי ושם משפחה מהחשבון (רק בשדות ריקים) */
  function prefillGoogleName() {
    return;   // השם לא מתמלא אוטומטית מחשבון הגוגל: המשתתף מקליד בעצמו (11.11.26)
    if (!document.documentElement.classList.contains('reg-details')) return;
    let md = {}; try { const s = JSON.parse(localStorage.getItem(TOK_KEY) || 'null'); md = JSON.parse(decodeURIComponent(escape(atob(s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))).user_metadata || {}; } catch (e) {}
    const full = String(md.full_name || md.name || '').trim(), first = md.given_name || full.split(' ')[0] || '', last = md.family_name || full.split(' ').slice(1).join(' ');
    const f = document.getElementById('cmFirst'), l = document.getElementById('cmLast');
    if (f && !f.value && first) f.value = first; if (l && !l.value && last) l.value = last;
  }
  /* בקשה לקבלת עדכונים: אותו פופאפ בשלב הטלפון (reg-gphone), רק הכפתור "בקשה לקבלת עדכונים". משתתף מחובר (הטלפון כבר אצלנו) עובר ישר לקבוצה */
  function setUpd(on) { updFlow = !!on; refreshLabel(); }
  function openUpdates() {
    if (meInfo && meInfo.phone) { joinPixel(); if (!openGroup()) location.href = CONFIG.updatesGroupLink; return; }
    areaFlow = null; setUpd(true); suResets.forEach((r) => r('__upd')); setGuestStep(true);   // אותו פופאפ בשלב הטלפון, בלי עיצוב חדש: רק טקסט הכפתור משתנה
    if (!contactModal) return;
    if (!contactModal.hidden) { const t = contactModal.querySelector('input[type="tel"]'); if (t) try { kbFocus(t); } catch (e) {} return; }
    openModal(contactModal);
  }
  window.HarpatkaUpdates = { open: openUpdates };
  function openReg(auto, meeting, area) { setUpd(false); areaFlow = area || null; refreshLabel(); if (!nearestOk) ensureNearest(); selMeeting = meeting && meeting.id ? meeting : null; suResets.forEach((r) => r((selMeeting || nearest || {}).id || null)); showMeeting(selMeeting || nearest); applyMemberMode(); prefillGoogleName(); applyRegState(selMeeting || nearest); { const hc = document.documentElement.classList; setGuestStep(!AS && !loggedIn() && !areaFlow && !phoneMode && !hc.contains('reg-member') && !hc.contains('reg-details') && !hc.contains('reg-phone')); } if (contactModal) openModal(contactModal, auto === true); }
  /* הרשמה כשהכניסה עם גוגל פעילה: מי שלא מחובר עובר קודם לכניסה עם גוגל (בלי פופאפ); אחרי הכניסה נפתח פופאפ ההרשמה של המפגש שנבחר:
     משתתף מקושר: הרשמה בלחיצה; בלי משתתף מקושר: הזנת פרטים, והכפתור יוצר משתתף, מחבר את החשבון ונרשם באותו צעד (harpatka_me_join) */
  window.HarpatkaRegister = { open: (auto, meeting) => {
    if (GL && !AS && !loggedIn()) {
      if (hasSess()) { sessionReady().then((ok) => { if (ok) openReg(auto, meeting); else { try { sessionStorage.setItem(REG_MEET_KEY, JSON.stringify(meeting && meeting.id ? meeting : null)); } catch (e) {} loginPopup('reg'); } }); return; }   // יש חיבור שמור: קודם מחכים לשחזור שלו
      try { sessionStorage.setItem(REG_MEET_KEY, JSON.stringify(meeting && meeting.id ? meeting : null)); } catch (e) {} loginPopup('reg'); return;   // אורח: קודם כניסה עם גוגל (חזר ב-9.11.26). דפדפן של אפליקציה (INAPP) ותקלה בכניסה (regFallback) נופלים לטופס הרגיל
    }
    openReg(auto, meeting);
  } };   // לשימוש עמודים אחרים
  { const q0 = new URLSearchParams(location.search);   // הגעה דרך /me: דף הבית נטען והאזור האישי עולה עליו (לא מחובר: כניסה עם גוגל ואז הפופאפ). הפרמטרים יורדים מהכתובת, כדי שרענון לא יפתח אותו שוב
    if (q0.has('me')) { const m0 = q0.get('m'); q0.delete('me'); q0.delete('m'); try { history.replaceState(null, '', location.pathname + (q0.toString() ? '?' + q0 : '') + location.hash); } catch (e) {} setTimeout(() => { try { openMeArea(m0 ? '?m=' + encodeURIComponent(m0) : ''); } catch (e) {} }, 500); } }
  { const q1 = new URLSearchParams(location.search);   // הגעה דרך /register/: דף הבית נטען והפופאפ נפתח עליו. הפרמטר register יורד מהכתובת (שאר הפרמטרים, למשל s=p, נשארים), כדי שהכתובת לא תכלול register ורענון לא יפתח אותו שוב
    if (q1.has('register')) { q1.delete('register'); try { history.replaceState(null, '', location.pathname + (q1.toString() ? '?' + q1 : '') + location.hash); } catch (e) {} setTimeout(() => window.HarpatkaRegister.open(true), 500); } }
  document.querySelectorAll('[data-contact]').forEach(el => {
    if (el.dataset.mode !== 'wa') el.setAttribute('href', '#');
    el.addEventListener('click', (e) => { if (el.dataset.mode === 'wa') return; e.preventDefault(); window.HarpatkaRegister.open(false, el.__meeting); });   // מצב וואטסאפ (אין מה להירשם אליו): הכפתור הוא קישור רגיל לקבוצה
    if (el.getAttribute('role') === 'button') el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.HarpatkaRegister.open(false, el.__meeting); } });   // אלמנט שאינו קישור (למשל הבאנר העליון) נגיש גם במקלדת
  });

  /* ===== המפגש שנבחר להרשמה (ברירת מחדל: הקרוב) ומחיר בכפתור התשלום לפי מדרגות המחיר (harpatka_price_tiers; בלי מדרגות: 100 ₪ ב-3 הימים האחרונים, אחרת 80 ₪) ===== */
  const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const dayN = (s) => { const [y, mm, d] = s.split('-').map(Number); return Date.UTC(y, mm - 1, d) / 864e5; };
  const todayIL = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
  /* ברירת המחדל מהקוד רק אם היא עוד לא עברה (ורק עד שהמפגש האמיתי מבסיס הנתונים נטען); בלי מפגש עתידי הפופאפ לא משויך לשום מפגש */
  let selMeeting = null, nearest = (CONFIG.meetingFallback || { date: '2026-10-25', time: '20:00' }).date >= todayIL ? (CONFIG.meetingFallback || { date: '2026-10-25', time: '20:00' }) : null;
  /* מחיר לפי מדרגות המחיר של המפגש עצמו (T = { base, steps: [{ days, price }] }): המדרגה שמתחילה הכי קרוב למפגש מבין אלה שכבר התחילו, אחרת המחיר הרגיל. בלי מדרגות: 100 ₪ ב-3 הימים האחרונים, אחרת 80 ₪ */
  const normT = (t) => (t && !Array.isArray(t) && Number.isFinite(Number(t.base))) ? { base: Number(t.base), steps: (Array.isArray(t.steps) ? t.steps : []).map((x) => ({ days: Number(x.days), price: Number(x.price) })).filter((x) => x.days >= 1 && Number.isFinite(x.price)) } : null;
  const priceFor = (left, T) => {
    if (T) {
      const s = T.steps.filter((x) => left <= x.days).sort((a, b) => a.days - b.days)[0];
      return String(s ? s.price : T.base);
    }
    return left <= 3 ? '100' : '80';
  };
  /* טקסט כפתור השליחה: "הרשמה" כשיש מפגש להירשם אליו, "השארת פרטים" כשאין (כמו הכפתור הראשי בעמוד) */
  let submitLabel = 'שמירת מקום';
  const curLabel = () => updFlow ? 'בקשה לקבלת עדכונים' : areaFlow ?'כניסה לאזור האישי' : submitLabel;   // נפתח מהאזור האישי: הכפתור "כניסה לאזור האישי", בכחול (html.reg-area)
  const refreshLabel = () => { document.documentElement.classList.toggle('reg-area', !!areaFlow); document.querySelectorAll('[data-su="btn"]:not(.saved):not(:disabled)').forEach((b) => { b.textContent = curLabel(); }); };
  const setSubmitLabel = (m) => { submitLabel = m ? 'שמירת מקום' : 'השארת פרטים'; refreshLabel(); };
  let defMeetingName = '';   // שם ברירת המחדל למפגש (harpatka_public_settings)
  const showMeeting = (m) => {
    setSubmitLabel(m);
    { const nm = '', box = m && m.date ? CONFIG.meetingBox(Object.assign({}, m, { name: '' }))   /* בפופאפ בלי שם המפגש: רק מועד, מקום וכמות */ : ''; document.querySelectorAll('[data-meeting-name]').forEach((e) => { e.textContent = nm; e.hidden = !nm; }); document.querySelectorAll('[data-meeting-box]').forEach((e) => { if (e.__box !== box) { e.__box = box; e.innerHTML = box; } }); }   // פרטי המפגש במסגרת; אין מפגש: בלי כותרת
    if (!m) { document.querySelectorAll('[data-price]').forEach((e) => { e.textContent = priceFor(999, null) + ' ₪'; }); return; }
    document.querySelectorAll('[data-meeting-place]').forEach((e) => { e.textContent = CONFIG.meetingPlace || ''; });
    const left = dayN(m.date) - dayN(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date()));
    const price = priceFor(left, m.tiers);
    document.querySelectorAll('[data-price]').forEach((e) => { e.textContent = price + ' ₪'; });
  };
  showMeeting(nearest);   // מיד, בלי להמתין לרשת
  let nearestOk = false;   // הטעינה מבסיס הנתונים הצליחה (גם כשאין מפגש עתידי). אם נכשלה (רשת, בקשה שבוטלה) מנסים שוב, ולא נשארים בלי מפגש: אחרת הפופאפ כותב "השארת פרטים" והשרת עדיין רושם לקרוב (31.10.26)
  const loadNearestOnce = async () => {
    const H = { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + CONFIG.supabaseKey };
    try {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
      const r = await fetch(CONFIG.supabaseUrl + '/rest/v1/harpatka_meetings?select=id,meeting_date,meeting_time,price_tiers,name,city,place,type_id,max_participants&meeting_date=gte.' + today + '&order=meeting_date.asc,meeting_time.asc&limit=1', { headers: H });
      const rows = r.ok ? await r.json() : [];
      if (r.ok) nearestOk = true;
      if (r.ok && !(rows && rows[0])) nearest = null;   // אין מפגש עתידי
      /* שדה ריק במפגש: הערך של סוג המפגש שלו (31.10.26); מפגש בלי סוג: שם ברירת המחדל הגלובלי, כמו קודם */
      let ty = null;
      if (rows && rows[0] && rows[0].type_id) { try { const tr = await fetch(CONFIG.supabaseUrl + '/rest/v1/harpatka_meeting_types?select=name,city,place,price_tiers,max_participants&id=eq.' + rows[0].type_id, { headers: H }); ty = tr.ok ? ((await tr.json())[0] || null) : null; } catch (e) {} }
      if (ty) defMeetingName = String(ty.name || '').trim();
      else try { const sr = await fetch(CONFIG.supabaseUrl + '/rest/v1/harpatka_public_settings?select=key,value&key=eq.default_meeting_name', { headers: H }); const sv = sr.ok ? await sr.json() : []; defMeetingName = String(((sv[0] || {}).value) || '').trim(); } catch (e) {}
      const tx = (v) => String(v == null ? '' : v).trim();
      if (rows && rows[0]) nearest = { id: rows[0].id, date: rows[0].meeting_date, time: String(rows[0].meeting_time).slice(0, 5), tiers: normT(rows[0].price_tiers) || (ty && normT(ty.price_tiers)), name: tx(rows[0].name) || tx(ty && ty.name), city: tx(rows[0].city) || tx(ty && ty.city), place: tx(rows[0].place) || tx(ty && ty.place), max: Number(rows[0].max_participants) || Number(ty && ty.max_participants) || 0 };
      showMeeting(selMeeting || nearest);
    } catch (e) {}
  };
  const ensureNearest = async () => { if (!nearestOk) await loadNearestOnce(); };
  (async () => { for (let i = 0; i < 5 && !nearestOk; i++) { if (i) await new Promise((rs) => setTimeout(rs, [0, 1500, 3500, 7000, 12000][i])); await loadNearestOnce(); } })();
})();
