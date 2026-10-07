/* Drives the dashboard in a real Chrome with Supabase stubbed out, to check the
   screens without a Google login. Needs a build first (node build.mjs). */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(import.meta.dirname, "..", "..", "..", "dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(5599);

const jwt = "x." + Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64") + ".y";
const agent = { id: "a1", owner: "u1", name: "סוכן בדיקה", roles: ["מפתח/ת Full Stack"], city: "תל אביב", radius_km: 25, cv_name: "cv.pdf", profile: { headline: "מפתח", years_experience: 5, skills: ["node"], languages: ["עברית"], summary: "תקציר" } };
const apps = [
  { id: "j1", title: "מפתח Full Stack", company: "חברה", location: "חולון", source: "drushim", score: 80, reason: "תפקיד", status: "scored", note: "", url: "https://example.com/1" },
  { id: "j2", title: "מפתח Backend", company: "אחרת", location: "בני ברק", source: "alljobs", score: 50, reason: "x", status: "sent", note: "", url: "https://example.com/2" },
];
const calls = [];
const b = await chromium.launch({ channel: "chrome", headless: true });
const page = await b.newPage();
await page.addInitScript((s) => localStorage.setItem("jobs.session", s), JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: Date.now() + 3600e3 }));
await page.route("**/rest/v1/**", (route) => {
  const u = route.request().url(); calls.push(route.request().method() + " " + u.split("/rest/v1/")[1]);
  const json = (v) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  if (u.includes("job_connections")) return json(route.request().method() === "GET" ? [{ site: "alljobs", status: "connected", note: "" }] : [{}]);
  if (u.includes("job_applications") && route.request().method() === "GET") return json(apps);
  if (u.includes("job_runs") && route.request().method() === "GET") return json([]);
  if (u.includes("job_runs")) return json([{ id: "r1" }]);
  if (u.includes("job_agents") && route.request().method() === "GET") return json([agent]);
  return json([agent]);
});
await page.route("**/supabase.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.SUPABASE={url:"http://localhost:5599/sb",anonKey:"k"}' }));
await page.goto("http://localhost:5599/jobs/");
await page.waitForSelector(".card");
console.log("dashboard:", (await page.textContent("main")).replace(/\s+/g, " ").slice(0, 120));
await page.waitForSelector("#conns .conn");
console.log("connections:", (await page.locator("#conns .conn").allInnerTexts()).map((t) => t.replace(/s+/g, " ").slice(0, 60)).join(" | "));
await page.locator("#conns button").nth(1).click();
await page.waitForTimeout(300);
await page.click("button:text-is(\"פתח\")");
await page.waitForSelector("#found .card"); console.log("city options:", await page.locator("#cities option").count(), "| fields:", await page.locator("#field option").count());
console.log("agent cards:", await page.locator("#found .card").count(), "| checkbox only on scored:", await page.locator("#found input[type=checkbox]").count());
await page.locator("#found input[type=checkbox]").check();
await page.click("text=שלח את המסומנות");
await page.waitForTimeout(300);
console.log("queued msg:", await page.textContent("#runmsg"));
await page.click("#send");
await page.waitForTimeout(500);
console.log("calls:", calls.join(" | "));
await b.close(); server.close();
