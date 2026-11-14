/* ==========================================================================
   The job sites: how to search each one, and how to send to it.

   Each site is a search and an apply, and both read the page the way a person
   would. They are the fragile part of this app: a redesign on the other side
   breaks them, and nothing here can be fixed from our end. So every function
   returns what it could do and says what it could not, instead of guessing.

   NEVER solved here: captchas and bot walls. If a site puts one up the run
   stops on that site and says so; a person solves it in the open window.
   ========================================================================== */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const pause = (page, ms = 1200) => page.waitForTimeout(ms + Math.random() * 800);

/* "מפתח/ת Full Stack" is how a role is NAMED; sites are searched by what an ad
   would say. */
const searchTerm = (role) => role.replace(/\s*\/\s*(ת|ה|ית|ות)(?![א-ת])/g, "").replace(/\s+/g, " ").trim();

/* --- AllJobs --------------------------------------------------------------- */
const alljobs = {
  key: "alljobs",
  name: "AllJobs",

  async search(page, roles, limit = 30) {
    const found = [];
    for (const role of roles) {
      const url = "https://www.alljobs.co.il/SearchResultsGuest.aspx?page=1&position=&type=&city=&region=&freetxt=" +
        encodeURIComponent(searchTerm(role));
      await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      await page.waitForSelector(".job-box", { timeout: 20000 }).catch(() => {});
      await pause(page, 800);
      const rows = await page.evaluate(() => [...document.querySelectorAll(".job-box")].map((box) => {
        const link = box.querySelector(".job-content-top-title a[href*='JobID=']");
        if (!link) return null;
        const text = (sel) => (box.querySelector(sel)?.innerText || "").replace(/\s+/g, " ").trim();
        return {
          url: link.href,
          title: link.innerText.trim(),
          company: text(".job-content-top-title .T14"),
          location: text(".job-content-top-location").replace(/^מיקום המשרה:\s*/, ""),
          description: text(".job-content-top-desc"),
        };
      }).filter(Boolean));
      found.push(...rows.slice(0, limit).map((r) => ({ ...r, source: "alljobs" })));
    }
    return found;
  },

  /* AllJobs' own button on the job page. Needs the person logged in. */
  async apply(page, job) {
    await page.goto(job.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    await pause(page, 2000);
    const button = page.locator("text=/שליחת קורות חיים|שלח קורות חיים|הגשת מועמדות/").first();
    if (!(await button.count())) return { status: "manual", note: "לא נמצא כפתור שליחה בדף" };
    await button.click().catch(() => {});
    await pause(page, 2500);
    const text = await page.evaluate(() => document.body.innerText);
    if (/התחבר|כניסה|הרשמה/.test(text) && !/נשלחו|נשלח בהצלחה/.test(text)) {
      return { status: "manual", note: "נדרשת התחברות לאתר" };
    }
    if (/נשלחו|נשלח בהצלחה/.test(text)) return { status: "sent", note: "" };
    return { status: "manual", note: "לא ברור אם נשלח, כדאי לבדוק באתר" };
  },
};

/* A role chosen in the dashboard is one of Drushim's own, so Drushim can be asked
   for it by code (/jobs/subcat/<code>/), which is exact, instead of by words. */
const CODES = new Map();
try {
  const { fields } = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "assets", "roles.json"), "utf8"));
  for (const f of fields) for (const r of f.roles) CODES.set(r.name, r.drushim);
} catch {
  /* no catalog: Drushim is searched by words */
}

/* --- Drushim --------------------------------------------------------------- */
const drushim = {
  key: "drushim",
  name: "דרושים",

  async search(page, roles, limit = 30) {
    const found = [];
    for (const role of roles) {
      const codes = (CODES.get(role) || []).slice(0, 2);
      const urls = codes.length
        ? codes.map((c) => "https://www.drushim.co.il/jobs/subcat/" + c + "/")
        : ["https://www.drushim.co.il/jobs/search/" + encodeURIComponent(searchTerm(role)) + "/"];
      for (const url of urls) {
      await page.goto(url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      await pause(page, 4000);
      if (/captcha/i.test(await page.title())) throw new Error("דרושים הציג בדיקת בוט");
      const rows = await page.evaluate(() => {
        const seen = new Set();
        const out = [];
        for (const a of document.querySelectorAll("a[href*='/job/']")) {
          if (seen.has(a.href)) continue;
          let card = a;
          for (let i = 0; i < 4 && card.parentElement; i++) card = card.parentElement;
          const lines = card.innerText.split("\n").map((s) => s.trim()).filter(Boolean);
          const title = lines[0] || "";
          if (!title || seen.has(a.href)) continue;
          seen.add(a.href);
          out.push({
            url: a.href,
            title,
            company: lines[1] || "",
            location: lines[2] || "",
            description: lines.slice(3).join(" ").slice(0, 1500),
          });
        }
        return out;
      });
      found.push(...rows.slice(0, limit).map((r) => ({ ...r, source: "drushim" })));
      }
    }
    return found;
  },

  async apply(page, job) {
    await page.goto(job.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    await pause(page, 3000);
    if (/captcha/i.test(await page.title())) return { status: "manual", note: "בדיקת בוט באתר" };
    const button = page.locator("text=/הגשת מועמדות|שליחת קורות חיים/").first();
    if (!(await button.count())) return { status: "manual", note: "לא נמצא כפתור הגשה בדף" };
    await button.click().catch(() => {});
    await pause(page, 2500);
    const text = await page.evaluate(() => document.body.innerText);
    if (/התחבר|כניסה|הרשמה/.test(text) && !/נשלחו|נשלח בהצלחה|הוגשה/.test(text)) {
      return { status: "manual", note: "נדרשת התחברות לאתר" };
    }
    if (/נשלחו|נשלח בהצלחה|הוגשה/.test(text)) return { status: "sent", note: "" };
    return { status: "manual", note: "לא ברור אם נשלח, כדאי לבדוק באתר" };
  },
};

export const SITES = { alljobs, drushim };
