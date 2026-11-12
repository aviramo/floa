/* admin-kit.js (roster's own, p14_kit): the kit behaviours of the admin page. Loaded after admin.js; does nothing unless <html data-kit="1">.
   It talks to the page only through window.ROSTER_KIT (two lines that the build adds to admin.js: the handles, and a call after every successful DELETE).
     1. UNDO FOR DELETES: every delete the page makes stays recoverable (the database moves a deleted row to roster_trash first), so the page offers "ביטול" in the shared
        undo toast: it finds what was just deleted (roster_trash_list) and puts it back (roster_restore). Deletes that come together (a meeting type with its meetings)
        are one toast and one undo. The page's own confirm windows stay as they are.
     2. ADD BUTTON: the floating plus on the participants list (adding is typing the name into the search, so the plus puts the cursor there).
     3. PULL TO REFRESH on the participants list (the single scroll region of the page), never under a popup. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  if (root.getAttribute("data-kit") !== "1") return;
  var K = window.ROSTER_KIT;
  if (!K) return;

  /* ---------- 1. undo for deletes ---------- */
  var KIND = { roster_notes: "note", roster_meetings: "meeting", roster_payments: "payment", roster_attendance: "attendance", roster_meeting_types: "meeting_type",
    roster_pay_methods: "pay_method", roster_statuses: "status", roster_promoters: "promoter", roster_promoter_payments: "promoter_payment", roster_finance: "finance",
    roster_finance_recurring: "finance_recurring", roster_finance_transfers: "finance_transfer", roster_msg_templates: "msg_template" };
  var batch = [], timer = 0;
  K.deleted = function (table) {
    var kind = KIND[table];
    if (!kind || !window.RosterUndo) return;
    batch.push(kind);
    clearTimeout(timer);
    timer = setTimeout(flush, 350);   // deletes of one action (a type and its meetings) arrive together
  };
  function flush() {
    var kinds = batch.slice(); batch = [];
    K.api("rpc/roster_trash_list", { method: "POST", body: {}, ui: false }).then(function (rows) {
      if (!Array.isArray(rows)) return;
      var need = {}, ids = [], labels = [];
      kinds.forEach(function (k) { need[k] = (need[k] || 0) + 1; });
      rows.slice().sort(function (a, b) { return String(b.deleted_at).localeCompare(String(a.deleted_at)); }).forEach(function (r) {
        if (r.source === "inactive" || !need[r.kind]) return;
        need[r.kind]--; ids.push({ kind: r.kind, id: r.trash_id }); if (r.label) labels.push(r.label);
      });
      if (!ids.length) return;
      var label = ids.length === 1 && labels[0] ? "נמחק: " + labels[0] : "נמחק";
      window.RosterUndo.delete({
        kind: "admin", itemId: ids.map(function (x) { return x.id; }).join(","), label: label,
        onUndo: function () { return restore(ids); },
        onCommit: function () { /* it is already deleted: the window only offers the way back */ },
      });
    }).catch(function () { /* no undo offered: the delete itself went through */ });
  }
  function restore(ids) {
    /* the last delete first: a type comes back before the meetings that hung on it */
    var chain = Promise.resolve(), bad = 0;
    ids.forEach(function (x) {   // ids is newest first: the last deleted (the type) is restored first
      chain = chain.then(function () { return K.api("rpc/roster_restore", { method: "POST", body: { p_kind: x.kind, p_id: x.id }, ui: false }); })
        .then(function (r) { if (!r || (r.status !== "ok")) bad++; }, function () { bad++; });
    });
    return chain.then(function () { K.toast(bad ? "לא הכול הוחזר" : "הוחזר"); return K.load(true); });
  }

  /* the meeting type editor saves from the header: as an icon it needs its words as a title */
  var ty = doc.getElementById("tySave");
  if (ty) { ty.setAttribute("title", "שמירה"); ty.setAttribute("aria-label", "שמירה"); }

  /* ---------- 2. add button ---------- */
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var list = doc.getElementById("list"), q = doc.getElementById("q"), fab = null;
  function showFab() {
    if (!list || !q) return;
    var live = !doc.body.classList.contains("locked") && list.offsetParent !== null;
    if (live && !fab) {
      fab = doc.createElement("button"); fab.type = "button"; fab.className = "rfab"; fab.id = "kitFab";
      fab.setAttribute("aria-label", "הוספת משתתף"); fab.setAttribute("title", "הוספת משתתף"); fab.innerHTML = PLUS;
      fab.addEventListener("click", function () { q.focus(); K.toast("הקלידו את שם המשתתף החדש בחיפוש"); });
      doc.body.appendChild(fab);
    }
    if (fab) fab.hidden = !live;
  }
  new MutationObserver(showFab).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  showFab();

  /* ---------- 3. pull to refresh ---------- */
  if (list && window.RosterUI && RosterUI.ptr) {
    RosterUI.ptr.attach({ scroller: list, onRefresh: function () { return K.load(true); }, enabled: function () { return !doc.querySelector("dialog[open]"); } });
  }
})();
