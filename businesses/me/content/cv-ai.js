/* ==========================================================================
   The AI CV, twice: once in Hebrew (the one it was written for), once in English.

   THE SAME CAREER AS cv-analyst.js, TOLD FOR AI SOLUTIONS ARCHITECT /
   SOLUTIONS ARCHITECT / AI SOLUTIONS ENGINEER ROLES.

   Companies, dates and customers are identical to the other CVs. The titles of
   the salaried roles are the analyst CV's, which is the base document.

   WHAT IS CLAIMED, AND WHAT IS NOT
     - The headline places him in solution architecture. It does not say he held
       the title of AI Solutions Architect.
     - Claude is presented as the tool he builds software WITH, directed by him.
       Nothing here claims model training, LLM engineering, RAG or ML. Do not
       add any of that unless it is true.
     - Self-employed work sits in its own section, apart from salaried work.
     - NO NUMBER IN HERE WAS INVENTED. Dates for FLOA and for the management
       systems are not stated in the source, so they carry none.

   WHERE THEY LAND
     dist/cv/ai/index.html      ->  floa.co.il/cv/ai/
     dist/cv/ai/he/index.html   ->  floa.co.il/cv/ai/he/
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

const SUMMARY_EN = [
  "Experienced information systems professional with 15+ years in large enterprises across finance, healthcare, transportation and technology, and a B.Sc. in Industrial Engineering and Management.",
  "Designs software solutions end to end: the problem, the user experience, the architecture, the data model, the business logic and the integrations, and now also leads the implementation, building full-stack systems and mobile apps with Claude and other generative AI tools.",
  "Over the past year has independently built and shipped a mobile app and business systems: directing the AI tools, defining the behavior, reviewing every output and moving the work forward iteratively. Not an AI researcher or an ML engineer; the value is in turning a business need into a working system.",
];

const SUMMARY_HE = [
  "איש מערכות מידע מנוסה עם למעלה מ-15 שנות ניסיון בארגונים גדולים בתחומי הפיננסים, הבריאות, התחבורה והטכנולוגיה, ובוגר B.Sc. בהנדסת תעשייה וניהול.",
  "מתכנן פתרונות תוכנה מקצה לקצה: מהבנת הבעיה, דרך חוויית המשתמש, הארכיטקטורה, מודל הנתונים, הלוגיקה העסקית והאינטגרציות, ועד המימוש. היום מוביל גם את המימוש עצמו ובונה מערכות Full Stack ואפליקציות מובייל בעזרת Claude וכלי Generative AI נוספים.",
  "בשנה האחרונה פיתח באופן עצמאי אפליקציית מובייל ומערכות עסקיות: מנחה את כלי ה-AI, מגדיר את ההתנהגות הרצויה, בודק כל תוצר ומקדם את העבודה בצורה איטרטיבית. לא חוקר AI ולא מהנדס Machine Learning. הערך הוא היכולת להפוך צורך עסקי למערכת עובדת.",
];

/* --- English ---------------------------------------------------------------- */
export const aiEn = {
  ...address("ai", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Solutions Architect, Building Software End to End with AI",
    description: "CV of Ofir Aviram. 15+ years designing enterprise systems and integrations, now architecting and building full-stack software and mobile apps end to end with Claude and generative AI tools.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("ai", "en"),

  name: "Ofir Aviram",
  roles: [
    "Solutions Architect | Software Built End to End with Generative AI",
    "Systems Design, Full-Stack Development and Integrations",
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
          terms: ["End-to-End Solution Design", "Software Architecture", "Data Modeling", "APIs and Integrations", "Business Logic", "UX and UI Specification", "Security and Access Control"],
        },
        {
          title: "AI-Assisted Development",
          terms: ["Claude", "ChatGPT", "Directing AI Tools", "Prototyping", "Code Review", "Iterative Delivery"],
        },
        {
          title: "Full Stack",
          terms: ["React Native", "Expo", "TypeScript", "Node.js", "Deno", "Supabase", "Edge Functions", "PostgreSQL", "Row Level Security (RLS)", "Git"],
        },
        {
          title: "Enterprise Systems",
          terms: ["SQL", "Microsoft SQL Server", "Azure SQL", "Salesforce", "Priority ERP", "Workato", "ETL", "IAM", "IDM"],
        },
        {
          title: "Analysis and Delivery",
          terms: ["Functional and Technical Specifications", "HLD and DD", "UAT", "Agile", "Jira", "Stakeholder Management", "Production Deployment"],
        },
      ],
    },

    {
      type: "roles",
      title: "Independent Work",
      jobs: [
        {
          role: "Designer and Developer | Mobile App Built with AI",
          org: "Once | Self-Employed",
          dates: "2026 - Present",
          bullets: [
            "Designed and built a mobile app for location-based social meetups, end to end: the architecture, the business processes, the user experience and the screens, through development, testing and builds for mobile test distribution",
            "Developed with React Native and Expo, on Supabase, PostgreSQL, Edge Functions and TypeScript/Deno, and designed the data model and the access and security model with Row Level Security (RLS)",
            "Implemented real-time flows, detection of nearby users, matching mechanisms and a credit system",
            "Claude is the main tool in the process, and the work is directed by me: I define the requirements and the expected behavior, guide the AI in building it, review the output, solve problems and iterate",
          ],
          link: { label: "Live demo:", href: DEMO },
        },
        {
          role: "Designer and Developer | Management Systems and Digital Solutions",
          org: "Independent",
          dates: "",
          bullets: [
            "Designed and developed Web systems tailored to business needs: admin interfaces, forms, workflows and reports",
            "Designed the databases, the business logic and API integrations, in solutions for managing participants, sessions, payments, attendance and operational data",
            "Used AI tools to accelerate development and to implement the solutions",
          ],
        },
        {
          role: "Founder | Websites, Digital Systems and Automations",
          org: "FLOA | Self-Employed",
          dates: "",
          bullets: [
            "Designed and built websites and landing pages, including the user experience and interfaces",
            "Specified systems for managing leads, customers and business processes, and designed integrations and automations between services",
            "Used AI tools in specification, development and the improvement of digital solutions",
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
            "Responsible for the specification and delivery of cross-system business processes and automations across Priority ERP, Salesforce and Workato, from the business requirement through to production",
            "Specified the interfaces between the core systems down to data mapping, business logic and validations, and designed data structures and scheduled SQL and ETL processes",
            "Worked on the TQA quality management system, in an Azure SQL environment and in workflows that spanned enterprise systems and development tools",
          ],
        },
        {
          role: "Senior Systems Analyst | Web Portals and Core Identity Systems",
          org: "Brillix | Israel | Remote",
          dates: "2021 - 2025",
          bullets: [
            "Responsible for the specification and implementation of Web-based core Identity Management systems at Clalit Health Services, Migdal, Ayalon and LivePerson",
            "Designed the solution end to end: identity processes, the interfaces and data transformations between the portal and the core systems, and the ETL and synchronization processes",
            "Led delivery across cybersecurity, DevOps, DBA, infrastructure, IT and business teams, through acceptance testing and production support",
          ],
        },
        {
          role: "Systems Analyst | Web Solution, UX and UI Flows",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the specification of a Web solution connecting municipal departments and automating cross-organizational processes, with user journeys, UX and UI flows and the data structures behind them",
          ],
        },
        {
          role: "Systems Analyst | Core Identity Systems",
          org: "Amdocs | Israel",
          dates: "2017 - 2020",
          bullets: [
            "Specified the organization's core Identity Management systems, from business and information-security requirements through to processes, interfaces and integrations, and guided a Java and JSP Web development team to production",
          ],
        },
        {
          role: "Systems Analyst and Implementation Consultant | Core Identity Platforms",
          org: "ProLink Identity Management Architects | Israel",
          dates: "2014 - 2017",
          bullets: [
            "Owned the application-layer specification and implementation of the Aveksa IAM and Identity Governance platform at Harel, Migdal, Phoenix and Amdocs, including workflows, approval processes, data mappings and the interfaces to enterprise systems and databases",
          ],
        },
        {
          role: "Systems and Data Analyst | Core Billing Systems",
          org: "Varonis | Israel",
          dates: "2008 - 2014",
          bullets: [
            "Specified and developed a core enterprise billing system on Microsoft SQL Server, Microsoft Access and VBA, working directly with finance and operations",
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
    title: "אופיר אבירם | ארכיטקט פתרונות, בניית תוכנה מקצה לקצה בעזרת AI",
    description: "קורות החיים של אופיר אבירם. מעל 15 שנות ניסיון בתכנון מערכות ארגוניות ואינטגרציות, והיום גם תכנון ובנייה של מערכות Full Stack ואפליקציות מובייל מקצה לקצה בעזרת Claude וכלי Generative AI.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("ai", "he"),

  name: "אופיר אבירם",
  roles: [
    "ארכיטקט פתרונות | בניית תוכנה מקצה לקצה בעזרת Generative AI",
    "תכנון מערכות, פיתוח Full Stack ואינטגרציות",
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
          terms: ["תכנון פתרון מקצה לקצה", "ארכיטקטורת תוכנה", "מידול נתונים", "APIs ואינטגרציות", "לוגיקה עסקית", "אפיון UX ו-UI", "אבטחת מידע והרשאות"],
        },
        {
          title: "פיתוח בסיוע AI",
          terms: ["Claude", "ChatGPT", "הנחיית כלי AI", "אבות טיפוס", "סקירת קוד", "פיתוח איטרטיבי"],
        },
        {
          title: "פיתוח Full Stack",
          terms: ["React Native", "Expo", "TypeScript", "Node.js", "Deno", "Supabase", "Edge Functions", "PostgreSQL", "Row Level Security (RLS)", "Git"],
        },
        {
          title: "מערכות ארגוניות",
          terms: ["SQL", "Microsoft SQL Server", "Azure SQL", "Salesforce", "Priority ERP", "Workato", "ETL", "IAM", "IDM"],
        },
        {
          title: "ניתוח ואספקה",
          terms: ["אפיון פונקציונלי וטכני", "HLD ו-DD", "UAT", "Agile", "Jira", "ניהול בעלי עניין", "עלייה לייצור"],
        },
      ],
    },

    {
      type: "roles",
      title: "פעילות עצמאית",
      jobs: [
        {
          role: "מתכנן ומפתח | אפליקציית מובייל שנבנתה בעזרת AI",
          org: "Once | עצמאי",
          dates: "2026 - היום",
          bullets: [
            "תכנון ופיתוח מקצה לקצה של אפליקציית מובייל למפגשים חברתיים מבוססי מיקום: הארכיטקטורה, התהליכים העסקיים, חוויית המשתמש והמסכים, ועד פיתוח, בדיקות, פתרון תקלות והפצת גרסאות בדיקה במובייל",
            "פיתוח ב-React Native וב-Expo, על גבי Supabase, PostgreSQL, Edge Functions ו-TypeScript/Deno, ותכנון מודל הנתונים ומודל ההרשאות והאבטחה באמצעות Row Level Security (RLS)",
            "מימוש תהליכים בזמן אמת, זיהוי משתמשים בקרבת מקום, מנגנוני התאמה ומערכת קרדיטים",
            "Claude הוא הכלי המרכזי בתהליך, והעבודה מונחית על ידי: אני מגדיר את הדרישות ואת ההתנהגות הרצויה, מנחה את כלי ה-AI בביצוע, בודק את התוצרים, פותר בעיות ומקדם את הפיתוח בצורה איטרטיבית",
          ],
          link: { label: "הדגמה חיה:", href: DEMO },
        },
        {
          role: "מתכנן ומפתח | מערכות ניהול ופתרונות דיגיטליים",
          org: "פעילות עצמאית",
          dates: "",
          bullets: [
            "תכנון ופיתוח מערכות Web בהתאמה לצרכים עסקיים: ממשקי ניהול, טפסים, תהליכי עבודה ודוחות",
            "תכנון בסיסי נתונים, לוגיקה עסקית ואינטגרציות API, בפתרונות לניהול משתתפים, מפגשים, תשלומים, נוכחות ונתונים תפעוליים",
            "שימוש בכלי AI להאצת הפיתוח ולמימוש הפתרונות",
          ],
        },
        {
          role: "מקים ומפתח | אתרים, מערכות דיגיטל ואוטומציות",
          org: "FLOA | עצמאי",
          dates: "",
          bullets: [
            "תכנון ובניית אתרים ודפי נחיתה, כולל חוויית המשתמש וממשקי המשתמש",
            "אפיון מערכות לניהול לידים, לקוחות ותהליכים עסקיים, ותכנון אינטגרציות ואוטומציות בין שירותים ומערכות",
            "שימוש בכלי AI בתהליכי אפיון, פיתוח ושיפור של פתרונות דיגיטליים",
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
            "אחריות על האפיון והאספקה של תהליכים עסקיים ואוטומציות חוצי מערכות על גבי Priority ERP, Salesforce ו-Workato, מהדרישה העסקית ועד העלייה לייצור",
            "אפיון הממשקים בין מערכות הליבה, עד לרמת ה-Data Mapping, הלוגיקה העסקית והוולידציות, ותכנון מבני נתונים ותהליכי SQL ו-ETL מתוזמנים",
            "עבודה על מערכת TQA לניהול איכות, בסביבת Azure SQL ובתהליכי עבודה שכללו מערכות ארגוניות וכלי פיתוח",
          ],
        },
        {
          breakBefore: true,
          role: "מנתח מערכות בכיר | פורטלי Web ומערכות ליבה של זהויות",
          org: "בריליקס | מרחוק",
          dates: "2021 - 2025",
          bullets: [
            "אחריות על האפיון וההטמעה של מערכות ליבה לניהול זהויות מבוססות Web בשירותי בריאות כללית, מגדל, איילון ו-LivePerson",
            "תכנון הפתרון מקצה לקצה: תהליכי זהות, הממשקים וטרנספורמציות הנתונים בין הפורטל למערכות הליבה, ותהליכי ETL וסנכרון",
            "הובלת האספקה מול Cyber, DevOps, DBA, תשתיות, IT וגורמים עסקיים, עד בדיקות קבלה ותמיכה בייצור",
          ],
        },
        {
          role: "מנתח מערכות | פתרון Web, זרימות UX ו-UI",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת האפיון של פתרון Web שחיבר בין יחידות עירוניות והפך תהליכים חוצי ארגון לאוטומטיים, כולל מסעות משתמשים, זרימות UX ו-UI ומבני הנתונים שמאחוריהם",
          ],
        },
        {
          role: "מנתח מערכות | מערכות ליבה לניהול זהויות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "אפיון מערכות הליבה לניהול זהויות בארגון, מדרישות עסקיות ודרישות אבטחת מידע ועד תהליכים, ממשקים ואינטגרציות, והנחיית צוות פיתוח Web ב-Java וב-JSP עד לעלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות ויועץ הטמעה | פלטפורמות ליבה לניהול זהויות",
          org: "פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "אחריות מלאה על האפיון והמימוש בשכבת האפליקציה של פלטפורמת Aveksa לניהול זהויות וממשל הרשאות בהראל, מגדל, הפניקס ואמדוקס, כולל תהליכי עבודה, תהליכי אישור, מיפויי נתונים וממשקים למערכות ארגוניות ובסיסי נתונים",
          ],
        },
        {
          role: "מנתח מערכות ונתונים | מערכות ליבה לחיוב",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "אפיון ופיתוח של מערכת ליבה לחיוב ארגוני ב-Microsoft SQL Server, Microsoft Access ו-VBA, בעבודה ישירה מול גורמי כספים ותפעול",
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
