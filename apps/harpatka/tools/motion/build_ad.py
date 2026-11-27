"""Generic ad scene builder (highlight at the end of the sentence; the selected last word keeps its place).
Base: motion/ad-12/scene.js (compressed join: the full question comes together right after the lock).
usage: python build_ad.py <spec name> ...   (specs below)."""
import re, sys, shutil
from pathlib import Path

import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import paths as P   # FLOA layout: the motion projects are paths.MOTION (HARPATKA_MOTION_ROOT)
M = P.MOTION
KINDS = ['slam', 'expand', 'slide', 'rise', 'slam', 'rise', 'expand', 'rise', 'expand', 'rise']
COLS = ['TERRA', 'OLIVE', 'PLUM', 'INK', 'CREAM', 'OLIVE', 'TERRA', 'PLUM', 'OLIVE', 'TERRA']
FG = {'TERRA': 'INK', 'CREAM': 'INK', 'OLIVE': 'CREAM', 'PLUM': 'CREAM', 'INK': 'CREAM'}

# shots: list of word lists; the last one is the selected word (one word). kc: beats from the join to the card,
# kb: beats from the card to the button, kt: beats from the button to the tap
SPECS = {
    'ad-16': dict(n=16, beat=0.4290, music='Pixabay "Funny Comedy Cartoon" by maksymmalko, 140 BPM', kc=7, kb=9, kt=3,
                  text='ומה אם תפגשו מישהו שמושך אתכם בתוך ערב של תנועה וחיבור?',
                  shots=[['ומה', 'אם'], ['תפגשו'], ['מישהו'], ['שמושך', 'אתכם'], ['בתוך', 'ערב'], ['של', 'תנועה'], ['וחיבור?']],
                  top=['ומה אם תפגשו', 'מישהו', 'שמושך אתכם'], stack=['בתוך ערב', 'של תנועה', 'וחיבור?']),
    'ad-17': dict(n=17, beat=0.4999, music='Pixabay "Upbeat" by sub_clair, 120 BPM', kc=5, kb=7, kt=2,
                  text='ומה אם הקרבה ביניכם לבין מישהו חדש תגיע לפני השיחה?',
                  shots=[['ומה', 'אם'], ['הקרבה'], ['ביניכם'], ['לבין', 'מישהו'], ['חדש'], ['תגיע'], ['לפני'], ['השיחה?']],
                  top=['ומה אם הקרבה', 'ביניכם לבין', 'מישהו חדש'], stack=['תגיע לפני', 'השיחה?']),
    'ad-18': dict(n=18, beat=0.6053, music='Pixabay "Upbeat Rock" by lnplusmusic, 99 BPM', kc=4, kb=6, kt=2,
                  text='ומה אם במקום לבדוק אם יש כימיה מעל קפה, פשוט תרגישו אותה תוך כדי תנועה?',
                  shots=[['ומה', 'אם'], ['במקום', 'לבדוק'], ['אם', 'יש', 'כימיה'], ['מעל', 'קפה,'], ['פשוט', 'תרגישו'], ['אותה', 'תוך', 'כדי'], ['תנועה?']],
                  top=['ומה אם במקום', 'לבדוק אם יש', 'כימיה מעל קפה,'], stack=['פשוט תרגישו', 'אותה תוך כדי', 'תנועה?']),
    'ad-19': dict(n=19, beat=0.5034, music='Pixabay "Upbeat Music" by the_mountain, 119 BPM', kc=5, kb=7, kt=2,
                  text='ומה אם ערב של מוזיקה ותנועה עם אנשים חדשים יהפוך להתחלה של משהו?',
                  shots=[['ומה', 'אם'], ['ערב', 'של'], ['מוזיקה'], ['ותנועה'], ['עם', 'אנשים'], ['חדשים'], ['יהפוך'], ['להתחלה', 'של'], ['משהו?']],
                  top=['ומה אם ערב של', 'מוזיקה ותנועה', 'עם אנשים חדשים'], stack=['יהפוך', 'להתחלה של', 'משהו?']),
    'ad-20': dict(n=20, beat=0.8001, music='Pixabay "Upbeat" by sub_clair (588417), 150 BPM felt in half time: 75 BPM', kc=3, kb=5, kt=1,
                  text='ומה אם תצאו מהערב אחרי שפגשתם מישהו שתרצו לראות שוב?',
                  shots=[['ומה', 'אם'], ['תצאו', 'מהערב'], ['אחרי', 'שפגשתם'], ['מישהו'], ['שתרצו', 'לראות'], ['שוב?']],
                  top=['ומה אם', 'תצאו מהערב'], stack=['אחרי שפגשתם', 'מישהו שתרצו', 'לראות', 'שוב?']),
    'ad-21': dict(n=21, beat=0.6005, music='Pixabay "Upbeat" by verclub_music, 100 BPM', kc=4, kb=6, kt=2,
                  text='ומה אם במקום לעשות סווייפ על מישהו פשוט תסתכלו לו בעיניים?',
                  shots=[['ומה', 'אם'], ['במקום'], ['לעשות', 'סווייפ'], ['על', 'מישהו'], ['פשוט'], ['תסתכלו', 'לו'], ['בעיניים?']],
                  top=['ומה אם במקום', 'לעשות סווייפ', 'על מישהו'], stack=['פשוט', 'תסתכלו לו', 'בעיניים?']),
    'ad-22': dict(n=22, beat=0.7894, music='Pixabay "Happy Upbeat" by bombinsound, 152 BPM felt in half time: 76 BPM', kc=3, kb=4, kt=1,
                  text='ומה אם מול מישהו חדש לא תצטרכו לחשוב מה להגיד כי אתם פשוט בתוך החוויה?',
                  shots=[['ומה', 'אם'], ['מול', 'מישהו', 'חדש'], ['לא', 'תצטרכו'], ['לחשוב', 'מה', 'להגיד'], ['כי', 'אתם'], ['פשוט', 'בתוך'], ['החוויה?']],
                  top=['ומה אם מול', 'מישהו חדש', 'לא תצטרכו לחשוב', 'מה להגיד כי'], stack=['אתם פשוט', 'בתוך', 'החוויה?']),
    'ad-23': dict(n=23, beat=0.6660, music='Pixabay "Upbeat Rock" by verclub_music, 90 BPM', kc=3, kb=6, kt=1,
                  text='ומה אם החיבור עם מישהו חדש יתחיל לפני ה״אז מה אתם עושים בחיים?״',
                  shots=[['ומה', 'אם'], ['החיבור'], ['עם', 'מישהו'], ['חדש'], ['יתחיל', 'לפני'], ['ה״אז', 'מה'], ['אתם', 'עושים'], ['בחיים?״']],
                  top=['ומה אם החיבור', 'עם מישהו חדש'], stack=['יתחיל לפני', 'ה״אז מה אתם', 'עושים', 'בחיים?״']),
    'ad-24': dict(n=24, beat=0.5325, music='Pixabay "Happy Vibes" by velariomusic, 113 BPM', kc=5, kb=7, kt=2,
                  text='ומה אם תכירו מישהו שמעניין אתכם בלי לקרוא עליו אף שורה?',
                  shots=[['ומה', 'אם'], ['תכירו'], ['מישהו'], ['שמעניין', 'אתכם'], ['בלי', 'לקרוא'], ['עליו', 'אף'], ['שורה?']],
                  top=['ומה אם תכירו', 'מישהו', 'שמעניין אתכם'], stack=['בלי לקרוא', 'עליו אף', 'שורה?']),
    'ad-25': dict(n=25, beat=0.6010, music='Pixabay "Trap Beat" by atlasaudio, 100 BPM', kc=3, kb=6, kt=2,
                  text='ומה אם במקום לנסות להרשים מישהו במשך שעה, פשוט תוכלו להיות אתם?',
                  shots=[['ומה', 'אם'], ['במקום', 'לנסות'], ['להרשים'], ['מישהו'], ['במשך', 'שעה,'], ['פשוט', 'תוכלו'], ['להיות'], ['אתם?']],
                  top=['ומה אם במקום', 'לנסות להרשים', 'מישהו במשך שעה,'], stack=['פשוט תוכלו', 'להיות', 'אתם?']),
    'ad-26': dict(n=26, beat=0.4996, music='Pixabay "Aggressive Beat" by echoes_of_lumen, 120 BPM', kc=5, kb=8, kt=2,
                  text='ומה אם אפשר להכיר מישהו חדש בלי לראיין אחד את השני?',
                  shots=[['ומה', 'אם'], ['אפשר'], ['להכיר'], ['מישהו', 'חדש'], ['בלי', 'לראיין'], ['אחד', 'את'], ['השני?']],
                  top=['ומה אם אפשר', 'להכיר', 'מישהו חדש'], stack=['בלי לראיין', 'אחד את', 'השני?']),
}


def js_list(xs):
    # videos only: no commas and no quotation marks in the text before the invitation (the images keep them)
    xs = [x.replace("ה״אז", "אז").replace(",", "").replace("״", "").replace('"', "").strip() for x in xs]
    return "[" + ", ".join("'" + x.replace("'", "\\'") + "'" for x in xs) + "]"


def build(name):
    sp = SPECS[name]; p = sp['beat']; shots = sp['shots']; s = len(shots) - 1
    assert len(shots[-1]) == 1 and shots[-1][0] == sp['stack'][-1], "the selected word must be the last stack line"
    join, card = s + 2, s + 2 + sp['kc']
    b4, tap = card + sp['kb'], card + sp['kb'] + sp['kt']
    snap = 0.24 + 0.15 * p
    src = (M / "ad-12" / "scene.js").read_text(encoding="utf-8")
    rows = []
    for i, w in enumerate(shots[:-1]):
        col = COLS[i]
        rows.append(f"      {{ a: G({i}), b: G({i + 1}),  bg: C.{col}, fg: C.{FG[col]}, words: {js_list(w)}, kind: '{KINDS[i]}' }},")
    rows.append(f"      {{ a: G({s}), b: T_JOIN, bg: C.INK,  fg: C.CREAM, words: {js_list(shots[-1])}, kind: 'select' }},")
    shots_js = "    const SHOTS = [\n" + "\n".join(rows) + "\n    ];\n"
    i0 = src.index("    const SHOTS = [\n"); i1 = src.index("    ];\n", i0) + len("    ];\n")
    src = src[:i0] + shots_js + src[i1:]
    slams = [i for i in range(s) if KINDS[i] == 'slam']
    sel = shots[-1][0]
    subs = [
        (r"^// scene\.js: .*$", f'// scene.js: ad {sp["n"]:02d}, "{sp["text"]}" + the invitation from the home page.'),
        (r"\((Pixabay|Mixkit) [^)]*\)", f'({sp["music"]}, from START s)'),
        (r"^    const T_JOIN = .*$", f"    const T_JOIN = G({join}), T_END = T_JOIN + 0.33; // the full question comes together right after the lock"),
        (r"^    const T_CARD = .*$", f"    const T_CARD = G({card}), T_COVER = T_CARD + 0.35;   // the invitation slides up on the rhythm change"),
        (r"^    const B4 = .*$", f"    const B4 = G({b4});                          // the invitation text, then the button"),
        (r"^    const T_ST = .*$", f"    const T_ST = G({card + 1}), T_TAP = G({tap});         // the stamp lands on a beat, the button is tapped on a beat"),
        (r"^    const SEL = SHOTS\[.*$", f"    const SEL = SHOTS[{s}], T_BOX = SEL.a + 0.06, T_SNAP = SEL.a + {snap:.2f}, T_LOCK = G({s + 1});"),
        (r"^    const T_GRAB = .*$", f"    const T_GRAB = SEL.a + {snap - 0.07:.2f}, T_DROP = T_LOCK - 0.03;"),
        (r"^    const STACK = .*$", f"    const STACK = {js_list(sp['stack'])}, LAST = STACK.length - 1;"),
        (r"^    const TOP = .*$", f"    const TOP = {js_list(sp['top'])};   // short lines: big enough to read on a phone"),
        (r"^    const pitch = .*$", "    const pitch = ss * 1.02;                                 // a little more room: the selected word is still shrinking as the lines drop in"),
        (r"^    const T_P = k => .*$", "    const T_P = k => T_JOIN + 0.34 + k * 0.07;              // the lines above drop in once the selected word has shrunk"),
        (r"^    const yHead = .*$", "    const yHead = -H / 2 + BORDER + 150;                   // the hand lettering line box stays inside the safe area, also at the end of the push"),
        (r"^    const HITS = \[\[.*$", "    const HITS = [" + ", ".join(f"[G({i}), {14 if k == 0 else 16}]" for k, i in enumerate(slams)) + ", [T_LOCK, 5], [T_END, 7]];"),
        (r'^    sfx\(G\(0\), "hit".*$', "    " + " ".join(f'sfx(G({i}), "hit", {1 if k == 0 else 0.85});' for k, i in enumerate(slams)) + ' sfx(T_LOCK, "tick", 1);'),
        (r"pulse\(t, G\(\d+\)\)", f"pulse(t, G({s + 4}))"),
        (r"tf\(uline, \{ sx: S\(t - G\(\d+\), 16, 1\), o: fin && t >= G\(\d+\) \? 1 : 0 \}\);",
         f"tf(uline, {{ sx: S(t - G({s + 3}), 16, 1), o: fin && t >= G({s + 3}) ? 1 : 0 }});"),
        (r'// the selection frame around "[^"]*"', f'// the selection frame around "{sel}"'),
        (r'// "[^"]*" keeps its place on the cut', f'// "{sel}" keeps its place on the cut'),
    ]
    for pat, rep in subs:
        src, k = re.subn(pat, rep.replace("\\", "\\\\"), src, count=1, flags=re.M)
        assert k == 1, (name, pat)
    d = M / name; d.mkdir(exist_ok=True)
    (d / "scene.js").write_text(src, encoding="utf-8")
    for f in ("core.js", "render.py", "audio.py", "index.html"):
        shutil.copy(M / "ad-12" / f, d / f)
    if not (d / "fonts").exists(): shutil.copytree(M / "ad-12" / "fonts", d / "fonts")
    print(f"{name}: select shot {s}, join G({join}), card G({card}) = video beat {card + 1} ({(card + 1) * p:.2f} s), button G({b4}), tap G({tap})")


for a in sys.argv[1:]:
    build(a)
