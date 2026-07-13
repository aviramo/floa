/* ==========================================================================
   The hero system, alive.

   Each solution lights in turn and sends a pulse down its wire into the hub.
   Pulses are positioned with getPointAtLength() along the REAL <path> geometry,
   so a wire can be re-routed in the SVG and the pulse still follows it exactly —
   no duplicated coordinates to keep in sync.
   ========================================================================== */
(function () {
  "use strict";
  var root = document.getElementById("heroSystem");
  if (!root) return;

  var LABELS = window.FLOA.config.systemLabels;
  var STEP = 2600;            // ms a solution stays lit
  var TRAVEL = 1400;          // ms for a pulse to run the wire

  var nodes = root.querySelectorAll(".node");
  var wires = root.querySelectorAll(".wires path");
  var pulses = root.querySelectorAll(".pulse");
  var caption = document.getElementById("systemCaption");
  var textEl = caption ? caption.querySelector(".system-caption-text") : null;

  var lengths = Array.prototype.map.call(wires, function (w) { return w.getTotalLength(); });
  var current = 0;
  var timer = null;
  var raf = null;
  var running = false;

  /* A page may "feature" one node: it stays lit and forward while the rest keep
     pulsing, so the visitor sees THEIR solution at the centre — still wired into
     the one FLOA system. No attribute (the homepage) → nothing is pinned. */
  var feature = parseInt(root.getAttribute("data-feature"), 10);
  if (isNaN(feature)) feature = -1;
  if (feature >= 0 && nodes[feature]) nodes[feature].classList.add("is-feature");

  function placePulse(index, progress) {
    var wire = wires[index];
    var pulse = pulses[index];
    if (!wire || !pulse) return;
    var pt = wire.getPointAtLength(lengths[index] * progress);
    pulse.setAttribute("cx", pt.x);
    pulse.setAttribute("cy", pt.y);
  }

  /* light one solution: its card, its wire, and its caption */
  function light(index) {
    nodes.forEach(function (node, n) { node.classList.toggle("is-lit", n === index || n === feature); });
    wires.forEach(function (wire, w) { wire.classList.toggle("is-lit", w === index || w === feature); });

    if (feature >= 0 || !textEl) return;     // a featured caption never swaps away
    caption.classList.add("is-swapping");
    setTimeout(function () {
      textEl.textContent = LABELS[index] || "";
      caption.classList.remove("is-swapping");
    }, 350);
  }

  /* run one pulse from its card down into the hub */
  function sendPulse(index) {
    var pulse = pulses[index];
    if (!pulse) return;
    var start = null;
    pulse.classList.add("is-live");

    raf = requestAnimationFrame(function frame(now) {
      if (!running) return;
      if (start === null) start = now;

      var p = (now - start) / TRAVEL;
      if (p >= 1) {
        placePulse(index, 1);
        pulse.classList.remove("is-live");
        return;
      }
      // ease-in-out: the packet gathers speed, then settles into the hub
      placePulse(index, p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
      raf = requestAnimationFrame(frame);
    });
  }

  function advance() {
    light(current);
    sendPulse(current);
    current = (current + 1) % LABELS.length;
  }

  function start() {
    if (running) return;
    running = true;
    advance();
    timer = setInterval(advance, STEP);
  }

  function stop() {
    running = false;
    clearInterval(timer);
    if (raf) cancelAnimationFrame(raf);
    timer = raf = null;
  }

  /* reduced motion: show the finished state — everything connected, nothing moves */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    nodes.forEach(function (n) { n.classList.add("is-lit"); });
    wires.forEach(function (w) { w.classList.add("is-lit"); });
    if (textEl && !textEl.textContent) textEl.textContent = "הכול מחובר למערכת אחת";
    return;
  }

  if (feature >= 0) current = feature;      // open the cycle on the featured solution
  else if (textEl) textEl.textContent = LABELS[0];

  // only animate while the hero is actually on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }, { threshold: 0 }).observe(root);
  } else {
    start();
  }
})();
