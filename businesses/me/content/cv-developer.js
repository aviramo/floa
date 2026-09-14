/* ==========================================================================
   The developer CV, twice: once in English, once in Hebrew.

   THE THIRD TELLING OF ONE CAREER. The facts do not move.

   cv-architect.js leads with solution design. cv-analyst.js leads with analysis
   and specification. This one leads with the code: a production mobile product
   built end to end and shipped to both stores, six years writing software at
   Varonis before any of the rest of it, a platform customised and implemented
   at ProLink, and a Java and JSP team led at Amdocs.

   Every company, date and customer is identical in all three. What differs is
   which half of the work each document puts in front, and a reader who holds
   two of them side by side should find one career described twice, never two
   stories that disagree.

   WHAT THIS ONE IS AIMED AT

   A posting that wants a development background. So the order changes: Once is
   first because it is the strongest evidence that he ships working software,
   the technical skills sit high rather than after the employment history, and
   every role is titled for what was BUILT in it.

   WHERE IT DOES NOT OVERREACH

   He is not a career full-stack engineer and the document does not pretend to
   be one. It says fifteen years of enterprise systems with six of them writing
   code and a modern product built alone, because that is what happened, and
   because a CV that wins the screening and loses the technical interview has
   won nothing. Nothing is claimed that is not in the record: no framework he
   has not used, no cloud platform he has not run, no team he did not lead.

   "Full-Stack Developer" is his own phrase for the Once work. It is the title
   that role carries on the architect CV too, in his words, not an upgrade this
   file applied to it.

   WHERE THEY LAND
     dist/cv/developer/index.html      ->  floa.co.il/cv/developer/
     dist/cv/developer/he/index.html   ->  floa.co.il/cv/developer/he/

   The addresses are worked out in cv-shared.js. This file is copy and nothing
   else, and the way it is DRAWN lives in src/components/resume/ along with
   every other CV's, so no document can drift from the others in layout.

   Every date range is rendered inside <bdi dir="ltr">, so "2008 - 2014" reads
   the same way on the RTL page as on the LTR one.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

/* The summary, held here because the share card's description IS its first
   paragraph. Three sentences: what he has shipped, what stands behind it, and
   what he works in. */
const SUMMARY_EN = [
  "Full-Stack Developer who took a mobile product from an empty repository to Google Play and the App Store: data model, business logic, authentication, real-time processes, APIs, permissions and the releases themselves.",
  "Behind that, 15+ years in enterprise systems, six of them writing software and the rest designing the systems other developers built: business logic, integrations, data models, SQL and ETL.",
  "Works in Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions and REST APIs, with Claude and ChatGPT inside the daily loop for prototyping, debugging, refactoring and test data.",
];

const SUMMARY_HE = [
  "מפתח Full-Stack שהוביל מוצר מובייל מריפו ריק ועד Google Play ו-App Store: מודל נתונים, לוגיקה עסקית, הזדהות, תהליכים בזמן אמת, ממשקי API, הרשאות והגרסאות עצמן.",
  "מאחורי זה מעל 15 שנות ניסיון במערכות ארגוניות, שש מהן בכתיבת תוכנה והשאר בתכנון המערכות שמפתחים אחרים בנו: לוגיקה עסקית, אינטגרציות, מודלי נתונים, SQL ו-ETL.",
  "עובד ב-Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions וממשקי REST, עם Claude ו-ChatGPT כחלק מהיום יום: אב טיפוס, פתרון תקלות, ריפקטורינג ונתוני בדיקה.",
];

/* --- English ---------------------------------------------------------------- */
export const developerEn = {
  ...address("developer", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Full-Stack Developer, Node.js and TypeScript",
    description: "CV of Ofir Aviram. Full-Stack Developer who built and shipped a production mobile product with Node.js, TypeScript, Supabase and PostgreSQL, on 15+ years of enterprise systems, integrations, SQL and ETL.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("developer", "en"),

  name: "Ofir Aviram",
  roles: [
    "Full-Stack Developer | Node.js, TypeScript, PostgreSQL",
    "Product Built End to End, on 15+ Years of Enterprise Systems",
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
          title: "End-to-End Product Development",
          terms: ["Turning an idea or a business requirement into a working product, including product definition, architecture, data modeling, business logic, integrations, development, testing and production deployment"],
        },
        {
          title: "Backend and Data",
          terms: ["Data Modeling", "Business Logic", "APIs and Service Contracts", "Permissions and Row-Level Security", "Real-Time Processes", "SQL and ETL"],
        },
      ],
    },

    {
      type: "keywords",
      title: "Technical Skills",
      groups: [
        {
          title: "Languages and Runtime",
          terms: ["TypeScript", "JavaScript", "Node.js", "SQL", "Java", "JSP", "VBA"],
        },
        {
          title: "Data",
          terms: ["PostgreSQL", "Supabase", "Microsoft SQL Server", "Database Design", "Data Modeling", "ETL", "SSIS", "Microsoft Access"],
        },
        {
          title: "Backend and APIs",
          terms: ["REST APIs", "Web Services", "Edge Functions", "RPC Functions", "Authentication", "Permissions and Row-Level Security", "Real-Time Processes"],
        },
        {
          title: "Delivery and Tools",
          terms: ["Git", "Google Play", "Apple App Store", "Jira", "Agile", "Claude", "ChatGPT", "AI-Assisted Development"],
        },
      ],
    },

    {
      type: "roles",
      title: "Experience",
      jobs: [
        {
          role: "Full-Stack Developer & Product Owner",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Took Once from concept to a production mobile product, owning the architecture, the database, the backend and the releases",
            "Designed and built the data model, business logic, backend workflows, permissions and real-time processes",
            "Built authentication, location services, matching, real-time chat, credit mechanisms, social Circles and notifications",
            "Developed with Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and REST APIs",
            "Used Claude and ChatGPT for prototyping, coding, debugging, refactoring, problem-solving and test-data generation",
            "Prepared and submitted the production releases for Google Play and the Apple App Store",
          ],
          link: { label: "Live demo:", href: DEMO },
        },
        {
          role: "Integrations and Automation | Senior Systems Analyst",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Built and delivered enterprise automations and integrations across Salesforce, Priority ERP and Workato",
            "Designed data mappings, business logic, integration flows, service interfaces and scheduled SQL and ETL jobs",
            "Translated business requirements into functional and technical specifications",
            "Coordinated business stakeholders, IT teams, vendors, testing and production deployment",
          ],
        },
        {
          role: "IDM Implementation | Senior Systems Analyst",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Implemented enterprise Identity Management systems for Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Built identity processes, interfaces, data transformations, data mappings and scheduled ETL and synchronization jobs",
            "Created functional and technical specifications for identity processes, interfaces and integrations",
            "Led delivery across cybersecurity, DBA, DevOps, infrastructure, IT and business teams",
          ],
        },
        {
          role: "Systems Analyst | Web Solution and SQL Integrations",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Designed a Web solution connecting municipal departments and automating cross-organizational workflows",
            "Built SQL and SSIS integrations and modeled the processes, data structures and screen flows behind them",
            "Coordinated users, development, DBA, QA and user acceptance testing",
          ],
        },
        {
          role: "Technical Lead & Systems Analyst | Java, JSP",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Guided a Java and JSP development team through implementation, testing and production delivery",
            "Turned business and security requirements into technical processes, business logic, interfaces and integrations",
            "Coordinated development, cybersecurity, infrastructure, DBA, DevOps, testing and production delivery",
          ],
        },
        {
          role: "Solution Developer & Implementation Consultant",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Independently customized and implemented the Aveksa IAM and Identity Governance platform for Harel, Migdal, Phoenix and Amdocs",
            "Owned the application-level solution design and implementation, excluding infrastructure",
            "Built business logic, workflows, rules, approval processes, data mappings and synchronization processes",
            "Built integrations with enterprise systems, databases and directories, and led testing, deployment and production support",
          ],
        },
        {
          role: "Software Developer | Enterprise Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Developed and maintained an enterprise billing platform using Microsoft SQL Server, Microsoft Access and VBA",
            "Turned business requirements into database queries, reports, automations and system enhancements",
            "Investigated production issues and worked directly with finance and operational stakeholders",
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
    title: "אופיר אבירם | מפתח Full-Stack, Node.js ו-TypeScript",
    description: "קורות החיים של אופיר אבירם. מפתח Full-Stack שבנה והעלה לאוויר מוצר מובייל ב-Node.js, TypeScript, Supabase ו-PostgreSQL, על בסיס מעל 15 שנות ניסיון במערכות ארגוניות, אינטגרציות, SQL ו-ETL.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("developer", "he"),

  name: "אופיר אבירם",
  roles: [
    "מפתח Full-Stack | Node.js, TypeScript, PostgreSQL",
    "מוצר שנבנה מקצה לקצה, על בסיס מעל 15 שנות ניסיון במערכות ארגוניות",
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
          title: "פיתוח מוצר מקצה לקצה",
          terms: ["הפיכת רעיון או דרישה עסקית למוצר עובד, כולל הגדרת המוצר, ארכיטקטורה, מודל נתונים, לוגיקה עסקית, אינטגרציות, פיתוח, בדיקות ועלייה לייצור"],
        },
        {
          title: "צד שרת ונתונים",
          terms: ["מידול נתונים", "לוגיקה עסקית", "ממשקי API וחוזי שירות", "הרשאות ו-Row-Level Security", "תהליכים בזמן אמת", "SQL ו-ETL"],
        },
      ],
    },

    {
      type: "keywords",
      title: "כישורים טכניים",
      groups: [
        {
          title: "שפות וסביבות ריצה",
          terms: ["TypeScript", "JavaScript", "Node.js", "SQL", "Java", "JSP", "VBA"],
        },
        {
          title: "נתונים",
          terms: ["PostgreSQL", "Supabase", "Microsoft SQL Server", "Database Design", "מידול נתונים", "ETL", "SSIS", "Microsoft Access"],
        },
        {
          title: "צד שרת וממשקים",
          terms: ["REST APIs", "Web Services", "Edge Functions", "RPC Functions", "הזדהות", "הרשאות ו-Row-Level Security", "תהליכים בזמן אמת"],
        },
        {
          title: "אספקה וכלי עבודה",
          terms: ["Git", "Google Play", "Apple App Store", "Jira", "Agile", "Claude", "ChatGPT", "AI-Assisted Development"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מפתח Full-Stack ומנהל מוצר",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "הובלת Once מרעיון ראשוני למוצר מובייל בייצור, כולל הארכיטקטורה, הדאטהבייס, צד השרת והגרסאות",
            "תכנון ובניית מודל הנתונים, הלוגיקה העסקית, תהליכי צד השרת, מודל ההרשאות והתהליכים בזמן אמת",
            "פיתוח מנגנוני הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות",
            "פיתוח באמצעות Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC Functions וממשקי REST",
            "שימוש ב-Claude וב-ChatGPT לאב טיפוס, כתיבת קוד, פתרון תקלות, ריפקטורינג ויצירת נתוני בדיקה",
            "הכנה והגשה של גרסאות הייצור ל-Google Play ול-Apple App Store",
          ],
          link: { label: "הדגמה חיה:", href: DEMO },
        },
        {
          role: "אינטגרציות ואוטומציה | מנתח מערכות בכיר",
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "בנייה ואספקה של אוטומציות ואינטגרציות ארגוניות על גבי Salesforce, Priority ERP ו-Workato",
            "תכנון מיפויי נתונים, לוגיקה עסקית, זרימות אינטגרציה, ממשקי שירות ותהליכי SQL ו-ETL מתוזמנים",
            "תרגום דרישות עסקיות לאפיונים פונקציונליים וטכניים",
            "תיאום בין גורמים עסקיים, צוותי IT, ספקים, בדיקות ועלייה לייצור",
          ],
        },
        {
          /* The fold. Hebrew sets tighter than Latin, so left alone page one
             swallowed most of the history and page two came out half empty.
             Page one ends with Tidhar, page two opens here. */
          breakBefore: true,
          role: "הטמעת IDM | מנתח מערכות בכיר",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "הטמעת מערכות ניהול זהויות ארגוניות עבור שירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "בניית תהליכי זהות, ממשקים, טרנספורמציות נתונים, מיפויי נתונים ותהליכי ETL וסנכרון מתוזמנים",
            "כתיבת אפיונים פונקציונליים וטכניים לתהליכי זהות, ממשקים ואינטגרציות",
            "הובלת האספקה מול צוותי סייבר, DBA, DevOps, תשתיות, IT וגורמים עסקיים",
          ],
        },
        {
          role: "מנתח מערכות | פתרון Web ואינטגרציות SQL",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "תכנון פתרון Web שחיבר בין יחידות עירוניות וביצע אוטומציה של תהליכים חוצי ארגון",
            "בניית אינטגרציות SQL ו-SSIS ומידול התהליכים, מבני הנתונים וזרימות המסכים שמאחוריהן",
            "תיאום בין משתמשים, פיתוח, DBA, QA ובדיקות קבלה",
          ],
        },
        {
          role: "ראש צוות טכני ומנתח מערכות | Java, JSP",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "הנחיית צוות פיתוח שעבד ב-Java וב-JSP לאורך היישום, הבדיקות והעלייה לייצור",
            "הפיכת דרישות עסקיות ודרישות אבטחת מידע לתהליכים טכניים, לוגיקה עסקית, ממשקים ואינטגרציות",
            "תיאום בין צוותי פיתוח, סייבר, תשתיות, DBA, DevOps, בדיקות ועלייה לייצור",
          ],
        },
        {
          role: "מפתח פתרונות ויועץ הטמעה",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "התאמה והטמעה עצמאית של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "אחריות על תכנון הפתרון והמימוש בשכבת האפליקציה, למעט תשתיות",
            "בניית לוגיקה עסקית, תהליכי עבודה, חוקים, תהליכי אישור, מיפויי נתונים ותהליכי סנכרון",
            "בניית אינטגרציות למערכות ארגוניות, בסיסי נתונים ושירותי Directory והובלת בדיקות, הטמעה ותמיכה בייצור",
          ],
        },
        {
          role: "מפתח תוכנה | מערכות חיוב ארגוניות",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "פיתוח ותחזוקה של מערכת חיוב ארגונית באמצעות Microsoft SQL Server, Microsoft Access ו-VBA",
            "הפיכת דרישות עסקיות לשאילתות, דוחות, אוטומציות ושיפורים במערכת",
            "חקירת תקלות בייצור ועבודה ישירה מול גורמי כספים ותפעול",
          ],
        },
      ],
    },

    {
      type: "entries",
      title: "השכלה ושירות",
      entries: [
        {
          title: "תוכנית ניהול מוצר",
          lines: ["Product Experts | 2021"],
        },
        {
          title: "B.Sc. בהנדסת תעשייה וניהול",
          lines: ["התמחות במערכות מידע", "אוניברסיטת בן גוריון בנגב | 2004 - 2008"],
        },
        {
          title: "לוחם ומפקד",
          lines: ["חיל ההנדסה הקרבית | 1999 - 2002"],
        },
      ],
    },

    {
      type: "lines",
      title: "שפות",
      lines: ["עברית: שפת אם", "אנגלית: רמה בינונית, קריאה וכתיבה טכנית"],
    },
  ],
};
