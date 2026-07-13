import { html } from "../../lib/html.js";

/* A row of pills. Short facts that would be noise as sentences — skills, or the
   kinds of site we build. { items: [string] } */
export const chips = ({ items }) => html`
        <ul class="chips">
          ${items.map((item) => html`<li>${item}</li>`)}
        </ul>`;
