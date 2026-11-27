/* THE KIT'S SHOWCASE (ui/demo/, served at /kit/ on the dev server only): every component of the skill (ui/SKILL.md and ui/docs/), in every state, on one page.
   Built ONLY from the kit (Layout, the components, the tokens): no CSS of its own, no class of its own. Fake data only, no database.
   The page is a Layout surface; its body is the one list that scrolls, a list of sections (RosterList, kind "section") in the catalogue's order.
   Each section is drawn lazily (fill) and can be drawn again in English, left to right (its globe button: dir and lang on its body). */
(function () {
  "use strict";

  /* ---------- small helpers (markup of the kit only) ---------- */
  var uid = 0;
  function id(p) { return (p || "k") + (++uid); }
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sym(n, cls) { return '<svg class="rsym' + (cls ? " " + cls : "") + '" aria-hidden="true" focusable="false"><use href="/icons.svg#' + n + '"/></svg>'; }
  function ricon(n, cls, label) { return '<span class="ricon' + (cls ? " " + cls : "") + '"' + (label ? ' role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '"' : ' aria-hidden="true"') + ">" + sym(n) + "</span>"; }
  function ib(n, label, extra, cls) { return '<button type="button" class="rbtn rbtn--icon' + (cls ? " " + cls : "") + '" aria-label="' + esc(label) + '" title="' + esc(label) + '"' + (extra ? " " + extra : "") + ">" + sym(n) + "</button>"; }
  function tb(label, extra, icon) { return '<button type="button" class="rbtn rbtn--text"' + (extra ? " " + extra : "") + ">" + (icon ? ricon(icon) : "") + esc(label) + "</button>"; }
  function fb(label, extra, cls, icon) { return '<button type="button" class="rbtn' + (cls ? " " + cls : "") + '"' + (extra ? " " + extra : "") + ">" + (icon ? sym(icon) : "") + esc(label) + "</button>"; }
  function chip(label, extra, cls, tag) { tag = tag || "span"; return "<" + tag + (tag === "button" ? ' type="button"' : "") + ' class="rchip' + (cls ? " " + cls : "") + '"' + (extra ? " " + extra : "") + ">" + esc(label) + "</" + tag + ">"; }
  function col(slots, o) { o = o || {}; o.slots = slots; return RosterLayout.html(o); }
  function flow(slots, rel) { return RosterLayout.html({ dir: "row", wrap: true, rel: rel, slots: slots }); }
  /* a captioned block: a fixed section (no fold) whose title names what is shown */
  function block(title, body, sub) { return RosterSection.html({ key: id("kitdemo.b"), title: title, sub: sub, fold: false, level: 3, body: body, remember: false }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fails(ms, e) { return new Promise(function (r, j) { setTimeout(function () { j(e); }, ms); }); }
  function toast(text) {
    var m = document.createElement("div"); m.className = "rlayout rlayout--row rlayout--pad rmsg rmsg--toast"; m.setAttribute("role", "status"); m.textContent = text;
    document.body.appendChild(m); setTimeout(function () { m.remove(); }, 2600);
  }
  /* a list of rows whose title names a state and whose end shows the control in that state */
  function states(el, items) {
    return RosterList.render(el, items, { kind: "row", key: function (it) { return it.k; },
      content: function (it) { return { title: it.t, sub: it.s, trail: it.c, lead: it.l }; } });
  }
  function S(k, t, c, s, l) { return { k: k, t: t, c: c, s: s, l: l }; }

  /* ---------- the fake world: songs made here, a player that needs no network ---------- */
  function tone(freq, sec) {   /* a short WAV made in memory: a soft chord that swells, so the music's picture moves */
    var sr = 22050, n = Math.floor(sr * sec), buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), i;
    function s(o, str) { for (var k = 0; k < str.length; k++) v.setUint8(o + k, str.charCodeAt(k)); }
    s(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); s(8, "WAVE"); s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, "data"); v.setUint32(40, n * 2, true);
    for (i = 0; i < n; i++) {
      var t = i / sr, env = Math.min(1, t * 6, (sec - t) * 6) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 0.7 * t));
      var x = Math.sin(2 * Math.PI * freq * t) * 0.5 + Math.sin(2 * Math.PI * freq * 1.25 * t) * 0.3 + Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.2;
      v.setInt16(44 + i * 2, Math.round(x * env * 0.5 * 32767), true);
    }
    return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
  }
  var SONGS = [
    { id: "s1", title: "מים זורמים", en: "Flowing water", artist: "הרכב הדגמה", freq: 330, sec: 6 },
    { id: "s2", title: "בוקר שקט", en: "Quiet morning", artist: "הרכב הדגמה", freq: 392, sec: 5 },
    { id: "s3", title: "גלים", en: "Waves", artist: "הרכב הדגמה", freq: 262, sec: 7 }
  ];
  var URLS = {};
  function songUrl(n) { var s = SONGS.filter(function (x) { return x.id === n; })[0]; if (!URLS[n] && s) URLS[n] = tone(s.freq, s.sec); return URLS[n]; }
  var P = null, nowName = "", nowPlaying = false, songLists = [];
  function player() {
    if (P) return P;
    P = RosterAudio.create({ url: songUrl, store: "kitdemo-audio", key: "kitdemo.audio", events: { state: "kitaudio", fail: "kitfail", busy: "kitbusy" }, album: "ערכת הרכיבים", artwork: "data:," });
    P.setLists({ demo: SONGS.map(function (s) { return s.id; }) });
    SONGS.forEach(function (s) { P.info(s.id, s.title, s.artist); });
    return P;
  }

  /* ---------- the player bar (ui/docs/player.md): the kit draws and lays it out; here only its slots, state and content ---------- */
  var dock = null;
  function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }
  function makeDock() {
    dock = document.createElement("section"); dock.className = "rplayer raccent-2"; dock.dataset.state = "idle"; dock.setAttribute("aria-label", "נגן"); dock.setAttribute("popover", "manual");
    dock.innerHTML = '<div class="rplayer__vol">' + ib("volume", "השתקה", 'data-vmute aria-pressed="false"') + '<input class="rrange" type="range" min="0" max="100" step="1" value="80" aria-label="עוצמת שמע"></div>' +
      '<span class="rplayer__time" dir="ltr">0:00 / 0:00</span>' +
      ib("restart", "חזרה להתחלת השיר", "data-rst disabled", "rplayer__sec") +
      '<button type="button" class="ricon-lg" data-pmain aria-label="השמעה" title="השמעה">' + sym("play") + "</button>" +
      '<input class="rrange rrange--seek" type="range" min="0" max="0" value="0" step="1" aria-label="מקום במוסיקה" disabled>' +
      '<button type="button" class="rplayer__info" aria-haspopup="menu"><span class="rplayer__title" dir="auto" aria-live="polite"></span><span class="rplayer__sub" dir="auto"></span></button>' +
      '<span class="rplayer__none">לא נבחרה מוסיקה</span>' +
      ib("heart", "מוסיקה שאהבתי", 'aria-pressed="false" hidden', "rbtn--accent rbtn--fill rplayer__heart");
    document.body.appendChild(dock);
    RosterSheet.raisePlayer();
    var big = dock.querySelector("[data-pmain]"), seek = dock.querySelector(".rrange--seek"), heart = dock.querySelector(".rplayer__heart");
    big.addEventListener("click", function () {
      if (dock.dataset.state === "error" && nowName) { player().tap(nowName); return; }
      if (!nowName) { player().tap(SONGS[0].id, "demo"); return; }
      player().playPause();
    });
    dock.querySelector("[data-rst]").addEventListener("click", function () { player().seek(0); player().commitSeek(); });
    seek.addEventListener("input", function () { if (+seek.max) player().seek(seek.value / seek.max); });
    seek.addEventListener("change", function () { player().commitSeek(); });
    dock.querySelector("[data-vmute]").addEventListener("click", function (e) { var b = e.currentTarget, on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); b.innerHTML = sym(on ? "mute" : "volume"); });
    heart.addEventListener("click", function () {
      if (heart.getAttribute("aria-pressed") !== "true") { heart.setAttribute("aria-pressed", "true"); heart.setAttribute("aria-label", "הסרה מהמוסיקה שאהבתי"); return; }
      RosterSheet.confirm({ title: "הסרת סימון אהבתי", text: "השיר יוסר מהמוסיקה שאהבתי.", action: "הסרה", anchor: heart, run: function (dlg) { heart.setAttribute("aria-pressed", "false"); heart.setAttribute("aria-label", "מוסיקה שאהבתי"); dlg.close(); } });
    });
    dock.querySelector(".rplayer__info").addEventListener("click", function (e) {
      var s = SONGS.filter(function (x) { return x.id === nowName; })[0]; if (!s) return;
      RosterMenu.open(e.currentTarget, [
        { label: "הוספה לרשימה", icon: sym("plus"), fn: function () { toast("נוסף לרשימה"); } },
        { label: "מוסיקה דומה", icon: sym("music"), disabled: true },
        { label: "עריכת שם ומבצע", icon: sym("edit"), fn: function () {} }
      ], { head: RosterCard.html({ title: s.title, sub: s.artist, num: clk(s.sec), act1: ib("heart", "מוסיקה שאהבתי", 'aria-pressed="false"', "rbtn--accent rbtn--fill") }), up: true, ref: dock });
    });
    document.addEventListener("kitaudio", function (ev) {
      var d = ev.detail || {}; nowName = d.name || nowName; nowPlaying = !!d.playing;
      paintDock(d.playing ? "playing" : "paused", d);
      songLists.forEach(function (l) { if (l.el.isConnected) l.states(); });
    });
    document.addEventListener("kitbusy", function (ev) { if (ev.detail && ev.detail.on) { big.setAttribute("aria-busy", "true"); dock.dataset.state = "loading"; } else big.removeAttribute("aria-busy"); });
    document.addEventListener("kitfail", function (ev) { nowName = (ev.detail && ev.detail.name) || nowName; paintDock("error", {}); });
  }
  function paintDock(state, d) {
    if (!dock) return;
    var big = dock.querySelector("[data-pmain]"), seek = dock.querySelector(".rrange--seek"), time = dock.querySelector(".rplayer__time"), heart = dock.querySelector(".rplayer__heart");
    var s = SONGS.filter(function (x) { return x.id === nowName; })[0];
    dock.dataset.state = state;
    if (state !== "loading") big.removeAttribute("aria-busy"); else big.setAttribute("aria-busy", "true");
    big.classList.toggle("is-play", state === "playing");
    big.innerHTML = sym(state === "playing" ? "pause" : "play");
    var lab = state === "playing" ? "עצירה" : "השמעה"; big.setAttribute("aria-label", lab); big.title = lab;
    heart.hidden = state === "idle";
    dock.querySelector("[data-rst]").disabled = state === "idle";
    var t = d && d.t != null ? d.t : 0, dd = d && d.d != null ? d.d : (s ? s.sec : 0);
    time.textContent = window.matchMedia("(width < 760px)").matches ? clk(Math.max(0, dd - t)) : clk(t) + " / " + clk(dd);
    seek.disabled = !dd || state === "idle"; seek.max = String(Math.round(dd || 0)); if (window.RosterRange) RosterRange.set(seek, Math.round(t));
    var title = dock.querySelector(".rplayer__title"), sub = dock.querySelector(".rplayer__sub");
    title.textContent = s ? s.title : ""; title.title = title.textContent;
    if (state === "error") { sub.innerHTML = sym("warn"); sub.appendChild(document.createTextNode("לא הצלחנו להשמיע")); } else sub.textContent = s ? s.artist : "";
  }
  /* a list of song cards: the play button is the engine's (data-audio), the card plays while its song plays */
  function songList(el, t) {
    var L = RosterList.render(el, SONGS, { kind: "card", key: function (s) { return s.id; },
      content: function (s) { return { title: t(s.title, s.en), sub: s.artist, num: clk(s.sec), lead: ricon("music"), act1: player().button(s.id).replace("<button ", '<button data-list="demo" ') }; },
      playing: function (s) { return nowPlaying && s.id === nowName; } });
    songLists.push(L);
    return L;
  }

  /* ================= the sections, in the order of the catalogue (ui/SKILL.md "סוגי אובייקטים") ================= */
  var SECTIONS = [
    { k: "layout", he: "Layout", en: "Layout", draw: function (b, t) {
      var c = function (n) { return RosterCard.html({ title: t("כרטיס " + n, "Card " + n), sub: t("בתוך Layout", "inside Layout") }); };
      b.innerHTML = col([
        block(t("עמודה, רווח רגיל", "Column, the regular gap"), RosterLayout.html({ slots: [c(1), c(2)] })),
        block(t("שורה של יחידה, רווח צמוד, עוטפת", "Row as a unit, the tight gap, wraps"), RosterLayout.html({ dir: "row", rel: "unit", wrap: true, slots: [chip(t("אחד", "One")), chip(t("שניים", "Two")), chip(t("שלושה", "Three"))] })),
        block(t("רשת", "Grid"), RosterLayout.html({ dir: "grid", slots: [c(1), c(2), c(3), c(4)] }))
      ]);
    } },
    { k: "icon", he: "סמל", en: "Icon", draw: function (b, t) {
      var names = ["x", "check", "plus", "back", "next", "expand", "more", "search", "filter", "sort", "heart", "share", "copy", "duplicate", "edit", "delete", "swap", "play", "pause", "loop", "restart", "history", "volume", "mute", "music", "catalog", "print", "upload", "download", "lock", "globe", "user", "users", "leave", "logout", "calendar", "clock", "mail", "phone", "chat", "eye", "eye-off", "image", "warn", "help", "grip", "bold", "curve", "exercise", "yt"];
      b.innerHTML = col([block(t("כל הסמלים של הערכה", "Every icon of the set"), flow(names.map(function (n) { return ricon(n, "", n); }))), '<div data-sx></div>']);
      states(b.querySelector("[data-sx]"), [
        S("n", t("רגיל", "Normal"), ricon("heart")), S("m", t("מושתק", "Muted"), ricon("heart", "ricon--muted")),
        S("p", t("ראשי", "Primary"), ricon("heart", "ricon--primary")), S("d", t("הולך עם הכיוון", "Follows the direction"), '<span class="ricon" aria-hidden="true">' + sym("back", "rsym--dir") + "</span>")
      ]);
    } },
    { k: "button", he: "כפתור", en: "Button", draw: function (b, t) {
      b.innerHTML = col([block(t("כפתור אייקון", "Icon button"), '<div data-i></div>'), block(t("כפתור טקסט", "Text button"), '<div data-t></div>'),
        block(t("כפתור מלא", "Full button"), col([fb(t("שמירה", "Save")), fb(t("שקט", "Quiet"), "", "rbtn--ghost"), fb(t("עם סמל", "With an icon"), "", "", "plus"),
          fb(t("כבוי", "Disabled"), "disabled"), fb(t("ממתין", "Busy"), 'aria-busy="true"'), fb(t("פותח (aria-expanded)", "Expanded"), 'aria-expanded="true"'), fb(t("ברוחב מלא", "Full width"), "", "rbtn--block"),
          fb(t("לחיצה: ממתין שנייה", "Press: waits a second"), "data-busy", "rbtn--ghost")]))]);
      states(b.querySelector("[data-i]"), [
        S("n", t("רגיל", "Normal"), ib("edit", t("עריכה", "Edit"))), S("a", t("הדגשה", "Accent"), ib("plus", t("הוספה", "Add"), "", "rbtn--accent")),
        S("m", t("מושתק", "Muted"), ib("x", t("הסרה", "Remove"), "", "rbtn--muted")),
        S("p", t("דלוק (לחיצה מחליפה)", "Pressed (press toggles)"), ib("heart", t("אהבתי", "Liked"), 'aria-pressed="true" data-toggle', "rbtn--accent rbtn--fill") + ib("loop", t("לולאה", "Loop"), 'aria-pressed="false" data-toggle')),
        S("y", t("מתנגן", "Playing"), ib("pause", t("עצירה", "Stop"), "", "is-play")),
        S("e", t("פותח תפריט, פתוח", "Opens a menu, open"), ib("more", t("עוד", "More"), 'aria-haspopup="menu" aria-expanded="true"')),
        S("d", t("כבוי", "Disabled"), ib("delete", t("מחיקה", "Delete"), "disabled")), S("b", t("ממתין", "Busy"), ib("download", t("הורדה", "Download"), 'aria-busy="true"')),
        S("t", t("עם זנב", "With a tail"), '<button type="button" class="rbtn rbtn--icon" aria-label="' + t("תגובות", "Comments") + '">' + sym("chat") + '<span class="rbtn__tail">12</span></button>'),
        S("w", t("לחיצה: ממתין שנייה", "Press: waits a second"), ib("share", t("שיתוף", "Share"), "data-busy"))
      ]);
      states(b.querySelector("[data-t]"), [
        S("n", t("רגיל", "Normal"), tb(t("שינוי", "Change"))), S("i", t("עם סמל", "With an icon"), tb(t("סינון", "Filter"), "", "filter")),
        S("e", t("פותח תפריט, פתוח", "Opens a menu, open"), tb(t("מיון", "Sort"), 'aria-haspopup="menu" aria-expanded="true"')),
        S("d", t("כבוי", "Disabled"), tb(t("שינוי", "Change"), "disabled")), S("b", t("ממתין", "Busy"), tb(t("שומר", "Saving"), 'aria-busy="true"'))
      ]);
    } },
    { k: "large", he: "סמל גדול", en: "Large icon", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      var lg = function (n, label, extra, cls) { return '<button type="button" class="ricon-lg' + (cls ? " " + cls : "") + '" aria-label="' + label + '" title="' + label + '"' + (extra ? " " + extra : "") + ">" + sym(n) + "</button>"; };
      states(b.querySelector("[data-sx]"), [
        S("n", t("רגיל", "Normal"), lg("play", t("השמעה", "Play"))), S("p", t("מתנגן", "Playing"), lg("pause", t("עצירה", "Stop"), "", "is-play")),
        S("a", t("הדגשה שנייה (נגן)", "Second accent (player)"), lg("play", t("השמעה", "Play"), "", "raccent-2")),
        S("b", t("ממתין", "Busy"), lg("play", t("השמעה", "Play"), 'aria-busy="true"')), S("d", t("כבוי", "Disabled"), lg("play", t("השמעה", "Play"), "disabled"))
      ]);
    } },
    { k: "fab", he: "כפתור צף", en: "Floating button", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [S("n", t("בפינה של המסך, מעל הנגן", "In the screen's corner, above the player"), "", t("הכפתור הצף של הדף מוסיף פריט לרשימה של נתונים בזמן אמת. הוא נעלם כשחלון פתוח.", "The page's floating button adds an item to the live data list. It hides while a window is open."), ricon("plus"))]);
    } },
    { k: "chip", he: "צ'יפ", en: "Chip", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [
        S("s", t("סטטי", "Static"), chip(t("תווית", "Label"))), S("i", t("מידע", "Info"), chip(t("חדש", "New"), "", "rchip--info")), S("k", t("דיו", "Ink"), chip(t("טיוטה", "Draft"), "", "rchip--ink")),
        S("m", t("פותח תפריט", "Opens a menu"), chip(t("מנהל", "Admin"), 'aria-haspopup="menu" aria-expanded="false" data-chipmenu', "rchip--button", "button")),
        S("t", t("מסנן (לחיצה מחליפה)", "Filter (press toggles)"), flow([chip(t("פעיל", "On"), 'aria-pressed="true" data-toggle', "rchip--button", "button"), chip(t("כבוי", "Off"), 'aria-pressed="false" data-toggle', "rchip--button", "button")], "unit")),
        S("r", t("אחד מכמה", "One of many"), '<span role="radiogroup" aria-label="' + t("גודל", "Size") + '" data-radio class="rlayout rlayout--row rlayout--unit">' + [t("קטן", "S"), t("בינוני", "M"), t("גדול", "L")].map(function (x, i) { return chip(x, 'role="radio" aria-checked="' + (i === 1) + '"', "rchip--button", "button"); }).join("") + "</span>"),
        S("d", t("כבוי", "Disabled"), chip(t("לא זמין", "Unavailable"), 'disabled aria-pressed="false"', "rchip--button", "button")),
        S("b", t("ממתין", "Busy"), chip(t("שומר", "Saving"), 'aria-busy="true" aria-pressed="true"', "rchip--button", "button"))
      ]);
    } },
    { k: "divider", he: "מפריד", en: "Divider", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      var it = [{ id: 1, g: "a", n: t("ראשון", "First") }, { id: 2, g: "a", n: t("שני", "Second") }, { id: 3, g: "b", n: t("שלישי", "Third") }, { id: 4, g: "c", n: t("רביעי", "Fourth") }];
      RosterList.render(b.querySelector("[data-l]"), it, { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n }; }, group: function (x) { return x.g; },
        groups: [{ key: "a", label: t("עם שם ומונה", "With a name and a count"), count: true }, { key: "b", label: t("עם שם", "With a name") }, { key: "c", line: true }, { key: "e", label: t("קבוצה ריקה", "An empty group"), empty: t("אין כאן כלום", "Nothing here"), show: true }] });
    } },
    { k: "card", he: "כרטיס", en: "Card", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      var it = [
        { id: "n", t: t("רגיל", "Normal"), s: t("שורה שנייה", "Second row") },
        { id: "f", t: t("מלא: מוביל, מספר, צ'יפ ופעולות", "Full: lead, number, chip and actions"), s: t("שורה שנייה ארוכה שנחתכת בשלוש נקודות כשאין לה מקום", "A long second row that is cut with an ellipsis when it has no room"), num: "12:30", lead: ricon("music"), chip: chip(t("חדש", "New"), "", "rchip--info"), a1: ib("heart", t("אהבתי", "Liked"), 'aria-pressed="false" data-toggle', "rbtn--accent rbtn--fill"), a2: ib("edit", t("עריכה", "Edit")) },
        { id: "c", t: t("נוכחי", "Current"), s: t("הפריט שפתוח עכשיו", "The item open now") },
        { id: "p", t: t("מתנגן", "Playing"), s: t("צבע ההדגשה השני", "The second accent") },
        { id: "b", t: t("ממתין", "Busy"), s: t("שומר", "Saving") },
        { id: "d", t: t("כבוי", "Disabled"), s: t("לא לחיץ", "Not pressable") },
        { id: "m", t: t("עם תפריט", "With a menu"), s: t("כפתור עוד בסוף השורה", "A More button at the row's end"), menu: true },
        { id: "r", t: t("עם הסרה", "With removal"), s: t("הסרה שואלת קודם", "Removal asks first"), rm: true },
        { id: "tile", t: t("מוביל של מספר", "A number lead"), s: t("ושתי שורות", "and two rows"), num: "4:12", lead: "7", a2: ib("play", t("ניגון", "Play")) },
        { id: "L3", t: t("שורות לחיצות, 3 ועוד", "Tappable lines, 3 and more"), s: t("מבצע", "Performer"), num: "3:25", a2: ib("heart", t("אהבתי", "Liked"), 'aria-pressed="false" data-toggle', "rbtn--accent rbtn--fill") + ib("plus", t("הוספה", "Add"), "", "rbtn--muted"),
          lay: "lines", more: 3, lines: [t("פריט ראשון", "First item"), t("פריט שני", "Second item"), t("פריט שלישי עם שם ארוך מאוד שנחתך בשלוש נקודות כשאין לו מקום", "A third item with a very long name that is cut with an ellipsis"), t("פריט רביעי", "Fourth item"), t("פריט חמישי", "Fifth item"), t("פריט שישי", "Sixth item")] },
        { id: "La", t: t("שורות לחיצות, כולן", "Tappable lines, all of them"), s: t("מבצע", "Performer"), num: "5:02", a2: ib("plus", t("הוספה", "Add"), "", "rbtn--muted"),
          lay: "lines", lines: [t("פריט ראשון", "First item"), t("פריט שני", "Second item"), t("פריט שלישי", "Third item"), t("פריט רביעי", "Fourth item")] }
      ];
      if (!b.__lines) { b.__lines = 1; b.addEventListener("click", function (e) { var l = e.target.closest && e.target.closest("[data-line]"); if (l) toast(t("נפתח: ", "Opened: ") + l.textContent); }); }   /* a line is the app's: heard by delegation */
      RosterList.render(b.querySelector("[data-l]"), it, { kind: "card", key: function (x) { return x.id; },
        content: function (x) { return { title: x.t, sub: x.s, num: x.num, lead: x.lead, chip: x.chip, act1: x.a1, act2: x.a2, layout: x.lay, more: x.more, linesLabel: x.lines ? t("פריטים", "Items") : null,
          lines: x.lines ? x.lines.map(function (s, i) { return { text: s, attrs: 'data-line="' + i + '"' }; }) : null }; },
        onOpen: function (x) { toast(t("נפתח: ", "Opened: ") + x.t); }, canOpen: function (x) { return x.id !== "m" && x.id !== "r"; },
        current: function (x) { return x.id === "c"; }, playing: function (x) { return x.id === "p"; }, waiting: function (x) { return x.id === "b"; }, disabled: function (x) { return x.id === "d"; },
        menu: function (x) { return x.menu ? [{ label: t("עריכה", "Edit"), icon: sym("edit"), fn: function () {} }, { label: t("שכפול", "Duplicate"), icon: sym("duplicate"), fn: function () {} }] : null; },
        remove: { kind: "remove", can: function (x) { return !!x.rm; }, title: function (x) { return t("להסיר את " + x.t + "?", "Remove " + x.t + "?"); }, text: function () { return t("הוא יישאר קיים, רק לא ברשימה.", "It stays, only not in the list."); }, run: function () { return sleep(700); } } });
    } },
    { k: "header", he: "כותרת", en: "Header", draw: function (b, t) {
      var h1 = '<header class="rhead"><button type="button" class="rbtn rbtn--icon" aria-label="' + t("חזרה", "Back") + '" title="' + t("חזרה", "Back") + '">' + sym("back", "rsym--dir") + '</button><div class="rhead__text"><span class="rhead__tw"><h2 class="rhead__title" dir="auto">' + t("מסך עם חזרה", "A screen with back") + '</h2><span class="rhead__sub" dir="auto">' + t("ותיאור מתחת לכותרת", "and a description under the title") + "</span></span></div></header>";
      var h2 = '<header class="rhead"><div class="rhead__text"><h2 class="rhead__title" dir="auto">' + t("פעולות מסתגלות", "Adaptive actions") + '</h2></div><span class="rhead__acts">' +
        ib("share", t("שיתוף", "Share"), 'data-pri="1" data-menu-label="' + t("שיתוף", "Share") + '"') + ib("print", t("הדפסה", "Print"), 'data-pri="2" data-menu-label="' + t("הדפסה", "Print") + '"') + ib("copy", t("העתקה", "Copy"), 'data-pri="3" data-menu-label="' + t("העתקה", "Copy") + '"') +
        ib("plus", t("הוספה", "Add"), "", "rbtn--accent") + ib("more", t("עוד", "More"), 'data-rmore="fold" aria-haspopup="menu" data-hmore') + "</span></header>";
      var h3 = '<header class="rhead"><div class="rhead__text"><h2 class="rhead__title" dir="auto">' + t("כותרת ארוכה מאוד שלא נכנסת בשורה אחת ולכן נשברת לשתי שורות אחרי שכל הפעולות קופלו", "A very long title that does not fit on one line, so it wraps once every action has folded") + '</h2></div><span class="rhead__acts">' +
        ib("edit", t("עריכה", "Edit"), 'data-pri="1" data-menu-label="' + t("עריכה", "Edit") + '"') + ib("delete", t("מחיקה", "Delete"), 'data-pri="2" data-menu-label="' + t("מחיקה", "Delete") + '"') + ib("more", t("עוד", "More"), 'data-rmore="fold" aria-haspopup="menu" data-hmore') + "</span></header>";
      b.innerHTML = col([block(t("חזרה, כותרת ותיאור", "Back, title and description"), h1), block(t("פעולות שמתקפלות לעוד", "Actions that fold into More"), h2), block(t("כותרת ארוכה", "A long title"), h3)]);
      [].forEach.call(b.querySelectorAll(".rhead"), function (h) { RosterHeader.fit(h); });
    } },
    { k: "row", he: "שורה", en: "Row", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      var it = [
        { id: "n", t: t("רגיל", "Normal") }, { id: "s", t: t("עם תת שורה", "With a sub line"), s: t("הסבר קצר שנשבר לכמה שורות כשצריך", "A short explanation that wraps when it must") },
        { id: "l", t: t("עם מוביל וסוף", "With a lead and an end"), lead: ricon("calendar"), trail: ib("edit", t("עריכה", "Edit")) },
        { id: "o", t: t("פותחת (לחיצה)", "Opens (press)") }, { id: "c", t: t("נוכחית", "Current") }, { id: "b", t: t("ממתינה", "Busy") }, { id: "d", t: t("כבויה", "Disabled") },
        { id: "m", t: t("עם תפריט", "With a menu"), menu: true }, { id: "r", t: t("עם מחיקה", "With deletion"), rm: true }
      ];
      RosterList.render(b.querySelector("[data-l]"), it, { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.t, sub: x.s, lead: x.lead, trail: x.trail }; },
        onOpen: function (x) { toast(t("נפתח: ", "Opened: ") + x.t); }, canOpen: function (x) { return /^[ocbd]$/.test(x.id); },
        current: function (x) { return x.id === "c"; }, waiting: function (x) { return x.id === "b"; }, disabled: function (x) { return x.id === "d"; },
        menu: function (x) { return x.menu ? [{ label: t("שינוי שם", "Rename"), icon: sym("edit"), fn: function () {} }, { label: t("שיתוף", "Share"), icon: sym("share"), fn: function () {} }] : null; },
        remove: { kind: "delete", can: function (x) { return !!x.rm; }, title: function (x) { return t("למחוק את " + x.t + "?", "Delete " + x.t + "?"); }, text: function () { return t("אי אפשר לשחזר.", "This cannot be undone."); }, run: function () { return sleep(700); } } });
    } },
    { k: "field", he: "שדה", en: "Field", draw: function (b, t) {
      var F = function (label, ctl, after, cls) { return '<label class="rlayout rlayout--unit rfield' + (cls ? " " + cls : "") + '"><span>' + label + "</span>" + ctl + (after || "") + "</label>"; };
      b.innerHTML = '<form class="rlayout rfields" novalidate data-ff>' +
        F(t("ריק, עם דוגמה", "Empty, with an example"), '<input type="text" placeholder="' + t("למשל: דנה כהן", "e.g. Dana Cohen") + '" data-hint>') +
        F(t("עם ערך", "With a value"), '<input type="text" placeholder=" " value="' + t("מפגש בוקר", "Morning session") + '">') +
        F(t("עם עזרה", "With help"), '<input type="text" placeholder=" ">', '<span class="rf-help">' + t("עד 40 תווים.", "Up to 40 letters.") + "</span>") +
        F(t("שגיאה", "Error"), '<input type="text" placeholder=" " value="x" data-err>') +
        F(t("שורת מצב חיה", "A live status line"), '<input type="text" placeholder=" " value="abc">', '<span class="rf-note">' + t("נשמר לפני רגע", "Saved a moment ago") + "</span>") +
        F(t("כבוי", "Disabled"), '<input type="text" placeholder=" " value="' + t("לא לשינוי", "Not to change") + '" disabled>') +
        F(t("קריאה בלבד", "Read only"), '<input type="text" placeholder=" " value="' + t("אפשר לבחור ולהעתיק", "Can be selected and copied") + '" readonly>') +
        F(t("עם יחידה", "With a unit"), '<input type="text" inputmode="decimal" dir="ltr" placeholder=" " value="120">', '<span class="rf-end"><span class="rf-unit">₪</span></span>') +
        F(t("אימייל", "Email"), '<input type="email" placeholder="name@example.com" data-hint autocomplete="off">', "", "rfield--ltr") +
        F(t("בחירה", "Select"), "<select><option>" + t("ראשון", "First") + "</option><option selected>" + t("שני", "Second") + "</option><option disabled>" + t("כבוי", "Disabled") + "</option><option>" + t("רביעי", "Fourth") + "</option></select>") +
        F(t("תאריך", "Date"), '<input type="date" placeholder=" " value="2026-11-26">') + F(t("שעה", "Time"), '<input type="time" placeholder=" " value="09:30">') +
        F(t("טקסט ארוך, גדל עם הטקסט", "Long text, grows with it"), '<textarea placeholder=" ">' + t("שורה ראשונה\nשורה שנייה", "First line\nSecond line") + "</textarea>") +
        F(t("חיפוש, עם ניקוי", "Search, with clear"), '<input type="search" placeholder=" " value="' + t("גלים", "waves") + '">', "", "rfield--search") +
        "</form>";
      var bad = b.querySelector("[data-err]"); if (window.RosterField) RosterField.error(bad, t("הערך לא תקין, נסו שוב.", "This value is not valid, try again."));
    } },
    { k: "search", he: "חיפוש", en: "Search", draw: function (b, t) {
      b.innerHTML = block(t("זכוכית מגדלת בכותרת, על רשימה", "A magnifier in the header, over a list"), col(['<header class="rhead"><div class="rhead__text"><h2 class="rhead__title" dir="auto">' + t("שירים", "Songs") + '</h2></div><span class="rhead__acts">' + ib("search", t("חיפוש", "Search"), "data-rsearch") + "</span></header>", '<div data-l></div>'], { rel: "bars" }));
      var names = [t("מים זורמים", "Flowing water"), t("בוקר שקט", "Quiet morning"), t("גלים", "Waves"), t("רוח בין העצים", "Wind in the trees"), t("שמש של צהריים", "Noon sun")];
      var el = b.querySelector("[data-l]");
      RosterList.render(el, names.map(function (n, i) { return { id: i, n: n }; }), { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, lead: ricon("music") }; }, search: function (x) { return x.n; } });
      RosterSearch.attach(b.querySelector("[data-rsearch]"), el, { label: t("חיפוש שיר", "Search a song"), empty: t("אין שיר כזה", "No such song"), icon: sym("music") });
    } },
    { k: "pick", he: "בוחר ומתג", en: "Checkbox, choice and switch", draw: function (b, t) {
      var n = id("pk");
      var chk = function (title, sub, attrs) { return '<label class="rlayout rlayout--row rlayout--pad rrow rrow--check"><span class="rlayout rlayout--unit rlayout__grow rrow__main"><span class="rrow__title" dir="auto">' + title + "</span>" + (sub ? '<span class="rrow__sub" dir="auto">' + sub + "</span>" : "") + '</span><span class="rrow__trail"><input type="checkbox" class="rcheck"' + (attrs || "") + '><span class="ricon rcheck__mark" aria-hidden="true">' + sym("check") + "</span></span></label>"; };
      var sw = function (title, sub, attrs) { return '<label class="rlayout rlayout--row rlayout--pad rrow rrow--switch"><span class="rlayout rlayout--unit rlayout__grow rrow__main"><span class="rrow__title" dir="auto">' + title + "</span>" + (sub ? '<span class="rrow__sub" dir="auto">' + sub + "</span>" : "") + '</span><span class="rlayout rlayout--row rrow__trail"><input type="checkbox" role="switch" class="rswitch"' + (attrs || "") + "></span></label>"; };
      var pick = function (title, sub, attrs, rowAttrs) { return '<label class="rlayout rlayout--row rlayout--pad rrow rrow--pick"' + (rowAttrs || "") + '><input type="radio" name="' + n + '"' + (attrs || "") + '><span class="rlayout rlayout--unit rlayout__grow rrow__main"><span class="rrow__title" dir="auto">' + title + "</span>" + (sub ? '<span class="rrow__sub" dir="auto">' + sub + "</span>" : "") + '</span><span class="ricon rrow__ok" aria-hidden="true">' + sym("check") + "</span></label>"; };
      b.innerHTML = col([
        block(t("תיבת סימון (נשלחת בכפתור)", "Checkbox (sent by a button)"), col([chk(t("לא מסומנת", "Not ticked")), chk(t("מסומנת", "Ticked"), t("עם הסבר", "With an explanation"), " checked"), chk(t("כבויה", "Disabled"), "", " disabled")], { rel: "bars" })),
        block(t("מתג (חל מיד)", "Switch (applies at once)"), col([sw(t("כבוי", "Off")), sw(t("דלוק", "On"), t("הגדרה שחלה מיד", "A setting that applies at once"), " checked"), sw(t("לא זמין", "Unavailable"), "", " disabled")], { rel: "bars" })),
        block(t("שורת בחירה (אחת מכמה)", "Choice row (one of many)"), col([pick(t("ציבורי", "Public"), t("כל מי שיש לו קישור", "Anyone with the link"), " checked"), pick(t("פרטי", "Private"), t("רק אני", "Only me")),
          pick(t("ממתינה", "Busy"), t("נשמרת בשרת", "Being saved"), "", ' aria-busy="true"'), pick(t("כבויה", "Disabled"), "", " disabled")], { rel: "bars" }))
      ]);
    } },
    { k: "menu", he: "תפריט", en: "Menu", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [
        S("p", t("פעולות, קבוצות והרסני אחרון", "Actions, groups, destructive last"), ib("more", t("עוד", "More"), 'aria-haspopup="menu" data-m="plain"')),
        S("c", t("פריטים מסומנים (נשארים פתוחים)", "Ticked items (stays open)"), ib("filter", t("סינון", "Filter"), 'aria-haspopup="menu" data-m="check"')),
        S("r", t("אחד מכמה", "One of many"), ib("sort", t("מיון", "Sort"), 'aria-haspopup="menu" data-m="radio"')),
        S("h", t("ראש ורגל", "Head and foot"), ib("user", t("חשבון", "Account"), 'aria-haspopup="menu" data-m="head"')),
        S("u", t("נפתח למעלה", "Opens upward"), ib("more", t("עוד", "More"), 'aria-haspopup="menu" data-m="up"')),
        S("e", t("ליד הקצה: מתהפך", "Near the edge: flips"), ib("more", t("עוד", "More"), 'aria-haspopup="menu" data-m="plain"'), "", ib("more", t("עוד", "More"), 'aria-haspopup="menu" data-m="plain"'))
      ]);
    } },
    { k: "format", he: "בועת עיצוב", en: "Format bubble", draw: function (b, t) {
      b.innerHTML = '<div class="rlayout rfields"><label class="rlayout rlayout--unit rfield"><span>' + t("טקסט עשיר: הדגשה בלבד", "Rich text: bold only") + '</span><div class="rf-rich" contenteditable="true" role="textbox" aria-multiline="true" dir="auto">' +
        t("בוחרים מילה: בטלפון נפתחת בועה עם <b>הדגשה</b>, במחשב Ctrl+B.", "Select a word: on a phone a bubble with <b>bold</b> opens, on a computer Ctrl+B.") + "</div></label>" +
        '<label class="rlayout rlayout--unit rfield"><span>' + t("טקסט עשיר לקריאה בלבד", "Rich text, read only") + '</span><div class="rf-rich" contenteditable="false" role="textbox" aria-multiline="true" dir="auto">' + t("טקסט <b>מודגש</b> שאי אפשר לשנות.", "<b>Bold</b> text that cannot change.") + "</div></label></div>";
    } },
    { k: "appmenu", he: "תפריט האפליקציה", en: "App menu", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [S("n", t("הכפתור העגול עם האות, אחרון בכל כותרת", "The round button with the initial, last in every header"), "", t("פותח את התפריט עם השם, האימייל, הפריטים של האפליקציה ו\"יציאה\". כאן המשתמש מדומה.", "Opens the menu with the name, the email, the app's items and sign out. The person here is fake."), ricon("user"))]);
    } },
    { k: "window", he: "חלון (גיליון ופאנל)", en: "Window (sheet and panel)", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      var open = function (w) { return tb(t("פתיחה", "Open"), 'data-w="' + w + '"'); };
      states(b.querySelector("[data-sx]"), [
        S("msg", t("חלון קצר: הודעה בלי פעולה", "Short window: a message, no action"), open("msg")),
        S("cf", t("אישור", "Confirm"), open("confirm"), t("סגירה היא הביטול", "Closing is the cancel")),
        S("fd", t("אישור עם שדה ובדיקה בשמירה", "Confirm with a field, checked on save"), open("field"), t("\"x\" נכשל על השדה, \"שגיאה\" נכשל במשפט, כל השאר נשמר", "\"x\" fails on the field, \"error\" fails in the sentence, anything else saves")),
        S("pe", t("פופאפ, צד הסוף", "Popup, end side"), open("popEnd")), S("ps", t("פופאפ, צד ההתחלה", "Popup, start side"), open("popStart")),
        S("pl", t("פופאפ שנפתח בטעינה", "Popup that opens loading"), open("popLoad")),
        S("pp", t("פופאפ מתוך פופאפ", "Popup from a popup"), open("popFrom")),
        S("pn", t("פאנל (מחשב)", "Panel (computer)"), open("panel")),
        S("an", t("ליד הקצה: חלון קצר ליד הפקד", "Near the edge: a short window beside its control"), open("confirm"), "", tb(t("פתיחה", "Open"), 'data-w="confirm"'))
      ]);
    } },
    { k: "split", he: "פריסה מחולקת ושלד האפליקציה", en: "Split layout and app shell", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      RosterList.render(b.querySelector("[data-l]"), [], { kind: "row", key: function (x) { return x; }, content: function () { return {}; },
        empty: { icon: ricon("catalog"), title: t("עוד לא בערכה", "Not in the kit yet"), text: t("RosterApp (משטח בגובה החלון, מחיצה ומחסנית מסכים) ממתין להחלטה.", "RosterApp (a window-high surface, a divider and a screen stack) waits for a decision.") } });
    } },
    { k: "grid", he: "רשת כרטיסים", en: "Card grid", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      var it = []; for (var i = 1; i <= 6; i++) it.push({ id: i, n: t("כרטיס ", "Card ") + i });
      RosterList.render(b.querySelector("[data-l]"), it, { kind: "card", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, sub: t("ברשת שמתמלאת לפי הרוחב", "in a grid that fills by width") }; } });
    } },
    { k: "slider", he: "סליידר", en: "Slider", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [
        S("n", t("רגיל", "Normal"), '<input class="rrange" type="range" min="0" max="100" value="40" aria-label="' + t("עוצמה", "Volume") + '">'),
        S("s", t("סרגל מקום", "Seek bar"), '<input class="rrange rrange--seek" type="range" min="0" max="228" value="138" aria-label="' + t("מקום", "Position") + '" data-seek>'),
        S("d", t("כבוי", "Disabled"), '<input class="rrange" type="range" min="0" max="100" value="60" disabled aria-label="' + t("עוצמה", "Volume") + '">')
      ]);
      [].forEach.call(b.querySelectorAll(".rrange"), function (r) { RosterRange.paint(r); });
    } },
    { k: "player", he: "נגן", en: "Player", draw: function (b, t) {
      b.innerHTML = col([block(t("שירים קצרים שנוצרים בדף", "Short songs made in the page"), '<div data-l></div>'), block(t("מצבי הנגן (מראה בלבד)", "The player's states (looks only)"), '<div data-sx></div>')]);
      makeDockOnce(); songList(b.querySelector("[data-l]"), t);
      var st = function (s, he, en) { return chip(t(he, en), 'role="radio" aria-checked="false" data-pst="' + s + '"', "rchip--button", "button"); };
      b.querySelector("[data-sx]").innerHTML = '<span role="radiogroup" aria-label="' + t("מצב", "State") + '" data-radio class="rlayout rlayout--row rlayout--unit rlayout--wrap">' +
        st("idle", "ריק", "Idle") + st("loading", "טעינה", "Loading") + st("playing", "מתנגן", "Playing") + st("paused", "מושהה", "Paused") + st("error", "שגיאה", "Error") + "</span>";
    } },
    { k: "section", he: "כותרת קטע", en: "Section header", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      var it = [
        { k: "a", title: t("קטע שנפתח", "A section that opens"), count: 3, time: "12:00", body: t("התוכן של הקטע.", "The section's content.") },
        { k: "b", title: t("עם תיאור", "With a description"), sub: t("מושתק, באותה שורה", "Muted, on the same line"), body: t("עוד תוכן.", "More content."), actions: ib("plus", t("הוספה", "Add"), "data-racc-open") },
        { k: "c", title: t("קבוע, תמיד פתוח", "Fixed, always open"), fold: false, body: t("בלי חץ ובלי לחיצה.", "No arrow and no press.") },
        { k: "d", title: t("בלי תוכן: רק הפס", "No content: only the bar"), count: 0 }
      ];
      RosterList.render(b.querySelector("[data-l]"), it, { kind: "section", key: function (x) { return x.k; },
        content: function (x) { return { key: "kitdemo.sec." + x.k + uid, title: x.title, sub: x.sub, count: x.count, time: x.time, fold: x.fold, actions: x.actions, open: x.k === "a", remember: false, body: x.body ? '<div class="rlayout rlayout--pad-x">' + x.body + "</div>" : "" }; } });
    } },
    { k: "loading", he: "מצב טעינה", en: "Loading", draw: function (b, t) {
      /* the loading area fills the area it waits in (a list, a window's body): it has no place of its own in the flow of this page, so it is shown in a window
         and on the failed list's retry (section "מצב ריק"); here, the wait on the pressed control */
      b.innerHTML = col([block(t("המתנה על הפקד שנלחץ, ורשימה שנטענת", "The wait on the pressed control, and a list that loads"), '<div data-sx></div>')]);
      states(b.querySelector("[data-sx]"), [
        S("l", t("רשימה שנטענת בחלון, מגיעה אחרי שנייה וחצי", "A list loading in a window, arriving after a second and a half"), tb(t("פתיחה", "Open"), 'data-w="popLoad"')),
        S("i", t("כפתור אייקון", "Icon button"), ib("upload", t("העלאה", "Upload"), "data-busy")), S("t", t("כפתור טקסט", "Text button"), tb(t("שמירה", "Save"), "data-busy")),
        S("c", t("צ'יפ", "Chip"), chip(t("שמירה", "Save"), 'data-busy aria-pressed="false"', "rchip--button", "button")),
        S("r", t("השורה עצמה (list.busy)", "The row itself (list.busy)"), tb(t("שמירה", "Save"), "data-rowbusy"))
      ]);
    } },
    { k: "empty", he: "מצב ריק", en: "Empty", draw: function (b, t) {
      b.innerHTML = col([block(t("ריק, עם פעולה", "Empty, with an action"), '<div data-a></div>'), block(t("ריק, בלי פעולה", "Empty, no action"), '<div data-b></div>'), block(t("טעינה שנכשלה", "A load that failed"), '<div data-c></div>')]);
      var o = function (e) { return { kind: "card", key: function (x) { return x; }, content: function () { return {}; }, empty: e }; };
      RosterList.render(b.querySelector("[data-a]"), [], o({ icon: ricon("music"), title: t("עוד אין שירים", "No songs yet"), text: t("שיר חדש יופיע כאן.", "A new song will show here."), action: { label: t("הוספה", "Add") } }));
      RosterList.render(b.querySelector("[data-b]"), [], o({ title: t("אין תוצאות", "No results"), text: t("נסו מילה אחרת.", "Try another word.") }));
      var c = b.querySelector("[data-c]"), L = RosterList.render(c, null, o({ icon: ricon("music") }));
      var fail = function () { L.fail(function () { setTimeout(fail, 1200); }); }; fail();
    } },
    { k: "musicfx", he: "אפקט מוסיקה", en: "Music effect", draw: function (b, t) {
      b.innerHTML = col([block(t("עקומה על כרטיס שמתנגן", "A curve on the card that plays"), '<div data-l></div>')]);
      makeDockOnce(); songList(b.querySelector("[data-l]"), t);
    } },
    { k: "tabs", he: "לשוניות", en: "Tabs", draw: function (b, t) {
      var p = id("tb"), tab = function (n, label, sel, tail) { return '<button type="button" class="rlayout rlayout--row rlayout--unit rlayout--pad-x rtab" role="tab" id="' + p + "t" + n + '" aria-controls="' + p + "p" + n + '" aria-selected="' + sel + '"' + (sel ? "" : ' tabindex="-1"') + ' data-tab="' + n + '">' + label + (tail != null ? '<span class="rtab__tail">' + tail + "</span>" : "") + "</button>"; };
      var panel = function (n, sel, text) { return '<div role="tabpanel" id="' + p + "p" + n + '" aria-labelledby="' + p + "t" + n + '" class="rlayout rlayout--pad"' + (sel ? "" : " hidden") + ">" + RosterCard.html({ title: text, sub: t("החלקה הצידה עוברת לשונית", "A sideways swipe changes the tab") }) + "</div>"; };
      b.innerHTML = col(['<div class="rlayout rlayout--row rlayout--bars rtabs" role="tablist" aria-label="' + t("הדגמה", "Demo") + '">' + tab("a", t("הערות", "Notes"), true) + tab("b", t("מפגשים", "Sessions"), false, 3) + tab("c", t("קבצים", "Files"), false) + "</div>",
        panel("a", true, t("לוח ההערות", "The notes panel")) + panel("b", false, t("לוח המפגשים", "The sessions panel")) + panel("c", false, t("לוח הקבצים", "The files panel"))], { rel: "bars" });
      /* tabs.js scrolls the selected tab into view on attach (block "nearest"), which also scrolls the page's list: kept where it was (reported) */
      var sc = b.closest(".rlayout__body"), y = sc ? sc.scrollTop : 0;
      RosterTabs.attach(b.querySelector("[role=tablist]"), { swipe: true });
      if (sc) sc.scrollTop = y;
    } },
    { k: "list", he: "רשימה", en: "List", draw: function (b, t) {
      b.innerHTML = col([block(t("שורות בקבוצות, ממוספרות, עם תפריט והסרה", "Rows in groups, numbered, with a menu and removal"), '<div data-a></div>'),
        block(t("קטעים", "Sections"), '<div data-c></div>'),
        block(t("גרירה לסידור (שמירה של חצי שנייה, כל שמירה שלישית נכשלת וחוזרת)", "Drag to reorder (a half second save, every third save fails and goes back)"), '<div data-d></div>')]);
      var rows = [{ id: 1, g: "a", n: t("שירה", "Shira") }, { id: 2, g: "a", n: t("נועם", "Noam") }, { id: 3, g: "b", n: t("טל", "Tal") }, { id: 4, g: "b", n: t("מאיה", "Maya") }, { id: 5, g: "b", n: t("יואב", "Yoav") }];
      RosterList.render(b.querySelector("[data-a]"), rows, { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n }; }, group: function (x) { return x.g; },
        groups: [{ key: "a", label: t("מגיעים", "Coming"), count: true, number: true }, { key: "b", label: t("ממתינים", "Waiting"), count: true, number: true }],
        menu: function () { return [{ label: t("שינוי שם", "Rename"), icon: sym("edit"), fn: function () {} }, { label: t("העברה", "Move"), icon: sym("swap"), fn: function () {} }]; },
        remove: { kind: "remove", title: function (x) { return t("להסיר את " + x.n + "?", "Remove " + x.n + "?"); }, run: function () { return sleep(600); } } });
      /* not lazy: a lazy section inside a list that is itself inside a section is filled by the OUTER list's fill (section.js binds only the outer root), reported */
      var secs = [{ k: "x", n: t("בוקר", "Morning"), c: 2 }, { k: "y", n: t("ערב", "Evening"), c: 0 }], sl = b.querySelector("[data-c]");
      RosterList.render(sl, secs, { kind: "section", key: function (x) { return x.k; },
        content: function (x) { return { key: "kitdemo.lsec." + x.k + uid, title: x.n, count: x.c, open: true, remember: false, body: '<div data-inner="' + x.k + '"></div>' }; } });
      secs.forEach(function (x) { var l = sl.querySelector('[data-inner="' + x.k + '"]'); if (l) RosterList.render(l, x.c ? [t("פריט ראשון", "First item"), t("פריט שני", "Second item")] : [], { kind: "row", key: function (s) { return s; }, content: function (s) { return { title: s }; }, empty: { title: t("ריק", "Empty"), text: t("אין פריטים בקטע הזה.", "No items in this section.") } }); });
      var n = 0, ord = [{ id: "a", n: t("חימום", "Warm up") }, { id: "b", n: t("הליכה", "Walk") }, { id: "c", n: t("מעגל", "Circle") }, { id: "d", n: t("סיום", "Closing") }];
      RosterList.render(b.querySelector("[data-d]"), ord, { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, lead: ricon("grip", "ricon--muted") }; },
        sortable: { onMove: function () { n++; return n % 3 === 0 ? fails(500, new Error("demo")) : sleep(500); } } });
    } },
    { k: "tile", he: "אריח שחוזר בגלילה", en: "Tile that comes back on scroll", draw: function (b, t) {
      b.innerHTML = '<div data-l></div>';
      RosterList.render(b.querySelector("[data-l]"), [], { kind: "row", key: function (x) { return x; }, content: function () { return {}; },
        empty: { icon: ricon("eye-off"), title: t("לא מוצג כאן", "Not shown here"), text: t("האריח עומד לפני אזור גלילה משלו, והדף הזה גולל ברשימה אחת. ראו את הדוח.", "The tile stands before a scroll area of its own, and this page scrolls in one list. See the report.") } });
    } },
    { k: "message", he: "הודעה", en: "Message", draw: function (b, t) {
      b.innerHTML = col([block(t("שורת מצב בתוך הדף", "A status line in the page"), '<div class="rlayout rlayout--row rlayout--pad rmsg" role="status">' + t("הקישור הועתק", "The link was copied") + "</div>"), block(t("הודעה קופצת", "A toast"), '<div data-sx></div>')]);
      states(b.querySelector("[data-sx]"), [S("t", t("להציג הודעה קופצת", "Show a toast"), tb(t("הצגה", "Show"), "data-toast"))]);
    } },
    { k: "print", he: "מעטפת הדפסה", en: "Print shell", draw: function (b, t) {
      b.innerHTML = '<div data-sx></div>';
      states(b.querySelector("[data-sx]"), [S("p", t("הדפסה של דף לדוגמה", "Print a sample page"), ib("print", t("הדפסה", "Print"), "data-print"), t("כותרת, טקסט, קטעים ופריטים עם שדות", "A title, text, sections and items with fields"))]);
    } },
    { k: "live", he: "נתונים בזמן אמת", en: "Live data", draw: function (b, t) {
      b.innerHTML = col([block(t("שינוי שמגיע מבחוץ", "A change that comes from elsewhere"), '<div data-sx></div>'), block(t("הרשימה", "The list"), '<div data-l></div>')]);
      var seq = 0, data = [], words = [t("ירח", "Moon"), t("נהר", "River"), t("שביל", "Path"), t("אבן", "Stone"), t("ענן", "Cloud"), t("עלה", "Leaf"), t("גשם", "Rain"), t("חול", "Sand")];
      var mk = function () { seq++; return { id: "x" + seq, n: words[seq % words.length] + " " + seq, v: 0 }; };
      for (var i = 0; i < 4; i++) data.push(mk());
      var el = b.querySelector("[data-l]");
      var opts = { kind: "card", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, sub: t("גרסה ", "Version ") + x.v }; }, empty: { title: t("הרשימה ריקה", "The list is empty"), text: t("הוספה מבחוץ תופיע כאן.", "An addition from elsewhere shows here.") } };
      var L = RosterList.render(el, data, opts);
      var grid = function () { return el.querySelector(".rgrid") || el; };
      var count = function () { var c = b.querySelector("[data-count]"); if (c) RosterMotion.tick(c, String(data.length)); };
      var apply = function (next, out) { var o = out ? [L.item(out)] : []; var p = RosterMotion.flip(grid(), function () { data = next; L.update(data); }, { out: o }); count(); return p; };
      var api = {
        add: function () { var n = data.slice(), at = Math.floor(Math.random() * (n.length + 1)); n.splice(at, 0, mk()); apply(n); },
        remove: function () { if (!data.length) return; var k = data[Math.floor(Math.random() * data.length)].id; apply(data.filter(function (x) { return x.id !== k; }), k); },
        change: function () { if (!data.length) return; var x = data[Math.floor(Math.random() * data.length)], n = data.map(function (y) { return y === x ? { id: y.id, n: y.n, v: y.v + 1 } : y; }); data = n; L.update(data); RosterMotion.change(L.item(x.id)); },
        move: function () { if (data.length < 2) return; var n = data.slice(1).concat([data[0]]); apply(n); },
        burst: function () { var n = data.slice(); for (var j = 0; j < 6; j++) n.unshift(mk()); RosterMotion.flip(grid(), function () { data = n; L.update(data); }, { burst: true }); count(); }
      };
      liveApi = api;
      states(b.querySelector("[data-sx]"), [
        S("c", t("מונה שמתגלגל", "A count that rolls"), '<span class="rbtn__tail" data-count>' + data.length + "</span>"),
        S("a", t("הוספה", "Add"), ib("plus", t("הוספה", "Add"), 'data-live="add"')), S("r", t("הסרה", "Remove"), ib("x", t("הסרה", "Remove"), 'data-live="remove"')),
        S("h", t("שינוי", "Change"), ib("edit", t("שינוי", "Change"), 'data-live="change"')), S("m", t("הזזה", "Move"), ib("swap", t("הזזה", "Move"), 'data-live="move"')),
        S("b", t("הרבה בבת אחת, בלי תנועה", "Many at once, no motion"), ib("download", t("הרבה בבת אחת", "Many at once"), 'data-live="burst"'))
      ]);
    } }
  ];
  var liveApi = null, dockMade = false;
  function makeDockOnce() { if (dockMade) return; dockMade = true; makeDock(); }

  /* ---------- the page: a header, and the one body list of sections ---------- */
  var app = document.getElementById("app");
  app.innerHTML = RosterLayout.html({ surface: true, bodyCls: "rlist",
    head: '<header class="rhead"><div class="rhead__text"><span class="rhead__tw"><h1 class="rhead__title" dir="auto">ערכת הרכיבים</h1><span class="rhead__sub" dir="auto">כל רכיב, בכל מצב</span></span></div>' +
      '<span class="rhead__acts">' + ib("catalog", "תוכן העניינים", 'aria-haspopup="menu" data-index') + "</span></header>" });
  var body = RosterLayout.body(app);
  body.setAttribute("data-fab-room", "");
  RosterAppMenu.attach({ items: function () { return [{ label: "תוכן העניינים", icon: sym("catalog"), fn: function () { openIndex(document.querySelector("[data-index]")); } }, { sep: true }, { label: "הדפסה לדוגמה", icon: sym("print"), fn: printDemo }]; } });

  var LANG = {};
  function translator(k) { var en = LANG[k] === "en"; return function (he, enT) { return en ? enT : he; }; }
  function draw(s, el) {
    el.setAttribute("dir", LANG[s.k] === "en" ? "ltr" : "rtl"); el.setAttribute("lang", LANG[s.k] === "en" ? "en" : "he");
    el.textContent = "";
    s.draw(el, translator(s.k));
  }
  var BODY = {};
  RosterList.render(body, SECTIONS, { kind: "section", key: function (s) { return s.k; },
    content: function (s) { return { key: "kitdemo." + s.k, title: s.he, sub: s.en, level: 2, open: true, lazy: true, remember: false,
      actions: ib("globe", "English", 'aria-pressed="false" data-lang="' + s.k + '"') }; },
    fill: function (s, el) { if (!s) return; BODY[s.k] = el; draw(s, el); } });

  /* the floating button: the add action of the live list */
  var fab = document.createElement("button"); fab.type = "button"; fab.className = "rfab"; fab.setAttribute("aria-label", "הוספה לרשימה החיה"); fab.title = "הוספה לרשימה החיה"; fab.innerHTML = sym("plus");
  fab.addEventListener("click", function () { if (liveApi) { liveApi.add(); jump("live"); } });
  document.body.appendChild(fab);

  /* the index: a menu of every section; a pick scrolls the body to it (no hash in the address) */
  function jump(k) {
    var sec = body.querySelector('[data-racc-key="kitdemo.' + k + '"]'); if (!sec) return;
    if (sec.querySelector(".racc__head[aria-expanded=false]")) RosterSection.show(sec, true);
    sec.scrollIntoView({ block: "start", behavior: RosterMotion.reduced() ? "auto" : "smooth" });
  }
  function openIndex(btn) { RosterMenu.open(btn, SECTIONS.map(function (s) { return { label: s.he, meta: '<span dir="ltr">' + esc(s.en) + "</span>", fn: function () { jump(s.k); } }; })); }

  function printDemo() {
    RosterPrint.open({ title: "ערכת הרכיבים", sub: "דף לדוגמה", blocks: [
      { kind: "text", html: "טקסט פתיחה עם <b>מילה מודגשת</b>." },
      { kind: "section", title: "קטע ראשון", blocks: [
        { kind: "item", num: 1, title: "חימום", tag: "5 דקות", meta: ["מוזיקה: מים זורמים"], metaIcon: "music", fields: [{ label: "הערה", html: "בקצב איטי" }] },
        { kind: "item", num: 2, title: "הליכה", meta: ["בזוגות"], fields: [{ label: "הערה", html: "<b>חשוב</b>: מרווח ביניהם" }] }] },
      { kind: "section", title: "קטע שני", newPage: true, blocks: [{ kind: "item", num: 3, title: "מעגל" }] }
    ] });
  }

  /* ---------- the page's one listener: what the demo buttons do ---------- */
  var MENUS = {
    plain: function () { return [{ label: "עריכה", icon: sym("edit"), fn: function () {} }, { label: "שכפול", icon: sym("duplicate"), fn: function () {} }, { label: "שיתוף", icon: sym("share"), meta: "3", fn: function () {} }, { sep: true }, { label: "פריט כבוי", icon: sym("lock"), disabled: true }, { label: "מחיקה", icon: sym("delete"), fn: function () {} }]; },
    check: (function () { var on = { a: true, b: false, c: true }; return function () { return ["a", "b", "c"].map(function (k, i) { return { label: ["פעילים", "בארכיון", "שלי"][i], check: on[k], keep: true, fn: function (el, close, repaint) { on[k] = !on[k]; repaint(); } }; }); }; })(),
    radio: (function () { var cur = 0; return function () { return ["לפי שם", "לפי תאריך", "לפי גודל"].map(function (l, i) { return { label: l, check: cur === i, radio: true, fn: function () { cur = i; } }; }); }; })(),
    head: function () { return [{ label: "פרופיל", icon: sym("user"), fn: function () {} }, { label: "הגדרות", icon: sym("help"), fn: function () {} }]; }
  };
  document.addEventListener("click", function (e) {
    var x = e.target.closest ? e.target : null; if (!x) return;
    var b;
    if ((b = x.closest("[data-lang]"))) {
      var k = b.getAttribute("data-lang"), s = SECTIONS.filter(function (y) { return y.k === k; })[0]; LANG[k] = LANG[k] === "en" ? "he" : "en";
      b.setAttribute("aria-pressed", String(LANG[k] === "en")); b.setAttribute("aria-label", LANG[k] === "en" ? "עברית" : "English"); b.title = b.getAttribute("aria-label");
      if (BODY[k] && BODY[k].isConnected) draw(s, BODY[k]); return;
    }
    if ((b = x.closest("[data-index]"))) { openIndex(b); return; }
    if ((b = x.closest("[data-hmore]"))) { RosterMenu.open(b, RosterHeader.items(b.closest(".rhead"))); return; }
    if ((b = x.closest("[data-toggle]"))) { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); return; }
    if ((b = x.closest("[data-radio] [role=radio]"))) {
      [].forEach.call(b.parentNode.querySelectorAll("[role=radio]"), function (r) { r.setAttribute("aria-checked", String(r === b)); });
      if (b.hasAttribute("data-pst")) { nowName = nowName || SONGS[0].id; paintDock(b.getAttribute("data-pst"), { t: 42, d: SONGS[0].sec }); }
      return;
    }
    if ((b = x.closest("[data-chipmenu]"))) { var cm = b; RosterMenu.open(cm, ["מנהל", "עורך", "צופה"].map(function (l) { return { label: l, check: cm.textContent === l, radio: true, fn: function () { cm.textContent = l; } }; })); return; }
    if ((b = x.closest("[data-busy]"))) { RosterBusy(b, sleep(1000)); return; }
    if ((b = x.closest("[data-rowbusy]"))) { var row = b.closest("[data-rkey]"), lst = row && row.parentElement && row.parentElement.__rlist; if (lst) lst.busy(row.getAttribute("data-rkey"), sleep(1200)); return; }
    if ((b = x.closest("[data-m]"))) { var m = b.getAttribute("data-m");
      if (m === "head") RosterMenu.open(b, MENUS.head(), { head: '<div class="rmenu__head"><b dir="auto">דמו</b><span class="rmenu__sub" dir="auto">demo@example.com</span></div>', foot: [{ label: "שמירה", primary: true, fn: function () {} }, { label: "יציאה", ghost: true, fn: function () {} }] });
      else if (m === "up") RosterMenu.open(b, MENUS.plain(), { up: true });
      else if (m === "check") RosterMenu.open(b, MENUS.check);   /* a function: repaint() asks it again, so the ticks follow the state */
      else RosterMenu.open(b, MENUS[m]());
      return; }
    if ((b = x.closest("[data-w]"))) { openWindow(b.getAttribute("data-w"), b); return; }
    if ((b = x.closest("[data-toast]"))) { toast("הקישור הועתק"); return; }
    if ((b = x.closest("[data-print]"))) { printDemo(); return; }
    if ((b = x.closest("[data-live]"))) { if (liveApi) liveApi[b.getAttribute("data-live")](); return; }
  });

  /* ---------- windows ---------- */
  function lorem(n) { var o = []; for (var i = 1; i <= n; i++) o.push({ id: i, n: "פריט " + i }); return o; }
  function popBody(el) { var l = document.createElement("div"); RosterLayout.body(el).appendChild(l); RosterList.render(l, lorem(14), { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, sub: "שורה בתוך חלון" }; } }); }
  function openWindow(w, btn) {
    if (w === "msg") { RosterSheet.confirm({ title: "נשמר במכשיר", text: "השיר זמין גם בלי רשת.", anchor: btn }); return; }
    if (w === "confirm") { RosterSheet.confirm({ title: "למחוק את הפריט?", text: "אי אפשר לשחזר.", action: "מחיקה", anchor: btn, run: function (dlg, go) { RosterBusy(go, sleep(800)).then(function () { if (dlg.open) dlg.close(); }); } }); return; }
    if (w === "field") {
      RosterSheet.confirm({ title: "שינוי שם", anchor: btn, action: "שמירה", fields: [{ name: "name", label: "שם", value: "מפגש בוקר", required: true, maxlength: 40 }],
        submit: function (v) {
          if (v.name === "x") return fails(700, { field: "name", message: "השם קצר מדי." });
          if (v.name === "שגיאה" || v.name.toLowerCase() === "error") return fails(700, { message: "אי אפשר לשמור עכשיו. נסו שוב." });
          return sleep(700).then(function () { toast("נשמר: " + v.name); });
        } });
      return;
    }
    if (w === "popEnd" || w === "popStart") { var el = RosterSheet.popup({ title: w === "popEnd" ? "פופאפ בצד הסוף" : "פופאפ בצד ההתחלה", sub: "רשימה בתוך חלון", side: w === "popEnd" ? "end" : "start", body: "" }); popBody(el); return; }
    if (w === "popLoad") { var pl = RosterSheet.popup({ title: "נטען", side: "end" }); setTimeout(function () { if (RosterSheet.popup.open(pl)) { RosterSheet.popup.fill(pl, ""); popBody(pl); } }, 1500); return; }
    if (w === "popFrom") {
      var p1 = RosterSheet.popup({ title: "החלון הראשון", side: "start", body: "" });
      var l1 = document.createElement("div"); RosterLayout.body(p1).appendChild(l1);
      RosterList.render(l1, lorem(5), { kind: "row", key: function (x) { return x.id; }, content: function (x) { return { title: x.n, sub: "לחיצה פותחת את השני" }; },
        onOpen: function (x) { var p2 = RosterSheet.popup({ title: x.n, side: "end", from: p1, body: "" }); popBody(p2); } });
      return;
    }
    if (w === "panel") {
      var pn = RosterSheet.panel.open({ side: "end", html: RosterLayout.html({ surface: true, bodyCls: "rpopup-body",
        head: '<header class="rhead">' + ib("x", "סגירה", "data-pnx") + '<div class="rhead__text"><h2 class="rhead__title">פאנל</h2></div></header>' }) });
      pn.querySelector("[data-pnx]").addEventListener("click", function () { RosterSheet.panel.close(pn); });
      popBody(pn);
    }
  }
})();
