"""Parse the five Biodanza catalog PDFs (kept OUT of git, see apps/biodanza/catalog-source) into one JSON file.
   usage: python scripts/biodanza/parse.py <catalog-source dir> <out.json>
   Needs pdftotext. The JSON is catalog material: never commit it."""
import sys, re, json, subprocess, os, collections, difflib

SRC, OUT = sys.argv[1], sys.argv[2]
BIDI = re.compile(chr(91) + chr(0x200e) + chr(0x200f) + chr(0x202a) + chr(45) + chr(0x202e) + chr(0x2066) + chr(45) + chr(0x2069) + chr(93))
PUA = re.compile(chr(91) + chr(0xf000) + chr(45) + chr(0xf8ff) + chr(93))


def text(name):
    r = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-layout', os.path.join(SRC, name), '-'], capture_output=True)
    t = PUA.sub('', r.stdout.decode('utf-8', 'replace').replace(chr(13), ''))
    return BIDI.sub('', t).split(chr(10))



def clean(s):
    return re.sub(r'\s+', ' ', s).strip()


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r'\(.*?\)', ' ', s.lower().replace('`', "'"))).strip()


LINES = ('vitality', 'sexuality', 'creativity', 'affectivity', 'transcendence')
PHASE = {'I': 'opening', 'II': 'activation', 'III': 'bridge', 'IV': 'regression', 'V': 'closing'}


def dur(s):
    m = re.search(r'(\d+)[:.,](\d\d)\s*$', s)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def music_lines(block):
    """Lines under a 'Music:' label -> [(name, duration_sec, collection)]."""
    out, i = [], 0
    while i < len(block):
        m = re.match(r'^\s*(\d\d-\d\d)\s+(.*)$', block[i])
        if not m:
            i += 1
            continue
        cd, rest = m.group(1), m.group(2)
        j = i
        # a wrapped title has no duration at its end: glue the following lines
        while not re.search(r'\d+:\d\d\s*$', rest) and j + 1 < len(block) and block[j + 1].strip() \
                and not re.match(r'^\s*\d\d-\d\d\s', block[j + 1]) and j - i < 3:
            j += 1
            rest += '  ' + block[j].strip()
        cols = [c for c in re.split(r'\s{2,}', rest.strip()) if c]
        d = None
        if cols and re.fullmatch(r'\d+:\d\d', cols[-1]):
            d = dur(cols[-1])
            cols = cols[:-1]
        name = clean(', '.join(cols[:2]))
        if name:
            out.append((name, d, 'IBF ' + cd))
        i = j + 1
    return out


# ---------------------------------------------------------------- 2012: English body for structure and music
en = text('ibf-2012-en.pdf')
order, cat = [], ''
for l in en[310:638]:
    s = l.strip()
    m = re.match(r'^([A-Z][A-Z \'"&,()/.\-]+?)\s*_{5,}\s*(\d+)?$', s)
    if m:
        cat = m.group(1).title()
        continue
    m = re.match(r'^([A-Z0-9].*?)\s*\.{3,}\s*\d*\s*$', s)
    if m and cat and not s.startswith(('PART', 'Appendix')):
        order.append((clean(m.group(1)), cat))

heads, pos = [], 639
for title, cat in order:
    for k in range(pos, len(en)):
        s = en[k].strip()
        if s == title:
            heads.append((title, cat, k))
            pos = k + 1
            break

LABEL = re.compile(r'^\s*(Description|Objective|Observation|Notice|Stages of the Dance|Poetic element|Definition|Existential Projection|CIMEB Note|Music)\s*:?\s*$')
exercises = []
for n, (title, cat, k) in enumerate(heads):
    end = heads[n + 1][2] if n + 1 < len(heads) else len(en)
    blk = en[k + 1:end]
    for q, l in enumerate(blk):
        if 'ANNEXES TO THE IBF CATALOG' in l:
            blk = blk[:q]
            break
    f, cur, musicblk = collections.defaultdict(list), 'Description', []
    for l in blk:
        m = LABEL.match(l)
        if m:
            cur = m.group(1)
            continue
        (musicblk if cur == 'Music' else f[cur]).append(l)
    full = ' '.join(blk)
    lines = []
    for mm in re.finditer(r'line of (vitality|sexuality|creativity|affectivity|transcendence)', full, re.I):
        if mm.group(1).lower() not in lines:
            lines.append(mm.group(1).lower())
    exercises.append(dict(
        source='ibf2012', category=cat, title_en=title.title(), key=norm(title),
        description_en=clean(' '.join(f['Description'])), objective_en=clean(' '.join(f['Objective'])),
        poetics_en=clean(' '.join(f['Poetic element'] + f['Existential Projection'])),
        emphasis_en=clean(' '.join(f['Definition'] + f['Observation'] + f['Notice'] + f['CIMEB Note'])),
        lines=lines, phase=None, music=music_lines(musicblk)))

# Hebrew text for the same exercises, from the bilingual catalog
he = text('ibf-2012-he.pdf')
HL = re.compile(r'^\s*(תיאור|מטרה|דגש|הגדרה|הערה|התבוננות|אלמנט פואטי|הטלה קיומית|השלכה קיומית)\s*:\s*$')
hs = next((i for i in range(300, len(he)) if he[i].strip().startswith('CIRCLE OF INITIATION')
           and any(x.strip().startswith('Music') for x in he[i:i + 40])), 0)
hh, pos = [], hs
for ex in exercises:
    t = norm(ex['title_en'].split('(')[0])
    for k in range(pos, len(he)):
        ln = he[k].strip()
        if not re.search('[A-Z]{3,}', ln) or ln.startswith('Music') or re.search('[a-z]{4,}', ln):
            continue
        latin = norm(re.sub('[א-ת]', ' ', ln).lstrip(' )-').split('(')[0])
        if latin and difflib.SequenceMatcher(None, latin, t).ratio() >= 0.9:
            hh.append((ex, k))
            pos = k + 1
            break
for n, (ex, k) in enumerate(hh):
    end = hh[n + 1][1] if n + 1 < len(hh) else len(he)
    cur, f, sub = None, collections.defaultdict(list), ''
    for l in he[k + 1:end]:
        m = HL.match(l)
        if m:
            cur = m.group(1)
            continue
        if re.match(r'^\s*Music:', l):
            cur = 'Music'
            continue
        if cur is None and re.search('[א-ת]', l) and not re.search(r'[A-Za-z]{4,}', l):
            sub += ' ' + l.strip()
        elif cur and cur != 'Music' and re.search('[א-ת]', l) and not re.search(r'[A-Za-z]{4,} [A-Za-z]{3,}', l):
            f[cur].append(l)
    ex['description_he'] = clean(' '.join(f['תיאור'])) or clean(sub)
    ex['objective_he'] = clean(' '.join(f['מטרה']))
    ex['emphasis_he'] = clean(' '.join(f['דגש'] + f['הגדרה'] + f['הערה'] + f['התבוננות']))
    ex['poetics_he'] = clean(' '.join(f['אלמנט פואטי'] + f['הטלה קיומית'] + f['השלכה קיומית']))
for ex in exercises:
    for k in ('description_he', 'objective_he', 'emphasis_he', 'poetics_he'):
        ex.setdefault(k, '')
    ex.setdefault('title_he', '')
# Hebrew titles come from the contents list of the bilingual catalog: "79 .... Yang Dance With Vocal Expression - <hebrew>"
he_titles = {}
for l in he[:700]:
    m = re.match(r'^\s*\d+\s*\.{3,}\s*(.*?)\s+-\s+(.*[א-ת].*)$', l)
    if m:
        he_titles[norm(m.group(1).split('(')[0])] = clean(m.group(2))
for ex in exercises:
    ex['title_he'] = he_titles.get(norm(ex['title_en'].split('(')[0]), '')

# ---------------------------------------------------------------- 2018: English structure and music, Hebrew text
e18 = text('cimeb-2018-en.pdf')
cur_line, order18 = None, []
for l in e18[92:200]:
    s = l.strip()
    w0 = re.match(r'^([A-Z]+)', s)
    if w0 and w0.group(1).lower() in LINES and (s == w0.group(1) or re.match(r'^[A-Z]+\s*\.{3,}', s)):
        cur_line = w0.group(1).lower()
        continue
    m = re.match(r'^(.+?)\s*\.{3,}\s*\d+$', s)
    if m and cur_line and not m.group(1).startswith('(Variation'):
        order18.append((clean(m.group(1)), cur_line))

FIELD = re.compile(r'^\s*(Summary|Main line of vivencia|Objectives?|Existential projection|Description|(?:Linguistic semantic|Semantic linguistic) field|Right moment in the curve-session|Level|Authors? of the dance|MUSIC.*)\s*$')
heads18, pos = [], 280
for title, ln in order18:
    for k in range(pos, len(e18)):
        if norm(e18[k].strip()) == norm(title) and e18[k].strip():
            heads18.append((title, ln, k))
            pos = k + 1
            break
dances = []
for n, (title, ln, k) in enumerate(heads18):
    end = heads18[n + 1][2] if n + 1 < len(heads18) else len(e18)
    sec, f = None, collections.defaultdict(list)
    for l in e18[k + 1:end]:
        if re.match(r'^\s*\d+\s*\|\s*P\s*a\s*g\s*e', l):
            continue
        m = FIELD.match(l)
        if m:
            sec = 'MUSIC' if m.group(1).startswith('MUSIC') else m.group(1)
            continue
        if sec:
            f[sec].append(l)
    lines = []
    for w in re.findall(r'[A-Za-z]+', ' '.join(f['Main line of vivencia'])):
        if w.lower() in LINES and w.lower() not in lines:
            lines.append(w.lower())
    if not lines:
        lines = [ln]
    phases = [PHASE[r] for r in re.findall(r'Phase\s+(I{1,3}|IV|V)\b', ' '.join(f['Right moment in the curve-session']))]
    mus, cur = [], {}
    for l in f['MUSIC'] + ['    Title: END']:
        m = re.match(r'^\s*(Title|Artists?|Composers?|Album|Duration|Collection):\s*(.*)$', l)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if key == 'Title':
            if cur.get('title'):
                mus.append(cur)
            cur = {'title': val}
        else:
            cur[key.lower().rstrip('s')] = val
    musics = []
    for m in mus:
        if m['title'] == 'END':
            continue
        d, mm = None, re.match(r'(\d+)[.,](\d+)', m.get('duration', ''))
        if mm:
            d = int(mm.group(1)) * 60 + int(mm.group(2))
        musics.append((clean(m['title'] + (', ' + m['artist'] if m.get('artist') else '')), d, m.get('collection', '')))
    dances.append(dict(
        source='cimeb2018', category=ln.title(), title_en=title.title(), key=norm(title),
        description_en=clean(' '.join(f['Description'])), objective_en=clean(' '.join(f['Objectives'] + f['Objective'])),
        poetics_en=clean(' '.join(f['Existential projection'])), emphasis_en='',
        summary_en=clean(' '.join(f['Summary'])),
        semantic_en=clean(' '.join(f['Linguistic semantic field'] + f['Semantic linguistic field'])),
        level_en=clean(' '.join(f['Level'])), authors=clean(' '.join(f['Author of the dance'] + f['Authors of the dance'])),
        lines=lines, phase=phases[0] if phases else None, music=musics))

h18 = text('cimeb-2018-he.pdf')
HF = re.compile(r'^\s*(תקציר|קו ויונסיה עיקרי|מטרות|מטרה|השלכה קיומית|תיאור|שדה סמנטי לשוני|מיקום נכון בעקומה|רמה|מחברי הריקוד|מחבר הריקוד|מוזיקה)\s*:(.*)$')
hb, pos, found = [], 0, []
for d in dances:
    for k in range(pos, len(h18)):
        ln = h18[k].strip()
        if k < 380 or not re.search('[A-Z]{3,}', ln) or ln.startswith('•'):
            continue
        latin = norm(re.sub('[א-ת]', ' ', ln.rstrip('-')).lstrip(' )-').split('(')[0])
        if difflib.SequenceMatcher(None, latin, d['key']).ratio() >= 0.85:
            he_part = clean(re.sub(r"[A-Z0-9 ,.'`\"()!&:/\-’‘–]+$", ' ', ln.rstrip('-')))
            if not he_part:
                prev = [x.strip() for x in h18[max(0, k - 4):k] if x.strip()]
                if prev and re.search('[א-ת]', prev[-1]) and not re.search('[A-Za-z]', prev[-1]) and len(prev[-1]) < 50:
                    he_part = prev[-1]
            found.append((d, k, he_part))
            pos = k + 1
            break
unmatched = [d['title_en'] for d in dances if d not in [x[0] for x in found]]
for n, (d, k, title_he) in enumerate(found):
    end = found[n + 1][1] if n + 1 < len(found) else len(h18)
    sec, f = None, collections.defaultdict(list)
    for l in h18[k + 1:end]:
        m = HF.match(l)
        if m:
            sec = m.group(1)
            f[sec].append(m.group(2))
            continue
        if sec and sec != 'מוזיקה' and l.strip() and not re.match(r'^\s*\d+\s*$', l):
            f[sec].append(l)
    d['title_he'] = title_he
    d['summary_he'] = clean(' '.join(f['תקציר']))
    d['objective_he'] = clean(' '.join(f['מטרות'] + f['מטרה']))
    d['poetics_he'] = clean(' '.join(f['השלכה קיומית']))
    d['description_he'] = clean(' '.join(f['תיאור']))
    d['semantic_he'] = clean(' '.join(f['שדה סמנטי לשוני']))
    d['level_he'] = clean(' '.join(f['רמה']))
    d['authors_he'] = clean(' '.join(f['מחברי הריקוד'] + f['מחבר הריקוד']))

# ---------------------------------------------------------------- 2014: music by dance name
c14 = text('catalog-2014-en.pdf')
by14, dance = collections.OrderedDict(), None
first = next(i for i, l in enumerate(c14) if l.strip().startswith('Abdominal Breathing'))
for l in c14[first:]:
    s = l.strip().lstrip('!').strip()
    if not s:
        continue
    m = re.match(r'^(.*?)\.{3,}\s*(\d+)[,.](\d\d)\s*\.*\s*([A-Za-z]*\s?[\d\-]*)\s*$', s)
    if m and dance:
        by14[dance].append((clean(m.group(1)).replace(' - ', ', '), int(m.group(2)) * 60 + int(m.group(3)), clean(m.group(4))))
    elif '....' not in s and len(s) < 90 and not re.match(r'^\d+$', s):
        if 'SECONDPART' in s.upper().replace(' ', ''):
            break
        dance = s
        by14.setdefault(dance, [])

report = dict(toc2012=len(order), found2012=len(heads), he2012=len(hh), toc2018=len(order18), found2018=len(heads18),
              he2018=len(found), unmatched2018=unmatched, music2012=sum(len(e['music']) for e in exercises),
              music2018=sum(len(d['music']) for d in dances), dances2014=len(by14), music2014=sum(len(v) for v in by14.values()))
json.dump(dict(ibf2012=exercises, cimeb2018=dances, c2014=by14, report=report), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(report, ensure_ascii=False))
