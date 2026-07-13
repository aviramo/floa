import { attrs, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { sectionHead } from "../section-head/section-head.js";

/* The secondary way in, for the visitor who would rather not open WhatsApp.

   It asks for a name and a phone number and nothing else — no email, no company,
   no service picker, no free text. Every extra field is labour, and labour is
   what a fallback path can least afford. WhatsApp is the primary action and it
   lives in the hero, the band and the dock; it deliberately does NOT appear
   inside this panel too.

   The page name rides along in a hidden field, so the email that lands in the
   inbox says which of the six pages the visitor was reading.

   content: { head, fields, submitLabel, note, success } */
export const contact = (ctx, { head, fields, submitLabel, note, success }, { page } = {}) => html`
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
      </div>`;
