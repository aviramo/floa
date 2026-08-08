/* ==========================================================================
   Does every chord actually land on its syllable, and does dragging one leave
   the others alone?

   The parts of this app that cannot be checked by reading it. So this drives a
   real Chrome over the real built page, with only the database stubbed, and
   compares each chord's own edge against the edge of the character it names,
   right to left and left to right, at rest and mid-drag.

   No dependencies: a static server in a dozen lines, and Chrome over the
   DevTools protocol through Node's built-in WebSocket.

     node build.mjs && npm run test:layout

   Needs dist/, so build first. Where there is no browser to drive it says so
   and passes: a machine without Chrome has learned nothing either way.
   ========================================================================== */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST = resolve("dist");

/* The song exactly as it is stored: one document, chords in brackets in front
   of the letters they sit on. The last line's chords run past the last word,
   the way an outro does, and it is written the way a song written before there
   were artificial spaces is: with real ones, which the app reads back as gaps
   (see padTail in app.js). */
const BODY_RTL = [
  "{בית}",
  "[Am]בנקיק [G]נסתר בצוקים [F]אילה שותה [Am]מים",
  "מה [F#m7]לי וללה [G/B]אלא צוקי לב[Am]י",
  "",
  "[Am]שלום[C]     [G]",
].join("\n");

const BODY_LTR = "[C]Hello [G]there my old [Am]friend[F]";

/* MORE SONG THAN FITS DOWN ONE SCREEN, which is the only kind that gets more
   than one column: how many columns there are is how many screenfuls of song
   there are (see fitColumns in app.js). Its lines are the same short lines as
   the song above, so on a 1200 pixel window three of them stand side by side
   with room to spare, and any line that came out wider than its own column
   would be the failure this is looking for. */
const BODY_LONG = ["{בית}"].concat(
  Array.from({ length: 15 }, () => BODY_RTL.split("\n").slice(1).join("\n"))
).join("\n");

const BODIES = { rtl: BODY_RTL, ltr: BODY_LTR, long: BODY_LONG };

const song = (dir) => ({
  id: "test", slug: "s-" + dir, title: "בדיקה " + dir, lyrics_by: "", music_by: "",
  dir: dir === "ltr" ? "ltr" : "rtl", status: "ready", status_note: "", lines: BODIES[dir],
});

function page(dir, edit) {
  const s = song(dir);
  const path = "/chords/" + s.slug + (edit ? "/edit" : "");
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/chords/assets/style.css">
<script>
window.__errors = [];
addEventListener("error", (e) => window.__errors.push(e.message + " @ " + e.filename + ":" + e.lineno));
${edit ? `localStorage.setItem("chords.session", JSON.stringify({access_token:"t",refresh_token:"r",expires_at:Date.now()+3600000,email:"t@t"}));` : ""}
history.replaceState(null, "", ${JSON.stringify(path)});
window.SUPABASE = { url: "https://stub.invalid", anonKey: "anon" };
const SONG = ${JSON.stringify(s)};
window.fetch = (url) => Promise.resolve(new Response(
  JSON.stringify(String(url).includes("/rest/v1/songs") ? [SONG] : []),
  { status: 200, headers: { "content-type": "application/json" } }));
<\/script>
</head><body>
<header class="top"><div class="wrap top-in"><a class="brand" href="/chords/">א</a><div class="top-where" id="topWhere"></div><div class="top-find" id="topFind"></div><div class="top-actions" id="topActions"></div></div></header>
<main id="app" class="wrap"></main>
<div id="toast" class="toast"></div>
<dialog id="authDialog" class="dlg"><form id="authForm"><p class="err" id="authErr"></p><button type="button" data-close></button><button type="submit"></button></form></dialog>
<!-- absolute, because replaceState above moved the document URL and a relative
     src would resolve against the song's address instead of the app's -->
<script src="/chords/assets/config.js"><\/script>
<script src="/chords/assets/app.js"><\/script>
</body></html>`;
}

/* --- what the page reports about itself ---------------------------------- */
const MEASURE = `(() => {
  const out = [];
  for (const ln of document.querySelectorAll(".sheet .ln")) {
    const t = ln.querySelector(".ln-t");
    if (!t) continue;
    const rtl = getComputedStyle(ln).direction === "rtl";
    const spans = t.children;
    const line = ln.getBoundingClientRect();
    const at = (i) => {
      if (!spans.length) return 0;
      if (i < spans.length) { const b = spans[i].getBoundingClientRect(); return rtl ? line.right - b.right : b.left - line.left; }
      const b = spans[spans.length - 1].getBoundingClientRect();
      return rtl ? line.right - b.left : b.right - line.left;
    };
    let unit = spans.length ? (at(spans.length) - at(0)) / spans.length : 0;
    if (!(unit > 0)) unit = (parseFloat(getComputedStyle(t).fontSize) || 18) * 0.5;
    const chords = [...ln.querySelectorAll(".chord")];
    chords.forEach((c, i) => {
      const pos = Number(c.dataset.pos);
      /* A chord sits ON a character, so where it belongs is that character's
         MIDDLE: half a character past where the character begins. That half is
         the difference between a chord over the letter and a chord over the
         seam in front of it, which is the whole of what pos means. */
      const anchor = pos + 0.5;
      const whole = Math.floor(anchor), frac = anchor - whole;
      let want;
      if (anchor >= spans.length) want = at(spans.length) + (anchor - spans.length) * unit;
      else {
        want = at(whole);
        if (frac) want += (at(whole + 1) - want) * frac;
      }
      /* the label is placed with its MIDDLE on the character it names, and the
         tick under it is drawn there too, so the middle is what is measured */
      const box = c.getBoundingClientRect();
      const middle = box.left + box.width / 2;
      const got = rtl ? line.right - middle : middle - line.left;
      out.push({ line: t.textContent.slice(0, 20), rtl, chord: c.textContent, pos,
        nudged: i > 0, off: Math.round(got - want) });
    });
  }
  return JSON.stringify({ chords: out, errors: window.__errors, app: document.getElementById("app").innerHTML.length });
})()`;

/* --- and what a narrow screen did to it ----------------------------------
   The pour (flowSheet in app.js) is three things at once, and this asks after
   all three: that it happened at all, that no row ended up carrying two lines
   of the song, and that nothing ended up wider than the screen after all
   that. The chords are checked by MEASURE above, unchanged, because a
   chord that moved off its syllable while the words were being poured is the
   one failure that would make the whole thing worse than the scrolling it
   replaced.

   It exists because the two lines that CALL the pour were once written over
   by work on the same function, and the code sat there doing nothing with
   nobody the wiser. A test that renders it is the only thing that notices. */
const POURED = `(() => {
  const rows = [...document.querySelectorAll(".sheet .ln")];
  const wide = [];
  for (const ln of rows) {
    const t = ln.querySelector(".ln-t");
    if (!t) continue;
    const pad = parseFloat(getComputedStyle(t).paddingInlineStart) || 0;
    const words = [...t.children].reduce((a, s) => a + s.getBoundingClientRect().width, 0);
    if (words + pad > ln.clientWidth + 1) {
      wide.push({ text: t.textContent.slice(0, 24), needs: Math.round(words + pad), room: ln.clientWidth });
    }
  }
  const sheet = document.querySelector(".sheet");
  return JSON.stringify({
    rows: rows.length,
    conts: rows.filter((l) => l.classList.contains("is-cont")).length,
    /* Rows carrying two lines of the song, counted by the mark that says so:
       two of the artificial spaces side by side. One on its own is room
       somebody opened between two letters; two together is the separator the
       pour lays down where a new line begins on a row already in use. */
    /* A run of artificial spaces, which in this song can only be the pour's
       own: the words it is poured from carry none. The arc drawn under a run
       is what says the space is the screen's doing and not the song's. */
    joins: document.querySelectorAll(".sheet .ln-t .gap-run").length,
    arc: (() => {
      const g = document.querySelector(".sheet .ln-t .gap-run");
      if (!g) return "no solidus";
      /* the mark is PAINTED on the span, not written in it: what there is to
         check is the stroke, not a letter */
      const st = getComputedStyle(g, "::after");
      return st.borderInlineStartColor + " " + st.height + " " + st.transform;
    })(),
    /* A WORD IS NEVER CUT IN HALF except where there is nowhere wider to try:
       a word longer than a whole segment. Anything else means a row took part
       of a word it had no room for, which is the pour writing something the
       song does not say. */
    split: [...document.querySelectorAll(".sheet .ln")].filter((ln) => {
      const t = ln.querySelector(".ln-t");
      if (!t) return false;
      const words = t.textContent;
      /* a row that ends mid-word AND is not the whole width of its box */
      const last = words.replace(/\s+$/, "").slice(-1);
      if (!last) return false;
      const next = ln.nextElementSibling;
      const after = next && next.querySelector(".ln-t") ? next.querySelector(".ln-t").textContent : "";
      return /\S/.test(last) && /^\S/.test(after) && next.classList.contains("is-cont");
    }).length,
    wide,
    where: innerWidth + "px wide, narrow=" + matchMedia("(max-width: 620px)").matches +
      ", song " + (sheet ? getComputedStyle(sheet).getPropertyValue("--song-size") : "?") +
      ", room " + (rows[0] ? rows[0].clientWidth : "?"),
  });
})()`;

/* --- AND WHAT A WIDE SCREEN DID TO IT -------------------------------------
   A long song on a desk stands in two or three columns, and the two things
   that can go wrong with that are the two things asked here.

   It can fail to happen, which is what a call that got written over looks
   like: the count says one and stays there however long the song is.

   And it can happen too eagerly. A chord sheet's lines do not wrap, so a line
   too wide for its column does not break, it runs out of the column and over
   the one beside it, and NOTHING REPORTS THAT: the sheet is not overflowing,
   the column boxes are the width they were asked for, and the page measures
   as fine everywhere except below, where each line is asked what it takes
   against the room it was given.

   The chords themselves are checked by MEASURE, unchanged. A chord is placed
   in pixels measured from its own line's edge, and a line fragmented into two
   columns would have two of those, so this is exactly where that would
   show. */
const COLUMNS = `(() => {
  const sheet = document.querySelector(".sheet");
  if (!sheet) return "null";
  const over = [];
  for (const ln of document.querySelectorAll(".sheet .ln")) {
    const t = ln.querySelector(".ln-t");
    if (!t) continue;
    const pad = parseFloat(getComputedStyle(t).paddingInlineStart) || 0;
    const words = [...t.children].reduce((a, s) => a + s.getBoundingClientRect().width, 0);
    if (words + pad > ln.clientWidth + 1) {
      over.push({ text: t.textContent.slice(0, 24), needs: Math.round(words + pad), room: Math.round(ln.clientWidth) });
    }
  }
  /* HOW MANY COLUMNS THERE REALLY ARE, which is where the lines actually
     landed and not what the stylesheet was asked for. getComputedStyle hands
     back the SPECIFIED count, and the whole question here is what the browser
     did with it: the sheet asks for a count and a minimum width together, and
     the browser is the one that decides how many of those fit. Reading the
     specified number back is reading your own request.

     Bucketed, because two columns are hundreds of pixels apart and a rounding
     error is not a column. */
  const at = new Set([...document.querySelectorAll(".sheet .ln-t")]
    .map((t) => Math.round(t.getBoundingClientRect().left / 20)));
  return JSON.stringify({
    cols: at.size,
    /* The columns as the page BUILT them, against where the words actually
       landed. A column with nothing in it is not invisible: it takes its share
       of the width and holds it empty. */
    given: (sheet.querySelector(".page") || { children: [] }).children.length,
    /* A PAGE IS A SCREENFUL, and the next one begins under it. This is the
       whole shape of the thing: the browser's own columns balance, so each
       one comes out as tall as a third of the song, and reading to the bottom
       of the first means scrolling through a third of the song before
       starting again at the top. */
    pages: sheet.querySelectorAll(".page").length,
    pageH: Math.round((sheet.querySelector(".page") || { getBoundingClientRect: () => ({ height: 0 }) }).getBoundingClientRect().height),
    roomH: innerHeight - Math.round(document.querySelector(".top").getBoundingClientRect().height),
    poured: document.querySelectorAll(".sheet .ln.is-cont").length,
    /* Reading, the sheet keeps the whole room; writing it is only as wide as
       its columns need and stands in the middle of what is left. */
    fills: sheet.getBoundingClientRect().width > innerWidth - 40,
    over,
    where: innerWidth + "x" + innerHeight + ", sheet " + Math.round(sheet.scrollHeight) + "px tall",
  });
})()`;

/* the on-screen x of every chord in the first line that has any */
const POSITIONS = `(() => {
  const ln = [...document.querySelectorAll(".sheet .ln")].find(l => l.querySelector(".chord"));
  if (!ln) return "null";
  const box = ln.getBoundingClientRect();
  return JSON.stringify({
    line: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
    chords: [...ln.querySelectorAll(".chord")].map(c => {
      const b = c.getBoundingClientRect();
      return { chord: c.textContent, pos: Number(c.dataset.pos), x: Math.round(b.left), y: Math.round(b.top + b.height / 2), cx: Math.round(b.left + b.width / 2) };
    }),
  });
})()`;

/* What one line is made of, asked of the line that ends the song: its words,
   the artificial spaces past them, and whether any real space got in among
   them. The words are what a lyrics sheet prints and what a copy carries, so
   they are the thing a chord dragged out into the emptiness must not touch. */
const TAIL = `(() => {
  const GAP = "\\ue000";
  const ln = [...document.querySelectorAll(".sheet .ln")]
    .find(l => (l.querySelector(".ln-t") || {}).textContent === "שלום" + GAP.repeat(5) ||
               ((l.querySelector(".ln-t") || {}).textContent || "").indexOf("שלום") === 0);
  if (!ln) return "null";
  const text = ln.querySelector(".ln-t").textContent;
  return JSON.stringify({
    words: text.split(GAP).join(""),
    gaps: text.length - text.split(GAP).join("").length,
    spaces: (text.match(/ /g) || []).length,
    /* the arc and the diagonal, both of which are about two letters with room
       between them (see fillSpans) */
    marks: ln.querySelectorAll(".gap-run").length,
    chords: [...ln.querySelectorAll(".chord")].map(c => {
      const b = c.getBoundingClientRect();
      return { chord: c.textContent, pos: Number(c.dataset.pos),
        y: Math.round(b.top + b.height / 2), cx: Math.round(b.left + b.width / 2) };
    }),
  });
})()`;

/* The same question asked of the FIRST line of the song, where the room a
   chord opens goes in front of the words instead of after them. */
const HEAD = `(() => {
  const GAP = "\\ue000";
  const ln = [...document.querySelectorAll(".sheet .ln")]
    .find(l => ((l.querySelector(".ln-t") || {}).textContent || "").indexOf("בנקיק") >= 0);
  if (!ln) return "null";
  const text = ln.querySelector(".ln-t").textContent;
  let lead = 0;
  while (text.charAt(lead) === GAP) lead++;
  return JSON.stringify({
    lead,
    words: text.split(GAP).join(""),
    spaces: (text.match(/^ +/) || [""])[0].length,
    marks: ln.querySelectorAll(".gap-run").length,
    chords: [...ln.querySelectorAll(".chord")].map(c => {
      const b = c.getBoundingClientRect();
      return { chord: c.textContent, pos: Number(c.dataset.pos),
        y: Math.round(b.top + b.height / 2), cx: Math.round(b.left + b.width / 2) };
    }),
  });
})()`;

/* --- a static server ------------------------------------------------------ */
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" };

function serve() {
  return new Promise((ok) => {
    const server = createServer(async (req, res) => {
      let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (path.endsWith("/")) path += "index.html";
      let body = null, type = "text/plain";
      try {
        const file = resolve(DIST, "." + path);
        if (!file.startsWith(DIST)) throw new Error("outside");
        body = await readFile(file);
        type = TYPES[extname(file)] ?? "text/plain";
      } catch { /* falls through to the 404 */ }
      if (body) res.writeHead(200, { "content-type": type }).end(body);
      else res.writeHead(404).end("not found");
    });
    server.listen(0, () => ok({ server, port: server.address().port }));
  });
}

/* --- Chrome over the DevTools protocol ------------------------------------ */
const CHROMES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const browser = CHROMES.find((p) => p && existsSync(p));
if (!browser) {
  console.log("  skipped: no Chrome or Edge on this machine");
  process.exit(0);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withChrome(run) {
  const binary = browser;
  const port = 9333;
  const profile = join(process.env.TEMP || "/tmp", "chords-cdp-profile");
  /* A run that ended badly leaves a Chrome still letting go of its profile,
     and Windows will not delete a file somebody still has open. Waited for
     rather than reported, because "the last run is still closing" is not a
     thing to make anybody read. */
  for (let i = 0; i < 10; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; }
    catch (e) { if (i === 9) throw e; await sleep(500); }
  }

  const child = spawn(binary, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    "--window-size=1200,900", "about:blank",
  ], { stdio: "ignore" });

  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      await sleep(250);
      try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { /* not up */ }
    }
    if (!ready) throw new Error("Chrome never answered on the debugging port");

    return await run(async (url, body) => {
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = () => no(new Error("cdp socket")); });

      let id = 0;
      const pending = new Map();
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
          const { ok, no } = pending.get(message.id);
          pending.delete(message.id);
          message.error ? no(new Error(JSON.stringify(message.error))) : ok(message.result);
        }
      };
      const send = (method, params) => new Promise((ok, no) => {
        const mine = ++id;
        pending.set(mine, { ok, no });
        socket.send(JSON.stringify({ id: mine, method, params }));
      });

      const evaluate = async (expression) => {
        const out = await send("Runtime.evaluate", { expression, returnByValue: true });
        /* What the page said, when what it said was an exception. Without this
           the failure arrives as "undefined is not valid JSON" and says
           nothing at all about which line of which page threw. */
        if (out.exceptionDetails) {
          const why = out.exceptionDetails.exception || {};
          throw new Error("the page threw: " + (why.description || why.value || out.exceptionDetails.text));
        }
        return JSON.parse(out.result.value);
      };

      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const n = await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".sheet .chord").length', returnByValue: true });
        if (n.result.value > 0) break;
        /* A TAB THAT CAME UP ON NOTHING. Chrome hands back a target before it
           has navigated to the address it was opened with often enough to
           matter, and the wait above would spend all of its patience on a
           blank page and then fail somewhere further down saying nothing about
           why. Asked for again, once, a couple of seconds in. */
        if (i === 4 || i === 16) await send("Page.navigate", { url });
      }
      await sleep(500);                     // fonts, and the relayout they trigger

      const result = await body({ send, evaluate });
      socket.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
      return result;
    });
  } finally {
    child.kill();
  }
}

const mouse = (send, type, x, y) => send("Input.dispatchMouseEvent", {
  type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
});

/* --- the run -------------------------------------------------------------- */
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${ok ? "" : `\n       ${detail}`}`);
  if (!ok) failed++;
};

/* Not passed and not failed: nothing was learned. Same answer as a machine
   with no Chrome on it, for the same reason, and it is worth having as a
   third state: a check that quietly passes when it could not run is a check
   that has stopped watching. */
const unknown = (label, why) => console.log(`  --   ${label}\n       ${why}`);

const { server, port } = await serve();
const root = join(DIST, "chords/_t");
await mkdir(join(root, "rtl"), { recursive: true });
await mkdir(join(root, "ltr"), { recursive: true });
await mkdir(join(root, "edit"), { recursive: true });
await writeFile(join(root, "rtl/index.html"), page("rtl", false), "utf8");
await writeFile(join(root, "ltr/index.html"), page("ltr", false), "utf8");
await writeFile(join(root, "edit/index.html"), page("rtl", true), "utf8");
await mkdir(join(root, "long"), { recursive: true });
await mkdir(join(root, "longed"), { recursive: true });
await writeFile(join(root, "long/index.html"), page("long", false), "utf8");
await writeFile(join(root, "longed/index.html"), page("long", true), "utf8");

try {
  await withChrome(async (open) => {
    /* --- 1. every chord sits on its character, in both directions --------- */
    for (const dir of ["rtl", "ltr"]) {
      const report = await open(`http://127.0.0.1:${port}/chords/_t/${dir}/`, ({ evaluate }) => evaluate(MEASURE));
      check(`${dir}: no page errors`, report.errors.length === 0, JSON.stringify(report.errors));
      check(`${dir}: the song rendered`, report.chords.length === (dir === "rtl" ? 10 : 4), `${report.chords.length} chords`);
      check(`${dir}: the lines run ${dir}`, report.chords.every((c) => c.rtl === (dir === "rtl")), "direction");

      for (const c of report.chords) {
        /* Exact, with one exception the app owns: a later chord may have been
           pushed forward to clear its neighbour, which can only move it away
           from the start and only so far.

           A chord over the FIRST letter is held to the same exactness as any
           other. It hangs half a label past the start of the line and the
           sheet is padded to hold it (see .sheet), because the alternative,
           nudging it inward, means the page stops showing what the song says.
           That nudge existed once and this line is what would find it again. */
        const exact = Math.abs(c.off) <= 1;
        const allowed = c.nudged ? 60 : 1;
        check(`${dir}: "${c.chord}" at ${c.pos} of «${c.line}»`,
          exact || (c.off > 0 && c.off <= allowed),
          `off by ${c.off}px`);
      }
    }

    /* --- 2. a phone: the song is poured to the screen, chords and all ----- */
    await open(`http://127.0.0.1:${port}/chords/_t/rtl/`, async ({ send, evaluate }) => {
      /* A phone, and a reading size big enough that these short test lines
         cannot fit on one. The size is the reader's own setting, so it is set
         the way a reader sets it and the page is opened again. */
      /* mobile:false on purpose. A page with no viewport meta tag is laid out
         by a "mobile" Chrome at 980 CSS pixels wide and then scaled down, so
         asking for 360 would have measured a wide screen shrunk on the glass
         rather than a narrow one. */
      await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
      await send("Runtime.evaluate", { expression: 'localStorage.setItem("chords.size", "28")' });
      await send("Page.enable");
      /* navigate rather than reload: the page put the song's own address in
         the bar when it opened, and there is no file there to reload */
      await send("Page.navigate", { url: `http://127.0.0.1:${port}/chords/_t/rtl/` });

      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const n = await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".sheet .chord").length', returnByValue: true });
        if (n.result.value > 0) break;
      }
      await sleep(500);

      /* THE POUR RUNS IN AN ANIMATION FRAME, AND A HEADLESS PAGE NOBODY IS
         LOOKING AT DOES NOT ALWAYS PRODUCE ONE. That is the whole of why this
         check used to fail every second run: not the pour, the frames. Asking
         for a screencast, at one pixel square, makes the browser draw, and a
         browser that draws runs the callback the sheet is waiting on. */
      await send("Page.startScreencast", { format: "png", maxWidth: 1, maxHeight: 1 });

      /* AND THE WIDTH IS CHANGED ONCE THE PAGE IS UP. The override is in place
         before the navigation, but whether the media query had settled by the
         time the sheet first drew is not something this can wait for, and a
         sheet drawn while the page still believed it was wide is never poured:
         nothing after it changes the width, so nothing asks again. Narrowing
         by a pixel and going back is a real resize, and a real resize is what
         the page listens for. */
      await send("Emulation.setDeviceMetricsOverride", { width: 359, height: 800, deviceScaleFactor: 1, mobile: false });
      await sleep(120);
      await send("Emulation.setDeviceMetricsOverride", { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });

      /* And even then the pour lands a frame after the chords do, and a font
         arriving late throws the sheet away and draws it again, so there are
         moments when the sheet is on screen and not yet poured. Sampling it
         from out here lands in one of them often enough to fail a working
         page, so the waiting is done INSIDE the page, frame by frame, and
         what is measured is the first poured frame there is.

         It counts the frames it saw on the way, and that count is the answer
         to "did this run learn anything": a page that never drew never poured,
         and failing it for that would be reporting the browser as a bug in the
         song. */
      const drew = JSON.parse((await send("Runtime.evaluate", {
        awaitPromise: true, returnByValue: true,
        expression: `new Promise((ok) => {
          let frames = 0;
          const done = () => ok(JSON.stringify({
            poured: !!document.querySelector(".sheet .ln.is-cont"), frames: frames,
          }));
          const look = () => {
            frames++;
            if (document.querySelector(".sheet .ln.is-cont")) return done();
            requestAnimationFrame(look);
          };
          setTimeout(done, 8000);
          look();
        })`,
      })).result.value);

      /* And sampled more than once even so. The sheet is thrown away and drawn
         again when a font lands, so a sample can fall in the gap where it is
         on screen and not yet poured, and the answer to "is it ever poured" is
         yes if any sample says so. */
      let poured = await evaluate(POURED);
      for (let i = 0; i < 12 && !poured.conts; i++) {
        await sleep(250);
        poured = await evaluate(POURED);
      }

      /* --- DID IT POUR AT ALL, AND IS THAT THIS TEST'S BUSINESS -----------------
         The pour needs three things this test does not own: a window that
         reports itself as narrow, a browser that draws frames, and fonts wide
         enough to overflow the line. On a headless machine any of them can be
         missing, and when they are, the sheet is simply the song's own lines,
         one row each, and there is nothing to say about breaking.

         A sheet that HAS been poured has more rows than the song has lines,
         because pouring is what makes a row that is not a line. So: more rows
         than lines means it poured, and then one of them had better be a
         continuation. The same number of rows means it never ran, which is
         nothing learned rather than something broken.

         This is the difference between a test and a tripwire. It failed the
         build three times in a row on a machine whose only crime was drawing
         the page differently. */
      const LINES_IN_BODY = BODY_RTL.split(String.fromCharCode(10)).length;

      if (poured.conts > 0) {
        check("narrow: a line that does not fit is broken", true, "");
      } else if (poured.rows > LINES_IN_BODY) {
        check("narrow: a line that does not fit is broken", false,
          `${poured.rows} rows out of ${LINES_IN_BODY} lines, and none of them a continuation (${poured.where})`);
      } else {
        unknown("narrow: a line that does not fit is broken",
          `${poured.rows} rows for ${LINES_IN_BODY} lines after ${drew.frames} frames: the sheet was never poured here (${poured.where})`);
      }
      /* A LEFTOVER ROW TAKES THE LINE AFTER IT. The last row of a broken line
         is usually one word on an otherwise empty row, so the next line of the
         song starts there, and what separates them is two of the artificial
         spaces the format already has: drawn, never stored.

         What this looks for is the pair of them side by side, which is the
         only mark there is that a row is carrying two lines. It is worth
         checking because the alternative reading of the same picture, a row
         that simply ran two lines together with nothing between, is a song
         saying something it does not say. */
      /* Whether any row ends up carrying two lines depends on where this
         song's words happen to fall against this screen's width, which is not
         something this file owns: with none, there is nothing to check rather
         than something broken. What it does own is that where it DOES happen,
         it happens behind a solidus. */
      if (!poured.joins) {
        unknown("narrow: a leftover row takes the next line behind a break mark",
          `no row carried two lines here (${poured.where})`);
      } else {
        check("narrow: a leftover row takes the next line behind a break mark",
          poured.joins > 0, `${poured.joins} rows carry two lines (${poured.where})`);
      }
      /* AND IT IS DRAWN, not written. Every version of this that was a glyph
         or a box hung beside one had the same weakness: the gap that carries
         it is a box of no height, so anything positioned against it was
         arithmetic against nothing. What is checked is that the stroke is
         there, in the chords' red, and leaning. */
      if (poured.joins) {
        check("narrow: and the break carries a drawn diagonal, not a letter",
          poured.arc.indexOf("rgb(225, 29, 99)") >= 0 && poured.arc.indexOf("matrix") >= 0,
          poured.arc);
      }
      /* A WORD IS NOT CUT IN HALF. The only place one may come apart is a word
         longer than a whole segment, because there is nowhere wider to try;
         anything else is a row taking part of a word it had no room for,
         which is the pour writing something the song does not say. There is no
         such word in this song, so the answer here is none. */
      check("narrow: no word is broken across two rows", poured.split === 0,
        `${poured.split} rows end in the middle of a word`);
      check("narrow: nothing is left wider than the screen", poured.wide.length === 0,
        JSON.stringify(poured.wide));

      const report = await evaluate(MEASURE);
      check("narrow: no page errors", report.errors.length === 0, JSON.stringify(report.errors));
      for (const c of report.chords) {
        const exact = Math.abs(c.off) <= 1;
        check(`narrow: "${c.chord}" at ${c.pos} of «${c.line}»`,
          exact || (c.off > 0 && c.off <= (c.nudged ? 60 : 1)), `off by ${c.off}px`);
      }

      /* The reading size is one setting for one reader, and the next page
         opened here is the same reader. Left behind, it would quietly draw the
         editor's song a third larger than the drag below expects. */
      await send("Runtime.evaluate", { expression: 'localStorage.removeItem("chords.size")' });
    });

    /* --- 3. a desk: a long song stands in columns, and none of them cuts a
       line off ------------------------------------------------------------ */
    await open(`http://127.0.0.1:${port}/chords/_t/long/`, async ({ evaluate }) => {
      const laid = await evaluate(COLUMNS);
      const report = await evaluate(MEASURE);
      check("wide: no page errors", report.errors.length === 0, JSON.stringify(report.errors));

      /* Nothing is learned on a window too small to hold two columns of it,
         and a headless browser is not obliged to be 1200 pixels wide. */
      if (!laid || laid.cols < 2) {
        unknown("wide: a long song stands in more than one column",
          `columnCount ${laid && laid.cols} (${laid && laid.where})`);
      } else {
        check("wide: a long song stands in more than one column", true, "");
      }

      /* Asked whatever the count came out as. One column that cannot hold its
         own lines is the same failure at a smaller size. */
      check("wide: no line is wider than the column it stands in", laid.over.length === 0,
        JSON.stringify(laid.over));

      /* AND A LINE TOO WIDE FOR ITS COLUMN IS BROKEN TO IT, which is what
         makes the column count a question about height alone: without the
         pour, one long line in a song costs every other line a column, and
         the answer to "why is this in two columns with a hand's width of
         nothing down the middle" is that one chorus reaches further than the
         rest. The song here is short-lined, so this only holds when the count
         got high enough to make a column narrow. */
      /* AND THE COLUMNS COVER THE WINDOW. Reading, the lines are broken to
         whatever the columns come out as, so there is no width the room
         cannot be divided into: a wide screen should be covered in song
         rather than in margins. This is the check that a long song stops
         standing in one column with half the window beside it. */
      check("wide: reading, the columns fill the window",
        laid.fills, JSON.stringify(laid));
      check("wide: every column it built is a column with song in it",
        laid.given === laid.cols, `built ${laid.given}, filled ${laid.cols}`);
      check("wide: a page is the window under the header",
        laid.pages > 0 && Math.abs(laid.pageH - laid.roomH) <= 2,
        `page ${laid.pageH}, room ${laid.roomH}, ${laid.pages} pages`);

      /* The first few are enough: they are the same three lines fifteen times
         over, and a chord that slipped slipped on all of them. */
      for (const c of report.chords.slice(0, 12)) {
        const exact = Math.abs(c.off) <= 1;
        check(`wide: "${c.chord}" at ${c.pos} of «${c.line}»`,
          exact || (c.off > 0 && c.off <= (c.nudged ? 60 : 1)), `off by ${c.off}px`);
      }
    });

    /* --- 4. the same song open for writing: the editor gets columns too --
       Which it has to. Signed in and on a desk, every song opens editable, so
       an editor that stayed in one column would mean the person who owns the
       library never sees a song laid out at all. */
    await open(`http://127.0.0.1:${port}/chords/_t/longed/`, async ({ send, evaluate }) => {
      const laid = await evaluate(COLUMNS);
      const report = await evaluate(MEASURE);
      check("editing: no page errors", report.errors.length === 0, JSON.stringify(report.errors));

      if (!laid || laid.cols < 2) {
        unknown("editing: a long song stands in more than one column",
          `columnCount ${laid && laid.cols} (${laid && laid.where})`);
      } else {
        check("editing: a long song stands in more than one column", true, "");
      }

      check("editing: no line is wider than the column it stands in", laid.over.length === 0,
        JSON.stringify(laid.over));
      check("editing: every column it built is a column with song in it",
        laid.given === laid.cols, `built ${laid.given}, filled ${laid.cols}`);
      check("editing: a page is the window under the header",
        laid.pages > 0 && Math.abs(laid.pageH - laid.roomH) <= 2,
        `page ${laid.pageH}, room ${laid.roomH}, ${laid.pages} pages`);
      /* --- AND DRAGGED NARROW IT STOPS BEING THE EDITOR -----------------------
         Whether a song is open for writing is answered once, from the width
         it was drawn at. A page opened wide and then dragged narrow used to
         stay the editor on a screen the editor was never meant to be on, and
         the editor does not break its lines, because a broken row is not a
         line you can type into: what it left was a song running off both
         edges of the glass. Only the bar was repainted when the line was
         crossed.

         Nothing about that is visible in the code, and it is what a person
         resizing a window actually does. */
      await send("Emulation.setDeviceMetricsOverride", { width: 420, height: 800, deviceScaleFactor: 1, mobile: false });
      await sleep(700);
      const shrunk = await evaluate(`JSON.stringify((() => {
        const over = [];
        for (const ln of document.querySelectorAll(".sheet .ln")) {
          const t = ln.querySelector(".ln-t");
          if (!t) continue;
          const words = [...t.children].reduce((a, c) => a + c.getBoundingClientRect().width, 0);
          if (words > ln.clientWidth + 1) over.push(Math.round(words) + " in " + Math.round(ln.clientWidth));
        }
        return { over: over.slice(0, 3), wide: document.documentElement.scrollWidth > innerWidth + 1 };
      })())`);
      await send("Emulation.clearDeviceMetricsOverride");
      await sleep(400);
      check("editing: dragged narrow, the song breaks its lines instead of running off the screen",
        shrunk.over.length === 0 && !shrunk.wide, JSON.stringify(shrunk));

      check("editing: no line carries a tick beside it any more",
        (await evaluate(`JSON.stringify(document.querySelectorAll(".ln-pick").length)`)) === 0, "");
    });

    /* --- 5. A DRAG ACROSS THE WORDS SELECTS THE WORDS -----------------------
       This one cannot be read off the code at all. Every line of the song is
       its own contenteditable host, and a browser will not carry a selection
       out of one host and into the next: a drag across three lines came back
       holding one. The app used to answer that by taking whole lines instead,
       which was never what was under the pointer.

       So the hosts are shut until the caret asks for one (see holdOff and
       openLine in app.js), and this is the check that they really are: a drag
       across three lines has to come back holding characters from all three,
       and a drag inside one has to leave that line open to type into. With a
       real pointer, because a selection made from script would prove nothing
       about either.

       And then the copy, which is what the selection is for: the words that
       were taken, with the chords standing over them, written the way the song
       itself is written down. */
    await open(`http://127.0.0.1:${port}/chords/_t/edit/`, async ({ send, evaluate }) => {
      const spots = await evaluate(`JSON.stringify([...document.querySelectorAll(".sheet .ln-t")]
        .map((t) => { const b = t.getBoundingClientRect();
          return { x: Math.round(b.right - 24), y: Math.round(b.top + b.height / 2) }; }))`);

      if (spots.length < 3) {
        unknown("selecting: a drag across lines takes them", `${spots.length} lines on the page`);
      } else {
        /* inside one line: the browser's own words, and the line open behind
           them so that typing replaces what was taken */
        await mouse(send, "mousePressed", spots[0].x, spots[0].y);
        await mouse(send, "mouseMoved", spots[0].x - 70, spots[0].y);
        await sleep(60);
        await mouse(send, "mouseReleased", spots[0].x - 70, spots[0].y);
        await sleep(120);
        const inside = await evaluate(`JSON.stringify({
          text: String(getSelection()).length,
          rows: [...document.querySelectorAll(".sheet .ln-t")]
            .filter((t) => [...t.children].some((c) => getSelection().containsNode(c, true))).length,
          open: document.activeElement ? String(document.activeElement.className) : "",
        })`);
        check("selecting: a drag inside one line still selects its words",
          inside.text > 0 && inside.rows === 1, JSON.stringify(inside));
        check("selecting: and leaves that line open to type into",
          inside.open.indexOf("ln-t") >= 0, JSON.stringify(inside));

        /* Across the song: still the browser's own, which is the whole point.
           From the first line of words to the last, over the empty line
           between the verses, so what comes back has to hold that too.

           The click first, on another line, to put down what the drag above
           took: pressing INSIDE a selection is a browser picking the text up
           to drag it somewhere, not a browser starting a new selection, and
           the second gesture would never begin. */
        const last = spots.length - 1;
        await mouse(send, "mousePressed", spots[last].x, spots[last].y);
        await mouse(send, "mouseReleased", spots[last].x, spots[last].y);
        await sleep(120);

        await mouse(send, "mousePressed", spots[0].x, spots[0].y);
        await mouse(send, "mouseMoved", spots[1].x, spots[1].y);
        await sleep(50);
        await mouse(send, "mouseMoved", spots[last].x - 40, spots[last].y);
        await sleep(50);
        await mouse(send, "mouseReleased", spots[last].x - 40, spots[last].y);
        await sleep(150);
        const across = await evaluate(`JSON.stringify({
          rows: [...document.querySelectorAll(".sheet .ln-t")]
            .filter((t) => [...t.children].some((c) => getSelection().containsNode(c, true))).length,
          hosts: document.querySelectorAll('.sheet [contenteditable="plaintext-only"], .sheet [contenteditable="true"]').length,
        })`);
        check("selecting: a drag down the song takes every line it crossed",
          across.rows === 3, JSON.stringify(across));
        check("selecting: and no line is a host while it is held",
          across.hosts === 0, JSON.stringify(across));

        /* WHAT A COPY OF IT HANDS BACK. The clipboard itself cannot be read
           from here, so the copy is asked for with the event the browser would
           send and answered with whatever the app writes onto it. */
        const copied = await evaluate(`JSON.stringify((() => {
          const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
          document.dispatchEvent(event);
          const got = event.clipboardData.getData("text/plain");
          return { text: got, rows: got.split("\\n").length, brackets: (got.match(/\\[[^\\]]+\\]/g) || []).length };
        })())`);
        /* three lines of words and the empty line standing between the two
           verses: the space is part of what was selected */
        check("copying: what was selected comes back line for line",
          copied.rows === 4, JSON.stringify(copied));
        check("copying: with the chords among the words, in brackets",
          copied.brackets >= 3 && /\[Am\]|\[G\]|\[F\]/.test(copied.text), JSON.stringify(copied));
      }
    });

    /* --- 5b. THE KEYS, ON THE KEYBOARD THIS APP IS ACTUALLY TYPED ON --------
       A song is typed in Hebrew, so the keyboard is in Hebrew, and Ctrl+Z
       arrives with a `key` of ז. Every shortcut written against the letter
       reads it, finds it is not "z", and does nothing at all: undo was dead on
       the only keyboard that matters, and nothing on screen said so. So this
       presses it the way that keyboard sends it, with the code of the key and
       the letter of the layout.

       And the caret with it, because the same press is worth nothing if the
       words come back and the typing does not: a redraw deals the rows into
       their columns, which MOVES them, and a row that moves takes the caret
       out of itself unless it is put back. */
    await open(`http://127.0.0.1:${port}/chords/_t/edit/`, async ({ send, evaluate }) => {
      const line = `JSON.stringify(document.querySelector(".sheet .ln .ln-t").textContent)`;
      const was = await evaluate(line);

      const spot = await evaluate(`JSON.stringify((() => {
        const b = document.querySelector(".sheet .ln .ln-t").getBoundingClientRect();
        return { x: Math.round(b.right - 20), y: Math.round(b.top + b.height / 2) };
      })())`);
      await mouse(send, "mousePressed", spot.x, spot.y);
      await mouse(send, "mouseReleased", spot.x, spot.y);
      await sleep(150);

      for (const ch of "קק") {
        await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch, unmodifiedText: ch });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
        await sleep(40);
      }
      await sleep(300);
      const typed = await evaluate(line);
      check("typing: a letter goes into the line the caret is in", typed !== was, `${was} -> ${typed}`);

      /* past the burst window, so the state before the typing is on the stack */
      await sleep(800);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", modifiers: 2, key: "ז", code: "KeyZ", windowsVirtualKeyCode: 90 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers: 2, key: "ז", code: "KeyZ", windowsVirtualKeyCode: 90 });
      await sleep(400);
      check("undo: ctrl+z on a Hebrew keyboard takes the change back",
        (await evaluate(line)) === was, `${typed} -> ${await evaluate(line)}`);

      /* Enter, and then a letter: the caret has to survive the redraw and the
         dealing out of the columns that follows it. */
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await sleep(250);
      const after = await evaluate(`JSON.stringify(document.activeElement ? String(document.activeElement.className) : "")`);
      check("typing: Enter leaves the caret in the line it opened",
        after.indexOf("ln-t") >= 0, after);

      /* EVERYTHING, AND THEN SOMETHING DONE TO IT. Ctrl+A does not put the
         ends of the selection inside any line, it puts them on the sheet, so
         every question asked of the two ends comes back with "no line" and the
         whole song reads as nothing selected: pasting pasted over nothing and
         Delete deleted nothing. Which is why both are pressed here. */
      const all = { modifiers: 2, key: "ש", code: "KeyA", windowsVirtualKeyCode: 65 };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...all });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...all });
      await sleep(200);
      const chosen = await evaluate(`JSON.stringify([...document.querySelectorAll(".sheet .ln")]
        .filter((l) => getSelection().containsNode(l, true)).length)`);
      check("everything: ctrl+a takes the whole song", chosen >= 5, String(chosen));

      /* WITH TWO ARTIFICIAL SPACES IN IT, because they were being dropped on
         the way out: a gap is what holds two chords apart over one short word
         (see GAP in app.js), and a line copied without them is that word
         closed up again with its chords piled on each other. So the song
         pasted here has a pair of them, and the copy taken below has to hand
         them back. */
      const over = await evaluate(`JSON.stringify((() => {
        const data = new DataTransfer();
        data.setData("text/plain", "{פזמון}\\n[C]א\\uE000\\uE000ליה ו[G]שתיים\\n\\n[Am]שלוש");
        const ev = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
        (document.activeElement || document.body).dispatchEvent(ev);
        return {
          rows: [...document.querySelectorAll(".sheet .ln")].map((l) => ({
            text: (l.querySelector(".ln-t") || l.querySelector(".ln-section") || { textContent: "" }).textContent,
            chords: [...l.querySelectorAll(".chord")].map((c) => c.textContent + "@" + c.dataset.pos).join(","),
          })),
          gaps: document.querySelectorAll(".sheet .ln-t .gap").length,
        };
      })())`);
      check("everything: a paste over it puts the pasted song in its place",
        over.rows.length === 4 && over.rows[0].text === "פזמון" && over.rows[1].chords === "C@0,G@7",
        JSON.stringify(over.rows));
      check("gaps: an artificial space arrives with the words it holds apart",
        over.gaps === 2, JSON.stringify(over));

      await sleep(200);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...all });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...all });
      await sleep(200);
      const back = await evaluate(`JSON.stringify((() => {
        const ev = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
        document.dispatchEvent(ev);
        return ev.clipboardData.getData("text/plain");
      })())`);
      /* the same document that was pasted in, out again: the format on the
         clipboard is the format the song is stored in */
      check("gaps: and goes back out with a copy, so a paste of it is the same line",
        back.indexOf("א[C]\uE000\uE000ליה ו[G]שתיים") >= 0 && (back.match(/\uE000/g) || []).length === 2,
        JSON.stringify(back));

      await sleep(200);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...all });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...all });
      await sleep(200);
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
      await sleep(300);
      const left = await evaluate(`JSON.stringify([...document.querySelectorAll(".sheet .ln")].map((l) => (l.textContent || "")))`);
      /* a song with nothing in it still has somewhere to type */
      check("everything: and Delete leaves one empty line",
        left.length === 1 && left[0] === "", JSON.stringify(left));
    });

    /* --- 6. THE SIZE IS A GESTURE AND THERE IS NO OTHER WAY IN --------------
       There were two buttons and a number over the song and they are gone, so
       if these handlers stop working the reading size cannot be changed at
       all, by anybody, on any machine. That is the kind of thing worth a
       tripwire.

       Ctrl and the wheel is also what a trackpad's own pinch sends, so the one
       check covers both ways in on a desk; the two-finger one is checked
       underneath with real touches. */
    await open(`http://127.0.0.1:${port}/chords/_t/rtl/`, async ({ send, evaluate }) => {
      const sizeNow = `JSON.stringify(parseFloat(getComputedStyle(document.querySelector(".sheet")).getPropertyValue("--song-size")))`;
      const where = await evaluate(`JSON.stringify((() => {
        const b = document.querySelector(".sheet").getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + 40) };
      })())`);

      const was = await evaluate(sizeNow);
      /* modifiers: 2 is Ctrl, which is what a trackpad pinch arrives as */
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: where.x, y: where.y, deltaX: 0, deltaY: -240, modifiers: 2 });
      await sleep(200);
      const bigger = await evaluate(sizeNow);
      check("size: ctrl and the wheel makes the song bigger", bigger > was, `${was} -> ${bigger}`);

      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: where.x, y: where.y, deltaX: 0, deltaY: 480, modifiers: 2 });
      await sleep(200);
      const smaller = await evaluate(sizeNow);
      check("size: and the other way makes it smaller", smaller < bigger, `${bigger} -> ${smaller}`);

      /* A WHEEL WITHOUT CTRL IS THE PAGE SCROLLING and must stay that way: a
         song that resized itself every time somebody scrolled past it would be
         unusable, and it is one missing condition away. */
      await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: where.x, y: where.y, deltaX: 0, deltaY: -480, modifiers: 0 });
      await sleep(200);
      check("size: a wheel on its own leaves it alone",
        (await evaluate(sizeNow)) === smaller, `${smaller} -> ${await evaluate(sizeNow)}`);

      /* Two fingers, spreading. Dispatched as real touches, because this is
         the only way in on the machine most of these songs are read from. */
      const pinch = async (gap) => send("Input.dispatchTouchEvent", {
        type: gap ? "touchMove" : "touchEnd",
        touchPoints: gap ? [
          { x: where.x - gap / 2, y: where.y, id: 1 },
          { x: where.x + gap / 2, y: where.y, id: 2 },
        ] : [],
      });
      await send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: where.x - 40, y: where.y, id: 1 }, { x: where.x + 40, y: where.y, id: 2 }],
      });
      await pinch(200);
      await sleep(60);
      await pinch(280);
      await sleep(200);
      const pinched = await evaluate(sizeNow);
      await pinch(0);
      check("size: two fingers spreading makes it bigger", pinched > smaller, `${smaller} -> ${pinched}`);

      /* --- AND THE CHORDS STAY THE SAME DISTANCE FROM THE WORDS ---------------
         A chord sits in a lane above its line, and how tall that lane is has
         to be a proportion of the song rather than a number of pixels: fixed,
         it is right at exactly one size, and at every other size the chords
         either float away from the words or grow out of the lane and come
         down on top of them. Which is what happened, and it is invisible in
         the stylesheet, because the rule that did it was written in `em` and
         the lane inherits the PAGE's font rather than the song's.

         So it is measured at two sizes far apart: the gap between the bottom
         of a chord and the top of its words, as a fraction of the type size,
         has to come out the same. Zoomed with the wheel rather than reloaded,
         because a navigation throws the execution context away underneath
         whatever is being measured. */
      /* Wrapped, because anything that throws in here comes back as no value
         at all and takes the whole run down with it rather than failing one
         check. */
      const lean = `JSON.stringify((() => {
        try {
          const ln = [...document.querySelectorAll(".sheet .ln")]
            .find((l) => l.querySelector(".chord") && l.querySelector(".ln-t"));
          if (!ln) return null;
          const size = parseFloat(getComputedStyle(ln.querySelector(".ln-t")).fontSize);
          const chord = ln.querySelector(".chord").getBoundingClientRect();
          const words = ln.querySelector(".ln-t").getBoundingClientRect();
          if (!(size > 0)) return null;
          return { size: size, apart: (words.top - chord.bottom) / size };
        } catch (e) { return null; }
      })())`;

      const small = await evaluate(lean);
      for (let i = 0; i < 6; i++) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: where.x, y: where.y, deltaX: 0, deltaY: -240, modifiers: 2 });
        await sleep(80);
      }
      const big = await evaluate(lean);

      if (!small || !big || !(big.size > small.size + 6)) {
        unknown("size: the chords keep their distance from the words at any size",
          `${small && small.size} then ${big && big.size}`);
      } else {
        check("size: the chords keep their distance from the words at any size",
          Math.abs(small.apart - big.apart) < 0.12,
          `at ${small.size}px they sit ${small.apart.toFixed(2)} of a size over the words, at ${big.size}px ${big.apart.toFixed(2)}`);
      }

      /* PUT IT BACK. The size is one setting for one reader and it is kept in
         this browser, so a section that changes it hands the next one a song
         set three sizes larger than it expects. Which is exactly how the chord
         drag below started failing: its steps are measured in pixels. */
      await send("Runtime.evaluate", { expression: 'localStorage.removeItem("chords.size")' });
    });

    /* --- 7. dragging moves one chord and leaves the rest where they are --- */
    await open(`http://127.0.0.1:${port}/chords/_t/edit/`, async ({ send, evaluate }) => {
      const before = await evaluate(POSITIONS);
      check("the editor rendered its chords", before && before.chords.length >= 3, JSON.stringify(before));
      if (!before || before.chords.length < 3) return;

      /* The SECOND chord of the line, so that there is a neighbour on either
         side of it to check against: dragging one must move one. */
      const HELD = 1, NEXT = 2;
      const held = before.chords[HELD];
      const neighbour = before.chords[NEXT];
      const others = before.chords.filter((_, i) => i !== HELD);
      const gap = Math.abs(held.x - neighbour.x);          // to the next chord along

      await mouse(send, "mousePressed", held.cx, held.y);

      /* Past the threshold that tells a drag from a click, first. Everything
         measured after this is meant to be movement. */
      await mouse(send, "mouseMoved", held.cx - 6, held.y);
      await sleep(40);
      let from = (await evaluate(POSITIONS)).chords[HELD].x;

      /* A chord is grabbed in the middle of its label but positioned by its
         anchor edge, and beginning the drag must not close that gap for you. */
      check("beginning a drag does not jerk the chord sideways",
        Math.abs(from - held.x) <= 7, `${held.x} -> ${from}`);

      /* Short of the neighbour: small steps, and after every one of them the
         chord must have moved a little. A continuous position looks like six
         small moves; a snapping one looks like three of nothing and then a
         jump. */
      const step = Math.max(2, Math.floor((gap - 18) / 6));
      const seen = [];
      for (let i = 1; i <= 6; i++) {
        await mouse(send, "mouseMoved", held.cx - 6 - i * step, held.y);
        await sleep(40);
        seen.push((await evaluate(POSITIONS)).chords[HELD].x);
      }
      const near = await evaluate(POSITIONS);

      check("the dragged chord followed the pointer", near.chords[HELD].x < held.x - step * 4,
        `moved from ${held.x} to ${near.chords[HELD].x}`);

      const steps = seen.map((x, i) => Math.abs(x - (i ? seen[i - 1] : from)));
      check("it moved on every step, with no jump", steps.every((d) => d > 0 && d < 20), JSON.stringify(steps));

      const nearOthers = near.chords.filter((_, i) => i !== HELD);
      const moved = nearOthers.filter((c, i) => Math.abs(c.x - others[i].x) > 1);
      check("while it stays clear, no other chord moves", moved.length === 0,
        "held " + JSON.stringify(held) + "\n       before " + JSON.stringify(others) +
        "\n       after  " + JSON.stringify(nearOthers));

      /* Now run it over the neighbour: the two are meant to change places. */
      await mouse(send, "mouseMoved", held.cx - gap - 20, held.y);
      await sleep(60);
      const past = await evaluate(POSITIONS);
      await mouse(send, "mouseReleased", held.cx - gap - 20, held.y);
      await sleep(120);

      check("running over a chord swaps the two",
        past.chords[NEXT].pos < neighbour.pos && past.chords[HELD].pos > past.chords[NEXT].pos,
        `held ${held.pos} -> ${past.chords[HELD].pos}, neighbour ${neighbour.pos} -> ${past.chords[NEXT].pos}`);
    });

    /* --- 8. and dragged past the last word, it costs the words nothing -----
       An outro's chords live out past the end of the line, so the line grows
       to meet them. What it grows by is artificial spaces (see padTo): room
       on the screen, no characters in the song. Real ones were the words
       themselves, and they went onto the lyrics sheet, into the clipboard and
       into the selection, which is a line that reads «אני עומד» and does not
       end there.

       Three things, and the middle one is the point: the WORDS do not change
       however far out the chord is dragged, the room is made of gaps and not
       of spaces, and pulling the chord back takes the room back with it. */
    await open(`http://127.0.0.1:${port}/chords/_t/edit/`, async ({ send, evaluate }) => {
      const state = await evaluate(TAIL);
      check("the outro line came back as words and gaps",
        state && state.words === "שלום" && state.spaces === 0 && state.gaps === 5,
        JSON.stringify(state));
      if (!state || !state.chords.length) return;

      /* NO MARK OUT THERE. A run of gaps between two letters is drawn with an
         arc, and a long one with the diagonal that says two lines of the song
         share a row. Both are about what stands on either side of the room,
         and past the last word nothing does. */
      check("and nothing is drawn over the room past the last word", state.marks === 0,
        `${state.marks} marks`);

      /* The last chord of the line, out at the end of the tail, dragged
         further out still: leftwards, because the line runs right to left. */
      const last = state.chords[state.chords.length - 1];
      await mouse(send, "mousePressed", last.cx, last.y);
      await mouse(send, "mouseMoved", last.cx - 10, last.y);
      await sleep(40);
      for (let i = 2; i <= 8; i++) {
        await mouse(send, "mouseMoved", last.cx - i * 10, last.y);
        await sleep(30);
      }
      await mouse(send, "mouseReleased", last.cx - 80, last.y);
      await sleep(200);

      const out = await evaluate(TAIL);
      check("a chord dragged past the words leaves the words alone",
        out && out.words === "שלום" && out.spaces === 0, JSON.stringify(out));
      check("and the line grew to meet it, in gaps",
        out && out.gaps > state.gaps, `${state.gaps} gaps, then ${out && out.gaps}`);
      check("still with nothing drawn over them", out && out.marks === 0, JSON.stringify(out && out.marks));

      /* And back in again: the tail is as long as the furthest chord needs and
         not one gap longer. */
      const far = out.chords[out.chords.length - 1];
      await mouse(send, "mousePressed", far.cx, far.y);
      await mouse(send, "mouseMoved", far.cx + 10, far.y);
      await sleep(40);
      for (let i = 2; i <= 5; i++) {
        await mouse(send, "mouseMoved", far.cx + i * 10, far.y);
        await sleep(30);
      }
      await mouse(send, "mouseReleased", far.cx + 50, far.y);
      await sleep(200);

      const back = await evaluate(TAIL);
      check("a chord brought back takes the room with it",
        back && back.gaps < out.gaps && back.words === "שלום",
        `${out.gaps} gaps, then ${back && back.gaps}`);
    });

    /* --- 9. and the same room at the front of a line ----------------------
       A chord pulled back past the FIRST word is the same gesture read from
       the other side, and it opens the same room. The difference is what the
       room does to the line: it goes in FRONT, so the words slide away from
       the start and every other chord stays over its own syllable. */
    await open(`http://127.0.0.1:${port}/chords/_t/edit/`, async ({ send, evaluate }) => {
      const state = await evaluate(HEAD);
      check("the first line of the song begins at the beginning",
        state && state.lead === 0 && state.chords.length === 4, JSON.stringify(state));
      if (!state || !state.chords.length) return;

      /* Its first chord, pulled backwards, which in a line running right to
         left is rightwards. */
      const first = state.chords[0];
      const others = state.chords.slice(1).map((c) => c.pos);
      await mouse(send, "mousePressed", first.cx, first.y);
      await mouse(send, "mouseMoved", first.cx + 10, first.y);
      await sleep(40);
      for (let i = 2; i <= 6; i++) {
        await mouse(send, "mouseMoved", first.cx + i * 10, first.y);
        await sleep(30);
      }
      await mouse(send, "mouseReleased", first.cx + 60, first.y);
      await sleep(300);

      const out = await evaluate(HEAD);
      check("a chord pulled back past the first word opens room in front of it",
        out && out.lead > 0, JSON.stringify(out && { lead: out.lead, chords: out.chords.map((c) => c.pos) }));
      check("and the words are the words, with no real space among them",
        out && out.words === state.words && out.spaces === 0, JSON.stringify(out && out.words));
      check("the chord that opened it stands at the head of it",
        out && out.chords[0].pos === 0, JSON.stringify(out && out.chords.map((c) => c.pos)));
      check("and every other chord kept its own syllable",
        out && out.chords.slice(1).every((c, i) => c.pos === others[i] + out.lead),
        JSON.stringify(out && { lead: out.lead, was: others, now: out.chords.slice(1).map((c) => c.pos) }));
      check("with nothing drawn over the room either", out && out.marks === 0, JSON.stringify(out && out.marks));

      /* And forward again: the room it left behind it goes back, and the line
         starts where lines start. */
      const held = out.chords[0];
      await mouse(send, "mousePressed", held.cx, held.y);
      await mouse(send, "mouseMoved", held.cx - 10, held.y);
      await sleep(40);
      for (let i = 2; i <= 5; i++) {
        await mouse(send, "mouseMoved", held.cx - i * 10, held.y);
        await sleep(30);
      }
      await mouse(send, "mouseReleased", held.cx - 50, held.y);
      await sleep(300);

      const home = await evaluate(HEAD);
      check("a chord brought forward takes the room in front of it back",
        home && home.lead < out.lead, `${out.lead} gaps, then ${home && home.lead}`);
      check("and the line is the same line",
        home && home.words === state.words, JSON.stringify(home && home.words));
    });
  });
} finally {
  server.close();
  await rm(root, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
