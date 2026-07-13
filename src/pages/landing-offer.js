import { html } from "../lib/html.js";

import { button } from "../components/button/button.js";
import { card, cardGrid } from "../components/card/card.js";
import { about } from "../components/about/about.js";
import { compare } from "../components/compare/compare.js";
import { deviceMock } from "../components/device-mock/device-mock.js";
import { faq } from "../components/faq/faq.js";
import { hero } from "../components/hero/hero.js";
import { offerForm } from "../components/offer-form/offer-form.js";
import { projectGrid } from "../components/project-card/project-card.js";
import { section } from "../components/section/section.js";
import { sectionHead } from "../components/section-head/section-head.js";
import { timeline } from "../components/timeline/timeline.js";
import { urgency } from "../components/urgency/urgency.js";
import { waButton } from "../components/whatsapp-button/whatsapp-button.js";

import { pick as pickProjects } from "../content/projects.js";
import { site } from "../content/site.js";
import { landingOffer as offer } from "../content/landing-offer.js";
import { page } from "../layouts/base.js";

/* The landing-page-offer campaign page. A one-off, self-contained template:
   unlike src/pages/solution.js it shares no section shape with the two
   solution pages, because the offer it sells (one fixed starting price, with
   an upsell path instead of a menu of tiers) is not something either of them
   says. It reuses every component it can from the rest of the site: the card,
   the timeline, the project grid, the FAQ, the about panel, so it still reads
   as FLOA, just arranged for this one campaign. */

/* Meta Pixel / GA4 load ONLY if the site owner has filled in a real id in
   src/content/landing-offer.js. Both are empty by default, so by default this
   renders nothing at all. */
const analyticsHead = ({ ga4, metaPixel }) => html`${ga4 ? html`
  <script async src="https://www.googletagmanager.com/gtag/js?id=${ga4}"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${ga4}");</script>` : ""}${metaPixel ? html`
  <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
  document,"script","https://connect.facebook.net/en_US/fbevents.js");
  fbq("init","${metaPixel}");fbq("track","PageView");</script>` : ""}`;

export const render = (ctx) => page(ctx, {
  path: `${offer.slug}/`,
  meta: offer.meta,
  og: offer.og,
  waText: offer.waText,
  ctaLabel: offer.hero.waLabel,
  head: analyticsHead(offer.analyticsIds),
  jsonLd: {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: "בניית דף נחיתה",
    name: offer.meta.title,
    description: offer.meta.description,
    image: `${site.origin}/${offer.og.image}`,
    areaServed: "IL",
    url: `${site.origin}/${offer.slug}/`,
    offers: { "@type": "Offer", price: "500", priceCurrency: "ILS" },
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
  title: offer.hero.title,
  text: offer.hero.text,
  chip: offer.hero.chip,
  note: offer.hero.note,
  art: deviceMock({ label: offer.hero.mockAlt }),
  actions: html`${waButton(ctx, { label: offer.hero.waLabel })}
          ${button(ctx, { href: "#included", label: offer.hero.secondaryLabel, variant: "ghost", size: "lg" })}`,
})}

${section({
  id: "who",
  className: "problem",
  children: html`${sectionHead(offer.who.head)}
${cardGrid({
    cols: 4,
    children: offer.who.items.map((item) => card(ctx, { ...item, accent: "clay", size: "sm" })),
  })}`,
})}

${section({
  id: "included",
  className: "solutions",
  children: html`${sectionHead(offer.included.head)}
${cardGrid({
    className: "cards-narrow",
    children: offer.included.items.map((item) => card(ctx, { ...item, icon: "check", shape: "dot", row: true })),
  })}
${urgency({ text: offer.included.clarify, accent: "teal" })}
<p class="contact-note">${offer.included.fine}</p>`,
})}

${section({
  id: "tracks",
  className: "solutions",
  children: html`${sectionHead(offer.tracks.head)}
${compare(ctx, { tracks: offer.tracks.items })}`,
})}

${section({
  id: "grow",
  className: "solutions",
  children: html`${sectionHead(offer.grow.head)}
${timeline({ items: offer.grow.steps })}`,
})}

${section({
  id: "work",
  className: "projects",
  children: html`${sectionHead(offer.work.head)}
${projectGrid(ctx, { items: pickProjects(offer.work.project) })}`,
})}

${section({
  id: "process",
  className: "process",
  children: html`${sectionHead(offer.process.head)}
${timeline({ items: offer.process.steps })}`,
})}

${section({
  id: "about",
  className: "about",
  children: about(ctx, offer.about),
})}

${section({
  id: "faq",
  className: "faq-section",
  children: html`${sectionHead(offer.faq.head)}
${faq({ items: offer.faq.items })}`,
})}

${section({
  id: "contact",
  className: "contact",
  children: html`
      ${sectionHead({ title: offer.closing.title, text: offer.closing.text })}
      <div class="hero-actions">
        ${waButton(ctx, { label: offer.closing.waLabel })}
        ${button(ctx, { href: "#offerForm", label: offer.closing.formCta, variant: "ghost", size: "lg" })}
      </div>
${offerForm(ctx, { fields: offer.form.fields, submitLabel: offer.form.submitLabel, success: offer.form.success }, { page: offer.pageName })}`,
})}
</main>`,
});
