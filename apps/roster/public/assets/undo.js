/* Roster delete helper: ONE shared behavior for EVERY delete (swipe, three-dots menu, card, popup list). There is NO undo (owner 2026-11-18):
   a delete is final the moment the page's own confirmation says yes, and the page asks first where it matters.
     RosterUndo.delete({ kind, itemId, label, onUndo, onCommit, onFail, failText })
   The page hides the item at once and calls this; onCommit (the REAL delete) runs immediately. If it fails, onFail (or onUndo) shows the item again and a short
   message says so. The name is kept so the pages that call it do not change; there is no toast, no timer and no Ctrl+Z.
   RosterUndo.isPending(kind, itemId): true while a commit is still on its way (a refresh must keep such an item hidden).
   Leaving the page while a commit is on its way is safe: it was already sent. The look of the failure message is ui.css (.rtoasts, .rmsg). */
(function () {
  "use strict";
  var doc = document;
  var inflight = [];
  var box = null;

  function topDialog() { var all = doc.querySelectorAll("dialog[open]"); return all.length ? all[all.length - 1] : null; }
  /* while a modal popup is open everything outside it is inert: the failure message lives inside the topmost popup */
  function host() {
    if (!box) {
      box = doc.createElement("div");
      box.className = "rtoasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
    }
    var d = topDialog();
    if (d && box.parentNode !== d) { d.appendChild(box); box.classList.add("rtoasts--in"); }
    else if (!d && box.parentNode !== doc.body) { doc.body.appendChild(box); box.classList.remove("rtoasts--in"); }
    return box;
  }
  doc.addEventListener("close", function (e) { if (box && e.target && e.target.nodeName === "DIALOG" && e.target.contains(box)) { doc.body.appendChild(box); box.classList.remove("rtoasts--in"); } }, true);

  function failMsg(text) {
    var m = doc.createElement("div");
    m.className = "rmsg rmsg--no"; m.textContent = text;
    host().appendChild(m);
    setTimeout(function () { m.remove(); }, 4000);
  }
  function remove(rec) { var i = inflight.indexOf(rec); if (i > -1) inflight.splice(i, 1); }

  function del(opt) {
    var rec = { kind: opt.kind || "", itemId: String(opt.itemId == null ? "" : opt.itemId) };
    inflight.push(rec);
    var fail = function () {
      remove(rec);
      try { if (opt.onFail) opt.onFail(); else if (opt.onUndo) opt.onUndo(); } catch (e) { /* the page's problem */ }
      failMsg(opt.failText || "המחיקה לא הושלמה, הפריט חזר.");
    };
    try {
      var r = opt.onCommit ? opt.onCommit({ keepalive: false }) : null;
      if (r && typeof r.then === "function") r.then(function () { remove(rec); }, fail); else remove(rec);
    } catch (e) { fail(); }
    return { cancel: function () {}, commit: function () {} };
  }

  window.RosterUndo = {
    delete: del,
    isPending: function (kind, itemId) {
      var id = String(itemId == null ? "" : itemId);
      return inflight.some(function (r) { return r.kind === kind && r.itemId === id; });
    },
    pendingCount: function () { return 0; },
    commitAll: function () {},
  };
})();
