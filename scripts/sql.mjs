/* ==========================================================================
   Run SQL against the domain's Supabase project, from here.

   The site talks to Supabase with the anon key, over REST, past row level
   security — that is the front door and it stays narrow on purpose. This is the
   other door: the Management API, which takes the personal access token in .env
   and runs whatever SQL you hand it, as the owner. Reading a table someone
   else's policy hides, adding a column, writing a policy, checking what
   businesses/chords/schema.sql actually became after three edits.

     node scripts/sql.mjs "select id, title from songs limit 5"
     node scripts/sql.mjs < some-migration.sql
     echo "alter table songs add column key text" | node scripts/sql.mjs

   Rows come back as JSON, one object per row. Add --table for columns lined up
   when the answer is meant to be read rather than piped.

   It needs SUPABASE_ACCESS_TOKEN in .env, which is not in this repo and must
   not be: see .env.example for where to get one. No token, and this says so
   instead of failing somewhere less obvious.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://api.supabase.com/v1";

/* .env, read here rather than through a dependency. It holds two keys and its
   whole grammar is KEY=value: a parser for that is four lines, and four lines
   is cheaper than a package that has to be trusted with the file that holds
   the token. A real environment variable, if there is one, wins. */
function env() {
  const vars = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env: fall through to the process environment and the message below */
  }
  return { ...vars, ...process.env };
}

const args = process.argv.slice(2);
const asTable = args.includes("--table");
const inline = args.filter((a) => !a.startsWith("--")).join(" ");
/* Either an argument or stdin, so a whole .sql file can be piped in without
   worrying about how the shell will treat its quotes. */
const query = inline || readFileSync(0, "utf8");

if (!query.trim()) {
  console.error("Nothing to run. Pass SQL as an argument or on stdin.");
  process.exit(1);
}

const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref } = env();

if (!token) {
  console.error(
    "No SUPABASE_ACCESS_TOKEN.\n" +
      "Get one at https://supabase.com/dashboard/account/tokens and put it in\n" +
      ".env (copy .env.example). It never goes in a committed file.",
  );
  process.exit(1);
}

const res = await fetch(`${API}/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ query }),
});

const body = await res.text();

if (!res.ok) {
  /* Postgres's own error is in there and it is the useful part: say what it
     said, not "request failed". */
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.error || body;
  } catch {
    /* not JSON: the raw body is the best there is */
  }
  console.error(`${res.status}: ${message}`);
  process.exit(1);
}

const rows = JSON.parse(body);

if (!Array.isArray(rows) || rows.length === 0) {
  console.log(Array.isArray(rows) ? "No rows." : body);
  process.exit(0);
}

if (!asTable) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

/* Columns wide enough for their widest cell, which is all a table needs to be
   readable in a terminal. Long values are cut rather than wrapped: a row that
   spills over three lines stops being a row. */
const cell = (v) => {
  const s = v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > 60 ? s.slice(0, 57) + "..." : s.replace(/\n/g, " ");
};
const cols = Object.keys(rows[0]);
const width = Object.fromEntries(
  cols.map((c) => [
    c,
    Math.max(c.length, ...rows.map((r) => cell(r[c]).length)),
  ]),
);
const line = (cells) => cells.map((c, i) => c.padEnd(width[cols[i]])).join("  ");

console.log(line(cols));
console.log(cols.map((c) => "-".repeat(width[c])).join("  "));
for (const row of rows) console.log(line(cols.map((c) => cell(row[c]))));
console.log(`\n${rows.length} row${rows.length === 1 ? "" : "s"}`);
