# צ'אטבוט (chatbot.floa.co.il)

מנוע שיחה אחד לכל עסק ולכל פילוח. הכתובת של שיחה: `chatbot.floa.co.il/<עסק>?pain=<קמפיין>`. הערך `pain` הוא מזהה אטום של קמפיין, והשרת פותר אותו. הדפדפן לא קובע כאב או פילוח.

## הזרימה בקצרה

1. מודעה מפנה לקישור. הדף טוען את `public/businesses/<עסק>.json` (מראה, קישורים, פתיחות גיבוי) ואת הווידג'ט.
2. הפונקציה `chatbot` (`supabase/functions/chatbot/`) פותרת את הקמפיין: נושא, פילוח, גרסת תוכן, מסלול.
3. המודל מקבל ארבע שכבות נפרדות: פרסונה של העסק, כללי המנוע, אבני הדרך של המסלול, ועובדות הסשן (מצב, מחקר שמסומן כהשערה, מפגש קרוב, תובנות מאושרות).
4. בכל הודעה המודל מחזיר תשובה, תשובות מוכנות ובלוק `<state>`. השרת בודק אותו מול המסלול, קובע את הכפתור לפי `action`, ושומר שיחה, מצב ואירועים.
5. מצוקה קשה מסומנת `safety` גם על ידי בדיקה בשרת, וחוסמת כל מסלול המרה.

## מה מוגדר איפה

| מה | איפה |
|---|---|
| אבני הדרך (שש, מסלול כאב) | `supabase/functions/chatbot/journey.ts`, וגרסאות חדשות בטבלה `chatbot.journeys` |
| טון, גבולות ועובדות על המפגשים | `supabase/functions/chatbot/businesses/<עסק>/persona.ts` |
| מודעות ישנות והשערות כאב | `businesses/<עסק>/ads.ts` (המפתחות ממשיכים לעבוד) |
| מחקר לפי נושא ופילוח | `chatbot.research_profiles`, בגרסאות (`chatbot.content_versions`) |
| קמפיינים | `chatbot.campaigns` |
| שיחות, מצב ואירועים | `chatbot.logs`, `chatbot.events` |

עסק חדש: תיקייה ליד `businesses/harpatka/` ושורה ב-`businesses/index.ts`, וקובץ `public/businesses/<עסק>.json`.

## עבודה שוטפת (`scripts/chatbot.mjs`)

```
node scripts/chatbot.mjs dims                              ממדי הפילוח הקיימים
node scripts/chatbot.mjs dims add age range                להוסיף ממד (גיל כטווח)
node scripts/chatbot.mjs research validate <קובץ.json>     בדיקת קובץ מחקר, חינם, לא נוגע בכלום
node scripts/chatbot.mjs research load <קובץ.json>         קליטה כטיוטה (עדיין לא חי)
node scripts/chatbot.mjs research activate <id> --yes      הפעלת גרסה
node scripts/chatbot.mjs campaign create --business harpatka --topic <נושא> --gender female --relationship partnered --ad "משפט המודעה"
node scripts/chatbot.mjs campaign activate <id>
node scripts/chatbot.mjs links                             הקישורים של כל הקמפיינים הפעילים
```

קובץ המחקר הוא JSON: `version.label` ורשימת `profiles`, ולכל פרופיל `topic_id` (אנגלית קטנה), `segment` (למשל `{"gender":"female","relationship_status":"partnered"}`), `title`, `evidence` (A עד D) ו-`profile` עם השדות שיש במקור (`description`, `visible`, `hidden`, `why_hidden`, `triggers_pain`, `triggers_change`, `triggers_trial`, `coping`, `effectiveness`, `desires`, `biodanza`, `exercises`, `experiences`, `concerns`, `grounding`). שדה שאין במקור נשאר חסר ולא מושלם בניחוש.

פרופיל נבחר רק לפי התאמה מדויקת לנושא ולפילוח של הקמפיין. אם אין, השיחה כללית ובלי ידע מומצא. קמפיין מושהה לא נטען.

## בדיקה לפני שמשהו עולה

קישור בדיקה עם המנוע החדש: אותו קישור עם `&engine=next` (הפונקציה `chatbot-next`). בדיקות שקוראות ל-Claude עולות כסף, ולכן קריאה אחת או שתיים ממוקדות בלבד. הבדיקות החינמיות: `cd supabase/functions/chatbot && deno test --allow-env` ו-`node apps/chatbot/test/engine-lib.test.mjs`.

## מעבר מהמנגנון הישן

מודעות הפייסבוק הישנות מצביעות על `harpatka.co.il/chat/?c=...` והפונקציה `harpatka-chat` שנפרסה מריפו הרפתקה. הן ממשיכות לעבוד עד שמחליפים את הכתובות או הופכים את הדף הישן לניתוב. הפונקציה `chatbot` הפרוסה היום היא עדיין הגרסה הישנה, והמנוע החדש נפרס ל-`chatbot-next`. המעבר לחי הוא פריסה של התיקייה הנוכחית כ-`chatbot`, באישור מפורש.

## עדיין לא בנוי

קליטה אוטומטית של קובץ גולמי (PDF או DOCX) לפרופילים, ניתוח לילי של תובנות עם אישור, צופה שיחות עם כניסת Google, ויצירת תמונות למודעות.
