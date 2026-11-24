import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300; const b = await launch(W, 850);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: 850, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`document.querySelector('[data-vm="v1"]').click()`); await b.sleep(600);
  console.log("menu: " + await b.ev(`[].map.call(document.querySelectorAll(".rmenu__item"),function(e){return e.textContent.trim()}).join(" | ")`));
  await b.ev(`(function(){var it=[].filter.call(document.querySelectorAll(".rmenu__item"),function(e){return /שיתוף/.test(e.textContent)})[0]; it&&it.click()})()`); await b.sleep(1800);
  console.log((await b.ev(`(function(){var d=document.getElementById("shareDlg"); if(!d||!d.open) return "share dialog not open"; var o=[]; [].forEach.call(d.querySelectorAll(".rrow, .rdiv, .rfield, .rbtn, input"),function(e){var r=e.getBoundingClientRect(); if(!r.width) return; var cs=getComputedStyle(e); o.push(e.className.split(" ")[0]+(e.getAttribute("data-role")?"[role]":"")+(e.getAttribute("data-rm")?"[rm]":"")+" "+Math.round(r.width)+"x"+Math.round(r.height)+" mt="+cs.marginTop+" pad="+cs.paddingTop+"/"+cs.paddingLeft+(e.matches(".rbtn")?" txt='"+e.textContent.trim().slice(0,6)+"'":""))}); return o.join(" ## ")})()`)).split(" ## ").join(String.fromCharCode(10)));
  await b.shot("C:/tmp/bio/share_" + W + ".png");
} catch (e) { console.log("ERR", String(e.message).slice(0,300)); } finally { b.close(); process.exit(0); }
