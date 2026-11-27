"""Videos only: no commas and no quotation marks in the text before the invitation (the user's request).
Touches the Hebrew string literals of the word shots, the question lines (TOP / LINE1 / LINE2), the highlight (STACK)
and the line after it (BOTTOM). Then re-scans every scene and fails if anything is left."""
import re
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
TARGET = re.compile(r"^(?:\s*\{ a: G\(.*words: \[.*|\s*const (?:STACK|TOP|LINE1) = .*)$", re.M)
LIT = re.compile(r"'([^']*)'")
BAD = re.compile(r"[,״\"]")
HEB = re.compile(r"[\u0590-\u05FF]")
SPECIAL = {"ה״אז": "״אז"}          # ad 23: "לפני ה״אז מה..." without quotes reads "האז"; drop the ה with the quotes


def clean_lit(m):
    s = m.group(1)
    if not HEB.search(s): return m.group(0)
    for a, b in SPECIAL.items(): s = s.replace(a, b)
    return "'" + BAD.sub("", s).strip() + "'"


changed = []
for n in range(1, 51):
    p = M / f"ad-{n:02d}" / "scene.js"; src = p.read_text(encoding="utf-8")
    new = TARGET.sub(lambda mm: LIT.sub(clean_lit, mm.group(0)), src)
    if new != src:
        p.write_text(new, encoding="utf-8"); changed.append(n)
# verify: nothing left, and the 'end' scenes still end the stack with the selected word
left = []
for n in range(1, 51):
    src = (M / f"ad-{n:02d}" / "scene.js").read_text(encoding="utf-8")
    for mm in TARGET.finditer(src):
        for lit in LIT.findall(mm.group(0)):
            if HEB.search(lit) and BAD.search(lit): left.append((n, lit))
print("changed:", changed)
print("left:", left or "none")
