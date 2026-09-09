/* ==========================================================================
   Every CV this business publishes.

   One career, told more than once. Each document is a file of its own copy,
   and they all share their addresses, contact details and photograph through
   cv-shared.js so nothing about the man himself can differ between them.

     cv-architect.js   floa.co.il/cv/architect/   solution design first
     cv-analyst.js     floa.co.il/cv/analyst/     mobile and web analysis first

   A third one is a third file and one more line in the list below.
   ========================================================================== */
import { architectEn, architectHe } from "./cv-architect.js";
import { analystEn, analystHe } from "./cv-analyst.js";

export const cvPages = [architectEn, architectHe, analystEn, analystHe];
