# The media store: `/media/<business>/…`

A definition, not yet built (2026-11-26, revision 5). A generic media store for any FLOA business: images, video and audio in Cloudflare R2.

**The rule that shapes everything:** this account is on **Workers Free**, with 100,000 requests a day for the whole account. Above that the roster API goes down, and the external AUM site depends on it. So:

- **Reading costs zero Worker requests.** That covers public bytes, public lists and private bytes.
- **Every staff action costs exactly one Worker request.**

See "Limits" for the budget.

How the pieces fit:

- **Public folders** live in a **public bucket on the custom domain `media.floa.co.il`**, cached at the edge by the CDN. Their lists are a static **index file** in that same bucket, which the Worker rewrites on every change.
- **Private folders and the trash** live in a **private bucket**. The Worker decides who may read them, and hands staff **presigned R2 URLs** in one list call. The browser then fetches the bytes from R2 directly, so the Worker never streams a byte.
- **The Worker** (`api.floa.co.il`) does every write (upload, delete, restore, purge), the staff list, and the staff check.

**v1 needs no database change.** In variant B, R2 holds the bytes, the lists and the metadata. The database index (variant A) is a documented later upgrade.

The owner chose R2 because the Biodanza app's music already works that way (`src/biodanza-audio.js`). The first user is Harpatka's site (`apps/harpatka/`): its ad gallery, and its home page, which with `?ad=N` is the landing page of paid ads. Another session builds those pages. This file is the server and the contract that the page module (`ads/media-api.js`) implements (see "Client contract").

## The first business, measured 2026-11-26

| top folder | files | bytes | where |
|---|---|---|---|
| `ads/` (`ads/img`, `ads/video`) | 332 | 480 MB | public bucket, `media.floa.co.il` |
| `raw/` | 175 | 299 MB | private bucket, staff only |
| `music/` | 37 MP3 | 132 MB | private bucket, staff only |
| **total** | 544 | ~911 MB | largest single file: 31 MB |

Every file fits in one request, so **single-request PUT is the upload path.** Multipart is a documented later extension. There are no WAV files.

## Not touched

- **`/roster/v1/` is FROZEN** (CLAUDE.md). The store is a separate path in a separate module, and it changes nothing that the roster API answers. It reads roster's tenancy only through the existing `roster.my_businesses()`, with the caller's own token. No roster table, function, policy or API changes, and **no database change at all in v1.**
- `/lead`, `/transcribe`, `/parse-cv`, `/biodanza/audio/*`, `/roster-auth/*`, `/roster-wa/*` and `/live/*` are unchanged. The Biodanza bucket stays as it is.
- **No business name in the code.** The business is always the path segment after `/media/`, and the first segment of every R2 key. Nothing in `worker/src/media/` names one, and a test checks this.

## Shape

### Two buckets

| bucket | binding | how it is read | holds |
|---|---|---|---|
| `floa-media-public` | `MEDIA_PUBLIC` | **by anyone**, on `media.floa.co.il` only (`r2.dev` off), cached by the CDN | `<b>/<key>` for keys in a **public** top folder (including its data files `<top>/_data/*.json`), `<b>/_index/<top>.json` (the list of each public top folder), and `<b>/_index/_folders.json` (which top folders are public) |
| `floa-media` | `MEDIA` | only through **presigned GET URLs** that the Worker hands to staff, valid 6 to 12 hours, on `<account>.r2.cloudflarestorage.com` | `<b>/<key>` for private top folders (including their data files `<top>/_data/*.json`, e.g. `raw/_data/links.json`), `<b>/trash/<key>`, and the store's own `<b>/.settings.json` and `<b>/.gone/<key>` |

A public R2 bucket is public as a whole (Cloudflare documents no per-prefix public access), so only public material ever goes into it. Its root cannot be listed ("public buckets do not let you list the bucket contents").

### Keys (relative to the business)

```
<folder>/<name>             e.g. ads/video/biodanza-hero-ad8d449f.mp4, raw/IMG_2041.mov, music/track-07.mp3
trash/<folder>/<name>       the same item in the trash (private bucket)
```

In R2 every key is stored as `<b>/<key>`, and the public URL is `https://media.floa.co.il/<b>/<key>`.

- **`folder`** is 1 to 3 segments, each `^[a-z0-9][a-z0-9-]{0,31}$`, joined by `/`. Its first segment is the **top folder**, which decides visibility. The top folder `trash` is reserved.
- **`name`** is `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, with no `..`. Its extension, case-insensitive, must belong to its type (table below).
  - **Keys are by file name**, because the page's static `ads.json`, `videos.json` and `registry.json` name the ad media, and those names already carry content hashes.
  - Keys are case-sensitive.
  - A name outside the rule (Hebrew, spaces) is refused. The uploader slugifies it and puts the human name in `title`.
- **No name given** (a `POST` to a folder): the name is the first 32 hex characters of the sha256 plus the canonical extension. It is deterministic, so the same bytes always land on the same key and dedupe by themselves.
- **Control routes and system objects start with `_` or `.`**. A folder or a name cannot start with either, so neither one ever collides with a key. Objects starting with `.` are never listed or served.
- **The one exception is the data folder:** the segment `_data`, directly under **any** top folder, public or private (`<top>/_data/<name>.json`, e.g. `ads/_data/ads.json` or `raw/_data/links.json`). It holds JSON only, lives in the bucket of its top folder, and has its own rules (see "Data files"). Deeper than one level (e.g. `ads/video/_data/`), `_data` gets 400 `validation`. Control routes sit at the business root (`/media/<b>/_admin`), and `_data` never does, so the two cannot collide.

### Allowed types

| type | extensions (case-insensitive) | canonical | kind | edge-cached by default |
|---|---|---|---|---|
| `image/jpeg` | `jpg`, `jpeg` | `jpg` | image | yes |
| `image/png` | `png` | `png` | image | yes |
| `image/webp` | `webp` | `webp` | image | yes |
| `image/gif` | `gif` | `gif` | image | yes |
| `image/avif` | `avif` | `avif` | image | yes |
| `image/heic` | `heic` | `heic` | image | no (Cache Rule) |
| `video/mp4` | `mp4`, `m4v` | `mp4` | video | yes |
| `video/quicktime` | `mov` | `mov` | video | no (Cache Rule) |
| `video/webm` | `webm` | `webm` | video | yes |
| `audio/mpeg` | `mp3` | `mp3` | audio | yes |
| `audio/mp4` | `m4a` | `m4a` | audio | no (Cache Rule) |
| `audio/ogg` | `ogg`, `opus` | `ogg` | audio | yes |
| `audio/flac` | `flac` | `flac` | audio | yes |
| `audio/wav` | `wav` | `wav` | audio | no (Cache Rule) |
| `application/json` | `json` | `json` | data | no (Cache Rule). **Only under `<top>/_data/`** |

Anything else gets 415, including SVG, HTML and PDF, and JSON anywhere outside `_data/`. SVG and HTML can carry script, and the public bucket answers from a `floa.co.il` host. The index files are written by the Worker only.

### Metadata (R2 custom metadata, set at upload)

| key | value | in a list as |
|---|---|---|
| `sha256` | 64 lowercase hex, **verified by R2** at upload | `sha256` |
| `w`, `h` | integers 1 to 20000 | `w`, `h` |
| `duration` | seconds, decimal with up to 3 places, 0 to 86400 | `duration` |
| `title` | up to 200 characters, stored percent-encoded | `title` (decoded) |
| `copyright` | up to 200 characters, stored percent-encoded | `copyright` (decoded) |
| `up` | ISO time of the first upload, kept by every copy | `uploaded` |
| `by` | the uploader's user id (the JWT `sub`, read after Supabase accepted the token) | never |
| `trashed` | ISO time, only on a trash copy | `trashed` |

Each object's `httpMetadata` holds `contentType`. In the public bucket it also holds `cacheControl: public, max-age=86400`, except for the files that change: the indexes (`_index/*.json`, `_folders.json` included) and the data files (`<top>/_data/*.json`) get `public, max-age=60`. A private data file, like every private object, has no `cacheControl`. All of this is far under R2's 8,192 bytes of metadata.

Title and copyright are fixed at upload in v1, since editing was not asked for. Variant A adds it.

### Per-business settings (`<b>/.settings.json`, private bucket)

```json
{ "public_folders": ["ads"],
  "origins": ["https://harpatka.co.il", "https://www.harpatka.co.il"],
  "quota_bytes": 5368709120, "max_items": 5000, "max_file_bytes": 94371840,
  "moving": null }
```

- **Without this object the business is off**, and every `/media/<b>/` route answers 404.
- Only the owner writes it, through `PUT /media/<b>/_settings`, or with `wrangler r2 object put` as a fallback.
- `public_folders` changes only through the move (`_visibility`).
- `max_file_bytes` is at most 90 MiB while uploads are single-request.
- The Worker keeps the settings in isolate memory for 60 seconds per business.
- **Every write of `.settings.json`** (`_settings`, and the last call of `_visibility`) also writes the public file **`<b>/_index/_folders.json`** = `{"public_folders":[…]}`. It is `public, max-age=60`, and purged from the CDN in the same call when `CF_PURGE_TOKEN` is set. The page can learn which folders are public with no Worker request. The rest of the settings (origins, quotas) is never published.

## Routes

`<b>` is the business's roster slug (`^[a-z][a-z0-9-]{1,39}$`). The API is on `api.floa.co.il`. `floa-lead.floa-il.workers.dev` answers the same, as for every route.

**Reads with no Worker request:**

| URL | who | what |
|---|---|---|
| `https://media.floa.co.il/<b>/<key>` | anyone | a public file (Range, edge-cached) |
| `https://media.floa.co.il/<b>/_index/<top>.json` | anyone | the list of a public top folder, in the shape of the list answer |
| `https://media.floa.co.il/<b>/_index/_folders.json` | anyone | `{"public_folders":[…]}` |
| `https://media.floa.co.il/<b>/<top>/_data/<name>.json` | anyone | a data file (e.g. the ads' own JSON), `max-age=60` |
| `https://<account>.r2.cloudflarestorage.com/floa-media/<b>/<key>?X-Amz-…` | whoever holds the URL (the Worker hands these only to staff) | a private or trashed file (Range), presigned |

**The Worker, one request each:**

| method | path | who | what |
|---|---|---|---|
| `GET` | `/media/<b>/_admin` | anyone (the answer depends on the token) | `{admin, owner, public_folders}`, the only staff-check route |
| `GET` | `/media/<b>/?prefix=<p>&cursor=<c>&limit=<n>` | staff (a public prefix is also open to anyone, but the page reads the index instead) | list, with a presigned `url` for each private item. **`prefix=<top>/_data/` exactly** lists that folder's data files (staff only, public or private folder) |
| `PUT` | `/media/<b>/<key>` | staff | upload under that name. Under `<top>/_data/`: **overwrite**, with the previous version going to the trash |
| `POST` | `/media/<b>/<folder>/` | staff | upload, named by its sha256 |
| `DELETE` | `/media/<b>/<key>` | staff | **delete = move to the trash** (one key) |
| `POST` | `/media/<b>/_delete` `{"keys":[…]}` | staff | the same for up to 8 keys at once (one ad = one call) |
| `POST` | `/media/<b>/_restore` `{"keys":[…]}` | staff | back from the trash to the **same key**, up to 8 (the same keys that were deleted) |
| `DELETE` | `/media/<b>/trash/<key>` | staff | **purge = hard delete** (one key, only from the trash) |
| `POST` | `/media/<b>/_purge` `{"keys":[…]}` | staff | the same for up to 8 (the original keys, as for restore) |
| `POST` | `/media/<b>/_reindex` `{"folder":"<top>"}` | staff | rewrite one public index (after a bulk upload) |
| `GET` | `/media/<b>/_usage` | staff | bytes, items, quota |
| `GET` | `/media/<b>/_check` | staff | read-only drift report (half moves, objects in the wrong bucket, a stale index) |
| `PUT` | `/media/<b>/_settings` | **owner** | create or change the settings (not `public_folders`) |
| `POST` | `/media/<b>/_visibility` `{"folder":"ads","public":true}` | **owner** | move a top folder between the buckets, in batches |
| `GET`, `HEAD` | `/media/<b>/<key>` | public key: anyone (`301` to the CDN). Private key: **404**, because there is no single-key renew (list the prefix again) | a helper for old public links only. **The page never uses it:** each use is a Worker request |
| `OPTIONS` | any `/media/…` | | CORS preflight |

Anything else under `/media/` answers 404, and a wrong method on a known path answers 405.

### Errors

Every error is `{"ok":false,"error":{"code":"…","message":"…"}}`, with `field` added for `validation`. Every error is `cache-control: no-store`, and no database or R2 text is ever passed through.

| status | code | when |
|---|---|---|
| 400 | `bad_request` | malformed query, body or `X-Media-Meta`, or more than 8 keys |
| 400 | `validation` (+`field`) | a key, prefix, name or meta field outside its rule |
| 400 | `checksum_mismatch` | the bytes do not match the declared `sha256` (nothing stored) |
| 401 | `unauthorized` | a token Supabase refuses (bad, expired), or no token on a staff route |
| 403 | `forbidden` | not staff (not the owner, for owner routes) |
| 403 | `origin` | a browser origin that is not allowed on a staff route |
| 404 | `not_found` | business off (no settings), unknown key, bad path |
| 405 | `method_not_allowed` | |
| 409 | `name_taken` | the name exists in the folder, live or in the trash, with different bytes |
| 409 | `in_trash` | the same bytes sit in this folder's trash: restore instead |
| 409 | `name_recently_used` | the name was purged less than 48 h ago with different bytes |
| 409 | `folder_moving` | the top folder is being moved between buckets |
| 409 | `conflict` | the trash and live copies disagree (`_check` shows it) |
| 411 | `length_required` | an upload without `Content-Length` |
| 413 | `too_large` | over `max_file_bytes` |
| 413 | `quota_exceeded` | over `quota_bytes` or `max_items` |
| 415 | `unsupported_type` | type not in the table, or an extension that does not belong to it |
| 429 | `rate_limited` | R2 refused a write to the same key twice in a second, even after the retries. `Retry-After` |
| 502 | `upstream` | Supabase, R2 or the purge API failed. One log line, no content |
| 503 | `not_configured` | a binding, var or secret is missing (`MEDIA`, `MEDIA_PUBLIC`, `MEDIA_PUBLIC_BASE`, `R2_ACCOUNT_ID`, `R2_READ_KEY_ID`, `R2_READ_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`). One log line naming it |

**A batch call** (`_delete`, `_restore`, `_purge`) answers `200 {"ok":true,"done":[keys],"failed":[{"key","code"}]}`.
- **`ok:true` with a non-empty `failed` is a partial success.** The client shows what is in `done` and lists what is in `failed`. `done` can also be empty, when every key failed one by one.
- **`ok:false`** (the error envelope, with a 4xx or 5xx status) means the call itself was refused, before any key was touched: auth, origin, a bad body, more than 8 keys, or the store being off.
- Each failed key carries a code from the table above.

## Who may do what

### Staff and owner: the exact check

"Staff" means roster's tenancy as it already exists: **the owner** (`roster.superadmins`) **or an account whose email is in `roster.business_users` for that business.** There are no roles. "Owner" is the superadmin.

The Worker holds no key that could verify a token, so it asks the database with the caller's own token, through a function that already exists and that `authenticated` may already execute:

```
POST ${SUPABASE_URL}/rest/v1/rpc/my_businesses
apikey: ${SUPABASE_ANON_KEY}    authorization: Bearer <the caller's token>
accept-profile: roster          content-profile: roster          content-type: application/json     body: {}
```

1. **PostgREST verifies the JWT** (its signature and expiry). A bad token gets HTTP 401, which the Worker passes on as 401 `unauthorized`.
2. The answer is `[{id, slug, name, is_super}]`, the businesses the caller may open (`roster.can`). **Staff** = a row whose `slug` equals `<b>`. **Owner** = `is_super`. Not staff gets 403, and the answer never says whether the business exists.
3. The answer is kept in isolate memory under a SHA-256 of the token and the slug, never the token itself: a yes for 5 minutes or until the token's `exp`, a no for 1 minute, a Supabase failure not at all. This is the pattern of `mayListen` in `src/biodanza-audio.js`. It is a Supabase call, not a Worker request.

What follows from this:
- **No service key and no database change.** Nothing here can bypass RLS.
- **Only access tokens of the domain's Supabase project are accepted** (`SUPABASE_URL`, the one project of all of `floa.co.il`). It is the same project on every host, the business's own domain included (`harpatka.co.il`).
  - On a `floa.co.il` app the token is `FLOA_AUTH.token()` from `/auth.js`. On a business's own domain it is that page's session with the same project.
  - The Worker sends a token only to `SUPABASE_URL`, so a token from any other project (e.g. a business's old project of its own) fails PostgREST's signature check and gets 401.
  - **Each host that signs people in must be in that project's Redirect URLs** (Authentication, URL Configuration), for production and for `localhost:5173`. That is the owner's manual step in the Supabase dashboard (setup step 13).
- **When an account is taken off a business:**
  - its writes and lists stop within 1 to 5 minutes (the cached answer);
  - a presigned URL it already holds keeps working up to 12 hours;
  - an access token lives up to about an hour.
- The token is never stored or logged.

### Viewing: per top folder, default private (PENDING owner confirmation)

`public_folders` names the public top folders, and the setting decides **the bucket at upload time**:

- **Public** (proposed for `ads`): the object goes to `floa-media-public` and is served by the CDN. Its list is the index file. Neither costs a Worker request.
- **Private** (the default, and proposed for `raw` and `music`): the object goes to `floa-media`. Staff list it through the Worker, and the bytes come from R2 through presigned URLs.
- **The trash is always private**, whatever the folder.

Every Worker answer carries `x-robots-tag: noindex`. The public host gets the same header through a Transform Rule, and presigned URLs are never published.

### Private reads: presigned R2 URLs (PENDING owner: a read-only R2 API token)

`<img>` and `<video>` cannot send `Authorization`, and serving the bytes through the Worker would cost one Worker request per file and per range (300 to 600 for one staff session). So the staff list signs one **presigned GET URL** per private item, locally, with no subrequest:

```
https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/floa-media/<b>/<key>
  ?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=<R2_READ_KEY_ID>/<yyyymmdd>/auto/s3/aws4_request
  &X-Amz-Date=<window start>&X-Amz-Expires=43200&X-Amz-SignedHeaders=host&X-Amz-Signature=<…>
```

- **The credentials** are an R2 API token with **Object Read only, on the bucket `floa-media` only**. The secrets are `R2_READ_KEY_ID` and `R2_READ_SECRET`, and the var is `R2_ACCOUNT_ID`. A leak gives read access to private media and nothing else: no writes, no other bucket.
- **The window is stable.** `X-Amz-Date` is `floor(now / 6 h) * 6 h`, with `X-Amz-Expires` 12 h. A URL is therefore valid 6 to 12 hours from the moment it is listed, and the same URL comes back for 6 hours, which keeps the browser cache working. The list answer carries `expires` (the end of the URLs' life) so the page knows when to list again.
- **There is no single-key renew.** A presigned URL simply expires. The client lists **the same prefix** again when `expires` has passed, or when R2 answers **403** for one of its URLs (e.g. a clock skew, or a rotated token), and replaces its URLs from the new answer. The Worker's `GET /media/<b>/<key>` gives a private key a 404, never a fresh URL.
- **CPU:** the SigV4 signing key is derived once per isolate per day (4 HMACs). Each URL then costs one SHA-256 and one HMAC with `crypto.subtle`. A list page is at most 200 items, so it stays inside the Free plan's 10 ms. The implementer reads the real CPU time in the Worker's logs, and lowers the page size if it comes close.
- **Implementation:** hand-written SigV4 query signing (about 40 lines, plain node `crypto.subtle`, no dependency), or `aws4fetch` if preferred. Names and folders are restricted to `[A-Za-z0-9._-]`, so the canonical URI needs no extra encoding.
- **Range and conditional requests** are R2's own. The Worker serves no bytes at all.
- **Unverified (check after setup):** that the token can presign GET with the `auto` region, and whether R2 honors `response-content-disposition` for a "download" link. Without it, the page saves blobs under its own file name.

The alternative (PENDING): no R2 token, and the Worker streams private bytes itself (`private, no-store`, Range in the Worker). It is simpler on credentials, but every image, track and range request is a Worker request.

### Changing a folder's visibility: `POST /media/<b>/_visibility` (owner)

Body: `{"folder": "<top folder>", "public": true|false}`. Changing visibility means moving the folder's objects between the buckets.

1. The first call sets `settings.moving = {folder, public}`. From then on, uploads, deletes and restores in that folder get 409 `folder_moving`. Lists keep working: they read both buckets, and each item's `url` follows where its object is now.
2. Each call moves **at most 10 objects** and answers `200 {"ok":true,"folder","public","moved":n,"remaining":m,"done":false}`. The caller repeats until `done: true`.
   - **Why 10:** the Free plan allows 50 subrequests per invocation, and R2 calls count. 10 × (head target, get, put, delete) is 40, plus a list, the settings, the index and one purge.
   - For each object: get it, put it into the other bucket with the same `customMetadata` and `contentType`. Going public, it gets `cacheControl: public, max-age=86400`. Going private, the cache header is removed. Then the source is deleted.
   - If the target already holds the same sha256 (a half move), only the source is deleted. A different sha256 stops the move with 409 `conflict`.
3. **Every batch rewrites that folder's public index.** Going public, items appear in it. Going private, they leave it.
   - **Public to private:** the moved URLs and the index URL are purged from the CDN in that call, when `CF_PURGE_TOKEN` is set.
4. The last call writes `public_folders`, clears `moving`, and rewrites `_index/_folders.json`. A call after an interruption simply continues.

For the first business this never has to run: `ads` is created public, so its uploads go to the public bucket from the start.

### CORS

There are no cookies anywhere in the store, only bearer tokens and signed URLs, so CORS is defense in depth.

- **`media.floa.co.il`** (public files and indexes): `access-control-allow-origin: *`, from the bucket's CORS policy and a Transform Rule. See "The public host".
- **The private bucket's presigned URLs:** the bucket's CORS policy (below) allows `GET`/`HEAD` from any origin, with Range. The URL is the credential, so `*` gives nothing away.
- **The Worker, `_admin` and the 301 helper:** `access-control-allow-origin: *`.
- **The Worker, every other route:**
  - The `Origin` must be one of: absent (a script); `^https://([a-z0-9-]+\.)?floa\.co\.il$`; `http://localhost:5173`; or a member of `settings.origins`.
  - Any other origin gets 403 `origin`.
  - An allowed origin is echoed back, with `vary: origin`.
- **Preflight** on any `/media/…`:
  - `access-control-allow-methods: GET, HEAD, PUT, POST, DELETE, OPTIONS`
  - `access-control-allow-headers: authorization, range, content-type, x-media-meta, x-media-index`
  - `access-control-expose-headers: content-length, content-range, accept-ranges, etag, content-type`
  - `access-control-max-age: 86400`

**The page puts `crossorigin="anonymous"`** on every `<img>`, `<video>` and `<audio>` that loads from `media.floa.co.il` or from a presigned URL. The browser's own cache entries are then CORS entries, so a later `fetch()` of the same URL (share, download) works. See the next section for why.

## The public host: `media.floa.co.il`

### What Cloudflare documents (read 2026-11-26)

| topic | what the docs say |
|---|---|
| Custom domain on a bucket | the domain "must have been added as a zone in the same account as the R2 bucket". Added in the dashboard (bucket, Settings, Custom Domains, Add). A custom domain gives the bucket Cloudflare Cache, WAF and Bot Management. `r2.dev` is "rate-limited and should only be used for development purposes" and has no caching (R2 public buckets, 2026-11-12. R2 and Cache, 2026-05-07) |
| Cached by default | by extension. mp4, webm, jpg, jpeg, png, webp, gif, avif, mp3, flac and ogg are. **mov, heic, m4a and wav are not, and neither is JSON.** A Cache Rule makes the rest eligible (default cache behavior, 2026-09-14) |
| Origin TTL | cached when `Cache-Control` has `public` and `max-age` > 0. Never for `private`, `no-store`, `no-cache` or `max-age=0`. With no headers: 200 and 206 for 120 minutes, **404 for 3 minutes** |
| Range | served "from complete or partial cached files" |
| File size | cached up to 512 MB per file on Free, Pro and Business |
| Tiered cache | Smart Tiered Cache is recommended for R2, and is not on by default |
| Purge by URL | available on every plan, Free included. Free: 800 URLs per second, 100 per request, "instantly removed … across all data centers". `POST /zones/{zone_id}/purge_cache` `{"files":[…]}`, permission **Cache Purge** (purge pages 2026-09-29, API reference) |
| Bucket CORS | `AllowedOrigins`, `AllowedMethods`, `AllowedHeaders`, `ExposeHeaders`, `MaxAgeSeconds`. Set in the dashboard JSON, or with `npx wrangler r2 bucket cors set <bucket> --file cors.json` (a different file structure). **Assets cached before a CORS change keep the old headers until refreshed, so purge the hostname after any change.** Presigned URLs used from a browser need bucket CORS rules too (R2 CORS, 2026-09-23. R2 presigned URLs, 2026-11-12) |
| Response header Transform Rules | cannot touch `cf-*` headers. The docs do not say whether they apply to cache hits (verify, setup step 12) |

Reported by the community, not official: R2 sends no `Vary: Origin`. A response to a request without `Origin` (a tag without `crossorigin`) then has no CORS headers, is cached, and Chrome reuses it for a later `fetch()` of the same URL, which then fails CORS. The page both shows files in tags and fetches them as blobs, so this would bite. The constant `*` set by the Transform Rule, together with `crossorigin="anonymous"`, avoids it.

### The configuration

**CORS policy, the same on both buckets** (dashboard JSON):

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["range"],
    "ExposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

The same rule in Wrangler's file format, applied with `npx wrangler r2 bucket cors set <bucket> --file cors.json`:

```json
{ "rules": [ { "allowed": { "origins": ["*"], "methods": ["GET", "HEAD"], "headers": ["range"] },
               "exposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type", "ETag"],
               "maxAgeSeconds": 86400 } ] }
```

**A response header Transform Rule** on `http.host eq "media.floa.co.il"`, which sets on every response:

```
access-control-allow-origin:    *
access-control-expose-headers:  Content-Range, Accept-Ranges, Content-Length, Content-Type, ETag
x-content-type-options:         nosniff
x-robots-tag:                   noindex
cross-origin-resource-policy:   cross-origin
```

`*` is used rather than a list of origins because the bytes are public and no credentials are involved. A constant value is safe to cache with no `Vary`.

**A Cache Rule** on `http.host eq "media.floa.co.il"`: eligible for cache, with the edge TTL taken from the origin's `Cache-Control`. This is what caches `mov`, `heic`, `m4a`, `wav` and the JSON indexes. Turn Smart Tiered Cache on as well.

Each public file is uploaded with `cacheControl: public, max-age=86400`, and each index with `public, max-age=60`. Setup step 12 confirms that the custom domain sends the stored `Cache-Control`.

## The public index (`<b>/_index/<top>.json`)

The list of a public top folder, as a static file on the CDN, so a gallery visit costs no Worker request.

- **The shape is that of the list answer**, so the page reads both the same way. Every `url` in it is the CDN URL:

  ```json
  {"items":[ITEM…], "cursor":null, "generated":"2026-11-26T18:00:00Z"}
  ```

- **Rewritten by the Worker** at the end of every change in that top folder: upload, delete, restore and each visibility batch. It is never edited in place.
  - The Worker lists the folder from the bucket, then writes the whole file with `onlyIf: {etagMatches: <etag read before the list>}`.
  - A concurrent rewrite makes the put fail, and the Worker reads, lists and writes again, up to 3 times with a short backoff.
  - The last successful write therefore always comes from a list taken after every earlier change.
  - R2 allows one write per second to a key, which the same retry absorbs.
- **A bulk upload defers it.** With `X-Media-Index: defer` on each upload, no rewrite happens, and the script calls `POST /media/<b>/_reindex {"folder":"ads"}` once at the end.
- **Freshness:**
  - With `CF_PURGE_TOKEN`, the Worker purges the index URL after each rewrite, in the same purge call as any deleted file, so the edge is fresh at once. Browsers are fresh within 60 seconds.
  - Without the token, the edge and browsers are fresh within 60 seconds.
- **Failure:** if the rewrite still fails, the change itself has succeeded and the answer says `"index":"stale"`. `_check` reports the stale index and `_reindex` repairs it.
- **Size:** about 300 bytes an item, so 332 ads come to about 100 KB, and 5000 items to about 1.5 MB.

## Caching and deletes

**A live key never changes its bytes**, except for data files (below). An upload to an existing name with a different sha256 gets 409, and a name in the trash is reserved too. Every cached copy of a live media key is therefore always right.

**Data files (`<top>/_data/*.json`) do change.**
- A **public** data file lives by a short TTL: `public, max-age=60` at the edge and in the browser.
  - Each write purges the file's URL when `CF_PURGE_TOKEN` is set. A new version is then at the edge at once and in browsers within 60 seconds.
  - Without the token, both take up to 60 seconds.
- A **private** data file is never edge-cached. Its presigned URL reads the current version straight from R2.
  - Because the presigned URL stays the same for its 6 hour window, a staff browser could reuse an old copy from its own cache. So the client fetches private data with `cache: "no-store"`.

**The TTL of a public file is 1 day** (`public, max-age=86400`) at the edge and in the browser. The landing page's visitors arrive from ads and are mostly first-time visitors, so the edge cache is what counts. It holds a file for a day per data center, and Smart Tiered Cache cuts the R2 reads further.

**What a deleted public file does:**

1. The delete moves the object from the public bucket to the private trash at once, and rewrites the index. The gallery stops showing that ad within 60 seconds of the index's TTL, or at once with the purge token.
2. **With `CF_PURGE_TOKEN`** (PENDING owner): the file's URL is purged in the same call. The edge drops it everywhere, and only a browser that already cached it can still show it, for up to 1 day.
   - The token needs only Zone → Cache Purge → Purge on `floa.co.il`. At worst it can empty the zone's cache: a nuisance, not a breach.
3. **Without the token:** the edge can keep serving the file for up to 1 day after its last fetch, and browsers too. Only someone who already holds the URL can see it.
4. After that, the URL is a 404, which the edge caches for about 3 minutes.

**Restore** puts the same bytes back under the same URL, so every cache stays right. A cached 404 can delay its return by up to 3 minutes.

**Purge, and reusing a name:**
- A purge writes the tombstone `<b>/.gone/<key>` in the private bucket. It is empty, and carries `sha256` and `at`.
- An upload of that key **with different bytes within 48 hours** gets 409 `name_recently_used`. 48 hours is twice the TTL, so a cached old file can never be served in place of a new one under the same URL.
- The same bytes are always allowed.
- A name made from the sha256 is safe by construction.
- An expired tombstone is deleted the next time it is checked.

**Private files** are never edge-cached. The S3 endpoint has no CDN in front of it. A trashed or purged private key is gone from R2 at once, and a staff browser may keep its own cached copy.

## Uploads

### Verified limits (read 2026-11-26)

| what | value | source |
|---|---|---|
| Request body | **Free and Pro zones 100 MB**, Business 200 MB. The zone's plan decides, not the Workers plan | Workers limits (2026-11-25) |
| CPU per request | **Free: 10 ms** | Workers limits |
| Subrequests | **Free: 50 per invocation, and R2 binding calls count** | Workers limits |
| Requests per day | **Workers Free: 100,000 for the whole account**, reset at 00:00 UTC | Workers limits |
| Memory | 128 MB per isolate, so bodies are streamed | Workers limits |
| R2 single PUT | up to 5 GiB, not resumable. A stream needs a known length (`Content-Length`) | R2 limits (2026-10-30), R2 Workers API (2026-11-04) |
| R2 `put()` | a `sha256` option "to check the received object's integrity", and `onlyIf` conditions | R2 Workers API |
| R2 binding | no copy and no rename. `list` returns up to 1000 in lexicographic order (with `include`). `delete` takes up to 1000 keys | R2 Workers API |
| R2 writes to one key | 1 per second | R2 limits |
| R2 multipart | parts 5 MiB to 5 GiB, all equal except the last, up to 10,000 parts. Incomplete uploads are aborted after 7 days. Through a Worker, each part is still capped by the body limit | R2 multipart (2026-07-29, 2026-07-31) |
| Presigned URLs | GET, HEAD, PUT and DELETE, up to 7 days, **only on `<account>.r2.cloudflarestorage.com`**. They need an R2 API token, and the binding cannot make them. They are bearer tokens | R2 presigned URLs (2026-11-12) |
| R2 free tier | 10 GB-month, 1 M Class A and 10 M Class B operations a month, free egress, free deletes | R2 pricing (2026-10-30) |

**Confirmed by the coordinator (2026-11-26):** the account is on Workers Free.

**Not verified, to check in the dashboard:**
- the plan of the `floa.co.il` zone (it sets the body limit, and decides whether rate limiting rules exist);
- that `floa.co.il` is a zone in the same account as the buckets.

### One request per file (v1)

```
PUT /media/<b>/<folder>/<name>           (or POST /media/<b>/<folder>/ to be named by the sha256)
Authorization: Bearer <token>
Content-Type: video/mp4
Content-Length: 30408704
X-Media-Meta: <encodeURIComponent(JSON), at most 4 KB>
X-Media-Index: defer                     (optional, bulk uploads only)

<bytes>
```

`X-Media-Meta` holds `{"sha256": required, "title", "copyright", "w", "h", "duration"}`, with the rules of the metadata table. No control, bidi (U+202A to U+202E, U+2066 to U+2069) or zero-width (U+200B to U+200D, U+FEFF) characters are allowed: the same set roster refuses. Unknown keys get `validation`.

The Worker, in order:

1. **Local checks.** It checks the path, name, type, `Content-Length` (411, or 413 over `max_file_bytes`) and the meta, all before any network call.
2. **Staff and settings.** The staff check (cached), then the settings (cached). The top folder picks the bucket. A folder being moved gets 409 `folder_moving`.
3. **The live key** (steps 3 to 5 do not apply under `_data/`, see "Data files"). `head(<b>/<key>)` in the target bucket:
   - the same sha256 answers **`200 {"ok":true,"key","url","size","existing":true}`, without reading the body**;
   - a different sha256 gets 409 `name_taken`.
4. **The trash.** `head(<b>/trash/<key>)`: the same sha256 gets 409 `in_trash`, a different one 409 `name_taken`.
5. **The tombstone.** `head(<b>/.gone/<key>)`: a different sha256 within 48 h gets 409 `name_recently_used`.
6. **The quota, by listing.** It lists `<b>/` in both buckets without `include` (sizes only) and adds up bytes and objects, trash included. Over the quota gets 413 `quota_exceeded`.
7. **The write.** `put(<b>/<key>, request.body, {httpMetadata, customMetadata, sha256, onlyIf: If-None-Match "*"})`.
   - The body streams to R2 and is never read in JS.
   - A hash mismatch gets 400 `checksum_mismatch`, and nothing is stored.
   - The implementer verifies that the binding honors `If-None-Match: *`. If it does not, the remaining race is two uploads of one name in the same second, and R2 refuses a second write to a key within a second anyway.
8. **The index.** For a public folder, the index is rewritten unless the upload said `defer`.
9. **The answer:** `201 {"ok":true,"key","url","size"}`, where `url` is the CDN URL for a public file and a presigned URL for a private one.

### Data files (`<top>/_data/*.json`)

JSON that a page reads at run time.
- **Under a public top folder** it is public, e.g. `ads/_data/ads.json`, `videos.json` and `registry.json`. The ad tools can then publish new ads with a `PUT`, without a site deploy.
- **Under a private top folder** it is staff only, e.g. `raw/_data/links.json`, which holds the relations between raw materials, ads and songs. Those relations name private `raw/` and `music/` items, so the file must never be public. It is stored in the private bucket, like everything else in its folder.

- **Upload:** `PUT /media/<b>/<top>/_data/<name>.json`, staff, `Content-Type: application/json`, at most **1 MiB**.
  - `X-Media-Meta` is optional here. A `sha256` in it is verified by R2, like any other.
  - The Worker does not parse the JSON (CPU). The tool must send valid JSON.
- **A PUT overwrites.** There is **no sha256 dedupe** under `_data/`: no `existing`, no `name_taken`, no `in_trash`, no tombstone check.
  - When a version is already live, it is first moved to the trash at `trash/<top>/_data/<name>.json` with all its metadata. It **replaces** whatever previous version was there, so the trash keeps one previous version per data file.
  - Then the new bytes are put, into the bucket of the top folder. A public one gets `cacheControl: public, max-age=60`. A private one gets no `cacheControl`.
  - Then, for a public data file only, the URL is purged when `CF_PURGE_TOKEN` is set. A private one is never on the CDN.
  - The writing rules (overwrite, previous version to the trash, no dedupe, JSON up to 1 MiB) are the same for public and private data files.
  - Answer: `201 {"ok":true,"key","url","size","replaced":true|false}`.
- **Delete, restore and purge** work as for media. Restoring a data file whose key is live again gets `name_taken`. To roll back, the tool reads the trashed version (from a trash list) and PUTs it again.
- **Data files are not media:** they never appear in `_index/<top>.json` or in an ordinary folder list (`prefix=raw/`, `prefix=ads/` and so on).
- **Reading:**
  - **Public:** anyone, from `https://media.floa.co.il/<b>/<top>/_data/<name>.json`, at zero Worker requests.
  - **Private:** a staff list call whose prefix is **exactly `<top>/_data/`** (e.g. `GET /media/<b>/?prefix=raw/_data/`) returns that folder's data files as items, at one Worker request. The `url` is presigned for a private folder and the CDN URL for a public one, and the same call works for both. The client then fetches the `url` with `cache: "no-store"`.
  - Without staff, this prefix gets 403, even under a public folder: anonymous readers fetch public data files by name.
  - A prefix that starts with `<top>/_data/` and goes further is allowed for staff too (the start of a name), and lists data files only.
  - The renewal rules of presigned URLs apply: when `expires` passes, or on a 403 from R2, list the same prefix again.
- **Requests:** one per data file written. Reading costs zero for public data and one list call per folder for private data.
- R2 allows one write per second to a key. Two quick PUTs of the same file get a retried write, then 429 `rate_limited` at worst.

At most: one Supabase call, three heads, a few lists, one put and the index, well under 50 subrequests. The CPU cost is negligible.

### Later extension: multipart through the Worker (not built)

For files over 90 MiB. The flow:

- `POST /media/<b>/_uploads` starts the upload. Its answer carries a ticket, signed by a new secret `MEDIA_SIGNING_KEY` (24 h, bound to the key, the size and the R2 upload id).
- `PUT …/_uploads/<id>/<n>` sends one part. It needs only the ticket, so there is no Supabase call per part. Parts are 8 to 64 MiB, all equal except the last.
- `POST …/complete` needs a fresh staff token.

The client keeps the etags, because the binding cannot list parts. Each part is one Worker request, so a 300 MB file costs about 19, and that has to be weighed against the daily budget.

**Presigned PUT URLs were not chosen.** They would need a read-write R2 token. Content-Length enforcement is not documented for them, so the quota could only be checked after the bytes arrive.

## Lists (variant B: R2 listing)

**Public top folders:** the page reads `https://media.floa.co.il/<b>/_index/<top>.json`, with **no Worker request**.

**Private top folders and the trash:** `GET /media/<b>/?prefix=<p>&cursor=<c>&limit=<n>`, staff, **one Worker request per page.**

- **`prefix`** (required) starts with a folder (`raw/`, `music/`, `trash/raw/`, `ads/`, …), optionally followed by the start of a name. Ordinary prefixes skip `<top>/_data/`. A prefix of **exactly `<top>/_data/`** (staff only) lists that folder's data files, and nothing else (see "Data files").
- **Source.** The Worker lists the bucket that holds that folder: `list({prefix: "<b>/" + p, include: ["customMetadata", "httpMetadata"], cursor, limit})`. During a move it reads the source bucket and then the target, and the cursor records which one it is in.
- **`limit`** is 1 to 200, default 200. The cap is the presigning CPU, and it covers raw (175) and music (37) in one call each.
  - A public prefix is allowed too, up to 1000, with CDN URLs and no presigning. It serves as a staff fallback, but the page uses the index.
- **Order:** R2's, by key. The page sorts as it likes (e.g. by `uploaded` for the raw collage). Order editing was not asked for.
- **Answer:** `200 {"items":[…],"cursor":"…"|null,"expires":"<ISO>"}`. `expires` is when the presigned URLs end, at least 6 hours away. The item shape is in "Client contract".
- **`private, no-store`.** The page keeps the answer itself, in memory or `sessionStorage`, until `expires` minus 10 minutes. It refreshes only after its own change, so a staff session costs one list call per folder, not one per view.
- **Renewing** means listing the same prefix again, when `expires` has passed or when R2 answers 403 for one of the URLs. There is no route that renews one key.

**Quotas** (`_usage` and each upload) are counted by listing sizes in both buckets, trash included.

## Delete: trash, restore, purge

**The trash is recoverable,** and purge is a separate hard delete.

**Delete,** `DELETE /media/<b>/<key>` or `POST /_delete {"keys":[…up to 8]}` (staff), for each key:
1. If `<b>/trash/<key>` already exists with the same sha256 (a half move), only the source is deleted. A different sha256 gets `conflict`.
2. Otherwise the Worker `get`s the source from whichever bucket holds it, `put`s it into the private bucket at `<b>/trash/<key>`, and deletes the source.
   - **The trash keeps all metadata:** every `customMetadata` field and the `httpMetadata` exactly as they were, plus `trashed`.
   - **The trash key is `trash/<original key>`, nested as it was** (`trash/ads/video/x.mp4`), so the original key is always the trash key without `trash/`.
3. Then, once per call:
   - the indexes of the public folders it touched are rewritten;
   - with `CF_PURGE_TOKEN`, a single purge request covers the deleted public URLs and the rewritten index URLs.
4. The answer for one key (`DELETE`) is `200 {"ok":true,"trash":"trash/<key>"}`. For `_delete` it is `200 {"ok":true,"done":[<key>,…],"failed":[{"key","code"}],"index":"ok"|"stale"}`. `done` holds the original keys, each now at `trash/<key>`. `ok:true` with a non-empty `failed` is a partial success.
5. **If something fails:**
   - A failed put leaves the source untouched.
   - A failed delete is retried once, then logged as `media_orphan` and shown by `_check`. Repeating the call finishes it, because every step can safely be repeated.
6. **Why 8 keys:** 8 × (head, get, put, delete) is 32 subrequests, plus the staff check, the index (head, list, put) and the purge.

**Restore,** `POST /_restore {"keys":[<key>,…up to 8]}` (staff), takes **the same keys that were deleted** (the original keys). A key sent with its `trash/` prefix is accepted as the same key.
- Each item goes back to that same key, into the bucket that the folder's current visibility names, with all its metadata. `trashed` is dropped, and `cacheControl` is set as the target bucket requires.
- If the live key exists with the same sha256, only the trash copy is deleted. A different sha256 gets `name_taken`.
- The answer is `200 {"ok":true,"done":[<key>,…],"failed":[{"key","code"}],"index":"ok"|"stale"}`, with `done` holding the original keys. A partial success is reported the same way as for delete.

**Purge,** `DELETE /media/<b>/trash/<key>` or `POST /_purge {"keys":[<key>,…up to 8]}` (staff), deletes `<b>/trash/<key>` and writes the tombstone. Like restore, `_purge` takes the original keys, and a `trash/` prefix is accepted.
- The single `DELETE` answers `200 {"ok":true,"purged":"trash/<key>"}`.
- `_purge` answers `200 {"ok":true,"done":[<key>,…],"failed":[{"key","code"}]}`, the same shape as delete and restore.
- A key that is not in the trash fails with `not_found`.

**Retention (PENDING owner).** The trash is kept until purged, because raw materials are the owner's originals. An automatic purge after N days is a later decision. Its simplest form is an R2 lifecycle rule per `<b>/trash/` prefix: setup, the owner's word, and no Worker request.

## Ads under variant B

The ads themselves stay defined in the page's static JSON in git (`ads/ads.json`, `videos.json`, `registry.json`): number, text, and the names of their media. The store holds only the media. **An ad is shown only if its media is live in `ads/`, so deleting an ad means trashing its media.** The JSON is never edited to delete.

What the page must do:

1. **Map names to keys.** `ads.json` `file: "ad-01-916.png"` is `ads/img/ad-01-916.png`. `videos.json` `"1": "ad-01-d180a66f.mp4"` is `ads/video/ad-01-d180a66f.mp4`. The bulk upload keeps these names exactly.
   - **The ads' JSON may move into the store** as data files (`ads/_data/ads.json`, `videos.json`, `registry.json`). The page reads them from `https://media.floa.co.il/<b>/ads/_data/<name>.json` and falls back to its bundled copy on a 404. The ad tools then publish a new ad with one PUT per changed file, and no site deploy.
2. **Gallery.** Fetch `https://media.floa.co.il/<b>/_index/ads.json` (no Worker request) and build a set of live keys. Render only ads whose media keys are all in it. Take URLs from `item.url`, or build them as `https://media.floa.co.il/<b>/<key>`.
3. **Delete an ad (staff): one call.** `POST /media/<b>/_delete {"keys":[its video, its image(s)]}`.
   - Remove the ad from view when all its keys are in `done`. With `ok:true` and a non-empty `failed`, that is a partial success: show what is in `done` as deleted, and list the failed keys.
   - Keys in `failed`: show the ad and let the action repeat, which is safe.
4. **Restore an ad.** `POST /_restore` with the same keys that were deleted. To show the trash first, list `trash/ads/` (staff, one call) and strip `trash/` from each key.
5. **Landing page (`?ad=N`).** No Worker request at all. Build the CDN URL from the static JSON name and load it. If it fails to load (404 after a delete), fall back to the default hero.
   - A deleted ad stops landing as soon as its CDN copy is gone: at once with the purge token, within a day without.
6. **Admin actions.** Call `GET /media/<b>/_admin` **only when a FLOA session exists**, once per session (keep the answer in `sessionStorage`). Never call it for an anonymous visitor. Show delete and restore only on `admin: true`.
7. **Fallback.** If the index answers 404 (the store is not on yet), use the static JSON as today.

## Limits

### The Worker's daily budget (the first limit)

**This account is on Workers Free** (confirmed 2026-11-26): **100,000 requests a day for the whole account**, every route together, reset at 00:00 UTC (02:00 in Israel in winter).

**It is already tight.** On 2026-11-26 the Worker had served 44,600 requests by the afternoon, and another session is investigating why. **Above 100,000, every route fails until the reset, the roster API included, and the external AUM site depends on it.**

So the store is designed to add as close to nothing as possible:

| traffic | Worker requests |
|---|---|
| a landing visit (`?ad=N`), anonymous | **0** (CDN only, no `_admin` without a session) |
| a gallery visit, anonymous | **0** (the index comes from the CDN) |
| a gallery visit by staff | **1** (`_admin`, once per session) |
| staff browsing `raw` and `music` | **2** (one list call each; every image, video and track then comes from R2 through presigned URLs) |
| deleting or restoring an ad | **1** (one `_delete` or `_restore` with its keys) |
| an upload | **1** per file |
| the first bulk upload | **545, once** (544 files with `defer`, plus 1 `_reindex`) |
| a visibility move of 332 files | about 34, once (it is not needed for the first business) |

**Rules for every client of the store:**
- **Public reads only through `media.floa.co.il`** (files and indexes), never the Worker's 301 helper.
- **Private reads only through the presigned URLs of a list answer.** Renew them by listing the same prefix again (after `expires`, or on a 403 from R2). There is no single-key renew.
- **One list call per private folder**, kept until `expires`.
- **No polling**, and no "is anything new" loop.
- **`_admin` once per session, and only with a session.**
- **Batch actions on one ad into one call.**
- **The bulk upload runs right after the 00:00 UTC reset,** and not while the budget investigation is open, unless the coordinator says otherwise.

What is left exposed: an outsider can still loop on any Worker URL, including `/media/…` errors, at one request each. That is the same exposure every route on `api.floa.co.il` already has. The store adds no public byte path and no public list path through the Worker. The protections are the owner's choice (PENDING): a WAF rate limiting rule on `api.floa.co.il` (to verify that the zone's plan offers one), or Workers Paid.

### Per business (in `.settings.json`)

| limit | default | answer |
|---|---|---|
| one file | 90 MiB (and never more while uploads are single-request) | 413 `too_large` |
| bytes, live + trash | 5 GiB | 413 `quota_exceeded` |
| items, live + trash | 5000 | 413 `quota_exceeded` |
| keys per batch call | 8 | 400 `bad_request` |
| one data file (`<top>/_data/*.json`) | 1 MiB | 413 `too_large` |
| private list page | 200 | clamped |
| `X-Media-Meta` | 4 KB | 400 `bad_request` |

There are no per-user limits in variant B. They would need state, which belongs to variant A. The limits exist to catch mistakes and a stolen token, not to fence staff in. A stolen token is bounded by the quota and by the daily Worker budget it would itself burn.

### R2 and the CDN

- **Storage:** R2's free 10 GB-month is shared by every bucket of the account, `biodanza-audio` included. The first business is about 0.9 GB.
- **Operations:**
  - the bulk upload costs about 1,600 Class A operations (puts and quota lists) out of 1 M a month;
  - reads are Class B (10 M a month), and only CDN misses and private reads reach R2;
  - deletes are free.
- **The CDN** caches files up to 512 MB each. The largest is 31 MB.

## Scripts: the first bulk upload

The page session's script runs after the route is deployed, right after a 00:00 UTC reset. The recommendation is **one generic `scripts/media-upload.mjs`**, written with the store, which takes the business, the staging manifest and a root folder as arguments. The page session runs it instead of writing its own (the coordinator's call).

**Signing in as staff** (no new secret, no new kind of key):

1. In a **private browser window**, sign in once as the staff account the owner chooses, on any page of the domain's Supabase project.
2. Copy that session's `refresh_token`, then close the window **without signing out**.
3. Put it in `.env` (gitignored) as `MEDIA_REFRESH_TOKEN`. The script trades it for an access token with `POST ${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token` (header `apikey: <anon>`, body `{"refresh_token": …}`). That is a Supabase call, not a Worker request.
4. **Refresh tokens are single use:** reusing one after 10 seconds revokes the whole session (Supabase sessions guide). So the script saves every new refresh token to a gitignored state file before it uses the access token, and refreshes when fewer than 5 minutes are left.
5. A refresh token is not a JWT, so the pre-commit hook will not catch one. It must never leave `.env` and the state file.
6. **Fallback:** an access token pasted at the prompt, good for about an hour.

**The run:**

- **The request for each entry.** A manifest entry `{key, type, width/height, duration, bytes, sha256, title, copyright}` becomes `PUT /media/<b>/<key>`:
  - `Content-Type` = `type`;
  - `Content-Length` = `bytes`;
  - `X-Media-Meta` = `{sha256, title, copyright, w, h, duration}`, with `duration` in seconds;
  - `X-Media-Index: defer`.
- **Skip what is already there.** Before uploading, read each public index from the CDN (free), and list each private folder once (1 request each). Skip every entry whose key is already live with the same sha256. The server would answer `existing` anyway, but every skipped entry saves a Worker request and its bytes.
- **Concurrency and retries.** 4 uploads at once. Retry network errors, 5xx and 429 with backoff (honor `Retry-After`), up to 3 times. Every retry is another Worker request.
- **Refusals.** `409 name_taken`, `in_trash` and `name_recently_used` are reported, and that file is skipped.
- **At the end:** one `POST /_reindex {"folder":"ads"}`, then a table of uploaded, already there, refused and failed. Never a token.

## Files for the implementer

- `worker/src/media/routes.js`: `isMediaPath(pathname)` and `handleMedia(request, env, ctx, doFetch = fetch)`. Plain node, no `cloudflare:workers`.
- `worker/src/media/auth.js`: the `my_businesses` check and its memory cache.
- `worker/src/media/keys.js`: the key, name, folder and type rules, and the settings reader.
- `worker/src/media/presign.js`: SigV4 query presigning for GET, with the daily signing key cached.
- `worker/src/media/store.js`: upload, trash, restore, purge, tombstones, quota by listing, the visibility batches.
- `worker/src/media/index-file.js`: the public index rewrite with `etagMatches` retry, and the CDN purge.
- `worker/src/index.js`: one line in `fetch`, next to the audio and live lines and before the POST-only gate: `if (isMediaPath(path)) return handleMedia(request, env, ctx);`. Shared file, targeted edit only.
- `worker/wrangler.toml`, a targeted edit (shared file):
  - two `[[r2_buckets]]` blocks: `MEDIA` → `floa-media` and `MEDIA_PUBLIC` → `floa-media-public`;
  - in `[vars]`: `MEDIA_PUBLIC_BASE = "https://media.floa.co.il"` and `R2_ACCOUNT_ID`, plus `CF_ZONE_ID` if the purge token is approved.
- `worker/test/media-*.test.js`, and `node --test "worker/test/media-*.test.js"` in `package.json` `"test"` (shared file, targeted edit).
- `scripts/media-upload.mjs`, and its state file's path in `.gitignore` (if confirmed).

## Setup outside the repo (each step is the owner's word, none is done by an agent)

1. **The private bucket.** `cd worker && npx wrangler r2 bucket create floa-media`. No public access.
2. **The public bucket.** `npx wrangler r2 bucket create floa-media-public`. Then in the dashboard: the bucket, Settings, Custom Domains, Add `media.floa.co.il`. This needs `floa.co.il` as a zone in the same account. Leave `r2.dev` disabled.
3. **The CORS policy on both buckets.** The JSON in "The public host", in the dashboard or with `npx wrangler r2 bucket cors set <bucket> --file cors.json`. After any later CORS change, purge `media.floa.co.il`.
4. **A Transform Rule** (response headers) on `media.floa.co.il`: the five headers above.
5. **A Cache Rule** on `media.floa.co.il`: eligible for cache, edge TTL from the origin. Also turn on Smart Tiered Cache.
6. **A read-only R2 API token** (PENDING): R2, Manage API tokens, Create, **Object Read only, on `floa-media` only**. Then:
   - `npx wrangler secret put R2_READ_KEY_ID`
   - `npx wrangler secret put R2_READ_SECRET`
   - the account id goes into `[vars]` as `R2_ACCOUNT_ID` (not secret: it appears in every presigned URL).
7. **Optional, PENDING: a purge token.** An API token with only Zone → Cache Purge → Purge on `floa.co.il`, set with `npx wrangler secret put CF_PURGE_TOKEN`. The zone id goes into `[vars]` as `CF_ZONE_ID`.
8. **Deploy.** `npx wrangler deploy`. Publishing, only when the owner says so.
9. **Turn on the first business.** `PUT https://api.floa.co.il/media/harpatka/_settings`, signed in as the owner, with `{"public_folders":["ads"],"origins":["https://harpatka.co.il","https://www.harpatka.co.il"]}`. The fallback is `npx wrangler r2 object put floa-media/harpatka/.settings.json --file settings.json`.
10. **The first bulk upload,** right after a 00:00 UTC reset, with the staff account the owner picks. Then `_reindex`.
11. **Optional:** a WAF rate limiting rule on `api.floa.co.il`, after checking that the zone's plan has one.
12. **One check after setup:**
    - `curl -sI https://media.floa.co.il/harpatka/ads/video/<a file>` twice. The second shows `cf-cache-status: HIT`, `cache-control: public, max-age=86400` and `access-control-allow-origin: *`.
    - `curl -s -o /dev/null -w "%{http_code}" -H "Range: bytes=0-1"` on the same URL answers `206`.
    - One presigned URL from a staff list opens in a browser tab.

13. **Supabase Redirect URLs** (dashboard, Authentication, URL Configuration). Every host whose page signs people in to the domain's project must be listed, in production and on `localhost:5173`: for the first business `https://harpatka.co.il` and `https://www.harpatka.co.il`. It is a shared resource, so this is the owner's manual step, never an agent's (CLAUDE.md, "ההתחברות שייכת לדומיין").

There is no database step in v1.

## Tests (`worker/test/media-*.test.js`, plain node, part of `npm test`)

One targeted check per rule. The fakes: two in-memory buckets (`head`, `get`, `put` honoring `sha256` and `onlyIf`, `delete`, and `list` with prefix, cursor and include), and `fetch` mocked for `my_businesses` and the purge API.

1. **Keys.** Valid and invalid names: Hebrew, `..`, a leading dot, an extension that is not of its type, the `trash` top folder. Control routes against keys. An unknown type gets 415.
2. **Staff and owner.**
   - A write without a token gets 401, a refused token 401, not staff 403, staff ok.
   - `_admin` without a token answers `{admin:false, owner:false, public_folders:[…]}` and makes no fetch.
   - A token that Supabase rejects (another project's, or a bad signature) gets 401.
   - `_settings` and `_visibility` give non-owner staff 403.
3. **Upload.**
   - The same name and sha256 gets 200 `existing`, with no put.
   - A different sha256 gets 409 `name_taken`. In the trash gets 409.
   - A tombstone under 48 h with different bytes gets 409. Over 48 h it passes.
   - A checksum mismatch gets 400, and nothing is stored.
   - A public folder goes to `MEDIA_PUBLIC` with `cacheControl`, and its index is rewritten. With `defer`, the index is not rewritten.
   - A private folder goes to `MEDIA` without `cacheControl`.
   - Over the quota gets 413. A folder being moved gets 409.
4. **Presign.**
   - A known input gives a known URL (a fixed test vector computed once with an S3 SDK).
   - The same URL comes back within a window, and a different one after.
   - `expires` is between 6 and 12 hours away.
   - No subrequest is made for signing.
5. **Lists.**
   - A private prefix without a token gets 403.
   - A staff list gives presigned URLs, and a public prefix gives CDN URLs.
   - `trash/` needs staff.
   - Metadata comes back decoded, and the cursor passes through.
   - More than 200 items is clamped.
6. **Index.**
   - The rewrite uses `etagMatches`.
   - A concurrent change makes it retry, and the final file holds both items.
   - On a third failure the answer is `"index":"stale"`, and `_reindex` repairs it.
7. **Trash, restore, purge.**
   - `_delete` with 2 keys moves them into the private trash, rewrites the index once, and sends one purge call (only when `CF_PURGE_TOKEN` is set).
   - A repeated delete finishes a half move.
   - Purge writes the tombstone.
   - Restore goes back to the same key, in the bucket of the current visibility, with every metadata field intact. It accepts the key with or without `trash/`.
   - `_delete` with one failing key answers `ok:true` with that key in `failed` and the other in `done`.
   - **Private data files:** a PUT to `raw/_data/links.json` lands in `MEDIA` without `cacheControl`, and calls no purge. `prefix=raw/_data/` from staff lists it with a presigned URL. Without staff it gets 403. `prefix=raw/` does not list it.
   - **Data files:** a second PUT under `ads/_data/` overwrites. The previous version replaces the one in `trash/ads/_data/`, with no `existing` and no 409. The file gets `max-age=60`, and the purge is called. JSON outside `_data/` gets 415.
   - **`_folders.json`:** `_settings` writes it.
   - **No single-key renew:** `GET /media/<b>/<private key>` answers 404.
   - 9 keys get 400.
8. **Visibility move.** 10 per call, `moving` set, uploads refused meanwhile, the settings flipped at the end, resumable.
9. **CORS.**
   - A staff route from a foreign origin gets 403, and a script with no origin passes.
   - `_admin` and the helpers answer `*`.
   - The preflight allows `authorization` and `range`.
10. **No business name in the code.** No file in `worker/src/media/` contains a key of `BUSINESSES` (`src/businesses.js`) as a quoted string.

## Variant A: the database index (a later upgrade, not v1)

Only if title, copyright or order editing, atomic quotas, or per-user limits become wanted. It would add:

- a schema `media` with `settings` (replacing `.settings.json`) and `items`;
  - `items` holds `key`, `folder`, `state`, `type`, `size`, `sha256`, `w`, `h`, `duration`, `title`, `copyright`, `sort`, `uploaded_by` and the times;
  - unique `(business, folder, sha256)` over the live items;
- `security definer` functions that call `roster.can(...)` and answer `{"error": code}`, with RLS on and no policies;
- `media` exposed in PostgREST's `db_schema`.

The routes and answers above stay as they are. Fields and routes are only added (`PATCH` for title, copyright and sort; `PUT /_order`). The public index stays the zero-Worker list. It is a database change, so it needs the owner's approval when it comes.

## Contradictions and open points

1. **`src/biodanza-audio.js` still answers a suffix range wrongly** (as of 2026-11-26, after today's edit that asks R2 for a range only when the request has one). For `bytes=-N` it answers 200 with the full `content-length` but only N bytes of body. The store serves no bytes from the Worker, so it is not affected. Fixing Biodanza is a separate task.
2. **`worker/test/biodanza-audio.test.js` is not run by `npm test`.** The script runs `roster-*` and `live-*` only.
3. **`ALLOWED_ORIGINS` of `/lead` does not cover the first business:** its `lead.origins` is `[]`. The store has its own origin rule.
4. **Stale comments.** `worker/wrangler.toml` and `worker/README.md` ("למה workers.dev ולא api.floa.co.il") say the `floa.co.il` zone is not on Cloudflare. Yet `api.floa.co.il` is a custom domain of this Worker, and `media.floa.co.il` needs the zone in the same account as the buckets.
5. **`roster-test` grants `execute` to `anon`** on its tenancy functions, and `roster` does not. Harmless, noted in passing. The store uses only `roster`.
6. **The business is the roster slug.** A FLOA business without a roster row cannot use the store. Renaming a slug that has media would orphan its prefix in both buckets.
7. **Where the page module (`ads/media-api.js`) assumed something else.** It must adapt to these:
   - **Public files come from `https://media.floa.co.il/<b>/<key>`, not from the Worker.** The Worker's 301 helper works, but it costs a request.
   - **The public list is `https://media.floa.co.il/<b>/_index/<top>.json`**, in the same shape as the list answer, not `GET /media/<b>/?prefix=`. The Worker list is for private folders and the trash, and needs staff.
   - **Private files come from presigned `r2.cloudflarestorage.com` URLs** (`item.url`), not from `/media/<b>/<key>`.
   - **The staff check is `/_admin`**, as the page named it. It answers `{admin, owner, public_folders}`: `owner` and `public_folders` are new. The same `public_folders` are public at `_index/_folders.json`.
   - **List items carry more fields:** `url`, `sha256`, `duration`, `copyright`, `trashed`. Every assumed field is there, under the same name. The answer also has `expires`.
   - **Deleting an ad** is best done with `POST /_delete {keys}` (one request), which answers `{ok, done, failed}`. `DELETE /media/<b>/<key>` with `{ok:true, trash}` still works per key.
   - **Errors carry `ok:false`** and a nested `error` object.
   - **Restore and purge** are `POST /_restore` and `POST /_purge` (or `DELETE /trash/<key>`). They take the original keys.
   - **There is no single-key renew** of a presigned URL. The client lists the prefix again.
   - **`crossorigin="anonymous"`** on every tag that loads a store URL.
8. **For the page session, outside this spec.** Raw iPhone videos are often HEVC `.mov`, which Chrome on Windows cannot play. There are no poster frames in v1, so the collage should use `preload="metadata"`. With presigned URLs, those metadata fetches go to R2 and not to the Worker.
9. **The test Worker** (`floa-lead-test`) binds no media buckets by default, so every `/media/` route answers 503 there.
10. **The daily budget investigation** (another session) may change the timing of the bulk upload and the priority of the rate limiting rule.

### PENDING owner decisions

1. **Visibility:** per top folder, default private. For the first business: `ads` public (on the CDN), `raw` and `music` staff only. Confirm.
2. **The public host:** a public R2 bucket on `media.floa.co.il`, a new public surface on the domain. Confirm the name.
3. **Private reads:**
   - **(recommended)** a read-only R2 API token, with presigned URLs and zero Worker requests per file;
   - or no token, with the Worker serving private bytes, at one Worker request per file and range.
4. **The CDN purge token** (`CF_PURGE_TOKEN`, Cache Purge on `floa.co.il` only):
   - **yes (recommended):** deleted public files and the indexes leave the CDN at once;
   - **no:** files take up to 1 day to leave, and indexes up to 60 s.
5. **Trash retention:** keep until purged (recommended), or automatic after N days (an R2 lifecycle rule, later).
6. **Limits:** 5 GiB and 5000 items per business, 90 MiB per file.
7. **Protecting the daily budget of `api.floa.co.il`:** accept the risk, a WAF rate limiting rule, or Workers Paid. This concerns the whole Worker, not only the store.
8. **The setup steps:**
   - the two buckets, the custom domain, the CORS policies, the Transform Rule and the Cache Rule;
   - the R2 read token (and, if approved, the purge token);
   - the deploy and the first business's settings;
   - which staff account signs in for the bulk upload, and when (after a 00:00 UTC reset);
   - the Supabase Redirect URLs for every host that signs in (`harpatka.co.il`, `www.harpatka.co.il`, and `localhost:5173`).
9. **The test Worker:** store off (default), or test buckets.
10. **Variant A** (the database index) later, only if editing or per-user limits are wanted.
11. **For the coordinator, not the owner:** who writes `scripts/media-upload.mjs`.

## Client contract

What the page module implements exactly:

- **API base:** `https://api.floa.co.il/media/<b>/`
- **Public file base:** `https://media.floa.co.il/<b>/`
- **`<key>`** is always relative to the business: `ads/img/<file>`, `ads/video/<file>`, `raw/<file>`, `music/<file>`, `trash/…`.
- **`TOKEN`** is an access token of **the domain's Supabase project only**. It is the same project on every host, `harpatka.co.il` included. On `floa.co.il` it is `FLOA_AUTH.token()`. Any other project's token gets 401. Each host that signs in must be in that project's Redirect URLs, which is the owner's manual step.
- **Every tag** that loads a store URL has `crossorigin="anonymous"`.

**1. Who is this?** Only when a session exists, and once per session (keep the answer in `sessionStorage`).
```
GET /media/<b>/_admin                         Authorization: Bearer TOKEN
200 {"admin": true|false, "owner": true|false, "public_folders": ["ads"]}
401 {"ok":false,"error":{"code":"unauthorized",…}}    the token was refused: refresh it, or treat as signed out
```
Without a token it answers `{"admin":false,"owner":false,"public_folders":[…]}`. Better still, do not call it: an anonymous page reads `public_folders` from `https://media.floa.co.il/<b>/_index/_folders.json` (item 2).

**2. Public files the page reads (no Worker request, all from the CDN)**
```
GET https://media.floa.co.il/<b>/_index/<top>.json          a public list, e.g. _index/ads.json
200 {"items":[ITEM…], "cursor":null, "generated":"…"}        (max-age 60)

GET https://media.floa.co.il/<b>/_index/_folders.json       which top folders are public
200 {"public_folders":["ads"]}                               (max-age 60, rewritten on every settings change)

GET https://media.floa.co.il/<b>/<top>/_data/<name>.json    a data file, e.g. ads/_data/ads.json
200 <the JSON as uploaded>                                   (max-age 60, purged on write when a purge token exists)

404 on any of them → the store is not on (or the file is not published yet): use the bundled copy
```

**3. A private list or the trash (staff, one Worker request per folder, kept until `expires`).** Data files are never in it, see item 10.
```
GET /media/<b>/?prefix=<p>&cursor=<c>&limit=<n≤200>     Authorization: Bearer TOKEN
200 {"items":[ITEM…], "cursor":"…"|null, "expires":"<ISO>"}
401/403 → not staff        404/405/501 → the store is not on: use your own data
```
**Renewing:** there is no single-key renew. When `expires` has passed, or when R2 answers **403** for any presigned URL, list **the same prefix** again and replace every URL from the new answer.

**The item**, in both lists:
```
ITEM = {"key":"ads/video/ad-01-d180a66f.mp4", "size":30408704, "type":"video/mp4",
        "uploaded":"2026-11-26T18:00:00Z", "sha256":"…", "url":"…",
        "w":1080, "h":1920, "duration":41.233, "title":"…", "copyright":"…", "trashed":"…"}
```
- `w`, `h`, `duration` (in seconds), `title`, `copyright` and `trashed` are present only when known.
- **`url`** is `https://media.floa.co.il/<b>/<key>` for a public file, and a presigned `https://<account>.r2.cloudflarestorage.com/floa-media/<b>/<key>?X-Amz-…` for a private or trashed one. A presigned URL is valid until the list's `expires`.
- **A trashed item** keeps all its metadata. Its key is `trash/<original key>`, nested (e.g. `trash/ads/video/ad-01-d180a66f.mp4`), plus `trashed`.

**4. A file**

Always `item.url`, or for a public key, `https://media.floa.co.il/<b>/<key>` built from the static JSON. Range works, `access-control-allow-origin: *` is always sent, and `fetch()` as a blob works from any origin.

Never `GET /media/<b>/<key>` on the API. For a public key it only redirects, and it costs a Worker request. For a private key it answers 404, because there is no single-key renew.

**5. Delete an ad, or any items (to the trash)**
```
POST /media/<b>/_delete                       Authorization: Bearer TOKEN    {"keys":["ads/video/…","ads/img/…"]}   (≤ 8)
200 {"ok":true, "done":["ads/video/…","ads/img/…"], "failed":[{"key","code"}], "index":"ok"|"stale"}

DELETE /media/<b>/<key>                       (one key, the same effect)
200 {"ok":true, "trash":"trash/<key>"}
```
- `done` holds the keys as deleted, each now at `trash/<key>`.
- **`ok:true` with a non-empty `failed` is a partial success:** show the keys in `done` as deleted and list the failed ones with their codes.
- `ok:false` (a 4xx or 5xx error envelope) means nothing was touched.
- Repeating either call is safe.

**6. Restore**
```
POST /media/<b>/_restore                      Authorization: Bearer TOKEN    {"keys":["ads/video/…",…]}   (≤ 8)
200 {"ok":true, "done":["ads/video/…",…], "failed":[{"key","code"}], "index":"ok"|"stale"}
```
- Send **the same keys that were deleted** (a `trash/` prefix is also accepted).
- Each goes back to that same key, with all its metadata.
- Partial success works as for delete. A restored public file is again at `https://media.floa.co.il/<b>/<key>`, and a private one appears in the next list.

**7. Purge (hard delete, only from the trash)**
```
POST /media/<b>/_purge                        Authorization: Bearer TOKEN    {"keys":["ads/video/…",…]}   (≤ 8, original keys; trash/ accepted)
200 {"ok":true, "done":["ads/video/…",…], "failed":[{"key","code"}]}

DELETE /media/<b>/trash/<key>                 (one key)
200 {"ok":true, "purged":"trash/<key>"}
```

**8. Upload** (the script, and the page if it ever uploads)
```
PUT /media/<b>/<key>                          Authorization: Bearer TOKEN
Content-Type: <type>    Content-Length: <bytes>
X-Media-Meta: encodeURIComponent(JSON.stringify({sha256, title?, copyright?, w?, h?, duration?}))
X-Media-Index: defer                          (bulk only, then POST /media/<b>/_reindex {"folder":"<top>"})
<bytes>
201 {"ok":true, "key", "url", "size"}                       stored
200 {"ok":true, "key", "url", "size", "existing":true}      the same bytes were already there
409 name_taken | in_trash | name_recently_used | folder_moving
```
`POST /media/<b>/<folder>/` with the same headers stores the file under `<first 32 hex of the sha256>.<ext>` and answers the same way.

**9. Publish a data file** (the ad tools)
```
PUT /media/<b>/<top>/_data/<name>.json        Authorization: Bearer TOKEN
Content-Type: application/json    Content-Length: <bytes ≤ 1 MiB>
<the JSON>
201 {"ok":true, "key", "url", "size", "replaced":true|false}
```
- **It always overwrites:** no sha256 dedupe, no `existing`, no 409 for a different version.
- The previous version goes to `trash/<top>/_data/<name>.json`, replacing the one before it.
- **Public top folder** (`ads/_data/…`): readers get the new version within 60 seconds, or at once at the edge when a purge token exists.
- **Private top folder** (`raw/_data/links.json`): stored in the private bucket and never public. Read it as in item 10.
- The writing rules are the same for both.

**10. Read a private data file** (staff, one Worker request per folder)
```
GET /media/<b>/?prefix=raw/_data/              Authorization: Bearer TOKEN     (the prefix is exactly <top>/_data/)
200 {"items":[{"key":"raw/_data/links.json","size":…,"type":"application/json","uploaded":"…","url":"<presigned>"}…],
     "cursor":null, "expires":"<ISO>"}
then: fetch(item.url, {cache: "no-store"}).then(r => r.json())
```
- **`FloaMedia.data()` must use this path for private data.** It must never build a CDN URL for a private folder: there is none, and the file is not public.
- For a public folder, the same call returns CDN URLs, and an anonymous page simply fetches `https://media.floa.co.il/<b>/<top>/_data/<name>.json` (item 2).
- Ordinary lists (`prefix=raw/`) and the indexes never include data files.
- Without staff, the call gets 403.
- When `expires` passes, or on a 403 from R2, list the same prefix again.

**Errors** are always `{"ok":false,"error":{"code","message"[, "field"]}}`, with the codes of the error table.
