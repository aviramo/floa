import { html } from "../../lib/html.js";
import { icon as renderIcon } from "../icon/icon.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* ==========================================================================
   One thing a business sells, on a page that holds all of it.

   It says four things and stops: the pain, in the words of the person who has
   it; what gets built; the one line that is true of the way it is built; and a
   way to talk about exactly this. It is a column, not a box: the page that uses
   it lays two of them side by side.

   The way to talk is a WhatsApp link that opens on THIS subject (`waText`), so
   the conversation starts where the reader was reading.

   { icon, title, pain, items:[text], note, proof, cta:{label, waText} } */
export const solutionPanel = (ctx, { icon, title, pain, items, note, proof, cta }) => html`
        <article class="solution-panel reveal">
          ${icon && html`<span class="card-icon card-icon-tile" aria-hidden="true">${renderIcon(icon)}</span>`}
          <h3>${title}</h3>
          <p class="sp-pain">${pain}</p>
          <ul class="sp-list">
            ${items.map((item) => html`<li>${item}</li>`)}
          </ul>
          ${note && html`<p class="sp-note">${note}</p>`}
          ${proof && html`<p class="sp-proof">${proof}</p>`}
          ${cta && waButton(ctx, { label: cta.label, variant: "link", size: null, waText: cta.waText, className: "sp-cta" })}
        </article>`;

export const solutionPanels = ({ children }) => html`
      <div class="solution-panels">
        ${children}
      </div>`;
