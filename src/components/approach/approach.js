import { html } from "../../lib/html.js";
import { image } from "../image/image.js";

/* A picture beside a short list of principles, under an optional line of lead
   copy. { intro, picture, principles:[{title,text}] } */
export const approach = (ctx, { intro, picture, principles }) => html`
      ${intro && html`<p class="approach-intro reveal">${intro}</p>`}
      <div class="approach-grid">
        <div class="approach-media reveal">
          ${image(ctx, picture)}
        </div>

        <div class="principles reveal">
          ${principles.map((p) => html`
          <div class="principle">
            <h3>${p.title}</h3>
            <p>${p.text}</p>
          </div>`)}
        </div>
      </div>`;
