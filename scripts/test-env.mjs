/* The TEST copy of the database: a schema named "test" inside the same Supabase project, built
   from each business's own schema.sql. Same idea as harpatka's test environment: the site served
   with --test sends Accept-Profile / Content-Profile: test, so every table, policy and function it
   touches is the copy, and public (the real data) is never reached.

     node scripts/test-env.mjs            print the SQL that builds the test schema (touches nothing)
     node scripts/test-env.mjs --apply    drop and rebuild the test schema, through scripts/sql.mjs
     node scripts/test-env.mjs --apply roster chords    only those businesses

   --apply is a RESET: the whole test schema is dropped first. It never touches public. */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const wanted = args.filter((a) => !a.startsWith("--"));
const ALL = ["roster", "jobs", "quit"];   // aum is retired (its admin lives in roster); chords is not a fresh build yet: it reads people before creating it
const businesses = wanted.length ? wanted : ALL;

/* public -> test, except where the word is the ROLE PUBLIC ("revoke ... from public",
   "grant ... to public") or a column named public. */
function toTest(sql) {
  /* blocks a schema marks `-- test-env:skip` ... `-- test-env:end` stay out of the copy: things that
     reach outside the schema (a call to GitHub, the shared storage bucket) have no business there */
  sql = sql.replace(/^-- test-env:skip.*$[\s\S]*?^-- test-env:end$/gm, "-- (skipped for the test copy)");
  return sql
    .replace(/\b(to|from)\s+public\b(?!\.)/gi, "$1 \u0001")
    .replace(/\bpublic\b/g, "test")
    .replace(/\u0001/g, "public");
}

const parts = ["drop schema if exists test cascade;", "create schema test;", "set search_path = test, extensions;"];
for (const b of businesses) {
  const f = join(ROOT, "businesses", b, "schema.sql");
  if (!existsSync(f)) { console.error("no schema.sql for", b); process.exit(1); }
  parts.push("-- " + b, toTest(readFileSync(f, "utf8")));
}
parts.push(
  "grant usage on schema test to anon, authenticated, service_role;",
  "grant all on all tables in schema test to service_role;",
  "grant all on all sequences in schema test to service_role, authenticated;",
  "grant execute on all functions in schema test to service_role, authenticated, anon;",
);
const sql = parts.join("\n\n");

if (!apply) { process.stdout.write(sql + "\n"); process.exit(0); }
const r = spawnSync(process.execPath, [join(ROOT, "scripts", "sql.mjs")], { input: sql, encoding: "utf8" });
process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
process.exit(r.status ?? 1);
