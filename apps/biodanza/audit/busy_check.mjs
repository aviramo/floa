// law 7: a busy icon button's glyph breathes (opacity only); nothing rotates or moves. aria-busy is set by hand on every icon button.
import fs from "fs"; import { launch } from "./lib.mjs";
const b = await launch(1300, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: 1300, height: 850, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1500);
  await b.ev(`window.__bs=[].slice.call(document.querySelectorAll(".rbtn--icon")).filter(function(x){return x.getBoundingClientRect().width&&x.querySelector(":scope > svg")}); window.__bs.forEach(function(x){x.setAttribute("aria-busy","true")}); 0`);
  const sample = () => b.ev(`JSON.stringify(window.__bs.slice(0,4).map(function(x){return +getComputedStyle(x.querySelector(":scope > svg")).opacity}))`);
  const s = []; for (let i = 0; i < 5; i++) { s.push(await sample()); await b.sleep(260); }
  console.log("opacity samples (first 4 busy icon buttons): " + s.join(" "));
  console.log(await b.ev(`(function(){var bad=0,ok=0; window.__bs.forEach(function(x){var cs=getComputedStyle(x.querySelector(":scope > svg")); var n=cs.animationName; if(n==="rk-breath") ok++; else bad++; var tr=cs.transform; }); var anims=document.getAnimations().filter(function(a){return a.playState==="running"&&a.effect.target&&a.effect.target.closest&&a.effect.target.closest(".rbtn--icon[aria-busy]")}); var props={}; anims.forEach(function(a){a.effect.getKeyframes().forEach(function(f){Object.keys(f).forEach(function(k){if(!/^(offset|easing|composite|computedOffset)$/.test(k)) props[k]=1})})}); var pe=getComputedStyle(window.__bs[0]).pointerEvents; var r=window.__bs.map(function(x){x.removeAttribute("aria-busy")}); return "buttons "+window.__bs.length+" breathing "+ok+" other "+bad+" animated properties "+Object.keys(props).join(",")+" pointer-events "+pe})()`));
} finally { b.close(); process.exit(0); }
