# מייצר תמונת מודעה לרשתות חברתיות לכל שורה ב-ads/sentences.txt וב-ads/sentences-move.txt:
# יחס כללי 9:16 לאורך (1080x1920), וכל התוכן באזור בטוח 4:5 לאורך במרכז (1080x1350). מחוץ לאזור הבטוח רק המשך הרקע.
# טקסט בשני צבעים: מה שבתוך [ ] מודגש בצבע ההדגשה. בלי צילומים.
# בתחתית: שורת חיפוש עם "יוצאים להרפתקה" (רמז לחפש בגוגל), זכוכית מגדלת אחת בכפתור. בלי "מפגשים מסוג אחר" (אוק׳ 2026).
# הרצה:  python tools/ads/build_ads.py [--all] [--publish]   (דורש Chrome). בלי --all מייצר רק תמונות חסרות (טקסטים חדשים).
# קלט: tools/ads/sentences.txt ו-sentences-move.txt. נתונים: public/ads/_data/registry.json ו-ads.json (paths.DATA).
# תמונות: paths.IMG (HARPATKA_MEDIA_OUT/img), לא בריפו. כל תמונה חדשה או שהשתנתה מקבלת שם עם hash: ad-NN-916-<hash>.png.
# בסוף: publish.py מדפיס את תוכנית ההעלאה של מה שהשתנה (תמונות ו-JSON). מעלה רק עם --publish, ורק בהוראת בעל העסק.
# מספר סידורי קבוע לכל טקסט ב-registry.json — להוסיף טקסטים חדשים רק בסוף sentences.txt (או בכל מקום; המספר נקבע לפי הטקסט).
import os, sys, json, subprocess, html, tempfile, pathlib, hashlib, shutil
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import paths as P, publish
CHROME = next(p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"] if os.path.exists(p))
W, H = 1080, 1920
SAFE = (H - 1350) // 2   # גובה הרצועה מעל ומתחת לאזור הבטוח (285)

# (רקע, צבע טקסט ראשי, צבע הדגשה, עיגולי קישוט)
STYLES = [
  ("#F6EFE4", "#3F382F", "#C96F52", "rgba(232,213,190,.75)"),
  ("#C96F52", "#FFFDF9", "#FFE2A8", "rgba(255,253,249,.14)"),
  ("#E8D5BE", "#3F382F", "#B85C40", "rgba(255,253,249,.45)"),
  ("#686A48", "#FFFDF9", "#F4C77A", "rgba(255,253,249,.12)"),
  ("#663F4C", "#FFFDF9", "#F2B8A2", "rgba(255,253,249,.10)"),
  ("#FFFDF9", "#3F382F", "#C96F52", "rgba(232,213,190,.6)"),
  ("#DDDCC3", "#3F382F", "#A9533A", "rgba(255,253,249,.5)"),
]
# מיקומי עיגולי הקישוט (שונים מתמונה לתמונה)
DECOS = [
  ((-170, None, 560, 620, None), (None, -90, 380, 380, 0)),
  ((None, -150, 520, 620, None), (-110, None, 420, 420, None)),
]

def colored(text):
    out, i = [], 0
    while i < len(text):
        a = text.find("[", i)
        if a < 0:
            out.append(html.escape(text[i:])); break
        b = text.find("]", a)
        out.append(html.escape(text[i:a]))
        j = b + 1
        while j < len(text) and text[j] in '?!.,:;…"״”':   # סימני פיסוק צמודים אחרי ההדגשה — באותו צבע
            j += 1
        out.append("<em>" + html.escape(text[a+1:b] + text[b+1:j]) + "</em>")
        i = j
    return "".join(out)

def page(text, i):
    bg, fg, acc, deco = STYLES[i % len(STYLES)]
    flip = (i // len(STYLES)) % 2
    return f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600&family=Rubik:wght@600;700&family=Assistant:wght@600&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box;margin:0}}
html,body{{width:{W}px;height:{H}px;overflow:hidden}}
body{{background:{bg};color:{fg};font-family:Fredoka,Rubik,sans-serif;position:relative}}
.c1{{position:absolute;{'left' if flip else 'right'}:-170px;top:{SAFE-240}px;width:620px;height:620px;border-radius:50%;background:{deco}}}
.c2{{position:absolute;{'right' if flip else 'left'}:-130px;bottom:0;width:400px;height:{520-70+SAFE}px;border-radius:200px 200px 0 0;background:{deco}}}
.txt{{position:absolute;left:96px;right:96px;top:{SAFE+180}px;bottom:{SAFE+350}px;display:flex;align-items:center;justify-content:center;text-align:center}}
#t{{font-weight:600;line-height:1.22;letter-spacing:-.005em}}
#t em{{font-style:normal;color:{acc}}}
.search{{position:absolute;bottom:{SAFE+112}px;left:50%;transform:translateX(-50%);height:124px;display:flex;align-items:center;gap:26px;
  padding:0 46px 0 18px;border-radius:999px;background:#FFFDF9;border:3px solid rgba(63,56,47,.14);box-shadow:0 10px 30px rgba(63,56,47,.16);white-space:nowrap}}
.search .q{{font-family:Rubik;font-size:60px;font-weight:600;color:#3F382F;line-height:1;display:flex;align-items:center}}
.search .q b{{color:#C96F52;font-weight:700}}
.search .caret{{display:inline-block;width:5px;height:66px;border-radius:3px;background:#C96F52;margin-right:16px}}
.search .go{{width:88px;height:88px;border-radius:50%;background:#C96F52;display:grid;place-items:center;flex:none;margin-right:6px}}
.search .go svg{{width:44px;height:44px}}
</style></head><body>
<div class="c1"></div><div class="c2"></div>
<div class="txt"><div id="t">{colored(text)}</div></div>
<div class="search"><span class="q">יוצאים&nbsp;<b>להרפתקה</b><span class="caret"></span></span>
<span class="go"><svg viewBox="0 0 24 24" fill="none" stroke="#FFFDF9" stroke-width="2.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg></span></div>
<script>
const t=document.getElementById('t'), box=t.parentElement;
let fs=150; t.style.fontSize=fs+'px';
while((t.scrollHeight>box.clientHeight||t.scrollWidth>box.clientWidth) && fs>40){{ fs-=4; t.style.fontSize=fs+'px'; }}
</script></body></html>'''

def render(args):
    i, text, tmp = args               # i = מספר סידורי (id), מתחיל ב-1. מרנדר לתיקייה זמנית; main נותן את השם עם ה-hash
    shot = tmp / f"ad-{i:02d}.png"
    f = tmp / f"{i}.html"; f.write_text(page(text, i - 1), encoding="utf-8")
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--window-size={W},{H}", "--virtual-time-budget=6000",
                    f"--user-data-dir={tmp/('p'+str(i))}", f"--screenshot={shot}", f.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return i, shot

def plain(s):
    return s.replace("[", "").replace("]", "")

def main():
    send = publish.take_flag("--publish")
    force_all = "--all" in sys.argv
    # מספר סידורי קבוע לכל טקסט: registry.json. טקסט חדש מקבל את המספר הבא; מספרים לא משתנים ולא נעשה בהם שימוש חוזר.
    reg = P.read_json("registry.json") or {"next": 1, "items": {}}
    by_text = {v: int(k) for k, v in reg["items"].items()}
    prev = {x["id"]: x["file"] for x in (P.read_json("ads.json") or [])}   # השם הנוכחי של כל תמונה (נשמר כשהיא לא השתנתה)
    # sentences.txt: הקטגוריה "הכרויות". sentences-move.txt: הקטגוריה "תנועה חדשה" (שדה type ב-ads.json)
    read = lambda f: [l.strip() for l in (P.SENTENCES/f).read_text(encoding="utf-8").splitlines() if l.strip()]
    lines = [(l, None) for l in read("sentences.txt")] + [(l, "move") for l in read("sentences-move.txt")]
    out = P.IMG; out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    jobs, items = [], []
    for l, kind in lines:
        pt = plain(l)
        if pt not in by_text:
            n = reg["next"]; reg["next"] = n + 1
            reg["items"][str(n)] = pt; by_text[pt] = n
        n = by_text[pt]
        name = prev.get(n)   # ad-NN.png (4:5) הישנים נשארים בשביל ?ad=N בעמוד הבית
        items.append({"id": n, "file": name, "text": pt, **({"type": kind} if kind else {})})
        if force_all or not name or not (out/name).exists():
            jobs.append((n, l, tmp))
    changed = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for n, shot in ex.map(render, jobs):
            if not shot.exists(): print("FAILED", n, flush=True); continue
            it = next(x for x in items if x["id"] == n)
            old = it["file"]
            if old and (out/old).exists() and (out/old).read_bytes() == shot.read_bytes():
                print("same", old, flush=True); continue   # אותם בייטים: השם הקיים נשאר
            name = f"ad-{n:02d}-916-{hashlib.sha1(shot.read_bytes()).hexdigest()[:8]}.png"   # קובץ חדש או שהשתנה = שם חדש
            shutil.move(str(shot), str(out/name))
            it["file"] = name; changed.append(it)
            print("ok", name, flush=True)
    missing = [x["id"] for x in items if not x["file"]]
    if missing: sys.exit(f"no image for ads {missing}; ads.json was not written")
    items.sort(key=lambda x: x["id"])
    data = [f for f, ch in (("registry.json", P.write_json("registry.json", reg)), ("ads.json", P.write_json("ads.json", items))) if ch]
    print(f"{len(items)} תמונות, מספר הבא: {reg['next']}")
    publish.run([publish.media(f"ads/img/{x['file']}", out/x["file"], title=x["text"]) for x in changed] + [publish.data(f) for f in data],
                publish=send, label="build_ads")

if __name__ == "__main__":
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    main()
