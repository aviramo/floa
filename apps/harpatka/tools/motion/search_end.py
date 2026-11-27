"""The end of every ad video becomes a search for "יוצאים להרפתקה" (October 2026, at the user's request).
- The invitation in the video: no "פשוט לזוז יחד" and no plain name line at the bottom; title, rule and the two "who" lines
  sit in one centred stack.
- At the moment the name line used to rise (T_CARD + 1.04) the search button pops in at the bottom and the field opens out of it.
- When the invitation text leaves (B4) the field glides up to the centre and grows to full size.
- The name is typed one letter every 1/12 beat with a key sound: after the glide when there is time, otherwise timed to end
  just before the tap (so it starts at the bottom of the invitation). The pointer comes in and taps the search button on
  T_TAP: the same click, sparkle, ripple and hearts as the old button. Every beat time stays as it was.
usage: python search_end.py 1-50 | 3 7 12   (patches motion/ad-XX/scene.js in place; the original is kept as scene.pre-search.js)"""
import sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION

def nums(args):
    out = []
    for a in args:
        if "-" in a: x, y = map(int, a.split("-")); out += list(range(x, y + 1))
        else: out.append(int(a))
    return out

REPS = [
# the plain name line is not built any more
("""    const brand = txt(cam2, 'יוצאים להרפתקה', Object.assign({}, o9, { weight: 800, size: 92, y: yBrand, color: C.INK }));
""", ""),
("""      show(t, brand, T_CARD + 1.04);
""", ""),
# no "פשוט לזוז יחד": title, rule and who in one centred stack, the field below them
("""    const yTitle = -205, yDiv = -85, yLead = 30, yWho = 192, yBrand = H / 2 - BORDER - 120;""",
 """    const yTitle = -175, yDiv = -60, yWho = 50, yBrand = 336;   // centred between the header and the bottom of the letter"""),
("""    const lsz = Math.min(124, fit(LEAD, oLead, 860));
""", ""),
("""report('size_lead', lsz); """, ""),
("""    const lead = txt(cam2, LEAD, Object.assign({ size: lsz, y: yLead, color: C.TERRA }, oLead));
""", ""),
("""      show(t, lead, T_CARD + 0.68, B4);
""", ""),
("""    // the end: the site's button, tapped, and a little burst of hearts
    const yBtn = 55, btnSz = 100, BTN = ['אני רוצה לשמוע', 'עוד פרטים'];
    const btnW = Math.max(...BTN.map(s => measure(s, Object.assign({ size: btnSz }, o9, { weight: 800 })).w)) + 170;
    const btnH = btnSz * 1.18 * 2 + 110;
""", """    // the end: the search field (in the name line's place, smaller), then up to the centre: typed in, search tapped, hearts
    const yBtn = 55, SZ = 82, BD = 132, PR = 64, GP = 24, S_LOW = 0.72;
    const oS = { font: F.RUBIK, weight: 700, size: SZ };
    const Q1 = 'יוצאים', Q2 = 'להרפתקה', QS = Q1 + ' ' + Q2;
    const qW = measure(QS, oS).w;
    const btnW = PR + qW + GP + 7 + 30 + BD + 22, btnH = 176;
    const yLow = yBrand;                                     // the bottom of the invitation, where the name line was
"""),
("""    const btn = grp(cam2, 0, yBtn);
    box(btn, 0, 0, btnW, btnH, { background: C.TERRA, borderRadius: '64px' });
    BTN.forEach((s, k) => txt(btn, s, Object.assign({}, o9, { weight: 800, size: btnSz, y: (k - 0.5) * btnSz * 1.18, color: C.PAPER2 })));
    const tap = cursor(cam2, 72, C.INK, C.PAPER2);
    const T_BTN = B4 + 0.12, T_LET = T_TAP + 0.16, T_AWAY = T_TAP + 0.45;
    const TAP0 = [360, H / 2 + 60], TAP1 = [btnW * 0.2, yBtn + btnH / 2 - 30], TAP2 = [btnW * 0.34, yBtn + btnH / 2 + 120];
    const ring = grp(cam2, TAP1[0], TAP1[1]);               // a ripple where the tap lands
""", """    const btn = grp(cam2, 0, 0);                             // the search field, placed by tf every frame
    const pill = rect(btn, -btnW / 2, -btnH / 2, btnW, btnH, { background: C.PAPER2, border: '4px solid rgba(63,56,47,.17)',
      borderRadius: '999px', boxShadow: '0 14px 40px rgba(63,56,47,.18)', boxSizing: 'border-box' });
    const xR = btnW / 2 - PR;                                // Hebrew is typed from the right
    const qT = txt(btn, QS, Object.assign({ x: 0, y: 0, color: C.INK }, oS));   // placed by tf every frame
    const caret = rect(btn, 0, -44, 7, 88, { background: C.TERRA, borderRadius: '4px' });
    const bxc = -btnW / 2 + 22 + BD / 2;
    const sBtn = grp(btn, bxc, 0);                           // the one magnifier: the search button
    box(sBtn, 0, 0, BD, BD, { background: C.TERRA, borderRadius: '50%' });
    const mag = svgEl('svg', sBtn, { viewBox: '0 0 24 24', width: 66, height: 66 });
    mag.style.cssText = 'position:absolute;left:-33px;top:-33px;overflow:visible';
    const mg = svgEl('g', mag, { fill: 'none', stroke: C.PAPER2, 'stroke-width': 2.8, 'stroke-linecap': 'round' });
    svgEl('circle', mg, { cx: 10.5, cy: 10.5, r: 6.5 }); svgEl('path', mg, { d: 'M15.5 15.5 21 21' });
    const tap = cursor(cam2, 72, C.INK, C.PAPER2);
    const T_BTN = B4 + 0.12, T_LET = T_TAP + 0.16, T_AWAY = T_TAP + 0.45;   // T_BTN: the same small shake as before
    const T_IN = T_CARD + 1.04, T_OPEN = T_IN + 0.14;        // the button pops in where the name line used to rise, then the field opens
    const T_UP = B4 + 0.02;                                  // the field glides up as the invitation text leaves
    const CPS = 12 / (60 / CONFIG.bpm), T_TYPED = QS.length / CPS;   // one letter every 1/12 beat
    const T_TYPE = B4 + 0.3 + T_TYPED <= T_TAP - 0.22 ? B4 + 0.3 : T_TAP - 0.22 - T_TYPED;   // after the glide, or ending just before the tap
    const T_CUR = T_TAP - 0.36;                              // the pointer comes in once the name is (almost) typed
    const TAP0 = [360, H / 2 + 60], TAP1 = [bxc + 14, yBtn + 22], TAP2 = [bxc + 160, yBtn + btnH / 2 + 150];
    const ring = grp(cam2, bxc, yBtn);                       // a ripple on the search button
    for (let i = 0; i < QS.length; i++) if (QS[i] !== ' ') sfx(T_TYPE + i / CPS, 'key', 0.45);
    report('type_start', T_TYPE); report('type_end', T_TYPE + T_TYPED); report('pointer_in', T_CUR); report('tap', T_TAP);
"""),
("""      // the button pops in, gets tapped, hearts fly out
      const kb = slam(t, T_BTN, 1.14, 30, 0.6);
      const dip = 1 - 0.05 * (S(t - T_TAP, 45, 1) - S(t - T_LET, 30, 0.6));
      tf(btn, { s: kb.s * dip, o: kb.o });
      const a1 = S(t - (T_BTN + 0.15), 14, 1), a2 = S(t - T_AWAY, 9, 1);
      const p = [0, 1].map(i => lerp(lerp(TAP0[i], TAP1[i], a1), TAP2[i], a2));
      const press = t >= T_TAP && t < T_LET ? 1 - 0.14 * S(t - T_TAP, 40, 1) : 1;
      tf(tap, { x: p[0], y: p[1], s: press, o: t >= T_BTN + 0.15 ? 1 : 0 });
""", """      // the search field: the button pops in at the bottom, the field opens out of it, glides up, the name is typed, tap, hearts
      const up = S(t - T_UP, 13, 0.85);
      tf(btn, { y: lerp(yLow, yBtn, up), s: lerp(S_LOW, 1, up), o: t >= T_IN ? 1 : 0 });
      const kb = slam(t, T_IN, 1.35, 30, 0.6);
      const dip = 1 - 0.1 * (S(t - T_TAP, 45, 1) - S(t - T_LET, 30, 0.6));
      tf(sBtn, { s: kb.s * dip, o: kb.o });
      const op = Math.max(0, S(t - T_OPEN, 16, 0.82));        // the field opens from the button towards the right
      pill.style.width = f2(lerp(BD + 44, btnW, op)) + 'px';
      tf(pill, { o: t >= T_OPEN ? 1 : 0 });
      const n = typed(t, T_TYPE, QS.length, CPS), shown = QS.slice(0, n);
      const k1 = Math.min(n, Q1.length);
      qT.inner.innerHTML = QS.slice(0, k1) + (n > Q1.length ? ' <span style="color:' + C.TERRA + '">' + QS.slice(Q1.length + 1, n) + '</span>' : '');
      const wNow = n ? measure(shown, oS).w : 0;
      tf(qT, { x: xR - wNow / 2, o: n ? 1 : 0 });
      const typing = t >= T_TYPE && n < QS.length;
      const blink = Math.floor((t - T_OPEN) * 2.6) % 2 === 0;  // ~1.3 blinks a second while waiting
      tf(caret, { x: xR - wNow - (n ? GP : 0) - 7, o: op > 0.96 && (typing || blink) ? 1 : 0 });
      const a1 = S(t - T_CUR, 17, 1), a2 = S(t - T_AWAY, 9, 1);
      const p = [0, 1].map(i => lerp(lerp(TAP0[i], TAP1[i], a1), TAP2[i], a2));
      const press = t >= T_TAP && t < T_LET ? 1 - 0.14 * S(t - T_TAP, 40, 1) : 1;
      tf(tap, { x: p[0], y: p[1], s: press, o: t >= T_CUR ? 1 : 0 });
"""),
]

dry = "--dry" in sys.argv
for n in nums([a for a in sys.argv[1:] if not a.startswith("--")]):
    d = M / f"ad-{n:02d}"; sc = d / "scene.js"; bak = d / "scene.pre-search.js"
    src = bak.read_text(encoding="utf-8") if bak.exists() else sc.read_text(encoding="utf-8")   # always from the original
    s = src
    for a, b in REPS:
        assert s.count(a) == 1, f"ad {n}: anchor not found once: {a[:70]!r}"
        s = s.replace(a, b)
    if dry: print(f"ad {n:2d}: ok (dry)"); continue
    if not bak.exists(): bak.write_text(src, encoding="utf-8")
    sc.write_text(s, encoding="utf-8")
    print(f"ad {n:2d}: patched")
