import test from "node:test";
import assert from "node:assert/strict";
import { handleRosterAuth, isRosterAuthPath } from "../src/roster-auth.js";

const env = { ROSTER_GOOGLE_CLIENT_IDS: "cid.apps.googleusercontent.com", ROSTER_AUTH_ORIGINS: "https://site.example", SUPABASE_URL: "https://sb.example", SUPABASE_SERVICE_KEY: "svc" };
const tok = "x".repeat(200);
const req = (o = {}) => new Request("https://api.example/roster-auth/google", { method: "POST", headers: { origin: "https://site.example", "content-type": "application/json", ...o.headers }, body: JSON.stringify({ id_token: tok, ...o.body }) });
const net = (info, calls = []) => async (url, init) => {
  calls.push(String(url));
  if (String(url).includes("tokeninfo")) return new Response(JSON.stringify(info), { status: info ? 200 : 400 });
  if (String(url).includes("generate_link")) return new Response(JSON.stringify({ id: "u1", hashed_token: "h" }));
  if (String(url).includes("/verify")) return new Response(JSON.stringify({ access_token: "a", refresh_token: "r" }));
  return new Response("{}");
};
const good = { aud: env.ROSTER_GOOGLE_CLIENT_IDS, email: "A@x.com", email_verified: "true", exp: String(Math.floor(Date.now() / 1000) + 600), name: "דנה" };

test("path and off switch", async () => {
  assert.equal(isRosterAuthPath("/roster-auth/google"), true);
  assert.equal((await handleRosterAuth(req(), {}, net(good))).status, 404);
});
test("a verified token of the business's app becomes a session", async () => {
  const calls = []; const r = await handleRosterAuth(req(), env, net(good, calls));
  assert.equal(r.status, 200); assert.equal((await r.json()).access_token, "a");
  assert.equal(r.headers.get("access-control-allow-origin"), "https://site.example");
  assert.ok(calls.some((u) => u.includes("generate_link")));
});
test("wrong audience, unverified email, wrong origin, bad token: refused, no session made", async () => {
  for (const info of [{ ...good, aud: "other" }, { ...good, email_verified: "false" }, { ...good, exp: "1" }]) {
    const calls = []; const r = await handleRosterAuth(req(), env, net(info, calls));
    assert.equal(r.status, 401); assert.ok(!calls.some((u) => u.includes("generate_link")));
  }
  assert.equal((await handleRosterAuth(req({ headers: { origin: "https://evil.example" } }), env, net(good))).status, 403);
  assert.equal((await handleRosterAuth(req({ body: { id_token: "short" } }), env, net(good))).status, 400);
  assert.equal((await handleRosterAuth(req(), env, net(null))).status, 401);
});
