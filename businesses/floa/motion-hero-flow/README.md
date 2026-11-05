# FLOA hero film (wide)

The film that leads the homepage opening, 30 seconds in a loop, silent: the mess of a business
becomes one flow, through advice, websites and landing pages, apps, automations and AI. Built with
the `motion-studio` skill. `scene.js` is the animation, `index.html` holds its settings (size,
length, palette).

- **The mark stays.** FLOA's symbol and its word are fixed at the top for the whole film, and they
  move all the time: the arms of the F, the foot of the L, the water in the O and the bar of the A
  keep waving, ten cycles over the loop so it closes. It is the same F as the site's icon
  (`scripts/gen_favicon.py`) and the same word as the site's header and footer.
- **It says what FLOA is** in the middle at the open and at the close: "ייעוץ, פיתוח וליווי", then
  what is built. That first frame is also the poster.
- **The pace.** The script is 18.4 s long and is played on a 30 s clock: every scene runs slower, and
  after the last thing that happens in a scene the clock waits (`HOLDS`) so the words can be read.
  Add a scene by adding a hold after it.
- **No chips.** Small tags are a word with a short wave under it (`TAG`), never a filled pill.
- **The wind** behind everything is dashes on waves, each travelling a whole number of periods over
  the loop. The video's edges dissolve into the page (a mask in `businesses/floa/theme.css`), so it has
  no box.

This is the DESKTOP film (1640x940). The phone has its own, drawn for a tall frame so the words in it
stay readable: `../motion-hero-flow-mobile/` (same story, same times, same words).

To render it again:

1. Copy `engine/core.js`, `render.py`, `audio.py` and `fonts/` from
   `~/.claude/skills/motion-studio/assets/` into this folder.
2. `"$PY" render.py check` (`$PY` is `~/.motion-studio/venv/Scripts/python.exe`).
3. `NOAUDIO=1 "$PY" render.py full` writes `out/final.mp4` (silent, 60 fps; about 5 minutes).
4. The web copy is the same film at 30 fps, about 1 MB:
   `ffmpeg -i out/final.mp4 -vf fps=30,format=yuv420p -c:v libx264 -preset slow -crf 28 -profile:v high -movflags +faststart -an ../public/assets/hero-flow.mp4`
5. The poster is its first frame, as `../public/assets/hero-flow-poster.webp`.

The palette is FLOA's water (blue `#1B74B3`, clay `#C1594A` for what hurts). If it changes in
`businesses/floa/theme.css`, change it in `index.html` here and in the mobile folder, and render again.
