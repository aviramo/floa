import { html } from "../../lib/html.js";
import { button } from "../button/button.js";

/* The fixed mobile CTA. Below 768px it docks to the bottom of the screen and
   points at the contact form, so the ask is always one tap away. It only shows
   once the visitor has passed the hero and hides again over the form itself —
   that logic lives in cta-dock.client.js. { label } */
export const ctaDock = (ctx, { label }) => html`
  <div class="cta-dock" data-cta-dock>
    <div class="container">
      ${button(ctx, { href: "#contact", label, block: true, analytics: "sticky_cta" })}
    </div>
  </div>`;
