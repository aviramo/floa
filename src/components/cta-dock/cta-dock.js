import { html } from "../../lib/html.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* The fixed mobile CTA. Below 768px it docks to the bottom of the screen so the
   primary action — WhatsApp — is always one tap away. It only shows once the
   visitor has passed the hero, and hides again over the contact form; that logic
   lives in cta-dock.client.js. { label } */
export const ctaDock = (ctx, { label }) => html`
  <div class="cta-dock" data-cta-dock>
    <div class="container">
      ${waButton(ctx, { label, block: true })}
    </div>
  </div>`;
