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
    app.innerHTML = "<h1>הסוכנים שלי</h1>";
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

  function agent(a) {
    signOutButton.hidden = false;
    app.innerHTML = "";
    var chosen = new Set(a.roles);
    var view = el('<div><button class="link" id="back">← כל הסוכנים</button><h1></h1>' +
      '<div class="card"><label for="n">שם הסוכן</label><input type="text" id="n">' +

      "<h2>קורות חיים</h2>" +
      '<div id="cv"></div>' +
      '<input type="file" id="f" accept="application/pdf,image/png,image/jpeg,image/webp">' +
      '<p class="mute" id="fs">PDF או תמונה. קובץ Word עדיין לא נתמך.</p></div>' +

      '<div class="card"><h2 style="margin-top:0">מה אני מחפש</h2><div class="roles" id="roles"></div>' +
      '<div class="row"><div class="grow"><label for="c">עיר</label><input type="text" id="c"></div>' +
      '<div><label for="r">רדיוס (ק״מ)</label><input type="number" id="r" min="0" max="300"></div></div></div>' +

      '<div class="row"><button class="primary" id="save">שמירה</button>' +
      '<button id="send" disabled title="בקרוב">שלח משרות (בקרוב)</button>' +
      '<span class="grow"></span><button class="link bad" id="del">מחיקת הסוכן</button></div>' +
      '<p class="mute" id="msg"></p></div>');
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

    var rolesBox = view.querySelector("#roles");
    CFG.roles.forEach(function (role) {
      var l = el('<label><input type="checkbox"><span></span></label>');
      l.querySelector("span").textContent = role;
      var box = l.querySelector("input");
      box.checked = chosen.has(role);
      box.onchange = function () { box.checked ? chosen.add(role) : chosen.delete(role); };
      rolesBox.appendChild(l);
    });

    function save(extra) {
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
        .catch(function () { msg.textContent = "השמירה נכשלה."; });
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
            body: JSON.stringify({ media_type: file.type, data: data, catalog: CFG.roles }),
          });
        });
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (!res.ok) throw new Error(res.error);
        profile = res.profile;
        return token().then(function (t) {
          return fetch(CFG.supabaseUrl + "/storage/v1/object/" + CFG.bucket + "/" + path, {
            method: "POST",
            headers: { apikey: CFG.supabaseAnonKey, authorization: "Bearer " + t, "content-type": file.type },
            body: file,
          });
        });
      }).then(function (r) {
        if (!r.ok) throw new Error("upload");
        profile.roles.forEach(function (role) { chosen.add(role); });
        if (!view.querySelector("#c").value && profile.city) view.querySelector("#c").value = profile.city;
        return save({ cv_path: path, cv_name: file.name, profile: profile });
      }).then(function () {
        Array.prototype.forEach.call(rolesBox.querySelectorAll("input"), function (box, i) {
          box.checked = chosen.has(CFG.roles[i]);
        });
        showCv();
        fs.textContent = "הקובץ נקרא. סימנתי תפקידים שנראים לי מתאימים, אפשר לתקן.";
      }).catch(function () {
        fs.className = "bad";
        fs.textContent = "לא הצלחנו לקרוא את הקובץ. נסה PDF אחר או תמונה ברורה.";
      });
    };

    app.appendChild(view);
  }

  /* --- start -------------------------------------------------------------- */
  signOutButton.onclick = function () { keep(null); login(); };
  takeFragment();
  if (session) dashboard(); else login();
})();
