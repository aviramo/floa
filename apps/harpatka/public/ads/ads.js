/* THE ADS PAGE of יוצאים להרפתקה (harpatka/ads/), on the FLOA kit.

   Categories: the ads (מסרים הכרויות, מסרים תנועה, אחרים הכרויות, אחרים תנועה, the clients), חומרי גלם (raw images and videos, a
   collage that keeps each file's own ratio) and מוזיקות (one card per audio file, played by the kit's sound engine and player).
   ?a=<id> shows one item only (an ad's id is its file base, e.g. ad-07; a raw or music item's id is its key). ?c=<category> opens a category.
   Every media address and every store call goes through FLOA's shared module, /media.js (window.FloaMedia, worker/MEDIA.md).
   The ad list is data in the store: ads/_data/featured.json, ads.json and videos.json (a new ad appears without a publish); the copies in
   _data/ beside this page are read in dev mode and when the store does not answer. An ad whose image left the public index stays hidden.
   Delete (in the ⋯ menu) is shown only to staff; it moves the files to the trash, and the trash (staff only) restores them. */
(function () {
  "use strict";
  var Q = new URLSearchParams(location.search);
  var soloId = Q.get("a") || "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function sym(n) { return '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#' + n + '"/></svg>'; }
  function node(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  var age = function (k) { return window.ageText ? ageText(k) : ""; };

  /* ---- the store: FLOA's shared module. The harpatka-only part is the dev data: it names private raw and music files, so it is never
     beside this public page. It sits in apps/harpatka/tools/ads/_data/ and a local static server serves it in dev (?devdata=<a local url>) ---- */
  var dd = Q.get("devdata") || "", DEVDATA = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(dd) ? dd.replace(/\/?$/, "/") : "http://127.0.0.1:8098/";
  var M = window.FloaMedia.setup({ dev: { manifest: DEVDATA + "dev-manifest.json" } });
  var DATA = function (f) { return M.data("ads/_data/" + f, { local: "_data/" + f, public: true }); };   /* the store's copy, else the one beside the page.
     public: true is our promise that _data/ beside this page is public (it is under public/): only for these ads files, never raw/ or music/ */
  var AGE = /\{age\}/g;   /* featured.json writes the age range as {age}: it comes from shared/age.js, the one source of the range */
  /* clients: a category per client (?c=client-plus). A new client: a name in CLIENTS; an ad to a client: its base in CLIENT_OF */
  var CLIENTS = { plus: "פלוסים", pardes: "פרדס חנה", paphos: "פאפוס" };
  var CLIENT_OF = { "letgo-v4": "plus", "festival-plus": "plus", taltalia: "pardes", paphos: "paphos", "paphos-30s": "paphos", "biodanza-voices-40s": "paphos", "biodanza-voices-40s-phone": "paphos" };
  var LABEL_STAFF = {};
  var CATS = [["", "הכל"], ["dating", "מסרים הכרויות"], ["move", "מסרים תנועה"], ["other-dating", "אחרים הכרויות"], ["other-move", "אחרים תנועה"]];
  Object.keys(CLIENTS).forEach(function (k) { CATS.push(["client-" + k, CLIENTS[k]]); });
  CATS.push(["raw", "חומרי גלם"], ["music", "מוזיקות"]);
  var STAFF_CATS = [["trash", "סל"]];   /* staff only: the option is added once the store says so */
  STAFF_CATS.forEach(function (c) { LABEL_STAFF[c[0]] = c[1]; });
  var LABEL = {}; CATS.forEach(function (c) { LABEL[c[0]] = c[1]; });
  Object.keys(LABEL_STAFF).forEach(function (k) { LABEL[k] = LABEL_STAFF[k]; });
  var cat = Q.get("c") || ""; if (!Object.prototype.hasOwnProperty.call(LABEL, cat)) cat = "";
  function blockOf(c) { return c === "raw" || c === "music" || c === "trash" ? c : "ads"; }

  /* ---- the shell: a header, the category field (a bar), one list ---- */
  var head = '<header class="rhead">' + (soloId ? '<a class="rbtn rbtn--icon" href="./" aria-label="לכל המודעות" title="לכל המודעות">' + sym("back") + "</a>" : "") +
    '<div class="rhead__text"><span class="rhead__tw"><h1 class="rhead__title" id="ttl">מודעות</h1></span></div>' +
    (soloId ? "" : '<span class="rhead__acts"><button type="button" class="rbtn rbtn--icon" id="qs" data-rsearch aria-label="חיפוש" title="חיפוש">' + sym("search") + "</button></span>") + "</header>";
  var field = '<label class="rfield"><span>מה מוצג</span><select id="cat">' + CATS.concat(cat === "trash" ? STAFF_CATS : []).map(function (c) { return '<option value="' + c[0] + '">' + esc(c[1]) + "</option>"; }).join("") + "</select></label>";
  var list = '<div class="rlist" id="out">' +
    '<div class="rlayout rlayout--grid rgrid" id="bads" data-block="ads"></div>' +
    '<div id="braw" data-block="raw" data-collage hidden></div>' +
    '<div class="rlayout rlayout--grid rgrid" id="bmusic" data-block="music" hidden></div>' +
    '<div id="btrash" data-block="trash" data-collage hidden></div>' +
    '<div class="rempty" id="none" role="status" hidden></div></div>';
  var app = document.getElementById("app");
  app.innerHTML = RosterLayout.html({ surface: true, head: head, bars: soloId ? [] : [RosterLayout.html({ pad: "x", slots: [field] })], body: list });
  RosterHeader.fit(app.querySelector(".rhead"));
  if (window.RosterAppMenu) RosterAppMenu.attach({ items: function () { return []; } });   /* sign in and out: the kit's own items */
  var out = document.getElementById("out"), none = document.getElementById("none"), sel = document.getElementById("cat");
  var BLOCK = { ads: document.getElementById("bads"), raw: document.getElementById("braw"), music: document.getElementById("bmusic"), trash: document.getElementById("btrash") };
  var loaded = { ads: false, raw: false, music: false, trash: false }, failed = {};
  Object.keys(BLOCK).forEach(function (b) { BLOCK[b].classList.add("rload"); BLOCK[b].setAttribute("aria-busy", "true"); });
  if (sel) { sel.value = cat; sel.addEventListener("change", function () { cat = sel.value; out.scrollTop = 0; apply(); paintPlayer(); }); }

  /* ---- items: { id, kind ("ad" | "raw" | "music"), title, text (searched), cr, img, vid, audio (keys), w, h, cat, el } ---- */
  var items = [], byId = {}, admin = false, curQ = "";
  M.isAdmin().then(function (a) {
    admin = !!a;
    if (admin && sel) STAFF_CATS.forEach(function (c) { if (![].some.call(sel.options, function (o) { return o.value === c[0]; })) { var o = document.createElement("option"); o.value = c[0]; o.textContent = c[1]; sel.appendChild(o); } });
    if (admin) { loadTrash(); loadLinks(); } else done("trash", "forbidden");
  });
  var CR_CHIP = '<span class="rchip rchip--ink">' + sym("warn") + "<span>מוגן בזכויות יוצרים</span></span>";
  function moreBtn(it) { return '<button type="button" class="rbtn rbtn--icon" data-more aria-haspopup="menu" aria-label="' + esc("פעולות על " + it.title) + '" title="פעולות">' + sym("more") + "</button>"; }
  function dims(it) { return it.w && it.h ? ' width="' + it.w + '" height="' + it.h + '"' : ""; }
  function restoreBtn(it) { return '<button type="button" class="rbtn rbtn--text" data-restore aria-label="' + esc("שחזור של " + it.title) + '">שחזור</button>'; }   /* the trash has one action: a button (a menu of one is not allowed) */
  var LC = '<span class="rchip" data-lc hidden></span>';   /* how many ads use a raw file or a song: staff only, filled by paintLinks */
  function tileHtml(it) {
    var card = RosterCard.html({ title: it.title, sub: it.sub, chip: (it.cr ? CR_CHIP : "") + (it.kind === "raw" ? LC : ""), act1: it.kind === "trash" ? restoreBtn(it) : moreBtn(it) });
    if (it.kind === "trash" && !it.img && !it.vid) return '<div class="rlayout rlayout--unit" data-tile data-rsearch-item data-id="' + esc(it.id) + '">' + card + "</div>";
    var media = it.img ? '<img data-key="' + esc(it.img) + '" src="' + esc(M.url(it.img)) + '" crossorigin="anonymous" alt="' + esc(it.alt || it.title) + '" loading="lazy"' + dims(it) + ">"
      : '<video data-key="' + esc(it.vid) + '" src="' + esc(M.url(it.vid)) + '#t=0.1" crossorigin="anonymous" preload="metadata" muted playsinline' + dims(it) + "></video>";
    return '<div class="rlayout rlayout--unit" data-tile data-rsearch-item data-id="' + esc(it.id) + '">' + card +
      '<button type="button" data-open aria-label="' + esc((it.vid ? "ניגון " : "הגדלה של ") + it.title) + '">' + media + "</button></div>";
  }
  function musicHtml(it) {
    return RosterCard.html({ title: it.title, sub: it.sub, chip: (it.cr ? CR_CHIP : "") + LC,
      act1: '<button type="button" class="rbtn rbtn--icon" data-audio="' + esc(it.audio) + '" data-list="music" aria-label="השמעה" title="השמעה"></button>' + moreBtn(it),
      attrs: 'data-rsearch-item data-id="' + esc(it.id) + '"' });
  }
  function add(it, block) {
    if (byId[it.id]) return;
    it.el = node(it.kind === "music" ? musicHtml(it) : tileHtml(it));
    items.push(it); byId[it.id] = it; BLOCK[block].appendChild(it.el);
  }
  function catOfAd(c) { return CLIENT_OF[c.base] ? "client-" + CLIENT_OF[c.base] : c.type === "msg" ? "dating" : c.type === "move" ? "move" : c.cat === "dating" ? "other-dating" : "other-move"; }
  function adItem(c) {
    var img = c.img ? "ads/" + c.img : "", vid = c.vid ? "ads/" + c.vid : "";
    var fixed = vid && c.type && c.type !== "photo" ? (c.type === "move" ? "להכניס תנועה חדשה לחיים" : "מפגש מסוג אחר") + " לגילאי " + age("to") + " בפרק פתוח בחיים הזמנה יוצאים להרפתקה" : "";
    return { id: c.base, kind: "ad", title: String(c.label), cr: !!c.cr, img: img, vid: vid, w: c.w, h: c.h, alt: c.alt, cat: catOfAd(c),
      text: [c.label, c.name, c.alt, c.cr ? "מוגן בזכויות יוצרים" : "", fixed].join(" "), file: c.base };
  }
  function pretty(name) { return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim(); }

  /* ---- loading: the ads (page data, filtered by what the store still has), the raw materials and the music (listed from the store) ---- */
  function done(b, ok) {   /* ok: true, or why it failed ("signin", "forbidden", or the contract's code) */
    loaded[b] = true; failed[b] = ok === true ? "" : ok || "error";
    BLOCK[b].classList.remove("rload"); BLOCK[b].removeAttribute("aria-busy");
    paintLinks(); apply();
  }

  /* ---- the relations, staff only: which raw files and which song each ad uses. raw/_data/links.json is PRIVATE (it names private files),
     read through FloaMedia.data (a staff list of raw/_data/); non-staff never ask for it. Built by apps/harpatka/tools/ads/build_links.py.
     { version, ads: { <ad id>: { raw: [keys], music: [keys] } }, raw: { <key>: [ad ids] }, music: { <key>: [ad ids] } }.
     Only what is on the page counts: a file or an ad in the trash (or not listed) is left out. ---- */
  var links = null;
  function loadLinks() {
    M.data("raw/_data/links.json", M.dev ? { local: DEVDATA + "links.json" } : {}).then(function (d) { links = d && d.ads ? d : null; paintLinks(); }, function () { links = null; });
  }
  function live(ids) { return (ids || []).filter(function (id) { var x = byId[id]; return x && x.kind !== "trash"; }); }
  function adsOf(key) { return links ? live((links.raw && links.raw[key]) || (links.music && links.music[key])) : []; }
  function nAds(n) { return n === 1 ? "מודעה אחת" : n + " מודעות"; }
  function paintLinks() {
    items.forEach(function (it) {
      var c = it.el.querySelector("[data-lc]"); if (!c) return;
      var n = admin ? adsOf(it.id).length : 0, t = n ? nAds(n) : "";
      if (c.textContent !== t) c.textContent = t;
      if (c.hidden !== !n) c.hidden = !n;
    });
  }
  function loadAds() {
    var opt = function (p) { return p.catch(function () { return null; }); };
    return Promise.all([opt(DATA("ads.json")), opt(DATA("videos.json")), opt(M.list("ads/")), DATA("featured.json")]).then(function (r) {
      var have = r[2] ? {} : null; if (r[2]) r[2].forEach(function (x) { have[x.key] = x; });
      var keep = function (it) {   /* a file that left the store (deleted) is not shown; the index says whether it is copyrighted */
        var x = have && (have[it.img] || have[it.vid]); if (x && x.copyright && !it.cr) { it.cr = true; it.text += " מוגן בזכויות יוצרים"; }
        return have ? !!x : !M.trashed(it.img || it.vid);
      };
      (Array.isArray(r[3]) ? r[3] : []).map(function (c) { return Object.assign({ type: "photo" }, c, { label: String(c.label || "").replace(AGE, age("to")), alt: String(c.alt || "").replace(AGE, age("to")) }); }).map(adItem).filter(keep).forEach(function (it) { add(it, "ads"); });
      var vids = r[1] || {};
      (Array.isArray(r[0]) ? r[0].slice().sort(function (x, y) { return y.id - x.id; }) : []).forEach(function (a) {   /* the newest first */
        var pad = String(a.id).padStart(2, "0"), f = vids[String(a.id)];
        var it = adItem({ label: "מודעה " + a.id, name: "מודעה " + a.id, type: a.type || "msg", base: "ad-" + pad, img: "img/" + a.file, vid: f ? "video/" + f : "", w: 1080, h: 1920, alt: a.text });
        if (keep(it)) add(it, "ads");
      });
      done("ads", true);
    }, function () { done("ads", "error"); });
  }
  function loadRaw() {
    return M.list("raw/").then(function (l) {
      (l || []).filter(function (x) { return x.type === "image" || x.type === "video"; }).forEach(function (x) {
        var title = x.title || pretty(x.name);
        add({ id: x.key, kind: "raw", title: title, cr: !!x.copyright, img: x.type === "image" ? x.key : "", vid: x.type === "video" ? x.key : "", w: x.w, h: x.h, cat: "raw", text: title + " " + x.name, file: x.name.replace(/\.[^.]+$/, "") }, "raw");
      });
      done("raw", true);
    }, function (e) { done("raw", e && e.code || "error"); });
  }
  var audio = null;
  function loadMusic() {
    return M.list("music/").then(function (l) {
      var keys = [];
      (l || []).filter(function (x) { return x.type === "audio"; }).forEach(function (x) {
        var title = x.title || pretty(x.name);
        add({ id: x.key, kind: "music", title: title, cr: !!x.copyright, sub: (x.name.split(".").pop() || "").toUpperCase(), audio: x.key, cat: "music", text: title + " " + x.name, file: x.name.replace(/\.[^.]+$/, "") }, "music");
        keys.push(x.key); if (audio) audio.info(x.key, title, "");
      });
      if (audio) audio.setLists({ music: keys });
      done("music", true);
    }, function (e) { done("music", e && e.code || "error"); });
  }
  var TOPNAME = { ads: "מודעות", raw: "חומרי גלם", music: "מוזיקות" };
  function loadTrash() {
    return M.list("trash/").then(function (l) {
      (l || []).forEach(function (x) {
        var orig = x.key.replace(/^trash\//, ""), title = x.title || pretty(x.name);
        add({ id: x.key, kind: "trash", title: title, cr: !!x.copyright, sub: TOPNAME[orig.split("/")[0]] || "", img: x.type === "image" ? x.key : "", vid: x.type === "video" ? x.key : "",
          w: x.w, h: x.h, cat: "trash", text: title + " " + x.name, file: x.name.replace(/\.[^.]+$/, "") }, "trash");
      });
      done("trash", true);
    }, function (e) { done("trash", e && e.code || "error"); });
  }
  function loadAll() { M.ready().then(function () { loadAds(); loadRaw(); loadMusic(); }); }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest("[data-signin]") && window.FLOA_AUTH) FLOA_AUTH.signIn(); });
  document.addEventListener("click", function (e) {   /* a load that failed: ONE action, "ניסיון נוסף" */
    if (!(e.target.closest && e.target.closest("[data-retry]"))) return;
    var b = blockOf(cat); loaded[b] = false; failed[b] = false; BLOCK[b].classList.add("rload"); BLOCK[b].setAttribute("aria-busy", "true"); apply();
    (b === "raw" ? loadRaw : b === "music" ? loadMusic : b === "trash" ? loadTrash : loadAds)();
  });

  /* ---- what is shown: the category, the search (the kit's matching), ?a= ---- */
  var EMPTY = { ads: "עוד אין מודעות כאן", raw: "עוד אין חומרי גלם", music: "עוד אין מוזיקות", trash: "הסל ריק" };
  var ICON = { ads: "image", raw: "image", music: "music", trash: "delete" };
  function apply() {
    var count = {}, shown = 0, soloBlock = "";
    items.forEach(function (it) {
      var hit = !curQ || RosterSearch.match(it.text, curQ);
      if (hit) { count[it.cat] = (count[it.cat] || 0) + 1; if (it.kind === "ad") count[""] = (count[""] || 0) + 1; }
      var on = soloId ? it.id === soloId : hit && (cat === "" ? it.kind === "ad" : it.cat === cat);
      if (it.el.hidden === on) it.el.hidden = !on;
      if (on) { shown++; if (soloId) soloBlock = it.kind === "ad" ? "ads" : it.kind; }
    });
    var want = soloId ? soloBlock : blockOf(cat);
    Object.keys(BLOCK).forEach(function (b) { BLOCK[b].hidden = b !== want; });
    if (sel) [].forEach.call(sel.options, function (o) { var t = LABEL[o.value] + " (" + (count[o.value] || 0) + ")"; if (o.textContent !== t) o.textContent = t; });
    /* the empty states: after the content came, never while it loads; a search with no match is the kit's own empty state */
    var all = loaded.ads && loaded.raw && loaded.music, b = blockOf(cat), msg = "", why = failed[b];
    if (soloId) { if (all && !shown) msg = sym("image") + "<b>המודעה לא נמצאה</b>" + '<a class="rbtn" href="./">לכל המודעות</a>'; }
    else if (loaded[b] && why === "signin") msg = sym("lock") + "<b>רק לצוות</b><span>צריך להיכנס כדי לראות את זה</span>" + '<button type="button" class="rbtn" data-signin>כניסה</button>';
    else if (loaded[b] && why === "forbidden") msg = sym("lock") + "<b>רק לצוות</b><span>החשבון הזה לא מורשה לראות את זה</span>";
    else if (loaded[b] && why) msg = sym("warn") + "<b>לא הצלחנו לטעון</b><span>בדקו את החיבור ונסו שוב</span>" + '<button type="button" class="rbtn" data-retry>ניסיון נוסף</button>';
    else if (loaded[b] && !shown && !curQ) msg = sym(ICON[b]) + "<b>" + EMPTY[b] + "</b>";
    if (msg && none.innerHTML !== msg) none.innerHTML = msg;
    none.hidden = !msg;
    if (soloId) { var it = byId[soloId]; var t = it ? (it.kind === "ad" ? "מודעה " + it.title : it.title) : "מודעה"; if (document.title !== t) document.title = t; }
  }
  if (!soloId) RosterSearch.attach(document.getElementById("qs"), out, { label: "חיפוש מודעה", key: "harpatka.ads", icon: sym("search"),
    onQuery: function (q) { curQ = q || ""; apply(); } });

  /* ---- the ⋯ menu: share and download, delete for an admin ---- */
  function notice(t) { RosterApp.notice(t, { kind: "info" }); }   /* the kit's notice (ui/docs/toast.md, /app.js): a short window anchored to the round button */
  var files = {};
  function fetchKey(key) {   /* a 403 from storage: the presigned url ran out; once more with a fresh one */
    return fetch(M.url(key)).then(function (r) { return r.status === 403 ? M.renew(key).then(function (u) { return fetch(u); }) : r; });
  }
  function getFile(key, name, type) {
    return files[key] || (files[key] = fetchKey(key).then(function (r) { return r.ok ? r.blob() : Promise.reject(r.status); })
      .then(function (b) { return new File([b], name, { type: type }); }).catch(function (e) { delete files[key]; throw e; }));
  }
  function share(key, name, type) {   /* the file itself, through the device's share menu; without it, the link */
    var u = M.url(key);
    getFile(key, name, type).then(function (f) {
      if (navigator.canShare && navigator.canShare({ files: [f] })) return navigator.share({ files: [f] });
      throw 0;
    }).catch(function (e) {
      if (e && e.name === "AbortError") return;
      if (e && e.name === "NotAllowedError") { notice("הקובץ מוכן, אפשר ללחוץ שוב על שיתוף"); return; }
      if (navigator.share) { navigator.share({ url: u }).catch(function () {}); return; }
      copy(u);
    });
  }
  function copy(u) { (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { notice("הקישור הועתק"); }, function () { window.prompt("הקישור:", u); }); }
  function itemUrl(it) { var u = new URL(location.href); u.search = ""; u.hash = ""; u.searchParams.set("a", it.id); return u.href; }
  function shareLink(it) {
    var u = itemUrl(it);
    if (navigator.share) navigator.share({ title: it.title, url: u }).catch(function (e) { if (!(e && e.name === "AbortError")) copy(u); });
    else copy(u);
  }
  function download(key, name) {   /* through a blob, so a file from another origin is saved with its name */
    function a(href) { var x = document.createElement("a"); x.href = href; x.download = name; x.rel = "noopener"; document.body.appendChild(x); x.click(); x.remove(); }
    fetchKey(key).then(function (r) { return r.ok ? r.blob() : Promise.reject(); }).then(function (b) { var o = URL.createObjectURL(b); a(o); setTimeout(function () { URL.revokeObjectURL(o); }, 4000); }, function () { a(M.url(key)); });
  }
  var MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav" };
  function fileOf(it, key, kind) {
    var ext = (key.split(".").pop() || "").toLowerCase(), base = it.kind === "ad" ? it.file : it.file;
    return { key: key, name: base + "." + ext, type: MIME[ext] || "", kind: kind };
  }
  function kinds(it) {   /* the order: video, image (an ad with no video: the image only); a raw file or a song: itself */
    var k = [];
    if (it.vid) k.push(fileOf(it, it.vid, "סרטון"));
    if (it.img) k.push(fileOf(it, it.img, "תמונה"));
    if (it.audio) k.push(fileOf(it, it.audio, "קובץ"));
    return k;
  }
  function moreItems(it) {
    var m = [{ label: "שיתוף קישור", icon: sym("copy"), fn: function () { shareLink(it); } }];
    kinds(it).forEach(function (f) {
      m.push({ sep: true }, { label: "שיתוף " + f.kind, icon: sym("share"), fn: function () { share(f.key, f.name, f.type); } },
        { label: "הורדת " + f.kind, icon: sym("download"), fn: function () { download(f.key, f.name); } });
    });
    var used = it.kind === "music" && admin ? adsOf(it.id) : [];
    if (used.length) m.push({ sep: true }, { label: "מודעות עם השיר הזה", icon: sym("image"), fn: function () { openRelated(it, used); } });
    if (admin) m.push({ sep: true }, { label: "מחיקה", icon: sym("delete"), fn: function () { askDelete(it); } });
    return m;
  }
  function askDelete(it) {
    var keys = [it.img, it.vid, it.audio].filter(Boolean);
    RosterSheet.confirm({ title: esc("למחוק את " + it.title + "?"), text: esc("הקובץ עובר לסל, ואפשר לשחזר אותו משם"), action: "מחיקה",
      submit: function () {
        return M.remove(keys).then(function (r) {
          var main = it.img || it.audio || it.vid;
          if (r.done.indexOf(main) >= 0) drop(it);   /* an ad is gone once its picture is: the index hides it */
          if (r.failed.length) notice("לא נמחקו: " + names(r.failed));
          if (admin) loadTrash();   /* it shows in the trash at once */
        }, function () { throw { message: "לא הצלחנו למחוק, נסו שוב" }; });
      } });
  }
  function drop(it) {
    if (audio && it.audio && cur.name === it.audio && cur.playing) audio.playPause();
    it.el.remove(); items = items.filter(function (x) { return x !== it; }); delete byId[it.id];
    if (audio && it.kind === "music") audio.setLists({ music: items.filter(function (x) { return x.kind === "music"; }).map(function (x) { return x.audio; }) });
    paintLinks(); apply();
  }

  function names(failed) { return failed.map(function (f) { return String(f.key || "").split("/").pop(); }).join(", "); }
  function restoreItem(it, b) {   /* back from the trash, to the same key: it shows in its folder at once (an ad when the index has it again) */
    b.setAttribute("aria-busy", "true");
    M.restore([it.id]).then(function (r) {
      drop(it);
      if (r.failed.length) notice("לא שוחזרו: " + names(r.failed));
      var top = it.id.replace(/^trash\//, "").split("/")[0];
      if (top === "raw") loadRaw(); else if (top === "music") loadMusic(); else if (top === "ads") loadAds();   /* it is back at the same key */
    }, function () { b.removeAttribute("aria-busy"); notice("לא הצלחנו לשחזר, נסו שוב"); });
  }

  /* ---- the viewer: an ad's video, an image or a raw video, in the kit's popup (a sheet on a phone, a side panel on a computer) ---- */
  /* staff see under the file what it is linked to, as the kit's fixed sections (RosterSection): an ad's raw files and song, a raw file's ads.
     A tile opens its item in the same viewer; a song is a card the kit's sound engine plays (data-audio). */
  function miniTile(x) {   /* the page's tile without its actions (the kit has no small tile: see the report) */
    var media = x.img ? '<img data-key="' + esc(x.img) + '" src="' + esc(M.url(x.img)) + '" crossorigin="anonymous" alt="" loading="lazy"' + dims(x) + ">"
      : '<video data-key="' + esc(x.vid) + '" src="' + esc(M.url(x.vid)) + '#t=0.1" crossorigin="anonymous" preload="metadata" muted playsinline' + dims(x) + "></video>";
    return '<div class="rlayout rlayout--unit" data-tile>' + RosterCard.html({ title: x.title, sub: x.kind === "ad" ? "" : x.sub }) +
      '<button type="button" data-open data-goto="' + esc(x.id) + '" aria-label="' + esc("פתיחה של " + x.title) + '">' + media + "</button></div>";
  }
  function songCard(x) {
    return RosterCard.html({ title: x.title, sub: x.sub, chip: x.cr ? CR_CHIP : "",
      act1: '<button type="button" class="rbtn rbtn--icon" data-audio="' + esc(x.audio) + '" data-list="music" aria-label="' + esc("השמעה של " + x.title) + '" title="השמעה"></button>' });
  }
  function section(key, title, ids, fn) {
    return RosterSection.html({ key: "hp-rel:" + key, title: title, count: ids.length, fold: false, remember: false,
      body: '<div class="' + (fn === songCard ? "rlist" : "rlayout rlayout--grid rgrid") + '">' + ids.map(function (id) { return fn(byId[id]); }).join("") + "</div>" });
  }
  function relHtml(it) {
    if (!admin || !links) return "";
    if (it.kind === "ad") {
      var l = links.ads && links.ads[it.id] || {}, raw = live(l.raw), mus = live(l.music);
      return (raw.length ? section("raw:" + it.id, "חומרי גלם", raw, miniTile) : "") + (mus.length ? section("music:" + it.id, "מוזיקה", mus, songCard) : "");
    }
    var used = it.kind === "raw" || it.kind === "music" ? adsOf(it.id) : [];
    return used.length ? section("ads:" + it.id, it.kind === "music" ? "מודעות עם השיר הזה" : "מודעות שמשתמשות בזה", used, miniTile) : "";
  }
  var VIEW = "hpView";
  function stopVideo(el) { var v = el.querySelector("video[data-view]"); if (v) { v.pause(); v.removeAttribute("src"); v.load(); } }
  function wireGoto(el) {
    if (el.__hpGoto) return; el.__hpGoto = true;   /* on a phone the same window is drawn again: one listener */
    el.addEventListener("click", function (e) {
      var g = e.target.closest && e.target.closest("[data-goto]"), x = g && byId[g.getAttribute("data-goto")]; if (!x) return;
      stopVideo(el);
      var cx = el.querySelector("[data-popup-x]"); if (cx) cx.click();   /* a side panel (a computer): close it, the next one opens in its place */
      openViewer(x);
    });
  }
  function view(title, body) {
    RosterSheet.popup({ id: VIEW, title: title, body: body, wire: wireGoto, onClose: stopVideo });
  }
  function openViewer(it) {
    if (audio && cur.playing) audio.playPause();   /* one sound at a time */
    var poster = it.img ? ' poster="' + esc(M.url(it.img)) + '"' : "";
    var media = it.vid ? '<video data-view data-key="' + esc(it.vid) + '" crossorigin="anonymous" controls playsinline autoplay preload="auto"' + poster + dims(it) + ' src="' + esc(M.url(it.vid)) + '"></video>'
      : '<img data-view data-key="' + esc(it.img) + '" crossorigin="anonymous" src="' + esc(M.url(it.img)) + '" alt="' + esc(it.alt || it.title) + '"' + dims(it) + ">";
    var rel = relHtml(it);
    view(it.title, rel ? '<div class="rlayout" data-rel>' + media + rel + "</div>" : media);
  }
  function openRelated(song, ids) { view(song.title, section("ads:" + song.id, "מודעות עם השיר הזה", ids, miniTile)); }

  /* a picture or a video whose presigned url ran out (or got a 403): list its folder again, once, and load it from the fresh url */
  document.addEventListener("error", function (e) {
    var m = e.target; if (!m || !m.getAttribute || !m.getAttribute("data-key") || m.hasAttribute("data-renewed")) return;
    m.setAttribute("data-renewed", "");
    var key = m.getAttribute("data-key");
    M.renew(key).then(function (u) { if (u && m.isConnected) m.src = u + (m.tagName === "VIDEO" && !m.hasAttribute("data-view") ? "#t=0.1" : ""); }, function () {});
  }, true);
  M.onRenew(function (prefix) {   /* a folder listed again when its "expires" passed: every tile of it takes the fresh url (an open viewer keeps playing) */
    out.querySelectorAll("[data-key]").forEach(function (m) {
      var key = m.getAttribute("data-key"); if (key.indexOf(prefix) !== 0) return;
      var u = M.url(key) + (m.tagName === "VIDEO" ? "#t=0.1" : ""); if (m.getAttribute("src") !== u) m.setAttribute("src", u);
    });
  });

  out.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target : null; if (!t) return;
    var holder = t.closest("[data-id]"), it = holder && byId[holder.getAttribute("data-id")]; if (!it) return;
    var mb = t.closest("[data-more]");
    if (mb) {
      e.stopPropagation();
      if (navigator.share) kinds(it).forEach(function (f) { getFile(f.key, f.name, f.type).catch(function () {}); });   /* ready to share: navigator.share must run right after the press */
      RosterMenu.open(mb, function () { return moreItems(it); }, { end: true });
      return;
    }
    var rb = t.closest("[data-restore]");
    if (rb) { if (rb.getAttribute("aria-busy") !== "true") restoreItem(it, rb); return; }
    if (t.closest("[data-open]")) openViewer(it);
  });

  /* ---- the music: the kit's sound engine (/audio.js) and player (.rplayer) ---- */
  var cur = { name: "", t: 0, d: 0, playing: false, busy: false, fail: false };
  function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  var pl = node('<section class="rplayer" id="pl" data-state="idle" aria-label="נגן" popover="manual" hidden><span class="rplayer__time" id="pc" dir="ltr">0:00 / 0:00</span>' +
    '<button type="button" class="ricon-lg" id="pp" aria-label="השמעה" title="השמעה">' + sym("play") + "</button>" +
    '<input type="range" class="rrange rrange--seek" id="pb" min="0" max="0" value="0" step="1" aria-label="מקום בשיר" disabled>' +
    '<div class="rplayer__info"><span class="rplayer__title" id="pt" dir="auto" aria-live="polite"></span><span class="rplayer__sub" id="pa" dir="auto"></span></div>' +
    '<span class="rplayer__none">לא נבחרה מוסיקה</span></section>');
  if (window.RosterAudio) {
    audio = RosterAudio.create({ url: function (k) { return M.url(k); }, headers: function () { return M.headers(); },
      store: "harpatka-media", key: "harpatka.media", events: { state: "hpaudio", fail: "hpaudio-fail", busy: "hpaudio-busy" }, album: "יוצאים להרפתקה" });
    document.body.appendChild(pl);
    if (RosterSheet.raisePlayer) RosterSheet.raisePlayer();
  }
  function paintPlayer() {
    var pp = document.getElementById("pp"), pb = document.getElementById("pb"); if (!pp) return;
    var on = !!cur.name, it = byId[cur.name];
    pl.hidden = !(cur.playing || cur.busy || (cat === "music" && !soloId) || (soloId && it && it.kind === "music"));   /* the bar shows in the music, and wherever a song plays or loads */
    var st = !on ? "idle" : cur.fail ? "error" : cur.busy ? "loading" : cur.playing ? "playing" : "paused";
    if (pl.dataset.state !== st) pl.dataset.state = st;
    var t1 = on ? (it ? it.title : "מוזיקה") : "";
    if (document.getElementById("pt").textContent !== t1) document.getElementById("pt").textContent = t1;
    document.getElementById("pa").innerHTML = cur.fail ? sym("warn") + "לא הצלחנו להשמיע" : "";
    if (cur.busy) pp.setAttribute("aria-busy", "true"); else pp.removeAttribute("aria-busy");
    var lab = cur.playing ? "עצירה" : "השמעה"; if (pp.getAttribute("aria-label") !== lab) { pp.innerHTML = sym(cur.playing ? "pause" : "play"); pp.setAttribute("aria-label", lab); pp.title = lab; }
    pb.disabled = !on || !(cur.d > 0);
    items.forEach(function (x) { if (x.kind === "music") { var p = cur.playing && x.audio === cur.name; if (x.el.classList.contains("is-play") !== p) x.el.classList.toggle("is-play", p); } });
    if (window.RosterRange && RosterRange.held(pb)) return;   /* the bar is held: it follows the finger until let go */
    document.getElementById("pc").textContent = clk(cur.t) + " / " + clk(cur.d);
    var mx = String(cur.d > 0 ? Math.round(cur.d) : 0); if (pb.max !== mx) pb.max = mx;
    if (window.RosterRange) RosterRange.set(pb, cur.d > 0 ? Math.floor(cur.t) : 0); else pb.value = cur.d > 0 ? Math.floor(cur.t) : 0;
  }
  document.addEventListener("hpaudio", function (ev) { var d = ev.detail || {}; cur.name = d.name || ""; cur.t = d.t || 0; cur.d = d.d || 0; cur.playing = !!d.playing; if (cur.playing) cur.fail = false; paintPlayer(); });
  document.addEventListener("hpaudio-busy", function (ev) { var d = ev.detail || {}; cur.busy = !!d.on; if (d.on && d.name) { cur.name = d.name; cur.fail = false; } paintPlayer(); });
  document.addEventListener("hpaudio-fail", function (ev) { var d = ev.detail || {}; if (d.name) M.renew(d.name).catch(function () {}); cur.fail = true; cur.busy = false; cur.playing = false; if (d.name) cur.name = d.name; paintPlayer(); });
  pl.addEventListener("click", function (e) { if (e.target.closest("#pp") && audio) { cur.fail = false; audio.playPause(); } });
  pl.addEventListener("input", function (e) { if (e.target.id === "pb") document.getElementById("pc").textContent = clk(+e.target.value) + " / " + clk(cur.d); });
  pl.addEventListener("change", function (e) { var pb = e.target; if (pb.id !== "pb" || !audio || !(+pb.max > 0)) return; audio.seek(pb.value / pb.max); if (audio.commitSeek) audio.commitSeek(); });
  /* the space plays and stops, outside a field, a button, a menu or a window (ui/docs/player.md, decision 8) */
  document.addEventListener("keydown", function (e) {
    if (e.key !== " " || !audio || !cur.name || e.ctrlKey || e.metaKey || e.altKey) return;
    var tg = e.target; if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(tg.tagName) || tg.closest(".rmenu, dialog, .rpanel"))) return;
    e.preventDefault(); audio.playPause();
  });

  apply(); paintPlayer(); loadAll();
})();
