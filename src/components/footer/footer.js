import { attrs, html } from "../../lib/html.js";

/* The same footer on every page — the links resolve themselves for the page's
   depth, so there is nothing per-page to keep in sync. { brand, sub, links } */
export const footer = (ctx, { brand, sub, links, copyright }) => html`
<footer class="site-footer">
  <div class="container footer-inner">
    <div class="footer-brand">
      <span class="logo-mark">${brand}</span>
      <span class="logo-sub">${sub}</span>
    </div>
    <nav class="footer-links" aria-label="קישורי תחתית">
      ${links.map((link) => html`<a href="${link.href}"${attrs({ "data-whatsapp": link.whatsapp || null, "data-analytics": link.whatsapp ? "whatsapp_cta" : null })}>${link.label}</a>`)}
    </nav>
  </div>
  <div class="footer-bottom">
    <div class="container">${copyright}</div>
  </div>
</footer>`;
