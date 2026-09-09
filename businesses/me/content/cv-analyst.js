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
   applications, mobile applications and the organisation's core systems, and
   the interfaces between them.

   NO TITLE ON IT IS ANYTHING BUT AN ANALYST. THE KNOWLEDGE UNDER THEM IS ALL
   STILL THERE.

   Two opposite mistakes are available here and the document has to miss both.

   The first is over-qualifying. A hiring manager who reads "Solution
   Architect", "Product Owner", "Technical Lead" or "Developer" in a TITLE
   concludes the man is too big for the job, will leave inside a year, and does
   not call. So none of those words title anything. Every role is Systems
   Analyst, and the product work was folded into the employment history rather
   than standing in a section above it.

   The second is hiding what he knows. Development knowledge, hands-on, is
   something these employers actively want in an analyst: it is why a
   specification of his is one a developer can actually build. So the stack is
   named, in the summary, in the Once entry and in its own row of Technical
   Skills, and guiding a development team stays in the Amdocs bullets.

   The line between the two is a job title against a skill. He is not applying
   as a developer; he is an analyst who has built the thing he specifies.

   And data. Reading the source data is where each of these specifications
   actually started, so it is said: Varonis is titled Systems and Data Analyst,
   and the analysis of source data opens the design bullet at Tidhar, Brillix
   and Tel Aviv. Data Analysis is named in Core Expertise rather than left to be
   inferred from the letters S, Q and L.

   WHAT IT IS AIMED AT, AND WHY IT SAYS WHAT IT SAYS

   It is sent to systems-analyst openings, and those openings ask for the same
   short list over and over. Every item on it is something Ofir has done; the
   only thing this file does is make sure the document SAYS so, in the words the
   posting used, rather than leaving a reader to infer it:

     business requirements gathering        the first line of every posting
     functional and technical specs         named as documents, HLD and DD
     interfaces between systems             web services, integration flows
     data structure design                  asked for by name, not "modeling"
     SQL                                    asked for explicitly
     testing, UAT, implementation           the tail end of the job
     task and project tracking              "ניהול ומעקב אחר משימות ופרויקטים"
     development teams, users, vendors      the three parties named
     UX and UI                              the fourth, in the Web/Mobile role
     Agile                                  named in all three

   Nothing was added that did not happen. Where a posting named a tool Ofir has
   not used (Control-M, for one), the CV says what he DID do that is adjacent
   (scheduled ETL and synchronisation jobs) and does not claim the tool. A CV
   that wins the screening and loses the interview has not won anything.

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

   Three sentences, and each one answers a different question a screener asks:
   what he is and for how long, what he produces, and how he gets it delivered. */
const SUMMARY_EN = [
  "Systems Analyst with 15+ years of experience, most of them analyzing and specifying Web and Mobile systems, organizational core systems and the interfaces between them.",
  "Gathers business requirements and writes what follows: functional and technical specifications, high level and detailed design, data structures, interface and web service definitions, SQL queries and acceptance criteria.",
  "Carries it to production: task and project tracking, guiding development teams, working with business users, UX and UI, QA and vendors, through acceptance testing, implementation and support, in Agile delivery.",
  "Knows the technology hands-on: Node.js, TypeScript, Supabase, PostgreSQL, SQL and AI-assisted development tools, which is what keeps a specification something a developer can actually build.",
];

const SUMMARY_HE = [
  "מנתח מערכות עם מעל 15 שנות ניסיון, שרובן עברו על ניתוח ואפיון של מערכות Web ומובייל, מערכות ליבה ארגוניות והממשקים ביניהן.",
  "אוסף דרישות עסקיות וכותב את המסמכים שנגזרים מהן: אפיון פונקציונלי, אפיון טכני ברמת High-Level Design (HLD) ו-Low-Level Design (LLD), מבני נתונים, הגדרות ממשקים ו-Web Services, שאילתות SQL וקריטריוני קבלה.",
  "מלווה את התהליך עד לייצור: מעקב אחר משימות ולוחות זמנים, הנחיית צוותי פיתוח, עבודה מול משתמשים עסקיים, UX ו-UI, בדיקות וספקים, ועד בדיקות קבלה, הטמעה ותמיכה שוטפת, בעבודה במתודולוגיית Agile.",
  "בעל היכרות Hands-on עם טכנולוגיות פיתוח, בסיסי נתונים וכלי AI, המאפשרת כתיבת אפיונים ישימים, מדויקים וברורים לצוותי פיתוח.",
];

/* --- English ---------------------------------------------------------------- */
export const analystEn = {
  ...address("analyst", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Systems Analyst, Web, Mobile and Core Systems",
    description: "CV of Ofir Aviram. Systems Analyst with 15+ years, most of them analyzing and specifying Web and Mobile systems, core systems and the interfaces between them: requirements gathering, functional and technical specifications, data structures, SQL, testing and implementation.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("analyst", "en"),

  name: "Ofir Aviram",
  roles: [
    "Systems Analyst | Web, Mobile & Core Systems",
    "Requirements, Functional and Technical Specifications, Interfaces and End-to-End Delivery",
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
          title: "Requirements and Specification",
          terms: ["Business Requirements Gathering", "Functional and Technical Specifications", "High Level and Detailed Design", "Use Cases", "Acceptance Criteria"],
        },
        {
          title: "Interfaces and Data",
          terms: ["Core Systems: ERP, Billing, Identity", "System Interfaces", "Web Services", "REST APIs", "Integration of Existing and New Systems", "Data Analysis", "Data Structure Design", "SQL Queries and Reports", "ETL and Scheduled Jobs"],
        },
        {
          title: "Product and Interface",
          terms: ["User Journeys", "Screen Flows", "UX and UI Specification", "Permissions, States and Edge Cases"],
        },
        {
          title: "Delivery and Project Tracking",
          terms: ["Task and Project Tracking", "Development Teams, Business Users, QA and Vendors", "Testing and UAT", "System Implementation", "Production Deployment", "Maintenance and Upgrades", "Agile", "Jira"],
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
            "Specified a mobile application end to end: business requirements, user journeys, screen flows, states, permissions and edge cases",
            "Wrote the high level and detailed design for authentication, location services, matching, real-time chat, credit mechanisms, social Circles and notifications: data structures, business logic and the service contracts between the app and its backend",
            "Planned and tracked the work as a backlog, from each requirement through to acceptance testing against it",
            "Hands-on across the stack it runs on, Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and REST APIs, with Claude and ChatGPT for prototyping, debugging and test data",
            "Prepared and submitted the production releases for Google Play and the Apple App Store",
          ],
          link: { label: "Live demo:", href: DEMO },
        },
        {
          role: "Senior Systems Analyst | Web Applications & Core System Interfaces",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Analyzed and specified Web-based business processes, automations and interfaces between core systems on Salesforce, Priority ERP and Workato",
            "Gathered business requirements and wrote functional and technical specifications, down to screens, fields, validations and acceptance criteria",
            "Analyzed the source data and designed data structures, mappings, business logic, integration flows, service interfaces and scheduled SQL and ETL jobs",
            "Tracked tasks and timelines across business users, IT teams and vendors, and led testing, implementation and production deployment",
          ],
        },
        {
          /* The fold, and it sits a job higher than the Hebrew document's: the
             same career sets longer in Latin, and an employment entry is never
             cut across a sheet, so page one ends where the last whole one fits.
             Page one ends with Tidhar, page two opens here. */
          breakBefore: true,
          role: "Senior Systems Analyst | Web Portals & Core Identity Systems",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Analyzed and specified Web-based core Identity Management systems for Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Wrote functional and technical specifications for self-service screens, approval flows, interfaces and data transformations",
            "Analyzed the source data and designed data structures, business logic, mappings, scheduled ETL and synchronization jobs, and the interfaces behind the portal",
            "Led delivery across cybersecurity, DBA, DevOps, IT and business teams, through acceptance testing, implementation and support",
          ],
        },
        {
          role: "Systems Analyst | Web Solution, UX and UI Flows",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the analysis and design of a Web solution connecting municipal departments and automating cross-organizational workflows",
            "Gathered requirements from business users and modeled processes, data structures, user journeys and UX and UI flows",
            "Analyzed the departments' data, designed SQL and SSIS interfaces, and coordinated users, development, DBA, QA and UAT",
          ],
        },
        {
          role: "Systems Analyst | Core Identity Systems",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Translated business and security requirements into technical specifications: processes, business logic, screens, interfaces and integrations",
            "Specified system workflows, data flows and data structures, and guided a Java and JSP Web development team through implementation, testing and production delivery",
          ],
        },
        {
          role: "Systems Analyst & Implementation Consultant | Core Identity Platforms",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Independently analyzed, customized and implemented the Aveksa Web platform for Harel, Migdal, Phoenix and Amdocs, at the application level",
            "Specified business logic, workflows, rules, approval screens, data mappings and scheduled synchronization jobs, and built the interfaces to enterprise systems, databases and directories",
            "Led testing, implementation and production support",
          ],
        },
        {
          role: "Systems and Data Analyst | Core Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Analyzed, developed and maintained a core enterprise billing system on Microsoft SQL Server, Microsoft Access and VBA",
            "Analyzed billing data and turned business questions into SQL queries, reports and automations, and investigated production issues directly with finance and operations",
          ],
        },
      ],
    },

    {
      type: "keywords",
      title: "Technical Skills",
      groups: [
        {
          title: "Data and Interfaces",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Database Design", "ETL", "SSIS", "Scheduled Jobs", "REST APIs", "Web Services"],
        },
        {
          title: "Core Systems and Platforms",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA"],
        },
        {
          title: "Development Knowledge, Hands-On",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "VBA", "Git"],
        },
        {
          title: "Method and Tools",
          terms: ["Agile", "Jira", "UAT", "Claude", "ChatGPT"],
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
    title: "אופיר אבירם | מנתח מערכות Web, Mobile ומערכות ליבה",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות עם מעל 15 שנות ניסיון, שרובן עברו על ניתוח ואפיון של מערכות Web ומובייל, מערכות ליבה ארגוניות והממשקים ביניהן: איסוף דרישות, מסמכי אפיון פונקציונליים וטכניים, מבני נתונים, SQL, בדיקות והטמעה.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("analyst", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות | Web, Mobile ומערכות ליבה",
    "איסוף דרישות, אפיון פונקציונלי וטכני, ממשקים ואספקה מקצה לקצה",
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
          title: "דרישות ומסמכי אפיון",
          terms: ["איסוף דרישות עסקיות", "אפיון פונקציונלי", "אפיון טכני", "High-Level Design (HLD)", "Low-Level Design (LLD)", "תרחישי שימוש", "סיפורי משתמש וקריטריוני קבלה"],
        },
        {
          title: "ממשקים ומערכות ליבה",
          terms: ["מערכות ERP", "חיוב וזהויות", "REST APIs", "Web Services", "אינטגרציות בין מערכות קיימות וחדשות", "תכנון ממשקים", "מיפויי נתונים", "SQL", "ETL ותהליכים מתוזמנים"],
        },
        {
          title: "מוצר וממשק",
          terms: ["מסעות משתמשים", "זרימות מסכים", "אפיון UX ו-UI", "התנהגות ברמת השדה", "הרשאות", "מצבים", "מקרי קצה ושגיאות"],
        },
        {
          title: "הובלת אספקה ומעקב",
          terms: ["מעקב אחר משימות ולוחות זמנים", "הנחיית צוותי פיתוח", "עבודה מול משתמשים עסקיים", "QA", "ספקים ו-IT", "בדיקות קבלה", "הטמעה", "עלייה לייצור", "תחזוקה ושדרוגים", "Agile ו-Jira"],
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
            "אפיון אפליקציית מובייל מקצה לקצה: דרישות עסקיות, מסעות משתמשים, זרימות מסכים, מצבים, הרשאות ומקרי קצה",
            "אפיון מנגנוני הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות",
            "תכנון ומעקב אחר המשימות כ-Backlog, מכל דרישה ועד בדיקות קבלה מול ההגדרה שממנה הגיעה",
            "היכרות Hands-on עם סביבת הפיתוח של האפליקציה, Node.js, TypeScript, Supabase, PostgreSQL וממשקי REST, בעזרת Claude ו-ChatGPT, ככלי לאימות האפיון מול מערכת עובדת",
            "הכנה והגשה של גרסאות הייצור ל-Google Play ול-Apple App Store",
          ],
          link: { label: "הדגמה חיה:", href: DEMO },
        },
        {
          role: "מנתח מערכות בכיר | אפליקציות Web וממשקים למערכות ליבה",
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "ניתוח ואפיון של תהליכים עסקיים, אוטומציות וממשקים בין מערכות ליבה על גבי Salesforce, Priority ERP ו-Workato",
            "איסוף דרישות עסקיות וכתיבת מסמכי אפיון פונקציונליים וטכניים, עד לרמת המסכים, השדות, הוולידציות, זרימות המשתמש וקריטריוני הקבלה",
            "ניתוח נתוני המקור ותכנון מבני נתונים, מיפויים, לוגיקה עסקית, זרימות אינטגרציה, ממשקי שירות ותהליכי SQL ו-ETL מתוזמנים",
            "מעקב אחר משימות ולוחות זמנים מול משתמשים עסקיים, צוותי IT וספקים, והובלת בדיקות, הטמעה ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות בכיר | פורטלי Web ומערכות ליבה של זהויות",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "ניתוח ואפיון של מערכות ליבה לניהול זהויות מבוססות Web עבור שירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "כתיבת מסמכי אפיון פונקציונליים וטכניים למסכי שירות עצמי, תהליכי אישור, תהליכי זהות, ממשקים וטרנספורמציות נתונים",
            "ניתוח נתוני המקור ותכנון מבני נתונים, לוגיקה עסקית, מיפויים, תהליכי ETL וסנכרון מתוזמנים, והממשקים למערכות שמאחורי הפורטל",
            "הובלת האספקה מול צוותי סייבר, DBA, DevOps, תשתיות, IT וגורמים עסקיים, ועד בדיקות קבלה, הטמעה ותמיכה בייצור",
          ],
        },
        {
          /* the fold: page one ends with Brillix, page two opens here */
          breakBefore: true,
          role: "מנתח מערכות | פתרון Web, זרימות UX ו-UI",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת הניתוח והאפיון של פתרון Web שחיבר בין יחידות עירוניות וביצע אוטומציה של תהליכים חוצי ארגון",
            "איסוף דרישות ממשתמשים עסקיים ומידול תהליכים עסקיים, מבני נתונים, מסעות משתמשים וזרימות UX ו-UI, מסך אחרי מסך",
            "ניתוח הנתונים של היחידות, תכנון ממשקי SQL ו-SSIS ותיאום בין משתמשים, פיתוח, DBA, QA ובדיקות קבלה",
          ],
        },
        {
          role: "מנתח מערכות | מערכות ליבה לניהול זהויות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "תרגום דרישות עסקיות ודרישות אבטחת מידע למסמכי אפיון טכניים: תהליכים, לוגיקה עסקית, מסכים, ממשקים ואינטגרציות",
            "אפיון תהליכי מערכת, זרימות נתונים ומבני נתונים, והנחיית צוות פיתוח Web שעבד ב-Java וב-JSP לאורך היישום, הבדיקות והעלייה לייצור",
            "תיאום בין צוותי פיתוח, סייבר, תשתיות, DBA, DevOps, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה | פלטפורמות ליבה לניהול זהויות",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "ניתוח, התאמה והטמעה עצמאית של פלטפורמת Aveksa מבוססת Web בהראל, מגדל, הפניקס ואמדוקס",
            "אחריות על הניתוח והמימוש בשכבת האפליקציה, למעט תשתיות",
            "אפיון לוגיקה עסקית, תהליכי עבודה, חוקים, מסכי אישור, מיפויי נתונים ותהליכי סנכרון מתוזמנים",
            "בניית ממשקים למערכות ארגוניות, בסיסי נתונים ושירותי Directory והובלת בדיקות, הטמעה ותמיכה בייצור",
          ],
        },
        {
          role: "מנתח מערכות ונתונים | מערכות ליבה לחיוב",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "ניתוח, פיתוח ותחזוקה של מערכת ליבה לחיוב ארגוני באמצעות Microsoft SQL Server, Microsoft Access ו-VBA",
            "ניתוח נתוני החיוב ותרגום שאלות עסקיות לשאילתות SQL, דוחות ואוטומציות",
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
          title: "נתונים וממשקים",
          terms: ["SQL", "Microsoft SQL Server", "PostgreSQL", "Database Design", "ETL", "SSIS", "תהליכים מתוזמנים", "REST APIs", "Web Services"],
        },
        {
          title: "מערכות ליבה ופלטפורמות",
          terms: ["Salesforce", "Priority ERP", "Workato", "Aveksa", "IAM", "IDM", "IGA"],
        },
        {
          title: "ידע Hands-on בפיתוח",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "Edge Functions", "RPC Functions", "Java", "JSP", "VBA", "Git"],
        },
        {
          title: "מתודולוגיה וכלי עבודה",
          terms: ["Agile", "Jira", "UAT", "Claude", "ChatGPT", "AI-Assisted Development"],
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
