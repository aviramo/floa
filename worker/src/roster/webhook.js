/* ==========================================================================
   Webhook delivery: roster to the business.

   Body     {"id","type","created_at","business":{"slug"},"data":{...}}
   Headers  Content-Type: application/json
            X-Roster-Event      the type
            X-Roster-Delivery   the event id (the same on every retry, so a
                                receiver can drop duplicates)
            X-Roster-Signature  t=<unix seconds>,v1=<hex HMAC-SHA256(secret,
                                t + "." + rawBody)>

   The request: https only and re-validated at send time (urls.js), redirects
   are NOT followed (a 3xx is a failure), 10 second timeout, any 2xx is success,
   the response body is never read. The error that is reported is one of a fixed
   vocabulary (timeout, network_error, redirect, http_<status>, invalid_url,
   no_secret, max_attempts), never an exception message: it is shown to the
   business on the connections page, and a network error's text can say where
   the Worker tried to go.

   Retries: after attempt n, +1 min, +5 min, +30 min, +2 h, +12 h, then failed.
   ========================================================================== */
import { validateWebhookUrl } from "./urls.js";
import { OUTBOX } from "./limits.js";

export const RETRY_DELAYS_SECONDS = Object.freeze([60, 300, 1800, 7200, 43200]);
export const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1;

/* seconds to wait before attempt n+1, or null when attempt n was the last */
export const retryDelayAfter = (attempt) =>
  Number.isInteger(attempt) && attempt >= 1 && attempt <= RETRY_DELAYS_SECONDS.length
    ? RETRY_DELAYS_SECONDS[attempt - 1]
    : null;

const enc = new TextEncoder();

/* the value of X-Roster-Signature. `t` is unix seconds. */
export async function signWebhook(secret, rawBody, t) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${rawBody}`));
  const hex = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${t},v1=${hex}`;
}

export function webhookBody(work) {
  return JSON.stringify({
    id: work.event.id,
    type: work.event.type,
    created_at: work.event.createdAt,
    business: { slug: work.business.slug },
    data: work.event.data,
  });
}

/* The events of the public contract (spec section 3). The database enqueues other kinds too, for mails only
   (participant.phone_conflict): those are never sent to a customer's endpoint. */
export const WEBHOOK_TYPES = Object.freeze(new Set([
  "participant.created", "registration.created", "registration.cancelled", "payment.reported", "payment.recorded", "ping",
]));

/* Is this event meant for the webhook? A business that never set a filter
   (null) gets everything of the contract; one that did gets only what it ticked,
   except the test event, which is the business asking for it by name. */
export function webhookWanted(settings, type) {
  if (!settings.webhook_url) return false;
  if (!WEBHOOK_TYPES.has(type)) return false;
  if (type === "ping") return true;
  return settings.webhook_events === null || settings.webhook_events.includes(type);
}

/* One request. -> { status: "ok"|"failed", http_status: number|null, error: string|null }
   deps: { fetch, now?, timeoutMs? } */
export async function deliverWebhook({ url, secret, type, eventId, body }, deps) {
  const checked = validateWebhookUrl(url);
  if (!checked.ok) return { status: "failed", http_status: null, error: "invalid_url" };
  if (!secret) return { status: "failed", http_status: null, error: "no_secret" };

  const now = deps.now || Date.now;
  const signature = await signWebhook(secret, body, Math.floor(now() / 1000));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs || OUTBOX.webhookTimeoutMs);
  try {
    const res = await deps.fetch(checked.url, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "user-agent": "FLOA-Roster-Webhook/1",
        "x-roster-event": type,
        "x-roster-delivery": eventId,
        "x-roster-signature": signature,
      },
      body,
    });
    try { await res.body?.cancel(); } catch { /* nothing to free */ }

    const code = res.status;
    if (code >= 200 && code < 300) return { status: "ok", http_status: code, error: null };
    if ((code >= 300 && code < 400) || res.type === "opaqueredirect") {
      return { status: "failed", http_status: code || null, error: "redirect" };
    }
    return { status: "failed", http_status: code || null, error: `http_${code}` };
  } catch (err) {
    return { status: "failed", http_status: null, error: err && err.name === "AbortError" ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/* The webhook half of one work item -> the `webhook` part of the done result:
     null                                         nothing to deliver
     { status, http_status, error, attempt, retry_in_seconds }
   `attempt` is this attempt's number (1 for the first); `retry_in_seconds` is
   null when it succeeded or when it was the last one. */
export async function runWebhook(work, deps) {
  const s = work.business.settings;
  if (!webhookWanted(s, work.event.type)) return null;

  const attempt = work.event.attempts + 1;
  if (attempt > MAX_ATTEMPTS) {
    return { status: "failed", http_status: null, error: "max_attempts", attempt, retry_in_seconds: null };
  }
  const started = (deps.now || Date.now)();
  const result = await deliverWebhook({
    url: s.webhook_url,
    secret: s.webhook_secret,
    type: work.event.type,
    eventId: work.event.id,
    body: webhookBody(work),
  }, deps);
  return {
    ...result,
    attempt,
    retry_in_seconds: result.status === "ok" ? null : retryDelayAfter(attempt),
    duration_ms: Math.max(0, (deps.now || Date.now)() - started),
  };
}
