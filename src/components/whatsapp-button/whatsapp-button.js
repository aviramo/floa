import { cx, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { icon } from "../icon/icon.js";

/* THE WhatsApp CTA. It is the primary action almost everywhere on the site.

   There is exactly ONE of these in the codebase: the hero, the mid-page band,
   the sticky mobile dock and the contact panel all render this, so the mark, the
   label and the target can never drift apart. Nothing else may hand-roll a
   WhatsApp button.

   `variant` picks the skin, not the behaviour:
     whatsapp (default) — the loud teal pill. WhatsApp is the page's main action.
     ghost              — the quiet outlined one, for the ONE place where it is
                          NOT the main action: inside the contact panel, under
                          the form, where "call me back" is the thing the visitor
                          came for and WhatsApp is the alternative offered under
                          an "or". Same mark, same number, same message — only
                          the emphasis changes, so the panel has one primary
                          instead of two.

   The href is not written here. whatsapp-button.client.js writes it at runtime
   from the one number in site config, plus the page's own opening message —
   wa.me on a phone, WhatsApp Web on a desktop. It finds the button by
   [data-whatsapp], not by class, so the skin cannot break the link.

   { label, variant, size, block, inline } */
export const waButton = (ctx, { label, variant = "whatsapp", size = "lg", block, inline, className } = {}) =>
  button(ctx, {
    variant,
    size,
    block,
    inline,
    /* btn-wa carries the mark, the label and the one-line rule for BOTH skins */
    className: cx("btn-wa", className),
    whatsapp: true,
    analytics: "whatsapp_cta",
    children: html`<span class="wa-mark" aria-hidden="true">${icon("whatsapp")}</span><span class="wa-label">${label}</span>`,
  });
