"""For each exercise of the 2014 side table, the category Brush gives it, written as OUR catalog category key (never Brush's own wording).
   Brush is trusted for the association only; the catalogs stay the authority (nothing here touches the catalog, only biodanza.c14_exercises.category_brush).
   usage: python scripts/biodanza/c14-category.py <mod_groups.json> <c14.json> <categories.json> <out.sql>
   mod_groups.json: rows {m, key, name, group, dgroup} read from Brush, kept in the scratchpad (never in the repo, never in the database)."""
import json, re, sys, collections
sys.stdout.reconfigure(encoding='utf8')
G, C, K, OUT = sys.argv[1:5]


def load(p):
    s = open(p, encoding='utf-8-sig').read()
    return json.loads(s[s.find('['):s.rfind(']') + 1] if s.lstrip()[0] != '{' else s)


def n(s): return re.sub(r'[^a-z0-9]+', '', (s or '').lower())


brush, c14, cats = load(G), load(C), load(K)
keys = {n(c['key']): c['key'] for c in cats}
alias = {'game': 'Games', 'circleshlb': 'Circles', 'sharedsegmentarymovementsinpairs': 'Shared Segmentary Movements',
         'generativepostures': None}
for c in cats:    # "Generative Postures, Code 1" is written "Generative Postures - Code 1" in Brush
    alias[n(c['key'].replace(',', ' -'))] = c['key']


def ours(v):
    x = n(v)
    return keys.get(x) or alias.get(x)


def strip(name): return n(re.sub(r'\s*\(CIMEB[^)]*\)\s*$', '', name or ''))


by = collections.defaultdict(list)   # normalized name -> rows, module 14 first
for r in sorted(brush, key=lambda r: {14: 0, 13: 1, 23: 2}.get(r['m'], 9)):
    by[strip(r['name'])].append(r)

res, how = {}, collections.Counter()
for e in c14:
    rows = by.get(n(e['title_en']))
    if not rows:
        how['no such exercise in Brush'] += 1; continue
    cat = None
    for r in rows:
        cat = ours(r['group']) or ours(r['dgroup'])
        if cat: break
    if cat: res[e['id']] = cat; how['category ' + ('from the Group' if ours(rows[0]['group']) else 'from the Dance Group')] += 1
    else: how['in Brush, no category of ours (a source or module name)'] += 1
print(dict(how), '| written:', len(res), 'of', len(c14))
cnt = collections.Counter(res.values())
print(cnt.most_common())
q = lambda s: "'" + s.replace("'", "''") + "'"
sql = "begin;\nalter table biodanza.c14_exercises add column if not exists category_brush text;\nupdate biodanza.c14_exercises set category_brush = null;\n"
sql += "update biodanza.c14_exercises c set category_brush = x.k from (values " + ",".join("('%s'::uuid,%s)" % (i, q(k)) for i, k in res.items()) + ") x(id, k) where x.id = c.id;\ncommit;\n"
open(OUT, 'w', encoding='utf8', newline='\n').write(sql)
