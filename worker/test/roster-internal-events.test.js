/* participant.linked and participant.phone_conflict (addendum 2, decision 5): two events the personal area makes when a
   Google account is linked to an EXISTING participant by the phone number typed, or refused because another account holds
   that number. Internal: they go to the business's notify list in a mail (templates admin_account_linked and
   admin_phone_conflict) and nowhere else, never to a participant and never to a customer's webhook. */
import test from "node:test";
import assert from "node:assert/strict";
import { buildVars, composeMail, deliverMails, planMails } from "../src/roster/mail.js";
import { createMailTally } from "../src/roster/limits.js";
import { DEFAULT_TEMPLATES, PARTICIPANT_TEMPLATES, TEMPLATE_KEYS } from "../src/roster/mail-defaults.js";
import { htmlToText, render } from "../src/roster/render.js";
import { processOutbox } from "../src/roster/outbox.js";
import { normalizeWork } from "../src/roster/work.js";
import { webhookWanted, runWebhook } from "../src/roster/webhook.js";
import { fakeNet, makeEnv } from "./roster-helpers.js";

const PERSON = { id: "11111111-1111-4111-8111-111111111111", first_name: "דנה", last_name: "לוי", phone: "+972501234567", email: "dana@example.com" };
const ACCOUNT = { email: "someone@gmail.com", name: "Some One" };

function work(type, over = {}) {
  const payloadKey = over.payloadKey || "account";
  return normalizeWork({
    event: { id: over.id || 31, type, attempts: 0, source: "me", created_at: "2027-01-10T09:00:00Z", payload: { participant: PERSON, [payloadKey]: over.account || ACCOUNT } },
    business: { id: "b1", slug: "studio", name: "סטודיו דנה", notify_emails: over.notify || ["owner@studio.example", "manager@studio.example"],
      settings: { webhook_url: over.webhook === undefined ? "https://hooks.example.com/roster" : over.webhook, webhook_secret: "whsec_t", webhook_events: null, participant_mail_enabled: over.participantMail !== false, personal_area_enabled: true, contact_email: null, sender_name: null, contact_whatsapp: null, payment_url: null } },
    participant: PERSON,
    facts: {},
    templates: over.templates || {},
    mail_counters: over.counters === undefined ? { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 0, business_day_all: 0 } : over.counters,
  });
}
const depsFor = (net) => ({ fetch: net.fetch, apiKey: "re_k", tally: createMailTally(), sleep: async () => {} });

test("the template list is eight, and the two new ones are admin templates (no footer line, no participant counters)", () => {
  assert.equal(TEMPLATE_KEYS.length, 8);
  assert.ok(TEMPLATE_KEYS.includes("admin_account_linked") && TEMPLATE_KEYS.includes("admin_phone_conflict"));
  assert.ok(!PARTICIPANT_TEMPLATES.has("admin_account_linked") && !PARTICIPANT_TEMPLATES.has("admin_phone_conflict"));
  for (const key of ["admin_account_linked", "admin_phone_conflict"]) {
    assert.ok(key.startsWith("admin_"), "the database counts participant mails as templates NOT like admin_%");
    assert.ok(!DEFAULT_TEMPLATES[key].html.includes("הוזנה בטופס ההרשמה"));
  }
});

test("each event is one admin mail to the notify list and nothing else", () => {
  for (const [type, template] of [["participant.linked", "admin_account_linked"], ["participant.phone_conflict", "admin_phone_conflict"]]) {
    const { plan, skipped } = planMails(work(type));
    assert.deepEqual(plan, [{ template, audience: "admin", to: ["owner@studio.example", "manager@studio.example"] }], type);
    assert.deepEqual(skipped, []);
    /* a participant with an address, mail on or off: no participant mail either way */
    assert.deepEqual(planMails(work(type, { participantMail: false })).plan.map((p) => p.audience), ["admin"]);
    /* no notify list, no mail, and the reason is said */
    const none = planMails(work(type, { notify: [] }));
    assert.deepEqual([none.plan, none.skipped], [[], [{ template, reason: "no_recipients" }]]);
  }
});

test("these two events are never sent to a customer's webhook, whatever the filter says", async () => {
  for (const type of ["participant.linked", "participant.phone_conflict"]) {
    for (const events of [null, [], [type], ["participant.created"]]) {
      assert.equal(webhookWanted({ webhook_url: "https://hooks.example.com/x", webhook_events: events }, type), false, `${type} / ${JSON.stringify(events)}`);
    }
    const net = fakeNet();
    assert.equal(await runWebhook(work(type), { fetch: net.fetch }), null);
    assert.equal(net.calls.length, 0);
  }
});

test("the variables: the account's address and name come from `account` (or `google`, the first database version), the person from the participant", () => {
  const v = buildVars(work("participant.linked"), "admin_account_linked");
  assert.deepEqual([v.account_email, v.account_name, v.full_name, v.phone], ["someone@gmail.com", "Some One", "דנה לוי", "+972501234567"]);
  assert.equal(v.admin_link, `https://floa.co.il/roster/admin/?biz=studio&p=${PERSON.id}`);
  const old = buildVars(work("participant.phone_conflict", { payloadKey: "google", account: { email: "g@gmail.com", name: "G" } }), "admin_phone_conflict");
  assert.deepEqual([old.account_email, old.account_name], ["g@gmail.com", "G"]);
  const none = buildVars(work("participant.linked", { account: {} }), "admin_account_linked");
  assert.deepEqual([none.account_email, none.account_name], ["", ""]);
});

test("the mail says who linked which account to which participant, and how to undo it", () => {
  const w = work("participant.linked");
  const mail = composeMail(w, "admin_account_linked", buildVars(w, "admin_account_linked"));
  assert.equal(mail.subject, "חשבון Google חובר למשתתף: דנה לוי");
  const text = htmlToText(mail.html);
  for (const part of ["דנה לוי", "+972501234567", "someone@gmail.com", "Some One", "לנתק את החשבון או לחסום אותו", "לפתיחת הכרטיס"]) assert.ok(text.includes(part), part);
  assert.ok(mail.html.includes(`href="https://floa.co.il/roster/admin/?biz=studio&amp;p=${PERSON.id}"`));
  assert.ok(!text.includes("הוזנה בטופס ההרשמה"));

  const c = work("participant.phone_conflict");
  const conflict = composeMail(c, "admin_phone_conflict", buildVars(c, "admin_phone_conflict"));
  assert.equal(conflict.subject, "חשבון Google נוסף ניסה להתחבר: דנה לוי");
  const ctext = htmlToText(conflict.html);
  for (const part of ["כבר מחובר לחשבון אחר", "someone@gmail.com", "לנתק את החשבון או לחסום אותו"]) assert.ok(ctext.includes(part), part);
  assert.notEqual(mail.html, conflict.html);
});

test("an account name is text a stranger typed: escaped in {{x}} and in {{{x}}}, bidi and zero-width characters removed, one line", () => {
  const evil = '<img src=x onerror=alert(1)>\u202e\u200b "x"';
  const w = work("participant.linked", { account: { email: 'a"><script>@x.com', name: evil } });
  const mail = composeMail(w, "admin_account_linked", buildVars(w, "admin_account_linked"));
  assert.ok(!mail.html.includes("<img") && !mail.html.includes("<script"), mail.html);
  assert.ok(mail.html.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(!/[\u202e\u200b]/.test(mail.html));
  const raw = work("participant.linked", { account: { email: "a@x.com", name: evil }, templates: { admin_account_linked: { subject: "{{account_name}}", html: "<p>{{{account_name}}}</p>" } } });
  const m2 = composeMail(raw, "admin_account_linked", buildVars(raw, "admin_account_linked"));
  assert.ok(!m2.html.includes("<img"), "triple braces do not make it raw");
  assert.ok(!/[\u202e\u200b]/.test(m2.subject));
  assert.equal(render("{{{account_email}}}", { account_email: "<b>" }), "&lt;b&gt;");
});

test("a business can override either of them; an override over the caps falls back to the default", () => {
  const w = work("participant.linked", { templates: { admin_account_linked: { subject: "Linked: {{account_email}}", html: "<p>{{account_email}} -> {{full_name}}</p>" } } });
  const mail = composeMail(w, "admin_account_linked", buildVars(w, "admin_account_linked"));
  assert.equal(mail.subject, "Linked: someone@gmail.com");
  assert.ok(htmlToText(mail.html).includes("someone@gmail.com -> דנה לוי"));
  const big = work("participant.phone_conflict", { templates: { admin_phone_conflict: { subject: "s", html: `<p>${"x".repeat(30_000)}</p>` } } });
  const orig = console.error;
  const logged = [];
  console.error = (...a) => logged.push(a.join(" "));
  try {
    const m = composeMail(big, "admin_phone_conflict", buildVars(big, "admin_phone_conflict"));
    assert.ok(htmlToText(m.html).includes("לנתק את החשבון"));
  } finally { console.error = orig; }
  assert.deepEqual(logged, ["roster: template_rejected studio admin_phone_conflict too_long"]);
});

test("the admin caps hold for them: a stranger linking accounts cannot flood the notify list", async () => {
  const net = fakeNet();
  const atDay = work("participant.linked", { notify: ["owner@studio.example"], counters: { recipients: {}, business_day: 0, admin_recipients: { "owner@studio.example": 20 }, admin_hour: 0, business_day_all: 0 } });
  let r = (await deliverMails(atDay, depsFor(net))).mails[0];
  assert.deepEqual([r.status, r.error], ["failed", "limit_admin_recipient"]);
  const atHour = work("participant.phone_conflict", { notify: ["owner@studio.example"], counters: { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 30, business_day_all: 30 } });
  r = (await deliverMails(atHour, depsFor(net))).mails[0];
  assert.deepEqual([r.status, r.error], ["failed", "limit_admin_hour"]);
  assert.equal(net.resend().length, 0);
  /* sixty events in one batch: thirty mails, whatever the counters said */
  const deps = depsFor(net);
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => deliverMails(work("participant.linked", { id: 100 + i, notify: [`n${i % 2}@studio.example`] }), deps)));
  const mails = results.flatMap((x) => x.mails);
  assert.equal(mails.filter((m) => m.status === "sent").length, 30);
  assert.equal(mails.filter((m) => m.error === "limit_admin_hour").length, 30);
});

test("through the outbox: webhook configured, two internal events, two admin mails each and no webhook request", async () => {
  const items = [
    { ...rawItem("participant.linked", 41), mails_logged: [] },
    { ...rawItem("participant.phone_conflict", 42), mails_logged: [] },
  ];
  const net = fakeNet({ rpc: { roster_events_claim: () => items, roster_events_done: () => null } });
  const summary = await processOutbox({ env: makeEnv(), fetch: net.fetch, now: () => 1_800_000_000_000, sleep: async () => {} });
  assert.deepEqual([summary.claimed, summary.processed, summary.reported], [2, 2, 2]);
  assert.equal(net.webhooks().length, 0, "nothing reached the customer's endpoint");
  assert.deepEqual(net.resend().map((c) => [c.json.to[0], c.json.subject.split(":")[0]]).sort(), [
    ["manager@studio.example", "חשבון Google חובר למשתתף"], ["manager@studio.example", "חשבון Google נוסף ניסה להתחבר"],
    ["owner@studio.example", "חשבון Google חובר למשתתף"], ["owner@studio.example", "חשבון Google נוסף ניסה להתחבר"],
  ].sort());
  const done = net.rpc("roster_events_done").map((c) => c.json);
  assert.deepEqual(done.map((d) => d.p_result.webhook), [null, null]);
  assert.deepEqual(done.flatMap((d) => d.p_result.mails.map((m) => [m.template, m.audience, m.status])).sort(), [
    ["admin_account_linked", "admin", "sent"], ["admin_account_linked", "admin", "sent"],
    ["admin_phone_conflict", "admin", "sent"], ["admin_phone_conflict", "admin", "sent"],
  ]);
  const pAddresses = net.resend().filter((c) => c.json.to[0] === "dana@example.com");
  assert.equal(pAddresses.length, 0, "the participant is never mailed about it");
});

function rawItem(type, id) {
  return {
    event: { id, type, attempts: 0, source: "me", created_at: "2027-01-10T09:00:00Z", payload: { participant: PERSON, account: ACCOUNT } },
    business: { id: "b1", slug: "studio", name: "סטודיו דנה", notify_emails: ["owner@studio.example", "manager@studio.example"],
      settings: { webhook_url: "https://hooks.example.com/roster", webhook_secret: "whsec_t", webhook_events: null, participant_mail_enabled: true, personal_area_enabled: true } },
    participant: PERSON, facts: {}, templates: {},
    mail_counters: { recipients: {}, business_day: 0, admin_recipients: {}, admin_hour: 0, business_day_all: 0 },
  };
}
