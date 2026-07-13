/* ==========================================================================
   html`` — the whole templating engine, in one file.

   Values interpolated into a template are escaped unless they are already
   markup produced by html`` (or wrapped in raw()). Arrays are joined. null,
   undefined and false render as nothing, so `cond && html`...`` just works.
   ========================================================================== */

/* Text content only has to escape the characters that can start markup. Escaping
   quotes here too would litter Hebrew copy with &quot; for nothing. */
const TEXT = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
export const escape = (value) => String(value).replace(/[&<>]/g, (c) => TEXT[c]);

/* An attribute value is always double-quoted, so " must go — but ' and < may
   stay, which keeps a data: URI or a font URL readable. */
export const escapeAttr = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");

class Markup {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

/* Trust a string as markup. Only for authored HTML (an SVG file, a copy line
   with a link in it) — never for anything a visitor could supply. */
export const raw = (value) => new Markup(String(value));

const resolve = (value, inAttribute) => {
  if (value === null || value === undefined || value === false || value === true) return "";
  if (value instanceof Markup) return value.value;
  if (Array.isArray(value)) return value.map((v) => resolve(v, inAttribute)).join("");
  return inAttribute ? escapeAttr(value) : escape(value);
};

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    /* href="${…}" — the value lands inside an attribute, so it needs the
       attribute escaper. Anywhere else it is text. */
    out += resolve(values[i], /="$/.test(strings[i])) + strings[i + 1];
  }
  return new Markup(out);
}

/* attrs({class: "btn", disabled: true, id: null}) -> ` class="btn" disabled` */
export const attrs = (map) => {
  const out = Object.entries(map)
    .filter(([, v]) => v !== null && v !== undefined && v !== false && v !== "")
    .map(([k, v]) => (v === true ? k : `${k}="${escapeAttr(v)}"`))
    .join(" ");
  return raw(out ? " " + out : "");
};

/* cx("card", isWide && "card-wide") -> "card card-wide" */
export const cx = (...names) => names.flat().filter(Boolean).join(" ");
