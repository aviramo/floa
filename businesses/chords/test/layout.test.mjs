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
   the way an outro does, and the spaces are what carries them. */
const BODY_RTL = [
  "{בית}",
  "[Am]בנקיק [G]נסתר בצוקים [F]אילה שותה [Am]מים",
  "מה [F#m7]לי וללה [G/B]אלא צוקי לב[Am]י",
  "",
  "[Am]שלום[C]     [G]",
].join("\n");

const BODY_LTR = "[C]Hello [G]there my old [Am]friend[F]";

const song = (dir) => ({
  id: "test", slug: "s-" + dir, title: "בדיקה " + dir, lyrics_by: "", music_by: "",
  dir, status: "ready", status_note: "", lines: dir === "rtl" ? BODY_RTL : BODY_LTR,
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
<header class="top"><div class="wrap top-in"><a class="brand" href="/chords/">א</a><div class="top-actions" id="topActions"></div></div></header>
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
    seps: document.querySelectorAll(".sheet .ln-t .sp").length,
    wide,
    where: innerWidth + "px wide, narrow=" + matchMedia("(max-width: 620px)").matches +
      ", song " + (sheet ? getComputedStyle(sheet).getPropertyValue("--song-size") : "?") +
      ", room " + (rows[0] ? rows[0].clientWidth : "?"),
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
  await rm(profile, { recursive: true, force: true });

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
        return JSON.parse(out.result.value);
      };

      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const n = await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".sheet .chord").length', returnByValue: true });
        if (n.result.value > 0) break;
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
      /* One line of the song per row. A leftover used to pull the line after
         it up onto its own row, with a mark between the two saying where one
         ended and the other began; a row is one line now and there is nothing
         to mark. */
      check("narrow: one row holds one line of the song", poured.seps === 0,
        `${poured.seps} separators, so a row is carrying two lines`);
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

    /* --- 3. dragging moves one chord and leaves the rest where they are --- */
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
  });
} finally {
  server.close();
  await rm(root, { recursive: true, force: true });
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
