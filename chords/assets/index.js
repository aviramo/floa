import { listSongs, deleteSong, detectMode } from "./store.js";

const rel = window.__REL__ ?? "";
const seeded = window.__SONGS__ ?? [];

const list = document.querySelector("#songs");
const search = document.querySelector("#search");
const banner = document.querySelector("#mode-note");

let songs = [];

async function load() {
  songs = await listSongs(seeded);
  draw();
}

function draw() {
  const needle = (search.value || "").trim().toLowerCase();
  const shown = songs.filter((song) =>
    !needle || `${song.title} ${song.artist}`.toLowerCase().includes(needle),
  );

  list.replaceChildren();
  if (!shown.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.style.display = "block";
    empty.textContent = songs.length ? "אין שיר שמתאים לחיפוש." : "עוד אין שירים. הוסף את הראשון.";
    list.append(empty);
    return;
  }

  for (const song of shown) {
    const item = document.createElement("li");

    const link = document.createElement("a");
    link.className = "name";
    link.href = song.local ? `${rel}view/?song=${encodeURIComponent(song.slug)}` : `${rel}${song.slug}/`;
    link.textContent = song.title;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = [song.artist, `${song.lines} שורות`].filter(Boolean).join(" · ");
    link.append(meta);

    const edit = document.createElement("a");
    edit.className = "btn btn-mini";
    edit.href = song.local
      ? `${rel}new/?song=${encodeURIComponent(song.slug)}`
      : `${rel}${song.slug}/edit/`;
    edit.textContent = "עריכה";

    const remove = document.createElement("button");
    remove.className = "btn btn-mini btn-danger";
    remove.type = "button";
    remove.textContent = "מחיקה";
    remove.addEventListener("click", async () => {
      if (!confirm(`למחוק את "${song.title}"?`)) return;
      remove.disabled = true;
      try {
        await deleteSong(song.slug);
        await load();
      } catch (err) {
        alert(err.message);
        remove.disabled = false;
      }
    });

    item.append(link);
    if (song.key) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = song.key;
      item.append(tag);
    }
    item.append(edit, remove);
    list.append(item);
  }
}

search.addEventListener("input", draw);

detectMode().then(({ mode }) => {
  if (mode === "local") banner.classList.remove("hidden");
});

load().catch((err) => {
  banner.textContent = err.message;
  banner.classList.remove("hidden");
  banner.classList.add("err");
});
