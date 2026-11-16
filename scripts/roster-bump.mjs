/* Roster's pages load their own scripts and styles with ?v=<md5 of the file>, so a browser that cached the old file (the host serves
   them for 4 hours) fetches the new one the moment the page itself is new. Nothing rewrites those numbers by itself: run this after
   changing any asset under apps/roster/public, before committing.

     node scripts/roster-bump.mjs

   It walks every .html there, and for each src/href with ?v= on a file that exists, writes the first 8 hex digits of the file's md5. */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "roster", "public");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let changed = 0;
for (const page of walk(ROOT).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(page, "utf8");
  /* the domain's two shared scripts live outside this folder (apps/floa/domain/): they get the same ?v=, so a changed shim (the test strip, the schema) reaches a browser that cached the old one */
  const DOMAIN = join(ROOT, "..", "..", "floa", "domain");
  const withDomain = html.replace(/(src=")(\/(?:supabase|auth)\.js)(?:\?v=[a-z0-9]+)?(")/g, (m, a, ref, z) =>
    a + ref + "?v=" + createHash("md5").update(readFileSync(join(DOMAIN, ref.slice(1)))).digest("hex").slice(0, 8) + z);
  const out = withDomain.replace(/((?:src|href)=")([^"?#]+)\?v=([a-z0-9]+)(")/g, (m, a, ref, v, z) => {
    const file = ref.startsWith("/roster/") ? join(ROOT, ref.slice(8)) : ref.startsWith("/") ? null : resolve(dirname(page), ref);
    if (!file || !existsSync(file)) return m;
    const h = createHash("md5").update(readFileSync(file)).digest("hex").slice(0, 8);
    return h === v ? m : a + ref + "?v=" + h + z;
  });
  if (out !== html) { writeFileSync(page, out); changed++; console.log("bumped", page.slice(ROOT.length + 1)); }
}
console.log(changed ? changed + " page(s) updated" : "all versions already current");
