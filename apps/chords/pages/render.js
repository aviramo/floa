/* ==========================================================================
   ONE SHELL, EVERY ADDRESS.

   The app draws itself, and it draws itself out of a database, so until the
   script has run and the answer has come back there is nothing on the page.
   That is fine for a person with a browser and no good at all for a crawler,
   which is why this exists: every address the library has is written to disk
   with the words already in it.

   What lands in the page is a SEED, not a second version of the app. It is the
   same words, in plain markup, and app.js takes it out the moment it starts
   (see `seed` in app.js) and draws the real thing over it. So there is one
   answer to "what is on this page", and the difference between the two readers
   is only how much of it moves.

   A chord sheet in a <pre> and not a grid: the seed has no measuring to do,
   nothing to line up in pixels, and the shape a chord sheet has had on paper
   for a hundred years, a row of chords over a row of words, is the shape that
   survives being read as text.
   ========================================================================== */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { model } from "./library.js";

/* --- WHAT VERSION OF ITSELF THE PAGE ASKS FOR ------------------------------
   Every script and stylesheet in the shell gets `?v=` and eight characters of
   its own content, worked out here at build time.

   Without it the address of app.js never changes, and GitHub Pages serves it
   with `Cache-Control: max-age=600`. So a change that has been live for nine
   minutes is a change that some readers have and some do not, and the ones who
   do not are looking at a page that behaves like the version before it with
   nothing on screen saying so. That is not a theoretical problem: it cost an
   afternoon of "it is not doing what you said it does" against a deploy that
   had already landed.

   PER FILE AND NOT ONE STAMP FOR ALL OF THEM, so that a change to the
   stylesheet does not throw away a cached app.js that is still correct.

   The engine businesses have had this from the start (see the hash in
   build.mjs); this is a manual business, its shell is written by hand, and so
   the shell is what carries it. */
const SHELL = await stamp(await readFile(new URL("../shell.html", import.meta.url), "utf8"));

async function stamp(html) {
  const ASSET = /\/chords\/assets\/([\w.-]+\.(?:js|css))/g;
  const names = new Set([...html.matchAll(ASSET)].map((m) => m[1]));
  const version = new Map();
  for (const name of names) {
    const body = await readFile(new URL("../public/assets/" + name, import.meta.url));
    version.set(name, createHash("sha1").update(body).digest("hex").slice(0, 8));
  }
  /* Replaced in one pass off the same expression that found them, so a name
     that is the tail of another name cannot be stamped twice. */
  return html.replace(ASSET, (whole, name) => whole + "?v=" + version.get(name));
}

const ORIGIN = "https://floa.co.il";
const BASE = "/chords";

/* --- text ------------------------------------------------------------------ */
export const esc = (s) => String(s == null ? "" : s)
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

/* The address of a page here, as a crawler must be given it: every segment
   percent encoded, because a Hebrew slug is a Hebrew slug on disk and a run of
   percent signs in a sitemap. The trailing slash is the one GitHub Pages
   actually serves a folder at, so it is what the canonical says. */
export const url = (...parts) => `${ORIGIN}${BASE}/${parts.map(encodeURIComponent).join("/")}${parts.length ? "/" : ""}`;
export const href = (...parts) => `${BASE}/${parts.map(encodeURIComponent).join("/")}${parts.length ? "/" : ""}`;

/* A description is read by a person in a list of results, so it is a sentence
   and it stops at a word. */
export function trim(text, max = 155) {
  const one = String(text || "").replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[ ,.:;]+$/, "") + "…";
}

/* --- the page -------------------------------------------------------------- */
/* Every replacement is given as a FUNCTION, which is not a style: a string
   replacement reads $& and $' as instructions, and a song whose title has a
   dollar in it would come out with the page rearranged around it. */
export function page({ title, description, canonical, head = "", seed = "" }) {
  const put = (into, mark, text) => into.replaceAll(mark, () => text);
  return [
    ["{{title}}", esc(title)],
    ["{{description}}", esc(description)],
    ["{{canonical}}", esc(canonical)],
    ["{{head}}", head],
    ["{{seed}}", seed],
  ].reduce((html, [mark, text]) => put(html, mark, text), SHELL);
}

export const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`;

/* --- who wrote it ---------------------------------------------------------- */
export const lyricists = (song) => model.people(song.lyrics_by);
export const composers = (song) => model.people(song.music_by);

export function creditLine(song) {
  const said = [];
  const words = lyricists(song);
  const tune = composers(song);
  if (words.length) said.push(`מילים: ${words.join(", ")}`);
  if (tune.length) said.push(`לחן: ${tune.join(", ")}`);
  return said.join(". ");
}

/* Everybody the library has a name for, gathered off the songs themselves.
   There is no table of creators and there should not be one: a person is what
   the songs say (see creatorsOf in app.js), and this is that answer again, for
   the pages the build writes. */
export function creators(songs) {
  const by = new Map();
  for (const song of songs) {
    for (const [names, role] of [[lyricists(song), "מילים"], [composers(song), "לחן"]]) {
      for (const name of names) {
        const rec = by.get(name) || { name, roles: new Set(), songs: [] };
        rec.roles.add(role);
        if (!rec.songs.includes(song)) rec.songs.push(song);
        by.set(name, rec);
      }
    }
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
}

/* THE STYLES ARE NOT GATHERED HERE ANY MORE. They were, into a page each, and
   a shelf is not a page now: it is the library held down to one kind of song,
   which is a state and not an address (see pickKind in app.js). Nothing on
   disk is a style, so nothing here has to know what the styles are. The app
   still gathers them, off the same songs, for the band of shelves it draws. */

/* --- the song, as a sheet -------------------------------------------------- */

/* The words as words: the artificial gaps are room on the screen and nothing in
   the language, so anything that reads the song for its meaning takes them out
   (a description, a sentence in a list). The sheet below keeps them as spaces,
   because there the chords are counting characters. */
export const words = (song) => model.normalizeLines(song.lines, song.dir)
  .filter((line) => line.type !== "section")
  .map((line) => model.withoutGaps(line.text).trim())
  .filter(Boolean);

function chordRow(line) {
  let row = "";
  for (const chord of line.chords) {
    if (chord.pos > row.length) row += " ".repeat(chord.pos - row.length);
    else if (row.length) row += " ";        // two chords over one syllable, still two words
    row += chord.chord;
  }
  return row;
}

export function sheet(song) {
  const lines = model.normalizeLines(song.lines, song.dir);
  const rows = [];
  for (const line of lines) {
    /* The repeat marks go into the seed as themselves. A crawler reading this
       gets what a musician reading it gets: `|:` above the block and `:|2`
       under it. The app draws them as a bar down the margin, and the seed has
       no margin to draw in. */
    if (line.repOpen) rows.push("|:");
    if (line.type === "section") rows.push("", `{${line.text}}`);
    else {
      const chords = chordRow(line).replace(/\s+$/, "");
      if (chords) rows.push(chords);
      rows.push(model.GAP ? line.text.split(model.GAP).join(" ").replace(/\s+$/, "") : line.text);
    }
    if (line.repShut) rows.push(`:|${line.repShut}`);
  }
  return rows.join("\n").replace(/^\n+/, "");
}

/* --- the seeds ------------------------------------------------------------- */
export const list = (items) => `<ul class="seed-list">\n${items.map((i) => `      <li><a href="${esc(i.href)}">${esc(i.text)}</a>${i.note ? ` <span class="seed-note">${esc(i.note)}</span>` : ""}</li>`).join("\n")}\n    </ul>`;

/* What kind of song it is is a WORD here and not a link, since a style stopped
   being a page: it is a state of the library (see pickKind in app.js), and a
   crawler offered a link to an address with no file behind it is a crawler sent
   to the domain's 404. It is still worth saying, because it is one of the few
   things the page says about the song besides the song itself. */
export function songSeed(song) {
  const credit = creditLine(song);
  const kinds = (song.styles || []).filter(Boolean);
  return `<article id="seed" class="seed" dir="${song.dir === "ltr" ? "ltr" : "rtl"}">
    <h1>${esc(song.title)}</h1>
    ${credit ? `<p class="seed-by">${esc(credit)}</p>` : ""}
    <pre class="seed-sheet">${esc(sheet(song))}</pre>
    ${kinds.length ? `<p class="seed-kinds">${esc(kinds.join(", "))}</p>` : ""}
    <p class="seed-back"><a href="${esc(href())}">כל השירים</a></p>
  </article>`;
}

/* The songs and the people, and no band of styles between them: a style has no
   page to link to any more (see above), and a list of words that lead nowhere
   is a heading spent on nothing. */
export function indexSeed(songs) {
  const who = creators(songs);
  return `<div id="seed" class="seed">
    <h1>אקורדים</h1>
    <p>אינדקס שירים עם אקורדים. כל שיר בדף משלו, והאקורדים בדיוק מעל המילים.</p>
    <h2>השירים</h2>
    ${list(songs.map((s) => ({ href: href(s.slug), text: s.title, note: creditLine(s) })))}
    ${who.length ? `<h2>מי כתב</h2>\n    ${list(who.map((c) => ({ href: href("creator", c.name), text: c.name, note: `${c.songs.length} שירים` })))}` : ""}
  </div>`;
}

export function shelfSeed({ heading, blurb, songs }) {
  return `<div id="seed" class="seed">
    <h1>${esc(heading)}</h1>
    ${blurb ? `<p>${esc(blurb)}</p>` : ""}
    ${list(songs.map((s) => ({ href: href(s.slug), text: s.title, note: creditLine(s) })))}
    <p class="seed-back"><a href="${esc(href())}">כל השירים</a></p>
  </div>`;
}
