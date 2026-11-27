"""Is a candidate song the same music as a used one (also another mix / instrumental version)?
Chroma (12 pitch classes) every 0.5 s, compared at the best time offset. Same song ~0.9+, different songs well below.
usage: python samesong.py used1.mp3 used2.mp3 ... -- cand1.mp3 cand2.mp3 ..."""
import subprocess, sys, os
import numpy as np

SR, HOP = 8000, 4000            # 0.5 s frames
NFFT = 8192


def chroma(path):
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                                     capture_output=True).stdout, np.float32).astype(float)
    f = np.fft.rfftfreq(NFFT, 1 / SR); ok = (f >= 60) & (f <= 2000)
    pc = (np.round(12 * np.log2(f[ok] / 440.0)) % 12).astype(int)
    win = np.hanning(NFFT); frames = []
    for i in range(0, len(x) - NFFT, HOP):
        S = np.abs(np.fft.rfft(x[i:i + NFFT] * win))[ok] ** 2
        c = np.bincount(pc, S, minlength=12); n = np.linalg.norm(c)
        frames.append(c / n if n > 0 else c)
    C = np.array(frames)
    loud = np.array([np.sqrt((x[i:i + NFFT] ** 2).mean()) for i in range(0, len(x) - NFFT, HOP)])
    return C[loud > 0.1 * np.median(loud)] if len(C) else C   # drop silence


def match(A, B, min_overlap=30):
    best = 0.0
    for lag in range(-(len(B) - min_overlap), len(A) - min_overlap + 1):
        a0, b0 = max(0, lag), max(0, -lag); n = min(len(A) - a0, len(B) - b0)
        if n < min_overlap: continue
        s = float((A[a0:a0 + n] * B[b0:b0 + n]).sum(1).mean())
        best = max(best, s)
    return best


k = sys.argv.index("--")
used, cands = sys.argv[1:k], sys.argv[k + 1:]
CH = {p: chroma(p) for p in used + cands}
name = lambda p: os.path.basename(os.path.dirname(p)) + "/" + os.path.basename(p) if "motion" in p.replace("\\", "/") else os.path.basename(p)[9:]
for i, c in enumerate(cands):
    rows = [(match(CH[c], CH[u]), name(u)) for u in used] + [(match(CH[c], CH[o]), name(o)) for o in cands[:i]]
    rows.sort(reverse=True)
    print(f"{name(c):55s} best: " + "  ".join(f"{n} {s:.2f}" for s, n in rows[:3]))
