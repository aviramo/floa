/* The live relay's room registry (worker/LIVE.md, "The room registry" and "Rooms: a room per open thing, and one home room per app").

   Which apps have rooms, what a room id looks like, and the permission question
   the server asks Supabase with the person's own token. The server decides all of
   it: nothing the browser sends chooses the schema or the function.

   Two kinds of room per app:
     /live/<app>/<uuid>   a thing's room: txt, cur, rs and chg; permission <rpc>({<arg>: <uuid>})
     /live/<app>/home     the app's home room (when `home` is set): chg only; permission <home.rpc>() with no argument
   `notify: true`: the database may name the app in POST /live/notify.

   A new app adds one line, with SECURITY DEFINER boolean functions in its own
   schema that `authenticated` may execute. Plain data, loadable by plain node.

   Room kinds (worker/LIVE.md, "Roster"): an app may list `rooms: [{ id, rpc, arg, strip? }]` instead of one `id`/`rpc`/`arg`; the first kind
   whose `id` matches decides the question, and `strip` is cut off the id before it is sent. Host binding: `env: "test"` only on
   api-test.floa.co.il, `env: "prod"` only on any other host (schemaOfHost, worker/src/roster/db.js), both on localhost; no `env`: anywhere. */
import { TEST_API_HOST } from "../roster/db.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^m-[a-z][a-z0-9-]{1,39}$/;   /* the members' room: "m-" + the business slug */
/* roster's two kinds: the admin room asks the existing can(b uuid); the members' room asks live_member(s text) (apps/roster/relay-notify.sql) */
const ROSTER_ROOMS = [
  { id: UUID, rpc: "can", arg: "b" },
  { id: SLUG, rpc: "live_member", arg: "s", strip: "m-" },
];

export const ROOMS = {
  /* the same question the private presence channel asks today (apps/biodanza/realtime.sql): biodanza.can_view(<vivencia uuid>);
     the home room: biodanza.is_allowed() */
  biodanza: {
    schema: "biodanza", rpc: "can_view", arg: "v",
    id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    home: { rpc: "is_allowed" },
    notify: true,
  },
  /* roster's own clients (the admin page and the members' area); external sites stay on Supabase (rt_ping), untouched */
  roster: { schema: "roster", env: "prod", notify: true, rooms: ROSTER_ROOMS },
  "roster-test": { schema: "roster-test", env: "test", notify: true, rooms: ROSTER_ROOMS },
};

function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

/* the registry line of an app, or null */
export function appOf(app) { return typeof app === "string" && own(ROOMS, app) ? ROOMS[app] : null; }

/* the kind of room an id is: { rpc, arg, strip } of the first kind whose id matches, or null */
export function kindOf(spec, id) {
  if (!spec || typeof id !== "string" || !id || id === "home") return null;
  if (spec.rooms) { for (const k of spec.rooms) if (k.id.test(id)) return k; return null; }
  return spec.id && spec.id.test(id) ? { id: spec.id, rpc: spec.rpc, arg: spec.arg } : null;
}

/* a valid room id of that app: a thing id matching one of its kinds, or "home" when the app has a home room */
export function roomIdOk(spec, id) { return !!spec && typeof id === "string" && !!id && (id === "home" ? !!spec.home : !!kindOf(spec, id)); }

/* may this host serve this app? env "test": only api-test.floa.co.il; env "prod": any other host; localhost (wrangler dev): both; no env: any */
export function hostOk(spec, hostname) {
  if (!spec) return false;
  if (!spec.env) return true;
  const h = String(hostname || "").toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  return (h === TEST_API_HOST) === (spec.env === "test");
}

/* "/live/<app>/<id>" -> { app, id, spec, home } when the app is registered and the id is valid; otherwise null */
export function roomOf(pathname) {
  const parts = String(pathname || "").split("/");
  if (parts.length !== 4 || parts[0] !== "" || parts[1] !== "live") return null;
  const app = parts[2], id = parts[3];
  const spec = appOf(app);
  if (!roomIdOk(spec, id)) return null;
  return { app, id, spec, home: id === "home" };
}
