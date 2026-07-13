import { html } from "../../lib/html.js";
import { button } from "../button/button.js";

/* The mid-page ask: one heading, one line, one button. { id, title, text, cta } */
export const ctaBand = (ctx, { id = "cta", title, text, cta }) => html`
  <section class="cta-band" id="${id}">
    <div class="container">
      <div class="cta-inner reveal">
        <h2>${title}</h2>
        <p>${text}</p>
        ${button(ctx, { href: "#contact", label: cta, size: "lg", analytics: "cta_mapping_cta" })}
      </div>
    </div>
  </section>`;
