# מודעות מתמונות (G:\My Drive\יוצאים להרפתקה\חדש\מודעות): מוחק את הכפתור והקישור שבתחתית ומשתיל שורת חיפוש "יוצאים להרפתקה"
# פלט: 1080x1920 (9:16), כל התוכן באזור בטוח 4:5 (y 285..1635), בתיקייה "לרשתות" ליד המקורות. הרצה: python ads/tools/build_photo_ads.py
import os, glob, subprocess, tempfile, pathlib
from PIL import Image
SRC = pathlib.Path(r"G:\My Drive\יוצאים להרפתקה\חדש\מודעות"); OUT = SRC / "לרשתות"; OUT.mkdir(exist_ok=True)
CHROME = next(p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"] if os.path.exists(p))
W, H = 1080, 1920
# לכל תמונה (לפי מספר סידורי): (תחילת מחיקה, סוף מחיקה, גובה עליון של שורת החיפוש). ברירת מחדל לאחרות
CFG = {4: (1465, 1735, 1485), 6: (1505, 1765, 1505)}
DEF = (1460, 1700, 1472)
SEARCH = False   # שורת חיפוש בתחתית (כבויה לבקשת בעל האתר)
LINE1 = {1: (1291, 1343), 2: (1278, 1330), 3: (1275, 1326), 4: (1307, 1359), 5: (1278, 1331), 6: (1358, 1410)}  # השורה "ביודנסה היא חוויה של" שמוחלפת
def band(im, ya, yb, xl=100, xr=980):
    # מחיקת פס לפי אינטרפולציה אופקית של הרקע
    px = im.load()
    for y in range(ya, yb):
        a = px[40, y]; b = px[W - 40, y]
        for x in range(xl, xr):
            t = (x - 40) / (W - 80)
            px[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def clean(im, ya, yb, n=0):
    w, h = im.size
    s = max(W / w, H / h); im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    x0 = (im.width - W) // 2; y0 = (im.height - H) // 2
    im = im.crop((x0, y0, x0 + W, y0 + H)).convert("RGB")
    if n in LINE1:
        l0, l1 = LINE1[n]; band(im, l0 - 10, l1 + 14)
    px = im.load()
    # אזור הכפתור והקישור: ממלאים כל שורה באינטרפולציה בין שני צדי הרקע, ומשלבים עם דהייה בקצוות כדי שלא יישאר מלבן
    xl, xr, F = 80, 1000, 60; yb += F
    fill = im.copy(); fp = fill.load()
    for y in range(ya, yb):
        a = px[40, y]; b = px[W - 40, y]
        for x in range(xl, xr):
            t = (x - 40) / (W - 80)
            fp[x, y] = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    mask = Image.new("L", im.size, 0); mp = mask.load()
    for y in range(ya, yb):
        for x in range(xl, xr):
            mp[x, y] = round(255 * min(1, (x - xl) / F, (xr - 1 - x) / F, 1, (yb - 1 - y) / F))
    im = Image.composite(fill, im, mask)
    return im
PAGE = '''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Rubik:wght@600;700&display=swap" rel="stylesheet">
<style>*{margin:0;box-sizing:border-box}html,body{width:1080px;height:1920px;overflow:hidden}body{position:relative;background:url(%s) 0 0/1080px 1920px}
.l1{position:absolute;left:0;right:0;top:%dpx;height:%dpx;display:flex;align-items:center;justify-content:center;font-family:Rubik;font-weight:700;font-size:68px;color:#3B2216;line-height:1;white-space:nowrap}
.search{position:absolute;display:%s;position:absolute;top:%dpx;left:50%%;transform:translateX(-50%%);height:124px;align-items:center;gap:26px;padding:0 46px 0 18px;border-radius:999px;background:#FFFDF9;border:3px solid rgba(63,56,47,.14);box-shadow:0 10px 30px rgba(63,56,47,.16);white-space:nowrap}
.q{font-family:Rubik;font-size:60px;font-weight:600;color:#3F382F;line-height:1;display:flex;align-items:center}.q b{color:#C96F52;font-weight:700}
.caret{display:inline-block;width:5px;height:66px;border-radius:3px;background:#C96F52;margin-right:16px}
.go{width:88px;height:88px;border-radius:50%%;background:#C96F52;display:grid;place-items:center;flex:none;margin-right:6px}.go svg{width:44px;height:44px}</style></head><body>
%s<div class="search"><span class="q">יוצאים&nbsp;<b>להרפתקה</b><span class="caret"></span></span><span class="go"><svg viewBox="0 0 24 24" fill="none" stroke="#FFFDF9" stroke-width="2.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span></div></body></html>'''
tmp = pathlib.Path(tempfile.mkdtemp())
for n, f in enumerate(sorted(SRC.glob("*.png")), 1):
    ya, yb, top = CFG.get(n, DEF)
    bg = tmp / f"bg{n}.png"; clean(Image.open(f), ya, yb, n).save(bg)
    L0, L1 = LINE1.get(n, (0, 0)); L0 -= 4; L1 += 4
    l1html = '<div class="l1">מוזמנים לחוויה של</div>'
    h = tmp / f"{n}.html"; h.write_text(PAGE % (bg.as_uri(), L0, L1 - L0, 'flex' if SEARCH else 'none', top, l1html), encoding="utf-8")
    out = OUT / f.name
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}", "--virtual-time-budget=6000",
                    f"--user-data-dir={tmp/('u'+str(n))}", f"--screenshot={out}", h.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("ok", n, out.exists())
