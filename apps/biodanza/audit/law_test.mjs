import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 430, H = 900;
const b = await launch(W, H);
const click = (js) => b.ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`);
const probe = `(function(){var out={};
 function path(e){var p=[];while(e&&e.nodeType==1&&p.length<3){var s=e.tagName.toLowerCase();if(e.id)s+="#"+e.id;else if(e.className&&typeof e.className=="string")s+="."+e.className.trim().split(/\s+/)[0];p.unshift(s);e=e.parentElement}return p.join(">")}
 [].forEach.call(document.querySelectorAll("body *"),function(e){
   var r=e.getBoundingClientRect(); if(!r.width||!r.height||e.closest("svg")) return;
   var par=e.parentElement; if(!par) return; var ps=getComputedStyle(par); if(!/flex|grid/.test(ps.display)) return;
   var hasGap=(parseFloat(ps.rowGap)||0)>0||(parseFloat(ps.columnGap)||0)>0; if(!hasGap) return; if(e.closest("dialog:not([open])")) return;
   var cs=getComputedStyle(e);
   ["marginTop","marginBottom","marginLeft","marginRight"].forEach(function(k){var n=parseFloat(cs[k]); if(n!==0){var key=k+"="+n+"px  "+path(e)+"  (parent gap "+ps.rowGap+"/"+ps.columnGap+")"; out[key]=(out[key]||0)+1}});
 }); return JSON.stringify(out)})()`;
const shot = async (name) => { const o = JSON.parse(await b.ev(probe)); const ks = Object.keys(o); console.log("== " + name + " (" + ks.length + ")"); ks.sort().slice(0, 40).forEach(k => console.log("  " + k + (o[k] > 1 ? "  x" + o[k] : ""))); };
const kidpad = `(function(){var bad={};[].forEach.call(document.querySelectorAll("dialog[open] .sheet, .rmenu, .bio-c"),function(s){[].forEach.call(s.children,function(c){var cs=getComputedStyle(c);var p=(s.classList.contains("rmenu")?["paddingTop","paddingBottom"]:["paddingTop","paddingBottom","paddingLeft","paddingRight"]).map(function(k){return parseFloat(cs[k])||0});if(p.some(function(x){return x})){bad[(s.id||s.className.split(" ")[0])+" > "+c.tagName.toLowerCase()+"."+String(c.className).split(" ")[0]+" padding "+p.join("/")]=1}})});return JSON.stringify(bad)})()`;   /* law 2: a surface pads its content, its children add no padding of their own (a menu paints its rows, so its heads and rows pad the sides: only vertical padding is flagged there) */
const kids = async (name) => { const o = JSON.parse(await b.ev(kidpad)); const ks = Object.keys(o); console.log("== child padding in surfaces: " + name + " (" + ks.length + ")"); ks.forEach(k => console.log("  " + k)); };
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
  await click(`document.querySelector('[data-hist]')`); await b.sleep(1500);
  await shot("history");
  await click(`document.querySelector('[data-act="homemore"]')`); await b.sleep(500);
  await shot("menu");
  await kids("menu");
  await b.ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))"); await b.sleep(300);
  await click(`document.querySelector('[data-vrow=\"v1\"] .rrow__main')`); await b.sleep(1800);
  await click(`document.querySelector('[data-icard=\"i1\"] [data-idel]')`); await b.sleep(900);
  await shot("confirm"); await kids("confirm");
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
