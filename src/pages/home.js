import { html } from "../lib/html.js";

import { about } from "../components/about/about.js";
import { approach } from "../components/approach/approach.js";
import { baStrip } from "../components/ba-strip/ba-strip.js";
import { button } from "../components/button/button.js";
import { trustStrip } from "../components/trust-strip/trust-strip.js";
import { whatsappButton } from "../components/whatsapp-button/whatsapp-button.js";
import { card, cardGrid } from "../components/card/card.js";
import { contact } from "../components/contact/contact.js";
import { ctaBand } from "../components/cta-band/cta-band.js";
import { features } from "../components/feature/feature.js";
import { hero } from "../components/hero/hero.js";
import { heroSystem } from "../components/hero-system/hero-system.js";
import { miniCards } from "../components/mini-card/mini-card.js";
import { projectGrid } from "../components/project-card/project-card.js";
import { quotes } from "../components/quote-card/quote-card.js";
import { section } from "../components/section/section.js";
import { sectionHead } from "../components/section-head/section-head.js";
import { timeline } from "../components/timeline/timeline.js";

import { home } from "../content/home.js";
import { pick as pickProjects } from "../content/projects.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, heroNote, processContent, projectsHead, runtime, site, testimonialsHead, trustStripItems } from "../content/site.js";
import { defaultCta, solutions } from "../content/solutions.js";
import { page } from "../layouts/base.js";

/* The homepage: the whole offer in one scroll. Every block below is a component
   fed by content — there is no markup on this page that is unique to it. */
export const render = (ctx) => page(ctx, {
  path: "",
  meta: home.meta,
  leadForm: true,
  waText: home.waText,
  ctaLabel: home.ctaLabel,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: site.brand,
    slogan: site.slogan,
    description: home.meta.description,
    url: `${site.origin}/`,
    areaServed: "IL",
    founder: { "@type": "Person", name: site.founder },
  },

  body: html`
<main id="top">
${hero(ctx, {
  ...home.hero,
  note: heroNote,
  art: heroSystem({ caption: runtime.systemLabels[0] }),
  actions: html`${button(ctx, { href: "#contact", label: home.hero.cta, size: "lg", analytics: "hero_mapping_cta" })}
          ${whatsappButton(ctx, { label: "לכתוב לי ב־WhatsApp", inline: true })}`,
})}

${trustStrip({ items: trustStripItems })}

${section({
  id: "solutions",
  className: "solutions",
  children: html`${sectionHead(home.solutions)}
${cardGrid({
  /* each card is the way into its own solution page */
  children: solutions.map((s) =>
    card(ctx, { icon: s.icon, title: s.homeTitle, text: s.homeText, wide: s.homeWide, href: `${s.slug}/` })
  ),
})}`,
})}

${section({
  id: "problem",
  className: "problem",
  children: html`${sectionHead(home.problem.head)}
${miniCards({ items: home.problem.items })}
${baStrip(home.problem.beforeAfter)}`,
})}

${section({
  id: "approach",
  className: "approach",
  children: html`${sectionHead(home.approach.head)}
${approach(ctx, home.approach)}`,
})}

${ctaBand(ctx, defaultCta)}

${section({
  id: "projects",
  className: "projects",
  children: html`${sectionHead(projectsHead)}
${projectGrid(ctx, { items: pickProjects("once", "harpatka") })}`,
})}

${section({
  id: "testimonial",
  className: "testimonial",
  children: html`${sectionHead(testimonialsHead)}
${quotes({ items: pickQuotes("erez", "itzik") })}`,
})}

${section({
  id: "process",
  className: "process",
  children: html`${sectionHead(processContent.head)}
${timeline({ items: processContent.steps })}`,
})}

${section({
  id: "advantage",
  className: "advantage",
  children: html`${sectionHead(home.advantage.head)}
${features({ items: home.advantage.items })}`,
})}

${section({
  id: "about",
  className: "about",
  children: about(ctx, home.about),
})}

${section({
  id: "contact",
  className: "contact",
  /* home keeps the service choice visible — the visitor tells us what they need */
  children: contact(ctx, {
    ...contactContent,
    head: { ...contactContent.head, title: home.contact.title, text: home.contact.text },
    submitLabel: home.contact.submitLabel,
  }),
})}
</main>`,
});
