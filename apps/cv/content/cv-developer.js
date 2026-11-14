/* ==========================================================================
   The analyst CV again, with the development background brought forward.

   THIS IS cv-analyst.js. It is a copy of it, and it is meant to stay one. It
   is re-derived from that file whenever that file changes, which is what keeps
   the two from telling different versions of one career.

   It goes to the same openings: systems analysis, Web, Mobile and core
   systems. It is NOT for a development role and must never be sent to one.
   The only thing it changes is that a reader can see, without digging, that
   the man writing the specification has written software himself.

   THE WHOLE OF THE DIFFERENCE, so the two can be diffed by eye:

     the addresses            /cv/developer/ rather than /cv/analyst/
     the second title line    ", with a development background" appended
     the meta title           says the same thing, for a search result
     the summary              a fourth line, naming the six years and the
                              product that was built and shipped
     Once, the role title     End-to-End Development. It is the one entry
                              where the work really was building the thing
     Once, the tech bullet    the application was built, not "worked in"
     Varonis, the title       Systems Analyst and Developer, not and Data
     Core Expertise           the hands-on row moves to the top of the five

   Nothing else. Not a date, not a company, not a bullet, not a section.

   WHY THE TITLES STILL SAY ANALYST

   Because the job is an analyst's. A reader who sees "Developer" in a title
   concludes the applicant wants a different job and will leave for one, and
   does not call. Development is shown as a BACKGROUND: in the summary, in one
   bullet of the newest role, in the oldest job's title where he really was a
   developer, and in a row of Core Expertise. Never as the positioning.

   WHERE THEY LAND
     dist/cv/developer/index.html      ->  floa.co.il/cv/developer/
     dist/cv/developer/he/index.html   ->  floa.co.il/cv/developer/he/

   The addresses are worked out in cv-shared.js, and the way this is DRAWN
   lives in src/components/resume/ with every other CV's.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

/* The summary, held here because the share card's description IS its first
   paragraph. Three sentences and no more: what he is and for how long, what he
   turns a requirement into, and the thing that makes him unusual. It does not
   list technologies, and it does not rehearse the employment history that sits
   two inches below it. */
const SUMMARY_EN = [
  "Senior Systems Analyst with 15+ years of experience specifying Web and Mobile systems, organizational core systems and complex integrations.",
  "Translating business requirements into functional and technical specifications, designing interfaces and data structures, and carrying development from the requirement through to production.",
  "A business view combined with technical understanding and hands-on ability in SQL and Web technologies.",
  "A real development background behind that: six years writing software, and a mobile product built with Node.js, TypeScript, Supabase and PostgreSQL and shipped to both app stores.",
];

const SUMMARY_HE = [
  "מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות מורכבות.",
  "התמחות בתרגום דרישות עסקיות לאפיון פונקציונלי וטכני, בתכנון ממשקים ומבני נתונים ובליווי הפיתוח מהדרישה ועד העלייה לייצור.",
  "שילוב של ראייה עסקית עם הבנה טכנולוגית ויכולת hands-on ב-SQL ובטכנולוגיות Web.",
  "ומאחורי זה רקע אמיתי בפיתוח: שש שנים בכתיבת תוכנה, ומוצר מובייל שפותח ב-Node.js, TypeScript, Supabase ו-PostgreSQL ועלה לשתי חנויות האפליקציות.",
];

/* --- English ---------------------------------------------------------------- */
export const developerEn = {
  ...address("developer", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Senior Systems Analyst with a Development Background",
    description: "CV of Ofir Aviram. Senior Systems Analyst with 15+ years specifying Web and Mobile systems, core systems and complex integrations, with a real development background: six years writing software and a mobile product built and shipped with Node.js, TypeScript, Supabase and PostgreSQL.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("developer", "en"),

  name: "Ofir Aviram",
  roles: [
    "Senior Systems Analyst | Web, Mobile and Core Systems",
    "Specification, Integrations and End-to-End Delivery, with a Development Background",
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

    /* ONE list, not two. This was "Core Expertise" and "Technical Skills",
       which between them said SQL three times and Agile twice. The groups are
       what a screener looks for, in the order they look for it. */
    {
      type: "keywords",
      title: "Core Expertise",
      groups: [
        {
          title: "Hands-On Development",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "VBA", "Git"],
        },
        {
          title: "Systems Analysis",
          terms: ["Business Requirements Gathering", "Functional and Technical Specifications", "High-Level Design (HLD)", "Detailed Design (DD)", "Use Cases", "Acceptance Criteria", "UAT"],
        },
        {
          title: "Interfaces and Integrations",
          terms: ["REST APIs", "Web Services", "System Interfaces", "Integration Between Core Systems", "Salesforce", "Priority ERP", "Workato", "IAM", "IDM", "IGA"],
        },
        {
          title: "Data",
          terms: ["SQL", "Database Design", "Data Modeling", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "PostgreSQL"],
        },
        {
          title: "Web and Mobile",
          terms: ["User Journeys", "Screen Flows", "UX and UI Specification", "Mobile Releases", "Google Play", "Apple App Store"],
        },
        {
          title: "Method",
          terms: ["Agile", "Jira", "Stakeholder Management", "Vendor Management", "Production Deployment"],
        },
      ],
    },

    {
      type: "roles",
      title: "Professional Experience",
      jobs: [
        {
          role: "End-to-End Development",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Owned the specification and delivery of a Mobile application end to end, from requirements and user journeys through the backlog to acceptance testing and the release builds for the App Store and Google Play",
            "Specified the complex functionality behind it: authentication, location services, matching, real-time chat, a credit mechanism, social Circles and notifications, with their states, permissions and edge cases",
            "Designed the data model, the business logic and the service contracts between the application and the services behind it",
            "Built the application end to end with Node.js, TypeScript, Supabase, PostgreSQL and REST APIs, with Claude and ChatGPT, which is what keeps a specification one a developer can build and a tester can check",
          ],
          link: { label: "Live demo:", href: DEMO },
        },
        {
          role: "Senior Systems Analyst | Web Applications and Core System Interfaces",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Responsible for the specification and delivery of cross-system business processes and automations across Priority ERP, Salesforce and Workato, from the business requirement through to production",
            "Specified the interfaces between the core systems, functionally and technically, down to data mapping, business logic, validations, fields and user flows at screen level",
            "Designed data structures and scheduled SQL and ETL processes, on the basis of an analysis of the source data in each participating system",
            "Worked with business owners, IT teams and vendors through specification, testing and implementation",
          ],
        },
        {
          /* The fold, and it sits a job higher than the Hebrew document's: the
             same career sets longer in Latin, and an employment entry is never
             cut across a sheet. Page one ends with Tidhar, page two opens here. */
          breakBefore: true,
          role: "Senior Systems Analyst | Web Portals and Core Identity Systems",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Responsible for the specification and implementation of Web-based core Identity Management systems at Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Specified identity processes end to end: self-service screens, approval flows, permissions, and the interfaces and data transformations between the portal and the core systems behind it",
            "Designed data structures, data mappings and scheduled ETL and synchronization processes against the organizational data sources",
            "Led delivery across cybersecurity, DevOps, DBA, infrastructure, IT and business teams, through acceptance testing, implementation and production support",
          ],
        },
        {
          role: "Systems Analyst | Web Solution, UX and UI Flows",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the specification of a Web solution connecting municipal departments and automating cross-organizational processes",
            "Specified user journeys and UX and UI flows at screen level, alongside the process modeling and the data structures behind them",
            "Designed SQL and SSIS interfaces and worked with users, development, DBA and QA through acceptance testing",
          ],
        },
        {
          role: "Systems Analyst | Core Identity Systems",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Specified the organization's core Identity Management systems, from business and information-security requirements through to processes, interfaces and integrations",
            "Specified system processes, data flows and data structures, and guided a Java and JSP Web development team through implementation and production delivery",
          ],
        },
        {
          role: "Systems Analyst and Implementation Consultant | Core Identity Platforms",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Owned the application-layer specification and implementation, excluding infrastructure, of the Aveksa IAM and Identity Governance platform at Harel, Migdal, Phoenix and Amdocs",
            "Specified business logic, workflows, rules, approval processes, data mappings and synchronization processes, and the interfaces to enterprise systems, databases and directory services",
          ],
        },
        {
          role: "Systems Analyst & Developer | Core Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Specified and developed a core enterprise billing system on Microsoft SQL Server, Microsoft Access and VBA",
            "Analyzed billing data and turned business questions into SQL queries, reports and automations, working directly with finance and operations",
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
export const developerHe = {
  ...address("developer", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | מנתח מערכות בכיר עם רקע בפיתוח",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות מורכבות, עם רקע אמיתי בפיתוח: שש שנים בכתיבת תוכנה ומוצר מובייל שפותח ועלה לחנויות ב-Node.js, TypeScript, Supabase ו-PostgreSQL.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("developer", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות בכיר | Web, Mobile ומערכות ליבה",
    "אפיון, אינטגרציות ואספקה מקצה לקצה, עם רקע בפיתוח",
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
          title: "פיתוח, hands-on",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "VBA", "Git"],
        },
        {
          title: "ניתוח מערכות",
          terms: ["איסוף דרישות עסקיות", "אפיון פונקציונלי וטכני", "High-Level Design (HLD)", "Detailed Design (DD)", "תרחישי שימוש", "קריטריוני קבלה", "UAT"],
        },
        {
          title: "ממשקים ואינטגרציות",
          terms: ["REST APIs", "Web Services", "ממשקים בין מערכות", "אינטגרציה בין מערכות ליבה", "Salesforce", "Priority ERP", "Workato", "IAM", "IDM", "IGA"],
        },
        {
          title: "נתונים",
          terms: ["SQL", "Database Design", "מידול נתונים", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "PostgreSQL"],
        },
        {
          title: "Web ומובייל",
          terms: ["מסעות משתמשים", "זרימות מסכים", "אפיון UX ו-UI", "גרסאות מובייל", "Google Play", "Apple App Store"],
        },
        {
          title: "מתודולוגיה",
          terms: ["Agile", "Jira", "ניהול בעלי עניין", "עבודה מול ספקים", "עלייה לייצור"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "פיתוח מקצה לקצה",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "הובלת האפיון והאספקה מקצה לקצה של אפליקציית Mobile, משלב הדרישות ומסעות המשתמש ועד Backlog, בדיקות קבלה והכנת גרסאות ל-App Store ול-Google Play",
            "אפיון הפונקציונליות המורכבת שמאחוריה: הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות, על מצביהם, ההרשאות ומקרי הקצה",
            "תכנון מודל הנתונים, הלוגיקה העסקית וחוזי השירות בין האפליקציה לשירותים שמאחוריה",
            "פיתוח האפליקציה מקצה לקצה ב-Node.js, TypeScript, Supabase, PostgreSQL וממשקי REST, בעזרת Claude ו-ChatGPT, וזה מה ששומר על אפיון שמפתח יכול לממש ובודק יכול לבדוק",
          ],
          link: { label: "הדגמה חיה:", href: DEMO },
        },
        {
          role: "מנתח מערכות בכיר | אפליקציות Web וממשקים למערכות ליבה",
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "אחריות על האפיון והאספקה של תהליכים עסקיים ואוטומציות חוצי מערכות על גבי Priority ERP, Salesforce ו-Workato, מהדרישה העסקית ועד העלייה לייצור",
            "אפיון פונקציונלי וטכני של הממשקים בין מערכות הליבה, עד לרמת ה-Data Mapping, הלוגיקה העסקית, הוולידציות, השדות וזרימות המשתמש במסך",
            "תכנון מבני נתונים ותהליכי SQL ו-ETL מתוזמנים, על בסיס ניתוח נתוני המקור בכל אחת מהמערכות המשתתפות",
            "עבודה מול גורמים עסקיים, צוותי IT וספקים לאורך האפיון, הבדיקות וההטמעה",
          ],
        },
        {
          role: "מנתח מערכות בכיר | פורטלי Web ומערכות ליבה של זהויות",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אחריות על האפיון וההטמעה של מערכות ליבה לניהול זהויות מבוססות Web בשירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "אפיון תהליכי זהות מקצה לקצה: מסכי שירות עצמי, תהליכי אישור, הרשאות, והממשקים וטרנספורמציות הנתונים בין הפורטל למערכות הליבה שמאחוריו",
            "תכנון מבני נתונים, מיפויי נתונים ותהליכי ETL וסנכרון מתוזמנים מול מקורות הנתונים הארגוניים",
            "הובלת האספקה מול Cyber, DevOps, DBA, תשתיות, IT וגורמים עסקיים, עד בדיקות קבלה, הטמעה ותמיכה בייצור",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "מנתח מערכות | פתרון Web, זרימות UX ו-UI",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת האפיון של פתרון Web שחיבר בין יחידות עירוניות והפך תהליכים חוצי ארגון לאוטומטיים",
            "אפיון מסעות משתמשים וזרימות UX ו-UI ברמת המסך, לצד מידול התהליכים ומבני הנתונים שמאחוריהם",
            "תכנון ממשקי SQL ו-SSIS ועבודה מול משתמשים, פיתוח, DBA ו-QA עד בדיקות קבלה",
          ],
        },
        {
          role: "מנתח מערכות | מערכות ליבה לניהול זהויות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "אפיון מערכות הליבה לניהול זהויות בארגון, מדרישות עסקיות ודרישות אבטחת מידע ועד תהליכים, ממשקים ואינטגרציות",
            "אפיון תהליכי מערכת, זרימות נתונים ומבני נתונים, והנחיית צוות פיתוח Web ב-Java וב-JSP לאורך היישום והעלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה | פלטפורמות ליבה לניהול זהויות",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "אחריות מלאה על האפיון והמימוש בשכבת האפליקציה, למעט תשתיות, של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "אפיון לוגיקה עסקית, תהליכי עבודה, חוקים, תהליכי אישור, מיפויי נתונים ותהליכי סנכרון, והממשקים למערכות ארגוניות, בסיסי נתונים ושירותי Directory",
          ],
        },
        {
          role: "מנתח מערכות ומפתח | מערכות ליבה לחיוב",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "אפיון ופיתוח של מערכת ליבה לחיוב ארגוני ב-Microsoft SQL Server, Microsoft Access ו-VBA",
            "ניתוח נתוני החיוב ותרגום שאלות עסקיות לשאילתות SQL, דוחות ואוטומציות, בעבודה ישירה מול גורמי כספים ותפעול",
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
