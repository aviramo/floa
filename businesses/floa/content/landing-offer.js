/* The landing-page-offer campaign page: a Facebook-campaign landing page for
   FLOA's own "landing page from 500 NIS" offer. Lives at /landing-page-offer/,
   separate from the two solution pages and never linked from the homepage nav
   it exists to answer one ad, not to join the site's own menu.

   The only price on the page is the starting price, and it is always written
   "החל מ־500 ₪". No ceiling, no tiers: the brief is deliberately silent on what
   a bigger job costs, so this file must stay silent too. The business is not
   VAT-registered, so no price on the page mentions VAT either way. */

export const landingOffer = {
  slug: "landing-page-offer",

  pageName: "דף נחיתה החל מ־500 ₪",
  waText: "היי אופיר, ראיתי את דף הנחיתה החל מ־500 ₪ ואשמח לבדוק אם המסלול מתאים לעסק שלי",

  meta: {
    title: "דף נחיתה מקצועי החל מ־500 ₪ | FLOA",
    description: "דף נחיתה מקצועי ומותאם למובייל החל מ־500 ₪. אפשר להתחיל מדף פשוט או להוסיף חידוד מסרים, עיצוב ייחודי, אנימציות ואוטומציות",
  },

  og: {
    image: "assets/og-landing-offer.png",
    title: "דף נחיתה מקצועי החל מ־500 ₪",
    alt: "FLOA. דף נחיתה מקצועי החל מ־500 ₪",
  },

  hero: {
    chip: "דף נחיתה לעסק",
    title: "דף נחיתה מקצועי החל מ־500 ₪",
    text: "פתרון פשוט לעסק שצריך להציג שירות, לפרסם מבצע או להתחיל לקבל פניות, בלי להיכנס להפקה גדולה ויקרה",
    /* The primary CTA doubles as the label of the sticky mobile dock, so it has
       to stay short enough to sit on one line inside the button. */
    waLabel: "בדקו אם דף ב־500 ₪ מתאים",
    secondaryLabel: "מה כולל דף החל מ־500 ₪?",
    note: "המחיר תלוי בהיקף הדף ובחומרים הקיימים",
    mockAlt: "מחשב וטלפון עם דף נחיתה לדוגמה: כותרת, תמונה וכפתור יצירת קשר",
  },

  who: {
    head: {
      eyebrow: "למי זה מתאים",
      title: "לא לכל עסק צריך לבנות עכשיו אתר שלם",
      text: "לפעמים צריך רק מקום אחד ברור שאליו אפשר להפנות לקוחות, להסביר מה מציעים ולהוביל אותם לשיחה או להשארת פרטים",
    },
    items: [
      { title: "עסק שעדיין אין לו דף", text: "צריך כתובת מקצועית שאפשר לשלוח ללקוחות או לפרסם ברשתות" },
      { title: "דף קיים שלא מייצר פניות", text: "המסר לא ברור, העיצוב מיושן או שלא נוח להשתמש בו במובייל" },
      { title: "שירות או מבצע חדש", text: "צריך דף ממוקד שמציג הצעה אחת בלי הסחות דעת" },
      { title: "בדיקת רעיון חדש", text: "רוצים להתחיל בצורה פשוטה לפני שמשקיעים באתר או במערכת גדולה" },
    ],
  },

  included: {
    head: {
      eyebrow: "מה כולל",
      title: "כל מה שצריך כדי לעלות לאוויר בצורה פשוטה ומקצועית",
    },
    items: [
      { title: "דף המבוסס על מבנה עיצובי קיים" },
      { title: "עד חמישה אזורי תוכן" },
      { title: "התאמה מלאה למובייל ולמחשב" },
      { title: "כותרת, טקסטים ותמונות שהלקוח מספק" },
      { title: "כפתור WhatsApp" },
      { title: "טופס השארת פרטים בסיסי" },
      { title: "חיבור לקישורים ולרשתות החברתיות" },
      { title: "סבב תיקונים אחד" },
      { title: "העלאה לאוויר" },
    ],
    clarify: "המסלול מתאים לעסק שכבר יודע מה הוא רוצה להציג ויש לו טקסטים ותמונות מוכנים",
    fine: "דומיין, אחסון, שירותים חיצוניים ועבודות שאינן כלולות ברשימה יתומחרו בנפרד",
  },

  tracks: {
    head: {
      eyebrow: "שתי דרכים להתחיל",
      title: "אפשר להתחיל פשוט. אפשר גם להגיע הרבה יותר רחוק",
      text: "לא כל דף נחיתה דורש את אותו תהליך. מתחילים ממה שהעסק באמת צריך ומרחיבים רק במקומות שבהם זה יוצר ערך",
    },
    items: [
      {
        title: "דף פשוט ומהיר",
        items: [
          "מבנה קיים ומוכח",
          "חומרים מוכנים של העסק",
          "עיצוב נקי",
          "WhatsApp או טופס",
          "מתאים להצעה ברורה וממוקדת",
        ],
        cta: "זה מה שאני צריך",
        href: "#contact",
        analytics: "simple_track_select",
      },
      {
        title: "דף מותאם לעסק",
        /* Six lines, no more: the list is a promise of depth, not an inventory.
           Anything longer stops being read and starts being skimmed. */
        items: [
          "אפיון קהל היעד וההצעה",
          "חידוד המסרים וכתיבה שיווקית",
          "עיצוב ייחודי ובחירת תמונות",
          "אנימציות ואינטראקציות",
          "טפסים מתקדמים, הרשמה וסליקה",
          "חיבור ל־CRM, אוטומציות ומדידת המרות",
        ],
        cta: "אני צריך משהו מתקדם יותר",
        href: "digital-products/",
        accent: "teal",
        analytics: "advanced_track_select",
      },
    ],
  },

  /* There is no "grow" section here any more. It walked the visitor from a plain
     page to a full experience, which is exactly what the two tracks above already
     say, and saying it twice made the page feel like it was stalling. */

  work: {
    head: {
      eyebrow: "עבודה קיימת",
      title: "דפי נחיתה שכבר עובדים בפועל",
    },
    project: "harpatka",
    /* The one example on the page is a full custom build, not a 500 ₪ page.
       Saying so next to it keeps the starting price honest. */
    note: "דוגמה לדף במסלול מותאם ומתקדם",
  },

  process: {
    head: {
      eyebrow: "איך זה עובד",
      title: "מתחילים בשיחה קצרה ומבינים מה באמת צריך",
    },
    steps: [
      { title: "שולחים את החומרים", text: "מסבירים מה השירות ומעבירים טקסטים, תמונות ודוגמאות" },
      { title: "מגדירים את היקף העבודה", text: "בודקים אם המסלול הבסיסי מתאים או שנדרש תהליך רחב יותר" },
      { title: "בונים ועולים לאוויר", text: "מקימים את הדף, מתאימים למובייל ומחברים את דרך יצירת הקשר" },
    ],
  },

  about: {
    eyebrow: "אודות",
    title: "לא רק בונה דפים. מבין מה העסק צריך להשיג",
    portrait: { src: "assets/ofir.webp", width: 132, height: 132, alt: "אופיר אבירם, מייסד FLOA" },
    paragraphs: [
      "אני אופיר אבירם, המייסד של FLOA. כבר יותר מ־15 שנה אני נמצא בנקודת החיבור שבין הצורך העסקי לפתרון הטכנולוגי, מאפיון וחידוד המסר ועד עיצוב, פיתוח וחיבור המערכות שמאחורי הדף",
    ],
    chips: ["15+ שנות ניסיון", "אפיון", "חוויית משתמש", "פיתוח", "אוטומציות"],
  },

  faq: {
    head: { eyebrow: "שאלות נפוצות", title: "מה שרוב העסקים שואלים לפני שמתחילים" },
    items: [
      { q: "כמה באמת עולה הדף?", a: "המחיר הוא החל מ־500 ₪, לדף פשוט המבוסס על מבנה קיים ובתנאי שהטקסטים והתמונות מוכנים. לפני שמתחילים מגדירים בדיוק מה כלול" },
      { q: "תוך כמה זמן הדף מוכן?", a: "דף בסיסי יכול להיות מוכן בתוך מספר ימי עבודה, בהתאם לזמינות החומרים והאישורים מצד הלקוח" },
      { q: "מה קורה אם אין לי טקסטים מוכנים?", a: "אפשר להוסיף תהליך של חידוד ההצעה וכתיבת המסרים כך שהלקוחות יבינו במהירות מה אתם מציעים ולמה לפנות אליכם" },
      { q: "אפשר להוסיף אנימציות ועיצוב ייחודי?", a: "כן. אפשר לבנות דף מותאם לחלוטין עם עיצוב ייחודי, תמונות, אנימציות ואינטראקציות" },
      { q: "אפשר לחבר טופס, תשלום או WhatsApp?", a: "כן. בהתאם לצורך אפשר לחבר טפסים, WhatsApp, הרשמה, סליקה, מערכות ניהול ואוטומציות" },
      { q: "האם הדף מתאים למובייל?", a: "כן. כל דף נבנה ומותאם גם לטלפונים ניידים" },
      { q: "האם דומיין ואחסון כלולים?", a: "הם אינם כלולים במחיר ההתחלתי וייבדקו בהתאם לתשתית שכבר קיימת לעסק" },
    ],
  },

  /* The ask. The panel itself, the fields, the submit, the note and the WhatsApp
     button under the rule are the site's shared contact form (contactContent in
     site.js), exactly as the homepage and the solution pages render it: a name
     and a phone number, nothing more. Only the heading above it is this
     campaign's own. */
  closing: {
    head: {
      eyebrow: "השארת פרטים",
      title: "רוצים לבדוק אם דף החל מ־500 ₪ מתאים לעסק שלכם?",
      text: "השאירו שם וטלפון ואחזור אליכם כדי להבין מה הדף צריך לעשות",
    },
    waLabel: "לבדיקה קצרה ב־WhatsApp",
  },

  /* Meta Pixel / GA4: wired but off. Both stay empty until the site owner
     hands over real IDs, so nothing loads and nothing is invented. */
  analyticsIds: {
    ga4: "",
    metaPixel: "",
  },
};
