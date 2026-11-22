/* admin-kit.js (roster's own, p14_kit): the kit behaviours of the admin page. Loaded after admin.js.
   It talks to the page only through window.ROSTER_KIT.
     1. ADD BUTTON: the floating plus on the participants list (adding is typing the name into the search, so the plus puts the cursor there).
     2. PULL TO REFRESH on the participants list (the single scroll region of the page), never under a popup.
     There is no undo for deletes (owner 2026-11-18): a delete asks first where it matters and is final. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  var K = window.ROSTER_KIT;
  if (!K) return;

  /* every editor saves from the header as a check icon: its words become its tooltip and stay its name, and they follow the text the page sets ("שמירה", "יצירת מפגש", "הוספה") */
  function hsaveTitle(b) { var t = (b.textContent || "").trim(); if (t) { b.setAttribute("title", t); b.setAttribute("aria-label", t); } }
  Array.prototype.forEach.call(doc.querySelectorAll(".btn.hsave"), function (b) {
    hsaveTitle(b);
    new MutationObserver(function () { hsaveTitle(b); }).observe(b, { childList: true, characterData: true, subtree: true });
  });

  /* ---------- 1. add button ---------- */
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
      fab.addEventListener("click", function () { var an = doc.getElementById("addNew"); if (q.value.trim() && an) { an.click(); return; } q.placeholder = "שם משתתף חדש"; q.addEventListener("blur", function () { q.placeholder = " "; }, { once: true }); q.focus(); attention(); });   /* the hint lives in the field itself, short enough to fit */
      /* the plus has no form of its own: adding is typing the name in the search box, so the box announces it (a ring on its edge that breathes twice, cleared by the first key or when it ends) */
      var attention = function () {
        var box = q.closest(".hsearch"); if (!box) return;
        box.classList.remove("attn"); void box.offsetWidth; box.classList.add("attn");
        var off = function () { box.classList.remove("attn"); };
        q.addEventListener("input", off, { once: true }); box.addEventListener("animationend", function (e) { if (e.target === box) off(); }, { once: true });
        setTimeout(off, 2400);
      };
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

  /* ---------- 2. pull to refresh ---------- */
  if (list && window.RosterUI && RosterUI.ptr) {
    doc.documentElement.style.setProperty("--rptr-top", Math.round(list.getBoundingClientRect().top) + "px");
    RosterUI.ptr.attach({ scroller: list, onRefresh: function () { return K.load(true); }, enabled: function () { return !doc.querySelector("dialog[open]"); } });
  }

  /* the meetings of the participant card slide to "הסרה" too: the tray button carries data-mun, which the page's own click handler of that list already answers (the confirmation popup) */
  var pMeet = doc.getElementById("pMeetings");
  if (pMeet && window.RosterUI && RosterUI.swipe) RosterUI.swipe.init(pMeet, { onAway: function (dir) { if (window.rkPagerSwipe) window.rkPagerSwipe(dir); } });   // a swipe on a meeting card that is not the delete swipe changes the tab of the participant card

  /* ---------- 4. swipe actions on the participants list ---------- */
  /* a row slides to show "הסרה" (or "החזרה" for one already removed): the same remove and restore as the card. A mouse has no swipe:
     the card's own buttons are the path there. The first-use hint is the single system-wide one (rk.swipe.understood), shown only to a touch screen. */
  if (list && window.RosterUI && RosterUI.swipe && true) {
    var swipeCtl = RosterUI.swipe.init(list, { caption: "החלקה שמאלה מוחקת, החלקה ימינה שולחת וואטסאפ", both: true }), nudged = false, touch = (navigator.maxTouchPoints || 0) > 0;
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
      if (kind === "go") { var row0 = b.closest("li.row"), tile = row0 && row0.querySelector(".rowwa"); if (tile) tile.click(); return; }   // the card's own send / arrival action, now reached by pulling the card to the right
      if (kind === "unlink") { K.unlink(p); return; }   // inside a meeting: REMOVE from it, after a confirmation popup
      var run = function () { return K.quickActive(p, on).catch(function () { K.toast("הפעולה לא הצליחה"); }); };
      if (kind === "remove") K.askDelete(p, run); else run();   // everywhere else: DELETE, after a confirmation popup (a restore is direct)
    }, true);
  }
})();
