import { html } from "../../lib/html.js";

/* The process: a numbered ladder. Numbers are derived, never authored.

   A step may carry a `note`: one line, set apart under its copy, for the thing
   that is true of THIS step and is worth saying in the first person. It wears
   the step's own hue, so it reads as part of the step rather than as an aside
   bolted onto it. { items:[{title,text,note}] } */
export const timeline = ({ items }) => html`
      <ol class="timeline">
        ${items.map((step, i) => html`
        <li class="tl-item reveal">
          <span class="tl-num">${String(i + 1).padStart(2, "0")}</span>
          <div class="tl-body">
            <h3>${step.title}</h3>
            <p>${step.text}</p>
            ${step.note && html`<p class="tl-note">${step.note}</p>`}
          </div>
        </li>`)}
      </ol>`;
