import { html } from "../lib/html.js";

import { button } from "../components/button/button.js";
import { card, cardGrid } from "../components/card/card.js";
import { checklist } from "../components/checklist/checklist.js";
import { chips } from "../components/chips/chips.js";
import { contact } from "../components/contact/contact.js";
import { ctaBand } from "../components/cta-band/cta-band.js";
import { ecoGrid } from "../components/eco-grid/eco-grid.js";
import { features } from "../components/feature/feature.js";
import { flow, flowCards } from "../components/flow/flow.js";
import { hero } from "../components/hero/hero.js";
import { heroArt } from "../components/hero-art/hero-art.js";
import { icon } from "../components/icon/icon.js";
import { miniCards } from "../components/mini-card/mini-card.js";
import { placeholderPair } from "../components/placeholder/placeholder.js";
import { projectGrid } from "../components/project-card/project-card.js";
import { quotes } from "../components/quote-card/quote-card.js";
import { section } from "../components/section/section.js";
import { sectionHead } from "../components/section-head/section-head.js";
import { timeline } from "../components/timeline/timeline.js";
import { trustStrip } from "../components/trust-strip/trust-strip.js";
import { urgency } from "../components/urgency/urgency.js";

import { pick as pickProjects } from "../content/projects.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, heroNote, processContent, projectsHead, site, testimonialsHead, trustStripItems } from "../content/site.js";
import { defaultCta, ecosystem, solutions } from "../content/solutions.js";
import { page } from "../layouts/base.js";

/* ==========================================================================
   ONE template, five pages.

   A solution page is: the promise, the pain, what gets built, the PROOF that it
   works, where it sits in the system, why FLOA, the ask, the process, the work,
   the form. Everything on it comes from the solution's object in
   src/content/solutions.js — so a sixth solution is a data entry, not a page.

   Two slots let each page differ without forking the template:
     afterHero — an extra block straight under the opening
     proof     — sits right after "what's included", and each page proves itself
                 its own way: a flow, a screenshot, a quote, a project
   A section whose data is missing simply does not render.
   ========================================================================== */

/* The proof block: whichever of these the solution supplies, always in this
   order — first how it works, then the thing we built, then how it really looks,
   then the client who lived it. */
const proofSection = (ctx, proof) => proof && section({
  id: "proof",
  className: "projects proof",
  children: html`${proof.head && sectionHead(proof.head)}
${proof.flow && flow({ steps: proof.flow })}
${proof.flows && flowCards({ items: proof.flows })}
${proof.projects && projectGrid(ctx, { items: pickProjects(...proof.projects) })}
${proof.media && placeholderPair({ items: proof.media })}
${proof.quotes && quotes({ items: pickQuotes(...proof.quotes) })}`,
});

export const render = (ctx, solution) => page(ctx, {
  path: `${solution.slug}/`,
  meta: solution.meta,
  leadForm: true,
  waText: solution.waText,
  ctaLabel: solution.ctaLabel,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: solution.meta.serviceType,
    name: solution.meta.serviceName,
    description: solution.meta.description,
    areaServed: "IL",
    url: `${site.origin}/${solution.slug}/`,
    provider: {
      "@type": "ProfessionalService",
      name: site.brand,
      url: `${site.origin}/`,
      founder: { "@type": "Person", name: site.founder },
    },
  },

  body: html`
<main id="top">
${hero(ctx, {
  ...solution.hero,
  chip: solution.chip ?? solution.title,
  note: heroNote,
  art: heroArt({ label: solution.hero.artLabel, shapes: solution.hero.shapes }),
  actions: html`${button(ctx, { href: "#contact", label: solution.hero.cta, size: "lg", analytics: "hero_mapping_cta" })}
          ${button(ctx, { variant: "ghost", size: "lg", whatsapp: true, analytics: "whatsapp_cta",
            children: html`<span class="wa-glyph" aria-hidden="true">${icon("whatsapp")}</span><span>לכתוב לי ב־WhatsApp</span>` })}`,
})}

${trustStrip({ items: trustStripItems })}

${solution.tracks && section({
  id: "tracks",
  className: "solutions",
  children: cardGrid({
    children: solution.tracks.map((track) => card(ctx, track)),
  }),
})}

${section({
  id: "problem",
  className: "problem",
  children: html`${sectionHead(solution.problem.head)}
${miniCards({ items: solution.problem.items })}`,
})}

${solution.urgency && urgency({ text: solution.urgency })}

${section({
  id: "included",
  className: "solutions",
  children: html`${sectionHead(solution.included.head)}
${checklist({ items: solution.included.items })}
${solution.included.types && chips({ items: solution.included.types })}`,
})}

${proofSection(ctx, solution.proof)}

${solution.quotes && section({
  id: "testimonial",
  className: "testimonial",
  children: html`${sectionHead(testimonialsHead)}
${quotes({ items: pickQuotes(...solution.quotes) })}`,
})}

${solution.projects && section({
  id: "projects",
  className: "projects",
  children: html`${sectionHead(projectsHead)}
${projectGrid(ctx, { items: pickProjects(...solution.projects) })}`,
})}

${section({
  id: "advantage",
  className: "advantage",
  children: html`${sectionHead(solution.advantage.head)}
${features({ items: solution.advantage.items })}`,
})}

${solution.reassure && section({
  id: "reassure",
  className: "solutions reassure",
  children: sectionHead(solution.reassure),
})}

${ctaBand(ctx, solution.cta ?? defaultCta)}

${section({
  id: "process",
  className: "process",
  children: html`${sectionHead(processContent.head)}
${timeline({ items: processContent.steps })}`,
})}

${section({
  id: "ecosystem",
  className: "solutions",
  children: html`${sectionHead(ecosystem.head)}
${ecoGrid(ctx, {
  solutions,
  current: solution.slug,
  badge: ecosystem.badge,
  note: solution.ecoNote(ctx),
})}`,
})}

${section({
  id: "contact",
  className: "contact",
  children: contact(ctx, {
    ...contactContent,
    head: { ...contactContent.head, title: solution.contact.title, text: solution.contact.text },
    submitLabel: solution.contact.submitLabel,
  }, { selected: solution.formValue, hideService: true, minimalRequired: true }),
})}
</main>`,
});
