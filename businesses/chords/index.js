import { runtime, site } from "./content/site.js";
import { leadPages, pages, siteMap } from "./pages/index.js";

/* ==========================================================================
   Chords, an application rather than a marketing site.

   It is a MANUAL business in the sense of CLAUDE.md: the generator copies
   public/ verbatim into dist/chords/ and renders nothing. What lands there is
   a single page that reads and writes songs in Supabase and routes itself.

   Two things it shares with the rest of the domain:

     the Worker   /transcribe turns an uploaded photo or PDF into a song, and
                  the key that does it must never be in a browser. `origins`
                  below is what lets the app post to it at all.

     the 404      a song lives at /chords/<slug>, and GitHub Pages has no file
                  there. businesses/floa/domain/404.html hands those paths back
                  to this app. See the "כתובת לכל שיר" section of CLAUDE.md.

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
