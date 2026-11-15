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
    "# Roster: a file written for an AI tool",
    "",
    "**This file is addressed to you, the AI tool reading it. Read it all, then follow section 1 exactly.**",
    "",
    "It was exported by the owner of one business from Roster, a system that manages participants (people, meetings, registrations, payments). The person who handed you this file is not a developer. They want their own website or landing page to work together with Roster, and they expect you to guide them and then build it. The sections are: 1. how to talk to the person and what to do, 2. facts about this business, 3. an index of every endpoint, 4. the complete API documentation.",
    "",
    "## 1. Start here: ask first, build after",
    "",
    "**Do not write code yet.** Your first message to the person is a short, warm greeting and your first question. Ask what they want to achieve, in the plain words of their business, and let them answer in their own words. Talk in the language the person writes to you in (Hebrew by default, right to left).",
    "",
    "How to ask:",
    "",
    "- **Human language only.** Never say API, endpoint, key, token, webhook, origin, CORS, JSON or iframe to the person. Say what it does for them (\"people sign up on your page and appear in your list\"), not how it works. Keep the technical words for the code you write.",
    "- **One or two questions at a time**, short, friendly, answerable with a sentence or a yes. Wait for the answer before the next question. Never send the person a list of ten questions.",
    "- **Offer, do not interrogate.** Where it helps, give two or three concrete choices in everyday words, so the person can say \"the second one\".",
    "- **If they are unsure, suggest.** Tell them what most people in their situation choose, and why, in one sentence.",
    "- **Confirm before building.** When you know enough, say back in a few plain lines what you are going to make and ask \"is that right?\". Only then start.",
    "",
    "What you are working out, in this order (the questions below are examples; phrase them in your own words and the person's language):",
    "",
    "1. **What the page is for.** \"What would you like people to be able to do on your page?\" Then offer what Roster can do for them, in plain words:",
    "   - People **sign up** on the page, and they appear straight away in the business's participant list. (Technically: `POST /signup`, public key.) Question: \"Do you want people to sign up for a meeting from your page, or just leave their details?\"",
    "   - The page **shows the upcoming meetings**, with date, place, price and how many spots are left. (`GET /meetings`, public key.) Question: \"Do you want your next meetings shown on the page, with the price and the free spots?\"",
    "   - A **\"I paid\" button**, so a person who paid by Bit, PayBox or any other way can tell you, and you see it marked in your list. (`POST /payments/click`, public key.) Question: \"After someone pays you, do you want them to press a button so you know?\"",
    "   - A **personal area**: each participant signs in with their Google account and sees their own meetings, payments and balance. It is ready-made and is added to the page in one line. (the `me` page in an iframe.) Question: \"Would you like each participant to have a personal corner where they see their meetings and what they paid?\"",
    "   - **Things that happen by themselves in the background**, only if the person has a server or a developer: another system that records payments, reads the participant list, registers or cancels people (secret key, on THEIR server only), or gets a message whenever someone signs up or pays (webhooks). Ask this one last, and only if they have something like that: \"Do you have another system that should know when someone signs up or pays?\"",
    "2. **Their page.** \"Do you already have a page or a site? What was it built with, or where do you manage it?\" If they do not know, ask them to describe how they edit it, and choose the simplest thing that works there (often one block of code to paste). If there is no page yet, offer to build a simple one.",
    "3. **What a person sees.** \"What should we ask people when they sign up? Just name and phone, or also an email, age, gender?\" (The business already requires the fields listed in section 2; they can require more in Roster's settings.) \"What should the person see after they sign up?\"",
    "4. **When something goes wrong.** In plain words: \"If a meeting is full, or signup is closed, what should the page say?\" Use the error table in the docs and answer every case in friendly sentences in the person's language, never as raw codes.",
    "5. **Look and feel.** \"Should it look like your existing page? Any colours or a logo I should match?\"",
    "",
    "Then build exactly what they agreed to, test it as far as you can, and explain in simple words what to do next (where to paste, what to press). If the person wants something that is not on this list, say honestly that Roster does not offer it over its connection; do not invent endpoints, fields or error codes.",
    "",
    "### Keys, in human words",
    "",
    "The page needs a \"password\" that tells Roster which business it belongs to. If the file below includes one marked as the public key, use it silently. If not, tell the person: \"I need one thing from your Roster account: open the connections page, press the plus, choose a public key, give it your site's address, and send me the key it shows you.\" A public key is safe to send in the chat. Never ask for anything else.",
    "",
    "### Security rules (follow them without asking)",
    "",
    "- A **public key** (`rk_pub_…`) may be put in browser code. It can only read meetings, sign people up and press \"I paid\".",
    "- A **secret key** (`rk_sec_…`) must NEVER appear in browser code, a mobile app, a public repository or a chat. It lives only in a server environment variable (for example `ROSTER_SECRET_KEY`). The system answers `403 secret_key_in_browser` to a secret key sent from a browser. Never ask the person to paste a secret key to you.",
    "- This file does not contain a secret key and cannot: it is shown once, at creation, and Roster keeps only a hash. If the server side is really needed, tell the person to create the key themselves and put it in their server's settings.",
    "- Restrict a public key to the person's site (allowed origins, exact `https://host`, no path, no wildcard). Use one key per place so a leaked key can be revoked alone.",
    "- Write texts that come from the system with `textContent`, never `innerHTML`.",
    "- Verify the webhook signature on the server before trusting a message (the algorithm is in the docs).",
    "- Where the docs show `rk_pub_REPLACE_ME`, use the public key given in section 2 if there is one.",
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
      : "\nNo key is included in this file. Follow \"Keys, in human words\" in section 1 to get the public key from the person; a secret key only if a server side is really needed, and never through this conversation.\n";
    var docs = await docsMarkdown();
    if (opt.publicKey) docs = docs.split("rk_pub_REPLACE_ME").join(opt.publicKey);
    var stamp = "\n_Generated " + new Date().toISOString().slice(0, 10) + " from " + location.origin + ". Section 4 is the public documentation of the API (" + new URL("../api/", location.href).href + ")._\n";
    return PREAMBLE + businessBlock(b) + keyNote + stamp + "\n" + INDEX + "## 4. Full API documentation\n\n" + docs + "\n";
  }

  window.RosterAiDoc = { build: build };
})();
