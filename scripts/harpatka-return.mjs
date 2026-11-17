/* The way back from Roster to Harpatka's old database: export what was created in Roster for the business "harpatka" AFTER a moment, as JSON files in
   the same shape as Harpatka's own backup (harpatka_<table>.json, one array per table, only the columns Harpatka's tables have), so they can be applied
   to Harpatka's old database by hand or by a script on its side. A return is needed if Harpatka's site is switched back to its own database after
   Roster took registrations: those registrations exist only in Roster.

   node scripts/harpatka-return.mjs --since 2026-11-20T10:00:00Z --like <a-harpatka-backup-dir> --out <dir outside the repo> [--prod]

   - READ-ONLY on Roster: select queries only. It writes only the local files in --out, which must be OUTSIDE this repo (personal data). It never touches
     Harpatka's database. Without --prod the schema is roster-test; with --prod it reads the real schema roster (still read-only).
   - Tables: participants (created or changed since, plus the ones the other rows point at), attendance, payments, notes (created at or after --since).
   - Columns: those listed for the table in the backup's _columns.json (--like), that Roster also has. Roster-only columns are left out.
   - A manifest (_return_manifest.json) records the moment, the schema and the counts, never any personal data.
   - What it cannot export: a registration that was REMOVED in Roster after --since is gone from Roster (nothing to read); the apply side must treat the
     export as additions and updates, not as the full truth. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, resolve, relative, isAbsolute } from "node:path";

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const PROD = args.includes("--prod");
const SCHEMA = PROD ? "roster" : "roster-test", SLUG = "harpatka";
const since = opt("--since"), like = opt("--like"), out = opt("--out");
if (!since || Number.isNaN(Date.parse(since)) || !like || !out) { console.error("usage: node scripts/harpatka-return.mjs --since <ISO time> --like <harpatka backup dir> --out <dir outside the repo> [--prod]"); process.exit(2); }
if (!existsSync(join(like, "_columns.json"))) { console.error("--like must be a Harpatka backup dir that holds _columns.json"); process.exit(2); }
const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const rel = relative(REPO, resolve(out));
if (!(rel.startsWith("..") || isAbsolute(rel))) { console.error("--out must be outside the repo (the files hold personal data)"); process.exit(2); }

const SQLJS = fileURLToPath(new URL("./sql.mjs", import.meta.url));
const S = `"${SCHEMA}"`;
function q(text) {
  const r = spawnSync(process.execPath, [SQLJS], { input: text, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  const o = (r.stdout || "") + (r.stderr || "");
  const i = o.indexOf("[");
  try { return JSON.parse(o.slice(i, o.lastIndexOf("]") + 1)); } catch { console.error(o.slice(0, 500)); process.exit(1); }
}
const SINCE = `'${new Date(since).toISOString()}'::timestamptz`;
const biz = q(`select id from ${S}.businesses where slug = '${SLUG}'`);
if (!biz.length) { console.error(`no business "${SLUG}" in ${SCHEMA}`); process.exit(1); }
const B = biz[0].id;

const harpatkaCols = JSON.parse(readFileSync(join(like, "_columns.json"), "utf8"));
const colsOf = (t) => (harpatkaCols[`harpatka_${t}`] || []).map((c) => (typeof c === "string" ? c : c.column_name || c.name)).filter(Boolean);
const rosterCols = {};
for (const r of q(`select table_name t, column_name c from information_schema.columns where table_schema = '${SCHEMA}' and table_name in ('participants','attendance','payments','notes')`)) (rosterCols[r.t] ??= new Set()).add(r.c);
const pick = (t) => colsOf(t).filter((c) => rosterCols[t]?.has(c));
const rowsOf = (t, where) => q(`select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as j from (select * from ${S}.${t} where business_id = '${B}' and (${where})) x`)[0].j
  .map((r) => Object.fromEntries(pick(t).map((c) => [c, r[c] ?? null])));

const attendance = rowsOf("attendance", `created_at >= ${SINCE}`);
const payments = rowsOf("payments", `created_at >= ${SINCE}`);
const notes = rowsOf("notes", `created_at >= ${SINCE}`);
const ref = [...new Set([...attendance, ...payments, ...notes].map((r) => r.participant_id).filter(Boolean))];
const changed = rosterCols.participants.has("updated_at") ? ` or updated_at >= ${SINCE}` : "";
const refList = ref.length ? ` or id in (${ref.map((x) => `'${x}'`).join(",")})` : "";
const participants = rowsOf("participants", `created_at >= ${SINCE}${changed}${refList}`);

mkdirSync(out, { recursive: true });
const files = { participants, attendance, payments, notes };
for (const [t, rows] of Object.entries(files)) writeFileSync(join(out, `harpatka_${t}.json`), JSON.stringify(rows, null, 1));
const manifest = { kind: "roster-to-harpatka return", schema: SCHEMA, business: SLUG, since: new Date(since).toISOString(), exported_at: new Date().toISOString(),
  counts: Object.fromEntries(Object.entries(files).map(([t, r]) => [t, r.length])),
  note: "additions and updates only: a registration removed in Roster after the moment is not here" };
writeFileSync(join(out, "_return_manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`${SCHEMA}/${SLUG} since ${manifest.since}: ${JSON.stringify(manifest.counts)} -> ${resolve(out)}`);
