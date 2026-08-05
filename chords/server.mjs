// The local server: serves dist/ and lets the app write to songs/.
//
// Run it and the app is fully live: saving a song writes songs/<slug>.json,
// rebuilds the site, and chords/<slug>/ exists as a real page a second later.
// Without it the built site still reads and still edits, it just keeps the
// edits in the browser instead of on disk.
//
//   node chords/server.mjs                       reading, writing, no decoding
//   ANTHROPIC_API_KEY=sk-... node chords/server.mjs      decoding as well

import { createServer } from "node:http";
import { readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";

import { build, DIST, ROOT, SONGS_DIR, loadSongs } from "./build.mjs";
import { normalizeSong, songSummary } from "./lib/song.mjs";
import { slugify } from "./lib/slug.mjs";
import { buildRequest, extractSong, ACCEPTED } from "./lib/decode.mjs";

const PORT = Number(process.env.PORT) || 5175;
const API_KEY = process.env.ANTHROPIC_API_KEY || "";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const send = (res, status, body, type = "application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

const sendJson = (res, status, value) => send(res, status, JSON.stringify(value));

function songPath(slug) {
  const clean = slugify(slug);
  if (!clean) throw new Error("כתובת לא תקינה.");
  return join(SONGS_DIR, `${clean}.json`);
}

async function readBody(req, limit = 40 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error("הקובץ גדול מדי.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// ------------------------------------------------------------------- routes

async function handleApi(req, res, url) {
  const path = url.pathname.replace(/^\/api/, "");

  if (path === "/health") {
    return sendJson(res, 200, { ok: true, canWrite: true, canDecode: !!API_KEY });
  }

  if (path === "/songs" && req.method === "GET") {
    const songs = await loadSongs();
    return sendJson(res, 200, { songs: songs.map(songSummary) });
  }

  const single = path.match(/^\/songs\/(.+)$/);
  if (single) {
    const slug = decodeURIComponent(single[1]);
    const file = songPath(slug);

    if (req.method === "GET") {
      if (!existsSync(file)) return sendJson(res, 404, { error: "השיר לא נמצא." });
      const song = normalizeSong(JSON.parse(await readFile(file, "utf8")), { slug: slugify(slug) });
      return sendJson(res, 200, { song });
    }

    if (req.method === "PUT") {
      const payload = JSON.parse(await readBody(req));
      const song = normalizeSong(payload.song, { slug: slugify(payload.song?.slug || slug) });
      const previous = slugify(payload.previousSlug || "");

      if (previous && previous !== song.slug && existsSync(songPath(previous))) {
        await rm(songPath(previous));
      }
      if (!previous && existsSync(songPath(song.slug))) {
        return sendJson(res, 409, { error: "כבר קיים שיר בכתובת הזאת." });
      }

      await writeFile(songPath(song.slug), JSON.stringify(song, null, 2) + "\n");
      await build();
      return sendJson(res, 200, { song });
    }

    if (req.method === "DELETE") {
      if (existsSync(file)) await rm(file);
      await build();
      return sendJson(res, 200, { ok: true });
    }
  }

  if (path === "/decode" && req.method === "POST") {
    if (!API_KEY) {
      return sendJson(res, 400, {
        error: "לפענוח צריך ANTHROPIC_API_KEY בסביבה של השרת, או מפתח שמור בדפדפן.",
      });
    }
    const media = JSON.parse(await readBody(req));
    if (!ACCEPTED.includes(media.mediaType)) {
      return sendJson(res, 400, { error: "סוג קובץ שאינו נתמך." });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(buildRequest(media)),
    });
    const body = await response.json();
    if (!response.ok) {
      return sendJson(res, 502, { error: body?.error?.message || "הפענוח נכשל." });
    }
    return sendJson(res, 200, { song: normalizeSong(extractSong(body)) });
  }

  return sendJson(res, 404, { error: "אין כזה נתיב." });
}

async function serveStatic(req, res, url) {
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith("/")) path += "index.html";

  const file = join(DIST, normalize(path));
  if (!file.startsWith(DIST)) return send(res, 403, "forbidden", "text/plain");

  if (!existsSync(file)) {
    // A directory without a trailing slash, e.g. /my_song
    const asDir = join(file, "index.html");
    if (existsSync(asDir)) {
      res.writeHead(302, { location: `${url.pathname}/` });
      return res.end();
    }
    return send(res, 404, "לא נמצא", "text/plain; charset=utf-8");
  }

  send(res, 200, await readFile(file), TYPES[extname(file)] || "application/octet-stream");
}

// -------------------------------------------------------------------- boot

const songs = await build();
console.log(`chords: built ${songs.length} songs`);

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: err.message });
  }
}).listen(PORT, () => {
  console.log(`chords: http://localhost:${PORT}/`);
  console.log(`chords: songs in ${SONGS_DIR.replace(ROOT, "chords")}`);
  if (!API_KEY) console.log("chords: no ANTHROPIC_API_KEY, so image and PDF decoding is off");
});
