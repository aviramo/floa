/* Who may do what (worker/MEDIA.md, "Staff and owner: the exact check").

   This Worker holds no key that could verify a token, so it asks the database with the caller's own token, through the
   tenancy's existing function my_businesses(): PostgREST verifies the JWT (signature and expiry), and the answer is the
   businesses the caller may open. Staff = a row whose slug is the business. Owner = that row's is_super.

   One project for every host: the token is always checked against SUPABASE_URL, whichever site the caller came from.
   The answer is kept in this isolate's memory under a SHA-256 of the token and the slug (never the token itself): a yes for
   5 minutes or until the token's exp, a no for 1 minute, a Supabase failure not at all. The pattern of mayListen in
   src/biodanza-audio.js. */

import { MediaError } from "./http.js";

const TENANCY_SCHEMA = "roster";   /* the schema of the tenancy itself (roster.my_businesses), not a tenant */
const YES_MS = 5 * 60 * 1000;
const NO_MS = 60 * 1000;
const MAX_MEM = 1000;
const mem = new Map();   /* sha256(token \n slug) -> { admin, owner, until } */

export function _clearAuthCache() { mem.clear(); }

export function bearer(request) {
  const a = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(a);
  return m ? m[1] : "";
}

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

/* the token's payload, unverified: exp only bounds the cache, sub is read only after Supabase accepted the token */
function claims(token) {
  try {
    const p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const c = JSON.parse(atob(p + "===".slice((p.length + 3) % 4)));
    return {
      exp: typeof c.exp === "number" ? c.exp * 1000 : 0,
      sub: typeof c.sub === "string" && /^[A-Za-z0-9-]{1,64}$/.test(c.sub) ? c.sub : "",
    };
  } catch { return { exp: 0, sub: "" }; }
}

/* { admin, owner, sub } for this token on business b. Throws unauthorized (a token Supabase refuses, or one already past
   its exp) or upstream (Supabase did not answer usably). */
export async function staffOf(env, token, b, doFetch) {
  if (!token) throw new MediaError("unauthorized");
  const now = Date.now();
  const { exp, sub } = claims(token);
  if (exp && exp <= now) throw new MediaError("unauthorized");
  const key = await sha256hex(token + "\n" + b);
  const hit = mem.get(key);
  if (hit && hit.until > now) return { admin: hit.admin, owner: hit.owner, sub };
  if (hit) mem.delete(key);

  let res;
  try {
    res = await doFetch(`${env.SUPABASE_URL}/rest/v1/rpc/my_businesses`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
        "accept-profile": TENANCY_SCHEMA,
        "content-profile": TENANCY_SCHEMA,
        "content-type": "application/json",
      },
      body: "{}",
    });
  } catch (err) {
    console.error("media upstream supabase", err && err.name);
    throw new MediaError("upstream");
  }
  if (res.status === 401) throw new MediaError("unauthorized");
  let rows;
  if (res.status === 403) rows = [];   /* a role that may not run the function: a real "no" */
  else if (!res.ok) {
    console.error("media upstream supabase", res.status);
    throw new MediaError("upstream");
  } else {
    rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) {
      console.error("media upstream supabase", "shape");
      throw new MediaError("upstream");
    }
  }
  const row = rows.find((r) => r && r.slug === b);
  const admin = !!row, owner = !!row && row.is_super === true;

  let until = now + (admin ? YES_MS : NO_MS);
  if (exp) until = Math.min(until, exp);
  if (until > now) {
    if (mem.size >= MAX_MEM) for (const [k, v] of mem) if (v.until <= now || mem.size >= MAX_MEM) mem.delete(k);
    mem.set(key, { admin, owner, until });
  }
  return { admin, owner, sub };
}
