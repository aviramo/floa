import { html } from "../../lib/html.js";
import { icon } from "../icon/icon.js";

/* "What's included": the solution itemised, two columns of ticked lines.
   { items:[{title,text}] } */
export const checklist = ({ items }) => html`
      <ul class="checklist">
        ${items.map((item) => html`
        <li class="check-item reveal">
          <span class="check-ic" aria-hidden="true">${icon("check")}</span>
          <div>
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </div>
        </li>`)}
      </ul>`;
