/* ==========================================================================
   Makes the key pair that Web Push is signed with (VAPID).

     node scripts/vapid.mjs

   Prints two lines. The private one is a SECRET: it goes to the Worker and
   nowhere else, never into a file in this repo.

     npx wrangler secret put VAPID_PRIVATE      (paste the private line)
     npx wrangler secret put VAPID_PUBLIC       (paste the public line)

   and the public one also goes to the database, where the admin page reads it:

     insert into public.aum_settings (key, value) values ('vapid_public', '...')
       on conflict (key) do update set value = excluded.value;

   Make the pair ONCE. Browsers subscribe against the public key, so a new pair
   later silently cuts off everyone who already turned notifications on.
   ========================================================================== */
const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
console.log("VAPID_PUBLIC=" + b64u(raw));
console.log("VAPID_PRIVATE=" + jwk.d);
