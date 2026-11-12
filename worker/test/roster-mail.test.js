import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVars, composeMail, deliverMails, fromAddressOf, fromHeader, idempotencyKey, normalizeEmail, planMails, replyToOf, safeHttpUrl,
  senderName, sendViaResend, whatsappLink,
} from "../src/roster/mail.js";
import { checkMailLimits, createMailTally, MAIL_LIMITS } from "../src/roster/limits.js";
import { FOOTER_MARK } from "../src/roster/mail-defaults.js";
import { htmlToText } from "../src/roster/render.js";
import { normalizeWork } from "../src/roster/work.js";
import { fakeNet } from "./roster-helpers.js";

const MEETING = { id: "m1", date: "2027-01-20", time: "20:00", name: "מפגש ערב", city: "חיפה", place: "הסטודיו" };
const PERSON = { id: "11111111-1111-4111-8111-111111111111", first_name: "דנה", last_name: "לוי", phone: "+972501234567", email: "Dana@Example.com" };

/* a canonical work item; `over` replaces whole top-level parts */
function work(over = {}) {
  return normalizeWork({
    event: { id: 9, type: "registration.created", attempts: 0, created_at: "2027-01-10T09:00:00Z",
      payload: { participant: PERSON, meeting: MEETING }, ...over.event },
    business: { id: "b1", slug: "studio", name: "סטודיו דנה", notify_emails: ["owner@example.com"],
      settings: { participant_mail_enabled: true, personal_area_enabled: true, payment_url: "https://pay.example.com/x",
        contact_whatsapp: "050-123-4567", contact_email: "hello@studio.example", sender_name: null, ...over.settings },
      ...over.business },
    participant: "participant" in over ? over.participant : PERSON,
    facts: "facts" in over ? over.facts : { meeting: { future: true, price: 80, free: false, directions: "קומה 2" }, has_payment: false, fully_paid: false, confirmation_sent: false },
    templates: over.templates || {},
    mail_counters: "mail_counters" in over ? over.mail_counters : { recipients: {}, business_day: 0 },
  });
}

const planned = (w) => planMails(w).plan.map((p) => `${p.template}>${p.audience}`);
const skippedReasons = (w) => Object.fromEntries(planMails(w).skipped.map((s) => [s.template, s.reason]));

/* --- who gets which mail ------------------------------------------------------------ */

test("participant.created -> admin_signup to the notify list; payment.reported -> admin_payment_reported", () => {
  assert.deepEqual(planned(work({ event: { type: "participant.created" } })), ["admin_signup>admin"]);
  assert.deepEqual(planned(work({ event: { type: "payment.reported" } })), ["admin_payment_reported>admin"]);
});

test("the notify list is cleaned: invalid dropped, lower-cased, de-duplicated, capped", () => {
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: ["A@x.com", "a@x.com", "not-an-email", "", 5, "b@y.org", " c@z.io "] } });
  assert.deepEqual(planMails(w).plan[0].to, ["a@x.com", "b@y.org", "c@z.io"]);

  const many = Array.from({ length: 50 }, (_, i) => `u${i}@x.com`);
  assert.equal(planMails(work({ event: { type: "participant.created" }, business: { notify_emails: many } })).plan[0].to.length, 20);

  const none = work({ event: { type: "participant.created" }, business: { notify_emails: ["nope"] } });
  assert.deepEqual(planMails(none).plan, []);
  assert.deepEqual(skippedReasons(none), { admin_signup: "no_recipients" });
});

test("registered: needs an email, a future meeting, no payment yet, not free, a price", () => {
  assert.deepEqual(planned(work()), ["registered>participant"]);
  assert.equal(planMails(work()).plan[0].to, "dana@example.com");

  const facts = (m, rest = {}) => ({ meeting: { future: true, price: 80, free: false, ...m }, has_payment: false, ...rest });
  assert.deepEqual(skippedReasons(work({ facts: facts({ future: false }) })), { registered: "meeting_not_future" });
  assert.deepEqual(skippedReasons(work({ facts: facts({}, { has_payment: true }) })), { registered: "payment_exists" });
  assert.deepEqual(skippedReasons(work({ facts: facts({ free: true }) })), { registered: "free" });
  assert.deepEqual(skippedReasons(work({ facts: facts({ price: 0 }) })), { registered: "no_price" });
  assert.deepEqual(skippedReasons(work({ participant: { ...PERSON, email: null }, event: { payload: { participant: { ...PERSON, email: null }, meeting: MEETING } } })), { registered: "no_email" });
  assert.deepEqual(skippedReasons(work({ facts: {} })), { registered: "meeting_not_future" });
  assert.deepEqual(skippedReasons(work({ facts: { meeting: { future: true, price: 80 } } })), { registered: "facts_missing" });
  assert.deepEqual(planned(work({ facts: facts({ price: null }) })), ["registered>participant"], "an unknown price does not block it");
});

test("participant_mail_enabled = false stops every participant mail and no admin mail", () => {
  const off = { participant_mail_enabled: false };
  assert.deepEqual(planned(work({ settings: off })), []);
  assert.deepEqual(skippedReasons(work({ settings: off })), { registered: "participant_mail_off" });
  assert.deepEqual(planned(work({ settings: off, event: { type: "participant.created" } })), ["admin_signup>admin"]);
});

test("payment.recorded: payment_confirmed only when fully paid and not yet confirmed; refund for refunds; nothing for deposits", () => {
  const pay = (kind) => ({ type: "payment.recorded", payload: { participant: PERSON, meeting: MEETING, payment: { id: "p", kind, amount: 80, method: "bit", meeting_id: "m1" } } });
  const facts = (f) => ({ meeting: { future: true }, has_payment: true, fully_paid: false, confirmation_sent: false, ...f });

  assert.deepEqual(planned(work({ event: pay("payment"), facts: facts({ fully_paid: true }) })), ["payment_confirmed>participant"]);
  assert.deepEqual(skippedReasons(work({ event: pay("payment"), facts: facts({ fully_paid: false }) })), { payment_confirmed: "not_fully_paid" });
  assert.deepEqual(skippedReasons(work({ event: pay("payment"), facts: facts({ fully_paid: true, confirmation_sent: true }) })), { payment_confirmed: "already_confirmed" });
  assert.deepEqual(skippedReasons(work({ event: pay("payment"), facts: {} })), { payment_confirmed: "facts_missing" });

  assert.deepEqual(planned(work({ event: pay("refund"), facts: facts({}) })), ["refund>participant"]);
  assert.deepEqual(planned(work({ event: pay("deposit"), facts: facts({ fully_paid: true }) })), []);
  assert.deepEqual(planMails(work({ event: pay("deposit") })).skipped, []);
});

test("registration.cancelled: only for a future meeting", () => {
  const ev = { type: "registration.cancelled" };
  assert.deepEqual(planned(work({ event: ev })), ["registration_cancelled>participant"]);
  assert.deepEqual(skippedReasons(work({ event: ev, facts: { meeting: { future: false } } })), { registration_cancelled: "meeting_not_future" });
});

test("a participant mail without an address: recorded as failed (no_address) except for `registered`, which says 'when it has an email'", () => {
  const noMail = { ...PERSON, email: "" };
  const ev = (type) => ({ type, payload: { participant: noMail, meeting: MEETING, payment: { kind: "refund", amount: 5 } } });
  const plan = planMails(work({ event: ev("registration.cancelled"), participant: noMail })).plan;
  assert.deepEqual(plan, [{ template: "registration_cancelled", audience: "participant", to: "", noAddress: true }]);
  assert.deepEqual(planMails(work({ event: ev("payment.recorded"), participant: noMail })).plan[0].noAddress, true);
});

test("a participant the business's own people added by hand (event.source admin) is not news to them: no admin_signup", () => {
  const ev = (source) => ({ type: "participant.created", ...(source === undefined ? {} : { source }) });
  assert.deepEqual(planned(work({ event: ev("admin") })), []);
  assert.deepEqual(skippedReasons(work({ event: ev("admin") })), { admin_signup: "added_by_admin" });
  for (const source of ["api", "me", "system", null, undefined]) assert.deepEqual(planned(work({ event: ev(source) })), ["admin_signup>admin"], String(source));
  assert.equal(work({ event: ev("admin") }).event.source, "admin");
  assert.equal(work({ event: ev(undefined) }).event.source, null);
});

test("mails the database already holds for the event are not made again, the missing ones are", async () => {
  const net = fakeNet();
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: ["a@x.com", "b@y.org"] } });
  w.mailsLogged = [{ template: "admin_signup", to: "a@x.com", status: "sent" }];
  const { mails, skipped } = await deliverMails(w, depsFor(net));
  assert.deepEqual(mails.map((m) => m.to), ["b@y.org"]);
  assert.deepEqual(skipped, [{ template: "admin_signup", reason: "already_logged" }]);
  assert.deepEqual(net.resend().map((c) => c.json.to), [["b@y.org"]]);
  /* a failed row counts as logged too (it was reported, the admin sees it; it is not made twice) */
  const w2 = work({ event: { type: "participant.created" }, business: { notify_emails: ["a@x.com"] } });
  w2.mailsLogged = [{ template: "admin_signup", to: "A@X.com", status: "failed" }];
  assert.deepEqual((await deliverMails(w2, depsFor(net))).mails, []);
  /* the no-address row is logged with an empty address */
  const noMail = { ...PERSON, email: null };
  const w3 = work({ event: { type: "registration.cancelled", payload: { participant: noMail, meeting: MEETING } }, participant: noMail });
  w3.mailsLogged = [{ template: "registration_cancelled", to: "", status: "failed" }];
  assert.deepEqual((await deliverMails(w3, depsFor(net))).mails, []);
});

test("normalizeWork reads mails_logged (or says null when the database did not give it)", () => {
  const base = { event: { id: 1, type: "ping" }, business: { slug: "s", name: "n", settings: {} } };
  assert.equal(normalizeWork(base).mailsLogged, null);
  assert.deepEqual(normalizeWork({ ...base, mails_logged: [{ template: "registered", to: " Dana@Example.com ", status: "sent" }, "junk", null] }).mailsLogged, [{ template: "registered", to: "dana@example.com", status: "sent" }]);
  assert.deepEqual(normalizeWork({ ...base, mails_logged: [] }).mailsLogged, []);
});

test("ping and unknown events cause no mail", () => {
  assert.deepEqual(planMails(work({ event: { type: "ping" } })), { plan: [], skipped: [] });
  assert.deepEqual(planMails(work({ event: { type: "something.else" } })), { plan: [], skipped: [] });
});

/* --- variables ---------------------------------------------------------------------------- */

test("buildVars: names, Hebrew date, links, and directions only in payment_confirmed", () => {
  const v = buildVars(work(), "registered");
  assert.equal(v.business_name, "סטודיו דנה");
  assert.equal(v.first_name, "דנה");
  assert.equal(v.full_name, "דנה לוי");
  assert.equal(v.meeting_name, "מפגש ערב");
  assert.equal(v.meeting_date, "יום רביעי, 20.1");
  assert.equal(v.meeting_time, "20:00");
  assert.equal(v.price, "80");
  assert.equal(v.my_link, "https://floa.co.il/roster/me/?biz=studio");
  assert.equal(v.pay_link, "https://pay.example.com/x");
  assert.equal(v.whatsapp_link, "https://wa.me/972501234567");
  assert.equal(v.admin_link, `https://floa.co.il/roster/admin/?biz=studio&p=${PERSON.id}`);
  assert.equal(v.directions, "");
  assert.equal(buildVars(work(), "payment_confirmed").directions, "קומה 2");
});

test("buildVars: a link that is not configured is empty, never invented", () => {
  const v = buildVars(work({ settings: { personal_area_enabled: false, payment_url: null, contact_whatsapp: null } }), "registered");
  assert.equal(v.my_link, "");
  assert.equal(v.pay_link, "");
  assert.equal(v.whatsapp_link, "");
});

test("a payment URL that is not plain http(s) never becomes a link", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "https://u:p@pay.example.com/", "ftp://x.example/", "//x.example", "not a url", "https://x.example/ a", ""]) {
    assert.equal(safeHttpUrl(bad), "", bad);
    assert.equal(buildVars(work({ settings: { payment_url: bad || null } }), "registered").pay_link, "", bad);
  }
  assert.equal(safeHttpUrl("https://pay.example.com/a?b=c d"), "", "whitespace is refused outright");
  assert.equal(safeHttpUrl("http://pay.example.com/a"), "http://pay.example.com/a");
});

test("whatsappLink: the ways a number is typed, and nothing else", () => {
  assert.equal(whatsappLink("050-123-4567"), "https://wa.me/972501234567");
  assert.equal(whatsappLink("0501234567"), "https://wa.me/972501234567");
  assert.equal(whatsappLink("+972 50 123 4567"), "https://wa.me/972501234567");
  assert.equal(whatsappLink("972501234567"), "https://wa.me/972501234567");
  assert.equal(whatsappLink("00972501234567"), "https://wa.me/972501234567");
  for (const bad of ["", "abc", "123", null, undefined, 5, "1".repeat(20)]) assert.equal(whatsappLink(bad), "", String(bad));
});

test("the slug in a link is encoded, the participant id only if it is a uuid", () => {
  const v = buildVars(work({ business: { slug: "a&b c" }, participant: { ...PERSON, id: "x\"><script>" } }), "registered");
  assert.equal(v.my_link, "https://floa.co.il/roster/me/?biz=a%26b%20c");
  assert.equal(v.admin_link, "https://floa.co.il/roster/admin/?biz=a%26b%20c");
});

test("buildVars: amount and method, with labels people read", () => {
  const ev = (payment) => ({ type: "payment.recorded", payload: { participant: PERSON, meeting: MEETING, payment } });
  assert.equal(buildVars(work({ event: ev({ amount: 120, method: "bit" }) }), "refund").amount, "120");
  assert.equal(buildVars(work({ event: ev({ amount: 120, method: "bit" }) }), "refund").method, "ביט");
  assert.equal(buildVars(work({ event: ev({ amount: 12.5, method: "bank" }) }), "refund").method, "העברה בנקאית");
  assert.equal(buildVars(work({ event: ev({ amount: 1, method: "other" }) }), "refund").method, "");
  assert.equal(buildVars(work({ event: ev({ amount: 1, method: "Venmo\nBcc: x" }) }), "refund").method, "Venmo Bcc: x");
  /* with no payment in the event, the reported amount falls back to the price, but only for that one template */
  const reported = work({ event: { type: "payment.reported", payload: { participant: PERSON, meeting: MEETING } } });
  assert.equal(buildVars(reported, "admin_payment_reported").amount, "80");
  assert.equal(buildVars(reported, "refund").amount, "");
});

test("buildVars: strings are single-line and bounded, control characters removed", () => {
  const v = buildVars(work({ participant: { ...PERSON, first_name: "דנה\r\nSubject: x\u0000", last_name: "ל".repeat(500) } }), "registered");
  assert.equal(v.first_name, "דנה Subject: x");
  assert.equal(v.last_name.length, 80);
});

/* --- the sender ----------------------------------------------------------------------------- */

test("From: the business's sender name, else its name, on the verified address", () => {
  assert.equal(fromHeader(work().business), "סטודיו דנה <no-reply@floa.co.il>");
  assert.equal(fromHeader(work({ settings: { sender_name: "דנה מהסטודיו" } }).business), "דנה מהסטודיו <no-reply@floa.co.il>");
  assert.equal(fromHeader(work({ business: { name: "" } }).business), "FLOA <no-reply@floa.co.il>");
});

test("the sender name cannot add an address, a header or a line break", () => {
  const hostile = 'Evil" <evil@attacker.example>\r\nBcc: x@y.z, "a"; (c) [d] \\ @';
  const name = senderName(work({ settings: { sender_name: hostile } }).business);
  assert.ok(!/["<>\[\]()\\,;:@\r\n]/.test(name), name);
  assert.equal(fromHeader(work({ settings: { sender_name: hostile } }).business).split("<").length, 2, "exactly one address");
  assert.ok(fromHeader(work({ settings: { sender_name: hostile } }).business).endsWith("<no-reply@floa.co.il>"));
  assert.equal(senderName(work({ settings: { sender_name: "\u202eevil" } }).business), "evil", "bidi controls are removed");
  assert.equal(Array.from(senderName(work({ settings: { sender_name: "x".repeat(200) } }).business)).length, 60);
  assert.equal(senderName(work({ settings: { sender_name: "<>@" } }).business), "FLOA");
});

test("From address: the business's own when it set one (lowercased), the platform's when it did not", () => {
  assert.equal(fromAddressOf(work().business), "no-reply@floa.co.il", "null or missing: the old default");
  assert.equal(fromAddressOf(work({ settings: { mail_from_address: null } }).business), "no-reply@floa.co.il");
  assert.equal(fromAddressOf(work({ settings: { mail_from_address: "No-Reply@Notify.Harpatka.co.il" } }).business), "no-reply@notify.harpatka.co.il");
  assert.equal(fromHeader(work({ settings: { sender_name: "יוצאים להרפתקה", mail_from_address: "no-reply@notify.harpatka.co.il" } }).business), "יוצאים להרפתקה <no-reply@notify.harpatka.co.il>");
});

test("a From address that is not a plain address never reaches the header", () => {
  for (const bad of ["evil@x.com>, Bcc: a@b.c", "a@b.com\r\nBcc: x@y.z", "<a@b.com>", "Name <a@b.com>", "a b@c.com", "nobody", "", "a@b", "x".repeat(130) + "@a.com"]) {
    const h = fromHeader(work({ settings: { mail_from_address: bad } }).business);
    assert.equal(h, "סטודיו דנה <no-reply@floa.co.il>", JSON.stringify(bad));
  }
});

test("the mail that goes out to Resend carries the business's From address", async () => {
  const net = fakeNet();
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: ["a@x.com"] }, settings: { sender_name: "יוצאים להרפתקה", mail_from_address: "no-reply@notify.harpatka.co.il" } });
  await deliverMails(w, depsFor(net));
  assert.deepEqual(net.resend().map((c) => c.json.from), ["יוצאים להרפתקה <no-reply@notify.harpatka.co.il>"]);
  const net2 = fakeNet();
  await deliverMails(work({ event: { type: "participant.created" }, business: { notify_emails: ["a@x.com"] } }), depsFor(net2));
  assert.deepEqual(net2.resend().map((c) => c.json.from), ["סטודיו דנה <no-reply@floa.co.il>"]);
});

test("the work item parser keeps the From address as text or null", () => {
  assert.equal(work({ settings: { mail_from_address: "a@b.co" } }).business.settings.mail_from_address, "a@b.co");
  assert.equal(work().business.settings.mail_from_address, null);
  assert.equal(work({ settings: { mail_from_address: 5 } }).business.settings.mail_from_address, null);
});

test("Reply-To is the contact email when it is a real address, otherwise absent", () => {
  assert.equal(replyToOf(work().business), "hello@studio.example");
  assert.equal(replyToOf(work({ settings: { contact_email: null } }).business), null);
  assert.equal(replyToOf(work({ settings: { contact_email: "nope" } }).business), null);
  assert.equal(replyToOf(work({ settings: { contact_email: "a@b.co\r\nBcc: x@y.z" } }).business), null);
  assert.equal(normalizeEmail("  Dana@Example.COM "), "dana@example.com");
  for (const bad of [null, 5, "", "a", "a@b", "a@@b.co", "a b@c.co", "a@b.c o", "<a@b.co>", `${"a".repeat(250)}@b.co`]) assert.equal(normalizeEmail(bad), null, String(bad));
});

/* --- the mail itself --------------------------------------------------------------------------- */

test("composeMail: a business override is used, the rest falls back to the default", () => {
  const w = work({ templates: {
    registered: { subject: "Hello {{first_name}}", html: "<p>custom {{meeting_name}} {{{place}}}</p>" },
    refund: { subject: "", html: "" },
  } });
  const vars = buildVars(w, "registered");
  const mail = composeMail(w, "registered", vars);
  assert.equal(mail.subject, "Hello דנה");
  assert.ok(mail.html.includes("custom מפגש ערב הסטודיו"));
  assert.ok(mail.html.includes('dir="rtl"'), "a fragment is wrapped into an RTL document");

  const refund = composeMail(w, "refund", buildVars(w, "refund"));
  assert.ok(refund.subject.startsWith("החזר כספי"), "an empty override is no override");

  const partial = work({ templates: { registered: { subject: "", html: "<p>only html</p>" } } });
  const p = composeMail(partial, "registered", buildVars(partial, "registered"));
  assert.ok(p.subject.startsWith("שמרת מקום למפגש"), "the subject falls back on its own");
  assert.ok(p.html.includes("only html"));
});

test("composeMail: the footer line is guaranteed on every participant mail, even if the template drops it", () => {
  const w = work({ templates: { registered: { subject: "s", html: "<html><body><p>no footer here</p></body></html>" } } });
  const mail = composeMail(w, "registered", buildVars(w, "registered"));
  assert.ok(htmlToText(mail.html).includes(FOOTER_MARK));
  assert.ok(mail.html.indexOf(FOOTER_MARK) < mail.html.lastIndexOf("</body>"), "inside the body");
  assert.ok(mail.html.includes("סטודיו דנה"));
  assert.ok(mail.text.trim().endsWith("אפשר להתעלם מההודעה."));

  /* a default is not given the line twice */
  const normal = composeMail(work(), "registered", buildVars(work(), "registered"));
  assert.equal(normal.html.split(FOOTER_MARK).length - 1, 1);

  /* an admin mail never gets it */
  const admin = work({ event: { type: "participant.created" }, templates: { admin_signup: { subject: "s", html: "<p>x</p>" } } });
  assert.ok(!composeMail(admin, "admin_signup", buildVars(admin, "admin_signup")).html.includes(FOOTER_MARK));
});

test("composeMail: hostile participant data is escaped in the HTML and plain in the text", () => {
  const evil = '<script>alert(1)</script>"><img src=x onerror=alert(1)>';
  const w = work({ participant: { ...PERSON, first_name: evil, last_name: "" } });
  const mail = composeMail(w, "registered", buildVars(w, "registered"));
  assert.ok(!mail.html.includes("<script"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.text.length > 0);
  /* even a template that asks for it raw does not get it */
  const raw = work({ participant: { ...PERSON, first_name: evil }, templates: { registered: { subject: "s", html: "<p>{{{first_name}}}</p>" } } });
  assert.ok(!composeMail(raw, "registered", buildVars(raw, "registered")).html.includes("<script"));
});

test("composeMail: a subject is one clean line", () => {
  const w = work({ participant: { ...PERSON, first_name: "דנה\nBcc: evil@x.y" }, templates: { registered: { subject: "Hi {{first_name}}", html: "<p>x</p>" } } });
  const { subject } = composeMail(w, "registered", buildVars(w, "registered"));
  assert.ok(!/[\r\n]/.test(subject));
  assert.equal(subject, "Hi דנה Bcc: evil@x.y");
});

const quietly = (fn) => {
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try { return [fn(), logged]; } finally { console.error = orig; }
};

test("a template over 20,000 characters is not rendered: the built-in default is sent and the refusal is logged by key, not by content", () => {
  const body = `<p>${"x".repeat(250_000)}</p>`;
  const w = work({ templates: { registered: { subject: "my subject", html: body } } });
  const [mail, logged] = quietly(() => composeMail(w, "registered", buildVars(w, "registered")));
  assert.ok(mail.html.includes("שמרת מקום למפגש:") && !mail.html.includes("xxxxxxxx"), "the default was sent");
  assert.equal(mail.subject, "my subject", "the subject, which was fine, is still the business's");
  assert.deepEqual(logged, ["roster: template_rejected studio registered too_long"]);

  const head = "<p>{{first_name}}</p>";
  const edge = (n) => work({ templates: { registered: { subject: "s", html: head + "x".repeat(n - head.length) } } });
  const [ok20k] = quietly(() => composeMail(edge(20_000), "registered", buildVars(edge(20_000), "registered")));
  assert.ok(ok20k.html.includes("xxxxxxxx"), "exactly 20,000 characters is allowed");
  const [over, log2] = quietly(() => composeMail(edge(20_001), "registered", buildVars(edge(20_001), "registered")));
  assert.ok(!over.html.includes("xxxxxxxx") && log2.length === 1, "20,001 is not");
});

test("more than 50 data-if is refused (50 is fine), and a subject over 300 characters falls back to the default subject", () => {
  const tpl = (k) => ({ registered: { subject: "s", html: `<p>hello</p>${'<p data-if="first_name">a</p>'.repeat(k)}` } });
  const w50 = work({ templates: tpl(50) });
  const [m50, l50] = quietly(() => composeMail(w50, "registered", buildVars(w50, "registered")));
  assert.ok(m50.html.includes("hello") && l50.length === 0);
  const w51 = work({ templates: tpl(51) });
  const [m51, l51] = quietly(() => composeMail(w51, "registered", buildVars(w51, "registered")));
  assert.ok(!m51.html.includes("hello") && m51.html.includes("שמרת מקום למפגש:"));
  assert.deepEqual(l51, ["roster: template_rejected studio registered too_many_data_if"]);
  const wl = work({ templates: { registered: { subject: "y".repeat(301), html: "<p>fine</p>" } } });
  const [ml, ll] = quietly(() => composeMail(wl, "registered", buildVars(wl, "registered")));
  assert.ok(ml.subject.startsWith("שמרת מקום למפגש") && ml.html.includes("fine"));
  assert.deepEqual(ll, ["roster: template_rejected studio registered subject_too_long"]);
});

test("H2: a 100 KB poison template is refused at once, one under the length cap but over the data-if cap too, and the worst one that is allowed renders in a few milliseconds", () => {
  const poison = '<p data-if="a" '.repeat(Math.ceil(100_000 / 15));
  const w = work({ templates: { admin_signup: { subject: "s", html: poison } }, event: { type: "participant.created" } });
  let t0 = performance.now();
  const [mail] = quietly(() => composeMail(w, "admin_signup", buildVars(w, "admin_signup")));
  assert.ok(performance.now() - t0 < 100, "over the cap: not even scanned");
  assert.ok(mail.html.includes("הרשמה חדשה"));
  const under = '<p data-if="a" '.repeat(1300);   /* 19,500 characters: under the length cap, 1300 data-if: over the count cap */
  const w2 = work({ templates: { admin_signup: { subject: "s", html: under } }, event: { type: "participant.created" } });
  t0 = performance.now();
  quietly(() => composeMail(w2, "admin_signup", buildVars(w2, "admin_signup")));
  assert.ok(performance.now() - t0 < 100);
  /* a template with exactly the allowed 50 elements of the nastiest shape (open tags, no closing '>') */
  const nasty = work({ templates: { admin_signup: { subject: "s", html: `${'<p data-if="a" <a x '.repeat(50)}${"z".repeat(19_000)}` } }, event: { type: "participant.created" } });
  t0 = performance.now();
  quietly(() => composeMail(nasty, "admin_signup", buildVars(nasty, "admin_signup")));
  assert.ok(performance.now() - t0 < 100);
});

test("the same template is rendered once for all recipients of an event", () => {
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: Array.from({ length: 20 }, (_, i) => `n${i}@x.com`) }, templates: { admin_signup: { subject: "s", html: "<p>{{first_name}}</p>" } } });
  const net = fakeNet();
  return deliverMails(w, depsFor(net)).then(({ mails }) => {
    assert.equal(mails.length, 20);
    assert.equal(new Set(mails.map((m) => m.html)).size, 1);
  });
});

test("the plain-text alternative has no tags and keeps the links", () => {
  const w = work();
  const mail = composeMail(w, "registered", buildVars(w, "registered"));
  assert.ok(!/<[a-z]/i.test(mail.text));
  assert.ok(mail.text.includes("https://pay.example.com/x"));
  assert.ok(mail.text.includes("מפגש ערב"));
});

test("no mail text produced by the defaults contains an em or en dash", () => {
  for (const [type, template] of [["registration.created", "registered"], ["participant.created", "admin_signup"], ["registration.cancelled", "registration_cancelled"]]) {
    const w = work({ event: { type } });
    const m = composeMail(w, template, buildVars(w, template));
    assert.ok(!/[\u2013\u2014]/.test(m.subject + m.html + m.text), template);
  }
});

/* --- Resend --------------------------------------------------------------------------------------- */

test("idempotencyKey: event + template + recipient, stable, and a different mail is a different key", async () => {
  const a = await idempotencyKey("9", "registered", "dana@example.com");
  assert.equal(a, await idempotencyKey("9", "registered", "DANA@example.com"));
  assert.notEqual(a, await idempotencyKey("10", "registered", "dana@example.com"));
  assert.notEqual(a, await idempotencyKey("9", "refund", "dana@example.com"));
  assert.notEqual(a, await idempotencyKey("9", "registered", "other@example.com"));
  assert.match(a, /^9:registered:[0-9a-f]{32}$/);
  assert.ok(!a.includes("dana"), "the address is not in the key");
  assert.ok(a.length <= 256);
});

test("sendViaResend: the request, and success", async () => {
  const net = fakeNet({ resend: () => ({ body: { id: "m" } }) });
  const r = await sendViaResend({ apiKey: "re_k", payload: { to: ["a@b.co"] }, key: "9:registered:abc" }, { fetch: net.fetch });
  assert.deepEqual(r, { status: "sent", error: null });
  const [c] = net.resend();
  assert.equal(c.url, "https://api.resend.com/emails");
  assert.equal(c.method, "POST");
  assert.equal(c.headers.authorization, "Bearer re_k");
  assert.equal(c.headers["idempotency-key"], "9:registered:abc");
  assert.equal(c.headers["content-type"], "application/json");
});

test("sendViaResend: 5xx and 429 are retried once with the same key, other 4xx are final, errors are codes", async () => {
  const run = async (statuses) => {
    let i = 0;
    const net = fakeNet({ resend: () => ({ status: statuses[Math.min(i++, statuses.length - 1)], body: { name: "validation_error", message: "secret detail: dana@example.com" } }) });
    const r = await sendViaResend({ apiKey: "k", payload: {}, key: "K" }, { fetch: net.fetch, sleep: async () => {} });
    return { r, calls: net.resend() };
  };

  let { r, calls } = await run([500, 200]);
  assert.equal(r.status, "sent");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers["idempotency-key"], calls[1].headers["idempotency-key"]);

  ({ r, calls } = await run([429, 429]));
  assert.deepEqual(r, { status: "failed", error: "resend_429:validation_error" });
  assert.equal(calls.length, 2);

  ({ r, calls } = await run([422]));
  assert.deepEqual(r, { status: "failed", error: "resend_422:validation_error" });
  assert.equal(calls.length, 1, "a 422 will not get better");
  assert.ok(!JSON.stringify(r).includes("dana@example.com"), "the provider's message is never kept");

  ({ r, calls } = await run([401]));
  assert.equal(r.error, "resend_401:validation_error");
  assert.equal(calls.length, 1);
});

test("sendViaResend: a network error and a timeout are retried once, then reported as codes", async () => {
  let n = 0;
  const boom = async () => { n++; throw new TypeError("connect ECONNRESET 1.2.3.4"); };
  const r = await sendViaResend({ apiKey: "k", payload: {}, key: "K" }, { fetch: boom, sleep: async () => {} });
  assert.deepEqual(r, { status: "failed", error: "network_error" });
  assert.equal(n, 2);

  const slow = (_u, init) => new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))));
  const t = await sendViaResend({ apiKey: "k", payload: {}, key: "K" }, { fetch: slow, sleep: async () => {}, timeoutMs: 20 });
  assert.deepEqual(t, { status: "failed", error: "timeout" });
});

test("sendViaResend does not start a second attempt when the time budget is nearly gone", async () => {
  let n = 0;
  const net = async () => { n++; return new Response("{}", { status: 503 }); };
  const r = await sendViaResend({ apiKey: "k", payload: {}, key: "K" }, { fetch: net, sleep: async () => {}, now: () => 1000, deadlineAt: 1000 + 3000, timeoutMs: 10_000 });
  assert.equal(r.status, "failed");
  assert.equal(n, 1);
});

/* --- delivery with the limits ---------------------------------------------------------------------- */

const depsFor = (net, over = {}) => ({ fetch: net.fetch, apiKey: "re_k", tally: createMailTally(), sleep: async () => {}, ...over });

test("deliverMails: one separate Resend call per admin recipient, each with its own key and only its own address", async () => {
  const net = fakeNet();
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: ["a@x.com", "b@y.org"] } });
  const { mails } = await deliverMails(w, depsFor(net));
  assert.deepEqual(mails.map((m) => [m.template, m.audience, m.to, m.status, m.error]), [
    ["admin_signup", "admin", "a@x.com", "sent", null],
    ["admin_signup", "admin", "b@y.org", "sent", null],
  ]);
  const calls = net.resend();
  assert.deepEqual(calls.map((c) => c.json.to), [["a@x.com"], ["b@y.org"]]);
  assert.notEqual(calls[0].headers["idempotency-key"], calls[1].headers["idempotency-key"]);
  for (const c of calls) {
    assert.equal(c.json.from, "סטודיו דנה <no-reply@floa.co.il>");
    assert.equal(c.json.reply_to, "hello@studio.example");
    assert.ok(c.json.subject.startsWith("הרשמה חדשה"));
    assert.ok(c.json.html.includes("<html") && c.json.text.length > 0);
  }
  assert.equal(mails[0].html, calls[0].json.html, "what is logged is exactly what was sent");
});

test("deliverMails: a participant mail is sent once, with the right key, and counted", async () => {
  const net = fakeNet();
  const deps = depsFor(net);
  const { mails } = await deliverMails(work(), deps);
  assert.equal(mails.length, 1);
  assert.deepEqual([mails[0].template, mails[0].audience, mails[0].to, mails[0].status], ["registered", "participant", "dana@example.com", "sent"]);
  assert.equal(net.resend()[0].headers["idempotency-key"], await idempotencyKey("9", "registered", "dana@example.com"));
  assert.equal(deps.tally.recipient("dana@example.com"), 1);
  assert.equal(deps.tally.business("b1"), 1);
});

test("limits: at most 3 mails per address per day, counting the database counter and this batch", async () => {
  assert.deepEqual({ ...MAIL_LIMITS }, { perRecipientPerDay: 3, perBusinessPerDay: 200, adminPerRecipientPerDay: 20, adminPerBusinessPerHour: 30, businessAllPerDay: 400 });
  const net = fakeNet();

  const atLimit = work({ mail_counters: { recipients: { "dana@example.com": 3 }, business_day: 0 } });
  const r1 = (await deliverMails(atLimit, depsFor(net))).mails[0];
  assert.deepEqual([r1.status, r1.error], ["failed", "limit_recipient"]);
  assert.equal(net.resend().length, 0, "nothing was sent");
  assert.ok(r1.subject && r1.html === "", "the subject is kept so the admin can see which mail it was; the html is not (nothing went out, and the log must not fill with copies)");

  const two = work({ mail_counters: { recipients: { "dana@example.com": 2 }, business_day: 0 } });
  assert.equal((await deliverMails(two, depsFor(net))).mails[0].status, "sent");

  /* one batch, the same address, the database said zero: the third is sent, the fourth is not */
  const tallyDeps = depsFor(fakeNet());
  const outcomes = [];
  for (let i = 0; i < 4; i++) outcomes.push((await deliverMails(work(), tallyDeps)).mails[0].error);
  assert.deepEqual(outcomes, [null, null, null, "limit_recipient"]);
});

test("limits: at most 200 participant mails per business per day", async () => {
  const net = fakeNet();
  const full = work({ mail_counters: { recipients: {}, business_day: 200 } });
  assert.equal((await deliverMails(full, depsFor(net))).mails[0].error, "limit_business");
  assert.equal(net.resend().length, 0);
  const almost = work({ mail_counters: { recipients: {}, business_day: 199 } });
  const deps = depsFor(net);
  assert.equal((await deliverMails(almost, deps)).mails[0].status, "sent");
  assert.equal((await deliverMails(almost, deps)).mails[0].error, "limit_business", "this batch's own mail counts");
});

test("the participant counters do not limit the business's own notifications, which have their own caps", async () => {
  const net = fakeNet();
  const w = work({ event: { type: "participant.created" }, mail_counters: { recipients: { "owner@example.com": 99 }, business_day: 150 } });
  assert.equal((await deliverMails(w, depsFor(net))).mails[0].status, "sent");
});

test("admin mails: 20 per address per day, 30 per business per hour, with their own error codes", async () => {
  const ev = { type: "participant.created" };
  const net = fakeNet();
  const perAddr = work({ event: ev, mail_counters: { recipients: {}, business_day: 0, admin_recipients: { "owner@example.com": 20 }, admin_hour: 0, business_day_all: 0 } });
  let r = (await deliverMails(perAddr, depsFor(net))).mails[0];
  assert.deepEqual([r.status, r.error], ["failed", "limit_admin_recipient"]);
  const justUnder = work({ event: ev, mail_counters: { recipients: {}, business_day: 0, admin_recipients: { "owner@example.com": 19 }, admin_hour: 29, business_day_all: 0 } });
  assert.equal((await deliverMails(justUnder, depsFor(net))).mails[0].status, "sent");
  const perHour = work({ event: ev, mail_counters: { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 30, business_day_all: 0 } });
  r = (await deliverMails(perHour, depsFor(net))).mails[0];
  assert.deepEqual([r.status, r.error], ["failed", "limit_admin_hour"]);
  assert.equal(net.resend().length, 1, "only the one under both limits was sent");
  assert.ok(r.subject && r.html === "", "a held-back mail keeps its subject and not its html");
});

test("every mail: 400 per business per day, whoever it is for", async () => {
  const net = fakeNet();
  for (const [ev, expect] of [[{ type: "participant.created" }, "limit_business_day"], [{}, "limit_business_day"]]) {
    const w = work({ event: ev, mail_counters: { recipients: {}, business_day: 10, admin_recipients: {}, admin_hour: 1, business_day_all: 400 } });
    assert.equal((await deliverMails(w, depsFor(net))).mails[0].error, expect);
  }
  assert.equal(net.resend().length, 0);
  const ok = work({ mail_counters: { recipients: {}, business_day: 10, business_day_all: 399 } });
  assert.equal((await deliverMails(ok, depsFor(net))).mails[0].status, "sent");
  /* a database that does not give business_day_all yet: the participant and admin counters stand in for it */
  const old = work({ mail_counters: { recipients: {}, business_day: 400 } });
  assert.equal((await deliverMails(old, depsFor(net))).mails[0].error, "limit_business", "the narrower cap answers first");
});

test("missing counters fail closed for every mail, participant or admin; a single missing field counts as zero", async () => {
  const net = fakeNet();
  const r = (await deliverMails(work({ mail_counters: null }), depsFor(net))).mails[0];
  assert.deepEqual([r.status, r.error], ["failed", "counters_missing"]);
  const admin = (await deliverMails(work({ event: { type: "participant.created" }, mail_counters: null }), depsFor(net))).mails[0];
  assert.deepEqual([admin.status, admin.error], ["failed", "counters_missing"]);
  assert.equal(net.resend().length, 0);
  const partial = work({ event: { type: "participant.created" }, mail_counters: { recipients: {}, business_day: 0 } });
  assert.equal((await deliverMails(partial, depsFor(net))).mails[0].status, "sent");
});

test("E4: eight parallel mails to one address under a limit of 3 send three (the place is taken BEFORE the send)", async () => {
  const net = fakeNet({ resend: async () => { await new Promise((r) => setTimeout(r, 15)); return { body: { id: "x" } }; } });
  const deps = depsFor(net);
  const results = await Promise.all(Array.from({ length: 8 }, () => deliverMails(work(), deps)));
  const mails = results.flatMap((x) => x.mails);
  assert.equal(mails.length, 8);
  assert.equal(mails.filter((m) => m.status === "sent").length, 3);
  assert.equal(mails.filter((m) => m.error === "limit_recipient").length, 5);
  assert.equal(net.resend().length, 3, "three requests reached Resend, not eight");
});

test("the same race for admin mails: 40 parallel notifications against 30 per hour send thirty", async () => {
  const net = fakeNet({ resend: async () => { await new Promise((r) => setTimeout(r, 5)); return { body: { id: "x" } }; } });
  const deps = depsFor(net);
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: Array.from({ length: 20 }, (_, i) => `n${i}@x.com`) } });
  const results = await Promise.all([1, 2].map(() => deliverMails(w, deps)));
  const mails = results.flatMap((x) => x.mails);
  assert.equal(mails.length, 40);
  assert.equal(mails.filter((m) => m.status === "sent").length, 30);
  assert.equal(mails.filter((m) => m.error === "limit_admin_hour").length, 10);
  assert.equal(net.resend().length, 30);
});

test("a reserved place is given back when the mail certainly did not go, and kept when it may have", async () => {
  const run = async (behaviour) => {
    const net = fakeNet({ resend: behaviour });
    const deps = depsFor(net);
    const first = (await deliverMails(work(), deps)).mails[0];
    return [first, deps.tally.recipient("dana@example.com")];
  };
  let [m, held] = await run(() => ({ status: 422, body: { name: "validation_error" } }));
  assert.deepEqual([m.status, m.error, held], ["failed", "resend_422:validation_error", 0]);
  [m, held] = await run(() => ({ status: 503, body: {} }));
  assert.deepEqual([m.error, held], ["resend_503", 0]);
  [m, held] = await run(() => { throw new TypeError("connection reset"); });
  assert.deepEqual([m.error, held], ["network_error", 1], "it may have reached Resend: the place stays taken");
  [m, held] = await run(() => ({ status: 200, body: { id: "x" } }));
  assert.deepEqual([m.status, held], ["sent", 1]);
  /* and a limit refusal, or no address, never took a place */
  const net = fakeNet();
  const deps = depsFor(net);
  const over = work({ mail_counters: { recipients: { "dana@example.com": 3 }, business_day: 0 } });
  assert.equal((await deliverMails(over, deps)).mails[0].error, "limit_recipient");
  assert.equal(deps.tally.recipient("dana@example.com"), 0);
  assert.equal(deps.tally.all("b1"), 0);
});

test("the caps hold across one outbox batch with many events for the same business and address", async () => {
  const net = fakeNet();
  const deps = depsFor(net);
  const zero = { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 0, business_day_all: 0 };
  const events = Array.from({ length: 25 }, (_, i) => work({ event: { id: 100 + i, type: "participant.created" }, mail_counters: zero }));
  const all = (await Promise.all(events.map((w) => deliverMails(w, deps)))).flatMap((x) => x.mails);
  assert.equal(all.filter((m) => m.status === "sent").length, 20, "one notify address: 20 per day, however many events");
  assert.equal(all.filter((m) => m.error === "limit_admin_recipient").length, 5);
  assert.equal(net.resend().length, 20);
});

test("the three tallies are separate: participant mails, admin mails, and the total", async () => {
  const net = fakeNet();
  const deps = depsFor(net);
  const w = work({ event: { type: "participant.created" } });
  await deliverMails(w, deps);
  assert.equal(deps.tally.recipient("owner@example.com", "admin"), 1);
  assert.equal(deps.tally.recipient("owner@example.com", "participant"), 0);
  assert.equal(deps.tally.business("b1", "admin"), 1);
  assert.equal(deps.tally.business("b1", "participant"), 0);
  await deliverMails(work(), deps);
  assert.equal(deps.tally.business("b1", "participant"), 1);
  assert.equal(deps.tally.all("b1"), 2);
});

test("checkMailLimits reads hostile counters safely", () => {
  const t = createMailTally();
  const base = { tally: t, businessId: "b", recipient: "a@b.co" };
  assert.equal(checkMailLimits({ ...base, counters: { recipients: { "a@b.co": "2" }, business_day: "x" } }).ok, true);
  assert.equal(checkMailLimits({ ...base, counters: { recipients: { "a@b.co": "3" } } }).error, "limit_recipient");
  assert.equal(checkMailLimits({ ...base, counters: { recipients: null, business_day: -5 } }).ok, true);
  assert.equal(checkMailLimits({ ...base, counters: { recipients: { __proto__: { "a@b.co": 9 } } } }).ok, true);
  assert.equal(checkMailLimits({ ...base, counters: undefined }).error, "counters_missing");
  assert.equal(checkMailLimits({ ...base, counters: "5" }).error, "counters_missing");
  assert.equal(checkMailLimits({ ...base, recipient: "A@B.co", counters: { recipients: { "a@b.co": 3 } } }).error, "limit_recipient", "case does not matter");
});

test("no address: reported as failed with error no_address and to = empty, nothing is sent", async () => {
  const net = fakeNet();
  const noMail = { ...PERSON, email: null };
  const w = work({ event: { type: "registration.cancelled", payload: { participant: noMail, meeting: MEETING } }, participant: noMail });
  const { mails } = await deliverMails(w, depsFor(net));
  assert.deepEqual(mails.map((m) => [m.template, m.to, m.status, m.error]), [["registration_cancelled", "", "failed", "no_address"]]);
  assert.equal(net.resend().length, 0);
});

test("no Resend key: failed with mail_not_configured, nothing is attempted", async () => {
  const net = fakeNet();
  const { mails } = await deliverMails(work(), depsFor(net, { apiKey: "" }));
  assert.deepEqual([mails[0].status, mails[0].error], ["failed", "mail_not_configured"]);
  assert.equal(net.calls.length, 0);
});

test("a mail that fails is reported and does not stop the others", async () => {
  const net = fakeNet({ resend: (p) => (p.to[0] === "bad@x.com" ? { status: 422, body: { name: "validation_error" } } : { body: {} }) });
  const w = work({ event: { type: "participant.created" }, business: { notify_emails: ["bad@x.com", "good@y.org"] } });
  const { mails } = await deliverMails(w, depsFor(net));
  assert.deepEqual(mails.map((m) => [m.to, m.status]), [["bad@x.com", "failed"], ["good@y.org", "sent"]]);
  assert.equal(mails[0].error, "resend_422:validation_error");
});

test("a template override cannot make the Worker throw", async () => {
  const w = work({ templates: { registered: { subject: "{{", html: "{{{ {{ <a href='{{pay_link}}'" } } });
  const { mails } = await deliverMails(w, depsFor(fakeNet()));
  assert.equal(mails[0].status, "sent");
});
