/* ==========================================================================
   The analyst CV, in Hebrew and in English. It is also what /cv/ serves:
   cv-ai.js re-exports these two documents under the root address, so there is
   one text and not two that drift.

   POSITIONING
     Senior Systems Analyst: end-to-end specification, integrations, core
     systems, and hands-on ability (SQL, ETL, building with AI). Not a Solutions
     Architect and not a Full Stack Developer, and nothing here claims either.

   WHAT IS CLAIMED, AND WHAT IS NOT
     - No Salesforce and no Priority ERP anywhere, in skills or in roles.
     - Tidhar is described by what was specified and designed (integrations on
       Workato, data models, SQL and ETL), not by systems that were not his.
     - NO NUMBER IN HERE WAS INVENTED. The only counts are customers named in
       the roles themselves.
     - Voice: nominal, no first person.

   WHERE THEY LAND
     dist/cv/analyst/index.html      ->  floa.co.il/cv/analyst/
     dist/cv/analyst/en/index.html   ->  floa.co.il/cv/analyst/en/
   Every date range is rendered inside <bdi dir="ltr">.
   ========================================================================== */
import { CONTACT, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

const SUMMARY_EN = [
  "Senior Systems Analyst with 15+ years of experience specifying Web and Mobile systems, core systems and integrations between enterprise systems, mainly in identity and access management.",
  "Leads the process from the business requirement to production: functional and technical specifications, data models, interfaces, acceptance testing and support for development.",
  "Also hands-on: SQL, ETL, and building systems and applications with AI.",
];

const SUMMARY_HE = [
  "מנתח מערכות בכיר עם למעלה מ-15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות בין מערכות ארגוניות, בעיקר בתחום הזהויות וההרשאות.",
  "מוביל את התהליך מהדרישה העסקית ועד העלייה לייצור: אפיון פונקציונלי וטכני, מודלי נתונים, ממשקים, בדיקות קבלה וליווי הפיתוח.",
  "בנוסף, יכולת hands-on ב-SQL וב-ETL ובבניית מערכות ואפליקציות בעזרת AI.",
];

/* --- English ---------------------------------------------------------------- */
export const analystEn = {
  ...address("analyst", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Senior Systems Analyst, End-to-End Specification and Integrations",
    description: "CV of Ofir Aviram. Senior Systems Analyst with 15+ years specifying Web and Mobile systems, core systems and integrations, with hands-on SQL, ETL and AI-assisted building.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("analyst", "en"),

  name: "Ofir Aviram",
  roles: [
    "Senior Systems Analyst | End-to-End Specification, Integrations and Core Systems",
    "Hands-on, including AI and modern technologies",
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
          title: "Specification and Analysis",
          terms: ["Requirements Gathering", "Functional and Technical Specifications", "HLD and DD", "Use Cases", "Acceptance Criteria", "UAT", "UX and UI Specification", "Screen Flows"],
        },
        {
          title: "Integrations and APIs",
          terms: ["REST APIs", "Webhooks", "Web Services", "Interfaces Between Core Systems", "Workato (partial experience)"],
        },
        {
          title: "Identity and Permissions",
          terms: ["IAM", "IDM", "IGA", "Aveksa", "Multi-tenant", "Row Level Security"],
        },
        {
          title: "Data",
          terms: ["SQL", "Data Modeling", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "Azure SQL", "PostgreSQL"],
        },
        {
          title: "Hands-On and AI",
          terms: ["Claude", "ChatGPT", "TypeScript", "Node.js", "React Native", "Supabase", "Edge Functions", "Git"],
        },
        {
          title: "Working Method",
          terms: ["Agile", "Jira", "Stakeholder Management", "Vendor Management"],
        },
      ],
    },

    {
      type: "roles",
      title: "Independent Experience and Projects",
      jobs: [
        {
          role: "Participants Management System with a Public API",
          org: "Personal project",
          dates: "2026 - Present",
          bullets: [
            "Multi-tenant system for several businesses, isolated at the database level with Row Level Security on Supabase and PostgreSQL. Data model of participants, sessions, payments and subscriptions, with an admin interface and a personal area for participants",
            "Versioned REST API (v1) with public and secret keys, allowed origins and signed Webhooks, used by external websites. Email and WhatsApp messaging",
          ],
        },
        {
          role: "Once, a Social Mobile App for Android and iOS",
          org: "Personal project",
          dates: "2026 - Present",
          bullets: [
            "Specified and built end to end, from requirements to submission to the app stores, with React Native, Expo, TypeScript, Supabase, PostgreSQL and Edge Functions",
            "Nearby-user matching, real-time chat, groups, a credit system and notifications, with permissions enforced in the database (Row Level Security)",
          ],
        },
        {
          role: "Chords and Songs App",
          org: "Personal project",
          dates: "2026 - Present",
          bullets: [
            "Song index, a page per song and an editor, with Google sign-in, reading songs from images using the Claude API, and pre-built song pages for organic search",
          ],
        },
        {
          role: "Conversion-Focused Landing Pages",
          org: "Personal project",
          dates: "2026 - Present",
          bullets: [
            "Integration with Meta and Google Ads: sign-up forms, lead creation and routing, source tracking and campaign measurement",
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "Professional Experience",
      jobs: [
        {
          role: "Senior Systems Analyst",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          breakBefore: true,
          bullets: [
            "Specified cross-system business processes and automations and the interfaces between the systems: data mapping, business logic and validations, with partial hands-on work on Workato",
            "Designed data models and scheduled SQL and ETL processes in an Azure SQL environment, based on analysis of the source data",
            "Worked on the TQA quality management system",
            "Worked with business owners, IT teams and vendors through specification, testing and implementation",
          ],
        },
        {
          role: "Senior Systems Analyst",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Specified and implemented Web-based core Identity Management systems at Clalit Health Services, Migdal, Ayalon and LivePerson: self-service screens, approval flows and permissions",
            "Specified the interfaces and data transformations between the portal and the core systems, and designed data mapping and scheduled ETL and synchronization processes",
            "Led delivery with cybersecurity, DevOps, DBA, infrastructure and IT teams, through acceptance testing and production support",
          ],
        },
        {
          role: "Systems Analyst",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Specified a Web solution that connected municipal departments and automated cross-organizational processes",
            "Specified user journeys and UX and UI flows at screen level, with process modeling and data structures, and designed SQL and SSIS interfaces",
          ],
        },
        {
          role: "Systems Analyst",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Specified the core Identity Management systems, from business and information-security requirements to processes, interfaces and integrations",
            "Specified data flows and data structures, and guided a Java and JSP Web development team through to production",
          ],
        },
        {
          role: "Systems Analyst and Implementation Consultant",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Owned the application-layer specification and implementation of the Aveksa IAM and Identity Governance platform at Harel, Migdal, Phoenix and Amdocs",
            "Specified business logic, approval processes, data mappings and synchronization, and the interfaces to enterprise systems, databases and directory services",
          ],
        },
        {
          role: "Systems and Data Analyst",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Specified and developed a core enterprise billing system on Microsoft SQL Server, Access and VBA",
            "Turned business questions into SQL queries, reports and automations, working with finance and operations",
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
export const analystHe = {
  ...address("analyst", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | מנתח מערכות בכיר, אפיון מקצה לקצה ואינטגרציות",
    description: "קורות החיים של אופיר אבירם. מנתח מערכות בכיר עם למעלה מ-15 שנות ניסיון באפיון מערכות Web ומובייל, מערכות ליבה ואינטגרציות, עם יכולת hands-on ב-SQL, ב-ETL ובבנייה בעזרת AI.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("analyst", "he"),

  name: "אופיר אבירם",
  roles: [
    "מנתח מערכות בכיר | אפיון מקצה לקצה, אינטגרציות ומערכות ליבה",
    "יכולת hands-on, כולל שימוש ב-AI ובטכנולוגיות מודרניות",
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
          title: "אפיון וניתוח מערכות",
          terms: ["איסוף דרישות", "אפיון פונקציונלי וטכני", "HLD ו-DD", "תרחישי שימוש", "קריטריוני קבלה", "UAT", "אפיון UX ו-UI", "זרימות מסכים"],
        },
        {
          title: "אינטגרציות ו-API",
          terms: ["REST APIs", "Webhooks", "Web Services", "ממשקים בין מערכות ליבה", "Workato (ניסיון חלקי)"],
        },
        {
          title: "זהויות והרשאות",
          terms: ["IAM", "IDM", "IGA", "Aveksa", "Multi-tenant", "Row Level Security"],
        },
        {
          title: "נתונים",
          terms: ["SQL", "מידול נתונים", "Data Mapping", "ETL", "SSIS", "Microsoft SQL Server", "Azure SQL", "PostgreSQL"],
        },
        {
          title: "Hands-on ו-AI",
          terms: ["Claude", "ChatGPT", "TypeScript", "Node.js", "React Native", "Supabase", "Edge Functions", "Git"],
        },
        {
          title: "שיטת עבודה",
          terms: ["Agile", "Jira", "ניהול בעלי עניין", "עבודה מול ספקים"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון עצמאי ופרויקטים",
      jobs: [
        {
          role: "מערכת לניהול משתתפים עם API ציבורי",
          org: "פרויקט אישי",
          dates: "2026 - היום",
          bullets: [
            "מערכת Multi-tenant לכמה עסקים, מבודדים ברמת בסיס הנתונים באמצעות Row Level Security, על Supabase ו-PostgreSQL. מודל נתונים של משתתפים, מפגשים, תשלומים ומנויים, עם ממשק ניהול ואזור אישי למשתתף",
            "REST API בגרסאות (v1) עם מפתחות ציבוריים וסודיים, Origins מורשים ו-Webhooks חתומים, בשימוש אתרים חיצוניים. שליחת מיילים והודעות WhatsApp",
          ],
        },
        {
          role: "Once, אפליקציית מובייל חברתית ל-Android ול-iOS",
          org: "פרויקט אישי",
          dates: "2026 - היום",
          bullets: [
            "אפיון ובנייה מקצה לקצה, מהדרישות ועד הגשה לחנויות, עם React Native, Expo, TypeScript, Supabase, PostgreSQL ו-Edge Functions",
            "התאמות בקרבת מקום, צ'אט בזמן אמת, קבוצות, מערכת קרדיטים והתראות, עם הרשאות שנאכפות בבסיס הנתונים (Row Level Security)",
          ],
        },
        {
          role: "אפליקציית אקורדים ושירים",
          org: "פרויקט אישי",
          dates: "2026 - היום",
          bullets: [
            "אינדקס שירים, דף לכל שיר ועורך, עם התחברות Google, קריאת שירים מתמונה באמצעות Claude API ובנייה מראש של דפי השירים לקידום אורגני",
          ],
        },
        {
          role: "דפי נחיתה ממוקדי המרות",
          org: "פרויקט אישי",
          dates: "2026 - היום",
          bullets: [
            "אינטגרציה ל-Meta ול-Google Ads: טפסי הרשמה, יצירת לידים וניתובם, מעקב אחר מקורות הגעה ומדידת קמפיינים",
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מנתח מערכות בכיר",
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          breakBefore: true,
          bullets: [
            "אפיון תהליכים עסקיים ואוטומציות חוצי מערכות והממשקים ביניהן: Data Mapping, לוגיקה עסקית וולידציות, עם עבודה חלקית ב-Workato",
            "תכנון מודלי נתונים ותהליכי SQL ו-ETL מתוזמנים בסביבת Azure SQL, על בסיס ניתוח נתוני המקור",
            "עבודה על מערכת TQA לניהול איכות",
            "עבודה מול גורמים עסקיים, צוותי IT וספקים לאורך האפיון, הבדיקות וההטמעה",
          ],
        },
        {
          role: "מנתח מערכות בכיר",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אפיון והטמעה של מערכות ליבה לניהול זהויות מבוססות Web בכללית, מגדל, איילון ו-LivePerson: מסכי שירות עצמי, תהליכי אישור והרשאות",
            "אפיון הממשקים וטרנספורמציות הנתונים בין הפורטל למערכות הליבה, ותכנון Data Mapping ותהליכי ETL וסנכרון מתוזמנים",
            "הובלת האספקה מול Cyber, DevOps, DBA, תשתיות ו-IT, עד בדיקות קבלה ותמיכה בייצור",
          ],
        },
        {
          role: "מנתח מערכות",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "אפיון פתרון Web שחיבר בין יחידות עירוניות והפך תהליכים חוצי ארגון לאוטומטיים",
            "אפיון מסעות משתמשים וזרימות UX ו-UI ברמת המסך, מידול תהליכים ומבני נתונים, ותכנון ממשקי SQL ו-SSIS",
          ],
        },
        {
          role: "מנתח מערכות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "אפיון מערכות הליבה לניהול זהויות, מדרישות עסקיות ואבטחת מידע ועד תהליכים, ממשקים ואינטגרציות",
            "אפיון זרימות ומבני נתונים, והנחיית צוות פיתוח Web ב-Java וב-JSP עד העלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "אחריות על האפיון והמימוש בשכבת האפליקציה של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "אפיון לוגיקה עסקית, תהליכי אישור, מיפויי נתונים וסנכרון, וממשקים למערכות ארגוניות, בסיסי נתונים ושירותי Directory",
          ],
        },
        {
          role: "מנתח מערכות ונתונים",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "אפיון ופיתוח של מערכת ליבה לחיוב ארגוני ב-Microsoft SQL Server, Access ו-VBA",
            "תרגום שאלות עסקיות לשאילתות SQL, דוחות ואוטומציות, בעבודה מול כספים ותפעול",
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

    {
      type: "lines",
      title: "שפות",
      lines: ["עברית: שפת אם", "אנגלית: רמה בינונית, קריאה וכתיבה טכנית"],
    },

    {
      type: "entries",
      title: "שירות צבאי",
      entries: [{ title: "לוחם ומפקד", lines: ["חיל ההנדסה הקרבית | 1999 - 2002"] }],
    },
  ],
};
