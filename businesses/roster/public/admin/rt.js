/* אפקט המתנה על האובייקט שהמשתמש לחץ עליו, עד שהכתיבה לשרת חוזרת: window.HRT.busy(אלמנט) מחזיר פונקציה שמסירה אותו.
   כמה כתיבות יכולות להמתין על אותו אלמנט, וההמתנה מוסרת רק כשהאחרונה חוזרת. הדף קורא לזה מתוך api() בכל כתיבה.
   (הזמן אמת של הדף הוא חיבור נפרד, בתוך הדף עצמו: הוא מקבל את הטוקן מההתחברות המשותפת של הדומיין.) */
(function () {
  if (window.HRT) return;
  try {
    const st = document.createElement('style');
    st.textContent = '.rt-wait{pointer-events:none!important;animation:rtPulse 1s ease-in-out infinite}@keyframes rtPulse{0%,100%{opacity:.62}50%{opacity:.34}}@media (prefers-reduced-motion:reduce){.rt-wait{animation:none;opacity:.5}}';
    document.head.appendChild(st);
  } catch (e) {}
  function busy(el) {
    if (!el || !el.classList) return function () {};
    const n = (Number(el.__rtn) || 0) + 1; el.__rtn = n; el.classList.add('rt-wait'); el.setAttribute('aria-busy', 'true');
    let rel = false;
    return function () {
      if (rel) return; rel = true;
      el.__rtn = Math.max(0, (Number(el.__rtn) || 1) - 1);
      if (!el.__rtn) { el.classList.remove('rt-wait'); el.removeAttribute('aria-busy'); }
    };
  }
  window.HRT = { busy: busy };
})();
