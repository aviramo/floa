/* Import Harpatka's history (a backup made by harpatka/tools/backup-prod.py) into Roster, business "harpatka", TEST SCHEMA ONLY.

   node scripts/harpatka-import.mjs <backup-dir>            dry run: every table is inserted inside a transaction that is rolled back; prints what WOULD be added
   node scripts/harpatka-import.mjs <backup-dir> --run      writes (only what is missing), then prints the real counts

   - The schema is fixed to roster-test. The real schema is refused on purpose: the move to production is a separate, owner-approved step.
   - Non-destructive: nothing is deleted or updated. Every insert is "on conflict do nothing", so a second run adds nothing, and a row that
     already exists in Roster (same id, same phone, same key) wins.
   - Ids are kept as they are in Harpatka (they are uuids, and the two systems share no ids), so there is no id map to lose: payments, notes
     and attendance point at the same participants and meetings in Roster as they did there. business_id is always the harpatka business.
   - session_replication_role = replica for the import (inside each transaction only): Roster's triggers would otherwise send webhook events,
     write NEW system notes for every imported payment and registration (the old ones are imported as they are), re-price and re-normalize.
   - Tables: pay_methods, meeting_types, statuses, promoters, meetings, participants, attendance, payments, notes, promoter_payments, finance,
     finance_recurring, finance_transfers, msg_templates. members become PRE-LINKS (member_links, same as member-links-import.mjs): the first Google
     sign-in with that verified email binds the real user. Skipped on purpose: audit, mail_log, mail_templates, posts, likes, anon_likes,
     finance_log (Roster writes its own), msg_sent, settings, public_settings, admins, admin_prefs.
   - The backup holds personal data: keep it out of git. This script prints counts only. */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
const run = args.includes("--run");
const SCHEMA = "roster-test", SLUG = "harpatka";
if (args.some((a) => a.startsWith("--schema") || a.startsWith("--business"))) { console.error("the schema and the business are fixed (roster-test, harpatka)"); process.exit(2); }
if (!dir || !existsSync(dir)) { console.error("usage: node scripts/harpatka-import.mjs <backup-dir> [--run]"); process.exit(2); }

const SQLJS = fileURLToPath(new URL("./sql.mjs", import.meta.url));
const S = `"${SCHEMA}"`;
function sql(text) {
  const r = spawnSync(process.execPath, [SQLJS], { input: text, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "") + (r.stderr || "");
  const i = out.indexOf("[");
  let rows = null;
  if (i >= 0) { try { rows = JSON.parse(out.slice(i, out.lastIndexOf("]") + 1)); } catch { /* not rows */ } }
  return { ok: rows !== null, rows, out };
}
const one = (text) => { const r = sql(text); if (!r.ok) { console.error(r.out.slice(0, 600)); process.exit(1); } return r.rows; };

const biz = one(`select id from ${S}.businesses where slug = '${SLUG}'`);
if (!biz.length) { console.error(`no business "${SLUG}" in ${SCHEMA}: nothing is created by this script`); process.exit(1); }
const B = biz[0].id;

const read = (t) => { const f = join(dir, `harpatka_${t}.json`); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : []; };
const tcols = {}, tdef = {};
for (const r of one(`select table_name t, column_name c, is_generated g, column_default d from information_schema.columns where table_schema = '${SCHEMA}'`)) if (r.g === "NEVER") { (tcols[r.t] ??= new Set()).add(r.c); if (r.d) tdef[`${r.t}.${r.c}`] = r.d; }

const COUNTS = ["participants", "attendance", "payments", "notes"];
const counts = () => Object.fromEntries(COUNTS.map((t) => [t, Number(one(`select count(*) n from ${S}.${t} where business_id = '${B}'`)[0].n)]));

const ORDER = ["pay_methods", "meeting_types", "statuses", "promoters", "meetings", "participants", "attendance", "payments", "notes",
  "promoter_payments", "finance", "finance_recurring", "finance_transfers", "msg_templates"];
const CHUNK = 1_200_000;   // characters of JSON per request (the notes carry screenshots)

function insertSql(table, rows) {
  /* a column Harpatka never had takes the table's default; one it had but left empty on this row takes it too (a JSON null would otherwise beat the default) */
  const cols = [...tcols[table]].filter((c) => c === "business_id" || tdef[`${table}.${c}`] || rows.some((r) => c in r));
  const sel = cols.map((c) => (c === "business_id" ? `'${B}'::uuid` : tdef[`${table}.${c}`] ? `coalesce(r.${c}, ${tdef[`${table}.${c}`]})` : `r.${c}`)).join(", ");
  const lit = JSON.stringify(rows).replace(/\u0000/g, "");
  return `with ins as (
  insert into ${S}.${table} (${cols.join(", ")})
  select ${sel} from jsonb_populate_recordset(null::${S}.${table}, $hj$${lit}$hj$::jsonb) r
  on conflict do nothing returning 1)
select count(*)::int as n from ins`;
}
const wrap = (body) => run
  ? `set local session_replication_role = replica;\n${body}`
  : `do $d$ declare n int; begin set local session_replication_role = replica;\n${body.replace(/select count\(\*\)::int as n from ins$/, "select count(*)::int into n from ins")};\nraise exception 'DRYRUN %', n; end $d$`;
const result = (r) => {
  if (run) return r.ok ? r.rows[0].n : null;
  const m = /DRYRUN (\d+)/.exec(r.out); return m ? Number(m[1]) : null;
};

function chunks(rows) {
  const out = []; let cur = [], size = 0;
  for (const r of rows) { const s = JSON.stringify(r).length; if (cur.length && size + s > CHUNK) { out.push(cur); cur = []; size = 0; } cur.push(r); size += s; }
  if (cur.length) out.push(cur);
  return out;
}

const before = counts();
console.log(`${run ? "RUN" : "DRY RUN"}: ${SCHEMA} / ${SLUG} (${B})`);
console.log("before:", JSON.stringify(before));
let failed = false;
const report = [];
for (const t of ORDER) {
  const rows = read(t);
  if (!rows.length) { report.push([t, 0, 0]); continue; }
  if (!tcols[t]) { console.error(`${t}: no such table in ${SCHEMA}`); failed = true; continue; }
  let added = 0, bad = false;
  for (const part of chunks(rows)) {
    const n = result(sql(wrap(insertSql(t, part))));
    if (n === null) { bad = true; console.error(`${t}: a batch failed`); break; }
    added += n;
  }
  if (bad) { failed = true; report.push([t, rows.length, "FAILED"]); } else report.push([t, rows.length, added]);
}

/* members -> pre-links: only approved and blocked, only for a participant that exists in Roster for this business */
const members = read("members").filter((m) => m.email && m.participant_id && (m.status === "approved" || m.status === "blocked"))
  .map((m) => ({ email: String(m.email).trim().toLowerCase(), participant_id: m.participant_id, status: m.status }));
if (members.length) {
  const lit = JSON.stringify(members);
  const body = `with ins as (
  insert into ${S}.member_links (business_id, email, participant_id, status)
  select '${B}'::uuid, v.email, v.participant_id, v.status
    from jsonb_to_recordset($hj$${lit}$hj$::jsonb) v(email text, participant_id uuid, status text)
    join ${S}.participants p on p.business_id = '${B}' and p.id = v.participant_id
  on conflict do nothing returning 1)
select count(*)::int as n from ins`;
  const n = result(sql(wrap(body)));
  if (n === null) { failed = true; report.push(["members -> member_links", members.length, "FAILED"]); } else report.push(["members -> member_links", members.length, n]);
}

console.log("\ntable                      in backup   " + (run ? "added" : "would add"));
for (const [t, a, b] of report) console.log(t.padEnd(26), String(a).padStart(9), String(b).padStart(11));
const after = run ? counts() : Object.fromEntries(COUNTS.map((t) => [t, before[t] + (report.find((r) => r[0] === t)?.[2] || 0)]));
console.log("\nafter" + (run ? ":" : " (predicted):"), JSON.stringify(after));
if (failed) { console.error("\nSOME BATCHES FAILED"); process.exit(1); }
