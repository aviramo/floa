/* Turns a built site (dist/) into the TEST site, in place. Run by the test workflow after `node build.mjs`;
   never run on the real site.

     node scripts/inject-test.mjs dist

   - every page gets scripts/test-env.client.js first: every database request goes to the `test` schema
     (separate data) and an orange bar says so
   - noindex on every page, a robots.txt that closes the site, no sitemap, no llms.txt
   - no CNAME: the host is attached to the Cloudflare Pages project, not to a file */
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(process.argv[2] || join(ROOT, "dist"));

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let pages = 0;
for (const f of walk(dir)) {
  if (!f.endsWith(".html")) continue;
  const html = readFileSync(f, "utf8");
  if (!/<head[^>]*>/i.test(html)) continue;
  writeFileSync(f, html.replace(/<head[^>]*>/i, (m) => m + '<meta name="robots" content="noindex"><script src="/__test-env.js"></script>'));
  pages++;
}
writeFileSync(join(dir, "__test-env.js"), readFileSync(join(ROOT, "scripts", "test-env.client.js")));
writeFileSync(join(dir, "robots.txt"), "User-agent: *\nDisallow: /\n");
for (const f of ["sitemap.xml", "llms.txt", "CNAME"]) rmSync(join(dir, f), { force: true });
console.log(`test site: ${pages} pages adjusted in ${dir}`);
