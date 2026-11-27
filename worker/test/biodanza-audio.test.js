/* The music of the Biodanza app is private: signed in AND on the allowlist, or nothing. */
import test from "node:test";
import assert from "node:assert/strict";
import { handleAudio, isAudioPath, _clearAudioAuthCache } from "../src/biodanza-audio.js";

const ORIGINS = ["https://biodanza.floa.co.il", "http://localhost:5173"];
const NAME = "0123456789abcdef0123456789abcdef.mp3";
const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

let lastOpts = "unset";
const bucket = {
  async get(name, opts) {
    lastOpts = opts;
    if (name !== NAME) return null;
    const r = opts && opts.range && opts.range.get && opts.range.get("range");
    const m = r && /bytes=(\d+)-(\d*)/.exec(r);
    if (!m) return { body: bytes, size: bytes.length, httpEtag: '"e"' };
    const offset = Number(m[1]), end = m[2] === "" ? bytes.length - 1 : Number(m[2]);
    return { body: bytes.slice(offset, end + 1), size: bytes.length, httpEtag: '"e"', range: { offset, length: end - offset + 1 } };
  },
};

let asked = 0;
function env(me) {
  _clearAudioAuthCache(); asked = 0;
  globalThis.fetch = async () => { asked++; return me === null ? new Response("no", { status: 401 }) : Response.json(me); };
  return { AUDIO: bucket, SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
}
const ask = (path, { token = "t", origin = ORIGINS[0], method = "GET", range } = {}) =>
  new Request("https://api.floa.co.il" + path, { method, headers: { origin, ...(token ? { authorization: "Bearer " + token } : {}), ...(range ? { range } : {}) } });

test("only the audio prefix belongs to this module", () => {
  assert.ok(isAudioPath("/biodanza/audio/x.mp3"));
  assert.ok(!isAudioPath("/lead"));
});

test("an allowed account gets the file", async () => {
  const res = await handleAudio(ask("/biodanza/audio/" + NAME), env({ allowed: true }), ORIGINS);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(new Uint8Array(await res.arrayBuffer()).length, 10);
});

test("a signed-in account that is NOT on the allowlist gets nothing", async () => {
  const res = await handleAudio(ask("/biodanza/audio/" + NAME), env({ allowed: false }), ORIGINS);
  assert.equal(res.status, 403);
});

test("no token, or a token Supabase refuses, gets nothing", async () => {
  assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME, { token: "" }), env({ allowed: true }), ORIGINS)).status, 403);
  assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME), env(null), ORIGINS)).status, 403);
});

test("a foreign origin is refused", async () => {
  const res = await handleAudio(ask("/biodanza/audio/" + NAME, { origin: "https://evil.example" }), env({ allowed: true }), ORIGINS);
  assert.equal(res.status, 403);
});

test("only random object names are served: no listing, no traversal", async () => {
  for (const bad of ["", "..%2Fsecret.mp3", "song.mp3", NAME.replace(".mp3", ".exe"), "a/" + NAME]) {
    const res = await handleAudio(ask("/biodanza/audio/" + bad), env({ allowed: true }), ORIGINS);
    assert.equal(res.status, 404, bad);
  }
});

test("a missing object is 404, and a range is honoured", async () => {
  const missing = await handleAudio(ask("/biodanza/audio/" + "f".repeat(32) + ".mp3"), env({ allowed: true }), ORIGINS);
  assert.equal(missing.status, 404);
  const part = await handleAudio(ask("/biodanza/audio/" + NAME, { range: "bytes=2-4" }), env({ allowed: true }), ORIGINS);
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("content-range"), "bytes 2-4/10");
});

test("a whole-file request is a 200 and asks R2 for no range", async () => {
  const res = await handleAudio(ask("/biodanza/audio/" + NAME), env({ allowed: true }), ORIGINS);
  assert.equal(res.status, 200);
  assert.equal(lastOpts, undefined);
  assert.equal(res.headers.get("content-range"), null);
});

const jwt = (exp) => "h." + Buffer.from(JSON.stringify({ exp })).toString("base64url") + ".s";

test("the allowlist answer is kept per token: many files, one question to Supabase", async () => {
  const e = env({ allowed: true }), tok = jwt(Math.floor(Date.now() / 1000) + 3600);
  for (let i = 0; i < 5; i++) assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME, { token: tok }), e, ORIGINS)).status, 200);
  assert.equal(asked, 1);
  assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME, { token: tok + "x" }), e, ORIGINS)).status, 200);
  assert.equal(asked, 2, "another token asks again");
});

test("an expired token is never kept, and a Supabase error is not kept", async () => {
  const e = env({ allowed: true }), old = jwt(Math.floor(Date.now() / 1000) - 10);
  await handleAudio(ask("/biodanza/audio/" + NAME, { token: old }), e, ORIGINS);
  await handleAudio(ask("/biodanza/audio/" + NAME, { token: old }), e, ORIGINS);
  assert.equal(asked, 2);
  _clearAudioAuthCache(); asked = 0;
  globalThis.fetch = async () => { asked++; return new Response("down", { status: 503 }); };
  assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME, { token: "z" }), e, ORIGINS)).status, 403);
  assert.equal((await handleAudio(ask("/biodanza/audio/" + NAME, { token: "z" }), e, ORIGINS)).status, 403);
  assert.equal(asked, 2);
});
