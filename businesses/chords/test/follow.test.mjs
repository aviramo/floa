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

/* Play a chord for `frames` readings and hand back where it ended up.

   A FRAME IS A READING AND A READING IS A LENGTH OF TIME, a thirtieth of a
   second on a song page (see EAR_GAP_CHORD in app.js). So the counts below are
   not arbitrary: they are how long somebody held that chord, and where one of
   them is close to what the follower waits for, changing how often the ear is
   asked changes what the count means. */
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

/* --- AND IT WAITS FOR THE NEXT CHORD --------------------------------------
   The readings above are clean, and clean readings hide the failure this is
   about. In a room the scores wobble, and the next chord in a song is nearly
   always one that SHARES NOTES with the one before it: Am into C, C into Am, G
   into Em. So a quarter of the readings taken while an Am is ringing hand the
   C a slightly better score than the Am, purely on which string was loudest.

   Nothing in the model said a chord change has to be WON rather than tied, so
   the mark moved on the first of those readings and ran ahead of the playing,
   chord after chord, while the player was still on the first one.

   The wobble here is worked out rather than random, so this test is the same
   test every time it runs. */
{
  const song = ["Am", "C", "G", "F"];
  const f = F.make(song);
  /* a repeating shuffle, deterministic, that crosses zero often */
  let seed = 7;
  const wobble = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return (seed / 2147483648 - 0.5) * 0.18;
  };

  let crossed = 0;
  for (let i = 0; i < 90; i++) {
    const am = 0.85 + wobble();
    const c = 0.82 + wobble();
    if (c > am) crossed++;
    f.step([am, c, 0.70, 0.68]);
  }
  eq("the wobble really does hand the next chord the better score sometimes",
    crossed > 15, true);
  eq("and a chord held is a chord held: the mark waits for the next one",
    f.where(), 0);
}

/* --- A CHORD CHANGE WITH A REAL MARGIN IS TAKEN, AND TAKEN SOON ------------
   Reported off a recording, and the shape of it is worth stating exactly. The
   follower walked "שר ליבי" from end to end in order without skipping a chord,
   and it did it ONE CHORD LATE: it sat six and a half seconds on the chord
   before, then took two chords in a tenth of a second when it caught up. What
   a reader sees of a chord that is held for a tenth of a second is nothing, so
   the report was that it had been skipped. It had not. It had been passed
   through at a run.

   THE CAUSE IS THAT STAYING PUT IS REWARDED EVERY READING. That bonus is not
   a one-off cost to be paid off over time: a chord whose advantage is smaller
   than the bonus never accumulates anything, so it does not arrive late, it
   never arrives at all, and what eventually moves the mark is a lucky reading
   or the chord after it. On a song built out of chords that share two notes
   out of three, that is most chord changes in it.

   WHAT A CHORD CHANGE HAS TO CARRY IS ABOUT FOUR HUNDREDTHS, which is SIT
   minus HOME over the belief (see follow.js), and the margin below is seven.
   Under four it does not arrive late, it does not arrive at all, and what
   eventually moves the mark is a lucky reading or the chord after it.

   THAT NUMBER WAS LOWERED AND PUT BACK. At 0.022 the wobble test refused it:
   the mark ran ahead of the playing on noise alone, which is the worse of the
   two failures. So this holds the promptness that IS safe, and the way to a
   follower that keeps up is more evidence per reading, which is what the bass
   under the chord is now worth (see BASS_HELP in ear.js). */
{
  const song = ["Am", "C", "G", "F"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("on the first chord", f.where(), 0);

  /* The C ahead by seven hundredths, reading after reading, which is what a
     chord change with the bass agreeing looks like. */
  let took = -1;
  for (let i = 0; i < 30 && took < 0; i++) {
    if (f.step([0.80, 0.87, 0.66, 0.64]).here === 1) took = i;
  }
  eq("a chord change with a real margin is taken, and inside a second",
    took >= 0, true);
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

  /* AND IT SAYS HOW MUCH OF THAT IS THE SOUND'S DOING, which on this song is
     none of it: every Am here is one of four, so the sound settles nothing and
     the whole of the answer is continuity. Which is real evidence and is not
     proof, and the difference is worth being able to see. */
  const fresh = F.make(song);
  eq("it says how many places carry the chord it is on", play(fresh, "Am", 8).alike, 4);
}

/* --- and a song with something in it that only happens once ----------------
   Which is nearly every real song: a bridge, a different chord in the last
   line, anything at all that is not in the loop. The moment one of those goes
   by, there is only one story left. */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G", "Dm", "Bm", "Am", "F", "C", "G"];
  const f = F.make(song);
  play(f, "Am", 8);
  ["F", "C", "G", "Am", "F", "C", "G", "Dm", "Bm"].forEach((c) => play(f, c, 14));
  const after = play(f, "Am", 14);
  eq("a part that happens once settles where we are", after.here, 10);
  eq("and the Bm before it was the one place it could have been", after.alike, 3);
}

/* --- PLAYING THE VERSE AGAIN -----------------------------------------------
   THE MARK NEVER GOES BACKWARDS, and this is the case that used to be the
   reason it could.

   The song runs Am D Am D, then F C E Am. A player who reaches the second D
   and wants the verse again plays Am, and the Am they mean is two places
   BEHIND them. The follower used to walk back to it, and on real recordings
   every backwards move it ever made was wrong: a moment of confusion two
   chords back, a chord ringing into the next, a slash chord matching something
   behind it. What a reader sees when the mark goes backwards is the song
   undoing itself.

   SO IT WAITS INSTEAD, and a repeat costs nothing for it. The mark stops at
   the end of the part being played again and stands there, and when the
   playing comes round to that place a second time it is already on it. Right
   again, with nothing undone. The arithmetic underneath still knows perfectly
   well where the player went, which is what keeps the next reading honest. */
{
  const song = ["Am", "D", "Am", "D", "F", "C", "E", "Am", "G"];
  const f = F.make(song);
  ["Am", "D", "Am", "D"].forEach((c) => play(f, c, 8));
  eq("through the verse once", f.where(), 3);

  /* a second time round the verse, at length */
  ["Am", "D", "Am", "D"].forEach((c) => play(f, c, 24));
  eq("the verse again does not walk the mark back through it", f.where(), 3);

  /* and the part after it arrives to a mark that is already in the right place */
  ["F", "C", "E"].forEach((c) => play(f, c, 24));
  eq("and the part after it is walked into without anything being undone",
    f.where(), 6);

  /* AND IT NEVER GOES BACK EVEN WHEN THE SOUND INSISTS. A D is written twice
     in this song and both are behind us by now. */
  const was = f.where();
  play(f, "D", 40);
  eq("a chord that only exists behind us moves nothing", f.where(), was);

  const g = F.make(song);
  ["Am", "D", "Am", "D"].forEach((c) => play(g, c, 8));
  ["F", "C", "E"].forEach((c) => play(g, c, 8));
  eq("carrying on carries on", g.where(), 6);
  play(g, "Am", 10);
  eq("and the Am after those is the one in the second part", g.where(), 7);
}

/* --- AND A SONG THAT IS ONE THING OVER AND OVER DOES NOT SNAP TO ITS TOP ----
   Forty times "Am G F" is a hundred and twenty places that fit every reading
   exactly as well as each other. So the moment the follower stumbles, the
   fortieth Am and the FIRST Am are level, and a search for the best place
   picks whichever it happens to look at first, which is the top of the song.
   The mark jumps to the first line, the page scrolls up, and it happens again
   a bar later.

   Where nothing in the sound can separate two places, where we were a moment
   ago is the only evidence there is. */
{
  const song = [];
  for (let i = 0; i < 40; i++) song.push("Am", "G", "F");
  /* AND WITH A HEADING AT THE TOP OF IT, which every song has and which is
     what makes this the hard case rather than the easy one: "back to the top
     of a part" is cheap, and here the top of the part is the top of the song.
     So the cheap way home and the wrong answer are the same place. */
  const f = F.make(song, [0]);
  f.put(90);
  /* eleven bars of it, played fast enough to stumble on */
  for (let i = 0; i < 11; i++) ["G", "F", "Am"].forEach((c) => play(f, c, 5));
  eq("thirty bars in, it is thirty bars in", f.where() > 90, true);
  eq("and not back at the first line", f.where() > 20, true);
}

/* --- a chord that goes by unheard ------------------------------------------
   A quiet chord, a chord damped, a chord the microphone missed. The song did
   not stop, and the mark does not jump over it either: it WALKS through it,
   which is the same thing the eye does when reading past a chord nobody
   played. There is no cost for skipping any more and nothing needs one. */
{
  const song = ["Am", "F", "C", "G", "Em"];
  const f = F.make(song);
  play(f, "Am", 8);
  /* F never sounds; C does */
  const seen = [f.where()];
  for (let i = 0; i < 24; i++) {
    const at = f.step(reading(f, "C")).here;
    if (at !== seen[seen.length - 1]) seen.push(at);
  }
  eq("a chord passed over is passed over rather than lost", f.where(), 2);
  eq("and it is walked through rather than jumped over", seen, [0, 1, 2]);
}

/* --- and being lost is survivable ------------------------------------------
   The difference between a follower that recovers and one that spends the rest
   of the song insisting it is somewhere it is not. */
{
  const song = ["Am", "F", "C", "G", "Dm", "Bm", "E", "A"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("it is where it thinks it is", f.where(), 0);

  /* The player has moved somewhere else in the song and stayed there. The mark
     goes to them, and it goes ONE PLACE AT A TIME: what a reader sees is the
     mark running up the song to catch them, which is a thing they can follow,
     rather than a mark that vanishes from one line and appears on another. */
  const walked = [];
  for (let i = 0; i < 40; i++) {
    const at = f.step(reading(f, "E")).here;
    if (at !== walked[walked.length - 1]) walked.push(at);
  }
  eq("a player who moved somewhere else is followed there", f.where(), 6);
  eq("and followed one chord at a time rather than by vanishing",
    walked.every((at, i) => i === 0 || at === walked[i - 1] + 1), true);
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
