/* ==========================================================================
   A real page, measured once, marked against a real answer.

   geometry.test.mjs pins the arithmetic with boxes laid out by hand: clean
   rows, even spacing, one glyph per box. This one pins it against what an OCR
   engine ACTUALLY returns for a photographed chord sheet, which is none of
   those things. The same glyph twice. A tick stuck to a chord. A rule down the
   margin. Rows a third of a line apart. Every one of those was a real bug and
   every one of them is in this file's fixture.

   The two files beside it are:

     ayala-boxes.json   what Google returned for one page of a songbook, after
                        the browser cropped it to the writing, took the colour
                        out and sent it at 2700 pixels. Kept rather than
                        fetched, so this costs nothing and never varies.

     ayala.txt          the same song after a person corrected it against the
                        paper. The only ground truth this task has.

   THE NUMBER BELOW IS A FLOOR AND NOT A TARGET. It is here so that a change to
   the arithmetic cannot quietly lose chords on a real page, which is the way
   every failure in this reader has looked: nothing throws, nothing is empty,
   there are simply fewer symbols than the sheet has, and a song with fewer
   chords reads exactly like a song that had fewer.
   ========================================================================== */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { songFrom, directionOf } from "../src/geometry.js";
import { writeLine } from "../src/transcribe.js";
import { score } from "./score.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const boxes = JSON.parse(readFileSync(join(here, "fixtures/ayala-boxes.json"), "utf8"));
const reference = readFileSync(join(here, "fixtures/ayala.txt"), "utf8");

/* What the arithmetic managed when this was measured. One chord short of
   everything, and that one is a disagreement about which syllable a chord is
   sung on rather than about where the symbol is printed: the G of line one is
   centred three pixels from the middle of the ק and the reference puts it two
   letters away, on the צ. */
const FLOOR = 0.9;

const dir = directionOf(boxes);
const song = songFrom(boxes, dir)
  .map((line) => writeLine(line.text, line.placed, line.trailing))
  .join("\n");

const tally = score(reference, song);

assert.equal(dir, "rtl", "a Hebrew sheet runs right to left");
assert.equal(
  tally.lyricsExact,
  tally.lines,
  `the words came back changed\n${song}`
);
assert.ok(
  tally.share >= FLOOR,
  `a real page scored ${Math.round(tally.share * 100)}%, under the ${FLOOR * 100}% floor\n` +
  tally.notes.map((note) => `  · ${note}`).join("\n") + `\n\n${song}`
);

console.log(`\n  ok   a real page: ${tally.lines}/${tally.lines} lines of words, ` +
  `${tally.right}/${tally.chords} chords (${Math.round(tally.share * 100)}%)\n\nall passed\n`);
