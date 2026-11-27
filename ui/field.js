/* THE FIELD's helper (ui/docs/field.md), served at /field.js. The field itself is CSS (kit.css, .rfield); this file does only what CSS cannot:
   - RosterField.error(ctl, text): puts (or, with an empty text, takes off) the error of a field: aria-invalid on the control, the sentence in
     .rf-err under the line (the warn symbol, then the sentence as text) and aria-describedby. The error comes off by itself at the next typing in that field.
   - data-rf="e" | "v" on the field, only where CSS has no way to know: a rich text box (.rf-rich, contenteditable) whose text is gone but
     a <br> is left, or whose words were written by code. An input or a textarea needs none (:placeholder-shown tells CSS).
   - the end slot (.rf-end, ui/docs/field.md "חריץ הסוף"): a select gets the chevron (expand), a date the calendar, a time the clock, as static icons from
     /icons.svg; a search field (.rfield--search, and only it) gets its clear X (.rf-clear); CSS shows the X only while there is text; a press
     empties it, sends input and focuses it. A unit (.rf-unit) the app writes itself. The layout is all CSS (kit.css).
   - a select opens the kit's menu (RosterMenu, listbox mode) instead of the browser's list: see pick() below.
   - a textarea grows with its text in CSS (field-sizing: content); here only in a browser that does not know field-sizing.
   - a rich text box keeps bold only (ui/docs/format-bubble.md): italic, underline and every other format are blocked (keys and beforeinput), a paste is
     cleaned to plain text and bold, and on touch a small bubble under the selection toggles bold (on a desktop Ctrl+B / Cmd+B, the browser's own).
   - fields drawn later (innerHTML) are picked up by themselves. An app writes no field helper of its own.
   - RosterField.rich: the value of a rich box (plain text, \n, **bold**) and places in it (html, value, text, init, index, point, sel, keep).
   - RosterField.live(ctl, source, key, col, opts) -> { flush, close, base }: a co-edited field (ui/docs/realtime.md "עריכה משותפת"): autosave through
     source.write, conditional on rev, three-way merge, the others' carets and their live words (presence.text, "הקלדה חיה"), a local undo, the queue
     floa.live.q. Needs /live.js (RosterLive).
   - RosterField.inline(btn, textEl, source, key, col, opts) -> { close }: editing a name in place from its pencil ("עריכה במקום מעיפרון").
   No business names, no framework, no inline handlers. */
(function () {
  "use strict";
  var uid = 0;
  var WARN = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#warn"/></svg>';
  var sizing = !!(window.CSS && CSS.supports && CSS.supports("field-sizing", "content"));

  function fieldOf(ctl) { var f = ctl && ctl.parentNode; return f && f.classList && f.classList.contains("rfield") ? f : null; }
  function describe(ctl, id, on) {
    var d = (ctl.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== id; });
    if (on) d.push(id);
    if (d.length) ctl.setAttribute("aria-describedby", d.join(" ")); else ctl.removeAttribute("aria-describedby");
  }

  function error(ctl, text) {
    var f = fieldOf(ctl); if (!f) return;
    var err = f.querySelector(":scope > .rf-err");
    if (!text) {
      ctl.removeAttribute("aria-invalid");
      if (err) { describe(ctl, err.id, false); err.remove(); }
      return;
    }
    if (!err) {
      err = document.createElement("small");
      err.className = "rf-err"; err.id = (ctl.id || "rf" + (++uid)) + "-err"; err.setAttribute("role", "alert");
      f.appendChild(err);
    }
    err.innerHTML = WARN; err.appendChild(document.createTextNode(String(text)));   /* the warn symbol, then the sentence (always as text): an error has no colour of its own (ui/docs/field.md) */
    ctl.setAttribute("aria-invalid", "true");
    describe(ctl, err.id, true);
    if (!ctl.__rfErr) { ctl.__rfErr = 1; ctl.addEventListener("input", function () { if (ctl.getAttribute("aria-invalid") === "true") error(ctl, ""); }); }
  }

  /* a rich text box: empty or not, also when code wrote its words */
  function richSync(el) {
    var f = fieldOf(el); if (!f) return;
    var v = (el.textContent || "").replace(/\s+/g, "") ? "v" : "e";
    if (f.getAttribute("data-rf") !== v) f.setAttribute("data-rf", v);
  }
  function grow(el) {   /* only where field-sizing is not known */
    if (!el.isConnected || !el.offsetParent) return;
    el.style.height = "auto";
    var max = parseFloat(getComputedStyle(el).maxHeight), h = el.scrollHeight + el.offsetHeight - el.clientHeight;
    el.style.height = (isFinite(max) && h > max ? max : h) + "px";
  }

  /* the field's ONE end slot (.rf-end), right after the control, before the help and the error; made when there is none */
  function endOf(f) {
    var end = f.querySelector(":scope > .rf-end");
    if (!end) { end = document.createElement("span"); end.className = "rf-end"; var ctl = f.querySelector(":scope > :is(input, select, textarea)"); f.insertBefore(end, ctl ? ctl.nextSibling : null); }
    return end;
  }
  function setup(el) {
    if (el.__rf) return; el.__rf = 1;
    if (el.classList.contains("rf-rich")) {
      richSync(el);
      el.addEventListener("input", function () { richSync(el); });
      if (window.MutationObserver) new MutationObserver(function () { richSync(el); }).observe(el, { childList: true, characterData: true, subtree: true });
      el.addEventListener("beforeinput", function (e) {   /* bold only: every other format the browser could write is refused (what is seen is what is saved) */
        var t = e.inputType || "";
        if (/^format/.test(t) && (t !== "formatBold" || !boldOk(el))) e.preventDefault();
      });
      el.addEventListener("keydown", function (e) {
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          var k = (e.key || "").toLowerCase(), c = e.code || "";
          if (k === "i" || k === "u" || c === "KeyI" || c === "KeyU" || ((k === "b" || c === "KeyB") && !boldOk(el))) e.preventDefault();   /* the browser's shortcut keys, on any keyboard layout */
        }
      });
    } else if (el.tagName === "SELECT" || (el.tagName === "INPUT" && (el.type === "date" || el.type === "time"))) {   /* a picker: its static icon in the end slot (select: the chevron, date: the calendar, time: the clock); a date or time passes the press to the control, a select opens the kit's menu (pick) */
      var pf = fieldOf(el), name = el.tagName === "SELECT" ? "expand" : el.type === "date" ? "calendar" : "clock";
      if (pf && !pf.querySelector(":scope > .rf-end > .ricon")) {
        var ic = document.createElement("span");
        ic.className = "ricon"; ic.setAttribute("aria-hidden", "true");
        ic.innerHTML = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#' + name + '"/></svg>';   /* the kit's sprite (ui/docs/icon.md) */
        endOf(pf).appendChild(ic);
      }
      if (pf && el.tagName === "SELECT") pick(el, pf);
    } else if (el.tagName === "INPUT") {   /* a search field: the clear X in its end slot (CSS shows it only while there is text) */
      var f = fieldOf(el);
      if (f && !f.querySelector(":scope > .rf-end > .rf-clear")) {
        var label = f.getAttribute("data-clear-label") || "ניקוי";
        var b = document.createElement("button");
        b.type = "button"; b.className = "rbtn rbtn--icon rbtn--muted rf-clear"; b.setAttribute("aria-label", label); b.title = label;
        b.innerHTML = '<svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#x"/></svg>';   /* the kit's sprite (ui/docs/icon.md) */
        b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); el.value = ""; el.dispatchEvent(new Event("input", { bubbles: true })); el.focus(); });
        endOf(f).appendChild(b);
      }
    } else if (el.tagName === "TEXTAREA" && !sizing) {
      el.addEventListener("input", function () { grow(el); });
      grow(el);
    }
  }
  /* A SELECT OPENS THE KIT'S MENU (ui/docs/field.md "שדה בחירה נפתח כתפריט"): the select stays the real control (value, name, form, change) and the only one that takes
     the focus; its list is RosterMenu in listbox mode, built again from its options on every opening. The whole field box opens it (kit.css: the select itself
     takes no press, [aria-haspopup="listbox"]); help, error and note do not. Space, Enter, Alt+Down, Down and Up open it; letters stay the browser's.
     Without /menu.js (loaded before this file) the select keeps the browser's list. */
  function pick(sel, f) {
    if (sel.__rfPick || !window.RosterMenu || sel.multiple || sel.size > 1) return; sel.__rfPick = 1;
    sel.setAttribute("aria-haspopup", "listbox"); sel.setAttribute("aria-expanded", "false");
    function items() {
      var out = [];
      function add(o, off) {
        if (o.hidden) return;
        out.push({ label: o.label, radio: true, check: o.index === sel.selectedIndex, disabled: off || o.disabled, fn: function () {
          if (sel.selectedIndex === o.index) return;   /* the current value only closes */
          sel.selectedIndex = o.index;
          sel.dispatchEvent(new Event("input", { bubbles: true })); sel.dispatchEvent(new Event("change", { bubbles: true }));
        } });
      }
      [].forEach.call(sel.children, function (c) {
        if (c.tagName === "OPTGROUP") { out.push({ sep: true }); [].forEach.call(c.children, function (o) { if (o.tagName === "OPTION") add(o, c.disabled); }); out.push({ sep: true }); }   /* a group: a line before and after it (the menu drops a first, last or doubled line) */
        else if (c.tagName === "OPTION") add(c, false);
      });
      return out;
    }
    function open(touch) {
      if (sel.disabled || sel.getAttribute("aria-expanded") === "true") return;
      if (!items().some(function (it) { return !it.sep && !it.disabled; })) return;   /* nothing that can be chosen: it does not open */
      RosterMenu.open(sel, items, { listbox: true, min: sel, touch: touch });
    }
    var ptr = "";
    f.addEventListener("pointerdown", function (e) { ptr = e.pointerType; });
    f.addEventListener("click", function (e) {
      if (!e.target.closest || e.target.closest(".rf-help, .rf-err, .rf-note")) return;
      e.preventDefault(); e.stopPropagation();   /* the label passes no press to the control; law 17.5: the click that opens does not close */
      var t = e.pointerType || ptr; ptr = "";
      open(t === "touch" || t === "pen");
    });
    sel.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault(); e.stopPropagation(); open(false);
        if (e.key === " ") document.addEventListener("keyup", function eat(u) { if (u.key !== " ") return; document.removeEventListener("keyup", eat, true); u.preventDefault(); }, true);   /* the space's keyup would press the item the focus just moved to */
      }
    });
  }
  /* ---- A RICH TEXT BOX KEEPS BOLD ONLY (ui/docs/format-bubble.md) ---- */
  function richOf(n) {   /* the rich box that can be written in and holds this node, or null */
    var e = n && (n.nodeType === 1 ? n : n.parentElement);
    e = e && e.closest ? e.closest(".rf-rich") : null;
    return e && e.isContentEditable ? e : null;
  }
  function boldOk(el) { var f = fieldOf(el); return el.getAttribute("data-rf-format") !== "none" && !(f && f.getAttribute("data-rf-format") === "none"); }

  /* A PASTE IS CLEANED: plain text and bold, lines as the box's own <br>. Gone: every other format (italic, underline, colour, size, link, image,
     table), invisible characters (zero width, soft hyphen, bidi marks and embeddings), odd spaces (no-break, thin, ideographic: a plain space),
     smart symbols (curly quotes, long dashes, the ellipsis: their plain forms). A joiner inside an emoji stays (it is part of the emoji). */
  var keepZwj = null;
  try { keepZwj = new RegExp("(\\p{Extended_Pictographic}[\\u{1F3FB}-\\u{1F3FF}\\uFE0F]?)\\u200D(?=\\p{Extended_Pictographic})", "gu"); } catch (x) { /* an old browser: every joiner goes */ }
  function cleanText(s) {
    s = String(s || "").replace(/\r\n?|[\u2028\u2029\u0085]/g, "\n").replace(/\uE000/g, "");
    if (keepZwj) s = s.replace(keepZwj, "$1\uE000");
    s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F]/g, "")
      .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\u061C\u00AD\u034F\u180E\uFEFF\uFFF9-\uFFFC]/g, "")   /* zero width, joiners, bidi marks, embeddings and isolates, soft hyphen, object marks */
      .replace(/\uE000/g, "\u200D")
      .replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u00AB\u00BB]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032\u2039\u203A]/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\u2026/g, "...");
    return s;
  }
  var SKIP = /^(SCRIPT|STYLE|TEMPLATE|HEAD|TITLE|META|LINK|NOSCRIPT|IMG|SVG|MATH|IFRAME|OBJECT|EMBED|VIDEO|AUDIO|CANVAS|BUTTON|SELECT|INPUT|TEXTAREA)$/;
  var BLOCK = /^(P|DIV|LI|UL|OL|DL|DT|DD|H[1-6]|BLOCKQUOTE|PRE|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|MAIN|ADDRESS|FIGURE|FIGCAPTION|TABLE|THEAD|TBODY|TFOOT|TR|CAPTION|HR|FORM|FIELDSET|DETAILS|SUMMARY)$/;
  function boldOf(e, b) {   /* <b>, <strong> or a heavy font-weight is bold; a font-weight that says normal undoes it (a copied Google document wraps all in <b style="font-weight:normal">) */
    var w = e.style && e.style.fontWeight;
    if (w) { if (w === "bold" || w === "bolder" || +w >= 600) return true; if (w === "normal" || w === "lighter" || +w > 0) return false; }
    return b || e.tagName === "B" || e.tagName === "STRONG";
  }
  function runsOfHtml(html) {   /* the pasted HTML as runs of { t: text, b: bold }, lines as \n; parsed inert (nothing runs, nothing loads) */
    var doc = new DOMParser().parseFromString(html, "text/html"), runs = [], brk = false, out = "";
    function put(t, b) {
      if (!t) return;
      if (brk && out && out.slice(-1) !== "\n") { runs.push({ t: "\n", b: false }); out += "\n"; }
      brk = false;
      if (out.slice(-1) === "\n" || !out) t = t.replace(/^ +/, "");   /* no space at the start of a line */
      if (!t) return;
      runs.push({ t: t, b: b }); out += t;
    }
    (function walk(n, b, pre) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) put(pre ? c.nodeValue : c.nodeValue.replace(/[ \t\n\r\f]+/g, " "), b);
        else if (c.nodeType === 1) {
          var tag = c.tagName.toUpperCase();
          if (SKIP.test(tag)) continue;
          if (tag === "BR") { brk = false; runs.push({ t: "\n", b: false }); out += "\n"; continue; }
          if (tag === "TD" || tag === "TH") { if (out && !/[\s]$/.test(out)) put(" ", false); }
          var blk = BLOCK.test(tag);
          if (blk) brk = true;
          walk(c, boldOf(c, b), pre || tag === "PRE");
          if (blk) brk = true;
        }
      }
    })(doc.body || doc.documentElement, false, false);
    return runs;
  }
  function pasteHtml(runs, bold) {   /* clean runs as the box's own markup: escaped text, <b> for bold, <br> for a line */
    var merged = [];
    runs.forEach(function (r) {
      var t = cleanText(r.t), b = bold && r.b && /\S/.test(t);
      if (!t) return;
      var last = merged[merged.length - 1];
      if (last && last.b === b) last.t += t; else merged.push({ t: t, b: b });
    });
    var all = merged.map(function (r) { return r.t; }).join("");
    if (!all.replace(/\s+/g, "")) return "";
    var html = merged.map(function (r) {
      var t = r.t.replace(/ {2,}/g, " ").replace(/ +\n/g, "\n").replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }).replace(/\n/g, "<br>");
      return r.b ? "<b>" + t + "</b>" : t;
    }).join("");
    return html.replace(/^(<br>)+|(<br>)+$/g, "");   /* no empty line before or after what was pasted */
  }
  function onPaste(e) {
    var el = richOf(e.target); if (!el) return;
    var cd = e.clipboardData || window.clipboardData; if (!cd) return;
    e.preventDefault(); e.stopPropagation();   /* the kit's paste is the one paste: an app does not paste into the box itself */
    var out = cleanOf(cd, el);
    if (out) insert(el, out);
  }
  function cleanOf(dt, el) {   /* a clipboard or a drag, as the box's own clean markup ("" when nothing is left) */
    var html = dt.getData("text/html"), text = dt.getData("text/plain") || dt.getData("text");
    if (!html && !text) return "";
    return pasteHtml(html ? runsOfHtml(html) : [{ t: text, b: false }], boldOk(el));
  }
  /* A DROP IS CLEANED THE SAME WAY: the dragged words land where they are dropped, as plain text and bold; a move out of a rich box also takes them from there */
  var dragSrc = null;
  function onDragStart(e) { var s = window.getSelection(); dragSrc = richOf(e.target) && s && s.rangeCount && !s.isCollapsed ? s.getRangeAt(0).cloneRange() : null; }
  function caretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    var p = document.caretPositionFromPoint && document.caretPositionFromPoint(x, y); if (!p) return null;
    var r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r;
  }
  function onDrop(e) {
    var el = richOf(e.target); if (!el || !e.dataTransfer) return;
    e.preventDefault(); e.stopPropagation();   /* the browser's drop would bring every format with it */
    var src = dragSrc; dragSrc = null;
    var out = cleanOf(e.dataTransfer, el); if (!out) return;   /* a file, or nothing that is text: nothing lands */
    var at = caretAt(e.clientX, e.clientY);
    if (!at || !el.contains(at.startContainer)) { at = document.createRange(); at.selectNodeContents(el); at.collapse(false); }
    if (src && src.isPointInRange(at.startContainer, at.startOffset)) return;   /* dropped onto itself */
    el.focus({ preventScroll: true });
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(at);
    insert(el, out);
    if (src && !src.collapsed && richOf(src.startContainer)) {   /* a move: the words leave where they were (ranges follow the change) */
      var after = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      s.removeAllRanges(); s.addRange(src); document.execCommand("delete");
      if (after) { s.removeAllRanges(); s.addRange(after); }
    }
  }
  function insert(el, out) {
    if (!document.execCommand("insertHTML", false, out)) {   /* a browser without insertHTML: the same markup, put in by hand */
      var s = window.getSelection(); if (!s || !s.rangeCount) return;
      var r = s.getRangeAt(0); r.deleteContents();
      var frag = r.createContextualFragment(out), last = frag.lastChild; r.insertNode(frag);
      if (last) { r.setStartAfter(last); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  /* THE FORMAT BUBBLE: one bold button under a selection made by touch in a rich box. Not a menu, not a window: no shield, no dim, no focus.
     The look is kit.css (.rfmt); here only hidden, the place (--rplace-t and --rplace-s of the kit's placement, [data-rplace]; by RosterLayout.place with the selection's rectangle, centered, its distance and the bottom bar read off a probe) and aria-pressed. */
  var bub = null, bbtn = null, cur = null, saved = null, ptr = "", ptrBox = null, raf = 0, tk = null;
  function tokens() {
    if (tk) return tk;
    var p = document.createElement("div"); p.className = "rfmt-probe"; p.setAttribute("aria-hidden", "true"); document.body.appendChild(p);
    var cs = getComputedStyle(p);
    tk = { away: parseFloat(cs.width) || 0, barB: parseFloat(cs.height) || 0 };   /* the distance from the selection (--ctl) and the app's bottom bar (--bar-b) */
    p.remove(); return tk;
  }
  function make() {
    if (bub) return bub;
    bub = document.createElement("div"); bub.className = "rfmt"; bub.hidden = true;
    bub.innerHTML = '<button type="button" class="rbtn rbtn--icon" aria-label="הדגשה" title="הדגשה" aria-pressed="false" tabindex="-1"><svg class="rsym" aria-hidden="true" focusable="false"><use href="/icons.svg#bold"/></svg></button>';
    bbtn = bub.firstChild;
    function keep(e) { e.preventDefault(); }   /* the focus stays in the box and the selection does not collapse */
    bub.addEventListener("pointerdown", keep); bub.addEventListener("mousedown", keep); bub.addEventListener("touchend", function (e) { if (e.cancelable) { e.preventDefault(); bold(); } });
    bbtn.addEventListener("click", function (e) { e.preventDefault(); bold(); });
    return bub;
  }
  function bold() {
    var el = cur; if (!el || !el.isConnected) return hide();
    var s = window.getSelection();
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (saved && (!s.rangeCount || s.isCollapsed || richOf(s.anchorNode) !== el)) { s.removeAllRanges(); s.addRange(saved); }
    document.execCommand("bold");   /* on plain words it bolds, on bold words it takes it off; the browser sends input itself */
    bbtn.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
    schedule();
  }
  function hide() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    cur = null; saved = null;
    if (bub && !bub.hidden) bub.hidden = true;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(check); }
  function check() {
    raf = 0;
    var s = window.getSelection();
    var el = s && s.rangeCount && !s.isCollapsed ? richOf(s.anchorNode) : null;
    if (!el || richOf(s.focusNode) !== el || document.activeElement !== el || !boldOk(el) || ptrBox !== el || (ptr !== "touch" && ptr !== "pen")) return hide();
    cur = el; saved = s.getRangeAt(0).cloneRange();
    place(saved.getBoundingClientRect());
  }
  function place(r) {
    if (!r.width && !r.height) return hide();
    var b = make(), t = tokens();
    var host = [].slice.call(document.querySelectorAll("dialog[open]")).pop() || (cur.closest && cur.closest(".rpanel-box")) || document.body;   /* inside the upper popup, or it is drawn under it (like the menu) */
    if (b.parentNode !== host) host.appendChild(b);
    var vv = window.visualViewport, vt = vv ? vv.offsetTop : 0, vh = vv ? vv.height : innerHeight;
    if (r.bottom < vt || r.top > vt + vh) return hide();   /* the selection is out of sight */
    b.hidden = false;
    if (!window.RosterLayout || !RosterLayout.place) return hide();   /* /layout.js is loaded before this file */
    /* the kit's ONE placement (ui/docs/layout.md "מיקום ליד פקד"): centered on the selection, under it (clear of the system's handles, --ctl away, read off the probe)
       or over it when there is no room, inside the window, its bottom the visible window's (the keyboard) or the app's bottom bar, whichever is higher; a transformed dialog is corrected for */
    RosterLayout.place(b, r, { align: "center", gap: t.away, bottom: Math.min(vt + vh, innerHeight - t.barB) });
    bbtn.setAttribute("aria-pressed", String(document.queryCommandState("bold")));
  }
  function bubbleStart() {
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("dragend", function () { dragSrc = null; }, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("selectionchange", schedule);   /* the bubble moves with the handles, in the next frame, no timer */
    document.addEventListener("pointerdown", function (e) {
      if (bub && bub.contains(e.target)) return;
      ptr = e.pointerType || ""; ptrBox = richOf(e.target);
    }, true);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (cur && bub && !bub.hidden) { e.preventDefault(); e.stopPropagation(); hide(); } return; }   /* Escape takes only the bubble, not the popup the box sits in */
      if (/^(Arrow|Home|End|Page)/.test(e.key || "") || ((e.ctrlKey || e.metaKey) && (e.key || "").toLowerCase() === "a")) ptr = "";   /* a selection by keys: a keyboard is at hand, Ctrl+B */
    }, true);
    document.addEventListener("focusout", function (e) { if (cur && e.target === cur && !(bub && e.relatedTarget && bub.contains(e.relatedTarget))) hide(); }, true);
    window.addEventListener("scroll", function () { if (cur) hide(); }, true);
    window.addEventListener("resize", function () { tk = null; if (cur) hide(); });
    if (window.visualViewport) visualViewport.addEventListener("resize", function () { if (cur) hide(); });
  }

  /* ---- THE VALUE OF A RICH TEXT BOX (ui/docs/realtime.md "עריכה משותפת"): plain text, a line is \n, bold is **…**; never HTML ----
     Places (a caret, a selection, the others' carets) are counted in the PLAIN text (no marks), the same way on every client. */
  function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function assign(t) { for (var i = 1; i < arguments.length; i++) { var s = arguments[i]; if (s) for (var k in s) if (own(s, k)) t[k] = s[k]; } return t; }
  function escT(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]; }); }
  function rHtml(v) {
    v = v == null ? "" : String(v);
    var h = escT(v).replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");
    return /\n$/.test(v) ? h + "<br>" : h;   /* an empty last line shows only with the browser's own <br> after it */
  }
  function isBold(e) { var w = e.style && e.style.fontWeight; return e.tagName === "B" || e.tagName === "STRONG" || w === "bold" || +w >= 600; }
  function isBlock(e) { return e.tagName === "DIV" || e.tagName === "P"; }
  /* the words of a box: lines as \n, bold between ** when marks; a [data-mention] element is @ and its text; a <div>/<p> starts a new line; the browser's last <br> is not a line */
  function rWalk(root, marks) {
    var out = "", on = false, last = "";
    function put(s, b) { if (!s) return; if (marks && b !== on) { out += "**"; on = b; } out += s; last = s.slice(-1); }
    (function walk(n, b) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) put(c.nodeValue.replace(/ /g, " "), b);
        else if (c.nodeType === 1) {
          if (c.hasAttribute("data-mention")) { put("@" + c.textContent, b); continue; }
          if (c.tagName === "BR") { put("\n", b); continue; }
          if (isBlock(c) && out && last !== "\n") put("\n", b);
          walk(c, b || isBold(c));
        }
      }
    })(root, false);
    if (on) out += "**";
    var lc = root.lastChild;
    if (lc && lc.nodeType === 1 && lc.tagName === "BR" && out.slice(-1) === "\n") out = out.slice(0, -1);
    return marks ? out.replace(/\*\*\*\*/g, "") : out;
  }
  /* the place of (node, off) in the plain text: the same count as rWalk (a place right after a <br> is on the next line) */
  function rIndex(el, node, off) {
    var n = 0, last = "", done = false;
    (function w(p) {
      var i = 0;
      for (var c = p.firstChild; c; c = c.nextSibling, i++) {
        if (p === node && i === off) { done = true; return; }
        if (c.nodeType === 3) {
          if (c === node) { n += Math.min(off, c.nodeValue.length); done = true; return; }
          n += c.nodeValue.length; if (c.nodeValue) last = c.nodeValue.slice(-1);
        } else if (c.nodeType === 1) {
          if (c.hasAttribute("data-mention")) { n += 1 + c.textContent.length; last = "@"; if (c.contains(node)) { done = true; return; } continue; }
          if (c.tagName === "BR") { n++; last = "\n"; continue; }
          if (isBlock(c) && n && last !== "\n") { n++; last = "\n"; }
          w(c); if (done) return;
        }
      }
      if (p === node && i === off) done = true;
    })(el);
    return n;
  }
  /* the place in the box that is idx characters into the plain text: [node, offset] */
  function rPoint(root, idx) {
    var n = 0, last = "", res = null;
    (function w(p) {
      var i = 0;
      for (var c = p.firstChild; c && !res; c = c.nextSibling, i++) {
        if (c.nodeType === 3) {
          var L = c.nodeValue.length;
          if (idx <= n + L) { res = [c, Math.max(0, idx - n)]; return; }
          n += L; if (L) last = c.nodeValue.slice(-1);
        } else if (c.nodeType === 1) {
          if (c.hasAttribute("data-mention")) { if (idx <= n) { res = [p, i]; return; } n += 1 + c.textContent.length; last = "@"; continue; }
          if (c.tagName === "BR") { if (idx <= n) { res = [p, i]; return; } n++; last = "\n"; continue; }
          if (isBlock(c) && n && last !== "\n") { if (idx <= n) { res = [p, i]; return; } n++; last = "\n"; }
          w(c);
        }
      }
    })(root);
    return res || [root, root.childNodes.length];
  }
  function rSel(el) {
    var s = window.getSelection();
    if (!s || !s.rangeCount || !el.contains(s.anchorNode)) return null;
    var r = s.getRangeAt(0);
    return { a: rIndex(el, r.startContainer, r.startOffset), b: rIndex(el, r.endContainer, r.endOffset) };
  }
  function rSetSel(el, a, b) {
    try { var p = rPoint(el, a), q = rPoint(el, b), rg = document.createRange(); rg.setStart(p[0], p[1]); rg.setEnd(q[0], q[1]); var s = window.getSelection(); s.removeAllRanges(); s.addRange(rg); } catch (x) { /* no caret */ }
  }
  function rKeep(el, v) { var s = document.activeElement === el ? rSel(el) : null; el.value = v; if (s) rSetSel(el, s.a, s.b); }
  function rInit(el) {   /* a box that answers like a textarea: .value (with the marks), Enter is a line break, blur sends change */
    if (el.__rfRich) return; el.__rfRich = 1;
    Object.defineProperty(el, "value", { configurable: true, get: function () { return rWalk(el, true); }, set: function (v) { el.innerHTML = rHtml(v); } });
    el.addEventListener("beforeinput", function (e) { if (e.inputType === "insertParagraph") { e.preventDefault(); document.execCommand("insertLineBreak"); } });
    el.addEventListener("blur", function () { el.dispatchEvent(new Event("change")); });
  }
  /* a place in the marked value <-> in the plain text (the ** pairs are not places) */
  function isMark(v, k) { return v.charCodeAt(k) === 42 && v.charCodeAt(k + 1) === 42; }
  function m2p(v, i) { var p = 0; for (var k = 0; k < i && k < v.length;) { if (isMark(v, k)) { k += 2; continue; } p++; k++; } return p; }
  function p2m(v, p) { var k = 0, n = 0; while (k < v.length && n < p) { if (isMark(v, k)) { k += 2; continue; } n++; k++; } return k; }

  /* ---- THREE-WAY MERGE BY CHARACTERS (ui/docs/realtime.md "מודל המיזוג") ---- */
  /* the changes from a to b, as ranges { a0, a1 (in a), b0, b1 (in b) }: common start and end trimmed, the middle by Myers' diff; a run of 1 or 2 equal letters
     between two changes joins them (a letter diff of two words matches single letters) */
  function hunks(a, b) {
    if (a === b) return [];
    var la = a.length, lb = b.length, p = 0, s = 0;
    while (p < la && p < lb && a.charCodeAt(p) === b.charCodeAt(p)) p++;
    while (s < la - p && s < lb - p && a.charCodeAt(la - 1 - s) === b.charCodeAt(lb - 1 - s)) s++;
    var one = [{ a0: p, a1: la - s, b0: p, b1: lb - s }], A = a.slice(p, la - s), B = b.slice(p, lb - s);
    if (!A.length || !B.length) return one;
    var ops = myers(A, B); if (!ops) return one;
    var out = [], x = 0, y = 0, h = null;
    for (var i = 0; i < ops.length; i++) {
      if (ops[i] === 0) { if (h) { out.push(h); h = null; } x++; y++; continue; }
      if (!h) h = { a0: p + x, a1: p + x, b0: p + y, b1: p + y };
      if (ops[i] === 1) { x++; h.a1++; } else { y++; h.b1++; }
    }
    if (h) out.push(h);
    var j = [];
    out.forEach(function (k) { var l = j[j.length - 1]; if (l && k.a0 - l.a1 <= 2) { l.a1 = k.a1; l.b1 = k.b1; } else j.push(k); });
    return j;
  }
  function myers(A, B) {   /* 0 equal, 1 out of A, 2 into B; null past 1000 edits (one range is enough then) */
    var N = A.length, M = B.length, off = N + M + 1, V = new Int32Array(2 * off + 1), trace = [], MAX = Math.min(N + M, 1000);
    for (var d = 0; d <= MAX; d++) {
      trace.push(V.slice(off - d - 1, off + d + 2));
      for (var k = -d; k <= d; k += 2) {
        var x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1, y = x - k;
        while (x < N && y < M && A.charCodeAt(x) === B.charCodeAt(y)) { x++; y++; }
        V[off + k] = x;
        if (x >= N && y >= M) return back(trace, d, N, M);
      }
    }
    return null;
  }
  function back(trace, D, N, M) {
    var x = N, y = M, ops = [];
    for (var d = D; d > 0; d--) {
      var v = trace[d], k = x - y, lo = v[k - 1 + d + 1], hi = v[k + 1 + d + 1];
      var pk = (k === -d || (k !== d && lo < hi)) ? k + 1 : k - 1, px = v[pk + d + 1], py = px - pk;
      while (x > px && y > py) { ops.push(0); x--; y--; }
      if (x === px) { ops.push(2); y--; } else { ops.push(1); x--; }
    }
    while (x > 0 && y > 0) { ops.push(0); x--; y--; }
    return ops.reverse();
  }
  /* a place in a carried through the change a -> b; right: a place on which the other side inserted moves after what was inserted */
  function mapPos(hs, p, right) {
    var d = 0;
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (p < h.a0 || (p === h.a0 && !(right && h.a0 === h.a1))) break;
      if (p < h.a1) return h.b1;   /* inside a range somebody replaced: after its new words */
      d = h.b1 - h.a1;
    }
    return p + d;
  }
  /* base -> theirs and base -> mine: ranges that do not touch both stay; where they overlap mine wins inside and theirs stays outside. A ** pair the merge broke goes. */
  function merge3(base, theirs, mine) {
    if (mine === base || mine === theirs) return theirs;
    if (theirs === base) return mine;
    var M = hunks(base, mine).map(function (h) { return { a0: h.a0, a1: h.a1, t: mine.slice(h.b0, h.b1), m: 1 }; }), ops = M.slice();
    hunks(base, theirs).forEach(function (h) {
      var t = theirs.slice(h.b0, h.b1);
      /* the same change on both sides (live text: they already have my words, or I have theirs) is one change, never twice; an insertion at the same
         place that holds the other one at its start or end is the longer of the two */
      var tw = M.filter(function (m) { return m.a0 === h.a0 && m.a1 === h.a1; })[0];
      if (tw) {
        if (tw.t === t) return;
        if (h.a0 === h.a1 && tw.t && t) {
          if (t.indexOf(tw.t) === 0 || t.slice(-tw.t.length) === tw.t) { tw.t = t; return; }
          if (tw.t.indexOf(t) === 0 || tw.t.slice(-t.length) === t) return;
        }
      }
      if (h.a0 === h.a1) { if (!M.some(function (m) { return m.a0 < h.a0 && h.a0 < m.a1; })) ops.push({ a0: h.a0, a1: h.a1, t: t, m: 0 }); return; }
      var cuts = [[h.a0, h.a1]];
      M.forEach(function (m) {
        var next = [];
        cuts.forEach(function (c) {
          if (m.a0 === m.a1) { if (m.a0 > c[0] && m.a0 < c[1]) next.push([c[0], m.a0], [m.a0, c[1]]); else next.push(c); return; }
          if (m.a1 <= c[0] || m.a0 >= c[1]) { next.push(c); return; }
          if (m.a0 > c[0]) next.push([c[0], m.a0]);
          if (m.a1 < c[1]) next.push([m.a1, c[1]]);
        });
        cuts = next;
      });
      cuts.forEach(function (c, i) { ops.push({ a0: c[0], a1: c[1], t: i ? "" : t, m: 0 }); });
    });
    ops.sort(function (x, y) { return x.a0 - y.a0 || ((x.a1 > x.a0) - (y.a1 > y.a0)) || (x.m - y.m); });
    var out = "", pos = 0;
    ops.forEach(function (o) { var a0 = Math.max(o.a0, pos); out += base.slice(pos, a0) + o.t; pos = Math.max(pos, o.a1); });
    out += base.slice(pos);
    return fixBold(out);
  }
  function fixBold(s) {
    s = s.replace(/\*\*\*\*/g, "");
    if ((s.match(/\*\*/g) || []).length % 2) { var i = s.lastIndexOf("**"); s = s.slice(0, i) + s.slice(i + 2); }
    return s;
  }

  /* ---- CO-EDITED FIELDS (ui/docs/realtime.md "עריכה משותפת"): RosterField.live and RosterField.inline ----
     A base per field (the last value the server confirmed), saved without a button through the source (source.write: shown at once, the echo held), conditionally
     on the row's rev; a refused save loads the row, merges again and sends again, quietly. What could not be sent waits in the kit's queue on this device
     (localStorage floa.live.q) and goes out when the connection or the sign-in is back. */
  var QK = "floa.live.q", NOTE = { offline: "יישמר כשהחיבור יחזור", signedout: "יישמר אחרי הכניסה", failed: "לא נשמר" };
  var openFields = {};   /* queue id -> 1 while a live field holds it (it sends its own entry) */
  function meId() { var a = window.FLOA_AUTH; return a && a.signedIn() ? a.userId() || "" : ""; }
  function sameV(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
  function qs(m) { return Object.keys(m).map(function (c) { return encodeURIComponent(c) + "=eq." + encodeURIComponent(m[c] == null ? "" : String(m[c])); }).join("&"); }
  function qid(s, t, m, c) { return JSON.stringify([s || "", t, Object.keys(m).sort().map(function (k) { return [k, String(m[k])]; }), c]); }
  function qRead() { try { return JSON.parse(localStorage.getItem(QK) || "{}") || {}; } catch (e) { return {}; } }
  function qWrite(q) { try { if (Object.keys(q).length) localStorage.setItem(QK, JSON.stringify(q)); else localStorage.removeItem(QK); } catch (e) { /* private window: kept in memory only by the field */ } }
  function qPut(id, e) { var q = qRead(); q[id] = e; qWrite(q); }
  function qDel(id) { var q = qRead(); if (own(q, id)) { delete q[id]; qWrite(q); } }
  function errKind(e) {
    if (e && (e.signedOut || e.status === 401)) return "signedout";
    if (e && e.status) return "failed";
    return navigator.onLine === false || (e && e.name === "TypeError") ? "offline" : "failed";
  }
  function R(path, o, schema) { return window.RosterLive.rest(path, o, schema); }
  /* one conditional save: PATCH where the row is still at rev. No row back: somebody saved meanwhile; the row is loaded, merge(row) gives what to send now
     (or undefined: nothing of mine is left) and it is sent again. Resolves to the saved row. Without a rev column: an unconditional PATCH, the last write wins. */
  function saveCond(x, value, rev, merge, tries) {
    var where = "/rest/v1/" + x.table + "?" + qs(x.match), cond = x.revCol && rev != null ? "&" + encodeURIComponent(x.revCol) + "=eq." + encodeURIComponent(String(rev)) : "";
    var body = {}; body[x.col] = value;
    return R(where + cond, { method: "PATCH", json: body, prefer: "return=representation" }, x.schema).then(function (rows) {
      if (Array.isArray(rows) && rows.length) return rows[0];
      var e = new Error("not saved"); e.status = 409;
      if (!cond || (tries | 0) >= 4) throw e;
      return R(where + "&select=*", {}, x.schema).then(function (got) {
        var row = Array.isArray(got) ? got[0] : null;
        if (!row) { e.status = 404; throw e; }
        var next = merge(row);
        if (next === undefined) return row;
        return saveCond(x, next.value, row[x.revCol], merge, (tries | 0) + 1);
      });
    });
  }
  /* the first save of a row that does not exist yet: an upsert on the match columns */
  function upsert(x, value) {
    var body = assign({}, x.create, x.match); body[x.col] = value;
    return R("/rest/v1/" + x.table + "?on_conflict=" + encodeURIComponent(Object.keys(x.match).join(",")), { method: "POST", json: body, prefer: "resolution=merge-duplicates,return=representation" }, x.schema)
      .then(function (rows) { return Array.isArray(rows) ? rows[0] || null : rows; });
  }
  function mergeVal(b, t, m) {
    function str(v) { return v == null || typeof v === "string"; }
    return str(b) && str(t) && str(m) ? merge3(b || "", t || "", m || "") : m;
  }
  /* THE QUEUE: on load, on online and on a sign-in, the entries of the person signed in now (never another's) that no open field holds: the row is loaded,
     merged three ways against the queued base, and saved conditionally. A failure keeps the entry for the next time. */
  var qBusy = false;
  function qFlush() {
    if (qBusy || !window.RosterLive || !RosterLive.rest || navigator.onLine === false) return Promise.resolve();
    var q = qRead(), me = meId(), ids = Object.keys(q).filter(function (id) { return q[id] && q[id].u === me && !openFields[id]; });
    if (!ids.length) return Promise.resolve();
    qBusy = true;
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        var e = q[id], x = { schema: e.s, table: e.t, match: e.m, col: e.c, revCol: e.rc || null, create: e.cr || null };
        function merge(row) { var th = row[e.c]; if (sameV(e.v, e.bv) || sameV(th, e.v)) return undefined; return { value: sameV(th, e.bv) ? e.v : mergeVal(e.bv, th, e.v) }; }
        return R("/rest/v1/" + e.t + "?" + qs(e.m) + "&select=*", {}, e.s).then(function (got) {
          var row = Array.isArray(got) ? got[0] : null;
          if (!row) return e.cr ? upsert(x, e.v) : null;   /* the row is gone: there is nothing to save into */
          var m = merge(row); if (!m) return row;
          return saveCond(x, m.value, x.revCol ? row[x.revCol] : null, merge);
        }).then(function () { qDel(id); }, function () { /* kept: the next connection tries again */ });
      });
    });
    return chain.then(function () { qBusy = false; });
  }

  function live(ctl, source, key, col, o) {
    o = o || {};
    var rich = !!(ctl.classList && ctl.classList.contains("rf-rich"));
    if (rich) rInit(ctl);
    var f = ctl.closest ? ctl.closest(".rfield") : null;
    var delay = o.delay != null ? o.delay : 700, revName = o.rev || "rev", keyCol = source.keyCol || "id";
    var match = o.match || (function () { var m = {}; m[keyCol] = key; return m; })();
    var X = { schema: source.schema || "", table: source.table, match: match, col: col, revCol: null, create: o.create || null };
    var id = qid(X.schema, X.table, match, col), who = meId();
    var known = false, baseVal = null, baseText = "", baseRev = null, startText = now(), last = startText;
    var timer = 0, inflight = null, again = false, state = "", closed = false, note = null, undo = [], redo = [];
    var edited = false;   /* a field saves only after a real edit: typed here, typed before the row came, or a queued edit of mine. Never on bind, never on a repaint */
    /* LIVE TEXT (ui/docs/realtime.md "הקלדה חיה"): my words go out on the presence channel as I type (one message per LT ms at most, the last one always);
       the others' words come in the same way and are merged three ways against what each of them sent before. The database stays the truth: only my own
       edits are saved (typed), an echo that live text already showed only moves the base, and a field with nobody typing goes back to the saved value */
    var LT = 130, SETTLE = 4000, CAP = 20000;   /* LT: the owner's 120 to 150ms (2026-11-26, economy): words go out in groups of about 130ms */
    var typed = false, inN = 0, ltLast = 0, ltFx = 0, ltTimer = 0, ltSent = null, peerBase = {}, heard = [], settleT = 0, composing = false, heldTxt = [];
    function fromV(v, row) { return o.fromValue ? o.fromValue(v, row) : v == null ? "" : String(v); }
    function toV(t) { if (t === "" && own(o, "empty")) return o.empty; return o.toValue ? o.toValue(t) : t; }
    function now() { return ctl.value == null ? "" : String(ctl.value); }
    /* changed from the base: compared as values AND as the base read back through the field (a stored "" and a toV("") of null are the same empty) */
    function dirty() { if (!known) return false; var v = toV(now()); return !sameV(v, baseVal) && !sameV(v, toV(baseText)); }
    function focused() { return document.activeElement === ctl; }
    function getSel() {
      if (!focused()) return null;
      if (!rich) return { a: ctl.selectionStart | 0, b: ctl.selectionEnd | 0 };
      var s = rSel(ctl), v = now(); return s ? { a: p2m(v, s.a), b: p2m(v, s.b) } : null;
    }
    function setSel(s, v) { if (!s) return; if (rich) rSetSel(ctl, m2p(v, s.a), m2p(v, s.b)); else try { ctl.setSelectionRange(s.a, s.b); } catch (x) { /* a type without a selection */ } }
    function peersHere() { return o.presence ? o.presence.peers().filter(function (p) { return p.item === o.item && p.field === o.field; }) : []; }
    var copts = { item: o.item, field: o.field, index: rich ? rIndex : undefined, point: rich ? rPoint : undefined };
    function repaint() { if (o.presence && window.RosterLive && RosterLive.carets) RosterLive.carets(ctl, peersHere(), copts); }
    /* words written by code: my caret and selection carried through the change, and my undo steps too */
    function put(v) {
      var old = now(); if (old === v) return false;
      var s = getSel(), hs = hunks(old, v);
      ctl.value = v; last = now();   /* as the box reads it back (a rich box may write it a little differently) */
      if (s) setSel({ a: mapPos(hs, s.a), b: mapPos(hs, s.b) }, v);
      undo.forEach(function (st) { carry(st, hs, st.ins); }); redo.forEach(function (st) { carry(st, hs, st.del); });
      if (ctl.tagName === "TEXTAREA" && !sizing) grow(ctl);
      repaint();
      return true;
    }
    function carry(st, hs, here) { var a = mapPos(hs, st.pos, true), b = mapPos(hs, st.pos + here.length, false); if (b - a !== here.length) st.bad = true; st.pos = a; }
    /* MY UNDO (ui/docs/realtime.md: Ctrl+Z undoes only what I typed): a step is { pos, del, ins }; typing in a run is one step */
    function record(a, b) {
      if (a === b) return;
      var p = 0, s = 0;
      while (p < a.length && p < b.length && a[p] === b[p]) p++;
      while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      var st = { pos: p, del: a.slice(p, a.length - s), ins: b.slice(p, b.length - s), at: Date.now() }, l = undo[undo.length - 1];
      redo.length = 0;
      if (l && !l.bad && st.at - l.at < 1000 && !/\s$/.test(l.ins)) {
        if (!l.del && !st.del && st.pos === l.pos + l.ins.length) { l.ins += st.ins; l.at = st.at; return; }
        if (!l.ins && !st.ins && st.pos + st.del.length === l.pos) { l.pos = st.pos; l.del = st.del + l.del; l.at = st.at; return; }
      }
      undo.push(st); if (undo.length > 200) undo.shift();
    }
    function step(from, to, type) {
      var v = now();
      while (from.length) {
        var st = from.pop(), here = from === undo ? st.ins : st.del, there = from === undo ? st.del : st.ins;
        if (st.bad || v.slice(st.pos, st.pos + here.length) !== here) continue;   /* somebody else changed those words: that step is gone */
        var nv = v.slice(0, st.pos) + there + v.slice(st.pos + here.length);
        to.push(st); st.at = 0;
        ctl.value = nv; setSel({ a: st.pos + there.length, b: st.pos + there.length }, nv);
        ctl.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: type }));
        return;
      }
    }
    function onKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      var k = (e.key || "").toLowerCase(), z = k === "z" || e.code === "KeyZ", y = k === "y" || e.code === "KeyY";
      if (!z && !y) return;
      e.preventDefault();
      if (z && !e.shiftKey) step(undo, redo, "historyUndo"); else step(redo, undo, "historyRedo");
    }
    function onBefore(e) {
      if (e.inputType === "historyUndo") { e.preventDefault(); step(undo, redo, "historyUndo"); }
      else if (e.inputType === "historyRedo") { e.preventDefault(); step(redo, undo, "historyRedo"); }
    }
    function onInput(e) {
      if (closed) return;
      var v = now();
      if (!/^history/.test((e && e.inputType) || "")) record(last, v);
      if (v !== last) { edited = true; typed = true; inN++; }
      last = v;
      if (o.onLocal) o.onLocal(toV(v));
      repaint();
      if (!known || o.readOnly) return;
      liveOut();
      if (dirty() && !state) setState("pending");
      clearTimeout(timer); timer = setTimeout(save, delay);
    }
    /* my words to the others now, at most one message per LT ms and the last one always (trailing); capped at the field's own length */
    function liveOut() {
      if (!o.presence || !o.presence.text || closed) return;
      var d = Date.now() - ltLast;
      clearTimeout(ltTimer); ltTimer = 0;
      if (d >= LT) liveSend(); else ltTimer = setTimeout(liveSend, LT - d);
    }
    function liveSend() {
      clearTimeout(ltTimer); ltTimer = 0;
      if (closed || !known || !o.presence || !o.presence.text) return;
      var v = now(), cap = ctl.maxLength > 0 ? Math.min(ctl.maxLength, CAP) : CAP;
      if (v === ltSent || v.length > cap) return;   /* nothing new, or too long for the channel: the database carries it */
      var s = focused() ? (rich ? rSel(ctl) : { a: ctl.selectionStart | 0, b: ctl.selectionEnd | 0 }) : null;   /* the caret as the presence counts it (plain text) */
      if (o.presence.text({ item: o.item, field: o.field, v: v, r: baseRev, a: s ? s.a : 0, b: s ? s.b : 0 })) { ltLast = Date.now(); ltSent = v; }
    }
    /* the others' words, as they type: merged with mine against what that tab sent before (or the base), my caret carried, no flash (their caret says who) */
    function onText(t) {
      if (closed || !known || t.item !== o.item || t.field !== o.field || typeof t.v !== "string") return;
      if (composing) { heldTxt.push(t); return; }   /* an IME word in the middle: after it ends */
      /* the base of their words: what that tab sent a moment ago (already on my screen); after a pause, the saved value */
      var pb = peerBase[t.tab], base = pb && Date.now() - pb.at < SETTLE ? pb.t : baseText, cur = now(), merged = merge3(base, t.v, cur);
      peerBase[t.tab] = { t: t.v, r: t.r, at: Date.now() };
      hear(t.v);
      var was = focused(), quiet = Date.now() - ltFx < 2000;
      if (merged !== cur && put(merged)) {
        if (o.onLocal) o.onLocal(toV(now()));
        if (!was && !quiet && f && window.RosterMotion) RosterMotion.change(f);   /* a field I am not in: the change flash, once for a run of their typing */
      }
      ltFx = Date.now();
      if (!dirty() && state === "pending" && !inflight) setState("");
      armSettle();
    }
    function hear(v) { var n = Date.now(); heard = heard.filter(function (h) { return n - h.at < 30000 && h.v !== v; }); heard.push({ v: v, at: n }); if (heard.length > 64) heard.shift(); }
    function heardIt(v) { var n = Date.now(); return heard.some(function (h) { return h.v === v && n - h.at < 30000; }); }
    function liveAhead(rv) { var n = Date.now(); return rv != null && Object.keys(peerBase).some(function (k) { var p = peerBase[k]; return p.r != null && p.r >= rv && n - p.at < SETTLE; }); }
    /* a field that nobody types in any more shows what the database has (the others' words that were never saved go) */
    function armSettle() { clearTimeout(settleT); settleT = setTimeout(settle, SETTLE); }
    function settle() {
      settleT = 0;
      if (closed || !known) return;
      if (inflight || typed || composing) { armSettle(); return; }
      peerBase = {};
      if (now() !== baseText) put(baseText);
      if (state === "pending") setState("");
    }
    /* the quiet status (data-save on .rfield); the line .rf-note says only the exceptions, once per run, never "saved" */
    function setState(s) {
      if (s === state) return;
      state = s;
      if (!f) return;
      if (s) f.setAttribute("data-save", s); else f.removeAttribute("data-save");
      if (NOTE[s] && !note) { note = document.createElement("small"); note.className = "rf-note"; note.setAttribute("data-rf-save", ""); note.setAttribute("role", "status"); f.appendChild(note); }
      if (note) note.textContent = NOTE[s] || "";
    }
    function enqueue() {
      var t = now();
      qPut(id, { s: X.schema, t: X.table, m: match, c: col, rc: X.revCol, cr: o.create || null, bv: baseVal, bt: baseText, r: baseRev, v: toV(t), vt: t, u: who || meId(), at: Date.now() });
    }
    function adopt(row, sent) {   /* the server's word: the new base */
      baseVal = row && own(row, col) ? row[col] : sent;
      baseText = fromV(baseVal, row);
      baseRev = row && X.revCol && own(row, X.revCol) ? row[X.revCol] : baseRev;
    }
    function remerge(row) {   /* a refused save: what the row has now, merged with mine, into the field (no flash), and sent again */
      var th = row[col], tt = fromV(th, row), merged = merge3(baseText, tt, now());
      baseVal = th; baseText = tt; baseRev = X.revCol ? row[X.revCol] : null;
      put(merged);
      var v = toV(merged);
      return sameV(v, th) ? undefined : { value: v };
    }
    function save() {
      clearTimeout(timer); timer = 0;
      if (!known || o.readOnly) return Promise.resolve();
      if (inflight) { again = true; return inflight; }
      if (!edited || !typed || !dirty()) { if (!dirty()) typed = false; if (state === "pending") setState(""); return Promise.resolve(); }   /* nothing typed: nothing sent (no write storm from a bind, a repaint, or the others' live words: they save their own) */
      if (o.required && !now().trim()) return Promise.resolve();   /* a name that must have a value is not saved empty */
      if (who && meId() !== who) { enqueue(); setState("signedout"); return Promise.resolve(); }
      if (navigator.onLine === false || !window.RosterLive || !RosterLive.rest) { enqueue(); setState("offline"); return Promise.resolve(); }
      var row = source.get(key), create = !row && !!o.create;
      if (!row && !create) { enqueue(); setState("failed"); return Promise.resolve(); }
      if (create && !now().trim()) { qDel(id); setState(""); return Promise.resolve(); }   /* a row is never created to hold an empty value */
      X.revCol = row && own(row, revName) ? revName : null;
      var value = toV(now()), patch = {}; patch[col] = value;
      if (create) patch = assign({}, o.create, match, patch);
      if (!state || state === "pending") setState("pending");
      liveSend();   /* the others already have exactly what is saved now, so its echo moves nothing on their screen */
      var sentN = inN;
      inflight = source.write(key, patch, function () {
        return (create ? upsert(X, value) : saveCond(X, value, X.revCol ? baseRev : null, remerge)).then(function (srow) {
          if (srow && !X.revCol && own(srow, revName)) X.revCol = revName;
          adopt(srow, value);
          return srow ? [srow] : [];
        }, function (e) { if (e && typeof e === "object") e.liveKept = true; throw e; });   /* kept in floa.live.q by this field, not in the app's queue */
      }).then(function () {
        inflight = null;
        var a = again; again = false;
        if (inN === sentN) typed = false;   /* nothing typed since this save left: all of mine is in the database */
        if (dirty() && typed) { enqueue(); if (a || !timer) return save(); }
        else { qDel(id); setState(""); }
      }, function (err) {
        inflight = null; again = false;
        enqueue(); setState(errKind(err));
        if (errKind(err) === "signedout" && window.RosterApp && RosterApp.session && RosterApp.session.failed) RosterApp.session.failed({ signedOut: true });   /* the session ended: the kit's sign-in window (ui/docs/app-session.md); the change itself is already in floa.live.q, not in the app's queue */
      });
      return inflight;
    }
    function flush(n) {
      return Promise.resolve(save()).then(function () { if ((inflight || (timer && dirty())) && (n | 0) < 5) return flush((n | 0) + 1); }).then(null, function () { /* the state line says it */ });
    }
    /* the source: a value from somebody else into a field I do not change, or merged with mine when I do */
    function onSource(ev) {
      if (closed) return;
      var rows = source.rows(); if (rows === null) return;
      var row = source.get(key);
      if (!known) { if (row || o.create) init(row || null); return; }
      if (!row) return;
      var v = row[col], rv = own(row, revName) ? row[revName] : null;
      if (rv != null && baseRev != null && rv < baseRev) return;   /* an older copy than the one the server already gave me */
      if (sameV(v, baseVal)) { if (rv != null) baseRev = rv; return; }
      if (inflight || (ev && ev.origin === "local" && dirty())) return;   /* my own write on its way */
      var th = fromV(v, row);
      if (th !== now() && (heardIt(th) || liveAhead(rv))) {   /* the echo of words that live text already showed (or older than it): the base moves, the screen does not */
        baseVal = v; baseText = th; baseRev = rv;
        if (!dirty() && state === "pending") setState("");
        armSettle();
        return;
      }
      if (!dirty()) {
        var was = focused(), changed;
        baseVal = v; baseText = th; baseRev = rv;
        changed = put(th);
        if (changed && !was && f && ev && ev.origin === "remote" && window.RosterMotion && !RosterMotion.burst(ev)) RosterMotion.change(f);
        return;
      }
      var merged = merge3(baseText, th, now());
      baseVal = v; baseText = th; baseRev = rv;
      put(merged);   /* their words in their place, mine kept, no flash: their caret says who and where */
      if (dirty()) { clearTimeout(timer); timer = setTimeout(save, delay); } else if (state === "pending") setState("");
    }
    function init(row) {
      known = true;
      baseVal = row ? row[col] : own(o, "empty") ? o.empty : null;
      baseText = fromV(baseVal, row);
      baseRev = row && own(row, revName) ? row[revName] : null;
      var q = qRead()[id], mine = now(), text = baseText;
      if (q && q.u === (who || meId())) { text = merge3(q.bt == null ? baseText : q.bt, baseText, q.vt == null ? "" : q.vt); edited = true; }   /* my words from the queue, after a reload */
      else if (mine !== startText) { text = merge3(startText, baseText, mine); edited = true; }   /* typed before the row came */
      else if (sameV(toV(mine), baseVal) || sameV(toV(mine), toV(baseText))) text = mine;   /* what the app drew is already the value */
      put(text); last = now(); typed = edited;
      if (edited && dirty()) { setState("pending"); save(); }   /* only a real edit is sent; binding to a row never writes */
    }
    function onOnline() { if (state === "offline" || state === "failed") save(); }
    function onStorage(e) { if (e.key === "floa.session" && state === "signedout" && meId() === who) save(); }

    if (window.RosterApp && RosterApp.net) RosterApp.net.queue = true;   /* this page keeps co-edited changes in floa.live.q: the offline line says they will be saved (ui/docs/app-offline.md) */
    var offSrc = source.on(onSource), offPres = null;
    if (!o.readOnly) {
      ctl.addEventListener("input", onInput); ctl.addEventListener("blur", save);
      ctl.addEventListener("beforeinput", onBefore); ctl.addEventListener("keydown", onKey);
    }
    window.addEventListener("online", onOnline); window.addEventListener("storage", onStorage);
    if (o.presence && o.presence.attach) offPres = o.presence.attach(ctl, copts);
    /* the others' live words (the same channel as the carets); none: no channel, refused or offline, and the field waits for the database as before */
    var offTxt = o.presence && o.presence.onText ? o.presence.onText(onText) : null;
    function onCompStart() { composing = true; }
    function onCompEnd() { composing = false; var h = heldTxt; heldTxt = []; h.forEach(onText); }
    ctl.addEventListener("compositionstart", onCompStart); ctl.addEventListener("compositionend", onCompEnd);
    openFields[id] = (openFields[id] || 0) + 1;
    onSource(null);
    return {
      flush: function () { return flush(0); },
      base: function () { return baseText; },
      close: function () {
        if (closed) return;
        if (dirty() && !inflight) save();
        if (ltTimer) liveSend();
        closed = true; clearTimeout(timer); clearTimeout(ltTimer); clearTimeout(settleT);
        if (offTxt) offTxt();
        ctl.removeEventListener("compositionstart", onCompStart); ctl.removeEventListener("compositionend", onCompEnd);
        offSrc();
        ctl.removeEventListener("input", onInput); ctl.removeEventListener("blur", save);
        ctl.removeEventListener("beforeinput", onBefore); ctl.removeEventListener("keydown", onKey);
        window.removeEventListener("online", onOnline); window.removeEventListener("storage", onStorage);
        if (offPres) offPres();
        if (--openFields[id] <= 0) delete openFields[id];
      }
    };
  }

  /* EDITING IN PLACE FROM A PENCIL (ui/docs/realtime.md "עריכה במקום מעיפרון"): only the pencil starts it; the name's text becomes a one-line field of the kit
     (.rfield--inline, the name's own typography) bound with live(); Enter or blur ends it, Escape puts back the value from the start. While not editing the
     text follows the source (RosterLive.bind: the change flash for others). */
  function inline(btn, textEl, source, key, col, o) {
    o = o || {};
    var unbind = null, h = null, wrap = null, input = null, startText = "", closed = false;
    function fromV(v, row) { return o.fromValue ? o.fromValue(v, row) : v == null ? "" : String(v); }
    function bindText() { if (window.RosterLive) unbind = RosterLive.bind(textEl, source, key, function (row) { return row ? fromV(row[col], row) : undefined; }); }
    function stop(e) { e.stopPropagation(); }   /* the press belongs to the pencil: no swipe, no press on the name */
    function onClick(e) { e.preventDefault(); e.stopPropagation(); begin(); }
    function onKey(e) {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); end(false); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(true); }
    }
    function onBlur() { end(false); }
    function begin() {
      if (wrap || closed) return;
      startText = textEl.textContent;
      if (unbind) { unbind(); unbind = null; }
      wrap = document.createElement("span"); wrap.className = "rlayout rlayout--unit rfield rfield--inline";
      input = document.createElement("input"); input.type = "text"; input.dir = "auto"; input.autocomplete = "off"; input.setAttribute("enterkeyhint", "done");
      if (o.label) input.setAttribute("aria-label", o.label);
      input.value = startText;
      wrap.appendChild(input);
      ["pointerdown", "mousedown", "touchstart", "click"].forEach(function (n) { wrap.addEventListener(n, stop, n === "touchstart" ? { passive: true } : false); });
      textEl.textContent = ""; textEl.appendChild(wrap);
      btn.hidden = true;
      input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length);
      h = live(input, source, key, col, o);
      input.addEventListener("keydown", onKey); input.addEventListener("blur", onBlur);
    }
    function end(esc) {
      if (!wrap) return;
      var hh = h, w = wrap, el = input;
      wrap = null; input = null; h = null;
      el.removeEventListener("blur", onBlur); el.removeEventListener("keydown", onKey);
      if (esc && el.value !== startText) { el.value = startText; el.dispatchEvent(new Event("input")); }   /* the value from the start, saved once if it is not the saved one (an edit of mine: it goes out live and is saved) */
      if (o.required && !el.value.trim()) el.value = hh.base();   /* a name left empty: the last saved one, no save */
      var done = hh.flush();
      w.remove(); bindText();
      if (!textEl.textContent && el.value) textEl.textContent = el.value;
      btn.hidden = false; btn.focus({ preventScroll: true });
      done.then(function () { hh.close(); });
      if (o.onEnd) o.onEnd();
    }
    btn.addEventListener("pointerdown", stop); btn.addEventListener("touchstart", stop, { passive: true }); btn.addEventListener("click", onClick);
    bindText();
    return {
      close: function () {
        if (closed) return;
        end(false); closed = true;
        if (unbind) { unbind(); unbind = null; }
        btn.removeEventListener("pointerdown", stop); btn.removeEventListener("touchstart", stop); btn.removeEventListener("click", onClick);
      }
    };
  }
  function qStart() {
    qFlush();
    window.addEventListener("online", qFlush);
    window.addEventListener("storage", function (e) { if (e.key === "floa.session") qFlush(); });   /* a sign-in in another tab */
  }

  var SEL = ".rfield > .rf-rich,.rfield > textarea, .rfield > select, .rfield > input[type=\"date\"], .rfield > input[type=\"time\"], .rfield--search > input";
  function scan(root) {
    if (root.matches && root.matches(SEL)) setup(root);
    var list = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var i = 0; i < list.length; i++) setup(list[i]);
  }
  function start() {
    scan(document);
    bubbleStart();
    qStart();   /* the co-edited fields' queue (floa.live.q): what waits on this device goes out now */
    if (window.MutationObserver) new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) for (var j = 0; j < muts[i].addedNodes.length; j++) { var n = muts[i].addedNodes[j]; if (n.nodeType === 1) scan(n); }
      if (cur && (!cur.isConnected || !cur.isContentEditable)) hide();   /* the box left the page or became read only: the bubble goes, leaving nothing */
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  window.RosterField = {
    error: error, scan: scan, live: live, inline: inline,
    rich: { html: rHtml, value: function (el) { return rWalk(el, true); }, text: function (el) { return rWalk(el, false); }, init: rInit, index: rIndex, point: rPoint, sel: rSel, keep: rKeep },
    _merge: merge3   /* a test page only */
  };
})();
