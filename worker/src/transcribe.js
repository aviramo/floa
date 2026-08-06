/* ==========================================================================
   Reading a chord sheet.

   Photographs or a PDF go in, a song lands in the database. This lives in the
   Worker for one reason: the Anthropic key must never reach a browser, exactly
   like the Resend key next door. Nothing is stored here; the picture is read
   once and forgotten.

   TWO THINGS SHAPE THIS FILE, and both were learned the hard way.

   1. It STREAMS. A careful read of a full page takes minutes, and a plain
      request that quiet for that long is cut off at a hundred seconds with a
      524 before a single word comes back. A stream keeps bytes moving, so the
      time it takes stops being a failure mode.

   2. It FINISHES WITHOUT THE BROWSER. The caller gets an answer immediately
      and this keeps running (see ctx.waitUntil in index.js), then writes the
      result to Supabase itself, in the user's own name with the token it just
      verified. So closing the tab costs nothing, and a half-read song is a
      visible row rather than a lost minute.

   The hard part of the work itself is not reading the text, it is the
   POSITION. A chord printed above a Hebrew line has to come back as an index
   counted from the start of the line in reading order, which for Hebrew is the
   right. Getting that wrong is what makes every naive chord sheet in Word come
   out scrambled, so the prompt spends most of its words on it, and the schema
   forces the answer into the one shape the app can use.
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

   If chords start landing on the wrong syllables, raise the effort before
   changing anything else. */
const MODEL = "claude-sonnet-5";
const EFFORT = "medium";
const MAX_TOKENS = 16000;

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

/* The song, as the app stores it. Forcing the shape here rather than asking
   for JSON in prose is what makes the answer safe to hand straight to the
   editor: there is no parse to fail and no field to be missing. */
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "artist", "song_key", "dir", "lines"],
  properties: {
    title: { type: "string", description: "The song's name as printed, or an empty string if the sheet does not name it." },
    artist: { type: "string", description: "The performer or writer as printed, or an empty string." },
    song_key: { type: "string", description: "The key, if the sheet states one (for example \"Am\"), otherwise an empty string." },
    dir: { type: "string", enum: ["rtl", "ltr"], description: "rtl when the lyrics are Hebrew or Arabic, ltr otherwise." },
    lines: {
      type: "array",
      description: "The song from top to bottom, one entry per printed line.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "text", "chords"],
        properties: {
          type: { type: "string", enum: ["line", "section"] },
          text: { type: "string", description: "The words of this line exactly as printed, with no chord symbols in it." },
          chords: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["pos", "chord"],
              properties: {
                pos: { type: "integer", description: "Index into text of the first character of the syllable this chord is printed above." },
                chord: { type: "string", description: "The chord exactly as printed, for example Am, F#m7, G/B." },
              },
            },
          },
        },
      },
    },
  },
};

const SYSTEM = `You read photographs or scans of a chord sheet and return the song as structured data.

A chord sheet is lyrics with chord symbols printed on their own lines, floating above the words. Recovering the words is the easy half. The half that matters is recovering, for every single chord, WHICH SYLLABLE it was printed above.

HOW A LINE IS REPRESENTED

Each printed lyric line becomes one entry:
- "text" is the words of that line, exactly as printed. Chord symbols NEVER appear in "text". The chord line above it is not a line of its own in the output; its chords become the "chords" of the lyric line beneath it.
- "chords" is every chord printed above that lyric line.
- "pos" is a 0-based index INTO "text", counted in characters from the START of the line in READING ORDER. For Hebrew that is the rightmost character of the line; for English it is the leftmost. Index 0 is the first character the reader reads. Spaces count. "pos" may equal the length of "text", which places the chord just past the last word.

HOW TO FIND pos, FOR EVERY CHORD

1. Look at where the chord symbol starts horizontally in the image.
2. Look straight down to the lyric line beneath it and identify the exact word, and within that word the exact syllable, that the chord sits over.
3. Count characters in "text" from the start of the line in reading order up to the first character of that syllable. That count is "pos".

Do this per chord. Do not space chords out evenly, do not give them all the same position, and do not guess from the order alone. If a chord sits in the gap between two words, choose whichever word's start is nearest beneath it. If a chord sits over the middle of a word, "pos" points at the character in the middle of the word, not at the word's start: chords land on syllables, and that is the whole reason this format exists.

Sanity check before answering: chords in a line must have strictly increasing "pos" values in the same order they are printed in reading order, and every "pos" must be between 0 and the length of that line's "text".

RIGHT TO LEFT

For a Hebrew song, the words read right to left but "pos" is still counted from the start of reading, which is the right-hand edge. A chord printed above the FIRST (rightmost) word of a Hebrew line has a small "pos", near 0. A chord above the LAST (leftmost) word has a large "pos", near the end of the string. Do not mirror the counting; count in reading order. Set "dir" to "rtl".

OTHER KINDS OF LINE

- A heading that names a part of the song ("פזמון", "בית", "מעבר", "Chorus", "Verse 2", "Intro") becomes type "section", with the heading in "text" and no chords.
- A blank line between stanzas becomes type "line" with an empty "text" and no chords. Keep them: they are the shape of the song.
- A line of chords with no words under it (an intro, a solo, a turnaround) becomes type "line" whose "text" is a run of plain spaces long enough to hold the chords, with each chord at the column where it was printed.
- Anything that is not the song itself, such as a page number, a website name or a printed comment, is left out.

TEXT AND CHORDS

- Copy the lyrics as printed: same words, same spelling, same punctuation, including Hebrew niqqud if it is there. Do not translate, do not transliterate, do not correct.
- Copy chords as printed, in Latin notation: A to G, with # or b, and whatever follows (m, 7, maj7, sus4, dim, add9) and any slash bass such as G/B.
- Several images are pages of ONE song, in the order given. Return them as one continuous song.
- If a part of the image is unreadable, return the lines you can read rather than inventing the rest.`;

const USER_TEXT =
  "This is a chord sheet. Return the whole song. Take particular care with the position of each chord: " +
  "for every chord, find the syllable it is printed above and give the index of that syllable's first character in the line's text.";

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

/* The schema guarantees the shape; this guarantees the meaning. Positions are
   clamped into their own line and sorted, so a stray index can never push a
   chord onto a character that does not exist. */
function clean(song) {
  const lines = (Array.isArray(song.lines) ? song.lines : [])
    .map((line) => {
      const text = String(line.text ?? "");
      if (line.type === "section") return { type: "section", text: text.trim(), chords: [] };
      const chords = (Array.isArray(line.chords) ? line.chords : [])
        .map((c) => ({
          pos: Math.max(0, Math.min(Math.round(Number(c.pos) || 0), text.length)),
          chord: String(c.chord ?? "").trim().slice(0, 16),
        }))
        .filter((c) => c.chord)
        .sort((a, b) => a.pos - b.pos);
      return { type: "line", text, chords };
    })
    .filter((line) => line.type !== "section" || line.text);

  if (!lines.length) throw new Error("empty");

  const short = (v, max) => String(v ?? "").trim().slice(0, max);

  return {
    title: short(song.title, 120),
    artist: short(song.artist, 120),
    song_key: short(song.song_key, 16),
    dir: song.dir === "ltr" ? "ltr" : "rtl",
    lines,
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
  let beat = 0;
  const heartbeat = () => {
    const seconds = Math.round((Date.now() - began) / 1000);
    if (seconds - beat < 20) return;
    beat = seconds;
    /* not awaited: the reading must not wait on the bookkeeping */
    patchSong(env, token, songId, { status_note: `קורא, ${seconds} שניות` }).catch(() => {});
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
    title: song.title || "שיר בלי שם",
    artist: song.artist,
    song_key: song.song_key,
    dir: song.dir,
    lines: song.lines,
    status: "ready",
    status_note: "",
  };

  /* The song only gets its real address now, because only now is its name
     known. 23505 is the unique index on slug: another song already has it. */
  const wanted = slugify(fields.title);
  for (let attempt = 1; attempt <= 30; attempt++) {
    const failure = await patchSong(env, token, songId, {
      ...fields,
      slug: attempt === 1 ? wanted : `${wanted}_${attempt}`,
    });
    if (!failure) return;
    if (!failure.body.includes("23505")) {
      console.error("transcribe could not save", songId, failure.status, failure.body.slice(0, 200));
      await patchSong(env, token, songId, { status: "failed", status_note: `save ${failure.status}` });
      return;
    }
  }
}
