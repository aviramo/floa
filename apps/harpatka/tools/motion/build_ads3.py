"""Builder for ads 51..100, the set about feeling stuck (category "תנועה חדשה" on the ads page).
Run story_format.py after it (9:16 frame, the content in the 4:5 safe area; a rebuild from the already 9:16 ad-12 / ad-13 keeps it).
Same code as ads 1..50: scene.js from ad-12 ('end': the highlight closes the question) or ad-13 ('mid': the highlight sits mid sentence),
core.js, render.py and audio.py untouched. Only the words, the beat plan and the invitation title change.

Music: a random permutation of ads 1..50 (motion/music-map-51-100.json). Each new ad takes one existing ad's song, section, beat grid and
invitation beats exactly as they are, so every song in the old videos is used and the invitation still lands on its rhythm change.
The draw is random; a swap only moves the longest sentences off the shortest word sections (over MAX_WPS words a second).

Words: every sentence is written as fine phrases, one per beat. A fast song has more beats (each phrase its own beat, extra beats go to the
longest phrases); a slow song has fewer (the shortest neighbouring phrases are merged).

usage: python build_ads3.py map            draw the music (only once; refuses to overwrite)
       python build_ads3.py scenes [51 52] write motion/ad-NN (all by default)
       python build_ads3.py sentences      write tools/ads/sentences-move.txt ([ ] = the highlight, as in the video)
       python build_ads3.py cuts           add the new ads to public/ads/_data/video-cuts.json (T_CARD - 0.75)"""
import json, random, re, shutil, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
ADS = P.SENTENCES   # sentences-move.txt; video-cuts.json is in paths.DATA
MAP_F = M / "music-map-51-100.json"
SEED, MAX_WPS = 20261101, 3.1
KINDS = ['slam', 'expand', 'slide', 'rise', 'slam', 'rise', 'expand', 'rise', 'expand', 'rise', 'expand', 'rise']
COLS = ['TERRA', 'OLIVE', 'PLUM', 'CREAM']                       # never ink: ink belongs to the selected word
FG = {'TERRA': 'INK', 'CREAM': 'INK', 'OLIVE': 'CREAM', 'PLUM': 'CREAM', 'INK': 'CREAM'}

# text: the user's wording (quotes stay on the image, the video drops them). p: fine phrases, one per beat.
# end: the last phrase is the selected word and the last STACK line. mid: sel = the selected word, the last STACK line; bottom = the lines after it.
SPECS = {
    51: dict(text='ומה אם התחושה שאתם תקועים היא בדיוק הסימן שהגיע הזמן לזוז?', v='end',
             p='ומה אם|התחושה|שאתם תקועים|היא בדיוק|הסימן|שהגיע|הזמן|לזוז?',
             top=['ומה אם התחושה', 'שאתם תקועים'], stack=['היא בדיוק', 'הסימן שהגיע', 'הזמן', 'לזוז?']),
    52: dict(text='ומה אם החיים לא אמורים להרגיש כל כך הרבה זמן אותו דבר?', v='end',
             p='ומה אם|החיים|לא אמורים|להרגיש|כל כך|הרבה זמן|אותו|דבר?',
             top=['ומה אם החיים', 'לא אמורים להרגיש'], stack=['כל כך', 'הרבה זמן', 'אותו', 'דבר?']),
    53: dict(text='ומה אם כבר התרגלתם לתקיעות עד שכמעט הפסקתם לשים לב אליה?', v='end',
             p='ומה אם|כבר|התרגלתם|לתקיעות|עד שכמעט|הפסקתם|לשים לב|אליה?',
             top=['ומה אם כבר', 'התרגלתם לתקיעות'], stack=['עד שכמעט', 'הפסקתם', 'לשים לב', 'אליה?']),
    54: dict(text='ומה אם משהו בחיים שלכם פשוט מחכה שתזיזו אותו?', v='end',
             p='ומה אם|משהו|בחיים שלכם|פשוט|מחכה|שתזיזו|אותו?',
             top=['ומה אם משהו', 'בחיים שלכם'], stack=['פשוט מחכה', 'שתזיזו', 'אותו?']),
    55: dict(text='ומה אם אתם לא באמת רוצים שינוי גדול אלא רק להרגיש שמשהו שוב קורה?', v='end',
             p='ומה אם|אתם לא|באמת רוצים|שינוי גדול|אלא רק|להרגיש|שמשהו|שוב|קורה?',
             top=['ומה אם אתם לא באמת', 'רוצים שינוי גדול'], stack=['אלא רק להרגיש', 'שמשהו שוב', 'קורה?']),
    56: dict(text='ומה אם התקיעות הזאת לא תיעלם מעצמה?', v='end',
             p='ומה אם|התקיעות|הזאת|לא|תיעלם|מעצמה?',
             top=['ומה אם', 'התקיעות הזאת'], stack=['לא תיעלם', 'מעצמה?']),
    57: dict(text='ומה אם נמאס לכם להרגיש שכל שבוע נראה כמעט כמו הקודם?', v='end',
             p='ומה אם|נמאס לכם|להרגיש|שכל שבוע|נראה|כמעט|כמו|הקודם?',
             top=['ומה אם נמאס לכם', 'להרגיש שכל שבוע'], stack=['נראה כמעט', 'כמו', 'הקודם?']),
    58: dict(text='ומה אם אתם יודעים שמשהו צריך להשתנות אבל לא יודעים עדיין מה?', v='mid', sel='להשתנות',
             p='ומה אם|אתם יודעים|שמשהו|צריך|להשתנות|אבל לא|יודעים|עדיין מה?',
             top=['ומה אם אתם יודעים'], stack=['שמשהו צריך', 'להשתנות'], bottom=['אבל לא יודעים', 'עדיין מה?']),
    59: dict(text='ומה אם כדי לצאת מהתקיעות לא צריך לדעת לאן הולכים?', v='end',
             p='ומה אם|כדי לצאת|מהתקיעות|לא צריך|לדעת|לאן|הולכים?',
             top=['ומה אם כדי לצאת', 'מהתקיעות'], stack=['לא צריך לדעת', 'לאן', 'הולכים?']),
    60: dict(text='ומה אם אתם פשוט צריכים לעשות משהו אחר ממה שאתם עושים תמיד?', v='mid', sel='אחר',
             p='ומה אם|אתם פשוט|צריכים|לעשות|משהו|אחר|ממה שאתם|עושים|תמיד?',
             top=['ומה אם אתם פשוט', 'צריכים לעשות'], stack=['משהו', 'אחר'], bottom=['ממה שאתם', 'עושים תמיד?']),
    61: dict(text='ומה אם החיים שלכם קצת נעצרו בלי שבכלל החלטתם לעצור?', v='end',
             p='ומה אם|החיים שלכם|קצת|נעצרו|בלי|שבכלל|החלטתם|לעצור?',
             top=['ומה אם החיים', 'שלכם קצת נעצרו'], stack=['בלי שבכלל', 'החלטתם', 'לעצור?']),
    62: dict(text='ומה אם כבר הרבה זמן אתם מחכים שמשהו יקרה במקום לגרום למשהו לקרות?', v='end',
             p='ומה אם|כבר הרבה זמן|אתם מחכים|שמשהו|יקרה|במקום|לגרום|למשהו|לקרות?',
             top=['ומה אם כבר הרבה זמן', 'אתם מחכים', 'שמשהו יקרה'], stack=['במקום לגרום', 'למשהו', 'לקרות?']),
    63: dict(text='ומה אם התחושה הזאת של "ככה זה עכשיו" לא חייבת להישאר?', v='end',
             p='ומה אם|התחושה הזאת|של|ככה זה|עכשיו|לא חייבת|להישאר?',
             top=['ומה אם התחושה הזאת', 'של ככה זה עכשיו'], stack=['לא חייבת', 'להישאר?']),
    64: dict(text='ומה אם אתם לא עייפים מהחיים אלא מהחזרתיות שלהם?', v='end',
             p='ומה אם|אתם לא|עייפים|מהחיים|אלא|מהחזרתיות|שלהם?',
             top=['ומה אם אתם לא', 'עייפים מהחיים'], stack=['אלא', 'מהחזרתיות', 'שלהם?']),
    65: dict(text='ומה אם אתם לא צריכים עוד ערב רגיל בתוך תקופה שגם ככה מרגישה תקועה?', v='end',
             p='ומה אם|אתם לא|צריכים|עוד ערב|רגיל|בתוך תקופה|שגם ככה|מרגישה|תקועה?',
             top=['ומה אם אתם לא צריכים', 'עוד ערב רגיל'], stack=['בתוך תקופה', 'שגם ככה', 'מרגישה', 'תקועה?']),
    66: dict(text='ומה אם אתם מרגישים שהחיים ממשיכים אבל אתם קצת נשארתם במקום?', v='end',
             p='ומה אם|אתם מרגישים|שהחיים|ממשיכים|אבל אתם|קצת|נשארתם|במקום?',
             top=['ומה אם אתם מרגישים', 'שהחיים ממשיכים'], stack=['אבל אתם קצת', 'נשארתם', 'במקום?']),
    67: dict(text='ומה אם משהו בתוככם כבר הרבה זמן מבקש לצאת מהשגרה?', v='end',
             p='ומה אם|משהו|בתוככם|כבר|הרבה זמן|מבקש|לצאת|מהשגרה?',
             top=['ומה אם משהו בתוככם', 'כבר הרבה זמן'], stack=['מבקש לצאת', 'מהשגרה?']),
    68: dict(text='ומה אם התקיעות הזאת היא לא סוף הדרך אלא פשוט מקום שצריך לצאת ממנו?', v='end',
             p='ומה אם|התקיעות הזאת|היא לא|סוף הדרך|אלא פשוט|מקום|שצריך|לצאת|ממנו?',
             top=['ומה אם התקיעות הזאת', 'היא לא סוף הדרך'], stack=['אלא פשוט', 'מקום שצריך', 'לצאת', 'ממנו?']),
    69: dict(text='ומה אם הגיע הזמן להפסיק לחכות שמשהו מבחוץ ישתנה?', v='end',
             p='ומה אם|הגיע הזמן|להפסיק|לחכות|שמשהו|מבחוץ|ישתנה?',
             top=['ומה אם הגיע הזמן', 'להפסיק לחכות'], stack=['שמשהו', 'מבחוץ', 'ישתנה?']),
    70: dict(text='ומה אם אתם צריכים להזכיר לעצמכם איך זה מרגיש כשמשהו חדש נכנס לחיים?', v='end',
             p='ומה אם|אתם צריכים|להזכיר|לעצמכם|איך זה|מרגיש|כשמשהו|חדש|נכנס|לחיים?',
             top=['ומה אם אתם צריכים', 'להזכיר לעצמכם'], stack=['איך זה מרגיש', 'כשמשהו חדש', 'נכנס', 'לחיים?']),
    71: dict(text='ומה אם אתם מסתובבים כבר הרבה זמן עם התחושה שחסר משהו?', v='end',
             p='ומה אם|אתם מסתובבים|כבר|הרבה זמן|עם התחושה|שחסר|משהו?',
             top=['ומה אם אתם מסתובבים', 'כבר הרבה זמן'], stack=['עם התחושה', 'שחסר', 'משהו?']),
    72: dict(text='ומה אם נמאס לכם להגיד לעצמכם "אולי בהמשך"?', v='end',
             p='ומה אם|נמאס לכם|להגיד|לעצמכם|אולי|בהמשך?',
             top=['ומה אם נמאס לכם'], stack=['להגיד לעצמכם', 'אולי', 'בהמשך?']),
    73: dict(text='ומה אם אתם לא יודעים מה אתם רוצים אבל כן יודעים שאתם לא רוצים להישאר בדיוק כאן?', v='end',
             p='ומה אם|אתם לא|יודעים|מה אתם|רוצים|אבל כן|יודעים|שאתם לא|רוצים|להישאר|בדיוק|כאן?',
             top=['ומה אם אתם לא יודעים', 'מה אתם רוצים', 'אבל כן יודעים'], stack=['שאתם לא רוצים', 'להישאר', 'בדיוק', 'כאן?']),
    74: dict(text='ומה אם אתם מרגישים שהחיים נכנסו למצב המתנה?', v='end',
             p='ומה אם|אתם|מרגישים|שהחיים|נכנסו|למצב|המתנה?',
             top=['ומה אם אתם', 'מרגישים שהחיים'], stack=['נכנסו', 'למצב', 'המתנה?']),
    75: dict(text='ומה אם התקופה הזאת צריכה הפרעה קטנה לשגרה?', v='end',
             p='ומה אם|התקופה|הזאת|צריכה|הפרעה|קטנה|לשגרה?',
             top=['ומה אם', 'התקופה הזאת'], stack=['צריכה', 'הפרעה קטנה', 'לשגרה?']),
    76: dict(text='ומה אם כבר הרבה זמן לא קרה משהו שבאמת הוציא אתכם מהמקום?', v='end',
             p='ומה אם|כבר הרבה זמן|לא קרה|משהו|שבאמת|הוציא|אתכם|מהמקום?',
             top=['ומה אם כבר הרבה זמן', 'לא קרה משהו'], stack=['שבאמת הוציא', 'אתכם', 'מהמקום?']),
    77: dict(text='ומה אם אתם מחכים לשינוי שכבר מזמן מחכה לכם?', v='end',
             p='ומה אם|אתם מחכים|לשינוי|שכבר|מזמן|מחכה|לכם?',
             top=['ומה אם אתם', 'מחכים לשינוי'], stack=['שכבר מזמן', 'מחכה', 'לכם?']),
    78: dict(text='ומה אם התחושה שאתם עומדים במקום תשתנה ברגע שתתחילו לזוז?', v='end',
             p='ומה אם|התחושה|שאתם עומדים|במקום|תשתנה|ברגע|שתתחילו|לזוז?',
             top=['ומה אם התחושה', 'שאתם עומדים במקום'], stack=['תשתנה ברגע', 'שתתחילו', 'לזוז?']),
    79: dict(text='ומה אם אתם לא צריכים לפתור את החיים אלא רק להתחיל להזיז אותם?', v='end',
             p='ומה אם|אתם לא צריכים|לפתור|את החיים|אלא רק|להתחיל|להזיז|אותם?',
             top=['ומה אם אתם לא צריכים', 'לפתור את החיים'], stack=['אלא רק', 'להתחיל', 'להזיז', 'אותם?']),
    80: dict(text='ומה אם משהו בכם כבר מוכן לשינוי עוד לפני שהראש מסכים?', v='mid', sel='לשינוי',
             p='ומה אם|משהו בכם|כבר|מוכן|לשינוי|עוד לפני|שהראש|מסכים?',
             top=['ומה אם משהו בכם'], stack=['כבר מוכן', 'לשינוי'], bottom=['עוד לפני', 'שהראש מסכים?']),
    81: dict(text='ומה אם אתם מרגישים תקועים כי כבר יותר מדי זמן הכל צפוי?', v='end',
             p='ומה אם|אתם מרגישים|תקועים|כי כבר|יותר מדי|זמן|הכל|צפוי?',
             top=['ומה אם אתם', 'מרגישים תקועים'], stack=['כי כבר יותר', 'מדי זמן', 'הכל', 'צפוי?']),
    82: dict(text='ומה אם השגרה הפכה לנוחה מדי כדי לצאת ממנה ולא טובה מספיק כדי להישאר בה?', v='end',
             p='ומה אם|השגרה|הפכה|לנוחה מדי|כדי לצאת|ממנה|ולא טובה|מספיק|כדי להישאר|בה?',
             top=['ומה אם השגרה הפכה', 'לנוחה מדי', 'כדי לצאת ממנה'], stack=['ולא טובה מספיק', 'כדי להישאר', 'בה?']),
    83: dict(text='ומה אם הגיע הזמן לעשות משהו שלא מתאים בדיוק לחיים התקועים שבניתם לעצמכם?', v='end',
             p='ומה אם|הגיע הזמן|לעשות משהו|שלא מתאים|בדיוק|לחיים|התקועים|שבניתם|לעצמכם?',
             top=['ומה אם הגיע הזמן', 'לעשות משהו שלא', 'מתאים בדיוק'], stack=['לחיים התקועים', 'שבניתם', 'לעצמכם?']),
    84: dict(text='ומה אם אתם לא מחפשים מהפכה אלא פשוט סימן שהחיים שוב זזים?', v='end',
             p='ומה אם|אתם לא|מחפשים|מהפכה|אלא פשוט|סימן|שהחיים|שוב|זזים?',
             top=['ומה אם אתם לא', 'מחפשים מהפכה'], stack=['אלא פשוט סימן', 'שהחיים שוב', 'זזים?']),
    85: dict(text='ומה אם נמאס לכם לחכות לסיבה טובה כדי לעשות משהו אחר?', v='end',
             p='ומה אם|נמאס לכם|לחכות|לסיבה טובה|כדי|לעשות|משהו|אחר?',
             top=['ומה אם נמאס לכם', 'לחכות לסיבה טובה'], stack=['כדי לעשות', 'משהו', 'אחר?']),
    86: dict(text='ומה אם התקיעות שאתם מרגישים היא פשוט עודף של אותו דבר?', v='mid', sel='עודף',
             p='ומה אם|התקיעות|שאתם מרגישים|היא פשוט|עודף|של אותו|דבר?',
             top=['ומה אם התקיעות', 'שאתם מרגישים'], stack=['היא פשוט', 'עודף'], bottom=['של אותו דבר?']),
    87: dict(text='ומה אם אתם צריכים ערב אחד שיזכיר לכם שלא הכל חייב להישאר אותו דבר?', v='end',
             p='ומה אם|אתם צריכים|ערב אחד|שיזכיר לכם|שלא הכל|חייב|להישאר|אותו|דבר?',
             top=['ומה אם אתם צריכים', 'ערב אחד שיזכיר לכם'], stack=['שלא הכל חייב', 'להישאר', 'אותו', 'דבר?']),
    88: dict(text='ומה אם החיים שלכם לא צריכים תשובה אלא תנועה?', v='end',
             p='ומה אם|החיים שלכם|לא|צריכים|תשובה|אלא|תנועה?',
             top=['ומה אם החיים שלכם', 'לא צריכים תשובה'], stack=['אלא', 'תנועה?']),
    89: dict(text='ומה אם כבר הרבה זמן אתם מרגישים שאתם על Pause?', v='end',
             p='ומה אם|כבר|הרבה זמן|אתם מרגישים|שאתם|על|Pause?',
             top=['ומה אם כבר הרבה זמן'], stack=['אתם מרגישים', 'שאתם על', 'Pause?']),
    90: dict(text='ומה אם הגיע הזמן ללחוץ Play?', v='end',
             p='ומה אם|הגיע|הזמן|ללחוץ|Play?',
             top=['ומה אם'], stack=['הגיע הזמן', 'ללחוץ', 'Play?']),
    91: dict(text='ומה אם אתם יודעים שאתם רוצים לצאת מהמקום אבל עוד לא מצאתם איך?', v='end',
             p='ומה אם|אתם יודעים|שאתם רוצים|לצאת|מהמקום|אבל עוד לא|מצאתם|איך?',
             top=['ומה אם אתם יודעים', 'שאתם רוצים לצאת', 'מהמקום'], stack=['אבל עוד לא', 'מצאתם', 'איך?']),
    92: dict(text='ומה אם שינוי מתחיל דווקא כשמפסיקים לחכות להרגיש מוכנים?', v='end',
             p='ומה אם|שינוי|מתחיל|דווקא|כשמפסיקים|לחכות|להרגיש|מוכנים?',
             top=['ומה אם שינוי', 'מתחיל דווקא'], stack=['כשמפסיקים', 'לחכות להרגיש', 'מוכנים?']),
    93: dict(text='ומה אם אתם תקועים לא כי אין לאן ללכת אלא כי עוד לא עשיתם את הצעד הראשון?', v='end',
             p='ומה אם|אתם תקועים|לא כי|אין לאן ללכת|אלא כי|עוד לא|עשיתם|את הצעד|הראשון?',
             top=['ומה אם אתם תקועים', 'לא כי אין לאן ללכת'], stack=['אלא כי עוד לא', 'עשיתם את', 'הצעד', 'הראשון?']),
    94: dict(text='ומה אם הדבר שאתם הכי צריכים עכשיו הוא משהו שינער קצת את השגרה?', v='end',
             p='ומה אם|הדבר שאתם|הכי צריכים|עכשיו|הוא משהו|שינער|קצת את|השגרה?',
             top=['ומה אם הדבר שאתם', 'הכי צריכים עכשיו'], stack=['הוא משהו שינער', 'קצת את', 'השגרה?']),
    95: dict(text='ומה אם הגיע הזמן להכניס משהו חי לתקופה שמרגישה קצת עומדת?', v='mid', sel='חי',
             p='ומה אם|הגיע הזמן|להכניס|משהו|חי|לתקופה|שמרגישה|קצת עומדת?',
             top=['ומה אם הגיע הזמן'], stack=['להכניס משהו', 'חי'], bottom=['לתקופה שמרגישה', 'קצת עומדת?']),
    96: dict(text='ומה אם אתם לא צריכים לדעת מה אתם מחפשים כדי לדעת שנמאס לכם לעמוד במקום?', v='end',
             p='ומה אם|אתם לא צריכים|לדעת|מה אתם|מחפשים|כדי לדעת|שנמאס לכם|לעמוד|במקום?',
             top=['ומה אם אתם לא צריכים', 'לדעת מה אתם מחפשים'], stack=['כדי לדעת', 'שנמאס לכם', 'לעמוד', 'במקום?']),
    97: dict(text='ומה אם משהו חדש מתחיל בדיוק ברגע שבו נמאס לכם מהישן?', v='end',
             p='ומה אם|משהו חדש|מתחיל|בדיוק|ברגע שבו|נמאס|לכם|מהישן?',
             top=['ומה אם משהו חדש', 'מתחיל בדיוק'], stack=['ברגע שבו', 'נמאס לכם', 'מהישן?']),
    98: dict(text='ומה אם הערב הזה יהיה הדבר הראשון שעשיתם בשביל לצאת מהתקיעות?', v='end',
             p='ומה אם|הערב הזה|יהיה|הדבר הראשון|שעשיתם|בשביל|לצאת|מהתקיעות?',
             top=['ומה אם הערב הזה', 'יהיה הדבר הראשון'], stack=['שעשיתם בשביל', 'לצאת', 'מהתקיעות?']),
    99: dict(text='ומה אם תנועה חדשה בחיים מתחילה פשוט בהחלטה לא להישאר בבית?', v='end',
             p='ומה אם|תנועה חדשה|בחיים|מתחילה פשוט|בהחלטה|לא להישאר|בבית?',
             top=['ומה אם תנועה חדשה', 'בחיים מתחילה פשוט'], stack=['בהחלטה', 'לא להישאר', 'בבית?']),
    100: dict(text='ומה אם בעוד חודש תסתכלו אחורה ותגלו שזה היה הרגע שבו משהו התחיל לזוז?', v='end',
              p='ומה אם|בעוד חודש|תסתכלו אחורה|ותגלו|שזה היה|הרגע|שבו משהו|התחיל|לזוז?',
              top=['ומה אם בעוד חודש', 'תסתכלו אחורה ותגלו'], stack=['שזה היה הרגע', 'שבו משהו', 'התחיל', 'לזוז?']),
}
assert sorted(SPECS) == list(range(51, 101))

plain = lambda s: s.replace('"', '').replace('״', '').replace(',', '')     # videos only: no commas and no quotation marks before the invitation


def check(n, sp):
    """every word of the sentence, in order, in the phrases, in the lockup lines and nothing else"""
    w = plain(sp['text']).split()
    assert sp['p'].replace('|', ' ').split() == w, (n, 'phrases')
    assert ' '.join(sp['top'] + sp['stack'] + sp.get('bottom', [])).split() == w, (n, 'lockup')
    sel = sp.get('sel') or sp['p'].split('|')[-1]
    assert sel == sp['stack'][-1] and sel in sp['p'].split('|') and ' ' not in sel, (n, 'selected word')


def base_of(b):
    """song, section and invitation beats of an existing ad, exactly as they are"""
    d = M / f"ad-{b:02d}"
    sc, h = (d / "scene.js").read_text(encoding="utf-8"), (d / "index.html").read_text(encoding="utf-8")
    bpm = float(re.search(r"bpm:\s*([\d.]+)", h).group(1))
    g = lambda name: int(re.search(rf"{name} = G\((\d+)\)", sc).group(1))
    return dict(p=60 / bpm, card=g("T_CARD"), b4=g("B4"), st=g("T_ST"), tap=g("T_TAP"),
                bpm_line=re.search(r"^  bpm: .*$", h, re.M).group(0), music_line=re.search(r"^  music: .*$", h, re.M).group(0),
                start=float(re.search(r"start:\s*([\d.]+)", h).group(1)))


def words_end(v, base):
    """G(join): the first beat after the words. The question holds ~2 s before the invitation, as in ads 27..50."""
    p, card = base['p'], base['card']
    return card - max(3, round(2.2 / p)) if v == 'end' else card - 1 - max(3, round(2.0 / p))


def wps(n, b):
    base = base_of(b); sp = SPECS[n]
    return len(plain(sp['text']).split()) / ((words_end(sp['v'], base) + 1) * base['p'])


def draw():
    assert not MAP_F.exists(), "the draw exists already"
    r = random.Random(SEED)
    ads, bases = sorted(SPECS), list(range(1, 51)); r.shuffle(bases)
    pick = dict(zip(ads, bases))
    for _ in range(4000):                                    # a long sentence on a short section: swap with a random partner
        bad = [n for n in ads if wps(n, pick[n]) > MAX_WPS]
        if not bad: break
        a = r.choice(bad); c = r.choice(ads)
        if wps(a, pick[c]) <= wps(a, pick[a]): pick[a], pick[c] = pick[c], pick[a]
    assert sorted(pick.values()) == list(range(1, 51))
    MAP_F.write_text(json.dumps({f"ad-{n}": f"ad-{pick[n]:02d}" for n in ads}, indent=1) + "\n", encoding="utf-8")
    print("worst words per second", round(max(wps(n, pick[n]) for n in ads), 2))


def plan(sp, join):
    """the phrases on the beats: list of (words, beats), the selected word holds 2"""
    ph = sp['p'].split('|')
    sel = sp.get('sel') or ph[-1]; s = ph.index(sel)
    before, after = ph[:s], ph[s + 1:]
    room = join - 2
    assert room >= 3, ('no room', join)
    def size(x): return len(x.replace(' ', '')) + 3 * x.count(' ')
    while len(before) + len(after) > room:                   # too few beats: merge the shortest neighbours (never across the highlight)
        best = None
        for part, tag in ((before, 'b'), (after, 'a')):
            for i in range(len(part) - 1):
                c = size(part[i]) + size(part[i + 1]) + (6 if tag == 'b' and i == 0 else 0)
                if best is None or c < best[0]: best = (c, part, i)
        _, part, i = best
        part[i:i + 2] = [part[i] + ' ' + part[i + 1]]
    shots = before + [sel] + after
    beats = [1] * len(shots); beats[len(before)] = 2
    extra = room - (len(before) + len(after))
    idx = [k for k in range(len(shots)) if k != len(before)]
    while extra > 0:                                          # spare beats go to the phrases that need the time most
        k = max(idx, key=lambda j: (size(shots[j]) * (0.6 if j == 0 else 1)) / beats[j])
        beats[k] += 1; extra -= 1
    assert sum(beats) == join
    return shots, beats, len(before)


def js_list(xs):
    return "[" + ", ".join("'" + x.replace("'", "\\'") + "'" for x in xs) + "]"


def build(n, MAP):
    sp = SPECS[n]; check(n, sp)
    v = sp['v']; b = int(MAP[f"ad-{n}"].split("-")[1]); base = base_of(b); p = base['p']
    join = words_end(v, base)
    shots, beats, s = plan(sp, join)
    src = (M / ("ad-12" if v == 'end' else "ad-13") / "scene.js").read_text(encoding="utf-8")
    rows, slams, t, ns = [], [], 0, 0
    for i, (w, d) in enumerate(zip(shots, beats)):
        words = js_list(w.split())
        end = 'T_JOIN' if i == len(shots) - 1 else f'G({t + d})'
        if i == s:
            rows.append(f"      {{ a: G({t}), b: {end}, bg: C.INK,  fg: C.CREAM, words: {words}, kind: 'select' }},")
            sel_a = t
        else:
            col = COLS[ns % len(COLS)]
            kind = 'tight' if (v == 'mid' and i == len(shots) - 1) else KINDS[ns % len(KINDS)]
            if kind in ('slam', 'tight'): slams.append(t)
            rows.append(f"      {{ a: G({t}), b: {end}, bg: C.{col}, fg: C.{FG[col]}, words: {words}, kind: '{kind}' }},")
            ns += 1
        t += d
    assert t == join
    i0 = src.index("    const SHOTS = [\n"); i1 = src.index("    ];\n", i0) + len("    ];\n")
    src = src[:i0] + "    const SHOTS = [\n" + "\n".join(rows) + "\n    ];\n" + src[i1:]
    sel = shots[s]
    tend = "T_JOIN + 0.33" if v == 'end' else f"G({join + 1})"
    snap = 0.24 + 0.15 * p
    hits = ", ".join(f"[G({a}), {14 if j == 0 else 16 if j == 1 else 9}]" for j, a in enumerate(slams))
    sfxs = " ".join(f'sfx(G({a}), "hit", {1 if j == 0 else 0.85 if j == 1 else 0.7});' for j, a in enumerate(slams))
    extra_h = "ss * 0.3" if v == 'end' else "ss * 0.6 + botH"
    subs = [
        (r"^// scene\.js: .*$", f'// scene.js: ad {n}, "{plain(sp["text"])}" + the invitation (built by tools/build_ads3.py).'),
        (r"\((Pixabay|Mixkit) [^)]*\)", f'(the song and section of ad-{b:02d}, from {base["start"]:.3f} s)'),
        (r"^    const T_JOIN = .*$", f"    const T_JOIN = G({join}), T_END = {tend}; // the question comes together after the words"),
        (r"^    const T_CARD = .*$", f"    const T_CARD = G({base['card']}), T_COVER = T_CARD + 0.35;   // the invitation slides up on the rhythm change (as in ad-{b:02d})"),
        (r"^    const B4 = .*$", f"    const B4 = G({base['b4']});                          // the invitation text, then the button"),
        (r"^    const T_ST = .*$", f"    const T_ST = G({base['st']}), T_TAP = G({base['tap']});         // the stamp lands on a beat, the button is tapped on a beat"),
        (r"^    const SEL = SHOTS\[.*$", f"    const SEL = SHOTS[{s}], T_BOX = SEL.a + 0.06, T_SNAP = SEL.a + {snap:.2f}, T_LOCK = G({sel_a + 1});"),
        (r"^    const T_GRAB = .*$", f"    const T_GRAB = SEL.a + {snap - 0.07:.2f}, T_DROP = T_LOCK - 0.03;"),
        (r"^    const STACK = .*$", f"    const STACK = {js_list(sp['stack'])}, LAST = STACK.length - 1;"),
        (r"^    const ss = ", "    let ss = "),
        (r"^    const pitch = .*\n", ""),
        (r"^    const yHead = .*$", "    const yHead = -H / 2 + BORDER + 150;                   // the hand lettering line box stays inside the safe area, also at the end of the push"),
        (r"^    const HITS = \[\[.*$", f"    const HITS = [{hits}, [T_LOCK, 5], [T_END, 7]];"),
        (r'^    sfx\(G\(0\), "hit".*$', f'    {sfxs} sfx(T_LOCK, "tick", 1);'),
        (r'// the selection frame around "[^"]*"', f'// the selection frame around "{sel}"'),
        # the invitation title of this set, on two lines
        (r"^    const yTitle = .*$", "    const yTitle = -293, yDiv = -48, yWho = 52, yBrand = 336;   // centred between the header and the bottom of the letter"),
        (r"const T1 = 'מפגש מסוג אחר', LEAD = 'פשוט לזוז יחד', ", "const T1 = ['להכניס תנועה', 'חדשה לחיים'], "),
        (r"^    const tsz = .*$", "    const tsz = Math.min(140, ...T1.map(s => fit(s, oTitle, 820)));"),
        (r"^    const title1 = .*$", "    const title = T1.map((s, k) => txt(cam2, s, Object.assign({ size: tsz, y: yTitle + k * tsz * 1.14, color: C.INK }, oTitle)));"),
        (r"^      show\(t, title1, T_CARD \+ 0\.52, B4\);$", "      title.forEach((g, k) => show(t, g, T_CARD + 0.52 + k * 0.1, B4));"),
    ]
    if v == 'end':
        subs += [
            (r"^    const TOP = .*$", f"    const TOP = {js_list(sp['top'])};   // short lines: big enough to read on a phone"),
            (r"^    const ts = (.*)$", lambda m: f"    const ts = {m.group(1)}\n    ss = Math.min(ss, (LIM_H - ts * (1 + 1.25 * (TOP.length - 1))) / (0.36 + 1.02 * LAST + 1 + 0.3));   // long questions: everything stays in the frame\n    const pitch = ss * 1.02;"),
            (r"^    const T_P = k => .*$", "    const T_P = k => T_JOIN + 0.34 + k * 0.07;              // the lines above drop in once the selected word has shrunk"),
            (r"pulse\(t, G\(\d+\)\)", f"pulse(t, G({join + 2}))"),
            (r"tf\(uline, \{ sx: S\(t - G\(\d+\), 16, 1\), o: fin && t >= G\(\d+\) \? 1 : 0 \}\);",
             f"tf(uline, {{ sx: S(t - G({join + 1}), 16, 1), o: fin && t >= G({join + 1}) ? 1 : 0 }});"),
            (r'// "[^"]*" keeps its place on the cut', f'// "{sel}" keeps its place on the cut'),
        ]
    else:
        subs += [
            (r"^    const TOP = .*$", f"    const TOP = {js_list(sp['top'])}, BOTTOM = {js_list(sp['bottom'])};   // short lines: big enough to read on a phone"),
            (r"^    const ts = (.*)$", lambda m: f"    const ts = {m.group(1)}\n    ss = Math.min(ss, (LIM_H - ts * (1 + 1.25 * (TOP.length - 1)) - ts * (1 + 1.25 * (BOTTOM.length - 1))) / (0.36 + 1.02 * LAST + 1 + 0.6));   // long questions: everything stays in the frame\n    const pitch = ss * 1.02;"),
            (r"pulse\(t, G\(\d+\)\)", f"pulse(t, G({join + 3}))"),
            (r"tf\(uline, \{ sx: S\(t - G\(\d+\), 16, 1\), o: fin && t >= G\(\d+\) \? 1 : 0 \}\);",
             f"tf(uline, {{ sx: S(t - G({join + 2}), 16, 1), o: fin && t >= G({join + 2}) ? 1 : 0 }});"),
        ]
    for pat, rep in subs:
        if isinstance(rep, str): rep = rep.replace("\\", "\\\\")
        src, k = re.subn(pat, rep, src, count=1, flags=re.M)
        assert k == 1, (n, pat)
    src = src.replace("    let ss = ", "    const LIM_H = 1160;\n    let ss = ", 1)
    d = M / f"ad-{n}"; d.mkdir(exist_ok=True)
    (d / "scene.js").write_text(src, encoding="utf-8")
    tpl = M / ("ad-12" if v == 'end' else "ad-13")
    for f in ("core.js", "render.py", "audio.py"): shutil.copy(tpl / f, d / f)
    if not (d / "fonts").exists(): shutil.copytree(tpl / "fonts", d / "fonts")
    h = (tpl / "index.html").read_text(encoding="utf-8")
    h, k1 = re.subn(r"^  bpm: .*$", lambda _: base['bpm_line'], h, flags=re.M)
    h, k2 = re.subn(r"^  music: .*$", lambda _: base['music_line'], h, flags=re.M)
    assert k1 == 1 and k2 == 1
    (d / "index.html").write_text(h, encoding="utf-8")
    shutil.copy(M / f"ad-{b:02d}" / "music.mp3", d / "music.mp3")
    print(f"ad-{n} [{v}] from ad-{b:02d} beat {p:.3f}: {len(shots)} shots {beats} words {join * p:.2f}s, card {(base['card'] + 1) * p:.2f}s, tap {(base['tap'] + 1) * p:.2f}s, {wps(n, b):.2f} w/s", flush=True)


def sentences():
    out = []
    for n in sorted(SPECS):
        sp = SPECS[n]; check(n, sp)
        w = sp['text'].rstrip('?').split()
        a = len(' '.join(sp['top']).split()); b = a + len(' '.join(sp['stack']).split())
        tail = b == len(w)
        line = ' '.join(w[:a]) + ' [' + ' '.join(w[a:b]) + ']' + ('' if tail else ' ' + ' '.join(w[b:])) + '?'
        assert line.replace('[', '').replace(']', '') == sp['text'], (n, line)
        out.append(line)
    (ADS / "sentences-move.txt").write_text("\n".join(out) + "\n", encoding="utf-8")
    print(len(out), "lines")


def cuts(MAP):
    f = P.DATA / "video-cuts.json"; c = json.loads(f.read_text(encoding="utf-8"))
    for n in sorted(SPECS):
        base = base_of(int(MAP[f"ad-{n}"].split("-")[1]))
        c[str(n)] = round((base['card'] + 1) * base['p'] - 0.75, 2)
    f.write_text(json.dumps(c, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(len(c), "cuts  (upload plan: python tools/publish.py data video-cuts.json)")


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "map": draw()
    elif cmd == "sentences": sentences()
    else:
        MAP = json.loads(MAP_F.read_text(encoding="utf-8"))
        if cmd == "scenes":
            for n in ([int(a) for a in sys.argv[2:]] or sorted(SPECS)): build(n, MAP)
        elif cmd == "cuts": cuts(MAP)
