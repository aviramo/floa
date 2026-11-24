// Law 2 audit: margin on any element, vertical padding on a bare container, a second side gutter inside a gutter.
import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300, H = 900;
const b = await launch(W, H);
const click = (js) => b.ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`);
const probe = `(function(){var out={};
 function nm(e){var s=e.tagName.toLowerCase();if(e.id)s+="#"+e.id;else if(e.className&&typeof e.className=="string")s+="."+e.className.trim().split(/\s+/).slice(0,2).join(".");return s}
 function path(e){var p=[];while(e&&e.nodeType==1&&p.length<3){p.unshift(nm(e));e=e.parentElement}return p.join(">")}
 function ownText(e){return [].some.call(e.childNodes,function(n){return n.nodeType==3&&n.textContent.trim()})}
 function surface(cs,e){return (cs.backgroundColor!=="rgba(0, 0, 0, 0)"&&cs.backgroundColor!=="transparent")||parseFloat(cs.borderTopWidth)>0||parseFloat(cs.borderBottomWidth)>0||cs.boxShadow!=="none"||/^(button|input|select|textarea|label|a|summary|h1|h2|h3|span|b|i)$/i.test(e.tagName)||ownText(e)}
 [].forEach.call(document.querySelectorAll("body *"),function(e){
   if(e.closest("svg,dialog:not([open]),[hidden],script,style")||e.tagName==="DIALOG") return;
   var cs=getComputedStyle(e); if(cs.display==="none"||cs.visibility==="hidden"||cs.position==="fixed"&&false) return;
   var r=e.getBoundingClientRect(); if(!r.width&&!r.height) return;
   ["marginTop","marginBottom","marginLeft","marginRight"].forEach(function(k){var n=parseFloat(cs[k]); if(n){var key=(n<0?"NEGATIVE-MARGIN ":"MARGIN ")+k+"="+Math.round(n)+" "+path(e); out[key]=(out[key]||0)+1}});
   var sib=e.parentElement?[].filter.call(e.parentElement.children,function(c){var q=c.getBoundingClientRect();return q.width&&q.height}).length:0;
   if(!surface(cs,e)&&e.children.length&&!e.classList.contains("rdiv")&&!e.classList.contains("sheet")&&!/auto|scroll/.test(cs.overflowY)&&sib>1){
     var pt=parseFloat(cs.paddingTop)||0,pb=parseFloat(cs.paddingBottom)||0;
     if(pt||pb){var key="VPAD "+pt+"/"+pb+" "+path(e); out[key]=(out[key]||0)+1}
     var par=e.parentElement; if(par){var ps=getComputedStyle(par); var sp=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0), pp=(parseFloat(ps.paddingLeft)||0)+(parseFloat(ps.paddingRight)||0); if(sp&&pp){var key="DOUBLE-GUTTER "+sp+" in "+pp+" "+path(e); out[key]=(out[key]||0)+1}}
   }
 }); return JSON.stringify(out)})()`;
const kidpad = `(function(){var bad={};[].forEach.call(document.querySelectorAll("dialog[open] .sheet, .rmenu, .bio-c"),function(s){[].forEach.call(s.children,function(c){var cs=getComputedStyle(c);var p=(s.classList.contains("rmenu")?["paddingTop","paddingBottom"]:["paddingTop","paddingBottom","paddingLeft","paddingRight"]).map(function(k){return parseFloat(cs[k])||0});if(p.some(function(x){return x})){bad["SURFACE-CHILD-PAD "+(s.id||s.className.split(" ")[0])+" > "+c.tagName.toLowerCase()+"."+String(c.className).split(" ")[0]+" padding "+p.join("/")]=1}})});return JSON.stringify(bad)})()`;
let total = 0;
const shot = async (name) => { const o = Object.assign(JSON.parse(await b.ev(probe)), JSON.parse(await b.ev(kidpad))); const ks = Object.keys(o); total += ks.length; console.log("== " + name + " (" + ks.length + ")"); ks.sort().slice(0, 60).forEach(k => console.log("  " + k + (o[k] > 1 ? "  x" + o[k] : ""))); };
const esc = () => b.ev("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  await shot("home");
  await click(`document.querySelector('[data-vrow="v1"] .rrow__main')`); await b.sleep(1800); await shot("vivencia");
  await click(`document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`); await b.sleep(1800); await shot("exercise");
  await click(`document.querySelector('[data-catopen]')`); await b.sleep(1500); await shot("catalog exercises");
  await click(`document.querySelector('[data-cat]')`); await b.sleep(900); await shot("catalog category open");
  await click(`document.querySelector('[data-pkt="mu"]')`); await b.sleep(1200); await shot("catalog music tab");
  await click(`document.querySelector('[data-hist]')`); await b.sleep(1500); await shot("history");
  await esc(); await b.sleep(400);
  await click(`document.querySelector('[data-act="homemore"]')`); await b.sleep(500); await shot("menu"); await esc(); await b.sleep(300);
  await click(`document.querySelector('[data-icard="i1"] [data-idel]')`); await b.sleep(900); await shot("confirm");
  console.log("TOTAL " + total);
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
