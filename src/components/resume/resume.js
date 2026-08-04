import { escape, html, raw } from "../../lib/html.js";

/* ==========================================================================
   resume — a CV, as a document.

   Nothing here knows whose CV it is. The name, the roles and the dates all
   arrive as data; this file only knows how a résumé is drawn: a badge and a
   rule per section, an indented body under the heading, and the small
   vocabulary of block types a CV is actually made of.

   It is deliberately NOT built from the marketing components. A hero, a card
   and a section-head describe a page that persuades; a CV is a printed page
   that lists. The two share a palette and nothing else.

     {
       name, roles: [string], contact: [{ icon, text, href }],
       download: { href, name, label },   a ready PDF, not a print dialog
       altLang: { href, label, lang },
       sections: [
         { type: "text",     icon, title, body: [string] }
         { type: "keywords", icon, title, groups: [{ title, terms: [string] }] }
         { type: "roles",    icon, title, jobs: [{ role, dates, org, lead, bullets, link }] }
         { type: "entries",  icon, title, entries: [{ title, dates, lines: [string] }] }
         { type: "lines",    icon, title, lines: [string] }
       ]
     }

   The document is ONE continuous flow. It declares no page boundaries of its
   own: where the paper ends is the printer's business, and the only thing it
   insists on is that a single employment entry is never cut in half.

   Dates are right-aligned on the first line of every entry, and every one of
   them is wrapped in dir="ltr": they are numeric, and in an RTL document the
   bidi algorithm would otherwise turn "2014 - 2017" into "2017 - 2014".
   ========================================================================== */

/* White glyphs, inside a filled navy disc. Small: a CV is read by machines as
   often as by people, and nothing here may compete with the text. */
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
  globe: `<path d="M12 2.2a9.8 9.8 0 1 0 0 19.6 9.8 9.8 0 0 0 0-19.6Zm6.9 6.5h-2.6a13.9 13.9 0 0 0-1.6-4.1 8 8 0 0 1 4.2 4.1ZM12 4.1c.8 1.1 1.4 2.6 1.8 4.6h-3.6c.4-2 1-3.5 1.8-4.6ZM4.3 13.8a7.9 7.9 0 0 1 0-3.6h3a19 19 0 0 0 0 3.6h-3Zm.8 2h2.6c.4 1.5.9 2.9 1.6 4.1a8 8 0 0 1-4.2-4.1Zm2.6-7.1H5.1a8 8 0 0 1 4.2-4.1 13.9 13.9 0 0 0-1.6 4.1ZM12 19.9c-.8-1.1-1.4-2.6-1.8-4.6h3.6c-.4 2-1 3.5-1.8 4.6Zm2.1-6.1h-4.2a17 17 0 0 1 0-3.6h4.2a17 17 0 0 1 0 3.6Zm.6 6.1c.7-1.2 1.2-2.6 1.6-4.1h2.6a8 8 0 0 1-4.2 4.1Zm2-6.1a19 19 0 0 0 0-3.6h3a7.9 7.9 0 0 1 0 3.6h-3Z"/>`,
  download: `<path d="M12 3a1.2 1.2 0 0 1 1.2 1.2v8.9l3.1-3.1a1.2 1.2 0 0 1 1.7 1.7l-5.1 5.2a1.2 1.2 0 0 1-1.8 0L6 11.7a1.2 1.2 0 0 1 1.7-1.7l3.1 3.1V4.2A1.2 1.2 0 0 1 12 3ZM4.6 16.4a1.2 1.2 0 0 1 1.2 1.2v1.6h12.4v-1.6a1.2 1.2 0 0 1 2.4 0v2.2a1.6 1.6 0 0 1-1.6 1.6H5a1.6 1.6 0 0 1-1.6-1.6v-2.2a1.2 1.2 0 0 1 1.2-1.2Z"/>`,
};

const svg = (glyph) => raw(`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${glyph}</svg>`);
const disc = (name, cls) => html`<span class="${cls}">${svg(SOLID[name] ?? SOLID.star)}</span>`;

/* Latin and numerals inside a possibly-RTL document. Isolated, or a date range
   comes out backwards. */
const ltr = (text) => html`<span class="cv-ltr" dir="ltr">${text}</span>`;

/* ---------------------------------------------------------------------------
   A Hebrew CV is full of English: company names, technologies, URLs, a degree
   written "B.Sc.". Left to the bidi algorithm, a run of them inside an RTL
   paragraph comes out in the wrong order — "SQL, ETL, SSIS" reads SSIS first,
   and the full stop in "B.Sc." jumps to the far side of the abbreviation.

   The fix is one isolated LTR span per run, and doing that by hand across three
   hundred strings of copy is how it silently stops being done. So the ENGINE
   finds the runs: any stretch of Latin letters and digits, together with the
   punctuation and spaces INSIDE it, so a comma-separated list of technologies
   stays a single run rather than a row of separately-reversed islands. It ends
   on a letter, a digit, a bracket or a full stop, which is what keeps "B.Sc."
   whole and leaves a Hebrew sentence's own punctuation outside.

   It runs only on the RTL document. On the Latin one it would be markup that
   changes nothing. */
const LATIN = /[A-Za-z0-9](?:[A-Za-z0-9 .,'’()\/&+#_:-]*[A-Za-z0-9).])?/g;

const isolate = (text) => {
  const s = String(text);
  let out = "";
  let last = 0;
  for (const m of s.matchAll(LATIN)) {
    out += escape(s.slice(last, m.index)) + `<span class="cv-ltr">${escape(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return raw(out + escape(s.slice(last)));
};

const asis = (text) => text;

/* Every entry opens the same way: a title on the line, its dates hard against
   the far edge. One shape for a job, a degree and a discharge alike, so the
   dates form a single column down the whole document. */
const entryHead = (t, title, dates, cls) => html`
        <div class="cv-row">
          <h3 class="${cls}">${t(title)}</h3>${dates ? html`
          <span class="cv-row__dates">${ltr(dates)}</span>` : ""}
        </div>`;

const bullets = (t, items) => html`
        <ul class="cv-list">${items.map((item) => html`
          <li>${t(item)}</li>`)}
        </ul>`;

const BLOCK = {
  text: (s, t) => s.body.map((p) => html`
        <p>${t(p)}</p>`),

  /* A run-in heading, not a heading of its own: the label and its terms on one
     flowing paragraph. It reads the way a parser reads it, and it costs four
     fewer lines than a stacked list — which is four lines of a two-page budget. */
  /* dir="auto" on the PARAGRAPH, and it is the whole fix. A line of nothing but
     English — which is what the technical skills are, deliberately, so an ATS
     reads them — is an English line and has to run left to right, label first
     and colon behind it. Held in an RTL paragraph it read backwards: the label
     at the far right and its colon stranded at the very edge of the line.

     Auto means each group decides for itself. The Hebrew competencies above
     open with a Hebrew word and stay right to left; these open with a Latin one
     and turn. Nothing here names a language. */
  keywords: (s, t) => s.groups.map((group) => html`
        <p class="cv-kw" dir="auto"><span class="cv-kw__label">${group.title}:</span> ${t(group.terms.join(", "))}</p>`),

  roles: (s, t) => s.jobs.map((job) => html`
        <div class="cv-job">${entryHead(t, job.role, job.dates, "cv-job__role")}
          <p class="cv-job__org">${t(job.org)}</p>${job.lead ? html`
          <p class="cv-job__lead">${t(job.lead)}</p>` : ""}${job.bullets ? bullets(t, job.bullets) : ""}${job.link ? html`
          <p class="cv-job__link">${t(job.link.label)} <a href="${job.link.href}">${ltr(job.link.href)}</a></p>` : ""}
        </div>`),

  entries: (s, t) => s.entries.map((entry) => html`
        <div class="cv-entry">${entryHead(t, entry.title, entry.dates, "cv-entry__title")}${entry.lines.map((line) => html`
          <p>${t(line)}</p>`)}
        </div>`),

  lines: (s, t) => s.lines.map((line) => html`
        <p>${t(line)}</p>`),
};

const section = (t) => (s) => html`
    <section class="cv-sec">
      <h2 class="cv-sec__head">${disc(s.icon, "cv-badge")}<span>${t(s.title)}</span></h2>
      <div class="cv-sec__body">${BLOCK[s.type](s, t)}
      </div>
    </section>`;

export const resume = (ctx, cv) => {
  /* the one thing that differs between the two documents, and it is not copy */
  const t = cv.dir === "rtl" ? isolate : asis;

  return html`
<main class="cv" id="top">
  <article class="cv-sheet">
    <header class="cv-id">
      <h1 class="cv-id__name">${t(cv.name)}</h1>${cv.roles.map((role) => html`
      <p class="cv-id__role">${t(role)}</p>`)}
      <ul class="cv-contact">${cv.contact.map((item) => html`
        <li class="cv-contact__item">${disc(item.icon, "cv-dot")}${item.href
          ? html`<a href="${item.href}">${ltr(item.text)}</a>`
          : html`<span>${t(item.text)}</span>`}
        </li>`)}
      </ul>
    </header>
${cv.sections.map(section(t))}
  </article>
${cv.download || cv.altLang ? html`
  <div class="cv-tools">${cv.download ? html`
    <a class="cv-tool cv-tool--pdf" href="${ctx.url(cv.download.href)}" download="${cv.download.name}">${svg(SOLID.download)}${cv.download.label}</a>` : ""}${cv.altLang ? html`
    <a class="cv-tool" href="${ctx.url(cv.altLang.href)}" lang="${cv.altLang.lang}" hreflang="${cv.altLang.lang}">${cv.altLang.label}</a>` : ""}
  </div>` : ""}
</main>`;
};
