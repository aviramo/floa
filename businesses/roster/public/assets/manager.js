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

   The PAGE never scrolls. The header stays, and only the list inside its own
   box scrolls; a dialog scrolls inside itself.
   ===================================================================== */
(function () {
  "use strict";

  /* Never inside somebody else's frame (a transparent frame over a "delete" button): hide, and do nothing. */
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  var A = window.FLOA_AUTH;
  var TITLE = "ניהול משתתפים";
  var MANY = 7;                                   /* above this many businesses the list gets a search field */
  var SLUG_RE = /^[a-z][a-z0-9-]{1,39}$/;
  var MAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

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
    mailEmpty: "צריך לכתוב כתובת מייל של חשבון Google.",
    mailBad: "כתובת המייל לא נראית תקינה.",
    mailTaken: "החשבון הזה כבר מחובר לעסק.",
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
  };
  function icon(n, cls) {
    var x = ICONS[n];
    return '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" ' +
      (x[0] === "f" ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"') +
      ' aria-hidden="true">' + x[1] + "</svg>";
  }

  /* ---------- state ---------- */
  var gate = $("#gate"), wrap = $("#wrap"), view = $("#view"), menu = $("#menu"), dlg = $("#dlg");
  function blank() { return { isSuper: false, biz: [], users: {}, q: "" }; }
  var S = blank();
  var epoch = 0;            /* bumped on every sign-out, so a late answer cannot repaint someone else's data */
  var ctx = null;           /* the open dialog's context */
  var afterClose = null;    /* where focus goes when the dialog closes */
  var menuBtn = null, menuId = "";
  var toastTimer = 0;

  function byId(id) { for (var i = 0; i < S.biz.length; i++) if (S.biz[i].id === id) return S.biz[i]; return null; }
  function setView(html) { view.innerHTML = html; }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("on"); }, 2800);
  }

  /* ---------- the database, as the person ---------- */
  function api(path, opts) {
    return A.api(path, opts).catch(function (e) {
      if (e && e.signedOut) showGate(T.expired);
      throw e;
    });
  }
  /* Only a conflict has words of its own; everything else is one calm sentence. */
  function problem(e, conflict) { return e && e.status === 409 && conflict ? conflict : T.generic; }

  /* ---------- gate and sign-out ---------- */
  function showGate(note) {
    epoch++;
    afterClose = null; ctx = null;
    closeMenu();
    if (dlg.open) dlg.close();
    S = blank();
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
    var first = $(".mi", menu);
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
    var items = Array.prototype.slice.call(menu.querySelectorAll(".mi"));
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
      '<div class="mhead">' + (name ? "<b>" + esc(name) + "</b>" : "") +
      (email ? '<bdi class="mmail" dir="ltr">' + esc(email) + "</bdi>" : "") +
      (S.isSuper ? '<span class="tg">מנהל המערכת</span>' : "") + "</div>" +
      '<button type="button" class="mi" role="menuitem" data-act="signout">' + icon("logout") + "<span>יציאה</span></button>");
  });

  menu.addEventListener("click", function (e) {
    var t = e.target.closest("[data-act]");
    if (!t) return;
    var act = t.dataset.act, id = menuId;
    closeMenu();
    if (act === "signout") return doSignOut();
    if (act === "rename") openBiz(id);
    else if (act === "accounts") openAccounts(id, "menu");
    else if (act === "delete") openDelete(id);
  });

  /* ---------- dialogs ---------- */
  function openDialog(kind, titleHtml, bodyHtml) {
    dlg.className = kind;
    dlg.innerHTML =
      '<div class="sheet"><div class="sheet-head"><h2 id="dlgT">' + titleHtml + "</h2>" +
      '<button type="button" class="hicon" data-close aria-label="סגירה">' + icon("x") + "</button></div>" +
      '<div class="sheet-body">' + bodyHtml + "</div></div>";
    if (!dlg.open) dlg.showModal();
  }
  /* Where focus goes after the dialog: the row's control, or "new business" if the row is gone. */
  function back(id, act) {
    return function () {
      var el = id ? view.querySelector('[data-act="' + act + '"][data-id="' + CSS.escape(id) + '"]') : null;
      if (!el) el = $("#newBiz");
      if (el) el.focus();
    };
  }
  var downOnBackdrop = false;
  dlg.addEventListener("mousedown", function (e) { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", function (e) {
    if (e.target === dlg) { if (downOnBackdrop) dlg.close(); return; }
    if (e.target.closest("[data-close]")) return dlg.close();
    var a = e.target.closest("[data-acc]");
    if (a) accAction(a);
  });
  dlg.addEventListener("cancel", function (e) {          /* Esc first takes back a pending "remove?", then closes */
    if (ctx && ctx.kind === "acc" && ctx.confirm) { e.preventDefault(); accAction({ dataset: { acc: "rmno" } }); }
  });
  dlg.addEventListener("close", function () {
    var f = afterClose;
    afterClose = null; ctx = null;
    dlg.textContent = "";
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
    setView('<div class="empty" role="status">טוען…</div>');
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
        setView('<div class="empty" role="status">מעביר לעסק…</div>');
        return location.replace("admin/?biz=" + encodeURIComponent(list[0].slug));
      }
      showPicker(list);
    }).catch(function (e) {
      if (e && e.signedOut) return;
      if (epoch !== mine) return;
      setView('<div class="empty"><b>לא הצלחנו לטעון</b>' + esc(T.loadFail) + '<br><button type="button" class="btn ghost" data-act="retry">ניסיון נוסף</button></div>');
    });
  }

  function showNone() {
    var em = A.email();
    setView('<div class="center"><div class="cbox"><div class="mark" aria-hidden="true">' + icon("users") + "</div>" +
      "<p>" + (em ? 'החשבון <bdi dir="ltr">' + esc(em) + "</bdi>" : "החשבון הזה") +
      " עוד לא מחובר לאף עסק. מי שמנהל את המערכת יכול לחבר אותו.</p>" +
      '<button type="button" class="btn ghost" data-act="signout">יציאה והחלפת חשבון</button></div></div>');
  }

  function showPicker(list) {
    setView('<div class="list"><div class="lbox"><div class="vhead"><h2>בחרו עסק</h2><p>החשבון הזה מחובר ליותר מעסק אחד.</p></div>' +
      list.map(function (b) {
        return '<a class="prow" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '"><span class="rmain"><span class="rname">' + esc(b.name) +
          '</span><span class="rsub"><bdi class="slug" dir="ltr">' + esc(b.slug) + "</bdi></span></span>" + icon("go") + "</a>";
      }).join("") + "</div></div>");
  }

  /* ---------- the manager ---------- */
  function showManager() {
    setView('<div class="bar"><div class="col bar-in">' +
      '<button type="button" class="btn add" id="newBiz" data-act="new">' + icon("plus") + "עסק חדש</button>" +
      '<input type="search" class="sinp" id="q" placeholder="חיפוש עסק" aria-label="חיפוש עסק" autocomplete="off" hidden>' +
      '</div></div><div class="list" id="list"><div class="group" hidden><div class="list-in" id="count"></div></div>' +
      '<div class="lbox" id="listIn"><div class="empty" role="status">טוען…</div></div></div>');
    $("#q").addEventListener("input", function () { S.q = this.value; renderList(); });
    loadManager();
  }

  function loadManager() {
    var mine = epoch;
    var l = $("#listIn");
    if (l && !S.biz.length) l.innerHTML = '<div class="empty" role="status">טוען…</div>';
    Promise.all([
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
      if (l2) l2.innerHTML = '<div class="empty"><b>לא הצלחנו לטעון את העסקים</b>' + esc(T.loadFail) + '<br><button type="button" class="btn ghost" data-act="reload">ניסיון נוסף</button></div>';
    });
  }

  function rowHtml(b) {
    var n = (S.users[b.id] || []).length, id = esc(b.id);
    return '<div class="row" data-row="' + id + '">' +
      '<div class="rmain"><span class="rname">' + esc(b.name) + "</span>" +
      '<div class="rsub"><bdi class="slug" dir="ltr">' + esc(b.slug) + "</bdi>" +
      '<button type="button" class="tg' + (n ? "" : " warn") + '" data-act="accounts" data-id="' + id + '" aria-label="ניהול חשבונות של ' + esc(b.name) + ", " + accCount(n) + '">' + accCount(n) + "</button></div></div>" +
      '<a class="btn ghost sm open" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '" aria-label="פתיחת ' + esc(b.name) + '">פתיחה' + icon("go", "i18") + "</a>" +
      '<button type="button" class="hicon" data-act="menu" data-id="' + id + '" aria-haspopup="menu" aria-expanded="false" aria-label="עוד פעולות: ' + esc(b.name) + '">' + icon("dots") + "</button></div>";
  }

  function renderList() {
    var box = $("#listIn");
    if (!box) return;
    var q = $("#q"), many = S.biz.length > MANY;
    q.hidden = !many;
    var term = many ? lc(S.q) : "";
    var rows = S.biz.filter(function (b) { return !term || lc(b.name).indexOf(term) > -1 || b.slug.indexOf(term) > -1; });
    $("#count").textContent = term ? rows.length + " מתוך " + bizCount(S.biz.length) : bizCount(S.biz.length);
    $("#count").parentNode.hidden = false;
    var html = "";
    if (!S.biz.length) {
      html += '<div class="empty"><b>עוד אין עסקים</b>כל עסק מקבל מזהה משלו, ורשימה של חשבונות Google שמנהלים אותו. אפשר להתחיל מ"עסק חדש".</div>';
    } else if (!rows.length) {
      html += '<div class="empty"><b>לא נמצא עסק</b>אין עסק שהשם או המזהה שלו מכילים את מה שכתבתם.</div>';
    } else {
      html += rows.map(rowHtml).join("");
    }
    box.innerHTML = html;
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
      openMenu(t,
        '<a class="mi" role="menuitem" href="admin/?biz=' + esc(encodeURIComponent(b.slug)) + '">' + icon("go") + "<span>פתיחה</span></a>" +
        '<button type="button" class="mi" role="menuitem" data-act="rename">' + icon("edit") + "<span>שינוי שם</span></button>" +
        '<button type="button" class="mi" role="menuitem" data-act="accounts">' + icon("users") + "<span>ניהול חשבונות</span></button>" +
        '<button type="button" class="mi danger" role="menuitem" data-act="delete">' + icon("trash") + "<span>מחיקה</span></button>");
    }
    else if (act === "accounts") openAccounts(id, "accounts");
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
  function checkSlug(slug) {
    if (!slug) return T.slugEmpty;
    if (slug.length < 2 || slug.length > 40) return T.slugLen;
    if (!/^[a-z]/.test(slug)) return /^[a-z0-9-]+$/.test(slug) ? T.slugStart : T.slugChars;
    if (!SLUG_RE.test(slug)) return T.slugChars;
    for (var i = 0; i < S.biz.length; i++) if (S.biz[i].slug === slug) return T.slugTaken;
    return "";
  }

  function openBiz(id) {
    var b = id ? byId(id) : null;
    if (id && !b) return;
    var edit = !!b;
    ctx = { kind: "biz", id: id, busy: false, touched: false };
    afterClose = edit ? back(id, "menu") : null;
    openDialog("form", edit ? "שינוי שם" : "עסק חדש",
      '<form id="bForm" novalidate>' +
      '<label class="field"><span>שם העסק</span><input id="bName" maxlength="80" autocomplete="off" autofocus value="' + esc(b ? b.name : "") + '"></label>' +
      (edit
        ? '<div class="field"><span>מזהה</span><div class="static"><bdi dir="ltr">' + esc(b.slug) + '</bdi></div></div><p class="hint">אי אפשר לשנות את המזהה אחרי שהעסק נוצר.</p>'
        : '<label class="field"><span>מזהה באותיות לטיניות</span><input id="bSlug" class="ltr" dir="ltr" maxlength="40" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="dana-yoga"></label>' +
          '<p class="hint">אותיות לטיניות קטנות, ספרות ומקפים, 2 עד 40 תווים, ומתחיל באות. המזהה מופיע בכתובת של דף הניהול של העסק, ואי אפשר לשנות אותו אחר כך.</p>') +
      '<div class="ferr" id="bErr" role="alert"></div>' +
      '<button type="submit" class="btn block" id="bGo">' + (edit ? "שמירה" : "יצירת עסק") + "</button></form>");

    var name = $("#bName"), slug = $("#bSlug");
    function bad(msg, field) {
      $("#bErr").textContent = msg;
      name.setAttribute("aria-invalid", field === "bName" ? "true" : "false");
      if (slug) slug.setAttribute("aria-invalid", field === "bSlug" ? "true" : "false");
      if (field) $("#" + field).focus();
    }
    function ok() { $("#bErr").textContent = ""; name.removeAttribute("aria-invalid"); if (slug) slug.removeAttribute("aria-invalid"); }
    name.addEventListener("input", function () {
      ok();
      if (slug && !ctx.touched) slug.value = slugFrom(name.value.trim());
    });
    if (slug) slug.addEventListener("input", function () {
      ok();
      var v = slug.value.toLowerCase();
      if (v !== slug.value) slug.value = v;
      ctx.touched = v !== "";                    /* clearing it hands the field back to the name */
    });

    $("#bForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var c = ctx;
      if (c.busy) return;
      var nm = clean(name.value), sg = slug ? lc(slug.value) : "";
      var msg = checkName(nm);
      if (msg) return bad(msg, "bName");
      if (!edit) { msg = checkSlug(sg); if (msg) return bad(msg, "bSlug"); }
      if (edit && nm === b.name) return dlg.close();
      c.busy = true; $("#bGo").disabled = true; ok();

      var req = edit
        ? api("/rest/v1/roster_businesses?id=eq." + encodeURIComponent(b.id), { method: "PATCH", json: { name: nm }, prefer: "return=representation" })
        : api("/rest/v1/roster_businesses", { method: "POST", json: { slug: sg, name: nm }, prefer: "return=representation" });
      req.then(function (res) {
        if (edit) {
          if (!Array.isArray(res) || !res.length) throw new Error("not saved");
          b.name = nm;
          renderList();
          toast("השם עודכן");
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
        S.q = "";
        var q = $("#q"); if (q) q.value = "";
        renderList();
        flash(row.id);
        toast("העסק נוצר");
        if (ctx === c) { afterClose = back(row.id, "menu"); dlg.close(); }
      }).catch(function (err) {
        if (err && err.signedOut) return;
        if (ctx !== c) return;
        c.busy = false; $("#bGo").disabled = false;
        if (!edit && err && err.status === 409) bad(T.slugTaken, "bSlug");
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

  function openAccounts(id, act) {
    var b = byId(id);
    if (!b) return;
    ctx = { kind: "acc", id: id, confirm: "", busy: false };
    afterClose = back(id, act);
    openDialog("acc", "חשבונות של <bdi>" + esc(b.name) + "</bdi>",
      '<p class="hint">מי שנכנס עם אחד מחשבונות ה־Google האלה מנהל את המשתתפים של העסק.</p>' +
      '<form class="addrow" id="aForm" novalidate>' +
      '<label class="field"><span class="sr">כתובת מייל של חשבון Google</span><input id="aEmail" type="email" class="ltr" dir="ltr" placeholder="name@gmail.com" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="email"></label>' +
      '<button type="submit" class="btn" id="aAdd">הוספה</button></form>' +
      '<div class="ferr" id="aErr" role="alert"></div>' +
      '<div id="aMine"></div><div class="clabel" id="aCount"></div><div class="acclist" id="aList"></div>');
    $("#aEmail").addEventListener("input", function () { $("#aErr").textContent = ""; this.removeAttribute("aria-invalid"); });
    $("#aForm").addEventListener("submit", function (e) {
      e.preventDefault();
      addAccount(lc($("#aEmail").value), true);
    });
    renderAcc();
  }

  function renderAcc() {
    var c = ctx;
    if (!c || c.kind !== "acc") return;
    var b = byId(c.id);
    if (!b) return;
    var list = S.users[b.id] || [], me = lc(A.email());
    $("#aCount").textContent = list.length ? "חשבונות מחוברים (" + list.length + ")" : "";
    $("#aMine").innerHTML = me && list.indexOf(me) < 0
      ? '<button type="button" class="linkbtn" data-acc="me">הוספת החשבון שלי (<bdi dir="ltr">' + esc(me) + "</bdi>)</button>"
      : "";
    $("#aList").innerHTML = list.length ? list.map(function (em) {
      var e = esc(em);
      if (c.confirm === em) {
        return '<div class="arow ask"><div class="aq">להסיר את <bdi dir="ltr">' + e + '</bdi> מהעסק?</div><div class="abtns">' +
          '<button type="button" class="btn sm danger" data-acc="rmyes" data-email="' + e + '">הסרה</button>' +
          '<button type="button" class="btn sm ghost" data-acc="rmno" data-email="' + e + '">ביטול</button></div></div>';
      }
      return '<div class="arow"><span class="aem"><bdi dir="ltr">' + e + "</bdi></span>" + (em === me ? '<span class="tg">אתם</span>' : "") +
        '<button type="button" class="hicon stdel" data-acc="rm" data-email="' + e + '" aria-label="הסרת ' + e + '">' + icon("trash") + "</button></div>";
    }).join("") : '<div class="mnone">עוד לא חובר אף חשבון. אפשר להוסיף כתובת מייל של חשבון Google למעלה.</div>';
  }

  function focusAcc(kind, email) {
    var all = dlg.querySelectorAll('[data-acc="' + kind + '"]');
    for (var i = 0; i < all.length; i++) if (all[i].dataset.email === email) { all[i].focus(); return true; }
    return false;
  }

  function accAction(t) {
    var c = ctx;
    if (!c || c.kind !== "acc" || c.busy) return;
    var a = t.dataset.acc, email = t.dataset.email || "";
    if (a === "rm") { c.confirm = email; renderAcc(); focusAcc("rmno", email); }
    else if (a === "rmno") { var prev = c.confirm; c.confirm = ""; renderAcc(); focusAcc("rm", prev); }
    else if (a === "rmyes") removeAccount(email);
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
      $("#aErr").textContent = msg;
      var inp = $("#aEmail");
      if (fromField) { inp.setAttribute("aria-invalid", "true"); inp.focus(); }
      return;
    }
    $("#aErr").textContent = "";
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
        $("#aErr").textContent = problem(err, T.mailTaken);
        if (fromField) $("#aEmail").focus();
      });
  }

  function removeAccount(email) {
    var c = ctx, b = byId(c.id);
    if (!b || c.busy) return;
    $("#aErr").textContent = "";
    accBusy(c, true);
    api("/rest/v1/roster_business_users?business_id=eq." + encodeURIComponent(b.id) + "&email=eq." + encodeURIComponent(email),
      { method: "DELETE", prefer: "return=representation" })
      .then(function (res) {
        if (Array.isArray(res) && !res.length) throw new Error("nothing removed");
        var l = S.users[b.id] || [], i = l.indexOf(email);
        if (i > -1) l.splice(i, 1);
        renderList();
        toast("החשבון הוסר");
        if (ctx !== c) return;
        c.confirm = "";
        accBusy(c, false);
        renderAcc();
        $("#aEmail").focus();
      })
      .catch(function (err) {
        if (err && err.signedOut) return;
        if (ctx !== c) return;
        c.confirm = "";
        accBusy(c, false);
        renderAcc();
        $("#aErr").textContent = T.generic;
      });
  }

  /* ---------- delete a business: the name has to be typed ---------- */
  function openDelete(id) {
    var b = byId(id);
    if (!b) return;
    ctx = { kind: "del", id: id, busy: false };
    afterClose = back(id, "menu");
    openDialog("form", "מחיקת עסק",
      '<div class="warnbox">מחיקת העסק <b>' + esc(b.name) + "</b> תמחק גם את כל המשתתפים, המפגשים והתשלומים שלו. אי אפשר לבטל את זה.</div>" +
      '<form id="dForm" novalidate><label class="field"><span>כדי לאשר, כתבו את שם העסק</span><input id="dName" autocomplete="off" autofocus></label>' +
      '<div class="ferr" id="dErr" role="alert"></div>' +
      '<button type="submit" class="btn danger block" id="dGo" disabled>מחיקת העסק</button></form>');
    var inp = $("#dName"), go = $("#dGo");
    inp.addEventListener("input", function () {
      $("#dErr").textContent = "";
      go.disabled = ctx.busy || clean(inp.value) !== clean(b.name);
    });
    $("#dForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var c = ctx;
      if (c.busy || clean(inp.value) !== clean(b.name)) return;
      c.busy = true; go.disabled = true;
      api("/rest/v1/roster_businesses?id=eq." + encodeURIComponent(b.id), { method: "DELETE", prefer: "return=representation" })
        .then(function (res) {
          if (Array.isArray(res) && !res.length) throw new Error("nothing deleted");
          S.biz = S.biz.filter(function (x) { return x.id !== b.id; });
          delete S.users[b.id];
          renderList();
          toast("העסק נמחק");
          if (ctx === c) dlg.close();
        })
        .catch(function (err) {
          if (err && err.signedOut) return;
          if (ctx !== c) return;
          c.busy = false;
          go.disabled = clean(inp.value) !== clean(b.name);
          $("#dErr").textContent = T.generic;
        });
    });
  }

  /* ---------- go ---------- */
  $("#gLogin").addEventListener("click", function () { if (A) A.signIn(); });
  boot();
})();
