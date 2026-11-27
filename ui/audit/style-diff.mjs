// STYLE DIFF of the kit: "nothing changes on screen". Every refactor of the kit CSS (ui/css/, built into /kit.css) or of an app's layout is checked with it:
// a dump of the computed style of every element (and its ::before, ::after, ::placeholder, a dialog's ::backdrop) on every screen,
// window and menu an app's opener list opens, at two widths and two motion settings, plus the states of one of each clickable kind;
// then a compare of two dumps that fails on any difference.
// Run (localhost:5173 serves dist/, npm run dev; no build here):
//   node ui/audit/style-diff.mjs apps/biodanza/audit/layout_openers.mjs 430 before      -> C:/tmp/kit-style/before_430_{full,reduce}.json
//   node ui/audit/style-diff.mjs apps/biodanza/audit/layout_openers.mjs 1300 before
//   ... change the code, rebuild, run the same with the tag "after" ...
//   node ui/audit/style-diff.mjs --compare before after [--allow allow.json] [--max 300]
// Exit code 1 on any difference the allowlist does not name. Headless Chrome on this PC only.
// Openers file: screens [name, opener], menus [name, opener] (on its `path`), pages [name, path, opener] (their own path); init, special.
// Env: STYLE_PORT (Chrome's debugging port, default 9600 for 430 and 9601 for 1300, so both widths run at once), STYLE_DEV (5173),
//   STYLE_ONLY=<part of a name>, or several parts as "a|b" (a screen runs when its name has any of them),STYLE_FONTS=1 (let the web fonts load; by default they are blocked, so text metrics never depend on the network),
//   STYLE_DIST=<dir> with STYLE_DEV=<free port> (the tool serves that frozen copy of dist/ itself; use it while other agents rebuild dist/),
//   STYLE_INJECT=<css text or a .css file> (the test hook: a stylesheet added last to every page, to prove a change is caught; --inject <css> too).
// Allowlist (allow.json): an array of rules; a rule is an object whose fields (screen, width, motion, key, pseudo, state, prop) are regular
//   expressions matched against the difference (a missing field matches anything), e.g. [{ "prop": "^transition-", "key": "rbtn" }].
// Determinism: Date is pinned to a fixed day (it still ticks), Math.random is seeded, web fonts are blocked, storage and service workers are
//   cleared before every navigation, the window is always focused, and animations are settled: a finite one finished, an infinite one paused at 0.
import fs from "fs"; import path from "path"; import { spawn } from "child_process"; import { pathToFileURL } from "url";
const OUT = "C:/tmp/kit-style";
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); if (i < 0) return null; const v = argv[i + 1]; argv.splice(i, 2); return v; };

/* ======================= COMPARE ======================= */
if (argv[0] === "--compare") {
  argv.shift();
  const allowFile = opt("--allow"), max = +(opt("--max") || 400);
  const [A, B] = argv;
  if (!A || !B) { console.log("usage: node ui/audit/style-diff.mjs --compare <tagA> <tagB> [--allow allow.json] [--max N]"); process.exit(2); }
  const rules = allowFile ? JSON.parse(fs.readFileSync(allowFile, "utf8")).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, new RegExp(v)]))) : [];
  const allowed = (d) => rules.some(r => Object.entries(r).every(([k, re]) => re.test(String(d[k]))));
  const files = (t) => fs.readdirSync(OUT).filter(f => f.startsWith(t + "_") && /^\d+_(full|reduce)\.json$/.test(f.slice(t.length + 1))).map(f => f.slice(t.length + 1));
  const fa = files(A), fb = files(B), both = fa.filter(f => fb.includes(f));
  const diffs = [], info = [];
  for (const f of fa.concat(fb)) if (!both.includes(f)) diffs.push({ screen: "*", width: f.split("_")[0], motion: f.split("_")[1].replace(".json", ""), key: "", pseudo: "", state: "", prop: "(run)", before: fa.includes(f) ? "present" : "missing", after: fb.includes(f) ? "present" : "missing" });
  if (!both.length) { console.log("nothing to compare: no file of " + A + " matches one of " + B + " in " + OUT); process.exit(2); }
  const full = (mode, d) => d ? Object.assign({}, mode, d) : null;
  const cmpStyles = (base, mA, mB, sA, sB) => {   /* two {key: {p, ps, v}} maps */
    const keys = new Set([...Object.keys(sA || {}), ...Object.keys(sB || {})]);
    for (const k of keys) {
      const a = sA && sA[k], b = sB && sB[k];
      if (!a || !b) { diffs.push({ ...base, key: k, pseudo: "", prop: "(element)", before: a ? "present" : "missing", after: b ? "present" : "missing" }); continue; }
      const pa = full(mA, a.p), pb = full(mB, b.p);
      for (const p of new Set([...Object.keys(pa), ...Object.keys(pb)])) if (pa[p] !== pb[p]) diffs.push({ ...base, key: k, pseudo: "", prop: p, before: pa[p], after: pb[p] });
      for (const ps of new Set([...Object.keys(a.ps || {}), ...Object.keys(b.ps || {})])) {
        const xa = a.ps && a.ps[ps], xb = b.ps && b.ps[ps];
        if (!xa || !xb) { diffs.push({ ...base, key: k, pseudo: ps, prop: "(pseudo)", before: xa ? "present" : "missing", after: xb ? "present" : "missing" }); continue; }
        const qa = full(mA, xa), qb = full(mB, xb);
        for (const p of new Set([...Object.keys(qa), ...Object.keys(qb)])) if (qa[p] !== qb[p]) diffs.push({ ...base, key: k, pseudo: ps, prop: p, before: qa[p], after: qb[p] });
      }
      const va = a.v || {}, vb = b.v || {};   /* custom properties: info only, never a failure */
      for (const p of new Set([...Object.keys(va), ...Object.keys(vb)])) if (va[p] !== vb[p]) info.push({ ...base, key: k, prop: p, before: va[p], after: vb[p] });
    }
  };
  for (const f of both) {
    const [w, mo] = f.replace(".json", "").split("_");
    const ra = JSON.parse(fs.readFileSync(OUT + "/" + A + "_" + f, "utf8")), rb = JSON.parse(fs.readFileSync(OUT + "/" + B + "_" + f, "utf8"));
    for (const s of new Set([...Object.keys(ra.screens), ...Object.keys(rb.screens)])) {
      const a = ra.screens[s], b = rb.screens[s], base = { screen: s, width: w, motion: mo, state: "" };
      const st = (x) => !x ? "missing" : x.error ? "error: " + x.error : x.skip ? "skipped" : "ok";
      if (st(a) !== "ok" || st(b) !== "ok") { if (st(a) !== st(b)) diffs.push({ ...base, key: "", pseudo: "", prop: "(screen)", before: st(a), after: st(b) }); continue; }
      cmpStyles(base, a.mode, b.mode, a.els, b.els);
      for (const sk of new Set([...Object.keys(a.states || {}), ...Object.keys(b.states || {})])) {
        const xa = a.states[sk], xb = b.states[sk], sb = { ...base, state: sk };
        if (!xa || !xb) { diffs.push({ ...sb, key: "", pseudo: "", prop: "(state)", before: xa ? "present" : "missing", after: xb ? "present" : "missing" }); continue; }
        cmpStyles(sb, a.mode, b.mode, xa, xb);
      }
    }
  }
  const bad = diffs.filter(d => !allowed(d)), ok = diffs.length - bad.length;
  const short = (v) => v == null ? "-" : String(v).length > 120 ? String(v).slice(0, 117) + "..." : String(v);
  console.log("style diff, " + A + " -> " + B + ", " + both.length + " runs (" + both.map(f => f.replace(".json", "")).join(", ") + ")");
  const byScreen = {}; for (const d of bad) { const k = d.screen + " @" + d.width + " " + d.motion; byScreen[k] = (byScreen[k] || 0) + 1; }
  for (const [k, n] of Object.entries(byScreen)) console.log("  " + n + "\t" + k);
  bad.slice(0, max).forEach(d => console.log(["DIFF", d.screen, d.width, d.motion, d.key || "-", d.pseudo || "-", d.state || "base", d.prop].join(" | ") + "\n       " + short(d.before) + "  ->  " + short(d.after)));
  if (bad.length > max) console.log("... " + (bad.length - max) + " more (--max)");
  if (info.length) console.log("info: " + info.length + " custom property difference(s), not a failure" + (process.env.STYLE_INFO ? "\n" + info.slice(0, max).map(d => "  " + [d.screen, d.width, d.motion, d.key, d.state || "base", d.prop].join(" | ") + ": " + short(d.before) + " -> " + short(d.after)).join("\n") : " (STYLE_INFO=1 lists them)"));
  console.log(bad.length ? bad.length + " DIFFERENCE(S)" + (ok ? ", " + ok + " allowed" : "") : "no differences" + (ok ? " (" + ok + " allowed)" : ""));
  process.exit(bad.length ? 1 : 0);
}

/* ======================= DUMP ======================= */
let injectArg = opt("--inject") || process.env.STYLE_INJECT || "";
if (injectArg && /\.css$/i.test(injectArg) && fs.existsSync(injectArg)) injectArg = fs.readFileSync(injectArg, "utf8");
const [listFile, wArg, TAG] = argv;
if (!listFile || !TAG || !/^(430|1300)$/.test(wArg || "")) { console.log("usage: node ui/audit/style-diff.mjs <openers.mjs> <430|1300> <tag> [--inject <css>]\n       node ui/audit/style-diff.mjs --compare <tagA> <tagB> [--allow allow.json]"); process.exit(2); }
const L = await import(pathToFileURL(path.resolve(listFile)).href);
const W = Number(wArg), H = W < 760 ? 900 : 850, phone = W < 760, ONLY = process.env.STYLE_ONLY || "";
const PORT = +process.env.STYLE_PORT || (phone ? 9600 : 9601), DEV = process.env.STYLE_DEV || 5173, ORIGIN = "http://localhost:" + DEV, PROF = OUT + "/prof" + PORT;
fs.mkdirSync(OUT, { recursive: true });
/* STYLE_DIST=<a copy of dist/>: served here by the tool itself on STYLE_DEV (give it a free port, e.g. 5199), so a dump is of a frozen build while others rebuild dist/ */
let server = null;
if (process.env.STYLE_DIST) {
  const http = await import("http"), root = path.resolve(process.env.STYLE_DIST);
  const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".txt": "text/plain", ".xml": "application/xml", ".webmanifest": "application/manifest+json" };
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
    const f = path.resolve(root, "." + p);
    if (!f.startsWith(root)) return res.writeHead(403).end();
    if (!path.extname(p) && fs.existsSync(path.join(f, "index.html"))) return res.writeHead(301, { location: p + "/" }).end();
    fs.readFile(f, (e, b) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" }).end(b));
  });
  await new Promise(r => server.listen(+DEV, r));
}
try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) { /* a fresh profile */ }
const t0 = Date.now();

const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROF, "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--font-render-hinting=none", "--disable-lcd-text", "--window-size=" + W + "," + H, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pg; for (let i = 0; i < 40 && !pg; i++) { await sleep(250); try { pg = (await (await fetch("http://localhost:" + PORT + "/json")).json()).find(p => p.type === "page"); } catch (e) { /* not up yet */ } }
const ws = new WebSocket(pg.webSocketDebuggerUrl); let id = 0; const pend = {}, waiters = [];
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } else if (d.method) for (const w of waiters.slice()) if (w.method === d.method) { waiters.splice(waiters.indexOf(w), 1); w.res(d.params); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const once = (method, ms) => new Promise(res => { const w = { method, res }; waiters.push(w); setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); res(null); } }, ms); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const obj = async (x) => { const r = await send("Runtime.evaluate", { expression: x, awaitPromise: true }); const o = r.result && r.result.result; return o && o.objectId && o.subtype !== "null" ? o.objectId : null; };
const call = async (objectId, fn, args = []) => { const r = await send("Runtime.callFunctionOn", { objectId, functionDeclaration: fn, arguments: args.map(v => ({ value: v })), returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const callObj = async (objectId, fn) => { const r = await send("Runtime.callFunctionOn", { objectId, functionDeclaration: fn }); const o = r.result && r.result.result; return o && o.objectId && o.subtype !== "null" ? o.objectId : null; };

/* ---- the pinned clock and the seeded random, before anything of the page ---- */
const DETERMINISM = String.raw`(function () {
  var R = Date, off = Date.UTC(2026, 10, 26, 8, 0, 0) - R.now();
  function D() { var a = [].slice.call(arguments); if (!(this instanceof D)) return new R(R.now() + off).toString(); return a.length ? new (Function.prototype.bind.apply(R, [null].concat(a)))() : new R(R.now() + off); }
  D.prototype = R.prototype; D.now = function () { return R.now() + off; }; D.UTC = R.UTC; D.parse = R.parse; window.Date = D;
  var s = 0x9e3779b9; Math.random = function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
})();`;
/* ---- in the page: the openers' helpers (the same as ui/audit/layout.mjs gives), the settle and the dump ---- */
const PAGE = String.raw`
window.__vis = function (e) { if (!e || !e.getClientRects().length) return false; var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return false; var s = getComputedStyle(e); return s.visibility !== "hidden" && s.clipPath.indexOf("inset(50%") < 0 && +s.opacity > 0; };
window.__pick = function (t) { var m = [].filter.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return __vis(x) && x.textContent.trim().indexOf(t) === 0; })[0]; if (m) m.click(); return !!m; };
window.__appMenu = function () { var x = [].filter.call(document.querySelectorAll("[data-rappmenu]"), function (x) { var r = x.getBoundingClientRect(); if (!r.width) return false; var p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!p && x.contains(p); }).pop(); if (!x) return false; x.click(); return true; };
window.__menu = function (t) { if (!__appMenu()) return Promise.resolve(false); return new Promise(function (r) { setTimeout(function () { r(__pick(t)); }, 400); }); };
window.__layer = function () {
  var d = [].filter.call(document.querySelectorAll("dialog[open]"), __vis).pop(); if (d) return { kind: "window", root: d, heads: [d.querySelector(".sheet-head")].filter(Boolean) };
  var p = [].filter.call(document.querySelectorAll(".rpanel"), __vis).pop(); if (p) return { kind: "panel", root: p, heads: [].filter.call(p.querySelectorAll(".rhead"), __vis) };
  return { kind: "screen", root: document.body, heads: [].filter.call(document.querySelectorAll(".rhead"), function (h) { return __vis(h) && !h.closest("dialog, .rpanel"); }) };
};
window.__clk = function (sel, inTop) { var s = inTop && __layer() ? __layer().root : document; var a = s.querySelectorAll(sel), e = [].filter.call(a, __vis)[0] || [].filter.call(a, function (x) { return x.getClientRects().length && x.getBoundingClientRect().width > 0; })[0]; if (!e) return false; e.scrollIntoView({ block: "center" }); e.click(); return true; };
window.__act = function (act, label) { var b = [].filter.call(document.querySelectorAll('.rhead [data-act="' + act + '"]'), __vis)[0]; if (b) { b.click(); return Promise.resolve(true); } if (!__clk('.rhead [data-rmore]')) return Promise.resolve(false); return new Promise(function (r) { setTimeout(function () { r(__pick(label)); }, 400); }); };
/* settle: a finite animation or transition is finished (its resting state), an infinite one is paused at its start; twice, since a finished one may start another */
window.__sdSettle = function () {
  var go = function () { document.getAnimations().forEach(function (a) { try { var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null; if (t && isFinite(t.endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } } catch (e) { try { a.pause(); a.currentTime = 0; } catch (e2) { /* gone */ } } }); };
  go(); return new Promise(function (r) { requestAnimationFrame(function () { go(); requestAnimationFrame(function () { go(); r(document.getAnimations().length); }); }); });
};
var segOf = function (e) { var p = e.parentElement || e.parentNode, n = p && p.children ? [].indexOf.call(p.children, e) + 1 : 1, c = (e.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).filter(function (x) { return x.indexOf("sd-") !== 0 && x.indexOf("rlayout") !== 0; }).sort(); return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (c.length ? "." + c.join(".") : "") + ":" + n; };
window.__sdKey = function (e) { if (e === document.documentElement) return "html"; if (e === document.body) return "body"; var s = []; for (var x = e; x && x !== document.body && x !== document.documentElement; x = x.parentElement) s.unshift(segOf(x)); return "body>" + s.join(">"); };
var sigOf = function (e) { var c = (e.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).sort().join("."); return e.tagName.toLowerCase() + "." + c; };
function styleOf(e, ps) { var s = getComputedStyle(e, ps || null), p = {}, v = {}; for (var i = 0; i < s.length; i++) { var n = s[i]; if (n.indexOf("--") === 0) v[n] = s.getPropertyValue(n).trim(); else p[n] = s.getPropertyValue(n); } return { p: p, v: v }; }
var hasPseudo = function (e, ps) { var c = getComputedStyle(e, ps).content; return c && c !== "none" && c !== "normal"; };
/* one node: its longhands, its pseudo elements that exist, its custom properties where they differ from its parent's */
window.__sdNode = function (e, pv) {
  var o = styleOf(e), r = { p: o.p }, ps = {};
  ["::before", "::after"].forEach(function (x) { if (hasPseudo(e, x)) ps[x] = styleOf(e, x).p; });
  if (/^(INPUT|TEXTAREA)$/.test(e.tagName) && e.hasAttribute("placeholder")) ps["::placeholder"] = styleOf(e, "::placeholder").p;
  if ((e.tagName === "DIALOG" && e.open) || (e.matches && e.matches(":popover-open"))) ps["::backdrop"] = styleOf(e, "::backdrop").p;
  if (Object.keys(ps).length) r.ps = ps;
  var v = {}, any = false; for (var n in o.v) if (!pv || pv[n] !== o.v[n]) { v[n] = o.v[n]; any = true; }
  if (any) r.v = v; r._v = o.v; return r;
};
/* the dump of the page: html, body and everything under it, the open dialogs (the top layer) included; the first 3 of each signature (tag, classes, the parent's signature) */
window.__sdDump = function () {
  var out = {}, cnt = {}, sig = new Map(), vars = new Map();
  (function walk(e, psig) {
    var s = sigOf(e) + "<" + psig; sig.set(e, s);
    cnt[s] = (cnt[s] || 0) + 1; if (cnt[s] > 3) return;
    if (/^(HEAD|SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|TITLE)$/.test(e.tagName)) return;
    var r = __sdNode(e, e.parentElement ? vars.get(e.parentElement) : null); vars.set(e, r._v); delete r._v;
    out[__sdKey(e)] = r;
    for (var k = e.firstElementChild; k; k = k.nextElementSibling) walk(k, s);
  })(document.documentElement, "");
  return out;
};
/* the nodes a state touches: the element, its pseudo elements (in its own entry) and its parent */
window.__sdNodes = function (e) { var o = {}, add = function (x) { if (!x || x.nodeType !== 1) return; var r = __sdNode(x, x.parentElement ? styleOf(x.parentElement).v : null); delete r._v; o[__sdKey(x)] = r; }; add(e); add(e.parentElement); return o; };
/* one instance of each clickable kind: the top layer first, then the page */
window.__sdKinds = {
  "rbtn filled": ".rbtn:not(.rbtn--ghost):not(.rbtn--icon):not(.rbtn--text)", "rbtn ghost": ".rbtn--ghost", "rbtn icon": ".rbtn--icon", "rbtn text": ".rbtn--text",
  "rappmenu": ".rappmenu, [data-rappmenu]", "rchip--button": ".rchip--button", "rrow--link main": ".rrow--link .rrow__main", "rrow--pick": ".rrow--pick",
  "rrow--check": ".rrow--check", "rrow--switch": ".rrow--switch", "racc__head": ".racc__head", "racc__bar": ".racc__bar", "rcard button": ".rcard[role=button]",
  "rtab": ".rtab", "rmenu__item": ".rmenu__item", "rrange": ".rrange", "ricon-lg": ".ricon-lg", "rplayer__info": ".rplayer__info",
  "field input": ".rfield input:not([type=checkbox]):not([type=radio]):not([type=range])", "field select": ".rfield select", "rf-rich": ".rf-rich"
};
window.__sdPick = function (k) { var sel = __sdKinds[k], L = __layer(), roots = L.kind === "screen" ? [document] : [L.root, document]; for (var i = 0; i < roots.length; i++) { var a = [].filter.call(roots[i].querySelectorAll(sel), __vis); if (a.length) return a[0]; } return null; };
`;
const INJECT = injectArg ? `document.addEventListener("DOMContentLoaded", function () { var s = document.createElement("style"); s.id = "sd-inject"; s.textContent = ${JSON.stringify(injectArg)}; document.head.appendChild(s); });` : "";

await send("Page.enable"); await send("Runtime.enable"); await send("DOM.enable"); await send("CSS.enable"); await send("Network.enable");
await send("Network.setBypassServiceWorker", { bypass: true });
if (!process.env.STYLE_FONTS) await send("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });
await send("Page.addScriptToEvaluateOnNewDocument", { source: DETERMINISM + "\n" + (L.init || "") + "\nwindow.__special = " + JSON.stringify(L.special || "") + ";\n" + PAGE + "\n" + INJECT });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
await send("Emulation.setTouchEmulationEnabled", { enabled: phone, maxTouchPoints: phone ? 5 : 0 });
await send("Emulation.setFocusEmulationEnabled", { enabled: true });

const list = [];
for (const [name, open] of (L.screens || [])) list.push([name, L.path, open]);
for (const [name, open] of (L.menus || [])) list.push([name, L.path, open]);
for (const [name, p, open] of (L.pages || [])) list.push([name, p, open]);

/* the screen's mode: the most common value of each property over every style in it; each style keeps only what differs (the compare puts it back) */
function pack(els, states) {
  const all = [];
  for (const m of [els, ...Object.values(states)]) for (const r of Object.values(m)) { all.push(r.p); for (const x of Object.values(r.ps || {})) all.push(x); }
  const count = {}; for (const p of all) for (const [k, v] of Object.entries(p)) { const c = count[k] || (count[k] = new Map()); c.set(v, (c.get(v) || 0) + 1); }
  const mode = {}; for (const [k, c] of Object.entries(count)) { let b = null, n = -1; for (const [v, x] of c) if (x > n) { n = x; b = v; } mode[k] = b; }
  const thin = (p) => { const o = {}; for (const [k, v] of Object.entries(p)) if (mode[k] !== v) o[k] = v; for (const k of Object.keys(mode)) if (!(k in p)) o[k] = null; return o; };
  const sq = (m) => { for (const r of Object.values(m)) { r.p = thin(r.p); if (r.ps) for (const k of Object.keys(r.ps)) r.ps[k] = thin(r.ps[k]); } };
  sq(els); for (const s of Object.values(states)) sq(s);
  return mode;
}

const STATES = ["hover", "active", "focus", "focus-visible"];
const ATTRS = [["aria-busy", "true"], ["disabled", ""], ["aria-disabled", "true"], ["aria-expanded", "true"], ["aria-pressed", "true"], ["class", "is-play"]];
async function statePass() {
  const states = {};
  const kinds = await ev(`Object.keys(__sdKinds)`);
  for (const k of kinds) {
    const oid = await obj(`__sdPick(${JSON.stringify(k)})`); if (!oid) continue;
    const nodeId = (await send("DOM.requestNode", { objectId: oid })).result?.nodeId; if (!nodeId) continue;
    for (const st of STATES) {
      await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [st] }); await ev(`__sdSettle()`);
      states[k + " :" + st] = await call(oid, `function () { return __sdNodes(this); }`);
      await send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }); await ev(`__sdSettle()`);
    }
    if (/^field|rf-rich/.test(k)) {   /* focus-within on the field's label */
      const lid = await callObj(oid, `function () { return this.closest(".rfield, label"); }`);
      const ln = lid && (await send("DOM.requestNode", { objectId: lid })).result?.nodeId;
      if (ln) { await send("CSS.forcePseudoState", { nodeId: ln, forcedPseudoClasses: ["focus-within"] }); await ev(`__sdSettle()`);
        states[k + " :focus-within(label)"] = await call(lid, `function () { return __sdNodes(this); }`);
        await send("CSS.forcePseudoState", { nodeId: ln, forcedPseudoClasses: [] }); await ev(`__sdSettle()`); }
    }
    for (const [a, v] of ATTRS) {   /* set, dump, restore: one at a time */
      await call(oid, `function (a, v) { var c = a === "class"; var h = c ? this.classList.contains(v) : this.getAttribute(a); this.__sdHad = h; if (c) this.classList.add(v); else this.setAttribute(a, v); return h; }`, [a, v]);
      await ev(`__sdSettle()`);
      states[k + " [" + (a === "class" ? "." + v : a + (v ? "=" + v : "")) + "]"] = await call(oid, `function () { return __sdNodes(this); }`);
      await call(oid, `function (a, v) { var h = this.__sdHad; if (a === "class") { if (!h) this.classList.remove(v); } else if (h === null) this.removeAttribute(a); else this.setAttribute(a, h); }`, [a, v]);
      await ev(`__sdSettle()`);
    }
  }
  return states;
}

const times = {};
for (const motion of ["no-preference", "reduce"]) {
  const tm = Date.now();
  await send("Emulation.setEmulatedMedia", { media: "screen", features: [{ name: "prefers-reduced-motion", value: motion }, { name: "prefers-color-scheme", value: "light" }, { name: "hover", value: phone ? "none" : "hover" }, { name: "any-hover", value: phone ? "none" : "hover" }, { name: "pointer", value: phone ? "coarse" : "fine" }, { name: "any-pointer", value: phone ? "coarse" : "fine" }] });
  const res = { app: L.app || listFile, width: W, motion, tag: TAG, inject: injectArg || null, media: null, screens: {} };
  const lines = [];
  for (const [name, p, open] of list) {
    if (ONLY && !ONLY.split("|").some(function (o) { return name.indexOf(o) >= 0; })) continue;   /* STYLE_ONLY="a|b": any of the parts */
    try {
      /* an opener's fixed waits can be too short on a loaded PC: one that finds nothing gets a fresh navigation and up to two more tries, the later ones with doubled waits */
      let ok = false;
      for (let tr = 0; tr < 3 && !ok; tr++) {
        await send("Page.navigate", { url: "about:blank" }); await sleep(50);
        await send("Storage.clearDataForOrigin", { origin: ORIGIN, storageTypes: "all" });
        const loaded = once("Page.loadEventFired", 15000);
        await send("Page.navigate", { url: ORIGIN + p }); await loaded; await sleep(1500 * (tr + 1));
        await send("DOM.getDocument", { depth: 0 });
        ok = await open(ev, tr ? (ms) => sleep(ms * 2) : sleep);
      }
      if (!ok) { res.screens[name] = { skip: true }; lines.push("SKIP " + name); continue; }
      await sleep(1500); await ev(`__sdSettle()`);
      if (!res.media) res.media = await ev(`["(hover: hover)", "(hover: none)", "(pointer: coarse)", "(prefers-reduced-motion: reduce)"].filter(function (q) { return matchMedia(q).matches; }).join(" ")`);
      const els = await ev(`__sdDump()`);
      const states = await statePass();
      const mode = pack(els, states);
      res.screens[name] = { mode, els, states };
      lines.push("ok   " + name + " (" + Object.keys(els).length + " nodes, " + Object.keys(states).length + " states)");
    } catch (e) { res.screens[name] = { error: e.message.slice(0, 200) }; lines.push("ERR  " + name + ": " + e.message.slice(0, 200)); }
  }
  const file = OUT + "/" + TAG + "_" + W + "_" + (motion === "reduce" ? "reduce" : "full") + ".json";
  fs.writeFileSync(file, JSON.stringify(res));
  times[motion] = Math.round((Date.now() - tm) / 1000);
  console.log("style dump, " + res.app + ", " + W + "px, motion " + motion + " [" + res.media + "] -> " + file + " (" + times[motion] + "s)\n" + lines.join("\n"));
}
try { ws.close(); } catch (e) { /* closing */ } try { process.kill(proc.pid); } catch (e) { /* gone */ }
console.log("done in " + Math.round((Date.now() - t0) / 1000) + "s");
process.exit(0);
