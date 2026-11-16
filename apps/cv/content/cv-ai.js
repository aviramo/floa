/* ==========================================================================
   The CV at /cv/ itself: the analyst CV, under the root address.

   This file used to hold a separate Solutions Architect / AI document. The
   positioning changed (2026-11-16): /cv/ is the Senior Systems Analyst CV, and
   its text lives once, in cv-analyst.js. Only the address and the PDF differ.

     dist/cv/index.html         ->  floa.co.il/cv/      (Hebrew, the default)
     dist/cv/en/index.html      ->  floa.co.il/cv/en/   (English)
   Its PDFs sit in cv/ai/, which is a folder of files and not a page.
   ========================================================================== */
import { address, pdf } from "./cv-shared.js";
import { analystEn, analystHe } from "./cv-analyst.js";

export const aiEn = { ...analystEn, ...address("", "en"), download: pdf("ai", "en") };
export const aiHe = { ...analystHe, ...address("", "he"), download: pdf("ai", "he") };
