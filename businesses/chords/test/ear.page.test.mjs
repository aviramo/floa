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

/* Am, G, F and a couple of others, so that the list of the song's own chords
   has something in it and the marking on the sheet has more than one answer to
   choose between. */
const BODY = [
  "{בית}",
  "[Am]בנקיק [G]נסתר בצוקים [F]אילה שותה [Am]מים",
  "מה [Dm]לי וללה [G]אלא צוקי לב[Am]י",
].join("\n");

const SONG = {
  id: "test", slug: "s-ear", title: "בדיקת אוזן", lyrics_by: "", music_by: "",
  dir: "rtl", status: "ready", status_note: "", lines: BODY,
};

/* --- the sound, written out by hand ----------------------------------------
   An A minor chord as a guitar voices it, A2 E3 A3 C4 E4, each with four
   harmonics falling away above it. Everything else in the spectrum is silence,
   which is not what a room sounds like and is not the point: what is being
   tested here is the wiring, and a clean signal is the only one that makes a
   wrong answer mean something. */
const VOICING = [45, 52, 57, 60, 64];
const RINGS = [-20, -28, -34, -40];

function page() {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="/chords/assets/style.css">
<script>
window.__errors = [];
addEventListener("error", (e) => window.__errors.push(e.message + " @ " + e.filename + ":" + e.lineno));
addEventListener("unhandledrejection", (e) => window.__errors.push("rejected: " + e.reason));
history.replaceState(null, "", "/chords/${SONG.slug}");
/* The page as it is written and not as the app would guess it: the marking
   below is checked against chord names, and a transposition chosen for us
   would make those names something else. */
localStorage.setItem("chords.song.-." + ${JSON.stringify(SONG.id)}, JSON.stringify({ p: 0 }));
window.SUPABASE = { url: "https://stub.invalid", anonKey: "anon" };
const SONG = ${JSON.stringify(SONG)};
window.fetch = (url) => Promise.resolve(new Response(
  JSON.stringify(String(url).includes("/rest/v1/songs") ? [SONG] : []),
  { status: 200, headers: { "content-type": "application/json" } }));

/* --- a microphone that is not one ------------------------------------------
   Stubbed at the browser's boundary, so that everything the app and ear.js do
   with what comes back is the shipped code doing it. */
Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: { getUserMedia: () => Promise.resolve({ getTracks: () => [] }) },
});

const RATE = 48000;
window.__sound = "chord";          // or "note": the test switches this

function analyser() {
  const a = {
    fftSize: 2048, smoothingTimeConstant: 0, minDecibels: -100, maxDecibels: -30,
    connect() {},
    get frequencyBinCount() { return this.fftSize / 2; },
    getFloatFrequencyData(out) {
      out.fill(-110);
      if (window.__sound !== "chord") return;
      const bin = RATE / this.fftSize;
      for (const midi of ${JSON.stringify(VOICING)}) {
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
  return JSON.stringify({
    open: !!document.querySelector(".ear"),
    padded: document.body.classList.contains("on-ear"),
    heard: (document.querySelector(".heard-now") || {}).textContent,
    bars: [...document.querySelectorAll(".cx-fill")].map((b) => parseInt(b.style.height, 10) || 0),
    tape: (document.querySelector(".ear-tape") || {}).textContent,
    level: (document.querySelector(".ear-lit") || { style: {} }).style.width,
    rows, marked,
    sheet: [...document.querySelectorAll(".sheet .chord")].map((c) => c.textContent),
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

      for (let i = 0; i < 40; i++) {
        await sleep(250);
        const n = await send("Runtime.evaluate", { expression: 'document.querySelectorAll(".sheet .chord").length', returnByValue: true });
        if (n.result.value > 0) break;
        if (i === 4 || i === 16) await send("Page.navigate", { url });
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
await mkdir(root, { recursive: true });
await writeFile(join(root, "index.html"), page(), "utf8");

try {
  await withChrome(async (open) => {
    await open(`http://127.0.0.1:${port}/chords/_ear/`, async ({ send, evaluate }) => {
      const before = await evaluate(CHORD_READ);
      check("the song is on the page before anything is listened to",
        before.sheet.length > 0 && !before.open, JSON.stringify(before.sheet));

      /* --- the door ------------------------------------------------------- */
      const opened = await evaluate('JSON.stringify(!!document.querySelector(".ear-door") && (document.querySelector(".ear-door").click(), true))');
      check("there is a way in from the song's own strip", opened === true, String(opened));

      /* Long enough for the microphone to be handed over, for a few readings
         to land, and for STEADY of them to agree. */
      await sleep(900);
      const heard = await evaluate(CHORD_READ);

      check("the panel is up", heard.open && heard.padded, JSON.stringify({ open: heard.open, padded: heard.padded }));
      check("and the page was given room under itself for it", heard.padded, "on-ear was not set");
      check("it says how loud it is hearing", heard.level && heard.level !== "0%", String(heard.level));
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

      /* --- and the mark on the song ---------------------------------------- */
      check("every Am in the song is lit and nothing else is",
        heard.marked.length === 3 && heard.marked.every((c) => c === "Am"),
        JSON.stringify(heard.marked));

      /* --- the other tab ---------------------------------------------------- */
      await evaluate('JSON.stringify((window.__sound = "note", [...document.querySelectorAll(".ear-tab")][0].click(), true))');
      await sleep(700);
      const note = await evaluate(NOTE_READ);
      check("a 110 hertz string is named A", note.name === "A", JSON.stringify(note));
      check("in the octave it is actually in", note.octave === "2", String(note.octave));
      check("exactly in tune reads as exactly in tune", note.inTune && /^\+?-?0$/.test(note.cents),
        JSON.stringify({ cents: note.cents, inTune: note.inTune }));
      check("and it is the second string that lit", note.peg === 1, String(note.peg));
      check("the mark on the song went with the tab that made it", note.marked === 0, String(note.marked));

      /* --- and out again ---------------------------------------------------- */
      await evaluate('JSON.stringify((document.querySelector(".ear .icon-btn").click(), true))');
      await sleep(200);
      const shut = await evaluate(CHORD_READ);
      check("closing takes the panel, the room under it and every mark",
        !shut.open && !shut.padded && shut.marked.length === 0,
        JSON.stringify({ open: shut.open, padded: shut.padded, marked: shut.marked }));

      check("and nothing threw along the way", shut.errors.length === 0, JSON.stringify(shut.errors));
    });
  });
} finally {
  server.close();
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
