/* The role picker: search by free words, and the CV's ranked suggestions.
   Needs a build first. Supabase is stubbed. */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(import.meta.dirname, "..", "..", "..", "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(5598);

const jwt = "x." + Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64") + ".y";
const agent = { id: "a1", owner: "u1", name: "בדיקה", roles: [], city: "", radius_km: 20, cv_name: "cv.pdf",
  profile: { headline: "מפתח", years_experience: 5, skills: [], languages: [], summary: "x",
    recommended: [{ name: "מפתח/ת Backend", score: 62 }, { name: "מפתח/ת Full Stack", score: 91 }, { name: "מנהל/ת מוצר", score: 74 }] } };
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await b.newPage();
await page.addInitScript((s) => localStorage.setItem("jobs.session", s), JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: Date.now() + 3600e3 }));
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
await page.route("**/rest/v1/**", (route) => {
  const u = route.request().url();
  const json = (v) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  if (u.includes("job_applications") || u.includes("job_runs")) return json([]);
  return json([agent]);
});
await page.route("**/supabase.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.SUPABASE={url:"http://localhost:5598/sb",anonKey:"k"}' }));
await page.goto("http://localhost:5598/jobs/");
await page.waitForSelector(".card");
await page.click('button:text-is("פתח")');
await page.waitForSelector("#recs .pick");
console.log("recommendations (order):", (await page.locator("#recs .pick").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
for (const text of ["פולסטק", "אנליסט", "נהג", "תוכנה", "מכירות", "קופירייטר", "full stack", "חשבונות"]) {
  await page.fill("#q", text);
  await page.waitForTimeout(150);
  const hits = (await page.locator("#roles .pick .grow").allInnerTexts()).slice(0, 5);
  console.log(`"${text}" ->`, hits.join(" | ") || "(nothing)");
}
await page.fill("#q", "מוצר");
await page.locator("#roles .pick input").first().check();
console.log("chosen after tick:", (await page.locator("#picked .chip").allInnerTexts()).join(" | "));
await b.close(); server.close();
