/* The media store's work on the two buckets (worker/MEDIA.md, "Uploads", "Data files", "Lists", "Delete: trash, restore,
   purge", "Changing a folder's visibility").

   Every step can safely be repeated: a half-finished delete, restore or move is finished by calling it again. A function
   here either returns its answer or throws a MediaError; the door (src/media.js) turns that into the response.

   `cx` is { env, b, settings, etag, sub, doFetch }: the business, its settings as read, and the caller's user id. */

import { MediaError } from "./http.js";
import {
  MAX_ITEMS_CAP, PUBLIC_CACHE, SHA, SHORT_CACHE, cacheFor, customMetadataOf, isDataKey, isoNow, itemOf, parseKey,
  relOf, rememberSettings, sameBytes, settingsKey,
} from "./keys.js";
import {
  foldersKey, indexKey, listAll, noOverwrite, pause, publicUrl, purgeUrls, rewriteIndex, writeFolders, INCLUDE,
} from "./index-file.js";
import { presignPrivate, windowOf } from "./presign.js";

export const BATCH_MAX = 8;
export const MOVE_BATCH = 10;
export const MOVE_SETTLE_MS = 65 * 1000;   /* longer than the 60 s every isolate may keep the settings */
const TOMBSTONE_MS = 48 * 60 * 60 * 1000;
const LIST_MAX_PRIVATE = 200, LIST_MAX_PUBLIC = 1000;

/* "public" | "private" | "moving" for a top folder */
export function visibility(settings, top) {
  if (settings.moving && settings.moving.folder === top) return "moving";
  return settings.public_folders.includes(top) ? "public" : "private";
}

const urlOf = (env, b, rel, pub) => (pub ? publicUrl(env, b, rel) : presignPrivate(env, `${b}/${rel}`));
const shaOf = (o) => (o && o.customMetadata && SHA.test(o.customMetadata.sha256 || "") ? o.customMetadata.sha256 : "");
const isChecksum = (err) => /checksum|did not match/i.test(String(err && err.message));
const isRate = (err) => /10058|rate limit|too many|concurren/i.test(String(err && err.message));

/* a put whose failure becomes the right code: checksum_mismatch, rate_limited or upstream */
async function putChecked(bucket, key, value, opts) {
  try { return await bucket.put(key, value, opts); } catch (err) {
    if (isChecksum(err)) throw new MediaError("checksum_mismatch");
    if (isRate(err)) throw new MediaError("rate_limited");
    console.error("media upstream r2 put", err && err.name);
    throw new MediaError("upstream");
  }
}

/* a delete, retried once; false (and a media_orphan log line) when both failed */
async function deleteRetried(bucket, key) {
  for (let i = 0; i < 2; i++) {
    try { await bucket.delete(key); return true; } catch { /* once more */ }
  }
  console.error("media_orphan", key);
  return false;
}

/* a key named by a call that does not upload: a name that could never have been stored is simply not found */
export function parseExisting(rel) {
  try { return parseKey(rel); } catch (err) {
    if (err instanceof MediaError && err.code === "unsupported_type") throw new MediaError("not_found");
    throw err;
  }
}
/* restore and purge take the original key, and accept it with its trash/ prefix too */
export const originalOf = (k) => (typeof k === "string" && k.startsWith("trash/") ? k.slice(6) : k);

/* --- quota --------------------------------------------------------------------------------------------------------------- */

/* bytes and objects of the business in both buckets, trash included, the store's own objects not. Stops early past `cap`. */
export async function usageOf(env, b, cap = Infinity) {
  const out = { bytes: 0, items: 0, trash: { bytes: 0, items: 0 }, partial: false };
  for (const bucket of [env.MEDIA_PUBLIC, env.MEDIA]) {
    let cursor;
    for (let page = 0; ; page++) {
      if (page >= 15 || out.items > cap) { out.partial = true; break; }
      const r = await bucket.list({ prefix: `${b}/`, cursor, limit: 1000 });
      for (const o of r.objects) {
        const rel = relOf(b, o.key);
        if (!rel) continue;
        out.bytes += o.size; out.items++;
        if (rel.startsWith("trash/")) { out.trash.bytes += o.size; out.trash.items++; }
      }
      if (!r.truncated) break;
      cursor = r.cursor;
    }
  }
  return out;
}

async function checkQuota(cx, size) {
  const { settings } = cx;
  const u = await usageOf(cx.env, cx.b, Math.min(settings.max_items, MAX_ITEMS_CAP));
  if (u.items + 1 > settings.max_items || u.bytes + size > settings.quota_bytes) throw new MediaError("quota_exceeded");
}

/* --- upload --------------------------------------------------------------------------------------------------------------- */

/* PUT <key> or POST <folder>/: k is the parsed key, the local checks are done, the caller is staff */
export async function upload(cx, { k, type, size, meta, body, defer }) {
  const { env, b, settings } = cx;
  const vis = visibility(settings, k.top);
  if (vis === "moving") throw new MediaError("folder_moving");
  const pub = vis === "public";
  if (k.data) return uploadData(cx, { k, size, meta, body, pub });

  const bucket = pub ? env.MEDIA_PUBLIC : env.MEDIA;
  const full = `${b}/${k.key}`;
  const existing = async (obj) => ({ status: 200, body: { ok: true, key: k.key, url: await urlOf(env, b, k.key, pub), size: obj.size, existing: true } });

  const live = await bucket.head(full);
  if (live) {
    if (shaOf(live) === meta.sha256) return existing(live);
    throw new MediaError("name_taken");
  }
  const trashed = await env.MEDIA.head(`${b}/trash/${k.key}`);
  if (trashed) throw new MediaError(shaOf(trashed) === meta.sha256 ? "in_trash" : "name_taken");
  const goneKey = `${b}/.gone/${k.key}`;
  const gone = await env.MEDIA.head(goneKey);
  if (gone) {
    const at = Date.parse((gone.customMetadata && gone.customMetadata.at) || "")
      || (gone.uploaded instanceof Date ? gone.uploaded.getTime() : Date.now());
    if (Date.now() - at < TOMBSTONE_MS) {
      if (shaOf(gone) !== meta.sha256) throw new MediaError("name_recently_used");
    } else {
      try { await env.MEDIA.delete(goneKey); } catch { /* checked again next time */ }
    }
  }
  await checkQuota(cx, size);

  const put = await putChecked(bucket, full, body, {
    httpMetadata: { contentType: type, ...(pub ? { cacheControl: PUBLIC_CACHE } : {}) },
    customMetadata: customMetadataOf(meta, { up: isoNow(), by: cx.sub }),
    sha256: meta.sha256,
    onlyIf: noOverwrite(),
  });
  if (!put) {   /* another upload of this name won the race */
    const now = await bucket.head(full);
    if (now && shaOf(now) === meta.sha256) return existing(now);
    throw new MediaError("name_taken");
  }
  const out = { ok: true, key: k.key, url: await urlOf(env, b, k.key, pub), size: put.size };
  if (pub && !defer) {
    out.index = await rewriteIndex(env, b, k.top);
    await purgeUrls(env, [publicUrl(env, b, `_index/${k.top}.json`), out.url], cx.doFetch);   /* the file too: a cached 404 */
  }
  return { status: 201, body: out };
}

/* a data file (<top>/_data/<name>.json), under a public or a private top folder: always overwrites. The live version first
   goes to trash/<key> with all its metadata, replacing any older one there. The JSON is never parsed; the body (at most
   1 MiB) is held so a write that R2 refuses for the one-write-per-second rule can be tried again. */
async function uploadData(cx, { k, size, meta, body, pub }) {
  const { env, b } = cx;
  const bucket = pub ? env.MEDIA_PUBLIC : env.MEDIA;
  await checkQuota(cx, size);
  const bytes = await new Response(body).arrayBuffer();
  const full = `${b}/${k.key}`;
  let replaced = false;
  const old = await bucket.get(full);
  if (old) {
    const sha = shaOf(old);
    await putChecked(env.MEDIA, `${b}/trash/${k.key}`, old.body, {
      httpMetadata: { ...(old.httpMetadata || {}) },
      customMetadata: { ...(old.customMetadata || {}), trashed: isoNow() },
      ...(sha ? { sha256: sha } : {}),
    });
    replaced = true;
  }
  const opts = {
    httpMetadata: { contentType: "application/json", ...(pub ? { cacheControl: SHORT_CACHE } : {}) },
    customMetadata: customMetadataOf(meta, { up: isoNow(), by: cx.sub }),
    ...(meta.sha256 ? { sha256: meta.sha256 } : {}),
  };
  let put;
  for (let i = 0; ; i++) {
    try { put = await bucket.put(full, bytes, opts); break; } catch (err) {
      if (isChecksum(err)) throw new MediaError("checksum_mismatch");
      if (i >= 2) {
        if (isRate(err)) throw new MediaError("rate_limited");
        console.error("media upstream r2 put", err && err.name);
        throw new MediaError("upstream");
      }
      await pause(i);
    }
  }
  const url = await urlOf(env, b, k.key, pub);
  if (pub) await purgeUrls(env, [url], cx.doFetch);   /* a private one is never on the CDN */
  return { status: 201, body: { ok: true, key: k.key, url, size: put.size, replaced } };
}

/* --- delete, restore, purge ------------------------------------------------------------------------------------------------ */

/* one key to the trash: { key, pub, top, data, moved } */
export async function trashOne(cx, rel) {
  const { env, b, settings } = cx;
  const k = parseExisting(rel);
  const vis = visibility(settings, k.top);
  if (vis === "moving") throw new MediaError("folder_moving");
  const pub = vis === "public";
  const src = pub ? env.MEDIA_PUBLIC : env.MEDIA;
  const full = `${b}/${k.key}`, tfull = `${b}/trash/${k.key}`;
  const done = (moved) => ({ key: k.key, pub, top: k.top, data: k.data, moved });

  const t = await env.MEDIA.head(tfull);
  if (t) {
    const s = await src.head(full);
    if (!s) return done(false);                                   /* already in the trash */
    if (sameBytes(s, t)) {                                        /* a half move: only the source is left */
      if (!(await deleteRetried(src, full))) throw new MediaError("upstream");
      return done(true);
    }
    if (!k.data) throw new MediaError("conflict");
    /* a data file's trash holds one previous version, which this one replaces */
  }
  const obj = await src.get(full);
  if (!obj) throw new MediaError("not_found");
  const sha = shaOf(obj);
  await putChecked(env.MEDIA, tfull, obj.body, {
    httpMetadata: { ...(obj.httpMetadata || {}) },
    customMetadata: { ...(obj.customMetadata || {}), trashed: isoNow() },
    ...(sha ? { sha256: sha } : {}),
  });
  if (!(await deleteRetried(src, full))) throw new MediaError("upstream");
  return done(true);
}

/* one key back from the trash, to the same key, in the bucket of the folder's current visibility: { key, pub, top, data } */
export async function restoreOne(cx, given) {
  const { env, b, settings } = cx;
  const k = parseExisting(originalOf(given));
  const vis = visibility(settings, k.top);
  if (vis === "moving") throw new MediaError("folder_moving");
  const pub = vis === "public";
  const dst = pub ? env.MEDIA_PUBLIC : env.MEDIA;
  const full = `${b}/${k.key}`, tfull = `${b}/trash/${k.key}`;
  const done = { key: k.key, pub, top: k.top, data: k.data };

  const live = await dst.head(full);
  if (live) {
    if (k.data) throw new MediaError("name_taken");               /* a newer version is live: roll back by PUTting it again */
    const t = await env.MEDIA.head(tfull);
    if (!t) return done;                                          /* already restored */
    if (!sameBytes(live, t)) throw new MediaError("name_taken");
    if (!(await deleteRetried(env.MEDIA, tfull))) throw new MediaError("upstream");
    return done;
  }
  const obj = await env.MEDIA.get(tfull);
  if (!obj) throw new MediaError("not_found");
  const { trashed: _t, ...customMetadata } = obj.customMetadata || {};
  const httpMetadata = { ...(obj.httpMetadata || {}) };
  if (pub) httpMetadata.cacheControl = cacheFor(k.key); else delete httpMetadata.cacheControl;
  const sha = shaOf(obj);
  const put = await putChecked(dst, full, obj.body, { httpMetadata, customMetadata, ...(sha ? { sha256: sha } : {}), onlyIf: noOverwrite() });
  if (!put) throw new MediaError("name_taken");                   /* uploaded meanwhile */
  if (!(await deleteRetried(env.MEDIA, tfull))) throw new MediaError("upstream");
  return done;
}

/* one key's trash copy deleted for good, with a tombstone: { key } */
export async function purgeOne(cx, given) {
  const { env, b } = cx;
  const k = parseExisting(originalOf(given));
  const tfull = `${b}/trash/${k.key}`;
  const t = await env.MEDIA.head(tfull);
  if (!t) throw new MediaError("not_found");
  await putChecked(env.MEDIA, `${b}/.gone/${k.key}`, "", { customMetadata: { sha256: shaOf(t), at: isoNow() } });
  if (!(await deleteRetried(env.MEDIA, tfull))) throw new MediaError("upstream");
  return { key: k.key };
}

/* after deletes or restores: rewrite the touched public indexes once each, and purge in one call */
export async function settle(cx, results, { purgeFiles }) {
  const { env, b } = cx;
  const tops = [...new Set(results.filter((r) => r.pub && !r.data).map((r) => r.top))];
  let index = "ok";
  const urls = [];
  for (const top of tops) {
    if ((await rewriteIndex(env, b, top)) !== "ok") index = "stale";
    urls.push(publicUrl(env, b, `_index/${top}.json`));
  }
  if (purgeFiles) for (const r of results) if (r.pub) urls.push(publicUrl(env, b, r.key));
  await purgeUrls(env, urls, cx.doFetch);
  return { index, rewrote: tops.length > 0 };
}

/* --- lists ---------------------------------------------------------------------------------------------------------------- */

/* GET /media/<b>/?prefix=…: q = { prefix, trash, top, data, cursor, limit }, staff = the caller is staff */
export async function listPage(cx, q, staff) {
  const { env, b, settings } = cx;
  let order, max;   /* the buckets to read, in order, by tag */
  if (q.trash) { order = ["prv"]; max = LIST_MAX_PRIVATE; }
  else {
    const vis = visibility(settings, q.top);
    if (vis === "public") { order = ["pub"]; max = LIST_MAX_PUBLIC; }
    else if (vis === "private") { order = ["prv"]; max = LIST_MAX_PRIVATE; }
    else { order = settings.moving.public ? ["prv", "pub"] : ["pub", "prv"]; max = LIST_MAX_PRIVATE; }
  }
  /* a public folder's list is open to anyone; a data folder's never is (anonymous readers fetch public data by name) */
  const needsStaff = q.data || !(order.length === 1 && order[0] === "pub");
  if (needsStaff && !staff) throw new MediaError("forbidden");
  const limit = Math.min(q.limit || LIST_MAX_PRIVATE, max);

  let tag = order[0], r2cursor;
  if (q.cursor) {
    const i = q.cursor.indexOf(":");
    tag = q.cursor.slice(0, i); r2cursor = q.cursor.slice(i + 1) || undefined;
    if (!order.includes(tag)) return { items: [], cursor: null, expires: windowOf().expires };   /* the folder moved meanwhile */
  }
  const bucket = tag === "pub" ? env.MEDIA_PUBLIC : env.MEDIA;
  const r = await bucket.list({ prefix: `${b}/${q.prefix}`, include: INCLUDE, cursor: r2cursor, limit });
  const now = Date.now();
  const items = [];
  for (const o of r.objects) {
    const rel = relOf(b, o.key);
    if (!rel || (!q.data && isDataKey(rel))) continue;   /* data files only under a prefix that is their own folder */
    items.push(itemOf(o, rel, tag === "pub" ? publicUrl(env, b, rel) : await presignPrivate(env, o.key, now)));
  }
  let cursor = null;
  if (r.truncated) cursor = `${tag}:${r.cursor}`;
  else if (order.indexOf(tag) < order.length - 1) cursor = `${order[order.indexOf(tag) + 1]}:`;
  return { items, cursor, expires: windowOf(now).expires };
}

/* --- settings -------------------------------------------------------------------------------------------------------------- */

/* write .settings.json over the etag it was read with (none: it must not exist yet); throws conflict when it changed */
export async function writeSettings(env, b, next, etag) {
  const put = await env.MEDIA.put(settingsKey(b), JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
    onlyIf: etag ? { etagMatches: etag } : noOverwrite(),
  });
  if (!put) throw new MediaError("conflict");
  rememberSettings(b, { settings: next, etag: put.etag });
}

/* every settings write is followed by this: the public _folders.json, and its purge */
export async function publishFolders(cx, settings) {
  const folders = await writeFolders(cx.env, cx.b, settings);
  await purgeUrls(cx.env, [publicUrl(cx.env, cx.b, foldersKey(cx.b).slice(cx.b.length + 1))], cx.doFetch);
  return folders;
}

/* --- the visibility move (owner) --------------------------------------------------------------------------------------------- */

export async function moveBatch(cx, folder, pub) {
  const { env, b, settings, etag } = cx;
  const answer = (o) => ({ ok: true, folder, public: pub, ...o });
  const mv = settings.moving;
  if (mv && (mv.folder !== folder || mv.public !== pub)) throw new MediaError("folder_moving");
  const src = pub ? env.MEDIA : env.MEDIA_PUBLIC, dst = pub ? env.MEDIA_PUBLIC : env.MEDIA;
  const prefix = `${b}/${folder}/`;

  if (!mv) {
    if (settings.public_folders.includes(folder) === pub) return answer({ moved: 0, remaining: 0, done: true });
    /* the first call only marks the folder: from now on it takes no uploads, deletes or restores */
    const next = { ...settings, moving: { folder, public: pub, since: isoNow() } };
    await writeSettings(env, b, next, etag);
    const first = await src.list({ prefix, limit: 1000 });
    return answer({ moved: 0, remaining: first.objects.length, done: false });
  }

  const listing = await src.list({ prefix, limit: 1000 });
  const batch = listing.objects.slice(0, MOVE_BATCH);
  let moved = 0, stop = null;
  const purge = [];
  for (const o of batch) {
    const rel = relOf(b, o.key);
    const obj = rel ? await src.get(o.key) : null;
    if (!obj) continue;
    const there = await dst.head(o.key);
    if (there) {
      try { await obj.body.cancel(); } catch { /* nothing to read */ }
      if (!sameBytes(there, obj)) { stop = "conflict"; break; }
    } else {
      const httpMetadata = { ...(obj.httpMetadata || {}) };
      if (pub) httpMetadata.cacheControl = cacheFor(rel); else delete httpMetadata.cacheControl;
      const sha = shaOf(obj);
      try {
        await putChecked(dst, o.key, obj.body, { httpMetadata, customMetadata: { ...(obj.customMetadata || {}) }, ...(sha ? { sha256: sha } : {}) });
      } catch (err) { stop = err instanceof MediaError ? err.code : "upstream"; break; }
    }
    if (!(await deleteRetried(src, o.key))) { stop = "upstream"; break; }
    moved++;
    if (!pub) purge.push(publicUrl(env, b, rel));
  }
  /* one index attempt per batch: the budget is 50 subrequests, and the next batch rewrites it again */
  const index = await rewriteIndex(env, b, folder, { attempts: 1 });
  purge.push(publicUrl(env, b, `_index/${folder}.json`));

  const remaining = listing.objects.length - moved;
  let done = false, retryAfter = 0, folders;
  if (!stop && remaining === 0 && !listing.truncated) {
    const waited = Date.now() - Date.parse(settings.moving.since || "");
    if (waited >= MOVE_SETTLE_MS) {
      const public_folders = pub
        ? [...new Set([...settings.public_folders, folder])]
        : settings.public_folders.filter((f) => f !== folder);
      const next = { ...settings, public_folders, moving: null };
      await writeSettings(env, b, next, etag);
      folders = await writeFolders(env, b, next);
      purge.push(publicUrl(env, b, foldersKey(b).slice(b.length + 1)));
      done = true;
    } else retryAfter = Math.ceil((MOVE_SETTLE_MS - waited) / 1000);
  }
  await purgeUrls(env, purge, cx.doFetch);
  if (stop) throw new MediaError(stop);
  return answer({ moved, remaining, done, index, ...(folders ? { folders } : {}), ...(retryAfter ? { retry_after: retryAfter } : {}) });
}

/* --- _check (read-only drift report) ----------------------------------------------------------------------------------------- */

export async function checkReport(cx) {
  const { env, b, settings } = cx;
  const pubL = await listAll(env.MEDIA_PUBLIC, `${b}/`, { include: true, maxPages: 15 });
  const prvL = await listAll(env.MEDIA, `${b}/`, { include: true, maxPages: 15 });
  const moving = settings.moving ? settings.moving.folder : null;
  const live = new Map(), trash = new Map();
  const wrong_bucket = [], both_buckets = [];
  for (const o of pubL.objects) {
    const rel = relOf(b, o.key);
    if (!rel) continue;
    const top = rel.split("/")[0];
    if (top !== moving && !settings.public_folders.includes(top)) wrong_bucket.push(rel);
    live.set(rel, o);
  }
  for (const o of prvL.objects) {
    const rel = relOf(b, o.key);
    if (!rel) continue;
    if (rel.startsWith("trash/")) { trash.set(rel.slice(6), o); continue; }
    const top = rel.split("/")[0];
    if (top !== moving && settings.public_folders.includes(top)) wrong_bucket.push(rel);
    if (live.has(rel)) both_buckets.push(rel);
    live.set(rel, o);
  }
  const half = [];
  for (const [rel, t] of trash) {
    const l = live.get(rel);
    if (l && !isDataKey(rel)) half.push({ key: rel, state: sameBytes(l, t) ? "half_delete" : "conflict" });
  }
  const indexes = [];
  for (const top of settings.public_folders) {
    const want = new Map();
    for (const o of pubL.objects) {
      const rel = relOf(b, o.key);
      if (rel && rel.startsWith(top + "/") && !isDataKey(rel)) want.set(rel, shaOf(o));
    }
    let stale = true, reason = "missing";
    const obj = await env.MEDIA_PUBLIC.get(indexKey(b, top));
    if (obj) {
      try {
        const got = JSON.parse(await obj.text()).items || [];
        stale = got.length !== want.size || got.some((it) => !want.has(it.key) || (want.get(it.key) || "") !== (it.sha256 || ""));
        reason = stale ? "differs" : null;
      } catch { reason = "unreadable"; }
    }
    indexes.push({ folder: top, stale, ...(reason ? { reason } : {}) });
  }
  let folders = "missing";
  const f = await env.MEDIA_PUBLIC.get(foldersKey(b));
  if (f) {
    try {
      const got = JSON.parse(await f.text()).public_folders || [];
      folders = [...got].sort().join("/") === [...settings.public_folders].sort().join("/") ? "ok" : "stale";
    } catch { folders = "stale"; }
  }
  const cap = (a) => a.slice(0, 100);
  return {
    ok: true,
    moving: settings.moving,
    wrong_bucket: cap(wrong_bucket),
    both_buckets: cap(both_buckets),
    half: cap(half),
    indexes,
    folders,
    partial: pubL.truncated || prvL.truncated,
  };
}
