# `worker/` — נקודת הקצה של הטופס

האתר סטטי (GitHub Pages) ואין לו שרת. ה־Worker הזה **הוא** השרת, והוא קיים
לצורך אחד: להחזיק את מפתח ה־API של Resend במקום שהדפדפן לא יכול לראות, ולשלוח
את הפנייה במייל.

```
POST https://api.floa.co.il/lead
{ "name": "...", "phone": "...", "page": "...", "url": "..." }
->  { "ok": true }
```

**שום פנייה לא נשמרת.** לא כאן, לא ב־Firebase ולא בשום מקום אחר. הפנייה הופכת
למייל וזה כל סיפור חייה.

## הגדרה חד־פעמית

### 1. אימות הדומיין ב־Resend

ב־[resend.com](https://resend.com) → **Domains** → הוסיפו את `floa.co.il`
והדביקו את רשומות ה־DNS (SPF, DKIM, DMARC) אצל ספק הדומיין. בלי זה מייל
מ־`no-reply@floa.co.il` ייחסם או ייפול לספאם.

לאחר האימות צרו **API Key** בהרשאת *Sending access* בלבד.

### 2. פרסום ה־Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put RESEND_API_KEY     # מדביקים את המפתח — הוא לא נכנס לגיט
npx wrangler deploy
```

`LEAD_TO` ו־`LEAD_FROM` יושבים ב־`wrangler.toml` (הם אינם סודות).
**`RESEND_API_KEY` הוא סוד ולעולם אינו בקוד, בריפו או בדפדפן.**

### 3. DNS

הוסיפו רשומה שמפנה את `api.floa.co.il` ל־Cloudflare, כדי שה־route
`api.floa.co.il/lead` שב־`wrangler.toml` יתפוס.

## מה ה־Worker אוכף

| הגנה | מה קורה |
|---|---|
| **Origin** | רק `floa.co.il` (ו־localhost לפיתוח) יכולים לפנות. אחרת 403 |
| **אימות שם** | 2–80 תווים, בצד השרת ולא רק בדפדפן |
| **אימות טלפון** | נייד או קווי ישראלי, מנורמל בצד השרת |
| **אימות שם העמוד** | חייב להיות אחד מששת הדפים. אחרת אפשר היה להזריק כל מחרוזת לשורת הנושא |
| **Honeypot** | שדה נסתר שרק בוט ממלא. מקבל 200 מזויף כדי שלא ינסה שוב |
| **Rate limit** | פנייה אחת לכל 30 שניות לכל כתובת IP |

## בדיקה מקומית

```bash
npx wrangler dev            # מאזין על localhost:8787
```

ואז ב־`src/content/site.js` מפנים זמנית את `runtime.leadEndpoint`
ל־`http://localhost:8787/lead`, ומריצים `npm run dev` בשורש.

## חשוב

הודעת ה"תודה" מוצגת למשתמש **רק** אחרי ש־Resend אישר שהמייל נשלח. אם השליחה
נכשלה, הדפדפן מקבל שגיאה, השדות **לא** מתנקים, והמשתמש יכול לנסות שוב או לפנות
ב־WhatsApp.
