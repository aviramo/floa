"""Render a set of ads, a few at a time, and log one line per ad. Skips an ad whose final.mp4 is newer than its scene.js.
usage: python render_batch.py 51-100   (motion-studio python); log in motion/review/render-batch.log"""
import os, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
LOG = M / "review" / "render-batch.log"; LOG.parent.mkdir(exist_ok=True)
PAR, WORKERS = 5, "3"


def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out


def log(s):
    with LOG.open("a", encoding="utf-8") as f: f.write(s + "\n")


def job(n):
    d = M / f"ad-{n:02d}"; out = d / "out" / "final.mp4"
    if out.exists() and out.stat().st_mtime > (d / "scene.js").stat().st_mtime: return log(f"ad {n}: already rendered")
    t0 = time.time()
    r = subprocess.run([sys.executable, "render.py", "full"], cwd=d, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       env=dict(os.environ, PYTHONIOENCODING="utf-8", WORKERS=WORKERS))
    ok = r.returncode == 0 and out.exists() and out.stat().st_mtime >= t0
    log(f"ad {n}: {'ok' if ok else 'FAILED ' + str(r.returncode) + ' ' + (r.stderr or '')[-300:]} {time.time() - t0:.0f}s")


with ThreadPoolExecutor(PAR) as ex: list(ex.map(job, nums(sys.argv[1:])))
log("done")
