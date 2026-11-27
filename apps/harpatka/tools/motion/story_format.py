"""All ad videos become 9:16 portrait (1080x1920) with all the content in the 4:5 portrait safe area in the middle (1080x1350),
so one file works in the feed (cropped to 4:5), stories and reels (November 2026, at the user's request).
Inside the scene H stays 1350 (the safe area), so every word, size and position stays what it was; only what fills the frame uses FH:
the colour fields, the opening bar, the two cameras (centred on the frame), the envelope stripes, the letter's slide and the pointer's way in.
The originals are kept as scene.pre-story.js / index.pre-story.html (and out/final.pre-story.mp4, to compare frames).
usage: python story_format.py 1-100   (safe to run twice)"""
import re, shutil, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION


def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out


REPS = [
    (r"(\(\(\) => \{\n  'use strict';\n)", r"\1  const FH = CONFIG.H, H = 1350;   // 9:16 frame (1080x1920); H = the 4:5 safe area in its middle, all the content stays inside it\n"),
    (r"rect\(root, 0, 0, W, H, \{ background: sh\.bg \}\)", "rect(root, 0, 0, W, FH, { background: sh.bg })"),
    (r"rect\(root, 0, 0, W, H, \{ background: C\.CREAM \}\)", "rect(root, 0, 0, W, FH, { background: C.CREAM })"),
    (r"const bar = rect\(root, 0, H / 2 - 2, W, 4,", "const bar = rect(root, 0, FH / 2 - 2, W, 4,"),
    (r"\(H / 4\) \* S\(t", "(FH / 4) * S(t"),
    (r"const cam = grp\(root, W / 2, H / 2\);", "const cam = grp(root, W / 2, FH / 2);"),
    (r"const cam2 = grp\(root, W / 2, H / 2\);", "const cam2 = grp(root, W / 2, FH / 2);"),
    (r"const stripes = rect\(cam2, -W / 2 - M, -H / 2 - M, W \+ 2 \* M, H \+ 2 \* M, \{", "const stripes = rect(cam2, -W / 2 - M, -FH / 2 - M, W + 2 * M, FH + 2 * M, {"),
    (r"const TAP0 = \[360, H / 2 \+ 60\]", "const TAP0 = [360, FH / 2 + 60]"),
    (r"const Yc = tt => H \* 1\.06 \*", "const Yc = tt => FH * 1.06 *"),
]

# the stripes used to run by moving the background, which leaves a seam where the pattern wraps (hardly seen in a 30 px border, plain in the
# wide bands above and below the letter): they repeat every 116 * sqrt(2) px across, so now the whole box moves and wraps by exactly that
STRIPES = [
    (r"const stripes = rect\(cam2, -W / 2 - M, -FH / 2 - M, W \+ 2 \* M, FH \+ 2 \* M, \{",
     "const STRIPE_P = 116 * Math.SQRT2;                       // the stripes repeat every STRIPE_P px across\n    const stripes = rect(cam2, -W / 2 - M - STRIPE_P, -FH / 2 - M, W + 2 * M + STRIPE_P, FH + 2 * M, {"),
    (r"tf\(stripes, \{ mb: \[0, vy\] \}\);", "tf(stripes, { x: (t * 46) % STRIPE_P, mb: [0, vy] });"),
    (r"      stripes\.style\.backgroundPosition = [^\n]*\n", ""),
]

for n in nums(sys.argv[1:]):
    d = M / f"ad-{n:02d}"; sc = d / "scene.js"; hf = d / "index.html"
    s = sc.read_text(encoding="utf-8")
    if "const FH = CONFIG.H" in s:
        if "STRIPE_P" not in s:
            for pat, rep in STRIPES:
                s, k = re.subn(pat, rep, s, count=1)
                assert k == 1, (n, pat)
            sc.write_text(s, encoding="utf-8")
        continue
    if not (d / "scene.pre-story.js").exists(): shutil.copy(sc, d / "scene.pre-story.js")
    if not (d / "index.pre-story.html").exists(): shutil.copy(hf, d / "index.pre-story.html")
    out = d / "out" / "final.mp4"
    if out.exists() and n <= 50 and not (d / "out" / "final.pre-story.mp4").exists(): shutil.copy(out, d / "out" / "final.pre-story.mp4")
    for pat, rep in REPS + STRIPES:
        s, k = re.subn(pat, rep, s, count=1)
        assert k == 1, (n, pat)
    assert not re.search(r"\bW, H\b", s), (n, "a full frame box is left")
    sc.write_text(s, encoding="utf-8")
    h = hf.read_text(encoding="utf-8")
    h, k = re.subn(r"W: 1080, H: 1350,[^\n]*", "W: 1080, H: 1920,     // 9:16 portrait; all the content stays in the 4:5 portrait safe area in the middle (1080x1350)", h, count=1)
    assert k == 1, (n, "CONFIG")
    hf.write_text(h, encoding="utf-8")
print("done")
