# יוצאים להרפתקה: קבצים, כלים ודף המודעות (מצורף ל-SKILL.md)

הכלים נמצאים ב-FLOA: `apps/harpatka/tools/` (`ads/`, `motion/`, ושני מודולים משותפים: `paths.py` ו-`publish.py`). מריצים אותם משורש FLOA או מכל מקום (הנתיבים נקבעים ב-`paths.py`, לא בתיקייה שממנה מריצים). כלי `motion/` רצים עם הפייתון של motion-studio (`~/.motion-studio/venv`).
המקור הישן `C:\Users\ofira\Desktop\harpatka` עדיין חי, ולא נוגעים בכלים שם.

## היכן הקבצים
- **קלט:** `apps/harpatka/tools/ads/sentences.txt` (הכרויות) ו-`sentences-move.txt` (תנועה): שורה לכל מסר; מה שבתוך `[ ]` בצבע ההדגשה. לא מתפרסמים.
- **נתונים (מקור האמת המקומי):** `apps/harpatka/public/ads/_data/`: `ads.json`, `videos.json`, `registry.json`, `featured.json`, `video-cuts.json`. הדף קורא אותם מהחנות (`ads/_data/<name>.json`) ונופל להעתק הזה כשאין תשובה.
  - `registry.json`: טקסט לכל מספר סידורי קבוע, ו-`next`. מנוהל על ידי `build_ads.py`.
  - `ads.json`: נבנה על ידי `build_ads.py`. `videos.json` ממפה מספר לקובץ (`{"1": "ad-01-xxxx.mp4"}`), נכתב על ידי `publish_videos.py` (או ידנית).
  - `featured.json`: הסרטונים המובילים (מה שהיה המערך `FEATURED`): `{ label, name, type, base, w, h, img: 'img/...jpg', vid: 'video/...mp4', alt, cr: true?, cat: 'dating'? }`.
- **מדיה (לא בריפו):** תיקייה מקומית `HARPATKA_MEDIA_OUT` (ברירת מחדל `C:\Users\ofira\Desktop\harpatka\ads`): `img/`, `video/`, `social/`. משם `publish.py` מעלה לחנות.
  - `img/ad-NN-916.png` (קיימים) ו-`img/ad-NN-916-<hash>.png` (כל תמונת מסר חדשה או שהשתנתה). `ad-NN.png` הישנים (4:5) נשארים בשביל `?ad=N`.
  - `video/ad-NN-<hash>.mp4`; סרטונים מובילים `video/<base>-<hash>.mp4` ופוסטר `img/<base>-<hash>.jpg`.
- **פרויקטי motion:** `HARPATKA_MOTION_ROOT` (ברירת מחדל `C:\Users\ofira\Desktop\harpatka\motion`): `ad-NN/` (מסרים), `<name>/` (מובילים), `covers/ad-NN.png`, `review/`. התבנית של הכיסוי בתוך הכלים: `tools/motion/cover/`.
- **בחנות (MEDIA.md):** מפתחות יחסיים לעסק: `ads/img/<file>`, `ads/video/<file>`, `ads/_data/<name>.json`.

## משתני סביבה
| משתנה | ברירת מחדל | מה |
|---|---|---|
| `HARPATKA_MEDIA_OUT` | `C:\Users\ofira\Desktop\harpatka\ads` | לאן נכתבות תמונות וסרטונים, ומהיכן הם מועלים |
| `HARPATKA_MOTION_ROOT` | `C:\Users\ofira\Desktop\harpatka\motion` | פרויקטי ה-motion (המיקום החדש עוד לא הוחלט) |
| `HARPATKA_MEDIA_MANIFEST` | `C:\Users\ofira\Desktop\harpatka-media-staging\manifest.json` | מקור טקסט ה-copyright לכל קובץ |
| `MOTION_PYTHON` | `~/.motion-studio/venv/Scripts/python.exe` | הפייתון של motion-studio (`override.py`, `pick27.py`) |
| `MEDIA_REFRESH_TOKEN` (ב-`.env` של FLOA) | | הכניסה של `media-upload.mjs` כשמעלים בפועל (MEDIA.md, "Signing in as staff") |

## כרטיס בדף המודעות
- סרטון מוביל: רשומה ב-`featured.json`. `base` הוא מזהה ייחודי והקישור `ads/?a=<base>` (מסרים: `?a=ad-07`). `cr: true` = מוזיקה מסחרית ("מוגן בזכויות יוצרים"); בהעלאה הקבצים מקבלים את הטקסט הזה בשדה `copyright`. `cat: 'dating'` = "הכרויות", בלעדיו "תנועה". `alt` הוא גם טקסט החיפוש. גרסה נוספת = רשומה חדשה עם תווית מבדילה, הקודמת נשארת.
- קטגוריות (`?c=`): `dating`, `move`, `other-dating`, `other-move`, `client-<key>`. הסרטונים בדף כולם 9:16.

## כלים וסדר הרצה

**תמונת מסר:** שורה חדשה ב-`sentences*.txt` ← `python apps/harpatka/tools/ads/build_ads.py` (רק חסרות; `--all` הכל; דורש Chrome). תמונה חדשה או שהשתנתה מקבלת שם `ad-NN-916-<hash>.png`; בייטים זהים שומרים את השם הקיים. `registry.json` ו-`ads.json` נכתבים רק כשהשתנו. בסוף מודפסת תוכנית ההעלאה של מה שהשתנה. לשמירת מספר בשינוי ניסוח (רק בבקשה מפורשת): מחליפים בשורה וב-`registry.json` באותו מספר, מוחקים את התמונה המקומית, ומריצים.

**סרטון מסר `<motion>/ad-NN`** (סדר; `render_seq.py` עושה את כולו). כל הכלים ב-`apps/harpatka/tools/motion/`:
1. בנייה: `build_ads3.py` (51+) / `build_ad.py` / `build_ads2.py`, ואחר כך `story_format.py <מספרים>` (9:16).
2. `invite_bg.py`, `no_locked.py`, `strip_punct.py`.
3. `render.py full` (בתיקיית המודעה).
4. `music_accents.py <מספרים>`.
5. `make_covers.py <מספרים>` (כיסוי לפריים הראשון).
6. בדיקה ואז `publish_videos.py <מספרים>`: פריים 0 = כיסוי, שם `ad-NN-<hash>.mp4` ב-`HARPATKA_MEDIA_OUT/video`, מעדכן `_data/videos.json`, ומדפיס תוכנית העלאה (`--local` מדלג על התוכנית).
- בבת אחת: `python apps/harpatka/tools/motion/render_seq.py 51-100` (יומן `<motion>/review/render-seq.log`; HOLD = לא פורסם; `out/seq.ok` = הסתיים). בסוף: תוכנית העלאה אחת לכל מה שעבר. המתנה למנה: `sh apps/harpatka/tools/motion/wait_chunk.sh <מספר מודעות>` (קורא את היומן לפי `HARPATKA_MOTION_ROOT`).
- `override.py` ו-`pick27.py`: כלים חד פעמיים של מודעות 27 עד 50 (כבר גמורות), לא חלק מהזרימה.
- `build_ads3.py cuts` כותב ל-`_data/video-cuts.json`; `build_ads3.py sentences` ל-`tools/ads/sentences-move.txt`.
- מוזיקה ועריכות: `peakmap.py`, `songmap.py`, `cardpoint.py`, `override.py`, `samesong.py`, `card_loudness.py` (מתיקיית ה-motion), `search_end.py` ואחריו `rerender_search.py`.

**סרטון מוביל `<motion>/<name>`:** motion-studio; רינדור `NOAUDIO=1 python render.py full`, מוזיקה ב-`make_music.py`, פריים ראשון מוחלף, AAC 320k, העתקה עם hash ל-`HARPATKA_MEDIA_OUT/video` ו-`img`, רשומה ב-`featured.json`, ואז `publish.py featured <base>`.

**תמונות אחרות:** `build_pain_ads.py` (ל-`HARPATKA_MEDIA_OUT/img`, לא ב-`ads.json`), `build_photo_ads.py` (לדרייב), `build_flyer.py` ו-`build_social.py` (ל-`HARPATKA_MEDIA_OUT/social`, לא לחנות).

## פרסום לחנות: `publish.py`

כל העלאה עוברת דרך `apps/harpatka/tools/publish.py`, שבונה manifest קטן של מה שהשתנה ומריץ `node scripts/media-upload.mjs --business=harpatka --manifest=<file>`. אין git, `stage.py`, `promote.py` או `publish_chunk` הישן.

```
python apps/harpatka/tools/publish.py ad 7 12 51-60          תמונה + סרטון של מסרים, ads.json, videos.json
python apps/harpatka/tools/publish.py video 51-60            רק הסרטונים ו-videos.json
python apps/harpatka/tools/publish.py featured paphos-30s    פוסטר + סרטון של כרטיס מוביל, featured.json
python apps/harpatka/tools/publish.py data [videos.json …]   קבצי _data (ברירת מחדל: כל החמישה)
python apps/harpatka/tools/publish.py file raw/x.mov=D:\x.mov   כל קובץ אחר
python apps/harpatka/tools/motion/publish_chunk.py 51-60     מנת סרטונים (מה ש-videos.json מציין) ו-videos.json
```
- **ברירת מחדל: רק תוכנית** (הרצה יבשה של `media-upload.mjs`: לא נכתב ולא נשלח דבר). `--list` גם קורא מה כבר יש בחנות.
- **העלאה רק עם `--publish`** (בכל כלי: `build_ads.py`, `publish_videos.py`, `render_seq.py`, `publish_chunk.py`, `publish.py`), **ורק כשבעל העסק אמר במפורש להעלות.** המלצת הסקריפט: להריץ מיד אחרי 00:00 UTC. דורש `MEDIA_REFRESH_TOKEN` ב-`.env`.
- בכל רשומה: `key`, `path`, `type`, `bytes`, `sha256`, רוחב וגובה ומשך (מ-ffprobe), `title` (טקסט המסר או התווית), ו-`copyright`.
- **`copyright`: הטקסט המדויק לכל קובץ** מה-manifest של בעל העסק (`HARPATKA_MEDIA_MANIFEST`, ברירת מחדל `C:\Users\ofira\Desktop\harpatka-media-staging\manifest.json`), למשל "מוזיקה: David Bowie - Changes"; לתמונה ולסרטון של אותו כרטיס אותו טקסט. **אין ברירת מחדל כללית:** כרטיס חדש עם `cr: true` שלא מופיע שם נדחה, עד שמוסיפים `--copyright "מוזיקה: <אמן> - <שיר>"` (`publish.py featured <base> --copyright "..."`).
- קבצי `_data` נשלחים באותה הרצה (אחרי המדיה, ונדרסים). אם גרסת `media-upload.mjs` לא תומכת בהם, `publish.py` מוציא אותם מה-manifest ומדפיס אותם בנפרד, והדף קורא את ההעתק ב-`public/ads/_data/`.
- **קשרים בין מודעות לחומרי גלם ושירים:** אחרי פרסום מודעה חדשה מריצים `python apps/harpatka/tools/ads/build_links.py`, ומעלים את `apps/harpatka/tools/ads/_data/links.json` למפתח `raw/_data/links.json` (פרטי, לצוות בלבד; לעולם לא תחת `public/`): `python apps/harpatka/tools/publish.py file raw/_data/links.json=apps/harpatka/tools/ads/_data/links.json`.
- מה שכבר בחנות עם אותם בייטים מדולג בהרצה. קובץ ישן לא נמחק מהחנות; מוחקים מודעה בהעברת המדיה שלה לאשפה מדף המודעות.
