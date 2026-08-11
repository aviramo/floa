/* Exercises the store an unanswered recording waits in, straight out of the
   shipped app.js: a take is kept on the device until somebody says what to do
   with it, and there is one of them PER SONG.

   THIS IS THE PART THAT CANNOT BE EYEBALLED. Everything else about a take is
   on the screen and says what it is doing; this is a store nobody sees, and
   the two ways it can be wrong both destroy a recording quietly. One is
   answering a take on one song and taking every other song's with it, which is
   what "clear the store" did while there could only ever be one. The other is
   the upgrade: every reader who has a take waiting is about to have their
   store rebuilt underneath them, and a migration that drops it throws away the
   one thing the store exists for.

   Run against the block as it ships, not a copy of it: what is tested is what
   is served. */
import { readFileSync } from "node:fs";

const src = readFileSync("businesses/chords/public/assets/app.js", "utf8");
const start = src.indexOf('var HELD_DB = "chords-held-take";');
const end = src.indexOf("var heldTakes = undefined;");
if (start < 0 || end < 0) throw new Error("could not find the held-take block");
const block = src.slice(start, end);

/* ==========================================================================
   ENOUGH OF A BROWSER'S STORE TO RUN IT.

   Keys, an auto-incrementing one, an index over a field, a cursor that walks
   it, and a transaction that finishes when nothing is pending. Requests land
   on a microtask, one after another, which is the one thing about IndexedDB
   the code under here actually depends on: work started inside a handler
   belongs to the same transaction, and the transaction is over when the last
   of it is done.
   ========================================================================== */
function fakeIndexedDB() {
  const dbs = new Map();

  class Store {
    constructor(name, options) {
      this.name = name;
      this.auto = !!(options && options.autoIncrement);
      this.rows = new Map();
      this.seq = 0;
      this.indexes = new Map();
    }
    get indexNames() {
      const names = [...this.indexes.keys()];
      return { contains: (n) => names.includes(n) };
    }
  }

  class Cursor {
    constructor(rows, tx, request) {
      this.rows = rows; this.tx = tx; this.request = request; this.i = 0;
      this.step();
    }
    step() {
      this.tx.run(() => {
        const row = this.rows[this.i];
        this.request.result = row ? {
          key: row.key, primaryKey: row.primaryKey,
          continue: () => { this.i++; this.step(); },
        } : null;
        return this.request.result;
      }, this.request);
    }
  }

  class Tx {
    constructor(db, mode) {
      this.db = db; this.mode = mode; this.pending = 0; this.over = false;
      this.oncomplete = null; this.onerror = null; this.error = null;
    }
    run(work, request) {
      const req = request || { result: undefined, onsuccess: null };
      this.pending++;
      queueMicrotask(() => {
        try {
          req.result = work();
          if (req.onsuccess) req.onsuccess({ target: req });
        } catch (e) {
          this.error = e;
          if (this.onerror) this.onerror();
          this.over = true;
        }
        this.pending--;
        this.settle();
      });
      return req;
    }
    settle() {
      if (this.over || this.pending) return;
      queueMicrotask(() => {
        if (this.over || this.pending) return;
        this.over = true;
        if (this.oncomplete) this.oncomplete();
      });
    }
    objectStore(name) {
      const store = this.db.stores.get(name);
      if (!store) throw new Error("no store " + name);
      const tx = this;
      const sorted = () => [...store.rows.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
      const holds = (range, value) => !range || range.only === value;
      const through = (index, range) => sorted()
        .filter(([, value]) => holds(range, value && value[index.path]))
        .map(([key, value]) => ({ key: value && value[index.path], primaryKey: key, value: value }));

      return {
        add: (value, key) => tx.run(() => {
          const at = key !== undefined ? key : (store.auto ? ++store.seq : undefined);
          store.rows.set(at, value);
          return at;
        }),
        put: (value, key) => tx.run(() => { store.rows.set(key, value); return key; }),
        get: (key) => tx.run(() => store.rows.get(key)),
        delete: (key) => tx.run(() => { store.rows.delete(key); }),
        clear: () => tx.run(() => { store.rows.clear(); }),
        getAll: () => tx.run(() => sorted().map(([, value]) => value)),
        get indexNames() { return store.indexNames; },
        createIndex: (name, path) => { store.indexes.set(name, { path: path }); },
        index: (name) => {
          const index = store.indexes.get(name);
          if (!index) throw new Error("no index " + name);
          return {
            count: (range) => tx.run(() => through(index, range).length),
            getAll: (range) => tx.run(() => through(index, range).map((row) => row.value)),
            openKeyCursor: (range) => {
              const request = { result: undefined, onsuccess: null };
              new Cursor(through(index, range), tx, request);
              return request;
            },
          };
        },
      };
    }
  }

  class Db {
    constructor(name) { this.name = name; this.version = 0; this.stores = new Map(); }
    get objectStoreNames() {
      const names = [...this.stores.keys()];
      return { contains: (n) => names.includes(n) };
    }
    createObjectStore(name, options) {
      const store = new Store(name, options);
      this.stores.set(name, store);
      return store;
    }
    transaction(names, mode) { return new Tx(this, mode || "readonly"); }
    close() { }
  }

  return {
    /* A store as an older version of the app left it, for the upgrade to find */
    seed(name, version, shape) {
      const db = new Db(name);
      db.version = version;
      Object.keys(shape).forEach((name) => {
        const store = db.createObjectStore(name, { autoIncrement: shape[name].auto });
        (shape[name].rows || []).forEach(([key, value]) => {
          store.rows.set(key, value);
          if (typeof key === "number" && key > store.seq) store.seq = key;
        });
      });
      dbs.set(name, db);
      return db;
    },
    open(name, version) {
      const request = {
        result: null, transaction: null, error: null,
        onupgradeneeded: null, onsuccess: null, onerror: null,
      };
      queueMicrotask(() => {
        let db = dbs.get(name);
        if (!db) { db = new Db(name); dbs.set(name, db); }
        request.result = db;
        const was = db.version;
        if (version > was) {
          const tx = new Tx(db, "versionchange");
          request.transaction = tx;
          db.version = version;
          /* THE UPGRADE FINISHES BEFORE THE DATABASE IS HANDED OVER, which is
             the whole shape of a migration: everything it moves is moved
             before a single line of the app can read any of it. */
          tx.oncomplete = () => { request.transaction = null; if (request.onsuccess) request.onsuccess(); };
          if (request.onupgradeneeded) request.onupgradeneeded({ oldVersion: was, newVersion: version });
          tx.settle();
          return;
        }
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    },
  };
}

function load(store) {
  const held = {};
  const make = new Function("window", "indexedDB", "IDBKeyRange", "out",
    block + "\nout.heldAdd = heldAdd; out.heldRead = heldRead;" +
    "out.heldBits = heldBits; out.heldDrop = heldDrop;");
  make({ indexedDB: store }, store, { only: (v) => ({ only: v }) }, held);
  return held;
}

const tests = [];
const test = (name, run) => tests.push({ name, run });
const same = (got, want, what) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error(what + ": " + a + " ≠ " + b);
};

function meta(song, title) {
  return { song: song, slug: song, title: title, mime: "audio/webm", marks: [], seconds: 1, at: 1 };
}

/* --- TWO SONGS, TWO TAKES, AND NEITHER IS A FACT ABOUT THE OTHER ---------- */
test("a take waits under its own song", async () => {
  const held = load(fakeIndexedDB());
  await held.heldAdd("a1", meta("one", "שיר אחד"));
  await held.heldAdd("a2", meta("one", "שיר אחד"));
  await held.heldAdd("b1", meta("two", "שיר שני"));

  const waiting = await held.heldRead();
  same(Object.keys(waiting).sort(), ["one", "two"], "both songs are waiting");
  same(waiting.one.title, "שיר אחד", "and each knows which song it is of");

  same(await held.heldBits("one"), ["a1", "a2"], "the sound of one, in order");
  same(await held.heldBits("two"), ["b1"], "and of the other, only its own");
});

/* --- AND ANSWERING ONE ANSWERS ONE -------------------------------------- */
test("forgetting one song's take leaves the rest", async () => {
  const held = load(fakeIndexedDB());
  await held.heldAdd("a1", meta("one", "שיר אחד"));
  await held.heldAdd("a2", meta("one", "שיר אחד"));
  await held.heldAdd("b1", meta("two", "שיר שני"));

  await held.heldDrop("one");

  const waiting = await held.heldRead();
  same(Object.keys(waiting), ["two"], "only the answered one is gone");
  same(await held.heldBits("one"), [], "and its sound with it");
  same(await held.heldBits("two"), ["b1"], "and the other is untouched");
});

/* --- A TAKE WITH NO SOUND IS NOT A TAKE ----------------------------------
   The button that offers one is drawn off this answer, and a meta whose pieces
   never landed would draw a button that opens onto nothing. */
test("a meta with no pieces is not waiting", async () => {
  const held = load(fakeIndexedDB());
  await held.heldAdd(null, meta("one", "שיר אחד"));
  same(Object.keys(await held.heldRead()), [], "nothing is offered");
});

/* --- AND A TAKE WITH NO SONG IS NOT WRITTEN AT ALL ------------------------ */
test("a take with no song is not written", async () => {
  const held = load(fakeIndexedDB());
  await held.heldAdd("a1", meta("", ""));
  same(Object.keys(await held.heldRead()), [], "there is nothing to give back");
});

/* --- THE UPGRADE, WHICH IS SOMEBODY'S RECORDING ---------------------------
   The first version kept the one take there could be under the key "held" and
   its sound as bare pieces with nothing on them. Every reader holding one is
   about to open a tab that rebuilds the store. */
test("a take waiting from the first version comes back under its song", async () => {
  const store = fakeIndexedDB();

  /* the store exactly as version one left it: the only take there could be,
     under the key "held", and its sound as bare pieces */
  store.seed("chords-held-take", 1, {
    meta: { auto: false, rows: [["held", meta("one", "שיר אחד")]] },
    bits: { auto: true, rows: [[1, "a1"], [2, "a2"]] },
  });

  /* and the same open every tab does */
  const held = load(store);
  const waiting = await held.heldRead();
  same(Object.keys(waiting), ["one"], "it is still waiting");
  same(waiting.one.title, "שיר אחד", "and still knows its song");
  same(await held.heldBits("one"), ["a1", "a2"], "with every piece of it");
});

let failed = 0;
for (const one of tests) {
  try {
    await one.run();
    console.log("  ok   " + one.name);
  } catch (e) {
    failed++;
    console.log("  FAIL " + one.name + "\n       " + e.message);
  }
}
console.log(failed ? "held: " + failed + " failed" : "held: " + tests.length + " passed");
if (failed) process.exit(1);
