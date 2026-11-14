/* Hosts on Cloudflare, declared in domains.json and applied from here.

     node scripts/domains.mjs --check     only read domains.json and say what it holds (no network, no token)
     node scripts/domains.mjs             apply: attach each enabled host to its Pages project and make its DNS record

   Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (a repo secret in the workflow, or
   .env locally). The token needs: Zone / Zone: Read, Zone / DNS: Edit (for the zone only) and Account /
   Cloudflare Pages: Edit.

   It only ever CREATES. It never deletes or changes a record that exists: a host whose name already has a
   different record is reported and left alone, so the live site cannot be cut over by accident.
   The logs of this repo may be public: no token, no account id and no zone id is ever printed. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(join(ROOT, "domains.json"), "utf8"));
const check = process.argv.includes("--check");

/* a tiny .env reader, for the local run only (the file is ignored by git) */
const envFile = join(ROOT, ".env");
if (existsSync(envFile)) for (const l of readFileSync(envFile, "utf8").split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }

const problems = [];
if (!cfg.zone || typeof cfg.zone !== "string") problems.push("domains.json: zone is missing");
const hosts = Array.isArray(cfg.hosts) ? cfg.hosts : [];
for (const h of hosts) {
  if (!h.host || !String(h.host).endsWith(cfg.zone)) problems.push(`${h.host}: not inside ${cfg.zone}`);
  if (!/^[a-z0-9-]+$/.test(h.project || "")) problems.push(`${h.host}: project is missing or not a Pages project name`);
}
if (problems.length) { for (const p of problems) console.error("::error::" + p); process.exit(1); }
const live = hosts.filter((h) => h.enabled !== false);
console.log(`domains.json: zone ${cfg.zone}, ${hosts.length} host(s), ${live.length} enabled:`);
for (const h of hosts) console.log(`  ${h.enabled === false ? "off" : "on "}  ${h.host} -> ${h.project}.pages.dev`);
if (check) process.exit(0);

const TOKEN = process.env.CLOUDFLARE_API_TOKEN, ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const fail = (m) => { console.error("::error::" + m); process.exit(1); };
if (!TOKEN) fail("CLOUDFLARE_API_TOKEN is missing");
if (!ACCOUNT || ACCOUNT.length !== 32) fail("CLOUDFLARE_ACCOUNT_ID is missing or is not 32 characters");

async function api(path, init) {
  const r = await fetch("https://api.cloudflare.com/client/v4" + path, { ...init, headers: { authorization: "Bearer " + TOKEN, "content-type": "application/json" } });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.success !== false, status: r.status, result: j.result, errors: (j.errors || []).map((e) => `${e.code}: ${e.message}`).join("; ") };
}

const z = await api("/zones?name=" + encodeURIComponent(cfg.zone));
if (!z.ok) fail(`could not read the zone ${cfg.zone} (${z.status}): ${z.errors || "the token needs Zone: Read"}`);
if (!z.result || !z.result.length) fail(`${cfg.zone} is not a zone on this Cloudflare account (are its nameservers on Cloudflare?)`);
const ZONE = z.result[0].id;

let bad = 0;
for (const h of live) {
  const target = h.project + ".pages.dev";
  /* 1. the host on the Pages project */
  const cur = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains`);
  if (!cur.ok) { console.error(`::error::${h.host}: cannot read the Pages project ${h.project} (${cur.status}) ${cur.errors}`); bad++; continue; }
  if ((cur.result || []).some((d) => d.name === h.host)) console.log(`${h.host}: already on ${h.project}`);
  else {
    const add = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains`, { method: "POST", body: JSON.stringify({ name: h.host }) });
    if (add.ok) console.log(`${h.host}: attached to ${h.project}`); else { console.error(`::error::${h.host}: could not attach (${add.status}) ${add.errors}`); bad++; continue; }
  }
  /* 2. its DNS record: create it only when the name is free */
  const rec = await api(`/zones/${ZONE}/dns_records?name=${encodeURIComponent(h.host)}`);
  if (!rec.ok) { console.error(`::error::${h.host}: cannot read DNS (${rec.status}) ${rec.errors || "the token needs Zone / DNS: Edit"}`); bad++; continue; }
  if (rec.result.length) {
    const same = rec.result.some((r) => r.type === "CNAME" && r.content === target);
    if (same) console.log(`${h.host}: DNS already points at ${target}`);
    else { console.error(`::warning::${h.host}: a different record already exists (${rec.result.map((r) => r.type).join(", ")}); left alone. Remove it in Cloudflare if this is the intended cut-over, then run again.`); bad++; }
    continue;
  }
  const mk = await api(`/zones/${ZONE}/dns_records`, { method: "POST", body: JSON.stringify({ type: "CNAME", name: h.host, content: target, proxied: true, ttl: 1 }) });
  if (mk.ok) console.log(`${h.host}: DNS record created -> ${target}`); else { console.error(`::error::${h.host}: could not create the DNS record (${mk.status}) ${mk.errors}`); bad++; }
}
process.exit(bad ? 1 : 0);
