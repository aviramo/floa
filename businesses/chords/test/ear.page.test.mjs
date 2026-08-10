/* ==========================================================================
   The microphone panel, driven in a real browser over a real built page.

   ear.test.mjs checks the arithmetic: hand it twelve numbers and it names a
   chord. This checks everything between that and a person: that the door opens
   the panel, that the panel asks the microphone, that what comes back reaches
   the bars, the needle and the song, and that closing it puts everything back.

   THE MICROPHONE IS THE ONE THING STUBBED, and it is stubbed at the browser's
   own boundary rather than inside the app: getUserMedia hands back a stream
   nobody reads, and AudioContext hands back analysers that answer with a
   spectrum written out here by hand. So everything from ear.js inwards is the
   shipped code, running, and what it is being fed is an A minor chord and a
   110 hertz sine, which are the two things this panel exists to recognise.

     node build.mjs && npm run test:ear

   Needs dist/, so build first. Where there is no browser to drive it says so
   and passes: a machine without Chrome has learned nothing either way.
   ========================================================================== */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const DIST = resolve("dist");

/* Seven chords, and Am three times among them. The repeat is the point: a mark
   that lights every Am at once and a mark that knows WHICH Am are two
   different things, and this song is written so that the difference shows. */
const BODY = [
  "{בית}",
  "[Am]בנקיק [G]נסתר בצוקים [F]אילה שותה [Am]מים",
  "מה [Dm]לי וללה [G]אלא צוקי לב[Am]י",
].join("\n");

/* Am G F Am Dm G Am, which is the order the sheet puts them in and therefore
   the order the follower reads them in. */
const SEQUENCE = ["Am", "G", "F", "Am", "Dm", "G", "Am"];

const SONG = {
  id: "test", slug: "s-ear", title: "בדיקת אוזן", lyrics_by: "", music_by: "",
  dir: "rtl", status: "ready", status_note: "", lines: BODY,
};

/* --- AND A SONG THAT DOES NOT FIT ON A SCREEN ------------------------------
   Which is the only kind that can be scrolled, and therefore the only kind
   that can show whether the page moves itself. The same two lines over and
   over: what is being measured is where the window ends up, and the words have
   nothing to do with it.

   The last verse ends on a Dm, which is the one chord in it that happens once.
   That is what the follower is walked to, and it is a long way down. */
const LONG = ["{בית}"].concat(
  Array.from({ length: 40 }, () => "[Am]בנקיק [G]נסתר בצוקים [F]אילה שותה מים")
).concat(["[Dm]ובסוף השיר"]).join("\n");

const TALL = {
  id: "tall", slug: "s-tall", title: "בדיקת גלילה", lyrics_by: "", music_by: "",
  dir: "rtl", status: "ready", status_note: "", lines: LONG,
};

/* --- AND THE SAME SONG UNDER A CAPO ----------------------------------------
   Which is the case the whole app is quietly built around and the listening
   forgot: WHAT IS PRINTED IS THE SHAPE A HAND HOLDS, and the sound is that
   shape moved up by the fret the capo is at. Page says Am, capo on the third,
   room hears Cm.

   The voicings played into the microphone below are the SOUNDING ones, which
   is what a microphone would get. Nothing about the page changes. */
const CAPOED = {
  id: "capo", slug: "s-capo", title: "בדיקת קפו", lyrics_by: "", music_by: "",
  dir: "rtl", status: "ready", status_note: "", lines: BODY,
};
const CAPO = 3;

/* --- the sound, written out by hand ----------------------------------------
   An A minor chord as a guitar voices it, A2 E3 A3 C4 E4, each with four
   harmonics falling away above it. Everything else in the spectrum is silence,
   which is not what a room sounds like and is not the point: what is being
   tested here is the wiring, and a clean signal is the only one that makes a
   wrong answer mean something. */
const VOICINGS = {
  Am: [45, 52, 57, 60, 64],           /* A2 E3 A3 C4 E4 */
  G: [43, 47, 50, 55, 59, 67],        /* G2 B2 D3 G3 B3 G4 */
  F: [41, 48, 53, 57, 60, 65],        /* F2 C3 F3 A3 C4 F4 */
  Dm: [50, 57, 62, 65],               /* D3 A3 D4 F4 */
  /* the same four shapes as they sound with a capo on the third fret */
  "Am+3": [48, 55, 60, 63, 67],
  "G+3": [46, 50, 53, 58, 62, 70],
  "F+3": [44, 51, 56, 60, 63, 68],
  "Dm+3": [53, 60, 65, 68],
};
const RINGS = [-20, -28, -34, -40];

function page(song = SONG, capo = 0) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<!-- The same one the real shell carries. Without it a browser told it is a
     phone still lays the page out at 980 pixels, which is a desk, and a song
     that would have been one tall column comes out as three short ones with
     nothing to scroll. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/chords/assets/style.css">
<script>
window.__errors = [];
addEventListener("error", (e) => window.__errors.push(e.message + " @ " + e.filename + ":" + e.lineno));
addEventListener("unhandledrejection", (e) => window.__errors.push("rejected: " + e.reason));
history.replaceState(null, "", "/chords/${song.slug}");
/* The page as it is written and not as the app would guess it: the marking
   below is checked against chord names, and a transposition chosen for us
   would make those names something else. */
/* THE FRET IS THE GAP between what is printed and what is sung (see capoOf),
   so a capo is asked for by saying the song is sung higher than it is drawn:
   page at nought, singing at three, fret three. */
localStorage.setItem("chords.song.-." + ${JSON.stringify(song.id)},
  JSON.stringify({ p: 0, s: ${JSON.stringify(capo)} }));
window.SUPABASE = { url: "https://stub.invalid", anonKey: "anon" };
const SONG = ${JSON.stringify(song)};
window.fetch = (url) => Promise.resolve(new Response(
  JSON.stringify(String(url).includes("/rest/v1/songs") ? [SONG] : []),
  { status: 200, headers: { "content-type": "application/json" } }));

/* --- a microphone that is not one ------------------------------------------
   getUserMedia is NOT stubbed. Chrome is started with a fake capture device
   (see the flags below), so what comes back is a real MediaStream: real enough
   for MediaRecorder to record, which a hand written object is not, and that is
   the whole reason. What IS stubbed is the AudioContext, so the analysis is
   still fed a spectrum written out here by hand and stays exact. */
const RATE = 48000;
window.__sound = "chord";          // "note", or "hush": the test switches this
window.__voicings = ${JSON.stringify(VOICINGS)};
window.__playing = "Am";           // which of them is being strummed

function analyser() {
  const a = {
    fftSize: 2048, smoothingTimeConstant: 0, minDecibels: -100, maxDecibels: -30,
    connect() {},
    get frequencyBinCount() { return this.fftSize / 2; },
    getFloatFrequencyData(out) {
      out.fill(-110);
      if (window.__sound !== "chord") return;   // silence, and the note tab
      const bin = RATE / this.fftSize;
      for (const midi of window.__voicings[window.__playing]) {
        const f = 440 * Math.pow(2, (midi - 69) / 12);
        ${JSON.stringify(RINGS)}.forEach((db, h) => {
          const at = Math.round(f * (h + 1) / bin);
          if (at > 0 && at < out.length) out[at] = Math.max(out[at], db);
        });
      }
    },
    /* Loud enough to be worth reading, and, on the note tab, a clean 110 hertz
       sine, which is a guitar's A string exactly in tune. */
    getFloatTimeDomainData(out) {
      /* A room nobody is playing in: under HUSH, which is what the follower
         has to refuse to step on. */
      if (window.__sound === "hush") { out.fill(0); return; }
      const hz = window.__sound === "note" ? 110 : 220;
      for (let i = 0; i < out.length; i++) out[i] = 0.25 * Math.sin(2 * Math.PI * hz * i / RATE);
    },
  };
  return a;
}

window.AudioContext = function () {
  return {
    sampleRate: RATE, state: "running",
    resume() {}, close() {},
    createMediaStreamSource: () => ({ connect() {} }),
    createAnalyser: analyser,
  };
};
<\/script>
</head><body>
<header class="top"><div class="wrap top-in"><a class="brand" href="/chords/">א</a><div class="top-where" id="topWhere"></div><div class="top-facts" id="topFacts"></div><div class="top-find" id="topFind"></div><div class="top-actions" id="topActions"></div></div></header>
<main id="app" class="wrap"></main>
<div id="toast" class="toast"></div>
<dialog id="authDialog" class="dlg"><form id="authForm"><p class="err" id="authErr"></p><button type="button" data-close></button><button type="submit"></button></form></dialog>
<script src="/chords/assets/config.js"><\/script>
<script src="/chords/assets/ear.js"><\/script>
<script src="/chords/assets/follow.js"><\/script>
<script src="/chords/assets/app.js"><\/script>
</body></html>`;
}

/* --- what the panel says about itself ------------------------------------- */
const CHORD_READ = `(() => {
  const marked = [...document.querySelectorAll(".sheet .chord.is-heard")].map((c) => c.textContent);
  const rows = [...document.querySelectorAll(".mine-row")].map((r) => ({
    name: r.querySelector(".mine-name").textContent,
    width: r.querySelector(".mine-fill").style.width,
    top: r.classList.contains("is-top"),
  }));
  const band = document.querySelector(".ear");
  return JSON.stringify({
    open: !!band,
    /* Out of the way rather than gone: the band still exists, holding the
       measurement, and while the follower is running it takes no room. */
    away: !!band && band.hidden,
    padded: document.body.classList.contains("on-ear"),
    /* What is done to a recording, which stands in the song's own strip. Not
       called tape: this whole expression is a template string, that name is
       already taken by the record of the chords heard, and the later key wins
       silently, which is a confusing half hour. */
    keys: [...document.querySelectorAll(".tape-bar .icon-btn")].length,
    /* the filled round one, which is the way in and then the recording */
    rec: !!document.querySelector(".tape-bar .icon-btn.is-rec"),
    taping: !!document.querySelector(".tape-bar .icon-btn.is-taping"),
    heard: (document.querySelector(".heard-now") || {}).textContent,
    bars: [...document.querySelectorAll(".cx-fill")].map((b) => parseInt(b.style.height, 10) || 0),
    tape: (document.querySelector(".ear-tape") || {}).textContent,
    rows, marked,
    sheet: [...document.querySelectorAll(".sheet .chord")].map((c) => c.textContent),
    errors: window.__errors,
  });
})()`;

/* Where the follower says we are: the ONE chord it marked, its place in the
   song, and how much room the band is taking while it does it. */
const FOLLOW_READ = `(() => {
  const all = [...document.querySelectorAll(".sheet .chord")];
  const at = all.findIndex((c) => c.classList.contains("is-at"));
  return JSON.stringify({
    at,
    marks: all.filter((c) => c.classList.contains("is-at")).length,
    /* The line lit under the mark, and whether it is the mark's own line. A
       band on a line the mark is not on is worse than no band. */
    lines: document.querySelectorAll(".sheet .ln.is-here").length,
    lineHolds: (() => {
      const lit = document.querySelector(".sheet .ln.is-here");
      const mark = document.querySelector(".sheet .chord.is-at");
      return !!(lit && mark && lit.contains(mark));
    })(),
    heard: document.querySelectorAll(".sheet .chord.is-heard").length,
    said: (document.querySelector(".ear-at") || {}).textContent,
    on: !!document.querySelector(".ear-go.is-on"),
    away: !!(document.querySelector(".ear") || {}).hidden,
    padded: document.body.classList.contains("on-ear"),
    sequence: all.map((c) => c.textContent),
    errors: window.__errors,
  });
})()`;

/* Where the WINDOW is, which is the only way to ask whether the page moved
   itself. Everything else about following can be right while the mark sits
   two screens below the glass. */
const SCROLL_READ = `(() => {
  const mark = document.querySelector(".sheet .chord.is-at");
  return JSON.stringify({
    y: Math.round(window.scrollY || window.pageYOffset || 0),
    room: Math.round(document.documentElement.scrollHeight - window.innerHeight),
    at: [...document.querySelectorAll(".sheet .chord")].findIndex((c) => c.classList.contains("is-at")),
    /* Where the mark is standing on the glass, as a fraction of the window.
       Under nought is above the top of the screen and over one is below it. */
    where: mark ? +(mark.getBoundingClientRect().top / window.innerHeight).toFixed(2) : null,
    chords: document.querySelectorAll(".sheet .chord").length,
    errors: window.__errors,
  });
})()`;

const NOTE_READ = `(() => JSON.stringify({
  name: (document.querySelector(".tune-name") || {}).textContent,
  octave: (document.querySelector(".tune-oct") || {}).textContent,
  cents: (document.querySelector(".tune-cents") || {}).textContent,
  inTune: !!document.querySelector(".tune.is-true"),
  peg: [...document.querySelectorAll(".peg")].findIndex((p) => p.classList.contains("is-on")),
  marked: document.querySelectorAll(".sheet .chord.is-heard").length,
  errors: window.__errors,
}))()`;

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

/* Waited for rather than slept past. Crossing the narrow line redraws the
   whole song, and a fixed pause either wastes time or, on a slow machine,
   presses a button that is not there yet and fails saying nothing about why. */
const until = async (evaluate, expression, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await evaluate(`JSON.stringify(!!(${expression}))`)) return true;
    await sleep(150);
  }
  return false;
};

async function withChrome(run) {
  const port = 9335;
  const profile = join(process.env.TEMP || "/tmp", "chords-ear-profile");
  for (let i = 0; i < 10; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; }
    catch (e) { if (i === 9) throw e; await sleep(500); }
  }

  const child = spawn(browser, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    /* A real microphone that is not a microphone: a stream the machine makes
       up, which getUserMedia hands over without asking anybody. Real enough
       for MediaRecorder, which is what the recording is built on. */
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
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
      const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
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

      await send("Page.enable", {});
      await send("Page.navigate", { url });

      const evaluate = async (expression) => {
        const out = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
        if (out.exceptionDetails) {
          const why = out.exceptionDetails.exception || {};
          throw new Error("the page threw: " + (why.description || why.value || out.exceptionDetails.text));
        }
        return out.result.value === undefined ? undefined : JSON.parse(out.result.value);
      };

      /* A TAB THAT CAME UP ON NOTHING. Chrome hands back a target before it
         has navigated to the address it was opened with often enough to
         matter, and by the third tab of a run, with audio contexts and a
         recorder behind it, often enough to matter a lot. Asked for again
         every few seconds rather than once, and waited on for longer. */
      for (let i = 0; i < 80; i++) {
        await sleep(250);
        const n = await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".sheet .chord").length', returnByValue: true });
        if (n.result.value > 0) break;
        if (i % 8 === 4) await send("Page.navigate", { url });
      }
      await sleep(400);

      const result = await body({ send, evaluate });
      socket.close();
      await fetch(`http://127.0.0.1:${port}/json/close/${target.id}`);
      return result;
    });
  } finally {
    child.kill();
  }
}

/* --- the run -------------------------------------------------------------- */
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${label}${ok ? "" : `\n       ${detail}`}`);
  if (!ok) failed++;
};

const { server, port } = await serve();

/* Written into dist/ and served from there, rather than handed to the tab as a
   string: the stubs above have to be in place before the app's own scripts
   run, and those scripts are asked for by address. A document set after the
   fact is a document whose scripts have already been fetched. */
const root = join(DIST, "chords/_ear");
await mkdir(join(root, "tall"), { recursive: true });
await writeFile(join(root, "index.html"), page(), "utf8");
await writeFile(join(root, "tall/index.html"), page(TALL), "utf8");
await mkdir(join(root, "capo"), { recursive: true });
await writeFile(join(root, "capo/index.html"), page(CAPOED, CAPO), "utf8");

try {
  await withChrome(async (open) => {
    await open(`http://127.0.0.1:${port}/chords/_ear/`, async ({ send, evaluate }) => {
      const before = await evaluate(CHORD_READ);
      check("the song is on the page before anything is listened to",
        before.sheet.length > 0 && !before.open, JSON.stringify(before.sheet));

      /* --- THE DOOR, AND THERE IS ONLY ONE -----------------------------------
         Opening the microphone, following the song and recording it are one
         thing somebody wants, so they are one thing to press for. */
      await until(evaluate, 'document.querySelector(".tape-bar .icon-btn")');
      const resting = await evaluate(CHORD_READ);
      check("the song's strip offers one button, and it is the record one",
        resting.keys === 1 && resting.rec && !resting.open,
        JSON.stringify({ keys: resting.keys, rec: resting.rec, open: resting.open }));
      const opened = await evaluate('JSON.stringify((document.querySelector(".tape-bar .icon-btn").click(), true))');
      check("pressing it is the whole way in", opened === true, String(opened));

      /* Long enough for the microphone to be handed over, for a few readings
         to land, and for STEADY of them to agree. */
      await sleep(900);
      const heard = await evaluate(CHORD_READ);

      /* THE BAND IS BUILT AND IT IS OUT OF THE WAY. Following starts on its
         own here (see below), and while it runs there is no band on screen at
         all: what is being looked at is the song. */
      check("the panel is built", heard.open && heard.away,
        JSON.stringify({ open: heard.open, away: heard.away }));
      check("and it takes no room off the song while the follower runs",
        !heard.padded, "on-ear was still set");
      /* ONE BUTTON WHILE IT RUNS, and it is the thing that says it is running:
         red and breathing, which is the difference between "there is a
         recording here" and "it is going". */
      check("one press started the recording as well as the listening",
        heard.taping === true, JSON.stringify({ taping: heard.taping }));
      check("and while it runs there is one button and it holds",
        heard.keys === 1, heard.keys + " buttons");
      /* THERE WAS A LOUDNESS BAR HERE and a check that it moved. Both are gone
         with the lid the bar stood on (see buildEar): what says the microphone
         is reaching the page is the panel naming a chord, which is the next
         check but one and a better answer than a moving bar ever was. */
      check("an A minor chord is heard as A minor", heard.heard === "Am", String(heard.heard));
      check("and written down as it was heard", (heard.tape || "").indexOf("Am") >= 0, JSON.stringify(heard.tape));

      /* The twelve bars are the raw material every guess is made of, so a
         panel that names a chord over twelve flat bars has named it out of
         nothing. A, C and E are the chord; the rest is what the harmonics
         leave behind. */
      const lit = heard.bars.filter((h) => h > 40).length;
      check("the twelve bars are drawn and are not all the same",
        lit >= 3 && lit <= 7, JSON.stringify(heard.bars));

      /* --- the song's own chords ------------------------------------------- */
      const names = heard.rows.map((r) => r.name);
      check("every chord the song uses is scored, once each",
        JSON.stringify(names) === JSON.stringify(["Am", "G", "F", "Dm"]), JSON.stringify(names));
      check("in the song's own order and not by score",
        names[0] === "Am" && names[3] === "Dm", JSON.stringify(names));
      check("the one being played is the one marked",
        heard.rows.filter((r) => r.top).map((r) => r.name).join() === "Am",
        JSON.stringify(heard.rows));
      check("and they are scored apart rather than all alike",
        new Set(heard.rows.map((r) => r.width)).size > 1, JSON.stringify(heard.rows.map((r) => r.width)));

      /* ====================================================================
         AND THE FOLLOWER, which is what the rest of this was for, and which
         is why it is already running: opening this tab on a song is asking to
         be followed through it. What used to stand here instead was the
         measurement's own mark, which lights every chord of a name at once,
         and three Am in a line all lit is the honest answer to a question
         nobody asked. It looks exactly like a follower that is broken.
         ==================================================================== */
      await until(evaluate, 'document.querySelector(".sheet .chord.is-at")');
      /* THE MARK IS ON WHAT HAS NOT BEEN PLAYED YET, so on a page where an Am
         is already sounding it opens on the first chord, hears it, and settles
         on the SECOND. Read after that has happened rather than during it:
         everything below compares against where it settled. */
      await sleep(400);
      const began = await evaluate(FOLLOW_READ);
      check("the song the follower reads is the song on the page",
        JSON.stringify(began.sequence) === JSON.stringify(SEQUENCE), JSON.stringify(began.sequence));
      check("opening the tab on a song is asking to be followed through it",
        began.on && began.away, JSON.stringify({ on: began.on, away: began.away }));
      /* The follower's answer is on one chord and nothing is drawn on it: what
         a reader sees is the band across that chord's line (see below). The
         answer is still asked for here, because it is the only place the exact
         chord can be read, and telling the second Am from the first is the
         whole of what this block is for. */
      check("one chord is the answer, and one only",
        began.marks === 1, JSON.stringify({ marks: began.marks, at: began.at }));
      check("the mark that lights every chord of a name is put away while it runs",
        began.heard === 0, String(began.heard));
      /* What a player catches without hunting for it. One line, and the one
         the mark is standing on. */
      check("and the line the mark is on is lit, and only that line",
        began.lines === 1 && began.lineHolds,
        JSON.stringify({ lines: began.lines, holds: began.lineHolds }));
      check("and it says which chord of the song is being waited for",
        /2\s*מתוך\s*7/.test(began.said || ""), JSON.stringify(began.said));

      /* --- AND A ROOM NOBODY IS PLAYING IN MOVES NOTHING ---------------------
         Switching a microphone on is a moment of nothing: a click, a room, a
         chair, whatever the machine does as it opens the input. The follower
         used to take that as its first reading and, having nothing yet to be
         loyal to, take it as the ANSWER: the mark landed a chord or two in
         before a single string had been touched. */
      await evaluate('JSON.stringify((window.__sound = "hush", true))');
      await sleep(900);
      const hushed = await evaluate(FOLLOW_READ);
      check("silence does not walk the mark anywhere",
        hushed.at === began.at && hushed.marks === 1,
        JSON.stringify({ was: began.at, now: hushed.at, marks: hushed.marks }));
      await evaluate('JSON.stringify((window.__sound = "chord", true))');
      await sleep(400);

      /* --- and now the song is played ---------------------------------------
         Am G F Am Dm, one chord at a time, which is the whole of what a
         follower has to get right. The song is Am G F Am Dm G Am, and the mark
         runs one ahead of the playing throughout, because what it is standing
         on is the chord not played yet. */
      const walked = [began.at];
      for (const chord of ["G", "F", "Am", "Dm"]) {
        await evaluate(`JSON.stringify((window.__playing = ${JSON.stringify(chord)}, true))`);
        await sleep(700);
        walked.push((await evaluate(FOLLOW_READ)).at);
      }
      check("it waits through the song in order as the song is played",
        JSON.stringify(walked) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(walked));

      /* THE ONE THAT MATTERS. The fourth step above played an Am, and there
         are three Am in this song. What it went on to wait for was the Dm that
         follows the SECOND of them, which no measurement of the sound could
         have chosen: the first Am is followed by a G. */
      check("the second Am is the second Am and not the first",
        walked[3] === 4, JSON.stringify(walked));

      /* --- a finger says where we are --------------------------------------- */
      await evaluate(`JSON.stringify(([...document.querySelectorAll(".sheet .chord")][6]
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), true))`);
      await sleep(200);
      const tapped = await evaluate(FOLLOW_READ);
      check("touching a chord on the page puts the mark there",
        tapped.at === 6 && tapped.marks === 1, JSON.stringify({ at: tapped.at, marks: tapped.marks }));

      /* --- and off again -----------------------------------------------------
         Which is the way back to the measurement, and to the mark that belongs
         to it: every chord of the name being heard, all at once, which is all
         a sound can say and is worth being able to see. */
      /* Back to strumming an Am, so that the mark being asked after has more
         than one place in this song to be: the whole difference between the
         two marks is that one of them lights all three. */
      await evaluate('JSON.stringify((window.__playing = "Am", true))');
      await evaluate('JSON.stringify((document.querySelector(".ear-go").click(), true))');
      await sleep(900);
      const off = await evaluate(FOLLOW_READ);
      check("switching it off takes the mark and brings the measurement back",
        off.marks === 0 && !off.on && !off.away && off.padded, JSON.stringify(off));
      check("and the band under the line goes with it",
        off.lines === 0, String(off.lines));

      const bare = await evaluate(CHORD_READ);
      check("and the measurement's own mark comes back with it: every Am at once",
        bare.marked.length === 3 && bare.marked.every((c) => c === "Am"),
        JSON.stringify(bare.marked));

      /* AND IT STAYS OFF. A default that reasserts itself a reading later is
         not a default, it is an argument. */
      await sleep(600);
      const still = await evaluate(FOLLOW_READ);
      check("a switch turned off stays turned off", !still.on && still.marks === 0,
        JSON.stringify({ on: still.on, marks: still.marks }));

      /* --- and on again ------------------------------------------------------ */
      await evaluate('JSON.stringify((document.querySelector(".ear-go").click(), true))');
      await sleep(700);
      const again = await evaluate(FOLLOW_READ);
      check("and switching it back on takes one mark again",
        again.on && again.marks === 1 && again.heard === 0,
        JSON.stringify({ on: again.on, marks: again.marks, heard: again.heard }));

      /* --- AND THE TUNER, WHICH IS A DOOR AND NOT A TAB ----------------------
         The band had two tabs at the top of it and it has none: there is a
         door per side now, and on a song the tuner's door is a row in the
         panel behind the three dots (see songRows in app.js). */
      await evaluate(`JSON.stringify((window.__sound = "note",
        document.querySelector('#topActions [aria-label^="עוד"]').click(), true))`);
      await sleep(250);
      await evaluate(`JSON.stringify((function () {
        var row = [...document.querySelectorAll(".print-menu .btn")]
          .find(function (b) { return b.getAttribute("aria-label") === "כיוון הגיטרה"; });
        if (row) row.click();
        return !!row;
      })())`);
      await sleep(700);
      const note = await evaluate(NOTE_READ);
      check("a 110 hertz string is named A", note.name === "A", JSON.stringify(note));
      check("in the octave it is actually in", note.octave === "2", String(note.octave));
      check("exactly in tune reads as exactly in tune", note.inTune && /^\+?-?0$/.test(note.cents),
        JSON.stringify({ cents: note.cents, inTune: note.inTune }));
      check("and it is the second string that lit", note.peg === 1, String(note.peg));
      check("the mark on the song went with the tab that made it", note.marked === 0, String(note.marked));

      /* --- AND THE TWO STATES OF A RECORDING ---------------------------------
         Back to the chords, where the take started at the door and has been
         running through all of the above.

         NOT STARTED, one button, and it records. RUNNING, one button, and it
         holds the take and asks what to do with it in the same press: that is
         what pausing is for. There is no third state on the screen, because
         closing the question carries on. */
      /* And back to the chords by pressing the song, which is how every panel
         in this app is put away. With a take running that press ends the
         TUNER and not the band: the recording is still going and what belongs
         to it is the chords (see earOutside). */
      await evaluate(`JSON.stringify((window.__sound = "chord",
        document.querySelector(".sheet").dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true })), true))`);
      await until(evaluate, 'document.querySelector(".tape-bar .icon-btn")');
      await sleep(400);

      const running = await evaluate(CHORD_READ);
      check("running: one button, and it is the one that says so",
        running.keys === 1 && running.taping === true,
        JSON.stringify({ keys: running.keys, taping: running.taping }));

      /* --- PAUSING IS ASKING -------------------------------------------------
         A take is a person singing, most of them are not worth keeping, and a
         library that fills up with every attempt is a library nobody opens. So
         what the pause does is hand it back to be heard. */
      await evaluate('JSON.stringify((document.querySelector(".tape-bar .icon-btn").click(), true))');
      const offered = await until(evaluate, 'document.querySelector("dialog[open] .take-play")');
      check("pausing offers the take to listen to", offered, "no panel came up");
      const asked = await evaluate(`JSON.stringify({
        answers: [...document.querySelectorAll("dialog[open] .dlg-actions .btn")].map((b) => b.textContent),
      })`);
      /* Saving needs an account and this harness has none, so what is offered
         here is the one answer that does not: throwing it away. What matters
         either way is that WALKING AWAY IS NOT A BUTTON. */
      check("nothing on offer is a way of not answering",
        asked.answers.length >= 1 && !asked.answers.some((w) => /סגירה|ביטול/.test(w)),
        JSON.stringify(asked.answers));

      /* --- AND CLOSING IT CARRIES ON ----------------------------------------
         Not "leave it paused": whoever put the question up did so in order to
         decide, and deciding not to decide means they are still playing. */
      await evaluate('JSON.stringify((document.querySelector("dialog[open]").close(), true))');
      await sleep(600);
      const back = await evaluate(CHORD_READ);
      check("closing the question carries the recording on",
        back.keys === 1 && back.taping === true && !back.open === false,
        JSON.stringify({ keys: back.keys, taping: back.taping }));

      /* And answering it is what ends it. */
      await evaluate('JSON.stringify((document.querySelector(".tape-bar .icon-btn").click(), true))');
      await until(evaluate, 'document.querySelector("dialog[open] .take-play")');

      /* --- AND ANSWERING IT PUTS EVERYTHING BACK -----------------------------
         Keeping the take and throwing it away are both the end of it, and what
         is on the other side is a page nobody is playing to. The light in the
         tab goes out, the mark comes off, and the button looks exactly as it
         did before any of this was pressed. */
      /* And answering it is what ends it. */
      await evaluate('JSON.stringify(([...document.querySelectorAll("dialog[open] .dlg-actions .btn")][0].click(), true))');
      await sleep(600);
      const shut = await evaluate(CHORD_READ);
      check("answering the take shuts the microphone and puts the page back",
        !shut.open && !shut.padded && shut.marked.length === 0 && !shut.taping &&
        shut.keys === 1 && shut.rec,
        JSON.stringify({ open: shut.open, padded: shut.padded, marked: shut.marked,
                         keys: shut.keys, rec: shut.rec }));

      check("and nothing threw along the way", shut.errors.length === 0, JSON.stringify(shut.errors));
    });

    /* ======================================================================
       AND THE PAGE MOVING UNDER THE MARK.

       On a phone sized screen and a song that does not fit on one, because
       those are the only conditions under which there is anything to move. A
       wide window pours a long song into columns until it fits, and a page
       that fits is a page with nothing to scroll: every check below would pass
       by doing nothing at all.
       ====================================================================== */
    await open(`http://127.0.0.1:${port}/chords/_ear/tall/`, async ({ send, evaluate }) => {
      await send("Emulation.setDeviceMetricsOverride", {
        width: 430, height: 760, deviceScaleFactor: 1, mobile: true,
      });
      /* The app draws a different page either side of the narrow line, and the
         controls move with it (see placeControls): on a phone they are on a
         strip under the header rather than in the bar. Waited for. */
      await until(evaluate, 'document.querySelector(".sheet .chord") && document.querySelector(".tape-bar .icon-btn")');
      await sleep(300);

      const start = await evaluate(SCROLL_READ);
      check("the song is taller than the screen, so there is something to scroll",
        start.room > 400 && start.chords > 30, JSON.stringify({ room: start.room, chords: start.chords }));
      check("and it opens at the top", start.y === 0, String(start.y));

      await evaluate('JSON.stringify((document.querySelector(".tape-bar .icon-btn").click(), true))');
      await until(evaluate, 'document.querySelector(".sheet .chord.is-at")');
      await sleep(300);

      const lit = await evaluate(SCROLL_READ);
      check("following starts on the tall song too", lit.at >= 0, JSON.stringify({ at: lit.at }));

      /* --- a finger on a chord a long way down --------------------------------
         The quickest way to ask the one question this block exists for: put
         the mark somewhere off the screen and see whether the screen follows
         it. Which is also a thing people do.

         FAR ENOUGH DOWN TO BE OFF THE SCREEN AND NO FURTHER. The first version
         of this reached for the ninetieth chord of a hundred and twenty one
         and then played thirty three more, which walks off the END of the
         song: with nowhere forward to go the follower went back to the top of
         the part, correctly, and the check read that as a snap back to the
         first line. The song has to be long enough for the walk to happen
         inside it.

         AND THE FINGER GOES ON A G. This song runs Am G F over and over and
         the room is on an Am, and a finger says "the mark belongs here", which
         is to say the chord before it is the one being played (see markPlace).
         Put on a G, the chord before it is the Am the room is playing and
         everything agrees; put on an Am, it would be claiming the F before it
         was sounding, and the follower would spend the next second putting the
         mark back where the sound says. Which is the follower working, and not
         what this block is measuring. */
      await evaluate(`JSON.stringify(([...document.querySelectorAll(".sheet .chord")][46]
        .dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })), true))`);
      await sleep(900);
      const jumped = await evaluate(SCROLL_READ);
      check("a mark put below the screen brings the screen to it",
        jumped.at === 46 && jumped.y > 200, JSON.stringify({ at: jumped.at, y: jumped.y }));
      /* A THIRD OF THE WAY DOWN, and this is the check that says so. It read
         "somewhere in the upper part", anything under six tenths, and that is
         a check a page can pass while being useless: the mark landed at
         seventy eight hundredths of the screen, INSIDE the old band and
         therefore not worth moving the page for, and what a player had under
         it was one line. The number here is the whole point of the rule.

         Not exactly a third, because the third is measured off what is
         readable rather than off the window: the header stands over the top of
         it and the strip under the bottom (see keepInView). */
      check("and it lands a third of the way down, with the song under it",
        jumped.where !== null && jumped.where > 0.2 && jumped.where < 0.5, String(jumped.where));

      /* --- and playing carries it on ---------------------------------------
         ELEVEN BARS OF IT, which is more than the page now needs and is kept
         anyway. The mark is held a third of the way down (see keepInView), so
         the page moves as soon as the playing leaves the row it is standing
         on, and three bars would show that. What eleven shows is that it keeps
         doing it: the walk crosses several rows, and a page that moved once
         and then stuck would be caught here and not by a shorter one. */
      const before = jumped.y;
      const bars = [];
      for (let i = 0; i < 11; i++) bars.push("G", "F", "Am");
      for (const chord of bars) {
        await evaluate(`JSON.stringify((window.__playing = ${JSON.stringify(chord)}, true))`);
        await sleep(260);
      }
      await sleep(600);
      const played = await evaluate(SCROLL_READ);
      check("playing on walks the mark down the song",
        played.at > 46, JSON.stringify({ from: 46, to: played.at }));
      check("and the page came down with it",
        played.y > before, JSON.stringify({ before, after: played.y }));
      /* AND STILL IN THE TOP HALF, which is stronger than "still on the
         screen" and is what the rule promises: the mark is put back on the
         line every time the playing leaves a row, so after any amount of
         walking it is on the line or a little above it, never down at the
         foot where the reading runs out. */
      check("with the mark still in the upper half, not down at the foot",
        played.where !== null && played.where > 0 && played.where < 0.55, String(played.where));

      /* --- a hand on the page outranks all of it ------------------------------
         Somebody who dragged the song has said where they want to be, and a
         page that scrolls out from under them a moment later has taken it
         back. Six seconds, and this asks inside them. */
      await evaluate(`JSON.stringify((window.dispatchEvent(new WheelEvent("wheel", { deltaY: -200 })), true))`);
      const held = (await evaluate(SCROLL_READ)).y;
      for (const chord of ["Am", "G", "F", "Am"]) {
        await evaluate(`JSON.stringify((window.__playing = ${JSON.stringify(chord)}, true))`);
        await sleep(420);
      }
      const after = await evaluate(SCROLL_READ);
      check("a hand on the page stops the page moving itself",
        after.y === held, JSON.stringify({ held, after: after.y }));
      check("but the mark carries on regardless",
        after.at > played.at, JSON.stringify({ was: played.at, now: after.at }));

      check("and nothing threw here either", after.errors.length === 0, JSON.stringify(after.errors));
    });

    /* ======================================================================
       AND THE SAME SONG UNDER A CAPO.

       The one thing about this app the listening had no idea about, and the
       more useful the capo is the more wrong it was. What is printed is the
       SHAPE a hand holds; the sound is that shape moved up by the fret. Page
       says Am, capo on the third, room hears Cm.

       So the page below is identical to the first one and the microphone is
       fed something else entirely: the same four shapes as they SOUND three
       frets up. Everything is then asked exactly as it was asked without a
       capo, and has to come out the same.
       ====================================================================== */
    await open(`http://127.0.0.1:${port}/chords/_ear/capo/`, async ({ evaluate }) => {
      await until(evaluate, 'document.querySelector(".sheet .chord") && document.querySelector(".tape-bar .icon-btn")');
      await evaluate('JSON.stringify((window.__playing = "Am+3", true))');
      await evaluate('JSON.stringify((document.querySelector(".tape-bar .icon-btn").click(), true))');
      await sleep(900);

      const capoed = await evaluate(FOLLOW_READ);
      check("the page still says the shapes, capo or no capo",
        JSON.stringify(capoed.sequence) === JSON.stringify(SEQUENCE), JSON.stringify(capoed.sequence));
      /* The room is playing a C minor and the page says Am, and the follower
         has heard the song's first Am in it and moved on to wait for the G
         after it: exactly what it does with no capo and a room playing Am. */
      check("an Am shape sounding three frets up is still the song's first Am",
        capoed.at === 1 && capoed.marks === 1, JSON.stringify({ at: capoed.at, marks: capoed.marks }));

      /* And it walks, which is the whole of the proof: every one of these is
         a chord the page does not name and the room is full of. */
      const walked = [capoed.at];
      for (const chord of ["G+3", "F+3", "Am+3", "Dm+3"]) {
        await evaluate(`JSON.stringify((window.__playing = ${JSON.stringify(chord)}, true))`);
        await sleep(700);
        walked.push((await evaluate(FOLLOW_READ)).at);
      }
      check("and the song is followed through a capo exactly as without one",
        JSON.stringify(walked) === JSON.stringify([1, 2, 3, 4, 5]), JSON.stringify(walked));

      /* The measurement underneath it too: the row says Am and scores Cm. */
      await evaluate('JSON.stringify((window.__playing = "Am+3", document.querySelector(".ear-go").click(), true))');
      await sleep(900);
      const bare = await evaluate(CHORD_READ);
      check("the ear names what the room is hearing, not what the page prints",
        bare.heard === "Cm", JSON.stringify(bare.heard));
      check("and the shape it belongs to is the one lit on the page",
        bare.marked.length === 3 && bare.marked.every((c) => c === "Am"),
        JSON.stringify(bare.marked));
      check("and the song's own rows score the shapes as they sound",
        bare.rows.filter((r) => r.top).map((r) => r.name).join() === "Am",
        JSON.stringify(bare.rows));

      check("and nothing threw under a capo", bare.errors.length === 0, JSON.stringify(bare.errors));
    });
  });
} finally {
  server.close();
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
