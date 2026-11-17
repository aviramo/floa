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
const ICONS = Object.fromEntries(HOSTS.filter((h) => h.icons).map((h) => [h.host, h.icons]));
const SPA = new Set(HOSTS.filter((h) => h.spa).map((h) => h.host));
const TEST = new Set(HOSTS.filter((h) => h.test).map((h) => h.host));
const SLUGS = new Set(HOSTS.filter((h) => h.slugs).map((h) => h.host));
const RESERVED = ["admin", "connect", "me", "api", "assets", "new", "index"];
const DOMAIN_FILES = new Set(["/supabase.js", "/auth.js", "/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/sw.js", "/robots.txt", "/404.html", "/__test-env.js"]);
const SLUG_PAGES = { "": "admin", connect: "connect", me: "me" };
/* longest folder first, so /tal/ia is not taken for /tal */
const OLD = HOSTS.filter((h) => !h.test).flatMap((h) => [h.folder, ...(h.old || [])].map((f) => ["/" + f.replace(/\/$/, ""), h.host]))
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
  /* each sub-domain is a site of its own to a crawler: its own robots.txt,
     naming its own sitemap (the app's sitemap.xml, if it has one) */
  if (url.pathname === "/robots.txt") {
    if (TEST.has(url.hostname)) return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
    const sm = await env.ASSETS.fetch(new Request(new URL(home + "sitemap.xml", url), request));
    return new Response("User-agent: *\nAllow: /\n" + (sm.status === 200 ? "\nSitemap: " + url.origin + "/sitemap.xml\n" : ""),
      { headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  /* the host's own icon at the root, where WhatsApp, Google and browsers ask for it */
  const icon = ICONS[url.hostname] && ICONS[url.hostname][url.pathname];
  if (icon) {
    const u = new URL(url);
    u.pathname = icon.startsWith("/") ? icon : home + icon;
    const r = await env.ASSETS.fetch(new Request(u, request));
    if (r.status !== 404) return r;
  }

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
      /* the business's own page (/<business>) is served IN PLACE: the admin page under this address, with the
         address kept (no hop through /admin/?biz= and back). A <base> pins every relative address (assets,
         ../assets, links) to /admin/, exactly where the page lives; the page reads the business from the path. */
      if (sub === "") {
        const page = await env.ASSETS.fetch(new Request(new URL(home + "admin/", url), request));
        if (page.status === 200) {
          return new HTMLRewriter().on("head", { element(el) { el.prepend('<base href="/admin/">', { html: true }); } }).transform(page);
        }
      }
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

  /* the few files that belong to the DOMAIN, not to an app */
  if (DOMAIN_FILES.has(url.pathname) || url.pathname.startsWith("/floa/")) {
    const atRoot = await at(url.pathname);
    if (atRoot.status !== 404) return atRoot;
  }

  /* an address that belongs to ANOTHER app goes to that app's sub-domain
     (a link on Roster to /tal/aum/ lands on aum.floa.co.il) */
  for (const [folder, host] of OLD) {
    if (host !== url.hostname && (url.pathname === folder || url.pathname.startsWith(folder + "/"))) {
      const rest = url.pathname.slice(folder.length);
      return Response.redirect("https://" + host + ((CLEAN.has(host) ? "" : folder) + rest || "/") + url.search, 301);
    }
  }

  /* an app that routes by the address itself (Chords: a playlist, an editor, a
     song written a minute ago) gets its front page, and reads the address */
  if (SPA.has(url.hostname) && !/\.[a-z0-9]{1,8}$/i.test(url.pathname)) {
    return at(home);
  }
  /* a clean sub-domain has nothing more to try, and a redirect here would only
     be sent back by the strip rule above: a loop */
  if (!CLEAN.has(url.hostname) && url.pathname !== "/") {
    return Response.redirect(url.origin + home.slice(0, -1) + url.pathname + url.search, 307);
  }
  if (CLEAN.has(url.hostname)) {
    const page = await at("/404.html");
    return new Response(page.body, { status: 404, headers: page.headers });
  }
  return inApp;
}
