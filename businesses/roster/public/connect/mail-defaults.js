/* =====================================================================
   Roster: the built-in mail templates, as plain data.

   THIS IS AN EXACT COPY of DEFAULT_TEMPLATES in
   worker/src/roster/mail-defaults.js (every subject and every html, byte for
   byte). The Worker sends them whenever a business has not written its own (a
   row in roster_mail_templates overrides one by key). The connect page cannot
   import from the Worker, so it carries this copy to show a template before it
   is customised, to preview it, and to start the editor from it.

   When a default changes in the Worker, change it here the same way. To check
   that the two still agree (from this folder; prints "identical" or what differs):

     node --input-type=module -e "import { DEFAULT_TEMPLATES } from '../../../../worker/src/roster/mail-defaults.js'; globalThis.window = {}; await import('./mail-defaults.js'); const mine = window.ROSTER_MAIL_DEFAULTS; const bad = Object.keys(DEFAULT_TEMPLATES).filter((k) => !mine[k] || mine[k].subject !== DEFAULT_TEMPLATES[k].subject || mine[k].html !== DEFAULT_TEMPLATES[k].html); console.log(bad.length ? 'differs: ' + bad : 'identical')"

   Shape, per key:
     name      the Hebrew name shown in the editor (this page's own)
     who       "admin" (the notify list) or "participant" (carries the why-you-got-this line)
     when      one Hebrew sentence: what makes this mail go out (this page's own)
     vars      the placeholders the editor offers as chips
     subject   the subject line                      (the Worker's)
     html      the whole mail, a document            (the Worker's)

   Placeholders: {{x}} is HTML-escaped, {{{x}}} is inserted raw, except the
   fields a participant typed (first_name, last_name, full_name, phone, email,
   age, gender) and method, which are ALWAYS escaped. An element p, tr, li, a or
   span carrying data-if="x" is removed when x is empty. A participant mail whose
   text lacks the phrase "הוזנה בטופס ההרשמה" gets the why-you-got-this
   line added by the Worker.
   ===================================================================== */
(function (root) {
  "use strict";

  var VARS = ["business_name", "first_name", "last_name", "full_name", "phone", "email", "age", "gender", "account_email", "account_name", "meeting_name", "meeting_date", "meeting_time", "place", "city", "price", "amount", "method", "directions", "my_link", "pay_link", "whatsapp_link", "admin_link"];

  root.ROSTER_MAIL_DEFAULTS = {
  admin_signup: {
    name: "התראה על משתתף חדש",
    who: "admin",
    when: "נשלח למנהלים כשנרשם משתתף חדש (באמת חדש).",
    vars: VARS,
    subject: "הרשמה חדשה: {{full_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">הרשמה חדשה</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">התקבלה הרשמה חדשה דרך האתר.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שם</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{full_name}}</td></tr>
<tr data-if="phone"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">טלפון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{phone}}</td></tr>
<tr data-if="email"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">אימייל</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{email}}</td></tr>
<tr data-if="age"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">גיל</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{age}}</td></tr>
<tr data-if="gender"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מין</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{gender}}</td></tr>
</table>
<p data-if="admin_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px"><a href="{{admin_link}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#0A6C61;color:#FFFFFF;text-decoration:none;font-weight:bold">לפתיחת הכרטיס</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">ההודעה נשלחה כי הכתובת הזו ברשימת ההתראות של {{business_name}}.</td></tr>
</table>
</body>
</html>`,
  },
  admin_payment_reported: {
    name: "התראה על דיווח תשלום",
    who: "admin",
    when: "נשלח למנהלים כשמשתתף מדווח שהוא שילם.",
    vars: VARS,
    subject: "דווח תשלום: {{full_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">דווח תשלום</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">התקבל דיווח על תשלום, והוא ממתין לבדיקה. כדאי לוודא שהכסף הגיע ואז לרשום את התשלום בכרטיס.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">משתתף</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{full_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מפגש</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_name}}</td></tr>
<tr data-if="meeting_date"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">תאריך</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_date}}</td></tr>
<tr data-if="meeting_time"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שעה</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_time}}</td></tr>
<tr data-if="place"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מקום</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{place}}</td></tr>
<tr data-if="city"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">עיר</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{city}}</td></tr>
<tr data-if="amount"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">סכום</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{amount}} ₪</td></tr>
</table>
<p data-if="admin_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px"><a href="{{admin_link}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#0A6C61;color:#FFFFFF;text-decoration:none;font-weight:bold">לפתיחת הכרטיס</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">ההודעה נשלחה כי הכתובת הזו ברשימת ההתראות של {{business_name}}.</td></tr>
</table>
</body>
</html>`,
  },
  admin_account_linked: {
    name: "התראה על קישור חשבון לכרטיס",
    who: "admin",
    when: "נשלח למנהלים כשחשבון Google קושר, באזור האישי, למשתתף שכבר קיים.",
    vars: VARS,
    subject: "חשבון Google חובר למשתתף: {{full_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">חשבון חובר למשתתף קיים</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">חשבון Google חובר למשתתף שכבר היה רשום, אחרי שהוקלד מספר הטלפון שלו. החיבור לא מוכיח שהחשבון שייך לאדם עצמו.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">משתתף</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{full_name}}</td></tr>
<tr data-if="phone"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">טלפון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{phone}}</td></tr>
<tr data-if="account_email"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">חשבון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{account_email}}</td></tr>
<tr data-if="account_name"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שם בחשבון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{account_name}}</td></tr>
</table>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">אם זה לא נראה נכון, אפשר לפתוח את כרטיס המשתתף ולנתק את החשבון או לחסום אותו.</p>
<p data-if="admin_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px"><a href="{{admin_link}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#0A6C61;color:#FFFFFF;text-decoration:none;font-weight:bold">לפתיחת הכרטיס</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">ההודעה נשלחה כי הכתובת הזו ברשימת ההתראות של {{business_name}}.</td></tr>
</table>
</body>
</html>`,
  },
  admin_phone_conflict: {
    name: "התראה על ניסיון קישור לטלפון תפוס",
    who: "admin",
    when: "נשלח למנהלים כשמישהו מנסה לקשר חשבון Google לטלפון שכבר מקושר לחשבון אחר.",
    vars: VARS,
    subject: "חשבון Google נוסף ניסה להתחבר: {{full_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">ניסיון התחברות עם טלפון שכבר מחובר</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">חשבון Google ניסה להתחבר עם מספר הטלפון של משתתף שכבר מחובר לחשבון אחר, והחיבור לא נעשה.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">משתתף</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{full_name}}</td></tr>
<tr data-if="phone"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">טלפון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{phone}}</td></tr>
<tr data-if="account_email"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">החשבון שניסה</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{account_email}}</td></tr>
<tr data-if="account_name"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שם בחשבון</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{account_name}}</td></tr>
</table>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">אם זה לא נראה נכון, אפשר לפתוח את כרטיס המשתתף ולנתק את החשבון או לחסום אותו.</p>
<p data-if="admin_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px"><a href="{{admin_link}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#0A6C61;color:#FFFFFF;text-decoration:none;font-weight:bold">לפתיחת הכרטיס</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">ההודעה נשלחה כי הכתובת הזו ברשימת ההתראות של {{business_name}}.</td></tr>
</table>
</body>
</html>`,
  },
  registered: {
    name: "אישור שמירת מקום",
    who: "participant",
    when: "נשלח למשתתף ששמר מקום למפגש עתידי, אם יש לו מייל, הוא עוד לא שילם והמפגש לא חינם: איך משלמים.",
    vars: VARS,
    subject: "שמרת מקום למפגש, נשאר לשלם",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<p data-if="first_name" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">שלום {{first_name}},</p>
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">שמרת מקום למפגש:</h1>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מפגש</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_name}}</td></tr>
<tr data-if="meeting_date"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">תאריך</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_date}}</td></tr>
<tr data-if="meeting_time"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שעה</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_time}}</td></tr>
<tr data-if="place"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מקום</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{place}}</td></tr>
<tr data-if="city"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">עיר</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{city}}</td></tr>
<tr data-if="price"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מחיר</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{price}} ₪</td></tr>
</table>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">המקום שלך שמור. נשאר להסדיר את התשלום.</p>
<p data-if="pay_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px"><a href="{{pay_link}}" style="display:inline-block;padding:10px 22px;border-radius:999px;background:#0A6C61;color:#FFFFFF;text-decoration:none;font-weight:bold">לתשלום</a></p>
<p data-if="my_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">אפשר גם לראות את המקום ששמרת ולשלם באזור האישי: <a href="{{my_link}}" style="color:#0A6C61;font-weight:bold">לאזור האישי</a></p>
<p data-if="whatsapp_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">יש שאלה? אפשר לכתוב לנו ב־WhatsApp: <a href="{{whatsapp_link}}" style="color:#0A6C61;font-weight:bold">לשיחה ב־WhatsApp</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">הודעה זו נשלחה כי הכתובת הזו הוזנה בטופס ההרשמה של {{business_name}}. אם זו טעות, אפשר להתעלם מההודעה.</td></tr>
</table>
</body>
</html>`,
  },
  payment_confirmed: {
    name: "אישור תשלום",
    who: "participant",
    when: "נשלח למשתתף כשהתשלום על מפגש הושלם, פעם אחת לכל מפגש.",
    vars: VARS,
    subject: "התשלום התקבל: {{meeting_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<p data-if="first_name" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">שלום {{first_name}},</p>
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">התשלום התקבל</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">המקום שלך שמור. מחכים לראות אותך.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מפגש</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_name}}</td></tr>
<tr data-if="meeting_date"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">תאריך</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_date}}</td></tr>
<tr data-if="meeting_time"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שעה</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_time}}</td></tr>
<tr data-if="place"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מקום</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{place}}</td></tr>
<tr data-if="city"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">עיר</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{city}}</td></tr>
</table>
<p data-if="directions" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;font-weight:bold;margin-bottom:4px">איך מגיעים</p>
<p data-if="directions" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;white-space:pre-line">{{directions}}</p>
<p data-if="my_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">את ההרשמה אפשר לראות באזור האישי: <a href="{{my_link}}" style="color:#0A6C61;font-weight:bold">לאזור האישי</a></p>
<p data-if="whatsapp_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">יש שאלה? אפשר לכתוב לנו ב־WhatsApp: <a href="{{whatsapp_link}}" style="color:#0A6C61;font-weight:bold">לשיחה ב־WhatsApp</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">הודעה זו נשלחה כי הכתובת הזו הוזנה בטופס ההרשמה של {{business_name}}. אם זו טעות, אפשר להתעלם מההודעה.</td></tr>
</table>
</body>
</html>`,
  },
  refund: {
    name: "החזר כספי",
    who: "participant",
    when: "נשלח למשתתף כשנרשם עבורו החזר כספי.",
    vars: VARS,
    subject: "החזר כספי: {{business_name}}",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<p data-if="first_name" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">שלום {{first_name}},</p>
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">בוצע החזר כספי</h1>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">החזרנו לך {{amount}} ₪.</p>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">סכום ההחזר</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{amount}} ₪</td></tr>
<tr data-if="method"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">אמצעי</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{method}}</td></tr>
</table>
<p data-if="whatsapp_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">יש שאלה? אפשר לכתוב לנו ב־WhatsApp: <a href="{{whatsapp_link}}" style="color:#0A6C61;font-weight:bold">לשיחה ב־WhatsApp</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">הודעה זו נשלחה כי הכתובת הזו הוזנה בטופס ההרשמה של {{business_name}}. אם זו טעות, אפשר להתעלם מההודעה.</td></tr>
</table>
</body>
</html>`,
  },
  registration_cancelled: {
    name: "ביטול שמירת מקום",
    who: "participant",
    when: "נשלח למשתתף כששמירת המקום שלו למפגש עתידי בוטלה.",
    vars: VARS,
    subject: "שמירת המקום שלך למפגש בוטלה",
    html: `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{{business_name}}</title></head>
<body dir="rtl" style="margin:0;padding:24px;background:#F3F6F5;font-family:Arial,Helvetica,sans-serif;color:#1B2B2E;direction:rtl;text-align:right">
<table role="presentation" dir="rtl" align="center" width="100%" style="max-width:560px;margin:0 auto;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:0 4px 12px;font-size:18px;font-weight:bold;color:#0A6C61">{{business_name}}</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;background:#FFFFFF;border:1px solid #DCE6E3;border-radius:14px;padding:24px;font-size:15px;line-height:1.6">
<p data-if="first_name" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">שלום {{first_name}},</p>
<h1 dir="rtl" style="direction:rtl;text-align:right;margin:0 0 12px;font-size:20px;line-height:1.3;color:#1B2B2E">שמירת המקום שלך למפגש הזה בוטלה:</h1>
<table role="presentation" dir="rtl" width="100%" style="margin:0 0 16px;border-collapse:collapse;direction:rtl">
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">מפגש</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_name}}</td></tr>
<tr data-if="meeting_date"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">תאריך</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_date}}</td></tr>
<tr data-if="meeting_time"><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;width:96px;color:#6B7A78;vertical-align:top">שעה</td><td dir="rtl" style="direction:rtl;text-align:right;padding:6px 0;font-weight:bold;vertical-align:top">{{meeting_time}}</td></tr>
</table>
<p dir="rtl" style="direction:rtl;text-align:right;margin:0 0 14px;">אם זו טעות, או כדי לשמור מקום שוב, אפשר לפנות אלינו.</p>
<p data-if="my_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">אפשר גם לשמור מקום מחדש באזור האישי: <a href="{{my_link}}" style="color:#0A6C61;font-weight:bold">לאזור האישי</a></p>
<p data-if="whatsapp_link" dir="rtl" style="direction:rtl;text-align:right;margin:0 0 10px">יש שאלה? אפשר לכתוב לנו ב־WhatsApp: <a href="{{whatsapp_link}}" style="color:#0A6C61;font-weight:bold">לשיחה ב־WhatsApp</a></p>
</td></tr>
<tr><td dir="rtl" style="direction:rtl;text-align:right;padding:14px 4px 0;font-size:12px;line-height:1.5;color:#6B7A78">הודעה זו נשלחה כי הכתובת הזו הוזנה בטופס ההרשמה של {{business_name}}. אם זו טעות, אפשר להתעלם מההודעה.</td></tr>
</table>
</body>
</html>`,
  },
  };
  root.ROSTER_MAIL_FOOTER_MARK = "הוזנה בטופס ההרשמה";
})(typeof window !== "undefined" ? window : globalThis);
