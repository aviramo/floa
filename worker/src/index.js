/* ==========================================================================
   FLOA — the lead endpoint.

   The site is static (GitHub Pages) and has no server of its own, so this Worker
   IS the server. It exists for one reason: to hold the Resend API key somewhere
   the browser can never see it, and to email a lead to the inbox.

   POST /lead  { name, phone, page, url, company }  ->  { ok: true }

   Nothing is stored. Not here, not in Firebase, not anywhere — the lead becomes
   an email and that is the whole of its life.

   Secrets (never in this file, never in the repo — see worker/README.md):
     RESEND_API_KEY   the Resend key
     LEAD_TO          who receives the lead        (info@floa.co.il)
     LEAD_FROM        the verified sender          (FLOA <no-reply@floa.co.il>)
   ========================================================================== */

const ALLOWED_ORIGINS = [
  "https://floa.co.il",
  "https://www.floa.co.il",
  "http://localhost:5173",          // the dev server (build.mjs --serve)
];

/* The six pages that may submit a lead. The page name lands in the subject line,
   so it is validated against this list rather than trusted from the browser —
   otherwise anyone could POST an arbitrary string into our inbox's subject. */
const PAGES = [
  "דף הבית",
  "אתרים ודפי נחיתה",
  "לידים, מכירות ו־CRM",
  "אוטומציות ושיפור תהליכים",
  "מערכות ואפליקציות",
  "שיווק, קמפיינים ומדידה",
];

const cors = (origin) => ({
  "access-control-allow-origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
});

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...cors(origin) },
  });

/* --- validation: the server decides, not the browser ----------------------- */

/* an Israeli mobile or landline, however it was typed */
function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d+]/g, "").replace(/^\+972/, "0").replace(/^972/, "0");
  return /^0(?:5\d{8}|[2-489]\d{7})$/.test(digits) ? digits : null;
}

/* 0500000000 -> 050-0000000. The email is read by a human who is about to dial,
   so it shows the number the way a person writes it; the tel: link uses the raw
   digits. */
const prettyPhone = (digits) =>
  digits.startsWith("05")
    ? `${digits.slice(0, 3)}-${digits.slice(3)}`
    : `${digits.slice(0, 2)}-${digits.slice(2)}`;

function validate(lead) {
  const name = String(lead.name || "").trim();
  const phone = normalizePhone(lead.phone);
  const page = String(lead.page || "").trim();

  if (name.length < 2 || name.length > 80) return { error: "name" };
  if (!phone) return { error: "phone" };
  if (!PAGES.includes(page)) return { error: "page" };

  /* the visitor's page URL is shown in the email, so it must be one of ours */
  let url = "";
  try {
    const u = new URL(String(lead.url || ""));
    if (ALLOWED_ORIGINS.includes(u.origin)) url = u.href;
  } catch { /* an unparseable URL is simply not shown */ }

  return { lead: { name, phone, page, url } };
}

/* HTML-escape: the name is visitor input and it lands inside an email body */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* Israel time, dd.mm.yyyy, HH:MM — the inbox is read in Israel */
function stamp() {
  const parts = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const at = (t) => parts.find((p) => p.type === t).value;
  return `${at("day")}.${at("month")}.${at("year")}, ${at("hour")}:${at("minute")}`;
}

function email(lead) {
  const when = stamp();
  const rows = [
    ["עמוד", lead.page],
    ["שם", lead.name],
    ["טלפון", prettyPhone(lead.phone)],
    ["תאריך ושעה", when],
    ["כתובת העמוד", lead.url],
  ].filter(([, v]) => v);

  const text = [
    "התקבלה פנייה חדשה מאתר FLOA",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
  ].join("\n");

  const html = `<!doctype html>
<html lang="he" dir="rtl">
  <body style="margin:0;padding:24px;background:#E9F0EE;font-family:Arial,Helvetica,sans-serif;color:#0F2A33">
    <table role="presentation" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #DCE6E3;border-radius:16px;padding:28px" width="100%">
      <tr><td>
        <h1 style="margin:0 0 6px;font-size:20px;color:#0A6C61">פנייה חדשה מאתר FLOA</h1>
        <p style="margin:0 0 20px;font-size:14px;color:#586C73">התקבלה פנייה חדשה מאתר FLOA</p>
        <table role="presentation" width="100%" style="font-size:15px;border-collapse:collapse">
          ${rows.map(([k, v]) => `
          <tr>
            <td style="padding:8px 0;color:#586C73;width:120px;vertical-align:top">${esc(k)}</td>
            <td style="padding:8px 0;font-weight:bold">${esc(v)}</td>
          </tr>`).join("")}
        </table>
        <p style="margin:22px 0 0">
          <a href="tel:${esc(lead.phone)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E8C7E;color:#fff;text-decoration:none;font-weight:bold">חיוג ל־${esc(lead.name)}</a>
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return {
    subject: `פנייה חדשה מאתר FLOA – ${lead.page}`,
    text,
    html,
  };
}

/* --- rate limiting --------------------------------------------------------
   A best-effort brake on repeat sends, keyed by IP, held in the Worker's cache.
   It is not a hard guarantee (the cache is per-colo), but it stops the obvious
   abuse — a script hammering the endpoint from one address. The honeypot below
   catches the rest. */
async function rateLimited(ip) {
  const key = new Request(`https://ratelimit.floa.internal/${encodeURIComponent(ip)}`);
  const cache = caches.default;
  if (await cache.match(key)) return true;
  await cache.put(key, new Response("1", { headers: { "cache-control": "max-age=30" } }));
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("origin") || "";

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== "POST") return json({ ok: false, error: "method" }, 405, origin);
    if (!ALLOWED_ORIGINS.includes(origin)) return json({ ok: false, error: "origin" }, 403, origin);

    const url = new URL(request.url);
    if (url.pathname !== "/lead") return json({ ok: false, error: "not found" }, 404, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "body" }, 400, origin);
    }

    /* the honeypot. A human never sees the field, so a filled one is a bot —
       answer 200 so the bot believes it succeeded and does not retry. */
    if (String(body.company || "").trim()) return json({ ok: true }, 200, origin);

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (await rateLimited(ip)) return json({ ok: false, error: "rate" }, 429, origin);

    const { lead, error } = validate(body);
    if (error) return json({ ok: false, error }, 400, origin);

    const { subject, text, html } = email(lead);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.LEAD_FROM,          // FLOA <no-reply@floa.co.il> — verified on the domain
        to: [env.LEAD_TO],            // info@floa.co.il
        reply_to: env.LEAD_TO,
        subject,
        text,
        html,
      }),
    });

    /* The visitor is told "thank you" ONLY if the mail provider accepted it. If
       Resend refused, the browser gets a failure and keeps the typed fields. */
    if (!res.ok) {
      console.error("resend rejected the lead", res.status, await res.text());
      return json({ ok: false, error: "send" }, 502, origin);
    }

    return json({ ok: true }, 200, origin);
  },
};
