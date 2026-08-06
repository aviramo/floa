import { WorkflowEntrypoint } from "cloudflare:workers";
import { readAndSave } from "./transcribe.js";

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
   ========================================================================== */
export class ReadSong extends WorkflowEntrypoint {
  async run(event, step) {
    const { token, songId, files } = event.payload;

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
  }
}
