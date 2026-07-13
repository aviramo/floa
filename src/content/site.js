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
  email: "info@floa.co.il",
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

/* the reassurance under every hero's buttons */
export const heroNote = "שיחת מיפוי ראשונית, בלי התחייבות ובלי מצגת מכירה";

/* the label of the hero's SECOND button — the way down to the form. The same on
   every page, because it is the same promise on every one. */
export const formCta = "השארת פרטים";

/* --- what the browser needs, straight from the same source ---------------- */
export const runtime = {
  whatsapp: {
    number: "972587078708",                                       // +972 58-707-8708
    /* the fallback opening line. Each page overrides it with one of its own via
       <body data-wa-text> (see whatsapp-button.client.js), so the conversation
       starts on the subject the visitor was actually reading. */
    greeting: "היי, הגעתי דרך אתר FLOA ואשמח לשיחת מיפוי קצרה",
  },

  /* The form posts here and nowhere else. A static site has no server of its
     own, so the send lives in a Cloudflare Worker (see worker/) that validates
     the lead and hands it to Resend — the API key never reaches the browser. */
  leadEndpoint: "https://api.floa.co.il/lead",

  formError: "לא הצלחנו לשלוח את הפרטים. אפשר לנסות שוב או לפנות אלינו ב־WhatsApp",

  /* the captions the hero diagram cycles through, in node order */
  systemLabels: [
    "אתרים ודפי נחיתה",
    "אפליקציות ומערכות",
    "WhatsApp והתראות",
    "טפסים ותשלומים",
    "אוטומציות, נתונים ודוחות",
  ],
};

/* --- the ask: IDENTICAL on every page --------------------------------------
   The form asks for the two things a call-back actually needs and nothing else.
   Every extra field is friction. WhatsApp — the primary action everywhere else
   on the page — closes the panel underneath it, so the visitor who would rather
   not wait for a call still has the faster door open. */
export const contactContent = {
  head: {
    eyebrow: "השארת פרטים",
    title: "מעדיפים שנחזור אליכם?",
    text: "השאירו שם וטלפון ונחזור אליכם",
  },
  fields: [
    { name: "name", label: "שם", type: "text", autocomplete: "name" },
    { name: "phone", label: "טלפון", type: "tel", autocomplete: "tel", inputmode: "tel" },
  ],
  submitLabel: "חזרו אליי",
  note: "ללא התחייבות",
  or: "או פשוט כתבו לנו",
  success: {
    title: "תודה, הפרטים התקבלו",
    text: "נחזור אליך בהקדם",
  },
};

/* --- the objections, answered on every solution page just before the ask --- */
export const faqContent = {
  head: { eyebrow: "שאלות נפוצות", title: "מה שרוב העסקים שואלים לפני שמתחילים" },
  items: [
    { q: "צריך להחליף את המערכות הקיימות?", a: "לא. קודם בודקים מה אפשר להשאיר, לחבר או לשפר" },
    { q: "איך מתחילים?", a: "בשיחת מיפוי קצרה שבה מגדירים את הבעיה, היעד והשלב הבא" },
    { q: "כמה זמן זה לוקח?", a: "לאחר המיפוי מקבלים תכנית עבודה ולוחות זמנים בהתאם להיקף" },
    { q: "אפשר להתחיל מפתרון אחד?", a: "כן. מתחילים במה שהכי משפיע ומרחיבים רק כשיש צורך" },
  ],
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
