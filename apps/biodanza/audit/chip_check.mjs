import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1800);
  console.log(await b.ev(`JSON.stringify([].slice.call(document.querySelectorAll("[data-icard]")).slice(0,4).map(function(c){var ch=c.querySelector(".rbtn--text"), x=c.querySelector("[data-idel]"); if(!ch||!x) return "no chip or X"; var a=ch.getBoundingClientRect(), z=x.getBoundingClientRect(); var cm=getComputedStyle(ch); return "same parent="+(ch.parentElement===x.parentElement)+" parent="+ch.parentElement.className+" gap="+Math.round(Math.abs(a.left-z.right))+" chipMargin="+cm.marginLeft+"/"+cm.marginRight+" chipH="+Math.round(a.height)}))`));
  await b.shot("C:/tmp/bio/chip_" + W + ".png");
} finally { b.close(); process.exit(0); }
