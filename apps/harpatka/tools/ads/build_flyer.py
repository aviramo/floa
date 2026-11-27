# מייצר פלייר לרשתות (1080x1350, יחס 4:5) למפגש הבא -> ads/social/flyer-<תאריך>.png
# עיצוב מכתב ההזמנה של האתר: מעטפת דואר בפסים, "הזמנה" בכתב יד ובול הרקדנים. בלי מחיר ובלי כפתור/כתובת אתר (לבקשת המשתמש).
# תמונה מעודכנת = שם קובץ חדש ("file"), בגלל ה-cache של ה-Service Worker.
# הרצה: python tools/ads/build_flyer.py   (דורש Chrome). לעדכן את EVENT לפני כל מפגש חדש. הפלט ב-paths.SOCIAL, לא מתפרסם בחנות.
import os, sys, subprocess, pathlib, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout (tools/paths.py)
CHROME = next(p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"] if os.path.exists(p))
OUT = P.SOCIAL; OUT.mkdir(parents=True, exist_ok=True)
W, H = 1080, 1350
# טווח הגילאים: מהמקור היחיד shared/age.js (AGE_MIN, AGE_MAX)
import re
_AGE = P.AGE_JS.read_text(encoding="utf-8")
AGE_MIN, AGE_MAX = (int(re.search(k + r"\s*=\s*(\d+)", _AGE).group(1)) for k in ("AGE_MIN", "AGE_MAX"))
AGE_RANGE = f"{AGE_MIN}–{AGE_MAX}"

EVENT = {"file": "2026-10-25-v4", "day": "ראשון 25.10", "time": "20:00", "place": "הרצליה", "seats": "עד 30"}

STAMP = '<svg viewBox="0 0 48 52" fill="#C96F52"><g stroke="#C96F52" stroke-width="1.8" stroke-linecap="round" fill="none"><path d="M15 21Q8 17 6 9"/><path d="M15 21Q21 18 24 12"/><path d="M34 22Q40 17 42 11"/><path d="M34 22Q29 19 27 14"/></g><circle cx="15" cy="12" r="3.4"/><path d="M15 17C9 22 8 33 5 42L25 42C22 33 21 22 15 17Z"/><circle cx="34" cy="13" r="3.2" fill="#C98D86"/><path d="M34 18C28.5 23 28 33 26 42L42 42C40 33 39.5 23 34 18Z" fill="#9A9A75"/></svg>'

def flyer(e):
    cell = lambda label, value: f'<div class="cell"><p class="lbl">{label}</p><p class="val">{value}</p></div>'
    return f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Amatic+SC:wght@700&family=Assistant:wght@600;700&family=Rubik:wght@500;600&display=swap" rel="stylesheet">
<style>
*{{margin:0;box-sizing:border-box}}html,body{{width:{W}px;height:{H}px;overflow:hidden}}
body{{background:#F6EFE4;color:#3F382F;font-family:Assistant,sans-serif}}
.frame{{position:absolute;inset:34px;border-radius:40px;padding:26px;background:repeating-linear-gradient(-45deg,#C96F52 0 30px,#FFFDF9 30px 52px,#9A9A75 52px 82px,#FFFDF9 82px 104px);box-shadow:0 10px 28px rgba(63,56,47,.12)}}
.paper{{position:relative;height:100%;border-radius:22px;background:#FFFDF9;padding:46px 56px 46px;display:flex;flex-direction:column;align-items:center;text-align:center}}
.top{{width:100%;display:flex;justify-content:space-between;align-items:flex-start}}
.hand{{font-family:"Amatic SC",cursive;font-weight:700;line-height:1}}
.inv{{font-size:136px;color:#B85C40;margin-top:-6px}}
.stamp{{width:104px;height:122px;padding:10px;background:#F3E3D1;border:8px dotted #FFFDF9;outline:2px solid #E6D3BC;outline-offset:-2px;transform:rotate(4deg)}}
.stamp svg{{width:100%;height:100%}}
h1{{font-family:Rubik,sans-serif;font-weight:600;font-size:112px;line-height:1.05;letter-spacing:-.01em;margin-top:2px}}
.lead{{font-size:50px;font-weight:700;line-height:1.3;margin-top:30px;white-space:nowrap}}
.lead2{{font-size:37px;font-weight:600;line-height:1.4;color:rgba(63,56,47,.78);margin-top:10px;white-space:nowrap}}
.lead2 b{{font-weight:700;color:#3F382F}}
.note{{font-size:64px;line-height:1.05;color:#C96F52;margin-top:24px;transform:rotate(-1.5deg)}}
.dots{{width:96px;border-top:4px dotted rgba(154,154,117,.7);margin:26px 0 20px}}
.who{{font-size:40px;font-weight:700;line-height:1.35}}
.who bdi{{direction:ltr;unicode-bidi:isolate}}
.grid{{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:26px}}
.cell{{background:#F6EFE4;border-radius:26px;padding:12px 10px 16px}}
.lbl{{font-size:30px;font-weight:600;color:rgba(63,56,47,.62);line-height:1.2}}
.val{{font-family:Rubik,sans-serif;font-weight:600;font-size:60px;line-height:1.15;margin-top:2px}}
.by{{margin-top:auto;font-size:32px;font-weight:600;color:rgba(63,56,47,.7)}}
.by b{{font-family:Rubik,sans-serif;font-weight:600;color:#3F382F}}
</style></head><body>
<div class="frame"><div class="paper">
  <div class="top"><p class="hand inv">הזמנה</p><div class="stamp">{STAMP}</div></div>
  <h1>מפגש מסוג אחר</h1>
  <p class="lead">להכיר אנשים חדשים, בלי לחפש מה להגיד</p>
  <p class="lead2">תנועות פשוטות בקבוצה, בהנחיה ולצלילי מוזיקה מיוחדת<br><b>הגוף משתחרר, המבוכה נעלמת וההיכרות קורית מעצמה</b></p>
  <p class="hand note">לא ערב הכרויות,<br>אבל כן ערב שאפשר להכיר בו אנשים חדשים</p>
  <div class="dots"></div>
  <p class="who">נשים וגברים בגילאי <bdi>{AGE_RANGE}</bdi> בפרק פתוח בחיים</p>
  <div class="grid">{cell("יום", e["day"])}{cell("שעה", e["time"])}{cell("מקום", e["place"])}{cell("משתתפים", e["seats"])}</div>
  <p class="by">הדר ואופיר · <b>יוצאים להרפתקה</b></p>
</div></div></body></html>'''

def shot(html, w, h, name):
    tmp = pathlib.Path(tempfile.mkdtemp()); f = tmp / "p.html"; f.write_text(html, encoding="utf-8")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=6000",
                    f"--user-data-dir={tmp/'u'}", f"--screenshot={OUT/name}", f.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("ok", name)

if __name__ == "__main__":
    shot(flyer(EVENT), W, H, f"flyer-{EVENT['file']}.png")
