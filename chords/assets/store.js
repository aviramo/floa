// Where songs live.
//
// Run `node server.mjs` and they live in songs/*.json on disk: every save
// writes a file and rebuilds the site, so chords/<slug>/ is a real page the
// moment you press save. Open the built site without that server (GitHub
// Pages, a file:// copy) and the API is simply not there, so edits are kept
// in this browser instead and can be exported to JSON when you want them in
// the repo. Same screens either way; only the destination changes.

import { normalizeSong } from "../lib/song.mjs";

const API = "/api";
const KEY_SONGS = "chords:songs";
const KEY_DELETED = "chords:deleted";
const KEY_APIKEY = "chords:anthropic-key";

let modePromise = null;

export function detectMode() {
  if (!modePromise) {
    modePromise = fetch(`${API}/health`, { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((info) => (info?.ok ? { mode: "server", canDecode: !!info.canDecode } : local()))
      .catch(local);
  }
  return modePromise;
}

function local() {
  return { mode: "local", canDecode: !!getApiKey() };
}

export const isServer = async () => (await detectMode()).mode === "server";

// ------------------------------------------------------------ local shelf

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    throw new Error("אחסון הדפדפן מלא או חסום, השינוי לא נשמר.");
  }
}

const localSongs = () => readJson(KEY_SONGS, {});
const deletedSlugs = () => readJson(KEY_DELETED, []);

export function getApiKey() {
  try {
    return localStorage.getItem(KEY_APIKEY) || "";
  } catch {
    return "";
  }
}

export function setApiKey(key) {
  try {
    if (key) localStorage.setItem(KEY_APIKEY, key);
    else localStorage.removeItem(KEY_APIKEY);
    modePromise = null;
  } catch {
    /* private browsing; the key just will not stick */
  }
}

// --------------------------------------------------------------- the API

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `שגיאת שרת (${res.status})`);
  return body;
}

// `seeded` is the list the build baked into the page. In server mode it is
// ignored, because the server knows better.
export async function listSongs(seeded = []) {
  if (await isServer()) return (await api("/songs")).songs;

  const overrides = localSongs();
  const dead = new Set(deletedSlugs());
  const out = [];
  const seen = new Set();
  for (const song of seeded) {
    if (dead.has(song.slug)) continue;
    seen.add(song.slug);
    const mine = overrides[song.slug];
    out.push(mine ? { ...summary(mine), local: true } : song);
  }
  for (const [slug, song] of Object.entries(overrides)) {
    if (seen.has(slug) || dead.has(slug)) continue;
    out.push({ ...summary(song), local: true });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, "he"));
}

function summary(song) {
  return {
    slug: song.slug,
    title: song.title,
    artist: song.artist,
    key: song.key,
    dir: song.dir,
    lines: song.sections.reduce((n, s) => n + s.lines.length, 0),
  };
}

export async function getSong(slug, embedded = null) {
  if (await isServer()) return normalizeSong((await api(`/songs/${encodeURIComponent(slug)}`)).song);
  const mine = localSongs()[slug];
  if (mine) return normalizeSong(mine);
  if (embedded) return normalizeSong(embedded);
  throw new Error("השיר לא נמצא.");
}

export async function saveSong(song, previousSlug = "") {
  const clean = normalizeSong(song);
  if (await isServer()) {
    const body = await api(`/songs/${encodeURIComponent(clean.slug)}`, {
      method: "PUT",
      body: JSON.stringify({ song: clean, previousSlug }),
    });
    return normalizeSong(body.song);
  }

  const shelf = localSongs();
  if (previousSlug && previousSlug !== clean.slug) delete shelf[previousSlug];
  shelf[clean.slug] = clean;
  writeJson(KEY_SONGS, shelf);
  if (previousSlug && previousSlug !== clean.slug) markDeleted(previousSlug);
  const dead = deletedSlugs().filter((s) => s !== clean.slug);
  writeJson(KEY_DELETED, dead);
  return clean;
}

export async function deleteSong(slug) {
  if (await isServer()) {
    await api(`/songs/${encodeURIComponent(slug)}`, { method: "DELETE" });
    return;
  }
  const shelf = localSongs();
  delete shelf[slug];
  writeJson(KEY_SONGS, shelf);
  markDeleted(slug);
}

function markDeleted(slug) {
  const dead = deletedSlugs();
  if (!dead.includes(slug)) writeJson(KEY_DELETED, [...dead, slug]);
}

// -------------------------------------------------------------- decoding

export async function decodeMedia(media) {
  if (await isServer()) {
    const body = await api("/decode", { method: "POST", body: JSON.stringify(media) });
    return normalizeSong(body.song);
  }

  const key = getApiKey();
  if (!key) throw new Error("כדי לפענח קובץ בלי השרת המקומי צריך להזין מפתח API.");

  const [{ buildRequest, extractSong }] = await Promise.all([import("../lib/decode.mjs")]);
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(buildRequest(media)),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `הפענוח נכשל (${res.status})`);
  return normalizeSong(extractSong(body));
}

// --------------------------------------------------------------- export

export function downloadJson(song) {
  const blob = new Blob([JSON.stringify(song, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${song.slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
