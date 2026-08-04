/* ==========================================================================
   The CV, twice: once in English, once in Hebrew.

   Two documents, one structure. Everything below is copy and data — the way it
   is DRAWN lives in src/components/resume/, so the two versions can never drift
   apart in anything but language. Change the layout once and both change.

   Dates are years only, no months, exactly as they appear on the source
   document. They are written with a plain hyphen and rendered inside a dir="ltr"
   span, so "2014 - 2017" reads the same way on the RTL page as on the LTR one.

   WHERE THEY LAND
     dist/floa/cv/index.html       ->  floa.co.il/floa/cv/       base "../"
     dist/floa/cv/he/index.html    ->  floa.co.il/floa/cv/he/    base "../../"

   `base` is how each page reaches FLOA's stylesheet; every href in this file is
   written relative to FLOA's folder and ctx.url() rewrites it for the page being
   rendered (see src/lib/context.js).
   ========================================================================== */

const CONTACT = {
  phoneHref: "tel:+972587078708",
  mailHref: "mailto:ofir.aviram@gmail.com",
  linkedinHref: "https://www.linkedin.com/in/aviramo",
  phone: "+972 58-707-8708",
  mail: "ofir.aviram@gmail.com",
  linkedin: "linkedin.com/in/aviramo",
};

/* --- English ---------------------------------------------------------------- */
export const cvEn = {
  out: "cv/index.html",
  path: "floa/cv/",
  base: "../",
  homeHref: "../../",
  lang: "en",
  dir: "ltr",

  meta: {
    title: "Ofir Aviram | Solution Architect and Senior Systems Analyst",
    description: "CV of Ofir Aviram. 15+ years leading the analysis, design and delivery of enterprise applications, integrations and Identity Management solutions.",
  },

  altLang: { href: "cv/he/", label: "עברית", lang: "he" },
  alternates: [{ lang: "en", href: "cv/" }, { lang: "he", href: "cv/he/" }],

  name: "Ofir Aviram",
  roles: [
    "Solution Architect | Senior Systems Analyst",
    "Enterprise Applications & Integrations",
  ],
  contact: [
    { icon: "pin", text: "Hod HaSharon, Israel" },
    { icon: "phone", text: CONTACT.phone, href: CONTACT.phoneHref },
    { icon: "mail", text: CONTACT.mail, href: CONTACT.mailHref },
    { icon: "linkedin", text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    {
      type: "text",
      icon: "user",
      title: "Professional Summary",
      body: [
        "Solution Architect and Senior Systems Analyst with 15+ years of experience leading the analysis, design and delivery of enterprise applications, integrations and Identity Management solutions. Skilled in understanding complex business needs, designing scalable solutions and implementing systems that drive business value, optimize processes and enhance user experience.",
      ],
    },

    {
      type: "skills",
      icon: "star",
      title: "Core Competencies",
      items: [
        {
          icon: "architecture",
          title: "Solution Architecture",
          text: "Enterprise architecture, solution design, system architecture, scalability, security.",
        },
        {
          icon: "analysis",
          title: "Systems Analysis",
          text: "Requirements analysis, business process modeling, data modeling, technical documentation.",
        },
        {
          icon: "integrations",
          title: "Integrations",
          text: "API & web services, data integration (ETL), middleware (Workato), ERP & CRM integrations.",
        },
        {
          icon: "ai",
          title: "AI-Powered Development",
          text: "AI-assisted development, automation, rapid prototyping, innovation and problem solving.",
        },
      ],
    },

    {
      type: "project",
      icon: "rocket",
      title: "Key Project: Once",
      note: "(2026 - Present)",
      lead: "Founder & Product Owner of Once, a real-time dating app with a unique model: one person at a time, 10-minute invitations, proximity matching and social circles.",
      bullets: [
        "Defined product strategy, user flows and UX",
        "Designed solution architecture, database and backend workflows",
        "Developed full-stack application with Node.js, TypeScript, Supabase and real-time capabilities",
        "Integrated location services, chat, notifications, payments, permissions and circles",
        "Used Claude & ChatGPT extensively for development, debugging and optimization",
        "Deployed to production and submitted to app stores (Android live, iOS under review)",
      ],
    },

    {
      type: "jobs",
      icon: "briefcase",
      title: "Professional Experience",
      jobs: [
        {
          role: "Product Owner & AI-Powered Full-Stack Developer | Once",
          dates: "2026 - Present",
          bullets: [
            "Leading the development of Once from concept to production.",
            "Responsible for product definition, architecture, development and ongoing optimization.",
            "Building modern, scalable and AI-augmented development processes.",
          ],
        },
        {
          role: "Senior Systems Analyst | IDM Solution Design | Brillix",
          dates: "2021 - 2024",
          bullets: [
            "Designed and delivered IAM/IGA solutions for large organizations in healthcare, finance and insurance.",
            "Focused on identity governance, access management and compliance.",
            "Worked with stakeholders to analyze requirements and design end-to-end solutions.",
          ],
        },
        {
          role: "Senior Systems Analyst | Integration & Solution Design | Tidhar",
          dates: "2025 - Present",
          bullets: [
            "Design and delivery of enterprise solutions and integrations.",
            "Analyze requirements and implement integrations across enterprise systems.",
            "Work with stakeholders and cross-functional teams to deliver high-quality solutions.",
          ],
        },
        {
          role: "Systems Analyst | Web Solutions & Process Automation | Tel Aviv Yafo Municipality",
          dates: "2020 - 2021",
          bullets: [
            "Led the analysis and design of an enterprise web solution connecting multiple municipal departments.",
            "Automated cross-organizational workflows and improved process efficiency.",
            "Worked with business stakeholders and IT to deliver user-friendly solutions.",
          ],
        },
        {
          role: "Identity Management Systems Analyst & Technical Lead | Amdocs",
          dates: "2017 - 2020",
          bullets: [
            "Led end-to-end analysis and delivery of enterprise IAM solutions.",
            "Designed and implemented integrations with HR, ERP, CRM and directory services.",
            "Managed projects from requirements to production.",
          ],
        },
        {
          role: "IDM Implementation Consultant & Solution Developer | ProLink Identity Management Architects",
          dates: "2014 - 2017",
          bullets: [
            "Independently customized and implemented the VAXA Identity Management platform for leading organizations including Harel, Migdal, Phoenix and Amdocs.",
            "Owned all application-level aspects: business logic, integrations, workflows and authorizations (excluding infrastructure).",
            "Designed data mappings, interfaces and synchronization processes.",
            "Worked directly with customers and cross-functional teams to deliver solutions.",
          ],
        },
        {
          role: "System Analyst | Identity Management Solutions | Veronis",
          dates: "2008 - 2014",
          bullets: [
            "Designed and implemented Identity Management solutions for enterprise customers.",
            "Worked on integrations, business logic and workflows.",
            "Supported projects from analysis through deployment.",
          ],
        },
      ],
    },

    {
      type: "stack",
      icon: "code",
      title: "Technical Skills",
      rows: [
        { label: "Languages:", value: "JavaScript | TypeScript | Python | SQL" },
        { label: "Backend:", value: "Node.js | Express.js | Supabase | REST APIs | GraphQL" },
        { label: "Databases:", value: "PostgreSQL | MySQL | Oracle" },
        { label: "Integration:", value: "Workato | REST/SOAP | API Gateway | Webhooks | LDAP | Active Directory" },
        { label: "Frontend:", value: "React | Next.js | HTML5 | CSS3 | JavaScript" },
        { label: "Tools & Platforms:", value: "Git | Docker | Postman | VS Code | Jira | Confluence | AWS (basics)" },
      ],
    },

    {
      type: "entries",
      icon: "cap",
      title: "Education",
      entries: [
        {
          title: "Ben-Gurion University of the Negev",
          years: "2004 - 2008",
          lines: ["B.Sc. Industrial Engineering and Management"],
          note: "Information Systems Specialist",
        },
      ],
    },

    {
      type: "entries",
      icon: "shield",
      title: "Military Service",
      entries: [
        {
          title: "IDF, Combat Engineering Corps",
          years: "1999 - 2002",
          lines: ["Combat Soldier & Squad Leader"],
        },
      ],
    },
  ],
};

/* --- Hebrew ----------------------------------------------------------------- */
export const cvHe = {
  out: "cv/he/index.html",
  path: "floa/cv/he/",
  base: "../../",
  homeHref: "../../../",
  lang: "he",
  dir: "rtl",

  meta: {
    title: "אופיר אבירם | ארכיטקט פתרונות ומנתח מערכות בכיר",
    description: "קורות החיים של אופיר אבירם. מעל 15 שנה בהובלת אפיון, עיצוב ואספקה של אפליקציות ארגוניות, אינטגרציות ופתרונות ניהול זהויות.",
  },

  altLang: { href: "cv/", label: "English", lang: "en" },
  alternates: [{ lang: "en", href: "cv/" }, { lang: "he", href: "cv/he/" }],

  name: "אופיר אבירם",
  roles: [
    "ארכיטקט פתרונות | מנתח מערכות בכיר",
    "אפליקציות ואינטגרציות ארגוניות",
  ],
  contact: [
    { icon: "pin", text: "הוד השרון, ישראל" },
    { icon: "phone", text: CONTACT.phone, href: CONTACT.phoneHref },
    { icon: "mail", text: CONTACT.mail, href: CONTACT.mailHref },
    { icon: "linkedin", text: CONTACT.linkedin, href: CONTACT.linkedinHref },
  ],

  sections: [
    {
      type: "text",
      icon: "user",
      title: "תקציר מקצועי",
      body: [
        "ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בהובלת אפיון, עיצוב ואספקה של אפליקציות ארגוניות, אינטגרציות ופתרונות ניהול זהויות. מיומן בהבנת צרכים עסקיים מורכבים, בתכנון פתרונות מדרגיים ובהטמעת מערכות שמייצרות ערך עסקי, מייעלות תהליכים ומשפרות את חוויית המשתמש.",
      ],
    },

    {
      type: "skills",
      icon: "star",
      title: "תחומי מומחיות",
      items: [
        {
          icon: "architecture",
          title: "ארכיטקטורת פתרונות",
          text: "ארכיטקטורה ארגונית, עיצוב פתרונות, ארכיטקטורת מערכות, מדרגיות, אבטחה.",
        },
        {
          icon: "analysis",
          title: "ניתוח מערכות",
          text: "אפיון דרישות, מידול תהליכים עסקיים, מידול נתונים, תיעוד טכני.",
        },
        {
          icon: "integrations",
          title: "אינטגרציות",
          text: "ממשקי API ושירותי web, אינטגרציית נתונים (ETL), שכבת ביניים (Workato), חיבורי ERP ו-CRM.",
        },
        {
          icon: "ai",
          title: "פיתוח מבוסס AI",
          text: "פיתוח בעזרת בינה מלאכותית, אוטומציה, אב טיפוס מהיר, חדשנות ופתרון בעיות.",
        },
      ],
    },

    {
      type: "project",
      icon: "rocket",
      title: "פרויקט מרכזי: Once",
      note: "(2026 - היום)",
      lead: "מייסד ומנהל המוצר של Once, אפליקציית היכרויות בזמן אמת עם מודל ייחודי: אדם אחד בכל רגע, הזמנות של 10 דקות, התאמה לפי קרבה ומעגלים חברתיים.",
      bullets: [
        "הגדרת אסטרטגיית המוצר, מסעות המשתמש וחוויית השימוש",
        "תכנון ארכיטקטורת הפתרון, בסיס הנתונים ותהליכי הצד השרתי",
        "פיתוח אפליקציית full-stack עם Node.js, TypeScript, Supabase ויכולות זמן אמת",
        "שילוב שירותי מיקום, צ'אט, התראות, תשלומים, הרשאות ומעגלים",
        "שימוש נרחב ב-Claude וב-ChatGPT לפיתוח, לניפוי שגיאות ולאופטימיזציה",
        "עלייה לייצור והגשה לחנויות האפליקציות (אנדרואיד באוויר, iOS בבדיקה)",
      ],
    },

    {
      type: "jobs",
      icon: "briefcase",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מנהל מוצר ומפתח Full-Stack מבוסס AI | Once",
          dates: "2026 - היום",
          bullets: [
            "הובלת הפיתוח של Once מרעיון ועד ייצור.",
            "אחריות על הגדרת המוצר, הארכיטקטורה, הפיתוח והאופטימיזציה השוטפת.",
            "בניית תהליכי פיתוח מודרניים, מדרגיים ומבוססי בינה מלאכותית.",
          ],
        },
        {
          role: "מנתח מערכות בכיר | עיצוב פתרונות ניהול זהויות | בריליקס",
          dates: "2021 - 2024",
          bullets: [
            "תכנון ואספקה של פתרונות IAM/IGA לארגונים גדולים בתחומי הבריאות, הפיננסים והביטוח.",
            "התמקדות בממשל זהויות, בניהול הרשאות ובעמידה ברגולציה.",
            "עבודה מול בעלי עניין לאפיון דרישות ולתכנון פתרונות מקצה לקצה.",
          ],
        },
        {
          role: "מנתח מערכות בכיר | אינטגרציות ועיצוב פתרונות | תדהר",
          dates: "2025 - היום",
          bullets: [
            "תכנון ואספקה של פתרונות ואינטגרציות ארגוניות.",
            "אפיון דרישות ומימוש אינטגרציות בין מערכות ארגוניות.",
            "עבודה מול בעלי עניין וצוותים חוצי ארגון לאספקת פתרונות באיכות גבוהה.",
          ],
        },
        {
          role: "מנתח מערכות | פתרונות web ואוטומציית תהליכים | עיריית תל אביב יפו",
          dates: "2020 - 2021",
          bullets: [
            "הובלת האפיון והתכנון של פתרון web ארגוני שמחבר בין אגפים עירוניים רבים.",
            "אוטומציה של תהליכים חוצי ארגון וייעול תהליכי העבודה.",
            "עבודה מול גורמים עסקיים ומול IT לאספקת פתרונות ידידותיים למשתמש.",
          ],
        },
        {
          role: "מנתח מערכות ניהול זהויות וראש צוות טכני | אמדוקס",
          dates: "2017 - 2020",
          bullets: [
            "הובלת אפיון ואספקה מקצה לקצה של פתרונות IAM ארגוניים.",
            "תכנון ומימוש אינטגרציות מול מערכות HR, ERP, CRM ושירותי directory.",
            "ניהול פרויקטים מהגדרת הדרישות ועד לעלייה לייצור.",
          ],
        },
        {
          role: "יועץ הטמעה ומפתח פתרונות ניהול זהויות | פרולינק ניהול זהויות",
          dates: "2014 - 2017",
          bullets: [
            "התאמה והטמעה עצמאית של פלטפורמת ניהול הזהויות VAXA בארגונים מובילים, ובהם הראל, מגדל, הפניקס ואמדוקס.",
            "אחריות מלאה על כל שכבת האפליקציה: לוגיקה עסקית, אינטגרציות, תהליכי עבודה והרשאות (למעט תשתיות).",
            "תכנון מיפויי נתונים, ממשקים ותהליכי סנכרון.",
            "עבודה ישירה מול לקוחות ומול צוותים חוצי ארגון לאספקת פתרונות.",
          ],
        },
        {
          role: "מנתח מערכות | פתרונות ניהול זהויות | ורוניס",
          dates: "2008 - 2014",
          bullets: [
            "תכנון והטמעה של פתרונות ניהול זהויות ללקוחות ארגוניים.",
            "עבודה על אינטגרציות, לוגיקה עסקית ותהליכי עבודה.",
            "ליווי פרויקטים מהאפיון ועד ההטמעה בייצור.",
          ],
        },
      ],
    },

    {
      type: "stack",
      icon: "code",
      title: "כישורים טכניים",
      rows: [
        { label: "שפות:", value: "JavaScript | TypeScript | Python | SQL" },
        { label: "צד שרת:", value: "Node.js | Express.js | Supabase | REST APIs | GraphQL" },
        { label: "בסיסי נתונים:", value: "PostgreSQL | MySQL | Oracle" },
        { label: "אינטגרציה:", value: "Workato | REST/SOAP | API Gateway | Webhooks | LDAP | Active Directory" },
        { label: "צד לקוח:", value: "React | Next.js | HTML5 | CSS3 | JavaScript" },
        { label: "כלים ופלטפורמות:", value: "Git | Docker | Postman | VS Code | Jira | Confluence | AWS (basics)" },
      ],
    },

    {
      type: "entries",
      icon: "cap",
      title: "השכלה",
      entries: [
        {
          title: "אוניברסיטת בן גוריון בנגב",
          years: "2004 - 2008",
          lines: ["B.Sc. בהנדסת תעשייה וניהול"],
          note: "התמחות במערכות מידע",
        },
      ],
    },

    {
      type: "entries",
      icon: "shield",
      title: "שירות צבאי",
      entries: [
        {
          title: "צה\"ל, חיל ההנדסה הקרבית",
          years: "1999 - 2002",
          lines: ["לוחם ומפקד כיתה"],
        },
      ],
    },
  ],
};

export const cvPages = [cvEn, cvHe];
