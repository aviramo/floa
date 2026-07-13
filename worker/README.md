# `worker/` — נקודת הקצה של הטופס

האתר סטטי (GitHub Pages) ואין לו שרת. ה־Worker הזה **הוא** השרת, והוא קיים
לצורך אחד: להחזיק את מפתח ה־API של Resend במקום שהדפדפן לא יכול לראות, ולשלוח
את הפנייה במייל.

```
POST https://floa-lead.<החשבון>.workers.dev/lead
{ "name": "...", "phone": "...", "page": "...", "url": "..." }
->  { "ok": true }
```

**שום פנייה לא נשמרת.** לא כאן, לא ב־Firebase ולא בשום מקום אחר. הפנייה הופכת
למייל וזה כל סיפור חייה.

## למה workers.dev ולא api.floa.co.il

`floa.co.il` **אינו** מנוהל ב־Cloudflare. ה־nameservers שלו מצביעים ל־sitesdepot
ורשומות ה־A שלו ל־GitHub Pages. Cloudflare route (למשל `api.floa.co.il/lead`)
תופס רק על זון שמנוהל ב־Cloudflare, ולכן route כזה לא יכול לעבוד כאן. בעבר
`wrangler.toml` אכן הגדיר route על `api.floa.co.il`, מארח שמעולם לא נפתר ב־DNS,
והתוצאה הייתה שכל פנייה נכשלה בדפדפן לפני שהגיעה לשום מקום.

`workers.dev` לא דורש DNS בכלל. הכתובת אינה נראית למבקר — היא רק יעד של fetch
ברקע, וה־Worker דוחה כל origin שאינו `floa.co.il`.

## הגדרה חד־פעמית

### 1. אימות הדומיין ב־Resend

ב־[resend.com](https://resend.com) → **Domains** → **Add domain** → `floa.co.il`.
Resend ייתן שלוש רשומות DNS. מוסיפים אותן **אצל sitesdepot** (שם מנוהל ה־DNS):

| סוג | לְמה זה משמש |
|---|---|
| TXT (SPF) | מרשה ל־Resend לשלוח בשם הדומיין |
| CNAME/TXT (DKIM) | חותם את המייל, כדי שלא ייחשב מזויף |
| TXT (DMARC) | אומר לשרתי היעד מה לעשות עם מייל שנכשל |

בלי זה, מייל מ־`no-reply@floa.co.il` ייחסם או ייפול לספאם. האימות לוקח כמה דקות
עד כמה שעות, תלוי בהתפשטות ה־DNS.

לאחר שהדומיין מסומן **Verified**, יוצרים **API Key** בהרשאת *Sending access*
בלבד.

### 2. פרסום ה־Worker

```bash
cd worker
npx wrangler login
npx wrangler secret put RESEND_API_KEY     # מדביקים את המפתח, הוא לא נכנס לגיט
npx wrangler deploy
```

בסוף הפריסה wrangler מדפיס את הכתובת:

```
https://floa-lead.<החשבון>.workers.dev
```

### 3. לחבר את האתר לכתובת הזאת

ב־`src/content/site.js`, `runtime.leadEndpoint` חייב להצביע בדיוק לשם:

```js
leadEndpoint: "https://floa-lead.<החשבון>.workers.dev/lead",
```

ואז `node build.mjs` בשורש, קומיט ופוש. **בלי הצעד הזה הטופס עדיין שולח לכתובת
הישנה ונכשל.**

`LEAD_TO` ו־`LEAD_FROM` יושבים ב־`wrangler.toml` (הם אינם סודות).
**`RESEND_API_KEY` הוא סוד ולעולם אינו בקוד, בריפו או בדפדפן.**

## מה ה־Worker אוכף

| הגנה | מה קורה |
|---|---|
| **Origin** | רק `floa.co.il` (ו־localhost לפיתוח) יכולים לפנות. אחרת 403 |
| **אימות שם** | 2–80 תווים, בצד השרת ולא רק בדפדפן |
| **אימות טלפון** | נייד או קווי ישראלי, מנורמל בצד השרת |
| **אימות שם העמוד** | חייב להיות אחד מדפי האתר. אחרת אפשר היה להזריק כל מחרוזת לשורת הנושא |
| **Honeypot** | שדה נסתר שרק בוט ממלא. מקבל 200 מזויף כדי שלא ינסה שוב |
| **Rate limit** | פנייה אחת לכל 30 שניות לכל כתובת IP |

### רשימת הדפים חייבת להישאר מסונכרנת

`PAGES` ב־`src/index.js` היא רשימה לבנה של שמות הדפים. היא **חייבת** להתאים
ל־`pageName` שב־`src/content/home.js` וב־`src/content/solutions.js`.

זה נשבר פעם אחת בפועל: הדפים שונו, הרשימה כאן לא, וכל פנייה נדחתה עם `error:
"page"` — בשקט, כי המבקר רואה רק „לא הצלחנו לשלוח”. לכן `build.mjs` משווה בין
שתי הרשימות **ומפיל את הבנייה** אם הן מתפצלות.

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
