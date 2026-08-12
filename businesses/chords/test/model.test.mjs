/* Exercises the pure model helpers straight out of the shipped app.js:
   the block between the "model" banner and the "rendering a line" banner has
   no DOM in it, so it can be evaluated on its own. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf("var RESERVED_SLUGS");
const end = src.indexOf("/* ------------------------------------------------------- rendering a line */");
if (start < 0 || end < 0) throw new Error("could not find the model block");

const block = src.slice(start, end);
const api = new Function(block + "\nreturn { slugify, transposeChord, remapChords, parsePasted, looksLikeChord, isChord, suggestChords, chordsUsed, easyVersion, keyChoices, toChordPro, fromChordPro, songToText, textToSong, normalizeLines, songDir, splitLine, joinLines, padTo, padTail, growHead, fitPadding, GAP, diffLines, changeCount, playOrder, repRuns };")();

/* The artificial space (see GAP): room on the screen and nothing in the words,
   which is what a line grows by when a chord is dragged past its last one. */
const G = api.GAP;
const gaps = (n) => new Array(n + 1).join(G);

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

/* --- a repeat -------------------------------------------------------------
   `|:` and `:|3` on lines of their own, which is the mark every musician reads
   and the reason it is not a Hebrew word: nothing on the page ever says
   "repeat", it says a bar down the margin and a number.

   CARRIED ON THE LINES AND NOT AS LINES OF THEIR OWN, which is what the second
   group is about: there is nothing invisible in the song for the editor to
   walk into, so a block whose lines are deleted goes with them, and a mark
   that lost its partner in any of the dozen ways a song is edited is dropped
   rather than left to run a bar down the rest of the page. */
const TWICE = ["|:", "ש[Am]ורה אחת", "ו[G]שורה שנייה", ":|2"].join("\n");

eq("a repeat survives a round trip", api.songToText(api.textToSong(TWICE)), TWICE);

eq("the marks ride on the first line and the last, not on lines of their own",
  api.textToSong(TWICE).map((l) => [!!l.repOpen, l.repShut || 0]),
  [[true, 0], [false, 2]]);

eq("a count is read off the closing mark",
  api.textToSong(["|:", "אחת", "שתיים", ":|3"].join("\n")).map((l) => l.repShut || 0), [0, 3]);

eq("a close with no number means twice",
  api.songToText(api.textToSong(["|:", "שורה", ":|"].join("\n"))),
  ["|:", "שורה", ":|2"].join("\n"));

eq("×2 is read the same as 2", api.songToText(api.textToSong(["|:", "שורה", ":|×2"].join("\n"))),
  ["|:", "שורה", ":|2"].join("\n"));

eq("a block of one line opens and closes on it",
  api.textToSong(["|:", "שורה", ":|4"].join("\n")).map((l) => [!!l.repOpen, l.repShut || 0]),
  [[true, 4]]);

eq("a heading can be the whole of a block",
  api.songToText(api.textToSong(["|:", "{פזמון}", "שורה", ":|2"].join("\n"))),
  ["|:", "{פזמון}", "שורה", ":|2"].join("\n"));

eq("an open with nothing after it is not a block",
  api.songToText(api.textToSong(["שורה", "|:"].join("\n"))), "שורה");

eq("a close with nothing open is dropped",
  api.songToText(api.textToSong([":|2", "שורה"].join("\n"))), "שורה");

eq("an open with nothing between it and the close is dropped",
  api.songToText(api.textToSong(["|:", ":|2", "שורה"].join("\n"))), "שורה");

eq("a block inside a block is one block",
  api.songToText(api.textToSong(["|:", "אחת", "|:", "שתיים", ":|2", "שלוש"].join("\n"))),
  ["|:", "אחת", "שתיים", ":|2", "שלוש"].join("\n"));

/* Every way a song is edited can leave half a block behind: the last line of
   one deleted, half of one pasted somewhere else. Reading the song back is
   where that is put right, and it is put right by dropping the mark rather
   than the words. */
eq("a mark whose partner was deleted goes, and the words stay",
  api.songToText(api.normalizeLines([
    { type: "line", text: "אחת", chords: [], repOpen: true },
    { type: "line", text: "שתיים", chords: [] },
  ])), ["אחת", "שתיים"].join("\n"));

eq("and a close on its own goes the same way",
  api.songToText(api.normalizeLines([
    { type: "line", text: "אחת", chords: [] },
    { type: "line", text: "שתיים", chords: [], repShut: 3 },
  ])), ["אחת", "שתיים"].join("\n"));

eq("a count under two is not a repeat",
  api.songToText(api.normalizeLines([
    { type: "line", text: "אחת", chords: [], repOpen: true },
    { type: "line", text: "שתיים", chords: [], repShut: 1 },
  ])), ["אחת", "שתיים"].join("\n"));

/* --- and the song as it is played -----------------------------------------
   Which is what the follower walks. A block written once and sung three times
   stands at three places in it, so what was a jump BACKWARDS becomes the song
   carrying on, which is the cheap move in follow.js and the only one the mark
   will draw.

   `at` takes anything, so these are letters. On the page they are the chord
   nodes themselves. */
const part = (times, at, opens) => ({ times: times, at: at.split(""), opens: opens || [] });

eq("a song with no repeat is itself",
  api.playOrder([part(1, "abcd")]).at.join(""), "abcd");

eq("a block is laid out as many times as it is sung",
  api.playOrder([part(1, "ab"), part(2, "cd"), part(1, "ef")]).at.join(""), "abcdcdef");

eq("three times is three",
  api.playOrder([part(3, "xy")]).at.join(""), "xyxyxy");

eq("two blocks in a row keep their own counts",
  api.playOrder([part(2, "ab"), part(3, "c")]).at.join(""), "ababccc");

/* Nobody plays one chord over again; they play the verse over again. So the
   top of every pass is handed to the follower as a place a part begins, which
   is what makes "somebody went back" a guess about a verse rather than about a
   chord (see BACK_START in follow.js). */
eq("every pass opens a part",
  api.playOrder([part(1, "ab", [true]), part(2, "cd")]).starts, [0, 2, 4]);

eq("and a heading inside a block opens one on every pass",
  api.playOrder([part(2, "abc", [false, true])]).starts, [0, 1, 3, 4]);

eq("a count of one is not a repeat and opens nothing extra",
  api.playOrder([part(1, "ab", [true])]).starts, [0]);

eq("nothing in, nothing out", api.playOrder([]).at, []);

/* The count is a fact about a block, so it is the block's rows that carry it,
   and every row of one carries the same one: the closing line is where it is
   written and the first line is where it is read. */
eq("every line of a block reports the block's count",
  api.repRuns(api.textToSong(["אחת", "|:", "שתיים", "שלוש", ":|3"].join("\n")))
    .map((r) => (r ? r.times : 0)), [undefined, 3, 3]);

/* A version that only put a bar round a verse changed the verse: it is sung
   twice now and it was not before, and a diff that reported nothing would be
   a diff that missed the whole of what happened. */
eq("a repeat added is a change",
  api.changeCount(api.diffLines(
    api.textToSong(["אחת", "שתיים"].join("\n")),
    api.textToSong(["|:", "אחת", "שתיים", ":|2"].join("\n")))),
  { add: 2, gone: 2 });

/* --- which way each line runs -------------------------------------------
   A DIRECTION IS NOT STORED AND NOT CHOSEN. It is read off the line every time
   the song is drawn, from the first character in it that has a direction of
   its own: a line that begins with a Hebrew letter runs right to left, and
   there is no second opinion to have about that. So nothing about direction is
   written into the document, and a `{dir:...}` left in one from the years when
   it WAS a setting is thrown away rather than obeyed.

   Which is what the third case is for. The marker says one thing and the words
   say another, and the words win: a marker is what somebody once said, and the
   words are what is there now. */
const ONE_WAY = ["ש[Am]לום", "עוד שורה"].join("\n");
const TURNS = ["שלום", "Hello", "עולם"].join("\n");
const OLD_MARKS = ["שלום", "{dir:ltr}", "Hello", "{dir:rtl}", "עולם"].join("\n");

eq("a song in one direction says nothing about it",
  api.songToText(api.textToSong(ONE_WAY)), ONE_WAY);

eq("each line runs the way its own words do",
  api.textToSong(TURNS).map((l) => l.dir), ["rtl", "ltr", "rtl"]);

eq("and nothing about direction is written down",
  api.songToText(api.textToSong(TURNS)), TURNS);

eq("a marker left from when it was a setting is dropped, not obeyed",
  api.songToText(api.textToSong(OLD_MARKS)), TURNS);

/* A line with no letters in it, a blank one or a bar of chords over nothing,
   has nothing to say and no reason to interrupt. */
eq("a line with no letters keeps the one before it",
  api.normalizeLines([{ text: "Hello" }, { text: "   " }, { text: "שלום" }]).map((l) => l.dir),
  ["ltr", "ltr", "rtl"]);

eq("both halves of a cut line keep its direction",
  api.splitLine({ type: "line", text: "Hello there", chords: [], dir: "ltr" }, 5).map((l) => l.dir),
  ["ltr", "ltr"]);

eq("the song runs the way its first line does",
  api.songDir(api.textToSong(["Hello", "שלום"].join("\n"))), "ltr");

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
   past it. A chord ON character 12 needs thirteen characters to sit on.

   AND IT GROWS BY ARTIFICIAL SPACES. What the line gets is room on the screen
   and nothing in the words: a lyrics sheet, a search and a copy all read
   "נה נה נה" and stop there, however far out the last chord was dragged. */
const outro = { type: "line", text: "נה נה נה", chords: [{ pos: 0, chord: "Am" }] };
api.padTo(outro, 12);
eq("a chord past the words lengthens the line", outro.text, "נה נה נה" + gaps(5));
eq("and the words are none the longer for it", outro.text.split(G).join(""), "נה נה נה");
outro.chords.push({ pos: 12, chord: "G" });
eq("and the chord then names a real character", api.toChordPro(outro), "נ[Am]ה נה נה" + gaps(5) + "[G]");
outro.chords.pop();
api.fitPadding(outro);
eq("room nothing needs any more goes back", outro.text, "נה נה נה");

/* Half of it goes back: the tail is as long as the furthest chord still needs
   and no longer, which is what a chord dragged part of the way in does. */
const pulled = { type: "line", text: "נה נה נה" + gaps(5), chords: [{ pos: 10, chord: "G" }] };
api.fitPadding(pulled);
eq("a chord brought back shrinks the room to what it needs", pulled.text, "נה נה נה" + gaps(3));

/* --- and the same room at the other end ------------------------------------
   A chord dragged back past the FIRST word has nothing to name either, so the
   line grows there too. What is different about that end is that everything
   already on the line moves along with the words: nothing changes places, the
   whole line steps forward by what was put in front of it. */
const intro = { type: "line", text: "נה נה", chords: [{ pos: 0, chord: "Am" }, { pos: 3, chord: "G" }] };
api.growHead(intro, 4);
eq("room before the first word goes in front of everything",
  intro.text, gaps(4) + "נה נה");
eq("and every chord on the line kept its own syllable",
  api.toChordPro(intro), gaps(4) + "נ[Am]ה נ[G]ה");
eq("the words, still, are the words", intro.text.split(G).join(""), "נה נה");

/* The chord that asked for the room is the one standing at the head of it, so
   nothing there is room nothing needs. */
intro.chords[0].pos = 0;
eq("and none of it goes back while the chord is out at the front",
  api.fitPadding(intro), 0);

/* Brought forward two, and the two gaps it left behind it come off: the line
   steps back to where lines begin, and the room between that chord and the
   first word is untouched. */
intro.chords[0].pos = 2;
eq("a chord brought forward takes the room in front of it back", api.fitPadding(intro), 2);
eq("the line is the same line, two gaps shorter", intro.text, gaps(2) + "נה נה");
eq("with every chord on it two back", intro.chords.map((c) => c.pos), [0, 5]);
eq("and the words are still the words", intro.text.split(G).join(""), "נה נה");

/* A song padded with real spaces before there were artificial ones comes back
   the same length, the same chords over the same cells, and the words ending
   where the words end. */
eq("a line padded in real spaces is read back in gaps",
  api.normalizeLines([{ type: "line", text: "נה נה נה     ", chords: [{ pos: 12, chord: "G" }] }])[0].text,
  "נה נה נה" + gaps(5));
eq("and trailing spaces nothing stands on are not padding at all",
  api.normalizeLines([{ type: "line", text: "נה נה נה     ", chords: [{ pos: 0, chord: "Am" }] }])[0].text,
  "נה נה נה");

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

/* --- and the few keys worth offering ---------------------------------------
   The same ranking, opened out into a short menu. Each choice is a page and
   the fret that pays for it, and the two always agree: a capo only goes up, so
   holding the song where it was written costs page = -capo. */
const keyed = (used) => api.keyChoices(used).map((c) => c.shapes[0] + "@" + c.capo);

eq("a song of open chords is offered the keys that stay open",
  keyed(["Am", "G", "C", "Em"]), ["Am@0", "Em@5", "Dm@7"]);

eq("three, no more and no fewer, wherever the song sits",
  keyed(["Bm", "A", "G", "D"]).length, 3);
eq("also for a song that is barres all the way down",
  keyed(["C#m", "F#", "B", "E"]).length, 3);

/* Bm A G D is one barre away from open everywhere but fret 7, where all four
   come out open. So that is the head of the list and not the tail of it: the
   column is read from the top by somebody looking for the kindest one. */
eq("the easiest to hold is first", keyed(["Bm", "A", "G", "D"])[0], "Em@7");
eq("and the hardest of the three is last",
  api.keyChoices(["Bm", "A", "G", "D"]).map((c) => c.hard),
  [0, 1, 1]);

eq("nothing to play, nothing to choose from", api.keyChoices([]), []);

/* THE LIST IS ABOUT THE SONG AND NOT ABOUT THE READER. It takes the chords and
   nothing else, so a capo pressed in the panel cannot hand back a different
   three (see keyChoices). The page is the transposition the chords are printed
   at, and it is exactly what the fret is subtracted from. */
eq("page and fret are the one subtraction",
  api.keyChoices(["Am", "G", "C", "Em"]).every((c) => c.page === -c.capo), true);
eq("no key is offered that could not be written down",
  api.keyChoices(["Am", "G", "C", "Em"]).every((c) => c.page >= -11), true);

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
    { type: "line", text: gaps(4), chords: [{ pos: 0, chord: "C" }, { pos: 3, chord: "G" }], dir: "rtl" },
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

/* --- what one version did to the one before it ----------------------------
   The list every version page is drawn from: whose lines survived, which ones
   arrived, and which ones left. Written as "mark words" per line, because that
   is exactly what the page draws. */
const diff = (before, after) =>
  api.diffLines(api.normalizeLines(before, "rtl"), api.normalizeLines(after, "rtl"))
    .map((op) => op.mark + " " + (op.line.type === "section" ? "{" + op.line.text + "}" : api.toChordPro(op.line)));

/* The brackets go AFTER the character the chord sits on, which is why these
   read the way they do: א[Am]חת is an Am over the alef. */
eq("the same song twice changed nothing",
  diff("א[Am]חת\nשתיים", "א[Am]חת\nשתיים"),
  ["same א[Am]חת", "same שתיים"]);

eq("a line that arrived in the middle",
  diff("אחת\nשלוש", "אחת\nשתיים\nשלוש"),
  ["same אחת", "add שתיים", "same שלוש"]);

eq("a line that left",
  diff("אחת\nשתיים\nשלוש", "אחת\nשלוש"),
  ["same אחת", "gone שתיים", "same שלוש"]);

/* A chord that moved makes a different line, and the two are shown in the
   order they happened: this was here, and this is here now. */
eq("a chord that moved is the old line leaving and a new one arriving",
  diff("א[Am]חת שתיים", "אחת ש[Am]תיים"),
  ["gone א[Am]חת שתיים", "add אחת ש[Am]תיים"]);

eq("a heading is a line like any other",
  diff("{בית}\nאחת", "{פזמון}\nאחת"),
  ["gone {בית}", "add {פזמון}", "same אחת"]);

/* A chorus that repeats is where a cheaper diff goes wrong: the spine has to
   be the longest run of lines that survive IN ORDER, not the first match. */
eq("a repeated chorus keeps its place",
  diff("פזמון\nאחת\nפזמון", "פזמון\nאחת\nשתיים\nפזמון"),
  ["same פזמון", "same אחת", "add שתיים", "same פזמון"]);

/* An empty line is drawn with its mark and counted in nothing: a gap that
   opened is part of what the version looks like and not something that
   happened to the words. */
eq("blank lines are not counted",
  api.changeCount(api.diffLines(api.normalizeLines("אחת", "rtl"), api.normalizeLines("אחת\n\nשתיים", "rtl"))),
  { add: 1, gone: 0 });

eq("counted on both sides",
  api.changeCount(api.diffLines(api.normalizeLines("אחת\nשתיים", "rtl"), api.normalizeLines("שלוש\nארבע\nחמש", "rtl"))),
  { add: 3, gone: 2 });

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
