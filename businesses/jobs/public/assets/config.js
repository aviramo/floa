/* What the app needs from outside. The database is NOT here: it is the
   domain's, loaded from /supabase.js. */
window.JOBS_CONFIG = {
  supabaseUrl: window.SUPABASE.url,
  supabaseAnonKey: window.SUPABASE.anonKey,
  agentsTable: "job_agents",
  bucket: "job-cvs",
  parseEndpoint: "https://floa-lead.floa-il.workers.dev/parse-cv",
  /* the app lives at /jobs/ */
  base: "/jobs/",

  /* The roles an agent is picked from are not written here: they are Drushim's
     own list of fields and roles, in assets/roles.json (made by
     runner/roles.mjs). The CV reader chooses from the same list. */
  rolesFile: "assets/roles.json",

  /* The cities, from GeoNames (runner/cities-build.mjs), each with a position
     so that a radius means something. */
  citiesFile: "assets/cities.json"
};
