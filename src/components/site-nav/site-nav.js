import { attrs, html } from "../../lib/html.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* ==========================================================================
   The bar at the top of a page that is one long scroll.

   A page that holds everything has to say where everything is, and say it
   without making the reader work: a few plain words, each one a jump to its
   part, and the one action (WhatsApp) always within reach. Nothing else.

   It is not drawn by every page: a business gives the context a `nav`
   (see lib/context.js) and the layout draws it. A page without one has no bar.

   Three small behaviours live in site-nav.client.js, none of them needed for the
   bar to work:
     - the brand appears once the opening has gone (the opening is led by a film
       that carries the brand's own mark, and two marks one above the other is
       one too many)
     - the bar tucks away while you read down and comes back when you scroll up
     - on a phone the links fold into a menu

   { brand, links:[{href,label}], cta:{label} } */
export const siteNav = (ctx, { brand, links, cta }) => html`
  <header class="site-nav" data-site-nav>
    <div class="container nav-inner">
      <a class="nav-brand" href="${ctx.home("#top")}"${attrs({ "aria-label": `${brand}, לראש הדף` })}><span>${brand}</span></a>

      <nav class="nav-links" id="nav-menu" aria-label="ראשי">
        ${links.map((link) => html`<a href="${link.href}">${link.label}</a>`)}
      </nav>

      <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="nav-menu" aria-label="תפריט">
        <span class="nav-toggle-bars" aria-hidden="true"></span>
      </button>

      ${cta && html`<div class="nav-cta">${waButton(ctx, { label: cta.label, size: null })}</div>`}
    </div>
  </header>`;
