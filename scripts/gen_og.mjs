/* ==========================================================================
   Generate the social-share / Open Graph card (assets/og-cover.png).

   The card mirrors the live site: the "Clear Water" paper, the FLOA wordmark,
   the hero headline, and the signature "everything resolves into one hub"
   diagram — the same SVG the hero animates, frozen in its connected state.

   Rendered in Chromium via Playwright so Hebrew (RTL) and the brand fonts
   (Rubik + Assistant) come out exactly as on the page. The fonts are pulled
   from Google Fonts, subset to just the glyphs used, and embedded as data URIs
   so the render doesn't depend on network timing.

   Run:  node scripts/gen_og.mjs
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

// default to a normal resolve; PW lets a non-standard install be pointed at
const pw = await import(process.env.PW || "playwright");
const chromium = pw.chromium || pw.default?.chromium;

const OUT = "assets/og-cover.png";

// every character the card renders — text= returns one tight woff2 per face
const CHARS =
  "FLOA " +
  "כל פתרון דיגיטלי שהעסק שלך צריך " +
  "מערכות, אוטומציות ופתרונות דיגיטליים לעסק " +
  "אתרים · אפליקציות · CRM · תשלומים " +
  "הכול מחובר למערכת אחת";

function curl(url) {
  return execFileSync("curl", [
    "-s", "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    url,
  ]);
}

// Build a CSS block where every url(...woff2) is inlined as a data: URI.
function embeddedFontCss() {
  const api =
    "https://fonts.googleapis.com/css2?" +
    "family=Rubik:wght@600;700&family=Assistant:wght@600;700" +
    "&text=" + encodeURIComponent([...new Set(CHARS)].join("")) +
    "&display=swap";
  let css = curl(api).toString();
  const urls = [...new Set(css.match(/https:\/\/[^)]+\.woff2/g) || [])];
  for (const u of urls) {
    const b64 = curl(u).toString("base64");
    css = css.split(u).join(`data:font/woff2;base64,${b64}`);
  }
  return css;
}

// The hero system diagram, frozen "all connected" (lifted from index.html).
const DIAGRAM = `
<svg class="sys" viewBox="0 0 820 470" role="img" aria-label="תרשים מערכת FLOA">
  <defs>
    <linearGradient id="wire" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7FC5E4"/><stop offset="1" stop-color="#0E8C7E"/>
    </linearGradient>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#0F2A33" flood-opacity=".10"/>
    </filter>
    <filter id="hubGlow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0E8C7E" flood-opacity=".38"/>
    </filter>
  </defs>
  <g fill="none" stroke="url(#wire)" stroke-width="2.4" stroke-linecap="round">
    <path d="M284 150 C 320 176, 344 200, 370 224"/>
    <path d="M592 122 C 545 158, 500 192, 458 222"/>
    <path d="M644 286 C 590 274, 510 258, 460 250"/>
    <path d="M430 384 C 424 342, 420 306, 416 280"/>
    <path d="M236 352 C 288 322, 332 288, 366 262"/>
  </g>
  <g class="node">
    <rect x="96" y="52" width="188" height="118" rx="16" filter="url(#cardShadow)" fill="#fff"/>
    <circle cx="118" cy="74" r="4" fill="#C6D3D6"/><circle cx="132" cy="74" r="4" fill="#C6D3D6"/><circle cx="146" cy="74" r="4" fill="#C6D3D6"/>
    <rect x="116" y="94" width="86" height="10" rx="5" fill="#0E8C7E"/>
    <rect x="116" y="114" width="148" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="116" y="132" width="120" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="116" y="150" width="60" height="8" rx="4" fill="#7FC5E4"/>
  </g>
  <g class="node">
    <rect x="592" y="36" width="86" height="150" rx="16" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="606" y="56" width="58" height="30" rx="8" fill="#0E8C7E"/>
    <rect x="606" y="96" width="58" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="606" y="112" width="44" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="606" y="140" width="58" height="22" rx="8" fill="#7FC5E4"/>
  </g>
  <g class="node">
    <path d="M660 250 h84 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-56 l-22 20 v-20 h-6 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16 z" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="676" y="272" width="52" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="676" y="288" width="34" height="8" rx="4" fill="#0E8C7E"/>
  </g>
  <g class="node">
    <rect x="352" y="384" width="160" height="60" rx="12" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="368" y="398" width="128" height="12" rx="6" fill="#0E8C7E"/>
    <rect x="368" y="420" width="70" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="452" y="420" width="44" height="8" rx="4" fill="#7FC5E4"/>
  </g>
  <g class="node">
    <rect x="86" y="330" width="150" height="72" rx="14" filter="url(#cardShadow)" fill="#fff"/>
    <circle cx="106" cy="350" r="5" fill="#0E8C7E"/><rect x="120" y="346" width="98" height="8" rx="4" fill="#D9E3E1"/>
    <circle cx="106" cy="372" r="5" fill="#7FC5E4"/><rect x="120" y="368" width="76" height="8" rx="4" fill="#D9E3E1"/>
    <circle cx="106" cy="392" r="5" fill="#C6D3D6"/><rect x="120" y="388" width="56" height="8" rx="4" fill="#D9E3E1"/>
  </g>
  <g>
    <rect x="368" y="212" width="90" height="66" rx="20" fill="#0E8C7E" filter="url(#hubGlow)"/>
    <g stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none">
      <path d="M386 245 h16"/><path d="M402 245 L 418 231"/><path d="M402 245 L 418 259"/>
      <circle cx="422" cy="231" r="3.4" fill="#fff" stroke="none"/>
      <circle cx="422" cy="259" r="3.4" fill="#fff" stroke="none"/>
      <circle cx="402" cy="245" r="4.4" fill="#fff" stroke="none"/>
    </g>
  </g>
</svg>`;

const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
${embeddedFontCss()}
* { margin:0; box-sizing:border-box; }
html,body { width:1200px; height:630px; }
body {
  display:flex; align-items:center; gap:20px;
  padding:76px 84px;
  background:
    radial-gradient(1100px 620px at 88% -10%, rgba(127,197,228,.20), transparent 60%),
    radial-gradient(900px 560px at 6% 118%, rgba(14,140,126,.12), transparent 60%),
    #E9F0EE;
  font-family:"Assistant", system-ui, sans-serif; color:#0F2A33;
}
.copy { flex:1 1 52%; min-width:0; }
.logo {
  font-family:"Rubik", sans-serif; font-weight:700; font-size:40px;
  letter-spacing:.14em; color:#0E8C7E; margin-bottom:26px;
}
h1 {
  font-family:"Rubik", sans-serif; font-weight:700; font-size:66px;
  line-height:1.12; letter-spacing:-.01em; margin-bottom:26px;
}
.sub { font-size:29px; font-weight:600; line-height:1.4; color:#24444F; max-width:15ch; }
.pills { display:flex; flex-wrap:nowrap; gap:10px; margin-top:34px; }
.pill {
  font-size:19px; font-weight:600; color:#0A6C61; white-space:nowrap;
  background:#C9E6DE; border-radius:999px; padding:8px 15px;
}
.art { flex:1 1 48%; display:flex; align-items:center; justify-content:center; }
.sys { width:100%; height:auto; filter:drop-shadow(0 24px 40px rgba(15,42,51,.10)); }
</style></head>
<body>
  <div class="copy">
    <div class="logo">FLOA</div>
    <h1>כל פתרון דיגיטלי שהעסק שלך צריך</h1>
    <p class="sub">מערכות, אוטומציות ופתרונות דיגיטליים שמחברים את כל העסק למערכת אחת</p>
    <div class="pills">
      <span class="pill">אתרים</span><span class="pill">אפליקציות</span>
      <span class="pill">אוטומציות</span><span class="pill">CRM</span>
    </div>
  </div>
  <div class="art">${DIAGRAM}</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1, // OG spec size; keeps the file light for WhatsApp
});
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const buf = await page.screenshot({ type: "png" });
writeFileSync(OUT, buf);
await browser.close();
console.log("wrote", OUT, buf.length, "bytes");
