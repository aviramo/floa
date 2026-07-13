import { cx, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { icon } from "../icon/icon.js";

/* Two ways to reach the same landing page. Neither track may look like the
   other's leftovers: the richer one earns its emphasis through its own accent
   and a small badge, never by making the plain one look worse.
   { tracks: [{ title, items, cta, href, accent, badge, analytics }] } */
export const compare = (ctx, { tracks }) => html`
      <div class="compare-grid">
        ${tracks.map((t) => html`
        <div class="${cx("compare-card reveal", t.accent && `compare-${t.accent}`)}">
          ${t.badge && html`<span class="compare-badge">${t.badge}</span>`}
          <h3>${t.title}</h3>
          <ul class="compare-list">
            ${t.items.map((item) => html`
            <li><span class="compare-check" aria-hidden="true">${icon("check")}</span>${item}</li>`)}
          </ul>
          ${button(ctx, {
            href: t.href,
            label: t.cta,
            variant: t.accent === "teal" ? "primary" : "ghost",
            size: "lg",
            block: true,
            analytics: t.analytics,
          })}
        </div>`)}
      </div>`;
