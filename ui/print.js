/* THE PRINT SHELL (ui/docs/print.md), served at /print.js. The one way an app prints: the app gives the content (a title, a sub line and blocks),
   the kit holds the paper (size, margin, letters, colours, page breaks, and hiding everything else). The look is in kit.css ("PRINT SHELL"); this file does
   only what CSS cannot:
   - writes the content into ONE layer in the current document (<div class="rprint"> right under body), hidden on screen, the only thing shown on paper;
     never a frame and never a new window (a phone prints the frame's parent or loses a frame removed by a timer; a window is blocked, and is no PWA)
   - marks the document while it prints (html[data-rprint], data-page on the layer), so the page rule (@page, margin 0) and the hiding hold only then:
     a plain Ctrl+P on an app screen is untouched. A browser with no named pages gets a small @page sheet instead, added and removed with the layer
   - waits for the fonts (document.fonts.ready) and the layer's images (img.decode()), never a fixed delay
   - measures every kept block once at the width of a page and lets a block taller than a page break (data-break, an attribute, never style):
     the declared exception to "CSS before JS", since CSS cannot know that something is taller than a page
   - names the file: document.title is the title while printing, and comes back on afterprint (or on the next open)
   - cleans up on afterprint only, never on a timer (on a phone print() returns at once; a timer would remove the content before it printed)
   RosterPrint.open({ title, sub, size: "A4" | "A5" | "letter", orientation: "portrait" | "landscape", empty, blocks | html }) -> a Promise, kept after
   afterprint (or at once, in a browser that does not tell). Blocks: text { html }, section { title, newPage, blocks } (two levels at most),
   item { num, title, tag, meta: [words], metaIcon: a symbol of /icons.svg at the start of the meta line, fields: [{ label, html }] }, image { src, alt }. Plain text is escaped; html is rich text only. */
(function () {
  "use strict";
  var SIZES = { a4: "A4", a5: "A5", letter: "letter" };
  var cur = null;   /* the layer in place now: { el, title, sheet, done } */

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function has(s) { return s != null && String(s).trim() !== ""; }

  function field(f) {
    if (!f || !has(f.html)) return "";   /* a field with no text is not written (an empty slot is not shown) */
    return '<div class="rprint__field">' + (has(f.label) ? '<div class="rprint__label">' + esc(f.label) + '</div>' : '') + '<div class="rprint__value" dir="auto">' + f.html + '</div></div>';
  }
  /* a heading is written together with the first block after it, inside one wrapper that is kept whole (.rprint__lead): a heading never sits alone */
  function lead(head, rest) {
    var first = rest.length ? rest[0] : "";
    return '<div class="rprint__lead">' + head + first + '</div>' + rest.slice(1).join("");
  }
  function item(b) {
    var meta = (b.meta || []).filter(has);
    var head = '<div class="rprint__ihead"><h4 class="rprint__ititle">' +
      (b.num != null && b.num !== "" ? '<span class="rprint__num"><bdi>' + esc(b.num) + '</bdi></span>' : '') +
      '<span dir="auto">' + esc(b.title) + '</span>' +
      (has(b.tag) ? '<span class="rprint__tag" dir="auto">' + esc(b.tag) + '</span>' : '') + '</h4>' +
      (meta.length ? '<p class="rprint__meta' + (has(b.metaIcon) ? ' rprint__meta--sym' : '') + '">' +
        (has(b.metaIcon) ? '<span class="rprint__symbox"><svg class="rprint__sym" data-sym="' + esc(b.metaIcon) + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"></svg></span>' : '') +   /* a kit symbol at the start of the line, drawn inline (ready() copies it from /icons.svg) so it prints */
        '<span class="rprint__mt"><bdi>' + meta.map(function (m) { return '<span class="rprint__mi"><bdi>' + esc(m) + '</bdi></span>'; }).join("") + '</bdi></span></p>' : '') + '</div>';   /* the words are one flowing run: wrapped lines hang under the text, not under the symbol. The title and its meta line are one small unit (.rprint__ihead), never split */
    var fields = (b.fields || []).map(field).filter(Boolean);
    return '<article class="rprint__item rprint__keep">' + lead(head, fields) + '</article>';
  }
  function block(b, level) {
    if (!b) return "";
    if (b.kind === "text") return has(b.html) ? '<div class="rprint__text" dir="auto">' + b.html + '</div>' : "";
    if (b.kind === "image") return b.src ? '<figure class="rprint__img"><img src="' + esc(b.src) + '" alt="' + esc(b.alt || "") + '"></figure>' : "";
    if (b.kind === "item") return item(b);
    if (b.kind === "section") {
      var kids = (b.blocks || []), nested = level < 2 && kids.some(function (k) { return k && k.kind === "section"; });
      var inner = kids.map(function (k) { return block(k, Math.min(level + 1, 2)); }).filter(Boolean);
      var tag = level < 2 ? "h2" : "h3";
      var head = has(b.title) ? '<' + tag + ' class="rprint__stitle" dir="auto">' + esc(b.title) + '</' + tag + '>' : '';
      return '<section class="rprint__sec' + (nested ? '' : ' rprint__keep') + (b.newPage ? ' rprint__sec--new' : '') + (kids.some(function (k) { return k && k.kind === "item"; }) ? ' rprint__sec--items' : '') + '">' + lead(head, inner) + '</section>';
    }
    return "";   /* a fifth kind comes only with the owner's approval */
  }
  function build(o) {
    var body = o.html != null ? String(o.html) : (o.blocks || []).map(function (b) { return block(b, 1); }).join("");
    if (!body.trim()) body = has(o.empty) ? '<p class="rprint__text">' + esc(o.empty) + '</p>' : "";
    return '<table class="rprint__sheet" role="presentation">' +
      '<thead><tr><td class="rprint__space"></td></tr></thead>' +   /* the top margin of every page: a header group repeats on every page */
      '<tfoot><tr><td class="rprint__space"></td></tr></tfoot>' +   /* and the bottom one */
      '<tbody><tr><td class="rprint__cell"><div class="rprint__flow">' +
      '<header class="rprint__head"><h1 class="rprint__title" dir="auto">' + esc(o.title) + '</h1>' + (has(o.sub) ? '<p class="rprint__sub" dir="auto">' + esc(o.sub) + '</p>' : '') + '</header>' +
      body + '</div></td></tr></tbody></table>';
  }

  function cleanup() {
    if (!cur) return;
    var c = cur; cur = null;
    window.removeEventListener("afterprint", c.after);
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
    if (c.sheet && c.sheet.parentNode) c.sheet.parentNode.removeChild(c.sheet);
    document.documentElement.removeAttribute("data-rprint");
    document.title = c.title;
    c.done();
  }
  function ready(el) {   /* the fonts of the document and the images of the layer; no fixed delay */
    var fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    var imgs = [].map.call(el.querySelectorAll("img"), function (im) { return im.decode ? im.decode().catch(function () { /* a broken image prints its alt */ }) : null; });
    return Promise.all([fonts, symbols(el)].concat(imgs));
  }
  var sprite = null;   /* the kit's sprite, read once: a symbol is copied into the layer, since a <use> of another file may not be drawn in time for print */
  function symbols(el) {
    var want = el.querySelectorAll("svg[data-sym]");
    if (!want.length) return null;
    sprite = sprite || fetch("/icons.svg").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { return new DOMParser().parseFromString(t, "image/svg+xml"); }).catch(function () { sprite = null; return null; });
    return sprite.then(function (doc) {
      [].forEach.call(want, function (s) {
        var sym = doc && doc.getElementById(s.getAttribute("data-sym"));
        if (!sym) {   /* no such symbol (or offline with no copy): the line prints without it */
          var line = s.closest(".rprint__meta"), box = s.closest(".rprint__symbox");
          if (box) box.remove(); else s.remove();
          if (line) line.classList.remove("rprint__meta--sym");
          return;
        }
        if (sym.getAttribute("viewBox")) s.setAttribute("viewBox", sym.getAttribute("viewBox"));
        s.innerHTML = sym.innerHTML;
      });
    });
  }
  /* only SMALL units are kept whole: a kept block (an item, a section, a heading with what follows it) taller than this share of the clean page height
     breaks across pages, so a long item never pushes itself to a new page and leaves a hole. Its title with its meta line (.rprint__ihead), a heading
     (break-after: avoid) and a text's first and last lines (orphans, widows) still hold together. */
  var KEEP_MAX = 0.25;
  function measure(el) {   /* once, at the width of a page */
    var probe = document.createElement("div"); probe.className = "rprint__probe";
    el.setAttribute("data-measure", ""); el.appendChild(probe);
    var pageH = probe.getBoundingClientRect().height;
    if (pageH > 0) [].forEach.call(el.querySelectorAll(".rprint__keep, .rprint__lead"), function (b) {
      if (b.getBoundingClientRect().height > pageH * KEEP_MAX) b.setAttribute("data-break", "");
    });
    el.removeChild(probe); el.removeAttribute("data-measure");
  }

  function open(o) {
    o = o || {};
    var size = SIZES[String(o.size || "A4").toLowerCase()] || "A4";
    var orient = o.orientation === "landscape" ? "landscape" : "portrait";
    var title = cur ? cur.title : document.title;   /* the next open replaces the layer; the title to come back to stays the app's own */
    cleanup();
    var root = document.documentElement;
    var el = document.createElement("div");
    el.className = "rprint";
    el.setAttribute("dir", root.getAttribute("dir") || "rtl");
    el.setAttribute("lang", root.getAttribute("lang") || "he");
    el.setAttribute("data-page", size.toLowerCase() + "-" + orient);
    el.innerHTML = build(o);
    document.body.appendChild(el);
    var sheet = null;
    if (!(window.CSS && CSS.supports && CSS.supports("page", "rprint"))) {   /* no named pages: the same page rule, only while the layer is here */
      sheet = document.createElement("style");
      sheet.textContent = "@media print { @page { size: " + size + " " + orient + "; margin: 0 } }";
      document.head.appendChild(sheet);
    }
    var done, p = new Promise(function (res) { done = res; });
    var c = cur = { el: el, title: title, sheet: sheet, done: done, after: function () { if (cur === c) cleanup(); } };
    return ready(el).then(function () {
      if (cur !== c) return p;   /* a newer print took its place */
      measure(el);
      root.setAttribute("data-rprint", "");
      document.title = has(o.title) ? String(o.title) : title;   /* the browser names the file after the title of the page */
      window.addEventListener("afterprint", c.after);
      try { window.print(); } catch (e) { cleanup(); return p; }
      if (!("onafterprint" in window)) done();   /* a browser that does not tell: the layer stays hidden until the next print replaces it */
      return p;
    });
  }

  window.RosterPrint = { open: open };
})();
