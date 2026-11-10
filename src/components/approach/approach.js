import { html } from "../../lib/html.js";
import { image } from "../image/image.js";
import { timeline } from "../timeline/timeline.js";

/* A picture beside a short list of principles, under an optional line of lead
   copy. { intro, picture, principles:[{title,text}] }

   Given `steps` instead of principles, the picture sits beside the numbered
   steps of a process: the same two columns, with the way the work goes in place
   of the way it is thought about. */
export const approach = (ctx, { intro, picture, principles, steps }) => html`
      ${intro && html`<p class="approach-intro reveal">${intro}</p>`}
      <div class="approach-grid">
        <div class="approach-media reveal">
          ${image(ctx, picture)}
        </div>

        ${steps ? html`<div class="approach-steps">${timeline({ items: steps })}</div>` : html`
        <div class="principles reveal">
          ${principles.map((p) => html`
          <div class="principle">
            <h3>${p.title}</h3>
            <p>${p.text}</p>
          </div>`)}
        </div>`}
      </div>`;
