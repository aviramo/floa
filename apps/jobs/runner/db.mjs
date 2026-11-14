/* ==========================================================================
   The runner's door to the database.

   The runner is one person's machine acting for that person, so it uses the
   same door scripts/sql.mjs does: the Management API with the token in the
   repo's .env, which is not committed. No second secret, and nothing here ever
   ships to a browser. (When the runner becomes a service for other people, it
   must stop being the owner and act per user instead.)
   ========================================================================== */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

export function env() {
  const vars = {};
  try {
    for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env: the process environment is all there is */
  }
  return { ...vars, ...process.env };
}

export async function sql(query) {
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_REF: ref } = env();
  if (!token || !ref) throw new Error("SUPABASE_ACCESS_TOKEN / SUPABASE_PROJECT_REF are missing from .env");
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`sql ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

/* A value as a SQL literal. Text goes in a dollar-quoted string whose tag does
   not occur in the text, which is safe for anything a web page can contain. */
export function lit(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(Number.isFinite(value) ? value : 0);
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let tag = "q";
  while (text.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${text}$${tag}$`;
}
