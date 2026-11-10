import { attrs, html, raw } from "../../lib/html.js";
import { image } from "../image/image.js";

const external = { target: "_blank", rel: "noopener" };

/* one or more real shots sharing the card's media area; each shot may link out.
   Every project on the site has real captures — nothing here fakes one. */
const media = (ctx, { shots, href, ariaLabel }) => {
  const duo = shots.length > 1;
  const pictures = shots.map((shot) => {
    const link = shot.href ?? (duo ? null : href);
    const img = image(ctx, shot);
    return duo
      ? html`
            <${raw(link ? "a" : "span")} class="duo-item"${attrs(link ? { href: link, "aria-label": shot.ariaLabel ?? ariaLabel, ...external } : {})}>
              ${img}
            </${raw(link ? "a" : "span")}>`
      : img;
  });

  return duo
    ? html`<div class="project-media project-media-duo">${pictures}</div>`
    : html`<a class="project-media"${attrs({ href, "aria-label": ariaLabel, ...external })}>
            ${pictures}
          </a>`;
};

/* A client with nothing to open (the work is real, but there is no site or app to
   link to) has no capture, so it has no picture area either. Its mark is carried
   small, on the heading's own line and at the far end of it (the left, in
   Hebrew), where every other card carries its logo inside the picture: logo at
   one end, headline at the other. It is not a link, because there is nowhere to
   go. */
const mark = (ctx, { href, shots }) => (!href && shots?.length ? image(ctx, { ...shots[0], className: "project-mark" }) : "");

const heading = (ctx, project) => {
  const h3 = html`<h3>${project.href ? html`<a href="${project.href}"${attrs(external)}>${project.title}</a>` : project.title}</h3>`;
  const m = mark(ctx, project);
  return m ? html`<div class="project-head">${h3}${m}</div>` : h3;
};

/* A case study: what it was, what we built, and a way in.

   `compact` is the short form, for a page that shows the work as proof and not as
   a read: the picture, the name, one line of what it is, and the way in. A client
   with nothing to open has no picture to carry it, so it keeps the one sentence
   that says what was built. { project, compact } */
export const projectCard = (ctx, project, { compact } = {}) => html`
        <article class="${compact ? "project-card project-card-compact reveal" : "project-card reveal"}">
          ${project.href ? media(ctx, project) : ""}
          <div class="project-body">
            ${project.name && html`<span class="project-name">${project.name}</span>`}
            ${heading(ctx, project)}

            ${(compact && project.href ? [] : project.parts).map((part) => html`
            <div class="project-part">
              ${part.label && html`<span class="project-label">${part.label}</span>`}
              <p>${part.text}</p>
            </div>`)}

            ${project.href && html`<a class="project-link" href="${project.href}"${attrs(external)}>${project.linkLabel}</a>`}
          </div>
        </article>`;

export const projectGrid = (ctx, { items, compact }) => html`
      <div class="${compact ? "projects-grid projects-grid-compact" : "projects-grid"}">
        ${items.map((project) => projectCard(ctx, project, { compact }))}
      </div>`;
