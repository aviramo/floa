/* ==========================================================================
   Generate the share cards, ONE PER PAGE (assets/og-*-v2.jpg).

   A share card is seen at about 300px wide, for about half a second, usually in
   a WhatsApp thread. So each card says exactly ONE thing: FLOA's mark, one short
   line, and one picture of that page's subject. Nothing else. The line is
   `og.title` in the content, never the <title>, which is written for a search
   engine and is far too long to read at that size.

   The cards wear the same language as the site: water at first light, a wind of
   thin currents behind everything, pebbles (two big corners, two tight) instead
   of boxes, and a mark that is drawn (the F of the icon, then L with a wave for a
   foot, O with water in it, A with a wave for a bar). Each picture is drawn here,
   in the site's palette, so no card can drift back to an older look.

   No library: the page is written to a file and a real Chrome prints it
   (chrome --headless --screenshot), so Hebrew (RTL) comes out exactly as on the
   site. Rubik is fetched from Google, cut to just the glyphs used, and inlined as
   data: URIs, so the render never depends on network timing.

   The cards are JPEG, about 50 to 70 KB each. As PNG they were 400 KB, and WhatsApp
   skips a preview image that is much over 300 KB, so a heavy card is a card nobody
   sees. Chrome prints a PNG; Pillow (the same library scripts/gen_favicon.py uses)
   turns it into the JPEG, so this needs Python with `pip install pillow`.

   The file names carry a version (-v2). A social network keeps a card for as long
   as the same address is served, so a new look needs a new address.

   Run:  node scripts/gen_og.mjs        (after changing any og.title or a picture)
         CHROME=/path/to/chrome node scripts/gen_og.mjs   (if Chrome is somewhere else)
         PYTHON=/path/to/python  node scripts/gen_og.mjs   (if `python` is not the right one)
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "businesses/floa/public");
const load = (p) => import(pathToFileURL(join(ROOT, p)).href);

const { home } = await load("businesses/floa/content/home.js");
const { landingOffer } = await load("businesses/floa/content/landing-offer.js");
const { icon } = await load("src/components/icon/icon.js");

/* --- where Chrome is -------------------------------------------------------- */
const CHROME = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!CHROME) throw new Error("No Chrome found. Set CHROME=/path/to/chrome.");

/* --- Python with Pillow, for the PNG to JPEG step ---------------------------------- */
const PYTHON = [process.env.PYTHON, "python", "python3", "py"].filter(Boolean).find((c) => {
  try { execFileSync(c, ["-c", "import PIL"], { stdio: "ignore" }); return true; } catch { return false; }
});
if (!PYTHON) throw new Error("No Python with Pillow found. Run: pip install pillow (or set PYTHON=/path/to/python).");

/* --- the palette: the site's water (businesses/floa/theme.css) ---------------- */
const INK = "#0C2A45", TEAL = "#1B74B3", DARK = "#0F4F7F", TINT = "#CFE6F5", LIGHT = "#4FAEE8", LINE = "#D4E3EE";

/* --- fonts: Rubik 700, cut to exactly the glyphs the cards print ------------ */
function curl(url) {
  return execFileSync("curl", ["-s", "-A", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", url]);
}
function embeddedFontCss(chars) {
  const api = "https://fonts.googleapis.com/css2?family=Rubik:wght@700&text=" + encodeURIComponent([...new Set(chars)].join("")) + "&display=swap";
  let css = curl(api).toString();
  /* the font files are served from fonts.gstatic.com, some at addresses that do not end in .woff2 */
  for (const u of [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])]) {
    css = css.split(u).join(`data:font/woff2;base64,${curl(u).toString("base64")}`);
  }
  if (!css.includes("data:font")) throw new Error("Could not fetch Rubik from Google Fonts.");
  return css;
}

/* --- shapes ------------------------------------------------------------------ */
/* a pebble: two opposite corners generous, two tight */
const pebble = (x, y, w, h, big, small) =>
  `M${x + small} ${y}H${x + w - big}A${big} ${big} 0 0 1 ${x + w} ${y + big}V${y + h - small}A${small} ${small} 0 0 1 ${x + w - small} ${y + h}` +
  `H${x + big}A${big} ${big} 0 0 1 ${x} ${y + h - big}V${y + small}A${small} ${small} 0 0 1 ${x + small} ${y}Z`;

const waveD = (x0, y0, w, amp, cycles, phase = 0, n = 56) =>
  "M" + Array.from({ length: n + 1 }, (_, i) => {
    const k = i / n;
    return `${(x0 + w * k).toFixed(1)} ${(y0 - amp * Math.sin(2 * Math.PI * cycles * k + phase)).toFixed(1)}`;
  }).join(" L");

/* an icon from the site's own set, placed and sized inside an svg */
const glyph = (name, cx, cy, size, color) =>
  icon(name).toString().replace("<svg ", `<svg x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" color="${color}" `);

/* --- the logo: ONE special F (the icon's tile) and then LOA, drawn (the word's own F is not drawn, or it would read FFLOA) ---- */
const MARK = `
<svg class="mark" viewBox="0 0 234 64" role="img" aria-label="FLOA">
  <defs>
    <linearGradient id="mt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#56B4EE"/><stop offset="1" stop-color="#0E4A80"/></linearGradient>
    <linearGradient id="mw" gradientUnits="userSpaceOnUse" x1="82" y1="0" x2="234" y2="0"><stop offset="0" stop-color="#2E8FD6"/><stop offset="1" stop-color="#0E4A80"/></linearGradient>
  </defs>
  <rect width="64" height="64" rx="15.4" fill="url(#mt)"/>
  <g fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 34.5q4-4.5 8 0t8 0" opacity=".84"/><path d="M21 18.75q5.75-5.5 11.5 0t11.5 0"/><path d="M21 16V49"/>
  </g>
  <g transform="translate(20.5 0)" fill="none" stroke="url(#mw)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M62 8V56q7.5-9 15 0t15 0"/>
    <ellipse cx="130" cy="32" rx="22" ry="24"/><path d="M113 33q8.5-8 17 0t17 0" stroke-width="7"/>
    <path d="M166 56L186 10L206 56"/><path d="M173 41q6.5-8 13 0t13 0" stroke-width="7"/>
  </g>
</svg>`;

/* --- the pictures: one per card, each 600 x 440 -------------------------------- */
const defs = `<defs>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${LIGHT}" stop-opacity=".34"/><stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/></radialGradient>
  <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4FAEE8"/><stop offset="1" stop-color="#0F4F7F"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E4F1FA"/></linearGradient>
  <linearGradient id="riv" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0"><stop offset="0" stop-color="${TINT}" stop-opacity="0"/><stop offset=".1" stop-color="${TINT}" stop-opacity=".9"/><stop offset=".9" stop-color="${TINT}" stop-opacity=".9"/><stop offset="1" stop-color="${TINT}" stop-opacity="0"/></linearGradient>
  <linearGradient id="rivl" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="600" y2="0"><stop offset="0" stop-color="${TEAL}" stop-opacity="0"/><stop offset=".12" stop-color="${TEAL}"/><stop offset=".88" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL}" stop-opacity="0"/></linearGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${LIGHT}" stop-opacity="0"/><stop offset=".5" stop-color="${TEAL}"/><stop offset="1" stop-color="${LIGHT}" stop-opacity="0"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="16" stdDeviation="14" flood-color="${DARK}" flood-opacity=".28"/></filter>
</defs>`;
const rings = (cx, cy, rx) =>
  [1, 1.6, 2.3].map((k, i) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx * k}" ry="${rx * k * 0.3}" fill="none" stroke="${TEAL}" stroke-width="1.6" opacity="${[0.5, 0.3, 0.16][i]}"/>`).join("");

/* home: the five gates on one river, the first on the right (Hebrew reads right to left) */
const river = () => {
  const y = (x) => 226 + 46 * Math.sin(x / 84);
  const pts = Array.from({ length: 61 }, (_, i) => `${i * 10} ${y(i * 10).toFixed(1)}`).join(" L");
  const gates = [["target", 520], ["website", 410], ["app", 300], ["automation", 190], ["sparkle", 80]];
  return `<svg viewBox="0 0 600 440" role="img">${defs}
    <ellipse cx="300" cy="238" rx="300" ry="120" fill="url(#glow)"/>
    <path d="M${pts}" fill="none" stroke="url(#riv)" stroke-width="104" stroke-linecap="round"/>
    <path d="M${pts}" fill="none" stroke="url(#rivl)" stroke-width="3" opacity=".3"/>
    <path d="M${pts}" fill="none" stroke="url(#rivl)" stroke-width="6" stroke-linecap="round" stroke-dasharray="26 24"/>
    ${gates.map(([n, x], i) => {
      const cy = y(x), last = i === gates.length - 1;
      return `<circle cx="${x}" cy="${cy}" r="54" fill="none" stroke="${TEAL}" stroke-width="1.6" opacity=".3"/>
      <circle cx="${x}" cy="${cy}" r="42" fill="${last ? "url(#sea)" : "#fff"}" stroke="${last ? "#fff" : TINT}" stroke-width="7" filter="url(#soft)"/>
      ${glyph(n, x, cy, 36, last ? "#fff" : DARK)}`;
    }).join("")}
    <g opacity=".9"><circle cx="560" cy="96" r="18" fill="#fff" stroke="${TINT}" stroke-width="6"/><circle cx="560" cy="96" r="7" fill="${LIGHT}"/>
    <circle cx="40" cy="372" r="14" fill="#fff" stroke="${TINT}" stroke-width="5"/><circle cx="40" cy="372" r="5" fill="${LIGHT}"/></g>
  </svg>`;
};

/* the landing page offer: a page with a form, and a price tag on the corner */
const landing = () => `<svg viewBox="0 0 600 440" role="img">${defs}
  <ellipse cx="300" cy="240" rx="300" ry="130" fill="url(#glow)"/>
  <path d="${pebble(50, 40, 500, 330, 76, 24)}" fill="url(#glass)" filter="url(#soft)"/>
  <path d="M50 100H550V94H50Z" fill="#EAF4FB"/>
  <circle cx="518" cy="70" r="7" fill="${LINE}"/><circle cx="496" cy="70" r="7" fill="${LINE}"/><circle cx="474" cy="70" r="7" fill="${LINE}"/>
  <path d="${waveD(330, 148, 170, 6, 2)}" fill="none" stroke="${TEAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="${waveD(330, 178, 120, 5, 1.6, 1)}" fill="none" stroke="${LINE}" stroke-width="7" stroke-linecap="round"/>
  <path d="${pebble(90, 142, 190, 190, 46, 14)}" fill="#fff" stroke="${LINE}" stroke-width="3"/>
  <path d="${pebble(112, 168, 146, 36, 18, 8)}" fill="#EAF4FB"/><path d="${pebble(112, 218, 146, 36, 18, 8)}" fill="#EAF4FB"/>
  <path d="${pebble(112, 272, 146, 40, 20, 8)}" fill="url(#sea)"/>
  <path d="${pebble(330, 232, 76, 76, 28, 10)}" fill="#EAF4FB"/><path d="${pebble(420, 232, 76, 76, 28, 10)}" fill="#EAF4FB"/>
  <g transform="rotate(-6 150 372)"><path d="${pebble(60, 340, 190, 74, 34, 12)}" fill="url(#sea)" filter="url(#soft)"/>
  <path d="${waveD(88, 377, 134, 6, 2.5)}" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/></g>
</svg>`;

/* --- the cards --------------------------------------------------------------- */
const cards = [
  { out: home.og.image, title: home.og.title, art: river() },
  { out: landingOffer.og.image, title: landingOffer.og.title, art: landing() },
];

const WIND = [[70, 60, 3.4, 1], [150, 38, 2.6, -1], [250, 70, 4, 1], [340, 44, 3, -1], [450, 66, 3.6, 1], [560, 40, 2.8, -1]]
  .map(([y, a, w, d], i) => `<path d="${waveD(-40, y + i * 14, 1280, a, 2 + (i % 3), i * 1.3, 90)}" fill="none" stroke="${LIGHT}" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${180 + i * 30} ${300 + i * 20}" opacity=".30"/>`).join("");

const page = (card, fontCss) => `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<style>
${fontCss}
*, *::before, *::after { animation: none !important; transition: none !important; }
* { margin: 0; box-sizing: border-box; }
html, body { width: 1200px; height: 630px; overflow: hidden; }
body {
  position: relative; display: flex; align-items: center; gap: 24px;
  padding: 56px 72px 56px 28px;
  background:
    radial-gradient(60vmax 44vmax at 12% 10%, rgba(255,255,255,.95), rgba(255,255,255,0) 70%),
    radial-gradient(52vmax 40vmax at 96% 8%, rgba(96,178,232,.46), rgba(96,178,232,0) 70%),
    radial-gradient(54vmax 40vmax at 4% 100%, rgba(140,214,238,.46), rgba(140,214,238,0) 70%),
    linear-gradient(170deg, #F4FAFD, #D9E9F4);
  color: ${INK};
}
.wind { position: absolute; inset: 0; width: 1200px; height: 630px; }
.copy { position: relative; flex: 0 0 470px; min-width: 0; }
.mark { display: block; width: 250px; height: auto; margin-bottom: 40px; }
h1 { font-family: "Rubik", sans-serif; font-weight: 700; font-size: 66px; line-height: 1.16; letter-spacing: -.012em; text-wrap: balance; color: ${INK}; }
.line { width: 132px; height: 12px; margin-top: 34px; background: ${TEAL}; opacity: .8;
  -webkit-mask: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='132' height='12' viewBox='0 0 132 12'%3E%3Cpath d='M0 6 C22 1 44 11 66 6 S110 1 132 6' fill='none' stroke='black' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E") center / 132px 12px no-repeat; }
.art { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; }
.art svg { width: 100%; height: auto; max-height: 520px; }
</style></head>
<body>
  <svg class="wind" viewBox="0 0 1200 630" aria-hidden="true">${WIND}</svg>
  <div class="copy">${MARK}<h1>${card.title}</h1><div class="line"></div></div>
  <div class="art">${card.art}</div>
</body></html>`;

/* --- print them ---------------------------------------------------------------- */
const fontCss = embeddedFontCss(cards.map((c) => c.title).join("") + "FLOA");
const tmp = join(tmpdir(), "floa-og");
mkdirSync(tmp, { recursive: true });
for (const [i, card] of cards.entries()) {
  const file = join(tmp, `card-${i}.html`);
  const png = join(tmp, `card-${i}.png`);
  const jpg = join(PUBLIC, card.out);
  writeFileSync(file, page(card, fontCss));
  execFileSync(CHROME, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
    "--window-size=1200,630", "--virtual-time-budget=4000", `--screenshot=${png}`, pathToFileURL(file).href,
  ], { stdio: "ignore" });
  execFileSync(PYTHON, ["-c", "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'JPEG', quality=88, optimize=True, progressive=True)", png, jpg]);
  console.log(`  ${card.out}  ${(readFileSync(jpg).length / 1024).toFixed(0)} KB  "${card.title}"`);
}
