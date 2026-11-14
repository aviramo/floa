import { html } from "#lib/html.js";
import { page } from "#layouts/base.js";
import { appsPage } from "../content/apps.js";

/* floa.co.il/apps: an index of every app, a picture, a name, a line. */
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
    <ul class="apps-grid">
      ${appsPage.apps.map((a) => html`
      <li class="apps-card">
        <a href="${a.href}" class="apps-link" aria-label="${a.name}: ${a.text}">
          <span class="apps-media"><img src="${ctx.url(a.img)}" alt="${a.alt}" loading="lazy" decoding="async" width="800" height="500"></span>
          <span class="apps-body">
            <span class="apps-name">${a.name}</span>
            <span class="apps-text">${a.text}</span>
          </span>
        </a>
      </li>`)}
    </ul>
  </div>
</main>`,
});
