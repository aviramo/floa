import { html } from "../../lib/html.js";

/* The opening. Same skeleton on every page — the wordmark, the category, the
   promise, the ask, and only then the picture.

   The order matters: the buttons come BEFORE the art, so the ask is inside the
   first screen on a phone instead of below a tall illustration.

   The wordmark is plain text at home and a link back home everywhere else.

   The note sits under the buttons — small and quiet — and, like the actions,
   comes BEFORE the art so it stays inside the first screen on a phone.

   `className` is for a hero whose picture is a film: "hero-sync" (hero-motion.css)
   makes the copy arrive when the film starts.

   { title, text, chip, art, actions, note, className } */
export const hero = (ctx, { title, text, chip, art, actions, note, className }) => html`
  <section class="${className ? `hero ${className}` : "hero"}" id="hero">
    <div class="container">
      <div class="hero-inner">
        ${ctx.isHome
          ? html`<span class="hero-logo">${ctx.brand}</span>`
          : html`<a href="${ctx.home()}" class="hero-logo">${ctx.brand}</a>`}
        ${chip && html`<p class="hero-chip"><span>${chip}</span></p>`}
        <h1 class="hero-title">${title}</h1>
        <p class="hero-text">${text}</p>

        <div class="hero-actions">
          ${actions}
        </div>
        ${note && html`<p class="hero-note">${note}</p>`}
        ${art}
      </div>
    </div>
  </section>`;
