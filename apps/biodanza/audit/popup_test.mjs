// Law 6: at a wide width every SHORT window opens next to the control that opened it, inside the viewport; on a phone it is a bottom sheet.
// usage: node popup_test.mjs <width>   (1300 or 430)
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300, H = 850, wide = W >= 760;
const b = await launch(W, H);
let bad = 0, seen = 0;
const ev = (x) => b.ev(x);
const open = `(function(){var d=[].filter.call(document.querySelectorAll("dialog[open]"),function(x){var r=x.getBoundingClientRect();return r.width&&r.height}); var s=d[d.length-1]; if(!s) return null; var q=(s.querySelector(".sheet")||s).getBoundingClientRect(); return {id:s.id,l:q.left,r:q.right,t:q.top,b:q.bottom,w:q.width,anch:s.hasAttribute("data-anchored")}})()`;
const rectOf = (sel) => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var r=e.getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom}})()`);
const esc = async () => { await ev("(function(){var d=document.querySelectorAll('dialog[open]'); d.forEach(function(x){try{x.close()}catch(e){}})})()"); await b.sleep(400); };
async function check(name, opener, steps, next) {
  try {
    if (steps) { await ev(steps); await b.sleep(700); }
    const o = await rectOf(opener);
    if (!o) { console.log("(not reachable) " + name); return; }
    await ev(`document.querySelector(${JSON.stringify(opener)}).click()`); await b.sleep(1200);
    if (next) { await ev("(function(){var e=" + next + "; if(e) e.click()})()"); await b.sleep(1200); }
    const d = JSON.parse(JSON.stringify(await ev(open)));
    if (!d) { console.log("FAIL " + name + ": no window opened"); bad++; return; }
    seen++;
    let msg = [];
    if (d.l < -1 || d.r > W + 1 || d.t < -1 || d.b > H + 1) msg.push("clipped by the screen " + JSON.stringify([d.l, d.t, d.r, d.b].map(Math.round)));
    if (wide) {
      const oc = (o.l + o.r) / 2, dc = (d.l + d.r) / 2;
      const near = d.t >= o.b - 2 || d.b <= o.t + 2 || d.l >= o.r - 2 || d.r <= o.l + 2 ? (Math.abs(oc - dc) <= d.w || (d.l < o.r + 1 && d.r > o.l - 1)) : false;
      if (!d.anch) msg.push("not anchored (data-anchored missing)");
      if (!near) msg.push("not next to the opener: opener x" + Math.round(o.l) + "-" + Math.round(o.r) + " y" + Math.round(o.t) + "-" + Math.round(o.b) + ", window x" + Math.round(d.l) + "-" + Math.round(d.r) + " y" + Math.round(d.t) + "-" + Math.round(d.b));
      if (Math.abs(oc - W / 2) > 60 && Math.abs(dc - W / 2) < 8) msg.push("centered on the page");
    } else {
      if (Math.abs(d.b - H) > 2 || d.w < W - 2) msg.push("not a bottom sheet: x" + Math.round(d.l) + "-" + Math.round(d.r) + " y" + Math.round(d.t) + "-" + Math.round(d.b));
    }
    console.log((msg.length ? "FAIL " : "ok   ") + name + (msg.length ? ": " + msg.join("; ") : "")); if (msg.length) bad++;
    await b.shot("C:/tmp/bio/popup_" + W + "_" + name.replace(/\W+/g, "_") + ".png");
  } catch (e) { console.log("ERR " + name + " " + e.message.slice(0, 120)); bad++; }
  await esc();
}
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await check("new vivencia via the menu (name popup)", '[data-act="homemore"]', null, "document.querySelector('.rmenu__item')");
  await ev(`document.querySelector('[data-vrow="v1"] .rrow__main').click()`); await b.sleep(1800);
  await check("remove exercise (X on a card)", '[data-icard="i1"] [data-idel]');
  await check("remove exercise, last card", '[data-icard="i5"] [data-idel]');
  await check("unlike (a liked heart)", '[data-icard="i1"] [data-like][aria-pressed="true"], [data-like][aria-pressed="true"], [data-likex][aria-pressed="true"]');
  await check("remove music from card", '[data-icard="i1"] [data-rm], [data-icard="i1"] [data-mrm]');
  await check("rename vivencia", '[data-act="rename"], [data-act="vname"]');
  await check("delete section", '[data-secx]', `(function(){var a=document.querySelector('[data-secadd]'); })()`);
  console.log("windows checked: " + seen + ", failing: " + bad);
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
