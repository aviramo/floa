/* ==========================================================================
   The browser the runner drives, in two places.

   ON YOUR MACHINE (the default): your own Chrome, with a profile folder of its
   own (./.profile, ignored by git). Staying signed in is not something this
   code implements, it is what a Chrome profile already does: sign in once in
   the window opened by the dashboard's connect button, and the cookies are
   there next time, for every agent, because the profile belongs to the account.

   ON A SERVER (RUNNER_ENV=server): there is no Chrome and no screen. The
   browser is Playwright's own Chromium, shown on a virtual screen (xvfb-run),
   still NOT headless: headless is what bot walls look for. A server cannot
   open a window for anyone to sign in at, so the sign-in is done on your
   machine with \`npm run login\`, which writes ./sessions.json, and that file
   is copied to the server. Those are the cookies of the sites you are signed
   in to: they open your accounts. sessions.json is ignored by git, and must
   never be committed or pasted anywhere.

   No password is ever read, typed or stored by this code.
   ========================================================================== */
import { chromium } from "playwright-core";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROFILE = join(HERE, ".profile");
export const SESSIONS = join(HERE, "sessions.json");
export const SERVER = process.env.RUNNER_ENV === "server";

export async function open() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    ...(SERVER ? {} : { channel: "chrome" }),
    headless: false,
    locale: "he-IL",
    viewport: SERVER ? { width: 1366, height: 850 } : null,
  });
  /* On a server the profile starts empty; the cookies come from the file. */
  if (SERVER && existsSync(SESSIONS)) {
    try {
      const { cookies } = JSON.parse(readFileSync(SESSIONS, "utf8"));
      if (cookies?.length) await context.addCookies(cookies);
    } catch {
      /* an unreadable file means "not signed in", and the connection says so */
    }
  }
  return context;
}
