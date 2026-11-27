"""The music answers the picture: a beat on the first frame, the bar before the invitation steps back so it bursts in on the drop,
and the last beat ends the video. Only the sound changes: the video stream is copied bit for bit.
usage: python music_accents.py 51 52-60   (motion-studio python). Keeps out/final.pre-accents.mp4 once."""
import json, os, shutil, subprocess, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
SCENE_AFTER = 'sfx(T_ST, "pop", 1); sfx(T_TAP, "click", 1); sfx(T_TAP + 0.05, "sparkle", 0.8);'
SCENE_ADD = """
    // the music answers the picture: a beat on the first frame, the invitation bursts in on the drop, the last beat ends the video
    const BAR = 4 * 60 / CONFIG.bpm, lastOn = q => T_CARD + q * Math.floor((DUR - 0.22 - T_CARD) / q);
    const T_LAST = [BAR, BAR / 2].map(lastOn).find(t => DUR - t <= 1) ?? lastOn(BAR / 4);   // the strongest beat that still ends the video
    CONFIG.music.accents = { burst: T_CARD, last: T_LAST, duck: BAR / 4 };
    sfx(0, "impact", 1); sfx(T_CARD - 0.5, "rise", 1); sfx(T_CARD, "impact", 1); sfx(T_CARD, "hit", 1); sfx(T_LAST, "impact", 1);"""
AUDIO_OLD = "x = x[:L].copy(); fo = min(L, N(0.6)); x[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2"
AUDIO_NEW = """x = x[:L].copy()
        if m.get("accents"): x = accents(x, path, m, L)
        else: fo = min(L, N(0.6)); x[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2"""
# master() measures a copy scaled down to fit when the mix passes 0 dBFS but never corrected for it, so a loud mix came out too loud and clipped
MEASURE_OLD = """    tmp.unlink(); js = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
    return float(js["input_i"]), float(js["input_tp"])"""
MEASURE_NEW = """    tmp.unlink(); js = json.loads(m[m.rindex("{"):m.rindex("}") + 1])
    up = 20 * np.log10(max(1.0, np.abs(st).max()))   # the measurement copy was scaled down to fit: correct by the same factor
    return float(js["input_i"]) + up, float(js["input_tp"]) + up"""
AUDIO_DEF = '''def accents(x, path, m, L):
    """the song's own hit from the drop on the first frame and on the last beat; the beat before the drop steps back so the drop bursts"""
    a = m["accents"]; burst, last, duck = float(a["burst"]), float(a["last"]), float(a["duck"])
    hit = load(path, start=float(m.get("start", 0)) + burst, dur=0.7, ch=2)
    hit = hit * np.exp(-np.arange(len(hit)) / SR * 6)[:, None]
    n = min(len(hit), L); x[:n] += hit[:n]
    i0, i1 = N(burst - duck), N(burst)
    x[i0:i1] *= np.linspace(1, 10 ** (-12 / 20), i1 - i0)[:, None]
    j = N(last); k = L - j; x[j:] = 0
    n = min(k, len(hit)); x[j:j + n] = hit[:n] * (np.linspace(1, 0, k)[:n, None] ** 0.5)
    return x


def music_track(root, cfg, L):'''


def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out


def patch(p, pairs):
    s = p.open(encoding="utf-8", newline="").read(); crlf = "\r\n" in s; t = s.replace("\r\n", "\n")
    for old, new in pairs:
        assert t.count(old) == 1, (p.name, old[:50], t.count(old))
        t = t.replace(old, new)
    with p.open("w", encoding="utf-8", newline="") as f: f.write(t.replace("\n", "\r\n") if crlf else t)


for n in nums(sys.argv[1:]):
    d = M / f"ad-{n:02d}"; os.chdir(d); sys.path.insert(0, str(d))
    if "accents" not in (d / "scene.js").read_text(encoding="utf-8"):
        patch(d / "scene.js", [(SCENE_AFTER, SCENE_AFTER + SCENE_ADD)])
        patch(d / "audio.py", [(AUDIO_OLD, AUDIO_NEW), ("def music_track(root, cfg, L):", AUDIO_DEF)])
    if "scaled down to fit: correct" not in (d / "audio.py").read_text(encoding="utf-8"): patch(d / "audio.py", [(MEASURE_OLD, MEASURE_NEW)])
    for mod in ("render", "audio"): sys.modules.pop(mod, None)
    import render, audio
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b, pg, cdp, cfg = render.open_page(p, 0.25)
        cues = pg.evaluate("window.SFX"); b.close()
    (d / "out" / "cues.json").write_text(json.dumps({"config": cfg, "cues": cues}, ensure_ascii=False, indent=1), encoding="utf-8")
    wav = audio.build(d, cfg, cues)
    final, keep, tmp = d / "out" / "final.mp4", d / "out" / "final.pre-accents.mp4", d / "out" / "final.tmp.mp4"
    if not keep.exists(): shutil.copy2(final, keep)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(final), "-i", str(wav), "-map", "0:v", "-map", "1:a", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", str(tmp)], check=True)
    tmp.replace(final); print(n, "accents", cfg["music"]["accents"])
