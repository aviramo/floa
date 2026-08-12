/* ==========================================================================
   Chords ships a hand-built application, and every address it has is written
   to disk.

   IT USED TO SHIP ONE FILE AND SAY `noindex`. public/index.html was copied
   verbatim, every address was that same file routed on the client, and the
   songs lived in a database the build never asked. Which meant the library was
   unfindable: a page that exists only after a script has run and a request has
   come back is a page a search engine may or may not ever have, and saying so
   was more honest than pretending.

   So the build asks. `pages` and `siteMap` are FUNCTIONS here, which is what
   the engine offers a business whose pages are not files (see listOf in
   build.mjs), and they are resolved once between them: one request to Supabase
   per build, with the public key, over the same row level security a visitor
   gets. What comes back becomes:

     /chords/                    the library, with a link to every song
     /chords/<שיר>/              the song, words and chords in the page
     /chords/style/<סוג>/        one shelf of it
     /chords/creator/<שם>/       one person, and everything they wrote
     /chords/creators/           all of them

   None of that replaces the app. Each of those files is the app's own shell
   with the words already in it, and app.js takes the words out and draws the
   real page over them the moment it starts. What a person gets is unchanged.

   Everything else under /chords/ is still the app alone, and still arrives
   through the domain's 404: a playlist, a version, an editor, a song written
   in the last minute. A private page is not in a sitemap and a page that
   changes every minute is not worth a file.
   ========================================================================== */
import { nameable, songs as library } from "./library.js";
import {
  creatorPage, creatorsPage, indexPage, songPage, songSaid, stylePage,
} from "./song.js";
import { creators, styles, url } from "./render.js";

/* ONE ASK. `pages` and `siteMap` are two questions about the same library, and
   the build asks both; a second request would be a second answer, and two
   answers a minute apart could disagree about what is published. */
let asked = null;
const shelves = () => (asked ??= library().then((songs) => ({
  songs,
  kinds: onDisk(styles(songs), "סוג"),
  who: onDisk(creators(songs), "יוצר"),
})));

/* A shelf's name is a folder, and a name is free text: somebody typed
   "עברית: אוהד קוזלובסקי" into a credit, and a colon is not a thing a folder
   can be called on every machine that builds this. Such a shelf gets no file
   of its own and is said out loud rather than dropped in silence. Nothing is
   lost from the app: it draws that page from the database like any other, the
   way every address here worked before any of them were written down. */
function onDisk(shelves, what) {
  const kept = shelves.filter((shelf) => nameable(shelf.name));
  for (const gone of shelves.filter((shelf) => !nameable(shelf.name))) {
    console.warn(`  ! chords: ${what} "${gone.name}" cannot be a folder, so it gets no page of its own`);
  }
  return kept;
}

export const pages = async () => {
  const { songs, kinds, who } = await shelves();
  return [
    { out: "index.html", render: () => indexPage(songs) },
    ...songs.map((song) => ({ out: `${song.slug}/index.html`, render: () => songPage(song) })),
    ...kinds.map((kind) => ({ out: `style/${kind.name}/index.html`, render: () => stylePage(kind) })),
    ...who.map((one) => ({ out: `creator/${one.name}/index.html`, render: () => creatorPage(one) })),
    ...(who.length ? [{ out: "creators/index.html", render: () => creatorsPage(who) }] : []),
  ];
};

/* Every address above, once. sitemap.xml and llms.txt are generated from this
   in build.mjs, and robots.txt at the root of the domain names the file, which
   is the only way a folder's sitemap is ever found. */
export const siteMap = async () => {
  const { songs, kinds, who } = await shelves();
  return [
    { loc: url(), title: "אקורדים", description: "אינדקס שירים עם אקורדים, כל שיר בדף משלו והאקורדים בדיוק מעל המילים." },
    ...songs.map((song) => ({ loc: url(song.slug), ...songSaid(song) })),
    ...kinds.map((kind) => ({ loc: url("style", kind.name), title: kind.name, description: `כל השירים מסוג ${kind.name} באינדקס האקורדים.` })),
    ...who.map((one) => ({ loc: url("creator", one.name), title: one.name, description: `השירים ש${one.name} כתב או הלחין, עם האקורדים.` })),
    ...(who.length ? [{ loc: url("creators"), title: "מי כתב", description: "כל מי שכתב או הלחין שיר באינדקס." }] : []),
  ];
};

/* No form, no leads. An empty list is what makes that a rule and not a habit:
   the Worker validates a lead's page against it, and nothing matches. */
export const leadPages = [];
