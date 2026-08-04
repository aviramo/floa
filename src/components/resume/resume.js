import { escape, html, raw } from "../../lib/html.js";

/* ==========================================================================
   resume — a CV, as a document.

   Nothing here knows whose CV it is. The name, the roles and the dates all
   arrive as data; this file only knows how a résumé is drawn: a rule and a
   heading per section, and the small vocabulary of block types a CV is made of.

   It is deliberately NOT built from the marketing components. A hero, a card
   and a section-head describe a page that persuades; a CV is a printed page
   that lists, and one that is read by a parser as often as by a person. There
   are no icons in it for that reason: everything on the paper is text.

     {
       name, roles: [string], contact: [{ text, href }],
       download: { href, name, label },   a ready PDF, not a print dialog
       altLang: { href, label, lang },
       sections: [
         { type: "text",     title, body: [string] }
         { type: "keywords", title, groups: [{ title, terms: [string] }] }
         { type: "roles",    title, jobs: [{ role, dates, org, bullets, link, breakBefore }] }
         { type: "entries",  title, entries: [{ title, lines: [string] }] }
         { type: "lines",    title, lines: [string] }
       ]
     }

   `breakBefore` on a job is the ONE page boundary the document declares. Where
   the rest of the paper ends is the printer's business; this is the single
   place the author has decided the fold must fall.

   Dates and Latin runs are wrapped in <bdi dir="ltr">: they are Latin and
   numeric, and in an RTL document the bidi algorithm would otherwise turn
   "2014 - 2017" into "2017 - 2014".
   ========================================================================== */

/* Latin held LTR inside a possibly-RTL document. <bdi> is the element for it:
   isolation is its default behaviour rather than something CSS has to add, so
   it still holds if the stylesheet never arrives. */
const bdi = (text) => html`<bdi dir="ltr">${text}</bdi>`;

/* ---------------------------------------------------------------------------
   A Hebrew CV is full of English: company names, technologies, a URL, a degree
   written "B.Sc.". Left to the bidi algorithm a run of them inside an RTL
   paragraph comes out in the wrong order — "SQL, ETL, SSIS" reads SSIS first,
   and the full stop in "B.Sc." jumps to the far side of the abbreviation.

   Wrapping each one by hand across three hundred strings of copy is how it
   silently stops being done, so the ENGINE finds them: any stretch of Latin
   letters and digits, together with the punctuation and spaces INSIDE it, so a
   comma-separated list of technologies stays one run rather than a row of
   separately reversed islands. It ends on a letter, a digit, a bracket or a
   full stop, which keeps "B.Sc." whole and leaves the Hebrew sentence's own
   punctuation outside.

   It runs on the RTL document only. On the Latin one it would be markup that
   changes nothing. */
const LATIN = /[A-Za-z0-9](?:[A-Za-z0-9 .,'’()\/&+#_:-]*[A-Za-z0-9).])?/g;

const isolate = (text) => {
  const s = String(text);
  let out = "";
  let last = 0;
  for (const m of s.matchAll(LATIN)) {
    out += escape(s.slice(last, m.index)) + `<bdi dir="ltr">${escape(m[0])}</bdi>`;
    last = m.index + m[0].length;
  }
  return raw(out + escape(s.slice(last)));
};

const asis = (text) => text;

const bullets = (t, items) => html`
        <ul class="cv-list">${items.map((item) => html`
          <li>${t(item)}</li>`)}
        </ul>`;

const BLOCK = {
  text: (s, t) => s.body.map((p) => html`
        <p>${t(p)}</p>`),

  /* A run-in heading, not a heading on a line of its own. Stacked, three groups
     cost three extra printed lines, and on a page that has to end at a named
     employer those three lines are the difference between ending there and not.

     dir="auto" on the PARAGRAPH: a line of nothing but English — which is what
     the technical skills are, deliberately, so an ATS reads them — is an English
     line and runs left to right, label first and colon behind it. Held in an RTL
     paragraph it read backwards, the colon stranded at the edge of the line.
     Auto means each group decides for itself, and nothing here names a
     language. */
  keywords: (s, t) => s.groups.map((group) => html`
        <p class="cv-kw" dir="auto"><span class="cv-kw__title">${group.title}:</span> ${t(group.terms.join(", "))}</p>`),

  roles: (s, t) => s.jobs.map((job) => html`
        <div class="${job.breakBefore ? "cv-job cv-job--page" : "cv-job"}">
          <div class="cv-row">
            <h3 class="cv-job__role">${t(job.role)}</h3>
            <span class="cv-row__dates">${bdi(job.dates)}</span>
          </div>
          <p class="cv-job__org">${t(job.org)}</p>${bullets(t, job.bullets)}${job.link ? html`
          <p class="cv-job__link">${t(job.link.label)} <a href="${job.link.href}">${bdi(job.link.href)}</a></p>` : ""}
        </div>`),

  entries: (s, t) => s.entries.map((entry) => html`
        <div class="cv-entry">
          <h3 class="cv-entry__title">${t(entry.title)}</h3>${entry.lines.map((line) => html`
          <p>${t(line)}</p>`)}
        </div>`),

  lines: (s, t) => s.lines.map((line) => html`
        <p>${t(line)}</p>`),
};

const section = (t) => (s) => html`
    <section class="cv-sec">
      <h2 class="cv-sec__head">${t(s.title)}</h2>
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
        <li class="cv-contact__item">${item.href
          ? html`<a href="${item.href}">${bdi(item.text)}</a>`
          : html`<span>${t(item.text)}</span>`}
        </li>`)}
      </ul>
    </header>
${cv.sections.map(section(t))}
  </article>
${cv.download || cv.altLang ? html`
  <div class="cv-tools">${cv.download ? html`
    <a class="cv-tool cv-tool--pdf" href="${ctx.url(cv.download.href)}" download="${cv.download.name}">${cv.download.label}</a>` : ""}${cv.altLang ? html`
    <a class="cv-tool" href="${ctx.url(cv.altLang.href)}" lang="${cv.altLang.lang}" hreflang="${cv.altLang.lang}">${cv.altLang.label}</a>` : ""}
  </div>` : ""}
</main>`;
};
