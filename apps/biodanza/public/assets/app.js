/* Biodanza: a facilitator builds a vivencia, plans it along the curve, plays it in the session.
   Built ONLY from the kit's elements (/kit.css): rhead, rlist, rrow, rcard, rbtn, rchip, rfield, rempty, rmsg, rfab.
   Data: schema `biodanza` (apps/biodanza/schema.sql), through FLOA_AUTH.api. Row level security decides who sees what. */
(function () {
  "use strict";
  var pl = document.getElementById("pl"), pd = document.getElementById("pd");
  function wide() { return window.matchMedia("(min-width: 1024px)").matches; }
  var api = function (p, o) { return FLOA_AUTH.api(p, o); };
  var state = { me: null, lines: [], phases: [], cat: null, vivs: [], viv: null, items: [], filter: "" };

  var I = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5M16 5a3 3 0 010 6M18 15c2 .6 3 2.2 3 5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 5H5v14h5M15 8l4 4-4 4M19 12H9"/></svg>'
  };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function name(e) { return e.title_he || e.title_en || ""; }
  function phaseName(k) { var p = state.phases.filter(function (x) { return x.key === k; })[0]; return p ? p.name_he : ""; }
  function lineName(k) { var l = state.lines.filter(function (x) { return x.key === k; })[0]; return l ? l.name_he : k; }
  function uuid() { return crypto.randomUUID(); }
  function head(title, sub, back, trail) {
    return '<header class="rhead">' + (back ? '<button class="rbtn rbtn--icon rbtn--edge-start" data-act="back" aria-label="חזרה" title="חזרה">' + I.back + '</button>' : '') +
      '<div class="rhead__text"><h1 class="rhead__title">' + esc(title) + '</h1>' + (sub ? '<span class="rhead__sub">' + esc(sub) + '</span>' : '') + '</div>' + (trail || '') + '</header>';
  }
  function toast(msg) {
    var t = document.createElement("div");
    t.className = "rmsg rmsg--toast"; t.setAttribute("role", "status"); t.innerHTML = '<span class="rmsg__text">' + esc(msg) + '</span>';
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2400);
  }
  function fail(e) { console.error(e); toast("משהו השתבש, נסו שוב"); }
  /* pane "d" is the detail pane (the vivencia), on a wide screen beside the list; on a narrow one every screen takes the single pane. */
  function show(html, wire, pane) { var t = wide() && pane === "d" ? pd : pl; t.innerHTML = html; if (wire) wire(t); }
  function emptyDetail() {
    if (wide()) show('<div class="rempty" style="margin-block:auto"><span>בחרו ויוונסיה מהרשימה כדי לראות את התרגילים שלה</span></div>', null, "d");
    state.viv = null; paintSel();
  }
  function paintSel() { pl.querySelectorAll("[data-id]").forEach(function (b) { b.closest(".rrow").setAttribute("aria-current", state.viv && b.dataset.id === state.viv.id ? "true" : "false"); }); }
  function on(root, act, fn) { root.querySelectorAll('[data-act="' + act + '"]').forEach(function (b) { b.addEventListener("click", function (ev) { fn(b, ev); }); }); }
  function stack() { return stack.s || (stack.s = []); }
  function go(fn) { stack().push(fn); fn(); }
  function back() { stack().pop(); var f = stack()[stack().length - 1]; if (f) f(); else if (wide()) emptyDetail(); else home(); }

  /* ---------- gate ---------- */
  function gate(msg, signedIn) {
    show('<div class="rempty" style="margin-block:auto"><b>ביודנסה</b><span>' + esc(msg) + '</span>' +
      (signedIn ? '<button class="rbtn rbtn--ghost" data-act="out">יציאה</button>' : '<button class="rbtn" data-act="in">כניסה עם גוגל</button>') + '</div>', function (r) {
      on(r, "in", function () { FLOA_AUTH.signIn(location.origin + location.pathname); });
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
    });
  }

  /* ---------- home: my vivencias ---------- */
  function home() {
    if (!wide()) { stack().length = 0; stack().push(home); }
    show(head("הוויוונסיות שלי", FLOA_AUTH.email(), false,
      (state.me.admin ? '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="allow" aria-label="מורשים" title="מורשים">' + I.users + '</button>' : '') +
      '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="out" aria-label="יציאה" title="יציאה">' + I.out + '</button>') +
      '<div class="rlist" data-fab-room id="hl"><div class="rskel rskel--title"></div></div>' +
      '<button class="rfab" data-act="new" aria-label="ויוונסיה חדשה" title="ויוונסיה חדשה">' + I.plus + '</button>', function (r) {
      on(r, "out", function () { Promise.resolve(FLOA_AUTH.signOut()).then(function () { location.reload(); }); });
      on(r, "allow", allowPopup);
      on(r, "new", newViv);
    });
    api("/rest/v1/vivencias?select=id,title,theme,updated_at,vivencia_items(count)&order=updated_at.desc").then(function (rows) {
      state.vivs = rows || [];
      var l = document.getElementById("hl"); if (!l) return;
      l.innerHTML = state.vivs.length ? state.vivs.map(function (v) {
        var n = v.vivencia_items && v.vivencia_items[0] ? v.vivencia_items[0].count : 0;
        return '<div class="rrow rrow--link"><button type="button" class="rrow__main" data-id="' + v.id + '" style="background:none;border:0;padding:0;text-align:start;cursor:pointer;font:inherit;color:inherit"><span class="rrow__title">' + esc(v.title || "ויוונסיה ללא שם") + '</span><span class="rrow__sub">' + n + ' תרגילים' + (v.theme ? ' · ' + esc(v.theme) : '') + '</span></button></div>';
      }).join("") : '<div class="rempty"><b>עוד אין ויוונסיות</b><span>לחצו על + כדי ליצור את הראשונה</span></div>';
      l.querySelectorAll("[data-id]").forEach(function (b) { b.addEventListener("click", function () { openViv(b.dataset.id); }); });
      paintSel();
      if (wide() && !state.viv) emptyDetail();
    }, fail);
  }
  function newViv() {
    var id = uuid();
    api("/rest/v1/vivencias", { method: "POST", json: { id: id, title: "" }, prefer: "return=minimal" }).then(function () { openViv(id); }, fail);
  }

  /* ---------- the vivencia: plan along the curve ---------- */
  function openViv(id) { state.filter = ""; state.viv = state.vivs.filter(function (v) { return v.id === id; })[0] || { id: id, title: "" }; if (wide()) stack().length = 0; go(editor); paintSel(); }
  function loadItems() {
    return api("/rest/v1/vivencia_items?vivencia_id=eq." + state.viv.id + "&select=id,position,exercise_id,music_id,minutes,notes,exercises(title_he,title_en,poetics,guidance,objective),music(name)&order=position").then(function (r) { state.items = r || []; });
  }
  function editor() {
    var v = state.viv;
    show(head(v.title || "ויוונסיה חדשה", "", true, '<button class="rbtn rbtn--icon rbtn--edge-end" data-act="del" aria-label="מחיקת הוויוונסיה" title="מחיקת הוויוונסיה">' + I.trash + '</button><button class="rbtn rbtn--icon rbtn--edge-end" data-act="play" aria-label="הפעלה" title="הפעלה">' + I.play + '</button>') +
      '<div class="pad"><label class="rfield"><span>שם הוויוונסיה</span><input id="vt" placeholder=" " value="' + esc(v.title) + '"></label>' +
      '<label class="rfield"><span>נושא</span><input id="vh" placeholder=" " value="' + esc(v.theme || "") + '"></label></div>' +
      '<div class="rlist" data-fab-room id="list"><div class="rskel rskel--title"></div></div>' +
      '<button class="rfab" data-act="add" aria-label="הוספת תרגיל" title="הוספת תרגיל">' + I.plus + '</button>', function (r) {
      on(r, "back", back); on(r, "add", function () { go(picker); });
      on(r, "del", function () { confirmDelete(v); });
      on(r, "play", function () { if (!state.items.length) return toast("אין עדיין תרגילים"); go(function () { player(0); }); });
      function save() { var t = r.querySelector("#vt").value, h = r.querySelector("#vh").value; v.title = t; v.theme = h; api("/rest/v1/vivencias?id=eq." + v.id, { method: "PATCH", json: { title: t, theme: h, updated_at: new Date().toISOString() } }).catch(fail); }
      r.querySelector("#vt").addEventListener("change", save); r.querySelector("#vh").addEventListener("change", save);
    }, "d");
    loadItems().then(paint, fail);
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
        if (wide()) { emptyDetail(); }
        home();
      }, fail);
    });
  }
  function paint() {
    var l = document.getElementById("list"); if (!l) return;
    var vis = state.items;   /* the order of the list IS the curve: no phase is kept on an item */
    if (!vis.length) { l.innerHTML = '<div class="rempty"><b>הוויוונסיה ריקה</b><span>לחצו על + כדי להוסיף תרגיל מהקטלוג</span></div>'; return; }
    l.innerHTML = vis.map(function (i, k) {
      var e = i.exercises || {};
      return '<div class="rrow"><div class="rrow__main"><button class="rrow__title" data-edit="' + i.id + '" style="all:unset;cursor:pointer">' + esc(name(e)) + '</button><span class="rrow__sub">' + esc([i.music && i.music.name, i.minutes ? i.minutes + " דק׳" : ""].filter(Boolean).join(" · ") || "בלי מוזיקה") + '</span></div>' +
        '<button class="rbtn rbtn--icon" data-up="' + k + '" aria-label="הזזה למעלה" title="הזזה למעלה"' + (k === 0 ? " disabled" : "") + '>' + I.up + '</button>' +
        '<button class="rbtn rbtn--icon" data-down="' + k + '" aria-label="הזזה למטה" title="הזזה למטה"' + (k === vis.length - 1 ? " disabled" : "") + '>' + I.down + '</button></div>';
    }).join("");
    l.querySelectorAll("[data-edit]").forEach(function (b) { b.addEventListener("click", function () { var it = state.items.filter(function (x) { return x.id === b.dataset.edit; })[0]; go(function () { itemScreen(it); }); }); });
    function swap(a, b) {
      var pa = a.position, pb = b.position;
      Promise.all([api("/rest/v1/vivencia_items?id=eq." + a.id, { method: "PATCH", json: { position: pb } }), api("/rest/v1/vivencia_items?id=eq." + b.id, { method: "PATCH", json: { position: pa } })]).then(loadItems).then(paint, fail);
    }
    l.querySelectorAll("[data-up]").forEach(function (b) { b.addEventListener("click", function () { var k = +b.dataset.up; swap(vis[k], vis[k - 1]); }); });
    l.querySelectorAll("[data-down]").forEach(function (b) { b.addEventListener("click", function () { var k = +b.dataset.down; swap(vis[k], vis[k + 1]); }); });
  }

  /* ---------- one item: phase, music, minutes, notes ---------- */
  function itemScreen(it) {
    var e = it.exercises || {};
    show(head(name(e), "פריט בוויוונסיה", true) + '<div class="rlist"><div class="pad">' +
      '<label class="rfield"><span>מוזיקה</span><select id="im"><option value="">בלי מוזיקה</option></select></label>' +
      '<label class="rfield"><span>משך בדקות</span><input id="in" type="number" min="1" placeholder=" " value="' + (it.minutes || "") + '"></label>' +
      '<label class="rfield"><span>הערות</span><textarea id="it" placeholder=" ">' + esc(it.notes || "") + '</textarea></label>' +
      (e.poetics ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">פואטיקה</span></div><div class="rcard__body">' + esc(e.poetics) + '</div></div>' : '') +
      (e.guidance ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">הנחיה</span></div><div class="rcard__body">' + esc(e.guidance) + '</div></div>' : '') +
      '<button class="rbtn rbtn--ghost rbtn--danger rbtn--block" data-act="del">הסרה מהוויוונסיה</button></div></div>', function (r) {
      on(r, "back", back);
      api("/rest/v1/exercise_music?exercise_id=eq." + it.exercise_id + "&select=music(id,name,collection)").then(function (rows) {
        var sel = r.querySelector("#im"), seen = {};
        (rows || []).forEach(function (x) { if (x.music && !seen[x.music.id]) { seen[x.music.id] = 1; var o = document.createElement("option"); o.value = x.music.id; o.textContent = x.music.name + (x.music.collection ? " (" + x.music.collection + ")" : ""); sel.appendChild(o); } });
        sel.value = it.music_id || "";
      }, fail);
      function save() {
        var body = { music_id: r.querySelector("#im").value || null, minutes: +r.querySelector("#in").value || null, notes: r.querySelector("#it").value };
        api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "PATCH", json: body }).then(function () { Object.assign(it, body); toast("נשמר"); }, fail);
      }
      ["#im", "#in", "#it"].forEach(function (s) { r.querySelector(s).addEventListener("change", save); });
      on(r, "del", function () { api("/rest/v1/vivencia_items?id=eq." + it.id, { method: "DELETE" }).then(function () { back(); }, fail); });
    }, "d");
  }

  /* ---------- picker: the catalog ---------- */
  function picker() {
    show(head("קטלוג התרגילים", "בחרו תרגיל להוספה", true) +
      '<div class="pad"><label class="rfield"><span>חיפוש</span><input id="q" placeholder=" "></label>' +
      '<label class="rfield"><span>קו</span><select id="ln"><option value="">הכול</option>' + state.lines.map(function (l) { return '<option value="' + l.key + '">' + esc(l.name_he) + '</option>'; }).join("") + '</select></label></div>' +
      '<div class="rlist" id="list"><div class="rskel rskel--title"></div></div>', function (r) {
      on(r, "back", back);
      function paintCat() {
        var q = r.querySelector("#q").value.trim().toLowerCase(), ln = r.querySelector("#ln").value, l = r.querySelector("#list");
        var rows = (state.cat || []).filter(function (e) {
          return (!ln || (e.exercise_lines || []).some(function (x) { return x.line_key === ln; })) && (!q || (name(e) + " " + e.title_en + " " + e.category).toLowerCase().indexOf(q) >= 0);
        }).slice(0, 120);
        l.innerHTML = rows.length ? rows.map(function (e) {
          return '<div class="rrow"><div class="rrow__main"><button class="rrow__title" data-ex="' + e.id + '" style="all:unset;cursor:pointer">' + esc(name(e)) + '</button><span class="rrow__sub">' + esc([e.category, e.phase_hint ? "בקטלוג: " + phaseName(e.phase_hint) : "", (e.exercise_lines || []).map(function (x) { return lineName(x.line_key); }).join(", ")].filter(Boolean).join(" · ")) + '</span></div></div>';
        }).join("") : '<div class="rempty"><b>לא נמצא תרגיל</b></div>';
        l.querySelectorAll("[data-ex]").forEach(function (b) { b.addEventListener("click", function () { addEx(state.cat.filter(function (x) { return x.id === b.dataset.ex; })[0]); }); });
      }
      r.querySelector("#q").addEventListener("input", paintCat); r.querySelector("#ln").addEventListener("change", paintCat);
      (state.cat ? Promise.resolve() : api("/rest/v1/exercises?select=id,title_he,title_en,category,phase_hint,exercise_lines(line_key)&order=title_en&limit=1000").then(function (c) { state.cat = c || []; })).then(paintCat, fail);
    }, "d");
  }
  function addEx(e) {
    var pos = state.items.reduce(function (m, i) { return Math.max(m, i.position); }, 0) + 1;
    api("/rest/v1/exercise_music?exercise_id=eq." + e.id + "&select=music_id&limit=1").then(function (m) {
      return api("/rest/v1/vivencia_items", { method: "POST", prefer: "return=minimal", json: { vivencia_id: state.viv.id, position: pos, exercise_id: e.id, music_id: m && m[0] ? m[0].music_id : null } });
    }).then(function () { toast("התרגיל נוסף"); back(); }, fail);
  }

  /* ---------- player: the session, one exercise at a time ---------- */
  function player(k) {
    var it = state.items[k], e = it.exercises || {}, last = k === state.items.length - 1;
    show(head(name(e), (k + 1) + " מתוך " + state.items.length, true) +
      '<div class="rlist"><div class="pad">' +
      (it.music ? '<span class="rchip rchip--info rchip--l">' + esc(it.music.name) + '</span>' : '') +
      (e.poetics ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">פואטיקה</span></div><div class="rcard__body">' + esc(e.poetics) + '</div></div>' : '') +
      (e.guidance ? '<div class="rcard rcard--flat"><div class="rcard__head"><span class="rcard__title">הנחיה</span></div><div class="rcard__body">' + esc(e.guidance) + '</div></div>' : '') +
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
  start();
})();
