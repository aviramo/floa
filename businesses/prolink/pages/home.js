import { html } from "#lib/html.js";

import { about } from "#components/about/about.js";
import { button } from "#components/button/button.js";
import { card, cardGrid } from "#components/card/card.js";
import { contact } from "#components/contact/contact.js";
import { hero } from "#components/hero/hero.js";
import { quotes } from "#components/quote-card/quote-card.js";
import { section } from "#components/section/section.js";
import { sectionHead } from "#components/section-head/section-head.js";
import { timeline } from "#components/timeline/timeline.js";
import { page } from "#layouts/base.js";

import { home } from "../content/home.js";
import { pick as pickQuotes } from "../content/quotes.js";
import { contactContent, heroNote, site } from "../content/site.js";

/* ProLink's homepage: the whole story in one scroll, every block a shared
   component fed by content. No markup here is unique to the page — the same
   engine that renders FLOA renders this, themed and worded for ProLink. */
export const render = (ctx) => page(ctx, {
  path: site.folder,
  meta: home.meta,
  og: home.og,
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "ProLink Identity Management Architects",
    slogan: site.slogan,
    description: home.meta.description,
    url: `${site.origin}/${site.folder}`,
    image: `${site.origin}/${site.folder}${home.og.image}`,
    telephone: "+972-3-6773370",
    email: site.email,
    foundingDate: "1996",
    areaServed: "IL",
    founder: { "@type": "Person", name: site.founder },
  },

  body: html`
<main id="top">
${hero(ctx, {
  ...home.hero,
  note: heroNote,
  actions: html`${button(ctx, { href: "#contact", label: "לשיחת חשיבה ללא עלות", size: "lg", analytics: "hero_contact_cta" })}
          ${button(ctx, { href: "#expertise", label: "להתמחויות שלנו", variant: "ghost", size: "lg" })}`,
})}

${section({
  id: "expertise",
  className: "expertise",
  children: html`${sectionHead(home.expertise.head)}
${cardGrid({
    cols: 4,
    children: home.expertise.items.map((item) => card(ctx, { ...item, accent: "teal" })),
  })}`,
})}

${section({
  id: "about",
  className: "about",
  children: about(ctx, home.about),
})}

${section({
  id: "history",
  className: "process",
  children: html`${sectionHead(home.history.head)}
${timeline({ items: home.history.steps })}`,
})}

${section({
  id: "testimonials",
  className: "testimonial",
  children: html`${sectionHead(home.testimonialsHead)}
${quotes({ items: pickQuotes("weizmann", "menora", "biu", "haifa", "jce", "cal") })}`,
})}

${section({
  id: "tech",
  className: "solutions",
  children: html`${sectionHead(home.tech.head)}
${cardGrid({
    cols: 3,
    children: home.tech.items.map((item) => card(ctx, { ...item, size: "sm", accent: "water" })),
  })}`,
})}

${section({
  id: "contact",
  className: "contact",
  children: contact(ctx, contactContent, { page: home.pageName }),
})}
</main>`,
});
