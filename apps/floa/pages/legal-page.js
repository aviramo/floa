import { legal } from "#components/legal/legal.js";
import { page } from "#layouts/base.js";
import { site } from "../content/site.js";

/* Privacy and accessibility: the same shell, no OG card (they are not shared),
   no lead form. */
export const render = (ctx, doc) => page(ctx, {
  path: `${site.folder}${doc.out}`,      // /floa/privacy.html, not /privacy.html
  meta: doc.meta,
  og: false,
  body: legal(ctx, doc),
});
