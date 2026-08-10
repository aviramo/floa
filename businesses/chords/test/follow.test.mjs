/* Where in the song we are, checked without a microphone.

   follow.js takes numbers and hands back a position, so a test can hand it the
   numbers a guitar would have produced and read the position back. Which makes
   this the one part of the listening that can be held to account exactly: the
   readings below are written out here, so every answer is either right or
   wrong and there is nothing to argue about.

   THE CASE THAT MATTERS IS THE FOURTH ONE DOWN. Am F C G, four times, which is
   most songs ever written. The fifth Am is indistinguishable from the first by
   any measurement of sound, forever. What tells them apart is where we were a
   moment ago, and that is the whole thing being tested. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/follow.js", "utf8");
const host = { window: {} };
new Function("window", src)(host.window);
const F = host.window.CHORDS_FOLLOW;

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* --- what a reading looks like ---------------------------------------------
   One number per distinct chord. The one being played scores well, everything
   else scores the way a chord that shares notes with it scores, which is
   nearly as well: that closeness is the whole difficulty and a test that fed
   it a clean 1 and a clean 0 would be testing nothing. */
const reading = (follow, playing, high = 0.88, low = 0.72) =>
  follow.kinds.map((k) => (k === playing ? high : low));

/* Play a chord for `frames` readings and hand back where it ended up. */
const play = (follow, chord, frames = 6, high, low) => {
  let last;
  for (let i = 0; i < frames; i++) last = follow.step(reading(follow, chord, high, low));
  return last;
};

/* --- it starts by finding out where it is ---------------------------------- */
{
  const song = ["Am", "F", "C", "G"];
  const f = F.make(song);
  eq("the distinct chords are what gets scored", f.kinds, ["Am", "F", "C", "G"]);
  eq("and every place in the song is a place it could be", f.length, 4);

  play(f, "C", 10);
  eq("a song opened in the middle is found in the middle", f.where(), 2);
}

/* --- and then it walks --------------------------------------------------- */
{
  const song = ["Am", "F", "C", "G"];
  const f = F.make(song);
  const walked = [];
  for (const chord of song) walked.push(play(f, chord, 8).here);
  eq("it walks the song in order", walked, [0, 1, 2, 3]);
}

/* --- one bad reading is not a chord change --------------------------------
   The thing that made the panel flicker: in the middle of a strum, one reading
   in ten comes back naming something that was never played. */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
  const f = F.make(song);
  play(f, "Am", 8);
  const before = f.where();
  /* three readings insisting on G, which is four places away */
  play(f, "G", 3, 0.95, 0.6);
  eq("a wrong reading in the middle of a strum moves nothing",
    [before, f.where()], [0, 0]);
}

/* --- THE ONE THAT MATTERS -------------------------------------------------
   Am F C G, four times. The sound of the second time round is the sound of the
   first time round, exactly, and there is no microphone that will ever tell
   them apart. Only continuity can. */
{
  const song = [];
  for (let i = 0; i < 4; i++) song.push("Am", "F", "C", "G");
  const f = F.make(song);

  const walked = [];
  for (const chord of song) walked.push(play(f, chord, 8).here);
  eq("four chords played four times are sixteen different places",
    walked, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  /* AND IT NEVER BECOMES CERTAIN WHICH TIME ROUND IT IS, which is not a fault
     and cannot be fixed. A song that is genuinely four chords sixteen times
     has four stories that fit every reading equally well and will go on doing
     so to the last bar: the second time round sounds exactly like the first,
     and being one bar further into a path that was a guess at the start does
     not make the guess any better.

     What it IS right about is the RELATIVE position, which is the test above:
     it walks sixteen places without ever snapping back to the first. So the
     mark moves correctly through the repeats, and `sure` is the honest report
     that it could equally be lighting the same chord one time round earlier. */
  const fresh = F.make(song);
  const walk = ["Am", "F", "C", "G", "Am", "F"].map((c) => play(fresh, c, 8).sure);
  eq("a song that is one thing over and over stays a guess about which time round",
    walk.every((s) => s < 0.2), true);
}

/* --- and a song with something in it that only happens once ----------------
   Which is nearly every real song: a bridge, a different chord in the last
   line, anything at all that is not in the loop. The moment one of those goes
   by, there is only one story left. */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G", "Dm", "Bm", "Am", "F", "C", "G"];
  const f = F.make(song);
  const opened = play(f, "Am", 8).sure;
  ["F", "C", "G", "Am", "F", "C", "G", "Dm", "Bm"].forEach((c) => play(f, c, 8));
  const after = play(f, "Am", 8);
  eq("a part that happens once settles where we are", after.here, 10);
  eq("and it knows it now, where it did not at the start",
    after.sure > 0.8 && opened < 0.2, true);
}

/* --- a chord that goes by unheard ------------------------------------------
   A quiet chord, a chord damped, a chord the microphone missed. The song did
   not stop. */
{
  const song = ["Am", "F", "C", "G", "Em"];
  const f = F.make(song);
  play(f, "Am", 8);
  /* F never sounds; C does */
  play(f, "C", 10);
  eq("a chord passed over is passed over rather than lost", f.where(), 2);
}

/* --- and being lost is survivable ------------------------------------------
   The difference between a follower that recovers and one that spends the rest
   of the song insisting it is somewhere it is not. */
{
  const song = ["Am", "F", "C", "G", "Dm", "Bm", "E", "A"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("it is where it thinks it is", f.where(), 0);
  /* the player has jumped to the far end of the song and stayed there */
  play(f, "E", 30);
  eq("a player who moved somewhere else is followed there", f.where(), 6);
}

/* --- somebody saying where they are beats any amount of listening ---------- */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("touching a chord on the page puts it there", f.put(5), 5);
  play(f, "C", 8);
  eq("and it carries on from there rather than from where it was", f.where(), 6);
}

/* ==========================================================================
   AND THE STABILISER, which is the panel's problem rather than the song's.
   ========================================================================== */

/* An evenly matched pair, which is what C and Am are: whichever is ahead this
   reading is behind the next. A plain majority reports every one of those
   swings, which is the flicker. */
{
  const s = F.steady();
  let at = 0;
  const tick = (name, score) => s.hear(name, score, (at += 50));
  /* half a second of C, so it settles */
  let said;
  for (let i = 0; i < 10; i++) said = tick("C", 0.85);
  eq("it says what it has been hearing", said, "C");
  /* then the two trade places every other reading, which is a coin toss */
  for (let i = 0; i < 12; i++) said = tick(i % 2 ? "Am" : "C", 0.85);
  eq("an evenly matched pair does not flicker", said, "C");
}

/* And a real change is not held off for long: the sitting answer keeps its
   place against noise, not against evidence. */
{
  const s = F.steady();
  let at = 0;
  const tick = (name, score) => s.hear(name, score, (at += 50));
  for (let i = 0; i < 12; i++) tick("C", 0.85);
  let said = null;
  let took = 0;
  for (let i = 0; i < 20 && said !== "F"; i++) { said = tick("F", 0.85); took++; }
  eq("a real chord change gets through", said, "F");
  eq("and gets through inside a beat", took <= 12, true);
}

/* Silence is evidence too: what was ringing has stopped, and a panel still
   naming it a second later is naming a room. */
{
  const s = F.steady();
  let at = 0;
  for (let i = 0; i < 12; i++) s.hear("C", 0.85, (at += 50));
  let said;
  for (let i = 0; i < 14; i++) said = s.hear(null, 0, (at += 50));
  eq("silence empties it rather than freezing it", said, null);
}

/* Nothing at all, which is most of the readings in a quiet room. */
{
  const s = F.steady();
  eq("nothing heard, nothing said", s.hear(null, 0, 1000), null);
}

/* --- a song with nothing in it --------------------------------------------
   The editor draws a song before it has a chord in it, and the follower is
   handed whatever is on the page. */
{
  const f = F.make([]);
  eq("an empty song is not an error", f.step([]).here, -1);
  eq("and there is nowhere to be put", f.put(0), 0);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
