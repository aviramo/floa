import { html } from "../../lib/html.js";

/* The objections, answered before the ask. A plain <details> accordion: it is
   open-able with a keyboard, announced by a screen reader and readable with no
   JS at all — faq.client.js only adds the "one open at a time" behaviour on top.

   { items: [{ q, a }] } */
export const faq = ({ items }) => html`
      <div class="faq reveal" data-faq>
        ${items.map((item) => html`
        <details class="faq-item">
          <summary class="faq-q">
            <span>${item.q}</span>
            <span class="faq-mark" aria-hidden="true"></span>
          </summary>
          <div class="faq-a"><p>${item.a}</p></div>
        </details>`)}
      </div>`;
