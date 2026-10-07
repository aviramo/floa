/* ==========================================================================
   Jobs: the dashboard.

   Sign in with Google, a list of agents, and one agent at a time: a CV that is
   read into a profile, the roles being looked for, and a city with a radius.
   Sending is not here yet. No dependencies; Supabase is spoken to over REST.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.JOBS_CONFIG;
  var SESSION_KEY = "jobs.session";
  var app = document.getElementById("app");
  var signOutButton = document.getElementById("out");

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

  /* Back from Google, the session sits in the fragment. Take it and clean the
     address bar, so a refresh does not carry a token around in the URL. */
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

  var table = "/rest/v1/" + CFG.agentsTable;
  var JSON_HEADERS = { "content-type": "application/json", prefer: "return=representation" };

  /* --- screens ------------------------------------------------------------ */
  function login() {
    signOutButton.hidden = true;
    app.innerHTML = "";
    var box = el('<div class="center"><h1>משרות</h1><p class="mute">סוכנים ששולחים את קורות החיים שלך למשרות מתאימות.</p>' +
      '<button class="primary" id="go">התחברות עם Google</button></div>');
    box.querySelector("#go").onclick = function () {
      location.assign(CFG.supabaseUrl + "/auth/v1/authorize?provider=google&redirect_to=" +
        encodeURIComponent(location.origin + CFG.base));
    };
    app.appendChild(box);
  }

  function dashboard() {
    signOutButton.hidden = false;
    app.innerHTML = "";
    app.appendChild(connectionsCard());
    app.appendChild(el("<h1>הסוכנים שלי</h1>"));
    var list = el("<div>טוען…</div>");
    var add = el('<button class="primary">סוכן חדש</button>');
    add.onclick = function () {
      api(table, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) })
        .then(function (rows) { agent(rows[0]); })
        .catch(function () { alert("לא הצלחנו ליצור סוכן."); });
    };
    app.append(add, list);

    api(table + "?select=*&order=created_at.desc").then(function (rows) {
      if (!rows.length) { list.innerHTML = '<p class="mute">עוד אין סוכנים. הוסף את הראשון.</p>'; return; }
      list.innerHTML = "";
      rows.forEach(function (a) {
        var card = el('<div class="card row"><div class="grow"><strong>' + esc(a.name) + '</strong><div class="mute">' +
          esc(a.roles.join(", ") || "עדיין לא נבחרו תפקידים") + (a.city ? " · " + esc(a.city) + " " + a.radius_km + " ק״מ" : "") +
          '</div></div><button>פתח</button></div>');
        card.querySelector("button").onclick = function () { agent(a); };
        list.appendChild(card);
      });
    }).catch(function () {
      list.innerHTML = '<p class="bad">לא הצלחנו לטעון. אם זו הפעם הראשונה, ייתכן שהטבלה עדיין לא נוצרה במסד.</p>';
    });
  }

  /* --- the job sites the account is signed in to ---------------------------
     Pressing connect asks the runner on the person's own machine to open Chrome
     on that site; they sign in THERE, and only the status comes back here. */
  var SITES = [
    { key: "alljobs", name: "AllJobs", note: "" },
    { key: "drushim", name: "דרושים", note: "" },
    { key: "linkedin", name: "LinkedIn", note: "החיבור נשמר, אבל חיפוש והגשה בו עדיין לא נתמכים." },
  ];
  var CONN_TEXT = {
    connected: "מחובר ✓",
    requested: "ממתין לסורק במחשב שלך. אם לא קורה כלום, הרץ npm start בתיקיית businesses/jobs/runner.",
    connecting: "נפתח חלון Chrome במחשב שלך. התחבר לאתר שם, והוא יסגר לבד.",
    expired: "פג תוקף. התחבר מחדש.",
    disconnected: "לא מחובר",
  };

  function connectionsCard() {
    var card = el('<div class="card"><h2 style="margin-top:0">חיבורים לאתרים</h2>' +
      '<p class="mute">מתחברים פעם אחת לכל אתר, וכל הסוכנים משתמשים באותו חיבור.</p><div id="conns"></div></div>');
    var box = card.querySelector("#conns");
    var timer = null;

    function draw(rows) {
      var by = {};
      rows.forEach(function (r) { by[r.site] = r; });
      box.innerHTML = "";
      var waiting = false;
      SITES.forEach(function (s) {
        var c = by[s.key];
        var status = c ? c.status : "disconnected";
        if (status === "requested" || status === "connecting") waiting = true;
        var line = el('<div class="row conn"><strong></strong><span class="grow mute"></span><button></button></div>');
        line.querySelector("strong").textContent = s.name;
        line.querySelector(".grow").textContent = (CONN_TEXT[status] || "") + (c && c.note ? " (" + c.note + ")" : "") + (s.note ? " " + s.note : "");
        var b = line.querySelector("button");
        b.textContent = status === "connected" ? "התחבר מחדש" : "התחבר";
        b.disabled = status === "requested" || status === "connecting";
        b.onclick = function () {
          b.disabled = true;
          api("/rest/v1/job_connections?on_conflict=owner,site", {
            method: "POST",
            headers: { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({ site: s.key, status: "requested", note: "", updated_at: new Date().toISOString() }),
          }).then(refresh).catch(function () { b.disabled = false; alert("לא הצלחנו לבקש חיבור."); });
        };
        box.appendChild(line);
      });
      if (waiting && !timer) timer = setInterval(refresh, 3000);
      if (!waiting && timer) { clearInterval(timer); timer = null; }
    }

    function refresh() {
      if (!document.body.contains(card)) { if (timer) clearInterval(timer); timer = null; return Promise.resolve(); }
      return api("/rest/v1/job_connections?select=*").then(draw).catch(function () {
        box.innerHTML = '<p class="bad">לא הצלחנו לטעון את החיבורים.</p>';
      });
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
    /* After the caller has put the card on the page: refresh() gives up on a
       card that is not in the document yet. */
    setTimeout(refresh, 0);
    return card;
  }

  function profileView(p) {
    if (!p || !p.headline) return '<p class="mute">עוד לא הועלו קורות חיים.</p>';
    return '<dl class="profile"><dt>במה אתה עוסק</dt><dd>' + esc(p.headline) + "</dd>" +
      "<dt>שנות ניסיון</dt><dd>" + esc(p.years_experience) + "</dd>" +
      "<dt>כישורים</dt><dd>" + esc((p.skills || []).join(", ")) + "</dd>" +
      "<dt>שפות</dt><dd>" + esc((p.languages || []).join(", ")) + "</dd>" +
      "<dt>תקציר</dt><dd>" + esc(p.summary) + "</dd></dl>";
  }

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(",")[1]); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /* Drushim's fields and roles, loaded once. */
  var catalogLoaded = null;
  var catalogData = null;
  function loadCatalog() {
    return catalogLoaded || (catalogLoaded = fetch(CFG.rolesFile).then(function (r) {
      if (!r.ok) throw new Error("roles");
      return r.json();
    }).then(function (c) { catalogData = c; return c; }));
  }
  function allRoleNames() {
    var names = {};
    ((catalogData && catalogData.fields) || []).forEach(function (f) {
      f.roles.forEach(function (r) { names[r.name] = true; });
    });
    return Object.keys(names);
  }

  /* --- finding a role from a few words ------------------------------------
     639 roles, so a search box and not a list. It forgives the endings Hebrew
     ads put on a title (/ת, /ה), a letter out of place, and a field name: "תוכנה"
     finds every role filed under software even if the role does not say it. */
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

  function agent(a) {
    signOutButton.hidden = false;
    app.innerHTML = "";
    var chosen = new Set(a.roles);
    var allRoles = [];
    var view = el('<div><button class="link" id="back">← כל הסוכנים</button><h1></h1>' +
      '<div class="card"><label for="n">שם הסוכן</label><input type="text" id="n">' +

      "<h2>קורות חיים</h2>" +
      '<div id="cv"></div>' +
      '<input type="file" id="f" accept="application/pdf,image/png,image/jpeg,image/webp">' +
      '<p class="mute" id="fs">PDF או תמונה. קובץ Word עדיין לא נתמך.</p></div>' +

      '<div class="card"><h2 style="margin-top:0">מה אני מחפש</h2><div class="roles" id="picked"></div>' +
      '<div id="recs-box"><h3>מומלצים לפי קורות החיים</h3><div id="recs"></div></div>' +
      '<label for="q">חיפוש תפקיד</label><input type="text" id="q" autocomplete="off" placeholder="הקלד תפקיד, כישור או תחום">' +
      '<div id="roles"></div>' +
      '<div class="row"><div class="grow"><label for="c">עיר</label><input type="text" id="c" list="cities" autocomplete="off" placeholder="התחל להקליד ובחר מהרשימה"><datalist id="cities"></datalist></div>' +
      '<div><label for="r">רדיוס (ק״מ)</label><input type="number" id="r" min="0" max="300"></div></div></div>' +

      '<div class="row"><button class="primary" id="save">שמירה</button>' +
      '<button id="send">שלח משרות</button>' +
      '<span class="grow"></span><button class="link bad" id="del">מחיקת הסוכן</button></div>' +
      '<p class="mute" id="msg"></p>' +
      '<h2>משרות שנמצאו</h2><p class="mute" id="runmsg"></p><div id="found"></div></div>');
    view.querySelector("h1").textContent = a.name;
    view.querySelector("#n").value = a.name;
    view.querySelector("#c").value = a.city;
    view.querySelector("#r").value = a.radius_km;
    var cv = view.querySelector("#cv");
    var msg = view.querySelector("#msg");
    var fs = view.querySelector("#fs");

    function showCv() {
      cv.innerHTML = (a.cv_name ? '<p class="mute">הקובץ: ' + esc(a.cv_name) + "</p>" : "") + profileView(a.profile);
    }
    showCv();

    /* The roles. What is chosen is always on show at the top. Below it, what
       the CV suggests, best fit first, and a search box that takes any words and
       brings the closest of Drushim's roles. */
    var rolesBox = view.querySelector("#roles");
    var pickedBox = view.querySelector("#picked");
    var recsBox = view.querySelector("#recs");
    var q = view.querySelector("#q");
    var index = null;

    function row(name, on, note) {
      var l = el('<label class="pick"><input type="checkbox"><span class="grow"></span><span class="mute note"></span></label>');
      l.querySelector(".grow").textContent = name;
      l.querySelector(".note").textContent = note || "";
      var box = l.querySelector("input");
      box.checked = on;
      box.onchange = function () { box.checked ? chosen.add(name) : chosen.delete(name); drawRoles(); };
      return l;
    }

    /* The CV's suggestions, from the last reading. An older reading kept only
       names: those show without a score. */
    function suggestions() {
      var p = a.profile || {};
      var list = p.recommended || (p.roles || []).map(function (n) { return { name: n, score: 0 }; });
      return list.slice().sort(function (x, y) { return y.score - x.score; });
    }

    function drawRoles() {
      pickedBox.innerHTML = "";
      Array.from(chosen).forEach(function (role) {
        var l = row(role, true);
        l.classList.add("chip");
        pickedBox.appendChild(l);
      });
      pickedBox.style.display = chosen.size ? "" : "none";

      var recs = suggestions();
      view.querySelector("#recs-box").style.display = recs.length ? "" : "none";
      recsBox.innerHTML = "";
      recs.forEach(function (r) {
        recsBox.appendChild(row(r.name, chosen.has(r.name), r.score ? r.score + "% התאמה" : ""));
      });

      rolesBox.innerHTML = "";
      var text = q.value.trim();
      if (!text) return;
      if (!index) { rolesBox.textContent = "טוען תפקידים…"; return; }
      var hits = findRoles(index, text);
      if (!hits.length) { rolesBox.innerHTML = '<p class="mute">לא נמצא תפקיד קרוב. נסה מילה אחרת.</p>'; return; }
      hits.forEach(function (h) { rolesBox.appendChild(row(h.name, chosen.has(h.name), h.field)); });
    }

    q.oninput = drawRoles;
    drawRoles();
    loadCatalog().then(function (c) {
      index = buildIndex(c);
      drawRoles();
    }).catch(function () { rolesBox.textContent = "לא הצלחנו לטעון את רשימת התפקידים."; });

    /* The city is one of a list, not free text: the radius is measured from a
       place that has a position. */
    var cityList = null;
    fetch(CFG.citiesFile).then(function (r) { return r.json(); }).then(function (c) {
      cityList = c.cities;
      var dl = view.querySelector("#cities");
      c.cities.forEach(function (city) {
        var o = document.createElement("option");
        o.value = city.name;
        dl.appendChild(o);
      });
    }).catch(function () { /* the field still takes text */ });

    function save(extra) {
      var typed = view.querySelector("#c").value.trim();
      if (typed && cityList && !cityList.some(function (c) { return c.name === typed; })) {
        return Promise.reject(new Error("city"));
      }
      var patch = Object.assign({
        name: view.querySelector("#n").value.trim() || "סוכן חדש",
        roles: Array.from(chosen),
        city: view.querySelector("#c").value.trim(),
        radius_km: Math.max(0, Math.min(300, parseInt(view.querySelector("#r").value, 10) || 0)),
      }, extra || {});
      return api(table + "?id=eq." + a.id, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(patch) })
        .then(function (rows) { a = rows[0]; view.querySelector("h1").textContent = a.name; return a; });
    }

    view.querySelector("#back").onclick = dashboard;
    view.querySelector("#save").onclick = function () {
      msg.textContent = "שומר…";
      save().then(function () { msg.textContent = "נשמר."; })
        .catch(function (e) {
          msg.textContent = e && e.message === "city" ? "בחר עיר מהרשימה." : "השמירה נכשלה.";
        });
    };
    view.querySelector("#del").onclick = function () {
      if (!confirm("למחוק את הסוכן?")) return;
      api(table + "?id=eq." + a.id, { method: "DELETE" }).then(dashboard);
    };

    view.querySelector("#f").onchange = function (ev) {
      var file = ev.target.files[0];
      if (!file) return;
      fs.className = "mute";
      fs.textContent = "מעלה וקורא את קורות החיים, זה לוקח כחצי דקה…";
      var path = userId() + "/" + Date.now() + "-" + file.name.replace(/[^\w.\-]+/g, "_");
      var profile;
      toBase64(file).then(function (data) {
        return token().then(function (t) {
          return fetch(CFG.parseEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer " + t },
            body: JSON.stringify({ media_type: file.type, data: data, catalog: allRoleNames() }),
          });
        });
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        profile = res.profile;
        /* What the reader returns as roles is a ranked suggestion, not a choice. */
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
        if (!view.querySelector("#c").value && profile.city) view.querySelector("#c").value = profile.city;
        return save({ cv_path: path, cv_name: file.name, profile: profile });
      }).then(function () {
        drawRoles();
        showCv();
        fs.textContent = "הקובץ נקרא. למטה, בבחירת התפקידים, יש המלצות לפי קורות החיים.";
      }).catch(function () {
        fs.className = "bad";
        fs.textContent = "לא הצלחנו לקרוא את הקובץ. נסה PDF אחר או תמונה ברורה.";
      });
    };

    /* --- the scan, and what it found ------------------------------------
       "שלח משרות" asks; the runner on the person's machine answers. Nothing is
       applied to until a job is ticked and sent. */
    var STATUS = { scored: "", queued: "בתור לשליחה", sent: "נשלח", manual: "דורש הגשה ידנית", failed: "נכשל" };
    var found = view.querySelector("#found");
    var runmsg = view.querySelector("#runmsg");
    var picked = new Set();
    var timer = null;

    function stop() { if (timer) clearInterval(timer); timer = null; }

    function draw(rows) {
      if (!rows.length) { found.innerHTML = '<p class="mute">עוד לא נסרק. לחץ על "שלח משרות".</p>'; return; }
      found.innerHTML = "";
      rows.forEach(function (j) {
        var open = j.status === "scored";
        var card = el('<div class="card job"><label class="row">' +
          (open ? '<input type="checkbox">' : "") +
          '<span class="score"></span><span class="grow"><a target="_blank" rel="noopener"></a>' +
          '<div class="mute meta"></div><div class="mute why"></div></span>' +
          '<span class="mute st"></span></label></div>');
        var box = card.querySelector("input");
        if (box) {
          box.checked = picked.has(j.id);
          box.onchange = function () { box.checked ? picked.add(j.id) : picked.delete(j.id); };
        }
        card.querySelector(".score").textContent = j.score;
        var a = card.querySelector("a");
        a.textContent = j.title;
        a.href = j.url;
        card.querySelector(".meta").textContent = [j.company, j.location, j.source === "drushim" ? "דרושים" : "AllJobs"].filter(Boolean).join(" · ");
        card.querySelector(".why").textContent = j.reason;
        card.querySelector(".st").textContent = STATUS[j.status] + (j.note ? " (" + j.note + ")" : "");
        found.appendChild(card);
      });
      var go = el('<button class="primary">שלח את המסומנות</button>');
      go.onclick = function () {
        if (!picked.size) { runmsg.textContent = "סמן משרות לשליחה."; return; }
        var ids = Array.from(picked);
        api("/rest/v1/job_applications?id=in.(" + ids.join(",") + ")&status=eq.scored", {
          method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ status: "queued" }),
        }).then(function () {
          picked.clear();
          runmsg.textContent = "נכנסו לתור. השליחה מתבצעת בחלון Chrome שנפתח במחשב שלך, אחת אחרי השנייה.";
          refresh();
        }).catch(function () { runmsg.textContent = "לא הצלחנו לשלוח לתור."; });
      };
      found.appendChild(go);
    }

    function refresh() {
      return Promise.all([
        api("/rest/v1/job_applications?agent_id=eq." + a.id + "&select=*&order=score.desc,created_at.desc"),
        api("/rest/v1/job_runs?agent_id=eq." + a.id + "&select=*&order=created_at.desc&limit=1"),
      ]).then(function (res) {
        var rows = res[0], run = res[1][0];
        if (run && (run.status === "requested" || run.status === "running")) {
          runmsg.textContent = run.status === "requested"
            ? "ממתין לסורק במחשב שלך. אם לא קורה כלום, הרץ npm start בתיקיית businesses/jobs/runner."
            : "סורק את אתרי הדרושים…";
        } else if (run) {
          runmsg.textContent = run.status === "failed" ? "הסריקה נכשלה: " + run.note : "הסריקה האחרונה: " + run.note;
        }
        var busy = (run && (run.status === "requested" || run.status === "running")) ||
          rows.some(function (r) { return r.status === "queued"; });
        if (!document.body.contains(view)) { stop(); return; }
        draw(rows);
        if (busy && !timer) timer = setInterval(refresh, 4000);
        if (!busy) stop();
      }).catch(function () { runmsg.textContent = "לא הצלחנו לטעון את התוצאות."; });
    }

    view.querySelector("#send").onclick = function () {
      msg.textContent = "";
      save().then(function () {
        if (!a.roles.length) { msg.textContent = "בחר לפחות תפקיד אחד."; return; }
        if (!a.city) { msg.textContent = "בחר עיר."; return; }
        return api("/rest/v1/job_runs", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ agent_id: a.id }) })
          .then(refresh);
      }).catch(function (e) {
        msg.textContent = e && e.message === "city" ? "בחר עיר מהרשימה." : "לא הצלחנו להתחיל סריקה.";
      });
    };
    view.querySelector("#back").addEventListener("click", stop);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && document.body.contains(view)) refresh();
    });
    refresh();

    app.appendChild(view);
  }

  /* --- start -------------------------------------------------------------- */
  signOutButton.onclick = function () { keep(null); login(); };
  takeFragment();
  if (session) dashboard(); else login();
})();
