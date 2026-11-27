"""ONE-OFF: chose the invitation points of ads 27..50 once; those ads are done. Running it again overwrites
their index.html and scene.js, so only on purpose. Not part of the current flow. Paths now come from tools/paths.py.
Choose the invitation point of ads 27..50 (reused songs) and write it into each project.
Prefers a point > 8 s away from where the song's first ad lands, when its score is >= 75% of the best."""
import json, math, os, re, subprocess, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
SP = P.MOTION_TOOLS   # cardpoint.py sits beside this tool (it used to be in an old session's scratchpad)
PY = P.MOTION_PYTHON  # env MOTION_PYTHON, default ~/.motion-studio/venv
MAP = json.loads((M / "music-map-27-50.json").read_text(encoding="utf-8"))
FIRST = {'ad-01': 53.241, 'ad-02': 17.46, 'ad-03': 97.992, 'ad-05': 45.956, 'ad-06': 68.994, 'ad-07': 9.981, 'ad-08': 42.08,
         'ad-09': 15.518, 'ad-10': 51.256, 'ad-12': 84.302, 'ad-13': 99.625, 'ad-14': 24.789, 'ad-15': 25.576, 'ad-16': 7.701,
         'ad-17': 65.979, 'ad-18': 67.597, 'ad-19': 43.312, 'ad-20': 13.170, 'ad-21': 59.921, 'ad-22': 26.830, 'ad-23': 54.624,
         'ad-24': 32.854, 'ad-25': 40.823, 'ad-26': 63.388}
ROW = re.compile(r"card at\s+([\d.]+)s\s+start\s+([\d.]+)s\s+change\s+([\d.]+)\s+lift\s+([+-][\d.]+)\s+after\s+([+-][\d.]+)\s+cuts\s+([+-][\d.]+)\s+score\s+([-\d.]+)")
for ad in (sys.argv[1:] or sorted(MAP)):
    mm = MAP[ad]; d0, bar = mm['d0'], mm['bar']; p = bar / 4
    idx = int(re.search(r"const T_CARD = G\((\d+)\)", (M / ad / "scene.js").read_text(encoding="utf-8")).group(1)) + 1
    out = subprocess.run([PY, str(SP / "cardpoint.py"), ad, str(M / ad / "music.mp3"), str(d0), str(bar), str(idx), "0"],
                         capture_output=True, text=True, encoding="utf-8", env=dict(os.environ, MINCUT="-99", PYTHONIOENCODING="utf-8")).stdout
    cands = [tuple(float(g) for g in m.groups()) for m in ROW.finditer(out) if "now" not in out[max(0, m.start() - 12):m.start()]]
    cands = [c for c in cands if c[1] > 0]
    best = max(cands, key=lambda c: c[6])
    first = FIRST[mm['song_from']]
    alt = [c for c in cands if abs(c[0] - first) > 8 and c[6] >= 0.75 * best[6]]
    pick = max(alt, key=lambda c: c[6]) if alt else best
    t_c = pick[0]
    b0 = d0 - p * math.floor(d0 / p); k = round((t_c - b0) / p); t = b0 + k * p; S = t - idx * p
    h = M / ad / "index.html"; s = h.read_text(encoding="utf-8")
    s, n1 = re.subn(r"^  bpm: .*$", f"  bpm: {240 / bar:.2f}, beat0: 0, // beat grid of music.mp3 (measured): beat(n) = n * {p:.4f} s from the start of the clip", s, flags=re.M)
    s, n2 = re.subn(r"^  music: .*$", f"  music: {{ file: 'music.mp3', start: {S:.3f}, gain: 0 }},   // the invitation lands at {t:.2f} s in the song, on a rhythm change", s, flags=re.M)
    assert n1 == 1 and n2 == 1, ad
    h.write_text(s, encoding="utf-8")
    j = M / ad / "scene.js"; c = j.read_text(encoding="utf-8"); j.write_text(c.replace("from START s)", f"from {S:.3f} s)"), encoding="utf-8")
    note = "another part of the song" if abs(t - first) > 8 else "same point as the song's first ad"
    print(f"{ad} <- {mm['song_from']}: card {t:.2f}s start {S:.2f}  change {pick[2]:.1f} lift {pick[3]:+.1f} after {pick[4]:+.1f} cuts {pick[5]:+.1f} "
          f"score {pick[6]:.2f} (best {best[6]:.2f})  [{note}]", flush=True)
