# מייצר תמונת קאבר (1640x624) ותמונת פרופיל (1080x1080) לדף הפייסבוק -> ads/social/
# הרצה: python tools/ads/build_social.py   (דורש Chrome). הפלט ב-paths.SOCIAL (HARPATKA_MEDIA_OUT/social), לא מתפרסם בחנות.
import os, sys, subprocess, pathlib, tempfile
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout (tools/paths.py)
CHROME = next(p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"] if os.path.exists(p))
IMG = P.IMAGES.as_uri()
OUT = P.SOCIAL; OUT.mkdir(parents=True, exist_ok=True)

DANCERS = lambda a, b: f'<svg viewBox="0 0 48 52" style="width:100%;height:100%"><g stroke="{a}" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M15 21Q8 17 6 9"/><path d="M15 21Q21 18 24 12"/><path d="M34 22Q40 17 42 11"/><path d="M34 22Q29 19 27 14"/></g><g fill="{a}"><circle cx="15" cy="12" r="3.5"/><path d="M15 17C9 22 8 33 5 42L25 42C22 33 21 22 15 17Z"/></g><g fill="{b}"><circle cx="34" cy="13" r="3.3"/><path d="M34 18C28.5 23 28 33 26 42L42 42C40 33 39.5 23 34 18Z"/></g></svg>'

PROFILE = f'''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Rubik:wght@600&display=swap" rel="stylesheet">
<style>
*{{margin:0;box-sizing:border-box}}html,body{{width:1080px;height:1080px;overflow:hidden}}
body{{background:#F6EFE4;position:relative}}
img{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 45%}}
/* כיתוב עליון — בתוך אזור החיתוך העגול של פייסבוק */
.cap{{position:absolute;left:50%;top:170px;transform:translateX(-50%);padding:16px 52px 20px;border-radius:999px;background:rgba(255,253,249,.93);
 font-family:Fredoka,Rubik,sans-serif;font-weight:600;font-size:78px;line-height:1;color:#3F382F;white-space:nowrap;box-shadow:0 8px 24px rgba(63,56,47,.16)}}
.cap em{{font-style:normal;color:#C96F52}}
</style><body>
<img src="{IMG}/biodanza-hero.webp">
</body></html>'''

COVER_T = f'''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<style>
*{{margin:0;box-sizing:border-box}}html,body{{width:1640px;height:624px;overflow:hidden}}
body{{background:#F6EFE4;position:relative}}
/* תמונת אווירה בלי טקסט: מסגרת פסי דואר + שלוש בועות צילום בשפת האתר */
.frame{{position:absolute;inset:20px;border-radius:30px;padding:22px;background:repeating-linear-gradient(-45deg,#C96F52 0 30px,#FFFDF9 30px 52px,#9A9A75 52px 82px,#FFFDF9 82px 104px);box-shadow:0 8px 22px rgba(63,56,47,.10)}}
.paper{{position:relative;width:100%;height:100%;border-radius:16px;overflow:hidden;background:linear-gradient(110deg,#FFFDF9 0%,#F8EBDD 55%,#F1D9C7 100%)}}
.sh{{position:absolute}}
.s1{{left:-120px;top:-210px;width:540px;height:540px;border-radius:50%;background:#F1E4D3}}
.s2{{right:-70px;bottom:-130px;width:420px;height:500px;border-radius:210px 210px 0 0;background:rgba(154,154,117,.30)}}
.s3{{left:560px;bottom:-40px;width:220px;height:220px;border-radius:50%;background:#E9B8A4;opacity:.55}}
.s4{{left:1010px;top:300px;width:62px;height:62px;border-radius:50%;background:#C98D86;opacity:.6}}
.s5{{right:330px;top:430px;width:300px;height:300px;border-radius:50%;background:rgba(217,139,112,.25)}}
.b{{position:absolute;overflow:hidden;border-radius:58% 42% 55% 45% / 48% 58% 42% 52%;box-shadow:0 20px 44px rgba(63,56,47,.18)}}
.b img{{width:100%;height:100%;object-fit:cover}}
.b1{{left:250px;top:120px;width:390px;height:390px;transform:rotate(-8deg)}} .b1 img{{transform:rotate(8deg) scale(1.3)}}
.b2{{left:690px;top:40px;width:340px;height:340px;transform:rotate(10deg)}} .b2 img{{transform:rotate(-10deg) scale(1.3)}}
.b3{{left:1090px;top:36px;width:250px;height:250px;transform:rotate(-14deg)}} .b3 img{{transform:rotate(14deg) scale(1.3)}}
</style><body>
<div class="frame"><div class="paper">
<div class="sh s1"></div><div class="sh s2"></div><div class="sh s3"></div><div class="sh s4"></div><div class="sh s5"></div>
<div class="b b1"><img src="{IMG}/dance-foot.webp"></div>
<div class="b b2"><img src="{IMG}/fingertips.webp"></div>
<div class="b b3"><img src="{IMG}/hands-heart-wide.webp"></div>
</div></div></body></html>'''

def cover(sub=None):
    return COVER_T

def shot(html, w, h, name):
    tmp = pathlib.Path(tempfile.mkdtemp()); f = tmp / "p.html"; f.write_text(html, encoding="utf-8")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}", "--virtual-time-budget=6000",
                    f"--user-data-dir={tmp/'u'}", f"--screenshot={OUT/name}", f.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("ok", name)

if __name__ == "__main__":
    shot(PROFILE, 1080, 1080, "facebook-profile.png")
    shot(cover("מפגש מסוג אחר"), 1640, 624, "facebook-cover.png")
