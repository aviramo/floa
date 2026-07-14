"""
Generate the site's real icon files.

The favicon used to be an inline data: URI in the <head>. Browsers accept that;
crawlers largely do not. Google's search-result favicon and WhatsApp's link
preview both fetch a FILE, so a data: URI meant the site had no icon anywhere it
actually mattered.

THE MARK. Not a letter, and not a share glyph. FLOA is flow — so the mark is
flow: two currents, moving. The upper one is the brighter, the lower one trails
it, and both run the same direction, which is what a current looks like when you
draw it with two strokes instead of one.

It is designed for 16px FIRST. At tab size the glyph is about 14 device pixels
across, so the strokes are heavy, the waves are shallow (a deep wave folds into
mush at that size) and there is nothing else in the square. Everything larger
comes free.

Writes, at the site root (where crawlers look for them by convention):
    favicon.ico            16 + 32 + 48, the one Google fetches
    favicon.svg            crisp at any size, for browsers that take it
    apple-touch-icon.png   180x180, iOS home screen and some crawlers

Run:  python scripts/gen_favicon.py
"""
from PIL import Image, ImageDraw
import io
import math
import os

TEAL = (14, 140, 126)          # --teal in src/design/tokens.css
WHITE = (255, 255, 255)
WASH = (255, 255, 255, 190)    # the trailing current, a step back but
                               # still legible at 16px, where .6 alpha washes out
S = 512                        # master; everything below is downscaled from it
RADIUS = round(S * 0.24)

ROOT = os.path.join(os.path.dirname(__file__), "..")

# The icons are files of the business, not of the build: they live in its public/
# folder and are copied into its site verbatim.
PUBLIC = os.path.join(ROOT, "businesses", "floa", "public")


SS = 4          # supersample. PIL fills polygons with NO anti-aliasing, so the
                # smooth edge has to come from drawing big and shrinking down.


def stroke(d, cy, amp, width, colour, u):
    """One current, as a filled outline rather than a thick polyline.

    PIL's thick lines join badly — `joint="curve"` leaves a visibly frayed edge
    along a curve like this one. So the stroke is built the way a vector renderer
    builds it: walk the centreline, offset it by half the width along the normal
    at each step, and fill the band between the two offsets. Round caps are two
    circles on the ends.
    """
    x0, x1 = S * 0.17 * u, S * 0.83 * u
    n = 240
    mid = []
    for i in range(n + 1):
        t = i / n
        mid.append((x0 + (x1 - x0) * t, cy * u + amp * u * math.sin(2 * math.pi * t)))

    r = width * u / 2
    left, right = [], []
    for i, (x, y) in enumerate(mid):
        # the tangent, from the neighbours (one-sided at the two ends)
        px, py = mid[max(i - 1, 0)]
        nx, ny = mid[min(i + 1, n)]
        tx, ty = nx - px, ny - py
        length = math.hypot(tx, ty) or 1
        ox, oy = -ty / length * r, tx / length * r     # the normal
        left.append((x + ox, y + oy))
        right.append((x - ox, y - oy))

    d.polygon(left + right[::-1], fill=colour)
    for x, y in (mid[0], mid[-1]):
        d.ellipse([x - r, y - r, x + r, y + r], fill=colour)


def master():
    u = SS
    big = Image.new("RGBA", (S * u, S * u), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    d.rounded_rectangle([0, 0, S * u - 1, S * u - 1], radius=RADIUS * u, fill=TEAL)

    # on its own layer, so the trailing current stays translucent over the teal
    # instead of the two strokes darkening each other where they run closest
    layer = Image.new("RGBA", big.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    stroke(ld, S * 0.635, S * 0.085, S * 0.10, WASH, u)     # the current behind
    stroke(ld, S * 0.395, S * 0.095, S * 0.115, WHITE, u)   # the one leading
    big.alpha_composite(layer)

    return big.resize((S, S), Image.LANCZOS)


# The same two currents, as vectors. Kept in step with the raster above by hand;
# they are four numbers, and an SVG that disagreed with the .ico would be worse
# than either.
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="24" fill="#0E8C7E"/>
  <g fill="none" stroke="#fff" stroke-linecap="round">
    <path d="M17 63q16.5-17 33 0t33 0" stroke-width="10" opacity=".75"/>
    <path d="M17 40q16.5-19 33 0t33 0" stroke-width="11.5"/>
  </g>
</svg>
"""


def main():
    m = master()

    ico = os.path.join(PUBLIC, "favicon.ico")
    m.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])

    # iOS adds no rounding of its own, and a PNG with alpha corners shows them as
    # black — so flatten onto the teal rather than ship transparency.
    touch = os.path.join(PUBLIC, "apple-touch-icon.png")
    flat = Image.new("RGB", (S, S), TEAL)
    flat.paste(m, (0, 0), m)
    flat.resize((180, 180), Image.LANCZOS).save(touch, "PNG")

    svg = os.path.join(PUBLIC, "favicon.svg")
    io.open(svg, "w", encoding="utf-8", newline="\n").write(SVG)

    # what it will actually look like in a tab, blown up so a human can judge it
    m.resize((16, 16), Image.LANCZOS).resize((128, 128), Image.NEAREST).save(
        os.path.join(ROOT, "scripts", "_favicon-16-preview.png"))

    for p in (ico, touch, svg):
        print(f"  wrote {os.path.relpath(p, ROOT)}  {os.path.getsize(p)} bytes")


if __name__ == "__main__":
    main()
