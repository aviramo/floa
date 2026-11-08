/* The webhook signature, verified the way a customer verifies it: with plain
   Node `crypto` and nothing from this repository's source for the check itself.
   This is the same recipe as the Node sample on the public docs page; if the two
   ever disagree, one of them is wrong.

   The sample, as published:

     const crypto = require("crypto");

     function verify(rawBody, header, secret, toleranceSeconds = 300) {
       const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
       const t = Number(parts.t);
       if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false;
       const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
       const given = Buffer.from(parts.v1 || "", "hex");
       const want = Buffer.from(expected, "hex");
       return given.length === want.length && crypto.timingSafeEqual(given, want);
     }
*/
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { deliverWebhook, webhookBody } from "../src/roster/webhook.js";
import { normalizeWork } from "../src/roster/work.js";
import { fakeNet } from "./roster-helpers.js";

/* the customer's side, nothing imported from src/ */
function verify(rawBody, header, secret, toleranceSeconds = 300, nowMs = Date.now()) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(nowMs / 1000 - t) > toleranceSeconds) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const given = Buffer.from(parts.v1 || "", "hex");
  const want = Buffer.from(expected, "hex");
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

const SECRET = "whsec_" + "x".repeat(32);

async function deliver(body, { secret = SECRET, now = Date.now } = {}) {
  const net = fakeNet({ webhook: () => ({ status: 200 }) });
  const result = await deliverWebhook({ url: "https://hooks.example.com/in", secret, type: "payment.recorded", eventId: "7", body }, { fetch: net.fetch, now });
  assert.equal(result.status, "ok");
  const [c] = net.webhooks();
  return { header: c.headers["x-roster-signature"], raw: c.raw };
}

const work = normalizeWork({
  event: { id: 7, type: "payment.recorded", created_at: "2027-02-01T10:00:00Z",
    payload: { participant: { id: "p", first_name: "שרה", last_name: "כהן" }, payment: { id: "pay", kind: "payment", amount: 80, method: "bit" } } },
  business: { slug: "studio", name: "סטודיו", settings: {} },
});

test("a customer verifying with plain node crypto accepts what the Worker sends", async () => {
  const { header, raw } = await deliver(webhookBody(work));
  assert.equal(verify(raw, header, SECRET), true);
});

test("the signature covers the exact raw bytes: re-serialised or edited JSON fails", async () => {
  const { header, raw } = await deliver(webhookBody(work));
  assert.equal(verify(JSON.stringify(JSON.parse(raw), null, 2), header, SECRET), false);
  assert.equal(verify(raw.replace("80", "81"), header, SECRET), false);
  assert.equal(verify(raw + " ", header, SECRET), false);
});

test("a wrong secret fails", async () => {
  const { header, raw } = await deliver(webhookBody(work));
  assert.equal(verify(raw, header, SECRET + "x"), false);
  assert.equal(verify(raw, header, ""), false);
});

test("non-ASCII bodies (Hebrew names) verify byte for byte", async () => {
  const { header, raw } = await deliver(webhookBody(work));
  assert.ok(raw.includes("שרה"), "the body is sent as UTF-8 text, not escaped");
  assert.equal(verify(raw, header, SECRET), true);
});

test("the timestamp is part of what is signed: replaying an old delivery is caught by the tolerance", async () => {
  const hourAgo = Date.now() - 3600_000;
  const { header, raw } = await deliver(webhookBody(work), { now: () => hourAgo });
  assert.equal(verify(raw, header, SECRET, 300), false, "too old");
  assert.equal(verify(raw, header, SECRET, 7200), true, "a wider tolerance accepts it");

  /* changing t does not help the replayer, the MAC covers it */
  const forged = header.replace(/t=\d+/, `t=${Math.floor(Date.now() / 1000)}`);
  assert.equal(verify(raw, forged, SECRET, 300), false);
});

test("malformed headers are rejected, never thrown on", async () => {
  const { raw } = await deliver(webhookBody(work));
  for (const header of ["", "t=abc,v1=00", "v1=00", "t=1", "garbage", `t=${Math.floor(Date.now() / 1000)},v1=zz`, `t=${Math.floor(Date.now() / 1000)},v1=`]) {
    assert.equal(verify(raw, header, SECRET), false, header);
  }
});

test("the header has exactly the documented shape", async () => {
  const { header } = await deliver("{}");
  assert.match(header, /^t=\d{10},v1=[0-9a-f]{64}$/);
});
