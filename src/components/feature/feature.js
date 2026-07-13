import { html } from "../../lib/html.js";

/* Why FLOA: three reasons, no icons — the copy carries it. { items:[{title,text}] } */
export const features = ({ items }) => html`
      <div class="features-grid">
        ${items.map((item) => html`
        <article class="feature reveal">
          <h3>${item.title}</h3>
          <p>${item.text}</p>
        </article>`)}
      </div>`;
