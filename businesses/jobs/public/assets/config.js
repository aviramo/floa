/* What the app needs from outside. The database is NOT here: it is the
   domain's, loaded from /supabase.js. */
window.JOBS_CONFIG = {
  supabaseUrl: window.SUPABASE.url,
  supabaseAnonKey: window.SUPABASE.anonKey,
  agentsTable: "job_agents",
  bucket: "job-cvs",
  parseEndpoint: "https://floa-lead.floa-il.workers.dev/parse-cv",
  /* the app lives at /jobs/ */
  base: "/jobs/",

  /* The catalog an agent's roles are picked from. The CV reader chooses from
     this same list, so the two can never disagree about a name. */
  roles: [
    "מפתח/ת Full Stack", "מפתח/ת Frontend", "מפתח/ת Backend", "מפתח/ת מובייל", "DevOps",
    "QA ובדיקות תוכנה", "מדעי הנתונים", "אנליסט/ית נתונים", "BI", "מנהל/ת מוצר",
    "מעצב/ת UX/UI", "מנהל/ת פרויקטים", "מנהל/ת תפעול", "איש/ת מכירות", "מנהל/ת חשבון",
    "שירות לקוחות", "נציג/ת תמיכה טכנית", "שיווק דיגיטלי", "מנהל/ת תוכן", "קופירייטר/ית",
    "הנהלת חשבונות", "כלכלן/ית", "מנהל/ת כספים", "משאבי אנוש", "גיוס ומשאבי אנוש",
    "מזכיר/ה ואדמיניסטרציה", "לוגיסטיקה ושרשרת אספקה", "מחסנאי/ת", "נהג/ת", "טכנאי/ת",
    "מהנדס/ת חשמל", "מהנדס/ת מכונות", "מהנדס/ת תעשייה וניהול", "אדריכל/ית", "עורך/ת דין",
    "מורה ומחנך/ת", "אח/ות ורפואה", "מנהל/ת מסעדה", "טבח/ית", "מנהל/ת חנות"
  ]
};
