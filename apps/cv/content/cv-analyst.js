/* ==========================================================================
   The analyst CV, twice: once in English, once in Hebrew.

   THE SAME CAREER AS cv-architect.js, TOLD FOR A DIFFERENT JOB.

   Every company, every date and every customer is identical in both documents,
   and has to stay that way: two CVs of one man that disagree about a year or a
   client are not two framings, they are a lie in one of them. What differs is
   which half of the work each document puts in front.

   The architect CV leads with solution design. This one leads with what most
   of those fifteen years actually consisted of: specifying Web and Mobile
   systems, the organisation's core systems, and the interfaces between them.

   WHAT CHANGED IN THIS PASS, AND WHY

   The facts did not. The framing did. The previous version described DUTIES,
   role after role, in the same four shapes: analysed, specified, tracked,
   tested. A reader could not tell from it which of those jobs he OWNED, which
   of them were hard, or what came out of them. So:

     - every role opens on ownership and on what the work was for, not on the
       first activity in it
     - the bullets under it carry the complexity: which systems, which
       interfaces, which data, which parties
     - the recent years get room and the old ones get shorter, because that is
       the order a reader cares about them in
     - "Core Expertise" and "Technical Skills" were one list written twice, and
       are now one list written once

   NO NUMBER IN HERE WAS INVENTED. Not a user count, not a saving, not a
   percentage, not a system count, not a team size. Where a figure would have
   made a line land harder it is ABSENT, and the gap was handed back to Ofir to
   fill rather than guessed at. A CV that wins the screening and loses the
   interview has won nothing.

   WHERE THEY LAND
     dist/cv/analyst/index.html      ->  floa.co.il/cv/analyst/
     dist/cv/analyst/he/index.html   ->  floa.co.il/cv/analyst/he/

   The addresses are worked out in cv-shared.js. This file is copy and nothing
   else, and the way it is DRAWN lives in src/components/resume/ along with
   every other CV's, so no document can drift from the others in layout.

   A NOTE ON VOICE. Nothing here is in the third person: a summary that says
   "he gathers requirements" is somebody else describing him, inside a document
   he sends himself. The summary is nominal, and so are the bullets, which is
   one voice rather than two.

   NOTE: cv-developer.js was a copy of this file with a listed set of small
   differences. This rewrite was asked for on the analyst alone, so the two
   have parted company and the developer document no longer tracks this one.

   Every date range is rendered inside <bdi dir="ltr">, so "2014 - 2017" reads
   the same way on the RTL page as on the LTR one.
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
];

const SUMMARY_HE = [
  "מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות מורכבות.",
  "התמחות בתרגום דרישות עסקיות לאפיון פונקציונלי וטכני, בתכנון ממשקים ומבני נתונים ובליווי הפיתוח מהדרישה ועד העלייה לייצור.",
  "שילוב של ראייה עסקית עם הבנה טכנולוגית ויכולת hands-on ב-SQL ובטכנולוגיות Web.",
];

/* --- English ---------------------------------------------------------------- */
export const analystEn = {
  ...address("analyst", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Senior Systems Analyst, Web, Mobile and Core Systems",
    description: "CV of Ofir Aviram. Senior Systems Analyst with 15+ years specifying Web and Mobile systems, core systems and complex integrations: functional and technical specifications, interfaces, data structures, SQL and delivery from the requirement through to production.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("analyst", "en"),

  name: "Ofir Aviram",
  roles: [
    "Senior Systems Analyst | Web, Mobile and Core Systems",
    "Specification, Integrations and End-to-End Delivery",
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
          title: "Web, Mobile and Hands-On",
          terms: ["User Journeys", "Screen Flows", "UX and UI Specification", "Node.js", "TypeScript", "JavaScript", "Supabase", "Java", "JSP", "Git"],
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
          role: "Mobile Systems Analyst",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Owned the specification and delivery of a Mobile application end to end, from requirements and user journeys through the backlog to acceptance testing and the release builds for the App Store and Google Play",
            "Specified the complex functionality behind it: authentication, location services, matching, real-time chat, a credit mechanism, social Circles and notifications, with their states, permissions and edge cases",
            "Designed the data model, the business logic and the service contracts between the application and the services behind it",
            "Worked hands-on in the environment it runs on, Node.js, TypeScript, Supabase, PostgreSQL and REST APIs, with Claude and ChatGPT, which is what keeps a specification one a developer can build and a tester can check",
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
          role: "Systems and Data Analyst | Core Billing Systems",
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
export const analystHe = {
  ...address("analyst", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | מנתח מערכות בכיר, Web, Mobile ומערכות ליבה",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות מורכבות: אפיון פונקציונלי וטכני, ממשקים, מבני נתונים, SQL וליווי מהדרישה ועד העלייה לייצור.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("analyst", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות בכיר | Web, Mobile ומערכות ליבה",
    "אפיון, אינטגרציות ואספקה מקצה לקצה",
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
          title: "Web, Mobile ו-hands-on",
          terms: ["מסעות משתמשים", "זרימות מסכים", "אפיון UX ו-UI", "Node.js", "TypeScript", "JavaScript", "Supabase", "Java", "JSP", "Git"],
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
          role: "מנתח מערכות מובייל",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "הובלת האפיון והאספקה מקצה לקצה של אפליקציית Mobile, משלב הדרישות ומסעות המשתמש ועד Backlog, בדיקות קבלה והכנת גרסאות ל-App Store ול-Google Play",
            "אפיון הפונקציונליות המורכבת שמאחוריה: הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות, על מצביהם, ההרשאות ומקרי הקצה",
            "תכנון מודל הנתונים, הלוגיקה העסקית וחוזי השירות בין האפליקציה לשירותים שמאחוריה",
            "עבודה hands-on בסביבה שבה האפליקציה רצה, Node.js, TypeScript, Supabase, PostgreSQL וממשקי REST, בעזרת Claude ו-ChatGPT, וזה מה ששומר על אפיון שמפתח יכול לממש ובודק יכול לבדוק",
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
          role: "מנתח מערכות ונתונים | מערכות ליבה לחיוב",
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
