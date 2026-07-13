import { html } from "../lib/html.js";

import { about } from "../components/about/about.js";
import { approach } from "../components/approach/approach.js";
import { baStrip } from "../components/ba-strip/ba-strip.js";
import { button } from "../components/button/button.js";
import { card, cardGrid } from "../components/card/card.js";
import { contact } from "../components/contact/contact.js";
import { ctaBand } from "../components/cta-band/cta-band.js";
import { ecoGrid } from "../components/eco-grid/eco-grid.js";
import { hero } from "../components/hero/hero.js";
import { heroSystem } from "../components/hero-system/hero-system.js";
import { projectGrid } from "../components/project-card/project-card.js";
import { quotes } from "../components/quote-card/quote-card.js";
import { section } from "../components/section/section.js";
import { sectionHead } from "../components/section-head/section-head.js";
import { timeline } from "../components/timeline/timeline.js";
import { waButton } from "../components/whatsapp-button/whatsapp-button.js";

import { home } from "../content/home.js";
import { pick as pickProjects } from "../content/projects.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, formCta, heroNote, processContent, projectsHead, runtime, site, testimonialsHead } from "../content/site.js";
import { defaultCta, ecosystem, solutions } from "../content/solutions.js";
import { page } from "../layouts/base.js";

/* The homepage: the whole offer in one scroll. Every block below is a component
   fed by content — there is no markup on this page that is unique to it.

   The order earns the ask: the problem, the approach, the clients who say it
   worked, the proof of what was actually built — and only then the form. The
   links into the two solutions close the page, under the form. */
export const render = (ctx) => page(ctx, {
  path: "",
  meta: home.meta,
  waText: home.waText,
  ctaLabel: home.waLabel,
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
  /* WhatsApp first — it is the primary action on every page of the site */
  actions: html`${waButton(ctx, { label: home.waLabel })}
          ${button(ctx, { href: "#contact", label: formCta, variant: "ghost", size: "lg", analytics: "hero_form_cta" })}`,
})}

${section({
  id: "solutions",
  className: "solutions",
  children: html`${sectionHead(home.solutions)}
${cardGrid({
    /* each card is the way into its own solution page */
    children: solutions.map((s) =>
      card(ctx, { icon: s.icon, title: s.homeTitle, text: s.homeText, cta: s.homeCta, href: `${s.slug}/` })
    ),
  })}`,
})}

${section({
  id: "problem",
  className: "problem",
  children: html`${sectionHead(home.problem.head)}
${cardGrid({
    cols: 3,
    /* the pains are clay — the one hue on the site that means "this hurts" */
    children: home.problem.items.map((item) => card(ctx, { ...item, accent: "clay", size: "sm" })),
  })}
${baStrip(home.problem.beforeAfter)}`,
})}

${section({
  id: "approach",
  className: "approach",
  children: html`${sectionHead(home.approach.head)}
${approach(ctx, home.approach)}`,
})}

<!-- the clients speak straight after the approach, then the work behind them -->
${section({
  id: "testimonial",
  className: "testimonial",
  children: html`${sectionHead(testimonialsHead)}
${quotes({ items: pickQuotes("erez", "itzik") })}`,
})}

${section({
  id: "proof",
  className: "solutions",
  children: html`${sectionHead(home.proof.head)}
${cardGrid({
    cols: 4,
    /* proof is amber, here and on every solution page */
    children: home.proof.items.map((item) => card(ctx, { ...item, accent: "amber" })),
  })}`,
})}

${ctaBand(ctx, { ...defaultCta, cta: home.waLabel })}

${section({
  id: "projects",
  className: "projects",
  children: html`${sectionHead(projectsHead)}
${projectGrid(ctx, { items: pickProjects("once", "harpatka") })}`,
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
${cardGrid({
    cols: 3,
    children: home.advantage.items.map((item) => card(ctx, { ...item, accent: "teal" })),
  })}`,
})}

${section({
  id: "about",
  className: "about",
  children: about(ctx, home.about),
})}

${section({
  id: "contact",
  className: "contact",
  children: contact(ctx, contactContent, { page: home.pageName, waLabel: home.waLabel }),
})}

<!-- the two solutions: AFTER the ask, never competing with it -->
${section({
  id: "ecosystem",
  className: "solutions",
  children: html`${sectionHead(ecosystem.head)}
${ecoGrid(ctx, { solutions, badge: ecosystem.badge })}`,
})}
</main>`,
});
