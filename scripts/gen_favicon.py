"""
Generate the site's real icon files.

The favicon used to be an inline data: URI in the <head>. Browsers accept that;
crawlers largely do not. Google's search-result favicon and WhatsApp's link
preview both fetch a FILE, so a data: URI meant the site had no icon anywhere it
actually mattered.

THE MARK. Not a letter. FLOA's hero diagram already ends in one: the hub every
wire runs into, the point where the scattered tools become one system. That is
the business, drawn — so the icon is that glyph, in the brand teal, and it means
something at 16px in a browser tab in a way an "F" never did.

Writes, at the site root (where crawlers look for them by convention):
    favicon.ico            16 + 32 + 48, the one Google fetches
    favicon.svg            crisp at any size, for browsers that take it
    apple-touch-icon.png   180x180, iOS home screen and some crawlers

Run:  python scripts/gen_favicon.py
"""
from PIL import Image, ImageDraw
import io
import os

TEAL = (14, 140, 126)          # --teal in src/design/tokens.css
WHITE = (255, 255, 255)
S = 512                        # master; everything below is downscaled from it
RADIUS = round(S * 0.24)

ROOT = os.path.join(os.path.dirname(__file__), "..")

# The hub glyph, at 512: a trunk on the right that forks into two nodes on the
# left. Same shape as the hub in the hero diagram (hero-system.js), scaled up and
# thickened, because a hairline that reads at 90px vanishes at 16.
HUB = round(S * 0.38), round(S * 0.50)      # the junction
UP = round(S * 0.66), round(S * 0.29)
DOWN = round(S * 0.66), round(S * 0.71)
TAIL = round(S * 0.20), round(S * 0.50)     # where the wire comes in

# Sized for 16px first, not for 512. At tab size the glyph is ~14 device pixels
# across: a wire thinner than one of them simply greys out. So the strokes are
# heavy and the nodes are fat, which costs nothing at any larger size.
STROKE = round(S * 0.085)
R_HUB = round(S * 0.105)
R_NODE = round(S * 0.088)


def dot(d, xy, r):
    d.ellipse([xy[0] - r, xy[1] - r, xy[0] + r, xy[1] + r], fill=WHITE)


def master():
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=RADIUS, fill=TEAL)

    for end in (TAIL, UP, DOWN):
        d.line([HUB, end], fill=WHITE, width=STROKE)

    dot(d, HUB, R_HUB)
    dot(d, UP, R_NODE)
    dot(d, DOWN, R_NODE)
    return img


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="24" fill="#0E8C7E"/>
  <g stroke="#fff" stroke-width="8.5" stroke-linecap="round" fill="none">
    <path d="M38 50H20"/>
    <path d="M38 50 66 29"/>
    <path d="M38 50 66 71"/>
  </g>
  <g fill="#fff">
    <circle cx="38" cy="50" r="10.5"/>
    <circle cx="66" cy="29" r="8.8"/>
    <circle cx="66" cy="71" r="8.8"/>
  </g>
</svg>
"""


def main():
    m = master()

    ico = os.path.join(ROOT, "favicon.ico")
    m.save(ico, sizes=[(16, 16), (32, 32), (48, 48)])

    # iOS adds no rounding of its own, and a PNG with alpha corners shows them
    # as black — so flatten onto the teal rather than ship transparency.
    touch = os.path.join(ROOT, "apple-touch-icon.png")
    flat = Image.new("RGB", (S, S), TEAL)
    flat.paste(m, (0, 0), m)
    flat.resize((180, 180), Image.LANCZOS).save(touch, "PNG")

    svg = os.path.join(ROOT, "favicon.svg")
    io.open(svg, "w", encoding="utf-8", newline="\n").write(SVG)

    # what it will actually look like in a tab
    m.resize((16, 16), Image.LANCZOS).resize((128, 128), Image.NEAREST).save(
        os.path.join(ROOT, "scripts", "_favicon-16-preview.png"))

    for p in (ico, touch, svg):
        print(f"  wrote {os.path.relpath(p, ROOT)}  {os.path.getsize(p)} bytes")


if __name__ == "__main__":
    main()
