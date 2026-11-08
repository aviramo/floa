/* ==========================================================================
   The built-in mail templates, Hebrew, RTL, plain table HTML with inline styles
   (mail clients throw away <style> blocks and often <html>/<body> attributes,
   so every element that holds text carries its own dir and alignment).

   A business overrides one by writing a row in roster_mail_templates; whatever
   it does not override comes from here. No external images, the business name
   is the brand, no em or en dash anywhere (the house rule for every text that
   reaches a reader).

   Placeholders: `{{x}}` escaped, `{{{x}}}` raw. `data-if="x"` on an element
   drops it when x is empty (see render.js). Variables: business_name,
   first_name, last_name, full_name, phone, email, age, gender, meeting_name,
   meeting_date, meeting_time, place, city, price, amount, method, directions
   (payment_confirmed only), my_link, pay_link, whatsapp_link, admin_link, and,
   for admin_account_linked and admin_phone_conflict only, account_email and
   account_name (the Google account: text a stranger typed, always escaped).

   Eight templates: admin_signup, admin_payment_reported, admin_account_linked,
   admin_phone_conflict (to the notify list) and registered, payment_confirmed,
   refund, registration_cancelled (to the participant).

   Participant mails carry, in the footer, the line saying why the person is
   getting it. mail.js checks for it after rendering (FOOTER_MARK) and adds it
   if a business template left it out, so it cannot be dropped by editing.
   ========================================================================== */

export const FOOTER_MARK = "הוזנה בטופס ההרשמה";

const INK = "#1B2B2E";
const MUTED = "#6B7A78";
const BRAND = "#0A6C61";
const LINE = "#DCE6E3";

const PARTICIPANT_FOOTER = "הודעה זו נשלחה כי הכתובת הזו הוזנה בטופס ההרשמה של {{business_name}}. אם זו טעות, אפשר להתעלם מההודעה.";
const ADMIN_FOOTER = "ההודעה נשלחה כי הכתובת הזו ברשימת ההתראות של {{business_name}}.";

const cell = (extra = "") => `dir="rtl" style="direction:rtl;text-align:right;${extra}"`;

const shell = (content, footer) => `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:${INK};direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td ${cell(`padding:0 4px 12px;font-size:18px;font-weight:bold;color:${BRAND}`)}>{{business_name}}</td></tr>
<tr><td ${cell(`background:#FFFFFF;border:1px solid ${LINE};border-radius:14px;padding:24px;font-size:15px;line-height:1.6`)}>
${content}
</td></tr>
<tr><td ${cell(`padding:14px 4px 0;font-size:12px;line-height:1.5;color:${MUTED}`)}>${footer}</td></tr>
</table>
</body>
</html>`;

const title = (text) => `<h1 ${cell(`margin:0 0 12px;font-size:20px;line-height:1.3;color:${INK}`)}>${text}</h1>`;
const para = (text, attrs = "", style = "") => `<p${attrs ? ` ${attrs}` : ""} ${cell(`margin:0 0 14px;${style}`)}>${text}</p>`;
const row = (label, value, only = "") =>
  `<tr${only ? ` data-if="${only}"` : ""}><td ${cell(`padding:6px 0;width:96px;color:${MUTED};vertical-align:top`)}>${label}</td><td ${cell("padding:6px 0;font-weight:bold;vertical-align:top")}>${value}</td></tr>`;
const table = (...rows) => `<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">\n${rows.join("\n")}\n</table>`;
const button = (label, href, only) =>
  `<p data-if="${only}" ${cell("margin:0 0 14px")}><a href="{{${href}}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:${BRAND};color:#FFFFFF;text-decoration:none;font-weight:bold">${label}</a></p>`;
const linkLine = (text, label, href) =>
  `<p data-if="${href}" ${cell("margin:0 0 10px")}>${text} <a href="{{${href}}}" style="color:${BRAND};font-weight:bold">${label}</a></p>`;

const meetingRows = [
  row("מפגש", "{{meeting_name}}"),
  row("תאריך", "{{meeting_date}}", "meeting_date"),
  row("שעה", "{{meeting_time}}", "meeting_time"),
  row("מקום", "{{place}}", "place"),
  row("עיר", "{{city}}", "city"),
];

export const DEFAULT_TEMPLATES = Object.freeze({
  admin_signup: Object.freeze({
    subject: "הרשמה חדשה: {{full_name}}",
    html: shell([
      title("הרשמה חדשה"),
      para("התקבלה הרשמה חדשה דרך האתר."),
      table(
        row("שם", "{{full_name}}"),
        row("טלפון", "{{phone}}", "phone"),
        row("אימייל", "{{email}}", "email"),
        row("גיל", "{{age}}", "age"),
        row("מין", "{{gender}}", "gender"),
      ),
      button("לפתיחת הכרטיס", "admin_link", "admin_link"),
    ].join("\n"), ADMIN_FOOTER),
  }),

  admin_payment_reported: Object.freeze({
    subject: "דווח תשלום: {{full_name}}",
    html: shell([
      title("דווח תשלום"),
      para("התקבל דיווח על תשלום, והוא ממתין לבדיקה. כדאי לוודא שהכסף הגיע ואז לרשום את התשלום בכרטיס."),
      table(
        row("משתתף", "{{full_name}}"),
        ...meetingRows,
        row("סכום", "{{amount}} ₪", "amount"),
      ),
      button("לפתיחת הכרטיס", "admin_link", "admin_link"),
    ].join("\n"), ADMIN_FOOTER),
  }),

  /* The personal area links a Google account to a participant by the phone number typed, with no proof that the
     account is theirs. Whoever it was, the business is told, and the way back is on the participant's card. */
  admin_account_linked: Object.freeze({
    subject: "חשבון Google חובר למשתתף: {{full_name}}",
    html: shell([
      title("חשבון חובר למשתתף קיים"),
      para("חשבון Google חובר למשתתף שכבר היה רשום, אחרי שהוקלד מספר הטלפון שלו. החיבור לא מוכיח שהחשבון שייך לאדם עצמו."),
      table(
        row("משתתף", "{{full_name}}"),
        row("טלפון", "{{phone}}", "phone"),
        row("חשבון", "{{account_email}}", "account_email"),
        row("שם בחשבון", "{{account_name}}", "account_name"),
      ),
      para("אם זה לא נראה נכון, אפשר לפתוח את כרטיס המשתתף ולנתק את החשבון או לחסום אותו."),
      button("לפתיחת הכרטיס", "admin_link", "admin_link"),
    ].join("\n"), ADMIN_FOOTER),
  }),

  admin_phone_conflict: Object.freeze({
    subject: "חשבון Google נוסף ניסה להתחבר: {{full_name}}",
    html: shell([
      title("ניסיון התחברות עם טלפון שכבר מחובר"),
      para("חשבון Google ניסה להתחבר עם מספר הטלפון של משתתף שכבר מחובר לחשבון אחר, והחיבור לא נעשה."),
      table(
        row("משתתף", "{{full_name}}"),
        row("טלפון", "{{phone}}", "phone"),
        row("החשבון שניסה", "{{account_email}}", "account_email"),
        row("שם בחשבון", "{{account_name}}", "account_name"),
      ),
      para("אם זה לא נראה נכון, אפשר לפתוח את כרטיס המשתתף ולנתק את החשבון או לחסום אותו."),
      button("לפתיחת הכרטיס", "admin_link", "admin_link"),
    ].join("\n"), ADMIN_FOOTER),
  }),

  registered: Object.freeze({
    subject: "שמרת מקום למפגש, נשאר לשלם",
    html: shell([
      para("שלום {{first_name}},", 'data-if="first_name"'),
      title("שמרת מקום למפגש:"),
      table(
        ...meetingRows,
        row("מחיר", "{{price}} ₪", "price"),
      ),
      para("המקום שלך שמור. נשאר להסדיר את התשלום."),
      button("לתשלום", "pay_link", "pay_link"),
      linkLine("אפשר גם לראות את המקום ששמרת ולשלם באזור האישי:", "לאזור האישי", "my_link"),
      linkLine("יש שאלה? אפשר לכתוב לנו ב־WhatsApp:", "לשיחה ב־WhatsApp", "whatsapp_link"),
    ].join("\n"), PARTICIPANT_FOOTER),
  }),

  payment_confirmed: Object.freeze({
    subject: "התשלום התקבל: {{meeting_name}}",
    html: shell([
      para("שלום {{first_name}},", 'data-if="first_name"'),
      title("התשלום התקבל"),
      para("המקום שלך שמור. מחכים לראות אותך."),
      table(...meetingRows),
      para("איך מגיעים", 'data-if="directions"', `font-weight:bold;margin-bottom:4px`),
      para("{{directions}}", 'data-if="directions"', "white-space:pre-line"),
      linkLine("את ההרשמה אפשר לראות באזור האישי:", "לאזור האישי", "my_link"),
      linkLine("יש שאלה? אפשר לכתוב לנו ב־WhatsApp:", "לשיחה ב־WhatsApp", "whatsapp_link"),
    ].join("\n"), PARTICIPANT_FOOTER),
  }),

  refund: Object.freeze({
    subject: "החזר כספי: {{business_name}}",
    html: shell([
      para("שלום {{first_name}},", 'data-if="first_name"'),
      title("בוצע החזר כספי"),
      para("החזרנו לך {{amount}} ₪."),
      table(
        row("סכום ההחזר", "{{amount}} ₪"),
        row("אמצעי", "{{method}}", "method"),
      ),
      linkLine("יש שאלה? אפשר לכתוב לנו ב־WhatsApp:", "לשיחה ב־WhatsApp", "whatsapp_link"),
    ].join("\n"), PARTICIPANT_FOOTER),
  }),

  registration_cancelled: Object.freeze({
    subject: "שמירת המקום שלך למפגש בוטלה",
    html: shell([
      para("שלום {{first_name}},", 'data-if="first_name"'),
      title("שמירת המקום שלך למפגש הזה בוטלה:"),
      table(
        row("מפגש", "{{meeting_name}}"),
        row("תאריך", "{{meeting_date}}", "meeting_date"),
        row("שעה", "{{meeting_time}}", "meeting_time"),
      ),
      para("אם זו טעות, או כדי לשמור מקום שוב, אפשר לפנות אלינו."),
      linkLine("אפשר גם לשמור מקום מחדש באזור האישי:", "לאזור האישי", "my_link"),
      linkLine("יש שאלה? אפשר לכתוב לנו ב־WhatsApp:", "לשיחה ב־WhatsApp", "whatsapp_link"),
    ].join("\n"), PARTICIPANT_FOOTER),
  }),
});

export const TEMPLATE_KEYS = Object.freeze(Object.keys(DEFAULT_TEMPLATES));

/* which of them go to a participant, and so carry the footer line and count
   against the abuse limits; the rest go to the business's notify list */
export const PARTICIPANT_TEMPLATES = Object.freeze(new Set([
  "registered", "payment_confirmed", "refund", "registration_cancelled",
]));
