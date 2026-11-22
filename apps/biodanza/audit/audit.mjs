// Spacing audit: opens the app at a phone/desktop width with stubbed data and lists every padding, margin and gap that is not on the scale (0, 4, 8, 16, 24).
// Run: node apps/biodanza/audit/server.mjs (serves dist on :5191), then node apps/biodanza/audit/audit.mjs 430   (or 1300). Sizes that clear a button (44, 76, 92) and the safe-area floor are expected; anything else is a spacing someone invented.
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 430, H = 900;
const b = await launch(W, H);
const SCALE = [0, 4, 8, 16, 24];
const click = (js) => b.ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`);
const probe = `(function(){
  var SC=${JSON.stringify(SCALE)}, out={}, vis=function(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=="hidden"};
  function path(e){var p=[];while(e&&e.nodeType==1&&p.length<3){var s=e.tagName.toLowerCase();if(e.id)s+="#"+e.id;else if(e.className&&typeof e.className=="string")s+="."+e.className.trim().split(/\s+/)[0];p.unshift(s);e=e.parentElement}return p.join(">")}
  [].forEach.call(document.querySelectorAll("body *"),function(e){
    if(!vis(e)||/^(SVG|PATH|SCRIPT|STYLE|CIRCLE|RECT|LINE|G|POLYLINE|USE)$/i.test(e.tagName)||e.closest("svg"))return;
    var cs=getComputedStyle(e);
    ["paddingTop","paddingBottom","paddingLeft","paddingRight","marginTop","marginBottom","marginLeft","marginRight","rowGap","columnGap"].forEach(function(k){
      var v=cs[k]; if(v==="normal"||v==="auto")return; var n=parseFloat(v); if(!isFinite(n))return; n=Math.round(n*10)/10;
      if(SC.indexOf(Math.abs(n))<0){ var key=k+"="+n+"px  "+path(e); out[key]=(out[key]||0)+1 }
    })});
  return JSON.stringify(out)})()`;
const shot = async (name) => { const o = JSON.parse(await b.ev(probe)); const ks = Object.keys(o); console.log("== " + name + " (" + ks.length + ")"); ks.sort().slice(0, 60).forEach(k => console.log("  " + k + (o[k] > 1 ? "  x" + o[k] : ""))); };
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable");
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" });
  await b.sleep(3000);
  await shot("home");
  await click(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await b.sleep(1800);
  await shot("vivencia");
  await click(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await b.sleep(1800);
  await shot("exercise");
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
