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
      return { evaluate, send, close: async () => { try { await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`); } catch { /* gone */ } socket.close(); } };
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
  const grabTop = !!xr && [...d.querySelectorAll(".grab, .rs-grab")].some((g) => { const q = g.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(g).display !== "none" && q.bottom <= xr.top + 1; });
  const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pp-px")) || 16;
  const grid = (el) => ["paddingTop","paddingRight","paddingBottom","paddingLeft"].map((k) => parseFloat(getComputedStyle(el)[k]) || 0).filter((v) => Math.abs(v / 4 - Math.round(v / 4)) > 0.01);
  const shell = [d, ...d.querySelectorAll(":scope > .rs-head, :scope > .rs-foot, :scope > .rs-body")];
  /* the top rhythm: from the popup top to the header row, and to the title text (first visible child of the header that has words) */
  const head = [...d.querySelectorAll(".sheet-head, .rs-head")].find((h) => { const q = h.getBoundingClientRect(); return q.width > 0 && q.height > 0; });
  const ttl = head ? [...head.children].find((c) => c.textContent.trim() && !c.matches(".rs-x, .dclose, button") && c.getBoundingClientRect().height > 0) : null;
  const pptop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pp-top")) || 16, ptt = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pp-title-top")) || 32;
  return {
    id: d.id || "", w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom),
    radius: Math.max(...radii(d), ...(sheet ? radii(sheet) : [0])),
    x: xr ? { l: Math.round(xr.left - r.left), t: Math.round(xr.top - r.top), w: Math.round(xr.width), h: Math.round(xr.height) } : null,
    headT: head ? Math.round(head.getBoundingClientRect().top - r.top) : null, titleT: ttl ? Math.round(ttl.getBoundingClientRect().top - r.top) : null, pptop, ptt,
    off: shell.flatMap(grid), grabTop, px,
    hscroll: d.scrollWidth - d.clientWidth,
    fixedBox: cs.position,
  };
})()`;

const { server, port } = await serve();
const origin = `http://127.0.0.1:${port}`;
/* the X sits in the first row of the header: below the grab bar (44px) of a sheet that opens from the bottom, at the very top of one that opens from the top */
const SEEN = new Map();   /* one X position per (view, grab bar above or not): every dialog of every page must land on the same pixel */
const xExact = (tag, view, m) => {
  if (!m.x) return;
  const key = view.name + (m.grabTop ? " with a grab bar above" : " without");
  /* the glyph (12px) sits on the content edge: its 44px target reaches 16px past it, so left = side padding - 16, the same on every page; the top is the shell top padding (16) under the grab bar, if any */
  check(`${tag}: the X is 44px, its left edge is exactly the content edge minus 16 (${m.px - 16})`, m.x.w === 44 && m.x.h === 44 && m.x.l === m.px - 16, m.x);
  const first = SEEN.get(key);
  if (!first) SEEN.set(key, { tag, t: m.x.t });
  else check(`${tag}: the X top offset (${m.x.t}) equals the one of ${first.tag} (${first.t}), ${key}`, m.x.t === first.t, m.x);
  if (!m.grabTop) check(`${tag}: with no grab bar above, the X top is exactly the shell top padding (16)`, m.x.t === 16, m.x);
};
/* the top rhythm (owner 2026-11-13): the header row starts --pp-top (16px) below the popup top in EVERY popup, the grab strip of a bottom sheet included, and the title text is never more than --pp-title-top (32px) down */
const topRhythm = (tag, m) => {
  if (m.headT === null) return;
  check(`${tag}: the header row starts at the top rhythm (${m.pptop}px from the popup top), not lower`, m.headT >= 0 && m.headT <= m.pptop, { headT: m.headT, token: m.pptop });
  if (m.titleT !== null) check(`${tag}: the title text is at most ${m.ptt}px below the popup top`, m.titleT <= m.ptt, { titleT: m.titleT, token: m.ptt });
};
/* Inner scroll (owner 2026-11-13: "inside a popup there is no scrolling"): a popup whose content is taller than the window must scroll its BODY, with a real finger (CDP touch sequence) or wheel, the
   header stays in place, the last thing in it becomes fully visible, the page behind does not move, a drag up never closes it, and the popup never leaves the window. A tall block is put at the end of the
   content so every dialog is measured the same way, whatever data it would hold. */
const TALL = `(() => {
  const d = [...document.querySelectorAll("dialog[open]")].pop(); if (!d) return null;
  /* the body of a popup is the part that declares itself the scroller: the shell's .sheet-body, or the admin's own panes (listed here, so a new dialog with a new body class must be added: that is the point); else the .sheet */
  const GROUPS = ["dialog.mdlg .sheet > [role=menu]", ".sheet-body, .rs-body", ".ppage", "#finMain, #finLog, #finSettle, #finForm, #ppForm", ".ppanel"];   /* in this order: the innermost scroller a dialog declares wins over the pane that holds it */
  { const mn = d.matches(".mdlg") && d.querySelector(".sheet > [role=menu][hidden]"); if (mn) mn.hidden = false; }   /* the filter, sort and WhatsApp popups (class mdlg) keep their menu hidden until the page fills it: show it, it is what a finger touches (never another dialog's floating menu: an open floating menu blocks the whole page behind it) */
  const dr = d.getBoundingClientRect();
  const seen = (e) => { const r = e.getBoundingClientRect(); if (e.closest("[hidden]") || r.width <= 0 || r.right <= dr.left + 1 || r.left >= dr.right - 1) return false; const hit = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height - 4, 160)); return !!hit && e.contains(hit); };   /* and it is the one a finger would touch (a pager stacks its pages; the inactive ones are covered) */   /* on screen, in this dialog (a pager keeps its other pages off to the side) */
  let host = null; for (const g of GROUPS) { host = [...d.querySelectorAll(g)].filter(seen)[0]; if (host) break; }
  if (!host) host = [...d.querySelectorAll(".sheet")].filter(seen).pop() || d;
  /* the allocation popup is filled when it opens (a .ppanel is moved into its slot): an empty slot gets the same wrapper */
  const slot = d.querySelector("#allocSlot"); if (slot && !slot.querySelector(".ppanel") && d.id === "allocDlg") { const pp = document.createElement("div"); pp.className = "ppanel"; slot.appendChild(pp); host = pp; }
  const t = document.createElement("div"); t.setAttribute("data-tall", ""); t.style.cssText = "height:1800px;flex:none;display:block;width:100%"; host.appendChild(t);
  const e = document.createElement("div"); e.setAttribute("data-tall-end", ""); e.style.cssText = "height:8px;flex:none;display:block;width:100%"; host.appendChild(e);
  const chain = []; for (let n = host; n && n !== d.parentElement; n = n.parentElement) { const c = getComputedStyle(n); chain.push(n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + "." + String(n.className).split(" ")[0] + " h" + Math.round(n.getBoundingClientRect().height) + " oy:" + c.overflowY + " d:" + c.display + " f:" + c.flex + " mh:" + c.minHeight + "/" + c.maxHeight); }
  window.__tallChain = chain; window.__tallHost = host; const hr = host.getBoundingClientRect(); return { l: Math.round(hr.left), r: Math.round(hr.right), t: Math.round(hr.top), b: Math.round(hr.bottom) };
})()`;
const TALL_STATE = `(() => {
  const d = [...document.querySelectorAll("dialog[open]")].pop(); if (!d) return null;
  const e = d.querySelector("[data-tall-end]"), r = d.getBoundingClientRect(), er = e ? e.getBoundingClientRect() : null;
  const head = [...d.querySelectorAll(".sheet-head, .rs-head")].find((h) => h.getBoundingClientRect().height > 0);
  const hr = head ? head.getBoundingClientRect() : null;
  return { open: d.open, top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), endBottom: er ? Math.round(er.bottom) : null, endTop: er ? Math.round(er.top) : null,
    headTop: hr ? Math.round(hr.top - r.top) : null, headVisible: hr ? hr.bottom > r.top + 1 && hr.top < r.bottom : null, page: Math.round(window.scrollY + document.documentElement.scrollTop + document.body.scrollTop) };
})()`;
async function scrollProbe(tab, v, tag) {
  if (/ #iDlg$/.test(tag)) return;   /* the screenshot viewer: one image sized to fit the window, nothing to scroll */
  if (/ #(pDlg|stDlg)$/.test(tag)) return;   /* the participant card and the statistics drawer draw their pages only with data: the admin harness (harness.mjs, "popup body scrolls") measures them with the real pages */
  const hostRect = await tab.evaluate(TALL); if (!hostRect) return;
  await sleep(250);
  const before = await tab.evaluate(TALL_STATE);
  if (!before || before.endBottom === null) return;
  /* the finger starts INSIDE the scrolling body (its visible part), near its bottom edge */
  const vb = Math.min(hostRect.b, before.bottom, v.height), vt = Math.max(hostRect.t, before.top, 0), cx = Math.round((Math.max(hostRect.l, before.left) + Math.min(hostRect.r, before.right)) / 2), y0 = vb - 30, y1 = Math.max(vt + 40, y0 - 340);
  for (let k = 0; k < 9; k++) {
    if (v.mobile) {
      await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: y0 }] });
      for (let i = 1; i <= 10; i++) { await tab.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: y0 + ((y1 - y0) * i) / 10 }] }); await sleep(12); }
      await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    } else await tab.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: cx, y: Math.round((vt + vb) / 2), deltaX: 0, deltaY: 360 });
    await sleep(260);
  }
  const after = await tab.evaluate(TALL_STATE);
  if (after && !(after.endBottom <= after.bottom + 1)) { after.chain = await tab.evaluate("window.__tallChain"); after.dlgInfo = await tab.evaluate("(() => { const ds = [...document.querySelectorAll('dialog[open]')]; const d = ds.pop(); const c = getComputedStyle(d); return { openIds: [...document.querySelectorAll('dialog[open]')].map((x) => x.id), last: d.id, disp: c.display, vis: c.visibility, op: c.opacity, tf: c.transform, inert: d.inert, anim: d.getAnimations().length, rect: d.getBoundingClientRect().top + '/' + d.getBoundingClientRect().bottom, stack: document.elementsFromPoint(200, 700).slice(0, 6).map((x) => x.tagName + '#' + x.id + '.' + String(x.className).slice(0, 20)), vv: [innerWidth, innerHeight, visualViewport.height, visualViewport.offsetTop], bodyCls: document.body.className, htmlCls: document.documentElement.className }; })()"); after.host = await tab.evaluate("(() => { const h = window.__tallHost; return { st: h.scrollTop, sh: h.scrollHeight, ch: h.clientHeight, top: Math.round(h.getBoundingClientRect().top), cls: h.className, at: document.elementFromPoint(200, 700) && document.elementFromPoint(200, 700).tagName + '#' + document.elementFromPoint(200, 700).id }; })()"); }
  check(`${tag}: it scrolls when the content is taller than the window (the last row comes into view)`, !!after && after.open && after.endBottom <= after.bottom + 1 && after.endTop < v.height, { before, after });
  check(`${tag}: the page behind did not scroll, the popup stayed open and inside the window`, !!after && after.page === 0 && after.open && after.top >= -1 && after.bottom <= v.height + 1, after);
  if (after && after.headTop !== null) check(`${tag}: the header stays in place while the body scrolls`, after.headVisible && after.headTop <= 64, { before: before.headTop, after: after.headTop });
}
/* THE END OF THE CONTENT (owner 2026-11-13: "content must end inside the safe area"): every region that scrolls (a page list, a popup body, a drawer, an inner list of a popup) must let its last row
   come to rest at least --end-pad above the bottom edge of the screen. The test simulates a phone with a gesture bar by overriding the ONE raw token, --inset-b, to 34px (a real inset cannot be
   emulated in headless Chrome), puts a tall block and a marker at the end of each scroll region that is on screen, scrolls it all the way down, and measures the marker. A region whose bottom is
   far above the screen's bottom (a centered computer popup) cannot hide anything under the system bar and is not measured. The page itself must never scroll. */
const END_PAD = `(async (scope) => {
  const root = document.documentElement, INSET = 34;
  root.style.setProperty("--inset-b", INSET + "px");
  await new Promise((r) => setTimeout(r, 120));
  const sc = scope === "dialog" ? [...document.querySelectorAll("dialog[open]")].pop() : document.body;
  if (!sc) return null;
  const pr = document.createElement("div"); pr.style.cssText = "position:fixed;visibility:hidden;padding-bottom:var(--end-pad,9999px)"; document.body.appendChild(pr);
  const pad = parseFloat(getComputedStyle(pr).paddingBottom); pr.remove();
  const regions = [...sc.querySelectorAll("*")].concat(scope === "dialog" ? [sc] : []).filter((e) => {
    const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return /(auto|scroll)/.test(cs.overflowY) && r.height > 60 && r.width > 60 && cs.visibility !== "hidden" && !e.closest("[hidden]") && r.bottom > window.innerHeight - 160 && r.bottom <= window.innerHeight + 1 && r.top < window.innerHeight && !e.closest("#chip-gallery");
  });
  const out = [];
  for (const e of regions) {
    /* a popup is its own scroll region, but its rows live in its .sheet: the marker goes where a last row would be, inside the sheet, so the sheet's bottom padding is part of what is measured */
    const host = e.matches("dialog") ? (e.querySelector(":scope > .sheet, :scope > form.sheet") || e) : e;
    const t = document.createElement("div"); t.style.cssText = "height:1600px;flex:none;display:block;width:100%";
    const m = document.createElement("div"); m.style.cssText = "height:4px;flex:none;display:block;width:100%";
    /* a grid list puts a new child in a cell: span the whole row so the marker is the last thing, like a last row */
    const grid = /grid/.test(getComputedStyle(e).display); if (grid) { t.style.gridColumn = m.style.gridColumn = "1 / -1"; }
    host.appendChild(t); host.appendChild(m); e.scrollTop = e.scrollHeight; await new Promise((r) => setTimeout(r, 60)); e.scrollTop = e.scrollHeight;
    const mr = m.getBoundingClientRect();
    out.push({ el: e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className).trim().split(/\\s+/).slice(0, 2).join("."), gap: Math.round(window.innerHeight - mr.bottom), box: Math.round(window.innerHeight - e.getBoundingClientRect().bottom), scrolled: e.scrollTop > 0, geo: (function(){const d=e.closest("dialog")||e,q=(x)=>x?[Math.round(x.getBoundingClientRect().top),Math.round(x.getBoundingClientRect().bottom)]:null;return {dlg:q(d),sheet:q(d.querySelector(":scope > .sheet, :scope > form.sheet")),grab:q(d.querySelector(":scope > .grab")),ih:innerHeight};})(), pb: [e, host, ...(function(){const a=[];for(let p=host.parentElement;p&&a.length<4;p=p.parentElement){a.push(p);}return a;})()].map((x)=>(x.id||x.tagName.toLowerCase())+":"+getComputedStyle(x).paddingBottom+"/"+getComputedStyle(x).marginBottom) });
    t.remove(); m.remove();
  }
  const page = Math.round(window.scrollY + root.scrollTop + document.body.scrollTop);
  root.style.removeProperty("--inset-b");
  return { pad, out, page };
})`;
async function endPadProbe(tab, tag, scope) {
  const r = await tab.evaluate(`${END_PAD}(${JSON.stringify(scope)})`);
  if (!r) return;
  check(`${tag}: --end-pad resolves to a real number (at least the 34px inset)`, r.pad >= 34 && r.pad < 400, r.pad);
  for (const x of r.out) check(`${tag} ${x.el}: scrolled to its end, the last row rests >= ${r.pad}px above the screen bottom`, x.gap >= r.pad - 1, x);
  check(`${tag}: the page itself did not scroll`, r.page === 0, r.page);
}
/* CHIPS (owner 2026-11-13: "the content of a chip is not on its vertical centre, and the chips differ"): every chip class of the page is built from the markup the page really renders
   (copied from a rendered admin list), put in a throw-away box on the live page, and measured with the page's own CSS. For each chip: one height per size (s 24, m 28, l 40, read from the
   kit tokens), and the vertical centre of every piece of content in it (each text run, each icon) within 1px of the chip's own centre. Classes that are not chips (notes are plain text,
   a counter is a counter) are not in the list. */
const ICON = `<svg class="ic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4h12v16l-6-4-6 4z"/></svg>`;
const KIT_CHIPS = `<div data-gal>
  <span class="rchip">חדש</span><span class="rchip rchip--ok">${ICON}<b>3</b></span><span class="rchip rchip--s">ועוד 2</span><span class="rchip rchip--l">${ICON}12</span>
  <button type="button" class="rchip rchip--button">${ICON}סינון</button><span class="rchip rchip--wait">אין חשבונות</span></div>`;
const ADMIN_CHIPS = `<div data-gal class="wrap" style="display:block;position:static;height:auto;overflow:visible;padding:0">
  <div class="chiprow"><div class="cq">
    <button type="button" class="stc tagc" data-cm="res" data-cr="res" aria-haspopup="menu" aria-pressed="false"><span class="fx cm">${ICON} <small>3</small></span></button>
    <button type="button" class="stc tagc" data-cm="arr" data-cr="arr" aria-haspopup="menu" aria-pressed="false"><span class="fx cm">${ICON} <small>0</small></span></button>
    <button type="button" class="stc tagc" data-cr="gen" aria-pressed="false"><span class="fx cm"><span class="gc">${ICON}<small>2</small></span><span class="gc">${ICON}<small>1</small></span></span></button>
    <button type="button" class="fspair" id="filtBtn">${ICON}${ICON}</button>
    <span class="stlast"><button type="button" class="stc tagc" data-sc="1" style="--sbg:var(--sky-bg);--sfg:var(--sky)" aria-pressed="false"><span class="fx"><span>חדש <small>1</small></span><span class="ph" aria-hidden="true">חדש <small>5</small></span></span></button></span>
  </div></div>
  <div class="list"><div class="row ucard"><div class="main"><div class="meta"><span class="age"><bdi dir="rtl">37 <b class="gl">${ICON}</b></bdi></span>
    <span class="sidewrap"><span class="mcnt mcnt2 mcnt3">${ICON}2</span><span class="tg ico ptag nolabel">${ICON}</span><span class="payic free">לא לתשלום</span><span class="payic later">בהמשך ₪60</span><span class="payic ok">₪80</span><span class="tg ptag new">חדש</span></span></div></div>
    <a class="tg ico rowwa" href="#">${ICON}</a></div></div>
  <div class="mlist"><div class="mrow"><span class="tg mlabel">שולם</span><button type="button" class="mmoney has">₪60</button><button type="button" class="pay new">לתשלום</button></div></div>
  <div id="viewMenu"><button type="button" class="mc">${ICON} כל המשתתפים <small>3</small></button></div></div>`;
const CHIP_SEL = ".rchip, .tg, .stc, .ptag, .pay, .pst, .sopt, .paychip, .tchip, .trend, .age, .mcnt2, .mcnt3, .payic, .balic, .evc, .mlist .mrow .mlabel, .mlist .mrow .mmoney, #viewMenu .mc, .metchips button, .emvars button, .fspair";
const chipProbe = (html) => `(async () => {
  const box = document.createElement("div"); box.id = "chip-gallery"; box.setAttribute("dir", "rtl");
  box.style.cssText = "position:fixed;top:0;left:0;z-index:2147483000;background:#fff;width:380px;padding:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center";
  /* a locked admin page hides its whole .wrap and a loading one its chip row: lift both for the measurement and put them back after */
  const was = { locked: document.body.classList.contains("locked"), loading: document.documentElement.classList.contains("is-loading") };
  document.body.classList.remove("locked"); document.documentElement.classList.remove("is-loading");
  box.innerHTML = ${JSON.stringify(html)}; document.body.appendChild(box);
  await new Promise((r) => setTimeout(r, 150));
  const root = getComputedStyle(document.documentElement), px = (n) => parseFloat(root.getPropertyValue(n));
  const size = { s: px("--tag-s"), m: px("--tag"), l: px("--tag-l") };
  const out = { n: 0, heights: [], off: [], size };
  for (const el of box.querySelectorAll(${JSON.stringify(CHIP_SEL)})) {
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    out.n++;
    const want = el.matches(".rchip--s") ? size.s : el.matches(".rchip--l") ? size.l : size.m;
    const name = el.tagName.toLowerCase() + "." + String(el.className).trim().split(/\\s+/).join(".");
    if (Math.abs(r.height - want) > 0.5) out.heights.push({ name, h: r.height, want });
    const c = r.top + r.height / 2, parts = [];
    for (const s of el.querySelectorAll("svg")) { const q = s.getBoundingClientRect(); if (q.height) parts.push({ what: "icon", c: q.top + q.height / 2, h: q.height, w: q.width }); }
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walk.nextNode(); t; t = walk.nextNode()) { if (!t.textContent.trim()) continue; const g = document.createRange(); g.selectNodeContents(t); const q = g.getBoundingClientRect(); if (q.height) parts.push({ what: "text", c: q.top + q.height / 2 }); }
    for (const p of parts) { if (Math.abs(p.c - c) > 1) out.off.push({ name, what: p.what, off: Math.round((p.c - c) * 10) / 10 }); if (p.what === "icon" && (Math.abs(p.h - 16) > 0.5 || Math.abs(p.w - 16) > 0.5)) out.off.push({ name, what: "icon box", h: p.h, w: p.w }); }
  }
  box.remove(); if (was.locked) document.body.classList.add("locked"); if (was.loading) document.documentElement.classList.add("is-loading"); return out;
})()`;
/* Exceptions, each with its reason (also in memory roster-popup-rules.md): an add that is not "add a row to a list".
   aAdd: the accounts popup's inline form (email field + its submit), one control with its field.   acc=me: one-click shortcut inside that form.
   pSubmit: the header check that saves the new participant form (the page's own words become its tooltip, it is a save).
   scGo: confirms creating a secret in a dialog, an action not a list row.   nAdd: saves a note (check icon).   walAdd: receiving a payment, a transaction with its own confirm. */
const ADD_ALLOW = ["#aAdd", "[data-acc=me]", "#pSubmit", "#scGo", "#nAdd", "#walAdd", ".hsave"];
const ADD_PROBE = `(() => {
  const allow = ${JSON.stringify(ADD_ALLOW)}, out = [];
  for (const el of document.querySelectorAll("button, a, [role=button], [role=menuitem]")) {
    if (el.classList.contains("rfab") || allow.some((s) => el.matches(s))) continue;
    const name = (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/^[+＋]\\s*/, "");
    if (/^(הוספ|חדש)/.test(name) || /^[+＋]/.test((el.textContent || "").trim())) out.push({ name: name.slice(0, 40), id: el.id || "", cls: String(el.className).slice(0, 40) });
  }
  return out;
})()`;
const VIEWS = [{ name: "phone", width: 390, height: 844, mobile: true }, { name: "desktop", width: 1280, height: 800, mobile: false }];

try {
  await withChrome(origin, async (open) => {
    for (const v of VIEWS) {
      /* ---- the markup dialogs of connect and admin (no data needed), and the page itself ---- */
      for (const page of ["/roster/connect/", "/roster/admin/", "/roster/"].filter((p) => !process.env.ROSTER_UI_ONLY || p.includes(process.env.ROSTER_UI_ONLY))) {
        const tag = `${v.name} ${page}`;
        const errs = [];
        const tab = await open(origin + page, { ...v, session: false, onException: (e) => errs.push(e) });
        check(`${tag}: no uncaught exception while loading`, errs.length === 0, errs.slice(0, 2));
        const overflow = await tab.evaluate("document.documentElement.scrollWidth - window.innerWidth");
        check(`${tag}: the page has no horizontal scroll`, overflow <= 0, overflow);
        await endPadProbe(tab, `${tag} page`, "page");
        {
          const vp = await tab.evaluate(`(document.querySelector("meta[name=viewport]") || {}).content || ""`);
          check(`${tag}: the viewport draws to the screen edges (viewport-fit=cover, so env() resolves) and the keyboard resizes the page, like every roster page`, /viewport-fit=cover/.test(vp) && /interactive-widget=resizes-content/.test(vp), vp);
        }
        {
          /* a sticky row may not have a margin under it: the margin is outside the sticky box, so rows scrolling beneath it show through the gap (a clipped glyph peeked under the finance buttons) */
          const bad = await tab.evaluate(`[...document.querySelectorAll("*")].filter((e) => { const cs = getComputedStyle(e); if (cs.position !== "sticky") return false; const mb = parseFloat(cs.marginBottom); if (!(mb > 0.5)) return false; const af = getComputedStyle(e, "::after"); return !(af.content !== "none" && af.position === "absolute" && parseFloat(af.height) >= mb - 0.5); }).map((e) => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + String(e.className).trim().split(/\\s+/).join("."))`);
          check(`${tag}: no sticky row has a margin below it (content would peek through the gap)`, bad.length === 0, bad);
        }
        {
          const g = await tab.evaluate(chipProbe(page === "/roster/admin/" ? ADMIN_CHIPS + KIT_CHIPS : KIT_CHIPS));
          check(`${tag}: ${g.n} chips measured, one height per size (s ${g.size.s}, m ${g.size.m}, l ${g.size.l})`, g.n >= (page === "/roster/admin/" ? 20 : 6) && g.heights.length === 0, g.heights);
          check(`${tag}: the text and the icons of every chip sit on its vertical centre (1px), icons are a 16px box`, g.off.length === 0, g.off.slice(0, 6));
        }
        {
          /* adding to a list is the floating button, everywhere: no text-style add control (a name starting with "הוספ", "חדש" or "+") outside the FAB, except the listed ones */
          const bad = await tab.evaluate(ADD_PROBE);
          check(`${tag}: every add control is the kit FAB (no text-style "add" button)`, bad.length === 0, bad);
        }
        const ids = await tab.evaluate("[...document.querySelectorAll('dialog')].map((d) => d.id).filter(Boolean)");
        for (const id of ids.filter((i) => !process.env.ROSTER_UI_DLG || new RegExp(process.env.ROSTER_UI_DLG).test(i))) {
          /* some dialogs are filled in by the page when it opens them; one that cannot open without data is skipped, not failed */
          const opened = await tab.evaluate(`(async () => { const d = document.getElementById(${JSON.stringify(id)}); try { if (!d.querySelector(".sheet") && window.RosterSheet) RosterSheet.render(d, { title: "בדיקה", titleId: d.id + "T", body: "<p>x</p>", from: "bottom" }); else d.showModal(); } catch (e) { return false; } await new Promise((r) => setTimeout(r, 450)); return d.open; })()`);
          if (!opened) continue;
          const m = await tab.evaluate(MEASURE);
          if (m && m.id === id) {
            check(`${tag} #${id}: square corners`, m.radius === 0, m.radius);
            check(`${tag} #${id}: stays inside the window and has no horizontal scroll`, m.left >= -1 && m.right <= v.width + 1 && m.hscroll <= 0, { left: m.left, right: m.right, hscroll: m.hscroll });
            xExact(`${tag} #${id}`, v, m);
            topRhythm(`${tag} #${id}`, m);
            check(`${tag} #${id}: the shell's own paddings are on the 4px grid`, m.off.length === 0, m.off);
            await scrollProbe(tab, v, `${tag} #${id}`);
            await endPadProbe(tab, `${tag} #${id}`, "dialog");
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
        await endPadProbe(tab, `${tag} page`, "page");   // the businesses list with the add button over its corner: it reserves --end-pad-fab
        const fab = await tab.evaluate(`(() => { const f = document.getElementById("newBiz"); if (!f) return null; const r = f.getBoundingClientRect(); return { l: Math.round(r.left), b: Math.round(window.innerHeight - r.bottom), w: Math.round(r.width), pos: getComputedStyle(f).position }; })()`);
        check(`${tag}: the add button floats at the bottom left`, !!fab && fab.pos === "fixed" && fab.l < v.width / 2 && fab.l <= 32 && fab.b <= 40 && fab.w >= 44, fab);
        if (fab) {
          await tab.evaluate(`document.getElementById("newBiz").click()`); await sleep(600);
          const m = await tab.evaluate(MEASURE);
          check(`${tag}: its popup opens`, !!m, m);
          if (m) {
            check(`${tag}: the popup has square corners`, m.radius === 0, m.radius);
            check(`${tag}: the popup stays inside the window`, m.left >= -1 && m.right <= v.width + 1 && m.hscroll <= 0, m);
            check(`${tag}: it has an X`, !!m.x, m.x); xExact(tag, v, m);
            topRhythm(tag, m);
            check(`${tag}: the shell paddings are on the 4px grid`, m.off.length === 0, m.off);
          }
          const hs = await tab.evaluate("document.documentElement.scrollWidth - window.innerWidth");
          check(`${tag}: no horizontal scroll with the popup open`, hs <= 0, hs);
          await endPadProbe(tab, `${tag} popup`, "dialog");
        }
        await tab.close();
      }

      /* ---- the page header is ONE element on every page: room above the title, and a surface and a bottom edge that no list row has ---- */
      for (const page of ["/roster/", "/roster/connect/", "/roster/admin/"]) {
        const tag = `${v.name} ${page} header`;
        const tab = await open(origin + page, { ...v, session: true, onException: () => {} });
        const h = await tab.evaluate(`(() => {
          const el = document.querySelector(".wrap > header, .wrap > .rhead");
          if (!el || !el.getBoundingClientRect().height) return null;
          const cs = getComputedStyle(el), clear = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
          const host = document.querySelector("#view, #panel, .wrap > .list") || document.body;
          const row = document.createElement("div"); row.className = "rrow"; row.style.visibility = "hidden"; host.appendChild(row);
          const rs = getComputedStyle(row), bodyBg = getComputedStyle(document.body).backgroundColor;
          const pe = el.matches(".rhead") ? el : (el.querySelector(".rhead") || el);
          const out = { padTop: parseFloat(getComputedStyle(pe).paddingTop) || 0, bg: cs.backgroundColor, edge: cs.borderBottomColor + " " + cs.borderBottomWidth, rowBg: clear(rs.backgroundColor) ? bodyBg : rs.backgroundColor, rowEdge: rs.borderBottomColor + " " + rs.borderBottomWidth };
          row.remove();
          /* the header's icon buttons (account, menu, view, ...): no background of their own, a 44px hit area, and the OUTERMOST glyph on each side flush with the content edge */
          const box = el.querySelector(".rhead__in, .title-row") || el, bcs = getComputedStyle(box), br = box.getBoundingClientRect();
          const cl = br.left + (parseFloat(bcs.paddingLeft) || 0), cr = br.right - (parseFloat(bcs.paddingRight) || 0), mid = (cl + cr) / 2;
          const btns = [...box.querySelectorAll("button, a")].map((b) => ({ b, g: b.querySelector("svg"), r: b.getBoundingClientRect() }))
            .filter((x) => x.g && x.r.width > 0 && !x.b.closest("[hidden]") && !(x.b.innerText || "").trim());
          out.icons = btns.map((x) => { const gr = x.g.getBoundingClientRect(); return { id: x.b.id || x.b.className, bg: getComputedStyle(x.b).backgroundColor, hit: Math.round(Math.max(x.r.width, x.r.height)), gl: Math.round(gr.left - cl), gr: Math.round(cr - gr.right), left: gr.left + gr.width / 2 < mid }; });
          const lefts = out.icons.filter((i) => i.left), rights = out.icons.filter((i) => !i.left);
          out.leftEdge = lefts.length ? Math.min(...lefts.map((i) => i.gl)) : null;
          out.rightEdge = rights.length ? Math.min(...rights.map((i) => i.gr)) : null;
          return out;
        })()`);
        if (!h) { await tab.close(); continue; }   // behind the sign-in gate in this run: nothing to measure
        check(`${tag}: at least 16px above the title`, h.padTop >= 16, h);
        check(`${tag}: its surface or its bottom edge differs from a list row's`, h.bg !== h.rowBg || h.edge !== h.rowEdge, h);
        check(`${tag}: its icon buttons have no background of their own`, h.icons.length > 0 && h.icons.every((i) => i.bg === "rgba(0, 0, 0, 0)" || i.bg === "transparent"), h.icons);
        check(`${tag}: the outermost glyph on each side is flush with the content edge (within 1px)`, (h.leftEdge === null || Math.abs(h.leftEdge) <= 1) && (h.rightEdge === null || Math.abs(h.rightEdge) <= 1), h);
        await tab.close();
      }
    }
  });
} finally { server.close(); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log("\nFAILURES:\n" + failures.map((f) => "  " + f).join("\n")); process.exit(1); }
process.exit(0);
