/* ==========================================================================
   Reading a chord sheet.

   Photographs or a PDF go in, a song lands in the database. This lives in the
   Worker for one reason: the Anthropic key must never reach a browser, exactly
   like the Resend key next door. Nothing is stored here; the picture is read
   once and forgotten.

   THREE THINGS SHAPE THIS FILE, and all three were learned the hard way.

   1. It STREAMS. A careful read of a full page takes minutes, and a request
      that quiet for that long is cut off at a hundred seconds with a 524
      before a single word comes back. A stream keeps bytes moving, so the time
      it takes stops being a failure mode.

   2. It FINISHES WITHOUT ANYONE WATCHING. It runs inside a Workflow (see
      read-workflow.js, which also records the two designs that failed before
      it) and writes the result to Supabase itself, in the user's own name with
      the token the endpoint verified. So closing the tab costs nothing.

   3. IT ASKS EACH CHORD TO NAME ITS OWN LETTER. The hard part of this work was
      never reading the text, it was saying where each chord goes, and the
      question has now been asked three different ways.

      Asking for a character index meant counting from the right-hand end of a
      Hebrew line, which nobody does reliably. Asking for a document instead,

          [Am]שלום לך אדו[G]ני

      removed the counting, and read well, and was still wrong in two ways that
      the shape of the answer could not stop: writing the line left to right
      quietly reversed the chords in the middle of it, and a bracket, having
      nothing to hold onto, drifted to the front of the nearest word.

      So now each chord is asked for on its own terms:

          { chord: "C", word: 1, letter: "ל", letters_before: 2 }

      which says the C is over the third letter of the first word. Three things
      follow from that, and they are the whole reason for this file's shape.

      The ORDER is no longer something this code can get wrong: each chord
      names its own word and the sort below does the rest, so a line can no
      longer come out backwards because of the sequence the chords arrived in.
      That is narrower than it sounds and the difference matters. A model can
      still name the WRONG word, and a chord named onto its neighbour's word is
      indistinguishable from a chord swapped with it. What was removed is the
      mechanism, not the mistake.

      The DRIFT has somewhere to catch, because `letter` and `letters_before`
      say the same thing twice. Where they disagree the letter wins, since
      naming a glyph is the judgement being asked for and the count is only the
      arithmetic on top of it.

      And RIGHT TO LEFT never comes up. Nothing is counted along a line, so
      there is no direction for it to be counted in.

      What is left after all that is one persistent error, and it is small: the
      chord lands on the letter NEXT DOOR. Hebrew letters are narrow, a chord
      symbol is several of them wide, and an answer read off the symbol's
      general area is a guess between two neighbours.

      THE SHEET ALREADY ANSWERS THIS, and the prompt used to treat the answer
      as a tiebreak. Printed sheets set a small tick under each symbol, exactly
      because the symbol is too wide to point with. So the tick is now the
      question being asked, and the symbol's middle is the fallback for a sheet
      that has none: the mark is a statement about one letter, and the middle
      is an estimate over four.

      AND THEN THE QUESTION WAS TAKEN AWAY FROM IT ALTOGETHER. Everything above
      is the fallback now. Asking a model where something is on a page is
      asking it to measure, and it does not measure: it looks and estimates,
      and an estimate on a letter ten pixels wide lands on the neighbour often
      enough that four rounds of this could not remove it. An OCR engine
      measures, for a fifth of a cent, and gives the same answer twice. See
      ocr.js for the ruler and geometry.js for the arithmetic.
   ========================================================================== */

import { canMeasure, measure } from "./ocr.js";
import { directionOf, songFrom } from "./geometry.js";

/* --- what the read costs --------------------------------------------------
   Three lines, and they are a trade rather than a fact, so here is what each
   setting actually did on a real Hebrew sheet:

     Sonnet, medium   3 cents,   fast, and WRONG: chords exchanged with their
                                 neighbours and landing a letter or two off.
     Opus, high      42 cents,   three and a half minutes, and then truncated
                                 mid-sentence, because max_tokens caps thinking
                                 and answer together and the thinking ate it.
     Sonnet, high     ~5 cents,  the ORDER came right, which was the structural
                                 failure, but chords still landed a word off
                                 and a repeated phrase was dropped.
     Opus, medium               the words came right, repetitions and all, and
                                 the chords still sat at the fronts of their
                                 words instead of inside them.

   That last one is what settled it: four settings had been tried and the same
   two errors kept coming back, so the setting was not what was wrong. The
   question was. Hence the shape at the top of this file.

   THEN THE LADDER WAS CLIMBED BACK DOWN, ON THE ARGUMENT THAT THE NEW SHAPE
   HAD TAKEN BOTH FAILURES OUT OF THE MODEL'S HANDS, AND IT HAD NOT. Worth
   recording, because the argument was reasonable and still wrong.

     Sonnet, medium,  the chorus came out EXACTLY right, every chord on the
     the new shape    letter it is printed over, which no earlier attempt had
                      managed. And the rest regressed: the first line had two
                      chords on each other's words, and a turnaround printed
                      past the end of the line was broken up and scattered
                      between the syllables of נה נה נה.

     Opus, medium,    29 cents. Nothing structural left to find: the words
     the new shape,   right, the order right, every chord over its own word,
     a sharp picture  the run past the end of the line kept together. And a
                      third of the chords a single letter out, in both
                      directions, on a page whose letters were now as sharp as
                      they were ever going to get.

   Which is what CHORDS_EFFORT going up is buying, and it is the last thing on
   this list that is not a rewrite. See the note above the constants.

   What the sort actually guarantees is narrower than it looked. It makes the
   order impossible to reverse HERE, in the assembling, which was one of the
   two ways the old design could go wrong. It cannot stop a model from naming
   the wrong WORD in the first place, and a chord named onto its neighbour's
   word looks exactly like a chord that was swapped with it. The reversal was
   not designed out of the problem; it was designed out of this file.

   And that is what the bigger model is for. Every remaining error is a
   judgement about a photograph: which word is this symbol above, which letter,
   is that mark past the end of the line or over the last syllable.

   So the model goes back up, and the shape stays. It is worth what it costs
   because the chorus line above is the proof it earned: the shape is what made
   an exactly correct line possible at all, on any model.

   --- WHERE THE MONEY ACTUALLY GOES ------------------------------------------

   Measured rather than guessed, because the obvious economies are all in the
   wrong place. One read of a one-page sheet:

     the system prompt      ~1700 tokens
     the schema              ~700 tokens
     one page of sheet      ~2300 tokens
                            -------------
     all input              ~4700 tokens = about 2 cents

   The page is sent at the largest size the model does not resize, cropped to
   the writing and compressed lightly, and all three of those are deliberate:
   an image is priced by its width and height, so the pixels cost about a third
   of a cent and the sharpness costs nothing at all. See prepare() in the app.
   Being able to tell one Hebrew letter from the one beside it is the whole
   job, and it is the cheapest thing in this file.

     the answer, thinking included, is 3000 to 16000 tokens
                                       = 7 to 40 cents

   So THE PROMPT IS NOT THE COST. Shortening it saves fractions of a cent and
   buys back nothing. Every cent worth having is in the output, and almost all
   of the output is thinking.

   Which is what this file's shape is now for: THE JOB IS TWO JOBS, AND THEY DO
   NOT COST THE SAME. Reading the words off a photograph is copying, and needs
   no judgement at all. Deciding which Hebrew letter a Latin symbol is printed
   over is nothing but judgement, and that is what the thinking is spent on.
   Asked together, the words travel on the chords' expensive ticket.

   So they are asked separately.

     1. THE WORDS. A cheap model, little thinking. Its whole output is the
        lyrics, and it never sees a chord.

     2. THE CHORDS. The good model, and it is handed the words from step 1
        ALREADY NUMBERED, word by word. Its output carries no lyrics at all,
        only the chord entries, and the counting it used to do for itself is
        now a lookup in what it was given.

   The image goes twice, which costs about two more cents of input and is worth
   it several times over. And each half has its own model and its own effort,
   so an experiment is one line rather than a rewrite.

   CHORDS_EFFORT WENT UP TO HIGH AND CAME STRAIGHT BACK DOWN, and both halves
   of that are worth keeping, because the reasoning was sound and the result
   settled it in two reads.

     Opus, high     79.5 cents. It WORKED: the three chords a person had marked
                    as wrong on the previous read were all exactly right, and
                    nothing that had been right moved.
     Opus, high     nothing at all. Ten and a half minutes of thinking, and
                    then the 48000 token ceiling with the answer unwritten,
                    which bills in full and returns a failed row.

   So high effort is not a setting this can carry. It buys real accuracy and it
   pays for it with a variance that has no floor: the cost of a read stops
   being knowable, and one read in some number of them costs a dollar and comes
   back empty. Raising the ceiling only raises the size of that bill.

   And it matters less than it looks, because this whole route is the FALLBACK
   now. What a fallback has to be is cheap and certain, not brilliant and
   occasionally ruinous. Measuring the page is the road.

   Everything else had been tried:
   the question was reshaped so the order cannot come out backwards, the mark
   under the symbol was made the answer rather than a tiebreak, and the picture
   itself was cropped to the writing and sent at the largest size that is not
   resized away. Three reads later the structure was right every time and the
   placing was still a letter out, one way or the other, on about a third of
   the chords.

   That is not a thing prose fixes. Deciding which of two adjacent Hebrew
   letters a symbol's middle is over is a judgement about a photograph, made
   once per chord, and what buys a better judgement is thinking. So the effort
   goes up, and the price goes up with it, and whether that is worth paying is
   a question about this song and not about this file.

   Which leaves the settings below, and one number above them that they answer
   to. */
const WORDS_MODEL = "claude-sonnet-5";
const WORDS_EFFORT = "low";
/* THE BIG MODEL CAME OFF THE CHORDS, and what changed was not the evidence but
   the job. Opus was chosen because every remaining error was a judgement about
   a photograph and a better judgement was worth paying for, and that was right
   while this was the only way a song could be read.

   It is not any more. Measuring the page answers the same question with a
   ruler for a fifth of a cent, and this route is what runs when the ruler is
   unavailable. What a fallback owes you is a song at a price you would not
   think twice about, not the best song money can buy: a read that is a letter
   out is one drag to fix, and a read that costs half a dollar is not.

   Sonnet at the same effort thinks about the same amount and is billed at
   three fifths of the rate, so the same budget buys it MORE room to think, not
   less. Which also makes the ceiling less likely to be met. */
const CHORDS_MODEL = "claude-sonnet-5";
const CHORDS_EFFORT = "medium";

/* US dollars per million tokens, so that a read can be priced from the usage
   the API reports rather than guessed at afterwards. A song carries what it
   cost, and the list shows it.

   THESE ARE A COPY OF A PRICE LIST AND WILL GO STALE. A model missing from
   here prices at nothing rather than at a wrong number, because a blank says
   "we do not know" and 0.00 says "it was free". Sonnet 5 also had introductory
   pricing at $2/$10 into 2026, so a read from that period cost less than this
   says; the standard rate is used because it is the one that keeps being
   true. */
const PRICES = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
};

function costOf(model, usage) {
  const price = PRICES[model];
  if (!price || !usage) return null;
  const input = Number(usage.input || 0) * price.input;
  const output = Number(usage.output || 0) * price.output;
  return (input + output) / 10000;          // dollars per million -> US cents
}

/* --- WHAT A SONG MAY COST -------------------------------------------------
   In US cents, and a ceiling rather than a hope.

   Everything else in this file is a judgement about accuracy; this is the one
   number that is a decision about money, so it is written once and everything
   else is derived from it. Change it and the reader changes with it.

   IT IS ENFORCED, NOT INTENDED, and max_tokens is what enforces it. A read is
   priced by what it writes, and almost all of what it writes is thinking, so
   capping the tokens caps the bill. There is nothing else in the request that
   would stop a model spending ten minutes and a dollar on one page, and it has
   done exactly that.

   WHICH TURNS EXPENSIVE INTO FAILED, and that is the trade, said plainly. A
   song that would have run past the ceiling now stops at it and comes back as
   a failed row, paid for and empty. That is worth taking only because a bill
   with no top is worse than a failure with a known price, and because this
   route is the fallback: measuring the page costs a fifth of a cent and is
   where a song should be coming from.

   The input side is not modelled. It is two or three cents whatever happens,
   and pretending to control it would only make this arithmetic look more
   precise than the price list it rests on. */
const MAX_CENTS = 50;

/* How alike the measured words and the read words must be for the measuring to
   be kept. High on purpose: the two are reading the same page and ought to
   agree almost exactly, so anything short of that is the measuring having lost
   something, and what it lost is worth more than the forty cents saved. */
const TRUST_MEASURED = 0.65;

/* And how alike two LINES must be to count as the same line. Compared line by
   line rather than song against song, because the judge is fallible too: the
   words half of the model misread "כי השם" as "כי הוה" on one page, and a
   whole song's worth of correctly measured chords was thrown away over it.

   A song is not one long string, it is a list of lines, and two readings that
   agree on eight lines out of nine agree about the song. Measuring it as one
   bag lets a single word either side pull the total under the bar, which
   punishes the measuring for a mistake the model made about it. */
const LINE_ALIKE = 0.8;

/* How much of one reading the other one also found. Every line is matched
   against its best partner rather than against the line with the same number,
   because a reader that split one printed line in two has not misread the
   song, it has counted differently, and the lines it did read are still right.
   The denominator is the LONGER of the two, so a line that only one of them
   has still costs. */
export function agreement(mine, theirs) {
  const split = (doc) => String(doc).split(String.fromCharCode(10)).map((line) => line.trim()).filter(Boolean);
  const ours = split(mine).map(bagOf);
  const yours = split(theirs).map(bagOf);
  if (!ours.length || !yours.length) return 0;

  const found = ours.filter((line) =>
    yours.some((other) => likeness(line, other) >= LINE_ALIKE)).length;
  return found / Math.max(ours.length, yours.length);
}

/* The budget, split and turned into token counts. The words get a small slice
   because copying lyrics is small work: a long song runs to a couple of
   thousand tokens and this leaves room for several. The judgement gets the
   rest, because the judgement is what the money is for. */
const cap = (model, cents) => Math.floor((cents / 100 / PRICES[model].output) * 1e6);
const WORDS_MAX_TOKENS = cap(WORDS_MODEL, MAX_CENTS * 0.15);
const CHORDS_MAX_TOKENS = cap(CHORDS_MODEL, MAX_CENTS * 0.8);

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

/* Not the finished document: the raw observations it is built from. Every
   chord is a separate little answer that names the word it stands over, the
   letter it stands over, and how far into the word that letter is. The
   assembling happens below, in code.

   Forcing the shape here rather than asking for it in prose is what makes the
   answer safe to hand straight to the editor. */
const CHORD = {
  type: "object",
  additionalProperties: false,
  required: ["chord", "word", "letter", "letters_before"],
  properties: {
    chord: {
      type: "string",
      description: "The chord symbol exactly as printed: Am, F#m7, G/B, Cmaj7, Bdim.",
    },
    word: {
      type: "integer",
      description:
        "Which word of this line the chord is printed above. 1 is the word the line STARTS with, which on a Hebrew line is the rightmost word on the page. 0 means the chord is printed past the end of the last word, out on its own.",
    },
    letter: {
      type: "string",
      description:
        "The single letter this chord sits on. If a small mark is printed under the chord symbol, a tick, comma, apostrophe or short stroke, the letter it points down at IS the answer; the mark was put there by whoever wrote the sheet to say exactly this. Only where there is no mark: drop a vertical line from the middle of the symbol and take the letter whose own middle it passes closest to. It must be one of the letters of that word. Empty string only when word is 0.",
    },
    letters_before: {
      type: "integer",
      description:
        "How many letters of that word come before that letter, counting from the word's own beginning. 0 means the chord is over the word's first letter, 2 means it is over its third. WHEN word IS 0 this means something else: how many other chords stand between this one and the last word, so 0 for the one nearest the words, 1 for the next one out, and so on.",
    },
  },
};

/* Step one's answer: the song in words, and nothing about chords. */
const WORDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "lyrics_by", "music_by", "dir", "lines"],
  properties: {
    title: { type: "string", description: "The song's name as printed, or an empty string if the sheet does not name it." },
    lyrics_by: { type: "string", description: "Who wrote the words, if the sheet says so (often after \"מילים:\"), otherwise an empty string. Several people are separated by a comma: \"דביר כהן, ליאת ציון\"." },
    music_by: { type: "string", description: "Who wrote the tune, if the sheet says so (often after \"לחן:\"), otherwise an empty string. Several people are separated by a comma." },
    dir: { type: "string", enum: ["rtl", "ltr"], description: "rtl when the lyrics are Hebrew or Arabic, ltr otherwise." },
    lines: {
      type: "array",
      description: "The song, top to bottom, one entry per printed line of words. An empty string for a blank line between stanzas. A heading such as a chorus marker is written in braces: {פזמון}.",
      items: { type: "string" },
    },
  },
};

/* Step two's answer: chords only, each one against a line number it was given
   rather than one it worked out. Nothing here repeats the lyrics, which is
   most of why this step is cheap. */
const CHORDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      description: "One entry per numbered line that has any chords above it. Lines with none may be left out.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["line", "first_chord", "chords"],
        properties: {
          line: { type: "integer", description: "The line's number, exactly as given in the numbered list." },
          first_chord: {
            type: "string",
            description:
              "The chord symbol printed nearest the START of this line: the RIGHTMOST symbol above it on a Hebrew line, the leftmost on an English one. Just the symbol, for example \"Am\". Empty string if the line has no chords.",
          },
          chords: {
            type: "array",
            description: "Every chord symbol printed above that line, one entry each. The order of this array does not matter and is not used.",
            items: CHORD,
          },
        },
      },
    },
  },
};

/* Step one. Copying, not judging: no chord is mentioned anywhere in here, and
   there is nothing in the job that needs weighing up. */
const WORDS_SYSTEM = `You read photographs or scans of a chord sheet and write out THE WORDS OF THE SONG. Nothing else.

A chord sheet is lyrics with chord symbols printed on their own lines, floating above the words. IGNORE THE CHORD SYMBOLS ENTIRELY. They are somebody else's job. You are copying out the lyrics, line by line, exactly as they are printed.

- One entry per printed line of words, top to bottom.
- Copy each line as printed: same words, same spelling, same punctuation, including Hebrew niqqud if it is there. Do not translate, do not transliterate, do not correct, do not tidy.
- A blank line between stanzas is an empty entry. Keep it: the line numbering that follows depends on it.
- A heading that names a part of the song is a line in braces: {פזמון}, {בית}, {מעבר}, {Chorus}, {Intro}.
- A line of the sheet that has chord symbols and no words under them is still a line: give it as an empty entry, or as whatever few words it does have.

- REPEATED PHRASES ARE REPEATED EXACTLY AS OFTEN AS THE PAGE REPEATS THEM. This is the one error here that hides itself: a line reading "אילה מה לי ולה מה לי ולה מה לי ולה" comes back as "אילה מה לי ולה מה לי מה לי ולה" and reads perfectly well, so nothing about it looks wrong. It is wrong. Count the repetitions on the page before you write the line, then count them in what you wrote. Three means three.

- Several images are pages of ONE song, in the order given. Return them as one song.
- Anything that is not the song itself, such as a page number, a website name or a printed comment, is left out.
- If part of the image is unreadable, give the lines you can read rather than inventing the rest.

The title, and the credits if the sheet prints them, come from the page too. A Hebrew sheet usually writes them as "מילים:" and "לחן:".`;

const WORDS_TEXT = "This is a chord sheet. Write out its words, line by line, ignoring the chord symbols completely.";

/* Step two. Nothing but judgement, and every fact it does not have to judge is
   handed to it: the lines, their numbers, the words, and the words' numbers. */
const CHORDS_SYSTEM = `You are looking at a photograph of a chord sheet: lyrics with chord symbols printed on their own lines, floating above the words.

The words have already been read for you, and they are given below the picture, numbered by line and numbered by word within each line. YOU DO NOT NEED TO READ THE WORDS AND YOU MUST NOT REPEAT THEM. Your entire job is to say, for every chord symbol on the page, WHICH LETTER OF WHICH WORD it is printed above.

A chord entry answers three questions about ONE chord symbol:

  word            which word of that line it stands over, by the number given
  letter          which letter of that word its middle stands over
  letters_before  how many letters of the word come before that letter

Inside a word, the first letter is the one the word begins with: for בנקיק the letters are ב, נ, ק, י, ק in that order, and letters_before 2 means the third of them, the ק.

An example. Line 4 is given to you as

    4: אילה מה לי
       1=אילה 2=מה 3=לי

and the picture shows

              C
        אילה מה לי

The C's middle is over the ל of אילה, which is word 1 and its third letter, so that chord is

    { chord: "C", word: 1, letter: "ל", letters_before: 2 }

THE ORDER OF THE CHORDS DOES NOT MATTER. Every chord names its own word, and they are sorted afterwards by what they name. Do not list them in any particular sequence, and above all do not read the chord line as a row of symbols and then hand them out to the words in the order you read them: Latin symbols read left to right and Hebrew words read right to left, and handing one sequence to the other puts every chord in the middle of the line onto its neighbour's word. Take ONE symbol, look straight down from its middle, find what is under it, write that entry. Then the next symbol. Where you start and how many you have done change nothing.

AND SAY WHICH CHORD COMES FIRST. Every line also asks for first_chord: the symbol printed nearest the START of that line. On a Hebrew line the line starts on the right, so that is the RIGHTMOST symbol above it. On an English line it is the leftmost.

This is asked separately, and it is not a formality. It is the same fact as "the chord over the earliest word", said a second way, and where the two disagree the whole line has been laid out backwards and will be turned around. Answer it by looking at the page, not by looking at what you have already written.

WHICH LETTER, EXACTLY

- LOOK FIRST FOR THE MARK UNDER THE CHORD. Most printed sheets put a small stroke below each symbol: a tick, a comma, an apostrophe, a short slanted line. It is not decoration and it is not punctuation belonging to the words. Whoever set the sheet put it there to say WHICH LETTER, precisely, because the symbol itself is wide and the letter under it is narrow.

  Where that mark exists it IS the answer. Follow it straight down and name the letter it lands on. Do not then check the answer against the middle of the symbol and change your mind: the symbol is an estimate and the mark is a statement, and where they disagree the mark is right.

- Only where there is no mark: take the chord symbol's horizontal MIDDLE, not its left edge and not its right edge. Drop a straight vertical line down from it into the words. Then name the letter whose OWN MIDDLE that line passes closest to.

  Middle against middle, both times. A chord sits ON a letter, not in the space between two of them, so what decides which letter is the distance from the middle of the symbol to the middle of each candidate: whichever is smallest is the answer. A symbol that hangs slightly past the end of a letter still belongs to that letter if its middle is nearer to that letter's middle than to the next one's.

- ONE LETTER OFF IS THE ERROR THIS JOB ACTUALLY MAKES. Not a wild miss: the neighbour, and it goes either way. Measured on a real sheet, four chords in one song: the one printed over a ק came back as the י beside it, one over a ל came back as the ה after it, another over a ל came back as the ה after it, and one over a ל came back as the י before it.

  A chord symbol is three or four Hebrew letters wide and the letters are narrow, so an answer taken from the symbol's general area is a coin toss between two neighbours. Two habits make it worse and both are worth naming. Latin text BEGINS AT ITS LEFT EDGE, and looking at where writing starts is what anyone does with writing; on a Hebrew line the left edge is one to two letters FURTHER ALONG the word than the middle, because the words run the other way. And a symbol that overhangs the end of a word looks like it belongs to the next one, when what decides is still the middle.

  So: not the left edge, not the right edge, not where the symbol begins. THE MARK UNDER IT, or failing that the MIDDLE. Then say which letter that is, and count how many letters come before it, and check the two against each other before you write them down.

- CHORDS DO NOT PREFER THE STARTS OF WORDS. This is the mistake that keeps happening, so it is worth naming: a chord lands wherever the singer changes note, which is inside a word at least as often as at its edge. letters_before is 0 far less often than it looks. If the symbol's middle is over the third letter, say so; do not round it back to the front of the word, and do not move it onto the neighbouring word either.

  On a real sheet the line

              G7    E         Am          G       C
        אילה מה לי ולה מה לי ולה מה לי ולה

  reads: C over the ל of אילה, G over the ל of the first ולה, Am over the ל of the second ולה, E over the ל of the third ולה, and G7 past the end of the line. Every one of those five is inside a word or past the words. Not one of them is at the front of anything.

- A chord printed out past the last word, or standing alone in a gap with no word under it, is word 0 with an empty letter. For these, and only these, letters_before says HOW FAR OUT it is: 0 for the chord nearest the words, 1 for the next one beyond it, 2 for the one beyond that.

  Say it that way, as a distance from the words, and never as a sequence. The sequence is the trap: a row of Latin symbols is read left to right, a Hebrew line runs right to left, and a run of chords listed in the order the eye met them comes out backwards. "Nearest the words" has no direction in it and cannot come out backwards. On a Hebrew line the chord nearest the words is the RIGHTMOST of the run, and the one furthest out is the leftmost.

  A line of the song whose chords are ALL printed past its words, a turnaround or an outro, is a whole line of word 0 entries; do not scatter them in among the syllables to find them homes.

- A line with no chords above it can be left out altogether.

- Copy each chord as printed, in Latin notation: A to G, with # or b, and whatever follows (m, 7, maj7, sus4, dim, add9) and any slash bass such as G/B.

BEFORE YOU ANSWER

Go over each line once more and check two things.

The COUNT: you gave exactly as many chord entries for that line as the page has chord symbols above it. A missing one and an invented one both read as plausible.

The WORD: each chord names the word its middle is actually over. A chord one word along from where it belongs is the failure this task has, and it is invisible unless it is looked for.

The SPREAD: chords are spread along a line the way they are spread along the page. Two of your entries naming the SAME word, or two neighbouring words, while some earlier word with a symbol plainly above it has been given nothing, means one of them has travelled. Find which, and put it back where the page has it. On a real sheet the line

        C          Em        D
  אילה מה לי ולה אלא אהבתי

  came back with the Em and the D right and the C moved from the first word to the last, so the line read as though it began on nothing and ended on three chords at once. Every symbol above a line has its own place along that line; none of them bunch up at the end.

THE DIRECTION: the chord you gave the earliest word is the same one you named as first_chord. If it is the one you named LAST, you have laid the row of symbols onto the words from the wrong end, and every chord on the line is on somebody else's word.`;

const CHORDS_TEXT =
  "Here is the sheet again, and the words that have already been read from it, numbered.\n\n" +
  "For every chord symbol printed on the page, say which numbered word it stands over and which letter of it.\n\n";

/* --- the model ------------------------------------------------------------
   Streamed, and read with a deliberately cheap parser. A long answer arrives
   as thousands of small events, and this Worker has a CPU budget measured in
   milliseconds, so a line is only parsed as JSON once a substring test says it
   could possibly matter. Everything else is skipped without being looked at. */
async function streamText(env, body, onProgress) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (!response.ok) {
    throw new Error(`anthropic ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let text = "";
  let stopReason = null;
  /* What it cost, said by the side that charges for it. The input count comes
     with the first event and the output count with the last, and taking both
     from the stream is the only way to price a read without asking for the
     bill afterwards. */
  const usage = { input: 0, output: 0 };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    if (onProgress) onProgress(text.length);

    let cut;
    while ((cut = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 1);
      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();
      if (
        payload.indexOf('"text_delta"') < 0 &&
        payload.indexOf('"stop_reason"') < 0 &&
        payload.indexOf('"message_start"') < 0 &&
        payload.indexOf('"type":"error"') < 0
      ) continue;

      let event;
      try { event = JSON.parse(payload); } catch { continue; }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") text += event.delta.text;
      else if (event.type === "message_start") {
        usage.input = Number(event.message?.usage?.input_tokens || 0);
      } else if (event.type === "message_delta") {
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage?.output_tokens) usage.output = Number(event.usage.output_tokens);
      } else if (event.type === "error") throw new Error(`anthropic stream: ${event.error?.message || "error"}`);
    }
  }

  return { text, stopReason, usage };
}

/* One question, asked and answered. Everything that can go wrong with an
   answer is turned into an error whose message is safe to store: it is ours,
   never a key. */
async function ask(env, body, onProgress) {
  const { text, stopReason, usage } = await streamText(env, body, onProgress);
  const cost = costOf(body.model, usage);

  /* A FAILURE CARRIES ITS PRICE. An attempt that produced nothing was still
     billed in full, and a song that quietly forgets what its failed half cost
     is telling you it was cheaper than it was. */
  const stop = (message) => Object.assign(new Error(message), { cost });

  if (stopReason === "refusal") throw stop("refusal");
  if (stopReason === "max_tokens") throw stop("truncated");
  if (!text.trim()) throw stop("empty");

  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    throw stop("empty");
  }
  return { answer, cost };
}

/* The words, handed to step two the way step two needs them: numbered by line,
   and within each line numbered by word.

   This is the point of splitting the job. The counting a chord entry rests on
   is done HERE, once, in code that cannot miscount, so what is left for the
   model is looking at a photograph and saying what it sees. Blank lines keep
   their numbers, because a line number that shifts is worse than useless.

   Exported for the test: this is the only place the numbers a whole read hangs
   on are produced, and an off-by-one here would move every chord in the song
   onto the line above or below without anything looking broken. */
export function numbered(lines) {
  return lines.map((line, index) => {
    const text = String(line ?? "").trim();
    const number = index + 1;
    if (!text) return `${number}:`;

    const words = wordsOf(text).map((word, i) => `${i + 1}=${word.text}`).join(" ");
    return `${number}: ${text}\n   ${words}`;
  }).join("\n");
}

/* The measured route, end to end: boxes in, song out, no model anywhere in it.

   WHAT IT DOES NOT BRING BACK is the title and the credits. Those are not on
   the page as geometry, they are on it as meaning, which is a model's job and
   not a ruler's; a song read this way keeps the name of the file it came from,
   the way a song whose sheet never printed a title already does. If measuring
   turns out to read this well, giving the title back is one cheap question and
   a separate decision. */
async function measureSheet(env, files, beat) {
  if (beat) beat("מודד את הדף");

  const { boxes, cost } = await measure(env, files);
  if (!boxes.length) return null;

  /* What the measuring made of the page, in the log. A wrong answer here is
     silent by nature: a chord that failed to read as one is simply not there,
     and the song looks like a song with fewer chords. Reading a page costs a
     fifth of a cent, so the cheap way to fix this is to look at what it saw. */
  const notes = [];
  const dir = directionOf(boxes);
  const lines = songFrom(boxes, dir, notes);
  console.log(`measured ${boxes.length} boxes, ${dir}\n${notes.join("\n")}`);

  const body = tidy(lines.map((line) => writeLine(line.text, line.placed, line.trailing)).join("\n"));

  return { title: "", lyrics_by: "", music_by: "", dir, body, cost };
}

/* Reads one upload, which may be several pages of the same song.

   TWO QUESTIONS, NOT ONE, and the reason is written out at the top of this
   file: copying the words and judging where the chords sit are different jobs
   at wildly different prices, and asked together the cheap one is billed at
   the dear one's rate.

   `beat` is called with the stage in progress, often, so that whoever is
   watching the row sees which half is happening. */
export async function readChordSheet(env, files, beat) {
  /* --- nought: measure it, if there is anything here that can ---------------

     Everything below this is a model being asked WHERE things are on a page,
     and that is the one question it answers by estimating. An OCR engine
     answers it with a ruler, for a fifth of a cent, and the same picture gives
     the same answer twice. So it goes first when it can, and the two questions
     below are the fallback rather than the road.

     A failure here is not a failure of the read. The model route still works
     and always did, so a key that has expired, a quota that has run out or a
     page that came back empty drops through to it rather than costing anybody
     a song. */
  let measured = null;
  if (env.GOOGLE_VISION_KEY && canMeasure(files)) {
    try {
      measured = await measureSheet(env, files, beat);
      if (!measured) console.log("vision found nothing on the page; reading it instead");
    } catch (err) {
      console.error("vision failed, reading the page instead:", err.message);
    }
  }

  const pages = files.map((file) => {
    const source = { type: "base64", media_type: file.media_type, data: file.data };
    return file.media_type === "application/pdf"
      ? { type: "document", source }
      : { type: "image", source };
  });

  /* --- one: the words --- */
  const first = await ask(env, {
    model: WORDS_MODEL,
    max_tokens: WORDS_MAX_TOKENS,
    system: WORDS_SYSTEM,
    output_config: {
      effort: WORDS_EFFORT,
      format: { type: "json_schema", schema: WORDS_SCHEMA },
    },
    messages: [{ role: "user", content: [...pages, { type: "text", text: WORDS_TEXT }] }],
  }, () => beat && beat("קורא מילים"));

  const words = first.answer;
  const lines = Array.isArray(words.lines) ? words.lines.map((line) => String(line ?? "")) : [];
  if (!lines.some((line) => line.trim())) throw new Error("empty");

  /* --- one and a half: is the measuring to be believed -----------------------

     THE WORDS ARE THE WITNESS. Measuring a page costs a fifth of a cent and is
     exact when it works; when it fails it fails structurally, losing a line,
     running two together, reading a mark as a letter. And every one of those
     failures shows up in the WORDS, because a chord's place is an index into
     them: a page whose text came back right is a page whose rows were found,
     and a page whose text came back wrong was never going to place a chord.

     So the cheap half of the model, which reads nothing but the text, is asked
     the same page and the two are compared. Where they agree the measuring is
     kept and the expensive half is never called: a song for four cents instead
     of forty, with the chords placed by arithmetic rather than by judgement.
     Where they disagree the measuring is thrown away and the model finishes
     the job, which is what it costs today and no more, because this reading of
     the words is the one that would have been paid for anyway.

     Compared as bags of words, for the same reason a twin is (see twinOf):
     two readings of one page are never the same string, and what does not
     change is which words are in it. */
  if (measured) {
    const agree = agreement(measured.body, lines.join(String.fromCharCode(10)));
    if (agree >= TRUST_MEASURED) {
      console.log(`measured and read agree ${Math.round(agree * 100)}%; keeping the measuring`);
      return {
        ...measured,
        /* both answers kept, and the score that chose between them. See the
           `reads` column in schema.sql: a losing answer thrown away is a
           tuning round that has to be paid for twice. */
        reads: { measured: measured.body, agreement: agree, kept: "measured" },
        /* the same word, going the other way: onto the bill rather than onto
           the song, because what a reading was is a fact about the reading and
           the song is written over the first time anybody edits it */
        went: "measured",
        /* the model read the title and the credits off the page, which a ruler
           cannot do, so those come from here even when the song does not */
        title: words.title || measured.title,
        lyrics_by: words.lyrics_by || "",
        music_by: words.music_by || "",
        cost: Math.round(((measured.cost || 0) + (first.cost || 0)) * 100) / 100,
      };
    }
    console.log(`measured and read agree only ${Math.round(agree * 100)}%; reading the chords`);
  }

  /* --- two: the chords -----------------------------------------------------

     AND IF THIS HALF FAILS, THE OTHER HALF IS STILL A SONG. That is the part
     of splitting the job that was not planned and turns out to matter most.

     The words come back in seconds from a cheap model and they almost never
     fail. The chords are the slow, expensive, uncertain half, and it is the
     half that runs out of room. Throwing the whole read away because of it
     costs a song that was already read and already paid for, and leaves an
     empty page in place of the one thing nobody wanted to type out by hand.

     So a failure here is not a failure of the read. The words are kept, the
     song is saved with them, and whoever wanted it puts the chords on
     themselves, which is a quarter of an hour rather than a lost evening. What
     went wrong rides along on the row so the page can say so. */
  let report = { lines: [] };
  let chords = 0;
  let lost = "";

  try {
    const second = await ask(env, {
      model: CHORDS_MODEL,
      max_tokens: CHORDS_MAX_TOKENS,
      system: CHORDS_SYSTEM,
      output_config: {
        effort: CHORDS_EFFORT,
        format: { type: "json_schema", schema: CHORDS_SCHEMA },
      },
      messages: [{
        role: "user",
        content: [...pages, { type: "text", text: CHORDS_TEXT + numbered(lines) }],
      }],
    }, () => beat && beat("מסדר אקורדים"));

    report = second.answer;
    chords = second.cost || 0;
  } catch (err) {
    console.error("the chords failed, keeping the words:", err.message);
    chords = err.cost || 0;
    lost = err.message === "truncated"
      ? `האקורדים עברו את התקרה של ${MAX_CENTS} סנט ולא נקראו. המילים כאן.`
      : "האקורדים לא נקראו. המילים כאן.";
  }

  const song = clean(merge(words, lines, report));
  if (lost) song.note = lost;

  song.reads = {
    measured: measured ? measured.body : null,
    model: song.body,
    agreement: measured ? agreement(measured.body, lines.join(String.fromCharCode(10))) : null,
    kept: "model",
  };

  /* And what the bill will say it was. A read whose chords half fell over is
     not the model's read: it is the words, alone, which is a different thing
     to have paid for and the one thing the page has to be able to tell apart. */
  song.went = lost ? "words" : "model";

  /* Both halves, because the song was read once however many questions it
     took, and a half that failed was billed like a half that worked. Null only
     if neither price was known, which is a missing price list rather than a
     free read. */
  song.cost = first.cost === null && chords === null
    ? null
    : Math.round(((first.cost || 0) + (chords || 0)) * 100) / 100;

  return song;
}

/* The two answers, joined by line number. A chord naming a line that is not
   there is dropped rather than guessed at: it is the one thing in this file
   that cannot be repaired, since there is no word for it to sit on. */
export function merge(words, lines, report) {
  const byLine = new Map();
  (Array.isArray(report?.lines) ? report.lines : []).forEach((entry) => {
    const number = Math.round(Number(entry?.line));
    if (!Number.isFinite(number) || number < 1 || number > lines.length) return;
    const already = byLine.get(number) || [];
    byLine.set(number, already.concat(Array.isArray(entry.chords) ? entry.chords : []));
  });

  return {
    title: words.title,
    lyrics_by: words.lyrics_by,
    music_by: words.music_by,
    dir: words.dir,
    lines: lines.map((line, index) => ({ words: line, chords: byLine.get(index + 1) || [] })),
  };
}

/* --- assembling the document ----------------------------------------------
   The observations come back as words plus a bag of chords, and the ChordPro
   document is built here. This is the half of the new design that does not
   involve a model at all, and it is where the two errors that survived every
   earlier version are made impossible rather than discouraged. */

/* How far past the end of a line a chord with nothing under it is put, and how
   far apart a run of them ends up. Wide enough to read as separate chords,
   near enough to still belong to the line. Anyone can drag them afterwards. */
const TRAIL_GAP = "    ";

/* The words of a line, each with where it starts. Whitespace separated and
   counted in reading order, which needs no special case: word 1 is the first
   word of the string, and a Hebrew string begins with its rightmost word. */
function wordsOf(text) {
  const words = [];
  const pattern = /\S+/g;
  let found;
  while ((found = pattern.exec(text))) words.push({ text: found[0], start: found.index });
  return words;
}

/* One chord, turned into a character position in the line. Null means it has
   no word under it and belongs past the end. */
function positionOf(words, chord) {
  const index = Math.round(Number(chord.word));
  if (!Number.isFinite(index) || index < 1 || index > words.length) return null;

  const word = words[index - 1];
  let at = Math.round(Number(chord.letters_before));
  if (!Number.isFinite(at)) at = 0;
  /* A chord sits ON a letter, so the last one it can reach is the word's last
     letter, not the gap after it. */
  at = Math.max(0, Math.min(word.text.length - 1, at));

  /* The two answers checked against each other.

     The letter and the count say the same thing twice, which is the point of
     asking for both: where they disagree, the letter wins, because naming the
     glyph under the symbol is the judgement being asked for and the count is
     only arithmetic laid on top of it. Nearest matching letter, so a word
     holding the same letter twice does not send the chord to the far end of
     itself. */
  const letter = String(chord.letter ?? "").trim();
  if (letter.length === 1 && word.text[at] !== letter) {
    let best = -1;
    for (let i = 0; i < word.text.length; i++) {
      if (word.text[i] !== letter) continue;
      if (best < 0 || Math.abs(i - at) < Math.abs(best - at)) best = i;
    }
    if (best >= 0) at = best;
  }

  return word.start + at;
}

/* Exported for the test that pins the reference sheet, which is the only way
   the sorting and the letter check stay honest: both of them are invisible
   when they work and were the whole bug when they did not. */
export function chordProLine(line) {
  const text = String(line?.words ?? "").replace(/[\t\r\n]+/g, " ").replace(/ +$/, "");
  const words = wordsOf(text);

  const placed = [];
  const trailing = [];
  (Array.isArray(line?.chords) ? line.chords : []).forEach((chord, index) => {
    const name = String(chord?.chord ?? "").trim().slice(0, 16);
    if (!name) return;
    const pos = positionOf(words, chord);
    if (pos !== null) return placed.push({ name, pos });

    /* Past the end of the line, where there is no word to name. These carry a
       DISTANCE instead: how many other chords stand between this one and the
       words. A distance has no direction in it, which is the whole point, since
       a run of chords listed in the order a Latin-reading eye met them comes
       out backwards over Hebrew words. `index` only breaks ties. */
    let out = Math.round(Number(chord?.letters_before));
    if (!Number.isFinite(out) || out < 0) out = 0;
    trailing.push({ name, out, index });
  });

  trailing.sort((a, b) => a.out - b.out || a.index - b.index);

  /* SORTED HERE, and never taken as given. The order the chords arrived in is
     the order the model happened to look at the page, which for a Hebrew line
     under Latin symbols is frequently backwards. What each chord named is not
     backwards, so the sort is the whole answer. */
  placed.sort((a, b) => a.pos - b.pos);

  /* AND THEN UNMIRRORED, WHICH THE SORT CANNOT DO.

     There is a failure the sort has no hold on, and it is the one this task
     keeps having. The model finds exactly the right letters, every one of
     them, and then lays the row of chord NAMES onto those letters from the
     wrong end. On a real sheet:

         wanted   אי[C]לה מה לי ו[Em]לה אלא אהב[D]תי
         got      אי[D]לה מה לי ו[Em]לה אלא אהב[C]תי

     Identical positions, names reversed, and the middle one unmoved because a
     mirror always leaves the middle alone. Nothing inside that answer
     contradicts itself, so nothing could catch it.

     What catches it is asking the same fact twice, the way `letter` and
     `letters_before` already do for drift. The line separately names the chord
     printed nearest its start, and if that chord turns out to be sitting at
     the FAR end, the row went on backwards and the names come back the other
     way. Positions are not touched: they were right all along.

     Only when the answer is unambiguous. A first_chord that matches both ends,
     or neither, says nothing, and a guess here would move chords that nobody
     showed to be wrong. */
  const first = String(line?.first_chord ?? "").trim();
  if (first && placed.length > 1) {
    const atStart = placed[0].name === first;
    const atEnd = placed[placed.length - 1].name === first;
    if (atEnd && !atStart) {
      const names = placed.map((chord) => chord.name).reverse();
      placed.forEach((chord, index) => { chord.name = names[index]; });
    }
  }

  return writeLine(text, placed, trailing);
}

/* One line written out, given the words and chords that already know where
   they go. The last step of every route through this reader: the model naming
   letters, or an OCR engine measuring them, both arrive here.

   The bracket goes immediately AFTER the character the chord sits on, which is
   what "a chord is on a letter" means written down:

       ABC[Am]DEF     the Am is on the C

   so the slice runs up to and INCLUDING that character. */
export function writeLine(text, placed, trailing) {
  let out = "";
  let at = 0;
  placed.forEach((chord) => {
    const after = Math.max(at, Math.min(chord.pos + 1, text.length));
    out += text.slice(at, after) + "[" + chord.name + "]";
    at = after;
  });
  out += text.slice(at);

  /* Chords with no word under them, nearest the words first, spaced out past
     the end. The spaces are the spacing: this format has nothing else to say
     how far out a chord sits, and the app reads them back as positions past
     the last character. */
  (trailing || []).forEach((chord) => { out += TRAIL_GAP + "[" + chord.name + "]"; });

  return out;
}

/* A finished document, made fit to keep. Both routes end here, because both
   can leave the same untidiness behind and neither of them is a song until it
   has been swept. */
/* Hebrew points and cantillation: the marks written UNDER and OVER a letter,
   never beside it. Not the maqaf, which is a hyphen and belongs to the word,
   and not a Latin accent, because a songbook holds Portuguese too and Mãe is
   spelt with one. */
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;

function tidy(body) {
  const swept = String(body || "")
    /* THE POINTS COME OFF. A printed songbook points its Hebrew; a screen does
       not need it and this one is worse for it. The marks are half the height
       of the letters and the app sets a chord over a CHARACTER, so a pointed
       line is a line where the letters are further apart than they look and
       the chords sit between them. They also arrive unevenly, some read and
       some not, so the same song read twice is two different strings.

       Safe to do at the end, and only at the end: a mark is a character of its
       own that follows the letter it belongs to, so taking one out never moves
       a bracket off the letter it was written after. */
    .replace(NIQQUD, "")
    .replace(/\n{3,}/g, "\n\n")          // no gaps wider than one blank line
    .replace(/[ \t]+$/gm, "")            // trailing space is padding nobody asked for
    .trim()
    .slice(0, 20000);

  if (!swept) throw new Error("empty");
  return swept;
}

/* The schema guarantees the shape; this guarantees it is a song. */
function clean(song) {
  const lines = Array.isArray(song.lines) ? song.lines : [];
  const body = tidy(lines.map(chordProLine).join("\n"));

  const short = (v, max) => String(v ?? "").trim().slice(0, max);

  return {
    title: short(song.title, 120),
    lyrics_by: short(song.lyrics_by, 120),
    music_by: short(song.music_by, 120),
    dir: song.dir === "ltr" ? "ltr" : "rtl",
    body,
  };
}

/* --- writing it back ------------------------------------------------------
   In the user's own name, with the access token this Worker verified a moment
   ago. No service role key is involved and none is wanted: the row level
   security policies that protect the table from the browser protect it from
   here too, and this Worker can do exactly what the person who uploaded the
   picture could have done by hand. */

/* The app's slugify, in the app's words. It lives in two runtimes because the
   browser names a song when it is created and this names it again when the
   real title is finally known; keep the two in step (see slugify() in
   businesses/chords/public/assets/app.js). */
const RESERVED_SLUGS = new Set(["new", "edit"]);

function slugify(name) {
  let s = String(name || "").trim()
    .replace(/[\s ]+/g, "_")
    .replace(/[^\p{L}\p{N}_'-]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  if (!s) s = "שיר";
  if (RESERVED_SLUGS.has(s.toLowerCase())) s += "_";
  return s;
}

/* A failure, in words the person who uploaded the picture can act on. The
   seconds ride along because "it failed" and "it failed after four minutes"
   call for different next moves. */
function why(message, seconds) {
  const said =
    /* The ceiling, said as the thing it actually is. "It was cut off" describes
       what happened to the text; what happened to the person is that a song
       reached the most they were willing to spend on it and stopped there. The
       number comes from the budget itself so the message cannot go stale when
       the budget moves. */
    message === "truncated" ? `הקריאה עברה את התקרה של ${MAX_CENTS} סנט לשיר ונעצרה. שווה לנסות שוב.` :
    message === "empty" ? "לא זוהו מילים ואקורדים בקובץ." :
    message === "refusal" ? "הקריאה סורבה." :
    /^anthropic 4\d\d/.test(message) ? "השירות דחה את הבקשה." :
    /^anthropic 5\d\d/.test(message) ? "השירות לא היה זמין." :
    String(message).slice(0, 200);
  return `${said} (${seconds}s)`;
}

async function patchSong(env, token, id, fields) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/songs?id=eq.${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "return=minimal",
      },
      body: JSON.stringify(fields),
    }
  );

  if (response.ok) return null;
  const body = await response.text();
  return { status: response.status, body };
}

/* These columns arrived after the table did, and a project that has not had
   the new SQL run against it refuses any write that names them. A song is
   worth a great deal more than its credits or its price, so drop those and
   keep the song rather than losing a read that has already been paid for. */
const LATE_COLUMNS = ["lyrics_by", "music_by", "review"];

/* What a dollar was worth in shekels today, asked once per reading and kept
   beside the price.

   KEPT RATHER THAN LOOKED UP LATER, because a price is a fact about a moment.
   Converting at the rate of whenever somebody happens to open the page would
   restate last year's reading in this morning's money, and the number under a
   song would drift every day for no reason a reader could see.

   Frankfurter serves the European Central Bank's daily reference rates, needs
   no key and answers a weekend with the last working day. A reading whose rate
   could not be fetched is worth far more than the rate: it keeps its price in
   dollars and nothing waits. */
async function shekelRate() {
  try {
    const response = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS");
    if (!response.ok) return null;
    const body = await response.json();
    const rate = Number(body?.rates?.ILS);
    return Number.isFinite(rate) && rate > 0 ? rate : null;
  } catch (err) {
    console.error("rate lookup failed", err.message);
    return null;
  }
}

/* WHAT THIS READING COST AND HOW IT WENT, into a table of its own.

   NOT A COLUMN ON THE SONG any more. The library is public where it is
   published, and row level security is about rows: a column on a row somebody
   may read is a column they may read, so the price of a reading sat where
   anybody holding a published song could pick it up. It is its own table now,
   written by whoever's reading it was and read by the one account that gets
   the invoice.

   The price is not the only thing here. Which half of the reader was kept, and
   how far the two agreed, are facts about the READING rather than about the
   song, and the song is written over the moment somebody edits it: the only
   place they survive is beside what they cost. Together they are what the
   page at /chords/reads is: a reading, what came of it, what it cost, when,
   and whose.

   Best effort, and deliberately last. The song is already saved by the time
   this runs; a network that drops this one request loses a number and keeps
   the song.

   AND A PROJECT WHOSE SQL IS OLDER THAN THIS FILE STILL GETS ITS PRICE. The
   three columns below arrived after the table did, so a write naming them is
   refused whole by a table that has not heard of them; refused whole, the
   price goes with them. So it is tried again with the row as it used to be,
   which is the same bargain the song makes with its own late columns. */
async function saveCost(env, token, songId, { cost, rate, kept, agreement }) {
  if (cost == null && rate == null && !kept) return;

  const write = async (row) => {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/song_costs`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify(row),
    });
    return response.ok ? null : { status: response.status, body: (await response.text()).slice(0, 200) };
  };

  const priced = { song_id: songId, read_cost: cost, usd_ils: rate };
  try {
    const failure = await write({
      ...priced,
      kept: kept || null,
      agreement: Number.isFinite(agreement) ? Math.round(agreement * 100) / 100 : null,
    });
    if (!failure) return;
    if (!["kept", "agreement"].some((column) => failure.body.includes(column))) {
      console.error("cost not recorded", songId, failure.status, failure.body);
      return;
    }
    const again = await write(priced);
    if (again) console.error("cost not recorded", songId, again.status, again.body);
  } catch (err) {
    console.error("cost not recorded", songId, err.message);
  }
}

async function saveSong(env, token, id, fields) {
  const failure = await patchSong(env, token, id, fields);
  if (!failure) return null;
  if (!LATE_COLUMNS.some((column) => failure.body.includes(column))) return failure;

  const without = { ...fields };
  LATE_COLUMNS.forEach((column) => delete without[column]);
  return patchSong(env, token, id, without);
}

/* --- the queue ------------------------------------------------------------
   Ten sheets dropped at once are ten Workflows, and ten readings at once would
   be ten Opus calls in the same second: a good way to meet a rate limit, and a
   good way to spend ten songs' worth of money before noticing the first one
   came out wrong. So they take turns.

   THE TURN IS COMPUTED, NEVER CLAIMED. A song's place is how many songs still
   waiting or being read were created before it, which is a fact about the
   table rather than a lock, so two Workflows waking at the same instant cannot
   both take the same slot. Cancelling a song ahead simply moves everyone up.

   And a song whose row has gone has been cancelled, which is the whole of the
   cancelling: delete the row and the reading never starts, and nothing has
   been paid. */
const READING_AT_ONCE = 3;

async function readSongs(env, token, query) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/songs?${query}`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

/* --- have we read this one already ----------------------------------------

   Asking the words half of the read whether the library already holds this
   song, BEFORE the chords half is allowed to spend anything.

   It costs nothing to ask, which is the whole reason it is possible. Splitting
   the job in two was done to stop the cheap work being billed at the dear
   work's rate; what it also bought, unplanned, is a moment between the two
   halves where the song is known and nothing expensive has happened yet. The
   words come back in seconds for a few cents, and they are enough to recognise
   a song by.

   COMPARED AS A BAG OF WORDS, not as text. Two reads of the same page are
   never the same string: a repetition is counted differently, a niqqud mark
   comes and goes, a line breaks in another place. What does not change is
   which words are in it and how often, so that is what is compared, and it
   survives every one of those without being told about any of them. */
const TWIN = 0.9;

/* Every word in a song and how often it occurs, with everything that is not a
   word taken out: the chords, the niqqud, the punctuation, the braces round a
   heading. Exported because the threshold above is only as meaningful as this
   is, and a test is the only thing that keeps it honest. */
export function bagOf(text) {
  const bag = new Map();

  String(text || "")
    /* TAKEN OUT, NOT REPLACED BY A SPACE, and the difference is the whole of
       whether this works. A chord sits INSIDE a word, so putting a space where
       it was cuts the word in two: ש[Am]ובי becomes "ש ובי". Two correct
       readings of the same page place their chords a letter apart, break their
       words in different places, and come out 52% alike when they are the same
       song. */
    .replace(/\[[^\]]*\]/g, "")             // chords
    .replace(/[֑-ׇ]/g, "")        // niqqud and cantillation
    .replace(/[^\p{L}\p{N}]+/gu, " ")       // everything that is not a word
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => bag.set(word, (bag.get(word) || 0) + 1));

  return bag;
}

/* How alike two bags are, from 0 to 1: twice what they share over what they
   hold between them. A song against itself is 1, a song against another song
   in the same language sits well under a half, and a song against a second
   reading of its own page comes out in the high nineties. */
export function likeness(mine, theirs) {
  let here = 0;
  let there = 0;
  let shared = 0;

  mine.forEach((count) => { here += count; });
  theirs.forEach((count) => { there += count; });
  if (!here || !there) return 0;

  mine.forEach((count, word) => { shared += Math.min(count, theirs.get(word) || 0); });
  return (2 * shared) / (here + there);
}

/* The column holds one document now and held a list of lines before it, and
   a song from either era can be the one you already have. */
function wordsOfRow(lines) {
  if (typeof lines === "string") return lines;
  if (Array.isArray(lines)) return lines.map((line) => String(line?.text ?? "")).join("\n");
  return "";
}

/* The song in the library this one looks like, or nothing. Never itself: the
   row being read is already there, waiting, with no words in it. */
async function twinOf(env, token, songId, lyrics) {
  const mine = bagOf(lyrics);
  /* A handful of words is not enough to recognise anything by, and a wrong
     answer here costs a whole read. */
  if (mine.size < 8) return null;

  const songs = await readSongs(env, token, "select=id,title,slug,lines&status=eq.ready");
  if (!songs) return null;

  let best = null;
  songs.forEach((song) => {
    if (song.id === songId) return;
    const score = likeness(mine, bagOf(wordsOfRow(song.lines)));
    if (score >= TWIN && (!best || score > best.score)) best = { title: song.title, slug: song.slug, score };
  });

  return best;
}

export async function turnFor(env, token, songId) {
  const mine = await readSongs(env, token, `select=id,status,created_at&id=eq.${encodeURIComponent(songId)}&limit=1`);
  if (!mine) return "go";                     // cannot tell; never stall a song over it
  if (!mine.length) return "gone";
  if (mine[0].status !== "queued" && mine[0].status !== "reading") return "gone";

  const ahead = await readSongs(
    env, token,
    `select=id&status=in.(queued,reading)&created_at=lt.${encodeURIComponent(mine[0].created_at)}`
  );
  if (!ahead) return "go";
  return ahead.length < READING_AT_ONCE ? "go" : "wait";
}

/* The whole background job: read, name, save. Never throws — a failure is
   written onto the row as `failed`, because a row that says why is the only
   thing the person who uploaded the picture can act on. */
export async function readAndSave(env, token, songId, files) {
  /* A heartbeat onto the row itself.

     This job outlives the request that started it, so if the runtime cuts it
     short there is nobody left to say so and the row would simply sit at
     `reading` for ever. Writing the elapsed time every twenty seconds means the
     row records how far it got, which is the difference between "it is slow"
     and "it died after ninety seconds", and it gives the person watching a
     number instead of a spinner. */
  const began = Date.now();

  /* The first mark, before the model is even called, and awaited.

     It proves two things at once that are otherwise indistinguishable from a
     row that never changes: that this job started at all, and that it can write
     to the row it is supposed to fill. If it cannot write, there is no point
     spending a read whose answer has nowhere to go, and no point trying to mark
     the row as failed either, because writing is exactly what is broken. */
  const blocked = await patchSong(env, token, songId, { status: "reading", status_note: "מפענח" });
  if (blocked) {
    console.error("transcribe cannot write to its row", songId, blocked.status, blocked.body.slice(0, 300));
    return;
  }

  let last = 0;
  let stage = "מפענח";
  const heartbeat = (now) => {
    if (now) stage = now;
    const seconds = Math.round((Date.now() - began) / 1000);
    if (seconds - last < 20) return;
    last = seconds;
    /* The STAGE, not the time. Whoever is watching counts the seconds in their
       own browser, once a second, which is smoother than anything a heartbeat
       could send. What only this side knows is which part of the work is
       happening, and now that the work is two halves that is worth saying: the
       words first, then the chords. Writing the same word again is not wasted,
       since the row's updated_at is what proves the job is still alive. */
    patchSong(env, token, songId, { status_note: stage })
      .then((failure) => { if (failure) console.error("heartbeat refused", songId, failure.status); })
      .catch((err) => console.error("heartbeat threw", songId, err.message));
  };

  let song;
  try {
    song = await readChordSheet(env, files, heartbeat);
  } catch (err) {
    const seconds = Math.round((Date.now() - began) / 1000);
    console.error("transcribe failed", songId, seconds + "s", err.message);
    await patchSong(env, token, songId, { status: "failed", status_note: why(err.message, seconds) });

    /* A FAILURE IS ON THE BILL TOO. An attempt that produced nothing was still
       billed in full (see ask), and a page of readings that shows only the ones
       that worked is a page telling you the reader is cheaper than it is. The
       row says so in a word, and its price is whatever was burned getting
       there: null where even that is not known, which is a missing price list
       rather than a free failure. */
    const spent = Number.isFinite(err.cost) ? err.cost : null;
    await saveCost(env, token, songId, {
      cost: spent,
      /* nothing to convert, so nobody is asked what a dollar is worth */
      rate: spent == null ? null : await shekelRate(),
      kept: "failed",
      agreement: null,
    });
    return;
  }

  /* after the reading, so a rate is never fetched for a song that failed */
  const rate = await shekelRate();

  const fields = {
    lyrics_by: song.lyrics_by,
    music_by: song.music_by,
    dir: song.dir,
    /* the column is called `lines` for historical reasons; what goes in it is
       the whole song as one ChordPro document */
    lines: song.body,
    /* every reading this song has had, for measuring the reader later */
    reads: song.reads || null,
    /* A machine read it, so a person has not. The label stays on the song until
       somebody says they have looked at it, and it is set here rather than by
       the browser because this is the only place that knows the words came off
       a picture instead of a keyboard. */
    review: true,
    /* READY EVEN WHEN HALF OF IT DID NOT ARRIVE. A song with its words and no
       chords is a song you can open, read, print and finish; a failed row is a
       dead end. What is missing is said in the note instead, and the note goes
       the moment somebody saves the song, because by then it is not true. */
    status: "ready",
    status_note: song.note || "",
  };

  const stop = async (failure) => {
    console.error("transcribe could not save", songId, failure.status, failure.body.slice(0, 200));
    await patchSong(env, token, songId, { status: "failed", status_note: `save ${failure.status}` });
  };

  /* A sheet that does not print the song's name leaves the row with the one it
     already has, taken from the file it was uploaded from. That is a real name
     somebody chose, and it beats anything this could invent. Its address stays
     as it is too, for the same reason. */
  const bill = {
    cost: song.cost,
    rate,
    kept: song.went || null,
    /* null and not nought. A read with nothing to compare against did not
       disagree with anything, and `Number(null)` is a zero that would put
       "0% התאמה" on the page and mean the opposite of what happened. */
    agreement: song.reads && song.reads.agreement != null ? Number(song.reads.agreement) : null,
  };

  if (!song.title) {
    const failure = await saveSong(env, token, songId, fields);
    if (failure) return stop(failure);
    await saveCost(env, token, songId, bill);
    return;
  }

  /* Otherwise the song gets its real name and its real address now, because
     only now is the name known. 23505 is the unique index on slug: another
     song already has that address. */
  fields.title = song.title;
  const wanted = slugify(song.title);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const failure = await saveSong(env, token, songId, {
      ...fields,
      slug: attempt === 1 ? wanted : `${wanted}_${attempt}`,
    });
    if (!failure) return saveCost(env, token, songId, bill);
    if (!failure.body.includes("23505")) return stop(failure);
  }
}
