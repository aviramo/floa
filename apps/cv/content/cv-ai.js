/* ==========================================================================
   The AI CV, at /cv/ itself, in Hebrew and in English.

   POSITIONING (the owner, 2026-11-27, after enterprise feedback that the
   earlier version "sells you as a builder of simple, almost personal apps"):
   18 years in enterprise systems that evolved into designing and delivering
   software with AI agents. One career, not two chapters. The products are
   proof of engineering capability (architecture, tenant isolation, security,
   APIs, integrations, testing, releases), not the thing being sold.

   THE SHAPE (two pages at most)
     1. Headline and summary: enterprise systems plus AI-driven development,
        and what that brings to an organization.
     2. Capabilities, including enterprise systems and integration.
     3. FLOA, then its engineering case studies, so the AI work is on page
        one: three products in depth, each led by the business need it
        answers, and the rest in brief. The shared platform sits in FLOA.
     4. Enterprise systems experience, every company, with real weight.
     5. Education, service, languages.

   WHAT IS CLAIMED, AND WHAT IS NOT
     - No enterprise AI experience is claimed: the AI work is FLOA's. The
       organizational value is stated as what is offered, not as past results.
     - Independent products are never called enterprise systems.
     - Facts come from the code, the live database and the owner's other CV
       versions (cv-architect.js for titles and enterprise bullets): roster's
       tenant isolation, staff and participant access, the events queue fed by
       database triggers, 296 API tests and 855 UI checks; chords' Claude API
       structured output, evaluation script, durable Workflows and cost
       ceiling; biodanza's Durable Objects relay, pg_net triggers, private
       audio behind sign-in, 577 exercises and 2,723 tracks.
     - NO RAG, no embeddings, no model training, no fine-tuning.
     - No Salesforce and no Priority ERP, as in cv-analyst.js.
     - Voice: nominal, no first and no third person. No parentheses inside
       Hebrew lines. **text** is set in bold by the resume component.

   WHERE THEY LAND
     dist/cv/index.html         ->  floa.co.il/cv/      (Hebrew, the default)
     dist/cv/en/index.html      ->  floa.co.il/cv/en/   (English)
   Its PDFs sit in cv/ai/ and are printed by scripts/gen_cv_pdf.mjs
   (npm run cv). Print them again after any change here.
   ========================================================================== */
import { CONTACT, DEMO, SHARE_IMAGE, SHARE_TITLE, address, pdf } from "./cv-shared.js";

/* The share card's description is the first paragraph, so it has to stand on
   its own. */
const SUMMARY_EN = [
  "Design and delivery of complex business software with AI agents, built on 18 years in enterprise systems at Amdocs, Varonis, Clalit, Migdal and Tidhar: requirements, solution architecture, integrations, data and controlled delivery to production.",
  "Enterprise depth and systems thinking with the speed of AI-driven delivery: at FLOA, agents work under specifications, automated tests, human review and controlled releases, a method teams can adopt.",
];

const SUMMARY_HE = [
  "תכנון ופיתוח של תוכנה עסקית מורכבת באמצעות סוכני AI, על בסיס 18 שנות ניסיון במערכות ארגוניות באמדוקס, Varonis, כללית, מגדל ותדהר: דרישות, ארכיטקטורת פתרון, אינטגרציות, נתונים ועלייה מבוקרת לייצור.",
  "עומק וחשיבה מערכתית מעולם המערכות הארגוניות, יחד עם המהירות של פיתוח באמצעות AI: ב-FLOA הסוכנים עובדים לפי אפיון, בדיקות אוטומטיות, בקרה אנושית ושחרור מבוקר, שיטה שצוותי פיתוח יכולים לאמץ.",
];

const SKILLS = {
  ai: ["Claude Code", "Multi-Agent Workflows", "Specification-Driven Development", "Human Review and Approval Gates", "Change Control", "Cost Control"],
  llm: ["Claude API", "Structured Outputs", "Multimodal Input", "Prompt and Context Engineering", "LLM Evaluation", "OCR"],
  arch: ["Multi-Tenant Architecture", "Tenant Isolation with Row Level Security", "API Design", "Webhooks", "Event-Driven Processes", "Data Modeling", "PostgreSQL"],
  enterprise: ["Solution Design", "Business Requirements", "System Integrations", "ETL", "SQL Server", "Azure SQL", "Workato", "Identity and Access Management"],
  platforms: ["Cloudflare Workers", "Durable Objects", "R2", "Supabase", "React Native", "JavaScript", "TypeScript", "Playwright", "CI/CD"],
};

/* --- English ---------------------------------------------------------------- */
export const aiEn = {
  ...address("", "en"),
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | AI-Native Software Engineer, Enterprise Systems",
    description: "CV of Ofir Aviram. AI-Native Software Engineer designing and delivering complex business software with AI agents, built on 18 years in enterprise systems at Amdocs, Varonis, Clalit, Migdal and Tidhar.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_EN[0], locale: "en_US", image: SHARE_IMAGE },
  download: pdf("ai", "en"),

  name: "Ofir Aviram",
  roles: [
    "AI-Native Software Engineer | Enterprise Systems and AI-Driven Development",
    "Business software delivered with AI agents, on 18 years of enterprise solution design",
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
      title: "Capabilities",
      groups: [
        { title: "AI-Driven Development", terms: SKILLS.ai },
        { title: "LLM in Products", terms: SKILLS.llm },
        { title: "Architecture, Security and Data", terms: SKILLS.arch },
        { title: "Enterprise Systems and Integration", terms: SKILLS.enterprise },
        { title: "Platforms", terms: SKILLS.platforms },
      ],
    },

    {
      type: "roles",
      title: "Professional Experience",
      jobs: [
        {
          role: "Founder and Software Engineer | AI-Driven Development",
          org: "FLOA | Independent technology practice",
          dates: "2026 - Present",
          bullets: [
            "Enterprise solution design applied to AI-driven development: **seven products and systems built during 2026 by a single engineer** on one multi-tenant platform, from SaaS in commercial use to a mobile beta",
            "An engineering process for AI agents: specifications, defined roles, human approval of every change, automated tests, a staging environment aligned with production, rollback plans and versioned releases",
            "A shared platform under all products: reusable UI components with design tokens and automated audits, shared Google sign-in, a media store on Cloudflare R2 with signed URLs, and CI that gates every release",
          ],
          link: { label: "Website:", text: "floa.co.il", href: "https://floa.co.il/" },
        },
      ],
    },

    {
      type: "roles",
      title: "Engineering Case Studies at FLOA",
      jobs: [
        {
          role: "Roster | Multi-Tenant SaaS with a Public API",
          lead: "Registration, payments and attendance for businesses that run events, connected to their own websites",
          bullets: [
            "Tenant data isolation enforced in the database with PostgreSQL Row Level Security, and separate access models for business staff and for participants",
            "A versioned public REST API held as a frozen contract for external websites: public and secret keys, allowed origins, signed webhooks and a uniform error model",
            "Event-driven processes: database triggers feed a queue that sends emails and webhooks, with **296 API tests** and **855 UI checks** on a staging environment",
          ],
          link: { label: "API docs:", text: "roster.floa.co.il/api", href: "https://roster.floa.co.il/api/" },
        },
        {
          role: "Chords | LLM Integrated into a Product",
          lead: "Turns photos and PDFs of chord sheets into structured, editable songs, instead of retyping them by hand",
          bullets: [
            "Claude API with multimodal input and structured output, combined with Google Vision OCR geometry",
            "Quality by measurement: an evaluation script scores every read against a hand-corrected ground truth, and long reads run as durable Cloudflare Workflows under a per-read cost ceiling",
          ],
          link: { label: "Product link:", text: "chords.floa.co.il", href: "https://chords.floa.co.il/" },
        },
        {
          role: "Biodanza Studio | Realtime Collaborative Application",
          lead: "Lets facilitators plan and run movement sessions together, with a full exercise and music catalog at hand",
          bullets: [
            "Realtime co-editing with presence over a WebSocket relay on Cloudflare Durable Objects, fed by database change notifications, with polling as a fallback",
            "**577 exercises** and **2,700+ tracks**, private audio behind sign-in and an allowlist, and offline mode",
          ],
          link: { label: "Product link:", text: "biodanza.floa.co.il", href: "https://biodanza.floa.co.il/" },
        },
        {
          role: "Additional Products",
          bullets: [
            "Once, a social mobile app in beta on Google Play; a scripted campaign chatbot with a versioned editor and step-level analytics; landing pages connected to Roster by API; promo videos generated in code",
          ],
          link: [
            { label: "Links:", text: "once.floa.co.il", href: DEMO },
            { text: "chatbot.floa.co.il", href: "https://chatbot.floa.co.il/" },
            { text: "harpatka.co.il", href: "https://harpatka.co.il/" },
            { text: "aum.floa.co.il", href: "https://aum.floa.co.il/" },
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "Enterprise Systems Experience",
      jobs: [
        {
          role: "Senior Systems Analyst | Integration and Solution Design",
          org: "Tidhar Group",
          dates: "2025 - 2026",
          bullets: [
            "Cross-system processes, automations and integrations in Workato, from requirement to production",
            "Integration architecture: mappings, business logic, interfaces, and scheduled SQL and ETL in Azure SQL",
          ],
        },
        {
          role: "Senior Systems Analyst | Enterprise Solution Design",
          org: "Brillix, for Clalit, Migdal, Ayalon and LivePerson",
          dates: "2021 - 2025",
          bullets: [
            "End-to-end design of enterprise identity management solutions, at Clalit covering **every employee**: processes, interfaces, mappings and ETL",
            "Led delivery across cybersecurity, DBA, DevOps, infrastructure, IT and business teams to production",
          ],
        },
        {
          role: "Systems Analyst | Web Solutions and Process Automation",
          org: "Tel Aviv-Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Designed a Web solution linking municipal departments and automating workflows, with SQL and SSIS",
          ],
        },
        {
          role: "Systems Analyst and Technical Lead | Core Identity Systems",
          org: "Amdocs",
          dates: "2017 - 2020",
          bullets: [
            "Designed the organization's identity management solution for **30,000+ employees**, from business and security requirements to processes, business logic, interfaces and integrations",
            "Designed system workflows and data flows, and guided a Java Web team to production",
          ],
        },
        {
          role: "Implementation Consultant and Solution Developer",
          org: "ProLink, for Harel, Migdal, Phoenix and Amdocs",
          dates: "2014 - 2017",
          bullets: [
            "Implemented an identity governance platform: business logic, approvals, data mappings and integrations",
          ],
        },
        {
          role: "Software Developer | Enterprise Billing Systems",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "Developed an enterprise billing platform on SQL Server: queries, reports and automations",
          ],
        },
      ],
    },

    {
      type: "entries",
      title: "Education, Service and Languages",
      entries: [
        {
          title: "B.SC. INDUSTRIAL ENGINEERING AND MANAGEMENT",
          lines: ["Information Systems, Ben-Gurion University of the Negev | 2004 - 2008"],
        },
        { title: "PRODUCT MANAGEMENT PROGRAM, PRODUCT EXPERTS | 2021", lines: [] },
        { title: "COMBAT SOLDIER AND COMMANDER, COMBAT ENGINEERING CORPS | 1999 - 2002", lines: [] },
        { title: "LANGUAGES: HEBREW, NATIVE. ENGLISH, FOR TECHNICAL WORK", lines: [] },
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
    title: "אופיר אבירם | AI-Native Software Engineer, מערכות ארגוניות",
    description: "קורות החיים של אופיר אבירם. תכנון ופיתוח של תוכנה עסקית מורכבת באמצעות סוכני AI, על בסיס 18 שנות ניסיון במערכות ארגוניות באמדוקס, Varonis, כללית, מגדל ותדהר.",
  },

  share: { title: SHARE_TITLE, description: SUMMARY_HE[0], locale: "he_IL", image: SHARE_IMAGE },
  download: pdf("ai", "he"),

  name: "אופיר אבירם",
  roles: [
    "AI-Native Software Engineer",
    "פיתוח תוכנה עסקית באמצעות סוכני AI, על בסיס 18 שנות תכנון פתרונות במערכות ארגוניות",
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
      title: "יכולות מקצועיות",
      groups: [
        { title: "פיתוח באמצעות סוכני AI", terms: SKILLS.ai },
        { title: "LLM בתוך מוצרים", terms: SKILLS.llm },
        { title: "ארכיטקטורה, אבטחה ונתונים", terms: SKILLS.arch },
        { title: "מערכות ארגוניות ואינטגרציה", terms: SKILLS.enterprise },
        { title: "פלטפורמות", terms: SKILLS.platforms },
      ],
    },

    {
      type: "roles",
      title: "ניסיון מקצועי",
      jobs: [
        {
          role: "מייסד ומהנדס תוכנה | פיתוח באמצעות AI",
          org: "FLOA | פעילות טכנולוגית עצמאית",
          dates: "2026 - היום",
          bullets: [
            "תכנון פתרונות ארגוני שמיושם בפיתוח באמצעות AI: **שבעה מוצרים ומערכות שנבנו במהלך 2026 בידי מהנדס אחד** על פלטפורמה Multi-tenant אחת, ממערכת SaaS בשימוש מסחרי ועד אפליקציית מובייל בבטא",
            "תהליך הנדסי לסוכני AI: אפיון, תפקידים מוגדרים, אישור אנושי של כל שינוי, בדיקות אוטומטיות, סביבת Staging מיושרת לייצור, תוכניות Rollback ושחרורים בגרסאות",
            "פלטפורמה משותפת לכל המוצרים: רכיבי UI לשימוש חוזר עם אסימוני עיצוב ובדיקות אוטומטיות, התחברות Google משותפת, אחסון מדיה ב-Cloudflare R2 עם כתובות חתומות, ו-CI שמאשר כל שחרור",
          ],
          link: { label: "אתר:", text: "floa.co.il", href: "https://floa.co.il/" },
        },
      ],
    },

    {
      type: "roles",
      title: "מקרי בוחן הנדסיים ב-FLOA",
      jobs: [
        {
          role: "Roster | מערכת SaaS מרובת לקוחות עם API ציבורי",
          lead: "מענה להרשמה, תשלומים ונוכחות לעסקים שמקיימים מפגשים, מחובר לאתרים של העסקים עצמם",
          bullets: [
            "בידוד נתונים בין לקוחות שנאכף בבסיס הנתונים ב-Row Level Security של PostgreSQL, ומודלי גישה נפרדים לצוות העסק ולמשתתפים",
            "REST API ציבורי בגרסאות שנשמר כחוזה מוקפא לאתרים חיצוניים: מפתחות ציבוריים וסודיים, Origins מורשים, Webhooks חתומים ומודל שגיאות אחיד",
            "תהליכים מונחי אירועים: טריגרים בבסיס הנתונים מזינים תור ששולח מיילים ו-Webhooks, עם **296 בדיקות API** ו-**855 בדיקות ממשק** בסביבת Staging",
          ],
          link: { label: "תיעוד ה-API:", text: "roster.floa.co.il/api", href: "https://roster.floa.co.il/api/" },
        },
        {
          role: "Chords | שילוב LLM בתוך מוצר",
          lead: "הופכת צילומים וקובצי PDF של דפי אקורדים לשירים מובנים שאפשר לערוך, במקום הקלדה ידנית",
          bullets: [
            "הבנת מסמכים עם Claude API, קלט מולטימודלי ופלט מובנה, בשילוב הגאומטריה של OCR מ-Google Vision",
            "איכות לפי מדידה: סקריפט הערכה מנקד כל קריאה מול אמת מידה שתוקנה ביד, וקריאות ארוכות רצות כ-Cloudflare Workflows עמידים תחת תקרת עלות לכל קריאה",
          ],
          link: { label: "קישור למוצר:", text: "chords.floa.co.il", href: "https://chords.floa.co.il/" },
        },
        {
          role: "סטודיו ביודנסה | אפליקציה שיתופית בזמן אמת",
          lead: "מאפשרת למנחים לתכנן ולהעביר מפגשי תנועה יחד, עם קטלוג מלא של תרגילים ומוזיקה בהישג יד",
          bullets: [
            "עריכה משותפת בזמן אמת עם נוכחות דרך ממסר WebSocket על Cloudflare Durable Objects, שמוזן מהתראות על שינויים בבסיס הנתונים, עם Polling כגיבוי",
            "**577 תרגילים** ו**יותר מ-2,700 שירים**, אודיו פרטי מאחורי התחברות ורשימת הרשאות, ועבודה בלי אינטרנט",
          ],
          link: { label: "קישור למוצר:", text: "biodanza.floa.co.il", href: "https://biodanza.floa.co.il/" },
        },
        {
          role: "מוצרים נוספים",
          bullets: [
            "Once, אפליקציית מובייל חברתית בבטא ב-Google Play; צ'אטבוט תסריטים לקמפיינים עם עורך גרסאות ומדידה לפי שלב; דפי נחיתה שמחוברים ל-Roster דרך API; סרטוני תדמית שנוצרים בקוד",
          ],
          link: [
            { label: "קישורים:", text: "once.floa.co.il", href: DEMO },
            { text: "chatbot.floa.co.il", href: "https://chatbot.floa.co.il/" },
            { text: "harpatka.co.il", href: "https://harpatka.co.il/" },
            { text: "aum.floa.co.il", href: "https://aum.floa.co.il/" },
          ],
        },
      ],
    },

    {
      type: "roles",
      title: "ניסיון במערכות ארגוניות",
      jobs: [
        {
          role: "מנתח מערכות בכיר | אינטגרציה ותכנון פתרונות",
          org: "קבוצת תדהר",
          dates: "2025 - 2026",
          bullets: [
            "תהליכים עסקיים, אוטומציות ואינטגרציות חוצות מערכות ב-Workato, מהדרישה ועד הייצור",
            "ארכיטקטורת אינטגרציה: מיפויי נתונים, לוגיקה עסקית, ממשקים, ותהליכי SQL ו-ETL מתוזמנים ב-Azure SQL",
          ],
        },
        {
          role: "מנתח מערכות בכיר | תכנון פתרונות ארגוניים",
          org: "בריליקס, עבור כללית, מגדל, איילון ו-LivePerson",
          dates: "2021 - 2025",
          bullets: [
            "תכנון מקצה לקצה של פתרונות ארגוניים מבוססי Web לניהול זהויות, בכללית ל**כל עובדי הארגון**: תהליכים, ממשקים, טרנספורמציות ומיפויי נתונים ו-ETL, עם האפיון הפונקציונלי והטכני",
            "הובלת האספקה מול צוותי סייבר, DBA, DevOps, תשתיות, IT והעסק, עד הייצור",
          ],
        },
        {
          role: "מנתח מערכות | פתרונות Web ואוטומציה של תהליכים",
          org: "עיריית תל אביב-יפו",
          dates: "2020 - 2021",
          bullets: [
            "תכנון פתרון Web שחיבר בין יחידות עירוניות והפך את התהליכים שלהן לאוטומטיים, עם SQL ו-SSIS",
          ],
        },
        {
          role: "מנתח מערכות ו-Technical Lead | מערכות ליבה לניהול זהויות",
          org: "אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "תכנון פתרון ניהול הזהויות של הארגון ל**יותר מ-30,000 עובדים**, מדרישות עסקיות ואבטחת מידע ועד תהליכים, לוגיקה עסקית, ממשקים ואינטגרציות",
            "תכנון זרימות מערכת וזרימות נתונים, והנחיית צוות Web ב-Java עד הייצור",
          ],
        },
        {
          role: "יועץ הטמעה ומפתח פתרונות",
          org: "פרולינק, עבור הראל, מגדל, הפניקס ואמדוקס",
          dates: "2014 - 2017",
          bullets: [
            "תכנון והטמעה ברמת האפליקציה של פלטפורמה ארגונית לממשל זהויות: לוגיקה עסקית, תהליכים, אישורים, מיפויי נתונים, סנכרון ואינטגרציות עם מערכות ארגוניות",
          ],
        },
        {
          role: "מפתח תוכנה | מערכות חיוב ארגוניות",
          org: "Varonis",
          dates: "2008 - 2014",
          bullets: [
            "פיתוח פלטפורמת חיוב ארגונית ב-SQL Server: שאילתות, דוחות ואוטומציות",
          ],
        },
      ],
    },

    {
      type: "entries",
      title: "השכלה, שירות ושפות",
      entries: [
        {
          title: "B.Sc. בהנדסת תעשייה וניהול",
          lines: ["מערכות מידע, אוניברסיטת בן גוריון בנגב | 2004 - 2008"],
        },
        { title: "תוכנית ניהול מוצר, Product Experts | 2021", lines: [] },
        { title: "לוחם ומפקד, חיל ההנדסה הקרבית | 1999 - 2002", lines: [] },
        { title: "שפות: עברית שפת אם, אנגלית לעבודה טכנית", lines: [] },
      ],
    },
  ],
};
