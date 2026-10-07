/* ==========================================================================
   The runner. Leave it running while you use the app.

     npm start            keeps watching
     npm start -- --once  does what is waiting, then stops

   Two kinds of work arrive from the dashboard:

     a run         "שלח משרות" was pressed on an agent: scan the sites, score
                   what was found, write it down. Nothing is sent.
     a queue       jobs the person ticked and sent: apply to each, one at a
                   time, with a pause between, and write what happened.

   Sending is only ever the second kind. A scan never sends anything.
   ========================================================================== */
import { lit, sql } from "./db.mjs";
import { connections, expire } from "./connect.mjs";
import { open } from "./browser.mjs";
import { refine, score } from "./score.mjs";
import { SITES } from "./sites.mjs";

const ONCE = process.argv.includes("--once");
const KEEP = 40; // how many of a scan's best jobs are written down
const REFINE = 15; // how many of those a model re-reads, when there is a key
const log = (...a) => console.log(new Date().toLocaleTimeString("he-IL"), ...a);

async function scan(run) {
  const [agent] = await sql(`select * from job_agents where id = ${lit(run.agent_id)}`);
  if (!agent) throw new Error("הסוכן נמחק");
  if (!agent.roles.length) throw new Error("לא נבחרו תפקידים");

  const context = await open();
  const all = [];
  const notes = [];
  try {
    const page = context.pages()[0] || (await context.newPage());
    for (const site of Object.values(SITES)) {
      try {
        const jobs = await site.search(page, agent.roles);
        log(`${site.name}: ${jobs.length}`);
        all.push(...jobs);
      } catch (err) {
        notes.push(`${site.name}: ${err.message}`);
        log(`${site.name} נכשל:`, err.message);
      }
    }
  } finally {
    await context.close();
  }

  const unique = [...new Map(all.map((j) => [j.url, j])).values()];
  for (const job of unique) Object.assign(job, score(agent, job));
  unique.sort((a, b) => b.score - a.score);
  const best = unique.slice(0, KEEP);
  await refine(agent, best.slice(0, REFINE));
  best.sort((a, b) => b.score - a.score);

  if (best.length) {
    /* A job already written down for this account stays as it is: its status
       may be "sent" and a rescan must not forget that. */
    await sql(
      `insert into job_applications (owner, agent_id, source, url, title, company, location, score, reason, description) values ` +
        best
          .map((j) => `(${lit(agent.owner)}, ${lit(agent.id)}, ${lit(j.source)}, ${lit(j.url)}, ${lit(j.title)}, ${lit(j.company)}, ${lit(j.location)}, ${lit(j.score)}, ${lit(j.reason)}, ${lit((j.description || "").slice(0, 4000))})`)
          .join(",") +
        ` on conflict (owner, url) do nothing`,
    );
  }
  return `נמצאו ${unique.length}, נשמרו ${best.length}.` + (notes.length ? " " + notes.join(" | ") : "");
}

async function runs() {
  const [run] = await sql(
    `update job_runs set status = 'running' where id = (select id from job_runs where status = 'requested' order by created_at limit 1) returning *`,
  );
  if (!run) return false;
  log("סריקה", run.id);
  try {
    const note = await scan(run);
    await sql(`update job_runs set status = 'done', note = ${lit(note)}, finished_at = now() where id = ${lit(run.id)}`);
    log("הסתיים:", note);
  } catch (err) {
    await sql(`update job_runs set status = 'failed', note = ${lit(err.message)}, finished_at = now() where id = ${lit(run.id)}`);
    log("נכשל:", err.message);
  }
  return true;
}

async function queue() {
  const [row] = await sql(
    `select * from job_applications where status = 'queued' order by created_at limit 1`,
  );
  if (!row) return false;
  const site = SITES[row.source];
  log("שולח:", row.title, "|", row.source);
  let result;
  if (!site) {
    result = { status: "manual", note: "אתר לא נתמך" };
  } else {
    const context = await open();
    try {
      result = await site.apply(context.pages()[0] || (await context.newPage()), row);
    } catch (err) {
      result = { status: "failed", note: err.message.slice(0, 200) };
    } finally {
      await context.close();
    }
  }
  await sql(
    `update job_applications set status = ${lit(result.status)}, note = ${lit(result.note)}, ` +
      `sent_at = ${result.status === "sent" ? "now()" : "null"} where id = ${lit(row.id)}`,
  );
  log("תוצאה:", result.status, result.note);
  if (/התחברות/.test(result.note)) await expire(row.owner, row.source).catch(() => {});
  /* A person does not apply to twenty jobs in twenty seconds, and a site
     notices. */
  if (!ONCE) await new Promise((r) => setTimeout(r, 20000 + Math.random() * 20000));
  return true;
}

log(ONCE ? "מטפל במה שמחכה" : "מאזין לבקשות. Ctrl+C לעצירה.");
for (;;) {
  let worked = false;
  try {
    worked = (await connections(log)) || (await runs()) || (await queue());
  } catch (err) {
    log("שגיאה:", err.message);
  }
  if (!worked) {
    if (ONCE) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
