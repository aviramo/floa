/* ==========================================================================
   Web Push, with nothing but WebCrypto.

   A browser that subscribed to push gives the site an `endpoint`, a URL on its
   vendor's push service (Google, Mozilla, Apple). Sending a push is a POST to
   that URL, signed with VAPID: a short ES256 JWT that says who is asking
   (RFC 8292). This file builds that request and sends it.

   There is no payload. A push with no body needs no encryption (RFC 8291 is
   only about bodies), so the whole thing is one signature and one fetch, and
   the service worker that wakes up decides what to show.

   VAPID_PUBLIC   the P-256 public key, uncompressed point, base64url
   VAPID_PRIVATE  the matching private scalar `d`, base64url. A SECRET.
   Both come from scripts/vapid.mjs, and the browser is subscribed against the
   public one, so the pair must never change after people have subscribed.
   ========================================================================== */

/* The push services. The endpoint is chosen by whoever calls us, so it is held
   to these hosts: this Worker must never become a way to POST at anything. */
const PUSH_HOSTS = [
  /(^|\.)fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

export function pushEndpointOk(endpoint) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)),
};
const utf8 = (text) => new TextEncoder().encode(text);

/* the Authorization header for one push service, valid for 12 hours */
export async function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const point = b64u.dec(publicKey);
  if (point.length !== 65 || point[0] !== 4) throw new Error("VAPID_PUBLIC must be an uncompressed P-256 point");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: b64u.enc(point.slice(1, 33)), y: b64u.enc(point.slice(33, 65)), d: privateKey },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = b64u.enc(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u.enc(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64u.enc(signature)}, k=${publicKey}`;
}

/* one push. Returns "sent", "gone" (the subscription is dead: 404 or 410) or "failed" */
export async function sendPush(endpoint, vapid) {
  if (!pushEndpointOk(endpoint)) return "failed";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: await vapidAuthorization(endpoint, vapid), ttl: "86400", urgency: "high" },
    });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
