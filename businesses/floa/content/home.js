/* The homepage's copy, and the site's: FLOA is one page. What it sells, what it
   built, how the work goes and who is behind it all live here, once each. What it
   shares with the campaign page (the projects, the form, the footer) it imports. */
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
    text: "אתרים, אפליקציות, אוטומציות וסוכני AI שבנויים סביב העסק שלכם",
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

  /* The film beside the opening: the mess of a business becomes one flow, through
     advice, websites and landing pages, apps, automations and AI. Its source
     (scene, settings, how to render it again) is businesses/floa/motion-hero-flow/. */
  heroMotion: {
    label: "אנימציה: FLOA, ייעוץ, פיתוח וליווי של אתרים, אפליקציות ואוטומציות עם AI. הבלגן של עסק הופך לזרימה אחת, דרך ייעוץ, אתרים ודפי נחיתה, אפליקציות, אוטומציות ו־AI",
    wide: { src: "assets/hero-flow.mp4", poster: "assets/hero-flow-poster.webp", width: 1640, height: 940 },
    tall: { src: "assets/hero-flow-tall.mp4", poster: "assets/hero-flow-tall-poster.webp", width: 880, height: 1100 },
  },

  /* What is sold. Two things, each as a column: the pain in the reader's own words, what gets
     built, the one line that is true of how, and a way to talk about exactly this. The pain is
     said HERE and nowhere else on the page (the film and the scroll scene set it up; this is
     where it becomes a choice). */
  build: {
    head: {
      eyebrow: "מה בונים",
      title: "איפה זה תקוע אצלכם?",
      text: "אפשר להתחיל מאחד, והשני מתחבר כשצריך",
    },
    panels: [
      {
        icon: "website",
        title: "אתר, אפליקציה או דף נחיתה",
        pain: "מבקרים נכנסים, לא מבינים מה לעשות, ועוזבים בלי להשאיר פרטים",
        items: [
          "אתר תדמית או אתר שירותים",
          "דף נחיתה עם מסר מחודד",
          "אפליקציית Web או Mobile",
          "שדרוג של אתר או מוצר קיים",
        ],
        note: "מאפיון וחידוד המסר ועד עיצוב, פיתוח וחיבור לטופס, לתשלום ול־WhatsApp",
        proof: "בין העבודות: Once, אקורדים ויוצאים להרפתקה",
        cta: { label: "לשיחה על אתר או אפליקציה", waText: "היי, אני רוצה לבדוק אתר, אפליקציה או דף נחיתה" },
      },
      {
        icon: "automation",
        title: "מערכת, אוטומציה או סדר בתהליך",
        pain: "העבודה נעשית ביד, בין כלים שלא מדברים, ומשהו תמיד נופל בין הכיסאות",
        items: [
          "מערכת ניהול מותאמת לעסק",
          "אוטומציה של פעולות שחוזרות",
          "חיבור בין מערכות קיימות",
          "ממשק ניהול, בקרות והרשאות",
        ],
        note: "לא תמיד צריך מערכת חדשה: לפעמים מספיק לחבר את מה שכבר יש",
        proof: "בין העבודות: עיריית תל אביב, דפוס אאוטלט ו־Roster",
        cta: { label: "לשיחה על מערכת או אוטומציה", waText: "היי, אני רוצה לבדוק מערכת או אוטומציה לעסק" },
      },
    ],
  },

  /* The work: the proof. Three with a picture first (nothing to read, only to see), the rest
     one click away on the same page. */
  work: {
    head: { eyebrow: "עבודות", title: "לא מצגות. דברים שעובדים" },
    featured: ["once", "chords", "perfecti"],
    more: ["harpatka", "roster", "aum", "telaviv", "outlet"],
    moreLabel: "עוד עבודות",
  },

  /* Working with AI and agents. It sits under the work, in a band of its own: the claim and
     its evidence belong together. Every card names something that exists (Chords reads a
     photographed sheet through the Worker, the Facebook account is run by agents, this very
     site is built beside a coding agent) and the last one says who decides. */
  ai: {
    lead: {
      icon: "sparkle",
      badge: "AI וסוכנים",
      title: "עובדים עם AI וסוכנים, בעבודה עצמה",
      text: "סוכנים שמריצים קמפיינים, מודלים שקוראים תמונות וסוכני קוד שבונים איתנו את המוצר. כך מגיעים מהר יותר למשהו שרץ",
    },
    items: [
      {
        icon: "automation",
        title: "סוכנים לפייסבוק",
        text: "קוראים את הנתונים, מזהים מה עובד ומה שורף תקציב, ומריצים שינויים בחשבון הפרסום",
      },
      {
        icon: "picture",
        title: "עיבוד תמונה",
        text: "מצלמים דף אקורדים, והמודל קורא אותו ומציב כל אקורד על ההברה שלו. כך עובדת האפליקציה אקורדים",
      },
      {
        icon: "link",
        title: "אוטומציות ונתונים",
        text: "מיילים, טפסים ונתוני פרסום הופכים אוטומטית למשימות ולסיכומים, כמו אצל דפוס אאוטלט",
      },
      {
        icon: "shield",
        title: "אדם מחליט ומאשר",
        text: "הסוכנים עושים את העבודה החוזרת. שינוי בחשבון, בדף או בנתונים לא קורה בלי אישור",
      },
    ],
  },

  /* How the work goes. Three steps, and each one carries what used to be a section of its own
     (understand before building, connect only what is needed, stay after the launch). */
  how: {
    head: { eyebrow: "איך עובדים", title: "כך עובדים, בשלושה שלבים" },
    picture: {
      src: "assets/systems-devices.svg",
      width: 800,
      height: 600,
      alt: "מחשב נייד וטלפון על המים, עם ממשקים עסקיים נקיים",
    },
    steps: [
      { title: "מיפוי", text: "שיחה קצרה שבה מבינים איך העסק עובד ומה מעכב אותו, לפני שבוחרים כלי. בסופה מקבלים תכנית עבודה ולוחות זמנים" },
      { title: "בנייה וחיבור", text: "מחברים את מה שכבר יש לפני שמוסיפים כלי חדש, ובונים למי שישתמש בזה בפועל" },
      { title: "עלייה וליווי", text: "עולים לאוויר ונשארים איתכם, ומשפרים לפי השימוש האמיתי" },
    ],
  },

  about: {
    eyebrow: "אודות",
    title: "אני אופיר אבירם, המייסד של FLOA",
    portrait: { src: "assets/ofir.webp", width: 132, height: 132, alt: "אופיר אבירם, מייסד FLOA" },
    paragraphs: [
      "יותר מ־15 שנה אני מתכנן ובונה מערכות ומוצרים דיגיטליים בארגונים גדולים. הקמתי את FLOA כדי שלעסק תהיה כתובת אחת שמבינה את הצורך, בונה ומלווה עד שזה עובד",
    ],
  },

  /* the one loud ask in the middle of the page, right before the form */
  cta: {
    title: "מספיק לבוא רק עם הבעיה",
    text: "בשיחת מיפוי קצרה נבין מה מעכב את העסק ומה כדאי לבנות קודם",
  },
};
