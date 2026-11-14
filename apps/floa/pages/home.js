import { html } from "#lib/html.js";

import { about } from "#components/about/about.js";
import { approach } from "#components/approach/approach.js";
import { button } from "#components/button/button.js";
import { card, cardGrid } from "#components/card/card.js";
import { contact } from "#components/contact/contact.js";
import { ctaBand } from "#components/cta-band/cta-band.js";
import { hero } from "#components/hero/hero.js";
import { heroMotion } from "#components/hero-motion/hero-motion.js";
import { projectGrid } from "#components/project-card/project-card.js";
import { quotes } from "#components/quote-card/quote-card.js";
import { scrollFlow } from "#components/scroll-flow/scroll-flow.js";
import { section } from "#components/section/section.js";
import { sectionHead } from "#components/section-head/section-head.js";
import { solutionPanel, solutionPanels } from "#components/solution-panel/solution-panel.js";
import { waButton } from "#components/whatsapp-button/whatsapp-button.js";

import { home } from "../content/home.js";
import { pick as pickProjects } from "../content/projects.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, formCta, heroNote, site, testimonialsHead } from "../content/site.js";
import { page } from "#layouts/base.js";

/* The homepage, and the site: everything FLOA offers in one scroll, each part one
   jump away from the bar at the top.

   The order is the order the reader's questions come in. Is this about me (the
   film and the scene that follows it)? What would it be for me (the two things
   sold)? Has it been done (the work, and how it is done: AI)? How does it go (the
   three steps)? Who is it (one paragraph and a face)? And then, once, the ask and
   the form. Each of those is said once, in one place. */
export const render = (ctx) => page(ctx, {
  path: "",
  meta: home.meta,
  og: home.og,
  waText: home.waText,
  ctaLabel: home.waLabel,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: site.brand,
    slogan: site.slogan,
    description: home.meta.description,
    url: `${site.origin}/`,
    /* the image and the logo are what a search result can actually SHOW */
    image: `${site.origin}/${site.folder}${home.og.image}`,
    logo: `${site.origin}${site.icons.apple}`,
    areaServed: "IL",
    founder: { "@type": "Person", name: site.founder },
    /* what is offered, so a search engine that read two pages before reads it here */
    makesOffer: home.build.panels.map((p) => ({
      "@type": "Offer",
      itemOffered: { "@type": "Service", name: p.title, description: p.items.join(", ") },
    })),
  },

  body: html`
<main id="top">
${hero(ctx, {
  ...home.hero,
  note: heroNote,
  /* the opening is led by a film that says what FLOA is, and the words follow it
     (hero-motion.css) */
  className: "hero-sync",
  artFirst: true,
  art: heroMotion(ctx, home.heroMotion),
  /* WhatsApp first: it is the primary action */
  actions: html`${waButton(ctx, { label: home.waLabel })}
          ${button(ctx, { href: "#contact", label: formCta, variant: "ghost", size: "lg", analytics: "hero_form_cta" })}`,
})}

${scrollFlow(ctx, home.flowStory)}

${section({
  id: "solutions",
  className: "solutions",
  children: html`${sectionHead(home.build.head)}
${solutionPanels({ children: home.build.panels.map((panel) => solutionPanel(ctx, panel)) })}`,
})}

${home.showTestimonials && section({
  id: "testimonial",
  className: "testimonial",
  children: html`${sectionHead(testimonialsHead)}
${quotes({ items: pickQuotes("erez", "itzik") })}`,
})}

${section({
  id: "projects",
  className: "projects",
  /* One section, one claim: not presentations, things that work. It shows WHAT was
     made (three with a picture, the rest one click away on this same page), and
     then HOW it gets made fast: AI and agents, in the dark band. */
  children: html`${sectionHead(home.work.head)}
${projectGrid(ctx, { items: pickProjects(...home.work.featured), compact: true })}
<details class="more-work">
  <summary><span>${home.work.moreLabel}</span></summary>
  ${projectGrid(ctx, { items: pickProjects(...home.work.more), compact: true })}
</details>
${cardGrid({
    cols: 4,
    className: "ai-grid",
    children: html`${card(ctx, { ...home.ai.lead, wide: true, accent: "teal" })}
${home.ai.items.map((item) => card(ctx, { ...item, accent: "teal", size: "sm" }))}`,
  })}`,
})}

${section({
  id: "process",
  className: "process",
  children: html`${sectionHead(home.how.head)}
${approach(ctx, { picture: home.how.picture, steps: home.how.steps })}`,
})}

${section({
  id: "about",
  className: "about",
  children: about(ctx, home.about),
})}

${ctaBand(ctx, { ...home.cta, cta: home.waLabel })}

${section({
  id: "contact",
  className: "contact",
  children: contact(ctx, contactContent, { page: home.pageName, waLabel: home.waLabel }),
})}
</main>`,
});
