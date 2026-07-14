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
  /* the live domain (see domain/CNAME). Every canonical, og:url, og:image and
     JSON-LD url on the site is derived from this one string. */
  origin: "https://floa.co.il",

  /* Where FLOA's own files sit on that domain. Every business gets a folder of
     its own, and FLOA is not exempt: its pages, stylesheet, script and images
     are all under /floa/, exactly like a client's under /dana/. The root belongs
     to the DOMAIN, not to any one business.

     The single exception is the homepage, which is the domain root — a visitor
     typing floa.co.il expects FLOA, not a folder listing. So it is emitted at /
     while its files still come from /floa/, and its `path` is "" while every
     other page's starts with this. */
  folder: "floa/",

  /* The service worker, root-absolute because a service worker only controls
     pages at or below its own path — one under /floa/ could never control the
     homepage. It is a file of the domain (domain/sw.js), not of the business. */
  sw: "/sw.js",

  /* Measurement. Empty means nothing loads: no pixel, no third-party script, no
     cookie. It is per BUSINESS, so a client's pixel is the client's, and it is
     on every page of that business rather than on a campaign page alone.

     Filling metaPixel in also changes what the privacy policy says — the policy
     reads this (see content/legal.js), because a page that promises "no
     third-party analytics" while running a pixel is not a mistake, it is a lie.

     The events that actually matter are fired on the click and on the sent form,
     not deduced from a URL. See the note in src/lib/core.client.js. */
  analytics: {
    metaPixel: "",                          // Events Manager -> Data sources -> the pixel's id
    ga4: "",
  },
  themeColor: "#0E8C7E",
  tagline: "פתרונות דיגיטליים שעובדים עם העסק",
  slogan: "כל העסק. מערכת אחת. כתובת אחת",
  founder: "אופיר אבירם",
  email: "info@floa.co.il",
  copyright: "© FLOA. כל הזכויות שמורות",

  /* The share card. Every page overrides `image`, `title` and `alt` with one of
     its own (see og.* in home.js and solutions.js); only the size is shared,
     because every card is generated at the OG spec size.
     Cards are built by scripts/gen_og.mjs — not by build.mjs. */
  og: {
    image: "assets/og-home.png",
    width: 1200,
    height: 630,
    alt: "FLOA. אתרים, אפליקציות ואוטומציות לעסק",
  },

  fonts: "https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=JetBrains+Mono:wght@400;500&family=Rubik:wght@500;600;700&display=swap",

  /* Real files at the site root, not a data: URI. Browsers take a data: URI
     happily; crawlers do not — Google's search-result favicon and WhatsApp's
     preview both fetch a FILE, so the old inline icon meant the site had no icon
     in either of the two places anyone would ever see one.
     Built by scripts/gen_favicon.py. */
  icons: {
    ico: "/favicon.ico",                    // 16+32+48; the one Google fetches
    svg: "/favicon.svg",                    // crisp at any size
    apple: "/apple-touch-icon.png",         // 180x180, iOS home screen
  },
};

/* the reassurance under every hero's buttons */
export const heroNote = "שיחת מיפוי ראשונית, בלי התחייבות ובלי מצגת מכירה";

/* the label of the hero's SECOND button — the way down to the form. The same on
   every page, because it is the same promise on every one. */
export const formCta = "השארת פרטים";

/* --- what the browser needs, straight from the same source ---------------- */
export const runtime = {
  /* Who this page belongs to. It rides along with every lead, because one
     endpoint serves every business and, while they are all served from
     floa.co.il, the origin cannot tell them apart. The Worker keeps the
     recipient — a business's leads reach the business, never us. It must match
     a key in BUSINESSES in worker/src/index.js, and the build checks that it
     does. */
  business: "floa",

  whatsapp: {
    number: "972587078708",                                       // +972 58-707-8708
    /* the fallback opening line. Each page overrides it with one of its own via
       <body data-wa-text> (see whatsapp-button.client.js), so the conversation
       starts on the subject the visitor was actually reading. */
    greeting: "היי, הגעתי דרך אתר FLOA ואשמח לשיחה קצרה",
  },

  /* The form posts here and nowhere else. A static site has no server of its
     own, so the send lives in a Cloudflare Worker (see worker/) that validates
     the lead and hands it to Resend — the API key never reaches the browser.

     workers.dev, not api.floa.co.il: floa.co.il's DNS is not on Cloudflare (its
     nameservers are sitesdepot's), so a Cloudflare route could never bind to it,
     and the old api.floa.co.il host never resolved at all — every lead died in
     the browser. The address is never seen by a visitor; the Worker refuses any
     origin that is not floa.co.il. It must match the `name` and workers.dev
     subdomain in worker/wrangler.toml. */
  leadEndpoint: "https://floa-lead.floa-il.workers.dev/lead",

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
    text: "אחזור אליכם בהקדם כדי להבין מה העסק צריך ואיך נכון להתקדם",
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
    {
      title: "מיפוי",
      text: "מבינים איך העסק עובד היום, מה מעכב אותו ומה חשוב לשפר קודם",
      note: "הניסיון שלי כמגשר בין צוותים עסקיים לטכנולוגיים מאפשר לזהות את הצורך האמיתי לפני שבוחרים כלי או מתחילים לפתח",
    },
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
