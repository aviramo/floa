/* ==========================================================================
   Is going back a page being uncovered, or a page being built again?

   The app keeps every page it has opened as a sheet of its own and puts the
   one before it aside whole, so that BACK is the top sheet coming off: the
   same nodes, at the same height, without asking the database anything. None
   of that can be checked by reading the code, because all of it is about what
   the browser does with an address, so this drives a real Chrome over the
   built page with the database stubbed and presses back.

     node build.mjs && npm run test:stack

   Needs dist/, so build first. Where there is no browser to drive it says so
   and passes, for the same reason as the layout test next door.
   ========================================================================== */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST = resolve("dist");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LINES = ["{בית}", "[Am]בנקיק נסתר בצוקים אילה שותה מים", "מה לי וללה אלא צוקי לבי"].join("\n");
const SONGS = Array.from({ length: 60 }, (_, i) => ({
  id: "id" + i, slug: "song-" + i, title: "שיר מספר " + i,
  lyrics_by: "", music_by: "", dir: "rtl", status: "ready", status_note: "",
  lines: LINES, created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-0" + ((i % 9) + 1) + "T00:00:00Z",
}));

function page() {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/chords/assets/style.css">
<script>
window.__errors = [];
addEventListener("error", (e) => window.__errors.push(e.message + " @ " + e.filename + ":" + e.lineno));

window.SUPABASE = { url: "https://stub.invalid", anonKey: "anon" };
const SONGS = ${JSON.stringify(SONGS)};
window.fetch = (url) => {
  const u = String(url);
  let body = [];
  if (u.includes("/rest/v1/songs")) {
    const m = u.match(/slug=eq\\.([^&]+)/);
    body = m ? SONGS.filter((s) => s.slug === decodeURIComponent(m[1])) : SONGS;
  }
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
};
<\/script>
</head><body>
<header class="top"><div class="wrap top-in">
<a class="brand" href="/chords/">א</a>
<div class="top-name"><div class="top-where" id="topWhere"></div><div class="top-sub" id="topSub"></div></div>
<div class="top-facts" id="topFacts"></div>
<div class="top-find" id="topFind"></div>
<div class="top-actions" id="topActions"></div>
</div></header>
<main id="app" class="wrap"></main>
<div id="toast" class="toast"></div>
<dialog id="meDialog" class="dlg"><form id="meForm"><p id="meWho"></p><label><input type="text" name="name"></label><p class="err" id="meErr"></p><button type="button" id="meOut"></button><button type="button" data-close></button><button type="submit"></button></form></dialog>
<script src="/chords/assets/config.js"><\/script>
<script src="/chords/assets/app.js"><\/script>
</body></html>`;
}

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };
function serve() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      /* Every address under /chords/ that is not an asset is the app itself,
         the way GitHub Pages hands them all to 404.html. So a reload of
         /chords/ or of a song lands back on the same stubbed harness. */
      if (path.startsWith("/chords/") && !path.startsWith("/chords/assets/")) {
        res.writeHead(200, { "content-type": "text/html" }).end(page());
        return;
      }
      if (path.endsWith("/")) path += "index.html";
      let body = null, type = "text/plain";
      try {
        const file = resolve(DIST, "." + path);
        if (!file.startsWith(DIST)) throw new Error("outside");
        body = await readFile(file);
        type = TYPES[extname(file)] ?? "text/plain";
      } catch { /* 404 */ }
      if (body) res.writeHead(200, { "content-type": type }).end(body);
      else res.writeHead(404).end("not found");
    });
    server.listen(0, () => ok({ server, port: server.address().port }));
  });
}

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const browser = CHROMES.find((p) => p && existsSync(p));
if (!browser) { console.log("  skipped: no Chrome"); process.exit(0); }

async function withChrome(run) {
  const port = 9334;
  const profile = join(process.env.TEMP || "/tmp", "chords-stack-profile");
  for (let i = 0; i < 10; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; }
    catch (e) { if (i === 9) throw e; await sleep(500); }
  }
  const child = spawn(browser, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--window-size=900,800", "about:blank",
  ], { stdio: "ignore" });
  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(250);
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { /* not up */ }
    }
    if (!ready) throw new Error("Chrome never answered");
    return await run(async (url, body) => {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = () => no(new Error("cdp socket")); });
      let id = 0;
      const pending = new Map();
      socket.onmessage = (event) => {
        const m = JSON.parse(event.data);
        if (m.id && pending.has(m.id)) {
          const { ok, no } = pending.get(m.id);
          pending.delete(m.id);
          m.error ? no(new Error(JSON.stringify(m.error))) : ok(m.result);
        }
      };
      const send = (method, params) => new Promise((ok, no) => {
        const mine = ++id;
        pending.set(mine, { ok, no });
        socket.send(JSON.stringify({ id: mine, method, params }));
      });
      const evaluate = async (expression) => {
        const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (out.exceptionDetails) {
          const why = out.exceptionDetails.exception || {};
          throw new Error("the page threw: " + (why.description || why.value || out.exceptionDetails.text));
        }
        return out.result.value;
      };
      const wait = async (expr, what) => {
        for (let i = 0; i < 60; i++) {
          if (await evaluate(`!!(${expr})`)) return true;
          await sleep(150);
        }
        throw new Error("never happened: " + (what || expr));
      };
      const result = await body({ send, evaluate, wait });
      socket.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
      return result;
    });
  } finally { child.kill(); }
}

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${ok ? "" : `\n       ${detail}`}`);
  if (!ok) failed++;
};

const { server, port } = await serve();
const root = join(DIST, "chords/_stack");
await mkdir(root, { recursive: true });
await writeFile(join(root, "index.html"), page(), "utf8");

try {
  await withChrome(async (open) => {
    await open(`http://127.0.0.1:${port}/chords/`, async ({ evaluate, wait }) => {
      await wait(`document.querySelectorAll("#app a[href^='/chords/song-']").length > 20`, "the library");

      check("the library drew one sheet", await evaluate(`document.querySelectorAll("#app > .layer").length`) === 1,
        await evaluate(`document.querySelectorAll("#app > .layer").length + " layers"`));

      await evaluate(`window.scrollTo(0, 1200); "ok"`);
      await sleep(120);
      const wasY = await evaluate(`Math.round(window.scrollY)`);
      check("the library scrolls", wasY > 900, "scrollY " + wasY);

      /* A mark on the sheet itself and on the last button in the bar. If
         either comes back without it, it was built again rather than kept. */
      await evaluate(`document.querySelector("#app > .layer").__mark = 1;
        document.getElementById("topActions").lastElementChild.__mark = 1; "ok"`);

      /* into a song */
      await evaluate(`document.querySelectorAll("#app a[href^='/chords/song-']")[12].click(); "ok"`);
      await wait(`document.querySelector("#app .sheet")`, "the song");
      check("the song is the only sheet in the document",
        await evaluate(`document.querySelectorAll("#app > .layer").length`) === 1,
        await evaluate(`document.querySelectorAll("#app > .layer").length + " layers"`));
      check("the song is at the top", await evaluate(`Math.round(window.scrollY)`) < 40,
        "scrollY " + await evaluate(`Math.round(window.scrollY)`));
      check("the address is the song's", (await evaluate(`location.pathname`)).startsWith("/chords/song-"),
        await evaluate(`location.pathname`));

      /* and back */
      await evaluate(`history.back(); "ok"`);
      await sleep(400);
      const backY = await evaluate(`Math.round(window.scrollY)`);
      check("back put the library where it was", Math.abs(backY - wasY) < 4, `${backY} vs ${wasY}`);
      check("back left one sheet", await evaluate(`document.querySelectorAll("#app > .layer").length`) === 1,
        await evaluate(`document.querySelectorAll("#app > .layer").length + " layers"`));
      check("back put the library back", await evaluate(`document.querySelectorAll("#app a[href^='/chords/song-']").length`) > 20, "no rows");
      check("the bar says the library", (await evaluate(`document.getElementById("topWhere").textContent`)) === "שירים",
        await evaluate(`JSON.stringify(document.getElementById("topWhere").textContent)`));
      check("the bar has its buttons back", await evaluate(`document.getElementById("topActions").children.length`) >= 4,
        await evaluate(`document.getElementById("topActions").children.length + " buttons"`));
      check("it is the same sheet, not a new one",
        await evaluate(`document.querySelector("#app > .layer").__mark === 1`), "a new node");
      check("it is the same button, not a new one",
        await evaluate(`document.getElementById("topActions").lastElementChild.__mark === 1`), "a new button");
      check("the tab says the app again", await evaluate(`document.title`) === "אקורדים", await evaluate(`document.title`));

      /* forward again */
      await evaluate(`history.forward(); "ok"`);
      await sleep(400);
      check("forward is the song again", await evaluate(`!!document.querySelector("#app .sheet")`), "no sheet");
      check("forward left one sheet", await evaluate(`document.querySelectorAll("#app > .layer").length`) === 1,
        await evaluate(`document.querySelectorAll("#app > .layer").length + " layers"`));

      check("nothing threw", (await evaluate(`JSON.stringify(window.__errors)`)) === "[]",
        await evaluate(`JSON.stringify(window.__errors)`));

      /* and a reload lands where the reader was */
      await evaluate(`history.back(); "ok"`);
      await sleep(400);
      await evaluate(`window.scrollTo(0, 800); "ok"`);
      await sleep(150);
      await evaluate(`location.reload(); "ok"`);
      await sleep(600);
      await wait(`document.querySelectorAll("#app a[href^='/chords/song-']").length > 20`, "the library after a reload");
      await sleep(600);
      const afterY = await evaluate(`Math.round(window.scrollY)`);
      check("a reload lands where the reader was", Math.abs(afterY - 800) < 20, "scrollY " + afterY);
    });
  });
} finally {
  server.close();
  await rm(root, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
