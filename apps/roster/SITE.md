# האתר של עסק מדבר עם roster: `/roster-site.js`

(הבעלים, 2026-11-26: קובץ FLOA אחד שדרכו האתר של כל עסק מדבר עם roster. הרפתקה היא הראשונה. הגדרה, עוד לא ממומשת. הקובץ הזה יושב ב-`apps/roster/` ולא מתפרסם.)

## בקצרה
- **קריאה ישירות לדאטהבייס.** רשימת המפגשים נקראת דרך פונקציה חדשה וקטנה, `site_meetings` (הצעה בסעיף 5). האזור האישי (`me_*`), זמן אמת ומדיה כבר ישירים היום.
- **כתיבה אנונימית נשארת ב-API הציבורי, בדיוק כמו היום:** `POST /signup`, `POST /signup/phone`, `POST /signup/complete`, `POST /payments/click`.
- **ה-API (`/roster/v1/`) לא משתנה בכלל.** לא נתיב, לא שדה, לא קוד שגיאה, לא `allowed_origins`, לא CORS. האתר החיצוני של AUM לא מרגיש כלום.
- **האתר לא יודע מאיפה הנתונים באים.** הוא קורא ל-`FLOA_ROSTER.*` ומקבל את הצורות הציבוריות של ה-API. ההובלה פנימית לספרייה: כתובות, מפתחות, שמות סכמות, שמות פונקציות, פרוטוקול זמן אמת, דלי המדיה, ומפתחות האחסון בדפדפן. אפשר להחליף אותה אחר כך בלי לגעת באף אתר.

---

## 1. הקובץ, המקום וסדר הטעינה
- **הקובץ:** `apps/floa/domain/roster-site.js`. הבילד מעתיק את `domain/` לשורש הדומיין, ולכן הוא נטען כ-`/roster-site.js`. הוא שייך לדומיין, כמו `/supabase.js` ו-`/auth.js`.
- **הסגנון:** כמו `/auth.js`: IIFE אחת, `"use strict"`, בלי SDK, בלי CDN, בלי בילד. מדבר עם REST, עם Realtime ועם ה-API ב-`fetch` ו-`WebSocket` בלבד.
- **אין בו שם של עסק, מפתח, טלפון או מזהה של עסק.** הבדיקה: `grep -i harpatka apps/floa/domain/roster-site.js` ריק.
- **סדר הטעינה:**
  ```html
  <script src="/supabase.js"></script>
  <script src="/auth.js"></script>        <!-- רק באתר שיש בו אזור אישי -->
  <script src="/roster-site.js" data-business="<slug>" data-key="rk_pub_…" data-test-key="rk_pub_…"></script>
  <!-- ואחריהם הסקריפטים של האתר עצמו -->
  ```
  - `/supabase.js` חובה: הכתובת, ה-anon key וההחלטה על הסביבה (סעיף 3).
  - `/auth.js` לא חובה. בלעדיו `me.*` נדחים עם `not_configured`. הספרייה פונה ל-`FLOA_AUTH` ברגע הקריאה ולא בטעינה.
  - **הספרייה שומרת לעצמה את `window.fetch` ברגע שהיא נטענת** ומשתמשת רק בו. כך מתאם שעוטף את `fetch` אחריה (הגשר של הרפתקה, שלב 1) לא יכול לתפוס את הבקשות של הספרייה עצמה ולהיכנס ללולאה.
- **מארח של אפליקציה אחת** (`harpatka.floa.co.il`, ובהמשך `harpatka.co.il`): הקובץ מוגש מהשורש רק אם הוא ב-`DOMAIN_FILES` ב-`functions/_middleware.js`. המידלוור מחפש קודם קובץ באותו שם בתיקייה של האפליקציה, ולכן **לאפליקציה אסור קובץ משלה בשם `roster-site.js` בשורש התיקייה שלה.**
- **קאש:** שורה ב-`apps/floa/domain/_headers` עם `max-age=0, must-revalidate`, כמו `/auth.js`. אתר עם service worker משלו מגיש את `/supabase.js`, `/auth.js` ו-`/roster-site.js` ברשת קודם (network-first), אחרת עדכון של הספרייה מגיע רק בטעינה השנייה.

## 2. הגדרה מהדף בלבד
שלושה מאפיינים על תגית הסקריפט, ושום דבר אחר:

| מאפיין | חובה | מה |
|---|---|---|
| `data-business` | כן | ה-slug של העסק ב-roster. `^[a-z][a-z0-9-]{1,39}$` (אותו כלל של המידלוור). |
| `data-key` | לכתיבה בסביבה האמיתית | המפתח הציבורי של העסק בסכמה `roster`. `^rk_pub_[A-Za-z0-9]{32}$`. |
| `data-test-key` | לכתיבה בסביבת הבדיקות | המפתח הציבורי של העסק בסכמה `roster-test`. |

- הספרייה קוראת אותם פעם אחת, בטעינה, מ-`document.currentScript` (ואם אין, מהסקריפט האחרון שה-`src` שלו נגמר ב-`/roster-site.js`).
- **שום הגדרה לא מגיעה מהכתובת** (`?env=`), מ-`localStorage`, או ממשתנה גלובלי של האתר.
- בלי `data-business`: `FLOA_ROSTER` לא נוצר, ושורה ב-console אומרת למה.
- **מפתח סודי (`rk_sec_`) באחד המאפיינים:** הספרייה לא נטענת, כותבת שגיאה ב-console, ולא שולחת אותו לשום מקום.
- מפתח בצורה לא נכונה: נחשב כחסר (הכתיבה בסביבה הזאת נדחית עם `not_configured`).

## 3. הסביבה: אמיתית או בדיקות
| | אמיתית | בדיקות |
|---|---|---|
| סכמה | `roster` | `roster-test` |
| ה-API | `https://api.floa.co.il/roster/v1` | `https://api-test.floa.co.il/roster/v1` |
| מפתח לכתיבה | `data-key` | `data-test-key` |
| ערוץ זמן אמת | `roster:<slug>` | `roster-test:<slug>` |
| דלי מדיה | `roster-media` | `roster-test-media` |
| טוקן משתתף שמור | לסביבה ול-slug | לסביבה ול-slug |

**ההחלטה נמצאת ב-`/supabase.js`, במקום אחד לכל האפליקציות,** בשדה חדש `SUPABASE.roster` (`"roster"` או `"roster-test"`). הספרייה רק קוראת אותו. הוא `"roster-test"` כשאחד מאלה נכון:
1. **סביבת בדיקות שהוזרקה:** `window.FLOA_ENV` עם `schema: "roster-test"` (`scripts/test-env.client.js`, שמוזרק ב-`node build.mjs --serve --test` ובפרויקט `floa-test`).
2. **מחשב מקומי:** אותו ביטוי שכבר יש ב-`/supabase.js`: `localhost`, `127.`, `[::1]`, `192.168.`, `10.`.
3. **התווית הראשונה של המארח היא `roster-test`.**
4. **המארח ברשימה `TEST_HOSTS`:** כל מארח עם `"test": true` ב-`domains.json`. **הבילד כותב את הרשימה** לתוך `dist/supabase.js` כשהוא מעתיק את `domain/` (בקובץ המקור השורה היא `var TEST_HOSTS = [];`). כך `domains.json` נשאר הרשימה היחידה. היום: `roster-test.floa.co.il`, `harpatka.floa.co.il`.

אחרת: `"roster"`.

הכללים:
- **ברירת המחדל היא אמיתית.** בדיקות רק בזיהוי חיובי לפי המארח. לעולם לא מהדף, לא מפרמטר בכתובת ולא מ-`localStorage`: קישור שנושא דגל היה שולח אנשים אמיתיים לנתוני בדיקה, ודף בדיקה היה יכול לכתוב לאמיתי.
- **בסביבת בדיקות בלי `data-test-key`:** הקריאה עובדת (היא ישירה ולא צריכה מפתח), הכתיבה נדחית עם `not_configured`. **הספרייה לעולם לא נופלת למפתח האמיתי בבדיקות, ולעולם לא משתמשת במפתח הבדיקות באמיתי.**
- **הפס של סביבת הבדיקות:** `/supabase.js` חושף את הפונקציה שמציירת אותו, `SUPABASE.testStrip()`. הוא קורא לה בעצמו כמו היום כשהסכמה של הדף היא `roster-test`, והספרייה קוראת לה כשהיא בבדיקות. כך גם אתר של עסק בסביבת בדיקות לובש את הפס, ואף אחד לא מתבלבל בין נתוני בדיקה לאמיתיים.
- **`floa.co.il/<תיקייה>/`** (הכתובת הישנה של אותה תיקייה על הדומיין הראשי) היא אמיתית. הכתיבה ממנה נדחית בבדיקת המקור של המפתח (`origin_not_allowed`), והקריאה מראה נתונים אמיתיים. אין דליפה ואין כתיבה.
- **התוצאה היום:** `harpatka.co.il` ו-`www.harpatka.co.il` אמיתיים. `harpatka.floa.co.il`, `localhost:5173/harpatka/` ו-`roster-test.floa.co.il` בדיקות.
- **למה מארח תצוגה מקדימה הוא בדיקות:** (א) CLAUDE.md כבר קובע ש-`api-test` משרת "כל גרסאות הבדיקה". (ב) כתיבה ממקור של תצוגה מקדימה ל-API האמיתי מחייבת להוסיף את המקור למפתח האמיתי, וזו שאלת חוזה (סעיף 9). (ג) הרשמה מתצוגה מקדימה לא יוצרת משתתף אמיתי ולא שולחת מייל אמיתי (בסכמת הבדיקות webhooks נשלחים, מיילים לא).

`/supabase.js` צריך עוד שני שינויים כדי שזה יעבוד (סעיף 8): פרופיל שהבקשה כבר נושאת גובר, והתיקייה בנתיב נחשבת רק במחשב מקומי וב-`floa.co.il`.

## 4. המשטח הציבורי: `window.FLOA_ROSTER`

### כללי
- **כל פונקציה מחזירה Promise.** הצלחה: הצורה שבטבלה. כישלון: `Error` שנושא `code`, ולפעמים `field` (השדה, כמו ב-API) ו-`retryAfter` (שניות, ב-`rate_limited`).
- **הקודים:** הקודים של ה-API כמו שהם (`validation`, `invalid_token`, `invalid_key`, `wrong_key_kind`, `full`, `closed`, `not_found`, `conflict`, `rate_limited`, `bad_request`, `server_error`), ועוד שלושה של הספרייה:
  - `network`: לא הגיעה תשובה שאפשר לקרוא. אין רשת, עבר זמן (15 שניות), או תשובה שהדפדפן חסם. **`origin_not_allowed` נראה כאן כ-`network`,** כי ה-API שולח אותו בלי כותרת CORS בכוונה.
  - `not_configured`: אין מפתח לסביבה הזאת, או `me.*` בלי `/auth.js`.
  - `signed_out`: `me.*` בלי התחברות, או שההתחברות נגמרה.
- **שני שדות לקריאה בלבד:** `FLOA_ROSTER.business` (ה-slug) ו-`FLOA_ROSTER.test` (true בסביבת בדיקות). `test` נועד לתווית בלבד. אתר לא בונה ממנו כתובות.

### `meetings({ past, limit, fresh })`
- `past` מ-0 עד 10 (ברירת מחדל 0), `limit` מ-1 עד 100 (ברירת מחדל 20). אותם גבולות של ה-API.
- **מחזיר בדיוק את הצורה הציבורית של `GET /meetings?limit=&past=`:**
  `{ business: { name }, meetings: [ { id, date, time, name, city, place, capacity, spots_left, full, price, price_tiers, image } ] }`, לפי תאריך ושעה. `image` רק כשיש.
- **איחוד בקשות:** קריאות באותו רגע עם אותם ערכים חולקות בקשה אחת. **קאש של 4 שניות** לכל צירוף של `past` ו-`limit`. `fresh: true` עוקף את הקאש (ועדיין מצטרף לבקשה שכבר בדרך). אות של זמן אמת מרוקן את הקאש.
- כישלון לא דורס את הקאש, והקריאה נדחית.
- **ההובלה היום (פנימי):** `GET /rest/v1/rpc/site_meetings?p_slug=&p_limit=&p_past=` עם ה-anon key ו-`Accept-Profile` לפי הסביבה. **אף פעם לא עם הטוקן של המשתמש:** הקריאה זהה לכולם, ואין סיבה לחכות לרענון טוקן.
- **רשת ביטחון לסדר העלייה:** אם הפונקציה עוד לא קיימת בסכמה (PostgREST עונה 404), הספרייה קוראת את אותה תשובה מה-API (`GET /meetings?limit=&past=`) עם המפתח של הדף. זו לא דרך רגילה שנייה, רק מה שמונע שבירה כשהספרייה עולה לפני ה-SQL.
- המזהה של העסק (בשביל `mediaUrl`) מגיע באותה תשובה, נשמר בפנים, ויוצא ממנה לפני שהיא חוזרת לאתר.

### כתיבה אנונימית: דרך ה-API, כמו היום
| פונקציה | הבקשה | מחזיר |
|---|---|---|
| `signup(fields)` | `POST /signup` | `{ status: "ok", registered, participant_token }` |
| `signupPhone({ phone, email, meeting_id, source_code })` | `POST /signup/phone`, עם `keepalive` | `{ status: "ok", registered, participant_token, complete }` |
| `signupComplete({ first_name, last_name, age, gender, email })` | `POST /signup/complete` עם הטוקן השמור | `{ status: "ok" }` |
| `payClick({ meeting_id, method })` | `POST /payments/click` עם הטוקן השמור, עם `keepalive` | `{ status: "ok" }` |

- השדות בשמות של ה-API. `signup` מקבל `first_name`, `last_name`, `phone`, `email`, `address`, `age`, `gender`, `meeting_id`, `extra_fields`, ו-`website` (מלכודת הבוטים: האתר מעביר את הערך של השדה הנסתר כמו שהוא).
- `keepalive`: הדף עובר לוואטסאפ מיד אחרי הלחיצה, והבקשה צריכה להיגמר גם אז.
- `signupComplete` ו-`payClick` בלי טוקן שמור: נדחים עם `invalid_token`, בלי בקשה.
- `Authorization: Bearer <המפתח של הסביבה>`. שום כותרת אחרת של roster.

### הטוקן של המשתתף
- `signup` ו-`signupPhone` שומרים את `participant_token` שחזר. **שמור לכל סביבה ולכל slug בנפרד**, ב-`localStorage`, 30 יום מהרגע שהגיע (כמו `expires_at` בדאטהבייס). כל תשובה חדשה מחליפה אותו. תשובת `invalid_token` מוחקת אותו. בחלון פרטי: בזיכרון בלבד. שם המפתח בדפדפן פנימי.
- `hasToken()`: האם יש טוקן שמור לעסק הזה בסביבה הזאת.
- `useToken(token)`: מסירה חד פעמית מאחסון ישן של אתר (שלב 1). רק `^pt_[A-Za-z0-9]{32}$`, אחרת מתעלמים.
- הטוקן הוא לא זהות ולא התחברות. הוא רק מאפשר לאותו דפדפן להשלים פרטים ולדווח על לחיצת תשלום, 30 יום.

### `me.*`: האזור האישי
ישירות לפונקציות `me_*`, דרך `FLOA_AUTH` עם הטוקן של האדם, עם `p_slug` מ-`data-business` ופרופיל לפי הסביבה. **התשובה חוזרת כמו שהפונקציה החזירה אותה,** כולל מילות מצב בגוף (`ok`, `auth`, `none`, `pending`, `blocked`, `disabled`, `not_found`, `invalid_phone`, `phone_taken`, `created`, `linked` וכו'). מילת מצב היא לא שגיאה. נדחים רק עם `signed_out`, `not_configured`, `network`, `server_error`.

| פונקציה | פונקציית הדאטהבייס | הערה |
|---|---|---|
| `me.get()` | `me` | |
| `me.phone({ phone, meeting_id, email, source })` | `me_phone` | **תמיד חמשת הארגומנטים** (`p_slug`, `p_phone`, `p_meeting`, `p_email`, `p_source`, עם null כשחסר). לגרסה עם חמישה אין ברירות מחדל, וקריאה חלקית לא מוצאת שום פונקציה. |
| `me.complete({ first_name, last_name, age, gender, email })` | `me_complete` | |
| `me.register(meeting_id)` | `me_register` | |
| `me.source(code)` | `me_source` | |
| `me.update({ first_name, last_name, age, gender, phone, email })` | `me_update` | |
| `me.reportPayment(meeting_id, method)` | `me_report_payment` | `p_method` רק כשניתן |
| `me.payCredit(meeting_id)` | `me_pay_credit` | |
| `me.buyPass(type_id, n)` | `me_buy_pass` | |

- **אין `me.unregister`:** אין ביטול שמירת מקום מהאזור האישי (הבעלים, 2026-11-17). הפונקציה בדאטהבייס נשארת.
- **אין `p_as`** (צפייה כמשתתף): roster לא תומך בזה.
- **ההתחברות עצמה לא בספרייה.** האתר קורא ל-`FLOA_AUTH.signedIn()`, `signIn(back)`, `signOut()`, `name()` ישירות, ומקשיב ל-`floa:auth`.
- דורש ש-`FLOA_AUTH.api` ידע לשלוח פרופיל (סעיף 8).

### `live(onChange, { poll })`
- `onChange({ reason, kind })`. `reason`: `change` (אות מהדאטהבייס; `kind` אחד מ-`meeting`, `attendance`, `payment`, `participant`), `rejoin` (חזרה אחרי ניתוק), `visible` (חזרה ללשונית, פוקוס, `online`, חזרה מהמטמון של הדפדפן), `poll` (גיבוי תקופתי).
- **WebSocket אחד לדף לכל המאזינים.** Phoenix `vsn=1.0.0`, ה-anon key, ערוץ ציבורי `<סכמה>:<slug>`. פעימה כל 25 שניות, חיבור מחדש בהמתנה שגדלה משנייה עד 30 שניות עם מעט אקראיות, ונסגר אחרי 5 דקות בלשונית מוסתרת ונפתח בחזרה. אותם קבועים של `ui/docs/realtime.md`.
- **לפני כל `onChange` קאש המפגשים מתרוקן.**
- **פיזור ובלימה:** אותות `change` מתאחדים (300 מילישניות), נדחים באקראי בין 200 ל-1000 מילישניות בכל לשונית, ולא יותר מאחד כל 3 שניות בלשונית. הסיבה: כל לשונית פתוחה טוענת מחדש על כל אות, ובערוץ ציבורי כל לקוח עם ה-anon key יכול לשלוח broadcast, ולכן אות מזויף לא יכול להפוך לגל בלתי מוגבל של קריאות.
- `poll`: ברירת מחדל 60 שניות, רק כשהלשונית גלויה, מינימום 15.
- מחזיר `{ close() }`. הסגירה האחרונה סוגרת את החיבור.
- **אותות מגיעים רק כש-`business_settings.realtime` דלוק לעסק.** להרפתקה בסכמה האמיתית הוא כבוי היום, ולכן שם רק `poll` ו-`visible` (סעיף 9).
- האות לא נושא נתונים. האתר טוען מחדש בעצמו: `meetings({ fresh: true })` או `me.get()`.

### `mediaUrl(name)`
- `name`: שם קובץ בתוך התיקייה של העסק, `^[A-Za-z0-9_.-]{1,200}$` (בלי `/`, בלי `..`). מחזיר Promise לכתובת הציבורית של הקובץ בדלי של הסביבה, בתיקייה של העסק. התיקייה מגיעה מתשובת המפגשים (אם אין עדיין, קריאה אחת ל-`meetings()`).
- כתובות מדיה שהדאטהבייס כבר נותן (`image`, קישורים בהוראות ההגעה) משמשות כמו שהן. `mediaUrl` רק לשם שהאתר בונה בעצמו (הדף `m/` של הרפתקה).
- זה המקום היחיד בספרייה שיודע איפה המדיה יושבת. אם ההחלטה של `worker/MEDIA.md` (נכתב עכשיו בידי סוכן אחר) מזיזה מדיה, השינוי נוחת כאן בלבד.

### מה אתר לא עושה
- לא `fetch` משלו ל-`SUPABASE.url/rest` או ל-API של roster, לא `Content-Profile`, לא WebSocket ל-roster, ולא מפתח בקוד שלו מחוץ למאפיינים של התגית.

## 5. פונקציית ה-SQL לקריאה ישירה (הצעה)
**הצעה בלבד. ההרצה היא לא של סוכן הגדרה,** ובסכמה האמיתית היא דורשת אישור מפורש של הבעלים. קובץ חדש `apps/roster/site-meetings.sql` ובדיקה `apps/roster/site-meetings.check.sql`.

```sql
-- site_meetings: the public meetings of one business, for its own site, read straight from the database (apps/roster/SITE.md).
-- The SAME answer as GET /roster/v1/meetings?limit=&past= with that business's public key: it calls api_meetings_past with the
-- newest unrevoked public key of the business and keeps only the public keys of a meeting, exactly like the Worker (PUBLIC_MEETING_KEYS).
-- NOT part of the /roster/v1/ API. Unknown slug, or a business without a public key: not_found.
-- Written for the schema roster; every name is schema-qualified on purpose (the roster-test copy is made by text substitution).
create or replace function roster.site_meetings(p_slug text, p_limit int default 20, p_past int default 0)
returns jsonb language plpgsql stable security definer set search_path = roster, public as $fn$
declare bz roster.businesses; kh text; r jsonb;
begin
  select * into bz from roster.businesses where slug = lower(btrim(coalesce(p_slug, '')));
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  select k.key_hash into kh from roster.api_keys k
   where k.business_id = bz.id and k.kind <> 'secret' and k.revoked_at is null
   order by k.created_at desc limit 1;
  if kh is null then return jsonb_build_object('error', 'not_found'); end if;
  r := roster.api_meetings_past(kh, p_limit, p_past);
  if r ? 'error' or jsonb_typeof(r -> 'meetings') is distinct from 'array' then return jsonb_build_object('error', 'not_found'); end if;
  return jsonb_build_object(
    'business', jsonb_build_object('name', r -> 'business' ->> 'name', 'id', bz.id),
    'meetings', coalesce((
      select jsonb_agg((select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(x.m) e
                         where e.key in ('id', 'date', 'time', 'name', 'city', 'place', 'capacity', 'spots_left', 'full', 'price', 'price_tiers', 'image'))
                       order by x.n)
        from jsonb_array_elements(r -> 'meetings') with ordinality x(m, n)), '[]'::jsonb));
end $fn$;
revoke all on function roster.site_meetings(text, int, int) from public, anon, authenticated;
grant execute on function roster.site_meetings(text, int, int) to anon, authenticated;
notify pgrst, 'reload schema';
```

- **SECURITY DEFINER, STABLE, `search_path` קבוע, וכל שם מוסמך בסכמה.**
- **ההסכמה (opt-in) היא המפתח הציבורי.** עסק שיש לו מפתח ציבורי בתוקף כבר פרסם את המפגשים שלו: המפתח כתוב בדף שלו, וה-API נותן בדיוק את המפגשים האלה לכל מי שמחזיק אותו. נבחר המפתח הכי חדש שלא בוטל ושאינו סודי (`kind <> 'secret'`, כי בסכמת הבדיקות המפתחות הציבוריים של הרפתקה הם מסוג `test`). עסק בלי מפתח כזה: `not_found`, בדיוק כמו slug שלא קיים, כך שאי אפשר לגשש מי מחזיק מפתח.
- **אותה תשובה של ה-API, כי זו אותה פונקציה.** היא קוראת ל-`api_meetings_past` עם ה-hash של המפתח, ולכן המפגשים, הסדר, המחירים והגבולות (`limit` מ-1 עד 100, `past` מ-0 עד 10) הם של ה-API. `api_meetings_past` לא כותבת כלום (את `last_used_at` מעדכנת `api_auth`, שלא נקראת כאן). אחר כך נשארים רק 12 המפתחות הציבוריים, כמו `shapeMeetings` ב-Worker, כדי שאם `meeting_json` יקבל פעם שדה נוסף, הדלת הזאת לא תדליף אותו.
- **`business` נושא `name` ו-`id`.** ה-id הוא התיקייה של המדיה. הוא כבר ציבורי בכל כתובת של תמונה, והספרייה מוציאה אותו מהתשובה לאתר.
- **בלי בדיקת מקור (Origin).** מקור הוא לא גבול אבטחה (כל לקוח שאינו דפדפן כותב מה שהוא רוצה), והמפגשים ציבוריים ממילא. ממתין לאישור (סעיף 9).
- **הרשאות:** `revoke` מ-`public` (Postgres נותן EXECUTE ל-PUBLIC כברירת מחדל על פונקציה חדשה), `grant` רק ל-`anon` ול-`authenticated`. לא ל-`service_role`, כי ה-Worker לא קורא לה. שום פונקציה אחרת לא מקבלת הרשאה. `api_meetings_past` נשארת `service_role` בלבד.
- **נקראת ב-GET.** STABLE מרשה GET ב-PostgREST, וטרנזקציה של GET היא לקריאה בלבד, ולכן הדלת הזאת לא יכולה לכתוב גם אם מישהו ישנה אותה בטעות.
- **בלי הגבלת קצב בדאטהבייס.** הסיבות:
  - `rate_take` כותב שורה בכל קריאה. הוא היה הופך קריאה לכתיבה, מבטל את GET והקריאה בלבד, ומייצר נעילה על מונה חם בכל רענון של כל לשונית.
  - לדאטהבייס אין דרך אמינה לזהות מי קורא (אין כתובת IP שאפשר לסמוך עליה).
  - המחיר של קריאה חסום: לכל היותר 110 מפגשים, STABLE, ו-`statement_timeout` של `anon` הוא 3 שניות.
  - אותם נתונים כבר ציבוריים ב-API.
  - הבלימה בצד הלקוח: איחוד בקשות, קאש של 4 שניות, פיזור ובלימה של אותות זמן אמת (סעיף 4).
  - אם יופיע ניצול: ההובלה פנימית, ואפשר להעביר את הקריאה מאחורי ה-Worker עם קאש, בלי לגעת באף אתר.
- **רקע:** הדלי של הקריאה ב-API הוא 300 לדקה למפתח ו-120 לדקה למפתח ולכתובת. עם זמן אמת דלוק כל לשונית פתוחה טוענת מחדש על כל שינוי. קריאה ישירה מוציאה את כל זה מהדלי, וה-API נשאר לכתיבה בלבד.

### שתי הסכמות
- **נכתב פעם אחת עם `roster.`.** את העותק של `roster-test` מייצרים בהחלפת טקסט, באותה דרך של `api-phone-signup.sql` ו-`extra-fields.sql`, אבל עם הפקודה המתוקנת:
  ```
  sed -E "s/([^'\"a-z_])roster\./\1\"roster-test\"./g; s/search_path = roster, public/search_path = \"roster-test\", public/g" apps/roster/site-meetings.sql
  ```
  הפקודה שכתובה ב-`extra-fields.check.sql` מוחקת את התו שלפני `roster.` (בלי `\1`) ומשאירה את `search_path` על `roster`. ההוכחה בדאטהבייס: ל-`"roster-test".api_signup_extra` יש היום `search_path=roster, public` (סעיף 8).
- **הסדר:** קודם `roster-test` (מנהל העבודה מריץ, קובץ הבדיקה עובר), ורק אחר כך `roster`, באישור מפורש של הבעלים. שורה חדשה ב-`apps/roster/prod-order.md`: "קובץ אחד, מוסיף פונקציה בלבד, שום פונקציה קיימת לא מוחלפת. ל-AUM: שום תשובה של ה-API לא משתנה."

### קובץ הבדיקה (`site-meetings.check.sql`)
על `roster-test`, הכול בטרנזקציה אחת שמתבטלת, כמו `extra-fields.check.sql`:
```
(echo "begin;"; <פקודת ה-sed למעלה>; cat apps/roster/site-meetings.check.sql) | node scripts/sql.mjs --table
```
טבלת `res(t, got, want)`, ובה:
1. **אותם מפגשים כמו ה-API:** המזהים והסדר של `site_meetings('harpatka', 100, 10)` שווים לאלה של `api_meetings_past(<hash של המפתח הלא סודי החדש>, 100, 10)`.
2. **אותם ערכים:** בכל מפגש, כל אחד מ-12 המפתחות שווה לערך של `api_meetings_past`.
3. **רק מפתחות ציבוריים:** אין אף מפתח מחוץ ל-12. `want`: 0.
4. **`business`:** המפתחות הם בדיוק `id,name`.
5. **slug לא קיים:** `not_found`.
6. **קריאה כ-`anon`:** `set local role anon`, הפונקציה עונה עם `meetings`, `reset role` (עם `grant all on res to anon`, כמו ב-`me-email.check.sql`).
7. **הרשאות:** מי שיש לו EXECUTE על הפונקציה (`aclexplode`): `anon`, `authenticated`, `postgres` בלבד.
8. **`search_path` של העותק:** `proconfig` הוא `search_path="roster-test", public`.
9. **גבולות:** `site_meetings('harpatka', 1000, 50)` מחזיר לכל היותר 110 מפגשים.
10. **אחרון, כי הוא כותב (ומתבטל):** כל המפתחות הלא סודיים של העסק מסומנים כמבוטלים, והפונקציה עונה `not_found`.

**בסכמה האמיתית** רצים רק הסעיפים שקוראים (1 עד 5, 7 ו-9, עם `roster` ו-`"search_path=roster, public"`), בלי סעיף 10, ועם הבדיקה של AUM לפני ואחרי: `GET /meetings` של AUM נשאר זהה.

## 6. ההתחברות
### היום
- **בסכמה האמיתית האזור האישי כבוי לציבור:** `CONFIG.googleLogin = false` מ-30.10.26. בלי זה אין כרטיס אזור אישי, אין "נרשמתם בעבר", ו-`openMeArea` חוזר מיד.
- `me/` ו-`register.js` מחזיקים סשן משלהם במפתח `harpatka_me_session`, מרעננים אותו בעצמם, והגשר מעביר את `/auth/v1/*` לפרויקט של FLOA. סשן שהונפק בפרויקט אחר נמחק בטעינה.
- One Tap עובד דרך `POST /roster-auth/google` ב-Worker (לקוח הגוגל של הרפתקה, `ROSTER_AUTH_ORIGINS` הוא `harpatka.co.il` ו-`www`), והוא כבוי יחד עם `googleLogin`.

### אחרי (שלב 2)
- **דפים עם אזור אישי טוענים את `/auth.js`** אחרי `/supabase.js`. הסשן הוא `floa.session` של המקור. ל-`harpatka.co.il` יש `localStorage` משלו, ולכן הסשן משותף רק עם אפליקציות באותו מקור.
- **כניסה:** `FLOA_AUTH.signIn(back)`, הניתוב הרגיל דרך גוגל. `back` הוא הכתובת של דף הבית (המקור ונתיב הבסיס), אף פעם לא כתובת עמוקה, כמו ב-`ui/docs/app-session.md`. כדי לפתוח שוב את האזור האישי בחזרה, האתר שומר דגל חד פעמי משלו ב-`sessionStorage` (כבר קיים: `harpatka_open_me`).
- **`me/` בתוך iframe** (`?embed=1`): גוגל לא נפתח בתוך מסגרת, ולכן הכניסה מתחילה מהדף העליון. `me/` שולח `me-login` (כבר קיים) והדף העליון קורא ל-`signIn`.
- **`me/` ו-`register.js` מוחקים את קוד הסשן שלהם** (רשימה בשלב 2) ומדברים רק דרך `FLOA_ROSTER.me.*` ו-`FLOA_AUTH`. האירוע `floa:auth` מחליף את הטיפול שלהם ב-401.
- **ההבדל במסך ההסכמה:** הניתוב עובר דרך ספק הגוגל של פרויקט FLOA, ולכן גוגל מציג את האפליקציה של FLOA. הקוד של הרפתקה נמנע מזה בכוונה ("אין כניסה דרך חשבון הגוגל של floa"). ממתין (סעיף 9).

### מה קורה למי שמחזיק `harpatka_me_session`
- **העברה חד פעמית, בקובץ של הרפתקה ולא בספרייה** (שמות המפתחות נושאים את שם העסק). בלוק קטן בראש `shared/config.js`, שנטען **לפני** `/auth.js`:
  - אם `floa.session` ריק, ו-`harpatka_me_session` מחזיק `access_token` שה-`iss` שלו הוא הפרויקט של FLOA (`aexmnaxvahblveejsbup`) ו-`refresh_token`: כותבים `floa.session = { access_token, refresh_token, expires_at: exp * 1000 }`.
  - בכל מקרה מוחקים `harpatka_me_session`, `harpatka_me_name`, `harpatka_admin_session_v2`, `harpatka_login_popup`, `harpatka_login_done`.
- **אף פעם לא שני עותקים חיים של אותו סשן.** שני עותקים של אותו refresh token: הרענון הראשון מחליף אותו, השני משתמש בטוקן שכבר נוצל, ו-Supabase עלול לבטל את כל הסשן. לכן **שלב 1 לא נוגע בהתחברות בכלל**, וגם לא טוען את `/auth.js` (סעיף 7).
- בפועל מעטים או אף אחד (הכניסה כבויה לציבור). מי שמאבד סשן נכנס שוב.
- **טוקן המשתתף:** בשלב 1 הגשר מוסר את `harpatka_roster_token` לספרייה ב-`useToken`. `harpatka_claim_token` (החיבור הישן לפי אסימון) אין לו מקבילה ב-roster, והוא נמחק בשלב 2.

### One Tap נשאר כבוי
ומה צריך כדי להדליק אותו אחר כך:
1. ב-`/auth.js`: פונקציה כללית `FLOA_AUTH.adopt(session)` שמקבלת סשן שלא הגיע מהניתוב (בודקת צורה, כותבת `floa.session`, מודיעה ב-`floa:auth`). כל אפליקציה עם לקוח גוגל משלה תוכל להשתמש בה.
2. ה-Worker: `/roster-auth/google` כבר קיים. כל מקור שבו One Tap צריך לעבוד נכנס ל-`ROSTER_AUTH_ORIGINS` (`worker/wrangler.toml`, ופריסה). `/roster-auth/*` הוא לא חלק מ-`/roster/v1/`.
3. Google Cloud Console: כל מקור ב-Authorized JavaScript origins של הלקוח של הרפתקה.
4. nonce, כמו בקוד הקיים.
5. `CONFIG.googleLogin = true`.

### עוד
- **צפייה כמשתתף** (`?as=`, `p_as`, `harpatka_admin_session_v2`): מתה מאז המעבר ל-roster (הגשר עונה `status: auth`, ודף הניהול של roster לא מקשר אליה). נמחקת בשלב 2.
- **`wa/` (כלי של הבעלים) נשאר כמו שהוא:** GSI עם הלקוח של הרפתקה דרך `/roster-auth/google`, טוקן משלו, והפונקציות `harpatka_wa_*`. הוא קורא את `CONFIG.rosterApi` (`authUrl`, `authKey`, `googleAuth`, `url`), ולכן `config.js` שומר את השדות האלה בשבילו עד ש-`wa/` ישתנה.

## 7. העלייה בשלבים

### שלב 0: הפלטפורמה (אף קובץ של הרפתקה)
| קובץ | מה | הערה |
|---|---|---|
| `apps/floa/domain/roster-site.js` | חדש: הספרייה | |
| `apps/floa/domain/supabase.js` | `SUPABASE.roster`, `TEST_HOSTS`, `SUPABASE.testStrip()`, פרופיל מפורש גובר, תיקייה רק במחשב מקומי וב-`floa.co.il` | עריכות ממוקדות |
| `build.mjs` | ממלא את `TEST_HOSTS` מ-`domains.json` כשמעתיקים את `domain/supabase.js` | עריכה ממוקדת |
| `apps/floa/domain/auth.js` | `api(path, opts)` מקבל `opts.profile` ושולח `Accept-Profile` ו-`Content-Profile` | **יש בו שינויים לא מקומטים של סשן אחר:** עריכה ממוקדת בלבד |
| `functions/_middleware.js` | `"/roster-site.js"` ב-`DOMAIN_FILES` | **שינויים לא מקומטים של סשן אחר:** עריכה ממוקדת |
| `apps/floa/domain/_headers` | שורה ל-`/roster-site.js` | |
| `apps/roster/site-meetings.sql`, `apps/roster/site-meetings.check.sql`, `apps/roster/prod-order.md` | חדשים, ושורה ב-prod-order | ההרצה על `roster-test` של מנהל העבודה; על `roster` ממתין |

### שלב 1: הקרביים של הגשר. `register.js` לא נוגעים בו
| קובץ | פונקציות | מה משתנה |
|---|---|---|
| `apps/harpatka/public/shared/roster-bridge.js` | `loadMeetings` | `FLOA_ROSTER.meetings({ past: 10, limit: 100 })`, אותו מיפוי לשורות הישנות, בלי קאש משלו |
| | `meetingsQuery` | בלי שינוי |
| | `signupPhone` | `FLOA_ROSTER.signupPhone({ phone, meeting_id, source_code, email })`. הטוקן נשמר בספרייה **ומשוכפל ל-`harpatka_roster_token`**, כי `register.js` קורא אותו ישירות (`reportPay`, `rosterSend`). `validation` על `phone` הופך ל-`{ status: 'invalid_phone' }` כמו היום |
| | `signupComplete` | `FLOA_ROSTER.signupComplete(...)`, אותו מיפוי שדות (`FIELD_CODE`) |
| | `reportToken` | `FLOA_ROSTER.payClick({ meeting_id, method })` |
| | יירוט חדש ב-`window.fetch` | כל בקשה שמתחילה ב-`CONFIG.rosterApi.url` (`/signup`, `/signup/phone`, `/signup/complete`, `/payments/click`, הבקשות הישירות של `rosterSend` ב-`register.js`) עוברת לפונקציה המתאימה של הספרייה, והתשובה נבנית כ-`Response` בצורה של ה-API: 200 והגוף, או הסטטוס של הקוד (422, 401, 409, 404, 429, 500) עם `{ error: { code, field } }`. `network` נזרק כמו כישלון של `fetch`. כך גם הבקשות האלה הולכות לסביבה הנכונה |
| | אתחול | `R.profile` לפי `FLOA_ROSTER.test` (`roster-test` או `roster`), `R.authUrl` ו-`R.authKey` מ-`SUPABASE`. `R.url` נשאר כמו שהוא (הוא הקידומת של היירוט). `useToken(harpatka_roster_token)` כשלספרייה אין טוקן |
| | העברת `me_*` | בלי שינוי, חוץ מהפרופיל לפי הסביבה, ו-`harpatka_me_phone` שולח תמיד את חמשת הארגומנטים כשיש מקור או אימייל |
| | `meJoin`, `clearOldSession`, הזיוף של ה-WebSocket הישן | בלי שינוי |
| `apps/harpatka/public/index.html`, `me/index.html`, `biodanza/index.html` | תגיות סקריפט | `<script src="/supabase.js">` ו-`<script src="/roster-site.js" data-business="harpatka" data-key="rk_pub_IXQvi…" data-test-key="rk_pub_81212…">` **בין `config.js` לבין `roster-bridge.js`**, ו-`?v=` חדש לגשר. **בלי `/auth.js` בשלב הזה:** הוא מוחק כל `#access_token` מהכתובת בטעינה, וזה היה שובר את קריאת ה-hash של `me/` ו-`register.js` |
| `apps/harpatka/public/sw.js` | `fetch` | `/supabase.js`, `/auth.js` ו-`/roster-site.js` ברשת קודם (כמו `/shared/`), ו-`CACHE_VERSION` חדש |

- המפתח הציבורי המלא של הבדיקות: `C:\Users\ofira\Desktop\harpatka\tools\roster_cfg.py` (קריאה בלבד). הוא ציבורי, כמו המפתח האמיתי שכבר כתוב ב-`config.js`.
- **תנאי מוקדם:** שלב 0 גמור, כולל שני התיקונים ב-`/supabase.js`. בלעדיהם `harpatka.floa.co.il/biodanza/` מקבל את הפרופיל `biodanza` על כל בקשה (סעיף 8).
- **בדיקה אחת:** ב-`npm run dev`, `localhost:5173/harpatka/`: ברשת יש `GET rpc/site_meetings` עם `Accept-Profile: roster-test`, ואין `/roster/v1/meetings`. הרשמה אחת בבדיקות מגיעה ל-`api-test` (שם באותיות לטיניות, ומוחקים רק כשמנהל העבודה אומר).

### שלב 2 (אחר כך): כותבים מחדש את הקוראים ומוחקים את הגשר
| קובץ | מה |
|---|---|
| `shared/register.js` | `loadNearestOnce` ל-`FLOA_ROSTER.meetings({ past: 10, limit: 100 })` (המפגש העתידי הראשון). `reportPay` ל-`me.reportPayment` או `payClick`. `updFlow` ו-`guestStep` ל-`signupPhone`. `phoneMode` ל-`me.phone`. השלמת פרטים ל-`me.complete`. ה-join ל-`me.phone` ואז `me.complete`. `rosterSend` ל-`signupComplete` או `signup`. `memberSubmit` ל-`me.register` (ו-`me.source` כשהגיעו ממודעה). `ME_KEY`, `TOK_KEY`, `meToken`, `meRpc`, `takeLoginHash`, `loginGoogle`, `loginWindow`, `gsiLoad`, `gsiPrompt`, `gsiButton`, `onGoogleCredential` נמחקים לטובת `FLOA_AUTH` ו-`FLOA_ROSTER.me`. `RT_CFG`, `rtTopic`, `ensureMeChannel` ושני ה-`HRT.channel` ל-`FLOA_ROSTER.live`. `IS_TEST` ו-`HARPATKA_ENV` נמחקים. צפייה כמשתתף (`AS`) נמחקת |
| `index.html` | `fetchMeetings` (ארבע הבקשות לטבלאות הישנות) ל-`FLOA_ROSTER.meetings({ past: 10, limit: 100 })`, אותם ערכים כמו `register.js` כדי לחלוק קאש. המאזין ל-`harpatka:meetings` ל-`FLOA_ROSTER.live` |
| `me/index.html` | `DB`, `SKEY`, `AKEY`, `refreshSession`, `goGoogle`, `rpc`, קריאת ה-hash ב-`start`, `useClaimToken`, `viewClaim`, ו-`HRT.channel` נמחקים. `harpatka_me` ל-`me.get()`, ושאר הפעולות לפונקציות `me.*` שבטבלה בסעיף 4 |
| `m/index.html` | `BASE` ל-`FLOA_ROSTER.mediaUrl('meeting-media-' + f.replace(/\//g, '-'))`, טוען `/supabase.js` ו-`/roster-site.js`. **הנפילה לאחסון של הפרויקט הישן (`OLD`) נמחקת** |
| `shared/config.js` | בלוק ההעברה של הסשן בראש הקובץ. `supabaseUrl` ו-`supabaseKey` של הפרויקט הישן נמחקים. `rosterApi` נשאר רק בשביל `wa/`, עם הערה שאומרת את זה. הבלוק "מעבר הדרגתי לרוסטר" נמחק |
| `shared/rt.js` | `channel` נמחק כשאין לו קורא. `loader`, `optimistic`, `busy`, `wrap` נשארים |
| `shared/roster-bridge.js` | נמחק, והתגית שלו יוצאת מכל הדפים. `/auth.js` נכנס לדפים עם אזור אישי |

- **תנאים מוקדמים:** Redirect URLs בדאשבורד (ממתין), ו-`site-meetings.sql` בסכמה האמיתית לפני שמשהו אמיתי קורא דרך הספרייה (ממתין). עד אז רשת הביטחון של סעיף 4 קוראת מה-API.

### מחוץ להגדרה הזאת
המעבר של `harpatka.co.il` עצמו ל-FLOA: שורה ב-`domains.json` בלי `test`, ה-DNS, וה-Redirect URL. זה של הבעלים.

## 8. סתירות עם הקוד הקיים

### `apps/harpatka/public/`
- **`shared/config.js`:** `supabaseUrl` ו-`supabaseKey` של הפרויקט הישן (`ezakarwqstnldqixgreb`), שנמחק ב-17.11.26. `rosterApi` כותב ביד את הכתובת האמיתית, את המפתח, את `profile: 'roster'`, ושכפול של ה-anon key ושל הכתובת של FLOA (`authUrl`, `authKey`), ולכן אין שום החלטה על סביבה. ההערה "מעבר הדרגתי לרוסטר" לא מתארת יותר את הקוד.
- **`shared/roster-bridge.js`:** כל הקובץ הוא מתאם. ההערה בראשו אומרת שהוא פעיל רק בסביבת הבדיקות, ובפועל הוא פעיל בייצור. `harpatka_roster_token` לא מופרד לפי סביבה. ברירת המחדל של הפרופיל היא `roster-test`. `harpatka_me_phone` עם מקור ובלי אימייל ובלי מפגש לא מוצא פונקציה ב-PostgREST (לגרסה עם חמישה ארגומנטים אין ברירות מחדל). ההערה אומרת `past=3`, והקוד `past=10`.
- **`shared/register.js`:** `rosterSend` שולח ישירות ל-`CONFIG.rosterApi.url` עם המפתח של `config.js`, ולכן תמיד לסביבה האמיתית. כל הקריאות לפרויקט הישן (`harpatka_signup_phone`, `harpatka_signup_complete`, `harpatka_report_payment_token`, `harpatka_meetings`, `harpatka_meeting_types`, `harpatka_public_settings`) חיות רק בזכות הגשר. סשן משלו (`harpatka_me_session`), רענון משלו, קריאת hash משלו, וקוד GSI. הנושאים של הערוצים נבנים מ-`CONFIG.rosterApi`. `IS_TEST` נשען על `HARPATKA_ENV`, שלא קיים ב-FLOA.
- **`index.html`:** `fetchMeetings` שולח ארבע בקשות לטבלאות הישנות, ורק הגשר הופך אותן לקריאה אחת.
- **`me/index.html`:** הקבוע `DB` של הפרויקט הישן ומפתחו. סשן, רענון וכתובות כניסה משלו. `harpatka_me_claim` ו-`harpatka_me_claim_token` לא קיימים ב-roster (הגשר עונה `none`). הערוץ נבנה מ-`CONFIG.rosterApi`.
- **`m/index.html`:** הדלי `roster-media` והמזהה של העסק כתובים ביד, כלומר תמיד הסביבה האמיתית. נופל לאחסון של הפרויקט הישן.
- **`biodanza/index.html`:** טוען את הגשר ואת `register.js` כמו דף הבית.
- **`sw.js`:** סקריפטים בשורש (`/supabase.js`, `/roster-site.js`) מוגשים מהקאש קודם (stale-while-revalidate).
- **`apps/harpatka/index.js`:** ההערה "העותק הזה מקומי ולא מחובר לשום דומיין" כבר לא נכונה (`harpatka.floa.co.il`).

### הדומיין
- **`apps/floa/domain/supabase.js`:**
  - **התיקייה בנתיב נחשבת בכל מארח,** בניגוד להערה שלו (רק במחשב מקומי ובכתובת הישנה). ב-`harpatka.floa.co.il/biodanza/` (ובעתיד `harpatka.co.il/biodanza/`) התיקייה `biodanza` נמצאת ב-`SCHEMAS`, ולכן כל בקשת REST מהדף הזה מקבלת `Accept-Profile: biodanza`, גם בקשות ל-roster.
  - `h.set` דורס פרופיל שהבקשה כבר נושאת. צריך: רק כשאין.
  - אין `SUPABASE.roster`, אין `TEST_HOSTS`, והפס מצויר רק כשהסכמה של הדף היא `roster-test`.
  - **אסור להוסיף את `harpatka` ל-`SCHEMAS`:** קיימת סכמה ישנה בשם הזה עם 33 טבלאות, והדף היה נשלח אליה.
- **`apps/floa/domain/auth.js`:** `api` לא יודע לשלוח כותרות פרופיל, ולכן `me.*` לא יכולים לעבור דרכו בדף ש-`/supabase.js` לא נותן לו סכמה. `take` מוחק כל `#access_token` בכל דף שטוען אותו (ולכן הוא לא נכנס לדפים של הרפתקה לפני שלב 2). אין `adopt` (One Tap בהמשך).
- **`functions/_middleware.js`:** `/roster-site.js` לא ב-`DOMAIN_FILES`.
- **`apps/floa/domain/_headers`:** אין שורה ל-`/roster-site.js`.
- **`build.mjs`:** לא ממלא `TEST_HOSTS`.

### הדאטהבייס וקבצי ה-SQL
- **`roster.api_signup_phone` (וגם ב-`roster-test`) מכיל ענף שכתוב רק להרפתקה,** שלא קיים ב-`apps/roster/api-phone-signup.sql`: `b.slug = 'harpatka'`, ובלי מפגש נכתבת הערה "ביקש/ה עדכונים בוואטסאפ" (`updates_requested`). שתי בעיות: הקובץ בריפו מאחורי הדאטהבייס (צריך להעתיק אליו את הגוף החי, בלי שינוי התנהגות), ושם של עסק בתוך פונקציה של המנוע (ההחלפה בכלל כללי ממתינה, סעיף 9).
- **`apps/roster/prod-order.md`:** אין בו `site-meetings.sql`.
- **פקודת ה-sed ב-`apps/roster/extra-fields.check.sql`** מוחקת את התו שלפני `roster.` ולא מחליפה את `search_path`. ההוכחה: `"roster-test".api_signup_extra` עם `search_path=roster, public`, כלומר שם לא מוסמך בתוכה נקרא מהסכמה האמיתית.
- **ההרשאות ב-`roster-test` רחבות מאוד מ-`roster`:** 111 מתוך 136 פונקציות פתוחות ל-`anon` (ב-`roster`: אפס), ביניהן `events_claim` (מחזיר את סוד ה-webhook ונתוני משתתפים של סכמת הבדיקות), `events_done`, `api_record_payment`, `api_register`, `api_signup`, `api_payment_click`, `api_key_of`, `rate_take`, `me_resolve`. ה-hash של מפתח ציבורי מחושב מהמפתח שבדף, ולכן אפשר לקרוא ל-`api_signup` ישירות ולעקוף את הבלמים של ה-Worker. בלי תיקון, גם בדיקת ההרשאות של `site_meetings` שם לא אומרת הרבה.
- **המפתח של הרפתקה ב-`roster-test` הוא מסוג `test`** (מה ש-`db-split` השאיר). `api_auth` של הבדיקות בודק מקור רק ל-`public`, ולכן המקורות שלו לא נאכפים, ו-`/payments/click` (שדורש `public`) נדחה עם `wrong_key_kind`. כלומר `payClick` לא עובד היום בסביבת הבדיקות של הרפתקה.
- **`business_settings.realtime` כבוי להרפתקה בסכמה האמיתית** (בבדיקות דלוק), ולכן הערוץ `roster:harpatka` שותק בייצור.
- **הסכמה `public` לא ריקה:** בה `harpatka_wa_*` ועוד פונקציות, בניגוד ל-CLAUDE.md. `wa/` נשאר כמו שהוא, אז רק לתיעוד.

### ה-Worker
- **`worker/src/roster/routes.js`, ההערה בראש הקובץ:** "A business's own site never talks to the database ... this is the only door". מעכשיו הקריאה של המפגשים ישירה. צריך לתקן את ההערה בלבד. שום שורת קוד ב-`worker/src/roster/` לא משתנה.

### שורות ל-CLAUDE.md
סעיף חדש אחרי "ההתחברות שייכת לדומיין":

> ## אתר של עסק מדבר עם roster דרך `/roster-site.js`
> - **קובץ אחד לכל אתר של עסק** (`apps/floa/domain/roster-site.js`, נטען כ-`/roster-site.js` אחרי `/supabase.js` ו-`/auth.js`). ההגדרה ב-`apps/roster/SITE.md`. האתר נותן רק `data-business`, `data-key` ו-`data-test-key`, ומדבר רק עם `FLOA_ROSTER`.
> - **קריאה ישירה, כתיבה דרך ה-API.** רשימת המפגשים נקראת מ-`site_meetings` (anon, אותה תשובה של `GET /meetings`). הרשמה, טלפון, השלמת פרטים ולחיצת תשלום עוברות ב-API הציבורי כמו היום. `site_meetings` היא לא חלק מה-API, אבל היא חייבת להחזיר בדיוק את הצורה הציבורית שלו.
> - **הסביבה נקבעת לפי המארח בלבד, ב-`/supabase.js`** (`SUPABASE.roster`): מחשב מקומי, `roster-test`, סביבת בדיקות שהוזרקה, ומארח עם `"test": true` ב-`domains.json` הם `roster-test` ו-`api-test`. כל השאר אמיתי. אף פעם לא מפרמטר בכתובת או מהדף.
> - **פונקציה שמותר ל-`anon` לקרוא לה בסכמה של roster מתחילה ב-`site_`,** והרשאה שלה רק ל-`anon` ול-`authenticated`.

ושני תיקונים בסעיפים קיימים:
- בסעיף הדאטהבייס, אחרי "איך הבקשות מגיעות לסכמה": "פרופיל שהבקשה כבר נושאת גובר. התיקייה בנתיב נחשבת רק ב-localhost וב-floa.co.il. **שם של עסק לא נכנס ל-`SCHEMAS` בגלל אתר,** ובפרט לא `harpatka` (יש סכמה ישנה בשם הזה)."
- בסעיף של ה-API, בשורת "כתובת לבדיקות": אחרי "(roster-test.floa.co.il, localhost)" להוסיף "ומארח תצוגה מקדימה עם `test: true` ב-`domains.json`".

## 9. ממתין להחלטת הבעלים (PENDING)
כל אחד מאלה מסומן כממתין ולא ממומש. כל השאר ממומש.
1. **ממתין: להריץ את `site-meetings.sql` בסכמה האמיתית `roster`.** פונקציה חדשה בלבד, שום דבר קיים לא מוחלף, ושום תשובה של ה-API לא משתנה. באישור מפורש, קובץ אחד, עם הבדיקה של AUM לפני ואחרי.
2. **ממתין: ההסכמה לפי המפתח הציבורי.** כל עסק עם מפתח ציבורי בתוקף נקרא דרך `site_meetings`, כלומר בייצור היום AUM והרפתקה. של AUM שום דבר לא משתנה, וזה אותו מידע שהמפתח שלה כבר נותן לכל מי שמחזיק אותו. החלופה, מתג מפורש לכל עסק, דורשת עמודה חדשה (DDL).
3. **ממתין: בלי בדיקת מקור בקריאה הישירה.** ההצעה: לא לבדוק. אם רוצים זהות מלאה ל-API, הקריאה מהתצוגה המקדימה וממחשב מקומי נקשרת לשאלה 4.
4. **ממתין: התצוגה המקדימה `harpatka.floa.co.il` רצה על נתוני בדיקה** (עותק ב-`roster-test`, עם הפס). אם הבעלים רוצה אותה על נתונים אמיתיים, הכתיבה ממנה דורשת להוסיף את המקור שלה ל-`allowed_origins` של המפתח האמיתי של הרפתקה, וזו שאלה על החוזה של ה-API. אותו דבר ל-`localhost`.
5. **ממתין: המפתח של הרפתקה ב-`roster-test` מסוג `test`.** בגללו `payClick` נדחה שם (`wrong_key_kind`) והמקורות לא נבדקים. התיקון: `kind = 'public'`, ובאותו רגע `allowed_origins` שכולל `https://harpatka.floa.co.il` ו-`http://localhost:5173` (או רשימה ריקה). כתיבה לדאטהבייס ושינוי של `allowed_origins`, ולכן שאלה לבעלים.
6. **ממתין: Redirect URLs ב-Supabase** (Authentication, URL Configuration, צעד ידני של הבעלים בדאשבורד): `https://harpatka.co.il/`, `https://www.harpatka.co.il/` (אם `www` מגיש דפים ולא מפנה), `https://harpatka.floa.co.il/`, `http://localhost:5173/harpatka/`. לפני שלב 2.
7. **ממתין: מסך ההסכמה של גוגל.** הניתוב מציג את האפליקציה של FLOA ולא של הרפתקה, והקוד של הרפתקה נמנע מזה בכוונה. לאשר, או להשאיר את האזור האישי כבוי עד One Tap (סעיף 6).
8. **ממתין: להדליק את האזור האישי לציבור** (`CONFIG.googleLogin = true`) אחרי שלב 2. היום הוא כבוי, והמעבר ל-`/auth.js` לא משנה כלום למבקר עד ההחלטה הזאת.
9. **ממתין: להדליק זמן אמת להרפתקה בסכמה האמיתית** (`business_settings.realtime = true`). כתיבה בייצור. עד אז `live` הוא רק גיבוי תקופתי וחזרה ללשונית.
10. **ממתין: הענף של הרפתקה ב-`api_signup_phone`.** להחליף את `slug = 'harpatka'` במתג כללי לכל עסק ("טלפון בלי מפגש מאדם קיים כותב הערה"), שדורש עמודה ב-`business_settings` (DDL), או להשאיר. ההעתקה של הגוף החי לקובץ בריפו לא ממתינה.
11. **ממתין: לצמצם את ההרשאות ב-`roster-test`** כדי שיהיו כמו ב-`roster` (111 פונקציות פתוחות ל-`anon`, כולל `events_claim`), ולתקן את `search_path` של `"roster-test".api_signup_extra`. כתיבה לדאטהבייס, ומי שבודק דרך סכמת הבדיקות נשען על זה.
12. **לידיעה, לא החלטה:** צפייה כמשתתף (`?as=`) מתה מאז המעבר ל-roster ונמחקת בשלב 2. אם הבעלים רוצה אותה, זו תכונה חדשה בצד של דף הניהול.
