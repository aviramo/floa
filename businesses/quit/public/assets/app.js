/* ==========================================================================
   Quit: one habit at a time, counted from the moment it stopped.

   Everything a person types (a habit's name, their reason, a note) reaches the
   page through textContent, never through markup, so there is nothing to escape.

   Signing in is the domain's, not this app's: /auth.js (FLOA_AUTH), the same for
   every app on floa.co.il. The data is two tables behind row level security
   (schema.sql), so the browser can only ever reach its own person's rows.

   THE PAGE NEVER SCROLLS. render() builds a column the height of the window
   whose last child (.scroll) is the only thing that moves.
   ========================================================================== */
(function () {
  "use strict";

  const A = window.FLOA_AUTH;
  const root = document.getElementById("app");
  const BASE = "/quit/";
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  /* --- a way to build the page ------------------------------------------------ */
  function h(tag, attrs, ...kids) {
    const node = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), v);
      else if (k === "class") node.className = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    add(node, kids);
    return node;
  }
  function add(node, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) kid.forEach((k) => add(node, k));
    else node.appendChild(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
  }

  const ICONS = {
    leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z|M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
    plus: "M12 5v14|M5 12h14",
    check: "M20 6 9 17l-5-5",
    pencil: "M12 20h9|M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z",
    out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4|M16 17l5-5-5-5|M21 12H9",
    wind: "M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2|M9.6 4.6A2 2 0 1 1 11 8H2|M12.6 19.4A2 2 0 1 0 14 16H2",
    slip: "M12 9v4|M12 17h.01|M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
    flag: "M4 22V4|M4 4h13l-2 4 2 4H4",
  };
  function icon(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    ICONS[name].split("|").forEach((d) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      svg.appendChild(p);
    });
    return svg;
  }

  /* --- words for time and money --------------------------------------------------- */
  function unit(n, one, two, many) { return n === 1 ? one : n === 2 ? two : n + " " + many; }
  const days = (n) => unit(n, "יום", "יומיים", "ימים");
  const hours = (n) => unit(n, "שעה", "שעתיים", "שעות");
  const minutes = (n) => unit(n, "דקה", "שתי דקות", "דקות");
  function and(word) { return (/^\d/.test(word) ? " ו-" : " ו") + word; }

  /* "2 days and 5 hours": the two biggest units that are not zero. */
  function span(ms) {
    ms = Math.max(0, ms);
    const d = Math.floor(ms / DAY), hr = Math.floor((ms % DAY) / HOUR), m = Math.floor((ms % HOUR) / MIN);
    if (d) return days(d) + (hr ? and(hours(hr)) : "");
    if (hr) return hours(hr) + (m ? and(minutes(m)) : "");
    return minutes(Math.max(1, m));
  }
  const money = (n) => "₪" + Math.round(n).toLocaleString("he-IL");
  function when(t) {
    const d = new Date(t), opt = { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    if (d.getFullYear() !== new Date().getFullYear()) opt.year = "numeric";
    return d.toLocaleString("he-IL", opt);
  }
  const pad = (n) => String(n).padStart(2, "0");
  function localInput(t) {
    const d = new Date(t);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* The milestones every habit is measured against. */
  const STEPS = [
    ["שעה", HOUR], ["6 שעות", 6 * HOUR], ["יום", DAY], ["3 ימים", 3 * DAY], ["שבוע", 7 * DAY],
    ["שבועיים", 14 * DAY], ["חודש", 30 * DAY], ["3 חודשים", 90 * DAY], ["חצי שנה", 182 * DAY], ["שנה", 365 * DAY],
  ];

  /* --- what the app knows ------------------------------------------------------------- */
  const state = { habits: [], events: [], id: null, tab: "steps" };
  let remembered = "";
  try { remembered = localStorage.getItem("quit.habit") || ""; } catch (e) { /* private window */ }
  let live = null;       // the counter on screen, so a tick can repaint it
  let ticker = null;
  let loadedAt = 0;
  let sheetOpen = false;

  const current = () => state.habits.find((x) => x.id === state.id) || null;
  const eventsOf = (habit) => state.events.filter((e) => e.habit_id === habit.id);
  function choose(id) {
    state.id = id;
    try { localStorage.setItem("quit.habit", id); } catch (e) { /* private window */ }
  }

  /* The numbers of one habit at a moment. A slip starts the streak again, and the
     longest stretch between starts is the record. The money and the units are
     counted over the whole time since the start, less one day's worth for every
     slip: a slip means that day's amount was used. */
  function figures(habit, now) {
    const quit = +new Date(habit.quit_at);
    const mine = eventsOf(habit);
    const slips = mine.filter((e) => e.kind === "slip").map((e) => +new Date(e.at)).filter((t) => t > quit).sort((a, b) => a - b);
    const start = slips.length ? slips[slips.length - 1] : quit;
    const marks = [quit].concat(slips, [now]);
    let best = 0;
    for (let i = 0; i < marks.length - 1; i++) best = Math.max(best, marks[i + 1] - marks[i]);
    const kept = Math.max(0, (now - quit) / DAY - slips.length);
    return {
      since: Math.max(0, now - start),
      best,
      cravings: mine.filter((e) => e.kind === "craving").length,
      saved: kept * Number(habit.cost_per_day || 0),
      avoided: kept * Number(habit.units_per_day || 0),
    };
  }

  function load() {
    return Promise.all([
      A.api("/rest/v1/quit_habits?select=*&order=created_at.asc"),
      A.api("/rest/v1/quit_events?select=*&order=at.desc&limit=2000"),
    ]).then(([habits, events]) => {
      state.habits = habits || [];
      state.events = events || [];
      loadedAt = Date.now();
      if (!current()) {
        const back = state.habits.find((x) => x.id === remembered);
        state.id = back ? back.id : state.habits.length ? state.habits[0].id : null;
      }
    });
  }

  function failed(e) {
    if (e && e.signedOut) { login(); return; }
    toast("משהו השתבש. אפשר לנסות שוב");
  }

  /* --- small things on top of the page --------------------------------------------------- */
  let toastTimer = null;
  function toast(text) {
    let box = document.getElementById("toast");
    if (!box) { box = h("div", { class: "toast", id: "toast", role: "status" }, h("span")); document.body.appendChild(box); }
    box.firstChild.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
  }

  function sheet(...content) {
    sheetOpen = true;
    const scrim = h("div", { class: "scrim", role: "dialog", "aria-modal": "true", onclick: (e) => { if (e.target === scrim) close(); } },
      h("div", { class: "sheet" }, content));
    const onKey = (e) => { if (e.key === "Escape") close(); };
    function close() {
      scrim.remove();
      document.removeEventListener("keydown", onKey);
      sheetOpen = false;
      if (scrim.onclose) scrim.onclose();
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(scrim);
    const first = scrim.querySelector("input, textarea, button");
    if (first) first.focus();
    return { close, scrim };
  }

  /* --- the counter, repainted every second ------------------------------------------------------ */
  function paint() {
    if (!live) return;
    const habit = current();
    if (!habit) return;
    const f = figures(habit, Date.now());
    const d = Math.floor(f.since / DAY), rest = f.since % DAY;
    live.num.textContent = d.toLocaleString("he-IL");
    live.unit.textContent = d === 1 ? "יום" : "ימים";
    live.clock.textContent = pad(Math.floor(rest / HOUR)) + ":" + pad(Math.floor((rest % HOUR) / MIN)) + ":" + pad(Math.floor((rest % MIN) / 1000));

    const reached = STEPS.filter((s) => s[1] <= f.since).length;
    const next = STEPS[reached];
    if (next) {
      const from = reached ? STEPS[reached - 1][1] : 0;
      live.goal.textContent = "היעד הבא: " + next[0];
      live.left.textContent = "עוד " + span(next[1] - f.since);
      live.fill.style.width = Math.min(100, ((f.since - from) / (next[1] - from)) * 100) + "%";
    } else {
      live.goal.textContent = "עברת את כל אבני הדרך";
      live.left.textContent = "";
      live.fill.style.width = "100%";
    }
    live.stats.forEach((s) => { s.value.textContent = s.get(f); });
    if (reached !== live.reached && state.tab === "steps") {
      live.reached = reached;
      const fresh = list(habit);
      live.list.replaceWith(fresh);
      live.list = fresh;
    }
    live.reached = reached;
  }

  function start() {
    clearInterval(ticker);
    ticker = setInterval(paint, 1000);
    paint();
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden || !A.signedIn()) return;
    paint();
    if (!sheetOpen && state.habits.length && Date.now() - loadedAt > 60000) load().then(render).catch(() => {});
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest(".me, .menu")) return;
    const m = document.querySelector(".menu");
    if (m) m.hidden = true;
  });

  /* --- the screen ------------------------------------------------------------------------------------- */
  function top() {
    const label = (A.name() || A.email() || "?").trim().charAt(0).toUpperCase();
    const photo = A.avatar();
    const menu = h("div", { class: "menu", hidden: true },
      h("div", { class: "who" }, A.name() || A.email()),
      h("button", { type: "button", onclick: () => { A.signOut().then(() => { state.habits = []; state.events = []; state.id = null; login(); }); } },
        icon("out"), "התנתקות"));
    const me = h("button", { class: "me", type: "button", "aria-label": "החשבון שלי", onclick: () => { menu.hidden = !menu.hidden; } },
      photo ? h("img", { src: photo, alt: "", referrerpolicy: "no-referrer", onerror: (e) => e.target.replaceWith(document.createTextNode(label)) }) : label);
    return h("div", { class: "top" },
      h("div", { class: "brand" }, h("span", { class: "mark" }, icon("leaf")), "quit"),
      h("div", { class: "grow" }), me, menu);
  }

  function chips() {
    return h("div", { class: "chips", role: "tablist", "aria-label": "ההרגלים שלי" },
      state.habits.map((x) => h("button", {
        class: "chip", type: "button", role: "tab", "aria-current": x.id === state.id ? "true" : "false",
        onclick: () => { choose(x.id); render(); },
      }, h("span", null, x.name))),
      h("button", { class: "chip", type: "button", onclick: () => habitSheet() }, icon("plus"), "הרגל חדש"));
  }

  function hero(habit) {
    const num = h("b"), unitEl = h("span"), clock = h("div", { class: "clock", "aria-hidden": "true" });
    const goal = h("span"), left = h("span"), fill = h("i");
    const defs = [
      { label: "שיא", get: (f) => span(f.best) },
      { label: "חשקים שעברו", get: (f) => String(f.cravings) },
    ];
    if (Number(habit.cost_per_day) > 0) defs.push({ label: "חסכת", get: (f) => money(f.saved) });
    if (Number(habit.units_per_day) > 0) {
      defs.push({ label: (habit.unit_label || "יחידות") + " שלא נצרכו", get: (f) => Math.round(f.avoided).toLocaleString("he-IL") });
    }
    const stats = defs.map((d) => ({ get: d.get, value: h("b"), el: h("div", { class: "stat" }) }));
    stats.forEach((s, i) => { s.el.append(s.value, h("small", null, defs[i].label)); });

    const reached = STEPS.filter((s) => s[1] <= figures(habit, Date.now()).since).length;
    live = { num, unit: unitEl, clock, goal, left, fill, stats, reached, list: null };
    return h("section", { class: "hero", "aria-label": "הספירה" },
      h("div", { class: "hero-name" }, "בלי " + habit.name),
      h("button", { class: "edit", type: "button", "aria-label": "עריכה", onclick: () => habitSheet(habit) }, icon("pencil")),
      h("div", { class: "days" }, num, unitEl),
      clock,
      h("div", { class: "next" }, h("div", { class: "next-line" }, goal, left), h("div", { class: "bar" }, fill)),
      h("div", { class: "stats" + (stats.length === 4 ? " four" : "") }, stats.map((s) => s.el)));
  }

  function actions(habit) {
    return h("div", { class: "actions" },
      h("button", { class: "btn primary", type: "button", onclick: () => cravingSheet(habit) }, icon("wind"), "יש לי חשק"),
      h("button", { class: "btn slip", type: "button", onclick: () => slipSheet(habit) }, "החלקה"));
  }

  function tabs() {
    const tab = (key, text) => h("button", {
      class: "tab", type: "button", role: "tab", "aria-selected": state.tab === key ? "true" : "false",
      onclick: () => { state.tab = key; render(); },
    }, text);
    return h("div", { class: "tabs", role: "tablist" }, tab("steps", "אבני דרך"), tab("history", "היסטוריה"));
  }

  function list(habit) {
    const box = h("div", { class: "scroll", role: "tabpanel" });
    const f = figures(habit, Date.now());
    if (state.tab === "steps") {
      STEPS.forEach((s) => {
        const done = s[1] <= f.since;
        box.appendChild(h("div", { class: "row" + (done ? "" : " off") },
          h("span", { class: "dot" + (done ? " on" : "") }, done ? icon("check") : null),
          h("div", { class: "main" }, h("b", null, s[0] + " בלי " + habit.name)),
          h("span", { class: "side" }, done ? "הושג" : "עוד " + span(s[1] - f.since))));
      });
    } else {
      eventsOf(habit).forEach((e) => {
        const slip = e.kind === "slip";
        box.appendChild(h("div", { class: "row" },
          h("span", { class: "dot " + (slip ? "slip" : "hold") }, icon(slip ? "slip" : "wind")),
          h("div", { class: "main" }, h("b", null, slip ? "החלקה" : "חשק שעבר"), e.note ? h("small", null, e.note) : null),
          h("span", { class: "side" }, when(e.at))));
      });
      box.appendChild(h("div", { class: "row" },
        h("span", { class: "dot on" }, icon("flag")),
        h("div", { class: "main" }, h("b", null, "ההתחלה")),
        h("span", { class: "side" }, when(habit.quit_at))));
    }
    return box;
  }

  function render() {
    clearInterval(ticker);
    live = null;
    const habit = current();
    const wrap = h("div", { class: "wrap" }, top());
    if (!habit) {
      wrap.appendChild(h("div", { class: "center" }, h("div", { class: "card" },
        h("span", { class: "mark" }, icon("leaf")),
        h("h1", null, "מה מפסיקים?"),
        h("p", null, "אפשר להתחיל מהרגל אחד. הספירה מתחילה מהרגע שבחרת."),
        h("div", { class: "ideas" }, ["עישון", "אלכוהול", "סוכר", "קפה", "רשתות חברתיות", "הימורים"].map((n) =>
          h("button", { class: "chip", type: "button", onclick: () => habitSheet(null, n) }, n))),
        h("button", { class: "btn primary", type: "button", onclick: () => habitSheet() }, icon("plus"), "הרגל חדש"))));
    } else {
      wrap.append(chips(), hero(habit), actions(habit), tabs());
      const body = list(habit);
      wrap.appendChild(body);
    }
    root.textContent = "";
    root.appendChild(wrap);
    if (live) { live.list = wrap.lastChild; start(); }
  }

  /* --- signed out, loading, failed ------------------------------------------------------------------------ */
  function centered(...card) {
    clearInterval(ticker);
    live = null;
    root.textContent = "";
    root.appendChild(h("div", { class: "wrap" }, h("div", { class: "center" }, h("div", { class: "card" }, card))));
  }
  function login() {
    centered(
      h("span", { class: "mark" }, icon("leaf")),
      h("h1", null, "quit"),
      h("p", null, "להפסיק הרגל, יום אחרי יום. כמה זמן עבר, כמה חסכת, ומה עושים ברגע שיש חשק."),
      h("button", { class: "btn primary", type: "button", onclick: () => A.signIn(location.origin + BASE) }, "התחברות עם Google"));
  }
  function boot() {
    root.textContent = "";
    root.appendChild(h("div", { class: "wrap" }, h("div", { class: "center" }, h("div", { class: "spin", role: "status", "aria-label": "טוען" }))));
    load().then(render).catch((e) => {
      if (e && e.signedOut) { login(); return; }
      centered(
        h("h1", null, "לא הצלחנו לטעון"),
        h("p", null, "אולי אין חיבור, או שפג תוקף ההתחברות."),
        h("button", { class: "btn primary", type: "button", onclick: boot }, "לנסות שוב"),
        h("button", { class: "btn quiet", type: "button", onclick: () => { A.signOut().then(login); } }, "התחברות מחדש"));
    });
  }

  /* --- sheets ------------------------------------------------------------------------------------------------- */
  function field(label, input) { return h("label", { class: "field" }, h("span", null, label), input); }

  function habitSheet(habit, presetName) {
    const editing = !!habit;
    const name = h("input", { type: "text", maxlength: "60", value: habit ? habit.name : presetName || "", placeholder: "למשל: עישון" });
    const at = h("input", { type: "datetime-local", value: localInput(habit ? habit.quit_at : Date.now()), max: localInput(Date.now()) });
    const cost = h("input", { type: "number", min: "0", step: "any", inputmode: "decimal", value: habit && Number(habit.cost_per_day) ? habit.cost_per_day : "", placeholder: "לא חובה" });
    const per = h("input", { type: "number", min: "0", step: "any", inputmode: "decimal", value: habit && Number(habit.units_per_day) ? habit.units_per_day : "", placeholder: "לא חובה" });
    const label = h("input", { type: "text", maxlength: "30", value: habit ? habit.unit_label : "", placeholder: "למשל: סיגריות" });
    const reason = h("textarea", { maxlength: "500", placeholder: "זה מה שיופיע ברגע שיש חשק" });
    reason.value = habit ? habit.reason : "";
    const err = h("p", { class: "err", role: "alert" });
    const save = h("button", { class: "btn primary", type: "button" }, "שמירה");
    let armed = false;
    const remove = editing ? h("button", { class: "btn quiet", type: "button" }, "מחיקת ההרגל") : null;

    const s = sheet(
      h("h2", null, editing ? "עריכת הרגל" : "הרגל חדש"),
      h("p", { class: "lead" }, "מה מפסיקים, ומאיזה רגע."),
      field("מה מפסיקים?", name),
      field("מאיזה רגע", at),
      h("div", { class: "pair" }, field("כמה זה עלה ביום (₪)", cost), field("כמה ביום", per)),
      field("איך קוראים ליחידה", label),
      field("למה התחלתי", reason),
      err,
      h("div", { class: "btns" }, save, h("button", { class: "btn", type: "button", onclick: () => s.close() }, "ביטול")),
      remove);

    save.onclick = () => {
      const when_ = new Date(at.value);
      if (!name.value.trim()) { err.textContent = "צריך שם להרגל"; name.focus(); return; }
      if (isNaN(+when_)) { err.textContent = "צריך לבחור תאריך ושעה"; return; }
      if (+when_ > Date.now() + MIN) { err.textContent = "אי אפשר להתחיל בעתיד"; return; }
      const row = {
        name: name.value.trim(),
        quit_at: when_.toISOString(),
        cost_per_day: Math.max(0, Number(cost.value) || 0),
        units_per_day: Math.max(0, Number(per.value) || 0),
        unit_label: label.value.trim(),
        reason: reason.value.trim(),
      };
      save.disabled = true;
      err.textContent = "";
      const call = editing
        ? A.api("/rest/v1/quit_habits?id=eq." + habit.id, { method: "PATCH", json: row, prefer: "return=representation" })
        : A.api("/rest/v1/quit_habits", { method: "POST", json: row, prefer: "return=representation" });
      call.then((got) => {
        const saved = got && got[0];
        if (!saved) throw new Error("nothing saved");
        if (editing) state.habits = state.habits.map((x) => (x.id === saved.id ? saved : x));
        else state.habits.push(saved);
        choose(saved.id);
        s.close();
        render();
        if (!editing) toast("מתחילים. הספירה רצה");
      }).catch((e) => {
        save.disabled = false;
        if (e && e.signedOut) { s.close(); login(); return; }
        err.textContent = "לא הצלחנו לשמור. אפשר לנסות שוב";
      });
    };

    if (remove) {
      remove.onclick = () => {
        if (!armed) { armed = true; remove.textContent = "בטוח? לחיצה נוספת תמחק גם את ההיסטוריה"; remove.style.color = "var(--bad)"; return; }
        remove.disabled = true;
        A.api("/rest/v1/quit_habits?id=eq." + habit.id, { method: "DELETE" }).then(() => {
          state.habits = state.habits.filter((x) => x.id !== habit.id);
          state.events = state.events.filter((e) => e.habit_id !== habit.id);
          state.id = state.habits.length ? state.habits[0].id : null;
          s.close();
          render();
        }).catch((e) => { remove.disabled = false; if (e && e.signedOut) { s.close(); login(); } else err.textContent = "לא הצלחנו למחוק. אפשר לנסות שוב"; });
      };
    }
  }

  function record(habit, kind, note) {
    return A.api("/rest/v1/quit_events", { method: "POST", json: { habit_id: habit.id, kind, note: note || "" }, prefer: "return=representation" })
      .then((got) => {
        if (!got || !got[0]) throw new Error("nothing saved");
        state.events.unshift(got[0]);
      });
  }

  function cravingSheet(habit) {
    const end = Date.now() + 5 * MIN;
    const timer = h("div", { class: "timer", "aria-live": "off" }, "5:00");
    const note = h("p", { class: "timer-note" }, "נשימה איטית עוזרת: ארבע שניות פנימה, שש החוצה.");
    const did = h("button", { class: "btn primary", type: "button" }, icon("check"), "עברתי את זה");
    const s = sheet(
      h("h2", null, "יש חשק? זה בסדר"),
      h("p", { class: "lead" }, "חשק הוא גל: הוא עולה, מגיע לשיא ושוכך, בדרך כלל תוך כמה דקות. כדאי לתת לו לעבור."),
      habit.reason ? h("div", { class: "why" }, h("small", null, "למה התחלתי"), habit.reason) : null,
      timer, note,
      h("div", { class: "btns" }, did, h("button", { class: "btn", type: "button", onclick: () => s.close() }, "סגירה")));
    const tick = setInterval(() => {
      const left = Math.max(0, end - Date.now());
      timer.textContent = Math.floor(left / MIN) + ":" + pad(Math.floor((left % MIN) / 1000));
      if (!left) { note.textContent = "עברו חמש דקות. החשק בדרך כלל כבר חלש יותר."; clearInterval(tick); }
    }, 250);
    s.scrim.onclose = () => clearInterval(tick);
    did.onclick = () => {
      did.disabled = true;
      record(habit, "craving").then(() => { s.close(); render(); toast("נרשם. עוד חשק שעבר"); })
        .catch((e) => { did.disabled = false; if (e && e.signedOut) { s.close(); } failed(e); });
    };
  }

  function slipSheet(habit) {
    const note = h("textarea", { maxlength: "500", placeholder: "לא חובה. אולי יעזור להבין מה קרה" });
    const go = h("button", { class: "btn danger", type: "button" }, "רישום החלקה");
    const s = sheet(
      h("h2", null, "החלקה קורית"),
      h("p", { class: "lead" }, "היא לא מוחקת את מה שעשית עד עכשיו. השיא נשמר, והספירה מתחילה מחדש."),
      field("מה קרה?", note),
      h("div", { class: "btns" }, go, h("button", { class: "btn", type: "button", onclick: () => s.close() }, "ביטול")));
    go.onclick = () => {
      go.disabled = true;
      record(habit, "slip", note.value.trim()).then(() => { s.close(); render(); toast("נרשם. מתחילים שוב"); })
        .catch((e) => { go.disabled = false; if (e && e.signedOut) { s.close(); } failed(e); });
    };
  }

  /* --- start ------------------------------------------------------------------------------------------------------- */
  if (!A || !A.signedIn()) login();
  else boot();
})();
