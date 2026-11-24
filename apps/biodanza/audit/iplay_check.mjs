import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 430; const b = await launch(W, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1800);
  await b.ev(`document.querySelector('[data-icard="i1"] [data-edit], [data-icard="i1"] .rrow__main').click()`); await b.sleep(1800);
  const m = () => b.ev(`(function(){var p=document.getElementById("iplay"); if(!p) return "no #iplay"; var pr=p.getBoundingClientRect(); var pb=p.querySelector("[data-audio]"); if(!pb) return "no play button"; var r=pb.getBoundingClientRect(); var h=p.closest("dialog")&&p.closest("dialog").querySelector(".sheet-head,.rhead"); var hr=h?h.getBoundingClientRect():null; var vw=document.documentElement.clientWidth; return JSON.stringify({btn:Math.round(r.width)+"x"+Math.round(r.height), cls:pb.className, st:pb.dataset.st, radius:getComputedStyle(pb).borderRadius, svg:Math.round(pb.querySelector("svg").getBoundingClientRect().width), color:getComputedStyle(pb).color, bg:getComputedStyle(pb).backgroundColor, iplayCenterOffset:Math.round((pr.left+pr.right)/2-vw/2), hscroll:document.documentElement.scrollWidth>vw, headH:hr?Math.round(hr.height):null, busy:pb.getAttribute("aria-busy")})})()`);
  console.log("idle:", await m());
  await b.ev(`document.querySelector('#iplay [data-audio]').click()`); await b.sleep(1500);
  console.log("after press:", await m());
  await b.shot("C:/tmp/bio/iplay_" + W + ".png");
} catch (e) { console.log("ERR", e.message.slice(0, 200)); } finally { b.close(); process.exit(0); }
