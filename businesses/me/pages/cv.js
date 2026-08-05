import { resume } from "#components/resume/resume.js";
import { resumeDocument } from "#layouts/resume.js";

/* The CV, in whichever language it is handed. Both versions are the same call:
   the language, the direction and the copy all ride on the `cv` object (see
   ../content/cv.js), so there is no English page and a Hebrew page here, only
   one page rendered twice. */
export const render = (ctx, cv) => resumeDocument(ctx, {
  lang: cv.lang,
  dir: cv.dir,
  path: cv.path,
  meta: cv.meta,
  alternates: cv.alternates,
  body: resume(ctx, cv),
});
