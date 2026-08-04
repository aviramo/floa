import { html, raw } from "../../lib/html.js";

/* ==========================================================================
   resume — a CV, as a document.

   Nothing here knows whose CV it is. The name, the roles, the jobs and the
   dates all arrive as data (see the shape below); this file only knows how a
   résumé is drawn: a badge and a rule per section, an indented body under the
   heading, and a small vocabulary of block types that a CV is actually made of.

   It is deliberately NOT built from the marketing components. A hero, a card
   and a section-head describe a page that persuades; a CV is a printed page
   that lists. The two share a palette and nothing else.

     {
       name, roles: [string],
       contact: [{ icon, text, href }],
       altLang: { href, label, lang },
       sections: [
         { type: "text",     icon, title, note, body: [string] }
         { type: "skills",   icon, title, items: [{ icon, title, text }] }
         { type: "project",  icon, title, note, lead, bullets: [string] }
         { type: "jobs",     icon, title, note, jobs: [{ role, dates, bullets }] }
         { type: "stack",    icon, title, rows: [{ label, value }] }
         { type: "entries",  icon, title, entries: [{ title, years, lines, note }] }
       ]
     }

   `note` is the small grey aside next to a heading. `dates`, `years` and a
   stack row's `value` are wrapped in dir="ltr": they are Latin and numeric, and
   in an RTL document the bidi algorithm would otherwise reorder "2014 - 2017"
   into "2017 - 2014".
   ========================================================================== */

/* Solid glyphs: white, inside a filled disc. */
const SOLID = {
  pin: `<path d="M12 2.2a6.6 6.6 0 0 0-6.6 6.6c0 4.9 6.6 12.9 6.6 12.9s6.6-8 6.6-12.9A6.6 6.6 0 0 0 12 2.2Zm0 9.1a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5Z"/>`,
  phone: `<path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.5 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .6 3.6 1 1 0 0 1-.3 1l-2.2 2.2Z"/>`,
  mail: `<path d="M2.6 6.8c0-.9.7-1.6 1.6-1.6h15.6c.9 0 1.6.7 1.6 1.6v.5L12 13 2.6 7.3v-.5Zm0 2.6L12 15.1l9.4-5.7v7.8c0 .9-.7 1.6-1.6 1.6H4.2c-.9 0-1.6-.7-1.6-1.6V9.4Z"/>`,
  linkedin: `<path d="M5 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3 9.5h4V21H3V9.5Zm6 0h3.8v1.6h.1c.5-1 1.8-2 3.7-2 4 0 4.8 2.6 4.8 6V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9V9.5Z"/>`,
  user: `<path d="M12 12.1a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0 1.6c-3.5 0-7 1.8-7 4.2v1.5c0 .6.5 1.1 1.1 1.1h11.8c.6 0 1.1-.5 1.1-1.1v-1.5c0-2.4-3.5-4.2-7-4.2Z"/>`,
  star: `<path d="m12 2.9 2.8 5.7 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9L12 2.9Z"/>`,
  rocket: `<path d="M14.6 3.3c2.9-1.8 5.6-1.6 6.6-1.4.2 1 .4 3.7-1.4 6.6-1.4 2.3-3.4 4.3-5.4 5.7l-3.9-3.9c1.4-2 3.4-4 5.7-5.4Zm1.6 4.5a1.7 1.7 0 1 0 2.4-2.4 1.7 1.7 0 0 0-2.4 2.4ZM9.4 8.6 4.7 9.9l2.7 2.7c.6-.9 1.3-1.7 2-2.6V8.6Zm6 6h-1.4c-.9.7-1.7 1.4-2.6 2l2.7 2.7 1.3-4.7ZM6.1 17.9c-1 1-1.2 4-1.2 4s3-.2 4-1.2a2 2 0 1 0-2.8-2.8Z"/>`,
  briefcase: `<path d="M9.6 2.9h4.8c1.1 0 2 .9 2 2v1.4h-1.9V5.1a.3.3 0 0 0-.3-.3H9.8a.3.3 0 0 0-.3.3v1.2H7.6V4.9c0-1.1.9-2 2-2Z"/><path d="M3.4 7.5h17.2c.9 0 1.6.7 1.6 1.6v3.4H14.9v-1a.9.9 0 0 0-.9-.9h-4a.9.9 0 0 0-.9.9v1H1.8V9.1c0-.9.7-1.6 1.6-1.6Z"/><path d="M1.8 13.7h7.3v1.2c0 .5.4.9.9.9h4c.5 0 .9-.4.9-.9v-1.2h7.3v5.2c0 .9-.7 1.6-1.6 1.6H3.4c-.9 0-1.6-.7-1.6-1.6v-5.2Z"/>`,
  code: `<path d="m8.4 5.9 1.6 1.6-4.5 4.5 4.5 4.5-1.6 1.6L2.3 12l6.1-6.1Zm7.2 0L21.7 12l-6.1 6.1-1.6-1.6 4.5-4.5-4.5-4.5 1.6-1.6Z"/><path d="m13.7 3.4 2.1.6-5.5 16-2.1-.6 5.5-16Z"/>`,
  cap: `<path d="M12 3 1.3 8.3 12 13.6l8.6-4.3v5.4h2V8.3L12 3Z"/><path d="M5.4 12.8v3.5c0 1.9 3 3.5 6.6 3.5s6.6-1.6 6.6-3.5v-3.5L12 16l-6.6-3.2Z"/>`,
  shield: `<path d="M12 2.4 4.2 5.5v5.9c0 5.1 3.3 9.3 7.8 10.6 4.5-1.3 7.8-5.5 7.8-10.6V5.5L12 2.4Z"/>`,
};

/* Line glyphs: navy strokes, no disc. They label a competency, not a section. */
const LINE = {
  architecture: `<path d="M3.5 20.8V6.4l6.2-2.9v17.3M9.7 10.6l6.9 2.7v7.5M2 20.8h20M5.8 8.9h1.9M5.8 12.3h1.9M5.8 15.7h1.9M12.2 15.4h2M12.2 17.9h2"/>`,
  analysis: `<path d="M10.6 17.1a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM15.3 15.3 21 21M8.3 12.6v-2.1M10.6 12.6V8.9M12.9 12.6v-3.1"/>`,
  integrations: `<path d="M14.5 4.2v-.5a2 2 0 0 0-4 0v.5H7.4a.9.9 0 0 0-.9.9v3.1h-.5a2 2 0 1 0 0 4h.5v3.1c0 .5.4.9.9.9h3.1v.5a2 2 0 1 0 4 0v-.5h3.1c.5 0 .9-.4.9-.9v-3.1h.5a2 2 0 1 0 0-4h-.5V5.1a.9.9 0 0 0-.9-.9H14.5Z"/>`,
  ai: `<path d="M12 5.1v13.8M12 5.1a2.7 2.7 0 0 0-5-1.1 2.5 2.5 0 0 0-2.6 3.4 2.6 2.6 0 0 0-.4 4.3 2.7 2.7 0 0 0 1.4 4 2.7 2.7 0 0 0 3.5 2.5A2.6 2.6 0 0 0 12 18.9M12 5.1a2.7 2.7 0 0 1 5-1.1 2.5 2.5 0 0 1 2.6 3.4 2.6 2.6 0 0 1 .4 4.3 2.7 2.7 0 0 1-1.4 4 2.7 2.7 0 0 1-3.5 2.5A2.6 2.6 0 0 1 12 18.9"/>`,
};

const svg = (glyph) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glyph}</svg>`);

const disc = (name, cls) => html`<span class="${cls}">${svg(SOLID[name] ?? SOLID.star)}</span>`;

/* Latin and numerals inside a possibly-RTL document. Isolated, or "2014 - 2017"
   comes out backwards. */
const ltr = (text) => html`<span class="cv-ltr" dir="ltr">${text}</span>`;

const heading = ({ icon, title, note }) => html`
      <h2 class="cv-sec__head">${disc(icon, "cv-badge")}<span>${title}${note ? html` <small class="cv-sec__note">${note}</small>` : ""}</span></h2>`;

const bullets = (items) => html`
        <ul class="cv-list">${items.map((item) => html`
          <li>${item}</li>`)}
        </ul>`;

/* --- the block types a CV is made of -------------------------------------- */
const BLOCK = {
  text: (s) => s.body.map((p) => html`
        <p>${p}</p>`),

  skills: (s) => s.items.map((item) => html`
        <div class="cv-comp">
          <span class="cv-comp__ico">${raw(`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${LINE[item.icon] ?? LINE.architecture}</svg>`)}</span>
          <div class="cv-comp__text">
            <h3 class="cv-comp__title">${item.title}</h3>
            <p>${item.text}</p>
          </div>
        </div>`),

  project: (s) => html`
        <p>${s.lead}</p>${bullets(s.bullets)}`,

  jobs: (s) => s.jobs.map((job) => html`
        <div class="cv-job">
          <h3 class="cv-job__role">${job.role}</h3>
          <p class="cv-job__dates">${ltr(job.dates)}</p>${bullets(job.bullets)}
        </div>`),

  stack: (s) => html`
        <dl class="cv-stack">${s.rows.map((row) => html`
          <div class="cv-stack__row">
            <dt>${row.label}</dt>
            <dd>${ltr(row.value)}</dd>
          </div>`)}
        </dl>`,

  entries: (s) => s.entries.map((entry) => html`
        <div class="cv-entry">
          <div class="cv-entry__top">
            <h3 class="cv-entry__title">${entry.title}</h3>
            <span class="cv-entry__years">${ltr(entry.years)}</span>
          </div>${(entry.lines ?? []).map((line) => html`
          <p>${line}</p>`)}${entry.note ? html`
          <p class="cv-entry__note">${entry.note}</p>` : ""}
        </div>`),
};

const section = (s) => html`
    <section class="cv-sec">${heading(s)}
      <div class="cv-sec__body">${BLOCK[s.type](s)}
      </div>
    </section>`;

export const resume = (ctx, cv) => html`
<main class="cv" id="top">
  <article class="cv-sheet">
    <header class="cv-id">
      <h1 class="cv-id__name">${cv.name}</h1>${cv.roles.map((role) => html`
      <p class="cv-id__role">${role}</p>`)}
      <ul class="cv-contact">${cv.contact.map((item) => html`
        <li class="cv-contact__item">${disc(item.icon, "cv-dot")}${item.href
          ? html`<a href="${item.href}">${ltr(item.text)}</a>`
          : html`<span>${item.text}</span>`}
        </li>`)}
      </ul>
    </header>
${cv.sections.map(section)}
  </article>
${cv.altLang ? html`
  <a class="cv-lang" href="${ctx.url(cv.altLang.href)}" lang="${cv.altLang.lang}" hreflang="${cv.altLang.lang}">${cv.altLang.label}</a>` : ""}
</main>`;
