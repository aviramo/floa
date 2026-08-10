/* ONE NAME, ONE THING.

   This exists because of a bug that cost the whole list of recordings under
   every song, and it cost it silently, which is the part worth guarding.

   Two declarations went into the same scope: `function takeWanted()`, which
   answers "which recording was this page opened for", and `var takeWanted`,
   added later, which answers "has a take been asked for and not started yet".
   Both are legal. Both are hoisted into the one scope this app is written in,
   which is one long IIFE. The function is put up first and then the `var` is
   assigned over it as the file loads, so from the first moment of the tab the
   name is a boolean and the function no longer exists.

   What that looked like: drawTakes fetched the takes, called takeWanted(), and
   threw "not a function" INSIDE A PROMISE, where nothing was listening. The
   panel came up empty. The takes were in the database the whole time, audio
   and all, and the only honest reading of an empty panel is that nothing had
   been saved.

   Nothing else catches this. It is valid JavaScript, so `node --check` is
   happy; it only fails when the call happens, and the call is behind a press
   in a browser. So it is checked here, in the one way it can be checked
   cheaply: by reading the declarations.

   HOW THE READING WORKS, and what it is not. Every file in here is one IIFE
   with its body indented by two spaces, so a line that starts with exactly two
   spaces and `var` or `function` is a declaration in that one shared scope.
   That is a convention rather than a parse, and it is enough: a real parser
   would be the right tool for a language with several scopes per file, and
   these files have one each. */
import { readFileSync } from "node:fs";

const FILES = ["app.js", "ear.js", "follow.js", "config.js"];

let failed = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}`);
  if (!ok) { console.log(`       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`); failed++; }
};

for (const file of FILES) {
  const src = readFileSync(`businesses/chords/public/assets/${file}`, "utf8");
  const seen = new Map();

  src.split("\n").forEach((line, i) => {
    const found = /^ {2}(var|function) ([A-Za-z_$][\w$]*)/.exec(line);
    if (!found) return;
    const [, kind, name] = found;
    if (!seen.has(name)) seen.set(name, []);
    seen.get(name).push(`${kind} on line ${i + 1}`);
  });

  const twice = [...seen].filter(([, where]) => where.length > 1)
    .map(([name, where]) => `${name}: ${where.join(", ")}`);

  eq(`${file} declares each name once`, twice, []);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
