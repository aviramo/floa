import { attrs, cx, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { divider } from "../divider/divider.js";
import { sectionHead } from "../section-head/section-head.js";
import { whatsappButton } from "../whatsapp-button/whatsapp-button.js";

/* one field, whatever its control — every one shares the same chrome */
function field(f, selected) {
  const shared = attrs({ id: f.name, name: f.name, autocomplete: f.autocomplete, inputmode: f.inputmode, required: f.required });

  const control = {
    select: () => html`<select${shared}>
              <option value="" disabled${attrs({ selected: !selected })}>${f.placeholder}</option>
              ${f.options.map((opt) => html`<option value="${opt}"${attrs({ selected: opt === selected })}>${opt}</option>`)}
            </select>`,
    textarea: () => html`<textarea${shared} rows="${f.rows ?? 4}"></textarea>`,
  }[f.type] ?? (() => html`<input type="${f.type}"${shared}>`);

  return html`
          <div class="${cx("field", f.full && "field-full")}">
            <label for="${f.name}">${f.label}</label>
            ${control()}
          </div>`;
}

/* The whole ask: the panel, the form, the reassurance, and the WhatsApp way out
   for anyone who would rather not fill a form.

   { head, fields, selected, submitLabel, note, orLabel, whatsapp, success } */
export const contact = (ctx, { head, fields, selected, submitLabel, note, orLabel, whatsapp, success }) => html`
      <div class="contact-panel reveal">
        ${sectionHead({ ...head, reveal: false })}

        <form class="contact-form" id="contactForm" novalidate>
          ${fields.map((f) => field(f, selected))}

          <div class="form-actions">
            ${button(ctx, { type: "submit", label: submitLabel, size: "lg", block: true })}
          </div>
        </form>

        <p class="contact-note">${note}</p>

        ${divider({ label: orLabel })}

        ${whatsappButton(ctx, whatsapp)}

        <div class="form-success" id="formSuccess" role="status" hidden>
          <strong>${success.title}</strong>
          <span>${success.text}</span>
        </div>
      </div>`;
