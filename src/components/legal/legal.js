import { html } from "../../lib/html.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* Privacy and accessibility: prose, but still built from blocks rather than a
   hand-written page, so both stay in the site's voice and shape.

   Blocks are authored in src/content/legal.js as { h2 } | { p } | { list }. */
const block = (b) =>
  b.h2 ? html`<h2>${b.h2}</h2>`
  : b.list ? html`<ul class="legal-list">${b.list.map((li) => html`<li>${li}</li>`)}</ul>`
  : html`<p>${b.p}</p>`;

/* { title, updated, blocks, foot, backLabel } */
export const legal = (ctx, { title, updated, blocks, foot }) => html`
<main class="legal">
  <div class="container">
    <div class="legal-top">
      <a href="${ctx.home()}" class="legal-brand">${ctx.brand}</a>
      <a href="${ctx.home()}" class="legal-home">← חזרה לדף הבית</a>
    </div>

    <h1>${title}</h1>
    <p class="legal-updated">${updated}</p>

    ${blocks.map(block)}

    <div class="legal-foot">
      <p>${foot.text}</p>
      ${waButton(ctx, { label: foot.whatsapp.label, inline: true })}
    </div>
  </div>
</main>`;
