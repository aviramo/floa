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
node scripts/chatbot.mjs campaign create --business harpatka --topic <נושא> --gender female --ad "משפט המודעה"
node scripts/chatbot.mjs campaign activate <id>
node scripts/chatbot.mjs links                             הקישורים של כל הקמפיינים הפעילים
```

קובץ המחקר הוא JSON: `version.label` ורשימת `profiles`, ולכל פרופיל `topic_id` (אנגלית קטנה), `title`, `evidence` (A עד D) ו-`profile` עם השדות שיש במקור (`inner_sentence`, `asks_for`, `description`, `hidden`, `triggers_pain`, `triggers_change`, `cycle`, `biodanza`, `experiences`, `promise`, `not_promise`, `barriers`, `opening_questions`, `concerns`, `grounding` ועוד, הרשימה המלאה ב-`apps/chatbot/engine-lib.mjs`). שדה שאין במקור נשאר חסר ולא מושלם בניחוש. `segment` אופציונלי.

**הפילוח היחיד הוא מגדר** (`gender`: `female` או `male`), והכאב הוא אותו כאב לנשים ולגברים. לכן פרופיל בלי `segment` הוא מקור המידע של הכאב לכולם, ושני קמפיינים על אותו כאב, אחד של נשים ואחד של גברים, משתמשים באותו פרופיל. פרופיל עם `segment` גובר רק עבור הקהל שלו. אם אין פרופיל תואם, השיחה כללית ובלי ידע מומצא. קמפיין מושהה לא נטען. מגדר הקמפיין קובע גם את לשון הפנייה.

## המחקר הנוכחי

`apps/chatbot/research/five-pains-2026-11.json`, מתוך `apps/chatbot/docs/pain-research-five-pains.pdf`: חמישה כאבים (`stress_overload`, `loneliness`, `lost_joy`, `low_confidence`, `opening_up`), עשרה קמפיינים (כאב אחד כפול מגדר). המסמך המשולב הקודם (ארבע קבוצות לפי זוגיות) נמחק ב-2026-11-24.

## בדיקות

בדיקות שקוראות ל-Claude עולות כסף, ולכן קריאה אחת או שתיים ממוקדות בלבד. הבדיקות החינמיות: `cd supabase/functions/chatbot && deno test --allow-env` ו-`node apps/chatbot/test/engine-lib.test.mjs` (הוא גם חלק מ-`npm test`). פריסה: `supabase functions deploy chatbot --no-verify-jwt --project-ref aexmnaxvahblveejsbup`.

## המנגנון הישן

המנוע הגנרי חי מ-2026-11-23 בפונקציה `chatbot`. נמחקו המנגנון הישן של הרפתקה: הפונקציה `harpatka-chat`, הטבלה `harpatka.chat_logs`, פונקציות הלמידה הישנות וטבלאות `chat_chips` ו-`chat_offers`. נשארו `harpatka_chat_usage_hit` והטבלה `chat_usage` (הגנה מניצול). הגרסה הישנה של המנוע נמצאת בהיסטוריית git (הקומיט `fd07e96d`).

## עדיין לא בנוי

קליטה אוטומטית של קובץ גולמי (PDF או DOCX) לפרופילים, ניתוח לילי של תובנות עם אישור, צופה שיחות עם כניסת Google, ויצירת תמונות למודעות.
