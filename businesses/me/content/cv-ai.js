/* ==========================================================================
   The AI CV, twice: once in Hebrew (the one it was written for), once in English.

   THE SAME CAREER AS cv-analyst.js, TOLD FOR AI SOLUTIONS ARCHITECT /
   SOLUTIONS ARCHITECT / AI SOLUTIONS ENGINEER ROLES.

   Companies, dates and customers are identical to the other CVs. The titles of
   the salaried roles are the analyst CV's, which is the base document.

   WHAT IS CLAIMED, AND WHAT IS NOT
     - The headline names the specialisation. It does not say he held the title
       of AI Solutions Architect.
     - Claude is named ONCE, at the head of the independent section, as the tool
       software is built with. Nothing here claims model training, LLM
       engineering, RAG or ML. Do not add any of that unless it is true.
     - Voice: nominal, no first person ("I define", "I direct") and no "alone".
     - Only systems that were really built are listed. A design that never
       became a system is not.
     - NO NUMBER IN HERE WAS INVENTED.

   WHERE THEY LAND
     dist/cv/index.html         ->  floa.co.il/cv/      (Hebrew, the default)
     dist/cv/en/index.html      ->  floa.co.il/cv/en/   (English)
   Its PDFs sit in cv/ai/, which is a folder of files and not a page.
   ========================================================================== */
import { CONTACT, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

const SUMMARY_EN = [
  "Solutions Architect with 15+ years in enterprise information systems across finance, healthcare, transportation and technology, and a B.Sc. in Industrial Engineering and Management.",
  "Combines business understanding, software architecture, data models and integrations with hands-on full-stack development: designing and building complex systems end to end, from the business need to production.",
  "Uses Generative AI as a tool for leading software development efficiently and independently, on top of years of architectural experience: a mobile app, management systems and websites built in practice.",
];

const SUMMARY_HE = [
  "ארכיטקט פתרונות עם למעלה מ-15 שנות ניסיון במערכות מידע ארגוניות בתחומי הפיננסים, הבריאות, התחבורה והטכנולוגיה, ובוגר B.Sc. בהנדסת תעשייה וניהול.",
  "שילוב של הבנה עסקית, ארכיטקטורת תוכנה, מודלי נתונים ואינטגרציות עם יכולת פיתוח Full Stack מעשית: תכנון ומימוש של מערכות מורכבות מקצה לקצה, מהצורך העסקי ועד הפצה לייצור.",
  "שימוש ב-Generative AI ככלי להובלת פיתוח תוכנה ביעילות ובעצמאות, על גבי ידע ארכיטקטוני וניסיון של שנים: אפליקציית מובייל, מערכות ניהול ואתרים שפותחו בפועל.",
];

/* --- English ---------------------------------------------------------------- */
export const aiEn = {
  ...address("", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | AI Solutions Architecture, Full Stack and AI-Assisted Development",
    description: "CV of Ofir Aviram. Solutions Architect with 15+ years in enterprise information systems, designing and building complex software end to end with Generative AI: architecture, data models, integrations and full-stack development.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("ai", "en"),

  name: "Ofir Aviram",
  roles: [
    "AI Solutions Architecture | Full Stack Development | AI-Assisted Software Development",
    "Solutions Architect with 15+ years in enterprise information systems",
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
          title: "Solution Architecture",
          terms: ["System Design", "Database Architecture", "API Integration", "UX/UI Design", "Business Process Automation", "Security and Access Control"],
        },
        {
          title: "AI-Assisted Development and Full Stack",
          terms: ["Claude", "ChatGPT", "TypeScript", "React Native", "Expo", "Node.js", "Deno", "Supabase", "PostgreSQL", "Edge Functions", "Row Level Security (RLS)", "Git"],
        },
        {
          title: "Enterprise Systems",
          terms: ["Microsoft SQL Server", "Azure SQL", "ETL", "IAM and IDM", "Systems Analysis", "HLD and DD", "Integration Design", "Salesforce", "Priority ERP", "Workato", "UAT"],
        },
      ],
    },

    {
      type: "roles",
      title: "Independent Experience",
      jobs: [
        {
          role: "Design and Development of End-to-End Software Solutions",
          org: "FLOA | Independent",
          dates: "2025 - Present",
          bullets: [
            "End-to-end design and development of systems, in full-stack work with Generative AI, mainly Claude: leading the development, specifying requirements and behavior, quality control of every output, and responsibility for architecture, testing and release",
            "Once, a social mobile app for Android and iOS: system architecture, data model and permissions with Row Level Security, built in React Native, Expo, TypeScript, Supabase and PostgreSQL. Location-based matching, real-time communication, chat, groups and a credit system, through testing and release to the app stores",
            "A multi-tenant system for managing participants, sessions, payments and subscriptions: data model and business logic, an admin interface and a personal area for participants, email and WhatsApp communication, and separation between businesses at the database level. A public API with keys and signed webhooks for integration with external websites",
            "A chords and songs application: a song index, a page per song and an editor, Google sign-in, reading songs from images with the Claude API, and pre-built song pages for organic search",
            "Conversion-focused websites and landing pages integrated with paid advertising on Meta and Google Ads: sign-up forms, lead creation, source tracking and campaign measurement, alongside a site and sign-up flows for meetups and events",
            "Under FLOA: specification and development of digital solutions for businesses, admin interfaces, lead and customer management, and business automations",
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "Professional Experience",
      jobs: [
        {
          role: "Senior Systems Analyst | Web Applications and Core System Interfaces",
          org: "Tidhar Group | Israel | Hybrid",
          dates: "2025 - 2026",
          bullets: [
            "Responsible for the design and delivery of cross-system business processes and automations across Priority ERP, Salesforce and Workato, from the business requirement through to production",
            "Designed the integration architecture between the core systems: data mapping, business logic, validations and interfaces, with data structures and scheduled SQL and ETL processes",
            "Worked on the TQA quality management system, in an Azure SQL environment and in workflows that spanned enterprise systems and development tools",
            "Worked with business owners, IT teams, developers and vendors through specification, testing and implementation",
          ],
        },
        {
          breakBefore: true,
          role: "Senior Systems Analyst | Web Portals and Core Identity Systems",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Responsible for the design and implementation of Web-based core Identity Management systems at Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Designed the solution end to end: identity processes, the interfaces and data transformations between the portal and the core systems, data structures and ETL and synchronization processes",
            "Led delivery across cybersecurity, DevOps, DBA, infrastructure, IT and business teams, through acceptance testing, implementation and production support",
          ],
        },
        {
          role: "Systems Analyst | Web Solution, UX and UI Flows",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the design of a Web solution connecting municipal departments and automating cross-organizational processes, with user journeys, UX and UI flows and the data structures behind them",
            "Designed SQL and SSIS interfaces and worked with users, development, DBA and QA through acceptance testing",
          ],
        },
        {
          role: "Systems Analyst | Core Identity Systems",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Specified the organization's core Identity Management systems, from business and information-security requirements through to processes, interfaces and integrations",
            "Designed system processes, data flows and data structures, and guided a Java and JSP Web development team through implementation and production delivery",
          ],
        },
        {
          role: "Systems Analyst and Implementation Consultant | Core Identity Platforms",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Owned the application-layer design and implementation of the Aveksa IAM and Identity Governance platform at Harel, Migdal, Phoenix and Amdocs",
            "Built business logic, workflows, approval processes, data mappings and synchronization processes, and the integrations to enterprise systems, databases and directory services",
          ],
        },
        {
          role: "Systems and Data Analyst | Core Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Specified and developed a core enterprise billing system on Microsoft SQL Server, Microsoft Access and VBA",
            "Turned business questions into SQL queries, reports and automations, working directly with finance and operations",
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
  ...address("", "he"),
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | ארכיטקטורת פתרונות AI, פיתוח Full Stack ופיתוח תוכנה בסיוע AI",
    description: "קורות החיים של אופיר אבירם. ארכיטקט פתרונות עם למעלה מ-15 שנות ניסיון במערכות מידע ארגוניות, שמתכנן ובונה מערכות תוכנה מורכבות מקצה לקצה בעזרת Generative AI: ארכיטקטורה, מודלי נתונים, אינטגרציות ופיתוח Full Stack.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("ai", "he"),

  name: "אופיר אבירם",
  roles: [
    "ארכיטקטורת פתרונות AI | פיתוח Full Stack | פיתוח תוכנה בסיוע AI",
    "ארכיטקט פתרונות עם למעלה מ-15 שנות ניסיון במערכות מידע ארגוניות",
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
          title: "ארכיטקטורת פתרונות",
          terms: ["System Design", "Database Architecture", "API Integration", "UX/UI Design", "אוטומציה של תהליכים עסקיים", "אבטחת מידע והרשאות"],
        },
        {
          title: "פיתוח בסיוע AI ו-Full Stack",
          terms: ["Claude", "ChatGPT", "TypeScript", "React Native", "Expo", "Node.js", "Deno", "Supabase", "PostgreSQL", "Edge Functions", "Row Level Security (RLS)", "Git"],
        },
        {
          title: "מערכות ארגוניות",
          terms: ["Microsoft SQL Server", "Azure SQL", "ETL", "IAM ו-IDM", "ניתוח מערכות", "HLD ו-DD", "תכנון אינטגרציות", "Salesforce", "Priority ERP", "Workato", "UAT"],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון עצמאי",
      jobs: [
        {
          role: "תכנון ופיתוח פתרונות תוכנה מקצה לקצה",
          org: "FLOA | עצמאי",
          dates: "2025 - היום",
          bullets: [
            "תכנון ופיתוח מערכות מקצה לקצה, בפיתוח Full Stack בשילוב Generative AI, בעיקר Claude: הובלת הפיתוח, אפיון הדרישות וההתנהגות, בקרת איכות על כל תוצר ואחריות על ארכיטקטורה, בדיקות והפצה",
            "Once, אפליקציית מובייל חברתית ל-Android ול-iOS: ארכיטקטורת מערכת, מודל נתונים והרשאות באמצעות Row Level Security, ופיתוח ב-React Native, Expo, TypeScript, Supabase ו-PostgreSQL. מימוש התאמות מבוססות מיקום, תקשורת בזמן אמת, צ'אט, קבוצות ומערכת קרדיטים, עד בדיקות והפצה לחנויות האפליקציות",
            "מערכת Multi-tenant לניהול משתתפים, מפגשים, תשלומים ומנויים: מודל נתונים ולוגיקה עסקית, ממשק ניהול ואזור אישי למשתתפים, תקשורת במייל ובוואטסאפ, והפרדה בין עסקים ברמת בסיס הנתונים. API ציבורי עם מפתחות ו-Webhooks חתומים לאינטגרציה עם אתרים חיצוניים",
            "אפליקציית אקורדים ושירים: אינדקס שירים, דף לכל שיר ועורך, התחברות עם Google, קריאת שירים מתמונה באמצעות Claude API, ובנייה מראש של דפי השירים לקידום אורגני",
            "אתרים ודפי נחיתה ממוקדי המרות עם אינטגרציה לפרסום ממומן ב-Meta וב-Google Ads: טפסי הרשמה, יצירת לידים, מעקב אחר מקורות הגעה ומדידת קמפיינים, לצד אתר ותהליכי הצטרפות למפגשים ולאירועים",
            "במסגרת FLOA: אפיון ופיתוח פתרונות דיגיטליים לעסקים, ממשקי ניהול, ניהול לידים ולקוחות ואוטומציות עסקיות",
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מנתח מערכות בכיר | אפליקציות Web וממשקים למערכות ליבה",
          org: "קבוצת תדהר | היברידי",
          dates: "2025 - 2026",
          bullets: [
            "אחריות על התכנון והאספקה של תהליכים עסקיים ואוטומציות חוצי מערכות על גבי Priority ERP, Salesforce ו-Workato, מהדרישה העסקית ועד העלייה לייצור",
            "תכנון ארכיטקטורת האינטגרציה בין מערכות הליבה: Data Mapping, לוגיקה עסקית, ולידציות וממשקים, לצד מבני נתונים ותהליכי SQL ו-ETL מתוזמנים",
            "עבודה על מערכת TQA לניהול איכות, בסביבת Azure SQL ובתהליכי עבודה שכללו מערכות ארגוניות וכלי פיתוח",
            "עבודה מול גורמים עסקיים, צוותי IT, מפתחים וספקים לאורך האפיון, הבדיקות וההטמעה",
          ],
        },
        {
          breakBefore: true,
          role: "מנתח מערכות בכיר | פורטלי Web ומערכות ליבה של זהויות",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אחריות על התכנון וההטמעה של מערכות ליבה לניהול זהויות מבוססות Web בשירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "תכנון הפתרון מקצה לקצה: תהליכי זהות, הממשקים וטרנספורמציות הנתונים בין הפורטל למערכות הליבה, מבני נתונים ותהליכי ETL וסנכרון",
            "הובלת האספקה מול Cyber, DevOps, DBA, תשתיות, IT וגורמים עסקיים, עד בדיקות קבלה ותמיכה בייצור",
          ],
        },
        {
          role: "מנתח מערכות | פתרון Web, זרימות UX ו-UI",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת התכנון של פתרון Web שחיבר בין יחידות עירוניות והפך תהליכים חוצי ארגון לאוטומטיים, כולל מסעות משתמשים, זרימות UX ו-UI ומבני הנתונים שמאחוריהם",
            "תכנון ממשקי SQL ו-SSIS ועבודה מול משתמשים, פיתוח, DBA ו-QA עד בדיקות קבלה",
          ],
        },
        {
          role: "מנתח מערכות | מערכות ליבה לניהול זהויות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "אפיון מערכות הליבה לניהול זהויות בארגון, מדרישות עסקיות ודרישות אבטחת מידע ועד תהליכים, ממשקים ואינטגרציות",
            "תכנון תהליכי מערכת, זרימות נתונים ומבני נתונים, והנחיית צוות פיתוח Web ב-Java וב-JSP עד ליישום ולעלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה | פלטפורמות ליבה לניהול זהויות",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "אחריות מלאה על התכנון והמימוש בשכבת האפליקציה של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס",
            "בניית לוגיקה עסקית, תהליכי עבודה, תהליכי אישור, מיפויי נתונים ותהליכי סנכרון, ואינטגרציות למערכות ארגוניות, בסיסי נתונים ושירותי Directory",
          ],
        },
        {
          role: "מנתח מערכות ונתונים | מערכות ליבה לחיוב",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "אפיון ופיתוח של מערכת ליבה לחיוב ארגוני ב-Microsoft SQL Server, Microsoft Access ו-VBA",
            "תרגום שאלות עסקיות לשאילתות SQL, דוחות ואוטומציות, בעבודה ישירה מול גורמי כספים ותפעול",
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
      type: "entries",
      title: "שירות צבאי",
      entries: [{ title: "לוחם ומפקד", lines: ["חיל ההנדסה הקרבית | 1999 - 2002"] }],
    },
  ],
};
