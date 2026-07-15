/* ==========================================================================
   ProLink — the identity that is true on every page: the brand, the domain it
   lives on, the form, the footer. The engine reads `site` and `runtime`; the
   browser gets `runtime` on window.FLOA. Everything below `runtime` is copy.
   ========================================================================== */
export const site = {
  brand: "ProLink",
  lang: "he",
  dir: "rtl",
  locale: "he_IL",

  /* Served today from a folder of floa.co.il, exactly like any other business.
     The day ProLink moves to its own domain, this one string changes and the
     whole site follows. */
  origin: "https://floa.co.il",
  folder: "prolink/",

  /* No service worker of its own: the one at the domain root belongs to the
     domain, and a worker under /prolink/ could not control anything above it. */
  sw: "",

  /* Nothing loads. No pixel, no third-party script, no cookie. */
  analytics: { metaPixel: "", ga4: "" },

  themeColor: "#06858a",
  tagline: "המומחים לניהול זהויות ובקרת הרשאות",
  slogan: "מיקוד יחיד בניהול זהויות ובקרת הרשאות, מאז 1996",
  founder: "עופר גיגי",
  email: "info@prolink.co.il",
  copyright: "© ProLink Identity Management Architects. כל הזכויות שמורות",

  og: {
    image: "assets/og.png",
    width: 1200,
    height: 630,
    alt: "ProLink, המומחים לניהול זהויות ובקרת הרשאות",
  },

  /* Rubik (display) + Assistant (body), the same families the design system
     names in its tokens. */
  fonts: "https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Rubik:wght@500;600;700&display=swap",

  /* The domain's own favicons, root-absolute: ProLink shares floa.co.il. */
  icons: {
    ico: "/favicon.ico",
    svg: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

/* the reassurance under the hero's buttons */
export const heroNote = "שיחת חשיבה ראשונית על ניהול הזהויות בארגון, בלי התחייבות ובלי עלות";

/* --- what the browser needs, from the same source ------------------------- */
export const runtime = {
  /* Which business a lead belongs to. Rides along with every submission; the
     Worker keeps the recipient, so a ProLink lead reaches ProLink and no one
     else. Must match a key in the Worker's BUSINESSES table (generated). */
  business: "prolink",

  /* ProLink's channel is the phone and the form, not WhatsApp. The number is
     here only because the runtime shape carries it; no WhatsApp button is
     rendered anywhere on the site. */
  whatsapp: { number: "", greeting: "" },

  /* One endpoint serves every business on the domain; the business key above is
     what tells them apart. Same Worker as the rest of floa.co.il. */
  leadEndpoint: "https://floa-lead.floa-il.workers.dev/lead",

  formError: "לא הצלחנו לשלוח את הפרטים. אפשר לנסות שוב או להתקשר: 03-6773370",
};

/* --- the ask: a name and a phone, nothing more ---------------------------- */
export const contactContent = {
  head: {
    eyebrow: "צרו קשר",
    title: "נשמח לעמוד לרשותכם בכל שאלה",
    text: "השאירו שם וטלפון ונחזור אליכם, או התקשרו: 03-6773370",
  },
  fields: [
    { name: "name", label: "שם מלא", type: "text", autocomplete: "name" },
    { name: "phone", label: "טלפון", type: "tel", autocomplete: "tel", inputmode: "tel" },
  ],
  submitLabel: "חזרו אליי",
  note: "ללא התחייבות",
  or: "או",
  success: {
    title: "תודה, הפרטים התקבלו",
    text: "נחזור אליכם בהקדם לשיחת חשיבה קצרה על ניהול הזהויות בארגון",
  },
};

/* --- the footer: one nav, resolved for the page that renders it ----------- */
export const footerContent = (ctx) => ({
  brand: site.brand,
  sub: site.tagline + ". מוסמכת ISO/IEC 27001.",
  copyright: site.copyright,
  links: [
    { href: ctx.home("#expertise"), label: "התמחויות" },
    { href: ctx.home("#about"), label: "אודות" },
    { href: ctx.home("#testimonials"), label: "חוות דעת" },
    { href: ctx.home("#tech"), label: "טכנולוגיות" },
    { href: ctx.home("#contact"), label: "צרו קשר" },
    { href: "tel:036773370", label: "03-6773370" },
  ],
});
