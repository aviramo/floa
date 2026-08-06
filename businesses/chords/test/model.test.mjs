/* Exercises the pure model helpers straight out of the shipped app.js:
   the block between the "model" banner and the "rendering a line" banner has
   no DOM in it, so it can be evaluated on its own. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf("var RESERVED_SLUGS");
const end = src.indexOf("/* ------------------------------------------------------- rendering a line */");
if (start < 0 || end < 0) throw new Error("could not find the model block");

const block = src.slice(start, end);
const api = new Function(block + "\nreturn { slugify, transposeChord, remapChords, parsePasted, looksLikeChord, isChord, suggestChords, chordsUsed, easyVersion, toChordPro, fromChordPro, songToText, textToSong, normalizeLines, songDir, splitLine, joinLines, padTo, trimPadding };")();

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

/* --- how a song is written down --------------------------------------------
   Brackets in the words themselves, so the link between a chord and the
   syllable under it is not a number anybody has to keep true.

   A CHORD SITS ON A CHARACTER, and the bracket goes immediately AFTER it:

       ABC[Am]DEF     Am is on the C
       GHI [F]JKL     F is on the space

   Not on the seam between two characters. A printed sheet puts a symbol over a
   letter and marks that letter with a tick, so a position naming a gap was
   always describing the drawing rather than the song. */

eq("a chord goes right after the letter it sits on",
  api.toChordPro({ type: "line", text: "ABCDEF GHIJKL", chords: [{ pos: 2, chord: "Am" }, { pos: 6, chord: "F" }] }),
  "ABC[Am]DEF [F]GHIJKL");

eq("and comes back off it",
  api.fromChordPro("ABC[Am]DEF [F]GHIJKL"),
  { text: "ABCDEF GHIJKL", chords: [{ pos: 2, chord: "Am" }, { pos: 6, chord: "F" }] });

eq("a chord on the last letter of a word",
  api.toChordPro({ type: "line", text: "שלום לך אדוני", chords: [{ pos: 0, chord: "Am" }, { pos: 10, chord: "G" }] }),
  "ש[Am]לום לך אדו[G]ני");

eq("a chord over a space stays over that space",
  api.fromChordPro("שלום לך  [Am]      אדוני").chords, [{ pos: 8, chord: "Am" }]);

/* Nothing comes before the first character, so a bracket at the very start of
   a line lands on it: the nearest thing it can have meant. */
eq("a bracket with no character before it takes the first one",
  api.fromChordPro("[Am]שלום").chords, [{ pos: 0, chord: "Am" }]);

eq("brackets survive a round trip untouched",
  api.songToText(api.textToSong("ש[Am]לום לך  [G]  אדוני\n\n{פזמון}\nעוד שורה")),
  "ש[Am]לום לך  [G]  אדוני\n\n{פזמון}\nעוד שורה");

eq("a heading is a line in braces",
  api.textToSong("{פזמון}")[0], { type: "section", text: "פזמון", chords: [], dir: "rtl" });

/* --- which way each line runs -------------------------------------------
   A direction belongs to a line, so the document says so where it CHANGES and
   nowhere else: a song in one direction carries no markers at all. */
const ONE_WAY = ["ש[Am]לום", "עוד שורה"].join("\n");
const TURNS = ["שלום", "{dir:ltr}", "Hello", "{dir:rtl}", "עולם"].join("\n");
const OPENS_LTR = ["Hello", "{dir:rtl}", "שלום"].join("\n");

eq("a song in one direction says nothing about it",
  api.songToText(api.textToSong(ONE_WAY)), ONE_WAY);

eq("a marker turns the lines after it",
  api.textToSong(TURNS).map((l) => l.dir), ["rtl", "ltr", "rtl"]);

eq("and it is written back where the direction changes",
  api.songToText(api.textToSong(TURNS)), TURNS);

eq("the first line needs no marker, it IS the song's direction",
  api.songToText(api.textToSong(OPENS_LTR, "ltr")), OPENS_LTR);

eq("a line inherits the one before it",
  api.normalizeLines([{ text: "a", dir: "ltr" }, { text: "b" }, { text: "c", dir: "rtl" }]).map((l) => l.dir),
  ["ltr", "ltr", "rtl"]);

eq("both halves of a cut line keep its direction",
  api.splitLine({ type: "line", text: "Hello there", chords: [], dir: "ltr" }, 5).map((l) => l.dir),
  ["ltr", "ltr"]);

eq("the song runs the way its first line does",
  api.songDir(api.textToSong(OPENS_LTR, "ltr")), "ltr");

/* Typing a space with the caret exactly where a chord sits. Nothing is
   deleted, so the change is zero characters wide and the chord stands on both
   its edges at once: the chord must move, or the letter it names slides out
   from under it and the format has broken its one promise. */
eq("a space typed right where a chord sits pushes it along",
  api.remapChords("שלום", "של ום", [{ pos: 2, chord: "Am" }]),
  [{ pos: 3, chord: "Am" }]);

eq("and the chords before it stay",
  api.remapChords("שלום", "של ום", [{ pos: 0, chord: "Am" }, { pos: 2, chord: "G" }]),
  [{ pos: 0, chord: "Am" }, { pos: 3, chord: "G" }]);

/* A run of identical characters is ambiguous: inserting a space anywhere in
   "נה נה נה   " gives the same string every time, so comparing the two
   texts cannot say where it went. The caret can, and an outro's chords live out
   in exactly those spaces. */
eq("a space typed into a run of spaces still carries the chords after it",
  api.remapChords("נה נה נה   ", "נה נה נה    ", [{ pos: 9, chord: "G" }, { pos: 11, chord: "F" }], 9),
  [{ pos: 10, chord: "G" }, { pos: 12, chord: "F" }]);

eq("and a backspace in one pulls them back",
  api.remapChords("נה נה נה    ", "נה נה נה   ", [{ pos: 10, chord: "G" }, { pos: 12, chord: "F" }], 8),
  [{ pos: 9, chord: "G" }, { pos: 11, chord: "F" }]);

/* the whole point of the format: edit the words, the chord goes with them */
const before = api.normalizeLines("שלום לך אדו[G]ני")[0];
eq("inserting a space before the chord carries it along",
  api.toChordPro({ type: "line", text: "שלום לך  אדוני", chords: api.remapChords(before.text, "שלום לך  אדוני", before.chords) }),
  "שלום לך  אדו[G]ני");

/* a position is always a whole character of its own line, never a fraction and
   never past the end: those are pixels wearing a costume */
eq("fractions and overruns are pulled back onto real characters",
  api.normalizeLines([{ type: "line", text: "שלום", chords: [{ pos: 1.7, chord: "Am" }, { pos: 24.3, chord: "D" }] }])[0].chords,
  [{ pos: 2, chord: "Am" }, { pos: 4, chord: "D" }]);

/* Room past the last word is made by lengthening the line, not by pointing
   past it. A chord ON character 12 needs thirteen characters to sit on. */
const outro = { type: "line", text: "נה נה נה", chords: [{ pos: 0, chord: "Am" }] };
api.padTo(outro, 12);
eq("a chord past the words lengthens the line", outro.text, "נה נה נה     ");
outro.chords.push({ pos: 12, chord: "G" });
eq("and the chord then names a real character", api.toChordPro(outro), "נ[Am]ה נה נה     [G]");
outro.chords.pop();
api.trimPadding(outro);
eq("spaces nothing needs any more go back", outro.text, "נה נה נה");

eq("the chords a song uses, once each, in the order it reaches them",
  api.chordsUsed("[Am]שלום [G]לך\n[F]ואיך [Am]היה [C]היום"),
  ["Am", "G", "F", "C"]);

/* --- the easy version ------------------------------------------------------
   A capo at fret N plays the song N semitones down and it still sounds in its
   own key, so the easiest version is a search over capo positions. */
eq("a song of open chords needs no capo",
  api.easyVersion(["Am", "G", "C", "Em"]), { capo: 0, shapes: ["Am", "G", "C", "Em"], hard: 0 });

/* Bm A G D has a barre in it at the open neck, and there is a capo position
   where every one of the four becomes a shape a beginner already holds. */
eq("barres become open shapes under a capo",
  api.easyVersion(["Bm", "A", "G", "D"]), { capo: 7, shapes: ["Em", "D", "C", "G"], hard: 0 });

eq("the lowest capo wins a tie", api.easyVersion(["C", "G"]).capo, 0);
eq("nothing to play, nothing to say", api.easyVersion([]), { capo: 0, shapes: [], hard: 0 });

/* --- lines cut and joined, the way a text editor does it --- */
eq("Enter cuts a line and the chords go with their own characters",
  api.splitLine({ type: "line", text: "שלום לך אדוני", chords: [{ pos: 0, chord: "Am" }, { pos: 10, chord: "G" }] }, 8)
    .map(api.toChordPro),
  ["ש[Am]לום לך ", "אדו[G]ני"]);

eq("Backspace joins them back",
  api.toChordPro(api.joinLines(
    { type: "line", text: "שלום לך ", chords: [{ pos: 0, chord: "Am" }] },
    { type: "line", text: "אדוני", chords: [{ pos: 2, chord: "G" }] })),
  "ש[Am]לום לך אדו[G]ני");

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
    { type: "section", text: "פזמון", chords: [], dir: "rtl" },
    { type: "line", text: "אני שר לך שיר", chords: [{ pos: 0, chord: "Am" }, { pos: 10, chord: "F" }], dir: "rtl" },
    { type: "line", text: "", chords: [], dir: "rtl" },
    { type: "line", text: "    ", chords: [{ pos: 0, chord: "C" }, { pos: 3, chord: "G" }], dir: "rtl" },
  ]);

eq("a lyric line that happens to start with a capital is not a chord line",
  api.parsePasted("Baby you're a firework").map((l) => l.chords.length),
  [0]);

/* --- what counts as a chord --- */
const good = [
  "C", "Am", "Bb", "F#", "A#m", "Eb",
  "G7", "Cmaj7", "CM7", "CΔ", "CΔ7", "Cmin7", "C-7", "Cmi7",
  "Cdim", "C°", "Cdim7", "C°7", "Caug", "C+", "Cø", "Cm7b5",
  "Csus", "Csus2", "Csus4", "C7sus4", "Dadd9", "Cadd11", "C6", "C6/9",
  "E7#9", "C7b9", "C9", "C11", "C13", "Cmaj9", "Calt", "Cno3",
  "G/B", "Am7/G", "F#m7b5/A", "Cm(maj7)", "N.C.",
];
const bad = ["W", "H", "hello", "שיר", "8", "", "Cq", "Zm", "C#x9y", "maj7", "/G", "C/H"];

eq("every real chord passes", good.filter((c) => !api.isChord(c)), []);
eq("nothing else does", bad.filter((c) => api.isChord(c)), []);

eq("diminished, however it was written",
  ["B°", "Bo", "B0", "Bdim", "Bdim7", "Bø", "Bm7b5"].filter((c) => !api.isChord(c)), []);

/* --- suggestions, matched anywhere in the name --- */
eq("a letter offers that letter's chords",
  api.suggestChords("B").slice(0, 5), ["B", "Bm", "B7", "Bm7", "Bmaj7"]);
eq("more letters narrow it down", api.suggestChords("Bdi"), ["Bdim", "Bdim7"]);
eq("the match is anywhere, not only at the front",
  api.suggestChords("Bsus"), ["Bsus2", "Bsus4", "B7sus4"]);
eq("without a note it searches every root",
  api.suggestChords("sus4").filter((c) => /^(C|F#|Bb)sus4$/.test(c)), ["Csus4", "F#sus4", "Bbsus4"]);
eq("a tail the family does not have still offers the family",
  api.suggestChords("Bzz")[0], "B");
eq("nothing typed, nothing offered", api.suggestChords(""), []);

eq("chord recognition", [
  api.looksLikeChord("Am"), api.looksLikeChord("F#m7"), api.looksLikeChord("G/B"),
  api.looksLikeChord("Csus4"), api.looksLikeChord("שיר"), api.looksLikeChord("Hello"),
], [true, true, true, true, false, false]);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
