"""The invitation background: sand with the soft shapes of the ad images, instead of the diagonal stripes. Only the background changes;
beats, music, text and every frame before the invitation stay as they were. Keeps scene.pre-bg.js and out/final.pre-bg.mp4 once.
usage: python invite_bg.py 51 52-60   (then render.py full, make_covers.py and publish_videos.py for the same numbers)"""
import shutil, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
OLD_BG = """    const STRIPE_P = 116 * Math.SQRT2;                       // the stripes repeat every STRIPE_P px across
    const stripes = rect(cam2, -W / 2 - M - STRIPE_P, -FH / 2 - M, W + 2 * M + STRIPE_P, FH + 2 * M, {
      background: `repeating-linear-gradient(-45deg, ${C.TERRA} 0 34px, ${C.PAPER2} 34px 58px, ${C.SAGE} 58px 92px, ${C.PAPER2} 92px 116px)` });
"""
NEW_BG = """    // the quiet background of the invitation: sand with the soft shapes of the ad images
    const invBg = rect(cam2, -W / 2 - M, -FH / 2 - M, W + 2 * M, FH + 2 * M, { background: C.SAND, overflow: 'hidden' });
    rect(invBg, 570 + M, -180 + M, 660, 660, { background: C.CREAM, opacity: 0.75, borderRadius: '50%' });
    rect(invBg, -40 + M, 1500 + M, 330, 460, { background: C.CREAM, opacity: 0.75, borderRadius: '165px 165px 0 0' });
    rect(invBg, 860 + M, 1680 + M, 300, 300, { background: C.CREAM, opacity: 0.5, borderRadius: '50%' });
"""
OLD_PAPER = "{ background: C.PAPER2, borderRadius: '36px' });"
NEW_PAPER = "{ background: C.PAPER2, borderRadius: '36px', boxShadow: '0 14px 60px rgba(63,56,47,.18)' });"
OLD_TF = "tf(stripes, { x: (t * 46) % STRIPE_P, mb: [0, vy] }); tf(paper, { mb: [0, vy] });"
NEW_TF = "tf(invBg, { mb: [0, vy] }); tf(paper, { mb: [0, vy] });"


def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out


for n in nums(sys.argv[1:]):
    d = M / f"ad-{n:02d}"; p = d / "scene.js"
    s = p.open(encoding="utf-8", newline="").read()
    if "invBg" in s: print(n, "already"); continue
    crlf = "\r\n" in s
    t = s.replace("\r\n", "\n")
    for a in (OLD_BG, OLD_PAPER, OLD_TF): assert t.count(a) == 1, (n, a[:40], t.count(a))
    t = t.replace(OLD_BG, NEW_BG).replace(OLD_PAPER, NEW_PAPER).replace(OLD_TF, NEW_TF)
    if not (d / "scene.pre-bg.js").exists(): shutil.copy2(p, d / "scene.pre-bg.js")
    final = d / "out" / "final.mp4"
    if final.exists() and not (d / "out" / "final.pre-bg.mp4").exists(): shutil.copy2(final, d / "out" / "final.pre-bg.mp4")
    with p.open("w", encoding="utf-8", newline="") as f: f.write(t.replace("\n", "\r\n") if crlf else t)
    print(n, "patched")
