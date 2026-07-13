import { html } from "../../lib/html.js";

/* The urgency band: one short line, right after the pains, that names the cost
   of waiting. Emphasised but calm — a tinted panel, no red, no warning marks,
   no animation. { text } */
export const urgency = ({ text }) => html`
  <aside class="urgency reveal" role="note">
    <div class="container">
      <p class="urgency-line">${text}</p>
    </div>
  </aside>`;
