"""
Generate clean, abstract, brand-colored WebP illustrations for the FLOA
landing page. No text, no real logos, no photos of people.

Palette:
  cream bg   #F6FAF9
  teal       #0E8C7E   (deep turquoise-green, lead colour)
  teal dark  #0A6C61
  blue       #7FC5E4   (light blue, complementary)
  ink        #12303C   (dark blue-black)
"""
import math
from PIL import Image, ImageDraw, ImageFilter

S = 3  # supersampling factor for crisp anti-aliased edges

CREAM   = (246, 250, 249)
WHITE   = (255, 255, 255)
TEAL    = (14, 140, 126)
TEAL_D  = (10, 108, 97)
TEAL_L  = (198, 233, 228)
BLUE    = (127, 197, 228)
BLUE_L  = (214, 236, 246)
INK     = (18, 48, 60)
GREY    = (176, 194, 199)
GREY_L  = (223, 232, 233)


def canvas(w, h, bg=CREAM):
    img = Image.new("RGB", (w * S, h * S), bg)
    return img, ImageDraw.Draw(img)


def rr(d, box, radius, **kw):
    d.rounded_rectangle([c * S for c in box], radius=radius * S, **kw)


def line(d, pts, fill, width):
    d.line([(x * S, y * S) for x, y in pts], fill=fill, width=int(width * S),
           joint="curve")


def circle(d, cx, cy, r, **kw):
    d.ellipse([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], **kw)


def soft_shadow(img, box, radius, blur=14, alpha=32, offset=(0, 8)):
    """Draw a soft rounded shadow onto a fresh layer and composite."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    b = [(box[0] + offset[0]) * S, (box[1] + offset[1]) * S,
         (box[2] + offset[0]) * S, (box[3] + offset[1]) * S]
    ld.rounded_rectangle(b, radius=radius * S, fill=(18, 48, 60, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur * S / 3))
    img.paste(Image.new("RGB", img.size, (0, 0, 0)), (0, 0),
              Image.new("L", img.size, 0))  # no-op keep RGB
    base = img.convert("RGBA")
    base = Image.alpha_composite(base, layer)
    return base.convert("RGB")


def finish(img, name, w, h):
    img = img.resize((w, h), Image.LANCZOS)
    img.save(f"assets/{name}", "WEBP", quality=88, method=6)
    print("wrote", name)


# ---------------------------------------------------------------------------
# 1. hero-flow.webp  (4:3)  — a business system flowing into one hub
# ---------------------------------------------------------------------------
def hero():
    W, H = 800, 600
    img, d = canvas(W, H)

    # central hub
    hub = (330, 250, 470, 350)
    img = soft_shadow(img, hub, 26, blur=22, alpha=26, offset=(0, 12))
    d = ImageDraw.Draw(img)
    rr(d, hub, 26, fill=TEAL)
    # simple flow glyph inside hub (three merging dots -> one)
    circle(d, 360, 285, 7, fill=WHITE)
    circle(d, 360, 315, 7, fill=WHITE)
    line(d, [(370, 285), (400, 300)], WHITE, 4)
    line(d, [(370, 315), (400, 300)], WHITE, 4)
    line(d, [(400, 300), (440, 300)], WHITE, 4)
    circle(d, 445, 300, 8, fill=BLUE)

    # satellite cards: website, app(phone), whatsapp, leads, payments, data
    def card(box, r=18, fill=WHITE, outline=GREY_L):
        nonlocal img, d
        img = soft_shadow(img, box, r, blur=16, alpha=20, offset=(0, 8))
        d = ImageDraw.Draw(img)
        rr(d, box, r, fill=fill, outline=outline, width=1)

    # website (top-left) : browser bar + lines
    wb = (95, 70, 275, 190)
    card(wb)
    rr(d, (95, 70, 275, 100), 18, fill=BLUE_L)
    circle(d, 112, 85, 4, fill=BLUE); circle(d, 128, 85, 4, fill=TEAL_L); circle(d, 144, 85, 4, fill=GREY)
    rr(d, (112, 118, 200, 128), 5, fill=TEAL_L)
    rr(d, (112, 140, 258, 148), 4, fill=GREY_L)
    rr(d, (112, 158, 230, 166), 4, fill=GREY_L)

    # app phone (top-right)
    ph = (560, 55, 660, 235)
    card(ph, r=20)
    rr(d, (572, 78, 648, 212), 12, fill=BLUE_L)
    rr(d, (584, 92, 636, 120), 8, fill=TEAL)
    rr(d, (584, 132, 636, 142), 4, fill=WHITE)
    rr(d, (584, 152, 620, 162), 4, fill=WHITE)
    circle(d, 610, 224, 5, fill=GREY_L)

    # whatsapp bubble (right)
    wa = (620, 300, 730, 380)
    card(wa, r=22)
    circle(d, 675, 340, 26, fill=TEAL)
    # speech tail
    d.polygon([(660*S, 362*S), (655*S, 378*S), (676*S, 366*S)], fill=TEAL)
    rr(d, (663, 332, 688, 338), 3, fill=WHITE)
    rr(d, (663, 344, 682, 350), 3, fill=WHITE)

    # leads (bottom-left) : funnel-ish dots
    ld = (110, 420, 270, 530)
    card(ld)
    for i, x in enumerate((140, 168, 196, 224)):
        circle(d, x, 455, 8, fill=BLUE if i % 2 else TEAL_L)
    line(d, [(140, 480), (232, 480)], GREY_L, 3)
    rr(d, (150, 498, 232, 508), 5, fill=TEAL_L)

    # payments (bottom-right) : card glyph
    pm = (330, 430, 480, 540)
    card(pm)
    rr(d, (352, 452, 458, 518), 10, fill=TEAL_L)
    rr(d, (352, 466, 458, 480), 0, fill=TEAL)
    circle(d, 372, 500, 6, fill=WHITE)
    rr(d, (388, 498, 440, 504), 3, fill=WHITE)

    # connecting flow lines from hub to satellites (drawn under would be nicer,
    # but thin soft lines over cream read fine)
    conn = [
        [(300, 300), (250, 260), (200, 190)],       # website
        [(470, 290), (540, 240), (595, 235)],       # phone
        [(470, 320), (560, 340), (620, 340)],       # whatsapp
        [(345, 350), (280, 430), (200, 460)],       # leads
        [(400, 350), (405, 400), (405, 430)],       # payments
    ]
    for c in conn:
        line(d, c, TEAL_L, 3)
    for c in conn:
        circle(d, c[0][0], c[0][1], 4, fill=TEAL)

    finish(img, "hero-flow.webp", W, H)


# ---------------------------------------------------------------------------
# 2. process-before-after.webp  — chaos -> one clean flow
# ---------------------------------------------------------------------------
def before_after():
    W, H = 900, 560
    img, d = canvas(W, H)

    mid = 452
    # subtle divider
    line(d, [(mid, 70), (mid, 490)], GREY_L, 2)

    # LEFT: tangled scattered lines + loose nodes
    nodes = [(90, 140), (170, 90), (250, 180), (120, 260), (300, 120),
             (210, 300), (330, 250), (150, 360), (280, 380), (95, 430),
             (360, 340), (230, 440)]
    tangle = [(0, 4), (4, 2), (2, 6), (6, 1), (1, 3), (3, 5), (5, 7),
              (7, 10), (10, 8), (8, 11), (11, 9), (9, 3), (6, 8), (2, 5)]
    for a, b in tangle:
        line(d, [nodes[a], nodes[b]], GREY, 2)
    for i, (x, y) in enumerate(nodes):
        col = (BLUE, TEAL_L, GREY)[i % 3]
        circle(d, x, y, 9, fill=WHITE, outline=col, width=int(2))
        circle(d, x, y, 4, fill=col)

    # RIGHT: one clean ordered flow (aligned rounded cards on a straight spine)
    spine_x = 690
    ys = [130, 250, 370]
    line(d, [(spine_x, 110), (spine_x, 470)], TEAL_L, 4)
    cards = [(560, 105, 660, 165), (560, 225, 660, 285),
             (560, 345, 660, 405)]
    for i, box in enumerate(cards):
        img = soft_shadow(img, box, 16, blur=14, alpha=18, offset=(0, 6))
        d = ImageDraw.Draw(img)
        rr(d, box, 16, fill=WHITE, outline=GREY_L, width=1)
        rr(d, (box[0]+14, box[1]+18, box[0]+58, box[1]+26), 4, fill=TEAL_L)
        rr(d, (box[0]+14, box[1]+34, box[0]+80, box[1]+40), 4, fill=GREY_L)
        # node on spine
        circle(d, spine_x, ys[i], 10, fill=TEAL)
        circle(d, spine_x, ys[i], 4, fill=WHITE)
        line(d, [(660, ys[i]), (spine_x-10, ys[i])], TEAL_L, 3)

    # arrow bridging chaos -> order across the divider
    ay = 280
    line(d, [(400, ay), (505, ay)], TEAL, 5)
    d.polygon([(505*S, (ay-12)*S), (528*S, ay*S), (505*S, (ay+12)*S)],
              fill=TEAL)

    finish(img, "process-before-after.webp", W, H)


# ---------------------------------------------------------------------------
# 3. systems-devices.webp  — laptop + phone with clean UI, no readable text
# ---------------------------------------------------------------------------
def devices():
    W, H = 800, 600
    img, d = canvas(W, H)

    # laptop
    screen = (120, 120, 560, 420)
    img = soft_shadow(img, screen, 18, blur=22, alpha=24, offset=(0, 14))
    d = ImageDraw.Draw(img)
    rr(d, screen, 18, fill=INK)
    inner = (138, 138, 542, 402)
    rr(d, inner, 10, fill=WHITE)
    # dashboard UI: sidebar + header + chart + cards
    rr(d, (138, 138, 205, 402), 10, fill=BLUE_L)
    for i, y in enumerate(range(170, 360, 34)):
        rr(d, (155, y, 190, y + 10), 4, fill=TEAL if i == 0 else GREY_L)
    rr(d, (222, 156, 420, 168), 5, fill=TEAL_L)      # header title
    rr(d, (222, 186, 528, 262), 10, fill=CREAM, outline=GREY_L, width=1)
    # bar chart in the panel
    bx = 240
    for h, col in [(40, TEAL_L), (58, TEAL), (30, BLUE), (66, TEAL),
                   (48, BLUE), (72, TEAL_D)]:
        rr(d, (bx, 250 - h, bx + 22, 250), 4, fill=col)
        bx += 46
    # two stat cards
    rr(d, (222, 280, 370, 388), 10, fill=CREAM, outline=GREY_L, width=1)
    rr(d, (380, 280, 528, 388), 10, fill=CREAM, outline=GREY_L, width=1)
    circle(d, 250, 312, 12, fill=TEAL_L); rr(d, (272, 300, 350, 308), 4, fill=GREY_L)
    rr(d, (240, 330, 330, 344), 5, fill=TEAL); rr(d, (240, 356, 300, 364), 4, fill=GREY_L)
    circle(d, 408, 312, 12, fill=BLUE_L); rr(d, (430, 300, 508, 308), 4, fill=GREY_L)
    rr(d, (398, 330, 488, 344), 5, fill=BLUE); rr(d, (398, 356, 458, 364), 4, fill=GREY_L)
    # laptop base
    rr(d, (95, 420, 585, 442), 8, fill=(210, 220, 222))
    rr(d, (300, 420, 380, 428), 4, fill=GREY)

    # phone (overlapping, front-right)
    phone = (520, 250, 660, 520)
    img = soft_shadow(img, phone, 30, blur=24, alpha=30, offset=(-6, 16))
    d = ImageDraw.Draw(img)
    rr(d, phone, 30, fill=INK)
    pin = (532, 262, 648, 508)
    rr(d, pin, 22, fill=WHITE)
    # notch
    rr(d, (568, 268, 612, 278), 5, fill=INK)
    # app UI
    rr(d, (532, 288, 648, 360), 0, fill=TEAL)
    circle(d, 560, 322, 16, fill=WHITE)
    rr(d, (586, 312, 636, 320), 4, fill=BLUE_L)
    rr(d, (586, 330, 620, 337), 4, fill=TEAL_L)
    for y in (380, 424, 468):
        rr(d, (548, y, 632, y + 30), 10, fill=CREAM, outline=GREY_L, width=1)
        circle(d, 566, y + 15, 8, fill=TEAL_L)
        rr(d, (582, y + 8, 624, y + 15), 3, fill=GREY_L)
        rr(d, (582, y + 20, 606, y + 26), 3, fill=GREY_L)

    finish(img, "systems-devices.webp", W, H)


if __name__ == "__main__":
    hero()
    before_after()
    devices()
