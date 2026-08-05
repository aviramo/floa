// Drawing a line, and letting you move the chords on it.
//
// The reader and the editor draw the same markup; the editor just makes the
// chord labels grabbable. Dragging never moves a chord to a pixel, it moves
// it to a character: while you drag, a caret shows which character the chord
// will sit on, and the chord itself only jumps when you let go. That is why
// the layout stays still under your finger, and why the result is the same in
// a right-to-left line as in a left-to-right one.

import { segments, sortedChords, graphemeStarts, snapToGrapheme } from "../lib/chordpro.mjs";

// One press of an arrow key moves a chord one letter, which in Hebrew is
// rarely one character.
function stepIndex(text, index, direction) {
  const starts = [...graphemeStarts(text)].sort((a, b) => a - b);
  if (direction < 0) return starts.filter((s) => s < index).pop() ?? 0;
  return starts.find((s) => s > index) ?? text.length;
}

// A chord being named for the first time has no name yet, and a nameless
// chord is not drawn. This stands in until you type: it is invisible, but it
// survives the blank-chord filter so the slot stays on screen.
const DRAFT = "​";

export function lineFragment(line) {
  const frag = document.createDocumentFragment();
  let chordIndex = 0;
  for (const seg of segments(line)) {
    const wrap = document.createElement("span");
    wrap.className = "seg";

    const ch = document.createElement("span");
    ch.className = "ch";
    ch.dir = "ltr";
    if (seg.chord) {
      ch.textContent = seg.chord;
      ch.dataset.ci = String(chordIndex++);
      ch.tabIndex = 0;
      ch.title = "גרירה להזזה, חיצים לכוונון עדין, Enter לשינוי שם, Delete למחיקה";
    }

    const tx = document.createElement("span");
    tx.className = "tx";
    tx.dataset.start = String(seg.start);
    tx.textContent = seg.text;

    wrap.append(ch, tx);
    frag.append(wrap);
  }
  return frag;
}

export function renderLine(el, line) {
  const caret = el.querySelector(".caret");
  el.replaceChildren(lineFragment(line));
  if (caret) el.append(caret);
}

// ------------------------------------------------------- character targets

// Every place a chord could sit, as a screen position. Measured once when a
// drag starts, which is safe precisely because dragging does not reflow.
function measureBoundaries(stage, lineText) {
  const rtl = getComputedStyle(stage).direction === "rtl";
  const allowed = graphemeStarts(lineText);
  const found = new Map();
  const range = document.createRange();

  for (const tx of stage.querySelectorAll(".tx")) {
    const start = Number(tx.dataset.start) || 0;
    const text = tx.textContent ?? "";
    const node = tx.firstChild;

    if (!node || !text.length) {
      const r = tx.getBoundingClientRect();
      remember(found, allowed, start, { x: rtl ? r.right : r.left, mid: (r.top + r.bottom) / 2 }, false);
      continue;
    }

    for (let j = 0; j < text.length; j++) {
      range.setStart(node, j);
      range.setEnd(node, j + 1);
      const r = range.getBoundingClientRect();
      const mid = (r.top + r.bottom) / 2;
      remember(found, allowed, start + j, { x: rtl ? r.right : r.left, mid }, false);
      if (j === text.length - 1) {
        remember(found, allowed, start + text.length, { x: rtl ? r.left : r.right, mid }, true);
      }
    }
  }
  return [...found.values()];
}

function remember(map, allowed, index, point, isEnd) {
  if (!allowed.has(index)) return;
  const existing = map.get(index);
  // A slice's trailing edge and the next slice's leading edge describe the
  // same boundary. Prefer the leading one: it survives a line wrap.
  if (existing && (!existing.isEnd || isEnd)) return;
  map.set(index, { index, ...point, isEnd });
}

function nearestBoundary(points, x, y) {
  if (!points.length) return null;
  let rowMid = points[0].mid;
  let rowGap = Math.abs(points[0].mid - y);
  for (const p of points) {
    const gap = Math.abs(p.mid - y);
    if (gap < rowGap) {
      rowGap = gap;
      rowMid = p.mid;
    }
  }
  let best = null;
  let bestDx = Infinity;
  for (const p of points) {
    if (Math.abs(p.mid - rowMid) > 1) continue;
    const dx = Math.abs(p.x - x);
    if (dx < bestDx) {
      bestDx = dx;
      best = p;
    }
  }
  return best;
}

// --------------------------------------------------------------- the editor

export function attachLineEditor(stage, line, onChange) {
  stage.classList.add("stage");
  let drag = null;
  let caret = null;

  const commit = () => {
    line.chords = sortedChords(line, line.text.length)
      .filter((c) => c.c !== DRAFT)
      .map((c) => ({ i: snapToGrapheme(c.i, line.text), c: c.c }));
    renderLine(stage, line);
    onChange();
  };

  const showCaret = (point) => {
    if (!caret) {
      caret = document.createElement("span");
      caret.className = "caret";
      stage.append(caret);
    }
    const box = stage.getBoundingClientRect();
    caret.style.left = `${point.x - box.left + stage.scrollLeft}px`;
    caret.style.top = `${point.mid - box.top - 14}px`;
    caret.hidden = false;
  };

  const hideCaret = () => {
    if (caret) caret.hidden = true;
  };

  stage.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".chord-input")) return;
    const chip = event.target.closest(".ch[data-ci]");
    drag = {
      ci: chip ? Number(chip.dataset.ci) : -1,
      chip,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      points: measureBoundaries(stage, line.text),
      target: null,
    };
    if (chip) {
      chip.focus();
      event.preventDefault();
    }
  });

  stage.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const travelled =
      Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY);
    if (travelled <= 4) return;
    if (!drag.moved) {
      drag.moved = true;
      drag.chip?.classList.add("dragging");
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        /* capture is a nicety, not a requirement */
      }
    }
    drag.target = nearestBoundary(drag.points, event.clientX, event.clientY);
    if (drag.target) showCaret(drag.target);
  });

  stage.addEventListener("pointerup", (event) => {
    if (!drag) return;
    const gesture = drag;
    drag = null;
    hideCaret();
    gesture.chip?.classList.remove("dragging");

    if (gesture.moved) {
      if (gesture.target && gesture.ci >= 0 && line.chords[gesture.ci]) {
        line.chords[gesture.ci].i = gesture.target.index;
        commit();
      }
      return;
    }

    if (gesture.ci >= 0) {
      editChordName(stage, gesture.ci, line, commit, false);
      return;
    }
    const point = nearestBoundary(gesture.points, event.clientX, event.clientY);
    if (point) addChordAt(stage, line, point.index, commit);
  });

  stage.addEventListener("pointercancel", () => {
    if (!drag) return;
    drag.chip?.classList.remove("dragging");
    drag = null;
    hideCaret();
  });

  stage.addEventListener("keydown", (event) => {
    const chip = event.target.closest?.(".ch[data-ci]");
    if (!chip) return;
    const ci = Number(chip.dataset.ci);
    if (!line.chords[ci]) return;
    const rtl = getComputedStyle(stage).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[event.key];

    if (step) {
      event.preventDefault();
      const next = stepIndex(line.text, line.chords[ci].i, step);
      line.chords[ci].i = next;
      commit();
      focusChordAt(stage, next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      editChordName(stage, ci, line, commit, false);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      line.chords.splice(ci, 1);
      commit();
    }
  });

  renderLine(stage, line);
  return { redraw: () => renderLine(stage, line) };
}

function addChordAt(stage, line, index, commit) {
  line.chords = sortedChords(line, line.text.length).filter((c) => c.c !== DRAFT);
  line.chords.push({ i: index, c: DRAFT });
  line.chords.sort((a, b) => a.i - b.i);
  renderLine(stage, line);
  const ci = line.chords.findIndex((c) => c.c === DRAFT);
  editChordName(stage, ci, line, commit, true);
}

function focusChordAt(stage, index) {
  const chips = [...stage.querySelectorAll(".ch[data-ci]")];
  const match = chips.find((c) => Number(c.nextElementSibling?.dataset.start) === index);
  (match ?? chips[chips.length - 1])?.focus();
}

function editChordName(stage, ci, line, commit, isNew) {
  const chip = stage.querySelector(`.ch[data-ci="${ci}"]`);
  if (!chip || !line.chords[ci]) return;

  const input = document.createElement("input");
  input.className = "chord-input";
  input.dir = "ltr";
  input.value = isNew ? "" : line.chords[ci].c;
  input.placeholder = "Am";
  input.setAttribute("aria-label", "שם האקורד");
  chip.replaceChildren(input);
  input.focus();
  input.select();

  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    const name = input.value.trim();
    if (!save) {
      // Escape: a brand new chord never existed, an old one keeps its name.
      if (isNew) line.chords.splice(ci, 1);
    } else if (name) {
      line.chords[ci].c = name;
    } else {
      line.chords.splice(ci, 1); // cleared the name, so clear the chord
    }
    commit();
  };

  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(false);
    }
  });
  input.addEventListener("blur", () => close(true));
  for (const type of ["pointerdown", "pointerup", "click"]) {
    input.addEventListener(type, (event) => event.stopPropagation());
  }
}

// When the lyric changes under a set of chords, keep each chord on the text it
// was on. Everything before the first edit and after the last one is left
// alone, so typing at the end of a line does not disturb the chords, and
// typing in the middle pushes only what follows.
export function remapChords(oldText, newText, chords) {
  const max = Math.min(oldText.length, newText.length);
  let prefix = 0;
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const delta = newText.length - oldText.length;
  const tailStart = oldText.length - suffix;

  return chords.map((chord) => {
    // A chord sitting exactly where you started typing belongs to the text
    // that follows it, so it travels with that text rather than staying put.
    if (chord.i < prefix) return chord;
    if (chord.i >= tailStart) return { ...chord, i: Math.max(0, chord.i + delta) };
    return { ...chord, i: Math.max(prefix, Math.min(newText.length, chord.i)) };
  });
}
