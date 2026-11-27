/* דף שנפתח בתוך פופאפ (iframe): החלקה למטה כשהדף בראשו (scrollTop = 0) מזיזה את כל הפופאפ יחד עם האצבע וסוגרת אותו, ו-Esc כשהפוקוס בתוך המסגרת סוגר אותו.
   הדף הראשי (shared/register.js) מקבל את ההודעות <prefix>-drag, <prefix>-drag-end ו-<prefix>-close. משותף לאזור האישי (me) ולדף הביודנסה (bio). שימוש: HarpatkaEmbedDrag('me' | 'bio') */
window.HarpatkaEmbedDrag = function (prefix) {
  var sy = 0, dy = 0, on = false;
  function top() { return (window.scrollY || document.documentElement.scrollTop || 0) <= 0; }
  function post(t, d) { try { window.parent.postMessage({ harpatka: prefix + '-' + t, dy: d }, location.origin); } catch (e) {} }
  document.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) return; sy = e.touches[0].screenY; dy = 0; on = top(); }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!on) return; var d = e.touches[0].screenY - sy;   // screenY: לא משתנה כשהפופאפ (והדף שבתוכו) זז עם האצבע, אחרת התזוזה מצטמצמת ויוצר ריצוד
    if (d > 6 && top()) { dy = d; if (e.cancelable) e.preventDefault(); post('drag', dy); } else if (d <= 0 && dy === 0) { on = false; }
  }, { passive: false });
  function end() { if (on && dy > 0) post('drag-end', dy); on = false; dy = 0; }
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') post('close', 0); });
};
