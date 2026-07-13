import { html } from "../../lib/html.js";
import { chips as chipRow } from "../chips/chips.js";
import { image } from "../image/image.js";

/* Who is behind this. { portrait, eyebrow, title, paragraphs, chips, emphasis } */
export const about = (ctx, { portrait, eyebrow, title, paragraphs, chips, emphasis }) => html`
      <div class="about-inner reveal">
        <div class="about-avatar">
          ${image(ctx, portrait)}
        </div>

        <p class="eyebrow">${eyebrow}</p>
        <h2>${title}</h2>

        ${paragraphs.map((text) => html`<p>${text}</p>`)}

        ${chipRow({ items: chips })}
        ${emphasis && html`<span class="emphasis">${emphasis}</span>`}
      </div>`;
