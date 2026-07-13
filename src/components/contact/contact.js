import { attrs, cx, html } from "../../lib/html.js";
import { button } from "../button/button.js";
import { divider } from "../divider/divider.js";
import { icon } from "../icon/icon.js";
import { sectionHead } from "../section-head/section-head.js";
import { whatsappButton } from "../whatsapp-button/whatsapp-button.js";

/* one field, whatever its control — every one shares the same chrome.
   `required` is decided by the caller so a page can ask for less. */
function field(f, selected, required) {
  const shared = attrs({ id: f.name, name: f.name, autocomplete: f.autocomplete, inputmode: f.inputmode, required });

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

   content: { head, fields, submitLabel, note, orLabel, whatsapp, success }
   opts:
     selected         — the preselected "how can we help" option
     hideService      — drop the service <select> and carry `selected` as a
                        hidden value, so a solution page arrives pre-scoped
     minimalRequired  — ask only for name + phone; everything else optional */
export const contact = (ctx, { head, fields, submitLabel, note, orLabel, whatsapp, success }, { selected, hideService = false, minimalRequired = false } = {}) => {
  const isRequired = (f) => (minimalRequired ? f.name === "name" || f.name === "phone" : f.required);
  const service = fields.find((f) => f.type === "select");
  const visible = hideService ? fields.filter((f) => f.type !== "select") : fields;

  return html`
      <div class="contact-panel reveal">
        ${sectionHead({ ...head, reveal: false })}

        <form class="contact-form" id="contactForm" novalidate>
          ${visible.map((f) => field(f, selected, isRequired(f)))}
          ${hideService && service ? html`<input type="hidden" name="${service.name}" value="${selected}">` : ""}

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
          <!-- the backup way to WhatsApp; contact.client.js sets its href and
               label per device, and on a phone also opens it automatically -->
          <a class="btn btn-wa-open" id="formSuccessWa" target="_blank" rel="noopener">
            <span class="wa-glyph" aria-hidden="true">${icon("whatsapp")}</span>
            <span class="btn-wa-open-label"></span>
          </a>
        </div>
      </div>`;
};
