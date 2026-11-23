/* ==========================================================================
   Chatbot operations: load a research file, activate it, create campaigns and print their links.

     node scripts/chatbot.mjs dims                                   list the segment dimensions
     node scripts/chatbot.mjs dims add age range                     add a dimension (enum: add <key> enum a,b,c)
     node scripts/chatbot.mjs research validate <file.json>          check a research file, free, touches nothing
     node scripts/chatbot.mjs research load <file.json>              load it as a DRAFT version (nothing is live yet)
     node scripts/chatbot.mjs research list                          versions and their coverage
     node scripts/chatbot.mjs research activate <versionId> --yes    make a version the live one (the previous is archived)
     node scripts/chatbot.mjs campaign create --business harpatka --topic <topic_id> [--gender female] [--gender female]
                                              [--ad "the ad sentence"] [--id <opaque id>] [--note ...]
     node scripts/chatbot.mjs campaign activate <id> | pause <id> | list
     node scripts/chatbot.mjs links [--business harpatka]            the link of every active campaign

   Everything here is a reading or an addition in the chatbot schema. A research version goes live only by `activate --yes`,
   and a campaign only by `campaign activate`. Nothing here touches a table of another app. It needs the same .env token as scripts/sql.mjs.
   ========================================================================== */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSummary, campaignId, campaignLink, checkSegment, dollar, readableId, segmentKey, validCampaignId, validateResearch } from "../apps/chatbot/engine-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, sub, ...rest] = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) { const k = rest[i].slice(2); const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true; flags[k] = v; }
  else pos.push(rest[i]);
}

/* the owner's SQL door (scripts/sql.mjs); rows come back as JSON */
function sql(query) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts/sql.mjs")], { input: query, encoding: "utf8", cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || "").trim();
  const err = (r.stderr || "").split("\n").filter((l) => l.trim() && !l.startsWith("Assertion")).join("\n").trim();   // the Windows libuv assertion at exit is noise
  if (/^\d{3}: |Failed to run/.test(out) || /^\d{3}: |Failed to run|SUPABASE_ACCESS_TOKEN/.test(err)) throw new Error(out || err);
  if (!out || out === "No rows.") return [];
  try { return JSON.parse(out); } catch { throw new Error(out || err || "sql failed"); }
}
const lit = (v) => dollar(JSON.stringify(v));
const fail = (m) => { console.error(m); process.exit(1); };
const table = (rows) => console.log(rows.length ? rows.map((r) => Object.values(r).join("  |  ")).join("\n") : "(none)");

const dims = () => sql("select key, kind, allowed from chatbot.segment_dimensions order by key");

async function main() {
  if (cmd === "dims") {
    if (sub === "add") {
      const [key, kind, list] = pos;
      if (!/^[a-z][a-z0-9_]{1,30}$/.test(key ?? "") || !["enum", "range"].includes(kind)) fail("usage: dims add <key> <enum|range> [a,b,c]");
      const allowed = kind === "enum" ? String(list ?? "").split(",").map((s) => s.trim()).filter(Boolean) : [];
      if (kind === "enum" && !allowed.length) fail("an enum needs its values: dims add <key> enum a,b,c");
      sql(`insert into chatbot.segment_dimensions (key, kind, allowed) values (${dollar(key)}, ${dollar(kind)}, ${lit(allowed)}::jsonb) on conflict (key) do update set kind = excluded.kind, allowed = excluded.allowed`);
      console.log(`dimension ${key} (${kind}) saved`);
    }
    return table(dims().map((d) => ({ key: d.key, kind: d.kind, allowed: JSON.stringify(d.allowed) })));
  }

  if (cmd === "research") {
    if (sub === "validate" || sub === "load") {
      const file = pos[0] ?? fail("usage: research " + sub + " <file.json>");
      let data;
      try { data = JSON.parse(readFileSync(file, "utf8")); } catch (e) { fail("הקובץ אינו JSON תקין: " + e.message); }
      const res = validateResearch(data, dims());
      for (const w of res.warnings) console.log("אזהרה: " + w);
      if (res.errors.length) { for (const e of res.errors) console.error("שגיאה: " + e); fail(`\n${res.errors.length} שגיאות. שום דבר לא נקלט.`); }
      console.log(`תקין: ${res.coverage.length} פרופילים`);
      table(res.coverage.map((c) => ({ topic: c.topic, segment: c.segment, evidence: c.evidence, fields: c.fields })));
      if (sub === "validate") return;
      const jt = data.version.journey_type ?? "pain";
      const profiles = data.profiles.map((p) => ({ topic_id: p.topic_id, segment_filters: p.segment ?? {}, title: p.title, profile: p.profile, summary: p.summary ?? buildSummary(p), evidence: p.evidence ?? null }));
      const out = sql(`
        with v as (insert into chatbot.content_versions (journey_type, label, source_name, status)
                   values (${dollar(jt)}, ${dollar(String(data.version.label))}, ${dollar(String(data.version.source_name ?? file))}, 'draft') returning id)
        insert into chatbot.research_profiles (content_version_id, topic_id, segment_filters, title, profile, summary, evidence)
        select v.id, r.topic_id, r.segment_filters, r.title, r.profile, r.summary, r.evidence
          from v, jsonb_to_recordset(${lit(profiles)}::jsonb) as r(topic_id text, segment_filters jsonb, title text, profile jsonb, summary text, evidence text)
        returning content_version_id`);
      console.log(`\nנקלטה גרסת טיוטה ${out[0]?.content_version_id} עם ${out.length} פרופילים. עדיין לא חיה.\nלהפעלה: node scripts/chatbot.mjs research activate ${out[0]?.content_version_id} --yes`);
      return;
    }
    if (sub === "list") {
      return table(sql(`select v.id, v.journey_type, v.label, v.status, v.created_at::date as created, count(p.id) as profiles from chatbot.content_versions v left join chatbot.research_profiles p on p.content_version_id = v.id group by v.id order by v.created_at desc`));
    }
    if (sub === "activate") {
      const id = pos[0] ?? fail("usage: research activate <versionId> --yes");
      const row = sql(`select id, journey_type, label, status from chatbot.content_versions where id::text = ${dollar(id)}`)[0] ?? fail("גרסה לא נמצאה");
      const n = sql(`select count(*)::int as n from chatbot.research_profiles where content_version_id = ${dollar(id)}::uuid`)[0].n;
      if (!n) fail("לגרסה אין פרופילים. לא מפעילים.");
      console.log(`הגרסה "${row.label}" (${row.journey_type}), ${n} פרופילים, תחליף את הפעילה כעת.`);
      if (!flags.yes) return console.log("להפעלה בפועל: להוסיף --yes");
      sql(`begin; update chatbot.content_versions set status = 'archived' where journey_type = ${dollar(row.journey_type)} and status = 'active';
           update chatbot.content_versions set status = 'active', published_at = now() where id = ${dollar(id)}::uuid; commit;`);
      return console.log("הגרסה פעילה. קמפיינים חדשים ושיחות חדשות ישתמשו בה.");
    }
  }

  if (cmd === "campaign") {
    if (sub === "create") {
      const business = flags.business ?? fail("--business חסר");
      const seg = {};
      if (flags.gender) seg.gender = flags.gender;
      for (const e of checkSegment(seg, dims())) fail("פילוח לא תקין: " + e);
      const id = flags.id ?? (flags.topic ? readableId(flags.topic, seg.gender) : campaignId());
      if (!validCampaignId(id)) fail("מזהה קמפיין לא תקין (a-z, 0-9, _ ו-, עד 39 תווים)");
      const topic = flags.topic ?? null;
      if (topic) {
        const hit = sql(`select p.title, p.evidence from chatbot.research_profiles p join chatbot.content_versions v on v.id = p.content_version_id
                         where v.status = 'active' and p.topic_id = ${dollar(topic)} and p.segment_filters <@ ${lit(seg)}::jsonb`)[0];
        if (!hit && !flags["allow-missing"]) fail(`אין פרופיל מחקר פעיל לנושא ${topic} ולפילוח ${segmentKey(seg)}. קודם קולטים ומפעילים גרסת מחקר, או מוסיפים --allow-missing כדי ליצור קמפיין בלי מחקר (שיחה כללית).`);
        if (hit) console.log(`נמצא פרופיל: ${hit.title} (ראיות ${hit.evidence ?? "?"})`);
      }
      const creative = flags.ad ? { ad: String(flags.ad) } : {};
      sql(`insert into chatbot.campaigns (id, business, journey_type, topic_id, segment_filters, status, creative, note)
           values (${dollar(id)}, ${dollar(business)}, 'pain', ${topic ? dollar(topic) : "null"}, ${lit(seg)}::jsonb, 'draft', ${lit(creative)}::jsonb, ${flags.note ? dollar(String(flags.note)) : "null"})`);
      console.log(`נוצרה טיוטת קמפיין ${id}. להפעלה: node scripts/chatbot.mjs campaign activate ${id}\nהקישור: ${campaignLink(business, topic ?? "", seg)}`);
      return;
    }
    if (sub === "activate" || sub === "pause") {
      const id = pos[0] ?? fail("usage: campaign " + sub + " <id>");
      const out = sql(`update chatbot.campaigns set status = ${dollar(sub === "activate" ? "active" : "paused")} where id = ${dollar(id)} returning id, business, topic_id, segment_filters`);
      if (!out.length) fail("קמפיין לא נמצא");
      return console.log(sub === "activate" ? `פעיל. הקישור: ${campaignLink(out[0].business, out[0].topic_id, out[0].segment_filters)}` : "הושהה. הנתונים נשמרו.");
    }
    if (sub === "list") return table(sql("select id, business, topic_id, segment_filters::text as segment, status, creative->>'ad' as ad from chatbot.campaigns order by created_at desc"));
  }

  if (cmd === "links") {
    const where = flags.business ? `and business = ${dollar(String(flags.business))}` : "";
    const rows = sql(`select id, business, topic_id, segment_filters, segment_filters::text as segment, creative->>'ad' as ad from chatbot.campaigns where status = 'active' ${where} order by business, topic_id, segment`);
    return console.log(rows.length ? rows.map((r) => `${campaignLink(r.business, r.topic_id, r.segment_filters)}\n   נושא: ${r.topic_id ?? "-"}  פילוח: ${r.segment}${r.ad ? `  מודעה: ${r.ad}` : ""}`).join("\n") : "אין קמפיינים פעילים.");
  }

  fail("פקודה לא מוכרת. ראו את ההערה בראש הקובץ.");
}
main().catch((e) => fail(e.message));
