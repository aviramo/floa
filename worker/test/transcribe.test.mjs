/* ==========================================================================
   Assembling a chord sheet from what the model reported.

   The model names, for each chord, a word and a letter. Everything after that
   is arithmetic, and it is the arithmetic that this file pins down, because
   both of the errors that survived four rounds of prompt work live here now:

     the ORDER, which is no longer anyone's judgement but a sort, and
     the LETTER, which is checked against the count that came with it.

   The lines below are from a real sheet, and the expected answers were read
   off the printed page by eye. That is the point: if the assembly ever stops
   agreeing with them, it has stopped agreeing with a piece of paper.
   ========================================================================== */

import assert from "node:assert/strict";
import { chordProLine, numbered, merge } from "../src/transcribe.js";

let passed = 0;
function check(what, got, want) {
  assert.equal(got, want, `${what}\n  got:  ${got}\n  want: ${want}`);
  passed++;
}

/* --- the reference line ---------------------------------------------------
   From the sheet of אילה. Five chords, four of them inside a word and none at
   the front of one, which is exactly the case every earlier design got wrong.

           G7    E         Am          G       C
     אילה מה לי ולה מה לי ולה מה לי ולה                                    */

const REFERENCE = {
  words: "אילה מה לי ולה מה לי ולה מה לי ולה",
  chords: [
    { chord: "C", word: 1, letter: "ל", letters_before: 2 },
    { chord: "G", word: 4, letter: "ל", letters_before: 1 },
    { chord: "Am", word: 7, letter: "ל", letters_before: 1 },
    { chord: "E", word: 10, letter: "ל", letters_before: 1 },
    { chord: "G7", word: 0, letter: "", letters_before: 0 },
  ],
};

const REFERENCE_WANT = "אי[C]לה מה לי ו[G]לה מה לי ו[Am]לה מה לי ו[E]לה    [G7]";

check("the reference line", chordProLine(REFERENCE), REFERENCE_WANT);

/* THE ORDER IS NOT TAKEN FROM THE MODEL. Latin symbols read left to right and
   Hebrew words read right to left, so the order the chords arrive in is
   frequently the reverse of the order they belong in. Reversing the array must
   change nothing at all. */
check(
  "the same line, chords listed backwards",
  chordProLine({ ...REFERENCE, chords: REFERENCE.chords.slice().reverse() }),
  REFERENCE_WANT
);

check(
  "the same line, chords listed in an order of nobody's",
  chordProLine({ ...REFERENCE, chords: [REFERENCE.chords[2], REFERENCE.chords[0], REFERENCE.chords[4], REFERENCE.chords[3], REFERENCE.chords[1]] }),
  REFERENCE_WANT
);

/* --- the letter settles a disagreement ----------------------------------- */

check(
  "the letter wins over a count that contradicts it",
  chordProLine({ words: "בנקיק נסתר", chords: [{ chord: "Am", word: 1, letter: "ק", letters_before: 0 }] }),
  "בנ[Am]קיק נסתר"
);

/* בנקיק holds its ק twice, at 2 and at 4. A count of 4 is nearer the second,
   so the chord stays where the count put it rather than jumping to the front
   of the word: the letter corrects a count, it does not overrule one. */
check(
  "a repeated letter goes to the nearer of the two",
  chordProLine({ words: "בנקיק", chords: [{ chord: "Am", word: 1, letter: "ק", letters_before: 4 }] }),
  "בנקי[Am]ק"
);

/* A count exactly between the two, which no evidence can settle. The earlier
   one wins, and the only thing that matters about that is that it is always
   the same one. */
check(
  "a tie between two of the same letter takes the first",
  chordProLine({ words: "בנקיק", chords: [{ chord: "Am", word: 1, letter: "ק", letters_before: 3 }] }),
  "בנ[Am]קיק"
);

check(
  "a letter the word does not contain leaves the count alone",
  chordProLine({ words: "בנקיק", chords: [{ chord: "Am", word: 1, letter: "ש", letters_before: 2 }] }),
  "בנ[Am]קיק"
);

check(
  "no letter at all leaves the count alone",
  chordProLine({ words: "בנקיק", chords: [{ chord: "Am", word: 1, letter: "", letters_before: 2 }] }),
  "בנ[Am]קיק"
);

/* --- the edges ----------------------------------------------------------- */

check(
  "a count past the end of the word stops at its end",
  chordProLine({ words: "מים", chords: [{ chord: "F", word: 1, letter: "", letters_before: 99 }] }),
  "מים[F]"
);

check(
  "a word that is not there is treated as past the end",
  chordProLine({ words: "מים", chords: [{ chord: "F", word: 8, letter: "", letters_before: 0 }] }),
  "מים    [F]"
);

/* A run past the end of a line is ordered by DISTANCE from the words, never by
   the sequence it was reported in. A row of Latin symbols is read left to
   right and a Hebrew line runs right to left, so a sequence comes out
   backwards; "nearest the words" has no direction in it. */
const TURNAROUND = [
  { chord: "Am", word: 0, letter: "", letters_before: 0 },
  { chord: "F", word: 0, letter: "", letters_before: 1 },
  { chord: "G", word: 0, letter: "", letters_before: 2 },
];
const TURNAROUND_WANT = "נה נה נה...    [Am]    [F]    [G]";

check(
  "a run past the end goes out from the words",
  chordProLine({ words: "נה נה נה...", chords: TURNAROUND }),
  TURNAROUND_WANT
);

check(
  "the same run reported backwards comes out the same way",
  chordProLine({ words: "נה נה נה...", chords: TURNAROUND.slice().reverse() }),
  TURNAROUND_WANT
);

/* All at distance 0, which is a model that did not answer the question. The
   order it gave is all there is, so it is kept rather than shuffled. */
check(
  "with no distances given the reported order stands",
  chordProLine({
    words: "נה נה נה...",
    chords: [
      { chord: "Am", word: 0, letter: "", letters_before: 0 },
      { chord: "F", word: 0, letter: "", letters_before: 0 },
      { chord: "G", word: 0, letter: "", letters_before: 0 },
    ],
  }),
  TURNAROUND_WANT
);

check("a blank line stays blank", chordProLine({ words: "", chords: [] }), "");
check("a heading passes straight through", chordProLine({ words: "{פזמון}", chords: [] }), "{פזמון}");
check("words with no chords are just words", chordProLine({ words: "אלא מעיין חיי", chords: [] }), "אלא מעיין חיי");

check(
  "a nameless chord is dropped rather than written empty",
  chordProLine({ words: "מים", chords: [{ chord: "  ", word: 1, letter: "מ", letters_before: 0 }] }),
  "מים"
);

check(
  "two chords over the same letter both survive",
  chordProLine({
    words: "מים",
    chords: [
      { chord: "F", word: 1, letter: "י", letters_before: 1 },
      { chord: "C", word: 1, letter: "י", letters_before: 1 },
    ],
  }),
  "מ[F][C]ים"
);

/* An English sheet is the same code with nothing special about it, which is
   the claim worth checking: word 1 is the first word either way. */
check(
  "left to right needs no special case",
  chordProLine({
    words: "hello there world",
    chords: [
      { chord: "G", word: 3, letter: "r", letters_before: 2 },
      { chord: "C", word: 1, letter: "l", letters_before: 2 },
    ],
  }),
  "he[C]llo there wo[G]rld"
);

/* --- numbering the words for the second question -------------------------
   The read is asked in two halves, and this is the handover between them. The
   whole point of doing the counting here is that it cannot be miscounted, so
   an off-by-one in this function would move every chord in the song onto a
   neighbouring line with nothing looking broken. */

check(
  "a line is numbered, and so is every word in it",
  numbered(["אילה מה לי"]),
  "1: אילה מה לי\n   1=אילה 2=מה 3=לי"
);

/* A blank line keeps its number. Dropping it would renumber everything under
   it, which is the one mistake here that ruins a whole song at once. */
check(
  "a blank line keeps its number and takes no words",
  numbered(["מים", "", "נסתר"]),
  "1: מים\n   1=מים\n2:\n3: נסתר\n   1=נסתר"
);

check(
  "runs of spaces do not become words",
  numbered(["מה   לי    ולה"]),
  "1: מה   לי    ולה\n   1=מה 2=לי 3=ולה"
);

/* --- joining the two answers --------------------------------------------- */

const WORDS = { title: "אילה", lyrics_by: "", music_by: "", dir: "rtl" };
const LINES = ["מים", "", "נסתר"];

check(
  "a chord lands on the line it named",
  merge(WORDS, LINES, { lines: [{ line: 3, chords: [{ chord: "Am", word: 1, letter: "נ", letters_before: 0 }] }] })
    .lines.map((l) => l.chords.length).join(","),
  "0,0,1"
);

check(
  "a chord naming a line that is not there is dropped, not guessed at",
  merge(WORDS, LINES, { lines: [{ line: 9, chords: [{ chord: "Am", word: 1, letter: "", letters_before: 0 }] }] })
    .lines.map((l) => l.chords.length).join(","),
  "0,0,0"
);

check(
  "a line reported twice keeps both halves",
  merge(WORDS, LINES, {
    lines: [
      { line: 1, chords: [{ chord: "Am", word: 1, letter: "מ", letters_before: 0 }] },
      { line: 1, chords: [{ chord: "F", word: 1, letter: "ם", letters_before: 2 }] },
    ],
  }).lines[0].chords.length,
  2
);

check(
  "no chords at all still gives every line",
  merge(WORDS, LINES, { lines: [] }).lines.length,
  3
);

console.log(`transcribe: ${passed} checks passed`);
