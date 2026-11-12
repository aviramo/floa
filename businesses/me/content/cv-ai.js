/* ==========================================================================
   The AI CV, twice: once in English, once in Hebrew.

   THE SAME CAREER AS cv-architect.js AND cv-analyst.js, TOLD FOR AN AI ROLE.

   Every company, date and customer is identical in all of them, and has to
   stay that way. What differs is which half of the work is put in front: here
   it is specifying systems that AI is part of, and building with AI as the
   daily tool, which is what the current job (Once) actually is.

   NO NUMBER IN HERE WAS INVENTED, and neither was any AI project. The only AI
   work stated is what the other CVs already state: Once, built with Claude and
   ChatGPT. Anything else (a model integration, an evaluation, a prompt
   library, a figure) is ABSENT until Ofir supplies it. Do not add one that
   he cannot defend in an interview.

   WHERE THEY LAND
     dist/cv/ai/index.html      ->  floa.co.il/cv/ai/
     dist/cv/ai/he/index.html   ->  floa.co.il/cv/ai/he/

   Addresses come from cv-shared.js. This file is copy only; the drawing lives
   in src/components/resume/. Nothing is in the third person, and every date
   range renders inside <bdi dir="ltr">.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

const SUMMARY_EN = [
  "Senior Systems Analyst with 15+ years of experience specifying Web and Mobile systems, now building AI-assisted products end to end.",
  "Turning business requirements into specifications a developer can build and a tester can check, and using Claude and ChatGPT daily across design, code and delivery.",
  "Deep knowledge of core systems, integrations and data, combined with hands-on ability in Node.js, TypeScript, SQL and Supabase.",
];

const SUMMARY_HE = [
  "מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, שבונה היום מוצרים בסיוע AI מקצה לקצה.",
  "תרגום דרישות עסקיות לאפיון שמפתח יכול לממש ובודק יכול לבדוק, ושימוש יומיומי ב-Claude וב-ChatGPT בתכנון, בקוד ובאספקה.",
  "היכרות עמוקה עם מערכות ליבה, אינטגרציות ונתונים, בשילוב יכולת hands-on ב-Node.js, TypeScript, SQL ו-Supabase.",
];

/* --- English ---------------------------------------------------------------- */
export const aiEn = {
  ...address("ai", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Senior Systems Analyst, AI-Assisted Product Development",
    description: "CV of Ofir Aviram. Senior Systems Analyst with 15+ years specifying Web and Mobile systems, now building AI-assisted products with Claude and ChatGPT: specifications, data, integrations and delivery from the requirement through to production.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("ai", "en"),

  name: "Ofir Aviram",
  roles: [
    "Senior Systems Analyst | AI-Assisted Product Development",
    "Specification, Integrations and End-to-End Delivery",
  ],
  contact: [
    { text: "Hod Hasharon, Israel" },
    { text: "+972-58-707-8708", href: CONTACT.phoneHref },
    { text: CONTACT.mail, href: CONTACT.mailHref },
    { text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    { type: "text", title: "Professional Summary", body: SUMMARY_EN },

    {
      type: "keywords",
      title: "Core Expertise",
      groups: [
        {
          title: "AI-Assisted Development",
          terms: ["Claude", "ChatGPT", "AI-Assisted Specification", "AI-Assisted Coding", "Prompting", "Product Delivery with AI"],
        },
        {
          title: "Systems Analysis",
          terms: ["Business Requirements Gathering", "Functional and Technical Specifications", "High-Level Design (HLD)", "Detailed Design (DD)", "Use Cases", "Acceptance Criteria", "UAT"],
        },
        {
          title: "Interfaces and Integrations",
          terms: ["REST APIs", "Web Services", "System Interfaces", "Salesforce", "Priority ERP", "Workato", "IAM", "IDM", "IGA"],
        },
        {
          title: "Data",
          terms: ["SQL", "Database Design", "Data Modeling", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "PostgreSQL"],
        },
        {
          title: "Web, Mobile and Hands-On",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "User Journeys", "Screen Flows", "Java", "JSP", "Git"],
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
          role: "Product Builder | AI-Assisted Mobile Development",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Owned a Mobile application end to end, from requirements and user journeys through the backlog to acceptance testing and the release builds for the App Store and Google Play, working with Claude and ChatGPT throughout",
            "Used AI as a working tool across the whole cycle: shaping specifications, writing and reviewing code, and checking behaviour against the requirement, with every output verified before it ships",
            "Specified the complex functionality behind it: authentication, location services, matching, real-time chat, a credit mechanism, social Circles and notifications, with their states, permissions and edge cases",
            "Designed the data model, the business logic and the service contracts, and worked hands-on in Node.js, TypeScript, Supabase, PostgreSQL and REST APIs",
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
        { title: "PRODUCT MANAGEMENT PROGRAM", lines: ["Product Experts | 2021"] },
        {
          title: "B.SC. INDUSTRIAL ENGINEERING AND MANAGEMENT",
          lines: ["Information Systems Specialization", "Ben-Gurion University of the Negev | 2004 - 2008"],
        },
        { title: "COMBAT SOLDIER AND COMMANDER", lines: ["Combat Engineering Corps | 1999 - 2002"] },
      ],
    },
  ],
};

/* --- Hebrew ----------------------------------------------------------------- */
export const aiHe = {
  ...address("ai", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | מנתח מערכות בכיר, פיתוח מוצר בסיוע AI",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות בכיר עם מעל 15 שנות ניסיון באפיון מערכות Web ומובייל, שבונה היום מוצרים בסיוע AI עם Claude ו-ChatGPT: אפיון, נתונים, אינטגרציות וליווי מהדרישה ועד העלייה לייצור.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("ai", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות בכיר | פיתוח מוצר בסיוע AI",
    "אפיון, אינטגרציות ואספקה מקצה לקצה",
  ],
  contact: [
    { text: "הוד השרון" },
    { text: "058-707-8708", href: CONTACT.phoneHref },
    { text: CONTACT.mail, href: CONTACT.mailHref },
    { text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    { type: "text", title: "תקציר מקצועי", body: SUMMARY_HE },

    {
      type: "keywords",
      title: "תחומי מומחיות",
      groups: [
        {
          title: "פיתוח בסיוע AI",
          terms: ["Claude", "ChatGPT", "אפיון בסיוע AI", "כתיבת קוד בסיוע AI", "Prompting", "אספקת מוצר עם AI"],
        },
        {
          title: "ניתוח מערכות",
          terms: ["איסוף דרישות עסקיות", "אפיון פונקציונלי וטכני", "High-Level Design (HLD)", "Detailed Design (DD)", "תרחישי שימוש", "קריטריוני קבלה", "UAT"],
        },
        {
          title: "ממשקים ואינטגרציות",
          terms: ["REST APIs", "Web Services", "ממשקים בין מערכות", "Salesforce", "Priority ERP", "Workato", "IAM", "IDM", "IGA"],
        },
        {
          title: "נתונים",
          terms: ["SQL", "Database Design", "מידול נתונים", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "PostgreSQL"],
        },
        {
          title: "Web, Mobile ו-hands-on",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "מסעות משתמשים", "זרימות מסכים", "Java", "JSP", "Git"],
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
          role: "בונה מוצר | פיתוח מובייל בסיוע AI",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "הובלת אפליקציית Mobile מקצה לקצה, משלב הדרישות ומסעות המשתמש ועד Backlog, בדיקות קבלה והכנת גרסאות ל-App Store ול-Google Play, בעבודה עם Claude ו-ChatGPT לאורך כל הדרך",
            "שימוש ב-AI ככלי עבודה בכל המחזור: ניסוח אפיון, כתיבה וסקירת קוד ובדיקת ההתנהגות מול הדרישה, וכל תוצר נבדק לפני שהוא יוצא",
            "אפיון הפונקציונליות המורכבת שמאחוריה: הזדהות, שירותי מיקום, התאמות, צ'אט בזמן אמת, מנגנון קרדיטים, מעגלים חברתיים והתראות, על מצביהם, ההרשאות ומקרי הקצה",
            "תכנון מודל הנתונים, הלוגיקה העסקית וחוזי השירות, ועבודה hands-on ב-Node.js, TypeScript, Supabase, PostgreSQL וממשקי REST",
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
        { title: "תוכנית ניהול מוצר", lines: ["Product Experts | 2021"] },
        {
          title: "B.Sc. בהנדסת תעשייה וניהול",
          lines: ["התמחות במערכות מידע", "אוניברסיטת בן גוריון בנגב | 2004 - 2008"],
        },
      ],
    },

    { type: "lines", title: "שפות", lines: ["עברית: שפת אם", "אנגלית: רמה בינונית, קריאה וכתיבה טכנית"] },

    {
      type: "entries",
      title: "שירות צבאי",
      entries: [{ title: "לוחם ומפקד", lines: ["חיל ההנדסה הקרבית | 1999 - 2002"] }],
    },
  ],
};
