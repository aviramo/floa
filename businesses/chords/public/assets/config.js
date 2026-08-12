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

  /* The tables this app owns inside that project: the library, the playlists
     made out of it, every version of a song that was published, and what the
     readings cost, which is a table of its own because only the account that
     pays for them may read it. */
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

  /* And a sixth, which is not about a song either: which songs an account has
     opened, latest first, one row per account. It is what puts the song you
     had open last at the front of the library, on whatever screen you open it
     next (see sawSong in app.js). */
  openTable: "song_opens",

  /* And a seventh, which is not a fact about a song but a person playing one:
     a take. What is kept is the sound AND the times, every moment the mark
     moved and the chord it moved to, which is what turns playing it back into
     the page moving through the song exactly as it moved while it was played.
     The sound itself is too big for a row, so it lives in a bucket and the row
     holds the path. See song_takes in schema.sql. */
  takeTable: "song_takes",
  takeBucket: "takes",

  /* And an eighth, which is how somebody who does not own a song changes it.
     A song is written by the account it belongs to and by nobody else; an edit
     by anybody else lands here instead, as an offer, and the song moves only
     when its own account takes it. See song_offers in schema.sql. */
  offerTable: "song_offers",

  /* And a ninth, which is not about a song either but about a person playing
     one: which key they sing it in, and therefore which fret their capo is on.
     One row per account holding a map of song id to the pair, because the key
     somebody sings a song in follows them from the desk to the phone and is
     not a fact about the song. See song_keys in schema.sql, and keptFor in
     app.js. */
  keyTable: "song_keys",

  /* The Worker holds the Anthropic key and reads an uploaded photo or PDF.
     Same deployment that sends the leads for every other business here. */
  transcribeEndpoint: "https://floa-lead.floa-il.workers.dev/transcribe",

  /* Where the app is mounted. Every route is relative to this. */
  base: "/chords",
};
