"""
Build the CV's share image — the photograph a link to floa.co.il/me/cv/architect/
shows in a WhatsApp thread, on LinkedIn or in a feed.

It is derived, not authored: the source is the same photograph FLOA already
serves on its own site, so there is one picture of Ofir in this repo and not two
that drift apart. Two things change on the way out.

FORMAT. The site serves WebP because browsers decode it and it is a third of the
size. A social crawler is not a browser: several of them still fetch an og:image
and give up on WebP, and a card that silently loses its picture is worse than one
that never had it. So this writes JPEG.

SHAPE. Square, because the photograph is a portrait. A 2:1 card — which is what
twitter:card="summary_large_image" and the wide Facebook layouts crop to — would
take a band across the middle of a face. The document's meta therefore asks for
the small square card, and this supplies the square it wants.

Run:  python scripts/gen_cv_share.py     (after changing the source photograph)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "businesses/floa/public/assets/ofir.webp"
OUT = ROOT / "businesses/me/public/assets/ofir-aviram.jpg"

# 1200 on the side: above every platform's minimum, and still small enough that
# a crawler on a slow fetch does not time out on it.
SIZE = 1200

if not SRC.exists():
    raise SystemExit(f"gen_cv_share: no source photograph at {SRC}")

# Flatten first. If the source ever gains an alpha channel, JPEG has nowhere to
# put it and the transparent pixels come out black.
src = Image.open(SRC)
if src.mode in ("RGBA", "LA", "P"):
    flat = Image.new("RGB", src.size, (255, 255, 255))
    src = src.convert("RGBA")
    flat.paste(src, mask=src.split()[-1])
    src = flat
else:
    src = src.convert("RGB")

OUT.parent.mkdir(parents=True, exist_ok=True)
src.resize((SIZE, SIZE), Image.LANCZOS).save(
    OUT, "JPEG", quality=88, optimize=True, progressive=True
)

print(f"✓ {OUT.relative_to(ROOT).as_posix()}  {SIZE}x{SIZE}  {OUT.stat().st_size // 1024}KB")
