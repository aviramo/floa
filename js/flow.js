/* ==========================================================================
   FLOA — hero flow band
   Laminar streamlines drifting right -> left, matching the Hebrew reading
   direction. Long, calm, unbroken currents: the brand name, drawn.

   Lives in its own band above the wordmark, so it never crosses any text.
   ========================================================================== */
(function () {
  "use strict";

  var canvas = document.getElementById("heroFlow");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var COUNT = 220;                        // currents
  var TRAIL = 48;                         // points of path kept per current
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var w = 0, h = 0, dpr = 1;
  var particles = [];
  var t = 0;
  var raf = null;
  var visible = true;

  /* ---- sizing ---------------------------------------------------------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = rect.width;
    h = rect.height;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    seed();
  }

  /* ---- currents -------------------------------------------------------- */
  function spawn(fresh) {
    return {
      // fresh currents enter at the right edge; on first seed, scatter across
      // the band so the flow is already established on frame one
      x: fresh ? w + Math.random() * 60 : Math.random() * w,
      y: Math.random() * h,
      pts: [],                                   // the path it has traced
      speed: 1.0 + Math.random() * 1.8,
      seed: Math.random() * 1000,
      weight: Math.random() < 0.18 ? 2.0 : 1.1,  // a few heavier main currents
      alpha: 0.30 + Math.random() * 0.34         // depth: some sit further back
    };
  }

  function seed() {
    particles = [];
    for (var i = 0; i < COUNT; i++) particles.push(spawn(false));

    /* Warm the currents up: a polyline needs a path before it can be stroked,
       so without this the band renders almost empty for the first ~TRAIL
       frames and the flow appears to grow out of nothing on load. */
    for (var pass = 0; pass < TRAIL; pass++) {
      for (var j = 0; j < particles.length; j++) particles[j] = step(particles[j]);
      t += 0.005;
    }
  }

  /* the flow field: a calm, wide undulation. No convergence, no focal point —
     the current simply drifts, the way water moves in a wide channel. */
  function drift(x, y, s) {
    // kept well below the horizontal speed, so the currents stay near-level and
    // read as a calm flow rather than as scratchy diagonal marks
    return Math.sin(x * 0.005 + t * 0.9 + s) * 0.32 +
           Math.sin(y * 0.009 - t * 0.5 + s * 0.4) * 0.16;
  }

  function step(p) {
    p.x -= p.speed;                       // right -> left
    p.y += drift(p.x, p.y, p.seed);

    p.pts.push(p.x, p.y);
    if (p.pts.length > TRAIL * 2) p.pts.splice(0, 2);

    // retire once the whole trail has left the band, so it never snaps back
    if (p.x < -TRAIL * p.speed - 20 || p.y < -60 || p.y > h + 60) return spawn(true);
    return p;
  }

  /* Each current is stroked as an explicit polyline of the path it has traced.
     Accumulating faded frames instead would leave short, dashed-looking marks —
     the streamline has to be an actual line. */
  function draw(p) {
    var n = p.pts.length;
    if (n < 6) return;

    // travelled: 0 entering at the right -> 1 leaving at the left
    var travelled = 1 - p.x / w;
    if (travelled < 0) travelled = 0;
    if (travelled > 1) travelled = 1;

    // water-blue (127,197,228) -> FLOA teal (14,140,126) as the current settles
    var r = Math.round(127 + (14  - 127) * travelled);
    var g = Math.round(197 + (140 - 197) * travelled);
    var b = Math.round(228 + (126 - 228) * travelled);
    var rgb = r + "," + g + "," + b;

    // the tail is drawn faint and the head solid, so the current has direction
    var head = ctx.createLinearGradient(p.pts[0], p.pts[1], p.x, p.y);
    head.addColorStop(0, "rgba(" + rgb + ", 0)");
    head.addColorStop(0.35, "rgba(" + rgb + "," + (p.alpha * 0.55).toFixed(3) + ")");
    head.addColorStop(1, "rgba(" + rgb + "," + p.alpha.toFixed(3) + ")");

    ctx.strokeStyle = head;
    ctx.lineWidth = p.weight;
    ctx.beginPath();
    ctx.moveTo(p.pts[0], p.pts[1]);
    for (var i = 2; i < n; i += 2) ctx.lineTo(p.pts[i], p.pts[i + 1]);
    ctx.stroke();
  }

  /* ---- loop ------------------------------------------------------------ */
  function frame() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (var i = 0; i < particles.length; i++) {
      particles[i] = step(particles[i]);
      draw(particles[i]);
    }

    t += 0.005;
    raf = visible ? requestAnimationFrame(frame) : null;
  }

  /* reduced motion: settle the currents, render one still frame, then stop */
  function still() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var j = 0; j < particles.length; j++) draw(particles[j]);
  }

  /* ---- wiring ---------------------------------------------------------- */
  var resizeTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resize();
      if (reduce) still();
    }, 180);
  });

  resize();

  if (reduce) {
    still();
    return;
  }

  // don't burn frames while the band is off-screen
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }, { threshold: 0 }).observe(canvas);
  }

  raf = requestAnimationFrame(frame);
})();
