/* ==========================================================================
   Roster API CORS. The routes do their own, the global allow-list in index.js
   is not involved.

   Three outcomes for a response:

     "echo"  Access-Control-Allow-Origin is the request origin. Only used once
             the database has authenticated the key AND accepted the origin
             against that key's allowed_origins, so the header means "this key
             allows this origin".
     "star"  `*`. For answers given before any key was consulted (preflight,
             malformed key, bad body, unknown route, the Worker's own IP brake).
             These carry no data, and a browser developer needs to be able to
             READ "invalid_key" instead of staring at a CORS failure.
     "none"  no header at all, so a browser cannot read the answer. For
             `origin_not_allowed` and `secret_key_in_browser`: the point of
             those errors is that a page must not get anything out of them.

   The origin is only ever echoed in its canonical form, so nothing the caller
   typed can end up in a header.
   ========================================================================== */

export const ALLOW_METHODS = "GET, POST, DELETE, OPTIONS";
export const ALLOW_HEADERS = "authorization, content-type, x-roster-key, idempotency-key";

/* An origin exactly as a browser writes it (scheme://host[:port], nothing
   else), or null. `Origin: null` (sandboxed frames) and anything odd is null. */
export function canonicalOrigin(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin === value ? value : null;
  } catch {
    return null;
  }
}

/* Preflight carries no key, so it cannot know the key's origins. It says `*`
   and the real request is checked again. */
export function preflightHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": ALLOW_METHODS,
    "access-control-allow-headers": ALLOW_HEADERS,
    "access-control-max-age": "86400",
  };
}

/* `origin` is the raw Origin header (or null when there was none). A request
   without an Origin is not a browser cross-origin call and gets no CORS
   headers at all. */
export function corsHeaders(origin, mode) {
  if (origin === null || origin === undefined || mode === "none") return {};
  const headers = { vary: "Origin", "access-control-expose-headers": "Retry-After" };
  headers["access-control-allow-origin"] = mode === "echo" ? canonicalOrigin(origin) || "*" : "*";
  return headers;
}

/* How an error from the database's auth step is to be shown. */
export function corsModeForError(code) {
  return code === "origin_not_allowed" || code === "secret_key_in_browser" ? "none" : "star";
}
