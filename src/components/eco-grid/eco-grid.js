import { html } from "../../lib/html.js";
import { card, cardGrid } from "../card/card.js";

/* "The full picture": all five solutions as one connected system, shown UNDER
   the form on every page — so a visitor who has just read one solution can find
   the rest without those links competing with the ask.

   It owns no box of its own: every tile is the shared card, marked `current` on
   the page you are already on. All this adds is the row and the closing line.

   { solutions, current: slug, note: markup, badge } */
export const ecoGrid = (ctx, { solutions, current, note, badge }) => html`
      ${cardGrid({
        className: "eco-grid reveal",
        children: solutions.map((s) =>
          card(ctx, {
            icon: s.icon,
            title: s.title,
            text: s.tagline,
            href: `${s.slug}/`,
            current: s.slug === current,
            badge: s.slug === current ? badge : null,
            size: "sm",
            reveal: false,          // the grid reveals as one block, not card by card
          })
        ),
      })}
      ${note && html`<p class="eco-note">${note}</p>`}`;
