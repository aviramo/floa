# Assemble the final IBF 2012 catalog dataset (en + he) from the parsed streams. Uncommitted helper.
import json, re, os, sys, importlib.util
OUT = r'C:\Users\ofira\AppData\Local\Temp\claude\31757639e4a3fe8c\37442aa8-1ebb-48a1-afe8-2e8fc52f7e9a\scratchpad\ibf2012'
sys.path.insert(0, OUT)
from hefix import build_freq, dictjoin, join_lone

en = json.load(open(os.path.join(OUT, 'parsed_en.json'), encoding='utf-8'))
he = json.load(open(os.path.join(OUT, 'parsed_he.json'), encoding='utf-8'))
M = {int(k): v for k, v in json.load(open(os.path.join(OUT, 'align.json'))).items()}
toc = json.load(open(os.path.join(OUT, 'toc_en.json'), encoding='utf-8'))
titles_raw = json.load(open(os.path.join(OUT, 'titles_raw.json'), encoding='utf-8'))

# manual data (titles, categories, translations) lives in a separate python file
spec = importlib.util.spec_from_file_location('manual', os.path.join(OUT, 'manual.py'))
manual = importlib.util.module_from_spec(spec); spec.loader.exec_module(manual)

def clean(n): return re.sub(r'^[\uf0d8\s]+', '', n).strip()

SMALL = {'of', 'in', 'to', 'the', 'and', 'with', 'for', 'a', 'on', 'or', 'from', 'by', 'at'}
def title_case(s):
    # the catalog's own style: every word capitalised ("Circle Of Initiation")
    def tc(w):
        if not w: return w
        if w.isupper() and len(w) > 1 and not re.search(r'[a-z]', w):
            lead = re.match(r'^[^A-Za-z\u00c0-\u00ff]*', w).group(0)
            body = w[len(lead):]
            return lead + body[:1].upper() + body[1:].lower()
        return w
    return ' '.join(tc(w) for w in s.split(' '))
def cap_first(s):
    return s[:1].upper() + s[1:] if s else s
def title_en_of(name):
    # name is the uppercase TOC heading; parentheticals keep their own case, first letter capitalised
    m = re.match(r'^(.*?)(\s*\((.*)\))?\s*$', name)
    main, par = m.group(1), m.group(3)
    t = title_case(main)
    if par:
        t += ' (' + title_case(par) + ')'
        t = t.replace('(', '(')
    return t.replace('Cana ', 'Caña ')

# ---------- Hebrew vocabulary for the word-repair pass ----------
he_ex = he['exercises']
texts = [p for x in he_ex for _, ps in x['sections'] for p in ps] + [v for x in he_ex for v in x['notes'].values()]
freq = build_freq(texts)
def repair(t):
    for _ in range(3):
        n = dictjoin(t, freq)
        if n == t: break
        t = n
    return join_lone(t)

HE_LABEL = {'Description': 'תיאור', 'Objective': 'מטרה', 'Emphasis': 'דגש', 'Observation': 'תצפית', 'Definition': 'הגדרה',
            'Poetic element': 'אלמנט פואטי', 'Existential Projection': 'השלכה קיומית', 'Stages of the Dance': 'שלבי הריקוד',
            'CIMEB Note': 'הערה מה-CIMEB', 'Note': 'הערה', 'Notice': 'לתשומת לב', 'Feedback': 'משוב'}
POETIC = {'Poetic element', 'Existential Projection'}

def split_fields(sections, lang, notes_block=''):
    poetics, guidance = [], []
    labs = [l for l, _ in sections]
    has_other = any(l in ('Description', 'Objective', 'Stages of the Dance', 'Existential Projection', 'Poetic element', 'Definition') for l in labs)
    for lab, paras in sections:
        if lab == '':
            tgt = poetics if has_other else guidance
            block = '\n\n'.join(paras)
        elif lab == '(after music)':
            tgt = guidance; block = '\n\n'.join(paras)
        else:
            tgt = poetics if lab in POETIC else guidance
            name = lab if lang == 'en' else HE_LABEL.get(lab, lab)
            block = name + ':\n' + '\n\n'.join(paras)
        tgt.append(block)
    if notes_block:
        guidance.append(notes_block)
    return '\n\n'.join(poetics).strip(), '\n\n'.join(guidance).strip()

EMDASH = re.compile('[\u2014\u2013]')
def nodash(t):
    # no em/en dash in text that reaches the page: a comma reads best in both languages
    t = re.sub(r'\s*[\u2014\u2013]\s*', ', ', t)
    return t

result = []
ex_names = [clean(t['name']) for t in toc if t['kind'] == 'ex']
body_names = [x['name'] for x in en['exercises']]
assert [re.sub(r'\W', '', a.lower()) for a in ex_names[:0]] == []
# category assignment in document order
cat_of = {}
cur_cat = None; cur_sub = None
cats = []
for t in toc:
    if t['kind'] == 'cat':
        cur_cat = clean(t['name']); cur_sub = None
    elif t['kind'] == 'sub':
        cur_sub = clean(t['name'])
    else:
        leaf = cur_sub if (cur_sub and cur_cat == 'GENERATIVE POSTURES') else cur_cat
        cat_of[clean(t['name'])] = leaf

body_order = {}
for i, x in enumerate(en['exercises']):
    body_order[i] = x['name']

for i, x in enumerate(en['exercises']):
    nm = x['name']
    # the body heading text equals the TOC name up to spacing; match by normalised string
    key = next(n for n in ex_names if re.sub(r'\W', '', n.lower()) == re.sub(r'\W', '', nm.lower()))
    tkey = manual.TITLE_HE.get(key)
    if tkey is None:
        raw = titles_raw.get(key, [None])[0]
        hp = re.sub(r'[A-Za-z][A-Za-z0-9\s,\'"()\-\u2013:./&\u00f1]*', '', raw or '').replace('\u202b', '')
        hp = re.sub(r'\s+', ' ', hp).strip(' -\u2013')
        hp = re.sub(r'([\u05d0-\u05ea])(\d)$', r'\1 \2', hp)
        tkey = repair(hp)
    title_he = nodash(tkey)
    title_en = nodash(title_en_of(key)).replace(', ', ': ', 1) if ' – ' in title_en_of(key) else title_en_of(key)
    cat = cat_of[key]
    # texts
    en_secs = [(l, ps) for l, ps in x['sections']]
    en_notes = [t for t in x['tracks'] if t['note']]
    en_nb = ''
    if en_notes:
        en_nb = 'Music notes:\n' + '\n\n'.join('%s: %s' % (t['title'], t['note']) for t in en_notes)
    en_p, en_g = split_fields(en_secs, 'en', en_nb)
    he_info = {'source': 'catalog'}
    j = M.get(i)
    he_secs = []; he_nb = ''
    ovr = manual.HE_SECTIONS.get(key)
    translated = []
    if j is not None:
        y = he_ex[j]
        he_secs = [(l, [repair(p) for p in ps]) for l, ps in y['sections']]
        hn = y['notes']
        items = []
        for t in en_notes:
            if (key, t['code']) in manual.HE_NOTES:
                items.append('%s: %s' % (t['title'], manual.HE_NOTES[(key, t['code'])]))
            elif t['code'] in hn:
                hv = repair(hn[t['code']])
                m0 = re.match(r'^([.,:;!?]+)\s*(.*)$', hv)
                if m0: hv = m0.group(2) + m0.group(1)
                if hv.count('(') > hv.count(')'): hv += ')'
                items.append('%s: %s' % (t['title'], hv))
        # he-only notes (code not in en notes) are kept too
        for c, v in hn.items():
            if c not in {t['code'] for t in en_notes}:
                tt = next((t['title'] for t in x['tracks'] if t['code'] == c), c)
                items.append('%s: %s' % (tt, repair(v)))
        if items:
            he_nb = 'הערות על המוזיקה:\n' + '\n\n'.join(items)
    if j is not None and any(l == 'Description' for l, _ in en_secs) and not any(l == 'Description' for l, _ in he_secs) and he_secs and he_secs[0][0] == '':
        he_secs = [('Description', he_secs[0][1])] + he_secs[1:]
    if ovr:
        mode = ovr.get('mode')
        if mode == 'replace':
            translated.append('all')
            he_secs = [(l, ps) for l, ps in ovr['sections']]
            he_info['source'] = 'translation'
            if 'notes' in ovr: he_nb = 'הערות על המוזיקה:\n' + '\n\n'.join(ovr['notes'])
        elif mode == 'append':
            he_secs = he_secs + [(l, ps) for l, ps in ovr['sections']]
            translated.extend(l for l, _ in ovr['sections'])
        elif mode == 'patch':
            he_secs = ovr['fn'](he_secs)
            translated.append('(patched)')
    if j is None and not ovr:
        he_info['source'] = 'MISSING'
    he_p, he_g = split_fields(he_secs, 'he', he_nb)
    he_p, he_g = nodash(he_p), nodash(he_g)
    en_p, en_g = nodash(en_p), nodash(en_g)
    # raw sources
    raw_en = {}
    for lab, ps in en_secs:
        raw_en[lab or 'Introduction'] = ('\n\n'.join(ps) if lab not in raw_en else raw_en[lab] + '\n\n' + '\n\n'.join(ps))
    if en_notes:
        raw_en['Music notes'] = '\n\n'.join('%s: %s' % (t['title'], t['note']) for t in en_notes)
    raw_he = {}
    for lab, ps in he_secs:
        nm2 = HE_LABEL.get(lab, lab) if lab else 'מבוא'
        raw_he[nm2] = ('\n\n'.join(ps) if nm2 not in raw_he else raw_he[nm2] + '\n\n' + '\n\n'.join(ps))
    if he_nb:
        raw_he['הערות על המוזיקה'] = he_nb.split(':\n', 1)[1]
    result.append(dict(idx=i, key=key, title_en=title_en, title_he=title_he, category=cat,
                       en=dict(poetics=en_p, guidance=en_g), he=dict(poetics=he_p, guidance=he_g, source=he_info['source']),
                       raw_en=raw_en, raw_he=raw_he, translated=translated, notes_missing=[], tracks=x['tracks'], page=x['page']))

# categories
CATS = []
order = 0
for t in toc:
    if t['kind'] == 'cat':
        nm = clean(t['name'])
        if nm == 'GENERATIVE POSTURES': continue
        order += 1; CATS.append((nm, order))
    elif t['kind'] == 'sub':
        order += 1; CATS.append((clean(t['name']), order))
catrows = []
for nm, o in CATS:
    meta = manual.CATEGORIES[nm]
    catrows.append(dict(key=meta[0], name_orig=meta[1], name_he=meta[2], sort=o, toc=nm))
catkey = {c['toc']: c['key'] for c in catrows}
for r in result:
    r['category'] = catkey[r['category']]
json.dump(dict(exercises=result, categories=catrows, chapters_en=en['chapters'], chapters_he=he['chapters']),
          open(os.path.join(OUT, 'final.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('exercises', len(result), 'categories', len(catrows))
from collections import Counter
print(Counter(r['he']['source'] for r in result))
print('EMPTY en poetics', sum(1 for r in result if not r['en']['poetics']), 'EMPTY en guidance', sum(1 for r in result if not r['en']['guidance']))
print('EMPTY he poetics', sum(1 for r in result if not r['he']['poetics']), 'EMPTY he guidance', sum(1 for r in result if not r['he']['guidance']))
