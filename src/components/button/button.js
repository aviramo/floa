import { attrs, cx, html } from "../../lib/html.js";

/* One button. It renders as <a> when given an href and <button> otherwise, so a
   CTA and a form submit can never drift apart visually.

   { href, label, variant: primary|ghost|whatsapp, size: lg, block, inline,
     whatsapp, analytics, type, children }

   whatsapp:true only marks the element — the real wa.me href is written at
   runtime from one number in site config (see whatsapp-button.client.js). */
export function button(ctx, { href, label, variant = "primary", size, block, inline, whatsapp, analytics, type, className, children } = {}) {
  const a = attrs({
    class: cx("btn", variant && `btn-${variant}`, size && `btn-${size}`, block && "btn-block", inline && "btn-inline", className),
    "data-whatsapp": whatsapp || null,
    "data-analytics": analytics,
  });
  const body = children ?? label;
  const link = whatsapp ? "#" : href;

  return link
    ? html`<a href="${ctx.url(link)}"${a}>${body}</a>`
    : html`<button type="${type ?? "button"}"${a}>${body}</button>`;
}
