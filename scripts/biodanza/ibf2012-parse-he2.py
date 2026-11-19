# Parse the Hebrew edition of the IBF 2012 catalog using CHAR positions (visual order), so punctuation and spaces land where they are drawn.
# Uncommitted helper.
import fitz, json, re, os, warnings
warnings.filterwarnings('ignore')
SRC = r'C:\Users\ofira\Desktop\floa\apps\biodanza\catalog-source\ibf-2012-he.pdf'
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
RAW = json.load(open(os.path.join(OUT, 'raw_he.json'), encoding='utf-8'))
CODE = re.compile(r'^\d\d-\d\d\b')
RED, BLUE, WHITE = 8388608, 255, 16777215
HEBL = re.compile(r'[\u05d0-\u05ea]')
LATD = re.compile(r'[A-Za-z0-9\u00c0-\u024f]')

def clusters(pg):
    rects = sorted(pg['heads'], key=lambda h: h[1])
    lines = []
    for r in rects:
        if lines and abs(r[1] - lines[-1]['y0']) <= 4:
            lines[-1]['rects'].append(r); lines[-1]['y1'] = max(lines[-1]['y1'], r[3])
        else:
            lines.append(dict(y0=r[1], y1=r[3], rects=[r]))
    out = []
    for c in lines:
        if out and c['y0'] - out[-1]['y0'] <= 20:
            out[-1]['y1'] = c['y1']; out[-1]['rects'] += c['rects']
        else:
            out.append(c)
    return out

def in_heading(cl, x0, x1, y0, y1):
    for c in cl:
        for r in c['rects']:
            if x1 >= r[0] - 2 and x0 <= r[2] + 2 and y1 >= r[1] - 1 and y0 <= r[3] + 1:
                return True
    return False

def visual_string(chars):
    """chars: list of (c, x0, x1). Returns the text in logical order for an RTL line with embedded LTR runs."""
    chars = sorted(chars, key=lambda t: -(t[1] + t[2]) / 2)
    # word gaps: a space glyph counts where it is drawn; an unexplained gap becomes a space
    seq = []
    for k, (c, x0, x1) in enumerate(chars):
        if seq and not c.isspace() and not seq[-1][0].isspace():
            gap = seq[-1][1] - x1
            if gap > 1.6:
                seq.append((' ', seq[-1][1], x1))
        seq.append((c, x0, x1))
    s = [t[0] for t in seq]
    # reverse LTR runs (Latin/digits with neutrals between) that the x-sort turned around
    kinds = ['L' if LATD.match(c) else ('R' if HEBL.match(c) else 'N') for c in s]
    out = []; i = 0
    while i < len(s):
        if kinds[i] == 'L':
            j = i
            last_l = i
            while j < len(s) and kinds[j] != 'R':
                if kinds[j] == 'L': last_l = j
                j += 1
            run = s[i:last_l + 1]
            out.extend(run[::-1]); i = last_l + 1
        else:
            out.append(s[i]); i += 1
    # swap mirrored parens that belong to the RTL part (those not inside an LTR run); LTR runs were rebuilt above so mark them
    txt = []
    i = 0
    res = []
    # recompute kinds on output to know which parens sit in LTR runs
    ok = ['L' if LATD.match(c) else ('R' if HEBL.match(c) else 'N') for c in out]
    for idx, c in enumerate(out):
        if c in '()':
            # inside LTR run if there is an L char on both sides before an R char
            left = next((ok[k] for k in range(idx - 1, -1, -1) if ok[k] != 'N'), None)
            right = next((ok[k] for k in range(idx + 1, len(out)) if ok[k] != 'N'), None)
            if left == 'L' and right == 'L':
                res.append(c)
            else:
                res.append(')' if c == '(' else '(')
        else:
            res.append(c)
    return ''.join(res)

def clean_space(s):
    s = re.sub(r'[\u200e\u200f\u202a-\u202e]', '', s).replace('\u00a0', ' ').replace('\x01', '.')
    s = re.sub(r'([\u05d0-\u05ea])(["\u201c]?)([A-Za-z])', lambda m: m.group(1) + ' ' + m.group(2) + m.group(3), s)
    s = re.sub(r'([A-Za-z0-9)])([\u05d0-\u05ea])', r'\1 \2', s)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'\s+([.,;:!?)])(?=\s|$)', r'\1', s)
    s = re.sub(r'\s+([.,;:!?])(?=[^\s.,;:!?)])', r'\1 ', s)
    s = re.sub(r'(?<=[א-ת)"])([.,;:!?])(?=[א-ת])', r'\1 ', s)
    return s

def classify(font, size, color, text):
    if color == WHITE: return 'headW'
    if color == RED: return 'note'
    if color == BLUE: return 'label'
    if size <= 10.01 and color in (0, 128): return 'music'
    if font.startswith('Arial,Bold') and color in (8421504, 7762289): return 'prosehd'
    if font.startswith('Arial,Bold') and size >= 10.9 and color == 0 and re.fullmatch(r"[A-Z0-9 ,.\-()'\"/:]+", text.strip() or 'a'): return 'skip'
    return 'prose'

doc = fitz.open(SRC)
events = []
for pi in range(16, 129):
    pgraw = RAW[pi]; pgn = pgraw['page']
    cl = clusters(pgraw)
    for c in cl:
        events.append(dict(kind='head', page=pgn, y=c['y0'], x=999))
    rd = doc[pi].get_text('rawdict')
    cells = {}   # (kind, ycluster) -> chars
    ylist = []
    musics = []
    for b in rd['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                txt = ''.join(ch['c'] for ch in s['chars'])
                if not txt.strip(): continue
                kind = classify(s['font'], s['size'], s['color'], txt)
                if kind == 'skip': continue
                x0, y0, x1, y1 = s['bbox']
                if y0 > 785: continue
                if kind != 'headW' and in_heading(cl, x0, x1, y0, y1): continue
                if kind == 'music':
                    musics.append(dict(kind='music', page=pgn, y=y0, x=x0, x1=x1, text=txt)); continue
                yc = (y0 + y1) / 2
                for ch in s['chars']:
                    if ch['c'] == ' ' and not (ch['bbox'][2] - ch['bbox'][0] > 0): continue
                    cells.setdefault(kind, []).append((yc, ch['c'], ch['bbox'][0], ch['bbox'][2]))
    events.extend(musics)
    for kind, lst in cells.items():
        lst.sort(key=lambda t: t[0])
        groups = []
        for t in lst:
            if groups and abs(groups[-1][0][0] - t[0]) <= 3.2 and abs(sum(g[0] for g in groups[-1]) / len(groups[-1]) - t[0]) <= 3.2:
                groups[-1].append(t)
            else:
                groups.append([t])
        for g in groups:
            y = sum(t[0] for t in g) / len(g) - 5
            txt = visual_string([(t[1], t[2], t[3]) for t in g])
            events.append(dict(kind=kind, page=pgn, y=y, x=max(t[3] for t in g), x1=max(t[3] for t in g), text=txt))

events.sort(key=lambda e: (e['page'], round(e['y']) if e['kind'] != 'head' else e['y'] - 0.5, -e.get('x', 0)))

def visual_lines(evs):
    lines = []
    for e in evs:
        if lines and lines[-1]['page'] == e['page'] and abs(lines[-1]['y'] - e['y']) <= 3.5:
            lines[-1]['spans'].append(e)
        else:
            lines.append(dict(page=e['page'], y=e['y'], spans=[e]))
    for ln in lines:
        ln['spans'].sort(key=lambda e: -e['x'])
    return lines

def paragraphs_from(evs):
    lines = visual_lines(evs)
    paras = []; cur = []; last = None
    for ln in lines:
        t = clean_space(' '.join(sp['text'] for sp in ln['spans']))
        if not t: continue
        hd = any(sp['kind'] == 'prosehd' for sp in ln['spans'])
        if last is not None and hd != last.get('hd'):
            paras.append(' '.join(cur)); cur = []
        elif last is not None:
            gap = ln['y'] - last['y']
            if ln['page'] != last['page']:
                if re.search(r'[.:;!?"\')]\s*$', cur[-1]):
                    paras.append(' '.join(cur)); cur = []
            elif gap > 20:
                paras.append(' '.join(cur)); cur = []
        cur.append(t); last = dict(ln, hd=hd)
    if cur: paras.append(' '.join(cur))
    return [re.sub(r'^[:\s]+', '', re.sub(r'\s+', ' ', p).strip()) for p in paras if p.strip(' :')]

segments = []; chapters = []; cur = None; mode = None
for e in events:
    if e['kind'] == 'head':
        cur = dict(page=e['page'], items=[]); segments.append(cur); mode = 'ex'
    elif e['kind'] == 'headW':
        mode = 'chapter'
        if not chapters or chapters[-1]['page'] != e['page'] or abs(chapters[-1]['y'] - e['y']) > 40:
            chapters.append(dict(page=e['page'], y=e['y'], text=[], items=[]))
        chapters[-1]['text'].append(e['text']); cur = None
    else:
        if mode == 'chapter' and cur is None:
            chapters[-1]['items'].append(e)
        elif cur is not None:
            cur['items'].append(e)

LABELMAP = [
    (r'^(ה)?תיא?ור$|^תאור$', 'Description'), (r'^(ה)?מטרה$', 'Objective'),
    (r'^(ה)?(דגש|דגשים)', 'Emphasis'), (r'^תצפית|^אבחנה', 'Observation'),
    (r'^הגדרה|^הַגדָרָה', 'Definition'), (r'פואטי', 'Poetic element'), (r'קיומית|^השלכה', 'Existential Projection'),
    (r'שלבי', 'Stages of the Dance'), (r'CIMEB|CIMB|מה-', 'CIMEB Note'), (r'^הערה$|^הערה[^A-Za-z]*$', 'Note'),
    (r'(שימולב|לשימלב|לשיםלב|לתשומתלב)', 'Notice'), (r'משוב|פידבק', 'Feedback'), (r'^Music$', 'Music'),
]
def label_name(t):
    t = re.sub(r'[\s:.\u200e\u200f\u202a-\u202e]', '', t)
    for rx, name in LABELMAP:
        if re.search(rx, t): return name
    return 'UNKNOWN:' + t

def english_tail_cut(t):
    """note line = Hebrew on the right, English on the left at the same y: keep the Hebrew up to its last letter (plus closing marks)"""
    idx = [m.start() for m in HEBL.finditer(t)]
    if not idx: return t
    L = idx[-1]
    tail = re.match(r"[.,:;!?\"”’')\]]*", t[L + 1:]).group(0)
    return t[:L + 1] + tail

def build(seg):
    its = seg['items']
    vl = visual_lines([e for e in its if e['kind'] in ('prose', 'prosehd', 'label', 'music', 'note')])
    sections = []; label = ''; bucket = []; in_music = False
    tracks = []; curtrack = None; notes = {}
    for ln in vl:
        music_spans = [sp for sp in ln['spans'] if sp['kind'] == 'music']
        note_spans = [sp for sp in ln['spans'] if sp['kind'] == 'note']
        label_spans = [sp for sp in ln['spans'] if sp['kind'] == 'label']
        prose_spans = [sp for sp in ln['spans'] if sp['kind'] in ('prose', 'prosehd')]
        for sp in music_spans:
            m = CODE.match(sp['text'].strip())
            if m:
                curtrack = m.group(0); tracks.append(curtrack)
        if label_spans:
            nm = label_name(' '.join(sp['text'] for sp in label_spans))
            lt = re.sub(r'[\s:.]', '', ' '.join(sp['text'] for sp in label_spans))
            if nm == 'Music':
                if bucket or label: sections.append((label, bucket))
                label = 'Music'; bucket = []; in_music = True
            elif lt == '':
                pass
            else:
                if bucket or label: sections.append((label, bucket))
                label = nm; bucket = []; in_music = False
        if note_spans:
            notes.setdefault(curtrack, []).append(dict(page=ln['page'], y=ln['y'], spans=note_spans))
        if prose_spans:
            if in_music:
                sections.append((label, bucket)); label = '(after music)'; bucket = []; in_music = False
            bucket.append(dict(page=ln['page'], y=ln['y'], spans=prose_spans))
    sections.append((label, bucket))
    secs = []
    for lab, b in sections:
        if lab == 'Music' or not b: continue
        pr = paragraphs_from([sp for ln in b for sp in ln['spans']])
        if pr: secs.append((lab, pr))
    nt = {}
    for code, lns in notes.items():
        texts = []; first = True
        for ln in lns:
            t = clean_space(' '.join(sp['text'] for sp in sorted(ln['spans'], key=lambda e: -e['x'])))
            if HEBL.search(t):
                if first:
                    t = english_tail_cut(t); first = False
                # drop a leading English run (English on the left is sorted last, so only a tail is cut); drop remaining pure-English lines
                texts.append(t)
        if texts: nt[code] = ' '.join(texts)
    return dict(page=seg['page'], sections=secs, tracks=tracks, notes=nt)

res = [build(s) for s in segments]
chs = []
for c in chapters:
    evs = [e for e in c['items'] if e['kind'] == 'prose']
    chs.append(dict(page=c['page'], title=' '.join(c['text']), intro=paragraphs_from(evs)))
json.dump(dict(exercises=res, chapters=chs), open(os.path.join(OUT, 'parsed_he.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(res), len(chs))
