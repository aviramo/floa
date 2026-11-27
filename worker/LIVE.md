# The live relay: `/live/<app>/<id>`

Built 2026-11-26 (phases 1 to 3 in code; not deployed, no SQL run). The kit side is `ui/docs/realtime.md`, section "ממסר חי בשרת שלנו"; this file is the server. Where the build differs from the text, the section "As built" at the end says so.

## Why

Peer to peer traffic of a co-edited field (live typing `txt`, carets `cur`, and presence) used to ride Supabase Realtime broadcast on a private channel. Live typing alone is up to ~16 messages a second per typist, each carrying the whole field value. Supabase is on the FREE plan: 100 messages/s and 100 KB/s for the WHOLE project, and going over disconnects every socket of the project, roster and every other app included. So that traffic moves here, to the Worker that already serves `api.floa.co.il`.

Supabase stays the source of truth for data: every DB write is unchanged, and `postgres_changes` stays until phase 3 switches an app over (`SUPABASE.relayData`). The relay stores nothing.

## Economy is a requirement (owner, 2026-11-26: "relatively economical")

These are hard rules, on both sides:

- **`txt` carries a change, not the field:** one span `{position, delete count, inserted text, base seq}`. The full value only at the start of a typing run, in answer to a resync request (`rs`) after a gap or a seq mismatch, and so to anybody who just joined.
- **`txt` at most every 130 ms per field** (the kit's `LT`, inside the owner's 120 to 150 ms), with a trailing send. It must still feel live: median end to end at most 200 ms.
- **`cur` only on a real caret move**, at most 4/s, **no periodic keep-alive repeats.** The server knows who is connected (`join` / `leave`); a caret stays until it moves, leaves the field, or its person leaves.
- **A socket only while it is needed:** the person is signed in and a co-edited field (a vivencia or an exercise editor) is on screen, or (phase 2) a live source of an app in `SUPABASE.relayData`. One socket per tab. Closed 30 s after the tab is hidden, and 10 s after the last co-edited field is gone.
- **Hibernation**, so an idle room costs nothing. **No server-side storage**, not even an alarm.
- **Auth checked on connect and on token refresh only**, never per message. The `can_view` answer is cached on the socket.
- **Fan-out serialized once:** the stamped message is `JSON.stringify`-ed once and the same string goes to every other socket. Short keys everywhere.

## Not touched

- `/roster/v1/` is FROZEN (CLAUDE.md). The relay is a separate path, a separate module, and changes nothing that the roster API answers, including its CORS and its tests.
- `/lead`, `/transcribe`, `/parse-cv`, `/biodanza/audio/*`, `/roster-auth/*`, `/roster-wa/*`: unchanged.

## Shape

- **Route:** `GET wss://api.floa.co.il/live/<app>/<id>` (HTTP `Upgrade: websocket`). `floa-lead.floa-il.workers.dev/live/...` answers the same, as for every other route. `api-test.floa.co.il` (the `floa-lead-test` Worker, `wrangler.test.toml`) behaves exactly the same, with its own binding and its own objects.
- **One Durable Object per room**, class `LiveRoom`, named `idFromName("<app>:<id>")`. The Worker only checks the request and forwards it to the room's stub; everything after the upgrade happens in the room.
- **One socket per tab.** Today a page has at most one co-editing room open, so the tab's one socket goes straight to that room; switching rooms closes it and opens the next. If two rooms are ever needed at once, they are multiplexed on the same socket (a room key per message, and a Worker or hub object that routes); that is a later change, not a second socket.
- **WebSocket Hibernation API:** `state.acceptWebSocket(server, [tag])`, the handlers `webSocketMessage`, `webSocketClose`, `webSocketError`, and per socket state in `ws.serializeAttachment()` / `deserializeAttachment()` (it survives hibernation; keep it under 2 KB). Never `server.accept()`: that bills duration for as long as the socket is open.
- **Heartbeat without waking the room:** `state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"))`. The client sends the text `ping` every 25 s.
- **Files:**
  - `worker/src/live/routes.js`: `isLivePath(pathname)`, `handleLive(request, env)` (origin, path, upgrade, forward to the stub). Loadable by plain node.
  - `worker/src/live/rooms.js`: the room registry (below). Pure data and a function, plain node.
  - `worker/src/live/room.js`: `class LiveRoom` as a **plain class** (`constructor(state, env)`), not `extends DurableObject`, so it does not import `cloudflare:workers` and stays testable in node (the same reason `worker.js` exists). The Hibernation API works on a plain class.
  - `worker/src/worker.js`: `export { LiveRoom } from "./live/room.js";` beside `ReadSong`.
  - `worker/src/index.js`: one line in `fetch`, before the POST-only gate and next to the audio line: `if (isLivePath(path)) return handleLive(request, env);`.
  - `worker/test/live-*.test.js`: node tests with a fake `state` and fake sockets (see "Tests").

## The room registry (`rooms.js`)

Which apps have rooms, what an id looks like, and the permission question. The server decides; nothing from the browser chooses the schema or the function.

```js
export const ROOMS = {
  biodanza: { schema: "biodanza", rpc: "can_view", arg: "v", id: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i },
};
```

- The kit maps a presence topic `<schema>:<table>:<id>` to the room `<schema>/<id>` (for biodanza: `biodanza:vivencia:<uuid>` becomes `/live/biodanza/<uuid>`). The registry's question is the same one the private channel policy asks today (`apps/biodanza/realtime.sql`: `biodanza.can_view(<uuid>)`).
- A new app adds one line here, with a SECURITY DEFINER boolean function that `authenticated` may execute (biodanza: `grant execute on all functions in schema biodanza to authenticated`, `schema.sql`). No SQL is needed for biodanza.
- An app or id that does not match: HTTP 404 before the upgrade.

## Connecting

### In the Worker (`handleLive`), before any upgrade

1. Path `/live/<app>/<id>` with exactly two parts, `app` in `ROOMS`, `id` matching its pattern; otherwise `404`.
2. `Upgrade: websocket` header; otherwise `426`.
3. **Origin check** (a WebSocket is not CORS, the Origin header is the only guard a browser gives): allowed are `https://floa.co.il`, `https://<label>.floa.co.il` (`^https://([a-z0-9-]+\.)?floa\.co\.il$`) and a dev origin (`isDevOrigin`, `src/dev-origin.js`: `http://` on `localhost` or `127.0.0.1`, or on a private LAN address `192.168.x.x` / `10.x.x.x`, any port). Missing or other origin: `403`. Not the `ALLOWED_ORIGINS` of `/lead` (that list is per business and does not cover every app sub-domain).
4. `env.LIVE` missing: `502` (config), with one log line.
5. Forward: `env.LIVE.get(env.LIVE.idFromName(app + ":" + id)).fetch(request)`.

### In the room, on the upgrade

- Room full (50 sockets, `state.getWebSockets().length`): accept and close at once with `4013`.
- Otherwise `new WebSocketPair()`, `state.acceptWebSocket(server)`, attachment `{ authed: false, at: now }`, answer `101` with the client end.
- **The first message must be `auth`, within 10 s.** Anything else before it is dropped. No `auth` in time: close `4001`. Until it succeeds the socket receives nothing from the room. (A timer does not survive hibernation and there is no alarm, so the deadline is checked lazily: on that socket's next message, and whenever the room handles any message, by a pass over unauthed sockets older than 10 s.)

### Auth (`{"t":"auth","k":"<access token>","s":"<tab id>"}`)

`s` is the tab's random id (not a person); the room keeps it on the socket so that an `rs` can be routed to that tab only.

The token is the Supabase access token from `/auth.js` (`FLOA_AUTH.token()`). The Worker holds no signing key and does not pretend to verify one, so both checks go to Supabase itself, like `/transcribe` and `/biodanza/audio`:

1. `GET ${SUPABASE_URL}/auth/v1/user` with `apikey: SUPABASE_ANON_KEY`, `authorization: Bearer <token>`. Not 200: close `4001`. The answer gives `id` and `user_metadata` (`full_name` or `name`, the same fields `/auth.js` `name()` reads).
2. `POST ${SUPABASE_URL}/rest/v1/rpc/<rpc>` with the user's own token, `apikey`, `Accept-Profile` and `Content-Profile: <schema>`, body `{ "<arg>": "<id>" }`. Anything but `true`: close `4003`.
3. Stamp, server side: `u` = the verified user id, `n` = first word of the name, `g` = first letter of the second word (exactly `firstName()` in `ui/live.js`). **Never an email, and never a `u`, `n` or `g` sent by the client.**
4. Attachment: `{ authed: true, u, n, g, s, ok: true, exp, bucket, drops }`. `ok` is the cached `can_view` answer. `exp` is read from the JWT payload (unverified decoding is fine here: the token was just verified by Supabase, `exp` is only a timer). The token itself is not kept.
5. Send `{"t":"ok","me":{u,n,g},"peers":[{u,n,g},...]}` (everyone else authed in the room, one entry per person). If this is the person's first socket in the room, send `{"t":"join",u,n,g}` to every other socket.

A second `auth` on an authed socket is a **token refresh**: verify both again with the new token; success replaces `ok` and `exp` silently, failure closes (`4001` / `4003`). The kit sends it whenever `/auth.js` refreshes the token (about once an hour).

### Re-checks: minimal

- **Network checks only on connect and on token refresh.** Never per message, no alarm, no timer. A share taken away cuts the person off at their next token refresh (at most about an hour) or their next reconnect; the database writes are guarded by RLS regardless, so what they could still see is only live words in that window.
- **Expiry:** a local comparison, no network: a message from a socket whose `exp` passed by more than 60 s closes it `4001`.
- The token is never stored, never logged.

## Messages

Text frames, JSON, short keys. Anything that does not parse, has an unknown `t`, or fails validation is dropped and counted.

### Client to server

| `t` | fields | rule |
|---|---|---|
| `auth` | `k`, `s` (tab id, string ≤ 32) | see above |
| `txt` (a change) | `q` (int ≥ 1), `bq` (int, the `q` it is built on), `i` (item: string or number, ≤ 64 chars), `f` (field: string ≤ 64, not null), `p` (int 0..20000, where), `d` (int 0..20000, characters deleted there), `x` (string ≤ 20000, inserted), `r` (int or null, the base rev), `a`, `b` (int 0..20000, the caret) | relayed |
| `txt` (full) | the same without `bq`, `p`, `d`, `x`, and with `v` (string ≤ 20000 chars) | relayed |
| `cur` | `i`, `f` (string ≤ 64, or null = left the field), `a`, `b` | relayed |
| `rs` | `to` (a tab id), `i`, `f` | sent only to the socket(s) whose `s` is `to`: "send me your full value of this field" |
| `ping` (plain text) | | auto `pong`, the room is not woken |

The tab id is not repeated in every `txt`: the server adds the sender's `s` from the socket. A typical keystroke batch is about 60 to 90 bytes on the wire.

### Server to client

| `t` | fields |
|---|---|
| `ok` | `me {u,n,g}`, `peers [{u,n,g}]` |
| `join` | `u`, `n`, `g` (the person's first socket in the room) |
| `leave` | `u` (the person's last socket left) |
| `txt` | `u`, `n`, `g` (stamped: id, first name, family letter; `g` because `f` is the field) + `s` (the sender's tab, from the socket) + the fields as sent |
| `cur` | `u`, `n`, `g` (stamped) + `i`, `f`, `a`, `b` |
| `rs` | `u`, `s` (who asks) + `i`, `f` |

(The stamped name keys are `u`, `n`, `g` on the wire, since `f` is the field; the kit maps them to `uid`, `first`, `fam` as today.)

- **Fan-out:** a relayed message goes to every OTHER authed socket in the room (`state.getWebSockets()`), **never back to the sending socket**. The same person's other tabs do get it (the kit uses that: their words, no caret of mine).
- **Order:** a room is single threaded, so messages from one socket go out in the order they came. The client still drops an older or repeated `q` per tab.
- Validation rebuilds the outgoing object from the allowed fields only; nothing else the client sent is forwarded.
- **Leaving:** `webSocketClose` / `webSocketError`: if it was the person's last socket, `leave` to the rest. A dead socket (send throws) is closed and treated the same.

## Limits per socket

- **Frame:** at most 64 KB (UTF-8). Bigger: close `4009`. `v` over 20000 characters: dropped (the client never sends it; the field's value then comes only through the save).
- **Rate:** a token bucket per socket in the attachment, 12 messages/s, burst 24, for `txt` + `cur` + `rs` together (`ping` is not counted: it never reaches the room). The kit sends `txt` at most every 130 ms per field and `cur` at most every 250 ms and only on a move, so an honest client stays well under it. Over the bucket: dropped and counted. More than 200 drops within 10 s: close `4008`.
- **Per room:** 50 sockets; per person in a room: 10 sockets (the 11th: close `4013`).
- **Counting, not logging:** a drop increments a counter; at most one log line per socket close with `app`, the close code and the counts (`drops`, `rate`, `size`, `bad`). **Never content, never `v`, never a token, never an email.** The room id is not logged either.

## Close codes

| code | meaning | the kit |
|---|---|---|
| 1000 | normal | |
| 1011 | server error | backoff and retry |
| 1012 | restart (deploy) | backoff and retry |
| 4001 | no, bad or expired token | retry only with a new token |
| 4003 | not allowed in this room | room goes `none` until reopened |
| 4004 | unknown app or id (after upgrade; before it, HTTP 404) | `none` |
| 4008 | abuse (rate) | backoff and retry |
| 4009 | frame too big | backoff and retry |
| 4013 | room full / too many sockets of one person | backoff and retry |

## No persistence

The class is SQLite-backed only because the free plan allows no other kind. It writes nothing to storage at all (no alarm either), so it uses none of the rows-written quota. No text, caret, presence or user row is ever stored. A room with no sockets hibernates and is evicted; nothing about it remains.

## `wrangler.toml` additions

```toml
# The live relay (worker/LIVE.md): one Durable Object per room. SQLite-backed because the free plan allows only that kind.
[[durable_objects.bindings]]
name = "LIVE"
class_name = "LiveRoom"

[[migrations]]
tag = "live-v1"
new_sqlite_classes = ["LiveRoom"]
```

The same two blocks go into `wrangler.test.toml` (its own `floa-lead-test` Worker, its own objects). `wrangler.test.toml` today has no `SUPABASE_ANON_KEY` in `[vars]`; the relay needs it there (public, like in `wrangler.toml`). Phase 1 needs no new secret: the relay uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` only, never the service key. Phase 2 adds one, `LIVE_NOTIFY_SECRET` (the production Worker for biodanza and roster; the test Worker too once roster-test moves, with its own value; see "Roster" and "Pending the owner").

## Local development

```bash
cd worker
npx wrangler dev        # http://localhost:8787, the Durable Object runs locally (no deploy, nothing remote changes)
```

- The relay is `ws://localhost:8787/live/<app>/<id>`. Auth and `can_view` still go to the real Supabase project (read only, with the person's own token).
- `npm run dev` serves the site on `http://localhost` (apps on ports 8081 to 8091). The page reads the relay address from `/supabase.js` (`SUPABASE.relay`); on localhost only, `localStorage["floa.live.relay"] = "ws://localhost:8787/live"` overrides it, so working on the relay itself needs no file change. Without the override a local page talks to the deployed relay (its origin is a dev origin, allowed).
- Two tabs (or two browser profiles, two accounts) on the same vivencia are the test.

## Tests (`worker/test/live-*.test.js`, plain node, part of `npm test`)

One targeted check each (the owner wants few tests):

1. Origin not allowed: 403; unknown app / bad id: 404; no upgrade: 426.
2. A message before `auth` is not relayed; a bad token closes 4001; `can_view` false closes 4003 (fetch mocked).
3. `txt` reaches the other socket, not the sender, with `u`/`n`/`g` from the verified user even when the client sent other ones.
4. Over the bucket: dropped; 200 drops: 4008. A 65 KB frame: 4009.
5. The last socket of a person closing sends `leave`.
6. `rs` reaches only the socket of the tab it names; a `txt` change is forwarded with the sender's `s` added from the socket.

## Cost on Cloudflare's free plan

From Cloudflare's public pricing page for Durable Objects (read 2026-11-26; numbers can change, check before relying on them):

- Free plan: only SQLite-backed Durable Objects. 100,000 requests/day, 13,000 GB-s duration/day, 5 M rows read and 100,000 rows written per day, 5 GB stored. Over a limit, further operations of that kind fail (until 00:00 UTC); nothing else is disconnected.
- WebSocket: opening a socket is one request. **Incoming messages count 20:1** (20 messages = 1 request). **Outgoing messages are free**, so fan-out costs nothing. Protocol pings and `setWebSocketAutoResponse` replies are not charged.
- Duration: with the Hibernation API an idle room is not billed for duration, only the time handlers run.

### A typical evening: 3 facilitators, 10 minutes of co-editing (estimate)

Rates from the economy rules: `txt` at most 1 per 130 ms per typist (7.7/s), the caret riding on it while typing; `cur` only on a move, at most 4/s; one full value per typing run and per newcomer.

| | worst case: all 3 type the whole 10 min | realistic: each types 40% of the time |
|---|---|---|
| `txt` in | 3 × 7.7 × 600 ≈ 13,850 | 3 × 0.4 × 600 × 7.7 ≈ 5,550 |
| `cur` in (moves while not typing) | ~1/s each: 1,800 | ~0.5/s each over the other 60%: 550 |
| `rs` + full values | ~50 | ~50 |
| **incoming messages** | **≈ 15,700** | **≈ 6,150** |
| requests at 20:1 | ≈ 785 | ≈ 310 |
| connections (3 sockets, ~3 reconnects each after a hidden tab) | ≈ 12 | ≈ 12 |
| **requests for the evening** | **≈ 800 (0.8% of 100,000/day)** | **≈ 320 (0.3%)** |
| outgoing frames (to the 2 others, free) | ≈ 31,000 | ≈ 12,000 |
| bytes in (~80 B per change) | ≈ 1.3 MB | ≈ 0.5 MB |
| duration (~1 ms per handled message × 128 MB) | ≈ 2 GB-s of 13,000/day | ≈ 1 GB-s |
| rows written | 0 | 0 |
| Supabase | ~30 REST calls (2 per connect, 1 per token refresh), **0 Realtime messages** | same |

So the free daily request quota holds about **125 worst-case evenings, or about 300 realistic ones, per day.** Duration and storage are not the limit.

For comparison, the same evening on today's Supabase broadcast (full value up to every 60 ms): up to 3 × 16 = 48 messages/s sent, each delivered to 2 others, so on the order of 100 to 150 messages/s if Supabase counts deliveries (unverified how it counts), and with a 1 to 2 KB value, 50 to 100 KB/s. That is at or over the project's 100 msgs/s and 100 KB/s, which disconnects every app's sockets: the reason for this relay.
- **Unverified:** whether the account is on the Workers Free or Paid plan, and whether the Durable Object request quota is separate from the Worker's own 100,000 requests/day (the upgrade request itself is also a Worker request). Check in the Cloudflare dashboard.
- The key difference from before: going over the limit fails only live typing (the field falls back to the save and the echo), and never disconnects the database sockets of the other apps.

## Data changes through the relay (phase 2)

Built 2026-11-26, not deployed (owner, 2026-11-26: "בסוף אני רוצה שזה יעבוד משם לא בסופה בייס": in the end ALL realtime runs through our server, and Supabase is the database only). Phase 1 (everything above) moved typing, carets and presence. Phase 2 moves the "a row changed" signal that Supabase `postgres_changes` carries today. Phase 3 ("Leaving Supabase Realtime", below) switches Supabase Realtime off for an app. The kit side is `ui/docs/realtime.md`, "שינויים בנתונים דרך הממסר"; the SQL is `apps/biodanza/relay-notify.sql` (a draft, not run).

**The relay still carries no data.** A `chg` is a sign: table, key column, keys, `rev`, operation. The client that holds that key reloads the row itself, over REST, with its own token and through RLS. Nobody can read a row through the relay that RLS would not give them, and nothing in the relay is content.

### The `chg` message

Client to server (after a write of the kit succeeded):

| field | rule |
|---|---|
| `t` | `"chg"` |
| `tb` | table, `^[a-z_]{1,63}$` |
| `o` | `"i"`, `"u"` or `"d"` |
| `kc` | the key column the keys are in, `^[a-z_]{1,63}$`, or absent with `c: "*"` |
| `c` | `"*"` (reload the whole source of that table in this room), or 1 to 50 entries `[k]` / `[k, rev]`: `k` a string of at most 64 chars, `rev` an integer |

Server to client: the same fields, rebuilt from the allowed ones only. A client `chg` is stamped like `txt` (`u`, `n`, `g`, `s` from the socket) and goes to every OTHER authed socket of the room. A `chg` from `/live/notify` has no `u` and no `s`, and goes to every authed socket of the room. It counts in the socket's token bucket like `txt`. Nothing in it is trusted beyond "reload this": a forged `chg` can only make clients reload rows through their own RLS, bounded by the bucket.

`reauth` (server to client, `{"t":"reauth"}`): "send `auth` again now". The kit answers at once with the current token. A socket that has not sent a fresh `auth` within 10 s of a `reauth` is closed `4001` (the same lazy deadline check as the first `auth`). The re-check runs both Supabase calls again, so a person who lost access is closed `4003` within seconds.

### Rooms: a room per open thing, and one home room per app

- **A thing's room** (phase 1): `/live/<app>/<uuid>`, permission `can_view(<uuid>)`. It carries `txt`, `cur`, `rs` and `chg`.
- **The app's home room:** `/live/<app>/home`, permission: the app's question with no argument (biodanza: `is_allowed()`). It carries `chg` only; `txt`, `cur` and `rs` there are dropped and counted. The home screen's lists (biodanza: vivencias, owners, shares) live here.
- Registry change (`rooms.js`): each app gains `home: { rpc: "<fn>" }` (no arg) and `notify: true` (the app may be named by `/live/notify`). `roomOf` accepts the literal id `home` when the app has `home`. Biodanza: `home: { rpc: "is_allowed" }`.
- **Why one home room per app and not a room per person** (`user/<uid>`): a per-person room makes the database work out, for every row, everyone who may see it (a public vivencia: every allowed person), turn share emails into user ids, and post one request per person (each a Durable Object request). One home room costs one DO request per change, and the fan-out is free (outgoing messages are not billed). The price: a client that cannot see the row asks for it once and gets nothing, and it learns that some uuid changed, exactly what a `postgres_changes` delete leaks today. Right for tens of concurrent people; if an app ever has thousands on its home screen, it moves to per-person rooms (a server and SQL change, not a kit change).
- **One socket per tab, in one room** (phase 1 rule, unchanged): the open thing's room when one is open, otherwise the home room. Switching closes and opens. Not multiplexed: while a vivencia is open, home-room-only changes are not heard; the home sources catch up once when the tab goes back to the home room. A change to the open vivencia's own row (its title, its sharing) is mapped to both rooms by the database, so the open screen hears it.
- **A socket now opens for any live source** of an app that moved its data to the relay (`SUPABASE.relayData`), for a signed-in person, not only for a co-edited field. The other socket rules stay (closed 30 s after the tab is hidden, heartbeat, backoff).
- *Considered and not chosen now:* one Durable Object per app holding every socket of the app, with rooms as attachment tags. It would make a notify one DO request regardless of rooms, and let a tab hear two rooms on one socket. It changes phase 1 (one DO per room) while that is being built, so it is noted for later, not done.

### `POST /live/notify` (from the database)

A separate route, not under `/roster/v1/` and not touching it. `/live/notify` has two path parts, so it never collides with a room path (an app can never be called `notify`).

1. Method `POST`; otherwise `405`. No CORS headers at all: no browser ever calls it.
2. **Secret:** header `x-live-secret`, compared in constant time (`crypto.subtle.timingSafeEqual` on the UTF-8 bytes, lengths compared first) with the Worker secret `env.LIVE_NOTIFY_SECRET`. Secret not configured: `503`, one log line. Wrong or missing header: `401`. The secret is never logged.
3. Body: at most 16 KB, JSON. `{ a, t, o, kc?, x?, r }`: `a` an app in `ROOMS` with `notify: true`; `t`, `o`, `kc` as in `chg`; `x` optional `true` (access was taken away); `r` an object of at most 20 rooms, each key a valid id of that app (uuid or `home`), each value `"*"` or 1 to 50 entries `[k]` / `[k, rev]`. Anything else: `400`, counted, not logged in content.
4. For each room: `env.LIVE.get(env.LIVE.idFromName(a + ":" + room)).fetch("https://live/notify", { method: "POST", body: <that room's chg, already serialized> })`. All rooms in parallel; the Worker answers `204` when they are all done (or `502` if a stub threw; pg_net does not retry, so this only shows in `net._http_response`).
5. **In the room (`LiveRoom.fetch` on `/notify`):** first line: `const ws = state.getWebSockets(); if (!ws.length) return new Response(null, { status: 204 });`. **No storage is touched, ever**, so an empty room costs the one request and the few microseconds it runs, nothing else. Otherwise: send the string to every authed socket; if `x` and the room is not `home`, send `{"t":"reauth"}` to every authed socket and mark them (`reauthAt` in the attachment).
6. The Worker does not look up who is in which room before calling the DO: that would need a store (KV or a hub object), each read or write of which costs more than the DO request it would save.

**Dedupe with the client path.** A kit write that will be announced on the socket carries the request header `x-floa-live: 1` (or `floa-live` inside `prefer`, if Supabase's CORS refuses a new header; one preflight check from `localhost:5173` decides). The trigger reads PostgREST's `request.headers` and skips it. The kit sets the header only while its socket is authed, and keeps a `chg` it could not send in a small in-memory queue that goes out right after the next `ok`. So each write is announced once, by the client when it can (faster, and 1/20 of a request), by the database otherwise. If both still arrive, the client drops a `[k, rev]` it already holds at that rev or newer, and coalesces keys without `rev` in its 300 ms window: one reload at most.

**Failure behaviour.** pg_net queues the request inside the writing transaction and sends it after commit: a rolled back write sends nothing, a slow or dead Worker never slows or fails a write, and nothing retries. A lost sign is healed by the next change of that row or by the clients' catch-up (every source reloads once on each `ok`). While the relay is down the kit polls every 30 s (kit doc).

### Tests (added to `worker/test/live-*.test.js`, one check each)

7. `/live/notify`: wrong secret `401`; good secret, room with no sockets: `204` and the fake `state.storage` never touched; good secret, two sockets: both get the same `chg` string.
8. A client `chg` reaches the other socket stamped with `u`/`s`, not the sender; a `chg` with 51 entries or a bad `tb` is dropped.
9. `x` in a notify sends `reauth`; a socket that does not re-`auth` within 10 s is closed `4001` at the next handled message.
10. In the home room a `txt` is dropped and a `chg` is relayed.

### Cost (estimate, Cloudflare free plan, same evening as above: 3 facilitators, the app open about 2 hours, 10 minutes of co-editing)

| | realistic | worst case (header skip impossible, every write also notified) |
|---|---|---|
| kit writes (field saves about every 4 s while typing, list moves, music choices) | ≈ 240 | ≈ 240 |
| client `chg` in, at 20:1 | ≈ 12 requests | ≈ 12 |
| `/live/notify` calls (writes from outside the kit: admin, SQL, the old app while it is still published) | ≈ 10 | ≈ 250 |
| each notify: 1 Worker request + 1 DO request per room (2 for home-level tables) | ≈ 25 | ≈ 600 |
| home and room sockets opened (app opened, ~10 room switches and ~5 returns from a hidden tab each) | ≈ 50 | ≈ 50 |
| `reauth` (only when access is taken away) | ≈ 0 | ≈ 5 |
| **phase 2 requests for the evening** | **≈ 90** | **≈ 670** |
| phase 1 (typing, carets, above) | ≈ 320 | ≈ 800 |
| **all live traffic for the evening** | **≈ 410 (0.4% of 100,000/day)** | **≈ 1,470 (1.5%)** |
| rows written, storage | 0 | 0 |

- `/live/notify` calls are also Worker requests, counted in the same daily quota as every other route of this Worker (`/lead`, `/roster/v1/`, `/transcribe`). At the worst case above that is 250 of 100,000.
- **Supabase:** pg_net: one queue row per notify, plus one response row, both cleaned by pg_net itself (responses are kept about 6 hours). 10 to 250 an evening. REST reloads by receivers: each `chg` times the other people in the room, about 500 small GETs (about 0.5 KB each, 0.25 MB). Two REST calls per socket opened (≈ 100). **Realtime messages: 0** for biodanza once phase 3 ran (before that, the old app's listeners only).
- **Relay down:** sources poll every 30 s while visible: about 7 sources × 2 per minute per person, about 2,500 small GETs per hour for 3 people. Only while it is down.

## Leaving Supabase Realtime (phase 3)

- **The switch is per app, in `/supabase.js`:** `SUPABASE.relayData = ["biodanza"]` (next to `SUPABASE.relay`). For a schema in that list, the kit opens no Supabase Realtime socket for its sources, and its presence has no Supabase broadcast path. An app not in the list (roster, once it is on the kit) keeps today's path. Without `SUPABASE.relay`, the list is ignored and everything is as today: that is the way back.
- **SQL:** `apps/biodanza/realtime-off.sql` drops the eight biodanza tables from `supabase_realtime`; roster and roster-test tables stay, always (roster's own clients move to the relay without removing them, because external sites may listen; see "Roster"). It refuses to run while `realtime.subscription` still holds a `postgres_changes` subscription on a biodanza table (an old client is open). Undo: `realtime-off.rollback.sql`.
- **The old published app shares the database.** It listens to `postgres_changes` (topic `realtime:biodanza`) and sends carets on the public topic `biodanza-cur:<id>`. Removing the publication before the new app is published, and before the old tabs are gone, silently stops its live updates. The safe order is in `ui/docs/realtime.md`, "ניתוק מ-Supabase Realtime", and is repeated in the owner list below.
- **Not removed in phase 3:** `rev` and its triggers, the private channel policies on `realtime.messages` (they go with the Supabase broadcast fallback code, by a later decision), `pg_net`.

## Roster (definition, 2026-11-26; built 2026-11-27, not deployed, SQL not run: see "As built (roster)" below)

Owner, 2026-11-26: all realtime moves off Supabase onto this relay, roster included, now. The kit side, the full inventory and the owner question are in `ui/docs/realtime.md`, "רוסטר ואתרים חיצוניים". The SQL is `apps/roster/relay-notify.sql` (+ `.check.sql`, `.rollback.sql`), drafts, not run.

**The hard line: `/roster/v1/` is FROZEN, including any behaviour an external site can rely on.** So only OUR clients move: the admin page (`apps/roster/public/admin/admin.js`, today `postgres_changes` on 17 tables) and the members' area (`apps/roster/public/me/me.js`, today a 45 s poll). Everything an external site can hear stays on Supabase exactly as it is:

- the `supabase_realtime` publication: the 17 roster tables, in `roster` and in `roster-test` (34 rows). **No realtime-off file for roster.**
- `rt_ping()` and its row triggers on `meetings`, `meeting_types`, `attendance`, `payments`, `participants` (both schemas), `business_settings.realtime`, and the public broadcast topics `<schema>:<slug>` (event `change`, payload `{t}`). Listened to by the harpatka site (`HRT.channel`, the live site and `apps/harpatka/public/`) and by the planned `/roster-site.js` `live()` (`apps/roster/SITE.md`).
- the tables' RLS; the webhooks, `events_claim` and the cron (HTTP, not Realtime; this Worker publishes nothing to Supabase channels today).

### Rooms

Two registry lines, one per schema, each bound to its host (`schemaOfHost` semantics, `worker/src/roster/db.js`; imported, not changed):

```js
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^m-[a-z][a-z0-9-]{1,39}$/;          // the members' room: "m-" + the business slug
roster:        { schema: "roster",      env: "prod", notify: true, rooms: [
                 { id: UUID, rpc: "can",         arg: "b" },               // admin room: /live/roster/<business uuid>
                 { id: SLUG, rpc: "live_member", arg: "s", strip: "m-" },  // members' room: /live/roster/m-<slug>
               ] },
"roster-test": { schema: "roster-test", env: "test", notify: true, rooms: [ /* the same two */ ] },
```

- **Room kinds:** `rooms` is a list; the first kind whose `id` matches decides the rpc and the argument (`strip` is cut off the id before it is sent). An app with the old single `id`/`rpc`/`arg` (biodanza) works unchanged. Neither roster line has a `home` room.
- **Host binding (`env`):** a room or a notify of an `env: "test"` app is accepted only on `api-test.floa.co.il`; an `env: "prod"` app only on any other host. The wrong one: `404` before the upgrade, `400` for a notify. On `localhost` (wrangler dev) both are accepted. Apps without `env` (biodanza) are accepted anywhere, as today.
- **The admin room's question** is the existing `can(b uuid)` (SECURITY DEFINER, `authenticated` may execute): the platform owner, or an account listed for the business. No new SQL for it.
- **The members' room's question** is new, `live_member(s text)`: the signed-in account is an `approved` member of the business with that slug, linked to a participant. Keyed by slug because the me page knows only the slug (`me()` does not return the business id, and its answer must not change). One room per business, not per member: a meeting change concerns every member, and a room per member would be one Durable Object request per member per change.
- The kit maps the page's schema to the relay address: a `roster-test` page talks to `wss://api-test.floa.co.il/live` (the `floa-lead-test` Worker, its own `LIVE` binding and objects), every other page to `wss://api.floa.co.il/live`. `/supabase.js` sets `SUPABASE.relay` from the page's schema.

### Notifies from the database

`relay-notify.sql`, one schema per run: statement triggers on 22 tables; one `POST /live/notify` per statement, to the Worker of that schema (`roster` to `api.floa.co.il`, `roster-test` to `api-test.floa.co.il`), with its own secret: Vault `live_notify_secret` (shared with biodanza) or `live_notify_secret_test`, equal to that Worker's `LIVE_NOTIFY_SECRET`. **The test Worker now needs `LIVE_NOTIFY_SECRET` too** (`npx wrangler secret put LIVE_NOTIFY_SECRET --config wrangler.test.toml`).

| room | tables | `c` |
|---|---|---|
| `<business uuid>` (admin) | the 17 of `admin.js` `TABLES`, `business_users`, `businesses` | `[[id]]` for tables keyed by an `id uuid` (`kc: "id"`), else `"*"` |
| `m-<slug>` (members) | `participants`, `attendance`, `payments`, `meetings`, `meeting_types`, `pay_methods`, `business_settings`, `pass_requests`, `members`, `businesses` | always `"*"`: a member never learns another participant's id; admin-only tables (finance, notes, templates, sent messages) never reach it |

- **No content, no email, no phone, no name.** `business_users` (its key is an email) is always `"*"`.
- **`x` (access taken away):** `business_users` delete or update (admin room); a member leaving `approved`, its participant changing, or its row deleted (members' room); a business deleted or its slug changed (both). The rooms send `reauth`; `can` / `live_member` then say no and the socket is closed `4003`.
- **The frozen API is not touched:** the whole trigger body is wrapped (`exception when others then return null`), so a write through `/roster/v1/` behaves exactly as before; pg_net only queues, after commit; no Vault secret means no request. A session with `floa.live = 'off'` (bulk scripts) sends nothing.
- **Once per room and table per transaction for `"*"`**, so a save of several statements is one sign.
- **`x-floa-live`:** the trigger still skips it, but roster clients do not send it in this step (the admin and me pages write with their own `fetch`, not `RosterLive.rest`), so every write is announced by the database, also to the tab that wrote (it reloads, as today). The Worker never sends it on API calls.

### Clients: `RosterLive.signal`, not a migration of the admin

The admin page and the me page load `/live.js` (after `/auth.js`) and use a thin kit listener, `RosterLive.signal(schema, room, fn, { poll, spread })`: a room member with no source, on the tab's one relay socket. `fn({ reason: "chg" | "sync" | "poll", tb, o })`: `chg` coalesced 300 ms; `sync` once per `ok`; `poll` every `poll` ms while the relay is down for that room (no `ok` after a try, `4003`, `4004`, signed out) and the tab is seen. `spread` adds 200 to 1000 ms of random delay and at most one call per 3 s per tab (the members' room, where many tabs hear the same sign). It returns `null` when the schema is not in `SUPABASE.relayData` or no relay is set: then the admin page keeps `startRealtime` and the me page its 45 s poll. The admin passes `poll: 60000` (its reload is the whole screen), the me page `poll: 45000, spread: true`.

### Tests (added to `worker/test/live-*.test.js`, one check each)

11. A `roster-test` room on `api.floa.co.il`: `404`; a `roster` room on `api-test.floa.co.il`: `404`; a notify naming `roster-test` on the production host: `400`.
12. `/live/roster/m-harpatka` asks `live_member` with `{ "s": "harpatka" }`; `/live/roster/<uuid>` asks `can` with `{ "b": "<uuid>" }` (fetch mocked); `/live/roster/m-Bad_Slug`: `404`.

### Cost (estimate, Cloudflare free plan; numbers to be checked in the dashboard)

Assumptions for a normal day in production: 3 active businesses; per business 2 admins with the page open about 4 hours, about 150 admin actions, about 30 signups and payment clicks through the API, about 20 visits to the members' area.

| per business, per day | count | requests |
|---|---|---|
| notified statements: admin actions (≈ 2 statements each after the per-transaction `"*"` dedupe) | ≈ 300 | |
| notified statements: API writes (≈ 3 statements each: participant, attendance, note) | ≈ 90 | |
| Worker requests for `/live/notify` | | ≈ 390 |
| Durable Object requests (the admin room for all, the members' room for about half) | | ≈ 590 |
| sockets opened (admins: ≈ 40 opens each, back from a hidden tab; members: ≈ 30) | | ≈ 110 |
| incoming client messages (`auth` and refreshes only; pings are auto-answered), at 20:1 | ≈ 150 | ≈ 8 |
| **total per business** | | **≈ 1,100** |

- **3 businesses: ≈ 3,300 requests/day, about 3.3% of 100,000/day**, shared with `/lead`, `/roster/v1/`, the cron and biodanza (≈ 410 to 1,470 per evening, above). A busy day (5x): ≈ 16,500 (16.5%). `roster-test` while testing: a few hundred, from the same account quota. **Unverified:** whether the DO request quota is separate from the Worker's 100,000/day, and whether cron invocations (1,440/day per Worker, two Workers) count; check in the dashboard.
- **Runaway case:** a script writing thousands of rows one statement at a time without `floa.live = 'off'`: about 3 requests per row. Bulk SQL (one statement for many rows) is one notify.
- **Rows written, storage:** 0.
- **Supabase goes down, not up:** the admin page's `postgres_changes` disappear (51 bindings per tab, RLS evaluated per change per subscriber, and unfiltered deletes that reached every admin of every business); each open me tab stops polling every 45 s (≈ 80 RPCs an hour). Added: one pg_net queue row and one response row per notify (≈ 1,200 a day; pg_net cleans them).

### Order and rollback

`roster-test` first, each step with the owner's yes: (1) code, with no roster schema in `relayData` (publishing changes nothing); (2) deploy `floa-lead-test` with the roster-test rooms, its `LIVE_NOTIFY_SECRET`, Vault `live_notify_secret_test`; (3) check (baseline), `relay-notify.sql` on `roster-test`, check again; (4) publish with `"roster-test"` in `relayData` and test on `roster-test.floa.co.il`, including that the harpatka preview still refreshes from `rt_ping`; (5) a few days; (6) production: deploy `floa-lead` with the roster rooms, AUM checks before, `relay-notify.sql` with target `roster` (the owner's direct yes for that file), check, AUM checks after; (7) publish with `"roster"` in `relayData`. There is no step 8: nothing is removed from Supabase Realtime for roster.

Rollback: the client switch first (out of `relayData`, publish: the admin is back on `postgres_changes` at once, since the publication never changed), then `relay-notify.rollback.sql` for that schema.

### Pending the owner (roster)

1. The deploys and secrets above (test, then production).
2. Running `relay-notify.sql` on `roster-test`, then on `roster`.
3. The external surfaces (b): stay on Supabase forever, or move later through `/roster-site.js` with a migration window. The question and the recommendation are in `ui/docs/realtime.md`, "השאלה לבעלים על (ב)".

## As built (2026-11-26)

Files: `worker/src/live/rooms.js`, `routes.js`, `room.js`; `worker/test/live-relay.test.js` (tests 1 to 6) and `live-data.test.js` (7 to 10), both in `npm test`; the kit in `ui/live.js`.

- **Supabase trouble is not a refusal:** a 5xx or a network error on `/auth/v1/user` or on the room's rpc closes `1011` (the kit waits and retries). Only a real answer closes `4001` (not 200 from `/auth/v1/user`) or `4003` (the rpc did not say `true`).
- **`auth` on an authed socket counts in the token bucket** with `txt`, `cur`, `rs` and `chg`, so a client cannot drive Supabase calls by repeating it.
- **`rs` is answered by the kit only while its typing run is younger than `SETTLE`** (4 s).
- **The kit sends a change, not the full value, just before a save** (the text said a full value). The receiver ends with the same text; a gap still brings one `rs`.
- **`chg` validation:** `kc` is required unless `c` is `"*"`; `kc` may also come with `"*"` (the database does that over 50 keys).
- **`/live/notify` to the room:** the Worker calls the stub with `https://live/notify` and, for `x` and a room that is not `home`, the header `x-live-reauth: 1`; the room knows its own id from its sockets' attachments. `reauthAt` is `ra` in the attachment; the 10 s deadline is checked on the socket's next message and in the lazy sweep. Missing secret: `503`; wrong or missing header: `401`; bad body: `400`; a stub that throws: `502`.
- **Who announces a kit write:** the kit sets `x-floa-live` and sends the client `chg` only when every live source of that table in the tab (read or watched) is in the socket's room and that room is not `home`. Writes to tables that belong to two rooms (biodanza: `vivencias`, `vivencia_owners`, `vivencia_shares`) never carry the header, so the database announces them to both rooms. The CORS preflight from `localhost:5173` with `x-floa-live` passes (checked 2026-11-26), so the kit uses the header; `/auth.js` `api()` now passes `opts.headers`.
- **The SQL draft** (`apps/biodanza/relay-notify.sql`) was checked against this: the body keys, the room ids (`<uuid>` and `home`), `kc` absent with `"*"`, and the header skip all match. One fix: a body over 15,000 bytes (20 rooms of 50 keys) turns every room into `"*"`, under the Worker's 16 KB limit.
- **Measured locally** (`wrangler dev`, a stub Supabase, 15 ms each way): typing, median 102 to 124 ms, p95 174 to 198 ms, about 7.2 `txt` a second per typist, one full value per run; a client `chg` reached the other page and its row reloaded in about 510 ms (300 ms of it the kit's coalescing window); a notify reached both pages; an empty room answered `204` in 19 to 89 ms; a `reauth` closed the person who lost access `4003` in about 150 ms; 0 Supabase Realtime sockets with `relayData`.

## As built (roster, 2026-11-27)

Files: `worker/src/live/rooms.js` (`roster` and `roster-test`, `rooms` kinds, `kindOf`, `hostOk`), `room.js` (`verify` asks the kind's rpc, `strip` cut off), `routes.js` (host binding on the upgrade and on `/live/notify`); `worker/test/live-roster.test.js` (tests 11 and 12, in `npm test`); the kit's `RosterLive.signal` in `ui/live.js`; `apps/roster/public/admin/admin.js` and `me/me.js` behind the switch; `apps/roster/relay-notify.sql` (draft, not run).

- **Host binding reads `request.url`'s hostname, and `wrangler dev` hands the Worker the host of the config's custom-domain route**, not the request's `Host`: under `wrangler.toml` every request is `api.floa.co.il` (roster accepted, roster-test `404`/`400`), under `wrangler.test.toml` every request is `api-test.floa.co.il` (the reverse). So local work on roster-test runs `npx wrangler dev --config wrangler.test.toml`. `localhost`/`127.0.0.1` accepting both is kept for other runners and the unit tests.
- **A kind that does not match returns `4004` from `verify`** (cannot happen behind `roomOf`, which already refused it with `404`).
- **`RosterLive.signal`:** a signal is `stale` (and polls) also while the tab's socket is in another room (only a page with a source in a second room could cause that; the admin and me pages have one signal and no source). `sync` is sent on every `ok`, also the first: one extra reload when the page opens, which covers the gap between the page's first load and the socket.
- **The me page** takes its room from `me().business.slug` (else `?biz=`), lower case; a slug the Worker cannot name (not `^[a-z][a-z0-9-]{1,39}$`) gets no signal and keeps the 45 s poll.
- **Both pages' CSP** (`<meta>` in `admin/index.html`, `me/index.html`) now allow `wss://api.floa.co.il wss://api-test.floa.co.il` in `connect-src`; without it the socket is refused by the browser before the Worker sees it.
- **The SQL draft, aligned with this code:** `live_member(s text)` as asked by `verify` (`{ "s": "<slug>" }`, profile = the schema); `x` on ANY update or delete of `business_users` and `members` (biodanza's owners and shares rule; the trigger's own narrower test is kept and is now covered by it); a members' room only for a slug matching the Worker's pattern (one bad room id makes the Worker refuse the whole notify, `400`); more than 20 rooms ordered by business so a business keeps both rooms; `raise log` (no content) when a notify is swallowed. `relay-notify.check.sql` picks a business with such a slug and adds check 17 (a members update carries `x`).
- **Measured locally** (`wrangler dev --config wrangler.test.toml`, the real admin and me pages from `apps/roster/public`, a stub Supabase): both admin pages opened `/live/roster-test/<biz>` and asked `can`, the me page opened `/live/roster-test/m-harpatka` and asked `live_member`; a notify to the admin room reloaded both admin pages (17 GETs each) and, with `m-harpatka` in the same notify, the me page once (spread); `business_users` in the admin room reloaded nothing; a members'-room notify reloaded only the me page; `x` with `can` now false closed the second admin `4003` in about 210 ms while the first stayed; wrong secret `401`; `m-Bad_Slug` `404`; no relay: the admin opened its Supabase socket (`startRealtime`) and no `/live/` socket, the me page kept its 45 s interval, `signal()` returned `null`; with the relay the me page had no 45 s interval; no page errors.

## Pending the owner

1. **Deploy** (`npx wrangler deploy`, and `--config wrangler.test.toml` for the test Worker): publishing, only when the owner says. The migration `live-v1` runs with the first deploy.
2. **Cloudflare dashboard:** none is required for the route (`api.floa.co.il` is already a custom domain of this Worker). To verify there: the account plan, and that Durable Objects are enabled on it.
3. **The old Supabase broadcast path:** kept only as the "no relay configured" switch (default of this definition), or also as a fallback while the relay is down (the definition says no: a split room and a load spike back onto Supabase), or deleted after the relay has been stable.
4. **`SUPABASE.relay` in `/supabase.js`:** added only after the deploy is up and checked; before that every page stays on today's path.
5. **Phase 2, the Worker secret:** `npx wrangler secret put LIVE_NOTIFY_SECRET` (a random value of 32+ bytes), on the production Worker. The test Worker gets its own value once roster-test moves ("Roster"): the `roster-test` triggers call `api-test.floa.co.il` with Vault `live_notify_secret_test`.
6. **Phase 2, the Vault secret:** the same value in the project's Vault as `live_notify_secret` (`select vault.create_secret(...)`, in `relay-notify.sql`'s header). Until it exists the triggers do nothing.
7. **Phase 2, the SQL:** `apps/biodanza/relay-notify.sql`, then its check. Only after the Worker with `/live/notify` is deployed and the Worker secret is set (otherwise every write queues a request that gets `404` or `503`: harmless, but noise in `net._http_response`).
8. **Phase 3, the client switch:** `SUPABASE.relayData = ["biodanza"]`, published together with the new app.
9. **Phase 3, the SQL:** `apps/biodanza/realtime-off.sql`, only after the new app is published and the old clients are gone (its guard refuses otherwise).
