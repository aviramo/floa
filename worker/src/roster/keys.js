/* ==========================================================================
   Roster API keys and tokens: format, extraction, hashing.

   A key is checked for SHAPE here, before anything reaches the database, so
   garbage costs nothing. Whether a well-formed key is real is the database's
   answer alone, and every "no" looks the same (`invalid_key`).

   The database never sees a plaintext key or participant token: it gets the
   plain SHA-256, lowercase hex. The key is never echoed, never logged.
   ========================================================================== */

export const PUBLIC_KEY_RE = /^rk_pub_[A-Za-z0-9]{32}$/;
export const SECRET_KEY_RE = /^rk_sec_[A-Za-z0-9]{40}$/;
export const TOKEN_RE = /^pt_[A-Za-z0-9]{32}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* "public" | "secret" | null. Decided by the shape alone: a key that has this
   shape and hashes to a row is exactly the string that was generated, so the
   prefix cannot lie about the kind. */
export function keyKind(key) {
  if (typeof key !== "string") return null;
  if (PUBLIC_KEY_RE.test(key)) return "public";
  if (SECRET_KEY_RE.test(key)) return "secret";
  return null;
}

/* The key as presented: `Authorization: Bearer <key>`, or `X-Roster-Key`.
   When both are there and Authorization is a Bearer, it wins. Returns the raw
   string (maybe malformed, keyKind decides) or null when there is nothing. */
export function extractKey(headers) {
  const auth = headers.get("authorization");
  if (auth) {
    const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(auth);
    if (m) return m[1].length <= 128 ? m[1] : "";
  }
  const alt = headers.get("x-roster-key");
  if (alt) {
    const v = alt.trim();
    return v.length <= 128 ? v : "";
  }
  return null;
}

const enc = new TextEncoder();

export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashKey = (key) => sha256Hex(key);
export const hashToken = (token) => sha256Hex(token);

/* The address a limit is counted against. An IPv4 address is itself. An IPv6
   address is its /64: the first four groups, written out in full, because one
   subscriber owns the whole /64 and can use 2^64 addresses of it, so counting
   the full address would give an attacker a fresh bucket per request. An
   IPv4-mapped address (::ffff:1.2.3.4, or ::ffff:102:304) is the IPv4 address it
   carries. Anything that is neither (a test, a proxy gone wrong) is used as it is. */
const HEX_GROUP = /^[0-9a-f]{1,4}$/;

function v6Groups(text) {
  let s = text;
  const dotted = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (dotted) {
    const o = dotted.slice(1).map(Number);
    if (o.some((n) => n > 255)) return null;
    s = `${s.slice(0, dotted.index)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (halves.length === 2 ? fill < 1 : head.length !== 8) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8 || !groups.every((g) => HEX_GROUP.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

export function ipBucket(ip) {
  let s = String(ip ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  s = s.split("%")[0];                        // a zone id (fe80::1%eth0) is not part of the address
  if (!s.includes(":")) return s;
  const g = v6Groups(s);
  if (!g) return s;
  if (g.slice(0, 5).every((x) => x === "0000") && g[5] === "ffff") {
    const hi = Number.parseInt(g[6], 16), lo = Number.parseInt(g[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return `v6:${g.slice(0, 4).join(":")}`;
}

/* The caller's address, bucketed (above) and hashed for the per-IP counters, here
   and in the database. The salt is env ROSTER_IP_SALT, which the Worker REQUIRES:
   a bare hash of an IPv4 address is reversible by trying all four billion of them,
   the salt is what makes the stored value mean nothing outside this deployment. */
export const hashIp = (ip, salt = "") => sha256Hex(`roster-ip:${salt}:${ipBucket(ip)}`);
