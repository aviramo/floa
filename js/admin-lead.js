/* ==========================================================================
   FLOA — Admin: single lead
   מציג את כל השדות שהמשתמש מילא, ומאפשר לעדכן סטטוס והערות פנימיות.
   ========================================================================== */
import {
  guard, db, doc, getDoc, updateDoc, serverTimestamp,
  normalizeLead, formatDate, telHref, waHref, STATUSES,
} from "./admin-core.js";

const el = (id) => document.getElementById(id);
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const id = new URLSearchParams(location.search).get("id");
let lead = null;

guard(async (user) => {
  el("status").innerHTML = STATUSES.map((s) => `<option value="${s.value}">${s.label}</option>`).join("");
  await load(user);
});

async function load(user) {
  if (!id) return notFound();
  try {
    const snap = await getDoc(doc(db, "leads", id));
    if (!snap.exists()) return notFound();
    lead = normalizeLead(snap.id, snap.data());
  } catch (err) {
    console.error("FLOA admin: lead load failed —", err);
    return notFound();
  }
  el("loading").hidden = true;
  el("detail").hidden = false;
  renderFields();
  el("status").value = lead.status;
  el("notes").value = lead.notes;
  renderHandledMeta();
  el("saveBtn").addEventListener("click", () => save(user));
}

function notFound() {
  el("loading").hidden = true;
  el("notfound").hidden = false;
}

function row(k, vHtml) {
  return `<div class="field-row"><div class="k">${k}</div><div class="v">${vHtml}</div></div>`;
}

function renderFields() {
  const tel = telHref(lead.phone);
  const wa = waHref(lead.phone);
  const phoneHtml = lead.phone
    ? `${esc(lead.phone)} &nbsp; ${tel ? `<a href="tel:${tel}">חיוג</a>` : ""}${wa ? ` · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ""}`
    : "—";

  el("fields").innerHTML = [
    row("שם מלא", esc(lead.name) || "—"),
    row("טלפון", phoneHtml),
    row("שם העסק", esc(lead.business) || "—"),
    row("סוג הפתרון המבוקש", esc(lead.help) || "—"),
    `<div class="field-row"><div class="k">הבקשה</div><div class="v msg">${esc(lead.improve) || "—"}</div></div>`,
    row("התקבל", formatDate(lead.createdAt)),
    row("מקור", esc(lead.source) || "—"),
  ].join("");

  el("quickActions").innerHTML =
    (tel ? `<a class="a-btn sm" href="tel:${tel}">חיוג</a>` : "") +
    (wa ? `<a class="a-btn sm" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : "");
}

function renderHandledMeta() {
  el("handledMeta").textContent = lead.handledAt
    ? `עודכן לאחרונה: ${formatDate(lead.handledAt)}${lead.handledBy ? ` · ${lead.handledBy}` : ""}`
    : "";
}

async function save(user) {
  const btn = el("saveBtn");
  const note = el("savedNote");
  btn.disabled = true; note.hidden = true;
  try {
    await updateDoc(doc(db, "leads", id), {
      status: el("status").value,
      notes: el("notes").value.slice(0, 4000),
      handledAt: serverTimestamp(),
      handledBy: user.email,
    });
    lead.status = el("status").value;
    lead.handledBy = user.email;
    lead.handledAt = new Date();
    renderHandledMeta();
    note.hidden = false;
    setTimeout(() => { note.hidden = true; }, 2500);
  } catch (err) {
    console.error("FLOA admin: save failed —", err);
    alert("השמירה נכשלה. ודאו שכללי האבטחה מתירים עדכון למנהלים.");
  }
  btn.disabled = false;
}
