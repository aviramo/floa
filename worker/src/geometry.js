/* ==========================================================================
   From measured boxes to a song.

   Everything in transcribe.js exists because a model was being asked WHERE
   something is on a photograph, and a model does not measure. It looks, and
   from a look it can tell an Am from a G and a chord row from a lyric row, but
   asked which of two adjacent Hebrew letters a symbol's middle is over it
   estimates, and an estimate lands on the neighbour often enough to be the one
   error four rounds of prompt work could not remove.

   An OCR engine does measure. It hands back every glyph it found with the
   rectangle it occupies, in pixels, and the same picture gives the same
   rectangles every time. So the question stops being a judgement:

       the Am's middle is at x=1225
       the ק of בנקיק spans 1240 to 1254, middle 1247
       the י spans 1231 to 1238, middle 1234

   and "which letter is it over" becomes a subtraction. That is what this file
   is: the arithmetic, and the four places where boxes do not answer on their
   own and something has to be assumed. Every one of those is a named constant
   below, so what is being assumed is written down rather than buried.

   NOTHING HERE KNOWS WHERE THE BOXES CAME FROM. Google's OCR, another engine,
   or a model that returns coordinates: if it can say `{ text, x, y, w, h }` it
   can feed this. Which is also why it is testable without a picture, and it is
   tested that way.
   ========================================================================== */

/* --- the four assumptions -------------------------------------------------

   1. WHAT MAKES A ROW. Glyphs sit on a printed line, and OCR reports them one
      by one with no notion of which line they were on. Two glyphs are on the
      same row when their vertical middles are nearer than this fraction of the
      row's height. Generous enough for a photograph taken at a slight angle,
      tight enough that a chord row and the words under it stay apart. */
const SAME_ROW = 0.55;

/* 2. WHAT MAKES A SPACE. Printing has spaces; a list of boxes has gaps. A gap
      wider than this many typical glyph widths is a word break. Hebrew sets
      words tightly and the space between them is wide, so this is not a close
      call in practice. */
const SPACE_GAP = 0.55;

/* 3. HOW FAR A CHORD REACHES DOWN. A chord row belongs to the words UNDER it,
      never over it, and it may be printed anywhere from touching them to a
      third of a line away. Beyond this many row heights it belongs to nothing,
      which is what keeps a stray mark at the top of a page from being hung on
      the first verse. */
const CHORD_REACH = 3.5;

/* 4. WHAT MAKES A ROW A CHORD ROW. Chord symbols are Latin tokens floating on
      their own line. A row is a chord row when this share of what it holds
      reads as a chord, which lets one misread symbol through without turning a
      line of lyrics into chords or the other way round. */
const CHORD_SHARE = 0.6;

/* A symbol, in Latin notation, as chord sheets print them. Deliberately strict:
   this is the only thing standing between a row of chords and a row of words,
   and a loose pattern would make "F" out of every stray letter on the page. */
const CHORD = /^[A-G](#|b|♯|♭)?(m|maj|min|M|dim|aug|sus|add|°|\+)?[0-9]{0,2}(sus|add|maj|dim)?[0-9]{0,2}(\/[A-G](#|b|♯|♭)?)?$/;

/* THE MARK COMES BACK STUCK TO THE CHORD, about half the time. A sheet prints
   a tick under each symbol and an engine reading the page has no reason to
   think it is not punctuation, so "Am" arrives as "Am," or "C'" or "G7." with
   no warning and no pattern: whether the mark gets its own box depends on how
   far from the symbol the printer set it.

   Which is why this exists rather than trimming being done at the call site.
   The mark is not part of the name and never was, so it comes off both ends
   before anything looks at what is left. What may stay is only what a chord is
   spelt with, which is how Bb keeps its b and C# keeps its sharp while a comma
   or an apostrophe goes.

   Getting this wrong is expensive and silent: a symbol that fails to read as a
   chord is dropped without a word, and a page can lose two thirds of its
   chords while looking like a page that simply had fewer. */
export function nameOf(text) {
  return String(text ?? "")
    .trim()
    /* And when the mark is set CLOSE under the letter it comes back as an
       accent on it rather than as punctuation beside it: the C of a chord
       sheet arrives as Ç, the G as Ģ, which is a perfectly reasonable thing to
       read and not a chord anybody has ever played. Pulled apart into letter
       and mark, and the mark dropped, which leaves what was printed. */
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/^[^A-Za-z]+/, "")
    .replace(/[^A-Za-z0-9#b♯♭+°/]+$/u, "");
}

export function isChord(text) {
  const value = nameOf(text);
  return value.length > 0 && value.length <= 16 && CHORD.test(value);
}

/* Which way a piece of text runs, or null for a neutral that runs whichever
   way its neighbours do. Digits count as Latin because they are read that way
   inside Hebrew too, and because the 7 of G7 must stay behind its G. */
const STRONG_RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const STRONG_LTR = /[A-Za-z0-9À-ɏ]/;

function scriptOf(text) {
  if (STRONG_RTL.test(text)) return "rtl";
  if (STRONG_LTR.test(text)) return "ltr";
  return null;
}

const midX = (box) => box.x + box.w / 2;
const midY = (box) => box.y + box.h / 2;

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/* --- rows -----------------------------------------------------------------
   The boxes, gathered back into the printed lines they came off.

   Top to bottom, and by the middle of each glyph rather than its top, because
   a ל and a ם on the same line do not start at the same height and their
   middles very nearly do. The row's own height is kept as a running median for
   the same reason: one tall glyph should not widen the row's idea of itself
   and start swallowing the line below.

   Exported for the test, which is the only way an assumption stays honest. */
export function rowsOf(boxes) {
  const rows = [];

  const kept = boxes.filter((box) => box && String(box.text ?? "").trim());

  /* 5. WHAT IS NOT WRITING. A scan catches the rule down the margin, the edge
        of the paper, the shadow of a staple, and hands each of them over as a
        character: usually a | or an l, tall and thin and spanning several
        lines at once. One of those is worse than a stray letter, because a box
        that tall makes the row it lands in believe it is tall too, and a tall
        row reaches down and swallows the one beneath it.

        Anything far taller than the page's own letters is therefore not a
        letter. Measured against the median rather than a number, so it holds
        for a photograph at any size. */
  const tall = median(kept.map((box) => box.h)) * 2.5;

  kept
    .filter((box) => !(tall > 0 && box.h > tall))
    .sort((a, b) => midY(a) - midY(b))
    .forEach((box) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(midY(box) - row.middle) < row.height * SAME_ROW) {
        row.boxes.push(box);
        row.heights.push(box.h);
        row.height = median(row.heights);
        row.middle = (row.middle * (row.boxes.length - 1) + midY(box)) / row.boxes.length;
        return;
      }
      rows.push({ boxes: [box], heights: [box.h], height: box.h, middle: midY(box) });
    });

  return rows;
}

/* --- one row, as a string that remembers where every character was ---------

   The row read in the direction the language runs, spaces put back where the
   printing left room for them, and alongside it a cell for every character
   saying which pixels it occupies. The cells are the whole point: a chord is
   matched against a cell and written against an index, so the two have to be
   the same list.

   A BOX THAT HOLDS SEVERAL CHARACTERS IS SHARED OUT EVENLY ALONG ITS WIDTH,
   and this is the one place the file guesses. An engine that measures every
   glyph gives one character per box and nothing is assumed; an engine that
   only measures whole words leaves the letters inside them to be spaced by
   arithmetic. Hebrew square script is near enough to even for that to pick the
   right letter nearly always, and where it does not, the miss is one letter,
   which is exactly where this started. So: prefer glyph boxes. */
export function layout(row, rtl) {
  /* Left to right, which is the only order the pixels actually have. What
     order they are READ in is worked out below; what order they are PRINTED in
     is this, and the two are not the same thing on a Hebrew page. */
  const visual = row.boxes.slice().sort((a, b) => midX(a) - midX(b));
  const unit = median(visual.map((box) => box.w / Math.max(1, [...String(box.text)].length)));

  /* spaces put back where the printing left room for them, as items in their
     own right, because a chord can sit on one */
  const items = [];
  visual.forEach((box, index) => {
    if (index) {
      const before = visual[index - 1];
      const gap = box.x - (before.x + before.w);
      if (gap > unit * SPACE_GAP) {
        items.push({ text: " ", x: before.x + before.w, w: Math.max(1, gap) });
      }
    }
    items.push({ text: String(box.text), x: box.x, w: box.w });
  });

  /* --- which order it is read in ------------------------------------------
     A CHORD SHEET IS A BIDIRECTIONAL DOCUMENT and there is no getting around
     it. The words run right to left and the chord symbols over them are Latin,
     which runs left to right, on the same page and often on the same line. One
     sort cannot express that: sorting everything rightmost first turns Am into
     mA, and sorting everything leftmost first turns שלום into םולש.

     So the row is cut into runs of one script, the runs are ordered the way
     the page runs, and each run is read the way its own script runs. Which is
     the Unicode bidi algorithm in miniature, and enough of it for a page whose
     only Latin is three characters long.

     A space always ends a run. Between a Hebrew word and a Latin one it
     belongs to neither, and letting it stick to whichever it met first puts it
     on the wrong side of the boundary. Other neutrals, a full stop or the tick
     printed under a chord, join whatever they sit beside. */
  const runs = [];
  items.forEach((item) => {
    const script = /^\s+$/.test(item.text) ? "space" : scriptOf(item.text);
    const run = runs[runs.length - 1];

    if (!run || script === "space" || run.script === "space") {
      return runs.push({ script, items: [item] });
    }
    if (script === null || run.script === null || run.script === script) {
      if (run.script === null && script) run.script = script;
      return run.items.push(item);
    }
    runs.push({ script, items: [item] });
  });

  let text = "";
  const cells = [];

  (rtl ? runs.slice().reverse() : runs).forEach((run) => {
    const backwards = run.script === "rtl" || (run.script !== "ltr" && rtl);
    (backwards ? run.items.slice().reverse() : run.items).forEach((item) => {
      /* Inside one box the characters are already in the order they are read,
         whatever the box holds: an engine that measured a whole word gives the
         word, not the word backwards. Only WHERE each of them sits depends on
         the direction, and that is what the cells are for. */
      const chars = [...item.text];
      const step = item.w / chars.length;
      chars.forEach((char, i) => {
        text += char;
        cells.push({ x: backwards ? item.x + item.w - (i + 1) * step : item.x + i * step, w: step });
      });
    });
  });

  return { text, cells };
}

/* --- tokens ---------------------------------------------------------------
   What the printing separated with spaces, each with the pixels it covers.

   Taken from the laid out row and NOT from the boxes, and the difference is
   the whole of it. A box is whatever the engine chose to measure: one that
   reports every glyph hands back "A" and "m" as two of them, and "A" on its
   own reads as a chord while "Am" reads as the chord it actually is. What
   separates one chord from the next on a sheet is a space, so a space is what
   this splits on, whatever the boxes were. */
export function tokensOf(laid) {
  const tokens = [];
  let start = -1;

  for (let i = 0; i <= laid.text.length; i++) {
    const space = i === laid.text.length || /\s/.test(laid.text[i]);
    if (!space && start < 0) start = i;
    if (!space || start < 0) continue;

    const cells = laid.cells.slice(start, i);
    const x = Math.min(...cells.map((cell) => cell.x));
    tokens.push({
      text: laid.text.slice(start, i),
      start,
      x,
      w: Math.max(...cells.map((cell) => cell.x + cell.w)) - x,
    });
    start = -1;
  }

  return tokens;
}

/* Which way this page runs. Asked of the page rather than set by hand, because
   a sheet knows: chord symbols are Latin on every sheet in the world, so the
   only thing worth counting is the words. */
export function directionOf(boxes) {
  const seen = { rtl: 0, ltr: 0 };
  boxes.forEach((box) => {
    [...String(box?.text ?? "")].forEach((char) => {
      const script = scriptOf(char);
      if (script) seen[script]++;
    });
  });
  return seen.rtl > seen.ltr ? "rtl" : "ltr";
}

/* --- the song -------------------------------------------------------------
   Rows sorted into chords and words, each chord dropped onto the row beneath
   it, and each one placed on the character its middle is nearest.

   Returns the lines of the song, each with its chords already carrying a
   CHARACTER POSITION, which is the same shape the rest of the reader works in
   and can be written out by the same writer. */
export function songFrom(boxes, dir, notes) {
  const rtl = dir !== "ltr";
  const say = (line) => { if (notes) notes.push(line); };

  const rows = rowsOf(boxes).map((row) => {
    const laid = layout(row, rtl);
    const tokens = tokensOf(laid);
    const chords = tokens.filter((token) => isChord(token.text)).length;
    return {
      ...row,
      text: laid.text,
      cells: laid.cells,
      tokens,
      /* A row of nothing but chord symbols is a chord row. A line of words with
         one chord-shaped word in it, a lone "F" or "A", is not. */
      isChords: tokens.length > 0 && chords / tokens.length >= CHORD_SHARE,
    };
  });

  const lyrics = rows.filter((row) => !row.isChords);
  const lines = lyrics.map((row) => ({ text: row.text, placed: [], trailing: [] }));

  say(`${rows.length} rows, ${rows.length - lyrics.length} of chords`);
  rows.forEach((row) => say(`  ${row.isChords ? "chords" : "words "} | ${row.text}`));

  rows.filter((row) => row.isChords).forEach((row) => {
    /* the words this row of chords is printed above: the nearest lyric row
       BELOW it, and only if it is near enough to be about it */
    let owner = -1;
    let nearest = Infinity;
    lyrics.forEach((line, index) => {
      const drop = line.middle - row.middle;
      if (drop <= 0 || drop > row.height * CHORD_REACH) return;
      if (drop < nearest) { nearest = drop; owner = index; }
    });
    if (owner < 0) return say(`  no words under: ${row.text}`);

    const line = lines[owner];
    const cells = lyrics[owner].cells;

    row.tokens.forEach((token) => {
      const name = nameOf(token.text);
      /* Said out loud, because this is where a chord disappears without
         anything looking wrong. A page that quietly loses two thirds of its
         symbols reads exactly like a page that had fewer. */
      if (!isChord(name)) return say(`  not a chord: ${JSON.stringify(token.text)}`);

      /* Middle against middle, which is the whole of it. The last character
         the chord can belong to is the last one printed; past that it is a
         chord with no word under it, and those carry a distance from the words
         rather than a place among them. */
      const at = token.x + token.w / 2;
      let best = -1;
      let closest = Infinity;
      cells.forEach((cell, index) => {
        const gap = Math.abs(at - (cell.x + cell.w / 2));
        if (gap < closest) { closest = gap; best = index; }
      });

      const last = cells[cells.length - 1];
      const past = rtl ? at < last.x : at > last.x + last.w;
      if (best < 0 || past) return line.trailing.push({ name, at });

      line.placed.push({ name, pos: best });
    });
  });

  /* Trailing chords keep the order they were PRINTED in, nearest the words
     first, which on a Hebrew line means rightmost first. A distance has no
     direction in it and cannot come out backwards, which is the same reason
     the model is asked for one rather than for a sequence. */
  lines.forEach((line) => {
    line.placed.sort((a, b) => a.pos - b.pos);
    line.trailing.sort((a, b) => (rtl ? b.at - a.at : a.at - b.at));
    line.trailing = line.trailing.map((chord) => ({ name: chord.name }));
  });

  return lines;
}
