// Real drag of an exercise card with the mouse (CDP), mid-drag screenshot, what is on top of the ghost, and what the stub received.
// usage: node drag_test.mjs <width> <scenario: toback | within | backtomain | empty>   (extras are the cards after the divider row inside #plist, the cards with data-back)
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300, SC = process.argv[3] || "toback", H = W < 700 ? 900 : 800;
const b = await launch(W, H);
const click = (js) => b.ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`);
/* the stub has no backlog items: for the scenarios that need some, the last two exercises are moved there by a patch of the stub text */
const STUB_SRC = fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8").replace(/\r?\n  \];(\r?\n  var RECV)/, "\n  ];\n  if (window.__BL) { ITEMS[4].backlog = true; ITEMS[5].backlog = true; }$1");
const wrap = `(function(){var f=window.fetch;window.__patch=[];window.__err=[];addEventListener("error",function(e){window.__err.push(e.message+" @"+e.lineno)});window.fetch=function(u,o){try{if(o&&o.method==="PATCH"&&/vivencia_items/.test(String(u)))window.__patch.push(String(u).split("id=eq.")[1]+" "+o.body)}catch(e){}return f.apply(this,arguments)}})();`;
const pos = (sel) => b.ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; var r=e.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,h:r.height,t:r.top,b:r.bottom}})()`);
const mouse = (type, x, y) => b.send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
const order = `(function(){return JSON.stringify({main:[].map.call(document.querySelectorAll('#plist .bio-icard:not([data-back])'),function(c){return c.dataset.icard}),back:[].map.call(document.querySelectorAll('#plist .bio-icard[data-back]'),function(c){return c.dataset.icard}),patch:window.__patch})})()`;
try {
  await b.send("Page.enable");
  await b.send("Page.addScriptToEvaluateOnNewDocument", { source: ((SC === "backtomain" || SC === "toback") ? "window.__BL=1;" : "") + STUB_SRC + wrap });
  await b.send("Runtime.enable"); await b.send("Network.enable"); await b.send("Network.setCacheDisabled", { cacheDisabled: true });
  await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" });
  await b.sleep(3000);
  await click(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await b.sleep(2000);
  console.log("before", await b.ev(order));
  const from = SC === "backtomain" ? "#plist .bio-icard[data-back]" : (SC==='toback'?'[data-icard="i2"]':SC==='empty'?'[data-icard="i5"]':'[data-icard="i2"]');
  await b.ev(`document.querySelector(${JSON.stringify((SC==='toback'||SC==='empty')?'.rdiv':from)}).scrollIntoView({block:'center'})`); await b.sleep(300);
  const a = await pos(from);
  let tx, ty;
  if (SC === "within") { const t = await pos('[data-icard="i4"]'); tx = t.x; ty = t.y + 10; }
  else if (SC === "backtomain") { const t = await pos('[data-icard="i4"]'); tx = t.x; ty = t.y; }
  else if (SC === "toback") { const t = await pos('#plist .bio-icard[data-back]'); tx = t.x; ty = t.y; }
  else { const t = await pos('.rdiv'); tx = a.x; ty = t.y + 40; }   /* empty: below the divider, over its hint */
  await mouse("mousePressed", a.x, a.y);
  for (let i = 1; i <= 20; i++) { await mouse("mouseMoved", a.x + (tx - a.x) * i / 20, a.y + (ty - a.y) * i / 20); await b.sleep(30); }
  await b.sleep(400);
  try { const shot = await b.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(`C:/tmp/bio/w/drag_${W}_${SC}.png`, Buffer.from(shot.result.data, "base64")); } catch (e) { console.log("shot failed", e.message); }
  const tops = await b.ev(`(function(){var g=[].filter.call(document.querySelectorAll('body > *'),function(e){return e.style.position==='fixed'&&/z-drag/.test(e.style.zIndex)})[0]; if(!g) return 'NO GHOST'; g.style.pointerEvents="auto"; var r=g.getBoundingClientRect(); var pts=[[r.left+r.width/2,r.top+r.height/2],[r.left+r.width/2,r.top+2],[r.left+r.width/2,r.bottom-2],[r.left+8,r.top+r.height/2]]; return JSON.stringify(pts.map(function(p){var els=document.elementsFromPoint(p[0],p[1]); return {top:els[0]===g||g.contains(els[0]), above:els.slice(0,els.indexOf(g)<0?0:els.indexOf(g)).map(function(e){return e.tagName+'.'+String(e.className).split(' ')[0]})}}))+(g.style.pointerEvents="none","")})()`);
  console.log("ghost topmost:", tops); console.log("z", await b.ev(`(function(){var g=[].filter.call(document.querySelectorAll('body > *'),function(e){return e.style.position==='fixed'&&/z-drag/.test(e.style.zIndex)})[0],d=document.querySelector('.bio-dock');var cs=getComputedStyle(d);return JSON.stringify({ghost:getComputedStyle(g).zIndex,dock:cs.zIndex,dockPos:cs.position,dockParent:d.parentElement.tagName+'.'+d.parentElement.id})})()`));
  console.log("stack@bottom", await b.ev(`(function(){var g=[].filter.call(document.querySelectorAll('body > *'),function(e){return e.style.position==='fixed'&&/z-drag/.test(e.style.zIndex)})[0];g.style.pointerEvents='auto';var r=g.getBoundingClientRect();var out=document.elementsFromPoint(r.left+r.width/2, Math.min(r.bottom-2,innerHeight-5)).map(function(e){var cs=getComputedStyle(e);return e.tagName+'.'+String(e.className).split(' ')[0]+' z='+cs.zIndex+' pos='+cs.position+(e===g?' <GHOST':'')}).slice(0,8);g.style.zIndex='9999';var pop=[g.matches(':popover-open'),g.getAttribute('popover'),document.querySelector('.bio-dock').matches(':popover-open')];var out2=document.elementsFromPoint(r.left+r.width/2, Math.min(r.bottom-2,innerHeight-5)).map(function(e){return e.tagName+'.'+String(e.className).split(' ')[0]+(e===g?' <GHOST':'')}).slice(0,4);var d=document.querySelector('.bio-dock'),cs=getComputedStyle(d);g.style.pointerEvents='none';g.style.zIndex='var(--z-drag)';return JSON.stringify({gb:r.bottom,out:out,out2:out2,dock:[cs.isolation,cs.transform,cs.willChange,cs.contain,cs.opacity,d.parentElement.tagName],gp:pop})})()`)); await b.shot(`C:/tmp/bio/cards/s81/drag_${SC}_${W}.png`);
  await mouse("mouseReleased", tx, ty); await b.sleep(1500);
  console.log("after", await b.ev(order));
  console.log("errors", await b.ev("JSON.stringify(window.__err)")); console.log("ghost left?", await b.ev(`!![].filter.call(document.querySelectorAll('body > *'),function(e){return e.style.position==='fixed'&&/z-drag/.test(e.style.zIndex)}).length`));
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); }
