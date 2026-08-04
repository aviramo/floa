/* ==========================================================================
   Print the CV to PDF — without the browser's header and footer.

   A browser's print dialog draws a date, a page title, a URL and a page number
   OUTSIDE the CSS page box. No stylesheet can reach them: `@page` describes the
   area the document is given, not the furniture the browser puts around it.
   They are a checkbox in the print dialog ("Headers and footers"), and a
   checkbox is not a build step — it is something to forget on the one occasion
   that matters, when the PDF is going to someone who is hiring.

   So this does the printing instead. Chrome in headless mode takes the same
   flag the dialog's checkbox sets, and produces the file the dialog would have
   produced with the box unticked. Same engine, same stylesheet, same page
   breaks: what changes is only what is NOT on the paper.

   It serves dist/ over a real port rather than opening the files directly.
   file:// would work for the markup and break quietly on the fonts, and a CV
   set in a substituted font is a CV whose line breaks have moved.

     npm run cv        build, print, build again

   Twice, and not by accident: the first build makes the pages this prints from,
   and the second copies the printed files into the site so the download button
   on the page actually resolves. Override the browser with CHROME=/path/to/chrome
   if it is somewhere unusual.
   ========================================================================== */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFile } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
/* The PDFs are files of the BUSINESS, like its share cards (scripts/gen_og.mjs):
   they land in its public/ folder, the build copies them into its site, and the
   CV page links to them. So they are committed — generated source, but source. */
const OUT = join(ROOT, "businesses/floa/public/cv");

const PAGES = [
  { path: "/floa/cv/", file: "ofir-aviram-cv.pdf" },
  { path: "/floa/cv/he/", file: "ofir-aviram-cv-he.pdf" },
];

/* --- the browser ----------------------------------------------------------- */
const CANDIDATES = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  join(process.env.LOCALAPPDATA ?? "", "Google/Chrome/Application/chrome.exe"),
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("gen_cv_pdf: no Chrome found. Set CHROME=/path/to/chrome and run again.");
  process.exit(1);
}

/* --- dist/, served ---------------------------------------------------------
   The same tree GitHub publishes, so the PDF is printed from the page that is
   actually live rather than from a rehearsal of it. */
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".ico": "image/x-icon" };

if (!existsSync(join(DIST, "floa/cv/index.html"))) {
  console.error("gen_cv_pdf: dist/ has no CV in it. Run `node build.mjs` first.");
  process.exit(1);
}

const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = resolve(DIST, "." + path);
  if (!file.startsWith(DIST)) return res.writeHead(403).end();
  readFile(file, (err, body) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  });
});

await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const origin = `http://127.0.0.1:${server.address().port}`;

mkdirSync(OUT, { recursive: true });

/* --- print -----------------------------------------------------------------
   --no-pdf-header-footer is the whole point of the file. The virtual time
   budget is what waits for the web fonts: without it Chrome prints whatever has
   arrived, which on a slow morning is the fallback face and a different set of
   line breaks. */
function print(url, out) {
  return new Promise((done, fail) => {
    const child = spawn(chrome, [
      "--headless",
      "--disable-gpu",
      "--no-pdf-header-footer",
      "--virtual-time-budget=6000",
      `--print-to-pdf=${out}`,
      url,
    ], { stdio: "ignore" });
    child.on("error", fail);
    child.on("exit", (code) => (code === 0 ? done() : fail(new Error(`chrome exited ${code}`))));
  });
}

try {
  for (const page of PAGES) {
    const out = join(OUT, page.file);
    await print(origin + page.path, out);
    console.log(`✓ businesses/floa/public/cv/${page.file}`);
  }
} finally {
  server.close();
}
