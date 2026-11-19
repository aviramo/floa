# Parse the Hebrew edition of the IBF 2012 catalog body. Uncommitted helper.
import json, re, os
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
P = json.load(open(os.path.join(OUT, 'raw_he.json'), encoding='utf-8'))
CODE = re.compile(r'^\d\d-\d\d\b')
RED, BLUE, WHITE = 8388608, 255, 16777215
HEB = re.compile(r'[\u0590-\u05ff]')
BLANK = re.compile(r'^[\s\u200e\u200f\u202a-\u202e]*$')

# ---------- heading clusters per page ----------
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
        if out and c["y0"] - out[-1]["y0"] <= 20:
            out[-1]['y1'] = c['y1']; out[-1]['rects'] += c['rects']
        else:
            out.append(c)
    return out

def in_heading(c_list, y0, y1, x0, x1):
    for c in c_list:
        if y1 >= c['y0'] - 1 and y0 <= c['y1'] + 1:
            for r in c['rects']:
                if x1 >= r[0] - 2 and x0 <= r[2] + 2 and y1 >= r[1] - 1 and y0 <= r[3] + 1:
                    return True
    return False

# ---------- text fixes ----------
PUN = '.,:;!?()"\u2019\''
def swap_parens(s):
    return s.translate(str.maketrans('()', ')('))

def fix_fragment(s):
    """fix one raw fragment of Hebrew-containing text"""
    if not HEB.search(s):
        return s
    s = swap_parens(s)
    tail = ''
    # leading cluster that holds sentence punctuation: reverse it and send it to the end
    m = re.match(r"^(\s*)([.,:;!?()\"’']+)(\s*)(?=[֐-׿A-Za-z0-9])", s)
    if m and re.search(r'[.,:;!?]', m.group(2)):
        tail = m.group(2)[::-1]
        s = s[m.end():]
    # punctuation glued in front of a Hebrew letter is a misplaced line-end mark
    marks = []
    def grab(mm):
        marks.append(mm.group(1)); return ' '
    s = re.sub(r'(?<=[א-ת])([.,:;])(?=[א-ת])', grab, s)
    s = re.sub(r' ([.,:;])(?=[א-ת])', lambda mm: (marks.append(mm.group(1)) or ' '), s)
    return s.rstrip() + ''.join(marks) + tail + ' '

def tidy(s):
    s = re.sub(r'[\u200e\u200f\u202a-\u202e]', '', s)
    s = s.replace('\u00a0', ' ')
    # space between Hebrew and Latin runs
    s = re.sub(r'([\u0590-\u05ff])(["\u201c]?)([A-Za-z])', lambda m: m.group(1) + ' ' + m.group(2) + m.group(3), s)
    s = re.sub(r'([A-Za-z0-9)])([\u0590-\u05ff])', r'\1 \2', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

PREFIX = 'בכלמשהו'
def join_broken(s):
    """join obvious extraction splits: a lone prefix letter before a word, or a lone final letter after a word"""
    toks = s.split(' ')
    out = []
    i = 0
    while i < len(toks):
        t = toks[i]
        nxt = toks[i + 1] if i + 1 < len(toks) else ''
        if re.fullmatch(r'[ךםןףץ]', t) and out and HEB.search(out[-1]):
            out[-1] += t
        elif len(t) == 1 and t in PREFIX and nxt and re.match(r'[א-ת]', nxt):
            out.append(t + nxt); i += 1
        elif len(t) == 1 and re.fullmatch(r'[א-ת]', t) and out and HEB.search(out[-1]) and (not nxt or not re.match(r'[א-ת]', nxt)):
            out[-1] += t
        else:
            out.append(t)
        i += 1
    return ' '.join(out)

# ---------- collect spans ----------
events = []   # sequence in document order of dicts
for pg in P[16:129]:
    cl = clusters(pg)
    pgn = pg['page']
    for c in cl:
        events.append(dict(kind='head', page=pgn, y=c['y0'], x=999))
    for l in pg['lines']:
        x0, x1, y = l['x0'], l['x1'], l['y']
        sp = l['spans']
        if in_heading(cl, y, y + 10, x0, x1):
            continue
        # split spans: music / note / label / prose / whiteheading
        for s in sp:
            font, size, color, text = s
            if BLANK.match(text):
                continue
            if color == WHITE:
                events.append(dict(kind='headW', page=pgn, y=y, x=x0, text=text.strip())); continue
            if color == RED:
                k = 'note'
            elif color == BLUE:
                k = 'label'
            elif size <= 10.01 and color in (0, 128) :
                k = 'music'
            elif font.startswith('Arial,Bold') and size >= 10.9 and color == 0 and re.fullmatch(r"[A-Z0-9 ,.\-()'\"/:]+", text.strip() or 'a'):
                continue   # English heading text
            else:
                k = 'prose'
            events.append(dict(kind=k, page=pgn, y=y, x=x0, x1=x1, text=text, color=color, size=size, font=font))

events.sort(key=lambda e: (e['page'], round(e['y']) if e['kind'] != 'head' else e['y'] - 0.5, -e.get('x', 0)))

# ---------- visual lines ----------
def visual_lines(evs):
    """group events (same page) by y; return list of dict(page,y,spans sorted RTL)"""
    lines = []
    for e in evs:
        if lines and lines[-1]['page'] == e['page'] and abs(lines[-1]['y'] - e['y']) <= 3:
            lines[-1]['spans'].append(e)
        else:
            lines.append(dict(page=e['page'], y=e['y'], spans=[e]))
    for ln in lines:
        ln['spans'].sort(key=lambda e: -e['x'])
    return lines

def line_text(ln):
    out = ''
    prev = None
    for sp in ln['spans']:
        t = fix_fragment(sp['text'])
        if prev is None:
            out = t
        else:
            gap = prev['x'] - sp.get('x1', sp['x'])
            if False:
                out += t
            else:
                out += ' ' + t
        prev = sp
    return tidy(out)

def paragraphs_from(evs):
    lines = visual_lines(evs)
    paras = []; cur = []; last = None
    for ln in lines:
        t = line_text(ln)
        if not t:
            continue
        if last is not None and (ln['page'] != last['page'] or ln['y'] - last['y'] > 20):
            if ln['page'] != last['page'] and not re.search(r'[.:;!?"\')]\s*$', cur[-1]):
                pass
            else:
                paras.append(' '.join(cur)); cur = []
        cur.append(t); last = ln
    if cur:
        paras.append(' '.join(cur))
    return [join_broken(re.sub(r'^[:\s]+', '', re.sub(r'\s+', ' ', p).strip())) for p in paras if p.strip(' :')]

# ---------- segmentation ----------
segments = []
chapters = []
cur = None
mode = None
for e in events:
    if e['kind'] == 'head':
        cur = dict(page=e['page'], items=[])
        segments.append(cur); mode = 'ex'
    elif e['kind'] == 'headW':
        mode = 'chapter'
        if not chapters or chapters[-1]['page'] != e['page'] or abs(chapters[-1]['y'] - e['y']) > 40:
            chapters.append(dict(page=e['page'], y=e['y'], text=[], items=[]))
        chapters[-1]['text'].append(e['text'])
        cur = None
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
    t = re.sub(r'[A-Z]*$', lambda m: m.group(0), t)
    for rx, name in LABELMAP:
        if re.search(rx, t):
            return name
    return 'UNKNOWN:' + t

def build(seg):
    its = seg['items']
    # group into ordered stream of visual lines w/ kinds
    prose_like = [e for e in its if e['kind'] in ('prose', 'label', 'music', 'note')]
    vl = visual_lines(prose_like)
    sections = []; label = ''; bucket = []; in_music = False
    tracks = []; curtrack = None
    notes = {}
    for ln in vl:
        kinds = {sp['kind'] for sp in ln['spans']}
        # music row?
        music_spans = [sp for sp in ln['spans'] if sp['kind'] == 'music']
        note_spans = [sp for sp in ln['spans'] if sp['kind'] == 'note']
        label_spans = [sp for sp in ln['spans'] if sp['kind'] == 'label']
        prose_spans = [sp for sp in ln['spans'] if sp['kind'] == 'prose']
        for sp in music_spans:
            m = CODE.match(sp['text'].strip())
            if m:
                curtrack = m.group(0); tracks.append(curtrack)
        if label_spans:
            lt = ''.join(sp['text'] for sp in label_spans)
            nm = label_name(''.join(fix_fragment(sp['text']) for sp in label_spans))
            if nm == 'Music':
                if bucket or label: sections.append((label, bucket))
                label = 'Music'; bucket = []; in_music = True
            elif re.sub(r'[\s:.]', '', lt) == '':
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
        if lab == 'Music' or not b:
            continue
        evs = [sp for ln in b for sp in ln['spans']]
        pr = paragraphs_from(evs)
        if pr:
            secs.append((lab, pr))
    # notes: Hebrew part only
    nt = {}
    for code, lns in notes.items():
        texts = []
        for ln in lns:
            parts = []
            for sp in ln['spans']:
                t = sp['text']
                m = HEB.search(t)
                if not m:
                    continue
                # cut English prefix; keep a dangling , or . that belongs to the Hebrew run
                pre = t[:m.start()]
                tail = ''
                pm = re.search(r'([.,:;!?()]+)\s*$', pre)
                if pm: tail = pm.group(1)
                hebpart = t[m.start():]
                parts.append(fix_fragment((tail + hebpart) if tail else hebpart))
            if parts:
                texts.append(tidy(' '.join(parts)))
        if texts:
            nt[code] = join_broken(' '.join(texts))
    return dict(page=seg['page'], sections=secs, tracks=tracks, notes=nt)

res = [build(s) for s in segments]
chs = []
for c in chapters:
    evs = [e for e in c['items'] if e['kind'] == 'prose']
    chs.append(dict(page=c['page'], title=' '.join(c['text']), intro=paragraphs_from(evs)))
json.dump(dict(exercises=res, chapters=chs), open(os.path.join(OUT, 'parsed_he.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(res), len(chs))
