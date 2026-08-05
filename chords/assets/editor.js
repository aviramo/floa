import { attachLineEditor, remapChords } from "./chart.js";
import { parseSong, serializeSong } from "../lib/chordpro.mjs";
import { emptySong, normalizeSong } from "../lib/song.mjs";
import { slugify } from "../lib/slug.mjs";
import {
  decodeMedia,
  deleteSong,
  detectMode,
  downloadJson,
  getApiKey,
  getSong,
  saveSong,
  setApiKey,
} from "./store.js";

const rel = window.__REL__ ?? "";
const params = new URLSearchParams(location.search);
const embedded = window.__SONG__ ?? null;
const wantedSlug = params.get("song") || window.__SLUG__ || "";

const el = (id) => document.getElementById(id);
const sectionsBox = el("sections");
const noteBox = el("note");

let song = normalizeSong(embedded ?? emptySong());
let originalSlug = embedded?.slug || "";
let slugTouched = false;
let dirty = false;
let mode = "local";

// ------------------------------------------------------------------ notes

function say(text, isError = false) {
  noteBox.textContent = text;
  noteBox.className = `note${isError ? " err" : ""}${text ? "" : " hidden"}`;
}

function markDirty() {
  dirty = true;
}

// ------------------------------------------------------------- meta fields

function fillMeta() {
  el("title").value = song.title;
  el("artist").value = song.artist;
  el("key").value = song.key;
  el("dir").value = song.dir;
  el("slug").value = song.slug;
  showUrl();
}

function showUrl() {
  el("url-preview").textContent = `chords/${song.slug || "…"}/`;
}

el("title").addEventListener("input", (e) => {
  song.title = e.target.value;
  if (!slugTouched) {
    song.slug = slugify(song.title);
    el("slug").value = song.slug;
  }
  showUrl();
  markDirty();
});

el("slug").addEventListener("input", (e) => {
  slugTouched = true;
  song.slug = slugify(e.target.value);
  showUrl();
  markDirty();
});
el("slug").addEventListener("blur", () => {
  el("slug").value = song.slug;
});

for (const field of ["artist", "key"]) {
  el(field).addEventListener("input", (e) => {
    song[field] = e.target.value;
    markDirty();
  });
}

el("dir").addEventListener("change", (e) => {
  song.dir = e.target.value === "ltr" ? "ltr" : "rtl";
  drawSections();
  markDirty();
});

// ------------------------------------------------------------- the sections

function drawSections() {
  sectionsBox.replaceChildren(...song.sections.map(drawSection));
}

function drawSection(section, si) {
  const box = document.createElement("div");
  box.className = "sec-edit";

  const head = document.createElement("header");

  const label = document.createElement("input");
  label.className = "label-in";
  label.value = section.label;
  label.placeholder = "שם המקטע, למשל פזמון";
  label.setAttribute("aria-label", "שם המקטע");
  label.addEventListener("input", () => {
    section.label = label.value;
    markDirty();
  });

  const repeat = document.createElement("input");
  repeat.className = "rep-in";
  repeat.type = "number";
  repeat.min = "1";
  repeat.max = "99";
  repeat.value = String(section.repeat);
  repeat.title = "מספר חזרות";
  repeat.setAttribute("aria-label", "מספר חזרות");
  repeat.addEventListener("input", () => {
    section.repeat = Math.max(1, Math.min(99, Number(repeat.value) || 1));
    markDirty();
  });

  head.append(label, repeat);
  head.append(
    miniButton("↑", "העלאת המקטע", () => moveSection(si, -1)),
    miniButton("↓", "הורדת המקטע", () => moveSection(si, 1)),
    miniButton("מחיקת מקטע", "", () => {
      if (song.sections.length === 1) return say("חייב להישאר מקטע אחד לפחות.", true);
      song.sections.splice(si, 1);
      drawSections();
      markDirty();
    }, "btn-danger"),
  );
  box.append(head);

  section.lines.forEach((line, li) => box.append(drawLine(section, line, li)));

  const add = miniButton("+ שורה", "", () => {
    section.lines.push({ text: "", chords: [] });
    drawSections();
    markDirty();
  });
  add.style.marginTop = "10px";
  box.append(add);
  return box;
}

function drawLine(section, line, li) {
  const box = document.createElement("div");
  box.className = "line-edit";

  const stage = document.createElement("div");
  stage.dir = song.dir;
  const editor = attachLineEditor(stage, line, markDirty);

  const row = document.createElement("div");
  row.className = "line-row";

  const text = document.createElement("input");
  text.className = "text-in";
  text.dir = song.dir;
  text.value = line.text;
  text.placeholder = "מילות השורה";
  text.setAttribute("aria-label", "מילות השורה");
  text.addEventListener("input", () => {
    line.chords = remapChords(line.text, text.value, line.chords);
    line.text = text.value;
    editor.redraw();
    markDirty();
  });
  text.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    section.lines.splice(li + 1, 0, { text: "", chords: [] });
    drawSections();
    markDirty();
  });

  row.append(
    text,
    miniButton("✕", "מחיקת השורה", () => {
      section.lines.splice(li, 1);
      if (!section.lines.length) section.lines.push({ text: "", chords: [] });
      drawSections();
      markDirty();
    }, "btn-danger"),
  );

  box.append(stage, row);
  return box;
}

function moveSection(si, delta) {
  const to = si + delta;
  if (to < 0 || to >= song.sections.length) return;
  const [moved] = song.sections.splice(si, 1);
  song.sections.splice(to, 0, moved);
  drawSections();
  markDirty();
}

function miniButton(text, title, onClick, extra = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn btn-mini ${extra}`.trim();
  button.textContent = text;
  if (title) button.title = title;
  button.addEventListener("click", onClick);
  return button;
}

el("add-section").addEventListener("click", () => {
  song.sections.push({ label: "", repeat: 1, lines: [{ text: "", chords: [] }] });
  drawSections();
  markDirty();
});

// ------------------------------------------------------------- source mode

const source = el("source");
let sourceOpen = false;

el("toggle-source").addEventListener("click", () => {
  sourceOpen = !sourceOpen;
  if (sourceOpen) {
    source.value = serializeSong(song);
    source.classList.remove("hidden");
    el("visual").classList.add("hidden");
    el("toggle-source").textContent = "חזרה לעריכה חזותית";
  } else {
    applySource();
  }
});

function applySource() {
  try {
    const parsed = normalizeSong(parseSong(source.value), { slug: song.slug });
    parsed.slug = song.slug;
    song = parsed;
  } catch (err) {
    return say(`לא הצלחתי לקרוא את המקור: ${err.message}`, true);
  }
  sourceOpen = false;
  source.classList.add("hidden");
  el("visual").classList.remove("hidden");
  el("toggle-source").textContent = "עריכה כטקסט";
  fillMeta();
  drawSections();
  markDirty();
  say("");
}

// ---------------------------------------------------------------- decoding

const drop = el("drop");
const fileInput = el("file");

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("hot");
});
drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("hot");
  const file = event.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
  fileInput.value = "";
});

async function handleFile(file) {
  const hasContent = song.sections.some((s) => s.lines.some((l) => l.text.trim()));
  if (hasContent && !confirm("הפענוח יחליף את תוכן השיר הנוכחי. להמשיך?")) return;

  showReference(file);
  drop.classList.add("busy");
  say("מפענח את הקובץ. זה יכול לקחת עד דקה.");
  try {
    const media = await toMedia(file);
    const decoded = await decodeMedia(media);
    decoded.slug = song.slug || decoded.slug;
    if (!slugTouched) decoded.slug = slugify(decoded.title);
    song = decoded;
    fillMeta();
    drawSections();
    markDirty();
    say("הפענוח הסתיים. השווה מול התמונה שמימין ותקן מה שצריך, אקורד נגרר למקומו.");
  } catch (err) {
    say(err.message, true);
  } finally {
    drop.classList.remove("busy");
  }
}

function showReference(file) {
  const box = el("reference");
  box.replaceChildren();
  if (!file.type.startsWith("image/")) {
    const name = document.createElement("p");
    name.className = "hint";
    name.textContent = file.name;
    box.append(name);
    return;
  }
  const img = document.createElement("img");
  img.className = "preview-img";
  img.alt = "הקובץ שהועלה, לצורך השוואה";
  img.src = URL.createObjectURL(file);
  box.append(img);
}

const MAX_EDGE = 2576; // what the model reads at full resolution

async function toMedia(file) {
  if (file.type === "application/pdf") {
    return { mediaType: "application/pdf", data: await asBase64(file) };
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("אפשר להעלות תמונה או PDF בלבד.");
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  const longest = bitmap ? Math.max(bitmap.width, bitmap.height) : 0;
  if (!bitmap || longest <= MAX_EDGE) {
    return { mediaType: normalizeImageType(file.type), data: await asBase64(file) };
  }

  const scale = MAX_EDGE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.92);
  return { mediaType: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
}

function normalizeImageType(type) {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(type) ? type : "image/jpeg";
}

function asBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("קריאת הקובץ נכשלה."));
    reader.onload = () => {
      const url = String(reader.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

// -------------------------------------------------------------- API key

el("save-key").addEventListener("click", () => {
  setApiKey(el("apikey").value.trim());
  el("apikey").value = "";
  el("key-box").classList.add("hidden");
  say("המפתח נשמר בדפדפן הזה בלבד.");
});

// ------------------------------------------------------------------ saving

el("save").addEventListener("click", async () => {
  if (sourceOpen) applySource();
  if (!song.title.trim()) return say("צריך שם לשיר.", true);

  el("save").disabled = true;
  say("שומר…");
  try {
    const saved = await saveSong(song, originalSlug);
    dirty = false;
    location.href =
      mode === "server"
        ? `${rel}${saved.slug}/`
        : `${rel}view/?song=${encodeURIComponent(saved.slug)}`;
  } catch (err) {
    say(err.message, true);
    el("save").disabled = false;
  }
});

el("export").addEventListener("click", () => {
  if (sourceOpen) applySource();
  downloadJson(normalizeSong(song));
});

el("delete").addEventListener("click", async () => {
  if (!originalSlug) return;
  if (!confirm(`למחוק את "${song.title}"?`)) return;
  try {
    await deleteSong(originalSlug);
    dirty = false;
    location.href = rel || "./";
  } catch (err) {
    say(err.message, true);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

// ------------------------------------------------------------------- boot

async function boot() {
  const info = await detectMode();
  mode = info.mode;

  if (mode === "local") {
    el("local-note").classList.remove("hidden");
    if (!getApiKey()) el("key-box").classList.remove("hidden");
  }

  if (!embedded && wantedSlug) {
    try {
      song = await getSong(wantedSlug);
      originalSlug = song.slug;
    } catch (err) {
      say(err.message, true);
    }
  }

  el("delete").classList.toggle("hidden", !originalSlug);
  slugTouched = !!originalSlug;
  fillMeta();
  drawSections();
}

boot();
