/* ==========================================================================
   The CV, twice: once in English, once in Hebrew.

   Two documents, one structure. Everything below is copy and data — the way it
   is DRAWN lives in src/components/resume/, so the two versions can never drift
   apart in anything but language. Change the layout once and both change.

   Both texts are Ofir's, verbatim. Nothing here is rewritten, shortened,
   expanded, translated or invented, and every company and technology keeps its
   exact spelling. The one liberty is punctuation the repo does not allow on a
   page: an en dash is written as a plain hyphen in a date range, and as a colon
   where it separated a language from its level.

   Every date range is rendered inside <bdi dir="ltr">, so "2014 - 2017" reads
   the same way on the RTL page as on the LTR one.

   WHERE THEY LAND
     dist/me/cv/architect/index.html      ->  floa.co.il/me/cv/architect/
     dist/me/cv/architect/he/index.html   ->  floa.co.il/me/cv/architect/he/

   Nothing is written for /me/ or /me/cv/, so both 404: the document has one
   address and a shortened guess at it leads nowhere.

   `base` is how each page reaches this business's stylesheet; every href in
   this file is written relative to the business folder and ctx.url() rewrites
   it for the page being rendered (see src/lib/context.js).
   ========================================================================== */

const CONTACT = {
  phoneHref: "tel:+972587078708",
  mailHref: "mailto:ofir.aviram@gmail.com",
  linkedinHref: "https://www.linkedin.com/in/aviramo",
  mail: "ofir.aviram@gmail.com",
  linkedin: "linkedin.com/in/aviramo",
};

const DEMO = "https://once-lake.vercel.app/";

/* The name a link to this document shows in a message or a feed. Both scripts,
   because the same link is shared into Hebrew threads and English ones and a
   card that guesses wrong is a card nobody recognises. */
const SHARE_TITLE = "אופיר אבירם | Ofir Aviram";

/* The photograph, square because it is a portrait, and JPEG because a social
   crawler is not a browser: several of them still do not decode the WebP the
   site itself serves. Built by scripts/gen_cv_share.mjs from the same source
   image FLOA uses, so there is one photograph and not two. */
const SHARE_IMAGE = {
  src: "assets/ofir-aviram.jpg",
  width: 1200,
  height: 1200,
  alt: "Ofir Aviram",
};

/* The professional summary, held here rather than inline in the section below,
   because the share card's description IS its first paragraph. Written twice it
   would be written differently within a month. */
const SUMMARY_EN = [
  "Solution Architect and Senior Systems Analyst with 15+ years of experience designing enterprise applications, system integrations, IAM and IDM solutions and business-process automation.",
  "Strong in requirements analysis, functional and technical specifications, business logic, data flows, SQL, ETL, APIs and end-to-end production delivery.",
  "Combines extensive enterprise systems experience with hands-on product development using Node.js, TypeScript, Supabase and AI-assisted development tools.",
];

const SUMMARY_HE = [
  "ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון אפליקציות ארגוניות, אינטגרציות בין מערכות, פתרונות IAM ו-IDM ואוטומציה של תהליכים עסקיים.",
  "בעל ניסיון משמעותי בניתוח דרישות, כתיבת אפיונים פונקציונליים וטכניים, תכנון לוגיקה עסקית, זרימות נתונים, SQL, ETL, ממשקי API והובלת פתרונות עד לייצור.",
  "משלב ניסיון במערכות ארגוניות עם יכולת מעשית לפתח מוצרים באמצעות Node.js, TypeScript, Supabase וכלי פיתוח מבוססי AI.",
];

/* --- English ---------------------------------------------------------------- */
export const cvEn = {
  out: "cv/architect/index.html",
  path: "me/cv/architect/",
  base: "../../",
  homeHref: "../../",
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Solution Architect and Senior Systems Analyst",
    description: "CV of Ofir Aviram. Solution Architect and Senior Systems Analyst with 15+ years designing enterprise applications, system integrations, IAM and IDM solutions and business-process automation.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: { href: "cv/architect/ofir-aviram-cv.pdf", name: "Ofir Aviram - CV.pdf", label: "Download PDF" },
  altLang: { href: "cv/architect/he/", label: "עברית", lang: "he" },
  alternates: [{ lang: "en", href: "cv/architect/" }, { lang: "he", href: "cv/architect/he/" }],

  name: "Ofir Aviram",
  roles: [
    "Solution Architect | Senior Systems Analyst",
    "Enterprise Applications, Integrations & AI-Assisted Product Development",
  ],
  contact: [
    { text: "Hod Hasharon, Israel" },
    { text: "+972-58-707-8708", href: CONTACT.phoneHref },
    { text: CONTACT.mail, href: CONTACT.mailHref },
    { text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    {
      type: "text",
      title: "Professional Summary",
      body: SUMMARY_EN,
    },

    {
      type: "keywords",
      title: "Core Expertise",
      groups: [
        {
          title: "Solution Design",
          terms: ["End-to-End Solution Design", "Enterprise Applications", "Integration Architecture", "Business Logic", "System Interfaces", "Data Flows"],
        },
        {
          title: "Systems Analysis",
          terms: ["Requirements Gathering", "Functional and Technical Specifications", "Business Process Modeling", "Data Modeling", "UAT"],
        },
        {
          title: "Delivery",
          terms: ["Stakeholder Management", "Cross-Functional Leadership", "Testing", "Troubleshooting", "Production Deployment", "Agile Delivery"],
        },
      ],
    },

    {
      type: "roles",
      title: "Selected Product Experience",
      jobs: [
        {
          role: "Product Owner & AI-Powered Full-Stack Developer",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Took Once from concept to a production-ready mobile product, owning product definition, UX, architecture, development, testing and release",
            "Designed the database model, business logic, backend workflows, permissions and real-time processes",
            "Built authentication, location services, matching, real-time chat, credit mechanisms, social Circles and notifications",
            "Developed with Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and APIs",
            "Used Claude and ChatGPT for prototyping, coding, debugging, refactoring, problem-solving and test-data generation",
            "Prepared and submitted production releases for Google Play and the Apple App Store",
          ],
          link: { label: "Product demo:", href: DEMO },
        },
      ],
    },

    {
      type: "roles",
      title: "Professional Experience",
      jobs: [
        {
          role: "Senior Systems Analyst | Integration & Solution Design",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Led the analysis and delivery of enterprise processes, automations and integrations across Salesforce, Priority ERP and Workato",
            "Translated business requirements into functional and technical specifications",
            "Designed data mappings, business logic, integration flows, system interfaces and SQL and ETL processes",
            "Coordinated business stakeholders, IT teams, vendors, testing and production deployment",
          ],
        },
        {
          role: "Senior Systems Analyst | IDM Solution Design",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Designed and implemented enterprise Identity Management solutions for Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Created functional and technical specifications for identity processes, interfaces, data transformations and integrations",
            "Designed business logic, data mappings, ETL processes and system interfaces",
            "Led delivery across cybersecurity, DBA, DevOps, infrastructure, IT and business teams",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "Systems Analyst | Web Solutions & Process Automation",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the analysis and design of a web solution connecting municipal departments and automating cross-organizational workflows",
            "Modeled business processes, data structures, user journeys and UX and UI flows",
            "Designed SQL and SSIS integrations and coordinated users, development, DBA, QA and UAT",
          ],
        },
        {
          role: "Identity Management Systems Analyst & Technical Lead",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Translated business and security requirements into technical processes, business logic, interfaces and integrations",
            "Designed system workflows and data flows and guided a Java and JSP development team",
            "Coordinated development, cybersecurity, infrastructure, DBA, DevOps, testing and production delivery",
          ],
        },
        {
          role: "IDM Implementation Consultant & Solution Developer",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Independently customized and implemented the Aveksa IAM and Identity Governance platform for Harel, Migdal, Phoenix and Amdocs",
            "Owned the application-level solution design and implementation, excluding infrastructure",
            "Designed business logic, workflows, rules, approval processes, data mappings and synchronization processes",
            "Built integrations with enterprise systems, databases and directories and led testing, deployment and production support",
          ],
        },
        {
          role: "Software Developer | Enterprise Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Developed and maintained an enterprise billing platform using Microsoft SQL Server, Microsoft Access and VBA",
            "Translated business requirements into database queries, reports, automations and system enhancements",
            "Investigated production issues and worked directly with finance and operational stakeholders",
          ],
        },
      ],
    },

    {
      type: "keywords",
      title: "Technical Skills",
      groups: [
        {
          title: "Platforms and Integration",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA", "REST APIs", "ETL", "SSIS"],
        },
        {
          title: "Data and Development",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Git", "Microsoft Access", "VBA"],
        },
        {
          title: "AI and Delivery",
          terms: ["Claude", "ChatGPT", "AI-Assisted Development", "Rapid Prototyping", "Jira", "Agile", "UAT"],
        },
      ],
    },

    {
      type: "entries",
      title: "Education",
      entries: [
        {
          title: "PRODUCT MANAGEMENT PROGRAM",
          lines: ["Product Experts | 2021"],
        },
        {
          title: "B.SC. INDUSTRIAL ENGINEERING AND MANAGEMENT",
          lines: ["Information Systems Specialization", "Ben-Gurion University of the Negev | 2004 - 2008"],
        },
      ],
    },

    {
      type: "entries",
      title: "Military Service",
      entries: [
        {
          title: "COMBAT SOLDIER AND COMMANDER",
          lines: ["Combat Engineering Corps | 1999 - 2002"],
        },
      ],
    },
  ],
};

/* --- Hebrew ----------------------------------------------------------------- */
export const cvHe = {
  out: "cv/architect/he/index.html",
  path: "me/cv/architect/he/",
  base: "../../../",
  homeHref: "../../../",
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | ארכיטקט פתרונות ומנתח מערכות בכיר",
    description: "קורות החיים של אופיר אבירם. ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון אפליקציות ארגוניות, אינטגרציות, פתרונות IAM ו-IDM ואוטומציה של תהליכים עסקיים.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: { href: "cv/architect/ofir-aviram-cv-he.pdf", name: "אופיר אבירם - קורות חיים.pdf", label: "הורדת PDF" },
  altLang: { href: "cv/architect/", label: "English", lang: "en" },
  alternates: [{ lang: "en", href: "cv/architect/" }, { lang: "he", href: "cv/architect/he/" }],

  name: "אופיר אבירם",
  roles: [
    "ארכיטקט פתרונות | מנתח מערכות בכיר",
    "אפליקציות ארגוניות, אינטגרציות ופיתוח מוצר בעזרת AI",
  ],
  contact: [
    { text: "הוד השרון, ישראל" },
    { text: "058-707-8708", href: CONTACT.phoneHref },
    { text: CONTACT.mail, href: CONTACT.mailHref },
    { text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    {
      type: "text",
      title: "תקציר מקצועי",
      body: SUMMARY_HE,
    },

    {
      type: "keywords",
      title: "תחומי מומחיות",
      groups: [
        {
          title: "תכנון פתרונות",
          terms: ["תכנון פתרון מקצה לקצה", "אפליקציות ארגוניות", "ארכיטקטורת אינטגרציה", "לוגיקה עסקית", "ממשקי מערכת וזרימות נתונים"],
        },
        {
          title: "ניתוח מערכות",
          terms: ["איסוף דרישות", "אפיון פונקציונלי וטכני", "מידול תהליכים עסקיים", "מידול נתונים ובדיקות קבלה"],
        },
        {
          title: "הובלת אספקה",
          terms: ["ניהול בעלי עניין", "הובלה חוצת ארגון", "בדיקות", "פתרון תקלות", "עלייה לייצור ועבודה במתודולוגיית Agile"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון מוצר נבחר",
      jobs: [
        {
          role: "מנהל מוצר ומפתח Full-Stack מבוסס AI",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "הובלת Once מרעיון ראשוני למוצר מובייל מוכן לייצור, כולל הגדרת המוצר, חוויית המשתמש, הארכיטקטורה, הפיתוח, הבדיקות והגרסאות",
            "תכנון מודל הנתונים, הלוגיקה העסקית, תהליכי הצד השרת ומודל ההרשאות",
            "פיתוח מנגנוני הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות",
            "פיתוח באמצעות Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC Functions וממשקי API",
            "שימוש ב-Claude וב-ChatGPT לאב טיפוס, כתיבת קוד, פתרון תקלות, ריפקטורינג ויצירת נתוני בדיקה",
            "הכנה והגשה של גרסאות ייצור ל-Google Play ול-Apple App Store",
          ],
          link: { label: "הדגמת המוצר:", href: DEMO },
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מנתח מערכות בכיר | אינטגרציות ותכנון פתרונות",
          org: "קבוצת תדהר | ישראל | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "הובלת ניתוח ואספקה של תהליכים עסקיים, אוטומציות ואינטגרציות על גבי Salesforce, Priority ERP ו-Workato",
            "תרגום דרישות עסקיות לאפיונים פונקציונליים וטכניים",
            "תכנון מיפויי נתונים, לוגיקה עסקית, זרימות אינטגרציה, ממשקי מערכת ותהליכי SQL ו-ETL",
            "תיאום בין גורמים עסקיים, צוותי IT, ספקים, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות בכיר | תכנון פתרונות IDM",
          org: "בריליקס | ישראל | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "תכנון והטמעה של פתרונות ניהול זהויות עבור שירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "כתיבת אפיונים פונקציונליים וטכניים לתהליכי זהות, ממשקים, טרנספורמציות נתונים ואינטגרציות",
            "תכנון לוגיקה עסקית, מיפויי נתונים, תהליכי ETL וממשקי מערכת",
            "הובלת האספקה מול צוותי סייבר, DBA, DevOps, תשתיות, IT וגורמים עסקיים",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "מנתח מערכות | פתרונות Web ואוטומציית תהליכים",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת האפיון והתכנון של פתרון Web שחיבר בין יחידות עירוניות וביצע אוטומציה של תהליכים חוצי ארגון",
            "מידול תהליכים עסקיים, מבני נתונים, מסעות משתמשים וזרימות UX ו-UI",
            "תכנון אינטגרציות SQL ו-SSIS ותיאום בין משתמשים, פיתוח, DBA, QA ובדיקות קבלה",
          ],
        },
        {
          role: "מנתח מערכות ניהול זהויות וראש צוות טכני",
          org: "אמדוקס | ישראל",
          dates: "2017 - 2020",
          bullets: [
            "תרגום דרישות עסקיות ודרישות אבטחת מידע לתהליכים טכניים, לוגיקה עסקית, ממשקים ואינטגרציות",
            "תכנון תהליכי מערכת וזרימות נתונים והנחיית צוות פיתוח שעבד ב-Java וב-JSP",
            "תיאום בין צוותי פיתוח, סייבר, תשתיות, DBA, DevOps, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "יועץ הטמעה ומפתח פתרונות IDM",
          org: "פרולינק ניהול זהויות | ישראל",
          dates: "2014 - 2017",
          bullets: [
            "התאמה והטמעה עצמאית של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "אחריות על תכנון הפתרון והמימוש בשכבת האפליקציה, למעט תשתיות",
            "תכנון לוגיקה עסקית, תהליכי עבודה, חוקים, תהליכי אישור, מיפויי נתונים ותהליכי סנכרון",
            "בניית אינטגרציות למערכות ארגוניות, בסיסי נתונים ושירותי Directory והובלת בדיקות, הטמעה ותמיכה בייצור",
          ],
        },
        {
          role: "מפתח תוכנה | מערכות חיוב ארגוניות",
          org: "Varonis | ישראל",
          dates: "2008 - 2014",
          bullets: [
            "פיתוח ותחזוקה של מערכת חיוב ארגונית באמצעות Microsoft SQL Server, Microsoft Access ו-VBA",
            "תרגום דרישות עסקיות לשאילתות, דוחות, אוטומציות ושיפורים במערכת",
            "חקירת תקלות בייצור ועבודה ישירה מול גורמי כספים ותפעול",
          ],
        },
      ],
    },

    {
      type: "keywords",
      title: "כישורים טכניים",
      groups: [
        {
          title: "פלטפורמות ואינטגרציה",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA", "REST APIs", "ETL", "SSIS"],
        },
        {
          title: "נתונים ופיתוח",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Git", "Microsoft Access", "VBA"],
        },
        {
          title: "כלי AI ואספקה",
          terms: ["Claude", "ChatGPT", "AI-Assisted Development", "Rapid Prototyping", "Jira", "Agile", "UAT"],
        },
      ],
    },

    {
      type: "entries",
      title: "השכלה",
      entries: [
        {
          title: "תוכנית ניהול מוצר",
          lines: ["Product Experts | 2021"],
        },
        {
          title: "B.Sc. בהנדסת תעשייה וניהול",
          lines: ["התמחות במערכות מידע", "אוניברסיטת בן גוריון בנגב | 2004 - 2008"],
        },
      ],
    },

    {
      type: "lines",
      title: "שפות",
      lines: ["עברית: שפת אם", "אנגלית: רמה בינונית, קריאה וכתיבה טכנית"],
    },

    {
      type: "entries",
      title: "שירות צבאי",
      entries: [
        {
          title: "לוחם ומפקד",
          lines: ["חיל ההנדסה הקרבית | 1999 - 2002"],
        },
      ],
    },
  ],
};

export const cvPages = [cvEn, cvHe];
