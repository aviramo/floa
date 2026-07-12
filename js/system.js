/* ==========================================================================
   FLOA — the hero system, animated
   Each solution lights in turn and sends a pulse down its wire into the hub:
   site, app, WhatsApp, payments, data — all resolving into one system.

   The pulses are positioned with getPointAtLength() along the REAL <path>
   geometry, so a wire can be re-routed in the SVG and the pulse still follows
   it exactly — no duplicated coordinates to keep in sync.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.getElementById("heroSystem");
  if (!root) return;

  var SOLUTIONS = [
    "אתרים ודפי נחיתה",
    "אפליקציות ומערכות",
    "WhatsApp, לידים ומכירות",
    "תשלומים וגבייה",
    "אוטומציות, נתונים ודוחות"
  ];

  var STEP = 2600;            // ms a solution stays lit
  var TRAVEL = 1400;          // ms for a pulse to run the wire

  var nodes    = root.querySelectorAll(".node");
  var wires    = root.querySelectorAll(".wires path");
  var pulses   = root.querySelectorAll(".pulse");
  var caption  = document.getElementById("systemCaption");
  var textEl   = caption ? caption.querySelector(".system-caption-text") : null;

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lengths = [];
  var current = 0;
  var timer = null;
  var raf = null;
  var running = false;

  for (var i = 0; i < wires.length; i++) {
    lengths.push(wires[i].getTotalLength());
  }

  /* place a pulse a fraction of the way along its wire */
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
    for (var n = 0; n < nodes.length; n++) {
      nodes[n].classList.toggle("is-lit", n === index);
    }
    for (var w = 0; w < wires.length; w++) {
      wires[w].classList.toggle("is-lit", w === index);
    }
    if (textEl && caption) {
      caption.classList.add("is-swapping");
      setTimeout(function () {
        textEl.textContent = SOLUTIONS[index] || "";
        caption.classList.remove("is-swapping");
      }, 350);
    }
  }

  /* run one pulse from its card down into the hub */
  function sendPulse(index) {
    var pulse = pulses[index];
    if (!pulse) return;

    var start = null;
    pulse.classList.add("is-live");

    function frame(now) {
      if (!running) return;
      if (start === null) start = now;

      var p = (now - start) / TRAVEL;
      if (p >= 1) {
        placePulse(index, 1);
        pulse.classList.remove("is-live");
        return;
      }

      // ease-in-out: the packet gathers speed, then settles into the hub
      var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      placePulse(index, eased);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
  }

  function advance() {
    light(current);
    sendPulse(current);
    current = (current + 1) % SOLUTIONS.length;
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
    timer = null;
    raf = null;
  }

  /* reduced motion: show the finished state — everything connected, nothing moves */
  if (reduce) {
    for (var k = 0; k < nodes.length; k++) nodes[k].classList.add("is-lit");
    for (var m = 0; m < wires.length; m++) wires[m].classList.add("is-lit");
    if (textEl) textEl.textContent = "הכול מחובר למערכת אחת";
    return;
  }

  // only animate while the hero is actually on screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start();
      else stop();
    }, { threshold: 0 }).observe(root);
  } else {
    start();
  }
})();
