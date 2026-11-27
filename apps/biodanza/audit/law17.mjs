// Run: node build.mjs --only=biodanza, npm run dev, then node apps/biodanza/audit/law17.mjs 1300 (and 430). Env: BIO_DEV (the server's port, 5173), BIO_PORT (Chrome's). Data is a stub, nothing is written.
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
    leftShown: document.querySelectorAll(".rpanel.is-open").length,
    cat: document.querySelectorAll(".bio-catmain.is-open").length,
    scrims: document.querySelectorAll(".bio-catscrim.is-on, .rpanel-scrim.is-on").length,
    dialogs: [].map.call(document.querySelectorAll("dialog[open]"), function (d) { return d.id; }).sort().join(","),
    pressed: document.querySelectorAll('[data-catopen]:is([aria-pressed="true"], [aria-expanded="true"])').length,
    lock: document.documentElement.classList.contains("rs-lock")
  });
};
window.__overlays = function () {   /* how many overlays are lit now, and is the top thing covered by one */
  var n = 0, s = JSON.parse(window.__snap());
  if (s.plDim) n++; if (s.pdDim) n++; n += s.scrims;
  var ds = [].filter.call(document.querySelectorAll("dialog[open]"), function (d) { try { return d.matches(":modal"); } catch (e) { return true; } });
  var dimmed = function (d) { var c = getComputedStyle(d, "::backdrop").backgroundColor; return !!c && c !== "transparent" && c.replace(/ /g, "").slice(-3) !== ",0)"; };   /* a backdrop with no colour (transparent, or alpha 0) is no dim */
  var top = ds[ds.length - 1], small = !!top && top.matches('[data-size="s"], [data-size="sm"], [data-anchored]');   /* law 17.2's one exception (owner 2026-11-26): a short window and a menu have NO dim */
  return { lit: n, modal: ds.filter(dimmed).length, small: small, smallDim: small ? (n + (dimmed(top) ? 1 : 0)) : 0, why: small ? n + " " + getComputedStyle(top, "::backdrop").backgroundColor : "", s: s };
};
window.__closeTop = function () {
  var ds = [].filter.call(document.querySelectorAll("dialog[open]"), function () { return true; });
  if (ds.length) { var d = ds[ds.length - 1]; var x = d.querySelector(".rs-x"); if (x && x.offsetParent) { x.click(); return "dialog-x " + d.id; } return "ESC " + d.id; }
  var K = window.RosterSheet && RosterSheet.panel ? RosterSheet.panel.live() : [];
  if (K.length) { var t = K[K.length - 1], x = t.querySelector('[data-popup-x]'); if (x) { x.click(); return "left"; } return "ESC panel"; }   /* the top popup: its own X, or Escape (the kit closes the top one only) */
  var L = window.__leftLive ? window.__leftLive() : [];
  if (L.length) { var top = L[L.length - 1], bk = top.querySelector('[data-popup-x], [data-act="back"]'); if (bk) { bk.click(); return "left"; } }
  var cl = [].slice.call(document.querySelectorAll(".bio-catmain.is-open")); if (cl.length) { var c = cl[cl.length - 1], cx = c.querySelector("#catX"); if (cx) { cx.click(); if (c.classList.contains("is-open")) cx.click(); return "catalog"; } }
  return "nothing";
};
window.__click = function (sel) { var e = document.querySelector(sel); if (!e) return false; e.click(); return true; };
window.__appMenu = function () { var b = [].filter.call(document.querySelectorAll("[data-rappmenu]"), function (x) { var r = x.getBoundingClientRect(); if (!r.width) return false; var t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && x.contains(t); }).pop(); if (!b) return false; b.click(); return true; };   /* the app menu: the one button that is on top (the kit's, in the header) */
window.__menuPick = function (text) { var x = [].filter.call(document.querySelectorAll(".rmenu button, .rmenu [role=menuitem]"), function (x) { return x.textContent.indexOf(text) >= 0; })[0]; if (!x) return false; x.click(); return true; };
`;
async function ev(x) { return b.ev(x); }
async function closeTop() {
  const how = await ev(`window.__closeTop()`);
  if (how.startsWith("ESC")) { for (const t of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type: t, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); }
  return how;
}
const esc = async () => { for (const t of ["keyDown", "keyUp"]) await b.send("Input.dispatchKeyEvent", { type: t, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); };
async function closeMenu() {   /* a menu a check left open (its pick was not found) is closed before the next check: Escape closes the menu only */
  if (await ev(`!!document.getElementById("rsMenu")`)) { await esc(); await b.sleep(400); }
}
/* inline: the opener opens NO overlay on purpose (the vivencia's name is edited in place from its pencil, ui/docs/realtime.md); Escape leaves the edit */
async function check(name, open, inline) {
  await closeMenu();
  const before = await ev(`window.__snap()`);
  const notice = await ev(`(function(){ var d = document.getElementById("rappWin"); return d && d.open ? d.textContent.replace(/\\s+/g, " ").trim().slice(0, 80) : ""; })()`);   /* a kit notice (RosterApp) already open: named in the result, it is not this check's window */
  const ok = await open();
  await b.sleep(1300);
  if (!ok) { await closeMenu(); results.push([name, "SKIP (opener not found)" + (notice ? " | a kit notice was open before: " + notice : "")]); return; }
  const o = await ev(`window.__overlays()`);
  const covered = o.lit + o.modal, verdict = inline ? (covered ? "OVERLAY ON AN INLINE EDIT" : "no overlay ok (inline edit)") : o.small ? (o.smallDim ? "DIM ON A SHORT WINDOW (" + o.why + ")" : "no dim ok (short window)") : (covered >= 1 ? "overlay ok" : "NO OVERLAY");
  const how = inline ? await ev(`(function(){ var a = document.activeElement, f = a && a.closest && a.closest(".rfield--inline"); if (!f) return "inline (no field focused)"; a.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true, cancelable: true })); return "ESC inline"; })()`) : await closeTop(); await b.sleep(900);   /* the inline edit leaves by its own Escape: a key sent to the page would close a window that was open before */
  await closeMenu();
  const after = await ev(`window.__snap()`);
  const same = before === after;
  results.push([name, verdict + " | close:" + how + " | " + (same ? "restored" : "CHANGED " + before + " -> " + after) + (notice ? " | a kit notice was open before: " + notice : "")]);
}
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: "try{localStorage.clear()}catch(e){}\n" + fs.readFileSync(new URL("./law17_stub.js", import.meta.url), "utf8") + "\n" + PAGE });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: phone });
  await b.send("Page.navigate", { url: "http://localhost:" + (process.env.BIO_DEV || 5173) + "/biodanza/" }); await b.sleep(3500);
  const dockMenu = async (t) => { await ev(`window.__appMenu()`); await b.sleep(400); return ev(`window.__menuPick(${JSON.stringify(t)})`); };
  // home
  await check("home: catalog exercises (menu)", () => dockMenu("קטלוג תרגילים"));
  await check("home: catalog music (menu)", () => dockMenu("קטלוג מוזיקות"));
  await check("home: history", () => dockMenu("היסטוריית האזנה"));
  await check("home: liked vivencias", () => dockMenu("ויוונסיות שאהבתי"));
  await check("home: liked music", () => dockMenu("מוסיקה שאהבתי"));
  await check("home: duplicate (card)", () => ev(`window.__click('[data-vm="v1"]')`));
  await check("home: sharing (card)", () => ev(`window.__click('[data-vvis="v1"]')`));
  await check("home: new vivencia", () => ev(`window.__click('[data-act="vnew"]')`));
  // inside a vivencia
  await ev(`window.__click('[data-vrow="v1"]')`); await b.sleep(1800);
  await check("viv: sharing (header)", () => ev(`window.__click('[data-act="vis"]')`));
  await check("viv: rename (the pencil, in place)", () => ev(`window.__click('button[aria-label="עריכת הנושא"]')`), true);
  await check("viv: delete confirm (menu)", async () => { await ev(`window.__click('[data-act="vmore"]')`); await b.sleep(400); return ev(`window.__menuPick("מחיקה")`); });
  await check("viv: exercise from catalog (+)", async () => { await ev(`window.__click('#list [data-addex]')`); await b.sleep(400); return ev(`window.__menuPick("תרגיל מהקטלוג")`); });
  await check("viv: remove exercise confirm", () => ev(`window.__click('[data-rlist-rm]')`));   /* the list's own remove (ui/docs/list.md): a confirm window */
  if (!phone) {
    await ev(`window.__click('[data-icard="i2"]')`); await b.sleep(1500);
    await check("viv+exercise: song's exercises layer", () => ev(`window.__click('#pd [data-mfxg]')`));
    await check("viv+exercise: catalog exercises (menu)", () => dockMenu("קטלוג תרגילים"));
    // a layer over the catalog
    await dockMenu("קטלוג מוזיקות"); await b.sleep(1500);
    const before = await ev(`window.__snap()`);
    /* the music card (owner 2026-11-26) has no count button: a line of the card (data-mxl) opens the song's exercises layer with that exercise beside it, two layers, closed one by one */
    const ok = await ev(`window.__click('.bio-catmain.is-open [data-mxl]')`); await b.sleep(1500);
    if (ok) {
      const o = await ev(`window.__overlays()`);
      let after = "", n = 0; while (n < 3) { await closeTop(); n++; await b.sleep(900); after = await ev(`window.__snap()`); if (after === before) break; }
      results.push(["viv: layer over the music catalog", (o.s.scrims >= 1 ? "overlay ok" : "NO SCRIM") + " | " + (before === after ? "restored after " + n + " closes (catalog below still open)" : "CHANGED " + before + " -> " + after)]);
    } else results.push(["viv: layer over the music catalog", "SKIP (no exercise line on a music card in the music catalog)"]);
    await closeTop(); await b.sleep(900);
    // the catalog's exercise: it comes out of the divider, and it closes BEFORE the catalog
    await dockMenu("קטלוג תרגילים"); await b.sleep(1500);
    await ev(`(function(){ if (!document.querySelector('.bio-catmain.is-open .rgrid [data-ex]')) window.__click('.bio-catmain.is-open [data-cat] .racc__head[aria-expanded="false"]'); })()`); await b.sleep(700);
    const opened = await ev(`(function(){ var cs = [].slice.call(document.querySelectorAll('.bio-catmain.is-open .rgrid [data-ex]')).filter(function (c) { var card = c.closest('.bio-card') || c; return !card.hasAttribute('aria-current'); }); if (!cs.length) return false; cs[0].click(); return true; })()`); await b.sleep(1200);
    if (opened) {
      const pv = await ev(`(function(){ var L = RosterSheet.panel.live(), p = L[L.length - 1], m = document.querySelector('.bio-catmain.is-open'); if (!p || p === m) return "no preview"; var pr = p.getBoundingClientRect(), mr = m.getBoundingClientRect(); return JSON.stringify({ off: p.parentNode.hasAttribute('data-from') ? 'from' : '', side: p.parentNode.dataset.side, edge: Math.round(pr.right) + "/" + Math.round(mr.left) }); })()`);
      const o2 = JSON.parse(pv.startsWith("{") ? pv : "{}");
      const fromDivider = o2.side === "end" && o2.off === "from" && o2.edge && o2.edge.split("/")[0] === o2.edge.split("/")[1];
      results.push(["viv+exercise: catalog exercise out of the divider", fromDivider ? "ok " + pv : "FAIL " + pv]);
      await ev(`window.__click('.bio-catmain.is-open #catX')`); await b.sleep(110);
      const mid = await ev(`(function(){ var m = document.querySelector('.bio-catmain'), L = document.querySelectorAll('.rpanel'); var p = [].filter.call(L, function (x) { return x !== m; })[0]; return JSON.stringify({ prevOpen: !!(p && p.classList.contains('is-open')), catOpen: m.classList.contains('is-open') }); })()`);
      await b.sleep(700);
      const end = await ev(`(function(){ return JSON.stringify({ panels: document.querySelectorAll('.rpanel.is-open').length, scrims: document.querySelectorAll('.rpanel-scrim').length }); })()`);
      const m1 = JSON.parse(mid), e1 = JSON.parse(end);
      results.push(["viv+exercise: catalog closes its exercise first", !m1.prevOpen && m1.catOpen && e1.panels === 0 && e1.scrims === 0 ? "ok" : "FAIL mid " + mid + " end " + end]);
    } else results.push(["viv+exercise: catalog exercise out of the divider", "SKIP (no exercise card)"]);
  } else {
    await check("viv (phone): open exercise", () => ev(`window.__click('[data-icard="i2"]')`));
  }
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
for (const [n, r] of results) console.log((/NO |CHANGED|FAIL|DIM ON/.test(r) ? "FAIL  " : /SKIP/.test(r) ? "skip  " : "ok    ") + n + " :: " + r);
