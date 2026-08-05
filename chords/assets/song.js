// The reading page. The chart is already in the HTML the build produced, so
// it is on screen before this file loads; all this does is pick up an edit
// that has not been written back to the repo yet, and remember your font size.

import { getSong } from "./store.js";
import { renderLine } from "./chart.js";
import { normalizeSong } from "../lib/song.mjs";

const params = new URLSearchParams(location.search);
const slug = params.get("song") || window.__SLUG__ || "";
const embedded = window.__SONG__ ?? null;

const chartBox = document.querySelector("#chart");
const titleEl = document.querySelector("#title");
const subEl = document.querySelector("#subtitle");
const editLink = document.querySelector("#edit-link");
const rel = window.__REL__ ?? "";

const SIZE_KEY = "chords:size";
const clampSize = (n) => Math.max(0.8, Math.min(2.4, n));

function applySize(size) {
  document.documentElement.style.setProperty("--chart-size", `${size}rem`);
  try {
    localStorage.setItem(SIZE_KEY, String(size));
  } catch {
    /* nothing to do */
  }
}

let size = clampSize(Number(localStorage.getItem(SIZE_KEY)) || 1.15);
applySize(size);

document.querySelector("#bigger")?.addEventListener("click", () => applySize((size = clampSize(size + 0.1))));
document.querySelector("#smaller")?.addEventListener("click", () => applySize((size = clampSize(size - 0.1))));

function paint(song) {
  document.title = `${song.title} · אקורדים`;
  if (titleEl) titleEl.textContent = song.title;
  if (subEl) subEl.textContent = [song.artist, song.key && `סולם ${song.key}`].filter(Boolean).join(" · ");
  if (editLink && !embedded) editLink.href = `${rel}new/?song=${encodeURIComponent(song.slug)}`;

  const chart = document.createElement("div");
  chart.className = "chart";
  chart.dir = song.dir === "ltr" ? "ltr" : "rtl";

  for (const section of song.sections) {
    const sec = document.createElement("section");
    sec.className = "sec";
    if (section.label || section.repeat > 1) {
      const head = document.createElement("div");
      head.className = "sec-head";
      if (section.label) {
        const label = document.createElement("span");
        label.className = "sec-label";
        label.textContent = section.label;
        head.append(label);
      }
      if (section.repeat > 1) {
        const rep = document.createElement("span");
        rep.className = "sec-rep";
        rep.dir = "ltr";
        rep.textContent = `×${section.repeat}`;
        head.append(rep);
      }
      sec.append(head);
    }
    for (const line of section.lines) {
      const el = document.createElement("div");
      el.className = "line";
      renderLine(el, line);
      sec.append(el);
    }
    chart.append(sec);
  }
  chartBox.replaceChildren(chart);
}

getSong(slug, embedded)
  .then((song) => {
    // Skip the repaint when the built page already shows exactly this.
    const same = embedded && JSON.stringify(normalizeSong(embedded)) === JSON.stringify(song);
    if (!same) paint(song);
  })
  .catch((err) => {
    if (embedded) return; // the built chart stands on its own
    chartBox.innerHTML = "";
    const note = document.createElement("p");
    note.className = "note err";
    note.textContent = err.message;
    chartBox.append(note);
  });
