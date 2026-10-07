/* ==========================================================================
   Sign in to the job sites, once.

     npm run login

   Opens the runner's Chrome on each site's login page. Sign in yourself, in
   the window; close it when you are done. The profile remembers you.
   ========================================================================== */
import { open } from "./browser.mjs";

const context = await open();
const pages = [
  "https://www.alljobs.co.il/",
  "https://www.drushim.co.il/",
  "https://www.linkedin.com/login",
];
for (const [i, url] of pages.entries()) {
  const page = i === 0 ? context.pages()[0] || (await context.newPage()) : await context.newPage();
  await page.goto(url).catch(() => {});
}
console.log("התחבר לאתרים בחלון שנפתח, ואחר כך סגור אותו.");
await new Promise((resolve) => context.on("close", resolve));
console.log("נשמר.");
