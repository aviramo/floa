/* ==========================================================================
   Template rendering for the roster mails.

   `{{x}}`   the value, HTML-escaped.
   `{{{x}}}` the value as it is.

   Rendering is ONE pass over the template: a value is never scanned for
   placeholders again, so a participant who types `{{admin_link}}` as their name
   gets those characters on the page, nothing more.

   `{{{x}}}` is raw for everything the BUSINESS or the system writes (business
   name, meeting fields, links). It is never raw for a value that came from a
   participant, from an account or from an API caller (UNTRUSTED_VARS): triple
   braces around `first_name` still produce escaped text, so a template can never
   be the way a stranger's HTML lands in an admin's inbox.

   Optional parts without a template language: an element carrying
   `data-if="name"` (on p, tr, li, a or span, which do not nest in these
   templates) is dropped when that variable is empty, and the attribute is
   removed when it is kept. That is how the default mails stay clean when a
   business has no payment link or no WhatsApp number.

   A TEMPLATE IS INPUT. A business member writes it (up to the caps composeMail
   enforces), and it is rendered inside the one Worker every business shares, so
   nothing here may take more than linear time in its size. applyDataIf and
   htmlToText are single-pass scanners: a '<' is looked at once, the position of
   the next '>' and of each closing tag is remembered instead of searched again,
   and a tag longer than MAX_OPEN_TAG is not a tag worth reading. (The first
   versions were regular expressions that backtracked: 13 KB of '<p data-if="a" '
   took 9 seconds, and 54 KB took a minute and a half.)
   ========================================================================== */
import { stripHidden } from "./text.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

export const UNTRUSTED_VARS = Object.freeze(new Set([
  "first_name", "last_name", "full_name", "phone", "email", "age", "gender", "method", "account_email", "account_name",
]));

const TOKEN = /\{\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}\}|\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;

const valueOf = (vars, name) => {
  const key = name.toLowerCase();
  if (!vars || !Object.hasOwn(vars, key)) return "";
  const v = vars[key];
  return v === null || v === undefined ? "" : String(v);
};

const present = (v) => v !== "" && v.trim() !== "";

/* html: the template, with the optional parts resolved, then substituted */
export function render(template, vars, { untrusted = UNTRUSTED_VARS } = {}) {
  const resolved = applyDataIf(String(template ?? ""), vars);
  return resolved.replace(TOKEN, (_m, raw, escaped) => {
    const name = (raw || escaped).toLowerCase();
    const v = valueOf(vars, name);
    return raw && !untrusted.has(name) ? v : esc(v);
  });
}

/* --- the two scanners ------------------------------------------------------------- */

/* the longest opening tag read as a tag: a data-if element's opening tag is a few
   dozen characters, anything past this is not one */
export const MAX_OPEN_TAG = 300;

const WS = /\s/;
const OPEN_TAG = /(p|tr|li|a|span)(?=\s)/iy;
const ATTR = /\sdata-if="([a-z_][a-z0-9_]*)"/i;

/* ASCII-only lower case: toLowerCase can change a string's length (some letters
   become two), and the scanners work with indexes into the original */
const lowerAscii = (s) => s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

/* find(tag, from) -> { pos, end }: the first `</tag` + optional whitespace + `>` at or
   after `from` (pos = where it starts, end = just after its '>'), or pos -1.
   The last answer for each tag is kept: a search that found nothing from X finds
   nothing from anywhere after X, and one that found the close at P is still right
   for any start up to P. So many opening tags without a closing one cost one
   search between them, not one each. */
function closeFinder(html, lower) {
  const n = html.length;
  const cache = new Map();
  return (tag, from) => {
    const c = cache.get(tag);
    if (c && c.from <= from && (c.pos === -1 || c.pos >= from)) return c;
    const needle = `</${tag}`;
    let at = from;
    for (;;) {
      const i = lower.indexOf(needle, at);
      if (i === -1) {
        const r = { from, pos: -1, end: -1 };
        cache.set(tag, r);
        return r;
      }
      let j = i + needle.length;
      while (j < n && WS.test(html[j])) j++;
      if (html[j] === ">") {
        const r = { from, pos: i, end: j + 1 };
        cache.set(tag, r);
        return r;
      }
      at = i + 1;
    }
  };
}

export function applyDataIf(html, vars) {
  if (!/data-if/i.test(html)) return html;
  const lower = lowerAscii(html);
  const findClose = closeFinder(html, lower);
  let out = "";
  let last = 0;      // the start of what has not been copied yet
  let i = 0;
  let gt = -1;       // the next '>' at or after the cursor (Infinity: there is none)

  for (;;) {
    i = html.indexOf("<", i);
    if (i === -1) break;

    OPEN_TAG.lastIndex = i + 1;
    const m = OPEN_TAG.exec(html);
    if (!m) { i++; continue; }

    if (gt < i) {
      gt = html.indexOf(">", i);
      if (gt === -1) gt = Infinity;
    }
    if (gt - i > MAX_OPEN_TAG) { i++; continue; }

    const tag = m[1];
    const rest = html.slice(i + 1 + tag.length, gt);       // between the tag name and its '>'
    const attr = ATTR.exec(rest);
    if (!attr) { i++; continue; }

    const close = findClose(tag.toLowerCase(), gt + 1);
    if (close.pos === -1) { i++; continue; }

    const before = rest.slice(0, attr.index);
    const after = rest.slice(attr.index + attr[0].length);
    out += html.slice(last, i);
    out += present(valueOf(vars, attr[1]))
      ? `<${tag}${before}${after}>${html.slice(gt + 1, close.pos)}</${tag}>`
      : "";
    last = i = close.end;
  }
  return out + html.slice(last);
}

/* text (the subject): same placeholders, nothing escaped because a subject is
   not HTML, but never a line break or a control character, never a character
   that hides or flips text, and a sane length */
export function renderText(template, vars, max = 200) {
  const out = String(template ?? "").replace(TOKEN, (_m, raw, escaped) => valueOf(vars, (raw || escaped)));
  return stripHidden(out).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, max);
}

/* --- plain-text alternative ------------------------------------------------- */

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " };
const decode = (s) => s.replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|(amp|lt|gt|quot|nbsp));/gi, (_m, dec, hex, named) => {
  if (named) return ENTITIES[named.toLowerCase()];
  const code = dec ? Number(dec) : Number.parseInt(hex, 16);
  return code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
});

/* the text of a piece of HTML with every <...> taken out (a '<' with no '>' after it stays) */
function stripTags(s) {
  let out = "";
  let i = 0;
  for (;;) {
    const lt = s.indexOf("<", i);
    if (lt === -1) return out + s.slice(i);
    const gt = s.indexOf(">", lt);
    if (gt === -1) return out + s.slice(i);
    out += s.slice(i, lt);
    i = gt + 1;
  }
}

const TEXT_ELEMENTS = new Set(["script", "style", "head", "title"]);
const WORD = /[A-Za-z0-9_]/;
const TAG_NAME = /^\/?([a-z][a-z0-9]*)/i;
const HREF = /\shref\s*=\s*"([^"]*)"/i;
const MAX_ANCHOR_TAG = 4000;

/* One pass. Script, style, head and title elements go with their content; a link
   becomes `label (address)` when the address is http(s), mailto or tel (else the
   label); <br> and the closing tags of blocks become line breaks; every other tag
   goes. Each piece of text is decoded exactly once. */
export function htmlToText(html) {
  const s = String(html ?? "");
  const n = s.length;
  const findClose = closeFinder(s, lowerAscii(s));
  const pieces = [];
  const text = (t) => { if (t) pieces.push(decode(t)); };
  let i = 0;
  let gt = -1;

  while (i < n) {
    const lt = s.indexOf("<", i);
    if (lt === -1) { text(s.slice(i)); break; }
    text(s.slice(i, lt));

    if (gt < lt) {
      gt = s.indexOf(">", lt);
      if (gt === -1) gt = Infinity;
    }
    if (gt === Infinity) { text(s.slice(lt)); break; }     // a '<' with no '>' left is just a character

    const body = s.slice(lt + 1, gt);
    i = gt + 1;
    const named = TAG_NAME.exec(body);
    const closing = body.charCodeAt(0) === 47;             // "/"
    const name = named ? named[1].toLowerCase() : "";
    const boundary = named ? !WORD.test(body[named[0].length] ?? "") : false;

    if (!closing && boundary && TEXT_ELEMENTS.has(name)) {
      const close = findClose(name, gt + 1);
      if (close.pos !== -1) { i = close.end; continue; }
    }
    if (!closing && boundary && name === "a" && body.length <= MAX_ANCHOR_TAG) {
      const href = HREF.exec(body);
      const close = href ? findClose("a", gt + 1) : null;
      if (href && close.pos !== -1) {
        const label = decode(stripTags(s.slice(gt + 1, close.pos))).trim();
        const url = decode(href[1]).trim();
        pieces.push(/^(https?:|mailto:|tel:)/i.test(url) ? (label && label !== url ? `${label} (${url})` : url) : label);
        i = close.end;
        continue;
      }
    }
    if (/^br\s*\/?$/i.test(body)) pieces.push("\n");
    else if (/^\/tr\s*$/i.test(body)) {
      pieces.push("\n");
      while (i < n && WS.test(s[i])) i++;
    } else if (/^\/(p|div|h[1-6]|li|table)\s*$/i.test(body)) pieces.push("\n\n");
    else if (/^\/t[dh]\s*$/i.test(body)) pieces.push(" ");
  }
  return pieces.join("").replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* --- Hebrew display helpers --------------------------------------------------------- */

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/* "2026-11-05" -> "יום חמישי, 5.11". A calendar date, so no timezone is
   involved: it is read as UTC midnight and only its weekday is taken. */
export function formatMeetingDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ""));
  if (!m) return "";
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return "";
  const day = WEEKDAYS[t.getUTCDay()];
  return `${t.getUTCDay() === 6 ? day : `יום ${day}`}, ${d}.${mo}`;
}

export const formatMeetingTime = (time) => {
  const m = /^(\d{2}):(\d{2})/.exec(String(time ?? ""));
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1]}:${m[2]}` : "";
};

/* a shekel amount as a person writes it: 120, 12.5, never 120.00 */
export function formatAmount(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return String(Math.round(n * 100) / 100);
}
