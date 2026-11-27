/* THE SLIDER's helper (ui/docs/slider.md), served at /range.js. The slider is the browser's own <input type="range" class="rrange">,
   skinned by kit.css (keyboard, role, dragging and the jump on a track click come free). This file does only what CSS cannot:
   - the filled part in Chrome and Safari: the variable --p (a percent) on the control, the only style written from JS. One listener of
     the kit on "input" keeps it, for every .rrange. (Firefox fills it with no JS, ::-moz-range-progress.)
   - the "held" mark (data-held) from a press on the bar until it is let go (pointerup, pointercancel or change). No timer, no polling.
   RosterRange.set(el, value): writes a value from outside (the playback), except while the bar is held. It paints --p and, on a seek bar
     (.rrange--seek, a value in seconds), aria-valuetext in a readable time, "2:18 מתוך 3:48".
   RosterRange.held(el): is the bar held now (the app shows the thumb's place, not the playback's, until it is let go).
   RosterRange.paint(el): paints --p and the time text from the value the control has (after max changed, or a value set by hand). */
(function () {
  "use strict";
  function clk(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function paint(el) {
    var lo = +el.min || 0, hi = el.max === "" ? 100 : +el.max, v = +el.value, p = hi > lo ? ((v - lo) / (hi - lo)) * 100 : 0;
    p = Math.max(0, Math.min(100, p)) + "%";
    if (el.style.getPropertyValue("--p") !== p) el.style.setProperty("--p", p);
    if (el.classList.contains("rrange--seek")) { var tx = clk(v) + " מתוך " + clk(hi); if (el.getAttribute("aria-valuetext") !== tx) el.setAttribute("aria-valuetext", tx); }
  }
  function held(el) { return !!el && el.hasAttribute("data-held"); }
  function set(el, value) { if (!el || held(el)) return; if (String(el.value) !== String(value)) el.value = value; paint(el); }
  function bar(e) { var t = e.target; return t && t.classList && t.classList.contains("rrange") ? t : null; }
  document.addEventListener("pointerdown", function (e) { var r = bar(e); if (r && !r.disabled) r.setAttribute("data-held", ""); }, true);
  function let_go() { var hs = document.querySelectorAll(".rrange[data-held]"); for (var i = 0; i < hs.length; i++) hs[i].removeAttribute("data-held"); }
  document.addEventListener("pointerup", let_go, true);
  document.addEventListener("pointercancel", let_go, true);
  document.addEventListener("change", function (e) { var r = bar(e); if (r) { r.removeAttribute("data-held"); paint(r); } }, true);
  document.addEventListener("input", function (e) { var r = bar(e); if (r) paint(r); }, true);
  window.RosterRange = { set: set, held: held, paint: paint };
})();
