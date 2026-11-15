/* ==========================================================================
   The file for another AI tool: "everything Roster can do for this business, and how to connect".

   Built in the browser, on demand, from three parts:
     1. a short preamble that tells the reading tool what the file is, what to propose to the person, and the security rules;
     2. THIS business: its name, address, keys (labels and origins, never the secret), webhook, signup rules;
     3. the public API documentation (../api/), fetched and turned into Markdown, so the file can never disagree with the docs.

   Markdown, because every AI tool reads it and it stays readable to a person. Keys: a secret key is never written here (it is shown once
   at creation and the system keeps only a hash of it). A PUBLIC key may be put in on request, because it is made to sit in browser code.
   ========================================================================== */
(function () {
  "use strict";
  var BASE = "https://api.floa.co.il/roster/v1";
  var DOC_URL = location.href;

  /* ---------- the docs page, as Markdown ---------- */
  var SKIP = { SCRIPT: 1, STYLE: 1, NAV: 1, ASIDE: 1, HEADER: 1, BUTTON: 1, SVG: 1, LINK: 1, META: 1 };
  var BLOCKS = /^(H[1-6]|PRE|TABLE|UL|OL|P|DIV|SECTION|ARTICLE|FIGURE|FIGCAPTION|DETAILS|SUMMARY|MAIN|TBODY|THEAD)$/;
  function textOf(n) { return (n.textContent || "").replace(/\s+/g, " ").trim(); }
  function inline(n) {
    var out = "";
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { out += c.nodeValue.replace(/\s+/g, " "); return; }
      if (c.nodeType !== 1 || SKIP[c.tagName] || c.hasAttribute("hidden")) return;
      var t = c.tagName;
      if (t === "CODE") out += "`" + textOf(c) + "`";
      else if (t === "B" || t === "STRONG") out += "**" + inline(c).trim() + "**";
      else if (t === "A") {
        var h = c.getAttribute("href") || "", label = inline(c).trim();
        out += h && h.charAt(0) !== "#" ? "[" + label + "](" + new URL(h, DOC_URL).href + ")" : label;
      }
      else if (t === "BR") out += "\n";
      else out += inline(c);
    });
    return out;
  }
  function cell(c) { return inline(c).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim(); }
  function table(t) {
    var rows = Array.prototype.slice.call(t.querySelectorAll("tr")).map(function (r) { return Array.prototype.slice.call(r.children).map(cell); });
    if (!rows.length) return "";
    var w = rows[0].length, lines = ["| " + rows[0].join(" | ") + " |", "|" + new Array(w + 1).join(" --- |")];
    rows.slice(1).forEach(function (r) { while (r.length < w) r.push(""); lines.push("| " + r.join(" | ") + " |"); });
    return lines.join("\n");
  }
  function list(el, depth) {
    var ordered = el.tagName === "OL", i = 0, lines = [];
    Array.prototype.forEach.call(el.children, function (li) {
      if (li.tagName !== "LI") return;
      i++;
      var own = "", nested = [];
      li.childNodes.forEach(function (c) {
        if (c.nodeType === 1 && (c.tagName === "UL" || c.tagName === "OL")) nested.push(list(c, depth + 1));
        else if (c.nodeType === 1 && c.tagName === "PRE") nested.push("\n" + block(c) + "\n");
        else if (c.nodeType === 3) own += c.nodeValue.replace(/\s+/g, " ");
        else if (c.nodeType === 1 && !SKIP[c.tagName]) own += inline({ childNodes: [c] });
      });
      lines.push(new Array(depth + 1).join("  ") + (ordered ? i + ". " : "- ") + own.trim() + (nested.length ? "\n" + nested.join("\n") : ""));
    });
    return lines.join("\n");
  }
  function block(n) {
    if (n.nodeType === 3) return n.nodeValue.trim() ? n.nodeValue.replace(/\s+/g, " ").trim() : "";
    if (n.nodeType !== 1 || SKIP[n.tagName] || n.hasAttribute("hidden")) return "";
    var t = n.tagName, m = /^H([1-6])$/.exec(t);
    if (m) return new Array(+m[1] + 1).join("#") + " " + inline(n).trim();
    if (t === "PRE") return "```\n" + n.textContent.replace(/\s+$/, "") + "\n```";
    if (t === "TABLE") return table(n);
    if (t === "UL" || t === "OL") return list(n, 0);
    if (t === "FIGCAPTION" || t === "SUMMARY") return "**" + inline(n).trim() + "**";
    if (t === "P") return inline(n).trim();
    var parts = [], loose = "";
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 1 && BLOCKS.test(c.tagName)) { if (loose.trim()) parts.push(loose.trim()); loose = ""; var b = block(c); if (b) parts.push(b); }
      else if (c.nodeType === 3) loose += c.nodeValue.replace(/\s+/g, " ");
      else if (c.nodeType === 1 && !SKIP[c.tagName]) loose += inline({ childNodes: [c] });
    });
    if (loose.trim()) parts.push(loose.trim());
    return parts.join("\n\n");
  }
  async function docsMarkdown() {
    var res = await fetch("../api/", { cache: "no-cache" });
    if (!res.ok) throw new Error("docs " + res.status);
    var html = await res.text();
    DOC_URL = new URL("../api/", location.href).href;
    var doc = new DOMParser().parseFromString(html, "text/html"), main = doc.querySelector("main") || doc.body;
    return block(main).replace(/\n{3,}/g, "\n\n");
  }

  /* ---------- this business ---------- */
  var tick = function (x) { return "`" + x + "`"; };
  function businessBlock(b) {
    var s = b.settings || {}, keys = b.keys || [], out = [];
    var req = (s.signup_required && s.signup_required.length ? s.signup_required : ["first_name", "phone"]).concat(["first_name", "phone"]);
    req = req.filter(function (x, i) { return req.indexOf(x) === i; });
    out.push("## 2. This business", "");
    out.push("- name: " + (b.name || "(no name)"));
    out.push("- slug: " + tick(b.slug));
    out.push("- api_base: " + tick(BASE));
    out.push("- personal_area_url: " + tick(b.meUrl) + " (embed with an iframe, see the docs below)");
    out.push("- signup_open: " + (s.registration_open === false ? "no (the signup form answers `closed`)" : "yes"));
    out.push("- signup_required_fields: " + req.map(tick).join(", "));
    out.push("- personal_area_enabled: " + (s.personal_area_enabled === false ? "no" : "yes"));
    if (s.payment_url) out.push("- payment_link: " + tick(s.payment_url));
    out.push("- webhook: " + (s.webhook_url
      ? tick(s.webhook_url) + ", events: " + (s.webhook_events && s.webhook_events.length ? s.webhook_events.map(tick).join(", ") : "all") +
        (s.webhook_secret_set ? " (a signing secret is set; it is shown once and is NOT in this file)" : "")
      : "none configured"));
    out.push("", "### Keys of this business (labels only; the keys themselves are never listed here)", "");
    if (!keys.length) out.push("No keys yet. The person creates one on the connections page of the business (the plus button).");
    else {
      out.push("| label | kind | starts with | allowed origins | state |", "| --- | --- | --- | --- | --- |");
      keys.forEach(function (k) {
        var org = k.kind === "secret" ? "server only" : (k.allowed_origins && k.allowed_origins.length ? k.allowed_origins.join(", ") : "any site");
        out.push("| " + String(k.label || "").replace(/\|/g, "/") + " | " + k.kind + " | " + tick((k.prefix || "") + "…") + " | " + org + " | " + (k.revoked_at ? "revoked" : "active") + " |");
      });
    }
    out.push("");
    return out.join("\n");
  }

  var PREAMBLE = [
    "# Roster API: instructions for an AI tool",
    "",
    "You are reading a file exported from the admin of one business in Roster, a participant-management system (people, meetings, registrations, payments).",
    "Your job: help the person who gave you this file connect THEIR website or server to Roster. The sections below are, in order: 1. what to do and the security rules, 2. facts about this business, 3. an index of every endpoint, 4. the complete API documentation.",
    "",
    "## 1. What to do",
    "",
    "1. Read the whole file before writing code. Everything Roster offers over the API is here; do not invent endpoints, fields or error codes.",
    "2. Tell the person what can be built and ask which parts they want. The options:",
    "   - **Signup form** on their site that creates the participant and registers them for a meeting (`POST /signup`, public key).",
    "   - **Meetings list** on the home page with price and free spots (`GET /meetings`, public key).",
    "   - **\"I paid\" button** that reports a payment for the admin to check (`POST /payments/click`, public key, uses the `participant_token` from the signup).",
    "   - **Personal area**: a ready-made page, embedded with one iframe, where participants sign in with Google and see their meetings, payments and balance.",
    "   - **Server side** (secret key, on THEIR server only): read participants, register or cancel registrations, record payments from any payment processor, pay from a participant's credit.",
    "   - **Webhooks**: a signed message to their server on every new participant, registration or payment.",
    "3. Match the person's site: language (Hebrew, right to left unless they say otherwise), their framework, their design. Build with what they already use.",
    "4. Handle every error code from the table in the docs with a message in the site's language. Show that message, never the raw JSON.",
    "",
    "### Security rules (follow them without asking)",
    "",
    "- A **public key** (`rk_pub_…`) may be put in browser code. It can only read meetings, sign people up and press \"I paid\".",
    "- A **secret key** (`rk_sec_…`) must NEVER appear in browser code, a mobile app, a public repository or a chat. It lives only in a server environment variable (for example `ROSTER_SECRET_KEY`). The system answers `403 secret_key_in_browser` to a secret key sent from a browser.",
    "- This file does not contain a secret key and cannot: it is shown once, at creation, and Roster keeps only a hash. If you need one, ask the person to create it on the connections page and put it in the server's environment. Never ask them to paste it into this conversation.",
    "- Restrict a public key to the person's site (allowed origins, exact `https://host`, no path, no wildcard). Use one key per place so a leaked key can be revoked alone.",
    "- Write texts that come from the system with `textContent`, never `innerHTML`.",
    "- Verify the webhook signature on the server before trusting a message (the algorithm is in the docs).",
    "- Where the docs show `rk_pub_REPLACE_ME`, use the public key given below if there is one, otherwise ask the person for their public key.",
    "",
    ""
  ].join("\n");

  var INDEX = [
    "## 3. Endpoint index",
    "",
    "Base URL: `" + BASE + "`. JSON in and out. Header `Authorization: Bearer <key>` (or `X-Roster-Key`). Success is always HTTP 200.",
    "",
    "| method and path | public key | secret key | what it does |",
    "| --- | --- | --- | --- |",
    "| `GET /meetings?limit=20` | yes | yes | upcoming meetings with price and free spots |",
    "| `POST /signup` | yes | yes | create or find a participant by phone, optionally register for `meeting_id` |",
    "| `POST /payments/click` | yes | no | the \"I paid\" button, with `participant_token` and `meeting_id` |",
    "| `GET /participants?phone=` and `GET /participants/{id}` | no | yes | read a participant |",
    "| `POST /participants/{id}/registrations` and `DELETE /participants/{id}/registrations/{meeting_id}` | no | yes | register and cancel |",
    "| `POST /payments` | no | yes | record a payment (supports an `Idempotency-Key` header) |",
    "| `POST /participants/{id}/pay-from-credit` | no | yes | pay a meeting from the participant's credit |",
    "",
    "Details, fields, examples and error codes of every endpoint are in section 4.",
    "",
    ""
  ].join("\n");

  /* b: { name, slug, meUrl, settings, keys }; opt.publicKey: a PUBLIC key to put in the file (a secret key is refused) */
  async function build(b, opt) {
    opt = opt || {};
    if (opt.publicKey && !/^rk_pub_[A-Za-z0-9]+$/.test(opt.publicKey)) throw new Error("only a public key may be written into the file");
    var keyNote = opt.publicKey
      ? "\n**Public key for this site: `" + opt.publicKey + "`** (safe in browser code; use it wherever the docs show `rk_pub_REPLACE_ME`).\n"
      : "\nNo key is included in this file. Ask the person for their public key (`rk_pub_…`), and for a secret key only if the server side is needed (see the rules above).\n";
    var docs = await docsMarkdown();
    if (opt.publicKey) docs = docs.split("rk_pub_REPLACE_ME").join(opt.publicKey);
    var stamp = "\n_Generated " + new Date().toISOString().slice(0, 10) + " from " + location.origin + ". Section 4 is the public documentation of the API (" + new URL("../api/", location.href).href + ")._\n";
    return PREAMBLE + businessBlock(b) + keyNote + stamp + "\n" + INDEX + "## 4. Full API documentation\n\n" + docs + "\n";
  }

  window.RosterAiDoc = { build: build };
})();
