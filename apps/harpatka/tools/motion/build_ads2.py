"""Builder for ads 27..50 on reused songs (motion/music-map-27-50.json).
'end': highlight at the end, the selected last word keeps its place (base ad-12).
'mid': highlight mid sentence, the question is cut in fresh with a line below (base ad-13).
Timing comes from the beat: ~2 s question hold, ~3 s invitation text, tap ~1 s after the button.
usage: python build_ads2.py ad-27 ad-28 ...   (prints the card beat index for cardpoint.py)"""
import json, math, re, shutil, sys
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
MAP = json.loads((M / "music-map-27-50.json").read_text(encoding="utf-8"))
KINDS = ['slam', 'expand', 'slide', 'rise', 'slam', 'rise', 'expand', 'rise', 'expand', 'rise', 'expand', 'rise']
COLS = ['TERRA', 'OLIVE', 'PLUM', 'CREAM']                       # never ink: ink belongs to the selected word
FG = {'TERRA': 'INK', 'CREAM': 'INK', 'OLIVE': 'CREAM', 'PLUM': 'CREAM', 'INK': 'CREAM'}
SENT = {i + 1: l.strip() for i, l in enumerate((P.SENTENCES / "sentences.txt").read_text(encoding="utf-8").splitlines()) if l.strip()}
# the video wording of an ad, where it differs from the image (user request: only the videos change)
VIDEO_TEXT = {29: 'ומה אם במקום עוד ערב של סווייפים תיכנסו לחדר שבו אנשים באמת נפגשים?',
              32: 'ומה אם במקום לפתוח עם אז ספר לי על עצמך, פשוט תתחילו במבט, חיוך ותנועה?'}
text_of = lambda n: VIDEO_TEXT.get(n) or SENT[n].replace("[", "").replace("]", "")

# sel: index of the selected word in shots (one word). mid: shots after it continue the sentence, the last one 'tight'.
SPECS = {
    27: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['תכירו'], ['מישהו', 'דרך'], ['האנרגיה'], ['והנוכחות'], ['שלו'], ['במקום', 'דרך'], ['נתונים'], ['בפרופיל?']],
             top=['ומה אם תכירו', 'מישהו דרך'], stack=['האנרגיה', 'והנוכחות שלו'], bottom=['במקום דרך', 'נתונים בפרופיל?']),
    28: dict(v='mid', sel=5, shots=[['ומה', 'אם'], ['ערב', 'אחד'], ['עם', 'אנשים', 'חדשים'], ['יחליף', 'את', 'כל'], ['פורמט'], ['הדייטים'], ['שאתם', 'מכירים?']],
             top=['ומה אם ערב אחד', 'עם אנשים חדשים'], stack=['יחליף את כל', 'פורמט הדייטים'], bottom=['שאתם מכירים?']),
    29: dict(v='end', shots=[['ומה', 'אם'], ['במקום', 'עוד'], ['ערב', 'של'], ['סווייפים'], ['תיכנסו'], ['לחדר', 'שבו'], ['אנשים'], ['באמת'], ['נפגשים?']],
             top=['ומה אם במקום', 'עוד ערב של', 'סווייפים'], stack=['תיכנסו לחדר', 'שבו אנשים', 'באמת', 'נפגשים?']),
    30: dict(v='end', shots=[['ומה', 'אם'], ['במקום'], ['דייט', 'ראשון'], ['מול', 'שולחן,'], ['החוויה'], ['עצמה'], ['תהיה', 'הדבר'], ['הראשון'], ['שתעשו'], ['יחד?']],
             top=['ומה אם במקום דייט', 'ראשון מול שולחן,'], stack=['החוויה עצמה', 'תהיה הדבר', 'הראשון שתעשו', 'יחד?']),
    31: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['הגוף'], ['ירגיש'], ['שיש', 'ביניכם'], ['חיבור'], ['עוד', 'לפני'], ['שהראש'], ['יבין', 'למה?']],
             top=['ומה אם', 'הגוף ירגיש'], stack=['שיש ביניכם', 'חיבור'], bottom=['עוד לפני שהראש', 'יבין למה?']),
    32: dict(v='end', shots=[['ומה', 'אם'], ['במקום', 'לפתוח'], ['עם', 'אז'], ['ספר', 'לי'], ['על', 'עצמך,'], ['פשוט', 'תתחילו'], ['במבט,'], ['חיוך'], ['ותנועה?']],
             top=['ומה אם במקום', 'לפתוח עם אז', 'ספר לי על עצמך,'], stack=['פשוט תתחילו', 'במבט, חיוך', 'ותנועה?']),
    33: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['לא', 'תצטרכו'], ['להחליט'], ['אם', 'מישהו'], ['מתאים'], ['לכם'], ['לפי', 'שלוש'], ['תמונות'], ['ושתי', 'שורות?']],
             top=['ומה אם'], stack=['לא תצטרכו', 'להחליט אם', 'מישהו מתאים', 'לכם'], bottom=['לפי שלוש תמונות', 'ושתי שורות?']),
    34: dict(v='end', shots=[['ומה', 'אם'], ['מישהו'], ['שמושך', 'אתכם'], ['יבלוט'], ['בלי', 'לשלוח'], ['לכם', 'אפילו'], ['הודעה?']],
             top=['ומה אם מישהו', 'שמושך אתכם'], stack=['יבלוט בלי', 'לשלוח לכם', 'אפילו', 'הודעה?']),
    35: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['תכירו', 'קודם'], ['איך', 'מרגיש'], ['להיות', 'ליד'], ['מישהו'], ['ורק', 'אחר', 'כך'], ['את', 'הסיפור', 'שלו?']],
             top=['ומה אם', 'תכירו קודם'], stack=['איך מרגיש', 'להיות ליד', 'מישהו'], bottom=['ורק אחר כך', 'את הסיפור שלו?']),
    36: dict(v='end', shots=[['ומה', 'אם', 'במקום'], ['לשבת', 'ולבדוק'], ['אם', 'השיחה', 'זורמת,'], ['פשוט', 'תרגישו', 'אם'], ['נעים', 'לכם', 'להיות'], ['לידו?']],
             top=['ומה אם במקום לשבת', 'ולבדוק אם', 'השיחה זורמת,'], stack=['פשוט תרגישו', 'אם נעים לכם', 'להיות', 'לידו?']),
    37: dict(v='end', shots=[['ומה', 'אם'], ['הקליק'], ['ביניכם'], ['לבין', 'מישהו'], ['חדש'], ['יקרה'], ['בלי', 'מסך'], ['באמצע?']],
             top=['ומה אם הקליק', 'ביניכם לבין', 'מישהו חדש'], stack=['יקרה בלי', 'מסך', 'באמצע?']),
    38: dict(v='end', shots=[['ומה', 'אם'], ['במקום'], ['לחפש', 'אהבה'], ['בין'], ['פרופילים,'], ['תפגשו'], ['מישהו'], ['בתוך', 'רגע'], ['אמיתי?']],
             top=['ומה אם במקום', 'לחפש אהבה', 'בין פרופילים,'], stack=['תפגשו מישהו', 'בתוך רגע', 'אמיתי?']),
    39: dict(v='end', shots=[['ומה', 'אם'], ['הדרך'], ['להכיר'], ['מישהו'], ['לזוגיות'], ['לא', 'תתחיל'], ['בהתכתבות,'], ['אלא'], ['בחוויה'], ['משותפת?']],
             top=['ומה אם הדרך', 'להכיר מישהו לזוגיות', 'לא תתחיל בהתכתבות,'], stack=['אלא בחוויה', 'משותפת?']),
    40: dict(v='end', shots=[['ומה', 'אם'], ['במקום'], ['לחפש'], ['התאמה'], ['עם', 'מישהו'], ['תיתנו'], ['לחיבור'], ['ביניכם'], ['לקרות?']],
             top=['ומה אם במקום', 'לחפש התאמה', 'עם מישהו'], stack=['תיתנו לחיבור', 'ביניכם', 'לקרות?']),
    41: dict(v='end', shots=[['ומה', 'אם'], ['במקום', 'עוד', 'דייט'], ['שמרגיש', 'קצת'], ['כמו', 'ראיון,'], ['תבואו', 'לערב'], ['שבו', 'לא', 'צריך'], ['לראיין', 'אף'], ['אחד?']],
             top=['ומה אם במקום עוד', 'דייט שמרגיש קצת', 'כמו ראיון,'], stack=['תבואו לערב', 'שבו לא צריך', 'לראיין אף', 'אחד?']),
    42: dict(v='end', shots=[['ומה', 'אם'], ['הדרך', 'להכיר'], ['מישהו'], ['שיכול', 'להתאים'], ['לכם'], ['היא', 'לחוות'], ['איתו'], ['משהו?']],
             top=['ומה אם הדרך', 'להכיר מישהו', 'שיכול להתאים לכם'], stack=['היא לחוות', 'איתו', 'משהו?']),
    43: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['מול', 'מישהו', 'חדש'], ['תיתנו'], ['למבט'], ['ולתנועה'], ['לעשות', 'את', 'מה'], ['שבדרך', 'כלל'], ['עושות', 'המילים?']],
             top=['ומה אם מול', 'מישהו חדש'], stack=['תיתנו למבט', 'ולתנועה'], bottom=['לעשות את מה', 'שבדרך כלל', 'עושות המילים?']),
    44: dict(v='end', shots=[['ומה', 'אם'], ['מישהו'], ['שמוצא', 'חן'], ['בעיניכם'], ['נמצא'], ['במרחק', 'ריקוד'], ['אחד?']],
             top=['ומה אם מישהו', 'שמוצא חן', 'בעיניכם'], stack=['נמצא במרחק', 'ריקוד', 'אחד?']),
    45: dict(v='end', shots=[['ומה', 'אם'], ['אפשר', 'להכיר'], ['מישהו'], ['בלי', 'משחקים,'], ['בלי', 'טקטיקות'], ['ובלי', 'לחשוב'], ['מתי', 'נכון'], ['לענות'], ['להודעה?']],
             top=['ומה אם אפשר', 'להכיר מישהו'], stack=['בלי משחקים,', 'בלי טקטיקות', 'ובלי לחשוב מתי', 'נכון לענות', 'להודעה?']),
    46: dict(v='mid', sel=4, shots=[['ומה', 'אם'], ['לא', 'תצטרכו'], ['להחליט'], ['אם', 'מישהו'], ['מתאים'], ['לכם'], ['בשתי', 'הדקות'], ['הראשונות?']],
             top=['ומה אם'], stack=['לא תצטרכו', 'להחליט אם', 'מישהו מתאים', 'לכם'], bottom=['בשתי הדקות', 'הראשונות?']),
    47: dict(v='end', shots=[['ומה', 'אם'], ['במקום', 'עוד', 'דייט'], ['מתוכנן'], ['תיכנסו', 'לערב', 'שבו'], ['היכרות', 'עם', 'מישהו'], ['פשוט'], ['קורית?']],
             top=['ומה אם במקום', 'עוד דייט מתוכנן'], stack=['תיכנסו לערב שבו', 'היכרות עם', 'מישהו פשוט', 'קורית?']),
    48: dict(v='end', shots=[['ומה', 'אם'], ['ערב', 'של', 'תנועה'], ['ומוזיקה'], ['עם', 'אנשים', 'חדשים'], ['יוביל'], ['למישהו'], ['שלא', 'ציפיתם'], ['לפגוש?']],
             top=['ומה אם ערב של', 'תנועה ומוזיקה', 'עם אנשים חדשים'], stack=['יוביל למישהו', 'שלא ציפיתם', 'לפגוש?']),
    49: dict(v='end', shots=[['ומה', 'אם'], ['במקום', 'עוד'], ['התכתבות'], ['עם', 'מישהו'], ['תהיה', 'לכם'], ['חוויה', 'אמיתית'], ['יחד?']],
             top=['ומה אם במקום', 'עוד התכתבות', 'עם מישהו'], stack=['תהיה לכם', 'חוויה אמיתית', 'יחד?']),
    50: dict(v='end', shots=[['ומה', 'אם'], ['הדייט', 'הבא', 'שלכם'], ['לא', 'יתחיל', 'במסך,'], ['לא', 'ליד', 'שולחן,'], ['ואפילו', 'לא'], ['ירגיש', 'כמו'], ['דייט?']],
             top=['ומה אם הדייט', 'הבא שלכם'], stack=['לא יתחיל במסך,', 'לא ליד שולחן,', 'ואפילו לא', 'ירגיש כמו', 'דייט?']),
}


def js_list(xs):
    # videos only: no commas and no quotation marks in the text before the invitation (the images keep them)
    xs = [x.replace("ה״אז", "אז").replace(",", "").replace("״", "").replace('"', "").strip() for x in xs]
    return "[" + ", ".join("'" + x.replace("'", "\\'") + "'" for x in xs) + "]"


def check_words(n, sp):
    """every word of the sentence, in order, in the shots, the lockup lines and nothing else"""
    plain = text_of(n).split()
    flat = [w for sh in sp['shots'] for w in sh]
    assert flat == plain, (n, "shots", flat, plain)
    lock = " ".join(sp['top'] + sp['stack'] + sp.get('bottom', [])).split()
    assert lock == plain, (n, "lockup", lock, plain)


def build(n):
    sp = SPECS[n]; check_words(n, sp)
    name = f"ad-{n:02d}"; mm = MAP[name]; p = mm['bar'] / 4
    shots = sp['shots']; v = sp['v']
    s = sp.get('sel', len(shots) - 1)
    beats = len(shots) + 1                                  # the selected word holds 2 beats
    join = beats                                            # G(join): first beat after the words
    if v == 'end':
        assert s == len(shots) - 1 and shots[s][0] == sp['stack'][-1]
        tend = "T_JOIN + 0.33"; card = join + max(3, round(2.2 / p))
    else:
        tend = f"G({join + 1})"; card = join + 1 + max(3, round(2.0 / p))
    b4 = card + round(3.7 / p); tap = b4 + max(1, round(0.9 / p))
    while (tap + 1) * p > 13.7 and b4 - card > round(2.6 / p): b4 -= 1; tap -= 1
    snap = 0.24 + 0.15 * p
    base = "ad-12" if v == 'end' else "ad-13"
    src = (M / base / "scene.js").read_text(encoding="utf-8")
    rows, k_ns, slams = [], 0, []
    t = 0
    for i, w in enumerate(shots):
        if i == s:
            rows.append(f"      {{ a: G({t}), b: {'T_JOIN' if i == len(shots) - 1 else f'G({t + 2})'}, bg: C.INK,  fg: C.CREAM, words: {js_list(w)}, kind: 'select' }},")
            sel_a = t; t += 2; continue
        col = COLS[k_ns % len(COLS)]
        kind = 'tight' if (v == 'mid' and i == len(shots) - 1) else KINDS[k_ns]
        if kind == 'slam': slams.append(t)
        if kind == 'tight': slams.append(t)
        end = 'T_JOIN' if i == len(shots) - 1 else f'G({t + 1})'
        rows.append(f"      {{ a: G({t}), b: {end}, bg: C.{col}, fg: C.{FG[col]}, words: {js_list(w)}, kind: '{kind}' }},")
        t += 1; k_ns += 1
    assert t == join
    shots_js = "    const SHOTS = [\n" + "\n".join(rows) + "\n    ];\n"
    i0 = src.index("    const SHOTS = [\n"); i1 = src.index("    ];\n", i0) + len("    ];\n")
    src = src[:i0] + shots_js + src[i1:]
    sel = shots[s][0]
    hits = ", ".join(f"[G({a}), {14 if j == 0 else 16 if j == 1 else 9}]" for j, a in enumerate(slams))
    sfxs = " ".join(f'sfx(G({a}), "hit", {1 if j == 0 else 0.85 if j == 1 else 0.7});' for j, a in enumerate(slams))
    subs = [
        (r"^// scene\.js: .*$", f'// scene.js: ad {n:02d}, "{text_of(n)}" + the invitation from the home page.'),
        (r"\((Pixabay|Mixkit) [^)]*\)", f'({mm["label"]} BPM, the song of {mm["song_from"]}, from START s)'),
        (r"^    const T_JOIN = .*$", f"    const T_JOIN = G({join}), T_END = {tend}; // the question comes together after the words"),
        (r"^    const T_CARD = .*$", f"    const T_CARD = G({card}), T_COVER = T_CARD + 0.35;   // the invitation slides up on the rhythm change"),
        (r"^    const B4 = .*$", f"    const B4 = G({b4});                          // the invitation text, then the button"),
        (r"^    const T_ST = .*$", f"    const T_ST = G({card + 1}), T_TAP = G({tap});         // the stamp lands on a beat, the button is tapped on a beat"),
        (r"^    const SEL = SHOTS\[.*$", f"    const SEL = SHOTS[{s}], T_BOX = SEL.a + 0.06, T_SNAP = SEL.a + {snap:.2f}, T_LOCK = G({sel_a + 1});"),
        (r"^    const T_GRAB = .*$", f"    const T_GRAB = SEL.a + {snap - 0.07:.2f}, T_DROP = T_LOCK - 0.03;"),
        (r"^    const STACK = .*$", f"    const STACK = {js_list(sp['stack'])}, LAST = STACK.length - 1;"),
        (r"^    const pitch = .*$", "    const pitch = ss * 1.02;"),
        (r"^    const yHead = .*$", "    const yHead = -H / 2 + BORDER + 150;                   // the hand lettering line box stays inside the safe area, also at the end of the push"),
        (r"^    const HITS = \[\[.*$", f"    const HITS = [{hits}, [T_LOCK, 5], [T_END, 7]];"),
        (r'^    sfx\(G\(0\), "hit".*$', f'    {sfxs} sfx(T_LOCK, "tick", 1);'),
        (r'// the selection frame around "[^"]*"', f'// the selection frame around "{sel}"'),
    ]
    if v == 'end':
        subs += [
            (r"^    const TOP = .*$", f"    const TOP = {js_list(sp['top'])};   // short lines: big enough to read on a phone"),
            (r"^    const T_P = k => .*$", "    const T_P = k => T_JOIN + 0.34 + k * 0.07;              // the lines above drop in once the selected word has shrunk"),
            (r"pulse\(t, G\(\d+\)\)", f"pulse(t, G({join + 2}))"),
            (r"tf\(uline, \{ sx: S\(t - G\(\d+\), 16, 1\), o: fin && t >= G\(\d+\) \? 1 : 0 \}\);",
             f"tf(uline, {{ sx: S(t - G({join + 1}), 16, 1), o: fin && t >= G({join + 1}) ? 1 : 0 }});"),
            (r'// "[^"]*" keeps its place on the cut', f'// "{sel}" keeps its place on the cut'),
        ]
    else:
        subs += [
            (r"^    const TOP = .*$", f"    const TOP = {js_list(sp['top'])}, BOTTOM = {js_list(sp['bottom'])};   // short lines: big enough to read on a phone"),
            (r"pulse\(t, G\(\d+\)\)", f"pulse(t, G({join + 3}))"),
            (r"tf\(uline, \{ sx: S\(t - G\(\d+\), 16, 1\), o: fin && t >= G\(\d+\) \? 1 : 0 \}\);",
             f"tf(uline, {{ sx: S(t - G({join + 2}), 16, 1), o: fin && t >= G({join + 2}) ? 1 : 0 }});"),
        ]
    for pat, rep in subs:
        src, k = re.subn(pat, rep.replace("\\", "\\\\"), src, count=1, flags=re.M)
        assert k == 1, (name, pat)
    d = M / name; d.mkdir(exist_ok=True)
    (d / "scene.js").write_text(src, encoding="utf-8")
    for f in ("core.js", "render.py", "audio.py", "index.html"):
        shutil.copy(M / base / f, d / f)
    if not (d / "fonts").exists(): shutil.copytree(M / base / "fonts", d / "fonts")
    shutil.copy(M / mm['song_from'] / "music.mp3", d / "music.mp3")
    print(f"{name} [{v}] beat {p:.3f}: words {join * p:.2f}s, card G({card}) beat {card + 1} = {(card + 1) * p:.2f}s, "
          f"button {(b4 + 1) * p:.2f}s, tap {(tap + 1) * p:.2f}s | song {mm['song_from']} d0 {mm['d0']} bar {mm['bar']} idx {card + 1}")


for a in (sys.argv[1:] or [f"ad-{n}" for n in SPECS]):
    build(int(a.split("-")[1]))
