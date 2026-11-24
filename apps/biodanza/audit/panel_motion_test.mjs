// law 16: a side window enters and leaves with motion (transform/opacity, --t-base, --ease); reduced motion: no movement.
// usage: node panel_motion_test.mjs [reduce]   (width 1300; own Chrome port via BIO_PORT)
import fs from "fs"; import { launch } from "./lib.mjs";
const REDUCE = process.argv[2] === "reduce", W = 1300, H = 850;
const b = await launch(W, H);
let bad = 0;
const rectJs = (sel) => `(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var r=e.getBoundingClientRect(), cs=getComputedStyle(e); return [Math.round(r.left*10)/10, Math.round(r.right*10)/10, +cs.opacity, cs.visibility]})()`;
async function sample(sel, ms = 700, step = 40) { const out = []; const t0 = Date.now(); while (Date.now() - t0 < ms) { out.push(await b.ev(rectJs(sel))); await b.sleep(step); } return out; }
function moved(s) { const v = s.filter(Boolean); if (v.length < 2) return false; const xs = v.map(a => a[0]), os = v.map(a => a[2]); const mid = v.slice(1, -1); const inMotion = mid.some(a => a[0] !== v[0][0] && a[0] !== v[v.length - 1][0]) || mid.some(a => a[2] > 0.02 && a[2] < 0.98); return Math.max(...xs) !== Math.min(...xs) ? inMotion : (Math.max(...os) !== Math.min(...os) && inMotion); }
async function check(name, sel, openJs, closeJs, prepJs) {
  try {
    if (prepJs) { await b.ev(prepJs); await b.sleep(900); }
    const pre = await b.ev(`document.querySelector(${JSON.stringify(sel)}) ? "present" : "absent"`);
    b.ev(openJs); const o = await sample(sel);
    const mo = moved(o);
    b.ev(closeJs); const c = await sample(sel);
    const mc = moved(c);
    const ok = REDUCE ? (!mo && !mc) : (mo && mc);
    if (!ok) bad++;
    console.log((ok ? "ok   " : "FAIL ") + name + (REDUCE ? " [reduced motion: must not move]" : "") + ": enter " + (mo ? "moves" : "NO MOTION") + ", leave " + (mc ? "moves" : "NO MOTION") + "  (before: " + pre + ", sample enter x " + JSON.stringify((o.filter(Boolean)[0] || []).slice(0, 3)) + " -> " + JSON.stringify((o.filter(Boolean).slice(-1)[0] || []).slice(0, 3)) + ")");
  } catch (e) { bad++; console.log("ERR " + name + " " + String(e.message).slice(0, 120)); }
  await b.sleep(600);
}
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: `try { Object.keys(localStorage).forEach(function(k){ if (/cat|snap/i.test(k)) localStorage.removeItem(k); }); Object.keys(sessionStorage).forEach(function(k){ if (/cat|snap/i.test(k)) sessionStorage.removeItem(k); }); } catch (e) {}` });
  if (REDUCE) await b.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1500);
  // 1. the catalog layer (the list)
  await check("catalog layer (the list)", "#catLayer .cat, #catLayer", `document.querySelector('[data-catopen]').click()`, `(document.getElementById("catX")||document.querySelector("[data-catx]")).click()`);
  // 2. the exercise opened beside the catalog list
  await b.ev(`document.querySelector('[data-catopen]').click()`); await b.sleep(1500);
  await b.ev(`(function(){var c=document.querySelector('[data-cat]'); c&&c.click()})()`); await b.sleep(800);
  await check("catalog second stage (the exercise beside the list: .catprev is-open)", ".catprev", `document.querySelector(".catprev").classList.add("is-open")`, `document.querySelector(".catprev").classList.remove("is-open")`, `document.querySelector(".catprev").classList.remove("is-open")`);
  await b.ev(`(document.getElementById("catX")||document.querySelector("[data-catx]")).click()`); await b.sleep(900);
  // 3. the left layer: history
  await check("left layer: history", "#histLayer", `document.querySelector('[data-hist]') ? document.querySelector('[data-hist]').click() : document.querySelector('.bio-dock [aria-label*="היסטוריה"]').click()`, `(function(){var x=document.querySelector('#histLayer [data-act="back"]'); x&&x.click()})()`);
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  // 4. the left layer: share (opened from the vivencia menu on the home screen)
  await b.ev(`(function(){var x=document.querySelector('[data-act="back"]'); })()`);
  await check("left layer: share", "#histLayer", `(function(){document.querySelector('[data-vm="v1"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return /שיתוף/.test(e.textContent)})[0]; it&&it.click()},300)})()`, `(function(){var x=document.querySelector('#histLayer [data-act="back"]'); x&&x.click()})()`, `(function(){var x=document.querySelector('#histLayer [data-act="back"]'); x&&x.click()})()`);
  await check("left layer: liked vivencias (opened from the home menu)", "#histLayer", `(function(){document.querySelector('[data-act="homemore"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return /ויוונסיות שאהבתי/.test(e.textContent)})[0]; it&&it.click()},300)})()`, `(function(){var x=document.querySelector('#histLayer [data-act="back"]'); x&&x.click()})()`);
} catch (e) { console.log("FATAL", e.stack); } finally { console.log("failing: " + bad); b.close(); process.exit(0); }
