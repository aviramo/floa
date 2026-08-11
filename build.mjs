#!/usr/bin/env node
/* ==========================================================================
   FLOA — the generator.

   TWO THINGS, and the whole file is the line between them:

   src/ is the ENGINE. Components, layouts, the design system, the helpers. It
   has no brand, no domain, no phone number and no copy. It knows how to render
   a hero; it does not know whose.

   businesses/<key>/ is a BUSINESS. Its identity (brand, origin, colours,
   WhatsApp number, lead recipient), its copy, its page list and, if it wants
   one, a theme.css of its own. FLOA is simply the first of them.

   Each business is rendered into its own site: its own pages, its own
   stylesheet, its own script, its own sitemap. A business is never mixed into
   another one's output, so one of them can move to its own domain later by
   changing `origin` and nothing else.

     node build.mjs                build every business
     node build.mjs --only=floa    build one
     node build.mjs --watch        rebuild on any change under src/ or businesses/
     node build.mjs --serve        ... and serve it on http://localhost:5173
   ========================================================================== */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
const BUSINESSES = join(ROOT, "businesses");

/* Everything the build makes lands here and NOWHERE else. dist/ is not in git:
   it is thrown away and rebuilt, and GitHub Actions publishes it (see
   .github/workflows/deploy.yml) — which is what lets the repo hold source only
   while floa.co.il keeps every URL it has ever had. The published package, not
   the repo's layout, is what a visitor's URL resolves against. */
const DIST = join(ROOT, "dist");

const readSrc = (p) => readFile(join(SRC, p), "utf8");
const fingerprint = (s) => createHash("sha256").update(s).digest("hex").slice(0, 8);

async function write(outPath, contents) {
  const full = join(DIST, outPath);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, contents, "utf8");
  return outPath;
}

/* The one thing the build writes that is NOT part of a site: the Worker's copy
   of the business table. The Worker deploys from the repo, not from dist/, so
   this is source — generated source, but source, and it is committed. */
async function writeRepo(path, contents) {
  await writeFile(join(ROOT, path), contents, "utf8");
  return path;
}

/* A business folder may not be named after something the repo already owns:
   `out` is a real directory at the repo root, so a business called "css" would
   render its pages straight over the stylesheets. The pages of the business that
   owns the root are just as vulnerable — "business-systems" is a live page of
   floa.co.il, not a free name — but those are not listed here: they are worked
   out from what each business actually emits, in claims() below, so this can
   never fall behind the pages that exist. */
const RESERVED = new Set(["assets", "css", "js", "src", "businesses", "worker", "scripts", "node_modules"]);

/* Every top-level name a business writes into: its own folder, plus every folder
   it puts at the domain root (FLOA's homepage lands there). Two businesses may
   not claim the same name: the second to build would silently overwrite the
   first, and the first would only find out when a live page went missing. */
const top = (path) => path.split("/")[0];
const isFolder = (name) => !name.includes(".");

/* A business whose pages are worked out at build time (see listOf) has none to
   read here, and its folder is the whole of what it claims: renderBusiness
   refuses a root page from such a list, so there is nothing this could miss. */
const claims = (b) => new Set([
  ...(b.out ? [b.out] : []),
  ...(typeof b.pages === "function" ? []
    : b.pages.filter((p) => b.out === "" || p.root).map((p) => top(p.out)).filter(isFolder)),
]);

function checkCollisions(businesses) {
  const taken = new Map();
  for (const b of businesses) {
    for (const name of claims(b)) {
      if (RESERVED.has(name)) throw new Error(`build: "${b.key}" writes to "${name}/", which the repo already owns`);
      const owner = taken.get(name);
      if (owner) throw new Error(`build: "${b.key}" and "${owner}" would both write to "${name}/"`);
      taken.set(name, b.key);
    }
  }
}

/* --- asset bundling -------------------------------------------------------
   Every *.css / *.client.js under src/ is bundled. The order comes from
   src/bundle.js; anything unlisted is appended so it cannot be forgotten.
   The business's own theme.css, if it has one, comes last of all — see below. */
async function collect(dir, test, found = []) {
  for (const entry of await readdir(join(SRC, dir), { withFileTypes: true })) {
    const path = join(dir, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) await collect(path, test, found);
    else if (test(entry.name)) found.push(path);
  }
  return found;
}

async function order(listed, test) {
  const all = await collect(".", test);
  const known = new Set(listed);
  const strays = all.map((p) => p.replace(/^\.\//, "")).filter((p) => !known.has(p));
  for (const stray of strays) console.warn(`  ! ${stray} is not in src/bundle.js — appended last`);
  return [...listed, ...strays];
}

const banner = (file, body) => `/* ${"=".repeat(70)}\n   ${file}\n   ${"=".repeat(70)} */\n${body}`;

async function concat(files, head, prelude = "", tail = []) {
  const parts = await Promise.all(files.map(async (f) => banner(f, await readSrc(f))));
  for (const { name, body } of tail) parts.push(banner(name, body));
  return `/* ${head}\n   Generated by build.mjs — edit the files under src/, not this one. */\n${prelude}\n${parts.join("\n")}`;
}

/* The business's theme: the LAST thing in the stylesheet, so it wins over every
   component above it. A business with no theme.css is not a special case — it
   simply takes the design system's defaults. */
async function theme(key) {
  try {
    return [{ name: `businesses/${key}/theme.css`, body: await readFile(join(BUSINESSES, key, "theme.css"), "utf8") }];
  } catch {
    return [];
  }
}

/* Files, not pages. Two folders, because a site has two kinds of them and they
   do not belong in the same place:

     public/   the BUSINESS's files — its images. Copied into its own folder, so
               a client's photographs sit under /dana/ and FLOA's under /floa/.

     domain/   the DOMAIN's files — the favicons a crawler fetches from /, the
               service worker (which only controls pages at or below its own
               path, so it must sit at the root), .nojekyll, and the CNAME that
               binds floa.co.il to GitHub. Only the business that owns the root
               has one, and it is copied to the root.

   The CNAME earns the distinction the hard way: it once lived in the business's
   public/ folder, which meant it stopped being at the root of what GitHub
   served, which meant GitHub concluded there was no custom domain and unbound
   floa.co.il. The site was fine; the domain simply no longer pointed at it. */
async function statics(key, out, root) {
  const copied = [];
  for (const [folder, into] of [["public", out], ...(root ? [["domain", ""]] : [])]) {
    try {
      await cp(join(BUSINESSES, key, folder), join(DIST, into), { recursive: true });
      copied.push(`${into || "."}/  (${folder})`);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;      // a business with no files of that kind
    }
  }
  return copied;
}

/* --- crawler-facing files ---------------------------------------------------
   Generated from the business's own siteMap, so they can never name a page the
   build doesn't produce, or miss one it does — and never name another
   business's page at all. */
/* EVERY SITEMAP THIS DOMAIN HAS, and not only the root business's. A crawler
   looks for /robots.txt and nowhere else, so a business still living in a
   folder of somebody else's domain is found through this list or it is not
   found at all: its own sitemap.xml sits in its folder, correct and unread,
   until robots.txt names it.

   A business that has moved to an origin of its own is left out, because it is
   not this domain's business any more: its sitemap belongs in the robots.txt
   of the domain that serves it. */
function robotsTxt(origin, sitemaps) {
  return `User-agent: *\nAllow: /\n\n${sitemaps.map((loc) => `Sitemap: ${loc}\n`).join("")}`;
}

function sitemapsOf(businesses, origin) {
  return businesses
    .filter((b) => b.site.origin === origin && (typeof b.siteMap === "function" || b.siteMap.length))
    .sort((a, b) => Number(b.root) - Number(a.root))          // the domain's own first
    .map((b) => (b.root ? `${origin}/sitemap.xml` : `${origin}/${b.out}/sitemap.xml`));
}

function sitemapXml(entries) {
  const urls = entries.map((e) => `  <url>\n    <loc>${e.loc}</loc>\n  </url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function llmsTxt(site, entries) {
  const links = entries.map((e) => `- [${e.title}](${e.loc}): ${e.description}`).join("\n");
  return `# ${site.brand}\n\n> ${site.tagline}. ${site.slogan}.\n\n## Pages\n\n${links}\n`;
}

/* --- the Worker's half of the contract -------------------------------------
   The lead endpoint has to know three things it cannot guess: which origins may
   post, which page names are real (the name lands in the subject line, so it is
   validated rather than trusted), and WHOSE inbox a lead belongs in. All three
   live in the business manifests here, and the Worker deploys separately — so
   this file writes them out and the Worker imports the result.

   It used to be two hand-kept lists compared by a regex. A generated file cannot
   drift: rename a page and the table is rewritten in the same build. What it
   does NOT contain is any address — only the NAME of the env var holding one, so
   a client's inbox never lands in a public repo. */
function workerBusinesses(businesses) {
  const table = Object.fromEntries(businesses.map((b) => [b.key, {
    brand: b.site.brand,
    to: b.lead.to,
    origins: b.lead.origins,
    pages: b.leadPages ?? [],
  }]));

  return `/* ==========================================================================
   GENERATED by build.mjs from businesses/<key>/index.js. Do not edit.

   Every business the lead endpoint serves: the brand its email is signed with,
   the NAME of the env var holding its recipient (never the address), the origins
   allowed to post on its behalf, and the pages that may send.
   ========================================================================== */
export const BUSINESSES = ${JSON.stringify(table, null, 2)};
`;
}

/* --- the build ------------------------------------------------------------ */
async function load() {
  const keys = (await readdir(BUSINESSES, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  return Promise.all(keys.map(async (key) => {
    const { business } = await import(pathToFileURL(join(BUSINESSES, key, "index.js")).href);
    if (business.key !== key) throw new Error(`build: businesses/${key} calls itself "${business.key}"`);
    return business;
  }));
}

/* --- a page list that is not in the repo -----------------------------------
   A business usually knows its own pages: they are files in its folder and the
   list is an array. An application whose pages come out of a DATABASE cannot,
   until it has asked — so `pages` and `siteMap` may each be a FUNCTION instead,
   and the build asks at the moment it renders that business.

   Which is also what keeps `--only=floa` from asking: nothing resolves a list
   it is not about to write, so a build of somebody else touches no network. */
const listOf = async (v) => (typeof v === "function" ? await v() : v);

/* One business, one site. Everything it emits lands under its own `out`, and
   every path inside it is relative to that — which is why the same folder can be
   served from floa.co.il/<key>/ today and from its own domain tomorrow. */
async function renderBusiness(business, bundle, sitemaps) {
  const { key, out, root, site, runtime } = business;

  const pages = await listOf(business.pages);
  const siteMap = await listOf(business.siteMap);

  /* checkCollisions ran before any of this, on a list that could not include
     these: a name nobody can see yet cannot be checked against the ones that
     are taken. So a page worked out at build time stays inside its business. */
  if (typeof business.pages === "function" && pages.some((p) => p.root)) {
    throw new Error(`build: "${key}" works its pages out at build time, so none of them may sit at the domain root`);
  }

  const styles = await concat(
    await order(bundle.css, (n) => n.endsWith(".css")),
    `${site.brand} — one stylesheet, assembled from every component.`,
    "",
    await theme(key)
  );

  /* the browser gets its config from the same file the generator reads */
  const script = await concat(
    await order(bundle.js, (n) => n.endsWith(".client.js")),
    `${site.brand} — one script, assembled from every component behaviour.`,
    `\nwindow.FLOA = { config: ${JSON.stringify(runtime, null, 2)} };\n`
  );

  const assets = {
    css: `css/styles.css?v=${fingerprint(styles)}`,
    js: `js/main.js?v=${fingerprint(script)}`,
  };

  /* The crawler-facing files describe an ORIGIN, and they are fetched from the
     root of one — /robots.txt, /sitemap.xml. So the business that owns the root
     writes them there. A business still living in a folder of someone else's
     domain writes them into its folder, where they wait, correct and unread,
     until it gets a domain of its own and becomes the root of it. */
  const crawlers = root ? "" : out;

  const written = await Promise.all([
    write(join(out, "css/styles.css"), styles),
    write(join(out, "js/main.js"), script),
    write(join(crawlers, "sitemap.xml"), sitemapXml(siteMap)),
    write(join(crawlers, "llms.txt"), llmsTxt(site, siteMap)),
    ...(root ? [write("robots.txt", robotsTxt(site.origin, sitemaps))] : []),

    /* `root` on a page means its `out` is relative to the DOMAIN, not to the
       business: it is how the homepage lands at / while all of its files still
       come from /floa/. */
    ...pages.map(async (page) =>
      write(page.root ? page.out : join(out, page.out), (await page.render(assets)).toString() + "\n")),
  ]);

  return [...written, ...await statics(key, out, root)];
}

async function build(only) {
  const started = Date.now();
  const bundle = await import(pathToFileURL(join(SRC, "bundle.js")).href);

  const all = await load();
  checkCollisions(all);                      // all of them, even on a --only build

  const chosen = only ? all.filter((b) => b.key === only) : all;
  if (!chosen.length) throw new Error(`build: no business named "${only}" under businesses/`);

  /* A full build starts from nothing, so a page that was deleted or renamed
     cannot survive in dist/ and go on being published. A --only build must not:
     it would take every other business's site down with it.

     Windows hands out EPERM on a folder something else is holding open for a
     moment (an indexer, an editor, a browser reading the page it is serving),
     so the delete waits it out instead of failing the whole build. */
  if (!only) await rm(DIST, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });

  /* written from ALL of them, never just the one being rendered: the Worker
     serves every business at once, so a --only build must not shrink its table */
  console.log(`  ${await writeRepo("worker/src/businesses.js", workerBusinesses(all))}`);

  /* Worked out from ALL of them for the same reason the Worker's table is: the
     domain has one robots.txt, and a --only build must not shrink it to the one
     business being rendered. */
  const root = all.find((b) => b.root);
  const sitemaps = root ? sitemapsOf(all, root.site.origin) : [];

  for (const business of chosen) {
    const written = await renderBusiness(business, bundle, sitemaps);
    console.log(`✓ ${business.key} — ${written.length} files`);
    for (const f of written) console.log(`  ${f.replaceAll("\\", "/")}`);
  }

  console.log(`  ${Date.now() - started}ms`);
}

/* --- dev ------------------------------------------------------------------ */
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" };

/* Serves dist/, which is exactly what GitHub publishes — so localhost:5173 and
   floa.co.il resolve a URL against the same tree, and a path that works here
   works there.

   That fidelity includes the miss: GitHub answers an unknown path with the
   site's own 404.html, and the domain's 404.html is not only a page, it is
   also what hands /chords/<song> back to the app that owns it. Answering
   "not found" here instead would make the one thing you cannot test locally
   be the routing. */
function serve(port = 5173) {
  createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(DIST, "." + path);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
    } catch {
      try {
        const body = await readFile(join(DIST, "404.html"));
        res.writeHead(404, { "content-type": "text/html", "cache-control": "no-store" }).end(body);
      } catch {
        res.writeHead(404).end("not found");
      }
    }
  }).listen(port, () => console.log(`  http://localhost:${port}\n`));
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const only = argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

  await build(only);

  if (flag("--serve")) serve();
  if (flag("--watch") || flag("--serve")) {
    let queued = null;
    const rebuild = (file) => {
      clearTimeout(queued);                                  // one rebuild per burst of saves
      queued = setTimeout(() => {
        console.log(`\n↻ ${file}`);
        /* A fresh process, not build() again: ESM caches every module it has
           already imported, so an in-process rebuild would keep re-rendering
           the content it read the first time. */
        spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...argv.filter((a) => a !== "--serve" && a !== "--watch")], { stdio: "inherit" });
      }, 60);
    };
    watch(SRC, { recursive: true }, (_e, file) => rebuild(file));
    watch(BUSINESSES, { recursive: true }, (_e, file) => rebuild(file));
    console.log("  watching src/ and businesses/ …");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
