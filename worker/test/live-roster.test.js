/* The live relay for roster (worker/LIVE.md, "Roster", tests 11 and 12): the host binding of roster and roster-test, and the two room kinds. */
import test from "node:test";
import assert from "node:assert/strict";
import { handleLive } from "../src/live/routes.js";
import { verify } from "../src/live/room.js";
import { ROOMS, hostOk, roomOf } from "../src/live/rooms.js";

const BIZ = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "s3cret-s3cret-s3cret-s3cret-s3cret";
const ENV = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_ANON_KEY: "anon" };
const upgrade = (host, path) => handleLive(new Request(`https://${host}${path}`, { headers: { upgrade: "websocket", origin: "https://roster.floa.co.il" } }),
  { ...ENV, LIVE: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } });
const notify = (host, a) => handleLive(new Request(`https://${host}/live/notify`, { method: "POST", headers: { "x-live-secret": SECRET },
  body: JSON.stringify({ a, t: "payments", o: "i", kc: "id", r: { [BIZ]: [[BIZ]], "m-harpatka": "*" } }) }),
  { ...ENV, LIVE_NOTIFY_SECRET: SECRET, LIVE: { idFromName: (n) => n, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } });

test("11. host binding: roster-test only on api-test, roster never there; a notify naming roster-test on the production host is 400", async () => {
  assert.equal((await upgrade("api.floa.co.il", "/live/roster-test/" + BIZ)).status, 404);
  assert.equal((await upgrade("api-test.floa.co.il", "/live/roster/" + BIZ)).status, 404);
  assert.notEqual((await upgrade("api.floa.co.il", "/live/roster/" + BIZ)).status, 404);
  assert.notEqual((await upgrade("api-test.floa.co.il", "/live/roster-test/m-harpatka")).status, 404);
  assert.equal((await notify("api.floa.co.il", "roster-test")).status, 400);
  assert.equal((await notify("api-test.floa.co.il", "roster")).status, 400);
  assert.equal((await notify("api.floa.co.il", "roster")).status, 204);
  assert.equal((await notify("api-test.floa.co.il", "roster-test")).status, 204);
  for (const h of ["localhost", "127.0.0.1"]) { assert.ok(hostOk(ROOMS.roster, h)); assert.ok(hostOk(ROOMS["roster-test"], h)); }
  assert.ok(hostOk(ROOMS.biodanza, "api-test.floa.co.il") && hostOk(ROOMS.biodanza, "api.floa.co.il"), "an app without env: anywhere");
});

test("12. m-<slug> asks live_member {s}, <uuid> asks can {b}; m-Bad_Slug and home are not roster rooms", async () => {
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/auth/v1/user")) return { status: 200, ok: true, json: async () => ({ id: "u-1", user_metadata: { full_name: "Dana Cohen" } }) };
    asked.push({ fn: String(url).split("/rpc/")[1], body: JSON.parse(init.body), profile: init.headers["accept-profile"] });
    return { status: 200, ok: true, json: async () => true };
  };
  try {
    assert.ok(!(await verify(ENV, ROOMS.roster, "m-harpatka", "tok")).code);
    assert.ok(!(await verify(ENV, ROOMS["roster-test"], BIZ, "tok")).code);
  } finally { globalThis.fetch = real; }
  assert.deepEqual(asked, [{ fn: "live_member", body: { s: "harpatka" }, profile: "roster" }, { fn: "can", body: { b: BIZ }, profile: "roster-test" }]);
  assert.equal(roomOf("/live/roster/m-Bad_Slug"), null);
  assert.equal(roomOf("/live/roster/home"), null);
  assert.equal(roomOf("/live/roster/m-x"), null, "a slug of one letter");
  assert.equal((await upgrade("api.floa.co.il", "/live/roster/m-Bad_Slug")).status, 404);
  assert.ok(roomOf("/live/biodanza/" + BIZ) && roomOf("/live/biodanza/home"), "biodanza unchanged");
});
