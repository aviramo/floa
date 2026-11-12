/* ROSTER POLICY LINT (BLOCKING since phase 6: exits 1 on any violation beyond the allow-list, so `npm test` and CI fail).
   Reports where the roster pages break the design rules (catalog: sync13/component-catalog.md, tokens: businesses/roster/public/assets/ui.css):
     spacing   raw px/rem/em numbers in margin, padding, gap, inset and offsets (only tokens and 0 are allowed), in CSS files and inline style="" text
     color     hex / rgb() / hsl() literals outside the token file (CSS files and inline style="")
     field     <input>, <select>, <textarea> not inside <label class="rfield"> (hidden, file, checkbox, radio and data-rf-bare are exempt)
     dialog    <dialog> markup without the popup shell's direction (data-from) or title (data-title)
     native    alert( confirm( prompt( calls
     inline    style="" and on*="" attributes in markup (CSP forbids the handlers)
   Scope: businesses/roster/public except me/ (out of scope), api/ (docs page) and ui.css itself. public/admin/* is roster's own source since phase 4b (the harpatka sync was stopped), like every other page.
   scripts/policy-allow.json is the legacy allow-list: the violations that exist today per file and rule. "beyond allow-list" is what is NEW since it was written, and it fails the run. An allow-list entry without a reason in `reasons` fails it too, so nothing is excused silently.
   Usage:  node scripts/roster-policy.mjs --summary        counts per rule and per file (what npm test prints)
           node scripts/roster-policy.mjs --lines          every violation with file:line and the text
           node scripts/roster-policy.mjs --write-allow    rewrite policy-allow.json from the current state (a deliberate act, review the diff)
           node scripts/roster-policy.mjs --json           machine readable */
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const PUB = join(ROOT, "businesses", "roster", "public");
const ALLOW_FILE = join(ROOT, "scripts", "policy-allow.json");
const args = new Set(process.argv.slice(2));

const rel = (p) => relative(ROOT, p).split(sep).join("/");
const EXCLUDE_DIRS = new Set(["me", "api"]);
const EXCLUDE_FILES = new Set(["businesses/roster/public/connect/mail-defaults.js"]);   // the default HTML of the participant mails: email markup needs inline styles, it is not a page
const TOKEN_FILE = "businesses/roster/public/assets/ui.css";
const BUILT_ADMIN = new Set();   // since phase 4b public/admin is roster's own source (the harpatka sync was stopped), so nothing there is "built output" any more

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (dir === PUB && EXCLUDE_DIRS.has(n)) continue; walk(p, out); continue; }
    if (/\.(css|js|html)$/.test(n)) out.push(p);
  }
  return out;
}

/* strip comments but keep line numbers */
const blank = (m) => m.replace(/[^\n]/g, " ");
const stripCss = (t) => t.replace(/\/\*[\s\S]*?\*\//g, blank);
const stripJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));
const stripHtml = (t) => t.replace(/<!--[\s\S]*?-->/g, blank);

const SPACING_PROPS = /^(margin|padding|gap|row-gap|column-gap|inset|top|right|bottom|left|margin-(top|right|bottom|left|block|inline)(-start|-end)?|padding-(top|right|bottom|left|block|inline)(-start|-end)?|inset-(block|inline)(-start|-end)?|scroll-margin(-\w+)?|scroll-padding(-\w+)?)$/;
const RAW_LEN = /(^|[^\w.#-])(-?\d*\.?\d+)(px|rem|em|vw|vh|dvh|svh|lvh|vmin|vmax)\b/g;
function rawSpacing(value) {
  const v = value.replace(/var\([^)]*\)/g, " ").replace(/env\([^)]*\)/g, " ");
  const hits = []; let m;
  RAW_LEN.lastIndex = 0;
  while ((m = RAW_LEN.exec(v))) { if (parseFloat(m[2]) !== 0) hits.push(m[2] + m[3]); }
  return hits;
}
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/g;

function declsOf(text, baseLine) {
  /* yields {prop, value, line} for every "prop: value" inside a block or an inline style text */
  const out = [];
  const re = /([a-zA-Z-]+)\s*:\s*([^;{}]+)(?=;|}|$)/g; let m;
  while ((m = re.exec(text))) {
    const line = baseLine + (text.slice(0, m.index).match(/\n/g) || []).length;
    out.push({ prop: m[1].toLowerCase(), value: m[2], line });
  }
  return out;
}

function lineOf(text, idx) { return 1 + (text.slice(0, idx).match(/\n/g) || []).length; }

const violations = [];   // {rule, file, line, text, built}
function add(rule, file, line, text, built) { violations.push({ rule, file, line, text: String(text).trim().slice(0, 160), built }); }

function scanCss(file, raw, built) {
  const t = stripCss(raw), isToken = file === TOKEN_FILE;
  const lines = t.split("\n");
  /* custom property definitions (--x: value) are token definitions, not uses */
  for (const d of declsOf(t, 1)) {
    if (d.prop.startsWith("--")) continue;
    if (SPACING_PROPS.test(d.prop) && !isToken) { const h = rawSpacing(d.value); if (h.length) add("spacing", file, d.line, d.prop + ": " + d.value + "  [" + h.join(" ") + "]", built); }
    if (!isToken && COLOR.test(d.value)) add("color", file, d.line, d.prop + ": " + d.value, built);
    COLOR.lastIndex = 0;
  }
  void lines;
}

function scanInlineStyles(file, raw, built) {
  const re = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let m;
  while ((m = re.exec(raw))) {
    const text = m[1] != null ? m[1] : m[2], line = lineOf(raw, m.index);
    add("inline", file, line, m[0], built);
    for (const d of declsOf(text, line)) {
      if (SPACING_PROPS.test(d.prop)) { const h = rawSpacing(d.value); if (h.length) add("spacing", file, line, d.prop + ": " + d.value + "  [inline " + h.join(" ") + "]", built); }
      COLOR.lastIndex = 0;
      if (COLOR.test(d.value)) add("color", file, line, d.prop + ": " + d.value + "  [inline]", built);
      COLOR.lastIndex = 0;
    }
  }
}

function scanMarkup(file, raw, built) {
  /* works on HTML files and on JS template strings alike */
  const CTRL = /<(input|select|textarea)\b([^>]*)>/gi; let m;
  while ((m = CTRL.exec(raw))) {
    const attrs = m[2], type = (/\btype\s*=\s*["']?(\w+)/i.exec(attrs) || [])[1] || "text";
    if (/^(hidden|file|checkbox|radio|button|submit|range)$/i.test(type) || /data-rf-bare/.test(attrs)) continue;
    const before = raw.slice(Math.max(0, m.index - 700), m.index);
    const open = before.lastIndexOf("<label"), close = before.lastIndexOf("</label>");
    const inside = open > close && /rfield/.test(before.slice(open));
    const inDiv = /<div\b[^>]*\brfield\b[^>]*>\s*<span>[^<]*<\/span>\s*$/.test(before);   // the same element written as <div class="rfield"> (the label span directly before the control)
    if (!inside && !inDiv) add("field", file, lineOf(raw, m.index), m[0], built);
  }
  const DLG = /<dialog\b([^>]*)>/gi;
  while ((m = DLG.exec(raw))) {
    const a = m[1];
    if (!/data-from\s*=/.test(a) || !/data-title\s*=|aria-labelledby\s*=/.test(a)) add("dialog", file, lineOf(raw, m.index), m[0], built);
  }
  const ON = /\son(?:click|change|input|submit|load|error|keydown|keyup|focus|blur|mouse\w+|touch\w+)\s*=\s*["']/gi;
  while ((m = ON.exec(raw))) add("inline", file, lineOf(raw, m.index), m[0].trim(), built);
}

function scanNative(file, raw, built) {
  const re = /(^|[^.\w$])(alert|confirm|prompt)\s*\(/g; let m;
  while ((m = re.exec(raw))) add("native", file, lineOf(raw, m.index), m[2] + "(", built);
}

for (const p of walk(PUB)) {
  const file = rel(p), name = p.split(sep).pop();
  if (EXCLUDE_FILES.has(file)) continue;
  const inAdmin = p.startsWith(join(PUB, "admin") + sep);
  const built = inAdmin && BUILT_ADMIN.has(name);
  const raw = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  if (name.endsWith(".css")) { scanCss(file, raw, built); }
  else if (name.endsWith(".js")) { const t = stripJs(raw); scanInlineStyles(file, t, built); scanMarkup(file, t, built); scanNative(file, t, built); }
  else { const t = stripHtml(raw); scanInlineStyles(file, t, built); scanMarkup(file, t, built); scanNative(file, t, built); }
}

/* ---------- allow-list ---------- */
const RULES = ["spacing", "color", "field", "dialog", "native", "inline"];
const count = (list) => { const o = {}; for (const v of list) { o[v.rule] ??= {}; o[v.rule][v.file] = (o[v.rule][v.file] || 0) + 1; } return o; };
const owned = violations.filter((v) => !v.built), built = violations.filter((v) => v.built);

if (args.has("--write-allow")) {
  const old = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, "utf8")) : {};
  const doc = { "//": "Allow-list written by scripts/roster-policy.mjs --write-allow: violations that exist today, per rule and file. The lint reports only what goes BEYOND these counts as new. Every entry needs a reason (see reasons, kept by --write-allow).", counts: count(owned), reasons: old.reasons || {} };
  writeFileSync(ALLOW_FILE, JSON.stringify(doc, null, 2) + "\n");
  console.log("wrote scripts/policy-allow.json (" + owned.length + " allowed violations)");
}
const allow = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, "utf8")).counts || {} : {};
const beyond = [];
{ const seen = {};
  for (const v of owned) { const k = v.rule + "|" + v.file; seen[k] = (seen[k] || 0) + 1; if (seen[k] > ((allow[v.rule] || {})[v.file] || 0)) beyond.push(v); } }

if (args.has("--json")) { console.log(JSON.stringify({ owned: count(owned), built: count(built), beyond: beyond.length }, null, 1)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log("ROSTER POLICY LINT (blocking)");
console.log("rule      violations");
for (const r of RULES) console.log(pad(r, 9) + " " + owned.filter((v) => v.rule === r).length);
console.log("new beyond the allow-list: " + beyond.length + (existsSync(ALLOW_FILE) ? "" : "  (no allow-list yet: run --write-allow)"));
const cs = count(owned);
console.log("\nper file (roster-owned):");
const files = [...new Set(owned.map((v) => v.file))].sort();
for (const f of files) console.log("  " + pad(f.replace("businesses/roster/public/", ""), 28) + RULES.map((r) => ((cs[r] || {})[f] ? r + " " + cs[r][f] : "")).filter(Boolean).join("  "));
if (args.has("--lines")) {
  console.log("\nEXACT LINES (roster-owned, then built admin):");
  for (const [title, list] of [["owned", owned], ["built admin", built]]) {
    console.log("== " + title);
    for (const v of list) console.log(v.rule + "  " + v.file.replace("businesses/roster/public/", "") + ":" + v.line + "  " + v.text);
  }
}
if (!args.has("--summary") && !args.has("--lines")) console.log("\n(add --lines for every violation, --write-allow to rewrite the allow-list)");
/* the gate: a violation beyond the allow-list, or an allowance nobody explained, stops the run */
const reasons = existsSync(ALLOW_FILE) ? JSON.parse(readFileSync(ALLOW_FILE, "utf8")).reasons || {} : {};
const unexplained = [];
for (const [rule, byFile] of Object.entries(allow)) for (const f of Object.keys(byFile)) if (!reasons[rule + "|" + f]) unexplained.push(rule + "|" + f);
if (beyond.length || unexplained.length) {
  for (const v of beyond) console.log("VIOLATION  " + v.rule + "  " + v.file.replace("businesses/roster/public/", "") + ":" + v.line + "  " + v.text);
  for (const u of unexplained) console.log("NO REASON in policy-allow.json for " + u);
  console.log(String.fromCharCode(10) + "roster policy lint FAILED (" + beyond.length + " new violation(s), " + unexplained.length + " unexplained allowance(s)). Fix the code, or for a real exception add it with --write-allow and a reason.");
  process.exit(1);
}
