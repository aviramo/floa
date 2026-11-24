import fs from "fs"; import http from "http"; import path from "path"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1900, H = +process.argv[3] || 900, SP = 5431;
const root = path.normalize("C:/Users/ofira/Desktop/floa/dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const srv = http.createServer((req, res) => { let f = path.join(root, decodeURIComponent(req.url.split("?")[0])); if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html"); if (!fs.existsSync(f)) f = path.join(root, "biodanza/index.html"); res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); });
await new Promise(r => srv.listen(SP, r));
const b = await launch(W, H);
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`(function(){var e=document.querySelector('[data-vrow="v1"] .rrow__main'); e&&e.click()})()`); await b.sleep(1800);
  await b.ev(`(function(){var e=document.querySelector('[data-catopen]'); e&&e.click()})()`); await b.sleep(1800);
  await b.shot("C:/tmp/bio/cat_" + W + "_a.png");
  await b.ev(`(function(){var e=document.querySelector('[data-cat]'); e&&e.click()})()`); await b.sleep(900);
  await b.shot("C:/tmp/bio/cat_" + W + "_b.png");
  await b.ev("(function(){var e=document.querySelector('#list [data-ex]'); e&&e.click()})()"); await b.sleep(1500);
  await b.shot("C:/tmp/bio/cat_" + W + "_c.png");
  console.log(await b.ev(`JSON.stringify([].map.call(document.querySelectorAll('header.rhead').length?document.querySelector('header.rhead').querySelectorAll(':scope, :scope > *'):[],function(e){var r=e.getBoundingClientRect();return e.tagName+'.'+e.className+' x'+Math.round(r.left)+' y'+Math.round(r.top)+' '+Math.round(r.width)+'x'+Math.round(r.height)}))`));
  console.log(await b.ev(`JSON.stringify([].map.call(document.querySelectorAll('.bio-search,.racc__row,[data-cat]'),function(e){var r=e.getBoundingClientRect();return e.className+" "+Math.round(r.width)+"x"+Math.round(r.height)}).slice(0,6))`));
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); srv.close(); process.exit(0); }
