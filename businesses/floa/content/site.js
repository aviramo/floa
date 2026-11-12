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
    metaPixel: "1729984108015909",          // Events Manager -> Data sources -> "המרות"
    ga4: "",
  },
  themeColor: "#1B74B3",
  tagline: "ייעוץ, פיתוח וליווי לעסק",
  slogan: "ייעוץ, פיתוח וליווי: אתרים, אפליקציות ואוטומציות עם AI",
  founder: "אופיר אבירם",
  email: "info@floa.co.il",
  copyright: "© FLOA. כל הזכויות שמורות",

  /* The share card. Every page overrides `image`, `title` and `alt` with one of
     its own (see og.* in home.js and solutions.js); only the size is shared,
     because every card is generated at the OG spec size.
     Cards are built by scripts/gen_og.mjs — not by build.mjs. */
  og: {
    image: "assets/og-home-v2.jpg",
    width: 1200,
    height: 630,
    alt: "FLOA. ייעוץ, פיתוח וליווי לעסק",
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

/* the label of the hero's SECOND button: the way down to the form */
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
};

/* --- the ask --------------------------------------------------------------
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

export const testimonialsHead = { title: "מה אומרים לקוחות" };

/* --- the bar at the top of the homepage: the parts of the one page, and the one action.
   Only the homepage draws it (see pages/index.js); the labels are the footer's, so a
   part is called the same thing wherever it is named. ---------------------------- */
export const navContent = (ctx) => ({
  brand: site.brand,
  links: [
    { href: ctx.home("#solutions"), label: "מה בונים" },
    { href: ctx.home("#projects"), label: "עבודות" },
    { href: ctx.home("#process"), label: "איך עובדים" },
    { href: ctx.home("#about"), label: "אודות" },
    { href: ctx.home("#contact"), label: "יצירת קשר" },
  ],
  cta: { label: "שיחה ב־WhatsApp" },
});

/* --- the footer: one nav, resolved for whatever page renders it ------------ */
export const footerContent = (ctx) => ({
  brand: site.brand,
  sub: site.tagline,
  copyright: site.copyright,
  links: [
    !ctx.isHome && { href: ctx.home(), label: "דף הבית" },
    { href: ctx.home("#solutions"), label: "מה בונים" },
    { href: ctx.home("#projects"), label: "עבודות" },
    { href: ctx.home("#process"), label: "איך עובדים" },
    { href: ctx.home("#about"), label: "אודות" },
    /* Root-absolute, and it has to be: the CV is not one of FLOA's pages, it is
       another business of the domain (businesses/me/) sitting at /cv/. ctx.url()
       passes an absolute path through untouched, so this resolves the same from
       the homepage as from a page two folders down. Hebrew, because this
       footer is Hebrew: /cv/ is the default and carries a switch to English.
       It is the AI CV, the one a visitor to FLOA is looking for. */
    { href: "/cv/", label: "קורות חיים" },
    { href: ctx.url("privacy.html"), label: "מדיניות פרטיות" },
    { href: ctx.url("terms.html"), label: "תנאי שימוש" },
    { href: ctx.url("accessibility.html"), label: "הצהרת נגישות" },
    { href: "#", label: "WhatsApp", whatsapp: true },
  ].filter(Boolean),
});
