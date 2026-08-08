/* ==========================================================================
   What this app needs to know about the outside world.

   The database is NOT here. One Supabase project serves the whole domain and
   its address lives at the domain root, in /supabase.js (source:
   businesses/floa/domain/supabase.js). This file only names the parts that are
   the app's own.
   ========================================================================== */
window.CHORDS_CONFIG = {
  /* the shared project, loaded a moment earlier from /supabase.js */
  supabaseUrl: window.SUPABASE.url,
  supabaseAnonKey: window.SUPABASE.anonKey,

  /* The tables this app owns inside that project: the library, the evenings of
     singing planned out of it, every version of a song that was published, and
     what the readings cost, which is a table of its own because only the
     account that pays for them may read it. */
  table: "songs",
  setlistTable: "setlists",
  versionTable: "song_versions",
  costTable: "song_costs",

  /* And a fifth, which is not about songs at all: what to call an account
     where somebody OTHER than that account has to be shown its name. A song
     says who put it in the library, and the column it says it in is a uuid;
     the name behind that uuid lives in auth.users, which nobody but the
     account itself may read. See `people` in schema.sql. */
  peopleTable: "people",

  /* The Worker holds the Anthropic key and reads an uploaded photo or PDF.
     Same deployment that sends the leads for every other business here. */
  transcribeEndpoint: "https://floa-lead.floa-il.workers.dev/transcribe",

  /* Where the app is mounted. Every route is relative to this. */
  base: "/chords",
};
