/* The public index files and the CDN purge (worker/MEDIA.md, "The public index", "Caching and deletes").

   <b>/_index/<top>.json is the list of a public top folder, as a static file on the CDN, so a gallery visit costs no Worker
   request. It is never edited in place: the Worker lists the folder and writes the whole file with
   onlyIf {etagMatches: <the etag read before the list>}, and a concurrent rewrite makes the put fail and the Worker read,
   list and write again (3 attempts). The last successful write therefore comes from a list taken after every earlier change.

   <b>/_index/_folders.json is {"public_folders":[…]}, written whenever the settings change, so a page knows which folders
   it can read from the CDN without asking the Worker (contract addition 2). A top folder cannot start with "_", so the
   two names never collide. */

import { SHORT_CACHE, isDataKey, itemOf, relOf } from "./keys.js";

export const INCLUDE = ["customMetadata", "httpMetadata"];

/* a put that must not replace anything. Unverified on the binding (worker/MEDIA.md, Uploads, step 7): if R2 refuses the
   wildcard, this is the one line to change. */
export function noOverwrite() { return new Headers({ "if-none-match": "*" }); }

export function publicUrl(env, b, rel) { return `${String(env.MEDIA_PUBLIC_BASE).replace(/\/+$/, "")}/${b}/${rel}`; }
export function indexKey(b, top) { return `${b}/_index/${top}.json`; }
export function foldersKey(b) { return `${b}/_index/_folders.json`; }

/* the short backoff between write attempts (R2 takes one write per second to a key) */
let backoff = [300, 1000];
export function _setBackoff(ms) { backoff = ms; }
export function pause(i) {
  const ms = backoff[i] || 0;
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

/* every object under a prefix, page by page; { objects, truncated } where truncated means maxPages ran out */
export async function listAll(bucket, prefix, { include = false, maxPages = 20 } = {}) {
  const objects = [];
  let cursor;
  for (let page = 0; page < maxPages; page++) {
    const r = await bucket.list({ prefix, cursor, limit: 1000, ...(include ? { include: INCLUDE } : {}) });
    objects.push(...r.objects);
    if (!r.truncated) return { objects, truncated: false };
    cursor = r.cursor;
  }
  return { objects, truncated: true };
}

/* rewrite one public top folder's index: "ok" or "stale" (never throws: the change it follows has already succeeded) */
export async function rewriteIndex(env, b, top, { attempts = 3 } = {}) {
  const key = indexKey(b, top);
  for (let i = 0; i < attempts; i++) {
    try {
      const cur = await env.MEDIA_PUBLIC.head(key);
      const { objects, truncated } = await listAll(env.MEDIA_PUBLIC, `${b}/${top}/`, { include: true, maxPages: 30 });
      if (truncated) break;   /* a partial index is a wrong one: leave it stale for _check and _reindex */
      const items = [];
      for (const o of objects) {
        const rel = relOf(b, o.key);
        if (rel && !isDataKey(rel)) items.push(itemOf(o, rel, publicUrl(env, b, rel)));   /* data files are read by their own URL */
      }
      const body = JSON.stringify({ items, cursor: null, generated: new Date().toISOString().replace(/\.\d{3}Z$/, "Z") });
      const put = await env.MEDIA_PUBLIC.put(key, body, {
        httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: SHORT_CACHE },
        onlyIf: cur ? { etagMatches: cur.etag } : noOverwrite(),
      });
      if (put) return "ok";
    } catch (err) {
      console.error("media index attempt failed", err && err.name);
    }
    if (i < attempts - 1) await pause(i);
  }
  console.error("media index stale", b, top);
  return "stale";
}

/* <b>/_index/_folders.json from the settings just written: "ok" or "stale" */
export async function writeFolders(env, b, settings) {
  try {
    await env.MEDIA_PUBLIC.put(foldersKey(b), JSON.stringify({ public_folders: settings.public_folders }), {
      httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: SHORT_CACHE },
    });
    return "ok";
  } catch (err) {
    console.error("media folders file stale", b, err && err.name);
    return "stale";
  }
}

/* drop URLs from the CDN, in one request, when CF_PURGE_TOKEN is set (and CF_ZONE_ID with it). Never throws. */
export async function purgeUrls(env, urls, doFetch) {
  const files = [...new Set(urls)].filter(Boolean);
  if (!env.CF_PURGE_TOKEN || !files.length) return "off";
  if (!env.CF_ZONE_ID) {
    console.error("media purge skipped: CF_ZONE_ID is not set");
    return "off";
  }
  try {
    for (let i = 0; i < files.length; i += 100) {
      const res = await doFetch(`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.CF_PURGE_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ files: files.slice(i, i + 100) }),
      });
      if (!res.ok) { console.error("media purge failed", res.status); return "failed"; }
    }
    return "ok";
  } catch (err) {
    console.error("media purge failed", err && err.name);
    return "failed";
  }
}
