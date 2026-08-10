/* Exercises the pair a reader keeps for a song, straight out of the shipped
   app.js: the chords printed on the page and the key the song comes out in,
   and the one subtraction that turns those two into a fret.

   THE FRET MOVES OPPOSITE THE TRANSPOSITION, which is what a capo is for. Move
   the page down and the capo climbs to pay for it, and the song sounds the
   same. That is the first thing here.

   AND IT COMES BACK. The reason the fret is a leftover rather than a number of
   its own is that a stored fret would be clamped at each end and would lose
   count: three presses up against the ceiling and three back down would leave
   the page where it started and the fret somewhere else. A subtraction cannot
   do that, and this is where anybody who turns it back into a stored number
   will find out.

   AND THE MIGRATION GETS ONE CHANCE. Every reader already has a pair written
   into their browser under the old meaning, where "k" moved the page and "c"
   was a note beside it, and none of them will ever be asked about it. Read it
   wrong and every song they have set opens somewhere they did not choose. */
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
  /* walkable, because what goes up to the account is everything this reader
     has ever answered and the only list of that is the box itself */
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i],
};

const api = new Function(
  "localStorage", "auth", "MAX_CAPO", "chordsUsed", "easyVersion", "transposeChord",
  src.slice(start, end) +
  "\nreturn { keptFor, keepFor, keptPage, keptSung, saidAnything, playedAs, capoOf, shapesFor,"
  + "\n         keysMap, sameKeys, pairIn };"
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

/* The page is compared modulo twelve where a wrap is in play, because that is
   all shiftRoot ever looks at: -1 and 11 print the identical letters. */
const sameEq = (label, got, want) => {
  const ok = ((got - want) % 12 + 12) % 12 === 0;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${got}\n       want ${want} (mod 12)`); failed++; }
};

const put = (id, was) => { store["chords.song.-." + id] = JSON.stringify(was); };
const song = (id, chords) => ({ id, lines: chords, status: "published" });

/* The two handlers on the strip, mirrored. They are four lines each inside
   renderSong and cannot be imported, so they are restated here against the
   REAL capoOf: what is being tested is that these two moves, over that
   subtraction, behave. */
const press = (at, by) => {
  const next = at.page + by;
  return { page: next > 11 ? -11 : next < -11 ? 11 : next, sung: at.sung };
};
const clampAt = (at, fret) => {
  const want = Math.max(0, Math.min(fret, MAX_CAPO));
  return want === api.capoOf(at) ? at : { page: at.page, sung: at.page + want };
};
const heard = (at) => at.page + api.capoOf(at);

/* --- THE TRANSPOSITION MOVES THE FRET THE OTHER WAY ------------------------ */
let at = { page: 0, sung: 0 };
eq("no capo to start with", api.capoOf(at), 0);
at = press(at, -1);
eq("a page down one puts the capo on the first fret", api.capoOf(at), 1);
eq("and the song comes out where it was", heard(at), 0);
at = press(at, -2);
eq("three down is the third fret", api.capoOf(at), 3);
eq("and the song still comes out where it was", heard(at), 0);
at = press(at, 3);
eq("and back up takes the capo off again", api.capoOf(at), 0);
eq("with the song still where it was", heard(at), 0);

/* Every fret on the way down, and the song never moves. */
let held = null;
for (let step = 0, was = { page: 0, sung: 0 }; step < MAX_CAPO; step++) {
  was = press(was, -1);
  if (api.capoOf(was) !== step + 1 && held == null) held = `after ${step + 1} down the fret was ${api.capoOf(was)}`;
  if (heard(was) !== 0 && held == null) held = `after ${step + 1} down the song moved to ${heard(was)}`;
}
eq("the capo walks up one fret per press, all the way to the end", held, null);

/* --- PAST THE END OF THE NECK ---------------------------------------------- */
at = { page: -MAX_CAPO, sung: 0 };
eq("seven down is the last fret there is", api.capoOf(at), MAX_CAPO);
at = press(at, -1);
eq("one more does not invent an eighth", api.capoOf(at), MAX_CAPO);
eq("so the song is what gives, by one", heard(at), -1);

/* --- AND IT COMES BACK, WHICH A STORED FRET WOULD NOT ---------------------- */
const roundTrip = (from, by) => {
  let there = from;
  for (let i = 0; i < Math.abs(by); i++) there = press(there, Math.sign(by));
  for (let i = 0; i < Math.abs(by); i++) there = press(there, -Math.sign(by));
  return there;
};
/* Up three from an open neck: the fret is already at zero and cannot go
   lower, so three presses have nothing to take. Coming back must not hand
   those three to the capo. */
eq("three up against the floor and three back down changes nothing",
  roundTrip({ page: 0, sung: 0 }, 3), { page: 0, sung: 0 });
eq("and the fret is where it started", api.capoOf(roundTrip({ page: 0, sung: 0 }, 3)), 0);
/* And the same against the ceiling. */
eq("three down through the ceiling and three back up changes nothing",
  roundTrip({ page: -MAX_CAPO, sung: 0 }, -3), { page: -MAX_CAPO, sung: 0 });
eq("and the fret is back at the last one",
  api.capoOf(roundTrip({ page: -MAX_CAPO, sung: 0 }, -3)), MAX_CAPO);

/* --- MOVING THE FRET BY HAND DOES NOT MOVE THE TRANSPOSITION --------------- */
at = { page: -3, sung: 0 };
eq("standing at the third fret", api.capoOf(at), 3);
const pinned = clampAt(at, 5);
eq("asking for the fifth leaves the page exactly where it was", pinned.page, -3);
eq("the fret is the fifth", api.capoOf(pinned), 5);
eq("and the song is what moved, by two", heard(pinned), 2);
eq("from there the transposition still pays for itself",
  [api.capoOf(press(pinned, -1)), api.capoOf(press(pinned, 1))], [6, 4]);

/* The buttons only ever ask for one more or one less, so the ends are where
   the guard has to hold: a press that cannot change the fret must not change
   the singing either, or holding the button down at the top of the neck would
   walk the song up without the number ever moving. */
const top = { page: -MAX_CAPO, sung: 0 };
eq("at the last fret, asking for one more does nothing", clampAt(top, MAX_CAPO + 1), top);
eq("at no capo, asking for one less does nothing",
  clampAt({ page: 0, sung: 0 }, -1), { page: 0, sung: 0 });

/* --- A READER WHO HAS SAID NOTHING ----------------------------------------- */
eq("nothing said: the page is moved down to meet the easy version",
  api.playedAs(song("a", ["Bm", "A", "G", "D"])), { page: -3, sung: 0 });
eq("and the fret it left is the fret to use",
  api.capoOf(api.playedAs(song("a", ["Bm", "A", "G", "D"]))), 3);

/* Nothing is worked out for a song nobody has checked yet: it is opened beside
   the picture it was read from and has to be comparable to it. */
eq("a song still to be checked is left alone",
  api.playedAs({ id: "q", lines: ["Bm", "A", "G", "D"], status: "queued" }), { page: 0, sung: 0 });

/* --- AND ONE WHO SAID SOMETHING UNDER THE OLD MEANING ---------------------- */
put("b", { k: -3 });
eq("moved down three, no capo", api.playedAs(song("b", [])), { page: -3, sung: -3 });
eq("which is still no capo", api.capoOf(api.playedAs(song("b", []))), 0);

put("c", { k: -3, c: 2 });
eq("down three with a capo at two", api.playedAs(song("c", [])), { page: -3, sung: -1 });
eq("the fret they were holding is the fret they keep", api.capoOf(api.playedAs(song("c", []))), 2);
eq("and the song sounds where it sounded", heard(api.playedAs(song("c", []))), -1);

/* The fret counts even where the page was never moved. Somebody who only ever
   clamped a capo on was playing the written shapes four semitones up. */
put("d", { c: 4 });
eq("a capo and nothing else", api.playedAs(song("d", [])), { page: 0, sung: 4 });
eq("keeps its fret", api.capoOf(api.playedAs(song("d", []))), 4);
eq("and its sound", heard(api.playedAs(song("d", []))), 4);

put("e", { k: 11, c: 7 });
sameEq("the page at the very top stays at the very top", api.playedAs(song("e", [])).page, 11);
eq("with the singing brought back inside the ring", api.playedAs(song("e", [])).sung, 6);

/* --- ONCE THE NEW KEYS ARE THERE, THEY ARE THE ANSWER ---------------------- */
put("f", { p: -2, s: 3, k: -99, c: 99 });
eq("what was written down last wins", api.playedAs(song("f", [])), { page: -2, sung: 3 });
eq("and the fret is the gap", api.capoOf(api.playedAs(song("f", []))), 5);

/* --- SILENCE IS THE ONLY THING THE APP ANSWERS FOR ------------------------- */
put("g", { p: 0, s: 0 });
eq("a chosen zero is not silence",
  api.playedAs(song("g", ["Bm", "A", "G", "D"])), { page: 0, sung: 0 });
eq("and neither is an old fret on its own", api.saidAnything("d"), true);
eq("but an empty box is", api.saidAnything("nobody"), false);

/* --- WHAT A ROW SHOWS IS THE PAGE, AND ONLY THE PAGE ----------------------- */
put("h", { p: -2, s: 0 });
eq("the row shows the shapes the page will open on",
  api.shapesFor({ id: "h", lines: ["Am", "F"], status: "published" }),
  { shapes: ["Am@-2", "F@-2"], used: ["Am", "F"] });
/* The fret those shapes are for is still two, and it is still worked out the
   same way. It is not on the row: it is a fact about the player, it lives on
   the control that sets it, and a card is about the song. */
eq("and the fret it is not showing is still there to be had",
  api.capoOf(api.playedAs(song("h", ["Am", "F"]))), 2);

/* --- AND WHAT THE ACCOUNT IS TOLD ------------------------------------------
   The pair is kept per reader per song ON THE ACCOUNT now, so it survives the
   screen it was chosen on. What goes up is the pair as it means things today,
   whatever the browser happens to be holding, which is where the migration
   above gets its second and last chance: a reader whose browser only ever knew
   "k" and "c" hands the account a page and a key, once, and is never asked. */
api.keepFor("m", -2, 1);
eq("what was pressed is what comes back", api.playedAs(song("m", [])), { page: -2, sung: 1 });

const going = api.keysMap();
eq("a pressed pair goes up as it is", going.m, { p: -2, s: 1 });
eq("an old page and an old fret go up as a page and a key", going.c, { p: -3, s: -1 });
eq("a lone old fret goes up as the key it was making", going.d, { p: 0, s: 4 });
eq("and what was written down last is what goes up", going.f, { p: -2, s: 3 });
eq("a song nobody answered has nothing to send", "nobody" in going, false);

/* Two maps are compared by what they say, not by how they were written out:
   the same answers in another order are a row that does not need writing. */
eq("the same answers in another order are the same answers",
  api.sameKeys({ a: { p: 1, s: 2 }, b: { p: 0, s: 0 } }, { b: { p: 0, s: 0 }, a: { p: 1, s: 2 } }), true);
eq("one answer moved is a different map",
  api.sameKeys({ a: { p: 1, s: 2 } }, { a: { p: 1, s: 3 } }), false);
eq("one answer more is a different map",
  api.sameKeys({ a: { p: 1, s: 2 } }, { a: { p: 1, s: 2 }, b: { p: 0, s: 0 } }), false);

/* And what comes DOWN moves somebody's song, so only a whole pair inside the
   ring is allowed to. */
eq("a pair is taken as it is", api.pairIn({ p: -3, s: 2 }), { p: -3, s: 2 });
eq("a chosen zero comes down like any other answer", api.pairIn({ p: 0, s: 0 }), { p: 0, s: 0 });
eq("half a pair is not an answer", api.pairIn({ p: 1 }), null);
eq("nor is one outside the ring", api.pairIn({ p: 12, s: 0 }), null);
eq("nor is anything that is not a pair at all", api.pairIn("-3"), null);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
