// The chart, as HTML. Each slice of lyric is an inline-block carrying its
// chord in a block above it, so the two stay welded together: the browser
// lays the slices out in the line's own direction, and the chord rides along.
// Nothing here measures pixels, which is exactly why nothing here breaks in
// right-to-left.

import { segments } from "./chordpro.mjs";

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function lineHtml(line) {
  const parts = segments(line).map((seg) => {
    const chord = seg.chord ? escapeHtml(seg.chord) : "";
    // The chord label is its own bidi island. Without the isolation "Em7"
    // next to Hebrew is free to reorder, which is the exact bug this app
    // exists to avoid.
    return (
      `<span class="seg">` +
      `<span class="ch" dir="ltr">${chord}</span>` +
      `<span class="tx" data-start="${seg.start}">${escapeHtml(seg.text)}</span>` +
      `</span>`
    );
  });
  return `<div class="line">${parts.join("")}</div>`;
}

export function chartHtml(song) {
  const sections = song.sections.map((section) => {
    const head =
      section.label || section.repeat > 1
        ? `<div class="sec-head">` +
          (section.label ? `<span class="sec-label">${escapeHtml(section.label)}</span>` : "") +
          (section.repeat > 1 ? `<span class="sec-rep" dir="ltr">×${section.repeat}</span>` : "") +
          `</div>`
        : "";
    return `<section class="sec">${head}${section.lines.map(lineHtml).join("")}</section>`;
  });
  return `<div class="chart" dir="${song.dir === "ltr" ? "ltr" : "rtl"}">${sections.join("")}</div>`;
}
