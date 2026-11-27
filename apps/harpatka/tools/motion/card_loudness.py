"""Loudness per beat around the invitation (T_CARD) of rendered ads: the music should jump there.
usage: python card_loudness.py 29 32 ...   (run from motion/)"""
import re, subprocess, sys
from pathlib import Path
import numpy as np

for a in sys.argv[1:]:
    d = Path(f"ad-{int(a):02d}")
    cfg = (d / "index.html").read_text(encoding="utf-8")
    p = float(re.search(r"beat\(n\) = n \* ([\d.]+)", cfg).group(1))
    idx = int(re.search(r"const T_CARD = G\((\d+)\)", (d / "scene.js").read_text(encoding="utf-8")).group(1)) + 1
    sr = 11025
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "quiet", "-i", str(d / "out" / "final.mp4"), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                                     capture_output=True).stdout, np.float32).astype(float)
    db = lambda s: 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)
    c = idx * p
    print(f"{d.name} around the card ({c:.2f}s): " + "  ".join(f"{c + k * p:.2f}:{db(x[int((c + k * p) * sr):int((c + (k + 1) * p) * sr)]):.0f}" for k in range(-3, 3)))
