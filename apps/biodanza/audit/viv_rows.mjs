import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
const probe = `JSON.stringify([].map.call(document.querySelectorAll("[data-vrow]"),function(r){var q=r.getBoundingClientRect(); if(!q.width) return null; function x(s){var e=r.querySelector(s); if(!e) return "-"; var k=e.getBoundingClientRect(); return Math.round(k.left-q.left)+"+"+Math.round(k.width)} return (r.closest("#hl")?"home":"liked")+" h="+Math.round(q.height)+" heart "+x("[data-likev], .rrow__trail")+" main "+x(".rrow__main")+" cnt "+x(".bio-vcnt")+" menu "+x("[data-vm]")}).filter(Boolean))`;
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  console.log("home " + await b.ev(probe)); await b.shot("C:/tmp/bio/vr_" + W + "_home.png");
  await b.ev(`(function(){var m=document.querySelector('[data-act="homemore"]'); m&&m.click()})()`); await b.sleep(600);
  console.log(await b.ev(`[].map.call(document.querySelectorAll(".rmenu__item"),function(e){return e.textContent.trim()}).join(" | ")`));
  await b.ev(`(function(){var it=[].filter.call(document.querySelectorAll(".rmenu__item"),function(e){return /שאהבתי/.test(e.textContent)&&/ויוונס/.test(e.textContent)})[0]; it&&it.click()})()`); await b.sleep(1500);
  console.log("liked " + await b.ev(probe)); await b.shot("C:/tmp/bio/vr_" + W + "_liked.png");
} finally { b.close(); process.exit(0); }
