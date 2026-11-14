/* Roster undo toast: ONE shared behavior for EVERY delete (swipe, three-dots menu, card, popup list). Catalog: "Undo toast (delayed delete)".
     RosterUndo.delete({ kind, itemId, label, duration, heavy, onUndo, onCommit, onFail })
   The page hides the item at once and calls this. A toast "<label>" with a "ביטול" action stays for `duration` ms (default 6000, 10000 when heavy);
   the REAL delete (onCommit) runs only when the time ends, so even a delete that could not be restored later can be cancelled in that window.
   "ביטול" calls onUndo (the page shows the item again) and nothing is ever sent. If onCommit fails, onUndo runs and a message says so.
   Several deletions at once: each keeps its own timer and its own cancel; at most three toasts show, older ones merge into "נמחקו N פריטים" with "ביטול הכל".
   Leaving the page (pagehide, tab hidden): every pending delete is committed at once with { keepalive: true }, so the request survives the page.
   RosterUndo.isPending(kind, itemId): true while the window is open or the commit is still on its way (a refresh must keep such an item hidden).
   The timer pauses while a toast is hovered, focused or touched; Ctrl+Z cancels the newest pending delete while no text field has focus.
   No inline handlers, no framework, no business names; the look is ui.css (.rtoasts, .rmsg, .rmsg--undo). */
(function () {
  "use strict";
  var doc = document;
  var pending = [];      /* open windows, oldest first */
  var inflight = [];     /* committing */
  var box = null, seq = 0, raf = 0;
  var MAX = 3;
  var reduced = function () { return !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
  var now = function () { return Date.now(); };

  /* While a modal popup is open everything outside it is inert, so a toast on the page could not be pressed ("ביטול" inside the popup that just removed something).
     The toast box therefore lives INSIDE the topmost open popup (and goes back to the page when it closes). */
  function topDialog() { var all = doc.querySelectorAll("dialog[open]"); return all.length ? all[all.length - 1] : null; }
  function place() {
    if (!box) return;
    var d = topDialog();
    if (d && box.parentNode !== d) { d.appendChild(box); box.classList.add("rtoasts--in"); }
    else if (!d && box.parentNode !== doc.body) { doc.body.appendChild(box); box.classList.remove("rtoasts--in"); }
  }
  function host() {
    if (!box) {
      box = doc.createElement("div");
      box.className = "rtoasts";
      box.setAttribute("role", "status");
      box.setAttribute("aria-live", "polite");
      doc.body.appendChild(box);
    }
    place();
    return box;
  }
  /* a popup closing takes the box out of it before the page clears the popup's content; a popup opening takes it in */
  doc.addEventListener("close", function (e) { if (box && e.target && e.target.nodeName === "DIALOG" && e.target.contains(box)) { doc.body.appendChild(box); box.classList.remove("rtoasts--in"); setTimeout(place, 0); } }, true);
  new MutationObserver(function () { place(); }).observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });

  function arm(rec) {
    clearTimeout(rec.timer);
    rec.deadline = now() + rec.left;
    rec.timer = setTimeout(function () { commit(rec, false); }, rec.left);
  }
  function pause(rec) {
    if (rec.paused || rec.done) return;
    rec.paused = true; clearTimeout(rec.timer);
    rec.left = Math.max(0, rec.deadline - now());
    if (rec.el) rec.el.setAttribute("data-paused", "true");
  }
  function resume(rec) {
    if (!rec.paused || rec.done) return;
    rec.paused = false;
    if (rec.el) rec.el.removeAttribute("data-paused");
    arm(rec);
  }

  function remove(list, rec) { var i = list.indexOf(rec); if (i > -1) list.splice(i, 1); }

  function undo(rec) {
    if (rec.done) return;
    rec.done = true; clearTimeout(rec.timer); remove(pending, rec);
    try { if (rec.onUndo) rec.onUndo(); } catch (e) { /* the page's problem */ }
    render();
  }

  function failMsg(rec) {
    var m = doc.createElement("div");
    m.className = "rmsg rmsg--no"; m.textContent = rec.failText;
    host().appendChild(m);
    setTimeout(function () { m.remove(); }, 4000);
  }

  function commit(rec, keepalive) {
    if (rec.done) return;
    rec.done = true; clearTimeout(rec.timer); remove(pending, rec);
    inflight.push(rec);
    var finish = function () { remove(inflight, rec); };
    var fail = function () { finish(); try { if (rec.onFail) rec.onFail(); else if (rec.onUndo) rec.onUndo(); } catch (e) { /* the page's problem */ } failMsg(rec); };
    try {
      var r = rec.onCommit ? rec.onCommit({ keepalive: !!keepalive }) : null;
      if (r && typeof r.then === "function") r.then(finish, fail); else finish();
    } catch (e) { fail(); }
    render();
  }

  function el(rec, text, actLabel, onAct) {
    var d = doc.createElement("div");
    d.className = "rmsg rmsg--undo";
    d.setAttribute("data-undo", String(rec ? rec.id : "all"));
    var t = doc.createElement("span"); t.className = "rmsg__text"; t.textContent = text; d.appendChild(t);
    var b = doc.createElement("button"); b.type = "button"; b.className = "rmsg__act"; b.textContent = actLabel; d.appendChild(b);
    b.addEventListener("click", onAct);
    return d;
  }

  function render() {
    var b = host();
    b.textContent = "";
    var vis = pending.slice(), merged = [];
    if (vis.length > MAX) { merged = vis.slice(0, vis.length - (MAX - 1)); vis = vis.slice(vis.length - (MAX - 1)); }
    if (merged.length) {
      var s = el(null, "נמחקו " + (merged.length) + " פריטים", "ביטול הכל", function () { merged.slice().forEach(undo); });
      s.setAttribute("data-undo", "summary");
      merged.forEach(function (r) { r.el = s; });
      b.appendChild(s);
      bind(s, merged);
    }
    vis.forEach(function (rec) {
      var d = el(rec, rec.label, "ביטול", function () { undo(rec); });
      rec.el = d; b.appendChild(d);
      bind(d, [rec]);
    });
    if (!pending.length && !b.children.length) return;
    tick();
  }
  function bind(node, recs) {
    var p = function () { recs.forEach(pause); }, r = function () { recs.forEach(resume); };
    node.addEventListener("mouseenter", p); node.addEventListener("mouseleave", r);
    node.addEventListener("focusin", p); node.addEventListener("focusout", r);
    node.addEventListener("touchstart", p, { passive: true }); node.addEventListener("touchend", r); node.addEventListener("touchcancel", r);
  }

  /* the thin progress line: --left is the share of time left (scaleX only) */
  function tick() {
    if (reduced() || raf) return;
    raf = requestAnimationFrame(function loop() {
      raf = 0;
      var live = false;
      pending.forEach(function (rec) {
        if (!rec.el) return;
        var left = rec.paused ? rec.left : Math.max(0, rec.deadline - now());
        rec.el.style.setProperty("--left", String(Math.max(0, Math.min(1, left / rec.duration))));
        live = true;
      });
      if (live) raf = requestAnimationFrame(loop);
    });
  }

  function del(opt) {
    var rec = {
      id: ++seq, kind: opt.kind || "", itemId: String(opt.itemId == null ? "" : opt.itemId),
      label: opt.label || "נמחק", duration: opt.duration || (opt.heavy ? 10000 : 6000),
      onUndo: opt.onUndo, onCommit: opt.onCommit, onFail: opt.onFail, failText: opt.failText || "המחיקה לא הושלמה, הפריט חזר.",
      paused: false, done: false, el: null,
    };
    rec.left = rec.duration;
    pending.push(rec);
    arm(rec);
    render();
    return { cancel: function () { undo(rec); }, commit: function () { commit(rec, false); } };
  }

  function commitAll(keepalive) { pending.slice().forEach(function (r) { commit(r, keepalive); }); }

  window.addEventListener("pagehide", function () { commitAll(true); });
  doc.addEventListener("visibilitychange", function () { if (doc.visibilityState === "hidden") commitAll(true); });
  doc.addEventListener("keydown", function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || !pending.length) return;
    var a = doc.activeElement;
    if (a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable)) return;
    e.preventDefault();
    undo(pending[pending.length - 1]);
  });

  window.RosterUndo = {
    delete: del,
    isPending: function (kind, itemId) {
      var id = String(itemId == null ? "" : itemId);
      function hit(r) { return r.kind === kind && r.itemId === id; }
      return pending.some(hit) || inflight.some(hit);
    },
    pendingCount: function () { return pending.length; },
    commitAll: commitAll,
  };
})();
