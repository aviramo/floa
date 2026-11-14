/* Hosts on Cloudflare, declared in domains.json and applied from here.

     node scripts/domains.mjs --check     only read domains.json and say what it holds (no network, no token)
     node scripts/domains.mjs             apply: attach each enabled host to its Pages project and make its DNS record

   Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment (a repo secret in the workflow, or
   .env locally). The token needs: Zone / Zone: Read, Zone / DNS: Edit (for the zone only) and Account /
   Cloudflare Pages: Edit.

   It only ever CREATES, with one exception: a host marked "replaceGithub": true first has the records that point
   at GitHub Pages removed (see 2a below), for the cut-over. Otherwise it never deletes or changes a record that exists: a host whose name already has a
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

/* read-only: what the zone holds right now (DNS is public by nature; TXT bodies are cut short) */
const all = await api(`/zones/${ZONE}/dns_records?per_page=200`);
if (all.ok) { console.log(`zone records (${all.result.length}):`); for (const r of all.result) console.log(`  ${r.type.padEnd(6)} ${r.name}  ->  ${String(r.content).slice(0, 60)}  ${r.proxied ? "[proxied]" : "[dns only]"}`); }

let bad = 0;
for (const h of live) {
  const target = h.project + ".pages.dev";
  /* read-only, always: what Pages itself says about this host */
  { const st = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains/${encodeURIComponent(h.host)}`);
    if (st.ok && st.result) { const d = st.result; console.log(`::notice::${h.host}: Pages says status=${d.status}; verification=${JSON.stringify(d.verification_data || {})}; validation=${JSON.stringify(d.validation_data || {})}; ca=${d.certificate_authority || "?"}`); }
    else console.log(`::notice::${h.host}: Pages has no record of it (${st.status} ${st.errors})`); }
  /* the way back: "restoreGithub" puts a host on GitHub Pages again (its four A records, DNS only) and nothing else */
  if (h.restoreGithub) {
    const cur0 = await api(`/zones/${ZONE}/dns_records?name=${encodeURIComponent(h.host)}`);
    if (!cur0.ok) { console.error(`::error::${h.host}: cannot read DNS (${cur0.status}) ${cur0.errors}`); bad++; continue; }
    for (const r of cur0.result.filter((r) => r.type === "CNAME" && /.pages.dev$/.test(r.content))) { const d0 = await api(`/zones/${ZONE}/dns_records/${r.id}`, { method: "DELETE" }); console.log(`${h.host}: removed CNAME -> ${r.content} (${d0.ok ? "ok" : d0.errors})`); }
    for (const ip of ["185.199.108.153", "185.199.109.153", "185.199.110.153", "185.199.111.153"]) {
      if (cur0.result.some((r) => r.type === "A" && r.content === ip)) { console.log(`${h.host}: A ${ip} already there`); continue; }
      const a = await api(`/zones/${ZONE}/dns_records`, { method: "POST", body: JSON.stringify({ type: "A", name: h.host, content: ip, proxied: false, ttl: 300 }) });
      console.log(`${h.host}: A ${ip} (${a.ok ? "ok" : a.errors})`); if (!a.ok) bad++;
    }
    continue;
  }
  /* 1. the host on the Pages project */
  const cur = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains`);
  if (!cur.ok) { console.error(`::error::${h.host}: cannot read the Pages project ${h.project} (${cur.status}) ${cur.errors}`); bad++; continue; }
  const have = (cur.result || []).find((d) => d.name === h.host);
  if (have) {
    console.log(`${h.host}: already on ${h.project} (status: ${have.status}, certificate: ${(have.certificate_authority || "?")}/${(have.validation_data && have.validation_data.status) || "?"}, verification: ${(have.verification_data && have.verification_data.status) || "?"})`);
    if (have.status !== "active") { const re = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains/${encodeURIComponent(h.host)}`, { method: "PATCH" }); console.log(`${h.host}: asked Pages to check it again (${re.ok ? "ok" : re.status + " " + re.errors})`); }
  }
  else {
    const add = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains`, { method: "POST", body: JSON.stringify({ name: h.host }) });
    if (add.ok) console.log(`${h.host}: attached to ${h.project}`); else { console.error(`::error::${h.host}: could not attach (${add.status}) ${add.errors}`); bad++; continue; }
  }
  /* 2a. cut-over only: a host marked "replaceGithub" first loses the records that point at GitHub Pages
         (A / AAAA to GitHub's addresses, CNAME to *.github.io), and nothing else, at exactly its own name */
  const removed = [];
  if (h.replaceGithub) {
    /* the safety net, part 1: do not touch the old records unless the new home answers right now */
    const pre = await fetch(`https://${target}/`, { redirect: "manual" }).then((r) => r.status).catch(() => 0);
    if (pre < 200 || pre >= 400) { console.error(`::error::${h.host}: ${target} does not answer (${pre}); the old records are left alone`); bad++; continue; }
    const isGh = (r) => (r.type === "A" && /^185.199.(108|109|110|111).153$/.test(r.content)) || (r.type === "AAAA" && /^2606:50c0:800[0-3]::153$/i.test(r.content)) || (r.type === "CNAME" && /.github.io.?$/i.test(r.content));
    const cur2 = await api(`/zones/${ZONE}/dns_records?name=${encodeURIComponent(h.host)}`);
    if (!cur2.ok) { console.error(`::error::${h.host}: cannot read DNS (${cur2.status}) ${cur2.errors}`); bad++; continue; }
    for (const r of cur2.result.filter(isGh)) {
      const del = await api(`/zones/${ZONE}/dns_records/${r.id}`, { method: "DELETE" });
      if (del.ok) removed.push({ type: r.type, name: r.name, content: r.content, proxied: r.proxied, ttl: r.ttl });
      if (del.ok) console.log(`${h.host}: removed the GitHub Pages record ${r.type} -> ${r.content}`); else { console.error(`::error::${h.host}: could not remove ${r.type} ${r.content} (${del.status}) ${del.errors}`); bad++; }
    }
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
  /* the safety net, part 2: records were swapped in this run, so wait for Pages to call the host active.
     If it never does, put the old records back: a visitor must never be left on a host that answers with an error. */
  if (removed.length) {
    let ok = false;
    for (let i = 0; i < 24 && mk.ok; i++) {
      const d = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains/${encodeURIComponent(h.host)}`);
      const st = d.ok && d.result ? d.result.status : "?";
      if (st === "active") { ok = true; break; }
      if (i % 3 === 0) console.log(`::notice::${h.host}: waiting for Pages to activate it (status: ${st})`);
      if (i === 2) {
        /* Pages checked the host once, before its CNAME existed, and sits on "pending". Attach it again now that the record is there. */
        const gone = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains/${encodeURIComponent(h.host)}`, { method: "DELETE" });
        const again = await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains`, { method: "POST", body: JSON.stringify({ name: h.host }) });
        console.log(`::notice::${h.host}: attached again (detach ${gone.ok ? "ok" : gone.errors}; attach ${again.ok ? "ok" : again.errors})`);
      } else if (i % 4 === 3) await api(`/accounts/${ACCOUNT}/pages/projects/${h.project}/domains/${encodeURIComponent(h.host)}`, { method: "PATCH" });
      await new Promise((r) => setTimeout(r, 10000));
    }
    if (ok) console.log(`::notice::${h.host}: active on ${h.project}`);
    else {
      console.error(`::error::${h.host}: Pages did not activate it in time. Restoring the previous records.`);
      if (mk.ok) { const cur3 = await api(`/zones/${ZONE}/dns_records?name=${encodeURIComponent(h.host)}&type=CNAME`); for (const r of (cur3.result || [])) await api(`/zones/${ZONE}/dns_records/${r.id}`, { method: "DELETE" }); }
      for (const r of removed) { const back = await api(`/zones/${ZONE}/dns_records`, { method: "POST", body: JSON.stringify(r) }); console.log(`::notice::${h.host}: restored ${r.type} ${r.content} (${back.ok ? "ok" : back.errors})`); }
      bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
