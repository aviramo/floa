import fs from "fs"; import { launch } from "./lib.mjs";
const W = +process.argv[2] || 1300, H = 850;
const b = await launch(W, H);
const click = (js) => b.ev(`(function(){var e=${js}; if(!e) return 'none'; e.click(); return 'ok'})()`);
const probe = `(function(){var out=[];
 [].forEach.call(document.querySelectorAll("header.rhead, .sheet-head"),function(h){ var hr=h.getBoundingClientRect(); if(!hr.width||!hr.height) return; var cs=getComputedStyle(h);
  var kids=[].filter.call(h.querySelectorAll("button, a.rbtn, .rgroup, input"),function(k){var r=k.getBoundingClientRect();return r.width>0});
  var s="HEAD "+(h.closest("dialog")?"dlg ":"")+Math.round(hr.width)+"x"+Math.round(hr.height)+" pad "+cs.paddingTop+"/"+cs.paddingBottom+" :: ";
  var ib=kids.filter(function(k){return k.matches(".rbtn--icon")}).map(function(k){return k.getBoundingClientRect()}).sort(function(a,b){return a.left-b.left});
  for(var i=1;i<ib.length;i++){var g=Math.round(ib[i].left-ib[i-1].right); s+=" icongap="+g}
  s+=" btns="+kids.map(function(k){var r=k.getBoundingClientRect();return (k.getAttribute("aria-label")||k.id||k.tagName)+"@"+Math.round(r.left)+"("+Math.round(r.width)+"x"+Math.round(r.height)+")"}).join(" ");
  out.push(s)});
 [].forEach.call(document.querySelectorAll("input:not([type=range]):not([type=hidden]):not([type=checkbox]), select, textarea"),function(e){var r=e.getBoundingClientRect(); if(!r.width||!r.height) return; var c=e.closest(".rfield,.bio-search,.rhead,.pgs"); var rr=(c||e).getBoundingClientRect(); if(rr.height<43.5) out.push("FIELD<ctl "+(e.id||e.className)+" "+Math.round(rr.width)+"x"+Math.round(rr.height))});
 [].forEach.call(document.querySelectorAll(".ricon-lg,.rfab"),function(e){var r=e.getBoundingClientRect(); if(r.width) out.push("LG "+Math.round(r.width)+"x"+Math.round(r.height)+" "+(e.getAttribute("aria-label")||"")+" anim="+getComputedStyle(e.querySelector("svg")||e).animationName)});
 [].forEach.call(document.querySelectorAll("header.rhead button, header.rhead a.rbtn, .sheet-head button, .sheet-head a.rbtn"),function(e){var r=e.getBoundingClientRect(); if(!r.width) return; var cs=getComputedStyle(e); var filled=cs.backgroundColor!=="rgba(0, 0, 0, 0)"&&cs.backgroundColor!=="transparent"; var txt=(e.textContent||"").trim(); if(!e.matches(".rbtn--icon")||filled||txt) out.push("HEADBTN-VIOLATION "+(e.getAttribute("aria-label")||e.id||e.className)+" icon="+e.matches(".rbtn--icon")+" bg="+cs.backgroundColor+" text='"+txt.slice(0,12)+"'")});
 [].forEach.call(document.querySelectorAll(".rbtn__tail"),function(t){var tr=t.getBoundingClientRect(); if(!tr.width){out.push("TAIL hidden/empty "+t.className+" in "+t.parentElement.className+" ["+t.textContent.slice(0,5)+"]"); return;} var p=t.parentElement, pr=p.getBoundingClientRect(); var sv=[].filter.call(p.children,function(c){return c!==t&&c.getBoundingClientRect().width>0})[0]||p.querySelector("svg"); var gr=sv?sv.getBoundingClientRect():null; var ok=gr?(document.dir==="ltr"||getComputedStyle(document.documentElement).direction==="ltr"?tr.right<=gr.left+1:tr.left>=gr.right-1):null; out.push("TAIL "+(ok?"ok ":"BAD ")+(p.getAttribute("aria-label")||p.className)+" tail["+Math.round(tr.left)+","+Math.round(tr.right)+"] glyph["+(gr?Math.round(gr.left)+","+Math.round(gr.right):"-")+"] gap="+(gr?Math.round(Math.abs(tr.left-gr.right)):"-")+" btn "+Math.round(pr.width)+"x"+Math.round(pr.height)+" t:"+t.textContent.slice(0,6))});
 [].forEach.call(document.querySelectorAll(".bio-c"),function(c){var R=[];[].forEach.call(c.querySelectorAll(".rbtn--icon"),function(b){var r=b.getBoundingClientRect(); if(!r.width) return; var a=getComputedStyle(b,"::after"); var w=Math.max(parseFloat(a.width)||0,r.width), h=parseFloat(a.height)||r.height; var cx=r.left+r.width/2, cy=r.top+r.height/2; R.push({l:cx-w/2,r:cx+w/2,t:cy-h/2,b:cy+h/2,n:b.getAttribute("aria-label")})}); var cr=c.getBoundingClientRect(); for(var i=0;i<R.length;i++){ if(R[i].t<cr.top-1||R[i].b>cr.bottom+1) out.push("TOUCH-OUTSIDE-CARD "+R[i].n); for(var j=i+1;j<R.length;j++){ if(R[i].l<R[j].r-0.5&&R[j].l<R[i].r-0.5&&R[i].t<R[j].b-0.5&&R[j].t<R[i].b-0.5) out.push("TOUCH-OVERLAP "+R[i].n+" / "+R[j].n)}}; out.push("CARD "+Math.round(cr.height)+"h")});
 document.getAnimations().forEach(function(a){ var k=a.effect&&a.effect.getKeyframes?a.effect.getKeyframes():[]; var rot=k.some(function(f){return /rotate/.test(f.transform||"")}); var t=a.effect&&a.effect.target; if(rot&&a.playState==="running"&&t&&t.closest&&!t.closest(".rptr")) out.push("ROTATING-ANIMATION "+(a.animationName||"")+" on "+t.tagName+"."+String(t.className).slice(0,30))});
 return out.join(" ## ")})()`;
try {
  await b.send("Page.enable"); await b.send("Page.addScriptToEvaluateOnNewDocument", { source: fs.readFileSync(new URL("./stub.js", import.meta.url), "utf8") });
  await b.send("Runtime.enable"); await b.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
  await b.send("Page.navigate", { url: "http://localhost:5191/biodanza/" }); await b.sleep(3000);
  const P = async (name, sel) => { if (sel) { const r = await click(sel); if (r === "none") console.log("(missing " + name + ")"); await b.sleep(1500); } console.log("== " + name + "\n" + await b.ev(probe)); await b.shot("C:/tmp/bio/p_" + W + "_" + name + ".png"); };
  await P("home");
  await P("viv", `document.querySelector('[data-vrow="v1"] .rrow__main')`);
  await P("exitem", `document.querySelector('[data-icard="i3"] [data-edit], [data-icard="i3"] .rrow__main')`);
  await P("catalog", `document.querySelector('[data-catopen]')`);
  await P("catex", `(function(){var c=document.querySelector('[data-cat]'); c&&c.click(); return document.querySelector('#list [data-ex]')})()`);
  console.log(await b.ev("(function(){var e=document.querySelector('#list [data-ex] .bio-c__t2 span span span, #list [data-ex] .bio-c__t2 span'); var o=[];[].forEach.call(document.querySelectorAll('#list [data-ex] .bio-c__t2 *'),function(x){var c=getComputedStyle(x);o.push(x.tagName+' '+c.color+' '+c.fontSize+' '+x.getBoundingClientRect().width)});return o.slice(0,8).join(' | ')})()"));
  await P("hist", `document.querySelector('[data-hist]')`);
} catch (e) { console.log("FATAL", e.stack); } finally { b.close(); process.exit(0); }
