import { attrs, html } from "../../lib/html.js";

/* Every <img> on the site comes from here, so every one of them carries its
   intrinsic size (no layout shift), lazy-loads and decodes off the main thread
   — and a src is resolved for the page's depth exactly once, here. */
export const image = (ctx, { src, alt, width, height, className, eager = false }) => html`<img${attrs({
  src: ctx.url(src),
  width,
  height,
  alt,
  class: className,
  loading: eager ? "eager" : "lazy",
  decoding: "async",
})}>`;
