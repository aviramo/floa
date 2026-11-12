/* =====================================================================
   Roster, the connections page (/roster/connect/?biz=<slug>).

   Where a business plugs itself in: API keys, a webhook, the mails the system
   sends in its name, and how registration and the personal area behave.

   Same gate and same tenant handling as the admin page:
     * the sign-in is the domain's (/auth.js, FLOA_AUTH); this page keeps no
       session of its own
     * ?biz=<slug> is resolved through roster_my_businesses, and every REST and
       RPC call after that carries `x-business: <business id>`; the page never
       sends a business_id of its own
     * FLOA_AUTH.api cannot send an extra header, so this page has its own
       fetch wrapper that takes the token from FLOA_AUTH.token()

   The database does the real gatekeeping (RLS). Nothing here is trusted. A
   secret (a new key, a webhook secret) is shown ONCE and never kept.

   The PAGE never scrolls: the header and the tabs stay, and the panel under
   them scrolls inside its own box; a dialog scrolls inside itself.

   Security, in the order it matters here:
     * index.html carries a Content-Security-Policy: scripts only from this site,
       connections only to the database host, no remote images. There is no inline
       script and no inline handler anywhere, which is what makes that policy true.
     * Every value from the database goes into the page through esc(); a status the
       page does not know is shown as text and never becomes a class or a tag.
     * A mail template is member-written text. The editor refuses one over MAX_TPL
       characters or with more than MAX_DATA_IF data-if before it parses anything,
       and its data-if handling is a single left-to-right scan (the first version was
       one regular expression that backtracks cubically and froze the tab).
     * Previews and sent mails are shown in sandbox="" frames that may fetch nothing.
     * Who the mails are FROM and who is told is the owner's alone (read-only here for
       anybody else; the database refuses the write too).
     * Framed by another page, this page hides itself and asks for nothing.
   ===================================================================== */
(function () {
  "use strict";

  /* Never inside somebody else's frame: nothing is drawn and nothing is asked of the database.
     (A page cannot refuse framing by itself; this hides it, so a click on a transparent frame hits nothing.) */
  if (window.top !== window.self) { document.documentElement.hidden = true; return; }

  const A = window.FLOA_AUTH, SB = window.SUPABASE;
  const DEF = window.ROSTER_MAIL_DEFAULTS || {};
  const ME_URL = "https://floa.co.il/roster/me/";
  const SK = "roster_connect_biz";        /* ?biz= survives the Google round trip, like the admin page's roster_deep */
  const TITLE = "חיבורים";

  /* ---------- words ---------- */
  const T = {
    generic: "לא הצלחנו להשלים את הפעולה. אפשר לנסות שוב בעוד רגע.",
    expired: "ההתחברות פגה. צריך להיכנס שוב.",
    noAuth: "לא הצלחנו לטעון את מערכת הכניסה. נסו לרענן את הדף.",
    loadFail: "לא הצלחנו לטעון. בדקו את החיבור ונסו שוב.",
    saved: "נשמר",
    noChange: "אין שינויים לשמור",
    copied: "הועתק",
    copyFail: "ההעתקה לא הצליחה. אפשר לסמן את הטקסט ולהעתיק ידנית",
  };
  const HOOK_EVENTS = [
    ["participant.created", "משתתף חדש", "נוצר משתתף חדש, מכל מקור."],
    ["registration.created", "הרשמה למפגש", "משתתף נרשם למפגש."],
    ["registration.cancelled", "ביטול הרשמה", "הרשמה למפגש בוטלה."],
    ["payment.reported", "דיווח על תשלום", "משתתף לחץ על שילמתי."],
    ["payment.recorded", "תשלום נרשם", "נרשם תשלום, הפקדה או החזר."],
  ];
  const TYPE_NAME = { "participant.created": "משתתף חדש", "registration.created": "הרשמה למפגש", "registration.cancelled": "ביטול הרשמה", "payment.reported": "דיווח על תשלום", "payment.recorded": "תשלום נרשם", ping: "בדיקה (ping)" };
  const FIELDS = [
    ["first_name", "שם פרטי", true], ["last_name", "שם משפחה", false], ["phone", "טלפון", true],
    ["email", "אימייל", false], ["age", "גיל", false], ["gender", "מגדר", false],
  ];
  const VAR_NAME = {
    business_name: "שם העסק", first_name: "שם פרטי", last_name: "שם משפחה", full_name: "שם מלא", phone: "טלפון", email: "אימייל", age: "גיל", gender: "מגדר", account_email: "אימייל החשבון", account_name: "שם בחשבון",
    meeting_name: "שם המפגש", meeting_date: "תאריך", meeting_time: "שעה", place: "מקום", city: "עיר", price: "מחיר", amount: "סכום", method: "דרך תשלום", directions: "הוראות הגעה",
    my_link: "קישור לאזור האישי", pay_link: "קישור לתשלום", whatsapp_link: "קישור לוואטסאפ", admin_link: "קישור לניהול",
  };
  /* what a participant typed, and the payment method: escaped even inside {{{x}}} (the Worker's rule) */
  const UNTRUSTED = new Set(["first_name", "last_name", "full_name", "phone", "email", "age", "gender", "method", "account_email", "account_name"]);
  const TPL_ORDER = ["admin_signup", "admin_payment_reported", "admin_account_linked", "admin_phone_conflict", "registered", "payment_confirmed", "refund", "registration_cancelled"];
  /* a template is shown to the editor and rendered by the Worker: the same bounds as the database and the Worker */
  const MAX_TPL = 20000, MAX_DATA_IF = 50;
  const SETTINGS_COLS = "registration_open,signup_required,personal_area_enabled,participant_mail_enabled,mail_off_types,notify_emails,contact_email,sender_name,mail_from_address,contact_whatsapp,payment_url,webhook_url,webhook_events,webhook_secret_set,updated_at";
  const KEY_COLS = "id,kind,prefix,label,allowed_origins,created_by,created_at,last_used_at,revoked_at";   /* never key_hash */
  const MAIL_RE = /^[^\s@,;<>()"]+@[^\s@,;<>()"]+\.[^\s@,;<>()"]{2,}$/;

  /* ---------- helpers ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const ENT = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ENT[c]);
  const enc = encodeURIComponent;
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const lc = (s) => String(s || "").trim().toLowerCase();
  const DTF = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fmtDate = (iso) => { try { return DTF.format(new Date(iso)); } catch (e) { return ""; } };
  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!iso || isNaN(t)) return "";
    const s = (Date.now() - t) / 1000;
    if (s < 0) return fmtDate(iso);
    if (s < 45) return "ממש עכשיו";
    const m = Math.round(s / 60);
    if (m < 60) return m <= 1 ? "לפני דקה" : "לפני " + m + " דקות";
    const h = Math.round(s / 3600);
    if (h < 24) return h <= 1 ? "לפני שעה" : "לפני " + h + " שעות";
    const d = Math.round(s / 86400);
    if (d < 7) return d <= 1 ? "אתמול" : "לפני " + d + " ימים";
    return fmtDate(iso);
  }
  const mono = (s) => '<bdi class="mono" dir="ltr">' + esc(s) + "</bdi>";

  const ICON = {
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    x: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
    swap: '<path d="M7 4L3 8l4 4"/><path d="M3 8h14"/><path d="M17 20l4-4-4-4"/><path d="M21 16H7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.4c1.9.7 3 2.5 3 5.6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.2L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.2L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  };
  const icon = (n, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[n] + "</svg>";

  /* ---------- state ---------- */
  const gate = $("#gate"), wrap = $("#wrap"), panel = $("#panel"), menu = $("#menu"), dlg = $("#dlg");
  let BIZ = { slug: "", id: "", name: "" };
  let MINE = [];
  let D = blankData();
  const S = { tab: "keys", seg: "hook" };
  let epoch = 0, ctx = null, afterClose = null, menuBtn = null, toastTimer = 0;
  function blankData() { return { keys: undefined, settings: undefined, templates: undefined, events: undefined, deliveries: undefined, mails: undefined, err: {} }; }

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), 2800);
  }

  /* ---------- the database, as the person, for ONE business ---------- */
  function signedOutError() { const e = new Error("signed out"); e.signedOut = true; return e; }
  async function rest(path, o) {
    o = o || {};
    try {
      const t = await A.token();
      const h = { apikey: SB.anonKey, authorization: "Bearer " + t };
      if (!o.noBiz) h["x-business"] = BIZ.id;
      if (o.json !== undefined) h["content-type"] = "application/json";
      if (o.prefer) h.prefer = o.prefer;
      const r = await fetch(SB.url + "/rest/v1/" + path, { method: o.method || "GET", headers: h, body: o.json !== undefined ? JSON.stringify(o.json) : undefined });
      if (r.status === 401) throw signedOutError();
      const txt = await r.text();
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch (e) { /* not JSON */ }
      if (!r.ok) { const e = new Error("request failed " + r.status); e.status = r.status; e.code = data && data.code; throw e; }
      return data;
    } catch (e) {
      if (e && e.signedOut) { A.signOut(); sessionLost(); }   /* the session is dead: clear it on this device too, or a reload would try it again */
      throw e;
    }
  }
  const rpc = (name, args) => rest("rpc/" + name, { method: "POST", json: args || {} });
  const problem = (e, conflict) => (e && e.status === 409 && conflict ? conflict : T.generic);

  /* ---------- gate, sign-out ---------- */
  function showGate(note, mode) {
    epoch++;
    afterClose = null; ctx = null;
    closeMenu();
    if (dlg.open) dlg.close();
    D = blankData();
    panel.textContent = ""; $("#bizName").textContent = ""; $("#whoName").textContent = "";   /* nothing of the last person stays in the page */
    wrap.hidden = true;
    gate.hidden = false;
    document.title = TITLE;
    const box = $("#gateIn");
    const mark = '<div class="mark" aria-hidden="true">' + icon("users") + "</div>";
    if (mode === "denied") {
      box.innerHTML = mark + "<h1>אין גישה</h1><p>" + esc(note) + '</p><a class="gbtn" href="../">חזרה לבחירת עסק</a><br><button type="button" class="linkbtn" data-act="signout">יציאה והחלפת חשבון</button>';
    } else if (mode === "nobiz") {
      box.innerHTML = mark + "<h1>לא נבחר עסק</h1><p>" + esc(note) + '</p><a class="gbtn" href="../">לבחירת עסק</a><br><button type="button" class="linkbtn" data-act="signout">יציאה והחלפת חשבון</button>';
    } else if (mode === "fail") {
      box.innerHTML = mark + "<h1>" + TITLE + "</h1><p>" + esc(note) + '</p><button type="button" class="gbtn" data-act="retry-boot">ניסיון נוסף</button>';
    } else {
      box.innerHTML = mark + "<h1>" + TITLE + "</h1><p>מפתחות, Webhook ומיילים של העסק</p>" +
        '<button type="button" class="gbtn" id="gLogin"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>כניסה עם גוגל</button>' +
        '<div class="gnote" id="gNote" role="status">' + esc(note || "") + "</div>";
    }
    const f = $("#gLogin") || $("[data-act]", box) || $(".gbtn", box);
    if (note && f) f.focus();
  }
  function sessionLost() { showGate(T.expired, "in"); }
  function doSignOut() { const p = A.signOut(); showGate("", "in"); return p; }

  gate.addEventListener("click", (e) => {
    if (e.target.closest("#gLogin")) { A.signIn(); return; }
    const t = e.target.closest("[data-act]");
    if (!t) return;
    if (t.dataset.act === "signout") doSignOut();
    else if (t.dataset.act === "retry-boot") boot();
  });

  /* ---------- floating menu ---------- */
  function openMenu(btn, html) {
    closeMenu();
    menu.innerHTML = html;
    menu.hidden = false;
    const r = btn.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    let top = r.bottom + 4;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
    menu.style.top = top + "px";
    btn.setAttribute("aria-expanded", "true");
    menuBtn = btn;
    const first = $(".mi", menu);
    if (first) first.focus({ preventScroll: true });
  }
  function closeMenu(back) {
    if (menu.hidden) return;
    const b = menuBtn;
    menu.hidden = true; menu.innerHTML = ""; menuBtn = null;
    if (b) { b.setAttribute("aria-expanded", "false"); if (back) b.focus(); }
  }
  document.addEventListener("pointerdown", (e) => {
    if (menu.hidden || menu.contains(e.target) || (menuBtn && menuBtn.contains(e.target))) return;
    closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (menu.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeMenu(true); return; }
    if (e.key === "Tab") { const b = menuBtn; closeMenu(); if (b) b.focus(); return; }
    const items = $$(".mi", menu), n = items.length, i = items.indexOf(document.activeElement);
    if (!n) return;
    const go = (k) => { e.preventDefault(); items[k].focus({ preventScroll: true }); };
    if (e.key === "ArrowDown") go((i + 1) % n);
    else if (e.key === "ArrowUp") go((i - 1 + n) % n);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
  });
  window.addEventListener("resize", () => closeMenu());
  document.addEventListener("scroll", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

  $("#userBtn").addEventListener("click", function () {
    if (menuBtn === this) return closeMenu(true);
    const name = A.name(), email = A.email(), row = MINE.find((b) => b.slug === BIZ.slug);
    const several = row && (row.is_super || MINE.length > 1);
    openMenu(this,
      '<div class="mhead">' + (name ? "<b>" + esc(name) + "</b>" : "") + (email ? '<bdi class="mmail" dir="ltr">' + esc(email) + "</bdi>" : "") + "</div>" +
      '<a class="mi" role="menuitem" href="../admin/?biz=' + enc(BIZ.slug) + '">' + icon("users") + "<span>ניהול המשתתפים</span></a>" +
      '<a class="mi" role="menuitem" href="../api/">' + icon("book") + "<span>תיעוד ה־API</span></a>" +
      (several ? '<a class="mi" role="menuitem" href="../">' + icon("swap") + "<span>החלפת עסק</span></a>" : "") +
      '<button type="button" class="mi" role="menuitem" data-act="signout">' + icon("logout") + "<span>יציאה</span></button>");
  });
  menu.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    closeMenu();
    if (t.dataset.act === "signout") doSignOut();
  });

  /* ---------- dialogs ---------- */
  function openDialog(kind, titleHtml, bodyHtml) {
    /* the one shell (assets/sheet.js), from the bottom: fixed header with the X, one scrolling body, the grab bar at the top edge */
    RosterSheet.render(dlg, { kind: kind, title: titleHtml, titleId: "dlgT", body: bodyHtml, from: "bottom", icon: icon("x") });
  }
  /* A secret that is shown once asks twice before it is closed without a copy. */
  function tryClose() {
    if (ctx && ctx.kind === "reveal" && !ctx.copied && !ctx.warned) {
      ctx.warned = true;
      const w = $("#rvWarn");
      if (w) { w.hidden = false; w.textContent = "עוד לא העתקתם. אחרי הסגירה אי אפשר לראות את זה שוב. לחיצה נוספת תסגור בכל זאת."; }
      return;
    }
    dlg.close();
  }
  /* swipe and backdrop go through tryClose too (a secret shown once asks before it is closed without a copy); the shell does not close by itself here */
  RosterSheet.attach(dlg, { from: "bottom", backdrop: false, beforeClose: () => { tryClose(); return false; } });
  let downOnBackdrop = false;
  dlg.addEventListener("mousedown", (e) => { downOnBackdrop = e.target === dlg; });
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) { if (downOnBackdrop) tryClose(); return; }
    if (e.target.closest("[data-close]")) return tryClose();
    const t = e.target.closest("[data-d]");
    if (t) dialogAction(t);
  });
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); tryClose(); });
  dlg.addEventListener("close", () => {
    const f = afterClose;
    afterClose = null; ctx = null;
    dlg.textContent = "";
    if (f) f();
  });
  dlg.addEventListener("submit", (e) => { e.preventDefault(); if (ctx && ctx.kind === "newkey") submitNewKey(); });
  dlg.addEventListener("input", (e) => { if (ctx && ctx.kind === "tpl") templateInput(e); });
  dlg.addEventListener("focusin", (e) => { if (ctx && ctx.kind === "tpl" && (e.target.id === "tSubject" || e.target.id === "tHtml")) ctx.last = e.target.id; });

  /* ---------- copy ---------- */
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  /* ---------- validation (the server checks again) ---------- */
  /* The webhook URL, by the rules the database checks on save (roster_valid_webhook_url) and the Worker checks again at send time
     (worker/src/roster/urls.js): https, a real public hostname, port 443 (absent counts as 443), no credentials, 500 characters.
     Refused hostnames: IP literals in any spelling, localhost, *.workers.dev, a single label, .local .internal .invalid, and the
     wildcard-DNS services (a name like 127.0.0.1.nip.io resolves to a private address, so it would reach inside a network). */
  /* the characters a webhook URL may not contain, listed one range at a time (no \s, whose set depends on the engine): ASCII control
     characters and space, DEL, the Unicode spaces (U+0085 NEL, U+00A0, U+1680, U+2000 to U+200A, U+2028, U+2029, U+202F, U+205F, U+3000),
     the bidi embeddings, overrides and isolates (U+202A to U+202E, U+2066 to U+2069), the zero-width characters (U+200B to U+200D) and
     the byte order mark (U+FEFF). The database refuses the same set. */
  const HIDDEN_CHARS = (() => {
    const ranges = [[0x00, 0x20], [0x7f, 0x7f], [0x85, 0x85], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a], [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000],
      [0x202a, 0x202e], [0x2066, 0x2069], [0x200b, 0x200d], [0xfeff, 0xfeff]];
    const hex = (n) => String.fromCharCode(92) + "u" + n.toString(16).padStart(4, "0");
    return new RegExp("[" + ranges.map(([a, b]) => hex(a) + (b > a ? "-" + hex(b) : "")).join("") + "]");
  })();
  const INTERNAL_SUFFIXES = ["local", "internal", "invalid"];
  const WILDCARD_DNS = ["nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me", "traefik.me", "local.gd", "vcap.me", "lacolhost.com", "1u.ms"];
  const hostEnds = (h, suffix) => h === suffix || h.endsWith("." + suffix);
  function checkUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return { value: "" };
    if (v.length > 500) return { err: "הכתובת ארוכה מדי. עד 500 תווים." };
    if (HIDDEN_CHARS.test(v)) return { err: "בכתובת אסור להשאיר רווחים או תווים סמויים." };
    let u;
    try { u = new URL(v); } catch (e) { return { err: "הכתובת לא נראית תקינה. למשל https://example.com/roster-hook" }; }
    if (u.protocol !== "https:") return { err: "רק כתובות שמתחילות ב־https מותרות." };
    if (u.username || u.password) return { err: "אסור לכלול שם משתמש וסיסמה בכתובת." };
    if (u.port !== "") return { err: "אפשר להשתמש רק בפורט הרגיל של https (443), בלי לציין פורט בכתובת." };
    let h = u.hostname.toLowerCase();
    if (h.endsWith(".")) h = h.slice(0, -1);
    if (!h) return { err: "בכתובת חסר שם אתר." };
    const ip = { err: "כתובת IP לא מתאימה. צריך שם אתר, למשל hooks.example.com." };
    if (h.includes(":") || h.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return ip;
    if (/^\d+$/.test(h.slice(h.lastIndexOf(".") + 1))) return ip;
    if (hostEnds(h, "localhost")) return { err: "localhost לא מתאים: המערכת שולחת מהענן, והכתובת צריכה להיות פומבית." };
    if (hostEnds(h, "workers.dev")) return { err: "כתובות workers.dev לא נתמכות." };
    if (!h.includes(".")) return { err: "צריך שם אתר מלא, למשל hooks.example.com. שם בלי נקודה הוא לא כתובת פומבית." };
    if (INTERNAL_SUFFIXES.some((x) => hostEnds(h, x))) return { err: "כתובת פנימית (שמסתיימת ב־.local, .internal או .invalid) לא מתאימה: המערכת שולחת מהענן." };
    if (WILDCARD_DNS.some((x) => hostEnds(h, x))) return { err: "שירותים שהופכים כתובת IP לשם אתר (nip.io, sslip.io, localtest.me ודומיהם) לא מתאימים." };
    if (!/^[a-z0-9._-]+$/.test(h)) return { err: "שם האתר כולל תווים שלא מתאימים. כתבו אותו באותיות לטיניות." };
    /* and last, the database's own pattern for the text exactly as it will be stored, so a URL this accepts is one the database accepts */
    if (!/^https:\/\/([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(:443)?([/?#][^\s]*)?$/i.test(v)) return { err: "שם האתר צריך להיות באותיות לטיניות, ספרות ומקפים, עם סיומת של אותיות כמו com או co.il, בלי נקודה בסוף ובלי קו תחתון." };
    return { value: v };
  }
  function checkPublicUrl(raw) {
    const v = String(raw || "").trim();
    if (!v) return { value: "" };
    if (v.length > 500) return { err: "הקישור ארוך מדי. עד 500 תווים." };
    let u;
    try { u = new URL(v); } catch (e) { return { err: "הקישור לא נראה תקין. למשל https://pay.example/studio" }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { err: "הקישור צריך להתחיל ב־https." };
    if (u.username || u.password) return { err: "אסור לכלול שם משתמש וסיסמה בקישור." };
    return { value: v };
  }
  function parseOrigins(text) {
    const parts = String(text || "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
      if (p.includes("*")) return { err: "אי אפשר להשתמש בכוכבית. צריך לכתוב כל אתר במדויק." };
      let u;
      try { u = new URL(p); } catch (e) { return { err: "הכתובת " + p + " לא נראית תקינה. למשל https://studio.example" }; }
      if ((u.protocol !== "https:" && u.protocol !== "http:") || u.username || u.password) return { err: "הכתובת " + p + " לא מתאימה. למשל https://studio.example" };
      if (u.pathname !== "/" || u.search || u.hash) return { err: "הכתובת " + p + " כוללת נתיב. צריך את כתובת האתר בלבד, למשל https://studio.example" };
      if (!out.includes(u.origin)) out.push(u.origin);
    }
    if (out.length > 20) return { err: "אפשר עד 20 אתרים למפתח." };
    return { list: out };
  }
  function parseMails(text, max) {
    const parts = String(text || "").split(/[\s,;]+/).map(lc).filter(Boolean);
    const out = [];
    for (const m of parts) {
      if (m.length > 254 || !MAIL_RE.test(m)) return { err: "הכתובת " + m + " לא נראית תקינה." };
      if (!out.includes(m)) out.push(m);
    }
    if (out.length > max) return { err: "אפשר עד " + max + " כתובות." };
    return { list: out };
  }
  /* a number as people type it, to the international digits wa.me wants: 050-123 4567 and +972 50 123 4567 both become 972501234567 */
  function normWhatsapp(raw) {
    let d = String(raw || "").replace(/[^\d+]/g, "");
    if (!d) return { value: "" };
    const plus = d.startsWith("+");
    d = d.replace(/\D/g, "");
    if (!plus && d.startsWith("00")) d = d.slice(2);
    else if (!plus && d.startsWith("0")) d = "972" + d.slice(1);
    if (d.length < 9 || d.length > 15) return { err: "מספר הוואטסאפ לא נראה תקין. למשל 050-1234567 או +972501234567" };
    return { value: d };
  }

  /* ---------- data ---------- */
  const LOADERS = {
    keys: () => rest("roster_api_keys?select=" + KEY_COLS + "&order=created_at.desc"),
    settings: async () => { const r = await rest("roster_business_settings?select=" + SETTINGS_COLS); if (!Array.isArray(r) || !r[0]) throw new Error("no settings row"); return r[0]; },
    templates: async () => { const r = await rest("roster_mail_templates?select=key,subject,html,updated_at"); const m = {}; (Array.isArray(r) ? r : []).forEach((x) => { m[x.key] = x; }); return m; },
    events: () => rest("roster_events?select=id,type,created_at,status,attempts,next_attempt_at,last_error&type=neq.mail.test&order=created_at.desc&limit=60"),
    deliveries: () => rest("roster_webhook_deliveries?select=id,event_id,attempt,status,http_status,error,at&order=at.desc&limit=300"),
    mails: () => rest("roster_mail_log?select=id,participant_id,template,to_addr,subject,status,error,created_at,sent_at,is_test&order=created_at.desc&limit=60"),
  };
  async function load(what) {
    const mine = epoch;
    try {
      const v = await LOADERS[what]();
      if (epoch !== mine) return;
      D[what] = Array.isArray(v) || (v && typeof v === "object") ? v : [];
      D.err[what] = false;
    } catch (e) {
      if ((e && e.signedOut) || epoch !== mine) return;
      D.err[what] = true;
      D[what] = null;
    }
  }
  const loadAll = () => Promise.all(Object.keys(LOADERS).map(load));

  /* ---------- panels ---------- */
  const failBox = (what) => '<div class="pin"><div class="empty"><b>לא הצלחנו לטעון</b>' + esc(T.loadFail) + '<br><button type="button" class="btn ghost" data-act="retry" data-what="' + what + '">ניסיון נוסף</button></div></div>';
  const loadingBox = () => '<div class="pin"><div class="empty" role="status">טוען…</div></div>';
  function need(names) {
    for (const n of names) { if (D[n] === undefined) return loadingBox(); }
    for (const n of names) { if (D.err[n]) return failBox(n); }
    return "";
  }

  function renderPanel(keepScroll) {
    const top = keepScroll ? panel.scrollTop : 0;
    const fn = { keys: panelKeys, hook: panelHook, mail: panelMail, reg: panelReg, log: panelLog }[S.tab];
    panel.innerHTML = fn();
    if (S.tab === "mail") updateMail();
    panel.scrollTop = top;
    panel.setAttribute("aria-labelledby", "tab-" + S.tab);
    $$("[role=tab]").forEach((b) => { const on = b.dataset.tab === S.tab; b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1; });
  }
  /* A list inside the open panel, redrawn without touching the forms around it. */
  function refreshLists() {
    const m = { keysList: keysList, hookLog: () => hookLog(8), tplList: tplList, mailLog: () => mailLog(6), logBody: logBody };
    for (const id in m) { const el = document.getElementById(id); if (el) el.innerHTML = m[id](); }
  }
  function setTab(t) {
    S.tab = t;
    renderPanel(false);
  }

  const sw = (id, on, label, hint) => '<label class="sw rfield rfield--switch"><input type="checkbox" id="' + id + '" role="switch"' + (on ? " checked" : "") + '><span class="trk" aria-hidden="true"></span><span class="swt"><b>' + label + "</b>" + (hint ? "<small>" + hint + "</small>" : "") + "</span></label>";
  const cardHead = (title, extra) => '<div class="chead"><h2>' + title + "</h2>" + (extra || "") + "</div>";

  /* ===== keys ===== */
  function keyRow(k) {
    const revoked = !!k.revoked_at;
    const org = k.kind === "public"
      ? (k.allowed_origins && k.allowed_origins.length ? k.allowed_origins.map(mono).join(" ") : "כל אתר")
      : "לשרת בלבד";
    return '<div class="krow' + (revoked ? " off" : "") + '" data-key="' + esc(k.id) + '"><div class="kmain">' +
      '<div class="kname"><span class="kl">' + esc(k.label || "ללא שם") + '</span><span class="tg ' + (k.kind === "secret" ? "dark" : "") + '">' + (k.kind === "secret" ? "סודי" : "ציבורי") + "</span>" + (revoked ? '<span class="tg bad">בוטל</span>' : "") + "</div>" +
      '<div class="kmeta">' + mono(String(k.prefix || "") + "…") + "</div>" +
      '<div class="kmeta">אתרים: ' + org + "</div>" +
      '<div class="kmeta">נוצר ' + esc(fmtDate(k.created_at)) + (k.last_used_at ? ", שימוש אחרון " + esc(ago(k.last_used_at)) : ", עוד לא נעשה בו שימוש") + (revoked ? ", בוטל " + esc(fmtDate(k.revoked_at)) : "") + "</div></div>" +
      (revoked ? "" : '<button type="button" class="btn ghost sm redtext" data-act="key-revoke" data-id="' + esc(k.id) + '">ביטול מפתח</button>') + "</div>";
  }
  function keysList() {
    if (D.err.keys) return '<div class="empty"><b>לא הצלחנו לטעון את המפתחות</b><button type="button" class="btn ghost" data-act="retry" data-what="keys">ניסיון נוסף</button></div>';
    const ks = (D.keys || []).slice().sort((a, b) => (a.revoked_at ? 1 : 0) - (b.revoked_at ? 1 : 0));
    if (!ks.length) return '<div class="empty"><b>עוד אין מפתחות</b>כדי לחבר אתר, צרו מפתח ציבורי.</div>';
    return ks.map(keyRow).join("");
  }
  function panelKeys() {
    const bad = need(["keys"]);
    if (bad) return bad;
    return '<div class="pin">' +
      '<section class="card">' + cardHead("מפתחות API") +
      '<p class="lead">האתר או האפליקציה של העסק מתחברים למערכת באמצעות מפתח. אפשר להחזיק כמה מפתחות, למשל אחד לכל אתר, ולבטל כל אחד בנפרד. <a href="../api/">לתיעוד המלא</a></p>' +
      '<div class="kinds"><div><b>מפתח ציבורי</b> <bdi class="mono" dir="ltr">rk_pub_…</bdi><p>בטוח לשים בקוד שרץ בדפדפן. מאפשר רק לקרוא מפגשים, לקבל הרשמות וללחוץ על "שילמתי". אפשר להגביל אותו לאתרים מסוימים.</p></div>' +
      '<div><b>מפתח סודי</b> <bdi class="mono" dir="ltr">rk_sec_…</bdi><p>רק לשרת שלכם, לעולם לא בדפדפן. מאפשר הכול: לקרוא משתתפים, לרשום, לתעד תשלומים.</p></div></div>' +
      '<button type="button" class="btn" id="keyNew" data-act="key-new">' + icon("plus") + "מפתח חדש</button></section>" +
      '<section class="card">' + cardHead("המפתחות שלכם") + '<div id="keysList">' + keysList() + "</div></section></div>";
  }

  /* ===== webhook ===== */
  const EV_STATUS = { pending: ["ממתין", "wait"], processing: ["נשלח עכשיו", "wait"], done: ["נמסר", "ok"], failed: ["נכשל", "bad"] };
  /* a status the page does not know is shown as plain, escaped text and never becomes markup or a class name */
  const tagOf = (table, status) => (Object.prototype.hasOwnProperty.call(table, status) ? table[status] : [esc(status), ""]);
  function delStatus(d) {
    const s = String(d.status || "").toLowerCase();
    if (/^(ok|success|sent|delivered|done)$/.test(s) || (d.http_status >= 200 && d.http_status < 300 && !d.error)) return ["נמסר", "ok"];
    if (/^(retry|pending|scheduled)$/.test(s)) return ["ניסיון נוסף יתבצע", "wait"];
    return ["נכשל", "bad"];
  }
  function deliveriesOf(id) { return (D.deliveries || []).filter((d) => d.event_id === id).sort((a, b) => a.attempt - b.attempt); }
  function hookEvents() {
    const url = D.settings && D.settings.webhook_url;
    return (D.events || []).filter((e) => deliveriesOf(e.id).length || (url && e.status !== "done"));
  }
  function hookLog(limit) {
    if (D.err.events || D.err.deliveries) return '<div class="empty"><b>לא הצלחנו לטעון את היומן</b><button type="button" class="btn ghost" data-act="retry" data-what="events">ניסיון נוסף</button></div>';
    const list = hookEvents().slice(0, limit || 100);
    if (!list.length) return '<div class="empty"><b>עוד אין משלוחים</b>אחרי שתגדירו כתובת, אפשר לשלוח אירוע בדיקה.</div>';
    return list.map((e) => {
      const st = tagOf(EV_STATUS, e.status);
      const ds = deliveriesOf(e.id);
      const rows = ds.map((d) => {
        const s = delStatus(d);
        return '<li><span class="tg ' + s[1] + '" title="' + esc(d.status) + '">' + s[0] + "</span> ניסיון " + esc(d.attempt) + (d.http_status ? ", HTTP " + esc(d.http_status) : "") + ", " + esc(fmtDate(d.at)) + (d.error ? '<div class="errl">' + esc(d.error) + "</div>" : "") + "</li>";
      }).join("");
      const next = e.status === "pending" && e.next_attempt_at && e.attempts ? '<div class="kmeta">הניסיון הבא: ' + esc(fmtDate(e.next_attempt_at)) + "</div>" : "";
      return '<details class="ev"><summary><span class="evt">' + esc(TYPE_NAME[e.type] || e.type) + '</span><span class="tg ' + st[1] + '">' + st[0] + '</span><span class="when">' + esc(ago(e.created_at)) + "</span></summary>" +
        '<div class="evbody">' + (rows ? "<ul>" + rows + "</ul>" : '<div class="kmeta">עוד לא נעשה ניסיון משלוח.</div>') + next + (e.last_error && !ds.length ? '<div class="errl">' + esc(e.last_error) + "</div>" : "") + "</div></details>";
    }).join("");
  }
  function panelHook() {
    const bad = need(["settings", "events", "deliveries"]);
    if (bad) return bad;
    const s = D.settings, on = s.webhook_events == null ? HOOK_EVENTS.map((e) => e[0]) : s.webhook_events;
    return '<div class="pin">' +
      '<form class="card" id="hookForm" novalidate>' + cardHead("Webhook: עדכון לשרת שלכם") +
      '<p class="lead">על כל אירוע (משתתף חדש, הרשמה, תשלום) המערכת שולחת הודעה חתומה לכתובת שתגדירו, מכל מקור: האתר, הניהול והאזור האישי. אם השרת לא ענה, ההודעה נשלחת שוב כמה פעמים. <a href="../api/">איך מאמתים את החתימה</a></p>' +
      '<label class="rfield"><span>כתובת לקבלת ההודעות</span><input id="hUrl" class="ltr" dir="ltr" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" data-hint placeholder="https://example.com/roster-hook" value="' + esc(s.webhook_url || "") + '"></label>' +
      '<p class="hint">https בלבד, בפורט הרגיל, ובכתובת של אתר פומבי: לא כתובת IP, לא localhost, לא workers.dev ולא שירותי nip.io ודומיהם. אם משאירים ריק, לא נשלח כלום.</p>' +
      '<div class="clabel">האירועים שיישלחו</div><div class="chks" id="hEvents">' +
      HOOK_EVENTS.map((e) => '<label class="chk rfield rfield--check"><input type="checkbox" name="hev" value="' + e[0] + '"' + (on.includes(e[0]) ? " checked" : "") + '><span><b>' + e[1] + "</b><small>" + e[2] + " " + mono(e[0]) + "</small></span></label>").join("") + "</div>" +
      '<div class="ferr" id="hErr" role="alert"></div>' +
      '<div class="savebar"><button type="submit" class="btn" id="hSave">שמירה</button></div></form>' +
      '<section class="card">' + cardHead("סוד החתימה") +
      '<p class="lead">כל הודעה נושאת חתימה (HMAC) שמוכיחה שהיא באה מהמערכת. הסוד לא מוצג שוב אחרי שנוצר. אם איבדתם אותו, צרו סוד חדש: הסוד הישן יפסיק לעבוד מיד, ושרת שמאמת חתימות צריך לקבל את החדש.</p>' +
      '<p class="secstate" id="secState">' + (s.webhook_secret_set ? "יש סוד פעיל. הוא נשמר אצלנו ולא מוצג שוב." : "עוד לא נוצר סוד חתימה. בלי סוד אי אפשר לאמת את ההודעות.") + "</p>" +
      '<button type="button" class="btn ghost" id="secretNew" data-act="secret-new">' + (s.webhook_secret_set ? "יצירת סוד חדש" : "יצירת סוד") + "</button></section>" +
      '<section class="card">' + cardHead("אירוע בדיקה") +
      '<p class="lead">שולח אירוע מסוג ping לכתובת השמורה, כדי לראות שהשרת שלכם מקבל ומאמת חתימה.</p>' +
      '<button type="button" class="btn ghost" id="hookTest" data-act="hook-test"' + (s.webhook_url ? "" : " disabled") + ">שליחת בדיקה</button>" + (s.webhook_url ? "" : '<p class="hint">קודם צריך לשמור כתובת.</p>') + "</section>" +
      '<section class="card">' + cardHead("משלוחים אחרונים", '<button type="button" class="hicon" data-act="refresh" aria-label="רענון" title="רענון">' + icon("refresh") + "</button>") +
      '<div id="hookLog">' + hookLog(8) + '</div><button type="button" class="linkbtn" data-act="goto-log" data-seg="hook">לכל היומן</button></section></div>';
  }
  async function saveHook() {
    const err = $("#hErr"), btn = $("#hSave");
    const u = checkUrl($("#hUrl").value);
    if (u.err) { err.textContent = u.err; $("#hUrl").setAttribute("aria-invalid", "true"); $("#hUrl").focus(); return; }
    const evs = $$("input[name=hev]:checked").map((x) => x.value);
    const patch = { webhook_url: u.value || null, webhook_events: evs };
    const s = D.settings;
    if ((s.webhook_url || "") === (u.value || "") && JSON.stringify((s.webhook_events || HOOK_EVENTS.map((e) => e[0])).slice().sort()) === JSON.stringify(evs.slice().sort())) { toast(T.noChange); return; }
    err.textContent = "";
    btn.disabled = true;
    try { await saveSettings(patch); toast(T.saved); renderPanel(true); }
    catch (e) { if (e && e.signedOut) return; btn.disabled = false; err.textContent = T.generic; }
  }
  /* RETURNING * would need a privilege on webhook_secret, which nobody has: name the columns */
  async function saveSettings(patch) {
    const mine = epoch;
    const res = await rest("roster_business_settings?business_id=eq." + enc(BIZ.id) + "&select=" + SETTINGS_COLS, { method: "PATCH", json: patch, prefer: "return=representation" });
    if (!Array.isArray(res) || !res[0]) throw new Error("not saved");
    if (epoch === mine) D.settings = res[0];
    return res[0];
  }

  /* ===== mails ===== */
  const mailStatus = { sent: ["נשלח", "ok"], failed: ["נכשל", "bad"], pending: ["ממתין", "wait"] };
  function mailLog(limit) {
    if (D.err.mails) return '<div class="empty"><b>לא הצלחנו לטעון את יומן המיילים</b><button type="button" class="btn ghost" data-act="retry" data-what="mails">ניסיון נוסף</button></div>';
    const list = (D.mails || []).slice(0, limit || 100);
    if (!list.length) return '<div class="empty"><b>עוד לא נשלחו מיילים</b>מיילים שהמערכת שולחת בשם העסק יופיעו כאן.</div>';
    return list.map((m) => {
      const st = tagOf(mailStatus, m.status);
      const tn = (DEF[m.template] && DEF[m.template].name) || m.template;
      return '<button type="button" class="mrow" data-act="mail-open" data-id="' + esc(m.id) + '"><span class="mmain"><span class="msub">' + esc(m.subject || "ללא נושא") + '</span><span class="kmeta">' + esc(tn) + (m.is_test ? " (ניסיון)" : "") + ", " + mono(m.to_addr || "") + ", " + esc(ago(m.sent_at || m.created_at)) + "</span>" +
        (m.status === "failed" && m.error ? '<span class="errl">' + esc(m.error) + "</span>" : "") + '</span><span class="tg ' + st[1] + '">' + st[0] + "</span></button>";
    }).join("");
  }
  function tplList() {
    return TPL_ORDER.filter((k) => DEF[k]).map((k) => {
      const d = DEF[k], custom = !!(D.templates && D.templates[k]);
      return '<button type="button" class="trow" data-act="tpl-open" data-key="' + k + '"><span class="mmain"><span class="msub">' + esc(d.name) + '</span><span class="kmeta">' + esc(d.when) + '</span></span><span class="tg ' + (custom ? "dark" : "") + '">' + (custom ? "מותאם" : "ברירת מחדל") + "</span></button>";
    }).join("");
  }
  /* Who the mails are FROM and who gets the alerts is set by the owner of the system only (the database refuses anyone else),
     so for everybody else the three fields are shown, read-only, with the reason. */
  const isOwner = () => { const row = MINE.find((b) => b.slug === BIZ.slug); return !!(row && row.is_super === true); };
  const OWNER_ONLY = "מוגדר על ידי בעל המערכת.";
  /* ---- the mail hub: everything about mail in one place ----
     1. what the business needs (participants, managers, both): sets the switches below, saved with the form
     2. participants: the master switch and a switch per mail type; managers: the notify list and a switch per type
     3. a status line per area ("מוגדר" or "לא מוגדר" and what is missing), updated while the form is edited
     4. a test mail per type, to the signed-in manager's own address only (roster_mail_test) */
  const PART_TYPES = ["registered", "payment_confirmed", "refund", "registration_cancelled"];
  const ADM_TYPES = ["admin_signup", "admin_payment_reported", "admin_account_linked", "admin_phone_conflict"];
  const TEST_ERR = {
    forbidden: T.generic, unknown_template: T.generic,
    no_email: "לחשבון שמחובר עכשיו אין כתובת מייל, ולכן אי אפשר לשלוח אליו מייל ניסיון.",
    busy: "המערכת עסוקה כרגע. אפשר לנסות שוב בעוד רגע.",
  };
  const offOf = () => new Set(Array.isArray(D.settings && D.settings.mail_off_types) ? D.settings.mail_off_types : []);
  function typeRow(k, off) {
    const d = DEF[k] || { name: k, when: "" };
    return '<div class="mtype"><label class="sw rfield rfield--switch"><input type="checkbox" data-mtype="' + k + '" role="switch"' + (off.has(k) ? "" : " checked") + '><span class="trk" aria-hidden="true"></span><span class="swt"><b>' + esc(d.name) + "</b><small>" + esc(d.when) +
      '</small></span></label><button type="button" class="btn ghost sm" data-act="mail-test" data-key="' + k + '" aria-label="שליחת מייל ניסיון: ' + esc(d.name) + '">מייל ניסיון</button></div>';
  }
  /* the values behind the status lines: the form while it is open, else what is saved */
  function mailVals() {
    const s = D.settings || {}, f = $("#mailForm");
    if (!f) return { master: s.participant_mail_enabled !== false, off: offOf(), notify: s.notify_emails || [], contact: s.contact_email || "", from: s.mail_from_address || "", name: s.sender_name || "" };
    const off = new Set($$("[data-mtype]", f).filter((c) => !c.checked).map((c) => c.dataset.mtype));
    const pn = parseMails($("#mNotify").value, 10);
    return { master: $("#mParticipant").checked, off: off, notify: pn.err ? (s.notify_emails || []) : pn.list, contact: lc($("#mContact").value), from: lc($("#mFrom").value), name: clean($("#mName").value) };
  }
  function areaStatus(area, v) {
    const types = area === "p" ? PART_TYPES : ADM_TYPES, on = types.filter((k) => !v.off.has(k)), miss = [], notes = [];
    if (area === "p") {
      if (!v.master) miss.push("המתג של מיילים למשתתפים כבוי");
      if (!on.length) miss.push("כל סוגי המיילים כבויים");
      if (!v.contact) miss.push("לא הוגדרה כתובת מענה, ומשתתף שיענה למייל לא יגיע אל אף אחד");
      notes.push("שם השולח: " + esc(v.name || BIZ.name) + (v.name ? "" : " (שם העסק, כי לא הוגדר שם שולח)"));
      notes.push("כתובת השולח: " + mono(v.from || "no-reply@floa.co.il") + (v.from ? " (משלכם)" : " (ברירת מחדל)"));
    } else {
      if (!on.length) miss.push("כל סוגי ההתראות כבויים");
      notes.push(v.notify.length ? "ההתראות נשלחות אל: " + v.notify.map(mono).join(", ") : "לא הוגדרה כתובת ייעודית, ולכן ההתראות נשלחות לכל חשבונות ה־Google של העסק");
    }
    const ok = miss.length === 0;
    return '<span class="tg ' + (ok ? "ok" : "bad") + '">' + (ok ? "מוגדר" : "לא מוגדר") + "</span>" +
      (miss.length ? '<ul class="mmiss">' + miss.map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul>" : "") +
      '<ul class="mnotes">' + notes.map((x) => "<li>" + x + "</li>").join("") + "</ul>";
  }
  function mailNeedOf(v) {
    const p = v.master && PART_TYPES.some((k) => !v.off.has(k)), a = ADM_TYPES.some((k) => !v.off.has(k));
    return p && a ? "both" : p ? "p" : a ? "a" : "";
  }
  function updateMail() {
    const v = mailVals();
    const sp = $("#mStatP"), sa = $("#mStatA");
    if (sp) sp.innerHTML = areaStatus("p", v);
    if (sa) sa.innerHTML = areaStatus("a", v);
    const need = ($("input[name=mNeed]:checked") || {}).value || "";
    const bp = $("#mAreaP"), ba = $("#mAreaA");
    if (bp) bp.hidden = need === "a";
    if (ba) ba.hidden = need === "p";
  }
  /* the answer to "what does the business need" sets the switches; nothing is saved until the form is */
  function applyNeed(need) {
    const p = need === "p" || need === "both", a = need === "a" || need === "both";
    $("#mParticipant").checked = p;
    $$("[data-mtype]").forEach((c) => { c.checked = PART_TYPES.includes(c.dataset.mtype) ? p : a; });
  }
  function panelMail() {
    const bad = need(["settings", "templates", "mails"]);
    if (bad) return bad;
    const s = D.settings, own = isOwner(), ro = own ? "" : ' readonly aria-readonly="true"', roCls = own ? "" : " ro", off = offOf();
    const cur = mailNeedOf(mailVals());
    const needBtn = (v, label, hint) => '<label><input type="radio" name="mNeed" value="' + v + '"' + (cur === v ? " checked" : "") + "><span><b>" + label + "</b><small>" + hint + "</small></span></label>";
    return '<div class="pin">' +
      '<form class="card" id="mailForm" novalidate>' + cardHead("מיילים") +
      '<p class="lead">כל המיילים של העסק מוגדרים כאן: למי הם נשלחים, אילו סוגים, ומאיזו כתובת. כדי להתחיל, בחרו מה העסק צריך.</p>' +
      '<div class="needs" role="radiogroup" aria-label="מה העסק צריך">' +
        needBtn("p", "מיילים למשתתפים", "אישור הרשמה, תשלום, החזר וביטול") + needBtn("a", "התראות למנהלים", "משתתף חדש, דיווח תשלום וחיבורים") + needBtn("both", "שניהם", "המשתתפים והמנהלים") + "</div>" +
      '<p class="hint">הבחירה מסמנת את המתגים למטה. אפשר לשנות כל מתג בנפרד לפני השמירה.</p>' +

      '<div class="marea" id="mAreaP"><h3>מיילים למשתתפים</h3><div class="mstat" id="mStatP"></div>' +
      sw("mParticipant", s.participant_mail_enabled !== false, "שליחת מיילים למשתתפים", "כל מייל נשלח רק לכתובת שהמשתתף הזין, ומסתיים בהסבר למה הוא קיבל אותו. כשהמתג כבוי לא נשלח אף מייל למשתתפים.") +
      '<div class="mtypes">' + PART_TYPES.map((k) => typeRow(k, off)).join("") + "</div></div>" +

      '<div class="marea" id="mAreaA"><h3>התראות למנהלים</h3><div class="mstat" id="mStatA"></div>' +
      '<label class="rfield"><span>מי מקבל התראות</span><textarea id="mNotify" class="ltr' + roCls + '" dir="ltr" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false"' + ro + ' data-hint placeholder="manager@example.com">' + esc((s.notify_emails || []).join("\n")) + "</textarea></label>" +
      '<p class="hint">' + (own ? "כתובת אחת בכל שורה." : OWNER_ONLY) + " אם הרשימה ריקה, ההתראות נשלחות לכל חשבונות ה־Google של העסק.</p>" +
      '<div class="mtypes">' + ADM_TYPES.map((k) => typeRow(k, off)).join("") + "</div></div>" +

      '<div class="marea"><h3>שולח</h3>' +
      '<p class="lead">המיילים יוצאים מהכתובת <bdi dir="ltr">' + esc(s.mail_from_address || "no-reply@floa.co.il") + '</bdi>, בשם שהוגדר לעסק.' + (own ? "" : " " + OWNER_ONLY) + "</p>" +
      '<label class="rfield"><span>שם השולח</span><input id="mName" maxlength="60" autocomplete="off"' + ro + ' class="' + roCls.trim() + '" data-hint placeholder="' + esc(BIZ.name) + '" value="' + esc(s.sender_name || "") + '"></label>' +
      '<p class="hint">' + (own ? "מופיע ליד הכתובת. אם משאירים ריק, יופיע שם העסק." : OWNER_ONLY + " אם הוא ריק, יופיע שם העסק.") + "</p>" +
      '<label class="rfield"><span>כתובת השולח</span><input id="mFrom" class="ltr' + roCls + '" dir="ltr" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120"' + ro + ' data-hint placeholder="no-reply@floa.co.il" value="' + esc(s.mail_from_address || "") + '"></label>' +
      '<p class="hint">' + (own ? "הכתובת שהמשתתף רואה כשולח. אם משאירים ריק, המיילים יוצאים מ־no-reply@floa.co.il. הדומיין של הכתובת צריך להיות מאומת ב־Resend, אחרת המייל לא יישלח." : OWNER_ONLY + " אם היא ריקה, המיילים יוצאים מ־no-reply@floa.co.il.") + "</p>" +
      '<label class="rfield"><span>כתובת למענה</span><input id="mContact" class="ltr' + roCls + '" dir="ltr" type="email" inputmode="email" autocomplete="off" autocapitalize="off" spellcheck="false"' + ro + ' data-hint placeholder="studio@example.com" value="' + esc(s.contact_email || "") + '"></label>' +
      '<p class="hint">' + (own ? "כשמשתתף עונה למייל, התשובה מגיעה לכאן." : OWNER_ONLY + " כשמשתתף עונה למייל, התשובה מגיעה לכתובת הזאת.") + "</p></div>" +

      '<p class="hint" id="mTestHint">"מייל ניסיון" שולח אליכם, ורק אליכם, את התבנית כפי שנשמרה, עם נתוני דוגמה. הוא מסומן בנושא ובגוף המייל וביומן. אם שיניתם משהו כאן, שמרו קודם.</p>' +
      '<div class="ferr" id="mErr" role="alert"></div>' +
      '<div class="savebar"><button type="submit" class="btn" id="mSave">שמירה</button></div></form>' +
      '<section class="card">' + cardHead("תבניות המיילים") +
      '<p class="lead">כל מייל נשלח לפי תבנית. אפשר להתאים נושא וגוף, והפרטים (שם פרטי, תאריך, קישורים) מתמלאים אוטומטית.</p>' +
      '<div id="tplList">' + tplList() + "</div></section>" +
      '<section class="card">' + cardHead("מיילים אחרונים", '<button type="button" class="hicon" data-act="refresh" aria-label="רענון" title="רענון">' + icon("refresh") + "</button>") +
      '<div id="mailLog">' + mailLog(6) + '</div><button type="button" class="linkbtn" data-act="goto-log" data-seg="mail">לכל היומן</button></section></div>';
  }
  async function saveMail() {
    const err = $("#mErr"), btn = $("#mSave"), s = D.settings;
    const off = $$("[data-mtype]").filter((c) => !c.checked).map((c) => c.dataset.mtype).sort();
    const base = { participant_mail_enabled: $("#mParticipant").checked, mail_off_types: off };
    const sameBase = (s.participant_mail_enabled !== false) === base.participant_mail_enabled && JSON.stringify([...offOf()].sort()) === JSON.stringify(off);
    let patch;
    if (isOwner()) {
      const name = clean($("#mName").value);
      if (/[<>"\r\n]/.test($("#mName").value)) { err.textContent = "בשם השולח אי אפשר להשתמש בתווים < > או במרכאות."; $("#mName").focus(); return; }
      const contact = lc($("#mContact").value);
      if (contact && (contact.length > 254 || !MAIL_RE.test(contact))) { err.textContent = "כתובת המענה לא נראית תקינה."; $("#mContact").setAttribute("aria-invalid", "true"); $("#mContact").focus(); return; }
      const from = lc($("#mFrom").value);
      if (from && (from.length > 120 || from.indexOf("@") > 64 || !MAIL_RE.test(from))) { err.textContent = "כתובת השולח לא נראית תקינה."; $("#mFrom").setAttribute("aria-invalid", "true"); $("#mFrom").focus(); return; }
      const notify = parseMails($("#mNotify").value, 10);
      if (notify.err) { err.textContent = notify.err; $("#mNotify").setAttribute("aria-invalid", "true"); $("#mNotify").focus(); return; }
      patch = Object.assign({ sender_name: name || null, mail_from_address: from || null, contact_email: contact || null, notify_emails: notify.list }, base);
      if (sameBase && (s.sender_name || "") === (name || "") && (s.mail_from_address || "") === from && (s.contact_email || "") === contact && JSON.stringify(s.notify_emails || []) === JSON.stringify(notify.list)) { toast(T.noChange); return; }
    } else {
      /* a member sends ONLY what a member may change: the database refuses a write to the other four */
      patch = base;
      if (sameBase) { toast(T.noChange); return; }
    }
    err.textContent = ""; btn.disabled = true;
    try { await saveSettings(patch); toast(T.saved); renderPanel(true); }
    catch (e) { if (e && e.signedOut) return; btn.disabled = false; err.textContent = T.generic; }
  }
  /* a test mail: the saved template with sample data, to the signed-in manager only */
  const testing2 = new Set();
  async function mailTest(btn) {
    const key = btn.dataset.key;
    if (testing2.has(key)) return;
    testing2.add(key); btn.disabled = true;
    const mine = epoch;
    try {
      const r = await rpc("roster_mail_test", { p_template: key });
      if (r && r.queued) {
        toast("נשלח אליכם מייל ניסיון ל־" + r.to + ". הוא יגיע בעוד כדקה.");
        [9000, 30000].forEach((ms) => setTimeout(async () => { if (epoch !== mine) return; await load("mails"); refreshLists(); }, ms));
      } else if (r && r.error === "rate_limited") {
        const min = Math.max(1, Math.ceil((Number(r.retry_in) || 60) / 60));
        toast("נשלחו הרבה מיילי ניסיון. אפשר שוב בעוד " + (min === 1 ? "דקה" : min + " דקות") + ".");
      } else toast(TEST_ERR[r && r.error] || T.generic);
    } catch (e) { if (!(e && e.signedOut)) toast(T.generic); }
    testing2.delete(key); btn.disabled = false;
  }

  /* ===== registration and the personal area ===== */
  const meUrl = () => ME_URL + "?biz=" + BIZ.slug;
  const iframeCode = () => '<iframe src="' + meUrl() + '" title="האזור האישי" style="width:100%;height:720px;border:0"></iframe>';
  function panelReg() {
    const bad = need(["settings"]);
    if (bad) return bad;
    const s = D.settings, req = new Set((s.signup_required && s.signup_required.length ? s.signup_required : ["first_name", "phone"]).concat(["first_name", "phone"]));
    return '<div class="pin"><form id="regForm" novalidate>' +
      '<section class="card">' + cardHead("הרשמה") +
      sw("rOpen", s.registration_open !== false, "הרשמה פתוחה", "כשהיא סגורה, טופס ההרשמה באתר מחזיר \"ההרשמה סגורה\".") +
      '<div class="clabel">שדות חובה בטופס ההרשמה</div><div class="chks">' +
      FIELDS.map((f) => '<label class="chk rfield rfield--check"><input type="checkbox" name="rf" value="' + f[0] + '"' + (req.has(f[0]) ? " checked" : "") + (f[2] ? " disabled" : "") + "><span><b>" + f[1] + "</b>" + (f[2] ? "<small>חובה תמיד</small>" : "") + "</span></label>").join("") + "</div></section>" +
      '<section class="card">' + cardHead("אזור אישי") +
      sw("rMe", s.personal_area_enabled !== false, "אזור אישי פעיל", "המשתתפים נכנסים עם Google, מקשרים את הטלפון שלהם ורואים את המפגשים והתשלומים שלהם.") +
      '<div class="clabel">הכתובת של האזור האישי</div><div class="copybox"><bdi class="mono" dir="ltr">' + esc(meUrl()) + '</bdi><button type="button" class="hicon" data-act="copy" data-text="' + esc(meUrl()) + '" aria-label="העתקת הכתובת" title="העתקה">' + icon("copy") + "</button></div>" +
      '<button type="button" class="linkbtn" data-act="copy" data-text="' + esc(iframeCode()) + '">העתקת קוד להטמעה באתר (iframe)</button></section>' +
      '<section class="card">' + cardHead("תשלום וקשר") +
      '<label class="rfield"><span>קישור לתשלום</span><input id="rPay" class="ltr" dir="ltr" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" data-hint placeholder="https://pay.example/studio" value="' + esc(s.payment_url || "") + '"></label>' +
      '<p class="hint">הקישור שמשתתף פותח כדי לשלם (למשל Bit או PayBox). מופיע במייל ההרשמה ובאזור האישי.</p>' +
      '<label class="rfield"><span>מספר וואטסאפ</span><input id="rWa" class="ltr" dir="ltr" type="tel" inputmode="tel" autocomplete="off" data-hint placeholder="050-1234567" value="' + esc(s.contact_whatsapp || "") + '"></label>' +
      '<p class="hint">למי הכפתור "לשלם בדרך אחרת" והקישור לוואטסאפ במיילים פונים. אפשר לכתוב 050-1234567 או +972501234567.</p>' +
      '<div class="ferr" id="rErr" role="alert"></div>' +
      '<div class="savebar"><button type="submit" class="btn" id="rSave">שמירה</button></div></section></form></div>';
  }
  async function saveReg() {
    const err = $("#rErr"), btn = $("#rSave");
    const pay = checkPublicUrl($("#rPay").value);
    if (pay.err) { err.textContent = pay.err; $("#rPay").setAttribute("aria-invalid", "true"); $("#rPay").focus(); return; }
    const wa = normWhatsapp($("#rWa").value);
    if (wa.err) { err.textContent = wa.err; $("#rWa").setAttribute("aria-invalid", "true"); $("#rWa").focus(); return; }
    const req = FIELDS.map((f) => f[0]).filter((k) => FIELDS.find((f) => f[0] === k)[2] || $("input[name=rf][value=" + k + "]").checked);
    const patch = { registration_open: $("#rOpen").checked, signup_required: req, personal_area_enabled: $("#rMe").checked, payment_url: pay.value || null, contact_whatsapp: wa.value || null };
    const s = D.settings;
    if ((s.registration_open !== false) === patch.registration_open && (s.personal_area_enabled !== false) === patch.personal_area_enabled && (s.payment_url || "") === (pay.value || "") && (s.contact_whatsapp || "") === (wa.value || "") &&
      JSON.stringify((s.signup_required || ["first_name", "phone"]).slice().sort()) === JSON.stringify(req.slice().sort())) { toast(T.noChange); return; }
    err.textContent = ""; btn.disabled = true;
    try { await saveSettings(patch); toast(T.saved); renderPanel(true); }
    catch (e) { if (e && e.signedOut) return; btn.disabled = false; err.textContent = T.generic; }
  }

  /* ===== the log ===== */
  function logBody() { return S.seg === "mail" ? mailLog(100) : hookLog(100); }
  function panelLog() {
    const bad = S.seg === "mail" ? need(["mails"]) : need(["events", "deliveries", "settings"]);
    return '<div class="pin"><section class="card">' +
      cardHead("יומן משלוחים", '<button type="button" class="hicon" data-act="refresh" aria-label="רענון" title="רענון">' + icon("refresh") + "</button>") +
      '<div class="seg" role="group" aria-label="סוג היומן"><button type="button" data-act="seg" data-seg="hook" aria-pressed="' + (S.seg === "hook") + '">Webhook</button><button type="button" data-act="seg" data-seg="mail" aria-pressed="' + (S.seg === "mail") + '">מיילים</button></div>' +
      (bad ? bad.replace('<div class="pin">', "<div>") : '<div id="logBody">' + logBody() + "</div>") + "</section></div>";
  }

  /* ===== actions ===== */
  async function refreshLogs() {
    const btns = $$("[data-act=refresh]");
    btns.forEach((b) => { b.disabled = true; });
    await Promise.all([load("events"), load("deliveries"), load("mails")]);
    if (S.tab === "log") renderPanel(true); else refreshLists();
    btns.forEach((b) => { b.disabled = false; });
  }

  panel.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act]");
    if (!t || t.disabled) return;
    const act = t.dataset.act;
    if (act === "key-new") openNewKey();
    else if (act === "key-revoke") openRevoke(t.dataset.id);
    else if (act === "secret-new") openSecretNew();
    else if (act === "hook-test") hookTest(t);
    else if (act === "tpl-open") openTemplate(t.dataset.key);
    else if (act === "mail-open") openMail(t.dataset.id);
    else if (act === "mail-test") mailTest(t);
    else if (act === "refresh") refreshLogs();
    else if (act === "goto-log") { S.seg = t.dataset.seg; setTab("log"); }
    else if (act === "seg") { S.seg = t.dataset.seg; renderPanel(true); }
    else if (act === "copy") { toast((await copyText(t.dataset.text)) ? T.copied : T.copyFail); }
    else if (act === "retry") { const w = t.dataset.what; if (w === "events" || w === "deliveries") { await Promise.all([load("events"), load("deliveries")]); } else await load(w); renderPanel(true); }
  });
  panel.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.closest || !t.closest("#mailForm")) return;
    if (t.name === "mNeed") applyNeed(t.value);
    updateMail();
  });
  panel.addEventListener("input", (e) => { if (e.target.closest && e.target.closest("#mailForm") && ["mNotify", "mName", "mFrom", "mContact"].includes(e.target.id)) updateMail(); });
  panel.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "hookForm") saveHook();
    else if (e.target.id === "mailForm") saveMail();
    else if (e.target.id === "regForm") saveReg();
  });
  panel.addEventListener("input", (e) => { if (e.target.hasAttribute && e.target.hasAttribute("aria-invalid")) e.target.removeAttribute("aria-invalid"); const er = e.target.closest("form") && $(".ferr", e.target.closest("form")); if (er) er.textContent = ""; });

  /* tabs */
  const tabs = $("#tabs");
  tabs.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
  tabs.addEventListener("keydown", (e) => {
    const list = $$("[data-tab]", tabs), i = list.findIndex((b) => b.dataset.tab === S.tab);
    let n = -1;
    if (e.key === "ArrowLeft") n = (i + 1) % list.length;        /* RTL: left is "next" */
    else if (e.key === "ArrowRight") n = (i - 1 + list.length) % list.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = list.length - 1;
    if (n < 0) return;
    e.preventDefault();
    setTab(list[n].dataset.tab);
    $$("[data-tab]", tabs)[n].focus();
  });

  /* ---------- keys: create, show once, revoke ---------- */
  function openNewKey() {
    ctx = { kind: "newkey", busy: false };
    openDialog("form", "מפתח חדש",
      '<form id="nkForm" novalidate>' +
      '<div class="clabel" id="nkKindL">סוג המפתח</div>' +
      '<div class="seg two" role="radiogroup" aria-labelledby="nkKindL"><label><input type="radio" name="nkKind" value="public" checked><span>ציבורי, לדפדפן</span></label><label><input type="radio" name="nkKind" value="secret"><span>סודי, לשרת</span></label></div>' +
      '<p class="hint" id="nkKindHint">מותר להשתמש בו בקוד שרץ בדפדפן. מאפשר רק לקרוא מפגשים, לקבל הרשמות וללחוץ על "שילמתי".</p>' +
      '<label class="rfield"><span>שם למפתח</span><input id="nkLabel" maxlength="60" autocomplete="off" autofocus data-hint placeholder="האתר הראשי"></label>' +
      '<label class="rfield" id="nkOriginsF"><span>אתרים מורשים</span><textarea id="nkOrigins" class="ltr" dir="ltr" rows="3" autocomplete="off" autocapitalize="off" spellcheck="false" data-hint placeholder="https://studio.example"></textarea></label>' +
      '<p class="hint" id="nkOriginsH">כתובת אחת בכל שורה, בלי נתיב ובלי כוכביות. אם משאירים ריק, כל אתר יוכל להשתמש במפתח.</p>' +
      '<div class="ferr" id="nkErr" role="alert"></div>' +
      '<button type="submit" class="btn block" id="nkGo">יצירת מפתח</button></form>');
    const sync = () => {
      const pub = $("input[name=nkKind]:checked").value === "public";
      $("#nkOriginsF").hidden = !pub; $("#nkOriginsH").hidden = !pub;
      $("#nkKindHint").textContent = pub
        ? 'מותר להשתמש בו בקוד שרץ בדפדפן. מאפשר רק לקרוא מפגשים, לקבל הרשמות וללחוץ על "שילמתי".'
        : "רק לשרת שלכם. לעולם לא בקוד שרץ בדפדפן ולא במאגר קוד ציבורי. מאפשר הכול, והמערכת תסרב לבקשות שלו שמגיעות מדפדפן.";
    };
    $$("input[name=nkKind]").forEach((r) => r.addEventListener("change", sync));
    $("#nkLabel").addEventListener("input", () => { $("#nkErr").textContent = ""; });
  }
  async function submitNewKey() {
    const c = ctx;
    if (c.busy) return;
    const kind = $("input[name=nkKind]:checked").value, label = clean($("#nkLabel").value), err = $("#nkErr");
    if (!label) { err.textContent = "צריך לתת שם למפתח, כדי שתזהו אותו אחר כך."; $("#nkLabel").focus(); return; }
    let origins = [];
    if (kind === "public") {
      const o = parseOrigins($("#nkOrigins").value);
      if (o.err) { err.textContent = o.err; $("#nkOrigins").focus(); return; }
      origins = o.list;
    }
    c.busy = true; $("#nkGo").disabled = true; err.textContent = "";
    try {
      const r = await rpc("roster_key_create", { p_kind: kind, p_label: label, p_origins: origins });
      if (!r || !r.key) throw new Error("no key");
      await load("keys");
      refreshLists();
      if (ctx === c) { afterClose = () => { const b = $("#keyNew"); if (b) b.focus(); }; showReveal("המפתח החדש", r.key, kind === "secret" ? "key-secret" : "key-public"); }
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      c.busy = false; $("#nkGo").disabled = false; err.textContent = T.generic;
    }
  }
  /* The one place a secret is on screen. It lives in this closure and nowhere else. */
  function showReveal(title, secret, what) {
    ctx = { kind: "reveal", copied: false, warned: false, secret };
    const sec = what === "key-secret";
    const lead = what === "webhook" ? "זה הסוד לאימות החתימה של ה־Webhook." : sec ? "זה המפתח הסודי." : "זה המפתח הציבורי.";
    openDialog("form", title,
      '<div class="warnbox"><b>זו הפעם היחידה שזה מוצג.</b> ' + lead + " אחרי שתסגרו את החלון אי אפשר יהיה לראות אותו שוב, אלא רק ליצור חדש." +
      (sec ? " שמרו אותו רק בשרת, לעולם לא בקוד שרץ בדפדפן." : what === "webhook" ? " שמרו אותו בשרת שמקבל את ההודעות." : "") + "</div>" +
      '<div class="secretbox"><bdi class="mono" dir="ltr" id="rvText">' + esc(secret) + '</bdi></div>' +
      '<div class="btnrow"><button type="button" class="btn" data-d="reveal-copy" id="rvCopy">' + icon("copy") + "העתקה</button>" +
      '<button type="button" class="btn ghost" data-d="reveal-done">שמרתי, סגירה</button></div>' +
      '<div class="ferr" id="rvWarn" role="alert" hidden></div>');
    $("#rvCopy").focus();
  }
  async function dialogAction(t) {
    const d = t.dataset.d;
    if (d === "reveal-copy") {
      const ok = await copyText(ctx.secret);
      if (ok) { ctx.copied = true; $("#rvWarn").hidden = true; t.lastChild.textContent = "הועתק"; toast(T.copied); } else toast(T.copyFail);
    } else if (d === "reveal-done") tryClose();
    else if (d === "revoke-yes") revokeKey();
    else if (d === "revoke-no") dlg.close();
    else if (d === "secret-yes") rotateSecret();
    else if (d === "secret-no") dlg.close();
    else if (d === "tpl-save") saveTemplate();
    else if (d === "tpl-reset") { ctx.resetAsk = true; renderTplFoot(); }
    else if (d === "tpl-reset-no") { ctx.resetAsk = false; renderTplFoot(); }
    else if (d === "tpl-reset-yes") resetTemplate();
    else if (d === "tpl-tab") { ctx.tab = t.dataset.tab; $("#tplGrid").dataset.tab = ctx.tab; $$("[data-d=tpl-tab]").forEach((b) => b.setAttribute("aria-pressed", String(b === t))); }
    else if (d === "var") insertVar(t.dataset.v);
  }

  function openRevoke(id) {
    const k = (D.keys || []).find((x) => x.id === id);
    if (!k) return;
    ctx = { kind: "revoke", id, busy: false };
    afterClose = () => { const b = $("#keyNew"); if (b) b.focus(); };
    openDialog("form", "ביטול מפתח",
      '<div class="warnbox">המפתח <b>' + esc(k.label || k.prefix) + "</b> יפסיק לעבוד מיד. אתרים ושרתים שמשתמשים בו יקבלו שגיאה. אי אפשר לבטל את הביטול, רק ליצור מפתח חדש.</div>" +
      '<div class="ferr" id="rkErr" role="alert"></div>' +
      '<div class="btnrow"><button type="button" class="btn danger" data-d="revoke-yes" id="rkGo">ביטול המפתח</button><button type="button" class="btn ghost" data-d="revoke-no">השארת המפתח</button></div>');
    $("[data-d=revoke-no]").focus();
  }
  async function revokeKey() {
    const c = ctx;
    if (c.busy) return;
    c.busy = true; $("#rkGo").disabled = true;
    try {
      await rpc("roster_key_revoke", { p_id: c.id });
      await load("keys");
      refreshLists();
      toast("המפתח בוטל");
      if (ctx === c) dlg.close();
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      c.busy = false; $("#rkGo").disabled = false; $("#rkErr").textContent = T.generic;
    }
  }

  /* ---------- webhook: secret and test ---------- */
  function openSecretNew() {
    ctx = { kind: "secret", busy: false };
    afterClose = () => { const b = $("#secretNew"); if (b) b.focus(); };
    openDialog("form", "סוד חתימה חדש",
      '<div class="warnbox">יוצרים סוד חדש והסוד הנוכחי מפסיק לעבוד מיד. שרת שמאמת חתימות יכשיל כל הודעה עד שתעדכנו אותו בסוד החדש.</div>' +
      '<div class="ferr" id="scErr" role="alert"></div>' +
      '<div class="btnrow"><button type="button" class="btn" data-d="secret-yes" id="scGo">יצירת סוד חדש</button><button type="button" class="btn ghost" data-d="secret-no">ביטול</button></div>');
    $("[data-d=secret-no]").focus();
  }
  async function rotateSecret() {
    const c = ctx;
    if (c.busy) return;
    c.busy = true; $("#scGo").disabled = true;
    try {
      const secret = await rpc("roster_webhook_secret_rotate");
      if (typeof secret !== "string" || !secret) throw new Error("no secret");
      if (D.settings) D.settings.webhook_secret_set = true;
      const st = $("#secState"), nb = $("#secretNew");
      if (st) st.textContent = "יש סוד פעיל. הוא נשמר אצלנו ולא מוצג שוב.";
      if (nb) nb.textContent = "יצירת סוד חדש";
      if (ctx === c) { afterClose = () => { const b = $("#secretNew"); if (b) b.focus(); }; showReveal("סוד החתימה החדש", secret, "webhook"); }
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      c.busy = false; $("#scGo").disabled = false; $("#scErr").textContent = T.generic;
    }
  }
  let testing = false;
  async function hookTest(btn) {
    if (testing) return;
    testing = true; btn.disabled = true;
    const mine = epoch;
    try {
      const r = await rpc("roster_webhook_test");
      if (r && r.error) { toast(r.error === "no_webhook" ? "קודם צריך לשמור כתובת Webhook." : T.generic); }
      else {
        toast("אירוע בדיקה נשלח לתור. התוצאה תופיע ביומן בעוד רגע.");
        [2500, 7000].forEach((ms) => setTimeout(async () => { if (epoch !== mine) return; await Promise.all([load("events"), load("deliveries")]); refreshLists(); }, ms));
      }
    } catch (e) { if (!(e && e.signedOut)) toast(T.generic); }
    testing = false; btn.disabled = false;
  }

  /* ---------- the template editor ---------- */
  /* The Worker's own rules, mirrored so the preview shows what will really be sent:
     worker/src/roster/render.js (placeholders, data-if, subject) and mail.js (variables, the footer line). */
  const TOKEN = /\{\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}\}|\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi;
  const valueOf = (vars, name) => { const k = name.toLowerCase(); return Object.prototype.hasOwnProperty.call(vars, k) && vars[k] != null ? String(vars[k]) : ""; };
  /* An element p, tr, li, a or span with data-if="x" is dropped when x is empty; the attribute goes when it stays.
     The first version of this was ONE regular expression with lazy gaps, which backtracks cubically: a template of
     a few KB made of "<p data-if" repeated froze the tab for seconds (and the same text freezes a server). This is a
     single left-to-right scan: an opening tag is looked at only within 300 characters of attributes, the closing tag is
     found with one forward search, and the editor refuses a template over MAX_TPL characters or with more than
     MAX_DATA_IF data-if before anything runs, so even the forward searches are bounded (50 x 20,000). */
  const OPEN_TAG = /^<(p|tr|li|a|span)(\s[^>]{0,300})>/i;
  const DATA_IF_ATTR = /\sdata-if="([a-z_][a-z0-9_]*)"/i;
  function applyDataIf(html, vars) {
    let out = "", i = 0;
    const n = html.length;
    while (i < n) {
      const lt = html.indexOf("<", i);
      if (lt < 0) { out += html.slice(i); break; }
      out += html.slice(i, lt);
      const open = OPEN_TAG.exec(html.slice(lt, lt + 330));
      const attr = open && DATA_IF_ATTR.exec(open[0]);
      let close = null;
      if (attr) {
        const re = new RegExp("</" + open[1].toLowerCase() + "\\s*>", "gi");
        re.lastIndex = lt + open[0].length;
        close = re.exec(html);
      }
      if (!attr || !close) { out += "<"; i = lt + 1; continue; }
      if (valueOf(vars, attr[1]).trim() !== "") {
        out += open[0].slice(0, attr.index) + open[0].slice(attr.index + attr[0].length) + html.slice(lt + open[0].length, close.index) + close[0];
      }
      i = close.index + close[0].length;
    }
    return out;
  }
  const countOf = (text, needle) => { let k = 0, at = 0; while ((at = text.indexOf(needle, at)) !== -1) { k++; at += needle.length; } return k; };
  /* "" when a template is within the bounds, else the sentence to show the person */
  function tplProblem(html) {
    if (html.length > MAX_TPL) return "התבנית ארוכה מדי: " + html.length.toLocaleString("he-IL") + " תווים, ומותר עד " + MAX_TPL.toLocaleString("he-IL") + ". כדאי לקצר או להסיר חלקים.";
    const k = countOf(html, "data-if");
    if (k > MAX_DATA_IF) return "יש בתבנית " + k + " תכונות data-if, ומותר עד " + MAX_DATA_IF + ".";
    return "";
  }
  /* {{x}} is escaped, {{{x}}} raw, but never raw for what a participant typed; an unknown name is empty */
  function renderTpl(tpl, vars) {
    return applyDataIf(String(tpl), vars).replace(TOKEN, (m, raw, dbl) => {
      const name = (raw || dbl).toLowerCase(), v = valueOf(vars, name);
      return raw && !UNTRUSTED.has(name) ? v : esc(v);
    });
  }
  /* the subject is text, not HTML: nothing escaped, no line breaks, at most 200 characters */
  const renderText = (tpl, vars) => String(tpl).replace(TOKEN, (m, raw, dbl) => valueOf(vars, raw || dbl))
    .replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 200);
  const waLink = (value) => {
    let d = String(value || "").replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0")) d = "972" + d.slice(1);
    return d.length >= 9 && d.length <= 15 ? "https://wa.me/" + d : "";
  };
  function httpLink(value) {
    const v = String(value || "");
    if (!v || v.length > 500 || /[\s\u0000-\u001f]/.test(v)) return "";
    try { const u = new URL(v); return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password ? u.href : ""; } catch (e) { return ""; }
  }
  /* the sample participant and meeting, plus the REAL settings of this business: with no payment link set, the pay-link parts disappear, as they will in the mail */
  function sampleVars(key) {
    const s = D.settings || {};
    return {
      business_name: BIZ.name, first_name: "דנה", last_name: "כהן", full_name: "דנה כהן", phone: "050-1234567", email: "dana@example.com", age: "34", gender: "אישה",
      account_email: key === "admin_account_linked" || key === "admin_phone_conflict" ? "dana.cohen@gmail.com" : "", account_name: key === "admin_account_linked" || key === "admin_phone_conflict" ? "Dana Cohen" : "",
      meeting_name: "ערב יוגה", meeting_date: "יום חמישי, 12.11", meeting_time: "20:00", place: "הסטודיו", city: "תל אביב",
      price: "80", amount: "80", method: "ביט", directions: key === "payment_confirmed" ? "קומה 2, הכניסה מהחצר.\nאפשר לחנות ברחוב הסמוך." : "",
      my_link: s.personal_area_enabled !== false ? meUrl() : "", pay_link: httpLink(s.payment_url), whatsapp_link: waLink(s.contact_whatsapp),
      admin_link: "https://floa.co.il/roster/admin/?biz=" + BIZ.slug + "&p=00000000-0000-4000-8000-000000000000",
    };
  }
  /* the text of a mail, as the Worker reads it to find the why-you-got-this sentence: tags dropped, and the content of
     script, style, head and title blocks with them. One left-to-right pass (the first version used a lazy regex, which is quadratic). */
  function plainText(html) {
    const low = html.replace(/[A-Z]+/g, (m) => m.toLowerCase());     /* ASCII only, so every index stays the same */
    const noClose = {};
    let out = "", i = 0;
    while (i < html.length) {
      const lt = html.indexOf("<", i);
      if (lt < 0) { out += html.slice(i); break; }
      out += html.slice(i, lt);
      const blk = /^<(script|style|head|title)\b/.exec(low.slice(lt, lt + 10));
      if (blk && !noClose[blk[1]]) {
        const close = low.indexOf("</" + blk[1], lt + 1), gt = close < 0 ? -1 : low.indexOf(">", close);
        if (gt >= 0) { i = gt + 1; continue; }
        noClose[blk[1]] = true;
      }
      const end = html.indexOf(">", lt + 1);
      if (end < 0) { out += html.slice(lt); break; }
      out += " ";
      i = end + 1;
    }
    return out;
  }
  /* A preview, and a mail that was sent, are shown in a frame that may fetch nothing at all: this meta comes first in the head, before
     anything of the template, and the page's own policy (img-src without remote hosts) is inherited by the frame as well. A tracking
     pixel or a remote stylesheet in a template would otherwise tell its author when and from where somebody opened it. */
  const FRAME_CSP = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">';
  const inFrame = (html) => '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">' + FRAME_CSP + "</head>" + html;
  const frameNote = (text) => inFrame('<body style="margin:0"><p dir="rtl" style="margin:0;padding:16px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#5a626c">' + esc(text) + "</p></body>");
  /* what the Worker does after rendering: a fragment gets a document around it, and a participant mail that
     lacks the why-you-got-this sentence gets it added at the end */
  function previewDoc(tplHtml, key) {
    const d = DEF[key], mark = window.ROSTER_MAIL_FOOTER_MARK || "הוזנה בטופס ההרשמה";
    let html = renderTpl(tplHtml, sampleVars(key));
    if (!/<body[\s>]/i.test(html)) html = '<!doctype html>\n<html lang="he" dir="rtl"><body dir="rtl" style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;direction:rtl;text-align:right">\n' + html + "\n</body></html>";
    if (d.who === "participant" && !plainText(html).includes(mark)) {
      const foot = '<p dir="rtl" style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6B7A78;direction:rtl;text-align:right">הודעה זו נשלחה כי הכתובת הזו ' + mark + " של " + esc(BIZ.name) + ". אם זו טעות, אפשר להתעלם מההודעה.</p>";
      const at = html.search(/<\/body\s*>/i);
      html = at === -1 ? html + foot : html.slice(0, at) + foot + html.slice(at);
    }
    return inFrame(html);
  }
  function tplState(key) {
    const d = DEF[key], row = D.templates && D.templates[key];
    return { subject: row ? row.subject : d.subject, html: row ? row.html : d.html, custom: !!row };
  }
  function openTemplate(key) {
    const d = DEF[key];
    if (!d) return;
    const st = tplState(key);
    ctx = { kind: "tpl", key, busy: false, resetAsk: false, tab: "edit", last: "tHtml", custom: st.custom };
    openDialog("wide", esc(d.name),
      '<p class="hint">' + esc(d.when) + "</p>" +
      '<label class="rfield"><span>נושא</span><input placeholder=" " id="tSubject" autocomplete="off" maxlength="200" value="' + esc(st.subject) + '"></label>' +
      '<p class="subprev" id="tSubPrev"></p>' +
      '<div class="clabel">משתנים: לחיצה מוסיפה למקום הסמן</div>' +
      '<div class="vchips">' + d.vars.map((v) => '<button type="button" class="tg chip" data-d="var" data-v="' + v + '" title="{{' + v + '}}">' + esc(VAR_NAME[v] || v) + "</button>").join("") + "</div>" +
      '<details class="help"><summary>עזרה לכתיבת תבנית</summary><ul>' +
      "<li>משתנה בסוגריים כפולים, כמו <bdi dir=\"ltr\">{{first_name}}</bdi>, מוגן מ־HTML. בסוגריים משולשים, <bdi dir=\"ltr\">{{{x}}}</bdi>, הערך נכנס כמו שהוא. פרטים שהמשתתף הקליד (שם, טלפון, אימייל, גיל, מגדר) ודרך התשלום תמיד מוגנים, גם בסוגריים משולשים.</li>" +
      "<li>אלמנט <bdi dir=\"ltr\">p</bdi>, <bdi dir=\"ltr\">tr</bdi>, <bdi dir=\"ltr\">li</bdi>, <bdi dir=\"ltr\">a</bdi> או <bdi dir=\"ltr\">span</bdi> עם <bdi dir=\"ltr\">data-if=\"pay_link\"</bdi> נעלם מהמייל כשאין ערך לאותו משתנה, למשל כשלא הוגדר קישור תשלום.</li>" +
      "<li>במיילים למשתתפים, אם הטקסט לא כולל את המשפט \"הוזנה בטופס ההרשמה\", המערכת מוסיפה בעצמה בסוף שורה שמסבירה למה הגיע המייל. אי אפשר להסיר אותה.</li>" +
      "<li>התצוגה המקדימה משתמשת בנתוני דוגמה, ובהגדרות האמיתיות של העסק (קישור תשלום, וואטסאפ, אזור אישי).</li></ul></details>" +
      '<div class="seg two tabsw" role="group" aria-label="עריכה או תצוגה"><button type="button" data-d="tpl-tab" data-tab="edit" aria-pressed="true">עריכה</button><button type="button" data-d="tpl-tab" data-tab="prev" aria-pressed="false">תצוגה מקדימה</button></div>' +
      '<div class="edgrid" id="tplGrid" data-tab="edit">' +
      '<label class="rfield ed"><span>גוף המייל (HTML)</span><textarea placeholder=" " id="tHtml" class="ltr code" dir="ltr" spellcheck="false" autocomplete="off" autocapitalize="off">' + esc(st.html) + "</textarea></label>" +
      '<div class="pv"><span class="pvl">כך זה ייראה, עם דוגמה</span><iframe id="tPrev" title="תצוגה מקדימה של המייל" sandbox="" referrerpolicy="no-referrer"></iframe></div></div>' +
      '<div class="ferr" id="tErr" role="alert"></div><div class="twarn" id="tWarn"></div>' +
      '<div id="tFoot"></div>');
    renderTplFoot();
    updatePreview();
  }
  function renderTplFoot() {
    const c = ctx;
    $("#tFoot").innerHTML = c.resetAsk
      ? '<div class="warnbox">התבנית המותאמת תימחק והמייל יחזור לנוסח ברירת המחדל. להחזיר?</div><div class="btnrow"><button type="button" class="btn danger" data-d="tpl-reset-yes" id="tResetYes">כן, להחזיר לברירת מחדל</button><button type="button" class="btn ghost" data-d="tpl-reset-no">ביטול</button></div>'
      : '<div class="btnrow"><button type="button" class="btn" data-d="tpl-save" id="tSave">שמירה</button><button type="button" class="btn ghost redtext" data-d="tpl-reset" id="tReset"' + (c.custom ? "" : " disabled") + ">החזרה לברירת מחדל</button></div>";
    if (c.resetAsk) $("[data-d=tpl-reset-no]").focus();
  }
  function templateInput() { clearTimeout(ctx.pt); ctx.pt = setTimeout(updatePreview, 90); $("#tErr").textContent = ""; }
  function updatePreview() {
    if (!ctx || ctx.kind !== "tpl") return;
    const key = ctx.key, v = sampleVars(key);
    const subject = $("#tSubject").value, htmlSrc = $("#tHtml").value;
    $("#tSubPrev").textContent = "כך ייראה הנושא: " + renderText(subject, v);
    const problem = tplProblem(htmlSrc);
    ctx.problem = problem;
    if (problem) {                         /* nothing is parsed or rendered: that is the whole defence against a poisoned template */
      $("#tPrev").srcdoc = frameNote("התצוגה המקדימה לא זמינה. " + problem);
      $("#tWarn").innerHTML = '<p class="bad">' + esc(problem) + "</p>";
      return;
    }
    $("#tPrev").srcdoc = previewDoc(htmlSrc, key);
    const names = (src) => Array.from(new Set((src.match(/\{\{\{?\s*([a-z_][a-z0-9_]*)\s*\}?\}\}/gi) || []).map((x) => x.replace(/[{}\s]/g, "").toLowerCase())));
    const warns = [];
    const unknown = names(subject + " " + htmlSrc).filter((x) => !VAR_NAME[x]);
    if (unknown.length) warns.push("משתנים שהמערכת לא מכירה (יוצגו ריקים): " + unknown.map((x) => "{{" + x + "}}").join(", "));
    /* a variable with no value that is still used where no data-if hides it: the mail would carry an empty link */
    const left = names(subject + " " + applyDataIf(htmlSrc, v));
    const why = {
      pay_link: "לא הוגדר קישור תשלום (בלשונית הרשמה)",
      whatsapp_link: "לא הוגדר מספר וואטסאפ (בלשונית הרשמה)",
      my_link: "האזור האישי כבוי (בלשונית הרשמה)",
      directions: "הוראות הגעה זמינות רק באישור תשלום",
    };
    Object.keys(why).forEach((name) => { if (left.includes(name) && !v[name]) warns.push("{{" + name + "}} יוצא ריק: " + why[name] + ". כדי להסתיר את החלק הזה כשאין ערך, אפשר להוסיף data-if=\"" + name + "\" לאלמנט שעוטף אותו."); });
    $("#tWarn").innerHTML = warns.map((w) => "<p>" + esc(w) + "</p>").join("");
  }
  function insertVar(code) {
    const tgt = ctx.last === "tSubject" ? $("#tSubject") : $("#tHtml");
    const txt = "{{" + code + "}}";
    const s = tgt.selectionStart == null ? tgt.value.length : tgt.selectionStart, e = tgt.selectionEnd == null ? s : tgt.selectionEnd;
    tgt.setRangeText(txt, s, e, "end");
    tgt.focus();
    tgt.dispatchEvent(new Event("input", { bubbles: true }));
  }
  async function saveTemplate() {
    const c = ctx;
    if (c.busy) return;
    const subject = $("#tSubject").value.trim(), html = $("#tHtml").value, err = $("#tErr");
    if (!subject) { err.textContent = "צריך נושא למייל."; $("#tSubject").focus(); return; }
    if (subject.length > 200) { err.textContent = "הנושא ארוך מדי. עד 200 תווים."; $("#tSubject").focus(); return; }
    if (!html.trim()) { err.textContent = "גוף המייל ריק."; $("#tHtml").focus(); return; }
    const problem = tplProblem(html);
    if (problem) { err.textContent = problem; $("#tHtml").focus(); return; }
    c.busy = true; $("#tSave").disabled = true; err.textContent = "";
    try {
      const res = await rest("roster_mail_templates?select=key,subject,html,updated_at", { method: "POST", json: { key: c.key, subject, html }, prefer: "resolution=merge-duplicates,return=representation" });
      const row = Array.isArray(res) && res[0] ? res[0] : { key: c.key, subject, html, updated_at: new Date().toISOString() };
      if (D.templates) D.templates[c.key] = row;
      refreshLists();
      toast(T.saved);
      if (ctx === c) { afterClose = () => { const b = $('[data-act=tpl-open][data-key="' + c.key + '"]'); if (b) b.focus(); }; dlg.close(); }
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      c.busy = false; $("#tSave").disabled = false; err.textContent = T.generic;
    }
  }
  async function resetTemplate() {
    const c = ctx;
    if (c.busy) return;
    c.busy = true; $("#tResetYes").disabled = true;
    try {
      await rpc("roster_mail_template_reset", { p_key: c.key });
      if (D.templates) delete D.templates[c.key];
      refreshLists();
      toast("הוחזר לברירת מחדל");
      if (ctx === c) {
        const d = DEF[c.key];
        c.busy = false; c.resetAsk = false; c.custom = false;
        $("#tSubject").value = d.subject; $("#tHtml").value = d.html;
        renderTplFoot(); updatePreview();
      }
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx !== c) return;
      c.busy = false; c.resetAsk = false; renderTplFoot(); $("#tErr").textContent = T.generic;
    }
  }

  /* ---------- a mail that was sent ---------- */
  async function openMail(id) {
    const m = (D.mails || []).find((x) => x.id === id);
    if (!m) return;
    ctx = { kind: "mail", id };
    const st = tagOf(mailStatus, m.status);
    openDialog("wide", esc(m.subject || "ללא נושא"),
      '<div class="mmeta"><span class="tg ' + st[1] + '">' + st[0] + "</span> אל " + mono(m.to_addr || "") + ", " + esc(fmtDate(m.sent_at || m.created_at)) + "</div>" +
      (m.error ? '<div class="errl">' + esc(m.error) + "</div>" : "") +
      '<div class="pv full"><iframe id="mPrev" title="המייל כפי שנשלח" sandbox="" referrerpolicy="no-referrer"></iframe></div>');
    try {
      const r = await rest("roster_mail_log?id=eq." + enc(id) + "&select=html");
      if (!ctx || ctx.id !== id) return;
      $("#mPrev").srcdoc = inFrame(((r && r[0] && r[0].html) || "") || "<body></body>");
    } catch (e) {
      if (e && e.signedOut) return;
      if (ctx && ctx.id === id) $("#mPrev").srcdoc = frameNote(T.generic);
    }
  }

  /* ---------- go ---------- */
  async function boot() {
    const mine = ++epoch;
    const sp = new URLSearchParams(location.search);
    let slug = (sp.get("biz") || "").trim().toLowerCase();
    try { if (slug) sessionStorage.setItem(SK, slug); else slug = sessionStorage.getItem(SK) || ""; } catch (e) { /* storage blocked */ }
    const hs = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (hs.get("error_description")) {
      history.replaceState(null, "", location.pathname + location.search);
      return showGate("הכניסה לא הצליחה. אפשר לנסות שוב.", "in");
    }
    if (!A || !SB) { gate.hidden = false; wrap.hidden = true; $("#gateIn").innerHTML = "<h1>" + TITLE + "</h1><p>" + esc(T.noAuth) + "</p>"; return; }
    if (!A.signedIn()) return showGate("", "in");
    let mineList;
    try { mineList = await rest("rpc/roster_my_businesses", { method: "POST", json: {}, noBiz: true }); }
    catch (e) { if (e && e.signedOut) return; return showGate("אין חיבור לנתונים. נסו שוב בעוד רגע.", "fail"); }
    if (epoch !== mine) return;
    MINE = Array.isArray(mineList) ? mineList : [];
    if (!slug) return showGate("כדי לפתוח את דף החיבורים צריך לבחור עסק.", "nobiz");
    const row = MINE.find((b) => b.slug === slug);
    if (!row) return showGate("אין לך גישה לעסק הזה.", "denied");
    BIZ = { slug: row.slug, id: row.id, name: row.name || row.slug };
    document.title = TITLE + " · " + BIZ.name;
    $("#bizName").textContent = BIZ.name;
    gate.hidden = true; wrap.hidden = false;
    $("#whoName").textContent = A.name() || A.email();
    $("#userBtn").setAttribute("aria-label", "החשבון שלי" + (A.name() || A.email() ? ": " + (A.name() || A.email()) : ""));
    renderPanel(false);          /* "loading" until the data is in */
    await loadAll();
    if (epoch !== mine) return;
    renderPanel(false);
  }

  /* a second tab changed the session */
  window.addEventListener("storage", (e) => { if (e.key === "floa.session" && !e.newValue && !wrap.hidden) sessionLost(); });
  boot();
})();
