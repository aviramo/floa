/* ==========================================================================
   The domain's database.

   ONE Supabase project serves all of floa.co.il, not one per business. That is
   why this file sits in apps/floa/domain/ and is copied to the ROOT of
   the domain, next to robots.txt, the favicons, sw.js and the CNAME: it belongs
   to the domain, not to the business that happens to be reading it first.

   Any page on floa.co.il that needs the database loads it as an absolute path,
   before its own script:

       <script src="/supabase.js"></script>

   and then talks to Supabase's REST and auth endpoints directly:

       fetch(SUPABASE.url + "/rest/v1/<table>?select=*", {
         headers: { apikey: SUPABASE.anonKey, authorization: "Bearer " + token }
       })

   The anon key is PUBLIC by design. It names the project, it does not grant
   anything: what a holder of it may actually do is decided by the row level
   security policies on each table, and reading is usually all it can do. The
   service role key is a different key entirely and must never appear here, or
   anywhere else in this repo, which is public.

   A new business that wants a table of its own adds it with its own policies
   (see apps/chords/schema.sql for the shape) and names it for itself, so
   two businesses can never quietly share one.
   ========================================================================== */
window.SUPABASE = {
  url: "https://aexmnaxvahblveejsbup.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleG1uYXh2YWhibHZlZWpzYnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzE5MjMsImV4cCI6MjEwMTU0NzkyM30.oXPojzklAqOl9pvH5R_GNGTda6OvYruDQjMLprcBA0Y",
};

/* One schema per app, named for its sub-domain (roster.floa.co.il -> roster, roster-test.floa.co.il ->
   roster-test). An app listed in SCHEMAS gets its schema on every REST call without knowing about it: the
   headers are added here, once, so no app repeats them. Tables inside a schema carry no app prefix
   (roster.participants, not roster.roster_participants). An app that is not listed keeps `public`.
   On localhost and the old floa.co.il/<app>/ address the first folder of the path stands in for the host;
   on localhost the roster app is pointed at roster-test, so local work never changes real data. */
(function () {
  if (typeof location === "undefined") return;   /* the build reads this file too, with no browser */
  var SCHEMAS = ["roster", "roster-test", "chords", "jobs", "biodanza"];
  var label = location.hostname.split(".")[0];
  var folder = location.pathname.split("/")[1] || "";
  var s = SCHEMAS.indexOf(label) >= 0 ? label : SCHEMAS.indexOf(folder) >= 0 ? folder : "";
  /* a local copy of the page (npm run dev) never touches the real roster: it works on the test schema */
  if (s === "roster" && /^(localhost|127\.|\[::1\]|192\.168\.|10\.)/.test(location.hostname)) s = "roster-test";
  window.SUPABASE.schema = s;
  /* every test environment (roster-test.floa.co.il, and any local copy) wears a thin strip at the very top, so nobody mistakes it for the real thing.
     It sits in the empty padding above the header, takes no room of its own and never takes a tap. */
  if (s === "roster-test") {
    var strip = function () {
      if (document.getElementById("floaTestEnv")) return;
      var d = document.createElement("div");
      d.id = "floaTestEnv"; d.setAttribute("role", "note");
      d.textContent = "סביבת בדיקות · נתונים נפרדים מהאמיתיים";
      d.style.cssText = "position:fixed;top:0;left:0;right:0;height:13px;z-index:2147483647;background:#3F382F;color:#fff;font:600 10px/13px system-ui,sans-serif;text-align:center;pointer-events:none;border:0;border-radius:0;box-shadow:none";
      document.body.appendChild(d);
    };
    if (document.body) strip(); else document.addEventListener("DOMContentLoaded", strip);
  }
  if (!s || !window.fetch) return;
  var of = window.fetch;
  window.fetch = function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (url.indexOf(window.SUPABASE.url + "/rest/v1/") === 0) {
        var h = new Headers((init && init.headers) || (input && input.headers) || {});
        h.set("Accept-Profile", s); h.set("Content-Profile", s);
        init = Object.assign({}, init || {}, { headers: h });
      }
    } catch (e) {}
    return of.call(this, input, init);
  };
})();
