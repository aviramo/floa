/* ==========================================================================
   The catalog of roles an agent is picked from, taken from a real source.

     node roles.mjs

   Drushim publishes its own taxonomy: 36 fields (תחום) and under them every
   role (תפקיד) it files a job under, each with a code. That is the list the
   site itself loads (webapi.drushim.co.il/api/categories/all), so a role chosen
   here is a role Drushim knows, and the runner searches Drushim by its code
   rather than by guessing words.

   The result is written to ../public/assets/roles.json, which the dashboard
   loads. Run this again when the taxonomy changes; the file is committed so
   that the site does not depend on Drushim being reachable.
   ========================================================================== */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { open } from "./browser.mjs";

const OUT = join(import.meta.dirname, "..", "public", "assets", "roles.json");

const context = await open();
let list;
try {
  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.drushim.co.il/jobs/cat6/", { waitUntil: "load" }).catch(() => {});
  await page.waitForTimeout(3000);
  list = (await page.evaluate(() => fetch("https://webapi.drushim.co.il/api/categories/all").then((r) => r.json()))).ResultList;
} finally {
  await context.close();
}

const clean = (s) => String(s).replace(/\s+/g, " ").trim();
const catalog = list
  .filter((cat) => cat.Areas.length)
  .map((cat) => ({
    field: clean(cat.NameInHebrew),
    roles: [...new Map(cat.Areas.map((a) => [clean(a.NameInHebrew), a.Code])).entries()].map(([name, code]) => ({ name, drushim: [code] })),
  }));

/* A role that is filed under several fields is one role: the same name, every
   code it has. It stays in each field it appears in, so it can be found there. */
const codes = new Map();
for (const field of catalog) for (const role of field.roles) codes.set(role.name, [...new Set([...(codes.get(role.name) || []), ...role.drushim])]);
for (const field of catalog) for (const role of field.roles) role.drushim = codes.get(role.name);

writeFileSync(OUT, JSON.stringify({ source: "drushim.co.il", fetched: new Date().toISOString().slice(0, 10), fields: catalog }));
console.log(`${catalog.length} תחומים, ${codes.size} תפקידים -> ${OUT}`);
