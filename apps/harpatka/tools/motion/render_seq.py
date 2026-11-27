"""Render ads one at a time, gently: below-normal priority, a few workers, one log line per ad. Safe to stop and run again.
Each ad: invite_bg, no_locked, render.py full, music_accents, make_covers, every-frame and sound check, publish_videos.
usage: python tools/motion/render_seq.py [--publish] 51-100   (motion-studio python); log in <motion>/review/render-seq.log
The motion projects are in paths.MOTION (HARPATKA_MOTION_ROOT), the tools beside this file. publish_videos.py runs with --local per ad;
at the end tools/publish.py prints one upload plan for every ad that finished ok, and uploads it only with --publish (owner's word).
Touch motion/review/render-seq.stop to stop after the current ad. motion/review/render-seq.workers sets the workers (default 3).
An ad that fails the check is logged HOLD and not published; out/seq.ok marks a finished ad."""
import json, os, re, subprocess, sys, time
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P, publish

SEND = publish.take_flag("--publish")
M = P.MOTION; T = P.MOTION_TOOLS
OK = []   # ads published locally in this run (one upload plan at the end)
LOG, STOP, WK = (M / "review" / f"render-seq.{x}" for x in ("log", "stop", "workers"))
LOG.parent.mkdir(exist_ok=True)
LOW = subprocess.BELOW_NORMAL_PRIORITY_CLASS
ENV = dict(os.environ, PYTHONIOENCODING="utf-8")
SR, W, H, FPS = 44100, 135, 1920, 60


def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out


def log(s):
    with LOG.open("a", encoding="utf-8") as f: f.write(time.strftime("%H:%M:%S ") + s + "\n")


def run(cmd, cwd=None, env=ENV):
    r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=LOW)
    if r.returncode: raise RuntimeError(f"{Path(str(cmd[1])).name} exit {r.returncode}: {(r.stderr or r.stdout or '')[-300:]}")
    return r.stdout


def db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)


def check(d):
    """every frame: black in the bands outside the safe area and colour jumps at its edges; the sound at the three moments the ad needs it"""
    p = d / "out" / "final.mp4"; sz = W * H * 3; dark = 0; jumps = []; i = 0
    pr = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(p), "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                          stdout=subprocess.PIPE, creationflags=LOW)
    while True:
        b = pr.stdout.read(sz)
        if len(b) < sz: break
        f = np.frombuffer(b, np.uint8).reshape(H, W, 3).astype(np.int16); lum = f.mean(axis=2)
        dark = max(dark, (lum[:285] < 28).mean(), (lum[1635:] < 28).mean())
        if max(np.abs(f[280].mean(axis=0) - f[290].mean(axis=0)).max(), np.abs(f[1630].mean(axis=0) - f[1640].mean(axis=0)).max()) > 25: jumps.append(round(i / FPS, 2))
        i += 1
    pr.wait()
    a = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, creationflags=LOW).stdout, np.float32)
    cues = json.loads((d / "out" / "cues.json").read_text(encoding="utf-8"))
    ac = cues["config"]["music"]["accents"]; burst, last = float(ac["burst"]), float(ac["last"]); dur = i / FPS
    tap = max(c[0] for c in cues["cues"] if c[1] == "click")
    w = lambda x, y: a[int(x * SR):int(y * SR)]
    e = subprocess.run(["ffmpeg", "-nostats", "-i", str(p), "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=LOW).stderr
    peak = float(re.findall(r"Peak:\s+(-?[\d.]+)", e)[-1]); lufs = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", e)[-1])
    return dict(frames=i, dark=round(float(dark), 4), jumps=jumps, first=round(float(db(w(0, 0.1)))), burst=round(float(db(w(burst, burst + 0.4)) - db(w(burst - 0.4, burst)))),
                tail=round(dur - last, 2), after_tap=round(last - tap, 2), peak=peak, lufs=lufs)


def finish(n, d, t0, tr, workers):
    c = check(d)
    hold = [k for k, bad in (("frames", c["frames"] != 900), ("dark", c["dark"] > 0.001), ("jumps", len(c["jumps"]) > 8), ("peak", c["peak"] > -0.5), ("tap", c["after_tap"] <= 0)) if bad]
    if hold: return log(f"ad {n}: HOLD {hold} {c}")
    run([sys.executable, str(T / "publish_videos.py"), "--local", str(n)])
    OK.append(n)
    (d / "out" / "seq.ok").write_text(json.dumps(c), encoding="utf-8")
    log(f"ad {n}: ok render {tr:.0f}s all {time.time() - t0:.0f}s workers {workers} {c}")


if sys.argv[1:2] == ["--sound"]:   # the video is already right: redo the sound only, then check and publish
    for n in nums(sys.argv[2:]):
        t0 = time.time(); run([sys.executable, str(T / "music_accents.py"), str(n)]); finish(n, M / f"ad-{n:02d}", t0, 0, "-")
    if OK: publish.run([publish.ad_video(n) for n in OK] + [publish.data("videos.json")], publish=SEND, label="render_seq --sound")
    sys.exit()

for n in nums(sys.argv[1:]):
    if STOP.exists(): log("stopped by render-seq.stop"); break
    d = M / f"ad-{n:02d}"
    if (d / "out" / "seq.ok").exists(): continue
    t0 = time.time()
    try:
        workers = WK.read_text().strip() if WK.exists() else "3"
        for tool in ("invite_bg.py", "no_locked.py"): run([sys.executable, str(T / tool), str(n)])
        t1 = time.time(); run([sys.executable, "render.py", "full"], cwd=d, env=dict(ENV, WORKERS=workers)); t2 = time.time()
        run([sys.executable, str(T / "music_accents.py"), str(n)])
        run([sys.executable, str(T / "make_covers.py"), str(n)])
        finish(n, d, t0, t2 - t1, workers)
    except Exception as ex:
        log(f"ad {n}: FAILED {ex}")
log("done")
if OK: publish.run([publish.ad_video(n) for n in OK] + [publish.data("videos.json")], publish=SEND, label="render_seq")
