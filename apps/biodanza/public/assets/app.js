/* Biodanza: a facilitator builds a vivencia, plans it along the curve, plays it in the session.
   Built ONLY from the kit's elements (/kit.css): rhead, rlist, rrow, rcard, rbtn, rchip, rfield, rempty, rmsg, rfab.
   Data: schema `biodanza` (apps/biodanza/schema.sql), through FLOA_AUTH.api. Row level security decides who sees what. */
(function () {
  "use strict";
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  /* Every vivencia and every exercise has an address of its own, in the path (no # in the bar): /<vivencia> and /<vivencia>/<exercise>.
     On localhost the app lives under /biodanza/, so the same addresses carry that prefix there. */
  var BASE = /^(localhost|127[.])/.test(location.hostname) ? "/biodanza/" : "/";
  var popping = false, pending = null;   /* pending: an address the page was opened on, waiting for the list to load */
  function setUrl(u) { if (!popping && location.pathname !== u) history.pushState(null, "", u); }
  function parseUrl() { var seg = location.pathname.slice(BASE.length).split("/").filter(Boolean); return { viv: seg[0] || "", item: seg[1] || "" }; }
  function wide() { return window.matchMedia("(min-width: 1024px)").matches; }
  var api = function (p, o) { return FLOA_AUTH.api(p, o); };
  var state = { members: [], me: null, lines: [], phases: [], cat: null, vivs: [], viv: null, items: [], filter: "" };

  var I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 .6 3 2.2 3 5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    curve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 16c2.5-9 5-9 7.5-1s5 8 7.5 0c1-3 2.500-5 5-6"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    yt: '<svg viewBox="0 0 24 24" stroke="none" aria-hidden="true" style="width:calc(var(--icon-l) * 1.6);height:calc(var(--icon-l) * 1.6)"><rect x="1" y="5" width="22" height="14" rx="4.500" fill="currentColor"/><path d="M10 9l5.500 3-5.500 3z" style="fill:var(--bg)"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.500 4.500L19 7"/></svg>',
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/></svg>'
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function name(e) { return e.title_he || e.title_en || ""; }
  function phaseName(k) { var p = state.phases.filter(function (x) { return x.key === k; })[0]; return p ? p.name_he : ""; }
  function catName(k) { var c = (state.cats || []).filter(function (x) { return x.key === k; })[0]; return c ? c.name_he : ""; }
  function lineName(k) { var l = state.lines.filter(function (x) { return x.key === k; })[0]; return l ? l.name_he : k; }
  /* a song is two things: its name and who plays it */
  function songName(m) { return m ? (m.title || m.name || "") : ""; }
  function songBy(m) { return m ? (m.artist || "") : ""; }
  function canEdit() { return !state.viv || state.viv.role !== "view"; }   /* a share for viewing changes nothing; the database enforces it too */
  /* the same button wherever a song is shown: it searches the song and its artist on YouTube, in a new tab */
  /* the YouTube button of the song played last is red, the others are muted (kept in this browser, so it is still marked tomorrow) */
  var played = (function () { try { return localStorage.getItem("biodanza.played") || ""; } catch (e) { return ""; } })();
  function ytColor(id) { return id && id === played ? "var(--danger)" : "var(--text-3)"; }
  function ytLink(m, trail) {
    return '<a class="rbtn rbtn--icon' + (trail ? ' rrow__trail' : '') + '" data-yt="' + esc(m.id || "") + '" href="https://www.youtube.com/results?search_query=' + encodeURIComponent((songName(m) + " " + songBy(m)).trim()) + '" target="_blank" rel="noopener" aria-label="ניגון ביוטיוב" title="ניגון ביוטיוב" style="width:var(--fab);height:var(--fab);min-height:var(--fab);color:' + ytColor(m.id) + '">' + I.yt + '</a>';
  }
  /* a song with a file in the bucket gets the sound button (assets/audio.js); one without keeps the YouTube button */
  function songBtn(m, trail) { return m.audio_object && window.BioAudio ? BioAudio.button(m.audio_object, trail) : ytLink(m, trail); }
  window.toast = window.toast || toast;
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-yt]"); if (!a) return;
    played = a.dataset.yt;
    try { localStorage.setItem("biodanza.played", played); } catch (x) { /* not kept */ }
    document.querySelectorAll("a[data-yt]").forEach(function (x) { x.style.color = ytColor(x.dataset.yt); });
  });

  function clock(sec) { return Math.floor(sec / 60) + ":" + ("0" + (sec % 60)).slice(-2); }
  /* poetics and guidance: this item's own text if the facilitator changed it, else the catalog's (the catalog itself is never touched) */
  function itemName(it) { return it.title || name(it.exercises || {}); }
  var LANG = "he";   /* the language of the texts: the catalog's text in this language, else English, else what the exercise itself holds */
  function baseTxt(it, k) {
    var e = it.exercises || {}, ts = e.exercise_texts || [];
    var pick = function (l) { var t = ts.filter(function (x) { return x.lang === l && x[k]; })[0]; return t ? t[k] : ""; };
    return pick(LANG) || pick("en") || e[k] || "";
  }
  function txt(it, k) { return it[k] != null ? it[k] : baseTxt(it, k); }
  /* a text nobody has checked yet: the catalog has none for this exercise, so the one shown was drafted from its name. It stays marked until the facilitator writes their own. */
  function isDraft(it, k) {
    if (it[k] != null) return false;
    var ts = (it.exercises || {}).exercise_texts || [], t = ts.filter(function (x) { return x.lang === LANG && x[k]; })[0];
    return !!t && (t.source === "draft" || t.source === "translation");
  }
  var DRAFT = ' style="color:var(--warn);background:var(--warn-bg)" title="טיוטה: תרגום או טקסט שנכתב מהשם, ולא נבדק"';
  function grow(t) { t.style.height = "auto"; t.style.height = (t.scrollHeight + t.offsetHeight - t.clientHeight) + "px"; var mh = parseFloat(getComputedStyle(t).maxHeight); t.style.overflowY = mh && t.scrollHeight > mh ? "auto" : "hidden"; }   /* rows=1: the height is the text's own, plus the line under it */
  /* the placeholder of an empty list or pane: the curve icon, a title and one line */
  function ph(title, text) { return '<div class="rempty">' + I.curve + '<b>' + esc(title) + '</b>' + (text ? '<span>' + esc(text) + '</span>' : '') + '</div>'; }
  function uuid() { return crypto.randomUUID(); }
  function head(title, sub, back, trail, lead) {
    return '<header class="rhead">' + (lead || '') + (back ? '<button class="rbtn rbtn--icon rbtn--edge-start" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title">' + esc(title) + '</h1>' + (sub ? '<span class="rhead__sub">' + esc(sub) + '</span>' : '') + '</div>' + (trail || '') + '</header>';
  }
  /* the header that walks a sequence: previous on the right, next on the left, the name centred between them */
  function walkHead(title, hasPrev, hasNext, withList) {
    return '<header class="rhead"><button class="rbtn rbtn--icon rbtn--edge-start" data-act="prevW" aria-label="הקודם" title="הקודם"' + (hasPrev ? "" : " disabled") + '>' + I.back + '</button>' +
      (withList ? '<button class="rbtn rbtn--icon" data-act="list" aria-label="לרשימת התרגילים" title="לרשימת התרגילים">' + I.list + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title" style="text-align:center">' + esc(title) + '</h1></div>' +
      (withList ? '<span aria-hidden="true" style="flex:none;width:var(--ctl)"></span>' : '') +
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="nextW" aria-label="הבא" title="הבא"' + (hasNext ? "" : " disabled") + '>' + I.fwd + '</button></header>';
  }
  /* the header of one exercise: buttons only, each with its word. Previous and the list on the right, next on the left. The name is the field below. */
  function itemHead(hasPrev, hasNext, where) {
    var b = function (act, ico, label, off, after) {
      var shown = esc(label);
      if (act === "list" && where) shown = shown.replace(/^(\d+)/, '<b style="font-weight:var(--fw-black)">$1</b>');   /* the number of this exercise stands out from the total */
      return '<button class="rbtn rbtn--ghost" data-act="' + act + '" title="' + esc(label) + '"' + (act === "list" ? ' style="flex:1 1 auto"' : "") + (off ? " disabled" : "") + '>' + (after ? '<span>' + shown + '</span>' + ico : ico + '<span>' + shown + '</span>') + '</button>';
    };
    return '<header class="rhead">' + b("prevW", I.back, "הקודם", !hasPrev) + b("list", I.list, where || "לרשימה", false) + b("nextW", I.fwd, "הבא", !hasNext, true) + '</header>';
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "rmsg rmsg--toast"; t.setAttribute("role", "status"); t.innerHTML = '<span class="rmsg__text">' + esc(msg) + '</span>';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }
  function fail(e) { console.error(e); toast("משהו השתבש, נסו שוב"); }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  function show(html, wire, pane) { var t = wide() && pane === "d" ? pd : pl; t.innerHTML = html; if (wire) wire(t); }
  /* wide screen: the vivencia list on the right, and after choosing one its exercises take that place and the open exercise is on the left. Back from the exercises is the vivencia list again. */
  function homeWide() { state.viv = null; state.lastItem = null; emptyDetail(); home(); }
  function emptyDetail() {
    if (wide()) show(ph("בחרו ויוונסיה", "התרגילים שלה יופיעו כאן"), null, "d");
    state.viv = null; paintSel(); setUrl(BASE);
  }
  function paintSel() { pl.querySelectorAll("[data-id]").forEach(function (b) { b.closest(".rrow").setAttribute("aria-current", state.viv && b.dataset.id === state.viv.id ? "true" : "false"); }); }
  function on(root, act, fn) { root.querySelectorAll('[data-act="' + act + '"]').forEach(function (b) { b.addEventListener("click", function (ev) { fn(b, ev); }); }); }
  function stack() { return stack.s || (stack.s = []); }
  function go(fn) { stack().push(fn); fn(); }
  function back() { stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); else if (wide()) homeWide(); else home(); }

  /* ---------- gate ---------- */
  function gate(msg, signedIn) {
    show('<div class="rempty" style="margin-block:auto"><b>ביודנסה</b><span>' + esc(msg) + '</span>' +
      (signedIn ? '<button class="rbtn rbtn--ghost" data-act="out">יציאה</button>' : '<button class="rbtn" data-act="in">כניסה עם גוגל</button>') + '</div>', function (r) {
      on(r, "in", function () { FLOA_AUTH.signIn(location.origin + BASE); });
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
    });
  }

  /* ---------- home: my vivencias ---------- */
  function home() {
    if (!wide()) { stack().length = 0; stack().push(home); setUrl(BASE); }
    show(head("הוויוונסיות שלי", "", false,
      (state.me.admin ? '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="allow" aria-label="מורשים" title="מורשים">' + I.users + '</button>' : '') +
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="out" aria-label="יציאה" title="יציאה">' + I.out + '</button>',
      '<img src="favicon.png" alt="" style="flex:none;width:var(--ctl);height:var(--ctl);border-radius:var(--r-ctl)">') +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '<button class="rfab" data-act="new" aria-label="ויוונסיה חדשה" title="ויוונסיה חדשה">' + I.plus + '</button>', function (r) {
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
      on(r, "allow", allowPopup);
      on(r, "new", newViv);
    });
    var uid = FLOA_AUTH.userId();
    Promise.all([api("/rest/v1/vivencias?select=id,title,updated_at,vivencia_items(count)"), api("/rest/v1/vivencia_owners?user_id=eq." + uid + "&select=vivencia_id,position"),
      api("/rest/v1/vivencia_shares?email=eq." + encodeURIComponent(FLOA_AUTH.email().toLowerCase()) + "&select=vivencia_id,role,position")]).then(function (r) {
      var pos = {}, role = {};
      (r[2] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = o.role; });   /* shared with me */
      (r[1] || []).forEach(function (o) { pos[o.vivencia_id] = o.position; role[o.vivencia_id] = "owner"; });   /* mine: an owner is above any share */
      state.vivs = (r[0] || []).map(function (v) { v.pos = pos[v.id]; v.role = role[v.id] || "view"; return v; });
      /* my own order; a vivencia I have not placed yet (a new one) comes first, newest first */
      state.vivs.sort(function (a, b) { var pa = a.pos == null ? -1 : a.pos, pb = b.pos == null ? -1 : b.pos; return pa - pb || (a.updated_at < b.updated_at ? 1 : -1); });
      renderVivs();
    }, fail);
  }
  function renderVivs() {
    var l = document.getElementById("hl"); if (!l) return;
    l.innerHTML = state.vivs.length ? state.vivs.map(function (v) {
      var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
      return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-id="' + v.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub" data-n="' + v.id + '">' + n + ' תרגילים' + (v.role === "owner" ? "" : " · משותף" + (v.role === "view" ? " (צפייה)" : " (עריכה)")) + '</span></button></div>';
    }).join("") : ph("עוד אין ויוונסיות", "לחצו על + כדי ליצור את הראשונה");
    l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); });
    if (state.vivs.length) enableDrag(l, "[data-id]", persistVivs);
    paintSel();
    if (pending && pending.viv) {   /* opened on a vivencia's own address */
      var vv = state.vivs.filter(function (x) { return x.id === pending.viv; })[0];
      var want = pending; pending = want.item ? { item: want.item } : null;   /* the address is used once: going back to the list must not open it again */
      if (vv) { openViv(vv.id); return; }
    }
    if (wide() && !state.viv) emptyDetail();
  }

  function newViv() { namePopup({ id: uuid(), title: "" }, true); }
  /* Who guides an exercise: optional, any number of people, offered only when a vivencia has more than two editors (owners and accounts shared with edit rights). */
  function facOn() { return state.members.length > 2; }
  function facName(e) { var m = state.members.filter(function (x) { return x.email === e; })[0]; return m && m.note ? m.note : e.split("@")[0]; }
  function facEmails(it) { return (it.vivencia_item_facilitators || []).map(function (x) { return x.email; }); }
  function facLabel(it) {
    var es = facEmails(it);
    return !es.length ? "מנחה" : es.length === 1 ? facName(es[0]) : facName(es[0]) + " +" + (es.length - 1);
  }
  function facChip(it, extra) {
    if (!facOn()) return "";
    var has = facEmails(it).length > 0;
    if (!canEdit()) return has ? '<span class="rchip' + (extra || "") + '" data-fac-label="' + it.id + '">' + esc(facLabel(it)) + '</span>' : "";
    return '<button type="button" class="rchip rchip--button' + (extra || "") + '" data-fac="' + it.id + '" aria-haspopup="menu" aria-pressed="' + has + '">' + esc(facLabel(it)) + '</button>';
  }
  function facRefresh(it) {
    document.querySelectorAll('[data-fac="' + it.id + '"]').forEach(function (b) { b.textContent = facLabel(it); b.setAttribute("aria-pressed", String(facEmails(it).length > 0)); });
  }
  /* the menu of people: a tick adds or removes one, the menu stays open so several can be ticked */
  function facMenu(btn, it) {
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    var blank = '<svg viewBox="0 0 24 24" aria-hidden="true"></svg>';
    function paintM() {
      var on = facEmails(it);
      m.innerHTML = state.members.map(function (x, k) {
        return '<button type="button" class="rmenu__item" role="menuitemcheckbox" aria-checked="' + (on.indexOf(x.email) >= 0) + '" data-k="' + k + '">' + (on.indexOf(x.email) >= 0 ? I.check : blank) + '<span>' + esc(x.note || x.email) + '</span></button>';
      }).join("");
      m.querySelectorAll("[data-k]").forEach(function (b) {
        b.addEventListener("click", function () {
          var mem = state.members[+b.dataset.k], has = facEmails(it).indexOf(mem.email) >= 0;
          var req = has ? api("/rest/v1/vivencia_item_facilitators?item_id=eq." + it.id + "&email=eq." + encodeURIComponent(mem.email), { method: "DELETE" })
                        : api("/rest/v1/vivencia_item_facilitators", { method: "POST", prefer: "return=minimal", json: { item_id: it.id, email: mem.email } });
          req.then(function () {
            it.vivencia_item_facilitators = has ? (it.vivencia_item_facilitators || []).filter(function (x) { return x.email !== mem.email; }) : (it.vivencia_item_facilitators || []).concat([{ email: mem.email }]);
            paintM(); facRefresh(it);
          }, fail);
        });
      });
    }
    paintM();
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.min(Math.round(r.left), window.innerWidth - m.offsetWidth - 8)) + "px";
    function close() { m.remove(); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target) && e.target !== btn) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
  }
  /* a chip's click is its own: it never opens the strip, and it is not the start of a drag */
  function wireFac(root) {
    root.querySelectorAll("[data-fac]").forEach(function (b) {
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var it = state.items.filter(function (x) { return x.id === b.dataset.fac; })[0];
        if (it) facMenu(b, it);
      });
    });
  }

  /* the kit's anchored menu: opens under its button, closes on a tap outside or Escape */
  function menu(btn, items) {
    var old = document.getElementById("moreMenu"); if (old) old.remove();
    var m = document.createElement("div"); m.id = "moreMenu"; m.className = "rmenu rmenu--fixed"; m.setAttribute("role", "menu");
    m.innerHTML = items.map(function (it, k) { return '<button type="button" class="rmenu__item" role="menuitem" data-k="' + k + '"' + (it.tone ? ' data-tone="' + it.tone + '"' : '') + '>' + it.icon + '<span>' + esc(it.label) + '</span></button>'; }).join("");
    document.body.appendChild(m);
    var r = btn.getBoundingClientRect();
    m.style.top = Math.round(r.bottom + 4) + "px"; m.style.left = Math.max(8, Math.round(r.left)) + "px";
    function close() { m.remove(); document.removeEventListener("click", away, true); document.removeEventListener("keydown", onKey, true); }
    function away(e) { if (!m.contains(e.target)) close(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    setTimeout(function () { document.addEventListener("click", away, true); document.addEventListener("keydown", onKey, true); }, 0);
    m.querySelectorAll("[data-k]").forEach(function (b) { b.addEventListener("click", function () { var f = items[+b.dataset.k].fn; close(); f(); }); });
    var first = m.querySelector(".rmenu__item"); if (first) first.focus({ preventScroll: true });
  }

  /* sharing: only with accounts of the allowlist (chosen from it, never typed), as a viewer or an editor */
  function sharePopup(v) {
    var dlg = document.getElementById("shareDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "shareDlg"; document.body.appendChild(dlg); }
    var shares = [], cands = [];
    RosterSheet.render(dlg, {
      title: "שיתוף", from: "bottom",
      body: '<div class="pad"><label class="rfield"><span>חיפוש (אימייל או שם)</span><input id="sq" type="search" placeholder=" " autocomplete="off"></label></div><div id="slist"></div>'
    });
    function who(e) { var c = cands.filter(function (x) { return x.email === e; })[0]; return c && c.note ? c.note : e; }
    function paintS() {
      var q = dlg.querySelector("#sq").value.trim().toLowerCase(), l = dlg.querySelector("#slist");
      var have = {}; shares.forEach(function (x) { have[x.email] = 1; });
      var mine = shares.filter(function (x) { return !q || (x.email + " " + who(x.email)).toLowerCase().indexOf(q) >= 0; });
      var rest = cands.filter(function (c) { return !have[c.email] && (!q || (c.email + " " + (c.note || "")).toLowerCase().indexOf(q) >= 0); });
      var title2 = function (t) { return '<div class="rrow rrow--compact"><span class="rrow__sub">' + t + '</span></div>'; };
      var html = "";
      if (mine.length) {
        html += title2("משותף עם") + mine.map(function (x) {
          return '<div class="rrow"><div class="rrow__main"><span class="rrow__title">' + esc(who(x.email)) + '</span>' + (who(x.email) !== x.email ? '<span class="rrow__sub" dir="ltr">' + esc(x.email) + '</span>' : '') + '</div>' +
            '<button type="button" class="rchip rchip--button" data-role="view" data-e="' + esc(x.email) + '" aria-pressed="' + (x.role === "view") + '">צפייה</button>' +
            '<button type="button" class="rchip rchip--button" data-role="edit" data-e="' + esc(x.email) + '" aria-pressed="' + (x.role === "edit") + '">עריכה</button>' +
            '<button type="button" class="rbtn rbtn--icon" data-rm="' + esc(x.email) + '" aria-label="הסרה" title="הסרה">' + I.x + '</button></div>';
        }).join("");
      }
      if (rest.length) {
        html += title2("אפשר לשתף עם") + rest.map(function (c) {
          return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-add="' + esc(c.email) + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(c.note || c.email) + '</span>' + (c.note ? '<span class="rrow__sub" dir="ltr">' + esc(c.email) + '</span>' : '') + '</button></div>';
        }).join("");
      }
      l.innerHTML = html || ph("אין חשבונות", "אפשר לשתף רק עם חשבונות מרשימת המורשים. את הרשימה מנהל המנהל.");
      l.querySelectorAll("[data-role]").forEach(function (b) { b.addEventListener("click", function () { setRole(b.dataset.e, b.dataset.role); }); });
      l.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(b.dataset.rm), { method: "DELETE" }).then(load, fail); }); });
      l.querySelectorAll("[data-add]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/vivencia_shares", { method: "POST", prefer: "return=minimal", json: { vivencia_id: v.id, email: b.dataset.add, role: "view" } }).then(load, fail); }); });
    }
    function setRole(e, role) { api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&email=eq." + encodeURIComponent(e), { method: "PATCH", json: { role: role } }).then(load, fail); }
    function load() {
      return Promise.all([api("/rest/v1/vivencia_shares?vivencia_id=eq." + v.id + "&select=email,role&order=created_at"), api("/rest/v1/rpc/share_candidates", { method: "POST", json: {} })]).then(function (r) { shares = r[0] || []; cands = r[1] || []; paintS(); }, fail);
    }
    dlg.querySelector("#sq").addEventListener("input", paintS);
    load();
  }

  /* removing an exercise from a vivencia is asked in the kit's popup, one action; the catalog's exercise is untouched */
  function confirmRemoveItem(it) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: "הסרת תרגיל", from: "bottom", size: "s",
      body: '<div class="pad"><span>להסיר את "' + esc(itemName(it)) + '" מהוויוונסיה? התרגיל נשאר בקטלוג.</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cdel">הסרה</button>'
    });
    dlg.querySelector("#cdel").addEventListener("click", function () {
      api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "DELETE" }).then(function () { dlg.close(); toast("התרגיל הוסר"); state.lastItem = null;
        if (wide()) { show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); setUrl(BASE + state.viv.id); loadItems().then(paint, fail); } else back(); }, fail);
    });
  }
  /* the name (the theme) of a vivencia is set here, from the list: the kit's popup with a header check to save */
  function namePopup(v, isNew) {
    var dlg = document.getElementById("nameDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "nameDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: isNew ? "ויוונסיה חדשה" : "שינוי שם", from: "bottom", size: "s",
      body: '<div class="pad"><label class="rfield"><span>נושא</span><input id="nt" placeholder=" " autocomplete="off" value="' + esc(v.title) + '"></label></div>',
      foot: '<button class="rbtn rbtn--block" type="button" id="nsave">שמירה</button>'
    });
    var inp = dlg.querySelector("#nt"); inp.focus();
    function save() {
      var t = inp.value.trim(); if (!t) return toast("חסר נושא");
      var done = function () {
        dlg.close();
        if (isNew) { state.vivs.unshift({ id: v.id, title: t }); if (wide()) home(); openViv(v.id); }
        else { v.title = t; if (state.viv && state.viv.id === v.id) state.viv.title = t; home(); if (state.viv && state.viv.id === v.id) editor(); }
      };
      (isNew ? api("/rest/v1/vivencias", { method: "POST", json: { id: v.id, title: t }, prefer: "return=minimal" })
             : api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { title: t, updated_at: new Date().toISOString() } })).then(done, fail);
    }
    dlg.querySelector("#nsave").addEventListener("click", save);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); save(); } });
  }

  /* ---------- the vivencia: plan along the curve ---------- */
  function openViv(id) { if (!state.viv || state.viv.id !== id) state.lastItem = null; state.filter = ""; state.viv = state.vivs.filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) { stack().length = 0; show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); } go(editor); paintSel(); }
  function loadItems() {
    return api("/rest/v1/vivencia_items?vivencia_id=eq." + state.viv.id + "&select=id,position,exercise_id,music_id,notes,title,poetics,guidance,exercises(title_he,title_en,poetics,guidance,objective,exercise_texts(lang,poetics,guidance,source)),music(id,name,title,artist,duration_sec,audio_object,in_catalog),vivencia_item_facilitators(email)&order=position").then(function (r) { state.items = r || []; });
  }
  function editor() {
    var v = state.viv; setUrl(BASE + v.id);
    show(head(v.title || "ויוונסיה חדשה", "", true, v.role === "view" ? '' : '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="more" aria-haspopup="menu" aria-label="עוד" title="עוד">' + I.dots + '</button>') +
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      (v.role === "view" ? '' : '<button class="rfab" data-act="add" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>'), function (r) {
      on(r, "back", back); on(r, "add", function () { go(picker); });
      on(r, "more", function (b) {
        menu(b, [{ label: "עריכת שם", icon: I.pen, fn: function () { namePopup(v, false); } }].concat(v.role === "owner" ? [{ label: "שיתוף", icon: I.share, fn: function () { sharePopup(v); } }, { label: "מחיקה", icon: I.trash, tone: "danger", fn: function () { confirmDelete(v); } }] : []));
      });
    });
    api("/rest/v1/rpc/vivencia_members", { method: "POST", json: { v: v.id } }).then(function (mm) { state.members = mm || []; if (document.getElementById("list")) paint(); }, function () { state.members = []; });
    loadItems().then(function () {
      paint();
      if (pending && pending.item) {   /* opened on an exercise's own address */
        var want = pending.item; pending = null;
        var it = state.items.filter(function (x) { return x.id === want; })[0];
        if (it) { if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }
      }
    }, fail);
  }
  /* a confirmation is the kit's popup with ONE action: closing it is the cancel */
  function confirmDelete(v) {
    var dlg = document.getElementById("confirmDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "confirmDlg"; document.body.appendChild(dlg); }
    RosterSheet.render(dlg, {
      title: "מחיקת ויוונסיה", from: "bottom", size: "s",
      body: '<div class="pad"><span>למחוק את "' + esc(v.title || "ויוונסיה ללא שם") + '" ואת כל התרגילים שבה? אי אפשר לשחזר.</span></div>',
      foot: '<button class="rbtn rbtn--danger rbtn--block" type="button" id="cdel">מחיקה</button>'
    });
    dlg.querySelector("#cdel").addEventListener("click", function () {
      api("/rest/v1/vivencias?id=eq." + v.id, { method: "DELETE" }).then(function () {
        dlg.close(); toast("הוויוונסיה נמחקה"); state.viv = null; stack().length = 0;
        if (wide()) homeWide(); else home();
      }, fail);
    });
  }
  function paint() {
    var l = document.getElementById("list"); if (!l || !l.hasAttribute("data-fab-room")) return;   /* only the vivencia's own list: the catalog picker has a list too */
    var cnt = state.viv && pl.querySelector('[data-n="' + state.viv.id + '"]'); if (cnt) cnt.textContent = state.items.length + " תרגילים";
    var vis = state.items;   /* the order of the list IS the curve: no phase is kept on an item */
    if (!vis.length) { l.innerHTML = ph("הוויוונסיה ריקה", "לחצו על + כדי להוסיף תרגיל מהקטלוג"); return; }
    l.innerHTML = vis.map(function (i, k) {
      var e = i.exercises || {};
      return '<div class="rrow rrow--link"' + (state.lastItem === i.id ? ' aria-current="true"' : '') + '><span class="rchip rchip--s" aria-hidden="true">' + (k + 1) + '</span><button type="button" class="rrow__main" data-edit="' + i.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(itemName(i)) + '</span><span class="rrow__sub">' + esc([songName(i.music), songBy(i.music), i.music && i.music.duration_sec ? clock(i.music.duration_sec) : ""].filter(Boolean).join(" · ") || "בלי מוזיקה") + '</span></button>' + facChip(i, ' rrow__trail') + '</div>';
    }).join("");
    l.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var it = state.items.filter(function (x) { return x.id === b.dataset.edit; })[0]; if (wide()) itemScreen(it); else go(function () { itemScreen(it); }); }); });
    wireFac(l);
    if (canEdit()) enableDrag(l, "[data-edit]", persistItems);
  }
  function persistItems(from, to) {
    var moved = state.items.splice(from, 1)[0]; state.items.splice(to, 0, moved);
    Promise.all(state.items.map(function (it, k) {
      if (it.position === k + 1) return null;
      it.position = k + 1;
      return api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { position: k + 1 } });
    })).then(loadItems).then(paint, fail);
  }
  function persistVivs(from, to) {
    var moved = state.vivs.splice(from, 1)[0]; state.vivs.splice(to, 0, moved);
    var uid = FLOA_AUTH.userId();
    Promise.all(state.vivs.map(function (v, k) {
      if (v.pos === k + 1) return null;
      v.pos = k + 1;
      return v.role === "owner" ? api("/rest/v1/vivencia_owners?vivencia_id=eq." + v.id + "&user_id=eq." + uid, { method: "PATCH", json: { position: k + 1 } })
                                : api("/rest/v1/rpc/set_share_position", { method: "POST", json: { v: v.id, pos: k + 1 } });
    })).then(function () { renderVivs(); }, fail);
  }

  /* Reorder by dragging a row (no arrows). A mouse drags after a few pixels; a finger after a short hold, so scrolling still works.
     Only transform is animated. Keyboard: Alt + Arrow up/down on the focused row title. The order of the list is the curve. */
  function enableDrag(l, keySel, onMove) {
    if (l._dragOff) l._dragOff();   /* the list element is reused: drop the previous paint's listeners */
    var rows = [].slice.call(l.querySelectorAll(".rrow"));
    var d = null, blockTouch = function (e) { if (d && d.live) e.preventDefault(); };
    l.addEventListener("touchmove", blockTouch, { passive: false });
    rows.forEach(function (row, k) {
      var title = row.querySelector(keySel);
      title.addEventListener("keydown", function (e) {
        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
        var to = k + (e.key === "ArrowUp" ? -1 : 1);
        if (to < 0 || to >= rows.length) return;
        e.preventDefault(); onMove(k, to);
      });
      row.addEventListener("pointerdown", function (e) {
        if (e.button > 0) return;
        d = { grip: !!e.target.closest("[data-grip]"), row: row, k: k, y0: e.clientY, pid: e.pointerId, live: false, timer: null, tops: rows.map(function (r) { var b = r.getBoundingClientRect(); return b.top + b.height / 2; }), h: row.getBoundingClientRect().height, to: k };
        if (e.pointerType === "touch" && !d.grip) d.timer = setTimeout(function () { if (d && !d.live) begin(); }, 160);
      });
    });
    function begin() {
      d.live = true; d.row.setPointerCapture && d.row.setPointerCapture(d.pid);
      d.row.style.transition = "none"; d.row.style.zIndex = "var(--z-raised)"; d.row.style.boxShadow = "var(--sh-card)"; d.row.style.position = "relative";
      rows.forEach(function (r) { if (r !== d.row) r.style.transition = "transform var(--t-base) var(--ease)"; });
    }
    function move(e) {
      if (!d) return;
      var dy = e.clientY - d.y0;
      if (!d.live) {
        if (e.pointerType === "touch" && !d.grip) { if (Math.abs(dy) > 8) { clearTimeout(d.timer); d = null; } return; }
        if (Math.abs(dy) < 6) return;
        begin();
      }
      d.row.style.transform = "translateY(" + dy + "px)";
      var c = d.tops[d.k] + dy, to = 0;
      d.tops.forEach(function (t, i) { if (i !== d.k && t < c) to++; });
      d.to = to;
      rows.forEach(function (r, i) {
        if (r === d.row) return;
        var shift = 0;
        if (d.k < to && i > d.k && i <= to) shift = -d.h;
        if (d.k > to && i >= to && i < d.k) shift = d.h;
        r.style.transform = shift ? "translateY(" + shift + "px)" : "";
      });
    }
    l.addEventListener("pointermove", move);
    function finish() {
      if (!d) return;
      clearTimeout(d.timer);
      var was = d; d = null;
      if (!was.live) return;
      rows.forEach(function (r) { r.style.transform = ""; r.style.transition = ""; r.style.zIndex = ""; r.style.boxShadow = ""; r.style.position = ""; });
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };   /* the drag is not a tap on the title; only the click that comes right after it */
      l.addEventListener("click", eat, true); setTimeout(function () { l.removeEventListener("click", eat, true); }, 80);
      if (was.to !== was.k) onMove(was.k, was.to);
    }
    l.addEventListener("pointerup", finish); l.addEventListener("pointercancel", finish);
    l._dragOff = function () { l.removeEventListener("touchmove", blockTouch); l.removeEventListener("pointermove", move); l.removeEventListener("pointerup", finish); l.removeEventListener("pointercancel", finish); l._dragOff = null; };
  }

  /* ---------- one item: music, poetics, guidance, notes ---------- */
  function itemScreen(it) {
    var e = it.exercises || {};
    setUrl(BASE + state.viv.id + "/" + it.id);
    state.lastItem = it.id;   /* the strip of the exercise last opened stays marked in the list, like the vivencia in its list */
    var k = state.items.indexOf(it), prevIt = state.items[k - 1], nextIt = state.items[k + 1];
    /* the header walks the sequence: the right button to the previous exercise, the left one to the next, the name between them */
    var hd = itemHead(!!prevIt, !!nextIt, (k + 1) + "/" + state.items.length);   /* the middle button says where we are, and still opens the list */
    show(hd + '<div class="rlist"><div class="pad">' +
      '<div style="display:flex;align-items:flex-end;gap:var(--gap-button)">' + '<label class="rfield" style="flex:1 1 auto;margin:0"><span>שם התרגיל</span><input id="ina" style="font-weight: var(--fw-black); font-size: var(--fs-m)" placeholder=" " autocomplete="off" value="' + esc(itemName(it)) + '"></label>' + facChip(it) + '</div>' +
      '<div class="rcard rcard--flat rcard--link" data-act="pickMusic" role="button" tabindex="0" style="margin:0;cursor:pointer;display:flex;align-items:center;gap:var(--gap-button)"><div class="rcard__body" style="flex:1 1 auto;min-width:0">' +
        (it.music ? '<b>' + esc(songName(it.music)) + '</b>' + (songBy(it.music) ? '<br>' + esc(songBy(it.music)) : '') : 'לחצו לבחירת מוזיקה') + '</div>' +
        (it.music ? songBtn(it.music) : '') + '</div>' +
      '<label class="rfield"><span>פואטיקה</span><textarea id="ipo" rows="1" placeholder=" "' + (isDraft(it, "poetics") ? DRAFT : "") + '>' + esc(txt(it, "poetics")) + '</textarea></label>' +
      '<label class="rfield"><span>הנחיה</span><textarea id="igu" rows="1" placeholder=" "' + (isDraft(it, "guidance") ? DRAFT : "") + '>' + esc(txt(it, "guidance")) + '</textarea></label>' +
      '<label class="rfield"><span>הערות</span><textarea id="it" rows="1" placeholder=" ">' + esc(it.notes || "") + '</textarea></label>' +
      '<div style="display:flex;gap:var(--gap-button)"><button class="rbtn rbtn--ghost rbtn--block" style="flex:1 1 0" data-act="swap">החלפה בתרגיל אחר</button><button class="rbtn rbtn--ghost rbtn--danger rbtn--block" style="flex:1 1 0" data-act="del">הסרה מהוויוונסיה</button></div></div></div>', function (r) {
      on(r, "list", function () { if (!wide()) back(); });   /* beside the list there is nowhere to go back to */
      wireFac(r);
      function walk(to) { if (wide()) return itemScreen(to); stack().pop(); go(function () { itemScreen(to); }); }
      on(r, "prevW", function () { if (prevIt) walk(prevIt); });
      on(r, "nextW", function () { if (nextIt) walk(nextIt); });
      function toMusic() { if (wide()) musicScreen(it); else go(function () { musicScreen(it); }); }
      on(r, "pickMusic", function (b, ev) { if (ev.target.closest("a,[data-audio]")) return; toMusic(); });
      r.querySelectorAll('[data-act="pickMusic"]').forEach(function (c) { c.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toMusic(); } }); });
      ["#ipo", "#igu", "#it"].forEach(function (s) { var t = r.querySelector(s); grow(t); t.addEventListener("input", function () { grow(t); }); });
      function own(k, v) { return v === baseTxt(it, k) ? null : v; }   /* the same as the catalog: keep inheriting it */
      function save() {
        var nm = r.querySelector("#ina").value.trim();
        var body = { title: !nm || nm === name(e) ? null : nm, poetics: own("poetics", r.querySelector("#ipo").value), guidance: own("guidance", r.querySelector("#igu").value), notes: r.querySelector("#it").value };
        api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: body }).then(function () {
          Object.assign(it, body);
          toast("נשמר");
          if (wide()) paint();
        }, fail);
      }
      ["#ina", "#ipo", "#igu", "#it"].forEach(function (s) { r.querySelector(s).addEventListener("change", save); });
      on(r, "del", function () { confirmRemoveItem(it); });
      on(r, "swap", function () { go(function () { picker(it); }); });   /* the catalog, to put another exercise in this place */
    }, "d");
  }

  /* ---------- the songs of an exercise: two lines each, the song and who plays it ---------- */
  function musicScreen(it) {
    var out = wide() ? function () { itemScreen(it); } : back;   /* beside the list, back is the same exercise */
    show(head("מוזיקה", "", true) + '<div class="rlist" id="mlist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", out);
      api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,title,artist,duration_sec,audio_object,in_catalog)").then(function (rows) {
        var seen = {}, list = [];
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; list.push(x.music); } });
        var row = function (id, t, sub, cur, m) { return '<div class="rrow rrow--link"' + (cur ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-m="' + id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(t) + '</span>' + (sub ? '<span class="rrow__sub">' + esc(sub) + '</span>' : '') + '</button>' + (m ? songBtn(m, true) : '') + '</div>'; };
        var l = r.querySelector("#mlist");
        l.innerHTML = row("", "בלי מוזיקה", "", !it.music_id) + list.map(function (m) { return row(m.id, songName(m), songBy(m), it.music_id === m.id, m); }).join("") +
          '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-act="other" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">מוזיקות אחרות</span><span class="rrow__sub">שירים שאינם בקטלוג</span></button></div>';
        on(l, "other", function () { otherMusic(it, out); });
        l.querySelectorAll("[data-m]").forEach(function (b) {
          b.addEventListener("click", function () {
            var m = list.filter(function (x) { return x.id === b.dataset.m; })[0] || null;
            api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m ? m.id : null } }).then(function () { it.music_id = m ? m.id : null; it.music = m; if (wide()) paint(); out(); }, fail);
          });
        });
      }, fail);
    }, "d");
  }

  /* ---------- other music: files the catalogs do not list. Same rows as the songs, with a tag ---------- */
  function otherMusic(it, out) {
    show(head("מוזיקות אחרות", "", true) + '<div class="pad" style="padding-block-end:0"><label class="rfield"><span>חיפוש</span><input id="oq" placeholder=" " autocomplete="off"></label></div><div class="rlist" id="olist"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", function () { musicScreen(it); });
      api("/rest/v1/music?in_catalog=eq.false&select=id,name,title,artist,duration_sec,audio_object,in_catalog&order=title&limit=1000").then(function (rows) {
        var all = rows || [], l = r.querySelector("#olist");
        function draw() {
          var q = r.querySelector("#oq").value.trim().toLowerCase();
          var vis = all.filter(function (m) { return !q || (songName(m) + " " + songBy(m)).toLowerCase().indexOf(q) >= 0; });
          l.innerHTML = vis.length ? vis.map(function (m) {
            return '<div class="rrow rrow--link"' + (it.music_id === m.id ? ' aria-current="true"' : '') + '><button type="button" class="rrow__main" data-o="' + m.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(songName(m)) + '</span><span class="rrow__sub">' + (songBy(m) ? esc(songBy(m)) + ' ' : '') + '<span class="rchip rchip--s">לא בקטלוג</span></span></button>' + songBtn(m, true) + '</div>';
          }).join("") : ph("לא נמצא", "");
          l.querySelectorAll("[data-o]").forEach(function (b) {
            b.addEventListener("click", function () {
              var m = all.filter(function (x) { return x.id === b.dataset.o; })[0];
              api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: { music_id: m.id } }).then(function () { it.music_id = m.id; it.music = m; if (wide()) paint(); out(); }, fail);
            });
          });
        }
        r.querySelector("#oq").addEventListener("input", draw);
        draw();
      }, fail);
    }, "d");
  }

  /* ---------- picker: the catalog ---------- */
  function picker(swapIt) {
    show(head(swapIt ? "החלפת תרגיל" : "קטלוג התרגילים", "", true) +
      '<div class="pad"><div style="display:flex;gap:var(--gap-button);align-items:flex-end"><label class="rfield" style="flex:1 1 0;min-width:0;margin:0"><span>חיפוש</span><input id="q" placeholder=" "></label>' +
      '<label class="rfield" style="flex:1 1 0;min-width:0;margin:0"><span>קו</span><select id="ln"><option value="">הכול</option>' + state.lines.map(function (l) { return '<option value="' + l.key + '">' + esc(l.name_he) + '</option>'; }).join("") + '</select></label></div>' +
      '<label class="rfield"><span>קטגוריה</span><input id="cg" placeholder=" " autocomplete="off" role="combobox" aria-expanded="false" aria-haspopup="listbox" value="הכול"></label></div>' +
      '<div class="rlist" id="list"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", !wide() ? back : swapIt ? function () { pending = { item: swapIt.id }; back(); }   /* leaving a replacement: the same exercise is open again on the left */
        : function () { show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); back(); });
      var catSel = "";   /* the key of the chosen category, "" = all */
      /* a field you can type in that also opens its options when you click it: the options are the kit's menu, placed under the field */
      function wireCat() {
        var inp = r.querySelector("#cg"), pop = null, active = -1, shown = [];
        function label() { return catSel ? catName(catSel) : "הכול"; }
        function close(revert) { if (pop) { pop.remove(); pop = null; } inp.setAttribute("aria-expanded", "false"); if (revert) inp.value = label(); }
        function choose(k) { catSel = k; close(true); paintCat(); }
        function open(filter) {
          close(false);
          var f = (filter || "").trim();
          shown = [{ key: "", name_he: "הכול" }].concat((state.cats || []).filter(function (c) { return !f || c.name_he.indexOf(f) >= 0; }));
          if (!shown.length) return;
          active = -1;
          pop = document.createElement("div"); pop.className = "rmenu rmenu--fixed"; pop.setAttribute("role", "listbox");
          pop.innerHTML = shown.map(function (c, k) { return '<button type="button" class="rmenu__item" role="option" tabindex="-1" data-k="' + k + '"' + (c.key === catSel ? ' aria-selected="true" style="font-weight:var(--fw-bold)"' : '') + '><span>' + esc(c.name_he) + '</span></button>'; }).join("");
          document.body.appendChild(pop);
          var b = inp.getBoundingClientRect();
          pop.style.top = Math.round(b.bottom + 2) + "px"; pop.style.left = Math.round(b.left) + "px"; pop.style.width = Math.round(b.width) + "px"; pop.style.maxHeight = "40vh"; pop.style.overflowY = "auto";
          pop.querySelectorAll("[data-k]").forEach(function (o) { o.addEventListener("mousedown", function (e) { e.preventDefault(); choose(shown[+o.dataset.k].key); }); });
          inp.setAttribute("aria-expanded", "true");
        }
        function mark(n) { if (!pop) return; var all = pop.querySelectorAll("[data-k]"); active = Math.max(0, Math.min(n, all.length - 1)); all.forEach(function (o, k) { o.style.background = k === active ? "var(--surface)" : ""; }); if (all[active]) all[active].scrollIntoView({ block: "nearest" }); }
        inp.addEventListener("focus", function () { inp.select(); open(""); });
        inp.addEventListener("click", function () { if (!pop) { inp.select(); open(""); } });
        inp.addEventListener("input", function () { open(inp.value); });
        inp.addEventListener("blur", function () { setTimeout(function () { close(true); }, 0); });
        inp.addEventListener("keydown", function (e) {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!pop) open(""); mark(active + 1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); mark(active - 1); }
          else if (e.key === "Enter") { e.preventDefault(); if (pop && shown.length) choose(shown[active >= 0 ? active : (shown.length > 1 ? 1 : 0)].key); }
          else if (e.key === "Escape") { close(true); inp.blur(); }
        });
      }
      function paintCat() {
        var q = r.querySelector("#q").value.trim().toLowerCase(), ln = r.querySelector("#ln").value, cg = catSel, l = r.querySelector("#list");
        var rows = (state.cat || []).filter(function (e) {
          return (!cg || e.category === cg) && (!ln || (e.exercise_lines || []).some(function (x) { return x.line_key === ln; })) && (!q || (name(e) + " " + e.title_en + " " + e.category).toLowerCase().indexOf(q) >= 0);
        });
        l.innerHTML = rows.length ? rows.map(function (e) {
          return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-ex="' + e.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(name(e)) + '</span><span class="rrow__sub">' + esc([catName(e.category)].concat((e.exercise_lines || []).map(function (x) { return lineName(x.line_key); })).filter(Boolean).join(" · ")) + '</span></button></div>';
        }).join("") : ph("לא נמצא תרגיל", "");
        l.querySelectorAll("[data-ex]").forEach(function (b) { b.addEventListener("click", function () {
          var ex = state.cat.filter(function (x) { return x.id === b.dataset.ex; })[0];
          if (wide()) {   /* adding or replacing: the exercise is shown on the left first, and the action is its own button */
            l.querySelectorAll(".rrow").forEach(function (w) { w.removeAttribute("aria-current"); });
            b.closest(".rrow").setAttribute("aria-current", "true");
            previewEx(ex, swapIt);
          } else addEx(ex, swapIt);
        }); });
      }
      r.querySelector("#q").addEventListener("input", paintCat); r.querySelector("#ln").addEventListener("change", paintCat); wireCat();
      (state.cats ? Promise.resolve() : api("/rest/v1/categories?select=key,name_he&order=sort").then(function (c) {
        state.cats = c || [];
      })).then(function () { return state.cat ? null : loadCatalog().then(function (c) { state.cat = c; }); }).then(paintCat, fail);
    });
  }
  /* the catalog is over a thousand exercises and the server hands out at most a thousand rows at a time: read it page by page */
  function loadCatalog() {
    var all = [], PAGE = 1000;
    function page(off) {
      return api("/rest/v1/exercises?select=id,title_he,title_en,category,phase_hint,exercise_lines(line_key)&order=title_en,id&limit=" + PAGE + "&offset=" + off).then(function (rows) {
        rows = rows || []; all = all.concat(rows);
        return rows.length === PAGE ? page(off + PAGE) : all;
      });
    }
    return page(0);
  }
  /* a catalog exercise shown on the left while one is being added or replaced: its own words, and one button that does it */
  var previewTok = 0;
  function previewEx(e, swapIt) {
    var tok = ++previewTok;
    api("/rest/v1/exercise_texts?exercise_id=eq." + e.id + "&select=lang,poetics,guidance,source").then(function (rows) {
      if (tok !== previewTok) return;   /* a later row was chosen meanwhile */
      var fake = { exercises: { exercise_texts: rows || [] } };
      var card = function (k, label) { return txt(fake, k) ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">' + label + '</span></div><div class="rcard__body"' + (isDraft(fake, k) ? DRAFT : "") + '>' + esc(txt(fake, k)) + '</div></div>' : ""; };
      var body = card("poetics", "פואטיקה") + card("guidance", "הנחיה");
      var act = '<button class="rbtn" type="button" style="margin-inline-end:var(--sp-2)" data-act="doswap">' + (swapIt ? "החלפה בתרגיל הזה" : "הוספה") + '</button>';   /* the action is in the header, on the left */
      show(head(name(e), "", false, act) + '<div class="rlist"><div class="pad">' + (body || ph("אין עדיין תיאור לתרגיל", "")) + '</div></div>', function (r) { on(r, "doswap", function () { addEx(e, swapIt); }); }, "d");
    }, fail);
  }
  function addEx(e, swapIt) {
    if (swapIt) {   /* the same place in the curve, another exercise: its first song, and none of the old exercise's own wording */
      return api("/rest/v1/exercise_music?exercise_id=eq." + e.id + "&select=music_id&limit=1").then(function (m) {
        return api("/rest/v1/vivencia_items?id=eq." + swapIt.id, { method: "PATCH", prefer: "return=minimal", json: { exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null, title: null, poetics: null, guidance: null } });
      }).then(function () { toast("התרגיל הוחלף"); pending = { item: swapIt.id };   /* back to the list, which then opens this same place again with the new exercise */
        stack().pop(); if (!wide()) stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); }, fail);
    }
    var pos = state.items.reduce(function (m, i) { return Math.max(m, i.position); }, 0) + 1;
    api("/rest/v1/exercise_music?exercise_id=eq." + e.id + "&select=music_id&limit=1").then(function (m) {
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null } });
    }).then(function () { toast("התרגיל נוסף"); if (wide()) show(ph("בחרו תרגיל", "פרטי התרגיל יופיעו כאן"), null, "d"); back(); }, fail);
  }

  /* ---------- player: the session, one exercise at a time ---------- */
  function player(k) {
    var it = state.items[k], e = it.exercises || {}, last = k === state.items.length - 1;
    show(head(itemName(it), "", true) +
      '<div class="rlist"><div class="pad">' +
      '<span class="rchip rchip--s">' + (k + 1) + ' מתוך ' + state.items.length + '</span>' +
      (it.music ? '<span class="rchip rchip--info rchip--l">' + esc(it.music.name) + '</span>' : '') +
      (txt(it, "poetics") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">פואטיקה</span></div><div class="rcard__body"' + (isDraft(it, "poetics") ? DRAFT : "") + '>' + esc(txt(it, "poetics")) + '</div></div>' : '') +
      (txt(it, "guidance") ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">הנחיה</span></div><div class="rcard__body"' + (isDraft(it, "guidance") ? DRAFT : "") + '>' + esc(txt(it, "guidance")) + '</div></div>' : '') +
      (it.notes ? '<div class="rhint"><span class="rhint__tx">' + esc(it.notes) + '</span></div>' : '') +
      '</div></div><div class="bar">' + (last ? '' : '<button class="rbtn rbtn--block" data-act="next">התרגיל הבא</button>') + (k ? '<button class="rbtn rbtn--ghost rbtn--block" data-act="prev">התרגיל הקודם</button>' : '') + '</div>', function (r) {
      on(r, "back", back);
      on(r, "next", function () { stack().push(function () { player(k + 1); }); player(k + 1); });
      on(r, "prev", function () { stack().push(function () { player(k - 1); }); player(k - 1); });
    }, "d");
  }

  /* ---------- allowlist (admin only): the kit's popup, from the left on a computer ---------- */
  function allowPopup() {
    var dlg = document.getElementById("allowDlg");
    if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "allowDlg"; document.body.appendChild(dlg); }
    var rows = [];
    RosterSheet.render(dlg, {
      title: "מי מורשה להיכנס", from: "bottom",
      body: '<div class="pad">' +
        '<label class="rfield"><span>חיפוש</span><input id="aq" type="search" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield rfield--ltr"><span>אימייל של חשבון גוגל</span><input id="em" type="email" placeholder=" " autocomplete="off"></label>' +
        '<label class="rfield"><span>שם (לא חובה)</span><input id="en" placeholder=" " autocomplete="off"></label>' +
        '<button class="rbtn" id="addm" type="button">הוספה</button></div><div id="alist"></div>'
    });
    function paintA() {
      var q = dlg.querySelector("#aq").value.trim().toLowerCase(), l = dlg.querySelector("#alist");
      var vis = rows.filter(function (a) { return !q || (a.email + " " + (a.note || "")).toLowerCase().indexOf(q) >= 0; });
      l.innerHTML = vis.length ? vis.map(function (a) {
        return '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title" dir="ltr">' + esc(a.email) + '</span>' + (a.is_admin ? '<span class="rchip rchip--info rchip--s">מנהל</span>' : '') + '</div>' +
          '<label class="rfield"><span>שם</span><input data-note="' + esc(a.email) + '" placeholder=" " value="' + esc(a.note || "") + '"></label>' +
          (a.is_admin ? '' : '<div class="rcard__foot"><button class="rbtn rbtn--sm rbtn--ghost rbtn--danger" type="button" data-rm="' + esc(a.email) + '">הסרה</button></div>') + '</div>';
      }).join("") : '<div class="rempty"><b>' + (rows.length ? "לא נמצא" : "הרשימה ריקה") + '</b></div>';
      l.querySelectorAll("[data-rm]").forEach(function (b) { b.addEventListener("click", function () { api("/rest/v1/allowed?email=eq." + encodeURIComponent(b.dataset.rm), { method: "DELETE" }).then(load, fail); }); });
      l.querySelectorAll("[data-note]").forEach(function (i) {
        i.addEventListener("change", function () {
          api("/rest/v1/allowed?email=eq." + encodeURIComponent(i.dataset.note), { method: "PATCH", json: { note: i.value.trim() } }).then(function () { rows.forEach(function (a) { if (a.email === i.dataset.note) a.note = i.value.trim(); }); toast("נשמר"); }, fail);
        });
      });
    }
    function load() { return api("/rest/v1/allowed?select=email,is_admin,note&order=added_at").then(function (r) { rows = r || []; paintA(); }, fail); }
    dlg.querySelector("#aq").addEventListener("input", paintA);
    dlg.querySelector("#addm").addEventListener("click", function () {
      var em = dlg.querySelector("#em").value.trim().toLowerCase(), nm = dlg.querySelector("#en").value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return toast("אימייל לא תקין");
      api("/rest/v1/allowed", { method: "POST", prefer: "return=minimal", json: { email: em, note: nm } }).then(function () { dlg.querySelector("#em").value = ""; dlg.querySelector("#en").value = ""; return load(); }, fail);
    });
    load();
  }

  /* ---------- start ---------- */
  function start() {
    if (!FLOA_AUTH.signedIn()) return gate("כניסה למאפשרי ביודנסה", false);
    show('<div class="rlist"><div class="rskel rskel--title"></div></div>');
    api("/rest/v1/rpc/me", { method: "POST", json: {} }).then(function (me) {
      state.me = me;
      if (!me || !me.allowed) return gate("לחשבון " + FLOA_AUTH.email() + " אין הרשאה להיכנס. אפשר לבקש מהמנהל להוסיף אותו.", true);
      return Promise.all([api("/rest/v1/lines?select=key,name_he&order=sort"), api("/rest/v1/phases?select=key,name_he&order=sort")]).then(function (r) { state.lines = r[0]; state.phases = r[1]; home(); });
    }).catch(function (e) { console.error(e); gate("לא הצלחנו להתחבר. נסו שוב.", false); });
  }
  /* wide screen: drag the line between the list and the vivencia to change the width (arrows on the keyboard, double click resets); kept in this browser */
  (function () {
    var KEY = "biodanza_listw", h = document.getElementById("sh"), root = document.documentElement;
    function clampW(w) { return Math.round(Math.max(320, Math.min(w, window.innerWidth - 420))); }
    function curW() { return pl.getBoundingClientRect().width; }
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
  /* back and forward: show what the address says, without writing it again */
  window.addEventListener("popstate", function () {
    if (!state.me) return;
    var u = parseUrl(); popping = true;
    try {
      stack().length = 0;
      if (!u.viv) { if (wide()) homeWide(); else home(); }
      else { if (!wide()) stack().push(home); pending = u.item ? { item: u.item } : null; openViv(u.viv); }
    } finally { popping = false; }
  });
  pending = parseUrl().viv ? parseUrl() : null;
  start();
})();
