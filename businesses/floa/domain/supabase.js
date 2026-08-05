/* ==========================================================================
   The domain's database.

   ONE Supabase project serves all of floa.co.il, not one per business. That is
   why this file sits in businesses/floa/domain/ and is copied to the ROOT of
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
   (see businesses/chords/schema.sql for the shape) and names it for itself, so
   two businesses can never quietly share one.
   ========================================================================== */
window.SUPABASE = {
  url: "https://aexmnaxvahblveejsbup.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFleG1uYXh2YWhibHZlZWpzYnVwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5NzE5MjMsImV4cCI6MjEwMTU0NzkyM30.oXPojzklAqOl9pvH5R_GNGTda6OvYruDQjMLprcBA0Y",
};
