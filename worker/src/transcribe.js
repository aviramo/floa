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

   3. It ASKS FOR A DOCUMENT, NOT FOR NUMBERS. The hard part of this work was
      never reading the text, it was saying where each chord goes. Asking for
      a character index meant counting from the right-hand end of a Hebrew
      line, which nobody does reliably. Asking instead for

          [Am]שלום לך אדו[G]ני

      removes the counting altogether: the bracket goes in front of the letter.
      Right to left stops being a special case, because there is no longer
      anything being counted for it to be special about.
   ========================================================================== */

/* --- what the read costs --------------------------------------------------
   These three lines are the whole of it, and they are meant to be easy to
   change because they are a trade, not a fact.

   Sonnet 5 rather than Opus 5: this is careful reading, not hard reasoning,
   and Sonnet reaches the same place here for a fraction of the price. `medium`
   rather than `high`: effort is what decides how long the model thinks, and
   thinking is where the tokens actually go on a task like this, far more than
   the picture. `max_tokens` is a ceiling, not a target, and it covers thinking
   and answer together, so it is set high enough for a long song and no higher.

   Together they also keep a read down to under a minute, which matters for a
   second reason: the job outlives the request that started it, and the shorter
   it is the less there is for the runtime to cut short.

   It started on Sonnet at medium effort, which is the cheap end and was the
   right first guess: this is careful reading, not hard reasoning. Real sheets
   said otherwise. Twice, chords came back exchanged with their neighbours and
   sitting a couple of letters off the syllable they belong on, and there is no
   version of this app where that is acceptable: a chord on the wrong letter is
   worse than no chord, because it is wrong quietly.

   So: Opus at high. Deciding which letter of a Hebrew word a Latin symbol is
   printed over is a visual judgement, and it is the entire product. The
   picture is small and a song is read once in its life, so what this costs is
   a few cents, once, against a correction by hand every time it is wrong.

   To make it cheaper again, move down this list rather than jumping: Opus at
   medium, then Sonnet at high. Check a Hebrew sheet with four or more chords
   on a line after each step, because that is where it breaks first. */
const MODEL = "claude-opus-5";
const EFFORT = "high";
const MAX_TOKENS = 16000;

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

/* The song, as the app stores it: one piece of text, chords in square brackets
   where they belong. Forcing the shape here rather than asking for it in prose
   is what makes the answer safe to hand straight to the editor.

   Asking for the document rather than for a list of offsets is the important
   part. Counting characters from the right-hand end of a Hebrew line is a job
   nobody does well, model or person; putting "[Am]" immediately before the
   syllable is a job that cannot really be got wrong. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "artist", "song_key", "dir", "body"],
  properties: {
    title: { type: "string", description: "The song's name as printed, or an empty string if the sheet does not name it." },
    artist: { type: "string", description: "The performer or writer as printed, or an empty string." },
    song_key: { type: "string", description: "The key, if the sheet states one (for example \"Am\"), otherwise an empty string." },
    dir: { type: "string", enum: ["rtl", "ltr"], description: "rtl when the lyrics are Hebrew or Arabic, ltr otherwise." },
    body: {
      type: "string",
      description:
        "The whole song as one piece of text, lines separated by newlines. Each chord appears in square brackets immediately before the character it is printed above, for example: [Am]שלום לך אדו[G]ני. A heading such as a chorus marker is a line wrapped in braces, for example {פזמון}.",
    },
  },
};

const SYSTEM = `You read photographs or scans of a chord sheet and return the song as one piece of text.

A chord sheet is lyrics with chord symbols printed on their own lines, floating above the words. Recovering the words is the easy half. The half that matters is recovering, for every single chord, WHICH SYLLABLE it was printed above.

HOW TO WRITE IT DOWN

Put each chord in square brackets INSIDE the line of words, immediately before the character it is printed above. Nothing else:

    [Am]שלום לך אדו[G]ני

means the Am is over the ש and the G is over the נ. Do not write the chords on a line of their own. Do not describe positions with numbers. The bracket sits where the chord sits, and that is the whole notation.

On the printed page that Hebrew line looks like this, with the Am on the RIGHT because the words start there:

              G           Am
        שלום לך אדוני

so the Am, being the rightmost, is the first chord of the line and the G is the second.

- WHICH LETTER, EXACTLY. Take the chord symbol's horizontal MIDDLE, not its left or right edge, and look straight down from it. The bracket goes immediately before whichever letter is under that middle. A chord printed over the third letter of a word belongs in the middle of that word: בנ[Am]קיק, not [Am]בנקיק. Being one word out is a mistake; being two letters out is also a mistake, and it is the one that is easy to make without noticing.
- A chord printed over a space stays over that space: שלום לך [Am]אדוני and שלום לך[Am] אדוני are different, and both are things you may need to write.
- WORK ONE CHORD AT A TIME, NEVER AS A LIST. This is the failure this task actually has, so it is worth being exact about. For each chord symbol on the page separately: note where it sits horizontally, look straight down from its middle, find the letter under it, and put the bracket in front of that letter. Then go to the next symbol and do the same.

  Do NOT read the chord line as a row of symbols and then hand them out to the words. A row has a direction. Chord symbols are Latin, so the eye reads a row of them left to right, while Hebrew words go right to left, and handing one sequence to the other silently reverses every chord in the middle of the line. It looks right, because the first and last chord land correctly and only the ones between them are exchanged.

  A worked example. The page shows

              Am        G         F        Am
        בנקיק נסתר בצוקים אילה שותה מים

  The rightmost Am is over בנקיק, the G is over בצוקים, the F is over אילה, the leftmost Am is over מים. Written down, that is

        [Am]בנקיק נסתר [G]בצוקים [F]אילה שותה [Am]מים

  and NOT [Am]בנקיק נסתר [F]בצוקים [G]אילה שותה [Am]מים, which is what handing the left-to-right row to the right-to-left words produces.
- A chord after the last word goes after it, with spaces before it if the sheet shows it further out: נה נה נה   [G]   [F]
- Lines are separated by a single newline. A blank line between stanzas is a blank line.
- A heading that names a part of the song is a line wrapped in braces: {פזמון}, {בית}, {מעבר}, {Chorus}, {Intro}.
- Right to left changes nothing about this. You are not counting from either end, you are putting a bracket in front of a letter.

TEXT AND CHORDS

- Copy the lyrics as printed: same words, same spelling, same punctuation, including Hebrew niqqud if it is there. Do not translate, do not transliterate, do not correct.
- Copy chords as printed, in Latin notation: A to G, with # or b, and whatever follows (m, 7, maj7, sus4, dim, add9) and any slash bass such as G/B.
- Several images are pages of ONE song, in the order given. Return them as one continuous song.
- Anything that is not the song itself, such as a page number, a website name or a printed comment, is left out.
- If a part of the image is unreadable, return the lines you can read rather than inventing the rest.

BEFORE YOU ANSWER

Go back over each line once. Read its chords off the page from the right, name the letter under the middle of each one, and check that the line you wrote puts the brackets in that order and in front of those letters. Two chords swapped, or one sitting a couple of letters away from where it belongs, is the failure this task actually has, and it is invisible unless it is looked for.`;

const USER_TEXT =
  "This is a chord sheet. Return the whole song as one piece of text. For every chord, find the syllable it is " +
  "printed above and put the chord in square brackets immediately before that syllable.";

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

/* The schema guarantees the shape; this guarantees it is a song. */
function clean(song) {
  const body = String(song.body ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")          // no gaps wider than one blank line
    .replace(/[ \t]+$/gm, "")            // trailing space is padding nobody asked for
    .trim()
    .slice(0, 20000);

  if (!body) throw new Error("empty");

  const short = (v, max) => String(v ?? "").trim().slice(0, max);

  return {
    title: short(song.title, 120),
    artist: short(song.artist, 120),
    song_key: short(song.song_key, 16),
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
  const blocked = await patchSong(env, token, songId, { status_note: "מתחיל לקרוא" });
  if (blocked) {
    console.error("transcribe cannot write to its row", songId, blocked.status, blocked.body.slice(0, 300));
    return;
  }

  let beat = 0;
  const heartbeat = () => {
    const seconds = Math.round((Date.now() - began) / 1000);
    if (seconds - beat < 20) return;
    beat = seconds;
    /* not awaited: the reading must not wait on the bookkeeping */
    patchSong(env, token, songId, { status_note: `קורא, ${seconds} שניות` })
      .then((failure) => { if (failure) console.error("heartbeat refused", songId, failure.status); })
      .catch((err) => console.error("heartbeat threw", songId, err.message));
  };

  let song;
  try {
    song = await readChordSheet(env, files, heartbeat);
  } catch (err) {
    const seconds = Math.round((Date.now() - began) / 1000);
    console.error("transcribe failed", songId, seconds + "s", err.message);
    await patchSong(env, token, songId, {
      status: "failed",
      status_note: `${String(err.message).slice(0, 260)} (${seconds}s)`,
    });
    return;
  }

  const fields = {
    artist: song.artist,
    song_key: song.song_key,
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
    const failure = await patchSong(env, token, songId, fields);
    if (failure) await stop(failure);
    return;
  }

  /* Otherwise the song gets its real name and its real address now, because
     only now is the name known. 23505 is the unique index on slug: another
     song already has that address. */
  fields.title = song.title;
  const wanted = slugify(song.title);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const failure = await patchSong(env, token, songId, {
      ...fields,
      slug: attempt === 1 ? wanted : `${wanted}_${attempt}`,
    });
    if (!failure) return;
    if (!failure.body.includes("23505")) return stop(failure);
  }
}
