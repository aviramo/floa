/* ==========================================================================
   What wrangler deploys: the request handler, and the Workflow beside it.

   Both have to be exported from ONE entry point for the runtime to find them,
   and this file exists so that the entry point is the only thing that imports
   `cloudflare:workers`. That import is real only inside the Workers runtime,
   so anything reaching for it cannot be loaded by plain node, and the tests
   drive index.js in plain node. Keeping it here is what lets the lead endpoint
   and the transcribe endpoint stay testable without a runtime to host them.
   ========================================================================== */
export { default } from "./index.js";
export { ReadSong } from "./read-workflow.js";
