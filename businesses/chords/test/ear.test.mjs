/* The part of the ear that can be checked without a room and a guitar.

   Everything up to the twelve numbers is a microphone, an FFT and a lot of
   arithmetic about harmonics, and none of that can be tested here: what it is
   right about is whether it hears a guitar in a kitchen, which is a question
   only a kitchen answers. What CAN be tested is everything AFTER the twelve
   numbers, and that is where the interesting failure lives.

   C MAJOR AND A MINOR ARE THE WHOLE TEST. They share two notes out of three,
   every chord sheet is full of both, and a follower that cannot separate them
   is a follower that jumps between the verse and the chorus. So the cases
   below hand the ranking a chord written out by hand and ask what it makes of
   it: cleanly, with a harmonic mess over it, and with the bass note that is
   the only real evidence between the two. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/ear.js", "utf8");
/* The file talks to exactly one global, on its last lines. Give it one. */
const host = { window: {}, navigator: {} };
new Function("window", "navigator", src)(host.window, host.navigator);
const ear = host.window.CHORDS_EAR;

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

const N = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const name = (one) => one ? N[one.root] + one.quality : null;

/* Twelve numbers built by hand: `{ C: 1, E: .9 }` and the rest silent. */
const chroma = (parts) => {
  const v = new Array(12).fill(0);
  for (const [note, level] of Object.entries(parts)) v[N.indexOf(note)] = level;
  return v;
};

/* What it says, given those twelve numbers and, optionally, a bass note. */
const heard = (parts, low) => name(ear.weigh(chroma(parts), low == null ? -1 : N.indexOf(low))[0]);
const ranked = (parts, low) => ear.weigh(chroma(parts), low == null ? -1 : N.indexOf(low)).map(name);

/* --- the plain cases, which have to be right before anything else matters --- */
eq("three notes of C major", heard({ C: 1, E: 1, G: 1 }), "C");
eq("and the minor third makes it minor", heard({ C: 1, Eb: 1, G: 1 }), "Cm");
eq("A minor is A minor and not C major", heard({ A: 1, C: 1, E: 1 }), "Am");
eq("a seventh is heard as a seventh", heard({ G: 1, B: 1, D: 1, F: 1 }), "G7");
eq("and a major seventh as one", heard({ C: 1, E: 1, G: 1, B: 1 }), "Cmaj7");
eq("no third, no chord to name", heard({ C: 1, F: 1, G: 1 }), "Csus4");

/* --- and the one that is actually hard -------------------------------------
   C major with the fifth ringing louder than the root, which is what a strummed
   open C sounds like, still has to be C: the three notes are the same three
   notes as A minor's top and the ranking has nothing else to go on.

   THE FIFTH IS WEIGHTED DOWN IN THE TEMPLATES FOR EXACTLY THIS. G is C major's
   fifth and A minor's seventh, so a loud G is evidence for both and should
   decide neither. */
eq("a loud fifth does not turn C into something else",
  heard({ C: 1, E: .8, G: 1 }), "C");
/* And A minor with the same three classes lit is still not C, because the
   template is scored on the SHAPE and A is a root here and nothing in C. */
eq("A minor with a loud fifth stays A minor",
  heard({ A: 1, C: .85, E: 1 }), "Am");

/* --- the harmonics that are always there ------------------------------------
   A real C on a guitar sends up a G (its third harmonic) and an E (its fifth),
   so the twelve numbers for a bare C major always have a little of everything
   in them. What must not happen is that the noise floor promotes a chord
   nobody played. */
eq("a little of every note underneath does not change the answer",
  heard({ C: 1, E: .9, G: .85, D: .2, A: .2, B: .15, F: .18 }), "C");

/* --- and the bass, which is the one clue that separates the two -------------
   The same three notes twice. The only difference is what is underneath them,
   and that is the difference a person hears too. */
eq("C E G over a C is C", heard({ C: 1, E: 1, G: 1 }, "C"), "C");
eq("C E G over an A is A minor seventh",
  ranked({ C: 1, E: 1, G: 1, A: .9 }, "A")[0], "Am7");

/* The help is small on purpose: a phone hears the bottom of a guitar worst of
   anything, so a bass note may not decide a chord the notes disagree with. */
eq("the bass cannot overrule the notes",
  heard({ C: 1, Eb: 1, G: 1 }, "E"), "Cm");

/* --- silence ---------------------------------------------------------------
   Nothing at all still has to hand back a ranking rather than fall over: the
   panel reads best[0] on every frame, and a quiet room is most of them. */
eq("nothing sounding is not an error", typeof heard({}), "string");

/* --- what a chord written on a page reduces to -----------------------------
   A sheet carries whatever its writer felt like writing, and the microphone
   can hold seven shapes apart. So the mapping is what is being tested, and
   what it drops it has to drop the right way: a ninth is heard as the seventh
   it is built on, not as a triad. */
eq("plain major", ear.shapeOf(""), "");
eq("minor", ear.shapeOf("m"), "m");
eq("minor seventh", ear.shapeOf("m7"), "m7");
eq("a ninth is the seventh under it", ear.shapeOf("9"), "7");
eq("and a minor ninth the minor seventh", ear.shapeOf("m9"), "m7");
eq("major seventh is not a minor anything", ear.shapeOf("maj7"), "maj7");
eq("nor is maj9", ear.shapeOf("maj9"), "maj7");
eq("sus, bare, means sus4", ear.shapeOf("sus"), "sus4");
eq("sus2 is heard as sus, which is as close as this gets", ear.shapeOf("sus2"), "sus4");
/* What makes a chord sus is that there is no third in it, and a seventh over
   the top does not put one there. */
eq("a seventh over a sus is still a sus", ear.shapeOf("7sus4"), "sus4");
eq("diminished", ear.shapeOf("dim"), "dim");
eq("augmented has no template, so it is heard as the major it nearly is",
  ear.shapeOf("aug"), "");
eq("a sixth is a triad and not a seventh", ear.shapeOf("6"), "");
/* The bass of a slash chord says nothing about the three notes over it, and it
   is scored separately (see the bass in chord()). */
eq("the slash is not part of the shape", ear.shapeOf("m7/G"), "m7");
eq("nor on a plain triad", ear.shapeOf("/B"), "");

/* --- and a chord asked for by name -----------------------------------------
   Which is the question the song page actually asks: not "what is being
   played" out of everything, but "how much does this look like the G the song
   says is here". */
ear.weigh(chroma({ G: 1, B: 1, D: 1 }), -1);
const gScore = ear.score(N.indexOf("G"), "");
const cScore = ear.score(N.indexOf("C"), "");
eq("the chord that is sounding scores highest of the ones asked about",
  gScore > cScore, true);
eq("and it scores well rather than merely better", gScore > 0.9, true);

/* --- THE PAIR THAT SHARES TWO NOTES OUT OF THREE ---------------------------
   Am is A C E and C is C E G, and a song built out of the two of them is most
   of the songs anybody brings to this app. Reported from "שר ליבי", where the
   follower spent sixteen seconds of a recording on the first chord change,
   because a chord change has to be won by a margin (see follow.js) and these
   two never win anything against each other.

   The twelve numbers cannot settle it and no care with them ever will: they
   are very nearly the same chord. THE NOTE UNDERNEATH CAN.

   ASKED THE WAY THE SONG PAGE ASKS IT. Not "what chord is this", which on a
   reading with all four notes in it is honestly an Am7, but "how much does
   this look like the Am the song says is here, against the C". That is the
   question the follower puts, and it is the one the bass has to answer. */
{
  /* Both chords ringing into each other, which is what a bar of one going into
     the other actually sounds like: the two shared notes loudest, and the note
     that belongs to only one of them present on both sides. */
  const shared = { A: 0.85, C: 1, E: 0.95, G: 0.82 };
  const gap = (low) => {
    ear.weigh(chroma(shared), low == null ? -1 : N.indexOf(low));
    return ear.score(N.indexOf("A"), "m") - ear.score(N.indexOf("C"), "");
  };

  eq("with nothing underneath, the two of them are a coin toss",
    Math.abs(gap(null)) < 0.05, true);
  eq("with an A underneath, the A minor is plainly ahead", gap("A") > 0.1, true);
  eq("and with a C underneath, the C is", gap("C") < -0.1, true);
}

/* --- AND A SLASH CHORD IS ASKED ABOUT ITS OWN BASS -------------------------
   The three notes of a C/B are the three notes of a C, so nothing in the
   twelve numbers will ever separate them, and this file reduces one to the
   other on purpose. What is NOT the same is the note underneath, which is the
   whole of what the writing "/B" says, and the ear can hear one now.

   Read off a real take: with the bass ignored, a C/B matched the printed G
   better than the printed C and the mark walked backwards two places to reach
   a G. */
{
  const three = { C: 1, E: 0.95, G: 0.9 };
  const B = N.indexOf("B"), C = N.indexOf("C");

  ear.weigh(chroma(three), B);
  const asSlash = ear.score(C, "/B", B);
  const asPlain = ear.score(C, "", C);
  eq("with a B underneath, the C/B is the better answer of the two",
    asSlash > asPlain, true);

  ear.weigh(chroma(three), C);
  eq("and with a C underneath, the plain C is",
    ear.score(C, "", C) > ear.score(C, "/B", B), true);

  eq("and a chord not told what it stands on stands on its root",
    ear.score(C, "") === ear.score(C, "", C), true);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
