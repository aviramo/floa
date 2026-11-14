/* What clients said. Each page chooses which of these are relevant to it. */
export const quotes = {
  erez: {
    name: "ארז",
    role: "דפוס אאוטלט",
    text: "היום כל פנייה שמגיעה במייל הופכת אוטומטית לכרטיס עבודה ב־Trello ונכנסת לתהליך מסודר וברור. זה בעיקר יצר סדר שמונע מאיתנו לפספס הזמנות",
  },
  itzik: {
    name: "איציק",
    role: "עיריית תל אביב",
    text: "אופיר אפיין תהליך מקצה לקצה שחיבר בין אגפים שונים בעיריית תל אביב. משימה שנפתחת באגף אחד מפעילה באופן מסודר פעולה באגף אחר, דרך ממשק ברור הכולל בקרות ותהליכי עבודה מובנים. כך נוצר לראשונה תהליך רציף ושיתוף פעולה בין מחלקות שבעבר עבדו בנפרד",
  },
};

/* pick("itzik", "erez") -> the two, in that order */
export const pick = (...keys) => keys.map((key) => quotes[key]);
