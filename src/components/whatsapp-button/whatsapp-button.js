import { html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { icon } from "../icon/icon.js";

/* The WhatsApp CTA: a real button with the mark in its own badge and the label
   stacked over a sub-label — not a sentence with a link in it. */
export const whatsappButton = (ctx, { label, sub, inline = false } = {}) =>
  button(ctx, {
    variant: "whatsapp",
    size: "lg",
    inline,
    whatsapp: true,
    analytics: "whatsapp_cta",
    children: html`
          <span class="wa-mark" aria-hidden="true">${icon("whatsapp")}</span>
          <span class="btn-stack">
            <span>${label}</span>
            ${sub && html`<span class="btn-sub">${sub}</span>`}
          </span>
        `,
  });
