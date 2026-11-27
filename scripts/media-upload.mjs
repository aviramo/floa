#!/usr/bin/env node
/* ==========================================================================
   Bulk upload of a manifest of local files to the FLOA media store, for any
   business (worker/MEDIA.md, "Scripts: the first bulk upload").

     node scripts/media-upload.mjs --business=<slug> --manifest=<file>          dry run: the plan, no network
     node scripts/media-upload.mjs --business=<slug> --manifest=<file> --list   dry run + what the store already holds
     node scripts/media-upload.mjs --business=<slug> --manifest=<file> --run    upload (run it right after 00:00 UTC)

   Sign-in (MEDIA.md, "Signing in as staff"): MEDIA_REFRESH_TOKEN=<refresh_token of a
   staff session> in .env, which git ignores. Every refresh rotates it, and the new one
   is written back to .env before the access token is used. Fallback: MEDIA_ACCESS_TOKEN
   in the environment (a pasted access token, good for about an hour). No token is printed.
   Progress and today's Worker request count live in .env.media-upload.json (ignored by
   git through `.env.*`), so a re-run skips what is done. One run at a time.
   Data files (<top>/_data/<name>.json, JSON up to 1 MiB) go after the media, with no
   _reindex: one staff list per folder, and a PUT (which overwrites) unless the stored
   sha256 already matches.
   --help lists every option.
   ========================================================================== */
import { createReadStream, readFileSync, writeFileSync, renameSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRETS = new Set();      // every token seen, redacted from all output

const HELP = `media-upload: bulk upload to the FLOA media store (worker/MEDIA.md)

  --business=<slug>     the roster slug, the path segment after /media/ (required)
  --manifest=<file>     the manifest: {entries:[…]} or […] (required). Per entry: key (relative to
                        the business; a leading "<slug>/" is dropped; null = skip), path or local_path
                        (absolute, or relative to --root), type (MIME or image|video|audio), bytes,
                        sha256, width/height, duration (s), title, copyright (text sent as is, or false;
                        true is refused: that entry is skipped). A key <top>/_data/<name>.json is a
                        data file (JSON, at most 1 MiB, sha256 optional), sent after the media
  --root=<dir>          base for relative paths (default: the manifest's folder)
  --run                 upload. Without it nothing is written and nothing is sent
  --list                dry run plus a read of what is there: the public indexes on the CDN (free),
                        and with credentials one Worker list per folder without an index
  --only=<top,…>        only these top folders (e.g. --only=raw,music)
  --public=<top,…>      top folders known to be public (also detected from the CDN index and answers)
  --base=<url>          API base (default https://api.floa.co.il)
  --test                the test Worker, https://api-test.floa.co.il (no CDN reads unless --media)
  --media=<url>         public file base (default https://media.floa.co.il, for the production API)
  --concurrency=<n>     uploads at once (default 4)
  --max-requests=<n>    Worker requests allowed today (UTC), across runs (default 1000, 1% of the
                        account's 100,000; the first bulk upload of 544 files needs about 550)
  --hash=sample|all     dry run: hash a sample (default) or every file. --run hashes every file
  --sample=<n>          dry run sample size (default 12)
  --retry-refused       send again what the server refused (409/400/415) in an earlier run
  --force-data          overwrite a data file that changed in the store since this script last
                        wrote it, or that it has no record of writing
  --env=<file>          the .env to read and to save the rotated token in (default <repo>/.env)
  --state=<file>        progress file (default <repo>/.env.media-upload.json)

  Env: MEDIA_REFRESH_TOKEN (.env), MEDIA_ACCESS_TOKEN (fallback, process env only),
       SUPABASE_URL and SUPABASE_ANON_KEY (override apps/floa/domain/supabase.js).`;

/* ---------- arguments ---------- */

const KNOWN = new Set(["business", "manifest", "root", "run", "list", "only", "public", "base", "test", "media",
  "concurrency", "max-requests", "hash", "sample", "retry-refused", "force-data", "env", "state", "help"]);
const flags = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!m || !KNOWN.has(m[1])) { console.error(`Unknown argument: ${a}\n\n${HELP}`); process.exit(1); }
  flags[m[1]] = m[2] ?? true;
}
if (flags.help) { console.log(HELP); process.exit(0); }

const B = flags.business;
if (typeof B !== "string" || !/^[a-z][a-z0-9-]{1,39}$/.test(B)) fatal("--business=<slug> is required: ^[a-z][a-z0-9-]{1,39}$");
if (typeof flags.manifest !== "string") fatal("--manifest=<file> is required");
const RUN = flags.run === true;
const LIST = flags.list === true && !RUN;
const PROD_HOSTS = ["api.floa.co.il", "floa-lead.floa-il.workers.dev"];
const BASE = String(flags.test ? "https://api-test.floa.co.il" : flags.base || "https://api.floa.co.il").replace(/\/+$/, "");
const CDN = typeof flags.media === "string" ? flags.media.replace(/\/+$/, "")
  : PROD_HOSTS.includes(new URL(BASE).host) ? "https://media.floa.co.il" : null;
const CONC = posInt(flags.concurrency, 4, "--concurrency");
const MAX_REQ = posInt(flags["max-requests"], 1000, "--max-requests");
const SAMPLE = posInt(flags.sample, 12, "--sample");
const HASH_ALL = flags.hash === "all";
const ONLY = list(flags.only);
const PUBLIC_GIVEN = list(flags.public);
const ENV_PATH = resolve(typeof flags.env === "string" ? flags.env : join(ROOT, ".env"));
const STATE_PATH = resolve(typeof flags.state === "string" ? flags.state : join(ROOT, ".env.media-upload.json"));
const MANIFEST = resolve(flags.manifest);
const FILE_ROOT = resolve(typeof flags.root === "string" ? flags.root : dirname(MANIFEST));

/* ---------- the rules of MEDIA.md ---------- */

const TYPES = {
  jpg: ["image/jpeg", "image"], jpeg: ["image/jpeg", "image"], png: ["image/png", "image"], webp: ["image/webp", "image"],
  gif: ["image/gif", "image"], avif: ["image/avif", "image"], heic: ["image/heic", "image"],
  mp4: ["video/mp4", "video"], m4v: ["video/mp4", "video"], mov: ["video/quicktime", "video"], webm: ["video/webm", "video"],
  mp3: ["audio/mpeg", "audio"], m4a: ["audio/mp4", "audio"], ogg: ["audio/ogg", "audio"], opus: ["audio/ogg", "audio"],
  flac: ["audio/flac", "audio"], wav: ["audio/wav", "audio"],
  json: ["application/json", "data"],       // only as a data file, <top>/_data/<name>.json
};
const MAX_FILE = 90 * 1024 * 1024;          // single-request uploads: never more than 90 MiB
const DATA_MAX = 1024 * 1024;               // one data file
const QUOTA_ITEMS = 5000;                   // the default per-business settings (and 5 GiB)
const META_MAX = 4096;
const BAD_CHARS = /[\u0000-\u001f\u007f‪-‮⁦-⁩​-‍﻿]/;
const RETRIES = 3;

function keyProblem(rel) {
  const parts = rel.split("/");
  const name = parts.pop();
  if (parts.length < 1 || parts.length > 3) return "the folder must be 1 to 3 segments";
  /* The one exception to the segment rule: _data, directly under the top folder. */
  const di = parts.indexOf("_data");
  if (di !== -1 && (di !== 1 || parts.length !== 2)) return "_data is allowed only directly under a top folder (<top>/_data/<name>.json)";
  for (const [j, s] of parts.entries()) if (!(j === 1 && s === "_data") && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(s)) return `folder segment "${s}"`;
  if (parts[0] === "trash") return "the top folder trash is reserved";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(name) || name.includes("..")) return `name "${name}"`;
  return null;
}

function textProblem(s) {
  if ([...s].length > 200) return "over 200 characters";
  if (BAD_CHARS.test(s)) return "a control, bidi or zero-width character";
  return null;
}

/* ---------- output: nothing secret is ever printed ---------- */

function redact(s) {
  let t = String(s);
  for (const v of SECRETS) if (v && v.length >= 6) t = t.split(v).join("[token]");
  return t.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]").replace(/(X-Amz-Signature=)[^&\s"]+/gi, "$1[…]");
}
function say(...a) { console.log(redact(a.join(" "))); }
function warn(...a) { console.error(redact(a.join(" "))); }
function fatal(msg) { warn(msg); process.exit(1); }
function posInt(v, d, name) {
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) fatal(`${name} must be a positive integer`);
  return n;
}
function list(v) { return typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []; }
function mb(n) { return `${(n / 1e6).toFixed(1)} MB`; }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }
function lpad(s, n) { s = String(s); return s.length >= n ? s : " ".repeat(n - s.length) + s; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const utcDay = () => new Date().toISOString().slice(0, 10);

/* ---------- the plan ---------- */

function buildPlan() {
  let manifest;
  try { manifest = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch (e) { fatal(`Cannot read the manifest: ${e.message}`); }
  const entries = Array.isArray(manifest) ? manifest : manifest.entries;
  if (!Array.isArray(entries)) fatal("The manifest has no entries array");
  const plan = [], data = [], skipped = [], notes = [], byKey = new Map(), byLower = new Map();
  let stripped = 0;
  entries.forEach((e, i) => {
    const skip = (why, rel) => skipped.push({ i, rel: rel ?? (e.key ?? null), why, category: e.category ?? null });
    if (e.key == null) return skip("null key");
    let rel = String(e.key).replace(/^\/+/, "");
    if (rel.startsWith(B + "/") && rel.split("/").length >= 3) { rel = rel.slice(B.length + 1); stripped++; }
    const top = rel.split("/")[0];
    if (ONLY.length && !ONLY.includes(top)) return skip("outside --only", rel);
    const kp = keyProblem(rel);
    if (kp) return skip(`invalid key: ${kp}`, rel);
    const name = rel.split("/").pop();
    const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
    const isData = rel.split("/")[1] === "_data";
    if (isData && ext !== "json") return skip("only .json files under <top>/_data/", rel);
    if (!isData && ext === "json") return skip("JSON only under <top>/_data/", rel);
    const T = TYPES[ext];
    if (!T) return skip(`type not allowed (.${ext})`, rel);
    const [mime, kind] = T;
    if (e.type && (String(e.type).includes("/") ? String(e.type).toLowerCase() !== mime : !(e.type === kind || (isData && e.type === "json"))))
      return skip(`type "${e.type}" does not match .${ext}`, rel);
    let sha256 = String(e.sha256 ?? "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      if (!isData) return skip("no valid sha256 in the manifest", rel);
      sha256 = null;   // a data file is small: hashed here
    }
    const p = e.path ?? e.local_path ?? e.source_path;
    if (!p) return skip("no path", rel);
    const abs = isAbsolute(p) ? p : resolve(FILE_ROOT, p);
    let size;
    try { const st = statSync(abs); if (!st.isFile()) return skip("missing file", rel); size = st.size; }
    catch { return skip("missing file", rel); }
    if (e.bytes != null && Number(e.bytes) !== size) return skip(`size ${size} differs from the manifest's ${e.bytes}`, rel);
    if (size > MAX_FILE) return skip("over 90 MiB (single-request uploads)", rel);
    if (size === 0) return skip("empty file", rel);
    if (isData) {
      /* The Worker does not parse it, so it is checked here: at most 1 MiB, valid JSON. */
      if (size > DATA_MAX) return skip(`data file over 1 MiB (${size} bytes)`, rel);
      let buf;
      try { buf = readFileSync(abs); } catch (err) { return skip(`unreadable (${err.code || err.message})`, rel); }
      try { JSON.parse(buf.toString("utf8")); }
      catch { return skip(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf ? "not valid JSON (it starts with a BOM)" : "not valid JSON", rel); }
      const got = createHash("sha256").update(buf).digest("hex");
      if (sha256 && got !== sha256) return skip("sha256 mismatch (the file is not the manifest's)", rel);
      sha256 = got;
    }

    const meta = { sha256 };
    if (e.title != null && e.title !== "") {
      const t = String(e.title), tp = textProblem(t);
      if (tp) return skip(`title: ${tp}`, rel);
      meta.title = t;
    }
    /* copyright is text, sent exactly as written, or false/absent for none. true says
       "protected" without saying by whom, and it cannot be fixed after upload in v1. */
    if (e.copyright === true) return skip("copyright: true without text (write the text in the manifest)", rel);
    if (typeof e.copyright === "string" && e.copyright !== "") {
      const cp = textProblem(e.copyright);
      if (cp) return skip(`copyright: ${cp}`, rel);
      meta.copyright = e.copyright;
    } else if (e.copyright != null && e.copyright !== false && e.copyright !== "") return skip("copyright must be text or false", rel);
    const w = e.width ?? e.w, h = e.height ?? e.h;
    if (!isData && (w != null || h != null)) {
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 20000 || h > 20000)
        return skip(`width/height ${w}x${h} outside 1 to 20000`, rel);
      meta.w = w; meta.h = h;
    }
    if (!isData && e.duration != null) {
      const d = Number(e.duration);
      if (!Number.isFinite(d) || d < 0 || d > 86400) return skip(`duration ${e.duration} outside 0 to 86400`, rel);
      meta.duration = Math.round(d * 1000) / 1000;
    }
    const metaHeader = encodeURIComponent(JSON.stringify(meta));
    if (metaHeader.length > META_MAX) return skip("X-Media-Meta over 4 KB", rel);

    const prev = byKey.get(rel);
    if (prev) {
      if (prev.sha256 === sha256) return skip(`duplicate of manifest entry #${prev.i}`, rel);
      return skip(`collides with manifest entry #${prev.i} (same key, other bytes)`, rel);
    }
    const lower = rel.toLowerCase();
    if (byLower.has(lower)) notes.push(`${rel} and ${byLower.get(lower)} differ only by case`);
    byLower.set(lower, rel);
    const item = { i, rel, top, sub: rel.split("/").slice(0, -1).slice(0, 2).join("/"), abs, bytes: size, sha256, mime, meta, metaHeader, isData };
    byKey.set(rel, item);
    (isData ? data : plan).push(item);
  });
  if (stripped) notes.push(`${stripped} keys carried the business prefix "${B}/", dropped (keys are relative to the business)`);
  const withCopyright = [...plan, ...data].filter((it) => it.meta.copyright);
  if (withCopyright.length) {
    const by = new Map();
    for (const it of withCopyright) by.set(it.top, (by.get(it.top) || 0) + 1);
    const longest = withCopyright.reduce((a, it) => (it.metaHeader.length > a.metaHeader.length ? it : a));
    notes.push(`copyright text on ${withCopyright.length} entries (${[...by].sort().map(([t, n]) => `${t} ${n}`).join(", ")}), sent as written; the largest X-Media-Meta among them is ${longest.metaHeader.length} bytes encoded of ${META_MAX} (${longest.rel})`);
  }
  const sameBytes = new Map();
  for (const it of plan) {
    const k = `${it.rel.slice(0, it.rel.lastIndexOf("/"))}|${it.sha256}`;
    if (sameBytes.has(k)) notes.push(`${it.rel} has the same bytes as ${sameBytes.get(k)} (both kept)`);
    else sameBytes.set(k, it.rel);
  }
  return { entries, plan, data, skipped, notes };
}

function printPlan({ entries, plan, data, skipped, notes }) {
  say(`media-upload  business ${B}  manifest ${MANIFEST} (${entries.length} entries)`);
  say(`API ${BASE}/media/${B}/   public files ${CDN ? `${CDN}/${B}/` : "(no CDN reads)"}`);
  say(RUN ? "Mode: RUN" : LIST ? "Mode: dry run with a read of the store (--list). Nothing is written to the store."
    : "Mode: dry run. Nothing is written and nothing is sent. Add --run to upload, --list to read what is there.");
  const tops = new Map();
  for (const it of plan) {
    const t = tops.get(it.top) || { n: 0, b: 0, subs: new Map() };
    t.n++; t.b += it.bytes;
    if (it.sub !== it.top) t.subs.set(it.sub, (t.subs.get(it.sub) || 0) + 1);
    tops.set(it.top, t);
  }
  say("\nPlan by top folder");
  say(`  ${pad("folder", 10)}${lpad("files", 6)}${lpad("bytes", 12)}`);
  let tn = 0, tb = 0, biggest = 0;
  for (const [top, t] of [...tops].sort()) {
    const subs = [...t.subs].sort().map(([s, n]) => `${s} ${n}`).join(", ");
    say(`  ${pad(top, 10)}${lpad(t.n, 6)}${lpad(mb(t.b), 12)}   ${PUBLIC_GIVEN.includes(top) ? "public" : ""}${t.subs.size > 1 && subs.length < 90 ? `  (${subs})` : t.subs.size > 1 ? `  (${t.subs.size} subfolders)` : ""}`);
    tn += t.n; tb += t.b;
  }
  for (const it of plan) biggest = Math.max(biggest, it.bytes);
  say(`  ${pad("total", 10)}${lpad(tn, 6)}${lpad(mb(tb), 12)}`);
  const db = data.reduce((s, it) => s + it.bytes, 0);
  say(`  largest file ${mb(biggest)} (cap 90 MiB); against the default quota: ${mb(tb + db)} of 5 GiB, ${tn + data.length} of ${QUOTA_ITEMS} items`);

  if (data.length) {
    say(`\nData files (${data.length}, ${(db / 1e3).toFixed(1)} KB): JSON, sent after the media, overwritten unless the stored sha256 matches, never in an index`);
    for (const it of [...data].sort((a, b) => a.rel.localeCompare(b.rel)))
      say(`  ${pad(it.rel, 40)}${lpad(`${(it.bytes / 1e3).toFixed(1)} KB`, 10)}   ${PUBLIC_GIVEN.includes(it.top) ? "public" : ""}`);
  } else say("\nData files: none");

  if (skipped.length) {
    const groups = new Map();
    for (const s of skipped) {
      const g = groups.get(s.why) || []; g.push(s); groups.set(s.why, g);
    }
    say(`\nSkipped (${skipped.length})`);
    for (const [why, g] of groups) {
      const cats = new Map();
      for (const s of g) if (s.category) cats.set(s.category, (cats.get(s.category) || 0) + 1);
      const catText = cats.size ? `  (${[...cats].map(([c, n]) => `${c} ${n}`).join(", ")})` : "";
      say(`  ${pad(why, 34)}${lpad(g.length, 5)}${catText}`);
      if (why !== "null key" && why !== "outside --only") for (const s of g.slice(0, 5)) say(`      ${s.rel ?? `#${s.i}`}`);
      if (why !== "null key" && why !== "outside --only" && g.length > 5) say(`      … ${g.length - 5} more`);
    }
  } else say("\nSkipped: none");
  if (notes.length) { say("\nNotes"); for (const n of notes.slice(0, 20)) say(`  ${n}`); if (notes.length > 20) say(`  … ${notes.length - 20} more`); }

  say("\nRequest shape (the first entry of each top folder)");
  const firsts = new Map();
  for (const it of plan) if (!firsts.has(it.top)) firsts.set(it.top, it);
  for (const it of firsts.values()) {
    say(`  PUT /media/${B}/${it.rel}`);
    say(`      Content-Type: ${it.mime}   Content-Length: ${it.bytes}   X-Media-Index: defer`);
    say(`      X-Media-Meta: ${JSON.stringify(it.meta)}   (${it.metaHeader.length} bytes encoded)`);
  }
  if (data.length) {
    const it = data[0];
    say(`  PUT /media/${B}/${it.rel}   (a data file: no X-Media-Index, no _reindex)`);
    say(`      Content-Type: ${it.mime}   Content-Length: ${it.bytes}`);
    say(`      X-Media-Meta: ${JSON.stringify(it.meta)}   (${it.metaHeader.length} bytes encoded)`);
  }
  return { tops: [...tops.keys()].sort(), dataTops: [...new Set(data.map((it) => it.top))].sort(), count: tn, bytes: tb };
}

/* ---------- files ---------- */

function sha256File(path) {
  return new Promise((ok, no) => {
    const h = createHash("sha256");
    createReadStream(path).on("data", (c) => h.update(c)).on("error", no).on("end", () => ok(h.digest("hex")));
  });
}

/* ---------- state: progress and today's request count ---------- */

const JOB = `${BASE}|${B}`;
let state = { v: 1, requests: {}, jobs: {} };
try { state = { ...state, ...JSON.parse(readFileSync(STATE_PATH, "utf8")) }; } catch { /* first run */ }
state.requests[BASE] ??= {};
state.jobs[JOB] ??= {};
const job = state.jobs[JOB];
job.done ??= {}; job.refused ??= {}; job.reindex ??= []; job.public ??= [];
job.dataWritten ??= {};      // data file key -> the sha256 this script last wrote (or last found equal to its own)
const FORCE_DATA = flags["force-data"] === true;

/* A data file is overwritten by any PUT, and the ad tools publish newer versions themselves.
   So it is sent only when nothing is stored, or the store still holds this script's last
   version; anything else is someone else's newer version and needs --force-data. */
function dataDecision(d, remote) {
  if (!remote) return FORCE_DATA ? { put: true } : { wait: "the store's list of this folder could not be read" };
  if (!remote.has(d.rel)) return { put: true };
  const stored = remote.get(d.rel);
  if (stored === d.sha256) return { same: true };
  const last = job.dataWritten[d.rel];
  if (FORCE_DATA || (last && stored === last)) return { put: true };
  return { protect: last ? "changed in the store since this script last wrote it; use --force-data to overwrite"
    : "differs from the store, and this script has no record of writing it; use --force-data to overwrite" };
}
function saveState() {
  for (const d of Object.keys(state.requests[BASE])) if (d < new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)) delete state.requests[BASE][d];
  const tmp = `${STATE_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1));
  try { renameSync(tmp, STATE_PATH); } catch { writeFileSync(STATE_PATH, JSON.stringify(state, null, 1)); }
}

/* Every Worker request goes through take(): one request = one unit of the account's day.
   `reserve` keeps room for the _reindex calls at the end. */
const budget = {
  run: 0,
  today() { return state.requests[BASE][utcDay()] || 0; },
  take(reserve = 0) {
    if (this.today() + 1 > MAX_REQ - reserve) return false;
    state.requests[BASE][utcDay()] = this.today() + 1;
    this.run++;
    saveState();
    return true;
  },
};

/* ---------- HTTP ---------- */

function httpRequest(method, url, { headers = {}, body, file, timeout = 120000 } = {}) {
  return new Promise((ok, no) => {
    const u = new URL(url);
    const mod = u.protocol === "https:" ? https : http;
    const h = { "user-agent": "floa-media-upload/1", ...headers };
    if (body != null && h["content-length"] == null) h["content-length"] = String(Buffer.byteLength(body));
    const req = mod.request(u, { method, headers: h });
    let settled = false, responded = false, src = null;
    const fail = (e) => { if (settled) return; settled = true; src?.destroy(); req.destroy(); no(e); };
    req.setTimeout(timeout, () => fail(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    /* The Worker answers some uploads (existing, 409) without reading the body. Once an
       answer is in, an error on the half-sent body is not a failure. */
    req.on("error", (e) => { if (!responded) fail(e); });
    req.on("response", (res) => {
      responded = true;
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", fail);
      res.on("end", () => {
        if (settled) return;
        settled = true;
        if (src && !src.readableEnded) { src.destroy(); req.destroy(); }
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        ok({ status: res.statusCode, headers: res.headers, json });
      });
    });
    if (file) { src = createReadStream(file); src.on("error", fail); src.pipe(req); }
    else req.end(body);
  });
}

const code = (r) => r?.json?.error?.code || null;

function retryDelay(attempt, res) {
  const ra = res?.headers?.["retry-after"];
  if (ra) {
    const s = Number(ra);
    const ms = Number.isFinite(s) ? s * 1000 : Date.parse(ra) - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, 60000);
  }
  return 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
}

/* ---------- sign-in ---------- */

const auth = { mode: null, access: null, exp: 0, refresh: null, gen: 0, inflight: null };

function readEnvFile() {
  const vars = {};
  try {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* no .env */ }
  return vars;
}

/* Rewrites one line of .env and keeps every other line as it was. */
function saveEnvVar(name, value) {
  let text = "";
  try { text = readFileSync(ENV_PATH, "utf8"); } catch { /* a new .env */ }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text === "" ? [] : text.split(/\r?\n/);
  const line = `${name}=${value}`;
  const re = new RegExp(`^\\s*${name}\\s*=`);
  let found = false;
  const out = lines.map((l) => (re.test(l) ? ((found = true), line) : l));
  if (!found) {
    if (out.length && out[out.length - 1] === "") out.splice(out.length - 1, 0, line);
    else out.push(line, "");
  }
  const tmp = `${ENV_PATH}.media-upload.tmp`;
  writeFileSync(tmp, out.join(eol));
  try { renameSync(tmp, ENV_PATH); } catch { writeFileSync(ENV_PATH, out.join(eol)); }
}

function jwtExp(t) {
  try { return JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("utf8")).exp || 0; } catch { return 0; }
}
const nowS = () => Math.floor(Date.now() / 1000);

function supabaseConfig() {
  const vars = readEnvFile();
  let url = process.env.SUPABASE_URL || vars.SUPABASE_URL;
  let anon = process.env.SUPABASE_ANON_KEY || vars.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    try {
      const src = readFileSync(join(ROOT, "apps/floa/domain/supabase.js"), "utf8");
      url ||= src.match(/url:\s*"([^"]+)"/)?.[1];
      anon ||= src.match(/anonKey:\s*"([^"]+)"/)?.[1];
    } catch { /* below */ }
  }
  if (!url || !anon) throw new Error("No Supabase URL or anon key (apps/floa/domain/supabase.js, or SUPABASE_URL and SUPABASE_ANON_KEY)");
  return { url: url.replace(/\/+$/, ""), anon };
}

/* Returns false when there are no credentials at all (and `optional`). */
async function initAuth(optional) {
  const pasted = process.env.MEDIA_ACCESS_TOKEN?.trim();
  if (pasted) {
    SECRETS.add(pasted);
    auth.mode = "pasted"; auth.access = pasted; auth.exp = jwtExp(pasted);
    if (auth.exp && auth.exp <= nowS()) fatal("MEDIA_ACCESS_TOKEN has expired. Paste a fresh one, or use MEDIA_REFRESH_TOKEN in .env.");
    if (auth.exp && auth.exp - nowS() < 900) warn("Note: MEDIA_ACCESS_TOKEN expires within 15 minutes. A run that outlives it stops and can be resumed.");
    return true;
  }
  const rt = readEnvFile().MEDIA_REFRESH_TOKEN || process.env.MEDIA_REFRESH_TOKEN;
  if (!rt) {
    if (optional) return false;
    fatal(`No credentials. Put MEDIA_REFRESH_TOKEN=<refresh token of a staff session> in ${ENV_PATH} (worker/MEDIA.md, "Signing in as staff"), or set MEDIA_ACCESS_TOKEN for this run.`);
  }
  SECRETS.add(rt);
  auth.mode = "refresh"; auth.refresh = rt;
  await refreshNow();
  return true;
}

/* One refresh at a time: a refresh token reused after 10 s revokes the whole session. */
function refreshNow() {
  if (!auth.inflight) auth.inflight = doRefresh().finally(() => { auth.inflight = null; });
  return auth.inflight;
}

async function doRefresh() {
  const { url, anon } = supabaseConfig();
  let res;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await httpRequest("POST", `${url}/auth/v1/token?grant_type=refresh_token`, {
        headers: { apikey: anon, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: auth.refresh }),
        timeout: 30000,
      });
      if (res.status < 500 || attempt >= 1) break;
    } catch (e) {
      if (attempt >= 1) throw new Error(`Supabase did not answer the refresh (${e.code || e.message})`);
    }
    await sleep(1000);
  }
  const j = res.json || {};
  if (res.status !== 200 || !j.access_token || !j.refresh_token) {
    const why = j.error_code || j.error || "";
    throw new Error(`Supabase refused the refresh token (HTTP ${res.status}${why ? `, ${why}` : ""}). Sign in again and put the new refresh_token in .env as MEDIA_REFRESH_TOKEN.`);
  }
  SECRETS.add(j.access_token); SECRETS.add(j.refresh_token);
  saveEnvVar("MEDIA_REFRESH_TOKEN", j.refresh_token);   // saved before the access token is used
  auth.refresh = j.refresh_token;
  auth.access = j.access_token;
  auth.exp = j.expires_at || jwtExp(j.access_token) || nowS() + (j.expires_in || 3600);
  auth.gen++;
}

async function token() {
  if (auth.mode === "refresh" && auth.exp - nowS() < 300) await refreshNow();
  return { tok: auth.access, gen: auth.gen };
}

/* ---------- the Worker: every call is one request of the day ---------- */

let stopping = null;           // {reason, hard}: hard = auth or config, nothing more is sent
function stop(reason, hard) {
  if (!stopping || (hard && !stopping.hard)) { stopping = { reason, hard }; warn(`Stopping: ${reason}`); }
}

async function workerCall(method, path, { headers = {}, body, file, reserve = 0 } = {}) {
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    if (stopping?.hard) return { stopped: true };
    if (!budget.take(reserve)) return { budget: true };
    let t;
    try { t = await token(); } catch (e) { stop(e.message, true); return { stopped: true }; }
    let res = null, err = null;
    try {
      res = await httpRequest(method, BASE + path, { headers: { ...headers, authorization: `Bearer ${t.tok}` }, body, file });
    } catch (e) { err = e; }
    if (res?.status === 401 && auth.mode === "refresh" && !refreshed) {
      refreshed = true;
      try { if (auth.gen === t.gen) await refreshNow(); } catch (e) { stop(e.message, true); return { stopped: true }; }
      attempt--;
      continue;
    }
    const transient = err || res.status === 429 || (res.status >= 500 && code(res) !== "not_configured");
    if (transient && attempt < RETRIES) {
      const wait = retryDelay(attempt, res);
      warn(`  retry ${attempt + 1}/${RETRIES} in ${(wait / 1000).toFixed(1)}s: ${method} ${path.split("?")[0]} (${err ? err.code || err.message : `HTTP ${res.status}${code(res) ? ` ${code(res)}` : ""}`})`);
      await sleep(wait);
      continue;
    }
    return err ? { error: err } : res;
  }
}

/* A refusal that every later request would get too stops the run. */
function stopIfFatal(r, what) {
  if (r.status === 401) return stop(`the store refused the token (${what}). Sign in again; the run resumes where it stopped.`, true), true;
  if (r.status === 403) return stop(`403 ${code(r) || ""} (${what}): the account is not staff of ${B}, or the origin is refused`, true), true;
  if ([404, 405, 501].includes(r.status)) return stop(`HTTP ${r.status} ${code(r) || ""} (${what}): the store is not on for ${B} at ${BASE}`, true), true;
  if (r.status === 411) return stop("411 length_required: the upload was sent without Content-Length", true), true;
  if (r.status === 503 && code(r) === "not_configured") return stop(`503 not_configured at ${BASE}: the Worker lacks a media binding, var or secret`, true), true;
  if (r.status === 413 && code(r) === "quota_exceeded") return stop(`413 quota_exceeded: the business is over its quota`, true), true;
  return false;
}

/* ---------- what the store already holds ---------- */

const knownPublic = new Set([...PUBLIC_GIVEN, ...job.public]), knownPrivate = new Set();
const isPresigned = (u) => typeof u === "string" && /X-Amz-|r2\.cloudflarestorage\.com/i.test(u);
function markVisibility(top, isPublic) {
  if (!isPublic) { knownPrivate.add(top); knownPublic.delete(top); job.public = job.public.filter((t) => t !== top); }
  else { knownPublic.add(top); knownPrivate.delete(top); if (!job.public.includes(top)) job.public.push(top); }
}
function learnFromUrl(top, url) { if (typeof url === "string") markVisibility(top, !isPresigned(url)); }
const reserveNow = (tops) => tops.filter((t) => !knownPrivate.has(t)).length;

/* Fills `remote` (key -> sha256) from the CDN index (free) or one Worker list per folder.
   Returns the folders it could not read. */
async function readRemote(tops, remote, canWorker, reserveTops) {
  const unread = [];
  for (const top of tops) {
    let got = false;
    if (CDN && !knownPrivate.has(top)) {
      let r = null;
      for (let a = 0; a < 2 && !r; a++) {
        try { r = await httpRequest("GET", `${CDN}/${B}/_index/${top}.json`, { timeout: 30000 }); } catch { await sleep(1000); }
      }
      if (r?.status === 200 && Array.isArray(r.json?.items)) {
        for (const it of r.json.items) if (it?.key) remote.set(it.key, it.sha256 || null);
        knownPublic.add(top);
        if (!job.public.includes(top)) job.public.push(top);
        got = true;
        say(`  ${pad(top, 8)} public index on the CDN: ${r.json.items.length} items (no Worker request)`);
      }
    }
    if (got) continue;
    if (!canWorker) { unread.push(top); continue; }
    let cursor = null, n = 0;
    const limit = knownPublic.has(top) ? 1000 : 200;
    do {
      const q = `?prefix=${encodeURIComponent(`${top}/`)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const r = await workerCall("GET", `/media/${B}/${q}`, { reserve: reserveNow(reserveTops) });
      if (r.budget) { stop(`the daily budget of ${MAX_REQ} Worker requests is reached`, false); unread.push(top); break; }
      if (r.stopped) { unread.push(top); break; }
      if (r.error) { warn(`  ${top}: the list failed (${r.error.code || r.error.message})`); unread.push(top); break; }
      if (r.status !== 200 || !Array.isArray(r.json?.items)) {
        if (!stopIfFatal(r, `list ${top}/`)) warn(`  ${top}: the list answered HTTP ${r.status} ${code(r) || ""}`);
        unread.push(top);
        break;
      }
      for (const it of r.json.items) { if (it?.key) remote.set(it.key, it.sha256 || null); learnFromUrl(top, it?.url); n++; }
      cursor = r.json.cursor || null;
    } while (cursor);
    if (!unread.includes(top)) say(`  ${pad(top, 8)} Worker list: ${n} items${knownPrivate.has(top) ? " (private)" : knownPublic.has(top) ? " (public)" : ""}`);
  }
  return unread;
}

/* The data files of one top folder: they are in no index and no ordinary list, so one staff
   list of exactly <top>/_data/ (public or private). Returns key -> sha256, or null. */
async function listData(top) {
  const remote = new Map();
  let cursor = null;
  do {
    const q = `?prefix=${encodeURIComponent(`${top}/_data/`)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const r = await workerCall("GET", `/media/${B}/${q}`);
    if (r.budget) { stop(`the daily budget of ${MAX_REQ} Worker requests is reached`, false); return null; }
    if (r.stopped) return null;
    if (r.error) { warn(`  ${top}/_data/: the list failed (${r.error.code || r.error.message})`); return null; }
    if (r.status !== 200 || !Array.isArray(r.json?.items)) {
      if (!stopIfFatal(r, `list ${top}/_data/`)) warn(`  ${top}/_data/: the list answered HTTP ${r.status} ${code(r) || ""}`);
      return null;
    }
    for (const it of r.json.items) if (it?.key) { remote.set(it.key, it.sha256 || null); learnFromUrl(top, it.url); }
    cursor = r.json.cursor || null;
  } while (cursor);
  say(`  ${pad(`${top}/_data/`, 14)} staff list: ${remote.size} data files${knownPrivate.has(top) ? " (private: presigned URLs)" : knownPublic.has(top) ? " (public)" : ""}`);
  return remote;
}

/* ---------- dry run ---------- */

async function dryRun(p) {
  const pool = HASH_ALL ? p.plan : sample(p.plan, SAMPLE);
  let match = 0, bytes = 0;
  const bad = [];
  for (const it of pool) {
    const got = await sha256File(it.abs);
    bytes += it.bytes;
    if (got === it.sha256) match++; else bad.push(it.rel);
  }
  say(`\nsha256 check (${HASH_ALL ? "every file" : `a sample of ${pool.length}, spread over the folders`}, ${mb(bytes)} hashed): ${match} match, ${bad.length} mismatch`);
  for (const k of bad) say(`  sha256 mismatch, would be skipped: ${k}`);

  const pending = p.plan.filter((it) => job.done[it.rel] !== it.sha256);
  const earlier = p.plan.length - pending.length;
  if (earlier) say(`Done in an earlier run (progress file): ${earlier}`);

  if (LIST) {
    say("\nWhat the store holds");
    const canWorker = await initAuth(true).catch((e) => fatal(e.message));
    const remote = new Map();
    const unread = await readRemote(p.tops, remote, canWorker, []);
    if (unread.length) say(`  not read: ${unread.join(", ")}${canWorker ? "" : " (no credentials: only the CDN indexes were read)"}`);
    let same = 0;
    const clash = [];
    for (const it of pending) {
      if (!remote.has(it.rel)) continue;
      if (remote.get(it.rel) === it.sha256) same++; else clash.push(it.rel);
    }
    say(`  already there with the same bytes: ${same}`);
    say(`  same name, other bytes (would be refused, name_taken): ${clash.length}`);
    for (const k of clash.slice(0, 10)) say(`      ${k}`);
    if (p.data.length && !canWorker) say("  data files: not read (they need a staff list, even in a public folder)");
    else for (const top of p.dataTops) {
      const remote = await listData(top);
      if (!remote) continue;
      const mine = p.data.filter((d) => d.top === top);
      const ds = mine.map((d) => dataDecision(d, remote));
      const fresh = mine.filter((d) => !remote.has(d.rel)).length;
      say(`      ${ds.filter((x) => x.same).length} the same (skipped), ${ds.filter((x) => x.put).length - fresh} updates (the old version to the trash), ${fresh} new, ${ds.filter((x) => x.protect).length} protected`);
      mine.forEach((d, j) => { if (ds[j].protect) say(`      ${d.rel}: ${ds[j].protect}`); });
    }
    if (budget.run) say(`  Worker requests: ${budget.run} (${budget.today()} today UTC)`);
  } else say("Collisions with what is already in the store: not checked (add --list)");

  const lists = p.tops.length;
  const need = 1 + pending.length + lists + p.tops.length + p.dataTops.length + p.data.length;
  say(`\nA --run would make at most ${need} Worker requests before retries: 1 _admin, ${pending.length} uploads, ${lists} lists (none for a folder whose public index is on the CDN), up to ${p.tops.length} _reindex, ${p.dataTops.length} data lists and up to ${p.data.length} data PUTs.`);
  say(`Budget: ${MAX_REQ} a day (--max-requests), ${budget.today()} used today (UTC ${utcDay()}). The spec: run it right after 00:00 UTC.`);
}

function sample(plan, n) {
  const byTop = new Map();
  for (const it of plan) { const g = byTop.get(it.top) || []; g.push(it); byTop.set(it.top, g); }
  const per = Math.max(1, Math.ceil(n / Math.max(1, byTop.size)));
  const out = [];
  for (const g of byTop.values()) {
    const k = Math.min(per, g.length);
    for (let j = 0; j < k; j++) out.push(g[Math.floor((j * g.length) / k)]);
  }
  return out.slice(0, n);
}

/* ---------- the run ---------- */

async function run(p) {
  const res = { uploaded: [], existing: 0, fromList: 0, fromState: 0, refused: [], failed: [], skipped: [], notAttempted: 0 };
  let work = [];
  for (const it of p.plan) {
    if (job.done[it.rel] === it.sha256) { res.fromState++; continue; }
    const r = job.refused[it.rel];
    if (r && r.sha256 === it.sha256 && !flags["retry-refused"]) { res.refused.push({ rel: it.rel, code: `${r.code} (earlier run)` }); continue; }
    work.push(it);
  }
  /* Every pending file is hashed before anything is sent, so a mismatch costs no request
     and a re-run with nothing left to do makes no Worker request at all. */
  if (work.length) {
    const total = work.reduce((s, it) => s + it.bytes, 0);
    say(`\nHashing ${work.length} pending files (${mb(total)})`);
    const ok = [];
    for (const it of work) {
      let got;
      try { got = await sha256File(it.abs); } catch (e) { res.skipped.push({ rel: it.rel, why: `unreadable (${e.code || e.message})` }); continue; }
      if (got === it.sha256) ok.push(it); else res.skipped.push({ rel: it.rel, why: "sha256 mismatch (the file is not the manifest's)" });
    }
    say(`  ${ok.length} match, ${work.length - ok.length} skipped`);
    work = ok;
  }
  const workTops = [...new Set(work.map((it) => it.top))].sort();
  const pendingIndex = [...new Set(job.reindex)].filter((t) => !ONLY.length || ONLY.includes(t));

  const dataRes = { written: 0, replaced: 0, same: 0, refused: [], failed: [], protected: [], waiting: 0 };
  if (work.length || pendingIndex.length || p.data.length) {
    await initAuth(false).catch((e) => fatal(e.message));
    say(`\nSigned in (${auth.mode === "refresh" ? "MEDIA_REFRESH_TOKEN, rotated and saved" : "MEDIA_ACCESS_TOKEN"}). Checking staff`);
    const reserveTops = [...new Set([...workTops, ...pendingIndex])];
    const a = await workerCall("GET", `/media/${B}/_admin`, { reserve: reserveNow(reserveTops) });
    if (a.budget) stop(`the daily budget of ${MAX_REQ} Worker requests is reached`, false);
    else if (a.error) stop(`the Worker did not answer (${a.error.code || a.error.message})`, true);
    else if (!a.stopped && !stopIfFatal(a, "_admin")) {
      if (a.status !== 200) stop(`_admin answered HTTP ${a.status} ${code(a) || ""}`, true);
      else if (!a.json?.admin) stop(`the signed-in account is not staff of ${B} (_admin: admin false)`, true);
      else {
        say(`  staff of ${B}${a.json.owner ? " (owner)" : ""}`);
        /* Revision 5: _admin names the public top folders, so nothing has to be guessed. */
        if (Array.isArray(a.json.public_folders)) {
          for (const t of new Set([...p.tops, ...p.dataTops, ...pendingIndex])) markVisibility(t, a.json.public_folders.includes(t));
          say(`  public folders: ${a.json.public_folders.join(", ") || "none"}`);
        }
      }
    }

    if (!stopping && work.length) {
      say("\nWhat the store holds");
      const remote = new Map();
      const unread = await readRemote(workTops, remote, true, reserveTops);
      if (unread.length && !stopping) say(`  not read: ${unread.join(", ")}: their entries are sent, and the store answers existing for what it holds`);
      work = work.filter((it) => {
        if (!remote.has(it.rel)) return true;
        if (remote.get(it.rel) === it.sha256) { res.fromList++; job.done[it.rel] = it.sha256; return false; }
        res.refused.push({ rel: it.rel, code: "name_taken (seen in the list, not sent)" });
        return false;
      });
      saveState();
    }

    if (!stopping && work.length) {
      say(`\nUploading ${work.length} files (${mb(work.reduce((s, it) => s + it.bytes, 0))}), ${CONC} at once`);
      const blocked = new Set();
      let i = 0, streak = 0, doneCount = 0;
      const one = async (it) => {
        if (blocked.has(it.top)) { res.notAttempted++; return; }
        const r = await workerCall("PUT", `/media/${B}/${it.rel}`, {
          headers: { "content-type": it.mime, "content-length": String(it.bytes), "x-media-meta": it.metaHeader, "x-media-index": "defer" },
          file: it.abs,
          reserve: reserveNow(reserveTops),
        });
        if (r.budget) { stop(`the daily budget of ${MAX_REQ} Worker requests is reached`, false); res.notAttempted++; return; }
        if (r.stopped) { res.notAttempted++; return; }
        if (r.error) {
          res.failed.push({ rel: it.rel, why: r.error.code || r.error.message });
          if (++streak >= 3) stop("3 files in a row failed after their retries", false);
          return;
        }
        if ((r.status === 201 || r.status === 200) && r.json?.ok !== false) {
          streak = 0;
          learnFromUrl(it.top, r.json?.url);
          if (r.json?.existing) res.existing++; else res.uploaded.push(it);
          job.done[it.rel] = it.sha256;
          delete job.refused[it.rel];
          if (!knownPrivate.has(it.top) && !job.reindex.includes(it.top)) job.reindex.push(it.top);
          saveState();
          doneCount++;
          if (doneCount % 25 === 0) say(`  ${doneCount} of ${work.length} done, ${budget.run} Worker requests so far`);
          return;
        }
        if (stopIfFatal(r, `PUT ${it.rel}`)) { res.notAttempted++; return; }
        const c = code(r);
        if (r.status === 409 && c === "folder_moving") {
          if (!blocked.has(it.top)) warn(`  ${it.top}/ is being moved between buckets: its files wait for a later run`);
          blocked.add(it.top); res.notAttempted++; return;
        }
        if ([400, 409, 413, 415].includes(r.status)) {
          streak = 0;
          res.refused.push({ rel: it.rel, code: `${r.status} ${c || ""}`.trim() });
          job.refused[it.rel] = { sha256: it.sha256, code: c || String(r.status) };
          saveState();
          return;
        }
        res.failed.push({ rel: it.rel, why: `HTTP ${r.status} ${c || ""}`.trim() });
        if (++streak >= 3) stop("3 files in a row failed after their retries", false);
      };
      await Promise.all(Array.from({ length: Math.min(CONC, work.length) }, async () => {
        while (i < work.length) {
          const it = work[i++];
          if (stopping) { res.notAttempted++; continue; }
          await one(it);
        }
      }));
    } else if (stopping) res.notAttempted += work.length;

    /* The index was deferred on every upload: one _reindex per public top folder. */
    const toIndex = [...new Set(job.reindex)].filter((t) => (!ONLY.length || ONLY.includes(t)) && !knownPrivate.has(t));
    if (toIndex.length && !stopping?.hard) {
      say("");
      for (const top of toIndex) {
        if (stopping?.hard) break;
        const r = await workerCall("POST", `/media/${B}/_reindex`, { headers: { "content-type": "application/json" }, body: JSON.stringify({ folder: top }) });
        const drop = () => { job.reindex = job.reindex.filter((t) => t !== top); saveState(); };
        if (r.status === 200 && r.json?.ok !== false) { drop(); say(`  _reindex ${top}: ok`); continue; }
        /* A folder that turned out not to be public has no index to rewrite. */
        if (r.status === 400 && !knownPublic.has(top)) { drop(); say(`  _reindex ${top}: refused (${code(r) || 400}), taken as a private folder`); continue; }
        if (r.status) stopIfFatal(r, `_reindex ${top}`);
        say(`  _reindex ${top}: ${r.budget ? "no budget left" : r.error ? r.error.code || r.error.message : r.status ? `HTTP ${r.status} ${code(r) || ""}` : "not sent"}. It stays pending: the next run calls it.`);
      }
    }

    /* Data files go last, after the media they reference is stored and indexed. If any media
       of this run failed or was not sent, they wait for the next run. A PUT overwrites (the
       old version goes to the trash), so a file is skipped only when the stored sha256 matches. */
    if (p.data.length && !stopping?.hard) {
      const held = stopping ? stopping.reason : res.failed.length ? `${res.failed.length} media files failed`
        : res.notAttempted ? `${res.notAttempted} media files were not sent` : null;
      if (held) {
        dataRes.waiting = p.data.length;
        say(`\nData files wait for their media (${held}): ${p.data.length} not sent. The next run sends them.`);
      } else {
        say("\nData files (after the media)");
        for (const top of p.dataTops) {
          const remote = await listData(top);
          for (const d of p.data.filter((x) => x.top === top)) {
            if (stopping) { dataRes.waiting++; continue; }
            const dec = dataDecision(d, remote);
            if (dec.same) {
              dataRes.same++;
              if (job.dataWritten[d.rel] !== d.sha256) { job.dataWritten[d.rel] = d.sha256; saveState(); }
              continue;
            }
            if (dec.protect) { dataRes.protected.push({ rel: d.rel, why: dec.protect }); say(`  ${d.rel}: not sent, ${dec.protect}`); continue; }
            if (dec.wait) { dataRes.waiting++; say(`  ${d.rel}: not sent, ${dec.wait}`); continue; }
            const r = await workerCall("PUT", `/media/${B}/${d.rel}`, {
              headers: { "content-type": d.mime, "content-length": String(d.bytes), "x-media-meta": d.metaHeader },
              file: d.abs,
            });
            if (r.budget) { stop(`the daily budget of ${MAX_REQ} Worker requests is reached`, false); dataRes.waiting++; continue; }
            if (r.stopped) { dataRes.waiting++; continue; }
            if (r.error) { dataRes.failed.push({ rel: d.rel, why: r.error.code || r.error.message }); continue; }
            if ((r.status === 201 || r.status === 200) && r.json?.ok !== false) {
              learnFromUrl(top, r.json?.url);
              job.dataWritten[d.rel] = d.sha256;
              saveState();
              dataRes.written++;
              if (r.json?.replaced) dataRes.replaced++;
              say(`  ${d.rel}: written${r.json?.replaced ? " (the previous version is in the trash)" : ""}`);
              continue;
            }
            if (stopIfFatal(r, `PUT ${d.rel}`)) { dataRes.waiting++; continue; }
            if ([400, 409, 413, 415].includes(r.status)) dataRes.refused.push({ rel: d.rel, code: `${r.status} ${code(r) || ""}`.trim() });
            else dataRes.failed.push({ rel: d.rel, why: `HTTP ${r.status} ${code(r) || ""}`.trim() });
          }
        }
      }
    } else if (p.data.length) dataRes.waiting = p.data.length;
  }

  say("\nResult");
  const upBytes = res.uploaded.reduce((s, it) => s + it.bytes, 0);
  say(`  uploaded          ${lpad(res.uploaded.length, 5)}   ${mb(upBytes)}`);
  say(`  already there     ${lpad(res.fromList + res.fromState + res.existing, 5)}   (${res.fromList} seen in the list, ${res.fromState} done in an earlier run, ${res.existing} answered existing)`);
  say(`  refused           ${lpad(res.refused.length, 5)}`);
  for (const r of res.refused.slice(0, 30)) say(`      ${r.rel}  ${r.code}`);
  say(`  failed            ${lpad(res.failed.length, 5)}`);
  for (const f of res.failed.slice(0, 30)) say(`      ${f.rel}  ${f.why}`);
  say(`  skipped           ${lpad(p.skipped.length + res.skipped.length, 5)}   (${p.skipped.length} by the plan above${res.skipped.length ? `, ${res.skipped.length} at upload` : ""})`);
  for (const s of res.skipped.slice(0, 30)) say(`      ${s.rel}  ${s.why}`);
  say(`  not attempted     ${lpad(res.notAttempted, 5)}`);
  if (job.reindex.length) say(`  _reindex pending: ${job.reindex.join(", ")}`);
  if (p.data.length) {
    say(`  data files        ${lpad(p.data.length, 5)}   (${dataRes.written} written, ${dataRes.replaced} of them over an older version; ${dataRes.same} already the same; ${dataRes.protected.length} protected; ${dataRes.refused.length} refused; ${dataRes.failed.length} failed; ${dataRes.waiting} waiting)`);
    for (const r of [...dataRes.protected, ...dataRes.refused, ...dataRes.failed]) say(`      ${r.rel}  ${r.code || r.why}`);
  }
  say(`\nWorker requests: ${budget.run} this run, ${budget.today()} today (UTC ${utcDay()}) of ${MAX_REQ}`);
  if (stopping) say(`Stopped: ${stopping.reason}. Run the same command again to continue.`);
  process.exitCode = stopping || res.failed.length || dataRes.failed.length ? 1 : 0;
}

/* ---------- main ---------- */

let sigint = 0;
process.on("SIGINT", () => {
  if (++sigint > 1) process.exit(130);
  stop("interrupted (Ctrl+C again to quit at once); uploads in flight finish", false);
});

const p = buildPlan();
const summary = printPlan(p);
p.tops = summary.tops;
p.dataTops = summary.dataTops;
if (flags.test) say("\nNote: per worker/MEDIA.md the test Worker binds no media buckets by default, so /media/ answers 503 there.");
try {
  if (RUN) await run(p); else await dryRun(p);
} catch (e) {
  fatal(`media-upload failed: ${e.message}`);
}
