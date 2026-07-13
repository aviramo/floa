import { attrs, cx, html, raw } from "../../lib/html.js";
import { icon as renderIcon } from "../icon/icon.js";

/* ==========================================================================
   ONE card. Every boxed item on the site is this — the solution cards, the
   pains, the checklist of what gets built, the reasons to choose FLOA, the
   ecosystem tiles. They were once four components with four near-identical
   stylesheets (same surface, hairline, radius, padding and shadow, re-declared
   each time); they are one recipe with a few honest switches:

     icon      — an icon name, shown in a badge
     shape     — the badge: "tile" (rounded square) or "dot" (small circle)
     accent    — a hairline of colour along the top: "teal" or "water"
     row       — lay the badge BESIDE the copy instead of above it
     size      — "sm" tightens the type (the ecosystem tiles, the pains)
     href      — makes the whole card a link
     current   — this card is the page you are on: highlighted, not a link
     badge     — the "you are here" pill
     wide      — span the full row, badge beside the copy

   Anything boxed that is NOT one of these is a bug in the content, not a
   missing component.
   ========================================================================== */
export function card(ctx, { icon, title, text, href, wide, current, badge, accent, shape = "tile", row, size, className, reveal = true }) {
  const link = href && !current;
  const tag = link ? "a" : "article";
  const beside = row || wide;

  const a = attrs({
    class: cx(
      "card",
      accent && `card-${accent}`,
      beside && "card-row",
      wide && "card-wide",
      size && `card-${size}`,
      current && "is-current",
      className,
      reveal && "reveal"
    ),
    href: link ? ctx.url(href) : null,
  });

  const body = html`<h3>${title}</h3>
          ${text && html`<p>${text}</p>`}
          ${badge && html`<span class="card-badge">${badge}</span>`}`;

  return html`<${raw(tag)}${a}>
          ${icon && html`<span class="${cx("card-icon", `card-icon-${shape}`)}" aria-hidden="true">${renderIcon(icon)}</span>`}
          ${beside ? html`<div class="card-body">${body}</div>` : body}
        </${raw(tag)}>`;
}

/* The grid they live in. `cols` is the DESKTOP count and the only knob — the
   breakpoints in card.css take it down to two and then to one on their own, so
   no section has to think about a phone. Every card in a row is the same height
   because the grid stretches them and the card fills what it is given. */
export const cardGrid = ({ cols = 2, className, children }) => html`
      <div class="${cx("card-grid", `cards-${cols}`, className)}">
        ${children}
      </div>`;
