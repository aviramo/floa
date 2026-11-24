import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
const probe = `(function(){ var cv=document.createElement("canvas"); cv.width=cv.height=1; var cx=cv.getContext("2d",{willReadFrequently:true});
 function rgb(c){ cx.clearRect(0,0,1,1); cx.fillStyle="#000"; cx.fillStyle=c; cx.fillRect(0,0,1,1); var d=cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255]}
 function lum(c){return 0.2126*f(c[0])+0.7152*f(c[1])+0.0722*f(c[2])} function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}
 function bg(e){var layers=[]; while(e){var c=getComputedStyle(e).backgroundColor; var r=rgb(c); if(r[3]>0) layers.push(r); if(r[3]>=1) break; e=e.parentElement} var base=[255,255,255]; layers.reverse().forEach(function(l){base=[0,1,2].map(function(i){return l[i]*l[3]+base[i]*(1-l[3])})}); return base}
 var out={}; [].forEach.call(document.querySelectorAll(".bio-c__t2, .bio-c__t2 *"),function(e){ if(!e.getBoundingClientRect().width) return; var cs=getComputedStyle(e); var t=rgb(cs.color); var card=e.closest(".bio-c"); var b=bg(e); var L1=lum(t),L2=lum(b); var cr=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05); var st=card.getAttribute("aria-current")?"selected":(card.getAttribute("aria-busy")?"busy":"plain"); var k=st+" bg="+b.map(Math.round).join(",")+" fg="+t.slice(0,3).join(",")+" size="+cs.fontSize+" ratio="+cr.toFixed(2); out[k]=(out[k]||0)+1}); return JSON.stringify(out)})()`;
const lead = `JSON.stringify([].map.call(document.querySelectorAll(".bio-c__lead"),function(l){var r=l.getBoundingClientRect(); if(!r.width) return null; var c=l.closest(".bio-c").getBoundingClientRect(); var rg=document.createRange(); rg.selectNodeContents(l); var g=rg.getBoundingClientRect(); var cs=getComputedStyle(l); return l.textContent.trim()+": box w"+Math.round(r.width)+" glyph w"+Math.round(g.width)+" dx="+(((g.left+g.right)/2)-((r.left+r.right)/2)).toFixed(1)+" dy-card="+(((g.top+g.bottom)/2)-((c.top+c.bottom)/2)).toFixed(1)+" card h"+Math.round(c.height)+" fs="+cs.fontSize}).filter(Boolean))`;
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  const c = (js) => b.ev(`(function(){var e=${js}; if(e) e.click()})()`);
  const shot = async (n) => { await b.sleep(1300); console.log("== " + n + " " + await b.ev(probe)); await b.shot("C:/tmp/bio/t2_" + W + "_" + n + ".png"); };
  await c(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await shot("viv"); await b.ev("(function(){var l=document.querySelectorAll('.bio-c__lead'); if(l[0]) l[0].textContent='888'; if(l[1]) l[1].textContent='12'})()"); await b.sleep(300); console.log("LEAD " + await b.ev(lead)); console.log("CLIP " + await b.ev("JSON.stringify([].map.call(document.querySelectorAll('.bio-c__lead'),function(l){var c=l.closest('.bio-c'); return l.scrollWidth<=l.clientWidth+1 && l.getBoundingClientRect().height<=c.getBoundingClientRect().height}).slice(0,3))")); await b.shot("C:/tmp/bio/lead3_" + W + ".png");
  await c(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await shot("ex");
  await c(`document.querySelector('[data-catopen]')`); await shot("cat");
  await c(`document.querySelector('[data-cat]')`); await shot("cat_open");
  await c(`document.querySelector('[data-pkt="mu"]')`); await shot("cat_music");
  await c(`document.querySelector('[data-hist]')`); await shot("hist");
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
