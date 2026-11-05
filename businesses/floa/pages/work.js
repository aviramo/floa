import { html } from "#lib/html.js";

import { button } from "#components/button/button.js";
import { ctaBand } from "#components/cta-band/cta-band.js";
import { hero } from "#components/hero/hero.js";
import { projectGrid } from "#components/project-card/project-card.js";
import { section } from "#components/section/section.js";
import { waButton } from "#components/whatsapp-button/whatsapp-button.js";

import { home } from "../content/home.js";
import { pick as pickProjects, projects } from "../content/projects.js";
import { site } from "../content/site.js";
import { defaultCta } from "../content/solutions.js";
import { work } from "../content/work.js";
import { page } from "#layouts/base.js";

/* The portfolio, whole. The homepage shows a small strip and sends the visitor
   here; this page is where every project gets its full card. Everything on it
   is a component the site already ships. Only the order and the copy are its own. */
export const render = (ctx) => page(ctx, {
  path: `${site.folder}${work.slug}/`,
  meta: work.meta,
  og: work.og,
  waText: work.waText,
  ctaLabel: work.waLabel,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: work.meta.title,
    description: work.meta.description,
    url: `${site.origin}/${site.folder}${work.slug}/`,
    isPartOf: { "@type": "WebSite", name: site.brand, url: `${site.origin}/` },
  },

  body: html`
<main id="top">
${hero(ctx, {
  ...work.hero,
  actions: html`${waButton(ctx, { label: work.waLabel })}
          ${button(ctx, { href: ctx.home(), label: "חזרה לדף הבית", variant: "ghost", size: "lg" })}`,
})}

${section({
  id: "work",
  className: "projects",
  children: projectGrid(ctx, { items: pickProjects(...Object.keys(projects)) }),
})}

${ctaBand(ctx, { ...defaultCta, cta: work.waLabel })}
</main>`,
});
