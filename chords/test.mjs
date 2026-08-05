// node --test chords/test.mjs
//
// The rules a chord chart lives by, checked without a browser: a chord is an
// index into the lyric, that index survives a round trip through the file
// format, it never lands inside a Hebrew letter, and editing the words does
// not knock the chords off the words they belong to.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseLine,
  serializeLine,
  segments,
  parseSong,
  serializeSong,
  snapToGrapheme,
  graphemeStarts,
} from "./lib/chordpro.mjs";
import { normalizeSong } from "./lib/song.mjs";
import { slugify, uniqueSlug } from "./lib/slug.mjs";
import { remapChords } from "./assets/chart.js";

test("a chord marker becomes an index into the lyric", () => {
  const line = parseLine("[C]אַךְ טוֹב [G]וָחֶסֶד");
  assert.equal(line.text, "אַךְ טוֹב וָחֶסֶד");
  assert.deepEqual(line.chords, [
    { i: 0, c: "C" },
    { i: 10, c: "G" },
  ]);
  assert.equal(line.text.slice(10, 12), "וָ");
});

test("a chord after the last word lands at the end of the line", () => {
  const line = parseLine("שלום[Am]");
  assert.equal(line.text, "שלום");
  assert.deepEqual(line.chords, [{ i: 4, c: "Am" }]);
});

test("the inline form survives a round trip, brackets and all", () => {
  for (const source of [
    "[C]hello [G7]world",
    "[Em7]וְשַׁבְתִּי [F]בְּבֵית יְיָ [G]לְאֹרֶךְ [Am]יָמִים",
    "no chords at all",
    "a literal \\[bracket\\] and a [D]chord",
  ]) {
    assert.equal(serializeLine(parseLine(source)), source, source);
  }
});

test("the slices of a line add back up to the line", () => {
  const line = parseLine("A[G]mazing [C]grace");
  assert.equal(segments(line).map((s) => s.text).join(""), line.text);
  assert.deepEqual(
    segments(line).map((s) => s.chord),
    [null, "G", "C"],
  );
});

test("two chords on the same letter both survive, one with an empty slice", () => {
  const line = parseLine("[C][Am]word");
  const parts = segments(line);
  assert.deepEqual(parts.map((s) => s.chord), ["C", "Am"]);
  assert.equal(parts[0].text, "");
  assert.equal(parts.map((s) => s.text).join(""), "word");
});

test("a chord never lands between a letter and its niqqud", () => {
  const text = "אַךְ טוֹב";
  const starts = graphemeStarts(text);
  assert.ok(starts.has(0), "the first letter is a landing spot");
  assert.ok(!starts.has(1), "the vowel under the first letter is not");
  assert.equal(snapToGrapheme(1, text), 0, "an index inside a letter falls back to its start");
  assert.equal(snapToGrapheme(99, text), text.length, "past the end is the end");
});

test("typing at the end of a line leaves every chord alone", () => {
  const chords = [{ i: 0, c: "C" }, { i: 6, c: "G" }];
  assert.deepEqual(remapChords("hello world", "hello world!", chords), chords);
});

test("typing in the middle pushes only the chords after it", () => {
  const chords = [{ i: 0, c: "C" }, { i: 6, c: "G" }];
  const moved = remapChords("hello world", "hello big world", chords);
  assert.deepEqual(moved, [{ i: 0, c: "C" }, { i: 10, c: "G" }]);
});

test("deleting text pulls the chords back with it", () => {
  const chords = [{ i: 0, c: "C" }, { i: 10, c: "G" }];
  const moved = remapChords("hello big world", "hello world", chords);
  assert.deepEqual(moved, [{ i: 0, c: "C" }, { i: 6, c: "G" }]);
});

test("a whole song survives a round trip through the source format", () => {
  const source = [
    "{title: אך טוב וחסד}",
    "{key: Am}",
    "{dir: rtl}",
    "",
    "== פזמון (×3)",
    "[C]אַךְ טוֹב [G]וָחֶסֶד",
    "",
    "== גשר",
    "[Em7]וְשַׁבְתִּי[Am]",
    "",
  ].join("\n");

  const song = parseSong(source);
  assert.equal(song.title, "אך טוב וחסד");
  assert.equal(song.sections[0].repeat, 3);
  assert.equal(song.sections[0].label, "פזמון");
  assert.equal(song.sections[1].repeat, 1);
  assert.equal(serializeSong(song), source);
});

test("a section with a repeat but no name keeps the repeat", () => {
  const song = parseSong("== (x2)\n[C]line");
  assert.equal(song.sections[0].label, "");
  assert.equal(song.sections[0].repeat, 2);
});

test("normalizing accepts the inline strings the decoder returns", () => {
  const song = normalizeSong({
    title: "Test",
    dir: "ltr",
    sections: [{ label: "Verse", repeat: 2, lines: ["A[G]mazing grace"] }],
  });
  assert.deepEqual(song.sections[0].lines[0], {
    text: "Amazing grace",
    chords: [{ i: 1, c: "G" }],
  });
});

test("normalizing keeps a trailing space, because a chord may sit on it", () => {
  const song = normalizeSong({
    title: "T",
    sections: [{ lines: [{ text: "word ", chords: [{ i: 5, c: "C" }] }] }],
  });
  assert.equal(song.sections[0].lines[0].text, "word ");
  assert.deepEqual(song.sections[0].lines[0].chords, [{ i: 5, c: "C" }]);
});

test("normalizing throws away chords with no name and indexes past the line", () => {
  const song = normalizeSong({
    title: "T",
    sections: [{ lines: [{ text: "abc", chords: [{ i: 99, c: "C" }, { i: 1, c: "  " }] }] }],
  });
  assert.deepEqual(song.sections[0].lines[0].chords, [{ i: 3, c: "C" }]);
});

test("a title becomes a URL a person can read", () => {
  assert.equal(slugify("אַךְ טוֹב וָחֶסֶד"), "אך_טוב_וחסד");
  assert.equal(slugify("Amazing Grace"), "amazing_grace");
  assert.equal(slugify('  "Hey, Jude"!  '), "hey_jude");
  assert.equal(slugify("***"), "song");
  assert.equal(uniqueSlug("שיר", ["שיר", "שיר-2"]), "שיר-3");
});
