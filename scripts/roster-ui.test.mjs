/* ==========================================================================
   Do the roster pages keep the design rules in a REAL browser?

   scripts/roster-policy.mjs reads the source. This one opens the built pages
   (dist/roster/, /roster/connect/, /roster/admin/) in Chrome, at phone and at
   desktop width, and measures what the source cannot promise:

     page      no uncaught exception, no horizontal scroll (the page and the popup)
     popups    every <dialog> of the page opened for real: corners square (the
               dialog and its sheet), the X is a 44px target at the physical TOP LEFT
               (RTL included), the shell's own spacing is on the 4px grid, the popup
               stays inside the window
     owner     the signed in owner page with a stubbed database: the add button is
               floating at the bottom left, its popup (made at run time by the shell)
               follows the same rules

   No dependencies: a static server and Chrome over the DevTools protocol through
   Node's built-in WebSocket, like businesses/chords/test/layout.test.mjs. The
   database is stubbed: every request to the Supabase host is answered here.

     node build.mjs && npm run test:roster-ui

   Needs dist/, so build first. Where there is no browser it says so and passes:
   a machine without Chrome has learned nothing either way.
   ========================================================================== */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST = resolve("dist");
if (!existsSync(join(DIST, "roster", "index.html"))) { console.error("dist/roster is missing: run node build.mjs first"); process.exit(1); }

const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const browser = CHROMES.find((p) => p && existsSync(p));
if (!browser) { console.log("  skipped: no Chrome or Edge on this machine"); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json" };

function serve() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      let body = null, type = "text/plain";
      try {
        const file = resolve(DIST, "." + path);
        if (!file.startsWith(DIST)) throw new Error("outside");
        body = await readFile(file); type = TYPES[extname(file)] ?? "application/octet-stream";
      } catch { /* the 404 below */ }
      if (body) res.writeHead(200, { "content-type": type }).end(body); else res.writeHead(404).end("not found");
    });
    server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port }));
  });
}

let pass = 0, fail = 0; const failures = [];
const check = (label, cond, extra) => {
  if (cond) pass++; else { fail++; failures.push(label + (extra !== undefined ? "  =>  " + JSON.stringify(extra) : "")); }
  console.log((cond ? "  ok   " : "  FAIL ") + label + (!cond && extra !== undefined ? "  =>  " + JSON.stringify(extra) : ""));
};

const SBHOST = /^https:\/\/[a-z0-9]+\.supabase\.co\//;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const SESSION = JSON.stringify({ access_token: "h." + b64({ sub: "u1", email: "owner@example.com", user_metadata: { full_name: "Owner" } }) + ".s", refresh_token: "r", expires_at: Date.now() + 3600e3 });

async function withChrome(origin, run) {
  const port = 9444 + Math.floor(Math.random() * 200);
  const profile = join(process.env.TEMP || "/tmp", "roster-ui-profile-" + port);
  const child = spawn(browser, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    ...(process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
    "about:blank",
  ], { stdio: "ignore" });
  let exited = null; child.on("exit", (c) => { exited = c; });
  try {
    let ready = false;
    for (let i = 0; i < 240 && !ready && exited === null; i++) { await sleep(250); try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { /* not up */ } }
    if (!ready) throw new Error("Chrome never answered on the debugging port");
    const open = async (url, { width, height, mobile, session, onException }) => {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = () => no(new Error("cdp socket")); });
      let id = 0; const pending = new Map();
      const send = (method, params = {}) => new Promise((ok, no) => { const mine = ++id; pending.set(mine, { ok, no }); socket.send(JSON.stringify({ id: mine, method, params })); });
      const fulfill = (requestId, status, headers, body) => send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })), body: Buffer.from(body).toString("base64") });
      socket.onmessage = (event) => {
        const m = JSON.parse(event.data);
        if (m.id && pending.has(m.id)) { const { ok, no } = pending.get(m.id); pending.delete(m.id); m.error ? no(new Error(JSON.stringify(m.error))) : ok(m.result); return; }
        if (m.method === "Runtime.exceptionThrown") onException((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text);
        if (m.method === "Fetch.requestPaused") {
          const r = m.params.request, u = r.url;
          const cors = { "access-control-allow-origin": origin, "access-control-allow-headers": "authorization, apikey, content-type, x-business, prefer", "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS" };
          if (r.method === "OPTIONS") fulfill(m.params.requestId, 204, cors, "").catch(() => {});
          else if (SBHOST.test(u)) {
            /* the database: no rows, and the one RPC the owner page asks (is this person the platform owner) says yes */
            const body = /roster_is_super/.test(u) ? "true" : "[]";
            fulfill(m.params.requestId, 200, { ...cors, "content-type": "application/json" }, body).catch(() => {});
          } else fulfill(m.params.requestId, 200, { "content-type": "text/css" }, "").catch(() => {});   // fonts.googleapis.com: no network wanted
        }
      };
      await send("Page.enable"); await send("Runtime.enable");
      await send("Fetch.enable", { patterns: [{ urlPattern: "https://*.supabase.co/*" }, { urlPattern: "https://fonts.googleapis.com/*" }, { urlPattern: "https://fonts.gstatic.com/*" }] });
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!mobile });
      if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
      await send("Page.addScriptToEvaluateOnNewDocument", { source:
        `try { ${session ? `if (!sessionStorage.getItem("seeded")) { localStorage.setItem("floa.session", ${JSON.stringify(SESSION)}); sessionStorage.setItem("seeded", "1"); }` : ""}
               localStorage.setItem("rk.swipe.understood", "1"); } catch (e) {}` });
      await send("Page.navigate", { url });
      const evaluate = async (expression) => {
        const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (out.exceptionDetails) throw new Error("the page threw: " + ((out.exceptionDetails.exception || {}).description || out.exceptionDetails.text));
        return out.result.value;
      };
      for (let i = 0; i < 80; i++) { await sleep(150); if ((await evaluate("document.readyState")) === "complete") break; }
      await sleep(900);
      return { evaluate, close: async () => { try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch { /* gone */ } socket.close(); } };
    };
    return await run(open);
  } finally {
    child.kill();
    await sleep(300);
    try { await rm(profile, { recursive: true, force: true }); } catch { /* Windows still lets go of it */ }
  }
}

/* What is measured about one open popup. Everything is a number or a boolean the checks below compare. */
const MEASURE = `(() => {
  const d = [...document.querySelectorAll("dialog[open]")].pop();
  if (!d) return null;
  const cs = getComputedStyle(d), r = d.getBoundingClientRect();
  const sheet = d.querySelector(":scope > .sheet, :scope > form.sheet, :scope > .rs-body, :scope > .rs-sheet");
  const radii = (el) => ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"].map((k) => parseFloat(getComputedStyle(el)[k]) || 0);
  const x = [...d.querySelectorAll('button[aria-label="סגירה"], .rs-x, .dclose')].find((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && q.height > 0; });
  const xr = x ? x.getBoundingClientRect() : null;
  const grid = (el) => ["paddingTop","paddingRight","paddingBottom","paddingLeft"].map((k) => parseFloat(getComputedStyle(el)[k]) || 0).filter((v) => Math.abs(v / 4 - Math.round(v / 4)) > 0.01);
  const shell = [d, ...d.querySelectorAll(":scope > .rs-head, :scope > .rs-foot, :scope > .rs-body")];
  return {
    id: d.id || "", w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom),
    radius: Math.max(...radii(d), ...(sheet ? radii(sheet) : [0])),
    x: xr ? { l: Math.round(xr.left - r.left), t: Math.round(xr.top - r.top), w: Math.round(xr.width), h: Math.round(xr.height) } : null,
    off: shell.flatMap(grid),
    hscroll: d.scrollWidth - d.clientWidth,
    fixedBox: cs.position,
  };
})()`;

const { server, port } = await serve();
const origin = `http://127.0.0.1:${port}`;
/* the X sits in the first row of the header: below the grab bar (44px) of a sheet that opens from the bottom, at the very top of one that opens from the top */
const TOP = 72;
const VIEWS = [{ name: "phone", width: 390, height: 844, mobile: true }, { name: "desktop", width: 1280, height: 800, mobile: false }];

try {
  await withChrome(origin, async (open) => {
    for (const v of VIEWS) {
      /* ---- the markup dialogs of connect and admin (no data needed), and the page itself ---- */
      for (const page of ["/roster/connect/", "/roster/admin/", "/roster/"]) {
        const tag = `${v.name} ${page}`;
        const errs = [];
        const tab = await open(origin + page, { ...v, session: false, onException: (e) => errs.push(e) });
        check(`${tag}: no uncaught exception while loading`, errs.length === 0, errs.slice(0, 2));
        const overflow = await tab.evaluate("document.documentElement.scrollWidth - window.innerWidth");
        check(`${tag}: the page has no horizontal scroll`, overflow <= 0, overflow);
        const ids = await tab.evaluate("[...document.querySelectorAll('dialog')].map((d) => d.id).filter(Boolean)");
        for (const id of ids) {
          /* some dialogs are filled in by the page when it opens them; one that cannot open without data is skipped, not failed */
          const opened = await tab.evaluate(`(async () => { const d = document.getElementById(${JSON.stringify(id)}); try { d.showModal(); } catch (e) { return false; } await new Promise((r) => setTimeout(r, 450)); return d.open; })()`);
          if (!opened) continue;
          const m = await tab.evaluate(MEASURE);
          if (m && m.id === id) {
            check(`${tag} #${id}: square corners`, m.radius === 0, m.radius);
            check(`${tag} #${id}: stays inside the window and has no horizontal scroll`, m.left >= -1 && m.right <= v.width + 1 && m.hscroll <= 0, { left: m.left, right: m.right, hscroll: m.hscroll });
            if (m.x) check(`${tag} #${id}: the X is a 44px target at the top left`, m.x.w >= 44 && m.x.h >= 44 && m.x.l <= 24 && m.x.t <= TOP, m.x);
            check(`${tag} #${id}: the shell's own paddings are on the 4px grid`, m.off.length === 0, m.off);
          }
          await tab.evaluate(`document.getElementById(${JSON.stringify(id)}).close()`);
          await sleep(150);
        }
        errs.length = 0;
        await tab.close();
      }

      /* ---- the signed in owner page: the add button, and the popup it opens (built by the shell at run time) ---- */
      {
        const tag = `${v.name} owner signed in`;
        const errs = [];
        const tab = await open(origin + "/roster/", { ...v, session: true, onException: (e) => errs.push(e) });
        check(`${tag}: no uncaught exception`, errs.length === 0, errs.slice(0, 2));
        const fab = await tab.evaluate(`(() => { const f = document.getElementById("newBiz"); if (!f) return null; const r = f.getBoundingClientRect(); return { l: Math.round(r.left), b: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width), pos: getComputedStyle(f).position }; })()`);
        check(`${tag}: the add button floats at the bottom left`, !!fab && fab.pos === "fixed" && fab.l < v.width / 2 && fab.l <= 32 && fab.b <= 40 && fab.w >= 44, fab);
        if (fab) {
          await tab.evaluate(`document.getElementById("newBiz").click()`); await sleep(600);
          const m = await tab.evaluate(MEASURE);
          check(`${tag}: its popup opens`, !!m, m);
          if (m) {
            check(`${tag}: the popup has square corners`, m.radius === 0, m.radius);
            check(`${tag}: the popup stays inside the window`, m.left >= -1 && m.right <= v.width + 1 && m.hscroll <= 0, m);
            check(`${tag}: its X is a 44px target at the top left`, !!m.x && m.x.w >= 44 && m.x.h >= 44 && m.x.l <= 24 && m.x.t <= TOP, m.x);
            check(`${tag}: the shell paddings are on the 4px grid`, m.off.length === 0, m.off);
          }
          const hs = await tab.evaluate("document.documentElement.scrollWidth - window.innerWidth");
          check(`${tag}: no horizontal scroll with the popup open`, hs <= 0, hs);
        }
        await tab.close();
      }
    }
  });
} finally { server.close(); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:\n" + failures.map((f) => "  " + f).join("\n")); process.exit(1); }
process.exit(0);
