/* ==========================================================================
   The site. Everything that is true on every page lives here exactly once —
   the brand, the number, the form, the footer, the closing sections.
   The browser reads the same file: build.mjs ships site.runtime to window.FLOA.
   ========================================================================== */
export const site = {
  brand: "FLOA",
  lang: "he",
  dir: "rtl",
  locale: "he_IL",
  /* the live domain (see CNAME). Every canonical, og:url, og:image and JSON-LD
     url on the site is derived from this one string. */
  origin: "https://floa.co.il",
  themeColor: "#0E8C7E",
  tagline: "פתרונות דיגיטליים שעובדים עם העסק",
  slogan: "כל העסק. מערכת אחת. כתובת אחת",
  founder: "אופיר אבירם",
  email: "ofir.aviram@gmail.com",
  copyright: "© FLOA. כל הזכויות שמורות",

  og: {
    image: "assets/og-cover.png",
    width: 1200,
    height: 630,
    alt: "FLOA. כל פתרון דיגיטלי שהעסק שלך צריך, מחובר למערכת אחת",
  },

  fonts: "https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Rubik:wght@500;600;700&display=swap",
  favicon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%230E8C7E'/%3E%3Ctext x='50' y='68' font-family='Arial' font-size='52' font-weight='700' fill='white' text-anchor='middle'%3EF%3C/text%3E%3C/svg%3E",
};

/* --- what the browser needs, straight from the same source ---------------- */
export const runtime = {
  whatsapp: {
    number: "972587078708",                                       // +972 58-707-8708
    greeting: "היי, הגעתי דרך האתר של FLOA ואשמח שתעזרו לי",
  },
  formError: "השליחה נכשלה. אפשר לנסות שוב או לכתוב לי בוואטסאפ",
  /* the captions the hero diagram cycles through, in node order */
  systemLabels: [
    "אתרים ודפי נחיתה",
    "אפליקציות ומערכות",
    "WhatsApp, לידים ומכירות",
    "תשלומים וגבייה",
    "אוטומציות, נתונים ודוחות",
  ],
};

/* --- the ask: identical on every page but for the preselected option ------- */
export const contactContent = {
  head: {
    eyebrow: "יצירת קשר",
    title: "בואו נמצא את הדבר הבא שיפשט ויצמיח את העסק",
    text: "בשיחת מיפוי ראשונית נבין מה מעכב את העסק ואיך לחבר את הכול לתהליך אחד שעובד",
  },
  fields: [
    { name: "name", label: "שם מלא", type: "text", autocomplete: "name", required: true },
    { name: "phone", label: "טלפון", type: "tel", autocomplete: "tel", inputmode: "tel", required: true },
    { name: "business", label: "שם העסק", type: "text", autocomplete: "organization", required: true },
    {
      name: "help",
      label: "במה תרצו עזרה?",
      type: "select",
      required: true,
      placeholder: "בחרו אפשרות",
      options: [
        "מערך לידים ומכירות",
        "ייעול תהליכים ואוטומציות",
        "אתר או דף נחיתה",
        "מערכת או אפליקציה",
        "שיווק וקמפיינים",
        "עדיין לא בטוח",
      ],
    },
    { name: "improve", label: "מה הבקשה שלכם?", type: "textarea", rows: 4, full: true },
  ],
  submitLabel: "בואו נדבר על העסק",
  note: "בלי התחייבות ובלי מצגת מכירה. שיחה עניינית על העסק ועל מה שאפשר לשפר",
  orLabel: "או",
  whatsapp: { label: "לכתוב לי ב־WhatsApp", sub: "תשובה מהירה" },
  success: {
    title: "תודה, הפרטים התקבלו",
    text: "אחזור אליכם בהקדם כדי להבין מה העסק צריך ואיך נכון להתקדם",
  },
};

/* --- the sections every page closes with ---------------------------------- */
export const processContent = {
  head: { eyebrow: "התהליך", title: "כך הופכים צורך עסקי לפתרון שעובד" },
  steps: [
    { title: "מיפוי", text: "מבינים איך העסק עובד היום, מה מעכב אותו ומה חשוב לשפר קודם" },
    { title: "תכנון", text: "מפשטים את התהליך ומגדירים פתרון ברור לפני שמתחילים לבנות" },
    { title: "בנייה וחיבור", text: "מקימים את האתר, המערכת, האפליקציה או האוטומציות ומחברים הכול יחד" },
    { title: "עלייה וליווי", text: "עולים לאוויר, מטמיעים בעסק ומשפרים לפי השימוש והתוצאות בפועל" },
  ],
};

export const projectsHead = {
  eyebrow: "עבודות",
  title: "לא מצגות. דברים שעובדים",
  text: "מוצרים ומערכות שנבנו מקצה לקצה, מהרעיון והמסר ועד המוצר, התשלום והמדידה",
};

export const testimonialsHead = { title: "מה אומרים לקוחות" };

/* --- the footer: one nav, resolved for whatever page renders it ------------ */
export const footerContent = (ctx) => ({
  brand: site.brand,
  sub: site.tagline,
  copyright: site.copyright,
  links: [
    !ctx.isHome && { href: ctx.home(), label: "דף הבית" },
    { href: ctx.home("#solutions"), label: "פתרונות" },
    { href: ctx.home("#projects"), label: "עבודות" },
    { href: ctx.home("#process"), label: "איך זה עובד" },
    { href: ctx.home("#about"), label: "אודות" },
    { href: ctx.url("privacy.html"), label: "מדיניות פרטיות" },
    { href: ctx.url("accessibility.html"), label: "הצהרת נגישות" },
    { href: "#", label: "WhatsApp", whatsapp: true },
  ].filter(Boolean),
});
