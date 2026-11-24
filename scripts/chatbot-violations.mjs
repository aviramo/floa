// The rule-violation log of the chatbot engine, summarised: which hard rules the agent broke, how often, whether the correction held, and a recent example.
// Run: node scripts/chatbot-violations.mjs [days=7] [business]
// The log is written by the server (supabase/functions/chatbot, logViolation) into chatbot.violations; this reads it through scripts/sql.mjs (needs the token in .env).
import { execFileSync } from 'node:child_process';

const days = Math.max(1, Math.min(90, Number(process.argv[2]) || 7));
const business = (process.argv[3] || '').replace(/[^a-z0-9_-]/gi, '');
const where = `at > now() - interval '${days} days'` + (business ? ` and business = '${business}'` : '');
const q = (sql) => JSON.parse(execFileSync('node', ['scripts/sql.mjs', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).replace(/^[^\[]*/, ''));

const rows = q(`select business, rule, count(*)::int n, count(*) filter (where fixed)::int fixed, max(at) last from chatbot.violations where ${where} group by 1,2 order by n desc`);
if (!rows.length) { console.log(`No violations in the last ${days} days.`); process.exit(0); }
console.log(`Rule violations, last ${days} days${business ? ' (' + business + ')' : ''}:\n`);
for (const r of rows) console.log(String(r.n).padStart(4), ' ', r.business.padEnd(10), r.rule.padEnd(52), `${r.fixed}/${r.n} fixed`);
const worst = rows[0];
const ex = q(`select before, after from chatbot.violations where ${where} and rule = '${worst.rule.replace(/'/g, "''")}' order by at desc limit 1`)[0];
if (ex) console.log(`\nMost frequent: ${worst.rule}\n  agent wrote: ${String(ex.before || '').slice(0, 300)}\n  visitor got: ${String(ex.after || '').slice(0, 300)}`);
