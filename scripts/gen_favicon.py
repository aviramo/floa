"""
Generate the site's real icon files.

The favicon used to be an inline data: URI in the <head>. Browsers accept that;
crawlers largely do not. Google's search-result favicon and WhatsApp's link
preview both fetch a FILE, so a data: URI meant the site had no icon anywhere it
actually mattered.

THE MARK. An F whose arms are currents. FLOA is flow, and the first letter of it
is drawn as flow: a firm stem, and two arms that are waves, the upper one longer
and brighter, the lower one shorter and a step back. It sits on water that is
lit from the corner: a diagonal from the light blue of the shallows to the deep
blue of the sea (the site's own --sea-light and --sea-deep).

It is designed for 16px FIRST. At tab size the glyph is about 14 device pixels
across, so the strokes are heavy (2px at 16), the waves are shallow (a deep wave
folds into mush at that size) and there is nothing else in the square. Everything
larger comes free.

Writes, at the root of the domain (where crawlers look for them by convention):
    favicon.ico            16 + 32 + 48, the one Google fetches
    favicon.svg            crisp at any size, for browsers that take it
    apple-touch-icon.png   180x180, iOS home screen and some crawlers

Run:  python scripts/gen_favicon.py
"""
from PIL import Image, ImageChops, ImageDraw
import io
import math
import os

LIGHT = (86, 180, 238)         # --sea-light, the shallows (a little lifted for 16px)
DEEP = (14, 74, 128)           # --sea-deep, the sea
WHITE = (255, 255, 255)
WASH = (255, 255, 255, 214)    # the lower arm: a step back, still legible at 16px
S = 512                        # master; everything below is downscaled from it
RADIUS = round(S * 0.24)
SS = 4                         # supersample: PIL fills polygons with NO anti-aliasing,
                               # so the smooth edge comes from drawing big and shrinking

ROOT = os.path.join(os.path.dirname(__file__), "..")
PUBLIC = os.path.join(ROOT, "businesses", "floa", "domain")

# The F, in master units. The stem is a straight stroke; each arm is one period of a
# sine that leaves the stem going UP, so the same four numbers draw the raster and the SVG.
STEM = dict(x=168, y0=128, y1=392, w=64)
ARMS = [dict(y=150, x1=352, amp=22, w=64, colour=WHITE),
        dict(y=276, x1=298, amp=18, w=64, colour=WASH)]


def band(d, pts, width, colour, u):
    """A thick line as a filled outline (walk the centreline, offset it along the
    normal, fill between the offsets), with round caps. PIL's own thick lines join
    badly along a curve."""
    r = width * u / 2
    left, right = [], []
    n = len(pts) - 1
    for i, (x, y) in enumerate(pts):
        px, py = pts[max(i - 1, 0)]
        nx, ny = pts[min(i + 1, n)]
        tx, ty = nx - px, ny - py
        length = math.hypot(tx, ty) or 1
        ox, oy = -ty / length * r, tx / length * r
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))
    d.polygon(left + right[::-1], fill=colour)
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=colour)


def arm_points(a, u):
    x0, n = STEM["x"], 240
    return [((x0 + (a["x1"] - x0) * i / n) * u, (a["y"] - a["amp"] * math.sin(2 * math.pi * i / n)) * u) for i in range(n + 1)]


def water(size):
    """Light in one corner, deep in the other."""
    v = Image.linear_gradient("L").resize((size, size))
    h = v.rotate(90)
    diag = ImageChops.add(h, v, scale=2)
    return Image.composite(Image.new("RGB", (size, size), DEEP), Image.new("RGB", (size, size), LIGHT), diag)


def master():
    u = SS
    size = S * u
    base = water(size).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=RADIUS * u, fill=255)
    big = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    big.paste(base, (0, 0), mask)

    # on its own layer, so the lower arm stays translucent over the water
    layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    band(ld, arm_points(ARMS[1], u), ARMS[1]["w"], ARMS[1]["colour"], u)
    band(ld, arm_points(ARMS[0], u), ARMS[0]["w"], ARMS[0]["colour"], u)
    band(ld, [(STEM["x"] * u, STEM["y0"] * u), (STEM["x"] * u, STEM["y1"] * u)], STEM["w"], WHITE, u)
    big.alpha_composite(layer)
    return big.resize((S, S), Image.LANCZOS)


# The same mark, as vectors. Each arm is two quadratic curves (one period of the same
# sine), so it matches the raster to within a pixel at any size.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="w" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#56B4EE"/>
      <stop offset="1" stop-color="#0E4A80"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="123" fill="url(#w)"/>
  <g fill="none" stroke="#fff" stroke-width="64" stroke-linecap="round">
    <path d="M168 276q32-36 64 0t64 0" opacity=".84"/>
    <path d="M168 150q46-44 92 0t92 0"/>
    <path d="M168 128V392"/>
  </g>
</svg>
"""


def main():
    m = master()

    ico = os.path.join(PUBLIC, "favicon.ico")
    m.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])

    # iOS adds no rounding of its own, and a PNG with alpha corners shows them as
    # black, so flatten onto the water's own deep end rather than ship transparency.
    touch = os.path.join(PUBLIC, "apple-touch-icon.png")
    flat = water(S)
    flat.paste(m, (0, 0), m)
    flat.resize((180, 180), Image.LANCZOS).save(touch, "PNG")

    svg = os.path.join(PUBLIC, "favicon.svg")
    io.open(svg, "w", encoding="utf-8", newline="\n").write(SVG)

    # what it will actually look like in a tab, blown up so a human can judge it
    m.resize((16, 16), Image.LANCZOS).resize((128, 128), Image.NEAREST).save(
        os.path.join(ROOT, "scripts", "_favicon-16-preview.png"))
    m.save(os.path.join(ROOT, "scripts", "_favicon-512-preview.png"))

    for p in (ico, touch, svg):
        print(f"  wrote {os.path.relpath(p, ROOT)}  {os.path.getsize(p)} bytes")


if __name__ == "__main__":
    main()
