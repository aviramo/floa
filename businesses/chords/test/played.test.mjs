/* Exercises the pair a reader keeps for a song, straight out of the shipped
   app.js: the chords printed on the page, and where the capo goes.

   THE TWO MOVE TOGETHER, THE SAME WAY. Transpose down a semitone and the capo
   comes down a fret; transpose up and it goes up. That is what was asked for
   and it is the first thing here.

   AND THE FRET COMES BACK. The reason the fret is worked out rather than
   stored is that a stored fret has to be clamped, and a clamped number that is
   added to on every press forgets the presses it could not take: three against
   the ceiling and three back down would put the page where it started and the
   fret three away from it. What is stored instead is the PIN, the fret held at
   the song's own key, which is allowed off the end of the neck precisely so
   that coming back lands where leaving did. This is where anybody who turns it
   back into a stored fret will find out.

   AND THE MIGRATION GETS ONE CHANCE. Every reader already has a pair written
   into their browser under the old meaning, where "k" was the page and "c" was
   the fret at that page, and none of them will be asked about it. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf('var KEPT_OF = "chords.song.";');
const end = src.indexOf("function setBusy(message)");
if (start < 0 || end < 0) throw new Error("could not find the kept-pair block");

const MAX_CAPO = 7;

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
  "\nreturn { keptFor, keepFor, keptPage, keptPin, saidAnything, playedAs, capoOf, shapesFor };"
)(
  localStorage,
  { session: null },
  MAX_CAPO,
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

const put = (id, was) => { store["chords.song.-." + id] = JSON.stringify(was); };
const song = (id, chords) => ({ id, lines: chords, status: "published" });

/* The two handlers on the strip, mirrored. They are four lines each inside
   renderSong and cannot be imported, so they are restated here against the
   REAL capoOf: what is being tested is that these two moves, over that sum,
   behave. */
const press = (at, by) => {
  const next = at.page + by;
  return { page: next > 11 ? -11 : next < -11 ? 11 : next, pin: at.pin };
};
const clampAt = (at, fret) => {
  const want = Math.max(0, Math.min(fret, MAX_CAPO));
  return want === api.capoOf(at) ? at : { page: at.page, pin: want - at.page };
};

/* --- A DIRECT RELATION, WHICH IS THE WHOLE REQUEST ------------------------- */
let at = { page: 0, pin: 3 };
eq("standing at the third fret", api.capoOf(at), 3);
eq("one semitone down takes the capo down a fret", api.capoOf(press(at, -1)), 2);
eq("and the chords came down with it", press(at, -1).page, -1);
eq("one semitone up takes it up a fret", api.capoOf(press(at, 1)), 4);
eq("three down is three frets down", api.capoOf(press(at, -3)), 0);
eq("three up is three frets up", api.capoOf(press(at, 3)), 6);

/* Step by step in both directions, one fret per semitone, no exceptions. */
let broke = null;
for (let step = 1; step <= 3; step++) {
  const down = api.capoOf(press({ page: 0, pin: 4 }, -step));
  const up = api.capoOf(press({ page: 0, pin: 4 }, step));
  if (down !== 4 - step && broke == null) broke = `${step} down gave fret ${down}`;
  if (up !== 4 + step && broke == null) broke = `${step} up gave fret ${up}`;
}
eq("one fret per semitone, both ways", broke, null);

/* --- THE ENDS OF THE NECK -------------------------------------------------- */
eq("it does not go below the nut", api.capoOf({ page: -9, pin: 3 }), 0);
eq("nor past the last fret", api.capoOf({ page: 9, pin: 3 }), MAX_CAPO);

/* --- AND IT COMES BACK, WHICH A STORED FRET WOULD NOT ---------------------- */
const roundTrip = (from, by) => {
  let there = from;
  for (let i = 0; i < Math.abs(by); i++) there = press(there, Math.sign(by));
  for (let i = 0; i < Math.abs(by); i++) there = press(there, -Math.sign(by));
  return there;
};
/* Down three from an open neck: the fret is at zero and cannot go lower, so
   three presses have nothing to take. Coming back must not hand those three
   to the capo. */
eq("three down against the nut and three back up changes nothing",
  roundTrip({ page: 0, pin: 0 }, -3), { page: 0, pin: 0 });
eq("and the fret is where it started", api.capoOf(roundTrip({ page: 0, pin: 0 }, -3)), 0);
/* And the same against the last fret. */
eq("three up through the last fret and three back down changes nothing",
  roundTrip({ page: 0, pin: MAX_CAPO }, 3), { page: 0, pin: MAX_CAPO });
eq("and the fret is back on the last one",
  api.capoOf(roundTrip({ page: 0, pin: MAX_CAPO }, 3)), MAX_CAPO);
/* Six frets past the ceiling and back, which is the case the pin exists for. */
eq("six out and six back is still the same fret",
  api.capoOf(roundTrip({ page: 0, pin: 4 }, 6)), 4);

/* --- MOVING THE FRET BY HAND DOES NOT MOVE THE CHORDS ---------------------- */
at = { page: -3, pin: 6 };
eq("standing at the third fret again", api.capoOf(at), 3);
const pinned = clampAt(at, 4);
eq("asking for the fourth leaves the page exactly where it was", pinned.page, -3);
eq("and the fret is the fourth", api.capoOf(pinned), 4);
eq("from there the transposition still carries it, one for one",
  [api.capoOf(press(pinned, -1)), api.capoOf(press(pinned, 1))], [3, 5]);

/* The buttons only ever ask for one more or one less, so the ends are where
   the guard has to hold: a press that cannot change the fret must not move the
   pin either, or holding the button down at the nut would walk the pin off
   into the distance while the number stood still. */
const floor = { page: 0, pin: 0 };
eq("at no capo, asking for one less does nothing", clampAt(floor, -1), floor);
const roof = { page: 0, pin: MAX_CAPO };
eq("at the last fret, asking for one more does nothing", clampAt(roof, MAX_CAPO + 1), roof);

/* --- A READER WHO HAS SAID NOTHING ----------------------------------------- */
eq("nothing said: the page comes down to the easy version",
  api.playedAs(song("a", ["Bm", "A", "G", "D"])).page, -3);
eq("and the fret it was found at is the fret shown",
  api.capoOf(api.playedAs(song("a", ["Bm", "A", "G", "D"]))), 3);

/* Nothing is worked out for a song nobody has checked yet: it is opened beside
   the picture it was read from and has to be comparable to it. */
eq("a song still to be checked is left alone",
  api.playedAs({ id: "q", lines: ["Bm", "A", "G", "D"], status: "queued" }), { page: 0, pin: 0 });

/* --- AND ONE WHO SAID SOMETHING UNDER THE OLD MEANING ---------------------- */
const opens = (id) => {
  const was = api.playedAs(song(id, []));
  return { page: was.page, capo: api.capoOf(was) };
};

put("b", { k: -3 });
eq("moved down three, no capo, opens exactly there", opens("b"), { page: -3, capo: 0 });

put("c", { k: -3, c: 2 });
eq("down three with a capo at two keeps both", opens("c"), { page: -3, capo: 2 });

put("d", { c: 4 });
eq("a capo and nothing else keeps its fret", opens("d"), { page: 0, capo: 4 });

put("e", { k: 11, c: 7 });
eq("the far end of the ring keeps both", opens("e"), { page: 11, capo: 7 });

/* --- ONCE THE NEW KEYS ARE THERE, THEY ARE THE ANSWER ---------------------- */
put("f", { p: -2, a: 6, k: -99, c: 99 });
eq("what was written down last wins", api.playedAs(song("f", [])), { page: -2, pin: 6 });
eq("and the fret is the sum", api.capoOf(api.playedAs(song("f", []))), 4);

/* --- SILENCE IS THE ONLY THING THE APP ANSWERS FOR ------------------------- */
put("g", { p: 0, a: 0 });
eq("a chosen zero is not silence",
  api.playedAs(song("g", ["Bm", "A", "G", "D"])), { page: 0, pin: 0 });
eq("and neither is an old fret on its own", api.saidAnything("d"), true);
eq("but an empty box is", api.saidAnything("nobody"), false);

/* --- WHAT A ROW SHOWS IS THE PAGE, AND THE FRET THAT GOES WITH IT ---------- */
put("h", { p: -2, a: 4 });
eq("the row's shapes and its chip agree",
  api.shapesFor({ id: "h", lines: ["Am", "F"], status: "published" }),
  { shapes: ["Am@-2", "F@-2"], capo: 2, used: ["Am", "F"] });

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
