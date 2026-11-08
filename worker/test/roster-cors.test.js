import test from "node:test";
import assert from "node:assert/strict";
import { ALLOW_HEADERS, ALLOW_METHODS, canonicalOrigin, corsHeaders, corsModeForError, preflightHeaders } from "../src/roster/cors.js";
import { PUB, SEC, UUID_A, call, ctxSpy, fakeNet, makeEnv, makeRoster, req } from "./roster-helpers.js";

const SITE = "https://studio.example";
const acao = (r) => r.headers.get("access-control-allow-origin");

test("canonicalOrigin: only an origin exactly as a browser writes it", () => {
  for (const ok of ["https://studio.example", "http://localhost:3000", "https://a.b.example:8443", "http://127.0.0.1:5173", "https://xn--9dbq2a.example"]) {
    assert.equal(canonicalOrigin(ok), ok, ok);
  }
  for (const bad of [
    "null", "", " ", "*", "https://studio.example/", "https://studio.example/path", "https://studio.example?x=1", "https://studio.example#h",
    "https://studio.example:443", "https://user@studio.example", "ftp://studio.example", "javascript:alert(1)", "data:text/html,x", "studio.example",
    "https://studio.example, https://evil.example", "https://STUDIO.example", `https://${"a".repeat(300)}.example`, null, undefined, 5, {},
  ]) {
    assert.equal(canonicalOrigin(bad), null, String(bad));
  }
});

test("corsHeaders: echo, star, none, and nothing for a request with no Origin", () => {
  assert.equal(corsHeaders(SITE, "echo")["access-control-allow-origin"], SITE);
  assert.equal(corsHeaders(SITE, "star")["access-control-allow-origin"], "*");
  assert.deepEqual(corsHeaders(SITE, "none"), {});
  assert.deepEqual(corsHeaders(null, "echo"), {});
  assert.deepEqual(corsHeaders(null, "star"), {});
  assert.deepEqual(corsHeaders(undefined, "echo"), {});
  /* an Origin that is not canonical is never echoed back, whatever the mode */
  for (const odd of ["null", "https://studio.example/x", "javascript:1", "https://a.example, https://b.example"]) {
    assert.equal(corsHeaders(odd, "echo")["access-control-allow-origin"], "*", odd);
  }
  assert.ok(corsHeaders(SITE, "echo")["access-control-expose-headers"].includes("Retry-After"));
  assert.equal(corsHeaders(SITE, "echo").vary, "Origin");
  assert.ok(!("access-control-allow-credentials" in corsHeaders(SITE, "echo")), "credentials are never allowed");
});

test("which errors a browser may read", () => {
  assert.equal(corsModeForError("origin_not_allowed"), "none");
  assert.equal(corsModeForError("secret_key_in_browser"), "none");
  for (const code of ["invalid_key", "wrong_key_kind", "rate_limited", "validation", "server_error", "not_found"]) assert.equal(corsModeForError(code), "star", code);
});

test("preflight headers: * origin, the three methods, exactly the four headers the API reads", () => {
  const h = preflightHeaders();
  assert.equal(h["access-control-allow-origin"], "*");
  assert.equal(h["access-control-allow-methods"], ALLOW_METHODS);
  assert.equal(h["access-control-allow-headers"], "authorization, content-type, x-roster-key, idempotency-key");
  assert.equal(ALLOW_HEADERS, h["access-control-allow-headers"]);
  assert.ok(Number(h["access-control-max-age"]) > 0);
  for (const m of ["GET", "POST", "DELETE", "OPTIONS"]) assert.ok(ALLOW_METHODS.includes(m));
  assert.ok(!ALLOW_METHODS.includes("PUT") && !ALLOW_METHODS.includes("PATCH"));
});

/* --- through the handler ------------------------------------------------------------------ */

test("OPTIONS is answered for every path, with no key, no body, no database", async () => {
  const net = fakeNet();
  const roster = makeRoster(net);
  for (const path of ["/meetings", "/signup", "/payments/click", "/payments", "/participants", `/participants/${UUID_A}`, `/participants/${UUID_A}/registrations`, "/does/not/exist", ""]) {
    const res = await roster.handle(req(path, { method: "OPTIONS", origin: SITE, headers: { "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type, x-evil" } }), makeEnv(), ctxSpy());
    assert.equal(res.status, 204, path);
    assert.equal(await res.text(), "");
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
    assert.equal(res.headers.get("access-control-allow-methods"), ALLOW_METHODS);
    assert.equal(res.headers.get("access-control-allow-headers"), ALLOW_HEADERS, "the requested headers are not reflected");
  }
  assert.equal(net.calls.length, 0);
});

test("an allowed origin: the reply echoes it, and so does an error that comes after the key was accepted", async () => {
  const net = fakeNet({ rpc: {
    roster_api_auth: () => ({ ok: true, kind: "public" }),
    roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }),
    roster_api_signup: () => ({ error: "closed" }),
    roster_events_claim: () => [], roster_events_done: () => null,
  } });
  const roster = makeRoster(net);

  const ok = await call(roster, req("/meetings", { key: PUB, origin: SITE }));
  assert.equal(ok.status, 200);
  assert.equal(acao(ok), SITE);
  assert.equal(ok.headers.get("vary"), "Origin");
  assert.ok(ok.headers.get("access-control-expose-headers").includes("Retry-After"));

  const closed = await call(roster, req("/signup", { method: "POST", key: PUB, origin: SITE, json: { first_name: "דנה" } }));
  assert.deepEqual([closed.status, closed.body.error.code], [409, "closed"]);
  assert.equal(acao(closed), SITE, "a browser can read why the signup was refused");
  assert.equal(net.rpc("roster_api_auth")[0].json.p_origin, SITE, "the database decided on this very origin");
});

test("a disallowed origin: the database says no, and the reply carries no CORS headers at all", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ error: "origin_not_allowed" }) } });
  const roster = makeRoster(net);
  const r = await call(roster, req("/meetings", { key: PUB, origin: "https://evil.example" }));
  assert.deepEqual([r.status, r.body.error.code], [403, "origin_not_allowed"]);
  assert.equal(acao(r), null);
  assert.equal(r.headers.get("access-control-expose-headers"), null);
  assert.equal(net.rpc("roster_api_meetings").length, 0);
  assert.equal(net.rpc("roster_api_auth")[0].json.p_origin, "https://evil.example");
});

test("no Origin header (a server calling): no CORS headers, and the database is told there was none", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }) } });
  const roster = makeRoster(net);
  const r = await call(roster, req("/meetings", { key: PUB }));
  assert.equal(r.status, 200);
  assert.equal(acao(r), null);
  assert.equal(r.headers.get("vary"), null);
  assert.equal(net.rpc("roster_api_auth")[0].json.p_origin, null);
});

test("a secret key with an Origin: refused before the database, unreadable by a browser; without one, fine", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "secret" }), roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }) } });
  const roster = makeRoster(net);
  const browser = await call(roster, req("/meetings", { key: SEC, origin: SITE }));
  assert.deepEqual([browser.status, browser.body.error.code], [403, "secret_key_in_browser"]);
  assert.equal(acao(browser), null);
  assert.equal(net.calls.length, 0);

  const server = await call(roster, req("/meetings", { key: SEC }));
  assert.equal(server.status, 200);
  assert.equal(acao(server), null);
});

test("answers given before any key is consulted say `*`, so a developer can read the error instead of a CORS failure", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_signup: () => ({ status: "ok", registered: false, participant_token: "pt_" + "x".repeat(32) }), roster_events_claim: () => [], roster_events_done: () => null } });
  const roster = makeRoster(net);
  const cases = [
    ["no key", req("/meetings", { origin: SITE }), 401],
    ["bad key", req("/meetings", { key: "junk", origin: SITE }), 401],
    ["unknown route", req("/nope", { key: PUB, origin: SITE }), 404],
    ["wrong kind", req("/payments", { method: "POST", key: PUB, origin: SITE, json: {} }), 403],
    ["bad body", req("/signup", { method: "POST", key: PUB, origin: SITE, body: "{bad" }), 400],
    ["bad field", req("/signup", { method: "POST", key: PUB, origin: SITE, json: { age: "x" } }), 422],
    ["wrong method", req("/signup", { key: PUB, origin: SITE }), 405],
  ];
  for (const [label, request, status] of cases) {
    const r = await call(roster, request);
    assert.equal(r.status, status, label);
    assert.equal(acao(r), "*", label);
  }
  /* the Worker's own IP brake answers before the key is consulted too */
  let last;
  for (let i = 0; i < 7; i++) last = await call(roster, req("/signup", { method: "POST", key: PUB, origin: SITE, json: { first_name: "x" } }));
  assert.equal(last.status, 429);
  assert.equal(acao(last), "*");
  assert.ok(last.headers.get("access-control-expose-headers").includes("Retry-After"), "a browser can read how long to wait");
});

test("a rate limit decided by the database before the origin was judged is readable too", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ error: "rate_limited", retry_after: 20 }) } });
  const r = await call(makeRoster(net), req("/meetings", { key: PUB, origin: SITE }));
  assert.deepEqual([r.status, acao(r), r.headers.get("retry-after")], [429, "*", "20"]);
});

test("an Origin that is not canonical is never reflected, even for a key whose origins the database accepted", async () => {
  const net = fakeNet({ rpc: { roster_api_auth: () => ({ ok: true, kind: "public" }), roster_api_meetings: () => ({ business: { name: "x" }, meetings: [] }) } });
  const roster = makeRoster(net);
  for (const origin of ["null", "https://studio.example/with/path", "javascript:alert(1)"]) {
    const r = await call(roster, req("/meetings", { key: PUB, origin }));
    assert.equal(r.status, 200, origin);
    assert.equal(acao(r), "*", origin);
  }
});
