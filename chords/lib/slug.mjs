// A song's slug is its URL: chords/<slug>/. Spaces become underscores, and the
// Hebrew vowel marks come off, because "אך_טוב_וחסד" is a URL a person can read
// and retype while "אַךְ_טוֹב_וָחֶסֶד" is a wall of percent escapes.

const NIQQUD = /[֑-ׇ]/g; // vowels and cantillation marks
const QUOTES = /["'`׳״‘’“”]/g;

export function slugify(title) {
  const base = String(title || "")
    .normalize("NFC")
    .replace(NIQQUD, "")
    .replace(QUOTES, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .toLowerCase();
  return base || "song";
}

// Two songs may well be called the same thing. The second one gets a suffix.
export function uniqueSlug(title, taken) {
  const base = slugify(title);
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
