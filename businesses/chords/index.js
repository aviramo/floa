import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   Chords, an application rather than a marketing site.

   It is a MANUAL business in the sense of CLAUDE.md: nothing here is composed
   from the shared components, and the whole look lives in public/, which is
   copied verbatim into dist/chords/. What it is NOT any more is a single file:
   the library lives in a database, and a page that exists only after a script
   has asked is a page a search engine may never have, so the build asks too
   and writes every address to disk (see pages/index.js). Each of those files
   is the app's own shell with the words already in it.

   Three things it shares with the rest of the domain:

     the database one Supabase project serves all of floa.co.il. The browser
                  loads it from /supabase.js; the build reads the same file.

     the Worker   /transcribe turns an uploaded photo or PDF into a song, and
                  the key that does it must never be in a browser. `origins`
                  below is what lets the app post to it at all.

     the 404      everything the build cannot know is still routed by
                  businesses/floa/domain/404.html: an evening, a version, an
                  editor, a song added since the last build.

   `lead.to` names FLOA's own inbox and `leadPages` is empty, which together
   mean no lead can ever be sent in this business's name: the Worker validates
   the page against that list and an empty list matches nothing. Chords has no
   form and wants none.
   ========================================================================== */
export const business = {
  key: "chords",
  out: "chords",
  root: false,

  lead: {
    to: "LEAD_TO",
    origins: ["https://floa.co.il", "https://www.floa.co.il", "http://localhost:5173"],
  },

  site,
  runtime,
  pages,
  siteMap,
  leadPages,
};
