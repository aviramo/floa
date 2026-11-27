// Biodanza's list for the kit's layout audit (ui/audit/layout.mjs): how to open every screen, window, panel and menu. Only openers here; every check is the kit's.
// Data is a stub (law17_stub.js, or BIO_STUB=<file>), the person is a main admin; nothing is written.
import fs from "fs";
const STUB = fs.readFileSync(process.env.BIO_STUB || new URL("./law17_stub.js", import.meta.url), "utf8");
const ADMIN = `(function () {   /* on top of the stub: a main admin, and a list of users for the users window */
  var f0 = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "", m = ((init && init.method) || "GET").toUpperCase(), j = function (o) { return Promise.resolve(new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } })); };
    if (/\\/rest\\/v1\\/rpc\\/me(\\?|$)/.test(url)) return j({ allowed: true, admin: true, super: true });
    if (/\\/rest\\/v1\\/allowed\\?/.test(url) && m === "GET") { var a = []; for (var k = 0; k < 9; k++) a.push({ email: "user" + k + "@example.com", note: "user " + k, is_admin: k === 0, is_super: k === 0 }); return j(a); }
    /* the songs' catalog exercises (the music card's lines), on the catalog's own exercises (cx*): m1 in five (3 lines and "עוד 2"), m2 and m7 in one each */
    if (/\\/rest\\/v1\\/exercise_music\\?select=exercise_id,/.test(url)) { if (!/offset=0(&|$)/.test(url)) return j([]); var EX = function (i) { return { id: "cx" + i, title_he: "תרגיל מספר " + (i + 1), title_en: "Exercise " + (i + 1) }; }, MU = { m1: { id: "m1", name: "adagio", title: "Adagio for Strings", artist: "Samuel Barber", duration_sec: 483, audio_object: "a1.mp3", in_catalog: true }, m2: { id: "m2", name: "hallelujah", title: "Hallelujah", artist: "Leonard Cohen", duration_sec: 276, audio_object: "a2.mp3", in_catalog: true }, m7: { id: "m7", name: "m7", title: "Clair de Lune", artist: "Claude Debussy", duration_sec: 302, audio_object: "a7.mp3", in_catalog: true } }; return j([[0, "m1"], [0, "m2"], [1, "m1"], [2, "m1"], [3, "m1"], [4, "m1"], [5, "m7"]].map(function (r) { return { exercise_id: "cx" + r[0], exercises: EX(r[0]), music: MU[r[1]] }; })); }
    if (/\\/rest\\/v1\\/exercise_music\\?select=music_id&/.test(url)) return j(["m1", "m1", "m1", "m1", "m1", "m2", "m7"].map(function (id) { return { music_id: id }; }));
    if (/\\/rest\\/v1\\/rpc\\/c14_list(\\?|$)/.test(url)) {   /* the admin-only 2014 catalog page (catalog14/): a few rows of each kind of match */
      var S = ["exact", "strong", "possible", "candidate", "none"], c = [];
      for (var i = 0; i < 8; i++) { var s = S[i % 5], mt = { id: "x" + (i % 3), strength: s, title: [1, .82, .6, .4, 0][i % 5], title_en: "Existing " + (i % 3), title_he: "קיים " + (i % 3), songs_n: i % 4, shared: i % 3, jaccard: .5, objs: i % 2 ? ["a1.mp3", "a2.mp3"] : [], nofile: i % 3 ? ["no file song"] : [] };
        c.push({ id: "c" + i, title_en: "Exercise 2014 no. " + (i + 1), title_he: "תרגיל 2014 מספר " + (i + 1), category: "circles", category_brush: i % 2 ? "מעגלים" : null, handled: ["", "done", "partial"][i % 3], music: i % 2 ? [{ id: "s1", name: "adagio", object: "a1.mp3" }, { id: "s2", name: "noaudio", object: null }] : [], pdf: i % 2 ? [{ m: "s1", n: "adagio" }, { m: "s2", n: "noaudio" }] : [], matches: s === "none" ? [] : [mt, { id: "y", strength: "candidate", title: .3, title_en: "Other", title_he: "אחר", songs_n: 0, shared: 1, jaccard: .2 }] }); }
      return j(c);
    }
    return f0.apply(this, arguments);
  };
})();`;
export const app = "biodanza";
export const path = "/biodanza/";
/* the songs' download to the device runs in the background on its own clock (a mark in the player while it works and 8s after): its progress never reaches the app here, so a screen looks the same on every run */
const QUIET = `window.addEventListener("biooffline", function (e) { e.stopImmediatePropagation(); }, true);`;
export const init = "try{localStorage.clear()}catch(e){}\n" + STUB + "\n" + ADMIN + "\n" + QUIET;
/* a screen is [name, opener, expect?]: expect is a selector seen only on the screen the opener opens (the audit FAILS when it is not seen) */
/* each opener gets ev (evaluate in the page; the kit's helpers __clk, __menu, __pick, __act are there) and sleep; it returns true when what it opens is open */
const viv = async (ev, sleep) => { await ev(`__clk("[data-vrow]")`); await sleep(1800); return true; };
const cat = async (ev, sleep) => { if (!(await ev(`__menu("קטלוג תרגילים")`))) return false; await sleep(1500); return true; };
const catEx = async (ev, sleep) => { if (!(await cat(ev, sleep))) return false; await ev(`(function(){ var s=[].filter.call(document.querySelectorAll('[data-cat] .racc__head'),__vis)[0]; if(s&&s.getAttribute("aria-expanded")!=="true") s.click(); })()`); await sleep(600); return ev(`__clk("[data-ex]")`); };
const mus = async (ev, sleep) => { if (!(await ev(`__menu("קטלוג מוזיקות")`))) return false; await sleep(2000); return true; };
const users = async (ev, sleep) => { if (!(await ev(`__menu("משתמשים")`))) return false; await sleep(1500); return true; };
export const screens = [
  ["home", async () => true],
  ["vivencia", viv],
  ["exercise window (vivencia)", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk("[data-icard]")`); }],
  ["vivencia: edit title (in place, from the pencil)", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk('button[aria-label="עריכת הנושא"]')`); }],   /* the pencil edits the name in place (ui/docs/realtime.md): no window opens, the screen is audited with the field open */
  ["vivencia: remove an exercise (short window)", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk("[data-rlist-rm]")`); }],
  ["vivencia: share", async (ev, sleep) => { await viv(ev, sleep); return ev(`__act("vis", "שיתוף")`); }, "#svis"],
  ["exercise window: its music's exercises", async (ev, sleep) => { await viv(ev, sleep); if (!(await ev(`__clk("[data-icard]")`))) return false; await sleep(2000); return ev(`__clk("[data-mfxg]:not(:has([data-zero]))", true)`); }],
  ["add music", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk("[data-addm]")`); }],
  ["add music: where to", async (ev, sleep) => { await viv(ev, sleep); if (!(await ev(`__clk("[data-addm]")`))) return false; await sleep(2000); return ev(`__clk("[data-amadd]", true)`); }],
  ["exercise catalog", cat],
  ["catalog exercise", catEx],
  /* the catalog exercise's own "הוספה" (its plus: data-act="doswap" in the exercise's panel on a computer, #exgo in its sheet's header on a phone), once the exercise has arrived */
  ["catalog exercise: add to", async (ev, sleep) => { if (!(await catEx(ev, sleep))) return false; await sleep(1500); return ev(`__clk('.rhead [data-act="doswap"]:not(:disabled), .rhead #exgo:not(:disabled)')`); }, "#cdadd"],   /* the destination window (on a computer the kit's popup is a panel with no id: its foot's add button marks it) */
  ["music catalog", mus],
  /* the music card (owner 2026-11-26) has no count button: the song's catalog exercises are lines on the card (data-mxl), and a line opens the song's exercises with that exercise.
     The stub's exercise_music gives m1 and m2 an exercise (ex1) and m7 another (ex2), so a line is always there */
  ["song's exercises (music catalog card)", async (ev, sleep) => { if (!(await mus(ev, sleep))) return false; await sleep(800); return ev(`__clk("[data-mxl]", true)`); }],
  ["song's exercises (add music card)", async (ev, sleep) => { await viv(ev, sleep); if (!(await ev(`__clk("[data-addm]")`))) return false; await sleep(2000); return ev(`__clk("[data-mxl]", true)`); }],
  ["history", async (ev) => ev(`__menu("היסטוריית האזנה")`)],
  ["liked vivencias", async (ev) => ev(`__menu("ויוונסיות שאהבתי")`)],
  ["liked exercises", async (ev) => ev(`__menu("תרגילים שאהבתי")`)],
  ["liked music", async (ev) => ev(`__menu("מוסיקה שאהבתי")`)],
  ["users", users, "#alist"],
  ["users: rename (short window, field)", async (ev, sleep) => { if (!(await users(ev, sleep))) return false; await ev(`__clk("[data-ucard]", true)`); await sleep(400); return ev(`__pick("שינוי שם")`); }],
  ["users: remove (short window)", async (ev, sleep) => { if (!(await users(ev, sleep))) return false; await ev(`__clk("[data-ucard]", true)`); await sleep(400); return ev(`__pick("מחיקה")`); }],
];
export const menus = [
  ["menu: the app menu", async (ev) => ev(`__appMenu()`)],
  ["menu: the catalog button", async (ev) => ev(`__clk("[data-catopen]")`)],
  ["menu: a header's more", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk(".rhead [data-rmore]")`); }],
  ["menu: a person's card", async (ev, sleep) => { if (!(await users(ev, sleep))) return false; return ev(`__clk("[data-ucard]", true)`); }],
  ["menu: a person's role (chip)", async (ev, sleep) => { if (!(await users(ev, sleep))) return false; return ev(`__clk("[data-chiprole]", true)`); }],
  ["menu: a select's list", async (ev, sleep) => { if (!(await mus(ev, sleep))) return false; return ev(`(function(){ var s=[].filter.call(document.querySelectorAll("[data-mf]"),function(x){return x.getClientRects().length})[0]; if(!s) return false; var f=s.closest(".rfield")||s; f.click(); s.dispatchEvent(new MouseEvent("mousedown",{bubbles:true})); return true; })()`); }],
  ["menu: a song card", async (ev, sleep) => { await viv(ev, sleep); return ev(`__clk("[data-card] [data-more], [data-card] .rcard__more, [data-icard] [aria-haspopup=menu]")`); }],
];
/* the app's other pages, each on its own path (ui/audit/style-diff.mjs reads these; the person is the main admin above, so the admin-only pages open): [name, path, opener] */
export const pages = [
  ["catalog14", "/biodanza/catalog14/", async () => true],
  ["catalog14: a card's music open", "/biodanza/catalog14/", async (ev) => ev(`__clk("[data-acc]")`)],
  ["music page", "/biodanza/music/", async () => true],
];
/* Biodanza's special parts (no generic counterpart in the kit, CLAUDE.md): the phone's strip of exercise tabs, a carousel that keeps five slots */
export const special = ".bio-tabs";
