/* ==========================================================================
   Running the arithmetic over a page that was measured once.

       node worker/test/try.mjs <boxes.json> <reference.txt>

   Measuring costs a fifth of a cent and a network call; everything after it is
   arithmetic on a list of rectangles. So the rectangles are pulled out once and
   kept, and every version of the arithmetic is tried against the same page and
   marked against the same hand-corrected song. Nothing here spends anything.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { songFrom, directionOf, rowsOf, layout, tokensOf, isChord, nameOf } from "../src/geometry.js";
import { writeLine } from "../src/transcribe.js";
import { report } from "./score.mjs";

const boxes = JSON.parse(readFileSync(process.argv[2], "utf8"));
const reference = readFileSync(process.argv[3], "utf8");

const dir = directionOf(boxes);

/* what the page looks like once it has been cut into rows, before anything is
   decided about it */
if (process.argv.includes("--rows")) {
  const rows = rowsOf(boxes);
  console.log(`${boxes.length} boxes, ${rows.length} rows, ${dir}\n`);
  rows.forEach((row, index) => {
    const laid = layout(row, dir !== "ltr");
    const tokens = tokensOf(laid);
    const chords = tokens.filter((token) => isChord(token.text));
    console.log(
      `${String(index).padStart(2)} y=${String(Math.round(row.middle)).padStart(4)} h=${String(Math.round(row.height)).padStart(3)}` +
      ` ${String(chords.length).padStart(2)}/${String(tokens.length).padStart(2)} chords  ${laid.text}`
    );
  });
  console.log();
}

const notes = [];
const lines = songFrom(boxes, dir, notes);
const song = lines.map((line) => writeLine(line.text, line.placed, line.trailing)).join("\n");

console.log(song);
if (process.argv.includes("--notes")) notes.forEach((note) => console.log(`  ${note}`));

const tally = report("measured", reference, song);
if (process.argv.includes("--why")) tally.notes.forEach((note) => console.log(`  · ${note}`));
