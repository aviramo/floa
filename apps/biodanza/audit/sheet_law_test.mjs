// law 6: a sheet at a narrow width has border-radius 0 on every corner. law 15: the window header is --fab tall and its title is larger than its sub-title.
// usage: node sheet_law_test.mjs [width]   (default 430)
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 430, H = 850; const b = await launch(W, H); let bad = 0, seen = 0;
const probe = `(function(){ var d=[].filter.call(document.querySelectorAll("dialog[open]"),function(x){var r=x.getBoundingClientRect();return r.width&&r.height}).pop(); if(!d) return null; var cs=getComputedStyle(d); var FAB=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fab")); var h=d.querySelector(".sheet-head"); var o={id:d.id, radius:[cs.borderTopLeftRadius,cs.borderTopRightRadius,cs.borderBottomRightRadius,cs.borderBottomLeftRadius].join("/"), fab:FAB};
  if(h){var hr=h.getBoundingClientRect(); o.head=Math.round(hr.height); var t=h.querySelector("h2,.rhead__title,[class*=title]"); var sub=h.querySelector(".rhead__sub,.sub"); if(t) o.tfs=parseFloat(getComputedStyle(t).fontSize); if(sub) o.sfs=parseFloat(getComputedStyle(sub).fontSize);} return o})()`;
async function check(name, openJs, prep) {
  try {
    if (prep) { await b.ev(prep); await b.sleep(600); }
    await b.ev(openJs); await b.sleep(1300);
    const o = await b.ev(probe); if (!o) { console.log("(not reachable) " + name); return; } seen++;
    const msg = [];
    if (W < 760 && /[1-9]/.test(o.radius)) msg.push("rounded corners " + o.radius);
    if (o.head != null && o.head > 0 && Math.abs(o.head - o.fab) > 1 && o.head < o.fab * 1.5) msg.push("header " + o.head + " (want " + o.fab + ")");
    if (o.head != null && o.head >= o.fab * 1.5) msg.push("header " + o.head + " tall (grab bar or wrapped title?)");
    if (o.tfs && o.sfs && o.tfs <= o.sfs) msg.push("title " + o.tfs + " not larger than sub-title " + o.sfs);
    console.log((msg.length ? "FAIL " : "ok   ") + name + " radius=" + o.radius + " head=" + o.head + (o.tfs ? " title=" + o.tfs : "") + (msg.length ? ": " + msg.join("; ") : "")); if (msg.length) bad++;
  } catch (e) { console.log("ERR " + name + " " + String(e.message).slice(0, 100)); bad++; }
  await b.ev("document.querySelectorAll('dialog[open]').forEach(function(x){try{x.close()}catch(e){}})"); await b.sleep(500);
}
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await check("menu (home)", `document.querySelector('[data-act="homemore"]').click()`);
  await check("share", `(function(){document.querySelector('[data-vm="v1"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return /שיתוף/.test(e.textContent)})[0]; it&&it.click()},300)})()`);
  await check("liked vivencias", `(function(){document.querySelector('[data-act="homemore"]').click(); setTimeout(function(){var it=[].filter.call(document.querySelectorAll('.rmenu__item'),function(e){return /ויוונסיות שאהבתי/.test(e.textContent)})[0]; it&&it.click()},300)})()`);
  await b.ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1800);
  await check("confirm (remove exercise)", `document.querySelector('[data-icard="i1"] [data-idel]').click()`);
  await check("exercise window (free dance)", `document.querySelector('[data-icard="i5"] [data-edit], [data-icard="i5"] .rrow__main').click()`);
  await check("catalog window", `document.querySelector('[data-catopen]').click()`);
  console.log("windows checked: " + seen + ", failing: " + bad);
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
