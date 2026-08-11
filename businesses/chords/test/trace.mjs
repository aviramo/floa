/* WHAT THE EAR WAS SAYING, READ BACK OFF A TAKE.

   Not a test. A reading glass, and the only one there is for the one part of
   this app that cannot be tested away from a room: what a microphone in a
   house with a guitar in it actually hears.

   Every take carries a trace now (see traceOn in app.js): ten times a second
   while it was recording, what each chord of the song scored, what note was
   heard underneath, and where the follower thought it was. This lays that
   beside the words of the song and prints it.

     node businesses/chords/test/trace.mjs "שר ליבי"

   Reads with the owner's key through scripts/sql.mjs, so it sees takes nobody
   has published. */
import { execFileSync } from "node:child_process";

const title = process.argv[2] || "שר ליבי";
const N = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ask = (sql) => {
  let out;
  try { out = execFileSync("node", ["scripts/sql.mjs", sql], { encoding: "utf8", maxBuffer: 1 << 28 }); }
  catch (e) { out = e.stdout || ""; }
  const from = out.indexOf("[");
  const to = out.lastIndexOf("]");
  if (from < 0) { console.log(out.slice(0, 400)); process.exit(1); }
  return JSON.parse(out.slice(from, to + 1)).map((r) => r.json_build_object ?? r);
};

const [song] = ask(`select json_build_object('id', id, 'title', title, 'lines', lines)
  from songs where title = '${title}' limit 1`);
if (!song) { console.log("no such song"); process.exit(0); }

const [take] = ask(`select json_build_object('take', take, 'seconds', seconds, 'capo', capo,
    'marks', marks, 'trace', trace, 'created_at', created_at)
  from song_takes where song_id = '${song.id}' order by created_at desc limit 1`);
if (!take) { console.log("no takes"); process.exit(0); }
if (!take.trace || !take.trace.length) {
  console.log(`take ${take.take} carries no trace: recorded before the app kept one.`);
  process.exit(0);
}

/* The chords in the order the page reaches them, with the words each sits on,
   and the DISTINCT ones in the order the follower scores them. */
const chords = [];
song.lines.split("\n").forEach((line) => {
  if (/^\s*\{/.test(line)) return;
  const plain = line.replace(/\[[^\]]*\]/g, "");
  const re = /\[([^\]]*)\]/g;
  let m, eaten = 0;
  while ((m = re.exec(line))) {
    const at = m.index - eaten;
    eaten += m[0].length;
    chords.push({ name: m[1], over: plain.slice(Math.max(0, at - 1), at + 9).trim() || "(סוף שורה)" });
  }
});
const kinds = [];
for (const c of chords) if (!kinds.includes(c.name)) kinds.push(c.name);

console.log(`${song.title}, take ${take.take}: ${take.seconds}s, capo ${take.capo}, ` +
  `${take.trace.length} readings\n`);
console.log(`  the song is written in: ${kinds.join(" ")}`);
console.log(`  with a capo on ${take.capo}, the room should hear them as: ` +
  kinds.map((k) => {
    const root = /^([A-G][b#]?)/.exec(k);
    return root ? N[(N.indexOf(root[1].replace("b", "#")) + take.capo + 12) % 12] : k;
  }).join(" ") + "\n");

/* One line per reading, and the chord scores as a row of numbers in the song's
   own order, so a column can be read down. */
const bar = (v) => {
  const n = Math.max(0, Math.min(10, Math.round((v - 0.5) * 20)));
  return "#".repeat(n).padEnd(10, ".");
};
console.log("   time   here  chord being waited on     bass   " + kinds.map((k) => k.padEnd(6)).join(""));
console.log("  ------ ----- ------------------------ ------- " + kinds.map(() => "------").join(""));
for (const r of take.trace) {
  const c = chords[r.h] || { name: "?", over: "" };
  const said = r.b >= 0 ? `${N[r.b]} ${r.s}` : "none";
  const quiet = r.v < 0.01 ? "  (quiet)" : "";
  console.log(
    `  ${(r.t / 1000).toFixed(1).padStart(6)} ${String(r.h).padStart(5)} ` +
    `${(c.name + " " + c.over).slice(0, 24).padEnd(24)} ${said.padEnd(7)} ` +
    (r.k.length ? r.k.map((v) => String(v).padEnd(6)).join("") : "") + quiet
  );
}

/* And the one summary worth having: for each chord of the song, how often it
   was the best answer, and what the bass said while it was. */
console.log("\nwhat the bass said, over the whole take:");
const heard = new Map();
for (const r of take.trace) {
  const key = r.b >= 0 ? N[r.b] : "none";
  heard.set(key, (heard.get(key) || 0) + 1);
}
[...heard].sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log(`  ${k.padEnd(6)} ${String(n).padStart(5)} readings  ${(n * 100 / take.trace.length).toFixed(0)}%`));
