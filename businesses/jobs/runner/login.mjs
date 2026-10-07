/* ==========================================================================
   Sign in to the job sites, once, and save the sign-in for a server.

     npm run login

   Opens Chrome on each site. Sign in yourself, in the window; close it when you
   are done. While it is open the cookies are saved to ./sessions.json every few
   seconds, so closing the window loses nothing.

   Copy that file to the server (see README, "להעביר לשרת"). It holds the
   cookies of the sites you signed in to, which open those accounts: it is
   ignored by git and must never be committed, pasted or sent anywhere but the
   server.

   Running everything on this machine needs none of this: the dashboard's
   connect button opens the same window by itself.
   ========================================================================== */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SESSIONS } from "./browser.mjs";

const PROFILE = join(dirname(fileURLToPath(import.meta.url)), ".profile");
/* Always the local Chrome, never the server's: this is the half that has a screen. */
const context = await chromium.launchPersistentContext(PROFILE, { channel: "chrome", headless: false, locale: "he-IL", viewport: null });

const pages = ["https://www.alljobs.co.il/", "https://www.drushim.co.il/", "https://www.linkedin.com/login"];
for (const [i, url] of pages.entries()) {
  const page = i === 0 ? context.pages()[0] || (await context.newPage()) : await context.newPage();
  await page.goto(url).catch(() => {});
}
console.log("התחבר לאתרים בחלון שנפתח, ואחר כך סגור אותו.");

let closed = false;
context.on("close", () => { closed = true; });
let saved = 0;
while (!closed) {
  await new Promise((r) => setTimeout(r, 4000));
  try {
    const state = await context.storageState();
    writeFileSync(SESSIONS, JSON.stringify({ cookies: state.cookies }));
    saved = state.cookies.length;
  } catch {
    /* the window closed between the check and the read */
  }
}
console.log(saved ? `נשמרו ${saved} עוגיות ב-sessions.json. העתק אותו לשרת.` : "לא נשמר כלום.");
