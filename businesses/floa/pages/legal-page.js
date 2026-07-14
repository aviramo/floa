import { legal } from "#components/legal/legal.js";
import { page } from "#layouts/base.js";

/* Privacy and accessibility: the same shell, no OG card (they are not shared),
   no lead form. */
export const render = (ctx, doc) => page(ctx, {
  path: doc.out,
  meta: doc.meta,
  og: false,
  body: legal(ctx, doc),
});
