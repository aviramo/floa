# Match the songs of the IBF 2012 catalog to biodanza.music and produce the SQL for exercise_music. Uncommitted helper.
import json, re, os, unicodedata, difflib, collections
SC = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad'
OUT = os.path.join(SC, 'ibf2012', 'links'); os.makedirs(OUT, exist_ok=True)
music = json.load(open(r'C:\tmp\music.json', encoding='utf-8'))
links = json.load(open(os.path.join(SC, 'ibf2012', 'ibf2012-links.json'), encoding='utf-8'))
ids = json.load(open(os.path.join(SC, 'ibf2012', 'ibf2012-inserted-ids.json'), encoding='utf-8'))
exid = {e['title_en']: e['id'] for e in ids['exercises']}
dups = [json.loads(l) for l in open(os.path.join(SC, 'dedup2', 'duplicates-log2.jsonl'), encoding='utf-8')]

def norm(s):
    s = unicodedata.normalize('NFKD', s or '').lower()
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'\[part\]|\(part\)', ' ', s)
    s = re.sub(r'[^a-z0-9\u0590-\u05ff]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def codes(coll):
    out = set()
    for m in re.finditer(r'([A-Za-z]+)\s*(\d\d)\s*[-.]\s*(\d\d)', coll or ''):
        out.add(m.group(1).upper() + m.group(2) + '-' + m.group(3))
    for m in re.finditer(r'\b(IBFC?)(\d\d)(\d\d)\b', coll or ''):
        out.add(m.group(1).upper() + m.group(2) + '-' + m.group(3))
    return out

by_id = {m['id']: m for m in music}
bycode = collections.defaultdict(list)
for m in music:
    if m['owner_id'] is None:
        for c in codes(m['collection']): bycode[c].append(m)
dropmap = collections.defaultdict(set)
dropname = collections.defaultdict(set)
for d in dups:
    if d['keeper_id'] in by_id:
        for c in codes(d['dup_code']): dropmap[c].add(d['keeper_id'])
        dropname[norm(d['dup'])].add(d['keeper_id'])

def real(m): return float(m['file_sec']) if m['file_sec'] is not None else (m['duration_sec'] or 0)
def durok(m, sec, tol=0.12):
    if not sec: return True
    r = real(m)
    return abs(r - sec) <= max(6, tol * sec) or (r > sec)   # a cut may be shorter than the file

def tsim(t, a, m):
    nt = norm(t); mt = norm(m['title'] or m['name'])
    s1 = difflib.SequenceMatcher(None, nt, mt).ratio()
    na = set(norm(a).split()); ma = set(norm((m['artist'] or '')).split())
    # keep the catalog's own order "Surname, Name": compare token sets
    s2 = len(na & ma) / max(1, min(len(na), len(ma))) if na and ma else 0.3
    # title contained in the music title
    cont = 1.0 if nt and (nt in mt or mt in nt) else 0
    return max(s1, cont * 0.9), s2

res = []
for etitle, tr in links.items():
    for t in tr:
        code = t['code']; sec = t['duration_sec']
        cand = []; how = None
        # 1. code
        c = list(bycode.get(code, []))
        if code[:3] == 'IBF' and code[3:5] in ('20', '21'): c += bycode.get('IBFC' + code[3:], [])
        if c:
            sc = [(tsim(t['title'], t['artist'], m), m) for m in c]
            good = [(s, m) for s, m in sc if (s[0] >= 0.5 or s[1] >= 0.6) or abs(real(m) - (sec or 0)) <= 4]
            if len(good) > 1:
                ex = [(s, m) for s, m in good if norm(m['title'] or '') == norm(t['title']) or norm(m['name']).startswith(norm(t['title']) + ' ')]
                if len(ex) == 1: good = ex
            if len(good) == 1: cand = [good[0][1]]; how = 'code'
            elif len(good) > 1:
                good.sort(key=lambda x: -(x[0][0] + x[0][1])); cand = [good[0][1]]; how = 'code'
                if (good[0][0][0] + good[0][0][1]) - (good[1][0][0] + good[1][0][1]) < 0.2: how = 'code-ambiguous'
            else:
                how = 'code-rejected'; cand = []
        if not cand and how != 'code-ambiguous':
            # 2. dropped code
            ks = [by_id[k] for k in dropmap.get(code, [])]
            ks = [m for m in ks if durok(m, sec, 0.35)]
            if len(ks) == 1: cand = ks; how = 'dropped-code'
            elif len(ks) > 1: cand = ks; how = 'dropped-ambiguous'
        if not cand:
            # 3. name
            nt = norm(t['title'])
            sc = []
            for m in music:
                if m['owner_id'] is not None: continue
                s = tsim(t['title'], t['artist'], m)
                if s[0] >= 0.8 and s[1] >= 0.5 or (s[0] >= 0.95 and not t['artist']):
                    sc.append((s[0] + s[1], m))
            ks = [k for n, kk in dropname.items() if n == nt for k in kk]
            sc2 = [(1.5, by_id[k]) for k in ks]
            sc = sc + sc2
            sc = [x for x in sc if abs(real(x[1]) - (sec or 0)) <= max(6, 0.08 * (sec or 0))]
            sc.sort(key=lambda x: -x[0])
            uniq = []
            for s, m in sc:
                if m['id'] not in [u['id'] for _, u in uniq]: uniq.append((s, m))
            if uniq:
                if len(uniq) == 1 or uniq[0][0] - uniq[1][0] >= 0.15:
                    cand = [uniq[0][1]]; how = 'name'
                else:
                    cand = [m for _, m in uniq[:3]]; how = 'name-ambiguous'
        res.append(dict(exercise=etitle, code=code, title=t['title'], artist=t['artist'], sec=sec, note=t['note'], how=how or 'none', cand=[m['id'] for m in cand]))

cnt = collections.Counter(r['how'] for r in res)
print(cnt)
json.dump(res, open(os.path.join(OUT, 'match.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
