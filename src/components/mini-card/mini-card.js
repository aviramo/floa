import { html } from "../../lib/html.js";

/* The pain points: four equal cards, one line of copy each. { items:[{title,text}] } */
export const miniCards = ({ items }) => html`
      <ul class="mini-cards">
        ${items.map((item) => html`
        <li class="mini-card reveal">
          <strong>${item.title}</strong>
          <p>${item.text}</p>
        </li>`)}
      </ul>`;
