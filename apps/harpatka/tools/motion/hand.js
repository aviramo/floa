'use strict';
// Hand-lettered captions and the closing card for the 9:16 ad films, as in motion/adventure-scenes: Amatic, word by word with rise(),
// out with a small blur; the closing is the title, one line under it at a time, and the search box whose click lands on a beat.
// Loaded after core.js. const kit = handKit(root); kit.caption(lines, in, out, {y, x, width, max, times}); kit.closing({...}); kit.tick(t) in seek.
(function () {
  const hump = (t, a, c, p = 1) => { const u = seg(t, a, c); return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u) ** p; };
  const bstep = t => Math.floor(t * 10);
  const jit = (i, seed, t, amp) => (hash(i * 7.13 + bstep(t) * 13.37 + seed * 3.71) - 0.5) * amp;
  function closedD(p) {
    const n = p.length; let d = `M${f2(p[0][0])} ${f2(p[0][1])}`;
    for (let i = 0; i < n; i++) {
      const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n];
      d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
    }
    return d + 'Z';
  }
  function openD(p) {
    const n = p.length; let d = `M${f2(p[0][0])} ${f2(p[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(n - 1, i + 2)];
      d += ` C${f2(p1[0] + (p2[0] - p0[0]) / 6)} ${f2(p1[1] + (p2[1] - p0[1]) / 6)} ${f2(p2[0] - (p3[0] - p1[0]) / 6)} ${f2(p2[1] - (p3[1] - p1[1]) / 6)} ${f2(p2[0])} ${f2(p2[1])}`;
    }
    return d;
  }
  function blobD(cx, cy, rx, ry, n, idx, t, seed, amp) {
    const p = [];
    for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; p.push([cx + rx * Math.cos(a) + jit(idx + i, seed, t, amp), cy + ry * Math.sin(a) + jit(idx + 40 + i, seed, t, amp)]); }
    return closedD(p);
  }

  window.handKit = function (root) {
    const WHITE = '#FFFFFF', ACCENT = '#FF8A5C', TERRA = '#E5562D', INK = '#2C231D', DUSTY = '#EC7F78';
    const HAND = { font: F.HAND, weight: 700 };
    const SHADOW = '0 3px 14px rgba(0,0,0,.72), 0 0 44px rgba(0,0,0,.5)';
    const CAPS = [];
    let end = null;

    function caption(lines, tIn, tOut, opt = {}) {
      const clean = l => l.map(w => w.replace('*', '')).join(' ');
      const size = Math.min(opt.max || 150, ...lines.map(l => fit(clean(l), HAND, opt.width || 800)));
      const x = opt.x ?? W / 2, pitch = size * 0.98, y0 = (opt.y ?? 1450) - (lines.length - 1) * pitch / 2;
      const words = [];
      lines.forEach((l, li) => row(root, l.map(w => w.replace('*', '')), Object.assign({}, HAND, { size, x, y: y0 + li * pitch, gap: size * 0.26, color: WHITE, css: { textShadow: SHADOW, WebkitTextStroke: '1.4px currentColor' } }))
        .forEach((w, k) => { if (l[k].startsWith('*')) w.g.inner.style.color = ACCENT; words.push(w); }));
      CAPS.push({ words, times: opt.times || words.map((w, k) => tIn + k * 0.11), tOut, outDur: opt.outDur || 0.2 });
    }

    // c: {t1, t2, ul, sb, ty, click, lines: [[words, in, out, two lines?], ...]}
    function closing(c) {
      // over a busy picture the closing needs a dark floor under it, so the title reads (c.shade)
      const shade = c.shade ? rect(root, 0, 0, W, H, { background: 'linear-gradient(rgba(24,15,10,0) 880px, rgba(24,15,10,.62) 1140px, rgba(24,15,10,.76) 1400px)' }) : null;
      const TW = ['יוצאים', 'להרפתקה'], TSZ = Math.min(200, fit(TW.join(' '), HAND, 720)), TX = W / 2, TY = 1228, BLOW = 1;
      const title = row(root, TW, Object.assign({}, HAND, { size: TSZ, x: TX, y: TY, gap: TSZ * 0.24, color: WHITE, css: { textShadow: SHADOW } }));
      title[1].g.inner.style.color = ACCENT;
      const tW = title.reduce((a, w) => a + w.w, 0) + TSZ * 0.24, ulY = TY + TSZ * 0.5, SUBY = ulY + 60;
      const ul = svgBox(root, 0, 0, W, H);
      const ulPath = svgEl('path', ul, { fill: 'none', stroke: ACCENT, 'stroke-width': 8, 'stroke-linecap': 'round' });
      (c.lines || []).forEach(([words, a, b, two]) => caption(words, a, b, two ? { x: TX, y: SUBY + 62, width: 800, max: 112 } : { x: TX, y: SUBY, width: 760, max: 104 }));
      const SBY = 1530, SBW = 800, SBH = 124;
      const sb = grp(root, W / 2, SBY);
      const sbSvg = svgBox(sb, -480, -110, 960, 220);
      const sbBox = svgEl('path', sbSvg, { fill: WHITE, stroke: INK, 'stroke-width': 5.5, 'stroke-linejoin': 'round' });
      const BX = -SBW / 2 + 66, BR = 46;
      const btnG = grp(sb, BX, 0);
      const btnSvg = svgBox(btnG, -80, -80, 160, 160);
      const btn = svgEl('path', btnSvg, { fill: TERRA, stroke: INK, 'stroke-width': 5 });
      icon(btnG, P.search, 0, 0, 48, WHITE, 2.7);
      const QUERY = TW.join(' '), QO = { font: F.RUBIK, weight: 600, size: 58, color: INK };
      const qText = txt(sb, '', Object.assign({ x: SBW / 2 - 50, y: 2, align: 'r' }, QO));
      const qW = [...QUERY].map((_, k) => measure(QUERY.slice(0, k + 1), QO).w);
      const caret = rect(sb, 0, -30, 5, 60, { background: TERRA, borderRadius: '3px' });
      const CPS = c.cps || 12, tTyped = c.ty + (QUERY.length - 1) / CPS;
      const cur = cursor(root, 64, INK, WHITE);
      const CUR0 = [940, 1610], CUR1 = [W / 2 + BX + 14, SBY + 18], tCur = c.click - 0.62;
      const sparkSvg = svgBox(root, 0, 0, W, H);
      const sparks = Array.from({ length: 8 }, () => svgEl('path', sparkSvg, { fill: 'none', stroke: INK, 'stroke-width': 5, 'stroke-linecap': 'round' }));
      const HEARTS = [[-30, -150, 66, TERRA], [50, -215, 54, ACCENT], [120, -140, 58, DUSTY], [10, -275, 48, TERRA]].map(([dx, dy, sz, col], k) =>
        ({ el: icon(root, P.heart, W / 2 + BX + dx, SBY + dy, sz, INK, 1.6, col), dx, dy, t0: c.click + 0.04 + 0.07 * k }));
      end = t => {
        if (shade) tf(shade, { o: E.smooth(seg(t, c.t1 - 0.35, c.t1 + 0.1)) });
        const pulse = 0.04 * hump(t, c.click, c.click + 0.35);
        const r1 = rise(t, c.t1, 40, 26, 0.8), sl = slam(t, c.t2, 1.2, 30, 0.6);
        tf(title[0].g, { y: r1.y, o: r1.o, s: 1 + pulse });
        tf(title[1].g, { s: sl.s * (1 + pulse), o: sl.o });
        const uk = E.o3(seg(t, c.ul, c.ul + 0.4));
        if (on(ul, uk > 0.001)) {
          const pts = []; for (let k = 0; k <= 8; k++) { const xx = TX + tW / 2 - k / 8 * tW * uk; pts.push([xx + jit(200 + k, 5, t, 2), ulY + 6 * Math.sin(k * 0.9) + jit(220 + k, 5, t, 2.5) - 5 * (k / 8)]); }
          ulPath.setAttribute('d', openD(pts));
        }
        const sp_ = S(t - c.sb, 15, 0.62);
        if (tf(sb, { s: t < c.sb ? 0.6 : 0.6 + 0.4 * sp_, o: clamp((t - c.sb) / 0.08, 0, 1) })) {
          const pts = [], hw = SBW / 2, hh = SBH / 2, rr = hh;
          for (let k = 0; k < 44; k++) {   // a rounded box, drawn by hand
            const u = k / 44; let x, y;
            const per = 2 * (SBW - 2 * rr) + 2 * Math.PI * rr, d = u * per, top = SBW - 2 * rr;
            if (d < top) { x = hw - rr - d; y = -hh; }
            else if (d < top + Math.PI * rr) { const a = -Math.PI / 2 - (d - top) / rr; x = -hw + rr + rr * Math.cos(a); y = rr * Math.sin(a); }
            else if (d < 2 * top + Math.PI * rr) { x = -hw + rr + (d - top - Math.PI * rr); y = hh; }
            else { const a = Math.PI / 2 - (d - 2 * top - Math.PI * rr) / rr; x = hw - rr + rr * Math.cos(a); y = rr * Math.sin(a); }
            pts.push([480 + x + jit(300 + k, 6, t, 2.6), 110 + y + jit(350 + k, 6, t, 2.6)]);
          }
          sbBox.setAttribute('d', closedD(pts));
          const press = t > c.click && t < c.click + 0.5 ? 1 - 0.1 * hump(t, c.click, c.click + 0.16) + 0.06 * hump(t, c.click + 0.14, c.click + 0.5) : 1;
          btn.setAttribute('d', blobD(80, 80, BR, BR, 10, 400, t, 7, 2.2));
          tf(btnG, { s: press });
          const n = typed(t, c.ty, QUERY.length, CPS);
          qText.inner.textContent = QUERY.slice(0, n);
          const cw = n ? qW[n - 1] : 0;
          tf(caret, { x: SBW / 2 - 50 - cw - 12, o: t < tTyped + 0.1 || Math.floor((t - tTyped) * 2.2) % 2 === 0 ? 1 : 0 });
        }
        const ckk = S(t - tCur, 9, 0.95), press2 = t > c.click ? 1 - 0.14 * hump(t, c.click, c.click + 0.22) : 1;
        tf(cur, { x: lerp(CUR0[0], CUR1[0], ckk), y: lerp(CUR0[1], CUR1[1], ckk), s: press2, o: t > tCur ? 1 : 0 });
        const su = seg(t, c.click, c.click + 0.3);
        sparks.forEach((p, k) => {
          if (!(su > 0 && su < 1)) { p.style.display = 'none'; return; }
          p.style.display = ''; p.style.opacity = Math.sin(Math.PI * su).toFixed(3);
          const a = k / 8 * 2 * Math.PI + 0.2, r1_ = 62 + 30 * E.o3(su), r2_ = r1_ + 28 * (1 - 0.4 * su), cx_ = W / 2 + BX, cy_ = SBY;
          p.setAttribute('d', `M${f2(cx_ + Math.cos(a) * r1_)} ${f2(cy_ + Math.sin(a) * r1_)} L${f2(cx_ + Math.cos(a) * r2_)} ${f2(cy_ + Math.sin(a) * r2_)}`);
        });
        HEARTS.forEach((h, k) => {
          const u = t - h.t0;
          if (u < 0 || u > 1.6) { tf(h.el, { o: 0 }); return; }
          const sc = S(u, 18, 0.55), o = clamp(u / 0.06, 0, 1) * (1 - E.smooth(seg(u, 1.1, 1.6)));
          tf(h.el, { x: -h.dx * 0.15 * (1 - sc) + 8 * Math.sin(u * 5 + k), y: -h.dy * (1 - sc) * 0.9 - 40 * u, s: sc, o });
        });
      };
    }

    function tick(t) {
      CAPS.forEach(cp => cp.words.forEach((w, k) => {
        const r = rise(t, cp.times[k], 34, 26, 0.8), out = seg(t, cp.tOut, cp.tOut + cp.outDur);
        tf(w.g, { y: r.y - 16 * out, o: r.o * (1 - E.smooth(out)), blur: 10 * E.i2(out) });
      }));
      if (end) end(t);
    }
    return { caption, closing, tick };
  };
})();
