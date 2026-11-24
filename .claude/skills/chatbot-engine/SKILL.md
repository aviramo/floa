---
name: chatbot-engine
description: הצ'אט הסטטי של chatbot.floa.co.il ועמוד העריכה שלו. לטעון לפני כל שינוי ב-apps/chatbot או ב-supabase/functions/chatbot.
---

# הצ'אט הסטטי

אין סוכן, אין AI ואין שמירה של שיחות. הצ'אט הוא הודעה, שלוש אפשרויות, תגובה קבועה לכל אפשרות, ושוב: חמש הודעות. ההודעה החמישית מציעה פעולות (אתר, קבוצת עדכונים, וואטסאפ). הברכה היא בועה נפרדת ולא נספרת.

## הכתובת

`chatbot.floa.co.il/<עסק>?ad=<קוד>&gender=<female|male>`. שני פרמטרים בלבד: `ad` תמיד, `gender` יכול להיות ריק (אז גרסת "שני המינים"). `s` ו-`fresh` הם פרמטרים טכניים (מקור, בדיקה).

## התוכן

מסד: `chatbot.script_versions` (גרסה לכל שמירה, אחת מפורסמת) ו-`chatbot.script_drafts` (טיוטה משותפת אחת). הגישה רק דרך פונקציות service role (`apps/chatbot/script-content.sql`). הצורה: `{ greeting, defaultAd, ads: { <קוד>: { ad, female, male, both } } }`, וכל גרסה היא 5 הודעות `{ say, options: [{ label, reply }] x3 }`, כשלהודעה האחרונה `action: site|updates|whatsapp`. לכל מודעה יש `both` או גם `female` וגם `male`. הקובץ `apps/chatbot/public/businesses/<עסק>.script.json` הוא גיבוי כשהפונקציה לא עונה.

## מי עושה מה

- `apps/chatbot/public/assets/chat.js`: הצ'אט עצמו. קורא את התוכן המפורסם מהפונקציה (מצב `script`), נופל לקובץ.
- `apps/chatbot/public/admin/`: העורך. כניסה עם Google, רק מי שברשימה `chatbot.admins`. שמירה יוצרת גרסה ומפרסמת, יש טיוטות וביטול צעד.
- `supabase/functions/chatbot/`: שני מצבים בלבד, `script` (קריאה ציבורית) ו-`script_admin` (עריכה). `businesses.ts` מחזיק את האתרים המורשים לכל עסק.
- `scripts/chatbot-script.mjs`: `list`, `pull`, `push`, `publish` מהטרמינל.
- עסק חדש: שורה ב-`businesses.ts`, קובץ `businesses/<עסק>.json` (מראה וקישורים) ושורה ב-`chatbot.admins` לכל עורך.

## כללי טקסט, לכל מודעה ולשני המינים

בלי מקף ארוך או בינוני, בלי גרשיים, קו נטוי או סוגריים, בלי נקודה אחרי המשפט האחרון בהודעה או באפשרות. לבוט אין מגדר. האפשרויות בגוף ראשון. כל כלל חל על כל המודעות.

## פריסה

הפונקציה: `supabase functions deploy chatbot --no-verify-jwt --project-ref aexmnaxvahblveejsbup`. הדפים נפרסים מ-main ב-CI. מעלים את `?v=` ב-`index.html` אחרי שינוי בנכסים.
