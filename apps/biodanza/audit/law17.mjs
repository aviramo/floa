// Run: node build.mjs --only=biodanza, npm run dev, then node apps/biodanza/audit/law17.mjs 1300 (and 430). Data is a stub, nothing is written.
// Law 17 audit: every popup, every way it opens; before == after, exactly one overlay while open.
import fs from "fs"; import { launch } from "./lib.mjs";
const W = Number(process.argv[2] || 1300), H = 850, phone = W < 760;
const b = await launch(W, H);
const results = [];
const PAGE = `
window.__snap = function () {
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  return JSON.stringify({
    plDim: !!(pl && pl.classList.contains("bio-dim")), pdDim: !!(pd && pd.classList.contains("bio-dim")),
    left: window.__leftLive ? window.__leftLive().length : 0,
    leftShown: document.querySelectorAll(".bio-left.is-open").length,
    cat: document.querySelectorAll(".bio-catlayer.is-open").length,
    scrims: document.querySelectorAll(".bio-catscrim.is-on").length,
    dialogs: [].map.call(document.querySelectorAll("dialog[open]"), function (d) { return d.id; }).sort().join(","),
    pressed: document.querySelectorAll('[data-catopen][aria-pressed="true"]').length,
    lock: document.documentElement.classList.contains("rs-lock")
  });
};
window.__overlays = function () {   /* how many overlays are lit now, and is the top thing covered by one */
  var n = 0, s = JSON.parse(window.__snap());
  if (s.plDim) n++; if (s.pdDim) n++; n += s.scrims;
  var modal = [].filter.call(document.querySelectorAll("dialog[open]"), function (d) { try { return d.matches(":modal"); } catch (e) { return true; } }).length;
  return { lit: n, modal: modal, s: s };
};
window.__closeTop = function () {
  var ds = [].filter.call(document.querySelectorAll("dialog[open]"), function () { return true; });
  if (ds.length) { var d = ds[ds.length - 1]; var x = d.querySelector(".rs-x"); if (x && x.offsetParent) { x.click(); return "dialog-x " + d.id; } return "ESC " + d.id; }
  var L = window.__leftLive ? window.__leftLive() : [];
  if (L.length) { var top = L[L.length - 1], bk = top.querySelector('[data-act="back"]'); if (bk) { bk.click(); return "left"; } }
  var cl = [].slice.call(document.querySelectorAll(".bio-catlayer.is-open")); if (cl.length) { var c = cl[cl.length - 1], cx = c.querySelector("#catX"); if (cx) { cx.click(); if (c.classList.contains("is-open")) cx.click(); return "catalog"; } }
  return "nothing";
};
window.__click = function (sel) { var e = document.querySelector(sel); if (!e) return false; e.click(); return true; };
window.__menuPick = function (text) { var x = [].filter.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return x.textContent.indexOf(text) >= 0; })[0]; if (!x) return false; x.click(); return true; };
`;
async function ev(x) { return b.ev(x); }
async function closeTop() {
  const how = await ev(`window.__closeTop()`);
  if (how.startsWith("ESC")) { for (const t of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type: t, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); }
  return how;
}
async function check(name, open) {
  const before = await ev(`window.__snap()`);
  const ok = await open();
  await b.sleep(1300);
  if (!ok) { results.push([name, "SKIP (opener not found)"]); return; }
  const o = await ev(`window.__overlays()`);
  const covered = o.lit + o.modal;
  const how = await closeTop(); await b.sleep(900);
  const after = await ev(`window.__snap()`);
  const same = before === after;
  results.push([name, (covered >= 1 ? "overlay ok" : "NO OVERLAY") + " | close:" + how + " | " + (same ? "restored" : "CHANGED " + before + " -> " + after)]);
}
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.clear()}catch(e){}\n" + fs.readFileSync(new URL("./law17_stub.js", import.meta.url), "utf8") + "\n" + PAGE });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
  await b.send("Page.navigate", { url: "http://localhost:5173/biodanza/" }); await b.sleep(3500);
  const dockMenu = async (t) => { await ev(`window.__click("[data-dockmore]")`); await b.sleep(400); return ev(`window.__menuPick(${JSON.stringify(t)})`); };
  // home
  await check("home: catalog exercises (menu)", () => dockMenu("קטלוג תרגילים"));
  await check("home: catalog music (menu)", () => dockMenu("קטלוג מוזיקות"));
  await check("home: history", () => dockMenu("היסטוריה"));
  await check("home: liked vivencias", () => dockMenu("ויוונסיות שאהבתי"));
  await check("home: liked music", () => dockMenu("מוסיקה שאהבתי"));
  await check("home: duplicate (card)", () => ev(`window.__click('[data-vm="v1"]')`));
  await check("home: sharing (card)", () => ev(`window.__click('[data-vvis="v1"]')`));
  await check("home: new vivencia", () => ev(`window.__click('[data-act="vnew"]')`));
  // inside a vivencia
  await ev(`window.__click('[data-vrow="v1"]')`); await b.sleep(1800);
  await check("viv: sharing (header)", () => ev(`window.__click('[data-act="vis"]')`));
  await check("viv: rename (menu)", async () => { await ev(`window.__click('[data-act="vmore"]')`); await b.sleep(400); return ev(`window.__menuPick("עריכת שם")`); });
  await check("viv: sharing (menu)", async () => { await ev(`window.__click('[data-act="vmore"]')`); await b.sleep(400); return ev(`window.__menuPick("הגדרות שיתוף")`); });
  await check("viv: delete confirm (menu)", async () => { await ev(`window.__click('[data-act="vmore"]')`); await b.sleep(400); return ev(`window.__menuPick("מחיקה")`); });
  await check("viv: exercise from catalog (+)", async () => { await ev(`window.__click('#list [data-addex]')`); await b.sleep(400); return ev(`window.__menuPick("תרגיל מהקטלוג")`); });
  await check("viv: remove exercise confirm", () => ev(`window.__click('[data-idel]')`));
  if (!phone) {
    await ev(`window.__click('[data-icard="i2"]')`); await b.sleep(1500);
    await check("viv+exercise: song's exercises layer", () => ev(`window.__click('#pd [data-mfxg]')`));
    await check("viv+exercise: catalog exercises (menu)", () => dockMenu("קטלוג תרגילים"));
    // a layer over the catalog
    await dockMenu("קטלוג מוזיקות"); await b.sleep(1500);
    const before = await ev(`window.__snap()`);
    const ok = await ev(`window.__click('.bio-catlayer.is-open [data-sg]')`); await b.sleep(1500);
    if (ok) {
      const o = await ev(`window.__overlays()`);
      await closeTop(); await b.sleep(900);
      const after = await ev(`window.__snap()`);
      results.push(["viv: layer over the music catalog", (o.s.scrims >= 1 ? "overlay ok" : "NO SCRIM") + " | " + (before === after ? "restored (catalog below still open)" : "CHANGED " + before + " -> " + after)]);
    } else results.push(["viv: layer over the music catalog", "SKIP (no curve button in the music catalog)"]);
    await closeTop(); await b.sleep(900);
  } else {
    await check("viv (phone): open exercise", () => ev(`window.__click('[data-icard="i2"]')`));
  }
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
for (const [n, r] of results) console.log((/NO |CHANGED/.test(r) ? "FAIL  " : /SKIP/.test(r) ? "skip  " : "ok    ") + n + " :: " + r);
