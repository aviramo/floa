// law 7: a press opens its window at once (with a skeleton); it never waits for the network. Every response is delayed by 3s here.
// usage: node open_now_test.mjs [width]
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300, H = 850, wide = W >= 760, DELAY = 3000, LIMIT = 500;
const b = await launch(W, H); let bad = 0;
const ev = (x) => b.ev(x);
const L = wide ? "#histLayer.is-open, .bio-left.is-open" : "dialog[open]";
async function check(name, openJs, presentSel, prep) {
  try {
    await ev("document.querySelectorAll('dialog[open]').forEach(function(x){try{x.close()}catch(e){}}); window.__bioDelay=0; 0");
    if (prep) { await ev(prep); await b.sleep(800); }
    await ev("window.__bioDelay=" + DELAY + "; 0");
    const t0 = Date.now(); await ev(openJs);
    let t = null; for (let i = 0; i < 20; i++) { const ok = await ev(`!![].filter.call(document.querySelectorAll(${JSON.stringify(presentSel)}),function(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0}).length`); if (ok) { t = Date.now() - t0; break; } await b.sleep(50); }
    const okk = t != null && t <= LIMIT; if (!okk) bad++;
    console.log((okk ? "ok   " : "FAIL ") + name + ": " + (t == null ? "no window within " + (20 * 50) + "ms (waits for the network)" : "visible after " + t + "ms"));
    await ev("window.__bioDelay=0; 0"); await b.sleep(DELAY + 300);
  } catch (e) { bad++; console.log("ERR " + name + " " + String(e.message).slice(0, 100)); }
  await ev("document.querySelectorAll('dialog[open]').forEach(function(x){try{x.close()}catch(e){}}); (window.__leftClose&&window.__leftLive&&window.__leftLive().length&&window.__leftClose(window.__leftLive()[0])); 0"); await b.sleep(500);
}
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `(function(){ var f=window.fetch; window.fetch=function(){ var a=arguments; return new Promise(function(res,rej){ setTimeout(function(){ f.apply(window,a).then(res,rej); }, window.__bioDelay||0); }); }; })()` });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: !wide });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3500);
  await check("history button", `(document.querySelector('[data-hist]')).click()`, wide ? "#histLayer.is-open, .bio-left.is-open" : "dialog[open]");
  const menuItem = (re) => `(function(){document.querySelector('[data-act="homemore"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return ${re}.test(e.textContent)})[0]; it&&it.click()},150)})()`;
  await check("liked vivencias", menuItem("/ויוונסיות שאהבתי/"), L);
  await check("liked exercises", menuItem("/תרגילים שאהבתי/"), L);
  await check("liked music", menuItem("/מוסיקה שאהבתי/"), L);
  await check("share", `(function(){document.querySelector('[data-vm="v1"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return /שיתוף/.test(e.textContent)})[0]; it&&it.click()},150)})()`, L);
  await check("catalog", wide ? `document.querySelector('[data-catopen]').click()` : menuItem("/קטלוג/"), wide ? "#catLayer.is-open" : "#catDlg[open], dialog[open]");
  await ev(`window.__bioDelay=0; document.querySelector('[data-vrow="v1"] .rrow__main').click(); 0`); await b.sleep(3800);
  await check("open an exercise of the vivencia", `(document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')).click()`, wide ? "#pd #ipg, #pd .rskel, #pd .rhead" : "#itemDlg[open], dialog[open]");
  console.log("failing: " + bad);
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
