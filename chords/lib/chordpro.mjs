// The whole app rests on one decision: a chord is anchored to a character
// index in the lyric, never to a pixel or a column of spaces.
//
// That is what makes right-to-left work. A chart built out of monospace
// padding (the Word and Google Docs way) breaks the moment an English chord
// name lands inside a Hebrew line, because the bidi algorithm reorders the
// run and the chord slides away from its syllable. An index cannot slide: the
// renderer splits the lyric at those indices and stacks each chord on top of
// its own slice, so the browser's own text layout puts them together, in
// whichever direction the line runs.
//
// On disk and in the source editor a line is written inline, ChordPro style:
//
//   [C]אַךְ טוֹב וָחֶסֶד [G]יִרְדְּפוּנִי
//
// which parses to { text: "אַךְ טוֹב וָחֶסֶד יִרְדְּפוּנִי", chords: [{i:0,c:"C"},{i:16,c:"G"}] }.
// A literal bracket in a lyric is written \[ .

export function parseLine(src) {
  const s = String(src ?? "");
  const chords = [];
  let text = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && (s[i + 1] === "[" || s[i + 1] === "]")) {
      text += s[i + 1];
      i++;
      continue;
    }
    if (ch === "[") {
      const close = s.indexOf("]", i + 1);
      if (close > i) {
        const name = s.slice(i + 1, close).trim();
        if (name) chords.push({ i: text.length, c: name });
        i = close;
        continue;
      }
    }
    text += ch;
  }
  return { text, chords };
}

export function serializeLine(line) {
  const text = String(line?.text ?? "");
  const chords = sortedChords(line, text.length);
  let out = "";
  let pos = 0;
  for (const chord of chords) {
    out += escapeBrackets(text.slice(pos, chord.i)) + `[${chord.c}]`;
    pos = chord.i;
  }
  return out + escapeBrackets(text.slice(pos));
}

function escapeBrackets(s) {
  return s.replace(/([[\]])/g, "\\$1");
}

export function sortedChords(line, max) {
  const limit = Number.isFinite(max) ? max : String(line?.text ?? "").length;
  return (line?.chords ?? [])
    .filter((c) => c && String(c.c ?? "").trim())
    .map((c) => ({ i: clamp(Math.round(Number(c.i) || 0), 0, limit), c: String(c.c).trim() }))
    .sort((a, b) => a.i - b.i);
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// "אַךְ" is three characters and one letter. A chord may only sit where a
// letter starts, never between a letter and the vowel clinging to it, or the
// renderer would tear the two apart into different slices.
let segmenter = null;

export function graphemeStarts(text) {
  const starts = new Set([0, text.length]);
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    segmenter ??= new Intl.Segmenter("he", { granularity: "grapheme" });
    for (const piece of segmenter.segment(text)) starts.add(piece.index);
  } else {
    for (let i = 0; i < text.length; i++) if (!/\p{M}/u.test(text[i])) starts.add(i);
  }
  return starts;
}

export function snapToGrapheme(index, text) {
  const target = clamp(Math.round(index), 0, text.length);
  const starts = graphemeStarts(text);
  if (starts.has(target)) return target;
  for (let i = target; i >= 0; i--) if (starts.has(i)) return i;
  return 0;
}

// One line becomes a list of slices, each carrying the chord that sits above
// its first character. Both the static renderer and the browser editor build
// their markup from this, so a chart looks the same whoever drew it.
export function segments(line) {
  const text = String(line?.text ?? "");
  const chords = sortedChords(line, text.length);
  if (!chords.length) return [{ chord: null, text, start: 0 }];

  const out = [];
  if (chords[0].i > 0) out.push({ chord: null, text: text.slice(0, chords[0].i), start: 0 });
  for (let k = 0; k < chords.length; k++) {
    const start = chords[k].i;
    const end = k + 1 < chords.length ? chords[k + 1].i : text.length;
    out.push({ chord: chords[k].c, text: text.slice(start, end), start });
  }
  return out;
}

// ---------------------------------------------------------------- whole song

// {title: ...} for the metadata, "== label (×3)" to open a section, one lyric
// line per line. Blank lines are ignored; sections carry the structure.
const META_RE = /^\{\s*([a-z_]+)\s*:\s*([\s\S]*?)\s*\}$/i;
const SECTION_RE = /^==\s*(.*)$/;
const REPEAT_RE = /[(\[]?\s*(?:×|x|\*)\s*(\d{1,2})\s*[)\]]?\s*$/i;

export function parseSong(source) {
  const song = { title: "", artist: "", key: "", dir: "rtl", sections: [] };
  let section = null;

  for (const raw of String(source ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const meta = line.match(META_RE);
    if (meta) {
      const field = meta[1].toLowerCase();
      if (field in song && field !== "sections") song[field] = meta[2];
      continue;
    }

    const head = line.match(SECTION_RE);
    if (head) {
      let label = head[1].trim();
      let repeat = 1;
      const rep = label.match(REPEAT_RE);
      if (rep) {
        repeat = Math.max(1, parseInt(rep[1], 10));
        label = label.slice(0, rep.index).trim();
      }
      section = { label, repeat, lines: [] };
      song.sections.push(section);
      continue;
    }

    if (!section) {
      section = { label: "", repeat: 1, lines: [] };
      song.sections.push(section);
    }
    section.lines.push(parseLine(raw));
  }

  song.dir = song.dir === "ltr" ? "ltr" : "rtl";
  return song;
}

export function serializeSong(song) {
  const out = [];
  if (song.title) out.push(`{title: ${song.title}}`);
  if (song.artist) out.push(`{artist: ${song.artist}}`);
  if (song.key) out.push(`{key: ${song.key}}`);
  out.push(`{dir: ${song.dir === "ltr" ? "ltr" : "rtl"}}`);

  for (const section of song.sections ?? []) {
    out.push("");
    const head = ["=="];
    if (section.label) head.push(section.label);
    if (Number(section.repeat) > 1) head.push(`(×${Number(section.repeat)})`);
    if (head.length > 1) out.push(head.join(" "));
    for (const line of section.lines ?? []) out.push(serializeLine(line));
  }
  return out.join("\n").trim() + "\n";
}
