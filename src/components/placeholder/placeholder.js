import { cx, html, raw } from "../../lib/html.js";
import { icon } from "../icon/icon.js";

/* A held slot for a REAL screenshot that does not exist yet.

   It never invents data, a chart or a device mockup — it says, in the site's own
   language, what belongs here, and leaves an HTML comment for whoever drops the
   file in. Swap it for image() the moment the real asset lands.

   { text, replace, frame: desktop|mobile|wide, caption } */
export const placeholder = ({ text, replace, frame = "wide", caption }) => html`
          <!-- ${raw(replace)} -->
          <figure class="${cx("placeholder", `placeholder-${frame}`)}">
            <div class="placeholder-box" role="img" aria-label="${text}">
              <span class="placeholder-icon" aria-hidden="true">${icon("picture")}</span>
              <span class="placeholder-text">${text}</span>
            </div>
            ${caption && html`<figcaption class="placeholder-caption">${caption}</figcaption>`}
          </figure>`;

/* Two of them side by side — a site shown on a desktop and on a phone. */
export const placeholderPair = ({ items }) => html`
      <div class="placeholder-pair">
        ${items.map((item) => placeholder(item))}
      </div>`;
