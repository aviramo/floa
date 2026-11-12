/* ==========================================================================
   One work item from roster_events_claim, checked and put in one canonical
   shape. The database function and this Worker are written apart, so this is
   the single place that knows what an item may look like; everything after it
   (webhook, mail, outbox) reads the canonical form and never the raw one.

   See the assumptions block at the top of db.js for the shape expected, and
   what each field means. A raw item that cannot be understood returns null and
   is logged by id only.
   ========================================================================== */

export const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const text = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const nullableText = (v, max = 500) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null);

/* The webhook's `data`. The event row's payload is expected to BE that object;
   if the database stored the whole delivery body instead ({id, type, data}),
   the data inside it is used, so either reading works. */
export function eventData(payload) {
  if (!isObj(payload)) return {};
  const hasOwnShape = "participant" in payload || "meeting" in payload || "payment" in payload;
  if (!hasOwnShape && isObj(payload.data) && ("type" in payload || "id" in payload)) return payload.data;
  return payload;
}

export function normalizeWork(raw, now = Date.now) {
  if (!isObj(raw) || !isObj(raw.event) || !isObj(raw.business)) return null;

  const rawId = raw.event.id;
  let id = null;
  let idForDb = null;
  if (typeof rawId === "number" && Number.isSafeInteger(rawId) && rawId >= 0) {
    id = String(rawId);
    idForDb = rawId;
  } else if (typeof rawId === "string" && /^\d{1,19}$/.test(rawId)) {
    id = rawId;
    idForDb = Number.isSafeInteger(Number(rawId)) ? Number(rawId) : rawId;
  }
  if (id === null) return null;

  const type = typeof raw.event.type === "string" && /^[a-z_.]{1,60}$/.test(raw.event.type) ? raw.event.type : null;
  const slug = nullableText(raw.business.slug, 100);
  if (!type || !slug) return null;

  const attemptsN = Number(raw.event.attempts);
  const attempts = Number.isInteger(attemptsN) && attemptsN > 0 ? attemptsN : 0;

  let createdAt = null;
  if (typeof raw.event.created_at === "string" && !Number.isNaN(Date.parse(raw.event.created_at))) {
    createdAt = new Date(raw.event.created_at).toISOString();
  }

  const s = isObj(raw.business.settings) ? raw.business.settings : {};
  const events = Array.isArray(s.webhook_events) ? s.webhook_events.filter((e) => typeof e === "string") : null;
  const notify = Array.isArray(raw.business.notify_emails) ? raw.business.notify_emails
    : Array.isArray(s.notify_emails) ? s.notify_emails : [];

  return {
    event: {
      id,
      idForDb,
      type,
      attempts,
      source: typeof raw.event.source === "string" ? raw.event.source.slice(0, 20) : null,
      createdAt: createdAt || new Date(now()).toISOString(),
      data: eventData(raw.event.payload),
    },
    business: {
      id: text(String(raw.business.id ?? slug), 100),
      slug,
      name: text(raw.business.name, 200).trim(),
      settings: {
        webhook_url: nullableText(s.webhook_url, 600),
        webhook_secret: typeof s.webhook_secret === "string" && s.webhook_secret !== "" ? s.webhook_secret : null,
        webhook_events: events,
        participant_mail_enabled: s.participant_mail_enabled !== false,
        personal_area_enabled: s.personal_area_enabled !== false,
        contact_email: nullableText(s.contact_email, 320),
        sender_name: nullableText(s.sender_name, 200),
        mail_from_address: nullableText(s.mail_from_address, 320),
        /* the mail types this business turned off (sync 10); none off = today's behaviour */
        mail_off_types: Array.isArray(s.mail_off_types) ? s.mail_off_types.filter((k) => typeof k === "string").slice(0, 20) : [],
        contact_whatsapp: nullableText(s.contact_whatsapp, 100),
        payment_url: nullableText(s.payment_url, 600),
      },
      notifyEmails: notify.filter((e) => typeof e === "string").slice(0, 100),
    },
    participant: isObj(raw.participant) ? raw.participant : null,
    facts: isObj(raw.facts) ? raw.facts : {},
    templates: isObj(raw.templates) ? raw.templates : {},
    counters: isObj(raw.mail_counters) ? raw.mail_counters : null,
    /* the mails the database already holds for THIS event, [{template, to, status}], or null when it does not say */
    mailsLogged: Array.isArray(raw.mails_logged)
      ? raw.mails_logged.filter(isObj).map((m) => ({ template: text(m.template, 60), to: text(m.to, 500).trim().toLowerCase(), status: text(m.status, 20) }))
      : null,
  };
}
