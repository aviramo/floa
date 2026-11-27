"""No design-tool captions in the 100 message ads: the label under the selection box stays empty, without LOCKED and without the "W 901 H 456" numbers.
The selection box itself stays. Nothing else changes. Only edits scene.js; it takes effect at the next render.
usage: python no_locked.py 51 52-60   (then render.py full, music_accents.py, publish_videos.py for the same numbers)"""
import re, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
OLD = re.compile(r"lab\.inner\.textContent = t >= T_LOCK \? '(?:LOCKED)?' : `W \$\{Math\.round\(w\)\}  H \$\{Math\.round\(h\)\}`;")
NEW = "lab.inner.textContent = '';"
out = []
for a in sys.argv[1:]:
    if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
    else: out.append(int(a))
for n in out:
    p = M / f"ad-{n:02d}" / "scene.js"
    s = p.open(encoding="utf-8", newline="").read()
    if NEW in s: print(n, "already"); continue
    s, k = OLD.subn(NEW, s)
    assert k == 1, n
    with p.open("w", encoding="utf-8", newline="") as f: f.write(s)
    print(n, "patched")
