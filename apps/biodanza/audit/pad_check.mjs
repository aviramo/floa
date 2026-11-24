import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  const P = async (n) => { await b.sleep(1200); console.log(n + ": " + await b.ev(`JSON.stringify([].slice.call(document.querySelectorAll(".rlist, .sheet-body, #iscroll, #plist")).filter(function(e){var r=e.getBoundingClientRect();return r.width&&r.height&&/auto|scroll/.test(getComputedStyle(e).overflowY)}).map(function(e){return (e.id||e.className.split(" ")[0])+" pb="+getComputedStyle(e).paddingBottom+(e.hasAttribute("data-fab-room")?" fab-room":"")}))`) ); await b.shot("C:/tmp/bio/pad_" + W + "_" + n + ".png"); };
  console.log("rfab shown: " + await b.ev(`!![].slice.call(document.querySelectorAll(".rfab")).filter(function(e){return e.getBoundingClientRect().width}).length`));
  await P("home");
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await P("viv");
  
} catch (e) { console.log("ERR", e.message.slice(0, 200)); } finally { b.close(); process.exit(0); }
