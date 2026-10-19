/* ==========================================================================
   AUM, דף הניהול: מקבל התראות דחיפה (Web Push).

   ה-Worker דוחף בלי תוכן: כל מה שהוא אומר הוא "קרה משהו". כאן מחליטים מה
   מציגים, ולחיצה על ההתראה פותחת את דף הניהול. ה-scope הוא /aum/admin/ בלבד.
   ========================================================================== */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil(
    self.registration.showNotification("הרשמה חדשה ל-AUM", {
      body: "מישהו.י נרשם.ה עכשיו. הפרטים בדף הניהול",
      icon: "../assets/img/icon-192.png",
      badge: "../assets/img/icon-192.png",
      tag: "aum-signup",
      renotify: true,
      dir: "rtl",
      lang: "he",
      data: { url: self.registration.scope },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    }),
  );
});
