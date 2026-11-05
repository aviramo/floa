/* The homepage's own copy. Everything it shares with the solution pages — the
   process, the projects, the quotes, the form, the footer — it imports instead. */
export const home = {
  /* "What clients say" is hidden on the homepage, on purpose and for now. The
     quotes themselves stay in content/quotes.js; turning this on brings the
     section back exactly as it was. */
  showTestimonials: false,

  meta: {
    title: "\u200FFLOA | ייעוץ, פיתוח וליווי דיגיטלי לעסק",
    share: {
      title: "ייעוץ, פיתוח וליווי לעסק | FLOA",
      description: "אתרים, אפליקציות, אוטומציות וסוכני AI שבנויים סביב העסק שלכם. מבינים מה מעכב, בונים, ונשארים איתכם אחרי העלייה.",
    },
    description: "ייעוץ, פיתוח וליווי לעסק, עם AI וסוכנים. מבינים מה מעכב אתכם, בונים אתר, אפליקציה או אוטומציה שמחברים את העבודה, ונשארים איתכם גם אחרי העלייה.",
  },

  /* the share card. `title` is the ONLY text on it, so it has to carry the page
     on its own, at a glance, on a phone. See scripts/gen_og.mjs. */
  og: {
    image: "assets/og-home-v2.jpg",
    title: "ייעוץ, פיתוח וליווי לעסק",
    alt: "FLOA. ייעוץ, פיתוח וליווי לעסק: חמישה שערים על נהר אחד, מייעוץ ועד AI",
  },

  pageName: "דף הבית",
  waText: "היי, הגעתי דרך אתר FLOA ואשמח לשיחה קצרה",
  waLabel: "לשיחת WhatsApp",

  hero: {
    title: "ייעוץ, פיתוח וליווי שהופכים בלגן לזרימה אחת",
    text: "אתרים, אפליקציות, אוטומציות וסוכני AI שבנויים סביב העסק שלכם: מבינים מה מעכב אותו, בונים את מה שמחבר הכול, ונשארים איתכם אחרי העלייה",
  },

  /* The scroll scene between the opening and the question. Three sentences, told in
     turn as the page is scrolled (see components/scroll-flow). It claims nothing about
     numbers: the two counters count the twelve things on the stage itself. */
  flowStory: {
    label: "איך עסק שזורם נראה, בגלילה: הדברים שמפוזרים מתחברים לזרם אחד",
    icons: ["whatsapp", "doc", "leads", "link", "app", "system", "chart", "automation", "picture", "website", "target", "sparkle"],
    lines: [
      { title: "כשהעבודה מפוזרת, העסק מתעכב", text: "הודעה נשכחת, משימה נופלת בין הכיסאות, ומה שחשוב מחכה בתור" },
      { title: "כשהכול מחובר, העבודה מתחילה לזרום", text: "כל פנייה מגיעה למקום הנכון, בלי להעתיק ובלי לרדוף" },
      { title: "עסק שזורם הוא עסק טוב", text: "פחות עבודה ידנית, ויותר זמן למה שחשוב באמת" },
    ],
    counters: { lost: "נופלים בין הכיסאות", flowing: "זורמים למקום הנכון" },
  },

  /* The portfolio on the homepage is a strip, not a gallery: three of the works, and
     a tile that opens the page with all of them. */
  workStrip: {
    featured: ["once", "chords", "perfecti"],
    all: { title: "כל העבודות", cta: "לתיק העבודות", icon: "picture" },
  },

  /* The film beside the opening: the mess of a business becomes one flow, through
     advice, websites and landing pages, apps, automations and AI. Its source
     (scene, settings, how to render it again) is businesses/floa/motion-hero-flow/. */
  heroMotion: {
    label: "אנימציה: FLOA, ייעוץ, פיתוח וליווי של אתרים, אפליקציות ואוטומציות עם AI. הבלגן של עסק הופך לזרימה אחת, דרך ייעוץ, אתרים ודפי נחיתה, אפליקציות, אוטומציות ו־AI",
    wide: { src: "assets/hero-flow.mp4", poster: "assets/hero-flow-poster.webp", width: 1640, height: 940 },
    tall: { src: "assets/hero-flow-tall.mp4", poster: "assets/hero-flow-tall-poster.webp", width: 880, height: 1100 },
  },

  solutions: {
    eyebrow: "פתרונות",
    title: "מה מעכב את העסק עכשיו?",
    text: "לא צריך לדעת איזה כלי לבקש. מספיק לזהות את הבעיה שמרגישים ביום־יום",
  },

  problem: {
    head: {
      eyebrow: "המצב היום",
      title: "כל יום שהחיבורים חסרים, העסק משלם על זה",
      text: "פעולה שנעשית שוב ביד ומידע שיושב במקום הלא נכון עולים לעסק בזמן, בכסף ובטעויות",
    },
    items: [
      { title: "עבודה ידנית שחוזרת על עצמה", text: "העתקות, הודעות, מסמכים ותזכורות נעשים שוב ושוב במקום לקרות אוטומטית" },
      { title: "מידע שמפוזר בין מערכות וקבצים", text: "משימות, מסמכים ונתונים יושבים בכלים שונים, ואף אחד לא רואה את התמונה המלאה" },
      { title: "כלים שלא מדברים זה עם זה", text: "כל כלי עובד בפינה שלו, ושום דבר לא זורם ביניהם בלי שמישהו יעביר אותו ביד" },
    ],
    beforeAfter: {
      before: { tag: "לפני FLOA", text: "Excel, טפסים, קבצים מפוזרים, ספקים שונים ומעקב ידני" },
      after: { tag: "עם FLOA", text: "מוצר דיגיטלי ברור ותהליך עבודה אחד שמחבר בין הכלים" },
    },
  },

  approach: {
    head: {
      eyebrow: "הגישה",
      title: "לא עוד פתרונות מנותקים. דיגיטל שעובד סביב העסק",
      text: "קודם מבינים איך העסק עובד, איפה הוא נתקע ומה ייצור את השינוי הגדול ביותר, ורק אז מתכננים ומחברים את מה שבאמת צריך",
    },
    intro: "במשך שנים עבדתי בחברות וארגונים גדולים בנקודת החיבור שבין הצורך העסקי לפיתוח הטכנולוגי, להבין מה באמת צריך, לתרגם אותו למערכת נכונה ולוודא שהיא עובדת גם בפועל",
    picture: {
      src: "assets/systems-devices.svg",
      width: 800,
      height: 600,
      alt: "מחשב נייד וטלפון עם ממשקים עסקיים נקיים ומודרניים",
    },
    principles: [
      { title: "מבינים לפני שבונים", text: "לומדים את העסק, הלקוחות והתהליכים לפני שבוחרים טכנולוגיה" },
      { title: "מחברים רק מה שצריך", text: "לא מוסיפים עוד כלים אם אפשר לפשט, לבטל או לחבר את מה שכבר קיים" },
      { title: "בונים לשימוש אמיתי", text: "הפתרון צריך להיות ברור ונוח לעובדים וללקוחות ולא רק להיראות טוב בהדגמה" },
    ],
  },

  /* Working with AI and agents. It sits inside the work section, directly under
     "not presentations, things that work": the claim and its evidence belong
     together. Every card names something that exists (Chords reads a photographed
     sheet through the Worker, the Facebook account is run by agents, this very
     site is built beside a coding agent) and the last one says who decides. */
  ai: {
    lead: {
      icon: "sparkle",
      badge: "AI וסוכנים",
      title: "עובדים עם AI וסוכנים, בעבודה עצמה",
      text: "לא כקישוט בעמוד אלא ככלי עבודה: סוכנים שמריצים קמפיינים, מודלים שקוראים תמונות, וסוכני קוד שבונים איתנו את המוצר. כך מגיעים מהר יותר למשהו שרץ, ועם פחות עבודה ידנית",
    },
    items: [
      {
        icon: "automation",
        title: "סוכנים לפייסבוק",
        text: "סוכנים שמנהלים קמפיינים: קוראים את הנתונים, מזהים מה עובד ומה שורף תקציב, ומריצים שינויים בחשבון הפרסום",
      },
      {
        icon: "picture",
        title: "עיבוד תמונה",
        text: "מצלמים דף אקורדים או מעלים PDF, והמודל קורא אותו ומציב כל אקורד על ההברה שלו. כך עובדת האפליקציה אקורדים",
      },
      {
        icon: "code",
        title: "פיתוח עם סוכני קוד",
        text: "אתרים ואפליקציות נבנים לצד סוכן קוד, עם בדיקות אוטומטיות. מהר יותר, והקוד נשאר קוד רגיל שאפשר להמשיך לעבוד איתו",
      },
      {
        icon: "link",
        title: "אוטומציות בין המערכות",
        text: "מיילים, טפסים והודעות הופכים אוטומטית למשימות בתהליך עבודה מסודר, כמו אצל דפוס אאוטלט, בלי הקלדה ידנית",
      },
      {
        icon: "chart",
        title: "נתונים שמסתכמים לבד",
        text: "נתוני פרסום, הרשמות ותשלומים נאספים למקום אחד ומסוכמים, כדי להחליט לפי מה שקורה ולא לפי תחושה",
      },
      {
        icon: "shield",
        title: "אדם מחליט ומאשר",
        text: "הסוכנים עושים את העבודה החוזרת. שינוי בחשבון, בדף או בנתונים לא קורה בלי אישור, כי האחריות נשארת אצלכם",
      },
    ],
  },

  advantage: {
    head: {
      eyebrow: "היתרון",
      title: "כשהכול מחובר, העסק יכול לזוז קדימה",
      text: "FLOA מחזיקה את התמונה המלאה, מהמסר וחוויית המשתמש ועד המערכת והתפעול",
    },
    items: [
      { title: "כתובת אחת במקום מספר ספקים", text: "לא צריך לתאם בנפרד בין בונה אתרים, מעצב, מפתח, איש אוטומציות וספק מערכות" },
      { title: "פתרון אחד במקום טלאים", text: "כל רכיב נבנה כחלק מאותו תהליך עסקי ולא כפתרון זמני שיוצר בעיה חדשה" },
      { title: "ליווי גם אחרי העלייה לאוויר", text: "הפתרון נטמע בעסק וממשיך להשתפר לפי השימוש האמיתי של העובדים והלקוחות" },
    ],
  },

  about: {
    eyebrow: "אודות",
    title: "אני אופיר אבירם, המייסד של FLOA",
    portrait: { src: "assets/ofir.webp", width: 132, height: 132, alt: "אופיר אבירם, מייסד FLOA" },
    paragraphs: [
      "כבר יותר מ־15 שנה אני מתכנן ובונה מערכות, מוצרים ותהליכים דיגיטליים",
      "הניסיון שלי משלב אפיון, ארכיטקטורה, פיתוח ומוצר. השילוב הזה מאפשר ל־FLOA להבין גם את הצורך העסקי, גם את חוויית המשתמש וגם את הדרך להפוך את הרעיון לפתרון שעובד בפועל",
      "הקמתי את FLOA כדי לתת לעסקים כתובת אחת שרואה את התמונה המלאה, מתכננת את הפתרון ומלווה מקצה לקצה",
    ],
    chips: ["15+ שנות ניסיון", "אפיון", "ארכיטקטורה", "פיתוח", "מוצר"],
    emphasis: "אני מתכנן דיגיטל לפי הצורך העסקי, לא לפי הכלי",
  },
};
