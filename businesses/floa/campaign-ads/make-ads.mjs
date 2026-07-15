/* Renders FLOA's three Meta ad creatives, 1080x1080 (square, safe in every
   Advantage+ placement), at 2x. Same palette and type as the site. */
import { writeFile, mkdir } from "node:fs/promises";

const OUT = "C:/Users/ofira/Desktop/floa/businesses/floa/campaign-ads";
await mkdir(OUT, { recursive: true });

const MARK = `<svg viewBox="0 0 100 100" width="88" height="88" aria-hidden="true">
  <rect width="100" height="100" rx="24" fill="#0E8C7E"/>
  <g fill="none" stroke="#fff" stroke-linecap="round">
    <path d="M17 63q16.5-17 33 0t33 0" stroke-width="10" opacity=".75"/>
    <path d="M17 40q16.5-19 33 0t33 0" stroke-width="11.5"/>
  </g>
</svg>`;

/* each creative: an accent trio, an eyebrow, a two-line headline (line two is
   the accent-coloured one), and an optional emphasised fragment on line two. */
const ADS = [
  {
    file: "ad-1-price",
    accent: "#0E8C7E", accentDark: "#0A6C61", tint: "#C9E6DE",
    eyebrow: "דף נחיתה לעסק",
    line1: "דף נחיתה מקצועי",
    line2: 'החל מ־<b>500&nbsp;₪</b>',
    line2Accent: true,
  },
  {
    file: "ad-2-pain",
    accent: "#C1594A", accentDark: "#8E3527", tint: "#F0D7D0",
    eyebrow: "רגע לפני שתמשיכו",
    line1: "שולחים לקוחות לאתר",
    line2: "שלא באמת מוכר?",
    line2Accent: true,
  },
  {
    file: "ad-3-fit",
    accent: "#358FBC", accentDark: "#1C6483", tint: "#C7E4F2",
    eyebrow: "המסלול המהיר",
    line1: "יש לכם תוכן מוכן?",
    line2: "אני אבנה את הדף",
    line2Accent: true,
  },
];

const page = (ad) => `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700&family=Rubik:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:1080px; height:1080px; }
  body {
    font-family:"Assistant",sans-serif;
    background:
      radial-gradient(120% 90% at 82% 6%, ${ad.tint} 0%, rgba(255,255,255,0) 46%),
      #E9F0EE;
    display:flex; align-items:center; justify-content:center;
  }
  .card {
    width:952px; height:952px;
    background:#fff; border:1px solid #DCE6E3; border-radius:56px;
    box-shadow:0 40px 90px -40px rgba(15,42,51,.28);
    padding:96px 88px; position:relative; overflow:hidden;
    display:flex; flex-direction:column;
  }
  /* the accent bleed, a nod to the site's coloured section rules */
  .card::before {
    content:""; position:absolute; inset:0 0 auto 0; height:14px; background:${ad.accent};
  }
  .brand { display:flex; align-items:center; gap:22px; }
  .brand svg { border-radius:24px; box-shadow:0 10px 24px -10px rgba(14,140,126,.5); }
  .word { font-family:"Rubik",sans-serif; font-weight:700; font-size:52px;
    letter-spacing:.34em; color:#0F2A33; padding-right:.34em; }
  .eyebrow {
    align-self:flex-start; margin-top:74px;
    font-family:"Rubik",sans-serif; font-weight:600; font-size:30px;
    color:${ad.accentDark}; background:${ad.tint};
    padding:16px 30px; border-radius:999px;
  }
  h1 {
    font-family:"Rubik",sans-serif; font-weight:700; color:#0F2A33;
    font-size:104px; line-height:1.12; letter-spacing:-.01em; margin-top:auto;
  }
  h1 .two { color:${ad.line2Accent ? ad.accentDark : "#0F2A33"}; display:block; margin-top:8px; }
  h1 b { font-weight:700; font-size:1.18em; }
  .rule { width:132px; height:12px; border-radius:999px; background:${ad.accent}; margin-top:56px; }
  .foot { margin-top:auto; display:flex; align-items:baseline; justify-content:space-between; }
  .domain { font-family:"Rubik",sans-serif; font-weight:600; font-size:34px; color:#586C73; letter-spacing:.02em; }
  .foot .note { font-size:26px; color:#63757B; }
</style></head><body>
  <div class="card">
    <div class="brand">${MARK}<span class="word">FLOA</span></div>
    <div class="eyebrow">${ad.eyebrow}</div>
    <h1><span class="one">${ad.line1}</span><span class="two">${ad.line2}</span></h1>
    <div class="rule"></div>
    <div class="foot">
      <span class="domain">floa.co.il</span>
      <span class="note">אתרים ודפי נחיתה לעסק</span>
    </div>
  </div>
</body></html>`;

/* --- render each via headless Chrome on port 9223 --- */
const newTab = () => fetch("http://127.0.0.1:9223/json/new?about:blank", { method: "PUT" }).then((r) => r.json());

async function render(html, outPng) {
  const cdp = await newTab();
  const ws = new WebSocket(cdp.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); } };
  const send = (method, params = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1080, height: 1080, deviceScaleFactor: 2, mobile: false });
  await send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
  await new Promise((r) => setTimeout(r, 2500));
  await send("Runtime.evaluate", { expression: "document.fonts.ready", awaitPromise: true });
  await new Promise((r) => setTimeout(r, 600));
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 1080, height: 1080, scale: 2 } });
  await writeFile(outPng, Buffer.from(shot.data, "base64"));
  ws.close();
}

for (const ad of ADS) {
  await render(page(ad), `${OUT}/${ad.file}.png`);
  console.log(`  ${ad.file}.png`);
}
console.log("done ->", OUT);
process.exit(0);
