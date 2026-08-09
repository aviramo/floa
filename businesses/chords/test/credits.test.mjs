/* WHO WROTE THE SONG, WHICH IS SEVERAL PEOPLE. The credit columns hold a list
   of names separated by commas, and everything in the app that shows a person,
   counts them, gives them a page or renames them reads that list. Read as one
   name instead, "דביר כהן, ליאת ציון, ינון דר" is a person: one page under a
   name nobody has, and the three who are actually there nowhere in the library.

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

const NAMES = ["people", "peopleSaid", "credits", "creditsLine", "creditNames",
  "creatorsOf", "songsBy"];
const api = new Function([
  grab("var CREDITS = [", "[", "]"),
  ...NAMES.map((name) => grab("function " + name + "(")),
].join("\n") + "\nreturn { " + NAMES.join(", ") + " };")();

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* A real song out of the library: three people wrote the words and two of them
   wrote the tune. */
const song = {
  title: "סיני (שיר געגועים)",
  lyrics_by: "דביר כהן, ליאת ציון, ינון דר",
  music_by: "ינון דר, ליאת ציון",
  styles: ["שירי מעגל"],
};
/* And the other ordinary case: one person did both. */
const solo = { title: "אחר", lyrics_by: "תמי בן הדר", music_by: "תמי בן הדר", styles: [] };
const none = { title: "בלי", lyrics_by: "", music_by: "" };

/* --- the column is a list --- */
eq("three names out of one column", api.people(song.lyrics_by), ["דביר כהן", "ליאת ציון", "ינון דר"]);
eq("one name is a list of one", api.people("תמי בן הדר"), ["תמי בן הדר"]);
eq("nothing out of nothing", api.people(""), []);
eq("nothing out of a missing column", api.people(null), []);
eq("semicolons too, and empties dropped", api.people(" א ,, ב ;  ג "), ["א", "ב", "ג"]);
eq("the same person twice on one row is once", api.people("א, א"), ["א"]);
eq("the spaces inside a name are one space", api.people("דביר    כהן"), ["דביר כהן"]);
/* and back, which is what the editor writes into the column */
eq("written back with a comma and a space", api.peopleSaid(["א", "ב", "א"]), "א, ב");

/* --- one entry per person, not per column --- */
eq("a credit each, in the order they are written",
  api.credits(song).map((c) => c.label + "/" + c.name),
  ["מילים/דביר כהן", "מילים/ליאת ציון", "מילים/ינון דר", "לחן/ינון דר", "לחן/ליאת ציון"]);
eq("everybody once, however many credits they have", api.creditNames(song),
  ["דביר כהן", "ליאת ציון", "ינון דר"]);
eq("a line per word, everybody on it",
  api.creditsLine(song), ["מילים: דביר כהן, ליאת ציון, ינון דר", "לחן: ינון דר, ליאת ציון"]);
eq("a song with no names says nothing at all", api.creditsLine(none), []);
eq("one person who did both is named once, in each of the two lines",
  api.creditsLine(solo), ["מילים: תמי בן הדר", "לחן: תמי בן הדר"]);
eq("and once in the list of everybody on the song", api.creditNames(solo), ["תמי בן הדר"]);

/* --- the people, gathered out of the songs --- */
const shelf = api.creatorsOf([song, solo, none]);
eq("everybody the library has a name for, once each, in Hebrew order",
  shelf.map((p) => p.name), ["דביר כהן", "ינון דר", "ליאת ציון", "תמי בן הדר"]);
eq("and which of the two each of them is",
  shelf.map((p) => p.name + ":" + Object.keys(p.roles).join("+")),
  ["דביר כהן:lyrics_by", "ינון דר:lyrics_by+music_by", "ליאת ציון:lyrics_by+music_by", "תמי בן הדר:lyrics_by+music_by"]);
/* the whole point: the row itself is not a person */
eq("the column read whole is nobody",
  api.creatorsOf([song]).map((p) => p.name).includes(song.lyrics_by), false);
eq("a person's songs are the ones naming them anywhere",
  api.songsBy([song, solo, none], "ליאת ציון").map((s) => s.title), [song.title]);
eq("and a name nobody carries has none", api.songsBy([song, solo], "מישהו אחר"), []);

/* --- renaming one of them, which is what renameCreator writes onto a song --- */
const renamed = (text, was, now) => {
  const names = api.people(text);
  if (names.indexOf(was) < 0) return null;
  return api.peopleSaid(names.map((name) => (name === was ? now : name)));
};
eq("the new name stands exactly where the old one stood",
  renamed(song.lyrics_by, "ליאת ציון", "ליאת ציון־כהן"), "דביר כהן, ליאת ציון־כהן, ינון דר");
eq("renaming somebody onto a name on the same row merges them",
  renamed(song.lyrics_by, "ליאת ציון", "ינון דר"), "דביר כהן, ינון דר");
eq("a column that does not name them is not written at all",
  renamed(song.music_by, "דביר כהן", "מישהו"), null);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
