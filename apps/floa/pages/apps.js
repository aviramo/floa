import { html } from "#lib/html.js";
import { page } from "#layouts/base.js";
import { appsPage } from "../content/apps.js";

/* floa.co.il/apps: an index of every app, an icon, a name, a line. */
const card = (ctx, a) => html`
      <li class="apps-card">
        <a href="${a.href}" class="apps-link">
          <span class="apps-media"><img src="${ctx.url(a.img)}?v=3" alt="" loading="lazy" decoding="async" width="56" height="56"></span>
          <span class="apps-body">
            <span class="apps-name">${a.name}</span>
            <span class="apps-text">${a.text}</span>
          </span>
        </a>
      </li>`;

export const render = (ctx) => page(ctx, {
  path: "apps/",
  meta: appsPage.meta,
  og: false,
  body: html`
<main class="apps-index">
  <div class="container">
    <div class="apps-top">
      <a href="${ctx.home()}" class="apps-brand">${ctx.brand}</a>
      <a href="${ctx.home()}" class="apps-home">← חזרה לדף הבית</a>
    </div>
    <h1>${appsPage.title}</h1>
    <p class="apps-lead">${appsPage.lead}</p>
    ${appsPage.groups.map((g) => html`
    <section class="apps-group">
      <h2>${g.head}</h2>
      ${g.sub && html`<p class="apps-sub">${g.sub}</p>`}
      <ul class="apps-grid">${g.apps.map((a) => card(ctx, a))}</ul>
    </section>`)}
  </div>
</main>`,
});
