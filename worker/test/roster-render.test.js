import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDataIf, esc, formatAmount, formatMeetingDate, formatMeetingTime, htmlToText, render, renderText, UNTRUSTED_VARS,
} from "../src/roster/render.js";
import { DEFAULT_TEMPLATES, FOOTER_MARK, PARTICIPANT_TEMPLATES, TEMPLATE_KEYS } from "../src/roster/mail-defaults.js";

const HOSTILE = `<script>alert("x")</script> & 'q' "d" </td><img src=x onerror=alert(1)>`;

test("{{x}} is escaped, {{{x}}} is raw", () => {
  const vars = { place: "<b>Studio</b> & Co", city: "Tel Aviv" };
  assert.equal(render("[{{place}}]", vars), "[&lt;b&gt;Studio&lt;/b&gt; &amp; Co]");
  assert.equal(render("[{{{place}}}]", vars), "[<b>Studio</b> & Co]");
  assert.equal(render("{{ city }} and {{{ city }}}", vars), "Tel Aviv and Tel Aviv");
});

test("esc covers the five characters that matter", () => {
  assert.equal(esc(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(5), "5");
});

test("a hostile value is escaped in every position that {{ }} is allowed", () => {
  const vars = { first_name: HOSTILE, meeting_name: HOSTILE };
  const out = render(`<p>{{first_name}}</p><a title="{{meeting_name}}">x</a>`, vars);
  assert.ok(!out.includes("<script"), out);
  assert.ok(!out.includes("<img"), out);
  assert.ok(!/onerror=alert\(1\)>/.test(out) || out.includes("&lt;img"), out);
  assert.ok(out.includes("&lt;script&gt;"));
  assert.ok(out.includes("&quot;"), "a quote cannot close the attribute");
  assert.equal((out.match(/<a /g) || []).length, 1);
});

test("triple braces are NOT raw for values that came from a participant or a caller", () => {
  for (const name of UNTRUSTED_VARS) {
    const out = render(`{{{${name}}}}`, { [name]: "<i>x</i>" });
    assert.equal(out, "&lt;i&gt;x&lt;/i&gt;", name);
  }
  assert.ok(UNTRUSTED_VARS.has("first_name") && UNTRUSTED_VARS.has("phone") && UNTRUSTED_VARS.has("email"));
});

test("rendering is a single pass: a placeholder inside a value stays text", () => {
  const out = render("{{first_name}} / {{{place}}}", { first_name: "{{admin_link}}", place: "{{{first_name}}}", admin_link: "https://x/y" });
  assert.equal(out, "{{admin_link}} / {{{first_name}}}");
});

test("unknown variables and prototype names render as nothing", () => {
  assert.equal(render("[{{nope}}][{{__proto__}}][{{constructor}}][{{toString}}]", {}), "[][][][]");
  assert.equal(render("[{{a}}]", { a: null }), "[]");
  assert.equal(render("[{{a}}]", { a: 0 }), "[0]");
  assert.equal(render("{{ not closed", {}), "{{ not closed");
});

test("data-if drops an element whose variable is empty and keeps (cleanly) one that is not", () => {
  const html = '<p>a</p><p data-if="pay_link" style="x">pay <a href="{{pay_link}}">here</a></p><table><tr data-if="city"><td>c</td></tr></table>';
  assert.equal(applyDataIf(html, { pay_link: "", city: "" }), "<p>a</p><table></table>");
  assert.equal(applyDataIf(html, { pay_link: "  ", city: "" }), "<p>a</p><table></table>", "whitespace only is empty");
  assert.equal(
    applyDataIf(html, { pay_link: "https://p", city: "x" }),
    '<p>a</p><p style="x">pay <a href="{{pay_link}}">here</a></p><table><tr><td>c</td></tr></table>',
  );
  assert.equal(render('<p data-if="a">{{a}}</p>', { a: "" }), "");
  assert.equal(render('<p data-if="a">{{a}}</p>', { a: "v" }), "<p>v</p>");
});

test("renderText (subjects): not escaped, one line, bounded", () => {
  assert.equal(renderText("Hi {{first_name}}", { first_name: "A & <B>" }), "Hi A & <B>");
  assert.equal(renderText("S: {{x}}", { x: "line1\r\nBcc: evil@example.com\nline3" }), "S: line1 Bcc: evil@example.com line3");
  assert.equal(renderText("{{x}}", { x: "a\u0000b\u2028c" }), "a b c");
  assert.equal(renderText("{{x}}", { x: "x".repeat(500) }).length, 200);
  assert.equal(renderText("  {{x}}  ", { x: "" }), "");
});

test("htmlToText: tags gone, entities decoded, links keep their address, blocks become lines", () => {
  const text = htmlToText('<html><head><title>T</title><style>p{}</style></head><body><h1>Title</h1><p>one &amp; two &lt;3 &#39;q&#39;</p><table><tr><td>Label</td><td>Value</td></tr></table><p>See <a href="https://x.example/p?a=1&amp;b=2">here</a>.<br>Next</p><a href="javascript:alert(1)">bad</a> <a href="https://same.example">https://same.example</a></body></html>');
  assert.equal(text, "Title\n\none & two <3 'q'\n\nLabel Value\n\nSee here (https://x.example/p?a=1&b=2).\nNext\n\nbad https://same.example");
});

test("htmlToText does not decode twice", () => {
  assert.equal(htmlToText("<p>&amp;lt;b&amp;gt;</p>"), "&lt;b&gt;");
});

test("Hebrew date: weekday and d.m, from a calendar date", () => {
  assert.equal(formatMeetingDate("2026-11-05"), "יום חמישי, 5.11");
  assert.equal(formatMeetingDate("2026-11-08"), "יום ראשון, 8.11");
  assert.equal(formatMeetingDate("2026-11-07"), "שבת, 7.11");
  assert.equal(formatMeetingDate("2027-01-01"), "יום שישי, 1.1");
  assert.equal(formatMeetingDate("2028-02-29"), "יום שלישי, 29.2");
  for (const bad of ["", null, undefined, "2026-13-01", "2026-02-30", "2027-02-29", "5.11", "2026-11-5", 20261105]) {
    assert.equal(formatMeetingDate(bad), "", String(bad));
  }
});

test("time and amount formatting", () => {
  assert.equal(formatMeetingTime("20:30"), "20:30");
  assert.equal(formatMeetingTime("20:30:00"), "20:30");
  assert.equal(formatMeetingTime("25:00"), "");
  assert.equal(formatMeetingTime(null), "");
  assert.equal(formatAmount(120), "120");
  assert.equal(formatAmount(12.5), "12.5");
  assert.equal(formatAmount("80.00"), "80");
  assert.equal(formatAmount(0), "0");
  for (const bad of [null, undefined, "", "abc", NaN, Infinity, {}, []]) assert.equal(formatAmount(bad), "", String(bad));
});

/* --- the built-in templates --------------------------------------------------------- */

const SAMPLE = {
  business_name: "סטודיו דנה", first_name: "דנה", last_name: "לוי", full_name: "דנה לוי", phone: "050-1234567", email: "dana@example.com",
  age: "34", gender: "אישה", meeting_name: "מפגש חמישי", meeting_date: "יום חמישי, 5.11", meeting_time: "20:00", place: "הסטודיו", city: "תל אביב",
  price: "80", amount: "80", method: "ביט", directions: "קומה 2\nדלת ימין", my_link: "https://floa.co.il/roster/me/?biz=studio",
  pay_link: "https://pay.example.com/x?a=1&b=2", whatsapp_link: "https://wa.me/972501234567", admin_link: "https://floa.co.il/roster/admin/?biz=studio&p=1",
  account_email: "someone@gmail.com", account_name: "מישהו",
};

test("registered and registration_cancelled say \"saving a place\", the way harpatka does, in the second person singular", () => {
  const registered = DEFAULT_TEMPLATES.registered;
  assert.equal(registered.subject, "שמרת מקום למפגש, נשאר לשלם");
  const rText = htmlToText(render(registered.html, SAMPLE));
  assert.ok(rText.includes("שמרת מקום למפגש:\n"), "the header line, with its colon, then the meeting");
  assert.ok(rText.indexOf("שמרת מקום למפגש:") < rText.indexOf("מפגש ערב") || rText.indexOf("שמרת מקום למפגש:") < rText.indexOf("תאריך"), "it leads into the meeting details");
  assert.ok(rText.includes("המקום שלך שמור. נשאר להסדיר את התשלום."));
  assert.ok(rText.includes("אפשר גם לראות את המקום ששמרת ולשלם באזור האישי:"));

  const cancelled = DEFAULT_TEMPLATES.registration_cancelled;
  assert.equal(cancelled.subject, "שמירת המקום שלך למפגש בוטלה");
  const cText = htmlToText(render(cancelled.html, SAMPLE));
  assert.ok(cText.includes("שמירת המקום שלך למפגש הזה בוטלה:\n"));
  assert.ok(cText.includes("אם זו טעות, או כדי לשמור מקום שוב, אפשר לפנות אלינו."));
  assert.ok(cText.includes("אפשר גם לשמור מקום מחדש באזור האישי:"));

  /* the old wording is gone from both (the footer line, about the sign-up FORM, is a different thing and stays) */
  for (const t of [registered.subject + registered.html, cancelled.subject + cancelled.html]) {
    assert.ok(!/ההרשמה (נקלטה|בוטלה)|להירשם|נרשמת|את ההרשמה/.test(t), "no 'הרשמה' left in the wording of the place itself");
  }
  assert.ok(registered.html.includes("הוזנה בטופס ההרשמה") && cancelled.html.includes("הוזנה בטופס ההרשמה"), "the footer still says why the address is used");
  assert.ok(!/\{\{meeting_name\}\}/.test(registered.subject + cancelled.subject), "the subjects name no variable now");
});

test("the eight templates exist and the participant ones are marked", () => {
  assert.deepEqual([...TEMPLATE_KEYS].sort(), ["admin_account_linked", "admin_payment_reported", "admin_phone_conflict", "admin_signup", "payment_confirmed", "refund", "registered", "registration_cancelled"]);
  assert.deepEqual([...PARTICIPANT_TEMPLATES].sort(), ["payment_confirmed", "refund", "registered", "registration_cancelled"]);
  for (const key of TEMPLATE_KEYS) {
    assert.ok(DEFAULT_TEMPLATES[key].subject.length > 0);
    assert.ok(DEFAULT_TEMPLATES[key].html.length > 200);
  }
});

test("no default template has an em dash or an en dash, anywhere", () => {
  for (const key of TEMPLATE_KEYS) {
    const { subject, html } = DEFAULT_TEMPLATES[key];
    assert.ok(!/[\u2013\u2014]/.test(subject + html), key);
  }
});

test("the defaults are RTL Hebrew, with no external images and no scripts", () => {
  for (const key of TEMPLATE_KEYS) {
    const { html } = DEFAULT_TEMPLATES[key];
    assert.ok(html.includes('dir="rtl"') && html.includes('lang="he"'), key);
    assert.ok(!/<img\b/i.test(html), `${key} has an image`);
    assert.ok(!/<script\b/i.test(html), `${key} has a script`);
    assert.ok(!/src\s*=/i.test(html), `${key} loads something`);
    assert.ok(html.includes("{{business_name}}"), `${key} brands itself with the business name`);
    assert.ok(/[א-ת]/.test(html));
  }
});

test("every participant default carries the footer line, the admin ones do not", () => {
  for (const key of TEMPLATE_KEYS) {
    const has = DEFAULT_TEMPLATES[key].html.includes(FOOTER_MARK);
    assert.equal(has, PARTICIPANT_TEMPLATES.has(key), key);
  }
});

test("each default renders completely: no placeholder or data-if is left over", () => {
  for (const key of TEMPLATE_KEYS) {
    const html = render(DEFAULT_TEMPLATES[key].html, SAMPLE);
    assert.ok(!/\{\{/.test(html), `${key}: ${html.match(/\{\{[^}]*\}\}/)}`);
    assert.ok(!html.includes("data-if"), key);
    const subject = renderText(DEFAULT_TEMPLATES[key].subject, SAMPLE);
    assert.ok(subject.length > 0 && !subject.includes("{{"), key);
    assert.ok(htmlToText(html).includes("סטודיו דנה"), key);
  }
});

test("each default renders without its optional links, and nothing broken is left behind", () => {
  const bare = { ...SAMPLE, my_link: "", pay_link: "", whatsapp_link: "", admin_link: "", directions: "", phone: "", email: "", age: "", gender: "", method: "", amount: "", price: "", first_name: "" };
  for (const key of TEMPLATE_KEYS) {
    const html = render(DEFAULT_TEMPLATES[key].html, bare);
    assert.ok(!/href=""/.test(html), `${key} left an empty link`);
    assert.ok(!/שלום ,/.test(html), `${key} greets nobody`);
    assert.ok(!html.includes("data-if"), key);
  }
});

test("the payment link reaches the page escaped, and the directions keep their line breaks", () => {
  const html = render(DEFAULT_TEMPLATES.registered.html, SAMPLE);
  assert.ok(html.includes('href="https://pay.example.com/x?a=1&amp;b=2"'));
  const confirmed = render(DEFAULT_TEMPLATES.payment_confirmed.html, SAMPLE);
  assert.ok(confirmed.includes("קומה 2\nדלת ימין"));
  assert.ok(confirmed.includes("white-space:pre-line"));
});

test("a hostile participant name cannot break out of any default", () => {
  for (const key of TEMPLATE_KEYS) {
    const html = render(DEFAULT_TEMPLATES[key].html, { ...SAMPLE, first_name: HOSTILE, last_name: HOSTILE, full_name: HOSTILE, email: HOSTILE, phone: HOSTILE });
    assert.ok(!html.includes("<script"), key);
    assert.ok(!html.includes("<img"), key);
  }
});
