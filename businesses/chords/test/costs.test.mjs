/* WHAT THE READINGS COST, ADDED UP AND PUT IN ORDER. The page at
   /chords/reads is one list drawn three ways and then gathered by account, and
   all four of those are arithmetic: which row is dearer, what a handful of
   them come to, and which account spent the most.

   Arithmetic on money is worth a test for the ordinary reason, and there is a
   second one here. The rows are not all in one currency: nearly every reading
   carries the rate of the day it happened and is read in shekels, and the few
   from before the rate was kept are dollars. Comparing and adding are
   therefore done in US cents, which every row has, and the shekels are a
   reading of that. A page that sorted on the shekels would put a dollar row
   wherever it liked.

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

const NAMES = ["centsOf", "rateOf", "moneySaid", "billOf", "billSaid",
  "wentOf", "agreeSaid", "newestFirst", "readsSorted", "readsByAccount"];
const api = new Function([
  grab("var WENT = {"),
  ...NAMES.map((name) => grab("function " + name + "(")),
].join("\n") + "\nreturn { " + NAMES.join(", ") + " };")();

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

/* Four readings out of the table, with the rate of the day on each: a dear one
   the model finished, two cheap ones the ruler got, and one that came back
   with nothing at all. */
const dear = { song_id: "a", read_cost: 41.5, usd_ils: 3.7, created_at: "2026-03-01T09:00:00Z", reader: "ofir", kept: "model", agreement: 0.42 };
const cheap = { song_id: "b", read_cost: 4.2, usd_ils: 3.7, created_at: "2026-03-04T09:00:00Z", reader: "ofir", kept: "measured", agreement: 0.91 };
const half = { song_id: "c", read_cost: 12, usd_ils: 3.6, created_at: "2026-03-02T09:00:00Z", reader: "dana", kept: "words", agreement: 0.3 };
const burnt = { song_id: "d", read_cost: 8, usd_ils: 3.6, created_at: "2026-03-03T09:00:00Z", reader: "dana", kept: "failed", agreement: null };
/* And two the page cannot price: one from before the rate was kept, and one
   whose price was never known at all. */
const older = { song_id: "e", read_cost: 6, usd_ils: null, created_at: "2026-01-01T09:00:00Z", reader: "ofir", kept: null, agreement: null };
const nameless = { song_id: "f", read_cost: null, usd_ils: null, created_at: "2026-02-01T09:00:00Z", reader: "", kept: null, agreement: null };

const ids = (rows) => rows.map((row) => row.song_id);

/* --- one row --- */
eq("the price is the cents on the row", api.centsOf(dear), 41.5);
eq("no price is not nought", api.centsOf(nameless), null);
eq("the rate of the day it was read", api.rateOf(dear), 3.7);
eq("a row from before the rate has none", api.rateOf(older), 0);
eq("read in shekels, at that day's rate", api.moneySaid(dear), "₪1.54");
eq("and in dollars where there is no rate", api.moneySaid(older), "$0.06");
eq("under the smallest coin it says so", api.moneySaid({ read_cost: 0.1, usd_ils: 3.7 }), "פחות מאגורה");
eq("and a row with no price says nothing", api.moneySaid(nameless), "");

/* --- how it went --- */
eq("the word for the cheap read", api.wentOf(cheap).words, "סרגל");
eq("the word for the dear one", api.wentOf(dear).words, "מודל");
eq("the word for the half that came back", api.wentOf(half).words, "מילים בלבד");
eq("and for the one that did not", api.wentOf(burnt).words, "נכשל");
eq("a row from before the column says nothing", api.wentOf(older), null);
eq("the agreement, in whole percent", api.agreeSaid(cheap), "91% התאמה");
/* null and nought are two different things: nothing to compare against, and
   two readings that shared not one word. */
eq("nothing to compare against says nothing", api.agreeSaid(burnt), "");
eq("but no agreement at all is a fact", api.agreeSaid({ agreement: 0 }), "0% התאמה");

/* --- a handful of them added up --- */
const bill = api.billOf([dear, cheap, half, burnt, older, nameless]);
eq("every row is counted", bill.n, 6);
eq("the priced ones are counted apart", [bill.priced, bill.unknown], [5, 1]);
eq("and the whole of it in the money the bill is in", Math.round(bill.cents * 10) / 10, 71.7);
/* the two currencies are carried side by side and never added together */
eq("the shekel rows in agorot", Math.round(bill.agorot * 100) / 100, 241.09);
eq("the dollar rows kept apart", bill.dollars, 6);
eq("and said side by side", api.billSaid(bill), "₪2.41 ועוד $0.06");
eq("one currency says one thing", api.billSaid(api.billOf([dear, cheap])), "₪1.69");
eq("nothing priced says nothing", api.billSaid(api.billOf([nameless])), "");

/* --- the order --- */
eq("dearest first", ids(api.readsSorted([cheap, dear, half], "dear")), ["a", "c", "b"]);
eq("and cheapest first the other way", ids(api.readsSorted([dear, cheap, half], "cheap")), ["b", "c", "a"]);
eq("newest first by date", ids(api.readsSorted([dear, cheap, half], "when")), ["b", "c", "a"]);
/* A reading with no price is not the cheapest thing on the page, it is the
   thing the page does not know, so it goes last whichever way round it is. */
eq("no price goes last, dearest first", ids(api.readsSorted([nameless, cheap], "dear")), ["b", "f"]);
eq("and last cheapest first too", ids(api.readsSorted([nameless, cheap], "cheap")), ["b", "f"]);
/* Sorting on the shekels rather than on the cents would put this one first:
   six cents with no rate is a bigger number than 4.2 cents at 3.7. */
eq("compared in cents, never in two currencies", ids(api.readsSorted([cheap, older], "dear")), ["e", "b"]);
eq("two of the same price, later one first", ids(api.readsSorted([
  { song_id: "x", read_cost: 5, created_at: "2026-03-01T09:00:00Z" },
  { song_id: "y", read_cost: 5, created_at: "2026-03-09T09:00:00Z" },
], "dear")), ["y", "x"]);
/* And the list it was handed is left as it was. The page keeps one array of
   readings and draws it four ways; a sort in place would mean the order of the
   page depended on which button was pressed before it. */
const given = [cheap, dear];
api.readsSorted(given, "dear");
eq("the rows handed in are not reordered", ids(given), ["b", "a"]);

/* --- and gathered by account --- */
const groups = api.readsByAccount([cheap, half, dear, burnt, nameless], "dear");
/* ofir spent 45.7 cents and dana 20; the account with the bigger bill stands
   first, and the readings whose account is not known stand last however much
   they hold. */
eq("the biggest bill first", groups.map((g) => g.reader), ["ofir", "dana", ""]);
eq("each group holds its own", groups.map((g) => ids(g.rows)), [["a", "b"], ["c", "d"], ["f"]]);
eq("and adds up its own", groups.map((g) => Math.round(g.bill.cents * 10) / 10), [45.7, 20, 0]);
/* the order inside a group is the page's order, so the two controls are one */
eq("the order inside a group is the one chosen",
  api.readsByAccount([cheap, dear], "cheap").map((g) => ids(g.rows)), [["b", "a"]]);

console.log(failed ? `\n${failed} failed` : "\nall good");
process.exit(failed ? 1 : 0);
