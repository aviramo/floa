import { attrs, cx, html, raw } from "../../lib/html.js";
import { icon as renderIcon } from "../icon/icon.js";

/* One card recipe, reused everywhere: icon, title, text — optionally a link, a
   wide layout (icon beside the copy), or a "you are here" badge.

   { icon, title, text, href, wide, current, badge, className, reveal } */
export function card(ctx, { icon, title, text, href, wide, current, badge, className, reveal = true }) {
  const a = attrs({
    class: cx("card", wide && "card-wide", current && "is-current", className, reveal && "reveal"),
    href: href && !current ? ctx.url(href) : null,
  });

  const body = html`<h3>${title}</h3>
          ${text && html`<p>${text}</p>`}
          ${badge && html`<span class="eco-here">${badge}</span>`}`;

  return html`<${raw(href && !current ? "a" : "article")}${a}>
          ${icon && html`<span class="card-icon" aria-hidden="true">${renderIcon(icon)}</span>`}
          ${wide ? html`<div>${body}</div>` : body}
        </${raw(href && !current ? "a" : "article")}>`;
}

/* the grid the cards live in — 2 columns, one card may span both */
export const cardGrid = ({ className, children }) => html`
      <div class="${cx("solutions-grid", className)}">
        ${children}
      </div>`;
