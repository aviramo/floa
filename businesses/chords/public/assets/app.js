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
    up: '<path d="M12 19V5m0 0l-6 6m6-6l6 6"/>',
    down: '<path d="M12 5v14m0 0l-6-6m6 6l6-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 13l4 4 10-11"/>',
    /* a clock with a hand going backwards: not this change, the whole way back */
    history: '<path d="M12 8.5V12l2.5 2"/><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M3 4v4h4"/>',
    /* two things moving apart, which is what opening a gap does */
    gap: '<path d="M10 8l-4 4 4 4M14 8l4 4-4 4"/>',
    /* --- the three controls over a song, as pictures ---
       Each has to be recognisable at fifteen pixels by somebody who was not
       told, so each is drawn as the thing itself rather than as an abstraction
       of it: a note for the key the song is in, two letters of different sizes
       for how big the words are, and a capo across the strings of a neck.

       The capo is three strings and a BAR: a thin line across them would be a
       fret, and a fret is not what you clamp on. */
    pitch: '<path d="M8 17V6l9-2v9"/><ellipse cx="5.6" cy="17.2" rx="2.6" ry="2.1"/><ellipse cx="14.6" cy="15.2" rx="2.6" ry="2.1"/>',
    textSize: '<path d="M2 19l5-13 5 13M3.6 15h6.8M14 19l3.3-8.5 3.3 8.5M15.1 16.4h4.4"/>',
    capo: '<path d="M6 3v18M12 3v18M18 3v18"/><path d="M3 8h18" stroke-width="4"/>',
    undo: '<path d="M4 10h9a4.5 4.5 0 0 1 0 9h-5"/><path d="M8 6l-4 4 4 4"/>',
    print: '<path d="M7 9V4h10v5M7 18H5v-6h14v6h-2M8 14h8v6H8z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    person: '<circle cx="12" cy="8" r="3.6"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
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

  /* The label is a span rather than a bare text node for one reason: in the
     top bar of a narrow screen it is the first thing worth dropping, and a
     text node cannot be hidden. See .top-actions in the stylesheet. */
  function button(label, icon, cls, onClick) {
    var b = el("button", "btn" + (cls ? " " + cls : ""));
    b.type = "button";
    if (icon) b.appendChild(svg(icon));
    b.appendChild(el("span", "lb", label));
    /* the same words the button shows, kept for where it shows only the icon */
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  /* Google's mark, in Google's own four colours, which is what they ask of a
     button that carries it. It cannot come from svg() above: that one draws a
     line in whatever colour the text is, and this is four filled shapes and no
     line at all.

     The mark is the whole of what makes this button recognisable, so it is on
     every button that leads to Google and on nothing else. */
  var GOOGLE_MARK =
    '<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.56c2.08-1.92 3.28-4.74 3.28-8.1z"/>' +
    '<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.56-2.77c-.99.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>' +
    '<path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>' +
    '<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z"/>';

  function googleButton(label, cls) {
    var b = el("button", "btn google" + (cls ? " " + cls : ""));
    b.type = "button";
    var mark = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    mark.setAttribute("viewBox", "0 0 24 24");
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = GOOGLE_MARK;
    b.appendChild(mark);
    b.appendChild(el("span", "lb", label));
    b.setAttribute("aria-label", label);
    b.addEventListener("click", function () { auth.signInWithGoogle(); });
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
  /* Where somebody was standing when they went off to Google. A round trip
     through another site loses the page, and the page is usually the point:
     you press "התחברות" on the song you were about to fix. */
  var RETURN_KEY = "chords.return";

  /* WHAT TO CALL THE PERSON IN THE BAR.
     Their own answer first, because a name is theirs to give; then whatever
     Google said about them when they signed in; and an email's first half
     when there is neither, which is at least something a person recognises as
     themselves.

     Their own answer is kept under a key of its own, `display_name`, and not
     over Google's `name`. The provider rewrites what it wrote every time the
     account signs in through it, so a name typed here and stored there would
     quietly come back as the Google one on the next sign in. */
  function nameFrom(meta, email) {
    var said = [meta && meta.display_name, meta && meta.full_name, meta && meta.name];
    for (var i = 0; i < said.length; i++) {
      var name = String(said[i] || "").trim();
      if (name) return name;
    }
    return String(email || "").split("@")[0] || "";
  }

  var auth = {
    session: null,

    load: function () {
      try { this.session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
      catch (e) { this.session = null; }
      return this.session;
    },

    keep: function () {
      try { localStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); }
      catch (e) { /* private window */ }
    },

    save: function (data) {
      var user = data.user || null;
      var meta = (user && user.user_metadata) || null;
      var email = (user && user.email) || (this.session && this.session.email) || "";
      this.session = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || (this.session && this.session.refresh_token) || "",
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        email: email,
        /* An answer that came with this response, else the one already here,
           else the email. The middle one matters on the way back from Google:
           that hands over tokens and nothing about the person, and the name
           arrives a moment later from whoAmI. */
        name: (meta && nameFrom(meta, email)) || (this.session && this.session.name) || nameFrom(null, email),
        /* Whatever else the account already knows about the person, which
           right now is one number: the fret they play at. Kept here so a page
           can be opened without asking the server who is looking at it, and
           taken from the account rather than from this browser, so it is the
           same on the phone on the sofa as on the desk it was set at. */
        capo: meta && typeof meta.capo === "number" ? meta.capo
          : (this.session && typeof this.session.capo === "number" ? this.session.capo : 0),
      };
      this.keep();
    },

    clear: function () {
      this.session = null;
      localStorage.removeItem(SESSION_KEY);
    },

    get in() { return !!(this.session && this.session.refresh_token); },

    /* --- the fret this person plays at ---------------------------------------
       WHERE THE CAPO IS, BECAUSE THEY PUT IT THERE. Not worked out from
       anything: the app used to derive a capo from the transposition, which
       made one number wear two hats and meant the answer to "where is my capo"
       changed every time somebody moved the song. This is the other thing
       entirely, a fact about the player and their guitar, and the sheet simply
       says it.

       A fret, so zero or up: there is no minus second fret. Zero is no capo,
       which is a real answer and the usual one.

       It lives on the ACCOUNT, in the user's own metadata, not in this
       browser. A capo is a fact about a person, and the person is the same
       person on the phone they are holding and the desk they set it at. */
    capo: function () {
      var value = this.session && this.session.capo;
      return typeof value === "number" && value > 0 ? Math.round(value) : 0;
    },

    setCapo: function (value) {
      var self = this;
      var kept = value > 0 ? Math.round(value) : 0;
      /* on screen at once, written behind it: the sheet redrawing is the
         answer to the press, and a fret is not worth waiting on a network for */
      if (this.session) {
        this.session.capo = kept;
        this.keep();
      }
      return this.remember({ capo: kept });
    },

    /* --- what this person is called ------------------------------------------
       A NAME IS THE PERSON'S TO GIVE. Google hands one over at the door and it
       is usually the right one, which is why it is what the bar says without
       anybody being asked. But it is the name on somebody's Google account,
       not necessarily the name they want over their own songs, and the two
       are different often enough that it has to be changeable.

       So it lives on the account, beside the capo, under a key Google does not
       write to: see nameFrom above for why that matters. */
    name: function () {
      return (this.session && this.session.name) || "";
    },

    setName: function (value) {
      var self = this;
      var kept = String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
      if (!kept) return Promise.reject(new Error("צריך שם"));
      return this.remember({ display_name: kept }).then(function () {
        self.session.name = kept;
        self.keep();
      });
    },

    /* One more thing the account knows about the person. Everything in here is
       small and the account is the right place for all of it, because it is
       true of them and not of the browser they happen to be holding. */
    remember: function (data) {
      return this.token().then(function (token) {
        if (!token) throw new Error("צריך להתחבר מחדש");
        return fetch(CFG.supabaseUrl + "/auth/v1/user", {
          method: "PUT",
          headers: {
            apikey: CFG.supabaseAnonKey,
            authorization: "Bearer " + token,
            "content-type": "application/json",
          },
          body: JSON.stringify({ data: data }),
        }).then(function (r) {
          if (!r.ok) throw new Error("לא הצלחנו לשמור");
          return null;
        });
      });
    },

    /* Who the token belongs to, asked of the server. Needed because coming
       back from Google hands over tokens and says nothing at all about the
       person holding them, and their name is the first thing the bar wants.
       Refreshing a token answers both questions in the one response, so it
       never comes here. */
    whoAmI: function () {
      var self = this;
      return this.token().then(function (token) {
        if (!token) return null;
        return fetch(CFG.supabaseUrl + "/auth/v1/user", {
          headers: { apikey: CFG.supabaseAnonKey, authorization: "Bearer " + token },
        }).then(function (r) { return r.ok ? r.json() : null; });
      }).then(function (user) {
        if (!user || !self.session) return null;
        var meta = user.user_metadata || null;
        self.session.email = user.email || self.session.email;
        self.session.name = nameFrom(meta, self.session.email);
        if (meta && typeof meta.capo === "number") self.session.capo = meta.capo;
        self.keep();
        return user;
      }).catch(function () { return null; });
    },

    /* --- the way in through Google -------------------------------------------
       The browser leaves this site, comes back to /chords/ with the tokens in
       the address, and absorbGoogle picks them up. Nothing is exchanged here:
       Supabase's authorize endpoint hands the session straight over when it is
       not asked for a code, and asking for one would mean keeping a verifier
       across a page that is about to be thrown away.

       ONE address is registered as the way back, the app's own front door,
       rather than every song's. Where the person actually was is this side's
       business and it is kept here, which also means a new song's address does
       not have to be one Supabase has been told about. */
    signInWithGoogle: function () {
      try { localStorage.setItem(RETURN_KEY, location.pathname); } catch (e) { /* private window */ }
      var back = location.origin + BASE + "/";
      location.assign(CFG.supabaseUrl + "/auth/v1/authorize?provider=google&redirect_to=" +
        encodeURIComponent(back));
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

  /* --- what kind of song it is ----------------------------------------------
     Several at once, because a song is a circle song and a prayer and a
     lullaby and there is no sense in making anybody pick one of the three.

     Free text, and the vocabulary is whatever the library has used before: a
     fixed list would be a guess made on the first day, and what is offered
     instead is every style already on another song, so the second song of a
     kind gets named the same as the first without anybody having to decide on
     the words in advance. */
  function styles(song) {
    var list = song && song.styles;
    if (!Array.isArray(list)) return [];
    return list.map(function (s) { return String(s || "").trim(); }).filter(Boolean);
  }

  /* Trimmed, deduplicated and in the order they were added. Kept in a plain
     array rather than a set so the order is the author's. */
  function tidyStyles(list) {
    var seen = {};
    var out = [];
    (list || []).forEach(function (raw) {
      var name = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 40);
      if (!name || seen[name]) return;
      seen[name] = true;
      out.push(name);
    });
    return out;
  }

  /* --- whose bill it is -----------------------------------------------------
     One account pays for the readings, and what they cost is that account's
     business and nobody else's.

     THE PRICES ARE IN A TABLE OF THEIR OWN, and that is not tidiness. They
     were two columns on the song, and a column on a row somebody may read is a
     column they may read: row level security is about rows, so no policy on
     the library could have hidden them, and hiding them in this file would
     have hidden them from the page and from nobody else. The rule that keeps
     them is on song_costs, in the database, and this address is the same one
     written there.

     What the check below decides is only whether to ASK. Somebody else asking
     anyway gets an empty answer. */
  var ADMIN = "ofir.aviram@gmail.com";

  function isAdmin() {
    return !!(auth.session && String(auth.session.email || "").toLowerCase() === ADMIN);
  }

  /* What the reading of this song cost, as the Worker counted it from the
     model's own token usage. A song typed by hand has no price and says
     nothing, which is different from one that cost nothing.

     IN SHEKELS, AT THE RATE OF THE DAY IT WAS READ. The price is counted in US
     cents because that is what the bill is in, and it is read in the money the
     person paying it thinks in. The rate is the one kept on the row, never
     today's: a price is a fact about a moment, and converting at the rate of
     whenever the page happens to be open would restate an old reading in this
     morning's money and change the number under a song for no reason a reader
     could see. A row from before the rate was kept says its price in dollars,
     which is at least true. */
  function rateOf(song) {
    var rate = Number(song.usd_ils);
    return isFinite(rate) && rate > 0 ? rate : 0;
  }

  function price(song) {
    if (!isAdmin()) return "";
    if (song.read_cost == null) return "";
    var cents = Number(song.read_cost);
    if (!isFinite(cents)) return "";

    var rate = rateOf(song);
    /* Under the smallest coin is shown as under it rather than as 0.00, which
       reads as free and is a different claim. */
    if (rate) {
      var agorot = cents * rate;
      return agorot < 0.5 ? "פחות מאגורה" : "₪" + (agorot / 100).toFixed(2);
    }
    return cents < 0.5 ? "פחות מסנט" : "$" + (cents / 100).toFixed(2);
  }

  function priceWhy(song) {
    var rate = rateOf(song);
    var said = "עלות הפענוח של השיר הזה";
    if (!rate) return said;
    return said + ", לפי שער " + rate.toFixed(2) + " ביום שבו נקרא";
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
    { columns: ["status", "status_note"] },
    { columns: ["lyrics_by", "music_by"] },
    { columns: ["review"] },
    { columns: ["draft"] },
    { columns: ["published"] },
    { columns: ["styles"] },
  ].map(function (g) { return { columns: g.columns, admin: !!g.admin, on: true }; });

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
  var COSTS = CFG.costTable;

  var db = {
    list: function () {
      var self = this;
      /* Newest change first. A library is not a dictionary: nobody arrives at
         it needing the song that starts with the letter alef, and the song
         being worked on is almost always one of the last few that were
         touched. Looking a song up by name is what the search box is, and it
         finds it wherever it sits. */
      return rest(T + "?select=" + withOptional(LIST_FIELDS) + "&deleted_at=is.null&order=updated_at.desc").then(function (rows) {
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
      }).then(function (rows) {
        return self.withCosts(rows);
      }).catch(function (error) {
        if (!dropMissing(error)) throw error;
        return self.list();
      });
    },

    /* What the readings cost, laid onto the songs they were paid for. A second
       request and a second table, because the prices are the payer's alone and
       a column of the library could never have been (see song_costs in
       schema.sql). Asked for only by that account: everybody else's page skips
       it, and would be answered with nothing if it did not. */
    withCosts: function (rows) {
      if (!isAdmin() || !rows || !rows.length) return rows;
      return rest(COSTS + "?select=song_id,read_cost,usd_ils").then(function (costs) {
        var by = {};
        (costs || []).forEach(function (c) { by[c.song_id] = c; });
        rows.forEach(function (song) {
          var c = by[song.id];
          if (!c) return;
          song.read_cost = c.read_cost;
          song.usd_ils = c.usd_ils;
        });
        return rows;
      }).catch(function () {
        /* a library with no prices on it is still a library */
        return rows;
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
    /* --- deleting, which does not delete --------------------------------------
       A song is an evening's worth of typing, and half of the ones that get
       deleted are deleted by somebody meaning to delete the other one. So the
       row stays exactly as it is and only says when: the library reads the
       living, and everything else is still there to be brought back.

       ITS ADDRESS IS THE ONE THING THAT CANNOT BE KEPT. The slug is unique, so
       a deleted song holding on to its name is a name nobody can use again,
       and the old link would go on opening a song its owner meant to be rid
       of. It is moved aside to a string nothing will ever ask for.

       Published goes too: deleting is taking a song out of the world, and a
       song out of the world that other people can still open is not out of it. */
    remove: function (id) {
      return rest(T + "?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        body: shed({
          deleted_at: new Date().toISOString(),
          published: false,
          slug: "-" + id,
        }),
      });
    },

    /* Everything deleted and not yet gone, newest first: what was deleted a
       minute ago by mistake is what somebody is looking for. */
    deleted: function () {
      var self = this;
      return rest(T + "?select=" + withOptional(LIST_FIELDS + ",deleted_at") +
        "&deleted_at=not.is.null&order=deleted_at.desc")
        .catch(function (error) {
          if (!dropMissing(error)) throw error;
          return self.deleted();
        });
    },

    /* Back into the library, with a NEW address taken from its title the same
       way a new song gets its first, because the old one was thrown away and
       another song may be standing on it by now. 23505 is that other song. */
    restore: function (song) {
      var wanted = slugify(song.title || "");

      var attempt = function (slug, tries) {
        return rest(T + "?id=eq." + encodeURIComponent(song.id), {
          method: "PATCH",
          body: shed({ deleted_at: null, slug: slug }),
          prefer: "return=representation",
        }).then(function (rows) { return rows && rows[0]; })
          .catch(function (error) {
            if (String(error.code) === "23505" && tries < 30) {
              return attempt(wanted + "_" + (tries + 1), tries + 1);
            }
            throw error;
          });
      };

      return attempt(wanted, 1);
    },

    /* Gone for good, and the only thing here that is. */
    purge: function (id) {
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

    /* Every style the library already uses, for the same reason the names
       are offered: the second circle song should be called what the first one
       was called, and nobody should have to remember how they spelled it. */
    styles: function () {
      var self = this;
      if (!has("styles")) return Promise.resolve([]);
      return rest(T + "?select=styles&deleted_at=is.null").then(function (rows) {
        var seen = {};
        (rows || []).forEach(function (row) {
          (Array.isArray(row.styles) ? row.styles : []).forEach(function (name) {
            var kind = String(name || "").trim();
            if (kind) seen[kind] = true;
          });
        });
        return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b, "he"); });
      }).catch(function (error) {
        if (!dropMissing(error)) return [];
        return self.styles();
      });
    },

    /* Every song's name against its id, and nothing else. For a page that
       lists songs without drawing any of them: the index asks for whole rows
       because it shows the chords, and an evening's one line does not.

       A failure here is not worth a red screen either. The evening still
       knows what it was told the songs were called when they went in. */
    titles: function () {
      return rest(T + "?select=id,title").then(function (rows) {
        var by = {};
        (rows || []).forEach(function (row) { by[row.id] = row.title; });
        return by;
      }).catch(function () { return {}; });
    },
  };

  /* --- evenings of singing --------------------------------------------------
     The library's second table, and the only other one this app owns. See the
     comments over `setlists` in schema.sql for what a row holds and why.

     None of the optional-column machinery above applies here: this table
     arrived whole or it did not arrive at all, and the one thing that can be
     missing is the table itself, which is what missingTable answers. */
  var SET = CFG.setlistTable;

  /* PostgREST names a table it has never heard of two different ways depending
     on its version, and both mean the same sentence to the person on the page:
     nobody has run schema.sql yet. */
  var NO_SUCH_TABLE = { "42P01": true, PGRST205: true, PGRST202: true };

  function missingTable(error) {
    return !!(error && NO_SUCH_TABLE[String(error.code)]);
  }

  var SET_FIELDS = "id,title,event_date,venue,songs";

  var sets = {
    list: function () {
      return rest(SET + "?select=" + SET_FIELDS + ",updated_at");
    },
    byId: function (id) {
      return rest(SET + "?select=" + SET_FIELDS + "&id=eq." + encodeURIComponent(id) + "&limit=1")
        .then(function (rows) { return rows && rows[0]; });
    },
    insert: function (evening) {
      return rest(SET, { method: "POST", body: evening, prefer: "return=representation" })
        .then(function (rows) { return rows[0]; });
    },
    update: function (id, evening) {
      return rest(SET + "?id=eq." + encodeURIComponent(id), { method: "PATCH", body: evening, prefer: "return=representation" })
        .then(function (rows) { return rows[0]; });
    },
    remove: function (id) {
      return rest(SET + "?id=eq." + encodeURIComponent(id), { method: "DELETE" });
    },
  };

  /* ------------------------------------------------------------------ model */

  /* Words the app has taken for itself under /chords/. A song may not be
     called one of them, because the address would be the app's answer rather
     than the song's. */
  var RESERVED_SLUGS = { "new": true, "edit": true, "evenings": true, "deleted": true };

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

  /* --- which way a line runs ------------------------------------------------
     A DIRECTION BELONGS TO A LINE, NOT TO A SONG. A Hebrew verse and an
     English chorus are one song and two directions, and a song that had to
     choose one of them laid the other one out backwards: the chords of the
     English line landed at the wrong end of it.

     In the document it is a directive of its own, `{dir:ltr}` or `{dir:rtl}`,
     written ONLY where the direction changes. So a song in one direction
     carries no markers at all, exactly as it did before this existed, and the
     `dir` column still says what the song as a whole is: the direction of its
     first line, which is where a reader starts.

     It is written from the model on every save, so a verse dragged from the
     middle of an English section into a Hebrew one comes out with the markers
     in their new places rather than in the ones they were typed at. */
  var DIR_MARK = /^\s*\{dir:(rtl|ltr)\}\s*$/i;

  function dirOf(line, fallback) {
    var dir = line && line.dir;
    return dir === "rtl" || dir === "ltr" ? dir : (fallback || "rtl");
  }

  /* Every line saying which way it runs, so that nothing further down has to
     ask a song what one of its lines is doing. */
  function fillDirs(lines, fallback) {
    var last = fallback || "rtl";
    lines.forEach(function (line) {
      last = dirOf(line, last);
      line.dir = last;
    });
    return lines;
  }

  /* The song's own direction is its FIRST line's: it is the one the eye lands
     on, it is what the sheet as a whole is laid out in, and it is what a line
     with nothing else to go on inherits. */
  function songDir(lines) {
    return lines && lines.length ? dirOf(lines[0], "rtl") : "rtl";
  }

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

  /* --- a gap that is not a space --------------------------------------------
     Two chords over one short word have nowhere to sit. A chord label is wider
     than the syllable it names, so the second one is pushed along and stops
     pointing at anything, and the answer on paper is to spread the letters
     out: א  ל  י  ה, with air between them.

     Spaces would do it and would be a lie about the word. The song is stored
     as its words, they are what a search matches and what a lyrics sheet
     prints, and "אליה" spelled with spaces in it is not that word any more.

     So the gap is its own character. It is a private-use codepoint, which
     means it is not a letter, not a digit and NOT WHITESPACE: nothing that
     trims, breaks or counts words can mistake it for one. On screen its span
     is given the width of a space and no ink (see .gap in the stylesheet); on
     the way to anything that wants the words, it comes out (withoutGaps).

     A character rather than a width on the letter beside it, because a chord
     names a character: five gap characters are five places a chord can sit,
     which is the whole point of opening the gap. */
  var GAP = "";

  /* ONE PER PRESS. A press is cheap and an undo of half a gap is not: pressing
     twice is how you get two, and there is no way to ask for four and mean
     three. */
  var GAP_RUN = 1;

  function gapRun() { return new Array(GAP_RUN + 1).join(GAP); }

  /* the words, as words: what a lyrics sheet prints and what a search reads */
  function withoutGaps(text) { return String(text == null ? "" : text).split(GAP).join(""); }

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

  /* A new line runs the way the line before it ran. Whoever is typing an
     English chorus is typing the second line of it too, and being handed a
     Hebrew line in the middle of it is being handed the wrong thing. */
  function blankLine(dir) { return { type: "line", text: "", chords: [], dir: dir || "rtl" }; }

  /* Cutting a line in two and putting two back together, with the chords going
     wherever their own characters went. These are what let Enter, Backspace and
     Delete behave the way they do in any other text editor: a song is a
     document, so the keys that shape a document have to work on it. */
  function splitLine(line, at) {
    var cut = Math.max(0, Math.min(at, line.text.length));
    /* both halves of a line run the way the line ran */
    var before = { type: line.type, text: line.text.slice(0, cut), chords: [], dir: dirOf(line) };
    var after = { type: "line", text: line.text.slice(cut), chords: [], dir: dirOf(line) };
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
      /* the one that swallowed the other keeps its own direction */
      dir: dirOf(first),
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
    var out = [];
    var running = "";
    normalizeLines(lines).forEach(function (line) {
      var dir = line.dir === "ltr" || line.dir === "rtl" ? line.dir : running;
      /* The first line sets the direction without saying so: it IS the song's,
         and it is in the column. Every later change says so. */
      if (dir && dir !== running) {
        if (running) out.push("{dir:" + dir + "}");
        running = dir;
      }
      out.push(line.type === "section" ? "{" + line.text + "}" : toChordPro(line));
    });
    return out.join("\n");
  }

  function textToSong(body, fallback) {
    var dir = fallback === "ltr" ? "ltr" : "rtl";
    var out = [];
    String(body).replace(/\r\n?/g, "\n").split("\n").forEach(function (row) {
      var turn = DIR_MARK.exec(row);
      /* a directive is not a line of the song, it is a fact about the lines
         after it */
      if (turn) { dir = turn[1].toLowerCase(); return; }

      var heading = /^\s*\{(.*)\}\s*$/.exec(row);
      if (heading) return out.push({ type: "section", text: heading[1].trim(), chords: [], dir: dir });
      var parsed = fromChordPro(row);
      out.push({ type: "line", text: parsed.text, chords: parsed.chords, dir: dir });
    });
    return out;
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

  function normalizeLines(lines, fallback) {
    /* The song as it is stored now: one document. Songs written before that,
       as a list of line objects, still open, which is the whole reason this
       function takes both. */
    if (typeof lines === "string") lines = lines.trim() ? textToSong(lines, fallback) : [];
    if (!Array.isArray(lines) || !lines.length) return [blankLine(fallback)];

    /* A line that does not say which way it runs runs the way the line before
       it did, and the first one runs the way the song does. */
    return fillDirs(lines.map(function (l) {
      var raw = String(l && l.text != null ? l.text : "");
      if (l && l.type === "section") return { type: "section", text: raw, chords: [], dir: l.dir };

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
      return { type: "line", text: text, chords: chords, dir: l && l.dir };
    }), fallback);
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
    for (var i = 0; i < text.length; i++) {
      /* the gap keeps its character, and the character keeps its span: the DOM
         text and the model's text are the same string, which is what lets the
         words be read straight back out of the page as they are typed */
      wrap.appendChild(el("span", text[i] === GAP ? "gap" : null, text[i]));
    }
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
  /* WHICH WAY THIS ROW RUNS, ASKED OF THE ROW. Every measurement below used to
     be handed the song's direction from above, which was fine while a song had
     one. Now that a line has its own, the row carries it as a `dir` attribute,
     which is the same thing the browser is laying the words out by: one answer,
     read in one place, and no way for the arithmetic and the text to disagree
     about which end a line starts at. */
  function rowRtl(ln) {
    return (ln && ln.dir === "ltr") ? false : true;
  }

  function metrics(ln) {
    var rtl = rowRtl(ln);
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
  function layoutLine(ln) {
    var rtl = rowRtl(ln);
    var lane = ln.querySelector(".ln-c");
    var m = metrics(ln);
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
  function placeChord(ln, node, at) {
    var rtl = rowRtl(ln);
    var m = metrics(ln);
    if (!m) return;
    var anchor = at != null ? at : positionOf(m, (Number(node.dataset.pos) || 0) + 0.5);
    var x = anchor - node.getBoundingClientRect().width / 2;
    node.style.left = rtl ? "auto" : x + "px";
    node.style.right = rtl ? x + "px" : "auto";
  }

  function layoutAll(root) {
    Array.prototype.forEach.call(root.querySelectorAll(".ln"), function (ln) { layoutLine(ln); });
  }

  /* --- a song too wide for the screen --------------------------------------
     On a desk the sheet scrolls sideways and that is fine: the whole line is
     an arm's reach away. On a phone it is not. A song you have to drag left
     and right to read is a song you cannot play from, and the words that fell
     off the edge are the ones nobody sees at all.

     So on a narrow screen the song is POURED into rows the width of the
     screen. A line that does not fit is broken at a space, never inside a
     word, and the leftover starts the next row, indented, so it reads as the
     end of the line above rather than as a line of its own.

     ONE LINE OF THE SONG PER ROW, ALWAYS. Two other things used to happen
     here and both are gone. A leftover was usually one word on an otherwise
     empty row, so the line after it was pulled up onto that row to save the
     screen, and two marks were drawn to say where one line ended and the next
     began. It saved a line and cost the reading: a row holding the tail of
     one line, an arrow, and the head of another is three things to take apart
     before you can sing any of them, and a person playing from a phone is
     reading a line ahead with their hands full. A row is one line now, and
     the sheet says nothing about where it broke beyond the indent.

     None of this touches the song. Nothing is saved, nothing is reordered,
     and a wider screen or a smaller reading size simply pours it into fewer
     rows. Every chord travels with the word it was written over, which is why
     the lines can be moved about at all.

     It works off the DOM rather than off the song, so the labels are the ones
     already on screen, transposed, and the widths are the ones the reader's
     own font gave them. Called with the rows measured, i.e. after they are in
     the page.
     ------------------------------------------------------------------------ */

  /* How far the second and later rows of one line are pushed in, so that a
     line broken in two still reads as one line. */
  var CONT_INDENT = 1.5;

  /* One measured line: its words, its chords, and what every character of it
     costs. A row that has no words to measure (a section heading, the blank
     line between two stanzas) is carried through untouched. */
  function measureLine(ln) {
    var t = ln.querySelector(".ln-t");
    var m = t ? metrics(ln) : null;
    if (!t || !m || !m.count) return { node: ln, keep: true };

    var text = t.textContent;
    var chords = Array.prototype.map.call(ln.querySelectorAll(".ln-c .chord"), function (node) {
      return { label: node.textContent, pos: Number(node.dataset.pos) || 0 };
    });

    /* The line is counted in cells: one per character, and then as many more
       as the chords past the last character need. An outro is a row of chords
       over nothing, and it runs off the edge exactly like words do. */
    var far = -1;
    chords.forEach(function (c) { if (c.pos > far) far = c.pos; });
    var cells = Math.max(text.length, far + 1);

    /* What each character actually takes, asked of the character itself rather
       than of the distance to the next one. The two are the same until a line
       mixes directions, and then they are not: a Latin word inside a Hebrew
       line is laid out the other way about, so the distance between two
       neighbours there can come out backwards, while the width of a letter is
       the width of a letter either way. It also gets Hebrew vowel points
       right, which take no room at all and must not be counted as if they
       did. */
    var advance = [];
    for (var i = 0; i < cells; i++) {
      advance.push(i < m.count ? m.spans[i].getBoundingClientRect().width : m.unit);
    }

    return {
      node: ln, text: text, chords: chords, cells: cells, advance: advance,
      rtl: rowRtl(ln),
      size: parseFloat(getComputedStyle(t).fontSize) || 18,
      pieces: [],
    };
  }

  function flowSheet(sheet) {
    var originals = Array.prototype.slice.call(sheet.querySelectorAll(".ln"));
    if (!originals.length) return;

    var full = originals[0].clientWidth;
    if (!(full > 0)) return;

    var lines = originals.map(function (ln) { return measureLine(ln); });
    var sized = lines.filter(function (line) { return !line.keep; });
    if (!sized.length) return;

    var indent = CONT_INDENT * sized[0].size;

    /* --- pouring ---------------------------------------------------------- */

    var out = [];

    /* A row belongs to ONE line of the song, so it is opened here, inside the
       line being poured, and closes when that line is done. Nothing carries
       over between lines any more: no leftover waiting to be joined, and no
       state outside this loop for the next line to inherit. */
    lines.forEach(function (line) {
      if (line.keep) { out.push(line); return; }

      var pos = 0;
      var tail = false;

      while (pos < line.cells) {
        var row = { tail: tail, pieces: [], used: 0, rtl: line.rtl };
        row.room = full - (tail ? indent : 0);
        out.push(row);

        var avail = row.room;
        var x = 0, at = pos, space = -1;
        while (at < line.cells && x + line.advance[at] <= avail) {
          if (at > pos && at < line.text.length && line.text[at] === " ") space = at;
          x += line.advance[at];
          at++;
        }

        var end;
        if (at >= line.cells) {
          end = line.cells;
        } else {
          /* The space a row breaks ON does not have to fit on it: it is the
             last thing on the row and there is nothing after it to push off
             the edge. Without this a line whose words end exactly at the
             screen's edge loses the whole last word to the row below. */
          if (at > pos && at < line.text.length && line.text[at] === " ") space = at;
          end = space > pos ? space + 1 : at;

          /* Nothing fits at all: one character, because a word longer than the
             whole screen has to be cut somewhere. */
          if (end <= pos) end = pos + 1;
        }

        var piece = { line: line, from: pos, to: end };
        row.pieces.push(piece);
        line.pieces.push(piece);

        /* what the piece REALLY takes, which is not what the greedy loop
           counted: it counted up to where it ran out of room, and the break
           then went back to the last space before that */
        for (var k = pos; k < end; k++) row.used += line.advance[k];
        pos = end;

        /* A row does not begin with the spaces the break left behind, unless a
           chord is sitting on one of them: an outro's chords live out in that
           emptiness, and moving them would be changing the song to fit the
           screen. */
        while (pos < line.text.length && line.text[pos] === " " && !line.chords.some(function (c) { return c.pos === pos; })) pos++;

        if (pos < line.cells) {
          row.more = true;
          tail = true;
        }
      }

    });

    /* Which chords belong to which piece. A piece claims from where it starts
       up to where the next piece of the SAME line does, so the spaces a break
       ate are a gap no chord can fall down, and the chords past the end of the
       words all belong to the piece that ends the line. */
    sized.forEach(function (line) {
      line.pieces.forEach(function (piece, n) {
        piece.claimFrom = n ? piece.from : -Infinity;
        piece.claimTo = n < line.pieces.length - 1 ? line.pieces[n + 1].from : Infinity;
      });
    });

    /* --- and drawing it --------------------------------------------------- */

    function buildRow(desc) {
      var ln = el("div", "ln" + (desc.tail ? " is-cont" : "") + (desc.more ? " has-cont" : ""));
      /* the poured row runs the way the line it was poured from runs */
      ln.dir = desc.rtl ? "rtl" : "ltr";
      var lane = el("div", "ln-c");
      var text = "";

      /* One piece, always: a row holds one line of the song. Written as a loop
         because the pieces are what the chords are claimed against, and one of
         them is still a list of one. */
      desc.pieces.forEach(function (piece) {
        var offset = text.length;
        piece.line.chords.forEach(function (c) {
          if (c.pos < piece.claimFrom || c.pos >= piece.claimTo) return;
          /* already transposed on screen, so nothing is shifted a second time */
          lane.appendChild(chordEl(c.label, offset + Math.max(0, c.pos - piece.from), 0));
        });
        text += piece.line.text.slice(piece.from, Math.min(piece.to, piece.line.text.length));
      });

      /* A leftover row with no chords over it needs no lane to hold them, and
         the fifteen pixels it would take are a line of the song further down
         the page. */
      if (desc.tail && !lane.children.length) ln.classList.add("is-tight");
      ln.appendChild(lane);

      var words = textSpans(text);
      /* Indented and nothing else. There was an arrow drawn in the indent, and
         it is gone with the joining it went with: a row that is one line of a
         song needs no punctuation explaining itself. */
      if (desc.tail) ln.style.setProperty("--cont", indent + "px");
      ln.appendChild(words);
      return ln;
    }

    var nodes = out.map(function (desc) { return desc.keep ? desc.node : buildRow(desc); });

    /* In one place, before the first of the rows being replaced, so the order
       is the order of `out` whether a row is a new one or one being carried
       through and moved. */
    var parent = originals[0].parentNode;
    var here = document.createComment("");
    parent.insertBefore(here, originals[0]);
    nodes.forEach(function (node) { parent.insertBefore(node, here); });
    parent.removeChild(here);
    originals.forEach(function (node) {
      if (node.parentNode && nodes.indexOf(node) === -1) node.parentNode.removeChild(node);
    });
  }

  /* Where the pointer is, said in characters, fraction and all. The caller
     rounds it: a stored position is always a whole character, but the fraction
     is what lets a chord follow the hand smoothly while it is being dragged. */
  function posFromX(ln, clientX) {
    var rtl = rowRtl(ln);
    var m = metrics(ln);
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
  var state = { songs: null, printable: false, printer: null, killer: null, editToggle: null };

  /* How big this reader wants the words, kept between songs and between visits.
     Whoever needs a bigger font on one song needs it on the next one too, and
     setting it again every time is the kind of small tax that adds up. Call it
     with a number to set it, without one to read it. */
  var SIZE_KEY = "chords.size";

  /* A song is read from a music stand, at arm's length, by somebody holding a
     guitar and not their glasses, so the top of this range is deliberately
     larger than a page of text would ever want. */
  var SIZE_MIN = 13;
  var SIZE_MAX = 48;

  /* TWO POINTS A PRESS. One was a step nobody could see: the difference
     between 18 and 19 pixels is a difference you have to be told about, so
     every change of size was four or five presses of a button to find out
     whether you wanted it. */
  var SIZE_STEP = 2;

  function readingSize(next) {
    if (next != null) {
      var size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(next)));
      try { localStorage.setItem(SIZE_KEY, String(size)); } catch (e) { /* private window */ }
      return size;
    }
    var saved = 0;
    try { saved = parseInt(localStorage.getItem(SIZE_KEY), 10); } catch (e) { /* private window */ }
    return saved >= SIZE_MIN && saved <= SIZE_MAX ? saved : 18;
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

  /* Both ways in are offered on every screen now. Typing a song out is the
     thing a phone is worst at and reading a photograph is the thing it is
     best at, the camera being already in your hand, and for a while that was
     reason enough to hide the typing on one: a button that answers a press
     with a refusal is worse than no button.

     It is not hidden any more because it no longer refuses. The editor works
     on a phone (see the song page), so the button leads somewhere, and which
     of the two is the easier way in on the screen in front of you is a
     judgement the person holding it can make. */
  function newSong() {
    requireAuth(function () { go(BASE + "/new"); });
  }

  /* --- printing, of which there are two --------------------------------------
     A chord sheet and a lyrics sheet are two different pieces of paper for two
     different moments. The chords are for playing from; the words are for the
     people singing, who do not read chords and to whom a page of pink symbols
     over every line is a page that is harder to follow.

     So the button asks which. Two lines in a small panel under it rather than
     two buttons in the bar: printing is one thing you came here to do, and it
     is the second thing at that, after playing from the page.

     The lyrics sheet is the same page with the chord lane taken out and the
     gaps closed. Nothing is re-rendered and nothing is re-fetched: the words
     on paper are the words on screen, which is the only way the two cannot
     disagree. The gaps closing is what the gap character was for. */
  var printMenu = null;
  var printAnchor = null;

  function closePrintMenu() {
    if (!printMenu) return;
    printMenu.remove();
    printMenu = null;
    document.removeEventListener("pointerdown", printOutside, true);
    document.removeEventListener("keydown", printEscape, true);
  }

  /* The button that opened it is not "outside": pressing it again is asking
     for the panel to go away, and closing here would take it away and let the
     click that followed open it straight back up. */
  function printOutside(event) {
    if (!printMenu) return;
    if (printMenu.contains(event.target)) return;
    if (printAnchor && printAnchor.contains(event.target)) return;
    closePrintMenu();
  }

  function printEscape(event) {
    if (event.key === "Escape") closePrintMenu();
  }

  function printNow(words) {
    closePrintMenu();
    document.body.classList.toggle("print-words", !!words);
    /* Put back afterwards however the printing ended, including cancelled, and
       on a timer as well: afterprint is not fired by every browser, and a page
       left in the printing shape is a page with no chords on it. */
    var back = function () { document.body.classList.remove("print-words"); };
    window.addEventListener("afterprint", function once() {
      window.removeEventListener("afterprint", once);
      back();
    });
    setTimeout(back, 60000);
    window.print();
  }

  function askPrint(anchor) {
    if (printMenu) return closePrintMenu();

    printAnchor = anchor;
    printMenu = el("div", "print-menu");
    printMenu.appendChild(button("אקורדים", null, "ghost small", function () { printNow(false); }));
    printMenu.appendChild(button("מילים בלבד", null, "ghost small", function () { printNow(true); }));
    document.body.appendChild(printMenu);

    var box = anchor.getBoundingClientRect();
    var width = printMenu.offsetWidth;
    printMenu.style.top = (box.bottom + 6) + "px";
    printMenu.style.left = Math.min(Math.max(6, box.right - width), window.innerWidth - width - 6) + "px";

    document.addEventListener("pointerdown", printOutside, true);
    document.addEventListener("keydown", printEscape, true);
  }

  /* Adding a song, signing in and signing out belong to the library, so they
     are offered on the index and nowhere else. Two rows of buttons an inch
     apart, one of them about what you are looking at and the other about
     something else, is a page where you have to read before you can press.

     A song open on the screen leaves the bar with nothing to say, and printing
     is what you came to that page to do second, after playing from it. So that
     one button moves up here: it is about the song, it is the only thing in the
     bar, and it is in the same place on every song rather than at the end of a
     row of steppers.

     "שיר חדש" is shown there to everyone, signed in or not. Hiding it until you
     log in leaves a visitor looking at an empty list with no way forward and no
     reason given; showing it and sending the click to Google says what the rule
     is at the moment it applies. */
  function paintHeader() {
    var bar = document.getElementById("topActions");
    bar.innerHTML = "";
    var p = parts();

    /* The evenings are a list like the library is a list, so their page gets
       the same two buttons the library's does: the one that adds to it, and
       the one that says who you are. An evening that is open has tools of its
       own, and none of these. */
    if (p[0] === "evenings") {
      /* Nothing here is readable without an account, so the one button that
         matters is the way in. */
      if (!auth.in) { bar.appendChild(session()); return; }
      if (p.length === 1) {
        bar.appendChild(button("ערב חדש", ICON.plus, "small", newEvening));
        bar.appendChild(session());
        return;
      }
      /* An evening that is open: the two things there are to do to the whole
         of it, both as pictures. A word beside a picture that means printing
         is the picture explained to somebody who already understood it. */
      if (state.printer) bar.appendChild(iconBtn(ICON.print, "הדפסה", state.printer));
      if (state.killer) {
        var killEvening = iconBtn(ICON.trash, "מחיקת הערב", state.killer);
        killEvening.classList.add("quiet");
        bar.appendChild(killEvening);
      }
      return;
    }

    if (p.length) {
      /* Only once there is a song on the page. A song still loading, one that
         is not there at all and one still being read from a photograph are all
         this same address, and none of them is worth paper. */
      if (state.editToggle) {
        var edit = state.editToggle;
        var editBtn = iconBtn(edit.on ? ICON.check : ICON.pencil,
          edit.on ? "סיום עריכה" : "עריכה", edit.flip);
        if (edit.on) editBtn.classList.add("is-on");
        bar.appendChild(editBtn);
      }
      if (state.printable) {
        var printBtn = iconBtn(ICON.print, "הדפסה", function () { askPrint(printBtn); });
        bar.appendChild(printBtn);
      }
      return;
    }

    /* The way into the other half of the app, first, because it is the only
       one of these that goes somewhere rather than making something. */
    bar.appendChild(button("ערבי שירה", ICON.calendar, "ghost small", function () {
      go(BASE + "/evenings");
    }));
    /* On a phone the reading is the only way in, so it is the one that gets
       the solid button. On a desk both are open and the typing leads. */
    bar.appendChild(button("מתמונה", ICON.upload, "ghost small", uploadSong));
    bar.appendChild(button("שיר חדש", ICON.plus, "small", newSong));
    bar.appendChild(session());
  }

  /* WHO IS LOOKING AT THIS, in the corner where it belongs, and their own name
     rather than the word "יציאה". The library is one account's until it is
     published, so which account is holding it is a fact about everything on
     the screen, and a bar that said only "יציאה" left it unsaid.

     The name is a button, and what it opens is the small panel about the
     person: change the name, or leave. Signing out lives in there rather than
     beside it because it is the rarer of the two by a long way, and because a
     bar with five buttons in it is a bar nobody reads. */
  function session() {
    if (!auth.in) return googleButton("התחברות", "small");
    return button(auth.name() || "החשבון", ICON.person, "ghost small who", askMe);
  }

  function askMe() {
    var dlg = document.getElementById("meDialog");
    var form = document.getElementById("meForm");
    var err = document.getElementById("meErr");
    var field = form.elements.name;

    err.hidden = true;
    document.getElementById("meWho").textContent = (auth.session && auth.session.email) || "";
    field.value = auth.name();

    form.onsubmit = function (event) {
      event.preventDefault();
      var wanted = String(field.value || "").trim().replace(/\s+/g, " ");
      if (!wanted) {
        err.textContent = "צריך שם.";
        err.hidden = false;
        return;
      }
      if (wanted === auth.name()) return dlg.close();

      var submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      auth.setName(wanted).then(function () {
        submit.disabled = false;
        dlg.close();
        paintHeader();
        toast("מעכשיו " + auth.name());
      }).catch(function (e) {
        submit.disabled = false;
        err.textContent = e.message || "לא הצלחנו לשמור את השם";
        err.hidden = false;
      });
    };

    document.getElementById("meOut").onclick = function () {
      dlg.close();
      auth.signOut();
      paintHeader();
      route();
      toast("התנתקת");
    };
    form.querySelector("[data-close]").onclick = function () { dlg.close(); };
    dlg.showModal();
  }

  /* THERE IS ONE WAY IN AND IT IS ONE BUTTON. A panel offering a choice of
     doors is a panel about signing in, and signing in is not a thing anybody
     came here to do: pressing it goes to Google and comes back, and the page
     it comes back to is the one it left.

     Nothing after this call runs, so nothing can be handed to it to run
     afterwards. What survives the trip is the address, kept by
     signInWithGoogle, and that is the part that matters: pressing "התחברות"
     on a song leaves you on that song. */
  function requireAuth(then) {
    if (auth.in) then(); else auth.signInWithGoogle();
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
      /* One word. The box is a box with a magnifying glass in it and the only
         thing on this page to search is the songs; a sentence explaining which
         of their words it reads is a sentence nobody needs twice. */
      input.placeholder = "חיפוש...";
      input.setAttribute("aria-label", "חיפוש שיר");
      search.appendChild(input);
      app.appendChild(search);

      /* --- several at once -----------------------------------------------------
         Sometimes what you want to do is to a handful of songs rather than to
         one: five readings of the same sheet, four mistakes from the same
         afternoon. Deleting them one dialog at a time is the same work five
         times over, and the row already knows which song it is.

         Only for a signed in reader, because deleting is. A visitor gets the
         library exactly as it was, without a column of boxes for something
         they cannot do. */
      var picked = {};

      function pickedSongs() {
        return state.songs.filter(function (s) { return picked[s.id]; });
      }

      /* AT THE FAR END OF THE STYLES ROW. They were a bar of their own between
         the counts and the songs, which is a whole line of the page standing
         empty most of the time and arriving under the reader's eye exactly
         while they are busy ticking, pushing the rows they are aiming at down
         by its own height. That row already exists and has room in it. */
      var picking = el("div", "picking");
      /* Pictures, and no words. They are two of the most familiar pictures
         there are, they stand in a box already full of words, and the words
         they had were three times their own width. What is ticked is on the
         rows themselves, in ticks, so the row above them does not need to
         count it out loud; how many is in the question the trash asks. */
      var killBtn = iconBtn(ICON.trash, "מחיקה", removePicked);
      killBtn.classList.add("kill");
      picking.appendChild(killBtn);
      picking.appendChild(iconBtn(ICON.close, "ביטול הבחירה", function () {
        picked = {};
        paint(input.value);
      }));
      picking.hidden = true;

      /* --- what state the library is in ----------------------------------------
         Three numbers under the search box: how many songs are waiting to be
         checked, how many their author has not finished, and how many are
         neither, which is to say done. A library is not only a list of songs,
         it is also an amount of work outstanding, and that was a thing you
         could only learn by scrolling the whole of it.

         And they are pressable, because a number worth showing is a number
         somebody wants the list of. Pressing one narrows the list to it and
         pressing it again lets it go, which is what a search box that is
         already there would do if it could search for a label.

         Counted over songs that ARE songs. One still being read is not
         unchecked, not unfinished and not done; it is not there yet. */
      var tag = null;

      /* The three a song can be in, in the order it passes through them. A
         song that is neither published nor waiting to be checked is one
         somebody is working on, which is what a draft is: there is no fourth
         state for "finished and private". */
      var TAGS = ["imported", "review", "draft", "published"].map(function (key) {
        return {
          key: key,
          label: STATE_WORDS[key],
          is: function (s) { return rowState(s) === key; },
        };
      });

      /* --- IN THE SEARCH BOX, at the far end of it -----------------------------
         The states are a filter, the box beside them is a filter, and they had
         a row of their own between the box and the songs. One row of the page
         for four chips, and two places to narrow a library from.

         So they sit inside the box. What is ticked keeps a row under it, and
         only while something is ticked. */
      var tallies = el("div", "tallies");
      search.appendChild(tallies);

      /* And under it, what KIND of songs it holds. A second row and not more
         chips in the first, because the two answer different questions: the
         states are the work outstanding and the styles are the shelf itself.
         Both narrow the list and they narrow it together, which is how you get
         to "the circle songs I have not checked yet". */
      var kind = null;
      var kindsRow = el("div", "kinds-row");
      var kinds = el("div", "kinds");
      kindsRow.appendChild(kinds);
      kindsRow.appendChild(picking);
      app.appendChild(kindsRow);

      function paintTallies() {
        tallies.textContent = "";
        TAGS.forEach(function (t) {
          var n = state.songs.filter(t.is).length;
          /* A count of nothing is not a fact worth a chip. It is a row of
             states the library is not in, and the only thing pressing one
             could do is empty the list. */
          if (!n && tag !== t.key) return;
          var chip = el("button", "tally tally-" + t.key + (tag === t.key ? " is-on" : ""));
          chip.type = "button";
          chip.appendChild(el("span", "tally-n", String(n)));
          chip.appendChild(el("span", "tally-l", t.label));
          chip.title = tag === t.key ? "לחיצה מחזירה את כל השירים" : "לחיצה מציגה רק את אלה";
          chip.addEventListener("click", function () {
            tag = tag === t.key ? null : t.key;
            paint(input.value);
          });
          tallies.appendChild(chip);
        });
      }

      /* Every style the library uses, in the order a person would look for
         them: the biggest shelf first, and alphabetically among equals so the
         row does not reshuffle itself every time a song is saved. A style
         nothing is in any more is not in the row, because the row is a
         description of the library and not a vocabulary list. */
      function paintKinds() {
        kinds.textContent = "";
        var counted = {};
        state.songs.forEach(function (s) {
          styles(s).forEach(function (name) { counted[name] = (counted[name] || 0) + 1; });
        });

        var names = Object.keys(counted).sort(function (a, b) {
          return counted[b] - counted[a] || a.localeCompare(b, "he");
        });
        if (!names.length) return;

        names.forEach(function (name) {
          var chip = el("button", "tally tally-style" + (kind === name ? " is-on" : ""));
          chip.type = "button";
          chip.appendChild(el("span", "tally-n", String(counted[name])));
          chip.appendChild(el("span", "tally-l", name));
          chip.title = kind === name ? "לחיצה מחזירה את כל השירים" : "לחיצה מציגה רק את אלה";
          chip.addEventListener("click", function () {
            kind = kind === name ? null : name;
            paint(input.value);
          });
          kinds.appendChild(chip);
        });
      }

      var list = el("ul", "list");
      app.appendChild(list);

      /* Named, and not only counted: what is being agreed to is a list of
         songs, and the names are what somebody can check. It no longer says
         "לצמיתות", because it is not: they go to the deleted list with their
         words and their chords, and the question says which way out there is
         rather than making a promise the app does not keep. */
      function removePicked() {
        var going = pickedSongs();
        if (!going.length) return;

        var names = going.map(function (s) { return s.title; });
        var head = going.length === 1
          ? "למחוק את השיר הזה?"
          : "למחוק " + going.length + " שירים?";
        var said = names.slice(0, 12);
        if (names.length > said.length) said.push("ועוד " + (names.length - said.length));
        if (!window.confirm(head + "\n\n" + said.join("\n") + "\n\nאפשר יהיה לשחזר מתוך שירים שנמחקו.")) return;

        Promise.all(going.map(function (s) { return db.remove(s.id); }))
          .then(function () {
            picked = {};
            toast(going.length === 1 ? "נמחק" : "נמחקו " + going.length + " שירים");
            return refresh();
          })
          .catch(function (e) {
            /* Some of them may well be gone: the list is read again either way,
               so what is on screen is what is in the library. */
            toast("המחיקה נכשלה: " + e.message, true);
            return refresh();
          });
      }

      /* the empty list carries the way out of itself */
      var empty = el("div", "center");
      var emptyText = el("p");
      var emptyActions = el("div", "row-actions");
      emptyActions.appendChild(button("להקליד שיר", ICON.plus, null, newSong));
      emptyActions.appendChild(button("מתמונה או PDF", ICON.upload, "ghost", uploadSong));
      empty.appendChild(emptyText);
      empty.appendChild(emptyActions);

      /* --- two songs of the same name -----------------------------------------
         Nothing on a row tells them apart. Same title, same credits, often the
         same chords, because the usual reason to have two is that the same
         sheet was read twice and the readings are being compared.

         So a name that repeats carries a number, and the number is WHICH ONE
         CAME FIRST. Not the number in the address, which would leave the first
         of them unnumbered and can collide once a song has been renamed, and
         not the date, which is a lot of characters to say "the second one".

         Counted over the whole library rather than over what the search left,
         so typing in the box does not renumber the songs. */
      function marksFor(songs) {
        var byName = {};
        songs.forEach(function (s) { (byName[s.title] = byName[s.title] || []).push(s); });

        var marks = {};
        Object.keys(byName).forEach(function (title) {
          var group = byName[title];
          if (group.length < 2) return;
          group.sort(function (a, b) {
            return (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0);
          }).forEach(function (s, index) { marks[s.id] = String(index + 1); });
        });
        return marks;
      }

      /* Counted over the library and not over what the search left, so narrowing
         the list does not quietly unpick what is no longer on screen. */
      function showBar() {
        var n = pickedSongs().length;
        picking.hidden = !n;
        /* the count is in what the button is called, so hovering it says what
           pressing it would take */
        killBtn.title = n > 1 ? "מחיקת " + n + " שירים" : "מחיקת השיר שנבחר";
        killBtn.setAttribute("aria-label", killBtn.title);
      }

      /* A tick changes one row and the bar, and nothing else on the page is
         redrawn: repainting the list under a finger that is still ticking
         boxes takes the focus off the box it just ticked. */
      function tickBox(s) {
        if (!auth.in) return null;
        return {
          on: !!picked[s.id],
          set: function (yes) {
            if (yes) picked[s.id] = true; else delete picked[s.id];
            showBar();
          },
        };
      }

      function paint(filter) {
        list.innerHTML = "";
        showBar();
        paintTallies();
        paintKinds();
        var marks = marksFor(state.songs);
        var q = String(filter || "").trim().toLowerCase();
        var only = tag && TAGS.filter(function (t) { return t.key === tag; })[0];
        var shown = state.songs.filter(function (s) {
          if (only && !only.is(s)) return false;
          if (kind && styles(s).indexOf(kind) < 0) return false;
          if (!q) return true;
          /* the style is searched too: it is one of the words on the row, and
             a box that finds everything else on it and not that is a box that
             is wrong about what it can find */
          var hay = s.title + " " + credits(s).map(function (c) { return c.name; }).join(" ") +
            " " + styles(s).join(" ");
          return hay.toLowerCase().indexOf(q) >= 0;
        });

        if (!shown.length) {
          if (!empty.parentNode) app.appendChild(empty);
          emptyText.textContent = q ? "לא נמצא שיר שמתאים לחיפוש."
            : kind ? "אין שירים בסגנון הזה."
            : only ? "אין שירים בתווית הזאת."
            : "עוד אין שירים כאן.";
          emptyActions.hidden = !!q || !!only || !!kind;
          return;
        }
        if (empty.parentNode) empty.remove();

        shown.forEach(function (s) { list.appendChild(songRow(s, refresh, marks[s.id], tickBox(s))); });
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

      /* The way to what was deleted, under everything and only when there is
         something there. A library with an empty bin says nothing about bins:
         the door appears when there is a room behind it. */
      if (auth.in) {
        db.deleted().then(function (gone) {
          if (!list.isConnected || !gone || !gone.length) return;
          var back = el("div", "after-list");
          back.appendChild(button("שירים שנמחקו (" + gone.length + ")", ICON.trash, "ghost small", function () {
            go(BASE + "/deleted");
          }));
          app.appendChild(back);
        }).catch(function () { /* not being able to say is not worth saying */ });
      }
    }).catch(fail);
  }

  /* --- what was deleted ------------------------------------------------------
     Deleting a song leaves it exactly where it was and takes its address away,
     so this page is the only way back to one. Everything here is a song that
     somebody meant to be rid of, and the point of the page is the handful of
     those that somebody meant to keep.

     Two things can be done to a row: bring it back, which gives it a fresh
     address from its title, or delete it for good, which is the only thing in
     this app that cannot be taken back and asks accordingly. */
  function viewDeleted() {
    document.title = "שירים שנמחקו | אקורדים";
    if (!auth.in) return needSignIn();

    setBusy("טוען");
    db.deleted().then(function (gone) {
      app.innerHTML = "";

      var head = el("div", "song-head");
      head.appendChild(el("h1", null, "שירים שנמחקו"));
      head.appendChild(el("div", "by", "שיר שנמחק נשאר כאן עם המילים והאקורדים שלו. הכתובת שלו נזרקה, ושחזור נותן לו כתובת חדשה משמו."));
      app.appendChild(head);

      var list = el("ul", "list");
      app.appendChild(list);

      var actions = el("div", "row-actions");
      actions.appendChild(button("לרשימת השירים", null, "ghost small", function () { go(BASE + "/"); }));
      var after = el("div", "after-list");
      after.appendChild(actions);
      app.appendChild(after);

      function paint(rows) {
        list.innerHTML = "";
        if (!rows.length) {
          var empty = el("div", "center");
          empty.appendChild(el("p", null, "אין כאן שירים שנמחקו."));
          list.replaceWith(empty);
          return;
        }
        rows.forEach(function (s) { list.appendChild(row(s, rows)); });
      }

      function row(s, rows) {
        var li = el("li");
        var box = el("div", "row is-gone");

        var what = el("div");
        var top = el("div", "t-row");
        top.appendChild(el("div", "t", s.title));
        var by = credits(s);
        if (by.length) top.appendChild(el("div", "by", by.map(function (c) { return c.name; }).join(", ")));
        what.appendChild(top);
        var when = whenWords(s.deleted_at);
        if (when) what.appendChild(el("div", "a", "נמחק " + when));
        box.appendChild(what);

        var buttons = el("div", "row-actions");
        buttons.appendChild(button("שחזור", ICON.undo, "small", function () {
          db.restore(s).then(function (back) {
            toast("השיר חזר");
            go(BASE + "/" + encodeURIComponent((back && back.slug) || slugify(s.title)));
          }).catch(function (e) { toast("השחזור נכשל: " + e.message, true); });
        }));
        buttons.appendChild(button("מחיקה לצמיתות", ICON.trash, "danger small", function () {
          if (!window.confirm('למחוק את "' + s.title + '" לצמיתות?\n\nזה השלב היחיד כאן שאי אפשר לחזור ממנו.')) return;
          db.purge(s.id).then(function () {
            paint(rows = rows.filter(function (other) { return other.id !== s.id; }));
            toast("נמחק לצמיתות");
          }).catch(function (e) { toast("המחיקה נכשלה: " + e.message, true); });
        }));
        box.appendChild(buttons);

        li.appendChild(box);
        return li;
      }

      paint(gone || []);
    }).catch(fail);
  }

  /* One line of the index. Three shapes, because a song has three states:
     ready and openable, still being read, or failed with a reason. */
  /* --- when a song last changed --------------------------------------------
     The list is ordered by this, and an order nobody can see is not an order:
     without the date on the row, a library that has stopped being alphabetical
     looks shuffled.

     Said the way a person says it near the top, where "היום" and "אתמול" are
     the whole answer, and as a plain date further down, where "לפני 23 ימים"
     is a number nobody converts and the date itself is both shorter and truer.

     Counted in days on the calendar rather than in twenty four hour steps. A
     song saved last night at eleven was saved yesterday, and subtracting
     milliseconds would go on calling it "היום" until this evening. */
  function midnight(t) {
    var d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dayWords(t) {
    var days = Math.round((midnight(Date.now()) - midnight(t)) / 86400000);
    if (days <= 0) return "היום";
    if (days === 1) return "אתמול";
    if (days === 2) return "לפני יומיים";
    if (days < 7) return "לפני " + days + " ימים";
    var d = new Date(t);
    return d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear();
  }

  function hourWords(t) {
    var d = new Date(t);
    var minutes = d.getMinutes();
    return d.getHours() + ":" + (minutes < 10 ? "0" : "") + minutes;
  }

  /* The day and the hour, because a day is not enough on the day itself: three
     songs all saying "היום" are three rows in an order the page is not
     explaining, and the hour is what tells them apart. */
  function whenWords(value) {
    var t = Date.parse(value || "");
    if (!t) return "";
    return dayWords(t) + ", " + hourWords(t);
  }

  /* The same moment written out, for hovering over. "אתמול" is the right thing
     to read at a glance and it is not a date, so the date is here. */
  function whenExactly(value) {
    var t = Date.parse(value || "");
    if (!t) return "";
    var d = new Date(t);
    return "עודכן " + d.getDate() + "." + (d.getMonth() + 1) + "." + d.getFullYear() +
      " בשעה " + hourWords(t);
  }

  /* --- the one state a song is in --------------------------------------------
     Four, and a song is in exactly one of them. They are separate columns in
     the database because that is what a policy can read, and one word here,
     because a person should never have to work out a combination.

     Read in the order a song passes through them: still in the machine, read
     but unchecked, being worked on, out in the world. "Not published and not
     waiting to be checked" is somebody working on it, which is what a draft
     is; there is no state for "finished and private". */
  var STATE_WORDS = {
    imported: "מיובא",
    review: "לסקירה",
    draft: "טיוטה",
    published: "פורסם",
  };

  function rowState(s) {
    if (s.status === "queued" || (s.status === "reading" && !stalled(s))) return "imported";
    if (s.published) return "published";
    if (s.review) return "review";
    return "draft";
  }

  /* One label, in that state's own colour. The colour belongs to the STATE and
     not to the place it is drawn: the same green means published on a row of
     the library, on the tally over it and on the button inside the song, so
     the four states are learned once and read everywhere. The colours
     themselves are in the stylesheet, under one name each. */
  function tag(state, words, why) {
    var node = el("span", "tag tag-" + state, words);
    node.title = why;
    return node;
  }

  function songRow(s, refresh, mark, pick) {
    var li = el("li");

    /* Outside the card rather than inside it, because the card is a link and a
       box inside a link is a box that opens the song half the time. Given to
       every shape of row: a song that failed to be read is one of the ones you
       are most likely to be clearing out several of. */
    if (pick) {
      var holder = el("label", "pick");
      var tickBox = el("input");
      tickBox.type = "checkbox";
      tickBox.checked = pick.on;
      tickBox.setAttribute("aria-label", "לבחור את " + s.title);
      li.classList.toggle("is-picked", pick.on);
      tickBox.addEventListener("change", function () {
        li.classList.toggle("is-picked", tickBox.checked);
        pick.set(tickBox.checked);
      });
      holder.appendChild(tickBox);
      li.appendChild(holder);
    }

    /* The name, and where a name is not the only one of itself, the number
       that says which of them this is. Every shape of row uses it, because a
       song being read and a song that failed to be read are exactly the two
       you are most likely to have two of. */
    function name() {
      var t = el("div", "t", s.title);
      if (mark) t.appendChild(el("span", "dupe", mark));
      return t;
    }

    /* A row with no status at all is a song, not a failure. The column may be
       missing from an older table, and the worst thing this page can do with a
       song it holds the words to is refuse to show them.

       A song still being READ is an ordinary row too. It has a name, and a
       page where that name, its credits and its kinds can be set while the
       machine works; what it does not have is words yet, and its own page says
       so. It used to be a row with a cancel button on it, which put the one
       thing you can do to a song in the machine in a different place from
       everything else you can do to a song. */
    var busy = s.status === "queued" || (s.status === "reading" && !stalled(s));
    if (!s.status || s.status === "ready" || busy) {
      var a = el("a");
      a.href = BASE + "/" + encodeURIComponent(s.slug);
      a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("href")); });

      var box = el("div");

      /* The name, and beside it whoever made it: words, tune, performer, the
         ones that are filled in, separated by commas. Bare names, no labels,
         because a label on every one of three would be longer than the row it
         sits in and nobody reads an index that way. */
      var top = el("div", "t-row");
      top.appendChild(name());
      var by = credits(s);
      if (by.length) {
        top.appendChild(el("div", "by", by.map(function (c) { return c.name; }).join(", ")));
      }
      /* What kind of song it is, beside who wrote it, because both are facts
         about the song rather than about its state: the far column is for the
         states, and a style is not one. */
      styles(s).forEach(function (kind) {
        top.appendChild(el("span", "tag tag-style", kind));
      });
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
          cost.title = priceWhy(s);
          keys.appendChild(cost);
        }
        box.appendChild(keys);
      }

      /* A finished song may still carry a note: the chords ran out of room and
         only the words came. Quiet, under everything, because the song works. */
      if (s.status_note) box.appendChild(el("div", "detail", s.status_note));

      a.appendChild(box);

      /* --- the far column: what state it is in, and when it last changed ------
         Both of them are ABOUT the song rather than in it, and neither is what
         the row is for, so they stand together at the far end where the eye
         goes only when it is asking. Beside the name they were competing with
         it: a label is short, loud and never the thing you are looking for
         when you are looking for a song.

         The state on top and the date under it, because the state is the one
         you scan a column of. */
      var side = el("div", "side");

      var tags = el("div", "side-tags");
      /* A song can carry two: one is the machine's, "nobody has checked this
         reading", and the other the author's, "I am not done with this". */
      /* ONE, because a song is in one state. The row says which, the numbers
         over the list count the same three, and the chip inside the song is
         the same word again. */
      var WHY = {
        imported: "הקובץ נקרא עכשיו. אפשר להיכנס ולמלא שם, מי כתב וסגנון.",
        review: "השיר נקרא מתוך קובץ ועדיין לא נבדק",
        draft: "עוד עובדים עליו, ורק אתם רואים אותו",
        published: "השיר פתוח לכולם",
      };
      var was = rowState(s);
      tags.appendChild(tag(was, STATE_WORDS[was], WHY[was]));
      side.appendChild(tags);

      /* `created_at` behind it, because a song that has never been changed
         since it was written was last changed when it was written. */
      var stamp = whenWords(s.updated_at || s.created_at);
      if (stamp) {
        var when = el("div", "when", stamp);
        when.title = whenExactly(s.updated_at || s.created_at);
        side.appendChild(when);
      }

      a.appendChild(side);
      li.appendChild(a);
      return li;
    }

    /* What is left here is a song whose reading FAILED, or one that went quiet
       long enough to have stopped. A song still being read is an ordinary row
       now, above, and cancelling it is on its own page. */
    var row = el("div", "row is-failed");

    var box2 = el("div");
    box2.appendChild(name());
    box2.appendChild(el("div", "a", stalled(s) ? "הקריאה נתקעה ולא הסתיימה" : "הקריאה נכשלה"));
    if (s.status_note) box2.appendChild(el("div", "detail", s.status_note));
    row.appendChild(box2);

    var actions = el("div", "row-actions");
    actions.appendChild(button("להקליד ידנית", ICON.pencil, "ghost small", function () {
      go(BASE + "/" + encodeURIComponent(s.slug));
    }));
    actions.appendChild(button("מחיקה", ICON.trash, "danger small", function () {
      db.remove(s.id).then(refresh).catch(function (e) { toast("המחיקה נכשלה: " + e.message, true); });
    }));
    row.appendChild(actions);

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
        dir: "rtl", lines: [blankLine("rtl")],
      });
    }

    setBusy("טוען את השיר");
    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);

      /* A song whose reading FAILED is a song with a name and no words yet,
         and the one thing anybody wants to do with it is type it, so it opens
         as itself. A song still being READ opens as itself too now: it has a
         name, credits and kinds that can all be set while the machine works,
         and the only thing that cannot be touched is the one thing that is
         being written (see `coming` in renderSong). */
      /* the column is what the song ran in before a line could say otherwise,
         so it is what a line that says nothing inherits */
      song.lines = normalizeLines(song.lines, song.dir);
      renderSong(song);
    }).catch(fail);
  }

  function renderSong(song) {
    document.title = (song.title || "שיר חדש") + " | אקורדים";

    /* Now there is something on the page to print, and the bar can say so. The
       database answers after the routing has already painted the bar once, so
       it is painted again here rather than earlier. */

    /* Signed in, and on a phone, asked for.

       ONE ANSWER FOR THE WHOLE PAGE, head and sheet alike: everything the
       editor has is on or all of it is off, and there is no half-editable
       page to explain.

       A phone was refused it outright for a long time, and the reason was
       good: a page that can be changed is a page that has to be watched, and a
       page held while walking, or pressed with a hand that is also holding a
       guitar, is where a change nobody meant gets made. What was wrong with it
       was the word "outright". Somebody who has found a wrong chord in the
       middle of a session has a phone in their hand and no desk, and telling
       them to remember it until they get home is telling them to lose it.

       So the phone opens READING, which is what a phone is for, and the editor
       is one press away. The press is the watching: nothing here changes by
       accident, because getting in was on purpose. */
    var onPhone = NARROW.matches;

    /* --- STILL BEING READ ------------------------------------------------------
       A song whose picture is still in the machine has a name, and often
       credits and a kind, and none of those are what the Worker is writing.
       So the page opens and all of it can be set while the reading runs: the
       one thing that cannot be touched is the song itself, because it is being
       written from the other end and a save from here would land on top of it.

       Which is also why the save below never mentions the words while this is
       true. */
    var coming = song.status === "queued" || (song.status === "reading" && !stalled(song));

    var editing = auth.in && (!onPhone || !!state.editOnPhone);

    /* Now there is something on the page to print, and, on a phone, a way into
       the editor and back out. Both are about the page you are on, so both are
       in the top bar with the rest of those, and both are pictures: a pencil
       to go in and a tick to come out.

       LEAVING IS SAFE, so nothing asks. The song writes itself, and whatever
       is still on the clock goes out on the way. */
    state.printable = true;
    if (auth.in && onPhone) {
      state.editToggle = {
        on: editing,
        flip: function () {
          flush();
          state.editOnPhone = !editing;
          renderSong(song);
        },
      };
    }
    paintHeader();

    /* TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER.

       The transposition moves the chords on the page. It opens at 0, the song
       as it was written, and it belongs to this reading of this song: it is
       forgotten the moment the page is left.

       The capo is where the reader's capo is. It moves nothing. It is a fact
       about the guitar in their hands, it is the same on every song and on
       every screen they open, and the sheet's only job is to say it.

       They were one number for a while: the song opened transposed down to
       whatever fret made its chords easiest, and the sheet called that number
       the capo. It reads well and it is a guess about somebody else's hands,
       and worse, it meant "where is my capo" changed every time anybody moved
       the song a semitone. The easy version is still worked out, and still on
       every row of the library, where it is a fact about the song and nobody
       has to accept it. */
    var myCapo = auth.capo();
    var semis = 0;

    /* the size follows the reader from song to song. The transposition does
       not: it belongs to the one song it was worked out for. */
    var size = readingSize();

    app.innerHTML = "";

    /* --- the head: the name, and who made it ---

       No arrow back to the list. The app's name in the bar above is the way
       home on every page, and a second one next to the title only says the
       same thing twice. */

    var head = el("div", "song-head");

    /* The name, and at the other end of its line whatever the song has to say
       about itself. A label under the title is a line of the page spent on two
       words, and on a phone the page is the song. */
    var headTop = el("div", "head-top");

    var title = el("h1", null, song.title);
    if (editing) {
      /* A name that has not been typed yet is nowhere to click: an empty
         contenteditable is zero pixels wide. So it says what it wants, the way
         an evening's name does, and the word goes the moment a letter lands on
         it. It is also the one field the song cannot be saved without, its
         address being made from it. */
      title.dataset.empty = "שם השיר";
      makeEditable(title);
      title.addEventListener("input", function () { song.title = title.textContent.trim(); mark(); });
      title.addEventListener("keydown", function (event) {
        /* one line, so Enter is not a newline here, it is done */
        if (event.key === "Enter") { event.preventDefault(); title.blur(); }
      });
    }
    headTop.appendChild(title);
    head.appendChild(headTop);

    var byFields = [];
    /* set below, with the things they keep in step with the song */
    var showState = null;
    var showStyles = null;
    var statusChip = null;

    /* THREE, AND A SONG IS IN ONE OF THEM. They are booleans in the database
       because that is what a policy can read (published is who may open it),
       and one word here, because a person should never have to work out a
       combination.

       Not published and not waiting to be checked means somebody is working on
       it, which is what a draft is. There is no fourth state for "finished and
       private": a song nobody else can open is a song still being worked on,
       whether or not anybody has touched it today. */
    var STATE_WORDS = {
      imported: "מיובא",
      review: "לסקירה",
      draft: "טיוטה",
      published: "פורסם",
    };

    function songState() {
      if (coming) return "imported";
      if (song.published) return "published";
      if (song.review) return "review";
      return "draft";
    }
    if (editing) {
      /* Who wrote it, on the song itself. It belongs to it and there is no
         other page to keep it on any more. */
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

      /* --- what kind of song it is ---
         A row of what it already is, each with a way off, and a field to add
         another. Not a list to choose from: the vocabulary of a library is
         discovered over a year of adding songs to it, so what is offered is
         every style the library already uses, and a new one is just typed.

         THREE WAYS TO FINISH TYPING ONE, and it took only the first for a
         while, which meant a style picked from the suggestions with the mouse
         was never added at all: choosing from a datalist fires no key. Enter,
         choosing a suggestion, and walking away from a field with a word left
         in it all mean the same thing, so all three do it. */
      var kindsRow = el("div", "kinds-field");
      /* One word, like the two beside it, and singular like them: the field
         takes several and so does "לחן". */
      var kindsLabel = el("div", "kinds-label", "סגנון");
      var kindsList = el("div", "kinds-list");
      var kindsInput = el("input");
      kindsInput.type = "text";
      kindsInput.placeholder = "להוסיף סגנון";
      kindsInput.setAttribute("aria-label", "להוסיף סגנון לשיר");

      var kindsKnown = el("datalist");
      kindsKnown.id = "song-styles";
      kindsInput.setAttribute("list", kindsKnown.id);
      db.styles().then(function (all) {
        if (!kindsKnown.isConnected) return;
        all.forEach(function (name) {
          var option = el("option");
          option.value = name;
          kindsKnown.appendChild(option);
        });
      });

      showStyles = function () {
        kindsList.textContent = "";
        styles(song).forEach(function (name) {
          var chip = el("span", "tag tag-style");
          chip.appendChild(el("span", null, name));
          var off = el("button", "tag-x", "×");
          off.type = "button";
          off.title = "להוריד את הסגנון";
          off.addEventListener("click", function () {
            song.styles = styles(song).filter(function (other) { return other !== name; });
            showStyles();
            mark();
          });
          chip.appendChild(off);
          kindsList.appendChild(chip);
        });
      };
      showStyles();

      function addKind() {
        var name = kindsInput.value.trim();
        if (!name) return;
        song.styles = tidyStyles(styles(song).concat([name]));
        kindsInput.value = "";
        showStyles();
        mark();
      }

      kindsInput.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addKind();
      });
      /* `change` is what a datalist choice fires, and what a field left with a
         word in it fires on the way out. Both are somebody having finished
         saying one style. */
      kindsInput.addEventListener("change", addKind);
      kindsInput.addEventListener("blur", addKind);

      kindsRow.appendChild(kindsLabel);
      kindsRow.appendChild(kindsList);
      kindsRow.appendChild(kindsInput);
      kindsRow.appendChild(kindsKnown);
      meta.appendChild(kindsRow);

      /* The direction used to be one button up here, and it belonged to the
         whole song. It is a property of a LINE now and it is chosen down in the
         sheet, on the lines it is about (see the block bar): a song with a
         Hebrew verse and an English chorus has no one answer to give here. */

      /* --- ONE CHIP, WHICH IS THE STATE AND THE ONLY WAY OUT OF IT ---
         A song is in exactly one of these at a time, so it is one word and not
         a row of switches to work out the combination of:

           לסקירה   a machine read it and nobody has looked at it yet
           טיוטה    somebody is working on it, or has just touched it
           פורסם    finished, and other people may open it

         Pressing it offers what it can become, and from every one of those
         there is exactly one answer worth offering: פורסם. Going the other way
         needs no button at all, because touching the song does it (see mark).

         There is no save button on this page. A draft writes itself as it is
         typed, and publishing writes it too: "finished, let people have it" is
         one sentence, so it is one press. */
      statusChip = el("button", "status-chip");
      statusChip.type = "button";
      statusChip.addEventListener("click", function () { askState(statusChip); });
      meta.appendChild(statusChip);

      showState = function () {
        var was = songState();
        statusChip.className = "status-chip tag tag-" + was;
        statusChip.textContent = STATE_WORDS[was];
        statusChip.title = was === "published"
          ? "השיר פתוח לכולם. כל שינוי בו מחזיר אותו לטיוטה."
          : was === "imported"
          ? "השיר נקרא עכשיו מתוך הקובץ. לחיצה מאפשרת לבטל."
          : "לחיצה מפרסמת את השיר: רק שיר מפורסם נפתח למי שלא כתב אותו.";
      };
      showState();

      head.appendChild(meta);
    } else {
      /* Reading it, the credits are a sentence rather than a form, and it
         matters which is which: whoever wrote the words is rarely the one you
         heard sing them.

         A name that is not known is not written down: an empty field is a
         question the reader was not asked, and a song whose credits are both
         empty says nothing here at all. Which is why this is a sentence and not
         a form: a form has to show the rows it has no answers for, and a
         sentence simply leaves them out. */
      var by = credits(song);
      if (by.length) {
        head.appendChild(el("div", "by", by.map(function (c) {
          return c.label + ": " + c.name;
        }).join("  •  ")));
      }

      /* Reading it rather than writing it, the draft mark is not a button to
         press but something to know before playing from the page: this one is
         not finished. */
      var flagRow = el("div", "head-tags");
      styles(song).forEach(function (name) {
        flagRow.appendChild(el("span", "tag tag-style", name));
      });
      flagRow.appendChild(el("span", "tag tag-" + songState(), STATE_WORDS[songState()]));
      /* on the title's own line, at the far end of it */
      headTop.appendChild(flagRow);
    }

    app.appendChild(head);

    /* What the machine could not do, said on the song rather than instead of
       it. A read whose chords ran out of room still lands here with its words,
       and a read that failed altogether lands here with nothing but its name,
       and in both cases the page is the same page and the note is the whole of
       the difference. Saving clears it, because saving makes it untrue. */
    if (song.status_note) app.appendChild(el("div", "song-note", song.status_note));

    /* A band used to sit here saying the song had been read by a machine and
       not by a person, with a button to take the label off. Both are the
       status chip's job now: it says לסקירה, and touching the song or
       publishing it is what takes it off. One fact, one place. */

    /* --- the tools --- */

    var tools = el("div", "tools");

    /* ONE CONTROL IS ONE THING: its name, what it is at, and the two buttons
       that move it. So it is one group and not four things standing in a row,
       and the air goes between the controls rather than through the middle of
       either of them. Less and more sit side by side, and the count sits with
       its label rather than between them, so transposition and size are laid
       out identically and neither has to be read differently from the other. */
    /* THE NAME IS A PICTURE. Three words, each as long as the control it names,
       is most of a row on a phone spent saying what the numbers beside them
       already say: a value that goes up and down under an arrow is a key, and
       under two letters is a size. The word is still there for anyone hovering
       or listening. */
    function control(icon, label, valueNode, less, more) {
      var ctl = el("span", "ctl");

      /* The number, and under it the picture of what the number is. They are
         one thing to read and they are read downwards: what it is at, and what
         "it" is. Beside them, the way to move it. */
      var dial = el("span", "dial");
      if (valueNode) dial.appendChild(valueNode);
      var lbl = el("span", "lbl");
      lbl.appendChild(svg(icon));
      lbl.title = label;
      lbl.setAttribute("aria-label", label);
      dial.appendChild(lbl);
      ctl.appendChild(dial);
      /* THE TWO OF THEM IN ONE BOX. They were two bordered squares with air
         between them, which is two of everything a stepper needs one of, and
         three controls' worth of that is most of a phone's row. Joined, they
         read as the one thing they are, and the row fits. */
      var steps = el("span", "steps");
      /* more on top and less under it, which is the direction they mean */
      steps.appendChild(iconBtn(ICON.plus, "יותר " + label, more));
      steps.appendChild(iconBtn('<path d="M5 12h14"/>', "פחות " + label, less));
      ctl.appendChild(steps);
      return ctl;
    }

    /* --- THE KEY THE SONG IS WRITTEN IN ----------------------------------------
       Transposing moves the chords on the screen and changes nothing about the
       song: everybody else still opens it in the key it was written in. Which
       is right for a reader, and not enough for whoever keeps the song, because
       "does this start on Am or on Dm" is a decision about the song itself and
       somebody has to be able to make it.

       So in the editor the number is a button. Press it, press "ברירת מחדל",
       and what is on the screen becomes what the song IS: every chord is
       written down as it is being shown, and the transposition drops to zero
       because there is nothing left to transpose. Nothing on screen moves,
       which is the point.

       It is not offered at zero. There is nothing to make default when the
       song is already being shown as itself. */
    var value = el(editing && !coming ? "button" : "span", "val", "0");
    if (editing && !coming) {
      value.type = "button";
      value.title = "לקבוע את הסולם הזה כברירת המחדל של השיר";
      value.addEventListener("click", function () { askKey(value); });
    }
    tools.appendChild(control(
      ICON.pitch, "טרנספוזיציה", value,
      function () { setSemis(semis - 1); },
      function () { setSemis(semis + 1); }
    ));

    tools.appendChild(el("span", "sep"));
    /* THE SAME THREE PARTS AS THE OTHER TWO. This one had no number for a
       while, on the argument that nobody reads a font size, and the argument
       was about the number rather than about the row: three controls that look
       alike and one of them missing its middle is a row you have to look at
       twice to use once. */
    var sizeValue = el("span", "val");
    tools.appendChild(control(
      ICON.textSize, "גודל", sizeValue,
      function () { setSize(size - SIZE_STEP); },
      function () { setSize(size + SIZE_STEP); }
    ));

    function showSize() { sizeValue.textContent = String(size); }
    showSize();

    /* WHERE THE CAPO IS, WHICH IS WHEREVER THEY PUT IT. It moves nothing: the
       chords on the page are the transposition's business, and this is a fact
       about the guitar. The sheet says it under the title and that is the
       whole of what it does with it.

       A fret, so zero or up, and zero means no capo, which is a real answer
       and the usual one. It is the same on every song and on every screen the
       account opens, because it is a fact about the player.

       Only for somebody signed in. There is no account to keep it on
       otherwise, and a preference that is silently forgotten is worse than one
       that was never offered. */
    var myValue = null;
    if (auth.in) {
      tools.appendChild(el("span", "sep"));
      myValue = el("span", "val");
      var mine = control(
        ICON.capo, "קפו", myValue,
        function () { setMyCapo(myCapo - 1); },
        function () { setMyCapo(myCapo + 1); }
      );
      mine.title = "באיזה סריג הקפו שלכם. נשמר לחשבון ומופיע על כל שיר.";
      tools.appendChild(mine);
      showMyCapo();
    }

    function showMyCapo() {
      if (myValue) myValue.textContent = String(myCapo);
    }

    /* The sheet answers at once and the account is told behind it: a fret is
       not worth waiting on a network for, and the number is already kept in
       this browser's copy of the session either way. */
    function setMyCapo(next) {
      myCapo = Math.max(0, Math.min(next, MAX_CAPO));
      showMyCapo();
      auth.setCapo(myCapo).catch(function () {
        toast("הקפו נשמר כאן, אבל לא הצליח להישמר בחשבון", true);
      });
    }

    tools.appendChild(el("span", "grow"));

    /* Printing sits in the top bar now, so what is left in this row is only
       what changes the song in front of you. Deleting is the thing you almost
       never mean and can never take back, so it is one quiet icon standing on
       its own, and it asks before it does anything.

       Three ways back, each smaller than the last, and none of them there
       until it has something to undo:

         undo, one step at a time, also on Ctrl+Z
         back to the original, the whole way, in one press
         and save, which is the only one that writes anything. */
    /* Both of them are pictures in the top bar with the rest of what is about
       this page rather than about the song's key or its size: an arrow back
       for the last thing done, a clock going backwards for all of it.

       They are made here rather than in the bar because they come and go with
       what there is to undo, and it is this page that knows: the bar is
       painted once and these two change on every keystroke. */
    var undoBtn = iconBtn(ICON.undo, "ביטול הפעולה האחרונה", undo);
    var revertBtn = iconBtn(ICON.history, "החזרה למקור", revert);
    revertBtn.classList.add("quiet");
    /* WHERE THE WRITING GOT TO, which is what is left of the save button: the
       song writes itself now (see the saving block below), so the row does not
       need a thing to press, it needs a thing to read. */
    var stateNode = el("span", "save-state");
    undoBtn.hidden = true;
    revertBtn.hidden = true;

    /* EVERYTHING THAT IS ABOUT THE PAGE GOES TO THE BAR, and the row over the
       song is left holding only the three things that change what you are
       looking at. Deleting the song, taking a change back, taking all of them
       back, and the word saying where the writing got to: none of those is a
       property of the song on screen, they are what is being done to it.

       Inserted at the START of the bar, which on a page that runs right to
       left is its right hand end, in the order they are read: how it is going,
       then the ways back, then the way to be rid of it. */
    if (editing) {
      var topBar = document.getElementById("topActions");
      var mine = [];
      if (song.id) {
        var trash = iconBtn(ICON.trash, "מחיקת השיר", removeSong);
        trash.classList.add("quiet");
        mine.push(trash);
      }
      mine.push(revertBtn, undoBtn, stateNode);
      mine.forEach(function (node) { topBar.insertBefore(node, topBar.firstChild); });
    }
    app.appendChild(tools);

    /* The sheet used to carry a "קפו 3" chip of its own, from when the capo was
       worked out from the transposition and was a fact about the SONG. It is a
       fact about the player now, it is on the control that sets it, and a
       second copy inside the song was the same number twice: on screen it is
       an inch from its own control, and on paper it is a note about whoever
       printed the page rather than about the song on it. */
    var sheet = el("div", "sheet" + (editing && !coming ? " ed" : ""));
    sheet.style.setProperty("--song-size", size + "px");
    app.appendChild(sheet);

    /* The marked lines, and the two things worth doing to them. It floats over
       the page instead of sitting in the tools above the sheet, because the
       verse being moved can be anywhere in a long song: a control that has to
       be scrolled back to between one press and the next is not there. */
    var blockBar = null;
    var blockCount = null;
    var dropBtn = null;
    if (editing && !coming) {
      blockBar = el("div", "block-bar");
      blockCount = el("div", "block-count");
      blockBar.appendChild(blockCount);
      blockBar.appendChild(iconBtn(ICON.up, "להעלות את המסומן", function () { moveMarked(-1); }));
      blockBar.appendChild(iconBtn(ICON.down, "להוריד את המסומן", function () { moveMarked(1); }));
      blockBar.appendChild(button("שכפול", ICON.copy, "ghost small", copyMarked));

      /* Which way the marked lines run. Two buttons rather than one that
         toggles, because a block can hold both directions at once and there
         would be no honest state for a toggle to be in; these two say what to
         BE, which is an answer whatever the lines are now. The Latin names on
         a Hebrew page on purpose: they are what the two directions are called
         everywhere they are written down. */
      var toRtl = button("RTL", null, "ghost small", function () { faceMarked("rtl"); });
      var toLtr = button("LTR", null, "ghost small", function () { faceMarked("ltr"); });
      toRtl.title = "השורות המסומנות בעברית, מימין לשמאל";
      toLtr.title = "השורות המסומנות באנגלית, משמאל לימין";
      toRtl.dir = "ltr";
      toLtr.dir = "ltr";
      blockBar.appendChild(toRtl);
      blockBar.appendChild(toLtr);

      blockBar.appendChild(button("העתקת אקורדים", null, "ghost small", liftChords));
      /* not there until there is something to put down */
      dropBtn = button("הדבקת אקורדים", null, "ghost small", dropChords);
      dropBtn.hidden = true;
      blockBar.appendChild(dropBtn);
      blockBar.appendChild(button("ביטול הסימון", null, "ghost small", function () { clearMarks(); }));
      blockBar.hidden = true;
      app.appendChild(blockBar);
    }

    var addRow = null;
    if (editing && !coming) {
      addRow = el("div", "ed-bar");
      /* A new line runs the way the song's last line runs. Whoever is typing an
         English chorus is typing the next line of it too. */
      addRow.appendChild(button("שורה בסוף", ICON.plus, "ghost small", function () {
        song.lines.push(blankLine(lastDir()));
        draw();
        focusLine(song.lines.length - 1);
        mark();
      }));
      addRow.appendChild(button("כותרת קטע", ICON.section, "ghost small", function () {
        song.lines.push({ type: "section", text: "פזמון", chords: [], dir: lastDir() });
        draw();
        focusLine(song.lines.length - 1);
        mark();
      }));
      /* Here rather than in the block bar, because the block bar is not on
         screen until something is marked, and this is how a song with nothing
         marked gets everything marked. */
      addRow.appendChild(button("סימון כל השורות", null, "ghost small", markAll));
      app.appendChild(addRow);
    }

    /* The sheet's own direction is the song's, which is its first line's. It
       decides where the capo chip and the headings sit; each line inside says
       which way IT runs and is laid out by that alone. */
    function draw() {
      /* every row on screen is about to stop existing, and the little button
         hanging under one of them with it */
      hideGap();
      sheet.innerHTML = "";
      song.dir = songDir(song.lines);
      sheet.dir = song.dir;

      /* WHAT STANDS WHERE THE SONG WILL BE. A reading takes a minute or two
         and it is happening somewhere else, so the sheet says how long it has
         been going and what stage it reached, counted here and ticking every
         second: a number that only moves when the Worker's heartbeat lands
         reads as a stuck one. */
      if (coming) {
        var waiting = el("div", "coming");
        var spin = el("span", "busy");
        spin.appendChild(el("span", "spin"));
        var howLong = el("span");
        howLong.dataset.since = Date.parse(song.created_at || "") || Date.now();
        howLong.dataset.stage = song.status_note || (song.status === "queued" ? "ממתין בתור" : "ממתין");
        elapsed(howLong);
        spin.appendChild(howLong);
        waiting.appendChild(spin);
        waiting.appendChild(el("p", "muted", "הקריאה ממשיכה גם בלי הדף הזה. השם, מי כתב וסגנון אפשר למלא כבר עכשיו."));
        sheet.appendChild(waiting);
        tick(sheet);
        return;
      }

      song.lines.forEach(function (line, index) {
        sheet.appendChild(editing ? editRow(line, index) : viewLine(line, semis));
      });
      /* a marked line that was joined into its neighbour is not a line any
         more, so what the bar is counting is asked again after every redraw */
      showMarked();
      /* Breaking first and placing second, because a chord belongs to the row
         its syllable ended up on and there is no telling which that is until
         the words have been broken. */
      requestAnimationFrame(function () {
        if (!editing && NARROW.matches) flowSheet(sheet);
        layoutAll(sheet);
      });
    }

    /* Round, not against a wall. Past the top it comes out at the bottom and
       the other way about, so reaching a distant key is never a matter of
       pressing the other button eleven times. */
    function setSemis(next) {
      semis = next > 11 ? -11 : next < -11 ? 11 : next;
      value.textContent = semis > 0 ? "+" + semis : String(semis);
      draw();
    }

    /* Bigger words fit in fewer places, so where the lines break is part of
       what the size changes. Drawn again rather than measured again, since the
       rows themselves are different rows. */
    function setSize(next) {
      size = readingSize(next);
      showSize();
      sheet.style.setProperty("--song-size", size + "px");
      if (!editing && NARROW.matches) return draw();
      requestAnimationFrame(function () { layoutAll(sheet); });
    }

    /* --- what has changed ----------------------------------------------------
       The song as it would be saved, in one string. Comparing that against the
       string it was loaded as is the whole of "is there anything to save": it
       cannot miss a change and cannot invent one, which no counting of events
       could promise. A song is a few hundred characters, so it costs nothing to
       ask after every keystroke. */
    /* THE SONG ITSELF, apart from what is said about it. Two things are being
       compared here and they are not the same question: whether the words,
       chords, name, credits or kinds have moved, and whether the song is
       finished or out in the world. Only the first of them puts a song back
       into draft (see mark), and a button that says "this is finished" must
       not be able to count as work on it. */
    function songBody() {
      return JSON.stringify([
        String(song.title || "").trim(),
        CREDITS.map(function (c) { return String(song[c.field] || "").trim(); }),
        song.dir || "rtl",
        songToText(song.lines),
        styles(song),
      ]);
    }

    function snapshot() {
      return JSON.stringify([
        songBody(),
        /* in here, so pressing one of these lights the save button and taking
           a change back takes the mark with it */
        !!song.draft,
        !!song.published,
      ]);
    }

    /* --- making this key the song's own ---------------------------------------
       One offer, and only when there is one: the chords as they are on screen,
       written into the song. */
    var keyMenu = null;

    function closeKeyMenu() {
      if (!keyMenu) return;
      keyMenu.remove();
      keyMenu = null;
      document.removeEventListener("pointerdown", keyOutside, true);
    }

    function keyOutside(event) {
      if (!keyMenu) return;
      if (keyMenu.contains(event.target)) return;
      if (value.contains && value.contains(event.target)) return;
      closeKeyMenu();
    }

    function askKey(anchor) {
      if (keyMenu) return closeKeyMenu();
      if (!semis) return;

      keyMenu = el("div", "print-menu");
      keyMenu.appendChild(button("ברירת מחדל", null, "ghost small", function () {
        closeKeyMenu();
        bakeKey();
      }));
      document.body.appendChild(keyMenu);

      var box = anchor.getBoundingClientRect();
      var width = keyMenu.offsetWidth;
      keyMenu.style.top = (box.bottom + 6) + "px";
      keyMenu.style.left = Math.min(Math.max(6, box.right - width), window.innerWidth - width - 6) + "px";

      document.addEventListener("pointerdown", keyOutside, true);
    }

    /* The chords are rewritten, the number goes to zero, and between the two
       of them the sheet does not move a pixel: what was being SHOWN is now
       what is STORED. Every chord by identity, so the drag handlers and the
       picker keep holding the same objects they were holding. */
    function bakeKey() {
      var by = semis;
      if (!by) return;
      song.lines.forEach(function (line) {
        line.chords.forEach(function (c) { c.chord = transposeChord(c.chord, by); });
      });
      setSemis(0);
      mark();
      toast("הסולם הזה הוא עכשיו ברירת המחדל של השיר");
    }

    /* --- what it can become ----------------------------------------------------
       One offer, always the same one: פורסם. Everything else about the state
       happens by itself, so there is nothing else here to choose. A song that
       is already out in the world has nothing to be offered at all, and its
       chip says so by not opening.

       A panel and not a straight toggle, because publishing is the one press
       on this page that changes who can see the song, and a press that does
       that should be aimed at rather than brushed against. */
    var stateMenu = null;

    function closeStateMenu() {
      if (!stateMenu) return;
      stateMenu.remove();
      stateMenu = null;
      document.removeEventListener("pointerdown", stateOutside, true);
    }

    function stateOutside(event) {
      if (!stateMenu) return;
      if (stateMenu.contains(event.target)) return;
      if (statusChip && statusChip.contains(event.target)) return;
      closeStateMenu();
    }

    function askState(anchor) {
      if (stateMenu) return closeStateMenu();
      if (songState() === "published") return;

      stateMenu = el("div", "print-menu");

      /* A song still in the machine has one thing that can be done to it and
         it is not publishing: there is nothing to publish yet. Cancelling is
         deleting the row outright, which is the whole of how a reading is
         called off, and it is the reason this is not the soft delete the rest
         of the app uses: the Workflow holding the song stops when it finds the
         row gone. */
      if (coming) {
        stateMenu.appendChild(button("ביטול הייבוא", ICON.close, "ghost small", function () {
          closeStateMenu();
          if (!window.confirm('לבטל את הייבוא של "' + (song.title || "השיר") + '"?')) return;
          db.purge(song.id).then(function () {
            toast("הייבוא בוטל");
            go(BASE + "/");
          }).catch(function (e) { toast("הביטול נכשל: " + e.message, true); });
        }));
        document.body.appendChild(stateMenu);
        placeStateMenu(anchor);
        document.addEventListener("pointerdown", stateOutside, true);
        return;
      }

      stateMenu.appendChild(button("פורסם", null, "ghost small", function () {
        closeStateMenu();
        song.published = true;
        song.draft = false;
        song.review = false;
        showState();
        mark();
        /* AND IT SAVES, now rather than in a second: this is the press that
           hands the song to everybody else. */
        queueSave(true);
      }));
      document.body.appendChild(stateMenu);
      placeStateMenu(anchor);
      document.addEventListener("pointerdown", stateOutside, true);
    }

    function placeStateMenu(anchor) {
      var box = anchor.getBoundingClientRect();
      var width = stateMenu.offsetWidth;
      stateMenu.style.top = (box.bottom + 6) + "px";
      stateMenu.style.left = Math.min(Math.max(6, box.right - width), window.innerWidth - width - 6) + "px";
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

    /* --- a touched song is a draft again ---------------------------------------
       What everybody else can open is what was published, and the moment a
       word of it moves, the song on this screen is not that song any more. So
       touching ANYTHING that can be edited puts it back to being a draft and
       takes it out of the world, and the one thing the status chip offers is
       the way back out: פורסם, which means "this is finished, let people have
       it" and is the same sentence twice, and so is one press.

       Only a change to the song itself. Publishing is a statement ABOUT the
       song and must not count as work on it, or the state could never leave
       draft: it would put itself straight back. */
    var lastBody = songBody();

    function mark() {
      var body = songBody();
      if (!restoring && editing && body !== lastBody && songState() !== "draft") {
        song.draft = true;
        song.published = false;
        /* A machine read it and a person has now touched it, which is the
           whole of what the review label was waiting for. */
        song.review = false;
        if (showState) showState();
      }
      lastBody = body;

      var now = snapshot();

      if (!restoring && now !== current) {
        var when = Date.now();
        if (!history.length || when - lastPush > BURST) {
          history.push(current);
          lastPush = when;
        }
        current = now;
      }

      revertBtn.hidden = now === saved;
      undoBtn.hidden = !history.length;

      keepDraft(now);
      if (now !== saved) queueSave(false);
    }

    /* Back to a state, whole: the words, the chords, the order of the lines,
       the credits and the direction. Everything outside the sheet is written
       back too, because a title that still shows what was undone is a page
       lying about what it holds. */
    function restore(state) {
      var was = JSON.parse(state);
      var body = JSON.parse(was[0]);
      restoring = true;

      song.title = body[0];
      CREDITS.forEach(function (c, index) { song[c.field] = body[1][index] || ""; });
      song.dir = body[2] || "rtl";
      /* Lines read back out of a string are new objects, so every mark is now
         held against a line that is not in the song any more. */
      marked.length = 0;
      song.lines = normalizeLines(body[3], song.dir);
      song.styles = tidyStyles(body[4]);
      song.draft = !!was[1];
      song.published = !!was[2];

      if (title.textContent !== song.title) title.textContent = song.title;
      byFields.forEach(function (input, index) { input.value = body[1][index] || ""; });
      if (showDraft) showDraft();
      if (showStyles) showStyles();

      draw();
      /* the song is what it was, so what a change is measured against is what
         it was too: without this the restore itself reads as an edit and puts
         the draft mark straight back on */
      lastBody = songBody();
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
    if (editing && !coming) {
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

    /* --- room between two letters ---------------------------------------------
       Two chords over one short word push each other along until the second
       one is not over anything. The room they need is between two letters of a
       word that must not be broken, so it is opened with the gap character
       (see GAP): five of them, invisible, and gone again from anything that
       wants the words.

       Offered rather than done. Clicking into a line is how you edit it, and a
       click that quietly inserted anything would be an editor that types back.
       So the click puts a small button UNDER the letters, at the place it
       would open, and the button is the only thing that opens it.

       Under and not over, and small: it is standing in the space between one
       line and the next, where nothing is being read, and it is out of the way
       of the words and of the chords above them. Typing dismisses it. */
    var gapBtn = null;

    function hideGap() {
      if (!gapBtn) return;
      gapBtn.remove();
      gapBtn = null;
      document.removeEventListener("pointerdown", gapOutside, true);
    }

    function gapOutside(event) {
      if (gapBtn && !gapBtn.contains(event.target)) hideGap();
    }

    function offerGap(ln, line, editable) {
      hideGap();

      var at = caretIndex(editable);
      if (at == null) return;

      /* WHEREVER THE CARET IS, the front of the line included. A line that
         opens on a chord needs room before its first letter as much as a word
         needs room inside itself, and "anywhere except the very start" is a
         rule nobody can see and everybody would trip over.

         The button hangs under the character the caret is in front of; at the
         end of a line there is no such character, so it hangs under the last
         one. A line with no characters at all has nothing to space out. */
      var letter = editable.children[at] || editable.children[editable.children.length - 1];
      if (!letter) return;

      gapBtn = el("button", "gap-btn");
      gapBtn.type = "button";
      gapBtn.title = "לפתוח רווח בין האותיות, בלי לשבור את המילה";
      gapBtn.setAttribute("aria-label", gapBtn.title);
      gapBtn.appendChild(svg(ICON.gap));
      /* the caret is the whole of where this will go, so the press must not
         take it away first */
      gapBtn.addEventListener("pointerdown", function (event) { event.preventDefault(); });
      gapBtn.addEventListener("click", function () { openGap(ln, line, editable, at); });
      document.body.appendChild(gapBtn);

      var box = letter.getBoundingClientRect();
      var width = gapBtn.offsetWidth;
      var left = Math.min(Math.max(4, box.left + box.width / 2 - width / 2), window.innerWidth - width - 4);
      gapBtn.style.left = left + "px";
      gapBtn.style.top = (box.bottom + 2) + "px";

      document.addEventListener("pointerdown", gapOutside, true);
    }

    function openGap(ln, line, editable, at) {
      var was = line.text;
      var next = was.slice(0, at) + gapRun() + was.slice(at);

      /* The same three steps typing takes, for the same reason: the chords are
         written onto the objects the handlers already hold, the caret is put
         back where the person left it, and the labels catch up with the model
         they name. The caret is handed to remapChords because a run of
         identical characters cannot be diffed: five gaps inserted anywhere in
         a line of gaps gives the same string. */
      var moved = remapChords(was, next, line.chords, at);
      line.chords.forEach(function (c, i) { c.pos = moved[i].pos; });
      line.text = next;

      fillSpans(editable, next);
      placeCaret(editable, at + GAP_RUN);

      var nodes = ln.querySelectorAll(".ln-c .chord");
      for (var i = 0; i < nodes.length && i < line.chords.length; i++) {
        nodes[i].dataset.pos = line.chords[i].pos;
      }
      layoutLine(ln);

      hideGap();
      mark();
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
      /* Which way this one runs, said on the row: it is what the browser lays
         the words out by and what every measurement here asks (see rowRtl). */
      ln.dir = dirOf(line, song.dir);

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
          var chord = { pos: posFromX(ln, event.clientX), chord: "" };
          line.chords.push(chord);
          var node = chordEl("", chord.pos, semis);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
          layoutLine(ln);
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
          layoutLine(ln);
        });
        text.addEventListener("keydown", function (event) { lineKeys(event, line, text); });
        /* Clicking between two letters offers to open a gap there, and typing
           takes the offer away again: it is an answer to standing still, not
           something to type around. */
        text.addEventListener("click", function () { offerGap(ln, line, text); });
        text.addEventListener("keydown", hideGap, true);
        ln.appendChild(text);
      }

      /* The one thing beside a line: the box that makes it part of the block.
         Out in the sheet's own margin, so it takes no width from the words and
         no chord moves by a pixel because a line can be marked. */
      if (isMarked(line)) ln.classList.add("is-marked");
      var pick = el("label", "ln-pick");
      var box = el("input");
      box.type = "checkbox";
      box.checked = isMarked(line);
      box.tabIndex = -1;
      box.setAttribute("aria-label", "לסמן את השורה");
      box.addEventListener("change", function () {
        setMark(line, box.checked);
        ln.classList.toggle("is-marked", box.checked);
        showMarked();
      });
      pick.appendChild(box);
      ln.appendChild(pick);

      return ln;
    }

    /* --- moving a verse ------------------------------------------------------
       The grip carries ONE line, which is the right size for a line that ended
       up in the wrong place and the wrong size for the thing that actually goes
       wrong in a song: a whole verse in the wrong order, four lines that have
       to travel together. Dragging those one at a time is four drags, and after
       the first one they are no longer beside each other.

       So a line can be marked, and what is marked moves as one. Contiguous or
       not: each marked line steps over the unmarked line next to it, which for
       a verse is the verse moving a line at a time, and for a scattered set is
       each of them keeping its distance from the others.

       THE MARKS ARE LINE OBJECTS, NEVER INDICES, for the same reason the chords
       are: a line can be split, joined or carried up the page by the grip while
       a mark is still held, and an index would quietly start pointing at the
       neighbour. */
    var marked = [];

    function isMarked(line) { return marked.indexOf(line) >= 0; }

    function setMark(line, on) {
      var at = marked.indexOf(line);
      if (on && at < 0) marked.push(line);
      if (!on && at >= 0) marked.splice(at, 1);
    }

    function clearMarks() {
      marked.length = 0;
      showMarked();
      rowsOf().forEach(function (ln) { ln.classList.remove("is-marked"); });
      Array.prototype.forEach.call(sheet.querySelectorAll(".ln-pick input"), function (box) {
        box.checked = false;
      });
    }

    /* The whole song in one press. Turning a song that came out in the wrong
       direction the right way round, or moving all of it down to make room at
       the top, is a thing about the song rather than about a verse, and ticking
       forty boxes to say so is forty presses to say one word.

       Not a toggle: the same bar already carries the way back, and a button
       that means two different things depending on what is ticked is a button
       you have to look at what is ticked to press. */
    function markAll() {
      marked.length = 0;
      song.lines.forEach(function (line) { marked.push(line); });
      showMarked();
      rowsOf().forEach(function (ln) { ln.classList.add("is-marked"); });
      Array.prototype.forEach.call(sheet.querySelectorAll(".ln-pick input"), function (box) {
        box.checked = true;
      });
    }

    function markedCount() {
      return song.lines.filter(isMarked).length;
    }

    function showMarked() {
      if (!blockBar) return;
      var n = markedCount();
      blockBar.hidden = !n;
      blockCount.textContent = n === 1 ? "שורה אחת מסומנת" : n + " שורות מסומנות";
      dropBtn.hidden = !lifted;
    }

    /* One step, in whichever direction. Walked from the edge the block is
       moving towards, so the lines never step on each other, and a marked line
       whose neighbour is marked too stays where it is: that neighbour is part
       of the same block and has already moved, or is against the end of the
       song and nothing can. */
    function moveMarked(step) {
      var lines = song.lines;
      var at = [];
      lines.forEach(function (line, index) { if (isMarked(line)) at.push(index); });
      if (!at.length) return;
      if (step > 0) at.reverse();

      var moved = false;
      at.forEach(function (index) {
        var to = index + step;
        if (to < 0 || to >= lines.length) return;
        if (isMarked(lines[to])) return;
        var was = lines[to];
        lines[to] = lines[index];
        lines[index] = was;
        moved = true;
      });
      if (!moved) return;

      draw();
      mark();
    }

    /* A chorus is the same four lines again, and typing them a second time is
       typing them a second time. So what is marked can be laid down again,
       words, chords and headings together, right under the last of it.

       THE COPY IS WHAT STAYS MARKED. Almost every duplication is followed by
       moving the new verse somewhere, and the thing you want under the arrows
       afterwards is the one that was just made, not the one it came from. */
    function copyLine(line) {
      return {
        type: line.type,
        text: line.text,
        chords: line.chords.map(function (c) { return { pos: c.pos, chord: c.chord }; }),
      };
    }

    function copyMarked() {
      var going = song.lines.filter(isMarked);
      if (!going.length) return;

      var last = 0;
      song.lines.forEach(function (line, index) { if (isMarked(line)) last = index; });

      var copies = going.map(copyLine);
      song.lines.splice.apply(song.lines, [last + 1, 0].concat(copies));

      marked.length = 0;
      copies.forEach(function (line) { marked.push(line); });

      draw();
      mark();
    }

    /* Which way the last line of the song runs, which is which way the next one
       will. A song with nothing in it yet runs the way the song says. */
    function lastDir() {
      var lines = song.lines;
      return lines.length ? dirOf(lines[lines.length - 1], song.dir) : (song.dir || "rtl");
    }

    /* The direction of the marked lines, set to what was asked for rather than
       flipped: a block can hold both directions at once, and "the other one" is
       not an answer when there are two of them.

       Drawn again rather than nudged, because a line changing direction changes
       which edge it starts at, where every chord on it is measured from and,
       on a phone, where the whole thing breaks. */
    function faceMarked(dir) {
      var going = song.lines.filter(isMarked);
      if (!going.length) return;

      var moved = false;
      going.forEach(function (line) {
        if (dirOf(line) === dir) return;
        line.dir = dir;
        moved = true;
      });
      if (!moved) return;

      draw();
      mark();
    }

    /* --- the chords of one line onto another ---------------------------------
       A verse and a chorus are usually the same handful of chords in the same
       places over different words, and setting the second one is putting the
       same four chords down again by hand, in the same order, over syllables
       that are nearly but not quite where the first line had them.

       So the chords of the marked lines can be taken and laid on other marked
       lines. Line for line: the first copied onto the first marked, the second
       onto the second. One line copied goes onto as many as are marked, which
       is the same rule with nothing to line up. Any other pair of numbers is
       refused rather than guessed at, because a wrong guess here is chords
       silently landing on the wrong words.

       THE POSITIONS COME ACROSS UNCHANGED and the line is padded if it is
       short. A chord names a character, so a chord on character twelve of a
       line ten characters long needs two more characters to exist, exactly as
       it would if it had been dragged there. */
    var lifted = null;

    function chordLines() {
      return song.lines.filter(function (line) {
        return isMarked(line) && line.type !== "section";
      });
    }

    function liftChords() {
      var from = chordLines();
      if (!from.length) return toast("צריך לסמן שורה של מילים", true);

      lifted = from.map(function (line) {
        return line.chords.map(function (c) { return { pos: c.pos, chord: c.chord }; });
      });

      /* AND THE MARKS GO. What follows a copy is always marking the lines to
         put them on, and every one of those ticks had to be preceded by
         unticking a line that was only ever the source. The copy is held; the
         marking is free to be about where it is going. */
      clearMarks();
      toast(lifted.length === 1 ? "האקורדים של השורה הועתקו" : "האקורדים של " + lifted.length + " שורות הועתקו");
    }

    function dropChords() {
      if (!lifted) return;
      var into = chordLines();
      if (!into.length) return toast("צריך לסמן שורה של מילים", true);

      if (lifted.length !== 1 && lifted.length !== into.length) {
        return toast("הועתקו " + lifted.length + " שורות ומסומנות " + into.length + ". צריך אותו מספר.", true);
      }

      into.forEach(function (line, index) {
        var from = lifted.length === 1 ? lifted[0] : lifted[index];
        line.chords = from.map(function (c) { return { pos: c.pos, chord: c.chord }; });
        line.chords.forEach(function (c) { padTo(line, c.pos); });
        trimPadding(line);
      });

      /* Done, so the marking is done: what is left on the page after a paste
         is a set of lines that have already had the thing done to them, and
         the next pair of lines starts from nothing marked. The copy stays
         held, so the same chords can go onto another verse straight after. */
      marked.length = 0;

      draw();
      mark();
    }

    /* There was a grip beside every line that dragged it up and down the song.
       It is gone, and what replaced it is the block above: marking a line and
       pressing an arrow does everything the drag did, one line at a time or
       four together, and it does it without a pointer held steady over a
       moving page. Two ways to reorder a song is one more than a song needs,
       and the one that stayed is the one that can move a verse. */
    function rowsOf() {
      return Array.prototype.slice.call(sheet.querySelectorAll(".ln"));
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
          grab = (chord.pos + 0.5) - posFromX(ln, event.clientX);
        }

        /* The hand moves in pixels, the song moves in characters. The chord is
           DRAWN wherever the hand is, so the drag is smooth, and RECORDED on
           the character its middle is over, so what is stored still names a
           letter. `raw` is that middle in character coordinates, so the
           character carrying it is the one it falls INSIDE: floor, not round.
           The only visible cost is half a character of settling on release. */
        var raw = Math.max(0, posFromX(ln, event.clientX) + grab);
        var pos = Math.max(0, Math.floor(raw));
        var previous = chord.pos;

        /* A chord that has been pulled past the last word: the LINE grows to
           meet it, in spaces, so it still names a character of its own line. */
        if (padTo(line, pos)) {
          fillSpans(ln.querySelector(".ln-t"), line.text);
        }

        placeChord(ln, node, positionOf(metrics(ln), raw));
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
          if (twin) { twin.dataset.pos = crossed.pos; placeChord(ln, twin); }
        }
      });

      node.addEventListener("pointerup", function (event) {
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        node.classList.remove("is-dragging");
        if (!dragging) return openPicker(node, ln, line, chord);

        /* let go: the chord settles onto its character, and any spaces the drag
           called for and no longer needs go back */
        if (trimPadding(line)) fillSpans(ln.querySelector(".ln-t"), line.text);
        layoutLine(ln);
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
        layoutLine(ln);
        mark();
      }

      /* `name` is the song's own, never the transposed one */
      function finish(name) {
        var value = String(name || "").trim().slice(0, 16);
        if (!value || !isChord(value)) return drop();
        chord.chord = value;
        node.textContent = transposeChord(value, semis);
        layoutLine(ln);
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

      /* Two rows, and which is which is the whole of it. On top, the chords
         this song already uses, always, however full the field is: a chord
         being changed is nearly always being changed to another one the song
         already plays, and that answer should never have to be typed for.
         Under it, everything the letters so far could still become. */
      var found = el("div", "picker-found");
      var mine = el("div", "picker-row");
      var more = el("div", "picker-row picker-more");
      found.appendChild(mine);
      found.appendChild(more);
      picker.appendChild(found);

      /* only when there is something to remove: a chord being put down for the
         first time has no name yet, so an × would be offering to delete a
         choice that has not been made */
      if (chord.chord) chip("picker-x", "×", "הסרת האקורד", function () { commit(""); });

      /* What the letters so far could still become. Empty answers with nothing,
         which is not a gap: the row above it is already full of the song's own
         chords, and that is what an untouched picker is for.

         Each offer carries the name twice, because the two are not the same
         string on a transposed song: `name` is the chord in the song's own key,
         which is what gets kept, and `shown` is the one on screen. */
      function offers(value) {
        return suggestChords(value).slice(0, 18).map(function (shown) {
          return { name: untranspose(shown), shown: shown };
        });
      }

      function fill(row, list, value) {
        row.textContent = "";
        list.forEach(function (one) {
          var on = value ? one.shown === value : one.name === chord.chord;
          var hit = el("button", "picker-chip" + (on ? " is-on" : ""), one.shown);
          hit.type = "button";
          hit.addEventListener("click", function () { commit(one.name); });
          row.appendChild(hit);
        });
      }

      /* What Enter takes when the field holds half a chord. Kept here rather
         than read back off the first button, because the first button on
         screen belongs to the song's own row, which is not filtered by what is
         being typed and would answer with a chord nobody was reaching for. */
      var best = null;

      /* Not a chord is still not a chord: the field says so, refuses to close on
         it, and a way out that is not Enter drops it rather than writing "W"
         into the song. */
      function refresh() {
        var value = field.value.trim();
        field.classList.toggle("is-bad", !!value && !isChord(value));

        var own = chordsInSong();
        var taken = {};
        own.forEach(function (one) { taken[one.shown] = true; });

        var matches = offers(value);
        best = matches[0] || null;

        fill(mine, own, value);
        /* A chord the song already has is on the row above. Twice in one
           popup is the same chord twice, not two answers. */
        fill(more, matches.filter(function (one) { return !taken[one.shown]; }), value);
        place();
      }

      field.addEventListener("input", refresh);
      field.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (field.value.trim() && !isChord(field.value)) {
          /* half a chord with a list under it: Enter takes the first of them */
          if (best) return commit(best.name);
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
    /* --- saving, which happens by itself --------------------------------------
       NO SAVE BUTTON. A song is written a word at a time and there is nothing
       to review before a word counts, so a change writes itself: the typing
       stops, and a second later the song is in the database as a draft. What
       used to be a button is now the quiet word beside the tools, which says
       where the writing got to.

       PUBLISHING IS THE SAME WRITE with one more thing said in it. "Finished,
       and let people have it" is one sentence, so it is one press, and after
       it there is nothing left to decide and so nothing left to press.

       A song with no name yet cannot be written at all: its address is made
       from its name. So it waits, and says so, and the first thing anybody
       does on a new song is name it. */
    var saveTimer = null, inFlight = false, again = false;

    function note(text, bad) {
      if (!stateNode) return;
      stateNode.textContent = text;
      stateNode.className = "save-state" + (bad ? " is-bad" : "");
    }

    function queueSave(now) {
      if (!editing) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(commit, now ? 0 : 900);
      note("לא נשמר");
    }

    /* Whatever is still on the clock, now. Registered as the flush that any
       navigation and any hidden tab runs, so the last change lands rather than
       the one before it. */
    function flush() {
      if (saveTimer === null) return;
      clearTimeout(saveTimer);
      commit();
    }

    function commit() {
      saveTimer = null;
      /* one write at a time, and one more after it if anything moved while it
         was in the air: two PATCHes racing on one row can land in either
         order, and the loser would be the newer song */
      if (inFlight) { again = true; return; }

      var name = String(song.title || "").trim();
      if (!name) return note("צריך שם לשיר", true);

      var payload = {
        title: name,
        styles: styles(song),
      };
      CREDITS.forEach(function (c) { payload[c.field] = String(song[c.field] || "").trim(); });

      /* THE WORDS ARE NOT MENTIONED WHILE THEY ARE BEING WRITTEN. A song still
         in the machine is being filled in from the other end, and this page
         holds an empty copy of it: naming the column at all would land that
         empty copy on top of the reading, and the state would say ready over a
         song that is still coming. Its name, its credits and its kinds are not
         what the Worker writes, so those go out as usual. */
      if (!coming) {
        /* the song's direction is its first line's: the sheet is laid out in
           it, and a line that does not say otherwise inherits it */
        payload.dir = songDir(song.lines);
        payload.lines = songToText(song.lines);
        payload.draft = !!song.draft;
        payload.published = !!song.published;
        payload.review = !!song.review;
        /* typing a song by hand is what makes a failed read stop being failed.
           A column that is not in the table yet is dropped by `shed` on the way
           out, so naming it here is safe. */
        payload.status = "ready";
        payload.status_note = "";
      }

      var going = snapshot();
      inFlight = true;
      note("שומר");
      attempt(song.id && song.slug ? song.slug : slugify(name), 1);

      function attempt(slug, tries) {
        payload.slug = slug;
        var request = song.id ? db.update(song.id, payload) : db.insert(payload);
        request.then(function (row) {
          inFlight = false;
          /* A song typed from nothing kept its draft under "new", and it is
             about to have an id of its own. Take the old one out by hand:
             mark() below can only clear the key the song has now. */
          var wasKey = draftKey();
          song.id = row.id;
          song.slug = row.slug;
          /* what went out is what is now in the database, and anything typed
             while it was in the air is still ahead of it */
          saved = going;
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
            note("נשמר בלי " + lost.map(function (c) { return c.label; }).join(" ו"), true);
          } else {
            note(current === saved ? "נשמר" : "לא נשמר");
          }

          if (again) { again = false; queueSave(true); }
        }).catch(function (error) {
          /* 23505 is the unique index on slug: two songs with the same name */
          if (error.code === "23505" && tries < 30) return attempt(slugify(name) + "_" + (tries + 1), tries + 1);
          inFlight = false;
          again = false;
          note(error.status === 401 || error.status === 403 ? "אין הרשאה" : "לא נשמר", true);
          toast(error.status === 401 || error.status === 403
            ? "אין הרשאה. נסו להתחבר שוב."
            : "השמירה נכשלה: " + error.message, true);
        });
      }
    }

    /* It asks, and it no longer says "לצמיתות", because it is not: the song
       keeps its words and its chords and goes to the deleted list, and the
       question says so rather than making a promise the app does not keep. */
    function removeSong() {
      if (!window.confirm('למחוק את "' + song.title + '"?\n\nהשיר יעבור לשירים שנמחקו ואפשר יהיה לשחזר אותו.')) return;
      db.remove(song.id).then(function () {
        toast("השיר נמחק. אפשר לשחזר מתוך שירים שנמחקו.");
        go(BASE + "/");
      }).catch(function (error) {
        toast("המחיקה נכשלה: " + error.message, true);
      });
    }

    /* through setSemis, not straight to draw: the counter is written there and
       nowhere else, so starting any other way leaves it reading 0 over a song
       that is being shown seven frets down */
    setSemis(semis);
    relayoutOn(sheet, editing ? null : draw);

    /* last, once the page is whole, because taking a draft back means writing
       into the title, the credits and every line of the sheet, and all of them
       have to exist first. Only where they can be written into at all: a phone
       or a signed-out reader is looking at the saved song, and should be told
       the truth about it. */
    /* Looking again while it is still coming, and only while the page is on
       screen: the sheet is what the reading lands in, and when it does the
       page opens again as the song. */
    if (coming) {
      setTimeout(function () {
        if (sheet.isConnected) viewSong(song.slug);
      }, 5000);
    }

    if (editing && !coming) takeDraft();
    if (editing) {
      note(current === saved ? "נשמר" : "לא נשמר");
      /* whatever is still on the clock when this page is left */
      flushPending = flush;
    }
    if (editing && !song.id) title.focus();
  }

  function viewLine(line, semis) {
    if (line.type === "section") {
      var s = el("div", "ln is-section");
      s.dir = dirOf(line);
      s.appendChild(el("div", "ln-section", line.text));
      return s;
    }
    var ln = el("div", "ln" + (line.text.trim() || line.chords.length ? "" : " is-blank"));
    /* Said on the row, which is both how the browser lays the words out and
       where every measurement asks (see rowRtl). One answer, one place. */
    ln.dir = dirOf(line);
    var lane = el("div", "ln-c");
    line.chords.forEach(function (c) { lane.appendChild(chordEl(c.chord, c.pos, semis)); });
    ln.appendChild(lane);
    ln.appendChild(textSpans(line.text));
    return ln;
  }

  /* Fonts arrive after the first paint and a window resize changes every
     offset, so both re-measure. Nothing is re-rendered, only re-placed.

     Except where the width is what changed and the lines are broken to it:
     there the rows themselves are wrong, not only the chords on them, so the
     caller hands in a redraw and it is used instead. Only when the width
     actually moved, because a phone fires resize for its own address bar
     sliding away, and redrawing the sheet under a reader's thumb for that is
     the page flinching at nothing. */
  function relayoutOn(root, redraw) {
    var run = function () { layoutAll(root); };
    var width = root.clientWidth;

    /* The font the words were broken with has to be the font they are read in,
       so a font arriving late breaks them again rather than only nudging the
       chords. */
    var rewrap = function () {
      if (!redraw || !NARROW.matches) return run();
      width = root.clientWidth;
      redraw();
    };

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rewrap);
    var onResize = function () {
      if (!root.isConnected) return window.removeEventListener("resize", onResize);
      if (redraw && NARROW.matches && root.clientWidth !== width) return rewrap();
      run();
    };
    window.addEventListener("resize", onResize);
  }

  /* A song that is still being read, or that failed. It is a real row with a
     real address, so it gets a real page rather than being hidden from the one
     person who is waiting for it. While it reads, the page looks again by
     itself; when the Worker finishes, this becomes the song. */
  /* There was a waiting page here: a spinner and a clock, for a song that was
     still in the machine. It is gone, and the song's own page does that job
     now, with everything about the song that is not its words already
     editable while the reading runs. A page whose only content is "not yet"
     is a page that has to be left before anything can be done. */

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

  /* --- an evening of singing -----------------------------------------------
     A name, a date, and songs in the order they will be sung.

     The library answers "which songs are there". This answers the question
     that comes next and that nothing else here answers: what are we playing
     tonight, and in what order. So it is a list of the library's own rows
     rather than a copy of them, and every row is one tap from the song it
     names, because the whole reason to write the list down is to play from it.
     --------------------------------------------------------------------- */

  /* "2026-08-06" as a person says it. Split by hand rather than handed to
     Date, because a bare date string is parsed as midnight UTC and a browser
     west of Greenwich would name the day before. */
  function dateWords(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!m) return "";
    var day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    try {
      return day.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return m[3] + "." + m[2] + "." + m[1];
    }
  }

  function todayISO() {
    var now = new Date();
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate());
  }

  /* When and where, as one line, with whichever of the two has been filled in.
     Two facts about the same evening that are always read together and never
     mean much apart. */
  function whenWhere(evening) {
    var said = [];
    var when = dateWords(evening.event_date);
    if (when) said.push(when);
    var where = String(evening.venue || "").trim();
    if (where) said.push(where);
    return said.join("  •  ");
  }

  /* Whatever is in the column, as a list of {id, title}. Anything without an
     id names no song, so it is not one. */
  function normalizeSet(value) {
    var raw = value;
    if (typeof raw === "string") {
      try { raw = JSON.parse(raw); } catch (e) { raw = []; }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map(function (item) {
      return item && item.id ? { id: String(item.id), title: String(item.title || "") } : null;
    }).filter(Boolean);
  }

  function newEvening() {
    requireAuth(function () { go(BASE + "/evenings/new"); });
  }

  /* The table is created by schema.sql, and deploying this file does not run
     it. Say which one sentence fixes it rather than showing the raw complaint
     of a database nobody here is looking at. */
  function needSchema() {
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, "טבלת הערבים עוד לא קיימת. צריך להריץ פעם אחת את schema.sql ב-Supabase."));
    box.appendChild(button("לרשימת השירים", null, "ghost", function () { go(BASE + "/"); }));
    app.appendChild(box);
  }

  function noEvening() {
    document.title = "לא נמצא | אקורדים";
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, "הערב הזה לא נמצא. אולי הוא נמחק, ואולי הוא של חשבון אחר."));
    box.appendChild(button("לרשימת הערבים", null, "ghost", function () { go(BASE + "/evenings"); }));
    app.appendChild(box);
  }

  /* An evening belongs to the account that made it, so without one there is
     nothing here to show and no honest way to pretend otherwise. Said as a
     page rather than as a dialog over an empty screen: a dialog that is closed
     leaves nothing behind, and "there are no evenings" is a different sentence
     from "you are not signed in". */
  function needSignIn() {
    document.title = "ערבי שירה | אקורדים";
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, "ערבי השירה שייכים לחשבון. כל אחד רואה, מתכנן ומוחק רק את שלו."));
    var actions = el("div", "row-actions");
    actions.appendChild(googleButton("התחברות עם גוגל"));
    actions.appendChild(button("לרשימת השירים", null, "ghost", function () { go(BASE + "/"); }));
    box.appendChild(actions);
    app.appendChild(box);
  }

  /* The next evening first, then the one after it, and the ones that already
     happened underneath in the order they happened. Which is what a list of
     evenings is for: the one being planned is almost always the nearest one
     that has not happened yet, and it should not have to be looked for. */
  function byWhen(evenings) {
    var now = todayISO();
    return evenings.slice().sort(function (a, b) {
      var da = a.event_date || "", db_ = b.event_date || "";
      /* undated last: it is a sketch, not a plan */
      if (!da !== !db_) return da ? -1 : 1;
      if (!da) return String(b.updated_at || "") < String(a.updated_at || "") ? -1 : 1;
      var ahead = da >= now, bhead = db_ >= now;
      if (ahead !== bhead) return ahead ? -1 : 1;
      if (da === db_) return 0;
      return ahead ? (da < db_ ? -1 : 1) : (da > db_ ? -1 : 1);
    });
  }

  /* What is in the evening, by name, in the order it will be sung.

     The name the song has NOW, read out of the library, with the one it was
     called when it went in as the fallback: a song that has since been
     renamed is the same song, and a song that has since been deleted is still
     worth naming. */
  function songNames(evening, titles) {
    return normalizeSet(evening.songs).map(function (item) {
      return titles[item.id] || item.title || "";
    }).filter(Boolean);
  }

  function viewEvenings() {
    document.title = "ערבי שירה | אקורדים";
    setBusy("טוען ערבים");

    /* The names come along, because they are what the list shows and what the
       search box searches. Only the names: an evening's line does not draw
       chords, so it has no use for the rest of a song. */
    Promise.all([sets.list(), db.titles()]).then(function (both) {
      app.innerHTML = "";
      var evenings = byWhen(both[0] || []);
      var titles = both[1] || {};

      if (!evenings.length) {
        var empty = el("div", "center");
        empty.appendChild(el("p", null, "עוד לא תוכנן כאן ערב. ערב הוא שם, תאריך, מיקום ורשימת שירים לפי הסדר."));
        var actions = el("div", "row-actions");
        actions.appendChild(button("ערב חדש", ICON.plus, null, newEvening));
        empty.appendChild(actions);
        app.appendChild(empty);
        return;
      }

      /* One box for both questions somebody arrives with: which evening was
         that, and where did we play this song. So it searches the name, the
         place, the date in words and every song in the evening, because all
         four are things a person remembers an evening by and none of them is
         the one they always remember. */
      var search = el("div", "search");
      search.appendChild(svg(ICON.search));
      var input = el("input");
      input.type = "search";
      input.placeholder = "חיפוש לפי שם ערב, מיקום או שיר";
      input.setAttribute("aria-label", "חיפוש ערב");
      search.appendChild(input);
      app.appendChild(search);

      var list = el("ul", "list");
      app.appendChild(list);

      var none = el("p", "center", "לא נמצא ערב שמתאים לחיפוש.");
      none.hidden = true;
      app.appendChild(none);

      function haystack(evening) {
        return [
          evening.title || "",
          evening.venue || "",
          dateWords(evening.event_date),
          songNames(evening, titles).join(" "),
        ].join(" ").toLowerCase();
      }

      function paint(filter) {
        var q = String(filter || "").trim().toLowerCase();
        list.innerHTML = "";

        var shown = q ? evenings.filter(function (e) { return haystack(e).indexOf(q) >= 0; }) : evenings;
        none.hidden = shown.length > 0;

        shown.forEach(function (evening) {
          var li = el("li");
          var a = el("a");
          a.href = BASE + "/evenings/" + evening.id;
          a.addEventListener("click", function (event) {
            event.preventDefault();
            go(a.getAttribute("href"));
          });

          var box = el("div");
          var top = el("div", "t-row");
          top.appendChild(el("div", "t", evening.title || "ערב בלי שם"));
          var said = whenWhere(evening);
          if (said) top.appendChild(el("div", "by", said));
          box.appendChild(top);

          /* The songs themselves rather than how many of them there are. The
             count is a number you have to open the evening to make any use
             of; the names are the evening. */
          var names = songNames(evening, titles);
          box.appendChild(el("div", "a names", names.length ? names.join("  •  ") : "עוד בלי שירים"));

          a.appendChild(box);
          li.appendChild(a);
          list.appendChild(li);
        });
      }

      input.addEventListener("input", function () { paint(input.value); });
      paint("");
    }).catch(function (error) {
      if (missingTable(error)) return needSchema();
      fail(error);
    });
  }

  function viewEvening(id) {
    setBusy(id === null ? "טוען את המאגר" : "טוען את הערב");

    var blank = { id: null, title: "", event_date: todayISO(), songs: [] };

    /* The library comes along every time, because every row of an evening is
       drawn from it: the name a song has NOW, who wrote it, and which chords
       it needs. An evening that stored those itself would go stale the first
       time a song was corrected. */
    Promise.all([
      id === null ? Promise.resolve(blank) : sets.byId(id),
      db.list(),
    ]).then(function (both) {
      if (!both[0]) return noEvening();
      var evening = both[0];
      evening.songs = normalizeSet(evening.songs);
      renderEvening(evening, both[1] || []);
    }).catch(function (error) {
      if (missingTable(error)) return needSchema();
      /* 22P02: the address is not a uuid at all, so it names nothing */
      if (String(error.code) === "22P02") return noEvening();
      fail(error);
    });
  }

  function renderEvening(evening, library) {
    document.title = (evening.title || "ערב חדש") + " | אקורדים";

    /* Everything here can be changed, and there is no other state for this
       page to be in: an evening is its account's, so whoever is looking at one
       is the person whose it is. That is the difference from the song page,
       which is a library everybody reads and a few people write.

       Unlike the song editor it is also not shut on a phone. Every gesture it
       has is a whole row wide, which a finger can do, and an evening gets
       planned wherever the person planning it happens to be standing. */

    var byId = {};
    library.forEach(function (song) { byId[song.id] = song; });

    /* The shelf below is ordered by name, and the index next door is ordered
       by when a song last changed. Two lists of the same songs and two orders,
       because they answer different questions: the index is asked "what have I
       been working on", and a shelf is asked for a song by name. */
    library = library.slice().sort(function (a, b) {
      return String(a.title || "").localeCompare(String(b.title || ""), "he");
    });

    app.innerHTML = "";

    /* --- the head: the name, the date ---

       Like the song page, no arrow back: the app's name in the bar goes home,
       and the evenings are one press from there. */

    var head = el("div", "song-head");

    var title = el("h1", "ev-title", evening.title);
    title.dataset.empty = "שם הערב";
    makeEditable(title);
    title.addEventListener("input", function () {
      evening.title = title.textContent.trim();
      document.title = (evening.title || "ערב חדש") + " | אקורדים";
      mark();
    });
    title.addEventListener("keydown", function (event) {
      /* one line, so Enter is not a newline here, it is done */
      if (event.key === "Enter") { event.preventDefault(); title.blur(); }
    });
    head.appendChild(title);

    /* When and where, twice, and only ever one of the two visible: the fields
       that set them on the screen, and the sentence they make on paper. A date
       input prints as an empty-looking box with a calendar icon in it, which
       is the one thing an evening's printout must not be vague about. */
    var whenWords = el("div", "by ev-when on-paper", whenWhere(evening));

    var meta = el("div", "ev-meta");

    var whenLabel = el("label", null, "תאריך");
    var when = el("input");
    when.type = "date";
    when.value = evening.event_date || "";
    when.addEventListener("change", function () {
      evening.event_date = when.value || null;
      whenWords.textContent = whenWhere(evening);
      mark(true);
    });
    whenLabel.appendChild(when);
    meta.appendChild(whenLabel);

    var whereLabel = el("label", null, "מיקום");
    var where = el("input");
    where.type = "text";
    where.value = evening.venue || "";
    where.placeholder = "איפה זה קורה";
    where.addEventListener("input", function () {
      evening.venue = where.value;
      whenWords.textContent = whenWhere(evening);
      mark();
    });
    whereLabel.appendChild(where);
    meta.appendChild(whereLabel);

    head.appendChild(meta);
    head.appendChild(whenWords);

    app.appendChild(head);

    /* --- where the writing got to --------------------------------------------
       All that is left of a toolbar. Printing and deleting are in the top bar,
       where the actions about the page you are on live; how many songs are in
       the evening is what the list itself says, in numbers down its side, and
       saying it again in words over it was the same fact twice.

       This one word cannot move up there: it is not an action, it is an
       answer, and it belongs beside the thing it is answering about. */
    var stateNode = el("span", "save-state ev-state");
    app.appendChild(stateNode);

    /* the two things worth doing to a whole evening, in the bar */
    state.printer = function () { window.print(); };
    state.killer = removeEvening;
    paintHeader();

    /* --- the songs, in order --- */

    /* An ol, so the numbers are the browser's own counter. Which matters: a
       drag moves one element and never redraws the list, so a number written
       into each row by hand would have to be rewritten by hand too. */
    var listEl = el("ol", "set");
    app.appendChild(listEl);

    var emptyNote = el("p", "hint", "אין עדיין שירים בערב. אפשר להוסיף מהמאגר שלמטה, ואחר כך לגרור בידית כדי לסדר.");
    app.appendChild(emptyNote);

    /* --- the library, to add from ---
       The songs are everybody's and the evening is one account's, which is
       exactly why this panel is here: the evening is a choice out of a shelf
       that is not itself private. */

    var pool = el("div", "pool card");
    pool.appendChild(el("h2", null, "מהמאגר"));
    pool.appendChild(el("p", "muted", "לחיצה על שיר מוסיפה אותו לערב, לחיצה נוספת מוציאה אותו."));

    var field = el("div", "search");
    field.appendChild(svg(ICON.search));
    var poolInput = el("input");
    poolInput.type = "search";
    poolInput.placeholder = "חיפוש לפי שם, מילים או לחן";
    poolInput.setAttribute("aria-label", "חיפוש שיר להוספה");
    poolInput.addEventListener("input", function () { paintPool(); });
    field.appendChild(poolInput);
    pool.appendChild(field);

    var poolList = el("ul", "pool-list");
    pool.appendChild(poolList);
    app.appendChild(pool);

    /* --- drawing ------------------------------------------------------------ */

    function draw() {
      listEl.innerHTML = "";
      evening.songs.forEach(function (item) { listEl.appendChild(setRow(item)); });
      emptyNote.hidden = evening.songs.length > 0;
    }

    function setRow(item) {
      var song = byId[item.id];
      var li = el("li", "set-row" + (song ? "" : " is-gone"));

      var grip = el("button", "set-grip");
      grip.type = "button";
      grip.title = "גרירה כדי לשנות את הסדר";
      grip.setAttribute("aria-label", "הזזת " + (song ? song.title : item.title) + " ברשימה");
      grip.appendChild(svg(ICON.grip));
      /* nothing is bound to it: the list listens for all of them, see below */
      li.appendChild(grip);

      var box = el("div", "set-main");
      var top = el("div", "t-row");

      if (song) {
        /* One tap to the song itself, which is the point of writing the
           evening down in the first place. */
        var a = el("a", "set-t", song.title);
        a.href = BASE + "/" + encodeURIComponent(song.slug);
        a.addEventListener("click", function (event) {
          event.preventDefault();
          go(a.getAttribute("href"));
        });
        top.appendChild(a);
        var by = credits(song);
        if (by.length) {
          top.appendChild(el("div", "by", by.map(function (c) { return c.name; }).join(", ")));
        }
      } else {
        /* The song was deleted from the library after it was put in the
           evening. Saying which one is gone is the only useful thing left to
           say, and a silently shorter list is the one answer that is worse. */
        top.appendChild(el("span", "set-t", item.title || "שיר"));
        top.appendChild(el("div", "by", "כבר לא במאגר"));
      }
      box.appendChild(top);

      /* Where the capo goes and which shapes come out of it, the same way the
         index says it. On an evening it is worth more than on the index: this
         is the list somebody is holding a guitar over. */
      if (song) {
        var used = chordsUsed(song.lines);
        if (used.length) {
          var easy = easyVersion(used);
          var keys = el("div", "keys");
          keys.title = "השיר עצמו: " + used.join("  ");
          if (easy.capo) keys.appendChild(el("span", "capo", "קפו " + easy.capo));
          easy.shapes.forEach(function (shape) { keys.appendChild(el("span", "k", shape)); });
          box.appendChild(keys);
        }
      }

      li.appendChild(box);

      var out = iconBtn(ICON.trash, "הוצאה מהערב", function () {
        var at = evening.songs.indexOf(item);
        if (at < 0) return;
        evening.songs.splice(at, 1);
        draw();
        paintPool();
        mark(true);
      });
      out.classList.add("quiet");
      li.appendChild(out);

      return li;
    }

    /* --- moving a song up and down -------------------------------------------
       The row's own element travels and the list travels with it, and NOTHING
       IS REDRAWN while it does: a redraw would destroy the element the finger
       is holding and end the drag on its first movement. So the node moves,
       the array is spliced to match, and the two stay in step because a song
       and a row are one to one and always in the same order.

       Which is the same thing the song editor does to its lines, for the same
       reason. */
    function rowsOf() {
      return Array.prototype.slice.call(listEl.children);
    }

    function moveRow(li, to) {
      var rows = rowsOf();
      var from = rows.indexOf(li);
      if (from < 0 || to === from || to < 0 || to >= rows.length) return false;
      evening.songs.splice(to, 0, evening.songs.splice(from, 1)[0]);
      if (to > from) listEl.insertBefore(li, rows[to].nextSibling);
      else listEl.insertBefore(li, rows[to]);
      return true;
    }

    /* THE POINTER IS HELD BY THE LIST, NOT BY THE GRIP, and that is the whole
       of making this work.

       Moving a row means insertBefore, which takes the row out of the document
       for an instant, and an element that leaves the document loses the
       pointer with it. A grip holding its own pointer therefore lets go the
       first time it succeeds at anything, and the rest of the drag, including
       the release that would have saved it, lands somewhere else.

       The list never moves. So it holds the pointer, and it listens: one
       handler for every row there will ever be, which also means a redrawn
       list does not have to be rewired. */
    var dragging = null, dragged = false;

    function gripOf(node) {
      return node && node.closest ? node.closest(".set-grip") : null;
    }

    listEl.addEventListener("pointerdown", function (event) {
      var grip = gripOf(event.target);
      if (!grip) return;
      event.preventDefault();
      dragging = grip.parentNode;
      dragged = false;
      grip.classList.add("is-held");
      dragging.classList.add("is-moving");
      listEl.setPointerCapture(event.pointerId);
    });

    listEl.addEventListener("pointermove", function (event) {
      if (!dragging) return;

      var rows = rowsOf();
      var from = rows.indexOf(dragging);
      if (from < 0) return;

      /* Where the pointer is, said in rows. Going up it is the first row above
         whose middle has been passed, going down the last one below. Midpoints
         rather than edges, so a row swaps when the pointer is properly over it
         and not the moment it grazes its border. */
      var to = from;
      for (var i = 0; i < rows.length; i++) {
        if (i === from) continue;
        var box = rows[i].getBoundingClientRect();
        var middle = box.top + box.height / 2;
        if (i < from && event.clientY < middle) { to = i; break; }
        if (i > from && event.clientY > middle) to = i;
      }
      if (moveRow(dragging, to)) dragged = true;
    });

    function endDrag(event) {
      if (!dragging) return;
      if (event && listEl.hasPointerCapture(event.pointerId)) listEl.releasePointerCapture(event.pointerId);
      var grip = dragging.querySelector(".set-grip");
      if (grip) grip.classList.remove("is-held");
      dragging.classList.remove("is-moving");
      dragging = null;
      if (dragged) mark(true);
    }

    listEl.addEventListener("pointerup", endDrag);
    listEl.addEventListener("pointercancel", endDrag);

    /* The same move for a keyboard, and for anyone who cannot hold a pointer
       steady over a list that is rearranging itself under it. */
    listEl.addEventListener("keydown", function (event) {
      var grip = gripOf(event.target);
      if (!grip) return;
      var step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (!step) return;
      event.preventDefault();
      var li = grip.parentNode;
      if (moveRow(li, rowsOf().indexOf(li) + step)) {
        grip.focus();
        mark(true);
      }
    });

    /* --- adding and taking out ---------------------------------------------- */

    function paintPool() {
      var q = String(poolInput.value || "").trim().toLowerCase();
      var inside = {};
      evening.songs.forEach(function (item) { inside[item.id] = true; });

      var shown = library.filter(function (song) {
        /* a song still being read has no words yet, so it cannot be sung from */
        if (song.status && song.status !== "ready") return false;
        if (!q) return true;
        var hay = song.title + " " + credits(song).map(function (c) { return c.name; }).join(" ");
        return hay.toLowerCase().indexOf(q) >= 0;
      });

      /* rebuilt in place, so the box does not jump back to the top every time
         a song is added from halfway down it */
      var was = poolList.scrollTop;
      poolList.innerHTML = "";

      if (!shown.length) {
        poolList.appendChild(el("li", "pool-none", q ? "לא נמצא שיר שמתאים לחיפוש." : "המאגר עוד ריק."));
        return;
      }

      shown.forEach(function (song) {
        var li = el("li");
        var b = el("button", "pool-row" + (inside[song.id] ? " is-in" : ""));
        b.type = "button";
        b.appendChild(el("span", "pool-t", song.title));
        var by = credits(song);
        if (by.length) b.appendChild(el("span", "by", by.map(function (c) { return c.name; }).join(", ")));
        b.appendChild(el("span", "grow"));
        b.appendChild(el("span", "pool-mark", inside[song.id] ? "בערב" : "הוספה"));
        b.addEventListener("click", function () { toggle(song); });
        li.appendChild(b);
        poolList.appendChild(li);
      });

      poolList.scrollTop = was;
    }

    /* One list, one click, both ways. A song is in the evening or it is not,
       and the same row says which and changes it: adding from one place and
       removing from another would be two answers to one question.

       So the same song twice is not offered. An evening that really wants an
       encore of something can say so in its name. */
    function toggle(song) {
      var at = -1;
      evening.songs.forEach(function (item, i) { if (item.id === song.id) at = i; });
      if (at >= 0) evening.songs.splice(at, 1);
      else evening.songs.push({ id: song.id, title: song.title });
      draw();
      paintPool();
      mark(true);
    }

    /* --- saving --------------------------------------------------------------
       NO SAVE BUTTON. Every change on this page is a finished gesture: a song
       tapped in, a row dragged, a date picked. There is nothing to review
       before it counts, and a button would only be a second click asking
       whether the first one was meant.

       So a change writes itself, and the word beside the tools says where it
       got to. A structural change goes at once, because a tap is over the
       moment it happens; a name being typed waits for the typing to stop. */
    var timer = null, inFlight = false, again = false;

    function note(text, bad) {
      stateNode.textContent = text;
      stateNode.className = "save-state" + (bad ? " is-bad" : "");
    }

    function mark(now) {
      note("לא נשמר");
      clearTimeout(timer);
      timer = setTimeout(commit, now ? 0 : 900);
    }

    /* Whatever is still on the clock, now. Registered below as the flush that
       any navigation and any hidden tab runs, so the last change lands rather
       than the one before it. */
    function flush() {
      if (timer === null) return;
      clearTimeout(timer);
      commit();
    }

    function commit() {
      timer = null;
      /* one write at a time, and one more after it if anything moved while it
         was in the air: two PATCHes racing on one row can land in either
         order, and the loser would be the newer list */
      if (inFlight) { again = true; return; }

      inFlight = true;
      note("שומר");

      var payload = {
        title: String(evening.title || "").trim(),
        event_date: evening.event_date || null,
        venue: String(evening.venue || "").trim(),
        songs: evening.songs.map(function (item) {
          var song = byId[item.id];
          return { id: item.id, title: song ? song.title : item.title };
        }),
      };

      var request = evening.id ? sets.update(evening.id, payload) : sets.insert(payload);
      request.then(function (row) {
        inFlight = false;
        var born = !evening.id;
        evening.id = row.id;
        /* it exists now, so it has an address of its own, and a refresh from
           here comes back to it rather than to an empty new evening */
        if (born) history.replaceState(null, "", BASE + "/evenings/" + row.id);
        note("נשמר");
        if (again) { again = false; commit(); }
      }).catch(function (error) {
        inFlight = false;
        again = false;
        note("לא נשמר", true);
        toast(missingTable(error) ? "צריך להריץ פעם אחת את schema.sql ב-Supabase"
          : error.status === 401 || error.status === 403 ? "אין הרשאה. נסו להתחבר שוב."
          : "השמירה נכשלה: " + error.message, true);
      });
    }

    function removeEvening() {
      if (!window.confirm('למחוק את "' + (evening.title || "הערב הזה") + '" לצמיתות?')) return;
      clearTimeout(timer);
      timer = null;
      flushPending = null;
      if (!evening.id) return go(BASE + "/evenings");
      sets.remove(evening.id).then(function () {
        toast("הערב נמחק");
        go(BASE + "/evenings");
      }).catch(function (error) {
        toast("המחיקה נכשלה: " + error.message, true);
      });
    }

    draw();
    paintPool();
    flushPending = flush;
    if (!evening.id) title.focus();
  }

  /* --- reading a photo or a PDF -------------------------------------------- */

  var MAX_BYTES = 12 * 1024 * 1024;
  /* Several songs go up together, one per file, each its own reading. They
     travel in ONE request: the Worker brakes uploads rather than files, and a
     folder of sheets should be one action rather than nine refusals. */
  var MAX_SONGS = 10;
  /* The long edge the WRITING is sent at, once the margin has been cut off it,
     and it is measured rather than reasoned about. See the note over prepare().

     It used to be 1568, which is the ceiling above which the model resizes a
     picture itself, on the argument that pixels past that are paid for and
     thrown away. That argument was about the model and is now about nobody:
     the page goes to an OCR engine first, which has no such ceiling and reads
     what it is given. On the sheet this was measured against, sending the
     writing at 1568 scored 65 and sending it at 2700 scored 92.

     It costs nothing on the other side either, because the model still resizes
     to its own ceiling on arrival and is billed on what it resized to. So the
     bigger picture is free and the smaller one was expensive. */
  var MAX_EDGE = 2700;

  /* And upscaling is allowed, which it was not. A scan of a page is often
     smaller than this, and enlarging it adds no information; what it adds is
     pixels for a letter-finder to work with, and that turns out to be most of
     what it wanted. Capped, because past a point it is only weight. */
  var MAX_GROW = 3;
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

  /* --- COLOUR IS WHAT WAS HIDING THE CHORDS ---------------------------------

     Measured, on one real sheet, against a version of it corrected by hand:

         as it was sent before                 12 of 26 chords
         the same page in grey, not shrunk     24 of 26

     A chord sheet prints its symbols in pink. To a person that is helpful, it
     says at a glance which row is chords and which is words. To something
     looking for letters it is nearly a disaster: pink is a MIDTONE. Measured
     the way brightness is measured, #e11d63 comes out around 95 of 255, a
     middling grey on white paper, and two thirds of the symbols on the page
     were simply not seen. The words, printed in black, were read perfectly the
     whole time, which is exactly why nothing looked broken.

     So the colour comes out and the contrast goes up, and a symbol that was a
     midtone becomes ink. Nothing else about this changed and nothing else
     needed to: it is the difference between a reader that works and one that
     quietly loses most of a page.

     THE CONTRAST IS THE SETTING TO BE CAREFUL WITH. Too little and the pink
     stays grey; too much and the thin strokes of the Hebrew letters break up
     and the words go instead. 2.5 was the best of the ones tried and 2 was
     markedly worse, which is a narrower window than it looks.

     A PDF is passed through as it is, because it is already text. */
  var CONTRAST = 2.5;

  /* The colour taken out and the range pulled apart, in place. Kept as grey
     rather than pushed all the way to black and white: a hard threshold was
     tried and was much worse, because it eats the thin strokes of the small
     symbols along with the noise. */
  function grey(ctx, canvas) {
    var image;
    /* a picture from another origin taints the canvas and cannot be read back.
       Nothing to be done but send the colours as they are. */
    try { image = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) { return; }

    var p = image.data;
    for (var i = 0; i < p.length; i += 4) {
      var light = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      light = (light - 128) * CONTRAST + 128;
      p[i] = p[i + 1] = p[i + 2] = light < 0 ? 0 : light > 255 ? 255 : light;
    }
    ctx.putImageData(image, 0, 0);
  }

  function prepare(file) {
    if (file.type === "application/pdf") return toBase64(file);
    if (typeof createImageBitmap !== "function") return toBase64(file);

    return createImageBitmap(file).then(function (bitmap) {
      var box = inkBox(bitmap) || { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
      var scale = Math.min(MAX_GROW, MAX_EDGE / Math.max(box.w, box.h));

      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(box.w * scale));
      canvas.height = Math.max(1, Math.round(box.h * scale));
      var ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
      bitmap.close();

      grey(ctx, canvas);

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
    /* on a phone there is nothing to drag from, so the invitation is the one
       thing a phone can actually do: pick, which is the button underneath. */
    drop.appendChild(el("h3", null, NARROW.matches
      ? "בחרו צילומים של שירים"
      : "גררו לכאן צילומים של שירים"));
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
          /* rows made a second ago for a request that never landed: there is
             nothing here for anybody to want back */
          created.forEach(function (row) { db.purge(row.id).catch(function () {}); });
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

  /* A page that saves on its own leaves its flush here, and everything that
     can end a page runs it: a link, the back button, a tab that goes away. So
     what lands is the last change and not the one before it.

     A page that has no such thing leaves null, which is most of them: the song
     editor saves on a button and has nothing waiting on a clock. */
  var flushPending = null;

  function flushNow() {
    if (!flushPending) return;
    var flush = flushPending;
    flushPending = null;
    flush();
  }

  document.addEventListener("visibilitychange", function () {
    /* Hidden, not unloaded. A tab being closed is already too late for a
       request to leave; a tab being switched away from is exactly when a phone
       is about to be put in a pocket, and it still has time. */
    if (document.visibilityState === "hidden" && flushPending) flushPending();
  });

  function route() {
    window.scrollTo(0, 0);
    /* whatever the page being left still owed the database */
    flushNow();
    /* the header follows the address, because what it offers depends on it.
       Nothing is printable until a view says it is, and every address starts
       out as not that. */
    state.printable = false;
    state.printer = null;
    state.killer = null;
    state.editToggle = null;
    paintHeader();
    var p = parts();

    if (!p.length) { document.title = "אקורדים"; return viewIndex(); }

    /* --- the evenings ---
       /evenings          the list of them
       /evenings/new      one that does not exist yet
       /evenings/<id>     one that does

       All three need an account, and not only to write: an evening belongs to
       one, and the database hands back nothing at all without it. Checked
       here as well as there so the answer is a sentence rather than an empty
       list, which is what the same refusal looks like from the other side. */
    if (p[0] === "evenings") {
      if (!auth.in) return needSignIn();
      if (p[1] === "new") return viewEvening(null);
      if (p[1]) return viewEvening(p[1]);
      return viewEvenings();
    }

    /* What was deleted and is still there. An account's own, so it needs one. */
    if (p[0] === "deleted") return viewDeleted();

    /* A new song is the song page with nothing on it yet, and it needs somebody
       signed in to be worth opening at all. A phone used to be sent back to
       the library from here, because there was no editor on one; there is now,
       so a song can be started wherever somebody happens to be. */
    if (p[0] === "new") {
      /* Off to Google, and back to this same address with an account, which is
         where the song then opens. The page says where it has gone rather than
         sitting blank while the browser leaves. */
      if (!auth.in) {
        setBusy("מעבירים להתחברות");
        return auth.signInWithGoogle();
      }
      /* it opens IN the editor, since an empty song is nothing to read */
      state.editOnPhone = true;
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

  /* Back from Google, with the session in the fragment: `#access_token=…`, or
     `#error=…` if it went wrong or was waved off.

     THE FRAGMENT IS TAKEN OFF THE ADDRESS AT ONCE, and not only because this
     site keeps its addresses clean. An access token in the bar is a token in
     the history, in whatever the browser syncs, and in the next thing anybody
     copies out of that bar.

     What goes back in its place is the page they were on when they pressed
     the button. Signing in is not a place, and it should not be where you end
     up standing. */
  function absorbGoogle() {
    var hash = String(location.hash || "").replace(/^#/, "");
    if (!hash || hash.indexOf("=") < 0) return;

    var got = new URLSearchParams(hash);
    var token = got.get("access_token");
    var trouble = got.get("error_description") || got.get("error");
    if (!token && !trouble) return;

    var back = null;
    try {
      back = localStorage.getItem(RETURN_KEY);
      localStorage.removeItem(RETURN_KEY);
    } catch (e) { /* private window */ }

    if (token) {
      auth.save({
        access_token: token,
        refresh_token: got.get("refresh_token") || "",
        expires_in: Number(got.get("expires_in")) || 3600,
      });
    }

    history.replaceState(null, "", back && back.indexOf(BASE) === 0 ? back : BASE + "/");

    if (trouble) {
      /* Google's own words, which are English and aimed at whoever wrote the
         app. The one case worth saying properly is the ordinary one: somebody
         got to Google's page and changed their mind. */
      toast(/denied|cancel/i.test(trouble) ? "ההתחברות בוטלה" : "ההתחברות דרך גוגל נכשלה", true);
      return;
    }

    /* The tokens said nothing about the person, so ask, and greet them by name
       once the answer is in. The page does not wait for it: it is already
       signed in, and the bar simply gets their name a moment later. */
    auth.whoAmI().then(function () {
      paintHeader();
      toast(auth.name() ? "שלום, " + auth.name() : "שלום");
    });
  }

  window.addEventListener("popstate", function () { route(); });

  /* A window dragged across the narrow line changes what the header is allowed
     to offer, and a button that was true when it was painted is not true any
     more. Cheap enough to redraw, and it is the same function the routing
     calls. */
  if (NARROW.addEventListener) NARROW.addEventListener("change", function () { paintHeader(); });

  absorbFallback();
  auth.load();
  /* after the session is loaded, because coming back from Google replaces it,
     and before the routing, because what the first page draws depends on
     whether there is one */
  absorbGoogle();
  route();
})();
