/* ==========================================================================
   The chords mark, as a bitmap.

   The app's icon is an SVG (businesses/chords/public/favicon.svg) and that is
   the icon on every browser tab. Two places cannot read it: an iPhone putting
   the app on a home screen and an Android doing the same both want a raster,
   and without one they take the DOMAIN's icon, so the songs app ends up
   wearing FLOA's mark on the one screen where it is the whole app.

   So the same mark is drawn here, from the same numbers, and written as a PNG.
   Drawn rather than converted because converting needs a rasteriser this repo
   does not have and the mark is four shapes: a stem, a beam, and two rings.

   FULL BLEED AND NO TRANSPARENCY, which is not how the SVG is drawn. iOS
   rounds a home screen icon itself and composites anything transparent onto
   black, so a rounded square with clear corners arrives with four black ones.
   The square is the whole canvas and the phone cuts the corners.

     node scripts/icon.mjs

   Writes businesses/chords/public/apple-touch-icon.png and prints the thing it
   drew, in characters, so that whoever ran it can see what came out.
   ========================================================================== */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const OUT = "businesses/chords/public/apple-touch-icon.png";
const SIZE = 180;

/* --- the mark, in the SVG's own hundred units ------------------------------
   favicon.svg draws the note in a group that is `translate(9.2 9.2) scale(3.4)`
   over a 24-unit icon, so every number below is that group's number put into
   the hundred: 9.2 + 3.4 * n. Two places holding one shape is how they come to
   disagree, so the arithmetic is written out rather than the answers. */
const at = (n) => 9.2 + 3.4 * n;
const TEAL = [0x0e, 0x8c, 0x7e];
const WHITE = [0xff, 0xff, 0xff];
/* the group's stroke-width, in the hundred */
const STROKE = 2.2 * 3.4;
const HALF = STROKE / 2;

/* M9 18 V6 L19 4 V12, which is the stem, the beam and the second stem */
const NOTE = [
  [at(9), at(18)],
  [at(9), at(6)],
  [at(19), at(4)],
  [at(19), at(12)],
];
/* the two note heads, which are rings and not discs (the SVG fills none) */
const HEADS = [
  { x: at(6.5), y: at(18), r: 2.5 * 3.4 },
  { x: at(16.5), y: at(16), r: 2.5 * 3.4 },
];

/* how far a point is from a segment, which is the whole of what a round-capped
   stroke is: within half a width of the line is ink */
function toSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

function isInk(x, y) {
  for (let i = 0; i < NOTE.length - 1; i++) {
    if (toSegment(x, y, NOTE[i], NOTE[i + 1]) <= HALF) return true;
  }
  return HEADS.some((h) => Math.abs(Math.hypot(x - h.x, y - h.y) - h.r) <= HALF);
}

/* --- and drawn with more samples than pixels ------------------------------
   A curve decided one sample per pixel is a curve with a staircase down it, at
   the size a home screen shows this. Four by four, and what comes out is how
   much of the pixel the ink covered. */
const OVER = 4;

function coverage(px, py) {
  let hit = 0;
  for (let sy = 0; sy < OVER; sy++) {
    for (let sx = 0; sx < OVER; sx++) {
      const x = ((px + (sx + 0.5) / OVER) / SIZE) * 100;
      const y = ((py + (sy + 0.5) / OVER) / SIZE) * 100;
      if (isInk(x, y)) hit++;
    }
  }
  return hit / (OVER * OVER);
}

const pixels = new Float32Array(SIZE * SIZE);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) pixels[y * SIZE + x] = coverage(x, y);
}

/* --- the file ------------------------------------------------------------- */
const CRC = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(kind, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(kind, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  /* eight bits a channel */
ihdr[9] = 2;  /* colour, no alpha: the square is the whole canvas */

/* one filter byte per row, and the filter is none: the picture is four shapes
   on one colour, so it deflates to nothing whatever the rows are compared to */
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
let at2 = 0;
for (let y = 0; y < SIZE; y++) {
  raw[at2++] = 0;
  for (let x = 0; x < SIZE; x++) {
    const ink = pixels[y * SIZE + x];
    for (let c = 0; c < 3; c++) {
      raw[at2++] = Math.round(TEAL[c] * (1 - ink) + WHITE[c] * ink);
    }
  }
}

writeFileSync(OUT, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]));

/* --- and what it looks like ------------------------------------------------
   A binary nobody can open is a binary nobody checked. */
const ROWS = 30, COLS = 30;
let art = "";
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = Math.floor(((c + 0.5) / COLS) * SIZE);
    const y = Math.floor(((r + 0.5) / ROWS) * SIZE);
    const ink = pixels[y * SIZE + x];
    art += ink > 0.6 ? "#" : ink > 0.15 ? "+" : ".";
  }
  art += "\n";
}
console.log(art);
console.log(OUT + ", " + SIZE + "x" + SIZE);
