import { html } from "../../lib/html.js";

/* The opening. Same skeleton on every page — the wordmark, the category, the
   promise, the ask, and only then the picture.

   The order matters: the buttons come BEFORE the art, so the ask is inside the
   first screen on a phone instead of below a tall illustration.

   The wordmark is plain text at home and a link back home everywhere else.

   The note sits under the buttons — small and quiet — and, like the actions,
   comes BEFORE the art so it stays inside the first screen on a phone.

   `artFirst` puts the picture ABOVE the headline, for an opening that is led by
   a film which says what the business is, with the words coming after it. That
   film carries the brand's mark, so the wordmark above it is not drawn.
   `className` "hero-sync" (hero-motion.css) makes that copy arrive once the film
   has started.

   { title, text, chip, art, actions, note, className, artFirst } */
export const hero = (ctx, { title, text, chip, art, actions, note, className, artFirst }) => html`
  <section class="${className ? `hero ${className}` : "hero"}" id="hero">
    <div class="container">
      <div class="hero-inner">
        ${artFirst ? "" : ctx.isHome
          ? html`<span class="hero-logo">${ctx.brand}</span>`
          : html`<a href="${ctx.home()}" class="hero-logo">${ctx.brand}</a>`}
        ${chip && html`<p class="hero-chip"><span>${chip}</span></p>`}
        ${artFirst && art}
        <h1 class="hero-title">${title}</h1>
        <p class="hero-text">${text}</p>

        <div class="hero-actions">
          ${actions}
        </div>
        ${note && html`<p class="hero-note">${note}</p>`}
        ${!artFirst && art}
      </div>
    </div>
  </section>`;
