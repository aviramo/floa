/* ===== קהל היעד: גיל מינימום וגיל מקסימום. המקור היחיד לטווח הגילאים בכל האתר =====
   משנים רק כאן. מה שנקרא מכאן:
   - טקסטים בדפים: כל אלמנט עם data-age מתמלא בטעינה (range = "35-55", to = "35 עד 55", en = "35 to 55", min, max)
   - פופאפ ההרשמה (shared/register.js): הצגת כפתור התשלום ומדידת ההרשמה (RegistrationValue) לפי הטווח
   - דף הניהול: טווח היעד בסטטיסטיקות וקבוצות הגיל בסינון
   - דף המודעות: טקסט החיפוש של הסרטונים
   - כלי המודעות: ads/tools/build_flyer.py וסצנות הסרטונים (motion/ad-XX) קוראים את המספרים מכאן ברינדור הבא
   אחרי שינוי: python tools/sync-age.py מעדכן גם את הטקסטים הקבועים בקוד שנקראים בלי JavaScript
   (כותרת הדף, התיאור לגוגל ולשיתוף, טקסט חלופי לתמונה), כדי שגוגל ורשתות חברתיות יראו את הטווח החדש */
var AGE_MIN = 35;
var AGE_MAX = 55;

(function () {
  var text = function (k) {
    return k === 'min' ? String(AGE_MIN) : k === 'max' ? String(AGE_MAX)
      : k === 'to' ? AGE_MIN + ' עד ' + AGE_MAX : k === 'en' ? AGE_MIN + ' to ' + AGE_MAX
      : AGE_MIN + '-' + AGE_MAX;
  };
  window.ageText = text;
  window.ageInRange = function (a) { a = Number(a); return a >= AGE_MIN && a <= AGE_MAX; };
  var fill = function () {
    document.querySelectorAll('[data-age]').forEach(function (el) { el.textContent = text(el.getAttribute('data-age')); });
  };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fill); else fill();
})();
