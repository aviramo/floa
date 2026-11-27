/* THE CARD (ui/, the domain's UI library): ONE generic card for every app, built on the Layout. Defined in ui/docs/card.md; its looks are .rcard in ui/css/06-card.css.
   An app never writes a card's markup itself, not even with the kit's classes: it fills the slots here.
   RosterCard.html(o) returns the markup of one card:
     layout: the variant, "rows" (the default: two rows, each a text and its end group), "lines" (the same two rows, then a list of tappable lines and a foot)
       or "media" (the tile of one file, see "THE MEDIA TILE" below),
     media (layout "media" only): { src, type ("image" | "video"), w, h (the file's size in px, when known), poster (a video's still, optional) },
     title (text, required: the kit escapes it), sub (text) or subHtml (markup) for the second row, num (a number, a time or a date at the start of row 2),
     lead (markup: a number, an icon or a square image, never taller than the two rows), chip (one chip's markup, in the end group of row 1),
     act1, act2 (the actions of each row: icon buttons, a text button, a .rcard__num as a text tail),
     lines (layout "lines" only: an array of { text, attrs, href }: each line is its own button, or a link with href; attrs data-* only),
     linesLabel (the name of the lines' group, read by a screen reader), more (a number: only that many lines show, then "עוד N" shows the rest in place;
     false or none: every line), foot (layout "lines" only: markup at the end of the card, a text button or a short text),
     click (true: the whole card is the target), titleBtn (attributes that make the title a button; only on a card that is not clickable),
     current, play, busy, disabled (the states). There is no loading card: content on its way is the kit's loading area (.rload), never a placeholder card,
     attrs (the app's own attributes, data-* only: an id, what the card opens).
   An empty slot is not written and takes no room; with no sub, num and act2 the card is one row.
   The markup is Layout's (ui/docs/layout.md): the card is a row with --pad (lead, main); main is a column --unit (row 1, row 2, the lines, the foot);
   each row is a row (its text __grow, its end group); the lines are a column --unit.
   RosterCard.bind(root, selector, fn) wires a click and the keyboard (Enter, Space on the card itself) for the clickable cards under root that match
   selector: fn(card, event). A click that starts in an inner control (a button, a link, a field, a label, any [role=button] that is not the card)
   does not open the card, with no stopPropagation in the app. Binding the same root and selector again only swaps fn.
   A line is the app's: it carries the app's data-* and the app hears it by delegation, like any inner button. "עוד N" is the kit's: one listener here. */
(function () {
  "use strict";
  var INNER = "button, a, input, select, textarea, label, [role=button]";
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function text(t) { var s = esc(t); return '<span class="rcard__tx" dir="auto" title="' + s + '">' + s + '</span>'; }
  var ROW = "rlayout rlayout--row", TXT = "rlayout rlayout--row rlayout--unit rlayout__grow rcard__t";
  function row(n, t, a) { return '<div class="' + ROW + ' rcard__row">' + (t ? '<span class="' + TXT + ' rcard__t' + n + '">' + t + '</span>' : '') + (a ?'<span class="' + ROW + ' rcard__a rcard__a' + n + '">' + a + '</span>' : '') + '</div>'; }
  function line(l, hide, off) {
    var s = esc(l.text), lab = '<span class="rbtn__label" dir="auto">' + s + '</span>', at = ' class="rbtn rbtn--text rcard__line" title="' + s + '"' + (l.attrs ? ' ' + l.attrs : '') + (hide ? ' hidden' : '');
    return l.href ? '<a' + at + ' href="' + esc(l.href) + '"' + (off ? ' tabindex="-1" aria-disabled="true"' : '') + '>' + lab + '</a>' : '<button type="button"' + at + (off ? ' disabled' : '') + '>' + lab + '</button>';
  }
  function lines(o) {
    var ls = (o.lines || []).filter(function (l) { return l && l.text != null && l.text !== ""; });
    if (!ls.length) return "";
    var cap = typeof o.more === "number" && o.more > 0 && ls.length > o.more + 1 ? o.more : 0;   /* "עוד 1" would take the room of the one line it hides: then every line shows */
    var h = ls.map(function (l, i) { return line(l, cap && i >= cap, o.disabled); }).join("");
    if (cap) { var n = ls.length - cap; h += '<button type="button" class="rbtn rbtn--text rcard__expand" aria-label="הצגת עוד ' + n + '"' + (o.disabled ? ' disabled' : '') + '>עוד ' + n + '</button>'; }
    return '<div class="rlayout rlayout--unit rcard__lines" role="group"' + (o.linesLabel ? ' aria-label="' + esc(o.linesLabel) + '"' : '') + '>' + h + '</div>';
  }

  /* THE MEDIA TILE (layout "media", ui/docs/card.md "אריח מדיה"; owner, 2026-11-26): the card IS the file, an image or a video, as wide as its column and as tall
     as its ratio (w and h become the file's width and height, so the browser keeps its place before it comes; none: a square until it comes). No text block: the
     title is only the tile's accessible name (aria-label) and its title. The other slots (sub, num, lead, chip, act1, act2, lines, foot, titleBtn) do not apply
     and are not written, so a tile carries no "more" button (owner, 2026-11-26: the item's actions are in the window it opens). A video is muted, shows one frame
     (its poster, else the first frame from its metadata), has no controls and never plays here; its play symbol is decoration (aria-hidden). The states are the
     card's own attributes; kit.css draws them over the file. */
  var PLAY = '<svg class="rsym rcard__play" aria-hidden="true" focusable="false"><use href="/icons.svg#play"/></svg>';
  function px(v) { v = Math.round(+v); return v > 0 ? v : 0; }
  function tile(o) {
    var md = o.media || {}, t = esc(o.title), w = px(md.w), h = px(md.h), wh = w && h ? ' width="' + w + '" height="' + h + '"' : '';
    if (md.cors) wh += ' crossorigin="' + (md.cors === "use-credentials" ? "use-credentials" : "anonymous") + '"';   /* media.cors: true (anonymous) or "use-credentials", for a store that needs the CORS mode on every request (worker/MEDIA.md) */
    var at = ' class="rcard" data-layout="media" aria-label="' + t + '" title="' + t + '"';
    if (o.click) at += ' role="button" tabindex="' + (o.disabled ? '-1' : '0') + '"';
    if (o.current) at += ' aria-current="true"';
    if (o.busy) at += ' aria-busy="true"';
    if (o.disabled) at += ' aria-disabled="true"';
    if (o.attrs) at += ' ' + o.attrs;
    var f = md.type === "video"
      ? '<video src="' + esc(md.src) + '"' + wh + ' muted playsinline tabindex="-1" preload="' + (md.poster ? 'none" poster="' + esc(md.poster) : 'metadata') + '"></video>' + PLAY
      : '<img src="' + esc(md.src) + '" alt=""' + wh + ' loading="lazy" decoding="async">';
    return '<div' + at + '>' + f + '</div>';
  }

  function html(o) {
    o = o || {};
    if (o.layout === "media") return tile(o);
    var lay = o.layout === "lines" ? "lines" : "rows";
    var at = ' class="rlayout rlayout--row rlayout--pad rcard' + (o.play ? ' is-play' : '') + '" data-layout="' + lay + '"';
    if (o.click) at += ' role="button" tabindex="' + (o.disabled ? '-1' : '0') + '"';
    if (o.current) at += ' aria-current="true"';
    if (o.busy) at += ' aria-busy="true"';
    if (o.disabled) at += ' aria-disabled="true"';
    if (o.attrs) at += ' ' + o.attrs;
    var h = '<div' + at + '>';
    if (o.lead) h += '<span class="rcard__lead" aria-hidden="true">' + o.lead + '</span>';
    var t = esc(o.title);
    h += '<div class="rlayout rlayout--unit rlayout__grow rcard__main">';
    var atT = o.chipAt === "title" && o.chip;   /* chipAt "title" (owner 2026-11-27): the chip right after row 1's text, --gap-tight (that text row's gap); the text alone shrinks */
    h += row(1, (o.titleBtn && !o.click
      ? '<button type="button" class="rcard__tx" dir="auto" title="' + t + '"' + (o.disabled ? ' disabled' : '') + ' ' + o.titleBtn + '>' + t + '</button>'
      : text(o.title)) + (atT ? o.chip : ''), (atT ? '' : o.chip || '') + (o.act1 || ''));   /* by default the chip is in the END group of row 1, on the start side of that row's actions */
    var t2 = (o.num ? '<span class="rcard__num">' + esc(o.num) + '</span>' : '') + (o.subHtml ? '<span class="rcard__tx" dir="auto">' + o.subHtml + '</span>' : o.sub ? text(o.sub) : '');
    if (t2 || o.act2) h += row(2, t2, o.act2 || '');
    if (lay === "lines") { h += lines(o); if (o.foot) h += '<div class="' + ROW + ' rcard__foot">' + o.foot + '</div>'; }
    return h + '</div></div>';
  }

  function bind(root, selector, fn) {
    if (!root) return;
    var reg = root.__rcard || (root.__rcard = {});
    if (reg[selector]) { reg[selector].fn = fn; return; }
    var b = reg[selector] = { fn: fn };
    var cardOf = function (el) {
      var c = el && el.closest ? el.closest(selector) : null;
      if (!c || !root.contains(c) || !c.classList.contains("rcard") || c.getAttribute("role") !== "button") return null;
      if (c.getAttribute("aria-disabled") === "true" || c.getAttribute("aria-busy") === "true") return null;
      return c;
    };
    root.addEventListener("click", function (e) {
      var c = cardOf(e.target); if (!c) return;
      var inner = e.target.closest(INNER); if (inner && inner !== c && c.contains(inner)) return;   /* an inner control does its own thing; it never opens the card */
      b.fn(c, e);
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var c = cardOf(e.target); if (!c || e.target !== c) return;   /* only when the focus is on the card itself */
      e.preventDefault(); b.fn(c, e);
    });
  }

  /* "עוד N": the hidden lines show in place, the button goes, and the focus moves to the first line that came in (state only; the looks are CSS) */
  document.addEventListener("click", function (e) {
    var x = e.target && e.target.closest ? e.target.closest(".rcard__expand") : null; if (!x || x.disabled) return;
    var first = null;
    Array.prototype.forEach.call(x.parentNode.children, function (l) { if (l.classList.contains("rcard__line") && l.hidden) { l.hidden = false; if (!first) first = l; } });
    x.hidden = true;
    if (first) first.focus();
  });

  window.RosterCard = { html: html, bind: bind };
})();
