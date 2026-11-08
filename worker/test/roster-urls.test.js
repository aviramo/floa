import test from "node:test";
import assert from "node:assert/strict";
import { validateWebhookUrl } from "../src/roster/urls.js";

const GOOD = [
  "https://hooks.example.com/roster",
  "https://example.co.il/a/b?c=d",
  "https://studio.example.com:443/hook",           /* an explicit default port is the same as none */
  "https://studio.example.com/hook",
  "https://a.b.c.example.org/x",
  "https://xn--9dbq2a.example.com/h",
  "https://example.com",
  /* names the database's own check accepts must be accepted here too, or every delivery to them would fail for ever */
  "https://printer.lan/hook", "https://x.corp/hook", "https://x.home/hook", "https://x.intranet/hook", "https://x.localdomain/hook", "https://x.private/hook", "https://x.home.arpa/hook",
];

const BAD = [
  /* the port must be 443 or absent (L4) */
  ["https://studio.example.com:8443/hook", "bad_port"],
  ["https://example.com:22/h", "bad_port"],
  ["https://example.com:80/h", "bad_port"],
  ["https://example.com:444/h", "bad_port"],
  ["https://example.com:0/h", "bad_port"],
  ["https://example.com:99999/h", "unparseable"],
  /* wildcard DNS: names that resolve to whatever address is written in them (L4) */
  ["https://127.0.0.1.nip.io/h", "wildcard_dns"],
  ["https://169-254-169-254.sslip.io/h", "wildcard_dns"],
  ["https://10.0.0.1.xip.io/h", "wildcard_dns"],
  ["https://localtest.me/h", "wildcard_dns"],
  ["https://app.localtest.me/h", "wildcard_dns"],
  ["https://anything.lvh.me/h", "wildcard_dns"],
  ["https://x.traefik.me/h", "wildcard_dns"],
  ["https://x.local.gd/h", "wildcard_dns"],
  ["https://x.vcap.me/h", "wildcard_dns"],
  ["https://x.lacolhost.com/h", "wildcard_dns"],
  ["https://x.1u.ms/h", "wildcard_dns"],
  ["https://NIP.IO/h", "wildcard_dns"],
  ["https://127.0.0.1.NIP.IO./h", "wildcard_dns"],
  ["https://a.b.c.sslip.io/h", "wildcard_dns"],
  /* the hidden characters of L9 */
  ["https://exam\u202eple.com/h", "whitespace"],
  ["https://example\u200b.com/h", "whitespace"],
  ["https://example.com/\ufeffx", "whitespace"],
  ["http://hooks.example.com/x", "not_https"],
  ["ftp://hooks.example.com/x", "not_https"],
  ["javascript:alert(1)", "not_https"],
  ["//hooks.example.com/x", "unparseable"],
  ["hooks.example.com/x", "unparseable"],
  ["", "empty"],
  ["https://user:pw@hooks.example.com/x", "credentials"],
  ["https://user@hooks.example.com/x", "credentials"],
  ["https://127.0.0.1/x", "ip_literal"],
  ["https://10.0.0.5/x", "ip_literal"],
  ["https://192.168.1.1:8443/x", "ip_literal"],
  ["https://169.254.169.254/latest/meta-data", "ip_literal"],
  ["https://8.8.8.8/x", "ip_literal"],
  ["https://2130706433/x", "ip_literal"],
  ["https://0x7f000001/x", "ip_literal"],
  ["https://0x7f.1/x", "ip_literal"],
  ["https://127.1/x", "ip_literal"],
  ["https://[::1]/x", "ip_literal"],
  ["https://[2001:db8::1]/x", "ip_literal"],
  ["https://[::ffff:127.0.0.1]/x", "ip_literal"],
  ["https://localhost/x", "localhost"],
  ["https://LOCALHOST/x", "localhost"],
  ["https://localhost./x", "localhost"],
  ["https://app.localhost/x", "localhost"],
  ["https://floa-lead.floa-il.workers.dev/roster/v1/signup", "workers_dev"],
  ["https://x.workers.dev/", "workers_dev"],
  ["https://X.WORKERS.DEV/", "workers_dev"],
  ["https://x.workers.dev./", "workers_dev"],
  ["https://workers.dev/", "workers_dev"],
  ["https://intranet/x", "single_label"],
  ["https://printer.local/x", "internal_host"],
  ["https://db.internal/x", "internal_host"],
  ["https://x.invalid/x", "internal_host"],
  ["https://example.com/ x", "whitespace"],
  /* the odd spellings the database's own pattern refuses (checked against the real SQL by the differential run):
     a Worker that accepted them would pass a URL here and then fail the trigger on save */
  ["https://my_app.example.com/h", "bad_host"],
  ["https://exa_mple.com/x", "bad_host"],
  ["https://example.com./x", "bad_host"],
  ["https://sub.xn--p1ai/x", "bad_host"],
  ["https://xn--p1ai/x", "single_label"],
  ["https://example.c/x", "bad_host"],
  ["https://example.c0m/x", "bad_host"],
  ["https://example.abcdefghijklmnopqrstuvwxy/x", "bad_host"],
  ["https://-bad.example.com/x", "bad_host"],
  ["https://bad-.example.com/x", "bad_host"],
  ["https://example..com/x", "bad_host"],
  ["https://.example.com/x", "bad_host"],
  ["https://münchen.example/x", "bad_host"],
  ["https://例え.jp/x", "bad_host"],
  [`https://${"x".repeat(64)}.example.com/x`, "bad_host"],
  ["https://example.com\u3000/x", "whitespace"],
  ["https://example.com/\u2003x", "whitespace"],
  ["https://example.com/\u2028x", "whitespace"],
  ["https://example.com/\u0085x", "whitespace"],
  ["https://example.com/\nx", "whitespace"],
  [" https://example.com/x", "whitespace"],
  [`https://example.com/${"a".repeat(500)}`, "too_long"],
  [null, "empty"],
  [undefined, "empty"],
  [42, "empty"],
  [{}, "empty"],
];

test("good webhook URLs are accepted and normalised", () => {
  for (const url of GOOD) {
    const r = validateWebhookUrl(url);
    assert.equal(r.ok, true, url);
    assert.ok(r.url.startsWith("https://"), url);
  }
});

/* The set the database refuses ANYWHERE in a URL (roster_valid_webhook_url, spelled out by code point, never by locale):
   U+0001..U+001F, U+0020, U+007F, U+0085, U+00A0, U+1680, U+2000..U+200F, U+2028..U+202F, U+205F, U+2066..U+2069,
   U+3000, U+FEFF. This is the same list as section 74 of the database's own test, and the Worker must refuse exactly it. */
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const REFUSED_SET = new Set([...range(1, 0x1f), 0x20, 0x7f, 0x85, 0xa0, 0x1680, ...range(0x2000, 0x200f), ...range(0x2028, 0x202f), 0x205f, ...range(0x2066, 0x2069), 0x3000, 0xfeff]);
const PLACES = {
  path: (c) => "https://example.com/a" + c + "b",
  query: (c) => "https://example.com/a?x=" + c + "y",
  fragment: (c) => "https://example.com/a#" + c + "z",
  "end of the path": (c) => "https://example.com/a" + c,
  "start of the path": (c) => "https://example.com/" + c + "a",
};

test("the characters refused anywhere in a URL are EXACTLY the database's set, over every code point from U+0001 to U+3200 and the astral and high ones", () => {
  const probe = [...range(1, 0x3200), 0x3fff, 0xfdd0, 0xfe00, 0xfefe, 0xfeff, 0xff00, 0xffff, 0x10000, 0x1f600].filter((c) => !(c >= 0xd800 && c < 0xe000));
  const hex = (n) => "U+" + n.toString(16).toUpperCase().padStart(4, "0");
  const wrongPlace = [];
  const refusedNow = [];
  for (const cp of probe) {
    const char = String.fromCodePoint(cp);
    const verdicts = Object.entries(PLACES).map(([name, f]) => [name, validateWebhookUrl(f(char)).ok]);
    const ok = verdicts[0][1];
    if (!ok) refusedNow.push(cp);
    /* the same answer in the path, the query, the fragment, at the end and at the start */
    if (verdicts.some(([, v]) => v !== ok)) wrongPlace.push(hex(cp));
  }
  assert.deepEqual(wrongPlace, [], "the verdict does not depend on where the character sits");
  assert.deepEqual(refusedNow.filter((c) => !REFUSED_SET.has(c)).map(hex), [], "refused but not in the set");
  assert.deepEqual([...REFUSED_SET].filter((c) => !refusedNow.includes(c)).map(hex), [], "in the set but accepted");
  assert.equal(REFUSED_SET.size, 31 + 1 + 1 + 1 + 1 + 1 + 16 + 8 + 1 + 4 + 1 + 1, "the set is the one listed");
});

test("what sits right next to the refused set is still accepted: ordinary text, percent-encoding and neighbouring code points", () => {
  const accept = ["\u2060", "\u0086", "\u00a1", "\u1681", "\u2010", "\u2030", "\u205e", "\u3001", "\ufefe", "\u05e9", "\u00e9", "\u{1F600}", "%20", "%E2%80%AE"];
  for (const c of accept) {
    const r = validateWebhookUrl("https://example.com/a" + c + "b");
    assert.equal(r.ok, true, JSON.stringify(c));
  }
  assert.equal(validateWebhookUrl("https://Example.COM:443/Hook?x=1#f").url, "https://example.com/Hook?x=1");
  assert.equal(validateWebhookUrl("HTTPS://example.com/x").ok, true, "the scheme is case-insensitive, like the database's ~*");
});

test("the three marks that read as text but turn it around or hide it are named: LRM, RLM and the zero-width characters, in the path", () => {
  for (const [name, cp] of [["LRM", 0x200e], ["RLM", 0x200f], ["ZWSP", 0x200b], ["ZWNJ", 0x200c], ["ZWJ", 0x200d], ["RLO", 0x202e], ["LRI", 0x2066], ["BOM", 0xfeff], ["NNBSP", 0x202f], ["NBSP", 0xa0], ["figure space", 0x2007], ["DEL", 0x7f], ["SOH", 0x01]]) {
    const r = validateWebhookUrl("https://example.com/a" + String.fromCodePoint(cp) + "b");
    assert.deepEqual([name, r.ok, r.reason], [name, false, "whitespace"]);
  }
});

test("the length is counted in characters, like the database, not in UTF-16 units", () => {
  const base = "https://example.com/";
  assert.equal(validateWebhookUrl(base + "😀".repeat(400)).ok, true, "400 emoji are 800 UTF-16 units and 420 characters");
  assert.equal(validateWebhookUrl(base + "😀".repeat(481)).reason, "too_long");
});

test("a URL of exactly 500 characters is allowed, 501 is not", () => {
  const base = "https://example.com/";
  assert.equal(validateWebhookUrl(base + "a".repeat(500 - base.length)).ok, true);
  assert.equal(validateWebhookUrl(base + "a".repeat(501 - base.length)).reason, "too_long");
});

test("every bad URL is refused, with the reason", () => {
  for (const [url, reason] of BAD) {
    const r = validateWebhookUrl(url);
    assert.equal(r.ok, false, `${url} should be refused`);
    /* the reason matters less than the refusal, but it should be the intended one */
    assert.equal(r.reason, reason, `${url}: ${r.reason}`);
  }
});

test("names that merely END like a wildcard-DNS domain are not refused (the boundary is a dot)", () => {
  for (const url of ["https://nip.io.example.com/h", "https://notnip.io.example.org/h", "https://mylocaltest.me.example.com/h", "https://x1u.ms.example.com/h", "https://snip.io.example.com/h"]) {
    assert.equal(validateWebhookUrl(url).ok, true, url);
  }
  /* but the refusal is on the host, whatever comes after it */
  assert.equal(validateWebhookUrl("https://127.0.0.1.nip.io/path/with.nip.io").ok, false);
  assert.equal(validateWebhookUrl("https://example.com/127.0.0.1.nip.io").ok, true);
});

test("the fragment is dropped and the host is lower-cased", () => {
  assert.equal(validateWebhookUrl("https://Hooks.Example.COM/a#frag").url, "https://hooks.example.com/a");
});
