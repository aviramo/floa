/* What ProLink's clients said. The page chooses which to show and in what
   order; the component only knows how to set them. { name, role, text } */
export const quotes = {
  weizmann: {
    name: "סטיב דרוק",
    role: "מכון ויצמן למדע",
    text: "מדובר בשירות ומקצוענות שהם מעל ומעבר.",
  },
  menora: {
    name: "גבי שובל",
    role: "מנהל אגף מערכות, מנורה מבטחים",
    text: "הצוות המקצועי והניהולי של חברת פרולינק מלווה אותנו במקצועיות ואמינות רבה.",
  },
  biu: {
    name: "אוניברסיטת בר אילן",
    role: "מערך IT",
    text: "הם יודעים לנתח נושאים בראייה מערכתית ויחד עם זאת לרדת לפרטים הקטנים. מומחים בתחומם.",
  },
  haifa: {
    name: "הרקולס אנדראוס",
    role: "מנהל Middleware ואבטחה, אוניברסיטת חיפה",
    text: "אני מאוד מרוצה מהשירות שהם נותנים לנו. הם מקצועיים, מהימנים ונעים לעבוד איתם.",
  },
  jce: {
    name: "יאיר נוה",
    role: "מנהל IT, המכללה האקדמית להנדסה בירושלים",
    text: "זכינו לשירות מעולה, איכות ללא פשרות, יצירתיות וגמישות.",
  },
  cal: {
    name: "יאיר רובין",
    role: "מנהל אבטחת מידע, ויזה כ.א.ל",
    text: "פרולינק הפגינה יצירתיות ומקצועיות בכל הקשור לממשקים עם מערכות מיוחדות.",
  },
};

/* pick("weizmann", "menora") -> the chosen quotes, in that order */
export const pick = (...keys) => keys.map((key) => quotes[key]);
