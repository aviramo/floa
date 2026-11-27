/* הגדרות משותפות לכל העמודים (עמוד הבית, v6, ביודנסה). עמוד יכול לדרוס ערך אחרי טעינת הקובץ, למשל CONFIG.whatsappMessage */
const CONFIG = {
  googleLogin: false,   // מתג: כניסה עם גוגל לציבור (אזור אישי, "נרשמתם בעבר", זיהוי משתתף מחובר). כבוי זמנית (30.10.26): ההרשמה רגילה עם הפרטים המלאים. להחזרה: true (ואז הגרסה החזרה: git tag google-login-enabled)
  googleClientId: '459432002435-349ppd8r1qqe9tkcdm2v3f6rpp48i1ni.apps.googleusercontent.com',   // מזהה ה-OAuth client של גוגל (ציבורי, אותו אחד ש-Supabase משתמש בו) לשכבת הכניסה של גוגל מעל הדף (One Tap)
  supabaseUrl: 'https://ezakarwqstnldqixgreb.supabase.co',     // Supabase הייעודי של הפרויקט (harpatka_meetings / harpatka_signup)
  supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6YWthcndxc3RubGRxaXhncmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyMTA3MzIsImV4cCI6MjEwNjc4NjczMn0.Bg0eFBC4zKjyJc5kBw3wLgSP-PkxLFVv3o7-4YUdq4c',                  // מפתח ציבורי (anon)
  whatsapp: '972552589829',                       // הוואטסאפ העסקי של יוצאים להרפתקה, מספר אחד לשני המנחים (פורמט בינ"ל, בלי +). במיילים: harpatka_wa_vars במסד
  whatsappMessage: 'היי, הגעתי אליכם דרך האתר',
  updatesGroupLink: 'https://chat.whatsapp.com/HPBClkrbondA3JlQyOvseI',            // קבוצת העדכונים עד גיל 50
  updatesGroup50PlusLink: 'https://chat.whatsapp.com/DB7zVc2NdVXEquZCC6PpUP',      // קבוצת העדכונים גיל 50 ומעלה
  payboxLink: 'https://links.payboxapp.com/zwi4JG24Y6b',
  bitLink: 'https://www.bitpay.co.il/app/share-info?i=P65Ap-1g&j=true',   // ביט: אפשרות תשלום שנייה לצד פייבוקס
  sheetsEndpoint: 'https://script.google.com/macros/s/AKfycbzTGo8SNjyF-xJsn08PXWrYt6EdkZOlmOCXeeFnlMHvg7uyMxXR6i8IoemuiBJTZE-EPQ/exec',
  pixelId: '429806621602468',
  meetingFallback: { date: '2026-10-25', time: '20:00' },   // המפגש הקרוב אם הטעינה מבסיס הנתונים נכשלת
  meetingPlace: 'הרצליה',
  /* פרטי מפגש: רכיב אחד לפופאפי ההרשמה ולאזור האישי (עיצוב: shared/meeting-box.css), באותו מבנה כמו כרטיס המפגש בדף הבית. מציג רק מה שהוזן למפגש. extra: תוכן נוסף בתוך המסגרת */
  /* צפייה כמשתתף מדף הניהול היא לקריאה בלבד: הכול מוצג כמו אצל המשתתף, ורק מה שמשנה משהו חסום. רכיב אחד לדף הבית ולאזור האישי (גם השרת מסרב, admin/view-as-readonly.sql).
     act: כפתורי הפעולה (מעומעמים, ולחיצה מציגה הודעה קצרה); fields: שדות שאי אפשר להקליד בהם */
  viewOnly: (act, fields) => {
    const st = document.createElement('style');
    st.textContent = act + '{opacity:.45!important;cursor:not-allowed!important}.vo-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;max-width:calc(100vw - 32px);padding:10px 16px;border-radius:4px;background:var(--ink,#2C231D);color:var(--paper,#FFFDF9);font-size:15px;font-weight:600;text-align:center;pointer-events:none}';
    document.head.appendChild(st);
    const off = () => document.querySelectorAll(fields).forEach((f) => { if (!f.disabled) f.disabled = true; });
    off(); new MutationObserver(off).observe(document.documentElement, { childList: true, subtree: true });
    let t = null, tm = 0;
    const block = (e) => {
      if (e.type === 'click' && !(e.target.closest && e.target.closest(act))) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (!t) { t = document.createElement('div'); t.className = 'vo-toast'; t.setAttribute('role', 'status'); t.textContent = 'צפייה כמשתתף: אי אפשר לבצע פעולות'; }
      (document.querySelector('dialog[open]') || document.body).appendChild(t); clearTimeout(tm); tm = setTimeout(() => t.remove(), 2200);
    };
    document.addEventListener('click', block, true); document.addEventListener('submit', block, true);
  },
  /* כרטיס שיחה בוואטסאפ אלינו: רכיב אחד לכל הפופאפים (עיצוב: shared/wa-card.css). הקישור נקבע במקום שמשתמש בו, כי הוא תלוי בהודעה */
  waCard: (base, id) => '<a class="wacard" id="' + id + '" target="_blank" rel="noopener"><span class="waimgs"><img src="' + base + 'images/hadar.jpg" width="52" height="52" alt=""><img src="' + base + 'images/ofir-v3.jpg" width="52" height="52" alt=""></span><span class="wat"><b>הדר ואופיר</b><small>שיחה בוואטסאפ</small></span><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.5c-1.7 0-3.4-.5-4.8-1.3l-.3-.2-3.6.9 1-3.5-.2-.4C3.2 15.6 2.7 13.8 2.7 12c0-5.1 4.2-9.3 9.3-9.3 2.5 0 4.8 1 6.6 2.7 1.8 1.8 2.7 4.1 2.7 6.6 0 5.2-4.2 9.5-9.3 9.5zM20 4C17.9 1.8 15 .7 12 .7 5.8.7.7 5.8.7 12c0 2 .5 3.9 1.5 5.6L.6 23.4l6-1.6c1.6.9 3.5 1.4 5.4 1.4 6.2 0 11.3-5.1 11.3-11.3 0-3-1.2-5.8-3.3-7.9z"/></svg></a>',
  meetingBox: (m, extra) => {
    const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const [, mo, d] = String(m.date).split('-').map(Number), wd = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][new Date(m.date + 'T12:00:00Z').getUTCDay()];
    const when = 'יום ' + wd + ' ' + d + '.' + mo + (m.time ? ' · ' + String(m.time).slice(0, 5) : ''), where = [m.city, m.place].map((x) => String(x || '').trim()).filter(Boolean).join(' · '), n = Number(m.max) || 0;
    const ppl = n ? '<span class="mbox-ppl" aria-label="' + n + ' משתתפים" title="' + n + ' משתתפים">' + (where ? '<i aria-hidden="true">·</i>' : '') + '<b aria-hidden="true">' + n + '</b><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></span>' : '';
    return '<div class="mbox"><div class="mbox-in">' + (m.name ? '<div class="mbox-name">' + esc(m.name) + '</div>' : '') + '<div class="mbox-when">' + esc(when) + '</div>' + (where || n ? '<div class="mbox-where">' + esc(where) + ppl + '</div>' : '') + (extra || '') + '</div></div>';
  },
};

/* תפריט תשלום (13.11.26): כפתור אחד "לתשלום", ובלחיצה נפתח תפריט עם שתי אפשרויות ועם הסמלים שלהן (פייבוקס וביט). רכיב אחד לפופאפ ההרשמה, לאזור האישי ולכרטיסיות.
   o = { label: טקסט הכפתור (HTML), cls: מחלקות הכפתור, wrap: מאפיינים למעטפת, items: [{ attrs: מאפייני הקישור (data-paybox וכו'), href, pay: 'paybox' | 'bit', amt: הסכום להצגה (HTML) }] } */
/* מפתחות התפריטים הפתוחים: מסך שנבנה מחדש (רענון בזמן אמת) לא סוגר תפריט שהמשתמש פתח */
CONFIG.payOpen = new Set();
CONFIG.payMenu = function (o) {
  var names = { paybox: 'פייבוקס', bit: 'ביט' };
  var chev = '<svg class="pm-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  var items = (o.items || []).map(function (it) {
    return '<a class="pm-item" ' + (it.attrs || '') + ' href="' + (it.href || '#') + '" target="_blank" rel="noopener" aria-label="' + names[it.pay] + '" title="' + names[it.pay] + '"><img src="/images/pay-' + it.pay + '-v1.png" alt="" width="32" height="32"><span class="pm-a">' + (it.amt || '') + '</span></a>';
  }).join('');
  if (o.other) items += '<button type="button" class="pm-item pm-other" ' + (o.other.attrs || '') + '>' + (o.other.label || 'דרך אחרת') + '</button>';   // אפשרות נוספת בלי סמל: תשלום בדרך אחרת (שיחת וואטסאפ)
  var key = o.key || '', on = !!(key && CONFIG.payOpen.has(key));
  return '<div class="paychoose' + (on ? ' open' : '') + '" ' + (key ? 'data-pk="' + key + '" ' : '') + (o.wrap || '') + '><button type="button" class="pc-open ' + (o.cls || '') + '" aria-expanded="' + on + '">' + o.label + chev + '</button><div class="pm-list"><div class="pm-in">' + items + '</div></div></div>';
};
function payToggle(w, on) {
  w.classList.toggle('open', on); var b = w.querySelector('.pc-open'); if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false');
  var k = w.getAttribute('data-pk'); if (k) { if (on) CONFIG.payOpen.add(k); else CONFIG.payOpen.delete(k); }
}
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('.pc-open');
  if (b) { var w = b.closest('.paychoose'); if (w) payToggle(w, !w.classList.contains('open')); return; }
  if (!e.target.isConnected) return;   // לחיצה על אלמנט שנבנה מחדש בינתיים: לא סוגרים
  document.querySelectorAll('.paychoose.open').forEach(function (w) { if (!w.contains(e.target)) payToggle(w, false); });
});

/* מעבר הדרגתי לרוסטר (17.11.26): הכניסה לרוסטר בייצור מופעלת רק בדפדפן שפתח פעם אחת harpatka.co.il/?backend=roster (נשמר ב-localStorage), ושאר המבקרים נשארים על המערכת הקיימת בלי שום שינוי.
   החזרה: ?backend=legacy מוחק את הסימון. כשיוחלט על מעבר מלא, מוסיפים את rosterApi ישירות לאובייקט למעלה ומוחקים את הבלוק הזה. בסביבת הבדיקות rosterApi כבר מוזרק, ולכן הבלוק לא עושה שם כלום. */
(function () {
  try {
    var K = 'harpatka_backend', b = new URLSearchParams(location.search).get('backend');
    localStorage.removeItem(K);   // המערכת הישנה (Supabase של הרפתקה) נמחקה ב-17.11.26: אין יותר חזרה ל-?backend=legacy, וסימון ישן נמחק
    if (!CONFIG.rosterApi) {   // החלפה מלאה: ברירת המחדל היא רוסטר, ו-?backend=legacy מחזיר למערכת הישנה בדפדפן הזה
      CONFIG.rosterApi = { url: 'https://api.floa.co.il/roster/v1', key: 'rk_pub_IXQvipmkAZevJPbdQanj6KW9M9hrQTBf', slug: 'harpatka', profile: 'roster', googleButton: false,
        googleAuth: 'https://api.floa.co.il/roster-auth/google', authUrl: 'https://aexmnaxvahblveejsbup.supabase.co',
        authKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleG1uYXh2YWhibHZlZWpzYnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzE5MjMsImV4cCI6MjEwMTU0NzkyM30.oXPojzklAqOl9pvH5R_GNGTda6OvYruDQjMLprcBA0Y' };
    }
  } catch (e) {}
})();
