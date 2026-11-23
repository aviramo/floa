/* Pure helpers of the chatbot operations tool (scripts/chatbot.mjs): no network, no database, so they can be tested for free.
   The research file, the segments and the campaign links all pass through here before anything touches production. */

export const GRADES = ["A", "B", "C", "D"];
export const BASE = "https://chatbot.floa.co.il";

/* The fields of one research profile (spec 22.2). Only title and at least one content field are required: a field the source
   does not have stays absent and is never filled in by guessing ("not in source"). */
export const FIELDS = {
  description: "תיאור הכאב",
  frequency: "שכיחות ואיכות הנתונים",
  visible: "ביטויים גלויים",
  hidden: "ביטויים סמויים",
  why_hidden: "סיבות להסתרה",
  triggers_pain: "טריגרים לכאב",
  triggers_change: "טריגרים לשינוי",
  triggers_trial: "טריגרים להתנסות",
  coping: "דרכי התמודדות",
  effectiveness: "אפקטיביות של דרכי ההתמודדות",
  desires: "רצונות וצרכים",
  biodanza: "תרומה אפשרית של ביודנסה",
  exercises: "תרגילים רלוונטיים",
  experiences: "חוויות אפשריות",
  concerns: "חששות",
  grounding: "ביסוס (מחקר, ניסיון, השערה)",
};

const stable = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
export const segmentKey = (seg) => stable(seg ?? {});
export const slug = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

/* dims: [{key, kind:'enum'|'range', allowed:[...]}] as in chatbot.segment_dimensions */
export function checkSegment(seg, dims) {
  const errors = [];
  for (const [k, v] of Object.entries(seg ?? {})) {
    const d = dims.find((x) => x.key === k);
    if (!d) { errors.push(`ממד פילוח לא מוכר: ${k}`); continue; }
    if (d.kind === "enum" && !(d.allowed ?? []).includes(v)) errors.push(`${k}=${JSON.stringify(v)} לא ברשימה המותרת (${(d.allowed ?? []).join(", ")})`);
    if (d.kind === "range" && !(v && typeof v === "object" && ("lte" in v || "gte" in v))) errors.push(`${k} חייב להיות טווח עם lte או gte`);
  }
  return errors;
}

/* A research file: { version: {label, source_name, journey_type}, profiles: [{topic_id, segment, title, evidence, profile:{...}, summary?}] } */
export function validateResearch(file, dims) {
  const errors = [], warnings = [];
  if (!file || typeof file !== "object") return { errors: ["הקובץ אינו אובייקט JSON"], warnings, coverage: [] };
  if (!file.version?.label) errors.push("חסר version.label");
  if (!Array.isArray(file.profiles) || !file.profiles.length) return { errors: [...errors, "אין פרופילים"], warnings, coverage: [] };
  const seen = new Map(), coverage = [];
  file.profiles.forEach((p, i) => {
    const at = `פרופיל ${i + 1}${p?.topic_id ? ` (${p.topic_id})` : ""}`;
    if (!p || typeof p !== "object") { errors.push(`${at}: אינו אובייקט`); return; }
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(p.topic_id ?? "")) errors.push(`${at}: topic_id חייב להיות מזהה באנגלית קטנה (a-z, 0-9, _)`);
    if (!p.title) errors.push(`${at}: חסרה כותרת`);
    if (p.evidence != null && !GRADES.includes(p.evidence)) errors.push(`${at}: רמת ראיות חייבת להיות A, B, C או D`);
    if (p.evidence == null) warnings.push(`${at}: אין רמת ראיות`);
    for (const e of checkSegment(p.segment, dims)) errors.push(`${at}: ${e}`);
    const content = Object.keys(p.profile ?? {}).filter((k) => FIELDS[k] && String(JSON.stringify(p.profile[k])).length > 2);
    if (!content.length) errors.push(`${at}: אין שדות תוכן`);
    for (const k of Object.keys(p.profile ?? {})) if (!FIELDS[k]) warnings.push(`${at}: שדה לא מוכר "${k}" לא ייכנס לתקציר`);
    const key = `${p.topic_id}|${segmentKey(p.segment)}`;
    if (seen.has(key)) errors.push(`${at}: כפילות עם פרופיל ${seen.get(key)} (אותו נושא ואותו פילוח)`); else seen.set(key, i + 1);
    // text that may reach a visitor must not carry the long dashes the site forbids
    if (/[—–]/.test(JSON.stringify(p.profile ?? {}) + (p.title ?? ""))) warnings.push(`${at}: מקף ארוך בטקסט (התשובות מנוקות, אבל עדיף לתקן במקור)`);
    coverage.push({ topic: p.topic_id, segment: segmentKey(p.segment), evidence: p.evidence ?? "-", fields: content.length });
  });
  return { errors, warnings, coverage };
}

const flat = (v) => (Array.isArray(v) ? v.map(flat).join("; ") : v && typeof v === "object" ? Object.values(v).map(flat).join("; ") : String(v ?? ""));

/* The short brief a session receives (spec 22.3: about 400-700 tokens, so roughly 1200-2400 Hebrew characters). */
export function buildSummary(p, max = 2400) {
  const order = ["description", "visible", "hidden", "why_hidden", "triggers_pain", "triggers_change", "triggers_trial", "coping", "effectiveness", "desires", "biodanza", "concerns", "grounding", "frequency", "exercises", "experiences"];
  const parts = [];
  for (const k of order) {
    const v = flat(p.profile?.[k]).replace(/\s+/g, " ").trim();
    if (v) parts.push(`${FIELDS[k]}: ${v}`);
  }
  let out = parts.join("\n");
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}

export function campaignId() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "c";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += a[b % a.length];
  return s;
}

export const validCampaignId = (id) => /^[a-z0-9][a-z0-9_-]{1,38}$/.test(id ?? "");
export const campaignLink = (business, id) => `${BASE}/${business}?pain=${encodeURIComponent(id)}`;

/* A SQL string literal that cannot be broken out of by the content (dollar quoting with a tag the content does not contain) */
export function dollar(text) {
  let tag = "q", n = 0;
  while (text.includes(`$${tag}$`)) tag = "q" + ++n;
  return `$${tag}$${text}$${tag}$`;
}
