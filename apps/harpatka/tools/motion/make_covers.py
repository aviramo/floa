"""The first frame of each ad video: the striped invitation, "ומה אם" and a short teaser (2 to 3 words, never the answer),
and the name as a search field at the bottom (as on the ad images).
Renders motion/covers/ad-XX.png (1080x1920, the letter in the 4:5 safe area) from the cover template; publish_videos.py puts it on frame 0.
usage: python make_covers.py [numbers...]   (run with the motion-studio python)"""
import sys, urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
TEMPLATE = P.MOTION_TOOLS / "cover" / "cover2.html"   # the template sits beside this tool
OUT = M / "covers"
TEASER = {
    1: "במקום עוד דייט", 2: "הדרך הבאה להכיר", 3: "הכימיה ביניכם", 4: "במקום לשבת", 5: "אפשר לפגוש מישהו",
    6: "תכירו מישהו", 7: "החיבור הבא שלכם", 8: "במקום דייט של שאלות", 9: "היכרות טובה יותר", 10: "קודם תרגישו",
    11: "תכירו מישהו שמושך", 12: "מפגש עם מישהו", 13: "מישהו חדש", 14: "תכירו מישהו דרך", 15: "היכרות עם מישהו",
    16: "תפגשו מישהו", 17: "הקרבה ביניכם", 18: "במקום לבדוק כימיה", 19: "ערב של מוזיקה", 20: "תצאו מהערב",
    21: "במקום סווייפ", 22: "מול מישהו חדש", 23: "החיבור עם מישהו", 24: "מישהו שמעניין אתכם", 25: "במקום לנסות להרשים",
    26: "אפשר להכיר מישהו", 27: "במקום נתונים בפרופיל", 28: "ערב אחד", 29: "במקום ערב סווייפים", 30: "במקום דייט ראשון",
    31: "הגוף ירגיש", 32: "במקום שאלות פתיחה", 33: "שלוש תמונות ושתי שורות", 34: "מישהו שמושך אתכם", 35: "תכירו קודם",
    36: "במקום לשבת ולבדוק", 37: "הקליק ביניכם", 38: "במקום לחפש אהבה", 39: "הדרך להכיר מישהו", 40: "במקום לחפש התאמה",
    41: "במקום עוד ראיון", 42: "מישהו שיכול להתאים", 43: "במקום מילים", 44: "מישהו שמוצא חן", 45: "בלי משחקים",
    46: "בשתי הדקות הראשונות", 47: "במקום דייט מתוכנן", 48: "ערב של תנועה", 49: "במקום עוד התכתבות", 50: "הדייט הבא שלכם",
}
TEASER.update({   # ads 51..100, the set about feeling stuck (tools/build_ads3.py)
    51: "התחושה שאתם תקועים", 52: "החיים לא אמורים", 53: "כבר התרגלתם", 54: "משהו בחיים שלכם", 55: "לא באמת רוצים",
    56: "התקיעות הזאת", 57: "נמאס לכם להרגיש", 58: "יודעים שמשהו", 59: "כדי לצאת מהתקיעות", 60: "פשוט צריכים",
    61: "החיים קצת נעצרו", 62: "אתם מחכים", 63: "התחושה הזאת", 64: "לא עייפים מהחיים", 65: "עוד ערב רגיל",
    66: "החיים ממשיכים", 67: "משהו בתוככם", 68: "לא סוף הדרך", 69: "הגיע הזמן להפסיק", 70: "להזכיר לעצמכם",
    71: "אתם מסתובבים", 72: "נמאס לכם להגיד", 73: "לא יודעים מה", 74: "מצב המתנה", 75: "התקופה הזאת",
    76: "כבר הרבה זמן", 77: "מחכים לשינוי", 78: "עומדים במקום", 79: "לפתור את החיים", 80: "משהו בכם",
    81: "מרגישים תקועים", 82: "השגרה הפכה", 83: "הגיע הזמן לעשות", 84: "לא מחפשים מהפכה", 85: "לחכות לסיבה טובה",
    86: "התקיעות שאתם מרגישים", 87: "ערב אחד שיזכיר", 88: "החיים שלכם", 89: "על Pause", 90: "ללחוץ Play",
    91: "רוצים לצאת", 92: "שינוי מתחיל", 93: "תקועים לא כי", 94: "הדבר שאתם הכי צריכים", 95: "משהו חי",
    96: "לא צריכים לדעת", 97: "משהו חדש מתחיל", 98: "הערב הזה", 99: "תנועה חדשה", 100: "בעוד חודש",
})
assert len(set(TEASER.values())) == len(TEASER), "every ad needs its own teaser"
todo = [int(a) for a in sys.argv[1:]] or sorted(TEASER)
OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--force-color-profile=srgb", "--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1080, "height": 1920})
    for n in todo:
        url = TEMPLATE.as_uri() + "?" + urllib.parse.urlencode({"hook": "ומה אם", "rest": TEASER[n]})
        pg.goto(url, wait_until="networkidle"); pg.evaluate("document.fonts.ready"); pg.wait_for_timeout(150)
        assert pg.evaluate("document.fonts.check('600 100px Fredoka', 'אבג')"), "Fredoka did not load"
        pg.evaluate("document.fonts.load('700 60px Rubik', 'יוצאים להרפתקה')"); pg.wait_for_timeout(50)
        assert pg.evaluate("document.fonts.check('700 60px Rubik', 'יוצאים')"), "Rubik did not load (the search field)"
        pg.locator("#card").screenshot(path=str(OUT / f"ad-{n:02d}.png"))
        print(n, TEASER[n], "font", pg.evaluate("document.body.dataset.fs"), flush=True)
    b.close()
