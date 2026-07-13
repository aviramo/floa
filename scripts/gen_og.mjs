/* ==========================================================================
   Generate the share cards — ONE PER PAGE (assets/og-*.png).

   There used to be a single card for the whole site, and it was doing the job
   badly: it carried a headline, a paragraph AND a row of pills, so on a phone
   the sub-line and the pills were a grey smudge nobody could read — and the
   pills still advertised CRM, a service the site no longer offers.

   A share card is seen at about 300px wide, for about half a second, usually in
   a WhatsApp thread. So each card here says exactly ONE thing: the FLOA mark,
   one short line, and the illustration from that page's own hero. Nothing else.
   The line is `og.title` in the content — never the <title>, which is written
   for a search engine and is far too long to read at that size.

   The art is not redrawn here: the solution pages' hero SVGs are read straight
   from src/content/hero-art/, and their palette from the real stylesheets, so a
   card cannot drift away from the page it advertises.

   Rendered in Chromium so Hebrew (RTL) and the brand fonts come out exactly as
   they do on the page. The fonts are fetched from Google, subset to just the
   glyphs used, and inlined as data: URIs so the render never depends on network
   timing.

   Run:  node scripts/gen_og.mjs        (after changing any og.title or hero art)
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const pw = await import(process.env.PW || "playwright");
const chromium = pw.chromium || pw.default?.chromium;

const { home } = await import(pathToFileURL(join(ROOT, "src/content/home.js")).href);
const { solutions } = await import(pathToFileURL(join(ROOT, "src/content/solutions.js")).href);
const { landingOffer } = await import(pathToFileURL(join(ROOT, "src/content/landing-offer.js")).href);
const { deviceMockSvg } = await import(pathToFileURL(join(ROOT, "src/components/device-mock/device-mock.js")).href);

/* --- fonts: subset to exactly the glyphs the cards render ------------------ */
function curl(url) {
  return execFileSync("curl", [
    "-s", "-A",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    url,
  ]);
}

function embeddedFontCss(chars) {
  const api =
    "https://fonts.googleapis.com/css2?family=Rubik:wght@700" +
    "&text=" + encodeURIComponent([...new Set(chars)].join("")) +
    "&display=swap";
  let css = curl(api).toString();
  for (const u of [...new Set(css.match(/https:\/\/[^)]+\.woff2/g) || [])]) {
    css = css.split(u).join(`data:font/woff2;base64,${curl(u).toString("base64")}`);
  }
  return css;
}

/* --- the art --------------------------------------------------------------
   A solution page's card wears that page's own hero illustration. The shapes
   and the palette both come from the real files, so this is the same picture
   the visitor lands on. */
const HERO_ART_CSS = read("src/components/hero-art/hero-art.css");
const TOKENS_CSS = read("src/design/tokens.css");

const heroArt = (slug) => `
<svg class="hero-illust" viewBox="-24 -14 768 488" role="img">
${read(`src/content/hero-art/${slug}.svg`)}
</svg>`;

/* The homepage has no hero SVG of its own — its hero is the animated system
   diagram. This is that diagram, frozen in the state it settles into: every
   solution wired into one hub. Lifted from hero-system.js, with the classes
   resolved to the colours they compute to, so it needs no stylesheet. */
const DIAGRAM = `
<svg class="sys" viewBox="0 0 820 470" role="img">
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
  <g>
    <rect x="96" y="52" width="188" height="118" rx="16" filter="url(#cardShadow)" fill="#fff"/>
    <circle cx="118" cy="74" r="4" fill="#C6D3D6"/><circle cx="132" cy="74" r="4" fill="#C6D3D6"/><circle cx="146" cy="74" r="4" fill="#C6D3D6"/>
    <rect x="116" y="94" width="86" height="10" rx="5" fill="#0E8C7E"/>
    <rect x="116" y="114" width="148" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="116" y="132" width="120" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="116" y="150" width="60" height="8" rx="4" fill="#7FC5E4"/>
  </g>
  <g>
    <rect x="592" y="36" width="86" height="150" rx="16" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="606" y="56" width="58" height="30" rx="8" fill="#0E8C7E"/>
    <rect x="606" y="96" width="58" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="606" y="112" width="44" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="606" y="140" width="58" height="22" rx="8" fill="#7FC5E4"/>
  </g>
  <g>
    <path d="M660 250 h84 a16 16 0 0 1 16 16 v34 a16 16 0 0 1 -16 16 h-56 l-22 20 v-20 h-6 a16 16 0 0 1 -16 -16 v-34 a16 16 0 0 1 16 -16 z" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="676" y="272" width="52" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="676" y="288" width="34" height="8" rx="4" fill="#0E8C7E"/>
  </g>
  <g>
    <rect x="352" y="384" width="160" height="60" rx="12" filter="url(#cardShadow)" fill="#fff"/>
    <rect x="368" y="398" width="128" height="12" rx="6" fill="#0E8C7E"/>
    <rect x="368" y="420" width="70" height="8" rx="4" fill="#D9E3E1"/>
    <rect x="452" y="420" width="44" height="8" rx="4" fill="#7FC5E4"/>
  </g>
  <g>
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

/* --- the cards ------------------------------------------------------------ */
const cards = [
  { out: home.og.image, title: home.og.title, art: DIAGRAM },
  ...solutions.map((s) => ({ out: s.og.image, title: s.og.title, art: heroArt(s.slug) })),
  { out: landingOffer.og.image, title: landingOffer.og.title, art: deviceMockSvg({ label: landingOffer.hero.mockAlt }).toString() },
];

const page = (card) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
${embeddedFontCss(cards.map((c) => c.title).join("") + "FLOA")}
${TOKENS_CSS}
${HERO_ART_CSS}
/* a card is a still: nothing may be caught mid-animation */
*, *::before, *::after { animation: none !important; transition: none !important; }

* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; }
body {
  display: flex; align-items: center; gap: 40px;
  padding: 72px 84px;
  background:
    radial-gradient(1100px 620px at 88% -10%, rgba(127,197,228,.20), transparent 60%),
    radial-gradient(900px 560px at 6% 118%, rgba(14,140,126,.12), transparent 60%),
    #E9F0EE;
  color: #0F2A33;
}
.copy { flex: 1 1 50%; min-width: 0; }
.logo {
  font-family: "Rubik", sans-serif; font-weight: 700; font-size: 42px;
  letter-spacing: .14em; color: #0E8C7E; margin-bottom: 34px;
}
/* ONE line, and it is allowed to be big. Nothing competes with it. */
h1 {
  font-family: "Rubik", sans-serif; font-weight: 700; font-size: 68px;
  line-height: 1.18; letter-spacing: -.01em; text-wrap: balance;
}
.rule { width: 96px; height: 6px; border-radius: 3px; background: #0E8C7E; margin-top: 38px; }
.art { flex: 1 1 50%; display: flex; align-items: center; justify-content: center; min-width: 0; }
.art svg { width: 100%; height: auto; filter: drop-shadow(0 24px 40px rgba(15,42,51,.10)); }
</style></head>
<body>
  <div class="copy">
    <div class="logo">FLOA</div>
    <h1>${card.title}</h1>
    <div class="rule"></div>
  </div>
  <div class="art">${card.art}</div>
</body></html>`;

const browser = await chromium.launch(process.env.PW_EXECUTABLE ? { executablePath: process.env.PW_EXECUTABLE } : {});
for (const card of cards) {
  const p = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,        // the OG spec size; keeps the file light for WhatsApp
  });
  await p.setContent(page(card), { waitUntil: "load" });
  await p.evaluate(() => document.fonts.ready);
  const buf = await p.screenshot({ type: "png" });
  writeFileSync(join(ROOT, card.out), buf);
  console.log(`  ${card.out}  ${(buf.length / 1024).toFixed(0)} KB  "${card.title}"`);
  await p.close();
}
await browser.close();
