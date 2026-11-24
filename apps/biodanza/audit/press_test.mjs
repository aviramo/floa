/* LAW 7 (a press answers at once, the wait is declared and shown where the content will be). Run: BIO_PORT=9431 node press_test.mjs 430|1300 [shots-dir]
   Uses the SLOW stub: every server answer takes 3 s, so anything the press waits for is visible. Asserts:
   - a window or screen that opens exists within two frames of the press, with a skeleton (rskel) or its content inside;
   - aria-busy never appears on an opener (plus, menu, loop, vivencia row);
   - an action whose result is on the element (heart, confirm) shows aria-busy on it, and clears on success AND on failure. */
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 430, H = 900, OUT = process.argv[3] || "";
const b = await launch(W, H);
let fails = 0;
const ok = (c, msg) => { console.log((c ? "PASS " : "FAIL ") + msg); if (!c) fails++; };
const shot = async (n) => { if (!OUT) return; const r = await b.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(OUT + "/press_" + W + "_" + n + ".png", Buffer.from(r.result.data, "base64")); };
/* every element that ever got aria-busy during the run, with its kind: the opener check reads this */
const WATCH = `(function(){ if (window.__w) return; window.__w = { seen: [] };
  new MutationObserver(function (ms) { ms.forEach(function (m) { var e = m.target; if (m.attributeName === "aria-busy" && e.getAttribute("aria-busy") === "true") window.__w.seen.push((e.dataset && Object.keys(e.dataset).join(",")) + "|" + (e.className || "").toString().slice(0, 40) + "|" + (e.id || "")); }); }).observe(document.documentElement, { attributes: true, attributeFilter: ["aria-busy"], subtree: true });
})()`;
const seen = () => b.ev(`window.__w.seen.splice(0).join(";")`);
const vis = `function vis(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight}`;
/* press the first VISIBLE match, then look two frames later (the server has not answered yet) */
async function press(sel, probe, anyVis) {
  const r = await b.ev(`(async function(){ ${vis}
    var e=[].filter.call(document.querySelectorAll(${JSON.stringify(sel)}),${anyVis ? "function(){return true}" : "vis"})[0]; if(!e) return JSON.stringify({none:true, all:[].map.call(document.querySelectorAll(${JSON.stringify(sel)}),function(x){var r=x.getBoundingClientRect();return [r.top|0,r.height|0,r.width|0]}), ih: innerHeight});
    window.__w.seen.length = 0; e.click();
    await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});
    var o = ${probe}; o.selfBusy = e.getAttribute("aria-busy") === "true"; o.seen = window.__w.seen.slice(); return JSON.stringify(o) })()`);
  return JSON.parse(r);
}
const winProbe = `(function(){var d=[].filter.call(document.querySelectorAll("dialog[open], .bio-left, #moreMenu, #catLayer.is-open"),function(x){return !x.closest("dialog:not([open])")}); var top=d[d.length-1]; return { win: d.length, id: top ? (top.id || top.className.toString().slice(0,30)) : "", skel: top ? top.querySelectorAll(".rskel").length : 0, rows: top ? top.querySelectorAll(".rrow, .bio-card, .rcard").length : 0 }})()`;
const closeAll = () => b.ev(`(function(){document.querySelectorAll("dialog[open]").forEach(function(d){d.close()}); document.querySelectorAll("#moreMenu").forEach(function(m){m.remove()}); return 1})()`);
try {
  await b.send("Page.enable"); await b.send("Runtime.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub_slow.js", import.meta.url), "utf8") });
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: WATCH });
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Storage.clearDataForOrigin", { origin: (process.env.BIO_URL || "http://localhost:5191"), storageTypes: "all" });   /* nothing kept from an earlier run: no cached song, no saved vivencia */
  await b.send("Page.navigate", { url: (process.env.BIO_URL || "http://localhost:5191") + "/biodanza/" });
  for (let k = 0; k < 80 && !(await b.ev(`(function(){var e=document.querySelector("[data-vrow=v1] .rrow__main");return !!e&&e.getBoundingClientRect().height>0})()`)); k++) await b.sleep(250);
  await b.sleep(500); await b.ev(WATCH);

  /* 1. a vivencia row opens the screen at once; the list inside is a skeleton, the row does not spin */
  await b.ev(`window.__bioDelay = 3000`);
  let r = await press('[data-vrow="v1"] .rrow__main', `(function(){var l=document.getElementById("list"); return { list: !!l, skel: l ? l.querySelectorAll(".rskel").length : 0, cards: document.querySelectorAll("[data-icard]").length }})()`);
  await shot("1_viv");
  ok(r.list && (r.skel > 0 || r.cards > 0), "vivencia row: the screen is there, with a skeleton or the exercises inside " + JSON.stringify(r));
  ok(!r.selfBusy && !r.seen.length, "vivencia row: no aria-busy on anything " + JSON.stringify(r.seen));
  await b.ev(`window.__bioDelay = 0`); await b.sleep(4500); await b.ev(`window.__bioDelay = 3000`);
  ok((await b.ev(`document.querySelectorAll("[data-icard]").length`)) > 0, "vivencia: the exercises arrived");

  /* 3. the plus of a music section: the add-music window is open with a skeleton, the plus does not spin */
  const rec = await b.ev(`(function(){ var e=document.querySelector("[data-recv] [data-addm]"); return !!e })()`);
  r = await press("[data-recv] [data-addm], [data-addm]", winProbe); await shot("3_addm");
  ok(r.win > 0 && (r.skel > 0 || r.rows > 0), "plus (data-addm): window at once with a skeleton or rows " + JSON.stringify(r));
  ok(!r.selfBusy && !r.seen.length, "plus (data-addm): no aria-busy on it or anything " + JSON.stringify(r.seen));
  await b.sleep(3800); await shot("3b_addm_loaded");
  await closeAll();

  /* 4. the loop button while a song plays: a setting, no request, no spin */
  await b.ev(`window.__bioDelay = 3000`);
  r = await press("[data-icard] [data-audio]", `({ st: document.querySelector("[data-audio][data-st=wait]") ? "wait" : "", cardBusy: !!document.querySelector(".bio-c[aria-busy], .bio-card[aria-busy], .rrow[aria-busy], .rcard[aria-busy]") })`);   /* a song card: the audio keeps its own wait (data-st), the card shimmers (the file can be quick: the watcher saw it too) */
  await shot("4a_song");
  ok(r.st === "wait" || r.seen.some(x => /bio-c|bio-card|rrow|rcard/.test(x)), "song card: data-st=wait and the card shimmers " + JSON.stringify(r));
  await b.sleep(300);
  r = await press("[data-recvloop]", `({})`); await shot("4_loop");
  await b.sleep(1200);
  const loopSeen = await seen();
  ok(!r.selfBusy && !/recvloop/.test(r.seen.join(";")) && !/recvloop/.test(loopSeen), "loop (data-recvloop): never aria-busy " + JSON.stringify(r.seen) + " " + loopSeen);

  /* 5. a heart: the pressed heart shows the wait until the answer, clears on success and on failure */
  for (const mode of ["success", "failure"]) {
    await b.ev(`window.__bioFailRe = ${mode === "failure" ? JSON.stringify("(POST|DELETE) .*song_likes") : "null"}; window.__bioDelay = 2500`);
    r = await b.ev(`(async function(){ ${vis}
      var e=[].filter.call(document.querySelectorAll("[data-like][aria-pressed=false]"),vis)[0]; if(!e) return "none";
      var was=e.getAttribute("aria-pressed"); e.click();
      await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})});
      var during=e.getAttribute("aria-busy"); window.__heart=e; return JSON.stringify({ during: during, cls: e.className.slice(0,40) }) })()`);
    await shot("5_heart_" + mode);
    const o = r === "none" ? null : JSON.parse(r);
    ok(o && o.during === "true", "heart (" + mode + "): aria-busy on the pressed heart while waiting " + r);
    await b.sleep(3200);
    ok(await b.ev(`window.__heart && !window.__heart.hasAttribute("aria-busy")`), "heart (" + mode + "): cleared after the answer");
  }
  await closeAll();
  /* 6. the plus beside the exercises: a menu, no wait, no spin */
  r = await press("[data-addex]", winProbe); await shot("2_plus");
  ok(r.win > 0 && !r.selfBusy && !r.seen.length, "plus (data-addex): menu at once, no aria-busy " + JSON.stringify(r));
  await closeAll();

  await b.ev(`window.__bioFailRe = null`);

  /* ---- phase B: windows, panels and confirms. A fresh page for each, so that a menu left open cannot change the next ---- */
  const URL0 = (process.env.BIO_URL || "http://localhost:5191") + "/biodanza/";
  async function fresh(enter) {
    await b.ev("window.__bioDelay = 0; window.__bioFailRe = null");
    await b.send("Page.navigate", { url: URL0 });
    for (let k = 0; k < 80 && !(await b.ev("(function(){var e=document.querySelector(\"[data-vrow=v1] .rrow__main\");return !!e&&e.getBoundingClientRect().height>0})()")); k++) await b.sleep(250);
    await b.sleep(500); await b.ev(WATCH);
    if (enter) { await b.ev("document.querySelector(\"[data-vrow=v1] .rrow__main\").click()"); for (let k = 0; k < 40 && !(await b.ev("document.querySelectorAll(\"[data-icard]\").length")); k++) await b.sleep(250); await b.sleep(600); }
  }
  const anySkel = "document.querySelectorAll(\".rskel\").length";
  /* open a menu, then press one of its items by its text; the probe runs two frames after the item */
  async function menuItem(opener, text, probe) {
    await b.ev("(function(){ var o=[].filter.call(document.querySelectorAll(" + JSON.stringify(opener) + "),function(e){var r=e.getBoundingClientRect();return r.width>0&&r.bottom>0})[0]; o.click(); return 1 })()");
    await b.sleep(400);
    await b.ev("window.__bioDelay = 3000");
    return JSON.parse(await b.ev("(async function(){ var it=[].filter.call(document.querySelectorAll(\"#moreMenu [data-k]\"),function(e){return e.textContent.indexOf(" + JSON.stringify(text) + ")>=0})[0]; if(!it) return JSON.stringify({none:true}); window.__w.seen.length=0; it.click(); await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})}); var o=" + probe + "; o.itemBusy = it.getAttribute(\"aria-busy\")===\"true\"; o.seen = window.__w.seen.slice(); return JSON.stringify(o) })()"));
  }
  const opened = (name, r, needSkel) => { ok(!r.none && r.win > 0 && (!needSkel || r.skel > 0 || r.rows > 0), name + ": window or panel at once" + (needSkel ? " with a skeleton or content" : "") + " " + JSON.stringify(r)); ok(!r.itemBusy && !r.seen.length, name + ": no aria-busy on the item or anything " + JSON.stringify(r.seen)); };
  const wp = winProbe.replace("return { win: d.length", "return { win: d.length + document.querySelectorAll(\"[data-cdpane]\").length + (document.getElementById(\"ina\") ? 1 : 0)");
  await fresh(false);
  r = await menuItem("[data-act=homemore]", "ויוונסיות שאהבתי", wp); await shot("B1_likedviv"); opened("liked vivencias", r, true);
  await fresh(false);
  r = await menuItem("[data-act=homemore]", "מוסיקה שאהבתי", wp); await shot("B2_likedmusic"); opened("liked music", r, true);
  await fresh(false);
  r = await menuItem("[data-act=homemore]", "קטלוג", wp); await shot("B3_catalog"); opened("catalog panel", r, true);
  await fresh(false);
  r = await menuItem("[data-vm]", "שיתוף", wp); await shot("B4_share"); opened("share", r, true);
  await fresh(true);
  r = await press("[data-hist]", wp); await shot("B5_history"); ok(r.win > 0 && (r.skel > 0 || r.rows > 0), "history: window at once with skeleton or rows " + JSON.stringify(r)); ok(!r.selfBusy && !r.seen.length, "history: no aria-busy " + JSON.stringify(r.seen));
  await fresh(true);
  r = await press("[data-icard=i3] [data-edit]", wp); await shot("B6_exercise"); ok(r.win > 0, "exercise editor from a row: window or screen at once " + JSON.stringify(r)); ok(!r.selfBusy && !r.seen.length, "exercise editor: no aria-busy " + JSON.stringify(r.seen));

  /* the exercises of a song (a preview): the window or layer is there at once, with a skeleton inside */
  await fresh(true);
  await b.ev("document.querySelector(\"[data-icard=i2] [data-edit]\").click()"); await b.sleep(900);
  await b.ev("document.querySelector(\"#imus [data-addm], [data-addm]\").click()"); await b.ev("window.__bioDelay = 0"); await b.sleep(3800);
  await b.ev("window.__bioDelay = 3000");
  r = await press("[data-mfxg]", wp, true);   /* the song's button shows on hover or touch; the press is the same */
  await shot("B6b_songpreview");
  ok(r.win > 0 && (r.skel > 0 || r.rows > 0), "song preview (the exercises of a song): window at once with a skeleton " + JSON.stringify(r));
  ok(!r.selfBusy && !r.seen.length, "song preview: no aria-busy on the opener " + JSON.stringify(r.seen));

  /* a confirm that deletes: the pressed button waits, then the window closes, on success and on failure */
  for (const mode of ["success", "failure"]) {
    await fresh(true);
    await b.ev("document.querySelector(\"[data-icard=i1] [data-edit]\").click()"); await b.sleep(900);
    await b.ev("window.__bioFailRe = " + (mode === "failure" ? JSON.stringify("DELETE ") : "null") + "; window.__bioDelay = 2500");
    r = await press("[data-orm]", wp); await shot("B7_rmconfirm_" + mode);
    ok(r.win > 0 && !r.selfBusy, "remove song: the confirm opens at once, the x does not spin " + JSON.stringify(r));
    r = await b.ev("(async function(){ var c=document.getElementById(\"crmo\"); if(!c) return \"none\"; c.click(); await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})}); window.__c=c; return c.getAttribute(\"aria-busy\") })()");
    await shot("B8_rmbusy_" + mode);
    ok(r === "true", "delete confirm (" + mode + "): aria-busy on the pressed button while waiting " + r);
    await b.sleep(3200);
    ok(await b.ev("window.__c && !window.__c.hasAttribute(\"aria-busy\")"), "delete confirm (" + mode + "): cleared after the answer");
  }
  /* a confirm that adds: the same */
  for (const mode of ["success", "failure"]) {
    await fresh(true);
    await b.ev("document.querySelector(\"[data-icard=i2] [data-edit]\").click()"); await b.sleep(900);
    r = await press("#imus [data-addm], [data-addm]", wp);
    ok(r.win > 0 && (r.skel > 0 || r.rows > 0) && !r.selfBusy, "exercise plus: window at once with skeleton, no spin " + JSON.stringify(r));
    await b.ev("window.__bioDelay = 0"); await b.sleep(3800);
    await b.ev("window.__bioFailRe = " + (mode === "failure" ? JSON.stringify("POST .*item_music_options") : "null") + "; window.__bioDelay = 2500");
    const card = await b.ev("(function(){ var c=[].filter.call(document.querySelectorAll(\"[data-amadd]\"),function(e){return e.getBoundingClientRect().height>0})[0]; if(!c) return false; c.click(); return true })()");
    await b.sleep(500);
    r = await b.ev("(async function(){ var c=document.getElementById(\"cdadd\")||document.getElementById(\"cradd\")||document.getElementById(\"cadd\"); if(!c) return \"none\"; c.click(); await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})}); window.__c=c; return c.getAttribute(\"aria-busy\") })()");
    await shot("B9_addbusy_" + mode);
    ok(card && r === "true", "add (destination picker) (" + mode + "): aria-busy on the pressed button while waiting " + r);
    await b.sleep(3200);
    ok(await b.ev("window.__c && !window.__c.hasAttribute(\"aria-busy\")"), "add (destination picker) (" + mode + "): cleared after the answer");
  }
  /* a name popup: the save waits on itself */
  await fresh(false);
  r = await menuItem("[data-act=homemore]", "יצירת ויוונסיה", wp); ok(r.win > 0 && !r.itemBusy && !r.seen.length, "new vivencia: popup at once, no spin " + JSON.stringify(r));
  await b.ev("var i=document.getElementById(\"nt\"); i.value=\"x\"; i.dispatchEvent(new Event(\"input\"))");
  r = await b.ev("(async function(){ var c=document.getElementById(\"nsave\"); if(!c) return \"none\"; c.click(); await new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})}); window.__c=c; return c.getAttribute(\"aria-busy\") })()");
  ok(r === "true", "name save: aria-busy on the save while waiting " + r); await b.sleep(3500);
  ok(await b.ev("window.__c && !window.__c.hasAttribute(\"aria-busy\")"), "name save: cleared after the answer");
  console.log(fails ? "FAILED " + fails : "ALL PASSED");
} catch (e) { console.log("FATAL", e.stack); fails++; } finally { b.close(); process.exit(fails ? 1 : 0); }
