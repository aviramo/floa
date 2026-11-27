/* The media store's rules (worker/MEDIA.md, "Keys", "Allowed types", "Metadata", "Per-business settings").

   A key is always relative to the business: <folder>/<name>, or trash/<folder>/<name>. In R2 it is stored as <b>/<key>.
   Nothing here names a business: the business is the path segment after /media/, and the first segment of every R2 key. */

import { MediaError } from "./http.js";

/* --- types ------------------------------------------------------------------------------------------------------------- */

export const TYPES = {
  "image/jpeg": { ext: ["jpg", "jpeg"], canon: "jpg" },
  "image/png": { ext: ["png"], canon: "png" },
  "image/webp": { ext: ["webp"], canon: "webp" },
  "image/gif": { ext: ["gif"], canon: "gif" },
  "image/avif": { ext: ["avif"], canon: "avif" },
  "image/heic": { ext: ["heic"], canon: "heic" },
  "video/mp4": { ext: ["mp4", "m4v"], canon: "mp4" },
  "video/quicktime": { ext: ["mov"], canon: "mov" },
  "video/webm": { ext: ["webm"], canon: "webm" },
  "audio/mpeg": { ext: ["mp3"], canon: "mp3" },
  "audio/mp4": { ext: ["m4a"], canon: "m4a" },
  "audio/ogg": { ext: ["ogg", "opus"], canon: "ogg" },
  "audio/flac": { ext: ["flac"], canon: "flac" },
  "audio/wav": { ext: ["wav"], canon: "wav" },
  /* data files (contract addition 6): JSON, and only inside a `_data` folder of a public top folder */
  "application/json": { ext: ["json"], canon: "json", data: true },
};

const EXT_TYPE = {};
for (const [type, t] of Object.entries(TYPES)) for (const e of t.ext) EXT_TYPE[e] = type;

export const PUBLIC_CACHE = "public, max-age=86400";
export const SHORT_CACHE = "public, max-age=60";     /* the index files, the folders file and every data file */

/* the type a Content-Type header names, or null */
export function contentTypeOf(header) {
  const t = String(header || "").split(";")[0].trim().toLowerCase();
  return TYPES[t] ? t : null;
}
export function extOf(name) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}
export function typeOfName(name) { return EXT_TYPE[extOf(name)] || null; }

/* --- keys -------------------------------------------------------------------------------------------------------------- */

export const SLUG = /^[a-z][a-z0-9-]{1,39}$/;
export const SEG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const DATA = "_data";
export const SHA = /^[0-9a-f]{64}$/;

export function nameOk(name) { return NAME.test(name) && !name.includes(".."); }

/* a folder as its segments: 1 to 3, each a SEG, the first (the top folder) never `trash`. The one exception is the data
   folder: exactly <top>/_data, directly under a top folder (worker/MEDIA.md, "Keys"). Returns { top, data } or null. */
export function folderOf(segs) {
  if (segs.length < 1 || segs.length > 3) return null;
  const data = segs.length === 2 && segs[1] === DATA;
  const plain = data ? segs.slice(0, 1) : segs;
  if (!plain.every((s) => SEG.test(s))) return null;
  if (plain[0] === "trash") return null;
  return { top: plain[0], data };
}

/* <folder>/<name> -> { key, folder, top, name, type, data }. A shape outside the rules is `validation`; an extension that
   is not in the table, that does not belong to its folder kind, or (with `type`) that does not belong to that type, is
   `unsupported_type`. */
export function parseKey(rel, type) {
  if (typeof rel !== "string" || rel.length > 400) throw new MediaError("validation", "key");
  const segs = rel.split("/");
  const name = segs.pop();
  const f = folderOf(segs);
  if (!f) throw new MediaError("validation", "folder");
  if (!nameOk(name)) throw new MediaError("validation", "name");
  const own = typeOfName(name);
  if (!own) throw new MediaError("unsupported_type");
  if (type && own !== type) throw new MediaError("unsupported_type");
  if (!!TYPES[own].data !== f.data) throw new MediaError("unsupported_type");
  return { key: rel, folder: segs.join("/"), top: f.top, name, type: own, data: f.data };
}

/* trash/<folder>/<name> -> the parsed original key, plus { trashKey } */
export function parseTrashKey(rel) {
  if (typeof rel !== "string" || !rel.startsWith("trash/")) throw new MediaError("validation", "key");
  const k = parseKey(rel.slice(6));
  return { ...k, trashKey: rel };
}

/* the name a POST to a folder stores under: the first 32 hex of the sha256 plus the canonical extension */
export function hashName(sha, type) { return sha.slice(0, 32) + "." + TYPES[type].canon; }

/* a list prefix: [trash/]<1..3 folder segments>/<the start of a name>, or `trash/` alone -> { trash, top, data }, where
   `data` means the prefix itself is a data folder (<top>/_data/): only such a prefix lists data files */
const PARTIAL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function parsePrefix(prefix) {
  if (typeof prefix !== "string" || prefix.length > 400) throw new MediaError("validation", "prefix");
  if (prefix === "trash/") return { trash: true, top: null, data: false };
  let p = prefix, trash = false;
  if (p.startsWith("trash/")) { trash = true; p = p.slice(6); }
  const segs = p.split("/");
  const partial = segs.pop();
  const f = folderOf(segs);
  if (!f) throw new MediaError("validation", "prefix");
  if (partial !== "" && (!PARTIAL.test(partial) || partial.includes(".."))) throw new MediaError("validation", "prefix");
  return { trash, top: f.top, data: f.data };
}

/* a key relative to the business, from a full R2 key; null for the store's own objects (.settings.json, .gone/, _index/) */
export function relOf(b, fullKey) {
  const rel = fullKey.slice(b.length + 1);
  return rel && rel[0] !== "." && rel[0] !== "_" ? rel : null;
}
/* <top>/_data/<name>, with or without trash/ in front */
export function isDataKey(rel) {
  const segs = (rel.startsWith("trash/") ? rel.slice(6) : rel).split("/");
  return segs.length === 3 && segs[1] === DATA;
}
export function cacheFor(rel) { return isDataKey(rel) ? SHORT_CACHE : PUBLIC_CACHE; }

/* --- X-Media-Meta ------------------------------------------------------------------------------------------------------ */

/* control, bidi and zero-width characters: the set roster refuses */
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f​-‍‪-‮⁦-⁩﻿]/;
const META_KEYS = new Set(["sha256", "title", "copyright", "w", "h", "duration"]);
export const META_MAX = 4096;

/* the X-Media-Meta header. `optional` (a data file): no header is {}, and the sha256 may be left out */
export function parseMeta(header, { optional = false } = {}) {
  if (!header && optional) return {};
  if (!header || header.length > META_MAX) throw new MediaError("bad_request");
  let v;
  try { v = JSON.parse(decodeURIComponent(header)); } catch { throw new MediaError("bad_request"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new MediaError("bad_request");
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (!META_KEYS.has(k)) throw new MediaError("validation", k);
    if (val === null || val === undefined) continue;
    if (k === "sha256") {
      if (typeof val !== "string" || !SHA.test(val)) throw new MediaError("validation", k);
      out.sha256 = val;
    } else if (k === "w" || k === "h") {
      if (!Number.isInteger(val) || val < 1 || val > 20000) throw new MediaError("validation", k);
      out[k] = val;
    } else if (k === "duration") {
      if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 86400
          || Math.abs(val * 1000 - Math.round(val * 1000)) > 1e-6) throw new MediaError("validation", k);
      out.duration = val;
    } else {
      if (typeof val !== "string" || [...val].length > 200 || BAD_CHARS.test(val)) throw new MediaError("validation", k);
      if (val.trim()) out[k] = val;
    }
  }
  if (!out.sha256 && !optional) throw new MediaError("validation", "sha256");
  return out;
}

export function isoNow(now = Date.now()) { return new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"); }

/* R2 custom metadata for an upload: numbers as strings, title and copyright percent-encoded */
export function customMetadataOf(meta, { up, by }) {
  const cm = { up };
  if (meta.sha256) cm.sha256 = meta.sha256;
  if (meta.w) cm.w = String(meta.w);
  if (meta.h) cm.h = String(meta.h);
  if (meta.duration !== undefined) cm.duration = String(meta.duration);
  if (meta.title) cm.title = encodeURIComponent(meta.title);
  if (meta.copyright) cm.copyright = encodeURIComponent(meta.copyright);
  if (by) cm.by = by;
  return cm;
}

/* --- the item of a list (both the Worker list and the index file) --------------------------------------------------------- */

const dec = (s) => { try { return decodeURIComponent(s); } catch { return undefined; } };

export function itemOf(obj, rel, url) {
  const cm = obj.customMetadata || {};
  const item = {
    key: rel,
    size: obj.size,
    type: (obj.httpMetadata && obj.httpMetadata.contentType) || typeOfName(rel.split("/").pop()) || "application/octet-stream",
    uploaded: cm.up || (obj.uploaded instanceof Date ? isoNow(obj.uploaded.getTime()) : undefined),
  };
  if (SHA.test(cm.sha256 || "")) item.sha256 = cm.sha256;
  item.url = url;
  for (const k of ["w", "h"]) if (/^\d{1,5}$/.test(cm[k] || "")) item[k] = Number(cm[k]);
  if (cm.duration !== undefined && Number.isFinite(Number(cm.duration)) && cm.duration !== "") item.duration = Number(cm.duration);
  for (const k of ["title", "copyright"]) if (cm[k]) { const v = dec(cm[k]); if (v) item[k] = v; }
  if (cm.trashed) item.trashed = cm.trashed;
  return item;
}

/* the same bytes? By sha256 when both copies carry one, else by size and etag */
export function sameBytes(a, b) {
  const x = a && a.customMetadata && a.customMetadata.sha256, y = b && b.customMetadata && b.customMetadata.sha256;
  if (SHA.test(x || "") && SHA.test(y || "")) return x === y;
  return !!a && !!b && a.size === b.size && !!a.etag && a.etag === b.etag;
}

/* --- settings (<b>/.settings.json, in the private bucket) ----------------------------------------------------------------- */

export const MAX_FILE_BYTES = 90 * 1024 * 1024;   /* single-request uploads */
export const MAX_DATA_BYTES = 1024 * 1024;        /* one data file */
export const MAX_ITEMS_CAP = 10000;               /* keeps the quota and index listings inside the subrequest budget */
export const DEFAULTS = {
  public_folders: [],
  origins: [],
  quota_bytes: 5 * 1024 * 1024 * 1024,
  max_items: 5000,
  max_file_bytes: MAX_FILE_BYTES,
  moving: null,
};
const SETTINGS_TTL = 60 * 1000;
const MAX_ORIGINS = 20, MAX_FOLDERS = 20;
const settingsCache = new Map();   /* b -> { value: {settings, etag}, until }; "off" is never kept */

export function settingsKey(b) { return b + "/.settings.json"; }
export function _clearSettingsCache() { settingsCache.clear(); }

function originOk(o) {
  if (typeof o !== "string" || o.length > 200) return false;
  try {
    const u = new URL(o);
    if (u.origin !== o) return false;
    return u.protocol === "https:" || (u.protocol === "http:" && u.hostname === "localhost");
  } catch { return false; }
}
const posInt = (v, max) => Number.isSafeInteger(v) && v > 0 && v <= max;

/* what was stored, with the defaults under it and every field made safe to use */
export function normalizeSettings(raw) {
  const s = { ...DEFAULTS };
  if (Array.isArray(raw.public_folders)) s.public_folders = [...new Set(raw.public_folders.filter((f) => typeof f === "string" && SEG.test(f) && f !== "trash"))];
  if (Array.isArray(raw.origins)) s.origins = raw.origins.filter(originOk);
  if (posInt(raw.quota_bytes, Number.MAX_SAFE_INTEGER)) s.quota_bytes = raw.quota_bytes;
  if (posInt(raw.max_items, MAX_ITEMS_CAP)) s.max_items = raw.max_items;
  if (posInt(raw.max_file_bytes, MAX_FILE_BYTES)) s.max_file_bytes = raw.max_file_bytes;
  const m = raw.moving;
  if (m && typeof m === "object" && typeof m.folder === "string" && SEG.test(m.folder) && typeof m.public === "boolean") {
    s.moving = { folder: m.folder, public: m.public, since: typeof m.since === "string" ? m.since : isoNow(0) };
  }
  return s;
}

/* { settings, etag } or null when the business is off. Settings that exist are kept 60 s per business unless `fresh`.
   "Off" is never kept: the store is turned on by a write in another isolate (or with wrangler), and an isolate that had
   remembered "off" answered 404 to staff, and refused everyone else, for up to a minute after it was on. */
export async function readSettings(env, b, { fresh = false } = {}) {
  const now = Date.now();
  const hit = settingsCache.get(b);
  if (!fresh && hit && hit.value && hit.until > now) return hit.value;
  const obj = await env.MEDIA.get(settingsKey(b));
  let value = null;
  if (obj) {
    let raw;
    try { raw = JSON.parse(await obj.text()); } catch { raw = null; }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      console.error("media settings unreadable", b);
      throw new MediaError("upstream");
    }
    value = { settings: normalizeSettings(raw), etag: obj.etag };
  }
  if (value) rememberSettings(b, value); else settingsCache.delete(b);
  return value;
}

export function rememberSettings(b, value) {
  if (settingsCache.size > 500) settingsCache.clear();
  settingsCache.set(b, { value, until: Date.now() + SETTINGS_TTL });
}

/* PUT _settings: the body merged over what is stored (or the defaults). public_folders may be given only when the settings
   are created, or unchanged: it changes through _visibility. `moving` is never written from outside. */
const SETTABLE = new Set(["public_folders", "origins", "quota_bytes", "max_items", "max_file_bytes"]);
export function mergeSettings(body, current) {
  for (const k of Object.keys(body)) if (!SETTABLE.has(k)) throw new MediaError("validation", k);
  const next = { ...(current || DEFAULTS) };
  if ("public_folders" in body) {
    const f = body.public_folders;
    if (!Array.isArray(f) || f.length > MAX_FOLDERS || !f.every((x) => typeof x === "string" && SEG.test(x) && x !== "trash")
        || new Set(f).size !== f.length) throw new MediaError("validation", "public_folders");
    if (current) {
      const a = [...current.public_folders].sort().join("/"), z = [...f].sort().join("/");
      if (a !== z) throw new MediaError("validation", "public_folders");
    }
    next.public_folders = [...f];
  }
  if ("origins" in body) {
    const o = body.origins;
    if (!Array.isArray(o) || o.length > MAX_ORIGINS || !o.every(originOk)) throw new MediaError("validation", "origins");
    next.origins = [...new Set(o)];
  }
  if ("quota_bytes" in body && !posInt(body.quota_bytes, Number.MAX_SAFE_INTEGER)) throw new MediaError("validation", "quota_bytes");
  if ("max_items" in body && !posInt(body.max_items, MAX_ITEMS_CAP)) throw new MediaError("validation", "max_items");
  if ("max_file_bytes" in body && !posInt(body.max_file_bytes, MAX_FILE_BYTES)) throw new MediaError("validation", "max_file_bytes");
  for (const k of ["quota_bytes", "max_items", "max_file_bytes"]) if (k in body) next[k] = body[k];
  return next;
}
