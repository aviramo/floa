import { attrs, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { icon } from "../icon/icon.js";
import { sectionHead } from "../section-head/section-head.js";

/* The lead form for the landing-page-offer campaign. Same panel chrome as the
   site's shared contact form (contact.css), but its own fields, its own page
   name, and its own success behaviour: this campaign hands the visitor to
   WhatsApp right after the send instead of waiting for a callback, so the
   client script (offer-form.client.js) drives that handoff on its own rather
   than sharing contact.client.js.

   { head, fields, submitLabel, success }, { page } */
export const offerForm = (ctx, { head, fields, submitLabel, success }, { page }) => html`
      <div class="contact-panel reveal" id="offerForm">
        ${head && sectionHead({ ...head, reveal: false })}

        <form class="contact-form" id="offerLeadForm" novalidate>
          ${fields.map((f) => html`
          <div class="field">
            <label for="offer-${f.name}">${f.label}</label>
            <input type="${f.type}"${attrs({
              id: `offer-${f.name}`,
              name: f.name,
              autocomplete: f.autocomplete,
              inputmode: f.inputmode,
              required: true,
            })}>
          </div>`)}

          <input type="hidden" name="page" value="${page}">
          <!-- the spam trap, same recipe as the shared contact form -->
          <div class="hp" aria-hidden="true">
            <label for="offer-company">אל תמלאו שדה זה</label>
            <input type="text" id="offer-company" name="company" tabindex="-1" autocomplete="off">
          </div>

          <div class="form-actions">
            ${button(ctx, { type: "submit", label: submitLabel, size: "lg", block: true })}
          </div>
        </form>

        <div class="form-success" id="offerFormSuccess" role="status" hidden>
          <strong>${success.title}</strong>
          <span>${success.text}</span>
          <a href="#" class="btn btn-wa btn-ghost btn-lg" id="offerWaBackup" data-analytics="whatsapp_cta" hidden>
            <span class="wa-mark" aria-hidden="true">${icon("whatsapp")}</span><span class="wa-label" id="offerWaBackupLabel"></span>
          </a>
        </div>
      </div>`;
