/* =====================================================================
   Roster, the owner's layer (/roster/).

   Signing in is the domain's, not this page's: /auth.js (FLOA_AUTH), the same
   for every app on floa.co.il. This page only decides what the person sees:

     not signed in                  the gate
     owner ("super admin")          the MANAGER: businesses, and for each one the
                                    Google accounts that belong to it
     not owner, no business         a calm "not connected yet" screen
     not owner, one business        straight to that business's participants
     not owner, several             a plain picker

   The database does the real gatekeeping (RLS). Nothing here is trusted: it
   only chooses what to draw. Any call that rejects with `.signedOut` sends the
   person back to the gate.

   Phase 2 of the design rollout: every element is the KIT's (assets/ui.css, ui.js, undo.js), the popup is the one shell (sheet.js), the field is
   the one field (field.js). Deleting anything is cancellable (RosterUndo, delayed commit) and nothing is really lost: the database keeps what was
   deleted in the trash (roster_trash_list / roster_restore / roster_purge), shown on the "נמחקו לאחרונה" screen.

   The PAGE never scrolls. The header stays, and only the list inside its own
   box scrolls; a popup scrolls inside itself.
   ===================================================================== */
(function () {
  "use strict";

  /* Never inside somebody else's frame (a transparent frame over a "delete" button): hide, and do nothing. */
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  var A = window.FLOA_AUTH;
  var TITLE = "ניהול משתתפים";
  var MANY = 7;                                   /* above this many businesses the list gets a search field */
  var SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
  /* names of the folders under /roster/: a business with one of them as its identifier would never be reached (the database refuses them too) */
  var RESERVED = ["admin", "connect", "me", "api", "assets", "new", "index"];
  var MAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;
  var HEAVY_MS = 10000;                           /* the undo window of a heavy delete (the light ones use the default 6 seconds) */

  /* Every message the person can read. A raw error never reaches the screen. */
  var T = {
    generic: "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב בעוד רגע.",
    loadFail: "לא הצלחנו לטעון. בדקו את החיבור ונסו שוב.",
    expired: "ההתחברות פגה. צריך להיכנס שוב.",
    noAuth: "לא הצלחנו לטעון את מערכת הכניסה. נסו לרענן את הדף.",
    nameEmpty: "צריך לכתוב שם לעסק.",
    nameLong: "השם ארוך מדי. עד 80 תווים.",
    slugEmpty: "צריך לכתוב מזהה לעסק.",
    slugLen: "המזהה צריך להיות באורך של 2 עד 40 תווים.",
    slugStart: "המזהה צריך להתחיל באות לטינית.",
    slugChars: "במזהה אפשר רק אותיות לטיניות קטנות, ספרות ומקפים.",
    slugTaken: "כבר יש עסק עם המזהה הזה. כדאי לבחור מזהה אחר.",
    slugReserved: "המזהה הזה שמור למערכת. כדאי לבחור מזהה אחר.",
    slugFree: "המזהה פנוי.",
    dispLong: "השם שהמשתתפים רואים יכול להיות עד 60 תווים.",
    mailEmpty: "צריך לכתוב כתובת מייל של חשבון Google.",
    mailBad: "כתובת המייל לא נראית תקינה.",
    mailTaken: "החשבון הזה כבר מחובר לעסק.",
    restored: "שוחזר.",
    conflict: "אי אפשר לשחזר: יש כבר משהו עם אותם פרטים, או שהפריט שהוא שייך אליו עדיין נמחק.",
    purged: "נמחק לצמיתות.",
  };

  /* what the trash calls things */
  var KIND = {
    business: "עסק", participant: "משתתף", meeting: "מפגש", meeting_type: "סוג מפגש", attendance: "הרשמה למפגש", note: "הערה", payment: "תשלום",
    promoter: "שיווק ממומן", promoter_payment: "תשלום לשיווק", status: "תגית", pay_method: "דרך תשלום", msg_template: "תבנית הודעה", mail_template: "תבנית מייל",
    pass_request: "בקשת כרטיסייה", finance: "תנועה כספית", finance_recurring: "תנועה חוזרת", finance_transfer: "העברה בין מנהלים", business_user: "חשבון",
    member: "חשבון מחובר", api_key: "מפתח", msg_sent: "סימון שליחה", business_settings: "הגדרות", admin_pref: "העדפות",
  };

  /* ---------- small helpers ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  var ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ENT[c]; }); }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function lc(s) { return String(s || "").trim().toLowerCase(); }
  function bizCount(n) { return n === 0 ? "אין עסקים" : n === 1 ? "עסק אחד" : n + " עסקים"; }
  function accCount(n) { return n === 0 ? "אין חשבונות" : n === 1 ? "חשבון אחד" : n + " חשבונות"; }

  var ICONS = {
    plus: ["s", '<path d="M12 5v14"/><path d="M5 12h14"/>'],
    edit: ["s", '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 7l3 3"/>'],
    trash: ["s", '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>'],
    users: ["s", '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.4c1.9.7 3 2.5 3 5.6"/>'],
    logout: ["s", '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4M19 12H9"/>'],
    go: ["s", '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'],
    dots: ["f", '<circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/>'],
    x: ["s", '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'],
    restore: ["s", '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'],
    help: ["s", '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/>'],
  };
  function icon(n, cls) {
    var x = ICONS[n];
    return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" ' +
      (x[0] === "f" ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"') +
      ' aria-hidden="true">' + x[1] + "</svg>";
  }

  /* ---------- state ---------- */
  var gate = $("#gate"), wrap = $("#wrap"), view = $("#view"), menu = $("#menu"), dlg = $("#dlg"), dlgC = $("#dlgC");
  RosterSheet.attach(dlg);    /* the one popup shell (assets/sheet.js): square, grab bar, swipe to close, page locked behind, inner scroll */
  RosterSheet.attach(dlgC);   /* the small confirmation window, opened above the other one */
  function blank() { return { isSuper: false, biz: [], users: {}, q: "" }; }
  var S = blank();
  var epoch = 0;            /* bumped on every sign-out, so a late answer cannot repaint someone else's data */
  var ctx = null;           /* the open dialog's context */
  var afterClose = null;    /* where focus goes when the dialog closes */
  var afterCloseC = null;
  var menuBtn = null, menuId = "";
  var toastTimer = 0;
  var ptrCtl = null, swipeCtl = null, swipeEl = null;

  function byId(id) { for (var i = 0; i < S.biz.length; i++) if (S.biz[i].id === id) return S.biz[i]; return null; }
  function setView(html) { view.innerHTML = html; }
  function setCount(text) { var c = $("#count"); c.textContent = text || ""; c.hidden = !text; }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.hidden = false;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); t.hidden = true; }, 2800);
  }

  /* ---------- the database, as the person ---------- */
  function api(path, opts) {
    return A.api(path, opts).catch(function (e) {
      if (e && e.signedOut) showGate(T.expired);
      throw e;
    });
  }
  /* The same, with what FLOA_AUTH.api does not offer: a business header (the trash of ONE business) and keepalive (a delete committed while the page closes). */
  function rest(path, opts) {
    opts = opts || {};
    var cfg = window.SUPABASE || {};
    return A.token().then(function (t) {
      var h = { apikey: cfg.anonKey, authorization: "Bearer " + t };
      if (opts.json !== undefined) h["content-type"] = "application/json";
      if (opts.prefer) h.prefer = opts.prefer;
      if (opts.biz) h["x-business"] = opts.biz;
      return fetch(cfg.url + path, { method: opts.method || "GET", headers: h, body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined, keepalive: !!opts.keepalive });
    }).then(function (r) {
      if (r.status === 401) { var e0 = new Error("signed out"); e0.signedOut = true; showGate(T.expired); throw e0; }
      if (!r.ok) { var e = new Error("request failed " + r.status); e.status = r.status; throw e; }
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  /* Only a conflict has words of its own; everything else is one calm sentence. */
  function problem(e, conflict) { return e && e.status === 409 && conflict ? conflict : T.generic; }

  /* ---------- the person's own small memory: the swipe hint is confirmed ONCE for the whole system (one key, set by the kit's "הבנתי" button) ---------- */
  function resetHints() {
    try { localStorage.removeItem("rk.swipe.understood"); } catch (e) { /* nothing to clear */ }
    if (swipeEl) swipeEl.__hinted = false;
  }

  /* ---------- gate and sign-out ---------- */
  function showGate(note) {
    epoch++;
    afterClose = null; afterCloseC = null; ctx = null;
    closeMenu();
    if (dlgC.open) dlgC.close();
    if (dlg.open) dlg.close();
    S = blank();
    if (ptrCtl) { ptrCtl.destroy(); ptrCtl = null; }
    swipeCtl = null; swipeEl = null;
    wrap.hidden = true;
    gate.hidden = false;
    $("#gNote").textContent = note || "";
    document.title = TITLE;
    if (note) $("#gLogin").focus();
  }
  function showApp() {
    gate.hidden = true;
    wrap.hidden = false;
    var who = A.name() || A.email();
    $("#whoName").textContent = who;
    $("#userBtn").setAttribute("aria-label", "החשבון שלי" + (who ? ": " + who : ""));
    document.documentElement.style.setProperty("--rptr-top", $(".top").offsetHeight + "px");
    if (RosterUI && RosterUI.kbWatch) RosterUI.kbWatch();
  }
  function doSignOut() {
    var p = A.signOut();
    showGate("");
    return p;
  }

  /* ---------- the floating menu (the person's own, and a row's) ---------- */
  function openMenu(btn, html) {
    closeMenu();
    menu.innerHTML = html;
    menu.hidden = false;
    var r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    var left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
    var top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    btn.setAttribute("aria-expanded", "true");
    menuBtn = btn;
    var first = $(".rmenu__item", menu);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(back) {
    if (menu.hidden) return;
    var b = menuBtn;
    menu.hidden = true;
    menu.innerHTML = "";
    menuBtn = null;
    if (b) { b.setAttribute("aria-expanded", "false"); if (back) b.focus(); }
  }
  document.addEventListener("pointerdown", function (e) {
    if (menu.hidden || menu.contains(e.target) || (menuBtn && menuBtn.contains(e.target))) return;
    closeMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (menu.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeMenu(true); return; }
    if (e.key === "Tab") { var b = menuBtn; closeMenu(); if (b) b.focus(); return; }
    var items = Array.prototype.slice.call(menu.querySelectorAll(".rmenu__item"));
    var i = items.indexOf(document.activeElement), n = items.length;
    if (!n) return;
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % n].focus({ preventScroll: true }); }
    else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + n) % n].focus({ preventScroll: true }); }
    else if (e.key === "Home") { e.preventDefault(); items[0].focus({ preventScroll: true }); }
    else if (e.key === "End") { e.preventDefault(); items[n - 1].focus({ preventScroll: true }); }
  });
  window.addEventListener("resize", function () { closeMenu(); });
  document.addEventListener("scroll", function (e) { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

  $("#userBtn").addEventListener("click", function () {
    if (menuBtn === this) return closeMenu(true);
    var name = A.name(), email = A.email();
    openMenu(this,
      '<div class="rmenu__head">' + (name ? "<b>" + esc(name) + "</b>" : "") +
      (email ? '<bdi class="rmenu__mail" dir="ltr">' + esc(email) + "</bdi>" : "") +
      (S.isSuper ? '<span class="rchip">מנהל המערכת</span>' : "") + "</div>" +
      (S.isSuper ? '<button type="button" class="rmenu__item" role="menuitem" data-act="trash-all">' + icon("restore") + "<span>נמחקו לאחרונה</span></button>" : "") +
      '<button type="button" class="rmenu__item" role="menuitem" data-act="hints">' + icon("help") + "<span>הצגת הדרכות מחדש</span></button>" +
      '<button type="button" class="rmenu__item" role="menuitem" data-act="signout">' + icon("logout") + "<span>יציאה</span></button>");
  });

  menu.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act, id = menuId;
    closeMenu();
    if (act === "signout") return doSignOut();
    if (act === "hints") { resetHints(); return toast("ההדרכות יוצגו שוב."); }
    if (act === "trash-all") return openTrash("");
    rowAct(act, id);
  });

  function rowAct(act, id) {
    if (act === "rename") openBiz(id);
    else if (act === "accounts") openAccounts(id, "menu");
    else if (act === "delete") openDelete(id);
    else if (act === "trash") openTrash(id);
  }

  /* ---------- dialogs ---------- */
  function openDialog(kind, titleHtml, bodyHtml, o) {
    o = o || {};
    /* the one shell (assets/sheet.js): fixed header with the X, one scrolling body, the grab bar at the free edge.
       "new business" comes down from the top, the rest from the bottom until the owner says otherwise */
    RosterSheet.render(dlg, { kind: kind, title: titleHtml, titleId: "dlgT", body: bodyHtml, foot: o.foot, size: o.size || "md", action: o.action,
      from: ctx && ctx.kind === "biz" && !ctx.id ? "top" : "bottom", icon: icon("x") });
  }
  /* Where focus goes after the dialog: the row's control, or the add button if the row is gone. */
  function back(id, act) {
    return function () {
      var el = id ? view.querySelector('[data-act="' + act + '"][data-id="' + CSS.escape(id) + '"]') : null;
      if (!el) el = $("#newBiz");
      if (el) el.focus();
    };
  }
  dlg.addEventListener("click", function (e) {   /* the backdrop is closed by sheet.js */
    if (e.target === dlg) return;
    if (e.target.closest("[data-close]")) return dlg.close();
    var a = e.target.closest("[data-acc]");
    if (a) accAction(a);
    var r = e.target.closest("[data-trash]");
    if (r) trashAction(r);
  });
  dlg.addEventListener("close", function () {
    var f = afterClose;
    afterClose = null; ctx = null;
    dlg.textContent = "";
    if (f) f();
  });

  /* the small confirmation (heavy deletes, permanent delete): its confirm button names what it does */
  function confirmHeavy(o) {
    RosterSheet.render(dlgC, { kind: "confirm", title: o.title, titleId: "dlgCT", from: "bottom", size: "sm", icon: icon("x"),
      body: '<div class="rmsg rmsg--no"><span class="rmsg__text">' + o.text + "</span></div>",
      foot: '<button type="button" class="rbtn rbtn--danger" id="cYes">' + esc(o.confirmLabel) + '</button>' });
    afterCloseC = o.back || null;
    var yes = $("#cYes", dlgC);
    yes.addEventListener("click", function () { var go = o.onConfirm; afterCloseC = null; dlgC.close(); if (go) go(); });
    yes.focus();
  }
  dlgC.addEventListener("click", function (e) { if (e.target !== dlgC && e.target.closest("[data-close]")) dlgC.close(); });
  dlgC.addEventListener("close", function () {
    var f = afterCloseC;
    afterCloseC = null;
    dlgC.textContent = "";
    if (f) f();
  });

  /* ---------- views ---------- */
  function boot() {
    if (!A) {
      wrap.hidden = true; gate.hidden = false;
      $("#gNote").textContent = T.noAuth;
      $("#gLogin").disabled = true;
      return;
    }
    if (!A.signedIn()) return showGate("");
    var mine = epoch;
    showApp();
    setCount("");
    setView('<div class="rempty rempty--fill" role="status">טוען…</div>');
    Promise.all([
      api("/rest/v1/rpc/roster_is_super", { method: "POST", json: {} }),
      api("/rest/v1/rpc/roster_my_businesses", { method: "POST", json: {} }),
    ]).then(function (r) {
      if (epoch !== mine) return;
      var list = Array.isArray(r[1]) ? r[1] : [];
      S.isSuper = r[0] === true || list.some(function (b) { return b && b.is_super === true; });
      if (S.isSuper) return showManager();
      if (list.length === 0) return showNone();
      if (list.length === 1) {
        setView('<div class="rempty rempty--fill" role="status">מעביר לעסק…</div>');
        return location.replace("admin/?biz=" + encodeURIComponent(list[0].slug));
      }
      showPicker(list);
    }).catch(function (e) {
      if (e && e.signedOut) return;
      if (epoch !== mine) return;
      setView('<div class="rempty rempty--fill"><b>לא הצלחנו לטעון</b>' + esc(T.loadFail) + '<button type="button" class="rbtn rbtn--ghost" data-act="retry">ניסיון נוסף</button></div>');
    });
  }

  function showNone() {
    var em = A.email();
    setView('<div class="rempty rempty--fill"><div class="mark" aria-hidden="true">' + icon("users") + "</div>" +
      "<p>" + (em ? 'החשבון <bdi dir="ltr">' + esc(em) + "</bdi>" : "החשבון הזה") +
      " עוד לא מחובר לאף עסק. מי שמנהל את המערכת יכול לחבר אותו.</p>" +
      '<button type="button" class="rbtn rbtn--ghost" data-act="signout">יציאה והחלפת חשבון</button></div>');
  }

  function showPicker(list) {
    setCount("");
    setView('<div class="rlist"><div class="lbox"><div class="rhead__sub lbox__head"><b>בחרו עסק</b><br>החשבון הזה מחובר ליותר מעסק אחד.</div>' +
      list.map(function (b) {
        return '<div class="rrow rrow--link"><a class="rrow__main" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '"><span class="rrow__title">' + esc(b.name) +
          '</span><span class="rrow__sub"><bdi dir="ltr">' + esc(b.slug) + '</bdi></span></a><span class="rrow__trail" aria-hidden="true">' + icon("go") + "</span></div>";
      }).join("") + "</div></div>");
  }

  /* ---------- the manager ---------- */
  function showManager() {
    setView('<div class="qrow" id="qRow" hidden><label class="rfield" id="qF"><span>חיפוש עסק</span><input type="search" id="q" placeholder=" " autocomplete="off"></label></div>' +
      '<div class="rlist" id="list" data-fab-room><div class="lbox" id="listIn"><div class="rempty" role="status">טוען…</div></div></div>' +
      '<button type="button" class="rfab" id="newBiz" data-act="new" aria-label="עסק חדש" title="עסק חדש">' + icon("plus") + "</button>");
    $("#q").addEventListener("input", function () { S.q = this.value; renderList(); });
    /* pull to refresh: a finger swipe down while the list is at its top (or has nothing to scroll) reloads the businesses; never under a popup */
    if (ptrCtl) ptrCtl.destroy();
    ptrCtl = RosterUI.ptr.attach({ scroller: $("#list"), onRefresh: function () { return loadManager(); },
      enabled: function () { return !dlg.open && !dlgC.open && menu.hidden; } });
    swipeEl = $("#list");
    swipeCtl = RosterUI.swipe.init(swipeEl);
    loadManager();
  }

  function loadManager() {
    var mine = epoch;
    var l = $("#listIn");
    if (l && !S.biz.length) l.innerHTML = '<div class="rempty" role="status">טוען…</div>';
    return Promise.all([
      api("/rest/v1/roster_businesses?select=id,slug,name,created_at&order=created_at"),
      api("/rest/v1/roster_business_users?select=business_id,email&order=email"),
    ]).then(function (r) {
      if (epoch !== mine) return;
      S.biz = Array.isArray(r[0]) ? r[0] : [];
      S.users = {};
      S.biz.forEach(function (b) { S.users[b.id] = []; });
      (Array.isArray(r[1]) ? r[1] : []).forEach(function (u) { if (S.users[u.business_id]) S.users[u.business_id].push(lc(u.email)); });
      renderList();
    }).catch(function (e) {
      if ((e && e.signedOut) || epoch !== mine) return;
      var l2 = $("#listIn");
      if (l2) l2.innerHTML = '<div class="rempty"><b>לא הצלחנו לטעון את העסקים</b>' + esc(T.loadFail) + '<button type="button" class="rbtn rbtn--ghost" data-act="reload">ניסיון נוסף</button></div>';
    });
  }

  /* a business is a LIST ROW: the whole row opens it, the three dots carry every action, and a swipe shows rename and delete (the same two) */
  function rowHtml(b) {
    var id = esc(b.id);
    return '<div class="rrow rrow--link" data-row="' + id + '" data-swipe="owner-businesses"><div class="rswipe-fg">' +
      '<a class="rrow__main" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '" aria-label="פתיחת ' + esc(b.name) + '"><span class="rrow__title">' + esc(b.name) + '</span>' +
      '<span class="rrow__sub"><bdi dir="ltr">' + esc(b.slug) + '</bdi></span></a>' +
      '<button type="button" class="rbtn rbtn--icon rbtn--edge rbtn--edge-end rrow__trail" data-act="menu" data-id="' + id + '" aria-haspopup="menu" aria-expanded="false" aria-label="עוד פעולות: ' + esc(b.name) + '" title="עוד פעולות">' + icon("dots") + "</button></div>" +
      '<div class="rswipe" aria-hidden="true">' +
      '<button type="button" class="rswipe__act" tabindex="-1" data-act="rename" data-id="' + id + '">' + icon("edit") + "<span>עריכה</span></button>" +
      '<button type="button" class="rswipe__act" tabindex="-1" data-tone="danger" data-act="delete" data-id="' + id + '">' + icon("trash") + "<span>מחיקה</span></button></div></div>";
  }

  function visibleBiz() { return S.biz.filter(function (b) { return !RosterUndo.isPending("business", b.id); }); }

  function renderList() {
    var box = $("#listIn");
    if (!box) return;
    var all = visibleBiz();
    var many = all.length > MANY;
    $("#qRow").hidden = !many;
    var term = many ? lc(S.q) : "";
    var rows = all.filter(function (b) { return !term || lc(b.name).indexOf(term) > -1 || b.slug.indexOf(term) > -1; });
    setCount(term ? rows.length + " מתוך " + bizCount(all.length) : bizCount(all.length));
    var html = "";
    if (!all.length) {
      html += '<div class="rempty"><b>עוד אין עסקים</b>כל עסק מקבל מזהה משלו, ורשימה של חשבונות Google שמנהלים אותו. אפשר להתחיל מהכפתור הצף.</div>';
    } else if (!rows.length) {
      html += '<div class="rempty"><b>לא נמצא עסק</b>אין עסק שהשם או המזהה שלו מכילים את מה שכתבתם.</div>';
    } else {
      html += rows.map(rowHtml).join("");
    }
    box.innerHTML = html;
    if (swipeCtl && swipeEl && !swipeEl.__hinted && rows.length && !dlg.open && !dlgC.open) { swipeEl.__hinted = true; swipeCtl.hint(); }   /* the first time only, per person (and once per screen) */
  }

  function flash(id) {
    var el = view.querySelector('[data-row="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    el.classList.add("fresh");
    setTimeout(function () { el.classList.remove("fresh"); }, 2600);
  }

  view.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act, id = t.dataset.id;
    if (act === "menu") {
      if (menuBtn === t) return closeMenu(true);
      var b = byId(id);
      if (!b) return;
      menuId = id;
      var n = (S.users[id] || []).length;
      openMenu(t,
        '<a class="rmenu__item" role="menuitem" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '">' + icon("go") + "<span>פתיחה</span></a>" +
        '<button type="button" class="rmenu__item" role="menuitem" data-act="rename">' + icon("edit") + "<span>עריכה</span></button>" +
        '<button type="button" class="rmenu__item" role="menuitem" data-act="accounts">' + icon("users") + "<span>ניהול חשבונות</span>" +
        (n ? '<span class="rcount" aria-label="' + esc(accCount(n)) + '">' + n + "</span>" : '<span class="rchip rchip--wait">אין חשבונות</span>') + "</button>" +
        '<button type="button" class="rmenu__item" role="menuitem" data-act="trash">' + icon("restore") + "<span>נמחקו לאחרונה</span></button>" +
        '<button type="button" class="rmenu__item" role="menuitem" data-tone="danger" data-act="delete">' + icon("trash") + "<span>מחיקה</span></button>");
    }
    else if (act === "rename" || act === "delete") { if (swipeCtl) swipeCtl.close(); rowAct(act, id); }
    else if (act === "new") openBiz("");
    else if (act === "reload") loadManager();
    else if (act === "retry") boot();
    else if (act === "signout") doSignOut();
  });

  /* ---------- new business, and rename ---------- */
  /* A latin name suggests a latin identifier. A Hebrew name suggests nothing. */
  function slugFrom(name) {
    if (/[^\x00-\x7F]/.test(name)) return "";
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+/, "").slice(0, 40).replace(/-+$/, "");
  }
  function checkName(name) {
    if (!name) return T.nameEmpty;
    if (name.length > 80) return T.nameLong;
    return "";
  }
  function checkSlug(slug, ownId) {
    if (!slug) return T.slugEmpty;
    if (slug.length < 2 || slug.length > 40) return T.slugLen;
    if (!/^[a-z]/.test(slug)) return /^[a-z0-9-]+$/.test(slug) ? T.slugStart : T.slugChars;
    if (!SLUG_RE.test(slug)) return T.slugChars;
    if (RESERVED.indexOf(slug) > -1) return T.slugReserved;
    for (var i = 0; i < S.biz.length; i++) if (S.biz[i].slug === slug && S.biz[i].id !== ownId) return T.slugTaken;
    return "";
  }

  var HELP_SLUG_NEW = "המזהה הוא החלק האחרון של כתובת העסק, באנגלית: אותיות קטנות, ספרות ומקפים (לא קו תחתון), 2 עד 40 תווים, ומתחיל באות. אפשר לשנות אותו אחר כך, אבל אז הכתובת משתנה.";
  var HELP_SLUG_EDIT = "אחרי שינוי הכתובת הישנה והקישורים שנוצרו איתה (חיבורים, אזור אישי שמוטמע באתר של העסק, קישורים במיילים שכבר נשלחו) יפסיקו לעבוד.";

  function openBiz(id) {
    var b = id ? byId(id) : null;
    if (id && !b) return;
    var edit = !!b;
    ctx = { kind: "biz", id: id, busy: false, touched: false };
    afterClose = edit ? back(id, "menu") : null;
    openDialog("form", edit ? "עריכת עסק" : "עסק חדש",
      '<form id="bForm" novalidate>' +
      '<label class="rfield"><span>שם העסק</span><input id="bName" placeholder=" " maxlength="80" autocomplete="off" autofocus value="' + esc(b ? b.name : "") + '"></label>' +
      (edit
        ? '<label class="rfield"><span>מזהה באותיות לטיניות</span><input id="bSlug" class="ltr" dir="ltr" placeholder=" " maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" value="' + esc(b.slug) + '" data-help="' + esc(HELP_SLUG_EDIT) + '" data-help-ex="floa.co.il/roster/{value}"></label>'
        : '<label class="rfield"><span>מזהה באותיות לטיניות</span><input id="bSlug" class="ltr" dir="ltr" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="dana-yoga" data-hint data-help="' + esc(HELP_SLUG_NEW) + '" data-help-ex="floa.co.il/roster/{value}" data-help-ex-empty="floa.co.il/roster/your-business-name"></label>') +
      (edit ? "" :
        '<label class="rfield"><span>השם שהמשתתפים רואים (לא חובה)</span><input id="bDisp" placeholder=" " maxlength="60" autocomplete="off" data-help="כך העסק מופיע בהודעות ובמיילים למשתתפים. אם משאירים ריק, זה שם העסק."></label>') +
      '<div class="rmsg rmsg--no" id="bErr" role="alert" hidden></div></form>',
      { size: "md", action: { label: edit ? "שמירה" : "יצירת עסק", form: "bForm", id: "bGo" } });
    RField.scan(dlg);

    var name = $("#bName"), slug = $("#bSlug");
    if (edit) RosterSheet.setDirty(dlg, false);
    function dirty() { if (edit) RosterSheet.setDirty(dlg, clean(name.value) !== b.name || lc(slug.value) !== b.slug); }
    function bad(msg, field) {
      var e = $("#bErr"); e.textContent = msg; e.hidden = !msg;
      name.setAttribute("aria-invalid", field === "bName" ? "true" : "false");
      if (slug) slug.setAttribute("aria-invalid", field === "bSlug" ? "true" : "false");
      if (field) $("#" + field).focus();
    }
    function ok() { var e = $("#bErr"); e.textContent = ""; e.hidden = true; name.removeAttribute("aria-invalid"); if (slug) slug.removeAttribute("aria-invalid"); }
    name.addEventListener("input", function () {
      ok(); dirty();
      if (slug && !edit && !ctx.touched) { slug.value = slugFrom(name.value.trim()); note(); }
    });
    function note() {                                 /* the identifier is checked while typing: free, taken or reserved (the owner sees every business, so the list on the page is the truth) */
      if (!slug) return;
      var v = lc(slug.value), m = v ? checkSlug(v, edit ? b.id : null) : "";
      RField.note(slug, !v || (edit && v === b.slug) ? "" : m || T.slugFree, m ? "bad" : "good");
    }
    if (slug) slug.addEventListener("input", function () {
      ok(); dirty();
      var v = slug.value.toLowerCase();
      if (v !== slug.value) slug.value = v;
      ctx.touched = v !== "";                    /* clearing it hands the field back to the name */
      note();
    });

    $("#bForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var c = ctx;
      if (c.busy) return;
      var nm = clean(name.value), sg = slug ? lc(slug.value) : "", disp = $("#bDisp") ? clean($("#bDisp").value) : "";
      var msg = checkName(nm);
      if (msg) return bad(msg, "bName");
      if (disp.length > 60) return bad(T.dispLong, "bDisp");
      if (!edit || sg !== b.slug) { msg = checkSlug(sg, edit ? b.id : null); if (msg) return bad(msg, "bSlug"); }
      if (edit && nm === b.name && sg === b.slug) return dlg.close();
      c.busy = true; RosterSheet.busy(dlg, true); ok();

      var patch = {};
      if (edit) { if (nm !== b.name) patch.name = nm; if (sg !== b.slug) patch.slug = sg; }
      var req = edit
        ? api("/rest/v1/roster_businesses?id=eq." + encodeURIComponent(b.id), { method: "PATCH", json: patch, prefer: "return=representation" })
        : api("/rest/v1/roster_businesses", { method: "POST", json: { slug: sg, name: nm }, prefer: "return=representation" });
      req.then(function (res) {
        if (edit) {
          if (!Array.isArray(res) || !res.length) throw new Error("not saved");
          var renamed = b.slug !== sg;
          b.name = nm; b.slug = sg;
          renderList();
          toast(renamed ? "העסק עודכן. הכתובת החדשה: floa.co.il/roster/" + sg : "השם עודכן");
          if (ctx === c) dlg.close();
          return;
        }
        var row = Array.isArray(res) ? res[0] : res;
        if (!row || !row.id) {                    /* created, but the answer is empty: ask again for the truth */
          if (ctx === c) dlg.close();
          loadManager();
          return toast("העסק נוצר");
        }
        S.biz.push({ id: row.id, slug: row.slug || sg, name: row.name || nm, created_at: row.created_at || "" });
        S.users[row.id] = [];
        var enter = function () { toast("העסק נוצר"); location.href = "admin/?biz=" + encodeURIComponent(row.slug || sg); };   /* the guided setup starts there */
        if (disp && disp !== nm) api("/rest/v1/roster_business_settings?business_id=eq." + encodeURIComponent(row.id), { method: "PATCH", json: { sender_name: disp } }).then(enter, enter);
        else enter();
      }).catch(function (err) {
        if (err && err.signedOut) return;
        if (ctx !== c) return;
        c.busy = false; RosterSheet.busy(dlg, false);
        if (err && err.status === 409 && (!edit || sg !== b.slug)) bad(T.slugTaken, "bSlug");
        else if (err && err.status === 400 && (!edit || sg !== b.slug)) bad(T.slugReserved, "bSlug");
        else bad(T.generic, "");
      });
    });
  }

  /* ---------- the accounts of one business ---------- */
  function checkMail(email, list) {
    if (!email) return T.mailEmpty;
    if (email.length > 254 || !MAIL_RE.test(email)) return T.mailBad;
    if (list.indexOf(email) > -1) return T.mailTaken;
    return "";
  }
  function acctKey(bizId, email) { return bizId + "|" + email; }
  function accList(b) { return (S.users[b.id] || []).filter(function (em) { return !RosterUndo.isPending("account", acctKey(b.id, em)); }); }

  function openAccounts(id, act) {
    var b = byId(id);
    if (!b) return;
    ctx = { kind: "acc", id: id, busy: false };
    afterClose = back(id, act);
    openDialog("acc", "חשבונות של <bdi>" + esc(b.name) + "</bdi>",
      '<div class="rmsg rmsg--inline">מי שנכנס עם אחד מחשבונות ה־Google האלה מנהל את המשתתפים של העסק.</div>' +
      '<form class="addrow" id="aForm" novalidate>' +
      '<label class="rfield"><span>כתובת מייל של חשבון Google</span><input id="aEmail" type="email" class="ltr" dir="ltr" data-hint placeholder="name@gmail.com" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="email"></label>' +
      '<button type="submit" class="rbtn" id="aAdd">הוספה</button></form>' +
      '<div class="rmsg rmsg--no agap" id="aErr" role="alert" hidden></div>' +
      '<div id="aMine"></div><div class="rhead__sub alabel" id="aCount"></div><div class="acclist" id="aList"></div>', { size: "md" });
    RField.scan(dlg);
    $("#aEmail").addEventListener("input", function () { var e = $("#aErr"); e.textContent = ""; e.hidden = true; this.removeAttribute("aria-invalid"); });
    $("#aForm").addEventListener("submit", function (e) {
      e.preventDefault();
      addAccount(lc($("#aEmail").value), true);
    });
    var list = $("#aList");
    RosterUI.swipe.init(list);
    renderAcc();
  }
  function accErr(msg) { var e = $("#aErr"); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }

  function renderAcc() {
    var c = ctx;
    if (!c || c.kind !== "acc") return;
    var b = byId(c.id);
    if (!b) return;
    var list = accList(b), me = lc(A.email());
    $("#aCount").textContent = list.length ? "חשבונות מחוברים (" + list.length + ")" : "";
    $("#aMine").innerHTML = me && (S.users[b.id] || []).indexOf(me) < 0
      ? '<button type="button" class="rbtn rbtn--link" data-acc="me">הוספת החשבון שלי (<bdi dir="ltr">' + esc(me) + "</bdi>)</button>"
      : "";
    $("#aList").innerHTML = list.length ? list.map(function (em) {
      var e = esc(em);
      return '<div class="rrow rrow--compact" data-swipe="owner-accounts" data-email="' + e + '"><div class="rswipe-fg">' +
        '<span class="rrow__main"><span class="rrow__title"><bdi dir="ltr">' + e + "</bdi></span></span>" + (em === me ? '<span class="rchip">אתם</span>' : "") +
        '<button type="button" class="rbtn rbtn--icon rbtn--edge rbtn--edge-end rrow__trail" data-acc="rm" data-email="' + e + '" aria-label="הסרת ' + e + '" title="הסרה">' + icon("trash") + "</button></div>" +
        '<div class="rswipe" aria-hidden="true"><button type="button" class="rswipe__act" tabindex="-1" data-tone="danger" data-acc="rm" data-email="' + e + '">' + icon("trash") + "<span>הסרה</span></button></div></div>";
    }).join("") : '<div class="rempty">עוד לא חובר אף חשבון. אפשר להוסיף כתובת מייל של חשבון Google למעלה.</div>';
  }

  function accAction(t) {
    var c = ctx;
    if (!c || c.kind !== "acc" || c.busy) return;
    var a = t.dataset.acc, email = t.dataset.email || "";
    if (a === "rm") removeAccount(email);
    else if (a === "me") addAccount(lc(A.email()), false);
  }

  function accBusy(c, on) {
    c.busy = on;
    var btns = dlg.querySelectorAll(".sheet-body button");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = on;
  }

  function addAccount(email, fromField) {
    var c = ctx, b = byId(c.id);
    if (!b || c.busy) return;
    var list = S.users[b.id] || [];
    var msg = checkMail(email, list);
    if (msg) {
      accErr(msg);
      var inp = $("#aEmail");
      if (fromField) { inp.setAttribute("aria-invalid", "true"); inp.focus(); }
      return;
    }
    accErr("");
    accBusy(c, true);
    api("/rest/v1/roster_business_users", { method: "POST", json: { business_id: b.id, email: email } })
      .then(function () {
        var l = S.users[b.id] || (S.users[b.id] = []);
        if (l.indexOf(email) < 0) { l.push(email); l.sort(); }
        renderList();
        toast("החשבון נוסף");
        if (ctx !== c) return;
        accBusy(c, false);
        $("#aEmail").value = "";
        renderAcc();
        $("#aEmail").focus();
      })
      .catch(function (err) {
        if (err && err.signedOut) return;
        if (ctx !== c) return;
        accBusy(c, false);
        accErr(problem(err, T.mailTaken));
        if (fromField) $("#aEmail").focus();
      });
  }

  /* removing an account gives or takes away somebody's access: a HEAVY delete (a small confirmation first, then the undo toast with the long window) */
  function removeAccount(email) {
    var c = ctx, b = byId(c.id);
    if (!b || c.busy) return;
    var bizId = b.id;
    confirmHeavy({
      title: "הסרת חשבון",
      text: 'להסיר את <bdi dir="ltr">' + esc(email) + "</bdi> מהעסק <b>" + esc(b.name) + "</b>? מי שנכנס עם החשבון הזה לא יוכל יותר לנהל את העסק.",
      confirmLabel: "הסרת " + email,
      back: function () { var el = dlg.querySelector('[data-acc="rm"][data-email="' + CSS.escape(email) + '"]'); if (el) el.focus(); },
      onConfirm: function () {
        RosterUndo.delete({
          kind: "account", itemId: acctKey(bizId, email), label: "החשבון הוסר", duration: HEAVY_MS, heavy: true,
          onUndo: function () { renderAcc(); renderList(); },
          onCommit: function (o) {
            return rest("/rest/v1/roster_business_users?business_id=eq." + encodeURIComponent(bizId) + "&email=eq." + encodeURIComponent(email),
              { method: "DELETE", prefer: "return=representation", keepalive: o && o.keepalive }).then(function (res) {
              if (Array.isArray(res) && !res.length) throw new Error("nothing removed");
              var l = S.users[bizId] || [], i = l.indexOf(email);
              if (i > -1) l.splice(i, 1);
              renderAcc(); renderList();
            });
          },
          onFail: function () { renderAcc(); renderList(); },
        });
        renderAcc(); renderList();
      },
    });
  }

  /* ---------- delete a business: HEAVY (it takes its participants, meetings and payments with it), so a small confirmation, then the 10 second undo ---------- */
  function openDelete(id) {
    var b = byId(id);
    if (!b) return;
    confirmHeavy({
      title: "מחיקת עסק",
      text: "מחיקת העסק <b>" + esc(b.name) + "</b> מורידה גם את כל המשתתפים, המפגשים והתשלומים שלו. כל זה נשמר ב\"נמחקו לאחרונה\" ואפשר לשחזר, ויש עוד כמה שניות לבטל.",
      confirmLabel: "מחיקת העסק " + b.name,
      back: back(id, "menu"),
      onConfirm: function () {
        RosterUndo.delete({
          kind: "business", itemId: b.id, label: 'העסק "' + b.name + '" נמחק', duration: HEAVY_MS, heavy: true,
          onUndo: renderList,
          onCommit: function (o) {
            return rest("/rest/v1/roster_businesses?id=eq." + encodeURIComponent(b.id), { method: "DELETE", prefer: "return=representation", keepalive: o && o.keepalive }).then(function (res) {
              if (Array.isArray(res) && !res.length) throw new Error("nothing deleted");
              S.biz = S.biz.filter(function (x) { return x.id !== b.id; });
              delete S.users[b.id];
              renderList();
            });
          },
          onFail: renderList,
        });
        renderList();
      },
    });
  }

  /* ---------- "נמחקו לאחרונה": what was deleted, with restore (and, for the platform owner, a permanent delete) ---------- */
  function trashRows(bizId) {
    return rest("/rest/v1/rpc/roster_trash_list", { method: "POST", json: bizId ? {} : { p_kind: "business" }, biz: bizId || undefined });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return isNaN(d) ? "" : d.getDate() + "." + (d.getMonth() + 1) + "." + String(d.getFullYear()).slice(2);
  }
  function openTrash(bizId) {
    var b = bizId ? byId(bizId) : null;
    if (bizId && !b) return;
    ctx = { kind: "trash", id: bizId, rows: null, busy: false };
    afterClose = bizId ? back(bizId, "menu") : null;
    openDialog("trash", b ? "נמחקו לאחרונה: <bdi>" + esc(b.name) + "</bdi>" : "נמחקו לאחרונה",
      '<div class="rmsg rmsg--inline">שום דבר לא נמחק באמת: אפשר לשחזר מכאן. מחיקה לצמיתות מוחקת גם את מה שנשמר.</div><div id="tList"><div class="rempty" role="status">טוען…</div></div>', { size: "md" });
    var c = ctx;
    trashRows(bizId).then(function (rows) {
      if (ctx !== c) return;
      c.rows = Array.isArray(rows) ? rows : [];
      renderTrash();
    }).catch(function (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      $("#tList").innerHTML = '<div class="rempty">' + esc(T.loadFail) + "</div>";
    });
  }
  function renderTrash() {
    var c = ctx;
    if (!c || c.kind !== "trash") return;
    var rows = c.rows || [], box = $("#tList");
    if (!rows.length) { box.innerHTML = '<div class="rempty"><b>אין כלום בפח</b>מה שיימחק יופיע כאן.</div>'; return; }
    /* grouped by what it is, the groups in the order the newest item of each appears */
    var order = [], by = {};
    rows.forEach(function (r) { var k = KIND[r.kind] || r.kind; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
    var html = "";
    order.forEach(function (k) {
      html += '<div class="tgroup">' + esc(k) + "</div>";
      by[k].forEach(function (r) {
      var n = Number(r.dependents) || 0, id = esc(r.trash_id);
      html += '<div class="rrow trow" data-trash-row="' + id + '"><span class="rrow__main"><span class="rrow__title">' + esc(r.label || k) + "</span>" +
        '<span class="rrow__sub">' + (r.deleted_at ? '<span class="rchip">' + esc(fmtDate(r.deleted_at)) + "</span>" : "") +
        (r.source === "inactive" ? '<span class="rchip rchip--wait">הוסר מהרשימה</span>' : "") +
        (n ? '<span class="rchip">ועוד ' + n + " שנמחקו איתו</span>" : "") + "</span></span>" +
        '<span class="rrow__trail"><button type="button" class="rbtn rbtn--ghost rbtn--sm" data-trash="restore" data-id="' + id + '" data-kind="' + esc(r.kind) + '">שחזור</button>' +
        (S.isSuper && r.source !== "inactive" ? '<button type="button" class="rbtn rbtn--icon rbtn--ghost rbtn--danger" data-trash="purge" data-id="' + id + '" data-kind="' + esc(r.kind) + '" aria-label="מחיקה לצמיתות: ' + esc(r.label || k) + '" title="מחיקה לצמיתות">' + icon("trash") + "</button>" : "") +
        "</span></div>";
      });
    });
    box.innerHTML = html;
  }
  function trashAction(t) {
    var c = ctx;
    if (!c || c.kind !== "trash" || c.busy) return;
    var act = t.dataset.trash, id = t.dataset.id, kind = t.dataset.kind;
    var row = (c.rows || []).filter(function (r) { return r.trash_id === id; })[0];
    if (!row) return;
    if (act === "restore") {
      c.busy = true; t.disabled = true;
      rest("/rest/v1/rpc/roster_restore", { method: "POST", json: { p_kind: kind, p_id: id }, biz: c.id || undefined }).then(function (res) {
        c.busy = false;
        var st = res && (res.status || (typeof res === "string" ? res : ""));
        if (st === "ok") {
          c.rows = c.rows.filter(function (r) { return r.trash_id !== id; });
          if (ctx === c) renderTrash();
          toast(T.restored);
          loadManager();
        } else { t.disabled = false; toast(st === "conflict" ? T.conflict : T.generic); }
      }).catch(function (err) { c.busy = false; t.disabled = false; if (err && err.signedOut) return; toast(T.generic); });
    } else if (act === "purge") {
      confirmHeavy({
        title: "מחיקה לצמיתות",
        text: "<b>" + esc(row.label || kind) + "</b> יימחק לצמיתות" + (Number(row.dependents) ? ", יחד עם " + Number(row.dependents) + " פריטים שנמחקו איתו" : "") + ". אי אפשר לשחזר אחרי זה.",
        confirmLabel: "מחיקה לצמיתות של " + (row.label || kind),
        onConfirm: function () {
          rest("/rest/v1/rpc/roster_purge", { method: "POST", json: { p_kind: kind, p_id: id }, biz: c.id || undefined }).then(function () {
            c.rows = (c.rows || []).filter(function (r) { return r.trash_id !== id; });
            if (ctx === c) renderTrash();
            toast(T.purged);
          }).catch(function (err) { if (err && err.signedOut) return; toast(T.generic); });
        },
      });
    }
  }

  /* ---------- go ---------- */
  $("#gLogin").addEventListener("click", function () { if (A) A.signIn(); });
  boot();
})();
