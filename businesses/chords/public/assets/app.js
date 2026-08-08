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
    /* a luggage label, which is what a style is: a word tied onto a song */
    tag: '<path d="M12.8 3.6H20v7.2l-9.1 9.1-7.2-7.2 9.1-9.1Z"/><circle cx="16.5" cy="7.1" r="1.2"/>',
    check: '<path d="M5 13l4 4 10-11"/>',
    /* a box with a tick in it: everything on screen, at once */
    /* four corners opening outwards: the song, and nothing else, on the whole
       of the screen */
    /* A CLOCK WITH A HAND GOING BACKWARDS, which is the picture everything else
       uses for "what this was before", so it is the one on the way to the
       versions and not on anything else. It was on the revert button, where it
       meant something close enough to be confusing: back through this hour's
       typing rather than back to a published song. That one is the rewind
       below, and the difference between the two pictures is the difference
       between the two things. */
    history: '<path d="M12 8.5V12l2.5 2"/><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M3 4v4h4"/>',
    /* two arrows and the wall they stop at: not one change back, all of them */
    rewind: '<path d="M20 6l-6 6 6 6"/><path d="M13 6l-6 6 6 6"/><path d="M5 5v14"/>',
    /* THE MARK ITSELF, not a picture of what pressing it does. It was two
       arrows moving apart, which is a fine drawing of opening a gap and tells
       nobody what will appear on the page. The concave arc is what a gap looks
       like once it is there, so the button and its result are the same shape:
       press this, get this. */
    gap: '<path d="M4.5 9.5Q12 18.5 19.5 9.5"/>',
    /* the question mark itself: the hook, the stem and the dot. Drawn to the
       full height of the box like every other icon here, so that at fifteen
       pixels it is a question mark and not a speck. */
    help: '<path d="M8.4 8.6a3.6 3.6 0 1 1 3.6 3.9V15"/><path d="M12 18.7h.01"/>',
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
    /* two of them, which is what a page of everybody who wrote a song is */
    people: '<circle cx="9.5" cy="8.5" r="3.2"/><path d="M3.5 19.5a6 6 0 0 1 12 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6"/><path d="M17.5 14.2a6 6 0 0 1 3 5.3"/>',
    /* --- who made it, as two pictures -----------------------------------
       Under the name of the song there is room for the names and not for the
       words "מילים" and "לחן" in front of them: at that size the labels are
       half the line and they say the same thing on every song. So each name
       carries the picture of what the person did.

       A pen ON A LINE, and the line is what keeps it from being the pencil
       that means "edit this song": that one is a pen alone, this one is a pen
       and what it wrote. And a single note for the tune, which is one note
       rather than the two of the key dial, for the same reason. */
    words: '<path d="M4 20.3h16"/><path d="M7 15.6 15.8 6.8a2.3 2.3 0 0 1 3.3 3.3l-8.8 8.8H7v-3.3Z"/>',
    tune: '<ellipse cx="7.6" cy="17.3" rx="3.1" ry="2.5"/><path d="M10.7 17V5.2c3.7.7 5.7 2.7 6 5.8"/>',
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
      };
      this.keep();
    },

    clear: function () {
      this.session = null;
      localStorage.removeItem(SESSION_KEY);
    },

    get in() { return !!(this.session && this.session.refresh_token); },

    /* THE CAPO IS NOT KEPT HERE ANY MORE. It was one number on the account,
       the same on every song, on the argument that a capo is a fact about the
       player. Where the capo goes is chosen for the song being played, so it
       is kept with the key that song is played in, per reader and per song
       (see keptFor). The account is left holding what is true of the person
       wherever they are: their name. */

    /* --- what this person is called ------------------------------------------
       A NAME IS THE PERSON'S TO GIVE. Google hands one over at the door and it
       is usually the right one, which is why it is what the bar says without
       anybody being asked. But it is the name on somebody's Google account,
       not necessarily the name they want over their own songs, and the two
       are different often enough that it has to be changeable.

       So it lives on the account, which is now the whole of what the account
       keeps about the person, under a key Google does not write to: see
       nameFrom above for why that matters. */
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

  /* HOW MANY TIMES THIS TAB HAS CHANGED SOMETHING. A page kept aside under the
     one on the screen (see the stack of sheets below) is a picture of the
     database at the moment it was drawn, and the only thing that can make that
     picture wrong is somebody writing. So a page that comes back up compares
     this number with the one it was drawn at: the same, and it is still true
     and there is nothing to do; higher, and it is drawn again. */
  var writes = 0;

  function rest(path, options) {
    options = options || {};
    if (options.method && options.method !== "GET") writes++;
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
  /* Two words each, and they are not the same word. `label` is what the
     credit is called ON the song, where it names a part of it: the words, the
     tune. `who` is what the same fact makes of the PERSON, on their own page
     and beside their name in a search result, where "מילים" would be the
     answer to a question nobody asked. */
  var CREDITS = [
    { field: "lyrics_by", label: "מילים", who: "כותב", kind: "words", icon: "words" },
    { field: "music_by", label: "לחן", who: "מלחין", kind: "tune", icon: "tune" },
  ];

  function credits(song) {
    return CREDITS.map(function (c) {
      return { label: c.label, name: String(song[c.field] || "").trim(), icon: c.icon };
    }).filter(function (c) { return c.name; });
  }

  /* The picture in place of the word, where the word would not fit: under the
     name of the song, at twelve pixels, "מילים:" is half the line and it is
     the same half on every song.

     So it is not decoration and it does not get aria-hidden: it carries the
     word it replaced, which is what a reader hovering it is asking for and
     the only thing a screen reader has to go on. */
  function creditMark(credit) {
    var mark = svg(ICON[credit.icon]);
    mark.removeAttribute("aria-hidden");
    mark.setAttribute("role", "img");
    var says = document.createElementNS("http://www.w3.org/2000/svg", "title");
    says.textContent = credit.label;
    mark.appendChild(says);
    return mark;
  }

  /* Who made it, as a line to read: the names, once each. Whoever wrote the
     words usually wrote the tune as well, and a card that answered "who wrote
     this" with the same name twice was reading the columns out loud rather
     than naming a person. The credits themselves keep both, because on the
     song they are two different facts. */
  function creditNames(song) {
    var seen = {};
    return credits(song).map(function (c) { return c.name; }).filter(function (name) {
      if (seen[name]) return false;
      seen[name] = true;
      return true;
    });
  }

  /* --- the people, read out of the songs ------------------------------------
     THERE IS NO TABLE OF CREATORS AND THERE SHOULD NOT BE. A person is not a
     row somebody creates and then has to keep in step with the songs; a
     person is what the songs say, gathered. Typing a name onto a song is the
     only way anybody is ever added, which is also the only way anybody would
     want to be, and a name that stops appearing on any song stops being a
     page, correctly: there is nothing left to show on it.

     What that costs is that two spellings of one person are two people. That
     is why the editor finishes a half typed name from every name already in
     the library (see db.names), and it is a cost worth paying for a set of
     pages that can never disagree with the songs they are made of.

     The same name in both columns is ONE person with two roles, which is the
     ordinary case: whoever wrote the words usually wrote the tune. */
  function creatorsOf(songs) {
    var by = {};
    (songs || []).forEach(function (song) {
      CREDITS.forEach(function (c) {
        var name = String(song[c.field] || "").trim();
        if (!name) return;
        var rec = by[name] || (by[name] = { name: name, roles: {}, songs: [] });
        rec.roles[c.field] = true;
        if (rec.songs.indexOf(song) < 0) rec.songs.push(song);
      });
    });
    return Object.keys(by).sort(function (a, b) { return a.localeCompare(b, "he"); })
      .map(function (name) { return by[name]; });
  }

  /* Which of the two this person is, said in their own words. In the order
     the credits are written in, so somebody who did both always reads
     "כותב, מלחין" and never the other way about. */
  function roleTags(roles) {
    return CREDITS.filter(function (c) { return roles[c.field]; }).map(function (c) {
      return { kind: c.kind, words: c.who };
    });
  }

  /* What one person did on ONE song, which is the same question asked of a
     single row rather than of the library. */
  function rolesOn(song, name) {
    var roles = {};
    CREDITS.forEach(function (c) {
      if (String(song[c.field] || "").trim() === name) roles[c.field] = true;
    });
    return roles;
  }

  function songsBy(songs, name) {
    return (songs || []).filter(function (song) {
      return CREDITS.some(function (c) { return String(song[c.field] || "").trim() === name; });
    });
  }

  /* How many songs there are of something, in words, because "1 שירים" is not
     Hebrew. Said the same way wherever it is said: on a person's card, on a
     style's, and in the answer the search box offers for either. */
  function songsSaid(n) {
    return n === 1 ? "שיר אחד" : n + " שירים";
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
    /* UNDER THE SMALLEST COIN, NOTHING IS SHOWN. It used to say "פחות
       מאגורה", which is true and is three words spent on a number that is
       nought: a reading that cost less than the smallest coin there is cost
       nothing anybody is going to think about, and the row is better off
       saying nothing about it than saying that. */
    if (rate) {
      var agorot = cents * rate;
      return agorot < 0.5 ? "" : "₪" + (agorot / 100).toFixed(2);
    }
    return cents < 0.5 ? "" : "$" + (cents / 100).toFixed(2);
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

  /* --- every version that was published --------------------------------------
     A song writes itself every few seconds while it is being typed, so its own
     row is only ever the latest word. This is the other thing: what the song
     WAS each time somebody pressed פורסם, kept whole and never touched again.

     PUBLISHING IS THE MOMENT AND NOT SAVING, because saving is a keystroke and
     publishing is a sentence: "this is finished, let people have it". A row per
     save would be a history of typing, which nobody has ever wanted to read.

     Nothing here is optional-column machinery: this table arrived whole or it
     did not arrive at all, and a project whose schema.sql has not been run
     since simply has no history, which every call below answers quietly. A
     song must go on publishing whether or not its past can be written down.

     See song_versions in schema.sql for the shape and for who may read it,
     which is its author and nobody else. */
  var VER = CFG.versionTable;
  var VER_FIELDS = "id,created_at,title,lyrics_by,music_by,dir,lines,styles";

  var versions = {
    /* One song's, newest first. Ordered by the database rather than here,
       because that is the index the table carries. */
    of: function (songId) {
      return rest(VER + "?select=" + VER_FIELDS +
        "&song_id=eq." + encodeURIComponent(songId) + "&order=created_at.desc")
        .then(function (rows) { return rows || []; })
        .catch(function () { return []; });
    },

    one: function (songId, id) {
      return rest(VER + "?select=" + VER_FIELDS +
        "&song_id=eq." + encodeURIComponent(songId) +
        "&id=eq." + encodeURIComponent(id) + "&limit=1")
        .then(function (rows) { return rows && rows[0]; })
        .catch(function () { return null; });
    },

    /* The last one written, for the two questions that only need it: whether
       anything has moved since, and whether the song on screen is still the
       version everybody else is reading. */
    latest: function (songId) {
      return rest(VER + "?select=" + VER_FIELDS +
        "&song_id=eq." + encodeURIComponent(songId) + "&order=created_at.desc&limit=1")
        .then(function (rows) { return rows && rows[0]; })
        .catch(function () { return null; });
    },

    /* How many there are, asked by the song page to decide whether to offer a
       way in at all. Ids only: the way to what is there should not cost the
       whole of what is there. */
    count: function (songId) {
      return rest(VER + "?select=id&song_id=eq." + encodeURIComponent(songId))
        .then(function (rows) { return (rows || []).length; })
        .catch(function () { return 0; });
    },

    /* The one published before this one, which is what a version is read
       against: "what changed" has no answer that does not name a second song,
       and the second song is the one this replaced. Null for the first
       version, which changed nothing because there was nothing there. */
    before: function (songId, when) {
      return rest(VER + "?select=" + VER_FIELDS +
        "&song_id=eq." + encodeURIComponent(songId) +
        "&created_at=lt." + encodeURIComponent(when) + "&order=created_at.desc&limit=1")
        .then(function (rows) { return rows && rows[0]; })
        .catch(function () { return null; });
    },

    /* `owner` is not sent. The database fills it in from the token, which is
       the whole of why a version cannot be written into somebody else's name. */
    add: function (row) {
      return rest(VER, { method: "POST", body: row });
    },
  };

  /* The song as it stands, in the shape a version is kept in. Taken from the
     row the database just handed back rather than from the page, so what is
     recorded is what was actually written and not what was about to be. */
  function versionOf(row) {
    return {
      song_id: row.id,
      title: String(row.title || ""),
      lyrics_by: String(row.lyrics_by || ""),
      music_by: String(row.music_by || ""),
      dir: row.dir || "rtl",
      /* the same jsonb string the song itself holds, straight across */
      lines: row.lines == null ? "" : row.lines,
      styles: Array.isArray(row.styles) ? row.styles : [],
    };
  }

  /* Two versions of the same song, or a version and the song itself. Compared
     on everything a version keeps, and on nothing else: `updated_at` moves when
     a song is published and says nothing about the words. */
  function sameVersion(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(versionKeys(a)) === JSON.stringify(versionKeys(b));
  }

  function versionKeys(v) {
    return [
      String(v.title || ""),
      String(v.lyrics_by || ""),
      String(v.music_by || ""),
      v.dir || "rtl",
      String(v.lines == null ? "" : v.lines),
      Array.isArray(v.styles) ? v.styles : [],
    ];
  }

  /* Publishing is what writes one, and the press has already been made by the
     time this runs: the song is in the database, and this is the copy of it
     going into the shelf beside it.

     A PUBLISH THAT CHANGED NOTHING WRITES NOTHING. Two identical rows an hour
     apart are not two versions, they are one version and a second press, and a
     list of them would be a list of presses. What makes a version is the song
     being different.

     Failure is swallowed. Nothing anybody typed is at stake here: the song was
     saved before this ran, and a history that could not be written is a shelf
     that stayed empty, not a word lost. A red message over a successful publish
     would say the opposite. */
  function keepVersion(row) {
    if (!row || !row.id) return;
    var now = versionOf(row);
    versions.latest(row.id).then(function (last) {
      if (last && sameVersion(last, now)) return;
      return versions.add(now);
    }).catch(function () { /* the song is published either way */ });
  }

  /* ------------------------------------------------------------------ model */

  /* Words the app has taken for itself under /chords/. A song may not be
     called one of them, because the address would be the app's answer rather
     than the song's. */
  var RESERVED_SLUGS = {
    "new": true, "edit": true, "evenings": true, "deleted": true,
    "creators": true, "creator": true, "style": true,
  };

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

  /* The first character that has a direction of its own. Hebrew and Arabic
     and their presentation forms run one way, the Latin, Greek and Cyrillic
     alphabets the other; everything else is silent and the loop goes on.
     Digits, spaces and punctuation have no direction to give: they belong to
     whichever way the words around them run. */
  var RTL_LETTER = /[֐-޿ࢠ-ࣿיִ-﷿ﹰ-﻿]/;
  var LTR_LETTER = /[A-Za-zÀ-ɏͰ-ӿ]/;

  function textDir(text) {
    var body = String(text == null ? "" : text);
    for (var i = 0; i < body.length; i++) {
      var ch = body.charAt(i);
      if (RTL_LETTER.test(ch)) return "rtl";
      if (LTR_LETTER.test(ch)) return "ltr";
    }
    return "";
  }

  function dirOf(line, fallback) {
    var said = textDir(line && line.text);
    if (said) return said;
    /* Nothing to go on, which is a blank line or a bar of chords over
       nothing: whatever the line before it settled on (see fillDirs), and
       failing that whatever the caller says the song is. A line with nothing
       to say has no reason to interrupt. */
    var kept = line && line.dir;
    if (kept === "rtl" || kept === "ltr") return kept;
    return fallback === "ltr" ? "ltr" : "rtl";
  }

  /* Every line saying which way it runs, so that nothing further down has to
     ask a song what one of its lines is doing. */
  function fillDirs(lines, fallback) {
    var last = fallback === "ltr" ? "ltr" : "rtl";
    lines.forEach(function (line) {
      last = textDir(line.text) || last;
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

  /* --- room after the last word ---------------------------------------------
     Room for a chord that belongs after the last word: the LINE grows so the
     chord still names a character. This is what a printed chord sheet does
     too, and it is what keeps the promise that editing the words moves the
     chords with them.

     IN ARTIFICIAL SPACES, NOT IN SPACES, and that is the whole of it. A space
     is room in the WORDS, and the words are what a lyrics sheet prints, what a
     search reads and what a copy carries: a line ending «אני עומד» ended four
     spaces later, and those four spaces went onto the paper, into the
     clipboard and into the selection. A gap is room on the screen and nothing
     in the song (see GAP), so a chord dragged out past the end of a line now
     costs the words nothing at all.

     A chord names a CHARACTER, so the line has to be long enough to have one:
     a chord on character 12 needs thirteen characters, not twelve. */
  function padTo(line, pos) {
    var needed = pos + 1;
    if (needed <= line.text.length) return false;
    line.text += new Array(needed - line.text.length + 1).join(GAP);
    return true;
  }

  /* The tail a line's chords ask for, and nothing more: as far out as the
     furthest one needs, in gaps, and never shorter than the words themselves,
     which are not padding and are never touched.

     It answers in BOTH directions, which is what makes it padding rather than
     typing: a chord dragged out grows it, a chord brought back shrinks it
     again. And it is where a song written before any of this arrives: real
     trailing spaces come out of here as gaps, the same length and the same
     chords standing over them. */
  var TAIL = new RegExp("[\\s" + GAP + "]+$");

  function padTail(text, chords) {
    var needed = 0;
    (chords || []).forEach(function (c) { if (c.pos + 1 > needed) needed = c.pos + 1; });
    var body = String(text == null ? "" : text).replace(TAIL, "");
    return body + new Array(Math.max(0, needed - body.length) + 1).join(GAP);
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
  /* NO DIRECTION IS WRITTEN DOWN ANY MORE. It is read off the words every
     time the song is drawn (see dirOf), so a marker in the document could only
     ever agree with them or be wrong about them, and a stored fact that can go
     stale is a stored fact that will. */
  function songToText(lines) {
    return normalizeLines(lines).map(function (line) {
      return line.type === "section" ? "{" + line.text + "}" : toChordPro(line);
    }).join("\n");
  }

  function textToSong(body, fallback) {
    var dir = fallback === "ltr" ? "ltr" : "rtl";
    var out = [];
    String(body).replace(/\r\n?/g, "\n").split("\n").forEach(function (row) {
      /* THROWN AWAY RATHER THAN OBEYED. A song written while the direction was
         a setting carries these, and the words underneath them are the better
         witness: they say what the line IS, and a marker says what somebody
         once said it was and may have typed past ever since. */
      if (DIR_MARK.test(row)) return;

      /* The words decide, and a line with no letters in it keeps whatever the
         line before it settled on. */
      var heading = /^\s*\{(.*)\}\s*$/.exec(row);
      if (heading) {
        var title = heading[1].trim();
        dir = textDir(title) || dir;
        return out.push({ type: "section", text: title, chords: [], dir: dir });
      }
      var parsed = fromChordPro(row);
      dir = textDir(parsed.text) || dir;
      out.push({ type: "line", text: parsed.text, chords: parsed.chords, dir: dir });
    });
    return out;
  }

  /* --- what one version did to the one before it -----------------------------
     Two songs in, one list of lines out, each carrying whether it is new, gone,
     or the same in both. Which is the whole of "what changed": a version is not
     a description of an edit, it is the song afterwards, so the edit has to be
     worked out from the two songs rather than read off either.

     A LINE IS ITS WORDS AND ITS CHORDS TOGETHER. Moving one chord along a line
     makes it a different line, and it shows as the old one going and a new one
     arriving, which is what happened: there is no smaller true thing to say
     about a chord that moved, and pretending the line merely "changed" would
     hide which of the two you are looking at.

     The longest common subsequence, which is the diff every version control
     system is: the lines that survive in order are the song's spine, and
     everything else is an arrival or a departure. Written out in full rather
     than by some cheaper heuristic because a song is a couple of hundred lines
     at the very most, and a diff that is nearly right about a chorus that
     repeats four times is worse than no diff.

     A departure is offered before an arrival at the same place, so a line that
     was rewritten reads downwards: this was there, and this is there now. */
  function lineKey(line) {
    return line.type === "section" ? "{" + line.text + "}" : toChordPro(line);
  }

  function diffLines(before, after) {
    var a = before || [], b = after || [];
    var n = a.length, m = b.length;
    var keyA = a.map(lineKey), keyB = b.map(lineKey);

    /* L[i][j] is how many lines a[i..] and b[j..] still have in common. Filled
       from the end backwards so the walk below can go forwards, which is the
       order the answer is read in. */
    var L = [];
    for (var i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        L[i][j] = keyA[i] === keyB[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      }
    }

    var out = [];
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && keyA[i] === keyB[j]) {
        out.push({ line: b[j], mark: "same" });
        i++; j++;
      } else if (i < n && (j === m || L[i + 1][j] >= L[i][j + 1])) {
        out.push({ line: a[i], mark: "gone" });
        i++;
      } else {
        out.push({ line: b[j], mark: "add" });
        j++;
      }
    }
    return out;
  }

  /* A blank line arriving is not a change anybody means, so the counting skips
     the empty ones. They are still drawn with their mark: on the page a gap
     that appeared is part of what the version looks like, and here it would be
     a number saying something happened when nothing did. */
  function changeCount(ops) {
    var add = 0, gone = 0;
    (ops || []).forEach(function (op) {
      var line = op.line;
      if (!String(line.text || "").trim() && !(line.chords && line.chords.length)) return;
      if (op.mark === "add") add++;
      else if (op.mark === "gone") gone++;
    });
    return { add: add, gone: gone };
  }

  /* the other half of padTo: room nothing needs any more, once the chord that
     called for it has moved back */
  function trimPadding(line) {
    var next = padTail(line.text, line.chords);
    if (next === line.text) return false;
    line.text = next;
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

      var chords = parsed.chords
        .map(function (c) {
          /* A WHOLE character of THIS line, and nothing else is allowed.
             That is the entire contract: a chord names a character, so editing
             the words carries the chord along with the syllable it sat on.
             A fraction is a pixel wearing a costume, and an index past the end
             of the text names nothing at all, so a chord that belongs after
             the last word is made room for by lengthening the line (see
             padTo), never by pointing past it. */
          return { pos: Math.max(0, Math.min(Math.round(Number(c.pos) || 0), parsed.text.length)), chord: String(c.chord || "").trim() };
        })
        .filter(function (c) { return c.chord; })
        .sort(function (a, b) { return a.pos - b.pos; });

      /* And the tail is whatever those chords still need, in gaps. Which is
         also where a song stored before there were gaps is put right: the real
         spaces it was padded with come out artificial, so the line is the same
         length, the chords stand over the same cells, and the WORDS end where
         the words end. */
      var text = padTail(parsed.text, chords);
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
      var span = el("span", text[i] === GAP ? "gap" : null, text[i]);

      /* ONE ARC OVER A RUN, NOT ONE PER GAP. Five gaps pressed in a row are one
         piece of room, and five little arcs read as five of something. So the
         FIRST gap of a run carries the mark and is told how many characters it
         has to reach across (`--run`); the rest of the run draws nothing and
         the arc is drawn once, edge to edge, over all of them. Counted here
         rather than in the stylesheet because CSS can ask whether a gap follows
         a gap but not how many follow it. */
      if (text[i] === GAP && text[i - 1] !== GAP) {
        var run = 1;
        while (text[i + run] === GAP) run++;

        /* AND A MARK IS ABOUT WHAT IS BETWEEN TWO CHARACTERS. Both of them
           are: the arc says «these two letters are one word with room in
           between», the diagonal says «these two lines were not written on one
           line». A run that ENDS the row has nothing on its far side to say
           anything about. It is the room a chord was dragged out into (see
           padTo), and room past the last word is not a mark, it is emptiness.

           The separator is the exception, and it is the only host made of
           nothing but gaps: it stands between two rows rather than between two
           characters, so it carries its mark with nothing on either side of it
           (see buildSep). */
        if (i + run < text.length || wrap.classList.contains("ln-sep")) {
          span.className = "gap gap-run";
          span.style.setProperty("--run", run);
        }
      }

      wrap.appendChild(span);
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

  /* --- THE SONG IN SCREENFULS ----------------------------------------------
     A SCREEN IS A PAGE, AND THE COLUMNS ARE ON IT. The first three columns
     run from under the header to the bottom of the window, and the next three
     begin underneath, the same height again, and are reached by scrolling.
     Which is what a book does, and what somebody playing from a stand is
     doing when they scroll: taking the next page, not the next inch.

     This is why the browser's own columns are not used here. A multicol
     BALANCES: it takes the whole song and shares it out between the columns
     it was given, so each one is as tall as a third of the song, and reading
     to the bottom of the first is scrolling through a third of the song
     before starting again at the top. There is no way to ask it for a row of
     columns that ends and another that begins: overflow in a multicol goes
     sideways, not down. So the lines are dealt out here, by height, into
     columns of a screenful each.

     Nobody is asked how many columns. A reader knows how big they want the
     words; they do not know how many pixels their longest line takes in the
     font their machine happens to have. */

  /* The narrowest a column may be where the lines are broken to fit it, in
     song sizes: about thirty characters of Hebrew. Narrower than that and
     every line is broken, which is a page of stubs rather than a song. */
  /* A SEGMENT IS A PHONE, AND A PHONE IS 390 PIXELS. Not a number of
     characters and not a share of the window: the actual width of the glass
     most of these songs are read from. Phones run from about 360 to 430 CSS
     pixels, and 400 sits in the middle of that.

     IN PIXELS, WHICH IS THE POINT OF IT. Written as a multiple of the type
     size instead, a segment grew as the words grew, so zooming changed how
     many segments fitted across the screen and the page rearranged itself
     under the reader. Fixed, zooming does what it does on a phone: the
     segment stays where it is, fewer words fit on a line, and the song runs
     into more segments. The shape of the page is a fact about the window and
     nothing else. */
  var COL_W = 400;
  var COL_MAX = 4;
  /* THE DESK BETWEEN TWO CARDS. A segment is a card on a desk (see .col), and
     what says where one card ends and the next begins is the desk showing
     between them: there was a hairline down the middle of the space instead,
     which is a rule drawn because the space was not saying it on its own.

     In pixels and not in song sizes, like the width of a segment and for the
     same reason: it is the shape of the page, and the page must not rearrange
     itself when the words are made bigger. */
  var CARD_GAP = 14;

  /* Every line of the sheet in the order the song has them, wherever they are
     standing now: flat under the sheet before there are any pages, inside a
     column after, and beside another row where two of them share a line of the
     page (see .ln-row). */
  function sheetRows(sheet) {
    return Array.prototype.slice.call(sheet.querySelectorAll(".ln, .coming"));
  }

  /* What the page is DEALT in, which is not the same list: two rows sharing a
     line of the page are one thing to move and one height to count. */
  function sheetBlocks(sheet) {
    return Array.prototype.slice.call(sheet.children);
  }

  /* Back to one flat column, which is what a phone reads and what everything
     measures itself against before it is dealt out. */
  /* THE AIR, AND IT IS SPENT TWICE. A page holds it at its top and its bottom,
     which is the desk between the cards of one screenful and the cards of the
     next; and a card holds it again inside itself, over its first line and
     under its last. So what a page can actually be filled with is its height
     less four of these, which is why the dealing counts it four times.

     It is --page-air in the stylesheet, and two places holding one number is
     how they come to disagree: neither may be changed alone. */
  var PAGE_AIR = 16;

  function unpage(sheet) {
    sheet.style.maxWidth = "";
    sheet.style.paddingTop = "";
    sheet.style.paddingBottom = "";
    /* The pages, and also the pairs of rows that share a line of one: both are
       something built around the rows, and what has to be taken back to is the
       rows themselves. */
    if (!sheet.querySelector(".page, .ln-row")) return;
    var rows = sheetRows(sheet);
    sheet.textContent = "";
    rows.forEach(function (ln) { sheet.appendChild(ln); });
  }

  /* --- how wide a column, and how many ---------------------------------------
     Two numbers, and the smaller wins.

     HOW WIDE ONE IS is not asked at all: it is 400, reading and writing
     alike, and the lines are poured to it. No line can be too wide for a
     segment, because a line that does not fit is broken until it does.

     HOW MANY OF THOSE FIT is a division. And then never more than the song
     has song to put in them: a fourth column with nothing in it is a quarter
     of the window held empty. */
  function planColumns(sheet) {
    if (!sheet || !sheet.isConnected || !sheet.classList.contains("sheet")) return null;

    var texts = sheet.querySelectorAll(".ln-t");
    if (!texts.length) return null;

    var size = parseFloat(getComputedStyle(texts[0]).fontSize) || 18;

    /* WHAT A SEGMENT KEEPS AT ITS TWO ENDS, and it is the chords that ask for
       it and not the words. A chord is centred on the character it names, so
       one written over the first character of a row hangs half a label past
       where the words begin, and a page holds a segment and not a pixel more
       (see .page): whatever hangs past that edge is cut off, which is how
       Cmaj7 came to be drawn with its C missing.

       HALF OF THE WIDEST LABEL IN THE SONG, asked of the labels themselves.
       That is exactly what the overhang needs and nothing beyond it, and it is
       ONE NUMBER: the same at both ends of every segment, on a phone and on a
       desk, for the chords and for the words. Between two segments the two
       halves meet and make the margin the card keeps inside its own edge, which
       used to be a wide multiple of the type because that space alone had to
       say where one segment ended. It is a card on a desk now (see .col), so
       the space says nothing and can be no more than the ink needs. */
    var half = size * 0.4;
    Array.prototype.forEach.call(sheet.querySelectorAll(".chord"), function (node) {
      var w = node.getBoundingClientRect().width / 2;
      if (w > half) half = w;
    });
    var pad = Math.ceil(half) + 2;

    var box = getComputedStyle(sheet);
    var padded = (parseFloat(box.paddingLeft) || 0) + (parseFloat(box.paddingRight) || 0);
    var room = sheet.clientWidth - padded;
    if (!(room > 0)) return null;

    /* A SEGMENT IS 400 WHETHER THE SONG IS BEING READ OR WRITTEN. It used to
       widen to the longest line in the song while editing, because a poured
       row was not a line anybody could type into: the price was that the same
       song had one shape on the page and another under the hands that wrote
       it, and every judgement about where a line breaks was made against a
       width no reader would ever see. A poured row is an editing host now (see
       __adoptRow), so the two states are the same page. */
    var seg = COL_W;
    /* A card takes its own width and, unless it is the first on the page, the
       desk between it and the one before it. The two ends of the page have no
       desk of their own to pay for, which is what the odd `+ apart` is: the
       room there would be if one more gap were going spare.

       AND THE PAGE'S OWN AIR AT THE TWO ENDS, which is what the outermost
       cards' shadows are drawn into (see .page). Not on a phone: there the
       segment is the glass rather than a card lying on a desk, it casts no
       shadow, and thirty two pixels of a phone is a word and a half of every
       line.

       ASKED OF THE SCREEN AND NOT OF THE NUMBER OF SEGMENTS. A song of four
       lines stands in ONE segment on the widest screen there is, because there
       is no more song to put in a second: that is a card on a desk like any
       other, and a rule that read "one segment across, so this is a phone" took
       the shape off every short song on every desk. */
    var glass = NARROW.matches;
    var apart = CARD_GAP;
    var shadowed = glass ? 0 : PAGE_AIR * 2;
    var byWidth = Math.max(1, Math.floor((room - shadowed + apart) / (seg + pad * 2 + apart)));

    /* A PAGE IS THE WINDOW UNDER WHATEVER IS PERMANENTLY OVER IT. The bar is
       sticky, and on a phone so is the row of controls under it, which is the
       rest of the bar by another name: both cover the same strip of every
       page and not only the first, so both come off the height of all of
       them. */
    var over = 0;
    Array.prototype.forEach.call(document.querySelectorAll(".top, .song-strip"), function (node) {
      if (node.offsetParent === null) return;
      over += node.getBoundingClientRect().height;
    });
    var pageH = window.innerHeight - over;
    if (!(pageH > 200)) return null;

    /* How much song there is, measured while it is still one flat column. */
    var tall = 0;
    sheetRows(sheet).forEach(function (ln) {
      tall += ln.offsetHeight + (parseFloat(getComputedStyle(ln).marginBottom) || 0);
    });

    /* never more columns than the song can fill the first page with */
    var bySong = Math.max(1, Math.ceil(tall / pageH));
    var cols = Math.max(1, Math.min(byWidth, bySong, COL_MAX));

    /* THE SEGMENTS ARE THE WIDTH THEY ARE AND THE SET STANDS IN THE MIDDLE.
       Whatever the window has over is held at the two ends, where it reads as
       a margin. Spreading it between them instead would make the space between
       two segments a fact about the window rather than about the song, and two
       segments on a very wide screen would end up at opposite edges of it with
       a hand's width of nothing between.

       A single segment takes the room it is given: a phone has none to hold
       back, and it keeps the same margin as any other segment, which is what
       a chord over its first character needs. */
    var colW = Math.min(seg, room - pad * 2);
    if (!(colW > 0)) return null;

    return {
      cols: cols, colW: colW, pad: pad, apart: apart, air: shadowed,
      pageH: pageH, padded: padded,
    };
  }

  /* --- dealing the lines out -------------------------------------------------
     Down a column until the next line would not fit, then the next column,
     and after the last column of a page, a new page under it. Greedy and not
     balanced, and that is the point: a page that is full to the bottom is a
     page you can read to the bottom of.

     THE ORDER IN THE DOCUMENT IS STILL THE ORDER OF THE SONG, column by
     column and page by page, which everything else here depends on: the lines
     are the same nodes moved, so what they say, what is marked and where the
     caret is all come along with them. */
  function pageUp(sheet, plan) {
    /* In blocks and not in rows: two rows that share a line of the page stand
       in one block, and dealing them out one at a time would put the head of a
       line in one column and the tail of the line above it in another. */
    var rows = sheetBlocks(sheet);
    if (!rows.length) return;

    /* measured first, because moving them is what makes them unmeasurable */
    var heights = rows.map(function (ln) {
      return ln.offsetHeight + (parseFloat(getComputedStyle(ln).marginBottom) || 0);
    });

    /* NOTHING IS TAKEN OUT UNTIL THE PAGES ARE BUILT TO PUT IT IN. Emptying
       the sheet first and filling it afterwards means anything that throws
       between the two leaves the song gone off the screen altogether, with no
       way back but a reload: the rows are the only copy on the page. */
    var built = document.createDocumentFragment();

    /* THE SHEET'S OWN TOP AND BOTTOM PADDING GOES WHILE THERE ARE PAGES. A
       page is meant to be exactly the window under the header, and twenty two
       pixels of padding above the first one pushes every page that far down:
       the bottom of each is then below the fold, and the last line on it is
       cut in half by the edge of the screen. The air belongs to the pages
       now, where it also keeps the song off the rule between them. */
    sheet.style.paddingTop = "0";
    sheet.style.paddingBottom = "0";

    /* What a page can actually hold, which is its height less the air it keeps
       at both ends and less the air the card keeps inside its own edges (see
       PAGE_AIR: the same number, spent twice at the top and twice at the
       bottom). Filling to the full height and then padding it is how a line
       ends up under the fold. */
    /* ONE SEGMENT ACROSS IS A PHONE, AND A PHONE HAS NO PAGES. A page is a
       screenful because that is how a row of segments is read: fill the row,
       then the next row underneath. With one segment there is no row, so
       cutting the song into screenfuls buys nothing and costs the tail of
       every one of them, a band of empty paper wherever the last line of a
       page did not reach the bottom. The song simply runs on. */
    var room = plan.cols < 2 ? Infinity : plan.pageH - PAGE_AIR * 4;

    var page = null;
    var col = null;
    var used = 0;
    var inPage = 0;

    /* A SEGMENT CARRIES ITS MARGIN INSIDE ITSELF. The card is the paper, so
       what holds the words off its edges, and what leaves room for a chord
       hanging past the end of a line, is the card's own padding rather than a
       space beside it. (How wide that is, and why, is planColumns's business.)
       The desk between two cards is on top of that. */
    var slot = plan.colW + plan.pad * 2;

    function nextCol() {
      if (!page || inPage >= plan.cols) {
        page = el("div", "page");
        if (plan.cols > 1) page.style.height = Math.round(plan.pageH) + "px";
        /* EVERY PAGE IS THE SAME WIDTH AND HOLDS THE SAME NUMBER OF SLOTS,
           filled or not. Centring each page's own segments instead put the
           last page's, which are fewer, at a different place from every page
           above it, so the cards stopped lining up down the window. */
        /* NOT ROUNDED, AND THAT IS NOT FUSSINESS. The lines were broken to a
           width worked out from these same numbers, so a column rounded to a
           different one is a column a hair narrower than the words that were
           cut to fit it, and the last word of a row hangs out over the next
           segment. Sub-pixel widths are what CSS is for. */
        /* The cards, the desk between them, and the page's own air at the two
           ends, which is where their shadows are drawn (see .page). A phone
           keeps none of that air: the segment there is the glass rather than a
           card, so it casts no shadow and the paper runs to both edges. */
        page.style.width = (plan.cols * slot + (plan.cols - 1) * plan.apart + plan.air) + "px";
        /* There was a mark on the page here saying it held one segment, and the
           stylesheet took the card off a page so marked: which is what put a
           short song, standing in one segment because there was no more song for
           a second, on a desk with no card under it. What a segment looks like
           is a fact about the SCREEN and is answered in the narrow rules. */
        built.appendChild(page);
        inPage = 0;
      }
      col = el("div", "col");
      col.style.width = slot + "px";
      col.style.paddingInline = plan.pad + "px";
      /* the desk between this card and the one before it, and none at the ends
         of the page: what is outside the page is desk already */
      if (inPage) col.style.marginInlineStart = plan.apart + "px";
      page.appendChild(col);
      inPage++;
      used = 0;
    }

    try {
      nextCol();
      rows.forEach(function (ln, i) {
        /* `used > 0` so a line taller than a whole page still lands somewhere
           rather than being dealt into an endless run of empty columns */
        if (used > 0 && used + heights[i] > room) nextCol();
        col.appendChild(ln);
        used += heights[i];
      });
      /* The slots a short last page never reached. They hold the width open so
         the pages above keep their shape, and they are marked as empty so that
         nothing is drawn on them: no card and no desk of their own, because
         there is no segment there. */
      Array.prototype.forEach.call(built.childNodes, function (pg) {
        while (pg.children.length < plan.cols) {
          var spare = el("div", "col is-empty");
          spare.style.width = slot + "px";
          if (pg.children.length) spare.style.marginInlineStart = plan.apart + "px";
          pg.appendChild(spare);
        }
      });

      /* THE LAST PAGE ENDS WHERE THE SONG DOES. Every page above it is exactly
         a screenful, because that is what turning a page means here: the next
         set of segments begins one window down, whether or not the song filled
         the one before. The last page has nothing under it to line up with,
         and held to the same height it is a screenful of blank paper after the
         final line, which on a phone is most of the screen. Let it take its
         own height and the paper stops with the words, and what is under them
         is the desk. */
      if (built.lastChild) built.lastChild.style.height = "";

      sheet.textContent = "";
      sheet.appendChild(built);
    } catch (e) {
      /* Back to one flat column with every line in it. A song laid out wrong
         is a bad afternoon; a song that is not on the screen at all is a page
         nobody can do anything with. */
      sheet.textContent = "";
      rows.forEach(function (ln) { sheet.appendChild(ln); });
      unpage(sheet);
    }
  }

  /* The whole of it, in the order the answers depend on each other: how wide a
     column is, then the lines broken to that width, then dealt out by height.
     The sheet is squeezed to one column's width while the pouring runs,
     because a line is broken to the width of the box it is standing in and
     until the columns exist that box is the whole sheet. */
  function fitColumns(sheet) {
    if (!sheet || !sheet.isConnected) return;
    unpage(sheet);

    var plan = planColumns(sheet);
    /* One column, which is a phone and a song whose lines are too long to
       stand two of them side by side. The lines are still broken to the room
       there is, which is what a phone has always done. */
    if (!plan) return void flowSheet(sheet);

    sheet.style.maxWidth = Math.ceil(plan.colW + plan.padded) + "px";
    flowSheet(sheet);
    sheet.style.maxWidth = "";

    pageUp(sheet, plan);
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
  var CONT_INDENT = 0;

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

    /* WRITING IS READING WITH A CARET IN IT. The song is poured the same way
       either way, and what the editor needs back is only this: which line of
       the song a row is a piece of, and where in that line the piece starts.
       That is handed over piece by piece, through __adoptRow (see the song
       page), which builds the row for that slice out of the song itself. */
    var ed = sheet.classList.contains("ed");
    var adopt = ed && typeof sheet.__adoptRow === "function" ? sheet.__adoptRow : null;

    var lines = originals.map(function (ln) { return measureLine(ln); });
    var sized = lines.filter(function (line) { return !line.keep; });
    if (!sized.length) return;

    var indent = CONT_INDENT * sized[0].size;

    /* --- pouring ---------------------------------------------------------- */

    var out = [];

    /* --- A LEFTOVER ROW TAKES THE LINE AFTER IT ------------------------------
       The last row of a broken line is usually one word on an otherwise empty
       row, and a row spent on one word is a row of the screen spent on
       nothing. So the next line of the song starts there, on the same row,
       and what separates them is a double gap: two of the artificial spaces
       the format already has (see GAP), drawn and never stored.

       A row is then not always one line of the song, and the whole of what
       says so is that space. It is worth being clear that this is a trade and
       not a free win: a row carrying the tail of one line and the head of
       another is two things to take apart before either can be sung, and a
       person playing from a phone is reading a line ahead with their hands
       full. What buys it back is the room, which on a small screen is the
       thing there is least of.

       `row` lives outside the loop over lines, which is the whole mechanism:
       the row a line ends on is still open when the next line starts. */
    /* FOUR, NOT TWO. The separator has to be read as a space between two
       different lines of the song rather than as a wide space inside one, and
       two gaps is about what a person leaves between two words. */
    var SEP_GAPS = 5;
    var row = null;

    /* What the separator takes, in pixels. The gap's width is a fact of the
       stylesheet, so it is asked of the stylesheet rather than guessed at
       here: two places holding the same number is how they come to disagree. */
    var gapW = 0;
    var probe = sheet.querySelector(".ln-t .gap");
    if (probe) gapW = probe.getBoundingClientRect().width;
    if (!(gapW > 0)) gapW = (sized[0].size || 18) * 0.34;
    /* THE SOLIDUS IS INK AND TAKES ROOM LIKE ANY OTHER LETTER. Counting only
       the gaps either side of it left the row a few pixels wider than the
       segment it stands in, which is a word printed over the next segment. A
       third of a size is a solidus with a little to spare, and spare is the
       right way to be wrong here: a row that breaks a word early costs a word,
       and a row that runs over costs a reader the line. */
    var sepW = SEP_GAPS * gapW;

    /* --- THE MARK IS DRAWN, NOT WRITTEN -------------------------------------
       The separator is artificial spaces and nothing else, and the middle one
       of them carries the mark: a diagonal painted onto the span itself.

       Painted rather than written, because every version of this that was a
       glyph or a box hung beside one had the same weakness. The gap that
       carries it is a box of no height, so anything positioned against it is
       arithmetic against nothing, and a solidus in the text is a character in
       a row of characters, which is the one thing this must not look like: it
       is a fact about the screen and the rest of the row is the song.

       AND IT NEEDS NO CLASS OF ITS OWN. The stylesheet already knows what a
       run of artificial spaces is, because fillSpans marks the first of every
       run and tells it how many there are; the mark is drawn from that. Every
       version of this that added a class here was a version that could fail
       to arrive, and did. */
    var sep = new Array(SEP_GAPS + 1).join(GAP);

    lines.forEach(function (line) {
      /* A heading, or a blank line between two verses, is a thing of its own
         and closes whatever row was open: nothing gets tacked onto it and it
         gets tacked onto nothing. */
      if (line.keep) { out.push(line); row = null; return; }

      var pos = 0;
      var tail = false;
      /* Room enough for the separator and a character after it, or the row is
         full and the line starts on a new one. */
      /* THE SPACE A ROW BROKE ON WAS ALLOWED TO HANG PAST THE EDGE, because it
         was the last thing on the row and there was nothing after it to push
         off. Joined, there is: the separator and the next line follow it, and
         the row comes out wider than the segment by exactly one space. So the
         row gives it back before it takes anything else. */
      if (row && row.pieces.length) {
        var back = row.pieces[row.pieces.length - 1];
        var text = back.line.text;
        if (back.to > back.from && text[back.to - 1] === " " &&
            !back.line.chords.some(function (c) { return c.pos === back.to - 1; })) {
          back.to--;
          row.used -= back.line.advance[back.to];
        }
      }

      /* ONLY ONTO A ROW THAT A BREAK CREATED. The room worth reclaiming is the
         room a break left behind: a leftover of one word sitting alone on a
         row of its own. A row that simply ended with space to spare is a line
         of the song that fits, and the next line belongs under it, where the
         person who wrote the song put it. Packing onto those as well rewrites
         the shape of the whole song to save nothing.

         `tail` is true only of a row opened to carry the rest of a line that
         did not fit, which is exactly that leftover. */
      var joined = !!(row && row.tail && row.used + sepW + line.advance[0] <= row.room);

      while (pos < line.cells) {
        if (joined) {
          joined = false;
        } else {
          row = { tail: tail, pieces: [], used: 0 };
          row.room = full - (tail ? indent : 0);
          out.push(row);
        }

        /* The separator is part of what this line of the page has spent, and
           the piece that follows it begins after it. It is drawn between the
           two rows rather than written into either (see buildSep). */
        var shared = !!row.pieces.length;
        if (shared) row.used += sepW;

        var avail = row.room - row.used;
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
          /* THE SPACE A ROW BREAKS ON IS NOT PUT ON IT. It used to be, on the
             grounds that it is the last thing on the row and there is nothing
             after it to push off the edge; that stopped being true when a row
             began taking the line after it, and a row that is three pixels
             wider than the segment it stands in is a word printed over the
             next segment.

             Nothing is lost by leaving it off. The row after this one starts
             at that space and steps over it, unless a chord is sitting on it,
             in which case it is kept and carried along (see below). */
          if (at > pos && at < line.text.length && line.text[at] === " ") space = at;

          /* --- A WORD IS NOT CUT IN HALF ---------------------------------------
             No space inside the room means the first word of this piece does
             not fit whole. On a row already carrying something that means the
             row has no room for this line at all, whatever it could take of
             it: the row is closed, the separator it was charged for goes back,
             and the line starts on the next row entire. Taking the two letters
             that happened to fit is how רפאי came out as רפ on one page and
             אי on the next.

             It was only caught when NOTHING fitted, which is a narrower case
             than the one that matters. */
          if (space <= pos && shared) {
            row.used -= sepW;
            row = null;
            continue;
          }

          end = space > pos ? space : at;

          /* --- A WORD IS NOT CUT IN HALF ---------------------------------------
             No space fits, so not even the first word of this piece does. On a
             row that is already carrying something, that means it has no room
             for this line at all: the row is closed and the line starts on the
             next one whole. The separator it was charged for goes back with
             it.

             On an EMPTY row it means the word is longer than a whole segment,
             and then it has to be cut somewhere, because there is nowhere
             wider to try. That is the only place a word comes apart. */
          /* An empty row and still nothing fits: the word is longer than a
             whole segment, and there is nowhere wider to try. That is the only
             place a word comes apart. */
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
          tail = true;
          /* the rest of this line needs a row of its own */
          row = null;
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
        /* A piece that carries the end of the line before it, and a piece with
           more of its own line after it. Asked of the line rather than of the
           row it landed on, which is the same question now that a row is one
           piece: it is the LINE that continues, not the row. */
        piece.tail = n > 0;
        piece.more = n < line.pieces.length - 1;
      });
    });

    /* --- and drawing it -----------------------------------------------------
       ONE ROW PER PIECE, ALWAYS, and where two pieces share a line of the page
       they are two rows standing side by side in one.

       They used to be a single row holding both, with the separator written
       into its own characters, and that row was two lines of the song at once:
       one caret for both, one lane of chords over both, and a copy that ran
       the two of them together into one line. Side by side, a row is one line
       of the song again, wherever it was broken and whatever it shares its
       line of the page with. */
    function buildRow(piece) {
      var line = piece.line;
      /* A row that is a tail and has no more after it is the LAST of a broken
         line, and it is the only one that needs saying so: what comes under it
         is the next line of the song. */
      var ln = el("div", "ln");
      /* the poured row runs the way the line it was poured from runs */
      ln.dir = line.rtl ? "rtl" : "ltr";

      var lane = el("div", "ln-c");
      line.chords.forEach(function (c) {
        if (c.pos < piece.claimFrom || c.pos >= piece.claimTo) return;
        /* already transposed on screen, so nothing is shifted a second time */
        lane.appendChild(chordEl(c.label, Math.max(0, c.pos - piece.from), 0));
      });

      /* A leftover row with no chords over it needs no lane to hold them, and
         the fifteen pixels it would take are a line of the song further down
         the page. */
      if (piece.tail && !lane.children.length) ln.classList.add("is-tight");
      ln.appendChild(lane);
      ln.appendChild(textSpans(line.text.slice(piece.from, Math.min(piece.to, line.text.length))));
      return ln;
    }

    /* WHAT SAYS THAT A NEW LINE OF THE SONG BEGINS HERE. Artificial spaces,
       the same ones the format already has, with the mark drawn on the run by
       the stylesheet (see fillSpans). It stands between the two rows and
       belongs to neither: nothing can be typed into it and nothing is copied
       out of it, because it is not a line of anything. */
    function buildSep() {
      var node = el("div", "ln-t ln-sep");
      fillSpans(node, sep);
      return node;
    }

    /* What the pouring has to say about a row, whoever built it. */
    function shape(ln, piece) {
      if (piece.tail) {
        ln.classList.add("is-cont");
        ln.style.setProperty("--cont", indent + "px");
      }
      if (piece.more) ln.classList.add("has-cont");
      if (piece.tail && !piece.more) ln.classList.add("is-last");
      return ln;
    }

    /* A LINE THAT FITS IS THE ROW IT ALREADY IS. Rebuilding it would throw
       away the one thing that cannot be rebuilt from the outside: the row the
       editor made, with its caret, its listeners and its chords bound to the
       song. Most lines of most songs fit, so most rows are carried straight
       through and only a line that had to be broken is poured into pieces. */
    function rowFor(piece) {
      if (ed && !piece.tail && !piece.more && !piece.from && piece.to >= piece.line.text.length) {
        return piece.line.node;
      }
      /* Writing, the row comes back from the editor, which builds it out of
         the song exactly as it builds a whole line. It is not given a tight
         lane the way a read one is: an empty lane on a page being written is
         where the next chord goes down, and there has to be something there to
         press. */
      return shape((adopt ? adopt(piece) : null) || buildRow(piece), piece);
    }

    /* WHERE THE SONG GOES, TAKEN BEFORE THE ROWS ARE BUILT. Building them moves
       the rows that are being carried through: a row that ends up sharing a
       line of the page is moved into the pair that holds it, and if that row
       was the one this place was being taken beside, the whole song would be
       inserted inside the pair. */
    var here = document.createComment("");
    sheet.insertBefore(here, originals[0]);

    var nodes = out.map(function (desc) {
      if (desc.keep) return desc.node;

      var made = desc.pieces.map(rowFor);
      if (made.length < 2) return made[0];

      /* Two lines of the song on one line of the page. The air under it is the
         air the LAST of them asks for, because that is the line the next row
         of the page follows on from. */
      var share = el("div", "ln-row");
      made.forEach(function (node, n) {
        if (n) share.appendChild(buildSep());
        share.appendChild(node);
      });
      var end = desc.pieces[desc.pieces.length - 1];
      if (end.more) share.classList.add("has-cont");
      if (end.tail && !end.more) share.classList.add("is-last");
      return share;
    });

    /* All of them at that one place, so the order on the page is the order of
       `out` whether a row is a new one or one being carried through. */
    nodes.forEach(function (node) { sheet.insertBefore(node, here); });
    sheet.removeChild(here);

    /* And what is left over goes. A row carried through is either one of these
       nodes or standing inside one of them, and an original that is neither is
       a row the pouring has replaced. */
    var kept = [];
    nodes.forEach(function (node) {
      kept.push(node);
      Array.prototype.forEach.call(node.children, function (child) { kept.push(child); });
    });
    originals.forEach(function (node) {
      if (node.parentNode && kept.indexOf(node) === -1) node.parentNode.removeChild(node);
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

  /* WHICH KEY WAS PRESSED, NOT WHICH LETTER CAME OUT OF IT. A song is typed in
     Hebrew, so the keyboard is in Hebrew, and Ctrl+Z arrives with a `key` of
     ז: every shortcut written against the letter stops working the moment the
     layout is the one this whole app is for. `code` is the key itself,
     wherever a layout puts its letters, and the letter is still accepted
     because a keyboard without one (a phone) sends no code. */
  function pressed(event, code, letter) {
    return event.code === code || String(event.key).toLowerCase() === letter;
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
    /* Once per node. Everything this is called on used to be built fresh for
       the page it was on; the name in the bar is not, it outlives every view,
       and a listener hung on it per page is a listener per page. */
    if (node.contentEditable === "true" && !node.dataset.pasted) {
      node.dataset.pasted = "1";
      node.addEventListener("paste", function (event) {
        event.preventDefault();
        var text = (event.clipboardData || window.clipboardData).getData("text").replace(/\s+/g, " ");
        document.execCommand("insertText", false, text);
      });
    }
  }

  /* ------------------------------------------------------------------ views */

  /* --- THE PAGES ARE A STACK, AND BACK TAKES THE TOP SHEET OFF --------------
     There used to be one container under the header, emptied and filled again
     on every move. Which means BACK was not going back at all: it was the page
     you came from being built for the first time, out of an answer that had to
     be asked of the database again, and it arrived at the top of itself,
     because at the moment the browser would have put it back where it was
     there was nothing there yet to put back.

     So it is not one container. Every page that opens gets a sheet of its own,
     laid over the one before it, and the one before it is not thrown away, it
     is covered: its rows, its scroll, the shelf it was narrowed to and
     whatever was half typed into it are all still standing underneath. BACK
     takes the top sheet off. What is under it never went anywhere, so there is
     nothing to fetch, nothing to draw and nothing to scroll to. It is already
     exactly as it was left, in the same frame the press landed in.

     FIVE DEEP, and the deepest goes when a sixth arrives. A song is a few
     hundred measured lines and there is no reason to hold a whole morning's
     reading in memory; five is further back than anybody presses.

     WHAT A SHEET DOES NOT CARRY IS THE BAR, because there is one bar and it
     stands over all of them. So whatever a page put up there comes down with
     it and goes back up when it does: see bury and reveal.

     A COVERED SHEET IS TAKEN OUT OF THE DOCUMENT, not hidden inside it. Half
     this file asks `isConnected` to find out whether the page it belongs to is
     still the page: a list that has left the document stops asking the
     database for itself, an editor that has left takes its key handling off
     the document. Hidden and still in there, every one of those would go on
     running under the page on the screen, and the keys somebody typed into the
     library would be read by a song nobody can see. Out of the document, every
     one of those sentences means what it always meant. Nothing is lost by it:
     what a detached node keeps is everything except where it was standing, and
     where it was standing is written down here anyway. */
  var stack = document.getElementById("app");
  /* What every view draws into. NOT the stack: the sheet on top of it. */
  var app = null;
  var layers = [];
  /* Which of them is showing. Everything before it is covered, and anything
     after it is what the forward button would go back to. */
  var at = -1;
  var DEEP = 5;

  var state = {
    songs: null, printable: false, printer: null, killer: null,
    editToggle: null, songControls: null, redrawSong: null, rehome: null,
    wake: null,
  };

  /* The answers the bar reads to know what to offer. They are about the page
     on the screen and not about the tab, so they go under the sheet with it.
     `songs` is not one of them: it is the library itself, one copy for
     everybody, and every sheet showing it is showing the same songs. */
  var PAGE_STATE = ["printable", "printer", "killer", "editToggle",
    "songControls", "redrawSong", "rehome", "wake"];

  function takeKids(node) {
    if (!node) return null;
    var box = document.createDocumentFragment();
    while (node.firstChild) box.appendChild(node.firstChild);
    return box;
  }

  function putKids(node, box) {
    if (node && box) node.appendChild(box);
  }

  /* Everything this page put outside its own sheet, taken down and kept with
     it: the name in the bar, what stands under and beside that name, the far
     end of the search box, and where the reader had got to. A covered sheet
     has no scroll of its own, so the scroll has to be written down. */
  function bury(layer) {
    if (!layer || !layer.node.isConnected) return;
    layer.y = window.scrollY || window.pageYOffset || 0;
    layer.onSong = document.body.classList.contains("on-song");
    var name = document.getElementById("topWhere");
    layer.head = {
      /* read off the bar rather than remembered from when it was written: a
         name that is a field has been typed into since (see whereEditable) */
      bar: name ? name.textContent : "",
      tab: document.title,
      sub: takeKids(document.getElementById("topSub")),
      facts: takeKids(document.getElementById("topFacts")),
      extra: takeKids(findExtra),
    };
    layer.state = {};
    PAGE_STATE.forEach(function (name2) { layer.state[name2] = state[name2]; });
    layer.node.remove();
  }

  function reveal(layer) {
    app = layer.node;
    stack.appendChild(layer.node);
    at = layers.indexOf(layer);
    document.body.classList.toggle("on-song", !!layer.onSong);
    PAGE_STATE.forEach(function (name) { state[name] = layer.state[name]; });

    var h = layer.head;
    /* where() wipes the three slots beside the name, so it goes first and what
       came down goes back up after it. A name that was a field is made one
       again, with the same four answers it was given the first time. */
    if (layer.edit) whereEditable(h.bar, layer.edit.empty, layer.edit.each, layer.edit.done);
    else where(h.bar);
    if (document.title !== h.tab) document.title = h.tab;
    putKids(document.getElementById("topSub"), h.sub);
    putKids(document.getElementById("topFacts"), h.facts);
    putKids(findExtra, h.extra);
    paintHeader();
    /* A list that stopped looking at itself while it was out of the document
       starts again (see poll in viewIndex). */
    if (state.wake) state.wake();
    /* In this frame, not after one: the page is back at its full height, and
       the height is asked for here so that it is worked out before the scroll
       rather than clamped against a document that has not been measured. */
    void stack.offsetHeight;
    window.scrollTo(0, layer.y || 0);
  }

  /* A sheet for a page about to be drawn. Whatever the forward button could
     have gone back to goes now, which is what the browser does with the
     history itself the moment a new address is opened. */
  function openLayer(key) {
    while (layers.length > at + 1) layers.pop().node.remove();
    var now = layers[at];
    if (now && now.key === key) {
      /* the same address being drawn a second time, so it replaces itself
         rather than standing under itself */
      now.node.remove();
      layers.pop();
      at--;
    } else if (now) {
      bury(now);
    }

    var node = el("div", "layer");
    stack.appendChild(node);
    layers.push({ key: key, node: node, head: null, state: null, edit: null, y: 0, writes: writes });
    at = layers.length - 1;
    while (layers.length > DEEP) {
      layers.shift().node.remove();
      at--;
    }
    app = node;
    return layers[at];
  }

  function layerAt(key) {
    for (var i = 0; i < layers.length; i++) if (layers[i].key === key) return i;
    return -1;
  }

  /* A width that crosses the line the whole app is drawn either side of makes
     every covered sheet a picture of the other screen. Cheaper to forget them
     than to redraw five pages nobody is looking at. */
  function forgetCovered() {
    for (var i = layers.length - 1; i >= 0; i--) {
      if (i === at) continue;
      layers[i].node.remove();
      layers.splice(i, 1);
      if (i < at) at--;
    }
  }

  /* --- THE SONG GETS THE SCREEN ---------------------------------------------
     What is left over the song is a strip carrying two dials and a line about
     who wrote it, thirty pixels of it, and thirty pixels is still a row of the
     page spent on something that is not the song. On a desk there is a hand's
     width of empty bar right above it, so that is where they go, and the song
     starts directly under the header.

     Not on a phone. The bar there is already a mark, a name, a glass and three
     pictures, and the same two dials would be the row overflowing rather than
     the row filling up. So the strip stays, and the controls are put wherever
     the screen can hold them.

     Which is why they are placed from HERE rather than built into one or the
     other: the header is repainted whenever the window crosses that width, and
     the answer has to be able to change with it. */
  function placeControls() {
    var made = state.songControls;
    if (!made) return;
    var home = NARROW.matches ? made.strip : document.getElementById("topActions");
    if (!home) return;
    /* At the START of the bar, which right to left is its right hand end: they
       are about the song, and what is already there is about the page. */
    home.insertBefore(made.tools, home.firstChild);
    /* WHO WROTE IT GOES WITH THE NAME OF THE SONG, not at the far end of the
       bar among the dials. It stood there beside the transposer and the size,
       which is a line of text in a row of controls: it is the only thing up
       there that is a FACT about the song rather than something to press, and
       the name it belongs under is at the other end of the bar.
       So it sits directly after the name and before the search, which is where
       it reads as the second half of the title rather than as a control that
       lost its buttons. On a phone there is no room for it there and it stays
       on the strip, in the row with the dials. */
    var beside = NARROW.matches ? null : document.getElementById("topFacts");
    if (made.facts) {
      if (beside) beside.appendChild(made.facts);
      else home.insertBefore(made.facts, made.tools);
    }
    made.strip.hidden = !NARROW.matches;

    /* Stuck directly under the bar, whatever height the bar happens to be:
       a sticky thing with nothing to stick at is a thing that scrolls away. */
    var head = document.querySelector(".top");
    made.strip.style.top = head ? Math.round(head.getBoundingClientRect().height) + "px" : "0";
  }

  /* How big this reader wants the words, kept between songs and between visits.
     Whoever needs a bigger font on one song needs it on the next one too, and
     setting it again every time is the kind of small tax that adds up. Call it
     with a number to set it, without one to read it. */
  var SIZE_KEY = "chords.size";

  /* A song is read from a music stand, at arm's length, by somebody holding a
     guitar and not their glasses, so the top of this range is deliberately
     larger than a page of text would ever want. */
  var SIZE_MIN = 13;
  /* Bigger than any page of text would ever want, and then bigger again. The
     top of this range was 48 while the size was two buttons and every step of
     it was a press; it is a gesture now, so the far end of it costs the same
     as the near end, and a music stand across a room is a long way away. */
  var SIZE_MAX = 96;

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

  /* --- WHAT THIS READER DOES WITH THIS SONG ----------------------------------
     THE WHOLE STRIP IS ABOUT THE PAIR. Two numbers, and neither of them is a
     fact about the song and neither is a fact about the person on their own:
     which key they play this one in, and where the capo goes for it. Somebody
     who moved a song three semitones down did it because that is where their
     voice sits, and somebody who clamped at 2 did it for the shapes THIS song
     asks for. Both are as true next week as they were tonight, and neither
     says anything about the next song.

     The capo was one number on the account for a while, the same on every
     song, on the argument that it is a fact about the guitar. A guitar has no
     opinion: the fret is chosen for the song in front of it, which is why it
     is here now, beside the key it is chosen with.

     Kept in this browser rather than on the account, beside the reading size,
     which is the same kind of fact: what it costs to be wrong is two presses,
     and a row per reader per song is a table to carry forever for that. Under
     the reader it belongs to all the same, so two people signing into one
     screen do not inherit each other's answers, and a guest keeps their own.

     Only a saved song has an id to keep anything under; one being typed for
     the first time has nowhere to put it and nothing yet to say. */
  var KEPT_OF = "chords.song.";

  function keptBox(id) {
    return KEPT_OF + ((auth.session && auth.session.email) || "-") + "." + id;
  }

  function keptFor(id) {
    if (!id) return null;
    var was = null;
    try { was = JSON.parse(localStorage.getItem(keptBox(id)) || "null"); }
    catch (e) { was = null; }
    return was && typeof was === "object" ? was : null;
  }

  /* One number at a time, without disturbing the other: the two are pressed
     separately and a write of either is not an answer about both. */
  function keepFor(id, name, value) {
    if (!id) return;
    var was = keptFor(id) || {};
    was[name] = value;
    try { localStorage.setItem(keptBox(id), JSON.stringify(was)); }
    catch (e) { /* private window */ }
  }

  /* Zero is an answer like any other, in both of them: a reader who moved the
     song back to the key it is written in means it, and so does one who took
     the capo off. So "they have never said" is null, and not zero. */
  function keptKey(id) {
    var was = keptFor(id);
    var k = was ? was.k : null;
    return typeof k === "number" && k >= -11 && k <= 11 ? Math.round(k) : null;
  }

  function keptCapo(id) {
    var was = keptFor(id);
    var c = was ? was.c : null;
    return typeof c === "number" && c >= 0 && c <= MAX_CAPO ? Math.round(c) : 0;
  }

  /* --- AND FAILING THAT, THE ONE THAT IS EASIEST TO HOLD ---------------------
     Every row in the library already shows the shapes of the easy version, and
     that is the promise the row makes: this is what your hand will be doing.
     A song that then opened in the key it happens to be stored in, four barre
     chords deep, is the page breaking the promise the row made.

     So a reader who has said nothing gets the song where the row said it would
     be. easyVersion works in capo frets, which is the same move downwards: a
     capo at 3 and a transposition of -3 put the identical shapes on the page.
     Whether they clamp anything on is theirs to decide, and their own capo is
     on the strip beside the song.

     One answer, asked here by everything that has to give it: the page that
     opens the song, the row in the library and the evening. A row that says
     one thing and a page that does another is worse than neither of them
     saying anything. */
  function openKey(song) {
    var mine = keptKey(song.id);
    if (mine != null) return mine;
    /* NOTHING IS GUESSED AT A SONG NOBODY HAS CHECKED YET. A song a machine
       read out of a picture is opened beside that picture, and the whole of
       the job in front of whoever opened it is "does this say what the picture
       says". A page that has helpfully moved every chord three semitones down
       cannot be compared to anything, and a chord corrected on it is corrected
       into the wrong key. It gets the easy version like every other song the
       moment somebody has looked at it. */
    if (song.review || song.status === "queued" || song.status === "reading") return 0;
    var used = chordsUsed(song.lines || []);
    return used.length ? -easyVersion(used).capo : 0;
  }

  /* The chords of this song as this reader will see them, and whether that is
     the app's own guess or their answer: a capo the app worked out is worth
     saying, and a capo under a key somebody chose themselves is a number about
     a version of the song they are not playing. */
  function shapesFor(song) {
    var used = chordsUsed(song.lines || []);
    var mine = keptKey(song.id);
    var by = openKey(song);
    return {
      shapes: used.map(function (chord) { return transposeChord(chord, by); }),
      capo: mine == null ? -by : 0,
      used: used,
    };
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

  /* --- THE BAR IS REARRANGED, NEVER REBUILT --------------------------------
     Every page used to empty the bar and make its buttons over again, so the
     button carrying your own name was thrown away and built a second time on
     the way into every song: the same word, in a new element that had never
     been on the screen before. What that costs is not the work, it is that
     the bar blinks on a move that never touched it, and that whatever the
     browser was holding on those elements, the focus in them included, is
     dropped with them.

     So the buttons are KEPT. Each is made the first time it is asked for and
     is then the same object for the life of the tab. A page that wants a
     different word in one changes THE WORD (see relabel); a page that wants a
     different picture changes the picture (reicon); a page that wants it to do
     something else hands it something else to do (`_act`). What changes on a
     move between pages is only which of them stand in the bar, and in what
     order, which is a matter of moving nodes about (see fill). */
  var kept = {};

  function keep(name, make) {
    if (!kept[name]) kept[name] = make();
    return kept[name];
  }

  /* The label of a button is a span of its own, and this is what that is for:
     the word can be replaced without touching the picture beside it. Written
     only when it differs, so a repaint that changes nothing changes nothing. */
  function relabel(node, label) {
    var lb = node.querySelector(".lb");
    if (lb && lb.textContent !== label) lb.textContent = label;
    if (node.getAttribute("aria-label") !== label) node.setAttribute("aria-label", label);
  }

  function retitle(node, title) {
    if (node.title !== title) node.title = title;
    if (node.getAttribute("aria-label") !== title) node.setAttribute("aria-label", title);
  }

  function reicon(node, icon) {
    if (node._icon === icon) return;
    node._icon = icon;
    var was = node.querySelector("svg");
    var now = svg(icon);
    if (was) node.replaceChild(now, was);
    else node.insertBefore(now, node.firstChild);
  }

  /* A picture button that outlives the page it was made for, so what it does
     is a slot rather than something sealed into it at birth: the print button
     prints a song on one page and an evening on another, and it is the same
     button on both. Handed back blank, for whoever asked to fill in. */
  function actionBtn(name, icon, title) {
    var b = keep(name, function () {
      var node = iconBtn(icon, title, function () { if (node._act) node._act(); });
      node._icon = icon;
      return node;
    });
    reicon(b, icon);
    retitle(b, title);
    b._act = null;
    return b;
  }

  /* WHAT THE BAR HOLDS IS SET BY MOVING THINGS, NOT BY EMPTYING IT. Whatever
     is not wanted comes out, and what is wanted goes to its place; a button
     standing on both the page before and the page after is not touched at
     all, because it is already where it is being asked to be. */
  function fill(bar, wanted) {
    var i;
    for (i = bar.children.length - 1; i >= 0; i--) {
      if (wanted.indexOf(bar.children[i]) < 0) bar.removeChild(bar.children[i]);
    }
    for (i = 0; i < wanted.length; i++) {
      if (bar.children[i] !== wanted[i]) bar.insertBefore(wanted[i], bar.children[i] || null);
    }
  }

  /* The way into the other half of the app. It stands on the library and on
     the two pages about people, and it is one button on all three. */
  function toEvenings() {
    return keep("toEvenings", function () {
      return button("ערבי שירה", ICON.calendar, "ghost small", function () {
        go(BASE + "/evenings");
      });
    });
  }

  function paintHeader() {
    var bar = document.getElementById("topActions");
    /* The test harness builds its own page around this file and has no bar. */
    if (!bar) return;
    var p = parts();

    /* The evenings are a list like the library is a list, so their page gets
       the same two buttons the library's does: the one that adds to it, and
       the one that says who you are. An evening that is open has tools of its
       own, and none of these. */
    if (p[0] === "evenings") {
      /* Nothing here is readable without an account, so the one button that
         matters is the way in. */
      if (!auth.in) return fill(bar, [session()]);
      if (p.length === 1) {
        return fill(bar, [
          keep("newEvening", function () {
            return button("ערב חדש", ICON.plus, "small", newEvening);
          }),
          session(),
        ]);
      }
      /* An evening that is open: the two things there are to do to the whole
         of it, both as pictures. A word beside a picture that means printing
         is the picture explained to somebody who already understood it. */
      var whole = [];
      if (state.printer) {
        var evPrint = actionBtn("print", ICON.print, "הדפסה");
        evPrint._act = state.printer;
        whole.push(evPrint);
      }
      if (state.killer) {
        var evKill = actionBtn("kill", ICON.trash, "מחיקת הערב");
        evKill.classList.add("quiet");
        evKill._act = state.killer;
        whole.push(evKill);
      }
      return fill(bar, whole);
    }

    /* The two pages about people. Neither has anything to do TO what is on
       it, so the bar carries the ways on from it: the other half of the app,
       and who is looking. */
    if (p[0] === "creators" || p[0] === "creator") {
      return fill(bar, [toEvenings(), session()]);
    }

    if (p.length) {
      var mine = [];
      /* On a desk the song's own dials stand at the start of the bar. They
         belong to the song rather than to the bar: made with it and handed
         over by placeControls, which is why they are named here too. A repaint
         that did not know about them would take them out. */
      if (state.songControls && !NARROW.matches) mine.push(state.songControls.tools);
      /* Only once there is a song on the page. A song still loading, one that
         is not there at all and one still being read from a photograph are all
         this same address, and none of them is worth paper. */
      if (state.editToggle) {
        var edit = state.editToggle;
        var editBtn = actionBtn("edit", edit.on ? ICON.check : ICON.pencil,
          edit.on ? "סיום עריכה" : "עריכה");
        editBtn.classList.toggle("is-on", !!edit.on);
        editBtn._act = edit.flip;
        mine.push(editBtn);
      }
      if (state.printable) {
        var printBtn = actionBtn("print", ICON.print, "הדפסה");
        printBtn._act = function () { askPrint(printBtn); };
        mine.push(printBtn);
      }
      fill(bar, mine);
      /* last, because it puts them at the front */
      placeControls();
      return;
    }

    fill(bar, [
      /* The way out to the evenings, first, because it is the only one of
         these that goes somewhere rather than making something. */
      toEvenings(),
      /* And the people, beside the evenings, because they are the same kind of
         door: another way through the same songs. The library is by when a song
         was last touched, an evening is by what was played together, and this
         one is by who wrote it. */
      keep("toCreators", function () {
        return button("יוצרים", ICON.people, "ghost small", function () {
          go(BASE + "/creators");
        });
      }),
      /* On a phone the reading is the only way in, so it is the one that gets
         the solid button. On a desk both are open and the typing leads. */
      keep("fromPhoto", function () {
        return button("מתמונה", ICON.upload, "ghost small", uploadSong);
      }),
      keep("newSong", function () {
        return button("שיר חדש", ICON.plus, "small", newSong);
      }),
      session(),
    ]);
  }

  /* WHO IS LOOKING AT THIS, in the corner where it belongs, and their own name
     rather than the word "יציאה". The library is one account's until it is
     published, so which account is holding it is a fact about everything on
     the screen, and a bar that said only "יציאה" left it unsaid.

     The name is a button, and what it opens is the small panel about the
     person: change the name, or leave. Signing out lives in there rather than
     beside it because it is the rarer of the two by a long way, and because a
     bar with five buttons in it is a bar nobody reads.

     THE NAME IS A VALUE IN A BUTTON, NOT A BUTTON. It is the one thing in the
     bar that stands on nearly every page and changes only rarely, so it is
     made once and the word inside it is written over: renaming yourself, or
     the name arriving from Google a moment after the page did, replaces four
     letters and nothing else. */
  function session() {
    if (!auth.in) {
      return keep("signIn", function () { return googleButton("התחברות", "small"); });
    }
    var who = keep("who", function () {
      return button("החשבון", ICON.person, "ghost small who", askMe);
    });
    relabel(who, auth.name() || "החשבון");
    return who;
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
      /* Every page kept aside was drawn for somebody who was signed in, down to
         the tick boxes on the rows. None of them is true any more. */
      forgetCovered();
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

  /* --- WHAT PAGE THIS IS ---------------------------------------------------
     Said once and read twice: the tab's name and the bar's. They were two
     lines in every view saying the same thing in two shapes, which is two
     places to forget.

     `bar` is what the bar shows and `tab` is what the tab shows, and they are
     the same sentence unless a page says otherwise. The library is the one
     that does: on the bar it is the shelf it is showing, and in the tab it is
     the app, because a tab among thirty others is asked which app this is. */
  function where(bar, tab) {
    var node = document.getElementById("topWhere");
    var title = tab || (bar ? bar + " | אקורדים" : "אקורדים");
    if (document.title !== title) document.title = title;
    /* The test harness builds its own bar and has no slot for this. */
    if (!node) return null;
    /* The slot for the name is the same slot on every page, and what a move
       changes is the name in it. Written only when it differs, so a repaint
       that lands on the same page does not take the caret out of a name
       somebody is in the middle of typing (see whereEditable). */
    if (node.textContent !== (bar || "")) node.textContent = bar || "";
    /* A plain name, until whereEditable says otherwise a line below. */
    if (layers[at]) layers[at].edit = null;
    node.removeAttribute("contenteditable");
    node.removeAttribute("data-empty");
    node.onkeydown = null;
    node.oninput = null;
    node.onblur = null;
    whereUnder(null);
    /* And what stood beside the name goes with it. The bar's own end is wiped
       on every page (see paintHeader); this slot is not, so a song's credits
       would still be standing there on the page after it. */
    var beside = document.getElementById("topFacts");
    if (beside) beside.textContent = "";
    /* And the end of the search box, which is the same kind of loan: the page
       that is open puts something there and the next page must not inherit
       it. The box itself is built once and lives through every view. */
    if (findExtra) findExtra.textContent = "";
    return node;
  }

  /* AND THE SMALL LINE UNDER IT, for what is about the thing the name names
     rather than about the page. One page uses it: a song says under its own
     name who wrote it.

     Cleared by where() above, so it belongs to whoever set it and never
     survives the trip to the next page. */
  function whereUnder(nodes) {
    var sub = document.getElementById("topSub");
    if (!sub) return null;
    sub.textContent = "";
    (nodes || []).forEach(function (node) { sub.appendChild(node); });
    return sub;
  }

  /* AND WHERE THAT NAME IS A THING, IT IS THE FIELD FOR IT. A song, an
     evening and a person are each called something, and the bar is where that
     something is now typed: the page carried a second copy as a heading, and
     two editable copies of one name are two places for it to go wrong.

     `each` runs on every keystroke, for whatever has to keep up with the name
     as it is typed. `done` runs when the typing is finished, which is Enter or
     the field being left, and is where anything expensive belongs. Escape puts
     back what was there and leaves. */
  function whereEditable(name, empty, each, done) {
    var node = where(name);
    if (!node) return;
    var was = name || "";

    /* Kept with the sheet, so a page that is covered and then uncovered gets
       its name back as a field rather than as a line of text (see reveal). */
    if (layers[at]) layers[at].edit = { empty: empty, each: each, done: done };

    node.dataset.empty = empty;
    makeEditable(node);

    node.oninput = function () { if (each) each(node.textContent.trim()); };
    node.onkeydown = function (event) {
      /* one line, so Enter is not a newline here, it is done */
      if (event.key === "Enter") { event.preventDefault(); return node.blur(); }
      if (event.key === "Escape") {
        event.preventDefault();
        node.textContent = was;
        if (each) each(was);
        node.blur();
      }
    };
    node.onblur = function () {
      var now = node.textContent.trim();
      if (now === was) return;
      was = now;
      if (done) done(now);
    };
  }

  /* --- ONE BOX, IN THE BAR, THAT FINDS EVERYTHING --------------------------
     It used to be on the library's own page, which is the one page where a
     search box is worth least: the songs are already on the screen and the
     chips over them narrow the wall. Where it is actually wanted is
     everywhere else. You are inside a song and you want the next one. You are
     planning an evening and you want to remember what you played in March.
     You have a name in your head and you want everything that person wrote.

     None of those is a filter on the page you are on. They are all the way
     OFF it, which is navigation, and navigation belongs in the bar.

     SO IT SEARCHES EVERY KIND OF THING THERE IS: songs by their name, their
     credits, their style AND their words; the people who wrote them; and the
     evenings they were sung at. Which means a row of results is a row of
     three different kinds of thing, so every one of them carries the word for
     what it is. Without that the list is a column of names and the only way
     to find out where a press would take you is to press it.

     THE WORDS ARE SEARCHED WITHOUT THE GAPS IN THEM. A gap is room on the
     screen made to fit a chord over a syllable, and it is a character of the
     stored line: searching the raw text would fail to find any word with one
     inside it, which is most of the words anybody would search for. What is
     read is the words as they are sung. */

  /* Worked out once per song and kept on the row. A refresh brings new rows,
     so nothing goes stale, and a keystroke does not re-read a hundred
     songs. */
  function songHay(s) {
    if (s.hay == null) {
      s.hay = [
        s.title,
        credits(s).map(function (c) { return c.name; }).join(" "),
        styles(s).join(" "),
        withoutGaps(normalizeLines(s.lines).map(function (l) { return l.text; }).join(" ")),
      ].join(" ").toLowerCase();
    }
    return s.hay;
  }

  /* An evening is remembered by four different things and never by the same
     one twice: its name, the room, the date in words, or a song that was
     sung at it. */
  function eveningHay(evening, titles) {
    return [
      evening.title || "",
      evening.venue || "",
      dateWords(evening.event_date),
      songNames(evening, titles || {}).join(" "),
    ].join(" ").toLowerCase();
  }

  /* --- what the box has to look through ------------------------------------
     Both lists whole, in the browser, because both are small: a library is a
     few hundred rows of text and an evening is a name and a list of ids. So a
     keystroke costs a search and no request.

     Kept for a minute and no longer. A search that opens a song written on
     another machine two minutes ago should find it, and one typed into on a
     page that has just loaded the same list should not go and ask again. The
     pages that read either list hand what they read to the seed below, so the
     ordinary case costs nothing at all. */
  var FIND_FRESH = 60000;
  var findSongs = null, findSongsAt = 0;
  var findEvenings = null, findEveningsAt = 0;

  function seedSongs(rows) {
    findSongs = rows || [];
    findSongsAt = Date.now();
    return findSongs;
  }

  function seedEvenings(rows) {
    findEvenings = rows || [];
    findEveningsAt = Date.now();
    return findEvenings;
  }

  /* A search that cannot reach the database still has whatever it last saw,
     and a box that answers nothing is worse than a box that answers what it
     knew a minute ago. */
  function findSongList() {
    if (findSongs && Date.now() - findSongsAt < FIND_FRESH) return Promise.resolve(findSongs);
    return db.list().then(seedSongs).catch(function () { return findSongs || []; });
  }

  /* An evening belongs to an account and the database answers nothing at all
     without one, so a signed out reader is not asked to wait for an empty
     list. */
  function findEveningList() {
    if (!auth.in) return Promise.resolve([]);
    if (findEvenings && Date.now() - findEveningsAt < FIND_FRESH) return Promise.resolve(findEvenings);
    return sets.list().then(seedEvenings).catch(function () { return findEvenings || []; });
  }

  /* How many rows the panel will hold. A search that answers with sixty songs
     has not answered: what it is for is the two or three that match, and past
     a screenful the thing to do is type another letter. The count of what was
     left out is said, so the list never quietly pretends to be all of it. */
  var FIND_SHOW = 18;

  /* WHERE THE MATCH WAS, WHICH IS HOW THE LIST IS ORDERED. A song whose NAME
     holds what was typed is what was meant; a song with the word somewhere in
     its third verse is a maybe. Both are worth showing and they are not worth
     showing in the order the library happens to be in. */
  var HIT_NAME = 3;
  var HIT_NEAR = 2;
  var HIT_DEEP = 1;

  function findAll(q, songs, evenings) {
    q = String(q || "").trim().toLowerCase();
    if (!q) return [];

    var out = [];
    var titles = {};
    songs.forEach(function (s) { titles[s.id] = s.title; });

    songs.forEach(function (s) {
      var name = String(s.title || "").toLowerCase();
      var hit = name.indexOf(q) >= 0 ? HIT_NAME : (songHay(s).indexOf(q) >= 0 ? HIT_DEEP : 0);
      if (!hit) return;
      out.push({
        hit: hit, order: 0,
        name: s.title || "בלי שם",
        said: creditNames(s).join(", "),
        tags: [{ kind: "kind", words: "שיר" }],
        href: BASE + "/" + encodeURIComponent(s.slug),
      });
    });

    /* WHAT KIND OF SONG, AS A THING RATHER THAN AS A WORD ON ONE. A style is
       a shelf: "the circle songs" is an answer somebody wants the whole of,
       and until now the only way to it was to find the library, find the row
       of chips over it and press the right one.

       It ranks above the songs that merely carry the word, which is the same
       rule the others follow: the shelf itself is what was meant, and the
       twenty songs on it are underneath. */
    var shelves = {};
    songs.forEach(function (song) {
      styles(song).forEach(function (name) { shelves[name] = (shelves[name] || 0) + 1; });
    });
    Object.keys(shelves).forEach(function (name) {
      if (name.toLowerCase().indexOf(q) < 0) return;
      out.push({
        hit: HIT_NEAR, order: 2,
        name: name,
        said: songsSaid(shelves[name]),
        tags: [{ kind: "kind", words: "סגנון" }],
        href: BASE + "/style/" + encodeURIComponent(name),
      });
    });

    creatorsOf(songs).forEach(function (person) {
      if (person.name.toLowerCase().indexOf(q) < 0) return;
      out.push({
        hit: HIT_NEAR, order: 1,
        name: person.name,
        said: songsSaid(person.songs.length),
        tags: roleTags(person.roles),
        href: BASE + "/creator/" + encodeURIComponent(person.name),
      });
    });

    evenings.forEach(function (evening) {
      var near = [evening.title || "", evening.venue || "", dateWords(evening.event_date)]
        .join(" ").toLowerCase();
      var hit = near.indexOf(q) >= 0 ? HIT_NEAR : (eveningHay(evening, titles).indexOf(q) >= 0 ? HIT_DEEP : 0);
      if (!hit) return;
      out.push({
        hit: hit, order: 3,
        name: evening.title || "ערב בלי שם",
        said: whenWhere(evening),
        tags: [{ kind: "kind", words: "ערב" }],
        href: BASE + "/evenings/" + evening.id,
      });
    });

    /* Where it matched first, then what kind of thing it is, then the name.
       The last of the three is what stops the list reshuffling itself between
       one keystroke and the next. */
    out.sort(function (a, b) {
      return b.hit - a.hit || a.order - b.order || a.name.localeCompare(b.name, "he");
    });
    return out;
  }

  var findBox = null;
  var findField = null;
  var findExtra = null;
  var findOut = null;
  var findRows = [];
  var findAt = -1;
  var findTimer = null;
  /* Which keystroke an answer belongs to. The lists are fetched, so two
     letters typed quickly are two answers that can land in either order, and
     the one that must win is the later question's. */
  var findAsked = 0;

  function buildFind() {
    var slot = document.getElementById("topFind");
    /* The test harness builds its own page around this file and has no bar to
       put a box in. A search box that is not there is not a broken app. */
    if (!slot) return null;

    findBox = el("div", "find");
    findBox.appendChild(svg(ICON.search));
    findField = el("input");
    findField.type = "search";
    findField.autocomplete = "off";
    findField.placeholder = "חיפוש שיר, יוצר או ערב";
    findField.setAttribute("aria-label", "חיפוש שיר, יוצר או ערב");
    findBox.appendChild(findField);

    /* --- AND THE FAR END OF THE BOX IS THE PAGE'S ----------------------------
       The box takes whatever the bar has left, which on a wide screen is a
       long stretch of white with a placeholder at one end of it. What the page
       has to say about what it is showing goes in the other end.

       Which is where the library's states belong, and where they were: three
       counts saying how much of it is unchecked, unfinished and done, and each
       one pressable to narrow the wall to it. They stood in a row of their own
       over the songs, and a row that holds three small chips costs a band of
       the page on every screen in exchange for something that fits in room
       already being wasted.

       They are NARROWING and the box is NAVIGATION, which is why they were
       parted in the first place. Side by side they read as one gesture again,
       which is what they always were: both of them are ways of getting to
       fewer songs.

       Emptied by `where`, which every page goes through, so nothing is ever
       left hanging over the wrong one. */
    findExtra = el("div", "find-extra");
    /* A press on the box opens the search. A press on a chip is not one: it is
       about the page under the box, and it must not put a keyboard on a phone
       or a panel over the wall it just narrowed. */
    findExtra.addEventListener("click", function (event) { event.stopPropagation(); });
    findBox.appendChild(findExtra);

    /* THE WAY BACK OUT, AND ONLY ON A PHONE, WHERE THERE IS SOMETHING TO GO
       BACK TO. There the box does not open, it takes over: the mark, the name
       of the page and every button on the bar stand down to make room for it.
       So the one gesture that ends it is a press on whatever is left of the
       page, which is a thing you have to already know. A reader who pressed
       the glass by mistake gets a keyboard and no door.

       On a desk it stays hidden, because the bar never went anywhere and the
       cross would be back to being the second picture in a box that wants
       one. */
    var findX = el("button", "find-x");
    findX.type = "button";
    findX.setAttribute("aria-label", "סגירת החיפוש");
    findX.appendChild(svg(ICON.close));
    findX.addEventListener("click", function (event) {
      /* the press is also a press on the box, and the box opens */
      event.stopPropagation();
      clearFind();
    });
    findBox.appendChild(findX);

    slot.appendChild(findBox);

    findOut = el("div", "find-out");
    findOut.hidden = true;
    slot.appendChild(findOut);

    /* A press anywhere on the box is a press on the field. On a phone the
       field is nothing but a magnifying glass until it is opened, and a glass
       that has to be hit exactly is a glass nobody hits. */
    findBox.addEventListener("click", openFind);

    findField.addEventListener("input", function () {
      clearTimeout(findTimer);
      findTimer = setTimeout(askFind, 110);
    });
    findField.addEventListener("focus", function () {
      openFind();
      if (findField.value.trim()) askFind();
    });
    findField.addEventListener("keydown", onFindKey);
    document.addEventListener("pointerdown", function (event) {
      if (!findOut || findOut.hidden) return;
      if (findBox.contains(event.target) || findOut.contains(event.target)) return;
      shutFind();
    }, true);

    /* Pressing away from an open box on a phone gives the bar back, whether
       or not there was a panel under it to close. */
    document.addEventListener("pointerdown", function (event) {
      if (!document.body.classList.contains("finding")) return;
      if (findBox.contains(event.target) || (findOut && findOut.contains(event.target))) return;
      clearFind();
    }, true);

    return findBox;
  }

  /* On a phone this is what makes room for it: the bar's own buttons stand
     down while it is open. On a desk the class changes nothing, because
     nothing was in the way. */
  function openFind() {
    if (!findField) return;
    document.body.classList.add("finding");
    if (document.activeElement !== findField) findField.focus();
  }

  function shutFind() {
    if (!findOut) return;
    findOut.hidden = true;
    findOut.textContent = "";
    findRows = [];
    findAt = -1;
  }

  /* A new page is a new question, and the answer to the old one hanging over
     it is a panel about where you have just been. */
  function clearFind() {
    document.body.classList.remove("finding");
    if (!findField) return;
    findField.value = "";
    findField.blur();
    shutFind();
  }

  function askFind() {
    if (!findField) return;
    var q = findField.value.trim();
    if (!q) return shutFind();

    var mine = ++findAsked;
    Promise.all([findSongList(), findEveningList()]).then(function (both) {
      if (mine !== findAsked || !findField) return;
      paintFind(q, findAll(q, both[0] || [], both[1] || []));
    });
  }

  function paintFind(q, found) {
    findOut.textContent = "";
    findRows = [];
    findAt = -1;
    findOut.hidden = false;

    if (!found.length) {
      findOut.appendChild(el("div", "find-none", 'לא נמצא כלום עבור "' + q + '".'));
      return;
    }

    found.slice(0, FIND_SHOW).forEach(function (item) {
      var row = el("button", "find-row");
      row.type = "button";

      var main = el("div", "find-main");
      main.appendChild(el("div", "find-t", item.name));
      if (item.said) main.appendChild(el("div", "find-said", item.said));
      row.appendChild(main);

      var tags = el("div", "find-tags");
      item.tags.forEach(function (t) { tags.appendChild(tag(t.kind, t.words)); });
      row.appendChild(tags);

      row.addEventListener("click", function () {
        clearFind();
        go(item.href);
      });
      row.addEventListener("mousemove", function () { markFind(findRows.indexOf(row)); });

      findRows.push(row);
      findOut.appendChild(row);
    });

    /* NAMED AS A NUMBER AND NOT HIDDEN. A list cut at eighteen that says
       nothing about it is a list claiming to be all of them. */
    var over = found.length - findRows.length;
    if (over > 0) findOut.appendChild(el("div", "find-more", "ועוד " + over + ", אפשר להקליד עוד אות"));
  }

  function markFind(index) {
    if (index < 0 || index >= findRows.length) return;
    if (findAt >= 0 && findRows[findAt]) findRows[findAt].classList.remove("is-on");
    findAt = index;
    findRows[findAt].classList.add("is-on");
  }

  function onFindKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      return clearFind();
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!findRows.length) return;
      event.preventDefault();
      var next = findAt + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) next = findRows.length - 1;
      if (next >= findRows.length) next = 0;
      markFind(next);
      findRows[next].scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      /* Nothing chosen with the arrows means the first of them, which is the
         one the box put at the top for exactly this. */
      var row = findRows[findAt >= 0 ? findAt : 0];
      if (!row) return;
      event.preventDefault();
      row.click();
    }
  }

  /* --- the index ---------------------------------------------------------- */

  /* `shelf`, when there is one, is the style this page opened narrowed to, and
     the address is the only way to it: the search box offers the shelf, the
     shelf is a page, and the bar says its name. */
  function viewIndex(shelf) {
    where(shelf || "אקורדים", shelf ? null : "אקורדים");
    setBusy("טוען שירים");

    db.list().then(function (songs) {
      state.songs = songs || [];
      /* the box in the bar searches this same list, and it has just been
         read: asking for it a second time a keystroke later would be the same
         request twice */
      seedSongs(state.songs);
      app.innerHTML = "";

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
      /* --- a style, onto all of them at once ------------------------------------
         Naming what kind of song something is happens in batches: a folder of
         circle songs goes up, and then all of them are circle songs. One at a
         time is the same word typed fifteen times, in fifteen pages that each
         have to be opened and left.

         It does not touch anything else about them. A style is a word tied on
         the outside; it is not the song, so a song that was published stays
         published and nothing goes back to being a draft. */
      var styleBtn = iconBtn(ICON.tag, "לתת סגנון", function () { askStyle(styleBtn); });
      picking.appendChild(styleBtn);

      var styler = null;

      function closeStyler() {
        if (!styler) return;
        styler.remove();
        styler = null;
        document.removeEventListener("pointerdown", stylerOutside, true);
      }

      function stylerOutside(event) {
        if (!styler) return;
        if (styler.contains(event.target)) return;
        if (styleBtn.contains(event.target)) return;
        closeStyler();
      }

      function askStyle(anchor) {
        if (styler) return closeStyler();

        styler = el("div", "print-menu styler");

        /* Every style the library already uses, one press each: the second
           song of a kind should be called what the first one was called, and
           nobody should have to remember how they spelled it. */
        var known = {};
        state.songs.forEach(function (s) {
          styles(s).forEach(function (name) { known[name] = true; });
        });
        var names = Object.keys(known).sort(function (a, b) { return a.localeCompare(b, "he"); });
        if (names.length) {
          var row = el("div", "styler-known");
          names.forEach(function (name) {
            row.appendChild(button(name, null, "ghost small", function () { giveStyle(name); }));
          });
          styler.appendChild(row);
        }

        /* and one that the library has never heard of */
        var field = el("input");
        field.type = "text";
        field.placeholder = "סגנון חדש";
        field.setAttribute("aria-label", "סגנון חדש לשירים שנבחרו");
        field.addEventListener("keydown", function (event) {
          if (event.key !== "Enter") return;
          event.preventDefault();
          giveStyle(field.value);
        });
        styler.appendChild(field);

        document.body.appendChild(styler);
        var box = anchor.getBoundingClientRect();
        var width = styler.offsetWidth;
        styler.style.top = (box.bottom + 6) + "px";
        styler.style.left = Math.min(Math.max(6, box.right - width), window.innerWidth - width - 6) + "px";
        field.focus();

        document.addEventListener("pointerdown", stylerOutside, true);
      }

      function giveStyle(raw) {
        var name = tidyStyles([raw])[0];
        if (!name) return;
        var going = pickedSongs();
        if (!going.length) return closeStyler();

        closeStyler();
        Promise.all(going.map(function (s) {
          return db.update(s.id, { styles: tidyStyles(styles(s).concat([name])) });
        })).then(function () {
          picked = {};
          toast(going.length === 1 ? "הסגנון נוסף" : "הסגנון נוסף ל-" + going.length + " שירים");
          return refresh();
        }).catch(function (e) {
          toast("לא הצלחתי: " + e.message, true);
          return refresh();
        });
      }

      var killBtn = iconBtn(ICON.trash, "מחיקה", removePicked);
      killBtn.classList.add("kill");
      picking.appendChild(killBtn);
      picking.appendChild(iconBtn(ICON.close, "ביטול הבחירה", function () {
        picked = {};
        paint();
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

      /* --- IN THE SEARCH BOX, AT ITS FAR END ------------------------------------
         They sat inside the library's own search box once, then in a row of
         chips over the wall when the searching moved to the bar, and now they
         are back in the box the searching moved to. Both narrow the list; one
         box holds both.

         THE STATES ONLY. The styles stood in that row too, one chip per shelf,
         and they have gone to the search box in the other sense: typing a
         style there offers the shelf itself above the songs that merely carry
         the word, and a shelf is a page, /style/<name>. What is left is the
         work outstanding, which is the one question the library is asked that
         no amount of typing can answer. */
      var tallies = el("div", "tallies");

      /* --- EVERYTHING THE FILTER LEFT ------------------------------------------
         The ticks are for doing one thing to a handful of songs, and the
         handful is usually "these", where "these" is what
         the chips have already narrowed the wall down to: the songs with no
         style yet, everything by one writer, the drafts. Ticking forty of
         those by hand is forty presses to say a word the page already knows.

         It is a toggle against what is SHOWN, not against the library: press
         it with the shown songs all ticked and they all let go. So it is safe
         to press twice and it never reaches past what is on screen. */
      var allBtn = null;
      var allTick = null;
      var shownNow = [];

      function allShownPicked() {
        return shownNow.length > 0 && shownNow.every(function (s) { return picked[s.id]; });
      }

      function pickAll() {
        var take = !allShownPicked();
        shownNow.forEach(function (s) {
          if (take) picked[s.id] = true;
          else delete picked[s.id];
        });
        paint();
      }

      /* Set by the address and never from the page: /style/<name> is a shelf,
         and every other way into the library shows all of it. */
      var kind = shelf || null;

      /* --- ON A DESK, NONE OF THIS IS ON THE PAGE ------------------------------
         There was a row over the wall holding the tick that takes everything
         shown, the three state chips and the two buttons for what is ticked.
         On a wide screen it is gone, and its three parts went into the bar,
         which had the room for all of them standing empty:

           the tick, and the buttons that come with it, beside the name of the
           page, because "אקורדים" is the name of what is on screen and the tick
           means "all of it": one phrase, read in that order

           the states at the far end of the search box (see buildFind)

         AND THE TICK IS A CHECKBOX, the same box at the same size as the one
         in the corner of every card, because it does the same thing to all of
         them at once. An icon of a ticked square inside a button said "a
         control to do with ticking"; a checkbox says whether they are ticked,
         which is the thing worth knowing at a glance. Some of them ticked has
         a face of its own here and no icon could have carried it.

         ON A PHONE THE ROW STAYS, because the bar there does not have the
         room: the name is beside a mark and four pictures, and the search box
         is a thirty pixel glass with nothing inside it to hang anything on.
         The row is the same row, holding the same three things in the same
         order.

         Which of the two it is depends on a width that can change under a
         window that is already open, so it is written once as a function and
         the media query calls it again. The bar's slots are wiped by `where`
         on every page, so nothing here can be left standing over a song. */
      if (auth.in) {
        allBtn = el("label", "pick-all");
        allTick = el("input");
        allTick.type = "checkbox";
        allTick.addEventListener("change", pickAll);
        allBtn.appendChild(allTick);
      }
      var overWall = el("div", "kinds-row");
      app.appendChild(overWall);

      function rehome() {
        var beside = document.getElementById("topFacts");
        var inBar = !NARROW.matches && beside && findExtra;
        if (allBtn) (inBar ? beside : overWall).appendChild(allBtn);
        (inBar ? findExtra : overWall).appendChild(tallies);
        if (auth.in) (inBar ? beside : overWall).appendChild(picking);
        /* An empty row is still a row: it has a margin under it, and on a desk
           that margin is the band of page this whole move was for. */
        overWall.hidden = !overWall.firstChild;
      }
      rehome();
      state.rehome = rehome;

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
            paint();
          });
          tallies.appendChild(chip);
        });
      }

      /* The styles and the people, over the songs. Only on the library itself:
         a shelf is already one style, and a page that opened narrowed to one
         kind of song has no business offering the other eleven above it. */
      var bands = el("div");
      app.appendChild(bands);

      function paintBands() {
        bands.textContent = "";
        if (shelf) return;

        var counted = {};
        state.songs.forEach(function (s) {
          styles(s).forEach(function (name) { counted[name] = (counted[name] || 0) + 1; });
        });
        var names = Object.keys(counted).sort(function (a, b) { return a.localeCompare(b, "he"); });
        if (names.length) {
          bands.appendChild(wall("סגנונות", names.map(function (name) {
            return shelfRow(name, counted[name]);
          })));
        }

        var people = creatorsOf(state.songs);
        if (people.length) {
          bands.appendChild(wall("יוצרים", people.map(function (person) {
            return creatorRow(person, true);
          })));
        }
      }

      /* The songs get a label of their own now that two labelled bands stand
         over them, and only then: the page used to be called "שירים" in the
         bar, which named the one thing on it. Under a band of people, an
         unnamed wall of cards reads as more of the band. */
      var listHead = el("h2", "band-h wall-h", "שירים");
      app.appendChild(listHead);

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

      /* WHAT THE CHIPS LEFT, and on a shelf, what the address left. Looking a
         song up by NAME, by who wrote it or by a line of it is the box in the
         bar, on every page and not only on this one. */
      function paint() {
        list.innerHTML = "";
        showBar();
        paintTallies();
        var marks = marksFor(state.songs);
        var only = tag && TAGS.filter(function (t) { return t.key === tag; })[0];
        var shown = state.songs.filter(function (s) {
          if (only && !only.is(s)) return false;
          if (kind && styles(s).indexOf(kind) < 0) return false;
          return true;
        });

        shownNow = shown;
        if (allBtn) allBtn.hidden = !shown.length;
        /* A shelf is one kind of song and the bar already says which, so the
           word "שירים" over it would be the second name of the same page. */
        listHead.hidden = !shown.length || !!shelf;

        if (!shown.length) {
          if (!empty.parentNode) app.appendChild(empty);
          emptyText.textContent = kind ? "אין שירים בסגנון הזה."
            : only ? "אין שירים בתווית הזאת."
            : "עוד אין שירים כאן.";
          emptyActions.hidden = !!only || !!kind;
          return;
        }
        if (empty.parentNode) empty.remove();

        shownNow = shown;
        if (allBtn) {
          /* All of them, none of them, or the third state a checkbox has for
             exactly this: some. It is not a value anybody can type in, it is
             only ever set from here, and it is the truth about the wall. */
          var allOn = allShownPicked();
          allTick.checked = allOn;
          allTick.indeterminate = !allOn && shown.some(function (s) { return picked[s.id]; });
          allBtn.title = allOn ? "ביטול הסימון של כל מה שמוצג" : "סימון כל מה שמוצג";
          allTick.setAttribute("aria-label", allBtn.title);
        }
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
          paint();
          /* The bands are made of the songs too: a song that just took a style
             is a shelf that may not have existed a moment ago. They are not in
             paint(), because pressing a state chip narrows the SONGS and has
             nothing to say about who wrote them. */
          paintBands();
          poll();
        }).catch(function () { /* a failed refresh is not worth a red screen */ });
      }

      paintBands();
      paint();
      poll();
      /* And it starts again when the page is uncovered, because leaving it
         ended it: a list out of the document stops asking. */
      state.wake = poll;

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
    where("שירים שנמחקו");
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
    /* A tag that has nothing more to say says nothing more. Handed `why`
       whatever it was would put the word "undefined" under the pointer. */
    if (why) node.title = why;
    return node;
  }

  /* `extra` is whatever the PAGE has to say about this song that the song
     does not say about itself. There is one page that does: a creator's, where
     every card has to say which of the two things this person did on it. It
     goes in the same corner as the state, because it is the same kind of fact,
     a word about the song rather than a word of it. */
  function songRow(s, refresh, mark, pick, extra) {
    var li = el("li");

    /* IN THE CARD'S CORNER, AND NOT IN THE CARD. It looks like it is inside,
       and in the DOM it is a sister of the card, laid over the gutter the card
       leaves for it.

       Which is not tidiness, it is the only way it works. The card is a link,
       so a box inside it is a box the browser also treats as a click on a
       link. Cancelling that cancels the tick with it: an input's checked state
       is flipped BEFORE the click is dispatched and put back if the click is
       cancelled, so a handler that cancels and re-flips by hand ends exactly
       where it started, which is how ticking a song stopped working at all.
       Outside the link there is nothing to cancel. */
    var holder = null;
    if (pick) {
      li.classList.add("can-pick");
      holder = el("label", "pick");
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

      /* The name, and UNDER it whoever made it, the way the song's own page
         says it under the name in the bar. Beside it, the two shared the width
         of a card with the price and with each other: a long name and a long
         name are one line that wraps in the middle of somebody, and which of
         the two lines was the song was left to the weight of the letters.
         A card is read down. The song, then who wrote it, then what it is to
         play, each on its own line and always in that order.

         Bare names, no labels, separated by commas: whoever wrote the words
         usually wrote the tune, and a card is not asked which is which, it is
         asked whose song this is. */
      var top = el("div", "t-row");
      top.appendChild(name());

      /* What the machine charged to read this one, beside the name. It rode at
         the end of the chords for a while, where it was the last thing on a row
         of pink and read as one more chord; up here it is next to the only
         other thing on the card that is about the song rather than about
         playing it. Quiet, because it is worth knowing and it is not what the
         card is for, and only for the account that pays it. */
      var paid = price(s);
      if (paid) {
        var cost = el("span", "cost", paid);
        cost.title = priceWhy(s);
        top.appendChild(cost);
      }
      /* The kinds of song are NOT on the card. They are on nearly every card
         and they are the same two or three words on all of them, so as a label
         they say almost nothing and as ink they are a line of every card. What
         they are good for is narrowing the library, and that is what the row
         of them over the wall does. */
      box.appendChild(top);

      var by = creditNames(s);
      if (by.length) box.appendChild(el("div", "by", by.join(", ")));

      /* Under the name goes what you actually want to know before opening a
         song: whether you can play it.

         In the order the song reaches them, so the first is the one it opens
         on, and read right to left like everything else on the page. Each name
         keeps its own direction (see .k), which is what stops "G/B" flipping
         inside itself. */
      /* THE SHAPES, AND NOT WHERE TO CLAMP. The easy version is worked out
         from a capo, and the card used to say which fret it assumed; it is a
         guess about somebody else's hands, and where the capo actually goes is
         a fact about the player that the song page now carries. What the card
         is for is "can I play this", and the answer to that is the shapes. */
      /* And in the key the song will actually open in, which for anybody who
         has moved it is the one they moved it to. The row is the page's own
         promise, so it is made from the same answer (see shapesFor). */
      var mine = shapesFor(s);
      if (mine.shapes.length) {
        var keys = el("div", "keys");
        keys.title = "השיר עצמו: " + mine.used.join("  ");
        mine.shapes.forEach(function (shape) { keys.appendChild(el("span", "k", shape)); });
        box.appendChild(keys);
      }

      /* A song still in the machine says which stage it reached, and a
         finished one may carry a note about what did not come off the page.
         The same column, two different things, so two different shapes: the
         stage is a chip in the colour of the state it belongs to, because it
         IS that state saying more about itself, and the note is the quiet
         box the app uses for what went wrong. */
      if (s.status_note) {
        if (busy) {
          var stage = el("div", "keys");
          stage.appendChild(el("span", "tag tag-imported", s.status_note));
          box.appendChild(stage);
        } else {
          box.appendChild(el("div", "detail", s.status_note));
        }
      }

      a.appendChild(box);

      /* --- the far column: what state it is in, and when it last changed ------
         Both are ABOUT the song rather than in it, and neither is what the card
         is for, so they stand at the far end where the eye goes only when it is
         asking. Beside the name they were competing with it: a label is short,
         loud and never the thing you are looking for when you are looking for
         a song.

         The state at the TOP of that end and the date at the BOTTOM, which
         gives the card its four corners: the tick where you choose, the name
         where you read, the state where you sort, the date where you last
         left off. */
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
      (extra || []).forEach(function (t) { tags.appendChild(tag(t.kind, t.words)); });
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

  /* --- THE TWO OTHER WAYS INTO THE LIBRARY -----------------------------------
     Over the songs stand the styles and then the people, each a band of cards
     of its own. Both were pages you could only reach by typing their name into
     the box, which is a fine way to reach a thing you already know the name of
     and no way at all to find out what the library has: "what kinds of song
     are here" and "whose songs are here" are the two questions somebody opens
     a library with, and until now the page answered neither.

     They are the SAME CARD the songs below them are, because they are the same
     gesture: a name, how much of it there is, and a page behind it. What they
     are not is a wall. A wall is what you scroll; these are read across in one
     look, so they stand in the middle of the page and stop where they stop
     (see .list.band). */
  function wall(title, rows) {
    var box = el("section", "band");
    box.appendChild(el("h2", "band-h", title));
    var ul = el("ul", "list band");
    rows.forEach(function (row) { ul.appendChild(row); });
    box.appendChild(ul);
    return box;
  }

  /* A style is a shelf, and a shelf is a page: /style/<name> is the library
     narrowed to one kind of song, and this is the card that opens it. */
  function shelfRow(name, n) {
    var li = el("li");
    var a = el("a");
    a.href = BASE + "/style/" + encodeURIComponent(name);
    a.addEventListener("click", function (event) {
      event.preventDefault();
      go(a.getAttribute("href"));
    });

    var box = el("div");
    var top = el("div", "t-row");
    top.appendChild(el("div", "t", name));
    top.appendChild(el("div", "by", songsSaid(n)));
    box.appendChild(top);
    a.appendChild(box);

    li.appendChild(a);
    return li;
  }

  /* The same width the stylesheet calls narrow, asked in JavaScript, because
     one of the things that changes at this width is not a style: below it the
     song cannot be edited at all. Keeping the number in both places would be
     two numbers waiting to disagree, so this one is the copy that is commented
     as one (see the media queries in style.css). */
  var NARROW = window.matchMedia("(max-width: 620px)");

  /* --- WHO WROTE THE SONGS --------------------------------------------------
     Two pages, and they are the same wall of cards the library is, because
     they are the same kind of question: what is on the shelf.

       /creators          everybody the library has a name for
       /creator/<name>    one of them, and everything they wrote

     Neither of them is a table (see creatorsOf). A person here is what the
     songs say about who made them, gathered up on the way out, so nothing can
     ever be a person with no songs or a song by nobody. */

  /* `brief` is a card standing in a row of its own kind rather than on a page
     of nothing else: on the library, where the people are one band across the
     top and the songs are what the page is for, the names of their songs would
     be four lines of song titles over the songs themselves. */
  function creatorRow(person, brief) {
    var li = el("li");
    var a = el("a");
    a.href = BASE + "/creator/" + encodeURIComponent(person.name);
    a.addEventListener("click", function (event) {
      event.preventDefault();
      go(a.getAttribute("href"));
    });

    var box = el("div");
    var top = el("div", "t-row");
    top.appendChild(el("div", "t", person.name));
    top.appendChild(el("div", "by", songsSaid(person.songs.length)));
    box.appendChild(top);

    /* The songs by name, the way an evening shows what is in it and for the
       same reason: a count is a number you have to open the page to use, and
       the names are the answer to "is this the person I meant". Cut to two
       lines by the stylesheet, so somebody with forty songs is still a card. */
    if (!brief) {
      box.appendChild(el("div", "a names", person.songs.map(function (song) {
        return song.title || "בלי שם";
      }).join("  •  ")));
    }
    a.appendChild(box);

    /* WHICH OF THE TWO THEY ARE, in the corner a song keeps its state in.
       Somebody who did both carries both, in the order the credits are
       written in. */
    var side = el("div", "side");
    var tags = el("div", "side-tags");
    roleTags(person.roles).forEach(function (t) { tags.appendChild(tag(t.kind, t.words)); });
    side.appendChild(tags);
    a.appendChild(side);

    li.appendChild(a);
    return li;
  }

  /* --- CALLING SOMEBODY SOMETHING ELSE --------------------------------------
     A person has no row to edit, so renaming one is renaming them on every
     song that credits them. Which is the thing this shape of data costs, and
     the thing it should therefore make cheap: two spellings of one person are
     two people here (see creatorsOf), and until now the only cure was opening
     a dozen songs and fixing each by hand.

     It writes the name into whichever of the two credits held the old one, on
     each song separately, and it does not touch the songs themselves: a
     credit is a fact about who made a song, not a word of it.

     WHAT IT CANNOT DO IS SOMEBODY ELSE'S SONG. Only the account that owns a
     song may write to it, which the database enforces and this cannot talk
     its way around, so the answer says how many rows actually took it rather
     than claiming the lot.

     Renaming somebody to a name the library already has MERGES the two, and
     that is not a mishap, it is the commonest reason to do this at all. */
  function renameCreator(was, now) {
    var songs = songsBy(state.songs || [], was);
    var done = 0;

    return Promise.all(songs.map(function (song) {
      var patch = {};
      CREDITS.forEach(function (c) {
        if (String(song[c.field] || "").trim() === was) patch[c.field] = now;
      });
      if (!Object.keys(patch).length) return null;
      return db.update(song.id, patch).then(function () {
        done++;
        /* the row in hand follows the write, so nothing on the page is
           reading a name the database no longer holds */
        Object.keys(patch).forEach(function (field) { song[field] = now; });
      }).catch(function () { /* counted by not being counted */ });
    })).then(function () { return done; });
  }

  function viewCreators() {
    where("יוצרים");
    setBusy("טוען יוצרים");

    db.list().then(function (songs) {
      seedSongs(songs || []);
      app.innerHTML = "";

      var people = creatorsOf(songs || []);
      if (!people.length) {
        var box = el("div", "center");
        box.appendChild(el("p", null, "עוד אין שם של אף אחד על שיר. מי כתב את המילים ומי הלחין נכתבים בתוך השיר עצמו, ומכאן הם נאספים."));
        box.appendChild(button("לרשימת השירים", ICON.back, "ghost", function () { go(BASE + "/"); }));
        app.appendChild(box);
        return;
      }

      var list = el("ul", "list");
      people.forEach(function (person) { list.appendChild(creatorRow(person)); });
      app.appendChild(list);
    }).catch(fail);
  }

  function viewCreator(name) {
    name = String(name || "").trim();
    where(name || "יוצר");
    setBusy("טוען שירים");

    db.list().then(function (songs) {
      seedSongs(songs || []);
      state.songs = songs || [];
      var mine = songsBy(songs || [], name);
      app.innerHTML = "";

      /* A name nobody is credited with is not a page. It is almost always a
         name that has since been corrected on the one song that carried it,
         and the way out is the list of the names that do exist. */
      if (!mine.length) {
        var gone = el("div", "center");
        gone.appendChild(el("p", null, 'אין שירים על שם "' + name + '".'));
        gone.appendChild(button("לרשימת היוצרים", ICON.back, "ghost", function () { go(BASE + "/creators"); }));
        app.appendChild(gone);
        return;
      }

      /* THE NAME IS IN THE BAR, AND IT IS THE FIELD FOR IT. A person is not a
         row anywhere, so this is the only place they are called anything: what
         is typed here is written onto every song that credits them.

         Only for somebody signed in, because only they can write a song at
         all. A visitor reads the name.

         It commits when the typing is finished rather than on the keystroke,
         which is not a nicety: every letter would otherwise be a write to a
         dozen rows and a new address for the page. */
      if (auth.in) {
        whereEditable(name, "שם היוצר", null, function (next) {
          if (!next || next === name) return where(name);
          renameCreator(name, next).then(function (done) {
            if (!done) return toast("לא הצלחנו לשנות את השם", true);
            toast(done === 1 ? "השם שונה בשיר אחד" : "השם שונה ב-" + done + " שירים");
            /* the address is the name, so it moves with it */
            go(BASE + "/creator/" + encodeURIComponent(next));
          });
        });
      }

      /* The head is for paper only. On screen the name is in the bar and the
         rest of the head said things the list under it already says: what this
         person did is the tag on each card, and how many songs there are is
         how many cards there are. In print the bar is gone, so the page still
         needs its name (see .on-paper). */
      var head = el("div", "song-head");
      head.appendChild(el("h1", "on-paper", name));
      app.appendChild(head);

      var list = el("ul", "list");
      mine.forEach(function (song) {
        list.appendChild(songRow(song, function () { viewCreator(name); }, null, null,
          roleTags(rolesOn(song, name))));
      });
      app.appendChild(list);
      tick(list);
    }).catch(fail);
  }

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

  /* `past`, when it is there, means this is not the song but a version of it:
     {song, version}, the row in the library and the one on the shelf. The page
     is the same page, drawn from the older words, and it CANNOT BE EDITED. Not
     as a precaution: an editor here would write today's row from yesterday's
     song without anybody asking for it, and the way to do that on purpose is
     the restore button in the band at the top. */
  function renderSong(song, past) {

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

    var editing = !past && auth.in && (!onPhone || !!state.editOnPhone);

    /* Now there is something on the page to print, and, on a phone, a way into
       the editor and back out. Both are about the page you are on, so both are
       in the top bar with the rest of those, and both are pictures: a pencil
       to go in and a tick to come out.

       LEAVING IS SAFE, so nothing asks. The song writes itself, and whatever
       is still on the clock goes out on the way. */
    /* THE SONG IS THE PAGE. Said on the body, because what it changes is the
       shape of everything around the sheet: no gutters, no card, no air over
       it. See body.on-song in the stylesheet. */
    document.body.classList.add("on-song");
    /* A WINDOW DRAGGED ACROSS THE NARROW LINE IS A DIFFERENT PAGE. Whether
       this song is open for writing is decided here, once, from the width at
       the moment it was drawn: a page opened wide is the editor, and dragged
       narrow it stayed the editor, on a screen where the editor was never
       meant to be. Which is not only a wrong shape. The editor does not break
       its lines, because a broken row is not a line you can type into, so
       what it left on a phone was a song running off both edges of the glass.

       Only the bar was repainted when the line was crossed. The song is drawn
       again now, and it comes back as whichever of the two that width means. */
    state.redrawSong = function () { renderSong(song, past); };
    state.printable = true;
    /* Not on a version: there is nothing here to go into. */
    if (!past && auth.in && onPhone) {
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

    /* TWO NUMBERS, AND THEY ARE NOT THE SAME NUMBER, but they are about the
       same thing: this reader and this song (see keptFor).

       The transposition moves the chords on the page. It opens where they left
       it last time, and failing that on the easy version, which is where the
       library row said it would be.

       The capo moves nothing. It is a note about the hand: which fret this
       person clamps at to play this one, kept beside the key they play it in.

       They were one number for a while: the song opened transposed down to
       whatever fret made its chords easiest, and the sheet called that number
       the capo. It reads well and it is a guess about somebody else's hands,
       and worse, it meant "where is my capo" changed every time anybody moved
       the song a semitone. The song still opens on the easy version. It is
       just not called a capo any more, and nothing on the page pretends to
       know where their hand is.

       A song still coming out of the machine, or read out of one and not yet
       checked, gets nothing worked out for it at all (see openKey). */
    var myCapo = keptCapo(song.id);
    var semis = openKey(song);

    /* the size follows the reader from song to song. The key does not: it
       belongs to the one song it was chosen for. */
    var size = readingSize();

    app.innerHTML = "";

    /* --- the head: the name, and who made it ---

       No arrow back to the list. The app's name in the bar above is the way
       home on every page, and a second one next to the title only says the
       same thing twice. */

    var head = el("div", "song-head");

    /* THE NAME IS IN THE BAR. It was a heading here, thirty pixels of it, and
       the bar over it said what app you were in; now the bar says which song
       this is, which is the one thing about the page that is worth carrying
       down it as you scroll. The heading is kept for paper, where there is no
       bar to carry anything.

       A version is read and not written, so its name is a name and not a
       field. Everything else about a version says the same. */
    var title = el("h1", "on-paper", song.title);

    if (past || !editing) {
      where((past ? "גרסה של " : "") + (song.title || "שיר חדש"));
    } else {
      whereEditable(song.title, "שם השיר", function (typed) {
        song.title = typed;
        title.textContent = typed;
        /* the tab follows the name as it is typed, since the tab IS the name */
        document.title = (typed || "שיר חדש") + " | אקורדים";
        mark();
      });
      document.title = (song.title || "שיר חדש") + " | אקורדים";
    }

    /* What the head still carries: whatever the song has to say about itself,
       at the end of the line the name used to start. */
    var headTop = el("div", "head-top");
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
    /* --- ONE STRIP, AND THE SONG UNDER IT -------------------------------------
       There were three rows here: who wrote it, what kind of song it is, and
       the three dials, one under the other, and together they took a third of
       the screen before a word of the song. Which is the wrong trade twice
       over: none of them is what the page is FOR, and two of the three are
       filled in once and then read at a glance for the rest of the song's
       life.

       So it is one row. The facts of the song at the start of it, the three
       controls at the end, and the song directly underneath.

       THE FIELDS ARE NOT ON IT AND NOT ON THE PAGE. Pressing the facts opens
       them in a panel over it: a form is what you want for the ten seconds you
       are filling it in and never again, so it costs nothing at all for the
       rest of the song's life and moves nothing while it is open. What stands
       in its place is the same information as a sentence, which is what
       anybody wants of it after. */
    var strip = el("div", "song-strip");
    var facts = null;
    var meta = null;
    /* the panel the form is opened in, built at the end of it */
    var metaPanel = null;

    if (editing) {
      /* Who wrote it, on the song itself. It belongs to it and there is no
         other page to keep it on any more. */
      meta = el("div", "song-meta");

      /* THE WORD, WITH THE MARK THE READER SEES IN ITS PLACE. The strip above
         this form says a credit as a pen or a note and a name, and so does the
         line under the title on the page people play from. Saying it here as a
         bare word would make the form a third way of saying the same fact, so
         it is the same pair: the mark, then the word, in a column the width of
         the longest of the three. */
      byFields = CREDITS.map(function (c) {
        var label = el("label");
        var word = el("span", "meta-word");
        /* The mark is not carrying the word here, the word is right beside it,
           so it is the one place the pen and the note are decoration and are
           allowed to be hidden from a reader who is being read to. */
        word.appendChild(svg(ICON[c.icon]));
        word.appendChild(el("span", null, c.label));
        label.appendChild(word);
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
         takes several and so does "לחן". With a mark in front of it like the
         two above, because it is one more fact about the song and the row
         should not look like a different kind of row. */
      var kindsLabel = el("div", "meta-word");
      kindsLabel.appendChild(svg(ICON.tag));
      kindsLabel.appendChild(el("span", null, "סגנון"));
      /* The styles and the field that adds one, held together: they wrap
         between themselves and never take the word onto a second line with
         them, which is what used to happen the moment a song had two styles. */
      var kindsBody = el("div", "kinds-body");
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

      kindsBody.appendChild(kindsList);
      kindsBody.appendChild(kindsInput);
      kindsRow.appendChild(kindsLabel);
      kindsRow.appendChild(kindsBody);
      kindsRow.appendChild(kindsKnown);
      meta.appendChild(kindsRow);

      /* THE PANEL THE FORM OPENS IN. Built here, with the form, and put on the
         page shut: a dialog that nobody has opened draws nothing, and keeping
         it on the page is what lets the two lists of suggestions fill
         themselves in the background before anybody asks for them.

         Escape shuts it, which is a dialog's own doing, and so does the dark
         behind it: the panel has no unsaved anything in it, so every way of
         saying "done here" is allowed to be one. */
      metaPanel = el("dialog", "dlg dlg-meta");
      var metaBox = el("div", "dlg-in");
      metaBox.appendChild(el("h2", null, "מי כתב, ואיזה סוג"));
      /* Why there is no save button on a panel full of fields. One line, said
         once, under the question the panel is asking: without it the only
         button here reads as the one that keeps the typing, and somebody who
         leaves by the dark behind the panel is left wondering what they lost.
         Nothing, is the answer. */
      metaBox.appendChild(el("p", "muted", "נשמר תוך כדי הכתיבה."));
      metaBox.appendChild(meta);
      var metaDone = el("div", "dlg-actions");
      metaDone.appendChild(button("סיום", null, "ghost", function () { metaPanel.close(); }));
      metaBox.appendChild(metaDone);
      metaPanel.appendChild(metaBox);
      /* The dark behind it. A press lands on the dialog itself only where the
         panel is not, which is exactly there. */
      metaPanel.addEventListener("click", function (event) {
        if (event.target === metaPanel) metaPanel.close();
      });
      /* A style left half typed in the field is a style somebody meant: the
         way out of the panel counts as having finished saying it, the same as
         walking out of the field does. */
      metaPanel.addEventListener("close", function () {
        addKind();
        facts.classList.remove("is-open");
      });

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
      /* It is put in the top bar further down, with the rest of what is about
         the page rather than about the song: what state it is in, how the
         writing is going, and the ways back. */

      showState = function () {
        var was = songState();
        statusChip.className = "status-chip tag tag-" + was;
        /* and while it is being read, what it is doing: the state saying more
           about itself, in the state's own chip */
        var stage = coming && song.status_note ? "  ·  " + song.status_note : "";
        statusChip.textContent = STATE_WORDS[was] + stage;
        statusChip.title = was === "published"
          ? "השיר פתוח לכולם. כל שינוי בו מחזיר אותו לטיוטה."
          : was === "imported"
          ? "השיר נקרא עכשיו מתוך הקובץ. לחיצה מאפשרת לבטל."
          : "לחיצה מפרסמת את השיר: רק שיר מפורסם נפתח למי שלא כתב אותו.";
      };
      showState();

      /* WHAT THE FORM SAYS, WITH THE FORM SHUT. The same facts, as a line to
         read rather than a grid to fill: the names, the kinds, and nothing
         where there is nothing.

         IN THE SHAPE THE READER'S PAGE USES, which is a picture and a name for
         each of them (see credits below). It was one line of names run
         together with a comma, and that line cannot say which of the two each
         name is: whoever wrote the words is rarely the one who wrote the tune,
         and the pen and the note say which is which in the room a comma took.
         One shape for the same fact, read or written.

         A song that has none of them says what is missing instead, because an
         empty strip is a strip that looks like it has nothing behind it. */
      facts = el("button", "song-facts");
      facts.type = "button";

      var showFacts = function () {
        facts.textContent = "";
        var said = credits(song);
        var kinds = styles(song);
        if (!said.length && !kinds.length) {
          facts.appendChild(el("span", "song-facts-ask", "מי כתב, ואיזה סוג"));
        } else {
          said.forEach(function (c) {
            var one = el("span", "credit");
            one.appendChild(creditMark(c));
            one.appendChild(el("span", null, c.name));
            facts.appendChild(one);
          });
          kinds.forEach(function (name) {
            facts.appendChild(el("span", "tag tag-style", name));
          });
        }
      };

      /* --- AND THE FORM IS A PANEL, NOT A ROW OF THE PAGE ---------------------
         It used to open in place, under the strip, which is the whole width of
         the screen spent on three fields: on a desk they stood in a line so
         long that "מילים" and its own field were half a metre apart, and on a
         phone they pushed the song off the bottom of the screen to say what a
         button above them already said.

         So it opens over the page instead, at the width a form of three fields
         wants, and it is the same panel on both. What is behind it does not
         move at all, which is the other half of it: filling this in is ten
         seconds spent on something that is not the song, and the song should
         be exactly where it was when those ten seconds are over.

         There is no save button on it. Every field writes into the song as it
         is typed, the same as everything else in this editor, so the only
         thing left to do is to be finished. */
      facts.addEventListener("click", function () {
        facts.classList.add("is-open");
        metaPanel.showModal();
        if (byFields[0]) byFields[0].focus();
      });

      /* The line is the form's own reflection, so everything that writes into
         the song writes into it too. */
      var wasShowStyles = showStyles;
      showStyles = function () { wasShowStyles(); showFacts(); };
      byFields.forEach(function (input) {
        input.addEventListener("input", showFacts);
      });
      showFacts();
    } else {
      /* Reading it, the credits are a sentence rather than a form, and it
         matters which is which: whoever wrote the words is rarely the one you
         heard sing them.

         A name that is not known is not written down: an empty field is a
         question the reader was not asked, and a song whose credits are both
         empty says nothing here at all. Which is why this is a sentence and not
         a form: a form has to show the rows it has no answers for, and a
         sentence simply leaves them out.

         AND IT GOES UNDER THE NAME OF THE SONG, not on the strip beside the
         chips. It stood there among what the song is and what state it is in,
         which is a row of four things of four different kinds, and only one
         of them belongs to the name: who made this is the second line of the
         title and reads as one. Small, quiet, and with a picture where the
         label was, because at that size "מילים:" costs more room than the
         name it introduces. */
      facts = el("div", "song-facts is-read");
      whereUnder(credits(song).map(function (c) {
        var one = el("span", "credit");
        one.appendChild(creditMark(c));
        one.appendChild(el("span", null, c.name));
        return one;
      }));

      /* WHAT KIND OF SONG IT IS DOES NOT BELONG ON THE SONG. A style is how the
         library is sorted: it is the answer to "what else is like this", and
         the whole of its use is on a page listing songs, where it tells one row
         from the next. On the song itself there is no next row. You already
         know which song you opened, and a chip saying "שירי מעגל" over it tells
         a reader who is about to play it nothing they can use.

         It is still set from here, on the same line with the editor open, where
         it is the form's own reflection and not a decoration.

         The draft mark stays, because it is not a label about the song but
         something to know before playing from the page: this one is not
         finished. */
      facts.appendChild(el("span", "tag tag-" + songState(), STATE_WORDS[songState()]));
    }

    app.appendChild(head);

    /* What the machine could not do, said on the song rather than instead of
       it. A read whose chords ran out of room still lands here with its words,
       and a read that failed altogether lands here with nothing but its name,
       and in both cases the page is the same page and the note is the whole of
       the difference. Saving clears it, because saving makes it untrue. */
    /* Only for a song that is finished. While one is still being read its note
       is which stage the reading reached, and that belongs to the state: it
       goes in the chip (see showState), the way it goes in the chip on the row
       in the library. A band across the page saying "מפענח" is the width of a
       sentence spent on one word. */
    if (song.status_note && !coming) app.appendChild(el("div", "song-note", song.status_note));

    /* A version says so at the top of itself, because everything under it looks
       exactly like the song and is not it. The things worth doing from here are
       in the band rather than under the sheet: the sentence and the answer to
       it belong together, and a long song would put them a screen apart. */
    if (past) app.appendChild(pastBand(past, flipDiff));

    /* --- the same sheet, with what changed marked on it ------------------------
       Not a second page and not two songs side by side. The version is already
       drawn, so what the marks add is the lines that are NOT in it: the ones
       the version before had and this one does not, put back where they stood,
       struck through. Everything else keeps its place, which is the point. A
       song read next to another song is two things to read; a song with the
       departed lines standing in it is one.

       It is off until it is asked for. What a version is, first, is the song
       as it went out, and that is what somebody opening one came to see. */
    var showingDiff = false;
    var ownLines = null;

    function flipDiff() {
      if (!past || !past.before) return false;
      if (!ownLines) ownLines = song.lines;
      showingDiff = !showingDiff;
      song.lines = showingDiff
        ? diffLines(normalizeLines(past.before.lines, past.before.dir), ownLines).map(function (op) {
            /* A copy for anything marked, because the mark is about this
               drawing and not about the line: the version's own lines are
               handed back untouched the moment the marks come off. */
            if (op.mark === "same") return op.line;
            return {
              type: op.line.type, text: op.line.text, chords: op.line.chords,
              dir: op.line.dir, mark: op.mark,
            };
          })
        : ownLines;
      draw();
      return showingDiff;
    }

    /* A band used to sit here saying the song had been read by a machine and
       not by a person, with a button to take the label off. Both are the
       status chip's job now: it says לסקירה, and touching the song or
       publishing it is what takes it off. One fact, one place. */

    /* --- the tools, at the far end of the same row --- */

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

      /* The picture and then the number, in the order they are read: what it
         is, and what it is at. They stood one over the other while this row
         was a row of its own; the row is a strip beside the song's own facts
         now, and a stacked pair is twice the height of the tallest thing that
         has any business being here. */
      var dial = el("span", "dial");
      var lbl = el("span", "lbl");
      lbl.appendChild(svg(icon));
      lbl.title = label;
      lbl.setAttribute("aria-label", label);
      dial.appendChild(lbl);
      if (valueNode) dial.appendChild(valueNode);
      ctl.appendChild(dial);
      /* THE TWO OF THEM IN ONE BOX. They were two bordered squares with air
         between them, which is two of everything a stepper needs one of, and
         three controls' worth of that is most of a phone's row. Joined, they
         read as the one thing they are, and the row fits.

         Side by side rather than stacked, and less before more, which right to
         left is less on the right: the height of the strip is the height of
         this pair, and this pair is the only thing on it that was ever two
         things tall. */
      var steps = el("span", "steps");
      steps.appendChild(iconBtn('<path d="M5 12h14"/>', "פחות " + label, less));
      steps.appendChild(iconBtn(ICON.plus, "יותר " + label, more));
      ctl.appendChild(steps);
      return ctl;
    }

    /* --- THE KEY IT IS PLAYED IN -----------------------------------------------
       Two buttons and no number. The number said how far the page was from a
       key nobody can hear, and the answer to "which key am I in" was already on
       the page, in the chords, in letters twice the size. A nought beside the
       picture was worse than nothing: a count of a distance from a place the
       reader never asked about.

       There is nothing to press it into place with either. Making the key on
       screen the song's own was a button behind that number, for a decision
       that turns out not to need making: what the song is stored in is a
       detail of the file now, and what each person plays it in is kept for
       each person (see keptKey). Nobody has to agree with anybody. */
    tools.appendChild(control(
      ICON.pitch, "טרנספוזיציה", null,
      function () { moveSemis(-1); },
      function () { moveSemis(1); }
    ));

    /* THE SIZE IS NOT HERE ANY MORE. It was two buttons and a number, three
       things on a strip whose whole point is to be short, for a setting with
       one honest answer: bigger, until it is big enough. And every machine
       already has a gesture that means exactly that. See zoomBy below. */

    /* WHERE THE CAPO GOES ON THIS SONG, WHICH IS WHEREVER THEY PUT IT. It
       moves nothing on the page: what the chords say is the transposition's
       business, and this is a note about the hand that plays them.

       A fret, so zero or up, and zero means no capo, which is a real answer
       and the usual one. It is kept for this reader and this song, beside the
       key, because it is the same kind of answer: this is how I play THIS.

       Only for somebody signed in, which is the one thing the two numbers do
       not share. The key changes the page and everybody gets it; a fret is a
       note somebody keeps for themselves, and there is nobody to keep it for
       until there is somebody. */
    var myValue = null;
    if (auth.in) {
      tools.appendChild(el("span", "sep"));
      myValue = el("span", "val");
      var mine = control(
        ICON.capo, "קפו", myValue,
        function () { setMyCapo(myCapo - 1); },
        function () { setMyCapo(myCapo + 1); }
      );
      mine.title = "באיזה סריג הקפו שלכם בשיר הזה. נשמר לכם, לשיר הזה.";
      tools.appendChild(mine);
      showMyCapo();
    }

    function showMyCapo() {
      if (myValue) myValue.textContent = String(myCapo);
    }

    /* Kept where the key is kept, in this browser, under this reader and this
       song: one press, one write, no network to wait on. */
    function setMyCapo(next) {
      myCapo = Math.max(0, Math.min(next, MAX_CAPO));
      showMyCapo();
      keepFor(song.id, "c", myCapo);
    }


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
    var revertBtn = iconBtn(ICON.rewind, "החזרה למקור", revert);
    revertBtn.classList.add("quiet");
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
      /* THE DOOR APPEARS WHEN THERE IS A ROOM BEHIND IT, the same way the way
         to the deleted songs does. A song nobody has published yet has no
         history, and a button leading to an empty page is a button that has to
         be pressed to find that out. The answer comes back after the bar is
         painted, so the button is made hidden and shown when it is earned. */
      if (song.id) {
        var pastBtn = iconBtn(ICON.history, "גרסאות שפורסמו", function () {
          flush();
          go(BASE + "/" + encodeURIComponent(song.slug) + "/versions");
        });
        pastBtn.classList.add("quiet");
        pastBtn.hidden = true;
        mine.push(pastBtn);
        versions.count(song.id).then(function (many) {
          if (!many || !pastBtn.isConnected) return;
          pastBtn.hidden = false;
          pastBtn.title = "גרסאות שפורסמו (" + many + ")";
          pastBtn.setAttribute("aria-label", pastBtn.title);
        });
      }
      mine.push(revertBtn, undoBtn, statusChip);
      mine.forEach(function (node) { topBar.insertBefore(node, topBar.firstChild); });
    }
    app.appendChild(strip);
    /* Shut, and a shut dialog is nothing on the page: no height, no row, no
       trace. It goes with the song when the page is redrawn, which is the
       whole of its cleaning up. */
    if (metaPanel) app.appendChild(metaPanel);

    /* And now they are handed over, to be put in whichever of the two places
       the screen can hold them (see placeControls). */
    state.songControls = { strip: strip, facts: facts, tools: tools };
    placeControls();

    /* The sheet used to carry a "קפו 3" chip of its own, from when the capo was
       worked out from the transposition and was a fact about the SONG. It is a
       fact about the player now, it is on the control that sets it, and a
       second copy inside the song was the same number twice: on screen it is
       an inch from its own control, and on paper it is a note about whoever
       printed the page rather than about the song on it. */
    var sheet = el("div", "sheet" + (editing && !coming ? " ed" : ""));
    sheet.style.setProperty("--song-size", size + "px");
    app.appendChild(sheet);

    /* THERE WAS A BAR HERE, and a way of marking whole lines to feed it: a
       drag across the words took the lines it crossed, painted them, and put
       up a floating row of buttons about them. Move, duplicate, copy, turn
       round, delete. It is gone, all of it.

       What it cost was the ordinary thing. Dragging across the words is how
       anybody selects part of anything, and this took that gesture away and
       answered with whole lines: what came back was never what was under the
       pointer, and there was no way to copy half a line, or two lines and the
       start of a third. So the gesture belongs to the browser again, it
       selects exactly the characters it crosses, and Ctrl+C hands back exactly
       those with the chords standing over them (see sheetToText). */

    /* There was a row of buttons under the sheet: a line at the end, a section
       heading, and marking every line. A line at the end is Enter at the end
       of the last line, which is where a hand already is, and the marking is
       gone with the bar above. */

    /* ONE FRAME, HOWEVER MANY DRAWINGS ASKED FOR IT. Laying the song out is
       not something that can be done twice: fitColumns takes the sheet apart
       to the rows STANDING ON IT, and after a pour those are pieces of lines
       and not lines, so a second run pours what is already poured. Every piece
       then looks like a whole line that fits, none of them is the leftover of
       a break any more, and the two lines that were sharing a line of the page
       come apart with no way back (see flowSheet, and unpage, which can flatten
       a pair but cannot rebuild the line it was made of).

       Two drawings in one frame is the ordinary case and not a corner: the
       page draws itself, and then the fonts land and it draws itself again
       (see relayoutOn). Both queued a frame, the first poured, and the second
       poured the first one's output. Which is why a song opened cold showed
       every leftover row standing alone, and the same song after a zoom, one
       drawing and one frame, showed them paired. */
    var framed = 0;

    /* The sheet's own direction is the song's, which is its first line's. It
       decides where the capo chip and the headings sit; each line inside says
       which way IT runs and is laid out by that alone. */
    function draw() {
      /* The frame the drawing before this one asked for was for rows that are
         about to stop existing, so it goes with them. */
      if (framed) { cancelAnimationFrame(framed); framed = 0; }
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

      /* Every row on screen is new, so the one that was being typed into is
         not one of them any more (see holdOff). */
      typing = null;
      song.lines.forEach(function (line, index) {
        sheet.appendChild(editing ? editRow(line, index) : viewLine(line, semis));
      });
      /* Breaking first and placing second, because a chord belongs to the row
         its syllable ended up on and there is no telling which that is until
         the words have been broken. */
      /* And the columns after the breaking and before the placing, for the
         same reason and in the same order: how many columns there are depends
         on how tall the song came out, and where a chord goes depends on
         which column its line landed in. */
      /* THE COLUMNS FIRST AND THE POURING SECOND, which is the opposite of the
         order it ran in while pouring was a thing that only happened on a
         phone. A line is broken to the width of the box it stands in, and
         until the columns are decided that box is the whole sheet.

         And the placing last, because a chord belongs to the row its syllable
         ended up on and there is no telling which that is until the words have
         been broken. */
      /* fitColumns owns the whole of it now: how wide a column is, the
         breaking of the lines to that width, and dealing them out into
         screenfuls. The placing is last, because a chord belongs to the row
         its syllable ended up on and there is no telling which that is until
         the words have been broken. */
      framed = requestAnimationFrame(function () {
        framed = 0;
        /* DEALING THE ROWS OUT MOVES THEM, and a row that is moved in the
           document takes the caret out of itself: the browser hands focus back
           to the page. So whoever asked for a caret before this frame (Enter,
           a join, a paste) gets it back after it, in the same character.
           Without this every key that redraws the song ends with the typing
           stopped and nothing on screen saying so.

           REMEMBERED AS A PLACE IN THE SONG, not as a node with a number in
           it. A line that has to be broken is not the row it was a moment ago:
           its row is gone and two poured ones stand where it was, so a caret
           kept as "this element, character nine" is a caret in an element
           nobody can see any more. Kept as "line four, character nine" it
           lands in whichever piece of line four holds character nine. */
        var host = typing && typing.isConnected ? typing : null;
        var index = host ? lineIndexOf(host) : -1;
        var caret = host ? caretAt(host) : null;
        fitColumns(sheet);
        layoutAll(sheet);
        if (index >= 0 && caret != null) focusLine(index, caret);
      });
    }

    /* ONCE THE TYPING STOPS, and not on the keystroke. A line that has grown
       past the segment it stands in has to be broken again and dealt out
       again, but that MOVES the rows, and moving the row being typed into
       takes the caret out of it: on every letter that is an editor that fights
       back. So it waits for a pause, and puts the caret back where it was.

       FROM THE SONG AND NOT FROM THE SCREEN. What is standing on the page
       while somebody types is pieces of lines, and pouring pieces again would
       be pouring what has already been poured. So the rows are made afresh out
       of the song, one whole line each, and broken from there: the same road
       Enter and a paste already take. */
    var settling = 0;

    /* SOON, WHERE WAITING WOULD HIDE THE WORDS. A page holds a segment's width
       and not a pixel more (see .page), so a row that has grown past its
       segment is a row whose last words are behind the edge of it: the very
       ones being typed. Half a second of that is half a second of typing
       blind, so when a row overflows the breaking follows the hand instead of
       waiting for it to stop. Not on the keystroke itself, because a fast
       hand would then redraw the song on every letter and the caret would be
       chasing the words. */
    function settle(soon) {
      clearTimeout(settling);
      settling = setTimeout(function () {
        if (!sheet.isConnected) return;
        var host = typing && typing.isConnected ? typing : null;
        var index = host ? lineIndexOf(host) : -1;
        var caret = host ? caretAt(host) : null;
        draw();
        if (index >= 0 && caret != null) focusLine(index, caret);
      }, soon ? 60 : 500);
    }

    /* Round, not against a wall. Past the top it comes out at the bottom and
       the other way about, so reaching a distant key is never a matter of
       pressing the other button eleven times. */
    function setSemis(next) {
      semis = next > 11 ? -11 : next < -11 ? 11 : next;
      draw();
    }

    /* PRESSING IS CHOOSING. Whoever moves the song has just said where they
       play it, and they are the same person with the same voice and the same
       hands tomorrow, so it is kept and the song opens there next time. Kept on
       the press and not on the drawing, because the app draws its own guess at
       the easy version too, and a guess that writes itself down is a guess
       nobody can tell from an answer. */
    function moveSemis(by) {
      setSemis(semis + by);
      keepFor(song.id, "k", semis);
    }

    /* Bigger words fit in fewer places, so where the lines break is part of
       what the size changes. Drawn again rather than measured again, since the
       rows themselves are different rows. */
    function setSize(next) {
      size = readingSize(next);
      sheet.style.setProperty("--song-size", size + "px");
      /* Bigger words break in different places, so where the lines break is
         part of what the size changes. Drawn again rather than measured
         again, since the rows themselves are different rows: writing as well
         as reading, because the lines are broken there too now. */
      draw();
    }

    /* --- THE SIZE IS A GESTURE ------------------------------------------------
       On a desk it is the wheel with Ctrl held, which is also what a trackpad
       sends when two fingers spread on it: a browser reports a trackpad pinch
       as a wheel with ctrlKey set, so one handler is both. On a phone it is
       two fingers on the song.

       IT TAKES THE BROWSER'S OWN ZOOM AWAY, on purpose, and that is the better
       trade rather than a rudeness. Zooming the PAGE makes the words bigger
       and the screen no wider, so the lines of a chord sheet, which never
       wrap, run off the side of it. Zooming the SONG breaks them again to the
       screen they are on. The gesture already meant "make this bigger"; this
       is the only reading of it that works here.

       Nothing is written until the number actually changes. One turn of a
       wheel is dozens of events, and setSize redraws the whole sheet on a
       narrow screen. */
    /* ONE NOTCH OF A MOUSE WHEEL IS ABOUT A HUNDRED, so this is four steps a
       notch, and a trackpad, which sends a stream of small numbers rather
       than notches, accumulates over the same threshold. */
    var WHEEL_PER_STEP = 25;
    /* AND A STEP IS A PROPORTION, NOT A PIXEL. Two pixels is a third of the
       way up from thirteen and nothing at all at ninety, so a fixed step
       crawls at the top of the range exactly where somebody turning the wheel
       is trying to get somewhere. Six per cent a step is a quarter of a notch,
       which crosses the whole range in about eight turns and still lands
       where you meant at the small end. */
    var WHEEL_STEP_RATIO = 1.06;
    var wheeled = 0;

    sheet.addEventListener("wheel", function (event) {
      if (!event.ctrlKey) return;
      event.preventDefault();
      wheeled += event.deltaY;
      var steps = Math.trunc(wheeled / WHEEL_PER_STEP);
      if (!steps) return;
      wheeled -= steps * WHEEL_PER_STEP;
      /* down is smaller, which is what a wheel means everywhere else */
      var next = size * Math.pow(WHEEL_STEP_RATIO, -steps);
      /* At the bottom of the range a proportion of the size rounds back to
         the size, and a wheel that answers nothing reads as a broken one. */
      if (Math.round(next) === size) next = size - steps;
      setSize(next);
    }, { passive: false });

    /* How far apart two fingers are, which is the whole of a pinch: the size
       follows the RATIO against where they started, so letting go and starting
       again does not jump. */
    function spread(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    var pinchFrom = 0;
    var pinchSize = 0;

    sheet.addEventListener("touchstart", function (event) {
      if (event.touches.length !== 2) return;
      pinchFrom = spread(event.touches);
      pinchSize = size;
    }, { passive: true });

    sheet.addEventListener("touchmove", function (event) {
      if (event.touches.length !== 2 || !pinchFrom) return;
      event.preventDefault();
      var now = spread(event.touches);
      if (!(now > 0)) return;
      var want = Math.round(pinchSize * (now / pinchFrom));
      if (want !== size) setSize(want);
    }, { passive: false });

    var pinchOff = function () { pinchFrom = 0; };
    sheet.addEventListener("touchend", pinchOff);
    sheet.addEventListener("touchcancel", pinchOff);

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

    /* THE SONG'S OWN KEY IS NOT A DECISION ANY MORE. There was a menu behind
       the transposition's number, "ברירת מחדל", that wrote the chords as they
       were being shown into the song itself, so that everybody else would open
       it there too. Nobody needs to open it there: every reader gets the key
       they left it in, and a reader who has never touched it gets the one that
       is easiest to hold. What the file stores is what came off the page it was
       read from, and it can stay that way. */

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
        /* AND IT KEEPS WHAT WAS PUBLISHED. Not from here, from the row the
           save hands back: what goes on the shelf has to be what actually
           landed in the database, and a moment from now this page may already
           have been typed into again. */
        wantVersion = true;
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
       it was read from.

       IT IS CALLED `trail` AND NOT `history`, WHICH IS NOT A PREFERENCE. It was
       called history, and a local by that name covers the browser's own for the
       whole of this function: the save below writes the new song's address with
       history.replaceState, and it was reaching this array instead. The song
       landed in the database and the page said the save had failed, every time
       a song was written from nothing. */
    var saved = snapshot();
    var current = saved;
    var trail = [];
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
        if (!trail.length || when - lastPush > BURST) {
          trail.push(current);
          lastPush = when;
        }
        current = now;
      }

      revertBtn.hidden = now === saved;
      undoBtn.hidden = !trail.length;

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

      /* WHERE THE TYPING WAS. An undo that leaves nothing focused is an undo
         that has to be followed by a click before the next word can be typed,
         and the change it took back was almost always a word being typed. The
         line is remembered by its place in the song, because the line object
         itself is about to be replaced by one read back out of a string. */
      var host = typing && typing.isConnected ? typing : null;
      var where = host ? song.lines.indexOf(lineAt(host)) : -1;
      var caret = host ? caretAt(host) : null;

      song.title = body[0];
      CREDITS.forEach(function (c, index) { song[c.field] = body[1][index] || ""; });
      song.dir = body[2] || "rtl";
      song.lines = normalizeLines(body[3], song.dir);
      song.styles = tidyStyles(body[4]);
      song.draft = !!was[1];
      song.published = !!was[2];

      if (title.textContent !== song.title) title.textContent = song.title;
      byFields.forEach(function (input, index) { input.value = body[1][index] || ""; });
      /* WHAT THE CHIP SAYS IS PART OF THE STATE, and this line used to call
         something that no longer exists: it threw here, before the song was
         drawn, and every undo went nowhere. Nothing about the stack was wrong,
         which is why it looked so much like the stack. */
      if (showState) showState();
      if (showStyles) showStyles();

      draw();
      if (where >= 0 && song.lines.length) {
        focusLine(Math.min(where, song.lines.length - 1), caret == null ? 0 : caret);
      }
      /* the song is what it was, so what a change is measured against is what
         it was too: without this the restore itself reads as an edit and puts
         the draft mark straight back on */
      lastBody = songBody();
      current = snapshot();
      restoring = false;
      mark();
    }

    function undo() {
      if (!trail.length) return;
      restore(trail.pop());
    }

    function revert() {
      if (current === saved) return;
      trail.length = 0;
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
        if (!(event.ctrlKey || event.metaKey) || !pressed(event, "KeyZ", "z")) return;
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
       of the words and of the chords above them. Typing dismisses it.

       A QUESTION MARK HANGS UNDER IT, because this is the one thing in the
       editor that nobody arrives already knowing. Everything else here is a
       picture of a thing people have done before: undo, print, delete. An arc
       that appears under a word and pushes its letters apart is this app's own
       idea, and an idea gets one sentence offered at the moment it is on the
       screen, not a page somewhere that has to be gone looking for. */
    var gapOffer = null;

    function hideGap() {
      if (!gapOffer) return;
      gapOffer.remove();
      gapOffer = null;
      document.removeEventListener("pointerdown", gapOutside, true);
    }

    function gapOutside(event) {
      /* THE EXPLANATION IS NOT OUTSIDE. It is opened by one of these buttons
         and it covers the page, so a press on it, or on the dark behind it, is
         a press on this offer: dismissing the offer while somebody is reading
         what it does would leave them with nothing to press when they finish. */
      if (event.target && event.target.closest && event.target.closest("dialog")) return;
      if (gapOffer && !gapOffer.contains(event.target)) hideGap();
    }

    /* What the arc means, in the words of somebody who has just seen one and
       does not know what it is. Three things, in the order they matter: what
       it is for, that it is a mark and not ink, and that the word is still the
       word underneath it. */
    function explainGap() {
      var dlg = el("dialog", "dlg");
      var box = el("div", "dlg-in");

      /* THE MARK ITSELF STANDS AT THE TOP, beside its name. Somebody reading
         this got here by pressing a shape, and the first line of an
         explanation should be the shape they pressed: the arc on the button,
         the arc in the panel and the arc under the letters are one thing, and
         seeing them together is most of the explanation. */
      var head = el("div", "dlg-head");
      head.appendChild(svg(ICON.gap));
      head.appendChild(el("h2", null, "רווח מלאכותי"));
      box.appendChild(head);
      box.appendChild(el("p", null,
        "לשני אקורדים מעל מילה קצרה אין מספיק אותיות לשבת עליהן, והשני נדחף הצידה עד שהוא כבר לא מעל שום הברה. רווח מלאכותי פותח מקום בתוך המילה בדיוק בשביל זה: האותיות מתרחקות זו מזו על המסך, לאקורד יש איפה לעמוד, והמילה נשארת מילה אחת ולא נשברת לשתיים."));
      box.appendChild(el("p", null,
        "הקשת מתחת לאותיות היא הסימן שלו, והיא נראית רק כאן בעריכה. בדף שקוראים ממנו ובהדפסה אין שום סימן, יש רק את המקום."));
      box.appendChild(el("p", null,
        "והוא לא חלק מהמילה. החיפוש קורא את השיר בלי הרווחים האלה, ולכן מילה שנפתח בתוכה רווח עדיין נמצאת כשמחפשים אותה. כל לחיצה על הקשת פותחת רווח אחד, ולוחצים שוב כדי להרחיב."));

      var actions = el("div", "dlg-actions");
      actions.appendChild(button("הבנתי", null, "ghost", function () { dlg.close(); }));
      box.appendChild(actions);

      dlg.appendChild(box);
      document.body.appendChild(dlg);
      dlg.addEventListener("close", function () { dlg.remove(); });
      dlg.showModal();
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

      gapOffer = el("div", "gap-offer");

      /* the caret is the whole of where this will go, so a press on either
         button must not take it away first */
      var hold = function (node) {
        node.addEventListener("pointerdown", function (event) { event.preventDefault(); });
        node.type = "button";
        gapOffer.appendChild(node);
        return node;
      };

      var open = hold(el("button", "gap-btn gap-do"));
      open.title = "לפתוח רווח בין האותיות, בלי לשבור את המילה";
      open.setAttribute("aria-label", open.title);
      open.appendChild(svg(ICON.gap));
      open.addEventListener("click", function () { openGap(ln, line, editable, at); });

      var why = hold(el("button", "gap-btn gap-why"));
      why.title = "מה זה רווח מלאכותי";
      why.setAttribute("aria-label", why.title);
      why.appendChild(svg(ICON.help));
      why.addEventListener("click", explainGap);

      document.body.appendChild(gapOffer);

      var box = letter.getBoundingClientRect();
      var width = gapOffer.offsetWidth;
      var left = Math.min(Math.max(4, box.left + box.width / 2 - width / 2), window.innerWidth - width - 4);
      gapOffer.style.left = left + "px";
      gapOffer.style.top = (box.bottom + 2) + "px";

      document.addEventListener("pointerdown", gapOutside, true);
    }

    /* `at` is where the caret is IN THE ROW, because that is where the button
       was drawn; the room is opened at the matching character of the line. */
    function openGap(ln, line, editable, at) {
      var here = rowFrom(ln);
      var was = line.text;
      var next = was.slice(0, here + at) + gapRun() + was.slice(here + at);

      /* The same three steps typing takes, for the same reason: the chords are
         written onto the objects the handlers already hold, the caret is put
         back where the person left it, and the labels catch up with the model
         they name. The caret is handed to remapChords because a run of
         identical characters cannot be diffed: five gaps inserted anywhere in
         a line of gaps gives the same string. */
      var moved = remapChords(was, next, line.chords, here + at);
      line.chords.forEach(function (c, i) { c.pos = moved[i].pos; });
      line.text = next;

      ln.dataset.to = rowTo(ln, line) + GAP_RUN;
      shiftAfter(ln, line, GAP_RUN);

      fillSpans(editable, next.slice(here, rowTo(ln, line)));
      placeCaret(editable, at + GAP_RUN);

      syncChords(ln, line);
      layoutLine(ln);

      hideGap();
      mark();
      /* the line is that much wider, so it may break somewhere else now */
      settle();
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
    /* ONE ROW BUILDER, FOR A WHOLE LINE AND FOR A PIECE OF ONE. Given a piece
       it builds the row for that slice of the line: the characters from `from`
       to `to`, and the chords standing over them. Given none it builds the
       line, which is the same thing with a slice that happens to be all of it.

       That is why there is no second, read-only kind of row on a page being
       written. A line too long for its segment is broken, and each piece of it
       is a row of this kind: a caret in it is a caret in the song, at the
       character the arithmetic here says it is. */
    function editRow(line, index, piece) {
      var from = piece ? piece.from : 0;
      var to = piece ? Math.min(piece.to, line.text.length) : line.text.length;

      /* The same shrunken blank line the reader sees. It is still a full line
         to type into: the height is a floor, and the first character typed
         pushes past it. */
      var blank = line.type !== "section" && !line.text.trim() && !line.chords.length;
      var ln = el("div", "ln" + (line.type === "section" ? " is-section" : blank ? " is-blank" : ""));
      ln.dataset.index = index;
      if (piece) {
        ln.dataset.from = from;
        ln.dataset.to = to;
      }
      /* Which way this one runs, said on the row: it is what the browser lays
         the words out by and what every measurement here asks (see rowRtl). */
      ln.dir = dirOf(line, song.dir);

      if (line.type === "section") {
        var heading = el("div", "ln-section", line.text);
        holdOff(heading);
        heading.addEventListener("input", function () { line.text = heading.textContent; });
        heading.addEventListener("keydown", function (event) { lineKeys(event, line, heading); });
        ln.appendChild(heading);
      } else {
        /* The chords of this row are the ones standing over its own
           characters. A whole line claims all of them; a piece claims the ones
           between where it starts and where the next piece does, which is what
           keeps a chord over a word that moved to the row below from being
           drawn twice, or on the wrong row. */
        var lane = el("div", "ln-c");
        line.chords.forEach(function (chord) {
          if (piece && (chord.pos < piece.claimFrom || chord.pos >= piece.claimTo)) return;
          var node = chordEl(chord.chord, chord.pos - from, semis);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
        });

        /* an empty spot in the chord lane is where a chord is born */
        lane.addEventListener("pointerdown", function (event) {
          if (event.target !== lane) return;
          event.preventDefault();
          var chord = { pos: posFromX(ln, event.clientX) + rowFrom(ln), chord: "" };
          line.chords.push(chord);
          var node = chordEl("", chord.pos - rowFrom(ln), semis);
          bindChord(node, ln, line, chord);
          lane.appendChild(node);
          layoutLine(ln);
          openPicker(node, ln, line, chord);
        });
        ln.appendChild(lane);

        var text = textSpans(line.text.slice(from, to));
        holdOff(text);
        text.addEventListener("input", function () {
          /* Asked now and not remembered from when the row was built: a row
             below this one on the same line moves every time this one grows
             or shrinks (see shiftAfter), and it is the one being typed into
             that has to know where it starts. */
          var here = rowFrom(ln), ends = rowTo(ln, line);
          var caret = caretIndex(text);

          /* A space typed at the end of editable text is inserted by the
             browser as a NON-BREAKING space, so that it cannot be collapsed
             away. Here nothing collapses anything (white-space: pre), and a
             song carrying two kinds of space that look identical is a song
             where padding, trimming and searching all quietly disagree. Same
             length, so the caret still points where it pointed. */
          var next = text.textContent.replace(/ /g, " ");

          /* WHAT WAS TYPED WENT INTO A SLICE, AND WHAT IS KEPT IS THE LINE.
             The row holds the characters between `here` and `ends`; the rest
             of the line is standing in the rows above and below it, untouched,
             and the song gets all three back in order. A row that is a whole
             line slices nothing off either end and this is the line itself. */
          var whole = line.text.slice(0, here) + next + line.text.slice(ends);

          /* The new positions are written ONTO the chords, not swapped in as
             new objects. Everything that can move a chord after this, the drag
             handlers, the picker, the swap, holds a chord by identity, and a
             fresh array would leave every one of them holding something that is
             no longer part of the line: the chord would appear to move and then
             be gone at the next redraw, and gone from what was saved. */
          var moved = remapChords(line.text, whole, line.chords, here + (caret == null ? next.length : caret));
          line.chords.forEach(function (c, i) { c.pos = moved[i].pos; });
          var grew = whole.length - line.text.length;
          line.text = whole;

          /* This row now ends where its own characters do, and every row of
             this line under it has moved by what was typed. */
          ln.dataset.to = here + next.length;
          shiftAfter(ln, line, grew);

          /* rebuilt from the model, which is what turns the browser's
             non-breaking space back into an ordinary one on screen too */
          fillSpans(text, next);
          if (caret !== null) placeCaret(text, caret);

          /* A blank line has no chord lane, because a line with no characters
             has nothing for a chord to sit over. The first character typed
             gives it one, and the last character deleted takes it away again.
             Without this the lane a line was BORN without never comes back,
             and there is nowhere to put a chord on it ever again. */
          ln.classList.toggle("is-blank", !whole.trim() && !line.chords.length);

          /* the model moved, so the labels above it move with it */
          syncChords(ln, line);
          layoutLine(ln);
          /* and whether this line still fits the segment it is standing in,
             and where it breaks if it does not: at once if what is on this
             line of the page has already run past the edge of it, and
             otherwise once the typing stops. Asked of the pair where the row
             shares its line with another, because a row that shares one is
             only as wide as its own words and can never overflow itself. */
          var box = ln.parentNode && ln.parentNode.classList.contains("ln-row") ? ln.parentNode : ln;
          settle(box.scrollWidth > box.clientWidth + 1);
        });
        text.addEventListener("keydown", function (event) { lineKeys(event, line, text); });
        /* Clicking between two letters offers to open a gap there, and typing
           takes the offer away again: it is an answer to standing still, not
           something to type around. */
        text.addEventListener("click", function () { offerGap(ln, line, text); });
        text.addEventListener("keydown", hideGap, true);
        ln.appendChild(text);
      }

      /* NOTHING BESIDE THE LINE. There was a tick out in the margin of every
         one of them, a column of forty checkboxes down a song, and then a
         drag that took whole lines instead of words. Both are gone: what is
         beside a line is nothing, and what a drag across it does is what it
         does in any other document. */
      return ln;
    }

    /* --- WHERE THE BREAKING HANDS THE SONG BACK -------------------------------
       The pouring knows how to cut a line to the width of a segment and
       nothing at all about the song behind it. So it cuts, and hands each
       piece here, and what goes back is a row of the editor's own making for
       exactly that slice: the same rows, the same listeners and the same
       chords as a line that never had to be broken.

       The one thing the poured row is asked for is its shape (which piece of
       which line, and which chords fall in it); the row itself is thrown away
       and built again from the song. */
    if (editing && !coming) {
      sheet.__adoptRow = function (piece) {
        var index = Number(piece.line.node.dataset.index);
        var line = song.lines[index];
        return isFinite(index) && line ? editRow(line, index, piece) : null;
      };
    }

    /* --- keeping the other pieces of a line in step ---------------------------
       A line drawn in three rows is one string in the song, and typing into
       the middle row moves the third one along by however much was typed.
       Until the song is poured again, which is half a second after the typing
       stops, those rows are what the person is looking at: left alone they
       show the line as it was before the key was pressed, and worse, they
       still believe they start where they used to, so the next thing typed
       into one of them is spliced into the wrong place. */
    function shiftAfter(ln, line, grew) {
      if (!grew) return;
      var rows = rowsOf(ln.dataset.index);
      var after = rows.slice(rows.indexOf(ln) + 1);
      after.forEach(function (row) {
        row.dataset.from = rowFrom(row) + grew;
        row.dataset.to = Number(row.dataset.to) + grew;
        var host = row.querySelector(".ln-t");
        if (host) fillSpans(host, line.text.slice(rowFrom(row), rowTo(row, line)));
        syncChords(row, line);
        layoutLine(row);
      });
    }

    /* The labels of one row, put back over the characters they name. A chord
       is held by object here as it is everywhere else (see bindChord), so a
       row that carries only some of a line's chords is no special case: each
       label asks the chord it belongs to where it is, and takes off where its
       own row begins. */
    function syncChords(ln, line) {
      var here = rowFrom(ln);
      Array.prototype.forEach.call(ln.querySelectorAll(".ln-c .chord"), function (node) {
        if (node.__chord && line.chords.indexOf(node.__chord) >= 0) node.dataset.pos = node.__chord.pos - here;
      });
    }

    /* The characters of one row, written again from the song: what a chord
       dragged past the end of a line does to the line under it. The last row
       of a line ends wherever the line now ends, which is what makes room for
       the gaps that drag just added. */
    function refill(ln, line) {
      var host = ln.querySelector(".ln-t");
      if (!host) return;
      var rows = rowsOf(ln.dataset.index);
      if (rows[rows.length - 1] === ln) ln.dataset.to = line.text.length;
      fillSpans(host, line.text.slice(rowFrom(ln), rowTo(ln, line)));
    }

    /* The label standing for one chord, wherever in the song it is drawn: the
       row it is on is not necessarily the row the question is being asked
       from, because a chord can be pushed onto a piece of the line the hand is
       not in. */
    function chordNodeOf(index, chord) {
      var found = null;
      rowsOf(index).forEach(function (row) {
        Array.prototype.forEach.call(row.querySelectorAll(".ln-c .chord"), function (node) {
          if (node.__chord === chord) found = node;
        });
      });
      return found;
    }

    /* --- SELECTING IS THE BROWSER'S AGAIN --------------------------------------
       Every line of the song is its own contenteditable host. That is what
       keeps a caret, an undo and a paste inside the line they belong to, and
       it is what lets a chord be positioned over one character of it. It is
       also why a selection could never leave the line it started on: a
       browser will not carry one from one editing host into the next, and a
       drag across three lines came back holding the first.

       The answer used to be to take the gesture away: past the end of its own
       line the drag stopped selecting words and started taking whole lines.
       Which was never what was under the pointer.

       So the hosts are shut until the caret asks for one. A line is editable
       ONLY while it is being typed into; every other line on the page is
       ordinary text, and a drag across ordinary text is the browser's own
       selection, exactly the characters it crosses, as many lines as it
       likes. Pressing shuts the one that was open, and letting go opens the
       one that was pressed, at the character that was pressed. Nothing about
       the typing changes: by the time a key can be pressed, the line under
       the caret is a host again.

       What a selection that crosses lines can then have done to it is below:
       copied (see sheetToText), cut, typed over, deleted. */
    var typing = null;

    /* Editable, but not yet. The paste handling and the plaintext-only mode
       are settled once, here, and remembered: opening the host again is then
       one attribute and no guesswork. */
    function holdOff(node) {
      makeEditable(node);
      node.dataset.edit = node.contentEditable;
      node.contentEditable = "false";
      return node;
    }

    function shutLines() {
      if (!typing) return;
      /* SHUT AND LET GO OF IT. A host that is closed while it still holds the
         focus is still where the browser thinks the editing is, and a
         selection begun in it is held inside it: the drag would stop at the
         end of that line exactly as it did when the line was open. */
      if (typing.isConnected) {
        typing.contentEditable = "false";
        if (document.activeElement === typing) typing.blur();
      }
      typing = null;
    }

    /* Open one, and put the caret back exactly where the pointer left it. The
       range was taken before the host opened; the characters it names are the
       same spans afterwards, so it still points at them. */
    function openLine(node, range) {
      if (!node) return null;
      if (typing !== node) {
        shutLines();
        node.contentEditable = node.dataset.edit || "true";
        typing = node;
      }
      node.focus();
      if (range) select(range);
      return node;
    }

    /* The line a node belongs to, as a line of the SONG, and the row it is
       drawn in. Everything below asks this of whatever the pointer or the
       selection happened to land on: a character span, a heading, the lane. */
    function rowOf(node) {
      var ln = node && node.closest ? node.closest(".ln") : null;
      if (!ln && node && node.parentNode && node.parentNode.closest) ln = node.parentNode.closest(".ln");
      return ln && sheet.contains(ln) ? ln : null;
    }

    function lineAt(node) {
      var ln = rowOf(node);
      if (!ln) return null;
      var index = Number(ln.dataset.index);
      return isFinite(index) ? song.lines[index] || null : null;
    }

    /* --- A ROW IS A SLICE OF A LINE ------------------------------------------
       A line that fits its segment is drawn in one row and the two are the
       same thing, which is what every row was until the song began to be
       broken while it was being written. A line that does not fit is drawn in
       two rows or three, and then a row is a SLICE: it holds the characters
       from `from` up to `to` and nothing else.

       Everything below that talks to the song, the caret, the keys, the
       chords, the gap, works in the line's own characters, and the whole of
       the difference between the two cases is these three functions. A row
       that is a whole line says from 0 and answers to the length of the line,
       so it goes through exactly the same arithmetic and comes out where it
       went in. */
    function rowFrom(ln) {
      var at = ln ? Number(ln.dataset.from) : 0;
      return isFinite(at) ? at : 0;
    }

    function rowTo(ln, line) {
      var end = ln && ln.dataset.to !== undefined && ln.dataset.to !== "" ? Number(ln.dataset.to) : NaN;
      var len = String((line || {}).text || "").length;
      return isFinite(end) ? Math.min(end, len) : len;
    }

    /* Where the caret is IN THE LINE, which is where it is in the row plus
       everything the rows before it hold. */
    function caretAt(host) {
      var at = caretIndex(host);
      return at == null ? null : at + rowFrom(rowOf(host));
    }

    function lineIndexOf(node) {
      var ln = rowOf(node);
      var index = ln ? Number(ln.dataset.index) : NaN;
      return isFinite(index) ? index : -1;
    }

    /* Every row a line is drawn in, in the order the song reads them. */
    function rowsOf(index) {
      return Array.prototype.slice.call(sheet.querySelectorAll('.ln[data-index="' + index + '"]'));
    }

    /* The rows of the whole song, in reading order: down a segment, on to the
       next, and on to the page under it. Which is what the caret follows when
       it is asked for the row above or below. */
    function allRows() {
      return Array.prototype.slice.call(sheet.querySelectorAll(".ln"));
    }

    function hostOf(node) {
      var ln = rowOf(node);
      return ln ? ln.querySelector(".ln-t, .ln-section") : null;
    }

    /* Where a boundary of the selection falls, as a character index of the
       line it fell in: the same probe the caret is read with. */
    function indexAt(host, node, offset) {
      var probe = document.createRange();
      probe.selectNodeContents(host);
      try { probe.setEnd(node, offset); } catch (e) { return null; }
      return probe.toString().length;
    }

    /* A selection the app has to answer for, in the song's own terms: which
       line it starts in and where, which line it ends in and where.

       WHICH ROWS IT TOUCHES IS ASKED OF THE ROWS, not read off the two ends of
       the range. A drag ends inside a character, and those two answers are the
       same; Ctrl+A does not, it puts both ends on the sheet itself, and asking
       the ends what line they are in comes back with "none" and the whole
       selection reads as nothing at all. Everything the keys below do to a
       selection went through here, so Ctrl+A and then Delete deleted nothing
       and Ctrl+A and then a paste pasted over nothing.

       Null for a selection inside the line being typed into: that one is the
       browser's own business and is left to it. */
    function acrossLines() {
      var selection = window.getSelection && window.getSelection();
      if (!selection || !selection.rangeCount || selection.isCollapsed) return null;

      var range = selection.getRangeAt(0);
      var about = range.commonAncestorContainer;
      if (about !== sheet && !sheet.contains(about)) return null;

      var rows = Array.prototype.filter.call(sheet.querySelectorAll(".ln"), function (ln) {
        return selection.containsNode(ln, true);
      });
      if (!rows.length) return null;
      if (rows.length === 1 && typing && rows[0].contains(typing)) return null;

      var first = rows[0], last = rows[rows.length - 1];
      var head = first.querySelector(".ln-t, .ln-section");
      var foot = last.querySelector(".ln-t, .ln-section");

      var a = song.lines.indexOf(lineAt(first));
      var b = song.lines.indexOf(lineAt(last));
      if (a < 0 || b < 0 || a > b) return null;

      /* Where it begins inside the first row and ends inside the last, counted
         in the characters of the LINE each row is a piece of. A boundary that
         is not in the row at all means the whole of it: it began above this
         row, or it ends below that one. */
      var opens = head && head.contains(range.startContainer) ? indexAt(head, range.startContainer, range.startOffset) : null;
      var shuts = foot && foot.contains(range.endContainer) ? indexAt(foot, range.endContainer, range.endOffset) : null;
      var at = opens == null ? rowFrom(first) : opens + rowFrom(first);
      var end = shuts == null ? String(song.lines[b].text || "").length : shuts + rowFrom(last);

      return { a: a, b: b, at: at == null ? 0 : at, end: end == null ? String(song.lines[b].text || "").length : end };
    }

    /* Taking it out. The first line keeps what came before the selection, the
       last keeps what came after, and the two halves become one line: which is
       what deleting a selection means in any document. The chords travel with
       the characters they name, because splitLine and joinLines are the same
       ones Enter and Backspace use. */
    function dropAcross() {
      var span = acrossLines();
      if (!span) return null;

      var head = splitLine(song.lines[span.a], span.at)[0];
      var foot = splitLine(song.lines[span.b], span.end)[1];
      var joined = joinLines(head, foot);

      song.lines.splice(span.a, span.b - span.a + 1, joined);
      if (!song.lines.length) song.lines.push(blankLine(song.dir));

      draw();
      focusLine(span.a, head.text.length);
      mark();
      /* where it left the caret, for whatever asked for the deleting */
      return { index: span.a, at: head.text.length };
    }

    /* --- the press, and the letting go -----------------------------------------
       Hung on the SHEET and not on each line, because the gesture crosses from
       one line to another and a handler that belongs to a line stops at its
       edge.

       The chords are not part of this. Pressing one drags it along its own
       line and pressing the empty lane puts a new one down, and both of those
       are gestures about a chord that happen to begin on a line. */
    function fromChords(target) {
      return !!(target && target.closest && target.closest(".ln-c"));
    }

    if (editing && !coming) {
      /* DOWN SHUTS EVERYTHING. Whatever happens between here and letting go is
         a selection, and a selection has to be free to leave the line it
         started on, which it cannot do out of an editing host. */
      sheet.addEventListener("pointerdown", function (event) {
        if (event.button) return;
        if (fromChords(event.target)) return;
        shutLines();
      });

      /* UP OPENS THE ONE UNDER THE POINTER, at the character under it.
         Unless the selection went somewhere: a drag across two lines is an
         answer about those lines and opening a host would throw it away, and
         a word taken inside one line is opened with the word still selected,
         so that typing replaces it the way it does anywhere else. */
      sheet.addEventListener("pointerup", function (event) {
        if (event.button) return;
        if (fromChords(event.target)) return;

        var host = hostOf(event.target);
        if (!host) return;

        var selection = window.getSelection && window.getSelection();
        if (selection && selection.rangeCount && !selection.isCollapsed) {
          var range = selection.getRangeAt(0);
          if (hostOf(range.startContainer) !== host || hostOf(range.endContainer) !== host) return;
          return void openLine(host, range.cloneRange());
        }

        /* Where the pointer actually landed, asked of the browser: the same
           question it answers itself when the text is editable. */
        var at = null;
        if (document.caretRangeFromPoint) {
          at = document.caretRangeFromPoint(event.clientX, event.clientY);
        } else if (document.caretPositionFromPoint) {
          var spot = document.caretPositionFromPoint(event.clientX, event.clientY);
          if (spot) {
            at = document.createRange();
            at.setStart(spot.offsetNode, spot.offset);
            at.collapse(true);
          }
        }
        openLine(host, at && host.contains(at.startContainer) ? at : null);
      });

      /* --- and what can be done to a selection that crosses lines ---------------
         While one is held no line is a host, so nothing inside the sheet is
         listening: these three are on the document, and each one asks first
         whether the selection is really in this song.

         Typed over, deleted, cut, pasted into. The four things a selection is
         for, and the first three are one operation: the words before it stay,
         the words after it stay, and what was between them goes. */
      var onSpanKey = function (event) {
        if (!sheet.isConnected) return document.removeEventListener("keydown", onSpanKey, true);
        if (event.defaultPrevented || event.isComposing) return;

        /* THE WHOLE SONG, WHEREVER THE PRESS CAME FROM. It used to be answered
           inside the line that had the caret, which meant it was answered only
           while a line had one: pressed with nothing focused, or a second time
           after the first shut the lines, it fell through to the browser and
           selected the whole page, header and all. Delete then deleted nothing
           and a paste pasted over nothing, because neither could find the song
           in a selection that was about the document.

           Not when the press came from somewhere else on the page: the name of
           the song and the search field are ordinary fields and Ctrl+A in one
           of them means that field. */
        if ((event.ctrlKey || event.metaKey) && !event.altKey && pressed(event, "KeyA", "a")) {
          var where = event.target;
          var loose = !where || where === document.body || where === document.documentElement;
          if (!loose && !sheet.contains(where)) return;
          event.preventDefault();
          shutLines();
          return void selectAll(sheet);
        }

        if (event.ctrlKey || event.metaKey || event.altKey) return;

        var key = String(event.key);
        var typed = key.length === 1;
        if (!typed && key !== "Backspace" && key !== "Delete" && key !== "Enter") return;
        if (!acrossLines()) return;

        event.preventDefault();
        var spot = dropAcross();
        if (!spot) return;

        /* The line under the caret is a host again by now (focusLine opened
           it), so a typed character is inserted the ordinary way and the chords
           are remapped by the same handler that watches typing. */
        if (typed) return void document.execCommand("insertText", false, key);
        if (key !== "Enter") return;

        song.lines.splice.apply(song.lines, [spot.index, 1].concat(splitLine(song.lines[spot.index], spot.at)));
        draw();
        focusLine(spot.index + 1, 0);
        mark();
      };
      document.addEventListener("keydown", onSpanKey, true);

      /* Ctrl+X is the copy that Ctrl+C makes, and then the selection taken
         out. Inside one line the browser would cut the characters alone, which
         is not what was copied a key to the left. */
      var onCut = function (event) {
        if (!sheet.isConnected) return document.removeEventListener("cut", onCut, true);
        var selection = window.getSelection && window.getSelection();
        if (sheetOfSelection(selection) !== sheet || !event.clipboardData) return;

        var text = sheetToText(sheet, selection);
        if (!text) return;
        event.clipboardData.setData("text/plain", text);
        event.preventDefault();

        if (!dropAcross()) document.execCommand("delete");
      };
      document.addEventListener("cut", onCut, true);

      /* WHAT COMES OFF THE CLIPBOARD IS A SONG, not a run of letters. Written
         with brackets if it was copied off this page, and a row of chords over
         a row of words if it came off somebody else's; either way it arrives
         with its chords, its headings and its line breaks, and lands where the
         caret is. */
      var onPaste = function (event) {
        if (!sheet.isConnected) return document.removeEventListener("paste", onPaste, true);
        var data = event.clipboardData || window.clipboardData;
        if (!data) return;

        var span = acrossLines();
        var here = typing && sheet.contains(typing) && document.activeElement === typing ? typing : null;
        if (!span && !here) return;

        var raw = String(data.getData("text") || "").replace(/\r\n?/g, "\n");
        if (!raw) return;
        event.preventDefault();

        /* What was selected is what is replaced, whether it was two words or
           two verses. */
        var spot;
        if (span) {
          spot = dropAcross();
          here = typing;
        } else {
          var chosen = window.getSelection && window.getSelection();
          if (chosen && chosen.rangeCount && !chosen.isCollapsed) document.execCommand("delete");
          spot = { index: song.lines.indexOf(lineAt(here)), at: caretAt(here) || 0 };
        }
        if (!spot || spot.index < 0 || !here) return;

        /* A handful of characters with nothing to say about chords or lines is
           a handful of characters at the caret, and the browser knows where
           that is better than any arithmetic here would. */
        if (raw.indexOf("\n") < 0 && raw.indexOf("[") < 0) {
          return void document.execCommand("insertText", false, raw.replace(/\t/g, " "));
        }

        var dir = dirOf(song.lines[spot.index], song.dir);
        var written = /\[[^\]\n]{1,16}\]/.test(raw) || /^[ \t]*\{[^}]*\}[ \t]*$/m.test(raw);
        var rows = normalizeLines(written ? textToSong(raw, dir) : parsePasted(raw), dir);
        if (!rows.length) return;

        /* The line it lands in opens at the caret: the first row pasted joins
           what was before it, the last joins what was after, and the rest
           stand between them as lines of their own. */
        var halves = splitLine(song.lines[spot.index], spot.at);
        /* Pasted against what is on screen, so the chords come back down to
           the song's own key before they are kept, exactly the way a typed one
           does (see untranspose). Otherwise a song being read three semitones
           down takes a pasted verse at face value and puts it up three
           semitones higher than it was pasted. */
        var built = rows.map(function (row) {
          return {
            type: row.type, text: row.text, dir: row.dir,
            chords: row.chords.map(function (c) {
              return { pos: c.pos, chord: transposeChord(c.chord, -semis) };
            }),
          };
        });
        built[0] = joinLines(halves[0], built[0]);

        var end = built.length - 1;
        var caret = built[end].text.length;
        built[end] = joinLines(built[end], halves[1]);

        song.lines.splice.apply(song.lines, [spot.index, 1].concat(built));
        draw();
        focusLine(spot.index + end, caret);
        mark();
      };
      document.addEventListener("paste", onPaste, true);
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
      /* In the LINE's characters, not the row's: Enter cuts a line of the song
         in two and it has to be cut where the caret is standing in that line,
         whichever piece of it the caret happens to be in. */
      var at = caretAt(editable);
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

      /* --- AT THE SEAM BETWEEN TWO PIECES OF ONE LINE --------------------------
         A line too long for its segment is drawn in two rows, and each row is
         its own editing host. So at the start of the second one the browser
         sees nothing to the left of the caret and Backspace does nothing at
         all, while in the song there is a character standing right there. Same
         at the end of the first row and Delete. The keys answer for it here:
         one character of the line, taken out where the caret says. */
      } else if (event.key === "Backspace" && !spread && at > 0 && caretIndex(editable) === 0) {
        event.preventDefault();
        dropChar(line, index, at - 1);

      } else if (event.key === "Delete" && !spread && at != null && at < line.text.length &&
                 caretIndex(editable) === editable.textContent.length) {
        event.preventDefault();
        dropChar(line, index, at);

      /* Ctrl+A is not here. A line's worth of its own text is not what anybody
         means by "everything" on a page of forty lines, and it has to be
         answered whether or not a line holds the caret, so it lives on the
         document with the other keys about a selection (see onSpanKey). */

      } else if (event.key === "Escape") {
        event.preventDefault();
        editable.blur();

      } else if (event.key === "Tab") {
        event.preventDefault();
        var rows = allRows();
        focusRow(rows[rows.indexOf(rowOf(editable)) + (event.shiftKey ? -1 : 1)]);

      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        /* UP AND DOWN GO WHERE THEY GO IN ANY OTHER EDITOR. Every line here is
           its own editable element, which is what lets a chord be positioned
           over one character of it, and it is also why the browser has nowhere
           to take the caret from the top of one: as far as it is concerned
           there is one line and the arrow has already arrived.

           So they are answered here, into the line above or below, at the same
           character. Not the same PIXEL: a column that is kept across lines of
           different lengths is a nicety, and following the character is what
           the person pressing it just looked at.

           At the ends of the song they do nothing at all, rather than being
           swallowed: an arrow that answers with silence at the top of a page
           reads as a page that has stopped listening.

           BY ROW AND NOT BY LINE. A long line is drawn in two rows or three,
           and an arrow that stepped a whole line at a time would jump over the
           rest of the line it is standing in: on the screen that is the caret
           skipping the very row it was pointing at. */
        var here = allRows();
        var to = here[here.indexOf(rowOf(editable)) + (event.key === "ArrowUp" ? -1 : 1)];
        if (!to) return;
        event.preventDefault();
        focusRow(to, caretIndex(editable));

      } else if (!spread && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        /* AND OFF THE END OF A ROW, ONTO THE NEXT. Inside the row the browser
           does this itself and is left to; at the edge it has nowhere to go,
           because the row is the whole of the document as far as it knows.

           Which end is "onward" is a question about the row and not about the
           key: in a line running right to left it is the left arrow that
           reaches the next character. */
        var edge = caretIndex(editable);
        if (edge == null) return;
        var rtl = rowRtl(rowOf(editable));
        var onward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
        if (onward ? edge < editable.textContent.length : edge > 0) return;

        var order = allRows();
        var over = order[order.indexOf(rowOf(editable)) + (onward ? 1 : -1)];
        if (!over) return;
        event.preventDefault();
        var host = over.querySelector(".ln-t, .ln-section");
        focusRow(over, onward ? 0 : (host ? host.textContent.length : 0));
      }
    }

    /* One character of a line, taken out where the caret is standing. The three
       steps are the ones typing takes: the chords are moved onto the characters
       that are left, the song keeps the new line, and the page is drawn again
       from it, because a character fewer can be a break in a different place. */
    function dropChar(line, index, at) {
      var was = line.text;
      if (at < 0 || at >= was.length) return;
      var next = was.slice(0, at) + was.slice(at + 1);
      var moved = remapChords(was, next, line.chords, at);
      line.chords.forEach(function (c, i) { c.pos = moved[i].pos; });
      line.text = next;
      draw();
      focusLine(index, at);
      mark();
    }

    /* A CHARACTER OF A LINE, WHEREVER THAT LINE IS DRAWN. One row or three, the
       caller says which line and which character of it; the row that holds
       that character is the last one that begins at or before it. */
    function focusLine(index, caret) {
      var rows = rowsOf(index);
      if (!rows.length) return;

      var ln = rows[0];
      if (caret != null) {
        rows.forEach(function (row) { if (rowFrom(row) <= caret) ln = row; });
      }

      var editable = ln.querySelector(".ln-t, .ln-section");
      if (!editable) return;
      /* Open before the caret is placed: a caret put into a line that is not
         a host yet is a caret in a page, and the next key goes nowhere. */
      openLine(editable);
      var here = caret == null ? editable.textContent.length : caret - rowFrom(ln);
      placeCaret(editable, Math.max(0, Math.min(here, editable.textContent.length)));
    }

    /* The row above or below, at the same character of it. Not the same
       character of the LINE: what somebody pressing the arrow just looked at
       is the row on the screen. */
    function focusRow(ln, offset) {
      if (!ln) return;
      var editable = ln.querySelector(".ln-t, .ln-section");
      if (!editable) return;
      openLine(editable);
      placeCaret(editable, Math.max(0, Math.min(offset == null ? editable.textContent.length : offset, editable.textContent.length)));
    }

    /* --- a chord ------------------------------------------------------------
       Two gestures on one element. Dragging slides it along the line, in pixels
       on the screen and in characters in the model, and moves NOTHING else.
       Letting go without having moved opens the small list of chords the song
       already uses. */
    function bindChord(node, ln, line, chord) {
      var dragging = false, from = 0, grab = 0;

      /* THE LABEL SAYS WHICH CHORD IT IS. Everything that draws a chord asks
         the chord itself where it stands, and a row holding a piece of a line
         holds only the chords of that piece: counting the labels along a lane
         and hoping the count matches the song is exactly what stops working
         the moment a line is drawn in more than one row. */
      node.__chord = chord;

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
          /* Both in the LINE's characters: the pointer is asked of the row and
             the row may be a piece of the line, so what it answers is counted
             from where that piece begins. */
          grab = (chord.pos + 0.5) - (posFromX(ln, event.clientX) + rowFrom(ln));
        }

        /* The hand moves in pixels, the song moves in characters. The chord is
           DRAWN wherever the hand is, so the drag is smooth, and RECORDED on
           the character its middle is over, so what is stored still names a
           letter. `raw` is that middle in character coordinates, so the
           character carrying it is the one it falls INSIDE: floor, not round.
           The only visible cost is half a character of settling on release. */
        var here = rowFrom(ln);
        var raw = Math.max(here, posFromX(ln, event.clientX) + here + grab);
        var pos = Math.max(here, Math.floor(raw));
        var previous = chord.pos;

        /* A chord that has been pulled past the last word: the LINE grows to
           meet it, in artificial spaces, so it still names a character of its
           own line and the words are none the longer for it (see padTo). */
        if (padTo(line, pos)) refill(ln, line);

        /* drawn in the row's own coordinates, which is where its pixels are */
        placeChord(ln, node, positionOf(metrics(ln), raw - here));
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
        node.dataset.pos = pos - here;

        if (crossed) {
          crossed.pos = previous;
          /* The one the crossing pushed back, wherever it is drawn: a line
             broken into pieces keeps its chords on the piece their character
             is in, which is not always the piece the hand is in. */
          var twin = chordNodeOf(ln.dataset.index, crossed);
          var where = twin ? rowOf(twin) : null;
          if (where) { twin.dataset.pos = crossed.pos - rowFrom(where); placeChord(where, twin); }
        }
      });

      node.addEventListener("pointerup", function (event) {
        if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
        node.classList.remove("is-dragging");
        if (!dragging) return openPicker(node, ln, line, chord);

        /* let go: the chord settles onto its character, and any room the drag
           called for and no longer needs goes back */
        if (trimPadding(line)) refill(ln, line);
        layoutLine(ln);
        mark();
        /* and a line that grew or shrank by those spaces may break somewhere
           else now */
        settle();
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

    /* Set by the one press that publishes, cleared by the save that carries it
       out. It waits here rather than being acted on at the press because the
       press does not write anything: the save does, and until it has landed
       there is nothing true to keep a copy of. */
    var wantVersion = false;

    /* THE QUIET WORD IN THE BAR IS GONE. It said where the writing had got
       to, "נשמר" and "לא נשמר", which on a page that saves itself is the
       answer to a question nobody asked: it was right almost always, and
       being right almost always is what made it worth nothing to read.

       What is left is the two things it said that nothing else says, and both
       of them are trouble, so they are said the way trouble is said here.

       ONCE EACH. A song saves itself every few seconds, so the same complaint
       would arrive every few seconds, and a message that repeats while you
       are typing is a message you learn to look past. It is armed again by
       the next save that goes through. */
    var said = "";

    function note(text, bad) {
      if (!bad) { said = ""; return; }
      if (text === said) return;
      said = text;
      toast(text, true);
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

          /* The press that published it has now landed, so the song as it went
             out goes on the shelf. Only for a save that actually carried
             `published`, and only once: an ordinary save a minute later is not
             another publication. */
          if (wantVersion && payload.published) {
            wantVersion = false;
            keepVersion(row);
          }

          var here = BASE + "/" + encodeURIComponent(row.slug);
          if (decodeURIComponent(location.pathname) !== decodeURIComponent(here)) {
            history.replaceState(history.state, "", here);
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

    /* through setSemis, not straight to draw, so the page opens on the key it
       was opened in: the first drawing is the one that has to be transposed,
       and it is the only one nobody presses a button to get */
    setSemis(semis);
    relayoutOn(sheet, draw, editing);

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

  /* `line.mark` is set on nothing but a version being read against the one
     before it (see flipDiff): "add" for a line this version brought, "gone"
     for one it left behind. Carried on the line rather than passed in, because
     the two kinds are interleaved down one sheet and the drawing has to be
     told line by line. */
  function viewLine(line, semis) {
    var change = line.mark ? " is-" + line.mark : "";
    if (line.type === "section") {
      var s = el("div", "ln is-section" + change);
      s.dir = dirOf(line);
      s.appendChild(el("div", "ln-section", line.text));
      return s;
    }
    var ln = el("div", "ln" + change + (line.text.trim() || line.chords.length ? "" : " is-blank"));
    /* Said on the row, which is both how the browser lays the words out and
       where every measurement asks (see rowRtl). One answer, one place. */
    ln.dir = dirOf(line);
    var lane = el("div", "ln-c");
    line.chords.forEach(function (c) { lane.appendChild(chordEl(c.chord, c.pos, semis)); });
    ln.appendChild(lane);
    ln.appendChild(textSpans(line.text));
    return ln;
  }

  /* --- WHAT A COPY OFF THE PAGE HANDS BACK -----------------------------------
     Ctrl+C over a song gives back the words AND the chords over them, written
     the way the song itself is written down:

         [Am]את אורם של כל הכו[Dm]כבים

     The browser on its own gives back the words alone, and it is right to: a
     chord is not part of the line it stands over, it is a label floating above
     it, and it is user-select: none precisely so that dragging across the
     words does not drag the labels in sideways and out of order. So what lands
     on the clipboard is put together here instead.

     EXACTLY WHAT IS SELECTED, character by character. Half a line is half a
     line, and it comes with the chords standing over that half and no others.

     Read off the PAGE rather than off the song. The labels are the transposed
     ones on screen, which is what the person copying is looking at; it works
     the same in the reader, in the editor and on a version; and a row that the
     reader broke off the line above rejoins it, because that break is a fact
     about this screen and not about the song. */

  /* THE ARTIFICIAL SPACES COME ALONG. They were taken out of the copy at
     first, on the grounds that a gap is a private-use codepoint (see GAP) and
     comes out a box of tofu in whatever the words are pasted into. But a gap
     is what holds two chords apart over one short word: a line copied without
     them and pasted back is that word closed up again with its chords piled
     on top of each other, which is the line broken by having been copied.

     And this is the format the song is stored in either way. songToText writes
     the line's own characters, gaps and all, so what goes on the clipboard is
     exactly what goes in the database: one format, copied, pasted, saved and
     read back the same. */

  function sheetToText(sheet, selection) {
    var lines = [], gaps = 0, any = false;

    /* Empty rows inside the selection are part of it: they are the space
       between one verse and the next. Held rather than written as they come,
       so the ones after the last selected line are not carried along. */
    function put(text) {
      while (any && gaps > 0) { lines.push(""); gaps--; }
      gaps = 0;
      lines.push(text);
      any = true;
    }

    Array.prototype.forEach.call(sheet.querySelectorAll(".ln"), function (ln) {
      var head = ln.querySelector(".ln-section");
      if (head) {
        if (selection.containsNode(head, true)) put("{" + head.textContent.trim() + "}");
        else gaps++;
        return;
      }

      var t = ln.querySelector(".ln-t");
      var spans = t ? t.children : [];
      var from = -1, to = -1;
      for (var i = 0; i < spans.length; i++) {
        if (!selection.containsNode(spans[i], true)) continue;
        if (from < 0) from = i;
        to = i;
      }
      if (from < 0) { gaps++; return; }

      var text = "";
      for (var j = from; j <= to; j++) text += spans[j].textContent;

      var chords = [];
      Array.prototype.forEach.call(ln.querySelectorAll(".ln-c .chord"), function (node) {
        var at = Number(node.dataset.pos);
        if (!isFinite(at) || at < from || at > to) return;
        chords.push({ pos: at - from, chord: node.textContent.trim() });
      });
      chords.sort(function (a, b) { return a.pos - b.pos; });

      var written = toChordPro({ type: "line", text: text, chords: chords });

      /* A row the reader broke off the line above is that line continuing, so
         it goes back onto it. Only when the row above was taken too: a
         selection that starts in the middle of a broken line starts a line. */
      if (!gaps && lines.length && ln.classList.contains("is-cont")) lines[lines.length - 1] += written;
      else put(written);
    });

    return lines.join("\n");
  }

  /* The sheet the selection is in, if it is in one at all. A copy anywhere
     else on the page is the browser's own business. */
  function sheetOfSelection(selection) {
    if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
    var node = selection.getRangeAt(0).commonAncestorContainer;
    if (node && node.nodeType !== 1) node = node.parentNode;
    return node && node.closest ? node.closest(".sheet") : null;
  }

  /* One listener for every sheet there is, hung on the document because a copy
     is a fact about the selection and not about any one element. */
  document.addEventListener("copy", function (event) {
    var selection = window.getSelection && window.getSelection();
    var sheet = sheetOfSelection(selection);
    if (!sheet || !event.clipboardData) return;

    var text = sheetToText(sheet, selection);
    if (!text) return;

    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  });

  /* Fonts arrive after the first paint and a window resize changes every
     offset, so both re-measure. Nothing is re-rendered, only re-placed.

     Except where the width is what changed and the lines are broken to it:
     there the rows themselves are wrong, not only the chords on them, so the
     caller hands in a redraw and it is used instead. Only when the width
     actually moved, because a phone fires resize for its own address bar
     sliding away, and redrawing the sheet under a reader's thumb for that is
     the page flinching at nothing.

     `always` is for a sheet being written into. What is standing on it is
     pieces of lines, and measuring those again would be breaking what is
     already broken: there is no cheap answer there, only the song drawn
     again, however small the thing that moved.

     WHICH IS TRUE OF A SHEET BEING READ AS WELL, and the reason there is no
     `run` left on this path. A poured sheet holds pieces whichever state it is
     in, so laying it out again takes apart the pairs the pouring made and
     cannot put them back (see draw). What is cheap is the placing, and the
     placing alone is right for exactly one case: a window that changed height
     and not width on a phone, where the address bar sliding away moves no row
     and there are no pages to re-cut. */
  function relayoutOn(root, redraw, always) {
    /* A window that changed width changed how many columns the song stands
       in, which is a fact about the sheet and not about any one chord, so it
       is asked again before the chords are placed. */
    var run = function () { fitColumns(root); layoutAll(root); };
    var width = root.clientWidth;

    /* The font the words were broken with has to be the font they are read in,
       so a font arriving late breaks them again rather than only nudging the
       chords. */
    var rewrap = function () {
      if (!redraw) return run();
      width = root.clientWidth;
      redraw();
    };

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rewrap);
    var onResize = function () {
      if (!root.isConnected) return window.removeEventListener("resize", onResize);
      if (redraw && (always || root.clientWidth !== width || !NARROW.matches)) return rewrap();
      layoutAll(root);
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
    where("לא נמצא");
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

  /* --- what the song was -----------------------------------------------------
     Every press of פורסם leaves a copy of the song as it went out, and this is
     where those are read. Two pages:

       /<slug>/versions        the list of them, newest first
       /<slug>/versions/<id>   one of them, opened as the song it was

     THEY ARE THE AUTHOR'S. A published song is one song and the drafts it
     passed through on the way are nobody else's business, which is a rule in
     the database (see song_versions in schema.sql) and not a decision made
     here. Somebody signed out is told so rather than shown an empty list,
     because the two look identical from this side and mean different things.
     --------------------------------------------------------------------- */

  /* A version, wearing the song's identity: the same id and the same address,
     because this IS that song, at an earlier moment. Everything that says what
     the song is now comes from the version instead. */
  function versionSong(song, v) {
    return {
      id: song.id,
      slug: song.slug,
      title: String(v.title || ""),
      lyrics_by: String(v.lyrics_by || ""),
      music_by: String(v.music_by || ""),
      dir: v.dir || "rtl",
      lines: normalizeLines(v.lines, v.dir),
      styles: Array.isArray(v.styles) ? v.styles : [],
      /* it was published, which is the only reason it exists at all */
      published: true,
      status: "ready",
      status_note: "",
    };
  }

  /* How much song there is, for a row that has to say what is in a version
     without drawing it. Lines with something on them: the blank ones between
     the verses are the song's shape rather than its size. */
  function lineCount(v) {
    return normalizeLines(v.lines, v.dir).filter(function (line) {
      return String(line.text || "").trim();
    }).length;
  }

  /* What a version did to the one before it, in words, for a row that cannot
     show it. "3 שורות" is the size of a song and this is the size of a change,
     which is the number somebody scanning a list of dates is actually after. */
  function changeWords(ops, first) {
    if (first) return "הגרסה הראשונה";
    var counted = changeCount(ops);
    var said = [];
    if (counted.add) said.push(counted.add === 1 ? "שורה אחת חדשה" : counted.add + " שורות חדשות");
    if (counted.gone) said.push(counted.gone === 1 ? "שורה אחת ירדה" : counted.gone + " שורות ירדו");
    /* A publication with nothing new in the words is a real one: a name, a
       credit or a style was fixed, and saying "0 שורות" would be a number
       where a sentence belongs. */
    return said.length ? said.join(", ") : "המילים והאקורדים לא השתנו";
  }

  /* The sentence over a version, which is two different sentences: what this
     page is, and, once the marks are on, what the colours mean. */
  function pastBand(past, onFlip) {
    var band = el("div", "past-band");
    var said = el("span", "past-said");
    var plain = "זו גרסה שפורסמה " + whenWords(past.version.created_at) + ", ולא השיר עצמו. אי אפשר לערוך אותה, אפשר לשחזר אותה.";
    var marked = "מסומן מה שהשתנה מהגרסה שלפניה: ירוק הוא מה שנוסף, אדום ומחוק הוא מה שירד.";
    said.textContent = plain;
    band.appendChild(said);

    var actions = el("div", "row-actions");

    /* Only against something. The first version of a song changed nothing,
       because there was nothing there to change, and a button that can only
       answer that is a button that should not be offered. */
    if (past.before) {
      /* No picture on it. The clock going backwards is the way TO a version,
         and this button is already standing on one. */
      var flip = button("מה השתנה", null, "ghost small", function () {
        var on = onFlip();
        said.textContent = on ? marked : plain;
        flip.querySelector(".lb").textContent = on ? "הגרסה בלבד" : "מה השתנה";
      });
      actions.appendChild(flip);
    }

    actions.appendChild(button("שחזור הגרסה הזאת", ICON.undo, "small", function () {
      restoreVersion(past.song, past.version);
    }));
    actions.appendChild(button("כל הגרסאות", null, "ghost small", function () {
      go(BASE + "/" + encodeURIComponent(past.song.slug) + "/versions");
    }));
    band.appendChild(actions);
    return band;
  }

  /* --- putting one back ------------------------------------------------------
     The words, the chords, the name, the credits and the kinds, written over
     the song as it stands. Nothing else: whether the song is published is not
     something a version knows, it is where the song is standing today, and a
     restore that quietly took a song out of the world would be doing a second
     thing nobody pressed.

     The versions themselves are untouched, so this can be done again, and the
     one before it is still there to go back to.

     WHAT IT DOES COST is anything typed since the last publication, because
     that was never on the shelf: only publishing puts a copy there. The
     question says so rather than promising a way back that does not exist. */
  function restoreVersion(song, version) {
    var when = whenWords(version.created_at);
    if (!window.confirm('לשחזר את "' + (song.title || "השיר") + '" לגרסה מ' + when +
      "?\n\nמה שכתוב בשיר עכשיו יוחלף. שינויים שנעשו מאז הפרסום האחרון ולא פורסמו לא נשמרו בשום גרסה, והם ילכו.")) return;

    setBusy("משחזר");
    db.update(song.id, {
      title: String(version.title || ""),
      lyrics_by: String(version.lyrics_by || ""),
      music_by: String(version.music_by || ""),
      dir: version.dir || "rtl",
      lines: version.lines == null ? "" : version.lines,
      styles: Array.isArray(version.styles) ? version.styles : [],
    }).then(function (row) {
      toast("השיר חזר לגרסה מ" + when);
      go(BASE + "/" + encodeURIComponent((row && row.slug) || song.slug));
    }).catch(function (error) {
      /* back to the page that was being read, so the failure is a sentence over
         a page rather than a word on an empty screen */
      route();
      toast("השחזור נכשל: " + error.message, true);
    });
  }

  function viewVersions(slug) {
    where("גרסאות");
    if (!auth.in) return needSignIn("הגרסאות של שיר שייכות לחשבון שכתב אותו. מה שפורסם פתוח לכולם, והדרך שהשיר עבר עד שם לא.");

    setBusy("טוען את הגרסאות");
    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);

      return versions.of(song.id).then(function (rows) {
        where("גרסאות של " + (song.title || "שיר"));
        app.innerHTML = "";

        function back() { go(BASE + "/" + encodeURIComponent(song.slug)); }

        var head = el("div", "song-head");
        head.appendChild(el("h1", null, song.title || "שיר"));
        head.appendChild(el("div", "by",
          "כל לחיצה על פורסם שומרת כאן את השיר כפי שיצא לעולם באותו רגע. אפשר לפתוח כל גרסה ולשחזר אותה."));
        app.appendChild(head);

        if (!rows.length) {
          var empty = el("div", "center");
          /* True whether nobody has published this song yet or it simply
             belongs to somebody else, and those two look identical from here:
             the database answers a stranger with an empty list, which is the
             right answer and not a fact about the song. */
          empty.appendChild(el("p", null, "אין כאן גרסאות עדיין. כל לחיצה על פורסם שומרת אחת."));
          empty.appendChild(button("חזרה לשיר", ICON.back, "ghost", back));
          app.appendChild(empty);
          return;
        }

        /* The list is newest first, so the version each row is read against is
           the NEXT one down. The oldest has nothing under it, and that is what
           makes it the first. */
        var list = el("ul", "list");
        rows.forEach(function (v, index) { list.appendChild(versionRow(song, v, rows[index + 1])); });
        app.appendChild(list);

        var actions = el("div", "row-actions");
        actions.appendChild(button("חזרה לשיר", ICON.back, "ghost small", back));
        actions.appendChild(button("לרשימת השירים", null, "ghost small", function () { go(BASE + "/"); }));
        var after = el("div", "after-list");
        after.appendChild(actions);
        app.appendChild(after);
      });
    }).catch(fail);
  }

  /* One version on the list. When it was published is the whole of what tells
     two of them apart at a glance, so that is the line in bold; underneath it
     is enough of what is inside to recognise the one being looked for.

     The one that matches the song as it stands says so. Without it a list of
     dates gives no answer at all to the question everybody actually arrives
     with: which of these is what is up there now. */
  function versionRow(song, v, before) {
    var li = el("li");
    var box = el("div", "row");

    var what = el("div");
    var top = el("div", "t-row");
    top.appendChild(el("div", "t", whenWords(v.created_at)));
    /* the name it went out under, when that is not the name it has now */
    if (v.title && v.title !== song.title) top.appendChild(el("div", "by", "בשם " + v.title));
    if (sameVersion(v, song)) top.appendChild(el("span", "tag tag-published", "זה מה שבשיר עכשיו"));
    what.appendChild(top);

    /* WHAT THIS ONE CHANGED, first, because that is what a list of dates is
       being read for: which of these is the one where the second verse came
       in. How long the song was and who it is by come after it. */
    var said = [changeWords(before ? diffLines(normalizeLines(before.lines, before.dir),
      normalizeLines(v.lines, v.dir)) : null, !before)];
    var many = lineCount(v);
    said.push(many === 1 ? "שורה אחת" : many + " שורות");
    var by = credits(v);
    if (by.length) said.push(by.map(function (c) { return c.label + ": " + c.name; }).join(", "));
    styles(v).forEach(function (kind) { said.push(kind); });
    what.appendChild(el("div", "a", said.join("  •  ")));
    box.appendChild(what);

    var buttons = el("div", "row-actions");
    buttons.appendChild(button("פתיחה", null, "ghost small", function () {
      go(BASE + "/" + encodeURIComponent(song.slug) + "/versions/" + encodeURIComponent(v.id));
    }));
    buttons.appendChild(button("שחזור", ICON.undo, "small", function () { restoreVersion(song, v); }));
    box.appendChild(buttons);

    li.appendChild(box);
    return li;
  }

  function viewVersion(slug, id) {
    if (!auth.in) return needSignIn("הגרסאות של שיר שייכות לחשבון שכתב אותו. מה שפורסם פתוח לכולם, והדרך שהשיר עבר עד שם לא.");

    setBusy("טוען את הגרסה");
    db.bySlug(slug).then(function (song) {
      if (!song) return notFound(slug);

      return versions.one(song.id, id).then(function (v) {
        if (!v) return noVersion(song);
        /* And the one before it, which is the only thing "what changed" can be
           answered against. Asked for here rather than when the button is
           pressed, so the button is offered only where there is an answer. */
        return versions.before(song.id, v.created_at).then(function (was) {
          renderSong(versionSong(song, v), { song: song, version: v, before: was });
        });
      });
    }).catch(fail);
  }

  function noVersion(song) {
    where("לא נמצא");
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, "הגרסה הזאת לא נמצאה."));
    box.appendChild(button("כל הגרסאות", null, "ghost", function () {
      go(BASE + "/" + encodeURIComponent(song.slug) + "/versions");
    }));
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
    where("לא נמצא");
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
  /* Three pages send people here now, so the sentence is theirs to write: the
     evenings, what was deleted, and the versions of a song are three different
     things that all belong to an account, and "you are not signed in" is not
     the answer to any of them on its own. The title is the page's own state
     rather than any of the three. */
  function needSignIn(said) {
    where("צריך חשבון");
    app.innerHTML = "";
    var box = el("div", "center");
    box.appendChild(el("p", null, said || "ערבי השירה שייכים לחשבון. כל אחד רואה, מתכנן ומוחק רק את שלו."));
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
    where("ערבי שירה");
    setBusy("טוען ערבים");

    /* The names come along, because they are what a row of this list shows.
       Only the names: an evening's card does not draw chords, so it has no
       use for the rest of a song. */
    Promise.all([sets.list(), db.titles()]).then(function (both) {
      app.innerHTML = "";
      /* what the box in the bar looks through, read here anyway */
      seedEvenings(both[0] || []);
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

      /* THE SAME WALL THE SONGS STAND IN. An evening is a card like a song is
         a card, so it is the same list, in the same columns, at the same
         width: two halves of one app should not be two different shapes.

         The box that used to stand over it is in the bar now, and it searches
         further than this one could: an evening is remembered by its name, by
         the room, by the date, or by a song that was sung at it, and the box
         up there reads all four along with the songs and the people. */
      var list = el("ul", "list");
      app.appendChild(list);

      evenings.forEach(function (evening) {
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

        /* NO CHIP SAYING "ערב". Every card on this page is one, so the word is
           a label on a shelf where nothing else is stocked. It is worth
           saying among the search results, where an evening stands next to
           songs and people, and it is worth saying nowhere else. */
        li.appendChild(a);
        list.appendChild(li);
      });
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

    /* The name is in the bar, like a song's, and the heading here is for
       paper: an evening is printed and handed round, and a sheet with no name
       on it is a list of songs. */
    var title = el("h1", "ev-title on-paper", evening.title);
    whereEditable(evening.title, "שם הערב", function (typed) {
      evening.title = typed;
      title.textContent = typed;
      document.title = (typed || "ערב חדש") + " | אקורדים";
      mark();
    });
    document.title = (evening.title || "ערב חדש") + " | אקורדים";
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
        var mine = shapesFor(song);
        if (mine.shapes.length) {
          var keys = el("div", "keys");
          keys.title = "השיר עצמו: " + mine.used.join("  ");
          /* only where the app worked the key out itself: under a key somebody
             chose, a fret is a note about a version they are not playing */
          if (mine.capo) keys.appendChild(el("span", "capo", "קפו " + mine.capo));
          mine.shapes.forEach(function (shape) { keys.appendChild(el("span", "k", shape)); });
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
        if (born) history.replaceState(history.state, "", BASE + "/evenings/" + row.id);
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

  /* --- WHERE YOU WERE ON THE PAGE YOU LEFT ---------------------------------
     The back button out of a song used to land at the top of the library,
     which after a scroll down a wall of a hundred songs means finding your
     place again by hand every single time.

     THE BROWSER CANNOT DO THIS ONE ITSELF, and turning it off is the point of
     the first line here. Its own restoring happens the moment the address
     changes, and at that moment the page it is restoring does not exist yet:
     the library is drawn from an answer that is still on its way from the
     database, so there is nothing on the screen and nothing to scroll to.
     Left on, all it does is fight the page while it arrives.

     So it is written down here instead. Every history entry the app makes
     carries a key; the place is saved under that key as the page is left, and
     it is put back once the page that came in is tall enough to hold it.

     Going BACK does not need any of this, because the page it goes to is still
     standing (see the stack of sheets above) and comes back at its own height
     with its own scroll. What is left for this to do is the case a stack
     cannot help with: RELOADING. F5 on a library scrolled half way down is a
     new tab as far as the page is concerned, and everything drawn is drawn
     again from nothing. The one thing that survives it is what the browser
     itself keeps, which is the history entry and the session's own store, so
     the places go there and are read back on the way in. */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  var KEPT_SCROLL = "chords:where-i-was";
  var scrollAt = {};
  var scrollStep = 0;

  /* Read on the way in, so a reload lands where the reader was. The counter
     comes back with them: keys go on being minted from where they stopped, and
     a fresh "s1" over a stored "s1" would be one page put back at another
     page's place. */
  try {
    var wasKept = JSON.parse(sessionStorage.getItem(KEPT_SCROLL) || "null");
    if (wasKept && wasKept.at) {
      scrollAt = wasKept.at;
      scrollStep = wasKept.step || 0;
    }
  } catch (e) { /* private window, or nonsense in the store */ }

  function keepScroll() {
    /* Forty places back is further than anybody presses, and the store is not
       a place to leave a morning's worth of them. Keys are minted in order, so
       the oldest are the ones at the front. */
    var keys = Object.keys(scrollAt);
    if (keys.length > 40) {
      keys.slice(0, keys.length - 40).forEach(function (k) { delete scrollAt[k]; });
    }
    try {
      sessionStorage.setItem(KEPT_SCROLL, JSON.stringify({ at: scrollAt, step: scrollStep }));
    } catch (e) { /* private window */ }
  }
  /* Where the page about to be drawn should end up, and which attempt at
     getting it there is the live one. */
  var scrollWanted = 0;
  var scrollTry = 0;
  /* The key of the entry on the screen right now, which is the one whose place
     is worth saving when it goes. */
  var scrollHere = null;

  /* An entry the app pushed carries its key. One it did not, which is the
     address the tab was opened on, gets one now. */
  function keyHere() {
    var had = history.state && history.state.k;
    if (had) return had;
    var k = "s" + (++scrollStep);
    history.replaceState({ k: k }, "");
    return k;
  }

  function leaving() {
    if (!scrollHere) return;
    scrollAt[scrollHere] = window.scrollY || window.pageYOffset || 0;
    keepScroll();
  }

  /* A tab being reloaded, closed or put in a pocket. The last of the three is
     the only one a phone reliably gives, which is why it is here and not on
     unload. */
  window.addEventListener("pagehide", leaving);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") leaving();
  });

  /* A hand on the page beats anything remembered about it: whoever is already
     scrolling has said where they want to be. */
  ["wheel", "touchstart", "keydown"].forEach(function (name) {
    window.addEventListener(name, function () { scrollTry++; }, { passive: true });
  });

  /* Keep reaching for a place until the page is tall enough to have one. A
     page being drawn rather than uncovered arrives in its own time: a spinner
     first, then whatever the database had to say, and only then is there
     anything to scroll past. */
  function holdScroll(want) {
    var mine = ++scrollTry;
    if (!want) return;

    var frames = 0;
    (function again() {
      if (mine !== scrollTry) return;
      var far = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (far >= want) return window.scrollTo(0, want);
      /* Two seconds of frames and then take what there is. A song deleted while
         you were away is a page that will never be that tall again, and a page
         that keeps reaching for a place that is not there is a page that will
         not let go of the scrollbar. */
      if (++frames > 120) return window.scrollTo(0, far);
      requestAnimationFrame(again);
    })();
  }

  function restoreScroll() {
    var want = scrollWanted;
    scrollWanted = 0;
    /* Every page starts at the top, including one on its way back to somewhere
       further down: what is under the header at this moment is the page being
       left, and it should not be seen half way through. */
    window.scrollTo(0, 0);
    holdScroll(want);
  }

  function go(href) {
    if (location.pathname === href) return;
    leaving();
    history.pushState({ k: "s" + (++scrollStep) }, "", href);
    scrollHere = history.state.k;
    /* forward is a page nobody has seen yet, so it starts at the top */
    scrollWanted = 0;
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
    /* whatever the page being left still owed the database */
    flushNow();
    /* A new page is a new question, and the answer to the old one hanging over
       it is a panel about where you have just been. */
    clearFind();

    /* --- BACK ONTO A SHEET THAT IS STILL THERE -----------------------------
       Not a page being opened: a page being uncovered. Nothing is fetched and
       nothing is drawn, the one above it is simply lifted off, and what was
       under it is standing where it was left, at the height it was left at.

       Unless something has been written since. Then it is a picture of a
       database that has moved on, and it is drawn again over itself. */
    var found = layerAt(scrollHere);
    if (found >= 0 && found !== at) {
      scrollWanted = 0;
      bury(layers[at]);
      var back = layers[found];
      reveal(back);
      if (back.writes !== writes) {
        back.writes = writes;
        /* Drawn over itself and put back at the same place, which needs the
           waiting again: for a moment it is a spinner and has no height. */
        holdScroll(back.y);
        draw();
      }
      return;
    }

    /* The sheet is put aside FIRST and the scroll reset after it, in that
       order: what is written down as the place the reader had got to is read
       off the window, and by the time the window has been sent back to the top
       the place it is being asked for is nought. */
    openLayer(scrollHere);
    restoreScroll();
    draw();
  }

  /* Everything the bar was holding for the page that is going. Nothing is
     printable until a view says it is, and every address starts out as not
     that; the name goes too, because the name of the last page is an answer
     about where you have just been. */
  function draw() {
    where("");
    document.body.classList.remove("on-song");
    state.songControls = null;
    state.redrawSong = null;
    state.rehome = null;
    state.wake = null;
    state.printable = false;
    state.printer = null;
    state.killer = null;
    state.editToggle = null;
    paintHeader();
    var p = parts();

    if (!p.length) return viewIndex(null);

    /* --- one shelf of it ---
       /style/<name>   the library, narrowed to one kind of song

       A style is a word tied onto a song and it is also a shelf, and a shelf
       is a thing worth having an address for: it is what somebody means when
       they go looking for "the circle songs", and it is what the search box
       hands back when they type one. Narrowing by hand writes the same
       address without leaving the page, so the two cannot disagree. */
    if (p[0] === "style") return viewIndex(p[1] || null);

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

    /* --- who wrote them ---
       /creators        everybody the library has a name for
       /creator/<name>  one of them, with everything they wrote

       The name is the address, unencoded by parts() along with the rest of
       the path, because a person has no id to be named by: they are what the
       songs say (see creatorsOf), and what the songs say is a name. */
    if (p[0] === "creators") return viewCreators();
    if (p[0] === "creator") {
      if (!p[1]) return viewCreators();
      return viewCreator(p[1]);
    }

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
      history.replaceState(history.state, "", BASE + "/" + encodeURIComponent(p[0]));
      return viewSong(p[0]);
    }

    /* --- what the song was ---
       /<slug>/versions        every version of it that was published
       /<slug>/versions/<id>   one of them, opened as the song it was

       Under the song's own address rather than beside it, because that is what
       they are: not other songs, this one at earlier moments. Both need an
       account, and not only to write: a history belongs to the account that
       wrote it, and the database answers nothing at all without one. */
    if (p.length >= 2 && p[1] === "versions") {
      if (p[2]) return viewVersion(p[0], p[2]);
      return viewVersions(p[0]);
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
    history.replaceState(history.state, "", clean + location.hash);
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

    history.replaceState(history.state, "", back && back.indexOf(BASE) === 0 ? back : BASE + "/");

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

  /* Back and forward. The address has already changed by the time this runs,
     but nothing has scrolled, so what is on the screen is still the page being
     left and its place can be taken now. */
  window.addEventListener("popstate", function () {
    leaving();
    scrollHere = keyHere();
    scrollWanted = scrollAt[scrollHere] || 0;
    route();
  });

  /* A window dragged across the narrow line changes what the header is allowed
     to offer, and a button that was true when it was painted is not true any
     more. Cheap enough to redraw, and it is the same function the routing
     calls. */
  if (NARROW.addEventListener) {
    NARROW.addEventListener("change", function () {
      /* And every sheet under this one was drawn for the width that is no
         longer the width. */
      forgetCovered();
      paintHeader();
      /* and the library's own three things, which are in the bar on a desk and
         in a row over the wall on a phone */
      if (state.rehome) state.rehome();
      /* and the song with it, since which of reading and writing it is was
         answered by the width it was drawn at */
      if (state.redrawSong) {
        flushNow();
        state.redrawSong();
      }
    });
  }

  absorbFallback();
  /* The address the tab opened on is a history entry like any other, and it is
     the one everything else will be coming back to. If this is a reload rather
     than a first visit, the entry is the SAME entry, so the place the reader
     was standing at is still written down under it. */
  scrollHere = keyHere();
  scrollWanted = scrollAt[scrollHere] || 0;
  /* The box in the bar is built once and stays for the life of the tab: it is
     the same box on every page, and rebuilding it on each one would take the
     focus out of it every time somebody pressed a result. */
  buildFind();
  auth.load();
  /* after the session is loaded, because coming back from Google replaces it,
     and before the routing, because what the first page draws depends on
     whether there is one */
  absorbGoogle();
  route();
})();
