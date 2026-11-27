/* The media store's errors (worker/MEDIA.md, "Errors").

   Every error is {"ok":false,"error":{"code","message"[,"field"]}} with a fixed message per code, so no database or R2 text can
   ever reach a caller. A step throws a MediaError; the door (src/media.js) turns it into the answer. */

export const STATUS = {
  bad_request: 400,
  validation: 400,
  checksum_mismatch: 400,
  unauthorized: 401,
  forbidden: 403,
  origin: 403,
  not_found: 404,
  method_not_allowed: 405,
  name_taken: 409,
  in_trash: 409,
  name_recently_used: 409,
  folder_moving: 409,
  conflict: 409,
  length_required: 411,
  too_large: 413,
  quota_exceeded: 413,
  unsupported_type: 415,
  rate_limited: 429,
  upstream: 502,
  not_configured: 503,
};

const MESSAGES = {
  bad_request: "The request is malformed.",
  validation: "A value is outside its rule.",
  checksum_mismatch: "The bytes do not match the declared sha256. Nothing was stored.",
  unauthorized: "Sign in again: the token is missing or was refused.",
  forbidden: "Not allowed.",
  origin: "This origin is not allowed.",
  not_found: "Not found.",
  method_not_allowed: "Method not allowed on this path.",
  name_taken: "The name is already used by different bytes.",
  in_trash: "The same bytes are in this folder's trash: restore them instead.",
  name_recently_used: "The name was purged less than 48 hours ago with different bytes.",
  folder_moving: "The folder is being moved between buckets. Try again later.",
  conflict: "The stored copies disagree. Run _check.",
  length_required: "Content-Length is required.",
  too_large: "The file is over the size limit.",
  quota_exceeded: "The business is over its quota.",
  unsupported_type: "This type of file is not accepted here.",
  rate_limited: "Too many writes to the same name. Try again in a second.",
  upstream: "A service behind the store failed. Try again.",
  not_configured: "The store is not configured on this Worker.",
};

export class MediaError extends Error {
  constructor(code, field) {
    super(code);
    this.code = STATUS[code] ? code : "upstream";
    if (field) this.field = field;
  }
}

export function errorBody(code, field) {
  const error = { code, message: MESSAGES[code] || MESSAGES.upstream };
  if (field && code === "validation") error.field = field;
  return { ok: false, error };
}

/* the code a batch item failed with: a MediaError keeps its own, anything else is "upstream" (and gets one log line, no content) */
export function codeOf(err, where) {
  if (err instanceof MediaError) return err.code;
  console.error("media upstream", where, err && err.name);
  return "upstream";
}
