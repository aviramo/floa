/* Sub-domains of floa.co.il. Every one of them is served by THIS Pages project
   (floa-site), and the old address (floa.co.il/chords/ and so on) keeps working
   because the files have not moved.

   On a sub-domain the ROOT is the app: chords.floa.co.il/ shows what is at
   /chords/, with no folder in the bar. It is a rewrite, not a redirect, so
   relative addresses (assets/app.js) resolve against "/" and land in the app's
   folder too. A file the app does not have falls back to the domain's own root
   files (/supabase.js, /auth.js, /favicon.ico). An address that is neither is
   handed to the old path (/chords/<song>), where the domain's 404 router
   already knows what to do with it. Links the apps write with their folder in
   them (/roster/admin/) keep working as they always did.

   Keep in step with domains.json (a host added there needs a line here). */
const HOMES = {
  "chords.floa.co.il": "/chords/",
  "jobs.floa.co.il": "/jobs/",
  "roster.floa.co.il": "/roster/",
  "biofamily.floa.co.il": "/biofamily/",
  "tal.floa.co.il": "/tal/",
  "taltalia.floa.co.il": "/tal/ia/",
  "aum.floa.co.il": "/tal/aum/",
};

/* Sub-domains where the folder is also taken OUT of an address that carries it
   (aum.floa.co.il/tal/aum/ goes to aum.floa.co.il/). Only for apps whose pages
   are all plain files. Chords and Roster route /chords/<song> and
   /roster/<business> themselves, so for those the folder stays until their own
   routing learns to live at "/". */
const CLEAN = new Set(["jobs.floa.co.il", "biofamily.floa.co.il", "tal.floa.co.il", "taltalia.floa.co.il", "aum.floa.co.il"]);

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const home = HOMES[url.hostname];
  if (!home || (request.method !== "GET" && request.method !== "HEAD")) return next();
  if (url.pathname.startsWith(home) || url.pathname === home.slice(0, -1)) {
    if (!CLEAN.has(url.hostname)) return next();
    const rest = url.pathname.slice(home.length - 1) || "/";
    return Response.redirect(url.origin + rest + url.search, 301);
  }

  const at = (path) => {
    const u = new URL(url);
    u.pathname = path;
    return env.ASSETS.fetch(new Request(u, request));
  };
  const inApp = await at(home.slice(0, -1) + (url.pathname === "/" ? "/" : url.pathname));
  if (inApp.status !== 404) return inApp;
  if (url.pathname !== "/") {
    const atRoot = await at(url.pathname);
    if (atRoot.status !== 404) return atRoot;
    return Response.redirect(url.origin + home.slice(0, -1) + url.pathname + url.search, 307);
  }
  return inApp;
}
