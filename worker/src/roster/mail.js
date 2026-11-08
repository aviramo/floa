/* ==========================================================================
   Roster mails: which mails an event causes, what they say, and sending them.

   Rules (spec section 4), decided by planMails from the event and the facts
   the database put in the work item:

     participant.created     admin_signup            to the notify list
     payment.reported        admin_payment_reported  to the notify list
     registration.created    registered              participant, future meeting,
                                                     no payment yet, not free
     payment.recorded        payment_confirmed       kind payment, fully paid,
                                                     not already confirmed
                             refund                  kind refund
     registration.cancelled  registration_cancelled  participant, future meeting
     participant.linked      admin_account_linked    to the notify list (internal event)
     participant.phone_conflict  admin_phone_conflict  to the notify list (internal event)

   Everything that goes to a participant goes to an address a stranger typed, so
   it is limited (limits.js), it can be turned off per business, and it always
   says why the person is getting it. Everything that goes to the notify list is
   limited too: a stranger can make it happen (a signup, a linked account).
   Every mail takes its place against the limits BEFORE it is sent (reserveMail).

   A mail that fails never blocks anything: every outcome, sent or failed, comes
   back as one result object and the outbox reports it.
   ========================================================================== */
import { DEFAULT_TEMPLATES, FOOTER_MARK, PARTICIPANT_TEMPLATES } from "./mail-defaults.js";
import { esc, formatAmount, formatMeetingDate, formatMeetingTime, htmlToText, render, renderText } from "./render.js";
import { OUTBOX, reserveMail } from "./limits.js";
import { sha256Hex, UUID_RE } from "./keys.js";
import { stripHidden } from "./text.js";
import { isObj } from "./work.js";

export const MAIL_FROM_ADDRESS = "no-reply@floa.co.il";
export const SITE_ORIGIN = "https://floa.co.il";
export const RESEND_URL = "https://api.resend.com/emails";
const MAX_HTML = 200_000;
const MAX_ADMIN_RECIPIENTS = 20;

/* --- small validators ---------------------------------------------------------- */

const EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/* lower case, trimmed, or null. ASCII addresses only: that is what the
   database stores for participants and what a notify list holds. */
export function normalizeEmail(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return v.length <= 254 && EMAIL_RE.test(v) ? v : null;
}

/* an http(s) URL without credentials, as a normalised href, or "" */
export function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 500 || /[\s\u0000-\u001f]/.test(value)) return "";
  try {
    const u = new URL(value);
    if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return "";
    return u.href;
  } catch {
    return "";
  }
}

/* a number as typed by an Israeli business ("050-123 4567", "+972 50 ...") to
   the only form wa.me takes, or "" */
export function whatsappLink(value) {
  if (typeof value !== "string") return "";
  let d = value.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `972${d.slice(1)}`;
  return d.length >= 9 && d.length <= 15 ? `https://wa.me/${d}` : "";
}

/* The display name in `From`. Whatever the business typed is reduced to plain
   characters: no quotes, brackets, separators, no line breaks, no bidi
   controls, so it can never change who the mail is from or add a header. */
export function senderName(business) {
  const raw = stripHidden(business.settings.sender_name || business.name || "");
  const clean = raw
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069"<>[\]()\\,;:@]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(clean).slice(0, 60).join("").trim() || "FLOA";
}

export const fromHeader = (business) => `${senderName(business)} <${MAIL_FROM_ADDRESS}>`;
export const replyToOf = (business) => normalizeEmail(business.settings.contact_email);

/* --- variables ------------------------------------------------------------------- */

const METHOD_LABELS = { paybox: "פייבוקס", bit: "ביט", cash: "מזומן", bank: "העברה בנקאית", card: "כרטיס אשראי" };
const GENDER_LABELS = { male: "גבר", female: "אישה" };

const line = (v, max = 300) => {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return "";
  return stripHidden(v).replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, max);
};
const block = (v, max = 1000) =>
  typeof v === "string" ? stripHidden(v).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim().slice(0, max) : "";

export const participantOf = (work) => ({
  ...(isObj(work.event.data.participant) ? work.event.data.participant : {}),
  ...(work.participant || {}),
});

export const meetingOf = (work) => ({
  ...(isObj(work.event.data.meeting) ? work.event.data.meeting : {}),
  ...(isObj(work.facts.meeting) ? work.facts.meeting : {}),
});

const paymentOf = (work) => (isObj(work.event.data.payment) ? work.event.data.payment : {});

/* The Google account behind a participant.linked / participant.phone_conflict event.
   The payload says `account`; the first version of the database function said `google`. */
const accountOf = (work) => {
  const d = work.event.data;
  return isObj(d.account) ? d.account : isObj(d.google) ? d.google : {};
};

export function buildVars(work, templateKey) {
  const { business } = work;
  const s = business.settings;
  const p = participantOf(work);
  const m = meetingOf(work);
  const pay = paymentOf(work);
  const account = accountOf(work);
  const first = line(p.first_name, 80);
  const last = line(p.last_name, 80);
  const method = typeof pay.method === "string" ? pay.method.trim().toLowerCase() : "";
  const slug = encodeURIComponent(business.slug);
  const pid = typeof p.id === "string" && UUID_RE.test(p.id) ? p.id.toLowerCase() : "";

  return {
    business_name: line(business.name, 200),
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(" "),
    phone: line(p.phone, 40),
    email: line(p.email, 254),
    age: line(p.age, 3),
    gender: GENDER_LABELS[line(p.gender, 10).toLowerCase()] || "",
    account_email: line(account.email, 254),
    account_name: line(account.name, 120),
    meeting_name: line(m.name, 200) || "המפגש",
    meeting_date: formatMeetingDate(m.date),
    meeting_time: formatMeetingTime(m.time),
    place: line(m.place, 200),
    city: line(m.city, 100),
    price: formatAmount(m.price),
    amount: formatAmount(pay.amount ?? m.reported_amount ?? (templateKey === "admin_payment_reported" ? m.price : undefined)),
    method: method === "other" ? "" : (METHOD_LABELS[method] || line(pay.method, 40)),
    directions: templateKey === "payment_confirmed" ? block(m.directions) : "",
    my_link: s.personal_area_enabled ? `${SITE_ORIGIN}/roster/me/?biz=${slug}` : "",
    pay_link: safeHttpUrl(s.payment_url),
    whatsapp_link: whatsappLink(s.contact_whatsapp),
    admin_link: `${SITE_ORIGIN}/roster/admin/?biz=${slug}${pid ? `&p=${pid}` : ""}`,
  };
}

/* --- what to send ---------------------------------------------------------------- */

function adminRecipients(work) {
  const out = [];
  for (const raw of work.business.notifyEmails) {
    const addr = normalizeEmail(raw);
    if (addr && !out.includes(addr)) out.push(addr);
    if (out.length >= MAX_ADMIN_RECIPIENTS) break;
  }
  return out;
}

const isZeroPrice = (v) => v !== null && v !== undefined && v !== "" && Number(v) === 0;

/* -> { plan: [{ template, audience, to: [addr] | addr, noAddress? }], skipped: [{ template, reason }] }

   `skipped` is not recorded anywhere by the database; it is for the log and for
   the person reconciling the work item shape. */
export function planMails(work) {
  const plan = [];
  const skipped = [];
  const { event, business } = work;
  const facts = work.facts;
  const m = meetingOf(work);
  const p = participantOf(work);
  const pay = paymentOf(work);
  const skip = (template, reason) => skipped.push({ template, reason });

  const toAdmins = (template) => {
    const to = adminRecipients(work);
    if (to.length === 0) return skip(template, "no_recipients");
    plan.push({ template, audience: "admin", to });
  };

  /* silentWithoutEmail: the rule itself says "when the participant has an
     email", so nothing is recorded. For the others a missing address is
     recorded as a failed mail (error no_address), the admin sees why. */
  const toParticipant = (template, silentWithoutEmail) => {
    if (!business.settings.participant_mail_enabled) return skip(template, "participant_mail_off");
    const addr = normalizeEmail(p.email);
    if (addr) return plan.push({ template, audience: "participant", to: addr });
    if (silentWithoutEmail) return skip(template, "no_email");
    plan.push({ template, audience: "participant", to: "", noAddress: true });
  };

  switch (event.type) {
    case "participant.created":
      /* a participant the business's own people add by hand is not news to them: the database's rule is
         "notify and source <> admin" (roster_emit), and the event exists anyway when a webhook wants it */
      if (event.source === "admin") skip("admin_signup", "added_by_admin");
      else toAdmins("admin_signup");
      break;

    case "payment.reported":
      toAdmins("admin_payment_reported");
      break;

    /* Two internal events from the personal area: a Google account got linked to a participant that already
       existed (the trust model is "type the phone", so the business is told every time), or tried to and
       was refused because another account holds that phone. They go to the notify list and nowhere else:
       never to a participant, never to a customer's webhook (webhook.js WEBHOOK_TYPES). */
    case "participant.linked":
      toAdmins("admin_account_linked");
      break;

    case "participant.phone_conflict":
      toAdmins("admin_phone_conflict");
      break;

    case "registration.created":
      if (m.future !== true) skip("registered", "meeting_not_future");
      else if (facts.has_payment !== false) skip("registered", facts.has_payment === true ? "payment_exists" : "facts_missing");
      else if (m.free === true) skip("registered", "free");
      else if (isZeroPrice(m.price)) skip("registered", "no_price");
      else toParticipant("registered", true);
      break;

    case "payment.recorded": {
      const kind = typeof pay.kind === "string" ? pay.kind.toLowerCase() : "";
      if (kind === "payment") {
        if (facts.fully_paid !== true) skip("payment_confirmed", facts.fully_paid === false ? "not_fully_paid" : "facts_missing");
        else if (facts.confirmation_sent === true) skip("payment_confirmed", "already_confirmed");
        else toParticipant("payment_confirmed", false);
      } else if (kind === "refund") {
        toParticipant("refund", false);
      }
      break;
    }

    case "registration.cancelled":
      if (m.future !== true) skip("registration_cancelled", "meeting_not_future");
      else toParticipant("registration_cancelled", false);
      break;

    default:
      break; /* ping and anything unknown: no mail */
  }
  return { plan, skipped };
}

/* --- what it says ---------------------------------------------------------------- */

const wrapFragment = (html) =>
  /<body[\s>]/i.test(html)
    ? html
    : `<!doctype html>\n<html lang="he" dir="rtl"><body dir="rtl" style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">\n${html}\n</body></html>`;

function ensureFooter(html, businessName) {
  if (htmlToText(html).includes(FOOTER_MARK)) return html;
  const footer = `<p dir="rtl" style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6B7A78;direction:rtl;text-align:right">הודעה זו נשלחה כי הכתובת הזו ${FOOTER_MARK} של ${esc(businessName)}. אם זו טעות, אפשר להתעלם מההודעה.</p>`;
  const at = html.search(/<\/body\s*>/i);
  return at === -1 ? html + footer : html.slice(0, at) + footer + html.slice(at);
}

const usable = (v) => typeof v === "string" && v.trim() !== "";

/* What a business's own template may be before it is rendered (the database holds the same limits as
   CHECKs; the Worker does not rely on that, a template is written by a member and rendered in the one
   Worker everybody shares). */
export const MAX_TEMPLATE_HTML = 20_000;
export const MAX_TEMPLATE_SUBJECT = 300;
export const MAX_DATA_IF = 50;

/* null when the template is fine, else the short reason it is refused */
export function templateProblem(html) {
  if (html.length > MAX_TEMPLATE_HTML) return "too_long";
  let n = 0;
  for (const _m of html.matchAll(/data-if/gi)) if (++n > MAX_DATA_IF) return "too_many_data_if";
  return null;
}

/* the business's override when it has one (each part falls back separately),
   else the built-in default. An override that is over the caps is not rendered at
   all: the built-in default is sent instead and the refusal is logged (the
   template key and the business, nothing of its content). */
export function composeMail(work, template, vars) {
  const fallback = DEFAULT_TEMPLATES[template];
  const override = isObj(work.templates[template]) ? work.templates[template] : {};
  let subjectSrc = usable(override.subject) ? override.subject : fallback.subject;
  let htmlSrc = usable(override.html) ? override.html : fallback.html;
  if (usable(override.html)) {
    const problem = templateProblem(override.html);
    if (problem) {
      console.error(`roster: template_rejected ${work.business?.slug ?? "?"} ${template} ${problem}`);
      htmlSrc = fallback.html;
    }
  }
  if (subjectSrc.length > MAX_TEMPLATE_SUBJECT) {
    console.error(`roster: template_rejected ${work.business?.slug ?? "?"} ${template} subject_too_long`);
    subjectSrc = fallback.subject;
  }

  const subject = renderText(subjectSrc, vars) || renderText(fallback.subject, vars);
  let html = wrapFragment(render(htmlSrc, vars));
  if (PARTICIPANT_TEMPLATES.has(template)) html = ensureFooter(html, vars.business_name);
  if (html.length > MAX_HTML) throw new Error("too_large");
  return { subject, html, text: htmlToText(html) };
}

/* Resend dedupes on this for 24 hours: the same event, the same template and
   the same recipient is one mail, whatever happens to this Worker in between. */
export async function idempotencyKey(eventId, template, recipient) {
  return `${eventId}:${template}:${(await sha256Hex(String(recipient).toLowerCase())).slice(0, 32)}`;
}

/* --- sending --------------------------------------------------------------------- */

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* -> { status: "sent", error: null } | { status: "failed", error }
   Network trouble, a timeout, 429 and 5xx are tried once more (safe: the
   Idempotency-Key makes the second request the same mail); any other 4xx is
   final. The error is a short code, never the provider's text. */
export async function sendViaResend({ apiKey, payload, key }, deps) {
  const doFetch = deps.fetch;
  const sleep = deps.sleep || defaultSleep;
  const now = deps.now || Date.now;
  const timeoutMs = deps.timeoutMs || OUTBOX.mailTimeoutMs;
  let error = "network_error";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deps.deadlineAt ? deps.deadlineAt - now() : Infinity;
    if (attempt === 2 && left < timeoutMs + 1000) break;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, Math.max(1000, left - 300)));
    let retryable = false;
    try {
      const res = await doFetch(RESEND_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "idempotency-key": key },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (res.ok) {
        try { await res.body?.cancel(); } catch { /* nothing to free */ }
        return { status: "sent", error: null };
      }
      let name = "";
      try {
        const parsed = JSON.parse((await res.text()).slice(0, 2000));
        if (typeof parsed?.name === "string" && /^[a-z_]{1,40}$/.test(parsed.name)) name = `:${parsed.name}`;
      } catch { /* the code alone is enough */ }
      error = `resend_${res.status}${name}`;
      retryable = res.status === 429 || res.status >= 500;
    } catch (err) {
      error = err && err.name === "AbortError" ? "timeout" : "network_error";
      retryable = true;
    } finally {
      clearTimeout(timer);
    }
    if (!retryable) break;
    if (attempt === 1) await sleep(500);
  }
  return { status: "failed", error };
}

/* Mails that were reserved against a limit and then failed: the slot goes back unless the mail may
   have been delivered all the same. A timeout or a dropped connection may have reached Resend (the
   Idempotency-Key makes a repeat harmless, but the first request could have gone out), so those keep their
   slot; a refusal or an error answer from Resend did not send anything, so those give it back. */
const MAY_HAVE_BEEN_SENT = new Set(["timeout", "network_error"]);

/* one mail to one address -> the result object the outbox reports:
   { template, audience, to, subject, html, status: "sent"|"failed", error }
   `composed` is composeMail's answer for this template, made once per event. */
async function sendOne(work, item, to, composed, deps) {
  const base = { template: item.template, audience: item.audience, to };

  if (!composed.ok) {
    return { ...base, subject: "", html: "", status: "failed", error: composed.error?.message === "too_large" ? "too_large" : "render_error" };
  }
  const shown = { ...base, subject: composed.value.subject, html: composed.value.html };

  if (item.noAddress) return { ...shown, status: "failed", error: "no_address" };
  if (!deps.apiKey) return { ...shown, status: "failed", error: "mail_not_configured" };

  /* The place against the limits is TAKEN here, in the same synchronous step as the check and before anything
     is awaited: eight lanes started together each see the others' reservations, so a limit of 3 means 3. */
  const gate = reserveMail({ counters: work.counters, tally: deps.tally, businessId: work.business.id, recipient: to, audience: item.audience });
  /* A mail held back by a limit is logged with its subject and WITHOUT its html: there is nothing to read in a mail
     that did not go, and a stranger who triggers events by the hundred would otherwise fill the log with copies of it. */
  if (!gate.ok) return { ...shown, html: "", status: "failed", error: gate.error };

  try {
    const payload = {
      from: fromHeader(work.business),
      to: [to],
      subject: composed.value.subject,
      html: composed.value.html,
      text: composed.value.text,
    };
    const reply = replyToOf(work.business);
    if (reply) payload.reply_to = reply;

    const key = await idempotencyKey(work.event.id, item.template, to);
    const sent = await sendViaResend({ apiKey: deps.apiKey, payload, key }, deps);
    if (sent.status === "failed" && !MAY_HAVE_BEEN_SENT.has(sent.error)) gate.release();
    return { ...shown, status: sent.status, error: sent.error };
  } catch (err) {
    gate.release();
    throw err;
  }
}

/* All the mails of one event. deps: { fetch, apiKey, tally, sleep?, now?, deadlineAt? }
   -> { mails: [result...], skipped: [{ template, reason }] } */
export async function deliverMails(work, deps) {
  const { plan, skipped } = planMails(work);

  /* the same mail goes to every recipient of a template: render it once */
  const memo = new Map();
  const compose = (template) => {
    if (!memo.has(template)) {
      try {
        memo.set(template, { ok: true, value: composeMail(work, template, buildVars(work, template)) });
      } catch (error) {
        memo.set(template, { ok: false, error });
      }
    }
    return memo.get(template);
  };

  const jobs = [];
  for (const item of plan) {
    for (const to of Array.isArray(item.to) ? item.to : [item.to]) {
      /* a mail the database already has a row for (this event, this template, this address) is not made again:
         a retry of the webhook, or the event coming back after a crash, must neither mail twice nor log twice */
      if (work.mailsLogged && work.mailsLogged.some((m) => m.template === item.template && String(m.to).toLowerCase() === String(to).toLowerCase())) {
        skipped.push({ template: item.template, reason: "already_logged" });
        continue;
      }
      jobs.push(sendOne(work, item, to, compose(item.template), deps));
    }
  }
  return { mails: await Promise.all(jobs), skipped };
}
