# FLOA hero film (wide)

The film that leads the homepage opening: the mess of a business becomes one flow, through
advice, websites and landing pages, apps, automations and AI. It opens and closes on the one
sentence that says what FLOA is ("בונים לעסקים אתרים, אפליקציות ואוטומציות, עם AI"), and that
first frame is also the poster. Built with the `motion-studio` skill. `scene.js` is the
animation, `index.html` holds its settings (size, length, palette).

This is the DESKTOP film (1640x940). The phone has its own, drawn for a tall frame so the words
in it stay readable: `../motion-hero-flow-mobile/` (same story, same times, same words).

To render it again:

1. Copy `engine/core.js`, `render.py`, `audio.py` and `fonts/` from
   `~/.claude/skills/motion-studio/assets/` into this folder.
2. `"$PY" render.py check` (`$PY` is `~/.motion-studio/venv/Scripts/python.exe`).
3. `NOAUDIO=1 "$PY" render.py full` writes `out/final.mp4` (silent, 60 fps).
4. The web copy is the same film at 30 fps, under 1 MB:
   `ffmpeg -i out/final.mp4 -vf fps=30,format=yuv420p -c:v libx264 -preset slow -crf 26 -profile:v high -movflags +faststart -an ../public/assets/hero-flow.mp4`
5. The poster is its first frame, as `../public/assets/hero-flow-poster.webp`.

The palette is FLOA's water (blue `#1B74B3`, clay `#C1594A` for what hurts). If it changes in
`businesses/floa/theme.css`, change it in `index.html` here and in the mobile folder, and render again.
