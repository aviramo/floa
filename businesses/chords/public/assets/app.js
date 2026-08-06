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
  var LIST_FIELDS = "id,slug,title,artist,song_key";

  /* `status` and `status_note` arrived after the table did, and the table is
     not upgraded by deploying this file: someone has to run the SQL. Until
     they do, ask for the columns once, notice they are missing, and carry on
     without them rather than showing an empty library and a red error. */
  var hasStatus = true;

  function withStatus(fields) { return hasStatus ? fields + ",status,status_note" : fields; }

  function missingStatus(error) {
    return hasStatus && error.status === 400 && /status/.test(error.message || "");
  }

  /* The project is the domain's, the table is this app's. Everything below
     stays inside CFG.table, so another business sharing the same project can
     never be touched from here. */
  var T = CFG.table;

  var db = {
    list: function () {
      var self = this;
      return rest(T + "?select=" + withStatus(LIST_FIELDS) + "&order=title.asc").then(function (rows) {
        /* a song still being read, or one that failed, goes to the top: it is
           the only row on the page that is waiting for something */
        return (rows || []).sort(function (a, b) {
          var pa = (a.status || "ready") === "ready" ? 1 : 0;
          var pb = (b.status || "ready") === "ready" ? 1 : 0;
          return pa - pb;
        });
      }).catch(function (error) {
        if (!missingStatus(error)) throw error;
        hasStatus = false;
        return self.list();
      });
    },
    bySlug: function (slug) {
      var self = this;
      return rest(T + "?select=" + withStatus(FIELDS) + "&slug=eq." + encodeURIComponent(slug) + "&limit=1")
        .then(function (rows) { return rows && rows[0]; })
        .catch(function (error) {
          if (!missingStatus(error)) throw error;
          hasStatus = false;
          return self.bySlug(slug);
        });
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

  /* Two decimals is finer than any eye and any font, and it keeps a stored
     song readable instead of full of 6.234567901234568 */
  function round2(value) { return Math.round(value * 100) / 100; }

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
          /* NOT rounded to a whole character, and NOT cut off at the last one.
             A chord dropped by hand sits exactly where it was let go, usually
             between two letters, and a song's last chords often belong past
             the words entirely. The ceiling is only there so a stray number
             cannot put a chord a mile off the page. */
          return { pos: Math.max(0, Math.min(round2(Number(c.pos) || 0), text.length + 80)), chord: String(c.chord || "").trim() };
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

  /* One span per character, so a character index can become a place on screen.
     The spans stay INLINE, not inline-block: this same markup is edited in
     place with contenteditable, and the browser handles a caret moving through
     ordinary inline text far better than through a row of blocks. */
  function textSpans(text) {
    var wrap = el("div", "ln-t");
    fillSpans(wrap, text);
    return wrap;
  }

  function fillSpans(wrap, text) {
    wrap.textContent = "";
    for (var i = 0; i < text.length; i++) wrap.appendChild(el("span", null, text[i]));
  }

  function chordEl(chord, pos, semis) {
    var c = el("span", "chord", transposeChord(chord, semis || 0));
    c.dir = "ltr";
    c.dataset.pos = pos;
    return c;
  }

  /* Everything needed to turn this line's characters into distances and back.

     `at(i)` is where character number i begins, counted from the line's own
     start: the left edge going left to right, the right edge going right to
     left. `unit` is what one character is worth on average, and it is what
     carries the count PAST the last letter, because a song does not stop
     needing chords where the words happen to end: an outro, a turnaround, a
     tail of «נה נה נה» all live out there. Without it every chord past the end
     of a short line piles up on the same point and cannot be pulled apart. */
  function metrics(ln, rtl) {
    var t = ln.querySelector(".ln-t");
    if (!t) return null;
    var spans = t.children;
    var line = ln.getBoundingClientRect();

    var at = function (i) {
      if (!spans.length) return 0;
      if (i < spans.length) {
        var box = spans[i].getBoundingClientRect();
        return rtl ? line.right - box.right : box.left - line.left;
      }
      var last = spans[spans.length - 1].getBoundingClientRect();
      return rtl ? line.right - last.left : last.right - line.left;
    };

    var unit = spans.length ? (at(spans.length) - at(0)) / spans.length : 0;
    if (!(unit > 0)) unit = (parseFloat(getComputedStyle(t).fontSize) || 18) * 0.5;

    return { spans: spans, count: spans.length, at: at, unit: unit };
  }

  /* A position is a character index, and it does not have to be a WHOLE one:
     6.5 is halfway through the seventh character, placed halfway between where
     that character begins and where the next one does. That fraction is what
     lets a chord be dragged smoothly instead of hopping from letter to letter,
     while staying tied to the word underneath rather than to a pixel, so
     editing the words still carries the chord along with its syllable.

     Past the last character the count simply keeps going, a character at a
     time, at the width one character has here. */
  function positionOf(m, pos) {
    if (pos >= m.count) return m.at(m.count) + (pos - m.count) * m.unit;
    if (pos <= 0) return m.at(0) + pos * m.unit;
    var whole = Math.floor(pos);
    var here = m.at(whole);
    var fraction = pos - whole;
    return fraction ? here + (m.at(whole + 1) - here) * fraction : here;
  }

  /* The measurement. Everything is taken from the LINE's own edges with real
     rectangles, so right to left is the same arithmetic read from the other
     side rather than a second code path. */
  function layoutLine(ln, rtl) {
    var lane = ln.querySelector(".ln-c");
    var m = metrics(ln, rtl);
    if (!lane || !m) return;

    var placed = [];
    Array.prototype.forEach.call(lane.querySelectorAll(".chord"), function (node) {
      placed.push({ node: node, start: positionOf(m, Number(node.dataset.pos) || 0) });
    });

    /* Two chords over neighbouring syllables would print on top of each other.
       Nudge, never overlap: the first one keeps its exact place and the next
       is pushed only as far as it has to be. */
    placed.sort(function (a, b) { return a.start - b.start; });
    var floor = 0;
    placed.forEach(function (p) {
      var x = Math.max(p.start, floor);
      /* PHYSICAL left/right, deliberately, not inset-inline-start.

         A chord carries dir="ltr" so its own Latin label cannot flip inside a
         Hebrew line, and that same attribute is what a logical inset resolves
         against: `inset-inline-start` on a dir="ltr" chord means the LEFT edge
         even when the line it belongs to runs right to left, so every chord in
         a Hebrew song lands at the wrong end of it. The distance above was
         already measured from the correct edge; name that edge outright. */
      p.node.style.left = rtl ? "auto" : x + "px";
      p.node.style.right = rtl ? x + "px" : "auto";
      floor = x + p.node.getBoundingClientRect().width + 5;
    });
  }

  /* Moves ONE chord and touches nothing else. While a chord is being dragged
     the others must hold still: a neighbour that shuffles aside as you pass it
     makes the line feel like it is rearranging itself under your hand. The
     tidying pass in layoutLine runs again when the drag ends. */
  function placeChord(ln, node, rtl) {
    var m = metrics(ln, rtl);
    if (!m) return;
    var x = positionOf(m, Number(node.dataset.pos) || 0);
    node.style.left = rtl ? "auto" : x + "px";
    node.style.right = rtl ? x + "px" : "auto";
  }

  function layoutAll(root, rtl) {
    Array.prototype.forEach.call(root.querySelectorAll(".ln"), function (ln) { layoutLine(ln, rtl); });
  }

  /* Where the pointer is, said in characters. The exact inverse of positionOf,
     fraction and all, which is what makes dragging continuous: the chord goes
     precisely where the hand is instead of snapping to the nearest letter, and
     it keeps going past the end of the words instead of stopping dead there. */
  function posFromX(ln, clientX, rtl) {
    var m = metrics(ln, rtl);
    if (!m) return 0;

    var line = ln.getBoundingClientRect();
    var x = rtl ? line.right - clientX : clientX - line.left;

    var starts = [];
    for (var i = 0; i <= m.count; i++) starts.push(m.at(i));

    if (!m.count) return round2(Math.max(0, x / m.unit));
    if (x <= starts[0]) return round2(Math.max(0, x / m.unit));
    if (x >= starts[m.count]) return round2(m.count + (x - starts[m.count]) / m.unit);

    for (var j = 0; j < m.count; j++) {
      if (x < starts[j + 1]) {
        var width = starts[j + 1] - starts[j];
        return round2(j + (width > 0 ? (x - starts[j]) / width : 0));
      }
    }
    return m.count;
  }

  /* --- the caret ------------------------------------------------------------
     Editing happens inside the rendered text itself, and every keystroke
     rebuilds the spans underneath it, so the caret has to be remembered as a
     character index and put back afterwards. */

  function caretIndex(root) {
    var selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    var range = selection.getRangeAt(0);
    if (!root.contains(range.endContainer)) return null;
    var probe = document.createRange();
    probe.selectNodeContents(root);
    probe.setEnd(range.endContainer, range.endOffset);
    return probe.toString().length;
  }

  function placeCaret(root, index) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var seen = 0, node, range = document.createRange();

    while ((node = walker.nextNode())) {
      var length = node.nodeValue.length;
      if (seen + length >= index) {
        range.setStart(node, index - seen);
        range.collapse(true);
        select(range);
        return;
      }
      seen += length;
    }

    range.selectNodeContents(root);
    range.collapse(false);
    select(range);
  }

  function select(range) {
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function selectAll(node) {
    var range = document.createRange();
    range.selectNodeContents(node);
    select(range);
  }

  /* contenteditable="plaintext-only" is what keeps a paste from bringing
     markup, colours and line breaks into a song line. Where it is not
     supported the plain kind will do, with the paste cleaned by hand. */
  function makeEditable(node) {
    node.spellcheck = false;
    try {
      node.contentEditable = "plaintext-only";
      if (node.contentEditable !== "plaintext-only") node.contentEditable = "true";
    } catch (e) {
      node.contentEditable = "true";
    }
    if (node.contentEditable === "true") {
      node.addEventListener("paste", function (event) {
        event.preventDefault();
        var text = (event.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ");
        document.execCommand("insertText", false, text);
      });
    }
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
    bar.appendChild(button("מתמונה", ICON.upload, "ghost small", uploadSong));
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
      var emptyActions = el("div", "row-actions");
      emptyActions.appendChild(button("להקליד שיר", ICON.plus, null, newSong));
      emptyActions.appendChild(button("מתמונה או PDF", ICON.upload, "ghost", uploadSong));
      empty.appendChild(emptyText);
      empty.appendChild(emptyActions);

      function paint(filter) {
        list.innerHTML = "";
        var q = String(filter || "").trim().toLowerCase();
        var shown = state.songs.filter(function (s) {
          return !q || (s.title + " " + (s.artist || "")).toLowerCase().indexOf(q) >= 0;
        });

        if (!shown.length) {
          if (!empty.parentNode) app.appendChild(empty);
          emptyText.textContent = q ? "לא נמצא שיר שמתאים לחיפוש." : "עוד אין שירים כאן.";
          emptyActions.hidden = !!q;
          return;
        }
        if (empty.parentNode) empty.remove();

        shown.forEach(function (s) { list.appendChild(songRow(s, refresh)); });
      }

      /* A song being read is a row that changes on its own, so the list looks
         again while any of them is still reading, and stops the moment none
         is. Leaving the page ends it: the list is gone from the document. */
      function poll() {
        if (!state.songs.some(function (s) { return s.status === "reading"; })) return;
        setTimeout(function () {
          if (!list.isConnected) return;
          refresh();
        }, 5000);
      }

      function refresh() {
        return db.list().then(function (rows) {
          if (!list.isConnected) return;
          state.songs = rows || [];
          head.querySelector(".count").textContent = state.songs.length ? state.songs.length + " שירים" : "";
          paint(input.value);
          poll();
        }).catch(function () { /* a failed refresh is not worth a red screen */ });
      }

      input.addEventListener("input", function () { paint(input.value); });
      paint("");
      poll();
    }).catch(fail);
  }

  /* One line of the index. Three shapes, because a song has three states:
     ready and openable, still being read, or failed with a reason. */
  function songRow(s, refresh) {
    var li = el("li");

    if (s.status === "ready") {
      var a = el("a");
      a.href = BASE + "/" + encodeURIComponent(s.slug);
      a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("href")); });

      var box = el("div");
      box.appendChild(el("div", "t", s.title));
      if (s.artist) box.appendChild(el("div", "a", s.artist));
      a.appendChild(box);
      if (s.song_key) a.appendChild(el("span", "k", s.song_key));

      li.appendChild(a);
      return li;
    }

    var row = el("div", "row is-" + (s.status === "reading" ? "reading" : "failed"));

    if (s.status === "reading") row.appendChild(el("span", "spin"));
    var box2 = el("div");
    box2.appendChild(el("div", "t", s.title));
    box2.appendChild(el("div", "a", s.status === "reading"
      ? "קורא את השיר, אפשר לסגור את הדף"
      : "הקריאה נכשלה"));
    if (s.status === "failed" && s.status_note) box2.appendChild(el("div", "detail", s.status_note));
    row.appendChild(box2);

    if (s.status === "failed") {
      var actions = el("div", "row-actions");
      actions.appendChild(button("להקליד ידנית", ICON.pencil, "ghost small", function () {
        go(BASE + "/" + encodeURIComponent(s.slug) + "/edit");
      }));
      actions.appendChild(button("מחיקה", ICON.trash, "danger small", function () {
        db.remove(s.id).then(refresh).catch(function (e) { toast("המחיקה נכשלה: " + e.message, true); });
      }));
      row.appendChild(actions);
    }

    li.appendChild(row);
    return li;
  }

  /* --- one song ----------------------------------------------------------- */

  function viewSong(slug) {
    setBusy("טוען את השיר");

    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);
      document.title = song.title + " | אקורדים";
      if (song.status && song.status !== "ready") return viewPending(song);
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

  /* A song that is still being read, or that failed. It is a real row with a
     real address, so it gets a real page rather than being hidden from the one
     person who is waiting for it. While it reads, the page looks again by
     itself; when the Worker finishes, this becomes the song. */
  function viewPending(song) {
    app.innerHTML = "";
    var box = el("div", "center");

    if (song.status === "reading") {
      var busy = el("span", "busy");
      busy.appendChild(el("span", "spin"));
      busy.appendChild(document.createTextNode("קורא את " + song.title));
      box.appendChild(busy);
      box.appendChild(el("p", "muted", "אפשר לסגור את הדף. הקריאה ממשיכה גם בלעדיו."));
      setTimeout(function () { if (box.isConnected) viewSong(song.slug); }, 5000);
    } else {
      box.appendChild(el("p", null, "הקריאה של " + song.title + " נכשלה."));
      if (song.status_note) box.appendChild(el("div", "detail", song.status_note));
      var actions = el("div", "row-actions");
      actions.appendChild(button("להקליד ידנית", ICON.pencil, "ghost", function () {
        go(BASE + "/" + encodeURIComponent(song.slug) + "/edit");
      }));
      actions.appendChild(button("מחיקה", ICON.trash, "danger", function () {
        db.remove(song.id).then(function () { toast("נמחק"); go(BASE + "/"); })
          .catch(function (e) { toast("המחיקה נכשלה: " + e.message, true); });
      }));
      box.appendChild(actions);
    }

    box.appendChild(el("p"));
    box.appendChild(button("לרשימת השירים", ICON.back, "ghost small", function () { go(BASE + "/"); }));
    app.appendChild(box);
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

    /* the tools.

       Reading a picture is NOT here. It makes a whole song of its own, from
       the index, and it runs in the background: bolting it onto an open
       editor would mean holding a form open for a minute over work that no
       longer needs anyone to wait for it. Pasting stays, because pasting is
       instant. */
    var bar = el("div", "ed-bar");
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
      "אפשר להקליד ישר על המילים. Enter פותח שורה חדשה מתחת, Tab עובר לשורה הבאה. " +
      "לחיצה על הפס שמעל השורה מוסיפה אקורד במקום שלחצתם, גרירה מזיזה אותו לאורך השורה, ולחיצה עליו פותחת אותו להקלדה."));

    var sheet = el("div", "sheet ed");
    app.appendChild(sheet);

    var addRow = el("div", "ed-bar");
    addRow.appendChild(button("שורה בסוף", ICON.plus, "ghost small", function () {
      song.lines.push(blankLine());
      draw();
      focusLine(song.lines.length - 1);
    }));
    addRow.appendChild(button("כותרת קטע", ICON.section, "ghost small", function () {
      song.lines.push({ type: "section", text: "פזמון", chords: [] });
      draw();
      focusLine(song.lines.length - 1);
    }));
    app.appendChild(addRow);

    var rtl = function () { return (song.dir || "rtl") === "rtl"; };

    function draw() {
      sheet.innerHTML = "";
      sheet.dir = song.dir || "rtl";
      song.lines.forEach(function (line, index) { sheet.appendChild(editRow(line, index)); });
      requestAnimationFrame(function () { layoutAll(sheet, rtl()); });
    }

    /* One editable line.

       There is no edit mode and no field. The words on screen ARE the input:
       the same spans the reader sees, made editable in place, so nothing moves,
       nothing grows a border and nothing changes size when you click into it.
       Every keystroke re-measures, so a chord stays over its syllable while the
       words under it are still being typed.

       Chords are held by object, never by index: a chord can be deleted or a
       line split while a handler from before is still bound, and an index would
       quietly start pointing at its neighbour. */
    function editRow(line, index) {
      var row = el("div", "ln-row");

      var ln = el("div", "ln" + (line.type === "section" ? " is-section" : ""));
      ln.dataset.index = index;

      if (line.type === "section") {
        var head = el("div", "ln-section", line.text);
        makeEditable(head);
        head.addEventListener("input", function () { line.text = head.textContent; });
        head.addEventListener("keydown", function (event) { lineKeys(event, line, head); });
        ln.appendChild(head);
      } else {
        var lane = el("div", "ln-c");
        line.chords.forEach(function (chord) {
          var node = chordEl(chord.chord, chord.pos, 0);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
        });

        /* an empty spot in the chord lane is where a chord is born */
        lane.addEventListener("pointerdown", function (event) {
          if (event.target !== lane) return;
          event.preventDefault();
          var chord = { pos: posFromX(ln, event.clientX, rtl()), chord: "" };
          line.chords.push(chord);
          var node = chordEl("", chord.pos, 0);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
          layoutLine(ln, rtl());
          openPicker(node, ln, line, chord);
        });
        ln.appendChild(lane);

        var text = textSpans(line.text);
        makeEditable(text);
        text.addEventListener("input", function () {
          var caret = caretIndex(text);
          var next = text.textContent;
          line.chords = remapChords(line.text, next, line.chords);
          line.text = next;

          fillSpans(text, next);
          if (caret !== null) placeCaret(text, caret);

          /* the model moved, so the labels above it move with it */
          var nodes = ln.querySelectorAll(".ln-c .chord");
          for (var i = 0; i < nodes.length && i < line.chords.length; i++) {
            nodes[i].dataset.pos = line.chords[i].pos;
          }
          layoutLine(ln, rtl());
        });
        text.addEventListener("keydown", function (event) { lineKeys(event, line, text); });
        ln.appendChild(text);
      }

      var ops = el("div", "ln-ops");
      ops.appendChild(iconBtn(ICON.plus, "שורה חדשה מתחת", function () { addLineAfter(line); }));
      ops.appendChild(iconBtn(ICON.section, line.type === "section" ? "להפוך לשורת מילים" : "להפוך לכותרת קטע", function () {
        var at = song.lines.indexOf(line);
        song.lines[at] = line.type === "section"
          ? { type: "line", text: line.text, chords: [] }
          : { type: "section", text: line.text, chords: [] };
        draw();
      }));
      ops.appendChild(iconBtn(ICON.trash, "מחיקת השורה", function () {
        song.lines.splice(song.lines.indexOf(line), 1);
        if (!song.lines.length) song.lines.push(blankLine());
        draw();
      }));

      row.appendChild(ln);
      row.appendChild(ops);
      return row;
    }

    /* Enter opens the next line, Tab walks, Escape lets go. Nothing here
       submits anything: the song is saved by the Save button and by nothing
       else. */
    function lineKeys(event, line, editable) {
      if (event.key === "Enter") {
        event.preventDefault();
        addLineAfter(line);
      } else if (event.key === "Escape") {
        event.preventDefault();
        editable.blur();
      } else if (event.key === "Tab") {
        event.preventDefault();
        focusLine(song.lines.indexOf(line) + (event.shiftKey ? -1 : 1));
      }
    }

    function addLineAfter(line) {
      var at = song.lines.indexOf(line);
      song.lines.splice(at + 1, 0, blankLine());
      draw();
      focusLine(at + 1);
    }

    function focusLine(index) {
      var ln = sheet.querySelector('.ln[data-index="' + index + '"]');
      if (!ln) return;
      var editable = ln.querySelector(".ln-t, .ln-section");
      if (!editable) return;
      editable.focus();
      placeCaret(editable, editable.textContent.length);
    }

    /* --- a chord ------------------------------------------------------------
       Two gestures on one element. Dragging slides it along the line, in pixels
       on the screen and in characters in the model, and moves NOTHING else.
       Letting go without having moved opens the small list of chords the song
       already uses. */
    function bindChord(node, ln, line, chord) {
      var dragging = false, from = 0;

      node.addEventListener("pointerdown", function (event) {
        event.stopPropagation();
        event.preventDefault();
        closePicker();
        dragging = false;
        from = event.clientX;
        node.setPointerCapture(event.pointerId);
      });

      node.addEventListener("pointermove", function (event) {
        if (!node.hasPointerCapture(event.pointerId)) return;
        if (!dragging) {
          if (Math.abs(event.clientX - from) < 4) return;
          dragging = true;
          node.classList.add("is-dragging");
        }

        var pos = posFromX(ln, event.clientX, rtl());
        var previous = chord.pos;
        if (pos === previous) return;

        /* Run one chord over another and the two change places, so a chord can
           never be buried under its neighbour with no way to get at it again.

           The test is CROSSING, not nearness: a hand moving quickly can travel
           several characters between two pointer events, and a chord it passed
           straight over would otherwise be missed. */
        var crossed = null;
        line.chords.forEach(function (other) {
          if (other === chord) return;
          var passed = previous < other.pos ? pos >= other.pos : pos <= other.pos;
          if (!passed) return;
          if (!crossed || Math.abs(other.pos - previous) < Math.abs(crossed.pos - previous)) crossed = other;
        });

        chord.pos = pos;
        node.dataset.pos = pos;
        placeChord(ln, node, rtl());

        if (crossed) {
          crossed.pos = previous;
          /* the lane's children follow line.chords one for one, because they
             are appended and removed together */
          var twin = node.parentNode.children[line.chords.indexOf(crossed)];
          if (twin) { twin.dataset.pos = crossed.pos; placeChord(ln, twin, rtl()); }
        }
      });

      node.addEventListener("pointerup", function (event) {
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        node.classList.remove("is-dragging");
        if (dragging) layoutLine(ln, rtl());
        else openPicker(node, ln, line, chord);
      });

      node.addEventListener("pointercancel", function () {
        dragging = false;
        node.classList.remove("is-dragging");
      });
    }

    /* --- picking a chord ------------------------------------------------------
       A song uses five or six chords, over and over. So a click offers exactly
       those, taken from the song itself, and the field is there for the one
       that is not on the list yet. */

    var picker = null;

    function closePicker() {
      if (!picker) return;
      picker.remove();
      picker = null;
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    }

    function closeOnOutside(event) { if (picker && !picker.contains(event.target)) closePicker(); }
    function closeOnEscape(event) { if (event.key === "Escape") closePicker(); }

    /* every chord already in this song, in the order it first appears */
    function chordsInSong() {
      var seen = Object.create(null), out = [];
      song.lines.forEach(function (line) {
        (line.chords || []).forEach(function (c) {
          if (c.chord && !seen[c.chord]) { seen[c.chord] = true; out.push(c.chord); }
        });
      });
      return out;
    }

    function openPicker(node, ln, line, chord) {
      closePicker();

      picker = el("div", "picker");
      picker.dir = "ltr";

      function commit(value) {
        chord.chord = String(value || "").trim().slice(0, 16);
        closePicker();
        if (!chord.chord) {
          line.chords.splice(line.chords.indexOf(chord), 1);
          node.remove();
        } else {
          node.textContent = chord.chord;
        }
        layoutLine(ln, rtl());
      }

      var field = el("input", "picker-field");
      field.type = "text";
      field.dir = "ltr";
      field.value = chord.chord;
      field.placeholder = "Am";
      field.setAttribute("aria-label", "אקורד");
      field.addEventListener("keydown", function (event) {
        if (event.key === "Enter") { event.preventDefault(); commit(field.value); }
      });
      picker.appendChild(field);

      var used = chordsInSong();
      if (used.length) {
        var list = el("div", "picker-list");
        used.forEach(function (name) {
          var chip = el("button", "picker-chip" + (name === chord.chord ? " is-on" : ""), name);
          chip.type = "button";
          chip.addEventListener("click", function () { commit(name); });
          list.appendChild(chip);
        });
        picker.appendChild(list);
      }

      var drop = el("button", "picker-drop", "הסרה");
      drop.type = "button";
      drop.addEventListener("click", function () { commit(""); });
      picker.appendChild(drop);

      document.body.appendChild(picker);

      /* under the chord, pulled back inside the window if it would hang out */
      var box = node.getBoundingClientRect();
      var width = picker.offsetWidth;
      var left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
      var top = box.bottom + 6;
      if (top + picker.offsetHeight > window.innerHeight - 8) top = Math.max(8, box.top - picker.offsetHeight - 6);
      picker.style.left = left + "px";
      picker.style.top = top + "px";

      field.focus();
      field.select();

      document.addEventListener("pointerdown", closeOnOutside, true);
      document.addEventListener("keydown", closeOnEscape, true);
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

      /* typing a song by hand is what makes a failed read stop being failed */
      if (hasStatus) { payload.status = "ready"; payload.status_note = ""; }

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
  var MAX_PAGES = 8;
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

  /* Uploading a picture MAKES a song. It does not fill in a form and wait.

     The row is created first, as `reading`, so the work has somewhere to land.
     Then the Worker is handed the files and answers 202 at once, keeps reading
     in the background and writes the finished song onto that row itself. From
     here on the dialog is done: closing it, or the tab, or the laptop, changes
     nothing. The index watches the row. */
  function uploadSong() {
    /* the whole flow rests on the row being able to say "reading" */
    if (!hasStatus) return toast("צריך להריץ את schema.sql ב-Supabase לפני קריאה מתמונה", true);
    requireAuth(openUploadDialog);
  }

  function openUploadDialog() {
    var dlg = el("dialog", "dlg");
    var box = el("div", "dlg-in");
    box.appendChild(el("h2", null, "שיר מתמונה או PDF"));

    var drop = el("div", "drop");
    drop.appendChild(el("h3", null, "גררו לכאן צילום של השיר"));
    drop.appendChild(el("p", null,
      "תמונה, כמה תמונות של אותו שיר, או PDF. המערכת קוראת את המילים ואת האקורדים ומציבה כל אקורד מעל ההברה שהוא יושב עליה בתמונה."));

    var input = el("input");
    input.type = "file";
    input.accept = OK_TYPES.join(",");
    input.multiple = true;
    input.style.display = "none";
    drop.appendChild(input);
    drop.appendChild(button("בחירת קבצים", ICON.upload, "ghost", function () { input.click(); }));
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
      if (e.dataTransfer.files && e.dataTransfer.files.length) handle(e.dataTransfer.files);
    });
    input.addEventListener("change", function () { if (input.files.length) handle(input.files); });

    function fail(message, detail) {
      close.disabled = false;
      status.innerHTML = "";
      status.className = "err";
      status.appendChild(el("div", null, message));
      if (detail) status.appendChild(el("div", "detail", detail));
    }

    function handle(fileList) {
      var files = Array.prototype.slice.call(fileList, 0, MAX_PAGES);
      for (var i = 0; i < files.length; i++) {
        if (OK_TYPES.indexOf(files[i].type) < 0) return fail("אפשר תמונות או PDF בלבד.");
        if (files[i].size > MAX_BYTES) return fail("הקובץ " + files[i].name + " גדול מדי, עד 12MB.");
      }

      status.innerHTML = "";
      status.className = "muted";
      var busy = el("span", "busy");
      busy.appendChild(el("span", "spin"));
      busy.appendChild(document.createTextNode("מכין את הקבצים"));
      status.appendChild(busy);
      close.disabled = true;

      var created = null;

      Promise.all(files.map(prepare)).then(function (payloads) {
        var total = payloads.reduce(function (n, p) { return n + p.data.length; }, 0);
        if (total > 5 * 1024 * 1024) throw new Error("הקבצים גדולים מדי ביחד. נסו פחות עמודים או PDF.");

        /* the row first, so the reading has somewhere to land */
        var name = files[0].name.replace(/\.[^.]+$/, "").trim();
        return insertReading(name || "שיר חדש").then(function (row) {
          created = row;
          return auth.token();
        }).then(function (token) {
          return fetch(CFG.transcribeEndpoint, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: "Bearer " + token },
            body: JSON.stringify({ song_id: created.id, files: payloads }),
          });
        });
      }).then(function (r) {
        return r.json().then(function (body) {
          if (!r.ok || !body.ok) {
            var e = new Error(transcribeError(body, r.status));
            e.detail = body && body.detail;
            throw e;
          }
        });
      }).then(function () {
        dlg.close();
        toast("השיר נקרא ברקע. אפשר לסגור את הדף.");
        if (parts().length === 0) route(); else go(BASE + "/");
      }).catch(function (error) {
        /* the row was created but the work never started: it would sit as
           `reading` forever, so it goes back out */
        if (created) db.remove(created.id).catch(function () {});
        fail(error.message, error.detail);
      });
    }
  }

  /* A placeholder row. Its name and its address come from the file for now;
     the Worker replaces both once it knows what the song is actually called. */
  function insertReading(name) {
    var base = slugify(name);
    return attempt(base, 1);

    function attempt(slug, tries) {
      return db.insert({
        slug: slug,
        title: name,
        artist: "",
        song_key: "",
        dir: "rtl",
        lines: [],
        status: "reading",
        status_note: "",
      }).catch(function (error) {
        if (error.code === "23505" && tries < 30) return attempt(base + "_" + (tries + 1), tries + 1);
        throw error;
      });
    }
  }

  function transcribeError(body, status) {
    if (status === 401) return "צריך להתחבר מחדש כדי לקרוא קובץ.";
    if (status === 429) return "רגע אחד, נסו שוב בעוד כמה שניות.";
    if (status === 413) return "הקבצים גדולים מדי. נסו פחות עמודים או צילום קטן יותר.";
    if (body && body.error === "empty") return "לא זוהו מילים ואקורדים בקובץ. אולי כדאי צילום ברור יותר.";
    return "לא הצלחנו להתחיל את הקריאה. אפשר לנסות שוב או להקליד ידנית.";
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
