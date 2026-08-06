/* ==========================================================================
   Turning measured boxes into a song.

   This is the half of the reader that has no model in it at all. Boxes go in,
   a song comes out, and everything between is arithmetic, so it can be pinned
   down exactly: the same boxes must always give the same song, and the boxes
   here are laid out the way the sheet of אילה is printed.

   The coordinates are invented, but the SHAPE is not. The first line is set up
   the way it actually sits on the page, with the Am over the ק of בנקיק, which
   is the one chord four rounds of prompt work never managed to place.
   ========================================================================== */

import assert from "node:assert/strict";
import { rowsOf, layout, directionOf, songFrom, isChord, nameOf } from "../src/geometry.js";
import { writeLine } from "../src/transcribe.js";

let passed = 0;
function check(what, got, want) {
  assert.deepEqual(got, want, `${what}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  passed++;
}

/* --- a Hebrew line, laid out right to left --------------------------------
   Every glyph 20 wide with 2 between them, words 24 apart, running leftwards
   from x=1000. So the first letter of the first word occupies 980..1000 and
   the numbers stay readable by hand. */
const GLYPH = 20;
const KERN = 2;
const WORD = 24;

function hebrewRow(text, y, height) {
  const boxes = [];
  let right = 1000;
  [...text].forEach((char) => {
    if (char === " ") { right -= WORD; return; }
    boxes.push({ text: char, x: right - GLYPH, y, w: GLYPH, h: height || 26 });
    right -= GLYPH + KERN;
  });
  return boxes;
}

/* Where a character of that row sits, by its index, so a chord can be put
   exactly over one and the test says which. */
function overChar(text, index, y) {
  const box = hebrewRow(text, y)[[...text].slice(0, index).filter((c) => c !== " ").length];
  return box.x + box.w / 2;
}

function chordBox(name, centre, y) {
  const w = name.length * 14;
  return { text: name, x: centre - w / 2, y, w, h: 20 };
}

/* --- what a chord is ------------------------------------------------------ */

check("plain chords pass", ["A", "Am", "F#m7", "G/B", "Cmaj7", "Bdim", "Dsus4", "G7"].every(isChord), true);
check("words do not", ["אילה", "the", "I", "H", "Amen", "Gk"].some(isChord), false);

/* The tick the sheet prints under a chord, in both the shapes OCR sends it
   back in: beside the symbol as punctuation, and on it as an accent. Neither
   is part of the name, and a chord that keeps one is dropped in silence. */
check("a tick beside it comes off", ["Am,", "G7.", "C'", "F ,"].map(nameOf), ["Am", "G7", "C", "F"]);
check("a tick on it comes off too", ["Ç", "Ģ", "Ẹm"].map(nameOf), ["C", "G", "Em"]);
check("and what is left still reads as a chord", ["Am,", "Ç", "G7."].every(isChord), true);
check("what a chord is spelt with stays", ["Bb", "C#", "G/B", "F#m7"].map(nameOf), ["Bb", "C#", "G/B", "F#m7"]);
check("the rule down the margin is not a chord", ["|", "...", "l"].some(isChord), false);

/* --- rows ----------------------------------------------------------------- */

{
  const boxes = [
    ...hebrewRow("שלום", 100),
    ...hebrewRow("עולם", 160),
    /* a glyph sitting a few pixels high, the way a photograph taken at an
       angle puts them: still the same row */
    { text: "!", x: 500, y: 163, w: 8, h: 26 },
  ];
  const rows = rowsOf(boxes);
  check("two printed lines are two rows", rows.length, 2);
  check("a glyph a little out of line stays on its row", rows[1].boxes.length, 5);
}

/* --- one row, read and spaced --------------------------------------------- */

{
  const text = "מה לי ולה";
  const laid = layout({ boxes: hebrewRow(text, 100) }, true);
  check("the row reads right to left, with its spaces", laid.text, text);
  check("every character knows where it was", laid.cells.length, text.length);
}

check("a Hebrew page runs right to left", directionOf(hebrewRow("שלום עולם", 0)), "rtl");
check("an English one does not", directionOf(hebrewRow("hello world", 0)), "ltr");

/* --- the reference line ---------------------------------------------------
   The first line of אילה. The Am is placed over the ק of בנקיק, which is the
   third letter, and nothing else in this file decides that: the box is put
   there and the arithmetic has to find it. */

const LINE_1 = "בנקיק נסתר בצוקים אילה שותה מים";

{
  const lyrics = hebrewRow(LINE_1, 200);
  const chords = [
    chordBox("Am", overChar(LINE_1, 2, 200), 160),    // the ק of בנקיק
    chordBox("G", overChar(LINE_1, 14, 200), 160),    // the ק of בצוקים
    chordBox("F", overChar(LINE_1, 20, 200), 160),    // the ל of אילה
    chordBox("Am", overChar(LINE_1, 29, 200), 160),   // the י of מים
  ];

  const song = songFrom([...lyrics, ...chords], "rtl");
  check("one line of words", song.length, 1);
  check(
    "every chord on the letter its middle is over",
    writeLine(song[0].text, song[0].placed, song[0].trailing),
    "בנק[Am]יק נסתר בצוק[G]ים איל[F]ה שותה מי[Am]ם"
  );
}

/* THE SAME BOXES IN ANY ORDER, because OCR hands them back in whatever order
   it found them and nothing downstream may depend on that. */
{
  const lyrics = hebrewRow(LINE_1, 200);
  const chords = [
    chordBox("Am", overChar(LINE_1, 29, 200), 160),
    chordBox("F", overChar(LINE_1, 20, 200), 160),
    chordBox("Am", overChar(LINE_1, 2, 200), 160),
    chordBox("G", overChar(LINE_1, 14, 200), 160),
  ];
  const song = songFrom([...chords, ...lyrics].reverse(), "rtl");
  check(
    "the order the boxes arrive in changes nothing",
    writeLine(song[0].text, song[0].placed, song[0].trailing),
    "בנק[Am]יק נסתר בצוק[G]ים איל[F]ה שותה מי[Am]ם"
  );
}

/* HALF A LETTER EITHER WAY, which is the whole of the accuracy this buys. A
   chord printed a little left of the ק is still on the ק, and one printed most
   of the way to the next letter is not. */
{
  const lyrics = hebrewRow(LINE_1, 200);
  const near = overChar(LINE_1, 2, 200) - 8;        // still nearest the ק
  const over = overChar(LINE_1, 2, 200) - 18;       // now nearest the י
  check(
    "a chord a few pixels off is on the same letter",
    writeLine(...(() => { const s = songFrom([...lyrics, chordBox("Am", near, 160)], "rtl")[0]; return [s.text, s.placed, s.trailing]; })()),
    "בנק[Am]יק נסתר בצוקים אילה שותה מים"
  );
  check(
    "a chord past the middle of the next one moves to it",
    writeLine(...(() => { const s = songFrom([...lyrics, chordBox("Am", over, 160)], "rtl")[0]; return [s.text, s.placed, s.trailing]; })()),
    "בנקי[Am]ק נסתר בצוקים אילה שותה מים"
  );
}

/* --- past the end of the line ---------------------------------------------
   A turnaround printed out beyond the words. These carry no place among the
   letters, only an order, and on a Hebrew line the one nearest the words is
   the RIGHTMOST of them. */
{
  const text = "נה נה נה...";
  const lyrics = hebrewRow(text, 300);
  const left = Math.min(...lyrics.map((box) => box.x));
  const chords = [
    chordBox("G", left - 260, 260),
    chordBox("F", left - 180, 260),
    chordBox("Am", left - 100, 260),
  ];
  const song = songFrom([...lyrics, ...chords], "rtl");
  check(
    "a run past the end keeps its printed order",
    writeLine(song[0].text, song[0].placed, song[0].trailing),
    "נה נה נה...    [Am]    [F]    [G]"
  );
}

/* --- a chord row belongs to the words under it, never over them ------------ */
{
  const boxes = [
    ...hebrewRow("שורה ראשונה", 100),
    /* between the two, and the two set a line apart rather than a verse apart:
       spread them and a blank line belongs between them, which is a different
       thing this file checks elsewhere */
    chordBox("C", overChar("שורה ראשונה", 1, 100), 124),
    ...hebrewRow("שורה שנייה", 140),
  ];
  const song = songFrom(boxes, "rtl");
  check("two lines and no verse break", song.length, 2);
  check("it goes to the line below", song[1].placed.length, 1);
  check("and not to the one above", song[0].placed.length, 0);
}

/* --- a row of words is not a row of chords --------------------------------
   One word on a lyric line can read as a chord symbol on its own. A row is
   only a chord row when most of it does. */
{
  const words = "שיר על G גדול";
  const boxes = [
    ...hebrewRow(words, 170),
    chordBox("Am", overChar(words, 1, 170), 120),
    chordBox("F", overChar(words, 5, 170), 120),
    chordBox("C", overChar(words, 11, 170), 120),
  ];
  const rows = rowsOf(boxes);
  check("both rows are found", rows.length, 2);
  const song = songFrom(boxes, "rtl");
  check("the row of symbols became chords, the row of words did not", song.length, 1);
  check("a lone chord-shaped word did not turn its line into chords", song[0].text, words);
  check("and the chords landed on the words below", song[0].placed.length, 3);
}

/* SYMBOL BY SYMBOL, which is how OCR usually reports. "Am" arrives as an "A"
   and an "m", and a lone "A" reads as a chord while "Am" reads as the one it
   is. The spaces between them are what says where one chord ends. */
{
  const words = hebrewRow("שלום עולם", 170);
  const boxes = [
    ...words,
    /* Am and G7, each split into its letters, printed over the two words */
    { text: "A", x: 960, y: 120, w: 14, h: 20 },
    { text: "m", x: 974, y: 120, w: 14, h: 20 },
    { text: "G", x: 840, y: 120, w: 14, h: 20 },
    { text: "7", x: 854, y: 120, w: 10, h: 20 },
  ];
  const song = songFrom(boxes, "rtl");
  check("split symbols are joined back into chords", song[0].placed.map((c) => c.name), ["Am", "G7"]);
}

console.log(`\n  ${passed} checks\n\nall passed\n`);
