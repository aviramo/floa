#!/usr/bin/env node
/* ==========================================================================
   FLOA dev server: every app, on the PC and on the phone (home network).

     node scripts/dev.mjs                 build everything once, serve, rebuild on change
     node scripts/dev.mjs --port=8080     the main port (default 80: http://localhost)
     node scripts/dev.mjs --apps-from=8081  the first per-app port (default 8081, or main + 1 with another --port)
     node scripts/dev.mjs --no-build      serve the dist/ there is, no first build
     node scripts/dev.mjs --reload        the browser reloads by itself after each rebuild

   THE MAIN PORT is what `node build.mjs --serve` was: floa.co.il at /, every
   app under its folder or its sub-domain name (/biodanza/, /aum/), links to
   https://<app>.floa.co.il rewritten to /<app>/.

   ONE PORT PER CLEAN HOST of domains.json (in the file's order): that port IS
   the app's host, so root paths (/supabase.js, /images/x.png) resolve as on
   biodanza.floa.co.il. It answers the way functions/_middleware.js does: the
   app's file, else a domain root file (DOMAIN_FILES, read from the middleware
   itself), else another app's folder goes to that app's port, else the app's
   front page (spa) or its 404. One dev difference: an address under the app's
   own folder (/biodanza/...) is served in place, not sent on to "/", because on
   a local host Biodanza and Chatbot live under their folder.

   /supabase.js on an app port: supabase.js picks the schema by the host's first
   label, or on a local host by the first folder of the path. On a port the host
   is "localhost" or an IP, so the copy served THERE says which app the port is,
   and only when supabase.js itself found the host local: `local` is never
   touched, so test/real (roster -> roster-test on a local host) is decided
   exactly as before. The file on disk does not change.

   NOTHING IS CACHED: every answer is no-store, and every sw.js (any app, any
   port) is a tiny worker that clears the caches and removes itself, so a
   service worker can never hide a change.

   Rebuilds run `node build.mjs` as a child process: apps/<key>/ -> --only=<key>;
   ui/ and apps/floa/domain/ -> --only=floa (the root business copies the domain
   and the kit); src/, build.mjs, domains.json -> a full build.
   ========================================================================== */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, readdirSync, statSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const argv = process.argv.slice(2);
const opt = (name, def) => { const a = argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : def; };
const flag = (name) => argv.includes(`--${name}`);
const MAIN = Number(opt("port", 80));
const FIRST = Number(opt("apps-from", MAIN === 80 ? 8081 : MAIN + 1));
const RELOAD = flag("reload");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".woff2": "font/woff2", ".woff": "font/woff", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg",
  ".wav": "audio/wav", ".mp4": "video/mp4", ".webm": "video/webm", ".pdf": "application/pdf", ".wasm": "application/wasm",
};

/* --- what production does, read from the files that define it ------------- */
const MW = readFileSync(join(ROOT, "functions", "_middleware.js"), "utf8");
const DOMAIN_FILES = new Set(JSON.parse((MW.match(/const DOMAIN_FILES = new Set\((\[[^\]]*\])\)/) || [])[1] || "[]"));
const NOT_FOUND = (MW.match(/const NOT_FOUND = '([^']*)'/) || [])[1] || "<!doctype html><title>404</title>";
if (!DOMAIN_FILES.size) console.warn("  ! DOMAIN_FILES not found in functions/_middleware.js: app ports will not fall back to the domain root");

let CFG;
function config() {
  const map = JSON.parse(readFileSync(join(ROOT, "domains.json"), "utf8"));
  const hosts = map.hosts.filter((h) => h.enabled !== false && h.folder);
  const apps = [], byFolder = new Map();
  for (const h of hosts.filter((x) => x.clean)) {
    const label = h.host.split(".")[0], had = byFolder.get(h.folder);
    if (had) { had.aliases.push(label); continue; }   /* a test copy of the same folder (roster-test) is the same thing locally */
    const app = { label, aliases: [label], host: h.host, folder: h.folder, home: "/" + h.folder, icons: h.icons || {}, spa: !!h.spa, slugs: !!h.slugs, port: FIRST + apps.length };
    apps.push(app); byFolder.set(h.folder, app);
  }
  const live = hosts.filter((h) => !h.test && !h.preview);   /* as functions/_middleware.js: neither is a target of the old-address redirects */
  const old = live.flatMap((h) => [h.folder, ...(h.old || [])].map((f) => ["/" + f.replace(/\/$/, ""), h.host])).sort((a, b) => b[0].length - a[0].length);
  /* the main port, as build.mjs serve() has it */
  const names = live.map((h) => [h.host.split(".")[0], h.folder.replace(/\/?$/, "/")]).filter(([l, f]) => f !== l + "/" && !existsSync(join(DIST, l)));
  const mainLabels = live.map((h) => h.host.split(".")[0]);
  const appLabels = apps.flatMap((a) => a.aliases);
  return {
    apps, old, names,
    devSpa: hosts.filter((h) => h.devSpa).map((h) => h.folder.replace(/\/$/, "")),
    mainLinks: mainLabels.length ? new RegExp("https://(" + mainLabels.join("|") + ")\\.floa\\.co\\.il/?", "g") : null,
    appLinks: appLabels.length ? new RegExp("https://(" + appLabels.join("|") + ")\\.floa\\.co\\.il/?", "g") : null,
    portOf: Object.fromEntries(apps.flatMap((a) => a.aliases.map((l) => [l, a.port]))),
    appOfHost: Object.fromEntries(hosts.map((h) => [h.host, byFolder.get(h.folder)]).filter(([, a]) => a)),
  };
}

/* --- dev-only answers ------------------------------------------------------ */
const DEV_SW = `/* FLOA dev server: not the app's service worker. It clears every cache and removes itself, so nothing is served from a cache in dev. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.matchAll({ type: "window" }); })
    .then(function (cs) { return self.registration.unregister().then(function () { cs.forEach(function (c) { c.navigate(c.url); }); }); }));
});
`;
/* matchAll without includeUncontrolled lists only pages an OLDER worker was controlling: they are loaded once more, uncontrolled. A page
   that registers this worker on every load is never controlled by it, so it is never reloaded by it: no loop. */
const RELOAD_JS = `(function(){try{var s=new EventSource("/__dev/events");s.onmessage=function(e){if(e.data==="reload")location.reload();};}catch(e){}})();\n`;
const listeners = new Set();
const broadcast = () => { for (const r of listeners) r.write("data: reload\n\n"); };

/* --- dist/, which a build swaps in while this serves ----------------------- */
const swapping = () => !existsSync(DIST) || readdirSync(ROOT).some((n) => n.startsWith("dist.swap-"));
const settled = async () => { for (let t = 0; t < 300 && swapping(); t++) await sleep(10); };
async function fileAt(p) {
  const file = resolve(DIST, "." + p);
  if (file !== DIST && !file.startsWith(DIST + sep)) return null;
  for (let i = 0; i < 2; i++) {
    try { if (statSync(file).isFile()) return { file, body: await readFile(file) }; } catch { /* not there (yet) */ }
    if (i === 0) { if (!swapping()) return null; await settled(); }
  }
  return null;
}
const hasIndex = (p) => existsSync(join(resolve(DIST, "." + p), "index.html"));

/* --- answers --------------------------------------------------------------- */
function send(cx, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  cx.res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...extra });
  cx.res.end(cx.req.method === "HEAD" ? undefined : body);
}
const redirect = (cx, status, location) => send(cx, status, "", "text/plain", { location });

function sendFile(cx, f, status = 200) {
  const ext = extname(f.file).toLowerCase();
  let body = f.body;
  if (ext === ".html") {
    let html = body.toString("utf8");
    if (cx.app && CFG.appLinks) html = html.replace(CFG.appLinks, (m, l) => `http://${cx.hostname}:${CFG.portOf[l]}/`);
    else if (!cx.app && CFG.mainLinks) html = html.replace(CFG.mainLinks, (m, l) => "/" + l + "/");
    if (RELOAD) html = html.includes("</head>") ? html.replace("</head>", '<script src="/__dev/reload.js"></script></head>') : html.replace(/<head[^>]*>/i, (m) => m + '<script src="/__dev/reload.js"></script>');
    body = html;
  } else if (cx.app && basename(f.file) === "supabase.js") {
    body = shim(body.toString("utf8"), cx.app);
  }
  send(cx, status, body, TYPES[ext] || "application/octet-stream");
}

/* the app port is the app's host (see the top of the file); `local` is supabase.js's own and stays its own */
const LABEL = 'var label = host.split(".")[0];', FOLDER = "var folder = local ||";
let shimWarned = false;
function shim(js, app) {
  if (!js.includes(LABEL) || !js.includes(FOLDER)) {
    if (!shimWarned) { shimWarned = true; console.warn("  ! supabase.js changed: on the app ports it is served as it is, so apps there may get no schema"); }
    return js;
  }
  return js.replace(LABEL, `var label = local ? ${JSON.stringify(app.label)} : host.split(".")[0];   /* dev server: this port is ${app.host} */`)
    .replace(FOLDER, "var folder = false ||");
}

/* the main port: build.mjs serve(), unchanged in what it answers */
async function mainServe(cx, path) {
  for (const [label, folder] of CFG.names) {
    if (path === "/" + label) return redirect(cx, 301, "/" + label + "/" + cx.url.search);
    if (path.startsWith("/" + label + "/")) { path = "/" + folder + path.slice(label.length + 2); break; }
  }
  return staticServe(cx, path);
}
async function staticServe(cx, asked) {
  let path = asked;
  if (path.endsWith("/")) path += "index.html";
  if (!extname(path) && hasIndex(path)) return redirect(cx, 301, cx.url.pathname + "/" + cx.url.search);
  const f = await fileAt(path);
  if (f) return sendFile(cx, f);
  const spa = CFG.devSpa.find((s) => asked === "/" + s || asked.startsWith("/" + s + "/"));
  if (spa && !extname(asked)) { const s = await fileAt("/" + spa + "/index.html"); if (s) return sendFile(cx, s); }
  const nf = await fileAt("/404.html");
  return nf ? sendFile(cx, nf, 404) : send(cx, 404, "not found");
}

/* an app port: functions/_middleware.js for that host */
async function appServe(cx, app, p) {
  if (p === "/robots.txt") return send(cx, 200, "User-agent: *\nDisallow: /\n");
  const icon = app.icons[p];
  if (icon) { const f = await fileAt(icon.startsWith("/") ? icon : app.home + icon); if (f) return sendFile(cx, f); }
  if (p.startsWith(app.home) || p === app.home.slice(0, -1)) return staticServe(cx, p);   /* dev difference, see the top */
  if (app.slugs) {
    const seg = p.replace(/^\/+|\/+$/g, "").split("/"), slug = (seg[0] || "").toLowerCase(), sub = (seg[1] || "").toLowerCase();
    const PAGES = { "": "admin", connect: "connect", me: "me" };
    if (/^[a-z][a-z0-9-]{1,39}$/.test(slug) && !["admin", "connect", "me", "api", "assets", "new", "index"].includes(slug) && seg.length <= 2 && Object.hasOwn(PAGES, sub)) {
      if (sub === "") {
        const page = await fileAt(app.home + "admin/index.html");
        if (page) { page.body = Buffer.from(page.body.toString("utf8").replace(/<head[^>]*>/i, (m) => m + '<base href="/admin/">')); return sendFile(cx, page); }
      }
      const qs = cx.url.search.replace(/^\?/, "");
      return redirect(cx, 307, "/" + PAGES[sub] + "/?biz=" + slug + (qs ? "&" + qs : ""));
    }
  }
  let q = app.home.slice(0, -1) + p;
  if (q.endsWith("/")) q += "index.html";
  if (!extname(q) && hasIndex(q)) return redirect(cx, 301, p + "/" + cx.url.search);
  const own = (await fileAt(q)) || (!extname(q) ? await fileAt(q + ".html") : null);
  if (own) return sendFile(cx, own);
  if (DOMAIN_FILES.has(p) || p.startsWith("/floa/")) { const f = await fileAt(p); if (f) return sendFile(cx, f); }
  for (const [folder, host] of CFG.old) {
    if (host !== app.host && (p === folder || p.startsWith(folder + "/"))) {
      const to = CFG.appOfHost[host], rest = p.slice(folder.length);
      return redirect(cx, 301, to ? `http://${cx.hostname}:${to.port}${rest || "/"}${cx.url.search}` : `http://${cx.hostname}:${MAIN}${folder}${rest}${cx.url.search}`);
    }
  }
  if (app.spa && !extname(p)) { const s = await fileAt(app.home + "index.html"); if (s) return sendFile(cx, s); }
  const nf = await fileAt(app.home + "404.html");
  return nf ? sendFile(cx, nf, 404) : send(cx, 404, NOT_FOUND, "text/html; charset=utf-8");
}

function handler(label) {
  return async (req, res) => {
    const cx = { req, res };
    try {
      await settled();
      cx.url = new URL(req.url.replace(/^\/{2,}/, "/"), "http://x");
      cx.hostname = new URL("http://" + (req.headers.host || "localhost")).hostname;
      cx.app = label ? CFG.apps.find((a) => a.label === label) : null;
      if (label && !cx.app) return send(cx, 404, "this app is no longer in domains.json");
      let path;
      try { path = decodeURIComponent(cx.url.pathname); } catch { return send(cx, 400, "bad request"); }
      if (path === "/__dev/events") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        res.write(": dev\n\n"); listeners.add(res); req.on("close", () => listeners.delete(res)); return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") return send(cx, 405, "method");
      if (path === "/__dev/reload.js") return send(cx, 200, RELOAD_JS, TYPES[".js"]);
      if (basename(path) === "sw.js") return send(cx, 200, DEV_SW, TYPES[".js"]);
      return cx.app ? await appServe(cx, cx.app, path) : await mainServe(cx, path);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) send(cx, 500, "dev server error");
    }
  };
}

/* --- rebuilds ------------------------------------------------------------- */
const SKIP_DIRS = new Set(["node_modules", "audit", "test", "runner", "docs"]);
function targetOf(top, rel) {
  const parts = rel.replaceAll("\\", "/").split("/").filter(Boolean);
  if (!parts.length || parts.some((s) => s.startsWith(".") || s === "node_modules")) return null;
  if (/\.(md|sql|log)$/i.test(rel)) return null;
  if (top === "src") return "*";
  if (top === "ui") return SKIP_DIRS.has(parts[0]) ? null : "floa";
  if (top === "apps") return parts.length > 1 && SKIP_DIRS.has(parts[1]) ? null : parts[0];
  return null;
}
let pending = new Set(), timer = null, running = false;
function queue(target, why) {
  if (!target) return;
  if (!pending.size) console.log(`  ~ ${why}`);
  pending.add(target);
  clearTimeout(timer);
  timer = setTimeout(runBuilds, 150);
}
function build(args) {
  return new Promise((done) => {
    const t = Date.now(), out = [];
    const c = spawn(process.execPath, ["build.mjs", ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    c.stdout.on("data", (d) => out.push(d)); c.stderr.on("data", (d) => out.push(d));
    c.on("close", (code) => {
      const what = args.length ? args[0].slice(7) : "everything";
      if (code === 0) console.log(`  built ${what} in ${((Date.now() - t) / 1000).toFixed(1)}s`);
      else console.log(`  BUILD FAILED (${what}); dist/ is as it was:\n` + Buffer.concat(out).toString("utf8").split("\n").slice(-25).join("\n"));
      done(code === 0);
    });
  });
}
async function runBuilds() {
  if (running || !pending.size) return;
  running = true;
  const jobs = pending.has("*") ? ["*"] : [...pending];
  pending = new Set();
  let ok = true;
  for (const j of jobs) ok = (await build(j === "*" ? [] : ["--only=" + j])) && ok;
  if (jobs.includes("*")) {
    const before = CFG.apps.map((a) => a.label + a.port).join();
    CFG = config();
    if (CFG.apps.map((a) => a.label + a.port).join() !== before) console.log("  ! domains.json changed the app ports: restart the dev server to open them");
  }
  running = false;
  if (ok && RELOAD) broadcast();
  if (pending.size) runBuilds();
}
function watchAll() {
  /* a file that is gone (deleted, renamed) takes a full build: an --only build starts from a copy of dist/ and would keep it */
  for (const top of ["src", "apps", "ui"]) watch(join(ROOT, top), { recursive: true }, (_e, f) => {
    const t = f && targetOf(top, f);
    if (t) queue(existsSync(join(ROOT, top, f)) ? t : "*", `${top}/${String(f).replaceAll("\\", "/")}`);
  });
  watch(ROOT, (_e, f) => { if (f === "build.mjs" || f === "domains.json") queue("*", f); });
}

/* --- the phone ------------------------------------------------------------- */
function lanIp() {
  const all = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === "IPv4" && !n.internal && !n.address.startsWith("169.254."));
  return (all.find((n) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address)) || all[0] || {}).address || null;
}
/* the local-host test of a file, as it is written there, tried on the LAN address */
function localRule(file, find) {
  try { const m = readFileSync(join(ROOT, file), "utf8").match(find); return m ? new RegExp(m[1]) : null; } catch { return null; }
}

/* --- start ------------------------------------------------------------------ */
async function start() {
  if (!flag("no-build")) { console.log("  building everything once ..."); await build([]); }
  CFG = config();
  const ip = lanIp();
  const pad = (s, n) => String(s).padEnd(n);
  const rows = [["all apps (floa.co.il, /<app>/)", MAIN], ...CFG.apps.map((a) => [a.aliases.join(", "), a.port])];
  const opened = await Promise.all(rows.map(([, port], i) => new Promise((ok) => {
    const s = createServer(handler(i ? CFG.apps[i - 1].label : null));
    s.on("error", (e) => { console.warn(`  ! port ${port}: ${e.code}`); ok(false); });
    s.listen(port, "0.0.0.0", () => ok(true));
  })));
  if (!opened[0]) { console.error(`  the main port ${MAIN} is taken: try --port=<another>`); process.exit(1); }
  console.log("\n  " + pad("app", 34) + pad("PC", 26) + "phone (same Wi-Fi)");
  rows.forEach(([name, port], i) => opened[i] && console.log("  " + pad(name, 34) + pad(`http://localhost${port === 80 ? "" : ":" + port}/`, 26) + (ip ? `http://${ip}${port === 80 ? "" : ":" + port}/` : "(no LAN address)")));
  console.log(`\n  listening on 0.0.0.0, no-store, every sw.js is a self-removing dev worker${RELOAD ? ", auto-reload on" : " (refresh after a change; --reload reloads by itself)"}`);

  if (ip) {
    const sb = localRule("apps/floa/domain/supabase.js", /var local = \/(.+?)\/\.test\(host\)/);
    if (!sb || !sb.test(ip)) console.warn(`\n  !!! ${ip} is NOT a local host for /supabase.js: on the phone the apps talk to the REAL environment (real roster). Do not use the phone URLs until supabase.js counts it as local.`);
    const aum = localRule("apps/aum/public/assets/api.js", /if \(\/(.+?)\/\.test\(location\.hostname\)\)/);
    if (aum && !aum.test(ip)) console.warn(`  !   AUM (apps/aum/public/assets/api.js) counts only localhost as local: at ${ip} it calls the REAL roster API with the real key. The key refuses this origin, but do not sign up there from the phone.`);
    const last = MAIN === FIRST - 1 ? `${MAIN}-${FIRST + CFG.apps.length - 1}` : `${MAIN},${FIRST}-${FIRST + CFG.apps.length - 1}`;
    console.log(`\n  phone cannot connect? once, as admin:  netsh advfirewall firewall add rule name="FLOA dev" dir=in action=allow protocol=TCP localport=${last} profile=private`);
    console.log("  (a private-only rule needs the Wi-Fi set to Private: Settings > Network > Wi-Fi > Private network)");
  }
  watchAll();
  console.log("\n  watching src/, apps/, ui/, build.mjs, domains.json\n");
}
start().catch((e) => { console.error(e); process.exit(1); });
