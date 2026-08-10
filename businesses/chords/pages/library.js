/* ==========================================================================
   THE LIBRARY, READ AT BUILD TIME.

   Every song here has always been in the database and nowhere else, which is
   right for an application and wrong for a search engine: a page that exists
   only after a script has run and asked is a page Google is not reliably going
   to have, and until this file existed the app said `noindex` and meant it.

   So the build asks the same question the browser asks, with the same public
   key, over the same row level security: the anon key may read the PUBLISHED
   songs and nothing else, so what comes back here is exactly what a visitor
   would have been shown. There is no second source of truth and no privilege.

   Two things it borrows rather than copies:

     the project   one Supabase project serves the whole domain, and its
                   address lives at the domain root in businesses/floa/domain/
                   supabase.js. The browser loads it as /supabase.js; this
                   reads the same file, so there is one place holding it.

     the model     how a stored song becomes lines, and where each chord sits,
                   is app.js's answer and must not be re-implemented here: a
                   second reader of the format is a second reader to keep true.
                   The pure block is lifted straight out of the shipped file,
                   the way the tests next door do it.
   ========================================================================== */
import { readFile } from "node:fs/promises";

const HERE = new URL("./", import.meta.url);

const APP = new URL("../public/assets/app.js", HERE);
const DOMAIN_DB = new URL("../../floa/domain/supabase.js", HERE);

const src = await readFile(APP, "utf8");

/* From the head of a declaration to the bracket that closes it. Copied in
   spirit from test/credits.test.mjs, and for the same reason: what runs is the
   shipped function, so it cannot drift from the one the app uses. */
function grab(head, open = "{", shut = "}") {
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`chords: could not find ${head} in app.js`);
  let depth = 0;
  for (let j = src.indexOf(open, at); j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === shut) { depth--; if (!depth) return src.slice(at, j + 1) + ";"; }
  }
  throw new Error(`chords: unbalanced ${head} in app.js`);
}

/* The model block: everything between the two banners has no DOM in it, so it
   evaluates on its own. Exactly the slice test/model.test.mjs takes. */
function block(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (a < 0 || b < 0 || b < a) throw new Error("chords: could not find the model block in app.js");
  return src.slice(a, b);
}

const NAMES = ["normalizeLines", "songDir", "withoutGaps", "toChordPro", "GAP", "people"];

export const model = new Function([
  block("var RESERVED_SLUGS", "/* ------------------------------------------------------- rendering a line */"),
  grab("function people("),
].join("\n") + `\nreturn { ${NAMES.join(", ")} };`)();

/* --- the project ---------------------------------------------------------- */
async function project() {
  const file = await readFile(DOMAIN_DB, "utf8");
  const window = {};
  new Function("window", file)(window);
  if (!window.SUPABASE?.url || !window.SUPABASE?.anonKey) {
    throw new Error("chords: businesses/floa/domain/supabase.js did not name a project");
  }
  return window.SUPABASE;
}

/* --- the songs ------------------------------------------------------------
   Published, not deleted, finished. `published` is not asked for: the anon key
   cannot see anything else, and asking would only be a second way to say it.
   The other two are, because they are the author's own words about a song they
   did publish, and a half read page is not one to put in front of a stranger.

   A FAILURE HERE FAILS THE BUILD, on purpose. The alternative is a build that
   quietly publishes a site with no songs in it, which would take every address
   in the sitemap down with it while looking like a success. Nothing published
   means the site stays exactly as it is. */
const FIELDS = "slug,title,lyrics_by,music_by,dir,lines,styles,status,draft,updated_at";

export async function songs() {
  const { url, anonKey } = await project();
  const where = "deleted_at=is.null&order=title.asc";

  const answer = await fetch(`${url}/rest/v1/songs?select=${FIELDS}&${where}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  }).catch((err) => {
    throw new Error(`chords: could not reach the library at ${url} (${err.message})`);
  });

  if (!answer.ok) {
    throw new Error(`chords: the library answered ${answer.status} ${await answer.text()}`);
  }

  const rows = await answer.json();
  return rows
    .filter((row) => row.slug && row.title && (row.status || "ready") === "ready" && !row.draft)
    .filter((row) => nameable(row.slug));
}

/* A slug is a folder on disk and a folder in a URL. slugify() in the app keeps
   these out, but a song written before it did, or by hand in the database,
   could still carry one, and a page whose address contains a slash is a page
   written somewhere nobody meant. Left out rather than mangled: the app serves
   it as it always did, through the 404, and only the crawler misses it. */
const BAD = /[\\/?%*:|"<>#]|^\.|[\s.]$/;

export const nameable = (name) => !BAD.test(String(name || ""));
