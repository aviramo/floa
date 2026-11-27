import numpy as np, subprocess, sys
path, d0, bar = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]); p = bar / 4; sr = 22050
x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "quiet", "-i", path, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout, np.float32).astype(np.float64)
X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr)
low = np.fft.irfft(X * (f < 150), len(x)); hi = np.fft.irfft(X * (f > 2000), len(x))
env = np.convolve(np.abs(low), np.ones(220) / 220, "same"); on = np.maximum(np.diff(env, prepend=0), 0)
db = lambda s: 20 * np.log10(np.sqrt((s ** 2).mean()) + 1e-9)
nb = int((len(x) / sr - d0) / bar)
def strength(t, w=0.03): a, b = int((t - w) * sr), int((t + w) * sr); return on[max(a, 0):b].max() if b > 0 else 0
s = [np.mean([strength(d0 + k * bar + ph * p) for k in range(nb)]) for ph in range(4)]
print("kick strength by beat 1..4:", [round(v / max(s), 2) for v in s])
ks = []
for k in range(2, nb - 1):
    t = d0 + k * bar; a, b = int((t - 0.06) * sr), int((t + 0.06) * sr); ks.append((a + np.argmax(on[a:b])) / sr - k * bar)
print("downbeat anchor estimates median:", round(float(np.median(ks)), 3))
print(" bar   time    rms   bright  bass")
for k in range(nb):
    a, b = int((d0 + k * bar) * sr), int((d0 + (k + 1) * bar) * sr)
    print(f"{k:4d} {d0 + k * bar:6.2f} {db(x[a:b]):6.1f} {db(hi[a:b]):6.1f} {db(low[a:b]):6.1f}")
