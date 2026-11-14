/* ==========================================================================
   Chords' identity, for the generator.

   Like ProLink, Chords does not compose itself from the shared components: it
   is a hand-built application shipped verbatim from public/. So this file
   carries only what the build itself needs. The look, the copy and the whole
   behaviour live in public/index.html and public/assets/.
   ========================================================================== */
export const site = {
  brand: "אקורדים",
  lang: "he",
  dir: "rtl",
  origin: "https://floa.co.il",
  folder: "chords/",
  tagline: "אינדקס שירים עם אקורדים",
  slogan: "כל שיר בדף משלו, האקורדים בדיוק מעל המילים",
};

/* The app reads its own config from public/assets/config.js, not from here.
   `business` rides along only so the generated window.FLOA object names the
   right business, the same shape every other site gets. */
export const runtime = {
  business: "chords",
};
