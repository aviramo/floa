/* ==========================================================================
   The ONLY door from the roster Worker to the database.

   Calls `POST <SUPABASE_URL>/rest/v1/rpc/<fn>` with the service key, and
   nothing else: no tables, no other paths. The function names are a closed list
   (RPC below); asking for any other name throws before a request exists.

   `fetch` is injected, so the whole Worker can run against a fake database in
   tests. Nothing here throws on a bad answer: rpc() returns
   { ok: false, status } and the caller turns it into a 500 without ever showing
   database text to anyone. The service key is sent only here and never logged.

   ASSUMPTIONS ABOUT THE DATABASE FUNCTIONS (spec section 5 names and arguments,
   written in parallel with this file; reconcile against the real SQL)
   ----------------------------------------------------------------------------
   Transport. PostgREST named arguments: the JSON body is {p_name: value, ...}
   with EXACTLY the parameter names below. A function returning jsonb answers
   with that json as the body (an array for the claim). A void or null result is
   an empty body or `null`; both are fine for roster_events_done.

   Common error reply (every roster_api_* function, never an exception for an
   expected failure):  {"error": "<code>"}  with <code> one of
   invalid_key, invalid_token, wrong_key_kind, origin_not_allowed,
   secret_key_in_browser, rate_limited, validation, not_found, closed, full,
   conflict, bad_request, server_error. Extra keys used by the Worker:
     validation    {"error":"validation","field":"<name>"}   field is shown if it
                   is one of the known body field names, else dropped
     rate_limited  {"error":"rate_limited","retry_after":<seconds>}  becomes the
                   Retry-After header (default 60, clamped to 1..3600)
   Any other code, a non-object, or an HTTP failure becomes 500 server_error.

   1. roster_api_auth(p_key_hash text, p_required_kind text, p_origin text,
                      p_ip_hash text, p_bucket text) -> jsonb
        p_required_kind  'public' | 'secret' | 'any' (any = either is allowed)
        p_origin         the raw Origin header (at most 300 chars), or null when
                         the request had none
        p_ip_hash        sha256 hex of "roster-ip:<ROSTER_IP_SALT>:<bucket>" where
                         <bucket> is the caller's IPv4 address as it is, or for
                         IPv6 the /64 written "v6:xxxx:xxxx:xxxx:xxxx" (the first
                         four groups, in full, lower case); an IPv4-mapped IPv6
                         address is its IPv4 address. ROSTER_IP_SALT is REQUIRED
                         (the Worker answers 503 without it). The database treats
                         the value as opaque.
        p_bucket         'read' | 'signup' | 'click' | 'write'; the database
                         chooses the limit from (kind, bucket): public signup 6
                         per ip per 10 min and 120 per key per hour, public click
                         30 per ip per 10 min, public read 300 per key per min
                         and 120 per (key, ip hash) per min, secret 600 per min
                         whatever the bucket
        ok:    {"ok": true, "kind": "public"|"secret"}
        It is called FIRST on every authenticated route; the action function
        below is called only after it said ok. It performs: key lookup (revoked
        keys are invalid_key), kind check, origin check against allowed_origins
        (empty list = any origin; a missing Origin with a restricted list is its
        decision), secret key + Origin => secret_key_in_browser, rate counters,
        last_used_at.
        The Worker ALSO refuses locally, without calling the database: a
        malformed key (invalid_key), a secret key with an Origin header
        (secret_key_in_browser), a kind the route does not accept (wrong_key_kind).

   2. roster_api_meetings(p_key_hash text, p_limit int) -> jsonb
        p_limit 1..100 (the Worker clamps). ok:
        {"business":{"name":"..."}, "meetings":[ {id,date,time,name,city,place,
         capacity,spots_left,full,price,price_tiers} ... ]}
        for a secret key each meeting also has directions, registered, type. The
        Worker strips those three for a public key again, whatever the database
        returned.

   3. roster_api_signup(p_key_hash text, p_payload jsonb, p_ip_hash text) -> jsonb
        p_payload: only these keys, only when present and non-empty, strings
        trimmed and control-character free: first_name, last_name, phone, email,
        gender (strings), age (integer), meeting_id (uuid string). The honeypot
        `website` never reaches the database.
        ok:  {"status":"ok","registered":bool,"participant_token":"pt_...",
              "participant_id":"<uuid>","created":bool}
        The Worker returns {status, registered, participant_token} for a public
        key and adds participant_id and created for a secret key.
        errors: closed, full (the participant IS created/reused, nothing
        attached, no token), validation+field, not_found (unknown meeting_id).

   4. roster_api_payment_click(p_key_hash text, p_token_hash text, p_meeting uuid,
                               p_ip_hash text) -> jsonb
        p_token_hash = sha256 hex of the participant token (the Worker checks the
        token's shape first and answers invalid_token 401 itself when it is not
        pt_ + 32 alphanumerics). ok: {"status":"ok"} for EVERY valid token, whatever
        happened (addendum 2, decision 6). The Worker answers {"status":"ok"} to the
        caller whatever it got here, so no status can come back through it. error
        invalid_token for an unknown/expired/other-business token.

   5. roster_api_participant(p_key_hash text, p_id uuid, p_phone text) -> jsonb
        exactly one of p_id / p_phone is non-null (the other is null). p_phone is
        the raw query value (at most 40 chars of digits, + - ( ) . space), the
        database normalises it. ok: {"participant":{...summary...}}; unknown:
        {"error":"not_found"}.

   6. roster_api_register(p_key_hash text, p_participant uuid, p_meeting uuid)
      roster_api_unregister(p_key_hash text, p_participant uuid, p_meeting uuid)
        ok: {"status":"registered"|"exists"|"past"|"full"}  /
            {"status":"cancelled"|"not_registered"|"attended"|"past"}
        unknown participant or meeting: {"error":"not_found"}

   7. roster_api_record_payment(p_key_hash text, p_payload jsonb) -> jsonb
        p_payload: {participant_id uuid, meeting_id uuid?, kind 'payment'|
        'deposit'|'refund' (default 'payment'), amount number (> 0, finite),
        method text (default 'other', lower case), note text? (up to 500 chars),
        external_ref text (1..200 chars, from the body or the Idempotency-Key
        header)}.
        ok: {"status":"ok","payment_id":"<uuid>","duplicate":bool}
        errors: validation+field, not_found, conflict.

   8. roster_api_pay_from_credit(p_key_hash text, p_participant uuid,
                                 p_meeting uuid) -> jsonb
        ok: {"status":"ok"|"already"|"free"|"no_credit"|"missing"|
        "not_registered","allocated":n,"remaining":n,"credit_left":n}

   AGREEMENTS THE WORKER ALSO RELIES ON (addendum 2)
     * Every text the Worker validates (names, phone, email, note, method,
       external_ref, Idempotency-Key, webhook URL) is refused when it carries a
       bidi control (U+202A..U+202E, U+2066..U+2069) or a zero-width character
       (U+200B..U+200D, U+FEFF); the database refuses the same set.
     * A webhook URL is valid when it is https, has no credentials, is at most 500
       chars, has port 443 or none, is not an IP literal, localhost, *.workers.dev,
       .local, .internal, .invalid or a single label, and does not end in one of
       nip.io, sslip.io, xip.io, localtest.me, lvh.me, traefik.me, local.gd,
       vcap.me, lacolhost.com, 1u.ms. The Worker applies exactly this at send time
       (urls.js); a URL the database accepts and the Worker refuses would fail every
       delivery with invalid_url.
     * A public signup never modifies an existing participant (it creates, or
       reuses and reactivates, and attaches the meeting).
     * The template keys of roster_mail_templates are the eight of mail-defaults.js.
       The Worker refuses an override of more than 20,000 chars or with more than 50
       data-if and sends the built-in default instead (log: template_rejected).

   OUTBOX
   9. roster_events_claim(p_limit int) -> jsonb ARRAY of work items (a
      `setof jsonb` answer, which PostgREST also renders as an array, works too).
      Marks them processing with locked_until = now() + 2 min, skip locked.
      Work item (canonicalised by work.js; unknown extra keys are ignored):
      {
        "event": {
          "id": <bigint, number or digit string>,
          "type": "participant.created" | "registration.created" |
                  "registration.cancelled" | "payment.reported" |
                  "payment.recorded" | "ping"                  (the six of the public contract,
                                                                 the only ones a webhook ever gets)
                | "participant.linked" | "participant.phone_conflict"   (internal: mailed to
                                                                 the notify list only, never to a webhook)
          "payload": { ...the webhook `data` object: participant, meeting,
                       payment (only the keys the type needs)... ;
                       for the two internal types: participant plus
                       "account": {"email": text, "name": text} (the Google account;
                       the first database version said "google" for phone_conflict,
                       the Worker reads either) },
          "attempts": <int: webhook delivery attempts already RECORDED by
                       roster_events_done before this claim; 0 on the first
                       claim>,
          "created_at": "<ISO timestamp>",
          "source": "api" | "admin" | "me" | "system"   // who made the change; the Worker sends
                       // no admin_signup mail for a participant.created whose source is "admin"
        },
        "business": {
          "id": "<uuid>", "slug": "...", "name": "...",
          "settings": {
            "webhook_url": text|null, "webhook_secret": text|null (the one
            place the secret is given), "webhook_events": text[]|null (null =
            every event; an array = only those; ping is always delivered),
            "participant_mail_enabled": bool, "personal_area_enabled": bool,
            "contact_email": text|null, "sender_name": text|null,
            "mail_off_types": text[] (template keys the business turned off; [] = none),
            "mail_from_address": text|null (the From address the business
            chose; null = the platform default),
            "contact_whatsapp": text|null, "payment_url": text|null
          },
          "notify_emails": text[]   // the RESOLVED notify list: the notify_emails
                                    // setting, else the emails of the business
                                    // users
        },
        "participant": { "id": uuid, "first_name","last_name","email","phone",
                         "age","gender" } | null,   // the CURRENT row (email may
                                    // have changed since the event); falls back to
                                    // payload.participant
        "facts": {                  // computed by the database at claim time,
                                    // the mail rules need them
          "meeting": { "date":"YYYY-MM-DD","time":"HH:MM","name","city","place",
                       "directions": text|null,
                       "future": bool,        // meeting date is today or later
                       "price": int|null,     // current price by the tier rule
                       "free": bool,          // this participant's no_pay flag
                       "reported_amount": number|null } | null,
          "has_payment": bool,        // any payment exists for participant+meeting
          "fully_paid": bool,         // paid in full, or the remainder was closed
          "confirmation_sent": bool   // payment_confirmed already mailed for this
                                      // participant+meeting
        },
        "templates": { "<key>": {"subject": text, "html": text} },  // the
                                    // business's overrides only
        "mail_counters": {          // from roster_mail_log, status sent or pending
          "recipients": { "<lower case address>": <int> },  // PARTICIPANT mails to that
                                    // address, last 24 h (only the addresses this
                                    // event can mail are needed)
          "business_day": <int>,    // participant mails of this business, last 24 h
          "admin_recipients": { "<lower case address>": <int> },  // ADMIN mails (templates
                                    // admin_*) to that address, last 24 h
          "admin_hour": <int>,      // admin mails of this business, last 60 minutes
          "business_day_all": <int> // EVERY mail of this business, last 24 h
        }
      The Worker decides, with the constants in limits.js (MAIL_LIMITS): participant
      mails 3 per address per 24 h and 200 per business per 24 h; admin mails 20 per
      address per 24 h and 30 per business per hour; all mails 400 per business per
      24 h. A mail over a limit is reported failed with error limit_recipient,
      limit_business, limit_admin_recipient, limit_admin_hour or limit_business_day,
      and the event still completes. The Worker adds its own reservations of the
      current batch to these counters, and reserves BEFORE it sends. A counters
      object missing altogether fails the mail closed (counters_missing); a single
      missing field counts as 0.
      }
      A missing `facts` value leaves the mail rule that needs it unfired (listed
      in `skipped` with reason facts_missing). A missing `mail_counters` makes
      every participant mail fail with error counters_missing (fail closed).
      A re-claim of a row whose lock ran out counts as an attempt in the database
      (capped at 6, then the event is failed/max_attempts), so `attempts` is NOT
      "webhook attempts that were really made": the Worker cannot read it as "the
      mails were already made". It reads the OPTIONAL key below instead.
        "mails_logged": [ { "template": "<key>", "to": "<address>"|"", "status":
                            "sent"|"failed"|"pending" } ]   // roster_mail_log rows of THIS
                            // event (event_id = the event's id), any status
      With it, the Worker makes every planned mail that has no row yet (so an event
      that comes back after a crash gets the mails that were never sent, and a
      webhook retry never mails or logs twice). Without it the Worker falls back to
      "mails only when attempts == 0", which loses the mails of an event whose
      first claim was lost before anything went out.

  10. roster_events_done(p_id bigint, p_result jsonb) -> anything (ignored)
      p_result:
      {
        "webhook": null |               // null: nothing was due (no URL, filtered)
          { "status": "ok" | "failed",
            "http_status": int | null,
            "error": null | "timeout" | "network_error" | "redirect" |
                     "http_<status>" | "invalid_url" | "no_secret" | "max_attempts",
            "attempt": int,             // this attempt's number, 1 = first
            "retry_in_seconds": int | null,   // 60, 300, 1800, 7200, 43200 after
                                        // attempts 1..5; null on success and after
                                        // the 6th (then the event is `failed`)
            "duration_ms": int },
        "mails": [ { "template": "<key>", "audience": "admin" | "participant",
                     "to": "<address>" | "",   // "" only when error = no_address
                     "subject": text, "html": text,   // exactly what was (or
                                        // would have been) sent
                     "status": "sent" | "failed",
                     "error": null | "no_address" | "limit_recipient" |
                              "limit_business" | "limit_admin_recipient" |
                              "limit_admin_hour" | "limit_business_day" |
                              "counters_missing" |
                              "mail_not_configured" | "render_error" |
                              "too_large" | "timeout" | "network_error" |
                              "resend_<status>[:<resend error name>]" } ],
        "skipped": [ { "template": "<key>", "reason": text } ],   // optional,
                                        // for the log only, may be ignored
        "error": "internal"             // present only when processing threw;
                                        // webhook is null then
      }
      The database decides: event done (webhook ok or null), pending again at
      now() + retry_in_seconds (webhook failed with a delay), or failed (webhook
      failed with retry_in_seconds null); writes roster_webhook_deliveries (event,
      attempt, status, http_status, error), roster_mail_log rows for every
      entry of `mails` plus the participant timeline note for audience
      participant. A mail already logged for the event is not made again
      (mails_logged), so no mail entry repeats for a template and address.
   ========================================================================== */

export const RPC = Object.freeze({
  auth: "roster_api_auth",
  meetings: "roster_api_meetings",
  signup: "roster_api_signup",
  click: "roster_api_payment_click",
  participant: "roster_api_participant",
  register: "roster_api_register",
  unregister: "roster_api_unregister",
  recordPayment: "roster_api_record_payment",
  payFromCredit: "roster_api_pay_from_credit",
  claim: "roster_events_claim",
  done: "roster_events_done",
});

const ALLOWED = new Set(Object.values(RPC));
const DEFAULT_TIMEOUT_MS = 8000;

/* The base URL must be https (http only for a local Supabase), because the
   service key travels in the request. */
function baseUrl(url) {
  try {
    const u = new URL(url);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol === "https:" || (local && u.protocol === "http:")) return u.origin;
  } catch { /* falls through */ }
  return null;
}

export function createDb({ url, serviceKey, fetch: doFetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const base = baseUrl(url);
  return {
    /* -> { ok: true, status, data } | { ok: false, status } ; never throws on a bad answer */
    async rpc(name, args) {
      if (!ALLOWED.has(name)) throw new Error(`roster db: ${name} is not an allowed function`);
      if (!base || !serviceKey) return { ok: false, status: 0 };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(`${base}/rest/v1/rpc/${name}`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(args),
          signal: controller.signal,
        });
        const raw = await res.text();
        if (!res.ok) {
          console.error("roster db: function failed", name, res.status);
          return { ok: false, status: res.status };
        }
        if (raw === "") return { ok: true, status: res.status, data: null };
        try {
          return { ok: true, status: res.status, data: JSON.parse(raw) };
        } catch {
          console.error("roster db: unreadable answer", name);
          return { ok: false, status: res.status };
        }
      } catch (err) {
        console.error("roster db: request failed", name, err && err.name);
        return { ok: false, status: 0 };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
