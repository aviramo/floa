# FLOA hero film

The film beside the homepage opening: the mess of a business becomes one flow, through
advice, websites and landing pages, apps, automations and AI. Built with the
`motion-studio` skill. `scene.js` is the animation, `index.html` holds its settings
(size, length, colours).

To render it again:

1. Copy `engine/core.js`, `render.py`, `audio.py` and `fonts/` from
   `~/.claude/skills/motion-studio/assets/` into this folder.
2. `"$PY" render.py check` (`$PY` is `~/.motion-studio/venv/Scripts/python.exe`).
3. `NOAUDIO=1 "$PY" render.py full` writes `out/final.mp4` (silent, 60 fps).
4. The web copy is the same film at 30 fps, about 0.9 MB:
   `ffmpeg -i out/final.mp4 -vf fps=30,format=yuv420p -c:v libx264 -preset slow -crf 26 -profile:v high -movflags +faststart -an ../public/assets/hero-flow.mp4`
5. The poster is its first frame, as `../public/assets/hero-flow-poster.webp`.

The film's background is the site's paper colour (`#E9F0EE`), so it has no edge on the page.
If `--paper` in `src/design/tokens.css` changes, change `bg` here and render again.
