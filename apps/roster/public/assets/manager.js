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
   deleted in the trash (trash_list / restore / purge), shown on the "נמחקו לאחרונה" screen.

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
    cal: ["s", '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16"/><path d="M9 3v4"/><path d="M15 3v4"/>'],
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
  var gate = $("#gate"), wrap = $("#wrap"), list = $("#list"), statusEl = $("#status"), vbar = $("#listTags"), side = $("#bSide"), menu = $("#menu"), dlg = $("#dlg"), dlgC = $("#dlgC");
  var root = document.documentElement;
  var wideMQ = window.matchMedia ? window.matchMedia("(min-width: 1024px)") : null;
  function wide() { return !!(wideMQ && wideMQ.matches); }
  RosterSheet.attach(dlg);    /* the one popup shell (assets/sheet.js): square, grab bar, swipe to close, page locked behind, inner scroll */
  RosterSheet.attach(dlgC);   /* the small confirmation window, opened above the other one */
  function blank() { return { isSuper: false, biz: [], users: {}, q: "", open: "" }; }
  var S = blank();
  var epoch = 0;            /* bumped on every sign-out, so a late answer cannot repaint someone else's data */
  var ctx = null;           /* the open dialog's context */
  var afterClose = null;    /* where focus goes when the dialog closes */
  var afterCloseC = null;
  var menuBtn = null;
  var toastTimer = 0;
  var ptrCtl = null;
  var lastOpen = "";        /* the business whose card was closed last: its row stays a light grey until the next press, like a participant's */

  function byId(id) { for (var i = 0; i < S.biz.length; i++) if (S.biz[i].id === id) return S.biz[i]; return null; }
  /* a message under the header (loading, error, not connected): the list and the search step aside, as on the participants page */
  function setStatus(html) { statusEl.innerHTML = html; list.innerHTML = ""; vbar.hidden = true; $("#addBox").innerHTML = ""; closeSummary(); }
  function clearStatus() { statusEl.innerHTML = ""; }
  /* the number of businesses lives in the search field, written the way the participants page writes its own (admin.js paintCnt): a bold number and the word, or "one" in words. It goes while the field is used. */
  function setCount(n) { var c = $("#listCountS"); if (c) c.innerHTML = n == null || n === "" ? "" : n === 1 ? "עסק אחד" : "<b>" + n + "</b> עסקים"; }

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

  /* ---------- gate and sign-out ---------- */
  function showGate(note) {
    epoch++;
    afterClose = null; afterCloseC = null; ctx = null;
    closeMenu();
    closeSummary();
    if (dlgC.open) dlgC.close();
    if (dlg.open) dlg.close();
    S = blank();
    if (ptrCtl) { ptrCtl.destroy(); ptrCtl = null; }
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
      '<button type="button" class="rmenu__item" role="menuitem" data-act="signout">' + icon("logout") + "<span>יציאה</span></button>");
  });

  menu.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act;
    closeMenu();
    if (act === "signout") return doSignOut();
    if (act === "trash-all") return openTrash("");
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
      var el = id ? list.querySelector('[data-open="' + CSS.escape(id) + '"]') : null;
      if (!el) el = $("#q");
      if (el) el.focus({ preventScroll: true });
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
    setStatus('<div class="empty" role="status">טוען…</div>');
    Promise.all([
      api("/rest/v1/rpc/is_super", { method: "POST", json: {} }),
      api("/rest/v1/rpc/my_businesses", { method: "POST", json: {} }),
    ]).then(function (r) {
      if (epoch !== mine) return;
      var list = Array.isArray(r[1]) ? r[1] : [];
      S.isSuper = r[0] === true || list.some(function (b) { return b && b.is_super === true; });
      if (S.isSuper) return showManager();
      if (list.length === 0) return showNone();
      if (list.length === 1) {
        setStatus('<div class="empty" role="status">מעביר לעסק…</div>');
        return location.replace("admin/?biz=" + encodeURIComponent(list[0].slug));
      }
      showPicker(list);
    }).catch(function (e) {
      if (e && e.signedOut) return;
      if (epoch !== mine) return;
      setStatus('<div class="empty"><b>לא הצלחנו לטעון</b>' + esc(T.loadFail) + '<br><button type="button" class="rbtn rbtn--ghost" data-act="retry">ניסיון נוסף</button></div>');
    });
  }

  function showNone() {
    var em = A.email();
    setStatus('<div class="empty"><b>' + (em ? 'החשבון <bdi dir="ltr">' + esc(em) + "</bdi>" : "החשבון הזה") + " עוד לא מחובר לאף עסק</b>" +
      "מי שמנהל את המערכת יכול לחבר אותו.<br>" +
      '<button type="button" class="rbtn rbtn--ghost" data-act="signout">יציאה והחלפת חשבון</button></div>');
  }

  function showPicker(mine) {
    setCount("");
    setStatus("");
    list.innerHTML = '<li class="group">בחרו עסק: החשבון הזה מחובר ליותר מעסק אחד</li>' + mine.map(function (b) {
      return '<li class="row ucard"><a class="main nobadge" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '"><div class="nm"><span class="name" dir="rtl">' + esc(b.name) + '</span></div>' +
        '<div class="meta"><span class="sidewrap"><bdi dir="ltr">' + esc(b.slug) + "</bdi></span></div></a></li>";
    }).join("");
  }

  /* ---------- the manager ---------- */
  function showManager() {
    clearStatus();
    vbar.hidden = false;
    $("#q").value = S.q;
    /* pull to refresh: a finger swipe down while the list is at its top (or has nothing to scroll) reloads the businesses; never under a popup */
    if (ptrCtl) ptrCtl.destroy();
    ptrCtl = RosterUI.ptr.attach({ scroller: list, onRefresh: function () { return loadManager(); },
      enabled: function () { return !dlg.open && !dlgC.open && menu.hidden; } });
    renderList();
    loadManager();
  }

  function loadManager() {
    var mine = epoch;
    if (!S.biz.length) list.innerHTML = '<li class="empty" role="status">טוען…</li>';
    return Promise.all([
      api("/rest/v1/businesses?select=id,slug,name,created_at&order=created_at"),
      api("/rest/v1/business_users?select=business_id,email&order=email"),
      api("/rest/v1/meetings?select=business_id").catch(function () { return []; }),   /* only to count them: the chip of a business row; a failed count never blocks the list */
    ]).then(function (r) {
      if (epoch !== mine) return;
      S.biz = Array.isArray(r[0]) ? r[0] : [];
      S.users = {};
      S.biz.forEach(function (b) { S.users[b.id] = []; });
      (Array.isArray(r[1]) ? r[1] : []).forEach(function (u) { if (S.users[u.business_id]) S.users[u.business_id].push(lc(u.email)); });
      S.meets = {};
      (Array.isArray(r[2]) ? r[2] : []).forEach(function (m) { S.meets[m.business_id] = (S.meets[m.business_id] || 0) + 1; });
      renderList();
    }).catch(function (e) {
      if ((e && e.signedOut) || epoch !== mine) return;
      list.innerHTML = '<li class="empty"><b>לא הצלחנו לטעון את העסקים</b>' + esc(T.loadFail) + '<br><button type="button" class="rbtn rbtn--ghost" data-act="reload">ניסיון נוסף</button></li>';
    });
  }

  /* a business is a row of the participants list, same anatomy: the accounts count in the age column, the name, the identifier at the end.
     The whole row opens its summary, and every action lives there: there is no swipe on this list. */
  function rowHtml(b) {
    var id = esc(b.id), n = accList(b).length, mc = (S.meets && S.meets[b.id]) || 0;
    /* two lines of its own (the participants row's flow could not keep the identifier on the first line): the accounts count and the name at the start,
       the identifier at the top-left of the card; under them, at the start, the meetings chip (the calendar symbol of "meetings", the one the meetings menu uses, and their number) */
    return '<li class="row ucard bizrow" data-row="' + id + '">' +
      '<div class="main nobadge" role="button" tabindex="0" data-open="' + id + '" aria-label="סיכום העסק ' + esc(b.name) + '">' +
      '<div class="brow"><span class="age n" title="' + esc(accCount(n)) + '"><bdi dir="rtl">' + n + ' <b class="gl">' + icon("users", "i14") + '</b></bdi></span>' +
      '<span class="bname" dir="rtl">' + esc(b.name) + '</span>' +
      '<span class="bslug"><bdi dir="ltr">' + esc(b.slug) + '</bdi></span></div>' +
      '<div class="brow brow--2"><span class="mcnt mcnt2" title="' + esc(mc === 1 ? "מפגש אחד" : mc + " מפגשים") + '">' + icon("cal", "i14") + mc + "</span></div></div></li>";
  }


  function visibleBiz() { return S.biz.filter(function (b) { return !RosterUndo.isPending("business", b.id); }); }

  function renderList() {
    if (vbar.hidden) return;
    var all = visibleBiz();
    var term = lc(S.q);
    var rows = all.filter(function (b) { return !term || lc(b.name).indexOf(term) > -1 || b.slug.indexOf(term) > -1; });
    setCount(rows.length);
    var html = "";
    if (rows.length) html += rows.map(rowHtml).join("");
    else if (!all.length) html += '<li class="empty"><b>עוד אין עסקים</b>כל עסק מקבל מזהה משלו, ורשימה של חשבונות Google שמנהלים אותו. כדי להתחיל, כותבים שם בשורת החיפוש ולוחצים על ההוספה.</li>';
    /* the end of the list adds: what was typed in the search becomes a new business (the participants page does the same with a new participant) */
    var q = clean(S.q);
    if (q) html += '<li class="addli"><button type="button" class="newbtn" id="addNew" data-act="new" aria-label="הוספת עסק חדש: ' + esc(q) + '" title="הוספת עסק חדש"><span class="tg ico plus" aria-hidden="true">+</span><b dir="auto">' + esc(q) + "</b></button></li>";
    var keep = list.scrollTop;
    list.innerHTML = html;
    if (keep && list.scrollTop !== keep) list.scrollTop = keep;
    if (S.open && !all.some(function (b) { return b.id === S.open; })) closeSummary();
    else if (S.open) paintSummary();
    markSel();
  }

  function markSel() {
    var on = !!(S.open && wide());
    list.querySelectorAll("li.row[data-row]").forEach(function (r) {
      r.classList.toggle("sel", on && r.dataset.row === S.open);
      r.classList.toggle("last", !!lastOpen && r.dataset.row === lastOpen);
    });
  }
  /* a press on a row takes the mark of "the last one" to that row; a press anywhere else (not in a popup, a menu or the header) takes it away */
  window.addEventListener("click", function (e) {
    if (e.target.closest && (e.target.closest("dialog") || e.target.closest("[role='menu']") || e.target.closest("header.top") || e.target.closest("#bSide"))) return;
    if (!menu.hidden) return;
    var r = e.target.closest && e.target.closest("#list li.row[data-row]"), id = r ? r.dataset.row : "";
    if (id !== lastOpen) { lastOpen = id; markSel(); }
  }, true);

  function flash(id) {
    var el = list.querySelector('[data-row="' + CSS.escape(id) + '"]');
    if (!el) return;
    el.scrollIntoView({ block: "nearest" });
    el.classList.add("fresh");
    setTimeout(function () { el.classList.remove("fresh"); }, 2600);
  }

  /* ---------- the summary of one business: a card beside the list on a wide screen, a popup otherwise. The same body in both. ---------- */
  function summaryBody(b, forSide) {
    var id = esc(b.id), n = accList(b).length;
    var head = forSide
      ? '<button type="button" class="rbtn rbtn--icon rbtn--ghost bside__x" data-act="close-side" aria-label="סגירה" title="סגירה">' + icon("x") + "</button>" +
        '<div class="bsum__head"><h2 class="rhead__title">' + esc(b.name) + '</h2><span class="bsum__slug"><bdi dir="ltr">' + esc(b.slug) + "</bdi></span></div>"
      : '<div class="bsum__head"><span class="bsum__slug"><bdi dir="ltr">' + esc(b.slug) + "</bdi></span></div>";
    return '<div class="bsum">' + head +
      '<div class="bsum__facts">' + (n ? '<span class="rchip">' + esc(accCount(n)) + "</span>" : '<span class="rchip rchip--wait">אין חשבונות</span>') + "</div>" +
      '<div class="bsum__acts">' +
      '<a class="rrow" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '">' + icon("go") + '<span class="rrow__main"><span class="rrow__title">פתיחת העסק</span></span></a>' +
      '<button type="button" class="rrow" data-act="rename" data-id="' + id + '">' + icon("edit") + '<span class="rrow__main"><span class="rrow__title">עריכה</span></span></button>' +
      '<button type="button" class="rrow" data-act="accounts" data-id="' + id + '">' + icon("users") + '<span class="rrow__main"><span class="rrow__title">ניהול חשבונות</span></span>' +
        (n ? '<span class="rcount" aria-label="' + esc(accCount(n)) + '">' + n + "</span>" : '<span class="rchip rchip--wait">אין חשבונות</span>') + "</button>" +
      '<button type="button" class="rrow" data-act="trash" data-id="' + id + '">' + icon("restore") + '<span class="rrow__main"><span class="rrow__title">נמחקו לאחרונה</span></span></button>' +
      '<button type="button" class="rrow" data-tone="danger" data-act="delete" data-id="' + id + '">' + icon("trash") + '<span class="rrow__main"><span class="rrow__title">מחיקה</span></span></button>' +
      "</div></div>";
  }

  function openSummary(id) {
    var b = byId(id);
    if (!b) return;
    S.open = id;
    if (wide()) {
      if (dlg.open && ctx && ctx.kind === "sum") dlg.close();
      paintSummary();
      root.classList.add("split-open");
      markSel();
      return;
    }
    ctx = { kind: "sum", id: id };
    afterClose = function () { S.open = ""; markSel(); var el = list.querySelector('[data-open="' + CSS.escape(id) + '"]'); if (el) el.focus({ preventScroll: true }); };
    openDialog("sum", esc(b.name), summaryBody(b, false), { size: "md" });
  }
  function paintSummary() {
    var b = byId(S.open);
    if (!b) return;
    if (wide()) side.innerHTML = summaryBody(b, true);
    else if (dlg.open && ctx && ctx.kind === "sum") {
      var body = dlg.querySelector(".sheet-body"), t = dlg.querySelector("#dlgT");
      if (body) body.innerHTML = summaryBody(b, false);
      if (t) t.innerHTML = esc(b.name);
    }
  }
  function closeSummary() {
    if (!S.open) return;
    var wasSide = root.classList.contains("split-open");
    S.open = "";
    root.classList.remove("split-open");
    side.innerHTML = "";
    if (dlg.open && ctx && ctx.kind === "sum") dlg.close();
    if (wasSide) markSel();
  }
  /* across the 1024px line the card becomes a popup or back: close it rather than carry it over half drawn */
  if (wideMQ && wideMQ.addEventListener) wideMQ.addEventListener("change", function () {
    if (S.open) { var id = S.open; closeSummary(); lastOpen = id; markSel(); }
  });

  /* a business's action. In the popup the summary closes first and the action opens after it; beside the list it opens above the card. */
  function summaryAct(act, id) {
    if (dlg.open && ctx && ctx.kind === "sum") {
      afterClose = function () { S.open = ""; markSel(); rowAct(act, id); };
      dlg.close();
      return;
    }
    rowAct(act, id);
  }

  wrap.addEventListener("click", wrapClick);
  side.addEventListener("click", wrapClick);
  function wrapClick(e) {
    var o = e.target.closest("[data-open]");
    if (o && !e.target.closest("[data-act]")) { openSummary(o.dataset.open); return; }
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act, id = t.dataset.id;
    if (act === "rename" || act === "delete" || act === "accounts" || act === "trash") rowAct(act, id);
    else if (act === "close-side") { lastOpen = S.open; closeSummary(); }
    else if (act === "new") openBiz("");
    else if (act === "reload") loadManager();
    else if (act === "retry") boot();
    else if (act === "signout") doSignOut();
  }
  /* a row is a button: Enter and Space open it, like the participants rows */
  wrap.addEventListener("keydown", function (e) {
    var o = e.target.closest && e.target.closest("[data-open]");
    if (o && o === e.target && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openSummary(o.dataset.open); }
  });
  $("#q").addEventListener("input", function () { S.q = this.value; renderList(); fabLabel(); });
  /* one add button for the list, as on the participants page: with a name typed in the search it adds that business, without one it asks for the name.
     On a wide screen the list is one pane of two, so the button sits in the pane's bottom corner (the list's own add row stays in the DOM for it to click, never visible). */
  var fab = document.createElement("button");
  fab.type = "button"; fab.className = "rfab"; fab.id = "newBiz"; fab.hidden = true;
  fab.innerHTML = icon("plus");
  document.body.appendChild(fab);
  function fabLabel() { var t = clean(S.q), l = t ? "הוספת עסק חדש: " + t : "עסק חדש"; fab.setAttribute("aria-label", l); fab.setAttribute("title", l); }
  function placeFab() {
    var live = !wrap.hidden && !vbar.hidden;
    fab.hidden = !live;
    var r = list.getBoundingClientRect();
    if (r.width > 0) fab.style.setProperty("--fab-left", Math.round(r.left + 16) + "px");   /* 16 = the gutter token */
  }
  fab.addEventListener("click", function () {
    var an = $("#addNew");
    if (clean(S.q) && an) { an.click(); return; }
    var q = $("#q"); q.placeholder = "שם העסק החדש"; q.addEventListener("blur", function () { q.placeholder = " "; }, { once: true }); q.focus();
  });
  fabLabel();
  window.addEventListener("resize", placeFab);
  if (window.ResizeObserver) new ResizeObserver(placeFab).observe(list);
  new MutationObserver(placeFab).observe(wrap, { attributes: true, attributeFilter: ["hidden"] });
  new MutationObserver(placeFab).observe(vbar, { attributes: true, attributeFilter: ["hidden"] });
  $("#qClear").addEventListener("click", function () { var q = $("#q"); q.value = ""; S.q = ""; renderList(); q.focus(); });
  /* the actions inside the summary popup */
  dlg.addEventListener("click", function (e) {
    var t = e.target.closest(".bsum [data-act]");
    if (t) summaryAct(t.dataset.act, t.dataset.id);
  });

  /* wide screen: the width of the list can be changed by dragging the line between it and the card (arrows on the keyboard, a double click returns it); kept in this browser */
  (function () {
    var KEY = "roster_admin_listw", h = $("#splitHandle");
    function clampW(w) { return Math.round(Math.max(360, Math.min(w, window.innerWidth - 420))); }
    function curW() { return wrap.getBoundingClientRect().width; }
    function setW(w) { root.style.setProperty("--listw", clampW(w) + "px"); }
    function save() { try { localStorage.setItem(KEY, String(Math.round(curW()))); } catch (e) { /* not kept */ } }
    var saved = null; try { saved = Number(localStorage.getItem(KEY)) || null; } catch (e) { /* none */ }
    if (saved) setW(saved);
    window.addEventListener("resize", function () { var w = parseFloat(root.style.getPropertyValue("--listw")); if (w) setW(w); });
    if (!h) return;
    var drag = false;
    h.addEventListener("pointerdown", function (e) { if (!wide() || e.button > 0) return; drag = true; h.setPointerCapture(e.pointerId); root.classList.add("split-drag"); e.preventDefault(); });
    h.addEventListener("pointermove", function (e) { if (drag) setW(window.innerWidth - e.clientX); });
    function end() { if (!drag) return; drag = false; root.classList.remove("split-drag"); save(); }
    h.addEventListener("pointerup", end); h.addEventListener("pointercancel", end);
    h.addEventListener("dblclick", function () { root.style.removeProperty("--listw"); try { localStorage.removeItem(KEY); } catch (e) { /* none */ } });
    h.addEventListener("keydown", function (e) { if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return; e.preventDefault(); setW(curW() + (e.key === "ArrowLeft" ? 24 : -24)); save(); });
  })();

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
    if (!edit && clean(S.q)) { name.value = clean(S.q).slice(0, 80); if (slug) slug.value = slugFrom(name.value); }   /* what was typed in the search becomes the name */
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
        ? api("/rest/v1/businesses?id=eq." + encodeURIComponent(b.id), { method: "PATCH", json: patch, prefer: "return=representation" })
        : api("/rest/v1/businesses", { method: "POST", json: { slug: sg, name: nm }, prefer: "return=representation" });
      req.then(function (res) {
        if (edit) {
          if (!Array.isArray(res) || !res.length) throw new Error("not saved");
          var renamed = b.slug !== sg;
          b.name = nm; b.slug = sg;
          renderList();
          toast(renamed ? "העסק עודכן. הכתובת החדשה: " + (location.pathname.indexOf("/roster/") === 0 ? "floa.co.il/roster/" : location.host + "/") + sg : "השם עודכן");
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
        if (disp && disp !== nm) api("/rest/v1/business_settings?business_id=eq." + encodeURIComponent(row.id), { method: "PATCH", json: { sender_name: disp } }).then(enter, enter);
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
    api("/rest/v1/business_users", { method: "POST", json: { business_id: b.id, email: email } })
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
            return rest("/rest/v1/business_users?business_id=eq." + encodeURIComponent(bizId) + "&email=eq." + encodeURIComponent(email),
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
            return rest("/rest/v1/businesses?id=eq." + encodeURIComponent(b.id), { method: "DELETE", prefer: "return=representation", keepalive: o && o.keepalive }).then(function (res) {
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
    return rest("/rest/v1/rpc/trash_list", { method: "POST", json: bizId ? {} : { p_kind: "business" }, biz: bizId || undefined });
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
      rest("/rest/v1/rpc/restore", { method: "POST", json: { p_kind: kind, p_id: id }, biz: c.id || undefined }).then(function (res) {
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
          rest("/rest/v1/rpc/purge", { method: "POST", json: { p_kind: kind, p_id: id }, biz: c.id || undefined }).then(function () {
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
