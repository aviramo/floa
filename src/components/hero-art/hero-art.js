import { html, raw } from "../../lib/html.js";

/* Each solution page gets its OWN hero illustration instead of the shared system
   diagram. They are drawn from one palette and one set of card/line-icon
   primitives (see hero-art.css), so the five pages read as a family while each
   picture is unique. The shapes live in src/content/hero-art/<slug>.svg — this
   component owns the frame, the viewBox and the palette.

   { label, shapes } */
export const heroArt = ({ label, shapes }) => html`
        <div class="hero-art">
          <svg class="hero-illust" viewBox="-24 -14 768 488" role="img" aria-label="${label}">
${raw(shapes)}
          </svg>
        </div>`;
