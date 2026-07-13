import { attrs, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { sectionHead } from "../section-head/section-head.js";
import { waButton } from "../whatsapp-button/whatsapp-button.js";

/* The closing ask, and the last thing on every page above the ecosystem row.

   The form asks for a name and a phone number and nothing else — no email, no
   company, no service picker, no free text. Every extra field is labour, and
   labour is what a fallback path can least afford. Under it, separated by a
   rule, sits the page's WhatsApp button: the visitor who does not want to wait
   for a call back still has the faster door, without scrolling back up.

   The page name rides along in a hidden field, so the email that lands in the
   inbox says which page the visitor was reading.

   content: { head, fields, submitLabel, note, or, success }
   { page, waLabel } */
export const contact = (ctx, { head, fields, submitLabel, note, or, success }, { page, waLabel } = {}) => html`
      <div class="contact-panel reveal">
        ${sectionHead({ ...head, reveal: false })}

        <form class="contact-form" id="contactForm" novalidate>
          ${fields.map((f) => html`
          <div class="field">
            <label for="${f.name}">${f.label}</label>
            <input type="${f.type}"${attrs({
              id: f.name,
              name: f.name,
              autocomplete: f.autocomplete,
              inputmode: f.inputmode,
              required: true,
            })}>
          </div>`)}

          <input type="hidden" name="page" value="${page}">
          <!-- the spam trap: a real visitor never sees it, so a filled one is a bot.
               Named innocuously, off-screen rather than display:none, and never
               autofilled. contact.client.js drops the submit when it has content. -->
          <div class="hp" aria-hidden="true">
            <label for="company">אל תמלאו שדה זה</label>
            <input type="text" id="company" name="company" tabindex="-1" autocomplete="off">
          </div>

          <div class="form-actions">
            ${button(ctx, { type: "submit", label: submitLabel, size: "lg", block: true })}
          </div>
        </form>

        <p class="contact-note">${note}</p>

        <div class="form-success" id="formSuccess" role="status" hidden>
          <strong>${success.title}</strong>
          <span>${success.text}</span>
        </div>

        ${waLabel && html`<div class="contact-wa">
          <p class="contact-or">${or}</p>
          ${waButton(ctx, { label: waLabel, block: true })}
        </div>`}
      </div>`;
