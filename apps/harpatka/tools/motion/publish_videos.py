"""Publish ad videos with the invitation cover as the very first frame (the preview WhatsApp and Facebook show).
usage: python tools/motion/publish_videos.py [--publish] [--local] 1 2 5-9 ...   (ad numbers; default: all in videos.json)
- frame 0 = <motion>/covers/ad-XX.png ("הזמנה", "ומה אם" and a short teaser), the rest of <motion>/ad-XX/out/final.mp4 untouched (same length, same audio)
- file name ad-XX-<content hash>.mp4 in paths.VIDEO (HARPATKA_MEDIA_OUT/video), so a new version never hides behind a cache; the old local file is removed
  (the store keeps the old one until it is trashed from the ads page)
- videos.json is paths.DATA/videos.json (public/ads/_data)
- at the end publish.py prints the upload plan for the new videos and videos.json; --publish uploads (only on the owner's word),
  --local skips the plan (render_seq.py publishes the whole batch at its end)"""
import hashlib, subprocess, sys, tempfile, os
from pathlib import Path
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P, publish

SEND = publish.take_flag("--publish"); LOCAL = publish.take_flag("--local")
VID = P.VIDEO; VID.mkdir(parents=True, exist_ok=True)
FF = "ffmpeg"


def frame0(path):
    raw = subprocess.run([FF, "-v", "error", "-i", str(path), "-frames:v", "1", "-vf", "scale=270:480", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).astype(float)


def png_small(path):
    raw = subprocess.run([FF, "-v", "error", "-i", str(path), "-vf", "scale=270:480", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).astype(float)


videos = P.read_json("videos.json", {})
todo = publish.nums(sys.argv[1:]) or sorted(int(k) for k in videos)
done = []
for n in todo:
    src = P.MOTION / f"ad-{n:02d}" / "out" / "final.mp4"; img = P.MOTION / "covers" / f"ad-{n:02d}.png"   # the invitation cover (make_covers.py)
    tmp = Path(tempfile.gettempdir()) / f"pub-{n:02d}.mp4"
    cmd = [FF, "-v", "error", "-y", "-i", str(src), "-i", str(img), "-filter_complex",
           "[1:v]format=yuv420p[im];[0:v][im]overlay=0:0:enable='eq(n,0)'[v]", "-map", "[v]", "-map", "0:a",
           "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-tune", "animation", "-pix_fmt", "yuv420p",
           "-c:a", "copy", "-movflags", "+faststart", str(tmp)]
    subprocess.run(cmd, check=True)
    # checks: frame 0 is the image, frame 1 is the animation again, same duration
    diff0 = np.abs(frame0(tmp) - png_small(img)).mean()
    dur = lambda p: float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(p)], capture_output=True, text=True).stdout)
    assert diff0 < 6, (n, "first frame is not the image", diff0)
    assert abs(dur(tmp) - dur(src)) < 0.05, (n, "duration changed")
    h = hashlib.sha1(tmp.read_bytes()).hexdigest()[:8]
    name = f"ad-{n:02d}-{h}.mp4"
    videos = P.read_json("videos.json", {})   # read again: another publish may have finished during the encode
    old = videos.get(str(n))
    os.replace(tmp, VID / name)
    if old and old != name and (VID / old).exists(): (VID / old).unlink()
    videos[str(n)] = name
    P.write_json("videos.json", dict(sorted(videos.items(), key=lambda kv: int(kv[0]))), newline=True)
    done.append(n)
    print(f"ad {n:2d}: {name}  first frame = image (diff {diff0:.1f})", flush=True)

if done and not LOCAL:
    publish.run([publish.ad_video(n) for n in done] + [publish.data("videos.json")], publish=SEND, label="publish_videos")
