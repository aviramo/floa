import { attrs, html, raw } from "../../lib/html.js";
import { image } from "../image/image.js";
import { placeholder } from "../placeholder/placeholder.js";

const external = { target: "_blank", rel: "noopener" };

/* one or more shots sharing the card's media area; each shot may link out, and
   a shot that has no real capture yet holds its slot instead of faking one */
const media = (ctx, { shots, href, ariaLabel }) => {
  const duo = shots.length > 1;
  const pictures = shots.map((shot) => {
    const link = shot.placeholder ? null : shot.href ?? (duo ? null : href);
    const img = shot.placeholder ? placeholder(shot) : image(ctx, shot);
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

/* A case study: what it was, what we built, and a way in. { project } */
export const projectCard = (ctx, project) => html`
        <article class="project-card reveal">
          ${media(ctx, project)}
          <div class="project-body">
            <span class="project-name">${project.name}</span>
            <h3><a href="${project.href}"${attrs(external)}>${project.title}</a></h3>

            ${project.parts.map((part) => html`
            <div class="project-part">
              <span class="project-label">${part.label}</span>
              <p>${part.text}</p>
            </div>`)}

            <a class="project-link" href="${project.href}"${attrs(external)}>${project.linkLabel}</a>
          </div>
        </article>`;

export const projectGrid = (ctx, { items }) => html`
      <div class="projects-grid">
        ${items.map((project) => projectCard(ctx, project))}
      </div>`;
