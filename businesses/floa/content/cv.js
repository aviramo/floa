/* ==========================================================================
   The CV, twice: once in English, once in Hebrew.

   Two documents, one structure. Everything below is copy and data — the way it
   is DRAWN lives in src/components/resume/, so the two versions can never drift
   apart in anything but language. Change the layout once and both change.

   The English text is Ofir's, verbatim: nothing here is rewritten, shortened,
   expanded or invented, and every company and technology keeps its exact
   spelling. The Hebrew is a translation of that same text and of nothing else.

   DATES ARE NOT TOUCHED. They were settled by hand earlier and are carried
   through unchanged, including the ones that differ from the source text
   (Tidhar, Brillix, Varonis, the military service). Each is written with a
   plain hyphen and rendered inside a dir="ltr" span, so "2014 - 2017" reads the
   same way on the RTL page as on the LTR one.

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
  phone: "+972-58-707-8708",
  mail: "ofir.aviram@gmail.com",
  linkedin: "linkedin.com/in/aviramo",
};

const DEMO = "https://once-lake.vercel.app/";

/* The code that opens the demo. 29 modules of payload plus the four-module
   quiet zone a scanner needs on every side: 37 across. Drawn as one path of
   1x1 squares, so it is vector at any size and survives print at 19mm. */
const QR = {
  viewBox: "0 0 37 37",
  path: `<path d="M4 4h1v1h-1zM5 4h1v1h-1zM6 4h1v1h-1zM7 4h1v1h-1zM8 4h1v1h-1zM9 4h1v1h-1zM10 4h1v1h-1zM12 4h1v1h-1zM15 4h1v1h-1zM17 4h1v1h-1zM18 4h1v1h-1zM21 4h1v1h-1zM22 4h1v1h-1zM26 4h1v1h-1zM27 4h1v1h-1zM28 4h1v1h-1zM29 4h1v1h-1zM30 4h1v1h-1zM31 4h1v1h-1zM32 4h1v1h-1zM4 5h1v1h-1zM10 5h1v1h-1zM12 5h1v1h-1zM14 5h1v1h-1zM16 5h1v1h-1zM17 5h1v1h-1zM20 5h1v1h-1zM23 5h1v1h-1zM26 5h1v1h-1zM32 5h1v1h-1zM4 6h1v1h-1zM6 6h1v1h-1zM7 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM17 6h1v1h-1zM19 6h1v1h-1zM20 6h1v1h-1zM26 6h1v1h-1zM28 6h1v1h-1zM29 6h1v1h-1zM30 6h1v1h-1zM32 6h1v1h-1zM4 7h1v1h-1zM6 7h1v1h-1zM7 7h1v1h-1zM8 7h1v1h-1zM10 7h1v1h-1zM13 7h1v1h-1zM15 7h1v1h-1zM18 7h1v1h-1zM20 7h1v1h-1zM21 7h1v1h-1zM24 7h1v1h-1zM26 7h1v1h-1zM28 7h1v1h-1zM29 7h1v1h-1zM30 7h1v1h-1zM32 7h1v1h-1zM4 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM13 8h1v1h-1zM15 8h1v1h-1zM17 8h1v1h-1zM18 8h1v1h-1zM20 8h1v1h-1zM22 8h1v1h-1zM23 8h1v1h-1zM26 8h1v1h-1zM28 8h1v1h-1zM29 8h1v1h-1zM30 8h1v1h-1zM32 8h1v1h-1zM4 9h1v1h-1zM10 9h1v1h-1zM14 9h1v1h-1zM17 9h1v1h-1zM18 9h1v1h-1zM21 9h1v1h-1zM26 9h1v1h-1zM32 9h1v1h-1zM4 10h1v1h-1zM5 10h1v1h-1zM6 10h1v1h-1zM7 10h1v1h-1zM8 10h1v1h-1zM9 10h1v1h-1zM10 10h1v1h-1zM12 10h1v1h-1zM14 10h1v1h-1zM16 10h1v1h-1zM18 10h1v1h-1zM20 10h1v1h-1zM22 10h1v1h-1zM24 10h1v1h-1zM26 10h1v1h-1zM27 10h1v1h-1zM28 10h1v1h-1zM29 10h1v1h-1zM30 10h1v1h-1zM31 10h1v1h-1zM32 10h1v1h-1zM13 11h1v1h-1zM16 11h1v1h-1zM18 11h1v1h-1zM19 11h1v1h-1zM20 11h1v1h-1zM22 11h1v1h-1zM24 11h1v1h-1zM4 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM9 12h1v1h-1zM10 12h1v1h-1zM11 12h1v1h-1zM12 12h1v1h-1zM13 12h1v1h-1zM15 12h1v1h-1zM17 12h1v1h-1zM18 12h1v1h-1zM20 12h1v1h-1zM21 12h1v1h-1zM22 12h1v1h-1zM23 12h1v1h-1zM24 12h1v1h-1zM25 12h1v1h-1zM28 12h1v1h-1zM30 12h1v1h-1zM31 12h1v1h-1zM32 12h1v1h-1zM5 13h1v1h-1zM6 13h1v1h-1zM7 13h1v1h-1zM8 13h1v1h-1zM11 13h1v1h-1zM12 13h1v1h-1zM13 13h1v1h-1zM15 13h1v1h-1zM16 13h1v1h-1zM18 13h1v1h-1zM19 13h1v1h-1zM21 13h1v1h-1zM22 13h1v1h-1zM23 13h1v1h-1zM28 13h1v1h-1zM30 13h1v1h-1zM31 13h1v1h-1zM7 14h1v1h-1zM8 14h1v1h-1zM10 14h1v1h-1zM11 14h1v1h-1zM13 14h1v1h-1zM14 14h1v1h-1zM15 14h1v1h-1zM18 14h1v1h-1zM19 14h1v1h-1zM26 14h1v1h-1zM28 14h1v1h-1zM30 14h1v1h-1zM6 15h1v1h-1zM7 15h1v1h-1zM13 15h1v1h-1zM15 15h1v1h-1zM16 15h1v1h-1zM18 15h1v1h-1zM21 15h1v1h-1zM22 15h1v1h-1zM24 15h1v1h-1zM25 15h1v1h-1zM26 15h1v1h-1zM28 15h1v1h-1zM29 15h1v1h-1zM32 15h1v1h-1zM6 16h1v1h-1zM9 16h1v1h-1zM10 16h1v1h-1zM13 16h1v1h-1zM14 16h1v1h-1zM16 16h1v1h-1zM17 16h1v1h-1zM18 16h1v1h-1zM20 16h1v1h-1zM23 16h1v1h-1zM24 16h1v1h-1zM26 16h1v1h-1zM27 16h1v1h-1zM32 16h1v1h-1zM8 17h1v1h-1zM9 17h1v1h-1zM11 17h1v1h-1zM12 17h1v1h-1zM19 17h1v1h-1zM20 17h1v1h-1zM22 17h1v1h-1zM26 17h1v1h-1zM27 17h1v1h-1zM28 17h1v1h-1zM29 17h1v1h-1zM30 17h1v1h-1zM31 17h1v1h-1zM32 17h1v1h-1zM4 18h1v1h-1zM5 18h1v1h-1zM7 18h1v1h-1zM8 18h1v1h-1zM9 18h1v1h-1zM10 18h1v1h-1zM12 18h1v1h-1zM14 18h1v1h-1zM15 18h1v1h-1zM18 18h1v1h-1zM19 18h1v1h-1zM20 18h1v1h-1zM22 18h1v1h-1zM23 18h1v1h-1zM27 18h1v1h-1zM30 18h1v1h-1zM32 18h1v1h-1zM5 19h1v1h-1zM7 19h1v1h-1zM8 19h1v1h-1zM15 19h1v1h-1zM16 19h1v1h-1zM17 19h1v1h-1zM18 19h1v1h-1zM19 19h1v1h-1zM23 19h1v1h-1zM26 19h1v1h-1zM28 19h1v1h-1zM30 19h1v1h-1zM32 19h1v1h-1zM4 20h1v1h-1zM6 20h1v1h-1zM7 20h1v1h-1zM9 20h1v1h-1zM10 20h1v1h-1zM11 20h1v1h-1zM14 20h1v1h-1zM15 20h1v1h-1zM16 20h1v1h-1zM27 20h1v1h-1zM29 20h1v1h-1zM4 21h1v1h-1zM5 21h1v1h-1zM7 21h1v1h-1zM15 21h1v1h-1zM16 21h1v1h-1zM19 21h1v1h-1zM21 21h1v1h-1zM23 21h1v1h-1zM24 21h1v1h-1zM28 21h1v1h-1zM30 21h1v1h-1zM31 21h1v1h-1zM4 22h1v1h-1zM5 22h1v1h-1zM6 22h1v1h-1zM9 22h1v1h-1zM10 22h1v1h-1zM12 22h1v1h-1zM13 22h1v1h-1zM14 22h1v1h-1zM15 22h1v1h-1zM16 22h1v1h-1zM17 22h1v1h-1zM18 22h1v1h-1zM19 22h1v1h-1zM21 22h1v1h-1zM22 22h1v1h-1zM23 22h1v1h-1zM24 22h1v1h-1zM25 22h1v1h-1zM26 22h1v1h-1zM27 22h1v1h-1zM29 22h1v1h-1zM32 22h1v1h-1zM4 23h1v1h-1zM5 23h1v1h-1zM8 23h1v1h-1zM9 23h1v1h-1zM11 23h1v1h-1zM12 23h1v1h-1zM17 23h1v1h-1zM19 23h1v1h-1zM20 23h1v1h-1zM22 23h1v1h-1zM25 23h1v1h-1zM27 23h1v1h-1zM29 23h1v1h-1zM30 23h1v1h-1zM4 24h1v1h-1zM5 24h1v1h-1zM7 24h1v1h-1zM10 24h1v1h-1zM15 24h1v1h-1zM17 24h1v1h-1zM19 24h1v1h-1zM21 24h1v1h-1zM24 24h1v1h-1zM25 24h1v1h-1zM26 24h1v1h-1zM27 24h1v1h-1zM28 24h1v1h-1zM29 24h1v1h-1zM30 24h1v1h-1zM31 24h1v1h-1zM12 25h1v1h-1zM13 25h1v1h-1zM14 25h1v1h-1zM17 25h1v1h-1zM19 25h1v1h-1zM24 25h1v1h-1zM28 25h1v1h-1zM29 25h1v1h-1zM4 26h1v1h-1zM5 26h1v1h-1zM6 26h1v1h-1zM7 26h1v1h-1zM8 26h1v1h-1zM9 26h1v1h-1zM10 26h1v1h-1zM12 26h1v1h-1zM16 26h1v1h-1zM17 26h1v1h-1zM19 26h1v1h-1zM20 26h1v1h-1zM21 26h1v1h-1zM22 26h1v1h-1zM23 26h1v1h-1zM24 26h1v1h-1zM26 26h1v1h-1zM28 26h1v1h-1zM29 26h1v1h-1zM4 27h1v1h-1zM10 27h1v1h-1zM12 27h1v1h-1zM13 27h1v1h-1zM16 27h1v1h-1zM17 27h1v1h-1zM19 27h1v1h-1zM21 27h1v1h-1zM22 27h1v1h-1zM24 27h1v1h-1zM28 27h1v1h-1zM31 27h1v1h-1zM32 27h1v1h-1zM4 28h1v1h-1zM6 28h1v1h-1zM7 28h1v1h-1zM8 28h1v1h-1zM10 28h1v1h-1zM12 28h1v1h-1zM17 28h1v1h-1zM20 28h1v1h-1zM22 28h1v1h-1zM23 28h1v1h-1zM24 28h1v1h-1zM25 28h1v1h-1zM26 28h1v1h-1zM27 28h1v1h-1zM28 28h1v1h-1zM29 28h1v1h-1zM32 28h1v1h-1zM4 29h1v1h-1zM6 29h1v1h-1zM7 29h1v1h-1zM8 29h1v1h-1zM10 29h1v1h-1zM12 29h1v1h-1zM14 29h1v1h-1zM15 29h1v1h-1zM17 29h1v1h-1zM18 29h1v1h-1zM19 29h1v1h-1zM20 29h1v1h-1zM21 29h1v1h-1zM22 29h1v1h-1zM24 29h1v1h-1zM25 29h1v1h-1zM32 29h1v1h-1zM4 30h1v1h-1zM6 30h1v1h-1zM7 30h1v1h-1zM8 30h1v1h-1zM10 30h1v1h-1zM15 30h1v1h-1zM19 30h1v1h-1zM20 30h1v1h-1zM21 30h1v1h-1zM25 30h1v1h-1zM27 30h1v1h-1zM28 30h1v1h-1zM30 30h1v1h-1zM31 30h1v1h-1zM32 30h1v1h-1zM4 31h1v1h-1zM10 31h1v1h-1zM13 31h1v1h-1zM14 31h1v1h-1zM15 31h1v1h-1zM27 31h1v1h-1zM29 31h1v1h-1zM30 31h1v1h-1zM32 31h1v1h-1zM4 32h1v1h-1zM5 32h1v1h-1zM6 32h1v1h-1zM7 32h1v1h-1zM8 32h1v1h-1zM9 32h1v1h-1zM10 32h1v1h-1zM12 32h1v1h-1zM13 32h1v1h-1zM14 32h1v1h-1zM16 32h1v1h-1zM17 32h1v1h-1zM19 32h1v1h-1zM23 32h1v1h-1zM24 32h1v1h-1zM26 32h1v1h-1z" fill="#33265B"/>`,
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
    description: "CV of Ofir Aviram. Solution Architect and Senior Systems Analyst with 15+ years designing and delivering enterprise applications, system integrations, Identity and Access Management solutions and AI-assisted products.",
  },

  altLang: { href: "cv/he/", label: "עברית", lang: "he" },
  alternates: [{ lang: "en", href: "cv/" }, { lang: "he", href: "cv/he/" }],

  name: "Ofir Aviram",
  roles: [
    "Solution Architect | Senior Systems Analyst",
    "Enterprise Applications & Integrations | AI-Powered Product Development",
  ],
  contact: [
    { icon: "pin", text: "Hod Hasharon, Israel" },
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
        "Solution Architect and Senior Systems Analyst with 15+ years of experience designing and delivering enterprise applications, system integrations, Identity and Access Management solutions, business process automation and web and mobile products across high-tech, healthcare, finance, insurance, construction and municipal organizations.",
        "Combines deep systems-analysis experience with hands-on solution design and AI-assisted product development. Experienced in requirements discovery, functional and technical specifications, business logic, data flows, APIs, SQL, ETL, integration architecture, stakeholder management, testing and production delivery.",
        "Able to take an initial business need or product idea, define the requirements, design the architecture and lead the solution through implementation until it becomes a working production system.",
      ],
    },

    {
      type: "keywords",
      icon: "star",
      title: "Core Competencies",
      groups: [
        {
          title: "Solution Architecture",
          terms: ["End-to-End Solution Design", "Enterprise Applications", "Integration Architecture", "Business Logic Design", "System Interfaces", "Data Flows", "Scalable Solution Design", "Production Delivery"],
        },
        {
          title: "Systems Analysis",
          terms: ["Requirements Gathering", "Requirements Analysis", "Functional Specifications", "Technical Specifications", "Business Process Modeling", "Data Modeling", "User Flows", "UAT and Acceptance Criteria"],
        },
        {
          title: "Integration and Data",
          terms: ["REST APIs", "System Integrations", "SQL", "ETL", "SSIS", "Workato", "Salesforce", "Priority ERP", "Identity and Access Management", "Identity Management"],
        },
        {
          title: "Product and AI-Assisted Delivery",
          terms: ["Product Discovery", "Product Requirements", "Product Ownership", "User Experience", "Rapid Prototyping", "AI-Assisted Development", "Automation", "Cross-Functional Leadership", "End-to-End Delivery"],
        },
      ],
    },

    {
      type: "roles",
      icon: "rocket",
      title: "Selected Product and Independent Experience",
      jobs: [
        {
          role: "Product Owner & AI-Powered Full-Stack Developer",
          dates: "2026 - Present",
          org: "Once, AI-Powered Mobile Product | Self-Employed",
          lead: "Designed and built Once from initial concept to a production-ready mobile product, owning the complete product and technology lifecycle.",
          bullets: [
            "Defined the product strategy, requirements, user journeys, user flows and UX",
            "Designed the solution architecture, database model, business logic, backend workflows and permissions model",
            "Built a real-time mobile dating product based on one person at a time, immediate invitations, proximity, activity and shared social Circles",
            "Developed authentication, location services, real-time chat, matching logic, credit mechanisms, social Circles, permissions and notification processes",
            "Developed the product using Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, RPC functions and API integrations",
            "Used Claude and ChatGPT for rapid prototyping, coding, debugging, refactoring, test-data generation, problem-solving and delivery acceleration",
            "Managed architecture, development, testing, troubleshooting and production releases end to end",
            "Prepared and submitted production releases for Google Play and the Apple App Store",
          ],
          link: { label: "Product demo:", href: DEMO },
          qr: { ...QR, alt: "QR code linking to the Once product demo" },
        },
      ],
    },

    {
      type: "roles",
      icon: "briefcase",
      title: "Professional Experience",
      jobs: [
        {
          role: "Senior Systems Analyst | Integration & Solution Design",
          dates: "2025 - 2026",
          org: "Tidhar Group | Israel | Hybrid",
          lead: "Led end-to-end analysis and delivery of enterprise business processes, automations and system integrations across Salesforce, Priority ERP and Workato.",
          bullets: [
            "Gathered and refined business requirements and translated them into functional and technical specifications",
            "Analyzed business processes, system dependencies, data flows and integration requirements",
            "Designed integration flows, data mappings, business logic, automations and system interfaces",
            "Worked with SQL, ETL processes and enterprise applications",
            "Coordinated delivery across business stakeholders, IT teams, vendors and implementation partners",
            "Supported testing, production deployment, troubleshooting and continuous improvement",
          ],
        },
        {
          role: "Senior Systems Analyst | IDM Solution Design",
          dates: "2021 - 2025",
          org: "Brillix | Israel | Remote",
          lead: "Designed and implemented enterprise Identity Management solutions for Clalit Health Services, Migdal, Ayalon and LivePerson.",
          bullets: [
            "Analyzed complex business, identity lifecycle and information-security processes",
            "Gathered requirements and created functional and technical specifications for IDM workflows, interfaces, data transformations and integrations",
            "Designed data mappings, ETL processes, business logic and system interfaces",
            "Worked closely with cybersecurity, DBA, DevOps, infrastructure, IT and business teams",
            "Led delivery from initial requirements and solution design through testing, troubleshooting and production rollout",
          ],
        },
        {
          role: "Systems Analyst | Web Solutions & Process Automation",
          dates: "2020 - 2021",
          org: "Tel Aviv-Yafo Municipality",
          lead: "Led the analysis and design of an enterprise web solution connecting multiple municipal departments and automating cross-organizational workflows.",
          bullets: [
            "Conducted requirements discovery with users, managers and business stakeholders",
            "Modeled business processes, data structures, system workflows and user journeys",
            "Designed UX and UI flows and wrote functional and technical specifications",
            "Designed SQL and SSIS-based integrations, data processes and automated workflows",
            "Coordinated users, development, DBA and QA teams from requirements through user acceptance and rollout",
          ],
        },
        {
          role: "Identity Management Systems Analyst & Technical Lead",
          dates: "2017 - 2020",
          org: "Amdocs | Israel",
          lead: "Led the technical implementation of enterprise Identity Management solutions.",
          bullets: [
            "Translated business and information-security requirements into workflows, interfaces, business logic and technical solutions",
            "Designed system processes, integrations and data flows",
            "Guided a development team working with Java and JSP",
            "Worked with Git, Jira and Agile delivery methodologies",
            "Coordinated development, cybersecurity, infrastructure, DBA, DevOps and IT teams",
            "Supported testing, troubleshooting, deployment and production delivery",
          ],
        },
        {
          role: "IDM Implementation Consultant & Solution Developer",
          dates: "2014 - 2017",
          org: "ProLink Identity Management Architects | Israel",
          lead: "Independently customized and implemented the Aveksa IAM and Identity Governance platform for major organizations, including Harel, Migdal, Phoenix and Amdocs.",
          bullets: [
            "Owned the complete application-level solution design and implementation, excluding infrastructure",
            "Analyzed identity lifecycle, access-management, authorization and business requirements",
            "Designed and developed business logic, workflows, rules, approval processes and authorization processes",
            "Built integrations between the Aveksa platform and enterprise systems, databases and directories",
            "Designed data mappings, interfaces and synchronization processes",
            "Worked directly with customer stakeholders, information-security teams, IT, DBA and infrastructure teams",
            "Led testing, troubleshooting, deployment and production support",
          ],
        },
        {
          role: "Software Developer | Enterprise Billing Systems",
          dates: "2008 - 2014",
          org: "Varonis | Israel",
          lead: "Developed, maintained and supported an enterprise billing platform and finance-related business processes.",
          bullets: [
            "Developed solutions using Microsoft SQL Server, Microsoft Access and VBA",
            "Designed database queries, reports and business-process automations",
            "Analyzed business requirements and translated them into system enhancements",
            "Investigated production issues and implemented fixes and improvements",
            "Worked directly with finance and operational stakeholders",
            "Provided ongoing maintenance and production support",
          ],
        },
      ],
    },

    {
      type: "keywords",
      icon: "code",
      title: "Technical Skills",
      groups: [
        {
          title: "Architecture and Analysis",
          terms: ["Solution Architecture", "Systems Analysis", "Solution Design", "Requirements Gathering", "Functional Specifications", "Technical Specifications", "Business Process Modeling", "Data Modeling", "Business Logic Design", "UAT", "End-to-End Delivery"],
        },
        {
          title: "Integration and Data",
          terms: ["REST APIs", "System Integrations", "SQL", "ETL", "SSIS", "Data Mapping", "Workato", "Salesforce", "Priority ERP", "IAM", "IDM", "IGA", "Aveksa"],
        },
        {
          title: "Development",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "PostgreSQL", "Edge Functions", "RPC Functions", "Java", "JSP", "Git", "Microsoft SQL Server", "Microsoft Access", "VBA"],
        },
        {
          title: "AI and Delivery Tools",
          terms: ["Claude", "ChatGPT", "AI-Assisted Development", "Rapid Prototyping", "Debugging", "Refactoring", "Test-Data Generation", "Automation", "Agile", "Jira"],
        },
      ],
    },

    {
      type: "entries",
      icon: "cap",
      title: "Education",
      entries: [
        {
          title: "Product Management Program",
          dates: "2021",
          lines: ["Product Experts"],
        },
        {
          title: "B.Sc. Industrial Engineering and Management",
          dates: "2004 - 2008",
          lines: ["Information Systems Specialization | Ben-Gurion University of the Negev"],
        },
      ],
    },

    {
      type: "lines",
      icon: "globe",
      title: "Languages",
      lines: ["Hebrew - Native", "English - Working proficiency"],
    },

    {
      type: "entries",
      icon: "shield",
      title: "Military Service",
      entries: [
        {
          title: "Combat Soldier and Commander",
          dates: "1999 - 2002",
          lines: ["Combat Engineering Corps"],
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
    description: "קורות החיים של אופיר אבירם. ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון ובאספקה של אפליקציות ארגוניות, אינטגרציות, פתרונות ניהול זהויות והרשאות ומוצרים מבוססי AI.",
  },

  altLang: { href: "cv/", label: "English", lang: "en" },
  alternates: [{ lang: "en", href: "cv/" }, { lang: "he", href: "cv/he/" }],

  name: "אופיר אבירם",
  roles: [
    "ארכיטקט פתרונות | מנתח מערכות בכיר",
    "אפליקציות ואינטגרציות ארגוניות | פיתוח מוצר מבוסס AI",
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
        "ארכיטקט פתרונות ומנתח מערכות בכיר עם מעל 15 שנות ניסיון בתכנון ובאספקה של אפליקציות ארגוניות, אינטגרציות בין מערכות, פתרונות ניהול זהויות והרשאות, אוטומציה של תהליכים עסקיים ומוצרי web ומובייל, בארגוני הייטק, בריאות, פיננסים, ביטוח, בנייה ורשויות מקומיות.",
        "משלב ניסיון עמוק בניתוח מערכות עם תכנון פתרונות בידיים ופיתוח מוצר בעזרת בינה מלאכותית. מנוסה בגילוי דרישות, אפיון פונקציונלי וטכני, לוגיקה עסקית, זרימות נתונים, ממשקי API, SQL, ETL, ארכיטקטורת אינטגרציה, ניהול בעלי עניין, בדיקות ואספקה לייצור.",
        "יודע לקחת צורך עסקי ראשוני או רעיון למוצר, להגדיר את הדרישות, לתכנן את הארכיטקטורה ולהוביל את הפתרון דרך המימוש עד שהוא הופך למערכת עובדת בייצור.",
      ],
    },

    {
      type: "keywords",
      icon: "star",
      title: "תחומי מומחיות",
      groups: [
        {
          title: "ארכיטקטורת פתרונות",
          terms: ["תכנון פתרון מקצה לקצה", "אפליקציות ארגוניות", "ארכיטקטורת אינטגרציה", "תכנון לוגיקה עסקית", "ממשקי מערכת", "זרימות נתונים", "תכנון פתרונות מדרגיים", "אספקה לייצור"],
        },
        {
          title: "ניתוח מערכות",
          terms: ["איסוף דרישות", "ניתוח דרישות", "אפיון פונקציונלי", "אפיון טכני", "מידול תהליכים עסקיים", "מידול נתונים", "מסעות משתמש", "UAT וקריטריוני קבלה"],
        },
        {
          title: "אינטגרציה ונתונים",
          terms: ["REST APIs", "אינטגרציות בין מערכות", "SQL", "ETL", "SSIS", "Workato", "Salesforce", "Priority ERP", "ניהול זהויות והרשאות", "ניהול זהויות"],
        },
        {
          title: "מוצר ואספקה בעזרת AI",
          terms: ["גילוי מוצר", "דרישות מוצר", "בעלות על מוצר", "חוויית משתמש", "אב טיפוס מהיר", "פיתוח בעזרת AI", "אוטומציה", "הובלה חוצת ארגון", "אספקה מקצה לקצה"],
        },
      ],
    },

    {
      type: "roles",
      icon: "rocket",
      title: "מוצר וניסיון עצמאי נבחר",
      jobs: [
        {
          role: "מנהל מוצר ומפתח Full-Stack מבוסס AI",
          dates: "2026 - היום",
          org: "Once, מוצר מובייל מבוסס AI | עצמאי",
          lead: "תכנון ובנייה של Once מרעיון ראשוני ועד מוצר מובייל מוכן לייצור, עם בעלות מלאה על מחזור החיים של המוצר ושל הטכנולוגיה.",
          bullets: [
            "הגדרת אסטרטגיית המוצר, הדרישות, מסעות המשתמש, זרימות המשתמש וחוויית השימוש",
            "תכנון ארכיטקטורת הפתרון, מודל הנתונים, הלוגיקה העסקית, תהליכי הצד השרתי ומודל ההרשאות",
            "בניית מוצר היכרויות מובייל בזמן אמת המבוסס על אדם אחד בכל רגע, הזמנות מיידיות, קרבה, פעילות ומעגלים חברתיים משותפים",
            "פיתוח הזדהות, שירותי מיקום, צ'אט בזמן אמת, לוגיקת התאמה, מנגנוני קרדיט, מעגלים חברתיים, הרשאות ותהליכי התראות",
            "פיתוח המוצר בעזרת Node.js, TypeScript, Supabase, PostgreSQL, Edge Functions, פונקציות RPC ואינטגרציות API",
            "שימוש ב-Claude וב-ChatGPT לאב טיפוס מהיר, לכתיבת קוד, לניפוי שגיאות, לריפקטורינג, ליצירת נתוני בדיקה, לפתרון בעיות ולהאצת האספקה",
            "ניהול הארכיטקטורה, הפיתוח, הבדיקות, פתרון התקלות והעלאות לייצור מקצה לקצה",
            "הכנה והגשה של גרסאות ייצור ל-Google Play ול-Apple App Store",
          ],
          link: { label: "הדגמת המוצר:", href: DEMO },
          qr: { ...QR, alt: "קוד QR לדף ההדגמה של Once" },
        },
      ],
    },

    {
      type: "roles",
      icon: "briefcase",
      title: "ניסיון תעסוקתי",
      jobs: [
        {
          role: "מנתח מערכות בכיר | אינטגרציות ותכנון פתרונות",
          dates: "2025 - 2026",
          org: "קבוצת תדהר | ישראל | היברידי",
          lead: "הובלת אפיון ואספקה מקצה לקצה של תהליכים עסקיים ארגוניים, אוטומציות ואינטגרציות בין מערכות על גבי Salesforce, Priority ERP ו-Workato.",
          bullets: [
            "איסוף וחידוד של דרישות עסקיות ותרגומן לאפיון פונקציונלי וטכני",
            "ניתוח תהליכים עסקיים, תלויות בין מערכות, זרימות נתונים ודרישות אינטגרציה",
            "תכנון זרימות אינטגרציה, מיפויי נתונים, לוגיקה עסקית, אוטומציות וממשקי מערכת",
            "עבודה עם SQL, תהליכי ETL ואפליקציות ארגוניות",
            "תיאום האספקה מול גורמים עסקיים, צוותי IT, ספקים ושותפי הטמעה",
            "ליווי בדיקות, עלייה לייצור, פתרון תקלות ושיפור מתמיד",
          ],
        },
        {
          role: "מנתח מערכות בכיר | תכנון פתרונות IDM",
          dates: "2021 - 2025",
          org: "בריליקס | ישראל | מרחוק",
          lead: "תכנון והטמעה של פתרונות ניהול זהויות ארגוניים עבור שירותי בריאות כללית, מגדל, איילון ו-LivePerson.",
          bullets: [
            "ניתוח תהליכים עסקיים מורכבים, מחזור חיי זהות ותהליכי אבטחת מידע",
            "איסוף דרישות וכתיבת אפיון פונקציונלי וטכני לתהליכי IDM, לממשקים, לטרנספורמציות נתונים ולאינטגרציות",
            "תכנון מיפויי נתונים, תהליכי ETL, לוגיקה עסקית וממשקי מערכת",
            "עבודה צמודה מול צוותי סייבר, DBA, DevOps, תשתיות, IT וגורמים עסקיים",
            "הובלת האספקה מהדרישות הראשוניות ותכנון הפתרון ועד בדיקות, פתרון תקלות ועלייה לייצור",
          ],
        },
        {
          role: "מנתח מערכות | פתרונות web ואוטומציית תהליכים",
          dates: "2020 - 2021",
          org: "עיריית תל אביב יפו",
          lead: "הובלת האפיון והתכנון של פתרון web ארגוני שמחבר בין אגפים עירוניים רבים ומבצע אוטומציה של תהליכים חוצי ארגון.",
          bullets: [
            "גילוי דרישות מול משתמשים, מנהלים וגורמים עסקיים",
            "מידול תהליכים עסקיים, מבני נתונים, זרימות עבודה ומסעות משתמש",
            "תכנון זרימות UX ו-UI וכתיבת אפיון פונקציונלי וטכני",
            "תכנון אינטגרציות מבוססות SQL ו-SSIS, תהליכי נתונים וזרימות עבודה אוטומטיות",
            "תיאום בין משתמשים, פיתוח, DBA ו-QA מהדרישות ועד בדיקות הקבלה וההטמעה",
          ],
        },
        {
          role: "מנתח מערכות ניהול זהויות וראש צוות טכני",
          dates: "2017 - 2020",
          org: "אמדוקס | ישראל",
          lead: "הובלת המימוש הטכני של פתרונות ניהול זהויות ארגוניים.",
          bullets: [
            "תרגום דרישות עסקיות ודרישות אבטחת מידע לתהליכי עבודה, לממשקים, ללוגיקה עסקית ולפתרונות טכניים",
            "תכנון תהליכי מערכת, אינטגרציות וזרימות נתונים",
            "הנחיית צוות פיתוח שעבד ב-Java וב-JSP",
            "עבודה עם Git, Jira ומתודולוגיות Agile",
            "תיאום בין צוותי פיתוח, סייבר, תשתיות, DBA, DevOps ו-IT",
            "ליווי בדיקות, פתרון תקלות, הטמעה ואספקה לייצור",
          ],
        },
        {
          role: "יועץ הטמעה ומפתח פתרונות IDM",
          dates: "2014 - 2017",
          org: "פרולינק ניהול זהויות | ישראל",
          lead: "התאמה והטמעה עצמאית של פלטפורמת Aveksa לניהול זהויות והרשאות ולממשל זהויות בארגונים גדולים, ובהם הראל, מגדל, הפניקס ואמדוקס.",
          bullets: [
            "בעלות מלאה על תכנון הפתרון ועל המימוש בשכבת האפליקציה, למעט תשתיות",
            "ניתוח מחזור חיי זהות, ניהול הרשאות, תהליכי הרשאה ודרישות עסקיות",
            "תכנון ופיתוח של לוגיקה עסקית, תהליכי עבודה, חוקים, תהליכי אישור ותהליכי הרשאה",
            "בניית אינטגרציות בין פלטפורמת Aveksa למערכות ארגוניות, לבסיסי נתונים ולשירותי directory",
            "תכנון מיפויי נתונים, ממשקים ותהליכי סנכרון",
            "עבודה ישירה מול בעלי עניין אצל הלקוח, צוותי אבטחת מידע, IT, DBA ותשתיות",
            "הובלת בדיקות, פתרון תקלות, הטמעה ותמיכה בייצור",
          ],
        },
        {
          role: "מפתח תוכנה | מערכות חיוב ארגוניות",
          dates: "2008 - 2014",
          org: "Varonis | ישראל",
          lead: "פיתוח, תחזוקה ותמיכה בפלטפורמת חיוב ארגונית ובתהליכים עסקיים בתחום הכספים.",
          bullets: [
            "פיתוח פתרונות בעזרת Microsoft SQL Server, Microsoft Access ו-VBA",
            "תכנון שאילתות, דוחות ואוטומציות של תהליכים עסקיים",
            "ניתוח דרישות עסקיות ותרגומן לשיפורים במערכת",
            "חקירת תקלות בייצור ומימוש תיקונים ושיפורים",
            "עבודה ישירה מול גורמי כספים ותפעול",
            "תחזוקה שוטפת ותמיכה בייצור",
          ],
        },
      ],
    },

    {
      type: "keywords",
      icon: "code",
      title: "כישורים טכניים",
      groups: [
        {
          title: "ארכיטקטורה וניתוח",
          terms: ["ארכיטקטורת פתרונות", "ניתוח מערכות", "תכנון פתרונות", "איסוף דרישות", "אפיון פונקציונלי", "אפיון טכני", "מידול תהליכים עסקיים", "מידול נתונים", "תכנון לוגיקה עסקית", "UAT", "אספקה מקצה לקצה"],
        },
        {
          title: "אינטגרציה ונתונים",
          terms: ["REST APIs", "אינטגרציות בין מערכות", "SQL", "ETL", "SSIS", "מיפוי נתונים", "Workato", "Salesforce", "Priority ERP", "IAM", "IDM", "IGA", "Aveksa"],
        },
        {
          title: "פיתוח",
          terms: ["Node.js", "TypeScript", "JavaScript", "Supabase", "PostgreSQL", "Edge Functions", "RPC Functions", "Java", "JSP", "Git", "Microsoft SQL Server", "Microsoft Access", "VBA"],
        },
        {
          title: "כלי AI ואספקה",
          terms: ["Claude", "ChatGPT", "פיתוח בעזרת AI", "אב טיפוס מהיר", "ניפוי שגיאות", "ריפקטורינג", "יצירת נתוני בדיקה", "אוטומציה", "Agile", "Jira"],
        },
      ],
    },

    {
      type: "entries",
      icon: "cap",
      title: "השכלה",
      entries: [
        {
          title: "תוכנית ניהול מוצר",
          dates: "2021",
          lines: ["Product Experts"],
        },
        {
          title: "B.Sc. בהנדסת תעשייה וניהול",
          dates: "2004 - 2008",
          lines: ["התמחות במערכות מידע | אוניברסיטת בן גוריון בנגב"],
        },
      ],
    },

    {
      type: "lines",
      icon: "globe",
      title: "שפות",
      lines: ["עברית, שפת אם", "אנגלית, רמת עבודה"],
    },

    {
      type: "entries",
      icon: "shield",
      title: "שירות צבאי",
      entries: [
        {
          title: "לוחם ומפקד",
          dates: "1999 - 2002",
          lines: ["חיל ההנדסה הקרבית"],
        },
      ],
    },
  ],
};

export const cvPages = [cvEn, cvHe];
