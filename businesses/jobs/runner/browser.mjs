/* ==========================================================================
   The browser the runner drives: the person's own Chrome, with a profile folder
   of its own (./.profile, ignored by git).

   Staying signed in is not something this code implements. It is what a
   Chrome profile already does: log in once in the window opened by
   `npm run login`, and the cookies are there the next time, for every agent,
   because the profile belongs to the account and not to an agent. No password
   is ever read, typed or stored by this code.

   The window is VISIBLE on purpose. Headless Chrome is what bot walls look
   for; a real window is what a person uses, and it is also how a person can
   step in when a site asks something only a person can answer.
   ========================================================================== */
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PROFILE = join(dirname(fileURLToPath(import.meta.url)), ".profile");

export function open() {
  return chromium.launchPersistentContext(PROFILE, {
    channel: "chrome",
    headless: false,
    locale: "he-IL",
    viewport: null,
  });
}
