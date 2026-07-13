import { html } from "../../lib/html.js";

/* The process: a numbered ladder. Numbers are derived, never authored.
   { items:[{title,text}] } */
export const timeline = ({ items }) => html`
      <ol class="timeline">
        ${items.map((step, i) => html`
        <li class="tl-item reveal">
          <span class="tl-num">${String(i + 1).padStart(2, "0")}</span>
          <div class="tl-body">
            <h3>${step.title}</h3>
            <p>${step.text}</p>
          </div>
        </li>`)}
      </ol>`;
