import { cx, html } from "../../lib/html.js";

/* A process, drawn: pills joined by arrows. It reads right-to-left on a desktop
   and top-to-bottom on a phone — the arrow flips with it, in CSS.

   { steps: [string], vertical } — vertical keeps it stacked at any width, which
   is what a flow inside a card needs. */
export const flow = ({ steps, vertical }) => html`
        <ol class="${cx("flow", vertical && "flow-vertical")}">
          ${steps.map((step) => html`<li class="flow-step"><span class="flow-label">${step}</span></li>`)}
        </ol>`;

/* Several flows side by side, each NAMED and in its own card — the name says
   what the automation is for, the flow says what it actually does.
   { items: [{ title, steps }] } */
export const flowCards = ({ items }) => html`
      <div class="flow-cards">
        ${items.map((item) => html`
        <div class="card flow-card reveal">
          ${item.title && html`<h3>${item.title}</h3>`}
          ${flow({ steps: item.steps, vertical: true })}
        </div>`)}
      </div>`;
