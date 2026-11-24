import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  const c = (js) => b.ev(`(function(){var e=${js}; if(e) e.click()})()`);
  await c(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await b.sleep(1500);
  await c(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await b.sleep(1500);
  await b.ev(`(function(){var e=document.getElementById("igu"); e.textContent="טקסט ארוך שנכתב בשדה כדי לראות את התווית הצפה מעל הטקסט."; e.dispatchEvent(new Event("input",{bubbles:true})); document.getElementById("it").focus()})()`); await b.sleep(600);
  console.log(await b.ev(`JSON.stringify([].map.call(document.querySelectorAll("#ifields .rfield, .bio-search"),function(f){var l=f.querySelector(":scope > span"), c=f.querySelector(":scope > .rf-rich, :scope > input"), fr=f.getBoundingClientRect(); var lr=l&&f.matches(".rfield")?l.getBoundingClientRect():null; var cr=c?c.getBoundingClientRect():null; var tx=c&&c.firstChild&&c.firstChild.nodeType==3?(function(){var r=document.createRange();r.selectNodeContents(c.firstChild);return r.getClientRects()[0]})():null; return (f.id||(c&&c.id)||f.className)+" h="+Math.round(fr.height*10)/10+" label["+(lr?Math.round(lr.top-fr.top)+"-"+Math.round((lr.bottom-fr.top)*10)/10:"-")+"] textTop="+(tx?Math.round((tx.top-fr.top)*10)/10:"-")}))`));
  await b.shot("C:/tmp/bio/field_" + W + ".png", { x: 0, y: 40, width: Math.min(W, 700), height: 330 });
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
