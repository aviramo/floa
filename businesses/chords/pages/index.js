/* ==========================================================================
   Chords ships a hand-built application, not engine-rendered pages.

   public/index.html and public/assets/ are copied verbatim into dist/chords/,
   and every song page is that same file, routed on the client. So there are no
   engine `pages` here.

   `siteMap` is empty on purpose too: the song list lives in a database, not in
   the build, so the build cannot honestly name a single URL. Nothing here ever
   enters FLOA's sitemap.
   ========================================================================== */

export const pages = [];

export const siteMap = [];

/* No form, no leads. An empty list is what makes that a rule and not a habit:
   the Worker validates a lead's page against it, and nothing matches. */
export const leadPages = [];
