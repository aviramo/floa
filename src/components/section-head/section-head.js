import { cx, html } from "../../lib/html.js";

/* The head is IDENTICAL in every section — eyebrow, h2, lead — and always
   centred. Centring is not a modifier: it is the only option, so no section can
   drift out of alignment with the others.

   { eyebrow, title, text, reveal } */
export const sectionHead = ({ eyebrow, title, text, reveal = true }) => html`
      <div class="${cx("section-head", reveal && "reveal")}">
        ${eyebrow && html`<p class="eyebrow">${eyebrow}</p>`}
        <h2>${title}</h2>
        ${text && html`<p>${text}</p>`}
      </div>`;
