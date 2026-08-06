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

      The ORDER cannot be wrong, because there is no order: each chord names
      its own word, and this code sorts them. The reversal that plagued every
      earlier version is not fixed here, it is impossible.

      The DRIFT has somewhere to catch, because `letter` and `letters_before`
      say the same thing twice. Where they disagree the letter wins, since
      naming a glyph is the judgement being asked for and the count is only the
      arithmetic on top of it.

      And RIGHT TO LEFT never comes up. Nothing is counted along a line, so
      there is no direction for it to be counted in.
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
   question was. Hence the shape above, and the model stays where it is.

   max_tokens is a ceiling and not a target: at 32000 a long song cannot run
   out of room, and nothing is paid for room that goes unused. */
const MODEL = "claude-opus-5";
const EFFORT = "medium";
const MAX_TOKENS = 32000;

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
        "The single letter the middle of the chord symbol sits directly above. It must be one of the letters of that word. Empty string only when word is 0.",
    },
    letters_before: {
      type: "integer",
      description:
        "How many letters of that word come before that letter, counting from the word's own beginning. 0 means the chord is over the word's first letter, 2 means it is over its third. For word 0, use 0.",
    },
  },
};

const LINE = {
  type: "object",
  additionalProperties: false,
  required: ["words", "chords"],
  properties: {
    words: {
      type: "string",
      description:
        "One line of the song, words only, exactly as printed, with no chords in it. An empty string for a blank line between stanzas. A heading such as a chorus marker is written in braces: {פזמון}.",
    },
    chords: {
      type: "array",
      description:
        "Every chord symbol printed above this line, one entry each. The order of this array does not matter and is not used.",
      items: CHORD,
    },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "lyrics_by", "music_by", "dir", "lines"],
  properties: {
    title: { type: "string", description: "The song's name as printed, or an empty string if the sheet does not name it." },
    lyrics_by: { type: "string", description: "Who wrote the words, if the sheet says so (often after \"מילים:\"), otherwise an empty string." },
    music_by: { type: "string", description: "Who wrote the tune, if the sheet says so (often after \"לחן:\"), otherwise an empty string." },
    dir: { type: "string", enum: ["rtl", "ltr"], description: "rtl when the lyrics are Hebrew or Arabic, ltr otherwise." },
    lines: { type: "array", description: "The song, top to bottom, one entry per printed line.", items: LINE },
  },
};

const SYSTEM = `You read photographs or scans of a chord sheet and report what is printed on it.

A chord sheet is lyrics with chord symbols printed on their own lines, floating above the words. Recovering the words is the easy half. The half that matters is recovering, for every single chord, WHICH LETTER it was printed above.

HOW TO REPORT A LINE

For each printed line, give the words on their own, exactly as printed and with no chords in them, and then give each chord above that line as its own separate entry. A chord entry answers three questions about ONE chord symbol:

  word            which word of the line it stands over
  letter          which letter of that word its middle stands over
  letters_before  how many letters of the word come before that letter

Word 1 is the word the line begins with. On a Hebrew line the line begins on the RIGHT, so word 1 is the rightmost word on the page and the count runs leftwards. Inside a word, the first letter is likewise the one the word begins with: for בנקיק the letters are ב, נ, ק, י, ק in that order, and letters_before 2 means the third of them, the ק.

An example. The page shows

              C
        אילה מה לי

The C's middle is over the ל of אילה, which is the first word and its third letter, so that chord is

    { chord: "C", word: 1, letter: "ל", letters_before: 2 }

THE ORDER OF THE CHORDS DOES NOT MATTER. Every chord names its own word, so they are sorted afterwards by what they name. Do not try to list them in any particular sequence, and above all do not read the chord line as a row of symbols and hand them out to the words in the order you read them: Latin symbols read left to right and Hebrew words read right to left, and handing one sequence to the other reverses every chord in the middle of the line. Take ONE symbol, look down from its middle, name what is under it, write that entry. Then the next symbol. Where you start does not matter and how many you have done does not matter, because nothing here depends on order.

WHICH LETTER, EXACTLY

- Take the chord symbol's horizontal MIDDLE, not its left edge and not its right edge, and look straight down. Name the letter under it. If the point falls between two letters, take the one whose own start is nearer.

- Many sheets print a small mark under each chord: a tick, a comma, an apostrophe, a short slanted stroke. Where there is one it says the same thing more precisely, so use it to settle a close call. Where there is none, nothing changes: the middle of the symbol is the answer either way.

- CHORDS DO NOT PREFER THE STARTS OF WORDS. This is the mistake that keeps happening, so it is worth naming: a chord lands wherever the singer changes note, which is inside a word at least as often as at its edge. letters_before is 0 far less often than it looks. If the symbol's middle is over the third letter, say so; do not round it back to the front of the word, and do not move it onto the neighbouring word either.

  On a real sheet the line

              G7    E         Am          G       C
        אילה מה לי ולה מה לי ולה מה לי ולה

  reads: C over the ל of אילה, G over the ל of the first ולה, Am over the ל of the second ולה, E over the ל of the third ולה, and G7 past the end of the line. Every one of those five is inside a word or past the words. Not one of them is at word 0 of anything.

- letter AND letters_before MUST AGREE. Read the word you named, count to letters_before, and check that the letter you land on is the letter you wrote. If they disagree, look at the page again.

- A chord printed out past the last word, or one standing alone in a gap with no word under it, is word 0 with an empty letter and letters_before 0. Report those in the order they are printed along the line, beginning from the side the line begins on.

- A blank line between stanzas is an entry with empty words and no chords.
- A heading that names a part of the song is a line whose words are wrapped in braces: {פזמון}, {בית}, {מעבר}, {Chorus}, {Intro}.

THE WORDS

- Copy the lyrics as printed: same words, same spelling, same punctuation, including Hebrew niqqud if it is there. Do not translate, do not transliterate, do not correct.

- REPEATED PHRASES ARE REPEATED EXACTLY AS OFTEN AS THE PAGE REPEATS THEM. This is the one error in the words that hides itself: a line reading "אילה מה לי ולה מה לי ולה מה לי ולה" comes back as "אילה מה לי ולה מה לי מה לי ולה" and reads perfectly well, so nothing about it looks wrong. It is wrong, and it also moves every chord after it onto the wrong word, because the words it named are no longer there.

  So on any line that says the same thing more than once: count the repetitions on the page before writing the line, then count them in what you wrote. Three means three.
- Copy chords as printed, in Latin notation: A to G, with # or b, and whatever follows (m, 7, maj7, sus4, dim, add9) and any slash bass such as G/B.
- Several images are pages of ONE song, in the order given. Return them as one song.
- Anything that is not the song itself, such as a page number, a website name or a printed comment, is left out.
- If a part of the image is unreadable, return the lines you can read rather than inventing the rest.

BEFORE YOU ANSWER

Go over each line once more and check three things.

The WORDS: your line has every word the page has, in order, with repeated phrases repeated as often as the page repeats them. Read the printed line and your line side by side, word for word.

The COUNT: your line has exactly as many chord entries as the page has chord symbols above that line. A missing one and an invented one both read as plausible.

The LETTERS: for each chord, the word you named has that many letters, the letter at that position is the letter you named, and it is the one under the middle of the symbol. Count the letters; do not eyeball them. A chord sitting one or two letters from where it belongs is the failure this task actually has, and it is invisible unless it is looked for.`;

const USER_TEXT =
  "This is a chord sheet. Report every line of it: the words as printed, and every chord above them as its own " +
  "entry naming the word, the letter and how many letters come before that letter.";

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
        payload.indexOf('"type":"error"') < 0
      ) continue;

      let event;
      try { event = JSON.parse(payload); } catch { continue; }

      if (event.type === "content_block_delta" && event.delta?.type === "text_delta") text += event.delta.text;
      else if (event.type === "message_delta" && event.delta?.stop_reason) stopReason = event.delta.stop_reason;
      else if (event.type === "error") throw new Error(`anthropic stream: ${event.error?.message || "error"}`);
    }
  }

  return { text, stopReason };
}

/* Reads one upload, which may be several pages of the same song. Throws an
   Error whose message is safe to store: it is ours, never a key. */
export async function readChordSheet(env, files, onProgress) {
  const pages = files.map((file) => {
    const source = { type: "base64", media_type: file.media_type, data: file.data };
    return file.media_type === "application/pdf"
      ? { type: "document", source }
      : { type: "image", source };
  });

  const { text, stopReason } = await streamText(env, {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM,
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: SCHEMA },
    },
    messages: [{ role: "user", content: [...pages, { type: "text", text: USER_TEXT }] }],
  }, onProgress);

  if (stopReason === "refusal") throw new Error("refusal");
  if (stopReason === "max_tokens") throw new Error("truncated");
  if (!text.trim()) throw new Error("empty");

  return clean(JSON.parse(text));
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
  at = Math.max(0, Math.min(word.text.length, at));

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
  (Array.isArray(line?.chords) ? line.chords : []).forEach((chord) => {
    const name = String(chord?.chord ?? "").trim().slice(0, 16);
    if (!name) return;
    const pos = positionOf(words, chord);
    if (pos === null) trailing.push(name);
    else placed.push({ name, pos });
  });

  /* SORTED HERE, and never taken as given. The order the chords arrived in is
     the order the model happened to look at the page, which for a Hebrew line
     under Latin symbols is frequently backwards. What each chord named is not
     backwards, so the sort is the whole answer. */
  placed.sort((a, b) => a.pos - b.pos);

  let out = "";
  let at = 0;
  placed.forEach((chord) => {
    out += text.slice(at, chord.pos) + "[" + chord.name + "]";
    at = chord.pos;
  });
  out += text.slice(at);

  /* Chords with no word under them, spaced out past the end. The spaces are
     the spacing: this format has nothing else to say how far out a chord sits,
     and the app reads them back as positions past the last character. */
  trailing.forEach((name) => { out += TRAIL_GAP + "[" + name + "]"; });

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

/* The credit columns arrived after the table did, and a project that has not
   had the new SQL run against it refuses any write that names them. A song is
   worth a great deal more than its credits, so drop those and keep the song
   rather than losing a read that has already been paid for. */
const CREDIT_COLUMNS = ["lyrics_by", "music_by"];

async function saveSong(env, token, id, fields) {
  const failure = await patchSong(env, token, id, fields);
  if (!failure) return null;
  if (!CREDIT_COLUMNS.some((column) => failure.body.includes(column))) return failure;

  const without = { ...fields };
  CREDIT_COLUMNS.forEach((column) => delete without[column]);
  return patchSong(env, token, id, without);
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
  const blocked = await patchSong(env, token, songId, { status_note: "מפענח" });
  if (blocked) {
    console.error("transcribe cannot write to its row", songId, blocked.status, blocked.body.slice(0, 300));
    return;
  }

  let beat = 0;
  const heartbeat = () => {
    const seconds = Math.round((Date.now() - began) / 1000);
    if (seconds - beat < 20) return;
    beat = seconds;
    /* The STAGE, not the time. Whoever is watching counts the seconds in their
       own browser, once a second, which is smoother than anything a heartbeat
       could send. What only this side knows is which part of the work is
       happening, so that is what it says. Writing the same word again is not
       wasted: the row's updated_at is what proves the job is still alive. */
    patchSong(env, token, songId, { status_note: "מפענח" })
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
