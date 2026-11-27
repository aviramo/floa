"""per-bar map of a song: loudness, melody, air, bass, drum hits, and a combined energy score.
usage: python peakmap.py music.mp3 <first downbeat s> <bar s>"""
import subprocess, sys
import numpy as np

path, d0, bar = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
sr = 11025
x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                                 capture_output=True).stdout, np.float32).astype(float)
n = 1 << int(np.ceil(np.log2(len(x))))   # power-of-two FFT: fast
X = np.fft.rfft(x, n); f = np.fft.rfftfreq(n, 1 / sr)
band = lambda lo, hi: np.fft.irfft(X * ((f >= lo) & (f < hi)), n)[:len(x)]
mel, air, low = band(500, 4000), band(4000, 5500), band(20, 150)
db = lambda s: 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)


def hits(s, k):
    env = np.convolve(np.abs(s), np.ones(110) / 110, "same"); d = np.maximum(np.diff(env, prepend=0), 0)
    pk = (d > d.mean() + k * d.std()) & (np.roll(d, 1) <= d) & (np.roll(d, -1) < d)
    return np.where(pk)[0] / sr


kick = hits(low, 3.0)
rows = []
k = 0
while d0 + (k + 1) * bar <= len(x) / sr:
    a, b = d0 + k * bar, d0 + (k + 1) * bar; ia, ib = int(a * sr), int(b * sr)
    rows.append([k, a, db(x[ia:ib]), db(mel[ia:ib]), db(air[ia:ib]), db(low[ia:ib]), int(((kick >= a) & (kick < b)).sum())])
    k += 1
R = np.array([r[2:] for r in rows]); med = np.median(R, 0)
print(" bar   time   loud  melody  air   bass  kicks  energy")
for r, v in zip(rows, R):
    e = (v[1] - med[1]) + (v[2] - med[2]) + (v[3] - med[3]) + 0.3 * (v[4] - med[4])
    print(f"{r[0]:4d} {r[1]:6.1f} {v[0]:6.1f} {v[1] - med[1]:+6.1f} {v[2] - med[2]:+5.1f} {v[3] - med[3]:+5.1f} {int(v[4]):5d}  {'#' * max(0, int(round(e * 2 + 8)))}")
