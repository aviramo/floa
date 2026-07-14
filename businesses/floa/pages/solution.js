import { html } from "#lib/html.js";

import { button } from "#components/button/button.js";
import { card, cardGrid } from "#components/card/card.js";
import { chips } from "#components/chips/chips.js";
import { contact } from "#components/contact/contact.js";
import { ctaBand } from "#components/cta-band/cta-band.js";
import { ecoGrid } from "#components/eco-grid/eco-grid.js";
import { faq } from "#components/faq/faq.js";
import { flow, flowCards } from "#components/flow/flow.js";
import { hero } from "#components/hero/hero.js";
import { heroArt } from "#components/hero-art/hero-art.js";
import { projectGrid } from "#components/project-card/project-card.js";
import { quotes } from "#components/quote-card/quote-card.js";
import { section } from "#components/section/section.js";
import { sectionHead } from "#components/section-head/section-head.js";
import { timeline } from "#components/timeline/timeline.js";
import { urgency } from "#components/urgency/urgency.js";
import { waButton } from "#components/whatsapp-button/whatsapp-button.js";

import { pick as pickProjects } from "../content/projects.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, faqContent, formCta, heroNote, processContent, site, testimonialsHead } from "../content/site.js";
import { defaultCta, ecosystem, solutions } from "../content/solutions.js";
import { page } from "#layouts/base.js";

/* ==========================================================================
   ONE template, two pages.

   A solution page is: the promise, the pain, WHAT can be built, what you get,
   the PROOF that it works, why FLOA, the ask, the process, the objections, the
   form — and only THEN the link to the other solution, so it never competes
   with the ask above it.

   Every page differs only through the data in src/content/solutions.js:
     afterHero — a block straight under the opening
     intro     — cards straight under the opening
     kinds     — the kinds of thing this page builds, after the pain
     proof     — the page proves itself its own way: a flow, a project, a quote
     extras    — the page's own named card sections
     reassure  — a risk-lowering head, right before the CTA band
   A section whose data is missing simply does not render.
   ========================================================================== */

/* A row of cards under a head — the shape most of these sections are. */
const cardSection = (ctx, { id, className, head, cols, items, narrow }) => section({
  id,
  className: className ?? "solutions",
  children: html`${head && sectionHead(head)}
${cardGrid({
    cols,
    className: narrow ? "cards-narrow" : null,
    children: items.map((item) => card(ctx, item)),
  })}`,
});

/* The proof block. Whichever of these the solution supplies, always in this
   order: first how it works, then the thing we built, then the client who lived
   it — evidence before words. */
const proofSection = (ctx, proof) => proof && section({
  id: "proof",
  className: "projects proof",
  children: html`${proof.head && sectionHead(proof.head)}
${proof.flow && flow({ steps: proof.flow })}
${proof.flows && flowCards({ items: proof.flows })}
${proof.projectsHead && sectionHead(proof.projectsHead)}
${proof.projects && projectGrid(ctx, { items: pickProjects(...proof.projects) })}
${proof.quotes && quotes({ items: pickQuotes(...proof.quotes) })}`,
});

export const render = (ctx, solution) => page(ctx, {
  path: `${site.folder}${solution.slug}/`,
  meta: solution.meta,
  og: solution.og,
  waText: solution.waText,
  ctaLabel: solution.waLabel,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: solution.meta.serviceType,
    name: solution.meta.serviceName,
    description: solution.meta.description,
    /* the image a search result can actually SHOW — this page's own card */
    image: `${site.origin}/${site.folder}${solution.og.image}`,
    areaServed: "IL",
    url: `${site.origin}/${site.folder}${solution.slug}/`,
    provider: {
      "@type": "ProfessionalService",
      name: site.brand,
      url: `${site.origin}/`,
      logo: `${site.origin}${site.icons.apple}`,
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
  /* WhatsApp first — it is the primary action. The form is the way out for
     anyone who would rather be called back. */
  actions: html`${waButton(ctx, { label: solution.waLabel })}
          ${button(ctx, { href: "#contact", label: formCta, variant: "ghost", size: "lg", analytics: "hero_form_cta" })}`,
})}

${solution.afterHero && section({
  id: "outcome",
  className: "solutions",
  children: html`${sectionHead(solution.afterHero.head)}
${solution.afterHero.flow && flow({ steps: solution.afterHero.flow })}`,
})}

<!-- the ways in: water, the hue this site uses for how a thing works -->
${solution.intro && cardSection(ctx, {
  id: "tracks",
  cols: solution.intro.cols,
  items: solution.intro.items.map((i) => ({ ...i, accent: "water" })),
})}

${cardSection(ctx, {
  id: "problem",
  className: "problem",
  head: solution.problem.head,
  cols: 4,
  /* the pains are clay — the one hue on the site that means "this hurts" */
  items: solution.problem.items.map((i) => ({ ...i, accent: "clay", size: "sm" })),
})}

${solution.urgency && urgency({ text: solution.urgency })}

<!-- what can be built: water, the hue this site uses for how a thing works -->
${solution.kinds && cardSection(ctx, {
  id: "kinds",
  head: solution.kinds.head,
  cols: solution.kinds.cols,
  items: solution.kinds.items.map((i) => ({ ...i, accent: "water" })),
})}

${section({
  id: "included",
  className: "solutions",
  children: html`${sectionHead(solution.included.head)}
${cardGrid({
    className: "cards-narrow",
    children: solution.included.items.map((item) =>
      card(ctx, { ...item, icon: "check", shape: "dot", row: true })
    ),
  })}
${solution.included.types && chips({ items: solution.included.types })}`,
})}

${proofSection(ctx, solution.proof)}

${(solution.extras ?? []).map((extra) => cardSection(ctx, { ...extra }))}

${solution.quotes && section({
  id: "testimonial",
  className: "testimonial",
  children: html`${sectionHead(testimonialsHead)}
${quotes({ items: pickQuotes(...solution.quotes) })}`,
})}

${cardSection(ctx, {
  id: "advantage",
  className: "advantage",
  head: solution.advantage.head,
  cols: 3,
  items: solution.advantage.items.map((i) => ({ ...i, accent: "teal" })),
})}

${solution.reassure && section({
  id: "reassure",
  className: "solutions reassure",
  children: sectionHead(solution.reassure),
})}

<!-- the years behind the work, said once, in FLOA's own teal: the last thing
     read before the ask -->
${solution.trust && urgency({ text: solution.trust, accent: "teal" })}

${ctaBand(ctx, { ...(solution.cta ?? defaultCta), cta: solution.waLabel })}

${section({
  id: "process",
  className: "process",
  children: html`${sectionHead(processContent.head)}
${timeline({ items: processContent.steps })}`,
})}

${section({
  id: "faq",
  className: "faq-section",
  children: html`${sectionHead(faqContent.head)}
${faq({ items: faqContent.items })}`,
})}

${section({
  id: "contact",
  className: "contact",
  children: contact(ctx, contactContent, { page: solution.pageName, waLabel: solution.waLabel }),
})}

<!-- the other solution: AFTER the ask, never competing with it -->
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
</main>`,
});
