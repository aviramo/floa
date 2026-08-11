"""
The band at the head of the chords library, prepared from the illustration.

  python scripts/strip.py

Source:  businesses/chords/art/strip-source.png   (the illustration as drawn)
Output:  businesses/chords/public/assets/strip.webp  (what the page loads)

The source is kept in the repo and the output is committed beside it, because
the output is not a build product of the site: nothing in build.mjs makes it,
and the page would have no picture the day somebody had to make it again from
memory. This file is the memory.

THREE THINGS ARE DONE TO IT, and each one is a thing the page cannot do:

1. The microphone's sound waves come off. Three arcs beside her mouth are the
   mark a loudspeaker wears in every icon set there is, and beside a drawing
   whose subject is somebody making the sound they were a symbol laid over the
   thing itself. They are separated from her face and hand by one comparison:
   the arcs are cool pink, blue at least as strong as green, and skin is warm,
   green well above blue.

2. The white borders come off. The drawing sits on a band of its own colour
   with white above and below it, and white above and below is a border. A band
   that runs to both edges of the glass cannot have one: it would read as a
   picture stuck on the page rather than as the head of it.

3. It is given room above the heads, and it fades out below the feet. The band
   on a wide screen is a slice of a drawing nearly as tall as its people, so
   the slice has to be able to sit high without standing on anybody's hair.

   THE FADE IS TO NOTHING AND NOT TO WHITE. It was white first, and white is a
   colour: the page under it is a shade off white, so the picture ended in a
   pale band lying on a page that was not the same pale, which is the seam it
   was put there to avoid. Fading the alpha instead ends it in whatever the
   page happens to be, on any page it is ever put on.

The top edge of the result is one flat colour on purpose. The page paints the
strip behind the bar in that same value (see .strip in style.css), so the room
the bar takes is the drawing's own paper and the two meet with no seam. Change
the source and the value printed at the end of a run is the one to put there.
"""
import os
import statistics
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "businesses", "chords", "art", "strip-source.png")
OUT = os.path.join(ROOT, "businesses", "chords", "public", "assets", "strip.webp")

# Where the arcs are. A box rather than the whole picture, because the pink of
# the notes is the same pink and the notes are staying.
BOX = (872, 140, 1000, 258)
ROOM, FADE = 64, 120

im = Image.open(SRC).convert("RGB")
W, H = im.size
px = im.load()


def cool_pink(c):
    r, g, b = c
    return r - g > 10 and b - g >= -2 and r > 180


def warm_skin(c):
    r, g, b = c
    return g - b > 8


def row_bg(y):
    """What the background is on this row, read either side of the arcs."""
    xs = list(range(BOX[0] - 95, BOX[0] - 12)) + list(range(BOX[2] + 12, BOX[2] + 95))
    light = [px[x, y] for x in xs if 0 <= x < W]
    light = [c for c in light
             if min(c) > 225 and abs(c[0] - c[1]) < 12 and abs(c[1] - c[2]) < 12]
    if not light:
        return None
    return tuple(int(statistics.median(c[i] for c in light)) for i in range(3))


mask = set()
for y in range(BOX[1], BOX[3]):
    for x in range(BOX[0], BOX[2]):
        if cool_pink(px[x, y]):
            mask.add((x, y))

# the soft edge of each stroke goes with it, or it leaves a pink ghost
for _ in range(3):
    grow = set()
    for (x, y) in mask:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                grow.add((x + dx, y + dy))
    mask |= grow

painted = 0
for (x, y) in sorted(mask):
    if not (BOX[0] - 4 <= x < BOX[2] + 4 and BOX[1] - 4 <= y < BOX[3] + 4):
        continue
    c = px[x, y]
    # never her hand, never the microphone, never a stave line
    if warm_skin(c) or min(c) < 120 or c[1] - c[0] > 6:
        continue
    bg = row_bg(y)
    if bg:
        px[x, y] = bg
        painted += 1
print("waves: %d pixels painted out" % painted)


def banded(y):
    c = px[6, y]
    return c[1] - c[0] > 3


rows = [y for y in range(H) if banded(y)]
band = im.crop((0, rows[0], W, rows[-1] + 1))
bw, bh = band.size
print("band: rows %d..%d" % (rows[0], rows[-1]))


def edge_colour(row):
    line = [band.getpixel((x, row)) for x in range(0, bw, 3)]
    line = [c for c in line if min(c) > 215]
    return tuple(int(statistics.median(c[i] for c in line)) for i in range(3))


top_c, bot_c = edge_colour(2), edge_colour(bh - 3)

out = Image.new("RGBA", (bw, ROOM + bh + FADE), top_c + (255,))
out.paste(band.convert("RGBA"), (0, ROOM))
o = out.load()
for i in range(FADE):
    t = i / (FADE - 1.0)
    t = t * t * (3 - 2 * t)          # eased, so the fade has no edge of its own
    a = int(round(255 * (1 - t)))
    y = ROOM + bh + i
    for x in range(bw):
        o[x, y] = bot_c + (a,)

out.save(OUT, "WEBP", quality=90, method=6)
print("wrote %s  %dx%d  %d bytes" % (OUT, out.size[0], out.size[1], os.path.getsize(OUT)))
print("top edge colour for .strip in style.css: #%02x%02x%02x" % top_c)
