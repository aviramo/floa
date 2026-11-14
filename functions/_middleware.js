import map from "../domains.json";

/* Sub-domains of floa.co.il. The mapping of a host to an app lives in ONE file,
   domains.json (host, folder, clean, old); this only acts on it.

   Every sub-domain is served by THIS Pages project (floa-site), and the old
   address (floa.co.il/chords/ and so on) keeps working because the files have
   not moved.

   On a sub-domain the ROOT is the app: chords.floa.co.il/ shows what is at
   /chords/, with no folder in the bar. It is a rewrite, not a redirect, so
   relative addresses (assets/app.js) resolve against "/" and land in the app's
   folder too. A file the app does not have falls back to the domain's own root
   files (/supabase.js, /auth.js, /favicon.ico). An address that is neither is
   handed to the old path (/chords/<song>), where the domain's 404 router
   already knows what to do with it.

   `clean` hosts also lose the folder from any address that carries it
   (aum.floa.co.il/tal/aum/ goes to aum.floa.co.il/). Chords and Roster route
   /chords/<song> and /roster/<business> themselves, so they keep the folder
   until their own routing learns to live at "/".

   `redirectOld` sends the old floa.co.il addresses on to the sub-domains. */
const HOSTS = map.hosts.filter((h) => h.enabled !== false && h.folder);
const HOMES = Object.fromEntries(HOSTS.map((h) => [h.host, "/" + h.folder]));
const CLEAN = new Set(HOSTS.filter((h) => h.clean).map((h) => h.host));
const SLUGS = new Set(HOSTS.filter((h) => h.slugs).map((h) => h.host));
const RESERVED = ["admin", "connect", "me", "api", "assets", "new", "index"];
const SLUG_PAGES = { "": "admin", connect: "connect", me: "me" };
/* longest folder first, so /tal/ia is not taken for /tal */
const OLD = HOSTS.flatMap((h) => [h.folder, ...(h.old || [])].map((f) => ["/" + f.replace(/\/$/, ""), h.host]))
  .sort((a, b) => b[0].length - a[0].length);

export async function onRequest({ request, next, env }) {
  const url = new URL(request.url);
  const get = request.method === "GET" || request.method === "HEAD";

  if (map.redirectOld && get && (url.hostname === "floa.co.il" || url.hostname === "www.floa.co.il")) {
    for (const [folder, host] of OLD) {
      if (url.pathname === folder || url.pathname.startsWith(folder + "/")) {
        const rest = url.pathname.slice(folder.length);
        const path = (CLEAN.has(host) ? "" : folder) + rest || "/";
        return Response.redirect("https://" + host + path + url.search, 301);
      }
    }
  }

  const home = HOMES[url.hostname];
  if (!home || !get) return next();
  if (url.pathname.startsWith(home) || url.pathname === home.slice(0, -1)) {
    if (!CLEAN.has(url.hostname)) return next();
    /* a FILE (script, style, image) is served as it is: a redirect per file is a
       round trip for nothing */
    if (/\.[a-z0-9]{1,8}$/i.test(url.pathname)) return next();
    const rest = url.pathname.slice(home.length - 1) || "/";
    return Response.redirect(url.origin + rest + url.search, 301);
  }

  /* /<business>, /<business>/connect, /<business>/me: a business is not a file
     (the owner makes them in the browser), so each lands on its page with
     ?biz=, exactly as the domain's 404 router does for /roster/<business> */
  if (SLUGS.has(url.hostname)) {
    const seg = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    const slug = (seg[0] || "").toLowerCase(), sub = (seg[1] || "").toLowerCase();
    if (/^[a-z][a-z0-9-]{1,39}$/.test(slug) && !RESERVED.includes(slug) && seg.length <= 2
        && Object.prototype.hasOwnProperty.call(SLUG_PAGES, sub)) {
      const qs = url.search.replace(/^\?/, "");
      return Response.redirect(url.origin + "/" + SLUG_PAGES[sub] + "/?biz=" + slug + (qs ? "&" + qs : ""), 307);
    }
  }

  const at = (path) => {
    const u = new URL(url);
    u.pathname = path;
    return env.ASSETS.fetch(new Request(u, request));
  };
  const inApp = await at(home.slice(0, -1) + url.pathname);
  if (inApp.status !== 404) return inApp;
  if (url.pathname !== "/") {
    const atRoot = await at(url.pathname);
    if (atRoot.status !== 404) return atRoot;
    return Response.redirect(url.origin + home.slice(0, -1) + url.pathname + url.search, 307);
  }
  return inApp;
}
