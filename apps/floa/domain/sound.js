/* FLOA sound: a live picture of the sound that plays, for any app that plays music in an <audio> element.

   While the player plays, a silent twin of it (its own url of the same blob or file, never sent to the speakers) is listened to through an
   analyser. Every frame the app's targets get a drawing, made of 24 bands of frequencies, each as loud as the sound is in its band right now:
     "curve"  a smooth curve standing on the bottom edge of the host, up to half its height (a card that plays);
     "ring"   a thin continuous line round the host that follows the sound, like the curve bent into a ring (the number of the exercise that plays).
   The drawing is a <canvas> inside a <span class="req req--curve|req--ring"> (kit.css has the look). If nothing is heard (silence, no Web Audio,
   a hidden page) the picture breathes by itself; with reduced motion there is none. Colour: the role colour --primary.

     FLOA_SOUND.attach({
       analyse: true,   // false: do not listen to the sound at all, the picture only breathes by itself (default true)
       player:  function () { return the <audio> element that plays now },
       bus:     an EventTarget that fires "play", "pause" and "ended" for that player,
       targets: function () { return [{ host: element, kind: "curve" | "ring" }, ...] }   // whatever shows "this one plays"
     })
*/
(function () {
  var BANDS = 24, PTS = 64;   /* 24 bands are measured; the curve is drawn through 64 points between them, smoothly, so it reads as one continuous line */

  function attach(cfg) {
    var viz = { ctx: null, an: null, twin: null, buf: null, raf: 0, vals: [], idx: [], peak: [], targets: [], hosts: [], n: 0, sig: 0 };
    function P() { return cfg.player(); }
    var listen = cfg.analyse !== false;   /* false: nothing is listened to (no second element, no AudioContext); the picture only breathes by itself */
    function allowed() { return (!listen || !!(window.AudioContext || window.webkitAudioContext)) && !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }

    function setup() {
      if (viz.an) return true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext; viz.ctx = new AC();
        viz.twin = new Audio(); viz.twin.preload = "auto";
        var src = viz.ctx.createMediaElementSource(viz.twin);
        viz.an = viz.ctx.createAnalyser(); viz.an.fftSize = 256; viz.an.smoothingTimeConstant = .55;
        src.connect(viz.an);   /* the analyser is not connected on: the twin makes no sound */
        viz.buf = new Uint8Array(viz.an.frequencyBinCount);
        for (var b = 0; b < BANDS; b++) {   /* the bands: narrow at the bass, wide at the treble, like the ear; the first one starts at bin 0, where the kick drum is */
          viz.idx.push(Math.round((.5 * (b / (BANDS - 1)) + .5 * Math.pow(b / (BANDS - 1), 1.7)) * (viz.buf.length * .45))); viz.vals.push(0); viz.peak.push(.2);
        }
        return true;
      } catch (x) { viz.an = null; return false; }
    }

    function drawingOf(t) {
      var q = t.host.querySelector(":scope > .req");
      if (!q) {
        q = document.createElement("span"); q.className = "req req--" + (t.kind === "ring" ? "ring" : "curve"); q.setAttribute("aria-hidden", "true");
        q.__cv = document.createElement("canvas"); q.appendChild(q.__cv); t.host.insertBefore(q, t.host.firstChild);
      }
      return q;
    }

    function ring(g, w, h, ink, vals) {   /* one continuous line round the host, as wide as the host (an ellipse for a wide one): its distance from a thin base ring follows the sound, the lowest bands at the top, mirrored on both sides — the card's curve, bent into a ring */
      var cx = w / 2, cy = h / 2, pad = 5, rx = cx - pad, ry = cy - pad, N = Math.max(36, Math.min(96, Math.round(Math.PI * (rx + ry) / 2))), px = [], py = [], i;
      for (i = 0; i < N; i++) {
        var ang = i / N * Math.PI * 2 - Math.PI / 2, co = Math.cos(ang), si = Math.sin(ang), m = Math.abs(i / N * 2 - 1), pos = (1 - m) * (BANDS - 1), i0 = Math.floor(pos), f = pos - i0, sm = f * f * (3 - 2 * f), v = vals[i0] + (vals[Math.min(i0 + 1, BANDS - 1)] - vals[i0]) * sm;
        var nx = co / rx, ny = si / ry, nl = Math.hypot(nx, ny), len = (pad - 1) * (.12 + v * .88);
        px.push(cx + rx * co + nx / nl * len); py.push(cy + ry * si + ny / nl * len);
      }
      function loop() {
        g.beginPath(); g.moveTo((px[N - 1] + px[0]) / 2, (py[N - 1] + py[0]) / 2);
        for (var k = 0; k < N; k++) { var j = (k + 1) % N; g.quadraticCurveTo(px[k], py[k], (px[k] + px[j]) / 2, (py[k] + py[j]) / 2); }
        g.closePath();
      }
      g.fillStyle = ink; g.strokeStyle = ink; g.lineJoin = "round";
      loop(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.globalAlpha = .22; g.fill("evenodd");   /* the band between the base ring and the line */
      g.globalAlpha = .18; g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = .7; g.lineWidth = 1.5; loop(); g.stroke(); g.globalAlpha = 1;
    }

    function draw(q, vals) {   /* one smooth curve over the whole width: filled below, a line on its crest */
      var cv = q.__cv, w = q.clientWidth, h = q.clientHeight; if (!w || !h) return;
      var dpr = window.devicePixelRatio || 1, W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      q.style.color = "var(--primary)"; var ink = getComputedStyle(q).color;   /* the role colour, resolved */
      if (q.classList.contains("req--ring")) { ring(g, w, h, ink, vals); return; }
      var xs = [], ys = [], i;
      for (i = 0; i < PTS; i++) {
        var pos = i / (PTS - 1) * (BANDS - 1), i0 = Math.floor(pos), f = pos - i0, sm = f * f * (3 - 2 * f), v1 = vals[i0], v2 = vals[Math.min(i0 + 1, BANDS - 1)];
        xs.push(i / (PTS - 1) * w); ys.push(h - (.06 + (v1 + (v2 - v1) * sm) * .94) * h);
      }
      function trace(close) {
        g.beginPath(); g.moveTo(xs[0], ys[0]);
        for (i = 1; i < PTS - 1; i++) g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
        g.lineTo(xs[PTS - 1], ys[PTS - 1]);
        if (close) { g.lineTo(w, h); g.lineTo(0, h); g.closePath(); }
      }
      trace(true); g.fillStyle = ink; g.globalAlpha = .5; g.fill();
      g.globalCompositeOperation = "destination-in"; g.globalAlpha = 1;   /* the fill fades toward the bottom */
      var fade = g.createLinearGradient(0, 0, 0, h); fade.addColorStop(0, "rgba(0,0,0,1)"); fade.addColorStop(1, "rgba(0,0,0,.12)"); g.fillStyle = fade; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = "source-over"; trace(false); g.strokeStyle = ink; g.globalAlpha = .7; g.lineWidth = 2; g.lineJoin = "round"; g.stroke(); g.globalAlpha = 1;
    }

    function clear() { document.querySelectorAll(".req").forEach(function (q) { q.remove(); }); viz.targets = []; viz.hosts = []; }
    function stop() {
      if (viz.raf) { cancelAnimationFrame(viz.raf); viz.raf = 0; }
      try { if (viz.twin) viz.twin.pause(); } catch (x) { /* none */ }
      if (viz.twin && viz.twin.__u) { try { URL.revokeObjectURL(viz.twin.__u); } catch (x) { /* none */ } viz.twin.__u = ""; viz.twin.__for = ""; viz.twin.removeAttribute("src"); }
      for (var b = 0; b < viz.vals.length; b++) viz.vals[b] = 0;
      clear();
    }

    function tick() {
      viz.raf = 0;
      var el = P();
      if (!el || el.paused || el.ended || !el.src || document.hidden || (listen && !viz.an)) { if (document.hidden) stop(); return; }
      try {
        var tw = viz.twin;
        if (listen && tw.__for !== el.src) {   /* the twin plays its OWN url of the same blob (two elements on one url make the second one silent) */
          tw.__for = el.src; var want = el.src;
          fetch(want).then(function (r) { return r.blob(); }).then(function (bl) { if (tw.__for !== want) return; var old = tw.__u; tw.__u = URL.createObjectURL(bl); tw.src = tw.__u; tw.currentTime = el.currentTime || 0; if (old) URL.revokeObjectURL(old); }, function () { tw.__for = ""; viz.sig = 0; });
        }
        if (listen && tw.src) {
          if (tw.paused) { var pr = tw.play(); if (pr && pr.catch) pr.catch(function () { /* no sound analysis: the picture breathes alone */ }); }
          if (Math.abs(tw.currentTime - el.currentTime) > .25) tw.currentTime = el.currentTime;
          viz.an.getByteFrequencyData(viz.buf);
          var any = 0, i; for (i = 0; i < viz.buf.length; i++) any |= viz.buf[i];
          if (any) viz.sig = performance.now();
          var vol = Math.min(1, el.volume);   /* the picture is as low as the sound during a fade */
          for (i = 0; i < BANDS; i++) {
            var lo = viz.idx[i], hiB = i < BANDS - 1 ? Math.max(lo + 1, viz.idx[i + 1]) : viz.buf.length, s = 0, k;
            for (k = lo; k < hiB; k++) s += viz.buf[k];
            var raw = s / (hiB - lo) / 255;
            viz.peak[i] = Math.max(raw, viz.peak[i] * .996, .12);   /* every band is measured against its own loudest moment: music is strong in the bass and weak in the treble, and without this the same side would always be the tall one */
            var v = Math.pow(Math.min(1, raw / viz.peak[i]), 1.5) * vol;
            viz.vals[i] = Math.max(v, viz.vals[i] * .84);   /* a fast rise and a slow fall */
          }
        }
        if (!(viz.n++ % 20)) {
          viz.targets = cfg.targets() || []; viz.hosts = viz.targets.map(function (t) { return t.host; });
          document.querySelectorAll(".req").forEach(function (q) { if (viz.hosts.indexOf(q.parentNode) < 0) q.remove(); });   /* what stopped playing loses its picture */
        }
        var heard = performance.now() - viz.sig < 1500, now = performance.now() / 1000, show = viz.vals;
        if (!heard) { show = []; for (var z = 0; z < BANDS; z++) show.push(.22 + .16 * Math.sin(now * 1.7 + z * .55) + .08 * Math.sin(now * 2.9 + z * 1.3)); }   /* nothing heard: the picture breathes by itself */
        viz.targets.forEach(function (t) { if (!t.host.isConnected) return; draw(drawingOf(t), show); });
      } catch (x) { stop(); return; }
      viz.raf = requestAnimationFrame(tick);
    }

    function start() {
      if (viz.raf || !allowed() || (listen && !setup())) return;
      try { if (viz.ctx && viz.ctx.state === "suspended") viz.ctx.resume(); } catch (x) { /* none */ }
      viz.raf = requestAnimationFrame(tick);
    }
    cfg.bus.addEventListener("play", start); cfg.bus.addEventListener("pause", stop); cfg.bus.addEventListener("ended", stop);
    document.addEventListener("visibilitychange", function () { var el = P(); if (!document.hidden && el && !el.paused) start(); });
  }

  window.FLOA_SOUND = { attach: attach };
})();
