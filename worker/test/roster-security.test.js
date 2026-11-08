/* The security fix round on the Worker's own side (addendum 2, decisions 9, 14): the address a limit is counted
   against (IPv6 by /64), the salt that is now required, the brake on bad keys, and the characters no text may carry. */
import test from "node:test";
import assert from "node:assert/strict";
import { hashIp, ipBucket, sha256Hex } from "../src/roster/keys.js";
import { createIpLimiter, IP_LIMITS, memoryStore } from "../src/roster/limits.js";
import { hasHidden, stripHidden } from "../src/roster/text.js";
import { PUB, SEC, TOKEN, UUID_A, UUID_B, call, ctxSpy, fakeNet, makeEnv, makeRoster, req } from "./roster-helpers.js";

/* --- the address a limit is counted against ------------------------------------------- */

test("ipBucket: IPv4 as it is, IPv6 as its /64, a mapped address as the IPv4 it carries", () => {
  const same = (a, b) => assert.equal(ipBucket(a), ipBucket(b), `${a} and ${b}`);
  const differ = (a, b) => assert.notEqual(ipBucket(a), ipBucket(b), `${a} and ${b}`);
  assert.equal(ipBucket("203.0.113.7"), "203.0.113.7");
  assert.equal(ipBucket(" 203.0.113.7 "), "203.0.113.7");
  /* one /64 is one bucket, however the address is written and whatever its last 64 bits are */
  same("2001:db8:1234:5678:1:2:3:4", "2001:db8:1234:5678:ffff:ffff:ffff:ffff");
  same("2001:db8:1234:5678::1", "2001:0DB8:1234:5678:0:0:0:99");
  same("2001:db8:1234:5678::", "2001:db8:1234:5678:abcd::");
  same("[2001:db8:1234:5678::1]", "2001:db8:1234:5678::1");
  same("2001:db8:1234:5678::1%eth0", "2001:db8:1234:5678::1");
  /* another /64, another bucket; an address in a /64 is not the IPv4 of the same digits */
  differ("2001:db8:1234:5678::1", "2001:db8:1234:5679::1");
  differ("2001:db8:1234:5678::1", "2001:db9:1234:5678::1");
  differ("2001:db8::1", "2001:db8:0:1::1");
  assert.equal(ipBucket("2001:db8:1234:5678::1"), "v6:2001:0db8:1234:5678");
  assert.equal(ipBucket("::1"), "v6:0000:0000:0000:0000");
  assert.equal(ipBucket("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(ipBucket("::ffff:0102:0304"), "1.2.3.4");
  assert.equal(ipBucket("1:2:3:4:5:6:1.2.3.4"), "v6:0001:0002:0003:0004");
  /* what is not an address is used as it is, and nothing is ever empty */
  for (const junk of ["garbage:::x", "1::2::3", ":::", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:300.2.3.4", "gggg::1"]) assert.equal(ipBucket(junk), junk, junk);
  for (const none of ["", "   ", null, undefined]) assert.equal(ipBucket(none), "unknown");
});

test("hashIp: salted, and the same for every address of one /64", async () => {
  const a = await hashIp("2001:db8:1234:5678::1", "pepper");
  assert.equal(a, await hashIp("2001:db8:1234:5678:dead:beef:0:1", "pepper"));
  assert.notEqual(a, await hashIp("2001:db8:1234:5679::1", "pepper"));
  assert.notEqual(a, await hashIp("2001:db8:1234:5678::1", "other"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await sha256Hex("roster-ip:pepper:v6:2001:0db8:1234:5678"), "the documented formula, so the database may be told it");
  assert.equal(await hashIp("203.0.113.7", "pepper"), await sha256Hex("roster-ip:pepper:203.0.113.7"), "an IPv4 address hashes as it always did");
  assert.ok(!a.includes("2001"), "the address is not readable in the hash");
});

test("one IPv6 /64 is one bucket for the signup brake: rotating the last 64 bits buys nothing", async () => {
  const net = fakeNet({ rpc: {
    roster_api_auth: () => ({ ok: true, kind: "public" }),
    roster_api_signup: () => ({ status: "ok", registered: false, participant_token: TOKEN }),
    roster_events_claim: () => [], roster_events_done: () => null,
  } });
  const roster = makeRoster(net);
  const go = (ip) => call(roster, req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה" }, ip }));
  const statuses = [];
  for (let i = 0; i < 8; i++) statuses.push((await go(`2001:db8:1234:5678:${(i + 1).toString(16)}:0:0:${i + 1}`)).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429, 429], "eight addresses, one /64, six allowed");
  assert.equal((await go("2001:db8:1234:5679::1")).status, 200, "the next /64 is a fresh bucket");
  const hashes = new Set(net.rpc("roster_api_auth").map((c) => c.json.p_ip_hash));
  assert.equal(hashes.size, 2, "the database was given one hash for the whole /64 (and one for the other)");
});

/* --- ROSTER_IP_SALT is required --------------------------------------------------------- */

test("without ROSTER_IP_SALT every route answers 503 with a log line, preflight still works, nothing is asked of the database", async () => {
  const net = fakeNet();
  const roster = makeRoster(net);
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try {
    for (const salt of [undefined, ""]) {
      const env = makeEnv({ ROSTER_IP_SALT: salt });
      for (const [method, path, json] of [["GET", "/meetings"], ["POST", "/signup", { first_name: "x" }], ["POST", "/payments/click", {}], ["GET", `/participants/${UUID_A}`]]) {
        const r = await call(roster, req(path, { method, key: method === "GET" && path === "/meetings" ? PUB : SEC, json }), env);
        assert.deepEqual([r.status, r.body.error.code], [503, "server_error"], `${method} ${path} with salt ${JSON.stringify(salt)}`);
      }
      const pre = await roster.handle(req("/signup", { method: "OPTIONS" }), env, ctxSpy());
      assert.equal(pre.status, 204);
    }
  } finally {
    console.error = orig;
  }
  assert.equal(net.calls.length, 0);
  assert.ok(logged.every((l) => l.includes("ROSTER_IP_SALT")), logged.join("\n"));
  assert.ok(logged.length >= 8);
  /* and the log names every missing piece, not just the first */
  const both = [];
  console.error = (...a) => both.push(a.map(String).join(" "));
  try { await call(roster, req("/meetings", { key: PUB }), { SUPABASE_URL: "https://db.test" }); } finally { console.error = orig; }
  assert.match(both[0], /SUPABASE_SERVICE_KEY, ROSTER_IP_SALT/);
});

test("with the salt set the Worker serves, and the cron does not need it", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }), roster_events_claim: () => [], roster_events_done: () => null } });
  const roster = makeRoster(net);
  assert.equal((await call(roster, req("/meetings", { key: PUB }))).status, 200);
  const { ROSTER_IP_SALT, ...noSalt } = makeEnv();
  void ROSTER_IP_SALT;
  const ctx = ctxSpy();
  await roster.scheduled(noSalt, ctx);
  await ctx.settle();
  assert.equal(net.rpc("roster_events_claim").length, 1, "the outbox hashes no address");
});

/* --- the brake on bad keys ------------------------------------------------------------- */

const DB = (over = {}) => fakeNet({ rpc: {
  roster_api_auth: () => ({ error: "invalid_key" }),
  roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }),
  roster_events_claim: () => [], roster_events_done: () => null,
  ...over,
} });

test("badkey is 60 per 10 minutes per address", () => {
  assert.deepEqual({ ...IP_LIMITS.badkey }, { max: 60, windowSec: 600 });
});

test("limiter.peek reads the budget without spending it", async () => {
  const limiter = createIpLimiter({ store: memoryStore() });
  for (let i = 0; i < 5; i++) assert.deepEqual(await limiter.peek("badkey", "h"), { ok: true });
  for (let i = 0; i < 60; i++) assert.equal((await limiter.hit("badkey", "h")).ok, true);
  const spent = await limiter.peek("badkey", "h");
  assert.equal(spent.ok, false);
  assert.ok(spent.retryAfter >= 1 && spent.retryAfter <= 600);
  assert.equal((await limiter.hit("badkey", "h")).ok, false);
  assert.equal((await limiter.peek("badkey", "other")).ok, true);
  assert.deepEqual(await limiter.peek("not-a-bucket", "h"), { ok: true });
});

test("no key and malformed keys: 401 sixty times from one address, then 429 with Retry-After, never a database call", async () => {
  const net = DB();
  const roster = makeRoster(net);
  const ip = "198.51.100.77";
  const bad = [undefined, "junk", `rk_pub_${"a".repeat(31)}`, "x".repeat(300), `rk_sec_${"a".repeat(39)}`];
  for (let i = 0; i < 60; i++) {
    const r = await call(roster, req("/meetings", { key: bad[i % bad.length], ip }));
    assert.deepEqual([r.status, r.body.error.code], [401, "invalid_key"], `attempt ${i + 1}`);
  }
  const over = await call(roster, req("/meetings", { key: "junk", ip }));
  assert.deepEqual([over.status, over.body.error.code], [429, "rate_limited"]);
  const wait = Number(over.headers.get("retry-after"));
  assert.ok(Number.isInteger(wait) && wait >= 1 && wait <= 600, String(wait));
  assert.equal(net.calls.length, 0, "not one database call for any of them");
  /* another address is untouched */
  assert.equal((await call(roster, req("/meetings", { key: "junk", ip: "198.51.100.78" }))).status, 401);
  /* and the same /64 is one address */
  const v6 = "2001:db8:abcd:1234:";
  for (let i = 0; i < 60; i++) await call(roster, req("/meetings", { key: "junk", ip: `${v6}${i + 1}::1` }));
  assert.equal((await call(roster, req("/meetings", { key: "junk", ip: `${v6}ffff::9` }))).status, 429);
});

test("well-formed keys the database does not know: sixty database calls, then 429 without one", async () => {
  const net = DB();
  const roster = makeRoster(net);
  const ip = "198.51.100.90";
  const guess = (i) => `rk_pub_${String(i).padStart(32, "0")}`;
  for (let i = 0; i < 60; i++) {
    const r = await call(roster, req("/meetings", { key: guess(i), ip }));
    assert.deepEqual([r.status, r.body.error.code], [401, "invalid_key"], `guess ${i + 1}`);
  }
  assert.equal(net.rpc("roster_api_auth").length, 60);
  const over = await call(roster, req("/meetings", { key: guess(1000), ip }));
  assert.deepEqual([over.status, over.body.error.code], [429, "rate_limited"]);
  assert.ok(Number(over.headers.get("retry-after")) >= 1);
  assert.equal(net.rpc("roster_api_auth").length, 60, "the 61st guess cost nothing");
  assert.equal(net.calls.length, 60);
  assert.equal(over.headers.get("access-control-allow-origin"), null, "(no Origin on this request)");
});

test("a key the database vouched for is not held back by somebody else's guessing from the same address", async () => {
  const known = (a) => a.p_key_hash === GOOD_HASH;
  let GOOD_HASH = "";
  GOOD_HASH = await sha256Hex(PUB);
  const net = DB({ roster_api_auth: (a) => (known(a) ? { ok: true, kind: "public" } : { error: "invalid_key" }) });
  const roster = makeRoster(net);
  const ip = "198.51.100.91";
  assert.equal((await call(roster, req("/meetings", { key: PUB, ip: "198.51.100.200" }))).status, 200, "seen working, from elsewhere");
  for (let i = 0; i < 60; i++) await call(roster, req("/meetings", { key: `rk_pub_${String(i).padStart(32, "1")}`, ip }));
  assert.equal((await call(roster, req("/meetings", { key: `rk_pub_${"9".repeat(32)}`, ip }))).status, 429, "an unproven key is held back");
  const calls = net.calls.length;
  const ok = await call(roster, req("/meetings", { key: PUB, ip }));
  assert.equal(ok.status, 200, "the proven key still works from the same address");
  assert.ok(net.calls.length > calls, "and it reached the database");
});

test("what does not count as a bad key: a good one, a wrong kind, a refused origin, a rate limit, a participant token", async () => {
  const net = DB({ roster_api_auth: (a, c) => {
    const key = c.headers.authorization;
    void key;
    return { error: "origin_not_allowed" };
  } });
  const roster = makeRoster(net);
  const ip = "198.51.100.92";
  for (let i = 0; i < 70; i++) {
    const r = await call(roster, req("/meetings", { key: PUB, origin: "https://evil.example", ip }));
    assert.equal(r.status, 403, `attempt ${i + 1}: an unknown origin is not a bad key`);
  }
  for (let i = 0; i < 70; i++) assert.equal((await call(roster, req("/participants?phone=0501234567", { key: PUB, ip }))).status, 403, "wrong kind is not a bad key");
  for (let i = 0; i < 70; i++) assert.equal((await call(roster, req("/meetings", { key: SEC, origin: "https://x.example", ip }))).status, 403, "secret in a browser is not a bad key");
  const rl = DB({ roster_api_auth: () => ({ error: "rate_limited", retry_after: 5 }) });
  const r2 = makeRoster(rl);
  for (let i = 0; i < 70; i++) assert.equal((await call(r2, req("/meetings", { key: PUB, ip }))).status, 429);
  assert.equal(rl.rpc("roster_api_auth").length, 70, "a rate_limited answer from the database is passed on every time, none of them became a brake");
});

test("the brake window rolls over, and preflight is never counted", async () => {
  let t = 1_800_000_000_000;
  const net = DB();
  const roster = makeRoster(net, { now: () => t });
  const ip = "198.51.100.93";
  for (let i = 0; i < 60; i++) await call(roster, req("/meetings", { key: "junk", ip }));
  assert.equal((await call(roster, req("/meetings", { key: "junk", ip }))).status, 429);
  for (let i = 0; i < 100; i++) await roster.handle(req("/meetings", { method: "OPTIONS", ip }), makeEnv(), ctxSpy());
  t += 601_000;
  assert.equal((await call(roster, req("/meetings", { key: "junk", ip }))).status, 401, "a new window");
});

/* --- the characters no text may carry ---------------------------------------------------- */

const HIDDEN = [
  ["RLO", "\u202e"], ["LRE", "\u202a"], ["RLE", "\u202b"], ["PDF", "\u202c"], ["LRO", "\u202d"],
  ["LRI", "\u2066"], ["RLI", "\u2067"], ["FSI", "\u2068"], ["PDI", "\u2069"],
  ["ZWSP", "\u200b"], ["ZWNJ", "\u200c"], ["ZWJ", "\u200d"], ["BOM", "\ufeff"],
];

test("text.js: hasHidden finds exactly the bidi controls and the zero-width characters", () => {
  for (const [name, ch] of HIDDEN) {
    assert.equal(hasHidden(`a${ch}b`), true, name);
    assert.equal(stripHidden(`a${ch}b${ch}`), "ab", name);
  }
  for (const fine of ["דנה כהן", "Dana", "a b", "דנה\u200f", "a\u200eb", "\u00a0", "קפה-תה", "\u0301e"]) assert.equal(hasHidden(fine), false, JSON.stringify(fine));
});

test("every text field refuses a bidi control or a zero-width character, at the start, in the middle and at the end", async () => {
  const net = fakeNet({ rpc: {
    roster_api_auth: () => ({ ok: true, kind: "secret" }),
    roster_api_signup: () => ({ status: "ok", registered: false, participant_token: TOKEN, participant_id: UUID_A, created: true }),
    roster_api_record_payment: () => ({ status: "ok", payment_id: UUID_B, duplicate: false }),
    roster_api_participant: () => ({ participant: {} }),
    roster_events_claim: () => [], roster_events_done: () => null,
  } });
  const roster = makeRoster(net, { limiter: { hit: async () => ({ ok: true }), peek: async () => ({ ok: true }) } });
  const signup = (json) => call(roster, req("/signup", { method: "POST", key: SEC, json }));
  const pay = (json, headers) => call(roster, req("/payments", { method: "POST", key: SEC, json: { participant_id: UUID_A, meeting_id: UUID_B, amount: 5, external_ref: "r1", ...json }, headers }));
  for (const [name, ch] of HIDDEN) {
    for (const at of [(s) => ch + s, (s) => s.slice(0, 2) + ch + s.slice(2), (s) => s + ch]) {
      for (const [field, base] of [["first_name", "דנה כהן"], ["last_name", "לוי לוי"], ["phone", "0501234567"], ["email", "dana@example.com"], ["gender", "female"]]) {
        const r = await signup({ first_name: "דנה", phone: "0501234567", [field]: at(base) });
        assert.deepEqual([r.status, r.body.error?.field], [422, field], `${name} in ${field}: ${JSON.stringify(at(base))}`);
      }
      for (const [field, base] of [["note", "a note"], ["method", "bit"], ["external_ref", "ref-1"]]) {
        const r = await pay({ [field]: at(base) });
        assert.deepEqual([r.status, r.body.error?.field], [422, field], `${name} in ${field}`);
      }
    }
  }
  /* (an HTTP header cannot carry these characters at all: the platform's own Headers refuses them) and the phone in a query string */
  const q = await call(roster, req(`/participants?phone=${encodeURIComponent("0501234567\u202e")}`, { key: SEC }));
  assert.deepEqual([q.status, q.body.error.field], [422, "phone"]);
  const hiddenOnly = await signup({ first_name: "\ufeff", phone: "0501234567" });
  assert.equal(hiddenOnly.status, 422, "a name that is only a BOM is not an empty name that slips through");
  assert.equal(net.rpc("roster_api_signup").length, 0, "none of them reached the database");
});

test("the ordinary text of the product still passes: Hebrew, a left-to-right mark, accents", async () => {
  const net = fakeNet({ rpc: {
    roster_api_auth: () => ({ ok: true, kind: "public" }),
    roster_api_signup: () => ({ status: "ok", registered: false, participant_token: TOKEN }),
    roster_events_claim: () => [], roster_events_done: () => null,
  } });
  const roster = makeRoster(net);
  const r = await call(roster, req("/signup", { method: "POST", key: PUB, json: { first_name: "דנה\u200f", last_name: "ז'בוטינסקי", phone: "050-123-4567", email: "dana@example.com" } }));
  assert.equal(r.status, 200);
});

test("a hidden character is also refused inside a webhook URL, at send time", async () => {
  const { validateWebhookUrl } = await import("../src/roster/urls.js");
  for (const [name, ch] of HIDDEN) assert.equal(validateWebhookUrl(`https://exa${ch}mple.com/h`).ok, false, name);
});
