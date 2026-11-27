/* סליידר עדויות (5.11.26): גלילה אופקית עם הצמדה (אפשר להחליק ימינה ושמאלה), מתנגן אוטומטית **בלופ אינסופי** (אחרי האחרונה בא הראשונה ברצף, ולהפך; שתי עדויות משוכפלות בכל קצה והקפיצה למקום האמיתי נעשית בשקט אחרי שהתנועה נגמרה). **נעצר בלחיצה** (על הסליידר, על חץ או על כפתור העצירה), במקש חץ או בגלילה אופקית (החלקה ימינה או שמאלה) ונשאר עצור עד לחיצה על כפתור ההפעלה; גלילה אנכית של הדף לא עוצרת אותו.
   גלילה אנכית של הדף (גם כשהאצבע או העכבר על הסליידר) לא משפיעה על הנגן ועל התזמון. רק כשהסליידר או הדף לא בתצוגה (או בפוקוס מקלדת) הספירה מושהית, ו**ממשיכה בדיוק מאותה נקודה** כשחוזרים; ספירה חדשה מתחילה רק במעבר לעדות אחרת. אחרי החלקה של המשתתף אין אפקט כניסה חוזר לשקופית (class swiped), ואחרי קפיצת הלופ גם לא (class settled). מכבד prefers-reduced-motion (בלי ניגון אוטומטי).
   סדר השקופיות אקראי בכל טעינה כשיש data-shuffle. שימוש: <div class="vc-car" data-carousel data-interval="6500" data-shuffle> עם .vc-track (השקופיות), .vc-prev, .vc-next, .vc-toggle, .vc-cnt ו-.vc-fill */
(function () {
  function init(root) {
    var track = root.querySelector('.vc-track');
    if (!track || !track.children.length) return;
    if (root.hasAttribute('data-shuffle')) {   // סדר אקראי בכל טעינה (Fisher-Yates)
      var arr = [].slice.call(track.children);
      for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      arr.forEach(function (el) { track.appendChild(el); });
    }
    var slides = [].slice.call(track.children), n = slides.length;
    var prev = root.querySelector('.vc-prev'), next = root.querySelector('.vc-next'), toggle = root.querySelector('.vc-toggle'), cnt = root.querySelector('.vc-cnt'), fill = root.querySelector('.vc-fill');
    var iv = Number(root.getAttribute('data-interval')) || 6500, mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var idx = 0, timer = 0, stopped = mq.matches, hold = false, vis = false, moving = 0, syncT = 0, jumpT = 0, touching = false;
    var remain = iv, startedAt = 0, armed = false;   // כמה זמן נשאר עד ההחלפה הבאה (נשמר בהשהיות)
    var rtl = getComputedStyle(root).direction === 'rtl';
    root.style.setProperty('--vc-iv', iv + 'ms');
    slides.forEach(function (s, k) { s.setAttribute('aria-label', (k + 1) + ' מתוך ' + n); s._real = k; });

    /* לופ: שני שכפולים בכל קצה (אחרי האחרונה: הראשונות; לפני הראשונה: האחרונות) */
    var CL = 2, heads = [], tails = [];
    function clone(real) { var c = slides[real].cloneNode(true); c.setAttribute('aria-hidden', 'true'); c.removeAttribute('aria-label'); c.classList.remove('on'); c.classList.add('vc-clone'); c._real = real; c._clone = true; return c; }
    if (n > 1) {
      for (var a = 0; a < CL; a++) { var tc = clone(a % n); tails.push(tc); track.appendChild(tc); }
      for (var b = 0; b < CL; b++) { var hc = clone(((n - 1 - b) % n + n) % n); heads.unshift(hc); track.insertBefore(hc, track.firstChild); }
    }
    function elAt(k) {   // k בין -CL ל-(n+CL-1): שקופית אמיתית או שכפול
      if (k < 0) return heads[CL + k] || slides[((k % n) + n) % n];
      if (k >= n) return tails[k - n] || slides[k % n];
      return slides[k];
    }
    function allKids() { return [].slice.call(track.children); }

    function scrollFor(el) {   // היעד לגלילה כדי שהשקופית תהיה במרכז (לא תלוי בכיוון RTL או LTR)
      var er = el.getBoundingClientRect(), tr = track.getBoundingClientRect();
      return track.scrollLeft + ((er.left + er.width / 2) - (tr.left + track.clientWidth / 2));
    }
    function active() { return !stopped && !hold && vis && !document.hidden; }
    function arm() {   // ממשיכים את הספירה ממה שנשאר
      clearTimeout(timer); startedAt = Date.now(); armed = true;
      timer = setTimeout(function () { armed = false; go(idx + 1, true); }, remain);
    }
    function disarm() {   // השהיה: שומרים כמה זמן נשאר, ולא מאפסים
      if (armed) { remain = Math.max(250, remain - (Date.now() - startedAt)); armed = false; }
      clearTimeout(timer);
    }
    function sync() {   // מצב הניגון לפי התנאים: ממשיך או משהה, בלי איפוס
      var on = active();
      root.classList.toggle('wait', !on && !stopped);   // הפס מוקפא במקומו
      if (on) { if (!armed) arm(); } else disarm();
    }
    function restart() {   // עדות חדשה: ספירה חדשה מההתחלה
      clearTimeout(timer); armed = false; remain = iv;
      if (fill) { fill.classList.remove('run'); void fill.offsetWidth; if (!stopped) fill.classList.add('run'); }
      sync();
    }
    function setStopped(v) {
      stopped = v; root.classList.toggle('stopped', v);
      if (toggle) { toggle.setAttribute('aria-pressed', v ? 'true' : 'false'); toggle.setAttribute('aria-label', v ? 'הפעלת ההחלפה האוטומטית' : 'עצירת ההחלפה האוטומטית'); }
      track.setAttribute('aria-live', v ? 'polite' : 'off');
      if (v) { disarm(); if (fill) fill.classList.remove('run'); root.classList.remove('wait'); } else restart();   // הפעלה אחרי עצירה: ספירה חדשה
    }
    function mark(k, el) {   // el: השקופית שבפועל מוצגת (אמיתית או שכפול בזמן מעבר הלופ); היא מקבלת on
      idx = k;
      var tgt = el || slides[k];
      allKids().forEach(function (s) { s.classList.toggle('on', s === tgt); });
      if (cnt) cnt.innerHTML = '<bdi>' + (k + 1) + ' / ' + n + '</bdi>';
    }
    function jumpTo(real) {   // קפיצה שקטה למקום האמיתי (מיקום זהה לשכפול), בלי אנימציה ובלי הצמדה זמנית
      var snap = track.style.scrollSnapType;
      moving = Date.now() + 250;
      track.style.scrollSnapType = 'none';
      track.scrollTo({ left: scrollFor(slides[real]), behavior: 'instant' });
      void track.offsetWidth;
      track.style.scrollSnapType = snap;
    }
    function nearest() {
      var tr = track.getBoundingClientRect(), best = null, bd = Infinity;
      allKids().forEach(function (s) { var r = s.getBoundingClientRect(), d = Math.abs((r.left + r.width / 2) - (tr.left + track.clientWidth / 2)); if (d < bd) { bd = d; best = s; } });
      return best;
    }
    function settle() {   // אם עומדים על שכימול: קופצים בשקט לשקופית האמיתית (בלי אפקט כניסה חוזר)
      if (touching) return;
      var cur = nearest(); if (!cur || !cur._clone) return;
      root.classList.add('settled');
      mark(cur._real);
      jumpTo(cur._real);
    }
    function go(k, smooth) {
      var real = ((k % n) + n) % n, tgt = (k < 0 || k >= n) ? elAt(Math.max(-1, Math.min(n, k))) : slides[k];
      root.classList.remove('swiped', 'settled');   // מעבר מתוכנת (ניגון אוטומטי, חצים): אפקט הכניסה מתנגן בזמן שהשקופית נכנסת
      mark(real, tgt);
      var animate = smooth && !mq.matches;
      moving = animate ? Date.now() + 900 : Date.now() + 250;   // בזמן גלילה יזומה לא מסנכרנים את המצב מהגלילה
      track.scrollTo({ left: scrollFor(tgt), behavior: animate ? 'smooth' : 'instant' });
      clearTimeout(jumpT);
      if (tgt._clone) jumpT = setTimeout(settle, animate ? 960 : 0);   // אחרי שהתנועה נגמרה: קפיצה שקטה למקום האמיתי
      restart();
    }
    function userMoved() { if (!stopped) setStopped(true); }   // המשתתף עצר: לחיצה או גלילה אופקית
    function swiped() { root.classList.add('swiped'); }   // החלקה של המשתתף: השקופית כבר במקומה כשהיא נקבעת כפעילה, ולכן בלי אפקט כניסה חוזר (כיווץ והטקסט שיורד וחוזר)
    function syncFromScroll() {
      if (moving && Date.now() < moving) return;
      if (touching) return;
      var cur = nearest(); if (!cur) return;
      if (cur._clone) { root.classList.add('settled'); mark(cur._real); jumpTo(cur._real); restart(); return; }
      var best = cur._real;
      if (best !== idx) { mark(best); restart(); }
    }

    track.addEventListener('scroll', function () { clearTimeout(syncT); syncT = setTimeout(syncFromScroll, 110); }, { passive: true });
    track.addEventListener('click', userMoved);   // לחיצה (נגיעה קצרה) עוצרת
    var tx = 0, ty = 0;   // נגיעה: גלילה אופקית (החלקה) עוצרת; גלילה אנכית של הדף לא משפיעה בכלל על הנגן ועל התזמון
    track.addEventListener('touchstart', function (e) { touching = true; tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    track.addEventListener('touchmove', function (e) { var dx = Math.abs(e.touches[0].clientX - tx), dy = Math.abs(e.touches[0].clientY - ty); if (dx > 8 && dx > dy) { swiped(); userMoved(); } }, { passive: true });
    ['touchend', 'touchcancel'].forEach(function (ev) { track.addEventListener(ev, function () { touching = false; clearTimeout(syncT); syncT = setTimeout(syncFromScroll, 160); }, { passive: true }); });
    track.addEventListener('wheel', function (e) { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { swiped(); userMoved(); } }, { passive: true });   // גלילה אופקית בלבד
    track.addEventListener('keydown', function (e) {
      var fwd = rtl ? 'ArrowLeft' : 'ArrowRight', back = rtl ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd) { e.preventDefault(); userMoved(); go(idx + 1, true); }
      else if (e.key === back) { e.preventDefault(); userMoved(); go(idx - 1, true); }
    });
    if (next) next.addEventListener('click', function () { userMoved(); go(idx + 1, true); });
    if (prev) prev.addEventListener('click', function () { userMoved(); go(idx - 1, true); });
    if (toggle) toggle.addEventListener('click', function () { setStopped(!stopped); });
    track.addEventListener('focus', function () { try { if (track.matches(':focus-visible')) { hold = true; sync(); } } catch (e) {} });   // השהיה רק בפוקוס מקלדת על הסליידר (לא אחרי לחיצה או נגיעה, ולא על הכפתורים)
    track.addEventListener('blur', function () { hold = false; sync(); });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', function () { clearTimeout(syncT); syncT = setTimeout(function () { moving = Date.now() + 250; track.scrollTo({ left: scrollFor(slides[idx]), behavior: 'instant' }); }, 150); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; sync(); }, { threshold: 0.4 }).observe(root); else vis = true;
    mq.addEventListener && mq.addEventListener('change', function () { if (mq.matches) setStopped(true); });
    setStopped(stopped); go(0, false);
  }
  window.HarpatkaCarousel = init;
  [].forEach.call(document.querySelectorAll('[data-carousel]'), init);
})();
