/* ==========================================================================
   The analyst CV, twice: once in English, once in Hebrew.

   THE SAME CAREER AS cv-architect.js, TOLD FOR A DIFFERENT JOB.

   Every company, every date and every fact is identical in both documents, and
   has to stay that way: two CVs of one man that disagree about a year or a
   customer are not two framings, they are a lie in one of them. What differs is
   which half of the work each document puts in front.

   The architect CV leads with solution design: architecture, integrations, IAM
   and IDM, enterprise applications. This one leads with what most of those
   fifteen years actually consisted of, day to day: analysing and specifying web
   applications and mobile applications, from the first requirement through the
   user journey, the screens, the business logic and the data model, to the
   interfaces between a client and the services behind it.

   So the role titles here name the analysis rather than the architecture, the
   summary opens on Mobile and Web, and every bullet is rewritten toward the
   product and the interface. Nothing is added that did not happen.

   WHERE THEY LAND
     dist/cv/analyst/index.html      ->  floa.co.il/cv/analyst/
     dist/cv/analyst/he/index.html   ->  floa.co.il/cv/analyst/he/

   The addresses are worked out in cv-shared.js. This file is copy and nothing
   else, and the way it is DRAWN lives in src/components/resume/ along with
   every other CV's, so no document can drift from the others in layout.

   Every date range is rendered inside <bdi dir="ltr">, so "2014 - 2017" reads
   the same way on the RTL page as on the LTR one.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

/* The professional summary, held here rather than inline in the section below,
   because the share card's description IS its first paragraph. Written twice it
   would be written differently within a month.

   The first sentence is the whole positioning of this document: the years, and
   what the majority of them were spent on. */
const SUMMARY_EN = [
  "Mobile and Web Systems Analyst with 15+ years of experience, most of them spent analyzing and specifying web and mobile applications for large organizations.",
  "Works from the user inward: requirements gathering, user journeys, screen and UX and UI flows, business logic, data models, API contracts between a client and the services behind it, and acceptance testing through to production.",
  "Recently took a mobile product from concept to the app stores end to end, and brings that hands-on product view back into enterprise analysis work, using Node.js, TypeScript, Supabase and AI-assisted development tools.",
];

const SUMMARY_HE = [
  "מנתח מערכות Mobile ו-Web עם מעל 15 שנות ניסיון, שרובן עברו על אפיון ותכנון של אפליקציות Web ומובייל בארגונים גדולים.",
  "עובד מהמשתמש פנימה: איסוף דרישות, מסעות משתמש, אפיון מסכים וזרימות UX ו-UI, לוגיקה עסקית, מודל נתונים, חוזי API בין הלקוח לשירותים שמאחוריו ובדיקות קבלה עד לייצור.",
  "לאחרונה הוביל מוצר מובייל מרעיון ועד חנויות האפליקציות מקצה לקצה, ומביא את המבט המעשי הזה גם לעבודת האפיון בארגון, באמצעות Node.js, TypeScript, Supabase וכלי פיתוח מבוססי AI.",
];

/* --- English ---------------------------------------------------------------- */
export const analystEn = {
  ...address("analyst", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Mobile and Web Systems Analyst",
    description: "CV of Ofir Aviram. Mobile and Web Systems Analyst with 15+ years, most of them spent analyzing and specifying web and mobile applications: requirements, user journeys, UX and UI flows, business logic, data models and APIs.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("analyst", "en"),

  name: "Ofir Aviram",
  roles: [
    "Mobile & Web Systems Analyst",
    "Requirements, User Journeys, UX and UI Flows and End-to-End Delivery",
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
          title: "Mobile and Web Systems Analysis",
          terms: ["Analyzing and specifying web applications, mobile applications and the services behind them, from the first requirement through the user journey and the screens to the data model and the interfaces"],
        },
        {
          title: "Requirements and Specification",
          terms: ["Requirements Gathering", "Functional and Technical Specifications", "Use Cases and User Stories", "Business Process Modeling", "Acceptance Criteria"],
        },
        {
          title: "Product and Interface",
          terms: ["User Journeys", "Screen Flows", "UX and UI Specification", "Field-Level Behavior", "Permissions and States", "Error and Edge Cases"],
        },
        {
          title: "Data and Interfaces",
          terms: ["Data Modeling", "SQL", "REST APIs", "Client and Server Contracts", "Integration Flows", "ETL"],
        },
        {
          title: "Delivery",
          terms: ["Stakeholder Management", "Cross-Functional Leadership", "Testing", "UAT", "Production Deployment", "Agile Delivery"],
        },
      ],
    },

    {
      type: "roles",
      title: "Selected Product Experience",
      jobs: [
        {
          role: "Product Owner & Mobile Systems Analyst",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Specified a mobile product end to end: user journeys, screen flows, states, permissions and the edge cases the app has to answer for",
            "Modeled the data, the business logic and the real-time processes behind the screens, and defined the contracts between the app and its backend",
            "Analyzed and specified authentication, location services, matching, real-time chat, credit mechanisms, social Circles and notifications",
            "Implemented what was specified with Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and APIs, so the specification was checked against a working system daily",
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
          role: "Senior Systems Analyst | Web Applications & Integrations",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Analyzed and specified web-based business processes, automations and integrations across Salesforce, Priority ERP and Workato",
            "Translated business requirements into functional and technical specifications, down to screens, fields, validations and user flows",
            "Designed data mappings, business logic, integration flows, system interfaces and SQL and ETL processes",
            "Coordinated business stakeholders, IT teams, vendors, testing and production deployment",
          ],
        },
        {
          role: "Senior Systems Analyst | Web Portals & Identity Processes",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Analyzed and specified web-based Identity Management solutions for Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Wrote functional and technical specifications for self-service screens, approval flows, identity processes, interfaces and data transformations",
            "Designed business logic, data mappings, ETL processes and the interfaces between the portal and the systems behind it",
            "Led delivery across cybersecurity, DBA, DevOps, infrastructure, IT and business teams",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "Systems Analyst | Web Solution, UX and UI Flows",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the analysis and design of a web solution connecting municipal departments and automating cross-organizational workflows",
            "Modeled business processes, data structures, user journeys and UX and UI flows, screen by screen",
            "Designed SQL and SSIS integrations and coordinated users, development, DBA, QA and UAT",
          ],
        },
        {
          role: "Web Systems Analyst & Technical Lead | Identity Management",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Translated business and security requirements into technical processes, business logic, screens, interfaces and integrations",
            "Specified system workflows and data flows and guided a Java and JSP web development team",
            "Coordinated development, cybersecurity, infrastructure, DBA, DevOps, testing and production delivery",
          ],
        },
        {
          role: "Systems Analyst & Implementation Consultant | Web Identity Platforms",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Independently analyzed, customized and implemented the Aveksa web platform for Harel, Migdal, Phoenix and Amdocs",
            "Owned the application-level analysis and implementation, excluding infrastructure",
            "Specified business logic, workflows, rules, approval screens, data mappings and synchronization processes",
            "Built integrations with enterprise systems, databases and directories and led testing, deployment and production support",
          ],
        },
        {
          role: "Systems Analyst & Developer | Enterprise Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Analyzed, developed and maintained an enterprise billing platform using Microsoft SQL Server, Microsoft Access and VBA",
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
          title: "Web and Mobile",
          terms: ["Node.js", "TypeScript", "JavaScript", "REST APIs", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Google Play", "Apple App Store"],
        },
        {
          title: "Analysis and Data",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Data Modeling", "ETL", "SSIS", "Microsoft Access", "VBA", "Git"],
        },
        {
          title: "Enterprise Platforms",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA"],
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
export const analystHe = {
  ...address("analyst", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | מנתח מערכות Mobile ו-Web",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות Mobile ו-Web עם מעל 15 שנות ניסיון, שרובן עברו על אפיון ותכנון של אפליקציות Web ומובייל: דרישות, מסעות משתמש, זרימות UX ו-UI, לוגיקה עסקית, מודל נתונים וממשקי API.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("analyst", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות Mobile ו-Web",
    "אפיון דרישות, מסעות משתמש, זרימות UX ו-UI ואספקה מקצה לקצה",
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
          title: "ניתוח מערכות Mobile ו-Web",
          terms: ["אפיון ותכנון של אפליקציות Web, אפליקציות מובייל והשירותים שמאחוריהן, מהדרישה הראשונה דרך מסע המשתמש והמסכים ועד מודל הנתונים והממשקים"],
        },
        {
          title: "דרישות ואפיון",
          terms: ["איסוף דרישות", "אפיון פונקציונלי וטכני", "תרחישי שימוש וסיפורי משתמש", "מידול תהליכים עסקיים", "קריטריוני קבלה"],
        },
        {
          title: "מוצר וממשק",
          terms: ["מסעות משתמש", "זרימות מסכים", "אפיון UX ו-UI", "התנהגות ברמת השדה", "הרשאות ומצבים", "מקרי קצה ושגיאות"],
        },
        {
          title: "נתונים וממשקים",
          terms: ["מידול נתונים", "SQL", "REST APIs", "חוזים בין לקוח לשרת", "זרימות אינטגרציה", "ETL"],
        },
        {
          title: "הובלת אספקה",
          terms: ["ניהול בעלי עניין", "הובלה חוצת ארגון", "בדיקות", "בדיקות קבלה", "עלייה לייצור ועבודה במתודולוגיית Agile"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון מוצר נבחר",
      jobs: [
        {
          role: "מנהל מוצר ומנתח מערכות מובייל",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "אפיון מוצר מובייל מקצה לקצה: מסעות משתמש, זרימות מסכים, מצבים, הרשאות ומקרי הקצה שהאפליקציה צריכה לענות עליהם",
            "מידול הנתונים, הלוגיקה העסקית והתהליכים בזמן אמת שמאחורי המסכים, והגדרת החוזים בין האפליקציה לשרת",
            "אפיון מנגנוני הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות",
            "מימוש מה שאופיין באמצעות Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC Functions וממשקי API, כך שהאפיון נבחן מול מערכת עובדת מדי יום",
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
          role: "מנתח מערכות בכיר | אפליקציות Web ואינטגרציות",
          org: "קבוצת תדהר | ישראל | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "אפיון תהליכים עסקיים, אוטומציות ואינטגרציות מבוססי Web על גבי Salesforce, Priority ERP ו-Workato",
            "תרגום דרישות עסקיות לאפיונים פונקציונליים וטכניים, עד לרמת המסכים, השדות, הוולידציות וזרימות המשתמש",
            "תכנון מיפויי נתונים, לוגיקה עסקית, זרימות אינטגרציה, ממשקי מערכת ותהליכי SQL ו-ETL",
            "תיאום בין גורמים עסקיים, צוותי IT, ספקים, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות בכיר | פורטלי Web ותהליכי זהות",
          org: "בריליקס | ישראל | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אפיון ותכנון של פתרונות ניהול זהויות מבוססי Web עבור שירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "כתיבת אפיונים פונקציונליים וטכניים למסכי שירות עצמי, תהליכי אישור, תהליכי זהות, ממשקים וטרנספורמציות נתונים",
            "תכנון לוגיקה עסקית, מיפויי נתונים, תהליכי ETL והממשקים בין הפורטל למערכות שמאחוריו",
            "הובלת האספקה מול צוותי סייבר, DBA, DevOps, תשתיות, IT וגורמים עסקיים",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "מנתח מערכות | פתרון Web, זרימות UX ו-UI",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת האפיון והתכנון של פתרון Web שחיבר בין יחידות עירוניות וביצע אוטומציה של תהליכים חוצי ארגון",
            "מידול תהליכים עסקיים, מבני נתונים, מסעות משתמשים וזרימות UX ו-UI, מסך אחרי מסך",
            "תכנון אינטגרציות SQL ו-SSIS ותיאום בין משתמשים, פיתוח, DBA, QA ובדיקות קבלה",
          ],
        },
        {
          role: "מנתח מערכות Web וראש צוות טכני | ניהול זהויות",
          org: "אמדוקס | ישראל",
          dates: "2017 - 2020",
          bullets: [
            "תרגום דרישות עסקיות ודרישות אבטחת מידע לתהליכים טכניים, לוגיקה עסקית, מסכים, ממשקים ואינטגרציות",
            "אפיון תהליכי מערכת וזרימות נתונים והנחיית צוות פיתוח Web שעבד ב-Java וב-JSP",
            "תיאום בין צוותי פיתוח, סייבר, תשתיות, DBA, DevOps, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה | פלטפורמות זהות מבוססות Web",
          org: "פרולינק ניהול זהויות | ישראל",
          dates: "2014 - 2017",
          bullets: [
            "אפיון, התאמה והטמעה עצמאית של פלטפורמת Aveksa מבוססת Web בהראל, מגדל, הפניקס ואמדוקס",
            "אחריות על האפיון והמימוש בשכבת האפליקציה, למעט תשתיות",
            "אפיון לוגיקה עסקית, תהליכי עבודה, חוקים, מסכי אישור, מיפויי נתונים ותהליכי סנכרון",
            "בניית אינטגרציות למערכות ארגוניות, בסיסי נתונים ושירותי Directory והובלת בדיקות, הטמעה ותמיכה בייצור",
          ],
        },
        {
          role: "מנתח מערכות ומפתח | מערכות חיוב ארגוניות",
          org: "Varonis | ישראל",
          dates: "2008 - 2014",
          bullets: [
            "אפיון, פיתוח ותחזוקה של מערכת חיוב ארגונית באמצעות Microsoft SQL Server, Microsoft Access ו-VBA",
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
          title: "Web ומובייל",
          terms: ["Node.js", "TypeScript", "JavaScript", "REST APIs", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "Google Play", "Apple App Store"],
        },
        {
          title: "ניתוח ונתונים",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Data Modeling", "ETL", "SSIS", "Microsoft Access", "VBA", "Git"],
        },
        {
          title: "פלטפורמות ארגוניות",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA"],
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
