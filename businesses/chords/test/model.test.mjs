/* Exercises the pure model helpers straight out of the shipped app.js:
   the block between the "model" banner and the "rendering a line" banner has
   no DOM in it, so it can be evaluated on its own. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf("var RESERVED_SLUGS");
const end = src.indexOf("/* ------------------------------------------------------- rendering a line */");
if (start < 0 || end < 0) throw new Error("could not find the model block");

const block = src.slice(start, end);
const api = new Function(block + "\nreturn { slugify, transposeChord, remapChords, parsePasted, looksLikeChord };")();

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* --- slug --- */
eq("hebrew spaces to underscores", api.slugify("שיר של יום"), "שיר_של_יום");
eq("english", api.slugify("Hey  Jude!"), "Hey_Jude");
eq("punctuation dropped, dash kept", api.slugify('אמא, "אני" בבית-ספר'), "אמא_אני_בבית-ספר");
eq("reserved word escaped", api.slugify("new"), "new_");
eq("nothing left falls back", api.slugify("!!!"), "שיר");

/* --- transpose --- */
eq("up two", api.transposeChord("Am", 2), "Bm");
eq("wraps", api.transposeChord("B", 1), "C");
eq("keeps the suffix", api.transposeChord("F#m7", 1), "Gm7");
eq("slash bass moves too", api.transposeChord("G/B", 2), "A/C#");
eq("flat spelling is kept flat", api.transposeChord("Bb", 2), "C");
eq("down", api.transposeChord("C", -1), "B");
eq("zero is identity", api.transposeChord("Cmaj7", 0), "Cmaj7");
eq("not a chord, untouched", api.transposeChord("N.C.", 3), "N.C.");

/* --- remap on a text edit --- */
const ch = [{ pos: 0, chord: "Am" }, { pos: 4, chord: "F" }, { pos: 9, chord: "G" }];
eq("insert before everything shifts all",
  api.remapChords("אני שר לך", "או אני שר לך", ch.slice(0, 2)),
  [{ pos: 0, chord: "Am" }, { pos: 7, chord: "F" }]);
eq("append at the end moves nothing",
  api.remapChords("אני שר", "אני שר לך", [{ pos: 0, chord: "Am" }, { pos: 4, chord: "F" }]),
  [{ pos: 0, chord: "Am" }, { pos: 4, chord: "F" }]);
/* "שר" is deleted, so the chord that sat on it has no syllable left. It lands
   on the seam between what survived on each side, index 4 of "אני לך", which
   is the ל: the first character after the common prefix "אני ". */
eq("a chord whose word was deleted lands on the seam",
  api.remapChords("אני שר לך", "אני לך", ch.slice(0, 2)),
  [{ pos: 0, chord: "Am" }, { pos: 4, chord: "F" }]);

/* the chord that survives the same edit keeps its syllable */
eq("a chord after the change keeps its syllable",
  api.remapChords("אני שר לך", "אני לך", [{ pos: 7, chord: "G" }]),
  [{ pos: 4, chord: "G" }]);
eq("clearing the line clamps everything to zero",
  api.remapChords("אני שר לך", "", ch),
  [{ pos: 0, chord: "Am" }, { pos: 0, chord: "F" }, { pos: 0, chord: "G" }]);

/* --- pasted text --- */
const pasted = [
  "פזמון",
  "Am        F",
  "אני שר לך שיר",
  "",
  "C  G",
].join("\n");

eq("section, chord line over its lyric line, blank, chord-only line",
  api.parsePasted(pasted),
  [
    { type: "section", text: "פזמון", chords: [] },
    { type: "line", text: "אני שר לך שיר", chords: [{ pos: 0, chord: "Am" }, { pos: 10, chord: "F" }] },
    { type: "line", text: "", chords: [] },
    { type: "line", text: "    ", chords: [{ pos: 0, chord: "C" }, { pos: 3, chord: "G" }] },
  ]);

eq("a lyric line that happens to start with a capital is not a chord line",
  api.parsePasted("Baby you're a firework").map((l) => l.chords.length),
  [0]);

eq("chord recognition", [
  api.looksLikeChord("Am"), api.looksLikeChord("F#m7"), api.looksLikeChord("G/B"),
  api.looksLikeChord("Csus4"), api.looksLikeChord("שיר"), api.looksLikeChord("Hello"),
], [true, true, true, true, false, false]);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
