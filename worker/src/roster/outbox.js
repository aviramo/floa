/* ==========================================================================
   The outbox processor. Events are written by database triggers; this claims
   them, delivers (webhook and mails, in parallel, they do not depend on each
   other) and reports every outcome with roster_events_done.

   It runs after every API call that can enqueue an event (ctx.waitUntil) and
   once a minute from the cron. Both can run at the same moment: the claim is
   `for update skip locked`, so they never hold the same event.

   Duplicates, and why they are bounded:
     * a mail is made only if the database holds no row for it yet (the claim
       item's mails_logged; without that key, only when attempts == 0). A retry
       of a failed webhook sends the webhook and no mail twice, and an event
       that comes back after a crash gets the mails that never went out.
     * a mail carries Idempotency-Key = event + template + recipient, which
       Resend honours for 24 hours: a crash after sending and before reporting
       cannot send it twice.
     * a webhook carries X-Roster-Delivery = the event id on every attempt, so
       a receiver can drop a repeat, and the number of attempts is capped.

   An item that cannot be understood, or one that throws, is reported (or
   dropped from this run) by id only. Nothing about a participant is logged.
   ========================================================================== */
import { createDb, RPC } from "./db.js";
import { createMailTally, OUTBOX } from "./limits.js";
import { deliverMails } from "./mail.js";
import { normalizeWork } from "./work.js";
import { runWebhook } from "./webhook.js";

/* One tally for the whole isolate, shared by every run in it (runs overlap: each API call starts one, the cron another).
   See createMailTally in limits.js: each run counts, on top of the counters its claim returned, the mails other runs
   have in flight or logged after this run began to claim, so overlapping runs cannot all read "0 so far". */
const ISOLATE_TALLY = createMailTally();

/* one event -> the result for roster_events_done */
export async function processItem(work, deps) {
  /* Mails are made when the database says it holds none yet for this event (mails_logged), per mail. A database that
     does not say falls back to "only on the first pass" (attempts == 0). That fallback is wrong after a crash: a lock
     that ran out counts as an attempt, and a mail that was never sent would never be. */
  const mailsDue = work.mailsLogged !== null || work.event.attempts === 0;
  const [webhook, mail] = await Promise.all([
    runWebhook(work, deps),
    mailsDue ? deliverMails(work, deps) : Promise.resolve({ mails: [], skipped: [] }),
  ]);
  return { webhook, mails: mail.mails, skipped: mail.skipped };
}

/* Claim and process one batch.
   deps: { db?, env, fetch, now?, sleep?, deadlineMs?, limit?, concurrency? }
   -> { claimed, processed, skipped, reported, reportFailed } (counts, for logs and tests) */
export async function processOutbox(deps) {
  const env = deps.env;
  const summary = { claimed: 0, processed: 0, skipped: 0, reported: 0, reportFailed: 0 };
  if (!env || !env.SUPABASE_SERVICE_KEY || !env.SUPABASE_URL) return summary;

  const now = deps.now || Date.now;
  const db = deps.db || createDb({ url: env.SUPABASE_URL, serviceKey: env.SUPABASE_SERVICE_KEY, fetch: deps.fetch });
  const deadlineAt = now() + (deps.deadlineMs ?? OUTBOX.apiDeadlineMs);

  const shared = deps.tally || ISOLATE_TALLY;
  const since = shared.begin();   /* before the claim: the counters it returns cannot be newer than this */
  const claim = await db.rpc(RPC.claim, { p_limit: deps.limit ?? OUTBOX.batch });
  if (!claim.ok || !Array.isArray(claim.data)) return summary;
  summary.claimed = claim.data.length;
  if (claim.data.length === 0) return summary;

  const itemDeps = { ...deps, deadlineAt, apiKey: env.RESEND_API_KEY || "" };
  const queue = [...claim.data];

  async function worker() {
    for (;;) {
      const raw = queue.shift();
      if (raw === undefined) return;

      let work = null;
      try {
        work = normalizeWork(raw, now);
      } catch { /* an item that cannot even be read is treated as unreadable */ }
      if (!work) {
        console.error("roster outbox: unreadable work item", String(raw?.event?.id ?? "?").slice(0, 20));
        summary.skipped++;
        continue;
      }
      /* not enough time to finish it properly: leave it claimed, its lock
         lapses and the next run takes it. Nothing has been sent. */
      if (deadlineAt - now() < OUTBOX.webhookTimeoutMs + 1000) {
        summary.skipped++;
        continue;
      }

      /* the places this event's mails take against the limits, until its report has gone to the database
         (from then on its mails are in the log and in the counters of every later claim) */
      const held = [];
      try {
        let result;
        try {
          result = await processItem(work, { ...itemDeps, tally: shared.view(since, held) });
          summary.processed++;
        } catch (err) {
          console.error("roster outbox: event failed", work.event.id, err && err.name);
          result = { webhook: null, mails: [], skipped: [], error: "internal" };
        }

        let reported = await db.rpc(RPC.done, { p_id: work.event.idForDb, p_result: result });
        if (!reported.ok) reported = await db.rpc(RPC.done, { p_id: work.event.idForDb, p_result: result });
        if (reported.ok) summary.reported++;
        else {
          summary.reportFailed++;
          console.error("roster outbox: could not report event", work.event.id);
        }
      } finally {
        shared.logged(held);
      }
    }
  }

  const lanes = Math.max(1, Math.min(deps.concurrency ?? OUTBOX.concurrency, queue.length));
  await Promise.all(Array.from({ length: lanes }, worker));
  return summary;
}
