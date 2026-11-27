"""ONE-OFF: written for the music of ads 27..50 (motion/music-map-27-50.json), which are done. Kept for a
hand fix of one of those ads; not part of the current flow (render_seq.py). Paths now come from tools/paths.py.
Set an ad's invitation point by hand (song time of the card) and print its cardpoint metrics.
usage: python override.py ad-28=75.85 ad-30=97.99 ...   (add 'dry' to only score)"""
import json, math, os, re, subprocess, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
SP = P.MOTION_TOOLS   # cardpoint.py sits beside this tool (it used to be in an old session's scratchpad)
PY = P.MOTION_PYTHON  # env MOTION_PYTHON, default ~/.motion-studio/venv
MAP = json.loads((M / "music-map-27-50.json").read_text(encoding="utf-8"))
dry = "dry" in sys.argv
for arg in [a for a in sys.argv[1:] if "=" in a]:
    ad, tc = arg.split("="); tc = float(tc)
    mm = MAP[ad]; d0, bar = mm['d0'], mm['bar']; p = bar / 4
    idx = int(re.search(r"const T_CARD = G\((\d+)\)", (M / ad / "scene.js").read_text(encoding="utf-8")).group(1)) + 1
    b0 = d0 - p * math.floor(d0 / p); k = round((tc - b0) / p); t = b0 + k * p; S = t - idx * p
    out = subprocess.run([PY, str(SP / "cardpoint.py"), ad, str(M / ad / "music.mp3"), str(d0), str(bar), str(idx), f"{S:.3f}"],
                         capture_output=True, text=True, encoding="utf-8", env=dict(os.environ, MINCUT="99", PYTHONIOENCODING="utf-8")).stdout
    now = [l for l in out.splitlines() if "now" in l]
    print(ad, now[0].strip() if now else out.strip()[-200:], flush=True)
    if dry: continue
    h = M / ad / "index.html"; s = h.read_text(encoding="utf-8")
    s, n1 = re.subn(r"^  bpm: .*$", f"  bpm: {240 / bar:.2f}, beat0: 0, // beat grid of music.mp3 (measured): beat(n) = n * {p:.4f} s from the start of the clip", s, flags=re.M)
    assert n1 == 1
    s, n2 = re.subn(r"^  music: .*$", f"  music: {{ file: 'music.mp3', start: {S:.3f}, gain: 0 }},   // the invitation lands at {t:.2f} s in the song, on a rhythm change", s, flags=re.M)
    assert n2 == 1; h.write_text(s, encoding="utf-8")
    j = M / ad / "scene.js"; c = j.read_text(encoding="utf-8")
    c, n3 = re.subn(r"from (START|[\d.]+) s\)", f"from {S:.3f} s)", c, count=1); assert n3 == 1; j.write_text(c, encoding="utf-8")
