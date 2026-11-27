// SKILL AND CODE AGREE (owner 2026-11-26): the skill (ui/SKILL.md, the main file, and ui/docs/*.md, a file per component) says what the kit is;
// this checks the kit and the apps that use it say the same.
// Run:  node ui/audit/skill.mjs [--quiet]
//   prints findings grouped as error / warning / info, and exits 1 on errors only (warnings and info never fail).
//   --quiet  leave out the info group (the pending marks)
// Checks:
//   1 tokens      every --token defined in ui/css/*.css is in the token dictionary (the first cell of a table row in ui/docs/tokens.md),
//                 and every dictionary token is defined in ui/css. Private component variables (PRIVATE, PRIVATE_EXACT below) are not tokens.
//                 Every var(--x) in ui/css, ui/*.js and the kit apps (found as ui/audit/logical.mjs finds them) is defined somewhere in the kit or that app.
//   2 components  every type in the law "הכול מהחבילה" list (ui/SKILL.md) has a section: the title of a file in ui/docs/ (# or ##) or a ### in ui/SKILL.md;
//                 every kit global (window.RosterX in ui/*.js) is named in the skill; every class family in ui/css (.rcard, .rlist ...) is named
//                 in the skill, except INTERNAL below (LEGACY below is a warning).
//   3 apis        every RosterX.method the skill names in code font exists in the JS; an exported method the skill never names is a warning.
//   4 files       every ui/…, apps/…, scripts/… path the skill names exists.
//                 (3 and 4: a name the skill declares not built yet, on a line with "עדיין לא קיים", "עוד לא מחובר" or "עוד לא ממומש", or in a doc
//                 whose head says so, is info, not an error.)
//   5 pending     every "ממתין" (as pending, not as a busy state) / "עדיין לא קיים" in the skill, with its file, line and section (info).
import fs from "fs"; import path from "path";

const T0 = Date.now();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1")), "../..");
const QUIET = process.argv.includes("--quiet");
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, "/");
const read = (f) => fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");

/* ---------- declared lists ---------- */
/* private component variables: a component's own knobs, set by the kit for itself, not tokens of the dictionary */
const PRIVATE = ["--rsort-", "--rplace-", "--rl-", "--rcard-", "--rf-", "--rp-", "--rplayer-", "--rr-", "--rs-", "--rt-"];
/* internal class families: helpers and probes of the kit's own scripts, not a component a page writes */
const INTERNAL = new Set([
  "rlist-probe", "rfmt-probe",                            // measuring probes of list.js and the format bubble
  "rs-closing", "rs-dragging", "rs-settle", "rs-kbd",     // states sheet.js puts on a window while it moves
  "rpeer-layer", "rpeer-mirror", "rpeer-sel",             // the drawing layer of other people's carets (live.js)
  "rs-grab", "rs-text", "rs-x", "rpanel-scrim",           // parts sheet.js writes inside a window (the grab bar, a short window's text, the hidden X) and behind a side panel
]);
/* legacy class families: rules in ui/css that no kit script writes and the skill does not define (a warning, for the code side to remove or define) */
const LEGACY = new Set(["rf-box", "rhint", "rptr", "rs-scroll", "rswipe-fg"]);
/* private knobs of one component that are not dictionary tokens */
const PRIVATE_EXACT = new Set([
  "--c",                                                   // the slider's fill colour (23-slider.css)
  "--print-w", "--print-h",                                // the print shell's page size, set by data-page (42-print.css)
  "--load-icon", "--load-icon-still", "--load-tone",       // the loading state's drawing and its tone, set by data-load and .raccent-2 (30-loading.css)
  "--load-curve", "--load-curve-still", "--load-music", "--load-music-still", "--load-exercise", "--load-exercise-still",   // the drawings data-load picks from
]);

/* ---------- comment stripping (newlines kept) ---------- */
const blank = (s) => s.replace(/[^\n]/g, " ");
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, blank);
function stripJs(s) {
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
const stripHtml = (s) => s.replace(/<!--[\s\S]*?-->/g, blank);
const strip = (f, s) => f.endsWith(".css") ? stripCss(s) : f.endsWith(".html") ? stripHtml(s) : stripJs(s);

/* ---------- files (the kit, and every app that uses it, as logical.mjs finds them) ---------- */
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(css|js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}
const KIT_JS = fs.readdirSync(path.join(ROOT, "ui")).filter((n) => /\.js$/.test(n)).map((n) => path.join(ROOT, "ui", n));
const KIT_CSS = fs.readdirSync(path.join(ROOT, "ui", "css")).filter((n) => /\.css$/.test(n)).sort().map((n) => path.join(ROOT, "ui", "css", n));
const kitRef = new RegExp("(src|href)\\s*=\\s*[\"']/(" + ["kit.css", ...KIT_JS.map((f) => path.basename(f))].map((n) => n.replace(/\./g, "\\.")).join("|") + ")[?\"']");
const APPS = [];   // { key, files }
for (const a of fs.readdirSync(path.join(ROOT, "apps"), { withFileTypes: true })) {
  const pub = path.join(ROOT, "apps", a.name, "public");
  if (!a.isDirectory() || !fs.existsSync(pub)) continue;
  const files = walk(pub, []);
  if (files.some((f) => f.endsWith(".html") && kitRef.test(read(f)))) APPS.push({ key: a.name, files });
}
const SRC = new Map();   // file -> stripped text
const src = (f) => { if (!SRC.has(f)) SRC.set(f, strip(f, read(f))); return SRC.get(f); };

/* ---------- the skill: the main file ui/SKILL.md and a file per component in ui/docs/ ---------- */
const SKILL_F = path.join(ROOT, "ui", "SKILL.md"), DOCS_D = path.join(ROOT, "ui", "docs");
const DOCS = [SKILL_F, ...(fs.existsSync(DOCS_D) ? fs.readdirSync(DOCS_D).filter((n) => n.endsWith(".md")).sort().map((n) => path.join(DOCS_D, n)) : [])];
const ALL = [];   // every line of every skill file: { f (relative), n (1-based), l, sec (nearest heading) }
for (const f of DOCS) { let h = ""; read(f).split("\n").forEach((l, i) => { const m = l.match(/^#{1,6}\s+(.*)$/); if (m) h = m[1].trim(); ALL.push({ f: rel(f), n: i + 1, l, sec: h }); }); }
const SKILL = ALL.map((x) => x.l).join("\n");
const at = (x) => `${x.f}:${x.n}`;
const codeSpans = ALL.flatMap((x) => [...x.l.matchAll(/`([^`\n]+)`/g)].map((m) => ({ text: m[1], x })));
/* a line that says a thing is not built yet ("עדיין לא קיים", "עוד לא מחובר", "עוד לא ממומש"): every RosterX.m, RosterX global and ui/… path it names is
   declared pending, everywhere in the skill, and a miss of it is info, not an error */
const NOT_YET = /עדיין לא קיים|עוד לא מחובר|עוד לא ממומש|עדיין לא ממומש/;
const pendingNames = new Set();
for (const x of ALL) if (NOT_YET.test(x.l)) for (const m of x.l.matchAll(/`([^`\n]+)`/g)) {
  for (const a of m[1].matchAll(/\b(Roster[A-Z]\w*)(?:\.([A-Za-z_$][\w$]*))?/g)) pendingNames.add(a[2] ? a[1] + "." + a[2] : a[1]);
  for (const p of m[1].matchAll(/(?:ui|apps|scripts)\/[\w.\/-]+/g)) pendingNames.add(p[0]);
}
/* an app-state doc whose head says it is not built yet (ui/docs/app-*.md: "עוד לא ממומש") is pending as a whole */
const pendingDocs = new Set(DOCS.map(rel).filter((f) => ALL.filter((x) => x.f === f && x.n <= 5).some((x) => NOT_YET.test(x.l))));

/* ---------- findings ---------- */
const F = { error: [], warning: [], info: [] };
const add = (level, check, msg) => F[level].push({ check, msg });

/* ========== 1. tokens ========== */
const defsIn = (text) => {   // --x: declarations, and setProperty("--x") from JS
  const out = new Set();
  for (const m of text.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) out.add(m[1]);
  for (const m of text.matchAll(/setProperty\(\s*["'`](--[\w-]+)/g)) out.add(m[1]);
  return out;
};
const cssDefs = new Map();   // token -> first file
for (const f of KIT_CSS) for (const m of src(f).matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) if (!cssDefs.has(m[1])) cssDefs.set(m[1], rel(f));
const kitDefs = new Set(cssDefs.keys());
for (const f of KIT_JS) for (const t of defsIn(src(f))) kitDefs.add(t);

/* the dictionary: the whole of ui/docs/tokens.md */
const DICT = ALL.filter((x) => x.f === "ui/docs/tokens.md");
const dict = new Map(), dictProse = new Set();   // token -> "file:line"
if (!DICT.length) add("error", "tokens", `ui/docs/tokens.md (the token dictionary) is missing`);
for (const x of DICT) {
  const row = x.l.match(/^\|\s*([^|]*)\|/);
  if (row && !/^[-\s]*$/.test(row[1])) for (const m of row[1].matchAll(/`(--[\w-]+)`/g)) { if (!dict.has(m[1])) dict.set(m[1], at(x)); }
  else for (const m of x.l.matchAll(/`(--[\w-]+)`/g)) dictProse.add(m[1]);
}
const isPrivate = (t) => PRIVATE_EXACT.has(t) || PRIVATE.some((p) => t.startsWith(p));
for (const [t, file] of [...cssDefs].sort()) {
  if (dict.has(t) || isPrivate(t)) continue;
  if (dictProse.has(t)) add("warning", "tokens", `${t} (defined in ${file}) is named in the dictionary only in prose, not in a table row`);
  else add("error", "tokens", `${t} is defined in ${file} but not in the skill's token dictionary`);
}
for (const [t, line] of dict) if (!cssDefs.has(t)) add("error", "tokens", `${t} is in the dictionary (${line}) but not defined in ui/css`);

/* every var(--x) is defined: in the kit, or (for an app's file) in the app itself */
const appDefs = new Map(APPS.map((a) => { const s = new Set(); for (const f of a.files) for (const t of defsIn(src(f))) s.add(t); return [a.key, s]; }));
const undef = new Map();   // "file|token" -> { file, line, token, fallback, count }
const scanVars = (f, extra) => {
  const text = src(f);
  for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
    const t = m[1]; if (kitDefs.has(t) || (extra && extra.has(t))) continue;
    const k = rel(f) + "|" + t, cur = undef.get(k);
    if (cur) { cur.count++; cur.fallback = cur.fallback && !!m[2]; continue; }
    undef.set(k, { file: rel(f), line: text.slice(0, m.index).split("\n").length, token: t, fallback: !!m[2], count: 1 });
  }
};
for (const f of [...KIT_CSS, ...KIT_JS]) scanVars(f, null);
for (const a of APPS) for (const f of a.files) scanVars(f, appDefs.get(a.key));
for (const u of undef.values()) {
  const where = `${u.file}:${u.line}${u.count > 1 ? ` (+${u.count - 1} more)` : ""}`;
  if (u.fallback) add("warning", "tokens", `var(${u.token}) at ${where} is defined nowhere (it has a fallback)`);
  else add("error", "tokens", `var(${u.token}) at ${where} is defined nowhere`);
}

/* ========== 2. components ========== */
/* the type list of the law "הכול מהחבילה": the bullet "לא מוסיפים סוגי UI" */
const lawLine = ALL.find((x) => x.f === "ui/SKILL.md" && /לא מוסיפים סוגי UI/.test(x.l))?.l;
/* a type's section: the title (# or ##) of a file in ui/docs/, or a ### in the main file */
const heads3 = ALL.filter((x) => (x.f === "ui/SKILL.md" ? /^###\s/ : /^#{1,2}\s/).test(x.l)).map((x) => ({ text: x.l.replace(/^#+\s+/, "").trim(), line: at(x) }));
const toks = (s) => s.replace(/[(),:"]/g, " ").split(/\s+/).filter(Boolean).map((w, i) => (i && /^ו\S{2,}/.test(w) ? w.slice(1) : w));
const hasSub = (hay, needle) => hay.some((_, i) => needle.every((w, j) => hay[i + j] === w));
if (!lawLine) add("error", "components", `ui/SKILL.md: the law "הכול מהחבילה" has no "לא מוסיפים סוגי UI" bullet`);
else {
  const m = lawLine.match(/סוגי אובייקטים["”]?\s*:\s*([^]*?)\.\s*אסור/);
  if (!m) add("error", "components", `ui/SKILL.md: cannot read the type list in "לא מוסיפים סוגי UI"`);
  else {
    const names = m[1].replace(/\([^)]*\)/g, "").split(/,/).map((s) => s.trim()).filter(Boolean);
    for (const n of names) {
      const nt = toks(n);
      const exact = heads3.find((h) => h.text === n || h.text.replace(/\s*\(.*$/, "").trim() === n);
      const loose = exact || heads3.find((h) => hasSub(toks(h.text), nt));
      if (!loose) add("error", "components", `type "${n}" (law "הכול מהחבילה") has no "### ${n}" section`);
      else if (!exact) add("info", "components", `type "${n}" is covered by "${loose.text}" (${loose.line}), not a section of its own`);
    }
  }
}

/* kit globals and their exported members */
function block(text, at) {   // the end of the {...} that opens at `at`, skipping strings
  let d = 0, q = null;
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{" || c === "(" || c === "[") d++;
    else if (c === "}" || c === ")" || c === "]") { d--; if (!d) return i; }
  }
  return text.length - 1;
}
function keysOf(text, at) {   // the top level keys of the object literal at `at`
  const end = block(text, at), keys = new Set();
  let d = 0, q = null, start = true;
  for (let i = at; i <= end; i++) {
    const c = text[i];
    if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
    if (d === 1 && start) {
      const m = text.slice(i, i + 80).match(/^\s*(?:(?:get|set|async)\s+)?([A-Za-z_$][\w$]*)\s*[:(]/);
      if (m) keys.add(m[1]);
      start = false;
    }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "{" || c === "(" || c === "[") { d++; if (d === 1) start = true; }
    else if (c === "}" || c === ")" || c === "]") d--;
    else if (c === "," && d === 1) start = true;
  }
  return keys;
}
const GLOBALS = new Map();   // RosterX -> { file, members:Set }
for (const f of KIT_JS) {
  const text = src(f);
  for (const m of text.matchAll(/window\.(Roster\w+)\s*=\s*/g)) {
    const name = m[1], at = m.index + m[0].length, members = new Set();
    if (text[at] === "{") keysOf(text, at).forEach((k) => members.add(k));
    else {
      const id = text.slice(at).match(/^[A-Za-z_$][\w$]*/)?.[0];
      if (id) {
        const v = text.match(new RegExp(`(?:var|let|const)\\s+${id}\\s*=\\s*`));
        if (v) {
          const vat = v.index + v[0].length;
          if (text[vat] === "{") keysOf(text, vat).forEach((k) => members.add(k));
          else if (text[vat] === "(") {   // an IIFE: the keys of its last top level return {...}
            const end = block(text, vat), body = text.slice(vat, end);
            const rets = [...body.matchAll(/\breturn\s*\{/g)];
            if (rets.length) { const r = rets[rets.length - 1]; keysOf(text, vat + r.index + r[0].length - 1).forEach((k) => members.add(k)); }
          }
        }
        for (const p of text.matchAll(new RegExp(`(?<![\\w$.])${id}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, "g"))) members.add(p[1]);
      }
    }
    for (const p of text.matchAll(new RegExp(`window\\.${name}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, "g"))) members.add(p[1]);
    /* an alias: var App = window.RosterApp = window.RosterApp || {}; then App.x = ... */
    for (const a of text.matchAll(new RegExp(`(?:var|let|const)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*window\\.${name}\\b`, "g"))) {
      members.delete(name);
      for (const p of text.matchAll(new RegExp(`(?<![\\w$.])${a[1]}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, "g"))) members.add(p[1]);
    }
    GLOBALS.set(name, { file: rel(f), members });
  }
}
for (const [g, { file }] of GLOBALS) if (!new RegExp(`\\b${g}\\b`).test(SKILL)) add("error", "components", `kit global ${g} (${file}) is not named in the skill`);
const isPendingApi = (k, x) => pendingDocs.has(x.f) || pendingNames.has(k) || pendingNames.has(k.split(".")[0]) || NOT_YET.test(x.l);

/* class families of the kit CSS: .r<name>, without --modifier and __element */
const families = new Map();   // family -> first file
for (const f of KIT_CSS) {
  const text = src(f).replace(/\{[^{}]*\}/g, (b) => blank(b));   // selectors only (declaration blocks blanked; @media bodies keep their selectors)
  for (const m of text.matchAll(/\.(r[a-z][\w-]*)/g)) { const fam = m[1].split(/--|__/)[0]; if (!families.has(fam)) families.set(fam, rel(f)); }
}
for (const [fam, file] of [...families].sort()) {
  if (INTERNAL.has(fam)) continue;
  if (new RegExp(`(?<![\\w-])\\.?${fam.replace(/-/g, "\\-")}(?![\\w]|-[a-z])`).test(SKILL)) continue;
  if (LEGACY.has(fam)) add("warning", "components", `class family .${fam} (${file}) has kit CSS but no kit script writes it and the skill does not define it: remove the rules or define the component`);
  else add("error", "components", `class family .${fam} (${file}) is not named in the skill`);
}

/* ========== 3. apis ========== */
const named = new Map();   // "RosterX.m" -> the first skill line that names it, and whether every line that names it is pending
for (const c of codeSpans) for (const m of c.text.matchAll(/\b(Roster[A-Z]\w*)\.([A-Za-z_$][\w$]*)/g)) {
  const k = m[1] + "." + m[2], p = isPendingApi(k, c.x), cur = named.get(k);
  if (!cur) named.set(k, { x: c.x, pending: p }); else if (!p && cur.pending) named.set(k, { x: c.x, pending: false });
}
for (const [k, { x, pending }] of named) {
  const [g, meth] = k.split(".");
  const G = GLOBALS.get(g);
  const miss = !G ? `${g} is not a kit global` : !G.members.has(meth) ? `${G.file} does not export ${meth}` : "";
  if (miss) add(pending ? "info" : "error", "apis", `${at(x)} names \`${k}\`, but ${miss}${pending ? " (declared not built yet)" : ""}`);
}
for (const [g, { file, members }] of GLOBALS) for (const meth of members) {
  if (meth.startsWith("_")) continue;
  if (!new RegExp(`\\b${g}\\.${meth.replace(/\$/g, "\\$")}\\b`).test(SKILL)) add("warning", "apis", `${g}.${meth} (${file}) is exported but the skill never names it`);
}

/* ========== 4. files ========== */
const seenPath = new Set();
ALL.forEach((x) => {
  for (const m of x.l.matchAll(/(?<![\w./-])((?:ui|apps|scripts)\/[\w.\/<>*…{}-]*)/g)) {
    let p = m[1].replace(/[.,:;)]+$/, "");
    if (/[<>*…{}]/.test(p) || seenPath.has(p)) continue;
    seenPath.add(p);
    if (fs.existsSync(path.join(ROOT, p))) continue;
    const pending = pendingDocs.has(x.f) || pendingNames.has(p) || NOT_YET.test(x.l);
    add(pending ? "info" : "error", "files", `${at(x)} names ${p}, which does not exist${pending ? " (declared not built yet)" : ""}`);
  }
});

/* ========== 5. pending marks ========== */
/* "ממתין" as pending (waits for the owner, a decision, an approval), not "waiting" as a busy state ("שורה ממתינה") */
const PENDING = /עדיין לא קיים|ממתי[נן]\S*\s+(?:ל)?(?:אישור|החלט|הבעלים|לבעלים)|\(ממתי[נן]|(?<!לא )ממתי[נן]\S*:|\*\*ממתי[נן]|ממתין למימוש/;
ALL.forEach((x) => {
  const l = x.l;
  if (!PENDING.test(l)) return;
  const k = l.search(PENDING), from = Math.max(0, k - 60);
  const snip = (from ? "…" : "") + l.slice(from, k + 80).trim() + (k + 80 < l.length ? "…" : "");
  add("info", "pending", `${at(x)} [${x.sec || "top"}]  ${snip}`);
});

/* ---------- print ---------- */
for (const level of ["error", "warning", "info"]) {
  if (level === "info" && QUIET) continue;
  const list = F[level]; if (!list.length) continue;
  console.log(`\n=== ${level.toUpperCase()} (${list.length}) ===`);
  const byCheck = new Map(); for (const x of list) { if (!byCheck.has(x.check)) byCheck.set(x.check, []); byCheck.get(x.check).push(x.msg); }
  for (const [c, msgs] of byCheck) { console.log(`-- ${c} (${msgs.length})`); for (const m of msgs) console.log("  " + m); }
}
console.log(`\n${F.error.length} error(s), ${F.warning.length} warning(s), ${F.info.length} info  ·  ${KIT_CSS.length} css, ${KIT_JS.length} js, ${GLOBALS.size} globals, ${APPS.length} kit app(s) [${APPS.map((a) => a.key).join(", ")}]  ·  ${Date.now() - T0}ms`);
process.exit(F.error.length ? 1 : 0);
