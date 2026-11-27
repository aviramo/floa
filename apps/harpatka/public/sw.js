/* Service Worker — יוצאים להרפתקה (v2)
 *
 * מטרה: לפתור staleness ב-GitHub Pages בלי לשנות URL ובלי query params.
 * GitHub Pages מגיש HTML עם max-age=600 ואי אפשר לשנות headers, לכן:
 *
 *  - ניווט / מסמכי HTML  → network-first: תמיד מנסים רשת קודם, כך שכל רענון
 *    מביא את הגרסה החדישה שפורסמה. cache משמש רק כ-fallback במצב אופליין.
 *  - שאר המשאבים (תמונות, פונטים) → stale-while-revalidate: מגישים מיד מה-cache
 *    ומרעננים ברקע, כך שגם קובץ שהוחלף באותו שם מתעדכן בטעינה הבאה.
 *
 * החלף את CACHE_VERSION בכל deploy משמעותי (או השאר — network-first ממילא מביא HTML טרי).
 */
const CACHE_VERSION = 'harpatka-home-2026-11-27a';
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  // אקטיבציה מיידית של SW חדש בלי להמתין לסגירת טאבים
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // מחיקת caches ישנים מגרסאות קודמות
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== RUNTIME_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // רק GET; לא נוגעים ב-POST (טופס Google Sheets) או בקשות cross-origin לא רלוונטיות
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // וידאו: הדפדפן מבקש טווחים (Range, תשובת 206) שאי אפשר לשמור ב-cache — לא מיירטים, הדפדפן מטפל לבד
  if (req.headers.has('range') || /\.(mp4|webm)$/i.test(url.pathname)) return;

  // מסמכי HTML / ניווט → network-first (תמיד הגרסה האחרונה כשיש רשת)
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  /* עמוד ads: התמונות וה-JSON משתנים באותו שם קובץ — תמיד רשת קודם, כדי שלא יוצג מצב ישן בטעינה הראשונה */
  const isAds = sameOrigin && (url.pathname.indexOf('/ads/') === 0 || url.pathname.indexOf('/shared/') === 0);   // /shared/: קוד משותף (פופאפ הרשמה), תמיד רשת קודם
  /* הסקריפטים של הדומיין בשורש (/supabase.js, /auth.js, /roster-site.js, /media.js): תמיד רשת קודם, אחרת עדכון של הספרייה מגיע רק בטעינה השנייה */
  const isRootLib = sameOrigin && /^\/(supabase|auth|roster-site|media)\.js$/.test(url.pathname);

  if (isHTML || isAds || isRootLib) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-cache' });   // מאמת מול השרת (עוקף את max-age של GitHub Pages)
        if (sameOrigin && fresh && fresh.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // משאבים אחרים מאותו origin (תמונות/אייקונים) → stale-while-revalidate
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })());
  }
  // cross-origin (Tailwind CDN, Google Fonts, Meta Pixel) — לא מיירטים, ברירת מחדל של הדפדפן
});
