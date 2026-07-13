import { html } from "../../lib/html.js";
import { icon } from "../icon/icon.js";

/* Before / after, side by side with an arrow between them.
   { before:{tag,text}, after:{tag,text} } */
export const baStrip = ({ before, after }) => html`
      <div class="ba-strip reveal">
        <div class="ba-side">
          <span class="ba-tag ba-tag-before">${before.tag}</span>
          <p>${before.text}</p>
        </div>
        <div class="ba-arrow" aria-hidden="true">${icon("arrow")}</div>
        <div class="ba-side ba-side-after">
          <span class="ba-tag ba-tag-after">${after.tag}</span>
          <p>${after.text}</p>
        </div>
      </div>`;
