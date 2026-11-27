"""Where should the invitation land in a song? Scores every beat as the card moment.

usage: python cardpoint.py <ad label> <music.mp3> <first downbeat s> <bar s> <card beat index> <current start s>
card beat index: T_CARD in video beats (T_CARD = idx * beat). The video is 15 s.

For each candidate beat t (card moment):  start S = t - idx * beat
  change : how different the 2 bars after t are from the 2 bars before (rhythm / texture / loudness), z units
  lift   : strength after minus strength before (a rise into the card)
  after  : mean strength from t to the end of the video (the invitation)
  cuts   : weakest single bar under the word cuts (S .. t - 1.6 s); a break there is what the user rejected
score = change + 0.5 * max(lift, 0) + after + 0.8 * min(cuts, 0)
"""
import subprocess, sys
import numpy as np

label, path, d0, bar, idx, cur = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), int(sys.argv[5]), float(sys.argv[6])
DUR, HOLD = 15.0, 1.6
p = bar / 4; card_t = idx * p
sr = 11025
x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                                 capture_output=True).stdout, np.float32).astype(float)
L = len(x) / sr
n = 1 << int(np.ceil(np.log2(len(x)))); X = np.fft.rfft(x, n); f = np.fft.rfftfreq(n, 1 / sr)
band = lambda lo, hi: np.fft.irfft(X * ((f >= lo) & (f < hi)), n)[:len(x)]
low, mid, air = band(20, 150), band(500, 4000), band(4000, 5500)


def onsets(s, k):
    env = np.convolve(np.abs(s), np.ones(110) / 110, "same"); d = np.maximum(np.diff(env, prepend=0), 0)
    pk = (d > d.mean() + k * d.std()) & (np.roll(d, 1) <= d) & (np.roll(d, -1) < d)
    return np.where(pk)[0] / sr


kick, hat = onsets(low, 3.0), onsets(air, 2.5)
db = lambda s: 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)
# per beat features, phase from the measured downbeat (extend backwards to 0)
b0 = d0 - p * np.floor(d0 / p)
T = np.arange(b0, L - p, p)
F = []
for t in T:
    a, b = int(t * sr), int((t + p) * sr)
    F.append([db(x[a:b]), db(low[a:b]), db(mid[a:b]), db(air[a:b]),
              ((kick >= t) & (kick < t + p)).sum(), ((hat >= t) & (hat < t + p)).sum()])
F = np.array(F); F[:, :4] = np.maximum(F[:, :4], np.percentile(F[:, :4], 2, axis=0))   # silence floor
Z = (F - F.mean(0)) / (F.std(0) + 1e-9)
strength = Z[:, 0] + Z[:, 1] + Z[:, 2] + 0.7 * Z[:, 4]
W = 8                                                  # 2 bars of 4 beats
bars = np.convolve(strength, np.ones(4) / 4, "valid")  # strength of every 4 beat window starting at beat i


def evaluate(i):
    if i < W or i + W > len(T): return None
    t = T[i]; S = t - card_t
    if S < 0 or S + DUR > L - 0.5: return None
    before, after_w = Z[i - W:i].mean(0), Z[i:i + W].mean(0)
    change = float(np.linalg.norm((after_w - before)[[0, 1, 2, 3, 4, 5]]))
    lift = float(strength[i:i + W].mean() - strength[i - W:i].mean())
    j_end = int(np.searchsorted(T, S + DUR)) - 1
    after = float(strength[i:j_end].mean())
    c0, c1 = int(np.searchsorted(T, S)), int(np.searchsorted(T, t - HOLD))
    cuts = float(bars[c0:max(c0 + 1, c1 - 3)].min()) if c1 - 3 > c0 else float(strength[c0:c1].mean())
    score = change + 0.5 * max(lift, 0) + after + 0.8 * min(cuts, 0)
    return dict(i=i, t=t, S=S, change=change, lift=lift, after=after, cuts=cuts, score=score)


import os
MINCUT = float(os.environ.get("MINCUT", "-99"))
res = [r for r in (evaluate(i) for i in range(len(T))) if r and r["cuts"] >= MINCUT]
res.sort(key=lambda r: -r["score"])
fmt = lambda r: (f"card at {r['t']:6.2f}s  start {r['S']:6.2f}s  change {r['change']:4.1f}  lift {r['lift']:+5.1f}  "
                 f"after {r['after']:+5.1f}  cuts {r['cuts']:+5.1f}  score {r['score']:5.2f}  (bar {(r['t'] - d0) / bar:+.2f})")
print(f"== {label}: card at video {card_t:.2f}s, beat {p:.4f}s, song {L:.1f}s")
ci = int(np.argmin(np.abs(T - (cur + card_t))))
c = evaluate(ci)
print("  now   ", fmt(c) if c else f"(current start {cur} not scorable)")
picked = []
for r in res:
    if all(abs(r["t"] - q["t"]) > 4 * p for q in picked):
        picked.append(r)
    if len(picked) == 5: break
for k, r in enumerate(picked):
    print(f"  top{k + 1}  ", fmt(r))
