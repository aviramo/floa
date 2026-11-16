/* Carry Google-account-to-participant links into Roster as PRE-LINKS (roster.member_links): the first sign-in with that verified email
   binds the real user id (roster.me, apps/roster/me-email.sql). Source: a JSON array [{ "email", "phone_norm", "status" }] exported from
   Harpatka's harpatka_members. The file holds personal data: keep it out of git (C:\Users\ofira\Desktop\harpatka-backups\ is fine).
   A link finds its Roster participant by phone (roster.normalize_phone of phone_norm) inside the business. Only 'approved' and 'blocked' are carried.
   Usage: node scripts/member-links-import.mjs <file.json> [--business=harpatka] [--schema=roster-test] [--run]
          without --run it only prints the SQL; with --run it applies it (scripts/sql.mjs) and prints how many matched. */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || "").slice(k.length + 3) || d;
if (!file) { console.error("usage: node scripts/member-links-import.mjs <file.json> [--business=harpatka] [--schema=roster-test] [--run]"); process.exit(2); }
const business = opt("business", "harpatka"), schema = opt("schema", "roster-test");
if (!/^[a-z][a-z0-9-]{1,39}$/.test(business) || !/^[a-z][a-z0-9-]*$/.test(schema)) { console.error("bad --business or --schema"); process.exit(2); }

const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";
const rows = JSON.parse(readFileSync(file, "utf8")).map((r) => ({
  email: String(r.email || "").trim().toLowerCase(), phone: String(r.phone_norm || r.phone || "").trim(), status: String(r.status || "").trim(),
})).filter((r) => r.email && r.phone && (r.status === "approved" || r.status === "blocked"));
if (!rows.length) { console.error("no approved or blocked rows with an email and a phone"); process.exit(1); }

const S = `"${schema}"`;
const sql = `with v(email, phone, status) as (values ${rows.map((r) => `(${q(r.email)}, ${q(r.phone)}, ${q(r.status)})`).join(",\n  ")}),
ins as (
  insert into ${S}.member_links (business_id, email, participant_id, status)
  select b.id, v.email, p.id, v.status
    from v join ${S}.businesses b on b.slug = ${q(business)}
    join ${S}.participants p on p.business_id = b.id and p.phone_norm = ${S}.normalize_phone(v.phone)
  on conflict (business_id, email) do update set participant_id = excluded.participant_id, status = excluded.status
  returning 1)
select (select count(*) from v) as given, (select count(*) from ins) as linked;`;

if (!args.includes("--run")) { console.log(sql); process.exit(0); }
const r = spawnSync(process.execPath, [fileURLToPath(new URL("./sql.mjs", import.meta.url)), "--table"], { input: sql, encoding: "utf8" });
process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
