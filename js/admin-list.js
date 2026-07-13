/* ==========================================================================
   FLOA — Admin: leads list
   טוען את כל הלידים, מציג אותם, ומאפשר חיפוש חופשי + סינון לפי סוג פתרון
   וסטטוס. לחיצה על ליד עוברת לדף הטיפול (lead.html?id=…).
   ========================================================================== */
import {
  guard, db, collection, getDocs, query, orderBy,
  normalizeLead, statusLabel, formatDate,
} from "./admin-core.js";

const el = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let allLeads = [];

const qInput = el("q");
const fHelp = el("fHelp");
const fStatus = el("fStatus");

guard(async () => {
  bindFilters();
  await loadLeads();
});

async function loadLeads() {
  el("loading").hidden = false;
  try {
    const snap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc")));
    allLeads = snap.docs.map((d) => normalizeLead(d.id, d.data()));
    populateHelpFilter();
    render();
  } catch (err) {
    console.error("FLOA admin: load failed —", err);
    el("loading").textContent = "טעינת הלידים נכשלה. ודאו שכללי האבטחה מעודכנים ושהחשבון מורשה.";
    return;
  }
  el("loading").hidden = true;
}

/* בונה את רשימת סוגי הפתרון מתוך הערכים שקיימים בפועל בנתונים */
function populateHelpFilter() {
  const values = [...new Set(allLeads.map((l) => l.help).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he"));
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v; opt.textContent = v;
    fHelp.appendChild(opt);
  }
}

function bindFilters() {
  [qInput, fHelp, fStatus].forEach((c) => c.addEventListener("input", render));
}

function matchesStatus(lead) {
  const f = fStatus.value;
  if (f === "all") return true;
  if (f === "active") return lead.status !== "done";
  return lead.status === f;
}

function matchesText(lead, needle) {
  if (!needle) return true;
  const hay = [lead.name, lead.phone, lead.business, lead.help, lead.improve].join(" ").toLowerCase();
  /* כל מילה בחיפוש חייבת להימצא — מאפשר "דני 052" וכד' */
  return needle.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function render() {
  const needle = qInput.value.trim();
  const helpVal = fHelp.value;
  const rows = allLeads.filter(
    (l) => matchesStatus(l) && (!helpVal || l.help === helpVal) && matchesText(l, needle)
  );

  el("count").textContent = rows.length
    ? `${rows.length} לידים${allLeads.length !== rows.length ? ` מתוך ${allLeads.length}` : ""}`
    : "";
  el("empty").hidden = rows.length !== 0;

  el("leads").innerHTML = rows.map(card).join("");
}

function card(l) {
  return `<li><a class="lead-card" href="lead.html?id=${encodeURIComponent(l.id)}">
    <div class="row1">
      <span class="name">${esc(l.name) || "ללא שם"}</span>
      ${l.business ? `<span class="biz">${esc(l.business)}</span>` : ""}
      <span class="pill ${l.status}">${statusLabel(l.status)}</span>
      <span class="when">${formatDate(l.createdAt)}</span>
    </div>
    <div class="meta">
      ${l.phone ? `<span><b>טלפון:</b> ${esc(l.phone)}</span>` : ""}
      ${l.help ? `<span><b>פתרון:</b> ${esc(l.help)}</span>` : ""}
    </div>
    ${l.improve ? `<p class="msg">${esc(l.improve)}</p>` : ""}
  </a></li>`;
}
