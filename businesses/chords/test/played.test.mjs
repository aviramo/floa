/* Exercises the pair a reader keeps for a song, straight out of the shipped
   app.js: which key they sing it in and where the capo goes, and the one
   subtraction that turns the two of them into a page.

   Two things are worth a test here and neither can be read off the screen.

   THE FIRST IS THAT THE CAPO CANNOT MOVE THE SINGING. That is the whole of
   what was asked for, and it is not enforced anywhere: it falls out of pageOf
   being a subtraction. A test is what notices if anybody ever makes it a
   decision instead.

   THE SECOND IS THE MIGRATION, which gets exactly one chance. Every reader has
   a pair already written into their browser under the old meaning, where "k"
   moved the page and "c" was a note beside it, and they will never be asked
   about it. Read it wrong and every song they have ever set opens in a key
   they did not choose. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf('var KEPT_OF = "chords.song.";');
const end = src.indexOf("function setBusy(message)");
if (start < 0 || end < 0) throw new Error("could not find the kept-pair block");

/* Enough of a browser to hold what a reader said, and enough of the model to
   let the block run: the block is about arithmetic and storage, so the chord
   and easy-version helpers below it only have to be recognisable. */
const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};

const api = new Function(
  "localStorage", "auth", "MAX_CAPO", "chordsUsed", "easyVersion", "transposeChord",
  src.slice(start, end) +
  "\nreturn { keptFor, keepFor, keptCapo, keptSung, saidAnything, playedAs, pageOf, shapesFor };"
)(
  localStorage,
  { session: null },
  7,
  (lines) => lines,
  /* a stand-in: four chords are the song that wants a capo at 3 */
  (chords) => ({ capo: chords.length === 4 ? 3 : 0, shapes: chords, hard: 0 }),
  (chord, by) => chord + (by ? "@" + by : ""),
);

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* The page is compared modulo twelve, because that is all shiftRoot ever looks
   at: a page of -1 and a page of 11 put the identical letters on the screen. */
const sameEq = (label, got, want) => {
  const ok = ((got - want) % 12 + 12) % 12 === 0;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${got}\n       want ${want} (mod 12)`); failed++; }
};

const put = (id, was) => { store["chords.song.-." + id] = JSON.stringify(was); };
const song = (id, chords) => ({ id, lines: chords, status: "published" });

/* --- THE CAPO DOES NOT MOVE THE SINGING ------------------------------------
   What comes out of the guitar is the page plus the fret. Roll the fret from
   one end of the neck to the other and it has to come out the same. */
const sung = 2;
let moved = null;
for (let capo = 0; capo <= 7; capo++) {
  const heard = api.pageOf({ sung, capo }) + capo;
  if (heard !== sung && moved == null) moved = `fret ${capo} sang it at ${heard}`;
}
eq("every fret from 0 to 7 leaves the singing exactly where it was", moved, null);

/* And the other way about: moving the singing leaves the hand alone. */
eq("moving the singing does not move the hand",
  [-2, 0, 5].map((s) => api.pageOf({ sung: s, capo: 4 })), [-6, -4, 1]);

/* --- A READER WHO HAS SAID NOTHING ----------------------------------------
   gets the easy version, and gets it as what it is: a fret, under a song still
   in the key it was written in. */
eq("nothing said: the fret is the easy version and the singing has not moved",
  api.playedAs(song("a", ["Bm", "A", "G", "D"])), { sung: 0, capo: 3 });
eq("and the page is the shapes that fret makes",
  api.pageOf(api.playedAs(song("a", ["Bm", "A", "G", "D"]))), -3);

/* Nothing is worked out for a song nobody has checked yet: it is opened beside
   the picture it was read from and has to be comparable to it. */
eq("a song still to be checked is left alone",
  api.playedAs({ id: "q", lines: ["Bm", "A", "G", "D"], status: "queued" }), { sung: 0, capo: 0 });

/* --- AND ONE WHO SAID SOMETHING UNDER THE OLD MEANING ----------------------
   The page they had is the page they keep, and the key they were hearing is
   the key they keep hearing. */
put("b", { k: -3 });
eq("moved down three, no capo: sings three down", api.keptSung("b"), -3);
sameEq("and the page is where it was", api.pageOf(api.playedAs(song("b", []))), -3);

put("c", { k: -3, c: 2 });
eq("down three with a capo at two: was sounding one down", api.keptSung("c"), -1);
sameEq("and the page is where it was", api.pageOf(api.playedAs(song("c", []))), -3);

/* The fret counts even where the page was never moved. Somebody who only ever
   clamped a capo on was playing the written shapes four semitones up, and
   reading that as "sings it as written" would drop the song under them. */
put("d", { c: 4 });
eq("a capo and nothing else: it was sounding four up", api.keptSung("d"), 4);
sameEq("and the page is where it was", api.pageOf(api.playedAs(song("d", []))), 0);

put("e", { k: 11, c: 7 });
eq("past the top it comes back round", api.keptSung("e"), 6);
sameEq("and the page is where it was", api.pageOf(api.playedAs(song("e", []))), 11);

/* --- ONCE THE NEW NUMBER IS THERE, IT IS THE ANSWER --- */
put("f", { s: 2, c: 5, k: -99 });
eq("what was written down last wins", api.keptSung("f"), 2);
eq("and the page is the subtraction", api.pageOf(api.playedAs(song("f", []))), -3);

/* --- SILENCE IS THE ONLY THING THE APP ANSWERS FOR ------------------------- */
put("g", { s: 0, c: 0 });
eq("a chosen zero is not silence",
  api.playedAs(song("g", ["Bm", "A", "G", "D"])), { sung: 0, capo: 0 });
eq("and neither is a fret on its own", api.saidAnything("d"), true);
eq("but an empty box is", api.saidAnything("nobody"), false);

/* --- WHAT A ROW SHOWS IS THE PAGE, AND THE FRET THAT MAKES IT TRUE --------- */
put("h", { s: 0, c: 2 });
eq("the row's shapes and its chip agree",
  api.shapesFor({ id: "h", lines: ["Am", "F"], status: "published" }),
  { shapes: ["Am@-2", "F@-2"], capo: 2, used: ["Am", "F"] });

/* --- nonsense is not kept --- */
eq("no fret at all is no fret", api.keptCapo("nobody"), 0);
put("i", { s: 0, c: 99 });
eq("nor is a fret past the end of the neck", api.keptCapo("i"), 0);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
