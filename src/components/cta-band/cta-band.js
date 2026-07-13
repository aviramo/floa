import { html } from "../../lib/html.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* The mid-page ask: one heading, one line, one button — and that button is the
   page's WhatsApp CTA, the same component the hero opens with, carrying the same
   message. { id, title, text, cta } */
export const ctaBand = (ctx, { id = "cta", title, text, cta }) => html`
  <section class="cta-band" id="${id}">
    <div class="container">
      <div class="cta-inner reveal">
        <h2>${title}</h2>
        <p>${text}</p>
        ${waButton(ctx, { label: cta, inline: true })}
      </div>
    </div>
  </section>`;
