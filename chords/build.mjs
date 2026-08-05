// Turns songs/*.json into a site: an index, a page per song, and an editor.
//
// Every page is written with paths relative to itself, so the whole dist/
// folder can be dropped anywhere: served from the repo root by server.mjs,
// published under floa.co.il/chords/, or opened straight off a disk.

import { readdir, readFile, writeFile, mkdir, rm, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSong, songSummary } from "./lib/song.mjs";
import { chartHtml, escapeHtml } from "./lib/render.mjs";

export const ROOT = dirname(fileURLToPath(import.meta.url));
export const SONGS_DIR = join(ROOT, "songs");
export const DIST = join(ROOT, "dist");

export async function loadSongs() {
  if (!existsSync(SONGS_DIR)) return [];
  const files = (await readdir(SONGS_DIR)).filter((f) => f.endsWith(".json"));
  const songs = [];
  for (const file of files.sort()) {
    const raw = await readFile(join(SONGS_DIR, file), "utf8");
    try {
      songs.push(normalizeSong(JSON.parse(raw), { slug: file.replace(/\.json$/, "") }));
    } catch (err) {
      throw new Error(`songs/${file} is not valid JSON: ${err.message}`);
    }
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title, "he"));
}

// ------------------------------------------------------------- page shells

const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

function shell({ rel, title, body, script, data = {} }) {
  const globals = Object.entries({ __REL__: rel, ...data })
    .map(([key, value]) => `window.${key}=${json(value)};`)
    .join("");
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${rel}assets/app.css">
</head>
<body>
${body}
<script>${globals}</script>
<script type="module" src="${rel}assets/${script}"></script>
</body>
</html>
`;
}

function indexPage(songs) {
  const body = `<div class="wrap">
<header class="top">
<h1>אקורדים<span class="sub">${songs.length} שירים</span></h1>
<a class="btn btn-primary" href="new/">שיר חדש</a>
</header>
<p id="mode-note" class="note hidden">השרת המקומי אינו פעיל, אז הוספה ועריכה נשמרות בדפדפן הזה בלבד. כדי לכתוב לקבצי הריפו הרץ <code dir="ltr">node chords/server.mjs</code>.</p>
<input id="search" class="search" type="search" placeholder="חיפוש לפי שם או מבצע" aria-label="חיפוש שיר">
<ul id="songs" class="songs"></ul>
</div>`;
  return shell({
    rel: "",
    title: "אקורדים",
    body,
    script: "index.js",
    data: { __SONGS__: songs.map(songSummary) },
  });
}

function songPage(song) {
  const body = `<div class="wrap">
<header class="top">
<a class="btn no-print" href="../">רשימת השירים</a>
<h1 id="title">${escapeHtml(song.title)}<span class="sub" id="subtitle">${escapeHtml(
    [song.artist, song.key && `סולם ${song.key}`].filter(Boolean).join(" · "),
  )}</span></h1>
<button class="btn btn-mini no-print" id="smaller" type="button" title="הקטנה">א־</button>
<button class="btn btn-mini no-print" id="bigger" type="button" title="הגדלה">א+</button>
<a class="btn no-print" id="edit-link" href="edit/">עריכה</a>
</header>
<div id="chart">${chartHtml(song)}</div>
</div>`;
  return shell({
    rel: "../",
    title: `${song.title} · אקורדים`,
    body,
    script: "song.js",
    data: { __SONG__: song, __SLUG__: song.slug },
  });
}

// The page a browser-only song opens on, when there is no built page for it.
function viewPage() {
  const body = `<div class="wrap">
<header class="top">
<a class="btn no-print" href="../">רשימת השירים</a>
<h1 id="title">שיר<span class="sub" id="subtitle"></span></h1>
<button class="btn btn-mini no-print" id="smaller" type="button" title="הקטנה">א־</button>
<button class="btn btn-mini no-print" id="bigger" type="button" title="הגדלה">א+</button>
<a class="btn no-print" id="edit-link" href="../new/">עריכה</a>
</header>
<p class="note no-print">השיר הזה שמור בדפדפן הזה בלבד ואין לו עדיין דף משלו. שמירה דרך השרת המקומי, או ייצוא ה־JSON לתיקיית <code dir="ltr">chords/songs/</code>, ייתנו לו כתובת קבועה.</p>
<div id="chart"></div>
</div>`;
  return shell({ rel: "../", title: "שיר · אקורדים", body, script: "song.js" });
}

function editorPage({ rel, song, heading }) {
  const body = `<div class="wrap">
<header class="top">
<a class="btn" href="${song ? "../" : "../"}">${song ? "חזרה לשיר" : "רשימת השירים"}</a>
<h1>${escapeHtml(heading)}</h1>
</header>

<p id="note" class="note hidden"></p>
<p id="local-note" class="note hidden">השרת המקומי אינו פעיל, אז השינויים נשמרים בדפדפן הזה בלבד. כדי לכתוב לקבצי הריפו הרץ <code dir="ltr">node chords/server.mjs</code>, או ייצא JSON ושמור אותו ב־<code dir="ltr">chords/songs/</code>.</p>

<div class="panel">
<div class="fields">
<div class="field"><label for="title">שם השיר</label><input id="title" autocomplete="off"></div>
<div class="field"><label for="artist">מבצע</label><input id="artist" autocomplete="off"></div>
<div class="field"><label for="key">סולם</label><input id="key" dir="ltr" autocomplete="off" placeholder="Am"></div>
<div class="field"><label for="dir">כיוון הטקסט</label><select id="dir"><option value="rtl">מימין לשמאל</option><option value="ltr">משמאל לימין</option></select></div>
<div class="field"><label for="slug">כתובת הדף</label><input id="slug" dir="ltr" autocomplete="off"><span class="hint" id="url-preview" dir="ltr"></span></div>
</div>
</div>

<div class="panel">
<div class="drop" id="drop">גרירת תמונה או PDF של דף האקורדים לכאן, או לחיצה לבחירת קובץ. המערכת תקרא את המילים ואת האקורדים ותציב כל אקורד מעל ההברה שלו.</div>
<input type="file" id="file" class="hidden" accept="image/*,application/pdf">
<div id="key-box" class="hidden" style="margin-top:12px">
<div class="field"><label for="apikey">מפתח Anthropic API, לפענוח ישירות מהדפדפן. נשמר במכשיר הזה בלבד.</label><input id="apikey" type="password" dir="ltr" autocomplete="off" placeholder="sk-ant-..."></div>
<button class="btn btn-mini" id="save-key" type="button" style="margin-top:8px">שמירת המפתח</button>
</div>
<div id="reference"></div>
</div>

<p class="hint">לחיצה על מילה מוסיפה אקורד בדיוק שם. אקורד קיים נגרר למקומו, החיצים במקלדת מזיזים אותו תו אחד בכל פעם, Enter משנה את שמו ו־Delete מוחק אותו.</p>

<div id="visual">
<div id="sections"></div>
<button class="btn" id="add-section" type="button">הוספת מקטע</button>
</div>
<textarea id="source" class="hidden" spellcheck="false" aria-label="מקור השיר"></textarea>

<div class="bar">
<button class="btn btn-primary" id="save" type="button">שמירה</button>
<button class="btn" id="toggle-source" type="button">עריכה כטקסט</button>
<button class="btn" id="export" type="button">ייצוא JSON</button>
<span class="spacer"></span>
<button class="btn btn-danger hidden" id="delete" type="button">מחיקת השיר</button>
</div>
</div>`;

  return shell({
    rel,
    title: heading,
    body,
    script: "editor.js",
    data: song ? { __SONG__: song, __SLUG__: song.slug } : {},
  });
}

// -------------------------------------------------------------------- build

export async function build() {
  const songs = await loadSongs();

  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
  await cp(join(ROOT, "assets"), join(DIST, "assets"), { recursive: true });
  await cp(join(ROOT, "lib"), join(DIST, "lib"), { recursive: true });

  await writeFile(join(DIST, "index.html"), indexPage(songs));

  await mkdir(join(DIST, "new"), { recursive: true });
  await writeFile(
    join(DIST, "new", "index.html"),
    editorPage({ rel: "../", song: null, heading: "שיר חדש" }),
  );

  await mkdir(join(DIST, "view"), { recursive: true });
  await writeFile(join(DIST, "view", "index.html"), viewPage());

  for (const song of songs) {
    const dir = join(DIST, song.slug);
    await mkdir(join(dir, "edit"), { recursive: true });
    await writeFile(join(dir, "index.html"), songPage(song));
    await writeFile(
      join(dir, "edit", "index.html"),
      editorPage({ rel: "../../", song, heading: `עריכה: ${song.title}` }),
    );
  }

  return songs;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const songs = await build();
  console.log(`chords: built ${songs.length} song${songs.length === 1 ? "" : "s"} into dist/`);
  for (const song of songs) console.log(`  /${song.slug}/  ${song.title}`);
}
