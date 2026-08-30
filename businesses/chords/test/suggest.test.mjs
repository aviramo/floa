/* WHAT ELSE BELONGS ON A PLAYLIST, and the four different reasons a song can
   be an answer: it has been sung beside these ones, it is by the same person,
   it is made of the same words, or it is the same kind of song.

   Worth testing away from a browser because it is the one part of this feature
   that decides anything. The row of cards is a row of cards; which songs are
   on it, in which order, and what each one says about why it is there, is
   arithmetic, and arithmetic that nobody can check is a wall of suggestions
   nobody can argue with.

   Taken straight out of the shipped app.js, function by function, so what is
   tested is the code that runs and not a copy of it kept in step by hand. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");

/* From the head of a declaration to the bracket that closes it. */
function grab(head, open = "{", shut = "}") {
  const at = src.indexOf(head);
  if (at < 0) throw new Error("could not find " + head);
  let depth = 0;
  for (let j = src.indexOf(open, at); j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === shut) { depth--; if (!depth) return src.slice(at, j + 1) + ";"; }
  }
  throw new Error("unbalanced: " + head);
}

function line(head) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error("could not find " + head);
  return src.slice(at, src.indexOf("\n", at));
}

/* The four points values are read out of the file too, so a change to what a
   signal is worth shows up here as a failing test rather than as a wall that
   quietly reordered itself. */
const NAMES = ["wordsOf", "wordWeights", "wordSize", "suggestFor"];
const api = new Function("withoutGaps", "normalizeLines", "creditNames", "styles", [
  line("var WITH_LIST ="),
  line("var WITH_MAKER ="),
  line("var WITH_WORDS ="),
  line("var WITH_KIND ="),
  line("var WORD_SPLIT ="),
  ...NAMES.map((name) => grab("function " + name + "(")),
].join("\n") + "\nreturn { " + NAMES.join(", ") +
  ", WITH_LIST, WITH_MAKER, WITH_WORDS, WITH_KIND };")(
  /* The three the block leans on, in the shapes the app hands it. The words of
     a song reach it as lines; here a song is written as one string. */
  (text) => String(text == null ? "" : text),
  (lines) => (Array.isArray(lines) ? lines : [{ text: String(lines || "") }]),
  (song) => String(song.by || "").split(",").map((s) => s.trim()).filter(Boolean),
  (song) => (song.styles || []).slice(),
);

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* A song, written the short way: an id, a name, who made it, what kind it is,
   and its words as one line. */
let n = 0;
const song = (words, extra = {}) => ({
  id: "s" + ++n, title: extra.title || "שיר " + n, lines: words, ...extra,
});

const titles = (found) => found.map((f) => f.song.title);
const whys = (found) => found.map((f) => f.why);

/* --- nothing to be related to -------------------------------------------- */
{
  const a = song("אחת שתיים שלוש", { title: "א" });
  eq("an empty playlist suggests nothing", api.suggestFor([], [a], {}, 12), []);
  eq("an empty library suggests nothing", api.suggestFor([a], [], {}, 12), []);
}

/* --- what is already in the list is never offered back -------------------- */
{
  const a = song("כנפי רוח", { title: "א", by: "דנה" });
  const b = song("כנפי רוח", { title: "ב", by: "דנה" });
  const found = api.suggestFor([a], [a, b], {}, 12);
  eq("the songs in the list are not suggested", titles(found), ["ב"]);
}

/* --- a song still being read is not a song to sing ------------------------ */
{
  const a = song("כנפי רוח אחת", { title: "א", by: "דנה" });
  const b = song("כנפי רוח שתיים", { title: "ב", by: "דנה", status: "reading" });
  eq("a song still being read is left out", titles(api.suggestFor([a], [a, b], {}, 12)), []);
}

/* --- the four signals, each on its own --------------------------------- */
{
  const seed = song("אאא בבב גגג", { title: "seed", by: "דנה", styles: ["מעגל"] });
  /* Filler, so that a word in two songs out of many is worth something and a
     word in all of them is worth nothing. */
  const filler = [];
  for (let i = 0; i < 20; i++) filler.push(song("מילה" + i + " סתם"));

  const byMaker = song("שום דבר משותף", { title: "maker", by: "דנה" });
  const byKind = song("שום דבר משותף", { title: "kind", styles: ["מעגל"] });
  const byWords = song("אאא בבב גגג", { title: "words" });
  const byList = song("שום דבר משותף", { title: "list" });

  const library = [seed, byMaker, byKind, byWords, byList, ...filler];
  const found = api.suggestFor([seed], library, { [byList.id]: 1 }, 12);

  eq("each signal puts its song on the wall",
    titles(found).slice().sort(), ["kind", "list", "maker", "words"]);

  eq("and each says which signal it was", whys(found).slice().sort(),
    ["מופיע ברשימות עם שיר אחד מכאן", "מילים דומות", "מעגל", "של דנה"].sort());

  /* The order the points ask for: two lists beat a shared writer, which beats
     the words, which beats the kind. */
  eq("the strongest reason ranks first", titles(found), ["list", "maker", "words", "kind"]);
}

/* --- standing beside them is counted in proportion ------------------------ */
{
  /* Four songs on the list. One candidate has been sung beside all four and
     one beside a single one of them, and the point of counting the SONGS
     rather than the lists is that those are two different answers: flat, both
     would say "one list" and the wall would come out alphabetical. */
  const seeds = [];
  for (let i = 0; i < 4; i++) seeds.push(song("שום דבר", { title: "seed" + i }));
  const most = song("שום דבר", { title: "most" });
  const one = song("שום דבר", { title: "one" });
  const library = [...seeds, most, one];
  const found = api.suggestFor(seeds, library,
    { [most.id]: 4, [one.id]: 1 }, 12);
  eq("beside all of them beats beside one of them", titles(found), ["most", "one"]);
  eq("and both say how many", whys(found),
    ["מופיע ברשימות עם 4 מהשירים כאן", "מופיע ברשימות עם שיר אחד מכאן"]);
  eq("in proportion", found.map((f) => f.points), [api.WITH_LIST, Math.round(api.WITH_LIST / 4)]);
}

/* --- a kind most of the library wears is not a kind ------------------------ */
{
  /* Nothing in common but the style: different words, no writer named. */
  const seed = song("אחדים שניים", { title: "seed", styles: ["מעגל"] });
  const near = song("שלושה ארבעה", { title: "near", styles: ["מעגל"] });
  const library = [seed, near];
  /* everything else is a circle song too, so being one says nothing */
  for (let i = 0; i < 10; i++) library.push(song("סתם" + i, { styles: ["מעגל"] }));
  eq("a style most of the library wears is not a reason",
    titles(api.suggestFor([seed], library, {}, 12)), []);
}

/* --- a word every song holds is not a reason ------------------------------ */
{
  const common = "את של אני";
  const seed = song(common + " ייחודי", { title: "seed" });
  const library = [seed];
  for (let i = 0; i < 15; i++) library.push(song(common + " אחר" + i, { title: "רגיל" + i }));
  const found = api.suggestFor([seed], library, {}, 12);
  eq("words every song holds suggest nothing", titles(found), []);
}

/* --- a rare word two songs share IS a reason ------------------------------ */
{
  const seed = song("את של אני מרכבה", { title: "seed" });
  const near = song("את של אני מרכבה", { title: "near" });
  const library = [seed, near];
  for (let i = 0; i < 15; i++) library.push(song("את של אני אחר" + i));
  const found = api.suggestFor([seed], library, {}, 12);
  eq("a rare word two songs share is a reason", titles(found), ["near"]);
  eq("and it says so", whys(found), ["מילים דומות"]);
}

/* --- several signals at once outrank one -------------------------------- */
{
  const seed = song("כנפי מרכבה", { title: "seed", by: "דנה", styles: ["מעגל"] });
  const one = song("שום דבר", { title: "one", by: "דנה" });
  const three = song("כנפי מרכבה", { title: "three", by: "דנה", styles: ["מעגל"] });
  const library = [seed, one, three];
  for (let i = 0; i < 15; i++) library.push(song("סתם" + i));
  eq("three reasons beat one", titles(api.suggestFor([seed], library, {}, 12)), ["three", "one"]);
}

/* --- how many come back --------------------------------------------------- */
{
  const seed = song("שום דבר", { title: "seed", by: "דנה" });
  const library = [seed];
  for (let i = 0; i < 30; i++) library.push(song("סתם" + i, { title: "כ" + i, by: "דנה" }));
  eq("the wall is capped", api.suggestFor([seed], library, {}, 12).length, 12);
  eq("and the cap is what was asked for", api.suggestFor([seed], library, {}, 3).length, 3);
}

/* --- the same question twice gives the same answer ------------------------ */
{
  const seed = song("כנפי מרכבה", { title: "seed", by: "דנה" });
  const a = song("שום דבר", { title: "ב", by: "דנה" });
  const b = song("שום דבר", { title: "א", by: "דנה" });
  const library = [seed, a, b];
  for (let i = 0; i < 15; i++) library.push(song("סתם" + i));
  /* Equal points, so the name breaks the tie: a wall that came out in a
     different order on two presses that found the same songs is a wall nobody
     trusts. */
  eq("a tie is broken by the name", titles(api.suggestFor([seed], library, {}, 12)), ["א", "ב"]);
}

/* --- the words themselves ------------------------------------------------- */
{
  eq("one and two letter pieces are not words",
    Object.keys(api.wordsOf(song("א בב גגג דדדד"))).sort(), ["גגג", "דדדד"]);
  eq("numbers are not words either",
    Object.keys(api.wordsOf(song("פסוק 2 מרכבה"))).sort(), ["מרכבה", "פסוק"]);
  eq("english is", Object.keys(api.wordsOf(song("Guidance Protection"))).sort(),
    ["guidance", "protection"]);
}

console.log(failed ? `\n${failed} failed` : "\nall of them related");
process.exit(failed ? 1 : 0);
