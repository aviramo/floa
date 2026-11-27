/* Presigned GET URLs for the private bucket (worker/MEDIA.md, "Private reads: presigned R2 URLs").

   AWS Signature Version 4, query-string form, written with crypto.subtle and no dependency. The credentials are an R2 API
   token with Object Read only, on the private bucket only (R2_READ_KEY_ID, R2_READ_SECRET).

   The window is stable: X-Amz-Date is the start of the current 6-hour window and X-Amz-Expires is 12 hours, so a URL is
   valid 6 to 12 hours from the moment it is listed, and the same URL comes back for 6 hours (the browser cache keeps
   working). The signing key is derived once per isolate per day; each URL then costs one SHA-256 and one HMAC. */

const enc = new TextEncoder();
export const WINDOW_MS = 6 * 60 * 60 * 1000;
export const EXPIRES_S = 12 * 60 * 60;
const REGION = "auto", SERVICE = "s3";
const DEFAULT_BUCKET = "floa-media";

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
async function hmac(keyBytes, msg) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}

/* RFC 3986: everything but the unreserved characters, which is what SigV4 asks for */
const uriEncode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

const keys = new Map();   /* keyId \n date \n region \n service -> { secret, key: CryptoKey } */
export function _clearSigningKeys() { keys.clear(); }

async function signingKey(secret, keyId, date, region, service) {
  const id = [keyId, date, region, service].join("\n");
  const hit = keys.get(id);
  if (hit && hit.secret === secret) return hit.key;
  let k = await hmac(enc.encode("AWS4" + secret), date);
  k = await hmac(k, region);
  k = await hmac(k, service);
  k = await hmac(k, "aws4_request");
  const key = await crypto.subtle.importKey("raw", k, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  if (keys.size > 8) keys.clear();
  keys.set(id, { secret, key });
  return key;
}

const amz = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");   /* 20130524T000000Z */

/* the SigV4 core: a presigned GET for `path` (already made of unreserved characters and "/") on `host` */
export async function presignGet({ host, path, keyId, secret, amzDate, expires, region = REGION, service = SERVICE }) {
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const params = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${keyId}/${scope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", "host"],
  ];
  const query = params.map(([k, v]) => `${uriEncode(k)}=${uriEncode(v)}`).join("&");   /* already in code-point order */
  const uri = path.split("/").map(uriEncode).join("/");
  const canonical = `GET\n${uri}\n${query}\nhost:${host}\n\nhost\nUNSIGNED-PAYLOAD`;
  const hash = hex(await crypto.subtle.digest("SHA-256", enc.encode(canonical)));
  const toSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash}`;
  const key = await signingKey(secret, keyId, date, region, service);
  const sig = hex(await crypto.subtle.sign("HMAC", key, enc.encode(toSign)));
  return `https://${host}${uri}?${query}&X-Amz-Signature=${sig}`;
}

/* the current window: its start (X-Amz-Date) and the end of the URLs' life (the list answer's `expires`) */
export function windowOf(now = Date.now()) {
  const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  return { amzDate: amz(new Date(start)), expires: new Date(start + EXPIRES_S * 1000).toISOString().replace(/\.\d{3}Z$/, "Z") };
}

/* a presigned GET for one object of the private bucket, by its full R2 key (<b>/<key>) */
export async function presignPrivate(env, fullKey, now = Date.now()) {
  const { amzDate } = windowOf(now);
  return presignGet({
    host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${env.MEDIA_BUCKET_NAME || DEFAULT_BUCKET}/${fullKey}`,
    keyId: env.R2_READ_KEY_ID,
    secret: env.R2_READ_SECRET,
    amzDate,
    expires: EXPIRES_S,
  });
}
