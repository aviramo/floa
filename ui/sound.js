/* FLOA sound: a live picture of the sound that plays, for any app that plays music in an <audio> element.

   While the player plays, a silent twin of it (its own url of the same blob or file, never sent to the speakers) is listened to through an
   analyser. Every frame what plays gets a drawing, made of 24 bands of frequencies, each as loud as the sound is in its band right now:
     "curve"  on EVERY card the page marks as playing (.rcard.is-play): a smooth curve standing on its bottom edge, up to half its height.
              The app passes no cards: it marks the class and the kit draws, at once (a MutationObserver, not a scan every few frames);
     "ring"   a thin continuous line round each element of rings() (a number that stands for what plays where there is no card).
   The drawing is a <canvas> inside a <span class="req req--curve|req--ring">. kit.css has the look: the colour (.req { color: var(--primary) })
   and the tokens --eq-crest, --eq-base, --eq-line, --eq-line-w, read once per drawing. This file writes no style and holds no opacity or width.
   The picture IS the music, with no fade of its own: its height is the analyser's level times the player's volume, so it grows with the
   player's fade in, goes down with its fade out (it stays on the card that stopped until the player pauses), and with no sound there is none.
   If the sound cannot be analysed (no Web Audio, analyse: false, the file cannot be read) it breathes by itself, as loud as the player's volume.
   Reduced motion: one still curve (and ring), drawn once when a card starts to play and removed when it stops. No loop, no analysis.

     FLOA_SOUND.attach({
       player:  function () { return the <audio> element that plays now },
       bus:     an EventTarget that fires "play", "pause" and "ended" for that player,
       analyse: true,   // false: do not listen to the sound at all, the picture only breathes by itself (default true)
       rings:   function () { return [element, ...] }   // optional: the numbers that get a ring
     })
*/
(function () {
  var BANDS = 24, PTS = 64;   /* 24 bands are measured; the curve is drawn through 64 points between them, smoothly, so it reads as one continuous line */

  function attach(cfg) {
    var viz = { ctx: null, an: null, twin: null, buf: null, raf: 0, vals: [], idx: [], peak: [], targets: [], reqs: [], last: [], lastEl: null, live: false, dirty: true, on: false, mo: null, ro: null };
    function P() { return cfg.player(); }
    var AC = window.AudioContext || window.webkitAudioContext;
    var listen = cfg.analyse !== false && !!AC;   /* false: nothing is listened to (no second element, no AudioContext); the picture only breathes by itself */
    function still() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    function playing() { var el = P(); return !!(el && !el.paused && !el.ended && el.src && !document.hidden); }
    function breath(t) { var b = []; for (var z = 0; z < BANDS; z++) b.push(.22 + .16 * Math.sin(t * 1.7 + z * .55) + .08 * Math.sin(t * 2.9 + z * 1.3)); return b; }   /* the picture breathing by itself, at time t in seconds; at 0 it is the still curve of reduced motion */

    function setup() {
      if (viz.an) return true;
      try {
        viz.ctx = new AC();
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

    function num(cs, name) { return parseFloat(cs.getPropertyValue(name)) || 0; }
    function drawingOf(t) {
      var q = viz.reqs.filter(function (r) { return r.parentNode === t.host; })[0];
      if (!q) {
        q = document.createElement("span"); q.className = "req req--" + (t.kind === "ring" ? "ring" : "curve"); q.setAttribute("aria-hidden", "true");
        q.__cv = document.createElement("canvas"); q.appendChild(q.__cv); t.host.insertBefore(q, t.host.firstChild); viz.reqs.push(q);
        var cs = getComputedStyle(q);   /* the look is kit.css's, read once: the role colour and the tokens of the picture */
        q.__k = { ink: cs.color, crest: num(cs, "--eq-crest"), base: num(cs, "--eq-base"), line: num(cs, "--eq-line"), lw: num(cs, "--eq-line-w"), bw: num(cs, "--bw"), pad: num(cs, "--gap-tight") + num(cs, "--bw") };
        var g = q.__cv.getContext("2d"), p; q.__cv.width = q.__cv.height = 1; g.fillStyle = q.__k.ink; g.fillRect(0, 0, 1, 1); p = g.getImageData(0, 0, 1, 1).data; q.__k.rgb = p[0] + "," + p[1] + "," + p[2];   /* the role colour as r,g,b (it may be any CSS colour, oklch too), so an opacity can be given to it in a gradient */
        q.__w = q.clientWidth; q.__h = q.clientHeight;   /* its size, kept: measured again only when it changes (ResizeObserver), never every frame */
        if (viz.ro) viz.ro.observe(q);
      }
      return q;
    }
    function tint(k, a) { return "rgba(" + k.rgb + "," + a + ")"; }

    function ring(g, w, h, k, vals, lvl) {   /* one continuous line round the host, as wide as the host (an ellipse for a wide one): its distance from a thin base ring follows the sound, the lowest bands at the top, mirrored on both sides; the card's curve, bent into a ring */
      var cx = w / 2, cy = h / 2, pad = k.pad, rx = cx - pad, ry = cy - pad, N = Math.max(36, Math.min(96, Math.round(Math.PI * (rx + ry) / 2))), px = [], py = [], i;
      for (i = 0; i < N; i++) {
        var ang = i / N * Math.PI * 2 - Math.PI / 2, co = Math.cos(ang), si = Math.sin(ang), m = Math.abs(i / N * 2 - 1), pos = (1 - m) * (BANDS - 1), i0 = Math.floor(pos), f = pos - i0, sm = f * f * (3 - 2 * f), v = vals[i0] + (vals[Math.min(i0 + 1, BANDS - 1)] - vals[i0]) * sm;
        var nx = co / rx, ny = si / ry, nl = Math.hypot(nx, ny), len = (pad - k.bw) * (.12 * lvl + v * .88);
        px.push(cx + rx * co + nx / nl * len); py.push(cy + ry * si + ny / nl * len);
      }
      function loop() {
        g.beginPath(); g.moveTo((px[N - 1] + px[0]) / 2, (py[N - 1] + py[0]) / 2);
        for (var k = 0; k < N; k++) { var j = (k + 1) % N; g.quadraticCurveTo(px[k], py[k], (px[k] + px[j]) / 2, (py[k] + py[j]) / 2); }
        g.closePath();
      }
      g.fillStyle = k.ink; g.strokeStyle = k.ink; g.lineJoin = "round";
      loop(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.globalAlpha = k.crest; g.fill("evenodd");   /* the band between the base ring and the line */
      g.globalAlpha = k.base; g.lineWidth = k.bw; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = k.line; g.lineWidth = k.lw; loop(); g.stroke(); g.globalAlpha = 1;
    }

    function draw(q, vals, lvl) {   /* one smooth curve over the whole width: filled below, a line on its crest. lvl: the player's volume (the floor of the curve goes down with it too) */
      var cv = q.__cv, k = q.__k, w = q.__w, h = q.__h; if (!w || !h) return;
      var dpr = window.devicePixelRatio || 1, W = Math.round(w * dpr), H = Math.round(h * dpr);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
      if (!(Math.max.apply(null, vals) > 1 / 255)) return;   /* no sound (silence, or the volume at zero): no picture. 1/255 is one step of the analyser */
      if (q.classList.contains("req--ring")) { ring(g, w, h, k, vals, lvl); return; }
      var xs = [], ys = [], i;
      for (i = 0; i < PTS; i++) {
        var pos = i / (PTS - 1) * (BANDS - 1), i0 = Math.floor(pos), f = pos - i0, sm = f * f * (3 - 2 * f), v1 = vals[i0], v2 = vals[Math.min(i0 + 1, BANDS - 1)];
        xs.push(i / (PTS - 1) * w); ys.push(h - (.06 * lvl + Math.max(0, v1 + (v2 - v1) * sm) * .94) * h);
      }
      function trace(close) {
        g.beginPath(); g.moveTo(xs[0], ys[0]);
        for (i = 1; i < PTS - 1; i++) g.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2);
        g.lineTo(xs[PTS - 1], ys[PTS - 1]);
        if (close) { g.lineTo(w, h); g.lineTo(0, h); g.closePath(); }
      }
      var fill = g.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, tint(k, k.crest)); fill.addColorStop(1, tint(k, k.base));   /* the fill fades toward the bottom: --eq-crest at the top, --eq-base at the bottom */
      trace(true); g.fillStyle = fill; g.fill();
      trace(false); g.strokeStyle = k.ink; g.globalAlpha = k.line; g.lineWidth = k.lw; g.lineJoin = "round"; g.stroke(); g.globalAlpha = 1;
    }

    function clear() { viz.reqs.forEach(function (q) { if (viz.ro) viz.ro.unobserve(q); q.remove(); }); viz.reqs = []; viz.targets = []; }   /* only its own drawings */
    function targets() {   /* what gets a drawing now: every card marked as playing, and the app's rings */
      var t = [];
      document.querySelectorAll(".rcard.is-play").forEach(function (c) { t.push({ host: c, kind: "curve" }); });
      ((cfg.rings && cfg.rings()) || []).forEach(function (n) { if (n) t.push({ host: n, kind: "ring" }); });
      if (t.length || still()) { viz.last = t; viz.lastEl = P(); }
      else if (P() === viz.lastEl) t = viz.last = viz.last.filter(function (x) { return x.host.isConnected; });   /* the song goes down to a pause: the page already says it stopped, but the sound is still heard, so the picture stays where it was and goes down with it */
      viz.reqs = viz.reqs.filter(function (q) {   /* what stopped playing loses its picture */
        var keep = t.some(function (x) { return x.host === q.parentNode; });
        if (!keep) { if (viz.ro) viz.ro.unobserve(q); q.remove(); }
        return keep;
      });
      return t;
    }
    function paintStill() {   /* reduced motion: the still curve on what plays now, drawn once (again only when what plays or its size changes) */
      if (!viz.on) return;
      var b = breath(0);
      viz.targets = targets(); viz.targets.forEach(function (t) { if (!t.host.isConnected) return; var q = drawingOf(t); if (!q.__still) { q.__still = true; draw(q, b, 1); } });
    }
    function wake() {   /* something on the page changed (a card marked or unmarked as playing, a list drawn again): look again at once */
      viz.dirty = true;
      if (!viz.on) return;
      if (still()) { paintStill(); return; }
      if (!viz.raf && playing()) viz.raf = requestAnimationFrame(tick);
    }
    function watch() {
      if (!viz.mo && window.MutationObserver) { viz.mo = new MutationObserver(wake); viz.mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] }); }
      if (!viz.ro && window.ResizeObserver) viz.ro = new ResizeObserver(function (es) { es.forEach(function (e) { var q = e.target; q.__w = q.clientWidth; q.__h = q.clientHeight; q.__still = false; }); if (viz.on && still()) paintStill(); });
    }
    function stop() {
      viz.on = false; viz.lastEl = null; viz.last = [];
      if (viz.mo) { viz.mo.disconnect(); viz.mo = null; }
      if (viz.raf) { cancelAnimationFrame(viz.raf); viz.raf = 0; }
      try { if (viz.twin) viz.twin.pause(); } catch (x) { /* none */ }
      if (viz.twin && viz.twin.__u) { try { URL.revokeObjectURL(viz.twin.__u); } catch (x) { /* none */ } viz.twin.__u = ""; viz.twin.__for = ""; viz.twin.removeAttribute("src"); }
      for (var b = 0; b < viz.vals.length; b++) viz.vals[b] = 0;
      clear();
    }

    function tick() {
      viz.raf = 0;
      var el = P();
      if (!playing()) { if (document.hidden) stop(); return; }
      try {
        if (viz.dirty) { viz.dirty = false; viz.targets = targets(); }
        if (!viz.targets.length) return;   /* nothing on the page shows what plays: the loop rests until a card is marked (the watcher wakes it) */
        var tw = viz.twin, vol = Math.min(1, Math.max(0, el.volume));   /* the player's volume: the app's fades in and out are made with it, and the picture is as loud as the sound */
        if (listen && tw.__for !== el.src) {   /* the twin plays its OWN url of the same blob (two elements on one url make the second one silent) */
          tw.__for = el.src; viz.live = false; var want = el.src;
          fetch(want).then(function (r) { return r.blob(); }).then(function (bl) { if (tw.__for !== want) return; var old = tw.__u; tw.__u = URL.createObjectURL(bl); tw.src = tw.__u; tw.currentTime = el.currentTime || 0; if (old) URL.revokeObjectURL(old); }, function () { /* not readable: the picture breathes for this song */ });
        }
        if (listen && tw.src) {
          if (tw.paused) { var pr = tw.play(); if (pr && pr.catch) pr.catch(function () { /* no sound analysis: the picture breathes alone */ }); }
          if (Math.abs(tw.currentTime - el.currentTime) > .25) tw.currentTime = el.currentTime;
          viz.an.getByteFrequencyData(viz.buf);
          var any = 0, i; for (i = 0; i < viz.buf.length; i++) any |= viz.buf[i];
          if (any) viz.live = true;   /* the analysis works for this song: from now on the picture is only what is heard, silence included */
          for (i = 0; i < BANDS; i++) {
            var lo = viz.idx[i], hiB = i < BANDS - 1 ? Math.max(lo + 1, viz.idx[i + 1]) : viz.buf.length, s = 0, k;
            for (k = lo; k < hiB; k++) s += viz.buf[k];
            var raw = s / (hiB - lo) / 255;
            viz.peak[i] = Math.max(raw, viz.peak[i] * .996, .12);   /* every band is measured against its own loudest moment: music is strong in the bass and weak in the treble, and without this the same side would always be the tall one */
            var v = Math.pow(Math.min(1, raw / viz.peak[i]), 1.5) * vol;
            viz.vals[i] = Math.max(v, viz.vals[i] * .84);   /* a fast rise and a slow fall */
          }
        }
        var show = viz.live ? viz.vals : breath(performance.now() / 1000).map(function (v) { return v * vol; });   /* nothing can be analysed: the picture breathes by itself, as loud as the player */
        viz.targets.forEach(function (t) { if (!t.host.isConnected) return; draw(drawingOf(t), show, vol); });
      } catch (x) { stop(); return; }
      viz.raf = requestAnimationFrame(tick);
    }

    function start() {
      if (viz.on && (viz.raf || still())) return;
      viz.on = true; viz.dirty = true; watch();
      if (still()) { paintStill(); return; }   /* reduced motion: no loop and no analysis */
      if (listen && !setup()) listen = false;
      try { if (viz.ctx && viz.ctx.state === "suspended") viz.ctx.resume(); } catch (x) { /* none */ }
      if (!viz.raf) viz.raf = requestAnimationFrame(tick);
    }
    cfg.bus.addEventListener("play", start); cfg.bus.addEventListener("pause", stop); cfg.bus.addEventListener("ended", stop);
    document.addEventListener("visibilitychange", function () { var el = P(); if (!document.hidden && el && !el.paused) start(); });
  }

  window.FLOA_SOUND = { attach: attach };
})();
