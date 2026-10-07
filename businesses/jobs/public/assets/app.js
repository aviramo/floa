/* ==========================================================================
   Jobs.

   An app, not a page: a menu on the side that holds every agent, and beside it
   one of three places to be: the overview, the connections to the job sites,
   or an agent (its jobs, and its settings). Moving between agents is one press
   on the menu, and the address bar never changes: the history is kept in the
   page's own state, so Back still goes back.

   What the person sees is a RADAR, because a radius is already what this app
   is about: an agent is a sweep, a good match is a blip, a score is a signal.

   No dependencies. Supabase is spoken to over REST. Nothing from a job site is
   ever written into the page as markup: it goes in as text.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.JOBS_CONFIG;
  var SESSION_KEY = "jobs.session";
  var root = document.getElementById("app");

  /* --- small things -------------------------------------------------------- */
  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function sameDay(iso) { return iso ? new Date(iso).toLocaleDateString("he-IL") : ""; }

  var ICONS = {
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 12l6-6"/>',
    home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 0 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    send: '<path d="M21 3L3 11l7 3 3 7z"/>',
    out: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>',
  };
  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>"; }

  var toastTimer = null;
  function toast(text) {
    var box = document.getElementById("toast");
    if (!box) { box = el('<div class="toast" id="toast" role="status"><span></span></div>'); document.body.appendChild(box); }
    box.firstChild.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 2600);
  }

  /* --- the session -------------------------------------------------------- */
  var session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch (e) { /* private window */ }

  function keep(next) {
    session = next;
    try {
      if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private window */ }
  }
  function userId() {
    try {
      var part = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(part)).sub;
    } catch (e) { return ""; }
  }
  /* Back from Google the session is in the fragment: take it and clean the bar. */
  function takeFragment() {
    if (location.hash.indexOf("#access_token") === 0) {
      var got = new URLSearchParams(location.hash.slice(1));
      keep({
        access_token: got.get("access_token"),
        refresh_token: got.get("refresh_token") || "",
        expires_at: Date.now() + Number(got.get("expires_in") || 3600) * 1000,
      });
      history.replaceState(null, "", location.pathname);
    }
  }
  function token() {
    if (!session) return Promise.reject(new Error("signed out"));
    if (session.expires_at - Date.now() > 60000) return Promise.resolve(session.access_token);
    return fetch(CFG.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: CFG.supabaseAnonKey, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    }).then(function (r) {
      if (!r.ok) { keep(null); throw new Error("signed out"); }
      return r.json();
    }).then(function (d) {
      keep({
        access_token: d.access_token,
        refresh_token: d.refresh_token || session.refresh_token,
        expires_at: Date.now() + (d.expires_in || 3600) * 1000,
      });
      return session.access_token;
    });
  }
  function api(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      opts.headers = Object.assign({ apikey: CFG.supabaseAnonKey, authorization: "Bearer " + t }, opts.headers || {});
      return fetch(CFG.supabaseUrl + path, opts);
    }).then(function (r) {
      if (!r.ok) throw new Error("request failed " + r.status);
      return r.status === 204 ? null : r.json().catch(function () { return null; });
    });
  }
  var AGENTS = "/rest/v1/" + CFG.agentsTable;
  var JSON_HEADERS = { "content-type": "application/json", prefer: "return=representation" };

  /* --- what the app knows ---------------------------------------------------- */
  var state = { agents: [], apps: [], conns: {}, runs: {}, route: { name: "overview" } };
  var catalog = null, cityList = null, roleIndex = null;
  var page = null; // the open place: { update() }
  var poller = null;

  var SITES = [
    { key: "alljobs", name: "AllJobs", about: "חיפוש והגשה של קורות חיים." },
    { key: "drushim", name: "דרושים", about: "חיפוש והגשה של קורות חיים." },
    { key: "linkedin", name: "LinkedIn", about: "אפשר להתחבר, אבל חיפוש והגשה בו עדיין לא נתמכים." },
  ];
  var SOURCE_NAME = { alljobs: "AllJobs", drushim: "דרושים", linkedin: "LinkedIn" };
  var HIGH = 70;

  function load() {
    return Promise.all([
      api(AGENTS + "?select=*&order=created_at.asc"),
      api("/rest/v1/job_applications?select=id,agent_id,source,url,title,company,location,score,reason,status,note,created_at,sent_at&order=score.desc,created_at.desc&limit=1000"),
      api("/rest/v1/job_connections?select=*"),
      api("/rest/v1/job_runs?select=*&order=created_at.desc&limit=60"),
    ]).then(function (r) {
      state.agents = r[0];
      state.apps = r[1];
      state.conns = {};
      r[2].forEach(function (c) { state.conns[c.site] = c; });
      state.runs = {};
      r[3].forEach(function (run) { if (!state.runs[run.agent_id]) state.runs[run.agent_id] = run; });
    });
  }
  function connStatus(site) { return state.conns[site] ? state.conns[site].status : "disconnected"; }
  function appsOf(id) { return state.apps.filter(function (a) { return a.agent_id === id; }); }
  function agentById(id) { return state.agents.filter(function (a) { return a.id === id; })[0]; }
  function busy() {
    return Object.keys(state.conns).some(function (k) { return /^(requested|connecting)$/.test(state.conns[k].status); }) ||
      Object.keys(state.runs).some(function (k) { return /^(requested|running)$/.test(state.runs[k].status); }) ||
      state.apps.some(function (a) { return a.status === "queued"; });
  }

  /* Poll only while something is in flight on the runner, and catch up the
     moment a tab that was in the background comes back. */
  function tick() {
    return load().then(function () { renderNav(); if (page && page.update) page.update(); ensurePoll(); }).catch(function () { /* next tick */ });
  }
  function ensurePoll() {
    if (busy() && !poller) poller = setInterval(tick, 3500);
    if (!busy() && poller) { clearInterval(poller); poller = null; }
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && session) tick(); });

  /* --- radar drawings ---------------------------------------------------------- */
  /* A mini radar: one blip for every strong match, placed on a fixed spiral so
     the same agent always looks the same. */
  function radarGlyph(blips) {
    var s = '<svg class="radar" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30"/><circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="10"/><path d="M32 2v60M2 32h60" class="cross"/>';
    for (var i = 0; i < Math.min(blips, 9); i++) {
      var ang = i * 2.399963 + 0.6;
      var rad = 8 + ((i * 0.38) % 1) * 20;
      s += '<circle class="blip" cx="' + (32 + Math.cos(ang) * rad).toFixed(1) + '" cy="' + (32 + Math.sin(ang) * rad).toFixed(1) + '" r="2.6"/>';
    }
    return s + "</svg>";
  }
  /* The radius, drawn: rings for scale and a lit disc for how far this agent looks. */
  function radiusDrawing(km, city) {
    var r = 14 + (Math.min(km, 150) / 150) * 76;
    return '<svg class="radius-art" viewBox="0 0 200 200" aria-hidden="true">' +
      '<circle cx="100" cy="100" r="90" class="ring-bg"/><circle cx="100" cy="100" r="60" class="ring-bg"/><circle cx="100" cy="100" r="30" class="ring-bg"/>' +
      '<path d="M100 8v184M8 100h184" class="cross"/>' +
      '<circle cx="100" cy="100" r="' + r.toFixed(1) + '" class="reach"/>' +
      '<circle cx="100" cy="100" r="5" class="core"/></svg>';
  }

  /* --- shell ------------------------------------------------------------------------ */
  var shell, view, navBox, topTitle;

  function buildShell() {
    root.innerHTML = "";
    shell = el('<div class="shell" id="shell">' +
      '<aside class="side">' +
        '<div class="brand"><span class="brand-mark">' + icon("radar") + "</span>משרות</div>" +
        '<nav class="nav" id="nav" aria-label="ניווט ראשי"></nav>' +
        '<div class="side-foot"><button class="nav-item" id="logout">' + icon("out") + '<span class="label">התנתקות</span></button></div>' +
      "</aside>" +
      '<div class="scrim" id="scrim"></div>' +
      '<div class="page">' +
        '<div class="topbar"><button class="btn ghost sm" id="menu" aria-label="תפריט">' + icon("menu") + '</button><span class="grow" id="toptitle"></span></div>' +
        '<div class="page-in" id="view"></div>' +
      "</div></div>");
    root.appendChild(shell);
    view = shell.querySelector("#view");
    navBox = shell.querySelector("#nav");
    topTitle = shell.querySelector("#toptitle");
    shell.querySelector("#menu").onclick = function () { shell.classList.toggle("open"); };
    shell.querySelector("#scrim").onclick = function () { shell.classList.remove("open"); };
    shell.querySelector("#logout").onclick = function () { keep(null); location.reload(); };
  }

  function go(route, replace) {
    state.route = route;
    try { history[replace ? "replaceState" : "pushState"]({ route: route }, "", location.pathname); } catch (e) { /* sandboxed */ }
    shell.classList.remove("open");
    render();
    window.scrollTo(0, 0);
  }
  window.addEventListener("popstate", function (e) {
    state.route = (e.state && e.state.route) || { name: "overview" };
    if (shell) render();
  });

  function renderNav() {
    if (!navBox) return;
    var r = state.route;
    var connected = SITES.filter(function (s) { return connStatus(s.key) === "connected"; }).length;
    var html = "";
    html += '<button class="nav-item" data-go="overview"' + (r.name === "overview" ? ' aria-current="page"' : "") + ">" + icon("home") + '<span class="label">סקירה</span></button>';
    html += '<button class="nav-item" data-go="connections"' + (r.name === "connections" ? ' aria-current="page"' : "") + ">" + icon("link") +
      '<span class="label">חיבורים</span><span class="count">' + connected + "/" + SITES.length + "</span></button>";
    html += '<div class="nav-group"><span>הסוכנים שלי</span><button id="nav-new" aria-label="סוכן חדש">' + icon("plus") + "</button></div>";
    state.agents.forEach(function (a) {
      var hi = appsOf(a.id).filter(function (x) { return x.status === "scored" && x.score >= HIGH; }).length;
      html += '<button class="nav-item nav-agent" data-agent="' + a.id + '"' + (r.name === "agent" && r.id === a.id ? ' aria-current="page"' : "") + ">" +
        '<span class="dotc' + (hi ? " hi" : "") + '"></span><span class="label">' + esc(a.name) + "</span>" + (hi ? '<span class="count">' + hi + "</span>" : "") + "</button>";
    });
    if (!state.agents.length) html += '<p class="nav-empty">עוד אין סוכנים</p>';
    navBox.innerHTML = html;
    Array.prototype.forEach.call(navBox.querySelectorAll("[data-go]"), function (b) {
      b.onclick = function () { go({ name: b.getAttribute("data-go") }); };
    });
    Array.prototype.forEach.call(navBox.querySelectorAll("[data-agent]"), function (b) {
      b.onclick = function () { go({ name: "agent", id: b.getAttribute("data-agent") }); };
    });
    navBox.querySelector("#nav-new").onclick = newAgent;
  }

  function newAgent() {
    api(AGENTS, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) })
      .then(function (rows) {
        state.agents.push(rows[0]);
        go({ name: "agent", id: rows[0].id, tab: "settings" });
      }).catch(function () { toast("לא הצלחנו ליצור סוכן."); });
  }

  function render() {
    renderNav();
    page = null;
    view.innerHTML = "";
    var r = state.route;
    if (r.name === "connections") { topTitle.textContent = "חיבורים"; page = connectionsPage(); }
    else if (r.name === "agent" && agentById(r.id)) { topTitle.textContent = agentById(r.id).name; page = agentPage(agentById(r.id), r.tab); }
    else { state.route = { name: "overview" }; topTitle.textContent = "סקירה"; page = overviewPage(); }
    ensurePoll();
  }

  /* --- overview ------------------------------------------------------------------------ */
  function overviewPage() {
    var box = el("<div></div>");
    view.appendChild(box);

    function draw() {
      var found = state.apps.length;
      var strong = state.apps.filter(function (a) { return a.status === "scored" && a.score >= HIGH; }).length;
      var sent = state.apps.filter(function (a) { return a.status === "sent"; }).length;
      var open = SITES.filter(function (s) { return s.key !== "linkedin" && connStatus(s.key) !== "connected"; });

      var html = '<div class="page-head"><div><h1>סקירה</h1><p class="sub">מה הסוכנים שלך מצאו, ומה כבר יצא.</p></div>' +
        '<button class="btn primary" id="new">' + icon("plus") + "סוכן חדש</button></div>";

      if (state.agents.length) {
        html += '<div class="figures">' +
          fig(state.agents.length, "סוכנים") + fig(found, "משרות שנמצאו") + fig(strong, "התאמות גבוהות מחכות", "hi") + fig(sent, "נשלחו") + "</div>";
      }
      if (open.length) {
        html += '<div class="callout"><div class="grow"><b>חסר חיבור</b><br><span class="muted small">' +
          esc(open.map(function (s) { return s.name; }).join(" ו")) + ' לא מחובר, ובלי זה אי אפשר להגיש.</span></div>' +
          '<button class="btn sm" data-go="connections">לחיבורים</button></div>';
      }
      html += '<div class="section"><div class="section-head"><h2>הסוכנים שלי</h2></div>';
      if (!state.agents.length) {
        html += '<div class="empty"><div class="empty-radar">' + radarGlyph(5) + "</div><h2>הסוכן הראשון שלך</h2>" +
          '<p>מעלים קורות חיים, בוחרים תפקיד ועיר, והסוכן סורק משרות ומדרג אותן לפי ההתאמה אליך.</p>' +
          '<button class="btn primary" id="new2">' + icon("plus") + "צור סוכן</button></div>";
      } else {
        html += '<div class="grid">' + state.agents.map(agentCard).join("") + "</div>";
      }
      html += "</div>";
      box.innerHTML = html;

      var n1 = box.querySelector("#new"), n2 = box.querySelector("#new2");
      if (n1) n1.onclick = newAgent;
      if (n2) n2.onclick = newAgent;
      Array.prototype.forEach.call(box.querySelectorAll("[data-go]"), function (b) { b.onclick = function () { go({ name: b.getAttribute("data-go") }); }; });
      Array.prototype.forEach.call(box.querySelectorAll("[data-agent]"), function (b) {
        b.onclick = function () { go({ name: "agent", id: b.getAttribute("data-agent") }); };
      });
    }
    function fig(n, label, tone) { return '<div class="figure' + (tone ? " " + tone : "") + '"><b>' + n + "</b><span>" + label + "</span></div>"; }

    function agentCard(a) {
      var mine = appsOf(a.id);
      var strong = mine.filter(function (x) { return x.score >= HIGH; }).length;
      var sent = mine.filter(function (x) { return x.status === "sent"; }).length;
      var best = mine.reduce(function (m, x) { return Math.max(m, x.score); }, 0);
      var run = state.runs[a.id];
      var live = run && /^(requested|running)$/.test(run.status);
      return '<button class="agent" data-agent="' + a.id + '">' +
        '<div class="agent-top"><div class="radar-wrap' + (live ? " sweeping" : "") + '">' + radarGlyph(strong) + "</div>" +
        '<div class="grow"><div class="agent-name">' + esc(a.name) + '</div><div class="agent-meta">' +
        (a.city ? icon("pin") + esc(a.city) + " · " + a.radius_km + " ק״מ" : "עוד לא נבחרה עיר") + "</div></div></div>" +
        '<div class="chips">' + (a.roles.length ? a.roles.slice(0, 3).map(function (r) { return '<span class="chip">' + esc(r) + "</span>"; }).join("") +
          (a.roles.length > 3 ? '<span class="chip plain">+' + (a.roles.length - 3) + "</span>" : "") : '<span class="chip plain">אין תפקידים</span>') + "</div>" +
        '<div class="stats"><div class="stat"><b>' + mine.length + "</b><span>נמצאו</span></div>" +
        '<div class="stat"><b>' + best + "</b><span>ציון מוביל</span></div>" +
        '<div class="stat"><b>' + sent + "</b><span>נשלחו</span></div></div></button>";
    }
    draw();
    return { update: draw };
  }

  /* --- connections ------------------------------------------------------------------- */
  var CONN = {
    connected: ["on", "מחובר"],
    requested: ["wait", "ממתין לסורק"],
    connecting: ["wait", "החלון פתוח, התחבר בו"],
    expired: ["off", "פג תוקף"],
    disconnected: ["", "לא מחובר"],
  };

  function connectionsPage() {
    var box = el("<div></div>");
    view.appendChild(box);
    function draw() {
      var waiting = SITES.some(function (s) { return connStatus(s.key) === "requested"; });
      var html = '<div class="page-head"><div><h1>חיבורים</h1><p class="sub">מתחברים פעם אחת לכל אתר, וכל הסוכנים משתמשים באותו חיבור. את הסיסמה מקלידים באתר עצמו.</p></div></div><div class="tiles">';
      SITES.forEach(function (s) {
        var st = connStatus(s.key), c = state.conns[s.key], look = CONN[st];
        html += '<div class="tile"><div class="tile-top"><span class="tile-name">' + s.name + '</span><span class="state ' + look[0] + '"><i class="dot"></i>' + look[1] + "</span></div>" +
          '<p class="muted small">' + esc(s.about) + (c && c.note ? " " + esc(c.note) + "." : "") + "</p>" +
          '<button class="btn' + (st === "connected" ? "" : " primary") + '" data-site="' + s.key + '"' + (/^(requested|connecting)$/.test(st) ? " disabled" : "") + ">" +
          (st === "connected" ? "התחבר מחדש" : "התחבר") + "</button></div>";
      });
      html += "</div>";
      if (waiting) html += '<div class="hint">הבקשה ממתינה לסורק שרץ על המחשב שלך. אם לא נפתח חלון, הרץ <b dir="ltr">npm start</b> בתיקיית <b dir="ltr">businesses/jobs/runner</b>.</div>';
      html += '<p class="muted small" style="margin-top:20px">לחיצה על "התחבר" פותחת חלון Chrome במחשב שלך. אחרי שמתחברים באתר, החלון נסגר לבד.</p>';
      box.innerHTML = html;
      Array.prototype.forEach.call(box.querySelectorAll("[data-site]"), function (b) {
        b.onclick = function () {
          b.disabled = true;
          api("/rest/v1/job_connections?on_conflict=owner,site", {
            method: "POST",
            headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({ site: b.getAttribute("data-site"), status: "requested", note: "", updated_at: new Date().toISOString() }),
          }).then(tick).catch(function () { b.disabled = false; toast("לא הצלחנו לבקש חיבור."); });
        };
      });
    }
    draw();
    return { update: draw };
  }

  /* --- finding a role from a few words --------------------------------------------------- */
  function norm(s) {
    return String(s).toLowerCase().replace(/\s*\/\s*(ת|ה|ית|ות|ים)(?![א-ת])/g, "").replace(/["'״׳.,()\-–\/]/g, " ").replace(/\s+/g, " ").trim();
  }
  function near(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++miss > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1;
  }
  function buildIndex(c) {
    var by = {};
    c.fields.forEach(function (f) {
      f.roles.forEach(function (r) {
        var e = by[r.name] || (by[r.name] = { name: r.name, fields: [], tokens: norm(r.name).split(" ") });
        e.fields.push(f.field);
      });
    });
    return Object.keys(by).map(function (k) {
      var e = by[k];
      e.field = e.fields[0];
      e.ftext = norm(e.fields.join(" "));
      return e;
    });
  }
  function findRoles(index, text) {
    var qs = norm(text).split(" ").filter(Boolean);
    if (!qs.length) return [];
    var out = [];
    index.forEach(function (e) {
      var total = 0, hit = 0;
      qs.forEach(function (qt) {
        var best = 0;
        e.tokens.forEach(function (t) {
          var s = t === qt ? 3 : t.indexOf(qt) === 0 ? 2.5 : qt.length > 1 && t.indexOf(qt) > 0 ? 2 : qt.length > 3 && near(t, qt) ? 1.5 : 0;
          if (s > best) best = s;
        });
        if (!best && qt.length > 1 && e.ftext.indexOf(qt) >= 0) best = 0.8;
        if (best) hit++;
        total += best;
      });
      if (hit * 2 >= qs.length && hit) out.push({ name: e.name, field: e.field, score: total / qs.length + hit / qs.length });
    });
    out.sort(function (x, y) { return y.score - x.score || x.name.length - y.name.length; });
    return out.slice(0, 12);
  }
  function loadCatalog() {
    return catalog ? Promise.resolve(catalog) : fetch(CFG.rolesFile).then(function (r) {
      if (!r.ok) throw new Error("roles");
      return r.json();
    }).then(function (c) { catalog = c; roleIndex = buildIndex(c); return c; });
  }
  function loadCities() {
    return cityList ? Promise.resolve(cityList) : fetch(CFG.citiesFile).then(function (r) { return r.json(); }).then(function (c) { cityList = c.cities; return cityList; });
  }
  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /* --- an agent -------------------------------------------------------------------------- */
  function agentPage(a, startTab) {
    var tab = startTab || (appsOf(a.id).length ? "jobs" : "settings");
    var filter = "all";
    var chosen = new Set(a.roles);
    var picked = new Set();
    var saveTimer = null;

    var box = el('<div>' +
      '<div class="page-head"><div class="grow">' +
        '<input class="title-input" id="name" aria-label="שם הסוכן" maxlength="60">' +
        '<p class="sub" id="summary"></p></div>' +
        '<div class="head-actions"><span class="saved" id="saved"></span>' +
        '<button class="btn primary" id="scan">' + icon("radar") + "שלח משרות</button></div></div>" +
      '<div id="banner"></div>' +
      '<div class="tabs" role="tablist"><button class="tab" role="tab" id="t-jobs">משרות <span class="count" id="n-jobs"></span></button>' +
      '<button class="tab" role="tab" id="t-settings">' + icon("gear") + "הגדרות</button></div>" +
      '<div id="pane"></div></div>');
    view.appendChild(box);
    var nameIn = box.querySelector("#name");
    nameIn.value = a.name;

    /* --- saving: quietly, as the person goes --- */
    function saved(text) { box.querySelector("#saved").textContent = text || ""; }
    function patch(extra) {
      saved("שומר…");
      return api(AGENTS + "?id=eq." + a.id, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(extra) })
        .then(function (rows) {
          Object.assign(a, rows[0]);
          var i = state.agents.map(function (x) { return x.id; }).indexOf(a.id);
          if (i >= 0) state.agents[i] = a;
          saved("נשמר ✓");
          renderNav();
          summary();
          return a;
        }).catch(function () { saved("השמירה נכשלה"); });
    }
    function later(extra) { clearTimeout(saveTimer); saveTimer = setTimeout(function () { patch(extra); }, 700); }
    function summary() {
      box.querySelector("#summary").textContent =
        (a.roles.length ? a.roles.slice(0, 2).join(", ") + (a.roles.length > 2 ? " ועוד " + (a.roles.length - 2) : "") : "עוד לא נבחרו תפקידים") +
        (a.city ? " · " + a.city + ", " + a.radius_km + " ק״מ" : "");
      topTitle.textContent = a.name;
    }
    summary();
    nameIn.oninput = function () { later({ name: nameIn.value.trim() || "סוכן חדש" }); };

    /* --- the scan --- */
    box.querySelector("#scan").onclick = function () {
      if (!a.roles.length) { toast("בחר לפחות תפקיד אחד."); setTab("settings"); return; }
      if (!a.city) { toast("בחר עיר."); setTab("settings"); return; }
      api("/rest/v1/job_runs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ agent_id: a.id }) })
        .then(function () { setTab("jobs"); return tick(); })
        .catch(function () { toast("לא הצלחנו להתחיל סריקה."); });
    };

    function banner() {
      var run = state.runs[a.id], b = box.querySelector("#banner");
      if (!run) { b.innerHTML = ""; return; }
      if (run.status === "requested") {
        b.innerHTML = '<div class="banner"><span class="sweep"></span><span class="grow">הסריקה ממתינה לסורק שרץ על המחשב שלך. אם לא קורה כלום, הרץ <b dir="ltr">npm start</b> בתיקיית <b dir="ltr">businesses/jobs/runner</b>.</span></div>';
      } else if (run.status === "running") {
        b.innerHTML = '<div class="banner"><span class="sweep"></span><span class="grow">סורק את אתרי הדרושים…</span></div>';
      } else if (run.status === "failed") {
        b.innerHTML = '<div class="banner bad"><span class="grow">הסריקה האחרונה נכשלה: ' + esc(run.note) + "</span></div>";
      } else {
        b.innerHTML = '<div class="banner good"><span class="grow">הסריקה האחרונה: ' + esc(run.note) + " · " + sameDay(run.finished_at || run.created_at) + "</span></div>";
      }
    }

    /* --- tabs --- */
    var pane = box.querySelector("#pane");
    var jobsUi = null;
    function setTab(t) {
      tab = t;
      ["jobs", "settings"].forEach(function (k) { box.querySelector("#t-" + k).setAttribute("aria-selected", String(k === t)); });
      pane.innerHTML = "";
      jobsUi = null;
      if (t === "jobs") jobsUi = jobsTab(); else settingsTab();
      closeBar();
    }
    box.querySelector("#t-jobs").onclick = function () { setTab("jobs"); };
    box.querySelector("#t-settings").onclick = function () { setTab("settings"); };

    /* --- the jobs --- */
    var bar = null;
    function closeBar() { if (bar) { bar.remove(); bar = null; } }

    function jobsTab() {
      var wrap = el('<div><div class="toolbar"><div class="seg" id="seg"></div><span class="grow"></span>' +
        '<button class="btn sm" id="pickhi">סמן את כל ה-' + HIGH + "+</button></div><div id=\"list\"></div></div>");
      pane.appendChild(wrap);
      var FILTERS = [["all", "הכל"], ["hi", HIGH + "+"], ["todo", "ממתינות"], ["done", "נשלחו"]];
      var seg = wrap.querySelector("#seg");
      seg.innerHTML = FILTERS.map(function (f) { return '<button data-f="' + f[0] + '" aria-pressed="' + (filter === f[0]) + '">' + f[1] + "</button>"; }).join("");
      Array.prototype.forEach.call(seg.querySelectorAll("button"), function (b) {
        b.onclick = function () { filter = b.getAttribute("data-f"); setTab("jobs"); };
      });
      wrap.querySelector("#pickhi").onclick = function () {
        appsOf(a.id).forEach(function (j) { if (j.status === "scored" && j.score >= HIGH) picked.add(j.id); });
        drawList();
      };
      drawList();
      return { draw: drawList };
    }

    function visibleJobs() {
      return appsOf(a.id).filter(function (j) {
        if (filter === "hi") return j.score >= HIGH;
        if (filter === "todo") return j.status === "scored";
        if (filter === "done") return j.status !== "scored";
        return true;
      });
    }
    var STATUS = {
      queued: ["info", "בתור לשליחה"], sent: ["good", "נשלח"], manual: ["warn", "דורש הגשה ידנית"], failed: ["bad", "נכשל"],
    };

    function drawList() {
      var list = pane.querySelector("#list");
      if (!list) return;
      box.querySelector("#n-jobs").textContent = appsOf(a.id).length;
      var jobs = visibleJobs();
      if (!jobs.length) {
        list.innerHTML = appsOf(a.id).length
          ? '<div class="empty"><p>אין משרות בסינון הזה.</p></div>'
          : '<div class="empty"><div class="empty-radar">' + radarGlyph(0) + "</div><h2>עוד לא נסרק</h2><p>לחץ על \"שלח משרות\" והסוכן יסרוק את האתרים ויחזיר משרות מדורגות.</p></div>";
        drawBar();
        return;
      }
      list.innerHTML = "";
      jobs.forEach(function (j) {
        var open = j.status === "scored";
        var tier = j.score >= 80 ? "hi" : j.score >= HIGH ? "mid" : "low";
        var st = STATUS[j.status];
        var card = el('<div class="job' + (open ? "" : " done") + (picked.has(j.id) ? " sel" : "") + '" tabindex="0" role="button">' +
          (open ? '<input type="checkbox" aria-label="סמן לשליחה">' : "") +
          '<div class="ring ' + tier + '" style="--v:' + j.score + '"><span>' + j.score + "</span></div>" +
          '<div class="job-main"><div class="job-title"></div><div class="job-meta"></div><div class="job-why"></div></div>' +
          (st ? '<span class="badge ' + st[0] + '">' + st[1] + "</span>" : "") + "</div>");
        card.querySelector(".job-title").textContent = j.title;
        var meta = card.querySelector(".job-meta");
        [j.company, j.location].filter(Boolean).forEach(function (t) { var s = document.createElement("span"); s.textContent = t; meta.appendChild(s); });
        var src = el('<span class="badge">' + esc(SOURCE_NAME[j.source] || j.source) + "</span>");
        meta.appendChild(src);
        card.querySelector(".job-why").textContent = (j.reason || "") + (j.note ? " · " + j.note : "");
        var cb = card.querySelector("input");
        if (cb) {
          cb.checked = picked.has(j.id);
          cb.onclick = function (e) { e.stopPropagation(); };
          cb.onchange = function () { cb.checked ? picked.add(j.id) : picked.delete(j.id); card.classList.toggle("sel", cb.checked); drawBar(); };
        }
        card.onclick = function () { openJob(j, function () { picked.add(j.id); drawList(); }); };
        card.onkeydown = function (e) { if (e.key === "Enter") openJob(j, function () { picked.add(j.id); drawList(); }); };
        list.appendChild(card);
      });
      drawBar();
    }

    /* The bar that sends. It says which of the chosen jobs come from a site that
       is not connected, because those will come back as "manual". */
    function drawBar() {
      var ids = Array.from(picked).filter(function (id) {
        return state.apps.some(function (x) { return x.id === id && x.status === "scored"; });
      });
      if (!ids.length) { closeBar(); return; }
      var sources = {};
      ids.forEach(function (id) { var j = state.apps.filter(function (x) { return x.id === id; })[0]; sources[j.source] = true; });
      var off = Object.keys(sources).filter(function (s) { return connStatus(s) !== "connected"; }).map(function (s) { return SOURCE_NAME[s]; });
      if (!bar) { bar = el('<div class="sendbar"><div class="sendbar-in"><div class="grow"><b id="bn"></b><div class="warn" id="bw"></div></div>' +
        '<button class="btn ghost" id="bc">ביטול</button><button class="btn primary" id="bs">' + icon("send") + "שלח את המסומנות</button></div></div>"); document.body.appendChild(bar); }
      bar.querySelector("#bn").textContent = ids.length + (ids.length === 1 ? " משרה נבחרה" : " משרות נבחרו");
      bar.querySelector("#bw").textContent = off.length ? off.join(", ") + " לא מחובר, ולכן ההגשה תחזור כ\"ידנית\"." : "";
      bar.querySelector("#bc").onclick = function () { picked.clear(); drawList(); };
      bar.querySelector("#bs").onclick = function () { sendIds(ids); };
    }
    function sendIds(ids) {
      api("/rest/v1/job_applications?id=in.(" + ids.join(",") + ")&status=eq.scored", {
        method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ status: "queued" }),
      }).then(function () {
        picked.clear();
        toast("נכנסו לתור. השליחה מתבצעת בחלון Chrome במחשב שלך.");
        return tick();
      }).catch(function () { toast("לא הצלחנו לשלוח לתור."); });
    }

    /* --- settings --- */
    function settingsTab() {
      var p = a.profile || {};
      var wrap = el('<div>' +
        '<div class="card"><div class="step"><span class="step-n">1</span><div class="step-body"><h2>קורות חיים</h2>' +
        '<p class="sub">הסוכן קורא אותם כדי להבין מה אתה יודע, ומדרג לפיהם.</p>' +
        '<label class="drop"><span class="drop-icon">' + icon("upload") + '</span><span class="grow"><b id="cvname"></b><br><span class="muted small" id="fs">PDF או תמונה. קובץ Word עדיין לא נתמך.</span></span>' +
        '<span class="btn sm">בחר קובץ</span><input type="file" id="f" accept="application/pdf,image/png,image/jpeg,image/webp"></label>' +
        '<div id="profile"></div></div></div></div>' +

        '<div class="card"><div class="step"><span class="step-n">2</span><div class="step-body"><h2>מה אני מחפש</h2>' +
        '<p class="sub">אפשר לבחור כמה תפקידים. הסוכן יחפש את כולם.</p>' +
        '<label class="field" for="q">חיפוש תפקיד</label>' +
        '<div class="search">' + icon("search") + '<input class="input" id="q" autocomplete="off" placeholder="הקלד תפקיד, כישור או תחום"></div>' +
        '<div id="roles"></div>' +
        '<div class="block" id="picked-box"><h3>נבחרו</h3><div class="chips" id="picked"></div></div>' +
        '<div class="block" id="recs-box"><h3>מומלצים לפי קורות החיים</h3><div id="recs"></div></div>' +
        '</div></div></div>' +

        '<div class="card"><div class="step"><span class="step-n">3</span><div class="step-body"><h2>איפה</h2>' +
        '<p class="sub">הסוכן ישאיר רק משרות בטווח הזה מהעיר.</p>' +
        '<div class="where"><div class="where-art" id="art"></div><div class="where-form">' +
        '<label class="field" for="c">עיר</label><input class="input" id="c" list="cities" autocomplete="off" placeholder="התחל להקליד ובחר מהרשימה"><datalist id="cities"></datalist>' +
        '<p class="small bad" id="cityerr"></p>' +
        '<label class="field" for="r" style="margin-top:14px">רדיוס</label>' +
        '<div class="range"><input type="range" id="r" min="5" max="150" step="5"><output id="rv"></output></div></div></div>' +
        "</div></div></div>" +

        '<div class="danger-zone"><span class="muted small">מחיקת הסוכן מוחקת גם את המשרות שנמצאו בשבילו.</span>' +
        '<button class="btn sm danger" id="del">מחק סוכן</button></div></div>');
      pane.appendChild(wrap);

      /* 1. the CV */
      var fs = wrap.querySelector("#fs");
      /* Skills and languages: the reader's suggestions as tags to switch off, and
         a box to add one it missed. What stays on is the person's, and is what
         scoring uses. */
      function tags(host, title, suggested, key, hint) {
        var on = new Set(a[key] || []);
        host.innerHTML = "<h3></h3><div class='chips'></div>";
        host.querySelector("h3").textContent = title;
        var chips = host.querySelector(".chips");
        function draw() {
          chips.innerHTML = "";
          var all = suggested.slice();
          Array.from(on).forEach(function (t) { if (all.indexOf(t) < 0) all.push(t); });
          all.forEach(function (t) {
            var b = el('<button type="button" class="chip tag"></button>');
            b.textContent = t;
            b.setAttribute("aria-pressed", String(on.has(t)));
            b.onclick = function () {
              on.has(t) ? on.delete(t) : on.add(t);
              var patchBody = {}; patchBody[key] = Array.from(on);
              patch(patchBody);
              draw();
            };
            chips.appendChild(b);
          });
          var add = el('<input class="tag-add" placeholder="' + esc(hint) + '" maxlength="40">');
          add.onkeydown = function (e) {
            if (e.key !== "Enter") return;
            e.preventDefault();
            var v = add.value.trim();
            if (!v) return;
            on.add(v);
            var body = {}; body[key] = Array.from(on);
            patch(body);
            draw();
            host.querySelector(".tag-add").focus();
          };
          chips.appendChild(add);
        }
        draw();
      }

      function showCv() {
        wrap.querySelector("#cvname").textContent = a.cv_name || "עוד לא הועלו קורות חיים";
        var pf = a.profile || {};
        var out = wrap.querySelector("#profile");
        if (!pf.summary && !(pf.skills || []).length) { out.innerHTML = ""; return; }
        out.innerHTML = '<div class="understood"><h3>מה הבנו מקורות החיים</h3><p class="summary"></p>' +
          '<p class="muted small">הסיכום נותן משקל למשרות האחרונות. אפשר להעלות קובץ חדש כדי לקרוא שוב.</p></div>' +
          '<div class="tagblock" id="sk"></div><div class="tagblock" id="lg"></div>';
        out.querySelector(".summary").textContent = pf.summary || "";
        tags(out.querySelector("#sk"), "כישורים", pf.skills || [], "skills", "הוסף כישור וכתוב Enter");
        tags(out.querySelector("#lg"), "שפות", pf.languages || [], "languages", "הוסף שפה וכתוב Enter");
      }
      showCv();
      wrap.querySelector("#f").onchange = function (ev) {
        var file = ev.target.files[0];
        if (!file) return;
        fs.className = "muted small";
        fs.textContent = "מעלה וקורא את קורות החיים, זה לוקח כחצי דקה…";
        var path = userId() + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
        var profile;
        loadCatalog().then(function () {
          return toBase64(file);
        }).then(function (data) {
          return token().then(function (t) {
            var names = []; var seen = {};
            catalog.fields.forEach(function (f) { f.roles.forEach(function (r) { if (!seen[r.name]) { seen[r.name] = 1; names.push(r.name); } }); });
            return fetch(CFG.parseEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: "Bearer " + t },
              body: JSON.stringify({ media_type: file.type, data: data, catalog: names }),
            });
          });
        }).then(function (r) { return r.json(); }).then(function (res) {
          if (!res.ok) throw new Error(res.error);
          profile = res.profile;
          /* The reader's roles are a ranked suggestion, not a choice. */
          profile.recommended = (profile.roles || []).map(function (r) { return typeof r === "string" ? { name: r, score: 0 } : r; });
          delete profile.roles;
          return token().then(function (t) {
            return fetch(CFG.supabaseUrl + "/storage/v1/object/" + CFG.bucket + "/" + path, {
              method: "POST",
              headers: { apikey: CFG.supabaseAnonKey, authorization: "Bearer " + t, "content-type": file.type },
              body: file,
            });
          });
        }).then(function (r) {
          if (!r.ok) throw new Error("upload");
          var extra = { cv_path: path, cv_name: file.name, profile: profile, skills: profile.skills || [], languages: profile.languages || [] };
          if (!a.city && profile.city) extra.city = profile.city;
          return patch(extra);
        }).then(function () {
          showCv();
          drawRoles();
          var cityIn = wrap.querySelector("#c");
          if (a.city) cityIn.value = a.city;
          fs.textContent = "הקובץ נקרא. למטה, ב\"מה אני מחפש\", יש המלצות לפי קורות החיים.";
        }).catch(function () {
          fs.className = "bad small";
          fs.textContent = "לא הצלחנו לקרוא את הקובץ. נסה PDF אחר או תמונה ברורה.";
        });
      };

      /* 2. the roles */
      var rolesBox = wrap.querySelector("#roles"), pickedBox = wrap.querySelector("#picked"), recsBox = wrap.querySelector("#recs"), q = wrap.querySelector("#q");
      function row(name, on, noteHtml) {
        var l = el('<label class="pick"><input type="checkbox"><span class="grow"></span>' + (noteHtml || "") + "</label>");
        l.querySelector(".grow").textContent = name;
        var cb = l.querySelector("input");
        cb.checked = on;
        cb.onchange = function () { toggle(name, cb.checked); };
        return l;
      }
      function toggle(name, on) {
        on ? chosen.add(name) : chosen.delete(name);
        patch({ roles: Array.from(chosen) });
        drawRoles();
      }
      function suggestions() {
        var pf = a.profile || {};
        var list = pf.recommended || (pf.roles || []).map(function (n) { return { name: n, score: 0 }; });
        return list.slice().sort(function (x, y) { return y.score - x.score; });
      }
      function drawRoles() {
        pickedBox.innerHTML = "";
        Array.from(chosen).forEach(function (role) {
          var c = el('<span class="chip"><span></span><button aria-label="הסר">' + icon("x") + "</button></span>");
          c.firstChild.textContent = role;
          c.querySelector("button").onclick = function () { toggle(role, false); };
          pickedBox.appendChild(c);
        });
        wrap.querySelector("#picked-box").style.display = chosen.size ? "" : "none";
        var recs = suggestions();
        wrap.querySelector("#recs-box").style.display = recs.length ? "" : "none";
        recsBox.innerHTML = "";
        recs.forEach(function (r) {
          recsBox.appendChild(row(r.name, chosen.has(r.name), r.score
            ? '<span class="bar-score"><i style="width:' + r.score + '%"></i></span><span class="pct">' + r.score + "%</span>" : ""));
        });
        rolesBox.innerHTML = "";
        var text = q.value.trim();
        if (!text) return;
        if (!roleIndex) { rolesBox.textContent = "טוען תפקידים…"; return; }
        var hits = findRoles(roleIndex, text);
        if (!hits.length) { rolesBox.innerHTML = '<p class="muted small">לא נמצא תפקיד קרוב. נסה מילה אחרת.</p>'; return; }
        var holder = el('<div class="results-list"></div>');
        hits.forEach(function (h) { holder.appendChild(row(h.name, chosen.has(h.name), '<span class="muted small">' + esc(h.field) + "</span>")); });
        rolesBox.appendChild(holder);
      }
      q.oninput = drawRoles;
      drawRoles();
      loadCatalog().then(drawRoles).catch(function () { rolesBox.textContent = "לא הצלחנו לטעון את רשימת התפקידים."; });

      /* 3. where */
      var cityIn = wrap.querySelector("#c"), range = wrap.querySelector("#r"), rv = wrap.querySelector("#rv"), art = wrap.querySelector("#art"), err = wrap.querySelector("#cityerr");
      cityIn.value = a.city;
      range.value = Math.min(150, Math.max(5, a.radius_km || 20));
      function drawArt() {
        rv.textContent = range.value + " ק״מ";
        art.innerHTML = radiusDrawing(Number(range.value), cityIn.value) + '<span class="art-city">' + esc(cityIn.value || "בחר עיר") + "</span>";
      }
      drawArt();
      loadCities().then(function (list) {
        var dl = wrap.querySelector("#cities");
        list.forEach(function (c) { var o = document.createElement("option"); o.value = c.name; dl.appendChild(o); });
      }).catch(function () { /* the field still takes text */ });
      cityIn.oninput = function () {
        var typed = cityIn.value.trim();
        if (!typed) { err.textContent = ""; drawArt(); return; }
        if (cityList && !cityList.some(function (c) { return c.name === typed; })) { err.textContent = "בחר עיר מהרשימה."; return; }
        err.textContent = "";
        drawArt();
        later({ city: typed });
      };
      range.oninput = function () { drawArt(); later({ radius_km: Number(range.value) }); };

      wrap.querySelector("#del").onclick = function () {
        if (!confirm("למחוק את הסוכן?")) return;
        api(AGENTS + "?id=eq." + a.id, { method: "DELETE" }).then(function () {
          state.agents = state.agents.filter(function (x) { return x.id !== a.id; });
          state.apps = state.apps.filter(function (x) { return x.agent_id !== a.id; });
          closeBar();
          go({ name: "overview" });
        }).catch(function () { toast("המחיקה נכשלה."); });
      };
    }

    banner();
    setTab(tab);

    return {
      update: function () {
        banner();
        if (tab === "jobs" && jobsUi) jobsUi.draw();
      },
      leave: closeBar,
    };
  }

  /* --- a job, inside the app ------------------------------------------------------------ */
  /* The original ad, in a frame, so the person never has to leave. A site may
     refuse to be framed; the description we read is one tab away for that, and
     "open on the site" stays as the last resort. The frame is sandboxed without
     top navigation, so a site cannot take the page over. */
  function openJob(j, queueIt) {
    var panel = el('<div class="viewer-wrap"><div class="viewer-scrim"></div>' +
      '<section class="viewer" role="dialog" aria-modal="true">' +
        '<header class="viewer-head"><button class="btn ghost sm" id="vx" aria-label="סגור">' + icon("x") + "</button>" +
        '<div class="grow"><div class="viewer-title"></div><div class="muted small viewer-meta"></div></div>' +
        '<a class="btn sm" id="vo" target="_blank" rel="noopener">' + icon("ext") + "באתר</a></header>" +
        '<div class="viewer-tabs"><button class="tab" id="vt-page" aria-selected="true">הדף המקורי</button><button class="tab" id="vt-text" aria-selected="false">תיאור</button>' +
        '<span class="grow"></span><button class="btn primary sm" id="vq">' + icon("check") + "סמן לשליחה</button></div>" +
        '<div class="viewer-body"><div class="viewer-load"><span class="sweep"></span> טוען את הדף…</div>' +
        '<iframe title="המשרה המקורית" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" referrerpolicy="no-referrer"></iframe>' +
        '<div class="viewer-text" hidden></div></div>' +
      "</section></div>");
    panel.querySelector(".viewer-title").textContent = j.title;
    panel.querySelector(".viewer-meta").textContent = [j.company, j.location, SOURCE_NAME[j.source]].filter(Boolean).join(" · ");
    var open = panel.querySelector("#vo");
    open.href = j.url;
    var frame = panel.querySelector("iframe"), text = panel.querySelector(".viewer-text"), load = panel.querySelector(".viewer-load");
    frame.onload = function () { load.hidden = true; };
    frame.src = j.url;
    setTimeout(function () { load.hidden = true; }, 9000);

    function show(which) {
      var isPage = which === "page";
      frame.hidden = !isPage;
      text.hidden = isPage;
      panel.querySelector("#vt-page").setAttribute("aria-selected", String(isPage));
      panel.querySelector("#vt-text").setAttribute("aria-selected", String(!isPage));
    }
    panel.querySelector("#vt-page").onclick = function () { show("page"); };
    panel.querySelector("#vt-text").onclick = function () {
      show("text");
      if (text.getAttribute("data-loaded")) return;
      text.textContent = "טוען…";
      api("/rest/v1/job_applications?id=eq." + j.id + "&select=description").then(function (rows) {
        text.textContent = (rows[0] && rows[0].description) || "לא נשמר תיאור למשרה הזאת. פתח את הדף המקורי.";
        text.setAttribute("data-loaded", "1");
      }).catch(function () { text.textContent = "לא הצלחנו לטעון את התיאור."; });
    };

    var queue = panel.querySelector("#vq");
    if (j.status !== "scored") queue.hidden = true;
    queue.onclick = function () { queueIt(); close(); };

    function close() { panel.remove(); document.removeEventListener("keydown", onKey); document.body.classList.remove("noscroll"); }
    function onKey(e) { if (e.key === "Escape") close(); }
    panel.querySelector("#vx").onclick = close;
    panel.querySelector(".viewer-scrim").onclick = close;
    document.addEventListener("keydown", onKey);
    document.body.classList.add("noscroll");
    document.body.appendChild(panel);
  }

  /* --- signed out ------------------------------------------------------------------------ */
  function login() {
    root.innerHTML = "";
    var box = el('<div class="login"><div class="login-card"><span class="brand-mark">' + icon("radar") + "</span>" +
      "<h1>משרות</h1><p class=\"sub\">סוכנים שסורקים את אתרי הדרושים, מדרגים כל משרה לפי קורות החיים שלך, ושולחים רק מה שבחרת.</p>" +
      '<button class="btn primary" id="go">התחברות עם Google</button></div></div>');
    box.querySelector("#go").onclick = function () {
      location.assign(CFG.supabaseUrl + "/auth/v1/authorize?provider=google&redirect_to=" + encodeURIComponent(location.origin + CFG.base));
    };
    root.appendChild(box);
  }

  /* --- start ------------------------------------------------------------------------------ */
  takeFragment();
  if (!session) { login(); return; }
  root.innerHTML = '<div class="login"><span class="sweep big"></span></div>';
  load().then(function () {
    buildShell();
    var back = history.state && history.state.route;
    state.route = back || { name: state.agents.length ? "overview" : "overview" };
    render();
  }).catch(function () {
    root.innerHTML = '<div class="login"><div class="login-card"><h1>לא הצלחנו לטעון</h1><p class="sub">ייתכן שפג תוקף ההתחברות.</p><button class="btn primary" id="again">התחבר מחדש</button></div></div>';
    root.querySelector("#again").onclick = function () { keep(null); login(); };
  });
})();
