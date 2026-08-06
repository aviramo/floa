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
    grip: '<path d="M8 9h8M8 15h8"/>',
    undo: '<path d="M4 10h9a4.5 4.5 0 0 1 0 9h-5"/><path d="M8 6l-4 4 4 4"/>',
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

  var FIELDS = "id,slug,title,dir,lines,updated_at";
  /* `lines` is fetched for the list too, so a row can show which chords the
     song uses. A song is a few hundred bytes of text; a library of them is
     still smaller than one photograph. */
  var LIST_FIELDS = "id,slug,title,lines,created_at,updated_at";

  /* Who made the song, which is two different people as often as it is one.
     The performer is deliberately not here: a song is one song however many
     people have recorded it, and the credit that belongs to it is the writing.

     `artist` and `song_key` are still columns, holding whatever was typed into
     them before this, and nothing here reads or writes them any more. */
  var CREDITS = [
    { field: "lyrics_by", label: "מילים" },
    { field: "music_by", label: "לחן" },
  ];

  function credits(song) {
    return CREDITS.map(function (c) {
      return { label: c.label, name: String(song[c.field] || "").trim() };
    }).filter(function (c) { return c.name; });
  }

  /* What the reading of this song cost, in US cents, as the Worker counted it
     from the model's own token usage. A song typed by hand has no price and
     says nothing, which is different from one that cost nothing. */
  function price(song) {
    if (song.read_cost == null) return "";
    var cents = Number(song.read_cost);
    if (!isFinite(cents)) return "";
    /* Under a cent is shown as under a cent rather than as $0.00, which reads
       as free and is a different claim. */
    return cents < 0.5 ? "פחות מסנט" : "$" + (cents / 100).toFixed(2);
  }

  /* A read runs in the Worker and outlives the request that started it, so if
     the runtime cuts it short there is nobody left to say so. What says so is
     silence: the job writes the elapsed time onto its own row every twenty
     seconds, and a row that has not been touched in two minutes is not being
     read any more, whatever it still claims. */
  var SILENT_TOO_LONG = 2 * 60 * 1000;

  /* The clock a reader watches is counted HERE, from the moment the row was
     created, and ticks every second. The Worker's own heartbeat lands every
     twenty seconds and is what proves the job is still alive (see stalled),
     but a number that only moves three times a minute reads as a stuck one.
     Two different jobs, so two different clocks. */
  /* 1:01, not 61. Past a minute a bare count of seconds stops being a number
     anyone reads and starts being one they have to work out. */
  function clock(seconds) {
    var minutes = Math.floor(seconds / 60);
    var rest = seconds % 60;
    return minutes + ":" + (rest < 10 ? "0" : "") + rest;
  }

  /* The stage comes from the Worker, which is the only side that knows it. The
     seconds are counted here, once a second, which no heartbeat could match. */
  function elapsed(node) {
    var since = Number(node.dataset.since) || Date.now();
    var seconds = Math.max(0, Math.round((Date.now() - since) / 1000));
    node.textContent = (node.dataset.stage || "ממתין") + "  " + clock(seconds);
  }

  function tick(root) {
    var timer = setInterval(function () {
      if (!root.isConnected) return clearInterval(timer);
      var counting = root.querySelectorAll("[data-since]");
      if (!counting.length) return clearInterval(timer);
      Array.prototype.forEach.call(counting, elapsed);
    }, 1000);
  }

  function stalled(song) {
    if (song.status !== "reading") return false;
    var last = Date.parse(song.updated_at || song.created_at || 0);
    return !last || Date.now() - last > SILENT_TOO_LONG;
  }

  /* Columns that arrived after the table did. Deploying this file does not
     upgrade the table: someone has to run the SQL. Until they do, ask for the
     columns, notice they are missing, and carry on without them rather than
     showing an empty library and a red error.
   */
  var OPTIONAL = [
    ["status", "status_note"],
    ["lyrics_by", "music_by"],
    ["read_cost"],
  ].map(function (columns) { return { columns: columns, on: true }; });

  function withOptional(fields) {
    OPTIONAL.forEach(function (group) {
      if (group.on) fields += "," + group.columns.join(",");
    });
    return fields;
  }

  /* Postgres codes for a column that is not there: 42703 when reading one,
     PGRST204 when writing one PostgREST has never heard of. */
  var NO_SUCH_COLUMN = { "42703": true, PGRST204: true };

  /* PostgREST names the column it could not find, so the complaint itself says
     which group to give up on. True means something was given up and the call
     is worth making again.

     THE CODE IS CHECKED FIRST, AND THAT IS NOT A DETAIL. Matching on the words
     alone once read "violates check constraint \"songs_status_check\"" as
     "there is no status column", switched the column off, wrote every row
     without it, and left the whole library looking like a shelf of failed
     reads. A complaint that merely mentions a column is not a complaint that
     the column is missing. */
  function dropMissing(error) {
    if (!NO_SUCH_COLUMN[String(error.code)]) return false;
    var said = error.message || "";
    var dropped = false;
    OPTIONAL.forEach(function (group) {
      if (!group.on) return;
      var named = group.columns.some(function (c) { return said.indexOf(c) >= 0; });
      if (named) { group.on = false; dropped = true; }
    });
    return dropped;
  }

  function has(column) {
    return OPTIONAL.some(function (group) {
      return group.on && group.columns.indexOf(column) >= 0;
    });
  }

  /* A write must not mention a column that is not there either. */
  function shed(song) {
    var gone = {};
    OPTIONAL.forEach(function (group) {
      if (!group.on) group.columns.forEach(function (c) { gone[c] = true; });
    });
    var out = {};
    Object.keys(song).forEach(function (k) { if (!gone[k]) out[k] = song[k]; });
    return out;
  }

  /* The project is the domain's, the table is this app's. Everything below
     stays inside CFG.table, so another business sharing the same project can
     never be touched from here. */
  var T = CFG.table;

  var db = {
    list: function () {
      var self = this;
      return rest(T + "?select=" + withOptional(LIST_FIELDS) + "&order=title.asc").then(function (rows) {
        /* a song still being read, or one that failed, goes to the top: it is
           the only row on the page that is waiting for something */
        return (rows || []).sort(function (a, b) {
          var pa = (a.status || "ready") === "ready" ? 1 : 0;
          var pb = (b.status || "ready") === "ready" ? 1 : 0;
          if (pa !== pb) return pa - pb;
          /* among the unfinished, the order they will actually be read in */
          if (!pa) return String(a.created_at || "") < String(b.created_at || "") ? -1 : 1;
          return 0;
        });
      }).catch(function (error) {
        if (!dropMissing(error)) throw error;
        return self.list();
      });
    },
    bySlug: function (slug) {
      var self = this;
      return rest(T + "?select=" + withOptional(FIELDS + ",created_at") + "&slug=eq." + encodeURIComponent(slug) + "&limit=1")
        .then(function (rows) { return rows && rows[0]; })
        .catch(function (error) {
          if (!dropMissing(error)) throw error;
          return self.bySlug(slug);
        });
    },
    insert: function (song) {
      var self = this;
      return rest(T, { method: "POST", body: shed(song), prefer: "return=representation" })
        .then(function (rows) { return rows[0]; })
        .catch(function (error) {
          if (!dropMissing(error)) throw error;
          return self.insert(song);
        });
    },
    update: function (id, song) {
      var self = this;
      return rest(T + "?id=eq." + encodeURIComponent(id), { method: "PATCH", body: shed(song), prefer: "return=representation" })
        .then(function (rows) { return rows[0]; })
        .catch(function (error) {
          if (!dropMissing(error)) throw error;
          return self.update(id, song);
        });
    },
    remove: function (id) {
      return rest(T + "?id=eq." + encodeURIComponent(id), { method: "DELETE" });
    },

    /* Every name that appears on the OTHER songs in the library, read out of
       their own rows, for the editor to finish a typed one from. Someone who
       wrote the words of one song has usually written more than one, and
       spelling their name the same way the second time is the difference
       between one person and two.

       Both columns pour into one pool, because the person who wrote the words
       is often the one who wrote the tune. */
    names: function () {
      var self = this;
      var fields = CREDITS.map(function (c) { return c.field; });
      if (!fields.some(has)) return Promise.resolve([]);
      return rest(T + "?select=" + fields.join(",")).then(function (rows) {
        var seen = {};
        (rows || []).forEach(function (row) {
          fields.forEach(function (f) {
            var name = String(row[f] || "").trim();
            if (name) seen[name] = true;
          });
        });
        return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "he"); });
      }).catch(function (error) {
        /* a library with no suggestions is a working library */
        if (!dropMissing(error)) return [];
        return self.names();
      });
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

  /* Splitting a chord into root, colour and bass, for transposing. Deliberately
     forgiving: whatever came through isChord below is already a chord, and this
     only has to find the letters in it. */
  var CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

  /* --- what counts as a chord ----------------------------------------------
     Built up rather than guessed at, because the space is genuinely large:
     Am, G/B, Cmaj7, F#m7b5, C7sus4, Dadd9, Bdim7, E7#9, C-7, CΔ, C6/9, Am7/G.
     A root is not optional and everything after it has to be made of pieces
     that mean something, which is what keeps a stray "W" out.

     Parentheses and spaces are stripped before the test, so Cm(maj7) is judged
     as Cmmaj7 and still stored the way it was typed. */
  var ROOT = "[A-G](?:##|bb|#|b|♯|♭)?";
  /* diminished is written °, dim, o and 0 depending on who wrote the chart, and
     half-diminished ø or Ø. All four of the first are the same chord. */
  var QUALITY = "(?:maj|Maj|MAJ|M|Δ|min|mi|m|-|dim|°|o|0|aug|\\+|ø|Ø)";
  var EXTENSION = "(?:5|6|7|9|11|13)";
  var COLOUR = "(?:sus(?:2|4)?|add(?:2|4|6|9|11|13)|(?:#|b|♯|♭)(?:5|6|9|11|13)|maj7|M7|Δ7|no(?:3|5)|omit(?:3|5)|alt|6/9|2|4)";

  var VALID_CHORD = new RegExp(
    "^" + ROOT + QUALITY + "?" + EXTENSION + "?" + COLOUR + "*(?:/" + ROOT + ")?$"
  );

  function isChord(value) {
    var name = String(value || "").trim();
    if (!name || name.length > 16) return false;
    if (/^(?:N\.?C\.?)$/i.test(name)) return true;          // "no chord", a real marking
    return VALID_CHORD.test(name.replace(/[()\s]/g, ""));
  }

  var looksLikeChord = isChord;

  /* What a root is usually played as. Not every chord in music, the ones a
     chart actually uses, so that typing a letter answers with a short list
     instead of a catalogue. */
  var FAMILY = ["", "m", "7", "m7", "maj7", "6", "9", "m9", "sus2", "sus4", "7sus4", "add9", "dim", "dim7", "aug", "m7b5"];

  /* NOT the ROOTS map above, which is note name to semitone for transposing.
     These are the twelve roots a suggestion can be built on. */
  var ROOT_NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  /* Suggestions for a half-typed chord, matched anywhere in the name rather
     than only at the front, so "sus" finds Csus4 and "m7" finds every minor
     seventh. Start with a note and the search stays inside that note's family;
     start with anything else and it looks across all twelve. Typing something
     the family does not have offers the family rather than nothing, because an
     empty list is the one answer that helps no one. */
  function suggestChords(typed) {
    var value = String(typed || "").trim();
    if (!value) return [];

    var m = /^([A-Ga-g])(##|bb|#|b|♯|♭)?/.exec(value);

    /* No note yet: search the names themselves, across all twelve roots. */
    if (!m) {
      var needle = value.toLowerCase();
      var all = [];
      ROOT_NOTES.forEach(function (root) {
        FAMILY.forEach(function (suffix) { all.push(root + suffix); });
      });
      return all.filter(function (name) { return name.toLowerCase().indexOf(needle) >= 0; });
    }

    /* A note fixes the root, and the rest searches the colours: "Bsus" has to
       find B7sus4 as well as Bsus4, which searching the whole name would miss.
       What starts with what was typed comes before what merely contains it. */
    var root = m[1].toUpperCase() + (m[2] || "").replace("♯", "#").replace("♭", "b");
    var tail = value.slice(m[0].length).toLowerCase();
    var starts = [], holds = [];

    FAMILY.forEach(function (suffix) {
      var at = suffix.toLowerCase().indexOf(tail);
      if (at === 0) starts.push(root + suffix);
      else if (at > 0) holds.push(root + suffix);
    });

    var hits = starts.concat(holds);
    return hits.length ? hits : FAMILY.map(function (suffix) { return root + suffix; });
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
  /* Where the change happened, when the caret can say so.

     Comparing the old text with the new one cannot always tell: a run of the
     same character is completely ambiguous. Type a space into "נה נה נה   "
     and every possible insertion point produces the identical string, so the
     comparison picks the far end and every chord sitting out in those spaces,
     which is exactly where an outro's chords live, stays behind.

     The caret knows. After an insertion of n characters it sits n past where
     they went in; after a deletion it sits where they were. The strings still
     have to agree with that story, so a paste or anything stranger falls back
     to comparing them. */
  function caretEdit(oldText, newText, caret, delta) {
    if (caret == null || !delta) return null;
    var at = delta > 0 ? caret - delta : caret;
    if (at < 0 || at > oldText.length) return null;
    if (oldText.slice(0, at) !== newText.slice(0, at)) return null;
    if (delta > 0 ? oldText.slice(at) !== newText.slice(at + delta)
                  : oldText.slice(at - delta) !== newText.slice(at)) return null;
    return at;
  }

  function remapChords(oldText, newText, chords, caret) {
    var delta = newText.length - oldText.length;
    var head, oldTailStart;

    var at = caretEdit(oldText, newText, caret, delta);
    if (at !== null) {
      head = at;
      oldTailStart = delta > 0 ? at : at - delta;
    } else {
      var max = Math.min(oldText.length, newText.length);
      head = 0;
      while (head < max && oldText[head] === newText[head]) head++;
      var tail = 0;
      while (tail < max - head && oldText[oldText.length - 1 - tail] === newText[newText.length - 1 - tail]) tail++;
      oldTailStart = oldText.length - tail;
    }

    /* The tail is asked about FIRST, and that order is the whole of it.

       Type a space with the caret right where a chord sits and nothing was
       deleted, so the change is zero characters wide: `head` and the start of
       the tail are the same index, and the chord is standing on both. Asking
       "is it after the change" first got the answer no, and the chord stayed
       put while the letter it named slid out from under it. Which is exactly
       the thing this whole format exists to prevent, and what pressing space
       fifteen times in a row looks like from the other side. */
    return chords.map(function (c) {
      var pos = c.pos;
      if (pos >= oldTailStart) pos += delta;
      else if (pos > head) pos = Math.max(head, pos + delta);
      return { pos: Math.max(0, Math.min(pos, newText.length)), chord: c.chord };
    });
  }

  /* --- how a line is WRITTEN DOWN ------------------------------------------
     Brackets, in the line itself:

         [Am]שלום לך אדו[G]ני

     This is the ChordPro convention, and the reason to store a song this way
     rather than as text plus a list of offsets is that the link stops being a
     number somebody has to keep true. The chord IS inside the words. Type a
     space before אדוני and the G moves with it because it cannot do anything
     else; there is no index left to drift.

     In memory a line is still split into `text` and `chords` with a position
     each, because drawing one and dragging one both need a position. But that
     split lives only as long as the page does: what is stored, and what a
     person reads if they ever look at the database, is the line above. */

  /* A CHORD SITS ON A CHARACTER, and `pos` is that character's index. Not the
     gap before it and not the gap after it: the letter itself.

     Which is what a printed sheet means. A chord symbol is over a letter, and
     the tick under it points at that letter, so a position that named the seam
     between two of them was always a description of the drawing rather than of
     the song.

     In the document the bracket goes immediately AFTER the character it names:

         ABC[Am]DEF        Am is on the C
         GHI [F]JKL        F is on the space
         שלום לך אדו[G]ני  G is on the ו

     So writing one means slicing up to and INCLUDING its character, and
     reading one means the character just before the bracket. A bracket at the
     very start of a line has no character before it; it lands on the first,
     which is the nearest thing it can have meant. */

  function toChordPro(line) {
    if (line.type === "section") return line.text;
    var chords = line.chords.slice().sort(function (a, b) { return a.pos - b.pos; });
    var out = "", at = 0;
    chords.forEach(function (c) {
      var after = Math.max(at, Math.min(c.pos + 1, line.text.length));
      out += line.text.slice(at, after) + "[" + c.chord + "]";
      at = after;
    });
    return out + line.text.slice(at);
  }

  function fromChordPro(raw) {
    var text = "", chords = [];
    var brackets = /\[([^\]\n]{1,16})\]/g, at = 0, found;
    while ((found = brackets.exec(raw))) {
      text += raw.slice(at, found.index);
      var chord = found[1].trim();
      if (chord) chords.push({ pos: Math.max(0, text.length - 1), chord: chord });
      at = found.index + found[0].length;
    }
    return { text: text + raw.slice(at), chords: chords };
  }

  /* Every chord a song uses, once each, in the order the song reaches them.
     Which is the order that means something: a song opens on its home chord. */
  function chordsUsed(lines) {
    var seen = Object.create(null), out = [];
    normalizeLines(lines).forEach(function (line) {
      (line.chords || []).forEach(function (c) {
        if (c.chord && !seen[c.chord]) { seen[c.chord] = true; out.push(c.chord); }
      });
    });
    return out;
  }

  /* --- the easy version ------------------------------------------------------
     A capo at fret N means the hand plays the song moved N semitones DOWN
     while it still sounds in its own key. So "the easy version" is not a
     matter of taste, it is a search: try every capo position and see which one
     turns the song's chords into shapes a hand can hold without barring.

     What IS a matter of taste is this list. It is the open position a beginner
     actually owns: five majors, three minors, and the sevenths that come with
     them. Widen it and the answer changes. */
  var OPEN_SHAPES = {};
  "C D E G A Am Em Dm A7 B7 C7 D7 E7 G7 Am7 Em7 Dm7 Cmaj7 Amaj7 Fmaj7 Dsus2 Dsus4 Asus2 Asus4 Esus4 Cadd9"
    .split(" ").forEach(function (shape) { OPEN_SHAPES[shape] = true; });

  var MAX_CAPO = 7;

  function easyVersion(chords) {
    var best = { capo: 0, shapes: chords.slice(), hard: Infinity };
    if (!chords.length) return { capo: 0, shapes: [], hard: 0 };

    for (var capo = 0; capo <= MAX_CAPO; capo++) {
      var shapes = chords.map(function (chord) { return transposeChord(chord, -capo); });
      var hard = shapes.filter(function (shape) { return !OPEN_SHAPES[shape]; }).length;
      /* strictly fewer, so the lowest capo wins a tie: a capo is a thing to
         carry and to fit, and the open neck is worth something on its own */
      if (hard < best.hard) best = { capo: capo, shapes: shapes, hard: hard };
    }
    return best;
  }

  function blankLine() { return { type: "line", text: "", chords: [] }; }

  /* Cutting a line in two and putting two back together, with the chords going
     wherever their own characters went. These are what let Enter, Backspace and
     Delete behave the way they do in any other text editor: a song is a
     document, so the keys that shape a document have to work on it. */
  function splitLine(line, at) {
    var cut = Math.max(0, Math.min(at, line.text.length));
    var before = { type: line.type, text: line.text.slice(0, cut), chords: [] };
    var after = { type: "line", text: line.text.slice(cut), chords: [] };
    (line.chords || []).forEach(function (c) {
      if (c.pos < cut) before.chords.push({ pos: c.pos, chord: c.chord });
      else after.chords.push({ pos: c.pos - cut, chord: c.chord });
    });
    return [before, after];
  }

  function joinLines(first, second) {
    var at = first.text.length;
    return {
      type: first.type,
      text: first.text + second.text,
      chords: (first.chords || []).map(function (c) { return { pos: c.pos, chord: c.chord }; })
        .concat((second.chords || []).map(function (c) { return { pos: c.pos + at, chord: c.chord }; })),
    };
  }

  /* Room for a chord that belongs after the last word: the LINE grows, in
     spaces, so the chord still names a character. This is what a printed chord
     sheet does too, and it is what keeps the promise that editing the words
     moves the chords with them. */
  /* A chord names a CHARACTER, so the line has to be long enough to have one:
     a chord on character 12 needs thirteen characters, not twelve. */
  function padTo(line, pos) {
    var needed = pos + 1;
    if (needed <= line.text.length) return false;
    line.text += new Array(needed - line.text.length + 1).join(" ");
    return true;
  }

  /* What goes into the database: the song, as ONE piece of text.

         [Am]שלום לך אדו[G]ני
         [F]ואיך היה היום

         {פזמון}
         ...

     Not a list of line objects. A song is a document, so a newline is what a
     newline is, an empty line is an empty line, and the whole thing can be read
     and edited by a person looking at the database, or pasted into any other
     program that speaks ChordPro. A heading is a line in braces; that is the
     only piece of punctuation this format has beyond the brackets. */
  function songToText(lines) {
    return normalizeLines(lines).map(function (line) {
      return line.type === "section" ? "{" + line.text + "}" : toChordPro(line);
    }).join("\n");
  }

  function textToSong(body) {
    return String(body).replace(/\r\n?/g, "\n").split("\n").map(function (row) {
      var heading = /^\s*\{(.*)\}\s*$/.exec(row);
      if (heading) return { type: "section", text: heading[1].trim(), chords: [] };
      var parsed = fromChordPro(row);
      return { type: "line", text: parsed.text, chords: parsed.chords };
    });
  }

  /* the other half of padTo: spaces nothing needs any more, once the chord that
     called for them has moved back */
  function trimPadding(line) {
    var needed = 0;
    line.chords.forEach(function (c) { if (c.pos + 1 > needed) needed = c.pos + 1; });
    var words = line.text.replace(/\s+$/, "").length;
    var keep = Math.max(words, needed);
    if (keep >= line.text.length) return false;
    line.text = line.text.slice(0, keep);
    return true;
  }

  function normalizeLines(lines) {
    /* The song as it is stored now: one document. Songs written before that,
       as a list of line objects, still open, which is the whole reason this
       function takes both. */
    if (typeof lines === "string") lines = lines.trim() ? textToSong(lines) : [];
    if (!Array.isArray(lines) || !lines.length) return [blankLine()];

    return lines.map(function (l) {
      var raw = String(l && l.text != null ? l.text : "");
      if (l && l.type === "section") return { type: "section", text: raw, chords: [] };

      /* Written down with brackets. A song saved before that, with a separate
         list of offsets, still opens: its own list is used and the brackets
         are simply not there to find. */
      var parsed = Array.isArray(l && l.chords) ? { text: raw, chords: l.chords } : fromChordPro(raw);
      var text = parsed.text;

      var chords = parsed.chords
        .map(function (c) {
          /* A WHOLE character of THIS line, and nothing else is allowed.
             That is the entire contract: a chord names a character, so editing
             the words carries the chord along with the syllable it sat on.
             A fraction is a pixel wearing a costume, and an index past the end
             of the text names nothing at all, so a chord that belongs after
             the last word is made room for by lengthening the line (see
             padTo), never by pointing past it. */
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

    /* THE MIDDLE OF THE CHARACTER, not its leading edge. A chord sits ON a
       letter, so what its own middle lines up with is the middle of that
       letter, and half a character is the difference between a chord over the
       ק and a chord over the seam before it. */
    var placed = [];
    Array.prototype.forEach.call(lane.querySelectorAll(".chord"), function (node) {
      placed.push({ node: node, start: positionOf(m, (Number(node.dataset.pos) || 0) + 0.5) });
    });

    /* Two chords over neighbouring syllables would print on top of each other.
       Nudge, never overlap: the first one keeps its exact place and the next
       is pushed only as far as it has to be. */
    placed.sort(function (a, b) { return a.start - b.start; });
    var floor = -Infinity;
    placed.forEach(function (p) {
      /* CENTRED on the anchor, not started at it. The chord's middle marks the
         character, which is where the tick under it is drawn, so what the eye
         lines up with the letter is the label as a whole rather than one of
         its edges. */
      /* Centred on the anchor and NEVER pulled back from it. A chord over the
         first letter hangs half its width past the front of the line, which is
         why the sheet is padded (see .sheet) rather than the chord moved: what
         is stored has to be what is drawn, or the page and the song stop
         agreeing and there is no way to tell which one is lying. */
      var width = p.node.getBoundingClientRect().width;
      var x = Math.max(p.start - width / 2, floor);
      /* PHYSICAL left/right, deliberately, not inset-inline-start.

         A chord carries dir="ltr" so its own Latin label cannot flip inside a
         Hebrew line, and that same attribute is what a logical inset resolves
         against: `inset-inline-start` on a dir="ltr" chord means the LEFT edge
         even when the line it belongs to runs right to left, so every chord in
         a Hebrew song lands at the wrong end of it. The distance above was
         already measured from the correct edge; name that edge outright. */
      p.node.style.left = rtl ? "auto" : x + "px";
      p.node.style.right = rtl ? x + "px" : "auto";
      floor = x + width + 5;
    });
  }

  /* Moves ONE chord and touches nothing else. While a chord is being dragged
     the others must hold still: a neighbour that shuffles aside as you pass it
     makes the line feel like it is rearranging itself under your hand. The
     tidying pass in layoutLine runs again when the drag ends. */
  function placeChord(ln, node, rtl, at) {
    var m = metrics(ln, rtl);
    if (!m) return;
    var anchor = at != null ? at : positionOf(m, (Number(node.dataset.pos) || 0) + 0.5);
    var x = anchor - node.getBoundingClientRect().width / 2;
    node.style.left = rtl ? "auto" : x + "px";
    node.style.right = rtl ? x + "px" : "auto";
  }

  function layoutAll(root, rtl) {
    Array.prototype.forEach.call(root.querySelectorAll(".ln"), function (ln) { layoutLine(ln, rtl); });
  }

  /* Where the pointer is, said in characters, fraction and all. The caller
     rounds it: a stored position is always a whole character, but the fraction
     is what lets a chord follow the hand smoothly while it is being dragged. */
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

  /* How big this reader wants the words, kept between songs and between visits.
     Whoever needs a bigger font on one song needs it on the next one too, and
     setting it again every time is the kind of small tax that adds up. Call it
     with a number to set it, without one to read it. */
  var SIZE_KEY = "chords.size";

  function readingSize(next) {
    if (next != null) {
      var size = Math.max(13, Math.min(30, Math.round(next)));
      try { localStorage.setItem(SIZE_KEY, String(size)); } catch (e) { /* private window */ }
      return size;
    }
    var saved = 0;
    try { saved = parseInt(localStorage.getItem(SIZE_KEY), 10); } catch (e) { /* private window */ }
    return saved >= 13 && saved <= 30 ? saved : 18;
  }

  function setBusy(message) {
    app.innerHTML = "";
    var box = el("div", "center");
    var b = el("span", "busy");
    b.appendChild(el("span", "spin"));
    b.appendChild(document.createTextNode(message));
    box.appendChild(b);
    app.appendChild(box);
  }

  /* Reading a photograph is the one thing a phone is BETTER at, since the
     camera is already in your hand, so that stays. Typing a song out is the
     one it is worst at, so it says so rather than opening a page that cannot
     be typed on. */
  function newSong() {
    if (NARROW.matches) return toast("שיר נכתב במסך גדול. מתמונה אפשר גם מכאן.", true);
    requireAuth(function () { go(BASE + "/new"); });
  }

  /* ONLY ON THE INDEX. Adding a song, signing in and signing out belong to the
     library, and a song open on the screen has buttons of its own about that
     song. Two rows of buttons an inch apart, one of them about what you are
     looking at and the other about something else, is a page where you have to
     read before you can press.

     "שיר חדש" is shown there to everyone, signed in or not. Hiding it until you
     log in leaves a visitor looking at an empty list with no way forward and no
     reason given; showing it and asking for the password on the click says what
     the rule is at the moment it applies. */
  function paintHeader() {
    var bar = document.getElementById("topActions");
    bar.innerHTML = "";
    if (parts().length) return;

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

      var search = el("div", "search");
      search.appendChild(svg(ICON.search));
      var input = el("input");
      input.type = "search";
      input.placeholder = "חיפוש לפי שם, מילים או לחן";
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
          if (!q) return true;
          var hay = s.title + " " + credits(s).map(function (c) { return c.name; }).join(" ");
          return hay.toLowerCase().indexOf(q) >= 0;
        });

        if (!shown.length) {
          if (!empty.parentNode) app.appendChild(empty);
          emptyText.textContent = q ? "לא נמצא שיר שמתאים לחיפוש." : "עוד אין שירים כאן.";
          emptyActions.hidden = !!q;
          return;
        }
        if (empty.parentNode) empty.remove();

        shown.forEach(function (s) { list.appendChild(songRow(s, refresh)); });
        tick(list);
      }

      /* A song waiting or being read is a row that changes on its own, so the
         list looks again while any of them is unfinished, and stops the moment
         none is. Leaving the page ends it: the list is gone from the document. */
      function poll() {
        if (!state.songs.some(function (s) {
          return s.status === "queued" || (s.status === "reading" && !stalled(s));
        })) return;
        setTimeout(function () {
          if (!list.isConnected) return;
          refresh();
        }, 5000);
      }

      function refresh() {
        return db.list().then(function (rows) {
          if (!list.isConnected) return;
          state.songs = rows || [];
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

    /* A row with no status at all is a song, not a failure. The column may be
       missing from an older table, and the worst thing this page can do with a
       song it holds the words to is refuse to show them. */
    if (!s.status || s.status === "ready") {
      var a = el("a");
      a.href = BASE + "/" + encodeURIComponent(s.slug);
      a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("href")); });

      var box = el("div");

      /* The name, and beside it whoever made it: words, tune, performer, the
         ones that are filled in, separated by commas. Bare names, no labels,
         because a label on every one of three would be longer than the row it
         sits in and nobody reads an index that way. */
      var top = el("div", "t-row");
      top.appendChild(el("div", "t", s.title));
      var by = credits(s);
      if (by.length) {
        top.appendChild(el("div", "by", by.map(function (c) { return c.name; }).join(", ")));
      }
      box.appendChild(top);

      /* Under the name goes what you actually want to know before opening a
         song: whether you can play it.

         In the order the song reaches them, so the first is the one it opens
         on, and read right to left like everything else on the page. Each name
         keeps its own direction (see .k), which is what stops "G/B" flipping
         inside itself. */
      var used = chordsUsed(s.lines);
      var paid = price(s);
      if (used.length || paid) {
        var easy = used.length ? easyVersion(used) : null;
        var keys = el("div", "keys");
        if (easy) {
          keys.title = "השיר עצמו: " + used.join("  ");
          if (easy.capo) keys.appendChild(el("span", "capo", "קפו " + easy.capo));
          easy.shapes.forEach(function (shape) { keys.appendChild(el("span", "k", shape)); });
        }
        /* What the machine charged to read this one. Last, and quiet: it is
           worth knowing and it is not what the row is for. */
        if (paid) {
          var cost = el("span", "cost", paid);
          cost.title = "עלות הפענוח של השיר הזה";
          keys.appendChild(cost);
        }
        box.appendChild(keys);
      }

      a.appendChild(box);
      li.appendChild(a);
      return li;
    }

    /* Waiting its turn. Nothing has been spent on it yet, which is exactly why
       it can be called off: deleting the row is the whole of cancelling, and
       the Workflow holding this song finds it gone and stops. */
    if (s.status === "queued") {
      var wait = el("div", "row is-queued");
      var waitBox = el("div");
      waitBox.appendChild(el("div", "t", s.title));
      waitBox.appendChild(el("div", "a", "ממתין בתור"));
      wait.appendChild(waitBox);

      var waitActions = el("div", "row-actions");
      waitActions.appendChild(button("ביטול", null, "ghost small", function () {
        db.remove(s.id).then(refresh).catch(function (e) { toast("הביטול נכשל: " + e.message, true); });
      }));
      wait.appendChild(waitActions);

      li.appendChild(wait);
      return li;
    }

    var reading = s.status === "reading" && !stalled(s);
    var row = el("div", "row is-" + (reading ? "reading" : "failed"));

    if (reading) row.appendChild(el("span", "spin"));
    var box2 = el("div");
    box2.appendChild(el("div", "t", s.title));
    if (reading) {
      var note = el("div", "a");
      note.dataset.since = Date.parse(s.created_at || "") || Date.now();
      note.dataset.stage = s.status_note || "ממתין";
      elapsed(note);
      box2.appendChild(note);
    } else {
      box2.appendChild(el("div", "a", stalled(s) ? "הקריאה נתקעה ולא הסתיימה" : "הקריאה נכשלה"));
    }
    if (s.status !== "reading" && s.status_note) box2.appendChild(el("div", "detail", s.status_note));
    row.appendChild(box2);

    if (!reading) {
      var actions = el("div", "row-actions");
      actions.appendChild(button("להקליד ידנית", ICON.pencil, "ghost small", function () {
        go(BASE + "/" + encodeURIComponent(s.slug));
      }));
      actions.appendChild(button("מחיקה", ICON.trash, "danger small", function () {
        db.remove(s.id).then(refresh).catch(function (e) { toast("המחיקה נכשלה: " + e.message, true); });
      }));
      row.appendChild(actions);
    }

    li.appendChild(row);
    return li;
  }

  /* The same width the stylesheet calls narrow, asked in JavaScript, because
     one of the things that changes at this width is not a style: below it the
     song cannot be edited at all. Keeping the number in both places would be
     two numbers waiting to disagree, so this one is the copy that is commented
     as one (see the media queries in style.css). */
  var NARROW = window.matchMedia("(max-width: 620px)");

  /* --- one song ------------------------------------------------------------
     ONE SCREEN, NOT TWO. There is no editor to go to and come back from: the
     song you are looking at is the song you are changing, and signing in is
     the only difference between reading it and writing it.

     Which is the same idea a line already worked on, one level up. The words
     on screen are the input; there was never a reason for the page around them
     to be a different page. */

  function viewSong(slug) {
    /* a song that does not exist yet is still a song page, with nothing on it */
    if (slug === null) {
      return renderSong({
        id: null, slug: "", title: "", lyrics_by: "", music_by: "",
        dir: "rtl", lines: [blankLine()],
      });
    }

    setBusy("טוען את השיר");
    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);
      if (song.status && song.status !== "ready") return viewPending(song);
      song.lines = normalizeLines(song.lines);
      renderSong(song);
    }).catch(fail);
  }

  function renderSong(song) {
    document.title = (song.title || "שיר חדש") + " | אקורדים";

    /* Signed in AND on a screen with room. Nothing is switched on or off after
       this: signing in re-runs the route, which comes back through here.

       A phone is for playing from, not for editing on. Every gesture the editor
       has is a small one over a small target, dragging a chord onto one letter
       out of forty, and a finger on a moving page cannot do any of them: what
       it does instead is scroll the song sideways and drop a chord somewhere
       nobody asked for. So the phone reads, and the desk writes. */
    var editing = auth.in && !NARROW.matches;

    /* A song opens on its EASY version: transposed down by whatever capo turns
       its chords into the fewest barres. So the number differs from song to
       song, because it is a property of the song rather than a preference, and
       a negative transposition is exactly what a capo is. Moving it is still
       one button away, and 0 is the song as written. */
    var semis = -easyVersion(chordsUsed(song.lines)).capo;

    /* the size follows the reader from song to song. The transposition does
       not: it belongs to the one song it was worked out for. */
    var size = readingSize();

    app.innerHTML = "";

    /* --- the head: the way back, the name, and who made it --- */

    var head = el("div", "song-head");

    var titleRow = el("div", "title-row");
    /* Pointing the way it goes. ICON.back is a chevron for a left-to-right
       page; here the list is behind you to the right. */
    titleRow.appendChild(iconBtn('<path d="M9 5l7 7-7 7"/>', "לרשימת השירים", function () {
      go(BASE + "/");
    }));

    var title = el("h1", null, song.title);
    if (editing) {
      makeEditable(title);
      title.addEventListener("input", function () { song.title = title.textContent.trim(); mark(); });
      title.addEventListener("keydown", function (event) {
        /* one line, so Enter is not a newline here, it is done */
        if (event.key === "Enter") { event.preventDefault(); title.blur(); }
      });
    }
    titleRow.appendChild(title);
    head.appendChild(titleRow);

    var byFields = [];
    if (editing) {
      /* The credits, and the direction, on the song itself. They belong to it
         and there is no other page to keep them on any more. */
      var meta = el("div", "song-meta");

      byFields = CREDITS.map(function (c) {
        var label = el("label", null, c.label);
        var input = el("input");
        input.type = "text";
        input.value = song[c.field] || "";
        input.addEventListener("input", function () { song[c.field] = input.value; mark(); });
        label.appendChild(input);
        meta.appendChild(label);
        return input;
      });

      /* Finished from the names already on the other songs. A plain datalist,
         so the browser does the filtering, the arrow keys and the touch
         keyboard, and an unlisted name is still just a name that gets typed. */
      var known = el("datalist");
      known.id = "credit-names";
      byFields.forEach(function (input) { input.setAttribute("list", known.id); });
      meta.appendChild(known);
      db.names().then(function (names) {
        if (!known.isConnected) return;
        names.forEach(function (name) {
          var option = el("option");
          option.value = name;
          known.appendChild(option);
        });
      });

      var dirLabel = el("label", null, "כיוון");
      var dirSelect = el("select");
      [["rtl", "עברית, מימין לשמאל"], ["ltr", "אנגלית, משמאל לימין"]].forEach(function (o) {
        var option = el("option", null, o[1]);
        option.value = o[0];
        dirSelect.appendChild(option);
      });
      dirSelect.value = song.dir || "rtl";
      dirSelect.addEventListener("change", function () { song.dir = dirSelect.value; draw(); mark(); });
      dirLabel.appendChild(dirSelect);
      meta.appendChild(dirLabel);

      head.appendChild(meta);
    } else {
      /* Reading it, the credits are a sentence rather than a form, and it
         matters which is which: whoever wrote the words is rarely the one you
         heard sing them. */
      var by = credits(song);
      if (by.length) {
        head.appendChild(el("div", "by", by.map(function (c) {
          return c.label + ": " + c.name;
        }).join("  •  ")));
      }
    }

    app.appendChild(head);

    /* --- the tools --- */

    var tools = el("div", "tools");

    /* Less and more, side by side, and the same shape for both controls. The
       count sits with its label rather than between the two buttons, so that
       transposition and size are laid out identically and neither has to be
       read differently from the other. */
    function stepper(label, less, more) {
      var step = el("span", "step");
      step.appendChild(iconBtn('<path d="M5 12h14"/>', "פחות " + label, less));
      step.appendChild(iconBtn(ICON.plus, "יותר " + label, more));
      return step;
    }

    var value = el("span", "val", "0");
    tools.appendChild(el("span", "lbl", "טרנספוזיציה"));
    tools.appendChild(value);
    tools.appendChild(stepper(
      "טרנספוזיציה",
      function () { setSemis(semis - 1); },
      function () { setSemis(semis + 1); }
    ));

    tools.appendChild(el("span", "sep"));
    tools.appendChild(el("span", "lbl", "גודל"));
    tools.appendChild(stepper(
      "גודל",
      function () { setSize(size - 1); },
      function () { setSize(size + 1); }
    ));

    tools.appendChild(el("span", "grow"));

    /* Printing is what you came to this page to do second, after playing from
       it, so it is a whole button with its name on it. Deleting is the thing
       you almost never mean and can never take back, so it is one quiet icon
       standing on its own, and it asks before it does anything. */
    tools.appendChild(button("הדפסה", ICON.print, "small", function () { window.print(); }));

    /* Three ways back, each smaller than the last, and none of them there
       until it has something to undo:

         undo, one step at a time, also on Ctrl+Z
         back to the original, the whole way, in one press
         and save, which is the only one that writes anything. */
    var undoBtn = iconBtn(ICON.undo, "ביטול הפעולה האחרונה", undo);
    var revertBtn = button("החזרה למקור", null, "ghost small", revert);
    /* THE SAVE BUTTON IS NOT THERE UNTIL THERE IS SOMETHING TO SAVE. On a page
       that is always editable, a button that is always present says nothing;
       one that appears the moment something changes says exactly what it is
       for, and its absence is the answer to "did that get saved". */
    var saveBtn = button("שמירה", null, "small", save);
    undoBtn.hidden = true;
    revertBtn.hidden = true;
    saveBtn.hidden = true;

    if (editing) {
      if (song.id) {
        var trash = iconBtn(ICON.trash, "מחיקת השיר", removeSong);
        trash.classList.add("quiet");
        tools.appendChild(trash);
      }
      tools.appendChild(undoBtn);
      tools.appendChild(revertBtn);
      tools.appendChild(saveBtn);
    }
    app.appendChild(tools);

    /* Inside the sheet, so it prints with the song: the shapes are useless to
       anyone who does not know where the capo goes. */
    var capo = el("div", "capo-line");
    var sheet = el("div", "sheet" + (editing ? " ed" : ""));
    sheet.style.setProperty("--song-size", size + "px");
    app.appendChild(sheet);

    var addRow = null;
    if (editing) {
      addRow = el("div", "ed-bar");
      addRow.appendChild(button("שורה בסוף", ICON.plus, "ghost small", function () {
        song.lines.push(blankLine());
        draw();
        focusLine(song.lines.length - 1);
        mark();
      }));
      addRow.appendChild(button("כותרת קטע", ICON.section, "ghost small", function () {
        song.lines.push({ type: "section", text: "פזמון", chords: [] });
        draw();
        focusLine(song.lines.length - 1);
        mark();
      }));
      app.appendChild(addRow);
    }

    var rtl = function () { return (song.dir || "rtl") === "rtl"; };

    function draw() {
      sheet.innerHTML = "";
      sheet.dir = song.dir || "rtl";

      /* A chord shown a fret below what the song is in is a chord you play with
         a capo there, so the sheet says where the capo goes, and says nothing
         otherwise: raising the key is not a capo, and the control above already
         shows by how much. */
      capo.textContent = semis < 0 ? "קפו " + (-semis) : "";
      capo.hidden = semis >= 0;
      sheet.appendChild(capo);

      song.lines.forEach(function (line, index) {
        sheet.appendChild(editing ? editRow(line, index) : viewLine(line, semis));
      });
      requestAnimationFrame(function () { layoutAll(sheet, rtl()); });
    }

    /* Round, not against a wall. Past the top it comes out at the bottom and
       the other way about, so reaching a distant key is never a matter of
       pressing the other button eleven times. */
    function setSemis(next) {
      semis = next > 11 ? -11 : next < -11 ? 11 : next;
      value.textContent = semis > 0 ? "+" + semis : String(semis);
      draw();
    }

    function setSize(next) {
      size = readingSize(next);
      sheet.style.setProperty("--song-size", size + "px");
      requestAnimationFrame(function () { layoutAll(sheet, rtl()); });
    }

    /* --- what has changed ----------------------------------------------------
       The song as it would be saved, in one string. Comparing that against the
       string it was loaded as is the whole of "is there anything to save": it
       cannot miss a change and cannot invent one, which no counting of events
       could promise. A song is a few hundred characters, so it costs nothing to
       ask after every keystroke. */
    function snapshot() {
      return JSON.stringify([
        String(song.title || "").trim(),
        CREDITS.map(function (c) { return String(song[c.field] || "").trim(); }),
        song.dir || "rtl",
        songToText(song.lines),
      ]);
    }

    /* --- taking it back ------------------------------------------------------
       Every state the song has passed through since it was loaded, so that any
       of them can be come back to. They are the same strings `snapshot` makes,
       which is why undo can restore chords and line order and not only text:
       there is nothing about the song that the string leaves out.

       A song is a few hundred characters and this holds one string per change,
       so the whole history of an evening's editing is smaller than the picture
       it was read from. */
    var saved = snapshot();
    var current = saved;
    var history = [];
    var lastPush = 0;
    var restoring = false;

    /* Typing is not one change per keystroke, and an undo that gives back one
       letter is not an undo. States arriving within a moment of each other do
       not each get a place: the one already on the stack is the state before
       the burst, which is where undo should land. */
    var BURST = 600;

    function mark() {
      var now = snapshot();

      if (!restoring && now !== current) {
        var when = Date.now();
        if (!history.length || when - lastPush > BURST) {
          history.push(current);
          lastPush = when;
        }
        current = now;
      }

      saveBtn.hidden = now === saved;
      revertBtn.hidden = now === saved;
      undoBtn.hidden = !history.length;

      keepDraft(now);
    }

    /* Back to a state, whole: the words, the chords, the order of the lines,
       the credits and the direction. Everything outside the sheet is written
       back too, because a title that still shows what was undone is a page
       lying about what it holds. */
    function restore(state) {
      var was = JSON.parse(state);
      restoring = true;

      song.title = was[0];
      CREDITS.forEach(function (c, index) { song[c.field] = was[1][index] || ""; });
      song.dir = was[2] || "rtl";
      song.lines = normalizeLines(was[3]);

      if (title.textContent !== song.title) title.textContent = song.title;
      byFields.forEach(function (input, index) { input.value = was[1][index] || ""; });
      if (dirSelect) dirSelect.value = song.dir;

      draw();
      current = snapshot();
      restoring = false;
      mark();
    }

    function undo() {
      if (!history.length) return;
      restore(history.pop());
    }

    function revert() {
      if (current === saved) return;
      history.length = 0;
      restore(saved);
    }

    /* --- the draft -----------------------------------------------------------
       Walking away does not lose anything. Every change is written to this
       browser as it is made, so closing the tab, going back to the list, or
       shutting the laptop and opening the song tomorrow finds it exactly as it
       was left, with the save button still up and the way back still offered.

       WRITTEN ON EVERY CHANGE rather than on the way out, and that is the whole
       design. A page has too many ways to end for any of them to be the one
       that saves: back, forward, a link, a closed tab, a phone that sleeps, a
       crash. None of those can be relied on to run code. A change that is
       already written down does not need to be caught leaving.

       It stays in this browser and not in the database. A draft is a
       half-finished thought, and the song everyone else opens should be the
       last one that was finished. Saving throws it away, and so does taking the
       changes back: in both cases the page and the song agree again, and there
       is nothing left for a draft to remember. */
    function draftKey() {
      return "chords:draft:" + (song.id || "new");
    }

    function keepDraft(state) {
      try {
        if (state === saved) localStorage.removeItem(draftKey());
        else localStorage.setItem(draftKey(), JSON.stringify({ base: saved, state: state }));
      } catch (e) { /* a private window has nowhere to keep it, and that is survivable */ }
    }

    /* A draft also remembers WHAT IT WAS A CHANGE TO, and that is not
       ceremony. A song saved from another tab, or read again from a picture,
       leaves a draft describing a song that is no longer there; laying it back
       down would silently undo the newer one. So it is dropped instead, and
       only a draft whose ground has not moved is offered back. */
    function takeDraft() {
      var kept = null;
      try { kept = JSON.parse(localStorage.getItem(draftKey()) || "null"); } catch (e) { kept = null; }
      if (!kept || typeof kept.state !== "string") return;

      if (kept.base !== saved || kept.state === saved) return keepDraft(saved);

      restore(kept.state);
      toast("יש כאן שינויים שלא נשמרו");
    }

    /* The net under the explicit calls. A chord dragged, a chord picked, a line
       split, a line carried up the page: all of them end in a pointer coming up
       or an input landing inside the sheet, and catching them here means a new
       way to change a song cannot quietly arrive without the button noticing. */
    if (editing) {
      sheet.addEventListener("input", mark);
      sheet.addEventListener("pointerup", function () { setTimeout(mark, 0); });

      /* Ctrl+Z, taken from the browser on purpose. Its own undo knows about the
         letters in one editable line and nothing about a chord that moved or a
         verse that changed places, so it would give back half of what it was
         asked for. Capture, so it never reaches the line at all. */
      var onKey = function (event) {
        if (!sheet.isConnected) return document.removeEventListener("keydown", onKey, true);
        if (!(event.ctrlKey || event.metaKey) || String(event.key).toLowerCase() !== "z") return;
        event.preventDefault();
        undo();
      };
      document.addEventListener("keydown", onKey, true);
    }

    /* --- one editable line ---------------------------------------------------
       There is no edit mode and no field. The words on screen ARE the input:
       the same spans the reader sees, made editable in place, so nothing moves,
       nothing grows a border and nothing changes size when you click into it.
       Every keystroke re-measures, so a chord stays over its syllable while the
       words under it are still being typed.

       Chords are held by object, never by index: a chord can be deleted or a
       line split while a handler from before is still bound, and an index would
       quietly start pointing at its neighbour. */
    function editRow(line, index) {
      /* The same shrunken blank line the reader sees. It is still a full line
         to type into: the height is a floor, and the first character typed
         pushes past it. */
      var blank = line.type !== "section" && !line.text.trim() && !line.chords.length;
      var ln = el("div", "ln" + (line.type === "section" ? " is-section" : blank ? " is-blank" : ""));
      ln.dataset.index = index;

      if (line.type === "section") {
        var heading = el("div", "ln-section", line.text);
        makeEditable(heading);
        heading.addEventListener("input", function () { line.text = heading.textContent; });
        heading.addEventListener("keydown", function (event) { lineKeys(event, line, heading); });
        ln.appendChild(heading);
      } else {
        var lane = el("div", "ln-c");
        line.chords.forEach(function (chord) {
          var node = chordEl(chord.chord, chord.pos, semis);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
        });

        /* an empty spot in the chord lane is where a chord is born */
        lane.addEventListener("pointerdown", function (event) {
          if (event.target !== lane) return;
          event.preventDefault();
          var chord = { pos: posFromX(ln, event.clientX, rtl()), chord: "" };
          line.chords.push(chord);
          var node = chordEl("", chord.pos, semis);
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

          /* A space typed at the end of editable text is inserted by the
             browser as a NON-BREAKING space, so that it cannot be collapsed
             away. Here nothing collapses anything (white-space: pre), and a
             song carrying two kinds of space that look identical is a song
             where padding, trimming and searching all quietly disagree. Same
             length, so the caret still points where it pointed. */
          var next = text.textContent.replace(/ /g, " ");

          /* The new positions are written ONTO the chords, not swapped in as
             new objects. Everything that can move a chord after this, the drag
             handlers, the picker, the swap, holds a chord by identity, and a
             fresh array would leave every one of them holding something that is
             no longer part of the line: the chord would appear to move and then
             be gone at the next redraw, and gone from what was saved. */
          var moved = remapChords(line.text, next, line.chords, caret);
          line.chords.forEach(function (c, i) { c.pos = moved[i].pos; });
          line.text = next;

          /* rebuilt from the model, which is what turns the browser's
             non-breaking space back into an ordinary one on screen too */
          fillSpans(text, next);
          if (caret !== null) placeCaret(text, caret);

          /* A blank line has no chord lane, because a line with no characters
             has nothing for a chord to sit over. The first character typed
             gives it one, and the last character deleted takes it away again.
             Without this the lane a line was BORN without never comes back,
             and there is nowhere to put a chord on it ever again. */
          ln.classList.toggle("is-blank", !next.trim() && !line.chords.length);

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

      /* The one thing beside a line, at the end of it and only under the
         pointer: the grip that carries the whole line, chords and words
         together, up and down the song. Everything else a line can have done
         to it is done from the keyboard, which is why there is one of these
         and not a row of them. */
      var grip = el("button", "ln-grip");
      grip.type = "button";
      grip.title = "גרירה כדי להזיז את השורה";
      grip.tabIndex = -1;
      grip.appendChild(svg(ICON.grip));
      bindGrip(grip, ln);
      ln.appendChild(grip);

      return ln;
    }

    /* --- moving a line ------------------------------------------------------
       The row's own element travels, and the song's array travels with it. It
       is NOT redrawn as it goes, and that is the whole design: a redraw would
       destroy the element the finger is holding, and the drag would end on its
       first movement. So the DOM node is moved and the model is spliced to
       match, and the two stay in step because a line and a row are one to one
       and always in the same order. */
    function rowsOf() {
      return Array.prototype.slice.call(sheet.querySelectorAll(".ln"));
    }

    function reindex() {
      rowsOf().forEach(function (ln, index) { ln.dataset.index = index; });
    }

    function bindGrip(grip, ln) {
      var held = false;

      grip.addEventListener("pointerdown", function (event) {
        event.preventDefault();
        event.stopPropagation();
        closePicker();
        held = true;
        grip.classList.add("is-held");
        ln.classList.add("is-moving");
        grip.setPointerCapture(event.pointerId);
      });

      grip.addEventListener("pointermove", function (event) {
        if (!held || !grip.hasPointerCapture(event.pointerId)) return;

        var rows = rowsOf();
        var from = rows.indexOf(ln);
        if (from < 0) return;

        /* Where the pointer is, said in rows. Going up it is the FIRST row
           above whose middle has been passed; going down it is the LAST one
           below. Midpoints rather than edges, so a row swaps when the pointer
           is properly over it and not the moment it grazes its border. */
        var to = from;
        for (var i = 0; i < rows.length; i++) {
          if (i === from) continue;
          var box = rows[i].getBoundingClientRect();
          var middle = box.top + box.height / 2;
          if (i < from && event.clientY < middle) { to = i; break; }
          if (i > from && event.clientY > middle) to = i;
        }
        if (to === from) return;

        song.lines.splice(to, 0, song.lines.splice(from, 1)[0]);
        if (to > from) sheet.insertBefore(ln, rows[to].nextSibling);
        else sheet.insertBefore(ln, rows[to]);
      });

      grip.addEventListener("pointerup", function (event) {
        if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
        stop();
      });
      grip.addEventListener("pointercancel", stop);

      function stop() {
        if (!held) return;
        held = false;
        grip.classList.remove("is-held");
        ln.classList.remove("is-moving");
        /* the rows moved, so the numbers that Tab and Enter navigate by have
           to catch up */
        reindex();
        mark();
      }
    }

    /* The keys that shape a document, doing what they do everywhere else.

       Enter cuts the line at the caret and the rest of it becomes the next
       line. Backspace at the very start pulls this line up onto the one
       before. Delete at the very end pulls the next one up onto this. In every
       case the chords travel with the characters they name, which is what the
       whole format is for. Nothing here saves anything: that is the Save
       button's job and nobody else's. */
    function lineKeys(event, line, editable) {
      var index = song.lines.indexOf(line);
      var at = caretIndex(editable);
      var spread = window.getSelection && window.getSelection().rangeCount && !window.getSelection().isCollapsed;

      if (event.key === "Enter") {
        event.preventDefault();
        var halves = splitLine(line, at == null ? line.text.length : at);
        song.lines.splice(index, 1, halves[0], halves[1]);
        draw();
        focusLine(index + 1, 0);
        mark();

      } else if (event.key === "Backspace" && !spread && at === 0 && index > 0) {
        event.preventDefault();
        var seam = song.lines[index - 1].text.length;
        song.lines.splice(index - 1, 2, joinLines(song.lines[index - 1], line));
        draw();
        focusLine(index - 1, seam);
        mark();

      } else if (event.key === "Delete" && !spread && at === line.text.length && index < song.lines.length - 1) {
        event.preventDefault();
        var end = line.text.length;
        song.lines.splice(index, 2, joinLines(line, song.lines[index + 1]));
        draw();
        focusLine(index, end);
        mark();

      } else if (event.key === "Escape") {
        event.preventDefault();
        editable.blur();

      } else if (event.key === "Tab") {
        event.preventDefault();
        focusLine(index + (event.shiftKey ? -1 : 1));
      }
    }

    function focusLine(index, caret) {
      var ln = sheet.querySelector('.ln[data-index="' + index + '"]');
      if (!ln) return;
      var editable = ln.querySelector(".ln-t, .ln-section");
      if (!editable) return;
      editable.focus();
      placeCaret(editable, caret == null ? editable.textContent.length : caret);
    }

    /* --- a chord ------------------------------------------------------------
       Two gestures on one element. Dragging slides it along the line, in pixels
       on the screen and in characters in the model, and moves NOTHING else.
       Letting go without having moved opens the small list of chords the song
       already uses. */
    function bindChord(node, ln, line, chord) {
      var dragging = false, from = 0, grab = 0;

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
          /* A chord is grabbed somewhere in the middle of its own label, and
             what it is anchored to is the middle of a character. Remember the
             difference at the moment the drag begins and keep it, or the chord
             snaps that far sideways on the first pixel of movement. */
          grab = (chord.pos + 0.5) - posFromX(ln, event.clientX, rtl());
        }

        /* The hand moves in pixels, the song moves in characters. The chord is
           DRAWN wherever the hand is, so the drag is smooth, and RECORDED on
           the character its middle is over, so what is stored still names a
           letter. `raw` is that middle in character coordinates, so the
           character carrying it is the one it falls INSIDE: floor, not round.
           The only visible cost is half a character of settling on release. */
        var raw = Math.max(0, posFromX(ln, event.clientX, rtl()) + grab);
        var pos = Math.max(0, Math.floor(raw));
        var previous = chord.pos;

        /* A chord that has been pulled past the last word: the LINE grows to
           meet it, in spaces, so it still names a character of its own line. */
        if (padTo(line, pos)) {
          fillSpans(ln.querySelector(".ln-t"), line.text);
        }

        placeChord(ln, node, rtl(), positionOf(metrics(ln, rtl()), raw));
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
        if (!dragging) return openPicker(node, ln, line, chord);

        /* let go: the chord settles onto its character, and any spaces the drag
           called for and no longer needs go back */
        if (trimPadding(line)) fillSpans(ln.querySelector(".ln-t"), line.text);
        layoutLine(ln, rtl());
        mark();
      });

      node.addEventListener("pointercancel", function () {
        dragging = false;
        node.classList.remove("is-dragging");
      });
    }

    /* --- picking a chord ------------------------------------------------------
       A song uses five or six chords, over and over. So a click offers exactly
       those, taken from the song itself, and the field is there for the one
       that is not on the list yet.

       WHAT IS OFFERED IS WHAT IS ON SCREEN. The sheet may be showing the song
       several frets down, so the names here are transposed to match it, while
       what gets STORED is always the song's own. A chord chosen from the list
       carries its untransposed name with it and needs no arithmetic; only a
       name typed by hand has to be turned back. */

    var picker = null;
    var pickerDismissed = null;

    function closePicker() {
      if (!picker) return;
      picker.remove();
      picker = null;
      document.removeEventListener("pointerdown", closeOnOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);

      /* Clicking the empty lane puts down a chord with no name yet, and the
         picker is what names it. Walking away instead has to take it back with
         it, or the line keeps an invisible chord nobody asked for. */
      var dismissed = pickerDismissed;
      pickerDismissed = null;
      if (dismissed) dismissed();
    }

    function closeOnOutside(event) { if (picker && !picker.contains(event.target)) closePicker(); }
    function closeOnEscape(event) { if (event.key === "Escape") closePicker(); }

    /* every chord in this song, once each, A to Z by the name being shown.
       Sorted here rather than in the order they appear, so the same chord is
       always in the same place in the row and reaching for it becomes muscle
       memory. The index sorts them the other way, by first appearance, because
       there it is describing the song rather than offering a choice. */
    function chordsInSong() {
      return chordsUsed(song.lines).map(function (name) {
        return { name: name, shown: transposeChord(name, semis) };
      }).sort(function (a, b) { return a.shown.localeCompare(b.shown, "en"); });
    }

    /* One small row: somewhere to write a chord, the chords this song already
       uses, and an × to take this chord off.

       THE FIELD IS FIRST AND IT IS ALWAYS THERE. It used to be a +, on the
       argument that a song arrives with its own five chords and putting one
       down is choosing rather than typing. That is true and it was still a
       click in the way of the other half of the work, the chord this song does
       not have yet, and the click had to be found before it could be made.

       Both are offered at once now, and they are not two things: what is typed
       into the field is also what narrows the row under it, so the same gesture
       reaches a chord that is already in the song and one that is not. */
    function openPicker(node, ln, line, chord) {
      closePicker();

      picker = el("div", "picker");
      picker.dir = "ltr";
      document.body.appendChild(picker);

      function drop() {
        line.chords.splice(line.chords.indexOf(chord), 1);
        node.remove();
        layoutLine(ln, rtl());
        mark();
      }

      /* `name` is the song's own, never the transposed one */
      function finish(name) {
        var value = String(name || "").trim().slice(0, 16);
        if (!value || !isChord(value)) return drop();
        chord.chord = value;
        node.textContent = transposeChord(value, semis);
        layoutLine(ln, rtl());
        mark();
      }

      function commit(name) {
        pickerDismissed = null;
        closePicker();
        finish(name);
      }

      /* typed against what is on screen, so it comes back down to the song's
         own key before it is kept */
      function untranspose(typed) {
        var value = String(typed || "").trim();
        return value && isChord(value) ? transposeChord(value, -semis) : value;
      }

      function chip(cls, label, title, onClick) {
        var b = el("button", cls, label);
        b.type = "button";
        if (title) b.title = title;
        b.addEventListener("click", onClick);
        picker.appendChild(b);
        return b;
      }

      var field = el("input", "picker-field");
      field.type = "text";
      field.dir = "ltr";
      field.value = transposeChord(chord.chord, semis);
      field.placeholder = "Am";
      field.setAttribute("aria-label", "אקורד");
      picker.appendChild(field);

      var found = el("div", "picker-found");
      picker.appendChild(found);

      /* only when there is something to remove: a chord being put down for the
         first time has no name yet, so an × would be offering to delete a
         choice that has not been made */
      if (chord.chord) chip("picker-x", "×", "הסרת האקורד", function () { commit(""); });

      /* What the row under the field is showing. An empty field offers the
         song's own chords, which is nearly always the answer and is why they
         come first. A letter answers with that letter's chords, and every
         keystroke after it narrows them down, matched anywhere in the name.

         Both shapes carry the name twice, because the two are not the same
         string on a transposed song: `name` is the chord in the song's own key,
         which is what gets kept, and `shown` is the one on screen. */
      function offers(value) {
        if (!value) return chordsInSong();
        return suggestChords(value).slice(0, 18).map(function (shown) {
          return { name: untranspose(shown), shown: shown };
        });
      }

      /* Not a chord is still not a chord: the field says so, refuses to close on
         it, and a way out that is not Enter drops it rather than writing "W"
         into the song. */
      function refresh() {
        var value = field.value.trim();
        field.classList.toggle("is-bad", !!value && !isChord(value));

        found.textContent = "";
        offers(value).forEach(function (one) {
          var on = value ? one.shown === value : one.name === chord.chord;
          var hit = el("button", "picker-chip" + (on ? " is-on" : ""), one.shown);
          hit.type = "button";
          hit.addEventListener("click", function () { commit(one.name); });
          found.appendChild(hit);
        });
        place();
      }

      field.addEventListener("input", refresh);
      field.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (field.value.trim() && !isChord(field.value)) {
          /* half a chord with a list under it: Enter takes the first of them */
          if (found.firstChild) return commit(untranspose(found.firstChild.textContent));
          return refresh();
        }
        commit(untranspose(field.value));
      });

      /* Enter is one way out of the field, not the only one. Clicking
         elsewhere, or Escape, keeps what was typed too: a chord typed and then
         lost to a stray click is the kind of thing you only notice two verses
         later. */
      pickerDismissed = function () { finish(untranspose(field.value)); };

      refresh();
      place();
      field.focus();
      field.select();
      document.addEventListener("pointerdown", closeOnOutside, true);
      document.addEventListener("keydown", closeOnEscape, true);

      /* under the chord, pulled back inside the window if it would hang out */
      function place() {
        var box = node.getBoundingClientRect();
        var width = picker.offsetWidth;
        var left = Math.min(Math.max(6, box.left + box.width / 2 - width / 2), window.innerWidth - width - 6);
        var top = box.bottom + 4;
        if (top + picker.offsetHeight > window.innerHeight - 6) top = Math.max(6, box.top - picker.offsetHeight - 4);
        picker.style.left = left + "px";
        picker.style.top = top + "px";
      }
    }

    /* --- saving ------------------------------------------------------------
       No navigation afterwards, because there is nowhere to go: this is already
       the page the saved song lives on. The address follows the name if the
       name changed, and the button goes away, which is the receipt. */
    function save() {
      var name = String(song.title || "").trim();
      if (!name) { title.focus(); return toast("צריך שם לשיר", true); }

      saveBtn.disabled = true;
      var payload = {
        title: name,
        dir: song.dir || "rtl",
        lines: songToText(song.lines),
      };
      CREDITS.forEach(function (c) { payload[c.field] = String(song[c.field] || "").trim(); });

      /* typing a song by hand is what makes a failed read stop being failed.
         A column that is not in the table yet is dropped by `shed` on the way
         out, so naming it here is safe. */
      payload.status = "ready";
      payload.status_note = "";

      attempt(song.id && song.slug ? song.slug : slugify(name), 1);

      function attempt(slug, tries) {
        payload.slug = slug;
        var request = song.id ? db.update(song.id, payload) : db.insert(payload);
        request.then(function (row) {
          saveBtn.disabled = false;
          /* A song typed from nothing kept its draft under "new", and it is
             about to have an id of its own. Take the old one out by hand: mark()
             below can only clear the key the song has now. */
          var wasKey = draftKey();
          song.id = row.id;
          song.slug = row.slug;
          /* this is the state to come back to now, and the way back to the one
             before it went out with the write */
          saved = snapshot();
          current = saved;
          history.length = 0;
          mark();
          if (wasKey !== draftKey()) {
            try { localStorage.removeItem(wasKey); } catch (e) { /* nothing was kept */ }
          }

          document.title = name + " | אקורדים";
          var here = BASE + "/" + encodeURIComponent(row.slug);
          if (decodeURIComponent(location.pathname) !== decodeURIComponent(here)) {
            history.replaceState(null, "", here);
          }

          /* A column the table does not have yet is dropped on the way out so
             the song itself still lands, and that has to be SAID. A name typed
             into a field and then quietly discarded looks exactly like a bug in
             the field, and the person who typed it has no way to tell the
             difference or anything to do about it. */
          var lost = CREDITS.filter(function (c) { return payload[c.field] && !has(c.field); });
          if (lost.length) {
            toast("השיר נשמר, אבל " + lost.map(function (c) { return c.label; }).join(" ו") +
              " לא. צריך להריץ את schema.sql ב-Supabase.", true);
          } else {
            toast("נשמר");
          }
        }).catch(function (error) {
          /* 23505 is the unique index on slug: two songs with the same name */
          if (error.code === "23505" && tries < 30) return attempt(slugify(name) + "_" + (tries + 1), tries + 1);
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

    /* through setSemis, not straight to draw: the counter is written there and
       nowhere else, so starting any other way leaves it reading 0 over a song
       that is being shown seven frets down */
    setSemis(semis);
    relayoutOn(sheet, rtl);

    /* last, once the page is whole, because taking a draft back means writing
       into the title, the credits and every line of the sheet, and all of them
       have to exist first. Only where they can be written into at all: a phone
       or a signed-out reader is looking at the saved song, and should be told
       the truth about it. */
    if (editing) takeDraft();
    if (editing && !song.id) title.focus();
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

    if (song.status === "reading" && !stalled(song)) {
      var busy = el("span", "busy");
      busy.appendChild(el("span", "spin"));
      var note = el("span");
      note.dataset.since = Date.parse(song.created_at || "") || Date.now();
      note.dataset.stage = song.status_note || "ממתין";
      elapsed(note);
      busy.appendChild(note);
      box.appendChild(busy);
      box.appendChild(el("p", "muted", "הקריאה ממשיכה גם בלי הדף הזה."));
      tick(box);
      setTimeout(function () { if (box.isConnected) viewSong(song.slug); }, 5000);
    } else {
      box.appendChild(el("p", null, stalled(song)
        ? "הקריאה של " + song.title + " נתקעה ולא הסתיימה."
        : "הקריאה של " + song.title + " נכשלה."));
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

  /* --- reading a photo or a PDF -------------------------------------------- */

  var MAX_BYTES = 12 * 1024 * 1024;
  /* Several songs go up together, one per file, each its own reading. They
     travel in ONE request: the Worker brakes uploads rather than files, and a
     folder of sheets should be one action rather than nine refusals. */
  var MAX_SONGS = 10;
  /* The long edge a picture is sent at, and it is the model's own ceiling
     rather than a number picked here: anything larger is resized on arrival, so
     pixels above this line are paid for and then thrown away. Below it they are
     not free either, and this is where they are worth buying. */
  var MAX_EDGE = 1568;
  /* What one song may weigh, in the base64 it travels as, under the Worker's
     own limit with room to spare. */
  var MAX_DATA = 640 * 1024;
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

  /* Where the writing is, and nothing else.

     A photographed or scanned sheet is mostly blank page: a border of white all
     the way round, and often a wide one. Shrinking the picture to a fixed size
     shrinks that border along with the words, so a good part of what is sent is
     paid for at full price to show nothing.

     Cutting it is free resolution on the only part anybody is looking at, and
     resolution is not a detail on this job. The question being asked of the
     picture is which of two ADJACENT HEBREW LETTERS a chord symbol's middle is
     over, and a letter on a full page at the size that gets sent is about ten
     pixels wide. Every pixel that goes to the margin comes off that ten.

     Found on a small copy rather than on the photograph itself, because this
     runs in a browser on a picture from a phone, and the edge of a block of
     text is not a thing that needs pixels to find. Anything that does not look
     like writing on a page is left alone: a crop that saves nothing, and a crop
     that would throw most of the picture away, are both refused. */
  function inkBox(bitmap) {
    var SCAN = 400;
    var scale = Math.min(1, SCAN / Math.max(bitmap.width, bitmap.height));
    var w = Math.max(1, Math.round(bitmap.width * scale));
    var h = Math.max(1, Math.round(bitmap.height * scale));

    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, w, h);

    var data;
    /* a picture from another origin taints the canvas and cannot be read back;
       there is nothing to do about that but send it whole */
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }

    /* Darker than this counts as ink. Generous on purpose: white paper under a
       kitchen light is grey and unevenly lit, and what is wanted here is the
       edge of the writing, not the writing. */
    var INK = 200;
    var top = h, left = w, right = -1, bottom = -1;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        if (Math.min(data[i], data[i + 1], data[i + 2]) > INK) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    if (right < 0) return null;

    /* a little air, so no letter sits against the cut, and back up to the
       photograph's own scale */
    var pad = Math.round(Math.max(w, h) * 0.012) + 1;
    var box = { x: Math.max(0, (left - pad) / scale), y: Math.max(0, (top - pad) / scale) };
    box.w = Math.min(bitmap.width, (right + pad + 1) / scale) - box.x;
    box.h = Math.min(bitmap.height, (bottom + pad + 1) / scale) - box.y;

    var whole = bitmap.width * bitmap.height;
    if (box.w * box.h > whole * 0.93) return null;      // nothing worth cutting
    if (box.w * box.h < whole * 0.05) return null;      // not a page of writing
    return box;
  }

  /* A photo straight off a phone is four thousand pixels wide and several
     megabytes, and none of that arrives: the model resizes anything past
     MAX_EDGE itself. So the shrinking happens here, where it can be done well.
     A PDF is passed through as it is, because it is already text. */
  function prepare(file) {
    if (file.type === "application/pdf") return toBase64(file);
    if (typeof createImageBitmap !== "function") return toBase64(file);

    return createImageBitmap(file).then(function (bitmap) {
      var box = inkBox(bitmap) || { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
      var scale = Math.min(1, MAX_EDGE / Math.max(box.w, box.h));

      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(box.w * scale));
      canvas.height = Math.max(1, Math.round(box.h * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      /* QUALITY IS GIVEN UP BEFORE PIXELS ARE, and it used to be the other way
         round. What a picture costs to read is decided by its width and height
         alone, so compressing it harder saves nothing at all on the reading and
         only makes room in the request. But compression is exactly what closes
         the gap between two neighbouring letters: squeeze a page of small black
         writing and the edges smear into each other, which is the one thing
         this picture is being sent to answer. So it goes out as sharp as it can
         while still fitting, rather than at a number chosen once. */
      var quality = 0.92;
      var url = canvas.toDataURL("image/jpeg", quality);
      while (url.length > MAX_DATA && quality > 0.45) {
        quality -= 0.08;
        url = canvas.toDataURL("image/jpeg", quality);
      }
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
    if (!has("status")) return toast("צריך להריץ את schema.sql ב-Supabase לפני קריאה מתמונה", true);
    requireAuth(openUploadDialog);
  }

  function openUploadDialog() {
    var dlg = el("dialog", "dlg");
    var box = el("div", "dlg-in");
    box.appendChild(el("h2", null, "שירים מתמונה או PDF"));

    var drop = el("div", "drop");
    drop.appendChild(el("h3", null, "גררו לכאן צילומים של שירים"));
    drop.appendChild(el("p", null,
      "אפשר כמה קבצים יחד, וכל קובץ הוא שיר. המערכת קוראת את המילים ואת האקורדים ומציבה כל אקורד מעל ההברה שהוא יושב עליה בתמונה. השירים נכנסים לתור, אפשר לבטל כל אחד מהם כל עוד הוא ממתין."));

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
      var picked = Array.prototype.slice.call(fileList);
      for (var i = 0; i < picked.length; i++) {
        if (OK_TYPES.indexOf(picked[i].type) < 0) return fail("אפשר תמונות או PDF בלבד.");
        if (picked[i].size > MAX_BYTES) return fail("הקובץ " + picked[i].name + " גדול מדי, עד 12MB.");
      }
      if (!picked.length) return;

      /* ONE FILE IS ONE SONG. No grouping, no guessing which pictures belong
         together: a sheet is a page, and a page is a song. */
      var groups = picked.slice(0, MAX_SONGS).map(function (file) { return [file]; });
      var dropped = picked.length - groups.length;

      status.innerHTML = "";
      status.className = "muted";
      var busy = el("span", "busy");
      busy.appendChild(el("span", "spin"));
      busy.appendChild(document.createTextNode(
        groups.length > 1 ? "מכין " + groups.length + " שירים" : "מכין את הקבצים"));
      status.appendChild(busy);
      close.disabled = true;

      /* Every row made along the way. If the reading never starts, every one of
         them has to go back out: a row left at `reading` waits for something
         that is never coming. */
      var created = [];

      Promise.all(groups.map(function (group) { return Promise.all(group.map(prepare)); }))
        .then(function (prepared) {
          prepared.forEach(function (payloads) {
            var total = payloads.reduce(function (n, p) { return n + p.data.length; }, 0);
            if (total > 700 * 1024) throw new Error("קובץ אחד גדול מדי. נסו צילום קטן יותר, או פחות עמודים לשיר.");
          });

          /* the rows first, so each reading has somewhere to land */
          return Promise.all(prepared.map(function (payloads, index) {
            var name = groups[index][0].name.replace(/\.[^.]+$/, "").trim();
            return insertReading(name || "שיר חדש").then(function (row) {
              created.push(row);
              return { song_id: row.id, files: payloads };
            });
          }));
        })
        .then(function (songs) {
          return auth.token().then(function (token) {
            return fetch(CFG.transcribeEndpoint, {
              method: "POST",
              headers: { "content-type": "application/json", authorization: "Bearer " + token },
              body: JSON.stringify({ songs: songs }),
            });
          });
        })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (body) {
            if (!r.ok || !body.ok) {
              var e = new Error(transcribeError(body, r.status));
              e.detail = body && body.detail;
              throw e;
            }
          });
        })
        .then(function () {
          /* Accepted. Each reading is a Workflow now: it belongs to nobody and
             outlives this page, so there is nothing left to hold on to. The
             finished songs land on their rows, and the list is watching them. */
          created = [];                     // handed over; not ours to undo now

          dlg.close();
          toast(groups.length > 1
            ? groups.length + " שירים בתור. אפשר לסגור את הדף."
            : "קורא את השיר ברקע. אפשר לסגור את הדף.");
          if (dropped > 0) toast("נלקחו " + groups.length + " קבצים בלבד. השאר לא נשלחו.", true);
          if (parts().length === 0) route(); else go(BASE + "/");
        })
        .catch(function (error) {
          created.forEach(function (row) { db.remove(row.id).catch(function () {}); });
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
        dir: "rtl",
        lines: [],
        /* Queued, not reading. The Workflow flips it to `reading` when its turn
           comes, and until then the row can simply be deleted: nothing has been
           spent and there is nothing to undo. */
        status: "queued",
        status_note: "",
      }).catch(function (error) {
        if (error.code === "23505" && tries < 30) return attempt(base + "_" + (tries + 1), tries + 1);
        /* 23514 is the check on `status`, and the only way to meet it here is a
           table whose constraint predates the queue. Say which SQL, because the
           raw complaint names a constraint and not a thing anyone can do. */
        if (error.code === "23514") {
          throw new Error("צריך להריץ מחדש את schema.sql ב-Supabase כדי שהתור יעבוד.");
        }
        throw error;
      });
    }
  }

  function transcribeError(body, status) {
    if (status === 401) return "צריך להתחבר מחדש כדי לקרוא קובץ.";
    if (status === 429) return "רגע אחד, נסו שוב בעוד כמה שניות.";
    if (status === 413) return "הקבצים גדולים מדי. נסו פחות עמודים או צילום קטן יותר.";
    if (body && body.error === "songs") return "אפשר עד " + MAX_SONGS + " שירים בהעלאה אחת.";
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
    /* the header follows the address, because what it offers depends on it */
    paintHeader();
    var p = parts();

    if (!p.length) { document.title = "אקורדים"; return viewIndex(); }

    /* A new song is the song page with nothing on it yet, and it needs somebody
       signed in to be worth opening at all. */
    if (p[0] === "new") {
      if (NARROW.matches) return go(BASE + "/");
      if (!auth.in) return askSignIn(function () { route(); });
      return viewSong(null);
    }

    /* /edit was a page of its own once. The song page IS the editor now, so the
       address still opens the song, and the one in the bar becomes the song's.
       Kept rather than dropped because it is written down in bookmarks and in
       the index's own links from before this. */
    if (p.length >= 2 && p[1] === "edit") {
      history.replaceState(null, "", BASE + "/" + encodeURIComponent(p[0]));
      return viewSong(p[0]);
    }

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
  route();
})();
