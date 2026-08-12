/* ==========================================================================
   What each address says about itself.

   A title, a sentence, and a description of the thing in the words a machine
   reads (schema.org). Written here rather than inside the seeds because these
   are answers about the page, and the seed is the page itself.

   The wording is aimed at what somebody actually types: "שם השיר אקורדים". So
   the name of the song comes first and the word אקורדים stands beside it, and
   the sentence underneath says who wrote it and how it starts, which is what
   tells two songs of the same name apart in a list of results.
   ========================================================================== */
import {
  composers, creditLine, href, indexSeed, jsonLd, list, lyricists, page,
  shelfSeed, songSeed, trim, url, words,
} from "./render.js";

const SITE = "אקורדים";
const PROMISE = "האקורדים בדיוק מעל המילים";

const person = (name) => ({ "@type": "Person", name });

/* --- one song -------------------------------------------------------------- */
export function songSaid(song) {
  const credit = creditLine(song);
  const opening = words(song)[0] || "";
  return {
    title: `${song.title}, אקורדים ומילים`,
    description: trim([`אקורדים ומילים ל${song.title}`, credit, opening].filter(Boolean).join(". ")),
  };
}

export function songPage(song) {
  const said = songSaid(song);
  const canonical = url(song.slug);
  const tune = composers(song);
  const written = lyricists(song);

  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: song.title,
    url: canonical,
    inLanguage: song.dir === "ltr" ? "en" : "he",
    ...(written.length ? { lyricist: written.map(person) } : {}),
    ...(tune.length ? { composer: tune.map(person) } : {}),
    ...(song.styles?.length ? { genre: song.styles } : {}),
    isPartOf: { "@type": "CollectionPage", name: SITE, url: url() },
  });

  return page({ ...said, canonical, head: ld, seed: songSeed(song) });
}

/* --- the library ----------------------------------------------------------- */
export function indexPage(songs) {
  const canonical = url();
  const ld = jsonLd({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: SITE,
    url: canonical,
    inLanguage: "he",
    description: `אינדקס שירים עם אקורדים, ${PROMISE}.`,
    hasPart: songs.map((song) => ({ "@type": "MusicComposition", name: song.title, url: url(song.slug) })),
  });

  return page({
    title: `${SITE}, אינדקס שירים`,
    description: `אינדקס שירים עם אקורדים. כל שיר בדף משלו, ${PROMISE}.`,
    canonical,
    head: ld,
    seed: indexSeed(songs),
  });
}

/* --- one person, and everybody ---------------------------------------------
   There is no table of creators: a person is what the songs say, gathered (see
   creators in render.js, and creatorsOf in app.js, which is the same answer for
   the same reason). So a name that stops appearing on any song stops having a
   page here at the next build, correctly: there is nothing left to show on it. */
export function creatorPage(one) {
  const roles = [...one.roles].join(" ו");
  return page({
    title: `${one.name}, אקורדים ומילים`,
    description: trim(`השירים ש${one.name} כתב או הלחין, ${one.songs.length} שירים באינדקס האקורדים, ${PROMISE}.`),
    canonical: url("creator", one.name),
    head: jsonLd({
      "@context": "https://schema.org",
      "@type": "Person",
      name: one.name,
      url: url("creator", one.name),
    }),
    seed: shelfSeed({
      heading: one.name,
      blurb: `${roles}, ${one.songs.length} שירים.`,
      songs: one.songs,
    }),
  });
}

export function creatorsPage(who) {
  const canonical = url("creators");
  return page({
    title: `מי כתב, ${SITE}`,
    description: trim(`כל מי שכתב או הלחין שיר באינדקס האקורדים, ${who.length} אנשים.`),
    canonical,
    seed: `<div id="seed" class="seed">
    <h1>מי כתב</h1>
    <p>כל מי שכתב או הלחין שיר באינדקס.</p>
    ${list(who.map((one) => ({ href: href("creator", one.name), text: one.name, note: `${one.songs.length} שירים` })))}
  </div>`,
  });
}
