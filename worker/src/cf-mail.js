/* ==========================================================================
   Sending mail through Cloudflare Email Service (the `send_email` binding).

   Chosen with the MAIL_PROVIDER var: "cloudflare" uses the binding named EMAIL,
   anything else (the default) keeps using Resend. Switching is one var and one
   deploy, and so is switching back, which is the point: nothing is cut over
   until a real mail has arrived from the new route.

   The binding takes no API key and no Idempotency-Key. So a retry is only safe
   after an error that means "nothing was sent" (CLEAN_FAILURES); an error we do
   not recognise may have gone out, and is not retried.
   ========================================================================== */

export const useCloudflare = (env) => String(env?.MAIL_PROVIDER || "").toLowerCase() === "cloudflare" && !!env?.EMAIL;

/* "Name <a@b.co>" or "a@b.co" -> { email, name? } (the binding wants the object form for a display name) */
export function parseAddress(value) {
  const s = String(value || "").trim();
  const m = /^(.*)<([^<>]+)>\s*$/.exec(s);
  if (!m) return s;
  const name = m[1].trim().replace(/^"|"$/g, "").trim();
  return name ? { email: m[2].trim(), name } : m[2].trim();
}

/* errors where Cloudflare refused or failed BEFORE accepting the mail */
export const CLEAN_FAILURES = new Set(["E_INTERNAL_SERVER_ERROR", "E_RATE_LIMIT_EXCEEDED"]);

/* -> { ok: true, id } | { ok: false, code, clean }
   `code` is Cloudflare's own short code (E_...), never its message. */
export async function sendWithBinding(binding, { from, to, replyTo, subject, text, html }) {
  try {
    const message = { from: parseAddress(from), to: Array.isArray(to) ? to : [to], subject, text, html };
    if (replyTo) message.replyTo = replyTo;
    const res = await binding.send(message);
    return { ok: true, id: res?.messageId ?? null };
  } catch (err) {
    const code = typeof err?.code === "string" && /^E_[A-Z_]{1,60}$/.test(err.code) ? err.code : "";
    return { ok: false, code: code || "E_UNKNOWN", clean: CLEAN_FAILURES.has(code) };
  }
}
