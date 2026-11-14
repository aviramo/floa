/* Drives the whole app in a real Chrome with Supabase stubbed out, so the screens
   can be checked without a Google login. Needs a build first (node build.mjs).

     node uitest.mjs [folder for screenshots]                                   */
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join, extname } from "node:path";

const DIST = join(import.meta.dirname, "..", "..", "..", "dist");
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (p.endsWith("\\") || p.endsWith("/")) p = join(p, "index.html");
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
}).listen(5599);

const jwt = "x." + Buffer.from(JSON.stringify({ sub: "u1" })).toString("base64") + ".y";
const agent = {
  id: "a1", owner: "u1", name: "מנתח מערכות", roles: ["מנתח/ת מערכות", "ETL"], city: "תל אביב", radius_km: 25, cv_name: "קורות חיים.pdf",
  skills: ["SQL", "ETL"], languages: ["עברית"],
  profile: {
    summary: "מנתח מערכות בכיר שבשנים האחרונות מוביל אפיון מערכות Web ו-Mobile ואינטגרציות בין מערכות ליבה.",
    skills: ["SQL", "ETL", "Salesforce", "Priority ERP", "REST APIs"], languages: ["עברית", "אנגלית"],
    recommended: [{ name: "מנתח/ת מערכות", score: 92 }, { name: "ETL", score: 71 }, { name: "מיישם/ת Salesforce", score: 64 }],
  },
};
const apps = [
  { id: "j1", agent_id: "a1", title: "מנתח/ת מערכות DATA", company: "קבוצת יעל", location: "פתח תקווה", source: "alljobs", score: 95, reason: "תפקיד: מנתח/ת מערכות · כישורים: etl, sql · 10 ק״מ", status: "scored", note: "", url: "http://localhost:5599/jobs/" },
  { id: "j2", agent_id: "a1", title: "מנתח/ת מערכות מנוסה", company: "מלם תים", location: "תל אביב יפו", source: "drushim", score: 80, reason: "תפקיד: מנתח/ת מערכות · 14 ק״מ", status: "scored", note: "", url: "http://localhost:5599/jobs/" },
  { id: "j3", agent_id: "a1", title: "אנליסט נתונים", company: "חברה", location: "מרכז", source: "alljobs", score: 55, reason: "מיקום לא ברור", status: "manual", note: "לא נמצא כפתור שליחה בדף", url: "http://localhost:5599/jobs/" },
  { id: "j4", agent_id: "a1", title: "מפתח BI", company: "אחרת", location: "חולון", source: "drushim", score: 72, reason: "כישורים: sql", status: "sent", note: "", url: "http://localhost:5599/jobs/" },
];
const calls = [];
const b = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, locale: "he-IL" });
const page = await ctx.newPage();
await page.addInitScript((s) => localStorage.setItem("jobs.session", s), JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: Date.now() + 3600e3 }));
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
await page.route("**/rest/v1/**", (route) => {
  const u = route.request().url(), m = route.request().method();
  calls.push(m + " " + u.split("/rest/v1/")[1]);
  const json = (v) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(v) });
  if (u.includes("job_connections")) return json(m === "GET" ? [{ owner: "u1", site: "alljobs", status: "connected", note: "" }] : [{}]);
  if (u.includes("job_runs")) return json(m === "GET" ? [{ id: "r1", agent_id: "a1", status: "done", note: "נמצאו 54, נשמרו 40.", created_at: new Date().toISOString(), finished_at: new Date().toISOString() }] : [{ id: "r2" }]);
  if (u.includes("job_applications")) return json(m === "GET" ? (u.includes("select=description") ? [{ description: "תיאור המשרה המלא כאן." }] : apps) : [{}]);
  if (u.includes("job_agents")) return json(m === "GET" ? [agent] : [{ ...agent }]);
  return json([]);
});
await page.route("**/supabase.js", (r) => r.fulfill({ contentType: "text/javascript", body: 'window.SUPABASE={url:"http://localhost:5599/sb",anonKey:"k"}' }));
await page.route("**/fonts.googleapis.com/**", (r) => r.abort());

/* THE RULE: the page never scrolls, only a list does. */
const noPageScroll = async (name) => {
  const r = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight - innerHeight, body: document.body.scrollHeight - innerHeight }));
  console.log("page does not scroll (" + name + "):", r.doc <= 0 && r.body <= 0, JSON.stringify(r));
};
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name + ".png"), fullPage: false }); };

await page.goto("http://localhost:5599/jobs/");
await page.waitForSelector(".figures");
console.log("nav:", (await page.locator(".nav-item").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
console.log("figures:", (await page.locator(".figure").allInnerTexts()).map((t) => t.replace(/\s+/g, " ")).join(" | "));
await noPageScroll("overview");
await shot("1-overview");

await page.locator(".grid .agent").click();
await page.waitForSelector(".job");
console.log("agent jobs:", await page.locator(".job").count(), "| checkboxes (only unsent):", await page.locator(".job input").count());
await noPageScroll("agent jobs");
console.log("list scrolls inside itself:", await page.evaluate(() => { const l = document.querySelector("#list"); return l.scrollHeight > l.clientHeight || getComputedStyle(l).overflowY === "auto"; }));
await shot("2-agent-jobs");

await page.locator(".job").first().click();
await page.waitForSelector(".viewer");
console.log("viewer title:", await page.locator(".viewer-title").innerText(), "| frame src:", await page.locator(".viewer iframe").getAttribute("src"));
await page.click("#vt-text");
await page.waitForTimeout(300);
console.log("viewer text:", await page.locator(".viewer-text").innerText());
await shot("3-viewer");
await page.keyboard.press("Escape");

await page.locator(".job input").first().check();
await page.waitForSelector(".sendbar");
console.log("sendbar:", (await page.locator(".sendbar").innerText()).replace(/\s+/g, " "));
await shot("4-sendbar");
await page.click("#bs");
await page.waitForTimeout(300);

await page.click("#t-settings");
await page.waitForSelector("#q");
const order = await page.evaluate(() => ["q", "picked-box", "recs-box"].map((id) => document.getElementById(id).getBoundingClientRect().top));
console.log("search above chosen above recommended:", order[0] < order[1] && order[1] < order[2], order.map(Math.round).join(" < "));
console.log("skills tags:", await page.locator("#sk .chip.tag").allInnerTexts().then((t) => t.join(",")), "| languages:", await page.locator("#lg .chip.tag").allInnerTexts().then((t) => t.join(",")));
console.log("no headline/years:", !(await page.locator("body").innerText()).includes("שנות ניסיון"));
await page.click("#sk .chip.tag >> nth=2");
await page.fill("#lg .tag-add", "צרפתית");
await page.keyboard.press("Enter");
console.log("languages after add:", await page.locator("#lg .chip.tag").allInnerTexts().then((t) => t.join(",")));
await page.fill("#q", "אנליסט");
await page.waitForTimeout(150);
console.log("search hits:", (await page.locator("#roles .pick .grow").allInnerTexts()).slice(0, 3).join(" | "));
await page.evaluate(() => window.scrollTo(0, 0));
await noPageScroll("settings");
await shot("5-settings");

await page.setViewportSize({ width: 390, height: 844 });
await page.click(".topbar #menu");
await page.waitForTimeout(350);
await shot("6-mobile-menu");
await page.click('.nav-item:has-text("סקירה")');
await page.waitForTimeout(300);
await noPageScroll("mobile overview");
await shot("7-mobile-overview");

console.log("writes:", calls.filter((c) => !c.startsWith("GET")).join(" | "));
await b.close(); server.close();
