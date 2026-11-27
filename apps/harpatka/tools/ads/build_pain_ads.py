# מודעות פייסבוק של כאב: תמונת טקסט 9:16 (1080x1920). כל התוכן באזור הבטוח 4:5 (1080x1350, y 285 עד 1635), שני צבעים, בלי צילומים.
# מלבן 4:5 דמיוני באמצע עם ריפוד של 90px, והטקסט ממלא את פנים הריפוד (900x1170): כל שורה מוגדלת או מוקטנת לאותו רוחב בדיוק,
# והמרווח האנכי מתפזר כך שגם הגובה מתמלא. מילים קצרות וחזקות נעשות ענקיות, שורות ארוכות קטנות. השורה האחרונה מפנה לכפתור של פייסבוק שמתחת למודעה.
# הרצה: python tools/ads/build_pain_ads.py  -> paths.IMG/pain-<מפתח>-916.png  (דורש Chrome). לא ב-ads.json ולא מתפרסם לבד;
# לפרסום: python tools/publish.py file ads/img/<שם>=<נתיב> (ולתת שם חדש עם hash לקובץ שהשתנה).
import json, pathlib, subprocess, tempfile, sys, os, html
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout (tools/paths.py)
# עצמאי (בלי build_ads.py): מחלקה B עם קבועי הגודל והאזור הבטוח. ROOT = שורש הריפו. הגרסה של חמשת הכאבים של מנוע הצ'אט (calm, crowd2, nothing, self, close);
class B:
    ROOT = P.APP
    CHROME = next(p for p in [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"] if os.path.exists(p))
    W, H = 1080, 1920
    SAFE = (H - 1350) // 2   # גובה הרצועה מעל ומתחת לאזור הבטוח (285)
ROOT = B.ROOT
PAD = 90
IN_W, IN_H = B.W - 2 * PAD, 1350 - 2 * PAD       # פנים הריפוד: 900x1170
CTA = "לחצו על הכפתור למטה ונדבר"
# מפתח -> (שורות (טקסט, צבע), צבע הדגשה חי מהפלטה: coral / sage / terra, על רקע ink)
ADS = {
  "calm": ([("הגוף כבר במיטה", "fg"), ("והראש", "fg"), ("עדיין רץ", "acc")], "#8DB255"),
  "crowd2": ([("איך זה להיות", "fg"), ("מוקף באנשים", "fg"), ("ועדיין", "fg"), ("להרגיש לבד?", "acc")], "#FFD8AE"),
  "nothing": ([("הכול מסודר בחיים", "fg"), ("אז למה", "fg"), ("שום דבר", "acc"), ("כבר לא מרגש?", "fg")], "#FF8A5C"),
  "self": ([("הכי כואב", "fg"), ("להסתכל במראה", "fg"), ("ולא לאהוב", "acc"), ("את מי שרואים", "fg")], "#EC7F78"),
  "close": ([("רוצה קרבה", "fg"), ("אבל ברגע האמת", "fg"), ("משהו בך", "fg"), ("נסגר?", "acc")], "#E5562D"),
}

FONT = "Secular One"   # גופן מרובע וכבד (בלי עיגול). חלופה: Heebo 900
def page(lines, acc):
    bg, fg, deco = "#2C231D", "#FFF5E8", "rgba(255,245,232,.07)"   # ink, cream
    data = json.dumps([[t, c] for t, c in lines], ensure_ascii=False)
    fam = FONT.replace(" ", "+")
    return f'''<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family={fam}&display=block" rel="stylesheet">
<style>*{{margin:0}}html,body{{width:{B.W}px;height:{B.H}px;overflow:hidden;background:{bg}}}canvas{{display:block}}pre{{display:none}}</style></head><body>
<canvas id="c" width="{B.W}" height="{B.H}"></canvas><pre id="s"></pre>
<script>
// פריסה לפי הדיו עצמו: כל שורה ברוחב דיו של IN_W בדיוק, מרווחים אנכיים שווים וצפופים, וריפוד זהה מארבעת הצדדים של המלבן 4:5.
// הטקסט מפוצל לשורות כך שהגובה ימלא את המלבן בדיוק עם מרווח קטן; מילה מודגשת תמיד בשורה משלה, והשורה האחרונה (ההפניה לכפתור) קבועה.
const SRC={data}, CTA={json.dumps(CTA, ensure_ascii=False)}, ACC='{acc}', FG='{fg}', W={B.W}, H={B.H}, X0={PAD}, Y0={B.SAFE}+{PAD}, IN_W={IN_W}, IN_H={IN_H}, FAM='"{FONT}"', GAP=10, SR=0.032;
const c=document.getElementById('c'), x=c.getContext('2d');
function ink(t, fs){{ x.font=fs+'px '+FAM; x.direction='rtl'; const m=x.measureText(t); return {{l:m.actualBoundingBoxLeft, r:m.actualBoundingBoxRight, a:m.actualBoundingBoxAscent, d:m.actualBoundingBoxDescent}}; }}
function fit(t){{ const i=ink(t,100), fs=100*IN_W/(Math.abs(i.l+i.r)+100*SR), j=ink(t,fs), st=fs*SR; return {{fs, st, h:j.a+j.d+st}}; }}
// קבוצות רצופות לפי צבע (כל המילים של הקבוצה ברצף). בתוך קבוצה בוחרים איפה לשבור שורות כך שהמרווחים יהיו קטנים ושווים וגם הגובה יתמלא.
function groups(){{ return SRC.map(([t,col])=>({{col, w:t.split(' ')}})); }}   // כל שורה מקורית נשארת יחידה אחת: אפשר לפצל אותה לשורות, אבל לא לאחד שורות מקוריות (משפטים לא נחתכים באמצע)
function splits(w){{ const out=[]; for(let m=0;m<(1<<(w.length-1));m++){{ const ls=[]; let cur=[w[0]]; for(let i=1;i<w.length;i++){{ if(m&(1<<(i-1))){{ ls.push(cur.join(' ')); cur=[w[i]]; }} else cur.push(w[i]); }} ls.push(cur.join(' ')); out.push(ls); }} return out; }}
const cache={{}}; const F=t=>cache[t]||(cache[t]=fit(t));
function choose(){{
  const gs=groups().map(g=>splits(g.w).map(ls=>ls.map(t=>({{t,c:g.col}})))); let best=null, ctaH=F(CTA).h;
  (function rec(i,acc){{ if(i===gs.length){{ const n=acc.length+1, sum=acc.reduce((p,l)=>p+F(l.t).h,0)+ctaH+GAP*(n-1), gap=GAP, slack=IN_H-sum;
      if(slack<0) return; let pen=slack;
      for(const l of acc){{ const sw=l.t.length<=4 && l.t.indexOf(' ')<0; if(sw) pen+=60; }}
      pen+=(acc.length-gs.length)*5;   // העדפה לפיצולים מועטים   // מילה קצרה לבד בשורה (לא, זה, היא) נעשית ענקית
      if(!best||pen<best.pen) best={{pen, lines:acc.slice(), gap, slack}}; return; }}
    for(const opt of gs[i]) rec(i+1, acc.concat(opt)); }})(0,[]);
  return best;
}}
function go(){{
  x.fillStyle='{bg}'; x.fillRect(0,0,W,H); x.fillStyle='{deco}'; x.beginPath(); x.arc(W+160,{B.SAFE-240}+230,310,0,7); x.fill();
  x.beginPath(); x.moveTo(-130,H); x.lineTo(-130,H-{450+B.SAFE}+200); x.arc(70,H-{450+B.SAFE}+200,200,Math.PI,0); x.lineTo(270,H); x.fill();
  const best=choose(); let lines, gap, k=1, off=0;
  if(best){{ lines=best.lines.concat([{{t:CTA,c:'acc'}}]); gap=GAP; off=best.slack/2; }}
  else {{ lines=SRC.map(([t,c])=>({{t,c}})).concat([{{t:CTA,c:'acc'}}]); const sum=lines.reduce((p,l)=>p+F(l.t).h,0); k=(IN_H-GAP*(lines.length-1))/sum; gap=GAP; }}
  const m=lines.map(l=>F(l.t)); let y=Y0+off, stats=[]; const ws=IN_W*k, left=X0+(IN_W-ws)/2;
  lines.forEach((l,i)=>{{ const fs=m[i].fs*k, j=ink(l.t,fs); x.font=fs+'px '+FAM; x.direction='rtl'; x.textAlign='right'; x.fillStyle=l.c==='acc'?ACC:FG; x.strokeStyle=x.fillStyle; const st=m[i].st*k; x.lineWidth=st; x.lineJoin='round';
    x.strokeText(l.t, left+ws-j.r-st/2, y+st/2+j.a); x.fillText(l.t, left+ws-j.r-st/2, y+st/2+j.a); stats.push([Math.round(left),Math.round(y),Math.round(left+ws),Math.round(y+j.a+j.d)]); y+=j.a+j.d+st+gap; }});
  document.getElementById('s').textContent=JSON.stringify({{k,gap,lines:lines.map(l=>l.t),stats}});
}}
document.fonts.load('100px {FONT}','אבגדהוזחטיכלמנסעפצקרשת?').then(()=>setTimeout(go,50));
</script></body></html>'''

def main():
    out = P.IMG; out.mkdir(parents=True, exist_ok=True)
    tmp = pathlib.Path(tempfile.mkdtemp())
    for key, (lines, acc) in ADS.items():
        f = tmp/(key+".html"); f.write_text(page(lines, acc), encoding="utf-8")
        name = f"pain-{key}-916.png"
        subprocess.run([B.CHROME, "--headless", "--disable-gpu", "--hide-scrollbars", f"--window-size={B.W},{B.H}", "--virtual-time-budget=6000",
                        f"--user-data-dir={tmp/('p'+key)}", f"--screenshot={out/name}", f.as_uri()], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        print("ok", name)

if __name__ == "__main__":
    main()
