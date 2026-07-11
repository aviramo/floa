/* ==========================================================================
   FLOA — hero "flow" animation (light).
   Subtle turquoise flow lanes with traveling dots, drawn on a canvas behind
   the hero content. Runs ONLY while the hero is on screen and the canvas is
   actually displayed (it is hidden on mobile) — so it never competes with
   scrolling. Respects prefers-reduced-motion.
   ========================================================================== */
(function () {
  "use strict";
  var cv = document.getElementById("flow");
  if (!cv || !cv.getContext) return;

  var ctx = cv.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var W = 0, H = 0, lanes = [], t = 0, raf = 0, running = false;

  var TEAL = "14,140,126"; // --teal rgb

  function shown() { return cv.offsetParent !== null; } // false when display:none

  function build() {
    var r = cv.parentElement.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lanes = [];
    var ys = [H * 0.26, H * 0.5, H * 0.74];
    ys.forEach(function (y, idx) {
      var seg = [], n = 6;
      for (var i = 0; i <= n; i++) {
        seg.push({ x: W * (i / n), y: y + Math.sin(i * 1.05 + idx * 2.1) * H * 0.05 });
      }
      lanes.push(seg);
    });
  }

  function laneY(seg, x) {
    for (var i = 0; i < seg.length - 1; i++) {
      if (x >= seg[i].x && x <= seg[i + 1].x) {
        var tt = (x - seg[i].x) / (seg[i + 1].x - seg[i].x);
        var s = tt * tt * (3 - 2 * tt);
        return seg[i].y + (seg[i + 1].y - seg[i].y) * s;
      }
    }
    return seg[seg.length - 1].y;
  }

  function line(seg, alpha) {
    ctx.beginPath();
    for (var x = 0; x <= W; x += 6) {
      var y = laneY(seg, x);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(" + TEAL + "," + alpha + ")";
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  function dot(x, y, r, a) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(" + TEAL + "," + a + ")";
    ctx.shadowColor = "rgba(" + TEAL + ",.5)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function frame() {
    ctx.clearRect(0, 0, W, H);
    lanes.forEach(function (seg, li) {
      line(seg, 0.16);
      for (var k = 0; k < 3; k++) {
        var prog = ((t * 0.00012 * (1 + li * 0.12)) + (k / 3) + li * 0.18) % 1;
        var x = W - prog * W;          // flow right -> left (RTL)
        var y = laneY(seg, x);
        dot(x, y, 3, 0.85);
        dot(x + 20, y, 1.5, 0.3);
      }
    });
    dot(W * 0.99, H * 0.5, 4, 0.4);
    t += 16;
  }

  function staticDraw() {
    ctx.clearRect(0, 0, W, H);
    lanes.forEach(function (seg) {
      line(seg, 0.2);
      for (var k = 0; k < 3; k++) {
        var x = W * (0.22 + k * 0.28);
        dot(x, laneY(seg, x), 3, 0.75);
      }
    });
  }

  function loop() {
    if (!running) return;
    frame();
    raf = window.requestAnimationFrame(loop);
  }
  function start() {
    if (running || reduce || !shown()) return;
    running = true;
    raf = window.requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  build();
  window.addEventListener("resize", function () {
    build();
    if (!shown()) stop();
    else if (reduce) staticDraw();
  });

  if (reduce) {
    if (shown()) staticDraw();
    return;
  }

  // animate only while the hero is on screen (and pause otherwise)
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries[0].isIntersecting ? start() : stop();
    }, { threshold: 0 });
    io.observe(cv.parentElement);
  } else {
    start();
  }
  // also pause when the tab is hidden
  document.addEventListener("visibilitychange", function () {
    document.hidden ? stop() : start();
  });
})();
