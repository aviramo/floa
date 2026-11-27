/* /media/<business>/…: a generic media store for every business, in two R2 buckets. The whole definition, and the reasons
   behind every number here, are in worker/MEDIA.md.

   Reading costs no Worker request: public files, their lists (_index/<top>.json), the public folders (_index/_folders.json)
   and the data files are on the CDN (media.floa.co.il), and private files are read through presigned R2 URLs that a staff
   list hands out. Every staff action is exactly one request to this module.

   The business is always the path segment after /media/, and the first segment of every R2 key. Nothing in this module or
   in src/media/ names one; the business turns the store on by having <b>/.settings.json in the private bucket.

   Plain node, no `cloudflare:workers`, so the tests drive it directly (worker/test/media.test.mjs). */

import { MediaError, STATUS, codeOf, errorBody } from "./media/http.js";
import { _clearAuthCache, bearer, staffOf } from "./media/auth.js";
import {
  MAX_DATA_BYTES, MAX_FILE_BYTES, SEG, SLUG, TYPES, _clearSettingsCache, contentTypeOf, folderOf, hashName,
  mergeSettings, parseKey, parseMeta, parsePrefix, readSettings,
} from "./media/keys.js";
import { publicUrl, purgeUrls, rewriteIndex } from "./media/index-file.js";
import { _clearSigningKeys } from "./media/presign.js";
import {
  BATCH_MAX, checkReport, listPage, moveBatch, originalOf, parseExisting, publishFolders, purgeOne, restoreOne, settle,
  trashOne, upload, usageOf, visibility, writeSettings,
} from "./media/store.js";

export const MEDIA_PREFIX = "/media/";
export function isMediaPath(pathname) { return pathname === "/media" || pathname.startsWith(MEDIA_PREFIX); }

/* tests only */
export function _clearMediaCaches() { _clearAuthCache(); _clearSettingsCache(); _clearSigningKeys(); }

const REQUIRED = ["MEDIA", "MEDIA_PUBLIC", "MEDIA_PUBLIC_BASE", "R2_ACCOUNT_ID", "R2_READ_KEY_ID", "R2_READ_SECRET", "SUPABASE_URL", "SUPABASE_ANON_KEY"];

/* --- CORS (worker/MEDIA.md, "CORS") -------------------------------------------------------------------------------------- */

const DOMAIN_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?floa\.co\.il$/;
const DEV_ORIGIN = "http://localhost:5173";
const EXPOSE = "content-length, content-range, accept-ranges, etag, content-type";
const OPEN = { "access-control-allow-origin": "*", "access-control-expose-headers": EXPOSE };
const PREFLIGHT = {
  ...OPEN,
  "access-control-allow-methods": "GET, HEAD, PUT, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "authorization, range, content-type, x-media-meta, x-media-index",
  "access-control-max-age": "86400",
  "x-robots-tag": "noindex",
};

/* a staff route: an absent origin (a script), the domain and localhost pass at once; any other origin must be one of the
   business's settings.origins, which needs the settings (checkOrigin) */
function staffCors(cx) {
  const o = cx.origin;
  cx.cors = { vary: "origin", "access-control-expose-headers": EXPOSE };
  if (o === null) return;
  if (DOMAIN_ORIGIN.test(o) || o === DEV_ORIGIN) cx.cors["access-control-allow-origin"] = o;
  else cx.originPending = true;
}
async function checkOrigin(cx) {
  if (!cx.originPending) return;
  const s = await readSettings(cx.env, cx.b);
  if (!s || !s.settings.origins.includes(cx.origin)) throw new MediaError("origin");
  cx.cors["access-control-allow-origin"] = cx.origin;
  cx.originPending = false;
}

/* --- answers -------------------------------------------------------------------------------------------------------------- */

function send(cx, status, body, extra = {}) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", ...cx.cors, ...extra };
  return new Response(cx.method === "HEAD" ? null : JSON.stringify(body), { status, headers });
}
function fail(cx, err) {
  const code = codeOf(err, "request");
  const extra = code === "rate_limited" ? { "retry-after": "1" } : {};
  return send(cx, STATUS[code], errorBody(code, err && err.field), { ...extra, "cache-control": "no-store" });
}

async function readJson(request, max = 8192) {
  if (Number(request.headers.get("content-length") || 0) > max) throw new MediaError("bad_request");
  let text;
  try { text = await request.text(); } catch { throw new MediaError("bad_request"); }
  if (text.length > max) throw new MediaError("bad_request");
  let v;
  try { v = JSON.parse(text); } catch { throw new MediaError("bad_request"); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new MediaError("bad_request");
  return v;
}

/* --- who and what ----------------------------------------------------------------------------------------------------------- */

async function gate(cx, request, level = "staff") {
  const token = bearer(request);
  if (!token) throw new MediaError("unauthorized");
  const who = await staffOf(cx.env, token, cx.b, cx.doFetch);
  if (!who.admin || (level === "owner" && !who.owner)) throw new MediaError("forbidden");
  cx.sub = who.sub;
  return who;
}
async function needSettings(cx, opts) {
  const s = await readSettings(cx.env, cx.b, opts);
  if (!s) throw new MediaError("not_found");   /* the business is off */
  cx.settings = s.settings;
  cx.etag = s.etag;
  return s.settings;
}

/* --- the door --------------------------------------------------------------------------------------------------------------- */

export async function handleMedia(request, env, ctx, doFetch = fetch) {
  const url = new URL(request.url);
  const cx = { env, ctx, doFetch, method: request.method, origin: request.headers.get("origin"), cors: {} };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: PREFLIGHT });

  const missing = REQUIRED.filter((k) => !env[k]);
  if (missing.length) {
    console.error("media not_configured: missing " + missing.join(", "));
    return fail(cx, new MediaError("not_configured"));
  }
  try {
    return await route(cx, request, url);
  } catch (err) {
    return fail(cx, err);
  }
}

const CONTROL = {
  _admin: { GET: admin },
  _delete: { POST: (cx, r) => batch(cx, r, "delete") },
  _restore: { POST: (cx, r) => batch(cx, r, "restore") },
  _purge: { POST: (cx, r) => batch(cx, r, "purge") },
  _reindex: { POST: reindex },
  _usage: { GET: usage },
  _check: { GET: check },
  _settings: { PUT: putSettings },
  _visibility: { POST: visibilityMove },
};

async function route(cx, request, url) {
  const m = request.method;
  const tail = url.pathname.slice(MEDIA_PREFIX.length);
  const cut = tail.indexOf("/");
  const b = cut > 0 ? tail.slice(0, cut) : "", rest = cut > 0 ? tail.slice(cut + 1) : "";
  const helper = (m === "GET" || m === "HEAD") && rest !== "" && rest[0] !== "_";
  if (helper || rest === "_admin") cx.cors = { ...OPEN }; else staffCors(cx);
  if (!SLUG.test(b)) throw new MediaError("not_found");
  cx.b = b;

  if (rest === "") {
    if (m !== "GET") throw new MediaError("method_not_allowed");
    return list(cx, request, url);
  }
  if (rest[0] === "_") {
    const r = CONTROL[rest];
    if (!r) throw new MediaError("not_found");
    if (!r[m]) throw new MediaError("method_not_allowed");
    return r[m](cx, request);
  }
  if (rest[0] === ".") throw new MediaError("not_found");

  if (rest.endsWith("/")) {   /* a folder: upload named by the sha256 */
    if (m !== "POST") throw new MediaError("method_not_allowed");
    return put(cx, request, rest, false);
  }
  const trash = rest.startsWith("trash/");
  if (m === "GET" || m === "HEAD") return redirect(cx, rest);
  if (m === "PUT") return put(cx, request, rest, true);   /* trash/… is refused by the key rules */
  if (m === "DELETE") return trash ? purgeSingle(cx, request, rest) : deleteSingle(cx, request, rest);
  throw new MediaError("method_not_allowed");
}

/* GET /media/<b>/_admin: { admin, owner, public_folders }. Without a token, no fetch at all. */
async function admin(cx, request) {
  const token = bearer(request);
  let admin = false, owner = false;
  if (token) ({ admin, owner } = await staffOf(cx.env, token, cx.b, cx.doFetch));
  const s = await needSettings(cx);
  return send(cx, 200, { admin, owner, public_folders: s.public_folders }, { "cache-control": "private, no-store" });
}

/* GET /media/<b>/?prefix=<p>&cursor=<c>&limit=<n> */
async function list(cx, request, url) {
  const sp = url.searchParams;
  const prefix = sp.get("prefix");
  if (!prefix) throw new MediaError("validation", "prefix");
  const q = { prefix, ...parsePrefix(prefix), cursor: sp.get("cursor") || null, limit: null };
  if (q.cursor !== null && !/^(pub|prv):[\x21-\x7e]{0,2048}$/.test(q.cursor)) throw new MediaError("bad_request");
  const l = sp.get("limit");
  if (l !== null && l !== "") {
    if (!/^\d{1,6}$/.test(l) || Number(l) < 1) throw new MediaError("bad_request");
    q.limit = Number(l);
  }
  await checkOrigin(cx);
  const token = bearer(request);
  const who = token ? await staffOf(cx.env, token, cx.b, cx.doFetch) : null;
  const s = await readSettings(cx.env, cx.b);
  if (!s) throw new MediaError(who && who.admin ? "not_found" : "forbidden");   /* a stranger never learns if it exists */
  cx.settings = s.settings;
  return send(cx, 200, await listPage(cx, q, !!(who && who.admin)), { "cache-control": "private, no-store" });
}

/* PUT <key> (named) or POST <folder>/ (named by the sha256) */
async function put(cx, request, rest, named) {
  /* 1. local checks, before any network call */
  const type = contentTypeOf(request.headers.get("content-type"));
  let k = null, folder = null;
  if (named) {
    k = parseKey(rest);
    if (!type || type !== k.type) throw new MediaError("unsupported_type");
  } else {
    folder = rest.slice(0, -1);
    const f = folderOf(folder.split("/"));
    if (!f) throw new MediaError("validation", "folder");
    if (f.data) throw new MediaError("method_not_allowed");   /* a data file is always PUT by its name */
    if (!type || TYPES[type].data) throw new MediaError("unsupported_type");
  }
  const lenHeader = request.headers.get("content-length");
  if (!lenHeader || !/^\d{1,12}$/.test(lenHeader) || Number(lenHeader) < 1) throw new MediaError("length_required");
  const size = Number(lenHeader);
  const data = !!(k && k.data);
  if (size > (data ? MAX_DATA_BYTES : MAX_FILE_BYTES)) throw new MediaError("too_large");
  const meta = parseMeta(request.headers.get("x-media-meta"), { optional: data });
  if (!named) k = parseKey(`${folder}/${hashName(meta.sha256, type)}`, type);
  const ix = (request.headers.get("x-media-index") || "").trim().toLowerCase();
  if (ix && ix !== "defer") throw new MediaError("bad_request");

  /* 2. who, then the settings */
  await checkOrigin(cx);
  await gate(cx, request);
  const settings = await needSettings(cx);
  if (size > settings.max_file_bytes) throw new MediaError("too_large");

  const r = await upload(cx, { k, type, size, meta, body: request.body, defer: ix === "defer" });
  return send(cx, r.status, r.body);
}

/* DELETE <key>: to the trash */
async function deleteSingle(cx, request, rest) {
  parseExisting(rest);
  await checkOrigin(cx);
  await gate(cx, request);
  await needSettings(cx);
  const r = await trashOne(cx, rest);
  const s = await settle(cx, [r], { purgeFiles: true });
  return send(cx, 200, { ok: true, trash: `trash/${r.key}`, ...(s.rewrote ? { index: s.index } : {}) });
}

/* DELETE trash/<key>: purge */
async function purgeSingle(cx, request, rest) {
  parseExisting(originalOf(rest));
  await checkOrigin(cx);
  await gate(cx, request);
  await needSettings(cx);
  const r = await purgeOne(cx, rest);
  return send(cx, 200, { ok: true, purged: `trash/${r.key}` });
}

/* POST _delete / _restore / _purge {"keys":[…up to 8]}: { ok, done, failed[, index] }. ok:false only when the call itself
   was refused before any key was touched; every key that fails on its own is in `failed`, with its code. */
async function batch(cx, request, kind) {
  const body = await readJson(request);
  const keys = body.keys;
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > BATCH_MAX || !keys.every((k) => typeof k === "string")) {
    throw new MediaError("bad_request");
  }
  await checkOrigin(cx);
  await gate(cx, request);
  await needSettings(cx);

  const name = kind === "delete" ? (k) => k : originalOf;
  const seen = new Set(), todo = [];
  for (const k of keys) if (!seen.has(name(k))) { seen.add(name(k)); todo.push(k); }
  const one = kind === "delete" ? trashOne : kind === "restore" ? restoreOne : purgeOne;
  const done = [], failed = [], results = [];
  for (const k of todo) {
    try {
      const r = await one(cx, k);
      done.push(r.key);
      results.push(r);
    } catch (err) {
      failed.push({ key: name(k), code: codeOf(err, kind) });
    }
  }
  if (kind === "purge") return send(cx, 200, { ok: true, done, failed });
  const s = await settle(cx, results, { purgeFiles: true });
  return send(cx, 200, { ok: true, done, failed, index: s.index });
}

/* POST _reindex {"folder":"<top>"} */
async function reindex(cx, request) {
  const body = await readJson(request);
  await checkOrigin(cx);
  await gate(cx, request);
  const settings = await needSettings(cx);
  const folder = body.folder;
  if (typeof folder !== "string" || !SEG.test(folder) || visibility(settings, folder) === "private") {
    throw new MediaError("validation", "folder");
  }
  const index = await rewriteIndex(cx.env, cx.b, folder);
  await purgeUrls(cx.env, [publicUrl(cx.env, cx.b, `_index/${folder}.json`)], cx.doFetch);
  return send(cx, 200, { ok: true, folder, index });
}

/* GET _usage */
async function usage(cx, request) {
  await checkOrigin(cx);
  await gate(cx, request);
  const s = await needSettings(cx);
  const u = await usageOf(cx.env, cx.b);
  return send(cx, 200, {
    ok: true, bytes: u.bytes, items: u.items, trash: u.trash,
    quota_bytes: s.quota_bytes, max_items: s.max_items, max_file_bytes: s.max_file_bytes,
    ...(u.partial ? { partial: true } : {}),
  });
}

/* GET _check */
async function check(cx, request) {
  await checkOrigin(cx);
  await gate(cx, request);
  await needSettings(cx);
  return send(cx, 200, await checkReport(cx));
}

/* PUT _settings (owner): create or change; public_folders only on create. Writes _index/_folders.json too. */
async function putSettings(cx, request) {
  const body = await readJson(request);
  await checkOrigin(cx);
  await gate(cx, request, "owner");
  const cur = await readSettings(cx.env, cx.b, { fresh: true });
  const next = mergeSettings(body, cur && cur.settings);
  await writeSettings(cx.env, cx.b, next, cur && cur.etag);
  const folders = await publishFolders(cx, next);
  return send(cx, 200, { ok: true, settings: next, folders });
}

/* POST _visibility {"folder","public"} (owner): one batch of the move */
async function visibilityMove(cx, request) {
  const body = await readJson(request);
  if (typeof body.folder !== "string" || !SEG.test(body.folder) || body.folder === "trash") throw new MediaError("validation", "folder");
  if (typeof body.public !== "boolean") throw new MediaError("validation", "public");
  await checkOrigin(cx);
  await gate(cx, request, "owner");
  await needSettings(cx, { fresh: true });
  const r = await moveBatch(cx, body.folder, body.public);
  return send(cx, 200, r, r.retry_after ? { "retry-after": String(r.retry_after) } : {});
}

/* GET/HEAD <key>: a public key is a 301 to the CDN (old links only: the page never uses it). A private or trashed key is
   404: there is no single-key renew, a client lists the prefix again. */
async function redirect(cx, rest) {
  let k;
  try { k = parseKey(rest); } catch { throw new MediaError("not_found"); }
  const settings = await needSettings(cx);
  if (visibility(settings, k.top) !== "public") throw new MediaError("not_found");
  return new Response(null, {
    status: 301,
    headers: { location: publicUrl(cx.env, cx.b, k.key), "cache-control": "public, max-age=300", "x-robots-tag": "noindex", ...cx.cors },
  });
}
