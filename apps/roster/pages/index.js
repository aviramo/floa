/* Roster ships a hand-built app from public/. Only its front page enters the
   sitemap; /admin, /connect and /me stay noindex. */
export const pages = [];
export const siteMap = [
  { loc: "https://roster.floa.co.il/", title: "ניהול משתתפים", description: "ניהול העסקים והחשבונות שמנהלים אותם" },
];

/* No form, no leads: an empty list matches nothing in the Worker. */
export const leadPages = [];
