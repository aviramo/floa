import { html } from "../../lib/html.js";

/* Client words. Which quotes a page shows, and in what order, is the page's
   decision — the component only knows how to set them. { items:[{text,name,role}] } */
export const quotes = ({ items }) => html`
      <div class="quotes-grid">
        ${items.map((quote) => html`
        <figure class="quote-card reveal">
          <span class="quote-mark" aria-hidden="true">”</span>
          <blockquote class="quote-text">${quote.text}</blockquote>
          <figcaption class="quote-by">
            <span class="quote-name">${quote.name}</span>
            <span class="quote-role">${quote.role}</span>
          </figcaption>
        </figure>`)}
      </div>`;
