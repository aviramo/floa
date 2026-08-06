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
   ========================================================================== */

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
     one 1400px image       ~1900 tokens
                            -------------
     all input              ~4300 tokens = about 2 cents

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
   it several times over. And each half now has its own model and its own
   effort, so the next experiment is one line rather than a rewrite: the
   obvious one is CHORDS_MODEL down to Sonnet, which failed as a single call
   but is being asked something much smaller here.

   max_tokens is a ceiling and not a target: at 32000 a long song cannot run
   out of room, and nothing is paid for room that goes unused. */
const WORDS_MODEL = "claude-sonnet-5";
const WORDS_EFFORT = "low";
const CHORDS_MODEL = "claude-opus-5";
const CHORDS_EFFORT = "medium";
const MAX_TOKENS = 32000;

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
    lyrics_by: { type: "string", description: "Who wrote the words, if the sheet says so (often after \"מילים:\"), otherwise an empty string." },
    music_by: { type: "string", description: "Who wrote the tune, if the sheet says so (often after \"לחן:\"), otherwise an empty string." },
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

- ONE LETTER OFF IS THE ERROR THIS JOB ACTUALLY MAKES. Not a wild miss: the neighbour. Hebrew letters are narrow and a chord symbol is three or four of them wide, so an answer eyeballed from the symbol's general area lands next door about as often as it lands right. That is the whole reason the mark matters. Name the letter under the mark, count how many letters of the word come before it, and let those two agree; do not settle for the letter that merely looks about right.

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

  if (stopReason === "refusal") throw new Error("refusal");
  if (stopReason === "max_tokens") throw new Error("truncated");
  if (!text.trim()) throw new Error("empty");

  let answer;
  try {
    answer = JSON.parse(text);
  } catch {
    throw new Error("empty");
  }
  return { answer, cost: costOf(body.model, usage) };
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

/* Reads one upload, which may be several pages of the same song.

   TWO QUESTIONS, NOT ONE, and the reason is written out at the top of this
   file: copying the words and judging where the chords sit are different jobs
   at wildly different prices, and asked together the cheap one is billed at
   the dear one's rate.

   `beat` is called with the stage in progress, often, so that whoever is
   watching the row sees which half is happening. */
export async function readChordSheet(env, files, beat) {
  const pages = files.map((file) => {
    const source = { type: "base64", media_type: file.media_type, data: file.data };
    return file.media_type === "application/pdf"
      ? { type: "document", source }
      : { type: "image", source };
  });

  /* --- one: the words --- */
  const first = await ask(env, {
    model: WORDS_MODEL,
    max_tokens: MAX_TOKENS,
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

  /* --- two: the chords --- */
  const second = await ask(env, {
    model: CHORDS_MODEL,
    max_tokens: MAX_TOKENS,
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

  const song = clean(merge(words, lines, second.answer));

  /* Both halves, because the song was read once however many questions it
     took. Null only if neither price was known, which is a missing price list
     rather than a free read. */
  song.cost = first.cost === null && second.cost === null
    ? null
    : Math.round(((first.cost || 0) + (second.cost || 0)) * 100) / 100;

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

  /* The bracket goes immediately AFTER the character the chord sits on, which
     is what "a chord is on a letter" means written down:

         ABC[Am]DEF     the Am is on the C

     So the slice runs up to and INCLUDING that character. */
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
  trailing.forEach((chord) => { out += TRAIL_GAP + "[" + chord.name + "]"; });

  return out;
}

/* The schema guarantees the shape; this guarantees it is a song. */
function clean(song) {
  const lines = Array.isArray(song.lines) ? song.lines : [];

  const body = lines.map(chordProLine).join("\n")
    .replace(/\n{3,}/g, "\n\n")          // no gaps wider than one blank line
    .replace(/[ \t]+$/gm, "")            // trailing space is padding nobody asked for
    .trim()
    .slice(0, 20000);

  if (!body) throw new Error("empty");

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
    message === "truncated" ? "הקריאה נקטעה באמצע. השיר ארוך מהמקום שהוקצה לו." :
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
const LATE_COLUMNS = ["lyrics_by", "music_by", "read_cost"];

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
    return;
  }

  const fields = {
    lyrics_by: song.lyrics_by,
    music_by: song.music_by,
    dir: song.dir,
    /* the column is called `lines` for historical reasons; what goes in it is
       the whole song as one ChordPro document */
    lines: song.body,
    /* what it cost, in US cents, from the token counts the API itself
       reported. Null means the price was not known here, never that it was
       free. */
    read_cost: song.cost,
    status: "ready",
    status_note: "",
  };

  const stop = async (failure) => {
    console.error("transcribe could not save", songId, failure.status, failure.body.slice(0, 200));
    await patchSong(env, token, songId, { status: "failed", status_note: `save ${failure.status}` });
  };

  /* A sheet that does not print the song's name leaves the row with the one it
     already has, taken from the file it was uploaded from. That is a real name
     somebody chose, and it beats anything this could invent. Its address stays
     as it is too, for the same reason. */
  if (!song.title) {
    const failure = await saveSong(env, token, songId, fields);
    if (failure) await stop(failure);
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
    if (!failure) return;
    if (!failure.body.includes("23505")) return stop(failure);
  }
}
