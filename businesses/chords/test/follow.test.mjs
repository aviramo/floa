/* Where in the song we are, checked without a microphone.

   follow.js takes numbers and hands back a position, so a test can hand it the
   numbers a guitar would have produced and read the position back. Which makes
   this the one part of the listening that can be held to account exactly: the
   readings below are written out here, so every answer is either right or
   wrong and there is nothing to argue about.

   WHAT THE POSITION MEANS IS THE CHORD THAT HAS NOT BEEN PLAYED YET. The mark
   stands on what is coming, the follower waits for it, and when it is heard
   the mark moves on to the next one. So a song played from the top with four
   chords in it ends with the position on the FIFTH place, having waited
   through all four, and every test below reads that way. */
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

/* A READING IS A THIRTIETH OF A SECOND, which is what the ear takes on a song
   page (see EAR_GAP_CHORD in app.js). The clock below runs at that rate, and
   it matters wherever a length of time is being waited for rather than a
   number of readings. */
const TICK = 33;
let clock = 0;

/* Play a chord for `frames` readings and hand back where it ended up. `rms` is
   how loud the room is, which nothing uses except the one case that has to
   hear a fresh strum. */
const play = (follow, chord, frames = 6, opt = {}) => {
  const high = opt.high === undefined ? 0.88 : opt.high;
  const low = opt.low === undefined ? 0.72 : opt.low;
  const rms = opt.rms === undefined ? 0.2 : opt.rms;
  let last;
  for (let i = 0; i < frames; i++) {
    last = follow.step(reading(follow, chord, high, low), rms, (clock += TICK));
  }
  return last;
};

/* A room nobody is playing in. The loudness still goes over, because quiet is
   half of what a strum is measured against. */
const hush = (follow, frames = 6) => {
  let last;
  for (let i = 0; i < frames; i++) last = follow.step(null, 0.001, (clock += TICK));
  return last;
};

/* --- it starts on the first chord and waits for it -------------------------- */
{
  const song = ["Am", "F", "C", "G"];
  const f = F.make(song);
  eq("the distinct chords are what gets scored", f.kinds, ["Am", "F", "C", "G"]);
  eq("and every place in the song is a place it could be waiting for", f.length, 4);
  eq("it waits on the first chord before anything is played", f.where(), 0);

  hush(f, 20);
  eq("and a room nobody is playing in does not move it", f.where(), 0);

  /* SOMETHING THAT IS NOT THIS CHORD does not open the song either. The first
     chord has nothing ringing behind it to have to be louder than, so what is
     asked of it instead is that it be what the room is most plainly playing. */
  play(f, "C", 20);
  eq("nor does a chord that is not the one being waited for", f.where(), 0);

  play(f, "Am", 6);
  eq("the chord it was waiting for arrives, and it waits for the next", f.where(), 1);
}

/* --- AND A CHORD HELD IS A CHORD HELD --------------------------------------
   The failure this exists to prevent, and it is the one that made the old
   follower look broken: the next chord in a song is nearly always one that
   SHARES NOTES with the one before it, so a quarter of the readings taken
   while an Am is ringing hand the C a slightly better score, purely on which
   string happened to be loudest. A mark that moves on those is a mark that
   runs ahead of the hand.

   The wobble here is worked out rather than random, so this test is the same
   test every time it runs. */
{
  const song = ["Am", "C", "G", "F"];
  const f = F.make(song);
  play(f, "Am", 6);
  eq("through the first chord", f.where(), 1);

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
    f.step([am, c, 0.70, 0.68], 0.2, (clock += TICK));
  }
  eq("the wobble really does hand the awaited chord the better score sometimes",
    crossed > 15, true);
  eq("and it is not enough: the chord ringing is still the one before it",
    f.where(), 1);
}

/* --- and then it is waited through ---------------------------------------- */
{
  const song = ["Am", "F", "C", "G"];
  const f = F.make(song);
  const waited = [];
  for (const chord of song) waited.push(play(f, chord, 8).here);
  eq("it waits through the song in order", waited, [1, 2, 3, 3]);
  eq("and stands on the last chord when the song runs out", f.where(), 3);
}

/* --- one bad reading is not a chord arriving -------------------------------
   In the middle of a strum, one reading in ten comes back naming something
   that was never played. */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
  const f = F.make(song);
  play(f, "Am", 8);
  const before = f.where();
  /* three readings insisting on the chord being waited for, and the fourth
     never comes */
  play(f, "F", 3, { high: 0.95, low: 0.6 });
  eq("three readings are not four, and nothing moved",
    [before, f.where()], [1, 1]);
}

/* --- THE ONE THAT MATTERS -------------------------------------------------
   Am F C G, four times. The sound of the second time round is the sound of the
   first time round, exactly, and there is no microphone that will ever tell
   them apart. What tells them apart here is that the second time round is
   simply later: the waiting has moved on and never goes back on its own. */
{
  const song = [];
  for (let i = 0; i < 4; i++) song.push("Am", "F", "C", "G");
  const f = F.make(song);

  const waited = [];
  for (const chord of song) waited.push(play(f, chord, 8).here);
  eq("four chords played four times are sixteen different places",
    waited, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15]);
}

/* --- a chord that goes by unheard ------------------------------------------
   A quiet chord, a chord damped, a chord the microphone missed. The song did
   not stop, and the mark is waiting for something that is not coming. So the
   chord AFTER the awaited one is scored too, and when that is what is
   sounding, for long enough not to be a stray reading, the awaited one is
   taken as having gone by. */
{
  const song = ["Am", "F", "C", "G", "Em"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("waiting for the F", f.where(), 1);

  /* F never sounds; C does */
  play(f, "C", 30);
  eq("the chord nobody played is stepped over and the one that did play counts",
    f.where(), 3);
}

/* --- and the same chord written twice --------------------------------------
   There is nothing in the sound that says the player reached the second one.
   What can be heard is a fresh strum, and it only counts once the first of the
   two has been held for a while: a song strummed four times to the bar is four
   strums to the bar. */
{
  const song = ["Am", "Am", "G"];
  const f = F.make(song);
  play(f, "Am", 6);
  eq("the first Am arrives", f.where(), 1);

  /* the same chord ringing on, quietly and evenly: nothing to go on */
  play(f, "Am", 6, { rms: 0.2 });
  eq("holding it is not playing it again", f.where(), 1);

  /* a strum, but a fifth of a second after the last one: that is the strumming
     hand inside one bar, not the next chord of the song */
  play(f, "Am", 2, { rms: 0.6 });
  eq("and neither is a strum inside the same bar", f.where(), 1);

  /* and now a bar of it, and then a strum */
  play(f, "Am", 14, { rms: 0.2 });
  play(f, "Am", 2, { rms: 0.6 });
  eq("a fresh strum, once the chord has been held a bar, is the second one",
    f.where(), 2);
}

/* --- and a place in the song that is not a chord ---------------------------
   "N.C.", or a word somebody typed over the line. Nothing anybody plays will
   ever make it arrive, so it is stepped over rather than waited for. It is
   handed in as a negative score (see followOn). */
{
  const song = ["Am", "N.C.", "G"];
  const f = F.make(song);
  for (let i = 0; i < 8; i++) f.step([0.88, -1, 0.7], 0.2, (clock += TICK));
  eq("the first chord arrives and the word after it is not waited for",
    f.where(), 2);
}

/* --- AND WAITING IN THE WRONG PLACE ENTIRELY -------------------------------
   Somebody played the verse again, or opened the song in the middle. The mark
   waits for a chord that is not coming while the room plainly plays others.

   Nothing searches the song on every reading any more. What happens instead is
   that a mark which has sat still through a second and a half of chords that
   are neither the one awaited nor the one before it looks for the last TWO it
   heard, in order, and moves to just after them. A pair, because one Am names
   eight places in a song and "F and then C" names one. */
{
  const song = ["Am", "D", "F", "C", "E", "G"];
  const f = F.make(song);
  for (const chord of ["Am", "D", "F", "C"]) play(f, chord, 8);
  eq("through the song as far as the C", f.where(), 4);

  /* And now the player goes BACK to the top and plays it again, which is the
     case nothing else here can answer: stepping over a chord only ever goes
     forwards, and the chord being waited for is never going to arrive. */
  play(f, "Am", 50);
  eq("one chord out of place is not enough to move the waiting anywhere",
    f.where(), 4);

  play(f, "D", 50);
  eq("but two heard in order are, and it is back inside the first line",
    f.where(), 2);
}

/* --- somebody saying where they are beats any amount of listening ---------- */
{
  const song = ["Am", "F", "C", "G", "Am", "F", "C", "G"];
  const f = F.make(song);
  play(f, "Am", 8);
  eq("touching a chord on the page waits for that one", f.put(5), 5);
  play(f, "F", 8);
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
  eq("an empty song is not an error", f.step([], 0.2, 1000).here, -1);
  eq("and there is nowhere to be put", f.put(0), 0);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
