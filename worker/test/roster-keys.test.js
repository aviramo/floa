import test from "node:test";
import assert from "node:assert/strict";
import { extractKey, hashIp, hashKey, hashToken, keyKind, sha256Hex, TOKEN_RE, UUID_RE } from "../src/roster/keys.js";
import { PUB, SEC, TOKEN, UUID_A } from "./roster-helpers.js";

test("sha256Hex matches the published vectors, lower case hex", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.match(await sha256Hex("rk_pub_x"), /^[0-9a-f]{64}$/);
});

test("hashKey and hashToken are the plain SHA-256 of the string, so the database can recompute them", async () => {
  assert.equal(await hashKey(PUB), await sha256Hex(PUB));
  assert.equal(await hashToken(TOKEN), await sha256Hex(TOKEN));
  assert.notEqual(await hashKey(PUB), PUB);
  assert.notEqual(await hashKey(PUB), await hashKey(SEC));
});

test("keyKind: the two formats, nothing else", () => {
  assert.equal(keyKind(PUB), "public");
  assert.equal(keyKind(SEC), "secret");

  const bad = [
    "", "rk_pub_", `rk_pub_${"a".repeat(31)}`, `rk_pub_${"a".repeat(33)}`,
    `rk_sec_${"a".repeat(39)}`, `rk_sec_${"a".repeat(41)}`,
    `rk_pub_${"a".repeat(40)}`, /* a secret-length body under the public prefix */
    `rk_sec_${"a".repeat(32)}`,
    `RK_PUB_${"a".repeat(32)}`, `rk_pub_${"a".repeat(31)}-`, `rk_pub_${"a".repeat(31)}_`,
    ` ${PUB}`, `${PUB} `, `${PUB}\n`, `${PUB}\u0000`,
    `rk_pub_${"א".repeat(32)}`, `rk_pub_${"a".repeat(31)}\u00e9`,
    "pt_" + "a".repeat(32), "Bearer " + PUB,
  ];
  for (const k of bad) assert.equal(keyKind(k), null, JSON.stringify(k));
  for (const k of [null, undefined, 5, {}, [], true]) assert.equal(keyKind(k), null);
});

test("extractKey: Authorization Bearer, X-Roster-Key, and which wins", () => {
  const h = (o) => new Headers(o);
  assert.equal(extractKey(h({ authorization: `Bearer ${PUB}` })), PUB);
  assert.equal(extractKey(h({ authorization: `bearer   ${PUB}  ` })), PUB);
  assert.equal(extractKey(h({ "x-roster-key": SEC })), SEC);
  assert.equal(extractKey(h({ "x-roster-key": `  ${SEC} ` })), SEC);
  assert.equal(extractKey(h({ authorization: `Bearer ${PUB}`, "x-roster-key": SEC })), PUB);
  /* an Authorization that is not a Bearer does not hide the dedicated header */
  assert.equal(extractKey(h({ authorization: "Basic dXNlcjpwYXNz", "x-roster-key": SEC })), SEC);
  assert.equal(extractKey(h({})), null);
  assert.equal(extractKey(h({ authorization: "Basic dXNlcjpwYXNz" })), null);
  assert.equal(extractKey(h({ authorization: "Bearer" })), null);
  assert.equal(extractKey(h({ authorization: "Bearer a b" })), null);
});

test("extractKey: an absurdly long value is returned as unusable, never kept", () => {
  const long = "x".repeat(500);
  assert.equal(extractKey(new Headers({ authorization: `Bearer ${long}` })), "");
  assert.equal(keyKind(extractKey(new Headers({ "x-roster-key": long }))), null);
});

test("participant token and uuid shapes", () => {
  assert.ok(TOKEN_RE.test(TOKEN));
  for (const t of ["", "pt_", `pt_${"a".repeat(31)}`, `pt_${"a".repeat(33)}`, `PT_${"a".repeat(32)}`, `pt_${"a".repeat(31)}!`, `${TOKEN}\n`]) {
    assert.ok(!TOKEN_RE.test(t), JSON.stringify(t));
  }
  assert.ok(UUID_RE.test(UUID_A));
  assert.ok(!UUID_RE.test(`${UUID_A}0`));
  assert.ok(!UUID_RE.test("not-a-uuid"));
  assert.ok(!UUID_RE.test(`${UUID_A}\n`));
});

test("hashIp: stable, salted, per address, hex", async () => {
  const a = await hashIp("203.0.113.7", "");
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.equal(a, await hashIp("203.0.113.7", ""));
  assert.notEqual(a, await hashIp("203.0.113.8", ""));
  assert.notEqual(a, await hashIp("203.0.113.7", "pepper"));
  assert.equal(await hashIp(null), await hashIp(undefined));
  assert.ok(!a.includes("203"), "the address is not readable in the hash");
});
