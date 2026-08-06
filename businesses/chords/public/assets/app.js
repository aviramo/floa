/* ==========================================================================
   Chords.

   An index of songs, a page per song, and an editor. Three ideas hold it up:

   1. A chord is anchored to a CHARACTER INDEX, never to a pixel and never to a
      column of a monospace font. `{ pos: 7, chord: "Am" }` means "over the
      character at index 7 of this line". Pixels are worked out at render time
      by measuring where that character actually landed, which is why the same
      song is correct at any font size, in any font, and in either direction.

   2. Right to left is not a special case, it is the same measurement read from
      the other edge. See layoutLine(). The one thing that IS special is the
      chord label itself: it is Latin text inside a Hebrew line, so it carries
      dir="ltr" and its own bidi isolation. Without that, "Am" and "G/B" flip
      and reorder, which is exactly what happens to a chord sheet in Word.

   3. The page never reloads. /chords/<slug> is a real address (GitHub Pages
      hands unknown paths to the domain's 404.html, which passes them back
      here), and every navigation after that is pushState.

   No dependencies, no build step. Supabase is spoken to over its REST and auth
   endpoints directly.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = window.CHORDS_CONFIG;
  var BASE = CFG.base.replace(/\/+$/, "");

  /* ---------------------------------------------------------------- helpers */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svg(path, extra) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.9");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.innerHTML = path + (extra || "");
    return s;
  }

  var ICON = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    pencil: '<path d="M4 20h4l10-10a2.8 2.8 0 1 0-4-4L4 16v4Z"/>',
    trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    upload: '<path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
    paste: '<rect x="7" y="4" width="10" height="16" rx="2"/><path d="M10 4h4"/>',
    section: '<path d="M5 6h14M5 12h9M5 18h12"/>',
    print: '<path d="M7 9V4h10v5M7 18H5v-6h14v6h-2M8 14h8v6H8z"/>',
  };

  function iconBtn(icon, title, onClick) {
    var b = el("button", "icon-btn");
    b.type = "button";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.appendChild(svg(icon));
    b.addEventListener("click", onClick);
    return b;
  }

  function button(label, icon, cls, onClick) {
    var b = el("button", "btn" + (cls ? " " + cls : ""));
    b.type = "button";
    if (icon) b.appendChild(svg(icon));
    b.appendChild(document.createTextNode(label));
    b.addEventListener("click", onClick);
    return b;
  }

  var toastTimer;
  function toast(message, bad) {
    var t = document.getElementById("toast");
    t.textContent = message;
    t.className = "toast is-on" + (bad ? " is-bad" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, bad ? 5200 : 2800);
  }

  /* ------------------------------------------------------------------ auth */

  var SESSION_KEY = "chords.session";

  var auth = {
    session: null,

    load: function () {
      try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
      catch (e) { this.session = null; }
      return this.session;
    },

    save: function (data) {
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        email: (data.user && data.user.email) || (this.session && this.session.email) || "",
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
    },

    clear: function () {
      this.session = null;
      localStorage.removeItem(SESSION_KEY);
    },

    get in() { return !!(this.session && this.session.refresh_token); },

    signIn: function (email, password) {
      var self = this;
      return fetch(CFG.supabaseUrl + "/auth/v1/token?grant_type=password", {
        method: "POST",
        headers: { apikey: CFG.supabaseAnonKey, "content-type": "application/json" },
        body: JSON.stringify({ email: email, password: password }),
      }).then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok) throw new Error(body.error_description || body.msg || "ההתחברות נכשלה");
          self.save(body);
        });
      });
    },

    signOut: function () {
      var token = this.session && this.session.access_token;
      this.clear();
      if (token) {
        fetch(CFG.supabaseUrl + "/auth/v1/logout", {
          method: "POST",
          headers: { apikey: CFG.supabaseAnonKey, authorization: "Bearer " + token },
        }).catch(function () {});
      }
    },

    /* A valid access token, refreshed if it is about to expire. Resolves to
       null when nobody is signed in, which is a normal state: reading needs
       no token at all. */
    token: function () {
      var self = this;
      if (!this.in) return Promise.resolve(null);
      if (this.session.expires_at - Date.now() > 60000) return Promise.resolve(this.session.access_token);

      return fetch(CFG.supabaseUrl + "/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        headers: { apikey: CFG.supabaseAnonKey, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: this.session.refresh_token }),
      }).then(function (r) {
        if (!r.ok) throw new Error("refresh");
        return r.json();
      }).then(function (body) {
        self.save(body);
        return self.session.access_token;
      }).catch(function () {
        self.clear();
        paintHeader();
        return null;
      });
    },
  };

  /* ------------------------------------------------------------------- data */

  function rest(path, options) {
    options = options || {};
    return auth.token().then(function (token) {
      var headers = {
        apikey: CFG.supabaseAnonKey,
        authorization: "Bearer " + (token || CFG.supabaseAnonKey),
      };
      if (options.body) headers["content-type"] = "application/json";
      if (options.prefer) headers.prefer = options.prefer;

      return fetch(CFG.supabaseUrl + "/rest/v1/" + path, {
        method: options.method || "GET",
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }).then(function (r) {
      if (r.status === 204) return null;
      return r.text().then(function (text) {
        var body = text ? JSON.parse(text) : null;
        if (!r.ok) {
          var err = new Error((body && (body.message || body.hint)) || "השרת החזיר שגיאה");
          err.code = body && body.code;
          err.status = r.status;
          throw err;
        }
        return body;
      });
    });
  }

  var FIELDS = "id,slug,title,artist,song_key,dir,lines,updated_at";

  /* The project is the domain's, the table is this app's. Everything below
     stays inside CFG.table, so another business sharing the same project can
     never be touched from here. */
  var T = CFG.table;

  var db = {
    list: function () {
      return rest(T + "?select=id,slug,title,artist,song_key&order=title.asc");
    },
    bySlug: function (slug) {
      return rest(T + "?select=" + FIELDS + "&slug=eq." + encodeURIComponent(slug) + "&limit=1")
        .then(function (rows) { return rows && rows[0]; });
    },
    insert: function (song) {
      return rest(T, { method: "POST", body: song, prefer: "return=representation" })
        .then(function (rows) { return rows[0]; });
    },
    update: function (id, song) {
      return rest(T + "?id=eq." + encodeURIComponent(id), { method: "PATCH", body: song, prefer: "return=representation" })
        .then(function (rows) { return rows[0]; });
    },
    remove: function (id) {
      return rest(T + "?id=eq." + encodeURIComponent(id), { method: "DELETE" });
    },
  };

  /* ------------------------------------------------------------------ model */

  var RESERVED_SLUGS = { "new": true, "edit": true };

  /* The address of a song is its name with underscores for spaces, in Hebrew
     or in English. Everything that is not a letter, a digit or a dash goes. */
  function slugify(name) {
    var s = String(name || "").trim()
      .replace(/[\s ]+/g, "_")
      .replace(/[^\p{L}\p{N}_'-]/gu, "")
      .replace(/_+/g, "_")
      .replace(/^[_-]+|[_-]+$/g, "");
    if (!s) s = "שיר";
    if (RESERVED_SLUGS[s.toLowerCase()]) s = s + "_";
    return s;
  }

  var SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  var FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var ROOTS = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, "E#": 5, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11 };

  var CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

  function looksLikeChord(token) {
    return CHORD_RE.test(token) && /^[A-G]/.test(token) && token.length <= 12;
  }

  function shiftRoot(root, semis, preferFlat) {
    var i = ROOTS[root];
    if (i == null) return root;
    var next = (((i + semis) % 12) + 12) % 12;
    return (preferFlat ? FLATS : SHARPS)[next];
  }

  function transposeChord(chord, semis) {
    if (!semis) return chord;
    var m = CHORD_RE.exec(chord);
    if (!m) return chord;
    var preferFlat = /b/.test(m[1]) || /b/.test(m[3] || "");
    var out = shiftRoot(m[1], semis, preferFlat) + (m[2] || "");
    if (m[3]) out += "/" + shiftRoot(m[3], semis, preferFlat);
    return out;
  }

  /* A line's text was edited. Chords keep their meaning by riding the common
     prefix and the common suffix; whatever sat inside the part that actually
     changed is pulled to the edge of the change rather than dropped. */
  function remapChords(oldText, newText, chords) {
    var max = Math.min(oldText.length, newText.length);
    var head = 0;
    while (head < max && oldText[head] === newText[head]) head++;
    var tail = 0;
    while (tail < max - head && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) tail++;

    var delta = newText.length - oldText.length;
    var oldTailStart = oldText.length - tail;

    return chords.map(function (c) {
      var pos = c.pos;
      if (pos > head) pos = pos >= oldTailStart ? pos + delta : Math.max(head, pos + delta);
      return { pos: Math.max(0, Math.min(pos, newText.length)), chord: c.chord };
    });
  }

  function blankLine() { return { type: "line", text: "", chords: [] }; }

  function normalizeLines(lines) {
    if (!Array.isArray(lines) || !lines.length) return [blankLine()];
    return lines.map(function (l) {
      var text = String(l && l.text != null ? l.text : "");
      if (l && l.type === "section") return { type: "section", text: text, chords: [] };
      var chords = (l && Array.isArray(l.chords) ? l.chords : [])
        .map(function (c) {
          return { pos: Math.max(0, Math.min(Math.round(Number(c.pos) || 0), text.length)), chord: String(c.chord || "").trim() };
        })
        .filter(function (c) { return c.chord; })
        .sort(function (a, b) { return a.pos - b.pos; });
      return { type: "line", text: text, chords: chords };
    });
  }

  /* Text pasted out of a document, Word or anywhere else: a line of chords,
     then the line of words it belongs to. The column a chord starts in IS the
     character index it sits over, which is the whole trick. */
  function parsePasted(raw) {
    var rows = String(raw).replace(/\r\n?/g, "\n").split("\n");
    var out = [];

    function chordRow(row) {
      var tokens = row.trim().split(/\s+/).filter(Boolean);
      if (!tokens.length) return null;
      if (!tokens.every(looksLikeChord)) return null;
      var chords = [];
      var re = /\S+/g, m;
      while ((m = re.exec(row))) chords.push({ pos: m.index, chord: m[0] });
      return chords;
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i].replace(/\t/g, "    ");
      if (!row.trim()) { out.push(blankLine()); continue; }

      var bracket = /^\s*[\[(]?\s*(פזמון|בית\s*\d*|מעבר|סיום|פתיחה|גשר|intro|verse\s*\d*|chorus|bridge|outro|solo)\s*[\])]?\s*:?\s*$/i.exec(row);
      if (bracket) { out.push({ type: "section", text: bracket[1].trim(), chords: [] }); continue; }

      var chords = chordRow(row);
      if (chords) {
        var next = rows[i + 1] != null ? rows[i + 1].replace(/\t/g, "    ") : "";
        if (next.trim() && !chordRow(next)) {
          out.push({ type: "line", text: next.replace(/\s+$/, ""), chords: chords });
          i++;
        } else {
          var width = chords[chords.length - 1].pos + 1;
          out.push({ type: "line", text: new Array(width + 1).join(" "), chords: chords });
        }
      } else {
        out.push({ type: "line", text: row.replace(/\s+$/, ""), chords: [] });
      }
    }

    return normalizeLines(out);
  }

  /* ------------------------------------------------------- rendering a line */

  /* One span per character, so a character index can become a pixel offset.
     white-space: pre on the parent keeps the spaces, and inline-block gives
     each one a width worth measuring. */
  function textSpans(text) {
    var wrap = el("div", "ln-t");
    for (var i = 0; i < text.length; i++) wrap.appendChild(el("span", null, text[i]));
    return wrap;
  }

  function chordEl(chord, pos, semis) {
    var c = el("span", "chord", transposeChord(chord, semis || 0));
    c.dir = "ltr";
    c.dataset.pos = pos;
    return c;
  }

  /* The measurement. For a left to right line a chord starts where its
     character starts, which is offsetLeft. For a right to left line the line
     itself starts at the container's right edge, so the same distance is
     measured from there, and inset-inline-start does the rest. */
  function layoutLine(ln, rtl) {
    var t = ln.querySelector(".ln-t");
    var lane = ln.querySelector(".ln-c");
    if (!t || !lane) return;

    var spans = t.children;
    var width = ln.clientWidth;
    var placed = [];

    Array.prototype.forEach.call(lane.querySelectorAll(".chord, .chord-input"), function (node) {
      /* the chord being typed over is hidden, not removed, so it must not
         take part in the nudging below or the input drifts sideways */
      if (node.style.display === "none") return;
      var pos = Math.max(0, Math.min(Number(node.dataset.pos) || 0, spans.length));
      var start = 0;
      if (spans.length) {
        if (pos < spans.length) {
          var s = spans[pos];
          start = rtl ? width - (s.offsetLeft + s.offsetWidth) : s.offsetLeft;
        } else {
          var last = spans[spans.length - 1];
          start = rtl ? width - last.offsetLeft : last.offsetLeft + last.offsetWidth;
        }
      }
      placed.push({ node: node, start: start });
    });

    /* Two chords over neighbouring syllables would print on top of each other.
       Nudge, never overlap: the first one keeps its exact place and the next
       is pushed only as far as it has to be. */
    placed.sort(function (a, b) { return a.start - b.start; });
    var floor = 0;
    placed.forEach(function (p) {
      var x = Math.max(p.start, floor);
      p.node.style.insetInlineStart = x + "px";
      floor = x + p.node.offsetWidth + 5;
    });
  }

  function layoutAll(root, rtl) {
    Array.prototype.forEach.call(root.querySelectorAll(".ln"), function (ln) { layoutLine(ln, rtl); });
  }

  /* The character index nearest a pointer, used for dropping and for adding. */
  function posFromX(ln, clientX, rtl) {
    var t = ln.querySelector(".ln-t");
    var spans = t ? t.children : [];
    if (!spans.length) return 0;

    var x = clientX - ln.getBoundingClientRect().left;
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < spans.length; i++) {
      var s = spans[i];
      var edge = rtl ? ln.clientWidth - (s.offsetLeft + s.offsetWidth) : s.offsetLeft;
      var d = Math.abs(edge - x);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    var last = spans[spans.length - 1];
    var endEdge = rtl ? ln.clientWidth - last.offsetLeft : last.offsetLeft + last.offsetWidth;
    if (Math.abs(endEdge - x) < bestDist) best = spans.length;
    return best;
  }

  /* ------------------------------------------------------------------ views */

  var app = document.getElementById("app");
  var state = { songs: null };

  function setBusy(message) {
    app.innerHTML = "";
    var box = el("div", "center");
    var b = el("span", "busy");
    b.appendChild(el("span", "spin"));
    b.appendChild(document.createTextNode(message));
    box.appendChild(b);
    app.appendChild(box);
  }

  function newSong() {
    requireAuth(function () { go(BASE + "/new"); });
  }

  /* "שיר חדש" is shown to everyone, signed in or not. Hiding it until you log
     in leaves a visitor looking at an empty list with no way forward and no
     reason given; showing it and asking for the password on the click says
     what the rule is at the moment it applies. */
  function paintHeader() {
    var bar = document.getElementById("topActions");
    bar.innerHTML = "";
    bar.appendChild(button("שיר חדש", ICON.plus, "small", newSong));
    if (auth.in) {
      bar.appendChild(button("יציאה", null, "ghost small", function () {
        auth.signOut();
        paintHeader();
        route();
        toast("התנתקת");
      }));
    } else {
      bar.appendChild(button("התחברות", null, "ghost small", function () { askSignIn(); }));
    }
  }

  function askSignIn(after) {
    var dlg = document.getElementById("authDialog");
    var form = document.getElementById("authForm");
    var err = document.getElementById("authErr");
    err.hidden = true;
    form.reset();

    form.onsubmit = function (event) {
      event.preventDefault();
      var data = new FormData(form);
      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      auth.signIn(String(data.get("email")), String(data.get("password")))
        .then(function () {
          submit.disabled = false;
          dlg.close();
          paintHeader();
          toast("שלום");
          if (after) after(); else route();
        })
        .catch(function (e) {
          submit.disabled = false;
          err.textContent = e.message === "Invalid login credentials" ? "אימייל או סיסמה לא נכונים" : e.message;
          err.hidden = false;
        });
    };

    form.querySelector("[data-close]").onclick = function () { dlg.close(); };
    dlg.showModal();
  }

  function requireAuth(then) {
    if (auth.in) then(); else askSignIn(then);
  }

  /* --- the index ---------------------------------------------------------- */

  function viewIndex() {
    setBusy("טוען שירים");

    db.list().then(function (songs) {
      state.songs = songs || [];
      app.innerHTML = "";

      var head = el("div", "page-head");
      head.appendChild(el("h1", null, "השירים"));
      head.appendChild(el("span", "count", state.songs.length ? state.songs.length + " שירים" : ""));
      app.appendChild(head);

      var search = el("div", "search");
      search.appendChild(svg(ICON.search));
      var input = el("input");
      input.type = "search";
      input.placeholder = "חיפוש לפי שם או אמן";
      input.setAttribute("aria-label", "חיפוש שיר");
      search.appendChild(input);
      app.appendChild(search);

      var list = el("ul", "list");
      app.appendChild(list);

      /* the empty list carries the way out of itself */
      var empty = el("div", "center");
      var emptyText = el("p");
      var emptyAction = button("להוסיף את השיר הראשון", ICON.plus, null, newSong);
      empty.appendChild(emptyText);
      empty.appendChild(emptyAction);

      function paint(filter) {
        list.innerHTML = "";
        var q = String(filter || "").trim().toLowerCase();
        var shown = state.songs.filter(function (s) {
          return !q || (s.title + " " + (s.artist || "")).toLowerCase().indexOf(q) >= 0;
        });

        if (!shown.length) {
          if (!empty.parentNode) app.appendChild(empty);
          emptyText.textContent = q ? "לא נמצא שיר שמתאים לחיפוש." : "עוד אין שירים כאן.";
          emptyAction.hidden = !!q;
          return;
        }
        if (empty.parentNode) empty.remove();

        shown.forEach(function (s) {
          var li = el("li");
          var a = el("a");
          a.href = BASE + "/" + encodeURIComponent(s.slug);
          a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("href")); });

          var box = el("div");
          box.appendChild(el("div", "t", s.title));
          if (s.artist) box.appendChild(el("div", "a", s.artist));
          a.appendChild(box);
          if (s.song_key) a.appendChild(el("span", "k", s.song_key));

          li.appendChild(a);
          list.appendChild(li);
        });
      }

      input.addEventListener("input", function () { paint(input.value); });
      paint("");
    }).catch(fail);
  }

  /* --- one song ----------------------------------------------------------- */

  function viewSong(slug) {
    setBusy("טוען את השיר");

    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);
      document.title = song.title + " | אקורדים";
      song.lines = normalizeLines(song.lines);

      var semis = 0;
      var size = 18;

      app.innerHTML = "";

      var head = el("div", "song-head");
      head.appendChild(el("h1", null, song.title));
      if (song.artist) head.appendChild(el("div", "by", song.artist));
      app.appendChild(head);

      var tools = el("div", "tools");

      tools.appendChild(button("לרשימה", ICON.back, "ghost small", function () { go(BASE + "/"); }));
      tools.appendChild(el("span", "sep"));

      tools.appendChild(el("span", "lbl", "טרנספוזיציה"));
      var down = iconBtn('<path d="M5 12h14"/>', "הורדת חצי טון", function () { setSemis(semis - 1); });
      var value = el("span", "val", "0");
      var up = iconBtn(ICON.plus, "העלאת חצי טון", function () { setSemis(semis + 1); });
      tools.appendChild(down);
      tools.appendChild(value);
      tools.appendChild(up);

      tools.appendChild(el("span", "sep"));
      tools.appendChild(el("span", "lbl", "גודל"));
      tools.appendChild(iconBtn('<path d="M5 12h14"/>', "טקסט קטן יותר", function () { setSize(size - 1); }));
      tools.appendChild(iconBtn(ICON.plus, "טקסט גדול יותר", function () { setSize(size + 1); }));

      var grow = el("span", "grow");
      tools.appendChild(grow);

      tools.appendChild(iconBtn(ICON.print, "הדפסה", function () { window.print(); }));
      var editBtn = button("עריכה", ICON.pencil, "small", function () {
        requireAuth(function () { go(BASE + "/" + encodeURIComponent(song.slug) + "/edit"); });
      });
      tools.appendChild(editBtn);
      app.appendChild(tools);

      var sheet = el("div", "sheet");
      sheet.style.setProperty("--song-size", size + "px");
      app.appendChild(sheet);

      function draw() {
        sheet.innerHTML = "";
        sheet.dir = song.dir || "rtl";
        var rtl = (song.dir || "rtl") === "rtl";
        song.lines.forEach(function (line) {
          sheet.appendChild(viewLine(line, semis));
        });
        requestAnimationFrame(function () { layoutAll(sheet, rtl); });
      }

      function setSemis(next) {
        semis = Math.max(-11, Math.min(11, next));
        value.textContent = semis > 0 ? "+" + semis : String(semis);
        draw();
      }

      function setSize(next) {
        size = Math.max(13, Math.min(30, next));
        sheet.style.setProperty("--song-size", size + "px");
        requestAnimationFrame(function () { layoutAll(sheet, (song.dir || "rtl") === "rtl"); });
      }

      draw();
      relayoutOn(sheet, function () { return (song.dir || "rtl") === "rtl"; });
    }).catch(fail);
  }

  function viewLine(line, semis) {
    if (line.type === "section") {
      var s = el("div", "ln is-section");
      s.appendChild(el("div", "ln-section", line.text));
      return s;
    }
    var ln = el("div", "ln" + (line.text.trim() || line.chords.length ? "" : " is-blank"));
    var lane = el("div", "ln-c");
    line.chords.forEach(function (c) { lane.appendChild(chordEl(c.chord, c.pos, semis)); });
    ln.appendChild(lane);
    ln.appendChild(textSpans(line.text));
    return ln;
  }

  /* Fonts arrive after the first paint and a window resize changes every
     offset, so both re-measure. Nothing is re-rendered, only re-placed. */
  function relayoutOn(root, isRtl) {
    var run = function () { layoutAll(root, isRtl()); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
    var onResize = function () { if (root.isConnected) run(); else window.removeEventListener("resize", onResize); };
    window.addEventListener("resize", onResize);
  }

  function notFound(slug) {
    document.title = "לא נמצא | אקורדים";
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, 'אין שיר בשם "' + slug.replace(/_/g, " ") + '".'));
    box.appendChild(button("לרשימת השירים", ICON.back, "ghost", function () { go(BASE + "/"); }));
    app.appendChild(box);
  }

  function fail(error) {
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, "משהו השתבש: " + error.message));
    box.appendChild(button("לנסות שוב", null, "ghost", function () { route(); }));
    app.appendChild(box);
  }

  /* --- the editor --------------------------------------------------------- */

  function viewEditor(slug) {
    if (!auth.in) return askSignIn(function () { route(); });

    if (!slug) return startEditor({ id: null, slug: "", title: "", artist: "", song_key: "", dir: "rtl", lines: [blankLine()] });

    setBusy("טוען את השיר");
    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);
      song.lines = normalizeLines(song.lines);
      startEditor(song);
    }).catch(fail);
  }

  function startEditor(song) {
    document.title = (song.id ? "עריכת " + song.title : "שיר חדש") + " | אקורדים";
    app.innerHTML = "";

    var head = el("div", "page-head");
    head.appendChild(el("h1", null, song.id ? "עריכת שיר" : "שיר חדש"));
    app.appendChild(head);

    /* the details */
    var meta = el("div", "ed-meta");

    function field(label, value, cls, onInput) {
      var l = el("label", cls || null, label);
      var i = el("input");
      i.type = "text";
      i.value = value || "";
      i.addEventListener("input", function () { onInput(i.value); });
      l.appendChild(i);
      return { label: l, input: i };
    }

    var titleField = field("שם השיר", song.title, "full", function (v) { song.title = v; });
    var artistField = field("אמן", song.artist, null, function (v) { song.artist = v; });
    var keyField = field("סולם", song.song_key, null, function (v) { song.song_key = v; });

    var dirLabel = el("label", null, "כיוון");
    var dirSelect = el("select");
    [["rtl", "עברית, מימין לשמאל"], ["ltr", "אנגלית, משמאל לימין"]].forEach(function (o) {
      var opt = el("option", null, o[1]);
      opt.value = o[0];
      dirSelect.appendChild(opt);
    });
    dirSelect.value = song.dir || "rtl";
    dirSelect.addEventListener("change", function () { song.dir = dirSelect.value; draw(); });
    dirLabel.appendChild(dirSelect);

    meta.appendChild(titleField.label);
    meta.appendChild(artistField.label);
    meta.appendChild(keyField.label);
    meta.appendChild(dirLabel);
    app.appendChild(meta);

    /* Reading a file can fill in the title, the artist and the direction as
       well as the words, so the fields above are written back from the model
       rather than only read into it. */
    function refreshMeta() {
      titleField.input.value = song.title || "";
      artistField.input.value = song.artist || "";
      keyField.input.value = song.song_key || "";
      dirSelect.value = song.dir || "rtl";
    }

    function refreshAll() { refreshMeta(); draw(); }

    /* the tools */
    var bar = el("div", "ed-bar");
    bar.appendChild(button("מתמונה או PDF", ICON.upload, "ghost small", function () { openUpload(song, refreshAll); }));
    bar.appendChild(button("הדבקת טקסט", ICON.paste, "ghost small", function () { openPaste(song, draw); }));
    bar.appendChild(el("span", "grow"));
    if (song.id) bar.appendChild(button("מחיקה", ICON.trash, "danger small", removeSong));
    bar.appendChild(button("ביטול", null, "ghost small", function () {
      go(song.slug ? BASE + "/" + encodeURIComponent(song.slug) : BASE + "/");
    }));
    var saveBtn = button("שמירה", null, "small", save);
    bar.appendChild(saveBtn);
    app.appendChild(bar);

    app.appendChild(el("p", "hint",
      "לחיצה על שורת מילים פותחת אותה לעריכה. Enter פותח שורה חדשה מתחת, Escape מבטל. " +
      "לחיצה על הפס שמעל השורה מוסיפה אקורד במקום שלחצתם, ואת האקורד אפשר לגרור לאורך השורה עד שהוא בדיוק מעל ההברה."));

    var sheet = el("div", "sheet ed");
    app.appendChild(sheet);

    var addRow = el("div", "ed-bar");
    addRow.appendChild(button("שורה בסוף", ICON.plus, "ghost small", function () {
      song.lines.push(blankLine());
      draw();
      editText(song.lines.length - 1);
    }));
    addRow.appendChild(button("כותרת קטע", ICON.section, "ghost small", function () {
      song.lines.push({ type: "section", text: "פזמון", chords: [] });
      draw();
      editText(song.lines.length - 1);
    }));
    app.appendChild(addRow);

    var rtl = function () { return (song.dir || "rtl") === "rtl"; };

    function draw() {
      sheet.innerHTML = "";
      sheet.dir = song.dir || "rtl";
      song.lines.forEach(function (line, index) { sheet.appendChild(editRow(line, index)); });
      requestAnimationFrame(function () { layoutAll(sheet, rtl()); });
    }

    /* one editable line: the chord lane, the words, and the row's own buttons */
    function editRow(line, index) {
      var row = el("div", "ln-row");

      var ln = el("div", "ln" + (line.type === "section" ? " is-section" : ""));
      ln.dataset.index = index;

      if (line.type === "section") {
        var s = el("div", "ln-section", line.text || "קטע");
        s.addEventListener("click", function () { editText(index); });
        ln.appendChild(s);
      } else {
        var lane = el("div", "ln-c");
        line.chords.forEach(function (c, ci) {
          var node = chordEl(c.chord, c.pos, 0);
          bindChord(node, index, ci);
          lane.appendChild(node);
        });
        lane.addEventListener("pointerdown", function (event) {
          if (event.target !== lane) return;
          var pos = posFromX(ln, event.clientX, rtl());
          line.chords.push({ pos: pos, chord: "" });
          draw();
          requestAnimationFrame(function () { editChord(index, line.chords.length - 1, true); });
        });
        ln.appendChild(lane);

        var t = textSpans(line.text);
        t.addEventListener("click", function () { editText(index); });
        ln.appendChild(t);
      }

      var ops = el("div", "ln-ops");
      ops.appendChild(iconBtn(ICON.plus, "שורה חדשה מתחת", function () {
        song.lines.splice(index + 1, 0, blankLine());
        draw();
        editText(index + 1);
      }));
      ops.appendChild(iconBtn(ICON.section, line.type === "section" ? "להפוך לשורת מילים" : "להפוך לכותרת קטע", function () {
        song.lines[index] = line.type === "section"
          ? { type: "line", text: line.text, chords: [] }
          : { type: "section", text: line.text, chords: [] };
        draw();
      }));
      ops.appendChild(iconBtn(ICON.trash, "מחיקת השורה", function () {
        song.lines.splice(index, 1);
        if (!song.lines.length) song.lines.push(blankLine());
        draw();
      }));

      row.appendChild(ln);
      row.appendChild(ops);
      return row;
    }

    /* dragging a chord: the pointer moves in pixels, the model moves in
       characters, and the two meet in posFromX */
    function bindChord(node, lineIndex, chordIndex) {
      var dragging = false, startX = 0;

      node.addEventListener("pointerdown", function (event) {
        event.stopPropagation();
        event.preventDefault();
        dragging = false;
        startX = event.clientX;
        node.setPointerCapture(event.pointerId);
        node.classList.add("is-dragging");
      });

      node.addEventListener("pointermove", function (event) {
        if (!node.hasPointerCapture(event.pointerId)) return;
        if (!dragging && Math.abs(event.clientX - startX) < 4) return;
        dragging = true;
        var ln = node.closest(".ln");
        var pos = posFromX(ln, event.clientX, rtl());
        if (pos !== song.lines[lineIndex].chords[chordIndex].pos) {
          song.lines[lineIndex].chords[chordIndex].pos = pos;
          node.dataset.pos = pos;
          layoutLine(ln, rtl());
        }
      });

      node.addEventListener("pointerup", function (event) {
        node.classList.remove("is-dragging");
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        if (dragging) {
          song.lines[lineIndex].chords.sort(function (a, b) { return a.pos - b.pos; });
          draw();
        } else {
          editChord(lineIndex, chordIndex, false);
        }
      });

      node.addEventListener("pointercancel", function () {
        node.classList.remove("is-dragging");
      });
    }

    /* typing a chord, in place */
    function editChord(lineIndex, chordIndex, isNew) {
      var ln = sheet.querySelector('.ln[data-index="' + lineIndex + '"]');
      if (!ln) return;
      var lane = ln.querySelector(".ln-c");
      var chord = song.lines[lineIndex].chords[chordIndex];
      var node = lane.querySelectorAll(".chord")[chordIndex];
      if (node) node.style.display = "none";

      var input = el("input", "chord-input");
      input.type = "text";
      input.dir = "ltr";
      input.value = chord.chord;
      input.dataset.pos = chord.pos;
      lane.appendChild(input);
      layoutLine(ln, rtl());
      input.focus();
      input.select();

      var done = false;
      function finish(commit) {
        if (done) return;
        done = true;
        var value = input.value.trim();
        input.remove();
        if (commit) chord.chord = value;
        if (!chord.chord) song.lines[lineIndex].chords.splice(chordIndex, 1);
        song.lines[lineIndex].chords.sort(function (a, b) { return a.pos - b.pos; });
        draw();
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); finish(true); }
        else if (event.key === "Escape") { event.preventDefault(); finish(false); }
      });
      input.addEventListener("blur", function () { finish(true); });
    }

    /* typing the words of a line, in place */
    function editText(index) {
      var ln = sheet.querySelector('.ln[data-index="' + index + '"]');
      if (!ln) return;
      var line = song.lines[index];
      var target = line.type === "section" ? ln.querySelector(".ln-section") : ln.querySelector(".ln-t");
      if (!target) return;

      ln.classList.add("is-active");
      target.style.display = "none";

      var input = el("input", "line-input");
      input.type = "text";
      input.dir = song.dir || "rtl";
      input.value = line.text;
      ln.appendChild(input);
      input.focus();
      var caret = input.value.length;
      input.setSelectionRange(caret, caret);

      var done = false;
      function finish(commit, andThen) {
        if (done) return;
        done = true;
        var value = input.value;
        input.remove();
        ln.classList.remove("is-active");
        if (commit && value !== line.text) {
          if (line.type !== "section") line.chords = remapChords(line.text, value, line.chords);
          line.text = value;
        }
        draw();
        if (andThen) andThen();
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true, function () {
            song.lines.splice(index + 1, 0, blankLine());
            draw();
            editText(index + 1);
          });
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Tab") {
          event.preventDefault();
          var next = event.shiftKey ? index - 1 : index + 1;
          finish(true, function () { if (song.lines[next]) editText(next); });
        }
      });
      input.addEventListener("blur", function () { finish(true); });
    }

    /* --- saving --- */

    function save() {
      var title = String(song.title || "").trim();
      if (!title) { titleField.input.focus(); return toast("צריך שם לשיר", true); }

      saveBtn.disabled = true;
      var payload = {
        title: title,
        artist: String(song.artist || "").trim(),
        song_key: String(song.song_key || "").trim(),
        dir: song.dir || "rtl",
        lines: normalizeLines(song.lines),
      };

      var wanted = song.id && song.slug ? song.slug : slugify(title);

      attempt(wanted, 1);

      function attempt(slug, tries) {
        payload.slug = slug;
        var request = song.id ? db.update(song.id, payload) : db.insert(payload);
        request.then(function (saved) {
          toast("נשמר");
          go(BASE + "/" + encodeURIComponent(saved.slug));
        }).catch(function (error) {
          /* 23505 is the unique index on slug: two songs with the same name */
          if (error.code === "23505" && tries < 30) return attempt(slugify(title) + "_" + (tries + 1), tries + 1);
          saveBtn.disabled = false;
          toast(error.status === 401 || error.status === 403 ? "אין הרשאה. נסו להתחבר שוב." : "השמירה נכשלה: " + error.message, true);
        });
      }
    }

    function removeSong() {
      if (!window.confirm('למחוק את "' + song.title + '" לצמיתות?')) return;
      db.remove(song.id).then(function () {
        toast("השיר נמחק");
        go(BASE + "/");
      }).catch(function (error) {
        toast("המחיקה נכשלה: " + error.message, true);
      });
    }

    draw();
    relayoutOn(sheet, rtl);
    if (!song.id) titleField.input.focus();
  }

  /* --- paste --------------------------------------------------------------- */

  function openPaste(song, draw) {
    var dlg = el("dialog", "dlg");
    var form = el("form", "dlg-in");
    form.method = "dialog";
    form.appendChild(el("h2", null, "הדבקת שיר"));
    form.appendChild(el("p", "muted", "שורת אקורדים ומתחתיה שורת המילים, כמו שהשיר מופיע בקובץ. המרווחים הם שקובעים איפה כל אקורד יושב."));
    var area = el("textarea");
    area.rows = 12;
    area.dir = "ltr";
    area.style.whiteSpace = "pre";
    area.style.fontFamily = "ui-monospace, Menlo, Consolas, monospace";
    form.appendChild(area);
    var actions = el("div", "dlg-actions");
    actions.appendChild(button("ביטול", null, "ghost", function () { dlg.close(); }));
    actions.appendChild(button("להוסיף לשיר", null, null, function () {
      var parsed = parsePasted(area.value);
      if (parsed.length) {
        var empty = song.lines.length === 1 && !song.lines[0].text && !song.lines[0].chords.length;
        song.lines = empty ? parsed : song.lines.concat(parsed);
        draw();
        toast(parsed.length + " שורות נוספו");
      }
      dlg.close();
    }));
    form.appendChild(actions);
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.showModal();
    area.focus();
  }

  /* --- reading a photo or a PDF -------------------------------------------- */

  var MAX_BYTES = 12 * 1024 * 1024;
  var MAX_EDGE = 1800;
  var OK_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

  function toBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("הקובץ לא נקרא")); };
      reader.onload = function () {
        var result = String(reader.result);
        resolve({ media_type: file.type, data: result.slice(result.indexOf(",") + 1) });
      };
      reader.readAsDataURL(file);
    });
  }

  /* A photo straight off a phone is four thousand pixels wide and several
     megabytes, and none of that helps: the model reads well past this size and
     the extra pixels only cost money and time. A PDF is passed through as it
     is, because it is already text. */
  function prepare(file) {
    if (file.type === "application/pdf") return toBase64(file);
    if (typeof createImageBitmap !== "function") return toBase64(file);

    return createImageBitmap(file).then(function (bitmap) {
      var scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      var url = canvas.toDataURL("image/jpeg", 0.9);
      return { media_type: "image/jpeg", data: url.slice(url.indexOf(",") + 1) };
    }).catch(function () { return toBase64(file); });
  }

  function openUpload(song, onChanged) {
    var dlg = el("dialog", "dlg");
    var box = el("div", "dlg-in");
    box.appendChild(el("h2", null, "מתמונה או PDF"));

    var drop = el("div", "drop");
    drop.appendChild(el("h3", null, "גררו לכאן צילום של השיר"));
    drop.appendChild(el("p", null, "תמונה או PDF. המערכת קוראת את המילים ואת האקורדים ומציבה כל אקורד מעל ההברה שהוא יושב עליה בתמונה."));

    var input = el("input");
    input.type = "file";
    input.accept = OK_TYPES.join(",");
    input.style.display = "none";
    drop.appendChild(input);
    drop.appendChild(button("בחירת קובץ", ICON.upload, "ghost", function () { input.click(); }));
    box.appendChild(drop);

    var status = el("p", "muted");
    box.appendChild(status);

    var actions = el("div", "dlg-actions");
    var close = button("סגירה", null, "ghost", function () { dlg.close(); });
    actions.appendChild(close);
    box.appendChild(actions);

    dlg.appendChild(box);
    document.body.appendChild(dlg);
    dlg.addEventListener("close", function () { dlg.remove(); });
    dlg.showModal();

    ["dragenter", "dragover"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (name) {
      drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]);
    });
    input.addEventListener("change", function () { if (input.files[0]) handle(input.files[0]); });

    function handle(file) {
      if (OK_TYPES.indexOf(file.type) < 0) return toast("אפשר תמונה או PDF בלבד", true);
      if (file.size > MAX_BYTES) return toast("הקובץ גדול מדי, עד 12MB", true);

      status.innerHTML = "";
      var busy = el("span", "busy");
      busy.appendChild(el("span", "spin"));
      busy.appendChild(document.createTextNode("קורא את השיר, זה לוקח כמה עשרות שניות"));
      status.appendChild(busy);
      close.disabled = true;

      prepare(file).then(function (payload) {
        if (payload.data.length > 4 * 1024 * 1024) throw new Error("הקובץ גדול מדי. נסו צילום קטן יותר או PDF.");
        return auth.token().then(function (token) {
          return fetch(CFG.transcribeEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer " + token },
            body: JSON.stringify(payload),
          });
        });
      }).then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok || !body.ok) {
            var e = new Error(transcribeError(body, r.status));
            e.detail = body && body.detail;
            throw e;
          }
          return body.song;
        });
      }).then(function (read) {
        var lines = normalizeLines(read.lines);
        var empty = song.lines.length === 1 && !song.lines[0].text && !song.lines[0].chords.length;
        song.lines = empty ? lines : song.lines.concat(lines);
        if (read.dir) song.dir = read.dir;
        if (read.title && !String(song.title || "").trim()) song.title = read.title;
        if (read.artist && !String(song.artist || "").trim()) song.artist = read.artist;
        if (read.song_key && !String(song.song_key || "").trim()) song.song_key = read.song_key;
        dlg.close();
        toast("השיר נקרא. כדאי לעבור על המיקומים ולתקן מה שצריך.");
        onChanged();
      }).catch(function (error) {
        close.disabled = false;
        status.innerHTML = "";
        status.className = "err";
        status.appendChild(el("div", null, error.message));
        if (error.detail) status.appendChild(el("div", "detail", error.detail));
      });
    }
  }

  function transcribeError(body, status) {
    if (status === 401) return "צריך להתחבר מחדש כדי לקרוא קובץ.";
    if (status === 429) return "רגע אחד, נסו שוב בעוד כמה שניות.";
    if (body && body.error === "empty") return "לא זוהו מילים ואקורדים בקובץ. אולי כדאי צילום ברור יותר.";
    return "הקריאה נכשלה. אפשר לנסות שוב או להקליד ידנית.";
  }

  /* ---------------------------------------------------------------- routing */

  function go(href) {
    if (location.pathname === href) return;
    history.pushState(null, "", href);
    route();
  }

  function parts() {
    var path = decodeURIComponent(location.pathname);
    var rest = path.indexOf(BASE) === 0 ? path.slice(BASE.length) : path;
    rest = rest.replace(/^\/+/, "").replace(/\/+$/, "");
    return rest ? rest.split("/") : [];
  }

  var redrawEditor = null;

  function route() {
    window.scrollTo(0, 0);
    var p = parts();

    if (!p.length) { document.title = "אקורדים"; return viewIndex(); }
    if (p[0] === "new") return viewEditor(null);
    if (p.length >= 2 && p[1] === "edit") return viewEditor(p[0]);
    return viewSong(p[0]);
  }

  /* GitHub Pages has no file at /chords/<slug>, so the domain's 404.html sends
     the browser here with the path in ?p=. Put the real address back before
     anything renders, so the bar reads /chords/<slug> and a refresh works. */
  function absorbFallback() {
    var params = new URLSearchParams(location.search);
    var p = params.get("p");
    if (!p) return;
    var clean = BASE + "/" + p.replace(/^\/+/, "");
    history.replaceState(null, "", clean + location.hash);
  }

  window.addEventListener("popstate", function () { route(); });

  absorbFallback();
  auth.load();
  paintHeader();
  route();
})();
