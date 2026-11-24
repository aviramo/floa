// before/after pixel capture: node pix.mjs <tag>   -> C:/tmp/bio/pix_<tag>_<w>_<screen>.png
import fs from "fs"; import { launch } from "./lib.mjs";
const tag = process.argv[2] || "x";
for (const W of [430, 1300]) {
  const b = await launch(W, 850);
  try {
    await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.clear()}catch(e){};\n" + fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
    await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
    await b.send("Page.navigate", { url: "" + (process.env.BIO_BASE || "http://localhost:5191") + "/biodanza/" }); await b.sleep(3000);
    const c = (js) => b.ev(`(function(){var e=${js}; if(e) e.click()})()`);
    const sh = async (n) => { await b.sleep(1500); await b.ev("document.querySelectorAll('*').forEach(function(e){e.style.caretColor='transparent'})"); await b.shot(`C:/tmp/bio/pix_${tag}_${W}_${n}.png`); };
    await sh("home");
    await c(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await sh("viv");
    await c(`document.querySelector('[data-icard="i2"] [data-audio]')`); await b.sleep(1200); await sh("play");
    await c(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await sh("ex");
    await c(`document.querySelector('[data-catopen]')`); await sh("cat");
    await c(`document.querySelector('[data-cat]')`); await sh("cat_open");
    await c(`document.querySelector('[data-pkt="mu"]')`); await sh("cat_music");
    await c(`document.querySelector('[data-sgc] [data-audio]')`); await b.sleep(1200); await sh("mu_play");
    await c(`document.querySelector('[data-addto]')`); await sh("dest");
    await c(`document.querySelector('[data-cdh]')`); await sh("dest_open");
  } catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
}
process.exit(0);
