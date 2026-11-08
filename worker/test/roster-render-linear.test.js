/* H2: a mail template is written by a business member and rendered in the one Worker every business shares, so
   rendering it must take time in proportion to its size, whatever it contains. The first versions of applyDataIf and
   htmlToText were regular expressions that backtracked (13 KB of '<p data-if="a" ' took 9 seconds, 54 KB a minute and a
   half). These tests keep them from ever coming back, and check the scanners that replaced them against the old
   expressions on everything the product really sends. */
import test from "node:test";
import assert from "node:assert/strict";
import { applyDataIf, htmlToText, render, renderText, MAX_OPEN_TAG } from "../src/roster/render.js";
import { stripHidden } from "../src/roster/text.js";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS } from "../src/roster/mail-defaults.js";

/* --- the old implementations, kept here ONLY as a reference to compare against (never run on hostile input) --- */

const present = (v) => v !== "" && v.trim() !== "";
const valueOf = (vars, name) => (Object.hasOwn(vars, name.toLowerCase()) ? String(vars[name.toLowerCase()] ?? "") : "");
const LEGACY_DATA_IF = /<(p|tr|li|a|span)(\s[^>]*?)?\sdata-if="([a-z_][a-z0-9_]*)"([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const legacyApplyDataIf = (html, vars) => html.replace(LEGACY_DATA_IF, (_m, tag, before, name, after, inner) =>
  (present(valueOf(vars, name)) ? `<${tag}${before || ""}${after}>${inner}</${tag}>` : ""));

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " };
const decode = (s) => s.replace(/&(?:#(\d{1,6})|#x([0-9a-f]{1,5})|(amp|lt|gt|quot|nbsp));/gi, (_m, dec, hex, named) => {
  if (named) return ENTITIES[named.toLowerCase()];
  const code = dec ? Number(dec) : Number.parseInt(hex, 16);
  return code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
});
function legacyHtmlToText(html) {
  let s = String(html ?? "");
  s = s.replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<a\b[^>]*?\shref\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, href, inner) => {
    const label = decode(inner.replace(/<[^>]*>/g, "")).trim();
    const url = decode(href).trim();
    if (!/^(https?:|mailto:|tel:)/i.test(url)) return label;
    return label && label !== url ? `${label} (${url})` : url;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/tr\s*>\s*/gi, "\n").replace(/<\/(?:p|div|h[1-6]|li|table)\s*>/gi, "\n\n")
    .replace(/<\/t[dh]\s*>/gi, " ").replace(/<[^>]*>/g, "");
  s = decode(s);
  return s.replace(/[ \t\u00a0]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const FULL = { business_name: "סטודיו", first_name: "דנה", last_name: "לוי", full_name: "דנה לוי", phone: "+972501234567", email: "d@x.com", age: "34", gender: "אישה", meeting_name: "ערב", meeting_date: "יום ה, 5.11", meeting_time: "20:00", place: "הסטודיו", city: "חיפה", price: "80", amount: "80", method: "ביט", directions: "קומה 2\nדלת ימין", my_link: "https://floa.co.il/roster/me/?biz=s", pay_link: "https://pay.example.com/x?a=1&b=2", whatsapp_link: "https://wa.me/972501234567", admin_link: "https://floa.co.il/roster/admin/?biz=s&p=1", account_email: "a@gmail.com", account_name: "אבי" };
const EMPTY = Object.fromEntries(Object.keys(FULL).map((k) => [k, ""]));
const MIXED = { ...FULL, pay_link: "", whatsapp_link: "", directions: "", phone: "", account_name: "" };

test("on every default template and every mix of variables, applyDataIf gives what the old expression gave", () => {
  for (const key of TEMPLATE_KEYS) {
    for (const [label, vars] of [["full", FULL], ["empty", EMPTY], ["mixed", MIXED]]) {
      assert.equal(applyDataIf(DEFAULT_TEMPLATES[key].html, vars), legacyApplyDataIf(DEFAULT_TEMPLATES[key].html, vars), `${key} (${label})`);
    }
  }
});

test("... and htmlToText gives what the old expressions gave, on the rendered defaults and on hand-made HTML", () => {
  for (const key of TEMPLATE_KEYS) {
    for (const vars of [FULL, EMPTY, MIXED]) {
      const html = render(DEFAULT_TEMPLATES[key].html, vars);
      assert.equal(htmlToText(html), legacyHtmlToText(html), key);
    }
  }
  const samples = [
    "",
    "plain text",
    "a &amp; b &lt;3 &#39;q&#39; &quot;x&quot; &#x41; &nbsp;z",
    "<p>one</p><p>two</p>three",
    "<h1>T</h1><p>x</p><table><tr><td>A</td><td>B</td></tr>\n  <tr><td>C</td><td>D</td></tr></table>tail",
    "line<br>break<br/>again<br />more<br class=\"x\">kept",
    "<a href=\"https://x.example/p?a=1&amp;b=2\">label</a> and <a href=\"mailto:a@b.co\">mail</a> and <a href=\"tel:+972501234567\">call</a>",
    "<a href=\"javascript:alert(1)\">bad</a> <a href=\"https://same.example\">https://same.example</a> <a href=\"\">empty</a> <a>none</a>",
    "<a class=\"c\" href=\"https://x.example/\"><b>bold</b> <i>label</i></a>",
    "<head><title>T</title><style>p{color:red}</style></head><body>visible<script>alert(1)</script> more</body>",
    "<style>unclosed text",
    "<title>x</title>after",
    "a < b and c > d",
    "<P>Upper</P><DIV>div</DIV><LI>item</LI>",
    "<p>\n  spaced  \n  out  \n</p>\n\n\n\n<p>x</p>",
    "<td>cell</td><th>head</th>end",
    "<a href=\"https://x.example/\">first</a><a href=\"https://y.example/\">second</a>",
    "text with a lone < and no more",
    "<p>unclosed <b>bold",
  ];
  for (const sample of samples) assert.equal(htmlToText(sample), legacyHtmlToText(sample), JSON.stringify(sample));
});

test("applyDataIf on hand-made templates: every element it handles, and what it leaves alone", () => {
  const v = { yes: "x", no: "", blank: "   ", n: "3" };
  const cases = [
    ['<p data-if="yes">kept</p>', "<p>kept</p>"],
    ['<p data-if="no">gone</p>', ""],
    ['<p data-if="blank">gone</p>', ""],
    ['<p data-if="missing">gone</p>', ""],
    ['a<p data-if="no">x</p>b<p data-if="yes">y</p>c', "ab<p>y</p>c"],
    ['<P DATA-IF="yes" class="c">kept</P>', "<P class=\"c\">kept</P>"],
    ['<p class="a" data-if="yes" id="b">kept</p>', '<p class="a" id="b">kept</p>'],
    ['<tr data-if="no"><td>x</td></tr><tr data-if="yes"><td>y</td></tr>', "<tr><td>y</td></tr>"],
    ['<li data-if="yes">i</li><a data-if="no" href="x">l</a><span data-if="yes">s</span>', "<li>i</li><span>s</span>"],
    ['<p data-if="yes">a</P >', "<p>a</p>"],
    ['<p\n data-if="yes"\n>multi</p>', "<p\n\n>multi</p>"],
    /* not elements it handles */
    ['<pre data-if="no">stays</pre>', '<pre data-if="no">stays</pre>'],
    ['<article data-if="no">stays</article>', '<article data-if="no">stays</article>'],
    ['<div data-if="no">stays</div>', '<div data-if="no">stays</div>'],
    ["<p data-if='no'>stays</p>", "<p data-if='no'>stays</p>"],
    ['<p data-if=no>stays</p>', '<p data-if=no>stays</p>'],
    ['<p data-if="9bad">stays</p>', '<p data-if="9bad">stays</p>'],
    ['<p data-if="no">no closing tag', '<p data-if="no">no closing tag'],
    ['<p data-if="no">a</pre>b</p>', ""],
    ['<p data-if="no">a</p', '<p data-if="no">a</p'],
    /* the inside of a kept element is not read again (the old expression was global and non-overlapping) */
    ['<p data-if="yes"><span data-if="no">in</span></p>', '<p><span data-if="no">in</span></p>'],
    ['<p data-if="no">x<span data-if="yes">in</span>y</p>z', "z"],
  ];
  for (const [input, want] of cases) {
    assert.equal(applyDataIf(input, v), want, input);
    assert.equal(applyDataIf(input, v), legacyApplyDataIf(input, v), `(and the old expression agrees) ${input}`);
  }
});

test("applyDataIf: an opening tag longer than the cap is not read as a tag (the one deliberate difference)", () => {
  const long = `<p ${"a=\"b\" ".repeat(60)}data-if="no">x</p>`;
  assert.ok(long.indexOf(">") > MAX_OPEN_TAG);
  assert.equal(applyDataIf(long, { no: "" }), long);
  const short = `<p ${"a=\"b\" ".repeat(20)}data-if="no">x</p>`;
  assert.ok(short.indexOf(">") < MAX_OPEN_TAG);
  assert.equal(applyDataIf(short, { no: "" }), "");
});

test("applyDataIf keeps text with letters whose lower case is longer (the scanner indexes the original)", () => {
  const html = '<p>\u0130\u0130\u0130</p><p data-if="no">gone</p><p data-if="yes">kept \u0130</p>';
  assert.equal(applyDataIf(html, { no: "", yes: "x" }), "<p>\u0130\u0130\u0130</p><p>kept \u0130</p>");
});

/* --- the poison ------------------------------------------------------------------------ */

const fill = (unit, length) => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
const KB100 = 100_000;
const best = (fn) => {
  let b = Infinity;
  for (let i = 0; i < 3; i++) { const t0 = performance.now(); fn(); b = Math.min(b, performance.now() - t0); }
  return b;
};

const DATA_IF_POISON = {
  "open tags with no '>' ever (reviewer E)": '<p data-if="a" <p data-if="a" <p data-if="a" ',
  "a bare '<p ' (reviewer A)": "<p ",
  "an attribute, no data-if (reviewer C)": "<a x",
  "opening tags that are never closed (reviewer B/F)": '<p data-if="a">z',
  "an almost-closing tag": '<p data-if="a"></p',
  "nested spans, no closes": '<span data-if="a">',
  "closing tags with long whitespace": '<p data-if="a">x</p      ',
  "one tag, thousands of data-if attributes (reviewer D)": null,
  "list items and rows": '<li data-if="a"><tr data-if="a">',
  "only the closing tags": "</p></a></li></span></tr>",
  "'<' and nothing else": "<",
  "'>' and nothing else": ">",
};

test("H2: every poison shape at 100 KB goes through applyDataIf and render in well under 100 ms", () => {
  for (const [name, unit] of Object.entries(DATA_IF_POISON)) {
    const input = unit === null ? `<p${' data-if="a"'.repeat(8400)}` : fill(unit, KB100);
    assert.ok(input.length >= 99_000);
    const ms = best(() => applyDataIf(input, { a: "" }));
    const ms2 = best(() => render(input, { a: "", first_name: "x" }));
    assert.ok(ms < 100, `applyDataIf, ${name}: ${ms.toFixed(1)} ms`);
    assert.ok(ms2 < 100, `render, ${name}: ${ms2.toFixed(1)} ms`);
  }
});

const TEXT_POISON = {
  "'<a ' and no '>' (60 KB of it took 4.9 s)": "<a ",
  "links that are never closed": '<a href="x">',
  "links nested in links": '<a href="x">y<a href="x">',
  "styles that are never closed": "<style>",
  "heads, scripts, titles never closed": "<head ><script ><title >",
  "'<' only": "<",
  "'</tr> ' with whitespace after": "</tr>    ",
  "entities": "&amp;&lt;&#x41;&#12345;&",
  "block closers": "</p></div></h1></li></table></td></th>",
  "br": "<br><br/><br />",
};

test("H2: every poison shape at 100 KB goes through htmlToText in well under 100 ms", () => {
  for (const [name, unit] of Object.entries(TEXT_POISON)) {
    const input = fill(unit, KB100);
    const ms = best(() => htmlToText(input));
    assert.ok(ms < 100, `htmlToText, ${name}: ${ms.toFixed(1)} ms`);
  }
});

test("H2: the cost grows with the size, not with its square or cube (4x the input costs far less than 16x)", () => {
  for (const [label, run, unit] of [
    ["applyDataIf", (s) => applyDataIf(s, { a: "" }), '<p data-if="a" <p data-if="a" <p data-if="a" '],
    ["applyDataIf (never closed)", (s) => applyDataIf(s, { a: "" }), '<p data-if="a">z'],
    ["htmlToText", (s) => htmlToText(s), "<a "],
    ["htmlToText (styles)", (s) => htmlToText(s), "<style>"],
  ]) {
    const small = best(() => run(fill(unit, 25_000)));
    const large = best(() => run(fill(unit, 100_000)));
    /* a floor under the small time, so a clock tick cannot make the ratio meaningless */
    assert.ok(large < Math.max(small, 0.5) * 12, `${label}: 25 KB ${small.toFixed(2)} ms, 100 KB ${large.toFixed(2)} ms`);
  }
});

test("poison does not change what it contains: unresolved tags come out as they went in", () => {
  const poison = fill('<p data-if="a" ', 20_000);
  assert.equal(applyDataIf(poison, { a: "" }), poison);
  assert.equal(htmlToText(fill("<a ", 3000)), fill("<a ", 3000).trim());
});

test("one template of the nastiest allowed shape, and a thousand elements that DO resolve, both stay linear", () => {
  const many = '<p data-if="a">x</p>'.repeat(5000);
  assert.equal(many.length, 100_000);
  assert.ok(best(() => applyDataIf(many, { a: "" })) < 100);
  assert.equal(applyDataIf(many, { a: "" }), "");
  assert.equal(applyDataIf(many, { a: "1" }), '<p>x</p>'.repeat(5000));
  const text = '<p>word</p>'.repeat(9000);
  assert.ok(best(() => htmlToText(text)) < 100);
});

test("renderText takes hidden and bidi characters out of a subject", () => {
  assert.equal(renderText("a{{x}}b", { x: "\u202eevil\u200b\ufeff" }), "aevilb");
  assert.equal(stripHidden("x\u2066y\u2069"), "xy");
});
