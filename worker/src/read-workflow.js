import { WorkflowEntrypoint } from "cloudflare:workers";
import { readAndSave, turnFor } from "./transcribe.js";

/* ==========================================================================
   Reading a chord sheet, as work that outlives everything.

   THIS EXISTS BECAUSE THE TWO SIMPLER WAYS BOTH FAILED, each in its own way,
   and both failures are worth keeping written down:

     Waiting for the answer. A request that goes quiet is cut at a hundred
     seconds with a 524, and a careful read takes longer than that.

     Handing the work to ctx.waitUntil. The runtime cancels work that outlives
     its request, and said so in the log in as many words: "waitUntil() tasks
     did not complete within the allowed time after invocation end and have
     been cancelled."

     Holding the connection open from the browser. It works, right up until
     the person reloads the page, and then the read dies mid-sentence with
     nothing to show for it. The log calls that one "Canceled".

   A Workflow has no such tie. It is started by a request and then belongs to
   nobody: it survives the response, the tab, the reload and the laptop lid.
   Which is the only honest way to promise what the app promises, that a song
   read from a photograph finishes whether or not anyone is watching.

   The song lands on its row exactly as before (see readAndSave), so nothing
   downstream knows or cares that this is where the work happens now.

   WAITING IS PART OF THE WORK. A folder of sheets starts a Workflow each, and
   they queue rather than all calling the model at once (see turnFor). Sleeping
   here rather than inside the read is what makes the waiting free: a sleeping
   Workflow costs nothing and holds nothing open, and the queue survives a
   restart because the queue is the table, not a variable in this file.
   ========================================================================== */

/* Long enough that a whole queue does not churn, short enough that a cancelled
   song ahead frees this one within a moment of somebody pressing the button. */
const CHECK_EVERY = "15 seconds";
const GIVE_UP_AFTER = 80;                    // twenty minutes of taking turns

export class ReadSong extends WorkflowEntrypoint {
  async run(event, step) {
    const { token, songId, files } = event.payload;

    for (let round = 0; round < GIVE_UP_AFTER; round++) {
      const turn = await step.do(
        `is it this song's turn (${round})`,
        { retries: { limit: 2, delay: "5 seconds" }, timeout: "1 minute" },
        () => turnFor(this.env, token, songId)
      );

      /* CANCELLED. The row is gone, or somebody has already dealt with it, so
         there is nothing to read and nowhere to put it. Stopping here is the
         whole of cancelling, and it costs nothing because nothing was spent. */
      if (turn === "gone") return "cancelled";
      if (turn === "go") break;

      await step.sleep(`waiting for a turn (${round})`, CHECK_EVERY);
    }

    /* One step, because the read is one indivisible thing: half a song is not
       worth keeping and cannot be resumed from. `readAndSave` writes its own
       failure onto the row rather than throwing, so a retry here would only
       repeat a decision that has already been recorded. */
    await step.do(
      "read the sheet and save the song",
      { retries: { limit: 0, delay: "10 seconds" }, timeout: "15 minutes" },
      async () => {
        await readAndSave(this.env, token, songId, files);
        return songId;
      }
    );

    return songId;
  }
}
