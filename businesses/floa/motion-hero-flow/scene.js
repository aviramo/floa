// FLOA hero: from the mess to one flow.
// A business's daily mess piles up, a single teal drop falls, and the mess becomes a river that runs
// through five gates: advice, websites and landing pages, apps, automations, AI. One shape (the drop)
// is born at the impact and morphs through every gate. Everything is a pure function of t.
(() => {
  'use strict';

  const RY = 330, LAB = 384;                                  // river line y, gate labels y (world, 0,0 = frame centre)
  const GX = [540, 270, 0, -270, -540];                       // gate x: the first gate is on the right (Hebrew reads right to left)
  const GN = ['ייעוץ', 'אתרים', 'אפליקציות', 'אוטומציות', 'AI'];
  const CHIPS = ['ייעוץ טכנולוגי לעסק', 'אתרים ודפי נחיתה', 'פיתוח אפליקציות', 'אוטומציות', 'AI וסוכנים'];
  const T = {
    calm: 1.4, chaos: 1.45, jit: 3.85, dropIn: 3.5, drop: 3.95, hit: 4.35, sweep: 4.55,
    g: [5.35, 7.85, 9.6, 11.35, 13.1], panel: 15.25, close: 16.95,
  };
  const SEAM = DUR + 1.45;                                    // a window that crosses the loop seam ends here (next loop)

  const wave = x => 14 * Math.sin(x / 130);
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const mixc = (a, b, k) => { const A = hex(a), B = hex(b), q = clamp(k, 0, 1); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], q))).join(',')})`; };
  const R = (p, x, y, w, h, r, bg, css) => box(p, x, y, w, h, Object.assign({ background: bg, borderRadius: r + 'px' }, css || {}));
  const L = (p, s, x, y, size, color, weight = 600, align = 'c') => txt(p, s, { x, y, size, font: F.RUBIK, weight, color, align });
  const win = (t, a, b, wi = 18, wo = 24) => vis(t, a, b, wi, wo);
  const put = (g, v, dist = 0) => tf(g, { o: v, y: (1 - v) * dist, blur: (1 - v) * 8 });   // content swap: short blur, short rise
  const appear = (t, t0, dist = 18) => ({ o: clamp((t - t0) / 0.08, 0, 1), y: (1 - S(t - t0, 22, 0.8)) * dist });
  const MAIL = ['M3.5 6.5h17v11h-17z', 'M3.5 7.2l8.5 6.3 8.5-6.3'];
  const TASK = ['M5 4.5h14v15H5z', 'M8.5 12l2.5 2.5L15.5 9.5'];
  const CHAT = ['M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.4A8 8 0 1 1 21 12z'];
  const mkSvg = parent => {
    const s = svgEl('svg', parent, { width: W, height: H, viewBox: `${-W / 2} ${-H / 2} ${W} ${H}` });
    s.style.cssText = `position:absolute;left:${-W / 2}px;top:${-H / 2}px;overflow:visible`;
    return s;
  };

  scene('main', 0, DUR, { bg: C.PAPER }, (root) => {
    const cam = grp(root, W / 2, H / 2);
    const ups = [];

    // ===== the river and its five gates ======================================================
    const under = mkSvg(cam);
    const pts = []; for (let x = 840; x >= -840; x -= 20) pts.push(`${x},${(RY + wave(x)).toFixed(1)}`);
    const d = 'M' + pts.join(' L');
    svgEl('path', under, { d, fill: 'none', stroke: C.TINT, 'stroke-width': 38, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.8 });
    svgEl('path', under, { d, fill: 'none', stroke: C.TEAL, 'stroke-width': 3, opacity: 0.3 });
    const flow = svgEl('path', under, { d, fill: 'none', stroke: C.TEAL, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '26 24' });
    ups.push(t => flow.setAttribute('stroke-dashoffset', (-125 * t).toFixed(2)));   // 125 px/s * 18.4 s = 46 dash periods: a seamless loop

    GX.forEach((x, i) => {
      const y = RY + wave(x);
      const ring = svgEl('circle', under, { cx: x, cy: y, r: 17, fill: C.WHITE, stroke: C.TEAL, 'stroke-width': 3, 'stroke-opacity': 0.5 });
      const dot = svgEl('circle', under, { cx: x, cy: y, r: 0, fill: C.TEAL });
      const lab = txt(cam, GN[i], { x, y: LAB, size: 30, font: F.RUBIK, weight: 600, color: C.GREY });
      const burst = R(cam, x, y, 34, 34, 17, 'transparent', { border: `3px solid ${C.TEAL}`, boxSizing: 'border-box' });
      ups.push(t => {
        const lit = win(t, T.g[i] - 0.05, T.close - 0.05, 14, 12);
        const u = t - T.g[i];
        const bump = u > 0 ? 0.45 * Math.exp(-8 * u) * Math.sin(16 * u) : 0;
        dot.setAttribute('r', (10 * lit * (1 + bump)).toFixed(2));
        ring.setAttribute('stroke-opacity', (0.5 + 0.5 * lit).toFixed(3));
        lab.inner.style.color = mixc(C.GREY, C.INK, lit);
        const p = clamp(u / 0.55, 0, 1);
        tf(burst, { s: 1 + 2.2 * E.o3(p), o: u > 0 && u < 0.55 ? 0.7 * (1 - p) : 0 });
      });
    });

    // the pulse that carries the story from gate to gate
    GX.forEach((x, i) => {
      const pd = R(cam, 0, 0, 26, 26, 13, C.TEAL, { border: `4px solid ${C.WHITE}`, boxSizing: 'border-box' });
      const from = i === 0 ? 800 : GX[i - 1], t0 = T.g[i] - 0.55;
      ups.push(t => {
        const px = lerp(from, x, S(t - t0, 11, 1));
        tf(pd, { x: px, y: RY + wave(px), o: win(t, t0, T.g[i] + 0.12, 40, 30) });
      });
    });

    // the label of the gate the story is in
    CHIPS.forEach((s, i) => {
      const g = grp(cam, 0, -385);
      R(g, 0, 0, measure(s, { size: 34, font: F.RUBIK, weight: 600 }).w + 70, 64, 32, C.TINT);
      L(g, s, 0, 0, 34, C.TEALD, 600);
      const end = i < 4 ? T.g[i + 1] : T.panel;
      ups.push(t => { const v = win(t, T.g[i], end); tf(g, { o: v, y: (1 - v) * 14, blur: (1 - v) * 5 }); });
    });

    const rip = mkSvg(cam);                                     // the water: under the mess, so the ripples pass behind it

    // ===== the mess ==========================================================================
    const SPEC = [
      { k: 'bubble', s: 'מה המחיר?', x: -215, y: -135, w: 250, h: 80, r: -6, fx: -700, fy: -100 },
      { k: 'bubble', s: 'שלחתי תמונה', x: 150, y: -185, w: 300, h: 80, r: 5, fx: 700, fy: -250 },
      { k: 'sticky', s: 'לחזור ללקוח', x: -55, y: 15, w: 280, h: 96, r: -3, fx: 0, fy: -600 },
      { k: 'file', s: 'איפה הקובץ?', x: 275, y: -20, w: 310, h: 80, r: 7, fx: 800, fy: 0 },
      { k: 'bubble', s: 'שכחנו לענות', x: -300, y: 135, w: 300, h: 80, r: 4, fx: -800, fy: 300 },
      { k: 'sheet', x: 95, y: 125, w: 210, h: 150, r: -8, fx: 500, fy: 500 },
      { k: 'bell', x: -450, y: -10, w: 120, h: 120, r: -10, fx: -800, fy: -200 },
      { k: 'mail', x: 430, y: 150, w: 140, h: 104, r: 9, fx: 800, fy: 400 },
      { k: 'badge', s: '!', x: -120, y: 200, w: 76, h: 76, r: 0, fx: -300, fy: 600 },
    ];
    const K = 1.18;                                              // the mess is drawn a little larger than life: it has to fill the frame
    SPEC.forEach(sp => { sp.x *= K; sp.y *= K; });
    const order = SPEC.map((_, i) => i).sort((a, b) => SPEC[a].x - SPEC[b].x);
    const RAD = { bubble: 30, sticky: 14, file: 20, sheet: 20, bell: 36, mail: 22, badge: 38 };
    const SOFT = { boxShadow: '0 8px 18px -10px rgba(15,42,51,.35)' };

    SPEC.forEach((sp, i) => {
      const anchor = grp(cam, 0, 0), g = grp(anchor, 0, 0), rad = RAD[sp.k];
      g.style.transform = `scale(${K})`;
      const card = { border: `2px solid ${C.LINE}`, boxSizing: 'border-box' };
      const base = sp.k === 'badge' ? R(g, 0, 0, sp.w, sp.h, rad, C.CLAY)
        : sp.k === 'sticky' ? R(g, 0, 0, sp.w, sp.h, rad, C.CLAYT, SOFT)
        : sp.k === 'bell' ? R(g, 0, 0, sp.w, sp.h, rad, C.CLAYT)
        : R(g, 0, 0, sp.w, sp.h, rad, C.WHITE, Object.assign({}, card, SOFT));
      const tint = R(g, 0, 0, sp.w, sp.h, rad, C.TINT);
      const deco = [], mark = [];
      if (sp.k === 'bubble') {
        L(g, sp.s, 0, 0, 30, C.INK, 500);
        deco.push(R(g, sp.w / 2 - 10, -sp.h / 2 + 8, 22, 22, 11, C.CLAY));
      } else if (sp.k === 'sticky') {
        L(g, sp.s, 0, 6, 30, C.INK, 600);
        deco.push(R(g, 0, -sp.h / 2 + 11, 64, 6, 3, C.CLAY));
      } else if (sp.k === 'file') {
        L(g, sp.s, sp.w / 2 - 88, 0, 30, C.INK, 500, 'r');
        deco.push(icon(g, P.file, sp.w / 2 - 48, 0, 40, C.CLAY, 2.2));
      } else if (sp.k === 'sheet') {
        [-26, 0, 26].forEach(y => deco.push(R(g, 0, y, sp.w - 34, 3, 1.5, C.LINE)));
        [-52, 0, 52].forEach(x => deco.push(R(g, x, 0, 3, sp.h - 34, 1.5, C.LINE)));
        deco.push(R(g, 26, 13, 46, 24, 6, C.CLAYT));
      } else if (sp.k === 'bell') {
        deco.push(icon(g, P.bell, 0, 0, 62, C.CLAY, 2.2));
      } else if (sp.k === 'mail') {
        deco.push(icon(g, MAIL, 0, 0, 58, C.CLAY, 2.2));
      } else if (sp.k === 'badge') {
        deco.push(L(g, '!', 0, 2, 46, C.WHITE, 700));
      }
      if (!sp.s || sp.k === 'badge') mark.push(icon(g, P.check, 0, 0, 44, C.TEALD, 3));

      const tA = T.chaos + 0.16 * i, tS = T.sweep + 0.13 * order.indexOf(i);
      const tR = T.hit + Math.hypot(sp.x, (sp.y + 20) * 2) / 950;     // when the ripple reaches it
      ups.push(t => {
        const a = S(t - tA, 13, 0.72), J = 1 - S(t - T.jit, 16, 1);
        let x = sp.fx + (sp.x - sp.fx) * a, y = sp.fy + (sp.y - sp.fy) * a;
        let r = sp.r + (1 - a) * (sp.r >= 0 ? 28 : -28);
        x += 6 * vnoise(t * 2.1, i) * J; y += 5 * vnoise(t * 2.5, i + 9) * J; r += 1.4 * vnoise(t * 1.7, i + 3) * J;
        const u = t - tR;
        let s = 1 + (u > 0 && u < 1 ? 0.05 * Math.exp(-7 * u) * Math.cos(20 * u) : 0);
        let k = 0, fade = 1;
        const tau = t - tS;
        if (tau > 0) {
          k = S(tau, 8, 1);
          const x0 = x, y0 = y;
          x = x0 - 380 * (tau + 0.35 * tau * tau);
          y = lerp(y0, RY - 8 + wave(x), k);
          s *= lerp(1, 0.34, k); r *= 1 - k;
          fade = clamp((x + 650) / 110, 0, 1);                       // gone before the left safe edge
        }
        tf(anchor, { x, y, r, s, o: clamp((t - tA) / 0.08, 0, 1) * fade });
        tf(tint, { o: k });
        deco.forEach(e => tf(e, { o: 1 - k }));
        mark.forEach(e => tf(e, { o: k }));
      });
    });

    // ===== the drop and its ripples ==========================================================
    const drop = grp(cam, 0, 0);
    R(drop, 0, 0, 34, 34, 17, C.TEAL);
    ups.push(t => {
      const u = t - T.drop;
      let y = -400 + 5 * Math.sin((t - T.dropIn) * 8) * (1 - clamp((t - 3.7) / 0.25, 0, 1)), sy = 1;
      if (u > 0) { y = -400 + 0.5 * 4750 * u * u; sy = 1 + 0.9 * Math.min(1, u / 0.4); }
      tf(drop, { y, s: S(t - T.dropIn, 20, 0.7), sy, sx: 1 / Math.sqrt(sy), o: t >= T.dropIn && t < T.hit ? 1 : 0 });
    });
    const rings = [0, 1, 2].map(() => svgEl('ellipse', rip, { cx: 0, cy: -20, rx: 0, ry: 0, fill: 'none', stroke: C.TEAL, 'stroke-opacity': 0 }));
    ups.push(t => rings.forEach((e, i) => {
      const u = t - (T.hit + 0.16 * i), p = u / 1.5;
      if (u <= 0 || p >= 1) { e.setAttribute('stroke-opacity', 0); return; }
      const rx = 780 * E.o3(p);
      e.setAttribute('rx', rx.toFixed(1)); e.setAttribute('ry', (rx * 0.46).toFixed(1));
      e.setAttribute('stroke-width', (6 * (1 - p) + 1.5).toFixed(2));
      e.setAttribute('stroke-opacity', (0.85 * Math.pow(1 - p, 1.3)).toFixed(3));
    }));

    // ===== the one shape: born from the drop, morphs through every gate =====================
    // [w, h, radius, y, ink, teal, zoom]: the zoom is the camera, so each state fills the frame
    const PILL = [300, 104, 52, -20, 1, 0, 1];
    const shapeAt = track(PILL, [
      [T.calm, [10, 10, 5, -20, 1, 0, 1], 24, 1],                          // the pill collapses into the mess
      [3.9, [36, 36, 18, -20, 0, 1, 1], 40, 1],                            // set while hidden: the size and colour of the drop
      [T.g[0] - 0.05, [700, 360, 40, -20, 0, 0, 1.14], 13, 0.84],          // gate 1: a chat
      [T.g[1], [860, 500, 30, -20, 0, 0, 1.14], 13, 0.84],                 // gate 2: a landing page
      [T.g[2], [340, 620, 60, -10, 0, 0, 0.98], 13, 0.84],                 // gate 3: an app
      [T.g[3], [1000, 260, 40, -20, 0, 0, 1.14], 13, 0.84],                // gate 4: an automation
      [T.g[4], [820, 500, 40, -20, 0, 0, 1.14], 13, 0.84],                 // gate 5: the agent, then the panel
      [T.close, [null, null, null, null, 1, 0, null], 40, 1],              // back to the pill: the colour turns dark first, fast,
      [T.close, [300, 104, 52, -20, null, null, 1], 14, 0.84],             // and then the shape shrinks: no grey in between
    ]);
    const shCol = (ink, teal) => {
      const A = hex(C.WHITE), I = hex(C.INK), Tl = hex(C.TEAL);
      const base = A.map((v, i) => lerp(v, I[i], clamp(ink, 0, 1)));
      return `rgb(${base.map((v, i) => Math.round(lerp(v, Tl[i], clamp(teal, 0, 1)))).join(',')})`;
    };
    const sh = grp(cam, 0, 0);
    const shadow = div(sh, { background: C.INK });
    const bgEl = div(sh, { overflow: 'hidden', boxSizing: 'border-box', border: '1.5px solid rgba(15,42,51,.07)' });
    const inner = grp(bgEl, 0, 0);
    ups.push(t => {
      const [w, h, r, y, ink, teal, z] = shapeAt(t), o = win(t, 4.33, SEAM);
      tf(sh, { y, s: z });
      for (const e of [shadow, bgEl]) Object.assign(e.style, { left: -w / 2 + 'px', top: -h / 2 + 'px', width: w + 'px', height: h + 'px', borderRadius: r + 'px' });
      bgEl.style.background = shCol(ink, teal);
      inner.style.left = (w / 2 - 1.5) + 'px'; inner.style.top = (h / 2 - 1.5) + 'px';
      tf(bgEl, { o });
      tf(shadow, { y: 18, o: 0.2 * o, blur: 26 });
    });

    // --- pill: FLOA, and under it what FLOA does
    const gPill = grp(inner, 0, 0);
    txt(gPill, 'FLOA', { x: 0, y: 0, size: 52, font: F.RUBIK, weight: 700, color: C.WHITE, ls: 0.1 });
    const line = L(cam, 'אתרים, אפליקציות ואוטומציות, עם AI', 0, 92, 44, C.INK2, 500);
    ups.push(t => { const v = win(t, T.close + 0.05, SEAM); put(gPill, v); tf(line, { o: win(t, T.close + 0.05, SEAM), y: (1 - win(t, T.close + 0.05, SEAM)) * 12 }); });

    // --- gate 1: advice (a chat, then the three steps)
    const gChat = grp(inner, 0, 0);
    R(gChat, 120, -62, 400, 76, 26, C.TINT);
    L(gChat, 'מה מעכב את העסק?', 120, -62, 32, C.INK, 500);
    const reply = R(gChat, -190, 48, 260, 76, 26, C.LINE);
    const dots = [0, 1, 2].map(k => R(gChat, -190 + (k - 1) * 30, 48, 14, 14, 7, C.GREY));
    const rt = txt(gChat, '', { x: -66, y: 48, size: 32, font: F.RUBIK, weight: 500, color: C.INK2, align: 'r' });
    const REPLY = 'הכול ידני';
    let rtShown = -1;
    ups.push(t => {
      put(gChat, win(t, 5.5, 6.95));
      const q = appear(t, 5.55, 16), n = typed(t, 6.5, REPLY.length, 15);
      tf(reply, { o: appear(t, 6.0).o });
      dots.forEach((e, k) => tf(e, { y: 6 * Math.sin(t * 14 + k * 1.2), o: win(t, 6.0, 6.45, 40, 40) }));
      if (n !== rtShown) { rt.inner.textContent = REPLY.slice(0, n); rtShown = n; }
    });
    const gSteps = grp(inner, 0, 0);
    const steps = ['מיפוי', 'תכנון', 'בנייה'].map((s, k) => {
      const g = grp(gSteps, 0, -100 + 100 * k);
      R(g, 0, 0, 560, 88, 26, C.SUNK);
      R(g, -200, 0, 150, 14, 7, C.LINE);
      const ck = grp(g, 232, 0);
      R(ck, 0, 0, 50, 50, 25, C.TEAL); icon(ck, P.check, 0, 0, 26, C.WHITE, 3);
      L(g, s, 170, 0, 38, C.INK, 600, 'r');
      return { g, ck, t0: 6.95 + 0.15 * k };
    });
    ups.push(t => {
      put(gSteps, win(t, 6.9, 7.95));
      steps.forEach(({ g, ck, t0 }) => { const a = appear(t, t0, 22); tf(g, a); tf(ck, { s: S(t - t0 - 0.12, 20, 0.6), o: t > t0 + 0.12 ? 1 : 0 }); });
    });

    // --- gate 2: a landing page, and the lead lands in its form
    const gLand = grp(inner, 0, 0);
    R(gLand, 0, -222, 860, 56, 0, C.SUNK);
    [-392, -366, -340].forEach(x => R(gLand, x, -222, 14, 14, 7, C.LINE));
    R(gLand, 0, -222, 300, 28, 14, C.WHITE);
    R(gLand, 190, -130, 300, 32, 16, C.TINT);
    [[-80, 370], [-50, 320], [-20, 350]].forEach(([y, w]) => R(gLand, 190, y, w, 16, 8, C.LINE));
    R(gLand, 190, 38, 140, 44, 22, C.SUNK);
    R(gLand, 190, 150, 370, 120, 24, C.SUNK);
    [110, 190, 270].forEach(x => R(gLand, x, 150, 60, 60, 18, C.WHITE));
    R(gLand, -215, 25, 380, 320, 28, C.WHITE, { border: `2px solid ${C.LINE}`, boxSizing: 'border-box' });
    R(gLand, -215, -55, 320, 50, 16, C.SUNK); R(gLand, -150, -55, 110, 14, 7, C.LINE);
    R(gLand, -215, 10, 320, 50, 16, C.SUNK);
    const fieldText = L(gLand, 'מה המחיר?', -215, 10, 28, C.INK, 500);
    const btn = R(gLand, -215, 92, 320, 58, 29, C.TEAL);
    L(gLand, 'השארת פרטים', -215, 92, 28, C.WHITE, 600);
    ups.push(t => {
      put(gLand, win(t, 8.05, 9.75));
      tf(fieldText, { o: clamp((t - 8.4) / 0.08, 0, 1) });
      btn.style.background = mixc(C.TEAL, C.TEALD, S(t - 9.0, 30, 1));
    });
    // the lead, a bubble that rises out of the river into the form
    const chip = grp(cam, 0, 0);
    R(chip, 0, 0, 250, 76, 28, C.WHITE, Object.assign({ border: `2px solid ${C.LINE}`, boxSizing: 'border-box' }, SOFT));
    R(chip, -4, -9, 170, 14, 7, C.INK2, { opacity: 0.55 }); R(chip, 26, 14, 110, 12, 6, C.LINE);   // the words arrive in the form, not on the way
    const chipAt = track([270, 300], [[7.98, [-215 * 1.14, 10 * 1.14 - 20], 11, 0.9], [8.6, [270, 300], 30, 1]]);
    ups.push(t => { const [x, y] = chipAt(t); tf(chip, { x, y, s: lerp(0.5, 1, S(t - 7.95, 16, 0.8)), o: win(t, 7.95, 8.4, 30, 40) }); });

    // --- gate 3: an app
    const gApp = grp(inner, 0, 0);
    R(gApp, 0, -284, 96, 28, 14, C.INK);
    R(gApp, 60, -226, 150, 22, 11, C.TINT); R(gApp, -110, -226, 44, 44, 22, C.SUNK);
    [-20, 80].forEach((y, k) => {
      R(gApp, 0, y, 290, 88, 24, C.SUNK);
      R(gApp, 105, y, 46, 46, 23, k ? C.LINE : C.TINT);
      R(gApp, -15, y - 12, 130, 14, 7, C.LINE); R(gApp, -40, y + 14, 80, 12, 6, C.LINE);
    });
    const gNew = grp(gApp, 0, -120);
    R(gNew, 0, 0, 290, 88, 24, C.WHITE, { border: `2px solid ${C.TEAL}`, boxSizing: 'border-box' });
    R(gNew, 105, 0, 46, 46, 23, C.TEAL);
    L(gNew, 'מה המחיר?', 74, 0, 24, C.INK, 600, 'r');
    R(gNew, -104, 0, 68, 34, 17, C.TEAL); L(gNew, 'חדש', -104, 0, 22, C.WHITE, 600);
    L(gApp, 'התראות', 128, 175, 28, C.INK, 600, 'r');
    const tg = R(gApp, -85, 175, 92, 50, 25, C.LINE);
    const knob = R(gApp, -85, 175, 38, 38, 19, C.WHITE, SOFT);
    R(gApp, 0, 262, 300, 64, 32, C.SUNK);
    [95, 0, -95].forEach(x => R(gApp, x, 262, 18, 18, 9, C.INK2, { opacity: 0.5 }));
    const tab = R(gApp, 95, 262, 84, 48, 24, C.TINT, { opacity: 0.9 });
    const tabAt = track(95, [[11.0, 0, 18, 0.85], [11.5, 95, 40, 1]]);
    ups.push(t => {
      put(gApp, win(t, 9.8, 11.5));
      tf(gNew, appear(t, 9.95, -40));
      const on = S(t - 10.55, 22, 0.8);
      tg.style.background = mixc(C.LINE, C.TEAL, on);
      tf(knob, { x: lerp(-21, 21, on) });
      tf(tab, { x: tabAt(t) - 95 });
    });

    // --- gate 4: an automation (a form, a task, a message)
    const gPipe = grp(inner, 0, 0);
    const pipeProg = [[272, 11.65, 12.05], [-58, 12.1, 12.5]].map(([ax]) => {
      R(gPipe, ax - 107, -15, 214, 8, 4, C.LINE);
      const pg = grp(gPipe, ax, -15); R(pg, -107, 0, 214, 8, 4, C.TEAL); return pg;
    });
    const nodes = [[330, P.file, 'טופס', 11.65], [0, TASK, 'משימה', 12.05], [-330, CHAT, 'WhatsApp', 12.5]].map(([x, ic, label, t0]) => {
      const g = grp(gPipe, x, -15);
      R(g, 0, 0, 104, 104, 52, C.SUNK, { border: `2px solid ${C.LINE}`, boxSizing: 'border-box' });
      const lit = R(g, 0, 0, 104, 104, 52, C.TEAL);
      const ic1 = icon(g, ic, 0, 0, 44, C.INK2, 2), ic2 = icon(g, ic, 0, 0, 44, C.WHITE, 2.2);
      const lb = L(gPipe, label, x, 85, 30, C.INK2, 600);
      return { g, lit, ic1, ic2, lb, t0 };
    });
    const pdot = [R(gPipe, 0, -15, 22, 22, 11, C.TEAL, { border: `3px solid ${C.WHITE}`, boxSizing: 'border-box' }),
      R(gPipe, 0, -15, 22, 22, 11, C.TEAL, { border: `3px solid ${C.WHITE}`, boxSizing: 'border-box' })];
    ups.push(t => {
      put(gPipe, win(t, 11.55, 13.25));
      pipeProg.forEach((pg, i) => {
        const [t0, ax] = i ? [12.1, -58] : [11.65, 272], k = S(t - t0, 9, 1);
        tf(pg, { sx: k });
        tf(pdot[i], { x: ax - 214 * k, o: t > t0 && k < 0.985 ? 1 : 0 });
      });
      nodes.forEach(({ g, lit, ic1, ic2, lb, t0 }) => {
        const k = S(t - t0, 20, 0.7), u = t - t0;
        tf(lit, { o: clamp(k, 0, 1) }); tf(ic1, { o: 1 - clamp(k, 0, 1) }); tf(ic2, { o: clamp(k, 0, 1) });
        tf(g, { s: 1 + (u > 0 ? 0.14 * Math.exp(-7 * u) * Math.cos(16 * u) : 0) });
        lb.inner.style.color = mixc(C.INK2, C.INK, k);
      });
    });

    // --- gate 5: the agent reads, tags, and waits for a person to approve
    const gAgent = grp(inner, 0, 0);
    R(gAgent, 350, -190, 60, 60, 30, C.TEAL); icon(gAgent, P.star4, 350, -190, 32, C.WHITE, 2, C.WHITE);
    const AT = 'סוכן AI מסכם את הפניות';
    const at = txt(gAgent, '', { x: 305, y: -190, size: 36, font: F.RUBIK, weight: 700, color: C.INK, align: 'r' });
    let atShown = -1;
    const arows = [['מה המחיר?', 'לענות עכשיו', 180, true], ['שלחתי תמונה', 'לבדוק', 112, false], ['לחזור ללקוח', 'מחר', 92, false]].map(([s, tag, tw, hot], k) => {
      const y = -105 + 80 * k, g = grp(gAgent, 0, y), tg2 = grp(gAgent, -350 + tw / 2, y);   // the tag sits at the row's left end
      R(g, 0, 0, 740, 64, 20, C.SUNK);
      L(g, s, 340, 0, 30, C.INK, 500, 'r');
      R(tg2, 0, 0, tw, 44, 22, hot ? C.TEAL : C.LINE); L(tg2, tag, 0, 0, 24, hot ? C.WHITE : C.INK2, 600);
      return { g, tg: tg2, t0: 13.4 + 0.1 * k, t1: 13.8 + 0.1 * k };
    });
    const gBar = grp(gAgent, 0, 165);
    R(gBar, 0, 0, 740, 96, 28, C.TINT);
    const barOn = R(gBar, 0, 0, 740, 96, 28, C.TEAL);
    const barTxt = L(gBar, 'הצעה: לשלוח הצעת מחיר', 335, 0, 30, C.INK, 600, 'r');
    const approve = grp(gBar, -170, 0); R(approve, 0, 0, 140, 56, 28, C.TEAL); L(approve, 'אישור', 0, 0, 28, C.WHITE, 600);
    const decline = grp(gBar, -300, 0); R(decline, 0, 0, 110, 56, 28, C.WHITE, { border: `2px solid ${C.LINE}`, boxSizing: 'border-box' }); L(decline, 'דחייה', 0, 0, 26, C.INK2, 500);
    const okIcon = icon(gBar, P.check, -235, 0, 44, C.WHITE, 3.2);
    ups.push(t => {
      put(gAgent, win(t, 13.3, 15.3));
      const n = typed(t, 13.35, AT.length, 26);
      if (n !== atShown) { at.inner.textContent = AT.slice(0, n); atShown = n; }
      arows.forEach(({ g, tg, t0, t1 }) => { tf(g, appear(t, t0, 18)); tf(tg, { o: clamp((t - t1) / 0.08, 0, 1), s: 0.7 + 0.3 * S(t - t1, 24, 0.7) }); });
      tf(gBar, appear(t, 13.95, 22));
      const ok = S(t - 14.85, 18, 0.9);
      tf(barOn, { o: ok }); barTxt.inner.style.color = mixc(C.INK, C.WHITE, ok);
      tf(approve, { o: 1 - ok }); tf(decline, { o: 1 - ok }); tf(okIcon, { o: ok });
    });

    // --- the panel: everything the mess became
    const gPanel = grp(inner, 0, 0);
    L(gPanel, 'הכול במקום אחד', 0, -180, 44, C.INK, 700);
    const prows = ['מה המחיר?', 'שלחתי תמונה', 'לחזור ללקוח', 'שכחנו לענות'].map((s, k) => {
      const g = grp(gPanel, 0, -80 + 80 * k);
      R(g, 0, 0, 700, 64, 20, C.SUNK);
      L(g, s, 320, 0, 30, C.INK, 500, 'r');
      R(g, -285, 0, 110, 40, 20, C.TINT); L(g, 'טופל', -285, 0, 24, C.TEALD, 600);
      return { g, t0: 15.3 + 0.06 * k };
    });
    ups.push(t => { put(gPanel, win(t, 15.3, 16.82)); prows.forEach(({ g, t0 }) => tf(g, appear(t, t0, 18))); });   // the rows are gone before the card starts to shrink

    // ===== the cursor: it does what a person does, and nothing else ==========================
    const BTN = [-215 * 1.14, 92 * 1.14 - 20], TOGGLE = [-85 * 0.98, 175 * 0.98 - 10], TAB2 = [0, 262 * 0.98 - 10], APPROVE = [-170 * 1.14, 165 * 1.14 - 20];
    const cur = cursor(cam, 54, C.INK, C.WHITE);
    const curAt = track([900, 120], [
      [8.45, BTN, 9, 1], [9.3, [900, 120], 10, 1],
      [10.0, TOGGLE, 9, 1], [10.75, TAB2, 14, 1], [11.2, [900, 120], 10, 1],
      [14.3, APPROVE, 9, 1], [15.1, [900, 120], 10, 1],
    ]);
    const CLICKS = [[9.0, ...BTN], [10.55, ...TOGGLE], [11.0, ...TAB2], [14.85, ...APPROVE]];
    const press = track(0, CLICKS.flatMap(([c]) => [[c, 1, 40, 1], [c + 0.1, 0, 30, 1]]));
    const clk = CLICKS.map(([, x, y]) => R(cam, x, y, 64, 64, 32, 'transparent', { border: `4px solid ${C.TEAL}`, boxSizing: 'border-box' }));
    ups.push(t => {
      const [x, y] = curAt(t);
      tf(cur, { x, y, s: 1 - 0.14 * press(t), o: clamp(win(t, 8.4, 9.4) + win(t, 10.0, 11.3) + win(t, 14.25, 15.2), 0, 1) });
      CLICKS.forEach(([c], i) => { const p = clamp((t - c) / 0.5, 0, 1); tf(clk[i], { s: 0.35 + 0.95 * E.o3(p), o: t > c && t < c + 0.5 ? 0.7 * (1 - p) : 0 }); });
    });

    return t => ups.forEach(f => f(t));
  });
})();
