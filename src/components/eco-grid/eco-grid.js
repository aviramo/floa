import { html } from "../../lib/html.js";
import { card, cardGrid } from "../card/card.js";

/* "The full picture": all five solutions as one connected system. Every
   solution page shows it, so the visitor grasps that FLOA is one system and not
   a single trick — the page's own solution is highlighted, the rest link out.

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
            className: "eco-card",
            reveal: false,          // the grid reveals as one block, not card by card
          })
        ),
      })}
      ${note && html`<p class="eco-note">${note}</p>`}`;
