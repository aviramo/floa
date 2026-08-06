/* ==========================================================================
   Refuse to commit a key.

   .gitignore already keeps .env out, and that would be enough for a private
   repo committed by hand. This one is public, and CLAUDE.md tells the agent to
   finish every change with `git add -A && git commit && git push origin main`.
   So the thing standing between an admin token and GitHub is one line in one
   file, matched by filename — and a filename is exactly what changes when
   someone renames a folder, copies a key into a note, or pastes it into a
   script "just to test it".

   This checks the other way round: not what the file is called, but what is
   inside it. It reads the staged diff, and if an added line carries something
   that can only be a credential, the commit does not happen.

   What it stops:

     sbp_…                a Supabase personal access token (create/drop tables)
     sb_secret_…          a Supabase secret key
     a JWT whose payload says role is anything but "anon"

   That last rule is why the anon key in businesses/floa/domain/supabase.js
   still commits fine: it is a JWT, it is public on purpose, and it says anon.
   A service role key is the same shape and says service_role, so it is caught
   without having to keep a list of which files are allowed to hold which key.

   Also a postgres URL carrying its password, and any .env file other than the
   example — that one is caught by name, since an empty .env is still a mistake
   to publish.

   (An earlier draft of this comment spelled that URL out as an example, and
   the hook refused to commit itself. It is a blunt instrument on purpose:
   describe a key, do not write one down.)

   To commit something this misreads, `git commit --no-verify`. Do that having
   looked, not to make the message go away.
   ========================================================================== */
import { execFileSync } from "node:child_process";
import { basename } from "node:path";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

/* Added lines only (the diff's "+" side), and their file, so the message can
   say where. -U0 keeps context lines out: an untouched line that already holds
   a key is not this commit's problem, and blocking on it would make every
   later commit in that file impossible. */
function stagedAdditions() {
  const out = git("diff", "--cached", "--no-color", "-U0", "--diff-filter=ACM");
  const lines = [];
  let file = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++"))
      lines.push({ file, text: line.slice(1) });
  }
  return lines;
}

/* A JWT is only a problem if it is not the anon one. Decode the payload rather
   than pattern-match the string: the role is a field, and reading the field is
   both stricter and kinder than guessing from base64. Anything that does not
   decode is left alone — an unreadable JWT-shaped string is not evidence. */
function jwtRole(token) {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

const RULES = [
  {
    what: "a Supabase personal access token (sbp_…)",
    find: (text) => /\bsbp_[A-Za-z0-9]{20,}/.test(text),
  },
  {
    what: "a Supabase secret key (sb_secret_…)",
    find: (text) => /\bsb_secret_[A-Za-z0-9_-]{20,}/.test(text),
  },
  {
    what: "a database URL with the password in it",
    find: (text) => /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/.test(text),
  },
  {
    what: "a JWT that is not the public anon key",
    find: (text) => {
      const tokens = text.match(/\beyJ[\w-]{6,}\.[\w-]{10,}\.[\w-]{10,}/g) || [];
      return tokens.some((t) => {
        const role = jwtRole(t);
        return role !== null && role !== "anon";
      });
    },
  },
];

const problems = [];

for (const path of git("diff", "--cached", "--name-only", "--diff-filter=ACM")
  .split("\n")
  .filter(Boolean)) {
  const name = basename(path);
  if ((name === ".env" || name.startsWith(".env.")) && name !== ".env.example")
    problems.push(`${path}: an .env file. It is meant to stay on this machine.`);
}

for (const { file, text } of stagedAdditions())
  for (const rule of RULES)
    if (rule.find(text)) problems.push(`${file}: ${rule.what}`);

if (problems.length) {
  const seen = [...new Set(problems)];
  console.error("\nCommit stopped: this repo is public.\n");
  for (const p of seen) console.error("  " + p);
  console.error(
    "\nKeys belong in .env, which git ignores, and are read from there." +
      "\nIf this is wrong, commit again with --no-verify.\n",
  );
  process.exit(1);
}
