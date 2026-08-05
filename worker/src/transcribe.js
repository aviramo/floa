/* ==========================================================================
   Reading a chord sheet.

   A photograph or a PDF goes in, a song goes out: the words as printed, and
   for every chord the index of the character it sits over.

   This lives in the Worker for one reason. The Anthropic key must never reach
   a browser, exactly like the Resend key next door. Nothing is stored here
   either; the picture is read once and forgotten.

   The hard part is not reading the text, it is the POSITION. A chord printed
   above a Hebrew line has to come back as an index counted from the start of
   the line in reading order, which for Hebrew is the right. Getting that wrong
   is what makes every naive chord sheet in Word come out scrambled, so the
   prompt below spends most of its words on it, and the schema forces the
   answer into the one shape the app can use.
   ========================================================================== */

const MODEL = "claude-opus-5";

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

const SYSTEM = `You read a photograph or a scan of a chord sheet and return the song as structured data.

A chord sheet is lyrics with chord symbols printed on their own lines, floating above the words. Recovering the words is the easy half. The half that matters is recovering, for every single chord, WHICH SYLLABLE it was printed above.

HOW A LINE IS REPRESENTED

Each printed lyric line becomes one entry:
- "text" is the words of that line, exactly as printed. Chord symbols NEVER appear in "text". The chord line above it is not a line of its own in the output; its chords become the "chords" of the lyric line beneath it.
- "chords" is every chord printed above that lyric line.
- "pos" is a 0-based index INTO "text", counted in characters from the START of the line in READING ORDER. For Hebrew that is the rightmost character of the line; for English it is the leftmost. Index 0 is the first character the reader reads. Spaces count. "pos" may equal the length of "text", which places the chord just past the last word.

HOW TO FIND pos, FOR EVERY CHORD

1. Look at where the chord symbol starts horizontally in the image.
2. Look straight down to the lyric line beneath it and identify the exact word, and within that word the exact syllable, that the chord's left edge sits over.
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
- If the sheet is multiple pages, return them as one continuous song.
- If a part of the image is unreadable, return the lines you can read rather than inventing the rest.`;

const USER_TEXT =
  "This is a chord sheet. Return the whole song. Take particular care with the position of each chord: " +
  "for every chord, find the syllable it is printed above and give the index of that syllable's first character in the line's text.";

/* Reads one file. Throws an Error whose message is safe to log, never to show:
   the caller decides what the visitor is told. */
export async function readChordSheet(env, mediaType, data) {
  const source = { type: "base64", media_type: mediaType, data };

  const document = mediaType === "application/pdf"
    ? { type: "document", source }
    : { type: "image", source };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 24000,
      system: SYSTEM,
      /* Thinking is on by default on this model and is left on: the counting
         above is exactly the kind of work it helps with. `effort` is the knob
         to turn if this ever needs to be cheaper or faster. */
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{ role: "user", content: [document, { type: "text", text: USER_TEXT }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`anthropic ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }

  const message = await response.json();

  /* A refusal is a normal 200 with an empty or partial body, so it has to be
     checked before the content is read at all. */
  if (message.stop_reason === "refusal") throw new Error("refusal");
  if (message.stop_reason === "max_tokens") throw new Error("truncated");

  const text = (message.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  if (!text.trim()) throw new Error("empty");

  const song = JSON.parse(text);
  return clean(song);
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
