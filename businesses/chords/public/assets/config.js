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

  /* the tables this app owns inside that project: the library, and the
     evenings of singing planned out of it */
  table: "songs",
  setlistTable: "setlists",

  /* The Worker holds the Anthropic key and reads an uploaded photo or PDF.
     Same deployment that sends the leads for every other business here. */
  transcribeEndpoint: "https://floa-lead.floa-il.workers.dev/transcribe",

  /* Where the app is mounted. Every route is relative to this. */
  base: "/chords",
};
