# Parse the English IBF 2012 catalog body into exercises. Uncommitted helper.
import json, re, sys, os
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
P = json.load(open(os.path.join(OUT, 'raw_en.json'), encoding='utf-8'))
TOC = json.load(open(os.path.join(OUT, 'toc_en.json'), encoding='utf-8'))
CODE = re.compile(r'^\d\d-\d\d$')
RED = 8388608
BLUE = 255
WHITE = 16777215

def clean_name(n):
    return re.sub(r'^[\uf0d8\s]+', '', n).strip()

# flatten body lines
items = []
for pg in P[16:128]:
    for l in sorted(pg['lines'], key=lambda l: (round(l['y']), l['x0'])):
        sp = l['spans']
        text = ''.join(s[3] for s in sp)
        t = text.strip()
        if not t:
            continue
        f0 = sp[0]
        it = dict(page=pg['page'], y=l['y'], x=l['x0'], text=t, color=f0[2], size=f0[1], font=f0[0])
        if f0[0] == 'Arial-BoldMT' and f0[1] == 11.0 and l['x0'] < 55:
            it['kind'] = 'headW' if f0[2] == WHITE else 'head'
        elif f0[2] == BLUE:
            it['kind'] = 'label'
        elif f0[2] == RED:
            it['kind'] = 'note'
        elif f0[2] == 128 and f0[0].startswith('Arial-Bold') and l['x0'] > 80:
            it['kind'] = 'mtitle'
        elif f0[1] == 10.0 and f0[2] == 0 and l['x0'] > 280 and (l['x0'] < 520):
            it['kind'] = 'martist'
        elif f0[1] == 10.0 and f0[2] == 0 and l['x0'] >= 500:
            it['kind'] = 'mdur'
        elif CODE.match(t) and l['x0'] < 70:
            it['kind'] = 'mcode'
        else:
            it['kind'] = 'text'
        items.append(it)

# fix label glitch (split label letters)
for i, it in enumerate(items):
    if it['kind'] == 'label' and len(it['text']) == 1:
        it['kind'] = 'glitch'

segs = []   # list of dict(name, kind, items)
cur = None
for it in items:
    if it['kind'] in ('head', 'headW'):
        cur = dict(name=it['text'], kind=it['kind'], page=it['page'], items=[])
        segs.append(cur)
    else:
        if cur is None:
            continue
        cur['items'].append(it)

def parse_music(its):
    """group music rows from items list (already in order); returns tracks"""
    tracks = []
    pending = None
    rows = []
    # sort by y then x already; build per code
    for it in its:
        if it['kind'] == 'mcode':
            pending = dict(code=it['text'], title=[], artist=[], dur='', y=it['y'], note=[])
            tracks.append(pending)
        elif it['kind'] == 'mtitle' and pending is not None:
            pending['title'].append(it['text'])
        elif it['kind'] == 'martist' and pending is not None:
            pending['artist'].append(it['text'])
        elif it['kind'] == 'mdur' and pending is not None:
            pending['dur'] = it['text']
        elif it['kind'] == 'note' and pending is not None:
            pending['note'].append(it['text'])
    return tracks

def dur_sec(s):
    m = re.match(r'(\d+):(\d\d)$', s.strip())
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None

def join_lines(lines):
    out = ''
    for ln in lines:
        if not out:
            out = ln
        elif out.endswith('-') and not out.endswith(' -') and len(out) > 1 and out[-2].isalpha():
            out += ln
        else:
            out += ' ' + ln
    return re.sub(r'\s+', ' ', out).strip()

def paragraphs(textitems):
    """textitems: items kind text (with page,y). returns list of paragraph strings"""
    paras = []
    cur = []
    last = None
    for it in textitems:
        if last is not None:
            newpage = it['page'] != last['page']
            gap = it['y'] - last['y']
            if newpage:
                # continue paragraph if last line did not end a sentence
                if re.search(r'[.:;!?"\')\u201d]\s*$', cur[-1]) and it['text'][:1].isupper():
                    paras.append(join_lines(cur)); cur = []
            elif gap > 17 or it['size'] != last['size'] or it['color'] != last['color']:
                paras.append(join_lines(cur)); cur = []
        cur.append(it['text'])
        last = it
    if cur:
        paras.append(join_lines(cur))
    return [p for p in paras if p]

result = []
chapters = []
catname = None
for s in segs:
    if s['kind'] == 'headW':
        # chapter intro: text items until next head
        txt = [i for i in s['items'] if i['kind'] == 'text']
        chapters.append(dict(name=s['name'], page=s['page'], intro=paragraphs(txt), other=[i['text'] for i in s['items'] if i['kind'] not in ('text',)][:3]))
        catname = s['name']
        continue
    # exercise segment: sections by labels
    sections = []   # (label, [text items])
    label = ''
    bucket = []
    notes_after_music = []
    in_music = False
    tracks_items = []
    for it in s['items']:
        k = it['kind']
        if k == 'label':
            if bucket or label:
                sections.append((label, bucket))
            label = it['text'].rstrip(':').strip()
            bucket = []
            in_music = (label == 'Music')
        elif k in ('mcode', 'mtitle', 'martist', 'mdur', 'note'):
            tracks_items.append(it)
        elif k == 'text':
            if in_music:
                # text after music rows with no label
                sections.append((label, bucket)); label = '(after music)'; bucket = []; in_music = False
            bucket.append(it)
    sections.append((label, bucket))
    secs = []
    for lab, b in sections:
        if lab == 'Music':
            continue
        if not b:
            continue
        secs.append((lab, paragraphs(b)))
    tracks = parse_music(tracks_items)
    trk = []
    for t in tracks:
        art = join_lines(t['artist']); dur = t['dur']
        mm = re.match(r'^(.*?)\s*(\d+:\d\d)$', art)
        if not dur and mm:
            art, dur = mm.group(1).strip(), mm.group(2)
        trk.append(dict(code=t['code'], title=join_lines(t['title']), artist=art, duration=dur, duration_sec=dur_sec(dur), note=join_lines(t['note'])))
    result.append(dict(name=s['name'], page=s['page'], sections=secs, tracks=trk))

json.dump(dict(exercises=result, chapters=chapters), open(os.path.join(OUT, 'parsed_en.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(result), len(chapters))
