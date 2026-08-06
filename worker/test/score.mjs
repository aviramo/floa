/* ==========================================================================
   Marking a read against a song somebody corrected by hand.

   Tuning a reader without a score is guesswork dressed as judgement: one
   change fixes a chord and breaks another, and reading two documents side by
   side tells you which you looked at last rather than which is better. So the
   comparison is arithmetic, and it is the same arithmetic every time.

       node worker/test/score.mjs <reference> <candidate>

   Both are ChordPro, as stored. The reference is a song a person fixed until
   it matched the paper, which is the only ground truth this task has.

   WHAT IT COUNTS, and the shape of it matters more than the number:

     the words     compared line by line. Nothing else can be judged until
                   these agree, because a chord's position is an index into
                   them: one letter more in a line moves every chord after it
                   and neither read is wrong about anything.

     on the words  a chord over a letter. Exact means the same chord on the
                   same character. NEAR means one character out, which is the
                   error this whole task has, kept separate so that a change
                   that turns misses into near misses can be seen doing it.

     past the end  a run of chords with no word under them. Position is
                   meaningless out there, the format spaces them by eye, so
                   only the ORDER is compared. Getting that backwards was a
                   real failure once and would score perfectly on names alone.
   ========================================================================== */

import { readFileSync } from "node:fs";

/* A document pulled apart into what it says and where its chords sit. Every
   chord carries the index of the character it is ON, which is the character
   BEFORE its bracket. */
export function parse(doc) {
  return String(doc).split("\n").map((raw) => {
    let text = "";
    const chords = [];

    raw.replace(/\[([^\]]*)\]|([^[]+)/g, (whole, chord, run) => {
      if (chord != null) chords.push({ name: chord.trim(), pos: Math.max(0, text.length - 1) });
      else text += run;
      return "";
    });

    /* Out past the last word there is no character to be on, only an order. */
    const end = text.replace(/\s+$/, "").length - 1;
    return {
      text: text.replace(/\s+$/, ""),
      placed: chords.filter((chord) => chord.pos <= end),
      trailing: chords.filter((chord) => chord.pos > end).map((chord) => chord.name),
    };
  });
}

const words = (text) => text.trim().replace(/\s+/g, " ");

function marks(reference, candidate) {
  const want = parse(reference);
  const got = parse(candidate);

  const tally = {
    lines: want.length,
    linesGot: got.length,
    lyricsExact: 0,
    exact: 0,
    near: 0,
    misplaced: 0,
    missing: 0,
    extra: 0,
    trailingRight: 0,
    trailingWrong: 0,
    chords: 0,
    notes: [],
  };

  want.forEach((line, index) => {
    const mine = got[index] || { text: "", placed: [], trailing: [] };
    tally.chords += line.placed.length + line.trailing.length;

    const same = words(line.text) === words(mine.text);
    if (same) tally.lyricsExact++;
    else tally.notes.push(`line ${index + 1} words differ\n    want: ${line.text}\n    got:  ${mine.text}`);

    /* Chords are only comparable over the same words. Where the lines differ
       every chord on that line is counted as missing rather than pretended to
       be judged, because an index into a different string means nothing. */
    if (!same) {
      tally.missing += line.placed.length;
      tally.trailingWrong += line.trailing.length;
      return;
    }

    const spare = mine.placed.slice();
    line.placed.forEach((chord) => {
      const hit = (test) => {
        const at = spare.findIndex(test);
        if (at < 0) return null;
        return spare.splice(at, 1)[0];
      };

      if (hit((one) => one.name === chord.name && one.pos === chord.pos)) return tally.exact++;
      if (hit((one) => one.name === chord.name && Math.abs(one.pos - chord.pos) === 1)) {
        tally.near++;
        tally.notes.push(`line ${index + 1}: ${chord.name} one character out`);
        return;
      }
      if (hit((one) => one.name === chord.name)) {
        tally.misplaced++;
        tally.notes.push(`line ${index + 1}: ${chord.name} in the wrong place`);
        return;
      }
      tally.missing++;
      tally.notes.push(`line ${index + 1}: ${chord.name} missing`);
    });

    tally.extra += spare.length;
    spare.forEach((chord) => tally.notes.push(`line ${index + 1}: ${chord.name} was not on the page`));

    const wanted = line.trailing.join(" ");
    const mineOut = mine.trailing.join(" ");
    if (wanted === mineOut) {
      tally.trailingRight += line.trailing.length;
    } else {
      tally.trailingWrong += Math.max(line.trailing.length, mine.trailing.length);
      if (wanted || mineOut) tally.notes.push(`line ${index + 1}: past the end, want [${wanted}], got [${mineOut}]`);
    }
  });

  return tally;
}

export function score(reference, candidate) {
  const tally = marks(reference, candidate);
  const right = tally.exact + tally.trailingRight;
  return { ...tally, right, share: tally.chords ? right / tally.chords : 0 };
}

export function report(name, reference, candidate) {
  const tally = score(reference, candidate);
  const pc = (n) => `${Math.round((n / (tally.chords || 1)) * 100)}%`;

  console.log(`\n${name}`);
  console.log(`  words   ${tally.lyricsExact}/${tally.lines} lines exactly right`);
  console.log(`  chords  ${tally.chords} on the reference`);
  console.log(`    exact       ${String(tally.exact).padStart(3)}  ${pc(tally.exact)}`);
  console.log(`    one out     ${String(tally.near).padStart(3)}  ${pc(tally.near)}`);
  console.log(`    misplaced   ${String(tally.misplaced).padStart(3)}`);
  console.log(`    missing     ${String(tally.missing).padStart(3)}`);
  console.log(`    invented    ${String(tally.extra).padStart(3)}`);
  console.log(`    past end    ${tally.trailingRight} right, ${tally.trailingWrong} wrong`);
  console.log(`  SCORE   ${pc(right(tally))}`);
  return tally;
}

function right(tally) { return tally.exact + tally.trailingRight; }

if (process.argv[2] && process.argv[3]) {
  const tally = report(
    `${process.argv[2]}  ->  ${process.argv[3]}`,
    readFileSync(process.argv[2], "utf8"),
    readFileSync(process.argv[3], "utf8")
  );
  if (process.argv.includes("--why")) tally.notes.forEach((note) => console.log(`  · ${note}`));
}
