// The static texts of the scripted chat live in the database (chatbot.script_versions); this is the tool that reads and writes them.
//   node scripts/chatbot-script.mjs list <business>
//   node scripts/chatbot-script.mjs pull <business> [file]        the published version, written to a file (default: stdout)
//   node scripts/chatbot-script.mjs push <business> <file> [note]  a new version from a JSON file, published at once (the previous one stays, to put back)
//   node scripts/chatbot-script.mjs publish <business> <version>   publish an earlier version again (the others stop being published)
// It reads and writes through scripts/sql.mjs (needs the token in .env). The page shows a change within about half a minute.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const [cmd, biz0, arg, note0] = process.argv.slice(2);
const biz = String(biz0 || '').replace(/[^a-z0-9_-]/gi, '');
if (!cmd || !biz) { console.error('usage: chatbot-script.mjs list|pull|push|publish <business> ...'); process.exit(1); }
// scripts/sql.mjs prints the rows and then exits with a Windows handle assertion: the rows are read from stdout whatever the exit code is
const sql = (text) => {
  let out;
  try { out = execFileSync('node', ['scripts/sql.mjs'], { input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }); } catch (e) { out = e.stdout ? String(e.stdout) : ''; }
  const i = out.indexOf('[');
  return i >= 0 ? JSON.parse(out.slice(i)) : [];
};

if (cmd === 'list') {
  for (const r of sql(`select version, published, created_at, note, length(content::text) as bytes from chatbot.script_versions where business = '${biz}' order by version`)) console.log(r.version, r.published ? 'PUBLISHED' : '         ', r.created_at, r.bytes + 'B', r.note || '');
} else if (cmd === 'pull') {
  const r = sql(`select content from chatbot.script_versions where business = '${biz}' and published order by version desc limit 1`)[0];
  if (!r) { console.error('nothing published for', biz); process.exit(1); }
  const text = JSON.stringify(r.content, null, 2);
  if (arg) { writeFileSync(arg, text); console.log('written', arg); } else console.log(text);
} else if (cmd === 'push') {
  const json = JSON.stringify(JSON.parse(readFileSync(arg, 'utf8')));
  if (json.includes('$json$')) throw new Error('the content contains the delimiter');
  const note = String(note0 || '').replace(/'/g, "''");
  const r = sql(`with n as (select coalesce(max(version), 0) + 1 as v from chatbot.script_versions where business = '${biz}'),
    off as (update chatbot.script_versions set published = false where business = '${biz}')
    insert into chatbot.script_versions(business, version, content, published, note) select '${biz}', v, $json$${json}$json$::jsonb, true, '${note}' from n returning version`);
  console.log('published version', r[0] && r[0].version);
} else if (cmd === 'publish') {
  const v = Number(arg);
  const r = sql(`with off as (update chatbot.script_versions set published = false where business = '${biz}')
    update chatbot.script_versions set published = true where business = '${biz}' and version = ${v} returning version`);
  console.log(r.length ? 'published version ' + v : 'no such version');
} else { console.error('unknown command', cmd); process.exit(1); }
