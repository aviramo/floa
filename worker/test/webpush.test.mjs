/* Web Push for AUM's admin: the request that leaves the Worker has to carry a
   VAPID signature a push service would accept, and nothing but the database
   (the shared token) may ask for one. The signature is checked here the way the
   push service checks it: against the public key, over the JWT's first two parts. */
globalThis.caches = { default: { match: async () => null, put: async () => {} } };
const worker = (await import("../src/index.js")).default;
const assert = (await import("node:assert/strict")).default;

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const d = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d;
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (t) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const env = { AUM_PUSH_TOKEN: "secret-token", VAPID_PUBLIC: b64u(raw), VAPID_PRIVATE: d };
const FCM = "https://fcm.googleapis.com/fcm/send/abc";
const DEAD = "https://updates.push.services.mozilla.com/wpush/v2/dead";

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), headers: init.headers });
  return new Response(null, { status: String(url) === DEAD ? 410 : 201 });
};
const post = (body) => worker.fetch(new Request("https://worker.test/aum-push", { method: "POST", body: JSON.stringify(body) }), env, {});

/* the wrong token, and no token, send nothing */
assert.equal((await post({ token: "nope", endpoints: [FCM] })).status, 403);
assert.equal((await post({ endpoints: [FCM] })).status, 403);
assert.equal(calls.length, 0);

/* a missing token in the Worker's own config is not a way in either */
const noToken = await worker.fetch(new Request("https://worker.test/aum-push", { method: "POST", body: JSON.stringify({ endpoints: [FCM] }) }), { ...env, AUM_PUSH_TOKEN: "" }, {});
assert.equal(noToken.status, 403);

/* a good call: one push per subscription, a dead one is reported, a foreign host is never fetched */
const res = await post({ token: "secret-token", endpoints: [FCM, DEAD, "https://evil.example.com/x", "http://fcm.googleapis.com/insecure"] });
assert.equal(res.status, 200);
const out = await res.json();
assert.deepEqual(out, { ok: true, sent: 1, gone: [DEAD] });
assert.deepEqual(calls.map((c) => c.url), [FCM, DEAD]);

/* the signature verifies, and says who it is for */
const auth = calls[0].headers.authorization;
const m = auth.match(/^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/);
assert.ok(m, "Authorization has the vapid scheme");
assert.equal(m[4], env.VAPID_PUBLIC);
const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2])));
assert.equal(claims.aud, "https://fcm.googleapis.com");
assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 12 * 3600 + 5);
assert.match(claims.sub, /^mailto:/);
const verifyKey = await crypto.subtle.importKey("raw", unb64u(env.VAPID_PUBLIC), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, unb64u(m[3]), new TextEncoder().encode(`${m[1]}.${m[2]}`)), "ES256 signature verifies");
assert.equal(calls[0].headers.ttl, "86400");

console.log("webpush: ok");
