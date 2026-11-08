/* ==========================================================================
   Webhook URL validation. Run when the business saves the URL (by the
   database, same rules) AND again here at send time, because a URL that was
   fine when it was saved is not a promise about what it is now, and this is the
   one place where the Worker makes a request to an address a stranger chose.

   The rules are the database's, to the letter (roster_valid_webhook_url, and the
   connect page's client check, and the docs): a URL the database accepted and
   this refused would fail every attempt for ever, silently, and one this accepted
   and the database refused would pass a check here and then fail the trigger when
   it is saved. So the last gate below is the database's own three patterns, ported
   one to one (SHAPE, INTERNAL, WILDCARD), and everything stricter than them (the
   readable reasons) comes before it.

   Allowed: https, a real public hostname (letters, digits and single hyphens in
   labels of at most 63 characters, a letters-only ending of 2 to 24), port 443 or
   none, no credentials, <= 500 characters.
   Refused: any other port (a webhook is an HTTPS endpoint, not a port scanner);
   IP literals (any spelling: the URL parser turns 2130706433 and 0x7f.1 into
   127.0.0.1, which is then caught as a literal), IPv6; localhost and
   *.localhost; *.workers.dev (including this very Worker: a loop); .local,
   .internal, .invalid; names with a single label; the wildcard-DNS services,
   whose names resolve to whatever address is written in them (127.0.0.1.nip.io
   is loopback, 169-254-169-254.sslip.io is the metadata service); a trailing-dot
   spelling of any of the above; and, like the database, a name with an
   underscore, an empty or hyphen-edged label, a trailing dot, a non-ASCII
   character, or an ending that is not 2 to 24 plain letters (a punycode ending
   such as xn--p1ai, a one-letter ending such as example.c).
   ========================================================================== */
export const MAX_WEBHOOK_URL = 500;

const INTERNAL_SUFFIXES = [".local", ".internal", ".invalid"];

/* Domains that answer with the address spelled in the name (and so can point at
   loopback, a private network or a cloud metadata address). A name ends in one
   when it IS that domain or is any subdomain of it. */
export const WILDCARD_DNS = Object.freeze([
  "nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me", "traefik.me", "local.gd", "vcap.me", "lacolhost.com", "1u.ms",
]);

/* The characters no URL may hold anywhere: the same set, by code point, as the database's roster_valid_webhook_url
   (never \s or [[:space:]], whose answer depends on the engine or the locale): the ASCII control characters
   U+0001..U+001F, DEL U+007F, the space U+0020, U+0085, U+00A0, U+1680, the spaces, the zero-width characters and
   the two direction marks U+2000..U+200F, U+2028..U+202F (line and paragraph separators, the bidi embeddings and
   overrides, the narrow no-break space), U+205F, the bidi isolates U+2066..U+2069, U+3000 and the byte order mark
   U+FEFF. */
const REFUSED = "\\u0001-\\u001f\\u007f \\u0085\\u00a0\\u1680\\u2000-\\u200f\\u2028-\\u202f\\u205f\\u2066-\\u2069\\u3000\\ufeff";
const HAS_REFUSED = new RegExp(`[${REFUSED}]`);

/* The database's patterns (roster_valid_webhook_url), the same text, case-insensitive like its ~*. */
const SHAPE = new RegExp(`^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,24}(:443)?([/?#][^${REFUSED}]*)?$`, "i");
const INTERNAL = /^https:\/\/([^/?#]*\.)?(workers\.dev|local|localhost|internal|invalid)(:[0-9]+)?([/?#]|$)/i;
const WILDCARD = new RegExp(`^https://([^/?#]*\\.)?(${WILDCARD_DNS.map((d) => d.replace(/\./g, "\\.")).join("|")})(:[0-9]+)?([/?#]|$)`, "i");

const fail = (reason) => ({ ok: false, reason });

/* -> { ok: true, url: <normalised href> } | { ok: false, reason: <short code> } */
export function validateWebhookUrl(input) {
  if (typeof input !== "string" || input.length === 0) return fail("empty");
  /* the database counts characters, not UTF-16 units */
  if (input.length > MAX_WEBHOOK_URL && Array.from(input).length > MAX_WEBHOOK_URL) return fail("too_long");
  /* whitespace, control, invisible and direction-changing characters (L9): exactly the database's set, above */
  if (HAS_REFUSED.test(input)) return fail("whitespace");

  let u;
  try {
    u = new URL(input);
  } catch {
    return fail("unparseable");
  }
  if (u.protocol !== "https:") return fail("not_https");
  if (u.username || u.password) return fail("credentials");
  let host = u.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return fail("no_host");
  if (host.includes(":") || host.startsWith("[")) return fail("ip_literal");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return fail("ip_literal");
  /* a name whose last label is a number is never a public hostname */
  if (/^\d+$/.test(host.slice(host.lastIndexOf(".") + 1))) return fail("ip_literal");
  if (host === "localhost" || host.endsWith(".localhost")) return fail("localhost");
  if (host === "workers.dev" || host.endsWith(".workers.dev")) return fail("workers_dev");
  if (!host.includes(".")) return fail("single_label");
  if (INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return fail("internal_host");
  if (WILDCARD_DNS.some((d) => host === d || host.endsWith(`.${d}`))) return fail("wildcard_dns");
  if (!/^[a-z0-9._-]+$/.test(host)) return fail("bad_host");
  /* the parser drops a default port: an explicit :443 and no port at all both read "" */
  if (u.port !== "") return fail("bad_port");

  /* the last gate: exactly what the database holds the saved URL to, on the text as it was typed */
  if (!SHAPE.test(input)) return fail("bad_host");
  if (INTERNAL.test(input)) return fail("internal_host");
  if (WILDCARD.test(input)) return fail("wildcard_dns");

  u.hash = "";
  return { ok: true, url: u.href };
}
