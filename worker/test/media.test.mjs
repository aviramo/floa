/* The media store (worker/MEDIA.md, "Tests"): one targeted check per rule, against two in-memory buckets and a mocked
   fetch (my_businesses and the purge API). Plain node: `node worker/test/media.test.mjs`. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { handleMedia, isMediaPath, _clearMediaCaches } from "../src/media.js";
import { presignGet, presignPrivate, windowOf } from "../src/media/presign.js";
import { _setBackoff } from "../src/media/index-file.js";
import { BUSINESSES } from "../src/businesses.js";

_setBackoff([0, 0]);

const B = "acme";   /* not a real business: the store must work for any slug */
const CDN = "https://media.floa.co.il";
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (bytes) => hex(await crypto.subtle.digest("SHA-256", bytes));
const bytesOf = (s) => enc.encode(s);

/* --- fakes ------------------------------------------------------------------------------------------------------------------ */

async function toBytes(v) {
  if (v === null || v === undefined || v === "") return new Uint8Array(0);
  if (typeof v === "string") return enc.encode(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  return new Uint8Array(await new Response(v).arrayBuffer());
}

class FakeBucket {
  constructor() { this.objects = new Map(); this.log = []; this.n = 0; this.onPut = null; }
  meta(key, o) {
    return { key, size: o.bytes.length, etag: o.etag, httpEtag: `"${o.etag}"`, uploaded: o.uploaded,
      httpMetadata: { ...o.httpMetadata }, customMetadata: { ...o.customMetadata } };
  }
  async head(key) { this.log.push(["head", key]); const o = this.objects.get(key); return o ? this.meta(key, o) : null; }
  async get(key) {
    this.log.push(["get", key]);
    const o = this.objects.get(key);
    if (!o) return null;
    const m = this.meta(key, o);
    m.body = new Response(o.bytes).body;
    m.text = async () => new TextDecoder().decode(o.bytes);
    return m;
  }
  async put(key, value, opts = {}) {
    this.log.push(["put", key, opts]);
    if (this.onPut) await this.onPut(key, opts);
    const bytes = await toBytes(value);
    const cur = this.objects.get(key), c = opts.onlyIf;
    if (c instanceof Headers) { if (c.get("if-none-match") === "*" && cur) return null; }
    else if (c && c.etagMatches !== undefined && (!cur || cur.etag !== c.etagMatches)) return null;
    if (opts.sha256 && (await sha256(bytes)) !== opts.sha256) throw new Error("put: The SHA-256 checksum you specified did not match what we received.");
    this.objects.set(key, { bytes, etag: "e" + ++this.n, uploaded: new Date(), httpMetadata: { ...(opts.httpMetadata || {}) }, customMetadata: { ...(opts.customMetadata || {}) } });
    return this.meta(key, this.objects.get(key));
  }
  async delete(keys) { this.log.push(["delete", keys]); for (const k of [].concat(keys)) this.objects.delete(k); }
  async list({ prefix = "", cursor, limit = 1000, include = [] } = {}) {
    this.log.push(["list", prefix, { cursor, limit, include }]);
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0, page = keys.slice(start, start + Math.min(limit, 1000));
    const objects = page.map((k) => {
      const m = this.meta(k, this.objects.get(k));
      if (!include.includes("customMetadata")) delete m.customMetadata;
      if (!include.includes("httpMetadata")) delete m.httpMetadata;
      return m;
    });
    const truncated = start + page.length < keys.length;
    return { objects, truncated, cursor: truncated ? String(start + page.length) : undefined, delimitedPrefixes: [] };
  }
  puts(key) { return this.log.filter((l) => l[0] === "put" && (!key || l[1] === key)); }
  json(key) { const o = this.objects.get(key); return o && JSON.parse(new TextDecoder().decode(o.bytes)); }
}

const ROWS = {
  staff: [{ id: "1", slug: B, name: "Acme", is_super: false }],
  owner: [{ id: "1", slug: B, name: "Acme", is_super: true }, { id: "2", slug: "other", name: "Other", is_super: true }],
  stranger: [{ id: "2", slug: "other", name: "Other", is_super: false }],
};

function makeEnv(extra = {}) {
  _clearMediaCaches();
  const fetchLog = [];
  const env = {
    MEDIA: new FakeBucket(), MEDIA_PUBLIC: new FakeBucket(), MEDIA_PUBLIC_BASE: CDN,
    R2_ACCOUNT_ID: "acc", R2_READ_KEY_ID: "kid", R2_READ_SECRET: "secret",
    SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon", ...extra,
  };
  env.fetchLog = fetchLog;
  env.fetch = async (url, init) => {
    fetchLog.push({ url, init });
    if (url.endsWith("/rest/v1/rpc/my_businesses")) {
      const rows = ROWS[init.headers.authorization.slice(7)];
      return rows ? Response.json(rows) : new Response('{"code":"PGRST301"}', { status: 401 });
    }
    if (url.includes("/purge_cache")) return Response.json({ success: true });
    throw new Error("unexpected fetch " + url);
  };
  return env;
}
const purges = (env) => env.fetchLog.filter((f) => f.url.includes("/purge_cache")).map((f) => JSON.parse(f.init.body).files);
const rpcs = (env) => env.fetchLog.filter((f) => f.url.includes("my_businesses")).length;

async function seed(env, settings = { public_folders: ["ads"], origins: ["https://shop.example"] }) {
  await env.MEDIA.put(`${B}/.settings.json`, JSON.stringify(settings));
  env.MEDIA.log = [];
}

async function call(env, method, path, { token = "staff", origin, headers = {}, body, host = "https://api.floa.co.il" } = {}) {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  if (origin) h.origin = origin;
  if (body !== undefined && typeof body !== "string" && !(body instanceof Uint8Array)) body = JSON.stringify(body);
  const res = await handleMedia(new Request(`${host}/media/${B}/${path}`, { method, headers: h, body }), env, {}, env.fetch);
  const text = res.status === 204 ? "" : await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
}

/* an upload as the script sends it */
async function upload(env, key, bytes, { type = "image/png", meta = {}, noMeta = false, method = "PUT", defer = false, ...rest } = {}) {
  const m = { sha256: await sha256(bytes), ...meta };
  const headers = { "content-type": type, "content-length": String(bytes.length) };
  if (!noMeta) headers["x-media-meta"] = encodeURIComponent(JSON.stringify(m));
  if (defer) headers["x-media-index"] = "defer";
  return call(env, method, key, { headers, body: bytes, ...rest });
}

/* an object put straight into a bucket, as an earlier upload would have left it */
async function place(bucket, key, text, cm = {}, hm = {}) {
  const bytes = bytesOf(text);
  await bucket.put(`${B}/${key}`, bytes, { customMetadata: { sha256: await sha256(bytes), up: "2026-11-01T00:00:00Z", ...cm }, httpMetadata: { contentType: "image/png", ...hm } });
}

/* --- 1. keys ------------------------------------------------------------------------------------------------------------------ */

test("keys: names, folders, types and control routes are refused locally, before any fetch", async () => {
  const env = makeEnv(); await seed(env);
  assert.ok(isMediaPath("/media/acme/raw/a.png") && !isMediaPath("/mediax") && !isMediaPath("/lead"));
  const png = bytesOf("x");
  const cases = [
    ["raw/" + encodeURIComponent("שיר.png"), 400, "validation"],
    ["raw/a..b.png", 400, "validation"],
    ["raw/.x.png", 400, "validation"],
    ["Raw/a.png", 400, "validation"],
    ["trash/raw/a.png", 400, "validation"],
    ["raw/x/_data/a.json", 400, "validation", "application/json"],
    ["raw/a.jpg", 415, "unsupported_type"],                       /* a png's bytes under a jpg name */
    ["raw/a.pdf", 415, "unsupported_type", "application/pdf"],
    ["raw/a.json", 415, "unsupported_type", "application/json"], /* JSON only under <top>/_data/ */
    ["ads/_data/a.png", 415, "unsupported_type"],
  ];
  for (const [key, status, code, type] of cases) {
    const r = await upload(env, key, png, { type: type || "image/png" });
    assert.equal(r.status, status, key);
    assert.equal(r.json.error.code, code, key);
  }
  assert.equal((await call(env, "PUT", ".settings.json")).status, 404);
  assert.equal((await call(env, "GET", "_nope")).status, 404);
  assert.equal((await call(env, "POST", "_admin")).status, 405);
  assert.equal((await call(env, "GET", "_delete")).status, 405);
  assert.equal((await call(env, "PATCH", "raw/a.png")).status, 405);
  assert.equal((await upload(env, "raw/a.png", png)).status, 201);   /* a valid key */
  assert.equal(rpcs(env), 1, "only the valid upload asked Supabase");
});

test("a missing binding, var or secret answers 503 on every route", async () => {
  const env = makeEnv({ R2_READ_SECRET: "" }); await seed(env);
  const r = await call(env, "GET", "_admin", { token: "" });
  assert.equal(r.status, 503);
  assert.equal(r.json.error.code, "not_configured");
});

/* --- 2. staff and owner -------------------------------------------------------------------------------------------------------- */

test("staff and owner: 401 without or with a refused token, 403 for strangers and for staff on owner routes", async () => {
  const env = makeEnv(); await seed(env);
  const png = bytesOf("p");
  assert.equal((await upload(env, "raw/a.png", png, { token: "" })).status, 401);
  assert.equal((await upload(env, "raw/a.png", png, { token: "bad-signature" })).status, 401);
  assert.equal((await upload(env, "raw/a.png", png, { token: "token-of-another-project" })).status, 401);
  assert.equal((await upload(env, "raw/a.png", png, { token: "stranger" })).status, 403);
  assert.equal((await upload(env, "raw/a.png", png, { token: "staff" })).status, 201);
  assert.equal((await call(env, "PUT", "_settings", { body: { quota_bytes: 10 } })).status, 403);
  assert.equal((await call(env, "POST", "_visibility", { body: { folder: "raw", public: true } })).status, 403);
  assert.equal((await call(env, "PUT", "_settings", { token: "owner", body: { quota_bytes: 10 ** 9 } })).status, 200);
});

test("_admin: no token answers without any fetch; a token answers admin, owner and the public folders", async () => {
  const env = makeEnv(); await seed(env);
  const anon = await call(env, "GET", "_admin", { token: "" });
  assert.deepEqual(anon.json, { admin: false, owner: false, public_folders: ["ads"] });
  assert.equal(env.fetchLog.length, 0);
  assert.equal(anon.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual((await call(env, "GET", "_admin", { token: "staff" })).json, { admin: true, owner: false, public_folders: ["ads"] });
  assert.deepEqual((await call(env, "GET", "_admin", { token: "owner" })).json, { admin: true, owner: true, public_folders: ["ads"] });
  assert.deepEqual((await call(env, "GET", "_admin", { token: "stranger" })).json, { admin: false, owner: false, public_folders: ["ads"] });
  assert.equal((await call(env, "GET", "_admin", { token: "bad" })).status, 401);
  /* the same answer on every host: one Supabase project for all of them */
  const other = await call(env, "GET", "_admin", { token: "staff", host: "https://floa-lead.floa-il.workers.dev" });
  assert.equal(other.json.admin, true);
});

/* --- 3. upload --------------------------------------------------------------------------------------------------------------- */

test("upload: the same bytes are `existing` with no put; other bytes are name_taken; the trash reserves the name", async () => {
  const env = makeEnv(); await seed(env);
  const a = bytesOf("aaa"), z = bytesOf("zzz");
  assert.equal((await upload(env, "raw/a.png", a)).status, 201);
  const puts = env.MEDIA.puts().length;
  const again = await upload(env, "raw/a.png", a);
  assert.equal(again.status, 200);
  assert.equal(again.json.existing, true);
  assert.equal(env.MEDIA.puts().length, puts, "no put for existing bytes");
  assert.equal((await upload(env, "raw/a.png", z)).json.error.code, "name_taken");
  await place(env.MEDIA, "trash/raw/t.png", "ttt");
  assert.equal((await upload(env, "raw/t.png", bytesOf("ttt"))).json.error.code, "in_trash");
  assert.equal((await upload(env, "raw/t.png", z)).json.error.code, "name_taken");
});

test("upload: a tombstone under 48 h refuses other bytes, an expired one lets them in and is deleted", async () => {
  const env = makeEnv(); await seed(env);
  const at = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  await env.MEDIA.put(`${B}/.gone/raw/g.png`, "", { customMetadata: { sha256: "0".repeat(64), at: at(1) } });
  assert.equal((await upload(env, "raw/g.png", bytesOf("new"))).json.error.code, "name_recently_used");
  await env.MEDIA.put(`${B}/.gone/raw/g.png`, "", { customMetadata: { sha256: "0".repeat(64), at: at(49) } });
  assert.equal((await upload(env, "raw/g.png", bytesOf("new"))).status, 201);
  assert.equal(env.MEDIA.objects.has(`${B}/.gone/raw/g.png`), false);
});

test("upload: a checksum mismatch is 400 and stores nothing", async () => {
  const env = makeEnv(); await seed(env);
  const r = await upload(env, "raw/c.png", bytesOf("real"), { meta: { sha256: "a".repeat(64) } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "checksum_mismatch");
  assert.equal(env.MEDIA.objects.has(`${B}/raw/c.png`), false);
});

test("upload: public goes to MEDIA_PUBLIC with a day's cache and rewrites the index; defer does not; private goes to MEDIA", async () => {
  const env = makeEnv(); await seed(env);
  const pub = await upload(env, "ads/img/a.png", bytesOf("ad-a"), { meta: { title: "פרסומת", w: 1080, h: 1920 } });
  assert.equal(pub.status, 201);
  assert.equal(pub.json.url, `${CDN}/${B}/ads/img/a.png`);
  assert.equal(pub.json.index, "ok");
  const o = env.MEDIA_PUBLIC.objects.get(`${B}/ads/img/a.png`);
  assert.equal(o.httpMetadata.cacheControl, "public, max-age=86400");
  assert.equal(o.customMetadata.title, encodeURIComponent("פרסומת"));
  const ix = env.MEDIA_PUBLIC.json(`${B}/_index/ads.json`);
  assert.deepEqual(ix.items.map((i) => [i.key, i.title, i.w]), [["ads/img/a.png", "פרסומת", 1080]]);
  assert.equal(env.MEDIA_PUBLIC.objects.get(`${B}/_index/ads.json`).httpMetadata.cacheControl, "public, max-age=60");

  const before = env.MEDIA_PUBLIC.puts(`${B}/_index/ads.json`).length;
  const d = await upload(env, "ads/img/b.png", bytesOf("ad-b"), { defer: true });
  assert.equal(d.status, 201);
  assert.equal(env.MEDIA_PUBLIC.puts(`${B}/_index/ads.json`).length, before, "defer: no index rewrite");

  const prv = await upload(env, "raw/r.png", bytesOf("raw"));
  assert.match(prv.json.url, /^https:\/\/acc\.r2\.cloudflarestorage\.com\/floa-media\/acme\/raw\/r\.png\?X-Amz-/);
  assert.equal(env.MEDIA.objects.get(`${B}/raw/r.png`).httpMetadata.cacheControl, undefined);

  const named = await upload(env, "raw/", bytesOf("by-hash"), { method: "POST" });
  assert.equal(named.json.key, `raw/${(await sha256(bytesOf("by-hash"))).slice(0, 32)}.png`);
});

test("upload: over the quota is 413, a folder being moved is 409", async () => {
  const env = makeEnv(); await seed(env, { public_folders: ["ads"], quota_bytes: 5 });
  assert.equal((await upload(env, "raw/q.png", bytesOf("123456"))).json.error.code, "quota_exceeded");
  const env2 = makeEnv(); await seed(env2, { public_folders: ["ads"], moving: { folder: "raw", public: true, since: new Date().toISOString() } });
  assert.equal((await upload(env2, "raw/m.png", bytesOf("m"))).json.error.code, "folder_moving");
});

/* --- 4. presign ------------------------------------------------------------------------------------------------------------- */

test("presign: the AWS SigV4 query-signing vector, a stable 6-hour window, and no subrequest", async () => {
  /* the documented example of "Authenticating Requests: Using Query Parameters (AWS Signature Version 4)" */
  const aws = await presignGet({ host: "examplebucket.s3.amazonaws.com", path: "/test.txt", keyId: "AKIAIOSFODNN7EXAMPLE",
    secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", amzDate: "20130524T000000Z", expires: 86400, region: "us-east-1" });
  assert.ok(aws.endsWith("&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404"));

  const env = makeEnv();
  env.fetch = async () => { throw new Error("signing must not fetch"); };
  const t = Date.UTC(2026, 10, 26, 13, 30);
  const u1 = await presignPrivate(env, "acme/raw/a.png", t);
  assert.equal(u1, "https://acc.r2.cloudflarestorage.com/floa-media/acme/raw/a.png?X-Amz-Algorithm=AWS4-HMAC-SHA256"
    + "&X-Amz-Credential=kid%2F20261126%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20261126T120000Z&X-Amz-Expires=43200"
    + "&X-Amz-SignedHeaders=host&X-Amz-Signature=" + u1.slice(-64));
  assert.match(u1.slice(-64), /^[0-9a-f]{64}$/);
  assert.equal(await presignPrivate(env, "acme/raw/a.png", Date.UTC(2026, 10, 26, 17, 59)), u1, "same window, same URL");
  assert.notEqual(await presignPrivate(env, "acme/raw/a.png", Date.UTC(2026, 10, 26, 18, 0)), u1, "next window");
  for (const now of [Date.UTC(2026, 10, 26, 12, 0), t, Date.UTC(2026, 10, 26, 17, 59, 59)]) {
    const left = Date.parse(windowOf(now).expires) - now;
    assert.ok(left > 6 * 3600e3 - 1000 && left <= 12 * 3600e3, String(left));
  }
});

/* --- 5. lists ---------------------------------------------------------------------------------------------------------------- */

test("lists: private and trash need staff; staff get presigned URLs, a public prefix CDN URLs, metadata decoded, cursor through", async () => {
  const env = makeEnv(); await seed(env);
  await place(env.MEDIA, "raw/a.png", "a", { title: encodeURIComponent("חומר גלם"), duration: "41.233" });
  await place(env.MEDIA, "raw/b.png", "b");
  await place(env.MEDIA, "trash/raw/c.png", "c", { trashed: "2026-11-20T00:00:00Z" });
  await place(env.MEDIA_PUBLIC, "ads/img/d.png", "d");
  assert.equal((await call(env, "GET", "?prefix=raw/", { token: "" })).status, 403);
  assert.equal((await call(env, "GET", "?prefix=trash/", { token: "" })).status, 403);
  assert.equal((await call(env, "GET", "?prefix=raw/", { token: "stranger" })).status, 403);

  const p1 = await call(env, "GET", "?prefix=raw/&limit=1");
  assert.equal(p1.status, 200);
  assert.equal(p1.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(p1.json.items.map((i) => [i.key, i.title, i.duration]), [["raw/a.png", "חומר גלם", 41.233]]);
  assert.match(p1.json.items[0].url, /^https:\/\/acc\.r2\.cloudflarestorage\.com\/floa-media\/acme\/raw\/a\.png\?/);
  const left = Date.parse(p1.json.expires) - Date.now();
  assert.ok(left > 6 * 3600e3 - 1000 && left <= 12 * 3600e3);
  const p2 = await call(env, "GET", `?prefix=raw/&limit=1&cursor=${encodeURIComponent(p1.json.cursor)}`);
  assert.deepEqual(p2.json.items.map((i) => i.key), ["raw/b.png"]);
  assert.equal(p2.json.cursor, null);

  const tr = await call(env, "GET", "?prefix=trash/");
  assert.deepEqual(tr.json.items.map((i) => [i.key, i.trashed]), [["trash/raw/c.png", "2026-11-20T00:00:00Z"]]);
  const pub = await call(env, "GET", "?prefix=ads/", { token: "" });
  assert.equal(pub.json.items[0].url, `${CDN}/${B}/ads/img/d.png`);

  env.MEDIA.log = [];
  await call(env, "GET", "?prefix=raw/&limit=500");
  assert.equal(env.MEDIA.log.find((l) => l[0] === "list")[2].limit, 200, "a private page is clamped to 200");
});

test("lists: a store turned on elsewhere answers at once; an empty public folder is 200 with no items, for staff too", async () => {
  const env = makeEnv();
  /* this isolate sees the business off first */
  assert.equal((await call(env, "GET", "?prefix=ads/&limit=1000")).json.error.code, "not_found");
  assert.equal((await call(env, "GET", "?prefix=ads/&limit=1000", { token: "" })).status, 403);
  /* then another isolate (or wrangler) writes .settings.json; no cache is cleared here */
  await seed(env);
  for (const token of ["owner", ""]) {
    const r = await call(env, "GET", "?prefix=ads/&limit=1000", { token });
    assert.equal(r.status, 200, `token ${token || "none"}`);
    assert.deepEqual(r.json.items, []);
    assert.equal(r.json.cursor, null);
  }
  assert.equal((await call(env, "GET", "_admin", { token: "owner" })).status, 200);
});

/* --- 6. index ---------------------------------------------------------------------------------------------------------------- */

test("index: written over the etag it read; a concurrent change makes it retry and keep both items", async () => {
  const env = makeEnv(); await seed(env);
  await upload(env, "ads/img/a.png", bytesOf("a"));
  const IX = `${B}/_index/ads.json`;
  let armed = true;
  env.MEDIA_PUBLIC.onPut = async (key) => {
    if (key !== IX || !armed) return;
    armed = false;   /* another call lands an item and rewrites the index in between */
    await place(env.MEDIA_PUBLIC, "ads/img/other.png", "o");
    env.MEDIA_PUBLIC.objects.get(IX).etag = "someone-else";
  };
  const r = await upload(env, "ads/img/b.png", bytesOf("b"));
  assert.equal(r.json.index, "ok");
  const writes = env.MEDIA_PUBLIC.puts(IX);
  assert.ok(writes.slice(-2).every((w) => typeof w[2].onlyIf.etagMatches === "string"), "etagMatches on every rewrite");
  assert.deepEqual(env.MEDIA_PUBLIC.json(IX).items.map((i) => i.key), ["ads/img/a.png", "ads/img/b.png", "ads/img/other.png"]);
});

test("index: three failed writes answer index stale, and _reindex repairs it", async () => {
  const env = makeEnv(); await seed(env);
  await upload(env, "ads/img/a.png", bytesOf("a"));
  const IX = `${B}/_index/ads.json`;
  env.MEDIA_PUBLIC.onPut = async (key) => { if (key === IX) env.MEDIA_PUBLIC.objects.get(IX).etag += "x"; };
  const r = await upload(env, "ads/img/b.png", bytesOf("b"));
  assert.equal(r.status, 201);
  assert.equal(r.json.index, "stale");
  env.MEDIA_PUBLIC.onPut = null;
  const fix = await call(env, "POST", "_reindex", { body: { folder: "ads" } });
  assert.deepEqual(fix.json, { ok: true, folder: "ads", index: "ok" });
  assert.equal(env.MEDIA_PUBLIC.json(IX).items.length, 2);
  assert.equal((await call(env, "POST", "_reindex", { body: { folder: "raw" } })).json.error.field, "folder");
});

/* --- 7. trash, restore, purge --------------------------------------------------------------------------------------------------- */

test("_delete: two keys go to the private trash with all metadata, one index rewrite, one purge call (only with the token)", async () => {
  const env = makeEnv({ CF_PURGE_TOKEN: "tok", CF_ZONE_ID: "zone" }); await seed(env);
  await place(env.MEDIA_PUBLIC, "ads/img/a.png", "a", { title: "T", copyright: "C" }, { cacheControl: "public, max-age=86400" });
  await place(env.MEDIA_PUBLIC, "ads/video/v.png", "v");
  const r = await call(env, "POST", "_delete", { body: { keys: ["ads/img/a.png", "ads/video/v.png"] } });
  assert.deepEqual(r.json, { ok: true, done: ["ads/img/a.png", "ads/video/v.png"], failed: [], index: "ok" });
  assert.equal(env.MEDIA_PUBLIC.objects.has(`${B}/ads/img/a.png`), false);
  const t = env.MEDIA.objects.get(`${B}/trash/ads/img/a.png`);
  assert.deepEqual([t.customMetadata.title, t.customMetadata.copyright, t.customMetadata.up, !!t.customMetadata.trashed, t.httpMetadata.contentType],
    ["T", "C", "2026-11-01T00:00:00Z", true, "image/png"]);
  assert.equal(env.MEDIA_PUBLIC.puts(`${B}/_index/ads.json`).length, 1);
  assert.deepEqual(purges(env), [[`${CDN}/${B}/_index/ads.json`, `${CDN}/${B}/ads/img/a.png`, `${CDN}/${B}/ads/video/v.png`]]);

  const quiet = makeEnv(); await seed(quiet);
  await place(quiet.MEDIA_PUBLIC, "ads/img/a.png", "a");
  await call(quiet, "POST", "_delete", { body: { keys: ["ads/img/a.png"] } });
  assert.equal(purges(quiet).length, 0, "no token, no purge call");
});

test("_delete: a partial success lists done and failed; a repeat finishes a half move; 9 keys touch nothing", async () => {
  const env = makeEnv(); await seed(env);
  await place(env.MEDIA, "raw/a.png", "a");
  const r = await call(env, "POST", "_delete", { body: { keys: ["raw/a.png", "raw/missing.png"] } });
  assert.deepEqual(r.json, { ok: true, done: ["raw/a.png"], failed: [{ key: "raw/missing.png", code: "not_found" }], index: "ok" });

  await place(env.MEDIA, "raw/h.png", "h");
  await place(env.MEDIA, "trash/raw/h.png", "h");   /* an interrupted delete: the trash copy is there, the source too */
  const half = await call(env, "DELETE", "raw/h.png");
  assert.deepEqual(half.json, { ok: true, trash: "trash/raw/h.png" });
  assert.equal(env.MEDIA.objects.has(`${B}/raw/h.png`), false);

  await place(env.MEDIA, "raw/k.png", "k");
  const nine = await call(env, "POST", "_delete", { body: { keys: ["raw/k.png", ...Array.from({ length: 8 }, (_, i) => `raw/${i}.png`)] } });
  assert.equal(nine.status, 400);
  assert.equal(nine.json.ok, false);
  assert.equal(env.MEDIA.objects.has(`${B}/raw/k.png`), true);
});

test("_restore: the same key, with or without trash/, into the bucket of the current visibility, every field intact", async () => {
  const env = makeEnv(); await seed(env);
  await place(env.MEDIA, "trash/ads/img/a.png", "a", { title: "T", copyright: "C", trashed: "2026-11-20T00:00:00Z" });
  await place(env.MEDIA, "trash/raw/r.png", "r", { trashed: "2026-11-20T00:00:00Z" });
  const r = await call(env, "POST", "_restore", { body: { keys: ["ads/img/a.png", "trash/raw/r.png", "raw/none.png"] } });
  assert.deepEqual(r.json, { ok: true, done: ["ads/img/a.png", "raw/r.png"], failed: [{ key: "raw/none.png", code: "not_found" }], index: "ok" });
  const a = env.MEDIA_PUBLIC.objects.get(`${B}/ads/img/a.png`);
  assert.deepEqual([a.customMetadata.title, a.customMetadata.copyright, a.customMetadata.up, a.customMetadata.trashed, a.httpMetadata.cacheControl],
    ["T", "C", "2026-11-01T00:00:00Z", undefined, "public, max-age=86400"]);
  assert.ok(env.MEDIA.objects.has(`${B}/raw/r.png`));
  assert.equal(env.MEDIA.objects.has(`${B}/trash/raw/r.png`), false);
  assert.deepEqual(env.MEDIA_PUBLIC.json(`${B}/_index/ads.json`).items.map((i) => i.key), ["ads/img/a.png"]);
});

test("purge: the original key or trash/, a tombstone with sha256 and at; not in the trash is not_found", async () => {
  const env = makeEnv(); await seed(env);
  await place(env.MEDIA, "trash/raw/a.png", "a");
  await place(env.MEDIA, "trash/raw/b.png", "b");
  const r = await call(env, "POST", "_purge", { body: { keys: ["raw/a.png", "raw/zzz.png"] } });
  assert.deepEqual(r.json, { ok: true, done: ["raw/a.png"], failed: [{ key: "raw/zzz.png", code: "not_found" }] });
  const g = env.MEDIA.objects.get(`${B}/.gone/raw/a.png`);
  assert.equal(g.customMetadata.sha256, await sha256(bytesOf("a")));
  assert.ok(Date.parse(g.customMetadata.at) > Date.now() - 60e3);
  assert.equal(env.MEDIA.objects.has(`${B}/trash/raw/a.png`), false);
  assert.deepEqual((await call(env, "DELETE", "trash/raw/b.png")).json, { ok: true, purged: "trash/raw/b.png" });
});

test("the GET helper: a public key is a 301 to the CDN, a private or trashed key is 404 (no single-key renew)", async () => {
  const env = makeEnv(); await seed(env);
  const pub = await call(env, "GET", "ads/img/a.png", { token: "" });
  assert.equal(pub.status, 301);
  assert.equal(pub.headers.get("location"), `${CDN}/${B}/ads/img/a.png`);
  assert.equal(pub.headers.get("access-control-allow-origin"), "*");
  assert.equal((await call(env, "GET", "raw/a.png")).status, 404);
  assert.equal((await call(env, "GET", "trash/ads/img/a.png")).status, 404);
  assert.equal(env.fetchLog.length, 0);
});

test("_settings writes _index/_folders.json (60 s cache) and purges it", async () => {
  const env = makeEnv({ CF_PURGE_TOKEN: "tok", CF_ZONE_ID: "zone" });
  const r = await call(env, "PUT", "_settings", { token: "owner", body: { public_folders: ["ads"], origins: ["https://shop.example"] } });
  assert.equal(r.status, 200);
  assert.equal(r.json.folders, "ok");
  assert.deepEqual(env.MEDIA_PUBLIC.json(`${B}/_index/_folders.json`), { public_folders: ["ads"] });
  assert.equal(env.MEDIA_PUBLIC.objects.get(`${B}/_index/_folders.json`).httpMetadata.cacheControl, "public, max-age=60");
  assert.deepEqual(purges(env), [[`${CDN}/${B}/_index/_folders.json`]]);
  const change = await call(env, "PUT", "_settings", { token: "owner", body: { public_folders: ["ads", "raw"] } });
  assert.equal(change.json.error.field, "public_folders", "public_folders change only through _visibility");
});

/* --- data files --------------------------------------------------------------------------------------------------------------- */

test("data files (public): a PUT overwrites, the previous version replaces the one in the trash, 60 s cache, purged, never listed", async () => {
  const env = makeEnv({ CF_PURGE_TOKEN: "tok", CF_ZONE_ID: "zone" }); await seed(env);
  const json = (s) => bytesOf(JSON.stringify(s));
  const K = "ads/_data/ads.json";
  const v1 = await upload(env, K, json({ v: 1 }), { type: "application/json", noMeta: true });
  assert.deepEqual([v1.status, v1.json.replaced, v1.json.url], [201, false, `${CDN}/${B}/${K}`]);
  const v2 = await upload(env, K, json({ v: 2 }), { type: "application/json", meta: { title: "גרסה 2" } });
  assert.deepEqual([v2.status, v2.json.replaced, v2.json.existing], [201, true, undefined]);
  assert.deepEqual(env.MEDIA.json(`${B}/trash/${K}`), { v: 1 });
  const v3 = await upload(env, K, json({ v: 2 }), { type: "application/json" });   /* the same bytes again: still a write */
  assert.equal(v3.json.replaced, true);
  const t = env.MEDIA.objects.get(`${B}/trash/${K}`);
  assert.deepEqual([JSON.parse(new TextDecoder().decode(t.bytes)).v, decodeURIComponent(t.customMetadata.title)], [2, "גרסה 2"]);
  assert.equal(env.MEDIA_PUBLIC.objects.get(`${B}/${K}`).httpMetadata.cacheControl, "public, max-age=60");
  assert.ok(purges(env).every((p) => p.length === 1 && p[0] === `${CDN}/${B}/${K}`) && purges(env).length === 3);

  await upload(env, "ads/img/a.png", bytesOf("a"));
  assert.deepEqual(env.MEDIA_PUBLIC.json(`${B}/_index/ads.json`).items.map((i) => i.key), ["ads/img/a.png"], "not in the index");
  assert.deepEqual((await call(env, "GET", "?prefix=ads/")).json.items.map((i) => i.key), ["ads/img/a.png"], "not in a list");
  assert.deepEqual((await call(env, "GET", "?prefix=ads/_data/")).json.items.map((i) => i.key), [K]);
  assert.equal((await call(env, "GET", "?prefix=ads/_data/", { token: "" })).status, 403, "a data prefix needs staff, even when public");
  assert.equal((await upload(env, "ads/_data/big.json", new Uint8Array(1024 * 1024 + 1), { type: "application/json", noMeta: true })).status, 413);
  assert.equal((await call(env, "POST", "_restore", { body: { keys: [K] } })).json.failed[0].code, "name_taken");
});

test("data files (private): stored in MEDIA with no cache header and no purge, listed only under <top>/_data/ with presigned URLs", async () => {
  const env = makeEnv({ CF_PURGE_TOKEN: "tok", CF_ZONE_ID: "zone" }); await seed(env);
  const K = "raw/_data/links.json";
  const r = await upload(env, K, bytesOf('{"links":[]}'), { type: "application/json", noMeta: true });
  assert.equal(r.status, 201);
  assert.match(r.json.url, /^https:\/\/acc\.r2\.cloudflarestorage\.com\/floa-media\/acme\/raw\/_data\/links\.json\?/);
  assert.equal(env.MEDIA.objects.get(`${B}/${K}`).httpMetadata.cacheControl, undefined);
  assert.equal(purges(env).length, 0);
  await place(env.MEDIA, "raw/a.png", "a");
  assert.deepEqual((await call(env, "GET", "?prefix=raw/")).json.items.map((i) => i.key), ["raw/a.png"]);
  const d = await call(env, "GET", "?prefix=raw/_data/");
  assert.deepEqual(d.json.items.map((i) => i.key), [K]);
  assert.match(d.json.items[0].url, /X-Amz-Signature=/);
  assert.equal((await call(env, "GET", "?prefix=raw/_data/", { token: "stranger" })).status, 403);
});

/* --- 8. visibility move ------------------------------------------------------------------------------------------------------ */

test("visibility: moving set, uploads refused, 10 per call, the settings flipped at the end, resumable", async () => {
  const env = makeEnv(); await seed(env);
  for (let i = 0; i < 12; i++) await place(env.MEDIA, `raw/${String(i).padStart(2, "0")}.png`, "r" + i);
  const move = () => call(env, "POST", "_visibility", { token: "owner", body: { folder: "raw", public: true } });

  const first = await move();
  assert.deepEqual(first.json, { ok: true, folder: "raw", public: true, moved: 0, remaining: 12, done: false });
  assert.equal(env.MEDIA.json(`${B}/.settings.json`).moving.folder, "raw");
  assert.equal((await upload(env, "raw/new.png", bytesOf("n"))).json.error.code, "folder_moving");

  const second = await move();
  assert.deepEqual([second.json.moved, second.json.remaining, second.json.done], [10, 2, false]);
  assert.equal(env.MEDIA_PUBLIC.objects.get(`${B}/raw/00.png`).httpMetadata.cacheControl, "public, max-age=86400");
  const third = await move();   /* resumes where the last one stopped */
  assert.deepEqual([third.json.moved, third.json.remaining, third.json.done], [2, 0, false]);
  assert.ok(third.json.retry_after > 0, "waits until every isolate has seen `moving`");

  const s = env.MEDIA.json(`${B}/.settings.json`);
  s.moving.since = new Date(Date.now() - 120e3).toISOString();
  await env.MEDIA.put(`${B}/.settings.json`, JSON.stringify(s));
  _clearMediaCaches();
  const last = await move();
  assert.deepEqual([last.json.moved, last.json.remaining, last.json.done], [0, 0, true]);
  const done = env.MEDIA.json(`${B}/.settings.json`);
  assert.deepEqual([done.public_folders, done.moving], [["ads", "raw"], null]);
  assert.deepEqual(env.MEDIA_PUBLIC.json(`${B}/_index/_folders.json`), { public_folders: ["ads", "raw"] });
  assert.equal(env.MEDIA_PUBLIC.json(`${B}/_index/raw.json`).items.length, 12);
  assert.equal([...env.MEDIA.objects.keys()].filter((k) => k.startsWith(`${B}/raw/`)).length, 0);
  assert.equal((await move()).json.done, true, "a call after the end is a no-op");
});

/* --- 9. CORS ---------------------------------------------------------------------------------------------------------------- */

test("CORS: a foreign origin is refused on a staff route, a script, the domain and the business's origins pass", async () => {
  const env = makeEnv(); await seed(env);
  const evil = await call(env, "GET", "_usage", { origin: "https://evil.example" });
  assert.deepEqual([evil.status, evil.json.error.code, evil.headers.get("access-control-allow-origin")], [403, "origin", null]);
  assert.equal(rpcs(env), 0);
  const script = await call(env, "GET", "_usage");
  assert.deepEqual([script.status, script.headers.get("access-control-allow-origin")], [200, null]);
  for (const o of ["https://shop.example", "https://app.floa.co.il", "http://localhost:5173"]) {
    const r = await call(env, "GET", "_usage", { origin: o });
    assert.deepEqual([r.status, r.headers.get("access-control-allow-origin"), r.headers.get("vary")], [200, o, "origin"]);
  }
  assert.equal(script.headers.get("x-robots-tag"), "noindex");
  const pre = await call(env, "OPTIONS", "raw/a.png", { token: "", origin: "https://evil.example" });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
  assert.match(pre.headers.get("access-control-allow-headers"), /range/);
});

/* --- 10. no business in the code ---------------------------------------------------------------------------------------------- */

test("no file of the store names a business as a quoted string", () => {
  const dir = fileURLToPath(new URL("../src/media/", import.meta.url));
  const files = [fileURLToPath(new URL("../src/media.js", import.meta.url)), ...readdirSync(dir).map((f) => dir + f)];
  for (const file of files) {
    /* the tenancy's own schema is called "roster", which is also a business key: that one line is the tenancy, not a tenant */
    const src = readFileSync(file, "utf8").split("\n").filter((l) => !/^const TENANCY_SCHEMA = "roster";/.test(l)).join("\n");
    for (const key of Object.keys(BUSINESSES)) {
      for (const q of ['"', "'", "`"]) assert.ok(!src.includes(q + key + q), `${file} names ${key}`);
    }
  }
});
