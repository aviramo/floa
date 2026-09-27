/* ==========================================================================
   The architect CV, twice: once in English, once in Hebrew.

   Two documents, one structure. Everything below is copy and data, and the way
   it is DRAWN lives in src/components/resume/, so the two versions can never
   drift apart in anything but language.

   WHAT THIS ONE LEADS WITH

   Solution design, and the product. Where cv-analyst.js opens on specifying
   systems, this one opens on designing them: the architecture of a solution,
   the integrations between enterprise systems, and a product owned from an
   idea to a release in both stores. Same career, same facts, different half in
   front.

   THE SHAPE, WHICH IS THE ANALYST DOCUMENT'S

   That file was rewritten to open every role on OWNERSHIP rather than on the
   first activity in it, to carry the complexity in the bullets under it, to
   give the recent years room and the old ones brevity, and to say each skill
   once instead of spreading it over two lists. The same pass has been applied
   here, without moving the emphasis: "Selected Product Experience" still
   stands as a section of its own, because the product IS half of what this
   document is for.

   NO NUMBER IN HERE WAS INVENTED. Not a user count, not a saving, not a
   percentage, not a system count, not a team size. Where a figure would have
   made a line land harder it is absent.

   Both texts are Ofir's. Nothing is expanded, translated or invented, and every
   company and technology keeps its exact spelling. The one liberty is
   punctuation the repo does not allow on a page: an en dash is written as a
   plain hyphen in a date range, and as a colon where it separated a language
   from its level.

   Every date range is rendered inside <bdi dir="ltr">, so "2014 - 2017" reads
   the same way on the RTL page as on the LTR one.

   WHERE THEY LAND
     dist/cv/architect/index.html      ->  floa.co.il/cv/architect/
     dist/cv/architect/he/index.html   ->  floa.co.il/cv/architect/he/

   The addresses themselves are worked out in cv-shared.js, which every CV of
   this business shares. This file is copy and nothing else.

   A NOTE ON VOICE. Nothing here is in the third person: a summary that says
   "he combines" is somebody else describing him, inside a document he sends
   himself. The summary is nominal, and so are the bullets.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

/* The summary, held here rather than inline in the section below, because the
   share card's description IS its first paragraph. Three sentences: what he is
   and for how long, what he turns a business need into, and the product that
   sits beside it. */
const SUMMARY_EN = [
  "Solution Architect and Senior Systems Analyst with 15+ years of experience designing end-to-end solutions for enterprise applications, system integrations and IAM and IDM systems.",
  "Translating a business need into a solution architecture: business logic, system interfaces, data model and data flows, and carrying it through to production.",
  "Alongside that, end-to-end ownership of a product, from an idea to a release in both app stores, with Node.js, TypeScript, Supabase and AI-assisted development tools.",
];

const SUMMARY_HE = [
  "ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון פתרונות מקצה לקצה לאפליקציות ארגוניות, אינטגרציות בין מערכות ומערכות IAM ו-IDM.",
  "התמחות בתרגום צורך עסקי לארכיטקטורת פתרון: לוגיקה עסקית, ממשקי מערכת, מודל נתונים וזרימות נתונים, והובלתה עד לייצור.",
  "לצד זה בעלות על מוצר מקצה לקצה, מרעיון ועד גרסה בשתי חנויות האפליקציות, ב-Node.js, TypeScript, Supabase וכלי פיתוח מבוססי AI.",
];

/* --- English ---------------------------------------------------------------- */
export const architectEn = {
  ...address("architect", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Solution Architect and Senior Systems Analyst",
    description: "CV of Ofir Aviram. Solution Architect and Senior Systems Analyst with 15+ years designing end-to-end solutions for enterprise applications, integrations and IAM and IDM systems, alongside a product owned from an idea to release.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("architect", "en"),

  name: "Ofir Aviram",
  roles: [
    "Solution Architect | Senior Systems Analyst",
    "Enterprise Applications, Integrations and End-to-End Product",
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

    /* ONE list. This was "Core Expertise" and "Technical Skills", which between
       them said SQL and Agile twice each and product development three times. */
    {
      type: "keywords",
      title: "Core Expertise",
      groups: [
        {
          title: "Solution Architecture",
          terms: ["End-to-End Solution Design", "Enterprise Applications", "Integration Architecture", "Business Logic", "System Interfaces", "Data Flows"],
        },
        {
          title: "Analysis and Specification",
          terms: ["Requirements Gathering", "Functional and Technical Specifications", "High-Level Design (HLD)", "Detailed Design (DD)", "Business Process Modeling", "UAT"],
        },
        {
          title: "Platforms and Integration",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA", "REST APIs", "ETL", "SSIS"],
        },
        {
          title: "Data and Development",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Git"],
        },
        {
          title: "Product and Delivery",
          terms: ["End-to-End Product Ownership", "Claude", "ChatGPT", "AI-Assisted Development", "Agile", "Jira", "Production Deployment"],
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
            "Full ownership of Once from concept to a production mobile product: product definition, UX, architecture, development, testing and the releases",
            "Designed the architecture behind it: the data model, the business logic, the backend workflows, the permission model and the real-time processes",
            "Built authentication, location services, matching, real-time chat, credit mechanisms, social Circles and notifications with Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and APIs",
            "Used Claude and ChatGPT for prototyping, coding, debugging, refactoring and test-data generation, and prepared and submitted the production releases for Google Play and the Apple App Store",
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
            "Responsible for the design and delivery of cross-system business processes, automations and integrations across Salesforce, Priority ERP and Workato, from the business requirement through to production",
            "Designed the integration architecture: data mappings, business logic, integration flows, system interfaces and SQL and ETL processes",
            "Translated business requirements into functional and technical specifications, and coordinated business stakeholders, IT teams and vendors through testing and implementation",
          ],
        },
        {
          role: "Senior Systems Analyst | IDM Solution Design",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Responsible for the design and implementation of enterprise Identity Management solutions at Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Designed the solution end to end: identity processes, interfaces, data transformations, data mappings and ETL processes, alongside the functional and technical specifications for them",
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
            "Led the analysis and design of a Web solution connecting municipal departments and automating cross-organizational workflows",
            "Modeled the processes, the data structures and the user journeys, and designed the SQL and SSIS integrations through to acceptance testing",
          ],
        },
        {
          role: "Identity Management Systems Analyst & Technical Lead",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Designed the organization's identity management solution, from business and security requirements through to processes, business logic, interfaces and integrations",
            "Designed system workflows and data flows, and guided a Java and JSP development team through to production delivery",
          ],
        },
        {
          role: "IDM Implementation Consultant & Solution Developer",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Owned the solution design and implementation at application level, excluding infrastructure, of the Aveksa IAM and Identity Governance platform at Harel, Migdal, Phoenix and Amdocs",
            "Built business logic, workflows, rules, approval processes, data mappings and synchronization processes, and the integrations with enterprise systems, databases and directories",
          ],
        },
        {
          role: "Software Developer | Enterprise Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Developed and maintained an enterprise billing platform using Microsoft SQL Server, Microsoft Access and VBA",
            "Turned business requirements into database queries, reports, automations and system enhancements, working directly with finance and operational stakeholders",
          ],
        },
      ],
    },

    {
      type: "entries",
      title: "Education and Service",
      entries: [
        {
          title: "PRODUCT MANAGEMENT PROGRAM",
          lines: ["Product Experts | 2021"],
        },
        {
          title: "B.SC. INDUSTRIAL ENGINEERING AND MANAGEMENT",
          lines: ["Information Systems Specialization", "Ben-Gurion University of the Negev | 2004 - 2008"],
        },
        {
          title: "COMBAT SOLDIER AND COMMANDER",
          lines: ["Combat Engineering Corps | 1999 - 2002"],
        },
      ],
    },
  ],
};

/* --- Hebrew ----------------------------------------------------------------- */
export const architectHe = {
  ...address("architect", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | ארכיטקט פתרונות ומנתח מערכות בכיר",
    description: "קורות החיים של אופיר אבירם. ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון פתרונות מקצה לקצה לאפליקציות ארגוניות, אינטגרציות ומערכות IAM ו-IDM, לצד בעלות על מוצר מרעיון ועד גרסה בחנויות.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("architect", "he"),

  name: "אופיר אבירם",
  roles: [
    "ארכיטקט פתרונות | מנתח מערכות בכיר",
    "אפליקציות ארגוניות, אינטגרציות ומוצר מקצה לקצה",
  ],
  contact: [
    { text: "הוד השרון" },
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
          title: "ארכיטקטורת פתרונות",
          terms: ["תכנון פתרון מקצה לקצה", "אפליקציות ארגוניות", "ארכיטקטורת אינטגרציה", "לוגיקה עסקית", "ממשקי מערכת", "זרימות נתונים"],
        },
        {
          title: "ניתוח ואפיון",
          terms: ["איסוף דרישות", "אפיון פונקציונלי וטכני", "High-Level Design (HLD)", "Detailed Design (DD)", "מידול תהליכים עסקיים", "UAT"],
        },
        {
          title: "פלטפורמות ואינטגרציה",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA", "REST APIs", "ETL", "SSIS"],
        },
        {
          title: "נתונים ופיתוח",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Git"],
        },
        {
          title: "מוצר ואספקה",
          terms: ["בעלות על מוצר מקצה לקצה", "Claude", "ChatGPT", "AI-Assisted Development", "Agile", "Jira", "עלייה לייצור"],
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
            "בעלות מלאה על Once מרעיון ועד מוצר מובייל בייצור: הגדרת המוצר, חוויית המשתמש, הארכיטקטורה, הפיתוח, הבדיקות והגרסאות",
            "תכנון הארכיטקטורה שמאחוריו: מודל הנתונים, הלוגיקה העסקית, תהליכי צד השרת, מודל ההרשאות והתהליכים בזמן אמת",
            "פיתוח מנגנוני הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות ב-Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC Functions וממשקי API",
            "שימוש ב-Claude וב-ChatGPT לאב טיפוס, כתיבת קוד, פתרון תקלות, ריפקטורינג ויצירת נתוני בדיקה, והכנה והגשה של גרסאות הייצור ל-Google Play ול-Apple App Store",
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
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "אחריות על התכנון והאספקה של תהליכים עסקיים, אוטומציות ואינטגרציות חוצות מערכות על גבי Salesforce, Priority ERP ו-Workato, מהדרישה העסקית ועד העלייה לייצור",
            "תכנון ארכיטקטורת האינטגרציה: מיפויי נתונים, לוגיקה עסקית, זרימות אינטגרציה, ממשקי מערכת ותהליכי SQL ו-ETL",
            "תרגום דרישות עסקיות לאפיונים פונקציונליים וטכניים, ותיאום בין גורמים עסקיים, צוותי IT וספקים עד לבדיקות ולהטמעה",
          ],
        },
        {
          role: "מנתח מערכות בכיר | תכנון פתרונות IDM",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אחריות על התכנון וההטמעה של פתרונות ניהול זהויות ארגוניים בשירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "תכנון הפתרון מקצה לקצה: תהליכי זהות, ממשקים, טרנספורמציות נתונים, מיפויי נתונים ותהליכי ETL, לצד כתיבת האפיונים הפונקציונליים והטכניים",
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
            "מידול התהליכים, מבני הנתונים ומסעות המשתמשים, ותכנון אינטגרציות SQL ו-SSIS עד לבדיקות הקבלה",
          ],
        },
        {
          role: "מנתח מערכות ניהול זהויות וראש צוות טכני",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "תכנון פתרון ניהול הזהויות בארגון, מדרישות עסקיות ומדרישות אבטחת מידע ועד תהליכים, לוגיקה עסקית, ממשקים ואינטגרציות",
            "תכנון תהליכי מערכת וזרימות נתונים, והנחיית צוות פיתוח שעבד ב-Java וב-JSP עד לעלייה לייצור",
          ],
        },
        {
          role: "יועץ הטמעה ומפתח פתרונות IDM",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "אחריות מלאה על תכנון הפתרון והמימוש בשכבת האפליקציה, למעט תשתיות, של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "בניית לוגיקה עסקית, תהליכי עבודה, חוקים, תהליכי אישור, מיפויי נתונים ותהליכי סנכרון, ואינטגרציות למערכות ארגוניות, בסיסי נתונים ושירותי Directory",
          ],
        },
        {
          role: "מפתח תוכנה | מערכות חיוב ארגוניות",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "פיתוח ותחזוקה של מערכת חיוב ארגונית באמצעות Microsoft SQL Server, Microsoft Access ו-VBA",
            "תרגום דרישות עסקיות לשאילתות, דוחות, אוטומציות ושיפורים במערכת, בעבודה ישירה מול גורמי כספים ותפעול",
          ],
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
