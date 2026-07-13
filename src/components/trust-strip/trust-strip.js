import { html } from "../../lib/html.js";

/* The trust strip: a compact row of three reasons to trust FLOA, shown right
   under the opening on every page. One line on a desktop; a tight, horizontally
   scrollable row on a phone so it never grows tall or forces the page wider.

   { items: [string] } */
export const trustStrip = ({ items }) => html`
  <aside class="trust-strip" aria-label="למה לבחור ב־FLOA">
    <div class="container">
      <ul class="trust-strip-list">
        ${items.map((item) => html`<li class="trust-strip-item">${item}</li>`)}
      </ul>
    </div>
  </aside>`;
