// Law 9 audit: content overflowing its own box, fixed min-width narrower than content, horizontal page scroll.
// Own Chrome (port 9401) and profile; own static server on 5417 serving dist/.
// usage: node overflow_test.mjs <width> [screenshot-prefix]
import fs from "fs"; import http from "http"; import path from "path"; import { spawn } from "child_process";
const W = +process.argv[2] || 430, H = 900, PORT = 9401, SP = 5417;
const root = path.normalize("C:/Users/ofira/Desktop/floa/dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const srv = http.createServer((req, res) => {
  let f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
  if (!fs.existsSync(f)) f = path.join(root, "biodanza/index.html");
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(SP, r));
const proc = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=" + PORT, "--user-data-dir=C:/tmp/bio/overflow-prof-" + process.pid, "--no-first-run", "--autoplay-policy=no-user-gesture-required", "--hide-scrollbars", "--window-size=" + W + "," + H, "about:blank"], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 2500));
const pages = await (await fetch("http://localhost:" + PORT + "/json")).json();
const ws = new WebSocket(pages.find(p => p.type === "page").webSocketDebuggerUrl); let id = 0; const pend = {};
ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (file) => { const r = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.result.data, "base64")); };
const click = async (js) => { const r = await ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`); if (r === 'none') console.log('  (selector missing: ' + js.slice(0, 70) + ')'); return r; };
const esc = () => ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
// A: content overflows its own box (not ellipsis, not an intended scroller).
// B: an element with a non-zero min-width / px flex-basis whose content is wider than its box.
const probe = `(function(){var A=[],B=[];
 function nm(e){var s=e.tagName.toLowerCase();if(e.id)s+="#"+e.id;else if(e.className&&typeof e.className=="string")s+="."+e.className.trim().split(/\\s+/).slice(0,2).join(".");return s}
 [].forEach.call(document.querySelectorAll("body *"),function(e){
   if(e.closest("svg")||e.classList.contains("bio-tabs")||e.closest("dialog:not([open])")||e.closest("[hidden]")) return;
   var cs=getComputedStyle(e); if(cs.display=="none"||cs.display=="contents"||cs.visibility=="hidden"||(cs.clipPath&&cs.clipPath!="none")) return;
   var r=e.getBoundingClientRect(); if(!r.width||!r.height) return;
   var ell=cs.textOverflow=="ellipsis"&&cs.overflowX!="visible";
   var scr=cs.overflowX=="auto"||cs.overflowX=="scroll";
   if(e.scrollWidth>e.clientWidth+1&&!ell&&!scr&&e.clientWidth>0){
     var lo=1e9,hi=-1e9; [].forEach.call(e.children,function(c){var q=c.getBoundingClientRect(); if(!q.width) return; var ccs=getComputedStyle(c); if(ccs.position=="absolute"||ccs.position=="fixed") return; lo=Math.min(lo,q.left); hi=Math.max(hi,q.right)});
     var tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n; while((n=tw.nextNode())){ if(n.parentNode!==e||!n.textContent.trim()) continue; var tr=document.createRange(); tr.selectNodeContents(n); var q2=tr.getBoundingClientRect(); lo=Math.min(lo,q2.left); hi=Math.max(hi,q2.right)}
     var L=r.left+(parseFloat(cs.borderLeftWidth)||0), R=r.right-(parseFloat(cs.borderRightWidth)||0);
     if(hi>R+1||lo<L-1) A.push(nm(e)+" box="+Math.round(r.width)+" content="+Math.round(hi-lo)+" over="+Math.round(Math.max(hi-R,L-lo)));
   }
   if((e.children.length||e.textContent.trim())&&!ell&&!scr){
     var rg=document.createRange(); rg.selectNodeContents(e); var cr=rg.getBoundingClientRect();
     if(cr.width>r.width+1&&cr.width<4000&&(cs.minWidth!="0px"&&cs.minWidth!="auto"||cs.flexBasis.indexOf("px")>0)) B.push(nm(e)+" box="+Math.round(r.width)+" content="+Math.round(cr.width)+" minW="+cs.minWidth);
   }
 });
 var de=document.documentElement; var page=de.scrollWidth>de.clientWidth+1?("PAGE-HSCROLL sw="+de.scrollWidth+" cw="+de.clientWidth):"";
 return JSON.stringify({A:A,B:B,page:page})})()`;
// C: authored size declarations (width/min-width/max-width/height/min-height) in raw px/rem/em/ch units, read from the CSSOM and inline styles.
// Not counted: var()/calc(var()) sizes (tokens), percentages, auto, 0 and 1px (visually hidden). Media-query rules are listed separately.
function sizeFn() {
  var raw = {}, mq = {}, re = /(^|;|\s|\{)(min-width|max-width|width|min-height|max-height|height)\s*:\s*([^;}]*)/g;
  function bad(v) { return /[0-9.]+(px|rem|em|ch)\b/.test(v) && !/var\(/.test(v) && !/^\s*(0|1px|0px)\s*(!important)?\s*$/.test(v); }
  function walk(rules, inMq) {
    [].forEach.call(rules, function (r) {
      if (r.type == 4 || r.type == 12) { if (r.type == 4 && /(min|max)-(width|height)/.test(r.conditionText)) mq[r.conditionText] = 1; walk(r.cssRules, true); return; }
      if (!r.style) return; var t = r.cssText, m, body = t.slice(t.indexOf("{")); re.lastIndex = 0;
      while ((m = re.exec(body))) if (bad(m[3])) raw[(inMq ? "[in @media] " : "") + r.selectorText.slice(0, 60) + " { " + m[2] + ": " + m[3].trim().slice(0, 50) + " }"] = 1;
    });
  }
  [].forEach.call(document.styleSheets, function (ss) { try { walk(ss.cssRules, false); } catch (e) {} });
  [].forEach.call(document.querySelectorAll("[style]"), function (e) {
    if (e.closest("svg")) return; var st = e.getAttribute("style"), m; re.lastIndex = 0;
    while ((m = re.exec(st))) if (bad(m[3])) raw["inline " + e.tagName.toLowerCase() + " { " + m[2] + ": " + m[3].trim().slice(0, 40) + " }"] = 1;
  });
  return JSON.stringify({ raw: Object.keys(raw), mq: Object.keys(mq) });
}
const sizeProbe = "(" + sizeFn.toString() + ")()";
// C: authored size declarations in raw px/rem/em/ch (CSSOM + inline styles). Not counted: var() tokens, %, auto, 0, 1px. Media-query conditions listed as class B.
let totA = 0, totB = 0, totP = 0;
const rep = async (name) => {
  const o = JSON.parse(await ev(probe)); const a = [...new Set(o.A)], b = [...new Set(o.B)];
  totA += a.length; totB += b.length; if (o.page) totP++;
  console.log("== " + name + "  overflow=" + a.length + " fixedNarrow=" + b.length + (o.page ? "  " + o.page : ""));
  a.slice(0, 8).forEach(x => console.log("  O " + x)); b.slice(0, 8).forEach(x => console.log("  F " + x));
};
try {
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await send("Page.navigate", { url: "http://localhost:" + SP + "/biodanza/" });
  await sleep(3000);
  const S = process.argv[3] ? process.argv[3] + "-" + W + "-" : null;
  const sh = async (n) => { if (S) await shot(S + n + ".png"); };
  await rep("home"); await sh("home");
  await click(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await sleep(1800);
  await rep("vivencia"); await sh("vivencia");
  await click(`document.querySelector('[data-icard="i3"] [data-edit]')`); await sleep(3500);
  await rep("exercise-editor"); await sh("exercise");
  await click(`document.querySelector('[data-addm]')`); await sleep(1500);
  await rep("add-music"); await sh("addmus");
  await esc(); await sleep(500); await esc(); await sleep(500);
  await click(`document.querySelector('[data-hist]')`); await sleep(1500);
  await rep("history"); await sh("hist");
  await esc(); await sleep(400);
  await click(`document.querySelector('[data-catopen]')`); await sleep(1500);
  await rep("catalog tab 1"); await sh("cat1");
  await click(`document.querySelector('[data-cat]:not([aria-expanded="true"]), [data-pkt]:not([aria-selected="true"]), .bio-tabs [role=tab]:not([aria-selected="true"])')`); await sleep(900);
  await rep("catalog tab 2"); await sh("cat2");
  await send("Page.navigate", { url: "http://localhost:" + SP + "/biodanza/" }); await sleep(3000);
  await click(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await sleep(1800);
  await click(`document.querySelector('[data-icard="i1"] [data-idel]')`); await sleep(900);
  await rep("popup (confirm)"); await sh("popup");
  await esc(); await sleep(400);
  const pl = await click(`document.querySelector('[data-icard="i1"] [data-audio], [data-audio]')`); await sleep(1500);
  await rep("dock (play: " + pl + ")"); await sh("dock");
  const sz = JSON.parse(await ev(sizeProbe));
  console.log("== authored raw sizes (class C candidates): " + sz.raw.length + "   media-query breakpoints (class B): " + sz.mq.length);
  sz.raw.forEach(x => console.log("  C " + x)); sz.mq.forEach(x => console.log("  B " + x));
  console.log("TOTAL overflow=" + totA + " fixedNarrow=" + totB + " pageHscroll=" + totP + " @" + W);
} catch (e) { console.log("FATAL", e.stack); } finally { try { ws.close(); } catch (e) {} try { process.kill(proc.pid); } catch (e) {} srv.close(); process.exit(0); }
