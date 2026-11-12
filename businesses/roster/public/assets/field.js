/* The behaviour of the shared field element (field.css). Framework-free, no inline handlers, no business names.
   - makes every .rfield control work with the floating label: a control that has no placeholder gets one (" "), and a real example
     moves to data-hint, so the label sits on the line while the field is empty and unfocused;
   - textarea grows with its text up to its max-height, then scrolls inside;
   - browser autofill is detected (label stays floated), including values filled without an input event;
   - RField.error(control, message) / RField.clear(control) set aria-invalid, the error line and aria-describedby;
   - the HELP SLOT: a control with data-help="sentence" (plain text) gets <small class="rf-help"> under the line, linked by aria-describedby. data-help-ex="floa.co.il/roster/{value}"
     adds an example after the sentence (bold, left to right); {value} follows the field as the person types, data-help-ex-empty is used while it is empty. RField.help(control, text, ex)
     sets or changes it (a null text removes it). The text is only ever written with textContent;
   - RField.note(control, text, tone): a small live line under the field ("good" or "bad"), e.g. the identifier is free or taken;
   - fields that a page builds later (innerHTML) are picked up by a MutationObserver. */
(function () {
  "use strict";
  var SEL = ".rfield > input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), .rfield > textarea, .rfield > select";
  var uid = 0;

  function grow(el) {
    if (el.tagName !== "TEXTAREA" || !el.isConnected || el.hasAttribute("data-rf-fixed")) return;
    if (!el.offsetParent) return;
    el.style.height = "auto";
    var max = parseFloat(getComputedStyle(el).maxHeight);
    var h = el.scrollHeight;
    el.style.height = (isFinite(max) && h > max ? max : h) + "px";
  }

  /* data-rf on the field: "e" empty, "v" has a value. Select, date and time always count as "v" (their label stays up, as in the admin page) */
  function isEmpty(el) {
    if (el.tagName === "SELECT") return false;
    var t = (el.type || "").toLowerCase();
    if (t === "date" || t === "time" || t === "datetime-local" || t === "month" || t === "week") return false;
    if (el.value !== "") return false;
    try { if (el.matches(":-webkit-autofill")) return false; } catch (e) { /* not WebKit */ }
    return true;
  }
  function sync(el) {
    var f = el.parentNode;
    if (f && f.classList && f.classList.contains("rfield")) { var v = isEmpty(el) ? "e" : "v"; if (f.getAttribute("data-rf") !== v) f.setAttribute("data-rf", v); }
  }

  /* ---- the help slot ---- */
  function describe(el, id, first) {
    var d = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
    if (d.indexOf(id) < 0) { if (first) d.unshift(id); else d.push(id); el.setAttribute("aria-describedby", d.join(" ")); }
  }
  function paintHelp(el, h) {
    var text = el.getAttribute("data-help") || "", ex = el.getAttribute("data-help-ex");
    h.textContent = text;
    if (ex) {
      var emptyEx = el.getAttribute("data-help-ex-empty"), ph = el.getAttribute("placeholder");
      var v = (el.value || "").trim();
      var span = document.createElement("span");
      span.className = "rf-ex";
      /* empty field: the whole example from data-help-ex-empty, or the example with the placeholder in {value}'s place; otherwise the example with what was typed */
      span.textContent = !v && emptyEx ? emptyEx : ex.split("{value}").join(v || (ph && ph !== " " ? ph : ""));
      if (text) h.appendChild(document.createTextNode(" "));
      h.appendChild(span);
    }
  }
  function buildHelp(el) {
    var f = el.parentNode;
    if (!f || !f.classList || !f.classList.contains("rfield")) return;
    var text = el.getAttribute("data-help"), ex = el.getAttribute("data-help-ex"), h = f.querySelector(":scope > .rf-help");
    if (!text && !ex) { if (h) h.remove(); return; }
    if (!h) {
      h = document.createElement("small");
      h.className = "rf-help";
      h.id = (el.id || "rf" + (++uid)) + "-help";
      var err = f.querySelector(":scope > .rf-err");
      if (err) f.insertBefore(h, err); else f.appendChild(h);
    }
    paintHelp(el, h);
    describe(el, h.id, true);
    if (ex && ex.indexOf("{value}") > -1 && !el.__rfHelpLive) { el.__rfHelpLive = 1; el.addEventListener("input", function () { var hh = f.querySelector(":scope > .rf-help"); if (hh) paintHelp(el, hh); }); }
  }

  function setup(el) {
    if (el.__rf) return;
    el.__rf = 1;
    buildHelp(el);
    if (el.tagName !== "SELECT") {
      var ph = el.getAttribute("placeholder");
      if (ph == null || ph === "") el.setAttribute("placeholder", " ");
      else if (ph !== " " && !el.hasAttribute("data-hint")) el.setAttribute("data-hint", "");
    }
    if (el.tagName === "TEXTAREA") {
      if (!el.hasAttribute("rows")) el.rows = 1;   // a text area starts one field high and grows with its text
      el.addEventListener("input", function () { grow(el); });
      grow(el);
      if (window.ResizeObserver) new ResizeObserver(function () { grow(el); }).observe(el);
    }
    /* the state follows typing, choosing, a script setting .value, a form reset, and Chrome autofill (it fires the animation below) */
    ["input", "change", "blur"].forEach(function (n) { el.addEventListener(n, function () { sync(el); }); });
    el.addEventListener("animationstart", function (e) { if (e.animationName === "rf-autofill") sync(el); });
    var proto = Object.getPrototypeOf(el), d = Object.getOwnPropertyDescriptor(proto, "value");
    if (d && d.get && d.set) Object.defineProperty(el, "value", { configurable: true, enumerable: d.enumerable, get: function () { return d.get.call(this); }, set: function (v) { d.set.call(this, v); sync(this); } });
    sync(el);
  }

  function scan(root) {
    var list = (root || document).querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) setup(list[i]);
  }

  function lineOf(el) {
    var f = el.parentNode;
    if (!f || !f.classList || !f.classList.contains("rfield")) return null;
    return f;
  }

  var RField = {
    scan: scan,
    sync: resync,
    grow: grow,
    /* set, change or remove the help line of a field: help(el, "text", "example with {value}") ; help(el, null) removes it */
    help: function (el, text, ex) {
      if (text == null && ex == null) { el.removeAttribute("data-help"); el.removeAttribute("data-help-ex"); }
      else { if (text != null) el.setAttribute("data-help", text); if (ex != null) el.setAttribute("data-help-ex", ex); }
      buildHelp(el);
    },
    /* a small live line under the field: tone "good" or "bad"; an empty text removes it */
    note: function (el, text, tone) {
      var f = lineOf(el);
      if (!f) return;
      var n = f.querySelector(":scope > .rf-note");
      if (!text) { if (n) { var d = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== n.id; }); if (d.length) el.setAttribute("aria-describedby", d.join(" ")); else el.removeAttribute("aria-describedby"); n.remove(); } return; }
      if (!n) {
        n = document.createElement("small");
        n.className = "rf-note";
        n.id = (el.id || "rf" + (++uid)) + "-note";
        n.setAttribute("aria-live", "polite");
        f.appendChild(n);
        describe(el, n.id, false);
      }
      n.textContent = text;
      n.setAttribute("data-tone", tone || "info");
    },
    /* show an error under the line; message "" or null clears it */
    error: function (el, message) {
      var f = lineOf(el);
      if (!f) return;
      var err = f.querySelector(":scope > .rf-err");
      if (!message) { RField.clear(el); return; }
      if (!err) {
        err = document.createElement("small");
        err.className = "rf-err";
        err.id = (el.id || "rf" + (++uid)) + "-err";
        err.setAttribute("role", "alert");
        f.appendChild(err);
      }
      err.textContent = message;
      el.setAttribute("aria-invalid", "true");
      var d = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      if (d.indexOf(err.id) < 0) { d.push(err.id); el.setAttribute("aria-describedby", d.join(" ")); }
    },
    clear: function (el) {
      var f = lineOf(el);
      if (!f) return;
      el.removeAttribute("aria-invalid");
      var err = f.querySelector(":scope > .rf-err");
      if (err) {
        var d = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (x) { return x && x !== err.id; });
        if (d.length) el.setAttribute("aria-describedby", d.join(" ")); else el.removeAttribute("aria-describedby");
        err.remove();
      }
    }
  };
  window.RField = RField;

  function resync() { var list = document.querySelectorAll(SEL); for (var i = 0; i < list.length; i++) if (list[i].__rf) sync(list[i]); }

  function start() {
    scan(document);
    document.addEventListener("reset", function () { setTimeout(resync, 0); }, true);
    /* autofill that lands without any event: look again shortly after load */
    [150, 600, 1500].forEach(function (ms) { setTimeout(resync, ms); });
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var a = muts[i].addedNodes;
          for (var j = 0; j < a.length; j++) {
            var n = a[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches(SEL)) setup(n);
            if (n.querySelectorAll) scan(n);
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
