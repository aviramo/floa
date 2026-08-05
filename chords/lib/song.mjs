// One shape for a song, enforced everywhere: what the decoder returns, what
// the editor saves, and what sits in songs/*.json all pass through here first.

import { sortedChords, parseLine, snapToGrapheme } from "./chordpro.mjs";
import { slugify } from "./slug.mjs";

export function emptySong() {
  return {
    slug: "",
    title: "",
    artist: "",
    key: "",
    dir: "rtl",
    sections: [{ label: "", repeat: 1, lines: [{ text: "", chords: [] }] }],
  };
}

export function normalizeSong(input, { slug } = {}) {
  const raw = input && typeof input === "object" ? input : {};
  const song = {
    slug: String(slug || raw.slug || slugify(raw.title || "")),
    title: str(raw.title),
    artist: str(raw.artist),
    key: str(raw.key),
    dir: raw.dir === "ltr" ? "ltr" : "rtl",
    sections: [],
  };

  for (const section of Array.isArray(raw.sections) ? raw.sections : []) {
    const lines = [];
    for (const line of Array.isArray(section?.lines) ? section.lines : []) {
      // The decoder hands back inline "[C]מילה" strings; the editor hands back
      // objects. Both are welcome.
      const parsed = typeof line === "string" ? parseLine(line) : line;
      // Not str(): a lyric's leading and trailing spaces are part of the
      // line, and trimming them would slide every chord index along with them.
      const text = lineText(parsed?.text);
      const chords = sortedChords(parsed, text.length).map((chord) => ({
        i: snapToGrapheme(chord.i, text),
        c: chord.c,
      }));
      lines.push({ text, chords });
    }
    song.sections.push({
      label: str(section?.label),
      repeat: Math.max(1, Math.min(99, Math.round(Number(section?.repeat) || 1))),
      lines: lines.length ? lines : [{ text: "", chords: [] }],
    });
  }

  if (!song.sections.length) song.sections = emptySong().sections;
  if (!song.title) song.title = firstLyric(song) || "שיר ללא שם";
  if (!song.slug) song.slug = slugify(song.title);
  return song;
}

function firstLyric(song) {
  for (const section of song.sections) {
    for (const line of section.lines) if (line.text.trim()) return line.text.trim();
  }
  return "";
}

function str(v) {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

function lineText(v) {
  return (typeof v === "string" ? v : v == null ? "" : String(v)).replace(/[\r\n]+/g, " ");
}

// What the index page needs, without dragging every lyric along.
export function songSummary(song) {
  const lines = song.sections.reduce((n, s) => n + s.lines.length, 0);
  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    key: song.key,
    dir: song.dir,
    lines,
  };
}
