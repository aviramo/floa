// The loading state (ui/SKILL.md, "מצב טעינה"): every screen or popup that waits for the server reserves its area at once, empty,
// marks it .rload[aria-busy="true"], shows nothing before --skel-delay, then the symbol of what loads (centred, --load-mark), then the content; the header never moves.
// The symbol is the kit's --load-icon (a note for music, a figure for an exercise, the curve otherwise) in the area's colour (--accent-2 inside .raccent-2).
// Every stubbed answer is delayed by DELAY ms so the wait is seen. Run: node build.mjs, npm run dev, then
//   BIO_PORT=9377 node apps/biodanza/audit/loading_check.mjs 1300   (and 430; BIO_DEV=<port> for another server of dist)
import fs from "fs"; import { launch } from "./lib.mjs";
const W = Number(process.argv[2] || 1300), H = 850, phone = W < 760, DELAY = 1500;
try { fs.rmSync("C:/tmp/bio/cards/prof" + (process.env.BIO_PORT || ""), { recursive: true, force: true }); } catch (e) { /* a fresh profile: no copies kept on the device, so every list really waits */ }
const b = await launch(W, H);
let bad = 0; const out = [];
const ok = (c, m) => { out.push((c ? "ok   " : "FAIL ") + m); if (!c) bad++; };
const SLOW = `(function(){ var f0 = window.fetch; window.__delay = 0; window.fetch = function () { var a = arguments, d = window.__delay; return d ? new Promise(function (r) { setTimeout(r, d); }).then(function () { return f0.apply(window, a); }) : f0.apply(window, a); }; })();`;
const PROBE = `window.__lp = function () {   /* the waiting areas now on screen, and what their curve looks like */
  var a = [].filter.call(document.querySelectorAll('.rload[aria-busy="true"]'), function (x) { var r = x.getBoundingClientRect(); if (!x.getClientRects().length || x.closest("dialog:not([open])")) return false; var cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 40))), at = document.elementFromPoint(cx, cy); return !!at && (at === x || x.contains(at)); });   /* seen on the screen (a pager's other page waits off it, clipped) */
  return a.map(function (x) { var r = x.getBoundingClientRect(), s = getComputedStyle(x, "::before"); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), anim: s.animationName, op: +s.opacity, tr: s.transform, bg: s.backgroundImage !== "none" || s.backgroundColor !== "rgba(0, 0, 0, 0)", mask: (s.maskImage || s.webkitMaskImage || "").indexOf("svg") > 0, mw: Math.round(parseFloat(s.width)), ic: (function (m) { m = decodeURIComponent(m); return m.indexOf("cx='6' cy='18'") > 0 ? "music" : m.indexOf("cx='12' cy='5'") > 0 ? "exercise" : m.indexOf("M2 16c2.5-9") > 0 ? "curve" : "?"; })(s.maskImage || s.webkitMaskImage || ""), tone: (function () { var d = document.createElement("div"), o = {}; document.body.appendChild(d); d.style.color = "var(--primary)"; o.blue = getComputedStyle(d).color; d.style.color = "var(--accent-2)"; o.red = getComputedStyle(d).color; d.remove(); return s.backgroundColor === o.red ? "red" : s.backgroundColor === o.blue ? "blue" : s.backgroundColor; })(), want: (function () { var d = document.createElement("div"); d.style.width = "var(--load-mark)"; document.body.appendChild(d); var w = Math.round(d.getBoundingClientRect().width); d.remove(); return w; })() }; });
};
window.__title = function (sel) {   /* the title's place inside its own header (a popup sliding in moves the whole header, not the title in it) */
  var t = [].filter.call(document.querySelectorAll(sel), function (x) { return x.getClientRects().length && !x.closest("dialog:not([open])"); }).pop(); if (!t) return null;
  var h = t.closest(".rhead, .sheet-head") || document.body, r = t.getBoundingClientRect(), q = h.getBoundingClientRect();
  return [Math.round(r.left - q.left), Math.round(r.top - q.top), Math.round(r.width), Math.round(r.height)].join(",");
};
window.__errs = []; addEventListener("error", function (e) { window.__errs.push(e.message + " @" + e.lineno); }); addEventListener("unhandledrejection", function (e) { window.__errs.push("rej " + (e.reason && (e.reason.stack || e.reason.message) || e.reason)); });
window.__click = function (sel) { var e = document.querySelector(sel); if (!e) return false; e.click(); return true; };
window.__appMenu = function () { var b = [].filter.call(document.querySelectorAll("[data-rappmenu]"), function (x) { var r = x.getBoundingClientRect(); if (!r.width) return false; var t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && x.contains(t); }).pop(); if (!b) return false; b.click(); return true; };   /* the app menu: the one button that is on top (the kit's, in the header) */
window.__menuPick = function (text) { var x = [].filter.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return x.textContent.indexOf(text) >= 0; })[0]; if (!x) return false; x.click(); return true; };`;
const ev = (x) => b.ev(x);
/* open: what makes the wait; title: the header's title of what opened; body: the area that must be loading */
async function watch(name, open, title, sym) {   /* sym: "icon tone" the symbol must be, e.g. "music red" */
  await ev(`window.__delay = ${DELAY}`);
  const okOpen = await open();
  if (!okOpen) { ok(false, name + ": opener not found"); await ev(`window.__delay = 0`); return; }
  for (let i = 0; i < 12; i++) { await b.sleep(25); if ((await ev(`window.__lp()`)).length) break; }   /* the first frames after the press */
  if (process.env.BIO_DEBUG) console.log(name, await ev(`[].map.call(document.querySelectorAll(".rload, .rpanel, dialog[open]"), function (x) { return (x.id || x.className) + "|" + x.getAttribute("aria-busy") + "|" + x.getClientRects().length; }).join(" ; ")`));
  const early = await ev(`window.__lp()`), t0 = await ev(`window.__title(${JSON.stringify(title)})`);
  ok(early.length > 0 && early.every(a => a.h > 0 && a.w > 0), name + ": the area is reserved at once and marked aria-busy " + JSON.stringify(early.map(a => [a.w, a.h])));
  ok(early.every(a => /none|matrix\(1, 0, 0, 1, -/.test(a.tr) || a.op === 0), name + ": nothing before --skel-delay " + JSON.stringify(early.map(a => [a.anim, a.tr, a.op])));
  await b.sleep(500);
  const mid = await ev(`window.__lp()`), t1 = await ev(`window.__title(${JSON.stringify(title)})`);
  ok(mid.length > 0 && mid.every(a => a.bg && a.mask && a.mw === a.want && a.anim !== "none" && a.op > 0), name + ": after the delay the curve shows, --load-mark big " + JSON.stringify(mid.map(a => [a.anim, a.op, a.mw])));
  if (sym) ok(mid.length > 0 && mid.every(a => a.ic + " " + a.tone === sym), name + ": the symbol of what loads, in the area's colour: " + sym + " " + JSON.stringify(mid.map(a => a.ic + " " + a.tone)));
  const top0 = mid.length ? mid[0].top : null;
  let done = []; for (let i = 0; i < 40; i++) { await b.sleep(250); done = await ev(`window.__lp()`); if (!done.length) break; }   /* some screens ask twice in a row */
  await b.sleep(300);
  const t2 = await ev(`window.__title(${JSON.stringify(title)})`);
  ok(done.length === 0, name + ": the content arrived and aria-busy is gone (" + done.length + " left)");
  ok(t0 && t0 === t1 && t1 === t2, name + ": the header's title never moves " + [t0, t1, t2].join(" | "));
  const bodyTop = await ev(`(function(){ var t = [].filter.call(document.querySelectorAll(${JSON.stringify(title)}), function (x) { return x.getClientRects().length && !x.closest("dialog:not([open])"); }).pop(); if (!t) return null; var h = t.closest(".rhead, .sheet-head"); var n = h && h.nextElementSibling; while (n && !n.getClientRects().length) n = n.firstElementChild || n.nextElementSibling; return n ? Math.round(n.getBoundingClientRect().top) : null; })()`);
  ok(top0 == null || bodyTop == null || Math.abs(top0 - bodyTop) <= 1, name + ": the body starts where the loading area was " + top0 + " / " + bodyTop);
  await ev(`window.__delay = 0`);
}
async function closeAll() { for (let i = 0; i < 3; i++) { for (const t of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type: t, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await b.sleep(350); } await b.sleep(800); }
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.clear()}catch(e){}\n" + fs.readFileSync(new URL("./law17_stub.js", import.meta.url), "utf8") + "\n" + SLOW + "\nwindow.__delay = " + DELAY + ";\n" + PROBE });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
  /* home, at the start: the header at once, the list loading */
  await b.send("Page.navigate", { url: "http://localhost" + (process.env.BIO_DEV ? ":" + process.env.BIO_DEV : "") + "/biodanza/" });
  let s0 = []; for (let i = 0; i < 60 && !s0.length; i++) { await b.sleep(50); try { s0 = await ev(`window.__lp ? window.__lp() : []`); } catch (e) { s0 = []; } }   /* the page's first frames */
  await ev(`document.fonts.ready.then(function () { return 1; })`);   /* the title's font may still be on its way: that moves letters, not the header */
  const h0 = await ev(`window.__title(".rhead h1.rhead__title")`);
  ok((await ev(`window.__lp()`)).length > 0, "home start: still loading once the font is in");
  ok(s0.length > 0, "home start: the list is a loading area " + JSON.stringify(s0.map(a => [a.w, a.h, a.anim])));
  ok(s0.length > 0 && s0.every(a => a.ic === "curve" && a.tone === "blue"), "home start: vivencias load as the curve, blue " + JSON.stringify(s0.map(a => a.ic + " " + a.tone)));
  for (let i = 0; i < 40; i++) { await b.sleep(250); if (!(await ev(`window.__lp()`)).length) break; }
  await b.sleep(2500);   /* a computer then opens the first vivencia by itself */
  const h1 = await ev(`window.__title(".rhead h1.rhead__title")`);
  ok(h0 && h0 === h1, "home start: the header's title never moves " + h0 + " | " + h1);
  ok((await ev(`window.__lp()`)).length === 0, "home start: the list arrived, nothing still loading");
  await ev(`window.__delay = 0`);
  const dock = async (t) => { await ev(`window.__appMenu()`); await b.sleep(400); return ev(`window.__menuPick(${JSON.stringify(t)})`); };
  /* the catalog's exercise preview */
  const catOpen = async () => { const c = await ev(`(function(){ var c = [].filter.call(document.querySelectorAll("[data-catopen]"), function (x) { return x.getClientRects().length; })[0]; if (!c) return false; c.click(); return true; })()`); if (!c) return dock("קטלוג תרגילים"); await b.sleep(400); return ev(`window.__menuPick("קטלוג תרגילים")`); };
  const co = await catOpen(); if (process.env.BIO_DEBUG) console.log("catOpen", co, await ev(`document.querySelectorAll("[data-catopen]").length + " " + document.querySelectorAll(".rmenu").length + " " + [].map.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return x.textContent; }).join("/")`));
  if (!co) { await closeAll(); await catOpen(); }
  await b.sleep(1500);
  if (process.env.BIO_DEBUG) console.log("catalog", await ev(`[window.__errs.join(" ;; ").slice(0, 600), document.querySelectorAll("[data-cat]").length, document.querySelectorAll("[data-ex]").length, document.querySelectorAll(".bio-catmain.is-open, #catDlg[open]").length, [].map.call(document.querySelectorAll(".rmenu"), function (m) { return m.textContent.slice(0, 40); }).join("/")].join(" ")`));
  await ev(`(function(){ var s = [].filter.call(document.querySelectorAll('[data-cat] .racc__head'), function (x) { return x.getClientRects().length; })[0]; if (s && s.getAttribute("aria-expanded") !== "true") s.click(); })()`); await b.sleep(700);
  await watch("catalog exercise preview", () => ev(`(function(){ var c = [].filter.call(document.querySelectorAll('[data-ex]'), function (x) { return x.getClientRects().length; })[0]; if (!c) return false; c.click(); return true; })()`), phone ? "dialog[open] .sheet-head h2, dialog[open] .rhead__title" : ".rpanel .rhead__title", "exercise blue");
  await closeAll(); await closeAll();
  await watch("history", () => dock("היסטוריה"), "#histDlg .rhead__title, #histDlg .sheet-head h2, .rpanel .rhead__title", "music red"); await closeAll();
  await watch("liked music", () => dock("מוסיקה שאהבתי"), "#likedDlg .rhead__title, #likedDlg .sheet-head h2, .rpanel .rhead__title", "music red"); await closeAll();
  /* a vivencia not opened before (a computer opens the first one by itself, and its list is then on the device) */
  await watch("vivencia", () => ev(`window.__click('[data-vrow="v9"]')`), ".rhead h1.rhead__title", "exercise blue");
  await b.sleep(800);
  /* adding music to an exercise of the vivencia: a music area (the exercise opens first, its music section holds the add button) */
  await ev(`(function(){ var c = [].filter.call(document.querySelectorAll("[data-icard] .rcard__main, [data-icard]"), function (x) { return x.getClientRects().length; })[0]; if (c) c.click(); })()`); await b.sleep(2000);
  await watch("add music", () => ev(`(function(){ var a = [].filter.call(document.querySelectorAll("[data-addm]"), function (x) { return x.getClientRects().length; })[0]; if (!a) return false; a.click(); return true; })()`), "#addMusDlg .sheet-head h2, #addMusDlg .rhead__title", "music red");
} catch (e) { ok(false, "error: " + e.message); }
b.close();
console.log(out.join("\n")); console.log(bad ? bad + " FAILED" : "all ok"); process.exit(bad ? 1 : 0);
