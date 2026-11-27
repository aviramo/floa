// THE LAYOUT AUDIT of the kit (ui/docs/layout.md "עקרונות הפריסה", "בדיקה אוטומטית של העקרונות"): it checks the eight principles on every box, not distances of cases.
// An app gives only its list of openers (apps/<app>/audit/layout_openers.mjs: path, init script, screens, menus); every check is here.
// A screen is [name, opener, expect?]: expect is a selector seen only on that screen; when it is given and not seen after the opener, the screen FAILS.
// Run: node build.mjs --only=<app>, npm run dev (localhost:5173 serves dist/), then
//   node ui/audit/layout.mjs apps/biodanza/audit/layout_openers.mjs 430      (and 1300)
// Env: LAYOUT_PORT (Chrome's debugging port, default 9481), LAYOUT_DEV (the dev server's port, 5173), LAYOUT_ONLY=<part of a name>, LAYOUT_SHOTS=<dir> (a picture of each).
// Exit code 1 when anything fails, a SKIP included (an opener that finds nothing); only the openers file's `absent` allowlist excuses one. Headless Chrome on this PC only.
import fs from "fs"; import path from "path"; import { spawn } from "child_process"; import { pathToFileURL } from "url";
const [listFile, wArg] = process.argv.slice(2);
if (!listFile) { console.log("usage: node ui/audit/layout.mjs <openers.mjs> <width>"); process.exit(2); }
const L = await import(pathToFileURL(path.resolve(listFile)).href);
const W = Number(wArg || 430), H = W < 760 ? 900 : 850, phone = W < 760, ONLY = process.env.LAYOUT_ONLY || "";
const PORT = +process.env.LAYOUT_PORT || 9481, DEV = process.env.LAYOUT_DEV || 5173, PROF = "C:/tmp/kit-layout/prof" + PORT;
try { fs.rmSync(PROF, { recursive: true, force: true }); } catch (e) { /* a fresh profile */ }

/* ---- a headless Chrome, driven over the DevTools protocol ---- */
const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=" + PROF, "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--window-size=" + W + "," + H, "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);
const pg = (await (await fetch("http://localhost:" + PORT + "/json")).json()).find(p => p.type === "page");
const ws = new WebSocket(pg.webSocketDebuggerUrl); let id = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const shot = async (file) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); };

/* ---- in the page: the kit's helpers to open things, and the checks ---- */
const PAGE = String.raw`
window.__vis = function (e) { if (!e || !e.getClientRects().length) return false; var r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.right <= 0 || r.left >= innerWidth || r.bottom <= 0 || r.top >= innerHeight) return false; var s = getComputedStyle(e); return s.visibility !== "hidden" && s.clipPath.indexOf("inset(50%") < 0 && +s.opacity > 0; };
window.__pick = function (t) { var m = [].filter.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return __vis(x) && x.textContent.trim().indexOf(t) === 0; })[0]; if (m) m.click(); return !!m; };
window.__appMenu = function () { var x = [].filter.call(document.querySelectorAll("[data-rappmenu]"), function (x) { var r = x.getBoundingClientRect(); if (!r.width) return false; var p = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!p && x.contains(p); }).pop(); if (!x) return false; x.click(); return true; };
window.__menu = function (t) { if (!__appMenu()) return Promise.resolve(false); return new Promise(function (r) { setTimeout(function () { r(__pick(t)); }, 400); }); };
window.__clk = function (sel, inTop) { var s = inTop && __layer() ? __layer().root : document; var a = s.querySelectorAll(sel), e = [].filter.call(a, __vis)[0] || [].filter.call(a, function (x) { return x.getClientRects().length && x.getBoundingClientRect().width > 0; })[0]; if (!e) return false; e.scrollIntoView({ block: "center" }); e.click(); return true; };
window.__act = function (act, label) { var b = [].filter.call(document.querySelectorAll('.rhead [data-act="' + act + '"]'), __vis)[0]; if (b) { b.click(); return Promise.resolve(true); } if (!__clk('.rhead [data-rmore]')) return Promise.resolve(false); return new Promise(function (r) { setTimeout(function () { r(__pick(label)); }, 400); }); };
/* the layer on top: an open window (dialog), else a side panel, else the screens */
window.__layer = function () {
  var d = [].filter.call(document.querySelectorAll("dialog[open]"), __vis).pop(); if (d) return { kind: "window", root: d, heads: [d.querySelector(".sheet-head")].filter(Boolean) };
  var p = [].filter.call(document.querySelectorAll(".rpanel"), __vis).pop(); if (p) return { kind: "panel", root: p, heads: [].filter.call(p.querySelectorAll(".rhead"), __vis) };
  return { kind: "screen", root: document.body, heads: [].filter.call(document.querySelectorAll(".rhead"), function (h) { return __vis(h) && !h.closest("dialog, .rpanel"); }) };
};
var px = function (v) { return parseFloat(v) || 0; };
var tok = function (n, at) { var p = document.createElement("div"); p.style.cssText = "position:absolute;visibility:hidden;padding-top:" + (n.indexOf("--") === 0 ? "var(" + n + ")" : n); (at || document.body).appendChild(p); var v = px(getComputedStyle(p).paddingTop); p.remove(); return v; };
var BAR = ".rrow, .racc, .racc__bar, .racc__body, .rmenu__item, .rmenu__list, .rmenu__head, .rmenu__foot, .rdiv, .rhead, .sheet-head, .sheet-body, .sheet-foot, .rlist, .rpopup-body, .rs-grab, .rtabs, .rplayer, .sheet";
var BLOCK = ".rcard, .rfield, .rgrid, .rfields, .rempty, .rbtn:not(.rbtn--icon)";
var SKIP = "style, script, template, svg *, .rmsg, .rfab, .rplayer, .rplayer *" + (window.__special ? ", " + window.__special + ", :is(" + window.__special + ") *" : "");
function inflow(k) { var s = getComputedStyle(k); return s.display !== "none" && s.position !== "absolute" && s.position !== "fixed" && k.getClientRects().length > 0; }
function kids(e) { var o = []; [].forEach.call(e.children, function (k) { if (k.matches(SKIP)) return; var d = getComputedStyle(k).display; if (d === "contents") o = o.concat(kids(k)); else if (inflow(k)) o.push(k); }); return o; }
function name(e) { return e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 2).join(".") : ""); }
function ownText(e) { for (var n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.textContent.trim()) return true; return false; }
function paints(e, bg) { var s = getComputedStyle(e); return (s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== bg) || s.boxShadow !== "none" || s.backgroundImage !== "none" || (px(s.borderTopWidth) > 0 && s.borderTopColor !== "rgba(0, 0, 0, 0)") || (px(s.borderBottomWidth) > 0 && s.borderBottomColor !== "rgba(0, 0, 0, 0)"); }
function pseudo(e) { return ["::before", "::after"].some(function (p) { var s = getComputedStyle(e, p); return s.content && s.content !== "none" && s.content !== "normal" && (s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.backgroundImage !== "none" || s.content.length > 2) && px(s.height) > 1 && +s.opacity > 0; }); }
function full(e) { return !!(e.textContent.trim() || e.matches("svg, img, input, select, textarea, button, canvas, video, [contenteditable]") || e.querySelector("svg, img, input, select, textarea, button, canvas, video, [contenteditable]")); }
/* the first box that shows something: wrappers that start where their first child starts are passed through */
function first(e, bg) {
  if (/^(INPUT|SELECT|TEXTAREA|BUTTON|IMG|VIDEO|CANVAS|svg)$/i.test(e.tagName) || ownText(e) || paints(e, bg) || e.matches(".rempty, .rrow, .rcard, .rdiv, .racc__bar, .rfield, .rchip, .rbtn, .rload")) return e;
  var ks = kids(e).filter(__vis).sort(function (a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
  if (!ks.length) return e;
  var s = getComputedStyle(e), off = ks[0].getBoundingClientRect().top - e.getBoundingClientRect().top - px(s.paddingTop) - px(s.borderTopWidth);
  return Math.abs(off) <= .5 ? first(ks[0], bg) : e;
}
/* the scroll areas of the layer: boxes that scroll (or would) and are seen; a field's own text box is not one */
function scrollers(root) { return [].filter.call(root.querySelectorAll("*"), function (e) { if (e.matches("textarea, .rf-rich, input, select, .rmenu, .rmenu *") || !__vis(e)) return false; var s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.clientHeight > 40; }); }
window.__audit = function (o) {
  o = o || {};
  var F = [], add = function (k, m) { F.push(k + " " + m); };
  var Lr = o.menu ? { kind: "menu", root: [].filter.call(document.querySelectorAll(".rmenu"), __vis).pop(), heads: [] } : __layer();
  if (!Lr.root) return ["no layer"];
  var R = Lr.root, bg = getComputedStyle(R).backgroundColor;
  var T = { tight: tok("--gap-tight"), gap: tok("--gap"), sec: tok("--gap-section") };
  /* every px value the dictionary names (principle 8 and law 1): a gap or a padding is one of these */
  var allowed = [0]; var cs = getComputedStyle(document.documentElement);
  for (var i = 0; i < cs.length; i++) { var n = cs[i]; if (n.indexOf("--") !== 0) continue; var v = tok(n); if (v > 0 && allowed.indexOf(v) < 0) allowed.push(v); }
  ["calc(var(--bar-b) + var(--gap))", "max(var(--sheet-b), calc(var(--bar-b) + var(--gap)))"].forEach(function (x) { var v = tok(x); if (v > 0) allowed.push(v); });   /* the dictionary's named combinations (above the app's bottom bar) */
  /* a live value the kit or the app writes as a custom property on a box (a tile's measured height, --rs-end of a window): a name, not a raw number */
  var live = function (e) { var o = []; for (var x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.style) for (var j = 0; j < x.style.length; j++) { var n2 = x.style[j]; if (n2.indexOf("--") === 0) { var v2 = tok(n2, x); if (v2 > 0) o.push(v2, v2 + tok("--gap")); }   /* and that value plus --gap: the top padding under a tile is its height and --gap (ui/docs/list.md "אריח שחוזר בגלילה") */ } } o.push(tok("--rs-end", e)); return o; };
  var ok = function (v, e) { return allowed.concat(e ? live(e) : []).some(function (a) { return Math.abs(a - v) <= .5; }); };
  var all = [R].concat([].slice.call(R.querySelectorAll("*"))).filter(function (e) { return !e.matches(SKIP) && !e.closest(".rplayer") && e.getClientRects().length && getComputedStyle(e).display !== "contents"; });
  all.forEach(function (e) {
    var s = getComputedStyle(e), inl = s.display === "inline";
    /* 1. principle 1: no margin (the declared exceptions: the window itself, a header's description, a text line inside a control) */
    if (!inl && e !== R && !e.matches("dialog, .rhead__tw, .rhead__tw *, input, select, textarea, button *, .rf-rich *, .rmenu")) {
      var mg = [s.marginTop, s.marginRight, s.marginBottom, s.marginLeft].map(px);
      if (mg.some(function (v) { return Math.abs(v) > .5; })) add("margin", name(e) + " " + mg.join("/"));
    }
    /* 7. principle 8: every padding and gap is a token */
    if (!inl && !e.matches("input, select, textarea, button, .rf-rich, .rf-rich *, [data-tile] *")) {
      [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map(px).forEach(function (v, k) { if (!ok(v) && !ok(v, e)) add("raw", name(e) + " padding " + ["top", "right", "bottom", "left"][k] + " " + v); });
      if (/flex|grid/.test(s.display)) [px(s.rowGap), px(s.columnGap)].forEach(function (v) { if (!ok(v) && !ok(v, e)) add("raw", name(e) + " gap " + v); });
    }
    /* 4. principle 5: nothing shown that holds nothing (a loading area is the content's place) */
    var par = e.parentElement, pd = par ? getComputedStyle(par).display : "";
    if (e !== R && /flex|grid/.test(pd) && inflow(e) && !full(e) && !paints(e, bg) && !pseudo(e) && !e.matches(".rload, .rload *, .rs-grab, hr, .rdiv, [role=separator]") && !e.closest("[aria-busy=true]")) add("empty", name(e) + " " + Math.round(e.getBoundingClientRect().height) + "px");
    /* 2. principle 1: a parent's children are exactly its gap apart; the gap is 0, --gap-tight or --gap; 0 only between bars */
    if (/flex/.test(s.display) && s.flexWrap === "nowrap" && /^(normal|flex-start|start|stretch)$/.test(s.justifyContent) && !e.matches("button, .rbtn, .rchip, .rhead, .rhead *, .racc__bar, .racc__bar *, .rrow, .rrow *, .rcard *, .rmenu__item, .bio-tabs, .bio-tabs *")) {
      var col = /column/.test(s.flexDirection), ks = kids(e).filter(__vis);
      if (ks.length > 1) {
        var g = col ? px(s.rowGap) : px(s.columnGap);
        ks.sort(function (a, b) { var A = a.getBoundingClientRect(), B = b.getBoundingClientRect(); return col ? A.top - B.top : A.left - B.left; });
        for (var q = 1; q < ks.length; q++) {
          var A = ks[q - 1].getBoundingClientRect(), B = ks[q].getBoundingClientRect(), d = col ? B.top - A.bottom : B.left - A.right;
          if (getComputedStyle(ks[q]).position === "sticky" || getComputedStyle(ks[q - 1]).position === "sticky") continue;   /* a stuck bar is out of its place by design */
          if (Math.abs(d - g) > .5) { add("gap", name(e) + ": " + name(ks[q - 1]) + " to " + name(ks[q]) + " " + Math.round(d * 10) / 10 + " (gap " + g + ")"); break; }
        }
        if ([0, T.tight, T.gap].every(function (v) { return Math.abs(v - g) > .5; })) add("gap", name(e) + " gap " + g + " is not 0, --gap-tight or --gap");
        if (col && g < .5 && ks.some(function (k) { return k.matches(BLOCK); }) && ks.some(function (k) { return k.matches(BLOCK) || !k.matches(BAR); }) && ks.length > 1 && ks.filter(function (k) { return k.matches(BLOCK); }).length > 1) add("gap", name(e) + " gap 0 between blocks");
      }
    }
  });
  /* 3. principles 2 and 3: each scroll area's walls: one owner, and the token of that wall */
  var sc = o.menu ? [].filter.call(R.querySelectorAll(".rmenu__list"), __vis) : scrollers(R);
  var SA = sc.filter(function (e) { return !e.matches("[data-tile-list]") && !e.matches(".rlayout--stack > .rlayout__body") &&   /* a stack's body is not a scroll area: the stack's gaps are its walls; it scrolls only when its content is taller than the window (never clipped) */ !(e.matches(".rfields > .rlist:last-child")) && !(e.previousElementSibling && getComputedStyle(e.previousElementSibling).position === "absolute" && __vis(e.previousElementSibling)); });   /* the pending tiles (ui/docs/list.md "אריח שחוזר בגלילה") keep their own layout for now */
  SA.forEach(function (a) {
    var as = getComputedStyle(a); if (a.scrollTop > 0) a.scrollTop = 0;
    var ks = kids(a).filter(__vis); if (!ks.length) return;
    var c = first(ks.sort(function (x, y) { return x.getBoundingClientRect().top - y.getBoundingClientRect().top; })[0], bg), cr = c.getBoundingClientRect(), ar = a.getBoundingClientRect();
    var bar = c.matches(".rrow, .racc__bar, .rmenu__item");
    var path = []; for (var x = c.parentElement; x && x !== a.parentElement; x = x.parentElement) path.push(x);   /* the boxes between the wall and the content, the area included */
    var owners = function (side) { return path.filter(function (x) { return px(getComputedStyle(x)["padding" + side]) > .5; }).map(name); };
    var barList = !o.menu && !a.matches(".rmenu__list") && bar;   /* a menu keeps --gap above its first item and below its last (the owner's earlier decision) */   /* a list of bars (section bars, rows): no top padding, the first bar right under the header; its end padding stays (owner 2026-11-26) */
    var tl = a.previousElementSibling, rq = tl && tl.matches("[data-rquick]") && __vis(tl) && Math.abs(tl.getBoundingClientRect().top - ar.top) < 1 ? tl.getBoundingClientRect().height : 0;   /* the list's top block over the list (a phone, ui/docs/list.md "אריח שחוזר בגלילה"): the list leaves its height above the token */
    var top = cr.top - ar.top - px(as.borderTopWidth), want = (barList ? 0 : T.gap) + rq;
    if (Math.abs(top - want) > .5) add("wall", name(a) + " top: to " + name(c) + " " + Math.round(top * 10) / 10 + " (want " + want + ")");
    var ot = owners("Top"); if (ot.length !== (barList ? 0 : 1)) add("wall", name(a) + " top owners: " + (ot.join(", ") || "none") + (barList ? " (want none: a list of bars)" : ""));
    var sbw = a.offsetWidth - a.clientWidth - px(as.borderLeftWidth) - px(as.borderRightWidth);
    /* the sides: the boxes that reach furthest to each wall (a centred button or the second of two fields is not the edge of the content) */
    var CB = ".rcard, .rfield, .rrow, .racc__bar, .rbtn--block, .rdiv, .rmenu__item";
    var cbs = [].filter.call(a.querySelectorAll(CB), function (x) { return __vis(x) && !x.matches(SKIP) && !x.matches(".rdiv--line") && x.getBoundingClientRect().top < ar.bottom; });
    if (cbs.length) {
      var lb = cbs.slice().sort(function (x, y) { return x.getBoundingClientRect().left - y.getBoundingClientRect().left; })[0], rb = cbs.slice().sort(function (x, y) { return y.getBoundingClientRect().right - x.getBoundingClientRect().right; })[0];
      c = lb.matches(".rrow, .racc__bar") ? lb : rb.matches(".rrow, .racc__bar") ? rb : lb; bar = c.matches(".rrow, .racc__bar, .rmenu__item");
      cr = { left: lb.getBoundingClientRect().left, right: rb.getBoundingClientRect().right };
      path = []; for (var y2 = c.parentElement; y2 && y2 !== a.parentElement; y2 = y2.parentElement) path.push(y2);
    }
    var left = cr.left - ar.left - px(as.borderLeftWidth) - (getComputedStyle(a).direction === "rtl" ? sbw : 0), right = ar.right - cr.right - px(as.borderRightWidth) - (getComputedStyle(a).direction === "rtl" ? 0 : sbw);
    if (bar) {
      if (left > .5 || right > .5) add("wall", name(a) + " sides: the bar " + name(c) + " does not touch the walls (" + Math.round(left) + "/" + Math.round(right) + ")");
      var bs = getComputedStyle(c); if (Math.abs(px(bs.paddingLeft) - T.gap) > .5 || Math.abs(px(bs.paddingRight) - T.gap) > .5) add("wall", name(c) + " a bar pads its sides " + px(bs.paddingLeft) + "/" + px(bs.paddingRight) + " (want " + T.gap + ")");
      ["Left", "Right"].forEach(function (sd) { var ow = owners(sd); if (ow.length) add("wall", name(a) + " " + sd.toLowerCase() + ": also padded by " + ow.join(", ") + " over a bar"); });
    } else if (!c.matches(".rempty, .rload")) {
      if (Math.abs(left - T.gap) > .5 || Math.abs(right - T.gap) > .5) add("wall", name(a) + " sides: to " + name(c) + " " + Math.round(left * 10) / 10 + "/" + Math.round(right * 10) / 10 + " (want " + T.gap + ")");
      ["Left", "Right"].forEach(function (sd) { var ow = owners(sd); if (ow.length !== 1) add("wall", name(a) + " " + sd.toLowerCase() + " owners: " + (ow.join(", ") || "none")); });
    }
  });
  if (o.menu) {
    var m = R, ink = [].filter.call(m.querySelectorAll(".rmenu__item, .rmenu__head > *, .rmenu__foot > *"), function (e) { return e.getClientRects().length && e.getBoundingClientRect().height > 1; });
    if (ink.length) { var mr = m.getBoundingClientRect(), f0 = ink[0].getBoundingClientRect(), z = ink[ink.length - 1].getBoundingClientRect(), li = m.querySelector(".rmenu__list"), zb = z.bottom;
      if (li && li.scrollHeight > li.clientHeight + 2) zb -= li.scrollHeight - li.clientHeight - li.scrollTop;
      if (Math.abs(f0.top - mr.top - T.gap) > 1 || Math.abs(mr.bottom - zb - T.gap) > 1) add("wall", "menu: above the first " + Math.round(f0.top - mr.top) + ", below the last " + Math.round(mr.bottom - zb) + " (want " + T.gap + ")"); }
  }
  /* 5. principle 6: the page never scrolls; one scrolling box per window, never holding a header or a foot; a window carries no inline layout */
  if (document.documentElement.scrollHeight > innerHeight + .5) add("scroll", "the page scrolls: " + document.documentElement.scrollHeight + " > " + innerHeight);
  if (Lr.kind !== "screen" && !o.menu) {
    var live = scrollers(R).filter(function (e) { return e.scrollHeight > e.clientHeight + 2 && !e.closest(".rfields") ; });
    if (live.length > 1) add("scroll", "more than one scroller: " + live.map(name).join(", "));
    live.forEach(function (e) { if (e.querySelector(".rhead, .sheet-head, .sheet-foot")) add("scroll", name(e) + " scrolls a header or a foot"); });
    for (var t = 0; t < R.style.length; t++) { var pn = R.style[t]; if (pn.indexOf("--") !== 0 && !(R.hasAttribute("data-anchored") && /^(top|left|right|bottom)$/.test(pn)) && !(R.classList.contains("rpanel"))) add("own", "inline layout on the window: " + pn); }
  }
  return F;
};
/* 6. principle 7: a section bar never moves when it opens, closes or sticks; one edge under the fixed block */
window.__bars = function () { var Lr = __layer(); return [].filter.call(Lr.root.querySelectorAll(".racc__bar"), function (b) { return __vis(b) && b.querySelector(".racc__head") && !b.parentElement.parentElement.closest(".racc"); }).slice(0, 3); };
window.__barTop = function (i) { var b = __bars()[i]; return b ? b.getBoundingClientRect().top : null; };
window.__barToggle = function (i) { var b = __bars()[i]; if (!b) return false; b.querySelector(".racc__head").click(); return true; };
window.__barName = function (i) { var b = __bars()[i]; return b ? b.textContent.trim().slice(0, 14) : ""; };
window.__scrollMain = function (y) { var Lr = __layer(); var s = scrollers(Lr.root).filter(function (e) { return e.scrollHeight > e.clientHeight + 40; }).sort(function (a, b) { return b.clientHeight - a.clientHeight; })[0]; if (!s) return null; s.scrollTop = y; return name(s); };
/* 7. every section open, nested ones too (owner 2026-11-26): opened round by round until none is left closed (a nested one shows only once its parent is open) */
window.__openAll = function () { var Lr = __layer(), n = 0; return new Promise(function (done) { (function round(k) { var c = [].filter.call(Lr.root.querySelectorAll('.racc__head[aria-expanded="false"]'), __vis); c.forEach(function (h) { h.click(); n++; }); if (!c.length || k > 4) done(n); else setTimeout(function () { round(k + 1); }, 450); })(0); }); };
/* a section bar keeps its tail (the chevron and the actions) inside the bar and the window, the bar stays within its scroller, and a title or a sub that does not fit ends in an ellipsis */
window.__tails = function () { var F = [], Lr = __layer(); [].forEach.call(Lr.root.querySelectorAll(".racc__bar"), function (bar) { if (!__vis(bar)) return; var r = bar.getBoundingClientRect(), nm = (bar.querySelector(".racc__title") || bar).textContent.trim().slice(0, 14);
  if (r.left < -.5 || r.right > innerWidth + .5) F.push("tail: bar \"" + nm + "\" is wider than the window (" + Math.round(r.left) + " to " + Math.round(r.right) + ")");
  [].forEach.call(bar.querySelectorAll(".racc__chev, .racc__end > *"), function (e) { var q = e.getBoundingClientRect(); if (!q.width || q.left < Math.max(r.left, 0) - .5 || q.right > Math.min(r.right, innerWidth) + .5) F.push("tail: \"" + nm + "\" " + name(e) + " is out of view"); });
  [].forEach.call(bar.querySelectorAll(".racc__title, .racc__sub"), function (t) { if (t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow !== "ellipsis") F.push("tail: \"" + nm + "\" " + name(t) + " is cut with no ellipsis"); }); }); return F; };
/* principle 7: between the bottom of the fixed block above a stuck bar (the header) and the bar, nothing but the page: no scrolled content shows through the strip */
window.__strip = function () { var Lr = __layer(), b = Lr.root.querySelector(".racc__bar[data-stuck]"), h = Lr.heads[0] || [].filter.call(Lr.root.querySelectorAll(".rhead"), __vis)[0]; if (!b || !h) return null;
  var hb = h.getBoundingClientRect().bottom, br = b.getBoundingClientRect(), bad = [];
  for (var y = Math.ceil(hb) + 1; y < br.top - .5; y += 2) for (var k = 1; k < 6; k++) { var x = br.left + br.width * k / 6, e = document.elementFromPoint(x, y); if (e && !e.contains(b) && !b.contains(e) && !e.closest(".rhead, .sheet-head")) bad.push(name(e) + "@" + Math.round(y)); }
  return { gap: Math.round((br.top - hb) * 10) / 10, bad: bad.slice(0, 4) }; };
/* 8. A SHADOW IS NEVER CUT (owner 2026-11-26): a raised or floating element's shadow (.ricon-lg, .rfab, a card, a button) falls softly; no box between it and its layer clips it.
   Each outer shadow reaches spread + 3/4 of its blur past the box (moved by its offset; past that its ink is under ~3%, a cut there is not seen); every clipping box up the way
   (overflow other than visible on that axis, or an inset() clip-path) must hold that reach. An element already cut by its own box (scrolled partly out) is not judged here */
window.__shadows = function () { var F = [], Lr = __layer(), R = Lr.root;
  var clipOf = function (x) { var s = getComputedStyle(x), r = x.getBoundingClientRect(), c = null, hx = s.overflowX !== "visible", hy = s.overflowY !== "visible";
    if (hx || hy) c = { l: hx ? r.left + px(s.borderLeftWidth) : -1e9, r: hx ? r.right - px(s.borderRightWidth) : 1e9, t: hy ? r.top + px(s.borderTopWidth) : -1e9, b: hy ? r.bottom - px(s.borderBottomWidth) : 1e9 };
    /* a scroll area clips a shadow at REST only at the walls of its scrolled content (its padding box at the start and the end of the scroll), never at the scrollport's edge:
       there a shadow is cut only by where the list is scrolled to, and scrolling shows it whole. So on a scrolling axis the walls are the content's, moved by the scroll */
    if (c && /(auto|scroll)/.test(s.overflowY)) { var t0 = c.t - x.scrollTop; c.t = Math.min(c.t, t0); c.b = Math.max(c.b, t0 + x.scrollHeight); }
    if (c && /(auto|scroll)/.test(s.overflowX)) { var l0 = s.direction === "rtl" ? c.r - x.scrollLeft - x.scrollWidth : c.l - x.scrollLeft; c.l = Math.min(c.l, l0); c.r = Math.max(c.r, l0 + x.scrollWidth); }   /* RTL: scrollLeft runs from 0 toward negative, the content hangs from the end wall */
    var m = /^inset\(([^)]*)\)/.exec(s.clipPath); if (m) { var v = m[1].split(" round ")[0].trim().split(/\s+/).map(px); if (v.length === 1) v = [v[0], v[0], v[0], v[0]]; else if (v.length === 2) v = [v[0], v[1], v[0], v[1]]; else if (v.length === 3) v = [v[0], v[1], v[2], v[1]];
      var k = { t: r.top + v[0], r: r.right - v[1], b: r.bottom - v[2], l: r.left + v[3] }; c = c ? { t: Math.max(c.t, k.t), r: Math.min(c.r, k.r), b: Math.min(c.b, k.b), l: Math.max(c.l, k.l) } : k; }
    return c; };
  [R].concat([].slice.call(R.querySelectorAll("*"))).forEach(function (e) {
    if (!__vis(e) || e.matches("dialog, .rpanel, .rmenu, .rmenu *")) return; var bs = getComputedStyle(e).boxShadow; if (!bs || bs === "none") return;
    var reach = { t: 0, r: 0, b: 0, l: 0 };
    bs.split(/,(?![^(]*\))/).forEach(function (sh) { if (/\binset\b/.test(sh)) return; var n = (sh.replace(/rgba?\([^)]*\)|oklch\([^)]*\)|color-mix\(.*\)|#[0-9a-f]+|[a-z]+\([^)]*\)/gi, "").match(/-?[\d.]+px/g) || []).map(px); if (n.length < 2) return;
      var ox = n[0], oy = n[1], bl = n[2] || 0, sp = n[3] || 0, a = sp + bl * .75; if (a <= 0) return;
      reach.t = Math.max(reach.t, a - oy); reach.b = Math.max(reach.b, a + oy); reach.l = Math.max(reach.l, a - ox); reach.r = Math.max(reach.r, a + ox); });
    if (reach.t <= .5 && reach.b <= .5 && reach.l <= .5 && reach.r <= .5) return;
    var er = e.getBoundingClientRect(), want = { t: Math.max(0, er.top - reach.t), b: Math.min(innerHeight, er.bottom + reach.b), l: Math.max(0, er.left - reach.l), r: Math.min(innerWidth, er.right + reach.r) };   /* past the screen's edge nothing is seen, cut or not */
    for (var x = e.parentElement; x && x !== document.documentElement; x = x.parentElement) { var c = clipOf(x); if (c) {
      if (er.top < c.t - .5 || er.bottom > c.b + .5 || er.left < c.l - .5 || er.right > c.r + .5) return;   /* the element itself is cut (scrolled partly out of its area): not a shadow matter */
      var cut = []; if (want.t < c.t - .5) cut.push("top " + Math.round(c.t - want.t)); if (want.b > c.b + .5) cut.push("bottom " + Math.round(want.b - c.b)); if (want.l < c.l - .5) cut.push("left " + Math.round(c.l - want.l)); if (want.r > c.r + .5) cut.push("right " + Math.round(want.r - c.r));
      if (cut.length) { F.push("shadow: " + name(e) + " is cut by " + name(x) + " (" + cut.join(", ") + "px)"); return; } }
      if (x === R) break; }
  }); return F; };
window.__edges = function () { var Lr = __layer(); return [].filter.call(Lr.root.querySelectorAll(".rhead, .sheet-head, .racc__bar, .rfields > *"), function (e) { if (!__vis(e)) return false; var s = getComputedStyle(e, "::after"); return s.content !== "none" && +s.opacity > .5 && px(s.height) > 1 && s.backgroundImage !== "none"; }).map(name); };
`;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: (L.init || "") + "\nwindow.__special = " + JSON.stringify(L.special || "") + ";\n" + PAGE });   /* the app's own special parts (CLAUDE.md: no generic counterpart) are not audited here */
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
const home = async () => { await send("Page.navigate", { url: "http://localhost:" + DEV + L.path }); await sleep(3500); };
let bad = 0, okN = 0, skipped = 0, absentN = 0; const out = []; const tag = (n) => n.replace(/[^a-z0-9]+/gi, "-");
/* a SKIP is a FAIL: an opener that finds nothing means the screen was not audited. The one way out is the openers file's short allowlist,
   absent = { "<screen or menu name>": (width) => true when it does not exist at that width } (a computer-only panel at a phone's width) */
const ABSENT = L.absent || {};
const skip = (name, why) => { if (ABSENT[name] && ABSENT[name](W)) { absentN++; out.push("n/a  " + name + ": not at " + W + "px (allowlisted)"); } else { bad++; skipped++; out.push("SKIP " + name + ": " + why + " (FAILS: an opener that should exist)"); } };
const report = (name, F) => { if (!F.length) okN++; if (F.length) { bad++; out.push("FAIL " + name + "\n" + F.slice(0, 12).map(f => "       " + f).join("\n") + (F.length > 12 ? "\n       ... " + (F.length - 12) + " more" : "")); } else out.push("ok   " + name); };
for (const [name, open, expect] of L.screens) {   /* expect (optional): a selector that is seen only on the screen this opener opens */
  if (ONLY && name.indexOf(ONLY) < 0) continue;
  try {
    await home(); const ok = await open(ev, sleep); await sleep(2200);
    if (!ok) { skip(name, "opener not found"); continue; }
    if (expect && !(await ev(`[].some.call(document.querySelectorAll(${JSON.stringify(expect)}), __vis)`))) { bad++; out.push("FAIL " + name + ": the opener ended on the wrong screen (" + expect + " is not seen)"); continue; }   /* an opener that lands elsewhere fails, it never audits the wrong screen as ok */
    if (process.env.LAYOUT_SHOTS) await shot(process.env.LAYOUT_SHOTS + "/layout_" + W + "_" + tag(name) + ".png");
    const F = await ev(`__audit()`);
    for (const f of await ev(`__shadows()`)) F.push(f);   /* 8. no shadow is cut by a box around it */
    const n = await ev(`__bars().length`);
    for (let i = 0; i < n; i++) {
      const nm = await ev(`__barName(${i})`), t0 = await ev(`__barTop(${i})`); await ev(`__barToggle(${i})`); await sleep(450);
      const t1 = await ev(`__barTop(${i})`); await ev(`__barToggle(${i})`); await sleep(450); const t2 = await ev(`__barTop(${i})`);
      if (t1 == null || t2 == null || Math.abs(t1 - t0) > .5 || Math.abs(t2 - t0) > .5) F.push("bar \"" + nm + "\" moved " + [t0, t1, t2].map(v => v == null ? "-" : Math.round(v * 10) / 10).join(" / "));
    }
    if (n) {   /* stuck: at its resting place, and one edge under the fixed block */
      const t0 = await ev(`__barTop(0)`), sc = await ev(`__scrollMain(400)`); await sleep(500);
      if (sc) { const stuck = await ev(`(function(){ var b=document.querySelector(".racc__bar[data-stuck]"); return b ? b.getBoundingClientRect().top : null; })()`); const ed = await ev(`__edges()`);
        if (stuck != null && Math.abs(stuck - t0) > .5) F.push("a stuck bar sits at " + Math.round(stuck * 10) / 10 + ", it rests at " + Math.round(t0 * 10) / 10);
        if (ed.length > 1) F.push("more than one edge under the fixed block: " + ed.join(", "));
        const st = await ev(`__strip()`); if (st && st.bad.length) F.push("content shows between the header and the stuck bar (" + st.gap + "px): " + st.bad.join(", "));
        await ev(`__scrollMain(0)`); }
    }
    if (n || await ev(`!!__layer().root.querySelector(".racc__head")`)) {   /* the same screen with every section open, nested ones too: the whole audit again, and the tails */
      const opened = await ev(`__openAll()`); await sleep(600);
      if (opened) { if (process.env.LAYOUT_SHOTS) await shot(process.env.LAYOUT_SHOTS + "/layout_" + W + "_" + tag(name) + "_open.png");
        const seen = new Set(F); for (const f of await ev(`__audit()`)) if (!seen.has(f)) F.push("all open: " + f); }
      for (const f of await ev(`__tails()`)) F.push(f);
    }
    report(name, F);
  } catch (e) { bad++; out.push("FAIL " + name + ": " + e.message.slice(0, 200)); }
}
for (const [name, open] of (L.menus || [])) {
  if (ONLY && name.indexOf(ONLY) < 0) continue;
  try {
    await home(); const ok = await open(ev, sleep); await sleep(700);
    const has = ok && await ev(`!![].filter.call(document.querySelectorAll(".rmenu"), __vis).length`);
    if (!has) { skip(name, "no menu opened"); continue; }
    if (process.env.LAYOUT_SHOTS) await shot(process.env.LAYOUT_SHOTS + "/layout_" + W + "_" + tag(name) + ".png");
    report(name, await ev(`__audit({ menu: true })`));
  } catch (e) { bad++; out.push("FAIL " + name + ": " + e.message.slice(0, 200)); }
}
try { ws.close(); } catch (e) { /* closing */ } try { process.kill(proc.pid); } catch (e) { /* gone */ }
console.log("layout audit, " + (L.app || listFile) + ", " + W + "px");
console.log(out.join("\n"));
console.log(okN + " ok, " + (bad - skipped) + " failed, " + skipped + " skipped (failing), " + absentN + " n/a (allowlisted)");
console.log(bad ? bad + " FAILED" : "all ok"); process.exit(bad ? 1 : 0);
