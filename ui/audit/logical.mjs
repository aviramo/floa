// LOGICAL DIRECTIONS lint (owner 2026-11-26, ui/SKILL.md "CSS לפני JS", "רק start ו-end"): no left or right in the kit's or an app's CSS,
// in CSS written from JS, or in a style attribute. Comments are ignored. Prints file:line  kind  snippet, and exits 1 on any hit
// that the ALLOW list below does not name.
// Run:  node ui/audit/logical.mjs [paths...] [--all] [--geom]
//   no paths: ui/css/*.css (the kit CSS, built into /kit.css), ui/*.js and apps/<key>/public/**/*.{css,js,html} of EVERY app that uses the kit (a page or script of it loads
//   /kit.css or one of ui/*.js); paths: files, or app folders (apps/<key> walks its public/). CSS an app writes from JS is checked too.
//   --all   also print the allowed hits (marked "allowed")
//   --geom  also print JS geometry reads (rect.left, r.right, offsetLeft): never a failure, a pointer for position math that must read the direction
import fs from "fs"; import path from "path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const args = process.argv.slice(2), ALL = args.includes("--all"), GEOM = args.includes("--geom");
const given = args.filter((a) => !a.startsWith("--"));

/* the explicit allowlist: each rule is a pattern (file regex + snippet regex) with its reason, never a free pass for a file */
const ALLOW = [
  { file: /ui\/css\/[\w-]+\.css$/, snip: /env\(safe-area-inset-(left|right)/, why: "the device's own safe areas are physical; read once into a token, used through the direction" },
  { file: /\.(css|html)$/, snip: /^(html\[dir="(ltr|rtl)"\]|[^{]*:dir\((ltr|rtl)\))[^{]*\{[^}]*\b(left|right)\b/, why: "one half of a pair that flips a physical value by the direction (html[dir] or :dir())" },
  { file: /\.(js|html)$/, snip: /\bscroll(To|By)\(\{\s*left:[^}]*\b(dir|rtl)\w*/i, why: "the scroll API has only left: its sign comes from the direction" },
  { file: /ui\/css\/[\w-]+\.css$/, snip: /\.rrange[^{]*\{[^}]*linear-gradient\(to right/, why: "the slider's track fill, inside its left-to-right island" },
  { file: /.*/, snip: /\[data-[\w-]+="?(left|right)"?\]/, why: "an attribute value that names a physical side computed from dir (data-side)" },
];

/* ---------- files ---------- */
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(css|js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
/* every app that uses the kit: one of its pages or scripts loads /kit.css or one of the kit's scripts (the names of ui/*.js) */
const KIT = fs.readdirSync(path.join(ROOT, "ui")).filter((n) => /\.js$/.test(n));   /* the kit's scripts; its CSS is ui/css/*.css, served as the one /kit.css */
const KIT_CSS = fs.readdirSync(path.join(ROOT, "ui", "css")).filter((n) => /\.css$/.test(n)).map((n) => path.join(ROOT, "ui", "css", n));
const kitRef = new RegExp("(src|href)\\s*=\\s*[\"']/(" + ["kit.css", ...KIT].map((n) => n.replace(/\./g, "\\.")).join("|") + ")[?\"']");   // the kit is served from the domain's root; an app's own ../assets/sheet.js is not the kit
function kitApps() {
  const out = [];
  for (const a of fs.readdirSync(path.join(ROOT, "apps"), { withFileTypes: true })) {
    const pub = path.join(ROOT, "apps", a.name, "public");
    if (!a.isDirectory() || !fs.existsSync(pub)) continue;
    const fs_ = walk(pub, []);
    if (fs_.some((f) => f.endsWith(".html") && kitRef.test(fs.readFileSync(f, "utf8")))) out.push(...fs_);
  }
  return out;
}
/* paths given: a file is scanned as is, a folder (an app, apps/<key>, or its public/) is walked */
const expand = (g) => { const p = path.resolve(g); if (!fs.statSync(p).isDirectory()) return [p]; const pub = path.join(p, "public"); return walk(fs.existsSync(pub) ? pub : p, []); };
let files = given.length ? given.flatMap(expand) : [...KIT_CSS, ...KIT.map((n) => path.join(ROOT, "ui", n)), ...kitApps()];

/* ---------- comment stripping (newlines kept, so line numbers hold) ---------- */
const blank = (s) => s.replace(/[^\n]/g, " ");
function stripCss(s) { return s.replace(/\/\*[\s\S]*?\*\//g, blank); }
function stripJs(s) {   // a small scanner: strings and template literals kept, // and /* */ blanked; a regex literal is treated as code
  let o = "", i = 0, q = null;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) { o += c; if (c === "\\") { o += n ?? ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; o += c; i++; continue; }
    if (c === "/" && n === "*") { const e = s.indexOf("*/", i + 2); const end = e < 0 ? s.length : e + 2; o += blank(s.slice(i, end)); i = end; continue; }
    if (c === "/" && n === "/") { const e = s.indexOf("\n", i); const end = e < 0 ? s.length : e; o += blank(s.slice(i, end)); i = end; continue; }
    o += c; i++;
  }
  return o;
}
/* an HTML file: comments blanked, then only <style>, <script> and style="" are kept (as CSS or JS), everything else blanked */
function splitHtml(s) {
  s = s.replace(/<!--[\s\S]*?-->/g, blank);
  let css = blank(s), js = blank(s);
  const put = (dst, start, text) => dst.slice(0, start) + text + dst.slice(start + text.length);
  for (const m of s.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) css = put(css, m.index + m[0].indexOf(m[1]), stripCss(m[1]));
  for (const m of s.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) js = put(js, m.index + m[0].indexOf(m[1]), stripJs(m[1]));
  for (const m of s.matchAll(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/gi)) css = put(css, m.index + m[0].indexOf(m[2]), m[2]);
  return { css, js };
}

/* ---------- rules ---------- */
const CSS_RULES = [
  ["corner", /\bborder-(top|bottom)-(left|right)-radius\b/g],
  ["prop", /(?<![\w-])(left|right)\s*:/g],
  ["prop", /\b[a-z-]+-(left|right)\b(?!-radius)/g],
  ["value", /\b(text-align|float|clear|caption-side)\s*:\s*(left|right)\b/g],
  ["value", /(?<![\w-])(left|right)(?![\w-]|\s*:)/g],   // a bare word in a value: to right, transform-origin: left, background-position: right
];
const JS_RULES = [
  ["style.js", /\.style\.(left|right|(margin|padding|border|scrollMargin|scrollPadding)(Left|Right)\w*|border(Top|Bottom)(Left|Right)Radius)\b/g],
  ["style.js", /\b(setProperty|removeProperty|getPropertyValue)\(\s*["'`](left|right|[a-z-]*-(left|right)[a-z-]*)["'`]/g],
  ["cs.js", /\.(margin|padding|border)(Left|Right)\w*\b/g],
  ["string", /["'`][^"'`\n]*?(?<![\w-])((left|right)\s*:|[a-z-]+-(left|right)\b|text-align\s*:\s*(left|right)|\bto (left|right)\b)[^"'`\n]*["'`]/g],
  ["object", /[{,]\s*(left|right)\s*:/g],
];
const GEOM_RULES = [["geom", /\b(\w+)\.(left|right|offsetLeft|scrollLeft|clientLeft)\b(?!\s*=)/g]];

/* ---------- scan ---------- */
const hits = [];
function scan(file, text, rules, raw) {
  const lines = text.split("\n"), rawLines = raw.split("\n");
  lines.forEach((ln, i) => {
    const seen = new Set();
    for (const [kind, re] of rules) {
      re.lastIndex = 0;
      for (const m of ln.matchAll(re)) {
        const key = m.index; if ([...seen].some((s) => Math.abs(s - key) < 2 + m[0].length && s >= key)) continue;
        if (kind === "geom" && /^(style|cs)$/.test(m[1])) continue;
        seen.add(key);
        const lineRaw = rawLines[i], at = Math.max(0, m.index - 50);
        const snip = (at ? "…" : "") + lineRaw.slice(at, m.index + m[0].length + 50).trim() + (m.index + m[0].length + 50 < lineRaw.length ? "…" : "");
        // the rule text the match lives in (for the allowlist): from the last } or ; before the hit to the next }
        const ruleText = ln.slice(Math.max(ln.lastIndexOf("}", m.index) + 1, 0)).trim();
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        const allow = ALLOW.find((a) => a.file.test(rel) && (a.snip.test(ruleText) || a.snip.test(lineRaw.slice(m.index - 40, m.index + m[0].length + 40))));
        hits.push({ file: rel, line: i + 1, kind, match: m[0].trim(), snip, allow: allow?.why, geom: kind === "geom" });
        break;   // one hit per rule per line is enough to point at it; the next rule may still hit
      }
    }
  });
}
for (const f of files) {
  const raw = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  if (f.endsWith(".css")) scan(f, stripCss(raw), CSS_RULES, raw);
  else if (f.endsWith(".js") || f.endsWith(".mjs")) { const c = stripJs(raw); scan(f, c, JS_RULES, raw); if (GEOM) scan(f, c, GEOM_RULES, raw); }
  else if (f.endsWith(".html")) { const { css, js } = splitHtml(raw); scan(f, css, CSS_RULES, raw); scan(f, js, JS_RULES, raw); if (GEOM) scan(f, js, GEOM_RULES, raw); }
}

/* one line, one report: several rules on the same line collapse into one entry with all kinds */
const byLine = new Map();
for (const h of hits) {
  const k = h.file + ":" + h.line, cur = byLine.get(k);
  if (!cur) byLine.set(k, { ...h, kinds: [h.kind], matches: [h.match] });
  else { if (!cur.kinds.includes(h.kind)) cur.kinds.push(h.kind); if (!cur.matches.includes(h.match)) cur.matches.push(h.match); cur.allow = cur.allow && h.allow; cur.geom = cur.geom && h.geom; }
}
let bad = 0, allowed = 0, geom = 0;
for (const h of byLine.values()) {
  if (h.geom) { geom++; console.log(`${h.file}:${h.line}  geom  [${h.matches.join(" | ")}]  ${h.snip}`); continue; }
  if (h.allow) { allowed++; if (ALL) console.log(`${h.file}:${h.line}  allowed (${h.allow})  ${h.snip}`); continue; }
  bad++; console.log(`${h.file}:${h.line}  ${h.kinds.join(",")}  [${h.matches.join(" | ")}]  ${h.snip}`);
}
console.log(`\n${bad} physical direction(s), ${allowed} allowed${GEOM ? `, ${geom} geometry read(s)` : ""} in ${files.length} files`);
process.exit(bad ? 1 : 0);
