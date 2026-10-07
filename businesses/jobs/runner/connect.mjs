/* ==========================================================================
   Signing in to a job site, from the dashboard.

   The person presses "התחבר" on a site. That writes a row; this opens the
   runner's Chrome on that site's login page, on the person's own machine, and
   waits while THEY sign in. The profile folder keeps the cookies, so it is
   done once and every agent uses it.

   Nothing typed in that window is read, and nothing but a status is written to
   the database. Whether a person is signed in is worked out from the page the
   way they would: the site offers to sign out. LinkedIn is the exception, it
   keeps a cookie that exists only while signed in.
   ========================================================================== */
import { lit, sql } from "./db.mjs";
import { open, SERVER } from "./browser.mjs";

const SITES = {
  alljobs: { name: "AllJobs", url: "https://www.alljobs.co.il/" },
  drushim: { name: "דרושים", url: "https://www.drushim.co.il/" },
  linkedin: { name: "LinkedIn", url: "https://www.linkedin.com/login", cookie: "li_at" },
};

const WAIT_MS = 10 * 60 * 1000; // how long a window may stay open for a person to sign in

async function signedIn(context, site) {
  if (site.cookie) return (await context.cookies()).some((c) => c.name === site.cookie);
  for (const page of context.pages()) {
    try {
      if (/התנתק|יציאה מהחשבון|Sign out/.test(await page.evaluate(() => document.body.innerText))) return true;
    } catch {
      /* the page was navigating */
    }
  }
  return false;
}

const set = (owner, site, status, note = "") =>
  sql(
    `update job_connections set status = ${lit(status)}, note = ${lit(note)}, updated_at = now() ` +
      `where owner = ${lit(owner)} and site = ${lit(site)}`,
  );

/* One request, if there is one. Returns whether it did anything. */
export async function connections(log) {
  const [row] = await sql(
    `update job_connections set status = 'connecting', updated_at = now() ` +
      `where (owner, site) = (select owner, site from job_connections where status = 'requested' order by updated_at limit 1) returning *`,
  );
  if (!row) return false;
  const site = SITES[row.site];
  log("חיבור:", site.name);

  /* On a server there is no window to sign in at. The sign-in was done on the
     person's own machine (npm run login) and its cookies copied here, so
     "connect" means: check that they still open the site. */
  if (SERVER) {
    const check = await open();
    try {
      const page = check.pages()[0] || (await check.newPage());
      await page.goto(site.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      await page.waitForTimeout(4000);
      if (await signedIn(check, site)) {
        await set(row.owner, row.site, "connected");
        log("מחובר:", site.name);
      } else {
        await set(row.owner, row.site, "disconnected", "לא זוהתה התחברות בשרת. הרץ npm run login במחשב והעתק את sessions.json לשרת");
        log("לא מחובר בשרת:", site.name);
      }
    } catch (err) {
      await set(row.owner, row.site, "disconnected", String(err.message).slice(0, 150));
    } finally {
      await check.close().catch(() => {});
    }
    return true;
  }

  const context = await open();
  let closed = false;
  context.on("close", () => { closed = true; });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(site.url, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    const until = Date.now() + WAIT_MS;
    let seen = false;
    while (!closed && Date.now() < until) {
      if (await signedIn(context, site)) { seen = true; break; }
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (seen) {
      await set(row.owner, row.site, "connected");
      log("מחובר:", site.name);
    } else {
      await set(row.owner, row.site, "disconnected", closed ? "החלון נסגר לפני שזוהתה התחברות" : "עבר הזמן בלי התחברות");
      log("לא זוהתה התחברות:", site.name);
    }
  } catch (err) {
    await set(row.owner, row.site, "disconnected", String(err.message).slice(0, 150));
  } finally {
    if (!closed) await context.close().catch(() => {});
  }
  return true;
}

/* A send that found the site asking to sign in again marks the connection, so
   the dashboard says so instead of failing in silence. */
export const expire = (owner, site) => set(owner, site, "expired", "האתר ביקש להתחבר מחדש");
