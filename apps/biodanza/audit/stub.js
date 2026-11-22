(function () {
  function b64(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  var jwt = b64({ alg: "none" }) + "." + b64({ sub: "u-1", email: "tester@example.com", user_metadata: { name: "Tester" } }) + ".x";
  try { localStorage.setItem("floa.session", JSON.stringify({ access_token: jwt, refresh_token: "r", expires_at: Date.now() + 86400000 })); } catch (e) {}
  var U = "https://aexmnaxvahblveejsbup.supabase.co";
  var M = {
    m1: { id: "m1", name: "adagio", title: "Adagio for Strings", artist: "Samuel Barber", duration_sec: 483, audio_object: "a1.mp3", in_catalog: true },
    m2: { id: "m2", name: "hallelujah", title: "Hallelujah", artist: "Leonard Cohen", duration_sec: 276, audio_object: "a2.mp3", in_catalog: true },
    m3: { id: "m3", name: "noaudio", title: "Por Una Cabeza", artist: "Carlos Gardel", duration_sec: 190, audio_object: null, in_catalog: true },
    m4: { id: "m4", name: "long", title: "Symphony No. 9 in D minor, Op. 125 Choral: IV. Presto - Allegro assai (Ode to Joy) with a very long title that wraps", artist: "Ludwig van Beethoven, Berlin Philharmonic Orchestra, Herbert von Karajan", duration_sec: 1450, audio_object: "a4.mp3", in_catalog: true },
    m5: { id: "m5", name: "yt", title: "Song from the web", artist: "Someone", duration_sec: 0, audio_object: null, in_catalog: false },
    m6: { id: "m6", name: "heb", title: "שיר ערש עתיק", artist: "אפרת לוי", duration_sec: 205, audio_object: "a6.mp3", in_catalog: true },
    m7: { id: "m7", name: "m7", title: "Clair de Lune", artist: "Claude Debussy", duration_sec: 302, audio_object: "a7.mp3", in_catalog: true },
    m8: { id: "m8", name: "m8", title: "Gymnopedie No.1", artist: "Erik Satie", duration_sec: 187, audio_object: "a8.mp3", in_catalog: true }
  };
  var opt = function (ids) { return ids.map(function (id, i) { return { music_id: id, created_at: "2026-11-0" + (i + 1) + "T10:00:00Z", music: M[id] }; }); };
  function item(i, id, title, mus, opts) {
    return { id: id, position: i, exercise_id: "e" + i, music_id: mus, backlog: false, notes: "", title: title, poetics: "", guidance: "", exercises: { title_he: title, title_en: "", poetics: "", guidance: "", objective: "", exercise_texts: [] },
      music: mus ? M[mus] : null, vivencia_item_facilitators: (i % 2 ? [{ email: "a@x.com" }] : [{ email: "b@x.com" }]), item_music_options: opt(opts || (mus ? [mus] : [])) };
  }
  var ITEMS = [
    item(1, "i1", "הליכה בקבוצה", "m1", ["m1", "m2", "m3"]),
    item(2, "i2", "מפגש עיניים", "m2", ["m2"]),
    item(3, "i3", "התעוררות הגוף", "m3", ["m3"]),
    item(4, "i4", "קשר משולש", "m4", ["m4"]),
    item(5, "i5", "ריקוד חופשי", "m5", ["m5"]),
    item(6, "i6", "תרגיל בלי מוזיקה", null, [])
  ];
  var RECV = [
    { kind: "start", music_id: "m6", created_at: "2026-11-01T10:00:00Z", position: 0, music: M.m6 },
    { kind: "start", music_id: "m7", created_at: "2026-11-02T10:00:00Z", position: 1, music: M.m7 },
    { kind: "end", music_id: "m8", created_at: "2026-11-01T10:00:00Z", position: 0, music: M.m8 }
  ];
  var CAT = Object.keys(M).map(function (k) { return M[k]; });
  function route(url, method) {
    var u = url.slice(U.length), path = u.split("?")[0], q = u.indexOf("?") >= 0 ? u.slice(u.indexOf("?") + 1) : "";
    if (method !== "GET" && method !== "POST") return null;
    if (path === "/rest/v1/listen_history") return [{ audio_object: "a1.mp3", title: "Song One", artist: "Artist A", played_at: new Date(Date.now() - 60000).toISOString() }, { audio_object: "a2.mp3", title: "Song Two", artist: "Artist B", played_at: new Date(Date.now() - 900000).toISOString() }];
    if (path === "/rest/v1/rpc/me") return { allowed: true, admin: false, super: false };
    if (path === "/rest/v1/rpc/vivencia_members") return [{ email: "a@x.com", note: "אופיר אבירם" }, { email: "b@x.com", note: "הדר לוריא" }];
    if (path === "/rest/v1/rpc/similar_music") return [{ music_id: "m7" }, { music_id: "m8" }, { music_id: "m6" }, { music_id: "m4" }];
    if (path === "/rest/v1/rpc/role_music") return [{ music_id: "m6" }, { music_id: "m7" }];
    if (path === "/rest/v1/vivencias") return [{ id: "v1", title: "ויוונסיה לדוגמה", updated_at: "2026-11-19T10:00:00Z", vivencia_items: [{ count: 6 }] }];
    if (path === "/rest/v1/vivencia_owners") return [{ vivencia_id: "v1", position: 0 }];
    if (path === "/rest/v1/vivencia_items") return ITEMS;
    if (path === "/rest/v1/vivencia_reception_music") return RECV;
    if (path === "/rest/v1/vivencia_opening") return [{ vivencia_id: "v1", who: "הדר", body: "רולנדו טורו, יוצר השיטה, פיתח אותה מתוך התבוננות במצבי חיים", position: 1 }, { vivencia_id: "v1", who: "אופיר", body: "אני אופיר 5 שנים. הבנתי מה זה. בית ספר לחיים", position: 2 }];
    if (path === "/rest/v1/music") {
      var m = /id=in\.\(([^)]*)\)/.exec(q); if (m) return m[1].split(",").map(function (id) { return M[id]; }).filter(Boolean);
      return CAT;
    }
    if (path === "/rest/v1/exercise_music") {
      return [{ exercise_id: "ex1", exercises: { id: "ex1", title_he: "הליכה", title_en: "Walking" }, music: M.m1 }, { exercise_id: "ex1", exercises: { id: "ex1", title_he: "הליכה", title_en: "Walking" }, music: M.m2 }, { exercise_id: "ex2", exercises: { id: "ex2", title_he: "מפגש", title_en: "Meeting" }, music: M.m7 }];
    }
    return [];
  }
  window.__bioCalls = [];
  var of = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (url.indexOf(U + "/") === 0) {
      window.__bioCalls.push(method + " " + url.slice(U.length, U.length + 80));
      var body = route(url, method);
      if (url.indexOf("/auth/v1/") >= 0) body = {};
      var st = body === null ? 204 : 200;
      return Promise.resolve(new Response(body === null ? null : JSON.stringify(body), { status: st, headers: { "content-type": "application/json" } }));
    }
    if (url.indexOf("https://api.floa.co.il/biodanza/audio/") === 0) {
      var n = 8000, secs = 600, buf = new ArrayBuffer(44 + n * secs), v = new DataView(buf), w = function (o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      w(0, "RIFF"); v.setUint32(4, 36 + n * secs, true); w(8, "WAVEfmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, n, true); v.setUint32(28, n, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n * secs, true);
      new Uint8Array(buf, 44).fill(128);
      return Promise.resolve(new Response(buf, { status: 200, headers: { "content-type": "audio/wav", "content-length": String(buf.byteLength) } }));
    }
    if (/^https?:\/\/(fonts\.|api\.floa)/.test(url)) return Promise.reject(new TypeError("blocked"));
    return of.apply(this, arguments);
  };
  window.WebSocket = function () { return { readyState: 3, send: function () {}, close: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
  window.WebSocket.OPEN = 1; window.WebSocket.CONNECTING = 0; window.WebSocket.CLOSED = 3; window.WebSocket.CLOSING = 2;
})();
