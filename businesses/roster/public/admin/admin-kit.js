/* admin-kit.js (roster's own, p14_kit): the kit behaviours of the admin page. Loaded after admin.js.
   It talks to the page only through window.ROSTER_KIT (two lines that the build adds to admin.js: the handles, and a call after every successful DELETE).
     1. UNDO FOR DELETES: every delete the page makes stays recoverable (the database moves a deleted row to roster_trash first), so the page offers "ביטול" in the shared
        undo toast: it finds what was just deleted (roster_trash_list) and puts it back (roster_restore). Deletes that come together (a meeting type with its meetings)
        are one toast and one undo. The page's own confirm windows stay as they are.
     2. ADD BUTTON: the floating plus on the participants list (adding is typing the name into the search, so the plus puts the cursor there).
     3. PULL TO REFRESH on the participants list (the single scroll region of the page), never under a popup. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
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

  /* every editor saves from the header as a check icon: its words become its tooltip and stay its name, and they follow the text the page sets ("שמירה", "יצירת מפגש", "הוספה") */
  function hsaveTitle(b) { var t = (b.textContent || "").trim(); if (t) { b.setAttribute("title", t); b.setAttribute("aria-label", t); } }
  Array.prototype.forEach.call(doc.querySelectorAll(".btn.hsave"), function (b) {
    hsaveTitle(b);
    new MutationObserver(function () { hsaveTitle(b); }).observe(b, { childList: true, characterData: true, subtree: true });
  });

  /* ---------- 2. add button ---------- */
  var PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  var list = doc.getElementById("list"), q = doc.getElementById("q"), fab = null;
  /* on a wide screen the list is one pane of two: the add button belongs to the pane, so it sits in the pane's bottom corner, not in the window's */
  function placeFab() {
    if (!fab || !list) return;
    var r = list.getBoundingClientRect();
    if (r.width > 0) fab.style.setProperty("--fab-left", Math.round(r.left + 16) + "px");   // 16 = the gutter token
  }
  window.addEventListener("resize", placeFab);
  function showFab() {
    if (!list || !q) return;
    var live = !doc.body.classList.contains("locked") && list.offsetParent !== null;
    if (live && !fab) {
      fab = doc.createElement("button"); fab.type = "button"; fab.className = "rfab"; fab.id = "kitFab";
      fab.setAttribute("aria-label", "הוספת משתתף"); fab.setAttribute("title", "הוספת משתתף"); fab.innerHTML = PLUS;
      /* one add button for the list: with a name typed in the search it adds that person (the list's own "add" row is hidden), without one it asks for the name */
      fab.addEventListener("click", function () { var an = doc.getElementById("addNew"); if (q.value.trim() && an) { an.click(); return; } q.focus(); K.toast("הקלידו את שם המשתתף החדש בחיפוש"); });
      var fabLabel = function () { var t = q.value.trim(), l = t ? "הוספת משתתף חדש: " + t : "הוספת משתתף"; fab.setAttribute("aria-label", l); fab.setAttribute("title", l); };
      q.addEventListener("input", fabLabel); fabLabel();
      doc.body.appendChild(fab);
    }
    if (fab) { fab.hidden = !live; placeFab(); }
  }
  new MutationObserver(showFab).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  showFab();
  /* the list may be hidden when this script runs (still loading) and nothing on the body changes when it appears: its own size change is the cue that it is now on screen */
  if (window.ResizeObserver && list) new ResizeObserver(showFab).observe(list);

  /* ---------- 3. pull to refresh ---------- */
  if (list && window.RosterUI && RosterUI.ptr) {
    RosterUI.ptr.attach({ scroller: list, onRefresh: function () { return K.load(true); }, enabled: function () { return !doc.querySelector("dialog[open]"); } });
  }

  /* ---------- 4. swipe actions on the participants list ---------- */
  /* a row slides to show "הסרה" (or "החזרה" for one already removed): the same remove and restore as the card, and the undo toast brings it back. A mouse has no swipe:
     the card's own buttons are the path there. The first-use hint is the single system-wide one (rk.swipe.understood), shown only to a touch screen. */
  if (list && window.RosterUI && RosterUI.swipe && window.RosterUndo) {
    var swipeCtl = RosterUI.swipe.init(list), nudged = false, touch = (navigator.maxTouchPoints || 0) > 0;
    var hintOn = function () {
      if (!touch || !list.querySelector("[data-swipe]") || list.querySelector(".rhint")) return;
      var c = swipeCtl.hint(false, nudged); if (c) nudged = true;   // the banner comes back after a redraw of the list, the nudge of the first row only once
    };
    new MutationObserver(hintOn).observe(list, { childList: true });
    hintOn();
    list.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-swipe-act]"); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var id = b.getAttribute("data-id"), p = K.partOf(id), on = b.getAttribute("data-swipe-act") === "restore";
      if (!p) return;
      swipeCtl.close();
      var kind = b.getAttribute("data-swipe-act");
      if (kind === "unlink") { K.unlink(p); return; }   // inside a meeting: REMOVE from it, after a confirmation popup
      var run = function () { return K.quickActive(p, on).then(function () {
        window.RosterUndo.delete({
          kind: "person", itemId: id, label: (on ? "הוחזר: " : "נמחק: ") + p.name,
          onUndo: function () { return K.quickActive(p, !on); },
          onCommit: function () { /* already done: the window only offers the way back */ },
        });
      }).catch(function () { K.toast("הפעולה לא הצליחה"); }); };
      if (kind === "remove") K.askDelete(p, run); else run();   // everywhere else: DELETE, after a confirmation popup (a restore is direct)
    }, true);
  }
})();
