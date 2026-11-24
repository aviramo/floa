// card geometry: padding on all four sides, row pitch, glyph gap between the two icon rows, heights.
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
const probe = `(function(){ var out=[]; [].forEach.call(document.querySelectorAll(".bio-c"),function(c){ var r=c.getBoundingClientRect(); if(!r.width) return; var cs=getComputedStyle(c); var pad=[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft].join("/"); var ink=[]; [].forEach.call(c.querySelectorAll("svg, .bio-c__tx, .bio-c__lead, .bio-dur, .rchip"),function(e){var q=e.getBoundingClientRect(); if(q.width&&q.height) ink.push(q)}); if(!ink.length) return; var top=Math.min.apply(0,ink.map(function(q){return q.top}))-r.top, bot=r.bottom-Math.max.apply(0,ink.map(function(q){return q.bottom})); var ib=[].filter.call(c.querySelectorAll(".rbtn--icon svg"),function(s){return s.getBoundingClientRect().width}).map(function(s){return s.getBoundingClientRect()}); var g=""; if(ib.length>1){ib.sort(function(a,b){return a.top-b.top}); g=" glyphgap="+Math.round(ib[1].top-ib[0].bottom)} var lead=c.querySelector(".bio-c__lead"); var lc=lead?(lead.scrollWidth<=lead.clientWidth+1?"lead ok":"LEAD CLIPPED"):""; out.push("h="+Math.round(r.height)+" pad="+pad+" inkTop="+Math.round(top)+" inkBottom="+Math.round(bot)+g+" "+lc)}); var u={}; out.forEach(function(k){u[k]=(u[k]||0)+1}); return Object.keys(u).map(function(k){return k+" x"+u[k]}).join(" ## ")})()`;
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  const c = (js) => b.ev(`(function(){var e=${js}; if(e) e.click()})()`);
  const P = async (n) => { await b.sleep(1300); console.log("== " + n + "\n  " + (await b.ev(probe)).split(" ## ").join("\n  ")); await b.shot("C:/tmp/bio/geo_" + W + "_" + n + ".png"); };
  await c(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await P("viv");
  await c(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await P("ex");
  await c(`document.querySelector('[data-catopen]')`); await c(`document.querySelector('[data-cat]')`); await P("cat_ex");
  await c(`document.querySelector('[data-pkt="mu"]')`); await P("cat_music");
  await c(`document.querySelector('[data-hist]')`); await P("hist");
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
